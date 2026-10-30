import type {
  SessionStream,
  SessionEvent,
  SessionEventAppend,
  SessionEventRead,
  SessionEventStore
} from '@cvg/harness-contracts'
import {
  SessionEventError,
  materializeSessionEvent,
  sessionEventInputDigest,
  validateSessionEvent,
  validateSessionEventAppend,
  validateSessionEventRead,
  validateSessionStream
} from '@cvg/harness'
import { canonicalizeJson } from '@cvg/shared'
import type {
  PostgresPoolLike,
  PostgresPoolClient
} from './tenant-scoped-postgres.ts'
import type { PostgresQueryable } from './postgres.ts'
import { runPostgresMigrations } from './postgres-migrations.ts'

const migrations = ['0028_session_events', '0034_session_writer_ownership']
function schemaName(raw: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(raw))
    throw new SessionEventError(
      'invalid_session_event',
      'Invalid session schema name'
    )
  return raw
}
/** Run as migration authority in a dedicated schema, never in request serving. */
export async function runSessionEventMigrations(
  client: PostgresQueryable,
  options: { readonly schemaName: string }
): Promise<void> {
  await runPostgresMigrations(client, {
    schemaName: schemaName(options.schemaName),
    migrations
  })
}
interface EventRow {
  record: unknown
  input_digest: string
}

/** Tenant/schema bound at trusted composition. Pool owns connection acquisition. */
export class PostgresSessionEventStore implements SessionEventStore {
  readonly #pool: PostgresPoolLike
  readonly #tenantId: string
  readonly #schema: string
  constructor(
    pool: PostgresPoolLike,
    options: { readonly tenantId: string; readonly schemaName: string }
  ) {
    this.#tenantId = validateSessionStream({
      tenantId: options.tenantId,
      sessionId: 'boot',
      formatVersion: 1
    }).tenantId
    this.#schema = schemaName(options.schemaName)
    this.#pool = pool
  }
  #bound(tenantId: string): void {
    if (tenantId !== this.#tenantId)
      throw new SessionEventError(
        'invalid_session_event',
        'Tenant differs from bound session store'
      )
  }
  async #transaction<T>(
    operation: (client: PostgresPoolClient) => Promise<T>
  ): Promise<T> {
    let client: PostgresPoolClient
    try {
      client = await this.#pool.connect()
    } catch {
      throw new SessionEventError(
        'session_storage_unavailable',
        'Session database unavailable'
      )
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        this.#tenantId
      ])
      const value = await operation(client)
      await client.query('COMMIT')
      return value
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        releaseError = new Error('Session transaction cleanup failed')
      }
      if (error instanceof SessionEventError) throw error
      throw new SessionEventError(
        'session_storage_unavailable',
        'Session transaction failed; retry only with the original event identity/input'
      )
    } finally {
      client.release(releaseError)
    }
  }
  async openSession(raw: SessionStream): Promise<SessionStream> {
    const input = validateSessionStream(raw)
    this.#bound(input.tenantId)
    return this.#transaction(async (client) => {
      await client.query(
        `INSERT INTO "${this.#schema}".session_streams (tenant_id,session_id,format_version) VALUES ($1,$2,$3) ON CONFLICT (tenant_id,session_id) DO NOTHING`,
        [input.tenantId, input.sessionId, input.formatVersion]
      )
      const result = await client.query<{ format_version: number }>(
        `SELECT format_version FROM "${this.#schema}".session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [input.tenantId, input.sessionId]
      )
      if (result.rows[0]?.format_version !== 1)
        throw new SessionEventError(
          'session_event_conflict',
          'Session format differs or is unavailable'
        )
      return { ...input }
    })
  }
  #event(row: EventRow, sessionId: string): SessionEvent {
    const event = validateSessionEvent(row.record)
    this.#bound(event.tenantId)
    if (event.sessionId !== sessionId)
      throw new SessionEventError(
        'invalid_session_event',
        'Stored session identity differs'
      )
    const { sequence, schemaFingerprint, ...input } = event
    void sequence
    void schemaFingerprint
    if (sessionEventInputDigest(input) !== row.input_digest)
      throw new SessionEventError(
        'invalid_session_event',
        'Stored input digest differs'
      )
    return event
  }
  async append(raw: SessionEventAppend): Promise<SessionEvent> {
    // Snapshot before awaits: mutations by a caller cannot change committed input.
    const input = validateSessionEventAppend(raw)
    this.#bound(input.tenantId)
    const digest = sessionEventInputDigest(input)
    return this.#transaction(async (client) => {
      const stream = await client.query<{
        next_sequence: string
        format_version: number
      }>(
        `SELECT next_sequence,format_version FROM "${this.#schema}".session_streams WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE`,
        [input.tenantId, input.sessionId]
      )
      const current = stream.rows[0]
      if (!current)
        throw new SessionEventError(
          'session_not_open',
          'Session stream is not open'
        )
      if (current.format_version !== input.formatVersion)
        throw new SessionEventError(
          'session_event_conflict',
          'Session format differs'
        )
      const prior = await client.query<EventRow>(
        `SELECT record,input_digest FROM "${this.#schema}".session_events WHERE tenant_id=$1 AND session_id=$2 AND event_id=$3`,
        [input.tenantId, input.sessionId, input.eventId]
      )
      const previous = prior.rows[0]
      if (previous) {
        if (previous.input_digest !== digest)
          throw new SessionEventError(
            'session_event_conflict',
            'Session event identity was reused with different input'
          )
        return this.#event(previous, input.sessionId)
      }
      const event = materializeSessionEvent(
        input,
        Number(current.next_sequence)
      )
      await client.query(
        `INSERT INTO "${this.#schema}".session_events (tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          event.tenantId,
          event.sessionId,
          event.sequence,
          event.eventId,
          event.formatVersion,
          event.type,
          event.schemaFingerprint,
          digest,
          canonicalizeJson(event)
        ]
      )
      const advanced = await client.query(
        `UPDATE "${this.#schema}".session_streams SET next_sequence=next_sequence+1 WHERE tenant_id=$1 AND session_id=$2`,
        [input.tenantId, input.sessionId]
      )
      if (advanced.rowCount !== 1)
        throw new SessionEventError(
          'session_storage_unavailable',
          'Session cursor was not advanced'
        )
      return event
    })
  }
  async read(raw: SessionEventRead): Promise<readonly SessionEvent[]> {
    const input = validateSessionEventRead(raw)
    this.#bound(input.tenantId)
    return this.#transaction(async (client) => {
      const streams = await client.query(
        `SELECT 1 FROM "${this.#schema}".session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [input.tenantId, input.sessionId]
      )
      if (streams.rows.length !== 1)
        throw new SessionEventError(
          'session_not_open',
          'Session stream is not open'
        )
      const result = await client.query<EventRow>(
        `SELECT record,input_digest FROM "${this.#schema}".session_events WHERE tenant_id=$1 AND session_id=$2 AND sequence>$3 ORDER BY sequence ASC LIMIT $4`,
        [input.tenantId, input.sessionId, input.afterSequence, input.limit]
      )
      return result.rows.map((row) => this.#event(row, input.sessionId))
    })
  }
}
