import type {
  SessionDirectory,
  SessionDirectoryRow,
  SessionSummary
} from '@cvg/harness-contracts'
import {
  SessionMigrationRequiredError,
  SessionPersistenceCorruptionError,
  SessionStorageUnavailableError,
  validateSessionHeader
} from '@cvg/harness'
import { abortError } from './session-connection-lease.ts'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from './tenant-scoped-postgres.ts'

/** SPEC 0295 §4 + D1-b: the listing window of one tenant's streams, newest first. */
export const SESSION_QUERY_INDEX = 'session_streams_tenant_order_idx'
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/
const TENANT = /^[\x21-\x7e]{1,200}$/

interface Row {
  key: string
  session_id: string
  header_json: string | null
  inherited_event_count: string | null
}

export interface PostgresSessionDirectoryOptions {
  readonly tenantId: string
  readonly schemaName: string
}

/** The window query, exported so that a test can read its plan: the expression is the contract. */
export const sessionWindowSql = (schema: string): string =>
  `SELECT writer_lock_id::bigint AS key, session_id, header_json, inherited_event_count
     FROM "${schema}".session_streams
    WHERE tenant_id = $1 AND ($2::bigint IS NULL OR writer_lock_id::bigint < $2)
    ORDER BY writer_lock_id::bigint DESC
    LIMIT $3`

// the index is a property of the schema, not of a request: a verified schema is remembered
const verifiedSchemas = new Set<string>()

/**
 * Reads up to `size` streams of the composition's tenant below a key, in descending key order,
 * before any filter. The query orders by `writer_lock_id::bigint` on purpose: that expression is
 * served only by the tenant index of migration 0038, so the plan is a backward scan of at most
 * `size` entries whatever the other tenants hold (the unique index on `writer_lock_id` alone
 * would be walked through their streams). Without the index the directory refuses to run.
 */
export class PostgresSessionDirectory implements SessionDirectory {
  readonly #pool: PostgresPoolLike
  readonly #tenantId: string
  readonly #schema: string

  constructor(
    pool: PostgresPoolLike,
    options: PostgresSessionDirectoryOptions
  ) {
    if (!SCHEMA.test(options.schemaName) || !TENANT.test(options.tenantId))
      throw new SessionStorageUnavailableError(
        'Invalid session directory binding'
      )
    this.#pool = pool
    this.#tenantId = options.tenantId
    this.#schema = options.schemaName
  }

  async window(input: {
    readonly before?: number
    readonly size: number
    readonly signal?: AbortSignal
  }): Promise<readonly SessionDirectoryRow[]> {
    if (input.signal?.aborted) throw abortError()
    if (!Number.isSafeInteger(input.size) || input.size < 1)
      throw new SessionStorageUnavailableError('Invalid session window size')
    let client: PostgresPoolClient
    try {
      client = await this.#pool.connect()
    } catch (cause) {
      throw new SessionStorageUnavailableError(
        'Session database unavailable',
        undefined,
        { cause }
      )
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN READ ONLY')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        this.#tenantId
      ])
      if (!verifiedSchemas.has(this.#schema)) {
        const found = await client.query(
          'SELECT 1 FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
          [this.#schema, SESSION_QUERY_INDEX]
        )
        if (found.rows.length !== 1)
          throw new SessionMigrationRequiredError(
            'Session listing needs migration 0038_session_streams_tenant_order_index'
          )
        verifiedSchemas.add(this.#schema)
      }
      const result = await client.query<Row>(sessionWindowSql(this.#schema), [
        this.#tenantId,
        input.before ?? null,
        input.size
      ])
      await client.query('COMMIT')
      return result.rows.map((row) => ({
        key: Number(row.key),
        summary: summaryOf(row)
      }))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        releaseError = new Error('Session listing cleanup failed')
      })
      if (
        error instanceof SessionMigrationRequiredError ||
        error instanceof SessionPersistenceCorruptionError
      )
        throw error
      throw new SessionStorageUnavailableError(
        'Session listing failed',
        undefined,
        { cause: error }
      )
    } finally {
      client.release(releaseError)
    }
  }
}

/** `null` for a stream without adopted metadata; the header of an adopted one must be sound. */
function summaryOf(row: Row): SessionSummary | null {
  if (row.header_json === null || row.inherited_event_count === null)
    return null
  let parsed: unknown
  try {
    parsed = JSON.parse(row.header_json)
  } catch (cause) {
    throw new SessionPersistenceCorruptionError(
      'Stored header is not JSON',
      row.session_id,
      { cause }
    )
  }
  const cut = Number(row.inherited_event_count)
  let header
  try {
    header = validateSessionHeader(parsed, cut).header
  } catch (cause) {
    throw new SessionPersistenceCorruptionError(
      'Stored header is invalid',
      row.session_id,
      { cause }
    )
  }
  if (header.id !== row.session_id)
    throw new SessionPersistenceCorruptionError(
      'Stored header names another session',
      row.session_id
    )
  return {
    sessionId: row.session_id,
    createdAt: header.createdAt,
    isSeeded: header.isSeeded,
    ...(header.parentSession === undefined
      ? {}
      : { parentSession: header.parentSession }),
    ...(header.origin === undefined ? {} : { origin: header.origin }),
    ...(header.agentPreset === undefined
      ? {}
      : { agentPreset: header.agentPreset }),
    inheritedEventCount: cut
  }
}
