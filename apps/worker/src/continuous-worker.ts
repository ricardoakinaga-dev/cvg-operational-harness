import type { TenantId } from '@cvg/platform'
import {
  DEFAULT_OUTBOX_LEASE_MS,
  type DurableOutboxAdapter,
  type OutboxEventRecord
} from '@cvg/persistence'
import { sanitizeOutboxError } from '@cvg/shared'
import {
  createControlledDispatch,
  type ControlledWorkerHandlers
} from './controlled-worker.ts'
import {
  completeClaimedOutboxEvent,
  type ClaimedOutboxEventResult,
  type OutboxHandoffResult
} from './jobs/process-outbox-event.ts'
import {
  createJsonWorkerTelemetry,
  type WorkerTelemetry
} from './worker-observability.ts'

export const CONTINUOUS_WORKER_RUN_MODE = 'continuous' as const

export type ContinuousWorkerHandlers = ControlledWorkerHandlers

const SHUTDOWN_RELEASE_ERROR = Object.assign(
  new Error('Worker shutdown released an in-flight lease'),
  { code: 'worker_shutdown_release' }
)

export interface ContinuousWorkerTuning {
  pollIntervalMs: number
  idleMaxBackoffMs: number
  errorBackoffMs: number
  errorMaxBackoffMs: number
  concurrency: number
  leaseMs: number
  drainMs: number
  summaryIntervalMs: number
}

export const DEFAULT_CONTINUOUS_WORKER_TUNING: ContinuousWorkerTuning = {
  pollIntervalMs: 250,
  idleMaxBackoffMs: 5_000,
  errorBackoffMs: 500,
  errorMaxBackoffMs: 30_000,
  concurrency: 2,
  leaseMs: DEFAULT_OUTBOX_LEASE_MS,
  drainMs: 10_000,
  summaryIntervalMs: 30_000
}

export interface ContinuousWorkerOptions extends Partial<ContinuousWorkerTuning> {
  tenantId: TenantId
  workerId: string
  adapter: DurableOutboxAdapter
  handlers: ControlledWorkerHandlers
  /** Lease renewal/ownership-check cadence; defaults to leaseMs / 3. */
  heartbeatIntervalMs?: number
  /** Minimum cadence between backlog probes (queue lag metric). */
  lagSampleIntervalMs?: number
  backlogProbe?: OutboxBacklogProbe
  sweeps?: ContinuousSweepHandle
  telemetry?: WorkerTelemetry
  takeoverActive?: boolean | (() => boolean | Promise<boolean>)
}

export type OutboxBacklogProbe = (
  tenantId: TenantId
) => number | Promise<number>

export interface ContinuousSweepHandle {
  start(): void
  stop(): Promise<void>
}

export interface ContinuousWorkerMetrics {
  claimed: number
  processed: number
  failed: number
  deadLettered: number
  handoffs: number
  errors: number
  claimFailures: number
  leaseLost: number
  heartbeats: number
  idlePolls: number
  released: number
  lag: number | null
}

export interface ContinuousWorkerStopResult {
  drained: boolean
  released: number
  releaseFailed: number
  metrics: ContinuousWorkerMetrics
}

export interface ContinuousWorker {
  start(): void
  stop(options?: { drainMs?: number }): Promise<ContinuousWorkerStopResult>
  isRunning(): boolean
  metrics(): ContinuousWorkerMetrics
  waitForIdle(timeoutMs?: number): Promise<boolean>
}

/**
 * Supervised continuous consumer over the durable outbox.
 *
 * The pump claims at most `concurrency` events, runs each handler inside the
 * adapter's durable `ack` boundary, heartbeats the lease while the handler is
 * in flight (renewing when the adapter exposes `heartbeatClaim`, otherwise
 * re-verifying ownership and failing closed on a lost lease), backs off on
 * empty polls and claim errors, and on SIGTERM finishes in-flight work or
 * releases the lease so another worker can retry the same idempotency key.
 * Unknown event types and handler failures flow through the repository retry
 * / dead-letter policy and never block the queue.
 */
