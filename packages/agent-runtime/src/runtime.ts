import {
  ApprovalError,
  type ApprovalAuthority,
  type ApprovalRecord,
  type ApprovalReservation,
  type EffectEvidence
} from '@cvg/approval-engine'
import { ModelGatewayError, type ModelResult } from '@cvg/model-gateway'
import {
  type Capability,
  type PolicyDecision,
  type ToolRiskLevel
} from '@cvg/policy-engine'
import type { ActiveSpan } from '@cvg/observability'
import {
  EffectJournalError,
  type EffectJournalPort,
  type EffectRecord
} from './effect-journal.ts'
import {
  LoopLimitsSchema,
  ToolExecutionError,
  type GovernedAgentRuntimeOptions,
  type GovernedOutcome,
  type GovernedTurnInput,
  type GovernedTurnResult,
  type LoopLimits
} from './contracts.ts'
import {
  canonicalPayloadEquals,
  computeExecutionProposalHash,
  EXECUTION_PROPOSAL_SCHEMA_VERSION
} from './proposal.ts'
import { requestApprovalTurn } from './runtime-approval-request.ts'
import { RuntimeEffectRecovery } from './runtime-effect-recovery.ts'
import {
  DEFAULT_RESERVATION_TTL_MS,
  type BudgetedStage,
  type ExecutionContext,
  type FinishExtra,
  type StageOutcome,
  type StopReason
} from './runtime-execution-context.ts'
import {
  approvalResource,
  computeOperationKey,
  computeResultDigest,
  normalizedResource
} from './runtime-effect-identity.ts'

function syntheticDenialDecision(
  reason: string,
  input: GovernedTurnInput,
  risk: ToolRiskLevel,
  correlationId: string,
  evaluatedAt: string
): PolicyDecision {
  return {
    decision: 'DENY',
    reason,
    policyId: 'runtime.effect-journal',
    policyVersion: 'effect-journal-v1',
    correlationId,
    capability: input.capability,
    risk,
    evaluatedAt
  }
}

/**
 * TTL sweep evidence derived only from the durable effect journal (AAA-03
 * section 4 / T-18). An absent record proves no effect only when the approval
 * persisted the operation key and never reached EXECUTING; RESERVED,
 * ABANDONED and EFFECT_FAILED records are proof for any key. Missing records
 * for legacy approvals (no persisted key) and EFFECT_STARTED, UNCERTAIN or
 * CONFIRMED records require reconciliation and keep an honest UNCERTAIN. The
 * sweep never executes an effect.
 */
function approvalSweepEvidence(input: {
  journalRecord: EffectRecord | undefined
  operationKey: string
  persistedKey: boolean
  approvalStatus: 'RESERVED' | 'EXECUTING'
}): EffectEvidence {
  const { journalRecord, operationKey, persistedKey, approvalStatus } = input
  if (journalRecord === undefined) {
    if (persistedKey && approvalStatus !== 'EXECUTING') {
      return {
        outcome: 'no_effect',
        source: 'journal',
        evidenceRef: `journal:${operationKey}:absent`
      }
    }
    return {
      outcome: 'unknown',
      reason: persistedKey
        ? `approval reached ${approvalStatus} without a journal record for ${operationKey}`
        : `no persisted operation key; absence of ${operationKey} is not proof`
    }
  }
  if (
    journalRecord.state === 'EFFECT_STARTED' ||
    journalRecord.state === 'UNCERTAIN' ||
    journalRecord.state === 'CONFIRMED'
  ) {
    return {
      outcome: 'unknown',
      reason: `effect journal state ${journalRecord.state} for ${operationKey}`
    }
  }
  return {
    outcome: 'no_effect',
    source: 'journal',
    evidenceRef: `journal:${operationKey}:${journalRecord.state.toLowerCase()}`
  }
}

/**
 * Resolves the durable operation key of a governed approval so the sweep can
 * consult the effect journal. The key persisted at reserve time is
 * authoritative because it covers caller idempotency keys, which cannot be
 * recomputed from the approval. Legacy records without a persisted key fall
 * back to the derived key, but an absent record under that candidate is never
 * converted into proof of absence.
 */
function approvalOperationKey(
  record: ApprovalRecord
): { operationKey: string; persisted: boolean } | undefined {
  if (record.operationKey !== undefined) {
    return { operationKey: record.operationKey, persisted: true }
  }
  if (record.proposalHash === undefined || record.capability === undefined) {
    return undefined
  }
  return {
    operationKey: computeOperationKey({
      tenantId: record.tenantId,
      capability: record.capability as Capability,
      action: record.action,
      resource: normalizedResource(record.resource),
      proposalHash: record.proposalHash
    }),
    persisted: false
  }
}

async function collectApprovalSweepEvidence(
  approvals: ApprovalAuthority,
  effectJournal: EffectJournalPort | undefined,
  tenantId: string
): Promise<Map<string, EffectEvidence>> {
  const evidence = new Map<string, EffectEvidence>()
  if (effectJournal === undefined) return evidence
  for (const record of await approvals.list(tenantId)) {
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') continue
    const resolved = approvalOperationKey(record)
    if (resolved === undefined) continue
    let journalRecord: EffectRecord | undefined
    try {
      journalRecord = await effectJournal.get(tenantId, resolved.operationKey)
    } catch {
      // A lookup failure is not proof of absence: leave the record without
      // evidence so the engine keeps an honest UNCERTAIN instead of releasing.
      continue
    }
    if (
      journalRecord !== undefined &&
      (record.proposalHash === undefined ||
        journalRecord.proposalHash !== record.proposalHash)
    ) {
      // A record that cannot be bound to the approval proposal is ambiguous
      // and can never justify a release.
      evidence.set(record.approvalId, {
        outcome: 'unknown',
        reason: `journal record for ${resolved.operationKey} does not match the approval proposal`
      })
      continue
    }
    evidence.set(
      record.approvalId,
      approvalSweepEvidence({
        journalRecord,
        operationKey: resolved.operationKey,
        persistedKey: resolved.persisted,
        approvalStatus: record.status
      })
    )
  }
  return evidence
}

/**
 * Tenant-wide approval TTL sweep exported for the periodic worker (AAA-19;
 * contract condition AAA03-R3-F03). It never executes an effect and never
 * touches the tool executor or the outbox: expired reservations with proof of
 * no effect return to APPROVED, anything else is kept UNCERTAIN for explicit
 * reconciliation.
 */
