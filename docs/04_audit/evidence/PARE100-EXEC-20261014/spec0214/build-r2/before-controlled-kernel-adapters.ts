import { createCorrelationId, sanitizeAuditEvidencePayload } from '@cvg/shared'
import type {
  ApprovalEngine,
  ApprovalExecutionRequest,
  ApprovalRequest,
  ApprovalId,
  PolicyEngine,
  StopReason,
  ToolExecutionContext,
  CapabilityRegistration
} from '@cvg/harness-contracts'
import type { OperationalHarnessOptions } from '@cvg/harness'
import type { CapabilityApproval, PluginAuditEvent } from './plugin-gateway.ts'
import type { ControlledAttempt } from './controlled-execution-plan.ts'
import {
  reviewedDescriptor,
  matchesPreparedInput,
  matchesPreparedOutput,
  executeAuthorizedPreparedCommand,
  type GatewayCore
} from './plugin-execution-core.ts'
import { createCapabilityInputHash } from './approval-authority.ts'
import { cloneBoundedValue, isPlainRecord } from './tool-invocation-boundary.ts'

export interface ControlledKernelCompositionPorts {
  effectJournal: NonNullable<OperationalHarnessOptions['effectJournal']>
  stepStore: NonNullable<OperationalHarnessOptions['stepStore']>
  audit: OperationalHarnessOptions['audit']
  telemetry: OperationalHarnessOptions['telemetry']
  log: NonNullable<OperationalHarnessOptions['log']>
  effects: NonNullable<OperationalHarnessOptions['effects']>
  pause: NonNullable<OperationalHarnessOptions['pause']>
}
export class InvocationEvidenceState {
  fault: {
    phase: string
    code: 'evidence_unavailable'
    bodyStarted: boolean
  } | null = null
  readonly controller = new AbortController()
  expiresAt = Infinity
  closed = false
  paused = false
  pauseInvalid = false
  outputAllowsTools = false
  finalizing = false
  constructor(
    readonly attempts: ControlledAttempt[],
    readonly pause: ControlledKernelCompositionPorts['pause'],
    readonly tenantId: string
  ) {}
  fail(phase: string): void {
    this.fault ??= {
      phase,
      code: 'evidence_unavailable',
      bodyStarted: this.attempts.some((a) => a.phase === 'ENTERED')
    }
    this.controller.abort()
  }
  check(): void {
    if (this.fault || this.closed) throw new Error('controlled_evidence_closed')
  }
  async io<T>(
    phase: string,
    operation: () => T | PromiseLike<T>,
    terminal = false
  ): Promise<T> {
    this.check()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const duration =
        terminal || this.finalizing
          ? Math.max(this.expiresAt - Date.now(), 200)
          : this.expiresAt - Date.now()
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error('controlled_evidence_deadline')
      const result = await Promise.race([
        Promise.resolve().then(operation),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('controlled_evidence_deadline')),
            duration
          )
        })
      ])
      this.check()
      return result
    } catch {
      this.fail(phase)
      throw new Error('controlled_evidence_unavailable')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  readPause(): void {
    try {
      const value = this.pause.isPaused(this.tenantId)
      if (typeof value !== 'boolean') {
        this.pauseInvalid = true
        // Observe a rejected async delegate, but never treat it as unpaused.
        Promise.resolve(value).catch(() => undefined)
      } else if (value) this.paused = true
    } catch {
      this.pauseInvalid = true
    }
  }
  veto(signal?: AbortSignal): StopReason | null {
    if (this.fault) return 'INSUFFICIENT_EVIDENCE'
    this.readPause()
    if (this.fault) return 'INSUFFICIENT_EVIDENCE'
    if (signal?.aborted || this.controller.signal.aborted) return 'CANCELLED'
    if (Date.now() >= this.expiresAt) return 'MAX_DURATION'
    if (!signal || this.pauseInvalid) return 'INTERNAL_FAILURE'
    return this.paused ? 'HUMAN_TAKEOVER' : null
  }
  admit(
    attempt: ControlledAttempt,
    context: ToolExecutionContext,
    fingerprint: string
  ): boolean {
    if (
      attempt.closed ||
      this.closed ||
      this.finalizing ||
      attempt.phase !== 'PENDING'
    )
      return false
    const e = attempt.command.execution
    if (
      !this.outputAllowsTools ||
      !reviewedDescriptor(attempt.command.resolved) ||
      !attempt.policyAllowed ||
      (attempt.approvalRequired && !attempt.approvalConsumed) ||
      !fingerprint ||
      context.operationKey !== attempt.operationKey ||
      context.tenantId !== e.tenantId ||
      context.agentId !== e.agentId ||
      context.traceId !== e.traceId
    ) {
      attempt.cause = 'UNSAFE_REQUEST'
      return false
    }
    const veto = this.veto(context.signal)
    if (veto) {
      attempt.cause = veto
      return false
    }
    attempt.phase = 'ENTERED'
    return true
  }
  /** Synchronous, before projection or final awaits. A late ACK cannot reopen entry. */
  close(): void {
    for (const attempt of this.attempts) {
      if (attempt.closed) continue
      if (attempt.phase === 'PENDING') {
        attempt.cause ??=
          this.veto(this.controller.signal) ?? 'TERMINAL_BEFORE_ENTRY'
        attempt.phase = 'CLOSED_WITHOUT_ENTRY'
      }
      attempt.closed = true
    }
    this.closed = true
  }
}

