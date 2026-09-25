import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainError,
  IdempotencyKeySchema,
  sanitizeAuditEvidencePayload,
  sanitizeOutboxError,
  sanitizeOutboxPayload
} from '@cvg/shared'
import {
  TenantIdSchema,
  type AgentId,
  type AgentVersionId,
  type TenantId
} from '@cvg/platform'
import type { InMemoryDatabase } from './db.ts'
import { assertSameOutboxContent } from './outbox-content-hash.ts'
import type {
  AuditEventRecord,
  OutboxAttemptRecord,
  OutboxEffectRecord,
  OutboxEventRecord
} from './schema.ts'

export const DEFAULT_OUTBOX_ENVELOPE_VERSION = 1
export const DEFAULT_OUTBOX_MAX_ATTEMPTS = 5
export const DEFAULT_OUTBOX_LEASE_MS = 30_000
export const DEFAULT_OUTBOX_RETRY_BASE_MS = 1_000
export const DEFAULT_OUTBOX_RETRY_MAX_MS = 60_000
export const DEFAULT_OUTBOX_MAX_PAYLOAD_BYTES = 64 * 1024
export const OUTBOX_TAKEOVER_SUPPRESSED_ERROR =
  'human takeover active; automatic outbound suppressed'

export type OutboxClock = (() => Date) | { now(): Date }

export interface OutboxRepositoryOptions {
  /** The production repository owns the clock; tests inject a deterministic one. */
  clock?: OutboxClock
  /** Alias retained for deterministic fixtures. */
  now?: () => Date
  maxAttempts?: number
  leaseMs?: number
  retryBaseMs?: number
  retryMaxMs?: number
  backoffBaseMs?: number
  backoffMaxMs?: number
  maxPayloadBytes?: number
  /** A local audit hook may fail; repository operations roll back on failure. */
  auditWriter?: (event: AuditEventRecord) => void
}

export interface OutboxEnqueueInput {
  tenantId: TenantId
  type: string
  payload: unknown
  idempotencyKey: string
  correlationId?: string
  envelopeVersion?: number
  conversationId?: string | null
  sessionId?: string | null
  agentId?: AgentId | null
  agentVersionId?: AgentVersionId | null
  inboundMessageId?: string | null
  /** Test fixtures may provide a stable id; production callers normally omit it. */
  id?: string
  /** Alias accepted for envelope terminology. */
  eventId?: string
  /** Reserved for an intentional future migration/command. */
  parentEventId?: string | null
}

export interface OutboxClaimInput {
  tenantId: TenantId
  workerId: string
  /** Deprecated compatibility field; repository-owned time is authoritative. */
  now?: Date
  leaseMs?: number
  eventId?: string
}

export type OutboxEffect = (
  event: OutboxEventRecord
) => unknown | Promise<unknown>

export type OutboxTakeoverCheck = boolean | (() => boolean | Promise<boolean>)

export interface OutboxAckInput {
  tenantId: TenantId
  eventId: string
  workerId: string
  effect?: OutboxEffect
  /** Used only when the injected effect intentionally returns no value. */
  result?: unknown
  /** Rechecked by the adapter inside the ack boundary before any effect. */
  takeoverActive?: OutboxTakeoverCheck
  /** Deprecated compatibility field; repository-owned time is authoritative. */
  now?: Date
}

export interface OutboxFailInput {
  tenantId: TenantId
  eventId: string
  workerId: string
  error: unknown
  /** An unknown handler or equivalent failure is terminal by explicit policy. */
  terminal?: boolean
  /** Marks a terminal failure caused by human takeover; no effect may run. */
  handoff?: boolean
  /** Deprecated compatibility field; repository-owned time is authoritative. */
  now?: Date
}

export interface OutboxRequeueInput {
  tenantId: TenantId
  eventId: string
  operatorId: string
  correlationId: string
}

