// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEventAppend } from '@cvg/harness-contracts'
import {
  materializeSessionEvent,
  SessionMigrationRequiredError,
  SessionPersistenceError
} from '@cvg/harness'
import { runPostgresMigrations } from '../postgres-migrations.ts'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../session-events.ts'
import {
  SESSION_ADOPTION_MAX_BATCH,
  SessionAdoptionError,
  adoptSessionStreams,
  countUnadoptedSessionStreams,
  verifySessionAdoption,
  type SessionAdoptionEntry
} from '../session-adoption.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence
} from '../session-persistence.ts'

// PAR-S01 slice 7: adoption of a populated v1 schema, restart, CAS, restore and the app/schema
// compatibility matrix (SPEC 0221 §9, SP19).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars01a_${suffix}`
const restored = `pars01r_${suffix}`
const oldSchema = `pars01o_${suffix}`
const role = `pars01a_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenants = ['tenant-synthetic-A', 'tenant-synthetic-B']
const PER_TENANT = 130
const input = (
  tenantId: string,
  sessionId: string,
  n: number
): SessionEventAppend => ({
  tenantId,
  sessionId,
  formatVersion: 1,
  eventId: `${sessionId}-e${n}`,
  timestamp: '2026-10-29T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic',
  type: 'message/user',
  payload: { text: `${sessionId}#${n}` }
})
const header = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_690_000_000_000,
  isSeeded: false
})

let admin: Client
let pool: Pool
let roleUrl: string
let manifest: SessionAdoptionEntry[]
const digestOf = (rows: { sequence: string; input_digest: string }[]) =>
  createHash('sha256')
    .update(rows.map((r) => `${r.sequence}:${r.input_digest}`).join('\n'))
    .digest('hex')
const eventsHash = async (s: string) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        (
          await admin.query(
            `SELECT tenant_id, session_id, sequence, event_id, input_digest, record::text AS record
               FROM ${s}.session_events ORDER BY tenant_id, session_id, sequence`
          )
        ).rows
      )
    )
    .digest('hex')
async function populate(s: string): Promise<SessionAdoptionEntry[]> {
  const out: SessionAdoptionEntry[] = []
  for (const tenant of tenants) {
    const store = new PostgresSessionEventStore(pool, {
      tenantId: tenant,
      schemaName: s
    })
    for (let i = 0; i < PER_TENANT; i++) {
      const id = `hist-${String(i).padStart(3, '0')}`
      const count = 1 + (i % 3)
      await store.openSession({
        tenantId: tenant,
        sessionId: id,
        formatVersion: 1
      })
      for (let n = 1; n <= count; n++) await store.append(input(tenant, id, n))
      const rows = (
        await admin.query(
          `SELECT sequence::text AS sequence, input_digest FROM ${s}.session_events WHERE tenant_id=$1 AND session_id=$2 ORDER BY sequence`,
          [tenant, id]
        )
      ).rows
      out.push({
        tenantId: tenant,
        sessionId: id,
        header: header(id),
        inheritedEventCount: 0,
        expectedNextSequence: count + 1,
        expectedDigest: digestOf(rows),
        provenance: 'synthetic-manifest-v1'
      })
    }
  }
  return out
}
const adopt = (entries = manifest, extra: Record<string, unknown> = {}) =>
  adoptSessionStreams(admin, { schemaName: schema, ...extra }, entries)
