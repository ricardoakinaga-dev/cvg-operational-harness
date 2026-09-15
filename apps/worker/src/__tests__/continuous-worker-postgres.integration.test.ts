import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  runPostgresMigrations,
  TenantScopedPostgresRuntimeRepository,
  withTenantContext
} from '@cvg/persistence'
import {
  createControlledNoopHandlers,
  createPostgresContinuousWorker,
  type PostgresContinuousWorkerRuntime
} from '../postgres-controlled.ts'
import type { WorkerTelemetry } from '../worker-observability.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const tenantIdRaw = 'tenant_00000000-0000-4000-8000-000000000192'
const tenantId = TenantIdSchema.parse(tenantIdRaw)
const correlationId = 'corr_00000000-0000-4000-8000-000000000192'
const tuning = {
  pollIntervalMs: 5,
  leaseMs: 1_000,
  drainMs: 5_000,
  summaryIntervalMs: 1_000
} as const

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

function createRecordingTelemetry(): {
  telemetry: WorkerTelemetry
  metrics: Array<{ name: string; value: number }>
  logs: string[]
} {
  const metrics: Array<{ name: string; value: number }> = []
  const logs: string[] = []
  return {
    metrics,
    logs,
    telemetry: {
      log(event) {
        logs.push(event)
      },
      metric(name, value) {
        metrics.push({ name, value })
      }
    }
  }
}

function workerEnv(
  databaseUrl: string,
  schemaName: string,
  workerId: string
): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: databaseUrl,
    POSTGRES_SCHEMA: schemaName,
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: tenantIdRaw,
    CVG_WORKER_ID: workerId
  }
}

async function countOutboxEffects(pool: Pool): Promise<number> {
  return withTenantContext(pool, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT count(*)::int AS count FROM outbox_effects WHERE tenant_id = $1',
      [tenantIdRaw]
    )
    return Number(result.rows[0]?.count ?? 0)
  })
}

async function countOutboxEffectsForEvent(
  pool: Pool,
  eventId: string
): Promise<number> {
  return withTenantContext(pool, tenantId, async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT count(*)::int AS count FROM outbox_effects WHERE tenant_id = $1 AND event_id = $2',
      [tenantIdRaw, eventId]
    )
    return Number(result.rows[0]?.count ?? 0)
  })
}

