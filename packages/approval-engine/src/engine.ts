import { createDomainId } from '@cvg/shared'
import {
  ApprovalRequestSchema,
  ApprovalReserveSchema,
  EffectEvidenceSchema,
  approvalMatchesAction,
  computeApprovalPayloadHash,
  type ApprovalRecord,
  type ApprovalRequestInput,
  type ApprovalReservation,
  type ApprovalReserveInput,
  type ApprovalResource,
  type EffectEvidence
} from './contracts.ts'
import { InMemoryApprovalStore, type ApprovalStore } from './store.ts'

export const ApprovalErrorCodes = {
  not_found: 'not_found',
  invalid_state: 'invalid_state',
  tenant_mismatch: 'tenant_mismatch',
  action_mismatch: 'action_mismatch',
  payload_mismatch: 'payload_mismatch',
  proposal_mismatch: 'proposal_mismatch',
  expired: 'expired',
  already_executed: 'already_executed',
  already_reserved: 'already_reserved',
  reservation_expired: 'reservation_expired',
  reservation_mismatch: 'reservation_mismatch',
  reservation_reused: 'reservation_reused',
  uncertain: 'uncertain',
  invalid_proof: 'invalid_proof',
  self_approval_denied: 'self_approval_denied',
  not_authorized: 'not_authorized',
  invalid_request: 'invalid_request'
} as const

export type ApprovalErrorCode =
  (typeof ApprovalErrorCodes)[keyof typeof ApprovalErrorCodes]

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode

  constructor(code: ApprovalErrorCode, message: string) {
    super(message)
    this.name = 'ApprovalError'
    this.code = code
  }
}

export type ApprovalEventType =
  | 'approval.requested'
  | 'approval.pending'
  | 'approval.approved'
  | 'approval.rejected'
  | 'approval.expired'
  | 'approval.cancelled'
  | 'approval.reserved'
  | 'approval.executing'
  | 'approval.released'
  | 'approval.failed'
  | 'approval.uncertain'
  | 'approval.reconciled'
  | 'approval.executed'
  | 'approval.denied'

export interface ApprovalEvent {
  type: ApprovalEventType
  approvalId: string
  tenantId: string
  correlationId: string
  actorId?: string
  detail?: string
  reservationId?: string
}

export interface ApprovalEngineOptions {
  store?: ApprovalStore
  clock?: () => Date
  idFactory?: () => string
  defaultExpiryMs?: number
  reservationTtlMs?: number
  allowSelfApproval?: boolean
  onEvent?: (event: ApprovalEvent) => void
}

export interface ApprovalConsumption {
  approvalId: string
  tenantId: string
  action: string
  payloadHash: string
  executedAt: string
  executionRef?: string
}

const DEFAULT_EXPIRY_MS = 15 * 60 * 1000
const DEFAULT_RESERVATION_TTL_MS = 60 * 1000
const MAX_RESERVATION_HISTORY = 64

class ReservationGenerationConflict extends Error {}

/**
 * Cryptographically bound, single-use, expiring approval engine.
 *
 * An approval for action A can never execute action B: the approval stores a
 * SHA-256 hash of the canonical action payload and every execution re-derives
 * and compares the hash before consuming the approval.
 */
export class ApprovalEngine {
  readonly #store: ApprovalStore
  readonly #clock: () => Date
  readonly #idFactory: () => string
  readonly #defaultExpiryMs: number
  readonly #reservationTtlMs: number
  readonly #allowSelfApproval: boolean
  readonly #onEvent?: (event: ApprovalEvent) => void

  constructor(options: ApprovalEngineOptions = {}) {
    this.#store = options.store ?? new InMemoryApprovalStore()
    this.#clock = options.clock ?? (() => new Date())
    this.#idFactory = options.idFactory ?? (() => createDomainId('appr'))
    this.#defaultExpiryMs = options.defaultExpiryMs ?? DEFAULT_EXPIRY_MS
    this.#reservationTtlMs =
      options.reservationTtlMs ?? DEFAULT_RESERVATION_TTL_MS
    this.#allowSelfApproval = options.allowSelfApproval ?? false
    if (options.onEvent) this.#onEvent = options.onEvent
  }

