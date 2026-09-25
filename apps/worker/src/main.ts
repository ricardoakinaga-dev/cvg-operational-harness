import { TenantIdSchema } from '@cvg/platform'
import { createDomainId, createShutdownController } from '@cvg/shared'
import { CONTINUOUS_WORKER_RUN_MODE } from './continuous-worker.ts'
import { createControlledWorker } from './controlled-worker.ts'
import {
  createPostgresContinuousWorker,
  createPostgresControlledWorker,
  parseControlledDrainLimit,
  POSTGRES_CONTROLLED_QUEUE_ADAPTER
} from './postgres-controlled.ts'
import { createJsonWorkerTelemetry } from './worker-observability.ts'
import { getWorkerStartupFailure } from './worker.ts'
import { assertPostgresWorkerPreflight } from './postgres-role-preflight.ts'
import {
  KERNEL_WORKER_RUNTIME,
  assertPostgresKernelPrerequisites,
  resolveWorkerRuntimeKind
} from './kernel-composition.ts'
import { InMemoryDatabase, OutboxRepository } from '@cvg/persistence'
import {
  OPERATIONAL_HARNESS_WORKER_RUNTIME,
  assertOperationalHarnessPostgresPreflight,
  assertOperationalHarnessProfilePreflight,
  createOperationalHarnessWorker,
  parseOperationalWorkerConcurrency,
  parseOperationalWorkerIdleWait,
  parseOperationalWorkerPollInterval
} from './operational-harness-worker.ts'
import {
  OPERATIONAL_HARNESS_HOMOLOG_RUNTIME,
  runOperationalHarnessHomologWorker
} from './homolog-worker.ts'
import { createWorkerReadiness } from './readiness.ts'

const startupFailure = getWorkerStartupFailure()

if (startupFailure) {
  console.error(
    JSON.stringify({
      event: 'worker.startup_failed',
      code: startupFailure.code,
      message: startupFailure.message
    })
  )
  process.exitCode = 1
} else if (process.env.CVG_WORKER_QUEUE_ADAPTER === 'controlled-memory') {
  void runControlledMemoryWorker(process.env).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'worker.controlled_failed',
        code: 'controlled_worker_failed',
        message: error instanceof Error ? error.message : 'Worker failed'
      })
    )
    process.exitCode = 1
  })
} else if (
  process.env.CVG_WORKER_RUNTIME?.trim() === OPERATIONAL_HARNESS_WORKER_RUNTIME
) {
  void runOperationalHarnessWorker(process.env).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'worker.operational_harness_failed',
        code: 'operational_harness_failed',
        message:
          error instanceof Error
            ? error.message
            : 'Operational harness worker failed'
      })
    )
    process.exitCode = 1
  })
} else if (
  process.env.CVG_WORKER_RUNTIME?.trim() === OPERATIONAL_HARNESS_HOMOLOG_RUNTIME
) {
  // AUD19-008 — durable homologation composition (synthetic-only, PG).
  void runOperationalHarnessHomologWorker(process.env).catch(
    (error: unknown) => {
      console.error(
        JSON.stringify({
          event: 'worker.homolog_failed',
          code: 'homolog_worker_failed',
          message:
            error instanceof Error ? error.message : 'Homolog worker failed'
        })
      )
      process.exitCode = 1
    }
  )
} else if (
  process.env.CVG_WORKER_QUEUE_ADAPTER === POSTGRES_CONTROLLED_QUEUE_ADAPTER ||
  process.env.CVG_WORKER_QUEUE_ADAPTER === 'postgres'
) {
  if (process.env.CVG_WORKER_RUN_MODE?.trim() === CONTINUOUS_WORKER_RUN_MODE) {
    void runPostgresContinuousWorker(process.env).catch((error: unknown) => {
      console.error(
        JSON.stringify({
          event: 'worker.continuous_failed',
          code: 'continuous_worker_failed',
          message:
            error instanceof Error ? error.message : 'Continuous worker failed'
        })
      )
      process.exitCode = 1
    })
  } else {
    void runPostgresControlledWorker(process.env).catch(() => {
      console.error(
        JSON.stringify({
          event: 'worker.controlled_failed',
          code: 'controlled_worker_failed',
          message: 'Controlled PostgreSQL worker failed'
        })
      )
      process.exitCode = 1
    })
  }
}