export interface DurableOutboxAdapter {
  enqueue(
    input: OutboxEnqueueInput,
    tx?: unknown
  ): OutboxEventRecord | Promise<OutboxEventRecord>
  claimNext(
    input: OutboxClaimInput
  ): OutboxEventRecord | null | Promise<OutboxEventRecord | null>
  ack(input: OutboxAckInput): OutboxEventRecord | Promise<OutboxEventRecord>
  fail(input: OutboxFailInput): OutboxEventRecord | Promise<OutboxEventRecord>
  requeueDeadLetter(
    input: OutboxRequeueInput
  ): OutboxEventRecord | Promise<OutboxEventRecord>
  /**
   * AUD19-004 — convergence read for redeliveries. Optional so existing
   * adapters keep compiling; callers that re-enqueue on a possibly-seen key
   * must converge through it when `enqueue` rejects a divergent repeat.
   */
  findByIdempotencyKey?(
    tenantId: TenantId,
    idempotencyKey: string
  ): OutboxEventRecord | null | Promise<OutboxEventRecord | null>
}

/**
 * Deterministic in-memory implementation of the durable outbox contract.
 *
 * It intentionally keeps state in `DatabaseState` so tests can inspect every
 * claim and effect. It does not pretend to provide process durability; the
 * PostgreSQL adapter owns that guarantee.
 */
export class OutboxRepository implements DurableOutboxAdapter {
  private readonly clock: OutboxClock
  private readonly maxAttempts: number
  private readonly leaseMs: number
  private readonly retryBaseMs: number
  private readonly retryMaxMs: number
  private readonly maxPayloadBytes: number
  private readonly auditWriter: ((event: AuditEventRecord) => void) | undefined

  constructor(
    private readonly db: InMemoryDatabase,
    options: OutboxRepositoryOptions = {}
  ) {
    this.clock = options.clock ?? options.now ?? (() => new Date())
    this.maxAttempts = positiveInteger(
      options.maxAttempts ?? DEFAULT_OUTBOX_MAX_ATTEMPTS,
      'maxAttempts'
    )
    this.leaseMs = positiveInteger(
      options.leaseMs ?? DEFAULT_OUTBOX_LEASE_MS,
      'leaseMs'
    )
    this.retryBaseMs = positiveInteger(
      options.retryBaseMs ??
        options.backoffBaseMs ??
        DEFAULT_OUTBOX_RETRY_BASE_MS,
      'retryBaseMs'
    )
    this.retryMaxMs = positiveInteger(
      options.retryMaxMs ?? options.backoffMaxMs ?? DEFAULT_OUTBOX_RETRY_MAX_MS,
      'retryMaxMs'
    )
    if (this.retryMaxMs < this.retryBaseMs) {
      throw new DomainError(
        'validation_failed',
        'retryMaxMs must be greater than or equal to retryBaseMs'
      )
    }
    this.maxPayloadBytes = positiveInteger(
      options.maxPayloadBytes ?? DEFAULT_OUTBOX_MAX_PAYLOAD_BYTES,
      'maxPayloadBytes'
    )
    this.auditWriter = options.auditWriter
    this.ensureStateCollections()
  }

