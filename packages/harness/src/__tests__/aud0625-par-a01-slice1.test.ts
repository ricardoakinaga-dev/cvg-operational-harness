import { describe, expect, it } from 'vitest'
import type {
  SessionEvent,
  SessionEventRead,
  SessionEventStore
} from '@cvg/harness-contracts'
import {
  InMemorySessionEventStore,
  ReadSemaphore,
  SessionEventError,
  TAIL_END_POLICY,
  defaultTailSleep,
  materializeSessionEvent,
  tailSessionEvents,
  verifyTailCursor,
  type TailItem,
  type TailOptions
} from '../session/index.ts'

// PAR-A01 slice 1 (SPEC 0296 section 4): the transport-independent tail over a SessionEventStore.
const T = 'tenant-a01-synthetic'
const S = 'session-a01'

const ev = (n: number, tenantId = T, sessionId = S): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId,
      sessionId,
      formatVersion: 1,
      eventId: `e${n}`,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId: `c${n}`,
      traceId: 'tr',
      type: 'turn/start',
      payload: { correlationId: `c${n}` }
    },
    n
  )

/** A store over a mutable array of events; counts reads and records their parameters. */
function fake(
  initial: SessionEvent[] = [],
  behaviour: (read: SessionEventRead, n: number) => Promise<void> | void = () =>
    undefined
) {
  const events = [...initial]
  const reads: SessionEventRead[] = []
  const store: SessionEventStore = {
    openSession: async (i) => i,
    append: async () => {
      throw new Error('read only')
    },
    read: async (input) => {
      reads.push(input)
      await behaviour(input, reads.length)
      return events
        .filter((e) => e.sequence > (input.afterSequence ?? 0))
        .slice(0, input.limit ?? 100)
    }
  }
  return { store, events, reads }
}

/** Virtual time: `sleep` records and advances the clock; nothing waits for real. */
function runtime() {
  const sleeps: number[] = []
  let clock = 0
  return {
    sleeps,
    advance: (ms: number) => {
      clock += ms
    },
    now: () => clock,
    random: () => 0,
    sleep: async (ms: number, signal: AbortSignal) => {
      if (signal.aborted) throw signal.reason
      sleeps.push(ms)
      clock += ms
    }
  }
}

const options = (
  store: SessionEventStore,
  over: Partial<TailOptions> = {}
): TailOptions => ({
  store,
  tenantId: T,
  sessionId: S,
  after: 0,
  signal: new AbortController().signal,
  ...runtime(),
  ...over
})

