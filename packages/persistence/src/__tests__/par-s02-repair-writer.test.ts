// @vitest-environment node
// PAR-S02 repair (07): regression for the Codex finding, oracle taken from the independent review
// (docs/04_audit/evidence/AUD0625-REVIEW-S02-S234-CODEX-20261031/own-oracles, tests unchanged except
// imports and the removal of the trace file writes). RED against dc4036e30.
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
  createPostgresSessionPersistence
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
const api = harness as unknown as Record<string, any>

let admin: Client
let basePool: Pool
let roleUrl: string
const countingPool = () => ({
  connect: async () => {
    const client = await basePool.connect()
    return client
  }
})
const cacheFailures: { operation: string; sessionId: string }[] = []
const service = (tenantId = tenantA) =>
  createPostgresSessionPersistence(
    createPgPhysicalSessionPool({ connectionString: roleUrl }),
    countingPool() as never,
    {
      tenantId,
      schemaName: schema,
      maxOpenWriters: 4,
      projectionCheckpointEvery: 4,
      acquireTimeoutMs: 3000,
      onProjectionCacheFailure: (f) => cacheFailures.push(f)
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

    // Independent writer controls; author's setup is adapted, production code is unchanged.
    const outcome = async (job: Promise<unknown>) =>
      job.then(
        () => ({ ok: true }),
        (error: any) => ({
          ok: false,
          error: {
            name: error.name,
            message: error.message,
            cause: error.cause?.message,
            code: error.cause?.code
          }
        })
      )
    const cacheAt = async (id: string) =>
      Number(
        (
          await admin.query(
            `SELECT through_sequence FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2`,
            [tenantA, id]
          )
        ).rows[0]?.through_sequence ?? 0
      )
    it('control: K4 checkpoints and the next append and flush remain usable without row contention', async () => {
      const { svc, w, id, events } = await seeded(1)
      try {
        expect(await cacheAt(id)).toBe(4)
        const next = turns(tenantA, id, 5, 1)
        await w.append(next)
        await w.flush()
        expect(await cacheAt(id)).toBe(8)
        expect((await svc.project(id)).projection).toEqual(
          api.projectSession([...events, ...next])
        )
        expect(svc.projectionCacheStats().writeFailures).toBe(0)
      } finally {
        await w.close()
      }
    })
    // Derived writes wait for a locked row briefly (SET LOCAL lock_timeout): the append that finds
    // the cache row held by someone else costs a fraction of a second, not the statement timeout.
    it('a locked cache row costs the append well under the 5 s statement timeout, and keeps the writer', async () => {
      const { svc, w, id } = await seeded(1)
      let locked = false
      try {
        await admin.query('BEGIN')
        locked = true
        await admin.query(
          `SELECT session_id FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE`,
          [tenantA, id]
        )
        const before = svc.projectionCacheStats().writeFailures
        const started = Date.now()
        await w.append(turns(tenantA, id, 5, 1))
        const elapsed = Date.now() - started
        await admin.query('ROLLBACK')
        locked = false
        expect(elapsed).toBeLessThan(2500)
        expect(svc.projectionCacheStats().writeFailures).toBe(before + 1)
        expect(cacheFailures.at(-1)).toMatchObject({
          operation: 'write',
          sessionId: id,
          code: '55P03'
        })
        // the owner is still the owner: the next append goes through
        await w.append(turns(tenantA, id, 9, 1))
        await w.flush()
      } finally {
        if (locked) await admin.query('ROLLBACK')
        await w.close().catch(() => undefined)
      }
    }, 30_000)

    // The short wait is the derived write's only: a canonical write keeps the 5 s lock timeout.
    it('a canonical write still waits for a row held longer than the derived limit', async () => {
      const { w, id } = await seeded(1)
      let locked = false
      try {
        await admin.query('BEGIN')
        locked = true
        await admin.query(
          `SELECT session_id FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE`,
          [tenantA, id]
        )
        const started = Date.now()
        const appending = w.append(turns(tenantA, id, 5, 1))
        await new Promise((resolve) => setTimeout(resolve, 1000))
        await admin.query('ROLLBACK')
        locked = false
        await appending
        expect(Date.now() - started).toBeGreaterThanOrEqual(900)
      } finally {
        if (locked) await admin.query('ROLLBACK')
        await w.close().catch(() => undefined)
      }
    }, 30_000)

    it('a cache-row lock timeout after the event commit must not poison the canonical writer after rollback', async () => {
      const { svc, w, id } = await seeded(1)
      let locked = false
      let first: any,
        flushed: any,
        second: any,
        headAfter: number = 0,
        stats: any
      try {
        expect(await cacheAt(id)).toBe(4)
        await admin.query('BEGIN')
        locked = true
        const row = await admin.query(
          `SELECT session_id FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE`,
          [tenantA, id]
        )
        expect(row.rowCount).toBe(1)
        first = await outcome(w.append(turns(tenantA, id, 5, 1)))
        await admin.query('ROLLBACK')
        locked = false
        headAfter = Number(
          (
            await admin.query(
              `SELECT next_sequence-1 AS head FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
              [tenantA, id]
            )
          ).rows[0].head
        )
        flushed = await outcome(w.flush())
        second = await outcome(w.append(turns(tenantA, id, 9, 1)))
        stats = svc.projectionCacheStats()
      } finally {
        if (locked) await admin.query('ROLLBACK')
        await w.close().catch(() => {})
      }
      expect(first).toEqual({ ok: true })
      expect(headAfter).toBe(8)
      expect(stats.writeFailures).toBeGreaterThan(0)
      expect(flushed).toEqual({ ok: true })
      expect(second).toEqual({ ok: true })
    }, 30_000)
  }
)