  enqueue(type: string, payload: unknown): OutboxEventRecord
  enqueue(input: OutboxEnqueueInput, tx?: unknown): OutboxEventRecord
  enqueue(
    inputOrType: string | OutboxEnqueueInput,
    payloadOrTx?: unknown
  ): OutboxEventRecord {
    if (typeof inputOrType === 'string') {
      return this.enqueueLegacy(inputOrType, payloadOrTx)
    }

    const tenantId = requireTenant(inputOrType.tenantId)
    const idempotencyKey = requireIdempotencyKey(inputOrType.idempotencyKey)
    const type = requireEventType(inputOrType.type)
    const payload = validateAndRedactPayload(
      inputOrType.payload,
      this.maxPayloadBytes
    )
    const existing = this.db.state.outbox.find(
      (event) =>
        event.tenantId === tenantId && event.idempotencyKey === idempotencyKey
    )
    if (existing) {
      // AUD19-004: the same key with different content is rejected
      // fail-closed instead of silently returning the unrelated winner.
      assertSameOutboxContent(
        {
          tenantId: existing.tenantId ?? '',
          type: existing.type,
          envelopeVersion:
            existing.envelopeVersion ?? DEFAULT_OUTBOX_ENVELOPE_VERSION,
          payload: existing.payload
        },
        {
          tenantId,
          type,
          envelopeVersion:
            inputOrType.envelopeVersion ?? DEFAULT_OUTBOX_ENVELOPE_VERSION,
          payload
        },
        (message) => {
          throw new DomainError('conflict', message)
        }
      )
      return cloneEvent(existing)
    }

    const now = this.currentTime()
    const correlationId = inputOrType.correlationId
      ? requireCorrelationId(inputOrType.correlationId)
      : createCorrelationId()
    const id = inputOrType.id ?? inputOrType.eventId ?? createDomainId('outbox')
    if (!id.trim()) {
      throw new DomainError('validation_failed', 'Outbox event id is required')
    }
    const event: OutboxEventRecord = {
      id,
      type,
      payload,
      tenantId,
      correlationId,
      idempotencyKey,
      envelopeVersion:
        inputOrType.envelopeVersion ?? DEFAULT_OUTBOX_ENVELOPE_VERSION,
      conversationId: inputOrType.conversationId ?? null,
      sessionId: inputOrType.sessionId ?? null,
      agentId: inputOrType.agentId ?? null,
      agentVersionId: inputOrType.agentVersionId ?? null,
      inboundMessageId: inputOrType.inboundMessageId ?? null,
      status: 'pending',
      createdAt: now,
      availableAt: now,
      attempts: 0,
      leaseOwner: null,
      leaseUntil: null,
      lastError: null,
      processedAt: null,
      deadLetteredAt: null,
      parentEventId: inputOrType.parentEventId ?? null
    }
    this.db.state.outbox = [...this.db.state.outbox, cloneEvent(event)]
    return cloneEvent(event)
  }

  /** Lists only pending events for compatibility with the legacy repository. */
  pending(rawTenantId?: TenantId): OutboxEventRecord[] {
    const tenantId = rawTenantId ? requireTenant(rawTenantId) : undefined
    return this.db.state.outbox
      .filter(
        (event) =>
          event.status === 'pending' &&
          (!tenantId || event.tenantId === tenantId)
      )
      .map(cloneEvent)
  }

  findById(eventId: string, rawTenantId?: TenantId): OutboxEventRecord | null {
    const tenantId = rawTenantId ? requireTenant(rawTenantId) : undefined
    const event = this.db.state.outbox.find(
      (candidate) =>
        candidate.id === eventId &&
        (!tenantId || candidate.tenantId === tenantId)
    )
    return event ? cloneEvent(event) : null
  }

  /**
   * AUD19-004 — convergence read for redeliveries (see
   * `DurableOutboxAdapter.findByIdempotencyKey`).
   */
  findByIdempotencyKey(
    tenantId: TenantId,
    idempotencyKey: string
  ): OutboxEventRecord | null {
    const event = this.db.state.outbox.find(
      (candidate) =>
        candidate.tenantId === tenantId &&
        candidate.idempotencyKey === idempotencyKey
    )
    return event ? cloneEvent(event) : null
  }

  claimNext(input: OutboxClaimInput): OutboxEventRecord | null {
    const tenantId = requireTenant(input.tenantId)
    const workerId = requireActor(input.workerId, 'workerId')
    const now = this.currentTime()
    const leaseMs = positiveInteger(input.leaseMs ?? this.leaseMs, 'leaseMs')
    const candidate = this.db.state.outbox
      .filter((event) => {
        if (event.tenantId !== tenantId) return false
        if (input.eventId && event.id !== input.eventId) return false
        if (event.status === 'pending') {
          return (
            !event.availableAt || event.availableAt.getTime() <= now.getTime()
          )
        }
        if (event.status === 'failed') {
          return Boolean(
            event.availableAt && event.availableAt.getTime() <= now.getTime()
          )
        }
        return (
          event.status === 'processing' &&
          Boolean(
            event.leaseUntil && event.leaseUntil.getTime() <= now.getTime()
          )
        )
      })
      .sort((left, right) => eligibleAt(left) - eligibleAt(right))[0]

    if (!candidate) return null

    if (candidate.status === 'processing') {
      this.markExpiredClaim(candidate)
    }
    const attempts = Math.max(0, candidate.attempts ?? 0) + 1
    const claimed: OutboxEventRecord = {
      ...cloneEvent(candidate),
      status: 'processing',
      attempts,
      leaseOwner: workerId,
      leaseUntil: new Date(now.getTime() + leaseMs),
      lastError: null
    }
    this.replaceEvent(claimed)
    this.db.state.outboxAttempts = [
      ...this.db.state.outboxAttempts,
      {
        eventId: claimed.id,
        attempt: attempts,
        tenantId,
        workerId,
        claimedAt: new Date(now),
        outcome: 'claimed',
        error: null
      }
    ]
    return cloneEvent(claimed)
  }

