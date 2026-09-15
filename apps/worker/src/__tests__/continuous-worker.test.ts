import { spawn } from 'node:child_process'
import path from 'node:path'
import { TenantIdSchema } from '@cvg/platform'
import {
  InMemoryDatabase,
  OutboxRepository,
  type DurableOutboxAdapter
} from '@cvg/persistence'
import { describe, expect, it, vi } from 'vitest'
import {
  CONTINUOUS_WORKER_RUN_MODE,
  createContinuousWorker,
  parseContinuousWorkerSettings,
  type ContinuousWorkerHandlers
} from '../continuous-worker.ts'
import { getWorkerStartupFailure } from '../worker.ts'
import type { WorkerTelemetry } from '../worker-observability.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000190'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000190'

interface RecordedTelemetry {
  telemetry: WorkerTelemetry
  logs: Array<{
    event: string
    level: string
    fields: Record<string, unknown>
  }>
  metrics: Array<{
    name: string
    value: number
    attributes: Record<string, string | number | boolean>
  }>
}

function createRecordingTelemetry(): RecordedTelemetry {
  const logs: RecordedTelemetry['logs'] = []
  const metrics: RecordedTelemetry['metrics'] = []
  return {
    logs,
    metrics,
    telemetry: {
      log(event, fields, level = 'info') {
        logs.push({ event, level, fields: fields ?? {} })
      },
      metric(name, value, attributes) {
        metrics.push({ name, value, attributes: attributes ?? {} })
      }
    }
  }
}

function createHandlers(
  overrides: Partial<ContinuousWorkerHandlers> = {}
): ContinuousWorkerHandlers {
  return {
    inboundProcess: () => ({ status: 'controlled_noop' }),
    messageOutbound: () => ({ status: 'controlled_noop' }),
    ...overrides
  }
}

function enqueueInbound(
  adapter: OutboxRepository,
  idempotencyKey: string,
  payload: unknown = { fixture: true }
) {
  return adapter.enqueue({
    tenantId,
    type: 'inbound.process',
    payload,
    idempotencyKey,
    correlationId
  })
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function statusOf(adapter: OutboxRepository, eventId: string) {
  return adapter.findById(eventId, tenantId)?.status
}

function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as unknown
        return parsed && typeof parsed === 'object'
          ? [parsed as Record<string, unknown>]
          : []
      } catch {
        return []
      }
    })
}

function runWorkerEntrypoint(
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      path.resolve('node_modules/.bin/tsx'),
      ['apps/worker/src/main.ts'],
      {
        cwd: process.cwd(),
        env,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += String(chunk)
    })
    const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000)
    child.once('error', () => {
      clearTimeout(timeout)
      resolve({ code: null, output })
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      resolve({ code, output })
    })
  })
}

