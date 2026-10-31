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

const server = (
  sessionEvents: SessionEventStore,
  options: Record<string, unknown> = {}
) =>
  buildServer({
    sessionEventStreams: { events: sessionEvents, ...options }
  } as never)
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
    'RED-5: the header is the resume position when it is not below ?after=; a header below it is invalid; a cursor ahead of the log is a conflict',
    async () => {
      const app = server(store({ [`${TENANT_A}|s1`]: [1, 2, 3, 4] }, TENANT_A))
      // the EventSource reconnection: same URL (?after=1) plus the last id seen (2)
      const resumed = await get(
        app,
        '/v1/sessions/s1/events/stream?after=1&maxEvents=2',
        { 'last-event-id': '2' }
      )
      expect(resumed.statusCode).toBe(200)
      expect(ids(resumed.body)).toEqual([3, 4])
      const below = await get(app, '/v1/sessions/s1/events/stream?after=2', {
        'last-event-id': '1'
      })
      expect(below.statusCode).toBe(400)
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

// R1 (review of the session 07, P3-7): `inject` waits for the end of the response and cannot reach
// cancellation, slow readers, revocation or shutdown; these witnesses use a real listener and a
// client that reads by chunks. They fail today because the route does not exist.
describe('PAR-A01 R1 witnesses with a real listener (fail until the BUILD)', () => {
  const listen = async (
    sessionEvents: SessionEventStore,
    options: Record<string, unknown> = {}
  ) => {
    const app = server(sessionEvents, options)
    const base = await app.listen({ port: 0, host: '127.0.0.1' })
    return { app, base }
  }
  const open = (base: string, path: string, signal?: AbortSignal) =>
    fetch(`${base}${path}`, {
      headers: OPERATOR,
      ...(signal ? { signal } : {})
    })

  it.fails(
    'RED-7: a cancelled stream gives its slot back (one stream per operator)',
    async () => {
      const { app, base } = await listen(
        store({ [`${TENANT_A}|s1`]: [1, 2, 3] }, TENANT_A),
        { limits: { perOperator: 1 } }
      )
      try {
        const abort = new AbortController()
        const first = await open(
          base,
          '/v1/sessions/s1/events/stream',
          abort.signal
        )
        expect(first.status).toBe(200)
        // R3 (D11): the transient refusal is in band, so the native EventSource keeps retrying
        const second = await open(base, '/v1/sessions/s1/events/stream')
        expect(second.status).toBe(200)
        const refused = await second.text()
        expect(refused).toContain('retry: ')
        expect(refused).toContain('event: end')
        expect(refused).toContain('too_many_streams')
        expect(ids(refused)).toEqual([])
        expect(refused).not.toContain('event: session')
        abort.abort()
        await new Promise((r) => setTimeout(r, 100))
        const third = await open(
          base,
          '/v1/sessions/s1/events/stream?maxEvents=1'
        )
        expect(third.status).toBe(200)
        await third.body?.cancel()
      } finally {
        await app.close()
      }
    }
  )

  it.fails(
    'RED-8: closing the app with a stream open ends the stream with server_closing, in time',
    async () => {
      const { app, base } = await listen(
        store({ [`${TENANT_A}|s1`]: [1] }, TENANT_A)
      )
      const res = await open(base, '/v1/sessions/s1/events/stream')
      expect(res.status).toBe(200)
      const reader = res.body!.getReader()
      await reader.read()
      const started = Date.now()
      await app.close()
      expect(Date.now() - started).toBeLessThan(6000)
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += new TextDecoder().decode(value)
      }
      expect(text).toContain('server_closing')
    }
  )

  it.fails(
    'RED-9: HEAD does not run the loop and answers 405 with Allow: GET',
    async () => {
      const { app, base } = await listen(
        store({ [`${TENANT_A}|s1`]: [1] }, TENANT_A)
      )
      try {
        const res = await fetch(`${base}/v1/sessions/s1/events/stream`, {
          method: 'HEAD',
          headers: OPERATOR
        })
        expect(res.status).toBe(405)
        expect(res.headers.get('allow')).toBe('GET')
      } finally {
        await app.close()
      }
    }
  )

  it.fails(
    'RED-10: a field the whitelist does not name, a message text and an unknown type never leave',
    async () => {
      const odd = {
        ...event(TENANT_A, 's1', 1),
        type: 'turn/end',
        payload: {
          correlationId: 'c',
          stopReason: 'COMPLETED',
          surprise: 'CAMPO-NOVO-SENSIVEL'
        }
      } as unknown as SessionEvent
      const text = {
        ...event(TENANT_A, 's1', 2),
        type: 'message/user',
        payload: { text: 'TEXTO-DE-MENSAGEM-SENSIVEL' }
      } as unknown as SessionEvent
      const unknown = {
        ...event(TENANT_A, 's1', 3),
        type: 'turn/paused',
        payload: { reason: 'MOTIVO-DE-TIPO-NOVO' }
      } as unknown as SessionEvent
      const app = server({
        openSession: async (i) => i,
        append: async () => {
          throw new Error('not used')
        },
        read: async (i) =>
          [odd, text, unknown].filter(
            (e) => e.sequence > (i.afterSequence ?? 0)
          )
      })
      const res = await get(app, '/v1/sessions/s1/events/stream?maxEvents=3')
      expect(ids(res.body)).toEqual([1, 2, 3])
      for (const secret of [
        'CAMPO-NOVO-SENSIVEL',
        'TEXTO-DE-MENSAGEM-SENSIVEL',
        'MOTIVO-DE-TIPO-NOVO'
      ])
        expect(res.body).not.toContain(secret)
      expect(res.body).toContain('payloadOmitted')
    }
  )
  it.fails(
    'RED-12: an EventSource-like reader survives a full limit and resumes without loss or duplication (R3, D11)',
    async () => {
      const { app, base } = await listen(
        store({ [`${TENANT_A}|s1`]: [1, 2, 3, 4, 5, 6, 7, 8] }, TENANT_A),
        { limits: { perOperator: 1 } }
      )
      // Native EventSource: any non-200 closes the object for good; it reconnects (same URL,
      // Last-Event-ID) only after a 200 connection that was closed, after `retry:`.
      type Round = { status: number; ids: number[]; text: string }
      let lastId: string | undefined
      const received: number[] = []
      const connect = async (): Promise<Round> => {
        const res = await fetch(
          `${base}/v1/sessions/s1/events/stream?maxEvents=3`,
          {
            headers: {
              ...OPERATOR,
              ...(lastId ? { 'last-event-id': lastId } : {})
            }
          }
        )
        const text = res.status === 200 ? await res.text() : ''
        const got = ids(text)
        for (const n of got) {
          received.push(n)
          lastId = String(n)
        }
        return { status: res.status, ids: got, text }
      }
      try {
        const first = await connect()
        expect(first.status).toBe(200)
        expect(first.ids).toEqual([1, 2, 3])
        // another connection of the same operator holds the only slot
        const holder = new AbortController()
        const held = await open(
          base,
          '/v1/sessions/s1/events/stream?after=8',
          holder.signal
        )
        expect(held.status).toBe(200)
        const refused = await connect()
        expect(refused.status).toBe(200)
        expect(refused.ids).toEqual([])
        expect(refused.text).toContain('retry: ')
        expect(refused.text).toContain('event: end')
        expect(refused.text).toContain('too_many_streams')
        holder.abort()
        await new Promise((r) => setTimeout(r, 100))
        const resumed = await connect()
        expect(resumed.ids).toEqual([4, 5, 6])
        const last = await connect()
        expect(last.ids).toEqual([7, 8])
        expect(received).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      } finally {
        await app.close()
      }
    }
  )

  it.fails(
    'RED-11: a reconnection with the same URL and the last id resumes after it (real listener)',
    async () => {
      const { app, base } = await listen(
        store({ [`${TENANT_A}|s1`]: [1, 2, 3, 4, 5, 6, 7, 8] }, TENANT_A)
      )
      try {
        const first = await open(
          base,
          '/v1/sessions/s1/events/stream?after=2&maxEvents=3'
        )
        expect(first.status).toBe(200)
        expect(ids(await first.text())).toEqual([3, 4, 5])
        // the browser reuses the URL and adds the header with the last id it received
        const again = await fetch(
          `${base}/v1/sessions/s1/events/stream?after=2&maxEvents=3`,
          {
            headers: { ...OPERATOR, 'last-event-id': '5' }
          }
        )
        expect(again.status).toBe(200)
        expect(ids(await again.text())).toEqual([6, 7, 8])
      } finally {
        await app.close()
      }
    }
  )
})
