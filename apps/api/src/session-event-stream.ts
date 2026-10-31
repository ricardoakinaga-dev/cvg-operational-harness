import { Readable } from 'node:stream'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createCorrelationId, fail, type OperatorIdentity } from '@cvg/shared'
import type { SessionEventStore } from '@cvg/harness-contracts'
import {
  ReadSemaphore,
  TAIL_END_POLICY,
  tailSessionEvents,
  verifyTailCursor,
  type TailEndReason,
  type TailItem
} from '@cvg/harness'
import {
  PostgresSessionEventStore,
  type PostgresPoolLike
} from '@cvg/persistence'
import type { OperatorSessionRevalidation } from './operator-session-revalidation.ts'
import {
  CONNECTED_FRAME,
  HEARTBEAT_FRAME,
  SESSION_STREAM_ROUTE,
  formatEndFrame,
  formatEventFrame,
  parseStreamParams,
  validStreamSessionId
} from './session-event-frames.ts'

/** SPEC 0296 section 6, initial values; every one is validated when the composition starts. */
export interface SessionStreamLimits {
  readonly perOperator: number
  readonly perTenant: number
  readonly global: number
  readonly lifetimeMs: number
  readonly maxEvents: number
  readonly heartbeatMs: number
  readonly revalidateMs: number
  readonly revalidateRetryMs: number
  readonly slowConsumerMs: number
  readonly closeGraceMs: number
  readonly readConcurrency: number
  readonly pollMinMs: number
  readonly pollMaxMs: number
  readonly permanentEntries: number
  readonly permanentTtlMs: number
}

export const SESSION_STREAM_LIMIT_DEFAULTS: SessionStreamLimits = Object.freeze(
  {
    perOperator: 5,
    perTenant: 20,
    global: 200,
    lifetimeMs: 15 * 60_000,
    maxEvents: 50_000,
    heartbeatMs: 15_000,
    revalidateMs: 60_000,
    revalidateRetryMs: 5000,
    slowConsumerMs: 15_000,
    closeGraceMs: 5000,
    readConcurrency: 8,
    pollMinMs: 250,
    pollMaxMs: 2000,
    permanentEntries: 1000,
    permanentTtlMs: 5 * 60_000
  }
)

/** Floor and ceiling of each value; an invalid one stops the start, as in SPEC 0293. */
const BOUNDS: Readonly<
  Record<keyof SessionStreamLimits, readonly [number, number]>
> = {
  perOperator: [1, 100],
  perTenant: [1, 1000],
  global: [1, 5000],
  lifetimeMs: [10, 24 * 60 * 60_000],
  maxEvents: [1, 1_000_000],
  heartbeatMs: [5, 120_000],
  revalidateMs: [5, 15 * 60_000],
  revalidateRetryMs: [1, 60_000],
  slowConsumerMs: [5, 10 * 60_000],
  closeGraceMs: [5, 60_000],
  readConcurrency: [1, 64],
  pollMinMs: [1, 10_000],
  pollMaxMs: [1, 60_000],
  permanentEntries: [1, 100_000],
  permanentTtlMs: [1000, 24 * 60 * 60_000]
}

export function resolveSessionStreamLimits(
  override: Partial<SessionStreamLimits> = {}
): SessionStreamLimits {
  const merged = { ...SESSION_STREAM_LIMIT_DEFAULTS, ...override }
  for (const [key, [min, max]] of Object.entries(BOUNDS)) {
    const value = merged[key as keyof SessionStreamLimits]
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(
        `Session stream limit ${key} must be an integer from ${min} to ${max}`
      )
  }
  if (merged.pollMinMs > merged.pollMaxMs)
    throw new Error('Session stream pollMinMs must not exceed pollMaxMs')
  return merged
}

export interface SessionEventStreamOptions {
  /** A fixed store (fixtures). */
  readonly events?: SessionEventStore
  /** Production: the pool of its own for the tail and the dedicated schema. */
  readonly pool?: PostgresPoolLike
  readonly schemaName?: string
  readonly limits?: Partial<SessionStreamLimits>
}

/** One slot per connection, counted per operator, per tenant and globally (A8). */
export class StreamConnectionBudget {
  readonly #limits: Pick<
    SessionStreamLimits,
    'perOperator' | 'perTenant' | 'global'
  >
  readonly #operators = new Map<string, number>()
  readonly #tenants = new Map<string, number>()
  #total = 0

