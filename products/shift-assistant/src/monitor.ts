import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { MAX_ATTEMPTS, RETRY_DELAYS_MS } from './domain.ts'
import { ATTENTION_CODES, READINESS_REASON_CODES } from './health.ts'

/**
 * External monitor of the shift assistant (SPEC 0179 section 10, PISO-008).
 * It runs outside the assistant's process (and, in production, on another
 * machine): polls `/health/live` and `/health/ready` every 10 s with a 2 s
 * timeout, opens an episode after two consecutive failures of a reason,
 * resolves it after two good probes, sends at most one update per minute per
 * reason and delivers every event through a durable queue (five attempts at
 * the inbox delays) to a receiver that must return a receipt for the exact
 * payload hash. Events carry only the fields below: no phone, patient, text
 * or URL.
 */

export const MONITOR_DEFAULTS = {
  intervalMs: 10_000,
  timeoutMs: 2_000,
  failuresToFire: 2,
  successesToResolve: 2,
  resendIntervalMs: 60_000
} as const

export type Severity = 'critical' | 'warning' | 'info'

export interface Finding {
  reasonCode: string
  severity: Severity
  source: 'live' | 'ready'
}

export type ProbeOutcome =
  | { kind: 'response'; status: number; body: unknown }
  | { kind: 'timeout' }
  | { kind: 'unreachable' }

export interface ProbeResult {
  live: ProbeOutcome
  ready?: ProbeOutcome
}

export interface Classified {
  findings: Finding[]
  /** True only when /health/live answered 200: the only good live probe. */
  liveOk: boolean
  /** False when readiness was not observed (live failed or ready timed out). */
  readyObserved: boolean
}

export interface Observation extends Classified {
  at: Date
}

export interface AlertEvent {
  alertId: string
  product: 'shift-assistant'
  candidateDigest: string
  instanceOpaqueId: string
  reasonCode: string
  firstObservedAt: string
  observedAt: string
  severity: Severity
  state: 'firing' | 'resolved'
}

export type DeliveryResult =
  | { ok: true; receiptId: string; payloadSha256: string }
  | { ok: false; code: string }

const SEVERITY: Record<string, Severity> = {
  storage_unavailable: 'critical',
  job_deadline_exceeded: 'critical',
  scheduler_stale: 'critical',
  inbox_stalled: 'critical',
  backlog_full: 'warning',
  stopping: 'warning'
}
const READINESS = new Set<string>(READINESS_REASON_CODES)
const ATTENTION = new Set<string>(ATTENTION_CODES)
const MAX_BODY = 16 * 1024

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Maps a probe to stable findings. Unknown readiness codes become
 * `not_ready` and unknown attention codes are dropped: nothing received from
 * the assistant is echoed into an alert.
 */
export function classifyProbe(result: ProbeResult): Classified {
  const live = result.live
  if (live.kind !== 'response') {
    return {
      findings: [
        {
          reasonCode:
            live.kind === 'timeout' ? 'live_timeout' : 'live_unreachable',
          severity: 'critical',
          source: 'live'
        }
      ],
      liveOk: false,
      readyObserved: false
    }
  }
  if (live.status !== 200) {
    return {
      findings: [
        { reasonCode: 'live_status', severity: 'critical', source: 'live' }
      ],
      liveOk: false,
      readyObserved: false
    }
  }
  const ready = result.ready
  if (!ready) return { findings: [], liveOk: true, readyObserved: false }
  if (ready.kind !== 'response') {
    return {
      findings: [
        {
          reasonCode:
            ready.kind === 'timeout' ? 'ready_timeout' : 'ready_unreachable',
          severity: 'critical',
          source: 'ready'
        }
      ],
      liveOk: true,
      readyObserved: false
    }
  }
  const findings: Finding[] = []
  if (ready.status === 200 && !isRecord(ready.body)) {
    // A 200 without a readable status body is not proof of readiness.
    findings.push({
      reasonCode: 'ready_invalid',
      severity: 'critical',
      source: 'ready'
    })
  }
  const body = isRecord(ready.body) ? ready.body : {}
  const codes = Array.isArray(body.reasonCodes) ? body.reasonCodes : []
  let unknown = false
  for (const code of codes) {
    if (typeof code === 'string' && READINESS.has(code)) {
      findings.push({
        reasonCode: code,
        severity: SEVERITY[code] ?? 'critical',
        source: 'ready'
      })
    } else {
      unknown = true
    }
  }
  if (unknown || (ready.status === 503 && findings.length === 0)) {
    findings.push({
      reasonCode: 'not_ready',
      severity: 'critical',
      source: 'ready'
    })
  }
  if (ready.status !== 200 && ready.status !== 503) {
    findings.push({
      reasonCode: 'ready_status',
      severity: 'critical',
      source: 'ready'
    })
  }
  if (ready.status === 200 && body.mode === 'paused') {
    findings.push({ reasonCode: 'paused', severity: 'info', source: 'ready' })
  }
  const attention = Array.isArray(body.attention) ? body.attention : []
  for (const code of attention) {
    if (typeof code === 'string' && ATTENTION.has(code)) {
      findings.push({ reasonCode: code, severity: 'warning', source: 'ready' })
    }
  }
  return { findings, liveOk: true, readyObserved: true }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

async function probeOne(
  url: string,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<ProbeOutcome> {
  const signal = AbortSignal.timeout(timeoutMs)
  try {
    const response = await fetchImpl(url, { signal, redirect: 'manual' })
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (reader) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY) {
        await reader.cancel().catch(() => undefined)
        break
      }
      chunks.push(value)
    }
    let body: unknown
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      body = undefined
    }
    return { kind: 'response', status: response.status, body }
  } catch {
    return signal.aborted ? { kind: 'timeout' } : { kind: 'unreachable' }
  }
}

