import { createHash, createHmac } from 'node:crypto'
import type {
  SpillPolicy,
  SpillPurgeInput,
  SpillPutInput,
  SpillReadInput,
  SpillReceipt,
  SpillSlice,
  SpillStore
} from '@cvg/harness-contracts'
import {
  SpillCancelled,
  SpillCommitUnknown,
  SpillError,
  SpillExpired,
  SpillKeyUnavailable,
  SpillNotFound,
  SpillQuotaExceeded,
  SpillStorageUnavailable,
  SpillTooLarge,
  alignUtf8Slice,
  resolveSpillPolicy,
  sha256Hex,
  utf8Bytes
} from '@cvg/harness'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from './tenant-scoped-postgres.ts'
import type { PostgresQueryable } from './postgres.ts'
import { runPostgresMigrations } from './postgres-migrations.ts'

/** SPEC 0293 R2 slice 2 (migration 0037): the durable, tenant-bound spill store. */
const MIGRATION = '0037_tool_output_spill'
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/
const LOCATOR = /^spill_[A-Za-z0-9_-]{43}$/
const MIN_KEY_BYTES = 32

/** Run as migration authority in a dedicated schema, never in request serving. */
export async function runSpillMigrations(
  client: PostgresQueryable,
  options: { readonly schemaName: string }
): Promise<void> {
  if (!SCHEMA.test(options.schemaName)) {
    throw new SpillError('Invalid spill schema name')
  }
  await runPostgresMigrations(client, {
    schemaName: options.schemaName,
    migrations: [MIGRATION]
  })
}

/**
 * The locator key comes from the host's secret port, never from the database or
 * from the environment of a child process. `undefined` means "no key composed".
 */
export type SpillLocatorKeySource = () =>
  | Uint8Array
  | undefined
  | Promise<Uint8Array | undefined>

export interface PostgresSpillStoreOptions {
  readonly tenantId: string
  readonly schemaName: string
  readonly locatorKey?: SpillLocatorKeySource
  readonly policy?: Partial<SpillPolicy>
  readonly clock?: () => Date
}

/**
 * Each field is a 4-byte big-endian length followed by its UTF-8 bytes, so no
 * choice of field contents can shift a boundary into another field (a NUL
 * separator would not hold that for fields that contain NUL).
 */
export function lengthPrefixed(fields: readonly string[]): Buffer {
  const parts: Buffer[] = []
  for (const field of fields) {
    const bytes = Buffer.from(field, 'utf8')
    const prefix = Buffer.alloc(4)
    prefix.writeUInt32BE(bytes.length)
    parts.push(prefix, bytes)
  }
  return Buffer.concat(parts)
}

const locatorHash = (locator: string): string =>
  createHash('sha256').update(locator).digest('hex')

/**
 * Durable across processes (`durability: 'shared'`). The locator is
 * `spill_` + base64url(HMAC-SHA256(key, tenant‖session‖operationKey‖sha256)),
 * 256 bits; the database keeps only its SHA-256. A write with the same inputs
 * and key finds the same row (I6) and never extends its expiry.
 */
export class PostgresSpillStore implements SpillStore {
  readonly durability = 'shared' as const
  readonly #pool: PostgresPoolLike
  readonly #tenantId: string
  readonly #schema: string
  readonly #policy: SpillPolicy
  readonly #key: SpillLocatorKeySource | undefined
  readonly #clock: () => Date

  constructor(pool: PostgresPoolLike, options: PostgresSpillStoreOptions) {
    if (!SCHEMA.test(options.schemaName)) {
      throw new SpillError('Invalid spill schema name')
    }
    if (options.tenantId.length < 1 || options.tenantId.length > 200) {
      throw new SpillError('Invalid spill tenant')
    }
    this.#pool = pool
    this.#tenantId = options.tenantId
    this.#schema = options.schemaName
    this.#policy = resolveSpillPolicy(options.policy)
    this.#key = options.locatorKey
    this.#clock = options.clock ?? (() => new Date())
  }

