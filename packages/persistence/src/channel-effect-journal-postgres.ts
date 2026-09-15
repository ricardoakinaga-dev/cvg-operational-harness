import type { QueryResultRow } from 'pg'
import type {
  ChannelEffectIdentity,
  ChannelEffectJournal,
  ChannelEffectReconciliation,
  ChannelEffectReconciliationActor,
  ChannelEffectRecord,
  ChannelEffectReserveInput,
  ChannelEffectReserveOutcome,
  ChannelEffectState,
  ChannelEffectTransition,
  ChannelErrorCode,
  OutboundResult
} from '@cvg/channel-gateway'
import type { PostgresQueryable } from './postgres.ts'

export const LEGACY_CHANNEL_HASH_VERSION = 'legacy-local-v1'
export const SHARED_CHANNEL_HASH_VERSION = 'shared-rfc8785-subset-v1'

export function isSupportedChannelHashVersion(
  version: unknown
): version is string {
  return (
    version === LEGACY_CHANNEL_HASH_VERSION ||
    version === SHARED_CHANNEL_HASH_VERSION
  )
}

export function resolveStoredChannelHashVersion(
  record: Pick<ChannelEffectRecord, 'hashVersion'>
): string | undefined {
  const raw = (record as { hashVersion?: unknown }).hashVersion
  if (raw === undefined || raw === null) return LEGACY_CHANNEL_HASH_VERSION
  return isSupportedChannelHashVersion(raw) ? raw : undefined
}

export class PostgresChannelEffectError extends Error {
  readonly code: ChannelErrorCode
  readonly retryable: boolean

  constructor(code: ChannelErrorCode, message: string, retryable = false) {
    super(message)
    this.name = 'PostgresChannelEffectError'
    this.code = code
    this.retryable = retryable
  }
}

export interface PostgresChannelEffectJournalOptions {
  clock?: () => number
  pollMs?: number
}

interface ChannelEffectRow extends QueryResultRow {
  tenant_id: string
  channel: string
  operation_kind: ChannelEffectRecord['identity']['operationKind']
  idempotency_key: string
  payload_hash: string
  hash_version: string
  state: ChannelEffectState
  attempt: number
  lease_owner: string | null
  lease_expires_at: Date | string | null
  result: OutboundResult | null
  error_code: ChannelErrorCode | null
  revision: string | number
  updated_at: Date | string
}

const channelEffectColumns = `
  tenant_id, channel, operation_kind, idempotency_key, payload_hash,
  hash_version, state, attempt, lease_owner, lease_expires_at, result,
  error_code, revision, updated_at`

const MAX_TRANSACTION_RETRIES = 2

function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return code === '40001' || code === '40P01'
}

function toTimeMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

function mapChannelEffectRow(row: ChannelEffectRow): ChannelEffectRecord {
  const identity: ChannelEffectIdentity = {
    tenantId: row.tenant_id,
    channel: row.channel,
    operationKind: row.operation_kind,
    idempotencyKey: row.idempotency_key
  }
  return {
    identity,
    payloadHash: row.payload_hash,
    hashVersion: row.hash_version,
    state: row.state,
    attempt: row.attempt,
    leaseOwner: row.lease_owner,
    leaseExpiresAtMs:
      row.lease_expires_at === null ? null : toTimeMs(row.lease_expires_at),
    result: row.result,
    errorCode: row.error_code,
    updatedAtMs: toTimeMs(row.updated_at),
    revision: Number(row.revision)
  }
}

function assertStoredHashVersion(record: ChannelEffectRecord): void {
  if (resolveStoredChannelHashVersion(record) === undefined) {
    throw new PostgresChannelEffectError(
      'hash_algorithm_mismatch',
      'Channel operation record has an invalid or unknown hash version',
      false
    )
  }
}

function assertValidReconciliationActor(
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
    throw new PostgresChannelEffectError(
      'reconciliation_required',
      'Reconciliation requires a non-empty actorId and reason',
      false
    )
  }
}

