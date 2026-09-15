import type { QueryResultRow } from 'pg'
import {
  EFFECT_EXPIRED_RESERVATION_REASON,
  EFFECT_EXPIRED_STARTED_REASON,
  EffectJournalError,
  decideConfirmEffect,
  decideFailEffect,
  decideMarkEffectStarted,
  decideMarkUncertain,
  decideReconcile,
  decideReserve,
  type EffectAttemptRef,
  type EffectConfirmRef,
  type EffectFailRef,
  type EffectJournalPort,
  type EffectReconcileRef,
  type EffectRecord,
  type EffectReserveInput,
  type EffectReserveOutcome,
  type EffectState,
  type EffectUncertainRef
} from '@cvg/agent-runtime'
import type { PostgresQueryable } from './postgres.ts'

export interface PostgresEffectJournalOptions {
  /** Repository-owned clock; callers cannot override transition decisions. */
  clock?: () => Date
}

interface EffectJournalRow extends QueryResultRow {
  tenant_id: string
  operation_key: string
  proposal_hash: string
  state: EffectState
  attempt_id: string
  execution_ref: string | null
  result_digest: string | null
  error_code: string | null
  reason: string | null
  expires_at: Date | string
  reconciled_by: string | null
  reconciliation_evidence_ref: string | null
  created_at: Date | string
  updated_at: Date | string
  revision: string | number
}

const effectJournalColumns = `
  tenant_id, operation_key, proposal_hash, state, attempt_id, execution_ref,
  result_digest, error_code, reason, expires_at, reconciled_by,
  reconciliation_evidence_ref, created_at, updated_at, revision`

const MAX_TRANSACTION_RETRIES = 2

function isRetryableTransactionError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code
  return code === '40001' || code === '40P01'
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function mapEffectJournalRow(row: EffectJournalRow): EffectRecord {
  return {
    tenantId: row.tenant_id,
    operationKey: row.operation_key,
    proposalHash: row.proposal_hash,
    attemptId: row.attempt_id,
    state: row.state,
    executionRef: row.execution_ref,
    resultDigest: row.result_digest,
    errorCode: row.error_code,
    reason: row.reason,
    expiresAt: toIsoString(row.expires_at),
    reconciledBy: row.reconciled_by,
    reconciliationEvidenceRef: row.reconciliation_evidence_ref,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    revision: Number(row.revision)
  }
}

function assertEffectText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EffectJournalError(
      'invalid_input',
      `Effect journal ${label} is required`
    )
  }
}

function assertReserveInput(input: EffectReserveInput): void {
  assertEffectText(input.tenantId, 'tenantId')
  assertEffectText(input.operationKey, 'operationKey')
  assertEffectText(input.proposalHash, 'proposalHash')
  assertEffectText(input.attemptId, 'attemptId')
  if (!Number.isFinite(Date.parse(input.expiresAt))) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal expiresAt is invalid'
    )
  }
}

function assertReleaseWindow(now: Date, ttlMs: number): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal now is invalid'
    )
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal ttlMs is invalid'
    )
  }
}

/**
 * Runs a short transaction on one checked-out connection and retries only
 * serialization/deadlock aborts, up to two additional attempts. The journal
 * never performs network I/O inside these transactions.
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
 * PostgreSQL incarnation of `EffectJournalPort` (AAA-03 §7). It shares the
 * pure reservation/transition state machine with the in-memory and file
 * adapters, and persists every transition with an explicit
 * `UPDATE ... WHERE state AND revision AND attempt_id` compare-and-swap under
 * `FOR UPDATE`. The table is tenant-isolated by forced RLS, so callers must
 * set `cvg.tenant_id` on the connection (`withTenantContext`).
 *
 * The client must be one checked-out connection: the adapter issues
 * BEGIN/COMMIT and a `pg.Pool` may route statements to different connections.
 */
export class PostgresEffectJournal implements EffectJournalPort {
  readonly #client: PostgresQueryable
  readonly #clock: () => Date

  constructor(
    client: PostgresQueryable,
    options: PostgresEffectJournalOptions = {}
  ) {
    this.#client = client
    this.#clock = options.clock ?? (() => new Date())
  }

