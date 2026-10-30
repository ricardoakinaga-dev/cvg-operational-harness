// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- driver wrappers in negative tests */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent, SessionHandle } from '@cvg/harness-contracts'
import {
  SessionAlreadyExistsError,
  SessionCommitUnknownError,
  SessionForkRefusedError,
  SessionHeaderValidationError,
  SessionPersistenceNotFoundError,
  SessionStorageUnavailableError,
  materializeSessionEvent
} from '@cvg/harness'
import { runSessionEventMigrations } from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  verifySessionFork,
  type PostgresPhysicalSessionPool
} from '../session-persistence.ts'

// PAR-S04 slice 2: transactional fork and verifySessionFork (SPEC 0287 §4, FP04-FP06, FP09).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S04 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars04f_${suffix}`
const role = `pars04f_role_${suffix}`
const password = 'pars04-synthetic-only'
const tenantA = 'tenant-synthetic-A'
const tenantB = 'tenant-synthetic-B'
const hdr = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})

let admin: Client
let readPool: Pool
let roleUrl: string
let physical: PostgresPhysicalSessionPool
const service = (tenantId = tenantA, maxOpenWriters = 8, pool = physical) =>
  createPostgresSessionPersistence(pool, readPool, {
    tenantId,
    schemaName: schema,
    maxOpenWriters,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)

let seq = 0
const mk = (
  tenantId: string,
  sessionId: string,
  sequence: number,
  type: SessionEvent['type'],
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-${sequence}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as any,
    sequence
  )
/** A turn as the SDK writes it; `stop` other than COMPLETED has no assistant message. */
const turnEvents = (
  tenantId: string,
  sessionId: string,
  from: number,
  correlationId: string,
  stop = 'COMPLETED',
  text = `ask ${correlationId}`
): SessionEvent[] => {
  const out = [
    mk(tenantId, sessionId, from, 'message/user', correlationId, { text }),
    mk(tenantId, sessionId, from + 1, 'turn/start', correlationId, {
      correlationId
    }),
    mk(tenantId, sessionId, from + 2, 'turn/end', correlationId, {
      correlationId,
      stopReason: stop
    })
  ]
  if (stop === 'COMPLETED')
    out.push(
      mk(tenantId, sessionId, from + 3, 'message/assistant', correlationId, {
        text: `answer ${correlationId}`
      })
    )
  return out
}
/** Seeds a source: c1 completed (4 events), c2 approval-required (3), c3 completed (4). */
async function seedSource(
  id: string,
  tenantId = tenantA
): Promise<{ handle: SessionHandle; events: SessionEvent[] }> {
  const handle = await (await service(tenantId)).create(hdr(id))
  const events = [
    ...turnEvents(tenantId, id, 1, 'c1'),
    ...turnEvents(tenantId, id, 5, 'c2', 'APPROVAL_REQUIRED'),
    ...turnEvents(tenantId, id, 8, 'c3')
  ]
  await handle.append(events)
  return { handle, events }
}
const stored = async (id: string, tenantId = tenantA) =>
  (
    await admin.query(
      `SELECT sequence, event_id FROM ${schema}.session_events WHERE tenant_id=$2 AND session_id=$1 ORDER BY sequence`,
      [id, tenantId]
    )
  ).rows
const streamRow = async (id: string, tenantId = tenantA) =>
  (
    await admin.query(
      `SELECT * FROM ${schema}.session_streams WHERE tenant_id=$2 AND session_id=$1`,
      [id, tenantId]
    )
  ).rows[0]
async function holders(id: string): Promise<number> {
  return (
    await admin.query(
      `SELECT count(*)::int AS n FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted
       AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid
       AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id=$1 AND tenant_id='${tenantA}')::oid`,
      [id]
    )
  ).rows[0].n
}
const wrapped = (
  rule: (sql: string, n: Map<string, number>) => unknown | undefined
): PostgresPhysicalSessionPool => {
  const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
  return {
    acquire: async (o) => {
      const lease = await inner.acquire(o)
      const n = new Map<string, number>()
      return {
        backendPid: lease.backendPid,
        query: async (sql: string, v?: unknown[]) => {
          n.set(sql, (n.get(sql) ?? 0) + 1)
          const forced = rule(sql, n)
          if (forced instanceof Error) throw forced
          return (forced ?? (await lease.query(sql, v))) as never
        },
        onLost: (l) => lease.onLost(l),
        release: () => lease.release(),
        destroy: () => lease.destroy()
      }
    }
  }
}
const refusal = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(SessionForkRefusedError)
    return (e as SessionForkRefusedError).code
  }
  throw new Error('expected a refusal')
}