function createChannelEffectRecord(
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

type ChannelReserveDecision =
  | { action: 'takeover'; record: ChannelEffectRecord }
  | { action: 'replay'; record: ChannelEffectRecord }
  | { action: 'in_flight'; record: ChannelEffectRecord }
  | { action: 'conflict'; record: ChannelEffectRecord }
  | { action: 'uncertain'; record: ChannelEffectRecord }
  | { action: 'version_mismatch' }

/**
 * Runs a short transaction on one checked-out connection and retries only
 * serialization/deadlock aborts, up to two additional attempts. No network
 * I/O runs inside the transaction.
 */
async function withTransactionRetry<T>(
  client: PostgresQueryable,
  operation: () => Promise<T>
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    await client.query('BEGIN')
    try {
      const result = await operation()
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (
        attempt < MAX_TRANSACTION_RETRIES &&
        isRetryableTransactionError(error)
      ) {
        continue
      }
      throw error
    }
  }
}

/**
 * PostgreSQL incarnation of the frozen `ChannelEffectJournal` interface
 * (AAA-12 / D05-2). It imports only channel-gateway types to avoid a runtime
 * dependency cycle, and reimplements the same state machine as
 * `decideReserve` in `channel-gateway/src/effect-journal.ts`.
 *
 * Every transition is an explicit `UPDATE ... WHERE state AND revision AND
 * lease_owner` compare-and-swap; a stale worker token returns `lease_lost`
 * and never overwrites another worker result. The table is tenant-isolated by
 * forced RLS, so callers must set `cvg.tenant_id` on the connection.
 *
 * The client must be one checked-out connection: the adapter issues
 * BEGIN/COMMIT and a `pg.Pool` may route statements to different connections.
 */
export class PostgresChannelEffectJournal implements ChannelEffectJournal {
  readonly #client: PostgresQueryable
  readonly #clock: () => number
  readonly #pollMs: number

  constructor(
    client: PostgresQueryable,
    options: PostgresChannelEffectJournalOptions = {}
  ) {
    this.#client = client
    this.#clock = options.clock ?? (() => Date.now())
    this.#pollMs = options.pollMs ?? 5
  }