/** One probe of live, then ready when live answered 200. */
export async function probeAssistant(
  liveUrl: string,
  readyUrl: string,
  options: { timeoutMs?: number; fetchImpl?: FetchLike } = {}
): Promise<ProbeResult> {
  const timeoutMs = options.timeoutMs ?? MONITOR_DEFAULTS.timeoutMs
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as FetchLike)
  const live = await probeOne(liveUrl, timeoutMs, fetchImpl)
  if (live.kind !== 'response' || live.status !== 200) return { live }
  return { live, ready: await probeOne(readyUrl, timeoutMs, fetchImpl) }
}

interface Episode {
  alertId: string
  firstObservedAt: string
  severity: Severity
  lastSentAt: string
}

interface ReasonState {
  source: 'live' | 'ready'
  bad: number
  good: number
  streakSince?: string
  episode?: Episode
}

interface QueueItem {
  deliveryId: string
  alertId: string
  reasonCode: string
  state: AlertEvent['state']
  body: string
  payloadSha256: string
  attempts: number
  nextAttemptAt: string
  status: 'pending' | 'delivered' | 'failed'
  receiptId?: string
  deliveredAt?: string
  lastError?: string
}

interface MonitorState {
  version: 1
  reasons: Record<string, ReasonState>
  queue: QueueItem[]
}

export interface MonitorStatus {
  open: Array<{
    reasonCode: string
    alertId: string
    severity: Severity
    firstObservedAt: string
  }>
  pending: number
  delivered: Array<{
    deliveryId: string
    alertId: string
    reasonCode: string
    state: AlertEvent['state']
    attempts: number
    receiptId: string
    payloadSha256: string
    deliveredAt: string
  }>
  failed: Array<{
    deliveryId: string
    alertId: string
    reasonCode: string
    state: AlertEvent['state']
    attempts: number
    lastError: string
  }>
}

export interface MonitorOptions {
  /** Durable state (episodes and delivery queue), written atomically. */
  stateFile: string
  /** Digest of the candidate under watch (image or program SHA-256). */
  candidateDigest: string
  /** Opaque label of the watched instance; never a host name or URL. */
  instanceOpaqueId: string
  deliver: (body: string) => Promise<DeliveryResult>
  clock?: () => Date
  logger?: (event: string, fields: Record<string, unknown>) => void
  failuresToFire?: number
  successesToResolve?: number
  resendIntervalMs?: number
}

const KEEP = 500

/**
 * Episode tracking and the durable delivery queue. `observe` and `flush`
 * persist the state after every change, so a restart of the monitor process
 * keeps open episodes, attempt counters and the next attempt times.
 */