  ack(input: OutboxAckInput): OutboxEventRecord | Promise<OutboxEventRecord> {
    const tenantId = requireTenant(input.tenantId)
    const workerId = requireActor(input.workerId, 'workerId')
    const now = this.currentTime()
    const current = this.requireOwnedEvent(
      tenantId,
      input.eventId,
      workerId,
      now
    )
    const key = requireEventIdempotencyKey(current)
    const journal = this.db.state.outboxEffects.find(
      (effect) => effect.tenantId === tenantId && effect.idempotencyKey === key
    )
    if (journal) {
      if (journal.eventId !== current.id) {
        throw new DomainError(
          'conflict',
          'Outbox effect journal points to another event'
        )
      }
      return this.commitAck(current, workerId, cloneValue(journal.result), now)
    }

    if (!input.effect && input.result === undefined) {
      throw new DomainError(
        'validation_failed',
        'A local effect or result is required before ack'
      )
    }
    const runAck = (
      takeoverActive: boolean
    ): OutboxEventRecord | Promise<OutboxEventRecord> => {
      if (takeoverActive) {
        return this.fail({
          tenantId,
          eventId: current.id,
          workerId,
          terminal: true,
          handoff: true,
          error: OUTBOX_TAKEOVER_SUPPRESSED_ERROR
        })
      }
      const effectResult = input.effect
        ? input.effect(cloneEvent(current))
        : input.result
      if (isPromiseLike(effectResult)) {
        return Promise.resolve(effectResult).then((value) =>
          this.commitAck(
            current,
            workerId,
            value === undefined && input.result !== undefined
              ? cloneValue(input.result)
              : cloneValue(value),
            this.currentTime()
          )
        )
      }
      return this.commitAck(
        current,
        workerId,
        effectResult === undefined && input.result !== undefined
          ? cloneValue(input.result)
          : cloneValue(effectResult),
        now
      )
    }
    const takeover = resolveTakeoverCheck(input.takeoverActive)
    if (isPromiseLike(takeover)) {
      return Promise.resolve(takeover).then(runAck)
    }
    return runAck(takeover)
  }

  fail(input: OutboxFailInput): OutboxEventRecord {
    const tenantId = requireTenant(input.tenantId)
    const workerId = requireActor(input.workerId, 'workerId')
    const now = this.currentTime()
    const current = this.requireOwnedEvent(
      tenantId,
      input.eventId,
      workerId,
      now
    )
    const attempts = Math.max(0, current.attempts ?? 0)
    const error = redactError(input.error)
    const handoff = input.handoff === true
    const deadLetter =
      handoff || Boolean(input.terminal) || attempts >= this.maxAttempts
    const snapshot = this.snapshot()

    try {
      const updated: OutboxEventRecord = {
        ...cloneEvent(current),
        status: deadLetter ? 'dead_letter' : 'failed',
        attempts,
        leaseOwner: null,
        leaseUntil: null,
        lastError: error,
        ...(deadLetter
          ? { deadLetteredAt: new Date(now) }
          : {
              availableAt: new Date(
                now.getTime() + this.retryDelayMs(attempts)
              ),
              deadLetteredAt: null
            })
      }
      if (deadLetter) delete updated.availableAt
      this.replaceEvent(updated)
      this.markAttemptOutcome(
        updated,
        workerId,
        handoff ? 'handoff' : deadLetter ? 'dead_letter' : 'failed',
        error
      )
      if (handoff) {
        this.markSessionForHandoff(updated, now)
        this.appendAudit(
          updated,
          'handoff',
          workerId,
          updated.correlationId ?? createCorrelationId(),
          {
            eventId: updated.id,
            ...(updated.sessionId ? { sessionId: updated.sessionId } : {}),
            ...(updated.conversationId
              ? { conversationId: updated.conversationId }
              : {}),
            status: updated.status,
            action: 'human_takeover',
            attempt: updated.attempts ?? 0,
            error
          },
          now
        )
      } else {
        this.appendTransitionAudit(
          updated,
          workerId,
          deadLetter ? 'dead_letter' : 'failed',
          error,
          now
        )
      }
      return cloneEvent(updated)
    } catch (error) {
      this.restore(snapshot)
      throw error
    }
  }