describe('AAA-19 continuous worker startup fail-closed', () => {
  it('fails closed without an explicit queue adapter', () => {
    expect(getWorkerStartupFailure({})).toMatchObject({
      code: 'queue_adapter_missing'
    })
  })

  it('fails closed when continuous mode has no database URL', () => {
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        CVG_WORKER_RUN_MODE: CONTINUOUS_WORKER_RUN_MODE,
        CVG_WORKER_TENANT_ID: tenantId,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toMatchObject({ code: 'postgres_database_missing' })
  })

  it('rejects continuous mode on a non-durable in-memory adapter', () => {
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        CVG_WORKER_RUN_MODE: CONTINUOUS_WORKER_RUN_MODE,
        CVG_WORKER_TENANT_ID: tenantId
      })
    ).toMatchObject({ code: 'continuous_durable_adapter_required' })
  })

  it('fails closed for each missing continuous configuration dimension', () => {
    const base: NodeJS.ProcessEnv = {
      CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
      CVG_WORKER_RUN_MODE: CONTINUOUS_WORKER_RUN_MODE,
      DATABASE_URL: 'postgres://fixture.invalid/cvg',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_TENANT_ID: tenantId
    }

    expect(getWorkerStartupFailure({})).toMatchObject({
      code: 'queue_adapter_missing'
    })
    expect(
      getWorkerStartupFailure({ ...base, CVG_WORKER_QUEUE_ADAPTER: undefined })
    ).toMatchObject({ code: 'queue_adapter_missing' })
    expect(
      getWorkerStartupFailure({ ...base, CVG_WORKER_TENANT_ID: undefined })
    ).toMatchObject({ code: 'controlled_tenant_missing' })
    expect(
      getWorkerStartupFailure({ ...base, DATABASE_URL: undefined })
    ).toMatchObject({ code: 'postgres_database_missing' })
    expect(
      getWorkerStartupFailure({ ...base, POSTGRES_RLS_ENFORCEMENT: undefined })
    ).toMatchObject({ code: 'postgres_rls_required' })
    expect(
      getWorkerStartupFailure({
        ...base,
        CVG_WORKER_CONTROLLED_MODE: undefined
      })
    ).toMatchObject({ code: 'controlled_mode_required' })
    expect(
      getWorkerStartupFailure({ ...base, NODE_ENV: 'production' })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
  })

  it('rejects unsupported run modes and invalid continuous settings', () => {
    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres',
        CVG_WORKER_RUN_MODE: 'turbo'
      })
    ).toMatchObject({ code: 'worker_run_mode_unsupported' })

    expect(
      getWorkerStartupFailure({
        CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
        CVG_WORKER_RUN_MODE: CONTINUOUS_WORKER_RUN_MODE,
        CVG_WORKER_TENANT_ID: tenantId,
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_CONCURRENCY: '0'
      })
    ).toMatchObject({
      code: 'continuous_settings_invalid',
      message: expect.stringContaining('CVG_WORKER_CONCURRENCY')
    })
  })

  it('exits non-zero when the real entrypoint starts without required config', async () => {
    const env = { ...process.env }
    env.CVG_WORKER_QUEUE_ADAPTER = 'postgres-controlled'
    env.CVG_WORKER_RUN_MODE = CONTINUOUS_WORKER_RUN_MODE
    env.CVG_WORKER_TENANT_ID = tenantId
    env.POSTGRES_RLS_ENFORCEMENT = 'true'
    env.CVG_WORKER_CONTROLLED_MODE = 'true'
    env.DATABASE_URL = ''
    delete env.CVG_WORKER_CONTROLLED_SMOKE

    const result = await runWorkerEntrypoint(env)
    const events = parseJsonLines(result.output)

    expect(result.code).toBe(1)
    expect(events).toContainEqual(
      expect.objectContaining({
        event: 'worker.startup_failed',
        code: 'postgres_database_missing'
      })
    )
  }, 30_000)
})

describe('AAA-19 continuous worker settings', () => {
  it('parses defaults and rejects invalid values explicitly', () => {
    const defaults = parseContinuousWorkerSettings({})
    expect(defaults.concurrency).toBe(2)
    expect(defaults.leaseMs).toBe(30_000)

    expect(() =>
      parseContinuousWorkerSettings({ CVG_WORKER_CONCURRENCY: '11' })
    ).toThrow(/CVG_WORKER_CONCURRENCY must be an integer between 1 and 10/)
    expect(() =>
      parseContinuousWorkerSettings({ CVG_WORKER_POLL_INTERVAL_MS: 'x' })
    ).toThrow(/CVG_WORKER_POLL_INTERVAL_MS must be a positive integer/)
    expect(() =>
      parseContinuousWorkerSettings({ CVG_WORKER_LEASE_MS: '10' })
    ).toThrow(/CVG_WORKER_LEASE_MS must be an integer between/)
    expect(() =>
      parseContinuousWorkerSettings({
        CVG_WORKER_POLL_INTERVAL_MS: '50',
        CVG_WORKER_IDLE_MAX_BACKOFF_MS: '10'
      })
    ).toThrow(/CVG_WORKER_IDLE_MAX_BACKOFF_MS/)
  })

  it('rejects invalid in-process worker options before starting', () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    expect(() =>
      createContinuousWorker({
        tenantId,
        workerId: '   ',
        adapter,
        handlers: createHandlers(),
        concurrency: 2
      })
    ).toThrow(/worker id is required/)
    expect(() =>
      createContinuousWorker({
        tenantId,
        workerId: 'worker-config-190',
        adapter,
        handlers: createHandlers(),
        concurrency: 0
      })
    ).toThrow(/concurrency must be an integer between 1 and 10/)
    expect(() =>
      createContinuousWorker({
        tenantId,
        workerId: 'worker-config-190',
        adapter,
        handlers: createHandlers(),
        leaseMs: 10
      })
    ).toThrow(/leaseMs must be an integer between/)
    expect(() =>
      createContinuousWorker({
        tenantId,
        workerId: 'worker-config-190',
        adapter,
        handlers: {
          inboundProcess: 'not-a-function' as never,
          messageOutbound: () => undefined
        }
      })
    ).toThrow(/handlers are required/)
  })
})

