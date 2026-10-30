// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the not-yet-existing API is reached dynamically */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
import * as harness from '@cvg/harness'
import { materializeSessionEvent } from '@cvg/harness'
import { runSessionEventMigrations } from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence
} from '../session-persistence.ts'

// PAR-S02 phase 1 (SPEC 0292): the cost control is live; the `it.fails` bodies specify the
// checkpointed projection service. The markers come off in BUILD, never replaced by a weaker check.
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
const service = (tenantId = tenantA) =>
  createPostgresSessionPersistence(
    createPgPhysicalSessionPool({ connectionString: roleUrl }),
    countingPool() as never,
    { tenantId, schemaName: schema, maxOpenWriters: 4, acquireTimeoutMs: 3000 }
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

describe.skipIf(!url)(
  'PAR-S02 phase 1: projections with checkpoint cache',
  () => {
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
      await admin.query(
        `GRANT SELECT ON ${schema}.schema_migrations TO ${role}`
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

    it.fails(
      'first projection is a rebuild equal to the pure projection of the whole log',
      async () => {
        const { svc, w, id, events } = await seeded(10)
        await w.close()
        const result = await svc.project(id)
        expect(result.origin).toBe('rebuild')
        expect(result.projection).toEqual(api.projectSession(events))
      }
    )

    it.fails(
      'after the writer closes, the next projection comes from the checkpoint and reads at most the tail row',
      async () => {
        const { svc, w, id, events } = await seeded(50)
        await w.close()
        await svc.project(id)
        rowsFetched = 0
        const again = await svc.project(id)
        expect(again.origin).toBe('cache')
        expect(rowsFetched).toBeLessThanOrEqual(1)
        expect(again.projection).toEqual(api.projectSession(events))
      }
    )

    it.fails(
      'events appended after the checkpoint are folded incrementally, reading only the tail',
      async () => {
        const { svc, w, id, events } = await seeded(50)
        await w.close()
        await svc.project(id)
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
      }
    )

    it.fails(
      'a tampered checkpoint is never served: its state digest fails and the projection is rebuilt',
      async () => {
        const { svc, w, id, events } = await seeded(20)
        await w.close()
        await svc.project(id)
        await admin.query(
          `UPDATE ${schema}.session_projection_checkpoints SET state = jsonb_set(state, '{turns,total}', '99') WHERE session_id=$1`,
          [id]
        )
        const result = await svc.project(id)
        expect(result.origin).toBe('rebuild')
        expect(result.projection).toEqual(api.projectSession(events))
      }
    )

    it.fails(
      'a checkpoint of another projection version is ignored',
      async () => {
        const { svc, w, id } = await seeded(20)
        await w.close()
        await svc.project(id)
        await admin.query(
          `UPDATE ${schema}.session_projection_checkpoints SET projection_version = projection_version + 1 WHERE session_id=$1`,
          [id]
        )
        expect((await svc.project(id)).origin).toBe('rebuild')
      }
    )

    it.fails(
      'checkpoints never cross tenants, even for the same session id',
      async () => {
        const a = await seeded(5, tenantA)
        await a.w.close()
        await a.svc.project(a.id)
        const svcB = await service(tenantB)
        await expect(svcB.project(a.id)).rejects.toMatchObject({
          name: 'SessionPersistenceNotFoundError'
        })
        const rows = await admin.query(
          `SELECT tenant_id FROM ${schema}.session_projection_checkpoints WHERE session_id=$1`,
          [a.id]
        )
        expect(rows.rows.map((r) => r.tenant_id)).toEqual([tenantA])
      }
    )

    it.fails(
      'a cache that cannot be read or written never fails the projection',
      async () => {
        const { svc, w, id, events } = await seeded(10)
        await w.close()
        await svc.project(id)
        await admin.query(
          `REVOKE ALL ON ${schema}.session_projection_checkpoints FROM ${role}`
        )
        const result = await svc.project(id)
        expect(result.origin).toBe('rebuild')
        expect(result.projection).toEqual(api.projectSession(events))
      }
    )

    it.fails('the stored checkpoint holds no message text', async () => {
      const { svc, w, id } = await seeded(5)
      await w.close()
      await svc.project(id)
      const rows = await admin.query(
        `SELECT state::text AS s FROM ${schema}.session_projection_checkpoints WHERE session_id=$1`,
        [id]
      )
      expect(rows.rows[0].s).not.toContain('PATIENT-')
    })
  }
)