  constructor(
    limits: Pick<SessionStreamLimits, 'perOperator' | 'perTenant' | 'global'>
  ) {
    this.#limits = limits
  }

  get active(): number {
    return this.#total
  }

  /** The idempotent release of a slot, or `undefined` when any of the three limits is full. */
  reserve(operatorId: string, tenantId: string): (() => void) | undefined {
    const operator = this.#operators.get(operatorId) ?? 0
    const tenant = this.#tenants.get(tenantId) ?? 0
    if (
      this.#total >= this.#limits.global ||
      tenant >= this.#limits.perTenant ||
      operator >= this.#limits.perOperator
    )
      return undefined
    this.#total += 1
    this.#operators.set(operatorId, operator + 1)
    this.#tenants.set(tenantId, tenant + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      this.#total -= 1
      for (const [map, key] of [
        [this.#operators, operatorId],
        [this.#tenants, tenantId]
      ] as const) {
        const left = map.get(key)! - 1
        if (left <= 0) map.delete(key)
        else map.set(key, left)
      }
    }
  }
}

/**
 * Where a permanent end happened, so that the reconnection of an `EventSource` (which reconnects
 * forever and does not read `permanent`) is answered `204` and stops. Bounded and short-lived;
 * a restart forgets it and the client tries once more.
 */
export class PermanentEnds {
  readonly #entries = new Map<string, number>()
  readonly #max: number
  readonly #ttlMs: number
  readonly #now: () => number

  constructor(max: number, ttlMs: number, now: () => number) {
    this.#max = max
    this.#ttlMs = ttlMs
    this.#now = now
  }

  static key(tenantId: string, sessionId: string, position: number): string {
    return JSON.stringify([tenantId, sessionId, position])
  }

  add(key: string): void {
    this.#entries.delete(key)
    this.#entries.set(key, this.#now() + this.#ttlMs)
    while (this.#entries.size > this.#max) {
      const oldest = this.#entries.keys().next().value as string
      this.#entries.delete(oldest)
    }
  }

  has(key: string): boolean {
    const expiresAt = this.#entries.get(key)
    if (expiresAt === undefined) return false
    if (expiresAt <= this.#now()) {
      this.#entries.delete(key)
      return false
    }
    return true
  }
}

export interface SessionEventBodyOptions {
  readonly store: SessionEventStore
  readonly tenantId: string
  readonly sessionId: string
  readonly after: number
  readonly maxEvents: number
  readonly limits: SessionStreamLimits
  readonly permits: ReadSemaphore
  readonly random: () => number
  readonly signal: AbortSignal
  readonly onFirstFrame: () => void
  /** Receives the `lastSequence` of the `end`: the position a reconnection will present. */
  readonly onPermanentEnd: (lastSequence: number) => void
  /** The client has not consumed a forced `end` within the grace: the socket is dropped. */
  readonly onStuck: () => void
  readonly revalidate: (() => Promise<OperatorSessionRevalidation>) | undefined
}

/**
 * The response body: frames pulled from the tail one at a time. The buffer holds one frame, so
 * nothing is read from the log while the client does not drain (SPEC 0296 A9); a client that
 * does not drain for `slowConsumerMs` gets `end(slow_consumer)`.
 */
export class SessionEventBody extends Readable {
  readonly #o: SessionEventBodyOptions
  readonly #inner = new AbortController()
  #pumping = false
  #inFlight = false
  #ended = false
  #forced: TailEndReason | undefined
  #lastSequence: number
  #lastPush = Date.now()
  #sawFrame = false
  #slowTimer: NodeJS.Timeout | undefined
  readonly #timers = new Set<NodeJS.Timeout>()
  #gen: AsyncGenerator<TailItem, void, void>