export function createContinuousWorker(
  options: ContinuousWorkerOptions
): ContinuousWorker {
  const workerId = options.workerId.trim()
  if (!workerId) throw new Error('Continuous worker id is required')
  const dispatch = createControlledDispatch(options.handlers)
  const tuning = resolveContinuousWorkerTuning(options)
  const heartbeatIntervalMs = requirePositiveInteger(
    options.heartbeatIntervalMs ?? Math.max(1, Math.floor(tuning.leaseMs / 3)),
    'heartbeatIntervalMs'
  )
  const lagSampleIntervalMs = requirePositiveInteger(
    options.lagSampleIntervalMs ?? 1_000,
    'lagSampleIntervalMs'
  )
  const telemetry = options.telemetry ?? createJsonWorkerTelemetry()
  const backlogProbe =
    options.backlogProbe ?? createAdapterBacklogProbe(options.adapter)
  const counters: ContinuousWorkerMetrics = {
    claimed: 0,
    processed: 0,
    failed: 0,
    deadLettered: 0,
    handoffs: 0,
    errors: 0,
    claimFailures: 0,
    leaseLost: 0,
    heartbeats: 0,
    idlePolls: 0,
    released: 0,
    lag: null
  }

  let running = false
  let stopPromise: Promise<ContinuousWorkerStopResult> | undefined
  let pumpPromise: Promise<void> | undefined
  let summaryTimer: ReturnType<typeof setInterval> | undefined
  let lastLagSampleAt = 0
  const inFlight = new Map<Promise<void>, OutboxEventRecord>()
  const sleepers = new Set<() => void>()

  const nowMs = (): number => Date.now()

  function wakeSleepers(): void {
    for (const wake of [...sleepers]) wake()
  }

  function abortableDelay(ms: number): Promise<void> {
    if (!running) return Promise.resolve()
    return new Promise((resolve) => {
      let settled = false
      const wake = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        sleepers.delete(wake)
        resolve()
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        sleepers.delete(wake)
        resolve()
      }, ms)
      timer.unref?.()
      sleepers.add(wake)
    })
  }

  function plainDelay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms)
      timer.unref?.()
    })
  }

  function logSummary(reason: string): void {
    telemetry.log('worker.outbox.summary', {
      workerId,
      reason,
      claimed: counters.claimed,
      processed: counters.processed,
      failed: counters.failed,
      deadLettered: counters.deadLettered,
      handoffs: counters.handoffs,
      errors: counters.errors,
      claimFailures: counters.claimFailures,
      leaseLost: counters.leaseLost,
      heartbeats: counters.heartbeats,
      idlePolls: counters.idlePolls,
      released: counters.released,
      lag: counters.lag,
      inFlight: inFlight.size
    })
  }

  async function sampleLag(): Promise<number | null> {
    if (!backlogProbe) return counters.lag
    const at = nowMs()
    if (at - lastLagSampleAt < lagSampleIntervalMs) return counters.lag
    lastLagSampleAt = at
    try {
      const raw = Number(await backlogProbe(options.tenantId))
      counters.lag = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : null
      if (counters.lag !== null) {
        telemetry.metric('worker_outbox_lag', counters.lag, {
          operation: 'outbox'
        })
      }
      return counters.lag
    } catch (error) {
      telemetry.log(
        'worker.outbox.lag_probe_failed',
        { workerId, error: sanitizeOutboxError(error), operation: 'outbox' },
        'warn'
      )
      return counters.lag
    }
  }

  async function renewLease(event: OutboxEventRecord): Promise<boolean> {
    const heartbeatCapable = options.adapter as DurableOutboxAdapter & {
      heartbeatClaim?: (input: {
        tenantId: TenantId
        eventId: string
        workerId: string
        leaseMs: number
      }) => OutboxEventRecord | null | Promise<OutboxEventRecord | null>
    }
    if (typeof heartbeatCapable.heartbeatClaim === 'function') {
      const renewed = await heartbeatCapable.heartbeatClaim({
        tenantId: options.tenantId,
        eventId: event.id,
        workerId,
        leaseMs: tuning.leaseMs
      })
      return Boolean(
        renewed &&
        renewed.status === 'processing' &&
        renewed.leaseOwner === workerId
      )
    }
    const lookup = options.adapter as DurableOutboxAdapter & {
      findById?: (
        eventId: string,
        rawTenantId?: TenantId
      ) => OutboxEventRecord | null
      findOutboxById?: (
        tenantId: TenantId,
        eventId: string
      ) => OutboxEventRecord | null | Promise<OutboxEventRecord | null>
    }
    if (typeof lookup.findOutboxById === 'function') {
      const current = await lookup.findOutboxById(options.tenantId, event.id)
      return Boolean(
        current &&
        current.status === 'processing' &&
        current.leaseOwner === workerId
      )
    }
    if (typeof lookup.findById === 'function') {
      const current = lookup.findById(event.id, options.tenantId)
      return Boolean(
        current &&
        current.status === 'processing' &&
        current.leaseOwner === workerId
      )
    }
    // Adapters without an ownership lookup cannot be verified; lease sizing
    // remains the only guarantee and is reported as such.
    return true
  }

  function startHeartbeat(event: OutboxEventRecord): {
    stop: () => void
    lost: () => boolean
  } {
    let stopped = false
    let leaseLost = false
    const timer = setInterval(() => {
      void beat()
    }, heartbeatIntervalMs)
    timer.unref?.()

    const markLost = (): void => {
      if (leaseLost || stopped) return
      leaseLost = true
      counters.leaseLost += 1
      telemetry.log(
        'worker.lease_lost',
        {
          eventId: event.id,
          workerId,
          attempt: event.attempts ?? 0,
          operation: 'outbox'
        },
        'warn'
      )
      telemetry.metric('worker_outbox_lease_lost_total', 1, {
        outcome: 'lease_lost'
      })
    }

    const beat = async (): Promise<void> => {
      if (stopped || leaseLost) return
      try {
        if (await renewLease(event)) {
          counters.heartbeats += 1
          telemetry.metric('worker_outbox_heartbeats_total', 1, {
            outcome: 'renewed'
          })
          return
        }
        markLost()
      } catch (error) {
        telemetry.log(
          'worker.lease_heartbeat_failed',
          {
            eventId: event.id,
            workerId,
            error: sanitizeOutboxError(error),
            operation: 'outbox'
          },
          'warn'
        )
      }
    }

    return {
      stop: () => {
        stopped = true
        clearInterval(timer)
      },
      lost: () => leaseLost
    }
  }

  function recordResult(
    event: OutboxEventRecord,
    result: ClaimedOutboxEventResult,
    leaseLost: boolean
  ): void {
    if (isHandoffResult(result)) {
      counters.handoffs += 1
      telemetry.log(
        'worker.outbox.handoff',
        { eventId: event.id, workerId, status: 'handoff', operation: 'outbox' },
        'warn'
      )
      telemetry.metric('worker_outbox_handoffs_total', 1, {
        outcome: 'handoff'
      })
      return
    }
    const status = result.status
    if (status === 'processed') {
      counters.processed += 1
      telemetry.metric('worker_outbox_processed_total', 1, {
        status: 'processed'
      })
    } else if (status === 'dead_letter') {
      counters.deadLettered += 1
      telemetry.metric('worker_outbox_dead_lettered_total', 1, {
        status: 'dead_letter'
      })
    } else if (status === 'failed') {
      counters.failed += 1
      telemetry.metric('worker_outbox_failed_total', 1, { status: 'failed' })
    }
    telemetry.log(`worker.outbox.${status}`, {
      eventId: event.id,
      workerId,
      status,
      attempt: 'attempts' in result ? (result.attempts ?? 0) : 0,
      leaseLost,
      ...(result.lastError ? { error: result.lastError } : {}),
      operation: 'outbox'
    })
  }

  function dispatchClaimed(event: OutboxEventRecord): void {
    const heartbeat = startHeartbeat(event)
    const task = (async () => {
      try {
        const result = await completeClaimedOutboxEvent({
          tenantId: options.tenantId,
          workerId,
          adapter: options.adapter,
          event,
          effect: dispatch,
          ...(options.takeoverActive !== undefined
            ? { takeoverActive: options.takeoverActive }
            : {})
        })
        recordResult(event, result, heartbeat.lost())
      } catch (error) {
        counters.errors += 1
        telemetry.log(
          'worker.event_error',
          {
            eventId: event.id,
            workerId,
            attempt: event.attempts ?? 0,
            error: sanitizeOutboxError(error),
            operation: 'outbox'
          },
          'error'
        )
        telemetry.metric('worker_outbox_errors_total', 1, { outcome: 'error' })
      } finally {
        heartbeat.stop()
      }
    })()
    inFlight.set(task, event)
    void task.then(
      () => {
        inFlight.delete(task)
      },
      () => {
        inFlight.delete(task)
      }
    )
  }

  async function pump(): Promise<void> {
    let idleBackoff = 0
    let errorBackoff = 0
    while (running) {
      if (inFlight.size >= tuning.concurrency) {
        await sampleLag()
        await abortableDelay(tuning.pollIntervalMs)
        continue
      }
      let event: OutboxEventRecord | null
      try {
        event = await options.adapter.claimNext({
          tenantId: options.tenantId,
          workerId,
          leaseMs: tuning.leaseMs
        })
      } catch (error) {
        counters.claimFailures += 1
        errorBackoff =
          errorBackoff === 0
            ? tuning.errorBackoffMs
            : Math.min(tuning.errorMaxBackoffMs, errorBackoff * 2)
        telemetry.log(
          'worker.claim_failed',
          {
            workerId,
            error: sanitizeOutboxError(error),
            backoffMs: errorBackoff,
            operation: 'outbox'
          },
          'error'
        )
        telemetry.metric('worker_outbox_claim_failures_total', 1, {
          outcome: 'error'
        })
        await abortableDelay(errorBackoff)
        continue
      }
      if (!event) {
        counters.idlePolls += 1
        idleBackoff =
          idleBackoff === 0
            ? tuning.pollIntervalMs
            : Math.min(tuning.idleMaxBackoffMs, idleBackoff * 2)
        await sampleLag()
        telemetry.log(
          'worker.idle_backoff',
          { workerId, backoffMs: idleBackoff, lag: counters.lag },
          'debug'
        )
        await abortableDelay(idleBackoff)
        continue
      }
      if (!running) {
        try {
          await options.adapter.fail({
            tenantId: options.tenantId,
            eventId: event.id,
            workerId,
            error: SHUTDOWN_RELEASE_ERROR
          })
          counters.released += 1
          telemetry.log(
            'worker.shutdown_release',
            { eventId: event.id, workerId, operation: 'outbox' },
            'warn'
          )
          telemetry.metric('worker_outbox_shutdown_releases_total', 1, {
            outcome: 'released'
          })
        } catch (error) {
          telemetry.log(
            'worker.shutdown_release_failed',
            {
              eventId: event.id,
              workerId,
              error: sanitizeOutboxError(error),
              operation: 'outbox'
            },
            'error'
          )
        }
        break
      }
      idleBackoff = 0
      errorBackoff = 0
      counters.claimed += 1
      dispatchClaimed(event)
    }
  }

  function start(): void {
    if (stopPromise) {
      throw new Error('Continuous worker cannot be restarted after stop')
    }
    if (running) return
    running = true
    telemetry.log('worker.started', {
      workerId,
      concurrency: tuning.concurrency,
      pollIntervalMs: tuning.pollIntervalMs,
      idleMaxBackoffMs: tuning.idleMaxBackoffMs,
      errorBackoffMs: tuning.errorBackoffMs,
      errorMaxBackoffMs: tuning.errorMaxBackoffMs,
      leaseMs: tuning.leaseMs,
      heartbeatIntervalMs,
      drainMs: tuning.drainMs,
      backlogProbe: Boolean(backlogProbe),
      sweeps: Boolean(options.sweeps),
      externalEffects: false,
      durable: true
    })
    options.sweeps?.start()
    logSummary('start')
    summaryTimer = setInterval(() => {
      logSummary('interval')
    }, tuning.summaryIntervalMs)
    summaryTimer.unref?.()
    pumpPromise = pump().catch((error) => {
      counters.errors += 1
      telemetry.log(
        'worker.pump_failed',
        { workerId, error: sanitizeOutboxError(error), operation: 'outbox' },
        'error'
      )
    })
  }

  function stop(stopOptions?: {
    drainMs?: number
  }): Promise<ContinuousWorkerStopResult> {
    if (stopPromise) return stopPromise
    const drainMs = Math.max(0, stopOptions?.drainMs ?? tuning.drainMs)
    stopPromise = (async (): Promise<ContinuousWorkerStopResult> => {
      running = false
      wakeSleepers()
      if (summaryTimer) {
        clearInterval(summaryTimer)
        summaryTimer = undefined
      }
      await options.sweeps?.stop().catch((error: unknown) => {
        telemetry.log(
          'worker.sweep_stop_failed',
          { workerId, error: sanitizeOutboxError(error) },
          'error'
        )
      })
      if (pumpPromise) {
        await Promise.race([
          pumpPromise,
          plainDelay(Math.max(10, Math.min(drainMs, 1_000)))
        ])
      }
      const settled =
        inFlight.size === 0 ||
        (await Promise.race([
          Promise.allSettled([...inFlight.keys()]).then(() => true),
          plainDelay(drainMs).then(() => false)
        ]))
      let released = 0
      let releaseFailed = 0
      if (!settled || inFlight.size > 0) {
        for (const event of [...inFlight.values()]) {
          try {
            await options.adapter.fail({
              tenantId: options.tenantId,
              eventId: event.id,
              workerId,
              error: SHUTDOWN_RELEASE_ERROR
            })
            released += 1
            counters.released += 1
            telemetry.log(
              'worker.shutdown_release',
              { eventId: event.id, workerId, operation: 'outbox' },
              'warn'
            )
            telemetry.metric('worker_outbox_shutdown_releases_total', 1, {
              outcome: 'released'
            })
          } catch (error) {
            releaseFailed += 1
            telemetry.log(
              'worker.shutdown_release_failed',
              {
                eventId: event.id,
                workerId,
                error: sanitizeOutboxError(error),
                operation: 'outbox'
              },
              'error'
            )
          }
        }
      }
      logSummary('stop')
      const result: ContinuousWorkerStopResult = {
        drained: inFlight.size === 0,
        released,
        releaseFailed,
        metrics: metrics()
      }
      telemetry.log('worker.stopped', {
        workerId,
        drained: result.drained,
        released: result.released,
        releaseFailed: result.releaseFailed,
        processed: result.metrics.processed,
        failed: result.metrics.failed,
        deadLettered: result.metrics.deadLettered,
        lag: result.metrics.lag
      })
      return result
    })()
    return stopPromise
  }

  function metrics(): ContinuousWorkerMetrics {
    return { ...counters }
  }

  async function waitForIdle(timeoutMs = 2_000): Promise<boolean> {
    const deadline = nowMs() + timeoutMs
    while (inFlight.size > 0) {
      if (nowMs() >= deadline) return false
      await plainDelay(5)
    }
    return true
  }

  return {
    start,
    stop,
    isRunning: () => running,
    metrics,
    waitForIdle
  }
}

