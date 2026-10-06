import {
  ApprovalError,
  type ApprovalRecord,
  type ApprovalReservation
} from '@cvg/approval-engine'
import type { PolicyDecision } from '@cvg/policy-engine'
import { createDomainId } from '@cvg/shared'
import {
  EffectJournalError,
  type EffectJournalPort,
  type EffectRecord
} from './effect-journal.ts'
import {
  ToolExecutionError,
  type GovernedAgentRuntimeOptions,
  type GovernedOutcome,
  type GovernedTurnInput,
  type GovernedTurnResult
} from './contracts.ts'
import {
  DEFAULT_RESERVATION_TTL_MS,
  type ExecutionContext,
  type FinishExtra
} from './runtime-execution-context.ts'
import {
  approvalResource,
  computeOperationKey,
  normalizedResource
} from './runtime-effect-identity.ts'

/** Internal composition for effect recovery; not exported by the public barrel. */
export class RuntimeEffectRecovery {
  readonly #options: GovernedAgentRuntimeOptions

  constructor(options: GovernedAgentRuntimeOptions) {
    this.#options = options
  }

  async handleToolFailure(
    input: GovernedTurnInput,
    decision: PolicyDecision,
    reservation: ApprovalReservation,
    error: unknown,
    context: {
      appendAudit: (type: string, payload: Record<string, unknown>) => void
      finish: (
        outcome: GovernedOutcome,
        reason: string,
        decision: PolicyDecision,
        extra?: FinishExtra
      ) => GovernedTurnResult
    },
    journalRef?: { operationKey: string; attemptId: string }
  ): Promise<GovernedTurnResult> {
    const { approvals } = this.#options
    const { appendAudit, finish } = context
    const approvalId = input.approvalId ?? ''
    const failure =
      error instanceof ToolExecutionError
        ? error
        : new ToolExecutionError(
            'tool_failed',
            error instanceof Error ? error.message : 'tool execution failed',
            { certainty: 'unknown' }
          )
    const evidenceRef = `tool:${failure.code}:${input.correlationId}`

    if (failure.certainty === 'no_effect') {
      if (
        this.#options.effectJournal !== undefined &&
        journalRef !== undefined
      ) {
        try {
          await this.#options.effectJournal.failEffect({
            tenantId: input.tenantId,
            operationKey: journalRef.operationKey,
            attemptId: journalRef.attemptId,
            errorCode: failure.code
          })
          appendAudit('journal.effect_failed', {
            operationKey: journalRef.operationKey,
            code: failure.code
          })
        } catch (journalError) {
          const journalCode =
            journalError instanceof EffectJournalError
              ? journalError.code
              : 'journal_unavailable'
          await this.markApprovalUncertain(
            input,
            approvalId,
            reservation.reservationId,
            `no-effect failure could not be journaled: ${journalCode}`,
            evidenceRef
          )
          appendAudit('runtime.denied', {
            code: 'effect_uncertain',
            phase: 'journal'
          })
          return finish('denied', 'effect_uncertain', decision)
        }
      }
      try {
        await approvals.release({
          tenantId: input.tenantId,
          approvalId,
          reservationId: reservation.reservationId,
          evidence: {
            outcome: 'no_effect',
            source: 'adapter',
            evidenceRef
          }
        })
        appendAudit('approval.released', {
          approvalId,
          code: failure.code
        })
      } catch (releaseError) {
        const releaseCode =
          releaseError instanceof ApprovalError
            ? releaseError.code
            : 'approval_invalid'
        appendAudit('runtime.denied', { code: releaseCode, phase: 'approval' })
        return finish('denied', releaseCode, decision)
      }
      appendAudit('runtime.denied', { code: failure.code, phase: 'tool' })
      return finish('denied', failure.code, decision)
    }

    if (this.#options.effectJournal !== undefined && journalRef !== undefined) {
      try {
        await this.#options.effectJournal.markUncertain({
          tenantId: input.tenantId,
          operationKey: journalRef.operationKey,
          attemptId: journalRef.attemptId,
          reason: `tool failure without proof of no effect: ${failure.code}`
        })
        appendAudit('journal.uncertain', {
          operationKey: journalRef.operationKey,
          code: failure.code
        })
      } catch {
        // A failed journal transition never hides the uncertain outcome.
      }
    }

    try {
      await approvals.markUncertain({
        tenantId: input.tenantId,
        approvalId,
        reservationId: reservation.reservationId,
        reason: `tool failure without proof of no effect: ${failure.code}`,
        evidence:
          failure.certainty === 'effect_started'
            ? { outcome: 'effect_possibly_started', evidenceRef }
            : { outcome: 'unknown', reason: failure.code }
      })
      appendAudit('approval.uncertain', {
        approvalId,
        code: failure.code
      })
    } catch (uncertainError) {
      const uncertainCode =
        uncertainError instanceof ApprovalError
          ? uncertainError.code
          : 'approval_invalid'
      appendAudit('runtime.denied', {
        code: uncertainCode,
        phase: 'approval'
      })
      return finish('denied', uncertainCode, decision)
    }
    appendAudit('runtime.denied', {
      code: 'effect_uncertain',
      phase: 'tool'
    })
    return finish('denied', 'effect_uncertain', decision)
  }

  async replayConfirmedEffect(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<GovernedTurnResult | undefined> {
    const journal = this.#options.effectJournal
    if (journal === undefined || record.proposalHash === undefined) {
      return undefined
    }
    const computedOperationKey = computeOperationKey({
      tenantId: input.tenantId,
      ...(input.idempotencyKey !== undefined
        ? { callerIdempotencyKey: input.idempotencyKey }
        : {}),
      capability: input.capability,
      action: record.action,
      resource: normalizedResource(record.resource),
      proposalHash: record.proposalHash
    })
    const operationKey = record.operationKey ?? computedOperationKey
    let journalRecord: EffectRecord | undefined
    try {
      journalRecord = await journal.get(input.tenantId, operationKey)
    } catch {
      return undefined
    }
    if (
      journalRecord === undefined ||
      journalRecord.state !== 'CONFIRMED' ||
      journalRecord.proposalHash !== record.proposalHash
    ) {
      return undefined
    }
    return await this.#finishReplay(
      input,
      record,
      journalRecord,
      decision,
      context
    )
  }

  async #finishReplay(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    journalRecord: EffectRecord,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<GovernedTurnResult> {
    const { approvals, telemetry } = this.#options
    const { appendAudit, finish, beginStage, endSpan, stopReason, traceId } =
      context
    const approvalId = record.approvalId
    const executionRef = journalRecord.executionRef ?? `exec_${traceId}`
    const resultDigest = journalRecord.resultDigest
    const evidenceRef = `journal:${journalRecord.operationKey}`

    const replayStop = stopReason()
    if (replayStop !== undefined) {
      appendAudit('runtime.denied', { code: replayStop, phase: 'replay' })
      return finish('denied', replayStop, decision, {
        executionRef,
        ...(resultDigest !== null ? { resultDigest } : {}),
        replayed: true,
        effectConfirmed: true,
        outboxPending: true
      })
    }

    if (record.status !== 'EXECUTED') {
      if (record.reservationId === undefined) {
        appendAudit('runtime.denied', {
          code: 'approval_confirm_failed',
          phase: 'approval'
        })
        return finish('denied', 'approval_confirm_failed', decision, {
          executionRef,
          ...(resultDigest !== null ? { resultDigest } : {}),
          effectConfirmed: true
        })
      }
      try {
        await approvals.confirm({
          tenantId: input.tenantId,
          approvalId,
          reservationId: record.reservationId,
          evidence: {
            outcome: 'effect_confirmed',
            executionRef,
            evidenceRef
          }
        })
        telemetry.recordMetric('approval_confirmed_total', 1, {
          capability: input.capability
        })
        appendAudit('approval.confirmed', {
          approvalId,
          executionRef,
          replayed: true
        })
      } catch (error) {
        const code =
          error instanceof ApprovalError ? error.code : 'approval_invalid'
        await this.markApprovalUncertain(
          input,
          approvalId,
          record.reservationId,
          `replay confirmation failed: ${code}`,
          evidenceRef
        )
        appendAudit('runtime.denied', {
          code: 'approval_confirm_failed',
          phase: 'approval'
        })
        return finish('denied', 'approval_confirm_failed', decision, {
          executionRef,
          ...(resultDigest !== null ? { resultDigest } : {}),
          effectConfirmed: true
        })
      }
    }

    const outboxStage = beginStage('outbox.enqueue', decision)
    if ('denied' in outboxStage) {
      appendAudit('runtime.outbox_pending', {
        approvalId,
        replayed: true,
        code: outboxStage.denied.reason
      })
      return finish('denied', outboxStage.denied.reason, decision, {
        executionRef,
        ...(resultDigest !== null ? { resultDigest } : {}),
        replayed: true,
        outboxPending: true,
        effectConfirmed: true
      })
    }
    const outboxSpan = outboxStage.span
    try {
      const enqueued = await this.#options.outbox({
        tenantId: input.tenantId,
        eventType: `${input.capability}.executed`,
        idempotencyKey: journalRecord.operationKey,
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
          proposalHash: record.proposalHash ?? null
        }
      })
      telemetry.recordMetric('outbox_enqueued_total', 1, {
        capability: input.capability
      })
      appendAudit('outbox.enqueued', {
        eventId: enqueued.eventId,
        replayed: true
      })
      endSpan(outboxSpan, 'ok')
      appendAudit('runtime.executed', {
        capability: input.capability,
        approvalId,
        replayed: true
      })
      return finish('executed', 'idempotent_replay', decision, {
        executionRef,
        ...(resultDigest !== null ? { resultDigest } : {}),
        replayed: true,
        outboxEventId: enqueued.eventId
      })
    } catch {
      endSpan(outboxSpan, 'error', 'outbox_failed')
      appendAudit('runtime.outbox_pending', { approvalId, replayed: true })
      return finish('executed', 'outbox_pending', decision, {
        executionRef,
        ...(resultDigest !== null ? { resultDigest } : {}),
        replayed: true,
        outboxPending: true
      })
    }
  }

  /**
   * P1-2R fail-closed recovery denial. Doubt never releases or re-arms: an
   * expired reservation is marked UNCERTAIN so reconciliation can close it,
   * while a live reservation keeps its lease and fence untouched.
   */
  async #denyRecoveryUncertain(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    decision: PolicyDecision,
    context: ExecutionContext,
    reason: string,
    evidenceRef: string,
    markUncertain: boolean
  ): Promise<GovernedTurnResult> {
    if (markUncertain && record.reservationId !== undefined) {
      await this.markApprovalUncertain(
        input,
        record.approvalId,
        record.reservationId,
        reason,
        evidenceRef
      )
    }
    context.appendAudit('runtime.denied', {
      code: 'operation_uncertain',
      phase: 'approval'
    })
    return context.finish('denied', 'operation_uncertain', decision)
  }

  async recoverExpiredReservation(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    operationKey: string,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<GovernedTurnResult | undefined> {
    const journal = this.#options.effectJournal
    if (journal === undefined || record.reservationId === undefined) {
      return undefined
    }
    const now = context.clock()
    const reservationExpired =
      record.reservationExpiresAt !== undefined &&
      Date.parse(record.reservationExpiresAt) <= now.getTime()
    const persistedKey = record.operationKey !== undefined
    let journalRecord: EffectRecord | undefined
    try {
      journalRecord = await journal.get(input.tenantId, operationKey)
    } catch {
      // A lookup failure is never proof of absence (P1-2R).
      return this.#denyRecoveryUncertain(
        input,
        record,
        decision,
        context,
        'effect journal lookup failed during recovery',
        `journal:${operationKey}`,
        reservationExpired
      )
    }

    if (journalRecord?.state === 'UNCERTAIN') {
      return this.#denyRecoveryUncertain(
        input,
        record,
        decision,
        context,
        'effect journal is UNCERTAIN; explicit reconciliation required',
        `journal:${operationKey}`,
        true
      )
    }
    if (
      journalRecord !== undefined &&
      journalRecord.proposalHash !== record.proposalHash
    ) {
      // A record that cannot be bound to the approval proposal is ambiguous
      // and never justifies a release (same rule as the sweep evidence).
      return this.#denyRecoveryUncertain(
        input,
        record,
        decision,
        context,
        `journal record for ${operationKey} does not match the approval proposal`,
        `journal:${operationKey}`,
        reservationExpired
      )
    }
    if (journalRecord?.state === 'EFFECT_STARTED') {
      const expired =
        reservationExpired ||
        Date.parse(journalRecord.expiresAt) <= now.getTime()
      if (expired) {
        return this.#denyRecoveryUncertain(
          input,
          record,
          decision,
          context,
          'effect start lease expired without confirmation',
          `journal:${operationKey}`,
          true
        )
      }
      // A live effect lease keeps its fence: fall through to the reserve path,
      // which denies it without re-arming.
      return undefined
    }
    if (
      reservationExpired &&
      (journalRecord === undefined || journalRecord.state === 'ABANDONED')
    ) {
      if (!persistedKey) {
        // P1-2R: a keyless approval carries no identity proof; a record under
        // the recomputed candidate key never releases it into execution.
        return this.#denyRecoveryUncertain(
          input,
          record,
          decision,
          context,
          'legacy approval without a persisted operation key',
          `journal:${operationKey}:legacy`,
          true
        )
      }
      if (journalRecord === undefined && record.status === 'EXECUTING') {
        // Absence is proof only when the approval never reached EXECUTING
        // (sweep evidence rules); anything else stays UNCERTAIN.
        return this.#denyRecoveryUncertain(
          input,
          record,
          decision,
          context,
          `approval reached EXECUTING without a journal record for ${operationKey}`,
          `journal:${operationKey}:missing`,
          true
        )
      }
      const evidenceRef =
        journalRecord === undefined
          ? `journal:${operationKey}:absent`
          : `journal:${operationKey}:expired`
      const released = await this.releaseApproval(
        input,
        record.approvalId,
        record.reservationId,
        evidenceRef
      )
      if (released) {
        context.appendAudit('approval.released', {
          approvalId: record.approvalId,
          code: 'reservation_expired'
        })
      }
    }
    return undefined
  }

  async recoverActiveReservation(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    operationKey: string,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<
    | { kind: 'result'; result: GovernedTurnResult }
    | {
        kind: 'reserved'
        reservation: ApprovalReservation
        attemptId: string
      }
  > {
    const { approvals, effectJournal } = this.#options
    const { appendAudit, finish, clock } = context
    const approvalId = record.approvalId
    const proposalHash = record.proposalHash
    if (
      effectJournal === undefined ||
      proposalHash === undefined ||
      record.reservationId === undefined
    ) {
      appendAudit('runtime.denied', {
        code: 'already_reserved',
        phase: 'approval'
      })
      return {
        kind: 'result',
        result: finish('denied', 'already_reserved', decision)
      }
    }

    // P1-2R: resolve the durable identity before touching the journal. The
    // persisted key is authoritative; for a keyless (legacy) approval an
    // absent record under the recomputed candidate key is never proof of
    // absence, and a retry must never re-arm the operation.
    let existing: EffectRecord | undefined
    try {
      existing = await effectJournal.get(input.tenantId, operationKey)
    } catch {
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    if (existing !== undefined && existing.proposalHash !== proposalHash) {
      // The record is bound to a different proposal: ambiguous identity, never
      // re-armed nor replayed.
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    if (record.operationKey === undefined) {
      // Legacy approval with no persisted identity: only a confirmed record
      // (a replay, never a new effect) is actionable; everything else fails
      // closed. The journal is left untouched so the original EFFECT_STARTED
      // record (possibly under a caller key) is neither orphaned nor hidden.
      if (existing?.state === 'CONFIRMED') {
        return {
          kind: 'result',
          result: await this.#finishReplay(
            input,
            record,
            existing,
            decision,
            context
          )
        }
      }
      if (existing?.state === 'UNCERTAIN') {
        await this.markApprovalUncertain(
          input,
          approvalId,
          record.reservationId,
          'effect journal is UNCERTAIN; explicit reconciliation required',
          `journal:${operationKey}`
        )
      }
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'approval'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    if (
      existing?.state === 'EFFECT_STARTED' ||
      existing?.state === 'RESERVED'
    ) {
      // An in-flight journal attempt keeps its fence; never re-arm it.
      appendAudit('runtime.denied', {
        code: 'operation_in_progress',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_in_progress', decision)
      }
    }

    if (existing?.state === 'UNCERTAIN') {
      await this.markApprovalUncertain(
        input,
        approvalId,
        record.reservationId,
        'effect journal is UNCERTAIN; explicit reconciliation required',
        `journal:${operationKey}`
      )
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    if (existing === undefined && record.status === 'EXECUTING') {
      // The persisted key has no journal record although the approval reached
      // EXECUTING: ambiguous state, never re-armed by inference.
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'approval'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    // Allowed: a confirmed record (reserve replays it), a no-effect terminal
    // record (ABANDONED/EFFECT_FAILED) or an absent record plus a reservation
    // that never reached EXECUTING, all under the authoritative persisted key.
    // Only here may the journal reserve/re-arm.
    const attemptId = createDomainId('att')
    const expiresAt = new Date(
      clock().getTime() +
        (this.#options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS)
    ).toISOString()
    let outcome
    try {
      outcome = await effectJournal.reserve({
        tenantId: input.tenantId,
        operationKey,
        proposalHash,
        attemptId,
        expiresAt
      })
    } catch (error) {
      const code =
        error instanceof EffectJournalError ? error.code : 'journal_unavailable'
      appendAudit('runtime.denied', { code, phase: 'journal' })
      return { kind: 'result', result: finish('denied', code, decision) }
    }
    if (outcome.outcome === 'replay') {
      return {
        kind: 'result',
        result: await this.#finishReplay(
          input,
          record,
          outcome.record,
          decision,
          context
        )
      }
    }
    if (outcome.outcome === 'in_progress') {
      appendAudit('runtime.denied', {
        code: 'operation_in_progress',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_in_progress', decision)
      }
    }
    if (outcome.outcome === 'uncertain') {
      await this.markApprovalUncertain(
        input,
        approvalId,
        record.reservationId,
        'effect journal is UNCERTAIN; explicit reconciliation required',
        `journal:${operationKey}`
      )
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    const postRearmStop = context.stopDenial(decision)
    if (postRearmStop !== undefined) {
      try {
        await effectJournal.failEffect({
          tenantId: input.tenantId,
          operationKey,
          attemptId,
          errorCode: postRearmStop.reason
        })
      } catch {
        // The RESERVED record remains for the TTL sweep.
      }
      await this.releaseApproval(
        input,
        approvalId,
        record.reservationId,
        `journal:${operationKey}:turn_stop`
      )
      return { kind: 'result', result: postRearmStop }
    }

    const released = await this.releaseApproval(
      input,
      approvalId,
      record.reservationId,
      `journal:${operationKey}:rearmed`
    )
    if (!released) {
      appendAudit('runtime.denied', {
        code: 'already_reserved',
        phase: 'approval'
      })
      return {
        kind: 'result',
        result: finish('denied', 'already_reserved', decision)
      }
    }
    appendAudit('approval.released', {
      approvalId,
      code: 'journal_rearmed'
    })
    try {
      const reservation = await approvals.reserve({
        tenantId: input.tenantId,
        approvalId,
        action: input.action,
        resource: approvalResource(input),
        payload: record.proposalPayload,
        proposalHash,
        agentId: input.agentId,
        agentVersion: input.agentVersion,
        policyVersion: decision.policyVersion,
        capability: input.capability,
        operationKey,
        ttlMs: this.#options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS
      })
      appendAudit('approval.reserved', {
        approvalId,
        reservationId: reservation.reservationId,
        recovered: true
      })
      return { kind: 'reserved', reservation, attemptId }
    } catch (error) {
      const code =
        error instanceof ApprovalError ? error.code : 'approval_invalid'
      appendAudit('runtime.denied', { code, phase: 'approval' })
      return { kind: 'result', result: finish('denied', code, decision) }
    }
  }

  async reserveJournalEffect(
    input: GovernedTurnInput,
    record: ApprovalRecord,
    reservation: ApprovalReservation,
    operationKey: string,
    decision: PolicyDecision,
    context: ExecutionContext
  ): Promise<
    | { kind: 'ok'; attemptId: string }
    | { kind: 'result'; result: GovernedTurnResult }
  > {
    const journal = this.#options.effectJournal
    const { appendAudit, finish, clock } = context
    const approvalId = record.approvalId
    if (journal === undefined) {
      return { kind: 'ok', attemptId: '' }
    }
    const proposalHash = record.proposalHash
    if (proposalHash === undefined) {
      appendAudit('runtime.denied', { code: 'proposal_missing' })
      return {
        kind: 'result',
        result: finish('denied', 'proposal_missing', decision)
      }
    }

    const attemptId = createDomainId('att')
    const expiresAt = new Date(
      clock().getTime() +
        (this.#options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS)
    ).toISOString()
    let outcome
    try {
      outcome = await journal.reserve({
        tenantId: input.tenantId,
        operationKey,
        proposalHash,
        attemptId,
        expiresAt
      })
    } catch (error) {
      const code =
        error instanceof EffectJournalError ? error.code : 'journal_unavailable'
      await this.releaseApproval(
        input,
        approvalId,
        reservation.reservationId,
        `journal:${operationKey}:reserve_failed`
      )
      appendAudit('runtime.denied', { code, phase: 'journal' })
      return { kind: 'result', result: finish('denied', code, decision) }
    }
    if (outcome.outcome === 'replay') {
      return {
        kind: 'result',
        result: await this.#finishReplay(
          input,
          record,
          outcome.record,
          decision,
          context
        )
      }
    }
    if (outcome.outcome === 'in_progress') {
      await this.releaseApproval(
        input,
        approvalId,
        reservation.reservationId,
        `journal:${operationKey}:in_progress`
      )
      appendAudit('runtime.denied', {
        code: 'operation_in_progress',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_in_progress', decision)
      }
    }
    if (outcome.outcome === 'uncertain') {
      await this.markApprovalUncertain(
        input,
        approvalId,
        reservation.reservationId,
        'effect journal is UNCERTAIN; explicit reconciliation required',
        `journal:${operationKey}`
      )
      appendAudit('runtime.denied', {
        code: 'operation_uncertain',
        phase: 'journal'
      })
      return {
        kind: 'result',
        result: finish('denied', 'operation_uncertain', decision)
      }
    }

    const postReserveStop = context.stopDenial(decision)
    if (postReserveStop !== undefined) {
      try {
        await journal.failEffect({
          tenantId: input.tenantId,
          operationKey,
          attemptId,
          errorCode: postReserveStop.reason
        })
      } catch {
        // The RESERVED record remains for the TTL sweep.
      }
      await this.releaseApproval(
        input,
        approvalId,
        reservation.reservationId,
        `journal:${operationKey}:turn_stop`
      )
      return { kind: 'result', result: postReserveStop }
    }
    return { kind: 'ok', attemptId }
  }

  async releaseApproval(
    input: GovernedTurnInput,
    approvalId: string,
    reservationId: string,
    evidenceRef: string
  ): Promise<boolean> {
    try {
      await this.#options.approvals.release({
        tenantId: input.tenantId,
        approvalId,
        reservationId,
        evidence: { outcome: 'no_effect', source: 'journal', evidenceRef }
      })
      return true
    } catch {
      return false
    }
  }

  async markApprovalUncertain(
    input: GovernedTurnInput,
    approvalId: string,
    reservationId: string,
    reason: string,
    evidenceRef: string
  ): Promise<boolean> {
    try {
      await this.#options.approvals.markUncertain({
        tenantId: input.tenantId,
        approvalId,
        reservationId,
        reason,
        evidence: { outcome: 'unknown', reason: `${reason} [${evidenceRef}]` }
      })
      return true
    } catch {
      return false
    }
  }

  async markJournalUncertain(
    journal: EffectJournalPort,
    tenantId: string,
    operationKey: string,
    attemptId: string,
    reason: string
  ): Promise<void> {
    try {
      await journal.markUncertain({ tenantId, operationKey, attemptId, reason })
    } catch {
      // Best effort: the persisted EFFECT_STARTED record is swept to UNCERTAIN.
    }
  }
}