describe('AAA-19 continuous worker consumption', () => {
  it('consumes the queue with bounded concurrency and counters', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    for (const suffix of ['a', 'b', 'c', 'd']) {
      enqueueInbound(adapter, `continuous-bounded-190-${suffix}`)
    }
    let concurrent = 0
    let maxConcurrent = 0
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-bounded-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          concurrent += 1
          maxConcurrent = Math.max(maxConcurrent, concurrent)
          await delay(30)
          concurrent -= 1
          return { status: 'controlled_noop' }
        }
      }),
      concurrency: 2,
      pollIntervalMs: 5,
      leaseMs: 1_000,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(worker.metrics().processed).toBe(4)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(maxConcurrent).toBeGreaterThanOrEqual(1)
    expect(maxConcurrent).toBeLessThanOrEqual(2)
    expect(db.state.outbox.every((event) => event.status === 'processed')).toBe(
      true
    )
    expect(worker.metrics()).toMatchObject({
      claimed: 4,
      processed: 4,
      failed: 0,
      deadLettered: 0,
      errors: 0
    })
    expect(
      telemetry.metrics.filter(
        (metric) => metric.name === 'worker_outbox_processed_total'
      )
    ).toHaveLength(4)
    expect(telemetry.metrics).toContainEqual(
      expect.objectContaining({
        name: 'worker_outbox_processed_total',
        value: 1,
        attributes: { status: 'processed' }
      })
    )
  })

  it('consumes events enqueued before and after a simulated restart', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const first = enqueueInbound(adapter, 'continuous-restart-190-a')
    const seen: string[] = []
    const firstWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-restart-190-a',
      adapter,
      handlers: createHandlers({
        inboundProcess: (event) => {
          seen.push(event.id)
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    firstWorker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, first.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await firstWorker.stop()

    const second = enqueueInbound(adapter, 'continuous-restart-190-b')
    const secondWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-restart-190-b',
      adapter,
      handlers: createHandlers({
        inboundProcess: (event) => {
          seen.push(event.id)
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    secondWorker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, second.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await secondWorker.stop()

    expect(seen).toEqual([first.id, second.id])
    expect(adapter.pending(tenantId)).toHaveLength(0)
  })

  it('backs off while idle and keeps supervising the queue', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-idle-190',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      idleMaxBackoffMs: 40,
      leaseMs: 1_000,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        const backoffs = telemetry.logs
          .filter((log) => log.event === 'worker.idle_backoff')
          .map((log) => Number(log.fields.backoffMs))
        expect(Math.max(0, ...backoffs)).toBeGreaterThanOrEqual(20)
      },
      { timeout: 5_000, interval: 5 }
    )

    expect(worker.isRunning()).toBe(true)
    const backoffs = telemetry.logs
      .filter((log) => log.event === 'worker.idle_backoff')
      .map((log) => Number(log.fields.backoffMs))
    expect(backoffs[0]).toBe(5)
    await worker.stop()
    expect(worker.isRunning()).toBe(false)
  })

  it('retries handler failures through the outbox backoff and counts them', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(adapter, 'continuous-retry-190')
    let calls = 0
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-retry-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: () => {
          calls += 1
          if (calls === 1) throw new Error('synthetic transient failure')
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(calls).toBe(2)
    expect(worker.metrics()).toMatchObject({
      processed: 1,
      failed: 1,
      deadLettered: 0
    })
  })

  it('dead-letters a poison event without blocking the queue', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    const poison = adapter.enqueue({
      tenantId,
      type: 'synthetic.poison',
      payload: { fixture: 'poison' },
      idempotencyKey: 'continuous-poison-190',
      correlationId
    })
    const good = enqueueInbound(adapter, 'continuous-poison-good-190')
    const processed: string[] = []
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-poison-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: (event) => {
          processed.push(event.id)
          return { status: 'controlled_noop' }
        }
      }),
      concurrency: 1,
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, good.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(statusOf(adapter, poison.id)).toBe('dead_letter')
    expect(processed).toEqual([good.id])
    expect(worker.metrics()).toMatchObject({
      processed: 1,
      deadLettered: 1,
      errors: 0
    })
  })

  it('dead-letters a failing event and consumes it after an operator requeue', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      maxAttempts: 1,
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(adapter, 'continuous-requeue-190')
    const firstWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-requeue-190-a',
      adapter,
      handlers: createHandlers({
        inboundProcess: () => {
          throw new Error('synthetic poison before operator requeue')
        }
      }),
      concurrency: 1,
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    firstWorker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('dead_letter')
      },
      { timeout: 5_000, interval: 5 }
    )
    await firstWorker.stop()
    expect(firstWorker.metrics()).toMatchObject({
      processed: 0,
      failed: 0,
      deadLettered: 1
    })
    expect(db.state.outboxEffects).toHaveLength(0)

    const requeued = adapter.requeueDeadLetter({
      tenantId,
      eventId: event.id,
      operatorId: 'operator-requeue-190',
      correlationId
    })
    expect(requeued).toMatchObject({
      id: event.id,
      status: 'pending',
      attempts: 0,
      idempotencyKey: 'continuous-requeue-190'
    })

    const secondWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-requeue-190-b',
      adapter,
      handlers: createHandlers(),
      concurrency: 1,
      pollIntervalMs: 5,
      leaseMs: 1_000
    })
    secondWorker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await secondWorker.stop()

    expect(secondWorker.metrics()).toMatchObject({
      claimed: 1,
      processed: 1,
      failed: 0,
      deadLettered: 0
    })
    expect(db.state.outboxEffects.map((effect) => effect.eventId)).toEqual([
      event.id
    ])
  })

  it('observes queue lag while a handler is in flight', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    for (const suffix of ['a', 'b', 'c']) {
      enqueueInbound(adapter, `continuous-lag-190-${suffix}`)
    }
    const gate = deferred()
    let calls = 0
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-lag-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          calls += 1
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      concurrency: 1,
      pollIntervalMs: 5,
      leaseMs: 1_000,
      lagSampleIntervalMs: 10,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(calls).toBe(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    await vi.waitFor(
      () => {
        expect(worker.metrics().lag).toBe(2)
      },
      { timeout: 5_000, interval: 5 }
    )

    gate.resolve()
    await vi.waitFor(
      () => {
        expect(worker.metrics().processed).toBe(3)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(telemetry.metrics).toContainEqual(
      expect.objectContaining({ name: 'worker_outbox_lag', value: 2 })
    )
  })

  it('keeps payload content out of structured logs', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    const event = enqueueInbound(adapter, 'continuous-pii-190', {
      body: 'PACIENTE-SEGREDO-190',
      cpf: '529.982.247-25'
    })
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-pii-190',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    const serialized = JSON.stringify(telemetry.logs)
    expect(serialized).not.toContain('PACIENTE-SEGREDO-190')
    expect(serialized).not.toContain('529.982.247-25')
    expect(
      telemetry.logs.every(
        (log) =>
          !('payload' in log.fields) &&
          !('body' in log.fields) &&
          !('cpf' in log.fields)
      )
    ).toBe(true)
  })
})

