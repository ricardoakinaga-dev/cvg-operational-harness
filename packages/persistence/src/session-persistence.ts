import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'
import type {
  SessionEventAppend,
  SessionEventRead,
  SessionEventStore,
  SessionStream,
  SessionAccess,
  SessionCreateOptions,
  SessionEvent,
  SessionHandle,
  SessionHeaderV1,
  SessionPersistence,
  SessionPersistenceForkOptions,
  SessionProjection,
  SessionProjectionCacheState,
  SessionProjectionResult,
  SessionResume,
  SessionPersistenceOptions
} from '@cvg/harness-contracts'
import {
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  SessionFormatUnsupportedError,
  SessionHandleClosedError,
  SessionHeaderValidationError,
  SessionMigrationRequiredError,
  SessionOwnershipLostError,
  SessionPersistenceCorruptionError,
  SessionPersistenceError,
  SessionAppendConflictError,
  captureSessionJson,
  SessionPersistenceNotFoundError,
  SessionReadOnlyError,
  SessionStorageUnavailableError,
  SessionCommitUnknownError,
  SessionEventError,
  SessionForkRefusedError,
  analyzeSessionLog,
  checkSessionFork,
  SESSION_PROJECTION_ID,
  SESSION_PROJECTION_MAX_STATE_BYTES,
  emptySessionProjection,
  foldSessionProjection,
  judgeSessionCheckpoint,
  projectSession,
  sessionCheckpointRow,
  sessionProjectionStateBytes,
  planSessionFork,
  materializeSessionEvent,
  sessionEventInputDigest,
  validateSessionEvent,
  validateSessionEventAppend,
  validateSessionEventRead,
  validateSessionStream,
  validateSessionHeader
} from '@cvg/harness'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from './tenant-scoped-postgres.ts'
import type { PostgresQueryable } from './postgres.ts'
import {
  abortError,
  type PhysicalSessionLease,
  type PostgresPhysicalSessionPool
} from './session-connection-lease.ts'
import {
  isAcceptedMigrationChecksum,
  readPostgresMigrationSql
} from './postgres-migrations.ts'

export type { PhysicalSessionLease, PostgresPhysicalSessionPool }
export { createPgPhysicalSessionPool } from './session-connection-lease.ts'

const MIGRATION = '0034_session_writer_ownership'
const PAGE = 256
const SESSION_BATCH_MAX_BYTES = 8 * 1024 * 1024
const OPERATION_TIMEOUT_MS = 5_000
/** SPEC 0292 §4: events between two checkpoints of one stream. */
export const SESSION_PROJECTION_CHECKPOINT_EVERY = 256
const MAX_SAFE = Number.MAX_SAFE_INTEGER
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/
const TENANT = /^[\x21-\x7e]{1,200}$/

export interface PostgresSessionPersistenceOptions {
  readonly tenantId: string
  readonly schemaName: string
  /** Declared by the composition; saturation refuses without a partial claim. */
  readonly maxOpenWriters: number
  readonly acquireTimeoutMs?: number
  /**
   * SPEC 0292 I8: the owner of a stream writes a projection checkpoint when this many events have
   * been appended since the last one (default 256), after the commit that crossed it and as a best
   * effort; `flush` and `close` try as well when it is due.
   */
  readonly projectionCheckpointEvery?: number
  /**
   * Called, without any message text, each time the projection cache cannot be read or written.
   * The failure never fails a projection, an append, a flush or a close; this is how it stays
   * visible. Errors thrown by the callback are ignored.
   */
  readonly onProjectionCacheFailure?: (failure: {
    readonly operation: 'read' | 'write'
    readonly sessionId: string
    readonly code?: string
  }) => void
}

/** Counters of the projection cache, for the composition and for `verifyProjectionCache`. */
export interface SessionProjectionCacheStats {
  readonly readFailures: number
  readonly writeFailures: number
}

interface StreamRow {
  writer_lock_id: number
  header_json: string | null
  inherited_event_count: string | null
  next_sequence: string
  format_version: number
}
interface EventRow {
  record: unknown
  input_digest: string
}
type Runner = PostgresQueryable
const quote = (schema: string): string => `"${schema}"`

/** SPEC 0221: first slice. Service only; owner shutdown, stat/list and tickets are deferred. */
export async function createPostgresSessionPersistence(
  physical: PostgresPhysicalSessionPool,
  readPool: PostgresPoolLike,
  options: PostgresSessionPersistenceOptions
): Promise<{ readonly service: SessionPersistence }> {
  if (!SCHEMA.test(options.schemaName) || !TENANT.test(options.tenantId))
    throw new SessionHeaderValidationError(
      'Invalid session persistence binding'
    )
  if (
    !Number.isSafeInteger(options.maxOpenWriters) ||
    options.maxOpenWriters < 1
  )
    throw new SessionHeaderValidationError(
      'maxOpenWriters must be a positive integer'
    )
  const every =
    options.projectionCheckpointEvery ?? SESSION_PROJECTION_CHECKPOINT_EVERY
  if (!Number.isSafeInteger(every) || every < 1)
    throw new SessionHeaderValidationError(
      'projectionCheckpointEvery must be a positive integer'
    )
  const keyBase = await preflight(readPool, options)
  return {
    service: new PostgresSessionPersistence(
      physical,
      readPool,
      options,
      keyBase
    )
  }
}

async function preflight(
  pool: PostgresPoolLike,
  options: PostgresSessionPersistenceOptions
): Promise<number> {
  let client: PostgresPoolClient
  try {
    client = await pool.connect()
  } catch (cause) {
    throw new SessionStorageUnavailableError(
      'Session database unavailable',
      undefined,
      { cause }
    )
  }
  try {
    return await qualify(client, options)
  } finally {
    client.release()
  }
}

/**
 * The same checks run on the read connection (once) and on EVERY writer lease before it
 * writes: the writer may use another role, database or cluster. Returns the first part of
 * the advisory key, (oid(session_streams) - 2^31), as seen by THIS session.
 */
