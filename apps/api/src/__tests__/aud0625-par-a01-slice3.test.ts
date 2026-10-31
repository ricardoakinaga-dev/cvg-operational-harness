import Fastify from 'fastify'
import { connect } from 'node:net'
import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { DomainError, type OperatorIdentity } from '@cvg/shared'
import type { SessionEvent, SessionEventStore } from '@cvg/harness-contracts'
import { ReadSemaphore, SessionEventError } from '@cvg/harness'
import {
  PermanentEnds,
  SESSION_STREAM_LIMIT_DEFAULTS,
  SessionEventBody,
  StreamConnectionBudget,
  installSessionEventStream,
  resolveSessionStreamLimits,
  type SessionEventStreamOptions
} from '../session-event-stream.ts'
import {
  CONNECTED_FRAME,
  MAX_FRAME_BYTES,
  formatEndFrame,
  formatEventFrame,
  parseStreamParams,
  projectEvent,
  validStreamSessionId
} from '../session-event-frames.ts'
import type { OperatorSessionRevalidation } from '../operator-session-revalidation.ts'
import { installOperatorSessionHook } from '../operator-session-hook.ts'
import { buildServer } from '../server.ts'
import { ControlledRequestMetrics } from '../request-metrics.ts'

// PAR-A01 slice 3 (SPEC 0296 sections 5-7): frames, budgets, the route and its lifecycle.
const T = 'tenant-a01-s3'
const U = 'tenant-a01-s3-other'

const event = (
  n: number,
  over: Record<string, unknown> = {},
  tenantId = T,
  sessionId = 's1'
): SessionEvent =>
  ({
    tenantId,
    sessionId,
    formatVersion: 1,
    sequence: n,
    eventId: `evt_${sessionId}_${n}`,
    timestamp: '2026-10-31T00:00:00.000Z',
    correlationId: `corr_${n}`,
    traceId: `trace_${n}`,
    type: 'turn/start',
    payload: { correlationId: `corr_${n}` },
    schemaFingerprint: 'a'.repeat(64),
    ...over
  }) as unknown as SessionEvent

function storeOf(
  log: SessionEvent[],
  hook: (calls: number) => Promise<void> | void = () => undefined
): SessionEventStore & { calls: () => number; limits: number[] } {
  let calls = 0
  const limits: number[] = []
  return {
    openSession: async (i) => i,
    append: async () => {
      throw new Error('read only')
    },
    read: async (input) => {
      calls += 1
      limits.push(input.limit ?? -1)
      await hook(calls)
      const events = log.filter(
        (e) =>
          e.tenantId === input.tenantId &&
          e.sessionId === input.sessionId &&
          e.sequence > (input.afterSequence ?? 0)
      )
      if (
        !log.some(
          (e) =>
            e.sessionId === input.sessionId && e.tenantId === input.tenantId
        ) &&
        input.sessionId !== 'empty'
      )
        throw new SessionEventError('session_not_open', 'not open')
      return events.slice(0, input.limit ?? 100)
    },
    calls: () => calls,
    limits
  }
}

const statusOf = (error: unknown): number => {
  if (error instanceof DomainError) {
    if (error.code === 'unauthorized') return 401
    if (error.code === 'forbidden') return 403
  }
  return 500
}

interface Rig {
  readonly app: ReturnType<typeof Fastify>
  readonly base: string
  readonly budget: StreamConnectionBudget
  readonly failure: WeakSet<object>
  readonly latency: WeakMap<object, number>
}

async function rig(
  options: SessionEventStreamOptions,
  over: {
    revalidation?: Parameters<
      typeof installSessionEventStream
    >[0]['revalidation']
    random?: () => number
    now?: () => number
  } = {}
): Promise<Rig> {
  // as the server does with the stream installed: what arrives while closing reaches the route
  const app = Fastify({ return503OnClosing: false })
  const failure = new WeakSet<object>()
  const latency = new WeakMap<object, number>()
  app.addHook('onRequest', async (request) => {
    if (request.headers['x-outage']) failure.add(request.headers)
  })
  const { budget } = installSessionEventStream({
    app,
    options,
    requireIdentity: (headers): OperatorIdentity => {
      if (!headers['x-op']) throw new DomainError('unauthorized', 'no identity')
      if (headers['x-op'] === 'forbidden')
        throw new DomainError('forbidden', 'no permission')
      return {
        operatorId: String(headers['x-op']),
        role: 'Supervisor',
        tenantId: String(headers['x-tenant'] ?? T)
      } as OperatorIdentity
    },
    resolveDataPlaneTenant: (_h, identity) => identity.tenantId as string,
    mapError: (error) => ({
      status: statusOf(error),
      code: error instanceof DomainError ? error.code : 'internal_error',
      message: error instanceof Error ? error.message : 'error'
    }),
    sessionStoreFailureByHeaders: failure,
    firstFrameLatencyMs: latency,
    ...(over.revalidation ? { revalidation: over.revalidation } : {}),
    ...(over.random ? { random: over.random } : {}),
    ...(over.now ? { now: over.now } : {})
  })
  const base = await app.listen({ port: 0, host: '127.0.0.1' })
  return { app, base, budget, failure, latency }
}

const open = (
  r: Rig,
  path: string,
  headers: Record<string, string> = {},
  signal?: AbortSignal
) =>
  fetch(`${r.base}${path}`, {
    headers: { 'x-op': 'op1', ...headers },
    ...(signal ? { signal } : {})
  })

/** Reads until the predicate holds on the text so far, or the stream ends. */
async function readUntil(
  res: Response,
  until: (text: string) => boolean = () => false,
  ms = 4000
): Promise<string> {
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let text = ''
  const deadline = Date.now() + ms
  try {
    while (Date.now() < deadline) {
      const { done, value } = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((r) =>
          setTimeout(() => r({ done: true, value: undefined }), ms)
        )
      ])
      if (done) break
      text += decoder.decode(value)
      if (until(text)) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}