export function parseContinuousWorkerSettings(
  env: NodeJS.ProcessEnv
): ContinuousWorkerTuning {
  const tuning: ContinuousWorkerTuning = {
    pollIntervalMs: integerSetting(
      env.CVG_WORKER_POLL_INTERVAL_MS,
      'CVG_WORKER_POLL_INTERVAL_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.pollIntervalMs,
      1
    ),
    idleMaxBackoffMs: integerSetting(
      env.CVG_WORKER_IDLE_MAX_BACKOFF_MS,
      'CVG_WORKER_IDLE_MAX_BACKOFF_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.idleMaxBackoffMs,
      1
    ),
    errorBackoffMs: integerSetting(
      env.CVG_WORKER_ERROR_BACKOFF_MS,
      'CVG_WORKER_ERROR_BACKOFF_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.errorBackoffMs,
      1
    ),
    errorMaxBackoffMs: integerSetting(
      env.CVG_WORKER_ERROR_MAX_BACKOFF_MS,
      'CVG_WORKER_ERROR_MAX_BACKOFF_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.errorMaxBackoffMs,
      1
    ),
    concurrency: integerSetting(
      env.CVG_WORKER_CONCURRENCY,
      'CVG_WORKER_CONCURRENCY',
      DEFAULT_CONTINUOUS_WORKER_TUNING.concurrency,
      1,
      10
    ),
    leaseMs: integerSetting(
      env.CVG_WORKER_LEASE_MS,
      'CVG_WORKER_LEASE_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.leaseMs,
      1_000,
      3_600_000
    ),
    drainMs: integerSetting(
      env.CVG_WORKER_DRAIN_MS,
      'CVG_WORKER_DRAIN_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.drainMs,
      0,
      600_000
    ),
    summaryIntervalMs: integerSetting(
      env.CVG_WORKER_SUMMARY_INTERVAL_MS,
      'CVG_WORKER_SUMMARY_INTERVAL_MS',
      DEFAULT_CONTINUOUS_WORKER_TUNING.summaryIntervalMs,
      1
    )
  }
  validateTuning(tuning, {
    idle: 'CVG_WORKER_IDLE_MAX_BACKOFF_MS',
    poll: 'CVG_WORKER_POLL_INTERVAL_MS',
    errorMax: 'CVG_WORKER_ERROR_MAX_BACKOFF_MS',
    error: 'CVG_WORKER_ERROR_BACKOFF_MS'
  })
  return tuning
}