  async reserve(input: EffectReserveInput): Promise<EffectReserveOutcome> {
    assertReserveInput(input)
    const nowIso = this.#clock().toISOString()

    return withTransactionRetry(this.#client, async () => {
      const inserted = await this.#client.query<EffectJournalRow>(
        `INSERT INTO effect_journal
           (tenant_id, operation_key, proposal_hash, state, attempt_id,
            expires_at, created_at, updated_at, revision)
         VALUES ($1, $2, $3, 'RESERVED', $4, $5, $6, $6, 1)
         ON CONFLICT (tenant_id, operation_key) DO NOTHING
         RETURNING ${effectJournalColumns}`,
        [
          input.tenantId,
          input.operationKey,
          input.proposalHash,
          input.attemptId,
          input.expiresAt,
          nowIso
        ]
      )
      if (inserted.rows[0]) return { outcome: 'reserved' as const }

      const existing = await this.#selectForUpdate(
        input.tenantId,
        input.operationKey
      )
      const decision = decideReserve(existing, input, nowIso)
      if (decision.outcome === 'reserved') {
        if (decision.record) {
          await this.#persistTransition(existing, decision.record)
        }
        return { outcome: 'reserved' as const }
      }
      if (decision.outcome === 'replay') {
        return { outcome: 'replay' as const, record: decision.record }
      }
      if (decision.outcome === 'uncertain') {
        return { outcome: 'uncertain' as const, record: decision.record }
      }
      return { outcome: 'in_progress' as const }
    })
  }

  async markEffectStarted(ref: EffectAttemptRef): Promise<EffectRecord> {
    return this.#applyTransition(
      ref.tenantId,
      ref.operationKey,
      (record, nowIso) => decideMarkEffectStarted(record, ref.attemptId, nowIso)
    )
  }

  async confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord> {
    return this.#applyTransition(
      ref.tenantId,
      ref.operationKey,
      (record, nowIso) => decideConfirmEffect(record, ref, nowIso)
    )
  }

  async failEffect(ref: EffectFailRef): Promise<EffectRecord> {
    return this.#applyTransition(
      ref.tenantId,
      ref.operationKey,
      (record, nowIso) => decideFailEffect(record, ref, nowIso)
    )
  }

  async markUncertain(ref: EffectUncertainRef): Promise<EffectRecord> {
    return this.#applyTransition(
      ref.tenantId,
      ref.operationKey,
      (record, nowIso) => decideMarkUncertain(record, ref, nowIso)
    )
  }

  async get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord | undefined> {
    const result = await this.#client.query<EffectJournalRow>(
      `SELECT ${effectJournalColumns}
       FROM effect_journal
       WHERE tenant_id = $1 AND operation_key = $2`,
      [tenantId, operationKey]
    )
    const row = result.rows[0]
    return row ? mapEffectJournalRow(row) : undefined
  }

  async releaseExpired(now: Date, ttlMs: number): Promise<number> {
    assertReleaseWindow(now, ttlMs)

    return withTransactionRetry(this.#client, async () => {
      const abandoned = await this.#client.query(
        `UPDATE effect_journal
         SET state = 'ABANDONED',
             reason = $3,
             updated_at = $1,
             revision = revision + 1
         WHERE state = 'RESERVED'
           AND (
             expires_at <= $1
             OR updated_at + ($2::bigint * interval '1 millisecond') <= $1
           )`,
        [now, ttlMs, EFFECT_EXPIRED_RESERVATION_REASON]
      )
      const uncertain = await this.#client.query(
        `UPDATE effect_journal
         SET state = 'UNCERTAIN',
             reason = $3,
             updated_at = $1,
             revision = revision + 1
         WHERE state = 'EFFECT_STARTED'
           AND (
             expires_at <= $1
             OR updated_at + ($2::bigint * interval '1 millisecond') <= $1
           )`,
        [now, ttlMs, EFFECT_EXPIRED_STARTED_REASON]
      )
      return (abandoned.rowCount ?? 0) + (uncertain.rowCount ?? 0)
    })
  }

  async reconcile(ref: EffectReconcileRef): Promise<EffectRecord> {
    return this.#applyTransition(
      ref.tenantId,
      ref.operationKey,
      (record, nowIso) => decideReconcile(record, ref, nowIso)
    )
  }

  async #applyTransition(
    tenantId: string,
    operationKey: string,
    decide: (record: EffectRecord, nowIso: string) => EffectRecord | undefined
  ): Promise<EffectRecord> {
    const nowIso = this.#clock().toISOString()
    return withTransactionRetry(this.#client, async () => {
      const existing = await this.#selectForUpdate(tenantId, operationKey)
      const updated = decide(existing, nowIso)
      if (!updated) return existing
      return this.#persistTransition(existing, updated)
    })
  }

  async #selectForUpdate(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord> {
    const result = await this.#client.query<EffectJournalRow>(
      `SELECT ${effectJournalColumns}
       FROM effect_journal
       WHERE tenant_id = $1 AND operation_key = $2
       FOR UPDATE`,
      [tenantId, operationKey]
    )
    const row = result.rows[0]
    if (!row) {
      throw new EffectJournalError(
        'not_found',
        'Effect journal record does not exist'
      )
    }
    return mapEffectJournalRow(row)
  }

  async #persistTransition(
    existing: EffectRecord,
    updated: EffectRecord
  ): Promise<EffectRecord> {
    const result = await this.#client.query<EffectJournalRow>(
      `UPDATE effect_journal
       SET proposal_hash = $3,
           state = $4,
           attempt_id = $5,
           execution_ref = $6,
           result_digest = $7,
           error_code = $8,
           reason = $9,
           expires_at = $10,
           reconciled_by = $11,
           reconciliation_evidence_ref = $12,
           created_at = $13,
           updated_at = $14,
           revision = $15
       WHERE tenant_id = $1 AND operation_key = $2
         AND state = $16 AND revision = $17 AND attempt_id = $18
       RETURNING ${effectJournalColumns}`,
      [
        existing.tenantId,
        existing.operationKey,
        updated.proposalHash,
        updated.state,
        updated.attemptId,
        updated.executionRef,
        updated.resultDigest,
        updated.errorCode,
        updated.reason,
        updated.expiresAt,
        updated.reconciledBy,
        updated.reconciliationEvidenceRef,
        updated.createdAt,
        updated.updatedAt,
        updated.revision,
        existing.state,
        existing.revision,
        existing.attemptId
      ]
    )
    const row = result.rows[0]
    if (!row) {
      throw new EffectJournalError(
        'journal_unavailable',
        'Effect journal compare-and-swap transition was lost'
      )
    }
    return mapEffectJournalRow(row)
  }
}