describe.skipIf(!url)('PAR-S04 slice 2: fork in PostgreSQL', () => {
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
    readPool = new Pool({ connectionString: roleUrl, max: 8 })
    physical = createPgPhysicalSessionPool({ connectionString: roleUrl })
  })
  afterAll(async () => {
    await readPool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  it('copies the completed prefix atomically, without renumbering, with provable lineage', async () => {
    const { handle: parent, events } = await seedSource(`p${++seq}`)
    const svc = await service()
    const id = `f${seq}`
    const child = await svc.fork(parent.id, hdr(id))
    expect(child.inheritedEventCount).toBe(4)
    expect(child.header).toMatchObject({
      id,
      isSeeded: true,
      parentSession: parent.id,
      lineage: { source: parent.id, cutSequence: 4, depth: 1, root: parent.id }
    })
    expect((await child.read(0)).events).toEqual(
      events.slice(0, 4).map((e) => ({ ...e, sessionId: id }))
    )
    const row = await streamRow(id)
    expect(row.next_sequence).toBe('5')
    expect(row.inherited_event_count).toBe('4')
    expect(await verifySessionFork(svc, id, parent.id)).toEqual([])
    // The child is its own writer: it appends after the cut and the source is untouched.
    await child.append([
      mk(tenantA, id, 5, 'message/user', 'c9', { text: 'own' })
    ])
    expect((await stored(parent.id)).length).toBe(11)
    expect((await stored(id)).length).toBe(5)
    await child.close()
    await parent.close()
  })

  it('stops at the end of a requested completed turn', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    const svc = await service()
    const child = await svc.fork(parent.id, hdr(`f${seq}`), {
      through: { correlationId: 'c1' }
    })
    expect(child.inheritedEventCount).toBe(4)
    await child.close()
    expect(
      await refusal(
        svc.fork(parent.id, hdr(`g${seq}`), {
          through: { correlationId: 'c2' }
        })
      )
    ).toBe('fork_cut_not_inheritable')
    expect(
      await refusal(
        svc.fork(parent.id, hdr(`g${seq}`), {
          through: { correlationId: 'zz' }
        })
      )
    ).toBe('fork_cut_unknown_turn')
    await parent.close()
  })

  it('forks with the source open by another writer, with its own lock, and leaves the source lock alone', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    expect(await holders(parent.id)).toBe(1)
    const child = await (await service()).fork(parent.id, hdr(`f${seq}`))
    expect(await holders(parent.id)).toBe(1)
    expect(await holders(`f${seq}`)).toBe(1)
    expect((await streamRow(`f${seq}`)).writer_lock_id).not.toBe(
      (await streamRow(parent.id)).writer_lock_id
    )
    await parent.append(turnEvents(tenantA, parent.id, 12, 'c4'))
    expect((await stored(`f${seq}`)).length).toBe(4)
    await child.close()
    expect(await holders(`f${seq}`)).toBe(0)
    expect(await holders(parent.id)).toBe(1)
    await parent.close()
  })

  it('never reads or writes across tenants', async () => {
    const other = await seedSource(`x${++seq}`, tenantB)
    const svc = await service(tenantA)
    await expect(
      svc.fork(other.handle.id, hdr(`f${seq}`))
    ).rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
    expect(await streamRow(`f${seq}`)).toBeUndefined()
    // The same ids in both tenants stay apart.
    const a = await seedSource(`s${++seq}`, tenantA)
    const b = await seedSource(a.handle.id, tenantB)
    const child = await svc.fork(a.handle.id, hdr(`f${seq}`))
    expect(await stored(`f${seq}`, tenantB)).toEqual([])
    await child.close()
    await a.handle.close()
    await b.handle.close()
    await other.handle.close()
  })

  it('refuses without leaving anything behind: nothing to inherit, source itself, missing, existing, bad header', async () => {
    const svc = await service()
    const empty = await svc.create(hdr(`e${++seq}`))
    await empty.append(
      turnEvents(tenantA, empty.id, 1, 'c1', 'APPROVAL_REQUIRED')
    )
    expect(await refusal(svc.fork(empty.id, hdr(`f${seq}`)))).toBe(
      'fork_nothing_to_inherit'
    )
    expect(await refusal(svc.fork(empty.id, hdr(empty.id)))).toBe(
      'fork_target_is_source'
    )
    await expect(svc.fork('nope', hdr(`f${seq}`))).rejects.toBeInstanceOf(
      SessionPersistenceNotFoundError
    )
    const { handle: parent } = await seedSource(`p${++seq}`)
    const first = await svc.fork(parent.id, hdr(`f${seq}`))
    await expect(svc.fork(parent.id, hdr(`f${seq}`))).rejects.toBeInstanceOf(
      SessionAlreadyExistsError
    )
    for (const forged of [
      { ...hdr(`h${seq}`), lineage: { source: 'someone', depth: 1 } },
      { ...hdr(`h${seq}`), isSeeded: true, parentSession: 'someone-else' }
    ])
      await expect(svc.fork(parent.id, forged as any)).rejects.toBeInstanceOf(
        SessionHeaderValidationError
      )
    await expect(svc.fork('', hdr(`h${seq}`))).rejects.toBeInstanceOf(
      SessionHeaderValidationError
    )
    expect(await streamRow(`h${seq}`)).toBeUndefined()
    expect(await holders(`f${seq}`)).toBe(1)
    await first.close()
    await parent.close()
    await empty.close()
  })

  it('keeps depth and root through a chain and refuses the 17th level', async () => {
    const { handle: root } = await seedSource(`r${++seq}`)
    const svc = await service()
    let previous = root.id
    for (let depth = 1; depth <= 16; depth++) {
      const id = `d${seq}-${depth}`
      const child = await svc.fork(previous, hdr(id))
      expect(child.header.lineage).toMatchObject({ depth, root: root.id })
      await child.close()
      previous = id
    }
    expect(await verifySessionFork(svc, previous, `d${seq}-15`)).toEqual([])
    expect(await refusal(svc.fork(previous, hdr(`d${seq}-17`)))).toBe(
      'fork_depth_exceeded'
    )
    expect(await streamRow(`d${seq}-17`)).toBeUndefined()
    await root.close()
  })

  it('refuses a prefix above the 8 MiB batch ceiling', async () => {
    const svc = await service()
    const parent = await svc.create(hdr(`big${++seq}`))
    const big = 'x'.repeat(65_000)
    let n = 1
    const out: SessionEvent[] = []
    for (let i = 0; i < 140; i++)
      out.push(mk(tenantA, parent.id, n++, 'message/user', 'cb', { text: big }))
    out.push(
      mk(tenantA, parent.id, n++, 'turn/start', 'cb', { correlationId: 'cb' })
    )
    out.push(
      mk(tenantA, parent.id, n++, 'turn/end', 'cb', {
        correlationId: 'cb',
        stopReason: 'COMPLETED'
      })
    )
    out.push(
      mk(tenantA, parent.id, n++, 'message/assistant', 'cb', { text: 'ok' })
    )
    for (let i = 0; i < out.length; i += 4)
      await parent.append(out.slice(i, i + 4))
    expect(await refusal(svc.fork(parent.id, hdr(`f${seq}`)))).toBe(
      'fork_too_large'
    )
    expect(await streamRow(`f${seq}`)).toBeUndefined()
    await parent.close()
  })

  it('a failure in the middle of the copy leaves no child and frees the writer slot', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    let faulty = true
    const svc = await service(
      tenantA,
      1,
      wrapped((sql, n) =>
        faulty &&
        sql.includes('INSERT INTO') &&
        sql.includes('session_events') &&
        n.get(sql) === 3
          ? Object.assign(new Error('synthetic failure'), { code: '57P01' })
          : undefined
      )
    )
    await expect(svc.fork(parent.id, hdr(`f${seq}`))).rejects.toBeInstanceOf(
      SessionStorageUnavailableError
    )
    expect(await streamRow(`f${seq}`)).toBeUndefined()
    expect(await stored(`f${seq}`)).toEqual([])
    // Capacity 1: the same service forks again only if the failed fork gave its slot back.
    faulty = false
    const child = await svc.fork(parent.id, hdr(`f${seq}`))
    expect(child.inheritedEventCount).toBe(4)
    await child.close()
    await parent.close()
  })

  it('refuses a fork onto its own source before taking a connection', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    let acquired = 0
    const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
    const svc = await service(tenantA, 4, {
      acquire: (o) => {
        acquired++
        return inner.acquire(o)
      }
    })
    const before = acquired
    expect(await refusal(svc.fork(parent.id, hdr(parent.id)))).toBe(
      'fork_target_is_source'
    )
    expect(acquired).toBe(before)
    await parent.close()
  })

  it('an unknown COMMIT is a typed error and never a handle; capacity is refused without side effects', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    const svc = await service(
      tenantA,
      1,
      wrapped((sql, n) =>
        sql === 'COMMIT' && n.get(sql) === 2
          ? Object.assign(new Error('connection lost'), { code: '08006' })
          : undefined
      )
    )
    await expect(svc.fork(parent.id, hdr(`f${seq}`))).rejects.toBeInstanceOf(
      SessionCommitUnknownError
    )
    const one = await service(tenantA, 1)
    const held = await one.fork(parent.id, hdr(`h${seq}`))
    await expect(one.fork(parent.id, hdr(`i${seq}`))).rejects.toBeInstanceOf(
      SessionStorageUnavailableError
    )
    expect(await streamRow(`i${seq}`)).toBeUndefined()
    await held.close()
    await parent.close()
  })

  it('an aborted signal refuses before touching the database and costs no writer slot', async () => {
    const { handle: parent } = await seedSource(`p${++seq}`)
    const one = await service(tenantA, 1)
    const controller = new AbortController()
    controller.abort()
    await expect(
      one.fork(parent.id, hdr(`f${seq}`), { signal: controller.signal })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(await streamRow(`f${seq}`)).toBeUndefined()
    const child = await one.fork(parent.id, hdr(`f${seq}`))
    await child.close()
    await parent.close()
  })

  it('verifySessionFork finds a forged child and a wrong source', async () => {
    const { handle: parent, events } = await seedSource(`p${++seq}`)
    const svc = await service()
    const good = await svc.fork(parent.id, hdr(`f${seq}`))
    await good.close()
    // A seeded child written by hand: right header shape, but not the source's content.
    const forged = await svc.create(
      {
        ...hdr(`z${seq}`),
        isSeeded: true,
        parentSession: parent.id,
        lineage: {
          source: parent.id,
          cutSequence: 4,
          depth: 1,
          root: parent.id
        }
      } as any,
      { inheritedEventCount: 4 }
    )
    await forged.append(
      turnEvents(tenantA, forged.id, 1, 'c1', 'COMPLETED', 'tampered')
    )
    const problems = await verifySessionFork(svc, forged.id, parent.id)
    expect(problems.join()).toMatch(/digest differs|differs from the source/)
    const bare = await svc.create(
      { ...hdr(`y${seq}`), isSeeded: true } as any,
      {
        inheritedEventCount: 3
      }
    )
    expect((await verifySessionFork(svc, bare.id, parent.id)).join()).toMatch(
      /no well-formed lineage/
    )
    expect(
      (await verifySessionFork(svc, `f${seq}`, forged.id)).length
    ).toBeGreaterThan(0)
    expect(events.length).toBe(11)
    await forged.close()
    await bare.close()
    await parent.close()
  })
})
