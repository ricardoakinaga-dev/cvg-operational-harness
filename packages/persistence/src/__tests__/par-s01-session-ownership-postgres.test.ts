// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEventAppend } from '@cvg/harness-contracts'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../session-events.ts'

// PAR-S01 slice 2: migration 0034 (SPEC 0221 §5/§6, recomposition f64a1b89, note 0221b).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars01_${suffix}`
const schemaB = `pars01b_${suffix}`
const role = `pars01_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenantA = 'tenant-synthetic-A'
const tenantB = 'tenant-synthetic-B'
const FAR = 2_147_483_648

let admin: Client
let serving: Pool
const q = (name: string) => `${schema}.${name}`
const ev = (
  sessionId: string,
  eventId = 'e1',
  tenantId = tenantA
): SessionEventAppend => ({
  tenantId,
  sessionId,
  formatVersion: 1,
  eventId,
  timestamp: '2026-10-29T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic',
  type: 'message/user',
  payload: { text: 'synthetic' }
})
const legacy = (tenantId = tenantA) =>
  new PostgresSessionEventStore(serving, { tenantId, schemaName: schema })
async function lockKey(
  sessionId: string,
  tenantId = tenantA,
  s = schema
): Promise<[number, number]> {
  const r = await admin.query<{ oid: string; id: number }>(
    `SELECT '${s}.session_streams'::regclass::oid::text AS oid,
            (SELECT writer_lock_id FROM ${s}.session_streams WHERE tenant_id=$1 AND session_id=$2) AS id`,
    [tenantId, sessionId]
  )
  return [Number(r.rows[0]!.oid) - FAR, r.rows[0]!.id]
}
async function ownerConnection(): Promise<Client> {
  const c = new Client({ connectionString: serving.options.connectionString })
  await c.connect()
  return c
}
async function tx(
  client: Client,
  tenantId: string,
  statements: ReadonlyArray<readonly [string, unknown[]?]>
): Promise<void> {
  await client.query('BEGIN')
  try {
    await client.query("SELECT set_config('cvg.tenant_id',$1,true)", [tenantId])
    for (const [sql, params] of statements) await client.query(sql, params)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
const count = async (sessionId: string): Promise<number> =>
  Number(
    (
      await admin.query(
        `SELECT count(*) FROM ${q('session_events')} WHERE session_id=$1`,
        [sessionId]
      )
    ).rows[0].count
  )
const cursor = async (sessionId: string): Promise<number> =>
  Number(
    (
      await admin.query(
        `SELECT next_sequence FROM ${q('session_streams')} WHERE session_id=$1`,
        [sessionId]
      )
    ).rows[0].next_sequence
  )
const insertEvent = (sessionId: string, sequence: number, id: string) =>
  [
    `INSERT INTO ${q('session_events')} (tenant_id,session_id,sequence,event_id,format_version,event_type,schema_fingerprint,input_digest,record)
     VALUES ($1,$2,$3,$4,1,'message/user',$5,$6,$7::jsonb)`,
    [
      tenantA,
      sessionId,
      sequence,
      id,
      'a'.repeat(64),
      'b'.repeat(64),
      JSON.stringify({
        tenantId: tenantA,
        sessionId,
        eventId: id,
        type: 'message/user',
        schemaFingerprint: 'a'.repeat(64),
        sequence,
        formatVersion: 1
      })
    ]
  ] as [string, unknown[]]
const advance = (sessionId: string, to: number) =>
  [
    `UPDATE ${q('session_streams')} SET next_sequence=$3 WHERE tenant_id=$1 AND session_id=$2`,
    [tenantA, sessionId, to]
  ] as [string, unknown[]]

describe.skipIf(!url)(
  'PAR-S01 slice 2: session writer ownership in PostgreSQL',
  () => {
    beforeAll(async () => {
      admin = new Client({ connectionString: url })
      await admin.connect()
      // A historical stream written before 0034 must be adopted, not rewritten.
      await admin.query(`CREATE SCHEMA ${schema}`)
      await admin.query(`SET search_path TO ${schema}`)
      const { runPostgresMigrations } =
        await import('../postgres-migrations.ts')
      await runPostgresMigrations(admin, {
        schemaName: schema,
        migrations: ['0028_session_events']
      })
      await admin.query(
        `INSERT INTO ${q('session_streams')} (tenant_id,session_id,format_version) VALUES ('${tenantA}','historic',1)`
      )
      await runSessionEventMigrations(admin, { schemaName: schema })
      await runSessionEventMigrations(admin, { schemaName: schema })
      await runSessionEventMigrations(admin, { schemaName: schemaB })
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
      )
      for (const s of [schema, schemaB]) {
        await admin.query(`GRANT USAGE ON SCHEMA ${s} TO ${role}`)
        await admin.query(
          `GRANT SELECT, INSERT ON ${s}.session_events TO ${role}`
        )
        await admin.query(
          `GRANT SELECT, INSERT ON ${s}.session_streams TO ${role}`
        )
        await admin.query(
          `GRANT UPDATE (next_sequence) ON ${s}.session_streams TO ${role}`
        )
      }
      const roleUrl = new URL(url!)
      roleUrl.username = role
      roleUrl.password = password
      serving = new Pool({ connectionString: roleUrl.toString(), max: 6 })
    })
    afterAll(async () => {
      await serving?.end()
      for (const s of [schema, schemaB])
        await admin?.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
      await admin?.query(`DROP ROLE IF EXISTS ${role}`)
      await admin?.end()
    })

    it('adds the columns additively: the historic stream keeps its facts and has no header', async () => {
      const r = await admin.query(
        `SELECT writer_lock_id, header_json, inherited_event_count, next_sequence FROM ${q('session_streams')} WHERE session_id='historic'`
      )
      expect(r.rows[0].writer_lock_id).toBeGreaterThan(0)
      expect(r.rows[0].header_json).toBeNull()
      expect(r.rows[0].inherited_event_count).toBeNull()
      expect(Number(r.rows[0].next_sequence)).toBe(1)
      const m = await admin.query(
        `SELECT count(*) FROM ${q('schema_migrations')} WHERE version IN ('0028_session_events','0034_session_writer_ownership')`
      )
      expect(Number(m.rows[0].count)).toBe(2)
    })

    it('refuses to run without 0028 in the same schema', async () => {
      const lone = `pars01c_${suffix}`
      const { runPostgresMigrations } =
        await import('../postgres-migrations.ts')
      await expect(
        runPostgresMigrations(admin, {
          schemaName: lone,
          migrations: ['0034_session_writer_ownership']
        })
      ).rejects.toThrow(/requires 0028/)
      await admin.query(`DROP SCHEMA IF EXISTS ${lone} CASCADE`)
      await admin.query(`SET search_path TO ${schema}`)
    })

    it('keeps the unmodified legacy store working and gives new streams an honest header', async () => {
      const store = legacy()
      const before = Date.now()
      await store.openSession({
        tenantId: tenantA,
        sessionId: 'leg1',
        formatVersion: 1
      })
      const a = await store.append(ev('leg1', 'e1'))
      const b = await store.append(ev('leg1', 'e2'))
      expect([a.sequence, b.sequence]).toEqual([1, 2])
      expect(await store.append(ev('leg1', 'e2'))).toEqual(b)
      const r = await admin.query(
        `SELECT writer_lock_id, header_json, inherited_event_count FROM ${q('session_streams')} WHERE session_id='leg1'`
      )
      const header = JSON.parse(r.rows[0].header_json)
      expect(header).toMatchObject({ version: 1, id: 'leg1', isSeeded: false })
      expect(header.createdAt).toBeGreaterThanOrEqual(before - 1000)
      expect(Number(r.rows[0].inherited_event_count)).toBe(0)
      expect(r.rows[0].writer_lock_id).toBeGreaterThan(0)
    })

    it('does not overwrite existing metadata when the legacy open conflicts', async () => {
      const store = legacy()
      await store.openSession({
        tenantId: tenantA,
        sessionId: 'leg2',
        formatVersion: 1
      })
      const first = await admin.query(
        `SELECT header_json FROM ${q('session_streams')} WHERE session_id='leg2'`
      )
      await new Promise((r) => setTimeout(r, 15))
      await store.openSession({
        tenantId: tenantA,
        sessionId: 'leg2',
        formatVersion: 1
      })
      const second = await admin.query(
        `SELECT header_json FROM ${q('session_streams')} WHERE session_id='leg2'`
      )
      expect(second.rows[0].header_json).toBe(first.rows[0].header_json)
    })

    it('assigns distinct positive lock ids, also across tenants with the same session id', async () => {
      const a = legacy(tenantA)
      const b = legacy(tenantB)
      await a.openSession({
        tenantId: tenantA,
        sessionId: 'same',
        formatVersion: 1
      })
      await b.openSession({
        tenantId: tenantB,
        sessionId: 'same',
        formatVersion: 1
      })
      const r = await admin.query(
        `SELECT writer_lock_id FROM ${q('session_streams')} WHERE session_id='same' ORDER BY tenant_id`
      )
      expect(new Set(r.rows.map((x) => x.writer_lock_id)).size).toBe(2)
      const [keyA] = await lockKey('same', tenantA)
      const [keyB] = await lockKey('same', tenantA, schemaB).catch(() => [0])
      void keyB
      // Different schema => different relation oid => different first key part.
      const other = await admin.query(
        `SELECT '${schemaB}.session_streams'::regclass::oid::text AS oid`
      )
      expect(Number(other.rows[0].oid) - FAR).not.toBe(keyA)
    })

    describe('writer lock key and guards', () => {
      it('the key is (oid(session_streams) - 2^31, writer_lock_id): the guard honours exactly that advisory lock', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'key1',
          formatVersion: 1
        })
        const [k1, k2] = await lockKey('key1')
        const owner = await ownerConnection()
        try {
          expect(
            (
              await owner.query('SELECT pg_try_advisory_lock($1,$2) AS ok', [
                k1,
                k2
              ])
            ).rows[0].ok
          ).toBe(true)
          // A different pair does not block the legacy writer.
          await expect(legacy().append(ev('key1', 'e1'))).rejects.toMatchObject(
            {
              code: 'session_storage_unavailable'
            }
          )
          expect(await count('key1')).toBe(0)
          expect(await cursor('key1')).toBe(1)
          await owner.query('SELECT pg_advisory_unlock($1,$2)', [k1, k2])
          const ok = await legacy().append(ev('key1', 'e1'))
          expect(ok.sequence).toBe(1)
          // A lock on a neighbouring key never refuses the writer.
          await owner.query('SELECT pg_advisory_lock($1,$2)', [k1 + 1, k2])
          await owner.query('SELECT pg_advisory_lock($1,$2)', [k1, k2 + 1])
          expect((await legacy().append(ev('key1', 'e2'))).sequence).toBe(2)
        } finally {
          await owner.query('SELECT pg_advisory_unlock_all()')
          await owner.end()
        }
      })

      it('the owner connection writes under its own session lock (re-entrant) and readers are never blocked', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'own1',
          formatVersion: 1
        })
        const [k1, k2] = await lockKey('own1')
        const owner = await ownerConnection()
        try {
          await owner.query('SELECT pg_advisory_lock($1,$2)', [k1, k2])
          await tx(owner, tenantA, [
            insertEvent('own1', 1, 'o1'),
            advance('own1', 2)
          ])
          expect(await count('own1')).toBe(1)
          const reader = await serving.connect()
          try {
            await reader.query('BEGIN')
            await reader.query("SELECT set_config('cvg.tenant_id',$1,true)", [
              tenantA
            ])
            const seen = await reader.query(
              `SELECT count(*) FROM ${q('session_events')} WHERE session_id='own1'`
            )
            expect(seen.rows[0].count).toBe('1')
            await reader.query('ROLLBACK')
          } finally {
            reader.release()
          }
        } finally {
          await owner.query('SELECT pg_advisory_unlock_all()')
          await owner.end()
        }
      })

      it('a stream UPDATE (flush) by another connection is refused while an owner exists, and allowed otherwise', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'fl1',
          formatVersion: 1
        })
        const [k1, k2] = await lockKey('fl1')
        const owner = await ownerConnection()
        const other = await serving.connect()
        try {
          await owner.query('SELECT pg_advisory_lock($1,$2)', [k1, k2])
          await other.query('BEGIN')
          await other.query("SELECT set_config('cvg.tenant_id',$1,true)", [
            tenantA
          ])
          await expect(other.query(...advance('fl1', 1))).rejects.toMatchObject(
            { code: '55P03' }
          )
          await other.query('ROLLBACK')
          await owner.query('SELECT pg_advisory_unlock($1,$2)', [k1, k2])
          await tx(other as unknown as Client, tenantA, [advance('fl1', 1)])
        } finally {
          await owner.query('SELECT pg_advisory_unlock_all()')
          await owner.end()
          other.release()
        }
      })

      it('row-lock-before-advisory interleaving ends in a clean refusal, never a deadlock', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'il1',
          formatVersion: 1
        })
        const [k1, k2] = await lockKey('il1')
        const oldWriter = await serving.connect()
        const owner = await ownerConnection()
        try {
          // Old writer takes the row lock first, as the legacy append does.
          await oldWriter.query('BEGIN')
          await oldWriter.query("SELECT set_config('cvg.tenant_id',$1,true)", [
            tenantA
          ])
          await oldWriter.query(
            `SELECT next_sequence FROM ${q('session_streams')} WHERE tenant_id=$1 AND session_id='il1' FOR UPDATE`,
            [tenantA]
          )
          // New owner takes the advisory session lock, then waits for the row.
          await owner.query('SELECT pg_advisory_lock($1,$2)', [k1, k2])
          await owner.query('BEGIN')
          await owner.query("SELECT set_config('cvg.tenant_id',$1,true)", [
            tenantA
          ])
          const waiting = owner.query(
            `SELECT next_sequence FROM ${q('session_streams')} WHERE tenant_id=$1 AND session_id='il1' FOR UPDATE`,
            [tenantA]
          )
          await new Promise((r) => setTimeout(r, 300))
          // The old trigger tries the advisory lock without waiting: it fails and rolls back.
          await expect(
            oldWriter.query(...insertEvent('il1', 1, 'old1'))
          ).rejects.toMatchObject({
            code: '55P03'
          })
          await oldWriter.query('ROLLBACK')
          await waiting
          await owner.query('ROLLBACK')
          expect(await count('il1')).toBe(0)
          expect(await cursor('il1')).toBe(1)
        } finally {
          await owner.query('SELECT pg_advisory_unlock_all()')
          await owner.end()
          oldWriter.release()
        }
      })

      it('the lock is released when the owning connection ends', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'gone1',
          formatVersion: 1
        })
        const [k1, k2] = await lockKey('gone1')
        const owner = await ownerConnection()
        await owner.query('SELECT pg_advisory_lock($1,$2)', [k1, k2])
        await expect(legacy().append(ev('gone1', 'e1'))).rejects.toBeDefined()
        await owner.end()
        for (let i = 0; i < 20; i++) {
          try {
            expect((await legacy().append(ev('gone1', 'e1'))).sequence).toBe(1)
            return
          } catch {
            await new Promise((r) => setTimeout(r, 100))
          }
        }
        throw new Error('lock was not released')
      })
    })

    describe('cursor coherence', () => {
      it('refuses a direct INSERT that does not advance the cursor, at COMMIT', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'cur1',
          formatVersion: 1
        })
        await expect(
          tx(await ownerConnection(), tenantA, [insertEvent('cur1', 1, 'x1')])
        ).rejects.toMatchObject({
          code: '23514'
        })
        expect(await count('cur1')).toBe(0)
      })
      it('refuses a skipped, regressed or lagging cursor, and a wrong sequence', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'cur2',
          formatVersion: 1
        })
        await legacy().append(ev('cur2', 'e1'))
        const c = await ownerConnection()
        try {
          await expect(
            tx(c, tenantA, [advance('cur2', 5)])
          ).rejects.toMatchObject({ code: '23514' })
          await expect(
            tx(c, tenantA, [advance('cur2', 1)])
          ).rejects.toMatchObject({ code: '23514' })
          await expect(
            tx(c, tenantA, [insertEvent('cur2', 3, 'gap'), advance('cur2', 4)])
          ).rejects.toMatchObject({ code: '23514' })
          await expect(
            tx(c, tenantA, [
              insertEvent('cur2', 2, 'b1'),
              insertEvent('cur2', 3, 'b2'),
              advance('cur2', 4)
            ])
          ).rejects.toMatchObject({ code: '23514' })
          // The flush barrier (same value) and a valid unit advance are admitted.
          await tx(c, tenantA, [advance('cur2', 2)])
          await tx(c, tenantA, [
            insertEvent('cur2', 2, 'ok1'),
            advance('cur2', 3)
          ])
          expect(await count('cur2')).toBe(2)
          expect(await cursor('cur2')).toBe(3)
        } finally {
          await c.end()
        }
      })
      it('SET CONSTRAINTS cannot push the check past COMMIT', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'cur3',
          formatVersion: 1
        })
        const c = await ownerConnection()
        try {
          await expect(
            tx(c, tenantA, [
              ['SET CONSTRAINTS ALL DEFERRED'],
              insertEvent('cur3', 1, 'y1')
            ])
          ).rejects.toMatchObject({ code: '23514' })
          expect(await count('cur3')).toBe(0)
        } finally {
          await c.end()
        }
      })
      it('a role without ownership cannot disable the guards', async () => {
        await expect(
          serving.query(
            `ALTER TABLE ${q('session_events')} DISABLE TRIGGER ALL`
          )
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          serving.query(`SET session_replication_role = replica`)
        ).rejects.toMatchObject({ code: '42501' })
      })
    })

    describe('immutability and adoption', () => {
      it('never removes streams and never changes the lock id', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'imm1',
          formatVersion: 1
        })
        await expect(
          admin.query(`DELETE FROM ${q('session_streams')}`)
        ).rejects.toThrow(/never removed/)
        await expect(
          admin.query(`TRUNCATE ${q('session_streams')} CASCADE`)
        ).rejects.toThrow(/never removed|cannot truncate/)
        await expect(
          admin.query(
            `UPDATE ${q('session_streams')} SET writer_lock_id=1000000 WHERE session_id='imm1'`
          )
        ).rejects.toThrow(/only be updated to DEFAULT/)
        await expect(
          admin.query(
            `UPDATE ${q('session_streams')} SET writer_lock_id=DEFAULT WHERE session_id='imm1'`
          )
        ).rejects.toThrow(/immutable/)
      })
      it('freezes header and cut once set', async () => {
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'imm2',
          formatVersion: 1
        })
        await expect(
          admin.query(
            `UPDATE ${q('session_streams')} SET header_json='{}' WHERE session_id='imm2'`
          )
        ).rejects.toThrow(/immutable/)
        await expect(
          admin.query(
            `UPDATE ${q('session_streams')} SET inherited_event_count=5 WHERE session_id='imm2'`
          )
        ).rejects.toThrow(/immutable/)
      })
      it('adoption NULL -> metadata is for the migration authority only and needs both columns', async () => {
        const h = JSON.stringify({
          version: 1,
          id: 'historic',
          createdAt: 1,
          isSeeded: false
        })
        // The serving role has no UPDATE on the columns; even with one the trigger refuses.
        await expect(
          serving.query(
            `UPDATE ${q('session_streams')} SET header_json=$1, inherited_event_count=0 WHERE session_id='historic'`,
            [h]
          )
        ).rejects.toMatchObject({ code: '42501' })
        await admin.query(
          `GRANT UPDATE (header_json, inherited_event_count) ON ${q('session_streams')} TO ${role}`
        )
        try {
          const c = await serving.connect()
          try {
            await c.query('BEGIN')
            await c.query("SELECT set_config('cvg.tenant_id',$1,true)", [
              tenantA
            ])
            await expect(
              c.query(
                `UPDATE ${q('session_streams')} SET header_json=$1, inherited_event_count=0 WHERE session_id='historic'`,
                [h]
              )
            ).rejects.toThrow(/migration authority/)
            await c.query('ROLLBACK')
          } finally {
            c.release()
          }
        } finally {
          await admin.query(
            `REVOKE UPDATE (header_json, inherited_event_count) ON ${q('session_streams')} FROM ${role}`
          )
        }
        await expect(
          admin.query(
            `UPDATE ${q('session_streams')} SET header_json=$1 WHERE session_id='historic'`,
            [h]
          )
        ).rejects.toMatchObject({ code: '23514' })
        await tx(admin, tenantA, [
          [
            `UPDATE ${q('session_streams')} SET header_json=$1, inherited_event_count=0 WHERE session_id='historic'`,
            [h]
          ]
        ])
        expect(
          (
            await admin.query(
              `SELECT header_json FROM ${q('session_streams')} WHERE session_id='historic'`
            )
          ).rows[0].header_json
        ).toBe(h)
      })
      it('the header is stored as text: an escaped NUL survives byte for byte', async () => {
        const raw =
          '{"version":1,"id":"nul","createdAt":1,"isSeeded":false,"note":"a\\u0000b"}'
        await tx(admin, tenantA, [
          [
            `INSERT INTO ${q('session_streams')} (tenant_id,session_id,format_version,header_json,inherited_event_count) VALUES ($1,'nul',1,$2,0)`,
            [tenantA, raw]
          ]
        ])
        expect(
          (
            await admin.query(
              `SELECT header_json FROM ${q('session_streams')} WHERE session_id='nul'`
            )
          ).rows[0].header_json
        ).toBe(raw)
      })
      it('requires header and cut together, and bounds them', async () => {
        await expect(
          admin.query(
            `INSERT INTO ${q('session_streams')} (tenant_id,session_id,format_version,header_json) VALUES ($1,'half',1,'{}')`,
            [tenantA]
          )
        ).rejects.toMatchObject({ code: '23514' })
        await expect(
          admin.query(
            `INSERT INTO ${q('session_streams')} (tenant_id,session_id,format_version,header_json,inherited_event_count) VALUES ($1,'big',1,$2,0)`,
            [tenantA, 'x'.repeat(65537)]
          )
        ).rejects.toMatchObject({ code: '23514' })
        await expect(
          admin.query(
            `INSERT INTO ${q('session_streams')} (tenant_id,session_id,format_version,header_json,inherited_event_count) VALUES ($1,'neg',1,'{}',-1)`,
            [tenantA]
          )
        ).rejects.toMatchObject({ code: '23514' })
      })
    })

    describe('privileges and exhaustion', () => {
      it('the serving role needs no sequence privilege, and cannot touch headers or DDL', async () => {
        const store = legacy()
        await store.openSession({
          tenantId: tenantA,
          sessionId: 'priv1',
          formatVersion: 1
        })
        await store.append(ev('priv1', 'e1'))
        await expect(
          serving.query(`UPDATE ${q('session_streams')} SET header_json='x'`)
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          serving.query(`CREATE TABLE ${schema}.evil (a int)`)
        ).rejects.toMatchObject({ code: '42501' })
        await expect(
          serving.query(`DELETE FROM ${q('session_streams')}`)
        ).rejects.toMatchObject({ code: '42501' })
      })
      it('tenant isolation still holds: another tenant sees no stream or header', async () => {
        const c = await serving.connect()
        try {
          await c.query('BEGIN')
          await c.query("SELECT set_config('cvg.tenant_id',$1,true)", [tenantB])
          const r = await c.query(
            `SELECT header_json FROM ${q('session_streams')} WHERE session_id='priv1'`
          )
          expect(r.rows).toEqual([])
          await c.query('ROLLBACK')
        } finally {
          c.release()
        }
      })
      it('the identity never cycles: exhaustion fails closed instead of reusing an id', async () => {
        const seq = (
          await admin.query(
            `SELECT pg_get_serial_sequence('${q('session_streams')}','writer_lock_id') AS s`
          )
        ).rows[0].s
        await admin.query(`ALTER SEQUENCE ${seq} RESTART WITH 2147483647`)
        await legacy().openSession({
          tenantId: tenantA,
          sessionId: 'last',
          formatVersion: 1
        })
        expect(
          (
            await admin.query(
              `SELECT writer_lock_id FROM ${q('session_streams')} WHERE session_id='last'`
            )
          ).rows[0].writer_lock_id
        ).toBe(2147483647)
        await expect(
          legacy().openSession({
            tenantId: tenantA,
            sessionId: 'beyond',
            formatVersion: 1
          })
        ).rejects.toBeDefined()
        expect(
          (
            await admin.query(
              `SELECT count(*) FROM ${q('session_streams')} WHERE session_id='beyond'`
            )
          ).rows[0].count
        ).toBe('0')
      })
    })
  }
)
