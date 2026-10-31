import type { SessionEvent, SessionEventStore } from '@cvg/harness-contracts'
import { SessionEventError } from './events.ts'

/**
 * SPEC 0296 section 4: the transport-independent core of the session event stream. Given a
 * `SessionEventStore` bound to a tenant it yields the committed events of one session in dense
 * sequence order, then an `end` item with the reason. HTTP, SSE, frames, identity and the
 * connection budgets belong to the adapters.
 */

/** Why a tail ends. The adapters add `server_closing`, `slow_consumer`, `session_revoked`, `too_many_streams`. */
export type TailEndReason =
  | 'max_events'
  | 'lifetime'
  | 'source_unavailable'
  | 'sequence_gap'
  | 'corrupt_event'
  | 'server_closing'
  | 'slow_consumer'
  | 'session_revoked'
  | 'too_many_streams'

/** SPEC 0296 section 5.2: whether reconnecting at the same cursor would repeat the defect. */
export const TAIL_END_POLICY: Readonly<
  Record<
    TailEndReason,
    { readonly permanent: boolean; readonly retryMs: number }
  >
> = Object.freeze({
  max_events: { permanent: false, retryMs: 0 },
  lifetime: { permanent: false, retryMs: 1000 },
  server_closing: { permanent: false, retryMs: 1000 },
  slow_consumer: { permanent: false, retryMs: 5000 },
  source_unavailable: { permanent: false, retryMs: 5000 },
  session_revoked: { permanent: false, retryMs: 5000 },
  too_many_streams: { permanent: false, retryMs: 5000 },
  sequence_gap: { permanent: true, retryMs: 60000 },
  corrupt_event: { permanent: true, retryMs: 60000 }
})

export type TailItem =
  | { readonly kind: 'event'; readonly event: SessionEvent }
  | {
      readonly kind: 'end'
      readonly reason: TailEndReason
      /** The last sequence emitted, or the starting cursor when none was. */
      readonly lastSequence: number
      readonly permanent: boolean
    }

/** SPEC 0296 section 6, initial values. */
export const TAIL_DEFAULTS = Object.freeze({
  pageEvents: 10,
  maxEvents: 50_000,
  lifetimeMs: 15 * 60_000,
  pollMinMs: 250,
  pollMaxMs: 2000,
  readAttempts: 3,
  readTimeoutMs: 5000,
  retryBackoffMs: 100
})

const nonEmpty = (value: unknown): boolean =>
  typeof value === 'string' && value.length > 0

/**
 * The envelope of an event, and nothing of its payload: the stream must not skip an event it does
 * not know (a type of a later catalog), so the payload is never judged here; the projection
 * (SPEC 0296 A11) decides what leaves and denies by default. The store has already validated
 * against the catalog it serves.
 */
function sound(event: unknown): event is SessionEvent {
  if (typeof event !== 'object' || event === null) return false
  const e = event as Record<string, unknown>
  return (
    Number.isSafeInteger(e.sequence) &&
    (e.sequence as number) >= 1 &&
    nonEmpty(e.tenantId) &&
    nonEmpty(e.sessionId) &&
    nonEmpty(e.eventId) &&
    nonEmpty(e.type) &&
    nonEmpty(e.timestamp) &&
    nonEmpty(e.correlationId) &&
    nonEmpty(e.traceId)
  )
}

const abortReason = (signal: AbortSignal): unknown => signal.reason

/** FIFO counting semaphore; a waiter that is aborted leaves the queue and never holds a permit. */
export class ReadSemaphore {
  readonly #permits: number
  #inUse = 0
  readonly #queue: Array<() => void> = []

  constructor(permits: number) {
    if (!Number.isSafeInteger(permits) || permits < 1)
      throw new RangeError('A read semaphore needs at least one permit')
    this.#permits = permits
  }

  get inUse(): number {
    return this.#inUse
  }

  get waiting(): number {
    return this.#queue.length
  }

  /** Resolves with an idempotent release; rejects with the abort reason if aborted first. */
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal))
    const release = (): (() => void) => {
      let released = false
      return () => {
        if (released) return
        released = true
        this.#inUse -= 1
        this.#next()
      }
    }
    if (this.#inUse < this.#permits && this.#queue.length === 0) {
      this.#inUse += 1
      return Promise.resolve(release())
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        signal?.removeEventListener('abort', onAbort)
        this.#inUse += 1
        resolve(release())
      }
      const onAbort = () => {
        // the listener is removed when the waiter is granted, so the waiter is still queued here
        this.#queue.splice(this.#queue.indexOf(grant), 1)
        reject(abortReason(signal!))
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      this.#queue.push(grant)
    })
  }

  #next(): void {
    while (this.#inUse < this.#permits) {
      const grant = this.#queue.shift()
      if (!grant) return
      grant()
    }
  }
}

