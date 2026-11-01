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

    it.each(['cache', 'incremental'])(
      'a structurally malformed but correctly digested open group must be ignored on %s',
      async (origin) => {
        const { svc, w, id, events } = await seeded(3)
        await w.close()
        await seedCheckpoint(
          id,
          events,
          origin === 'cache' ? events.length : 2,
          tenantA,
          (row: any) => {
            const state = JSON.parse(JSON.stringify(row.state))
            state.open = {} // no arrays, ids, start, or counters: never a valid OpenGroup
            return {
              ...row,
              state,
              stateDigest: api.sessionProjectionStateDigest(state)
            }
          }
        )
        const actual = await svc.project(id).then(
          (result: any) => ({ result }),
          (error: any) => ({
            error: {
              name: error.name,
              message: error.message,
              cause: error.cause?.message
            }
          })
        )
        expect(actual).toMatchObject({
          result: {
            origin: 'rebuild',
            cache: 'invalid',
            projection: api.projectSession(events)
          }
        })
      }
    )
  }
)
