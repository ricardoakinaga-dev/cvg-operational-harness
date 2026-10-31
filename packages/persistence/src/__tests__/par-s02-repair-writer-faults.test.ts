// @vitest-environment node
// PAR-S02 repair (07): regression for the Codex finding, oracle taken from the independent review
// (docs/04_audit/evidence/AUD0625-REVIEW-S02-S234-CODEX-20261031/own-oracles, tests unchanged except
// imports and the removal of the trace file writes). RED against dc4036e30.
/* eslint-disable @typescript-eslint/no-explicit-any -- the not-yet-existing API is reached dynamically */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
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

/**
 * Fault injection on the owner connection, deterministic: a statement whose text matches fails with
 * `error` before it reaches PostgreSQL (the open transaction is then really rolled back, or not,
 * as the rule says). Used for the codes that are hard to provoke on a real server.
 */
interface Fault {
  readonly match: RegExp
  readonly error: Error & { code?: string }
  times: number
}
const faults: Fault[] = []
const fail = (code: string) =>
  Object.assign(new Error(`injected ${code}`), { code })
const faultyPool = (real: any) => ({
  acquire: async (options: unknown) => {
    const lease = await real.acquire(options)
    return new Proxy(lease, {
      get(target, property) {
        if (property === 'query')
          return async (text: string, values?: unknown[]) => {
            const fault = faults.find((f) => f.times > 0 && f.match.test(text))
            if (fault) {
              fault.times -= 1
              throw fault.error
            }
            return target.query(text, values)
          }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      }
    })
  }
})

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
    faultyPool(createPgPhysicalSessionPool({ connectionString: roleUrl })),
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

    afterEach(() => {
      faults.length = 0
    })
    const outcome = async (job: Promise<unknown>) =>
      job.then(
        () => ({ ok: true as const }),
        (error: any) => ({ ok: false as const, name: error.name as string })
      )
    const CHECKPOINT_WRITE = /INSERT INTO .*session_projection_checkpoints/
    const EVENT_WRITE = /INSERT INTO .*session_events/
    // K = 4: the first four events are written (and checkpointed) by `seeded`; the next turn makes the next one due
    const next = (id: string) => turns(tenantA, id, 5, 1)

    it('control: no fault, the checkpoint at 8 is written and the writer goes on', async () => {
      const { svc, w, id } = await seeded(1)
      try {
        expect(await outcome(w.append(next(id)))).toEqual({ ok: true })
        expect(svc.projectionCacheStats().writeFailures).toBe(0)
      } finally {
        await w.close()
      }
    })

    it.each(['57014', '55P03'])(
      'contention (%s) on the checkpoint row with a clean rollback leaves the canonical writer usable',
      async (code) => {
        const { svc, w, id } = await seeded(1)
        try {
          faults.push({ match: CHECKPOINT_WRITE, error: fail(code), times: 1 })
          expect(await outcome(w.append(next(id)))).toEqual({ ok: true })
          expect(svc.projectionCacheStats().writeFailures).toBe(1)
          expect(await outcome(w.flush())).toEqual({ ok: true })
          expect(await outcome(w.append(turns(tenantA, id, 9, 1)))).toEqual({
            ok: true
          })
          // the events are in the log whatever happened to the cache
          const head = await admin.query(
            `SELECT next_sequence-1 AS head FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
            [tenantA, id]
          )
          expect(Number(head.rows[0].head)).toBe(12)
        } finally {
          await w.close().catch(() => undefined)
        }
      },
      30_000
    )

    it('a timeout whose ROLLBACK fails is a real loss: the writer is refused afterwards', async () => {
      const { w, id } = await seeded(1)
      try {
        faults.push({ match: CHECKPOINT_WRITE, error: fail('57014'), times: 1 })
        faults.push({ match: /^ROLLBACK$/, error: fail('08006'), times: 1 })
        await w.append(next(id)).catch(() => undefined)
        expect(await outcome(w.append(turns(tenantA, id, 9, 1)))).toEqual({
          ok: false,
          name: 'SessionOwnershipLostError'
        })
      } finally {
        await w.close().catch(() => undefined)
      }
    }, 30_000)

    it.each(['57P01', '08006', '57P03'])(
      'a derived write that fails with %s (connection or server going away) is still a loss',
      async (code) => {
        const { w, id } = await seeded(1)
        try {
          faults.push({ match: CHECKPOINT_WRITE, error: fail(code), times: 1 })
          await w.append(next(id)).catch(() => undefined)
          expect(await outcome(w.append(turns(tenantA, id, 9, 1)))).toEqual({
            ok: false,
            name: 'SessionOwnershipLostError'
          })
        } finally {
          await w.close().catch(() => undefined)
        }
      },
      30_000
    )

    it.each(['57014', '55P03'])(
      'the same contention (%s) on a CANONICAL write keeps the terminal classification',
      async (code) => {
        const { w, id } = await seeded(1)
        try {
          faults.push({ match: EVENT_WRITE, error: fail(code), times: 1 })
          expect(await outcome(w.append(next(id)))).toEqual({
            ok: false,
            name: 'SessionOwnershipLostError'
          })
          expect(await outcome(w.append(next(id)))).toEqual({
            ok: false,
            name: 'SessionOwnershipLostError'
          })
        } finally {
          await w.close().catch(() => undefined)
        }
      },
      30_000
    )

    it('an ordinary derived failure (privilege) stays what it was: the cache fails, the writer does not', async () => {
      const { svc, w, id } = await seeded(1)
      try {
        faults.push({ match: CHECKPOINT_WRITE, error: fail('42501'), times: 1 })
        expect(await outcome(w.append(next(id)))).toEqual({ ok: true })
        expect(svc.projectionCacheStats().writeFailures).toBe(1)
        expect(await outcome(w.append(turns(tenantA, id, 9, 1)))).toEqual({
          ok: true
        })
      } finally {
        await w.close().catch(() => undefined)
      }
    }, 30_000)
  }
)