export interface TailRuntime {
  readonly now?: () => number
  /** Resolves after `ms`, or rejects with the abort reason. */
  readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>
  /** In [0, 1). */
  readonly random?: () => number
  /** The per-read timeout timer; a real timer unless a test replaces it. */
  readonly timeoutSleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

export interface TailOptions extends TailRuntime {
  /** Already bound to a tenant by the composition (SPEC 0296 A4). */
  readonly store: SessionEventStore
  readonly tenantId: string
  readonly sessionId: string
  /** Last sequence the client already has; the first event emitted is `after + 1`. */
  readonly after: number
  readonly signal: AbortSignal
  readonly permits?: ReadSemaphore
  readonly pageEvents?: number
  readonly maxEvents?: number
  readonly lifetimeMs?: number
  readonly pollMinMs?: number
  readonly pollMaxMs?: number
  readonly readAttempts?: number
  readonly readTimeoutMs?: number
  readonly retryBackoffMs?: number
}

export function defaultTailSleep(
  ms: number,
  signal: AbortSignal
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortReason(signal))
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortReason(signal))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

type ReadOutcome =
  | { readonly status: 'events'; readonly events: readonly SessionEvent[] }
  | { readonly status: 'not_open' }
  | { readonly status: 'failed' }
  | { readonly status: 'aborted' }

interface ReadSettings {
  readonly store: SessionEventStore
  readonly tenantId: string
  readonly sessionId: string
  readonly signal: AbortSignal
  readonly permits: ReadSemaphore | undefined
  readonly attempts: number
  readonly timeoutMs: number
  readonly backoffMs: number
  readonly now: () => number
  readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>
  readonly timeoutSleep: (ms: number, signal: AbortSignal) => Promise<void>
  /** Called with how long the permit took to get. */
  readonly onWait?: (ms: number) => void
}

class ReadTimeout extends Error {}

/**
 * One page, behind the semaphore, with bounded retries. The permit stays held until the store
 * call itself settles, so a read that hangs past its timeout still counts against the bound on
 * simultaneous reads (a timed-out call is abandoned, not cancelled).
 */
async function readPage(
  settings: ReadSettings,
  afterSequence: number,
  limit: number
): Promise<ReadOutcome> {
  for (let attempt = 1; attempt <= settings.attempts; attempt += 1) {
    if (settings.signal.aborted) return { status: 'aborted' }
    let release: (() => void) | undefined
    if (settings.permits) {
      const waitStart = settings.now()
      try {
        release = await settings.permits.acquire(settings.signal)
      } catch {
        return { status: 'aborted' }
      }
      settings.onWait?.(settings.now() - waitStart)
      if (settings.signal.aborted) {
        release()
        return { status: 'aborted' }
      }
    }
    const call = settings.store.read({
      tenantId: settings.tenantId,
      sessionId: settings.sessionId,
      afterSequence,
      limit
    })
    // the permit goes back when the call settles, not when we stop waiting for it
    const settled = call.then(
      () => release?.(),
      () => release?.()
    )
    void settled
    const stop = new AbortController()
    const timeout = settings
      .timeoutSleep(settings.timeoutMs, stop.signal)
      .then(() => {
        throw new ReadTimeout()
      })
    timeout.catch(() => undefined)
    let events: readonly SessionEvent[] | undefined
    let failure: unknown
    try {
      events = await Promise.race([call, timeout])
    } catch (error) {
      failure = error
    } finally {
      stop.abort()
    }
    if (settings.signal.aborted) return { status: 'aborted' }
    if (events !== undefined) return { status: 'events', events }
    if (
      failure instanceof SessionEventError &&
      failure.code === 'session_not_open'
    )
      return { status: 'not_open' }
    if (attempt < settings.attempts) {
      try {
        await settings.sleep(settings.backoffMs * attempt, settings.signal)
      } catch {
        return { status: 'aborted' }
      }
    }
  }
  return { status: 'failed' }
}

function settingsOf(
  options: Pick<
    TailOptions,
    | 'store'
    | 'tenantId'
    | 'sessionId'
    | 'signal'
    | 'permits'
    | 'readAttempts'
    | 'readTimeoutMs'
    | 'retryBackoffMs'
    | keyof TailRuntime
  >,
  onWait?: (ms: number) => void
): ReadSettings {
  return {
    store: options.store,
    tenantId: options.tenantId,
    sessionId: options.sessionId,
    signal: options.signal,
    permits: options.permits,
    attempts: options.readAttempts ?? TAIL_DEFAULTS.readAttempts,
    timeoutMs: options.readTimeoutMs ?? TAIL_DEFAULTS.readTimeoutMs,
    backoffMs: options.retryBackoffMs ?? TAIL_DEFAULTS.retryBackoffMs,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? defaultTailSleep,
    timeoutSleep: options.timeoutSleep ?? defaultTailSleep,
    ...(onWait ? { onWait } : {})
  }
}