function resolveContinuousWorkerTuning(
  options: ContinuousWorkerOptions
): ContinuousWorkerTuning {
  const tuning: ContinuousWorkerTuning = {
    pollIntervalMs: requirePositiveInteger(
      options.pollIntervalMs ?? DEFAULT_CONTINUOUS_WORKER_TUNING.pollIntervalMs,
      'pollIntervalMs'
    ),
    idleMaxBackoffMs: requirePositiveInteger(
      options.idleMaxBackoffMs ??
        DEFAULT_CONTINUOUS_WORKER_TUNING.idleMaxBackoffMs,
      'idleMaxBackoffMs'
    ),
    errorBackoffMs: requirePositiveInteger(
      options.errorBackoffMs ?? DEFAULT_CONTINUOUS_WORKER_TUNING.errorBackoffMs,
      'errorBackoffMs'
    ),
    errorMaxBackoffMs: requirePositiveInteger(
      options.errorMaxBackoffMs ??
        DEFAULT_CONTINUOUS_WORKER_TUNING.errorMaxBackoffMs,
      'errorMaxBackoffMs'
    ),
    concurrency: requireIntegerBetween(
      options.concurrency ?? DEFAULT_CONTINUOUS_WORKER_TUNING.concurrency,
      'concurrency',
      1,
      10
    ),
    leaseMs: requireIntegerBetween(
      options.leaseMs ?? DEFAULT_CONTINUOUS_WORKER_TUNING.leaseMs,
      'leaseMs',
      1_000,
      3_600_000
    ),
    drainMs: requireIntegerBetween(
      options.drainMs ?? DEFAULT_CONTINUOUS_WORKER_TUNING.drainMs,
      'drainMs',
      0,
      600_000
    ),
    summaryIntervalMs: requirePositiveInteger(
      options.summaryIntervalMs ??
        DEFAULT_CONTINUOUS_WORKER_TUNING.summaryIntervalMs,
      'summaryIntervalMs'
    )
  }
  validateTuning(tuning, {
    idle: 'idleMaxBackoffMs',
    poll: 'pollIntervalMs',
    errorMax: 'errorMaxBackoffMs',
    error: 'errorBackoffMs'
  })
  return tuning
}