async function runControlledMemoryWorker(env: NodeJS.ProcessEnv) {
  const tenantId = TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
  const adapter = new OutboxRepository(new InMemoryDatabase())
  const workerId = env.CVG_WORKER_ID?.trim() || 'worker-controlled-local'
  const smoke = env.CVG_WORKER_CONTROLLED_SMOKE === 'true'

  if (smoke) {
    adapter.enqueue({
      tenantId,
      type: 'message.outbound',
      payload: { fixture: 'controlled-worker-smoke' },
      idempotencyKey: `worker-controlled-${createDomainId('fixture')}`,
      correlationId: 'corr_00000000-0000-4000-8000-000000000172'
    })
  }

  const worker = createControlledWorker({
    tenantId,
    workerId,
    adapter,
    handlers: {
      inboundProcess: () => ({ status: 'controlled_noop' }),
      messageOutbound: () => ({ status: 'controlled_noop' })
    }
  })
  let drainPromise: ReturnType<typeof worker.drain> | undefined
  const readiness = createWorkerReadiness({
    onTransition: (transition) =>
      console.log(
        JSON.stringify({
          event: 'worker.readiness',
          workerId,
          status: transition.to,
          reason: transition.reason,
          readinessAt: transition.at
        })
      )
  })
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (reason: 'shutdown_started' | 'run_completed') => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      readiness.markNotReady(reason)
      await drainPromise
      readiness.markStopped(
        reason === 'shutdown_started' ? 'shutdown_completed' : 'run_completed'
      )
    })()
    return cleanupPromise
  }
  const shutdown = createShutdownController({
    close: () => cleanup('shutdown_started'),
    exit: (code) => {
      process.exitCode = code
    },
    log: (event) => {
      if (event.type !== 'shutdown.started') {
        console.error(
          JSON.stringify({ event: event.type, signal: event.signal })
        )
      }
    }
  })
  shutdown.install(process)
  try {
    if (shutdown.isShuttingDown()) return
    readiness.markReady('local_controlled_profile')
    if (shutdown.isShuttingDown()) return
    console.log(
      JSON.stringify({
        event: 'worker.controlled_ready',
        adapter: 'controlled-memory',
        processed: 0,
        durable: false,
        externalEffects: false
      })
    )
    drainPromise = worker.drain(1)
    const drained = await drainPromise
    if (!shutdown.isShuttingDown()) {
      console.log(
        JSON.stringify({
          event: smoke
            ? 'worker.controlled_smoke_passed'
            : 'worker.controlled_completed',
          adapter: 'controlled-memory',
          processed: drained.processed,
          durable: false,
          externalEffects: false
        })
      )
    }
  } catch (error) {
    if (shutdown.isShuttingDown()) return
    throw error
  } finally {
    await cleanup(
      shutdown.isShuttingDown() ? 'shutdown_started' : 'run_completed'
    )
  }
}