  requeueDeadLetter(input: OutboxRequeueInput): OutboxEventRecord {
    const tenantId = requireTenant(input.tenantId)
    const operatorId = requireActor(input.operatorId, 'operatorId')
    const correlationId = requireCorrelationId(input.correlationId)
    const current = this.db.state.outbox.find(
      (event) => event.id === input.eventId && event.tenantId === tenantId
    )
    if (!current) {
      throw new DomainError('not_found', 'Outbox event not found')
    }
    if (current.status !== 'dead_letter') {
      throw new DomainError(
        'conflict',
        'Only dead-letter events can be requeued'
      )
    }
    const now = this.currentTime()
    const snapshot = this.snapshot()
    const priorError = current.lastError ?? null
    const priorAttempts = Math.max(0, current.attempts ?? 0)
    try {
      const updated: OutboxEventRecord = {
        ...cloneEvent(current),
        status: 'pending',
        attempts: 0,
        availableAt: new Date(now),
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        deadLetteredAt: null
      }
      this.replaceEvent(updated)
      this.db.state.outboxAttempts = [
        ...this.db.state.outboxAttempts,
        {
          eventId: updated.id,
          attempt: priorAttempts,
          tenantId,
          workerId: operatorId,
          claimedAt: new Date(now),
          outcome: 'requeued',
          error: priorError
        }
      ]
      this.appendAudit(
        updated,
        'integration_event',
        operatorId,
        correlationId,
        {
          eventId: updated.id,
          status: 'pending',
          action: 'requeue_dead_letter',
          attempt: priorAttempts,
          error: priorError
        },
        now
      )
      return cloneEvent(updated)
    } catch (error) {
      this.restore(snapshot)
      throw error
    }
  }

  private enqueueLegacy(type: string, payload: unknown): OutboxEventRecord {
    const validType = requireEventType(type)
    const event: OutboxEventRecord = {
      id: createDomainId('outbox'),
      type: validType,
      payload: validateAndRedactPayload(payload, this.maxPayloadBytes),
      status: 'pending',
      createdAt: this.currentTime()
    }
    this.db.state.outbox = [...this.db.state.outbox, cloneEvent(event)]
    return cloneEvent(event)
  }

  private commitAck(
    current: OutboxEventRecord,
    workerId: string,
    result: unknown,
    now: Date
  ): OutboxEventRecord {
    const tenantId = requireTenant(current.tenantId)
    const owned = this.requireOwnedEvent(tenantId, current.id, workerId, now)
    const key = requireEventIdempotencyKey(owned)
    const snapshot = this.snapshot()
    try {
      const safeResult = validateAndRedactResult(result, this.maxPayloadBytes)
      const journal: OutboxEffectRecord = {
        tenantId,
        idempotencyKey: key,
        eventId: owned.id,
        result: safeResult,
        appliedAt: new Date(now)
      }
      const existing = this.db.state.outboxEffects.find(
        (effect) =>
          effect.tenantId === tenantId && effect.idempotencyKey === key
      )
      const persistedResult = existing
        ? validateAndRedactResult(existing.result, this.maxPayloadBytes)
        : safeResult
      if (existing) {
        this.db.state.outboxEffects = this.db.state.outboxEffects.map(
          (candidate) =>
            candidate === existing
              ? { ...candidate, result: persistedResult }
              : candidate
        )
      } else {
        this.db.state.outboxEffects = [...this.db.state.outboxEffects, journal]
      }
      const updated: OutboxEventRecord = {
        ...cloneEvent(owned),
        status: 'processed',
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        processedAt: new Date(now)
      }
      this.replaceEvent(updated)
      this.markAttemptOutcome(updated, workerId, 'processed', null)
      this.appendTransitionAudit(
        updated,
        workerId,
        'processed',
        null,
        now,
        persistedResult
      )
      return cloneEvent(updated)
    } catch (error) {
      this.restore(snapshot)
      throw error
    }
  }

