import type {
  ApprovalEngine,
  ApprovalExecutionRequest,
  AuditSink,
  ModelGateway,
  ModelResult,
  Orchestrator,
  PolicyEngine,
  RuntimeInput,
  TelemetryEvent,
  TelemetrySink,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  DEADLINE,
  PROCEED,
  stop,
  type BudgetService,
  type EffectLedger,
  type EffectRef,
  type KernelLog,
  type KernelLogEvent,
  type KernelPlugin,
  type KernelStop,
  type PauseSwitch,
  type ToolCallState,
  type ToolOutcome,
  type TurnBudget
} from './types.ts'

/**
 * Standard plugins of the kernel profile. Each control wraps an existing
 * governance piece without changing its behavior (SPEC 0181 §7 step 2); the
 * messages and stop reasons match `SinglePassGovernedRuntime`.
 */

const AUDIT_GRACE_MS = 200

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function bindCapabilityFingerprint(
  payload: unknown,
  capabilityFingerprint: string | undefined
): unknown {
  return capabilityFingerprint
    ? { capabilityFingerprint, input: payload }
    : payload
}

// ---------------------------------------------------------------- budget

class DurationBudget implements TurnBudget {
  public constructor(
    private readonly input: RuntimeInput,
    private readonly startedAt: number
  ) {}

  public remainingMs(): number {
    return this.input.budget.maxDurationMs - (Date.now() - this.startedAt)
  }

  public async withDeadline<T>(
    operation: () => Promise<T>,
    ms: number = this.remainingMs()
  ): Promise<T | typeof DEADLINE> {
    if (ms <= 0) return DEADLINE
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof DEADLINE>((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE), ms)
    })
    try {
      return await Promise.race([operation(), deadline])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  public afterModel(result: ModelResult): KernelStop | undefined {
    const usage = {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd
    }
    if (
      result.inputTokens + result.outputTokens >
      this.input.budget.maxTokens
    ) {
      return stop(
        'MAX_TOKENS',
        'Token budget exhausted before a response could be completed.',
        { modelCalls: 1, usage }
      )
    }
    if (result.costUsd > this.input.budget.maxCostUsd) {
      return stop(
        'MAX_COST',
        'Cost budget exhausted before a response could be completed.',
        { modelCalls: 1, usage }
      )
    }
    if (Date.now() - this.startedAt > this.input.budget.maxDurationMs) {
      return stop(
        'MAX_DURATION',
        'Duration budget exhausted before a response could be completed.',
        { modelCalls: 1, usage }
      )
    }
    return undefined
  }
}

/** Budget is computed in one place (I11). */
export function budgetControl(): KernelPlugin {
  return {
    name: 'control.budget',
    kind: 'control',
    provides: ['budget'],
    apply(ctx) {
      const service: BudgetService = {
        begin: (input, startedAt) => new DurationBudget(input, startedAt)
      }
      ctx.provide('budget', service)
      ctx.on('model/before-call', async (call, next) => {
        if (call.turn.input.budget.maxModelCalls < 1) {
          return stop(
            'MAX_MODEL_CALLS',
            'Model-call budget exhausted before a response was generated.'
          )
        }
        if (call.turn.budget.remainingMs() <= 0) {
          return stop(
            'MAX_DURATION',
            'Duration budget exhausted before model execution.'
          )
        }
        return next()
      })
      ctx.on('tool/pre-execute', async (call, next) => {
        if (call.turn.budget.remainingMs() <= 0) {
          return stop(
            'MAX_DURATION',
            'Duration budget exhausted before policy evaluation.'
          )
        }
        return next()
      })
    }
  }
}

// ----------------------------------------------------------------- pause

export class InMemoryPauseSwitch implements PauseSwitch {
  readonly #paused = new Set<string>()

  public pause(tenantId: string): void {
    this.#paused.add(tenantId)
  }

  public resume(tenantId: string): void {
    this.#paused.delete(tenantId)
  }

  public isPaused(tenantId: string): boolean {
    return this.#paused.has(tenantId)
  }
}