  async #locator(input: {
    readonly tenantId: string
    readonly sessionId: string
    readonly operationKey: string
    readonly sha256: string
  }): Promise<string> {
    const key = await this.#key?.()
    if (!key || key.length < MIN_KEY_BYTES) {
      throw new SpillKeyUnavailable('No usable spill locator key is composed')
    }
    const mac = createHmac('sha256', key)
      .update(
        lengthPrefixed([
          input.tenantId,
          input.sessionId,
          input.operationKey,
          input.sha256
        ])
      )
      .digest('base64url')
    return `spill_${mac}`
  }

  /** Best effort, from a second connection: stop the statement the aborted writer waits in. */
  async #cancelBackend(pid: number): Promise<void> {
    let other: PostgresPoolClient | undefined
    try {
      other = await this.#pool.connect()
      await other.query('SELECT pg_cancel_backend($1)', [pid])
    } catch {
      // the lock/statement timeouts still bound the wait
    } finally {
      other?.release()
    }
  }

  async #transaction<T>(
    readOnly: boolean,
    operation: (client: PostgresPoolClient) => Promise<T>,
    signal?: AbortSignal
  ): Promise<T> {
    let client: PostgresPoolClient
    try {
      client = await this.#pool.connect()
    } catch {
      throw new SpillStorageUnavailable('Spill database unavailable')
    }
    let releaseError: Error | undefined
    let committing = false
    let inFlight = false
    let onAbort: (() => void) | undefined
    try {
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query(
        `SET LOCAL search_path = pg_catalog, "${this.#schema}"`
      )
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        this.#tenantId
      ])
      if (signal) {
        // SPEC 0293 I7: an abort while a statement waits (the tenant lock of the quota, a
        // busy row) cancels that statement; the writer then rolls back and nothing is stored.
        const pid = Number(
          (
            await client.query<{ pid: number }>(
              'SELECT pg_backend_pid() AS pid'
            )
          ).rows[0]?.pid
        )
        inFlight = true
        onAbort = () => {
          if (inFlight && Number.isSafeInteger(pid))
            void this.#cancelBackend(pid)
        }
        signal.addEventListener('abort', onAbort, { once: true })
        if (signal.aborted) onAbort()
      }
      const value = await operation(client)
      // the last point where an abort still means "nothing stored"
      inFlight = false
      if (signal?.aborted) throw new SpillCancelled('Spill write cancelled')
      committing = true
      await client.query('COMMIT')
      return value
    } catch (error) {
      inFlight = false
      try {
        await client.query('ROLLBACK')
      } catch {
        releaseError = new Error('Spill transaction cleanup failed')
      }
      if (error instanceof SpillError) throw error
      // the statement was cancelled because the caller aborted, before any commit
      if (signal?.aborted && !committing) {
        throw new SpillCancelled('Spill write cancelled')
      }
      // a lost COMMIT is an unknown outcome, never a plain failure (SPEC 0293 §3.1)
      if (committing && !readOnly) {
        throw new SpillCommitUnknown('Spill commit outcome is unknown')
      }
      throw new SpillStorageUnavailable('Spill transaction failed')
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort)
      client.release(releaseError)
    }
  }

  async put(input: SpillPutInput): Promise<SpillReceipt> {
    if (input.signal?.aborted) throw new SpillCancelled('Spill write cancelled')
    if (input.tenantId !== this.#tenantId) {
      throw new SpillError('Tenant differs from the bound spill store')
    }
    for (const field of [
      input.sessionId,
      input.executionId,
      input.operationKey,
      input.sourceId,
      input.classification
    ]) {
      // PostgreSQL text cannot hold NUL, and an identity with one is never valid
      if (field.length < 1 || field.includes('\u0000')) {
        throw new SpillError(
          'Spill identity fields must be non-empty and free of NUL'
        )
      }
    }
    const bytes = utf8Bytes(input.content)
    if (bytes < 1) throw new SpillError('Spill content is empty')
    if (bytes > this.#policy.maxStoredBytes) {
      throw new SpillTooLarge('Spill content exceeds the stored size limit')
    }
    const sha256 = sha256Hex(input.content)
    const locator = await this.#locator({
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      operationKey: input.operationKey,
      sha256
    })
    const hash = locatorHash(locator)
    const now = this.#clock()
    const expires = new Date(now.getTime() + this.#policy.ttlMs)
    const schema = `"${this.#schema}"`
    return this.#transaction(
      false,
      async (client) => {
        // one writer per tenant at a time: the quota below is read, then written
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`spill:${input.tenantId}`]
        )
        // the wait for the lock can be long: an abort that came meanwhile stops here, before
        // any write
        if (input.signal?.aborted) {
          throw new SpillCancelled('Spill write cancelled')
        }
        // an expired copy still waiting for the sweep is replaced, never revived
        await client.query(
          `DELETE FROM ${schema}.spill_objects
          WHERE tenant_id=$1 AND session_id=$2 AND locator_hash=$3 AND expires_at <= $4`,
          [input.tenantId, input.sessionId, hash, now.toISOString()]
        )
        const found = await client.query<{
          created_at: Date
          expires_at: Date
        }>(
          `SELECT created_at, expires_at FROM ${schema}.spill_objects
          WHERE tenant_id=$1 AND session_id=$2 AND locator_hash=$3`,
          [input.tenantId, input.sessionId, hash]
        )
        let row = found.rows[0]
        if (!row) {
          // SPEC 0293 I5: live objects only; an expired one no longer takes room
          const used = await client.query<{ objects: number; bytes: string }>(
            `SELECT count(*) FILTER (WHERE session_id=$2)::int AS objects,
                  COALESCE(sum(byte_length), 0)::text AS bytes
             FROM ${schema}.spill_objects
            WHERE tenant_id=$1 AND expires_at > $3`,
            [input.tenantId, input.sessionId, now.toISOString()]
          )
          const usage = used.rows[0] as { objects: number; bytes: string }
          if (
            usage.objects >= this.#policy.maxObjectsPerSession ||
            Number(usage.bytes) + bytes > this.#policy.maxBytesPerTenant
          ) {
            throw new SpillQuotaExceeded('Spill quota exceeded')
          }
          const inserted = await client.query<{
            created_at: Date
            expires_at: Date
          }>(
            `INSERT INTO ${schema}.spill_objects
             (tenant_id, session_id, locator_hash, execution_id, operation_key, source_id,
              classification, media_type, content_sha256, byte_length, content, created_at, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           RETURNING created_at, expires_at`,
            [
              input.tenantId,
              input.sessionId,
              hash,
              input.executionId,
              input.operationKey,
              input.sourceId,
              input.classification,
              input.mediaType,
              sha256,
              bytes,
              Buffer.from(input.content, 'utf8'),
              now.toISOString(),
              expires.toISOString()
            ]
          )
          row = inserted.rows[0]
        }
        if (!row)
          throw new SpillStorageUnavailable('Spill object was not stored')
        return {
          locator,
          bytes,
          sha256,
          createdAt: new Date(row.created_at).toISOString(),
          expiresAt: new Date(row.expires_at).toISOString()
        }
      },
      input.signal
    )
  }

  async read(input: SpillReadInput): Promise<SpillSlice> {
    if (input.signal?.aborted) throw new SpillCancelled('Spill read cancelled')
    if (
      !Number.isSafeInteger(input.offset) ||
      input.offset < 0 ||
      !Number.isSafeInteger(input.length) ||
      input.length < 1
    ) {
      throw new SpillError('Invalid spill read range')
    }
    // a foreign tenant or a malformed locator is indistinguishable from absence (I4)
    if (input.tenantId !== this.#tenantId || !LOCATOR.test(input.locator)) {
      throw new SpillNotFound('Spill object not found')
    }
    const length = Math.min(input.length, this.#policy.readMaxBytes)
    const schema = `"${this.#schema}"`
    const row = await this.#transaction(true, async (client) => {
      const result = await client.query<{
        total: string
        part: Buffer
        expired: boolean
      }>(
        `SELECT byte_length AS total,
                substring(content from $4::int for $5::int) AS part,
                expires_at <= $6 AS expired
           FROM ${schema}.spill_objects
          WHERE tenant_id=$1 AND session_id=$2 AND locator_hash=$3`,
        [
          input.tenantId,
          input.sessionId,
          locatorHash(input.locator),
          input.offset + 1,
          length + 4,
          this.#clock().toISOString()
        ]
      )
      return result.rows[0]
    })
    if (!row) throw new SpillNotFound('Spill object not found')
    if (row.expired) throw new SpillExpired('Spill object expired')
    const total = Number(row.total)
    const aligned = alignUtf8Slice(row.part, length)
    const offset = input.offset + aligned.skippedBytes
    return {
      text: aligned.text,
      offset,
      skippedBytes: aligned.skippedBytes,
      bytesRead: aligned.bytesRead,
      totalBytes: total,
      eof: offset + aligned.bytesRead >= total
    }
  }

  /** Erasure on request: every object of one session of this tenant (SPEC 0293 §3.7). */
  async purgeSession(input: SpillPurgeInput): Promise<number> {
    if (input.tenantId !== this.#tenantId) return 0
    const schema = `"${this.#schema}"`
    return this.#transaction(false, async (client) => {
      const result = await client.query(
        `DELETE FROM ${schema}.spill_objects WHERE tenant_id=$1 AND session_id=$2`,
        [input.tenantId, input.sessionId]
      )
      return result.rowCount ?? 0
    })
  }

  /** Deletes objects whose validity has ended (D4); returns how many went. */
  async purgeExpired(limit = 500): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new SpillError('Invalid purge limit')
    }
    const schema = `"${this.#schema}"`
    return this.#transaction(false, async (client) => {
      const result = await client.query(
        `DELETE FROM ${schema}.spill_objects
          WHERE ctid IN (
            SELECT ctid FROM ${schema}.spill_objects
             WHERE tenant_id=$1 AND expires_at <= $2 LIMIT $3)`,
        [this.#tenantId, this.#clock().toISOString(), limit]
      )
      return result.rowCount ?? 0
    })
  }
}

