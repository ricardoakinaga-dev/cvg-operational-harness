import {
  sweepExpiredApprovals,
  type EffectJournalPort
} from '@cvg/agent-runtime'
import type { ApprovalAuthority } from '@cvg/approval-engine'
import { sanitizeOutboxError } from '@cvg/shared'
import {
  createJsonWorkerTelemetry,
  type WorkerTelemetry
} from './worker-observability.ts'

export const DEFAULT_SWEEP_RESERVATION_TTL_MS = 60_000
export const DEFAULT_SWEEP_INTERVAL_MS = 30_000

export interface SweepTickPorts {
  approvals: ApprovalAuthority
  effectJournal: EffectJournalPort
  tenantId: string
  reservationTtlMs?: number
  clock?: () => Date
}

export interface SweepTickResult {
  now: string
  journalReleased: number
  approvalsReleased: number
  approvalsUncertain: number
}

/**
 * One periodic recovery tick. It calls the effect journal `releaseExpired`
 * first (expired reservations become ABANDONED, expired EFFECT_STARTED becomes
 * UNCERTAIN) and then the exported `sweepExpiredApprovals` helper, which uses
 * the refreshed journal state as evidence. Neither call executes an effect or
 * touches a tool executor.
 */
export async function runSweepTick(
  ports: SweepTickPorts
): Promise<SweepTickResult> {
  const now = ports.clock?.() ?? new Date()
  const ttlMs = ports.reservationTtlMs ?? DEFAULT_SWEEP_RESERVATION_TTL_MS
  const journalReleased = await ports.effectJournal.releaseExpired(now, ttlMs)
  const approvals = await sweepExpiredApprovals({
    approvals: ports.approvals,
    effectJournal: ports.effectJournal,
    tenantId: ports.tenantId,
    now,
    ttlMs
  })
  return {
    now: now.toISOString(),
    journalReleased,
    approvalsReleased: approvals.released,
    approvalsUncertain: approvals.uncertain
  }
}

export interface PeriodicSweepRunnerOptions extends SweepTickPorts {
  intervalMs?: number
  runImmediately?: boolean
  telemetry?: WorkerTelemetry
}

export interface PeriodicSweepRunner {
  start(): void
  stop(): Promise<void>
  runOnce(): Promise<SweepTickResult>
  isRunning(): boolean
}

/**
 * Timer wrapper around `runSweepTick` for the supervised worker. Ticks are
 * never overlapped, errors are contained and reported, and `stop` waits for
 * the in-flight tick before resolving.
 */
export function createPeriodicSweepRunner(
  options: PeriodicSweepRunnerOptions
): PeriodicSweepRunner {
  const intervalMs = options.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new Error('Sweep intervalMs must be a positive integer')
  }
  const telemetry = options.telemetry ?? createJsonWorkerTelemetry()
  let running = false
  let currentTick: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined

  const runOnce = async (): Promise<SweepTickResult> => {
    const startedAt = Date.now()
    const result = await runSweepTick(options)
    telemetry.log('worker.sweep_tick', {
      ...result,
      durationMs: Date.now() - startedAt,
      operation: 'sweep'
    })
    telemetry.metric(
      'worker_sweep_journal_released_total',
      result.journalReleased,
      { operation: 'sweep' }
    )
    telemetry.metric(
      'worker_sweep_approvals_released_total',
      result.approvalsReleased,
      { status: 'released' }
    )
    telemetry.metric(
      'worker_sweep_approvals_uncertain_total',
      result.approvalsUncertain,
      { status: 'uncertain' }
    )
    return result
  }

  const tick = (): Promise<void> => {
    if (!running) return Promise.resolve()
    if (currentTick) return currentTick
    currentTick = runOnce()
      .then(() => undefined)
      .catch((error: unknown) => {
        telemetry.log(
          'worker.sweep_failed',
          { error: sanitizeOutboxError(error), operation: 'sweep' },
          'error'
        )
        telemetry.metric('worker_sweep_failures_total', 1, {
          outcome: 'error'
        })
      })
      .finally(() => {
        currentTick = undefined
      })
    return currentTick
  }

  return {
    start() {
      if (running) return
      running = true
      telemetry.log('worker.sweep_started', {
        intervalMs,
        operation: 'sweep'
      })
      if (options.runImmediately) void tick()
      timer = setInterval(() => {
        void tick()
      }, intervalMs)
      timer.unref?.()
    },
    async stop() {
      running = false
      if (timer) {
        clearInterval(timer)
        timer = undefined
      }
      await currentTick
      telemetry.log('worker.sweep_stopped', { operation: 'sweep' })
    },
    runOnce,
    isRunning: () => running
  }
}