  request(input: ApprovalRequestInput): ApprovalRecord {
    const parsed = ApprovalRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new ApprovalError(
        'invalid_request',
        'Approval request failed schema validation'
      )
    }
    const request = parsed.data
    const now = this.#clock()
    const record: ApprovalRecord = {
      approvalId: this.#idFactory(),
      tenantId: request.tenantId,
      operatorId: request.operatorId,
      agentId: request.agentId,
      agentVersion: request.agentVersion,
      action: request.action,
      resource: request.resource,
      payloadHash: computeApprovalPayloadHash({
        action: request.action,
        resource: request.resource,
        payload: request.payload
      }),
      policyVersion: request.policyVersion,
      ...(request.promptVersion !== undefined
        ? { promptVersion: request.promptVersion }
        : {}),
      correlationId: request.correlationId,
      ...(request.executionRef !== undefined
        ? { executionRef: request.executionRef }
        : {}),
      status: 'REQUESTED',
      singleUse: request.singleUse ?? true,
      requestedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + (request.expiresInMs ?? this.#defaultExpiryMs)
      ).toISOString(),
      executionCount: 0,
      ...(request.reason !== undefined
        ? { decisionReason: request.reason }
        : {}),
      ...(request.operationKey !== undefined
        ? { operationKey: request.operationKey }
        : {}),
      ...(request.proposalId !== undefined
        ? { proposalId: request.proposalId }
        : {}),
      ...(request.proposalHash !== undefined
        ? { proposalHash: request.proposalHash }
        : {}),
      ...(request.capability !== undefined
        ? { capability: request.capability }
        : {}),
      ...(request.dataClassification !== undefined
        ? { dataClassification: request.dataClassification }
        : {}),
      ...(request.proposalPayload !== undefined
        ? { proposalPayload: cloneValue(request.proposalPayload) }
        : {})
    }
    this.#store.insert(record)
    this.#emit({
      type: 'approval.requested',
      approvalId: record.approvalId,
      tenantId: record.tenantId,
      correlationId: record.correlationId,
      actorId: record.operatorId
    })
    return cloneRecord(record)
  }

  submit(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): ApprovalRecord {
    const record = this.#require(tenantId, approvalId)
    if (record.operatorId !== actorId) {
      throw new ApprovalError(
        'not_authorized',
        'Only the requesting operator can submit this approval'
      )
    }
    this.#assertNotExpired(record)
    const updated = this.#store.update(
      tenantId,
      approvalId,
      'REQUESTED',
      (current) => ({ ...current, status: 'PENDING' })
    )
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not in REQUESTED state'
      )
    }
    this.#emit({
      type: 'approval.pending',
      approvalId,
      tenantId,
      correlationId: updated.correlationId,
      actorId
    })
    return cloneRecord(updated)
  }

  approve(
    tenantId: string,
    approvalId: string,
    input: { approverId: string; reason?: string }
  ): ApprovalRecord {
    const record = this.#require(tenantId, approvalId)
    this.#assertNotExpired(record)
    if (!this.#allowSelfApproval && record.operatorId === input.approverId) {
      throw new ApprovalError(
        'self_approval_denied',
        'The requesting operator cannot approve their own action'
      )
    }
    const updated = this.#store.update(
      tenantId,
      approvalId,
      'PENDING',
      (current) => ({
        ...current,
        status: 'APPROVED',
        approverId: input.approverId,
        approvedAt: this.#clock().toISOString(),
        ...(input.reason !== undefined ? { decisionReason: input.reason } : {})
      })
    )
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not in PENDING state'
      )
    }
    this.#emit({
      type: 'approval.approved',
      approvalId,
      tenantId,
      correlationId: updated.correlationId,
      actorId: input.approverId
    })
    return cloneRecord(updated)
  }

  reject(
    tenantId: string,
    approvalId: string,
    input: { approverId: string; reason?: string }
  ): ApprovalRecord {
    const record = this.#require(tenantId, approvalId)
    this.#assertNotExpired(record)
    const updated = this.#store.update(
      tenantId,
      approvalId,
      'PENDING',
      (current) => ({
        ...current,
        status: 'REJECTED',
        approverId: input.approverId,
        rejectedAt: this.#clock().toISOString(),
        ...(input.reason !== undefined ? { decisionReason: input.reason } : {})
      })
    )
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not in PENDING state'
      )
    }
    this.#emit({
      type: 'approval.rejected',
      approvalId,
      tenantId,
      correlationId: updated.correlationId,
      actorId: input.approverId
    })
    return cloneRecord(updated)
  }

  cancel(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): ApprovalRecord {
    const record = this.#require(tenantId, approvalId)
    if (record.operatorId !== actorId) {
      throw new ApprovalError(
        'not_authorized',
        'Only the requesting operator can cancel this approval'
      )
    }
    let updated = this.#store.update(
      tenantId,
      approvalId,
      'REQUESTED',
      (current) => ({
        ...current,
        status: 'CANCELLED',
        cancelledAt: this.#clock().toISOString()
      })
    )
    if (!updated) {
      updated = this.#store.update(
        tenantId,
        approvalId,
        'PENDING',
        (current) => ({
          ...current,
          status: 'CANCELLED',
          cancelledAt: this.#clock().toISOString()
        })
      )
    }
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Only REQUESTED or PENDING approvals can be cancelled'
      )
    }
    this.#emit({
      type: 'approval.cancelled',
      approvalId,
      tenantId,
      correlationId: updated.correlationId,
      actorId
    })
    return cloneRecord(updated)
  }

  verifyAndConsume(input: {
    tenantId: string
    approvalId: string
    action: string
    resource: ApprovalResource
    payload: unknown
    executionRef?: string
  }): ApprovalConsumption {
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status === 'EXPIRED') {
      throw new ApprovalError('expired', 'Approval expired')
    }
    if (record.status === 'EXECUTED' && record.singleUse) {
      throw new ApprovalError(
        'already_executed',
        'Approval is single-use and was already executed'
      )
    }
    this.#assertNotExpired(record)
    if (record.status !== 'APPROVED' && record.status !== 'EXECUTED') {
      throw new ApprovalError('invalid_state', 'Approval is not APPROVED')
    }
    const candidate = {
      action: input.action,
      resource: input.resource,
      payload: input.payload
    }
    if (
      record.action !== candidate.action ||
      record.resource.type !== candidate.resource.type ||
      (record.resource.id ?? null) !== (candidate.resource.id ?? null)
    ) {
      throw new ApprovalError(
        'action_mismatch',
        'Approval is bound to a different action or resource'
      )
    }
    if (!approvalMatchesAction(record, candidate)) {
      throw new ApprovalError(
        'payload_mismatch',
        'Action payload does not match the approved payload hash'
      )
    }

    let updated: ApprovalRecord | undefined
    if (record.singleUse) {
      updated = this.#store.update(
        input.tenantId,
        input.approvalId,
        'APPROVED',
        (current) => ({
          ...current,
          status: 'EXECUTED',
          executedAt: this.#clock().toISOString(),
          executionCount: current.executionCount + 1,
          ...(input.executionRef !== undefined
            ? { executionRef: input.executionRef }
            : {})
        })
      )
      if (!updated) {
        throw new ApprovalError(
          'already_executed',
          'Approval was consumed concurrently'
        )
      }
    } else {
      updated = this.#store.update(
        input.tenantId,
        input.approvalId,
        'APPROVED',
        (current) => ({
          ...current,
          executionCount: current.executionCount + 1,
          executedAt: this.#clock().toISOString(),
          ...(input.executionRef !== undefined
            ? { executionRef: input.executionRef }
            : {})
        })
      )
      if (!updated) {
        throw new ApprovalError('invalid_state', 'Approval is not APPROVED')
      }
    }

    const consumedAt = updated.executedAt ?? this.#clock().toISOString()
    this.#emit({
      type: 'approval.executed',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      ...(input.executionRef !== undefined
        ? { actorId: input.executionRef }
        : {})
    })
    return {
      approvalId: updated.approvalId,
      tenantId: updated.tenantId,
      action: updated.action,
      payloadHash: updated.payloadHash,
      executedAt: consumedAt,
      ...(updated.executionRef !== undefined
        ? { executionRef: updated.executionRef }
        : {})
    }
  }

  /**
   * Reserves an approved request without executing the effect. Only
   * confirm(executionRef, effect_confirmed evidence) can reach EXECUTED.
   */
  reserve(input: ApprovalReserveInput): ApprovalReservation {
    const parsed = ApprovalReserveSchema.safeParse(input)
    if (!parsed.success) {
      throw new ApprovalError(
        'invalid_request',
        'Reservation request failed schema validation'
      )
    }
    const request = parsed.data
    const record = this.#require(request.tenantId, request.approvalId)
    this.#validateBinding(record, request)
    if (
      request.operationKey !== undefined &&
      record.operationKey !== undefined &&
      request.operationKey !== record.operationKey
    ) {
      throw new ApprovalError(
        'proposal_mismatch',
        'Operation key diverges from the persisted reservation identity'
      )
    }

    if (record.status === 'RESERVED' || record.status === 'EXECUTING') {
      if (
        request.reservationId !== undefined &&
        record.reservationId === request.reservationId &&
        !this.#reservationExpired(record)
      ) {
        return this.#toReservation(record)
      }
      throw new ApprovalError(
        'already_reserved',
        'Approval already has an active reservation'
      )
    }
    if (record.status === 'UNCERTAIN') {
      throw new ApprovalError(
        'uncertain',
        'Approval is UNCERTAIN and requires explicit reconciliation'
      )
    }
    if (record.status === 'EXECUTED' || record.status === 'FAILED') {
      throw new ApprovalError(
        'invalid_state',
        'Approval is terminal and cannot be reserved again'
      )
    }
    if (record.status !== 'APPROVED') {
      throw new ApprovalError('invalid_state', 'Approval is not APPROVED')
    }
    this.#assertNotExpired(record)

    const now = this.#clock()
    const ttlMs = request.ttlMs ?? this.#reservationTtlMs
    const history = record.usedReservationIds ?? []
    if (request.reservationId !== undefined) {
      if (
        history.includes(request.reservationId) ||
        history.length >= MAX_RESERVATION_HISTORY
      ) {
        throw new ApprovalError(
          'reservation_reused',
          'Reservation token was already used by a previous generation'
        )
      }
    }
    const reservationId = request.reservationId ?? createDomainId('rsv')
    const generation = (record.reservationGeneration ?? 0) + 1
    const usedReservationIds = [...history, reservationId]
    const effectiveOperationKey = request.operationKey ?? record.operationKey
    const updated = this.#store.update(
      request.tenantId,
      request.approvalId,
      'APPROVED',
      (current) => ({
        ...current,
        status: 'RESERVED',
        reservationId,
        reservationOwner: request.ownerId ?? current.operatorId,
        reservationGeneration: generation,
        usedReservationIds,
        reservedAt: now.toISOString(),
        reservationExpiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        ...(effectiveOperationKey !== undefined
          ? { operationKey: effectiveOperationKey }
          : {})
      })
    )
    if (!updated) {
      throw new ApprovalError(
        'already_reserved',
        'Approval was reserved concurrently'
      )
    }
    this.#emit({
      type: 'approval.reserved',
      approvalId: request.approvalId,
      tenantId: request.tenantId,
      correlationId: updated.correlationId,
      reservationId,
      ...(request.ownerId !== undefined ? { actorId: request.ownerId } : {})
    })
    return this.#toReservation(updated)
  }

  markExecuting(input: {
    tenantId: string
    approvalId: string
    reservationId: string
  }): ApprovalRecord {
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status !== 'RESERVED') {
      if (
        record.status === 'EXECUTING' &&
        record.reservationId !== undefined &&
        input.reservationId !== record.reservationId
      ) {
        throw new ApprovalError(
          'reservation_mismatch',
          'Reservation token does not match the active reservation'
        )
      }
      throw new ApprovalError(
        'invalid_state',
        'Approval is not in RESERVED state'
      )
    }
    this.#assertReservation(record, input.reservationId)
    const now = this.#clock()
    const updated = this.#casReservation(record, (current) => ({
      ...current,
      status: 'EXECUTING',
      executingAt: now.toISOString()
    }))
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval changed while marking EXECUTING'
      )
    }
    this.#emit({
      type: 'approval.executing',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      reservationId: input.reservationId
    })
    return cloneRecord(updated)
  }

  confirm(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalRecord {
    const parsedEvidence = EffectEvidenceSchema.safeParse(input.evidence)
    if (
      !parsedEvidence.success ||
      parsedEvidence.data.outcome !== 'effect_confirmed'
    ) {
      throw new ApprovalError(
        'invalid_proof',
        'Confirmation requires effect_confirmed evidence with an executionRef'
      )
    }
    const evidence = parsedEvidence.data
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status === 'EXECUTED') {
      if (
        record.reservationId === input.reservationId &&
        record.executionRef === evidence.executionRef
      ) {
        return cloneRecord(record)
      }
      throw new ApprovalError(
        'already_executed',
        'Approval was already executed'
      )
    }
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not reserved or executing'
      )
    }
    this.#assertReservationToken(record, input.reservationId)
    const now = this.#clock()
    const updated = this.#casReservation(record, (current) => ({
      ...current,
      status: 'EXECUTED',
      executionCount: current.executionCount + 1,
      executedAt: now.toISOString(),
      confirmedAt: now.toISOString(),
      executionRef: evidence.executionRef,
      confirmationEvidenceRef: evidence.evidenceRef
    }))
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval changed while confirming'
      )
    }
    this.#emit({
      type: 'approval.executed',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      reservationId: input.reservationId,
      ...(evidence.evidenceRef !== undefined
        ? { actorId: evidence.evidenceRef }
        : {})
    })
    return cloneRecord(updated)
  }

  release(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalRecord {
    const evidence = this.#requireAbsenceEvidence(input.evidence)
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not reserved or executing'
      )
    }
    this.#assertReservationToken(record, input.reservationId)
    const now = this.#clock()
    const updated = this.#casReservation(record, (current) => ({
      ...clearReservation(current),
      status: 'APPROVED',
      releasedAt: now.toISOString()
    }))
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval changed while releasing'
      )
    }
    this.#emit({
      type: 'approval.released',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      reservationId: input.reservationId,
      detail: evidence.evidenceRef
    })
    return cloneRecord(updated)
  }

  fail(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalRecord {
    const evidence = this.#requireAbsenceEvidence(input.evidence)
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not reserved or executing'
      )
    }
    this.#assertReservationToken(record, input.reservationId)
    const now = this.#clock()
    const updated = this.#casReservation(record, (current) => ({
      ...current,
      status: 'FAILED',
      failedAt: now.toISOString(),
      confirmationEvidenceRef: evidence.evidenceRef
    }))
    if (!updated) {
      throw new ApprovalError('invalid_state', 'Approval changed while failing')
    }
    this.#emit({
      type: 'approval.failed',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      reservationId: input.reservationId,
      detail: evidence.evidenceRef
    })
    return cloneRecord(updated)
  }

  markUncertain(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    reason: string
    evidence?: EffectEvidence
  }): ApprovalRecord {
    if (input.reason.trim().length === 0) {
      throw new ApprovalError(
        'invalid_request',
        'Uncertainty requires an explicit reason'
      )
    }
    if (input.evidence !== undefined) {
      const parsed = EffectEvidenceSchema.safeParse(input.evidence)
      if (!parsed.success || parsed.data.outcome === 'effect_confirmed') {
        throw new ApprovalError(
          'invalid_proof',
          'Confirmed evidence must use confirm, not markUncertain'
        )
      }
    }
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') {
      throw new ApprovalError(
        'invalid_state',
        'Approval is not reserved or executing'
      )
    }
    this.#assertReservationToken(record, input.reservationId)
    const now = this.#clock()
    const updated = this.#casReservation(record, (current) => ({
      ...current,
      status: 'UNCERTAIN',
      uncertainAt: now.toISOString(),
      decisionReason: input.reason
    }))
    if (!updated) {
      throw new ApprovalError(
        'invalid_state',
        'Approval changed while marking UNCERTAIN'
      )
    }
    this.#emit({
      type: 'approval.uncertain',
      approvalId: input.approvalId,
      tenantId: input.tenantId,
      correlationId: updated.correlationId,
      reservationId: input.reservationId,
      detail: input.reason
    })
    return cloneRecord(updated)
  }

  reconcile(input: {
    tenantId: string
    approvalId: string
    actorId: string
    evidence: EffectEvidence
  }): ApprovalRecord {
    if (input.actorId.trim().length === 0) {
      throw new ApprovalError(
        'invalid_request',
        'Reconciliation requires an accountable actor'
      )
    }
    const parsed = EffectEvidenceSchema.safeParse(input.evidence)
    if (!parsed.success) {
      throw new ApprovalError(
        'invalid_proof',
        'Reconciliation requires typed effect evidence'
      )
    }
    const evidence = parsed.data
    const record = this.#require(input.tenantId, input.approvalId)
    if (record.status !== 'UNCERTAIN') {
      throw new ApprovalError(
        'invalid_state',
        'Only UNCERTAIN approvals can be reconciled'
      )
    }
    const now = this.#clock()
    if (evidence.outcome === 'effect_confirmed') {
      const updated = this.#casReservation(record, (current) => ({
        ...current,
        status: 'EXECUTED',
        executionCount: current.executionCount + 1,
        executedAt: now.toISOString(),
        confirmedAt: now.toISOString(),
        executionRef: evidence.executionRef,
        confirmationEvidenceRef: evidence.evidenceRef
      }))
      if (!updated) {
        throw new ApprovalError(
          'invalid_state',
          'Approval changed while reconciling'
        )
      }
      this.#emit({
        type: 'approval.reconciled',
        approvalId: input.approvalId,
        tenantId: input.tenantId,
        correlationId: updated.correlationId,
        actorId: input.actorId,
        detail: evidence.evidenceRef,
        ...(updated.reservationId !== undefined
          ? { reservationId: updated.reservationId }
          : {})
      })
      return cloneRecord(updated)
    }
    if (evidence.outcome === 'no_effect') {
      const updated = this.#casReservation(record, (current) => ({
        ...current,
        status: 'FAILED',
        failedAt: now.toISOString(),
        confirmationEvidenceRef: evidence.evidenceRef
      }))
      if (!updated) {
        throw new ApprovalError(
          'invalid_state',
          'Approval changed while reconciling'
        )
      }
      this.#emit({
        type: 'approval.reconciled',
        approvalId: input.approvalId,
        tenantId: input.tenantId,
        correlationId: updated.correlationId,
        actorId: input.actorId,
        detail: evidence.evidenceRef,
        ...(updated.reservationId !== undefined
          ? { reservationId: updated.reservationId }
          : {})
      })
      return cloneRecord(updated)
    }
    throw new ApprovalError(
      'invalid_proof',
      'Ambiguous evidence cannot close an UNCERTAIN approval'
    )
  }

  /**
   * TTL recovery sweep. It never executes an effect: explicit `no_effect`
   * evidence returns the approval to APPROVED; anything else (missing,
   * ambiguous or throwing evidence) keeps an honest UNCERTAIN state.
   */
  releaseExpired(input: {
    tenantId: string
    now?: Date
    ttlMs?: number
    evidenceFor: (record: ApprovalRecord) => EffectEvidence | undefined
  }): { released: number; uncertain: number } {
    const now = input.now ?? this.#clock()
    let released = 0
    let uncertain = 0
    const records = this.#store.list({ tenantId: input.tenantId })
    for (const record of records) {
      if (record.status !== 'RESERVED' && record.status !== 'EXECUTING') {
        continue
      }
      if (record.reservationExpiresAt === undefined) continue
      if (Date.parse(record.reservationExpiresAt) > now.getTime()) continue

      let evidence: EffectEvidence | undefined
      try {
        evidence = input.evidenceFor(cloneRecord(record))
      } catch {
        evidence = undefined
      }
      const parsed =
        evidence === undefined
          ? undefined
          : EffectEvidenceSchema.safeParse(evidence)

      if (parsed?.success && parsed.data.outcome === 'no_effect') {
        const updated = this.#casReservation(record, (current) => ({
          ...clearReservation(current),
          status: 'APPROVED',
          releasedAt: now.toISOString()
        }))
        if (updated) {
          released += 1
          this.#emit({
            type: 'approval.released',
            approvalId: record.approvalId,
            tenantId: record.tenantId,
            correlationId: updated.correlationId,
            ...(record.reservationId !== undefined
              ? { reservationId: record.reservationId }
              : {}),
            detail: parsed.data.evidenceRef
          })
        }
        continue
      }

      const updated = this.#casReservation(record, (current) => ({
        ...current,
        status: 'UNCERTAIN',
        uncertainAt: now.toISOString(),
        decisionReason:
          parsed?.success && parsed.data.outcome === 'unknown'
            ? parsed.data.reason
            : 'reservation expired without explicit no-effect proof'
      }))
      if (updated) {
        uncertain += 1
        this.#emit({
          type: 'approval.uncertain',
          approvalId: record.approvalId,
          tenantId: record.tenantId,
          correlationId: updated.correlationId,
          ...(record.reservationId !== undefined
            ? { reservationId: record.reservationId }
            : {}),
          detail: 'ttl_expired'
        })
      }
    }
    return { released, uncertain }
  }

  #validateBinding(
    record: ApprovalRecord,
    request: {
      action: string
      resource: ApprovalResource
      payload?: unknown
      proposalHash?: string | undefined
      agentId?: string | undefined
      agentVersion?: string | undefined
      policyVersion?: string | undefined
      capability?: string | undefined
    }
  ): void {
    if (
      record.action !== request.action ||
      record.resource.type !== request.resource.type ||
      (record.resource.id ?? null) !== (request.resource.id ?? null)
    ) {
      throw new ApprovalError(
        'action_mismatch',
        'Approval is bound to a different action or resource'
      )
    }
    if (request.payload !== undefined) {
      if (
        !approvalMatchesAction(record, {
          action: request.action,
          resource: request.resource,
          payload: request.payload
        })
      ) {
        throw new ApprovalError(
          'payload_mismatch',
          'Action payload does not match the approved payload hash'
        )
      }
    } else if (request.proposalHash === undefined) {
      throw new ApprovalError(
        'invalid_request',
        'Reservation requires the payload or the approved proposalHash'
      )
    }
    if (request.proposalHash !== undefined) {
      if (
        record.proposalHash === undefined ||
        record.proposalHash !== request.proposalHash
      ) {
        throw new ApprovalError(
          'proposal_mismatch',
          'Proposal hash does not match the approved proposal'
        )
      }
    }
    if (request.agentId !== undefined && request.agentId !== record.agentId) {
      throw new ApprovalError(
        'proposal_mismatch',
        'Agent diverges from the approved proposal'
      )
    }
    if (
      request.agentVersion !== undefined &&
      request.agentVersion !== record.agentVersion
    ) {
      throw new ApprovalError(
        'proposal_mismatch',
        'Agent version diverges from the approved proposal'
      )
    }
    if (
      request.policyVersion !== undefined &&
      request.policyVersion !== record.policyVersion
    ) {
      throw new ApprovalError(
        'proposal_mismatch',
        'Policy version diverges from the approved proposal'
      )
    }
    if (
      request.capability !== undefined &&
      record.capability !== undefined &&
      request.capability !== record.capability
    ) {
      throw new ApprovalError(
        'proposal_mismatch',
        'Capability diverges from the approved proposal'
      )
    }
  }

  #assertReservation(record: ApprovalRecord, reservationId: string): void {
    this.#assertReservationToken(record, reservationId)
    if (this.#reservationExpired(record)) {
      throw new ApprovalError(
        'reservation_expired',
        'Reservation TTL expired; sweep or reconcile is required'
      )
    }
  }

  #assertReservationToken(record: ApprovalRecord, reservationId: string): void {
    if (
      record.reservationId === undefined ||
      record.reservationId !== reservationId
    ) {
      throw new ApprovalError(
        'reservation_mismatch',
        'Reservation token does not match the active reservation'
      )
    }
  }

  #reservationExpired(record: ApprovalRecord): boolean {
    if (record.reservationExpiresAt === undefined) return false
    return Date.parse(record.reservationExpiresAt) <= this.#clock().getTime()
  }

  /**
   * Compare-and-set a reservation mutation against the captured generation.
   * The identity/generation check runs inside the store update callback, at the
   * mutation point, so a reentrant callback (for example during the TTL sweep)
   * cannot apply stale evidence to a newer reservation.
   */
  #casReservation(
    record: ApprovalRecord,
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined {
    try {
      return this.#store.update(
        record.tenantId,
        record.approvalId,
        record.status,
        (current) => {
          if (
            current.reservationId !== record.reservationId ||
            current.reservationGeneration !== record.reservationGeneration
          ) {
            throw new ReservationGenerationConflict()
          }
          return update(current)
        }
      )
    } catch (error) {
      if (error instanceof ReservationGenerationConflict) return undefined
      throw error
    }
  }

  #toReservation(record: ApprovalRecord): ApprovalReservation {
    if (
      record.reservationId === undefined ||
      record.reservationOwner === undefined ||
      record.reservedAt === undefined ||
      record.reservationExpiresAt === undefined
    ) {
      throw new ApprovalError(
        'invalid_state',
        'Approval has no durable reservation'
      )
    }
    return {
      approvalId: record.approvalId,
      tenantId: record.tenantId,
      reservationId: record.reservationId,
      reservationOwner: record.reservationOwner,
      reservedAt: record.reservedAt,
      reservationExpiresAt: record.reservationExpiresAt,
      action: record.action,
      resource: { ...record.resource },
      payloadHash: record.payloadHash,
      generation: record.reservationGeneration ?? 0,
      ...(record.proposalHash !== undefined
        ? { proposalHash: record.proposalHash }
        : {}),
      ...(record.operationKey !== undefined
        ? { operationKey: record.operationKey }
        : {})
    }
  }

  #requireAbsenceEvidence(
    evidence: EffectEvidence
  ): Extract<EffectEvidence, { outcome: 'no_effect' }> {
    const parsed = EffectEvidenceSchema.safeParse(evidence)
    if (!parsed.success || parsed.data.outcome !== 'no_effect') {
      throw new ApprovalError(
        'invalid_proof',
        'Release/fail requires explicit no_effect evidence'
      )
    }
    return parsed.data
  }

  expireStale(now: Date = this.#clock()): number {
    let expired = 0
    const candidates = this.#store.listExpiringBefore(now.toISOString(), [
      'REQUESTED',
      'PENDING',
      'APPROVED'
    ])
    for (const record of candidates) {
      const updated = this.#store.update(
        record.tenantId,
        record.approvalId,
        record.status,
        (current) => ({
          ...current,
          status: 'EXPIRED',
          expiredAt: now.toISOString()
        })
      )
      if (updated) {
        expired += 1
        this.#emit({
          type: 'approval.expired',
          approvalId: record.approvalId,
          tenantId: record.tenantId,
          correlationId: record.correlationId
        })
      }
    }
    return expired
  }

  list(tenantId: string, status?: ApprovalRecord['status']): ApprovalRecord[] {
    return this.#store
      .list({ tenantId, ...(status !== undefined ? { status } : {}) })
      .map(cloneRecord)
  }

  get(tenantId: string, approvalId: string): ApprovalRecord {
    return cloneRecord(this.#require(tenantId, approvalId))
  }

  #require(tenantId: string, approvalId: string): ApprovalRecord {
    const record = this.#store.get(tenantId, approvalId)
    if (!record) {
      throw new ApprovalError('not_found', 'Approval not found for this tenant')
    }
    return record
  }

  #assertNotExpired(record: ApprovalRecord): void {
    if (Date.parse(record.expiresAt) < this.#clock().getTime()) {
      this.#store.update(
        record.tenantId,
        record.approvalId,
        record.status,
        (current) => ({
          ...current,
          status: 'EXPIRED',
          expiredAt: this.#clock().toISOString()
        })
      )
      this.#emit({
        type: 'approval.expired',
        approvalId: record.approvalId,
        tenantId: record.tenantId,
        correlationId: record.correlationId
      })
      throw new ApprovalError('expired', 'Approval expired')
    }
  }

  #emit(event: ApprovalEvent): void {
    this.#onEvent?.(event)
  }
}

function clearReservation(record: ApprovalRecord): ApprovalRecord {
  const {
    reservationId: _reservationId,
    reservationOwner: _reservationOwner,
    reservationExpiresAt: _reservationExpiresAt,
    ...rest
  } = record
  void _reservationId
  void _reservationOwner
  void _reservationExpiresAt
  return rest
}

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as unknown
}

function cloneRecord(record: ApprovalRecord): ApprovalRecord {
  return {
    ...record,
    resource: { ...record.resource },
    ...(record.proposalPayload !== undefined
      ? { proposalPayload: cloneValue(record.proposalPayload) }
      : {}),
    ...(record.usedReservationIds !== undefined
      ? { usedReservationIds: [...record.usedReservationIds] }
      : {})
  }
}
