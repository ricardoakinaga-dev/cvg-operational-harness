// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- forged driver rows in negative tests */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEventAppend, SessionHandle } from '@cvg/harness-contracts'
import {
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  SessionCommitUnknownError,
  SessionHandleClosedError,
  SessionHeaderValidationError,
  SessionMigrationRequiredError,
  SessionOwnershipLostError,
  SessionPersistenceCorruptionError,
  SessionPersistenceNotFoundError,
  SessionStorageUnavailableError
} from '@cvg/harness'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  type PostgresPhysicalSessionPool
} from '../session-persistence.ts'

// PAR-S01 slice 3: physical-session adapter, create/open/read (SPEC 0221 §3, §4, §6).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars01a_${suffix}`
const bare = `pars01x_${suffix}`
const role = `pars01a_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenantA = 'tenant-synthetic-A'
const tenantB = 'tenant-synthetic-B'
const hdr = (id: string, extra: object = {}) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false,
  ...extra
})
const ev = (sessionId: string, eventId: string): SessionEventAppend => ({
  tenantId: tenantA,
  sessionId,
  formatVersion: 1,
  eventId,
  timestamp: '2026-10-29T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic',
  type: 'message/user',
  payload: { text: eventId }
})

let admin: Client
let readPool: Pool
let roleUrl: string
let physical: PostgresPhysicalSessionPool
let acquisitions = 0
const countingPool = (): PostgresPhysicalSessionPool => {
  const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
  return {
    acquire: (o) => {
      acquisitions++
      return inner.acquire(o)
    }
  }
}
const service = (tenantId = tenantA, maxOpenWriters = 4, pool = physical) =>
  createPostgresSessionPersistence(pool, readPool, {
    tenantId,
    schemaName: schema,
    maxOpenWriters,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)
async function advisoryHolders(sessionId: string): Promise<number> {
  const r = await admin.query(
    `SELECT count(*)::int AS n FROM pg_locks l
      WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted
        AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid
        AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id=$1)::oid`,
    [sessionId]
  )
  return r.rows[0].n
}
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('condition not reached')
}

describe.skipIf(!url)('PAR-S01 slice 3: adapter, create, open, read', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runSessionEventMigrations(admin, { schemaName: schema })
    // A schema with 0028 only (no 0034) must fail the preflight.
    const { runPostgresMigrations } = await import('../postgres-migrations.ts')
    await runPostgresMigrations(admin, {
      schemaName: bare,
      migrations: ['0028_session_events']
    })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    for (const s of [schema, bare]) {
      await admin.query(`GRANT USAGE ON SCHEMA ${s} TO ${role}`)
      await admin.query(
        `GRANT SELECT, INSERT ON ${s}.session_events TO ${role}`
      )
      await admin.query(
        `GRANT SELECT, INSERT ON ${s}.session_streams TO ${role}`
      )
      await admin.query(`GRANT SELECT ON ${s}.schema_migrations TO ${role}`)
    }
    await admin.query(
      `GRANT UPDATE (next_sequence) ON ${schema}.session_streams TO ${role}`
    )
    const u = new URL(url!)
    u.username = role
    u.password = password
    roleUrl = u.toString()
    readPool = new Pool({ connectionString: roleUrl, max: 6 })
    physical = createPgPhysicalSessionPool({ connectionString: roleUrl })
  })
  afterAll(async () => {
    await readPool?.end()
    for (const s of [schema, bare])
      await admin?.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  describe('preflight', () => {
    it('refuses a superuser role, a schema without 0034 and a missing schema', async () => {
      const superPool = new Pool({ connectionString: url, max: 1 })
      try {
        await expect(
          createPostgresSessionPersistence(physical, superPool, {
            tenantId: tenantA,
            schemaName: schema,
            maxOpenWriters: 1
          })
        ).rejects.toBeInstanceOf(SessionMigrationRequiredError)
      } finally {
        await superPool.end()
      }
      await expect(
        createPostgresSessionPersistence(physical, readPool, {
          tenantId: tenantA,
          schemaName: bare,
          maxOpenWriters: 1
        })
      ).rejects.toBeInstanceOf(SessionMigrationRequiredError)
      await expect(
        createPostgresSessionPersistence(physical, readPool, {
          tenantId: tenantA,
          schemaName: `nope_${suffix}`,
          maxOpenWriters: 1
        })
      ).rejects.toBeInstanceOf(SessionMigrationRequiredError)
    })
    it('refuses a role that owns the tables, a disabled guard and bad bindings', async () => {
      await admin.query(
        `ALTER TABLE ${schema}.session_events DISABLE TRIGGER session_events_writer_guard`
      )
      try {
        await expect(service()).rejects.toBeInstanceOf(
          SessionMigrationRequiredError
        )
      } finally {
        await admin.query(
          `ALTER TABLE ${schema}.session_events ENABLE TRIGGER session_events_writer_guard`
        )
      }
      await expect(
        createPostgresSessionPersistence(physical, readPool, {
          tenantId: tenantA,
          schemaName: 'Bad-Name',
          maxOpenWriters: 1
        })
      ).rejects.toBeInstanceOf(SessionHeaderValidationError)
      await expect(
        createPostgresSessionPersistence(physical, readPool, {
          tenantId: tenantA,
          schemaName: schema,
          maxOpenWriters: 0
        })
      ).rejects.toBeInstanceOf(SessionHeaderValidationError)
      const ok = await service()
      expect(typeof ok.identity).toBe('symbol')
      expect((await service()).identity).not.toBe(ok.identity)
    })
  })

  describe('physical leases', () => {
    it('two simultaneous leases never share a backend', async () => {
      const a = await physical.acquire({ timeoutMs: 3000 })
      const b = await physical.acquire({ timeoutMs: 3000 })
      try {
        expect(a.backendPid).not.toBe(b.backendPid)
        expect(a.backendPid).toBeGreaterThan(0)
      } finally {
        await a.release()
        await b.release()
      }
    })
    it('a late lease after a timeout is destroyed by the adapter, not leaked', async () => {
      const before = Number(
        (
          await admin.query(
            `SELECT count(*) FROM pg_stat_activity WHERE usename=$1`,
            [role]
          )
        ).rows[0].count
      )
      await expect(physical.acquire({ timeoutMs: 1 })).rejects.toBeDefined()
      await waitFor(
        async () =>
          Number(
            (
              await admin.query(
                `SELECT count(*) FROM pg_stat_activity WHERE usename=$1`,
                [role]
              )
            ).rows[0].count
          ) <= before
      )
      await expect(
        physical.acquire({ timeoutMs: 3000, signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
    })
  })

  describe('create', () => {
    it('returns a writer only after COMMIT, holding exactly one session lock', async () => {
      const svc = await service()
      const h = await svc.create(hdr('c1', { tag: 'x' }))
      try {
        expect(h.access).toBe('write')
        expect(h.id).toBe('c1')
        expect(h.inheritedEventCount).toBe(0)
        expect(h.header).toMatchObject({ id: 'c1', tag: 'x' })
        expect(await advisoryHolders('c1')).toBe(1)
        const stored = await admin.query(
          `SELECT header_json, inherited_event_count FROM ${schema}.session_streams WHERE session_id='c1'`
        )
        expect(JSON.parse(stored.rows[0].header_json)).toEqual(h.header)
        expect(Number(stored.rows[0].inherited_event_count)).toBe(0)
        // The header is a detached copy.
        ;(h.header as unknown as { tag: string }).tag = 'changed'
        expect(h.header).toMatchObject({ tag: 'x' })
      } finally {
        await h.close()
      }
      expect(await advisoryHolders('c1')).toBe(0)
    })
    it('keeps an explicit seeded cut (also 0 and above the empty body) and refuses a bad one before any IO', async () => {
      const svc = await service(tenantA, 4, countingPool())
      const before = acquisitions
      const h = await svc.create(hdr('c2', { isSeeded: true }), {
        inheritedEventCount: 7
      })
      expect(h.inheritedEventCount).toBe(7)
      await h.close()
      const z = await svc.create(hdr('c2z', { isSeeded: true }), {
        inheritedEventCount: 0
      })
      expect(z.inheritedEventCount).toBe(0)
      await z.close()
      const mid = acquisitions
      expect(mid).toBe(before + 2)
      await expect(
        svc.create(hdr('c2b', { isSeeded: true }))
      ).rejects.toBeInstanceOf(SessionHeaderValidationError)
      await expect(
        svc.create(hdr('c2c'), { inheritedEventCount: 3 })
      ).rejects.toBeInstanceOf(SessionHeaderValidationError)
      await expect(
        svc.create(hdr('c2d'), { signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(acquisitions).toBe(mid)
    })
    it('rejects a duplicate without touching the owner, and a second create after close', async () => {
      const svc = await service()
      const h = await svc.create(hdr('c3'))
      await expect(svc.create(hdr('c3'))).rejects.toBeInstanceOf(
        SessionAlreadyExistsError
      )
      expect(await advisoryHolders('c3')).toBe(1)
      await h.close()
      await expect(svc.create(hdr('c3'))).rejects.toBeInstanceOf(
        SessionAlreadyExistsError
      )
    })
    it('an unknown COMMIT outcome is an error, never success: the connection is destroyed and capacity returns', async () => {
      const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
      const flaky: PostgresPhysicalSessionPool = {
        acquire: async (o) => {
          const lease = await inner.acquire(o)
          return {
            backendPid: lease.backendPid,
            query: (sql: string, v?: unknown[]) =>
              sql === 'COMMIT'
                ? Promise.reject(new Error('lost ack'))
                : lease.query(sql, v),
            onLost: (l) => lease.onLost(l),
            release: () => lease.release(),
            destroy: () => lease.destroy()
          }
        }
      }
      const svc = await service(tenantA, 1, flaky)
      await expect(svc.create(hdr('c4'))).rejects.toBeInstanceOf(
        SessionCommitUnknownError
      )
      await expect(svc.create(hdr('c4b'))).rejects.toBeInstanceOf(
        SessionCommitUnknownError
      )
      expect(
        (
          await admin.query(
            `SELECT count(*) FROM ${schema}.session_streams WHERE session_id IN ('c4','c4b')`
          )
        ).rows[0].count
      ).toBe('0')
      await waitFor(
        async () =>
          (
            await admin.query(
              `SELECT count(*) FROM pg_stat_activity WHERE usename=$1 AND state='idle in transaction'`,
              [role]
            )
          ).rows[0].count === '0'
      )
    })
  })

  describe('open', () => {
    it('reports not found, migration-required and already-owned; a reader never takes the lock', async () => {
      const svc = await service()
      await expect(svc.open('ghost', 'write')).rejects.toBeInstanceOf(
        SessionPersistenceNotFoundError
      )
      await expect(svc.open('ghost', 'read')).rejects.toBeInstanceOf(
        SessionPersistenceNotFoundError
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_streams DISABLE TRIGGER session_streams_default_header`
      )
      await admin.query(
        `INSERT INTO ${schema}.session_streams (tenant_id,session_id,format_version,header_json,inherited_event_count) VALUES ($1,'hist',1,NULL,NULL)`,
        [tenantA]
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_streams ENABLE TRIGGER session_streams_default_header`
      )
      await expect(svc.open('hist', 'write')).rejects.toBeInstanceOf(
        SessionMigrationRequiredError
      )
      await expect(svc.open('hist', 'read')).rejects.toBeInstanceOf(
        SessionMigrationRequiredError
      )
      expect(await advisoryHolders('hist')).toBe(0)
      const w = await svc.create(hdr('o1'))
      const r = await svc.open('o1', 'read')
      expect(r.access).toBe('read')
      expect(await advisoryHolders('o1')).toBe(1)
      await expect(svc.open('o1', 'write')).rejects.toBeInstanceOf(
        SessionAlreadyOwnedError
      )
      await r.close()
      expect(await advisoryHolders('o1')).toBe(1)
      await w.close()
      const w2 = await svc.open('o1', 'write')
      expect(await advisoryHolders('o1')).toBe(1)
      await w2.close()
      expect(await advisoryHolders('o1')).toBe(0)
    })
    it('a different process-level service (own pool) cannot claim an owned session', async () => {
      const a = await service()
      const b = await service()
      const w = await a.create(hdr('o2'))
      await expect(b.open('o2', 'write')).rejects.toBeInstanceOf(
        SessionAlreadyOwnedError
      )
      await w.close()
      const w2 = await b.open('o2', 'write')
      await w2.close()
    })
    it('binds the tenant to the composition: another tenant sees nothing', async () => {
      const a = await service(tenantA)
      const b = await service(tenantB)
      const h = await a.create(hdr('o3'))
      await expect(b.open('o3', 'read')).rejects.toBeInstanceOf(
        SessionPersistenceNotFoundError
      )
      await expect(b.open('o3', 'write')).rejects.toBeInstanceOf(
        SessionPersistenceNotFoundError
      )
      const own = await b.create(hdr('o3'))
      expect(own.id).toBe('o3')
      await own.close()
      await h.close()
    })
    it('refuses malformed arguments before any IO', async () => {
      const svc = await service(tenantA, 4, countingPool())
      const before = acquisitions
      await expect(svc.open('', 'write')).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(svc.open('x'.repeat(201), 'read')).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(svc.open('o4', 'admin' as never)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(
        svc.open('o4', 'write', { signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(acquisitions).toBe(before)
    })
  })

  describe('capacity', () => {
    it('refuses beyond maxOpenWriters without a partial claim, and frees the slot on close or failure', async () => {
      const svc = await service(tenantA, 1, countingPool())
      const first = await svc.create(hdr('k1'))
      const before = acquisitions
      await expect(svc.create(hdr('k2'))).rejects.toBeInstanceOf(
        SessionStorageUnavailableError
      )
      await expect(svc.open('k1', 'write')).rejects.toBeInstanceOf(
        SessionStorageUnavailableError
      )
      expect(acquisitions).toBe(before)
      expect(
        (
          await admin.query(
            `SELECT count(*) FROM ${schema}.session_streams WHERE session_id='k2'`
          )
        ).rows[0].count
      ).toBe('0')
      await expect(svc.open('k1', 'read')).resolves.toBeDefined()
      await first.close()
      await expect(svc.create(hdr('k1'))).rejects.toBeInstanceOf(
        SessionAlreadyExistsError
      )
      const again = await svc.create(hdr('k3'))
      await again.close()
    })
  })

  describe('read', () => {
    async function seeded(id: string, n: number): Promise<SessionHandle> {
      const svc = await service()
      const w = await svc.create(hdr(id))
      await w.close()
      const store = new PostgresSessionEventStore(readPool, {
        tenantId: tenantA,
        schemaName: schema
      })
      for (let i = 1; i <= n; i++) await store.append(ev(id, `e${i}`))
      return svc.open(id, 'read')
    }
    it('slices by offset and length, defaults to the rest, and returns empty at or past the end', async () => {
      const r = await seeded('r1', 5)
      const all = await r.read()
      expect(all.eventState).toBe('detached')
      expect(all.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5])
      expect((await r.read(2)).events.map((e) => e.sequence)).toEqual([3, 4, 5])
      expect((await r.read(1, 2)).events.map((e) => e.sequence)).toEqual([2, 3])
      expect((await r.read(5)).events).toEqual([])
      expect((await r.read(99)).events).toEqual([])
      expect((await r.read(0, 0)).events).toEqual([])
      expect(
        (await r.read(Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER))
          .events
      ).toEqual([])
      const a = (await r.read()).events
      const b = (await r.read()).events
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
      expect(a[0]).not.toBe(b[0])
      await r.close()
    })
    it('validates the whole prefix in pages of 256 even outside the slice', async () => {
      const r = await seeded('r2', 300)
      const tail = await r.read(299)
      expect(tail.events.map((e) => e.sequence)).toEqual([300])
      expect((await r.read()).events).toHaveLength(300)
      await r.close()
    })
    it('refuses corruption outside the returned slice', async () => {
      const r = await seeded('r3', 3)
      await admin.query('BEGIN')
      await admin.query(`SET LOCAL session_replication_role = replica`)
      await admin.query(`SELECT set_config('cvg.tenant_id',$1,true)`, [tenantA])
      await admin.query(
        `ALTER TABLE ${schema}.session_events DISABLE TRIGGER session_events_no_mutation`
      )
      await admin.query(
        `UPDATE ${schema}.session_events SET input_digest=$1 WHERE session_id='r3' AND sequence=1`,
        ['f'.repeat(64)]
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_events ENABLE TRIGGER session_events_no_mutation`
      )
      await admin.query('COMMIT')
      await expect(r.read(2)).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      await r.close()
    })
    it('rejects bad offset and length before any IO', async () => {
      const r = await seeded('r4', 1)
      await expect(r.read(-1)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(r.read(1.5)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(r.read(0, -1)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      await expect(
        r.read(0, undefined, { signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
      await r.close()
    })
    it('a writer handle reads its own session, and the facts come from the primary snapshot', async () => {
      const svc = await service()
      const w = await svc.create(hdr('r5'))
      const store = new PostgresSessionEventStore(readPool, {
        tenantId: tenantA,
        schemaName: schema
      })
      // The writer's lock is re-entrant only on its own connection: the legacy store is refused.
      await expect(store.append(ev('r5', 'e1'))).rejects.toBeDefined()
      expect((await w.read()).events).toEqual([])
      await w.close()
    })
  })

  describe('close, dispose and loss', () => {
    it('close marks CLOSING at once, memoizes one promise, rejects later calls and releases the lock once', async () => {
      const svc = await service()
      const w = await svc.create(hdr('x1'))
      const pending = w.read()
      const p1 = w.close()
      const p2 = w.close()
      expect(p2).toBe(p1)
      await expect(w.read()).rejects.toBeInstanceOf(SessionHandleClosedError)
      await expect(w.append([])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
      await expect(w.flush()).rejects.toBeInstanceOf(SessionHandleClosedError)
      await expect(pending).resolves.toBeDefined()
      await p1
      expect(await advisoryHolders('x1')).toBe(0)
      await expect(w.close()).resolves.toBeUndefined()
      const r = await svc.open('x1', 'read')
      await r.close()
      await expect(r.read()).rejects.toBeInstanceOf(SessionHandleClosedError)
    })
    it('asyncDispose is the same close, alone on a fresh handle', async () => {
      const svc = await service()
      const w = await svc.create(hdr('x2'))
      await w[Symbol.asyncDispose]()
      expect(await advisoryHolders('x2')).toBe(0)
      const r = await svc.open('x2', 'read')
      await r[Symbol.asyncDispose]()
      await expect(r.read()).rejects.toBeInstanceOf(SessionHandleClosedError)
    })
    it('losing the physical session makes the writer terminal: it never revives, reads still work, a new claim succeeds', async () => {
      const svc = await service(tenantA, 1)
      const w = await svc.create(hdr('x3'))
      const pid = (
        await admin.query(
          `SELECT pid FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id='x3')::oid`
        )
      ).rows[0].pid
      await admin.query('SELECT pg_terminate_backend($1)', [pid])
      await waitFor(async () => (await advisoryHolders('x3')) === 0)
      await expect(w.append([])).rejects.toBeInstanceOf(
        SessionOwnershipLostError
      )
      await expect(w.flush()).rejects.toBeInstanceOf(SessionOwnershipLostError)
      await expect(w.read()).resolves.toBeDefined()
      const next = await svc.open('x3', 'write').catch((e) => e)
      expect(next).toBeInstanceOf(SessionStorageUnavailableError)
      await expect(w.close()).resolves.toBeUndefined()
      const claimed = await svc.open('x3', 'write')
      expect(await advisoryHolders('x3')).toBe(1)
      await expect(w.append([])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
      await claimed.close()
    })
  })

  describe('stored metadata and lease handling', () => {
    const tamper = async (id: string, set: string, params: unknown[] = []) => {
      await admin.query('BEGIN')
      try {
        await admin.query(
          `ALTER TABLE ${schema}.session_streams DISABLE TRIGGER session_streams_writer_guard`
        )
        await admin.query(
          `UPDATE ${schema}.session_streams SET ${set} WHERE session_id='${id}'`,
          params
        )
        await admin.query('SET CONSTRAINTS ALL IMMEDIATE')
        await admin.query(
          `ALTER TABLE ${schema}.session_streams ENABLE TRIGGER session_streams_writer_guard`
        )
        await admin.query('COMMIT')
      } catch (error) {
        await admin.query('ROLLBACK')
        throw error
      }
    }
    it('maps an unknown header version, a foreign identity and non-JSON to distinct errors', async () => {
      const svc = await service()
      for (const id of ['m1', 'm2', 'm3', 'm4'])
        await (await svc.create(hdr(id))).close()
      await tamper('m1', `header_json=$1`, [
        JSON.stringify(hdr('m1', { version: 2 }))
      ])
      await tamper('m2', `header_json=$1`, [JSON.stringify(hdr('other'))])
      await tamper('m3', `header_json='not json'`)
      await tamper('m4', `header_json=$1`, [
        JSON.stringify(hdr('m4', { version: 0 }))
      ])
      for (const access of ['read', 'write'] as const) {
        await expect(svc.open('m1', access)).rejects.toMatchObject({
          name: 'SessionFormatUnsupportedError',
          message: expect.stringContaining('newer')
        })
        await expect(svc.open('m4', access)).rejects.toMatchObject({
          name: 'SessionFormatUnsupportedError',
          message: expect.stringContaining('older')
        })
        await expect(svc.open('m2', access)).rejects.toBeInstanceOf(
          SessionPersistenceCorruptionError
        )
        await expect(svc.open('m3', access)).rejects.toBeInstanceOf(
          SessionPersistenceCorruptionError
        )
      }
      expect(await advisoryHolders('m1')).toBe(0)
    })
    it('a header that changes under a live reader is corruption', async () => {
      const svc = await service()
      await (await svc.create(hdr('m5'))).close()
      const r = await svc.open('m5', 'read')
      await tamper('m5', `header_json=$1`, [
        JSON.stringify(hdr('m5', { tag: 'changed' }))
      ])
      await expect(r.read()).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      await r.close()
    })

    const wrapped = (
      onQuery: (sql: string, calls: number) => unknown | undefined,
      log: string[]
    ): PostgresPhysicalSessionPool => {
      const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
      let metadataCalls = 0
      return {
        acquire: async (o) => {
          const lease = await inner.acquire(o)
          return {
            backendPid: lease.backendPid,
            query: async (sql: string, v?: unknown[]) => {
              if (
                sql.includes('FROM') &&
                sql.includes('writer_lock_id, header_json')
              )
                metadataCalls++
              const forced = onQuery(sql, metadataCalls)
              return (forced ?? (await lease.query(sql, v))) as never
            },
            onLost: (l) => lease.onLost(l),
            release: async () => {
              log.push('release')
              await lease.release()
            },
            destroy: async () => {
              log.push('destroy')
              await lease.destroy()
            }
          }
        }
      }
    }
    it('a stream that changes between the claim and the publish is not published', async () => {
      await (await (await service()).create(hdr('m6'))).close()
      const log: string[] = []
      const real = (
        await admin.query(
          `SELECT header_json, writer_lock_id, next_sequence, inherited_event_count FROM ${schema}.session_streams WHERE session_id='m6'`
        )
      ).rows[0]
      const svc = await service(
        tenantA,
        2,
        wrapped(
          (sql, calls) =>
            sql.includes('writer_lock_id, header_json') && calls === 2
              ? {
                  rows: [
                    {
                      ...real,
                      header_json: JSON.stringify(hdr('m6', { tag: 'moved' })),
                      format_version: 1
                    }
                  ],
                  rowCount: 1
                }
              : undefined,
          log
        )
      )
      await expect(svc.open('m6', 'write')).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      expect(log).toContain('destroy')
      await waitFor(async () => (await advisoryHolders('m6')) === 0)
    })
    it('close never hands back a session whose unlock was not confirmed', async () => {
      const log: string[] = []
      const svc = await service(
        tenantA,
        2,
        wrapped(
          (sql) =>
            sql.includes('pg_advisory_unlock')
              ? { rows: [{ ok: false }], rowCount: 1 }
              : undefined,
          log
        )
      )
      const w = await svc.create(hdr('m7'))
      await w.close()
      expect(log).toEqual(['destroy'])
      await waitFor(async () => (await advisoryHolders('m7')) === 0)
      const log2: string[] = []
      const ok = await (
        await service(
          tenantA,
          2,
          wrapped(() => undefined, log2)
        )
      ).create(hdr('m8'))
      await ok.close()
      expect(log2).toEqual(['release'])
    })
    it('an abort that lands while an operation is queued rejects it without IO', async () => {
      const svc = await service()
      const w = await svc.create(hdr('m9'))
      const ac = new AbortController()
      const first = w.read()
      const second = w.read(0, undefined, { signal: ac.signal })
      ac.abort()
      await expect(second).rejects.toMatchObject({ name: 'AbortError' })
      await expect(first).resolves.toBeDefined()
      await w.close()
    })

    const forgedPool = (
      hook: (
        sql: string,
        result: { rows: any[]; rowCount: number | null }
      ) => unknown
    ) => {
      const log: string[] = []
      const pool = {
        connect: async () => {
          const c = await readPool.connect()
          return {
            query: async (sql: string, v?: unknown[]) => {
              log.push(sql)
              const r = await c.query(sql, v)
              return (hook(sql, r as never) ?? r) as never
            },
            release: (e?: Error) => c.release(e)
          }
        }
      }
      return { pool, log }
    }
    const withForgedRead = (hook: Parameters<typeof forgedPool>[0]) => {
      const f = forgedPool(hook)
      return {
        log: f.log,
        svc: createPostgresSessionPersistence(physical, f.pool as never, {
          tenantId: tenantA,
          schemaName: schema,
          maxOpenWriters: 4,
          acquireTimeoutMs: 3000
        }).then((r) => r.service)
      }
    }
    const seed = async (id: string, n: number) => {
      const svc = await service()
      await (await svc.create(hdr(id))).close()
      const store = new PostgresSessionEventStore(readPool, {
        tenantId: tenantA,
        schemaName: schema
      })
      for (let i = 1; i <= n; i++) await store.append(ev(id, `e${i}`))
    }

    it('names the failing preflight check', async () => {
      const mk = async (name: string, ddl: string) => {
        await admin.query(
          `CREATE ROLE ${name} LOGIN ${ddl} PASSWORD '${password}'`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${name}`)
        await admin.query(
          `GRANT SELECT ON ${schema}.session_events, ${schema}.session_streams, ${schema}.schema_migrations TO ${name}`
        )
        const u = new URL(url!)
        u.username = name
        u.password = password
        return new Pool({ connectionString: u.toString(), max: 1 })
      }
      const open = (pool: Pool, schemaName = schema) =>
        createPostgresSessionPersistence(physical, pool, {
          tenantId: tenantA,
          schemaName,
          maxOpenWriters: 1
        })
      const roles = [`${role}_su`, `${role}_bp`, `${role}_ow`]
      const pools: Pool[] = []
      try {
        const su = await mk(roles[0]!, 'SUPERUSER')
        const bp = await mk(roles[1]!, 'NOSUPERUSER BYPASSRLS')
        await admin
          .query(`GRANT postgres TO ${roles[2]}`)
          .catch(() => undefined)
        const ow = await mk(roles[2]!, 'NOSUPERUSER NOBYPASSRLS INHERIT')
        await admin.query(`GRANT postgres TO ${roles[2]}`)
        pools.push(su, bp, ow)
        await expect(open(su)).rejects.toThrow(/superuser or bypasses/)
        await expect(open(bp)).rejects.toThrow(/superuser or bypasses/)
        await expect(open(ow)).rejects.toThrow(/owns the session tables/)
      } finally {
        for (const p of pools) await p.end()
        for (const r of roles) {
          await admin.query(`REVOKE postgres FROM ${r}`).catch(() => undefined)
          await admin
            .query(
              `REVOKE ALL ON ${schema}.session_events, ${schema}.session_streams, ${schema}.schema_migrations FROM ${r}`
            )
            .catch(() => undefined)
          await admin
            .query(`REVOKE USAGE ON SCHEMA ${schema} FROM ${r}`)
            .catch(() => undefined)
          await admin.query(`DROP ROLE IF EXISTS ${r}`)
        }
      }
      await expect(open(readPool as never, `nope_${suffix}`)).rejects.toThrow(
        /tables are missing/
      )
      await expect(open(readPool as never, bare)).rejects.toThrow(
        /column writer_lock_id is missing/
      )
      await admin.query(
        `UPDATE ${schema}.schema_migrations SET checksum='x' WHERE version='0034_session_writer_ownership'`
      )
      try {
        await expect(open(readPool as never)).rejects.toThrow(
          /checksum differs/
        )
      } finally {
        const { createHash } = await import('node:crypto')
        const { readPostgresMigrationSql } =
          await import('../postgres-migrations.ts')
        const sum = createHash('sha256')
          .update(
            await readPostgresMigrationSql('0034_session_writer_ownership')
          )
          .digest('hex')
        await admin.query(
          `UPDATE ${schema}.schema_migrations SET checksum=$1 WHERE version='0034_session_writer_ownership'`,
          [sum]
        )
      }
      await admin.query(
        `ALTER TABLE ${schema}.session_events NO FORCE ROW LEVEL SECURITY`
      )
      try {
        await expect(open(readPool as never)).rejects.toThrow(
          /row level security/
        )
      } finally {
        await admin.query(
          `ALTER TABLE ${schema}.session_events FORCE ROW LEVEL SECURITY`
        )
      }
      await admin.query(
        `ALTER TABLE ${schema}.session_streams DISABLE TRIGGER session_streams_writer_guard`
      )
      try {
        await expect(open(readPool as never)).rejects.toThrow(
          /trigger session_streams_writer_guard is not enabled/
        )
      } finally {
        await admin.query(
          `ALTER TABLE ${schema}.session_streams ENABLE TRIGGER session_streams_writer_guard`
        )
      }
      for (const [field, value, message] of [
        ['recovery', true, /standby/],
        ['fsync', 'off', /durability/],
        ['fpw', 'off', /durability/],
        ['sync', 'off', /durability/]
      ] as const) {
        const f = forgedPool((sql, result) => {
          if (!sql.includes('pg_is_in_recovery')) return undefined
          return { ...result, rows: [{ ...result.rows[0], [field]: value }] }
        })
        await expect(open(f.pool as never)).rejects.toThrow(message)
      }
    })

    it('creates under SET LOCAL synchronous_commit = on, before the INSERT', async () => {
      const seen: string[] = []
      const svc = await service(
        tenantA,
        2,
        wrapped((sql) => {
          seen.push(sql)
          return undefined
        }, [])
      )
      await (await svc.create(hdr('s1'))).close()
      const sync = seen.findIndex((q) => q.includes('synchronous_commit = on'))
      const insert = seen.findIndex((q) => q.includes('INSERT INTO'))
      expect(sync).toBeGreaterThanOrEqual(0)
      expect(sync).toBeLessThan(insert)
    })
    it('a refused session try-lock at create is AlreadyOwned and leaves no stream behind', async () => {
      const log: string[] = []
      const svc = await service(
        tenantA,
        2,
        wrapped(
          (sql) =>
            sql.includes('pg_try_advisory_lock')
              ? { rows: [{ ok: false }], rowCount: 1 }
              : undefined,
          log
        )
      )
      await expect(svc.create(hdr('s2'))).rejects.toBeInstanceOf(
        SessionAlreadyOwnedError
      )
      expect(log).toContain('destroy')
      expect(
        (
          await admin.query(
            `SELECT count(*) FROM ${schema}.session_streams WHERE session_id='s2'`
          )
        ).rows[0].count
      ).toBe('0')
    })
    it('a refused session try-lock at open is AlreadyOwned', async () => {
      await (await (await service()).create(hdr('s3'))).close()
      const log: string[] = []
      const svc = await service(
        tenantA,
        2,
        wrapped(
          (sql) =>
            sql.includes('pg_try_advisory_lock')
              ? { rows: [{ ok: false }], rowCount: 1 }
              : undefined,
          log
        )
      )
      await expect(svc.open('s3', 'write')).rejects.toBeInstanceOf(
        SessionAlreadyOwnedError
      )
      expect(log).toContain('destroy')
    })
    it.each([
      ['key', { writer_lock_id: 987654 }],
      ['head', { next_sequence: '1' }]
    ])(
      'a %s that moves between the claim and the publish is not published',
      async (_name, patch) => {
        const id = `s4${_name}`
        await seed(id, 2)
        const real = (
          await admin.query(
            `SELECT header_json, writer_lock_id, next_sequence, inherited_event_count, format_version FROM ${schema}.session_streams WHERE session_id=$1`,
            [id]
          )
        ).rows[0]
        const log: string[] = []
        const svc = await service(
          tenantA,
          2,
          wrapped(
            (sql, calls) =>
              sql.includes('writer_lock_id, header_json') && calls === 2
                ? { rows: [{ ...real, ...patch }], rowCount: 1 }
                : undefined,
            log
          )
        )
        await expect(svc.open(id, 'write')).rejects.toBeInstanceOf(
          SessionPersistenceCorruptionError
        )
        expect(log).toContain('destroy')
      }
    )
    it('an unsupported stored format version is reported as such', async () => {
      await seed('s5', 0)
      const real = (
        await admin.query(
          `SELECT header_json, writer_lock_id, next_sequence, inherited_event_count FROM ${schema}.session_streams WHERE session_id='s5'`
        )
      ).rows[0]
      const svc = await service(
        tenantA,
        2,
        wrapped(
          (sql) =>
            sql.includes('writer_lock_id, header_json')
              ? { rows: [{ ...real, format_version: 2 }], rowCount: 1 }
              : undefined,
          []
        )
      )
      await expect(svc.open('s5', 'write')).rejects.toMatchObject({
        name: 'SessionFormatUnsupportedError'
      })
    })
    it('a seeded cut that moves is not published and is corruption under a live reader', async () => {
      const svc = await service()
      await (
        await svc.create(hdr('s6', { isSeeded: true }), {
          inheritedEventCount: 7
        })
      ).close()
      const real = (
        await admin.query(
          `SELECT header_json, writer_lock_id, next_sequence, inherited_event_count, format_version FROM ${schema}.session_streams WHERE session_id='s6'`
        )
      ).rows[0]
      const log: string[] = []
      const forged = await service(
        tenantA,
        2,
        wrapped(
          (sql, calls) =>
            sql.includes('writer_lock_id, header_json') && calls === 2
              ? { rows: [{ ...real, inherited_event_count: '8' }], rowCount: 1 }
              : undefined,
          log
        )
      )
      await expect(forged.open('s6', 'write')).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      expect(log).toContain('destroy')
      const r = await svc.open('s6', 'read')
      expect(r.inheritedEventCount).toBe(7)
      await tamper('s6', 'inherited_event_count=8')
      await expect(r.read()).rejects.toThrow(/header changed/)
      await r.close()
    })
    it('refuses a head that regresses, and keeps the high-water mark across reads', async () => {
      await seed('s7', 3)
      let shrink = false
      const f = withForgedRead((sql, result) =>
        shrink && sql.includes('next_sequence, format_version')
          ? { ...result, rows: [{ ...result.rows[0], next_sequence: '3' }] }
          : undefined
      )
      const r = await (await f.svc).open('s7', 'read')
      expect((await r.read()).events).toHaveLength(3)
      shrink = true
      await expect(r.read()).rejects.toThrow(/regressed/)
      await r.close()
    })
    it('refuses a gap in the prefix, and corruption beyond a short slice', async () => {
      await seed('s8', 3)
      const svc = await service()
      const r = await svc.open('s8', 'read')
      await admin.query('BEGIN')
      await admin.query(
        `ALTER TABLE ${schema}.session_events DISABLE TRIGGER USER`
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_streams DISABLE TRIGGER USER`
      )
      await admin.query(
        `DELETE FROM ${schema}.session_events WHERE session_id='s8' AND sequence=2`
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_events ENABLE TRIGGER USER`
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_streams ENABLE TRIGGER USER`
      )
      await admin.query('COMMIT')
      await expect(r.read(0, 1)).rejects.toThrow(/gap/)
      await r.close()
      await seed('s9', 3)
      const r2 = await svc.open('s9', 'read')
      await admin.query('BEGIN')
      await admin.query(
        `ALTER TABLE ${schema}.session_events DISABLE TRIGGER USER`
      )
      await admin.query(
        `UPDATE ${schema}.session_events SET input_digest=$1 WHERE session_id='s9' AND sequence=3`,
        ['e'.repeat(64)]
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_events ENABLE TRIGGER USER`
      )
      await admin.query('COMMIT')
      await expect(r2.read(0, 1)).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      await r2.close()
    })

    it('reads in a repeatable-read snapshot and in pages of 256', async () => {
      await seed('p1', 300)
      const f = withForgedRead(() => undefined)
      const r = await (await f.svc).open('p1', 'read')
      f.log.length = 0
      expect((await r.read()).events).toHaveLength(300)
      expect(f.log.some((q) => q.includes('REPEATABLE READ READ ONLY'))).toBe(
        true
      )
      expect(
        f.log.filter((q) => q.includes('FROM') && q.includes('session_events'))
      ).toHaveLength(2)
      await r.close()
    })
    it.each([
      ['sequence', (r: any) => ({ ...r, sequence: r.sequence + 10 })],
      ['tenant', (r: any) => ({ ...r, tenantId: tenantB })],
      ['session', (r: any) => ({ ...r, sessionId: 'someone-else' })]
    ])(
      'refuses a stored event whose %s differs from its place',
      async (_n, forge) => {
        await seed(`f1${_n}`, 2)
        const f = withForgedRead((sql, result) =>
          sql.includes('FROM') && sql.includes('session_events')
            ? {
                ...result,
                rows: result.rows.map((row: any, i: number) =>
                  i === 0 ? { ...row, record: forge(row.record) } : row
                )
              }
            : undefined
        )
        const r = await (await f.svc).open(`f1${_n}`, 'read')
        await expect(r.read()).rejects.toBeInstanceOf(
          SessionPersistenceCorruptionError
        )
        await r.close()
      }
    )
    it('a reader refuses append and flush as read-only, a writer after loss as lost', async () => {
      const svc = await service()
      await (await svc.create(hdr('ro1'))).close()
      const r = await svc.open('ro1', 'read')
      await expect(r.append([])).rejects.toMatchObject({
        name: 'SessionReadOnlyError'
      })
      await expect(r.flush()).rejects.toMatchObject({
        name: 'SessionReadOnlyError'
      })
      await r.close()
    })
    it('a lease reports a loss that happened before the listener was added, and releases once', async () => {
      const lease = await physical.acquire({ timeoutMs: 3000 })
      expect(lease.release()).toBe(lease.release())
      const other = await physical.acquire({ timeoutMs: 3000 })
      await admin.query('SELECT pg_terminate_backend($1)', [other.backendPid])
      await new Promise((r) => setTimeout(r, 400))
      const lost = await new Promise<Error>((resolve) => other.onLost(resolve))
      expect(lost).toBeInstanceOf(Error)
      await other.destroy()
    })
    it('a lease that lands after its deadline is destroyed by the adapter', async () => {
      const late = `${role}_late`
      await admin.query(
        `CREATE ROLE ${late} LOGIN NOSUPERUSER PASSWORD '${password}'`
      )
      try {
        const u = new URL(url!)
        u.username = late
        u.password = password
        const pool = createPgPhysicalSessionPool({
          connectionString: u.toString()
        })
        const count = async () =>
          Number(
            (
              await admin.query(
                `SELECT count(*) FROM pg_stat_activity WHERE usename=$1`,
                [late]
              )
            ).rows[0].count
          )
        for (let i = 0; i < 3; i++)
          await expect(pool.acquire({ timeoutMs: 1 })).rejects.toThrow(
            /timed out/
          )
        await waitFor(async () => (await count()) === 0)
        const kept = await pool.acquire({ timeoutMs: 3000 })
        expect(await count()).toBe(1)
        await kept.release()
      } finally {
        await admin.query(`DROP ROLE IF EXISTS ${late}`)
      }
    })
    it('validates every page of a long prefix, also beyond a short slice', async () => {
      await seed('s10', 300)
      const svc = await service()
      const r = await svc.open('s10', 'read')
      await admin.query('BEGIN')
      await admin.query(
        `ALTER TABLE ${schema}.session_events DISABLE TRIGGER USER`
      )
      await admin.query(
        `UPDATE ${schema}.session_events SET input_digest=$1 WHERE session_id='s10' AND sequence=290`,
        ['d'.repeat(64)]
      )
      await admin.query(
        `ALTER TABLE ${schema}.session_events ENABLE TRIGGER USER`
      )
      await admin.query('COMMIT')
      await expect(r.read(0, 1)).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
      await r.close()
    })
  })
})