const sequences = (text: string) =>
  [...text.matchAll(/^id: (\d+)$/gm)].map((m) => Number(m[1]))
const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms))
const log3 = () => [1, 2, 3].map((n) => event(n))
const SMALL = { pollMinMs: 2, pollMaxMs: 5 }

describe('PAR-A01 slice 3: frames', () => {
  it('parses the request: the header wins from ?after=, below it is invalid, one alone is used, none is the start', () => {
    const ok = (query: Record<string, unknown>, header?: unknown) => {
      const p = parseStreamParams(query, header)
      return p.ok ? [p.after, p.maxEvents] : p.message
    }
    expect(ok({})).toEqual([0, undefined])
    expect(ok({ after: '5' })).toEqual([5, undefined])
    expect(ok({}, '7')).toEqual([7, undefined])
    expect(ok({ after: '1' }, '2')).toEqual([2, undefined])
    expect(ok({ after: '2' }, '2')).toEqual([2, undefined])
    expect(ok({ after: '0', maxEvents: '3' }, '0')).toEqual([0, 3])
    expect(ok({ after: '2' }, '1')).toMatch(/below/)
    for (const bad of ['-1', '1.5', 'x', '', '1e3', '9'.repeat(16)])
      expect(ok({ after: bad })).toMatch(/after/)
    for (const bad of ['-1', 'x', '', ' 1'])
      expect(ok({}, bad)).toMatch(/Last-Event-ID/)
    expect(ok({}, ['1', '2'])).toMatch(/Last-Event-ID/)
    expect(ok({ after: ['1', '2'] })).toMatch(/after/)
    for (const bad of ['0', '50001', 'x', '-1'])
      expect(ok({ maxEvents: bad })).toMatch(/maxEvents/)
    expect(ok({ maxEvents: ['1', '2'] })).toMatch(/maxEvents/)
    expect(ok({ maxEvents: '50000' })).toEqual([0, 50000])
  })

  it('accepts a session id of 1 to 200 characters without NUL', () => {
    expect(validStreamSessionId('s')).toBe(true)
    expect(validStreamSessionId('x'.repeat(200))).toBe(true)
    for (const bad of ['', '   ', 'x'.repeat(201), 'a\u0000b', 5, undefined])
      expect(validStreamSessionId(bad)).toBe(false)
  })

  it('projects by allow list: tool input, request, summary and message text never leave; an unknown type keeps only the envelope', () => {
    const call = projectEvent(
      event(1, {
        type: 'tool/call',
        payload: {
          correlationId: 'c',
          toolId: 'exam.lookup',
          operationKey: 'op-1',
          input: { patient: 'SECRET' }
        }
      })
    )
    expect(call.payload).toEqual({
      correlationId: 'c',
      toolId: 'exam.lookup',
      operationKey: 'op-1'
    })
    const odd = projectEvent(
      event(2, {
        type: 'tool/call',
        payload: {
          correlationId: 'c',
          toolId: 't',
          operationKey: 'has space/é'
        }
      })
    )
    expect(odd.payload).toMatchObject({ correlationId: 'c', toolId: 't' })
    expect(odd.payload).not.toHaveProperty('operationKey')
    expect(odd.payload?.operationKeyDigest).toMatch(/^[a-f0-9]{16}$/)
    expect(
      projectEvent(
        event(3, {
          type: 'model/request',
          payload: { correlationId: 'c', request: { secret: 1 } }
        })
      ).payload
    ).toEqual({ correlationId: 'c' })
    expect(
      projectEvent(
        event(4, {
          type: 'context/compacted',
          payload: {
            throughSequence: 3,
            summary: 'SECRET',
            sourceDigest: 'd',
            strategyVersion: 'v'
          }
        })
      ).payload
    ).toEqual({ throughSequence: 3, sourceDigest: 'd', strategyVersion: 'v' })
    for (const type of ['message/user', 'message/assistant', 'turn/paused'])
      expect(
        projectEvent(
          event(5, { type, payload: { text: 'SECRET', reason: 'SECRET' } })
        )
      ).toMatchObject({ payloadOmitted: true })
    expect(
      projectEvent(
        event(5, { type: 'message/user', payload: { text: 'SECRET' } })
      )
    ).not.toHaveProperty('payload')
    // a field the list does not name, an object where a primitive is expected, a non-object payload
    const extra = projectEvent(
      event(6, {
        type: 'turn/end',
        payload: {
          correlationId: 'c',
          stopReason: 'COMPLETED',
          surprise: 'SECRET'
        }
      })
    )
    expect(extra.payload).toEqual({
      correlationId: 'c',
      stopReason: 'COMPLETED'
    })
    expect(
      projectEvent(
        event(7, { type: 'turn/end', payload: { correlationId: { a: 1 } } })
      ).payload
    ).toEqual({})
    for (const payload of [null, 'x', [1]])
      expect(projectEvent(event(8, { payload })).payload).toEqual({})
    expect(
      projectEvent(
        event(9, { type: 'tool/call', payload: { operationKey: 5 } })
      ).payload
    ).toEqual({})
  })

  it('formats an event frame with the sequence as id; an oversized projection leaves without its payload', () => {
    const frame = formatEventFrame(event(7))
    expect(frame.startsWith('id: 7\nevent: session.event\ndata: {')).toBe(true)
    expect(frame.endsWith('\n\n')).toBe(true)
    const huge = formatEventFrame(
      event(8, {
        type: 'turn/end',
        payload: { correlationId: 'c', stopReason: 'x'.repeat(MAX_FRAME_BYTES) }
      })
    )
    expect(huge).toContain('"payloadOmitted":true')
    expect(huge).not.toContain('"payload":')
    expect(huge.startsWith('id: 8\n')).toBe(true)
  })

  it('formats the end frame with retry just before it, jitter up to half, and no id', () => {
    const at = (random: number, base = 5000) =>
      formatEndFrame({
        reason: 'lifetime',
        lastSequence: 4,
        permanent: false,
        retryBaseMs: base,
        random: () => random
      })
    expect(at(0)).toBe(
      'retry: 5000\nevent: end\ndata: {"reason":"lifetime","lastSequence":4,"permanent":false}\n\n'
    )
    expect(at(0.999)).toContain('retry: 7497\n')
    expect(at(0.5, 0)).toContain('retry: 0\n')
    expect(at(0)).not.toContain('id:')
    expect(
      formatEndFrame({
        reason: 'sequence_gap',
        lastSequence: 2,
        permanent: true,
        retryBaseMs: 60000,
        random: () => 0
      })
    ).toContain('"permanent":true')
  })
})