  private requireOwnedEvent(
    tenantId: TenantId,
    eventId: string,
    workerId: string,
    now: Date
  ): OutboxEventRecord {
    const event = this.db.state.outbox.find(
      (candidate) => candidate.id === eventId
    )
    if (!event || event.tenantId !== tenantId) {
      throw new DomainError('forbidden', 'Outbox event is outside tenant scope')
    }
    if (event.status !== 'processing') {
      throw new DomainError(
        'conflict',
        `Outbox event is ${event.status}; processing ownership is required`
      )
    }
    if (event.leaseOwner !== workerId) {
      throw new DomainError(
        'conflict',
        'Outbox lease belongs to another worker'
      )
    }
    if (!event.leaseUntil || event.leaseUntil.getTime() <= now.getTime()) {
      throw new DomainError('conflict', 'Outbox lease has expired')
    }
    return event
  }

  private appendTransitionAudit(
    event: OutboxEventRecord,
    actorId: string,
    status: 'processed' | 'failed' | 'dead_letter',
    error: string | null,
    now: Date,
    result?: unknown
  ): void {
    this.appendAudit(
      event,
      'integration_event',
      actorId,
      event.correlationId ?? createCorrelationId(),
      {
        eventId: event.id,
        status,
        attempt: event.attempts ?? 0,
        ...(error ? { error } : {}),
        ...(status === 'processed' ? { result: summarizeResult(result) } : {})
      },
      now
    )
  }

  private markSessionForHandoff(event: OutboxEventRecord, now: Date): void {
    if (!event.sessionId) return
    const session = this.db.state.sessions.find(
      (candidate) => candidate.id === event.sessionId
    )
    if (!session) return
    const conversation = this.db.state.conversations.find(
      (candidate) => candidate.id === session.conversationId
    )
    if (!conversation || conversation.tenantId !== event.tenantId) {
      throw new DomainError(
        'forbidden',
        'Outbox session is outside the event tenant scope'
      )
    }
    const updatedSession =
      session.takeoverState === 'BOT_ACTIVE'
        ? {
            ...session,
            takeoverState: 'HANDOFF_REQUESTED' as const,
            updatedAt: new Date(now)
          }
        : session
    if (updatedSession !== session) {
      this.db.state.sessions = this.db.state.sessions.map((candidate) =>
        candidate.id === updatedSession.id ? updatedSession : candidate
      )
      this.db.state.conversations = this.db.state.conversations.map(
        (conversation) =>
          conversation.id === updatedSession.conversationId
            ? {
                ...conversation,
                status: 'waiting_human' as const,
                updatedAt: updatedSession.updatedAt
              }
            : conversation
      )
    }
  }

  private appendAudit(
    event: OutboxEventRecord,
    type: AuditEventRecord['type'],
    actorId: string,
    correlationId: string,
    payload: unknown,
    now: Date
  ): void {
    const tenantId = requireTenant(event.tenantId)
    const audit: AuditEventRecord = {
      id: createDomainId('audit'),
      tenantId,
      type,
      actorType: actorId.startsWith('op_') ? 'Operator' : 'System',
      actorId,
      correlationId,
      policyVersion: 'outbox-r2',
      payload: sanitizeAuditEvidencePayload(payload).payload,
      createdAt: new Date(now)
    }
    this.db.state.auditEvents = [...this.db.state.auditEvents, audit]
    this.auditWriter?.(cloneAudit(audit))
  }