const headerOf = async (tenant: string, id: string, s = schema) =>
  (
    await admin.query(
      `SELECT header_json FROM ${s}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
      [tenant, id]
    )
  ).rows[0]?.header_json as string | null | undefined
const failure = async (p: Promise<unknown>): Promise<SessionAdoptionError> => {
  const e = await p.then(
    () => undefined,
    (x: unknown) => x
  )
  expect(e).toBeInstanceOf(SessionAdoptionError)
  return e as SessionAdoptionError
}

describe.skipIf(!url)('PAR-S01 slice 7: adoption and compatibility', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    pool = new Pool({ connectionString: url, max: 4 })
    // Baseline schema: only the v1 migration, populated before the expansion exists.
    await runPostgresMigrations(admin, {
      schemaName: schema,
      migrations: ['0028_session_events']
    })
    await runPostgresMigrations(admin, {
      schemaName: oldSchema,
      migrations: ['0028_session_events']
    })
    manifest = await populate(schema)
  })
  afterAll(async () => {
    await pool?.end()
    for (const s of [schema, restored, oldSchema])
      await admin?.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  const runtime = async (s = schema) => {
    const u = new URL(url!)
    u.username = role
    u.password = password
    roleUrl = u.toString()
    return createPostgresSessionPersistence(
      createPgPhysicalSessionPool({ connectionString: roleUrl }),
      new Pool({ connectionString: roleUrl, max: 3 }),
      {
        tenantId: tenants[0]!,
        schemaName: s,
        maxOpenWriters: 2,
        acquireTimeoutMs: 3000
      }
    ).then((r) => r.service)
  }
  const grant = async (s: string) => {
    await admin.query(`GRANT USAGE ON SCHEMA ${s} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT ON ${s}.session_events, ${s}.session_streams TO ${role}`
    )
    await admin.query(
      `GRANT UPDATE (next_sequence) ON ${s}.session_streams TO ${role}`
    )
    await admin.query(`GRANT SELECT ON ${s}.schema_migrations TO ${role}`)
  }

  describe('compatibility matrix before adoption', () => {
    it('new app on the old schema refuses at preflight', async () => {
      await admin.query(
        `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
      )
      await grant(oldSchema)
      await expect(runtime(oldSchema)).rejects.toBeInstanceOf(
        SessionPersistenceError
      )
    })

    it('old app on the old schema is the baseline, and on the expanded schema reads identical facts', async () => {
      const before = await eventsHash(schema)
      const legacy = new PostgresSessionEventStore(pool, {
        tenantId: tenants[0]!,
        schemaName: schema
      })
      const baseline = await legacy.read({
        tenantId: tenants[0]!,
        sessionId: 'hist-001'
      })
      expect(baseline).toHaveLength(2)
      await runSessionEventMigrations(admin, { schemaName: schema })
      expect(
        await legacy.read({ tenantId: tenants[0]!, sessionId: 'hist-001' })
      ).toEqual(baseline)
      expect(await eventsHash(schema)).toBe(before)
    })

    it('new app on the expanded schema without adoption says migration-required, and nothing is invented', async () => {
      await grant(schema)
      const svc = await runtime()
      await expect(svc.open('hist-001', 'read')).rejects.toBeInstanceOf(
        SessionMigrationRequiredError
      )
      expect(
        await countUnadoptedSessionStreams(admin, {
          schemaName: schema,
          tenantId: tenants[0]!
        })
      ).toBe(PER_TENANT)
      expect(await headerOf(tenants[0]!, 'hist-001')).toBeNull()
    })
  })

  describe('manifest validation', () => {
    const entry = (patch: Partial<SessionAdoptionEntry>) => ({
      ...manifest[0]!,
      ...patch
    })
    it.each([
      ['batch size above 100', () => adopt(manifest, { batchSize: 101 })],
      ['batch size zero', () => adopt(manifest, { batchSize: 0 })],
      ['duplicate entry', () => adopt([manifest[0]!, manifest[0]!])],
      ['no provenance', () => adopt([entry({ provenance: '' })])],
      ['bad cursor', () => adopt([entry({ expectedNextSequence: 0 })])],
      ['bad digest', () => adopt([entry({ expectedDigest: 'xyz' })])],
      [
        'header id differs',
        () => adopt([entry({ header: header('someone-else') })])
      ],
      [
        'invalid header',
        () =>
          adopt([
            entry({ header: { ...header('hist-000'), version: 2 } as never })
          ])
      ],
      [
        'unseeded session with a cut',
        () => adopt([entry({ inheritedEventCount: 3 })])
      ],
      ['no tenant', () => adopt([entry({ tenantId: '' })])]
    ])('rejects %s before touching anything', async (_n, run) => {
      const e = await failure(run())
      expect(e.failure).toBe('invalid_manifest')
      expect(await headerOf(tenants[0]!, 'hist-000')).toBeNull()
    })
    it('caps the documented batch size at 100', () => {
      expect(SESSION_ADOPTION_MAX_BATCH).toBe(100)
    })
  })

  describe('conflicts stop, and a batch is all or nothing', () => {
    it('refuses a wrong cursor or digest and leaves the whole batch unadopted', async () => {
      const bad = [
        manifest[0]!,
        { ...manifest[1]!, expectedNextSequence: 99 },
        manifest[2]!
      ]
      const e = await failure(adopt(bad))
      expect(e.failure).toBe('conflict')
      expect(e.failedBatch).toBe(0)
      for (const m of [manifest[0]!, manifest[2]!])
        expect(await headerOf(m.tenantId, m.sessionId)).toBeNull()
      const d = await failure(
        adopt([{ ...manifest[0]!, expectedDigest: 'a'.repeat(64) }])
      )
      expect(d.failure).toBe('conflict')
    })

    it('refuses a stream that does not exist', async () => {
      const e = await failure(
        adopt([
          { ...manifest[0]!, sessionId: 'ghost', header: header('ghost') }
        ])
      )
      expect(e.failure).toBe('conflict')
    })

    it('refuses to adopt under a live writer, then proceeds once it is gone', async () => {
      const holder = new Client({ connectionString: url })
      await holder.connect()
      try {
        const key = (
          await admin.query(
            `SELECT writer_lock_id FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
            [manifest[0]!.tenantId, manifest[0]!.sessionId]
          )
        ).rows[0].writer_lock_id
        await holder.query(
          `SELECT pg_advisory_lock((to_regclass('${schema}.session_streams')::oid::bigint - 2147483648)::integer, $1::integer)`,
          [key]
        )
        const e = await failure(adopt([manifest[0]!]))
        expect(e.failure).toBe('writer_active')
        expect(
          await headerOf(manifest[0]!.tenantId, manifest[0]!.sessionId)
        ).toBeNull()
      } finally {
        await holder.end()
      }
    })
  })

  describe('adoption in batches', () => {
    it('adopts 260 streams in batches of at most 100, without touching a single event', async () => {
      const before = await eventsHash(schema)
      const sizes: number[] = []
      const report = await adopt(manifest, {
        onBatchCommitted: (b: { adopted: number; alreadyAdopted: number }) => {
          sizes.push(b.adopted + b.alreadyAdopted)
        }
      })
      expect(sizes).toEqual([100, 100, 60])
      expect(report.adopted).toBe(260)
      expect(report.alreadyAdopted).toBe(0)
      expect(await eventsHash(schema)).toBe(before)
      expect(
        await verifySessionAdoption(admin, { schemaName: schema }, manifest)
      ).toEqual([])
      for (const t of tenants)
        expect(
          await countUnadoptedSessionStreams(admin, {
            schemaName: schema,
            tenantId: t
          })
        ).toBe(0)
    })

    it('is a no-op the second time, and a divergent record is a conflict', async () => {
      const again = await adopt()
      expect(again.adopted).toBe(0)
      expect(again.alreadyAdopted).toBe(260)
      const e = await failure(
        adopt([
          {
            ...manifest[5]!,
            header: { ...header(manifest[5]!.sessionId), createdAt: 1 }
          }
        ])
      )
      expect(e.failure).toBe('conflict')
      expect(
        await headerOf(manifest[5]!.tenantId, manifest[5]!.sessionId)
      ).toBe(JSON.stringify(header(manifest[5]!.sessionId)))
    })

    it('the runtime now opens an adopted stream and reads the identical prefix', async () => {
      const svc = await runtime()
      const h = await svc.open('hist-002', 'read')
      expect(h.header).toEqual(header('hist-002'))
      expect(h.inheritedEventCount).toBe(0)
      const read = await h.read()
      expect(read.events.map((e) => e.sequence)).toEqual([1, 2, 3])
      await h.close()
    })

    it('the adopted header and cut are now immutable, even for the migration authority', async () => {
      await expect(
        admin.query(
          `UPDATE ${schema}.session_streams SET header_json='{}' WHERE session_id='hist-000' AND tenant_id=$1`,
          [tenants[0]]
        )
      ).rejects.toMatchObject({ code: '55000' })
    })
  })

  describe('interruption and unknown outcome', () => {
    let fresh: SessionAdoptionEntry[]
    const freshSchema = `pars01i_${suffix}`
    beforeAll(async () => {
      await runPostgresMigrations(admin, {
        schemaName: freshSchema,
        migrations: ['0028_session_events']
      })
      // Reuse the generator on a second schema.
      const store = new PostgresSessionEventStore(pool, {
        tenantId: tenants[0]!,
        schemaName: freshSchema
      })
      fresh = []
      for (let i = 0; i < 250; i++) {
        const id = `int-${String(i).padStart(3, '0')}`
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.append(input(tenants[0]!, id, 1))
        const rows = (
          await admin.query(
            `SELECT sequence::text AS sequence, input_digest FROM ${freshSchema}.session_events WHERE session_id=$1`,
            [id]
          )
        ).rows
        fresh.push({
          tenantId: tenants[0]!,
          sessionId: id,
          header: header(id),
          inheritedEventCount: 0,
          expectedNextSequence: 2,
          expectedDigest: digestOf(rows),
          provenance: 'synthetic-manifest-v1'
        })
      }
      await runSessionEventMigrations(admin, { schemaName: freshSchema })
    }, 120_000)
    afterAll(async () => {
      await admin.query(`DROP SCHEMA IF EXISTS ${freshSchema} CASCADE`)
    })
    const run = (
      client: Client | object,
      extra: Record<string, unknown> = {}
    ) =>
      adoptSessionStreams(
        client as never,
        { schemaName: freshSchema, ...extra },
        fresh
      )
    const unadopted = async () =>
      countUnadoptedSessionStreams(admin, {
        schemaName: freshSchema,
        tenantId: tenants[0]!
      })

    it('keeps committed batches when the run is interrupted, and the rerun finishes the rest', async () => {
      await expect(
        run(admin, {
          onBatchCommitted: () => {
            throw new Error('operator interrupt')
          }
        })
      ).rejects.toThrow('operator interrupt')
      expect(await unadopted()).toBe(150)
      const rest = await run(admin)
      expect(rest.alreadyAdopted).toBe(100)
      expect(rest.adopted).toBe(150)
      expect(await unadopted()).toBe(0)
    })

    it('treats a COMMIT whose answer was lost as unknown, and the rerun reconciles', async () => {
      const second = `pars01u_${suffix}`
      await runPostgresMigrations(admin, {
        schemaName: second,
        migrations: ['0028_session_events']
      })
      const store = new PostgresSessionEventStore(pool, {
        tenantId: tenants[0]!,
        schemaName: second
      })
      const entries: SessionAdoptionEntry[] = []
      for (let i = 0; i < 3; i++) {
        const id = `unk-${i}`
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.append(input(tenants[0]!, id, 1))
        const rows = (
          await admin.query(
            `SELECT sequence::text AS sequence, input_digest FROM ${second}.session_events WHERE session_id=$1`,
            [id]
          )
        ).rows
        entries.push({
          tenantId: tenants[0]!,
          sessionId: id,
          header: header(id),
          inheritedEventCount: 0,
          expectedNextSequence: 2,
          expectedDigest: digestOf(rows),
          provenance: 'synthetic-manifest-v1'
        })
      }
      await runSessionEventMigrations(admin, { schemaName: second })
      const losing = {
        query: async (sql: string, v?: unknown[]) => {
          const r = await admin.query(sql, v as never)
          if (sql === 'COMMIT') throw new Error('ACK lost')
          return r
        }
      }
      try {
        const e = await failure(
          adoptSessionStreams(losing as never, { schemaName: second }, entries)
        )
        expect(e.failure).toBe('outcome_unknown')
        const rerun = await adoptSessionStreams(
          admin,
          { schemaName: second },
          entries
        )
        expect(rerun.adopted).toBe(0)
        expect(rerun.alreadyAdopted).toBe(3)
        expect(
          await verifySessionAdoption(admin, { schemaName: second }, entries)
        ).toEqual([])
      } finally {
        await admin.query(`DROP SCHEMA IF EXISTS ${second} CASCADE`)
      }
    })

    async function smallSchema(name: string, n: number) {
      await runPostgresMigrations(admin, {
        schemaName: name,
        migrations: ['0028_session_events']
      })
      const store = new PostgresSessionEventStore(pool, {
        tenantId: tenants[0]!,
        schemaName: name
      })
      const entries: SessionAdoptionEntry[] = []
      for (let i = 0; i < n; i++) {
        const id = `s-${i}`
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.openSession({
          tenantId: tenants[0]!,
          sessionId: id,
          formatVersion: 1
        })
        await store.append(input(tenants[0]!, id, 1))
        const rows = (
          await admin.query(
            `SELECT sequence::text AS sequence, input_digest FROM ${name}.session_events WHERE session_id=$1`,
            [id]
          )
        ).rows
        entries.push({
          tenantId: tenants[0]!,
          sessionId: id,
          header: header(id),
          inheritedEventCount: 0,
          expectedNextSequence: 2,
          expectedDigest: digestOf(rows),
          provenance: 'synthetic-manifest-v1'
        })
      }
      await runSessionEventMigrations(admin, { schemaName: name })
      return entries
    }
    it('reports a storage failure, rolls the batch back and names the failed batch', async () => {
      const name = `pars01s_${suffix}`
      const entries = await smallSchema(name, 3)
      try {
        const broken = {
          query: async (sql: string, v?: unknown[]) => {
            if (sql.startsWith('UPDATE') && v?.[1] === 's-2')
              throw new Error('disk full')
            return admin.query(sql, v as never)
          }
        }
        const e = await failure(
          adoptSessionStreams(broken as never, { schemaName: name }, entries)
        )
        expect(e.failure).toBe('storage')
        expect(e.failedBatch).toBe(0)
        for (const m of entries)
          expect(await headerOf(m.tenantId, m.sessionId, name)).toBeNull()
      } finally {
        await admin.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`)
      }
    })
  })

  describe('after adoption: new facts, rollback of the app, restore', () => {
    it('keeps new facts readable by the v1 reader after the app is rolled back (writer gone)', async () => {
      const svc = await runtime()
      const w = await svc.open('hist-004', 'write')
      await w.append([
        materializeSessionEvent(input(tenants[0]!, 'hist-004', 3), 3)
      ])
      await w.close()
      const legacy = new PostgresSessionEventStore(pool, {
        tenantId: tenants[0]!,
        schemaName: schema
      })
      const all = await legacy.read({
        tenantId: tenants[0]!,
        sessionId: 'hist-004'
      })
      expect(all.map((e) => e.sequence)).toEqual([1, 2, 3])
      // The old writer continues the same log under the guards.
      await legacy.append(input(tenants[0]!, 'hist-004', 4))
      const again = await svc.open('hist-004', 'read')
      expect((await again.read()).events.map((e) => e.sequence)).toEqual([
        1, 2, 3, 4
      ])
      await again.close()
    })

    it('restores the preimage into its own synthetic resource and replays adoption with identical results', async () => {
      // Preimage = the baseline populated schema rebuilt from the same synthetic inputs.
      await runPostgresMigrations(admin, {
        schemaName: restored,
        migrations: ['0028_session_events']
      })
      const mirror = await populate(restored)
      await runSessionEventMigrations(admin, { schemaName: restored })
      const replay = await adoptSessionStreams(
        admin,
        { schemaName: restored },
        mirror
      )
      expect(replay.adopted).toBe(260)
      expect(
        await verifySessionAdoption(admin, { schemaName: restored }, mirror)
      ).toEqual([])
      // Same headers, cursors and ordered digests as the adopted original (hist-004 grew there, so compare others).
      const pick = async (s: string) =>
        (
          await admin.query(
            `SELECT tenant_id, session_id, header_json, inherited_event_count::text AS cut
               FROM ${s}.session_streams WHERE session_id <> 'hist-004' ORDER BY 1, 2`
          )
        ).rows
      expect(await pick(restored)).toEqual(await pick(schema))
      // The original keeps its new facts: restore never overwrote them.
      expect(
        (
          await admin.query(
            `SELECT count(*)::int AS n FROM ${schema}.session_events WHERE session_id='hist-004' AND tenant_id=$1`,
            [tenants[0]]
          )
        ).rows[0].n
      ).toBe(4)
    }, 120_000)
  })
})