export class AlertMonitor {
  readonly #options: Required<Omit<MonitorOptions, 'logger' | 'clock'>> & {
    clock: () => Date
    logger: (event: string, fields: Record<string, unknown>) => void
  }
  #state: MonitorState

  constructor(options: MonitorOptions) {
    this.#options = {
      failuresToFire: MONITOR_DEFAULTS.failuresToFire,
      successesToResolve: MONITOR_DEFAULTS.successesToResolve,
      resendIntervalMs: MONITOR_DEFAULTS.resendIntervalMs,
      clock: () => new Date(),
      logger: () => undefined,
      ...options
    }
    this.#state = this.#load()
  }

  /** Updates episodes from one observation; returns the events queued. */
  observe(observation: Observation): AlertEvent[] {
    const at = observation.at.toISOString()
    const now = observation.at.getTime()
    const reasons = this.#state.reasons
    const present = new Map(
      observation.findings.map((finding) => [finding.reasonCode, finding])
    )
    const events: AlertEvent[] = []
    for (const [code, finding] of present) {
      const state = (reasons[code] ??= {
        source: finding.source,
        bad: 0,
        good: 0
      })
      state.bad += 1
      state.good = 0
      state.streakSince ??= at
      if (!state.episode) {
        if (state.bad >= this.#options.failuresToFire) {
          state.episode = {
            alertId: randomUUID(),
            firstObservedAt: state.streakSince,
            severity: finding.severity,
            lastSentAt: at
          }
          events.push(this.#event(code, state.episode, at, 'firing'))
        }
      } else if (
        now - Date.parse(state.episode.lastSentAt) >=
        this.#options.resendIntervalMs
      ) {
        state.episode.lastSentAt = at
        events.push(this.#event(code, state.episode, at, 'firing'))
      }
    }
    for (const [code, state] of Object.entries(reasons)) {
      if (present.has(code)) continue
      // A reason is cleared only by a good probe of its own source: live
      // answering 200 (not live failing with another code), or an observed
      // readiness.
      if (state.source === 'live' && !observation.liveOk) continue
      if (state.source === 'ready' && !observation.readyObserved) continue
      state.bad = 0
      delete state.streakSince
      if (!state.episode) {
        delete reasons[code]
        continue
      }
      state.good += 1
      if (state.good >= this.#options.successesToResolve) {
        events.push(this.#event(code, state.episode, at, 'resolved'))
        delete reasons[code]
      }
    }
    for (const event of events) this.#enqueue(event, at)
    this.#persist()
    return events
  }

  /** Delivers every due item once; failures wait for the next delay. */
  async flush(): Promise<void> {
    for (const item of this.#state.queue) {
      const now = this.#options.clock()
      if (
        item.status !== 'pending' ||
        Date.parse(item.nextAttemptAt) > now.getTime()
      ) {
        continue
      }
      item.attempts += 1
      let result: DeliveryResult
      try {
        result = await this.#options.deliver(item.body)
      } catch {
        result = { ok: false, code: 'deliver_failed' }
      }
      if (
        result.ok &&
        result.receiptId.length > 0 &&
        result.payloadSha256 === item.payloadSha256
      ) {
        item.status = 'delivered'
        item.receiptId = result.receiptId
        item.deliveredAt = this.#options.clock().toISOString()
        delete item.lastError
      } else {
        item.lastError = result.ok ? 'receipt_mismatch' : result.code
        if (item.attempts >= MAX_ATTEMPTS) {
          item.status = 'failed'
          this.#options.logger('shift.monitor.delivery_failed', {
            deliveryId: item.deliveryId,
            alertId: item.alertId,
            reasonCode: item.reasonCode,
            attempts: item.attempts,
            code: item.lastError
          })
        } else {
          item.nextAttemptAt = new Date(
            now.getTime() + RETRY_DELAYS_MS[item.attempts - 1]!
          ).toISOString()
        }
      }
      this.#prune()
      this.#persist()
    }
  }

  status(): MonitorStatus {
    return {
      open: Object.entries(this.#state.reasons)
        .filter(([, state]) => state.episode)
        .map(([reasonCode, state]) => ({
          reasonCode,
          alertId: state.episode!.alertId,
          severity: state.episode!.severity,
          firstObservedAt: state.episode!.firstObservedAt
        })),
      pending: this.#state.queue.filter((item) => item.status === 'pending')
        .length,
      delivered: this.#state.queue
        .filter((item) => item.status === 'delivered')
        .map((item) => ({
          deliveryId: item.deliveryId,
          alertId: item.alertId,
          reasonCode: item.reasonCode,
          state: item.state,
          attempts: item.attempts,
          receiptId: item.receiptId!,
          payloadSha256: item.payloadSha256,
          deliveredAt: item.deliveredAt!
        })),
      failed: this.#state.queue
        .filter((item) => item.status === 'failed')
        .map((item) => ({
          deliveryId: item.deliveryId,
          alertId: item.alertId,
          reasonCode: item.reasonCode,
          state: item.state,
          attempts: item.attempts,
          lastError: item.lastError ?? 'unknown'
        }))
    }
  }

  /** Bodies of the events delivered, by delivery id (for proofs). */
  deliveredBodies(): Array<{ deliveryId: string; body: string }> {
    return this.#state.queue
      .filter((item) => item.status === 'delivered')
      .map((item) => ({ deliveryId: item.deliveryId, body: item.body }))
  }

  #event(
    reasonCode: string,
    episode: Episode,
    observedAt: string,
    state: AlertEvent['state']
  ): AlertEvent {
    return {
      alertId: episode.alertId,
      product: 'shift-assistant',
      candidateDigest: this.#options.candidateDigest,
      instanceOpaqueId: this.#options.instanceOpaqueId,
      reasonCode,
      firstObservedAt: episode.firstObservedAt,
      observedAt,
      severity: episode.severity,
      state
    }
  }

  #enqueue(event: AlertEvent, at: string): void {
    const body = JSON.stringify(event)
    this.#state.queue.push({
      deliveryId: randomUUID(),
      alertId: event.alertId,
      reasonCode: event.reasonCode,
      state: event.state,
      body,
      payloadSha256: sha256(body),
      attempts: 0,
      nextAttemptAt: at,
      status: 'pending'
    })
  }

  #prune(): void {
    const settled = this.#state.queue.filter(
      (item) => item.status !== 'pending'
    )
    if (settled.length <= KEEP) return
    const drop = new Set(settled.slice(0, settled.length - KEEP))
    this.#state.queue = this.#state.queue.filter((item) => !drop.has(item))
  }

  #load(): MonitorState {
    const file = this.#options.stateFile
    if (!existsSync(file)) return { version: 1, reasons: {}, queue: [] }
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !isRecord(parsed.reasons) ||
      !Array.isArray(parsed.queue)
    ) {
      // Fail closed: a damaged queue is the operator's to inspect.
      throw new Error('monitor state invalid')
    }
    return parsed as unknown as MonitorState
  }

  #persist(): void {
    const file = this.#options.stateFile
    const dir = dirname(file)
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const temporary = `${file}.${randomUUID()}.tmp`
    const bytes = Buffer.from(`${JSON.stringify(this.#state)}\n`)
    const fd = openSync(temporary, 'wx', 0o600)
    try {
      let offset = 0
      while (offset < bytes.byteLength) {
        offset += writeSync(fd, bytes, offset, bytes.byteLength - offset)
      }
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, file)
    const dirFd = openSync(dir, 'r')
    try {
      fsyncSync(dirFd)
    } finally {
      closeSync(dirFd)
    }
  }
}

