import { createHmac, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, Pool } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  PostgresWorkerOperations,
  runPostgresMigrations,
  TenantScopedPostgresRuntimeRepository
} from '@cvg/persistence'
import {
  createStopAlertMonitor,
  createWebhookStopAlertDelivery,
  type StopAlertNotification
} from '@cvg/observability'
import {
  createControlledNoopHandlers,
  createPostgresContinuousWorker,
  type PostgresContinuousWorkerRuntime
} from '../postgres-controlled.ts'
import type { WorkerTelemetry } from '../worker-observability.ts'

/**
 * PROD-0373 — barra 0373, condições 9 ("alguém sabe quando quebra") e 10
 * ("botão de desligar") contra PostgreSQL real, migração 0027, dados
 * sintéticos e um receptor HTTP local.
 */

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const tenantIdRaw = 'tenant_00000000-0000-4000-8000-000000000373'
const tenantId = TenantIdSchema.parse(tenantIdRaw)
const correlationId = 'corr_00000000-0000-4000-8000-000000000373'
const SECRET = 'synthetic-stop-alert-secret-0373-xxxxxxxx'
const tuning = {
  pollIntervalMs: 5,
  leaseMs: 1_000,
  drainMs: 5_000,
  summaryIntervalMs: 1_000
} as const

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