export const PAUSED_RESPONSE = 'The agent is paused by an operator.'

/** Pause stops new steps and is re-checked before every effect (I12). */
export function pauseControl(
  pause: PauseSwitch = new InMemoryPauseSwitch()
): KernelPlugin {
  return {
    name: 'control.pause',
    kind: 'control',
    provides: ['pause'],
    apply(ctx) {
      ctx.provide('pause', pause)
      ctx.on('turn/before-step', async (turn, next) =>
        (await pause.isPaused(turn.input.tenantId))
          ? stop('HUMAN_TAKEOVER', PAUSED_RESPONSE, {
              cause: 'operator_paused'
            })
          : next()
      )
      // Guards run again after the loop's checkpoint and after the approval
      // reservation, so a pause acknowledged in those windows still blocks the
      // body (AUD-0597 F01).
      ctx.guard(async (call) =>
        (await pause.isPaused(call.turn.input.tenantId))
          ? {
              reason: PAUSED_RESPONSE,
              stopReason: 'HUMAN_TAKEOVER',
              cause: 'operator_paused'
            }
          : undefined
      )
    }
  }
}

// ------------------------------------------------------------------- log

export class InMemoryKernelLog implements KernelLog {
  public readonly events: KernelLogEvent[] = []
  readonly #limit: number

  public constructor(limit = 10_000) {
    this.#limit = limit
  }

  public append(event: KernelLogEvent): void {
    this.events.push(event)
    if (this.events.length > this.#limit) this.events.shift()
  }
}

/** Append-only log of calls and model requests (I5, I6). */
export function logControl(
  log: KernelLog = new InMemoryKernelLog()
): KernelPlugin {
  return {
    name: 'control.log',
    kind: 'control',
    provides: ['log'],
    apply(ctx) {
      ctx.provide('log', log)
    }
  }
}

// --------------------------------------------------------------- effects

export class InMemoryEffectLedger implements EffectLedger {
  public readonly entries: {
    readonly ref: EffectRef
    readonly phase: 'started' | ToolOutcome['kind']
  }[] = []
  readonly #limit: number

  public constructor(limit = 10_000) {
    this.#limit = limit
  }

  public started(ref: EffectRef): void {
    this.#push({ ref, phase: 'started' })
  }

  public finished(ref: EffectRef, outcome: ToolOutcome['kind']): void {
    this.#push({ ref, phase: outcome })
  }