async function qualify(
  client: PostgresQueryable,
  options: PostgresSessionPersistenceOptions
): Promise<number> {
  const schema = options.schemaName
  const fail = (reason: string): never => {
    throw new SessionMigrationRequiredError(
      `Session persistence preflight: ${reason}`
    )
  }
  try {
    const regs = await client.query<{
      streams: string | null
      events: string | null
    }>(
      `SELECT to_regclass($1)::oid::text AS streams, to_regclass($2)::oid::text AS events`,
      [`${quote(schema)}.session_streams`, `${quote(schema)}.session_events`]
    )
    const streamsOid = regs.rows[0]?.streams
    if (!streamsOid || !regs.rows[0]?.events) return fail('tables are missing')
    const cols = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='session_streams'`,
      [schema]
    )
    const names = new Set(cols.rows.map((r) => r.column_name))
    for (const name of [
      'writer_lock_id',
      'header_json',
      'inherited_event_count'
    ])
      if (!names.has(name)) return fail(`column ${name} is missing`)
    const sql = await readPostgresMigrationSql(MIGRATION)
    const applied = await client.query<{ checksum: string | null }>(
      `SELECT checksum FROM ${quote(schema)}.schema_migrations WHERE version=$1`,
      [MIGRATION]
    )
    const checksum = createHash('sha256').update(sql).digest('hex')
    const found = applied.rows[0]?.checksum
    if (!found || !isAcceptedMigrationChecksum(MIGRATION, found, checksum))
      return fail('migration checksum differs')
    const rls = await client.query<{
      relname: string
      on: boolean
      forced: boolean
    }>(
      `SELECT relname, relrowsecurity AS on, relforcerowsecurity AS forced FROM pg_class WHERE oid IN ($1::oid, to_regclass($2)::oid)`,
      [streamsOid, `${quote(schema)}.session_events`]
    )
    if (rls.rows.length !== 2 || rls.rows.some((r) => !r.on || !r.forced))
      return fail('row level security is not forced')
    const triggers = await client.query<{ tgname: string; tgenabled: string }>(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ($1::oid, to_regclass($2)::oid)`,
      [streamsOid, `${quote(schema)}.session_events`]
    )
    const enabled = new Set(
      triggers.rows.filter((t) => t.tgenabled === 'O').map((t) => t.tgname)
    )
    for (const required of [
      'session_events_writer_guard',
      'session_events_cursor_at_commit',
      'session_events_no_mutation',
      'session_streams_writer_guard',
      'session_streams_cursor_at_commit',
      'session_streams_no_delete',
      'session_streams_no_truncate',
      'session_events_no_truncate',
      'session_streams_default_header'
    ])
      if (!enabled.has(required))
        return fail(`trigger ${required} is not enabled`)
    const constraints = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint WHERE convalidated AND conrelid = $1::oid`,
      [streamsOid]
    )
    const valid = new Set(constraints.rows.map((c) => c.conname))
    for (const required of [
      'session_streams_writer_lock_id_key',
      'session_streams_writer_lock_id_positive',
      'session_streams_header_cut_paired',
      'session_streams_header_size',
      'session_streams_cut_range'
    ])
      if (!valid.has(required))
        return fail(`constraint ${required} is not valid`)
    const role = await client.query<{
      rolsuper: boolean
      rolbypassrls: boolean
      owner: boolean
      recovery: boolean
      fsync: string
      fpw: string
      sync: string
    }>(
      `SELECT r.rolsuper, r.rolbypassrls,
              pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid=$1::oid), 'USAGE') AS owner,
              pg_is_in_recovery() AS recovery,
              current_setting('fsync') AS fsync,
              current_setting('full_page_writes') AS fpw,
              current_setting('synchronous_commit') AS sync
         FROM pg_roles r WHERE r.rolname=current_user`,
      [streamsOid]
    )
    const r = role.rows[0]
    if (!r) return fail('role is unknown')
    if (r.rolsuper || r.rolbypassrls)
      return fail('role is superuser or bypasses RLS')
    if (r.owner) return fail('role owns the session tables')
    if (r.recovery) return fail('connected to a standby')
    if (r.fsync !== 'on' || r.fpw !== 'on' || r.sync === 'off')
      return fail('durability settings are not safe')
    return Number(streamsOid) - 2_147_483_648
  } catch (error) {
    if (error instanceof SessionPersistenceError) throw error
    throw new SessionStorageUnavailableError(
      'Session preflight failed',
      undefined,
      {
        cause: error
      }
    )
  }
}

class PostgresSessionPersistence implements SessionPersistence {
  readonly identity = Symbol('cvg.session-persistence')
  #writers = 0
  constructor(
    private readonly physical: PostgresPhysicalSessionPool,
    private readonly readPool: PostgresPoolLike,
    private readonly options: PostgresSessionPersistenceOptions,
    private readonly keyBase: number
  ) {}

  async create(
    header: SessionHeaderV1,
    createOptions: SessionCreateOptions = {}
  ): Promise<SessionHandle> {
    // Capture and validate once, before the first await.
    const { header: captured, inheritedEventCount } = validateSessionHeader(
      header,
      createOptions.inheritedEventCount
    )
    const signal = createOptions.signal
    if (signal?.aborted) throw abortError()
    this.#reserveWriter()
    let lease: PhysicalSessionLease | undefined
    try {
      lease = await this.#acquire(signal)
      const text = JSON.stringify(captured)
      const id = captured.id
      let key: number
      await this.#begin(lease)
      try {
        let inserted
        try {
          inserted = await lease.query<{ writer_lock_id: number }>(
            `INSERT INTO ${quote(this.options.schemaName)}.session_streams (tenant_id,session_id,format_version,header_json,inherited_event_count)
             VALUES ($1,$2,1,$3,$4) RETURNING writer_lock_id`,
            [this.options.tenantId, id, text, inheritedEventCount]
          )
        } catch (error) {
          if ((error as { code?: string }).code === '23505') {
            await lease.query('ROLLBACK').catch(() => undefined)
            await lease.release()
            lease = undefined
            throw new SessionAlreadyExistsError('Session already exists', id)
          }
          throw error
        }
        key = Number(inserted.rows[0]?.writer_lock_id)
        // Exactly one session try-lock, before COMMIT; the handle exists only after COMMIT.
        const got = await lease.query<{ ok: boolean }>(
          'SELECT pg_try_advisory_lock($1,$2) AS ok',
          [this.keyBase, key]
        )
        if (got.rows[0]?.ok !== true)
          throw new SessionAlreadyOwnedError(
            'Session is owned by another writer',
            id
          )
        try {
          await lease.query('COMMIT')
        } catch (cause) {
          throw new SessionCommitUnknownError(
            'The session creation outcome is unknown',
            id,
            { cause }
          )
        }
      } catch (error) {
        if (!(error instanceof SessionCommitUnknownError))
          await lease?.query('ROLLBACK').catch(() => undefined)
        throw error
      }
      return this.#writerHandle(lease, captured, inheritedEventCount, key, 0)
    } catch (error) {
      if (lease) await lease.destroy()
      this.#writers--
      if (error instanceof SessionPersistenceError || isAbort(error))
        throw error
      throw new SessionStorageUnavailableError(
        'Session could not be created',
        undefined,
        { cause: error }
      )
    }
  }

  async open(
    id: string,
    access: SessionAccess,
    openOptions: SessionPersistenceOptions = {}
  ): Promise<SessionHandle> {
    if (typeof id !== 'string' || id.length === 0 || id.length > 200)
      throw new SessionHeaderValidationError('Invalid session id')
    if (access !== 'read' && access !== 'write')
      throw new SessionHeaderValidationError('Invalid session access')
    const signal = openOptions.signal
    if (signal?.aborted) throw abortError()
    if (access === 'read') {
      const row = await this.#metadata(id)
      return this.#readerHandle(row.header, row.cut, row.key)
    }
    this.#reserveWriter()
    let lease: PhysicalSessionLease | undefined
    try {
      lease = await this.#acquire(signal)
      const before = await this.#metadata(id, lease)
      // A separate call: no side effect inside a SELECT with LIMIT.
      const got = await lease.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_lock($1,$2) AS ok',
        [this.keyBase, before.key]
      )
      if (got.rows[0]?.ok !== true)
        throw new SessionAlreadyOwnedError(
          'Session is owned by another writer',
          id
        )
      // Revalidate identity, head and header after the claim and before publishing.
      const after = await this.#metadata(id, lease)
      if (
        after.key !== before.key ||
        after.headerText !== before.headerText ||
        after.cut !== before.cut ||
        after.head < before.head
      )
        throw new SessionPersistenceCorruptionError(
          'Session changed while it was being claimed',
          id
        )
      return this.#writerHandle(
        lease,
        after.header,
        after.cut,
        after.key,
        after.head
      )
    } catch (error) {
      if (lease) await lease.destroy()
      this.#writers--
      if (error instanceof SessionPersistenceError || isAbort(error))
        throw error
      throw new SessionStorageUnavailableError(
        'Session could not be opened',
        id,
        {
          cause: error
        }
      )
    }
  }

  /** SPEC 0287 §4: one REPEATABLE READ transaction reads the source, plans and writes the child. */
  async fork(
    sourceId: string,
    header: SessionHeaderV1,
    forkOptions: SessionPersistenceForkOptions = {}
  ): Promise<SessionHandle> {
    if (
      typeof sourceId !== 'string' ||
      sourceId.length === 0 ||
      sourceId.length > 200
    )
      throw new SessionHeaderValidationError('Invalid session id')
    // Capture once, before the first await. The service owns lineage, seeding and parent.
    const requested = validateSessionHeader(header, 0)
    const asked = requested.header
    if ('lineage' in asked)
      throw new SessionHeaderValidationError(
        'A fork header cannot carry lineage: only the service writes it'
      )
    // `isSeeded` is the service's to set: whatever the caller wrote is overwritten below.
    if (asked.parentSession !== undefined && asked.parentSession !== sourceId)
      throw new SessionHeaderValidationError(
        'A fork header descends from its source only'
      )
    const targetId = asked.id
    if (targetId === sourceId)
      throw new SessionForkRefusedError('fork_target_is_source', sourceId)
    const through = forkOptions.through
      ? { correlationId: String(forkOptions.through.correlationId) }
      : undefined
    const signal = forkOptions.signal
    if (signal?.aborted) throw abortError()
    this.#reserveWriter()
    let lease: PhysicalSessionLease | undefined
    try {
      lease = await this.#acquire(signal)
      const schema = quote(this.options.schemaName)
      const tenant = this.options.tenantId
      await lease.query('BEGIN ISOLATION LEVEL REPEATABLE READ')
      let key: number
      let captured: SessionHeaderV1
      let cut: number
      try {
        await lease.query("SET LOCAL statement_timeout = '5s'")
        await lease.query("SET LOCAL lock_timeout = '5s'")
        await lease.query('SET LOCAL synchronous_commit = on')
        await lease.query("SELECT set_config('cvg.tenant_id', $1, true)", [
          tenant
        ])
        const source = await this.#readSource(lease, sourceId)
        const plan = planSessionFork(source.events, {
          targetSessionId: targetId,
          ...(through ? { through } : {}),
          ...(source.lineage ? { sourceLineage: source.lineage } : {})
        })
        let bytes = 0
        for (const e of plan.inherited)
          bytes += Buffer.byteLength(canonicalizeJson(e), 'utf8')
        if (bytes > SESSION_BATCH_MAX_BYTES)
          throw new SessionForkRefusedError('fork_too_large', sourceId)
        cut = plan.cutSequence
        const validated = validateSessionHeader(
          {
            ...asked,
            isSeeded: true,
            parentSession: sourceId,
            lineage: { ...plan.lineage }
          },
          cut
        )
        captured = validated.header
        let inserted
        try {
          inserted = await lease.query<{ writer_lock_id: number }>(
            `INSERT INTO ${schema}.session_streams (tenant_id,session_id,format_version,header_json,inherited_event_count)
             VALUES ($1,$2,1,$3,$4) RETURNING writer_lock_id`,
            [tenant, targetId, JSON.stringify(captured), cut]
          )
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new SessionAlreadyExistsError(
              'Session already exists',
              targetId
            )
          throw error
        }
        key = Number(inserted.rows[0]?.writer_lock_id)
        const got = await lease.query<{ ok: boolean }>(
          'SELECT pg_try_advisory_lock($1,$2) AS ok',
          [this.keyBase, key]
        )
        if (got.rows[0]?.ok !== true)
          throw new SessionAlreadyOwnedError(
            'Session is owned by another writer',
            targetId
          )
        let next = 1
        for (const event of plan.inherited) {
          const { sequence: _s, schemaFingerprint: _f, ...input } = event
          void _s
          void _f
          await lease.query(
            `INSERT INTO ${schema}.session_events (tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
            [
              tenant,
              targetId,
              event.sequence,
              event.eventId,
              event.formatVersion,
              event.type,
              event.schemaFingerprint,
              sessionEventInputDigest(input),
              canonicalizeJson(event)
            ]
          )
          next++
          await lease.query(
            `UPDATE ${schema}.session_streams SET next_sequence=$3 WHERE tenant_id=$1 AND session_id=$2`,
            [tenant, targetId, next]
          )
        }
        try {
          await lease.query('COMMIT')
        } catch (cause) {
          throw new SessionCommitUnknownError(
            'The session fork outcome is unknown',
            targetId,
            { cause }
          )
        }
      } catch (error) {
        if (!(error instanceof SessionCommitUnknownError))
          await lease.query('ROLLBACK').catch(() => undefined)
        throw error
      }
      return this.#writerHandle(lease, captured, cut, key, cut)
    } catch (error) {
      if (lease) await lease.destroy()
      this.#writers--
      if (error instanceof SessionPersistenceError || isAbort(error))
        throw error
      if ((error as { code?: string }).code === '23505')
        throw new SessionAlreadyExistsError('Session already exists', targetId)
      throw new SessionStorageUnavailableError(
        'Session could not be forked',
        targetId,
        { cause: error }
      )
    }
  }

  /** Whole validated source inside the caller's snapshot: header, lineage and every event. */
  async #readSource(
    runner: Runner,
    sourceId: string
  ): Promise<{
    events: SessionEvent[]
    lineage?: { depth: number; root: string }
  }> {
    const schema = quote(this.options.schemaName)
    const tenant = this.options.tenantId
    const stream = await runner.query<StreamRow>(
      `SELECT writer_lock_id, header_json, inherited_event_count, next_sequence, format_version
         FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
      [tenant, sourceId]
    )
    const row = stream.rows[0]
    if (!row)
      throw new SessionPersistenceNotFoundError('Session not found', sourceId)
    const meta = parseStream(row, sourceId)
    const events: SessionEvent[] = []
    while (events.length < meta.head) {
      const from = events.length + 1
      const page = await runner.query<EventRow>(
        `SELECT record, input_digest FROM ${schema}.session_events
          WHERE tenant_id=$1 AND session_id=$2 AND sequence>=$3 AND sequence<$4 ORDER BY sequence ASC`,
        [tenant, sourceId, from, Math.min(from + PAGE, meta.head + 1)]
      )
      if (page.rows.length !== Math.min(PAGE, meta.head + 1 - from))
        throw new SessionPersistenceCorruptionError(
          'Session prefix has a gap',
          sourceId
        )
      for (const item of page.rows)
        events.push(checkEvent(item, sourceId, tenant, events.length + 1))
    }
    const l = meta.header.lineage as
      | { depth?: unknown; root?: unknown }
      | undefined
    const lineage =
      l && Number.isSafeInteger(l.depth) && typeof l.root === 'string'
        ? { depth: l.depth as number, root: l.root }
        : undefined
    return { events, ...(lineage ? { lineage } : {}) }
  }

  /** SPEC 0287 §5: the writer handle and the analysis of its log; nothing is written or closed. */
  async resumeSession(
    id: string,
    resumeOptions: SessionPersistenceOptions = {}
  ): Promise<SessionResume> {
    const handle = await this.open(id, 'write', resumeOptions)
    try {
      const { events } = await handle.read(0)
      const analysis = analyzeSessionLog(events)
      // The whole log is in hand for the per-turn analysis (S04): the owner keeps the projection
      // of it, so that its first checkpoint does not read the log a second time (SPEC 0292 I8).
      // The reducer is the one that just analysed it, so this cannot refuse what that accepted.
      writerCapabilities.get(handle)?.seedProjection(projectSession(events))
      return { handle, analysis }
    } catch (error) {
      await handle.close().catch(() => undefined)
      throw error
    }
  }

  #cacheFailures = { read: 0, write: 0 }
  get projectionCheckpointEvery(): number {
    return (
      this.options.projectionCheckpointEvery ??
      SESSION_PROJECTION_CHECKPOINT_EVERY
    )
  }
  projectionCacheStats(): SessionProjectionCacheStats {
    return {
      readFailures: this.#cacheFailures.read,
      writeFailures: this.#cacheFailures.write
    }
  }
  #cacheFailed(
    operation: 'read' | 'write',
    sessionId: string,
    error: unknown
  ): void {
    this.#cacheFailures[operation] += 1
    const code = (error as { code?: unknown } | null)?.code
    try {
      this.options.onProjectionCacheFailure?.({
        operation,
        sessionId,
        ...(typeof code === 'string' ? { code } : {})
      })
    } catch {
      // a failing observer must not turn a cache failure into a request failure
    }
  }

  /**
   * SPEC 0292 §4. One REPEATABLE READ transaction reads the stream, the checkpoint and the part of
   * the log it needs. An intact checkpoint at the head is `cache`; one behind the head is folded
   * with the validated tail (`incremental`); anything else reads the whole log through the same
   * validation as `read` and projects it (`rebuild`). Nothing is written.
   */
  async project(
    id: string,
    projectOptions: SessionPersistenceOptions = {}
  ): Promise<SessionProjectionResult> {
    if (typeof id !== 'string' || id.length === 0 || id.length > 200)
      throw new SessionHeaderValidationError('Invalid session id')
    const signal = projectOptions.signal
    if (signal?.aborted) throw abortError()
    const schema = quote(this.options.schemaName)
    const tenant = this.options.tenantId
    let client: PostgresPoolClient
    try {
      client = await this.readPool.connect()
    } catch (cause) {
      throw new SessionStorageUnavailableError(
        'Session database unavailable',
        id,
        { cause }
      )
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        tenant
      ])
      const stream = await client.query<StreamRow>(
        `SELECT writer_lock_id, header_json, inherited_event_count, next_sequence, format_version
           FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [tenant, id]
      )
      const row = stream.rows[0]
      if (!row)
        throw new SessionPersistenceNotFoundError('Session not found', id)
      const meta = parseStream(row, id)
      let cache: SessionProjectionCacheState = 'absent'
      const checkpoint = await this.#readCheckpoint(client, id, meta)
      if (checkpoint.state === 'valid') {
        try {
          const result = await this.#fromCheckpoint(
            client,
            id,
            meta.head,
            checkpoint.projection,
            checkpoint.pointDigest
          )
          if (result) {
            await client.query('COMMIT')
            return result
          }
          cache = 'invalid'
        } catch (error) {
          // a checkpoint that does not continue the log is not served: the log decides
          if (!(error instanceof SessionPersistenceCorruptionError)) throw error
          cache = 'invalid'
        }
      } else cache = checkpoint.state
      if (signal?.aborted) throw abortError()
      const events = await this.#readRange(client, id, 1, meta.head)
      const projection = projectSession(events)
      await client.query('COMMIT')
      return {
        projection,
        origin: 'rebuild',
        throughSequence: projection.throughSequence,
        cache
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        releaseError = new Error('Session projection cleanup failed')
      })
      if (error instanceof SessionPersistenceError || isAbort(error))
        throw error
      throw new SessionStorageUnavailableError(
        'Session projection failed',
        id,
        { cause: error }
      )
    } finally {
      client.release(releaseError)
    }
  }

  /** The checkpoint row, judged. A read that fails is counted and logged, never raised. */
  async #readCheckpoint(
    client: PostgresPoolClient,
    id: string,
    meta: { headerText: string; head: number }
  ): Promise<
    | { state: 'absent' | 'invalid' | 'unavailable' }
    | { state: 'valid'; projection: SessionProjection; pointDigest: string }
  > {
    const schema = quote(this.options.schemaName)
    let found
    try {
      await client.query('SAVEPOINT projection_cache')
      found = await client.query<{
        projection_version: number
        through_sequence: string
        tail_input_digest: string
        header_digest: string
        state: unknown
        state_digest: string
      }>(
        `SELECT projection_version, through_sequence, tail_input_digest, header_digest, state, state_digest
           FROM ${schema}.session_projection_checkpoints
          WHERE tenant_id=$1 AND session_id=$2 AND projection_id=$3`,
        [this.options.tenantId, id, SESSION_PROJECTION_ID]
      )
      await client.query('RELEASE SAVEPOINT projection_cache')
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT projection_cache')
      this.#cacheFailed('read', id, error)
      return { state: 'unavailable' }
    }
    const row = found.rows[0]
    if (!row) return { state: 'absent' }
    const verdict = judgeSessionCheckpoint(
      {
        projectionVersion: row.projection_version,
        throughSequence: Number(row.through_sequence),
        tailInputDigest: row.tail_input_digest,
        headerDigest: row.header_digest,
        state: row.state,
        stateDigest: row.state_digest
      },
      meta
    )
    if (!verdict.ok) return { state: 'invalid' }
    return {
      state: 'valid',
      projection: verdict.projection,
      pointDigest: row.tail_input_digest
    }
  }

  /**
   * `cache` or `incremental` from a checkpoint the pure judgement accepted, or `undefined` when
   * the event at its point is not the one it names. Reads the point event and the tail only.
   */
  async #fromCheckpoint(
    client: PostgresPoolClient,
    id: string,
    head: number,
    checkpoint: SessionProjection,
    pointDigest: string
  ): Promise<SessionProjectionResult | undefined> {
    const schema = quote(this.options.schemaName)
    const point = await client.query<{ input_digest: string }>(
      `SELECT input_digest FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 AND sequence=$3`,
      [this.options.tenantId, id, checkpoint.throughSequence]
    )
    if (point.rows[0]?.input_digest !== pointDigest) return undefined
    if (checkpoint.throughSequence === head)
      return {
        projection: checkpoint,
        origin: 'cache',
        throughSequence: head,
        cache: 'hit'
      }
    const tail = await this.#readRange(
      client,
      id,
      checkpoint.throughSequence + 1,
      head
    )
    const projection = foldSessionProjection(checkpoint, tail)
    return {
      projection,
      origin: 'incremental',
      throughSequence: projection.throughSequence,
      cache: 'hit'
    }
  }

  /** Events `from..to` in pages, each one checked like `read` checks it; a hole is corruption. */
  async #readRange(
    client: PostgresPoolClient,
    id: string,
    from: number,
    to: number
  ): Promise<SessionEvent[]> {
    const schema = quote(this.options.schemaName)
    const out: SessionEvent[] = []
    let expected = from
    while (expected <= to) {
      const page = await client.query<EventRow>(
        `SELECT record, input_digest FROM ${schema}.session_events
          WHERE tenant_id=$1 AND session_id=$2 AND sequence>=$3 AND sequence<$4 ORDER BY sequence ASC`,
        [this.options.tenantId, id, expected, Math.min(expected + PAGE, to + 1)]
      )
      if (page.rows.length !== Math.min(PAGE, to + 1 - expected))
        throw new SessionPersistenceCorruptionError('Session log has a gap', id)
      for (const item of page.rows) {
        out.push(checkEvent(item, id, this.options.tenantId, expected))
        expected++
      }
    }
    return out
  }

  /** Position of the stored checkpoint of `id`, 0 when there is none or it cannot be read. */
  async #checkpointThrough(id: string): Promise<number> {
    let client: PostgresPoolClient
    try {
      client = await this.readPool.connect()
    } catch {
      return 0
    }
    try {
      await client.query('BEGIN READ ONLY')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        this.options.tenantId
      ])
      const found = await client.query<{ through_sequence: string }>(
        `SELECT through_sequence FROM ${quote(this.options.schemaName)}.session_projection_checkpoints
          WHERE tenant_id=$1 AND session_id=$2 AND projection_id=$3`,
        [this.options.tenantId, id, SESSION_PROJECTION_ID]
      )
      await client.query('COMMIT')
      return Number(found.rows[0]?.through_sequence ?? 0)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      this.#cacheFailed('read', id, error)
      return 0
    } finally {
      client.release()
    }
  }

  #reserveWriter(): void {
    if (this.#writers >= this.options.maxOpenWriters)
      throw new SessionStorageUnavailableError('Writer capacity is exhausted')
    this.#writers++
  }
  async #acquire(signal?: AbortSignal): Promise<PhysicalSessionLease> {
    const lease = await this.physical.acquire({
      timeoutMs: this.options.acquireTimeoutMs ?? OPERATION_TIMEOUT_MS,
      ...(signal ? { signal } : {})
    })
    try {
      await lease.query('BEGIN')
      await lease.query("SET LOCAL statement_timeout = '5s'")
      const base = await qualify(lease, this.options)
      await lease.query('COMMIT')
      if (base !== this.keyBase)
        throw new SessionMigrationRequiredError(
          'Session persistence preflight: the writer connection does not see the same session tables'
        )
    } catch (error) {
      await lease.destroy()
      throw error
    }
    return lease
  }
  async #begin(runner: Runner): Promise<void> {
    await runner.query('BEGIN')
    await runner.query("SET LOCAL statement_timeout = '5s'")
    await runner.query("SET LOCAL lock_timeout = '5s'")
    await runner.query('SET LOCAL synchronous_commit = on')
    await runner.query("SELECT set_config('cvg.tenant_id', $1, true)", [
      this.options.tenantId
    ])
  }
  /** Header, cut and head in one short transaction. Never creates, never locks. */
  async #metadata(
    id: string,
    runner?: Runner
  ): Promise<{
    header: SessionHeaderV1
    headerText: string
    cut: number
    key: number
    head: number
  }> {
    const run = async (r: Runner) => {
      await this.#begin(r)
      try {
        const res = await r.query<StreamRow>(
          `SELECT writer_lock_id, header_json, inherited_event_count, next_sequence, format_version
             FROM ${quote(this.options.schemaName)}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
          [this.options.tenantId, id]
        )
        await r.query('COMMIT')
        return res.rows[0]
      } catch (error) {
        await r.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    }
    let row: StreamRow | undefined
    try {
      if (runner) row = await run(runner)
      else {
        const client = await this.readPool.connect()
        let releaseError: Error | undefined
        try {
          row = await run(client)
        } catch (error) {
          releaseError = new Error('Session metadata cleanup failed')
          throw error
        } finally {
          client.release(releaseError)
        }
      }
    } catch (cause) {
      throw new SessionStorageUnavailableError(
        'Session database unavailable',
        id,
        {
          cause
        }
      )
    }
    if (!row) throw new SessionPersistenceNotFoundError('Session not found', id)
    return parseStream(row, id)
  }

  /** `head` is the last sequence of the log when the handle is issued; 0 for a new stream. */
  #writerHandle(
    lease: PhysicalSessionLease,
    header: SessionHeaderV1,
    cut: number,
    key: number,
    head: number
  ): SessionHandle {
    return new PostgresSessionHandle({
      access: 'write',
      header,
      cut,
      key,
      head,
      checkpointEvery: this.projectionCheckpointEvery,
      project: (id) => this.project(id),
      checkpointThrough: (id) => this.#checkpointThrough(id),
      cacheFailed: (id, error) => this.#cacheFailed('write', id, error),
      keyBase: this.keyBase,
      lease,
      readPool: this.readPool,
      options: this.options,
      onClosed: () => {
        this.#writers--
      }
    })
  }
  #readerHandle(
    header: SessionHeaderV1,
    cut: number,
    key: number
  ): SessionHandle {
    return new PostgresSessionHandle({
      access: 'read',
      header,
      cut,
      key,
      keyBase: this.keyBase,
      readPool: this.readPool,
      options: this.options
    })
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function parseStream(
  row: StreamRow,
  id: string
): {
  header: SessionHeaderV1
  headerText: string
  cut: number
  key: number
  head: number
} {
  if (row.format_version !== 1)
    throw new SessionFormatUnsupportedError(
      'Session format is not supported',
      id
    )
  if (row.header_json === null || row.inherited_event_count === null)
    throw new SessionMigrationRequiredError(
      'Session has no adopted metadata',
      id
    )
  let parsed: unknown
  try {
    parsed = JSON.parse(row.header_json)
  } catch (cause) {
    throw new SessionPersistenceCorruptionError(
      'Stored header is not JSON',
      id,
      { cause }
    )
  }
  const version = (parsed as { version?: unknown } | null)?.version
  if (typeof version === 'number' && Number.isInteger(version) && version !== 1)
    throw new SessionFormatUnsupportedError(
      version > 1
        ? 'Session header is newer than supported'
        : 'Session header is older than supported',
      id
    )
  const cut = Number(row.inherited_event_count)
  try {
    const checked = validateSessionHeader(parsed, cut)
    if (checked.header.id !== id)
      throw new SessionPersistenceCorruptionError(
        'Stored header identity differs',
        id
      )
    return {
      header: checked.header,
      headerText: row.header_json,
      cut,
      key: row.writer_lock_id,
      head: Number(row.next_sequence) - 1
    }
  } catch (cause) {
    if (
      cause instanceof SessionPersistenceError &&
      !(cause instanceof SessionHeaderValidationError)
    )
      throw cause
    throw new SessionPersistenceCorruptionError(
      'Stored header is invalid',
      id,
      { cause }
    )
  }
}

interface HandleState {
  readonly access: SessionAccess
  readonly header: SessionHeaderV1
  readonly cut: number
  readonly key: number
  readonly keyBase: number
  readonly lease?: PhysicalSessionLease
  readonly readPool: PostgresPoolLike
  readonly options: PostgresSessionPersistenceOptions
  readonly onClosed?: () => void
  /** Writer only: the log head at issue, the checkpoint interval and the cache plumbing. */
  readonly head?: number
  readonly checkpointEvery?: number
  readonly project?: (id: string) => Promise<SessionProjectionResult>
  readonly checkpointThrough?: (id: string) => Promise<number>
  readonly cacheFailed?: (id: string, error: unknown) => void
}

class PostgresSessionHandle implements SessionHandle {
  readonly id: string
  readonly access: SessionAccess
  readonly inheritedEventCount: number
  readonly #s: HandleState
  #queue: Promise<unknown> = Promise.resolve()
  #closing: Promise<void> | undefined
  #lost: Error | undefined
  #unknown: SessionCommitUnknownError | undefined
  #highWater = 0
  /** SPEC 0292 I8: the owner's view of the log head, the folded projection and the cache. */
  #head: number
  #projection: SessionProjection | undefined
  #checkpointed: number | undefined
  #nextCheckpointAt = 0
  constructor(state: HandleState) {
    this.#s = state
    this.#head = state.head ?? 0
    if (state.access === 'write' && state.head === 0) {
      // a new stream: nothing to read, and no checkpoint to find
      this.#projection = emptySessionProjection()
      this.#checkpointed = 0
    }
    this.id = state.header.id
    this.access = state.access
    this.inheritedEventCount = state.cut
    state.lease?.onLost((error) => {
      this.#lost ??= error
    })
    if (state.access === 'write')
      writerCapabilities.set(this, {
        tenantId: state.options.tenantId,
        sessionId: state.header.id,
        active: () => !this.#closing && !this.#lost,
        appendInput: (input, digest) =>
          this.#admit(undefined, () => this.#appendInputAtomic(input, digest)),
        read: (afterSequence, limit) =>
          this.read(afterSequence, limit).then((r) => r.events),
        seedProjection: (projection) => {
          // the owner holds the lock, so the log it just read is the log it has
          this.#projection ??= projection
        }
      })
  }
  get header(): SessionHeaderV1 {
    return structuredClone(this.#s.header)
  }

  #admit<T>(
    options: SessionPersistenceOptions | undefined,
    task: () => Promise<T>
  ): Promise<T> {
    if (this.#closing)
      return Promise.reject(
        new SessionHandleClosedError('Session handle is closed', this.id)
      )
    const signal = options?.signal
    if (signal?.aborted) return Promise.reject(abortError())
    const run = this.#queue.then(() => {
      if (signal?.aborted) throw abortError()
      return task()
    })
    this.#queue = run.catch(() => undefined)
    return run
  }

  read(
    offset = 0,
    length?: number,
    options?: SessionPersistenceOptions
  ): Promise<{
    readonly eventState: 'detached'
    readonly events: readonly SessionEvent[]
  }> {
    // Validate arguments at admission, before any IO.
    if (!Number.isSafeInteger(offset) || offset < 0)
      return Promise.reject(
        new SessionHeaderValidationError('Invalid read offset', this.id)
      )
    if (length !== undefined && (!Number.isSafeInteger(length) || length < 0))
      return Promise.reject(
        new SessionHeaderValidationError('Invalid read length', this.id)
      )
    return this.#admit(options, async () => ({
      eventState: 'detached' as const,
      events: await this.#readSlice(offset, length)
    }))
  }

  async #readSlice(
    offset: number,
    length: number | undefined
  ): Promise<SessionEvent[]> {
    const { readPool, options } = this.#s
    const schema = quote(options.schemaName)
    let client: PostgresPoolClient
    try {
      client = await readPool.connect()
    } catch (cause) {
      throw new SessionStorageUnavailableError(
        'Session database unavailable',
        this.id,
        { cause }
      )
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        options.tenantId
      ])
      const stream = await client.query<StreamRow>(
        `SELECT writer_lock_id, header_json, inherited_event_count, next_sequence, format_version
           FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [options.tenantId, this.id]
      )
      const row = stream.rows[0]
      if (!row)
        throw new SessionPersistenceNotFoundError('Session not found', this.id)
      const meta = parseStream(row, this.id)
      if (
        JSON.stringify(meta.header) !== JSON.stringify(this.#s.header) ||
        meta.cut !== this.#s.cut
      )
        throw new SessionPersistenceCorruptionError(
          'Session header changed',
          this.id
        )
      if (meta.head < this.#highWater)
        throw new SessionPersistenceCorruptionError(
          'Session head regressed',
          this.id
        )
      const out: SessionEvent[] = []
      const end =
        length === undefined ? meta.head : Math.min(meta.head, offset + length)
      // The whole prefix is validated, also outside the returned slice.
      let expected = 1
      while (expected <= meta.head) {
        const page = await client.query<EventRow>(
          `SELECT record, input_digest FROM ${schema}.session_events
            WHERE tenant_id=$1 AND session_id=$2 AND sequence>=$3 AND sequence<$4 ORDER BY sequence ASC`,
          [
            options.tenantId,
            this.id,
            expected,
            Math.min(expected + PAGE, meta.head + 1)
          ]
        )
        const wanted = Math.min(PAGE, meta.head + 1 - expected)
        if (page.rows.length !== wanted)
          throw new SessionPersistenceCorruptionError(
            'Session prefix has a gap',
            this.id
          )
        for (const item of page.rows) {
          const event = checkEvent(item, this.id, options.tenantId, expected)
          if (expected > offset && expected <= end) out.push(event)
          expected++
        }
      }
      await client.query('COMMIT')
      this.#highWater = Math.max(this.#highWater, meta.head)
      return out
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {
        releaseError = new Error('Session read cleanup failed')
      })
      if (error instanceof SessionPersistenceError) throw error
      throw new SessionStorageUnavailableError('Session read failed', this.id, {
        cause: error
      })
    } finally {
      client.release(releaseError)
    }
  }

  /**
   * One ticket in the single queue. The batch is captured and validated at admission, before
   * any await, so a getter or a later mutation of the caller's objects cannot change what is
   * stored. An empty batch is a valid no-op on an active writer only.
   */
  append(
    events: readonly SessionEvent[],
    options?: SessionPersistenceOptions
  ): Promise<void> {
    const refusal = this.#writerRefusal()
    if (refusal) return Promise.reject(refusal)
    let batch: ValidatedBatch
    try {
      batch = this.#captureBatch(events)
    } catch (error) {
      return Promise.reject(error)
    }
    return this.#admit(options, () =>
      batch.events.length === 0 ? this.#assertActive() : this.#appendNow(batch)
    )
  }
  flush(options?: SessionPersistenceOptions): Promise<void> {
    const refusal = this.#writerRefusal()
    if (refusal) return Promise.reject(refusal)
    return this.#admit(options, async () => {
      await this.#checkpointIfDue()
      await this.#flushNow()
    })
  }

  /** closed > read-only > lost: the first applicable error wins. */
  #writerRefusal(): Error | undefined {
    if (this.#closing)
      return new SessionHandleClosedError('Session handle is closed', this.id)
    if (this.access === 'read')
      return new SessionReadOnlyError('Writing needs a writer handle', this.id)
    if (this.#lost)
      return new SessionOwnershipLostError(
        'Session ownership was lost',
        this.id,
        { cause: this.#lost }
      )
    return undefined
  }
  #assertActive(): Promise<void> {
    const lost = this.#writerRefusal()
    return lost ? Promise.reject(lost) : Promise.resolve()
  }

  #captureBatch(events: readonly SessionEvent[]): ValidatedBatch {
    if (!Array.isArray(events))
      throw new SessionHeaderValidationError('Events must be an array', this.id)
    const out: Array<{ event: SessionEvent; digest: string; text: string }> = []
    let bytes = 0
    for (const raw of events) {
      const copy = captureSessionJson(raw, 'session event')
      let event: SessionEvent
      try {
        event = validateSessionEvent(copy)
      } catch (cause) {
        throw new SessionHeaderValidationError(
          'Invalid session event, schema, version or fingerprint',
          this.id,
          { cause }
        )
      }
      if (
        event.tenantId !== this.#s.options.tenantId ||
        event.sessionId !== this.id
      )
        throw new SessionHeaderValidationError(
          'Event envelope differs from the handle',
          this.id
        )
      const { sequence: _s, schemaFingerprint: _f, ...input } = event
      void _s
      void _f
      const text = canonicalizeJson(event)
      bytes += Buffer.byteLength(text, 'utf8')
      if (bytes > SESSION_BATCH_MAX_BYTES)
        throw new SessionHeaderValidationError('Batch exceeds 8 MiB', this.id)
      out.push({ event, digest: sessionEventInputDigest(input), text })
    }
    return { events: out }
  }

  /** Runs one short transaction on the owner connection; COMMIT outcome unknown = terminal. */
  async #transaction<T>(
    body: (lease: PhysicalSessionLease) => Promise<T>
  ): Promise<T> {
    const lease = this.#s.lease as PhysicalSessionLease
    const refusal = this.#lost
      ? new SessionOwnershipLostError('Session ownership was lost', this.id, {
          cause: this.#lost
        })
      : undefined
    if (refusal) throw refusal
    let value: T
    try {
      await lease.query('BEGIN')
      await lease.query("SET LOCAL statement_timeout = '5s'")
      await lease.query("SET LOCAL lock_timeout = '5s'")
      await lease.query('SET LOCAL synchronous_commit = on')
      await lease.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        this.#s.options.tenantId
      ])
      value = await body(lease)
    } catch (error) {
      try {
        await lease.query('ROLLBACK')
      } catch (cause) {
        throw this.#lose(cause)
      }
      throw this.#classify(error)
    }
    try {
      await lease.query('COMMIT')
    } catch (cause) {
      this.#unknown = new SessionCommitUnknownError(
        'The session write outcome is unknown',
        this.id,
        { cause }
      )
      throw this.#lose(cause, this.#unknown)
    }
    return value
  }
  /** Terminal loss: never reconnect, never re-claim; the connection is destroyed. */
  #lose(cause: unknown, as?: Error): Error {
    this.#lost ??= cause instanceof Error ? cause : new Error('Session lost')
    void this.#s.lease?.destroy()
    return (
      as ??
      new SessionOwnershipLostError('Session ownership was lost', this.id, {
        cause
      })
    )
  }
  #classify(error: unknown): Error {
    if (
      error instanceof SessionPersistenceError ||
      error instanceof SessionEventError
    )
      return error
    const code = (error as { code?: unknown } | null)?.code
    if (
      typeof code !== 'string' ||
      code === '55P03' ||
      code.startsWith('08') ||
      code.startsWith('57')
    )
      return this.#lose(error)
    if (code.startsWith('23'))
      return new SessionAppendConflictError(
        'The batch conflicts with the stored session',
        this.id,
        { cause: error }
      )
    return new SessionStorageUnavailableError('Session write failed', this.id, {
      cause: error
    })
  }

  async #appendNow(batch: ValidatedBatch): Promise<void> {
    const schema = quote(this.#s.options.schemaName)
    const tenant = this.#s.options.tenantId
    const last = await this.#transaction(async (lease) => {
      const cursor = await lease.query<{ next_sequence: string }>(
        `SELECT next_sequence FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [tenant, this.id]
      )
      if (cursor.rows.length !== 1)
        throw new SessionPersistenceNotFoundError('Session not found', this.id)
      let next = Number(cursor.rows[0]?.next_sequence)
      for (const { event, digest, text } of batch.events) {
        // The sequence is the caller's; a stale one fails, it is never renumbered.
        if (event.sequence !== next)
          throw new SessionAppendConflictError(
            'The event sequence is not the stream cursor',
            this.id
          )
        await lease.query(
          `INSERT INTO ${schema}.session_events (tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [
            tenant,
            this.id,
            event.sequence,
            event.eventId,
            event.formatVersion,
            event.type,
            event.schemaFingerprint,
            digest,
            text
          ]
        )
        const advanced = await lease.query(
          `UPDATE ${schema}.session_streams SET next_sequence=$3 WHERE tenant_id=$1 AND session_id=$2`,
          [tenant, this.id, next + 1]
        )
        if (advanced.rowCount !== 1)
          throw new SessionStorageUnavailableError(
            'Session cursor was not advanced',
            this.id
          )
        next++
      }
      return next - 1
    })
    this.#highWater = Math.max(this.#highWater, last)
    await this.#noteAppended(batch.events.map((item) => item.event))
  }

  /**
   * SPEC 0292 I8, after the commit that stored `events`: the owner's head moves, the folded
   * projection follows, and a checkpoint is written when `K` events have gone by. Nothing here
   * can fail the append: a replay of an event already stored moves nothing.
   */
  async #noteAppended(events: readonly SessionEvent[]): Promise<void> {
    const fresh = events.filter((event) => event.sequence > this.#head)
    if (fresh.length === 0) return
    this.#head = fresh[fresh.length - 1]!.sequence
    if (this.#projection) {
      try {
        this.#projection = foldSessionProjection(this.#projection, fresh)
      } catch (error) {
        // the log decides: the projection is rebuilt from it when a checkpoint is due
        this.#projection = undefined
        this.#s.cacheFailed?.(this.id, error)
      }
    }
    await this.#checkpointIfDue()
  }

  /** Writes the checkpoint when `K` events have gone by since the last one; never raises. */
  async #checkpointIfDue(): Promise<void> {
    const every = this.#s.checkpointEvery
    if (every === undefined || this.#lost || this.access !== 'write') return
    try {
      this.#checkpointed ??= (await this.#s.checkpointThrough?.(this.id)) ?? 0
      if (
        this.#head - this.#checkpointed < every ||
        this.#head < this.#nextCheckpointAt
      )
        return
      // one attempt per interval: a failure waits for `K` more events, a success needs them anyway
      this.#nextCheckpointAt = this.#head + every
      if (this.#projection === undefined) {
        const rebuilt = await this.#s.project?.(this.id)
        if (!rebuilt || rebuilt.projection.throughSequence !== this.#head)
          throw new SessionPersistenceCorruptionError(
            'Session projection is not at the head',
            this.id
          )
        this.#projection = rebuilt.projection
      }
      if (
        sessionProjectionStateBytes(this.#projection) >
        SESSION_PROJECTION_MAX_STATE_BYTES
      )
        throw Object.assign(new Error('projection state is too large'), {
          code: 'state_too_large'
        })
      await this.#writeCheckpoint(this.#projection)
      this.#checkpointed = this.#head
    } catch (error) {
      this.#s.cacheFailed?.(this.id, error)
    }
  }

  async #writeCheckpoint(projection: SessionProjection): Promise<void> {
    const schema = quote(this.#s.options.schemaName)
    const tenant = this.#s.options.tenantId
    await this.#transaction(async (lease) => {
      const stream = await lease.query<{ header_json: string }>(
        `SELECT header_json FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [tenant, this.id]
      )
      const point = await lease.query<{ input_digest: string }>(
        `SELECT input_digest FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 AND sequence=$3`,
        [tenant, this.id, projection.throughSequence]
      )
      const headerText = stream.rows[0]?.header_json
      const pointDigest = point.rows[0]?.input_digest
      if (headerText === undefined || pointDigest === undefined)
        throw new SessionPersistenceCorruptionError(
          'Session checkpoint point is not in the log',
          this.id
        )
      const row = sessionCheckpointRow(projection, headerText, pointDigest)
      await lease.query(
        `INSERT INTO ${schema}.session_projection_checkpoints
           (tenant_id,session_id,projection_id,projection_version,through_sequence,tail_input_digest,header_digest,state,state_digest)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT (tenant_id,session_id,projection_id) DO UPDATE SET
           projection_version=EXCLUDED.projection_version, through_sequence=EXCLUDED.through_sequence,
           tail_input_digest=EXCLUDED.tail_input_digest, header_digest=EXCLUDED.header_digest,
           state=EXCLUDED.state, state_digest=EXCLUDED.state_digest, created_at=now()
         WHERE EXCLUDED.through_sequence > ${schema}.session_projection_checkpoints.through_sequence`,
        [
          tenant,
          this.id,
          SESSION_PROJECTION_ID,
          row.projectionVersion,
          row.throughSequence,
          row.tailInputDigest,
          row.headerDigest,
          JSON.stringify(row.state),
          row.stateDigest
        ]
      )
    })
  }

  /**
   * The bridge primitive: lookup by event id, sequence assignment, INSERT and cursor advance
   * in ONE transaction of the owner connection, on the same single queue as every other
   * ticket. It never goes through the public read/append.
   */
  async #appendInputAtomic(
    input: SessionEventAppend,
    digest: string
  ): Promise<SessionEvent> {
    const schema = quote(this.#s.options.schemaName)
    const tenant = this.#s.options.tenantId
    const stored = await this.#transaction(async (lease) => {
      const cursor = await lease.query<{
        next_sequence: string
        format_version: number
      }>(
        `SELECT next_sequence, format_version FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [tenant, this.id]
      )
      const row = cursor.rows[0]
      if (!row)
        throw new SessionEventError(
          'session_not_open',
          'Session stream is not open'
        )
      if (row.format_version !== input.formatVersion)
        throw new SessionEventError(
          'session_event_conflict',
          'Session format differs'
        )
      const prior = await lease.query<EventRow>(
        `SELECT record, input_digest FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 AND event_id=$3`,
        [tenant, this.id, input.eventId]
      )
      const previous = prior.rows[0]
      if (previous) {
        // An identical replay returns the earlier fact and mutates nothing.
        if (previous.input_digest !== digest)
          throw new SessionEventError(
            'session_event_conflict',
            'Session event identity was reused with different input'
          )
        const sequence = Number(
          (previous.record as { sequence?: unknown } | null)?.sequence
        )
        return checkEvent(previous, this.id, tenant, sequence)
      }
      const next = Number(row.next_sequence)
      const event = materializeSessionEvent(input, next)
      await lease.query(
        `INSERT INTO ${schema}.session_events (tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
        [
          tenant,
          this.id,
          event.sequence,
          event.eventId,
          event.formatVersion,
          event.type,
          event.schemaFingerprint,
          digest,
          canonicalizeJson(event)
        ]
      )
      const advanced = await lease.query(
        `UPDATE ${schema}.session_streams SET next_sequence=$3 WHERE tenant_id=$1 AND session_id=$2`,
        [tenant, this.id, next + 1]
      )
      if (advanced.rowCount !== 1)
        throw new SessionStorageUnavailableError(
          'Session cursor was not advanced',
          this.id
        )
      this.#highWater = Math.max(this.#highWater, next)
      return event
    })
    await this.#noteAppended([stored])
    return stored
  }

  /**
   * The durability barrier: an UPDATE of the cursor to its own value under ownership, with a
   * synchronous COMMIT. It writes WAL even when nothing changed logically; a read-only COMMIT
   * would not be a barrier.
   */
  async #flushNow(): Promise<void> {
    const schema = quote(this.#s.options.schemaName)
    await this.#transaction(async (lease) => {
      const done = await lease.query(
        `UPDATE ${schema}.session_streams SET next_sequence=next_sequence WHERE tenant_id=$1 AND session_id=$2`,
        [this.#s.options.tenantId, this.id]
      )
      if (done.rowCount !== 1)
        throw new SessionPersistenceNotFoundError('Session not found', this.id)
    })
  }

  /**
   * Marks CLOSING before the first await, memoizes the promise (and its error), drains the
   * admitted queue, tries a final flush and releases ownership and the connection once.
   */
  close(): Promise<void> {
    this.#closing ??= this.#drainAndRelease()
    return this.#closing
  }
  [Symbol.asyncDispose](): Promise<void> {
    return this.close()
  }
  async #drainAndRelease(): Promise<void> {
    await this.#queue
    const lease = this.#s.lease
    if (!lease) return
    let failure: unknown
    try {
      if (!this.#lost) {
        try {
          await this.#checkpointIfDue()
          await this.#flushNow()
        } catch (error) {
          // A failed flush is not a successful close: keep the error, drop the connection.
          failure = error
          await lease.destroy()
        }
      }
      if (this.#lost) {
        await lease.destroy()
        failure ??= this.#unknown
      } else if (!failure) {
        const released = await lease.query<{ ok: boolean }>(
          'SELECT pg_advisory_unlock($1,$2) AS ok',
          [this.#s.keyBase, this.#s.key]
        )
        // Never hand back a physical session that may still hold the lock.
        if (released.rows[0]?.ok === true) await lease.release()
        else await lease.destroy()
      }
    } catch (error) {
      failure ??= error
      await lease.destroy()
    } finally {
      this.#s.onClosed?.()
    }
    if (failure) throw failure
  }
}

interface WriterCapability {
  readonly tenantId: string
  readonly sessionId: string
  active(): boolean
  appendInput(input: SessionEventAppend, digest: string): Promise<SessionEvent>
  read(afterSequence: number, limit: number): Promise<readonly SessionEvent[]>
  /** SPEC 0292 §7 slice 4: hands the owner the projection of the log it has just read whole. */
  seedProjection(projection: SessionProjection): void
}
/** Private: only handles issued by this module's factory are ever in here. */
const writerCapabilities = new WeakMap<object, WriterCapability>()

/**
 * SPEC 0221 §8: the existing SDK/kernel port over ONE genuine, still ACTIVE writer handle of
 * this module's factory. Wrappers, Proxies, clones, external implementations, readers, and
 * closed or lost handles get a synchronous TypeError and no IO. Several adapters for one
 * handle share its single queue.
 */
export function sessionEventStoreForHandle(
  handle: SessionHandle
): SessionEventStore {
  const capability =
    typeof handle === 'object' && handle !== null
      ? writerCapabilities.get(handle)
      : undefined
  if (!capability || !capability.active())
    throw new TypeError(
      'sessionEventStoreForHandle needs an active writer handle issued by createPostgresSessionPersistence'
    )
  return new HandleBackedSessionEventStore(capability)
}

function bridgeError(error: unknown): Error {
  if (error instanceof SessionEventError) return error
  const wrapped = new SessionEventError(
    'session_storage_unavailable',
    'Session storage is unavailable; retry only with the original event identity and input'
  )
  Object.defineProperty(wrapped, 'cause', { value: error })
  return wrapped
}

class HandleBackedSessionEventStore implements SessionEventStore {
  readonly #cap: WriterCapability
  constructor(capability: WriterCapability) {
    this.#cap = capability
  }
  #bind(tenantId: string, sessionId: string): void {
    if (tenantId !== this.#cap.tenantId)
      throw new SessionEventError(
        'invalid_session_event',
        'Tenant differs from bound session store'
      )
    if (sessionId !== this.#cap.sessionId)
      throw new SessionEventError(
        'session_not_open',
        'Session stream is not open'
      )
    if (!this.#cap.active())
      throw new SessionEventError(
        'session_storage_unavailable',
        'Session storage is unavailable; retry only with the original event identity and input'
      )
  }
  async openSession(raw: SessionStream): Promise<SessionStream> {
    const input = validateSessionStream(raw)
    this.#bind(input.tenantId, input.sessionId)
    return { ...input }
  }
  async append(raw: SessionEventAppend): Promise<SessionEvent> {
    // Captured and validated before the first await.
    const input = validateSessionEventAppend(raw)
    this.#bind(input.tenantId, input.sessionId)
    const digest = sessionEventInputDigest(input)
    try {
      return await this.#cap.appendInput(input, digest)
    } catch (error) {
      throw bridgeError(error)
    }
  }
  async read(raw: SessionEventRead): Promise<readonly SessionEvent[]> {
    const input = validateSessionEventRead(raw)
    this.#bind(input.tenantId, input.sessionId)
    try {
      return await this.#cap.read(input.afterSequence, input.limit)
    } catch (error) {
      throw bridgeError(error)
    }
  }
}

interface ValidatedBatch {
  readonly events: ReadonlyArray<{
    readonly event: SessionEvent
    readonly digest: string
    readonly text: string
  }>
}

function checkEvent(
  row: EventRow,
  sessionId: string,
  tenantId: string,
  sequence: number
): SessionEvent {
  let event: SessionEvent
  try {
    event = validateSessionEvent(row.record)
    const { sequence: _s, schemaFingerprint: _f, ...input } = event
    void _s
    void _f
    if (sessionEventInputDigest(input) !== row.input_digest)
      throw new SessionEventError(
        'invalid_session_event',
        'Stored input digest differs'
      )
  } catch (cause) {
    throw new SessionPersistenceCorruptionError(
      'Stored session event is invalid',
      sessionId,
      { cause }
    )
  }
  if (
    event.tenantId !== tenantId ||
    event.sessionId !== sessionId ||
    event.sequence !== sequence ||
    sequence > MAX_SAFE
  )
    throw new SessionPersistenceCorruptionError(
      'Stored session event identity differs',
      sessionId
    )
  return event
}

/**
 * Reads both sessions through read handles (no ownership taken) and recomposes the fork:
 * the problems found, empty when the child is exactly the inheritable prefix of its source.
 */
export async function verifySessionFork(
  service: SessionPersistence,
  childId: string,
  sourceId: string
): Promise<readonly string[]> {
  const side = async (id: string) => {
    const handle = await service.open(id, 'read')
    try {
      return {
        header: handle.header,
        inheritedEventCount: handle.inheritedEventCount,
        events: (await handle.read(0)).events
      }
    } finally {
      await handle.close()
    }
  }
  const [source, child] = [await side(sourceId), await side(childId)]
  return checkSessionFork(source, child)
}

/**
 * SPEC 0292 §5. Rebuilds the projection from the whole log through the validated reader and
 * compares it with what `project` serves, reporting every problem found: a cache that differs,
 * an invalid or unreadable checkpoint, a log the full analysis refuses (which `fold` may accept),
 * and cache writes that failed. It is the one operation that validates the prefix behind a
 * checkpoint (SP-G). An empty list means the cache and the log agree.
 */
export async function verifyProjectionCache(
  service: SessionPersistence & {
    projectionCacheStats?: () => SessionProjectionCacheStats
  },
  id: string
): Promise<readonly string[]> {
  const problems: string[] = []
  let rebuilt: SessionProjection
  const reader = await service.open(id, 'read')
  try {
    const { events } = await reader.read(0)
    rebuilt = projectSession(events)
  } catch (error) {
    if (error instanceof SessionPersistenceCorruptionError)
      return [`the log does not hold up from zero: ${error.message}`]
    throw error
  } finally {
    await reader.close()
  }
  const served = await service.project(id)
  if (canonicalizeJson(served.projection) !== canonicalizeJson(rebuilt))
    problems.push(
      `the projection served from ${served.origin} differs from the log rebuilt from zero`
    )
  if (served.cache === 'invalid')
    problems.push('the checkpoint is invalid and was ignored')
  if (served.cache === 'unavailable')
    problems.push('the checkpoint cache cannot be read')
  const stats = service.projectionCacheStats?.()
  if (stats && stats.writeFailures > 0)
    problems.push(`${stats.writeFailures} checkpoint write(s) failed`)
  return problems
}
