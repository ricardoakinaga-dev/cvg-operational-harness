// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
import {
  ReadSemaphore,
  SessionEventError,
  materializeSessionEvent,
  tailSessionEvents,
  verifyTailCursor,
  type TailItem
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
import type { PostgresPoolLike } from '../tenant-scoped-postgres.ts'

/**
 * PAR-A01 slice 2 (SPEC 0296 A1, A2, A4, A8, A9): the tail over PostgreSQL. Commit order with the
 * two writers (the S01 writer and the 0028 store), tenant isolation, and the bound on simultaneous
 * reads through a pool of its own. Needs a disposable database through TEST_DATABASE_URL.
 */
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_A01_PG_REQUIRED === '1')
  throw new Error('PAR-A01 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `para01_${suffix}`
const role = `para01_role_${suffix}`
const password = 'para01-synthetic-only'
const tenantA = 'tenant-a01-A'
const tenantB = 'tenant-a01-B'

const hdr = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})
const ev = (
  tenantId: string,
  sessionId: string,
  sequence: number,
  eventId = `e${sequence}`
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId,
      sessionId,
      formatVersion: 1,
      eventId,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId: 'corr-synthetic',
      traceId: 'trace-synthetic',
      type: 'message/user',
      payload: { text: eventId }
    },
    sequence
  )
const input = (e: SessionEvent) => {
  const { sequence, schemaFingerprint, ...rest } = e
  void sequence
  void schemaFingerprint
  return rest
}