/** Delivery over HTTP to the alert receiver; the receipt must echo the hash. */
export function httpDeliver(
  baseUrl: string,
  token: string,
  timeoutMs = 5_000
): (body: string) => Promise<DeliveryResult> {
  return async (body) => {
    const signal = AbortSignal.timeout(timeoutMs)
    try {
      const response = await fetch(`${baseUrl}/alerts`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cvg-alert-token': token
        },
        body,
        signal,
        redirect: 'manual'
      })
      const text = await response.text()
      if (response.status !== 201)
        return { ok: false, code: `status_${response.status}` }
      const parsed = JSON.parse(text) as unknown
      if (
        !isRecord(parsed) ||
        typeof parsed.receiptId !== 'string' ||
        typeof parsed.payloadSha256 !== 'string'
      ) {
        return { ok: false, code: 'receipt_invalid' }
      }
      return {
        ok: true,
        receiptId: parsed.receiptId,
        payloadSha256: parsed.payloadSha256
      }
    } catch {
      return { ok: false, code: signal.aborted ? 'timeout' : 'unreachable' }
    }
  }
}

const EVENT_KEYS = [
  'alertId',
  'candidateDigest',
  'firstObservedAt',
  'instanceOpaqueId',
  'observedAt',
  'product',
  'reasonCode',
  'severity',
  'state'
]
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Strict shape of an alert event: exactly the listed, content-free fields. */
export function isAlertEvent(value: unknown): value is AlertEvent {
  if (!isRecord(value)) return false
  const keys = Object.keys(value).sort()
  return (
    keys.length === EVENT_KEYS.length &&
    keys.every((key, index) => key === EVENT_KEYS[index]) &&
    typeof value.alertId === 'string' &&
    UUID.test(value.alertId) &&
    value.product === 'shift-assistant' &&
    typeof value.candidateDigest === 'string' &&
    /^[\w:.-]{1,200}$/.test(value.candidateDigest) &&
    typeof value.instanceOpaqueId === 'string' &&
    /^[\w.-]{1,128}$/.test(value.instanceOpaqueId) &&
    typeof value.reasonCode === 'string' &&
    /^[a-z_]{1,64}$/.test(value.reasonCode) &&
    typeof value.firstObservedAt === 'string' &&
    ISO.test(value.firstObservedAt) &&
    typeof value.observedAt === 'string' &&
    ISO.test(value.observedAt) &&
    (value.severity === 'critical' ||
      value.severity === 'warning' ||
      value.severity === 'info') &&
    (value.state === 'firing' || value.state === 'resolved')
  )
}