export function guardedPorts(
  ports: ControlledKernelCompositionPorts,
  state: InvocationEvidenceState,
  onAudit?: (event: PluginAuditEvent) => void | Promise<void>
): ControlledKernelCompositionPorts {
  const journal = ports.effectJournal
  const steps = ports.stepStore
  const audited = new Set<string>()
  return {
    telemetry: ports.telemetry,
    pause: {
      isPaused: () => {
        state.readPause()
        if (state.pauseInvalid) throw new Error('pause_unavailable')
        return state.paused
      }
    },
    audit: {
      append: (event) =>
        state.io(
          `audit.${event.action}`,
          () => ports.audit.append(event),
          ['runtime.completed', 'runtime.stopped', 'runtime.paused'].includes(
            event.action
          )
        )
    },
    log: {
      append: async (event) => {
        await state.io(
          `log.${event.type}`,
          () => ports.log.append(event),
          event.type === 'turn/end'
        )
        if (event.type === 'tool/call') {
          const a = state.attempts.find(
            (a) => a.command.execution.toolName === event.toolId
          )
          if (a) {
            a.attempted = true
            a.operationKey = event.operationKey
          }
        }
        if (event.type !== 'tool/result') return
        const a = state.attempts.find(
          (a) => a.command.execution.toolName === event.toolId
        )
        if (!a || !a.operationKey) throw new Error('controlled_attempt_missing')
        a.logAcknowledged = true
        if (audited.has(a.operationKey)) return
        audited.add(a.operationKey)
        const e = a.command.execution
        const status =
          event.outcome === 'succeeded' &&
          a.command.output?.status === 'succeeded'
            ? 'succeeded'
            : a.phase === 'PENDING' ||
                a.denied ||
                a.command.output?.status === 'blocked'
              ? 'blocked'
              : 'failed'
        if (onAudit)
          await state.io(
            'callback.tool',
            () =>
              onAudit({
                type: 'tool_call',
                correlationId: a.command.correlationId,
                traceId: e.traceId!,
                tenantId: e.tenantId,
                agentId: e.agentId,
                versionId: e.versionId,
                plugin: a.command.resolved.plugin.manifest.name,
                toolName: e.toolName,
                status,
                payload: sanitizeAuditEvidencePayload({
                  toolName: e.toolName,
                  input: e.input,
                  result: a.command.output?.data
                }).payload
              }),
            true
          )
        a.callbackAcknowledged = true
        a.resultAcknowledged =
          event.outcome === 'succeeded' && status === 'succeeded'
      }
    },
    effects: {
      started: (ref) =>
        state.io('effects.started', () => ports.effects.started(ref)),
      finished: (ref, outcome) =>
        state.io(
          'effects.finished',
          () => ports.effects.finished(ref, outcome),
          true
        )
    },
    effectJournal: {
      reserve: (input) =>
        state.io('journal.reserve', async () => {
          const record = await journal.reserve(input)
          if (
            record.tenantId !== input.tenantId ||
            record.operationKey !== input.operationKey ||
            record.proposalHash !== input.proposalHash
          )
            throw new Error('journal_binding_invalid')
          if (record.state === 'CONFIRMED') {
            const a = state.attempts.find(
              (a) => a.operationKey === input.operationKey
            )
            if (!a || a.closed || a.command.output)
              throw new Error('journal_receipt_invalid')
            a.command.output = {
              status: 'succeeded',
              ...(record.result !== undefined
                ? { data: cloneBoundedValue(record.result) }
                : {})
            }
          }
          return record
        }),
      markStarted: (input) =>
        state.io('journal.markStarted', () => journal.markStarted(input)),
      confirm: (input) =>
        state.io('journal.confirm', () => journal.confirm(input), true),
      fail: (input) =>
        state.io('journal.fail', () => journal.fail(input), true),
      markUncertain: (input) =>
        state.io(
          'journal.markUncertain',
          () => journal.markUncertain(input),
          true
        ),
      get: (tenant, key) =>
        state.io('journal.get', () => journal.get(tenant, key))
    },
    stepStore: {
      recordStep: (step) => {
        if (step.status === 'FAILED' || step.stopReason !== undefined)
          state.finalizing = true
        return state.io('step.recordStep', () => steps.recordStep(step))
      },
      saveCheckpoint: (checkpoint) => {
        if (checkpoint.state.stopReason !== undefined) state.finalizing = true
        return state.io('step.saveCheckpoint', () =>
          steps.saveCheckpoint(checkpoint)
        )
      },
      listSteps: (tenant, id) => {
        if (state.controller.signal.aborted || Date.now() >= state.expiresAt)
          state.finalizing = true
        return state.io('step.listSteps', () => steps.listSteps(tenant, id))
      },
      loadCheckpoint: (tenant, id) =>
        state.io('step.loadCheckpoint', () => steps.loadCheckpoint(tenant, id))
    }
  }
}