async function runOperationalHarnessWorker(env: NodeJS.ProcessEnv) {
  const runtime = createOperationalHarnessWorker(env)
  const workerId = env.CVG_WORKER_ID?.trim() || 'worker-operational-harness'
  const readiness = createWorkerReadiness({
    onTransition: (transition) =>
      console.log(
        JSON.stringify({
          event: 'worker.readiness',
          workerId,
          status: transition.to,
          reason: transition.reason,
          readinessAt: transition.at
        })
      )
  })
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (reason: 'shutdown_started' | 'run_completed') => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      readiness.markNotReady(reason)
      runtime.worker.requestStop()
      await runtime.worker.stop()
      await runtime.close()
      readiness.markStopped(
        reason === 'shutdown_started' ? 'shutdown_completed' : 'run_completed'
      )
    })()
    return cleanupPromise
  }
  const shutdown = createShutdownController({
    close: () => cleanup('shutdown_started'),
    exit: (code) => {
      process.exitCode = code
    },
    timeoutMs: 15_000,
    log: (event) => {
      if (event.type !== 'shutdown.started') {
        console.error(
          JSON.stringify({ event: event.type, signal: event.signal })
        )
      }
    }
  })
  shutdown.install(process)
  try {
    await assertOperationalHarnessPostgresPreflight(runtime)
    assertOperationalHarnessProfilePreflight(runtime)
    const maxEvents = parseControlledDrainLimit(env.CVG_WORKER_MAX_EVENTS, 10)
    const concurrency = parseOperationalWorkerConcurrency(
      env.CVG_WORKER_CONCURRENCY
    )
    const idleWaitMs = parseOperationalWorkerIdleWait(
      env.CVG_WORKER_IDLE_WAIT_MS
    )
    const pollIntervalMs = parseOperationalWorkerPollInterval(
      env.CVG_WORKER_POLL_INTERVAL_MS
    )
    if (shutdown.isShuttingDown()) return
    readiness.markReady('startup_preflight_passed')
    console.log(
      JSON.stringify({
        event: 'worker.operational_harness_ready',
        adapter: runtime.pool
          ? 'postgres-operational-execution'
          : 'memory-operational-execution',
        processed: 0,
        durable: Boolean(runtime.pool),
        externalEffects: false,
        idleWaitMs,
        pollIntervalMs,
        runtime: OPERATIONAL_HARNESS_WORKER_RUNTIME
      })
    )
    const idleDeadline = Date.now() + idleWaitMs
    let processed = 0
    while (processed < maxEvents && !shutdown.isShuttingDown()) {
      const width = Math.min(concurrency, maxEvents - processed)
      const results = await Promise.all(
        Array.from({ length: width }, () => runtime.worker.processNext())
      )
      const processedNow = results.filter(
        (result) => result.kind === 'processed'
      ).length
      processed += processedNow
      if (processedNow === 0) {
        const remainingMs = idleDeadline - Date.now()
        if (remainingMs <= 0) break
        await delay(Math.min(pollIntervalMs, remainingMs))
      }
    }
    if (!shutdown.isShuttingDown()) {
      console.log(
        JSON.stringify({
          event: 'worker.operational_harness_completed',
          adapter: runtime.pool
            ? 'postgres-operational-execution'
            : 'memory-operational-execution',
          processed,
          durable: Boolean(runtime.pool),
          externalEffects: false,
          idleWaitMs,
          pollIntervalMs,
          runtime: OPERATIONAL_HARNESS_WORKER_RUNTIME
        })
      )
    }
  } catch (error) {
    if (shutdown.isShuttingDown()) return
    throw error
  } finally {
    await cleanup(
      shutdown.isShuttingDown() ? 'shutdown_started' : 'run_completed'
    )
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runPostgresControlledWorker(env: NodeJS.ProcessEnv) {
  const runtime = createPostgresControlledWorker(env)
  const readiness = createWorkerReadiness({
    onTransition: (transition) =>
      console.log(
        JSON.stringify({
          event: 'worker.readiness',
          workerId: env.CVG_WORKER_ID?.trim() || 'worker-controlled-postgres',
          status: transition.to,
          reason: transition.reason,
          readinessAt: transition.at
        })
      )
  })
  let drainPromise: ReturnType<typeof runtime.worker.drain> | undefined
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (reason: 'shutdown_started' | 'run_completed') => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      readiness.markNotReady(reason)
      await drainPromise
      await runtime.pool.end()
      readiness.markStopped(
        reason === 'shutdown_started' ? 'shutdown_completed' : 'run_completed'
      )
    })()
    return cleanupPromise
  }
  const shutdown = createShutdownController({
    close: () => cleanup('shutdown_started'),
    exit: (code) => {
      process.exitCode = code
    },
    log: (event) => {
      if (event.type !== 'shutdown.started') {
        console.error(
          JSON.stringify({ event: event.type, signal: event.signal })
        )
      }
    }
  })
  shutdown.install(process)
  try {
    await assertPostgresWorkerPreflight(runtime.pool, {
      tenantId: TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
    })
    if (resolveWorkerRuntimeKind(env) === KERNEL_WORKER_RUNTIME) {
      await assertPostgresKernelPrerequisites(
        runtime.pool,
        TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
      )
    }
    if (shutdown.isShuttingDown()) return
    readiness.markReady('startup_preflight_passed')
    if (shutdown.isShuttingDown()) return
    console.log(
      JSON.stringify({
        event: 'worker.controlled_ready',
        adapter: POSTGRES_CONTROLLED_QUEUE_ADAPTER,
        processed: 0,
        durable: true,
        externalEffects: false,
        runOnce: true
      })
    )
    drainPromise = runtime.worker.drain(
      parseControlledDrainLimit(env.CVG_WORKER_MAX_EVENTS)
    )
    const drained = await drainPromise
    if (!shutdown.isShuttingDown()) {
      console.log(
        JSON.stringify({
          event: 'worker.controlled_completed',
          adapter: POSTGRES_CONTROLLED_QUEUE_ADAPTER,
          processed: drained.processed,
          durable: true,
          externalEffects: false,
          runOnce: true
        })
      )
    }
  } catch (error) {
    if (shutdown.isShuttingDown()) return
    throw error
  } finally {
    await cleanup(
      shutdown.isShuttingDown() ? 'shutdown_started' : 'run_completed'
    )
  }
}

