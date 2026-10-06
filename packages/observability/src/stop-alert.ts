import { createHmac } from 'node:crypto'

/**
 * PROD-0373 (barra 0373, condição 9) — "alguém sabe quando quebra".
 *
 * A monitor outside the worker reads worker heartbeats and the queue, and
 * notifies a webhook when no worker is alive or when ready work stops
 * moving. Each incident is sent once when it opens and once when it clears.
 */

export interface StopAlertWorker {
  readonly workerId: string
  readonly lastBeatAt: Date
  readonly lastProgressAt: Date | null
}

export interface StopAlertStatus {
  readonly observedAt: Date
  readonly workers: readonly StopAlertWorker[]
  readonly queue: {
    readonly ready: number
    readonly oldestReadyAgeMs: number | null
    readonly expiredLeases: number
  }
  /** A deliberate pause is not an outage: queue alerts are held while set. */
  readonly pause: { readonly paused: boolean }
}

export interface StopAlertThresholds {
  /** A worker whose last heartbeat is older than this is considered down. */
  readonly workerStaleMs: number
  /** Ready work older than this means the queue stopped progressing. */
  readonly queueStalledMs: number
}

export const DEFAULT_STOP_ALERT_THRESHOLDS: StopAlertThresholds = {
  workerStaleMs: 120_000,
  queueStalledMs: 300_000
}

export type StopAlertCode = 'worker_down' | 'queue_stalled'

export interface StopAlertCondition {
  readonly code: StopAlertCode
  readonly detail: Record<string, unknown>
}

export interface StopAlertNotification {
  readonly code: StopAlertCode
  readonly state: 'firing' | 'resolved'
  readonly tenantId: string
  readonly observedAt: string
  readonly detail: Record<string, unknown>
}

/** Pure evaluation: which stop conditions hold for this status. */
export function evaluateStopAlerts(
  status: StopAlertStatus,
  thresholds: StopAlertThresholds = DEFAULT_STOP_ALERT_THRESHOLDS
): StopAlertCondition[] {
  const now = status.observedAt.getTime()
  const alive = status.workers.filter(
    (worker) => now - worker.lastBeatAt.getTime() <= thresholds.workerStaleMs
  )
  const conditions: StopAlertCondition[] = []
  if (alive.length === 0) {
    const latest = status.workers[0]
    conditions.push({
      code: 'worker_down',
      detail: {
        knownWorkers: status.workers.length,
        lastBeatAgeMs: latest ? now - latest.lastBeatAt.getTime() : null,
        workerStaleMs: thresholds.workerStaleMs
      }
    })
  }
  const oldest = status.queue.oldestReadyAgeMs
  if (
    !status.pause.paused &&
    ((oldest !== null && oldest > thresholds.queueStalledMs) ||
      status.queue.expiredLeases > 0)
  ) {
    conditions.push({
      code: 'queue_stalled',
      detail: {
        ready: status.queue.ready,
        oldestReadyAgeMs: oldest,
        expiredLeases: status.queue.expiredLeases,
        queueStalledMs: thresholds.queueStalledMs
      }
    })
  }
  return conditions
}

/** HMAC-SHA256 over `${timestamp}.${body}`, hex, for the receiver to verify. */
export function signStopAlert(
  secret: string,
  timestamp: string,
  body: string
): string {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
}

export type StopAlertDeliver = (
  notification: StopAlertNotification
) => Promise<void>

/** Delivery by signed HTTP POST; a non-2xx answer is a delivery failure. */
export function createWebhookStopAlertDelivery(options: {
  readonly url: string
  readonly secret: string
  readonly timeoutMs?: number
  readonly fetch?: typeof fetch
  readonly clock?: () => Date
}): StopAlertDeliver {
  const url = new URL(options.url)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Stop alert webhook must be an http(s) URL')
  }
  if (options.secret.length < 32) {
    throw new Error(
      'Stop alert webhook secret must have at least 32 characters'
    )
  }
  const send = options.fetch ?? fetch
  const clock = options.clock ?? (() => new Date())
  return async (notification) => {
    const body = JSON.stringify(notification)
    const timestamp = clock().toISOString()
    const response = await send(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-alert-timestamp': timestamp,
        'x-cvg-alert-signature': signStopAlert(options.secret, timestamp, body)
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000)
    })
    if (response.status < 200 || response.status > 299) {
      throw new Error(`Stop alert webhook answered ${response.status}`)
    }
  }
}