function recordingTelemetry(): { telemetry: WorkerTelemetry; logs: string[] } {
  const logs: string[] = []
  return {
    logs,
    telemetry: {
      log(event) {
        logs.push(event)
      },
      metric() {}
    }
  }
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

/** Local receiver that only accepts correctly signed notifications. */
async function startReceiver() {
  const received: StopAlertNotification[] = []
  const rejected: string[] = []
  const server = createServer((request, response) => {
    void readBody(request).then((body) => {
      const timestamp = String(request.headers['x-cvg-alert-timestamp'] ?? '')
      const expected = createHmac('sha256', SECRET)
        .update(`${timestamp}.${body}`)
        .digest('hex')
      if (request.headers['x-cvg-alert-signature'] !== expected) {
        rejected.push(body)
        response.writeHead(401).end()
        return
      }
      received.push(JSON.parse(body) as StopAlertNotification)
      response.writeHead(204).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}/alerts`,
    received,
    rejected,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

describe('PROD-0373 worker operations on PostgreSQL', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'condição 10: paused worker claims nothing, keeps pending work and drains it after resume',
    async () => {
      const databaseUrl = testDatabaseUrl as string
      const schemaName = `cvg_worker_ops_${Date.now()}_${randomBytes(3).toString('hex')}`
      const migrationClient = new Client({ connectionString: databaseUrl })
      const pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`
      })
      let runtime: PostgresContinuousWorkerRuntime | undefined
      await migrationClient.connect()
      try {
        await runPostgresMigrations(migrationClient, { schemaName })
        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const operations = new PostgresWorkerOperations(pool)
        await operations.setPaused(tenantId, {
          paused: true,
          actor: 'operator.synthetic',
          reason: 'synthetic drill'
        })
        const events = await Promise.all(
          [1, 2].map((n) =>
            repository.enqueue({
              tenantId,
              type: 'message.outbound',
              payload: { fixture: `paused-${n}` },
              idempotencyKey: `pg-worker-ops-paused-${n}`,
              correlationId
            })
          )
        )
        const { telemetry, logs } = recordingTelemetry()
        runtime = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-ops-373-a'),
          {
            handlers: createControlledNoopHandlers(),
            tuning,
            telemetry,
            operationsIntervalMs: 50
          }
        )
        runtime.worker.start()
        await vi.waitFor(() => expect(logs).toContain('worker.paused'), {
          timeout: 5_000,
          interval: 25
        })
        await delay(300)
        for (const event of events) {
          const record = await repository.findOutboxById(tenantId, event.id)
          expect(record?.status).toBe('pending')
          expect(record?.attempts ?? 0).toBe(0)
        }
        expect(runtime.worker.metrics().claimed).toBe(0)

        await operations.setPaused(tenantId, {
          paused: false,
          actor: 'operator.synthetic'
        })
        await vi.waitFor(
          async () => {
            for (const event of events) {
              const record = await repository.findOutboxById(tenantId, event.id)
              expect(record?.status).toBe('processed')
            }
          },
          { timeout: 10_000, interval: 25 }
        )
        expect(logs).toContain('worker.resumed')
        await vi.waitFor(
          async () => {
            const status = await operations.status(tenantId)
            expect(status.workers[0]).toMatchObject({
              workerId: 'worker-ops-373-a',
              processed: 2
            })
            expect(status.workers[0]?.lastProgressAt).not.toBeNull()
          },
          { timeout: 5_000, interval: 25 }
        )
      } finally {
        await runtime?.worker.stop()
        await runtime?.pool.end()
        await migrationClient
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await migrationClient.end()
        await pool.end()
      }
    },
    30_000
  )

  itWithPostgres(
    'condição 9: a stopped worker and a stalled queue reach a signed receiver, and both clear',
    async () => {
      const databaseUrl = testDatabaseUrl as string
      const schemaName = `cvg_worker_alert_${Date.now()}_${randomBytes(3).toString('hex')}`
      const migrationClient = new Client({ connectionString: databaseUrl })
      const pool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`
      })
      const receiver = await startReceiver()
      let runtime: PostgresContinuousWorkerRuntime | undefined
      await migrationClient.connect()
      try {
        await runPostgresMigrations(migrationClient, { schemaName })
        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const operations = new PostgresWorkerOperations(pool)
        const monitor = createStopAlertMonitor({
          tenantId: tenantIdRaw,
          read: () => operations.status(tenantId),
          deliver: createWebhookStopAlertDelivery({
            url: receiver.url,
            secret: SECRET
          }),
          thresholds: { workerStaleMs: 400, queueStalledMs: 400 }
        })

        runtime = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-ops-373-b'),
          {
            handlers: createControlledNoopHandlers(),
            tuning,
            operationsIntervalMs: 50
          }
        )
        runtime.worker.start()
        await vi.waitFor(
          async () =>
            expect((await operations.status(tenantId)).workers).toHaveLength(1),
          { timeout: 5_000, interval: 25 }
        )
        expect(await monitor.check()).toEqual([])

        // Induced stop: the worker goes away while work keeps arriving.
        await runtime.worker.stop()
        await runtime.pool.end()
        runtime = undefined
        const stranded = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'stranded' },
          idempotencyKey: 'pg-worker-ops-stranded',
          correlationId
        })
        await delay(700)
        await monitor.check()
        expect(receiver.rejected).toEqual([])
        expect(
          receiver.received.map((n) => `${n.code}:${n.state}`).sort()
        ).toEqual(['queue_stalled:firing', 'worker_down:firing'])
        expect(receiver.received.every((n) => n.tenantId === tenantIdRaw)).toBe(
          true
        )
        // A second check does not repeat an open incident.
        await monitor.check()
        expect(receiver.received).toHaveLength(2)

        runtime = createPostgresContinuousWorker(
          workerEnv(databaseUrl, schemaName, 'worker-ops-373-c'),
          {
            handlers: createControlledNoopHandlers(),
            tuning,
            operationsIntervalMs: 50
          }
        )
        runtime.worker.start()
        await vi.waitFor(
          async () => {
            const record = await repository.findOutboxById(
              tenantId,
              stranded.id
            )
            expect(record?.status).toBe('processed')
          },
          { timeout: 10_000, interval: 25 }
        )
        await vi.waitFor(
          async () => {
            await monitor.check()
            expect(monitor.open()).toEqual([])
          },
          { timeout: 5_000, interval: 50 }
        )
        expect(
          receiver.received
            .filter((n) => n.state === 'resolved')
            .map((n) => n.code)
            .sort()
        ).toEqual(['queue_stalled', 'worker_down'])
      } finally {
        await runtime?.worker.stop()
        await runtime?.pool.end()
        await receiver.close()
        await migrationClient
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await migrationClient.end()
        await pool.end()
      }
    },
    30_000
  )
})