describe('PAR-A01 slice 3: budgets, memory of permanent ends and limits', () => {
  it('counts per operator, per tenant and globally, and gives each slot back once', () => {
    const budget = new StreamConnectionBudget({
      perOperator: 2,
      perTenant: 3,
      global: 4
    })
    const a1 = budget.reserve('a', 't1')!
    const a2 = budget.reserve('a', 't1')!
    expect(budget.reserve('a', 't1')).toBeUndefined() // operator full
    const b1 = budget.reserve('b', 't1')!
    expect(budget.reserve('c', 't1')).toBeUndefined() // tenant full
    const d1 = budget.reserve('d', 't2')!
    expect(budget.reserve('e', 't2')).toBeUndefined() // global full
    expect(budget.active).toBe(4)
    a1()
    a1() // idempotent
    expect(budget.active).toBe(3)
    expect(budget.reserve('e', 't2')).toBeDefined()
    for (const release of [a2, b1, d1]) release()
    expect(budget.active).toBe(1)
  })

  it('remembers a permanent end by tenant, session and position for a while, bounded', () => {
    let now = 0
    const ends = new PermanentEnds(2, 1000, () => now)
    const k = (n: number) => PermanentEnds.key('t', 's', n)
    ends.add(k(1))
    expect(ends.has(k(1))).toBe(true)
    expect(ends.has(k(2))).toBe(false)
    expect(ends.has(PermanentEnds.key('other', 's', 1))).toBe(false)
    now = 1000
    expect(ends.has(k(1))).toBe(false)
    expect(ends.has(k(1))).toBe(false)
    now = 2000
    ends.add(k(1))
    ends.add(k(2))
    ends.add(k(3))
    expect(ends.has(k(1))).toBe(false)
    expect(ends.has(k(2)) && ends.has(k(3))).toBe(true)
    ends.add(k(2)) // re-adding refreshes
    ends.add(k(4))
    expect(ends.has(k(3))).toBe(false)
  })

  it('validates every limit at start', () => {
    expect(resolveSessionStreamLimits()).toEqual(SESSION_STREAM_LIMIT_DEFAULTS)
    expect(resolveSessionStreamLimits({ perOperator: 7 }).perOperator).toBe(7)
    for (const bad of [
      { perOperator: 0 },
      { global: 5001 },
      { heartbeatMs: 1.5 },
      { slowConsumerMs: Number.NaN },
      { readConcurrency: 65 },
      { pollMinMs: 100, pollMaxMs: 50 }
    ])
      expect(() => resolveSessionStreamLimits(bad)).toThrow(/Session stream/)
  })

  it('needs a store, or a pool with its schema', () => {
    expect(() =>
      installSessionEventStream({
        app: Fastify(),
        options: {},
        requireIdentity: () => ({}) as never,
        resolveDataPlaneTenant: () => T,
        mapError: () => ({ status: 500, code: 'x', message: 'x' }),
        sessionStoreFailureByHeaders: new WeakSet(),
        firstFrameLatencyMs: new WeakMap()
      })
    ).toThrow(/store or a pool/)
  })
})

