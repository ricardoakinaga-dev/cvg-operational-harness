import { createHash } from 'node:crypto'
import type {
  SessionAccess,
  SessionCreateOptions,
  SessionEvent,
  SessionHandle,
  SessionHeaderV1,
  SessionPersistence,
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
  SessionPersistenceNotFoundError,
  SessionReadOnlyError,
  SessionStorageUnavailableError,
  SessionCommitUnknownError,
  SessionEventError,
  sessionEventInputDigest,
  validateSessionEvent,
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
const OPERATION_TIMEOUT_MS = 5_000
const MAX_SAFE = Number.MAX_SAFE_INTEGER
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/
const TENANT = /^[\x21-\x7e]{1,200}$/

export interface PostgresSessionPersistenceOptions {
  readonly tenantId: string
  readonly schemaName: string
  /** Declared by the composition; saturation refuses without a partial claim. */
  readonly maxOpenWriters: number
  readonly acquireTimeoutMs?: number
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
  const schema = options.schemaName
  const fail = (reason: string): never => {
    throw new SessionMigrationRequiredError(
      `Session persistence preflight: ${reason}`
    )
  }
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
      'session_streams_default_header'
    ])
      if (!enabled.has(required))
        return fail(`trigger ${required} is not enabled`)
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
  } finally {
    client.release()
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
      return this.#writerHandle(lease, captured, inheritedEventCount, key)
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
      return this.#writerHandle(lease, after.header, after.cut, after.key)
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

  #writerHandle(
    lease: PhysicalSessionLease,
    header: SessionHeaderV1,
    cut: number,
    key: number
  ): SessionHandle {
    return new PostgresSessionHandle({
      access: 'write',
      header,
      cut,
      key,
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
}

class PostgresSessionHandle implements SessionHandle {
  readonly id: string
  readonly access: SessionAccess
  readonly inheritedEventCount: number
  readonly #s: HandleState
  #queue: Promise<unknown> = Promise.resolve()
  #closing: Promise<void> | undefined
  #lost: Error | undefined
  #highWater = 0
  constructor(state: HandleState) {
    this.#s = state
    this.id = state.header.id
    this.access = state.access
    this.inheritedEventCount = state.cut
    state.lease?.onLost((error) => {
      this.#lost ??= error
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

  append(): Promise<void> {
    return this.#unavailable('append')
  }
  flush(): Promise<void> {
    return this.#unavailable('flush')
  }
  #unavailable(method: string): Promise<void> {
    if (this.#closing)
      return Promise.reject(
        new SessionHandleClosedError('Session handle is closed', this.id)
      )
    if (this.access === 'read')
      return Promise.reject(
        new SessionReadOnlyError(`${method} needs a writer handle`, this.id)
      )
    if (this.#lost)
      return Promise.reject(
        new SessionOwnershipLostError('Session ownership was lost', this.id, {
          cause: this.#lost
        })
      )
    return Promise.reject(
      new SessionStorageUnavailableError(
        `${method} is not part of this slice`,
        this.id
      )
    )
  }

  /** Marks CLOSING before the first await, memoizes the promise, drains the queue, releases once. */
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
    try {
      if (this.#lost) {
        await lease.destroy()
        return
      }
      const released = await lease.query<{ ok: boolean }>(
        'SELECT pg_advisory_unlock($1,$2) AS ok',
        [this.#s.keyBase, this.#s.key]
      )
      // Never hand back a physical session that may still hold the lock.
      if (released.rows[0]?.ok === true) await lease.release()
      else await lease.destroy()
    } catch {
      await lease.destroy()
    } finally {
      this.#s.onClosed?.()
    }
  }
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
