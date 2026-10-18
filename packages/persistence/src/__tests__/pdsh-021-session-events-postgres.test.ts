// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Pool, Client } from 'pg'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import type { SessionEventAppend } from '@cvg/harness-contracts'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../session-events.ts'

const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PDSH021_PG_REQUIRED === '1')
  throw new Error('PDSH021 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pdsh021_${suffix}`
const role = `pdsh021_role_${suffix}`
const password = 'pdsh021-synthetic-only'
const tenant = 'tenant-synthetic-A'
const otherTenant = 'tenant-synthetic-B'
let admin: Client
let pool1: Pool
let pool2: Pool
const event = (
  sessionId: string,
  eventId = 'event1',
  text = 'synthetic'
): SessionEventAppend => ({
  tenantId: tenant,
  sessionId,
  formatVersion: 1,
  eventId,
  timestamp: '2026-10-12T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic',
  type: 'message/user',
  payload: { text }
})
const stream = (sessionId: string) =>
  ({ tenantId: tenant, sessionId, formatVersion: 1 }) as const

describe.skipIf(!url)(
  'PDSH-021 PostgreSQL append-only session authority',
  () => {
    beforeAll(async () => {
      admin = new Client({ connectionString: url })
      await admin.connect()
      await runSessionEventMigrations(admin, { schemaName: schema })
      await runSessionEventMigrations(admin, { schemaName: schema })
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
      )
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
      await admin.query(
        `GRANT SELECT, INSERT ON ${schema}.session_events TO ${role}`
      )
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_streams TO ${role}`
      )
      const roleUrl = new URL(url!)
      roleUrl.username = role
      roleUrl.password = password
      pool1 = new Pool({ connectionString: roleUrl.toString(), max: 2 })
      pool2 = new Pool({ connectionString: roleUrl.toString(), max: 2 })
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
    const store = (pool: Pool, tenantId = tenant) =>
      new PostgresSessionEventStore(pool, { tenantId, schemaName: schema })

    it('persists monotonic concurrent appends across pools, replay and fresh store', async () => {
      const one = store(pool1)
      const two = store(pool2)
      await Promise.all([
        one.openSession(stream('concurrent')),
        two.openSession(stream('concurrent'))
      ])
      const appended = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          (index % 2 ? one : two).append(event('concurrent', `event${index}`))
        )
      )
      expect(appended.map((e) => e.sequence).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ])
      const repeated = await Promise.all([
        one.append(event('concurrent', 'event0')),
        two.append(event('concurrent', 'event0'))
      ])
      expect(repeated[0]).toEqual(repeated[1])
      await expect(
        two.append(event('concurrent', 'event0', 'changed'))
      ).rejects.toMatchObject({ code: 'session_event_conflict' })
      const fresh = store(pool2)
      const all = await fresh.read({
        tenantId: tenant,
        sessionId: 'concurrent'
      })
      expect(all.map((e) => e.sequence)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ])
      expect(
        (
          await fresh.read({
            tenantId: tenant,
            sessionId: 'concurrent',
            afterSequence: 5,
            limit: 2
          })
        ).map((e) => e.sequence)
      ).toEqual([6, 7])
    })
    it('persists a stream after its writer pool closes and reconstructs it on a new pool', async () => {
      const roleUrl = new URL(url!)
      roleUrl.username = role
      roleUrl.password = password
      const writer = new Pool({ connectionString: roleUrl.toString() })
      let written
      try {
        const one = store(writer)
        await one.openSession(stream('restart'))
        written = await one.append(event('restart'))
      } finally {
        await writer.end()
      }
      const reader = new Pool({ connectionString: roleUrl.toString() })
      try {
        const fresh = store(reader)
        await fresh.openSession(stream('restart'))
        expect(
          await fresh.read({ tenantId: tenant, sessionId: 'restart' })
        ).toEqual([written])
        expect(await fresh.append(event('restart'))).toEqual(written)
      } finally {
        await reader.end()
      }
    })
    it('rejects installing the dedicated migration over a legacy session schema', async () => {
      const old = `${schema}_old`
      await admin.query(`CREATE SCHEMA ${old}`)
      await admin.query(`CREATE TABLE ${old}.sessions (id text)`)
      try {
        await expect(
          runSessionEventMigrations(admin, { schemaName: old })
        ).rejects.toThrow('dedicated schema')
        expect(
          (
            await admin.query('SELECT to_regclass($1) AS relation', [
              `${old}.session_events`
            ])
          ).rows[0]
        ).toEqual({ relation: null })
      } finally {
        await admin.query(`DROP SCHEMA ${old} CASCADE`)
      }
    })
    it('rolls back both event and cursor when cursor advancement fails', async () => {
      const one = store(pool1)
      await one.openSession(stream('rollback'))
      await admin.query(
        `CREATE FUNCTION ${schema}.reject_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.session_id='rollback' THEN RAISE EXCEPTION 'synthetic cursor failure'; END IF; RETURN NEW; END $$`
      )
      await admin.query(
        `CREATE TRIGGER reject_cursor BEFORE UPDATE ON ${schema}.session_streams FOR EACH ROW EXECUTE FUNCTION ${schema}.reject_cursor()`
      )
      try {
        await expect(one.append(event('rollback'))).rejects.toMatchObject({
          code: 'session_storage_unavailable'
        })
      } finally {
        await admin.query(
          `DROP TRIGGER reject_cursor ON ${schema}.session_streams`
        )
      }
      expect(
        await one.read({ tenantId: tenant, sessionId: 'rollback' })
      ).toEqual([])
      expect((await one.append(event('rollback'))).sequence).toBe(1)
    })
    it('accepts bounded canonical payloads even when JSONB text adds formatting bytes', async () => {
      const one = store(pool1)
      await one.openSession(stream('bytes'))
      const payload = Object.fromEntries(
        Array.from({ length: 17000 }, (_, index) => [
          `k${index}`,
          'x'.repeat(49)
        ])
      )
      const input: SessionEventAppend = {
        ...event('bytes'),
        type: 'tool/call',
        payload: {
          correlationId: 'corr-synthetic',
          toolId: 'synthetic',
          operationKey: 'bytes',
          input: payload
        }
      }
      const appended = await one.append(input)
      expect(Buffer.byteLength(JSON.stringify(appended))).toBeLessThan(1048576)
      expect(
        (
          await admin.query(
            `SELECT octet_length(record::text) AS size FROM ${schema}.session_events WHERE session_id='bytes'`
          )
        ).rows[0].size
      ).toBeGreaterThan(1048576)
      expect(
        (await one.read({ tenantId: tenant, sessionId: 'bytes' }))[0]
      ).toEqual(appended)
    })
    it('uses non-BYPASSRLS serving and denies cross-tenant or missing-context DML', async () => {
      const one = store(pool1)
      const two = store(pool2, otherTenant)
      await one.openSession(stream('isolation'))
      await one.append(event('isolation'))
      await two.openSession({
        tenantId: otherTenant,
        sessionId: 'isolation',
        formatVersion: 1
      })
      expect(
        await two.read({ tenantId: otherTenant, sessionId: 'isolation' })
      ).toEqual([])
      await expect(
        one.read({ tenantId: otherTenant, sessionId: 'isolation' })
      ).rejects.toThrow()
      const client = await pool1.connect()
      try {
        const result = await client.query(
          'SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user'
        )
        expect(result.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
        expect(
          (await client.query(`SELECT * FROM ${schema}.session_events`)).rows
        ).toEqual([])
        await expect(
          client.query(
            `INSERT INTO ${schema}.session_streams(tenant_id,session_id,format_version) VALUES($1,'forbidden',1)`,
            [tenant]
          )
        ).rejects.toThrow(/row-level security/)
        await client.query("SELECT set_config('cvg.tenant_id',$1,false)", [
          otherTenant
        ])
        expect(
          (
            await client.query(
              `SELECT * FROM ${schema}.session_events WHERE tenant_id=$1`,
              [tenant]
            )
          ).rows
        ).toEqual([])
        await expect(
          client.query(
            `INSERT INTO ${schema}.session_streams(tenant_id,session_id,format_version) VALUES($1,'forbidden',1)`,
            [tenant]
          )
        ).rejects.toThrow(/row-level security/)
      } finally {
        await client.query("SELECT set_config('cvg.tenant_id','',false)")
        client.release()
      }
    })
    it('refuses UPDATE/DELETE/TRUNCATE by serving privileges and triggers even for owner', async () => {
      for (const verb of [
        `UPDATE ${schema}.session_events SET input_digest=input_digest`,
        `DELETE FROM ${schema}.session_events`,
        `TRUNCATE ${schema}.session_events`
      ]) {
        await expect(pool1.query(verb)).rejects.toThrow(/permission denied/)
        await expect(admin.query(verb)).rejects.toThrow(/append-only/)
      }
    })
    it('fails read on unknown stored fingerprint and preserves immutable history', async () => {
      const one = store(pool1)
      await one.openSession(stream('unknown'))
      const good = await one.append(event('unknown'))
      const corrupt = {
        ...good,
        eventId: 'corrupt',
        sequence: 2,
        schemaFingerprint: 'b'.repeat(64)
      }
      // Migration authority can insert unknown content; reader must not bless it.
      await admin.query(
        `INSERT INTO ${schema}.session_events(tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record) VALUES($1,$2,2,'corrupt',1,$3,$4,$5,$6::jsonb)`,
        [
          tenant,
          'unknown',
          good.type,
          corrupt.schemaFingerprint,
          'c'.repeat(64),
          JSON.stringify(corrupt)
        ]
      )
      await expect(
        one.read({ tenantId: tenant, sessionId: 'unknown' })
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      expect(
        (
          await one.read({ tenantId: tenant, sessionId: 'unknown', limit: 1 })
        )[0]
      ).toEqual(good)
    })
    it('transaction-local tenant context does not leak to the next pool borrower', async () => {
      const one = store(pool1)
      await one.openSession(stream('reset'))
      await one.append(event('reset'))
      await expect(
        one.append(event('reset', 'event1', 'divergent'))
      ).rejects.toThrow()
      const clients = await Promise.all([pool1.connect(), pool1.connect()])
      try {
        for (const client of clients)
          expect(
            (
              await client.query(
                "SELECT NULLIF(current_setting('cvg.tenant_id',true),'') AS tenant"
              )
            ).rows[0]
          ).toEqual({ tenant: null })
      } finally {
        for (const client of clients) client.release()
      }
    })
  }
)
