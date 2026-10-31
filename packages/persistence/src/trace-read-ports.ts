import type {
  ApprovalReadPort,
  EffectJournalReadPort,
  TraceApproval,
  TraceEffect
} from '@cvg/harness-contracts'
import { TenantIdSchema } from '@cvg/platform'
import {
  withTenantContext,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

/**
 * SPEC 0295 §5.1: the read ports of the trace over the durable approval and effect journal tables
 * (default schema, tenant row level security). They read references and state only: never the
 * proposal, the payload or the decision note. Each call is one short read-only transaction.
 */
export class TraceReadError extends Error {
  constructor(readonly code: 'invalid_input' | 'unavailable' | 'cancelled') {
    super(`Trace read failed: ${code}`)
    this.name = 'TraceReadError'
  }
}

interface ApprovalRow {
  approval_id: string
  operation_key: string | null
  execution_ref: string | null
  status: string
  origin_session_id?: string | null
}

const text = (value: string | null | undefined): string | undefined =>
  value === null || value === undefined ? undefined : value

async function readOnly<T>(
  pool: PostgresPoolLike,
  tenantId: string,
  signal: AbortSignal | undefined,
  body: (client: PostgresPoolClient) => Promise<T>
): Promise<T> {
  if (signal?.aborted) throw new TraceReadError('cancelled')
  const parsed = TenantIdSchema.safeParse(tenantId)
  if (!parsed.success) throw new TraceReadError('invalid_input')
  try {
    return await withTenantContext(pool, parsed.data, async (client) => {
      // the signal may have fired while the connection was being leased
      if (signal?.aborted) throw new TraceReadError('cancelled')
      await client.query('BEGIN READ ONLY')
      try {
        await client.query("SET LOCAL statement_timeout = '5s'")
        const value = await body(client)
        // a read that finished after the abort is not handed to a caller that left
        if (signal?.aborted) throw new TraceReadError('cancelled')
        await client.query('COMMIT')
        return value
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    })
  } catch (error) {
    if (signal?.aborted) throw new TraceReadError('cancelled')
    throw error instanceof TraceReadError
      ? error
      : new TraceReadError('unavailable')
  }
}

export class PostgresApprovalReadPort implements ApprovalReadPort {
  readonly #pool: PostgresPoolLike
  /** SPEC 0291 adds the origin columns; without them an approval is simply unbound. */
  #hasOrigin: boolean | undefined

  constructor(pool: PostgresPoolLike) {
    this.#pool = pool
  }

  async #columns(client: PostgresPoolClient): Promise<string> {
    if (this.#hasOrigin === undefined) {
      const found = await client.query(
        `SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'runtime_approvals'
            AND column_name = 'origin_session_id'`
      )
      this.#hasOrigin = found.rows.length === 1
    }
    return `approval_id, operation_key, execution_ref, status${this.#hasOrigin ? ', origin_session_id' : ''}`
  }

  async get(
    tenantId: string,
    approvalId: string,
    signal?: AbortSignal
  ): Promise<TraceApproval | undefined> {
    return readOnly(this.#pool, tenantId, signal, async (client) => {
      const columns = await this.#columns(client)
      const result = await client.query<ApprovalRow>(
        `SELECT ${columns} FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
        [tenantId, approvalId]
      )
      const row = result.rows[0]
      return row ? approvalOf(row) : undefined
    })
  }

  async listByOperationKey(
    tenantId: string,
    operationKey: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<readonly TraceApproval[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new TraceReadError('invalid_input')
    return readOnly(this.#pool, tenantId, signal, async (client) => {
      const columns = await this.#columns(client)
      const result = await client.query<ApprovalRow>(
        `SELECT ${columns} FROM runtime_approvals
          WHERE tenant_id = $1 AND operation_key = $2
          ORDER BY requested_at, approval_id
          LIMIT $3`,
        [tenantId, operationKey, limit]
      )
      return result.rows.map(approvalOf)
    })
  }
}

function approvalOf(row: ApprovalRow): TraceApproval {
  const operationKey = text(row.operation_key)
  const executionRef = text(row.execution_ref)
  const originSessionId = text(row.origin_session_id)
  return {
    approvalId: row.approval_id,
    status: row.status,
    ...(operationKey === undefined ? {} : { operationKey }),
    ...(executionRef === undefined ? {} : { executionRef }),
    ...(originSessionId === undefined ? {} : { originSessionId })
  }
}

export class PostgresEffectJournalReadPort implements EffectJournalReadPort {
  readonly #pool: PostgresPoolLike

  constructor(pool: PostgresPoolLike) {
    this.#pool = pool
  }

  async get(
    tenantId: string,
    operationKey: string,
    signal?: AbortSignal
  ): Promise<TraceEffect | undefined> {
    return readOnly(this.#pool, tenantId, signal, async (client) => {
      const result = await client.query<{
        operation_key: string
        state: string
        execution_ref: string | null
      }>(
        `SELECT operation_key, state, execution_ref FROM effect_journal
          WHERE tenant_id = $1 AND operation_key = $2`,
        [tenantId, operationKey]
      )
      const row = result.rows[0]
      if (!row) return undefined
      const executionRef = text(row.execution_ref)
      return {
        operationKey: row.operation_key,
        state: row.state,
        ...(executionRef === undefined ? {} : { executionRef })
      }
    })
  }
}
