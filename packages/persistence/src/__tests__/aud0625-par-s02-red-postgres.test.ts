// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the not-yet-existing API is reached dynamically */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
import * as harness from '@cvg/harness'
import { materializeSessionEvent } from '@cvg/harness'
import { runSessionProjectionMigrations } from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  sessionEventStoreForHandle,
  verifyProjectionCache
} from '../session-persistence.ts'

// PAR-S02 (SPEC 0292): the phase-1 witnesses of the checkpointed projection service, green since
// slice 2. Slice 2 has no writer-side checkpoint yet, so the tests that need one store it with
// `seedCheckpoint`; assertions are unchanged (see SLICE2-RESULT).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S02 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars02r_${suffix}`
const role = `pars02r_role_${suffix}`
const password = 'pars02-synthetic-only'
const tenantA = 'tenant-synthetic-A'
const tenantB = 'tenant-synthetic-B'
const api = harness as unknown as Record<string, any>

let admin: Client
let basePool: Pool
let roleUrl: string
let rowsFetched = 0
/** Counts the session_events rows every read-pool query returns: the observable cost of a read. */
const wrappedClients = new WeakSet<object>()
const countingPool = () => ({
  connect: async () => {
    const client = await basePool.connect()
    if (wrappedClients.has(client)) return client
    wrappedClients.add(client)
    const query = client.query.bind(client) as (...a: unknown[]) => Promise<any>
    ;(client as any).query = async (...a: unknown[]) => {
      const result = await query(...a)
      if (/session_events/.test(String(typeof a[0] === 'string' ? a[0] : '')))
        rowsFetched += result?.rowCount ?? 0
      return result
    }
    return client
  }
})
const cacheFailures: {
  operation: string
  sessionId: string
  code?: string
}[] = []
const service = (tenantId = tenantA, extra: Record<string, unknown> = {}) =>
  createPostgresSessionPersistence(
    createPgPhysicalSessionPool({ connectionString: roleUrl }),
    countingPool() as never,
    {
      tenantId,
      schemaName: schema,
      maxOpenWriters: 4,
      acquireTimeoutMs: 3000,
      onProjectionCacheFailure: (f) => cacheFailures.push(f),
      ...extra
    }
  ).then((r) => r.service as any)
const mk = (
  tenantId: string,
  id: string,
  sequence: number,
  type: SessionEvent['type'],
  c: string,
  payload: Record<string, unknown>
) =>
  materializeSessionEvent(
    {
      tenantId,
      sessionId: id,
      formatVersion: 1,
      eventId: `${id}-${sequence}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId: c,
      traceId: 't',
      type,
      payload
    } as never,
    sequence
  )
const turns = (tenantId: string, id: string, from: number, count: number) => {
  const out: SessionEvent[] = []
  let s = from
  for (let i = 0; i < count; i++) {
    const c = `c${from}-${i}`
    out.push(
      mk(tenantId, id, s++, 'message/user', c, { text: 'PATIENT-TEXT' }),
      mk(tenantId, id, s++, 'turn/start', c, { correlationId: c }),
      mk(tenantId, id, s++, 'turn/end', c, {
        correlationId: c,
        stopReason: 'COMPLETED'
      }),
      mk(tenantId, id, s++, 'message/assistant', c, { text: 'PATIENT-ANSWER' })
    )
  }
  return out
}
let seq = 0
async function seeded(count: number, tenantId = tenantA) {
  const id = `p${++seq}`
  const svc = await service(tenantId)
  const w = await svc.create({ version: 1, id, createdAt: 1, isSeeded: false })
  const events = turns(tenantId, id, 1, count)
  for (let i = 0; i < events.length; i += 100)
    await w.append(events.slice(i, i + 100))
  return { svc, w, id, events }
}

/**
 * Slice 2 has no writer-side trigger yet (slice 3): the checkpoint a test needs is stored the way
 * the owner of the stream will store it, from the pure projection of the first `through` events,
 * by the migration authority (no session is open, so the stream guard lets it in).
 */
async function seedCheckpoint(
  id: string,
  events: SessionEvent[],
  through: number,
  tenantId = tenantA,
  patch: (row: ReturnType<typeof api.sessionCheckpointRow>) => unknown = (r) =>
    r
) {
  const head = await admin.query(
    `SELECT header_json FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
    [tenantId, id]
  )
  const point = await admin.query(
    `SELECT input_digest FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 AND sequence=$3`,
    [tenantId, id, through]
  )
  const row = patch(
    api.sessionCheckpointRow(
      api.projectSession(events.slice(0, through)),
      head.rows[0].header_json,
      point.rows[0].input_digest
    )
  ) as ReturnType<typeof api.sessionCheckpointRow>
  await admin.query("SELECT set_config('cvg.tenant_id', $1, false)", [tenantId])
  await admin.query(
    `INSERT INTO ${schema}.session_projection_checkpoints
       (tenant_id,session_id,projection_id,projection_version,through_sequence,tail_input_digest,header_digest,state,state_digest)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     ON CONFLICT (tenant_id,session_id,projection_id) DO UPDATE SET
       projection_version=EXCLUDED.projection_version, through_sequence=EXCLUDED.through_sequence,
       tail_input_digest=EXCLUDED.tail_input_digest, header_digest=EXCLUDED.header_digest,
       state=EXCLUDED.state, state_digest=EXCLUDED.state_digest`,
    [
      tenantId,
      id,
      api.SESSION_PROJECTION_ID,
      row.projectionVersion,
      row.throughSequence,
      row.tailInputDigest,
      row.headerDigest,
      JSON.stringify(row.state),
      row.stateDigest
    ]
  )
}