export function controlledRegistration(
  attempt: () => ControlledAttempt | undefined,
  descriptor: CapabilityRegistration['descriptor'],
  state: InvocationEvidenceState,
  fingerprint: () => string,
  measure: <T>(operation: () => Promise<T>) => Promise<T>
): CapabilityRegistration {
  return {
    descriptor,
    implementation: {
      validateInput: (input) => {
        const a = attempt()
        return (
          !state.fault &&
          !state.finalizing &&
          state.outputAllowsTools &&
          !!a &&
          !!reviewedDescriptor(a.command.resolved) &&
          matchesPreparedInput(a.command, input)
        )
      },
      execute: async (input, context) => {
        const a = attempt()
        if (
          !a ||
          a.closed ||
          state.closed ||
          !matchesPreparedInput(a.command, input)
        )
          return { status: 'REJECTED', error: 'terminal_admission_closed' }
        const result = await measure(() =>
          executeAuthorizedPreparedCommand(
            a.command,
            () => state.admit(a, context, fingerprint()),
            true
          )
        )
        return {
          status:
            result.status === 'succeeded'
              ? 'SUCCEEDED'
              : result.status === 'blocked'
                ? 'REJECTED'
                : 'FAILED',
          ...(result.data !== undefined ? { output: result.data } : {}),
          ...(result.reason ? { error: result.reason } : {})
        }
      },
      validateOutput: (output) => {
        const a = attempt()
        return !state.fault && !!a && matchesPreparedOutput(a.command, output)
      }
    }
  }
}