export interface AlertReceiver {
  url: string
  port: number
  close(): Promise<void>
}

/**
 * Exclusive local receiver of the proof: loopback only, a token on every
 * request, strict event shape. Each accepted event is stored as
 * `<dir>/<receiptId>.json` with the payload, its SHA-256 and the reception
 * time, synced before the receipt is returned.
 */
export async function startAlertReceiver(options: {
  dir: string
  token: string
  host?: string
  port?: number
}): Promise<AlertReceiver> {
  mkdirSync(options.dir, { recursive: true, mode: 0o700 })
  const expected = Buffer.from(options.token)
  const server = createServer((request, response) => {
    const reply = (status: number, body: unknown) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    }
    if (request.method !== 'POST' || request.url !== '/alerts') {
      request.resume()
      reply(404, { error: 'not_found' })
      return
    }
    const provided = Buffer.from(
      String(request.headers['x-cvg-alert-token'] ?? '')
    )
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      request.resume()
      reply(401, { error: 'unauthorized' })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size <= MAX_BODY) chunks.push(chunk)
    })
    request.on('end', () => {
      if (size > MAX_BODY) {
        reply(413, { error: 'too_large' })
        return
      }
      const text = Buffer.concat(chunks).toString('utf8')
      let payload: unknown
      try {
        payload = JSON.parse(text)
      } catch {
        reply(400, { error: 'invalid_json' })
        return
      }
      if (!isAlertEvent(payload)) {
        reply(400, { error: 'invalid_event' })
        return
      }
      const receiptId = randomUUID()
      const payloadSha256 = sha256(text)
      const record = {
        receiptId,
        receivedAt: new Date().toISOString(),
        payloadSha256,
        payload
      }
      try {
        const path = join(options.dir, `${receiptId}.json`)
        const fd = openSync(path, 'wx', 0o600)
        try {
          writeSync(fd, `${JSON.stringify(record, null, 2)}\n`)
          fsyncSync(fd)
        } finally {
          closeSync(fd)
        }
        const dirFd = openSync(options.dir, 'r')
        try {
          fsyncSync(dirFd)
        } finally {
          closeSync(dirFd)
        }
      } catch {
        reply(500, { error: 'not_stored' })
        return
      }
      reply(201, { receiptId, payloadSha256 })
    })
  })
  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve)
  )
  const port = (server.address() as AddressInfo).port
  return {
    url: `http://${options.host ?? '127.0.0.1'}:${port}`,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  }
}

/**
 * The monitor loop: probe, update episodes, flush the queue, wait for the
 * rest of the interval. Rounds never overlap; `signal` stops it.
 */
export async function runMonitor(options: {
  liveUrl: string
  readyUrl: string
  monitor: AlertMonitor
  signal: AbortSignal
  intervalMs?: number
  timeoutMs?: number
  onCycle?: (observation: Observation) => void
}): Promise<void> {
  const intervalMs = options.intervalMs ?? MONITOR_DEFAULTS.intervalMs
  while (!options.signal.aborted) {
    const started = Date.now()
    const result = await probeAssistant(options.liveUrl, options.readyUrl, {
      timeoutMs: options.timeoutMs ?? MONITOR_DEFAULTS.timeoutMs
    })
    const observation = { at: new Date(), ...classifyProbe(result) }
    options.monitor.observe(observation)
    await options.monitor.flush()
    options.onCycle?.(observation)
    const wait = Math.max(0, intervalMs - (Date.now() - started))
    try {
      await sleep(wait, undefined, { signal: options.signal })
    } catch {
      return
    }
  }
}