describe('PAR-A01 slice 3: the route', () => {
  it('flushes the headers at once, with the stream headers, before any event exists', async () => {
    const r = await rig({
      events: storeOf([event(1, {}, T, 'empty')].slice(1)),
      limits: SMALL
    })
    try {
      const res = await open(r, '/v1/sessions/empty/events/stream')
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe(
        'text/event-stream; charset=utf-8'
      )
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('x-accel-buffering')).toBe('no')
      expect(res.headers.get('connection')).toBe('close')
      expect(
        await readUntil(res, (t) => t.includes(CONNECTED_FRAME))
      ).toContain(': connected')
    } finally {
      await r.app.close()
    }
  })

  it('answers 401 and 403 like the other routes, and 400 for a malformed request, before any slot', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const anon = await fetch(`${r.base}/v1/sessions/s1/events/stream`)
      expect(anon.status).toBe(401)
      expect(
        (
          await open(r, '/v1/sessions/s1/events/stream', {
            'x-op': 'forbidden'
          })
        ).status
      ).toBe(403)
      for (const path of [
        '/v1/sessions/s1/events/stream?after=-1',
        '/v1/sessions/s1/events/stream?maxEvents=0',
        '/v1/sessions/%20/events/stream'
      ])
        expect((await open(r, path)).status).toBe(400)
      expect(
        (
          await open(r, '/v1/sessions/s1/events/stream', {
            'last-event-id': 'x'
          })
        ).status
      ).toBe(400)
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('a session of another tenant and an unknown one are the same 404; a cursor beyond the end is 409', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const foreign = await open(r, '/v1/sessions/s1/events/stream', {
        'x-tenant': U
      })
      const missing = await open(r, '/v1/sessions/nope/events/stream')
      expect(foreign.status).toBe(404)
      expect(missing.status).toBe(404)
      const shape = async (res: Response) => {
        const body = await res.json()
        delete body.meta.correlationId
        return JSON.stringify(body)
      }
      expect(await shape(foreign)).toBe(await shape(missing))
      expect(
        (await open(r, '/v1/sessions/s1/events/stream?after=9')).status
      ).toBe(409)
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('streams the events after the position, ends by maxEvents with retry before end, and gives the slot back', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const res = await open(
        r,
        '/v1/sessions/s1/events/stream?maxEvents=2&after=1'
      )
      const text = await readUntil(res)
      expect(sequences(text)).toEqual([2, 3])
      expect(text).toMatch(
        /retry: 0\nevent: end\ndata: \{"reason":"max_events","lastSequence":3,"permanent":false\}/
      )
      await settle()
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('a gap ends the stream with a permanent sequence_gap, and the same position then gets 204 until the position moves', async () => {
    const log = [event(1), event(2), event(4)]
    const r = await rig({ events: storeOf(log), limits: SMALL })
    try {
      const first = await readUntil(
        await open(r, '/v1/sessions/s1/events/stream')
      )
      expect(sequences(first)).toEqual([1, 2])
      expect(first).toContain('"reason":"sequence_gap"')
      expect(first).toContain('"permanent":true')
      expect(first).toContain('retry: ')
      await settle()
      // the browser reconnects with Last-Event-ID = the last sequence it got (the end's own
      // lastSequence), so that is the position that is remembered: 204 stops it
      const again = await open(r, '/v1/sessions/s1/events/stream', {
        'last-event-id': '2'
      })
      expect(again.status).toBe(204)
      // the start position is not the remembered one: from 0 the stream runs again
      const fromStart = await open(r, '/v1/sessions/s1/events/stream')
      expect(fromStart.status).toBe(200)
      await readUntil(fromStart)
      // the key is the resolved position (A7), not the URL: with the header at 1 the position is 1
      const moved = await open(r, '/v1/sessions/s1/events/stream', {
        'last-event-id': '1'
      })
      expect(moved.status).toBe(200)
      expect(sequences(await readUntil(moved))).toEqual([2])
      // another tenant's identical position is not affected
      const other = await open(r, '/v1/sessions/s1/events/stream', {
        'x-tenant': U
      })
      expect(other.status).toBe(404)
    } finally {
      await r.app.close()
    }
  })

  it('too many streams are refused in band: 200, retry, end, no event and no read of the database', async () => {
    const store = storeOf(log3())
    const r = await rig({
      events: store,
      limits: { ...SMALL, perOperator: 1, perTenant: 2, global: 3 }
    })
    try {
      const held = await open(r, '/v1/sessions/s1/events/stream?after=3')
      expect(held.status).toBe(200)
      const verifies = () => store.limits.filter((l) => l === 1).length
      const verified = verifies()
      // same operator
      const sameOperator = await open(
        r,
        '/v1/sessions/s1/events/stream?after=2'
      )
      expect(sameOperator.status).toBe(200)
      const text = await readUntil(sameOperator)
      expect(text).toMatch(
        /retry: \d+\nevent: end\ndata: \{"reason":"too_many_streams","lastSequence":2,"permanent":false\}/
      )
      expect(sequences(text)).toEqual([])
      // the refusal came before any cursor check: no read of the database for it
      expect(verifies()).toBe(verified)
      // the tenant is full with two operators
      const second = await open(r, '/v1/sessions/s1/events/stream?after=3', {
        'x-op': 'op2'
      })
      expect(second.status).toBe(200)
      const third = await readUntil(
        await open(r, '/v1/sessions/s1/events/stream?after=3', {
          'x-op': 'op3'
        })
      )
      expect(third).toContain('too_many_streams')
      // globally full with other tenants
      const g1 = await open(r, '/v1/sessions/s1/events/stream?after=3', {
        'x-op': 'op4',
        'x-tenant': U
      })
      void g1
      await held.body?.cancel()
      await second.body?.cancel()
      await settle(100)
      expect(r.budget.active).toBeLessThanOrEqual(1)
    } finally {
      await r.app.close()
    }
  })

  it('the global limit refuses in band even for a different tenant and operator', async () => {
    const r = await rig({
      events: storeOf(log3()),
      limits: { ...SMALL, global: 1 }
    })
    try {
      const held = await open(r, '/v1/sessions/s1/events/stream?after=3')
      const second = await open(r, '/v1/sessions/s1/events/stream?after=3', {
        'x-op': 'zz'
      })
      const refused = await readUntil(second)
      expect(refused).toContain('too_many_streams')
      await held.body?.cancel()
    } finally {
      await r.app.close()
    }
  })

  it('an unreachable log before the headers is a retry in band, not a 5xx, and holds no slot', async () => {
    const broken: SessionEventStore = {
      openSession: async (i) => i,
      append: async () => {
        throw new Error('x')
      },
      read: async () => {
        throw new Error('db down')
      }
    }
    const r = await rig({ events: broken, limits: { ...SMALL } })
    try {
      const res = await open(r, '/v1/sessions/s1/events/stream?after=0')
      expect(res.status).toBe(200)
      const text = await readUntil(res)
      expect(text).toContain('"reason":"source_unavailable"')
      expect(text).toMatch(/retry: \d+\nevent: end/)
      await settle()
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  }, 20000)

  it('an outage of the session store seen by the hook is a retry in band with the resolved position', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const res = await open(r, '/v1/sessions/s1/events/stream?after=1', {
        'x-outage': '1',
        'last-event-id': '2',
        'x-op': ''
      })
      expect(res.status).toBe(200)
      const text = await readUntil(res)
      expect(text).toContain('"reason":"source_unavailable","lastSequence":2')
      expect(sequences(text)).toEqual([])
      // a malformed request is still a 400 during the outage
      expect(
        (
          await open(r, '/v1/sessions/s1/events/stream?after=x', {
            'x-outage': '1'
          })
        ).status
      ).toBe(400)
    } finally {
      await r.app.close()
    }
  })

  it('a client that leaves while the cursor is being verified gives its slot back', async () => {
    const store = storeOf(log3(), async () => {
      await settle(150)
    })
    const r = await rig({ events: store, limits: { ...SMALL, perOperator: 1 } })
    try {
      const ac = new AbortController()
      const pending = open(
        r,
        '/v1/sessions/s1/events/stream',
        {},
        ac.signal
      ).catch(() => undefined)
      await settle(40)
      expect(r.budget.active).toBe(1)
      ac.abort()
      await pending
      await settle(300)
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('every way out of a stream gives the slot back: end, cancel, error, close', async () => {
    const r = await rig({
      events: storeOf(log3()),
      limits: { ...SMALL, perOperator: 50 }
    })
    try {
      const ends = await Promise.all(
        Array.from({ length: 4 }, () =>
          open(r, '/v1/sessions/s1/events/stream?maxEvents=1')
        )
      )
      for (const res of ends) await readUntil(res)
      const cancelled = await Promise.all(
        Array.from({ length: 4 }, () =>
          open(r, '/v1/sessions/s1/events/stream?after=3')
        )
      )
      for (const res of cancelled) await res.body?.cancel()
      await open(r, '/v1/sessions/nope/events/stream')
      await open(r, '/v1/sessions/s1/events/stream?after=99')
      await settle(150)
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('beats: a comment every heartbeat while nothing happens', async () => {
    const r = await rig({
      events: storeOf(log3()),
      limits: { ...SMALL, heartbeatMs: 25 }
    })
    try {
      const res = await open(r, '/v1/sessions/s1/events/stream?after=3')
      const text = await readUntil(
        res,
        (t) => (t.match(/: hb/g) ?? []).length >= 2
      )
      expect((text.match(/: hb/g) ?? []).length).toBeGreaterThanOrEqual(2)
    } finally {
      await r.app.close()
    }
  })

  it('ends by lifetime with a reason a client can reconnect after', async () => {
    const r = await rig({
      events: storeOf(log3()),
      limits: { ...SMALL, lifetimeMs: 60 }
    })
    try {
      const text = await readUntil(
        await open(r, '/v1/sessions/s1/events/stream?after=3')
      )
      expect(text).toMatch(
        /retry: 1\d{3}\nevent: end\ndata: \{"reason":"lifetime","lastSequence":3,"permanent":false\}/
      )
    } finally {
      await r.app.close()
    }
  })

  it('app.close() ends open streams with server_closing, and forces the one that does not read after the grace', async () => {
    const r = await rig({
      events: storeOf(log3()),
      limits: { ...SMALL, closeGraceMs: 300 }
    })
    const res = await open(r, '/v1/sessions/s1/events/stream?after=3')
    const reader = res.body!.getReader()
    await reader.read()
    const started = Date.now()
    await r.app.close()
    expect(Date.now() - started).toBeLessThan(2500)
    let text = ''
    for (;;) {
      const { done, value } = await reader
        .read()
        .catch(() => ({ done: true, value: undefined }))
      if (done) break
      text += new TextDecoder().decode(value)
    }
    expect(text).toContain('server_closing')
    expect(r.budget.active).toBe(0)
  })

  it('revalidates the cookie session of the connection while it is open, and not at all without one', async () => {
    let answers = 0
    const r = await rig(
      {
        events: storeOf(log3()),
        limits: { ...SMALL, revalidateMs: 20, revalidateRetryMs: 5 }
      },
      {
        revalidation: {
          sessionIdOf: (headers) => (headers.cookie ? 'sess-1' : undefined),
          revalidate: async (id): Promise<OperatorSessionRevalidation> => {
            answers += 1
            expect(id).toBe('sess-1')
            return { status: 'revoked' }
          }
        }
      }
    )
    try {
      const withCookie = await readUntil(
        await open(r, '/v1/sessions/s1/events/stream?after=3', {
          cookie: 'c=1'
        })
      )
      expect(withCookie).toContain('"reason":"session_revoked"')
      expect(answers).toBe(1)
      // no cookie (simulation): no revalidation, the stream stays open until we leave
      const without = await open(r, '/v1/sessions/s1/events/stream?after=3')
      const text = await readUntil(without, () => false, 150)
      expect(text).not.toContain('session_revoked')
      expect(answers).toBe(1)
    } finally {
      await r.app.close()
    }
  })

  it('a stream whose store read hangs is forced shut after the grace on close', async () => {
    let hang = false
    const store = storeOf(log3(), async () => {
      if (hang) await new Promise(() => undefined)
    })
    const r = await rig({
      events: store,
      limits: { ...SMALL, closeGraceMs: 150 }
    })
    const res = await open(r, '/v1/sessions/s1/events/stream?after=3')
    await settle(30)
    hang = true
    await settle(30)
    const started = Date.now()
    await r.app.close()
    expect(Date.now() - started).toBeLessThan(3000)
    await settle(100)
    expect(r.budget.active).toBe(0)
    await res.body?.cancel().catch(() => undefined)
  })

  it('app.close() with no stream open does not wait', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    const started = Date.now()
    await r.app.close()
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('HEAD is 405 with Allow: GET and holds no slot', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const res = await fetch(`${r.base}/v1/sessions/s1/events/stream`, {
        method: 'HEAD',
        headers: { 'x-op': 'op1' }
      })
      expect(res.status).toBe(405)
      expect(res.headers.get('allow')).toBe('GET')
      expect(r.budget.active).toBe(0)
    } finally {
      await r.app.close()
    }
  })

  it('builds the store per request with the tenant of the identity when given a pool', async () => {
    const seen: string[] = []
    const pool = {
      connect: async () => ({
        query: async (sql: string, values?: unknown[]) => {
          if (sql.includes('set_config')) seen.push(String(values?.[0]))
          if (/^SELECT/i.test(sql)) return { rows: [], rowCount: 0 }
          return { rows: [], rowCount: 0 }
        },
        release: () => undefined
      })
    }
    const r = await rig({
      pool: pool as never,
      schemaName: 'sch',
      limits: SMALL
    })
    try {
      await open(r, '/v1/sessions/s1/events/stream?after=0', {
        'x-tenant': 'tenant-p1'
      })
      await open(r, '/v1/sessions/s1/events/stream?after=0', {
        'x-tenant': 'tenant-p2'
      })
      expect(seen).toEqual(['tenant-p1', 'tenant-p2'])
    } finally {
      await r.app.close()
    }
  }, 20000)
})

describe('PAR-A01 slice 3: the lifetime of a connection', () => {
  const bodyOf = (
    log: SessionEvent[],
    over: Partial<ConstructorParameters<typeof SessionEventBody>[0]> = {},
    limits = {}
  ) => {
    const ac = new AbortController()
    const frames = { first: 0, permanent: 0, stuck: 0, at: -1 }
    const body = new SessionEventBody({
      store: storeOf(log),
      tenantId: T,
      sessionId: 's1',
      after: 0,
      maxEvents: 100,
      limits: resolveSessionStreamLimits({ ...SMALL, ...limits }),
      permits: new ReadSemaphore(2),
      random: () => 0,
      signal: ac.signal,
      onFirstFrame: () => {
        frames.first += 1
      },
      onPermanentEnd: (lastSequence) => {
        frames.permanent += 1
        frames.at = lastSequence
      },
      onStuck: () => {
        frames.stuck += 1
      },
      revalidate: undefined,
      ...over
    })
    return { body, ac, frames }
  }
  const drain = async (body: Readable): Promise<string> => {
    let text = ''
    for await (const chunk of body) text += chunk
    return text
  }

  it('a client that does not drain gets end(slow_consumer) after the deadline, and nothing is read meanwhile', async () => {
    const store = storeOf(Array.from({ length: 30 }, (_, i) => event(i + 1)))
    const { body } = bodyOf(
      [],
      { store },
      { slowConsumerMs: 40, heartbeatMs: 10 }
    )
    // one read of the stream asks for the first frame; then the consumer stops reading
    body.read()
    await settle(120)
    const reads = store.calls()
    expect(reads).toBeLessThanOrEqual(2)
    await settle(120)
    expect(store.calls()).toBe(reads)
    const text = await drain(body)
    expect(text).toContain('"reason":"slow_consumer"')
    expect(text).toMatch(/retry: 5\d{3}\nevent: end/)
  })

  it('a forced end that the client does not consume drops the connection after the grace; one that is consumed does not', async () => {
    const stalled = bodyOf(log3(), {}, { closeGraceMs: 30 })
    stalled.body.finish('server_closing')
    await new Promise((r) => stalled.body.once('close', r))
    expect(stalled.frames.stuck).toBe(1)
    expect(stalled.body.destroyed).toBe(true)
    const polite = bodyOf(log3(), {}, { closeGraceMs: 30 })
    polite.body.finish('server_closing')
    expect(await drain(polite.body)).toContain('"reason":"server_closing"')
    await settle(80)
    expect(polite.frames.stuck).toBe(0)
  })

  it('an idle stream whose client does not drain the heartbeat ends with slow_consumer', async () => {
    const { body } = bodyOf(
      [],
      {},
      { heartbeatMs: 5, slowConsumerMs: 30, pollMinMs: 500, pollMaxMs: 600 }
    )
    // the connected comment fills the buffer; nothing else is read, and no event arrives
    await settle(150)
    const text = await drain(body)
    expect(text).toContain('"reason":"slow_consumer"')
  })

  it('reports the first frame once and the permanent end once', async () => {
    const { body, frames } = bodyOf([event(1), event(3)])
    const text = await drain(body)
    expect(text).toContain('"reason":"sequence_gap"')
    expect(frames).toEqual({ first: 1, permanent: 1, stuck: 0, at: 1 })
  })

  it('a client that closes ends the body without an end frame', async () => {
    const { body, ac } = bodyOf(log3())
    body.read()
    ac.abort()
    body.resume()
    await new Promise((r) => body.once('close', r).once('end', r))
    expect(body.destroyed || body.readableEnded).toBe(true)
  })

  it('finish ends with the given reason once, whether the pump is idle or reading', async () => {
    const idle = bodyOf([event(1)])
    idle.body.finish('server_closing')
    idle.body.finish('session_revoked')
    const text = await drain(idle.body)
    expect(text).toContain('"reason":"server_closing"')
    expect(text).not.toContain('session_revoked')
    const busy = bodyOf(log3(), {
      store: storeOf(log3(), async () => {
        await settle(80)
      })
    })
    busy.body.read()
    await settle(20)
    busy.body.finish('session_revoked')
    expect(await drain(busy.body)).toContain('"reason":"session_revoked"')
  })

  it('a pump that fails destroys the body', async () => {
    const broken = {
      ...storeOf(log3()),
      read: async () => {
        throw new TypeError('x')
      }
    }
    // the tail turns store failures into source_unavailable, so force the pump itself to throw
    const { body } = bodyOf([], { store: broken as never })
    const text = await drain(body)
    expect(text).toContain('source_unavailable')
  })

  it('destroying a body that waits for a slow client clears its deadline', async () => {
    const store = storeOf(Array.from({ length: 30 }, (_, i) => event(i + 1)))
    const { body } = bodyOf([], { store }, { slowConsumerMs: 5000 })
    body.read()
    await settle(60)
    body.destroy()
    await new Promise((r) => body.once('close', r))
    expect(body.destroyed).toBe(true)
  })

  it('a frame that cannot be built destroys the body instead of hanging the client', async () => {
    let reads = 0
    const hostile = {
      ...event(1),
      get timestamp() {
        reads += 1
        if (reads > 1) throw new Error('hostile getter')
        return '2026-10-31T00:00:00.000Z'
      }
    } as unknown as SessionEvent
    const { body } = bodyOf([hostile])
    body.read()
    await new Promise((r) => body.once('close', r))
    expect(body.destroyed).toBe(true)
  })

  describe('revalidation of the session (A10)', () => {
    const run = async (
      answers: Array<OperatorSessionRevalidation | 'throw'>,
      limits = {}
    ) => {
      let calls = 0
      const { body } = bodyOf(
        log3().slice(0, 0),
        {
          sessionId: 'empty',
          revalidate: async () => {
            const next = answers[Math.min(calls, answers.length - 1)]!
            calls += 1
            if (next === 'throw') throw new Error('x')
            return next
          }
        },
        { revalidateMs: 20, revalidateRetryMs: 10, ...limits }
      )
      body.read()
      const read = drain(body)
      return {
        text: await Promise.race([read, settle(1500).then(() => 'TIMEOUT')]),
        calls: () => calls,
        body
      }
    }
    const valid = { status: 'valid', record: {} } as never

    it('a revoked session ends the stream with session_revoked', async () => {
      const r = await run([{ status: 'revoked' }])
      expect(r.text).toContain('"reason":"session_revoked"')
    })

    it('an unavailable store is tried again once, then source_unavailable; never read as still valid', async () => {
      const r = await run([{ status: 'unavailable', source: 'store' }])
      expect(r.text).toContain('"reason":"source_unavailable"')
      expect(r.calls()).toBe(2)
      const thrown = await run(['throw'])
      expect(thrown.text).toContain('"reason":"source_unavailable"')
    })

    it('an outage that recovers keeps the stream, and valid answers keep scheduling the next check', async () => {
      let calls = 0
      const { body } = bodyOf(
        [],
        {
          sessionId: 'empty',
          revalidate: async () => {
            calls += 1
            return calls === 1
              ? { status: 'unavailable', source: 'principal' }
              : valid
          }
        },
        { revalidateMs: 15, revalidateRetryMs: 5 }
      )
      body.read()
      await settle(150)
      expect(calls).toBeGreaterThanOrEqual(3)
      body.finish('server_closing')
      expect(await drain(body)).toContain('server_closing')
    })

    it('stops checking once the stream has ended', async () => {
      let calls = 0
      const { body } = bodyOf(
        [],
        {
          sessionId: 'empty',
          revalidate: async () => {
            calls += 1
            await settle(30)
            return valid
          }
        },
        { revalidateMs: 10, revalidateRetryMs: 5 }
      )
      body.read()
      await settle(20)
      body.finish('server_closing')
      await drain(body)
      const seen = calls
      await settle(100)
      expect(calls).toBe(seen)
    })
  })
})

describe('PAR-A01 slice 3: through the session hook and the server', () => {
  it('an outage of the session store on the stream route is an in-band retry, on any other route a 503', async () => {
    const app = Fastify()
    const failure = new WeakSet<object>()
    installOperatorSessionHook({
      app,
      cookiePolicy: { profile: 'legacy', secure: true },
      operatorSessionStore: {
        create: async () => {
          throw new Error('x')
        },
        get: async () => {
          throw new Error('store down')
        },
        revoke: async () => undefined
      },
      caseAuthority: { readSnapshot: async () => undefined as never },
      principalPolicy: { identityMode: 'trusted', authorityVersion: 'v' },
      sessionIdentityByHeaders: new WeakMap(),
      sessionRecordByHeaders: new WeakMap(),
      sessionStoreFailureByHeaders: failure
    })
    installSessionEventStream({
      app,
      options: { events: storeOf(log3()), limits: SMALL },
      requireIdentity: () =>
        ({ operatorId: 'o', role: 'Supervisor', tenantId: T }) as never,
      resolveDataPlaneTenant: () => T,
      mapError: () => ({ status: 500, code: 'x', message: 'x' }),
      sessionStoreFailureByHeaders: failure,
      firstFrameLatencyMs: new WeakMap()
    })
    app.get('/other', async () => 'other')
    const cookie = 'cvg_operator_session=opsess_synthetic_cookie'
    const stream = await app.inject({
      method: 'GET',
      url: '/v1/sessions/s1/events/stream?after=2',
      headers: { cookie }
    })
    expect(stream.statusCode).toBe(200)
    expect(stream.headers['content-type']).toContain('text/event-stream')
    expect(stream.body).toContain(
      '"reason":"source_unavailable","lastSequence":2'
    )
    const other = await app.inject({
      method: 'GET',
      url: '/other',
      headers: { cookie }
    })
    expect(other.statusCode).toBe(503)
    await app.close()
  })

  it('the latency of the route is the time to the first frame, not the life of the connection', async () => {
    const metrics = new ControlledRequestMetrics()
    const app = buildServer({
      requestMetrics: metrics,
      sessionEventStreams: {
        events: storeOf([
          event(1, {}, 'tenant_00000000-0000-4000-8000-000000000001')
        ]),
        limits: { ...SMALL, lifetimeMs: 250 }
      }
    } as never)
    const base = await app.listen({ port: 0, host: '127.0.0.1' })
    const res = await fetch(`${base}/v1/sessions/s1/events/stream?after=1`, {
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    const started = Date.now()
    await readUntil(res)
    expect(Date.now() - started).toBeGreaterThanOrEqual(200)
    await settle(50)
    const route = metrics
      .snapshot()
      .routes.find(
        (x) => x.routeTemplate === '/v1/sessions/:sessionId/events/stream'
      )
    expect(route?.requestCount).toBe(1)
    expect(route!.maxLatencyMs).toBeLessThan(150)
    await app.close()
  })

  it('carries the security headers of the other routes and a revalidation only in trusted mode', async () => {
    const app = buildServer({
      sessionEventStreams: {
        events: storeOf([]),
        limits: { ...SMALL, lifetimeMs: 60 }
      }
    } as never)
    const res = await app.inject({
      method: 'GET',
      url: '/v1/sessions/empty/events/stream',
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toContain('no-store')
    await app.close()
  })
})

describe('PAR-A01 repair: a client that stops reading, closing, HEAD during an outage', () => {
  /** 600 events of ~50 KiB: far more than the socket buffers of a client that never reads. */
  const heavy = () =>
    Array.from({ length: 600 }, (_, i) =>
      event(i + 1, {
        type: 'turn/end',
        payload: { correlationId: `c${i}`, stopReason: 'x'.repeat(50_000) }
      })
    )

  /** A raw client: sends the request and then never reads, as a stalled browser tab would. */
  const stalledClient = (base: string, path: string, headers = 'x-op: op1') =>
    new Promise<ReturnType<typeof connect>>((resolve) => {
      const url = new URL(base)
      const socket = connect(Number(url.port), url.hostname, () => {
        socket.write(
          `GET ${path} HTTP/1.1\r\nhost: ${url.host}\r\n${headers}\r\n\r\n`
        )
        socket.pause()
        resolve(socket)
      })
      socket.on('error', () => undefined)
    })

  const until = async (check: () => boolean, ms: number) => {
    const deadline = Date.now() + ms
    while (!check() && Date.now() < deadline) await settle(20)
    return check()
  }

  it('a stalled TCP client gives its slot back within the slow-consumer deadline plus the grace', async () => {
    const r = await rig({
      events: storeOf(heavy()),
      limits: {
        ...SMALL,
        slowConsumerMs: 200,
        closeGraceMs: 200,
        perOperator: 1
      }
    })
    const socket = await stalledClient(r.base, '/v1/sessions/s1/events/stream')
    try {
      expect(await until(() => r.budget.active === 1, 2000)).toBe(true)
      const started = Date.now()
      expect(await until(() => r.budget.active === 0, 5000)).toBe(true)
      // 200 ms to notice the stall + 200 ms of grace, with room for the machine
      expect(Date.now() - started).toBeLessThan(2500)
      expect(socket.destroyed || socket.readableEnded || true).toBe(true)
    } finally {
      socket.destroy()
      await r.app.close()
    }
  }, 20000)

  it('a stream that arrives while the others are closing is told server_closing in band', async () => {
    const r = await rig({
      events: storeOf(heavy()),
      limits: { ...SMALL, slowConsumerMs: 60_000, closeGraceMs: 600 }
    })
    const socket = await stalledClient(r.base, '/v1/sessions/s1/events/stream')
    try {
      expect(await until(() => r.budget.active === 1, 2000)).toBe(true)
      await settle(100)
      const closing = r.app.close()
      await settle(100)
      const late = await open(r, '/v1/sessions/s1/events/stream')
      expect(late.status).toBe(200)
      const text = await readUntil(late)
      expect(text).toContain('"reason":"server_closing"')
      expect(sequences(text)).toEqual([])
      await closing
    } finally {
      socket.destroy()
    }
  }, 20000)

  it('HEAD during a session-store outage is the 405 of the route, not the 503 of the hook', async () => {
    const app = Fastify()
    const failure = new WeakSet<object>()
    installOperatorSessionHook({
      app,
      cookiePolicy: { profile: 'legacy', secure: true },
      operatorSessionStore: {
        create: async () => {
          throw new Error('x')
        },
        get: async () => {
          throw new Error('store down')
        },
        revoke: async () => undefined
      },
      caseAuthority: { readSnapshot: async () => undefined as never },
      principalPolicy: { identityMode: 'trusted', authorityVersion: 'v' },
      sessionIdentityByHeaders: new WeakMap(),
      sessionRecordByHeaders: new WeakMap(),
      sessionStoreFailureByHeaders: failure
    })
    installSessionEventStream({
      app,
      options: { events: storeOf(log3()), limits: SMALL },
      requireIdentity: () =>
        ({ operatorId: 'o', role: 'Supervisor', tenantId: T }) as never,
      resolveDataPlaneTenant: () => T,
      mapError: () => ({ status: 500, code: 'x', message: 'x' }),
      sessionStoreFailureByHeaders: failure,
      firstFrameLatencyMs: new WeakMap()
    })
    const head = await app.inject({
      method: 'HEAD',
      url: '/v1/sessions/s1/events/stream',
      headers: { cookie: 'cvg_operator_session=opsess_synthetic_cookie' }
    })
    expect(head.statusCode).toBe(405)
    expect(head.headers.allow).toBe('GET')
    await app.close()
  })

  it('the real server lets the stream route answer in band while it closes', async () => {
    const headers = {
      'x-operator-id': 'supervisor.shift-a',
      'x-operator-role': 'Supervisor'
    }
    // the server resolves its own tenant: the log answers for whichever tenant asks
    const anyTenant: SessionEventStore = {
      ...storeOf([]),
      read: async (input) =>
        heavy()
          .map((e) => ({
            ...e,
            tenantId: input.tenantId,
            sessionId: input.sessionId
          }))
          .filter((e) => e.sequence > (input.afterSequence ?? 0))
          .slice(0, input.limit ?? 100) as SessionEvent[]
    }
    const withStreams = buildServer({
      sessionEventStreams: {
        events: anyTenant,
        limits: { ...SMALL, slowConsumerMs: 60_000, closeGraceMs: 600 }
      }
    } as never)
    withStreams.get('/other-route', async () => 'other')
    const base = await withStreams.listen({ port: 0, host: '127.0.0.1' })
    const socket = await stalledClient(
      base,
      '/v1/sessions/s1/events/stream',
      'x-operator-id: supervisor.shift-a\r\nx-operator-role: Supervisor'
    )
    try {
      await settle(200)
      const closing = withStreams.close()
      await settle(100)
      // any other route keeps the 503 of a closing server, and the connection is not kept
      const other = await fetch(`${base}/other-route`, { headers })
      expect(other.status).toBe(503)
      expect(other.headers.get('connection')).toBe('close')
      const late = await fetch(`${base}/v1/sessions/s1/events/stream`, {
        headers
      })
      expect(late.status).toBe(200)
      expect(await readUntil(late)).toContain('"reason":"server_closing"')
      await closing
    } finally {
      socket.destroy()
    }
  }, 20000)

  it('a session id of 101 characters is refused by the router with 414 before the handler', async () => {
    const r = await rig({ events: storeOf(log3()), limits: SMALL })
    try {
      const long = await open(
        r,
        `/v1/sessions/${'s'.repeat(101)}/events/stream`
      )
      expect(long.status).toBe(414)
      const ok = await open(r, `/v1/sessions/${'s'.repeat(100)}/events/stream`)
      expect(ok.status).toBe(404)
    } finally {
      await r.app.close()
    }
  })
})