async function collect(
  gen: AsyncGenerator<TailItem, void, void>,
  limit = 1000
) {
  const out: TailItem[] = []
  for await (const item of gen) {
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}
const seqs = (items: TailItem[]) =>
  items.flatMap((i) => (i.kind === 'event' ? [i.event.sequence] : []))
const last = (items: TailItem[]) => items.at(-1)

describe('PAR-A01 slice 1: order, density and the end', () => {
  it('emits the committed events after the cursor in order and ends at max_events', async () => {
    const { store } = fake([1, 2, 3, 4, 5].map((n) => ev(n)))
    const items = await collect(
      tailSessionEvents(options(store, { after: 2, maxEvents: 3 }))
    )
    expect(seqs(items)).toEqual([3, 4, 5])
    expect(last(items)).toEqual({
      kind: 'end',
      reason: 'max_events',
      lastSequence: 5,
      permanent: false
    })
  })

  it('reads pages of ten and only when the consumer asks for more (backpressure)', async () => {
    const { store, reads } = fake(
      Array.from({ length: 25 }, (_, i) => ev(i + 1))
    )
    const gen = tailSessionEvents(options(store))
    await gen.next()
    expect(reads).toHaveLength(1)
    expect(reads[0]).toMatchObject({ afterSequence: 0, limit: 10 })
    for (let i = 0; i < 9; i += 1) await gen.next()
    expect(reads).toHaveLength(1)
    await gen.next()
    expect(reads).toHaveLength(2)
    expect(reads[1]).toMatchObject({ afterSequence: 10, limit: 10 })
    await gen.return()
    expect(reads).toHaveLength(2)
  })

  it.each([
    ['a hole', [1, 2, 4], [1, 2]],
    ['a repeated sequence', [1, 2, 2], [1, 2]],
    ['an out-of-order sequence', [1, 3, 2], [1]]
  ])(
    '%s stops the tail without emitting it, as a permanent sequence_gap',
    async (_n, sequences, emitted) => {
      const { store } = fake(sequences.map((n) => ev(n)))
      const items = await collect(tailSessionEvents(options(store)))
      expect(seqs(items)).toEqual(emitted)
      expect(last(items)).toMatchObject({
        kind: 'end',
        reason: 'sequence_gap',
        permanent: true
      })
    }
  )

  it('a store that answers at or before the cursor is a gap, never a re-emission (A3)', async () => {
    const { store } = fake([ev(1), ev(2), ev(3)])
    const stale: SessionEventStore = {
      ...store,
      read: async () => [ev(2), ev(3)]
    }
    const items = await collect(tailSessionEvents(options(stale, { after: 2 })))
    expect(seqs(items)).toEqual([])
    expect(last(items)).toMatchObject({
      reason: 'sequence_gap',
      lastSequence: 2
    })
  })

  it('an invalid event, an event of another session and an oversized page are corrupt_event', async () => {
    const bad = { ...ev(1), type: 'not/a/type' } as unknown as SessionEvent
    for (const events of [
      [bad],
      [ev(1, 'another-tenant')],
      [ev(1, T, 'another-session')]
    ]) {
      const { store } = fake(events)
      const items = await collect(tailSessionEvents(options(store)))
      expect(seqs(items)).toEqual([])
      expect(last(items)).toEqual({
        kind: 'end',
        reason: 'corrupt_event',
        lastSequence: 0,
        permanent: true
      })
    }
    const { store } = fake(Array.from({ length: 4 }, (_, i) => ev(i + 1)))
    const greedy: SessionEventStore = {
      ...store,
      read: async () => Array.from({ length: 4 }, (_, i) => ev(i + 1))
    }
    const items = await collect(
      tailSessionEvents(options(greedy, { pageEvents: 3 }))
    )
    expect(seqs(items)).toEqual([])
    expect(last(items)).toMatchObject({ reason: 'corrupt_event' })
  })

  it('the end policy table matches the SPEC', () => {
    expect(TAIL_END_POLICY.sequence_gap).toEqual({
      permanent: true,
      retryMs: 60000
    })
    expect(TAIL_END_POLICY.corrupt_event.permanent).toBe(true)
    expect(TAIL_END_POLICY.max_events).toEqual({ permanent: false, retryMs: 0 })
    expect(TAIL_END_POLICY.lifetime.retryMs).toBe(1000)
    expect(TAIL_END_POLICY.server_closing.retryMs).toBe(1000)
    for (const r of [
      'slow_consumer',
      'source_unavailable',
      'session_revoked',
      'too_many_streams'
    ] as const)
      expect(TAIL_END_POLICY[r]).toEqual({ permanent: false, retryMs: 5000 })
  })

  it('works over the in-memory store, and a late commit appears at the next poll', async () => {
    const memory = new InMemorySessionEventStore()
    await memory.openSession({ tenantId: T, sessionId: S, formatVersion: 1 })
    const append = (n: number) =>
      memory.append({
        tenantId: T,
        sessionId: S,
        formatVersion: 1,
        eventId: `m${n}`,
        timestamp: '2026-10-31T00:00:00.000Z',
        correlationId: `c${n}`,
        traceId: 'tr',
        type: 'turn/start',
        payload: { correlationId: `c${n}` }
      })
    await append(1)
    const rt = runtime()
    const gen = tailSessionEvents(options(memory, { ...rt, maxEvents: 2 }))
    expect((await gen.next()).value).toMatchObject({ kind: 'event' })
    const pending = gen.next()
    await Promise.resolve()
    await append(2)
    const second = await pending
    expect(second.value).toMatchObject({
      kind: 'event',
      event: { sequence: 2 }
    })
    expect((await gen.next()).value).toMatchObject({ reason: 'max_events' })
  })
})

describe('PAR-A01 slice 1: waiting, retrying, lifetime and cancellation', () => {
  it('waits 250 ms growing to 2 s on empty pages, and resets after an event', async () => {
    const rt = runtime()
    const { store, events } = fake()
    const sleep = async (ms: number, signal: AbortSignal) => {
      await rt.sleep(ms, signal)
      if (rt.sleeps.length === 6) events.push(ev(1))
    }
    const gen = tailSessionEvents(
      options(store, { ...rt, sleep, maxEvents: 5 })
    )
    expect((await gen.next()).value).toMatchObject({ kind: 'event' })
    expect(rt.sleeps).toEqual([250, 500, 1000, 2000, 2000, 2000])
    // after the event the interval starts again at the minimum
    events.push(ev(2))
    const second = await gen.next()
    expect(second.value).toMatchObject({
      kind: 'event',
      event: { sequence: 2 }
    })
    expect(rt.sleeps.at(-1)).toBe(250)
    // the next empty page starts again from the minimum, not from the grown interval
    const before = rt.sleeps.length
    const third = gen.next()
    for (let i = 0; i < 50 && rt.sleeps.length < before + 2; i += 1)
      await new Promise((r) => setImmediate(r))
    expect(rt.sleeps.slice(before, before + 2)).toEqual([250, 250])
    await gen.return()
    void third
  })

  it('applies jitter of up to half the wait', async () => {
    const rt = runtime()
    const { store } = fake()
    const gen = tailSessionEvents(
      options(store, { ...rt, random: () => 0.999, maxEvents: 1 })
    )
    const next = gen.next()
    for (let i = 0; i < 20 && rt.sleeps.length < 2; i += 1)
      await new Promise((r) => setImmediate(r))
    expect(rt.sleeps[0]).toBe(250 + Math.floor(0.999 * 125))
    await gen.return()
    void next
  })

  it('a short non-empty page waits the minimum before the next read', async () => {
    const rt = runtime()
    const { store } = fake([ev(1)])
    const gen = tailSessionEvents(options(store, { ...rt }))
    await gen.next()
    const next = gen.next()
    for (let i = 0; i < 20 && rt.sleeps.length < 1; i += 1)
      await new Promise((r) => setImmediate(r))
    expect(rt.sleeps[0]).toBe(250)
    await gen.return()
    void next
  })

  it('the wait for a read permit raises the poll interval instead of ending the connection', async () => {
    const rt = runtime()
    const permits = new ReadSemaphore(1)
    const { store } = fake([], async () => undefined)
    const held = await permits.acquire()
    const gen = tailSessionEvents(
      options(store, {
        ...rt,
        permits,
        now: () => {
          const t = rt.now()
          return t
        }
      })
    )
    const next = gen.next()
    await Promise.resolve()
    rt.advance(3000)
    held()
    for (let i = 0; i < 40 && rt.sleeps.length < 1; i += 1)
      await new Promise((r) => setImmediate(r))
    expect(rt.sleeps[0]).toBeGreaterThanOrEqual(3000)
    await gen.return()
    void next
  })

  it('retries a failing read and recovers; three failures end with source_unavailable', async () => {
    let failures = 2
    const { store } = fake([ev(1)], () => {
      if (failures-- > 0)
        throw new SessionEventError('session_storage_unavailable', 'x')
    })
    const ok = await collect(
      tailSessionEvents(options(store, { maxEvents: 1 }))
    )
    expect(seqs(ok)).toEqual([1])
    const rt = runtime()
    const dead = fake([], () => {
      throw new Error('PRIVATE')
    })
    const items = await collect(
      tailSessionEvents(options(dead.store, { ...rt }))
    )
    expect(items).toEqual([
      {
        kind: 'end',
        reason: 'source_unavailable',
        lastSequence: 0,
        permanent: false
      }
    ])
    expect(dead.reads).toHaveLength(3)
    expect(rt.sleeps).toEqual([100, 200])
  })

  it('a session that is no longer open is source_unavailable mid-stream', async () => {
    let n = 0
    const { store } = fake([ev(1)], () => {
      n += 1
      if (n > 1) throw new SessionEventError('session_not_open', 'gone')
    })
    const items = await collect(tailSessionEvents(options(store)))
    expect(seqs(items)).toEqual([1])
    expect(last(items)).toMatchObject({
      reason: 'source_unavailable',
      lastSequence: 1
    })
  })

  it('a read that hangs times out per attempt, and keeps its permit until it settles', async () => {
    const permits = new ReadSemaphore(1)
    let release!: () => void
    const hang = new Promise<void>((r) => {
      release = r
    })
    const { store, reads } = fake([], () => hang)
    const rt = runtime()
    const items = await collect(
      tailSessionEvents(
        options(store, {
          ...rt,
          permits,
          readAttempts: 1,
          timeoutSleep: async () => undefined
        })
      )
    )
    expect(last(items)).toMatchObject({ reason: 'source_unavailable' })
    expect(reads).toHaveLength(1)
    expect(permits.inUse).toBe(1)
    release()
    await new Promise((r) => setImmediate(r))
    expect(permits.inUse).toBe(0)
  })

  it('ends with lifetime when the connection is older than the limit', async () => {
    const rt = runtime()
    const { store } = fake([ev(1)])
    const gen = tailSessionEvents(options(store, { ...rt, lifetimeMs: 1000 }))
    await gen.next()
    rt.advance(1000)
    const next = await gen.next()
    expect(next.value).toEqual({
      kind: 'end',
      reason: 'lifetime',
      lastSequence: 1,
      permanent: false
    })
    expect((await gen.next()).done).toBe(true)
  })

  it('max_events inside a page: the page has more events than the budget left', async () => {
    const { store } = fake([1, 2, 3, 4, 5].map((n) => ev(n)))
    const items = await collect(
      tailSessionEvents(options(store, { maxEvents: 2 }))
    )
    expect(seqs(items)).toEqual([1, 2])
    expect(last(items)).toMatchObject({ reason: 'max_events', lastSequence: 2 })
  })

  it('runs on the real clock, timer and randomness when none is injected', async () => {
    const { store, events } = fake()
    const ac = new AbortController()
    const gen = tailSessionEvents({
      store,
      tenantId: T,
      sessionId: S,
      after: 0,
      signal: ac.signal,
      pollMinMs: 1,
      pollMaxMs: 2
    })
    const first = gen.next()
    setTimeout(() => events.push(ev(1)), 20)
    expect((await first).value).toMatchObject({ kind: 'event' })
    ac.abort()
    expect((await gen.next()).done).toBe(true)
  })

  it('an aborted signal ends silently: no final item and no further read, at every await', async () => {
    // before the first read
    const early = new AbortController()
    early.abort()
    const a = fake([ev(1)])
    expect(
      await collect(
        tailSessionEvents(options(a.store, { signal: early.signal }))
      )
    ).toEqual([])
    expect(a.reads).toHaveLength(0)
    // during a read
    const during = new AbortController()
    const b = fake([ev(1)], () => during.abort())
    expect(
      await collect(
        tailSessionEvents(options(b.store, { signal: during.signal }))
      )
    ).toEqual([])
    expect(b.reads).toHaveLength(1)
    // after an event is yielded
    const afterEvent = new AbortController()
    const c = fake([ev(1), ev(2)])
    const gen = tailSessionEvents(
      options(c.store, { signal: afterEvent.signal })
    )
    expect((await gen.next()).value).toMatchObject({ kind: 'event' })
    afterEvent.abort()
    expect((await gen.next()).done).toBe(true)
    expect(c.reads).toHaveLength(1)
    // during the poll sleep
    const inSleep = new AbortController()
    const d = fake()
    const rt = runtime()
    const genD = tailSessionEvents(
      options(d.store, {
        ...rt,
        signal: inSleep.signal,
        sleep: async () => {
          inSleep.abort()
          throw inSleep.signal.reason
        }
      })
    )
    expect((await genD.next()).done).toBe(true)
    expect(d.reads).toHaveLength(1)
    // during the short-page sleep
    const inShort = new AbortController()
    const e = fake([ev(1)])
    const genE = tailSessionEvents(
      options(e.store, {
        ...runtime(),
        signal: inShort.signal,
        sleep: async () => {
          inShort.abort()
          throw inShort.signal.reason
        }
      })
    )
    await genE.next()
    expect((await genE.next()).done).toBe(true)
    // while waiting for a permit
    const waiting = new AbortController()
    const permits = new ReadSemaphore(1)
    const hold = await permits.acquire()
    const f = fake([ev(1)])
    const genF = tailSessionEvents(
      options(f.store, { signal: waiting.signal, permits })
    )
    const pending = genF.next()
    await Promise.resolve()
    waiting.abort()
    expect((await pending).done).toBe(true)
    expect(f.reads).toHaveLength(0)
    expect(permits.waiting).toBe(0)
    hold()
    // during the retry backoff
    const inBackoff = new AbortController()
    const g = fake([], () => {
      throw new Error('x')
    })
    const genG = tailSessionEvents(
      options(g.store, {
        ...runtime(),
        signal: inBackoff.signal,
        sleep: async () => {
          inBackoff.abort()
          throw inBackoff.signal.reason
        }
      })
    )
    expect((await genG.next()).done).toBe(true)
    expect(g.reads).toHaveLength(1)
  })

  it('a permit acquired just as the signal aborts is given back', async () => {
    const abort = new AbortController()
    const permits = new ReadSemaphore(1)
    const realAcquire = permits.acquire.bind(permits)
    permits.acquire = async (signal) => {
      const release = await realAcquire(signal)
      abort.abort()
      return release
    }
    const { store, reads } = fake([ev(1)])
    const items = await collect(
      tailSessionEvents(options(store, { signal: abort.signal, permits }))
    )
    expect(items).toEqual([])
    expect(reads).toHaveLength(0)
    expect(permits.inUse).toBe(0)
  })

  it('the default sleep resolves after the delay and rejects on abort', async () => {
    const ac = new AbortController()
    await expect(defaultTailSleep(1, ac.signal)).resolves.toBeUndefined()
    const pending = defaultTailSleep(10_000, ac.signal)
    ac.abort(new Error('stop'))
    await expect(pending).rejects.toThrow('stop')
    await expect(defaultTailSleep(1, ac.signal)).rejects.toThrow('stop')
  })
})

describe('PAR-A01 slice 1: ReadSemaphore', () => {
  it('bounds simultaneous holders and grants in arrival order', async () => {
    const sem = new ReadSemaphore(2)
    const order: number[] = []
    const a = await sem.acquire()
    const b = await sem.acquire()
    const c = sem.acquire().then((r) => {
      order.push(3)
      return r
    })
    const d = sem.acquire().then((r) => {
      order.push(4)
      return r
    })
    await Promise.resolve()
    expect(sem.inUse).toBe(2)
    expect(sem.waiting).toBe(2)
    a()
    a() // idempotent
    expect(sem.inUse).toBe(2)
    const rc = await c
    expect(order).toEqual([3])
    b()
    const rd = await d
    expect(order).toEqual([3, 4])
    rc()
    rd()
    expect(sem.inUse).toBe(0)
  })

  it('an aborted waiter leaves the queue and never holds a permit', async () => {
    const sem = new ReadSemaphore(1)
    const hold = await sem.acquire()
    const ac = new AbortController()
    const waiter = sem.acquire(ac.signal)
    const behind = sem.acquire()
    ac.abort(new Error('gone'))
    await expect(waiter).rejects.toThrow('gone')
    expect(sem.waiting).toBe(1)
    hold()
    ;(await behind)()
    expect(sem.inUse).toBe(0)
    const dead = new AbortController()
    dead.abort(new Error('dead'))
    await expect(sem.acquire(dead.signal)).rejects.toThrow('dead')
  })

  it('refuses a size that is not a positive integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN])
      expect(() => new ReadSemaphore(bad)).toThrow(RangeError)
  })
})