export interface StopAlertMonitorOptions {
  readonly tenantId: string
  readonly read: () => Promise<StopAlertStatus>
  readonly deliver: StopAlertDeliver
  readonly thresholds?: StopAlertThresholds
  readonly intervalMs?: number
  /** Structured log of evaluation and delivery problems. */
  readonly log?: (event: string, fields: Record<string, unknown>) => void
}

export interface StopAlertMonitor {
  /** One evaluation; returns the notifications it delivered. */
  check(): Promise<StopAlertNotification[]>
  start(): void
  stop(): Promise<void>
  /** Incidents currently open. */
  open(): StopAlertCode[]
}

/**
 * Periodic evaluation with per-incident deduplication. A failed delivery
 * keeps the incident unsent so the next check retries it; a failed read is
 * itself reported as `worker_down` evidence missing, never as healthy.
 */
export function createStopAlertMonitor(
  options: StopAlertMonitorOptions
): StopAlertMonitor {
  const thresholds = options.thresholds ?? DEFAULT_STOP_ALERT_THRESHOLDS
  const intervalMs = options.intervalMs ?? 30_000
  const log = options.log ?? (() => undefined)
  const firing = new Map<StopAlertCode, StopAlertCondition>()
  let timer: NodeJS.Timeout | undefined
  let running: Promise<unknown> | undefined

  const notify = async (
    notification: StopAlertNotification
  ): Promise<boolean> => {
    try {
      await options.deliver(notification)
      return true
    } catch (error) {
      log('stop_alert.delivery_failed', {
        code: notification.code,
        state: notification.state,
        error: error instanceof Error ? error.message : 'unknown failure'
      })
      return false
    }
  }

  const check = async (): Promise<StopAlertNotification[]> => {
    let status: StopAlertStatus
    try {
      status = await options.read()
    } catch (error) {
      log('stop_alert.read_failed', {
        error: error instanceof Error ? error.message : 'unknown failure'
      })
      // Without a reading the monitor cannot prove anything is alive.
      status = {
        observedAt: new Date(),
        workers: [],
        queue: { ready: 0, oldestReadyAgeMs: null, expiredLeases: 0 },
        pause: { paused: false }
      }
    }
    const current = new Map(
      evaluateStopAlerts(status, thresholds).map((condition) => [
        condition.code,
        condition
      ])
    )
    const sent: StopAlertNotification[] = []
    const observedAt = status.observedAt.toISOString()
    for (const [code, condition] of current) {
      if (firing.has(code)) continue
      const notification: StopAlertNotification = {
        code,
        state: 'firing',
        tenantId: options.tenantId,
        observedAt,
        detail: condition.detail
      }
      if (await notify(notification)) {
        firing.set(code, condition)
        sent.push(notification)
      }
    }
    for (const [code, condition] of [...firing]) {
      if (current.has(code)) continue
      const notification: StopAlertNotification = {
        code,
        state: 'resolved',
        tenantId: options.tenantId,
        observedAt,
        detail: condition.detail
      }
      if (await notify(notification)) {
        firing.delete(code)
        sent.push(notification)
      }
    }
    return sent
  }

  return {
    check,
    start() {
      if (timer) return
      timer = setInterval(() => {
        running ??= check().finally(() => {
          running = undefined
        })
      }, intervalMs)
      timer.unref()
    },
    async stop() {
      if (timer) clearInterval(timer)
      timer = undefined
      await running?.catch(() => undefined)
    },
    open: () => [...firing.keys()]
  }
}
