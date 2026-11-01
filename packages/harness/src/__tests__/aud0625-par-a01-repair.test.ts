import { describe, expect, it } from 'vitest'
import { runInNewContext } from 'node:vm'
import { setFlagsFromString } from 'node:v8'
import type { SessionEvent, SessionEventStore } from '@cvg/harness-contracts'
import { tailSessionEvents } from '../session/index.ts'

// PAR-A01 repair of the review of the BUILD (P2-1): what a parked tail holds is bounded.
const T = 'tenant-a01-repair'
const S = 'session-a01-repair'
const MIB = 1024 * 1024

/** A fresh 1 MiB text on every call, so nothing is shared between the pages. */
const big = (n: number): SessionEvent =>
  ({
    tenantId: T,
    sessionId: S,
    formatVersion: 1,
    sequence: n,
    eventId: `e${n}`,
    timestamp: '2026-10-31T00:00:00.000Z',
    correlationId: `c${n}`,
    traceId: 'tr',
    type: 'turn/end',
    payload: {
      correlationId: `c${n}`,
      stopReason: Buffer.alloc(MIB, 97 + (n % 20)).toString('latin1')
    },
    schemaFingerprint: 'a'.repeat(64)
  }) as unknown as SessionEvent

/** Every raw record the fake store hands out, held weakly: what is still alive was retained. */
const handedOut: Array<WeakRef<SessionEvent>> = []

const bigStore = (): SessionEventStore => ({
  openSession: async (i) => i,
  append: async () => {
    throw new Error('read only')
  },
  read: async (input) =>
    Array.from({ length: input.limit ?? 10 }, (_, i) => {
      const event = big((input.afterSequence ?? 0) + i + 1)
      handedOut.push(new WeakRef(event))
      return event
    })
})

setFlagsFromString('--expose-gc')
const collectGarbage = (): void => {
  runInNewContext('gc')()
}
/**
 * The raw records still alive. A WeakRef keeps its target until the end of the current job, so
 * the collection runs in a later task; the count does not depend on the load of the machine.
 */
const aliveRaw = async (): Promise<number> => {
  await new Promise((resolve) => setTimeout(resolve, 0))
  collectGarbage()
  await new Promise((resolve) => setTimeout(resolve, 0))
  collectGarbage()
  return handedOut.filter((ref) => ref.deref() !== undefined).length
}

describe('PAR-A01 repair: the page that waits for a slow client', () => {
  const TAILS = 30
  const PAGE = 10

  const suspend = async (
    frameOf: ((event: SessionEvent) => string) | undefined
  ) => {
    handedOut.length = 0
    const signal = new AbortController()
    const gens = Array.from({ length: TAILS }, () =>
      tailSessionEvents({
        store: bigStore(),
        tenantId: T,
        sessionId: S,
        after: 0,
        signal: signal.signal,
        ...(frameOf ? { frameOf } : {})
      })
    )
    // each tail has read a page of ten 1 MiB records and is parked at its first item
    const first = await Promise.all(gens.map((g) => g.next()))
    const alive = await aliveRaw()
    // the tails are still parked here: that is what is measured
    expect(gens).toHaveLength(TAILS)
    signal.abort()
    return { first, alive }
  }

  it('parks N tails of 1 MiB events holding none of the raw records when the frame is built at read time', async () => {
    const { first, alive } = await suspend(() => 'x'.repeat(64 * 1024))
    for (const item of first)
      expect(item.value).toMatchObject({ kind: 'frame', sequence: 1 })
    expect(handedOut).toHaveLength(TAILS * PAGE)
    expect(alive).toBe(0)
  }, 60_000)

  it('the control without the projection keeps the raw page of every tail alive', async () => {
    const { first, alive } = await suspend(undefined)
    for (const item of first)
      expect(item.value).toMatchObject({ kind: 'event' })
    expect(alive).toBeGreaterThanOrEqual(TAILS * PAGE)
  }, 60_000)

  it('an event the projection cannot read ends the tail as corrupt instead of leaving', async () => {
    const gen = tailSessionEvents({
      store: bigStore(),
      tenantId: T,
      sessionId: S,
      after: 0,
      signal: new AbortController().signal,
      frameOf: () => {
        throw new Error('hostile payload')
      }
    })
    expect((await gen.next()).value).toMatchObject({
      kind: 'end',
      reason: 'corrupt_event',
      lastSequence: 0,
      permanent: true
    })
  })

  it('a frame carries the sequence of the event it was built from', async () => {
    const gen = tailSessionEvents({
      store: bigStore(),
      tenantId: T,
      sessionId: S,
      after: 4,
      maxEvents: 2,
      signal: new AbortController().signal,
      frameOf: (e) => `frame-${e.sequence}`
    })
    const out: unknown[] = []
    for await (const item of gen) out.push(item)
    expect(out).toEqual([
      { kind: 'frame', sequence: 5, frame: 'frame-5' },
      { kind: 'frame', sequence: 6, frame: 'frame-6' },
      expect.objectContaining({ kind: 'end', reason: 'max_events' })
    ])
  })
})