describe('PAR-A01 slice 1: verifyTailCursor (SPEC 0296 A6)', () => {
  const verify = (
    store: SessionEventStore,
    after: number,
    over: Partial<TailOptions> = {}
  ) =>
    verifyTailCursor({
      store,
      tenantId: T,
      sessionId: S,
      after,
      signal: new AbortController().signal,
      ...runtime(),
      ...over
    })

  it('after 0 is ok on an open session, even an empty one', async () => {
    expect(await verify(fake().store, 0)).toBe('ok')
  })

  it('reads the event at the cursor and accepts only that exact sequence', async () => {
    const { store, reads } = fake([ev(1), ev(2), ev(3)])
    expect(await verify(store, 3)).toBe('ok')
    expect(reads[0]).toMatchObject({ afterSequence: 2, limit: 1 })
    expect(await verify(store, 4)).toBe('cursor_ahead')
    expect(await verify(store, 9)).toBe('cursor_ahead')
  })

  it('an unknown session is not_found; a failing source is unavailable; abort is aborted', async () => {
    const closed: SessionEventStore = {
      ...fake().store,
      read: async () => {
        throw new SessionEventError('session_not_open', 'no')
      }
    }
    expect(await verify(closed, 0)).toBe('not_found')
    const broken: SessionEventStore = {
      ...fake().store,
      read: async () => {
        throw new Error('x')
      }
    }
    expect(await verify(broken, 0, { readAttempts: 1 })).toBe('unavailable')
    const ac = new AbortController()
    ac.abort()
    expect(await verify(fake().store, 0, { signal: ac.signal })).toBe('aborted')
  })

  it('an event that is invalid, of another stream or at another sequence is unavailable', async () => {
    const answer = (events: SessionEvent[]): SessionEventStore => ({
      ...fake().store,
      read: async () => events
    })
    expect(await verify(answer([{ ...ev(3), type: 'x' } as never]), 3)).toBe(
      'unavailable'
    )
    expect(await verify(answer([ev(3, 'other-tenant')]), 3)).toBe('unavailable')
    expect(await verify(answer([ev(3, T, 'other-session')]), 3)).toBe(
      'unavailable'
    )
    expect(await verify(answer([ev(2)]), 3)).toBe('unavailable')
  })

  it('goes through the read permits like any read', async () => {
    const permits = new ReadSemaphore(1)
    const hold = await permits.acquire()
    const { store, reads } = fake([ev(1)])
    const pending = verify(store, 1, { permits })
    await Promise.resolve()
    expect(reads).toHaveLength(0)
    hold()
    expect(await pending).toBe('ok')
  })
})