describe('AAA-19 continuous worker shutdown and lease safety', () => {
  it('finishes an in-flight handler on SIGTERM without losing or duplicating the effect', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(adapter, 'continuous-sigterm-190')
    const gate = deferred()
    let calls = 0
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-sigterm-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          calls += 1
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(calls).toBe(1)
      },
      { timeout: 5_000, interval: 5 }
    )

    const stopPromise = worker.stop({ drainMs: 2_000 })
    await delay(20)
    expect(adapter.findById(event.id, tenantId)?.status).toBe('processing')

    gate.resolve()
    const stopped = await stopPromise

    expect(stopped).toMatchObject({ drained: true, released: 0 })
    expect(calls).toBe(1)
    expect(statusOf(adapter, event.id)).toBe('processed')
    expect(db.state.outboxEffects).toHaveLength(1)
    expect(worker.metrics()).toMatchObject({ processed: 1, errors: 0 })
  })

  it('releases the lease on a bounded SIGTERM and a later worker retries safely', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(adapter, 'continuous-release-190')
    const gate = deferred()
    let firstCalls = 0
    const firstWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-release-190-a',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          firstCalls += 1
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    firstWorker.start()
    await vi.waitFor(
      () => {
        expect(firstCalls).toBe(1)
      },
      { timeout: 5_000, interval: 5 }
    )

    const stopped = await firstWorker.stop({ drainMs: 30 })
    expect(stopped).toMatchObject({ drained: false, released: 1 })
    expect(adapter.findById(event.id, tenantId)).toMatchObject({
      status: 'failed',
      leaseOwner: null
    })

    const secondWorker = createContinuousWorker({
      tenantId,
      workerId: 'worker-release-190-b',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })
    secondWorker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await secondWorker.stop()

    expect(db.state.outboxEffects).toHaveLength(1)

    gate.resolve()
    await delay(20)
    expect(statusOf(adapter, event.id)).toBe('processed')
    expect(db.state.outboxEffects).toHaveLength(1)
  })

  it('renews the lease through the adapter heartbeat seam when available', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase(), {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    enqueueInbound(adapter, 'continuous-heartbeat-renew-190')
    const gate = deferred()
    let renewals = 0
    ;(
      adapter as unknown as {
        heartbeatClaim: (input: { eventId: string }) => unknown
      }
    ).heartbeatClaim = (input) => {
      renewals += 1
      return adapter.findById(input.eventId, tenantId)
    }
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-heartbeat-renew-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      heartbeatIntervalMs: 10
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(worker.metrics().heartbeats).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    expect(renewals).toBeGreaterThanOrEqual(1)

    gate.resolve()
    await vi.waitFor(
      () => {
        expect(worker.metrics().processed).toBe(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()
  })

  it('prefers an explicit outboxBacklog probe when the adapter exposes one', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    ;(adapter as unknown as { outboxBacklog: () => number }).outboxBacklog =
      () => 7
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-backlog-190',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      lagSampleIntervalMs: 1,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(worker.metrics().lag).toBe(7)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(telemetry.metrics).toContainEqual(
      expect.objectContaining({ name: 'worker_outbox_lag', value: 7 })
    )
  })

  it('backs off and recovers when the claim boundary fails', async () => {
    const base = new OutboxRepository(new InMemoryDatabase(), {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(base, 'continuous-claim-failure-190')
    let failures = 0
    const adapter: DurableOutboxAdapter = {
      enqueue: (input, tx) => base.enqueue(input, tx),
      claimNext: (input) => {
        if (failures < 2) {
          failures += 1
          throw new Error('synthetic claim failure')
        }
        return base.claimNext(input)
      },
      ack: (input) => base.ack(input),
      fail: (input) => base.fail(input),
      requeueDeadLetter: (input) => base.requeueDeadLetter(input)
    }
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-claim-failure-190',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      errorBackoffMs: 5,
      errorMaxBackoffMs: 20,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(base, event.id)).toBe('processed')
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(worker.metrics().claimFailures).toBe(2)
    expect(telemetry.logs.map((log) => log.event)).toContain(
      'worker.claim_failed'
    )
  })

  it('hands off to a human when takeover is active and never runs the handler', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    const event = enqueueInbound(adapter, 'continuous-handoff-190')
    const handler = vi.fn()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-handoff-190',
      adapter,
      handlers: createHandlers({ inboundProcess: handler }),
      takeoverActive: true,
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(statusOf(adapter, event.id)).toBe('dead_letter')
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(handler).not.toHaveBeenCalled()
    expect(worker.metrics()).toMatchObject({ handoffs: 1, processed: 0 })
  })

  it('heartbeats the claimed lease while the handler runs', async () => {
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    enqueueInbound(adapter, 'continuous-heartbeat-190')
    const gate = deferred()
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-heartbeat-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      heartbeatIntervalMs: 10,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await vi.waitFor(
      () => {
        expect(worker.metrics().heartbeats).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )

    expect(worker.metrics().leaseLost).toBe(0)
    expect(telemetry.metrics).toContainEqual(
      expect.objectContaining({
        name: 'worker_outbox_heartbeats_total',
        value: 1
      })
    )

    gate.resolve()
    await vi.waitFor(
      () => {
        expect(worker.metrics().processed).toBe(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()
  })

  it('detects a lost lease and fails closed instead of committing the effect', async () => {
    let now = new Date('2026-09-13T00:00:00.000Z')
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db, {
      now: () => now,
      leaseMs: 1_000,
      retryBaseMs: 5,
      retryMaxMs: 5
    })
    const event = enqueueInbound(adapter, 'continuous-lease-lost-190')
    const gate = deferred()
    const started = deferred()
    const telemetry = createRecordingTelemetry()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-lease-lost-190',
      adapter,
      handlers: createHandlers({
        inboundProcess: async () => {
          started.resolve()
          await gate.promise
          return { status: 'controlled_noop' }
        }
      }),
      pollIntervalMs: 5,
      leaseMs: 1_000,
      heartbeatIntervalMs: 5,
      telemetry: telemetry.telemetry
    })

    worker.start()
    await started.promise
    await vi.waitFor(
      () => {
        expect(adapter.findById(event.id, tenantId)?.leaseOwner).toBe(
          'worker-lease-lost-190'
        )
      },
      { timeout: 5_000, interval: 5 }
    )

    now = new Date(now.getTime() + 2_000)
    const intruder = adapter.claimNext({
      tenantId,
      workerId: 'worker-intruder-190',
      leaseMs: 1_000
    })
    expect(intruder).toMatchObject({
      id: event.id,
      leaseOwner: 'worker-intruder-190'
    })

    await vi.waitFor(
      () => {
        expect(worker.metrics().leaseLost).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    expect(telemetry.logs.map((log) => log.event)).toContain(
      'worker.lease_lost'
    )

    gate.resolve()
    await vi.waitFor(
      () => {
        expect(worker.metrics().errors).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    expect(db.state.outboxEffects).toHaveLength(0)
    expect(statusOf(adapter, event.id)).toBe('processing')
    await worker.stop()
  })

  it('is idempotent on stop and refuses to restart after stopping', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-stop-190',
      adapter,
      handlers: createHandlers(),
      pollIntervalMs: 5,
      leaseMs: 1_000
    })

    worker.start()
    const first = worker.stop()
    const second = worker.stop()
    await expect(first).resolves.toMatchObject({ drained: true })
    await expect(second).resolves.toMatchObject({ drained: true })
    expect(() => worker.start()).toThrow(/cannot be restarted/)
  })
})
