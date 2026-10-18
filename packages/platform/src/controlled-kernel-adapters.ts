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
import type {
  ControlledContinuationRuntime,
  ControlledPhaseRef
} from './controlled-kernel-continuation.ts'

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
    readonly tenantId: string,
    readonly durable?: ControlledContinuationRuntime
  ) {}
  fail(phase: string): void {
    this.fault ??= {
      phase,
      code: 'evidence_unavailable',
      bodyStarted: this.attempts.some((a) => a.phase === 'ENTERED')
    }
    this.controller.abort()
    if (this.durable) this.close()
  }
  check(): void {
    if (this.durable?.fault && !this.fault) this.fail(this.durable.fault)
    if (this.fault || this.closed) throw new Error('controlled_evidence_closed')
  }
  async io<T>(
    phase: string,
    operation: () => T | PromiseLike<T>,
    terminal = false,
    payload: unknown = {}
  ): Promise<T> {
    if (this.durable) {
      try {
        const result = await this.durable.run(
          phase,
          payload,
          () => operation(),
          this.finalizing || this.closed
        )
        const ack = this.durable.seal
        for (const attempt of this.attempts) {
          attempt.evidenceRefs ??= []
          attempt.evidenceRefs.push({
            phaseId: this.durable.lastAck!.phase.phaseId,
            phaseType: phase,
            sequence: ack.sequence,
            hash: ack.hash
          })
        }
        return result
      } catch {
        this.fail(phase)
        throw new Error('controlled_evidence_unavailable')
      }
    }
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
    if (this.durable) return // Refreshed asynchronously under a phase before dispatch.
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
  async refreshPause(): Promise<void> {
    if (!this.durable) return
    const guards = await this.io('pause.read', () =>
      this.durable!.host.admission.readGuards(this.durable!.host.identity)
    )
    if (
      typeof guards.paused !== 'boolean' ||
      typeof guards.cancelled !== 'boolean' ||
      guards.expiresAt !== new Date(this.expiresAt).toISOString()
    ) {
      this.fail('pause.read')
      throw new Error('controlled_pause_invalid')
    }
    this.paused ||= guards.paused
    if (guards.cancelled) this.controller.abort()
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
      if (this.durable) this.close()
      return false
    }
    if (this.durable) {
      const permit = attempt.permit
      const leaseUntil =
        typeof permit?.leaseUntil === 'string'
          ? Date.parse(permit.leaseUntil)
          : NaN
      const i = this.durable.host.identity
      try {
        this.durable.assertDispatch()
      } catch {
        attempt.cause = 'CANCELLED'
        this.close()
        return false
      }
      if (
        !permit ||
        !permit.permitId ||
        permit.tenantId !== i.tenantId ||
        permit.executionId !== i.executionId ||
        permit.workerId !== i.workerId ||
        permit.attempt !== i.attempt ||
        permit.operationKey !== context.operationKey ||
        permit.inputHash !== attempt.command.inputHash ||
        permit.fingerprint !== fingerprint ||
        permit.phaseId !== this.durable.activePhase?.phaseId ||
        Date.parse(permit.expiresAt) !== this.expiresAt ||
        !Number.isFinite(leaseUntil) ||
        leaseUntil <= Date.now() ||
        leaseUntil > this.expiresAt
      ) {
        attempt.cause = 'STATE_CONFLICT'
        this.close()
        return false
      }
      // Single-use local permit; no await follows this guard before captured handler.
      delete attempt.permit
    }
    const veto = this.veto(context.signal)
    if (veto) {
      attempt.cause = veto
      // Admission is terminal. Only bounded non-effect settlement may now
      // run, including tool/result when the dispatch deadline just elapsed.
      this.finalizing = true
      if (this.durable) this.close()
      return false
    }
    attempt.phase = 'ENTERED'
    return true
  }
  /** Synchronous, before projection or final awaits. A late ACK cannot reopen entry. */
  close(): void {
    if (this.closed) return
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
    this.durable?.closeLocal()
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
      append: (event) => {
        if (event.action === 'evaluation.completed' && state.durable)
          return state.durable
            .finishEvaluation(() => ports.audit.append(event), event)
            .catch((error) => {
              state.fail('completion.evaluate')
              throw error
            })
        const terminal = [
          'runtime.completed',
          'runtime.stopped',
          'runtime.paused'
        ].includes(event.action)
        if (terminal && state.durable) state.close()
        return state.io(
          `audit.${event.action}`,
          () => ports.audit.append(event),
          terminal,
          event
        )
      }
    },
    log: {
      append: async (event) => {
        if (event.type === 'turn/end' && state.durable) state.close()
        await state.io(
          `log.${event.type}`,
          () => ports.log.append(event),
          event.type === 'turn/end',
          state.durable ? JSON.parse(JSON.stringify(event)) : {}
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
        if (onAudit || state.durable) {
          const callbackEvent: PluginAuditEvent = {
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
              ...(state.durable && a.command.output?.data === undefined
                ? {}
                : { result: a.command.output?.data })
            }).payload
          }
          await state.io(
            'callback.tool',
            () => onAudit?.(callbackEvent),
            true,
            callbackEvent
          )
        }
        a.callbackAcknowledged = true
        a.resultAcknowledged =
          event.outcome === 'succeeded' && status === 'succeeded'
      }
    },
    effects: {
      started: (ref) =>
        state.io(
          'effects.started',
          () => ports.effects.started(ref),
          false,
          ref
        ),
      finished: (ref, outcome) =>
        state.io(
          'effects.finished',
          () => ports.effects.finished(ref, outcome),
          true,
          { ref, outcome }
        )
    },
    effectJournal: {
      reserve: (input) =>
        state.io(
          'journal.reserve',
          async () => {
            const record = await journal.reserve(input)
            if (
              record.tenantId !== input.tenantId ||
              record.operationKey !== input.operationKey ||
              record.proposalHash !== input.proposalHash
            )
              throw new Error('journal_binding_invalid')
            if (record.state === 'CONFIRMED') {
              if (state.durable)
                throw new Error('controlled_unsealed_journal_receipt')
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
          },
          false,
          input
        ),
      markStarted: (input) =>
        state.io(
          'journal.markStarted',
          () => journal.markStarted(input),
          false,
          input
        ),
      confirm: (input) =>
        state.io('journal.confirm', () => journal.confirm(input), true, input),
      fail: (input) =>
        state.io('journal.fail', () => journal.fail(input), true, input),
      markUncertain: (input) =>
        state.io(
          'journal.markUncertain',
          () => journal.markUncertain(input),
          true,
          input
        ),
      get: (tenant, key) =>
        state.io('journal.get', () => journal.get(tenant, key), false, {
          tenant,
          key
        })
    },
    stepStore: {
      recordStep: (step) => {
        if (step.status === 'FAILED' || step.stopReason !== undefined) {
          state.finalizing = true
          if (state.durable) state.close()
        }
        return state.io(
          'step.recordStep',
          () => steps.recordStep(step),
          false,
          step
        )
      },
      saveCheckpoint: (checkpoint) => {
        if (checkpoint.state.stopReason !== undefined) {
          state.finalizing = true
          if (state.durable) state.close()
        }
        return state.io(
          'step.saveCheckpoint',
          () => steps.saveCheckpoint(checkpoint),
          false,
          state.durable ? JSON.parse(JSON.stringify(checkpoint)) : {}
        )
      },
      listSteps: (tenant, id) => {
        if (state.controller.signal.aborted || Date.now() >= state.expiresAt) {
          state.finalizing = true
          if (state.durable) state.close()
        }
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
        const execute = () =>
          measure(() =>
            executeAuthorizedPreparedCommand(
              a.command,
              () => state.admit(a, context, fingerprint()),
              true
            )
          )
        let result: Awaited<ReturnType<typeof execute>>
        if (state.durable) {
          await state.refreshPause()
          const veto = state.veto(context.signal)
          if (veto) {
            a.cause = veto
            state.close()
            return { status: 'REJECTED', error: 'terminal_admission_closed' }
          }
          // Admission transaction is separate from the final synchronous guard.
          const operationKey = context.operationKey
          if (!operationKey) throw new Error('controlled_operation_missing')
          result = await state.durable.run(
            'dispatch.admit',
            { operationKey, inputHash: a.command.inputHash },
            async (phase) => {
              a.permit = await state.durable!.bounded(() =>
                state.durable!.host.admission.prepareDispatch(
                  state.durable!.host.identity,
                  phase,
                  {
                    operationKey,
                    inputHash: a.command.inputHash,
                    fingerprint: fingerprint()
                  }
                )
              )
              state.durable!.assertDispatch()
              return execute()
            }
          )
          const last = state.durable.lastAck!
          a.evidenceRefs ??= []
          a.evidenceRefs.push({
            phaseId: last.phase.phaseId,
            phaseType: last.phase.phaseType,
            sequence: last.ack.sequence,
            hash: last.ack.hash
          })
        } else result = await execute()
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
      await state.refreshPause()
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
      if (state.durable && (state.paused || state.controller.signal.aborted)) {
        if (a) a.cause = state.paused ? 'HUMAN_TAKEOVER' : 'CANCELLED'
        state.close()
        return deny('controlled_takeover_or_cancel')
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
      const permissions = await state.io(
        'actor.authorize',
        () => core.authorize(e, a.command.resolved.tool.permission),
        false,
        {
          tenantId: e.tenantId,
          agentId: e.agentId,
          versionId: e.versionId,
          actor: e.actor,
          inputHash: a.command.inputHash,
          permission: a.command.resolved.tool.permission
        }
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
        const verification = {
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
        }
        const bound = state.durable
          ? await state.durable.run(
              'approval.begin',
              {
                approvalId: g.approval.id,
                inputHash: g.attempt.command.inputHash
              },
              (phase: ControlledPhaseRef) =>
                state.durable!.host.approvalConsumption.consumeBoundApproval(
                  state.durable!.host.identity,
                  phase,
                  {
                    ...verification,
                    executionRef: request.executionRef,
                    operationKey: request.operationKey,
                    stepNumber: 2,
                    stepId: `step_${state.durable!.host.identity.executionId}_2_tool`,
                    requestDigest: state.durable!.host.identity.requestDigest,
                    fingerprint: fingerprint()
                  }
                )
            )
          : null
        const consumed = state.durable
          ? bound?.record
          : await state.io('approval.begin', () =>
              core!.options.approvalAuthority!.verifyAndConsume(verification)
            )
        if (state.durable) {
          const receipt = bound?.receipt
          const i = state.durable.host.identity
          if (
            !receipt ||
            !receipt.receiptId ||
            receipt.approvalId !== g.approval.id ||
            receipt.inputHash !== g.attempt.command.inputHash ||
            receipt.executionRef !== request.executionRef ||
            receipt.tenantId !== i.tenantId ||
            receipt.executionId !== i.executionId ||
            receipt.workerId !== i.workerId ||
            receipt.attempt !== i.attempt ||
            receipt.operationKey !== request.operationKey ||
            receipt.stepNumber !== 2 ||
            receipt.stepId !== `step_${i.executionId}_2_tool` ||
            receipt.requestDigest !== i.requestDigest ||
            receipt.fingerprint !== fingerprint() ||
            receipt.outboxId !== i.outboxId ||
            receipt.outerAttempt !== i.outerAttempt ||
            receipt.outerWorkerId !== i.outerWorkerId ||
            receipt.outerAttemptRowId !== i.outerAttemptRowId ||
            receipt.agentId !== e.agentId ||
            receipt.versionId !== e.versionId ||
            receipt.actorId !== e.actor.id ||
            !Number.isFinite(Date.parse(receipt.consumedAt)) ||
            !receipt.phaseId ||
            !receipt.consumptionAuditId ||
            !Number.isSafeInteger(receipt.sequence) ||
            !/^sha256-[a-f0-9]{64}$/.test(receipt.hash)
          ) {
            state.fail('approval.receipt')
            throw new Error('controlled_approval_receipt')
          }
          g.attempt.approvalReceipt = receipt
        }
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
        g.reservation = bound?.receipt.receiptId ?? createCorrelationId()
        return { approvalId: request.approvalId, reservationId: g.reservation }
      },
      complete: settle,
      fail: settle,
      uncertain: settle
    }
  }
}