describe.skipIf(!url)(
  'PAR-S02 phase 1: projections with checkpoint cache',
  () => {
    beforeAll(async () => {
      admin = new Client({ connectionString: url })
      await admin.connect()
      await runSessionProjectionMigrations(admin, { schemaName: schema })
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
      await admin.query(
        `GRANT SELECT ON ${schema}.schema_migrations TO ${role}`
      )
      // the owner of a stream writes its checkpoint (slice 3); a reader only needs SELECT
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
      )
      const u = new URL(url!)
      u.username = role
      u.password = password
      roleUrl = u.toString()
      basePool = new Pool({ connectionString: roleUrl, max: 6 })
    })
    afterAll(async () => {
      await basePool?.end()
      await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin?.query(`DROP ROLE IF EXISTS ${role}`)
      await admin?.end()
    })

    it('control: reading ONE event today fetches and validates the whole log (cost is linear in its size)', async () => {
      const { svc, w, id, events } = await seeded(50)
      await w.close()
      const reader = await svc.open(id, 'read')
      rowsFetched = 0
      const last = await reader.read(events.length - 1, 1)
      expect(last.events).toHaveLength(1)
      expect(rowsFetched).toBe(events.length)
      await reader.close()
    })

    it('first projection is a rebuild equal to the pure projection of the whole log', async () => {
      const { svc, w, id, events } = await seeded(10)
      await w.close()
      const result = await svc.project(id)
      expect(result.origin).toBe('rebuild')
      expect(result.projection).toEqual(api.projectSession(events))
    })

    it('after the writer closes, the next projection comes from the checkpoint and reads at most the tail row', async () => {
      const { svc, w, id, events } = await seeded(50)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      rowsFetched = 0
      const again = await svc.project(id)
      expect(again.origin).toBe('cache')
      expect(rowsFetched).toBeLessThanOrEqual(1)
      expect(again.projection).toEqual(api.projectSession(events))
    })

    it('events appended after the checkpoint are folded incrementally, reading only the tail', async () => {
      const { svc, w, id, events } = await seeded(50)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      const again = await svc.open(id, 'write')
      const tail = turns(tenantA, id, events.length + 1, 1)
      await again.append(tail)
      await again.close()
      rowsFetched = 0
      const result = await svc.project(id)
      expect(result.origin).toBe('incremental')
      expect(rowsFetched).toBeLessThanOrEqual(tail.length + 1)
      expect(result.projection).toEqual(
        api.projectSession([...events, ...tail])
      )
    })

    it('a tampered checkpoint is never served: its state digest fails and the projection is rebuilt', async () => {
      const { svc, w, id, events } = await seeded(20)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      await admin.query(
        `UPDATE ${schema}.session_projection_checkpoints SET state = jsonb_set(state, '{turns,total}', '99') WHERE session_id=$1`,
        [id]
      )
      const result = await svc.project(id)
      expect(result.origin).toBe('rebuild')
      expect(result.projection).toEqual(api.projectSession(events))
    })

    it('a checkpoint of another projection version is ignored', async () => {
      const { svc, w, id, events } = await seeded(20)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      await admin.query(
        `UPDATE ${schema}.session_projection_checkpoints SET projection_version = projection_version + 1 WHERE session_id=$1`,
        [id]
      )
      expect((await svc.project(id)).origin).toBe('rebuild')
    })

    it('checkpoints never cross tenants, even for the same session id', async () => {
      const a = await seeded(5, tenantA)
      await a.w.close()
      await seedCheckpoint(a.id, a.events, a.events.length, tenantA)
      const svcB = await service(tenantB)
      await expect(svcB.project(a.id)).rejects.toMatchObject({
        name: 'SessionPersistenceNotFoundError'
      })
      const rows = await admin.query(
        `SELECT tenant_id FROM ${schema}.session_projection_checkpoints WHERE session_id=$1`,
        [a.id]
      )
      expect(rows.rows.map((r) => r.tenant_id)).toEqual([tenantA])
    })

    it('a cache that cannot be read or written never fails the projection', async () => {
      const { svc, w, id, events } = await seeded(10)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      await admin.query(
        `REVOKE ALL ON ${schema}.session_projection_checkpoints FROM ${role}`
      )
      try {
        const result = await svc.project(id)
        expect(result.origin).toBe('rebuild')
        expect(result.projection).toEqual(api.projectSession(events))
      } finally {
        // teardown for the tests that follow: the role gets its cache grants back
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
        )
      }
    })

    it('the stored checkpoint holds no message text', async () => {
      const { w, id, events } = await seeded(5)
      await w.close()
      await seedCheckpoint(id, events, events.length)
      const rows = await admin.query(
        `SELECT state::text AS s FROM ${schema}.session_projection_checkpoints WHERE session_id=$1`,
        [id]
      )
      expect(rows.rows[0].s).not.toContain('PATIENT-')
    })

    describe('slice 2: the service, the checks and the cache guards (SPEC 0292 PJ04-PJ10)', () => {
      const header = (id: string) => ({
        version: 1 as const,
        id,
        createdAt: 1_700_000_000_000,
        isSeeded: false
      })
      const asAdmin = async (tenantId = tenantA) => {
        await admin.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantId
        ])
      }
      /** Stores `patch(row)` bypassing the guard triggers, to plant what the guard would refuse. */
      const plant = async (
        id: string,
        patch: (row: Record<string, unknown>) => Record<string, unknown>,
        tenantId = tenantA
      ) => {
        await asAdmin(tenantId)
        const current = await admin.query(
          `SELECT * FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2`,
          [tenantId, id]
        )
        const next = patch(current.rows[0])
        const client = new Client({ connectionString: url })
        await client.connect()
        try {
          await client.query('SET session_replication_role = replica')
          await client.query("SELECT set_config('cvg.tenant_id', $1, false)", [
            tenantId
          ])
          await client.query(
            `UPDATE ${schema}.session_projection_checkpoints
                SET through_sequence=$3, tail_input_digest=$4, header_digest=$5, projection_version=$6
              WHERE tenant_id=$1 AND session_id=$2`,
            [
              tenantId,
              id,
              next.through_sequence,
              next.tail_input_digest,
              next.header_digest,
              next.projection_version
            ]
          )
        } finally {
          await client.end()
        }
      }

      it('PJ04: the three origins equal the projection rebuilt from zero, and the check finds nothing', async () => {
        const { svc, w, id, events } = await seeded(30)
        await w.close()
        const rebuilt = await svc.project(id)
        expect(rebuilt).toMatchObject({ origin: 'rebuild', cache: 'absent' })
        // the cache only advances: first a checkpoint behind the head, then one at it
        await seedCheckpoint(id, events, 40)
        const incremental = await svc.project(id)
        expect(incremental).toMatchObject({
          origin: 'incremental',
          cache: 'hit'
        })
        expect(incremental.projection).toEqual(rebuilt.projection)
        expect(incremental.throughSequence).toBe(events.length)
        expect(await verifyProjectionCache(svc, id)).toEqual([])
        await seedCheckpoint(id, events, events.length)
        const cached = await svc.project(id)
        expect(cached).toMatchObject({ origin: 'cache', cache: 'hit' })
        expect(cached.projection).toEqual(rebuilt.projection)
        expect(await verifyProjectionCache(svc, id)).toEqual([])
      })

      it('PJ05: a rebuild reads the whole log, an incremental one the tail and the point, a cached one the point', async () => {
        const { svc, w, id, events } = await seeded(40)
        await w.close()
        rowsFetched = 0
        await svc.project(id)
        expect(rowsFetched).toBe(events.length)
        await seedCheckpoint(id, events, events.length - 8)
        rowsFetched = 0
        await svc.project(id)
        expect(rowsFetched).toBe(8 + 1)
        await seedCheckpoint(id, events, events.length)
        rowsFetched = 0
        await svc.project(id)
        expect(rowsFetched).toBe(1)
      })

      it.each([
        [
          'the point event has another digest',
          (r: any) => ({ ...r, tail_input_digest: 'e'.repeat(64) })
        ],
        [
          'the stream header differs',
          (r: any) => ({ ...r, header_digest: 'e'.repeat(64) })
        ],
        [
          'the checkpoint is beyond the log',
          (r: any) => ({ ...r, through_sequence: 9999 })
        ],
        [
          'the checkpoint names a position that is another event',
          (r: any) => ({ ...r, through_sequence: 3 })
        ]
      ])(
        'PJ06: %s, so the log is read and the cache is not served',
        async (_name, change) => {
          const { svc, w, id, events } = await seeded(20)
          await w.close()
          await seedCheckpoint(id, events, events.length)
          await plant(id, change as never)
          const result = await svc.project(id)
          expect(result).toMatchObject({ origin: 'rebuild', cache: 'invalid' })
          expect(result.projection).toEqual(api.projectSession(events))
          expect(await verifyProjectionCache(svc, id)).toContain(
            'the checkpoint is invalid and was ignored'
          )
        }
      )

      it('PJ07: the same session id in two tenants keeps two separate checkpoints', async () => {
        const id = `shared-${++seq}`
        const results = []
        for (const tenantId of [tenantA, tenantB]) {
          const svc = await service(tenantId)
          const w = await svc.create(header(id))
          const events = turns(tenantId, id, 1, tenantId === tenantA ? 3 : 7)
          await w.append(events)
          await w.close()
          await seedCheckpoint(id, events, events.length, tenantId)
          results.push(await svc.project(id))
        }
        expect(results.map((r) => r.origin)).toEqual(['cache', 'cache'])
        expect(results.map((r) => r.projection.throughSequence)).toEqual([
          12, 28
        ])
        // the owner role sees every tenant: one row per tenant, each with its own position
        const rows = await admin.query(
          `SELECT tenant_id, through_sequence FROM ${schema}.session_projection_checkpoints WHERE session_id=$1 ORDER BY tenant_id`,
          [id]
        )
        expect(
          rows.rows.map((r) => [r.tenant_id, Number(r.through_sequence)])
        ).toEqual([
          [tenantA, 12],
          [tenantB, 28]
        ])
      })

      it('PJ07: the row level security of the cache holds for the serving role, in both directions', async () => {
        const id = `rls-${++seq}`
        const events: Record<string, SessionEvent[]> = {}
        for (const tenantId of [tenantA, tenantB]) {
          const svc = await service(tenantId)
          const w = await svc.create(header(id))
          events[tenantId] = turns(tenantId, id, 1, 2)
          await w.append(events[tenantId]!)
          await w.close()
          await seedCheckpoint(id, events[tenantId]!, 8, tenantId)
        }
        const client = await basePool.connect()
        try {
          const seen = async (tenantId: string) => {
            await client.query('BEGIN')
            await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
              tenantId
            ])
            const r = await client.query(
              `SELECT tenant_id FROM ${schema}.session_projection_checkpoints WHERE session_id=$1`,
              [id]
            )
            await client.query('ROLLBACK')
            return r.rows.map((x) => x.tenant_id)
          }
          expect(await seen(tenantA)).toEqual([tenantA])
          expect(await seen(tenantB)).toEqual([tenantB])
          expect(await seen('tenant-synthetic-C')).toEqual([])
          await client.query('BEGIN')
          await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
            tenantB
          ])
          await expect(
            client.query(
              `UPDATE ${schema}.session_projection_checkpoints SET created_at = now() WHERE session_id=$1 AND tenant_id=$2`,
              [id, tenantA]
            )
          ).resolves.toMatchObject({ rowCount: 0 })
          await client.query('ROLLBACK')
        } finally {
          client.release()
        }
      })

      it('PJ08: an unreadable cache is counted and reported, and an observer that throws changes nothing', async () => {
        const { svc, w, id, events } = await seeded(10)
        await w.close()
        await seedCheckpoint(id, events, events.length)
        const before = svc.projectionCacheStats()
        cacheFailures.length = 0
        await admin.query(
          `REVOKE ALL ON ${schema}.session_projection_checkpoints FROM ${role}`
        )
        try {
          const result = await svc.project(id)
          expect(result).toMatchObject({
            origin: 'rebuild',
            cache: 'unavailable'
          })
          expect(svc.projectionCacheStats().readFailures).toBe(
            before.readFailures + 1
          )
          expect(cacheFailures).toEqual([
            { operation: 'read', sessionId: id, code: '42501' }
          ])
          expect(await verifyProjectionCache(svc, id)).toContain(
            'the checkpoint cache cannot be read'
          )
        } finally {
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
          )
        }
        const noisy = await createPostgresSessionPersistence(
          createPgPhysicalSessionPool({ connectionString: roleUrl }),
          countingPool() as never,
          {
            tenantId: tenantA,
            schemaName: schema,
            maxOpenWriters: 2,
            acquireTimeoutMs: 3000,
            onProjectionCacheFailure: () => {
              throw new Error('observer broke')
            }
          }
        )
        await admin.query(
          `REVOKE SELECT ON ${schema}.session_projection_checkpoints FROM ${role}`
        )
        try {
          expect((await (noisy.service as any).project(id)).origin).toBe(
            'rebuild'
          )
        } finally {
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
          )
        }
      })

      it('PJ08: a schema without the checkpoint table projects from the log', async () => {
        const bare = `pars02b_${suffix}`
        const { runSessionEventMigrations } =
          await import('../session-events.ts')
        await runSessionEventMigrations(admin, { schemaName: bare })
        try {
          await admin.query(`GRANT USAGE ON SCHEMA ${bare} TO ${role}`)
          await admin.query(
            `GRANT SELECT, INSERT ON ${bare}.session_events, ${bare}.session_streams TO ${role}`
          )
          await admin.query(
            `GRANT UPDATE (next_sequence) ON ${bare}.session_streams TO ${role}`
          )
          await admin.query(
            `GRANT SELECT ON ${bare}.schema_migrations TO ${role}`
          )
          const svc = (
            await createPostgresSessionPersistence(
              createPgPhysicalSessionPool({ connectionString: roleUrl }),
              countingPool() as never,
              {
                tenantId: tenantA,
                schemaName: bare,
                maxOpenWriters: 2,
                acquireTimeoutMs: 3000
              }
            )
          ).service as any
          const id = `bare-${++seq}`
          const w = await svc.create(header(id))
          const events = turns(tenantA, id, 1, 3)
          await w.append(events)
          await w.close()
          const result = await svc.project(id)
          expect(result).toMatchObject({
            origin: 'rebuild',
            cache: 'unavailable'
          })
          expect(result.projection).toEqual(api.projectSession(events))
        } finally {
          await admin.query(`DROP SCHEMA IF EXISTS ${bare} CASCADE`)
        }
      })

      it('SP-G: a consistent but wrong checkpoint is served by project and found by the check', async () => {
        const { svc, w, id, events } = await seeded(12)
        await w.close()
        await seedCheckpoint(id, events, events.length, tenantA, (row) => {
          const state = JSON.parse(JSON.stringify(row.state))
          state.turns.total = 99
          return {
            ...row,
            state,
            stateDigest: api.sessionProjectionStateDigest(state)
          }
        })
        const served = await svc.project(id)
        expect(served.origin).toBe('cache')
        expect(served.projection.turns.total).toBe(99)
        const problems = await verifyProjectionCache(svc, id)
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('differs from the log rebuilt from zero')
      })

      it('I2: a log whose turn comes back is refused from zero, accepted by the fold at a cut, and found by the check', async () => {
        const id = `corrupt-${++seq}`
        const svc = await service()
        const w = await svc.create(header(id))
        const c = (k: string, n: number) => [
          mk(tenantA, id, n, 'turn/start', k, { correlationId: k }),
          mk(tenantA, id, n + 1, 'turn/end', k, {
            correlationId: k,
            stopReason: 'COMPLETED'
          })
        ]
        const events = [
          ...c('a', 1),
          ...c('b', 3),
          mk(tenantA, id, 5, 'turn/start', 'a', { correlationId: 'a' })
        ]
        await w.append(events)
        await w.close()
        await expect(svc.project(id)).rejects.toMatchObject({
          name: 'SessionPersistenceCorruptionError'
        })
        await seedCheckpoint(id, events, 4)
        const folded = await svc.project(id)
        expect(folded.origin).toBe('incremental')
        const problems = await verifyProjectionCache(svc, id)
        expect(problems).toHaveLength(1)
        expect(problems[0]).toContain('interleaved')
      })

      it('PJ10: a fork projects like its source up to the cut, without the cache, and a compaction event is just folded', async () => {
        const { svc, w, id, events } = await seeded(6)
        await w.close()
        await seedCheckpoint(id, events, events.length)
        const child = await svc.fork(id, header(`child-${id}`))
        const cut = child.inheritedEventCount
        expect(cut).toBe(events.length)
        await child.close()
        const forked = await svc.project(`child-${id}`)
        expect(forked.origin).toBe('rebuild')
        expect(forked.projection).toEqual(
          api.projectSession(events.slice(0, cut))
        )
        const again = await svc.open(id, 'write')
        const marker = mk(
          tenantA,
          id,
          events.length + 1,
          'context/compacted',
          'cmp',
          {
            throughSequence: 3,
            summary: 'PATIENT-SUMMARY',
            sourceDigest: 'a'.repeat(64),
            strategyVersion: 'v1'
          }
        )
        await again.append([marker])
        await again.close()
        const result = await svc.project(id)
        expect(result.origin).toBe('incremental')
        expect(result.projection).toEqual(
          api.projectSession([...events, marker])
        )
        expect(result.projection.compaction).toMatchObject({
          count: 1,
          throughSequence: 3
        })
        expect(result.projection.turns.completed).toBe(6)
        expect(JSON.stringify(result.projection)).not.toContain('PATIENT-')
      })

      it('a checkpoint that cannot continue the log is ignored and the log decides (rebuild, not an error)', async () => {
        const { svc, w, id, events } = await seeded(1)
        await w.close()
        // digests are consistent but the state claims the open turn already ended: the tail's
        // own turn/end would be its second one
        await seedCheckpoint(id, events, 2, tenantA, (row) => {
          const state = JSON.parse(JSON.stringify(row.state))
          state.open.endCount = 1
          state.open.end = { stopReason: 'COMPLETED', sequence: 2 }
          return {
            ...row,
            state,
            stateDigest: api.sessionProjectionStateDigest(state)
          }
        })
        const result = await svc.project(id)
        expect(result).toMatchObject({ origin: 'rebuild', cache: 'invalid' })
        expect(result.projection).toEqual(api.projectSession(events))
      })

      it('a hole in the pages of the log is corruption, never a shorter projection', async () => {
        const { w, id } = await seeded(3)
        await w.close()
        // a pool of its own: the patched client must never go back to the shared one
        const ownPool = new Pool({ connectionString: roleUrl, max: 2 })
        const holey = {
          connect: async () => {
            const client = await ownPool.connect()
            const query = client.query.bind(client) as (
              ...a: unknown[]
            ) => Promise<any>
            ;(client as any).query = async (...a: unknown[]) => {
              const result = await query(...a)
              if (/sequence>=/.test(String(a[0])) && result.rows.length > 2)
                return { ...result, rows: result.rows.slice(0, -1) }
              return result
            }
            return client
          }
        }
        const svc = (
          await createPostgresSessionPersistence(
            createPgPhysicalSessionPool({ connectionString: roleUrl }),
            holey as never,
            {
              tenantId: tenantA,
              schemaName: schema,
              maxOpenWriters: 2,
              acquireTimeoutMs: 3000
            }
          )
        ).service as any
        try {
          await expect(svc.project(id)).rejects.toMatchObject({
            name: 'SessionPersistenceCorruptionError',
            message: expect.stringContaining('gap')
          })
        } finally {
          await ownPool.end()
        }
      })

      it('the cache table keeps row level security forced, and an aborted request never gets a cached answer', async () => {
        const flags = await admin.query(
          `SELECT relrowsecurity AS on, relforcerowsecurity AS forced FROM pg_class
            WHERE oid = to_regclass($1)`,
          [`${schema}.session_projection_checkpoints`]
        )
        expect(flags.rows).toEqual([{ on: true, forced: true }])
        const { svc, w, id, events } = await seeded(3)
        await w.close()
        await seedCheckpoint(id, events, events.length)
        const abort = new AbortController()
        abort.abort()
        await expect(
          svc.project(id, { signal: abort.signal })
        ).rejects.toMatchObject({
          name: 'AbortError'
        })
        expect((await svc.project(id)).origin).toBe('cache')
      })

      it('refuses a missing session, a bad id and a request that is already aborted', async () => {
        const svc = await service()
        await expect(svc.project('no-such-session')).rejects.toMatchObject({
          name: 'SessionPersistenceNotFoundError'
        })
        await expect(svc.project('')).rejects.toMatchObject({
          name: 'SessionHeaderValidationError'
        })
        const abort = new AbortController()
        abort.abort()
        await expect(
          svc.project('p1', { signal: abort.signal })
        ).rejects.toMatchObject({
          name: 'AbortError'
        })
      })

      it('the cache guard: only the owner writes, only a real point, never backwards, never beyond the log', async () => {
        const { svc, w, id, events } = await seeded(6)
        await w.close()
        await seedCheckpoint(id, events, 12)
        const head = await admin.query(
          `SELECT header_json FROM ${schema}.session_streams WHERE session_id=$1 AND tenant_id=$2`,
          [id, tenantA]
        )
        const point = async (n: number) =>
          (
            await admin.query(
              `SELECT input_digest FROM ${schema}.session_events WHERE session_id=$1 AND tenant_id=$2 AND sequence=$3`,
              [id, tenantA, n]
            )
          ).rows[0]?.input_digest as string
        const write = async (
          n: number,
          digest: string,
          headerDigest: string
        ) => {
          await asAdmin()
          const row = api.sessionCheckpointRow(
            api.projectSession(events.slice(0, Math.min(n, events.length))),
            head.rows[0].header_json,
            digest
          )
          return admin.query(
            `UPDATE ${schema}.session_projection_checkpoints
                SET through_sequence=$3, tail_input_digest=$4, header_digest=$5, state=$6::jsonb, state_digest=$7
              WHERE tenant_id=$1 AND session_id=$2`,
            [
              tenantA,
              id,
              n,
              digest,
              headerDigest,
              JSON.stringify(row.state),
              row.stateDigest
            ]
          )
        }
        const headerDigest = api.sessionHeaderDigest(head.rows[0].header_json)
        await expect(write(11, await point(11), headerDigest)).rejects.toThrow(
          /only advances/
        )
        await expect(write(18, 'c'.repeat(64), headerDigest)).rejects.toThrow(
          /point differs/
        )
        await expect(
          write(18, await point(18), 'c'.repeat(64))
        ).rejects.toThrow(/header differs/)
        await expect(write(9999, 'c'.repeat(64), headerDigest)).rejects.toThrow(
          /beyond the log/
        )
        await expect(
          write(18, await point(18), headerDigest)
        ).resolves.toBeDefined()
        // another writer owns the stream: its checkpoint is not for anyone else to write
        const owner = await svc.open(id, 'write')
        try {
          const rival = new Client({ connectionString: url })
          await rival.connect()
          try {
            await rival.query("SELECT set_config('cvg.tenant_id', $1, false)", [
              tenantA
            ])
            await expect(
              rival.query(
                `UPDATE ${schema}.session_projection_checkpoints SET created_at = now() WHERE session_id=$1`,
                [id]
              )
            ).rejects.toThrow(/owned by another writer/)
          } finally {
            await rival.end()
          }
        } finally {
          await owner.close()
        }
        await expect(
          admin.query(`TRUNCATE ${schema}.session_projection_checkpoints`)
        ).rejects.toThrow(/not truncated in bulk/)
        // a checkpoint needs its stream
        await asAdmin()
        await expect(
          admin.query(
            `INSERT INTO ${schema}.session_projection_checkpoints
               (tenant_id,session_id,projection_id,projection_version,through_sequence,tail_input_digest,header_digest,state,state_digest)
             VALUES ($1,'no-such-stream','x',1,1,$2,$2,'{}'::jsonb,$2)`,
            [tenantA, 'a'.repeat(64)]
          )
        ).rejects.toThrow()
      })
    })

    describe('slice 3: the owner of the stream writes the checkpoint (SPEC 0292 I8, PJ05, PJ08)', () => {
      const header = (id: string) => ({
        version: 1 as const,
        id,
        createdAt: 1_700_000_000_000,
        isSeeded: false
      })
      const stored = async (id: string, tenantId = tenantA) => {
        const rows = await admin.query(
          `SELECT through_sequence, state FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2`,
          [tenantId, id]
        )
        return rows.rows[0] as
          | { through_sequence: string; state: Record<string, unknown> }
          | undefined
      }
      const lines = (
        tenantId: string,
        id: string,
        from: number,
        count: number
      ) => turns(tenantId, id, from, count)
      const fresh = (name: string) => `${name}-${++seq}`

      it('the original witnesses, with the real writer: close leaves a checkpoint, the next projection is the cache, a short tail is incremental', async () => {
        const id = fresh('w1')
        const svc = await service(tenantA, { projectionCheckpointEvery: 64 })
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 50)
        for (let i = 0; i < events.length; i += 100)
          await w.append(events.slice(i, i + 100))
        await w.close()
        rowsFetched = 0
        const cached = await svc.project(id)
        expect(cached.origin).toBe('cache')
        expect(rowsFetched).toBeLessThanOrEqual(1)
        expect(cached.projection).toEqual(api.projectSession(events))
        const again = await svc.open(id, 'write')
        const tail = lines(tenantA, id, events.length + 1, 1)
        await again.append(tail)
        await again.close()
        rowsFetched = 0
        const result = await svc.project(id)
        expect(result.origin).toBe('incremental')
        expect(rowsFetched).toBeLessThanOrEqual(tail.length + 1)
        expect(result.projection).toEqual(
          api.projectSession([...events, ...tail])
        )
        expect(await verifyProjectionCache(svc, id)).toEqual([])
      })

      it('the append that crosses K writes the checkpoint at once, before any flush or close', async () => {
        const id = fresh('w3')
        const svc = await service(tenantA, { projectionCheckpointEvery: 10 })
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 4) // 16 events: 9 first, then 7
        await w.append(events.slice(0, 9))
        expect(await stored(id)).toBeUndefined()
        await w.append(events.slice(9))
        const row = await stored(id)
        expect(Number(row?.through_sequence)).toBe(16)
        expect(row?.state).toEqual(
          JSON.parse(JSON.stringify(api.projectSession(events)))
        )
        await w.close()
      })

      it('a long session of an open writer is checkpointed every K events and never read back to fold', async () => {
        const id = fresh('w-long')
        const svc = await service(tenantA, { projectionCheckpointEvery: 20 })
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 60) // 240 events, never flushed or closed
        rowsFetched = 0
        const seen: number[] = []
        for (let i = 0; i < events.length; i += 8) {
          await w.append(events.slice(i, i + 8))
          seen.push(Number((await stored(id))?.through_sequence ?? 0))
        }
        // the writer folds in memory: the log was not read again for any of it (PJ05)
        expect(rowsFetched).toBe(0)
        expect(seen.at(-1)).toBeGreaterThanOrEqual(events.length - 19)
        expect(seen.every((n, k) => k === 0 || n >= seen[k - 1]!)).toBe(true)
        const row = await stored(id)
        const through = Number(row?.through_sequence)
        expect(row?.state).toEqual(
          JSON.parse(
            JSON.stringify(api.projectSession(events.slice(0, through)))
          )
        )
        await w.close()
        expect((await svc.project(id)).projection).toEqual(
          api.projectSession(events)
        )
      })

      it('flush and close write the checkpoint when it is due even though no append of this handle crossed K', async () => {
        const id = fresh('w-due')
        const slow = await service(tenantA, {
          projectionCheckpointEvery: 100000
        })
        const first = await slow.create(header(id))
        const events = lines(tenantA, id, 1, 30) // 120 events, no checkpoint under a huge K
        await first.append(events)
        await first.close()
        expect(await stored(id)).toBeUndefined()
        const svc = await service(tenantA, { projectionCheckpointEvery: 50 })
        const w = await svc.open(id, 'write')
        await w.flush()
        expect(Number((await stored(id))?.through_sequence)).toBe(120)
        const more = lines(tenantA, id, 121, 20) // 80 more events
        await w.append(more.slice(0, 5))
        await w.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(120)
        const second = await svc.open(id, 'write')
        await second.append(more.slice(5))
        await second.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(200)
        expect((await svc.project(id)).projection).toEqual(
          api.projectSession([...events, ...more])
        )
      })

      it('a writer that is opened and closed without appending still writes a due checkpoint', async () => {
        const id = fresh('w-close-only')
        const slow = await service(tenantA, {
          projectionCheckpointEvery: 100000
        })
        const first = await slow.create(header(id))
        await first.append(lines(tenantA, id, 1, 30)) // 120 events
        await first.close()
        expect(await stored(id)).toBeUndefined()
        const svc = await service(tenantA, { projectionCheckpointEvery: 50 })
        const w = await svc.open(id, 'write')
        await w.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(120)
      })

      it('the default interval is 256 events', async () => {
        const id = fresh('w-default')
        const svc = await service()
        expect(svc.projectionCheckpointEvery).toBe(256)
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 64) // 256 events
        await w.append(events.slice(0, 255))
        expect(await stored(id)).toBeUndefined()
        await w.append(events.slice(255))
        expect(Number((await stored(id))?.through_sequence)).toBe(256)
        await w.close()
      })

      it('a close with nothing due writes nothing', async () => {
        const id = fresh('w-quiet')
        const svc = await service(tenantA, { projectionCheckpointEvery: 500 })
        const w = await svc.create(header(id))
        await w.append(lines(tenantA, id, 1, 5))
        await w.flush()
        await w.close()
        expect(await stored(id)).toBeUndefined()
      })

      it('the bridge append of the kernel port counts too', async () => {
        const id = fresh('w-bridge')
        const svc = await service(tenantA, { projectionCheckpointEvery: 5 })
        const w = await svc.create(header(id))
        const store = sessionEventStoreForHandle(w)
        const events = lines(tenantA, id, 1, 3) // 12 events: checkpoints at 5 and 10
        for (const e of events) {
          const { sequence: _s, schemaFingerprint: _f, ...input } = e
          void _s
          void _f
          await store.append(input)
        }
        expect(Number((await stored(id))?.through_sequence)).toBe(10)
        const failuresBefore = svc.projectionCacheStats().writeFailures
        // a replay of an event already stored moves nothing and writes nothing
        const { sequence: _s, schemaFingerprint: _f, ...again } = events[0]!
        void _s
        void _f
        await store.append(again)
        expect(Number((await stored(id))?.through_sequence)).toBe(10)
        // and it does not disturb the folded state: no cache failure was counted
        expect(svc.projectionCacheStats().writeFailures).toBe(failuresBefore)
        await w.close()
      })

      it('PJ08: a cache that cannot be written fails neither append, flush nor close; it is counted, backed off and reported', async () => {
        const id = fresh('w-nowrite')
        const svc = await service(tenantA, { projectionCheckpointEvery: 10 })
        const w = await svc.create(header(id))
        await admin.query(
          `REVOKE INSERT, UPDATE ON ${schema}.session_projection_checkpoints FROM ${role}`
        )
        cacheFailures.length = 0
        const before = svc.projectionCacheStats().writeFailures
        const events = lines(tenantA, id, 1, 7) // 28 events in batches of 4
        try {
          for (let i = 0; i < events.length; i += 1)
            await w.append(events.slice(i, i + 1))
          await w.flush()
          await w.close()
        } finally {
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
          )
        }
        const failures = svc.projectionCacheStats().writeFailures - before
        // attempts at 10 and 20 events (each waits for K more), and at the close (28 - 20 < 10: none)
        expect(failures).toBe(2)
        expect(
          cacheFailures.filter(
            (f) => f.operation === 'write' && f.sessionId === id
          )
        ).toHaveLength(2)
        expect(
          cacheFailures.every(
            (f) =>
              f.code === '42501' ||
              f.code === undefined ||
              typeof f.code === 'string'
          )
        ).toBe(true)
        expect(await stored(id)).toBeUndefined()
        expect((await svc.project(id)).projection).toEqual(
          api.projectSession(events)
        )
        expect(await verifyProjectionCache(svc, id)).toContain(
          `${svc.projectionCacheStats().writeFailures} checkpoint write(s) failed`
        )
      })

      it('PJ08: a stream longer than K in a schema without the table still appends, flushes and closes', async () => {
        const bare = `pars02c_${suffix}`
        const { runSessionEventMigrations } =
          await import('../session-events.ts')
        await runSessionEventMigrations(admin, { schemaName: bare })
        try {
          await admin.query(`GRANT USAGE ON SCHEMA ${bare} TO ${role}`)
          await admin.query(
            `GRANT SELECT, INSERT ON ${bare}.session_events, ${bare}.session_streams TO ${role}`
          )
          await admin.query(
            `GRANT UPDATE (next_sequence) ON ${bare}.session_streams TO ${role}`
          )
          await admin.query(
            `GRANT SELECT ON ${bare}.schema_migrations TO ${role}`
          )
          const svc = (
            await createPostgresSessionPersistence(
              createPgPhysicalSessionPool({ connectionString: roleUrl }),
              countingPool() as never,
              {
                tenantId: tenantA,
                schemaName: bare,
                maxOpenWriters: 2,
                acquireTimeoutMs: 3000,
                projectionCheckpointEvery: 8
              }
            )
          ).service as any
          const id = fresh('bare-writer')
          const w = await svc.create(header(id))
          const events = lines(tenantA, id, 1, 6)
          await w.append(events)
          await w.flush()
          await w.close()
          expect(
            svc.projectionCacheStats().writeFailures
          ).toBeGreaterThanOrEqual(1)
          expect((await svc.project(id)).projection).toEqual(
            api.projectSession(events)
          )
        } finally {
          await admin.query(`DROP SCHEMA IF EXISTS ${bare} CASCADE`)
        }
      })

      it('a state over the ceiling is not checkpointed and the failure is counted with its reason', async () => {
        const id = fresh('w-big')
        const svc = await service(tenantA, { projectionCheckpointEvery: 100 })
        const w = await svc.create(header(id))
        cacheFailures.length = 0
        const batch: SessionEvent[] = [
          mk(tenantA, id, 1, 'turn/start', 'big', { correlationId: 'big' })
        ]
        // one open turn with a call that never gets a result: the open group grows with each one
        for (let k = 0; k < 1500; k++)
          batch.push(
            mk(tenantA, id, k + 2, 'tool/call', 'big', {
              correlationId: 'big',
              toolId: `tool-${k % 3}`,
              operationKey: `operation-key-${String(k).padStart(6, '0')}-${'x'.repeat(40)}`,
              input: {}
            })
          )
        for (let i = 0; i < batch.length; i += 100)
          await w.append(batch.slice(i, i + 100))
        await w.close()
        // the early checkpoints fit; the first one over the ceiling was refused and counted
        const last = Number((await stored(id))?.through_sequence)
        expect(last).toBeGreaterThan(0)
        expect(last).toBeLessThan(batch.length)
        expect(cacheFailures.some((f) => f.code === 'state_too_large')).toBe(
          true
        )
        const served = await svc.project(id)
        expect(served.origin).toBe('incremental')
        expect(served.projection).toEqual(api.projectSession(batch))
      })

      it('a reopened writer finds the checkpoint, folds from it and writes the next one without reading the whole log twice', async () => {
        const id = fresh('w-reopen')
        const svc = await service(tenantA, { projectionCheckpointEvery: 40 })
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 20) // 80 events
        await w.append(events)
        await w.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(80)
        const again = await svc.open(id, 'write')
        const more = lines(tenantA, id, 81, 30) // 120 events
        rowsFetched = 0
        await again.append(more)
        await again.close()
        // the checkpoint (80) plus the tail (120) and the point: not the whole 200 and not twice
        expect(rowsFetched).toBeLessThanOrEqual(120 + 1)
        expect(Number((await stored(id))?.through_sequence)).toBe(200)
        expect((await svc.project(id)).origin).toBe('cache')
        // a short append after a checkpoint at the head is below K: nothing is written
        const last = await svc.open(id, 'write')
        await last.append(lines(tenantA, id, 201, 3).slice(0, 2))
        await last.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(200)
      })

      it('slice 4: a resumed writer already holds the projection of the log it analysed, so its first checkpoint reads nothing', async () => {
        const id = fresh('w-resume')
        const slow = await service(tenantA, {
          projectionCheckpointEvery: 100000
        })
        const first = await slow.create(header(id))
        const events = lines(tenantA, id, 1, 25) // 100 events, no checkpoint
        await first.append(events)
        await first.close()
        const svc = await service(tenantA, { projectionCheckpointEvery: 50 })
        const more = lines(tenantA, id, 101, 20)
        // control: a plain open has no projection yet and has to read the log to build one
        const plain = await svc.open(id, 'write')
        rowsFetched = 0
        await plain.append(more.slice(0, 60)) // 100 + 60 events: due
        expect(rowsFetched).toBeGreaterThan(0)
        await plain.close()
        expect(Number((await stored(id))?.through_sequence)).toBe(160)
        // resumed: the full read for the analysis seeds the owner; nothing is read again
        const id2 = fresh('w-resume2')
        const other = await slow.create(header(id2))
        const events2 = lines(tenantA, id2, 1, 25)
        await other.append(events2)
        await other.close()
        const { handle, analysis } = await svc.resumeSession(id2)
        expect(analysis.turns).toHaveLength(25)
        rowsFetched = 0
        await handle.append(lines(tenantA, id2, 101, 20).slice(0, 60))
        expect(rowsFetched).toBe(0)
        expect(Number((await stored(id2))?.through_sequence)).toBe(160)
        await handle.close()
        expect((await svc.project(id2)).projection).toEqual(
          api.projectSession([
            ...events2,
            ...lines(tenantA, id2, 101, 20).slice(0, 60)
          ])
        )
      })

      it('a fork child is written with the same rule and does not inherit the cache', async () => {
        const id = fresh('w-fork-src')
        const svc = await service(tenantA, { projectionCheckpointEvery: 6 })
        const w = await svc.create(header(id))
        const events = lines(tenantA, id, 1, 3)
        await w.append(events)
        await w.close()
        const childId = `${id}-child`
        const child = await svc.fork(id, header(childId))
        expect(await stored(childId)).toBeUndefined()
        const failuresBefore = svc.projectionCacheStats().writeFailures
        const extra = lines(
          tenantA,
          childId,
          child.inheritedEventCount + 1,
          3
        ).map((e, i) => ({
          ...e,
          eventId: `${childId}-x${i}`
        }))
        await child.append(extra)
        await child.close()
        expect(Number((await stored(childId))?.through_sequence)).toBe(24)
        // the child starts from its inherited head: its projection is rebuilt once, not mis-folded
        expect(svc.projectionCacheStats().writeFailures).toBe(failuresBefore)
        expect((await svc.project(childId)).origin).toBe('cache')
      })

      it('the checkpoint interval must be a positive integer', async () => {
        for (const bad of [0, -1, 1.5, Number.NaN]) {
          await expect(
            createPostgresSessionPersistence(
              createPgPhysicalSessionPool({ connectionString: roleUrl }),
              countingPool() as never,
              {
                tenantId: tenantA,
                schemaName: schema,
                maxOpenWriters: 1,
                projectionCheckpointEvery: bad
              }
            )
          ).rejects.toMatchObject({ name: 'SessionHeaderValidationError' })
        }
      })
    })
  }
)
