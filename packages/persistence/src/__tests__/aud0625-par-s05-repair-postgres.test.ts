// @vitest-environment node
// Source of the oracles: docs/04_audit/evidence/AUD0625-REVIEW-0295-S1-CODEX-20261031 (slice2).
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { SessionMigrationRequiredError } from '@cvg/harness'
import {
  runSessionQueryMigrations,
  runSessionEventMigrations
} from '../session-events.ts'
import {
  PostgresSessionDirectory,
  SESSION_QUERY_INDEX
} from '../session-query-postgres.ts'
import type { PostgresPoolLike } from '../tenant-scoped-postgres.ts'
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S05_PG_REQUIRED === '1')
  throw new Error('PAR-S05 requires its own disposable TEST_DATABASE_URL')
const tag = randomBytes(5).toString('hex')
const schema = `review_s05_${tag}`
const spoof = `review_spoof_${tag}`
const dropped = `review_drop_${tag}`
const db2 = `review_db2_${tag}`
const role = `review_s05_role_${tag}`
const tenant = 'synthetic-tenant'
let admin: Client, other: Client, pool: Pool, pool2: Pool
const dir = (p: PostgresPoolLike = pool, s = schema, t = tenant) =>
  new PostgresSessionDirectory(p, { tenantId: t, schemaName: s })
