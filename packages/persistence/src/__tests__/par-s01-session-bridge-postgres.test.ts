// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- driver wrappers and forged handles in negative tests */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  PolicyEngine,
  SessionEventAppend,
  SessionHandle
} from '@cvg/harness-contracts'
import { createSdk } from '@cvg/sdk'
import { sessionEventInputDigest } from '@cvg/harness'
import {
  PostgresSessionEventStore,
  runSessionEventMigrations
} from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  sessionEventStoreForHandle,
  type PostgresPhysicalSessionPool
} from '../session-persistence.ts'

// PAR-S01 slice 5: the SDK bridge over one writer handle (SPEC 0221 §8).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars01b_${suffix}`
const role = `pars01b_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenant = 'tenant-synthetic-A'
const hdr = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})
const input = (
  sessionId: string,
  eventId: string,
  text = eventId,
  tenantId = tenant
): SessionEventAppend => ({
  tenantId,
  sessionId,
  formatVersion: 1,
  eventId,
  timestamp: '2026-10-29T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic',
  type: 'message/user',
  payload: { text }
})

let admin: Client
let readPool: Pool
let roleUrl: string
let physical: PostgresPhysicalSessionPool
const service = (pool = physical) =>
  createPostgresSessionPersistence(pool, readPool, {
    tenantId: tenant,
    schemaName: schema,
    maxOpenWriters: 6,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)
const rows = async (id: string) =>
  (
    await admin.query(
      `SELECT sequence, event_id FROM ${schema}.session_events WHERE session_id=$1 ORDER BY sequence`,
      [id]
    )
  ).rows
const cursor = async (id: string) =>
  Number(
    (
      await admin.query(
        `SELECT next_sequence FROM ${schema}.session_streams WHERE session_id=$1`,
        [id]
      )
    ).rows[0].next_sequence
  )
const wrapped = (log: string[]): PostgresPhysicalSessionPool => {
  const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
  return {
    acquire: async (o) => {
      const lease = await inner.acquire(o)
      return {
        backendPid: lease.backendPid,
        query: (sql: string, v?: unknown[]) => {
          log.push(sql)
          return lease.query(sql, v)
        },
        onLost: (l) => lease.onLost(l),
        release: () => lease.release(),
        destroy: () => lease.destroy()
      }
    }
  }
}

describe.skipIf(!url)('PAR-S01 slice 5: sessionEventStoreForHandle', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runSessionEventMigrations(admin, { schemaName: schema })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT ON ${schema}.session_events, ${schema}.session_streams TO ${role}`
    )
    await admin.query(
      `GRANT UPDATE (next_sequence) ON ${schema}.session_streams TO ${role}`
    )
    await admin.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`)
    const u = new URL(url!)
    u.username = role
    u.password = password
    roleUrl = u.toString()
    readPool = new Pool({ connectionString: roleUrl, max: 6 })
    physical = createPgPhysicalSessionPool({ connectionString: roleUrl })
  })
  afterAll(async () => {
    await readPool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  describe('which handles are accepted', () => {
    it('accepts only a genuine, active writer handle of the factory; everything else is a synchronous TypeError', async () => {
      const svc = await service()
      const w = await svc.create(hdr('h1'))
      const store = sessionEventStoreForHandle(w)
      expect(store).toBeDefined()
      const reader = await svc.open('h1', 'read')
      const forged: unknown[] = [
        reader,
        new Proxy(w, {}),
        { ...w },
        Object.create(w),
        {
          id: 'h1',
          access: 'write',
          header: w.header,
          inheritedEventCount: 0,
          read: w.read.bind(w),
          append: w.append.bind(w),
          flush: w.flush.bind(w),
          close: w.close.bind(w),
          [Symbol.asyncDispose]: w.close.bind(w)
        },
        {},
        null,
        undefined,
        'h1'
      ]
      for (const handle of forged)
        expect(() =>
          sessionEventStoreForHandle(handle as SessionHandle)
        ).toThrow(TypeError)
      await reader.close()
      const closing = w.close()
      expect(() => sessionEventStoreForHandle(w)).toThrow(TypeError)
      await closing
      expect(() => sessionEventStoreForHandle(w)).toThrow(TypeError)
    })
    it('refuses a lost writer', async () => {
      const svc = await service()
      const w = await svc.create(hdr('h2'))
      const pid = (
        await admin.query(
          `SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id='h2')::oid`
        )
      ).rows[0].pid
      await admin.query('SELECT pg_terminate_backend($1)', [pid])
      await expect(w.flush()).rejects.toBeDefined()
      expect(() => sessionEventStoreForHandle(w)).toThrow(TypeError)
      await w.close()
    })
    it('does no IO to decide', async () => {
      const log: string[] = []
      const svc = await service(wrapped(log))
      const w = await svc.create(hdr('h3'))
      log.length = 0
      sessionEventStoreForHandle(w)
      expect(() => sessionEventStoreForHandle({} as never)).toThrow(TypeError)
      expect(log).toEqual([])
      await w.close()
    })
  })

  describe('openSession', () => {
    it('only verifies tenant, id and version of this handle: idempotent, never creates', async () => {
      const svc = await service()
      const w = await svc.create(hdr('o1'))
      const store = sessionEventStoreForHandle(w)
      const stream = {
        tenantId: tenant,
        sessionId: 'o1',
        formatVersion: 1
      } as const
      const before = Number(
        (await admin.query(`SELECT count(*) FROM ${schema}.session_streams`))
          .rows[0].count
      )
      expect(await store.openSession(stream)).toEqual(stream)
      expect(await store.openSession(stream)).toEqual(stream)
      await expect(
        store.openSession({ ...stream, tenantId: 'other' })
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      await expect(
        store.openSession({ ...stream, sessionId: 'other-session' })
      ).rejects.toMatchObject({ code: 'session_not_open' })
      await expect(
        store.openSession({ ...stream, formatVersion: 2 } as never)
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      expect(
        Number(
          (await admin.query(`SELECT count(*) FROM ${schema}.session_streams`))
            .rows[0].count
        )
      ).toBe(before)
      await w.close()
    })
  })

  describe('append', () => {
    it('assigns consecutive sequences and fingerprints with the CVG helpers, readable by the legacy store', async () => {
      const w = await (await service()).create(hdr('a1'))
      const store = sessionEventStoreForHandle(w)
      const e1 = await store.append(input('a1', 'x1'))
      const e2 = await store.append(input('a1', 'x2'))
      expect([e1.sequence, e2.sequence]).toEqual([1, 2])
      expect(await cursor('a1')).toBe(3)
      await w.close()
      const legacy = new PostgresSessionEventStore(readPool, {
        tenantId: tenant,
        schemaName: schema
      })
      expect(await legacy.read({ tenantId: tenant, sessionId: 'a1' })).toEqual([
        e1,
        e2
      ])
      const stored = (
        await admin.query(
          `SELECT input_digest FROM ${schema}.session_events WHERE session_id='a1' AND sequence=1`
        )
      ).rows[0]
      expect(stored.input_digest).toBe(
        sessionEventInputDigest(input('a1', 'x1'))
      )
    })
    it('an identical replay returns the earlier fact and mutates nothing; a different input is a conflict', async () => {
      const log: string[] = []
      const w = await (await service(wrapped(log))).create(hdr('a2'))
      const store = sessionEventStoreForHandle(w)
      const first = await store.append(input('a2', 'r1'))
      const walBefore = (
        await admin.query(`SELECT pg_current_wal_insert_lsn() AS l`)
      ).rows[0].l
      log.length = 0
      const again = await store.append(input('a2', 'r1'))
      expect(again).toEqual(first)
      expect(
        log.some((q) => q.includes('INSERT INTO') || q.includes('UPDATE'))
      ).toBe(false)
      expect(await cursor('a2')).toBe(2)
      expect((await rows('a2')).length).toBe(1)
      void walBefore
      await expect(
        store.append(input('a2', 'r1', 'different'))
      ).rejects.toMatchObject({ code: 'session_event_conflict' })
      expect((await rows('a2')).length).toBe(1)
      await w.close()
    })
    it('refuses wrong envelope and invalid input before any IO', async () => {
      const log: string[] = []
      const w = await (await service(wrapped(log))).create(hdr('a3'))
      const store = sessionEventStoreForHandle(w)
      log.length = 0
      await expect(
        store.append(input('a3', 'v1', 'x', 'other-tenant'))
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      await expect(store.append(input('another', 'v2'))).rejects.toMatchObject({
        code: 'session_not_open'
      })
      await expect(
        store.append({ ...input('a3', 'v3'), type: 'nope' } as never)
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      await expect(
        store.append({
          ...input('a3', 'v4'),
          payload: { n: Number.NaN }
        } as never)
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      expect(log).toEqual([])
      await w.close()
    })
    it('is one transaction on the owner connection: lookup, sequence, INSERT and cursor together, one COMMIT', async () => {
      const log: string[] = []
      const w = await (await service(wrapped(log))).create(hdr('a4'))
      const store = sessionEventStoreForHandle(w)
      log.length = 0
      await store.append(input('a4', 'one'))
      expect(log.filter((q) => q === 'BEGIN')).toHaveLength(1)
      expect(log.filter((q) => q === 'COMMIT')).toHaveLength(1)
      const order = [
        'next_sequence, format_version',
        'event_id=$3',
        'INSERT INTO',
        'UPDATE'
      ]
      const at = order.map((frag) => log.findIndex((q) => q.includes(frag)))
      expect(at.every((i) => i >= 0)).toBe(true)
      expect([...at].sort((a, b) => a - b)).toEqual(at)
      expect(log.some((q) => q.includes('REPEATABLE READ'))).toBe(false)
      await w.close()
    })
    it('two adapters of one handle share its single queue: contiguous sequences, one fact per duplicate', async () => {
      const w = await (await service()).create(hdr('a5'))
      const a = sessionEventStoreForHandle(w)
      const b = sessionEventStoreForHandle(w)
      const out = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          (i % 2 ? a : b).append(input('a5', `c${i}`))
        )
      )
      expect(out.map((e) => e.sequence)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10
      ])
      const dup = await Promise.all([
        a.append(input('a5', 'same')),
        b.append(input('a5', 'same'))
      ])
      expect(dup[0]).toEqual(dup[1])
      expect((await rows('a5')).length).toBe(11)
      expect(await cursor('a5')).toBe(12)
      await w.close()
    })
    it('orders adapter, direct append, flush and close on that queue; a direct stale sequence fails and is never renumbered', async () => {
      const w = await (await service()).create(hdr('a6'))
      const store = sessionEventStoreForHandle(w)
      const direct: any = await sessionEventStoreForHandle(w).append(
        input('a6', 'seed')
      )
      const p1 = store.append(input('a6', 'b1'))
      const p2 = w.append([
        {
          ...direct,
          sequence: 3,
          eventId: 'direct3',
          schemaFingerprint: direct.schemaFingerprint
        }
      ])
      const p3 = store.append(input('a6', 'b3'))
      const p4 = w.append([{ ...direct, sequence: 2, eventId: 'stale' }])
      const settled = await Promise.allSettled([p1, p2, p3, p4])
      expect(settled.map((s) => s.status)).toEqual([
        'fulfilled',
        'fulfilled',
        'fulfilled',
        'rejected'
      ])
      await w.flush()
      expect((await rows('a6')).map((r) => r.event_id)).toEqual([
        'seed',
        'b1',
        'direct3',
        'b3'
      ])
      await w.close()
    })
  })

  describe('read', () => {
    it('translates afterSequence (exclusive) and limit, and refuses a bad range', async () => {
      const w = await (await service()).create(hdr('r1'))
      const store = sessionEventStoreForHandle(w)
      for (let i = 1; i <= 5; i++) await store.append(input('r1', `e${i}`))
      const base = { tenantId: tenant, sessionId: 'r1' }
      expect(
        (await store.read({ ...base, afterSequence: 2, limit: 2 })).map(
          (e) => e.sequence
        )
      ).toEqual([3, 4])
      expect((await store.read(base)).map((e) => e.sequence)).toEqual([
        1, 2, 3, 4, 5
      ])
      expect(await store.read({ ...base, afterSequence: 5 })).toEqual([])
      await expect(store.read({ ...base, limit: 501 })).rejects.toMatchObject({
        code: 'invalid_session_event'
      })
      await expect(
        store.read({ ...base, afterSequence: -1 })
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      await expect(
        store.read({ ...base, tenantId: 'other' })
      ).rejects.toMatchObject({ code: 'invalid_session_event' })
      await expect(
        store.read({ ...base, sessionId: 'other' })
      ).rejects.toMatchObject({ code: 'session_not_open' })
      await w.close()
    })
  })

  describe('failures map to the old codes without retrying', () => {
    it('after close or loss every call is session_storage_unavailable', async () => {
      const w = await (await service()).create(hdr('f1'))
      const store = sessionEventStoreForHandle(w)
      await store.append(input('f1', 'ok'))
      await w.close()
      await expect(store.append(input('f1', 'late'))).rejects.toMatchObject({
        code: 'session_storage_unavailable'
      })
      await expect(
        store.read({ tenantId: tenant, sessionId: 'f1' })
      ).rejects.toMatchObject({ code: 'session_storage_unavailable' })
      await expect(
        store.openSession({
          tenantId: tenant,
          sessionId: 'f1',
          formatVersion: 1
        })
      ).rejects.toMatchObject({ code: 'session_storage_unavailable' })
      expect((await rows('f1')).length).toBe(1)
    })
    it('an unknown COMMIT is session_storage_unavailable, is attempted once, and loses the handle', async () => {
      let armed = false
      const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
      const inserts: string[] = []
      const flaky: PostgresPhysicalSessionPool = {
        acquire: async (o) => {
          const lease = await inner.acquire(o)
          return {
            backendPid: lease.backendPid,
            query: (sql: string, v?: unknown[]) => {
              if (sql.includes('INSERT INTO') && sql.includes('session_events'))
                inserts.push(sql)
              return armed && sql === 'COMMIT'
                ? Promise.reject(new Error('lost ack'))
                : lease.query(sql, v)
            },
            onLost: (l) => lease.onLost(l),
            release: () => lease.release(),
            destroy: () => lease.destroy()
          }
        }
      }
      const w = await (await service(flaky)).create(hdr('f2'))
      const store = sessionEventStoreForHandle(w)
      armed = true
      await expect(store.append(input('f2', 'u1'))).rejects.toMatchObject({
        code: 'session_storage_unavailable'
      })
      expect(inserts).toHaveLength(1)
      await expect(store.append(input('f2', 'u1'))).rejects.toMatchObject({
        code: 'session_storage_unavailable'
      })
      expect(inserts).toHaveLength(1)
      armed = false
      await w.close().catch(() => undefined)
    })
  })

  describe('with the real SDK', () => {
    const allow: PolicyEngine = {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic',
        policyVersion: 'p1'
      })
    }
    const deny: ApprovalEngine = {
      request: async () => ({ status: 'DENIED', reason: 'synthetic' })
    }
    const sdkOver = (
      store: ReturnType<typeof sessionEventStoreForHandle>,
      prefix: string
    ) => {
      let n = 0
      return createSdk({
        tenantId: tenant,
        modelGateway: {
          complete: async () => ({
            text: 'synthetic reply',
            provider: 'deterministic',
            model: 'deterministic-v1',
            inputTokens: 2,
            outputTokens: 3,
            costUsd: 0
          })
        },
        policy: allow,
        approvals: deny,
        sessions: store,
        clock: () => new Date('2026-10-29T00:00:00.000Z'),
        newEventId: () => `${prefix}_${(n += 1)}`,
        newCorrelationId: () => 'corr_sdk',
        newTraceId: () => 'trace_sdk'
      })
    }
    it('runs a real turn through SDK, kernel and session on PostgreSQL, and a second owner continues the same log', async () => {
      const svc = await service()
      const w = await svc.create(hdr('sdk1'))
      const sdk = sdkOver(sessionEventStoreForHandle(w), 'first')
      await sdk.openSession('sdk1')
      const turn = await sdk.sendTurn('sdk1', 'hello')
      expect(turn).toBeDefined()
      const events = await sdk.readEvents('sdk1')
      expect(events.length).toBeGreaterThan(0)
      expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i + 1))
      await w.flush()
      await w.close()
      // A second owner (a new handle, as after a restart) reads the identical prefix and continues it.
      const w2 = await svc.open('sdk1', 'write')
      const sdk2 = sdkOver(sessionEventStoreForHandle(w2), 'second')
      await sdk2.openSession('sdk1')
      expect(await sdk2.readEvents('sdk1')).toEqual(events)
      await sdk2.sendTurn('sdk1', 'again')
      const all = await sdk2.readEvents('sdk1')
      expect(all.slice(0, events.length)).toEqual(events)
      expect(all.length).toBeGreaterThan(events.length)
      expect(all.map((e) => e.sequence)).toEqual(all.map((_, i) => i + 1))
      const legacy = new PostgresSessionEventStore(readPool, {
        tenantId: tenant,
        schemaName: schema
      })
      expect(
        await legacy.read({ tenantId: tenant, sessionId: 'sdk1', limit: 500 })
      ).toEqual(all)
      await w2.close()
    })
    it('a second writer cannot run turns on a session that has an owner', async () => {
      const svc = await service()
      const w = await svc.create(hdr('sdk2'))
      await expect(svc.open('sdk2', 'write')).rejects.toMatchObject({
        name: 'SessionAlreadyOwnedError'
      })
      const sdk = sdkOver(sessionEventStoreForHandle(w), 'solo')
      await sdk.openSession('sdk2')
      await sdk.sendTurn('sdk2', 'one')
      await w.close()
    })
    it('captures the input at the call: a later mutation cannot change what is stored', async () => {
      const w = await (await service()).create(hdr('a7'))
      const store = sessionEventStoreForHandle(w)
      const blocker = store.append(input('a7', 'first'))
      const mutable: any = input('a7', 'second', 'original')
      const pending = store.append(mutable)
      mutable.payload.text = 'mutated'
      mutable.eventId = 'mutated'
      await Promise.all([blocker, pending])
      const stored = await store.read({ tenantId: tenant, sessionId: 'a7' })
      expect(stored[1]).toMatchObject({
        eventId: 'second',
        payload: { text: 'original' }
      })
      await w.close()
    })
    it('a stream that is gone from the database is session_not_open, not a generic failure', async () => {
      const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
      const gone: PostgresPhysicalSessionPool = {
        acquire: async (o) => {
          const lease = await inner.acquire(o)
          return {
            backendPid: lease.backendPid,
            query: (sql: string, v?: unknown[]) =>
              sql.includes('next_sequence, format_version') &&
              sql.includes('FROM')
                ? Promise.resolve({ rows: [], rowCount: 0 } as never)
                : lease.query(sql, v),
            onLost: (l) => lease.onLost(l),
            release: () => lease.release(),
            destroy: () => lease.destroy()
          }
        }
      }
      const w = await (await service(gone)).create(hdr('a8'))
      await expect(
        sessionEventStoreForHandle(w).append(input('a8', 'x'))
      ).rejects.toMatchObject({ code: 'session_not_open' })
      await w.close()
    })
  })
})