/**
 * The sweep for every tenant at once (SPEC 0293 D4). Connect it as a member of the
 * `cvg_spill_sweeper` role: the migration's policies let that role see and delete rows
 * whose validity has ended and nothing else, so it needs no tenant context and the
 * runtime role cannot do the same.
 */
export class PostgresSpillSweeper {
  readonly #pool: PostgresPoolLike
  readonly #schema: string
  #verified = false

  constructor(
    pool: PostgresPoolLike,
    options: { readonly schemaName: string }
  ) {
    if (!SCHEMA.test(options.schemaName)) {
      throw new SpillError('Invalid spill schema name')
    }
    this.#pool = pool
    this.#schema = options.schemaName
  }

  /**
   * Startup check for the host: refuses (`SpillStorageUnavailable`) unless the connected login
   * holds exactly the privileges of the provisioning script. A later `purgeExpired` does not
   * repeat it once it has passed.
   */
  async verify(): Promise<void> {
    let client: PostgresPoolClient
    try {
      client = await this.#pool.connect()
    } catch {
      throw new SpillStorageUnavailable('Spill database unavailable')
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN READ ONLY')
      await client.query("SET LOCAL statement_timeout = '5s'")
      await client.query(
        `SET LOCAL search_path = pg_catalog, "${this.#schema}"`
      )
      await this.#verifyPrivileges(client)
      await client.query('COMMIT')
      this.#verified = true
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        releaseError = new Error('Spill sweeper check cleanup failed')
      }
      if (error instanceof SpillError) throw error
      throw new SpillStorageUnavailable('Spill sweeper check failed')
    } finally {
      client.release(releaseError)
    }
  }

  async purgeExpired(): Promise<number> {
    let client: PostgresPoolClient
    try {
      client = await this.#pool.connect()
    } catch {
      throw new SpillStorageUnavailable('Spill database unavailable')
    }
    let releaseError: Error | undefined
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL statement_timeout = '30s'")
      await client.query(
        `SET LOCAL search_path = pg_catalog, "${this.#schema}"`
      )
      if (!this.#verified) {
        await this.#verifyPrivileges(client)
        this.#verified = true
      }
      const result = await client.query(
        `DELETE FROM "${this.#schema}".spill_objects WHERE expires_at <= now()`
      )
      await client.query('COMMIT')
      return result.rowCount ?? 0
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        releaseError = new Error('Spill sweep cleanup failed')
      }
      if (error instanceof SpillError) throw error
      throw new SpillStorageUnavailable('Spill sweep failed')
    } finally {
      client.release(releaseError)
    }
  }

  /**
   * N01/F02: the role is provisioned outside the migration (deploy/harness/postgres/
   * spill-sweeper.sql). The sweep runs only as a member of it, with the identity and expiry
   * columns and DELETE and nothing more: `content` unreadable, no INSERT/UPDATE/TRUNCATE, and
   * no way around the policies (superuser, BYPASSRLS, CREATEROLE).
   */
  async #verifyPrivileges(client: PostgresPoolClient): Promise<void> {
    const table = `"${this.#schema}".spill_objects`
    const result = await client.query<Record<string, boolean | null>>(
      `SELECT CASE WHEN to_regrole('cvg_spill_sweeper') IS NULL THEN false
                   ELSE pg_has_role(current_user, 'cvg_spill_sweeper', 'member') END AS member,
              has_column_privilege(current_user, $1, 'expires_at', 'SELECT') AS read_expiry,
              has_column_privilege(current_user, $1, 'locator_hash', 'SELECT') AS read_identity,
              has_column_privilege(current_user, $1, 'content', 'SELECT') AS read_content,
              has_table_privilege(current_user, $1, 'DELETE') AS can_delete,
              has_any_column_privilege(current_user, $1, 'INSERT') AS can_insert,
              has_any_column_privilege(current_user, $1, 'UPDATE') AS can_update,
              has_table_privilege(current_user, $1, 'TRUNCATE') AS can_truncate,
              (has_table_privilege(current_user, $1, 'TRIGGER')
                 OR has_any_column_privilege(current_user, $1, 'REFERENCES')) AS can_alter_shape,
              (SELECT rolsuper OR rolbypassrls OR rolcreaterole
                 FROM pg_roles WHERE rolname = current_user) AS powerful`,
      [table]
    )
    const row = result.rows[0]
    if (
      !row ||
      row.member !== true ||
      row.read_expiry !== true ||
      row.read_identity !== true ||
      row.can_delete !== true ||
      row.read_content !== false ||
      row.can_insert !== false ||
      row.can_update !== false ||
      row.can_truncate !== false ||
      row.can_alter_shape !== false ||
      row.powerful !== false
    ) {
      throw new SpillStorageUnavailable(
        'Spill sweeper role is not provisioned with least privilege'
      )
    }
  }
}