  async reserve(
    input: ChannelEffectReserveInput
  ): Promise<ChannelEffectReserveOutcome> {
    if (!isSupportedChannelHashVersion(input.hashVersion)) {
      return { outcome: 'version_mismatch' }
    }
    const nowMs = this.#clock()

    return withTransactionRetry(this.#client, async () => {
      const created = createChannelEffectRecord(input, nowMs)
      const inserted = await this.#client.query<ChannelEffectRow>(
        `INSERT INTO channel_effect_journal
           (tenant_id, channel, operation_kind, idempotency_key, payload_hash,
            hash_version, state, attempt, lease_owner, lease_expires_at,
            result, error_code, revision, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 1, $7, $8,
                 NULL, NULL, 1, $9, $9)
         ON CONFLICT (tenant_id, channel, operation_kind, idempotency_key)
           DO NOTHING
         RETURNING ${channelEffectColumns}`,
        [
          created.identity.tenantId,
          created.identity.channel,
          created.identity.operationKind,
          created.identity.idempotencyKey,
          created.payloadHash,
          created.hashVersion,
          created.leaseOwner,
          new Date(created.leaseExpiresAtMs as number),
          new Date(nowMs)
        ]
      )
      if (inserted.rows[0]) {
        return {
          outcome: 'reserved',
          record: mapChannelEffectRow(inserted.rows[0])
        }
      }

      const existing = await this.#selectForUpdate(input.identity)
      const decision = this.#decideReserve(existing, input, nowMs)
      if (decision.action === 'version_mismatch') {
        return { outcome: 'version_mismatch' }
      }
      if (decision.action === 'conflict') {
        return { outcome: 'conflict', record: decision.record }
      }
      if (decision.action === 'replay') {
        return { outcome: 'replay', record: decision.record }
      }
      if (decision.action === 'uncertain') {
        if (existing.state !== 'UNCERTAIN') {
          await this.#persist(existing, decision.record)
        }
        return { outcome: 'uncertain', record: decision.record }
      }
      if (decision.action === 'takeover') {
        const takeover = await this.#persist(existing, decision.record)
        return { outcome: 'reserved', record: takeover }
      }
      return { outcome: 'in_flight', record: decision.record }
    })
  }

  async claimSend(
    identity: ChannelEffectIdentity,
    leaseOwner: string
  ): Promise<ChannelEffectRecord> {
    const nowMs = this.#clock()
    return withTransactionRetry(this.#client, async () => {
      const existing = await this.#selectForUpdate(identity)
      assertStoredHashVersion(existing)
      if (
        existing.state !== 'PENDING' ||
        existing.leaseOwner !== leaseOwner ||
        existing.leaseExpiresAtMs === null ||
        existing.leaseExpiresAtMs <= nowMs
      ) {
        throw new PostgresChannelEffectError(
          'lease_lost',
          'Channel operation lease is not owned by the caller',
          true
        )
      }
      return this.#persist(existing, {
        ...existing,
        state: 'SENDING',
        updatedAtMs: nowMs,
        revision: existing.revision + 1
      })
    })
  }

  async renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean> {
    const nowMs = this.#clock()
    return withTransactionRetry(this.#client, async () => {
      const existing = await this.#selectForUpdate(identity)
      assertStoredHashVersion(existing)
      if (
        existing.leaseOwner !== leaseOwner ||
        existing.leaseExpiresAtMs === null ||
        existing.leaseExpiresAtMs <= nowMs ||
        (existing.state !== 'PENDING' && existing.state !== 'SENDING')
      ) {
        return false
      }
      await this.#persist(existing, {
        ...existing,
        leaseExpiresAtMs: nowMs + leaseMs,
        updatedAtMs: nowMs,
        revision: existing.revision + 1
      })
      return true
    })
  }

  async complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition> {
    const nowMs = this.#clock()
    return this.#settle(identity, leaseOwner, ['SENDING'], (existing) => ({
      ...existing,
      state: 'CONFIRMED',
      result,
      errorCode: null,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: nowMs,
      revision: existing.revision + 1
    }))
  }

  async fail(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    const nowMs = this.#clock()
    return this.#settle(
      identity,
      leaseOwner,
      ['PENDING', 'SENDING'],
      (existing) => ({
        ...existing,
        state: 'FAILED',
        errorCode,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: nowMs,
        revision: existing.revision + 1
      })
    )
  }

  async release(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    const nowMs = this.#clock()
    return this.#settle(
      identity,
      leaseOwner,
      ['PENDING', 'SENDING'],
      (existing) => ({
        ...existing,
        state: 'PENDING',
        errorCode,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: nowMs,
        revision: existing.revision + 1
      })
    )
  }

  async markUncertain(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    const nowMs = this.#clock()
    return this.#settle(
      identity,
      leaseOwner,
      ['PENDING', 'SENDING'],
      (existing) => ({
        ...existing,
        state: 'UNCERTAIN',
        errorCode,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: nowMs,
        revision: existing.revision + 1
      })
    )
  }

  async find(
    identity: ChannelEffectIdentity
  ): Promise<ChannelEffectRecord | undefined> {
    const result = await this.#client.query<ChannelEffectRow>(
      `SELECT ${channelEffectColumns}
       FROM channel_effect_journal
       WHERE tenant_id = $1 AND channel = $2
         AND operation_kind = $3 AND idempotency_key = $4`,
      [
        identity.tenantId,
        identity.channel,
        identity.operationKind,
        identity.idempotencyKey
      ]
    )
    const row = result.rows[0]
    return row ? mapChannelEffectRow(row) : undefined
  }

  async waitForTerminal(
    identity: ChannelEffectIdentity,
    timeoutMs: number
  ): Promise<ChannelEffectRecord | undefined> {
    const deadline = this.#clock() + timeoutMs
    for (;;) {
      const record = await this.find(identity)
      if (record) assertStoredHashVersion(record)
      if (
        record &&
        (record.state === 'CONFIRMED' ||
          record.state === 'FAILED' ||
          record.state === 'UNCERTAIN')
      ) {
        return record
      }
      const remaining = deadline - this.#clock()
      if (remaining <= 0) return undefined
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, Math.min(this.#pollMs, remaining)))
      )
    }
  }

  async resolveUncertain(
    identity: ChannelEffectIdentity,
    resolution: ChannelEffectReconciliation,
    actor: ChannelEffectReconciliationActor
  ): Promise<ChannelEffectRecord> {
    assertValidReconciliationActor(actor)
    const nowMs = this.#clock()
    return withTransactionRetry(this.#client, async () => {
      const existing = await this.#selectForUpdate(identity)
      assertStoredHashVersion(existing)
      if (existing.state !== 'UNCERTAIN') {
        throw new PostgresChannelEffectError(
          'reconciliation_required',
          `Channel operation is ${existing.state}, not UNCERTAIN`,
          false
        )
      }
      const updated =
        resolution.kind === 'confirmed'
          ? {
              ...existing,
              state: 'CONFIRMED' as const,
              result: resolution.result,
              errorCode: null,
              updatedAtMs: nowMs,
              revision: existing.revision + 1
            }
          : {
              ...existing,
              state: 'PENDING' as const,
              errorCode: null,
              leaseOwner: null,
              leaseExpiresAtMs: null,
              updatedAtMs: nowMs,
              revision: existing.revision + 1
            }
      return this.#persist(existing, updated)
    })
  }

  #decideReserve(
    existing: ChannelEffectRecord,
    input: ChannelEffectReserveInput,
    nowMs: number
  ): ChannelReserveDecision {
    const existingVersion = resolveStoredChannelHashVersion(existing)
    if (
      existingVersion === undefined ||
      existingVersion !== input.hashVersion
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
    if (
      existing.leaseExpiresAtMs !== null &&
      existing.leaseExpiresAtMs > nowMs
    ) {
      return { action: 'in_flight', record: existing }
    }
    if (existing.state === 'SENDING') {
      return {
        action: 'uncertain',
        record: {
          ...existing,
          state: 'UNCERTAIN',
          errorCode: existing.errorCode ?? 'send_failed',
          leaseOwner: null,
          leaseExpiresAtMs: null,
          updatedAtMs: nowMs,
          revision: existing.revision + 1
        }
      }
    }
    return {
      action: 'takeover',
      record: {
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
    }
  }

  async #settle(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    expectedStates: ChannelEffectState[],
    update: (existing: ChannelEffectRecord) => ChannelEffectRecord
  ): Promise<ChannelEffectTransition> {
    return withTransactionRetry(this.#client, async () => {
      const existing = await this.#selectForUpdate(identity)
      assertStoredHashVersion(existing)
      if (
        existing.leaseOwner !== leaseOwner ||
        !expectedStates.includes(existing.state)
      ) {
        return 'lease_lost'
      }
      await this.#persist(existing, update(existing))
      return 'committed'
    })
  }

  async #selectForUpdate(
    identity: ChannelEffectIdentity
  ): Promise<ChannelEffectRecord> {
    const result = await this.#client.query<ChannelEffectRow>(
      `SELECT ${channelEffectColumns}
       FROM channel_effect_journal
       WHERE tenant_id = $1 AND channel = $2
         AND operation_kind = $3 AND idempotency_key = $4
       FOR UPDATE`,
      [
        identity.tenantId,
        identity.channel,
        identity.operationKind,
        identity.idempotencyKey
      ]
    )
    const row = result.rows[0]
    if (!row) {
      throw new PostgresChannelEffectError(
        'lease_lost',
        'Channel operation record does not exist',
        true
      )
    }
    return mapChannelEffectRow(row)
  }

  async #persist(
    existing: ChannelEffectRecord,
    next: ChannelEffectRecord
  ): Promise<ChannelEffectRecord> {
    const result = await this.#client.query<ChannelEffectRow>(
      `UPDATE channel_effect_journal
       SET state = $8,
           attempt = $9,
           lease_owner = $10,
           lease_expires_at = $11,
           result = $12::jsonb,
           error_code = $13,
           revision = $14,
           updated_at = $15
       WHERE tenant_id = $1
         AND channel = $2
         AND operation_kind = $3
         AND idempotency_key = $4
         AND state = $5
         AND revision = $6
         AND lease_owner IS NOT DISTINCT FROM $7
       RETURNING ${channelEffectColumns}`,
      [
        existing.identity.tenantId,
        existing.identity.channel,
        existing.identity.operationKind,
        existing.identity.idempotencyKey,
        existing.state,
        existing.revision,
        existing.leaseOwner,
        next.state,
        next.attempt,
        next.leaseOwner,
        next.leaseExpiresAtMs === null ? null : new Date(next.leaseExpiresAtMs),
        next.result === null ? null : JSON.stringify(next.result),
        next.errorCode,
        next.revision,
        new Date(next.updatedAtMs)
      ]
    )
    const row = result.rows[0]
    if (!row) {
      throw new PostgresChannelEffectError(
        'lease_lost',
        'Channel operation compare-and-swap transition was lost',
        true
      )
    }
    return mapChannelEffectRow(row)
  }
}