export async function sweepExpiredApprovals(options: {
  approvals: ApprovalAuthority
  effectJournal?: EffectJournalPort
  tenantId: string
  now?: Date
  ttlMs?: number
}): Promise<{ released: number; uncertain: number }> {
  const evidence = await collectApprovalSweepEvidence(
    options.approvals,
    options.effectJournal,
    options.tenantId
  )
  return await options.approvals.releaseExpired({
    tenantId: options.tenantId,
    ...(options.now !== undefined ? { now: options.now } : {}),
    ttlMs: options.ttlMs ?? DEFAULT_RESERVATION_TTL_MS,
    evidenceFor: (record) => evidence.get(record.approvalId)
  })
}

/**
 * Governed turn pipeline:
 * envelope -> policy -> takeover interlock -> [request: model -> immutable
 * proposal -> approval] | [execution: reserve -> markExecuting -> tool ->
 * confirm -> outbox] | [allow: model -> tool -> outbox]. Every phase is traced
 * and appended to a hash-chained audit ledger; the approved tool call uses the
 * frozen proposal payload exclusively and fails closed on any divergence.
 */
export class GovernedAgentRuntime {
  readonly #options: GovernedAgentRuntimeOptions
  readonly #recovery: RuntimeEffectRecovery

  constructor(options: GovernedAgentRuntimeOptions) {
    this.#options = options
    this.#recovery = new RuntimeEffectRecovery(options)
  }