  #push(entry: InMemoryEffectLedger['entries'][number]): void {
    this.entries.push(entry)
    if (this.entries.length > this.#limit) this.entries.shift()
  }
}

/**
 * Records the lifecycle of each dispatched effect. The durable journal of the
 * worker replaces this in-memory ledger when the stacks are unified (KPLG-004).
 */
export function effectsControl(
  ledger: EffectLedger = new InMemoryEffectLedger()
): KernelPlugin {
  return {
    name: 'control.effects',
    kind: 'control',
    provides: ['effects'],
    apply(ctx) {
      ctx.provide('effects', ledger)
    }
  }
}

// ---------------------------------------------------------------- policy

export function policyControl(policy: PolicyEngine): KernelPlugin {
  return {
    name: 'control.policy',
    kind: 'control',
    provides: ['policy'],
    requires: ['budget'],
    apply(ctx) {
      ctx.provide('policy', policy)
      ctx.on('tool/pre-execute', async (call, next) => {
        const { turn, tool, invocation } = call
        let decision
        try {
          const decisionOrDeadline = await turn.budget.withDeadline(() =>
            policy.evaluate({
              tenantId: turn.input.tenantId,
              agentId: turn.input.agent.id,
              action: 'tool.execute',
              tool,
              invocation,
              correlationId: turn.input.correlationId
            })
          )
          if (decisionOrDeadline === DEADLINE) {
            return stop(
              'MAX_DURATION',
              'Duration budget exhausted during policy evaluation.'
            )
          }
          decision = decisionOrDeadline
          turn.metadata.policy = decision.outcome
          call.policyDecision = decision
        } catch (error) {
          return stop(
            'INSUFFICIENT_EVIDENCE',
            `Policy evaluation failed: ${errorMessage(error)}.`,
            { cause: 'policy_failed' }
          )
        }
        switch (decision.outcome) {
          case 'DENY':
            return stop('POLICY_DENIED', decision.reason, {
              cause: 'policy_denied'
            })
          case 'HANDOFF':
            return stop('HUMAN_TAKEOVER', decision.reason, {
              cause: 'policy_handoff'
            })
          case 'REQUIRE_APPROVAL':
            call.needsApproval = true
            break
          case 'ALLOW':
            break
          default:
            return stop(
              'INSUFFICIENT_EVIDENCE',
              'Policy returned an unsupported decision.',
              { cause: 'policy_unsupported' }
            )
        }
        return next()
      })
    }
  }
}

// ------------------------------------------------------------- approvals

export interface ApprovalControlOptions {
  readonly capabilityFingerprint?: string
}

/**
 * Approval: ask → one-shot decision; a missing or failing channel becomes a
 * denial (I4); an approved effect needs the single-use execution port (I9).
 * The reservation is settled in `tool/post-execute` for every outcome.
 */
export function approvalsControl(
  approvals: ApprovalEngine,
  options: ApprovalControlOptions = {}
): KernelPlugin {
  return {
    name: 'control.approvals',
    kind: 'control',
    provides: ['approvals'],
    requires: ['budget', 'policy'],
    apply(ctx) {
      ctx.provide('approvals', approvals)
      ctx.on('tool/pre-execute', async (call, next) => {
        if (!call.needsApproval && !call.tool.requiresApproval) return next()
        const gate = await decide(call)
        return gate ?? next()
      })
      // The reservation happens around dispatch, after every control and the
      // loop's own bookkeeping (iterative checkpoint) ran, and before the body.
      ctx.on('tool/execute', async (call, next) => {
        if (!call.grant) return next()
        const gate = await reserve(call, call.grant)
        return gate ? { kind: 'not_started', gate } : next()
      })
      ctx.on('tool/post-execute', (call, outcome) => settle(call, outcome))
    }
  }

  /** Asks once; a missing, failing or unsupported answer never proceeds (I4). */
  async function decide(call: ToolCallState): Promise<KernelStop | undefined> {
    const { turn, tool, invocation } = call
    const input = turn.input
    const policyVersion = call.policyDecision?.policyVersion ?? 'unknown'
    const executionRef =
      call.executionRef ?? input.executionId ?? input.correlationId
    try {
      if (turn.budget.remainingMs() <= 0) {
        return stop(
          'MAX_DURATION',
          'Duration budget exhausted before approval evaluation.'
        )
      }
      const approvalOrDeadline = await turn.budget.withDeadline(() =>
        approvals.request({
          tenantId: input.tenantId,
          agentId: input.agent.id,
          operationKey: invocation.operationKey,
          toolId: tool.id,
          summary: tool.description,
          correlationId: input.correlationId,
          executionRef,
          operatorId: input.agent.id,
          agentVersion: input.agent.version,
          action: 'tool.execute',
          resource: { type: 'tool', id: tool.id },
          payload: bindCapabilityFingerprint(
            invocation.input,
            options.capabilityFingerprint
          ),
          policyVersion
        })
      )
      if (approvalOrDeadline === DEADLINE) {
        return stop(
          'MAX_DURATION',
          'Duration budget exhausted during approval evaluation.'
        )
      }
      const approval = approvalOrDeadline
      const approvalId = approval.approvalId
        ? { approvalId: approval.approvalId }
        : {}
      if (approval.status === 'PENDING') {
        return stop('APPROVAL_REQUIRED', approval.reason, {
          ...approvalId,
          cause: 'approval_pending'
        })
      }
      if (approval.status === 'DENIED') {
        return stop('POLICY_DENIED', approval.reason, {
          ...approvalId,
          cause: 'approval_denied'
        })
      }
      if (approval.status !== 'APPROVED') {
        return stop(
          'INSUFFICIENT_EVIDENCE',
          'Approval returned an unsupported decision.',
          { cause: 'approval_failed' }
        )
      }
      if (!approval.approvalId) {
        return stop(
          'INSUFFICIENT_EVIDENCE',
          'Approved execution has no approval identifier.',
          { cause: 'approval_failed' }
        )
      }
      turn.metadata.approval = approval.approvalId
      call.grant = {
        tenantId: input.tenantId,
        approvalId: approval.approvalId,
        agentId: input.agent.id,
        agentVersion: input.agent.version,
        action: 'tool.execute',
        resource: { type: 'tool', id: tool.id },
        payload: bindCapabilityFingerprint(
          invocation.input,
          options.capabilityFingerprint
        ),
        policyVersion,
        operationKey: invocation.operationKey,
        executionRef
      }
    } catch (error) {
      return stop(
        'INSUFFICIENT_EVIDENCE',
        `Approval evaluation failed: ${errorMessage(error)}.`,
        { cause: 'approval_failed' }
      )
    }
    if (!approvals.execution) {
      // Without the execution port an approval cannot be consumed once (I9).
      return stop(
        'INSUFFICIENT_EVIDENCE',
        'Approved execution requires a single-use approval execution port.',
        { approvalId: call.grant.approvalId, cause: 'approval_unbound' }
      )
    }
    return undefined
  }

  /** Consumes the single-use reservation right before the body runs. */
  async function reserve(
    call: ToolCallState,
    request: ApprovalExecutionRequest
  ): Promise<KernelStop | undefined> {
    const { turn } = call
    const port = approvals.execution
    if (!port) {
      return stop(
        'INSUFFICIENT_EVIDENCE',
        'Approved execution requires a single-use approval execution port.',
        { approvalId: request.approvalId, cause: 'approval_unbound' }
      )
    }
    if (turn.budget.remainingMs() <= 0) {
      return stop(
        'MAX_DURATION',
        'Duration budget exhausted before approval execution.',
        { approvalId: request.approvalId }
      )
    }
    try {
      const handleOrDeadline = await turn.budget.withDeadline(() =>
        port.begin(request)
      )
      if (handleOrDeadline === DEADLINE) {
        return stop(
          'INSUFFICIENT_EVIDENCE',
          'Approval execution reservation timed out.',
          { approvalId: request.approvalId, cause: 'approval_failed' }
        )
      }
      call.approval = { request, handle: handleOrDeadline }
      return undefined
    } catch (error) {
      return stop(
        'INSUFFICIENT_EVIDENCE',
        `Approval could not be consumed safely: ${errorMessage(error)}.`,
        { approvalId: request.approvalId, cause: 'approval_failed' }
      )
    }
  }

  async function settle(
    call: ToolCallState,
    outcome: ToolOutcome
  ): Promise<ToolOutcome> {
    const reservation = call.approval
    const port = approvals.execution
    if (!reservation || !port) return outcome
    const { request, handle } = reservation
    const base = {
      request,
      reservationId: handle.reservationId
    }
    const ref = (suffix: string) => `${request.executionRef}:${suffix}`
    switch (outcome.kind) {
      case 'not_started':
        await port
          .fail({ ...base, evidenceRef: ref('tool_not_started') })
          .catch(() => undefined)
        return outcome
      case 'deadline':
        await port
          .uncertain({
            ...base,
            reason:
              'Tool execution exceeded its deadline after approval execution started.',
            evidenceRef: ref('tool_deadline')
          })
          .catch(() => undefined)
        return outcome
      case 'cancelled':
        await port
          .uncertain({
            ...base,
            reason:
              'Tool execution was cancelled after approval execution started.',
            evidenceRef: ref('tool_cancelled')
          })
          .catch(() => undefined)
        return outcome
      case 'threw':
        await port
          .uncertain({
            ...base,
            reason: `Tool executor threw after approval execution started: ${outcome.error}`,
            evidenceRef: ref('tool_uncertain')
          })
          .catch(() => undefined)
        return outcome
      case 'failed':
        await port
          .fail({ ...base, evidenceRef: ref('tool_failed') })
          .catch(() => undefined)
        return outcome
      case 'succeeded':
        try {
          await port.complete({ ...base, evidenceRef: ref('tool_confirmed') })
          return outcome
        } catch (error) {
          return {
            kind: 'confirm_failed',
            result: outcome.result,
            error: errorMessage(error),
            durationMs: outcome.durationMs
          }
        }
      case 'confirm_failed':
        return outcome
    }
  }
}

// ----------------------------------------------------------------- audit

export interface AuditControlOptions {
  /** Audit action name; the single-pass facade keeps `harness.single_pass`. */
  readonly action?: string
}

/**
 * Audit is fail-closed (I10): a failed or late record turns the result into
 * `INSUFFICIENT_EVIDENCE`, and it keeps a minimum window after the budget ran
 * out so an effect is never left unrecorded.
 */
export function auditControl(
  audit: AuditSink,
  options: AuditControlOptions = {}
): KernelPlugin {
  const action = options.action ?? 'harness.kernel'
  return {
    name: 'control.audit',
    kind: 'control',
    provides: ['audit'],
    requires: ['budget'],
    apply(ctx) {
      ctx.provide('audit', audit)
      ctx.on('turn/end', async (turn, result) => {
        try {
          const window = Math.max(turn.budget.remainingMs(), AUDIT_GRACE_MS)
          const recorded = await turn.budget.withDeadline(
            () =>
              audit.append({
                actor: turn.input.agent.id,
                agent: turn.input.agent.id,
                tenant: turn.input.tenantId,
                action,
                policy: turn.metadata.policy,
                approval: turn.metadata.approval,
                tool: turn.metadata.tool,
                result: result.stopReason,
                timestamp: new Date().toISOString(),
                traceId: turn.input.traceId,
                correlationId: turn.input.correlationId
              }),
            window
          )
          if (recorded === DEADLINE) throw new Error('audit deadline exceeded')
          return result
        } catch {
          return {
            ...result,
            response:
              'Execution could not be completed because audit recording failed.',
            stopReason: 'INSUFFICIENT_EVIDENCE'
          }
        }
      })
    }
  }
}

// ---------------------------------------------------------- capabilities

export function plannerCapability(planner: Orchestrator): KernelPlugin {
  return {
    name: 'capability.planner',
    kind: 'capability',
    provides: ['planner'],
    apply: (ctx) => void ctx.provide('planner', planner)
  }
}

export function modelCapability(model: ModelGateway): KernelPlugin {
  return {
    name: 'capability.model',
    kind: 'capability',
    provides: ['model'],
    apply: (ctx) => void ctx.provide('model', model)
  }
}

export function toolsCapability(tools: ToolRegistry): KernelPlugin {
  return {
    name: 'capability.tools',
    kind: 'capability',
    provides: ['tools'],
    apply: (ctx) => void ctx.provide('tools', tools)
  }
}

export interface TelemetryCapabilityOptions {
  readonly name?: string
}

/** Observability never turns a governed result into an error. */
export function telemetryCapability(
  telemetry: TelemetrySink,
  options: TelemetryCapabilityOptions = {}
): KernelPlugin {
  const name = options.name ?? 'harness.kernel'
  return {
    name: 'capability.telemetry',
    kind: 'capability',
    provides: ['telemetry'],
    apply(ctx) {
      ctx.provide('telemetry', telemetry)
      ctx.on('turn/end', async (turn, result) => {
        const event: TelemetryEvent = {
          name,
          latencyMs: Date.now() - turn.startedAt,
          errors: result.stopReason === 'COMPLETED' ? 0 : 1,
          costUsd: result.usage.costUsd,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          provider: turn.metadata.provider,
          toolDurationMs: turn.metadata.toolDurationMs,
          steps: result.steps,
          traceId: turn.input.traceId,
          correlationId: turn.input.correlationId
        }
        try {
          telemetry.record(event)
        } catch {
          // Observability must not turn a governed result into an error.
        }
        return result
      })
    }
  }
}

export { PROCEED }
