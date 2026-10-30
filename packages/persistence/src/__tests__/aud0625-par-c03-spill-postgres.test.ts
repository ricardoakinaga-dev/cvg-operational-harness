// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Pool, Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SpillPutInput } from '@cvg/harness-contracts'
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
  prepareToolOutput,
  resolveSpillPolicy
} from '@cvg/harness'
import {
  PostgresSpillStore,
  PostgresSpillSweeper,
  lengthPrefixed,
  runSpillMigrations,
  type PostgresSpillStoreOptions
} from '../spill-store-postgres.ts'
import type { PostgresPoolLike } from '../tenant-scoped-postgres.ts'

/**
 * PAR-C03 / SPEC 0293 R2 slice 2: the durable spill store (migration 0037, RLS by
 * tenant, HMAC locator, expiry sweep). Needs a disposable PostgreSQL via
 * TEST_DATABASE_URL. Synthetic data only.
 */

const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PARC03_PG_REQUIRED === '1')
  throw new Error('PAR-C03 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `parc03_${suffix}`
const role = `parc03_role_${suffix}`
const password = 'parc03-synthetic-only'
const tenant = 'tenant-synthetic-A'
const otherTenant = 'tenant-synthetic-B'
const KEY = randomBytes(32)
let admin: Client
let pool1: Pool
let pool2: Pool
let sweepPool: Pool
const sweepRole = `parc03_sweep_${suffix}`

/** Runs deploy/harness/postgres/spill-sweeper.sql the way psql would, with its variables. */
const provisionSweeper = async (dataSchema: string, loginRole: string) => {
  const script = readFileSync(
    new URL(
      '../../../../deploy/harness/postgres/spill-sweeper.sql',
      import.meta.url
    ),
    'utf8'
  )
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n')
    .replaceAll(':"data_schema"', `"${dataSchema}"`)
    .replaceAll(':"sweep_login_role"', `"${loginRole}"`)
  await admin.query(script)
}

const put = (over: Partial<SpillPutInput> = {}): SpillPutInput => ({
  tenantId: tenant,
  sessionId: 'session-a',
  executionId: 'exec-a',
  operationKey: 'op-a',
  sourceId: 'tool.x',
  classification: 'CONFIDENTIAL',
  mediaType: 'text/plain',
  content: 'conteúdo sintético de ferramenta',
  ...over
})

describe.skipIf(!url)('PAR-C03 slice 2 — PostgreSQL spill store', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runSpillMigrations(admin, { schemaName: schema })
    await runSpillMigrations(admin, { schemaName: schema })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    // the runtime role can write and sweep, never update (rows are immutable)
    await admin.query(
      `GRANT SELECT, INSERT, DELETE ON ${schema}.spill_objects TO ${role}`
    )
    const roleUrl = new URL(url!)
    roleUrl.username = role
    roleUrl.password = password
    // the maintenance job connects as a member of the dedicated sweep role
    await admin.query(
      `CREATE ROLE ${sweepRole} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    // the role and its least-privilege grants come from the supported provisioning script,
    // run by the administrator; the migration creates and grants nothing (N01, F02)
    await provisionSweeper(schema, sweepRole)
    const sweepUrl = new URL(url!)
    sweepUrl.username = sweepRole
    sweepUrl.password = password
    sweepPool = new Pool({ connectionString: sweepUrl.toString(), max: 2 })
    pool1 = new Pool({ connectionString: roleUrl.toString(), max: 4 })
    pool2 = new Pool({ connectionString: roleUrl.toString(), max: 4 })
  }, 30000)

  afterAll(async () => {
    await pool1?.end()
    await pool2?.end()
    await sweepPool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP ROLE IF EXISTS ${role}`)
      await admin.query(`DROP ROLE IF EXISTS ${sweepRole}`)
      await admin.end()
    }
  })

  const store = (
    pool: PostgresPoolLike = pool1,
    over: Partial<PostgresSpillStoreOptions> = {}
  ) =>
    new PostgresSpillStore(pool, {
      tenantId: tenant,
      schemaName: schema,
      locatorKey: () => KEY,
      ...over
    })

  it('is durable across processes by declaration and by construction', () => {
    expect(store().durability).toBe('shared')
    expect(() => store(pool1, { schemaName: 'Bad-Schema' })).toThrow(SpillError)
    expect(() => store(pool1, { tenantId: '' })).toThrow(SpillError)
  })

  it('applies the migration twice without effect and enforces the table checks', async () => {
    await runSpillMigrations(admin, { schemaName: schema })
    await expect(
      admin.query(
        `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
         VALUES ('t','s','${'a'.repeat(64)}','e','o','x','C','text/plain','${'b'.repeat(64)}',5,'\\x6162','2026-10-30','2026-10-31')`
      )
    ).rejects.toThrow(/byte_length|check/i)
    await expect(
      admin.query(
        `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
         VALUES ('t','s','${'e'.repeat(64)}','e','o','x','C','text/plain','${'f'.repeat(64)}',2,'\\x6162','2026-10-31','2026-10-30')`
      )
    ).rejects.toThrow(/expires_at|check/i)
    await expect(
      runSpillMigrations(admin, { schemaName: 'Bad Schema' })
    ).rejects.toBeInstanceOf(SpillError)
  })

  it('stores bytes exactly, returns an opaque HMAC locator and keeps only its hash', async () => {
    const s = store()
    const content = 'ação clínica 😀 ' + 'x'.repeat(100)
    const receipt = await s.put(put({ content, operationKey: 'op-roundtrip' }))
    expect(receipt.locator).toMatch(/^spill_[A-Za-z0-9_-]{43}$/)
    expect(receipt.bytes).toBe(Buffer.byteLength(content, 'utf8'))
    expect(receipt.sha256).toBe(
      createHash('sha256').update(content).digest('hex')
    )
    expect(receipt.locator).not.toContain(tenant)
    const rows = await admin.query(
      `SELECT locator_hash, encode(content,'escape') AS body, byte_length FROM ${schema}.spill_objects WHERE operation_key='op-roundtrip'`
    )
    expect(rows.rows).toHaveLength(1)
    expect(rows.rows[0].locator_hash).toBe(
      createHash('sha256').update(receipt.locator).digest('hex')
    )
    // the locator itself is nowhere in the table
    const leak = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE row(spill_objects.*)::text LIKE '%' || $1 || '%'`,
      [receipt.locator]
    )
    expect(leak.rows[0].n).toBe(0)
    const slice = await s.read({
      tenantId: tenant,
      sessionId: 'session-a',
      locator: receipt.locator,
      offset: 0,
      length: 1000
    })
    expect(slice.text).toBe(content)
    expect(slice.totalBytes).toBe(receipt.bytes)
    expect(slice.eof).toBe(true)
  })

  it('is idempotent across stores and pools, and never extends the expiry (I6)', async () => {
    let now = new Date('2026-10-30T10:00:00.000Z')
    const a = store(pool1, { clock: () => now })
    const first = await a.put(put({ operationKey: 'op-idem' }))
    now = new Date('2026-10-30T20:00:00.000Z')
    const b = store(pool2, { clock: () => now })
    const again = await b.put(put({ operationKey: 'op-idem' }))
    expect(again.locator).toBe(first.locator)
    expect(again.expiresAt).toBe(first.expiresAt)
    expect(again.createdAt).toBe(first.createdAt)
    const count = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE operation_key='op-idem'`
    )
    expect(count.rows[0].n).toBe(1)
    const other = await b.put(
      put({ operationKey: 'op-idem', content: 'outro conteúdo' })
    )
    expect(other.locator).not.toBe(first.locator)
    const otherOp = await b.put(put({ operationKey: 'op-idem-2' }))
    expect(otherOp.locator).not.toBe(first.locator)
    const otherSession = await b.put(
      put({ operationKey: 'op-idem', sessionId: 'session-b' })
    )
    expect(otherSession.locator).not.toBe(first.locator)
  })

  it('ten concurrent writes of the same output leave one row and one locator', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store(i % 2 ? pool1 : pool2).put(put({ operationKey: 'op-race' }))
      )
    )
    expect(new Set(results.map((r) => r.locator)).size).toBe(1)
    const count = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE operation_key='op-race'`
    )
    expect(count.rows[0].n).toBe(1)
  })

  it('without a usable key nothing is stored (I14, fail-closed)', async () => {
    const before = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects`
    )
    const unusable: Partial<PostgresSpillStoreOptions>[] = [
      { locatorKey: () => undefined },
      { locatorKey: () => randomBytes(31) },
      { locatorKey: async () => undefined }
    ]
    const noKeyAtAll = new PostgresSpillStore(pool1, {
      tenantId: tenant,
      schemaName: schema
    })
    await expect(
      noKeyAtAll.put(put({ operationKey: 'op-nokey' }))
    ).rejects.toBeInstanceOf(SpillKeyUnavailable)
    for (const over of unusable) {
      await expect(
        store(pool1, over).put(put({ operationKey: 'op-nokey' }))
      ).rejects.toBeInstanceOf(SpillKeyUnavailable)
    }
    const after = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects`
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it('a different key yields a different locator for the same output', async () => {
    const a = await store().put(put({ operationKey: 'op-key' }))
    const b = await store(pool1, { locatorKey: () => randomBytes(32) }).put(
      put({ operationKey: 'op-key' })
    )
    expect(b.locator).not.toBe(a.locator)
  })

  it('isolates tenants and sessions: anything else is not found (I4)', async () => {
    const s = store()
    const { locator } = await s.put(put({ operationKey: 'op-iso' }))
    const read = (over = {}, from = s) =>
      from.read({
        tenantId: tenant,
        sessionId: 'session-a',
        locator,
        offset: 0,
        length: 10,
        ...over
      })
    await expect(read({ sessionId: 'session-z' })).rejects.toBeInstanceOf(
      SpillNotFound
    )
    await expect(read({ tenantId: otherTenant })).rejects.toBeInstanceOf(
      SpillNotFound
    )
    const foreign = store(pool1, { tenantId: otherTenant })
    await expect(
      read({ tenantId: otherTenant }, foreign)
    ).rejects.toBeInstanceOf(SpillNotFound)
    await expect(read({ locator: 'spill_curto' })).rejects.toBeInstanceOf(
      SpillNotFound
    )
    await expect(
      read({ locator: `spill_${'A'.repeat(43)}` })
    ).rejects.toBeInstanceOf(SpillNotFound)
    // a store bound to one tenant cannot write for another
    await expect(foreign.put(put())).rejects.toMatchObject({
      retryable: false
    })
    await expect(foreign.put(put())).rejects.toBeInstanceOf(SpillError)
    // the same output under another tenant never shares a locator
    const own = await foreign.put(
      put({ tenantId: otherTenant, operationKey: 'op-iso' })
    )
    expect(own.locator).not.toBe(locator)
  })

  it('row level security hides another tenant even to a direct query', async () => {
    await store().put(put({ operationKey: 'op-rls' }))
    const client = await pool1.connect()
    try {
      await client.query('BEGIN')
      await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
        otherTenant
      ])
      const seen = await client.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE operation_key='op-rls'`
      )
      expect(seen.rows[0].n).toBe(0)
      await expect(
        client.query(
          `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
           VALUES ('${tenant}','s','${'c'.repeat(64)}','e','o','x','C','text/plain','${'d'.repeat(64)}',2,'\\x6162','2026-10-30','2026-10-31')`
        )
      ).rejects.toThrow(/row-level security/i)
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
    const noContext = await pool1.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects`
    )
    expect(noContext.rows[0].n).toBe(0)
  })

  it('rows are immutable: not even the owner can extend an expiry or change content', async () => {
    const { locator } = await store().put(put({ operationKey: 'op-immutable' }))
    void locator
    await expect(
      admin.query(
        `UPDATE ${schema}.spill_objects SET expires_at = expires_at + interval '1 day' WHERE operation_key='op-immutable'`
      )
    ).rejects.toThrow(/immutable/i)
    await expect(
      pool1.query(`UPDATE ${schema}.spill_objects SET content = '\\x00'`)
    ).rejects.toThrow(/permission denied/i)
    await expect(
      admin.query(`TRUNCATE ${schema}.spill_objects`)
    ).rejects.toThrow(/immutable/i)
  })

  it('reads slices by byte range, capped by the read limit', async () => {
    const s = store(pool1, { policy: { readMaxBytes: 5 } })
    const { locator } = await s.put(
      put({ operationKey: 'op-slice', content: 'abcdefghij' })
    )
    const base = { tenantId: tenant, sessionId: 'session-a', locator }
    expect(await s.read({ ...base, offset: 2, length: 3 })).toEqual({
      text: 'cde',
      offset: 2,
      skippedBytes: 0,
      bytesRead: 3,
      totalBytes: 10,
      eof: false
    })
    expect((await s.read({ ...base, offset: 0, length: 1000 })).bytesRead).toBe(
      5
    )
    expect((await s.read({ ...base, offset: 7, length: 5 })).eof).toBe(true)
    for (const bad of [
      { offset: -1 },
      { offset: 1.5 },
      { length: 0 },
      { length: 1.5 }
    ]) {
      await expect(
        s.read({ ...base, offset: 0, length: 1, ...bad })
      ).rejects.toBeInstanceOf(SpillError)
    }
  })

  it('reads multibyte content in 32 KiB slices and reassembles it exactly (review P2)', async () => {
    const s = store()
    // 2-, 3- and 4-byte characters land on and around every multiple of 32768
    const unit = 'aç€😀'
    const text = unit.repeat(11_000) + '😀€ç'
    const bytes = Buffer.byteLength(text, 'utf8')
    expect(bytes).toBeGreaterThan(3 * 32_768)
    const { locator } = await s.put(
      put({ operationKey: 'op-multibyte', content: text })
    )
    let offset = 0
    let rebuilt = ''
    let slices = 0
    for (;;) {
      const slice = await s.read({
        tenantId: tenant,
        sessionId: 'session-a',
        locator,
        offset,
        length: 32_768
      })
      expect(slice.skippedBytes).toBe(0)
      expect(slice.offset).toBe(offset)
      expect(slice.bytesRead).toBeLessThanOrEqual(32_768)
      expect(slice.text).not.toContain('\uFFFD')
      rebuilt += slice.text
      offset += slice.bytesRead
      slices += 1
      if (slice.eof) break
    }
    expect(slices).toBeGreaterThanOrEqual(4)
    expect(rebuilt).toBe(text)
    expect(offset).toBe(bytes)
  })

  it('aligns a requested offset that falls inside a character and reports it', async () => {
    const s = store()
    const { locator } = await s.put(
      put({ operationKey: 'op-align', content: 'a😀b€' })
    )
    const base = {
      tenantId: tenant,
      sessionId: 'session-a',
      locator,
      length: 100
    }
    expect(await s.read({ ...base, offset: 1 })).toMatchObject({
      text: '😀b€',
      offset: 1,
      skippedBytes: 0
    })
    expect(await s.read({ ...base, offset: 2 })).toMatchObject({
      text: 'b€',
      offset: 5,
      skippedBytes: 3,
      eof: true
    })
    expect(await s.read({ ...base, offset: 7 })).toMatchObject({
      text: '',
      offset: 9,
      skippedBytes: 2,
      bytesRead: 0,
      eof: true
    })
    // a window smaller than one character still makes progress
    expect(await s.read({ ...base, offset: 1, length: 1 })).toMatchObject({
      text: '😀',
      bytesRead: 4
    })
  })

  it('refuses identity fields with NUL or empty, and frames the HMAC input by length (review P3-b)', async () => {
    const s = store()
    for (const over of [
      { operationKey: 'a\u0000b' },
      { sessionId: 'a\u0000b' },
      { sourceId: '' },
      { executionId: 'x\u0000' }
    ]) {
      await expect(s.put(put(over))).rejects.toMatchObject({ retryable: false })
    }
    expect(
      lengthPrefixed(['a\u0000b', 'c']).equals(
        lengthPrefixed(['a', 'b\u0000c'])
      )
    ).toBe(false)
    expect(
      lengthPrefixed(['ab', 'c']).equals(lengthPrefixed(['a', 'bc']))
    ).toBe(false)
    expect(lengthPrefixed(['é']).length).toBe(4 + 2)
  })

  it('pins the search path inside every transaction (review P3-c)', async () => {
    const seen: string[] = []
    const recording: PostgresPoolLike = {
      connect: async () => {
        const client = await pool1.connect()
        return {
          query: async (text: string, values?: unknown[]) => {
            seen.push(text)
            return client.query(text, values as never)
          },
          release: (error?: Error) => client.release(error)
        } as never
      }
    } as never
    await store(recording).put(put({ operationKey: 'op-path' }))
    expect(seen).toContain(`SET LOCAL search_path = pg_catalog, "${schema}"`)
  })

  describe('slice 3: quota, erasure on request and the all-tenant sweep', () => {
    const quota = (tenantId: string, over: Record<string, number> = {}) =>
      new PostgresSpillStore(pool1, {
        tenantId,
        schemaName: schema,
        locatorKey: () => KEY,
        policy: {
          thresholdBytes: 4_000,
          previewHeadBytes: 100,
          previewTailBytes: 100,
          ...over
        }
      })
    const putAs = (tenantId: string, over: Partial<SpillPutInput> = {}) =>
      put({ tenantId, ...over })

    it('refuses the object past the per-session count; a repeat of an existing one still answers', async () => {
      const s = quota('quota-count', { maxObjectsPerSession: 2 })
      const one = await s.put(
        putAs('quota-count', { operationKey: 'o1', content: 'a1' })
      )
      await s.put(putAs('quota-count', { operationKey: 'o2', content: 'a2' }))
      await expect(
        s.put(putAs('quota-count', { operationKey: 'o3', content: 'a3' }))
      ).rejects.toBeInstanceOf(SpillQuotaExceeded)
      await expect(
        s.put(putAs('quota-count', { operationKey: 'o3', content: 'a3' }))
      ).rejects.toMatchObject({ retryable: false })
      expect(
        (
          await s.put(
            putAs('quota-count', { operationKey: 'o1', content: 'a1' })
          )
        ).locator
      ).toBe(one.locator)
      // another session of the same tenant has its own count
      await expect(
        s.put(
          putAs('quota-count', {
            sessionId: 'session-z',
            operationKey: 'o3',
            content: 'a3'
          })
        )
      ).resolves.toBeDefined()
      const stored = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE tenant_id='quota-count' AND session_id='session-a'`
      )
      expect(stored.rows[0].n).toBe(2)
    })

    it('refuses what would pass the per-tenant bytes, to the byte, across sessions', async () => {
      const s = quota('quota-bytes', {
        maxBytesPerTenant: 100,
        maxObjectsPerSession: 50
      })
      await s.put(
        putAs('quota-bytes', { operationKey: 'o1', content: 'x'.repeat(60) })
      )
      await expect(
        s.put(
          putAs('quota-bytes', {
            sessionId: 'session-z',
            operationKey: 'o2',
            content: 'y'.repeat(41)
          })
        )
      ).rejects.toBeInstanceOf(SpillQuotaExceeded)
      await expect(
        s.put(
          putAs('quota-bytes', {
            sessionId: 'session-z',
            operationKey: 'o3',
            content: 'z'.repeat(40)
          })
        )
      ).resolves.toBeDefined()
      // another tenant is not counted
      const other = quota('quota-bytes-other', { maxBytesPerTenant: 100 })
      await expect(
        other.put(
          putAs('quota-bytes-other', {
            operationKey: 'o1',
            content: 'w'.repeat(100)
          })
        )
      ).resolves.toBeDefined()
    })

    it('does not count an expired object against the quota', async () => {
      let now = new Date('2026-10-30T00:00:00.000Z')
      const s = new PostgresSpillStore(pool1, {
        tenantId: 'quota-expiry',
        schemaName: schema,
        locatorKey: () => KEY,
        clock: () => now,
        policy: { maxObjectsPerSession: 1 }
      })
      await s.put(putAs('quota-expiry', { operationKey: 'o1', content: 'um' }))
      await expect(
        s.put(putAs('quota-expiry', { operationKey: 'o2', content: 'dois' }))
      ).rejects.toBeInstanceOf(SpillQuotaExceeded)
      now = new Date('2026-10-31T00:00:01.000Z')
      await expect(
        s.put(putAs('quota-expiry', { operationKey: 'o2', content: 'dois' }))
      ).resolves.toBeDefined()
    })

    it('admits exactly the quota under concurrent writers (one tenant, two pools)', async () => {
      const writers = [quota('quota-race', { maxObjectsPerSession: 3 })]
      writers.push(
        new PostgresSpillStore(pool2, {
          tenantId: 'quota-race',
          schemaName: schema,
          locatorKey: () => KEY,
          policy: { maxObjectsPerSession: 3 }
        })
      )
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          writers[i % 2]!.put(
            putAs('quota-race', {
              operationKey: `race-${i}`,
              content: `conteudo ${i}`
            })
          )
        )
      )
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3)
      const refused = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      )
      expect(refused).toHaveLength(7)
      for (const r of refused)
        expect(r.reason).toBeInstanceOf(SpillQuotaExceeded)
      const stored = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE tenant_id='quota-race'`
      )
      expect(stored.rows[0].n).toBe(3)
    })

    it('erases one session on request and touches nothing else', async () => {
      const s = quota('purge-a')
      const mine = await s.put(
        putAs('purge-a', { operationKey: 'o1', content: 'um' })
      )
      await s.put(putAs('purge-a', { operationKey: 'o2', content: 'dois' }))
      const kept = await s.put(
        putAs('purge-a', {
          sessionId: 'session-z',
          operationKey: 'o1',
          content: 'um'
        })
      )
      const otherTenant = quota('purge-b')
      await otherTenant.put(
        putAs('purge-b', { operationKey: 'o1', content: 'um' })
      )
      expect(
        await s.purgeSession({ tenantId: 'purge-a', sessionId: 'session-a' })
      ).toBe(2)
      expect(
        await s.purgeSession({ tenantId: 'purge-a', sessionId: 'session-a' })
      ).toBe(0)
      // a store bound to another tenant removes nothing of this one
      expect(
        await otherTenant.purgeSession({
          tenantId: 'purge-a',
          sessionId: 'session-z'
        })
      ).toBe(0)
      await expect(
        s.read({
          tenantId: 'purge-a',
          sessionId: 'session-a',
          locator: mine.locator,
          offset: 0,
          length: 5
        })
      ).rejects.toBeInstanceOf(SpillNotFound)
      await expect(
        s.read({
          tenantId: 'purge-a',
          sessionId: 'session-z',
          locator: kept.locator,
          offset: 0,
          length: 5
        })
      ).resolves.toBeDefined()
      const remaining = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE tenant_id IN ('purge-a','purge-b')`
      )
      expect(remaining.rows[0].n).toBe(2)
    })

    it('sweeps the expired rows of every tenant as the maintenance role, and only those', async () => {
      const insert = async (
        tenantId: string,
        hash: string,
        expires: string
      ) => {
        await admin.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantId
        ])
        await admin.query(
          `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
           VALUES ($1,'s',$2,'e','o','x','C','text/plain',$3,2,'\\x6162','2020-01-01',$4)`,
          [tenantId, hash.repeat(64), 'b'.repeat(64), expires]
        )
      }
      await insert('sweep-a', 'a', '2020-01-02')
      await insert('sweep-a', 'b', '2999-01-01')
      await insert('sweep-b', 'c', '2020-01-02')
      // a session that is not a member of the maintenance role is refused before any delete,
      // and what it deletes on its own sees nothing across tenants
      const outsider = new PostgresSpillSweeper(pool1, { schemaName: schema })
      await expect(outsider.purgeExpired()).rejects.toBeInstanceOf(
        SpillStorageUnavailable
      )
      const own = await pool1.query(
        `DELETE FROM ${schema}.spill_objects WHERE expires_at <= now()`
      )
      expect(own.rowCount).toBe(0)
      const sweeper = new PostgresSpillSweeper(sweepPool, {
        schemaName: schema
      })
      expect(await sweeper.purgeExpired()).toBeGreaterThanOrEqual(2)
      const left = await admin.query(
        `SELECT tenant_id, expires_at > now() AS live FROM ${schema}.spill_objects WHERE tenant_id IN ('sweep-a','sweep-b')`
      )
      expect(left.rows).toEqual([{ tenant_id: 'sweep-a', live: true }])
      expect(await sweeper.purgeExpired()).toBe(0)
    })

    it('the maintenance role can neither read a live row nor write', async () => {
      await admin.query(
        "SELECT set_config('cvg.tenant_id', 'sweep-live', false)"
      )
      await admin.query(
        `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
         VALUES ('sweep-live','s','${'9'.repeat(64)}','e','o','x','C','text/plain','${'b'.repeat(64)}',2,'\\x6162','2020-01-01','2999-01-01')`
      )
      const seen = await sweepPool.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE tenant_id='sweep-live'`
      )
      expect(seen.rows[0].n).toBe(0)
      await expect(
        sweepPool.query(
          `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
           VALUES ('sweep-live','s','${'8'.repeat(64)}','e','o','x','C','text/plain','${'b'.repeat(64)}',2,'\\x6162','2020-01-01','2999-01-01')`
        )
      ).rejects.toThrow(/permission denied|row-level security/i)
      const role = await admin.query(
        `SELECT rolcanlogin, rolsuper, rolbypassrls FROM pg_roles WHERE rolname='cvg_spill_sweeper'`
      )
      expect(role.rows).toEqual([
        { rolcanlogin: false, rolsuper: false, rolbypassrls: false }
      ])
    })

    describe('F03: an abort while the put waits for the tenant lock stores nothing', () => {
      const lockSql =
        "SELECT pg_advisory_lock(hashtextextended('spill:' || $1, 0))"
      const unlockSql =
        "SELECT pg_advisory_unlock(hashtextextended('spill:' || $1, 0))"
      const waiters = async () =>
        Number(
          (
            await admin.query(
              `SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted`
            )
          ).rows[0].n
        )
      const untilWaiting = async () => {
        for (let i = 0; i < 100; i += 1) {
          if ((await waiters()) > 0) return
          await new Promise((r) => setTimeout(r, 20))
        }
        throw new Error('the put never reached the lock wait')
      }
      const rowsFor = async (content: string) =>
        Number(
          (
            await admin.query(
              `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE content = convert_to($1,'UTF8')`,
              [content]
            )
          ).rows[0].n
        )

      it('cancels the waiting statement at once, while the lock is still held', async () => {
        const tenantId = `f03-a-${suffix}`
        const holder = new Client({ connectionString: url })
        await holder.connect()
        await holder.query(lockSql, [tenantId])
        try {
          const abort = new AbortController()
          const content = `f03-a-${suffix}`
          const running = store(pool1, { tenantId })
            .put(put({ tenantId, content, signal: abort.signal }))
            .then(
              () => 'stored' as const,
              (error: unknown) => error
            )
          await untilWaiting()
          const started = Date.now()
          abort.abort()
          const outcome = await running
          expect(outcome).toBeInstanceOf(SpillCancelled)
          // far below the 5 s lock timeout: the abort cancelled the wait, it did not outlast it
          expect(Date.now() - started).toBeLessThan(3000)
        } finally {
          await holder.query(unlockSql, [tenantId])
          await holder.end()
        }
        expect(await rowsFor(`f03-a-${suffix}`)).toBe(0)
      })

      it('stops after the lock when the cancel could not land: nothing is written', async () => {
        const tenantId = `f03-b-${suffix}`
        const holder = new Client({ connectionString: url })
        await holder.connect()
        await holder.query(lockSql, [tenantId])
        // a second connection is never available, so pg_cancel_backend cannot be sent
        let connects = 0
        const statements: string[] = []
        const noCancel = {
          connect: async () => {
            connects += 1
            if (connects > 1) throw new Error('no second connection')
            const client = await pool1.connect()
            const query = client.query.bind(client) as (
              ...args: unknown[]
            ) => Promise<unknown>
            ;(client as unknown as { query: unknown }).query = (
              text: unknown,
              ...rest: unknown[]
            ) => {
              if (typeof text === 'string') statements.push(text)
              return query(text, ...rest)
            }
            return client
          }
        } as unknown as PostgresPoolLike
        try {
          const abort = new AbortController()
          const content = `f03-b-${suffix}`
          const running = store(noCancel, { tenantId })
            .put(put({ tenantId, content, signal: abort.signal }))
            .then(
              () => 'stored' as const,
              (error: unknown) => error
            )
          await untilWaiting()
          abort.abort()
          await new Promise((r) => setTimeout(r, 100))
          await holder.query(unlockSql, [tenantId])
          expect(await running).toBeInstanceOf(SpillCancelled)
        } finally {
          await holder.end()
        }
        expect(await rowsFor(`f03-b-${suffix}`)).toBe(0)
        // stopped at the lock: not a single write was sent after the wait
        expect(
          statements.filter((text) => /INSERT INTO|DELETE FROM/.test(text))
        ).toEqual([])
      })

      it('an abort that arrives while the statement after the lock runs is rolled back, not committed', async () => {
        const tenantId = `f03-c-${suffix}`
        const abort = new AbortController()
        const content = `f03-c-${suffix}`
        // abort exactly when the INSERT is sent: the first statement that mentions the table
        let fired = false
        let opened = 0
        const probe = {
          connect: async () => {
            // one connection only: pg_cancel_backend can never be sent, so the check before
            // the commit is the only thing between the abort and a stored row
            opened += 1
            if (opened > 1) throw new Error('no second connection')
            const client = await pool1.connect()
            const query = client.query.bind(client) as (
              ...args: unknown[]
            ) => Promise<unknown>
            ;(client as unknown as { query: unknown }).query = (
              text: unknown,
              ...rest: unknown[]
            ) => {
              if (
                !fired &&
                typeof text === 'string' &&
                text.includes('INSERT INTO')
              ) {
                fired = true
                abort.abort()
              }
              return query(text, ...rest)
            }
            return client
          }
        } as unknown as PostgresPoolLike
        const outcome = await store(probe, { tenantId })
          .put(put({ tenantId, content, signal: abort.signal }))
          .then(
            () => 'stored' as const,
            (error: unknown) => error
          )
        expect(fired).toBe(true)
        expect(outcome).toBeInstanceOf(SpillCancelled)
        expect(await rowsFor(content)).toBe(0)
      })

      it('control: without an abort the same put commits', async () => {
        const tenantId = `f03-d-${suffix}`
        const content = `f03-d-${suffix}`
        const receipt = await store(pool1, { tenantId }).put(
          put({ tenantId, content, signal: new AbortController().signal })
        )
        expect(receipt.locator).toMatch(/^spill_/)
        expect(await rowsFor(content)).toBe(1)
      })
    })

    it('F02: the sweeper deletes what expired in every tenant but can never read content', async () => {
      const insert = async (
        tenantId: string,
        hash: string,
        expires: string
      ) => {
        await admin.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantId
        ])
        await admin.query(
          `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
           VALUES ($1,'s',$2,'e','o','x','C','text/plain',$3,${'CANARIO-CONFIDENCIAL'.length},convert_to('CANARIO-CONFIDENCIAL','UTF8'),'2020-01-01',$4)`,
          [tenantId, hash.repeat(64), 'b'.repeat(64), expires]
        )
      }
      await insert('f02-a', '1', '2020-01-02')
      await insert('f02-b', '2', '2020-01-02')
      await insert('f02-b', '3', '2999-01-01')
      for (const read of [
        `SELECT content FROM ${schema}.spill_objects`,
        `SELECT * FROM ${schema}.spill_objects`,
        `SELECT length(content) FROM ${schema}.spill_objects`
      ])
        await expect(sweepPool.query(read)).rejects.toThrow(
          /permission denied/i
        )
      // identity and expiry stay readable, so the DELETE can find the expired rows
      const visible = await sweepPool.query(
        `SELECT tenant_id, expires_at FROM ${schema}.spill_objects WHERE tenant_id LIKE 'f02-%' ORDER BY tenant_id`
      )
      expect(visible.rows.map((r) => r.tenant_id)).toEqual(['f02-a', 'f02-b'])
      await expect(
        sweepPool.query(`UPDATE ${schema}.spill_objects SET expires_at = now()`)
      ).rejects.toThrow(/permission denied/i)
      await expect(
        sweepPool.query(`TRUNCATE ${schema}.spill_objects`)
      ).rejects.toThrow(/permission denied/i)
      const sweeper = new PostgresSpillSweeper(sweepPool, {
        schemaName: schema
      })
      expect(await sweeper.purgeExpired()).toBeGreaterThanOrEqual(2)
      const left = await admin.query(
        `SELECT tenant_id, locator_hash FROM ${schema}.spill_objects WHERE tenant_id LIKE 'f02-%'`
      )
      expect(left.rows).toEqual([
        { tenant_id: 'f02-b', locator_hash: '3'.repeat(64) }
      ])
    })

    it('N01: the sweeper refuses to run unless the role is provisioned with least privilege', async () => {
      const login = async (
        name: string,
        setup: (name: string) => Promise<void>
      ) => {
        await admin.query(
          `CREATE ROLE ${name} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${name}`)
        await setup(name)
        const u = new URL(url!)
        u.username = name
        u.password = password
        return new Pool({ connectionString: u.toString(), max: 1 })
      }
      const refused = async (
        name: string,
        setup: (name: string) => Promise<void>
      ) => {
        const p = await login(name, setup)
        try {
          await expect(
            new PostgresSpillSweeper(p, { schemaName: schema }).purgeExpired()
          ).rejects.toMatchObject({
            message: expect.stringContaining('least privilege')
          })
        } finally {
          await p.end()
          await admin.query(`DROP OWNED BY ${name}`)
          await admin.query(`DROP ROLE ${name}`)
        }
      }
      const column = `SELECT (tenant_id, session_id, locator_hash, expires_at), DELETE`
      // member, but the privileges of the role are not inherited (the pre-0291 shape of a login)
      await refused(`n01_none_${suffix}`, async (n) => {
        await admin.query(`GRANT cvg_spill_sweeper TO ${n} WITH INHERIT FALSE`)
      })
      // grants, but not a member of the role
      await refused(`n01_nomember_${suffix}`, async (n) => {
        await admin.query(`GRANT ${column} ON ${schema}.spill_objects TO ${n}`)
      })
      // member with the reading of content the old composition had
      await refused(`n01_content_${suffix}`, async (n) => {
        await admin.query(`GRANT cvg_spill_sweeper TO ${n} WITH INHERIT TRUE`)
        await admin.query(
          `GRANT SELECT, DELETE ON ${schema}.spill_objects TO ${n}`
        )
      })
      // member with the right columns and one privilege more
      for (const extra of [
        'UPDATE (expires_at)',
        'INSERT',
        'TRUNCATE',
        'TRIGGER',
        'REFERENCES (tenant_id)'
      ]) {
        await refused(
          `n01_x${extra.replace(/\W/g, '').toLowerCase()}_${suffix}`,
          async (n) => {
            await admin.query(
              `GRANT cvg_spill_sweeper TO ${n} WITH INHERIT TRUE`
            )
            await admin.query(
              `GRANT ${column} ON ${schema}.spill_objects TO ${n}`
            )
            await admin.query(
              `GRANT ${extra} ON ${schema}.spill_objects TO ${n}`
            )
          }
        )
      }
      // the provisioned login role is accepted
      expect(
        await new PostgresSpillSweeper(sweepPool, {
          schemaName: schema
        }).purgeExpired()
      ).toBeGreaterThanOrEqual(0)
    })

    it('N01: with the role absent the sweeper refuses, with its own message', async () => {
      const missing = `cvg_spill_sweeper_gone_${suffix}`
      await admin.query(`ALTER ROLE cvg_spill_sweeper RENAME TO ${missing}`)
      try {
        await expect(
          new PostgresSpillSweeper(sweepPool, {
            schemaName: schema
          }).purgeExpired()
        ).rejects.toMatchObject({
          message: expect.stringContaining('least privilege')
        })
      } finally {
        await admin.query(`ALTER ROLE ${missing} RENAME TO cvg_spill_sweeper`)
      }
    })

    it('verify() is the startup check: it passes for the provisioned login and refuses any other, deleting nothing', async () => {
      await admin.query("SELECT set_config('cvg.tenant_id', 'verify-t', false)")
      await admin.query(
        `INSERT INTO ${schema}.spill_objects (tenant_id,session_id,locator_hash,execution_id,operation_key,source_id,classification,media_type,content_sha256,byte_length,content,created_at,expires_at)
         VALUES ('verify-t','s','${'7'.repeat(64)}','e','o','x','C','text/plain','${'b'.repeat(64)}',2,'\\x6162','2020-01-01','2020-01-02')`
      )
      await new PostgresSpillSweeper(sweepPool, {
        schemaName: schema
      }).verify()
      await expect(
        new PostgresSpillSweeper(pool1, { schemaName: schema }).verify()
      ).rejects.toMatchObject({
        message: expect.stringContaining('least privilege')
      })
      await expect(
        new PostgresSpillSweeper(sweepPool, {
          schemaName: 'no_such_schema'
        }).verify()
      ).rejects.toBeInstanceOf(SpillStorageUnavailable)
      const dead = {
        connect: async () => {
          throw new Error('down')
        }
      } as unknown as PostgresPoolLike
      await expect(
        new PostgresSpillSweeper(dead, { schemaName: schema }).verify()
      ).rejects.toBeInstanceOf(SpillStorageUnavailable)
      const left = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE tenant_id='verify-t'`
      )
      expect(left.rows[0].n).toBe(1)
      await admin.query(
        `DELETE FROM ${schema}.spill_objects WHERE tenant_id='verify-t'`
      )
    })

    it('N01: the migration creates no role and grants nothing', () => {
      const sql = readFileSync(
        new URL('../../migrations/0037_tool_output_spill.sql', import.meta.url),
        'utf8'
      )
      expect(sql).not.toMatch(/CREATE\s+ROLE/i)
      expect(sql).not.toMatch(/^\s*GRANT\b/im)
    })

    it('the provisioning script leaves the role without CREATEROLE, login, bypass or superuser', async () => {
      const r = await admin.query(
        `SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
           FROM pg_roles WHERE rolname='cvg_spill_sweeper'`
      )
      expect(r.rows).toEqual([
        {
          rolcanlogin: false,
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false
        }
      ])
    })

    it('reports a sweep failure as a retryable error and rejects a bad schema', async () => {
      const dead = {
        connect: async () => {
          throw new Error('down')
        }
      } as unknown as PostgresPoolLike
      await expect(
        new PostgresSpillSweeper(dead, { schemaName: schema }).purgeExpired()
      ).rejects.toBeInstanceOf(SpillStorageUnavailable)
      expect(
        () => new PostgresSpillSweeper(pool1, { schemaName: 'Bad Schema' })
      ).toThrow(SpillError)
      const broken = new PostgresSpillSweeper(pool1, {
        schemaName: 'no_such_schema'
      })
      await expect(broken.purgeExpired()).rejects.toMatchObject({
        retryable: true
      })
    })
  })

  it('refuses content above the stored limit and empty content', async () => {
    const small = store(pool1, {
      policy: {
        maxStoredBytes: 10_000,
        thresholdBytes: 4_000,
        previewHeadBytes: 100,
        previewTailBytes: 100
      }
    })
    await expect(
      small.put(put({ operationKey: 'op-big', content: 'z'.repeat(10_001) }))
    ).rejects.toBeInstanceOf(SpillTooLarge)
    await expect(
      small.put(put({ operationKey: 'op-edge', content: 'z'.repeat(10_000) }))
    ).resolves.toBeDefined()
    await expect(
      small.put(put({ operationKey: 'op-empty', content: '' }))
    ).rejects.toBeInstanceOf(SpillError)
  })

  it('does not serve an expired object, sweeps it by validity, and a new write after expiry gets a fresh expiry', async () => {
    let now = new Date('2026-10-30T00:00:00.000Z')
    const s = store(pool1, { clock: () => now })
    const first = await s.put(
      put({ operationKey: 'op-expiry', content: 'vale um dia' })
    )
    const keep = await s.put(
      put({ operationKey: 'op-expiry-keep', content: 'ainda vale' })
    )
    now = new Date('2026-10-30T23:59:59.999Z')
    const read = {
      tenantId: tenant,
      sessionId: 'session-a',
      locator: first.locator,
      offset: 0,
      length: 5
    }
    await expect(s.read(read)).resolves.toBeDefined()
    now = new Date('2026-10-31T00:00:00.000Z')
    await expect(s.read(read)).rejects.toBeInstanceOf(SpillExpired)
    // both expired now; make `keep` live longer by giving it a later clock write
    const later = await s.put(
      put({ operationKey: 'op-expiry', content: 'vale um dia' })
    )
    expect(later.locator).toBe(first.locator)
    expect(Date.parse(later.expiresAt)).toBeGreaterThan(
      Date.parse(first.expiresAt)
    )
    await expect(s.read(read)).resolves.toBeDefined()
    void keep
    now = new Date('2026-11-02T00:00:00.000Z')
    const purged = await s.purgeExpired()
    expect(purged).toBeGreaterThanOrEqual(2)
    const left = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects WHERE operation_key LIKE 'op-expiry%'`
    )
    expect(left.rows[0].n).toBe(0)
    await expect(s.purgeExpired(0)).rejects.toBeInstanceOf(SpillError)
  })

  it('the sweep removes only this tenant and only expired rows, within the limit', async () => {
    let now = new Date('2026-10-30T00:00:00.000Z')
    const a = store(pool1, { clock: () => now })
    for (let i = 0; i < 3; i += 1)
      await a.put(put({ operationKey: `op-sweep-${i}`, content: `c${i}` }))
    const b = store(pool2, { tenantId: otherTenant, clock: () => now })
    await b.put(
      put({
        tenantId: otherTenant,
        operationKey: 'op-sweep-b',
        content: 'do outro tenant'
      })
    )
    now = new Date('2026-10-31T01:00:00.000Z')
    expect(await a.purgeExpired(2)).toBe(2)
    expect(await a.purgeExpired(10)).toBe(1)
    expect(await a.purgeExpired(10)).toBe(0)
    // the other tenant's expired row is only removed by its own sweep
    expect(await b.purgeExpired(10)).toBe(1)
  })

  it('cancellation before the write stores nothing (I7)', async () => {
    const controller = new AbortController()
    controller.abort()
    const before = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects`
    )
    await expect(
      store().put(put({ operationKey: 'op-cancel', signal: controller.signal }))
    ).rejects.toBeInstanceOf(SpillCancelled)
    await expect(
      store().read({
        tenantId: tenant,
        sessionId: 'session-a',
        locator: `spill_${'A'.repeat(43)}`,
        offset: 0,
        length: 1,
        signal: controller.signal
      })
    ).rejects.toBeInstanceOf(SpillCancelled)
    const after = await admin.query(
      `SELECT count(*)::int AS n FROM ${schema}.spill_objects`
    )
    expect(after.rows[0].n).toBe(before.rows[0].n)
  })

  it('maps an unavailable database to a retryable error and a lost COMMIT to an unknown outcome', async () => {
    const dead = {
      connect: async () => {
        throw new Error('down')
      }
    } as unknown as PostgresPoolLike
    await expect(store(dead).put(put())).rejects.toMatchObject({
      retryable: true
    })
    await expect(store(dead).put(put())).rejects.toBeInstanceOf(
      SpillStorageUnavailable
    )

    const lostCommit: PostgresPoolLike = {
      connect: async () => {
        const client = await pool1.connect()
        return {
          query: async (text: string, values?: unknown[]) => {
            if (text === 'COMMIT') {
              await client.query('ROLLBACK')
              throw new Error('connection reset')
            }
            return client.query(text, values as never)
          },
          release: (error?: Error) => client.release(error)
        } as never
      }
    } as never
    await expect(
      store(lostCommit).put(put({ operationKey: 'op-lost' }))
    ).rejects.toBeInstanceOf(SpillCommitUnknown)
    // a read has nothing to commit: a failure is a plain, retryable error
    const brokenRead: PostgresPoolLike = {
      connect: async () => {
        const client = await pool1.connect()
        return {
          query: async (text: string, values?: unknown[]) => {
            if (text.startsWith('SELECT byte_length'))
              throw new Error('read failed')
            return client.query(text, values as never)
          },
          release: (error?: Error) => client.release(error)
        } as never
      }
    } as never
    await expect(
      store(brokenRead).read({
        tenantId: tenant,
        sessionId: 'session-a',
        locator: `spill_${'A'.repeat(43)}`,
        offset: 0,
        length: 1
      })
    ).rejects.toBeInstanceOf(SpillStorageUnavailable)
  })

  it('composes with the renderer: a large output is stored durably and shown with its locator', async () => {
    const policy = resolveSpillPolicy()
    const content = `INICIO-${'p'.repeat(20_000)}-FIM`
    const prepared = await prepareToolOutput({
      tenantId: tenant,
      sessionId: 'session-a',
      executionId: 'exec-a',
      operationKey: 'op-compose',
      toolId: 'tool.x',
      classification: 'CONFIDENTIAL',
      output: content,
      policy,
      store: store(),
      storedSoFar: 0
    })
    expect(prepared.rendering).toMatchObject({ form: 'preview', stored: true })
    expect(prepared.rendering.text).toContain(
      `locator=${prepared.rendering.locator}`
    )
    const slice = await store().read({
      tenantId: tenant,
      sessionId: 'session-a',
      locator: prepared.rendering.locator as string,
      offset: 0,
      length: 32768
    })
    expect(slice.text.startsWith('INICIO-')).toBe(true)
  })
})
