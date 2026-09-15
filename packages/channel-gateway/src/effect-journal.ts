import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'
import type { CanonicalOutboundMessage, OutboundResult } from './contracts.ts'
import { ChannelError, type ChannelErrorCode } from './errors.ts'

export const CHANNEL_OPERATION_KIND = 'outbound_message' as const
export type ChannelOperationKind = typeof CHANNEL_OPERATION_KIND

export const LEGACY_HASH_VERSION = 'legacy-local-v1'
export const SHARED_HASH_VERSION = 'shared-rfc8785-subset-v1'
export const CURRENT_HASH_VERSION = SHARED_HASH_VERSION

export function isSupportedHashVersion(version: unknown): version is string {
  return version === LEGACY_HASH_VERSION || version === SHARED_HASH_VERSION
}

/**
 * Returns the version of a persisted record. Only an absent property is
 * interpreted as `legacy-local-v1`; an explicit malformed or unknown value
 * resolves to `undefined` (fail closed) and is never blessed as legacy.
 */
export function resolvePersistedHashVersion(
  record: Pick<ChannelEffectRecord, 'hashVersion'>
): string | undefined {
  const raw = (record as { hashVersion?: unknown }).hashVersion
  if (raw === undefined) return LEGACY_HASH_VERSION
  return isSupportedHashVersion(raw) ? raw : undefined
}

export function assertSupportedPersistedHashVersion(
  record: ChannelEffectRecord
): string {
  const version = resolvePersistedHashVersion(record)
  if (version === undefined) {
    throw new ChannelError(
      'hash_algorithm_mismatch',
      'Channel operation record has an invalid or unknown hash version',
      false
    )
  }
  return version
}

export interface ChannelEffectIdentity {
  tenantId: string
  channel: string
  operationKind: ChannelOperationKind
  idempotencyKey: string
}

export type ChannelEffectState =
  | 'PENDING'
  | 'SENDING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'UNCERTAIN'
  | 'EXPIRED'

export interface ChannelEffectRecord {
  identity: ChannelEffectIdentity
  payloadHash: string
  hashVersion: string
  state: ChannelEffectState
  attempt: number
  leaseOwner: string | null
  leaseExpiresAtMs: number | null
  result: OutboundResult | null
  errorCode: ChannelErrorCode | null
  updatedAtMs: number
  revision: number
}

export type ChannelEffectReserveOutcome =
  | { outcome: 'reserved'; record: ChannelEffectRecord }
  | { outcome: 'replay'; record: ChannelEffectRecord }
  | { outcome: 'in_flight'; record: ChannelEffectRecord }
  | { outcome: 'conflict'; record: ChannelEffectRecord }
  | { outcome: 'uncertain'; record: ChannelEffectRecord }
  | { outcome: 'version_mismatch' }

export interface ChannelEffectReserveInput {
  identity: ChannelEffectIdentity
  payloadHash: string
  hashVersion: string
  leaseOwner: string
  leaseMs: number
}

export type ChannelEffectTransition = 'committed' | 'lease_lost'

export type ChannelEffectReconciliation =
  | { kind: 'confirmed'; result: OutboundResult }
  | { kind: 'not_effected' }

export interface ChannelEffectReconciliationActor {
  actorId: string
  reason: string
}

/**
 * A reconciliation is an audited human/operator intervention: it is only
 * accepted with a non-empty actorId and reason. Invalid actors fail with the
 * stable non-retryable `reconciliation_required` before any mutation.
 */
export function assertValidReconciliationActor(
  actor: { actorId?: unknown; reason?: unknown } | null | undefined
): asserts actor is ChannelEffectReconciliationActor {
  const actorId = actor?.actorId
  const reason = actor?.reason
  if (
    typeof actorId !== 'string' ||
    actorId.trim() === '' ||
    typeof reason !== 'string' ||
    reason.trim() === ''
  ) {
    throw new ChannelError(
      'reconciliation_required',
      'Reconciliation requires a non-empty actorId and reason',
      false
    )
  }
}