  /**
   * T-19 / contract section 10 Q2 fail-closed adapter gate. A capability
   * declared `real_authorized` needs an explicit entry; a high-risk write
   * capability with no declaration is denied before any executor call.
   */
  #effectAuthorizationDenial(capability: Capability): string | undefined {
    const declared = this.#options.effectScopes?.[capability]
    if (declared === 'real_authorized') {
      const authorized = this.#options.realEffectAuthorizations ?? []
      return authorized.includes(capability)
        ? undefined
        : 'real_effect_not_authorized'
    }
    if (
      declared === undefined &&
      this.#options.policy.profile.isHighRisk(capability)
    ) {
      return 'real_effect_not_authorized'
    }
    return undefined
  }

  /**
   * A capability can produce a real effect when it is a high-risk write
   * (including ADMIN) or explicitly declared `real_authorized`. Such effects
   * require a durable effect journal; without it the runtime fails closed.
   */
  #requiresDurableEffect(capability: Capability): boolean {
    if (this.#options.effectScopes?.[capability] === 'real_authorized') {
      return true
    }
    return this.#options.policy.profile.isHighRisk(capability)
  }

  async runTurn(input: GovernedTurnInput): Promise<GovernedTurnResult> {
    const { policy, approvals, modelGateway, telemetry, audit } = this.#options
    const clock = this.#options.clock ?? (() => new Date())
    const limits: LoopLimits = LoopLimitsSchema.parse(input.limits ?? {})
    const startedAt = clock()
    const deadline = startedAt.getTime() + limits.maxDurationMs
    const risk = policy.profile.risk(input.capability)
    const root: ActiveSpan = telemetry.startSpan('agent.turn', {
      capability: input.capability,
      agentProfile: input.agentProfile,
      risk,
      correlationId: input.correlationId,
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      agentId: input.agentId,
      agentVersion: input.agentVersion
    })
    const { traceId, spanId, correlationId } = root.context
    let auditSequence = 0
    let costUsd = 0
    let steps = 0
    let modelCalls = 0
    let toolCalls = 0
    const openSpans = new Set<ActiveSpan>()

    const appendAudit = (
      type: string,
      payload: Record<string, unknown>
    ): void => {
      auditSequence += 1
      audit.append({
        eventId: `evt_${traceId}_${auditSequence}`,
        type,
        actor: input.operatorId,
        tenantId: input.tenantId,
        correlationId,
        timestamp: clock().toISOString(),
        payload
      })
    }

    const finish = (
      outcome: GovernedOutcome,
      reason: string,
      decision: PolicyDecision,
      extra: FinishExtra = {}
    ): GovernedTurnResult => {
      const endedAt = clock()
      // Every span opened by the turn closes on success, error, timeout and
      // cancellation; no span may remain pending after finish.
      for (const span of openSpans) span.end('error', reason)
      openSpans.clear()
      root.setAttribute('outcome', outcome)
      root.end(
        outcome === 'denied' ? 'error' : 'ok',
        outcome === 'denied' ? reason : undefined
      )
      telemetry.recordMetric('agent_runs_total', 1, {
        outcome,
        capability: input.capability,
        agentProfile: input.agentProfile
      })
      return {
        outcome,
        reason,
        decision,
        traceId,
        spanId,
        correlationId,
        auditChainValid: audit.verify().valid,
        costUsd: extra.costUsd ?? costUsd,
        durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
        ...(extra.modelResult !== undefined
          ? { modelResult: extra.modelResult }
          : {}),
        ...(extra.approvalId !== undefined
          ? { approvalId: extra.approvalId }
          : {}),
        ...(extra.toolResult !== undefined
          ? { toolResult: extra.toolResult }
          : {}),
        ...(extra.outboxEventId !== undefined
          ? { outboxEventId: extra.outboxEventId }
          : {}),
        ...(extra.outboxPending !== undefined
          ? { outboxPending: extra.outboxPending }
          : {}),
        ...(extra.executionRef !== undefined
          ? { executionRef: extra.executionRef }
          : {}),
        ...(extra.resultDigest !== undefined
          ? { resultDigest: extra.resultDigest }
          : {}),
        ...(extra.replayed !== undefined ? { replayed: extra.replayed } : {}),
        ...(extra.effectConfirmed !== undefined
          ? { effectConfirmed: extra.effectConfirmed }
          : {})
      }
    }

    const endSpan = (
      span: ActiveSpan | undefined,
      status: 'ok' | 'error',
      errorCode?: string
    ): void => {
      if (span === undefined) return
      openSpans.delete(span)
      span.end(status, errorCode)
    }

    const controlSpan = (name: string): ActiveSpan => {
      const span = root.child(name)
      openSpans.add(span)
      return span
    }

    const stopReason = (): StopReason | undefined => {
      if (input.cancelSignal?.aborted === true) return 'turn_cancelled'
      if (clock().getTime() >= deadline) return 'loop_deadline_exceeded'
      return undefined
    }

    const deny = (
      reason: string,
      decision: PolicyDecision,
      extra: FinishExtra = {},
      phase = 'limits'
    ): GovernedTurnResult => {
      appendAudit('runtime.denied', { code: reason, phase })
      return finish('denied', reason, decision, extra)
    }

    const stopDenial = (
      decision: PolicyDecision,
      extra: FinishExtra = {},
      phase = 'limits'
    ): GovernedTurnResult | undefined => {
      const reason = stopReason()
      return reason === undefined
        ? undefined
        : deny(reason, decision, extra, phase)
    }

    // I12: a recognized pause stops the turn before its next step or effect;
    // nothing is consumed, so the caller retries after the pause is lifted.
    // An unreadable switch counts as paused.
    const readPause = async (): Promise<
      'operator_paused' | 'pause_state_unavailable' | undefined
    > => {
      const pause = this.#options.pause
      if (pause === undefined) return undefined
      try {
        return (await pause.isPaused(input.tenantId))
          ? 'operator_paused'
          : undefined
      } catch {
        return 'pause_state_unavailable'
      }
    }
    const finishPaused = (
      code: 'operator_paused' | 'pause_state_unavailable',
      decision: PolicyDecision,
      phase: string,
      extra: FinishExtra = {}
    ): GovernedTurnResult => {
      appendAudit('runtime.paused', { phase, code })
      return finish('paused', code, decision, extra)
    }
    const pausedStop = async (
      decision: PolicyDecision,
      phase: string,
      extra: FinishExtra = {}
    ): Promise<GovernedTurnResult | undefined> => {
      const code = await readPause()
      return code === undefined
        ? undefined
        : finishPaused(code, decision, phase, extra)
    }

    const assertBudget = (
      stage: BudgetedStage,
      decision: PolicyDecision,
      extra: FinishExtra = {}
    ): GovernedTurnResult | undefined => {
      if (steps >= limits.maxSteps) {
        return deny('steps_budget_exceeded', decision, extra)
      }
      if (stage === 'model.generate' && modelCalls >= limits.maxModelCalls) {
        return deny('model_calls_exhausted', decision, extra)
      }
      if (stage === 'tool.execute' && toolCalls >= limits.maxToolCalls) {
        return deny('tool_calls_exhausted', decision, extra)
      }
      if (costUsd > limits.maxCostUsd) {
        return deny('loop_cost_exceeded', decision, extra)
      }
      return undefined
    }

    const beginStage = (
      stage: BudgetedStage,
      decision: PolicyDecision,
      extra: FinishExtra = {}
    ): StageOutcome => {
      const denied = assertBudget(stage, decision, extra)
      if (denied !== undefined) return { denied }
      const reason = stopReason()
      if (reason !== undefined) return { denied: deny(reason, decision, extra) }
      steps += 1
      if (stage === 'model.generate') modelCalls += 1
      if (stage === 'tool.execute') toolCalls += 1
      const span = root.child(stage)
      openSpans.add(span)
      return { span }
    }

    const earlyStop = (): GovernedTurnResult | undefined => {
      const reason = stopReason()
      if (reason === undefined) return undefined
      return deny(
        reason,
        syntheticDenialDecision(
          reason,
          input,
          risk,
          correlationId,
          startedAt.toISOString()
        )
      )
    }

    try {
      const effectJournal = this.#options.effectJournal
      const reservationTtlMs =
        this.#options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS

      const preSweepStop = earlyStop()
      if (preSweepStop !== undefined) return preSweepStop

      if (effectJournal !== undefined) {
        try {
          await effectJournal.releaseExpired(startedAt, reservationTtlMs)
        } catch {
          appendAudit('runtime.denied', {
            code: 'journal_sweep_failed',
            phase: 'journal'
          })
          return finish(
            'denied',
            'journal_sweep_failed',
            syntheticDenialDecision(
              'journal_sweep_failed',
              input,
              risk,
              correlationId,
              startedAt.toISOString()
            )
          )
        }
        const postSweepStop = earlyStop()
        if (postSweepStop !== undefined) return postSweepStop
      }

      // TTL recovery never executes an effect. Any sweep failure fails closed
      // with a stable denial before policy, model, tool or outbox.
      try {
        await sweepExpiredApprovals({
          approvals,
          ...(effectJournal !== undefined ? { effectJournal } : {}),
          tenantId: input.tenantId,
          now: startedAt,
          ttlMs: reservationTtlMs
        })
      } catch {
        appendAudit('runtime.denied', {
          code: 'approval_sweep_failed',
          phase: 'approval'
        })
        return finish(
          'denied',
          'approval_sweep_failed',
          syntheticDenialDecision(
            'approval_sweep_failed',
            input,
            risk,
            correlationId,
            startedAt.toISOString()
          )
        )
      }
      const postApprovalSweepStop = earlyStop()
      if (postApprovalSweepStop !== undefined) return postApprovalSweepStop

      let decision: PolicyDecision
      try {
        decision = policy.evaluate({
          tenantId: input.tenantId,
          operatorId: input.operatorId,
          operatorRole: input.operatorRole,
          agentId: input.agentId,
          agentProfile: input.agentProfile,
          capability: input.capability,
          action: input.action,
          correlationId,
          resource: {
            type: input.resource.type,
            ...(input.resource.id !== undefined
              ? { id: input.resource.id }
              : {}),
            ...(input.resource.tenantId !== undefined
              ? { tenantId: input.resource.tenantId }
              : {})
          },
          context: { dataClassification: input.dataClassification }
        })
      } catch {
        // I7 (SPEC 0181): a failing policy is a normalized, audited denial;
        // the exception never escapes the turn.
        appendAudit('runtime.denied', {
          code: 'policy_failed',
          phase: 'policy'
        })
        return finish('denied', 'policy_failed', {
          ...syntheticDenialDecision(
            'policy_failed',
            input,
            risk,
            correlationId,
            startedAt.toISOString()
          ),
          policyId: 'runtime.policy-failure',
          policyVersion: 'policy-failure-v1'
        })
      }
      appendAudit('policy.decided', {
        capability: input.capability,
        action: input.action,
        decision: decision.decision,
        policyId: decision.policyId,
        policyVersion: decision.policyVersion
      })
      const policySpan = controlSpan('policy.evaluate')
      policySpan.setAttribute('decision', decision.decision)
      endSpan(
        policySpan,
        decision.decision === 'DENY' ? 'error' : 'ok',
        decision.decision === 'DENY' ? 'policy_denied' : undefined
      )

      if (decision.decision === 'DENY') {
        if (input.approvalId !== undefined) {
          appendAudit('runtime.denied', {
            code: 'policy_changed',
            phase: 'policy'
          })
          return finish('denied', 'policy_changed', decision)
        }
        telemetry.recordMetric('policy_denied_total', 1, {
          capability: input.capability,
          agentProfile: input.agentProfile
        })
        appendAudit('runtime.denied', {
          code: 'policy_denied',
          reason: decision.reason
        })
        return finish('denied', 'policy_denied', decision)
      }

      if (input.takeoverActive) {
        appendAudit('runtime.denied', { code: 'human_takeover_active' })
        return finish('denied', 'human_takeover_active', decision)
      }

      const effectDenial = this.#effectAuthorizationDenial(input.capability)
      if (effectDenial !== undefined) {
        telemetry.recordMetric('effect_scope_denied_total', 1, {
          capability: input.capability
        })
        appendAudit('runtime.denied', {
          code: effectDenial,
          capability: input.capability
        })
        return finish('denied', effectDenial, decision)
      }

      if (input.approvalId !== undefined) {
        return await this.#runExecutionTurn(input, decision, {
          appendAudit,
          finish,
          beginStage,
          assertBudget,
          controlSpan,
          endSpan,
          stopReason,
          stopDenial,
          pausedStop,
          readPause,
          finishPaused,
          clock,
          deadline,
          traceId,
          limits
        })
      }

      const pausedBeforeModel = await pausedStop(decision, 'model')
      if (pausedBeforeModel !== undefined) return pausedBeforeModel

      const modelStage = beginStage('model.generate', decision)
      if ('denied' in modelStage) return modelStage.denied
      const modelSpan = modelStage.span
      let modelResult: ModelResult
      // I6 (SPEC 0181): the request is on the audit chain before it is sent,
      // as sent (the structured-output schema by name; the signal is local).
      appendAudit('model.requested', {
        requestId: `req_${traceId}`,
        promptId: input.prompt.promptId,
        promptVersion: input.prompt.version,
        ...(input.prompt.sha256 !== undefined
          ? { promptSha256: input.prompt.sha256 }
          : {}),
        policyVersion: decision.policyVersion,
        modelProfile: input.modelProfile,
        dataClassification: input.dataClassification,
        input: input.modelMessages,
        maxCostUsd: limits.maxCostUsd,
        ...(input.task !== undefined ? { task: input.task } : {}),
        ...(input.structuredOutput !== undefined
          ? { structuredOutputSchema: input.structuredOutput.schemaName }
          : {})
      })
      try {
        modelResult = await modelGateway.generate({
          requestId: `req_${traceId}`,
          tenantId: input.tenantId,
          agentId: input.agentId,
          agentVersionId: input.agentVersion,
          sessionId: input.sessionId ?? input.conversationId,
          conversationId: input.conversationId,
          correlationId,
          promptId: input.prompt.promptId,
          promptVersion: input.prompt.version,
          ...(input.prompt.sha256 !== undefined
            ? { promptSha256: input.prompt.sha256 }
            : {}),
          policyVersion: decision.policyVersion,
          modelProfile: input.modelProfile,
          dataClassification: input.dataClassification,
          input: input.modelMessages,
          maxCostUsd: limits.maxCostUsd,
          estimatedCostUsd: 0,
          ...(input.task !== undefined ? { task: input.task } : {}),
          ...(input.structuredOutput !== undefined
            ? { structuredOutput: input.structuredOutput }
            : {}),
          ...(input.cancelSignal !== undefined
            ? { signal: input.cancelSignal }
            : {})
        })
        costUsd += modelResult.costUsd
        // A late model response never feeds a subsequent effect: the stop check
        // discards it before proposal, tool or outbox.
        const postModelStop = stopDenial(decision, { modelResult })
        if (postModelStop !== undefined) {
          endSpan(modelSpan, 'error', postModelStop.reason)
          return postModelStop
        }
        if (costUsd > limits.maxCostUsd) {
          endSpan(modelSpan, 'error', 'loop_cost_exceeded')
          appendAudit('runtime.denied', { code: 'loop_cost_exceeded', costUsd })
          return finish('denied', 'loop_cost_exceeded', decision, {
            modelResult
          })
        }
        telemetry.recordMetric('model_calls_total', 1, {
          provider: modelResult.providerId,
          model: modelResult.model,
          status: 'ok'
        })
        telemetry.recordMetric('model_cost_usd', modelResult.costUsd, {})
        appendAudit('model.completed', {
          providerId: modelResult.providerId,
          model: modelResult.model,
          costUsd: modelResult.costUsd,
          attempts: modelResult.attempts
        })
        endSpan(modelSpan, 'ok')
      } catch (error) {
        const postModelStop = stopDenial(decision)
        if (postModelStop !== undefined) {
          endSpan(modelSpan, 'error', postModelStop.reason)
          return postModelStop
        }
        const gatewayCode =
          error instanceof ModelGatewayError ? error.code : 'model_failed'
        const code =
          gatewayCode === 'schema_invalid' &&
          input.structuredOutput !== undefined &&
          decision.decision === 'REQUIRE_APPROVAL'
            ? 'structured_output_invalid'
            : gatewayCode
        telemetry.recordMetric('model_calls_total', 1, {
          provider: 'unknown',
          status: 'error'
        })
        endSpan(modelSpan, 'error', code)
        appendAudit('runtime.denied', { code, phase: 'model' })
        return finish('denied', code, decision)
      }

      if (input.shadowMode) {
        appendAudit('runtime.shadowed', {
          capability: input.capability,
          action: input.action
        })
        return finish('shadowed', 'shadow_mode', decision, { modelResult })
      }

      const payloadForEffect: unknown =
        modelResult.output.structured !== undefined
          ? modelResult.output.structured
          : { text: modelResult.output.text }

      if (decision.decision === 'REQUIRE_APPROVAL') {
        return await requestApprovalTurn(
          input,
          decision,
          modelResult,
          payloadForEffect,
          correlationId,
          {
            approvals,
            telemetry,
            clock,
            appendAudit,
            finish
          }
        )
      }

      if (
        effectJournal === undefined &&
        this.#requiresDurableEffect(input.capability)
      ) {
        appendAudit('runtime.denied', {
          code: 'durability_required',
          phase: 'journal'
        })
        return finish('denied', 'durability_required', decision, {
          modelResult
        })
      }

      const pausedBeforeTool = await pausedStop(decision, 'tool', {
        modelResult
      })
      if (pausedBeforeTool !== undefined) return pausedBeforeTool

      const toolStage = beginStage('tool.execute', decision, { modelResult })
      if ('denied' in toolStage) return toolStage.denied
      const toolSpan = toolStage.span
      let toolResult: unknown
      try {
        const executed = await this.#options.toolExecutor({
          tenantId: input.tenantId,
          capability: input.capability,
          action: input.action,
          resource: input.resource,
          payload: payloadForEffect,
          modelResult,
          correlationId,
          traceId,
          shadowMode: false as const,
          ...(input.cancelSignal !== undefined
            ? { signal: input.cancelSignal }
            : {})
        })
        toolResult = executed.result
        const postToolStop = stopDenial(decision, { modelResult, toolResult })
        if (postToolStop !== undefined) {
          endSpan(toolSpan, 'error', postToolStop.reason)
          return postToolStop
        }
        telemetry.recordMetric('tool_calls_total', 1, {
          capability: input.capability,
          status: 'ok'
        })
        appendAudit('tool.executed', {
          capability: input.capability,
          action: input.action
        })
        endSpan(toolSpan, 'ok')
      } catch (error) {
        const postToolStop = stopDenial(decision, { modelResult })
        if (postToolStop !== undefined) {
          endSpan(toolSpan, 'error', postToolStop.reason)
          return postToolStop
        }
        const code =
          error instanceof ToolExecutionError ? error.code : 'tool_failed'
        telemetry.recordMetric('tool_failures_total', 1, {
          capability: input.capability
        })
        endSpan(toolSpan, 'error', code)
        appendAudit('runtime.denied', { code, phase: 'tool' })
        return finish('denied', code, decision, { modelResult })
      }

      const outboxStage = beginStage('outbox.enqueue', decision, {
        modelResult,
        toolResult
      })
      if ('denied' in outboxStage) {
        // The effect already happened: the denial reports the budget/stop reason
        // but carries effectConfirmed + outboxPending so it never suggests
        // absence of effect (contract section 8).
        appendAudit('runtime.outbox_pending', {
          code: outboxStage.denied.reason
        })
        return finish('denied', outboxStage.denied.reason, decision, {
          modelResult,
          toolResult,
          outboxPending: true,
          effectConfirmed: true
        })
      }
      const outboxSpan = outboxStage.span
      let outboxEventId: string
      try {
        const enqueued = await this.#options.outbox({
          tenantId: input.tenantId,
          eventType: `${input.capability}.executed`,
          idempotencyKey:
            input.idempotencyKey ??
            `${input.tenantId}:${input.capability}:${traceId}`,
          correlationId,
          traceId,
          payload: {
            capability: input.capability,
            action: input.action,
            resource: input.resource,
            operatorId: input.operatorId,
            agentId: input.agentId,
            agentVersion: input.agentVersion,
            policyVersion: decision.policyVersion
          }
        })
        outboxEventId = enqueued.eventId
        telemetry.recordMetric('outbox_enqueued_total', 1, {
          capability: input.capability
        })
        appendAudit('outbox.enqueued', { eventId: outboxEventId })
        endSpan(outboxSpan, 'ok')
      } catch {
        endSpan(outboxSpan, 'error', 'outbox_failed')
        appendAudit('runtime.denied', {
          code: 'outbox_failed',
          phase: 'outbox'
        })
        return finish('denied', 'outbox_failed', decision, {
          modelResult,
          toolResult
        })
      }

      appendAudit('runtime.executed', { capability: input.capability })
      return finish('executed', decision.reason, decision, {
        modelResult,
        toolResult,
        outboxEventId
      })
    } catch (error) {
      // Safety net: no unexpected exception may leave root or child spans
      // pending. The error itself keeps propagating to the caller.
      for (const span of openSpans) span.end('error', 'internal_error')
      openSpans.clear()
      root.end('error', 'internal_error')
      throw error
    }
  }

  /**
   * Execution turn: the model is never called again. The effect is built
   * exclusively from the approval record persisted in the request turn, after
   * the canonical payload and proposal hash are revalidated and the approval
   * is reserved and marked EXECUTING.
   */
  async #runExecutionTurn(
    input: GovernedTurnInput,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<GovernedTurnResult> {
    const { approvals, telemetry, effectJournal } = this.#options
    const reservationTtlMs =
      this.#options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS
    const {
      appendAudit,
      finish,
      beginStage,
      assertBudget,
      stopReason,
      stopDenial,
      pausedStop,
      readPause,
      finishPaused,
      endSpan,
      clock,
      traceId
    } = context
    const approvalId = input.approvalId ?? ''

    if (decision.decision !== 'REQUIRE_APPROVAL') {
      appendAudit('runtime.denied', { code: 'policy_changed', phase: 'policy' })
      return finish('denied', 'policy_changed', decision)
    }

    let record: ApprovalRecord
    try {
      record = await approvals.get(input.tenantId, approvalId)
    } catch (error) {
      const code =
        error instanceof ApprovalError ? error.code : 'approval_invalid'
      appendAudit('runtime.denied', { code, phase: 'approval' })
      return finish('denied', code, decision)
    }

    if (record.policyVersion !== decision.policyVersion) {
      appendAudit('runtime.denied', {
        code: 'policy_changed',
        phase: 'approval'
      })
      return finish('denied', 'policy_changed', decision)
    }
    if (record.tenantId !== input.tenantId) {
      appendAudit('runtime.denied', { code: 'tenant_mismatch' })
      return finish('denied', 'tenant_mismatch', decision)
    }
    if (record.action !== input.action) {
      appendAudit('runtime.denied', { code: 'action_mismatch' })
      return finish('denied', 'action_mismatch', decision)
    }
    if (
      record.resource.type !== input.resource.type ||
      (record.resource.id ?? null) !== (input.resource.id ?? null)
    ) {
      appendAudit('runtime.denied', { code: 'resource_mismatch' })
      return finish('denied', 'resource_mismatch', decision)
    }
    if (
      record.agentId !== input.agentId ||
      record.agentVersion !== input.agentVersion ||
      (record.capability !== undefined &&
        record.capability !== input.capability) ||
      (record.dataClassification !== undefined &&
        record.dataClassification !== input.dataClassification)
    ) {
      appendAudit('runtime.denied', { code: 'proposal_mismatch' })
      return finish('denied', 'proposal_mismatch', decision)
    }
    if (
      record.proposalHash === undefined ||
      record.proposalPayload === undefined
    ) {
      appendAudit('runtime.denied', { code: 'proposal_missing' })
      return finish('denied', 'proposal_missing', decision)
    }
    if (
      input.approvalPayload !== undefined &&
      !canonicalPayloadEquals(input.approvalPayload, record.proposalPayload)
    ) {
      appendAudit('runtime.denied', { code: 'payload_mismatch' })
      return finish('denied', 'payload_mismatch', decision)
    }

    let recomputedHash: string
    try {
      recomputedHash = computeExecutionProposalHash({
        schemaVersion: EXECUTION_PROPOSAL_SCHEMA_VERSION,
        tenantId: record.tenantId,
        operatorId: record.operatorId,
        agentId: record.agentId,
        agentVersion: record.agentVersion,
        agentProfile: input.agentProfile,
        capability: input.capability,
        action: record.action,
        resource: record.resource,
        dataClassification: input.dataClassification,
        payload: record.proposalPayload
      })
    } catch {
      recomputedHash = ''
    }
    if (recomputedHash !== record.proposalHash) {
      appendAudit('runtime.denied', { code: 'payload_mismatch' })
      return finish('denied', 'payload_mismatch', decision)
    }

    // A replay may only answer for the exact operation the approval bound, so
    // it runs after every binding check above (ENG-012).
    if (record.status === 'EXECUTED') {
      if (effectJournal !== undefined) {
        const replayed = await this.#recovery.replayConfirmedEffect(
          input,
          record,
          decision,
          context
        )
        if (replayed !== undefined) return replayed
      }
      appendAudit('runtime.denied', { code: 'already_executed' })
      return finish('denied', 'already_executed', decision)
    }

    if (record.status === 'UNCERTAIN') {
      // The start-of-turn TTL sweep or an earlier ambiguous failure moved the
      // approval to UNCERTAIN: only explicit reconciliation closes it.
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'approval'
      })
      return finish('denied', 'operation_uncertain', decision)
    }

    const computedOperationKey = computeOperationKey({
      tenantId: input.tenantId,
      ...(input.idempotencyKey !== undefined
        ? { callerIdempotencyKey: input.idempotencyKey }
        : {}),
      capability: input.capability,
      action: input.action,
      resource: normalizedResource(record.resource),
      proposalHash: record.proposalHash
    })
    // The key persisted at reserve time is authoritative for the whole
    // operation: a retry that presents a different caller idempotency key must
    // reuse the durable identity, otherwise the journal and the TTL sweep could
    // treat the same approval as a brand new operation (P1-2).
    const operationKey = record.operationKey ?? computedOperationKey

    if (Date.parse(record.expiresAt) <= clock().getTime()) {
      appendAudit('runtime.denied', { code: 'proposal_expired' })
      return finish('denied', 'proposal_expired', decision)
    }

    if (input.shadowMode) {
      appendAudit('runtime.shadowed', {
        capability: input.capability,
        action: input.action
      })
      return finish('shadowed', 'shadow_mode', decision)
    }

    if (
      effectJournal === undefined &&
      this.#requiresDurableEffect(input.capability)
    ) {
      appendAudit('runtime.denied', {
        code: 'durability_required',
        phase: 'journal'
      })
      return finish('denied', 'durability_required', decision)
    }

    if (
      effectJournal !== undefined &&
      (record.status === 'RESERVED' || record.status === 'EXECUTING')
    ) {
      const recovered = await this.#recovery.recoverExpiredReservation(
        input,
        record,
        operationKey,
        decision,
        context
      )
      if (recovered !== undefined) return recovered
      record = await approvals.get(input.tenantId, approvalId)
      const postRecoveryStop = stopDenial(decision)
      if (postRecoveryStop !== undefined) return postRecoveryStop
    }

    // Budget is checked before the approval is reserved so a denied tool stage
    // never mutates approval/journal state (T-18 preserves APPROVED).
    const preToolBudget = assertBudget('tool.execute', decision)
    if (preToolBudget !== undefined) return preToolBudget
    const preToolStop = stopDenial(decision)
    if (preToolStop !== undefined) return preToolStop
    // I12: checked before the reservation, so a pause never consumes the
    // approval and the same approval executes once after resume.
    const prePausedStop = await pausedStop(decision, 'approval', {
      approvalId
    })
    if (prePausedStop !== undefined) return prePausedStop

    let reservation: ApprovalReservation | undefined
    let journalAttemptId: string | undefined
    let journalReserved = false
    try {
      reservation = await approvals.reserve({
        tenantId: input.tenantId,
        approvalId,
        action: input.action,
        resource: approvalResource(input),
        payload: record.proposalPayload,
        proposalHash: record.proposalHash,
        agentId: input.agentId,
        agentVersion: input.agentVersion,
        policyVersion: decision.policyVersion,
        capability: input.capability,
        operationKey,
        ttlMs: reservationTtlMs
      })
      appendAudit('approval.reserved', {
        approvalId,
        reservationId: reservation.reservationId,
        proposalHash: record.proposalHash
      })
    } catch (error) {
      const code =
        error instanceof ApprovalError ? error.code : 'approval_invalid'
      if (code === 'already_reserved' && effectJournal !== undefined) {
        const recovered = await this.#recovery.recoverActiveReservation(
          input,
          record,
          operationKey,
          decision,
          context
        )
        if (recovered.kind === 'result') return recovered.result
        reservation = recovered.reservation
        journalAttemptId = recovered.attemptId
        journalReserved = true
      } else {
        appendAudit('runtime.denied', { code, phase: 'approval' })
        return finish('denied', code, decision)
      }
    }

    if (reservation === undefined) {
      appendAudit('runtime.denied', {
        code: 'approval_invalid',
        phase: 'approval'
      })
      return finish('denied', 'approval_invalid', decision)
    }

    if (effectJournal !== undefined && !journalReserved) {
      const journalReservation = await this.#recovery.reserveJournalEffect(
        input,
        record,
        reservation,
        operationKey,
        decision,
        context
      )
      if (journalReservation.kind === 'result') {
        return journalReservation.result
      }
      journalAttemptId = journalReservation.attemptId
    }

    try {
      await approvals.markExecuting({
        tenantId: input.tenantId,
        approvalId,
        reservationId: reservation.reservationId
      })
    } catch (error) {
      const code =
        error instanceof ApprovalError ? error.code : 'approval_invalid'
      appendAudit('runtime.denied', { code, phase: 'approval' })
      return finish('denied', code, decision)
    }
    appendAudit('approval.executing', {
      approvalId,
      reservationId: reservation.reservationId
    })

    if (effectJournal !== undefined && journalAttemptId !== undefined) {
      try {
        await effectJournal.markEffectStarted({
          tenantId: input.tenantId,
          operationKey,
          attemptId: journalAttemptId
        })
        appendAudit('journal.effect_started', {
          operationKey,
          attemptId: journalAttemptId
        })
        const postStartStop = stopDenial(decision)
        if (postStartStop !== undefined) {
          await this.#recovery.markJournalUncertain(
            effectJournal,
            input.tenantId,
            operationKey,
            journalAttemptId,
            `turn interrupted after effect start: ${postStartStop.reason}`
          )
          await this.#recovery.markApprovalUncertain(
            input,
            approvalId,
            reservation.reservationId,
            `turn interrupted after effect start: ${postStartStop.reason}`,
            `journal:${operationKey}`
          )
          return postStartStop
        }
      } catch (error) {
        const code =
          error instanceof EffectJournalError
            ? error.code
            : 'journal_unavailable'
        try {
          await effectJournal.failEffect({
            tenantId: input.tenantId,
            operationKey,
            attemptId: journalAttemptId,
            errorCode: 'mark_effect_started_failed'
          })
        } catch {
          // The RESERVED record remains for an explicit TTL sweep.
        }
        await this.#recovery.releaseApproval(
          input,
          approvalId,
          reservation.reservationId,
          `journal:${operationKey}:mark_started_failed`
        )
        appendAudit('runtime.denied', { code, phase: 'journal' })
        return finish('denied', code, decision)
      }
    }

    // I12 at the last boundary (AUD-0601 F01): the switch is read again after
    // the approval, the journal and the effect start were recorded. A pause
    // committed meanwhile settles the reservation as no effect, so the same
    // approval executes once after resume (the journal re-arms EFFECT_FAILED).
    // The read is awaited, so cancellation and the deadline are checked again
    // after it, in beginStage, with no await before the body (AUD-0602 F01).
    // Precedence: a pause seen by this read wins over a cancellation that
    // also arrived, because `paused` hands the work back to the queue while a
    // cancellation denies the turn; in both cases the effect never starts.
    const pausedBeforeBody = await readPause()
    if (pausedBeforeBody !== undefined) {
      if (effectJournal !== undefined && journalAttemptId !== undefined) {
        try {
          await effectJournal.failEffect({
            tenantId: input.tenantId,
            operationKey,
            attemptId: journalAttemptId,
            errorCode: pausedBeforeBody
          })
        } catch {
          // The EFFECT_STARTED record remains for the TTL sweep.
        }
      }
      await this.#recovery.releaseApproval(
        input,
        approvalId,
        reservation.reservationId,
        `pause:${pausedBeforeBody}`
      )
      return finishPaused(pausedBeforeBody, decision, 'effect', { approvalId })
    }
    const toolStage = beginStage('tool.execute', decision)
    if ('denied' in toolStage) {
      const denialReason = toolStage.denied.reason
      if (effectJournal !== undefined && journalAttemptId !== undefined) {
        try {
          await effectJournal.failEffect({
            tenantId: input.tenantId,
            operationKey,
            attemptId: journalAttemptId,
            errorCode: denialReason
          })
        } catch {
          // The EFFECT_STARTED record remains for the TTL sweep.
        }
      }
      await this.#recovery.releaseApproval(
        input,
        approvalId,
        reservation.reservationId,
        `turn:${denialReason}`
      )
      return toolStage.denied
    }
    const toolSpan = toolStage.span
    let toolResult: unknown
    try {
      const executed = await this.#options.toolExecutor({
        tenantId: input.tenantId,
        capability: input.capability,
        action: input.action,
        resource: input.resource,
        payload: record.proposalPayload,
        modelResult: undefined,
        correlationId: input.correlationId,
        traceId,
        shadowMode: false as const,
        ...(input.cancelSignal !== undefined
          ? { signal: input.cancelSignal }
          : {})
      })
      toolResult = executed.result
      const postToolStop = stopDenial(decision)
      if (postToolStop !== undefined) {
        endSpan(toolSpan, 'error', postToolStop.reason)
        if (effectJournal !== undefined && journalAttemptId !== undefined) {
          await this.#recovery.markJournalUncertain(
            effectJournal,
            input.tenantId,
            operationKey,
            journalAttemptId,
            `turn interrupted after tool: ${postToolStop.reason}`
          )
        }
        await this.#recovery.markApprovalUncertain(
          input,
          approvalId,
          reservation.reservationId,
          `turn interrupted after tool: ${postToolStop.reason}`,
          `tool:${input.capability}:${traceId}`
        )
        return postToolStop
      }
      telemetry.recordMetric('tool_calls_total', 1, {
        capability: input.capability,
        status: 'ok'
      })
      appendAudit('tool.executed', {
        capability: input.capability,
        action: input.action,
        approvalId
      })
      endSpan(toolSpan, 'ok')
    } catch (error) {
      const postToolStop = stopDenial(decision)
      if (postToolStop !== undefined) {
        endSpan(toolSpan, 'error', postToolStop.reason)
        if (effectJournal !== undefined && journalAttemptId !== undefined) {
          await this.#recovery.markJournalUncertain(
            effectJournal,
            input.tenantId,
            operationKey,
            journalAttemptId,
            `turn interrupted during tool: ${postToolStop.reason}`
          )
        }
        await this.#recovery.markApprovalUncertain(
          input,
          approvalId,
          reservation.reservationId,
          `turn interrupted during tool: ${postToolStop.reason}`,
          `tool:${input.capability}:${traceId}`
        )
        return postToolStop
      }
      telemetry.recordMetric('tool_failures_total', 1, {
        capability: input.capability
      })
      endSpan(toolSpan, 'error', 'tool_failed')
      return this.#recovery.handleToolFailure(
        input,
        decision,
        reservation,
        error,
        { appendAudit, finish },
        effectJournal !== undefined && journalAttemptId !== undefined
          ? { operationKey, attemptId: journalAttemptId }
          : undefined
      )
    }

    const executionRef = `exec_${traceId}`
    const evidenceRef = `tool:${input.capability}:${traceId}`
    let resultDigest: string | undefined

    if (effectJournal !== undefined && journalAttemptId !== undefined) {
      try {
        resultDigest = computeResultDigest(toolResult)
      } catch {
        await this.#recovery.markJournalUncertain(
          effectJournal,
          input.tenantId,
          operationKey,
          journalAttemptId,
          'result_digest_unavailable'
        )
        await this.#recovery.markApprovalUncertain(
          input,
          approvalId,
          reservation.reservationId,
          'tool result is not canonicalizable',
          evidenceRef
        )
        appendAudit('runtime.denied', {
          code: 'effect_uncertain',
          phase: 'journal'
        })
        return finish('denied', 'effect_uncertain', decision, { toolResult })
      }
      try {
        await effectJournal.confirmEffect({
          tenantId: input.tenantId,
          operationKey,
          attemptId: journalAttemptId,
          executionRef,
          resultDigest
        })
        appendAudit('journal.effect_confirmed', { operationKey, executionRef })
        // Effect durably confirmed before the stop: never regress the journal.
        // Report honestly (effectConfirmed + outboxPending) instead of a
        // denial that could suggest absence of effect.
        const postConfirmStop = stopReason()
        if (postConfirmStop !== undefined) {
          appendAudit('runtime.denied', {
            code: postConfirmStop,
            phase: 'journal'
          })
          return finish('denied', postConfirmStop, decision, {
            toolResult,
            executionRef,
            ...(resultDigest !== undefined ? { resultDigest } : {}),
            effectConfirmed: true,
            outboxPending: true
          })
        }
      } catch (error) {
        const code =
          error instanceof EffectJournalError
            ? error.code
            : 'journal_unavailable'
        await this.#recovery.markJournalUncertain(
          effectJournal,
          input.tenantId,
          operationKey,
          journalAttemptId,
          `confirm_effect_failed:${code}`
        )
        await this.#recovery.markApprovalUncertain(
          input,
          approvalId,
          reservation.reservationId,
          `effect executed but journal confirm failed: ${code}`,
          evidenceRef
        )
        appendAudit('runtime.denied', {
          code: 'effect_uncertain',
          phase: 'journal'
        })
        return finish('denied', 'effect_uncertain', decision, { toolResult })
      }
    }

    try {
      await approvals.confirm({
        tenantId: input.tenantId,
        approvalId,
        reservationId: reservation.reservationId,
        evidence: {
          outcome: 'effect_confirmed',
          executionRef,
          evidenceRef
        }
      })
    } catch (error) {
      const code =
        error instanceof ApprovalError ? error.code : 'approval_invalid'
      await this.#recovery.markApprovalUncertain(
        input,
        approvalId,
        reservation.reservationId,
        `effect_confirmed but approval.confirm failed: ${code}`,
        evidenceRef
      )
      appendAudit('runtime.denied', {
        code: 'approval_confirm_failed',
        phase: 'approval'
      })
      return finish('denied', 'approval_confirm_failed', decision, {
        toolResult,
        executionRef,
        ...(resultDigest !== undefined ? { resultDigest } : {}),
        effectConfirmed: true
      })
    }
    telemetry.recordMetric('approval_confirmed_total', 1, {
      capability: input.capability
    })
    appendAudit('approval.confirmed', { approvalId, executionRef })

    const governedEffect = effectJournal !== undefined
    const outboxStage = beginStage('outbox.enqueue', decision, { toolResult })
    if ('denied' in outboxStage) {
      appendAudit('runtime.outbox_pending', {
        approvalId,
        code: outboxStage.denied.reason
      })
      return finish('denied', outboxStage.denied.reason, decision, {
        toolResult,
        outboxPending: true,
        effectConfirmed: true,
        ...(governedEffect ? { executionRef } : {}),
        ...(resultDigest !== undefined ? { resultDigest } : {})
      })
    }
    const outboxSpan = outboxStage.span
    let outboxEventId: string
    try {
      const enqueued = await this.#options.outbox({
        tenantId: input.tenantId,
        eventType: `${input.capability}.executed`,
        idempotencyKey: governedEffect
          ? operationKey
          : (input.idempotencyKey ??
            `${input.tenantId}:${input.capability}:${input.correlationId}`),
        correlationId: input.correlationId,
        traceId,
        payload: {
          capability: input.capability,
          action: input.action,
          resource: input.resource,
          operatorId: input.operatorId,
          agentId: input.agentId,
          agentVersion: input.agentVersion,
          policyVersion: decision.policyVersion,
          approvalId,
          proposalId: record.proposalId ?? null,
          proposalHash: record.proposalHash
        }
      })
      outboxEventId = enqueued.eventId
      telemetry.recordMetric('outbox_enqueued_total', 1, {
        capability: input.capability
      })
      appendAudit('outbox.enqueued', { eventId: outboxEventId })
      endSpan(outboxSpan, 'ok')
    } catch {
      endSpan(outboxSpan, 'error', 'outbox_failed')
      appendAudit('runtime.outbox_pending', { approvalId })
      return finish('executed', 'outbox_pending', decision, {
        toolResult,
        outboxPending: true,
        ...(governedEffect ? { executionRef } : {}),
        ...(resultDigest !== undefined ? { resultDigest } : {})
      })
    }

    appendAudit('runtime.executed', {
      capability: input.capability,
      approvalId
    })
    return finish('executed', decision.reason, decision, {
      toolResult,
      outboxEventId,
      ...(governedEffect ? { executionRef } : {}),
      ...(resultDigest !== undefined ? { resultDigest } : {})
    })
  }
}