  private markAttemptOutcome(
    event: OutboxEventRecord,
    workerId: string,
    outcome: OutboxAttemptRecord['outcome'],
    error: string | null
  ): void {
    for (
      let index = this.db.state.outboxAttempts.length - 1;
      index >= 0;
      index -= 1
    ) {
      const attempt = this.db.state.outboxAttempts[index]
      if (
        attempt &&
        attempt.eventId === event.id &&
        attempt.attempt === (event.attempts ?? 0) &&
        attempt.workerId === workerId &&
        attempt.outcome === 'claimed'
      ) {
        this.db.state.outboxAttempts = this.db.state.outboxAttempts.map(
          (candidate, candidateIndex) =>
            candidateIndex === index
              ? { ...candidate, outcome, error }
              : candidate
        )
        return
      }
    }
  }

  private markExpiredClaim(event: OutboxEventRecord): void {
    for (
      let index = this.db.state.outboxAttempts.length - 1;
      index >= 0;
      index -= 1
    ) {
      const attempt = this.db.state.outboxAttempts[index]
      if (
        attempt &&
        attempt.eventId === event.id &&
        attempt.attempt === (event.attempts ?? 0) &&
        attempt.outcome === 'claimed'
      ) {
        this.db.state.outboxAttempts = this.db.state.outboxAttempts.map(
          (candidate, candidateIndex) =>
            candidateIndex === index
              ? {
                  ...candidate,
                  outcome: 'lease_expired',
                  error: sanitizeOutboxError({ code: 'lease_expired' })
                }
              : candidate
        )
        return
      }
    }
  }

  private retryDelayMs(attempts: number): number {
    const exponent = Math.max(0, attempts - 1)
    return Math.min(this.retryMaxMs, this.retryBaseMs * 2 ** exponent)
  }

  private currentTime(): Date {
    const raw =
      typeof this.clock === 'function' ? this.clock() : this.clock.now()
    const time = new Date(raw)
    if (!Number.isFinite(time.getTime())) {
      throw new DomainError(
        'validation_failed',
        'Outbox clock returned an invalid date'
      )
    }
    return time
  }

  private replaceEvent(event: OutboxEventRecord): void {
    this.db.state.outbox = this.db.state.outbox.map((candidate) =>
      candidate.id === event.id ? cloneEvent(event) : candidate
    )
  }

  private ensureStateCollections(): void {
    this.db.state.outboxAttempts ??= []
    this.db.state.outboxEffects ??= []
  }

  private snapshot(): {
    conversations: import('./schema.ts').ConversationRecord[]
    sessions: import('./schema.ts').SessionRecord[]
    outbox: OutboxEventRecord[]
    attempts: OutboxAttemptRecord[]
    effects: OutboxEffectRecord[]
    auditEvents: AuditEventRecord[]
  } {
    return {
      conversations: this.db.state.conversations,
      sessions: this.db.state.sessions,
      outbox: this.db.state.outbox,
      attempts: this.db.state.outboxAttempts,
      effects: this.db.state.outboxEffects,
      auditEvents: this.db.state.auditEvents
    }
  }

  private restore(snapshot: ReturnType<OutboxRepository['snapshot']>): void {
    this.db.state.conversations = snapshot.conversations
    this.db.state.sessions = snapshot.sessions
    this.db.state.outbox = snapshot.outbox
    this.db.state.outboxAttempts = snapshot.attempts
    this.db.state.outboxEffects = snapshot.effects
    this.db.state.auditEvents = snapshot.auditEvents
  }
}

function requireTenant(rawTenantId: TenantId | undefined): TenantId {
  const parsed = TenantIdSchema.safeParse(rawTenantId)
  if (!parsed.success) {
    throw new DomainError('unauthorized', 'Tenant scope is required')
  }
  return parsed.data
}

function requireActor(rawActor: string, field: string): string {
  if (
    typeof rawActor !== 'string' ||
    !rawActor.trim() ||
    rawActor.length > 200
  ) {
    throw new DomainError('validation_failed', `${field} is invalid`)
  }
  return rawActor.trim()
}