function validateTuning(
  tuning: ContinuousWorkerTuning,
  names: { idle: string; poll: string; errorMax: string; error: string }
): void {
  if (tuning.idleMaxBackoffMs < tuning.pollIntervalMs) {
    throw new Error(
      `${names.idle} must be greater than or equal to ${names.poll}`
    )
  }
  if (tuning.errorMaxBackoffMs < tuning.errorBackoffMs) {
    throw new Error(
      `${names.errorMax} must be greater than or equal to ${names.error}`
    )
  }
}

function integerSetting(
  raw: string | undefined,
  name: string,
  fallback: number,
  min: number,
  max?: number
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (
    !Number.isInteger(value) ||
    value < min ||
    (max !== undefined && value > max)
  ) {
    throw new Error(
      max === undefined
        ? `${name} must be a positive integer`
        : `${name} must be an integer between ${min} and ${max}`
    )
  }
  return value
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Continuous worker ${name} must be a positive integer`)
  }
  return value
}

function requireIntegerBetween(
  value: number,
  name: string,
  min: number,
  max: number
): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Continuous worker ${name} must be an integer between ${min} and ${max}`
    )
  }
  return value
}

function createAdapterBacklogProbe(
  adapter: DurableOutboxAdapter
): OutboxBacklogProbe | undefined {
  const candidate = adapter as DurableOutboxAdapter & {
    pending?: (rawTenantId?: TenantId) => unknown
    outboxBacklog?: (tenantId: TenantId) => number | Promise<number>
  }
  if (typeof candidate.outboxBacklog === 'function') {
    const probe = candidate.outboxBacklog.bind(adapter)
    return async (tenantId) => toLag(await probe(tenantId)) ?? 0
  }
  if (typeof candidate.pending === 'function') {
    const probe = candidate.pending.bind(adapter)
    return (tenantId) => {
      const value = probe(tenantId)
      if (Array.isArray(value)) return value.length
      return toLag(value) ?? 0
    }
  }
  return undefined
}

function toLag(value: unknown): number | null {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : null
}

function isHandoffResult(
  value: ClaimedOutboxEventResult
): value is OutboxHandoffResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'handoff' in value &&
    value.handoff === true
  )
}
