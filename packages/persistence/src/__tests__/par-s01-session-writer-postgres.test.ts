// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- driver wrappers in negative tests */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
import {
  SessionAppendConflictError,
  SessionCommitUnknownError,
  SessionHandleClosedError,
  SessionHeaderValidationError,
  SessionOwnershipLostError,
  SessionReadOnlyError,
  materializeSessionEvent,
  sessionEventInputDigest
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

// PAR-S01 slice 4: append, flush, close, LOST and commit-unknown (SPEC 0221 §6-§7).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars01w_${suffix}`
const role = `pars01w_role_${suffix}`
const password = 'pars01-synthetic-only'
const tenant = 'tenant-synthetic-A'
const hdr = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})
const ev = (
  sessionId: string,
  sequence: number,
  eventId = `e${sequence}`,
  text = eventId
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: tenant,
      sessionId,
      formatVersion: 1,
      eventId,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId: 'corr-synthetic',
      traceId: 'trace-synthetic',
      type: 'message/user',
      payload: { text }
    },
    sequence
  )

let admin: Client
let readPool: Pool
let roleUrl: string
let physical: PostgresPhysicalSessionPool
const service = (maxOpenWriters = 4, pool = physical) =>
  createPostgresSessionPersistence(pool, readPool, {
    tenantId: tenant,
    schemaName: schema,
    maxOpenWriters,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)
const stored = async (id: string) =>
  (
    await admin.query(
      `SELECT sequence, event_id, input_digest FROM ${schema}.session_events WHERE session_id=$1 ORDER BY sequence`,
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
async function holders(id: string): Promise<number> {
  return (
    await admin.query(
      `SELECT count(*)::int AS n FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted
       AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid
       AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id=$1)::oid`,
      [id]
    )
  ).rows[0].n
}
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('condition not reached')
}
/** Wraps the real lease: `rule` may replace the answer or reject for a statement. */
const wrapped = (
  rule: (sql: string, n: Map<string, number>) => unknown | undefined,
  log: string[]
): PostgresPhysicalSessionPool => {
  const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
  return {
    acquire: async (o) => {
      const lease = await inner.acquire(o)
      const n = new Map<string, number>()
      return {
        backendPid: lease.backendPid,
        query: async (sql: string, v?: unknown[]) => {
          log.push(sql)
          n.set(sql, (n.get(sql) ?? 0) + 1)
          const forced = rule(sql, n)
          if (forced instanceof Error) throw forced
          return (forced ?? (await lease.query(sql, v))) as never
        },
        onLost: (l) => lease.onLost(l),
        release: async () => {
          log.push('<release>')
          await lease.release()
        },
        destroy: async () => {
          log.push('<destroy>')
          await lease.destroy()
        }
      }
    }
  }
}

describe.skipIf(!url)('PAR-S01 slice 4: append, flush, close, loss', () => {
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

  describe('append', () => {
    it('stores a batch atomically in order, readable by the writer, by another process and by the legacy store', async () => {
      const svc = await service()
      const w = await svc.create(hdr('a1'))
      const batch = [ev('a1', 1), ev('a1', 2), ev('a1', 3)]
      await w.append(batch)
      expect((await stored('a1')).map((r) => r.sequence)).toEqual([
        '1',
        '2',
        '3'
      ])
      expect(await cursor('a1')).toBe(4)
      expect((await w.read()).events).toEqual(batch)
      const other = await (await service()).open('a1', 'read')
      expect((await other.read()).events).toEqual(batch)
      const rows = await stored('a1')
      const { sequence: _s, schemaFingerprint: _f, ...input } = batch[0]!
      void _s
      void _f
      expect(rows[0]!.input_digest).toBe(sessionEventInputDigest(input))
      await w.close()
      const legacy = new PostgresSessionEventStore(readPool, {
        tenantId: tenant,
        schemaName: schema
      })
      expect(await legacy.read({ tenantId: tenant, sessionId: 'a1' })).toEqual(
        batch
      )
      const next = await legacy.append({
        ...input,
        eventId: 'legacy',
        payload: { text: 'legacy' }
      })
      expect(next.sequence).toBe(4)
      await other.close()
    })
    it('admits tickets in call order on the single queue and keeps the handle usable after a refusal', async () => {
      const w = await (await service()).create(hdr('a2'))
      const p = [
        w.append([ev('a2', 1)]),
        w.append([ev('a2', 2)]),
        w.append([ev('a2', 5)]),
        w.append([ev('a2', 3)])
      ]
      const settled = await Promise.allSettled(p)
      expect(settled.map((s) => s.status)).toEqual([
        'fulfilled',
        'fulfilled',
        'rejected',
        'fulfilled'
      ])
      expect((settled[2] as PromiseRejectedResult).reason).toBeInstanceOf(
        SessionAppendConflictError
      )
      expect((await stored('a2')).map((r) => r.sequence)).toEqual([
        '1',
        '2',
        '3'
      ])
      await w.close()
    })
    it('refuses a stale sequence, a gap in the batch and a reused event id, rolling the whole batch back', async () => {
      const w = await (await service()).create(hdr('a3'))
      await w.append([ev('a3', 1)])
      await expect(w.append([ev('a3', 1, 'again')])).rejects.toThrow(
        /stream cursor/
      )
      await expect(w.append([ev('a3', 2), ev('a3', 4)])).rejects.toBeInstanceOf(
        SessionAppendConflictError
      )
      await expect(
        w.append([ev('a3', 2, 'fresh'), ev('a3', 3, 'e1')])
      ).rejects.toBeInstanceOf(SessionAppendConflictError)
      expect((await stored('a3')).map((r) => r.event_id)).toEqual(['e1'])
      expect(await cursor('a3')).toBe(2)
      await w.append([ev('a3', 2)])
      expect(await cursor('a3')).toBe(3)
      await w.close()
    })
    it('validates the batch before any IO: envelope, schema, size', async () => {
      const w = await (await service()).create(hdr('a4'))
      const bad = [
        [{ ...ev('a4', 1), tenantId: 'someone-else' }],
        [{ ...ev('a4', 1), sessionId: 'other-session' }],
        [{ ...ev('a4', 1), schemaFingerprint: 'f'.repeat(64) }],
        [{ ...ev('a4', 1), payload: { n: Number.NaN } }],
        [{ ...ev('a4', 1), payload: { text: 'x'.repeat(1024 * 1024) } }]
      ]
      for (const events of bad)
        await expect(w.append(events as never)).rejects.toBeInstanceOf(
          SessionHeaderValidationError
        )
      await expect(w.append('nope' as never)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
      const big = Array.from({ length: 130 }, (_, i) =>
        ev('a4', i + 1, `big${i}`, 'x'.repeat(65_536))
      )
      await expect(w.append(big)).rejects.toThrow(/8 MiB/)
      expect(await stored('a4')).toEqual([])
      expect(await cursor('a4')).toBe(1)
      await w.close()
    })
    it('captures the batch once at admission: later mutation or a getter cannot change what is stored', async () => {
      const w = await (await service()).create(hdr('a5'))
      const event: any = ev('a5', 1, 'cap', 'original')
      const pending = w.append([event])
      event.payload.text = 'mutated'
      event.eventId = 'mutated'
      await pending
      expect((await w.read()).events[0]).toMatchObject({
        eventId: 'cap',
        payload: { text: 'original' }
      })
      let reads = 0
      const ab: any = ev('a5', 2, 'ab')
      Object.defineProperty(ab, 'payload', {
        enumerable: true,
        get: () => ({ text: ++reads === 1 ? 'first' : 'second' })
      })
      await w.append([ab])
      expect(reads).toBe(1)
      expect((await w.read()).events[1]).toMatchObject({
        payload: { text: 'first' }
      })
      await w.close()
    })
    it('an empty batch is a valid no-op on an active writer and gets no exception elsewhere', async () => {
      const svc = await service()
      const w = await svc.create(hdr('a6'))
      await expect(w.append([])).resolves.toBeUndefined()
      expect(await stored('a6')).toEqual([])
      const r = await svc.open('a6', 'read')
      await expect(r.append([])).rejects.toBeInstanceOf(SessionReadOnlyError)
      await expect(r.flush()).rejects.toBeInstanceOf(SessionReadOnlyError)
      await w.close()
      await expect(w.append([])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
      await r.close()
      await expect(r.append([])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
    })
    it('abort before IO does not touch the store; abort while queued rejects without IO', async () => {
      const log: string[] = []
      const svc = await service(
        2,
        wrapped(() => undefined, log)
      )
      const w = await svc.create(hdr('a7'))
      log.length = 0
      await expect(
        w.append([ev('a7', 1)], { signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
      await expect(
        w.flush({ signal: AbortSignal.abort() })
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(log).toEqual([])
      const ac = new AbortController()
      const first = w.append([ev('a7', 1)])
      const queued = w.append([ev('a7', 2)], { signal: ac.signal })
      ac.abort()
      await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
      await first
      expect(await cursor('a7')).toBe(2)
      await w.close()
    })
  })

  describe('flush and close', () => {
    it('flush is a real WAL barrier: it updates the cursor to its own value and advances the WAL, even on a fresh empty session', async () => {
      const log: string[] = []
      const svc = await service(
        2,
        wrapped(() => undefined, log)
      )
      const w = await svc.create(hdr('f1'))
      log.length = 0
      const lsn = async () =>
        (
          await admin.query(
            `SELECT pg_current_wal_insert_lsn() - '0/0'::pg_lsn AS n`
          )
        ).rows[0].n
      const before = Number(await lsn())
      await w.flush()
      expect(
        log.some((q) => q.includes('SET next_sequence=next_sequence'))
      ).toBe(true)
      expect(log).toContain('COMMIT')
      expect(log).toContain('SET LOCAL synchronous_commit = on')
      expect(Number(await lsn())).toBeGreaterThan(before)
      const mid = Number(await lsn())
      await w.append([ev('f1', 1)])
      await w.flush()
      expect(Number(await lsn())).toBeGreaterThan(mid)
      expect(await cursor('f1')).toBe(2)
      await w.close()
    })
    it('close drains the admitted queue, flushes, unlocks and releases once, and keeps the facts', async () => {
      const log: string[] = []
      const svc = await service(
        2,
        wrapped(() => undefined, log)
      )
      const w = await svc.create(hdr('c1'))
      log.length = 0
      const a = w.append([ev('c1', 1)])
      const b = w.append([ev('c1', 2)])
      const closing = w.close()
      await expect(w.append([ev('c1', 3)])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
      await Promise.all([a, b, closing])
      expect((await stored('c1')).map((r) => r.sequence)).toEqual(['1', '2'])
      const flush = log.findIndex((q) =>
        q.includes('SET next_sequence=next_sequence')
      )
      const unlock = log.findIndex((q) => q.includes('pg_advisory_unlock'))
      expect(flush).toBeGreaterThan(-1)
      expect(unlock).toBeGreaterThan(flush)
      expect(log.filter((q) => q === '<release>')).toHaveLength(1)
      expect(await holders('c1')).toBe(0)
    })
    it('a failed final flush is not a successful close: the error is kept, the connection destroyed, the slot freed', async () => {
      const log: string[] = []
      const failFlush = wrapped(
        (sql) =>
          sql.includes('SET next_sequence=next_sequence')
            ? Object.assign(new Error('disk'), { code: '53100' })
            : undefined,
        log
      )
      const svc = await service(1, failFlush)
      const w = await svc.create(hdr('c2'))
      const p1 = w.close()
      const p2 = w.close()
      expect(p2).toBe(p1)
      await expect(p1).rejects.toMatchObject({ cause: { code: '53100' } })
      await expect(w.close()).rejects.toMatchObject({
        cause: { code: '53100' }
      })
      expect(log).toContain('<destroy>')
      expect(log).not.toContain('<release>')
      await waitFor(async () => (await holders('c2')) === 0)
      const again = await (
        await service(
          1,
          wrapped(() => undefined, [])
        )
      ).open('c2', 'write')
      await again.close()
    })
    it('a statement failure leaves the handle usable and does not lose ownership', async () => {
      const w = await (await service()).create(hdr('c3'))
      await expect(w.append([ev('c3', 2)])).rejects.toBeInstanceOf(
        SessionAppendConflictError
      )
      expect(await holders('c3')).toBe(1)
      await w.append([ev('c3', 1)])
      await w.close()
    })
  })

  describe('loss and unknown outcome', () => {
    it('an unknown COMMIT of an append is an error, never success: the handle is terminal and close reports it', async () => {
      let armed = false
      const log: string[] = []
      const flaky = wrapped(
        (sql) =>
          armed && sql === 'COMMIT' ? new Error('lost ack') : undefined,
        log
      )
      const svc = await service(1, flaky)
      const w = await svc.create(hdr('u1'))
      armed = true
      await expect(w.append([ev('u1', 1)])).rejects.toBeInstanceOf(
        SessionCommitUnknownError
      )
      await expect(w.append([ev('u1', 1)])).rejects.toBeInstanceOf(
        SessionOwnershipLostError
      )
      await expect(w.flush()).rejects.toBeInstanceOf(SessionOwnershipLostError)
      await expect(w.read()).resolves.toBeDefined()
      expect(log).toContain('<destroy>')
      await waitFor(async () => (await holders('u1')) === 0)
      const c1 = w.close()
      expect(w.close()).toBe(c1)
      await expect(c1).rejects.toBeInstanceOf(SessionCommitUnknownError)
      armed = false
      // Close reported the uncertainty, and the slot came back: capacity 1 is free again.
      const again = await svc.open('u1', 'write')
      await again.close()
    })
    it('a failed ROLLBACK after a statement error makes the handle lost', async () => {
      const failRollback = wrapped(
        (sql) => (sql === 'ROLLBACK' ? new Error('socket') : undefined),
        []
      )
      const w = await (await service(1, failRollback)).create(hdr('u2'))
      await expect(w.append([ev('u2', 2)])).rejects.toBeInstanceOf(
        SessionOwnershipLostError
      )
      await expect(w.append([ev('u2', 1)])).rejects.toBeInstanceOf(
        SessionOwnershipLostError
      )
      await w.close()
      await waitFor(async () => (await holders('u2')) === 0)
    })
    it('losing the physical session during a write is OwnershipLost, never a retry, never a revival', async () => {
      const svc = await service(2)
      const w = await svc.create(hdr('u3'))
      await w.append([ev('u3', 1)])
      const pid = (
        await admin.query(
          `SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id='u3')::oid`
        )
      ).rows[0].pid
      await admin.query('SELECT pg_terminate_backend($1)', [pid])
      await expect(w.append([ev('u3', 2)])).rejects.toBeInstanceOf(
        SessionOwnershipLostError
      )
      await expect(w.flush()).rejects.toBeInstanceOf(SessionOwnershipLostError)
      expect(await cursor('u3')).toBe(2)
      await expect(w.close()).resolves.toBeUndefined()
      const next = await svc.open('u3', 'write')
      await next.append([ev('u3', 2)])
      await expect(w.append([ev('u3', 3)])).rejects.toBeInstanceOf(
        SessionHandleClosedError
      )
      await next.close()
      expect((await stored('u3')).map((r) => r.sequence)).toEqual(['1', '2'])
    })
  })

  describe('visibility across handles', () => {
    it('a read started after an append resolves sees at least that head, on any handle', async () => {
      const svc = await service()
      const w = await svc.create(hdr('v1'))
      const r = await svc.open('v1', 'read')
      expect((await r.read()).events).toHaveLength(0)
      await w.append([ev('v1', 1)])
      expect((await r.read()).events).toHaveLength(1)
      await w.append([ev('v1', 2)])
      const [a, b] = await Promise.all([r.read(), w.read()])
      expect(a.events.length).toBeGreaterThanOrEqual(2)
      expect(b.events).toHaveLength(2)
      await r.close()
      await w.close()
    })
  })

  describe('error classes', () => {
    it('an empty batch does no IO at all', async () => {
      const log: string[] = []
      const w = await (
        await service(
          2,
          wrapped(() => undefined, log)
        )
      ).create(hdr('k0'))
      log.length = 0
      await w.append([])
      expect(log).toEqual([])
      await w.close()
    })
    it.each([
      ['08006', 'connection failure'],
      ['55P03', 'lock not available']
    ])(
      'code %s (%s) during a write makes the handle lost and destroys the connection',
      async (code) => {
        let armed = false
        const log: string[] = []
        const w = await (
          await service(
            2,
            wrapped(
              (sql) =>
                armed && sql.includes('SELECT next_sequence')
                  ? Object.assign(new Error('x'), { code })
                  : undefined,
              log
            )
          )
        ).create(hdr(`k1${code}`))
        armed = true
        await expect(w.append([ev(`k1${code}`, 1)])).rejects.toBeInstanceOf(
          SessionOwnershipLostError
        )
        await expect(w.append([ev(`k1${code}`, 1)])).rejects.toBeInstanceOf(
          SessionOwnershipLostError
        )
        expect(log).toContain('<destroy>')
        armed = false
        await w.close()
      }
    )
    it('another database error is a storage failure and keeps the handle usable', async () => {
      let armed = true
      const w = await (
        await service(
          2,
          wrapped(
            (sql) =>
              armed && sql.includes('SELECT next_sequence')
                ? Object.assign(new Error('disk full'), { code: '53100' })
                : undefined,
            []
          )
        )
      ).create(hdr('k2'))
      await expect(w.append([ev('k2', 1)])).rejects.toMatchObject({
        name: 'SessionStorageUnavailableError'
      })
      armed = false
      await w.append([ev('k2', 1)])
      await w.close()
    })
  })
})