function requireEventType(rawType: string): string {
  if (
    typeof rawType !== 'string' ||
    !/^[a-z][a-z0-9_.:-]{1,127}$/.test(rawType)
  ) {
    throw new DomainError('validation_failed', 'Outbox event type is invalid')
  }
  return rawType
}

function requireIdempotencyKey(rawKey: string): string {
  const parsed = IdempotencyKeySchema.safeParse(rawKey)
  if (!parsed.success) {
    throw new DomainError(
      'validation_failed',
      'Outbox idempotency key is invalid'
    )
  }
  return parsed.data
}

function requireCorrelationId(rawCorrelationId: string): string {
  const parsed = CorrelationIdSchema.safeParse(rawCorrelationId)
  if (!parsed.success) {
    throw new DomainError(
      'validation_failed',
      'Outbox correlation id is invalid'
    )
  }
  return parsed.data
}

function requireEventIdempotencyKey(event: OutboxEventRecord): string {
  if (!event.tenantId || !event.idempotencyKey) {
    throw new DomainError(
      'invalid_action',
      'Legacy outbox events cannot be acknowledged by the durable contract'
    )
  }
  return requireIdempotencyKey(event.idempotencyKey)
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DomainError(
      'validation_failed',
      `${field} must be a positive integer`
    )
  }
  return value
}

function validateAndRedactPayload(payload: unknown, maxBytes: number): unknown {
  if (payload === undefined) {
    throw new DomainError('validation_failed', 'Outbox payload is required')
  }
  return sanitizeAndValidateValue(payload, maxBytes, 'Outbox payload')
}

function validateAndRedactResult(result: unknown, maxBytes: number): unknown {
  return sanitizeAndValidateValue(result ?? null, maxBytes, 'Outbox result')
}

function sanitizeAndValidateValue(
  value: unknown,
  maxBytes: number,
  label: string
): unknown {
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    throw new DomainError('validation_failed', `${label} is not serializable`)
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new DomainError('payload_too_large', `${label} exceeds its limit`)
  }
  const sanitized = sanitizeOutboxPayload(value).payload
  const sanitizedSerialized = JSON.stringify(sanitized) ?? ''
  if (Buffer.byteLength(sanitizedSerialized, 'utf8') > maxBytes) {
    throw new DomainError(
      'payload_too_large',
      `Sanitized ${label.toLowerCase()} exceeds its limit`
    )
  }
  return sanitized
}

function redactError(error: unknown): string {
  if (error === OUTBOX_TAKEOVER_SUPPRESSED_ERROR) {
    return OUTBOX_TAKEOVER_SUPPRESSED_ERROR
  }
  return sanitizeOutboxError(error)
}

function eligibleAt(event: OutboxEventRecord): number {
  return (
    event.availableAt?.getTime() ??
    event.leaseUntil?.getTime() ??
    event.createdAt.getTime()
  )
}

function cloneEvent(event: OutboxEventRecord): OutboxEventRecord {
  return {
    ...event,
    createdAt: new Date(event.createdAt),
    ...(event.availableAt ? { availableAt: new Date(event.availableAt) } : {}),
    ...(event.leaseUntil ? { leaseUntil: new Date(event.leaseUntil) } : {}),
    ...(event.processedAt ? { processedAt: new Date(event.processedAt) } : {}),
    ...(event.deadLetteredAt
      ? { deadLetteredAt: new Date(event.deadLetteredAt) }
      : {}),
    payload: cloneValue(event.payload)
  }
}

function cloneAudit(event: AuditEventRecord): AuditEventRecord {
  return {
    ...event,
    createdAt: new Date(event.createdAt),
    payload: cloneValue(event.payload)
  }
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null) return value
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

function summarizeResult(result: unknown): unknown {
  if (result === undefined) return undefined
  if (typeof result === 'number' || typeof result === 'boolean') return result
  return sanitizeOutboxPayload(result).payload
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

function resolveTakeoverCheck(
  value: OutboxTakeoverCheck | undefined
): boolean | Promise<boolean> {
  if (typeof value === 'function') return Promise.resolve(value())
  return value === true
}