export type TailCursorCheck =
  | 'ok'
  /** The cursor is beyond the end of the log (SPEC 0296 A6): `409 cursor_ahead`. */
  | 'cursor_ahead'
  /** The session is not open for this tenant: `404`, identical for another tenant's. */
  | 'not_found'
  | 'unavailable'
  | 'aborted'

/**
 * SPEC 0296 A6: before any header, the event at `after` must exist (or `after` is 0). The read
 * also proves the session exists for this tenant.
 */
export async function verifyTailCursor(
  options: Omit<
    TailOptions,
    'pageEvents' | 'maxEvents' | 'lifetimeMs' | 'pollMinMs' | 'pollMaxMs'
  >
): Promise<TailCursorCheck> {
  const outcome = await readPage(
    settingsOf(options),
    Math.max(options.after - 1, 0),
    1
  )
  if (outcome.status === 'aborted') return 'aborted'
  if (outcome.status === 'not_open') return 'not_found'
  if (outcome.status === 'failed') return 'unavailable'
  if (options.after === 0) return 'ok'
  const [event] = outcome.events
  if (event === undefined) return 'cursor_ahead'
  return sound(event) &&
    event.sequence === options.after &&
    event.tenantId === options.tenantId &&
    event.sessionId === options.sessionId
    ? 'ok'
    : 'unavailable'
}

/**
 * The committed events of one session after `after`, in dense order, then one `end`.
 *
 * - Pull-based: the next page is read only when the consumer asks for the item after the last of
 *   the previous one (backpressure by construction, SPEC 0296 A9).
 * - A sequence other than the expected one stops the tail without emitting it (`sequence_gap`,
 *   A2); an event that fails validation or belongs to another stream is `corrupt_event`.
 * - An aborted signal ends the iteration silently, without a final item and without another read:
 *   the signal is checked after every await (A13).
 * - An empty page waits `pollMin` growing to `pollMax` with jitter, and never less than the wait
 *   observed for a read permit, so saturation spreads the load instead of ending connections.
 */
export async function* tailSessionEvents(
  options: TailOptions
): AsyncGenerator<TailItem, void, void> {
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? defaultTailSleep
  const random = options.random ?? Math.random
  const pageEvents = options.pageEvents ?? TAIL_DEFAULTS.pageEvents
  const maxEvents = options.maxEvents ?? TAIL_DEFAULTS.maxEvents
  const lifetimeMs = options.lifetimeMs ?? TAIL_DEFAULTS.lifetimeMs
  const pollMin = options.pollMinMs ?? TAIL_DEFAULTS.pollMinMs
  const pollMax = options.pollMaxMs ?? TAIL_DEFAULTS.pollMaxMs
  const startedAt = now()
  let observedWait = 0
  const settings = settingsOf(options, (ms) => {
    observedWait = ms
  })
  let expected = options.after + 1
  let emitted = 0
  let poll = pollMin
  const end = (reason: TailEndReason): TailItem => ({
    kind: 'end',
    reason,
    lastSequence: expected - 1,
    permanent: TAIL_END_POLICY[reason].permanent
  })
  const jittered = (ms: number) => ms + Math.floor(random() * ms * 0.5)

  for (;;) {
    if (options.signal.aborted) return
    if (now() - startedAt >= lifetimeMs) {
      yield end('lifetime')
      return
    }
    if (emitted >= maxEvents) {
      yield end('max_events')
      return
    }
    const outcome = await readPage(settings, expected - 1, pageEvents)
    if (options.signal.aborted || outcome.status === 'aborted') return
    if (outcome.status !== 'events') {
      yield end('source_unavailable')
      return
    }
    const page = outcome.events
    if (page.length === 0) {
      try {
        await sleep(jittered(Math.max(poll, observedWait)), options.signal)
      } catch {
        return
      }
      poll = Math.min(poll * 2, pollMax)
      continue
    }
    // a store that ignores the page size would put more than the budgeted bytes in flight
    if (page.length > pageEvents) {
      yield end('corrupt_event')
      return
    }
    poll = pollMin
    for (const candidate of page) {
      if (emitted >= maxEvents) {
        yield end('max_events')
        return
      }
      const event: SessionEvent = candidate
      if (!sound(event)) {
        yield end('corrupt_event')
        return
      }
      if (
        event.tenantId !== options.tenantId ||
        event.sessionId !== options.sessionId
      ) {
        yield end('corrupt_event')
        return
      }
      if (event.sequence !== expected) {
        yield end('sequence_gap')
        return
      }
      yield { kind: 'event', event }
      expected += 1
      emitted += 1
      if (options.signal.aborted) return
    }
    if (page.length < pageEvents) {
      try {
        await sleep(jittered(Math.max(pollMin, observedWait)), options.signal)
      } catch {
        return
      }
    }
  }
}