export interface ChannelEffectJournal {
  reserve(
    input: ChannelEffectReserveInput
  ): Promise<ChannelEffectReserveOutcome>
  claimSend(
    identity: ChannelEffectIdentity,
    leaseOwner: string
  ): Promise<ChannelEffectRecord>
  renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean>
  complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition>
  fail(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition>
  release(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition>
  markUncertain(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition>
  find(
    identity: ChannelEffectIdentity
  ): Promise<ChannelEffectRecord | undefined>
  waitForTerminal(
    identity: ChannelEffectIdentity,
    timeoutMs: number
  ): Promise<ChannelEffectRecord | undefined>
  resolveUncertain(
    identity: ChannelEffectIdentity,
    resolution: ChannelEffectReconciliation,
    actor: ChannelEffectReconciliationActor
  ): Promise<ChannelEffectRecord>
}

export function channelEffectKey(identity: ChannelEffectIdentity): string {
  return [
    identity.tenantId,
    identity.channel,
    identity.operationKind,
    identity.idempotencyKey
  ].join('\u0000')
}

export function channelEffectHasActiveLease(
  record: ChannelEffectRecord,
  nowMs: number
): boolean {
  return record.leaseExpiresAtMs !== null && record.leaseExpiresAtMs > nowMs
}

export function isTerminalForWaiter(state: ChannelEffectState): boolean {
  return state === 'CONFIRMED' || state === 'FAILED' || state === 'UNCERTAIN'
}

export function cloneEffectRecord(
  record: ChannelEffectRecord
): ChannelEffectRecord {
  return structuredClone(record)
}

export function createEffectRecord(
  input: ChannelEffectReserveInput,
  nowMs: number
): ChannelEffectRecord {
  return {
    identity: { ...input.identity },
    payloadHash: input.payloadHash,
    hashVersion: input.hashVersion,
    state: 'PENDING',
    attempt: 1,
    leaseOwner: input.leaseOwner,
    leaseExpiresAtMs: nowMs + input.leaseMs,
    result: null,
    errorCode: null,
    updatedAtMs: nowMs,
    revision: 1
  }
}

export interface ReserveDecision {
  action:
    | 'create'
    | 'takeover'
    | 'replay'
    | 'in_flight'
    | 'conflict'
    | 'uncertain'
    | 'version_mismatch'
  record?: ChannelEffectRecord
}

/**
 * Pure state-machine decision shared by every journal adapter. Callers are
 * responsible for atomicity around read/decision/write.
 */
export function decideReserve(
  existing: ChannelEffectRecord | undefined,
  input: ChannelEffectReserveInput,
  nowMs: number
): ReserveDecision {
  if (!isSupportedHashVersion(input.hashVersion)) {
    return { action: 'version_mismatch' }
  }
  if (!existing) return { action: 'create' }
  const existingHashVersion = resolvePersistedHashVersion(existing)
  if (
    existingHashVersion === undefined ||
    existingHashVersion !== input.hashVersion
  ) {
    return { action: 'version_mismatch' }
  }
  if (existing.payloadHash !== input.payloadHash) {
    return { action: 'conflict', record: existing }
  }
  if (existing.state === 'CONFIRMED' || existing.state === 'FAILED') {
    return { action: 'replay', record: existing }
  }
  if (existing.state === 'UNCERTAIN') {
    return { action: 'uncertain', record: existing }
  }
  if (channelEffectHasActiveLease(existing, nowMs)) {
    return { action: 'in_flight', record: existing }
  }
  if (existing.state === 'SENDING') {
    const uncertain: ChannelEffectRecord = {
      ...existing,
      state: 'UNCERTAIN',
      errorCode: existing.errorCode ?? 'send_failed',
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: nowMs,
      revision: existing.revision + 1
    }
    return { action: 'uncertain', record: uncertain }
  }
  const takeover: ChannelEffectRecord = {
    ...existing,
    state: 'PENDING',
    attempt: existing.attempt + 1,
    leaseOwner: input.leaseOwner,
    leaseExpiresAtMs: nowMs + input.leaseMs,
    result: null,
    errorCode: null,
    updatedAtMs: nowMs,
    revision: existing.revision + 1
  }
  return { action: 'takeover', record: takeover }
}

/**
 * @deprecated Kept for API compatibility. The single canonical source is
 * `canonicalizeJson` from `@cvg/shared`; this wrapper delegates to it so no
 * caller keeps the legacy integer-like key ordering.
 */
export function canonicalizePayload(value: unknown): string {
  return canonicalizeJson(value)
}

export type OutboundPayloadHashInput = Pick<
  CanonicalOutboundMessage,
  | 'conversationId'
  | 'channel'
  | 'recipient'
  | 'body'
  | 'correlationId'
  | 'metadata'
>

/**
 * Stable payload identity for a channel operation. messageId is deliberately
 * excluded so a retried notification with the same content is not treated as
 * a different operation.
 */
export function hashOutboundPayload(message: OutboundPayloadHashInput): string {
  const canonical = canonicalizeJson({
    conversationId: message.conversationId,
    channel: message.channel,
    recipient: message.recipient,
    body: message.body,
    correlationId: message.correlationId,
    metadata: message.metadata
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export interface InMemoryChannelEffectJournalOptions {
  clock?: () => number
  pollMs?: number
}

/**
 * Reference journal for a single process. It is atomic within one Node event
 * loop but NOT durable across restarts; use it only in tests, evals and
 * explicitly ephemeral flows. Cross-process durability requires the file or
 * SQL adapters.
 */
export class InMemoryChannelEffectJournal implements ChannelEffectJournal {
  readonly #entries = new Map<string, ChannelEffectRecord>()
  readonly #clock: () => number
  readonly #pollMs: number

  constructor(options: InMemoryChannelEffectJournalOptions = {}) {
    this.#clock = options.clock ?? (() => Date.now())
    this.#pollMs = options.pollMs ?? 5
  }

  async reserve(
    input: ChannelEffectReserveInput
  ): Promise<ChannelEffectReserveOutcome> {
    const key = channelEffectKey(input.identity)
    const now = this.#clock()
    const existing = this.#entries.get(key)
    const decision = decideReserve(existing, input, now)
    if (decision.action === 'version_mismatch') {
      return { outcome: 'version_mismatch' }
    }
    if (decision.action === 'create') {
      const created = createEffectRecord(input, now)
      this.#entries.set(key, created)
      return { outcome: 'reserved', record: cloneEffectRecord(created) }
    }
    if (decision.action === 'takeover') {
      const takeover = decision.record as ChannelEffectRecord
      this.#entries.set(key, takeover)
      return { outcome: 'reserved', record: cloneEffectRecord(takeover) }
    }
    if (decision.action === 'uncertain') {
      if (existing?.state !== 'UNCERTAIN') {
        this.#entries.set(key, decision.record as ChannelEffectRecord)
      }
      return {
        outcome: 'uncertain',
        record: cloneEffectRecord(
          (decision.record ?? existing) as ChannelEffectRecord
        )
      }
    }
    if (decision.action === 'conflict') {
      return {
        outcome: 'conflict',
        record: cloneEffectRecord(decision.record as ChannelEffectRecord)
      }
    }
    if (decision.action === 'replay') {
      return {
        outcome: 'replay',
        record: cloneEffectRecord(decision.record as ChannelEffectRecord)
      }
    }
    return {
      outcome: 'in_flight',
      record: cloneEffectRecord(decision.record as ChannelEffectRecord)
    }
  }

  async claimSend(
    identity: ChannelEffectIdentity,
    leaseOwner: string
  ): Promise<ChannelEffectRecord> {
    return this.#transition(identity, (record, now) => {
      if (
        record.state !== 'PENDING' ||
        record.leaseOwner !== leaseOwner ||
        !channelEffectHasActiveLease(record, now)
      ) {
        throw new ChannelError(
          'lease_lost',
          'Channel operation lease is not owned by the caller',
          true
        )
      }
      return {
        ...record,
        state: 'SENDING',
        updatedAtMs: now,
        revision: record.revision + 1
      }
    })
  }

  async renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean> {
    const key = channelEffectKey(identity)
    const record = this.#entries.get(key)
    if (!record) return false
    const now = this.#clock()
    if (
      record.leaseOwner !== leaseOwner ||
      !channelEffectHasActiveLease(record, now)
    ) {
      return false
    }
    this.#entries.set(key, {
      ...record,
      leaseExpiresAtMs: now + leaseMs,
      updatedAtMs: now
    })
    return true
  }

  async complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => {
      if (record.state === 'CONFIRMED') return record
      if (record.state !== 'SENDING') {
        throw new ChannelError(
          'lease_lost',
          `Cannot complete a ${record.state} channel operation`,
          true
        )
      }
      return {
        ...record,
        state: 'CONFIRMED',
        result,
        errorCode: null,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: now,
        revision: record.revision + 1
      }
    })
  }