async function grant(a: Client, s: string) {
  await a.query(`GRANT USAGE ON SCHEMA ${s} TO ${role}`)
  await a.query(`GRANT SELECT ON ${s}.session_streams TO ${role}`)
}
async function insert(a: Client, s: string, id: string, text?: string) {
  await a.query(
    `INSERT INTO ${s}.session_streams (tenant_id, session_id, format_version, header_json, inherited_event_count) VALUES ($1,$2,1,$3,0)`,
    [
      tenant,
      id,
      text ?? JSON.stringify({ version: 1, id, createdAt: 1, isSeeded: false })
    ]
  )
}
describe.skipIf(!url)(
  'PAR-S05 repair of the Codex review F02/F05/F06 over PostgreSQL',
  () => {
    beforeAll(async () => {
      admin = new Client({ connectionString: url })
      await admin.connect()
      await admin.query(`CREATE DATABASE ${db2}`)
      const u2 = new URL(url!)
      u2.pathname = '/' + db2
      other = new Client({ connectionString: u2.toString() })
      await other.connect()
      await runSessionQueryMigrations(admin, { schemaName: schema })
      await runSessionEventMigrations(other, { schemaName: schema })
      await runSessionEventMigrations(admin, { schemaName: spoof })
      await runSessionQueryMigrations(admin, { schemaName: dropped })
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD 'synthetic-only'`
      )
      for (const s of [schema, spoof, dropped]) await grant(admin, s)
      await grant(other, schema)
      const u = new URL(url!)
      u.username = role
      u.password = 'synthetic-only'
      pool = new Pool({ connectionString: u.toString(), max: 3 })
      u.pathname = '/' + db2
      pool2 = new Pool({ connectionString: u.toString(), max: 3 })
      await insert(admin, schema, 'indexed-db')
      await insert(other, schema, 'unmigrated-db')
      await insert(admin, spoof, 'spoofed-index')
      await insert(admin, dropped, 'dropped-index')
    }, 60000)
    afterAll(async () => {
      await pool?.end()
      await pool2?.end()
      if (admin) {
        for (const s of [schema, spoof, dropped])
          await admin.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
        await other?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await other?.query(`DROP OWNED BY ${role}`)
        await other?.end()
        await admin.query(`DROP DATABASE IF EXISTS ${db2}`)
        await admin.query(`DROP OWNED BY ${role}`)
        await admin.query(`DROP ROLE IF EXISTS ${role}`)
        await admin.end()
      }
    }, 60000)
    it('S2-F05: index admission is bound to the database, not just a schema name', async () => {
      expect((await dir().window({ size: 10 }))[0]?.summary?.sessionId).toBe(
        'indexed-db'
      )
      const result = await dir(pool2)
        .window({ size: 10 })
        .then(
          (rows) => ({
            accepted: true,
            ids: rows.map((r) => r.summary?.sessionId)
          }),
          (error) => ({ accepted: false, error })
        )
      expect(result).toMatchObject({
        accepted: false,
        error: expect.any(SessionMigrationRequiredError)
      })
    })
    it('S2-F06: the expected index name on the wrong key is not migration 0038', async () => {
      await admin.query(
        `CREATE INDEX ${SESSION_QUERY_INDEX} ON ${spoof}.session_streams (session_id)`
      )
      const result = await dir(pool, spoof)
        .window({ size: 10 })
        .then(
          (rows) => ({
            accepted: true,
            ids: rows.map((r) => r.summary?.sessionId)
          }),
          (error) => ({ accepted: false, error })
        )
      expect(result).toMatchObject({
        accepted: false,
        error: expect.any(SessionMigrationRequiredError)
      })
    })
    it('S2-F05: successful admission does not survive removal of its index', async () => {
      const d = dir(pool, dropped)
      expect(await d.window({ size: 10 })).toHaveLength(1)
      await admin.query(`DROP INDEX ${dropped}.${SESSION_QUERY_INDEX}`)
      try {
        const result = await d.window({ size: 10 }).then(
          (rows) => ({ accepted: true, rows: rows.length }),
          (error) => ({ accepted: false, error })
        )
        expect(result).toMatchObject({
          accepted: false,
          error: expect.any(SessionMigrationRequiredError)
        })
      } finally {
        await admin.query(
          `CREATE INDEX ${SESSION_QUERY_INDEX} ON ${dropped}.session_streams (tenant_id,((writer_lock_id::bigint)))`
        )
      }
    })
    it('S1-F02 extension: abort while waiting for a real lease prevents reading', async () => {
      const abort = new AbortController()
      const sql: string[] = []
      const wrapped = {
        connect: async () => {
          const client = await pool.connect()
          abort.abort()
          return {
            query: async (text: string, values?: unknown[]) => {
              sql.push(text)
              return client.query(text, values)
            },
            release: (error?: Error) => client.release(error)
          }
        }
      } as unknown as PostgresPoolLike
      const result = await dir(wrapped)
        .window({ size: 10, signal: abort.signal })
        .then(
          (rows) => ({ accepted: true, rows: rows.length }),
          (error) => ({ accepted: false, error })
        )
      expect(result).toMatchObject({
        accepted: false,
        error: expect.objectContaining({ name: 'AbortError' })
      })
      expect(sql).toEqual([])
    })

    it.each(['indisvalid', 'indisready'])(
      'S2-F06: an index that %s is false is not usable and is refused',
      async (column) => {
        const name = `review_${column}_${tag}`
        await runSessionQueryMigrations(admin, { schemaName: name })
        try {
          await grant(admin, name)
          await insert(admin, name, 'unusable-index')
          expect(await dir(pool, name).window({ size: 10 })).toHaveLength(1)
          await admin.query(
            `UPDATE pg_index SET ${column} = false WHERE indexrelid = '${name}.${SESSION_QUERY_INDEX}'::regclass`
          )
          await expect(
            dir(pool, name).window({ size: 10 })
          ).rejects.toBeInstanceOf(SessionMigrationRequiredError)
        } finally {
          await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`)
        }
      }
    )

    it('S1-F02 extension: abort during the read stops before COMMIT and never returns the row', async () => {
      const abort = new AbortController()
      const sql: string[] = []
      const wrapped = {
        connect: async () => {
          const client = await pool.connect()
          return {
            query: async (text: string, values?: unknown[]) => {
              sql.push(text)
              const result = await client.query(text, values)
              if (text.startsWith('SELECT writer_lock_id')) abort.abort()
              return result
            },
            release: (error?: Error) => client.release(error)
          }
        }
      } as unknown as PostgresPoolLike
      await expect(
        dir(wrapped).window({ size: 10, signal: abort.signal })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(sql).not.toContain('COMMIT')
      expect(sql.at(-1)).toBe('ROLLBACK')
    })
  }
)
