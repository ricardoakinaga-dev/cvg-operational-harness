// @vitest-environment node
// PAR-S02 repair (07): regression for S02-REPAIR-F04 (Codex re-review e64384dcd). Oracle taken from
// docs/04_audit/evidence/AUD0625-REVIEW-S02-REPAIR-CODEX-20261031/own-oracles; changes: the trace
// writes are gone, the PG half skips without TEST_DATABASE_URL, the pure half also checks that the
// verdict does not depend on the poisoned state being hashed (cheap refusal). RED against 45bb0e6f0.
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  materializeSessionEvent,
  projectSession,
  sessionCheckpointRow,
  judgeSessionCheckpoint,
  SESSION_PROJECTION_ID
} from '@cvg/harness'
import type { SessionEvent } from '@cvg/harness-contracts'
import { runSessionProjectionMigrations } from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence
} from '../session-persistence.ts'

const url = process.env.TEST_DATABASE_URL
const suffix = randomBytes(5).toString('hex')
const schema = `s02native_${suffix}`
const role = `s02native_role_${suffix}`
const tenantId = 'synthetic-native-lease'
const password = 'synthetic-local-only'
let admin: Client
let readPool: Pool
let roleUrl: string
const turn = (id: string, from: number): SessionEvent[] => {
  const correlationId = `c${from}`
  const definitions: [SessionEvent['type'], Record<string, unknown>][] = [
    ['message/user', { text: 'synthetic input' }],
    ['turn/start', { correlationId }],
    ['turn/end', { correlationId, stopReason: 'COMPLETED' }],
    ['message/assistant', { text: 'synthetic answer' }]
  ]
  return definitions.map(([type, payload], index) =>
    materializeSessionEvent(
      {
        tenantId,
        sessionId: id,
        formatVersion: 1,
        eventId: `${id}-${from + index}`,
        timestamp: '2026-10-31T00:00:00.000Z',
        correlationId,
        traceId: 'synthetic-trace',
        type,
        payload
      } as never,
      from + index
    )
  )
}

const poisoned = (stateInput: unknown, kind: string) => {
  const state = JSON.parse(JSON.stringify(stateInput))
  if (kind === 'nodes') {
    expect(state.closed.last).toBeDefined()
    state.closed.last.uncertainEffects = Array(20001).fill('k')
  } else {
    let nested: unknown = null
    for (let i = 0; i < 70; i++) nested = { extra: nested }
    state.extra = nested
  }
  return state
}
const errors = (error: unknown) => {
  const e = error as Error & {
    code?: string
    cause?: Error & { code?: string }
  }
  return {
    name: e.name,
    code: e.code ?? null,
    message: e.message,
    causeName: e.cause?.name ?? null,
    causeCode: e.cause?.code ?? null
  }
}
const eventsFor = (id: string) => [
  ...turn(id, 1),
  ...turn(id, 5),
  ...turn(id, 9)
]
it.each(['depth', 'nodes'])(
  'pure judge refuses %s overflow instead of throwing',
  (kind) => {
    const projection = projectSession(eventsFor('pure'))
    const headerText =
      '{"version":1,"id":"pure","createdAt":1,"isSeeded":false}'
    const normal = sessionCheckpointRow(projection, headerText, 'a'.repeat(64))
    const row = {
      ...normal,
      state: poisoned(normal.state, kind),
      stateDigest: '0'.repeat(64)
    }
    let result: unknown
    try {
      result = judgeSessionCheckpoint(row, { headerText, head: 12 })
    } catch (error) {
      result = { threw: errors(error) }
    }
    expect(result).toMatchObject({ ok: false })
  }
)

it('pure judge does not mask a failure that is not a canonicalization limit', () => {
  const projection = projectSession(eventsFor('pure-real'))
  const headerText =
    '{"version":1,"id":"pure-real","createdAt":1,"isSeeded":false}'
  const normal = sessionCheckpointRow(projection, headerText, 'a'.repeat(64))
  const state = JSON.parse(JSON.stringify(normal.state))
  Object.defineProperty(state, 'boom', {
    enumerable: true,
    get() {
      throw new Error('real failure')
    }
  })
  expect(() =>
    judgeSessionCheckpoint(
      { ...normal, state, stateDigest: '0'.repeat(64) },
      { headerText, head: 12 }
    )
  ).toThrow('real failure')
})

