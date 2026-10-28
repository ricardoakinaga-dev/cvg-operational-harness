import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  runPostgresMigrations,
  TENANT_SCHEMA_TABLES,
  tenantRuntimeGrantPrivileges,
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

// SPEC0249 (AUD-0621 F06, F20) with a minimal runtime role (no SUPERUSER,
// no BYPASSRLS, only SELECT/INSERT/UPDATE on the tenant inventory).
describe('SPEC0249 PostgreSQL continuous worker lease integrity', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip
  const password = 'synthetic-0249-role-password'

  async function minimalRoleFixture(label: string) {
    const databaseUrl = testDatabaseUrl as string
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schemaName = `cvg_p0249_${label}_${suffix}`
    const role = `cvg_p0249_${label}_${suffix}`
    const admin = new Client({ connectionString: databaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName })
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${role}`)
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${schemaName}."${table}" TO ${role}`
      )
    }
    const url = new URL(databaseUrl)
    url.username = role
    url.password = password
    const roleUrl = url.toString()
    const pool = new Pool({
      connectionString: roleUrl,
      options: `-c search_path=${schemaName}`
    })
    return {
      admin,
      pool,
      roleUrl,
      schemaName,
      repository: new TenantScopedPostgresRuntimeRepository(pool),
      async attempts(eventId: string) {
        const result = await admin.query<{
          attempt: number
          outcome: string | null
        }>(
          `SELECT attempt, outcome FROM ${schemaName}.outbox_attempts
            WHERE tenant_id = $1 AND event_id = $2 ORDER BY id`,
          [tenantIdRaw, eventId]
        )
        return result.rows
      },
      async effectResult(eventId: string) {
        const result = await admin.query<{ result: unknown }>(
          `SELECT result FROM ${schemaName}.outbox_effects
            WHERE tenant_id = $1 AND event_id = $2`,
          [tenantIdRaw, eventId]
        )
        return result.rows.map((row) => row.result)
      },
      async leaseUntil(eventId: string): Promise<number> {
        const result = await admin.query<{ lease_until: Date | null }>(
          `SELECT lease_until FROM ${schemaName}.outbox_events
            WHERE tenant_id = $1 AND id = $2`,
          [tenantIdRaw, eventId]
        )
        return result.rows[0]?.lease_until?.getTime() ?? 0
      },
      async close() {
        await pool.end().catch(() => undefined)
        await admin
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await admin
          .query(`DROP OWNED BY ${role} CASCADE`)
          .catch(() => undefined)
        await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
        await admin.end().catch(() => undefined)
      }
    }
  }

  itWithPostgres(
    'AC06: a stale process with the same worker id cannot finish the newer claim',
    async () => {
      const x = await minimalRoleFixture('stale')
      const gateA = deferred()
      const gateB = deferred()
      const startedA = deferred()
      const startedB = deferred()
      let a: PostgresContinuousWorkerRuntime | undefined
      let b: PostgresContinuousWorkerRuntime | undefined
      try {
        const event = await x.repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'p0249-stale' },
          idempotencyKey: 'pg-p0249-stale-process',
          correlationId
        })
        const env = workerEnv(x.roleUrl, x.schemaName, 'worker-p0249-same')
        // A never renews (heartbeat far beyond the lease): its claim expires
        // while the handler is blocked, like a paused or partitioned process.
        a = createPostgresContinuousWorker(env, {
          handlers: {
            inboundProcess: () => ({ status: 'unused' }),
            messageOutbound: async () => {
              startedA.resolve()
              await gateA.promise
              return { type: 'p0249.attempt_a' }
            }
          },
          tuning: { ...tuning, concurrency: 1, leaseMs: 1_000 },
          heartbeatIntervalMs: 60_000
        })
        a.worker.start()
        await startedA.promise
        await delay(1_300)
        b = createPostgresContinuousWorker(env, {
          handlers: {
            inboundProcess: () => ({ status: 'unused' }),
            messageOutbound: async () => {
              startedB.resolve()
              await gateB.promise
              return { type: 'p0249.attempt_b' }
            }
          },
          tuning: { ...tuning, concurrency: 1, leaseMs: 30_000 }
        })
        b.worker.start()
        await startedB.promise

        // The stale process finishes first: its ack must not close B's claim.
        gateA.resolve()
        await vi.waitFor(
          () => {
            expect(a!.worker.metrics().errors).toBeGreaterThanOrEqual(1)
          },
          { timeout: 10_000, interval: 25 }
        )
        expect(a.worker.metrics().processed).toBe(0)
        const during = await x.repository.findOutboxById(tenantId, event.id)
        expect(during).toMatchObject({ status: 'processing', attempts: 2 })

        gateB.resolve()
        await vi.waitFor(
          async () => {
            const record = await x.repository.findOutboxById(tenantId, event.id)
            expect(record?.status).toBe('processed')
          },
          { timeout: 10_000, interval: 25 }
        )
        // The outbox sanitizer keeps only allowlisted fields such as `type`.
        expect(await x.effectResult(event.id)).toEqual([
          { type: 'p0249.attempt_b' }
        ])
        expect(
          (await x.attempts(event.id)).map((row) => [row.attempt, row.outcome])
        ).toEqual([
          [1, 'lease_expired'],
          [2, 'processed']
        ])
      } finally {
        gateA.resolve()
        gateB.resolve()
        await a?.worker.stop().catch(() => undefined)
        await b?.worker.stop().catch(() => undefined)
        await a?.pool.end().catch(() => undefined)
        await b?.pool.end().catch(() => undefined)
        await x.close()
      }
    },
    60_000
  )

  itWithPostgres(
    'AC08: heartbeats renew the lease of a long handler so no other worker can take it',
    async () => {
      const x = await minimalRoleFixture('renew')
      const gate = deferred()
      const started = deferred()
      let first: PostgresContinuousWorkerRuntime | undefined
      try {
        const event = await x.repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'p0249-renew' },
          idempotencyKey: 'pg-p0249-long-handler',
          correlationId
        })
        first = createPostgresContinuousWorker(
          workerEnv(x.roleUrl, x.schemaName, 'worker-p0249-long'),
          {
            handlers: {
              inboundProcess: () => ({ status: 'unused' }),
              messageOutbound: async () => {
                started.resolve()
                await gate.promise
                return { type: 'p0249.long_handler' }
              }
            },
            tuning: { ...tuning, concurrency: 1, leaseMs: 2_000 },
            heartbeatIntervalMs: 250
          }
        )
        first.worker.start()
        await started.promise
        const initialLease = await x.leaseUntil(event.id)
        const deadline = Date.now() + 5_000
        const intruderClaims: unknown[] = []
        while (Date.now() < deadline) {
          intruderClaims.push(
            await x.repository.claimNext({
              tenantId,
              workerId: 'worker-p0249-intruder',
              leaseMs: 2_000
            })
          )
          await delay(200)
        }
        expect(intruderClaims.filter(Boolean)).toEqual([])
        expect(await x.leaseUntil(event.id)).toBeGreaterThan(initialLease)
        expect(first.worker.metrics().heartbeats).toBeGreaterThanOrEqual(1)
        expect(first.worker.metrics().leaseLost).toBe(0)

        gate.resolve()
        await vi.waitFor(
          async () => {
            const record = await x.repository.findOutboxById(tenantId, event.id)
            expect(record).toMatchObject({ status: 'processed', attempts: 1 })
          },
          { timeout: 10_000, interval: 25 }
        )
        expect(await x.effectResult(event.id)).toEqual([
          { type: 'p0249.long_handler' }
        ])
      } finally {
        gate.resolve()
        await first?.worker.stop().catch(() => undefined)
        await first?.pool.end().catch(() => undefined)
        await x.close()
      }
    },
    60_000
  )
})