let admin: Client
let roleUrl: string
let tailPool: Pool
let physical: PostgresPhysicalSessionPool
let readPool: Pool
const sessions = (tenantId = tenantA) =>
  createPostgresSessionPersistence(physical, readPool, {
    tenantId,
    schemaName: schema,
    maxOpenWriters: 4,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)
// the store is created per request with the tenant of the identity (SPEC 0296 A4)
const tailStore = (tenantId = tenantA, pool: PostgresPoolLike = tailPool) =>
  new PostgresSessionEventStore(pool, { tenantId, schemaName: schema })
const stored = async (sessionId: string) =>
  (
    await admin.query(
      `SELECT sequence FROM ${schema}.session_events WHERE session_id=$1 ORDER BY sequence`,
      [sessionId]
    )
  ).rows.map((r) => Number(r.sequence))
const fast = {
  pollMinMs: 5,
  pollMaxMs: 20,
  retryBackoffMs: 5
}
const drain = async (
  gen: AsyncGenerator<TailItem, void, void>
): Promise<TailItem[]> => {
  const out: TailItem[] = []
  for await (const item of gen) out.push(item)
  return out
}
const seqs = (items: TailItem[]) =>
  items.flatMap((i) => (i.kind === 'event' ? [i.event.sequence] : []))

describe.skipIf(!url)('PAR-A01 slice 2: the tail over PostgreSQL', () => {
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
    // the pool of its own for the tail, apart from the pool of the data routes
    tailPool = new Pool({ connectionString: roleUrl, max: 8 })
    readPool = new Pool({ connectionString: roleUrl, max: 6 })
    physical = createPgPhysicalSessionPool({ connectionString: roleUrl })
  }, 60000)
  afterAll(async () => {
    await tailPool?.end()
    await readPool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  it('A1: an event of a transaction that has not committed does not exist for the tail; after the commit it appears once', async () => {
    const gate: { open: () => void } = { open: () => undefined }
    const opened = new Promise<void>((r) => {
      gate.open = r
    })
    let committing: () => void = () => undefined
    const reachedCommit = new Promise<void>((r) => {
      committing = r
    })
    let armed = false
    const gated: PostgresPhysicalSessionPool = {
      acquire: async (o) => {
        const lease = await physical.acquire(o)
        return {
          backendPid: lease.backendPid,
          query: async (sql: string, v?: unknown[]) => {
            if (armed && sql === 'COMMIT') {
              committing()
              await opened
            }
            return lease.query(sql, v)
          },
          onLost: (l) => lease.onLost(l),
          release: () => lease.release(),
          destroy: () => lease.destroy()
        }
      }
    }
    const svc = (
      await createPostgresSessionPersistence(gated, readPool, {
        tenantId: tenantA,
        schemaName: schema,
        maxOpenWriters: 2,
        acquireTimeoutMs: 3000
      })
    ).service
    const writer = await svc.create(hdr('a1-uncommitted'))
    armed = true
    const pending = writer.append([ev(tenantA, 'a1-uncommitted', 1)])
    await reachedCommit
    const store = tailStore()
    expect(
      await store.read({ tenantId: tenantA, sessionId: 'a1-uncommitted' })
    ).toEqual([])
    gate.open()
    await pending
    const after = await store.read({
      tenantId: tenantA,
      sessionId: 'a1-uncommitted'
    })
    expect(after.map((e) => e.sequence)).toEqual([1])
    await writer.close()
  })

  it('A2: the S01 writer and the 0028 store are mutually exclusive on a session (0034), and each one alone, under concurrency, leaves a dense log that a reader never sees with a hole', async () => {
    const sessionId = 'a2-race'
    const legacy = tailStore()
    const reads = tailStore()
    // phase 1: the S01 writer owns the session; the legacy store is refused and the writer's batches land in order
    const writer = await (await sessions()).create(hdr(sessionId))
    let stop = false
    const violations: string[] = []
    const reader = (async () => {
      while (!stop) {
        const events = await reads.read({
          tenantId: tenantA,
          sessionId,
          limit: 500
        })
        events.forEach((e, i) => {
          if (e.sequence !== i + 1)
            violations.push(`position ${i + 1} holds ${e.sequence}`)
        })
      }
    })()
    const refused = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        legacy.append(input(ev(tenantA, sessionId, 1, `l-refused-${i}`)))
      )
    )
    expect(refused.every((r) => r.status === 'rejected')).toBe(true)
    for (let i = 0; i < 20; i += 1)
      await writer.append([ev(tenantA, sessionId, i + 1, `w${i}`)])
    await writer.close()
    expect(await stored(sessionId)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1)
    )
    // phase 2: no writer; thirty concurrent appends through the legacy store
    const legacyRun = await Promise.allSettled(
      Array.from({ length: 30 }, (_, i) =>
        legacy.append(input(ev(tenantA, sessionId, 1, `l${i}`)))
      )
    )
    const accepted = legacyRun.filter((r) => r.status === 'fulfilled').length
    expect(accepted).toBeGreaterThan(0)
    // phase 3: a new S01 writer resumes at the cursor the legacy store left
    const next = (await stored(sessionId)).length
    const again = await (await sessions()).open(sessionId, 'write')
    await again.append([ev(tenantA, sessionId, next + 1, 'w-after')])
    await again.close()
    stop = true
    await reader
    const sequences = await stored(sessionId)
    expect(violations).toEqual([])
    expect(sequences).toEqual(sequences.map((_, i) => i + 1))
    expect(sequences.length).toBe(20 + accepted + 1)
  }, 60000)

  it('tails an existing log in pages of ten, then the late commit, and ends by budget', async () => {
    const sessionId = 'tail-basic'
    const writer = await (await sessions()).create(hdr(sessionId))
    await writer.append(
      Array.from({ length: 25 }, (_, i) => ev(tenantA, sessionId, i + 1))
    )
    const reads: number[] = []
    const counting: PostgresPoolLike = {
      connect: async () => {
        reads.push(Date.now())
        return tailPool.connect()
      }
    } as never
    const gen = tailSessionEvents({
      store: tailStore(tenantA, counting),
      tenantId: tenantA,
      sessionId,
      after: 0,
      signal: new AbortController().signal,
      maxEvents: 27,
      ...fast
    })
    const collected: TailItem[] = []
    const consumer = (async () => {
      for await (const item of gen) collected.push(item)
    })()
    while (seqs(collected).length < 25)
      await new Promise((r) => setTimeout(r, 10))
    await writer.append([
      ev(tenantA, sessionId, 26),
      ev(tenantA, sessionId, 27)
    ])
    await consumer
    expect(seqs(collected)).toEqual(Array.from({ length: 27 }, (_, i) => i + 1))
    expect(collected.at(-1)).toMatchObject({
      kind: 'end',
      reason: 'max_events',
      lastSequence: 27
    })
    await writer.close()
  })

  it('a cut connection resumes at the last sequence without loss or repetition', async () => {
    const sessionId = 'tail-resume'
    const writer = await (await sessions()).create(hdr(sessionId))
    await writer.append(
      Array.from({ length: 12 }, (_, i) => ev(tenantA, sessionId, i + 1))
    )
    const got: number[] = []
    let after = 0
    while (got.length < 12) {
      const items = await drain(
        tailSessionEvents({
          store: tailStore(),
          tenantId: tenantA,
          sessionId,
          after,
          signal: new AbortController().signal,
          maxEvents: Math.min(5, 12 - got.length),
          ...fast
        })
      )
      got.push(...seqs(items))
      after = got.at(-1)!
    }
    expect(got).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    await writer.close()
  })

  it('A4: two tenants on the same session id never see each other; the store is per request', async () => {
    const sessionId = 'shared-id'
    const a = await (await sessions(tenantA)).create(hdr(sessionId))
    const b = await (await sessions(tenantB)).create(hdr(sessionId))
    await a.append([ev(tenantA, sessionId, 1, 'only-a')])
    await b.append([
      ev(tenantB, sessionId, 1, 'only-b-1'),
      ev(tenantB, sessionId, 2, 'only-b-2')
    ])
    const forA = await drain(
      tailSessionEvents({
        store: tailStore(tenantA),
        tenantId: tenantA,
        sessionId,
        after: 0,
        signal: new AbortController().signal,
        maxEvents: 1,
        ...fast
      })
    )
    const forB = await drain(
      tailSessionEvents({
        store: tailStore(tenantB),
        tenantId: tenantB,
        sessionId,
        after: 0,
        signal: new AbortController().signal,
        maxEvents: 2,
        ...fast
      })
    )
    expect(
      forA.flatMap((i) => (i.kind === 'event' ? [i.event.eventId] : []))
    ).toEqual(['only-a'])
    expect(
      forB.flatMap((i) => (i.kind === 'event' ? [i.event.eventId] : []))
    ).toEqual(['only-b-1', 'only-b-2'])
    // a store bound to one tenant refuses the other's stream outright
    await expect(
      tailStore(tenantA).read({ tenantId: tenantB, sessionId })
    ).rejects.toBeInstanceOf(SessionEventError)
    await a.close()
    await b.close()
  })

  it('A6: the cursor check is ok at the end, cursor_ahead beyond it, not_found for another tenant or an unknown session', async () => {
    const sessionId = 'cursor-check'
    const writer = await (await sessions()).create(hdr(sessionId))
    await writer.append([ev(tenantA, sessionId, 1), ev(tenantA, sessionId, 2)])
    const verify = (tenantId: string, id: string, after: number) =>
      verifyTailCursor({
        store: tailStore(tenantId),
        tenantId,
        sessionId: id,
        after,
        signal: new AbortController().signal,
        ...fast
      })
    expect(await verify(tenantA, sessionId, 0)).toBe('ok')
    expect(await verify(tenantA, sessionId, 2)).toBe('ok')
    expect(await verify(tenantA, sessionId, 3)).toBe('cursor_ahead')
    expect(await verify(tenantA, 'no-such-session', 0)).toBe('not_found')
    expect(await verify(tenantB, sessionId, 0)).toBe('not_found')
    await writer.close()
  })

  it('A8/A9: with a pool of its own and 3 permits, ten tails never hold more than 3 connections at once', async () => {
    const sessionId = 'tail-permits'
    const writer = await (await sessions()).create(hdr(sessionId))
    await writer.append(
      Array.from({ length: 30 }, (_, i) => ev(tenantA, sessionId, i + 1))
    )
    let inUse = 0
    let peak = 0
    const counting: PostgresPoolLike = {
      connect: async () => {
        const client = await tailPool.connect()
        inUse += 1
        peak = Math.max(peak, inUse)
        return {
          query: client.query.bind(client),
          release: (error?: Error) => {
            inUse -= 1
            client.release(error)
          }
        }
      }
    } as never
    const permits = new ReadSemaphore(3)
    const runs = await Promise.all(
      Array.from({ length: 10 }, () =>
        drain(
          tailSessionEvents({
            store: tailStore(tenantA, counting),
            tenantId: tenantA,
            sessionId,
            after: 0,
            signal: new AbortController().signal,
            maxEvents: 30,
            permits,
            ...fast
          })
        )
      )
    )
    for (const items of runs)
      expect(seqs(items)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
    expect(peak).toBeLessThanOrEqual(3)
    expect(peak).toBeGreaterThan(0)
    expect(permits.inUse).toBe(0)
    await writer.close()
  }, 60000)

  it('an aborted tail gives its connection back and reads nothing more', async () => {
    const sessionId = 'tail-abort'
    const writer = await (await sessions()).create(hdr(sessionId))
    await writer.append([ev(tenantA, sessionId, 1)])
    const ac = new AbortController()
    let connects = 0
    const counting: PostgresPoolLike = {
      connect: async () => {
        connects += 1
        return tailPool.connect()
      }
    } as never
    const gen = tailSessionEvents({
      store: tailStore(tenantA, counting),
      tenantId: tenantA,
      sessionId,
      after: 0,
      signal: ac.signal,
      ...fast
    })
    expect((await gen.next()).value).toMatchObject({ kind: 'event' })
    ac.abort()
    expect((await gen.next()).done).toBe(true)
    const seen = connects
    await new Promise((r) => setTimeout(r, 80))
    expect(connects).toBe(seen)
    expect(tailPool.idleCount + tailPool.waitingCount).toBeGreaterThanOrEqual(0)
    expect(tailPool.totalCount - tailPool.idleCount).toBe(0)
    await writer.close()
  })
})