  constructor(options: SessionEventBodyOptions) {
    super({ highWaterMark: 1 })
    this.#o = options
    this.#lastSequence = options.after
    options.signal.addEventListener('abort', () => this.#inner.abort(), {
      once: true
    })
    this.#gen = tailSessionEvents({
      store: options.store,
      tenantId: options.tenantId,
      sessionId: options.sessionId,
      after: options.after,
      signal: this.#inner.signal,
      permits: options.permits,
      maxEvents: options.maxEvents,
      lifetimeMs: options.limits.lifetimeMs,
      pollMinMs: options.limits.pollMinMs,
      pollMaxMs: options.limits.pollMaxMs,
      random: options.random,
      frameOf: formatEventFrame
    })
    this.#every(options.limits.heartbeatMs, () => {
      if (
        !this.#ended &&
        this.#slowTimer === undefined &&
        Date.now() - this.#lastPush >= options.limits.heartbeatMs
      )
        if (!this.#write(HEARTBEAT_FRAME)) this.#armSlowConsumer()
    })
    if (options.revalidate) this.#scheduleRevalidation(options.revalidate)
    // an immediate comment flushes the headers, so a client sees the connection open (onopen)
    this.#write(CONNECTED_FRAME)
  }

  #every(ms: number, fn: () => void): void {
    const timer = setInterval(fn, ms)
    timer.unref()
    this.#timers.add(timer)
  }

  #scheduleRevalidation(
    revalidate: () => Promise<OperatorSessionRevalidation>
  ): void {
    const { revalidateMs, revalidateRetryMs } = this.#o.limits
    const check = async (retried: boolean): Promise<void> => {
      let result: OperatorSessionRevalidation | undefined
      try {
        result = await revalidate()
      } catch {
        result = undefined
      }
      if (this.#ended) return
      if (result?.status === 'valid') return arm(revalidateMs, false)
      if (result?.status === 'revoked') return this.finish('session_revoked')
      // unavailable is never read as "still valid": one more try, then the stream ends
      if (retried) return this.finish('source_unavailable')
      arm(revalidateRetryMs, true)
    }
    const arm = (ms: number, retried: boolean) => {
      const timer = setTimeout(() => {
        this.#timers.delete(timer)
        void check(retried)
      }, ms)
      timer.unref()
      this.#timers.add(timer)
    }
    arm(revalidateMs, false)
  }

  #write(text: string): boolean {
    this.#lastPush = Date.now()
    if (!this.#sawFrame) {
      this.#sawFrame = true
      this.#o.onFirstFrame()
    }
    return this.push(text)
  }

  /** Only called while the stream has not ended; it ends it and stops every timer. */
  #emitEnd(reason: TailEndReason, permanent?: boolean): void {
    this.#ended = true
    this.#stopTimers()
    const policy = TAIL_END_POLICY[reason]
    this.#write(
      formatEndFrame({
        reason,
        lastSequence: this.#lastSequence,
        permanent: permanent ?? policy.permanent,
        retryBaseMs: policy.retryMs,
        random: this.#o.random
      })
    )
    if (permanent ?? policy.permanent)
      this.#o.onPermanentEnd(this.#lastSequence)
    this.push(null)
    // a client that stopped reading would keep the slot and the socket for ever (SPEC 0296 A9)
    const grace = setTimeout(() => {
      this.#timers.delete(grace)
      if (this.readableEnded) return
      this.#o.onStuck()
      this.destroy()
    }, this.#o.limits.closeGraceMs)
    grace.unref()
    this.#timers.add(grace)
  }

  /** The client does not drain: if it stays so for `slowConsumerMs` the stream ends. */
  #armSlowConsumer(): void {
    if (this.#slowTimer !== undefined) return
    this.#slowTimer = setTimeout(() => {
      this.#slowTimer = undefined
      this.finish('slow_consumer')
    }, this.#o.limits.slowConsumerMs)
    this.#slowTimer.unref()
  }

  /** Ends the stream with a reason that is not the tail's own (closing, revoked, slow, outage). */
  finish(reason: TailEndReason): void {
    if (this.#ended || this.#forced !== undefined) return
    this.#forced = reason
    this.#inner.abort()
    // a pump that is parked waiting for the client will not notice the abort by itself
    if (!this.#inFlight) this.#emitEnd(reason)
  }

  #stopTimers(): void {
    if (this.#slowTimer !== undefined) clearTimeout(this.#slowTimer)
    this.#slowTimer = undefined
    for (const timer of this.#timers) {
      clearInterval(timer)
      clearTimeout(timer)
    }
    this.#timers.clear()
  }

  _read(): void {
    if (this.#slowTimer !== undefined) {
      clearTimeout(this.#slowTimer)
      this.#slowTimer = undefined
    }
    void this.#pump()
  }

  async #pump(): Promise<void> {
    if (this.#pumping || this.#ended) return
    this.#pumping = true
    try {
      for (;;) {
        this.#inFlight = true
        let next
        try {
          next = await this.#gen.next()
        } finally {
          this.#inFlight = false
        }
        if (this.#ended) return
        if (next.done) {
          // silent end: the client left, or `finish` aborted the tail
          if (this.#forced !== undefined) this.#emitEnd(this.#forced)
          else this.push(null)
          this.#ended = true
          return
        }
        const item = next.value
        if (item.kind === 'end') {
          this.#lastSequence = item.lastSequence
          this.#emitEnd(this.#forced ?? item.reason, item.permanent)
          return
        }
        const sequence =
          item.kind === 'frame' ? item.sequence : item.event.sequence
        this.#lastSequence = sequence
        if (
          !this.#write(
            item.kind === 'frame' ? item.frame : formatEventFrame(item.event)
          )
        ) {
          // the client has not drained: wait for the next _read, with a deadline
          this.#armSlowConsumer()
          return
        }
      }
    } catch {
      this.destroy()
    } finally {
      this.#pumping = false
    }
  }

  override _destroy(
    error: Error | null,
    callback: (error?: Error | null) => void
  ): void {
    this.#ended = true
    this.#inner.abort()
    this.#stopTimers()
    callback(error)
  }
}

export interface SessionStreamDependencies {
  readonly app: FastifyInstance
  readonly options: SessionEventStreamOptions
  readonly requireIdentity: (
    headers: Record<string, unknown>,
    permission: string
  ) => OperatorIdentity
  readonly resolveDataPlaneTenant: (
    headers: Record<string, unknown>,
    identity: OperatorIdentity
  ) => string
  readonly mapError: (error: unknown) => {
    readonly status: number
    readonly code: string
    readonly message: string
  }
  /** Trusted mode only: the cookie's session id and the shared decision (SPEC 0296 A10). */
  readonly revalidation?: {
    readonly sessionIdOf: (
      headers: Record<string, unknown>
    ) => string | undefined
    readonly revalidate: (
      sessionId: string
    ) => Promise<OperatorSessionRevalidation>
  }
  /** Set by the session hook when the session store was unreachable for this request. */
  readonly sessionStoreFailureByHeaders: WeakSet<object>
  /** Latency of the route is the time to the first frame, not the life of the connection. */
  readonly firstFrameLatencyMs: WeakMap<object, number>
  readonly now?: () => number
  readonly random?: () => number
}

/**
 * The name is the catalog's: the permission is tenant-wide read of the conversation record
 * (decision D8-a), there is no per-session assignment behind it (SPEC 0296 A4).
 */
export const SESSION_STREAM_READ_PERMISSION = 'conversation:view_assigned'

export function installSessionEventStream(deps: SessionStreamDependencies): {
  readonly budget: StreamConnectionBudget
} {
  const { app, options } = deps
  if (!options.events && !(options.pool && options.schemaName))
    throw new Error(
      'Session event streams need a store or a pool with its schema'
    )
  const limits = resolveSessionStreamLimits(options.limits)
  const now = deps.now ?? Date.now
  const random = deps.random ?? Math.random
  const budget = new StreamConnectionBudget(limits)
  const permits = new ReadSemaphore(limits.readConcurrency)
  const permanent = new PermanentEnds(
    limits.permanentEntries,
    limits.permanentTtlMs,
    now
  )
  const active = new Set<SessionEventBody>()
  // set by `preClose`: a stream that arrives while the others are saying goodbye is told so in band
  let closing = false
  // the store is built per request with the tenant of the identity: no registry, no cache (A4)
  const storeFor = (tenantId: string): SessionEventStore =>
    options.events ??
    new PostgresSessionEventStore(options.pool!, {
      tenantId,
      schemaName: options.schemaName!
    })

  const sse = (reply: FastifyReply) =>
    reply
      .code(200)
      .header('content-type', 'text/event-stream; charset=utf-8')
      .header('cache-control', 'no-store')
      .header('x-accel-buffering', 'no')
      // the connection does not outlive the stream, so a shutdown is not held by a kept-alive socket
      .header('connection', 'close')

  /** A transient refusal travels inside a 200, because an EventSource never retries a non-200 (D11). */
  const refuseInBand = (
    reply: FastifyReply,
    reason: 'too_many_streams' | 'source_unavailable' | 'server_closing',
    position: number
  ) =>
    sse(reply).send(
      formatEndFrame({
        reason,
        lastSequence: position,
        permanent: false,
        retryBaseMs: TAIL_END_POLICY[reason].retryMs,
        random
      })
    )

  const refuse = (
    reply: FastifyReply,
    status: number,
    code: string,
    message: string
  ) => {
    reply.code(status).header('cache-control', 'no-store')
    return reply.send(fail(code, message, createCorrelationId()))
  }

  app.route({
    method: 'GET',
    url: SESSION_STREAM_ROUTE,
    exposeHeadRoute: false,
    handler: async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { sessionId?: unknown }
      const query = request.query as Record<string, unknown>
      const parsed = parseStreamParams(query, request.headers['last-event-id'])
      const outage = deps.sessionStoreFailureByHeaders.has(request.headers)
      let identity: OperatorIdentity | undefined
      let tenantId = ''
      if (!outage) {
        try {
          identity = deps.requireIdentity(
            request.headers,
            SESSION_STREAM_READ_PERMISSION
          )
          tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
        } catch (error) {
          const mapped = deps.mapError(error)
          return refuse(reply, mapped.status, mapped.code, mapped.message)
        }
      }
      if (!validStreamSessionId(params.sessionId))
        return refuse(reply, 400, 'validation_failed', 'sessionId is invalid')
      if (!parsed.ok)
        return refuse(reply, 400, 'validation_failed', parsed.message)
      const sessionId = params.sessionId
      // the session store was unreachable for this cookie: the client gets a retry, not a 503
      if (outage) return refuseInBand(reply, 'source_unavailable', parsed.after)
      if (permanent.has(PermanentEnds.key(tenantId, sessionId, parsed.after))) {
        reply.code(204).header('cache-control', 'no-store')
        return reply.send()
      }
      if (closing) return refuseInBand(reply, 'server_closing', parsed.after)
      // the slot comes before any read, so a flood of attempts costs no database read (A8)
      const release = budget.reserve(identity!.operatorId, tenantId)
      if (release === undefined)
        return refuseInBand(reply, 'too_many_streams', parsed.after)
      const closed = new AbortController()
      reply.raw.once('close', () => {
        closed.abort()
        release()
      })
      const store = storeFor(tenantId)
      const check = await verifyTailCursor({
        store,
        tenantId,
        sessionId,
        after: parsed.after,
        signal: closed.signal,
        permits,
        random
      })
      if (check === 'aborted') return reply
      if (check === 'not_found') {
        release()
        return refuse(reply, 404, 'not_found', 'Session not found')
      }
      if (check === 'cursor_ahead') {
        release()
        return refuse(reply, 409, 'conflict', 'cursor_ahead')
      }
      if (check === 'unavailable') {
        release()
        return refuseInBand(reply, 'source_unavailable', parsed.after)
      }
      const sessionCookieId = deps.revalidation?.sessionIdOf(request.headers)
      const startedAt = performance.now()
      const body = new SessionEventBody({
        store,
        tenantId,
        sessionId,
        after: parsed.after,
        maxEvents: Math.min(
          parsed.maxEvents ?? limits.maxEvents,
          limits.maxEvents
        ),
        limits,
        permits,
        random,
        signal: closed.signal,
        onFirstFrame: () =>
          deps.firstFrameLatencyMs.set(request, performance.now() - startedAt),
        onPermanentEnd: (lastSequence) =>
          permanent.add(PermanentEnds.key(tenantId, sessionId, lastSequence)),
        onStuck: () => reply.raw.destroy(),
        revalidate:
          deps.revalidation && sessionCookieId !== undefined
            ? () => deps.revalidation!.revalidate(sessionCookieId)
            : undefined
      })
      active.add(body)
      // the slot also goes back when the body itself is gone, whatever the socket does next
      body.once('close', () => {
        active.delete(body)
        release()
      })
      reply.raw.once('close', () => body.destroy())
      return sse(reply).send(body)
    }
  })

  // `return503OnClosing` is off so that the stream route can answer in band while closing; every
  // other route keeps the 503 Fastify would have given it (SPEC 0296 A13).
  app.addHook('onRequest', async (request, reply) => {
    if (!closing || request.routeOptions.url === SESSION_STREAM_ROUTE) return
    reply.code(503).header('connection', 'close')
    return reply.send({ error: 'Service Unavailable' })
  })

  // The HEAD derived by Fastify would run the loop and hold a slot; this one answers and stops.
  app.route({
    method: 'HEAD',
    url: SESSION_STREAM_ROUTE,
    handler: async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.code(405).header('allow', 'GET').header('cache-control', 'no-store')
      return reply.send()
    }
  })

  // Before `close()` waits for the active responses: say goodbye, then force after the grace.
  app.addHook('preClose', async () => {
    closing = true
    if (active.size === 0) return
    for (const body of active) body.finish('server_closing')
    const deadline = Date.now() + limits.closeGraceMs
    while (active.size > 0 && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 10))
    for (const body of active) body.destroy()
  })

  return { budget }
}