export function controlledPolicy(
  state: InvocationEvidenceState,
  core: GatewayCore | undefined
): PolicyEngine {
  return {
    evaluate: async (request) => {
      state.check()
      const a = state.attempts.find(
        (a) => a.command.execution.toolName === request.tool.id
      )
      const deny = (reason: string) => {
        if (a) a.denied = true
        return {
          outcome: 'DENY' as const,
          reason,
          policyVersion:
            a?.command.execution.config.policies.version ?? 'controlled-policy'
        }
      }
      if (
        state.finalizing ||
        !state.outputAllowsTools ||
        !a ||
        !core ||
        !reviewedDescriptor(a.command.resolved) ||
        !matchesPreparedInput(a.command, request.invocation.input)
      )
        return deny('controlled_command_invalid')
      const e = a.command.execution
      if (
        request.tenantId !== e.tenantId ||
        request.agentId !== e.agentId ||
        request.tool.version !== a.command.resolved.plugin.manifest.version ||
        !e.config.plugins.some(
          (p) =>
            p.enabled &&
            p.plugin === a.command.resolved.plugin.manifest.name &&
            p.version === request.tool.version &&
            p.allowedTools.includes(request.tool.id)
        )
      )
        return deny('controlled_binding_invalid')
      const permissions = await state.io('actor.authorize', () =>
        core.authorize(e, a.command.resolved.tool.permission)
      )
      if (!permissions?.includes(a.command.resolved.tool.permission))
        return deny('actor_authorization_denied')
      const policy = e.policy
      if (
        policy.decision !== 'allowed' &&
        policy.decision !== 'requires_approval'
      ) {
        a.denied = true
        return {
          outcome: policy.decision === 'handoff' ? 'HANDOFF' : 'DENY',
          reason: policy.reason,
          policyVersion: e.config.policies.version
        }
      }
      a.operationKey = request.invocation.operationKey
      a.policyAllowed = true
      a.approvalRequired =
        e.requireApproval === true ||
        a.command.resolved.tool.requiresApproval ||
        policy.decision === 'requires_approval'
      return {
        outcome: a.approvalRequired ? 'REQUIRE_APPROVAL' : 'ALLOW',
        reason: policy.reason,
        policyVersion: e.config.policies.version
      }
    }
  }
}