describe.skipIf(!url)(
  'PAR-S02 repair: invalid checkpoint rebuilds from the intact log (PG)',
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
        `GRANT UPDATE(next_sequence) ON ${schema}.session_streams TO ${role}`
      )
      await admin.query(
        `GRANT SELECT ON ${schema}.schema_migrations TO ${role}`
      )
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE ON ${schema}.session_projection_checkpoints TO ${role}`
      )
      const bound = new URL(url!)
      bound.username = role
      bound.password = password
      roleUrl = bound.toString()
      readPool = new Pool({ connectionString: roleUrl, max: 4 })
    })
    afterAll(async () => {
      await readPool?.end()
      await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await admin?.query(`DROP ROLE IF EXISTS ${role}`)
      await admin?.end()
    })

    it.each(['cache', 'incremental'])(
      'normal checkpoint still serves %s control',
      async (origin) => {
        const result = await exercise(origin, 'normal')
        expect(result).toMatchObject({ result: { origin, cache: 'hit' } })
      }
    )
    it.each([
      ['cache', 'depth'],
      ['incremental', 'depth'],
      ['cache', 'nodes'],
      ['incremental', 'nodes']
    ])('invalid checkpoint %s/%s must use intact log', async (origin, kind) => {
      const actual = await exercise(origin, kind)
      expect(actual).toMatchObject({
        result: {
          origin: 'rebuild',
          cache: 'invalid',
          projection: projectSession(eventsFor(`invalid-${origin}-${kind}`))
        }
      })
    })
    async function exercise(origin: string, kind: string) {
      const id = `invalid-${origin}-${kind}`
      const physical = createPgPhysicalSessionPool({
        connectionString: roleUrl
      })
      const { service } = await createPostgresSessionPersistence(
        physical,
        readPool,
        {
          tenantId,
          schemaName: schema,
          maxOpenWriters: 2,
          projectionCheckpointEvery: 1024,
          acquireTimeoutMs: 3000
        }
      )
      const writer = await service.create({
        version: 1,
        id,
        createdAt: 1,
        isSeeded: false
      })
      const events = eventsFor(id)
      await writer.append(events)
      await writer.close()
      const through = origin === 'cache' ? 12 : 8
      const stream = await admin.query(
        `SELECT header_json FROM ${schema}.session_streams WHERE tenant_id=$1 AND session_id=$2`,
        [tenantId, id]
      )
      const point = await admin.query(
        `SELECT input_digest FROM ${schema}.session_events WHERE tenant_id=$1 AND session_id=$2 AND sequence=$3`,
        [tenantId, id, through]
      )
      const normal = sessionCheckpointRow(
        projectSession(events.slice(0, through)),
        stream.rows[0].header_json,
        point.rows[0].input_digest
      )
      const row =
        kind === 'normal'
          ? normal
          : {
              ...normal,
              state: poisoned(normal.state, kind),
              stateDigest: '0'.repeat(64)
            }
      await admin.query("SELECT set_config('cvg.tenant_id',$1,false)", [
        tenantId
      ])
      // Normal migration constraints/triggers remain enabled; no log row is modified.
      await admin.query(
        `INSERT INTO ${schema}.session_projection_checkpoints
      (tenant_id,session_id,projection_id,projection_version,through_sequence,tail_input_digest,header_digest,state,state_digest)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
      ON CONFLICT(tenant_id,session_id,projection_id) DO UPDATE SET
      projection_version=EXCLUDED.projection_version,through_sequence=EXCLUDED.through_sequence,
      tail_input_digest=EXCLUDED.tail_input_digest,header_digest=EXCLUDED.header_digest,
      state=EXCLUDED.state,state_digest=EXCLUDED.state_digest`,
        [
          tenantId,
          id,
          SESSION_PROJECTION_ID,
          row.projectionVersion,
          row.throughSequence,
          row.tailInputDigest,
          row.headerDigest,
          JSON.stringify(row.state),
          row.stateDigest
        ]
      )
      const size = await admin.query(
        `SELECT octet_length(state::text) AS bytes FROM ${schema}.session_projection_checkpoints WHERE tenant_id=$1 AND session_id=$2`,
        [tenantId, id]
      )
      const actual = await service.project(id).then(
        (result) => ({ result }),
        (error) => ({ error: errors(error) })
      )
      expect(Number(size.rows[0].bytes)).toBeLessThan(262144)
      return actual
    }
  }
)
