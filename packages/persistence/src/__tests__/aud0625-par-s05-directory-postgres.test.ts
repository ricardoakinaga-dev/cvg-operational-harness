// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  SessionMigrationRequiredError,
  SessionPersistenceCorruptionError,
  SessionStorageUnavailableError,
  createSessionQuery
} from '@cvg/harness'
import {
  runSessionEventMigrations,
  runSessionQueryMigrations
} from '../session-events.ts'
import {
  PostgresSessionDirectory,
  SESSION_QUERY_INDEX,
  sessionWindowSql
} from '../session-query-postgres.ts'
import type { PostgresPoolLike } from '../tenant-scoped-postgres.ts'

/**
 * PAR-S05 slice 2 (SPEC 0295 §4, D1-b): the PostgreSQL window of the session listing. Needs a
 * disposable database through TEST_DATABASE_URL. Synthetic data only.
 */
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S05_PG_REQUIRED === '1')
  throw new Error('PAR-S05 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(5).toString('hex')
const schema = `pars05_${suffix}`
const bareSchema = `pars05b_${suffix}`
const role = `pars05_role_${suffix}`
const password = 'pars05-synthetic-only'
const tenantA = 'tenant-s05-A'
const tenantB = 'tenant-s05-B'
let admin: Client
let pool: Pool

const header = (
  id: string,
  createdAt: number,
  extra: Record<string, unknown> = {}
) => JSON.stringify({ version: 1, id, createdAt, isSeeded: false, ...extra })
async function insert(
  tenantId: string,
  id: string,
  createdAt: number,
  extra: Record<string, unknown> = {},
  schemaName = schema
) {
  await admin.query(
    `INSERT INTO ${schemaName}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
     VALUES ($1, $2, 1, $3, $4)`,
    [tenantId, id, header(id, createdAt, extra), 0]
  )
}
const directory = (
  tenantId = tenantA,
  schemaName = schema,
  p: PostgresPoolLike = pool
) => new PostgresSessionDirectory(p, { tenantId, schemaName })
const query = (tenantId = tenantA) =>
  createSessionQuery({ tenantId, directory: directory(tenantId) })

describe.skipIf(!url)('PAR-S05 slice 2 — PostgreSQL session directory', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runSessionQueryMigrations(admin, { schemaName: schema })
    await runSessionQueryMigrations(admin, { schemaName: schema })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(`GRANT SELECT ON ${schema}.session_streams TO ${role}`)
    const u = new URL(url!)
    u.username = role
    u.password = password
    pool = new Pool({ connectionString: u.toString(), max: 4 })
  }, 60000)
  afterAll(async () => {
    await pool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${bareSchema} CASCADE`)
      await admin.query(`DROP OWNED BY ${role}`).catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`)
      await admin.end()
    }
  })

  it('applies the migration twice without effect and builds the tenant order index', async () => {
    const found = await admin.query(
      'SELECT indexdef FROM pg_indexes WHERE schemaname = $1 AND indexname = $2',
      [schema, SESSION_QUERY_INDEX]
    )
    expect(found.rows).toHaveLength(1)
    expect(found.rows[0].indexdef).toMatch(
      /\(tenant_id, \(\(writer_lock_id\)::bigint\)\)/
    )
  })

  it('lists only the tenant of the composition, newest key first, with the header as the summary', async () => {
    for (let i = 1; i <= 6; i++) {
      await insert(
        i % 2 === 0 ? tenantA : tenantB,
        `list-${i}`,
        5000 - i,
        i === 4
          ? {
              agentPreset: 'triage',
              parentSession: 'list-2',
              origin: 'subagent'
            }
          : {}
      )
    }
    const page = await query(tenantA).list()
    expect(page.items.map((s) => s.sessionId)).toEqual([
      'list-6',
      'list-4',
      'list-2'
    ])
    expect(page.items[1]).toMatchObject({
      sessionId: 'list-4',
      createdAt: 4996,
      isSeeded: false,
      parentSession: 'list-2',
      origin: 'subagent',
      agentPreset: 'triage',
      inheritedEventCount: 0
    })
    expect(page).toMatchObject({
      nextCursor: null,
      examined: 3,
      skippedUnadopted: 0
    })
    const other = await query(tenantB).list()
    expect(other.items.map((s) => s.sessionId)).toEqual([
      'list-5',
      'list-3',
      'list-1'
    ])
    const nobody = await query('tenant-s05-nobody').list()
    expect(nobody.items).toEqual([])
  })

  it('orders by the position key, not by the creation time in the header', async () => {
    const t = `tenant-order-${suffix}`
    await insert(t, 'first-in', 9_000_000)
    await insert(t, 'second-in', 1)
    const page = await createSessionQuery({
      tenantId: t,
      directory: directory(t)
    }).list()
    expect(page.items.map((s) => s.sessionId)).toEqual([
      'second-in',
      'first-in'
    ])
  })

  it('pages with the cursor without a hole or a repeat, and with a filter', async () => {
    const t = `tenant-page-${suffix}`
    for (let i = 1; i <= 25; i++)
      await insert(t, `pg-${i}`, i, i % 5 === 0 ? { agentPreset: 'p5' } : {})
    const q = createSessionQuery({ tenantId: t, directory: directory(t) })
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await q.list({
        limit: 2,
        filter: { agentPreset: 'p5' },
        ...(cursor ? { cursor } : {})
      })
      seen.push(...page.items.map((s) => s.sessionId))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    expect(seen).toEqual(['pg-25', 'pg-20', 'pg-15', 'pg-10', 'pg-5'])
  })

  it('leaves out streams without adopted metadata and counts them in the window', async () => {
    const t = `tenant-unadopted-${suffix}`
    await insert(t, 'adopted-1', 1)
    await admin.query(
      `ALTER TABLE ${schema}.session_streams DISABLE TRIGGER session_streams_default_header`
    )
    try {
      await admin.query(
        `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version) VALUES ($1, 'legacy-1', 1), ($1, 'legacy-2', 1)`,
        [t]
      )
    } finally {
      await admin.query(
        `ALTER TABLE ${schema}.session_streams ENABLE TRIGGER session_streams_default_header`
      )
    }
    await insert(t, 'adopted-2', 2)
    const page = await createSessionQuery({
      tenantId: t,
      directory: directory(t)
    }).list()
    expect(page.items.map((s) => s.sessionId)).toEqual([
      'adopted-2',
      'adopted-1'
    ])
    expect(page).toMatchObject({ examined: 4, skippedUnadopted: 2 })
  })

  it('the window is cut BEFORE the filter: 2001 streams with the only match at the 1500th, over PostgreSQL', async () => {
    const t = `tenant-window-${suffix}`
    await admin.query(
      `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
       SELECT $1, 'w' || g, 1,
              json_build_object('version',1,'id','w'||g,'createdAt',g,'isSeeded',false,'agentPreset', CASE WHEN g = 502 THEN 'target' ELSE 'other' END)::text, 0
         FROM generate_series(1, 2001) g`,
      [t]
    )
    const q = createSessionQuery({ tenantId: t, directory: directory(t) })
    const filter = { agentPreset: 'target' }
    const one = await q.list({ filter })
    expect(one).toMatchObject({ items: [], examined: 1000 })
    expect(one.nextCursor).not.toBeNull()
    const two = await q.list({ filter, cursor: one.nextCursor! })
    expect(two.items.map((s) => s.sessionId)).toEqual(['w502'])
    const three = await q.list({ filter, cursor: two.nextCursor! })
    expect(three).toMatchObject({ items: [], examined: 1, nextCursor: null })
  })

  it('F02: a stream that commits after the cursor passed its position is missed by that pagination and shown by a new one, with no repeat', async () => {
    const t = `tenant-live-${suffix}`
    await insert(t, 'live-low', 1)
    const pending = new Client({ connectionString: url })
    await pending.connect()
    try {
      await pending.query('BEGIN')
      await pending.query(
        `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
         VALUES ($1, 'live-late', 1, $2, 0)`,
        [t, header('live-late', 2)]
      )
      await insert(t, 'live-high', 3)
      const q = createSessionQuery({ tenantId: t, directory: directory(t) })
      const first = await q.list({ limit: 1 })
      expect(first.items.map((s) => s.sessionId)).toEqual(['live-high'])
      const second = await q.list({ limit: 1, cursor: first.nextCursor! })
      expect(second.items.map((s) => s.sessionId)).toEqual(['live-low'])
      await pending.query('COMMIT')
      const rest = second.nextCursor
        ? await q.list({ limit: 1, cursor: second.nextCursor })
        : { items: [] }
      expect(rest.items).toEqual([])
      const fresh = await q.list()
      expect(fresh.items.map((s) => s.sessionId)).toEqual([
        'live-high',
        'live-late',
        'live-low'
      ])
    } finally {
      await pending.query('ROLLBACK').catch(() => undefined)
      await pending.end()
    }
  })

  it('the plan is bounded whatever the other tenants hold: a backward scan of the index, no rows thrown away', async () => {
    const big = `tenant-old-${suffix}`
    await admin.query(
      `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
       SELECT $1, 'o' || g, 1, json_build_object('version',1,'id','o'||g,'createdAt',g,'isSeeded',false)::text, 0
         FROM generate_series(1, 60000) g`,
      [big]
    )
    await admin.query(
      `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
       SELECT 'tenant-noise-' || (g % 100), 'n' || g, 1, json_build_object('version',1,'id','n'||g,'createdAt',g,'isSeeded',false)::text, 0
         FROM generate_series(1, 60000) g`
    )
    await admin.query(`ANALYZE ${schema}.session_streams`)
    const plan = async (
      sql: string,
      tenantId: string,
      before: number | null
    ) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
          tenantId
        ])
        const r = await client.query(
          `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
          [tenantId, before, 1000]
        )
        await client.query('ROLLBACK')
        return JSON.stringify(r.rows[0]['QUERY PLAN'])
      } finally {
        client.release()
      }
    }
    for (const before of [null, 100000, 30000]) {
      const text = await plan(sessionWindowSql(schema), big, before)
      expect(text, `before ${before}`).toContain(SESSION_QUERY_INDEX)
      expect(text).toContain('Backward')
      expect(text).not.toContain('Rows Removed by Filter')
      expect(text).not.toContain('Seq Scan')
      expect(text).not.toContain('"Sort"')
    }
    // control: ordering by the bare column lets the planner walk the global unique index through
    // every other tenant's streams for the same tenant and cursor
    const bare = `SELECT writer_lock_id AS key, session_id, header_json, inherited_event_count
       FROM "${schema}".session_streams
      WHERE tenant_id = $1 AND ($2::bigint IS NULL OR writer_lock_id < $2)
      ORDER BY writer_lock_id DESC LIMIT $3`
    const control = await plan(bare, big, 100000)
    expect(control).toContain('Rows Removed by Filter')
    const removed = Number(
      /"Rows Removed by Filter":\s*(\d+)/.exec(control)?.[1] ?? 0
    )
    expect(removed).toBeGreaterThan(10000)
  }, 120000)

  it('refuses to run in a schema without the index and does not remember a failure', async () => {
    await runSessionEventMigrations(admin, { schemaName: bareSchema })
    await admin.query(`GRANT USAGE ON SCHEMA ${bareSchema} TO ${role}`)
    await admin.query(
      `GRANT SELECT ON ${bareSchema}.session_streams TO ${role}`
    )
    await insert(tenantA, 'bare-1', 1, {}, bareSchema)
    const bare = directory(tenantA, bareSchema)
    await expect(bare.window({ size: 10 })).rejects.toBeInstanceOf(
      SessionMigrationRequiredError
    )
    await expect(bare.window({ size: 10 })).rejects.toBeInstanceOf(
      SessionMigrationRequiredError
    )
    await runSessionQueryMigrations(admin, { schemaName: bareSchema })
    expect(
      (await bare.window({ size: 10 })).map((r) => r.summary?.sessionId)
    ).toEqual(['bare-1'])
  })

  it('refuses a header that is not sound instead of listing a guess', async () => {
    const cases: [string, string][] = [
      ['not json', 'this is not json'],
      ['another session id', header('someone-else', 1)],
      [
        'a version from the future',
        JSON.stringify({ version: 9, id: 'x', createdAt: 1, isSeeded: false })
      ]
    ]
    for (const [name, text] of cases) {
      const t = `tenant-bad-${suffix}-${name.replace(/\W/g, '')}`
      await admin.query(
        `INSERT INTO ${schema}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count)
         VALUES ($1, 'bad-1', 1, $2, 0)`,
        [t, text]
      )
      await expect(
        createSessionQuery({ tenantId: t, directory: directory(t) }).list(),
        name
      ).rejects.toBeInstanceOf(SessionPersistenceCorruptionError)
    }
  })

  it('stops for an aborted request, an unreachable database and a bad binding', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(
      directory().window({ size: 10, signal: abort.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    const dead = {
      connect: async () => {
        throw new Error('down')
      }
    } as unknown as PostgresPoolLike
    await expect(
      directory(tenantA, schema, dead).window({ size: 10 })
    ).rejects.toBeInstanceOf(SessionStorageUnavailableError)
    await expect(directory().window({ size: 0 })).rejects.toBeInstanceOf(
      SessionStorageUnavailableError
    )
    expect(() => directory(tenantA, 'Bad Schema')).toThrow(
      SessionStorageUnavailableError
    )
    expect(() => directory('')).toThrow(SessionStorageUnavailableError)
    const failing = {
      connect: async () => ({
        query: async (text: string) => {
          if (text.startsWith('BEGIN')) return { rows: [] }
          throw new Error('boom')
        },
        release: () => undefined
      })
    } as unknown as PostgresPoolLike
    await expect(
      directory(tenantA, `${schema}x`, failing).window({ size: 10 })
    ).rejects.toBeInstanceOf(SessionStorageUnavailableError)
  })
})
