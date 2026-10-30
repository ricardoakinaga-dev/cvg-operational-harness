import { Pool } from 'pg'
import {
  PostgresSpillSweeper,
  guardPostgresPoolErrors,
  type PostgresPoolLike
} from '@cvg/persistence'
import { sanitizeOutboxError } from '@cvg/shared'
import type { ContinuousSweepHandle } from './continuous-worker.ts'
import {
  createJsonWorkerTelemetry,
  type WorkerTelemetry
} from './worker-observability.ts'

/**
 * SPEC 0293 D4: the expiry sweep of stored tool output, composed by the host. It connects as
 * the login role of the spill sweep job (member of `cvg_spill_sweeper`, provisioned with
 * deploy/harness/postgres/spill-sweeper.sql) through its own URL, so the worker's serving role
 * never holds the sweeper's privileges. Without configuration there is no port and no metric;
 * with an invalid configuration the start fails closed.
 */
export const SPILL_SWEEP_DATABASE_URL_ENV = 'CVG_SPILL_SWEEP_DATABASE_URL'
export const SPILL_SWEEP_SCHEMA_ENV = 'CVG_SPILL_SWEEP_SCHEMA'
export const SPILL_SWEEP_INTERVAL_ENV = 'CVG_SPILL_SWEEP_INTERVAL_MS'
export const DEFAULT_SPILL_SWEEP_INTERVAL_MS = 300_000
export const MIN_SPILL_SWEEP_INTERVAL_MS = 1_000
export const MAX_SPILL_SWEEP_INTERVAL_MS = 86_400_000
const SCHEMA = /^[a-z][a-z0-9_]{0,62}$/

export class SpillSweepConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpillSweepConfigurationError'
  }
}

export interface SpillSweepConfig {
  readonly databaseUrl: string
  readonly schemaName: string
  readonly intervalMs: number
}

const read = (env: NodeJS.ProcessEnv, name: string): string | undefined => {
  const value = env[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

/** `undefined` = not configured; throws `SpillSweepConfigurationError` on any partial or invalid value. */
export function resolveSpillSweepConfig(
  env: NodeJS.ProcessEnv
): SpillSweepConfig | undefined {
  const databaseUrl = read(env, SPILL_SWEEP_DATABASE_URL_ENV)
  const schemaName = read(env, SPILL_SWEEP_SCHEMA_ENV)
  const rawInterval = read(env, SPILL_SWEEP_INTERVAL_ENV)
  if (
    databaseUrl === undefined &&
    schemaName === undefined &&
    rawInterval === undefined
  ) {
    return undefined
  }
  if (databaseUrl === undefined) {
    throw new SpillSweepConfigurationError(
      `${SPILL_SWEEP_DATABASE_URL_ENV} is required when the spill sweep is configured`
    )
  }
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new SpillSweepConfigurationError(
      `${SPILL_SWEEP_DATABASE_URL_ENV} is not a valid URL`
    )
  }
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    parsed.username === ''
  ) {
    throw new SpillSweepConfigurationError(
      `${SPILL_SWEEP_DATABASE_URL_ENV} must be a postgres URL naming the sweep login role`
    )
  }
  if (schemaName === undefined || !SCHEMA.test(schemaName)) {
    throw new SpillSweepConfigurationError(
      `${SPILL_SWEEP_SCHEMA_ENV} must name the spill schema (lowercase identifier)`
    )
  }
  const intervalMs =
    rawInterval === undefined
      ? DEFAULT_SPILL_SWEEP_INTERVAL_MS
      : /^[0-9]+$/.test(rawInterval)
        ? Number(rawInterval)
        : Number.NaN
  if (
    !Number.isSafeInteger(intervalMs) ||
    intervalMs < MIN_SPILL_SWEEP_INTERVAL_MS ||
    intervalMs > MAX_SPILL_SWEEP_INTERVAL_MS
  ) {
    throw new SpillSweepConfigurationError(
      `${SPILL_SWEEP_INTERVAL_ENV} must be an integer between ${MIN_SPILL_SWEEP_INTERVAL_MS} and ${MAX_SPILL_SWEEP_INTERVAL_MS}`
    )
  }
  return { databaseUrl, schemaName, intervalMs }
}

export interface SpillSweepComposition {
  readonly sweeps: ContinuousSweepHandle
  /** Startup preflight of the sweeper's privileges; a refusal must stop the worker. */
  verify(): Promise<void>
  close(): Promise<void>
}

export interface SpillSweepCompositionOptions {
  readonly telemetry?: WorkerTelemetry
  readonly createPool?: (config: SpillSweepConfig) => {
    pool: PostgresPoolLike
    end(): Promise<void>
  }
}

const defaultPool = (config: SpillSweepConfig) => {
  const pool = guardPostgresPoolErrors(
    new Pool({ connectionString: config.databaseUrl, max: 1 })
  )
  return {
    pool: pool as unknown as PostgresPoolLike,
    end: () => pool.end()
  }
}

export function createSpillSweepComposition(
  config: SpillSweepConfig,
  options: SpillSweepCompositionOptions = {}
): SpillSweepComposition {
  const telemetry = options.telemetry ?? createJsonWorkerTelemetry()
  const { pool, end } = (options.createPool ?? defaultPool)(config)
  const sweeper = new PostgresSpillSweeper(pool, {
    schemaName: config.schemaName
  })
  let running = false
  let currentTick: Promise<void> | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  const tick = (): Promise<void> => {
    if (!running) return Promise.resolve()
    if (currentTick) return currentTick
    currentTick = sweeper
      .purgeExpired()
      .then((purged) => {
        telemetry.log('worker.spill_sweep_tick', {
          purged,
          operation: 'spill_sweep'
        })
        telemetry.metric('worker_sweep_spill_purged_total', purged, {
          status: 'purged'
        })
      })
      .catch((error: unknown) => {
        telemetry.log(
          'worker.spill_sweep_failed',
          { error: sanitizeOutboxError(error), operation: 'spill_sweep' },
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
    sweeps: {
      start() {
        if (running) return
        running = true
        telemetry.log('worker.spill_sweep_started', {
          intervalMs: config.intervalMs,
          operation: 'spill_sweep'
        })
        timer = setInterval(() => {
          void tick()
        }, config.intervalMs)
        timer.unref?.()
      },
      async stop() {
        running = false
        if (timer) {
          clearInterval(timer)
          timer = undefined
        }
        await currentTick
        telemetry.log('worker.spill_sweep_stopped', {
          operation: 'spill_sweep'
        })
      }
    },
    verify: () => sweeper.verify(),
    close: () => end()
  }
}

/**
 * Host entry: `undefined` when the sweep is not configured (no port, no metric), a composition
 * when it is, and a thrown `SpillSweepConfigurationError` for any invalid value, before a pool
 * is opened.
 */
export function composeSpillSweep(
  env: NodeJS.ProcessEnv,
  options: SpillSweepCompositionOptions = {}
):
  | { composition: SpillSweepComposition; config: SpillSweepConfig }
  | undefined {
  const config = resolveSpillSweepConfig(env)
  return config
    ? { composition: createSpillSweepComposition(config, options), config }
    : undefined
}
