// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
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
  SpillStorageUnavailable,
  SpillTooLarge,
  prepareToolOutput,
  resolveSpillPolicy
} from '@cvg/harness'
import {
  PostgresSpillStore,
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
    pool1 = new Pool({ connectionString: roleUrl.toString(), max: 4 })
    pool2 = new Pool({ connectionString: roleUrl.toString(), max: 4 })
  }, 30000)

  afterAll(async () => {
    await pool1?.end()
    await pool2?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP ROLE IF EXISTS ${role}`)
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
