import { describe, expect, it } from 'vitest'
import { SESSION_EVENT_CATALOG_V1 } from '@cvg/harness-contracts'
import type { SessionEvent, SessionEventStore } from '@cvg/harness-contracts'
import { SessionEventError } from '@cvg/harness'
import { buildServer } from '../server.ts'

// SPEC 0296 (PAR-A01), phase-1 RED witnesses. The controls pass today and pin what the SPEC
// keeps or changes; the `it.fails` cases name the behaviour the BUILD must deliver and fail
// until then (today every request ends at 404: the route does not exist).
const OPERATOR = {
  'x-operator-id': 'supervisor.shift-a',
  'x-operator-role': 'Supervisor'
}
const TENANT_A = 'tenant_a1_synthetic'
const TENANT_B = 'tenant_b1_synthetic'

const event = (tenantId: string, sessionId: string, sequence: number) =>
  ({
    tenantId,
    sessionId,
    formatVersion: 1,
    sequence,
    eventId: `evt_${sessionId}_${sequence}`,
    timestamp: '2026-10-31T00:00:00.000Z',
    correlationId: `corr_${sessionId}`,
    traceId: `trace_${sessionId}`,
    type: 'turn/start',
    payload: {},
    schemaFingerprint: 'a'.repeat(64)
  }) as unknown as SessionEvent

/** Committed events per tenant/session, read incrementally like the real store. */
function store(
  streams: Record<string, readonly number[]>,
  tenantId: string
): SessionEventStore {
  return {
    openSession: async (input) => input,
    append: async () => {
      throw new Error('not used')
    },
    read: async (input) => {
      const sequences = streams[`${input.tenantId}|${input.sessionId}`]
      if (!sequences || input.tenantId !== tenantId)
        throw new SessionEventError('session_not_open', 'not found')
      return sequences
        .filter((n) => n > (input.afterSequence ?? 0))
        .slice(0, input.limit ?? 100)
        .map((n) => event(input.tenantId, input.sessionId, n))
    }
  }
}

const server = (sessionEvents: SessionEventStore) =>
  buildServer({ sessionEvents } as never)
const get = (
  app: ReturnType<typeof server>,
  url: string,
  headers: Record<string, string> = {}
) => app.inject({ method: 'GET', url, headers: { ...OPERATOR, ...headers } })

/** The `id:` lines of an SSE body, in order. */
const ids = (body: string) =>
  body
    .split('\n')
    .filter((line) => line.startsWith('id: '))
    .map((line) => Number(line.slice(4)))

describe('PAR-A01 baseline controls (pass today, pinned by the SPEC)', () => {
  it('there is no stream route today', async () => {
    const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 3] }, TENANT_A))
    const res = await get(app, '/v1/sessions/s1/events/stream')
    expect(res.statusCode).toBe(404)
    expect(res.headers['content-type']).not.toContain('text/event-stream')
  })

  it('baseline pin: the log carries committed facts only, no token delta and no live-control event', () => {
    const types = Object.keys(SESSION_EVENT_CATALOG_V1.events)
    expect(types).toEqual(
      expect.arrayContaining([
        'turn/start',
        'turn/end',
        'tool/call',
        'tool/result'
      ])
    )
    for (const type of types) {
      expect(type).not.toMatch(/delta|pause|resume|cancel|control/)
    }
  })
})

describe('PAR-A01 RED witnesses (fail until the BUILD)', () => {
  it.fails(
    'RED-1: a committed session streams as text/event-stream with the sequence as id',
    async () => {
      const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 3] }, TENANT_A))
      const res = await get(
        app,
        '/v1/sessions/s1/events/stream?after=0&maxEvents=3'
      )
      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toContain('text/event-stream')
      expect(res.headers['cache-control']).toContain('no-store')
      expect(ids(res.body)).toEqual([1, 2, 3])
      expect(res.body).toContain('event: end')
    }
  )

  it.fails(
    'RED-2: reconnecting with Last-Event-ID neither loses nor repeats an event',
    async () => {
      const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 3, 4] }, TENANT_A))
      const first = await get(app, '/v1/sessions/s1/events/stream?maxEvents=2')
      const second = await get(
        app,
        '/v1/sessions/s1/events/stream?maxEvents=2',
        {
          'last-event-id': '2'
        }
      )
      expect([...ids(first.body), ...ids(second.body)]).toEqual([1, 2, 3, 4])
    }
  )

  it.fails(
    'RED-3: a session of another tenant answers like a missing one',
    async () => {
      const app = server(store({ [`${TENANT_B}|foreign`]: [1, 2] }, TENANT_A))
      const foreign = await get(app, '/v1/sessions/foreign/events/stream')
      const missing = await get(app, '/v1/sessions/missing/events/stream')
      expect(foreign.statusCode).toBe(404)
      expect(foreign.body).toBe(missing.body.replace('missing', 'foreign'))
      expect(foreign.body).not.toContain('evt_')
    }
  )

  it.fails(
    'RED-4: a gap in the sequence ends the stream and the later event is never sent',
    async () => {
      const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 4] }, TENANT_A))
      const res = await get(app, '/v1/sessions/s1/events/stream?maxEvents=10')
      expect(ids(res.body)).toEqual([1, 2])
      expect(res.body).toContain('sequence_gap')
    }
  )

  it.fails(
    'RED-5: two different cursors are invalid, and a cursor ahead of the log is a conflict',
    async () => {
      const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 3] }, TENANT_A))
      const both = await get(app, '/v1/sessions/s1/events/stream?after=1', {
        'last-event-id': '2'
      })
      expect(both.statusCode).toBe(400)
      const ahead = await get(app, '/v1/sessions/s1/events/stream?after=9')
      expect(ahead.statusCode).toBe(409)
    }
  )

  it.fails(
    'RED-6: the stream carries the projection of the event, never a tool input',
    async () => {
      const withInput = {
        ...event(TENANT_A, 's1', 1),
        type: 'tool/call',
        payload: {
          correlationId: 'c',
          toolId: 'exam.lookup',
          operationKey: 'op-1',
          input: { patient: 'DADO-SINTETICO-SENSIVEL' }
        }
      } as unknown as SessionEvent
      const app = server({
        openSession: async (i) => i,
        append: async () => {
          throw new Error('not used')
        },
        read: async (i) => ((i.afterSequence ?? 0) < 1 ? [withInput] : [])
      })
      const res = await get(app, '/v1/sessions/s1/events/stream?maxEvents=1')
      expect(res.body).toContain('exam.lookup')
      expect(res.body).not.toContain('DADO-SINTETICO-SENSIVEL')
    }
  )
})