/**
 * Opt-in supervised consumer. It stays fail-closed: the startup gate rejects
 * missing adapter/tenant/database/RLS/controlled-mode configuration before
 * this function runs, production is forbidden and only controlled handlers
 * are composed. Periodic sweeps are dependency-injected; the concrete
 * approval composition is pending AAA-21/D01, so none is enabled here.
 */
async function runPostgresContinuousWorker(env: NodeJS.ProcessEnv) {
  const telemetry = createJsonWorkerTelemetry()
  const runtime = createPostgresContinuousWorker(env, { telemetry })
  const readiness = createWorkerReadiness({
    onTransition: (transition) =>
      telemetry.log('worker.readiness', {
        workerId: runtime.workerId,
        status: transition.to,
        reason: transition.reason,
        readinessAt: transition.at
      })
  })
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (reason: 'shutdown_started' | 'startup_failed') => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      readiness.markNotReady(reason)
      const stopped = await runtime.worker.stop()
      telemetry.log('worker.continuous_drained', {
        drained: stopped.drained,
        released: stopped.released,
        releaseFailed: stopped.releaseFailed
      })
      await runtime.pool.end()
      readiness.markStopped(
        reason === 'shutdown_started' ? 'shutdown_completed' : 'startup_failed'
      )
    })()
    return cleanupPromise
  }
  const shutdown = createShutdownController({
    close: () => cleanup('shutdown_started'),
    exit: (code) => {
      process.exitCode = code
    },
    timeoutMs: runtime.tuning.drainMs + 5_000,
    log: (event) => {
      telemetry.log(
        `worker.${event.type}`,
        {
          ...(event.signal ? { signal: event.signal } : {}),
          ...(event.code !== undefined ? { code: event.code } : {}),
          ...(event.error ? { error: event.error } : {})
        },
        event.type === 'shutdown.failed' ? 'error' : 'info'
      )
    }
  })
  shutdown.install(process)
  try {
    await assertPostgresWorkerPreflight(runtime.pool, {
      tenantId: runtime.tenantId
    })
    if (resolveWorkerRuntimeKind(env) === KERNEL_WORKER_RUNTIME) {
      await assertPostgresKernelPrerequisites(runtime.pool, runtime.tenantId)
    }
  } catch (error) {
    if (shutdown.isShuttingDown()) {
      await cleanup('shutdown_started')
      return
    }
    await cleanup('startup_failed').catch(() => undefined)
    throw error
  }
  telemetry.log('worker.sweeps_disabled', {
    reason: 'approval_engine_composition_pending_aaa21',
    operation: 'sweep'
  })
  try {
    if (shutdown.isShuttingDown()) {
      await cleanup('shutdown_started')
      return
    }
    readiness.markReady('startup_preflight_passed')
    if (shutdown.isShuttingDown()) {
      await cleanup('shutdown_started')
      return
    }
    telemetry.log('worker.continuous_ready', {
      adapter: POSTGRES_CONTROLLED_QUEUE_ADAPTER,
      concurrency: runtime.tuning.concurrency,
      pollIntervalMs: runtime.tuning.pollIntervalMs,
      leaseMs: runtime.tuning.leaseMs,
      durable: true,
      externalEffects: false
    })
    runtime.worker.start()
  } catch (error) {
    await cleanup('startup_failed').catch(() => undefined)
    throw error
  }
}