describe('AAA-19 continuous PostgreSQL worker', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'consumes events across a simulated restart and dead-letters a poison event',
    async () => {
      const databaseUrl = testDatabaseUrl as string
      const schemaName = `cvg_worker_cont_${Date.now()}_${randomBytes(3).toString('hex')}`
      const migrationClient = new Client({ connectionString: databaseUrl })
      const pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`
      })
      let first: PostgresContinuousWorkerRuntime | undefined
      let second: PostgresContinuousWorkerRuntime | undefined

      await migrationClient.connect()
      try {
        await runPostgresMigrations(migrationClient, { schemaName })
        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const before = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'before-restart' },
          idempotencyKey: 'pg-continuous-before-192',
          correlationId
        })

        first = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-a'),
          { handlers: createControlledNoopHandlers(), tuning }
        )
        first.worker.start()
        await vi.waitFor(
          async () => {
            const record = await repository.findOutboxById(tenantId, before.id)
            expect(record?.status).toBe('processed')
          },
          { timeout: 10_000, interval: 25 }
        )
        await first.worker.stop()
        await first.pool.end()
        first = undefined

        const poison = await repository.enqueue({
          tenantId,
          type: 'synthetic.poison',
          payload: { fixture: 'poison' },
          idempotencyKey: 'pg-continuous-poison-192',
          correlationId
        })
        const after = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'after-restart' },
          idempotencyKey: 'pg-continuous-after-192',
          correlationId
        })

        second = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-b'),
          { handlers: createControlledNoopHandlers(), tuning }
        )
        second.worker.start()
        await vi.waitFor(
          async () => {
            const record = await repository.findOutboxById(tenantId, after.id)
            expect(record?.status).toBe('processed')
          },
          { timeout: 10_000, interval: 25 }
        )
        await vi.waitFor(
          async () => {
            const record = await repository.findOutboxById(tenantId, poison.id)
            expect(record?.status).toBe('dead_letter')
          },
          { timeout: 10_000, interval: 25 }
        )
        await second.worker.stop()

        expect(second.worker.metrics()).toMatchObject({
          processed: 1,
          deadLettered: 1,
          errors: 0
        })
        expect(await countOutboxEffects(pool)).toBe(2)
      } finally {
        await first?.worker.stop().catch(() => undefined)
        await first?.pool.end().catch(() => undefined)
        await second?.worker.stop().catch(() => undefined)
        await second?.pool.end().catch(() => undefined)
        await pool.end().catch(() => undefined)
        await migrationClient
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await migrationClient.end()
      }
    },
    60_000
  )

  itWithPostgres(
    'observes queue lag, completes in-flight work on shutdown and releases bounded leases',
    async () => {
      const databaseUrl = testDatabaseUrl as string
      const schemaName = `cvg_worker_lease_${Date.now()}_${randomBytes(3).toString('hex')}`
      const migrationClient = new Client({ connectionString: databaseUrl })
      const pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`
      })
      const graceful = deferred()
      const bounded = deferred()
      let running: PostgresContinuousWorkerRuntime | undefined
      let cleanup: PostgresContinuousWorkerRuntime | undefined
      let gated: PostgresContinuousWorkerRuntime | undefined
      let retry: PostgresContinuousWorkerRuntime | undefined

      await migrationClient.connect()
      try {
        await runPostgresMigrations(migrationClient, { schemaName })
        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        for (const suffix of ['a', 'b', 'c']) {
          await repository.enqueue({
            tenantId,
            type: 'message.outbound',
            payload: { fixture: `graceful-${suffix}` },
            idempotencyKey: `pg-continuous-graceful-192-${suffix}`,
            correlationId
          })
        }
        let calls = 0
        const recording = createRecordingTelemetry()
        running = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-c'),
          {
            telemetry: recording.telemetry,
            heartbeatIntervalMs: 100,
            lagSampleIntervalMs: 10,
            tuning: { ...tuning, concurrency: 1 },
            handlers: {
              inboundProcess: () => ({
                status: 'controlled_inbound_consumed',
                externalEffects: false
              }),
              messageOutbound: async () => {
                calls += 1
                if (calls === 1) await graceful.promise
                return {
                  status: 'controlled_outbound_suppressed',
                  externalEffects: false
                }
              }
            }
          }
        )

        running.worker.start()
        await vi.waitFor(
          () => {
            expect(calls).toBe(1)
          },
          { timeout: 10_000, interval: 10 }
        )
        await vi.waitFor(
          () => {
            expect(running?.worker.metrics().lag).toBe(2)
          },
          { timeout: 10_000, interval: 10 }
        )
        await vi.waitFor(
          () => {
            expect(running?.worker.metrics().heartbeats).toBeGreaterThanOrEqual(
              1
            )
          },
          { timeout: 10_000, interval: 10 }
        )

        const stopPromise = running.worker.stop({ drainMs: 5_000 })
        await delay(50)
        graceful.resolve()
        const stopped = await stopPromise
        expect(stopped).toMatchObject({ drained: true, released: 0 })
        expect(running.worker.metrics().processed).toBe(1)
        expect(recording.metrics).toContainEqual(
          expect.objectContaining({ name: 'worker_outbox_lag', value: 2 })
        )
        await running.pool.end()
        running = undefined

        const cleanupWorker = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-d'),
          { handlers: createControlledNoopHandlers(), tuning }
        )
        cleanup = cleanupWorker
        cleanupWorker.worker.start()
        await vi.waitFor(
          () => {
            expect(cleanupWorker.worker.metrics().processed).toBe(2)
          },
          { timeout: 10_000, interval: 25 }
        )
        await cleanupWorker.worker.stop()
        await cleanupWorker.pool.end()
        cleanup = undefined

        const target = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'bounded-release' },
          idempotencyKey: 'pg-continuous-bounded-192',
          correlationId
        })
        gated = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-e'),
          {
            tuning: { ...tuning, concurrency: 1 },
            handlers: {
              inboundProcess: () => ({
                status: 'controlled_inbound_consumed',
                externalEffects: false
              }),
              messageOutbound: async () => {
                await bounded.promise
                return {
                  status: 'controlled_outbound_suppressed',
                  externalEffects: false
                }
              }
            }
          }
        )
        gated.worker.start()
        await vi.waitFor(
          () => {
            expect(gated?.worker.metrics().claimed).toBe(1)
          },
          { timeout: 10_000, interval: 10 }
        )

        const boundedStop = await gated.worker.stop({ drainMs: 30 })
        expect(boundedStop).toMatchObject({ drained: false, released: 1 })
        const released = await repository.findOutboxById(tenantId, target.id)
        expect(released).toMatchObject({ status: 'failed', leaseOwner: null })

        bounded.resolve()
        await gated.pool.end()
        gated = undefined

        retry = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-pg-continuous-192-f'),
          { handlers: createControlledNoopHandlers(), tuning }
        )
        retry.worker.start()
        await vi.waitFor(
          async () => {
            const record = await repository.findOutboxById(tenantId, target.id)
            expect(record?.status).toBe('processed')
          },
          { timeout: 10_000, interval: 25 }
        )
        await retry.worker.stop()

        expect(await countOutboxEffects(pool)).toBe(4)
        expect(await countOutboxEffectsForEvent(pool, target.id)).toBe(1)
      } finally {
        graceful.resolve()
        bounded.resolve()
        await running?.worker.stop().catch(() => undefined)
        await running?.pool.end().catch(() => undefined)
        await cleanup?.worker.stop().catch(() => undefined)
        await cleanup?.pool.end().catch(() => undefined)
        await gated?.worker.stop().catch(() => undefined)
        await gated?.pool.end().catch(() => undefined)
        await retry?.worker.stop().catch(() => undefined)
        await retry?.pool.end().catch(() => undefined)
        await pool.end().catch(() => undefined)
        await migrationClient
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await migrationClient.end()
      }
    },
    60_000
  )
})