export function controlledApprovals(
  state: InvocationEvidenceState,
  core: GatewayCore | undefined,
  fingerprint: () => string,
  agentVersion: string,
  correlationId: string,
  resolve: (
    attempt: ControlledAttempt
  ) => Promise<CapabilityApproval | undefined>
): ApprovalEngine {
  const grants = new Map<
    string,
    {
      attempt: ControlledAttempt
      approval: CapabilityApproval
      request: ApprovalRequest
      begun: boolean
      reservation?: string
      settled: boolean
    }
  >()
  const validRequest = (
    a: ControlledAttempt,
    r: ApprovalRequest | ApprovalExecutionRequest
  ): boolean => {
    const e = a.command.execution
    return (
      a.policyAllowed &&
      r.tenantId === e.tenantId &&
      r.agentId === e.agentId &&
      r.action === 'tool.execute' &&
      r.resource?.type === 'tool' &&
      r.resource.id === e.toolName &&
      r.policyVersion === e.config.policies.version &&
      r.operationKey === a.operationKey &&
      typeof r.executionRef === 'string' &&
      r.executionRef.length > 0 &&
      r.executionRef.length <= 500 &&
      r.agentVersion === agentVersion &&
      (!('correlationId' in r) || r.correlationId === correlationId) &&
      isPlainRecord(r.payload) &&
      r.payload.capabilityFingerprint === fingerprint() &&
      matchesPreparedInput(a.command, r.payload.input)
    )
  }
  const read = async (
    a: ControlledAttempt,
    approval: CapabilityApproval
  ): Promise<boolean> => {
    const e = a.command.execution
    let now: number
    try {
      now = core?.now().getTime() ?? NaN
    } catch {
      return false
    }
    if (
      !Number.isFinite(now) ||
      !(approval.expiresAt instanceof Date) ||
      !(approval.expiresAt.getTime() > now) ||
      approval.tenantId !== e.tenantId ||
      approval.agentId !== e.agentId ||
      approval.versionId !== e.versionId ||
      approval.toolName !== e.toolName ||
      approval.actorId !== e.actor.id ||
      !core?.options.approvalAuthority
    )
      return false
    const record = await state.io('approval.get', () =>
      core.options.approvalAuthority!.get(approval.id, e.tenantId)
    )
    return (
      !!record &&
      record.status === 'issued' &&
      record.id === approval.id &&
      record.tenantId === e.tenantId &&
      record.agentId === e.agentId &&
      record.versionId === e.versionId &&
      record.actorId === e.actor.id &&
      record.toolName === e.toolName &&
      record.expiresAt.getTime() > now &&
      record.inputHash === a.command.inputHash
    )
  }
  const settle = async (input: {
    request: ApprovalExecutionRequest
    reservationId: string
    evidenceRef: string
  }): Promise<void> => {
    await state.io(
      'approval.settlement',
      () => {
        const g = grants.get(input.request.operationKey)
        if (
          !g ||
          !g.begun ||
          g.settled ||
          g.reservation !== input.reservationId ||
          !validRequest(g.attempt, input.request) ||
          input.request.executionRef !== g.request.executionRef ||
          input.request.approvalId !== g.approval.id ||
          !input.evidenceRef
        )
          throw new Error('approval_binding_invalid')
        g.settled = true
      },
      true
    )
  }
  return {
    request: async (request) => {
      state.check()
      const a = state.attempts.find(
        (a) => a.command.execution.toolName === request.toolId
      )
      const denied = { status: 'DENIED' as const, reason: 'approval_required' }
      if (
        !a ||
        !validRequest(a, request) ||
        request.operatorId !== a.command.execution.agentId ||
        grants.has(request.operationKey)
      ) {
        if (a) a.denied = true
        return denied
      }
      const approval = core?.parseApproval(
        await state.io('approval.resolve', () => resolve(a))
      )
      if (!approval || !(await read(a, approval))) {
        a.denied = true
        return denied
      }
      grants.set(request.operationKey, {
        attempt: a,
        approval,
        request,
        begun: false,
        settled: false
      })
      return {
        status: 'APPROVED',
        approvalId: approval.id as ApprovalId,
        reason: 'controlled_one_use'
      }
    },
    execution: {
      begin: async (request) => {
        state.check()
        const g = grants.get(request.operationKey)
        if (
          !g ||
          g.begun ||
          !validRequest(g.attempt, request) ||
          request.agentVersion !== g.request.agentVersion ||
          request.executionRef !== g.request.executionRef ||
          request.approvalId !== g.approval.id ||
          !(await read(g.attempt, g.approval))
        )
          throw new Error('approval_binding_invalid')
        g.begun = true // uncertain ACK is never retried
        const e = g.attempt.command.execution
        const consumed = await state.io('approval.begin', () =>
          core!.options.approvalAuthority!.verifyAndConsume({
            approvalId: g.approval.id,
            tenantId: e.tenantId,
            agentId: e.agentId,
            versionId: e.versionId,
            toolName: e.toolName,
            input: e.input,
            actorId: e.actor.id,
            consumptionAudit: {
              correlationId: g.attempt.command.correlationId,
              policyVersion: 'capability-approval-v1',
              ...(e.traceId ? { traceId: e.traceId } : {})
            }
          })
        )
        if (
          !consumed ||
          consumed.status !== 'consumed' ||
          consumed.id !== g.approval.id ||
          consumed.tenantId !== e.tenantId ||
          consumed.agentId !== e.agentId ||
          consumed.versionId !== e.versionId ||
          consumed.toolName !== e.toolName ||
          consumed.actorId !== e.actor.id ||
          consumed.inputHash !== createCapabilityInputHash(e)
        ) {
          g.attempt.denied = true
          throw new Error('approval_consumption_denied')
        }
        g.attempt.approvalConsumed = true
        g.reservation = createCorrelationId()
        return { approvalId: request.approvalId, reservationId: g.reservation }
      },
      complete: settle,
      fail: settle,
      uncertain: settle
    }
  }
}