  async fail(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => {
      if (record.state === 'FAILED') return record
      return {
        ...record,
        state: 'FAILED',
        errorCode,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: now,
        revision: record.revision + 1
      }
    })
  }

  async release(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => ({
      ...record,
      state: 'PENDING',
      errorCode,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: now,
      revision: record.revision + 1
    }))
  }

  async markUncertain(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => ({
      ...record,
      state: 'UNCERTAIN',
      errorCode,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: now,
      revision: record.revision + 1
    }))
  }

  async find(
    identity: ChannelEffectIdentity
  ): Promise<ChannelEffectRecord | undefined> {
    const record = this.#entries.get(channelEffectKey(identity))
    return record ? cloneEffectRecord(record) : undefined
  }

  async waitForTerminal(
    identity: ChannelEffectIdentity,
    timeoutMs: number
  ): Promise<ChannelEffectRecord | undefined> {
    const key = channelEffectKey(identity)
    const deadline = this.#clock() + timeoutMs
    while (true) {
      const record = this.#entries.get(key)
      if (record && isTerminalForWaiter(record.state)) {
        return cloneEffectRecord(record)
      }
      const remaining = deadline - this.#clock()
      if (remaining <= 0) return undefined
      await delay(Math.max(1, Math.min(this.#pollMs, remaining)))
    }
  }

  async resolveUncertain(
    identity: ChannelEffectIdentity,
    resolution: ChannelEffectReconciliation,
    actor: ChannelEffectReconciliationActor
  ): Promise<ChannelEffectRecord> {
    assertValidReconciliationActor(actor)
    return this.#transition(identity, (record, now) => {
      if (record.state !== 'UNCERTAIN') {
        throw new ChannelError(
          'reconciliation_required',
          `Channel operation is ${record.state}, not UNCERTAIN`,
          false
        )
      }
      if (resolution.kind === 'confirmed') {
        return {
          ...record,
          state: 'CONFIRMED',
          result: resolution.result,
          errorCode: null,
          updatedAtMs: now,
          revision: record.revision + 1
        }
      }
      return {
        ...record,
        state: 'PENDING',
        errorCode: null,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: now,
        revision: record.revision + 1
      }
    })
  }

  #transition(
    identity: ChannelEffectIdentity,
    update: (record: ChannelEffectRecord, nowMs: number) => ChannelEffectRecord
  ): ChannelEffectRecord {
    const key = channelEffectKey(identity)
    const record = this.#entries.get(key)
    const now = this.#clock()
    if (!record) {
      throw new ChannelError(
        'lease_lost',
        'Channel operation record does not exist',
        true
      )
    }
    assertSupportedPersistedHashVersion(record)
    const updated = update(record, now)
    this.#entries.set(key, updated)
    return cloneEffectRecord(updated)
  }

  #settle(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    update: (record: ChannelEffectRecord, nowMs: number) => ChannelEffectRecord
  ): ChannelEffectTransition {
    const key = channelEffectKey(identity)
    const record = this.#entries.get(key)
    if (!record) return 'lease_lost'
    assertSupportedPersistedHashVersion(record)
    if (
      record.state === 'CONFIRMED' ||
      record.state === 'FAILED' ||
      record.state === 'UNCERTAIN'
    ) {
      return 'lease_lost'
    }
    if (record.leaseOwner !== leaseOwner) return 'lease_lost'
    const now = this.#clock()
    const updated = update(record, now)
    this.#entries.set(key, updated)
    return 'committed'
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
