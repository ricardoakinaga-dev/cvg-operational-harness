import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  PostgresOperationalExecutionStore,
  runPostgresMigrations
} from '@cvg/persistence'
import type { PostgresPoolLike } from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import { OPERATIONAL_HARNESS_CRITICAL_TABLES } from '../postgres-role-preflight.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenantIdRaw = 'tenant_00000000-0000-4000-8000-000000000923'
const tenantId = TenantIdSchema.parse(tenantIdRaw)
const rolePassword = 'synthetic-r3-role-password'

interface ExecutionSnapshot {
  state: string
  attempt: number
  lease_owner: string | null
  lease_until: Date | string | null
}

interface QueueSnapshot {
  status: string
  attempts: number
  lease_owner: string | null
  lease_until: Date | string | null
}

interface EventSnapshot {
  event_type: string
  worker_id: string | null
  attempt: number
  reason: string | null
}

interface WorkerExit {
  code: number | null
  signal: NodeJS.Signals | null
}

interface SpawnedWorker {
  child: ChildProcess
  output(): string
  exit: Promise<WorkerExit>
}

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.r3.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 2 process restart fixture',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_r3_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_r3_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_r3_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_r3_synthetic' as RuntimeInput['traceId'],
    userMessage: 'process restart synthetic fixture',
    context: {
      values: { fixture: 'aaa-21-r3' },
      sourceIds: ['phase2-r3-process-proof'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-14T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 0,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    }
  }
}

function roleUrl(username: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = rolePassword
  return parsed.toString()
}

function workerEnv(
  role: string,
  schema: string,
  workerId: string,
  options: {
    readonly faultAfterClaim?: boolean
    readonly idleWaitMs?: number
  } = {}
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: roleUrl(role),
    POSTGRES_SCHEMA: schema,
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: tenantIdRaw,
    CVG_WORKER_ID: workerId,
    CVG_WORKER_RUNTIME: 'operational-harness',
    CVG_WORKER_MAX_EVENTS: '1',
    CVG_WORKER_CONCURRENCY: '1',
    CVG_WORKER_LEASE_MS: '100',
    CVG_WORKER_IDLE_WAIT_MS: String(options.idleWaitMs ?? 0),
    CVG_WORKER_POLL_INTERVAL_MS: '10'
  }
  delete env.CVG_WORKER_QUEUE_ADAPTER
  delete env.CVG_WORKER_RUN_MODE
  delete env.PHASE2_FAULT_POINT
  if (options.faultAfterClaim) {
    env.PHASE2_FAULT_POINT = 'AFTER_CLAIM'
  }
  return env
}

function spawnWorker(env: NodeJS.ProcessEnv): SpawnedWorker {
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
  child.stdout?.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr?.on('data', (chunk) => {
    output += String(chunk)
  })
  const exit = new Promise<WorkerExit>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  return { child, output: () => output, exit }
}

async function waitForExit(
  worker: SpawnedWorker,
  timeoutMs = 30_000
): Promise<WorkerExit> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      worker.exit,
      new Promise<WorkerExit>((_, reject) => {
        timer = setTimeout(() => {
          worker.child.kill('SIGKILL')
          reject(new Error('operational worker child did not exit in time'))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 20_000,
  intervalMs = 20
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(intervalMs)
  }
  throw new Error('condition was not satisfied before the timeout')
}

async function readExecution(
  admin: Client,
  schema: string,
  executionId: string
): Promise<ExecutionSnapshot | undefined> {
  const result = await admin.query<ExecutionSnapshot>(
    `SELECT state, attempt, lease_owner, lease_until
       FROM ${schema}.operational_executions
      WHERE tenant_id = $1 AND id = $2`,
    [tenantIdRaw, executionId]
  )
  return result.rows[0]
}

async function readQueue(
  admin: Client,
  schema: string,
  executionId: string
): Promise<QueueSnapshot | undefined> {
  const result = await admin.query<QueueSnapshot>(
    `SELECT status, attempts, lease_owner, lease_until
       FROM ${schema}.operational_execution_outbox
      WHERE tenant_id = $1 AND execution_id = $2`,
    [tenantIdRaw, executionId]
  )
  return result.rows[0]
}

async function readEvents(
  admin: Client,
  schema: string,
  executionId: string
): Promise<EventSnapshot[]> {
  const result = await admin.query<EventSnapshot>(
    `SELECT event_type, worker_id, attempt, reason
       FROM ${schema}.operational_execution_events
      WHERE tenant_id = $1 AND execution_id = $2
      ORDER BY sequence ASC`,
    [tenantIdRaw, executionId]
  )
  return result.rows
}

describeWithPostgres(
  'AAA-21 R3 process-realistic operational worker durability',
  () => {
    it('reclaims a child-process claim after fault and completes with competing worker authority', async () => {
      const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
      const schema = `cvg_aaa21_r3_${suffix}`
      const role = `cvg_aaa21_r3_worker_${suffix}`
      const admin = new Client({ connectionString: testDatabaseUrl as string })
      const adminPool = new Pool({
        connectionString: testDatabaseUrl,
        max: 2,
        options: `-c search_path=${schema}`
      })
      let interrupted: SpawnedWorker | undefined
      let recovery: SpawnedWorker | undefined

      await admin.connect()
      try {
        await runPostgresMigrations(admin, { schemaName: schema })
        await admin.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}'
             NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${OPERATIONAL_HARNESS_CRITICAL_TABLES.map(
            (table) => `${schema}.${table}`
          ).join(', ')} TO ${role}`
        )
        await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)

        const store = new PostgresOperationalExecutionStore(
          adminPool as unknown as PostgresPoolLike,
          { leaseMs: 100 }
        )
        const submitted = await store.submit({
          tenantId,
          idempotencyKey: `phase2-r3-process-${suffix}`,
          runtime: runtime()
        })
        const workerA = `phase2-r3-worker-a-${suffix}`
        const workerB = `phase2-r3-worker-b-${suffix}`

        interrupted = spawnWorker(
          workerEnv(role, schema, workerA, { faultAfterClaim: true })
        )
        await waitFor(async () => {
          const snapshot = await readExecution(
            admin,
            schema,
            submitted.record.id
          )
          return (
            snapshot?.state === 'CLAIMED' &&
            snapshot.lease_owner === workerA &&
            snapshot.attempt === 1
          )
        })

        const claimed = await readExecution(admin, schema, submitted.record.id)
        expect(claimed).toMatchObject({
          state: 'CLAIMED',
          attempt: 1,
          lease_owner: workerA
        })
        expect(await readEvents(admin, schema, submitted.record.id)).toEqual([
          {
            event_type: 'RECEIVED',
            worker_id: null,
            attempt: 0,
            reason: null
          },
          {
            event_type: 'QUEUED',
            worker_id: null,
            attempt: 0,
            reason: 'submission_enqueued'
          },
          {
            event_type: 'CLAIMED',
            worker_id: workerA,
            attempt: 1,
            reason: 'worker_claimed'
          }
        ])

        // Start the second real process before the first child's lease expires;
        // its bounded idle poll makes the competing/recovery window observable.
        recovery = spawnWorker(
          workerEnv(role, schema, workerB, { idleWaitMs: 2_000 })
        )
        const interruptedExit = await waitForExit(interrupted)
        expect(
          interruptedExit.signal === 'SIGKILL' || interruptedExit.code === 137
        ).toBe(true)
        expect(parseJsonLines(interrupted.output())).not.toContainEqual(
          expect.objectContaining({ event: 'worker.operational_harness_ready' })
        )

        await waitFor(async () => {
          const snapshot = await readExecution(
            admin,
            schema,
            submitted.record.id
          )
          return snapshot?.state === 'SUCCEEDED'
        })
        const recoveryExit = await waitForExit(recovery)
        expect(recoveryExit).toEqual({ code: 0, signal: null })
        expect(parseJsonLines(recovery.output())).toContainEqual(
          expect.objectContaining({
            event: 'worker.operational_harness_ready',
            processed: 1,
            durable: true,
            externalEffects: false,
            idleWaitMs: 2000
          })
        )

        const completed = await readExecution(
          admin,
          schema,
          submitted.record.id
        )
        const queue = await readQueue(admin, schema, submitted.record.id)
        const events = await readEvents(admin, schema, submitted.record.id)
        const effects = await admin.query<{ count: number }>(
          `SELECT count(*)::int AS count
             FROM ${schema}.operational_effect_journal
            WHERE tenant_id = $1`,
          [tenantIdRaw]
        )

        expect(completed).toMatchObject({
          state: 'SUCCEEDED',
          attempt: 2,
          lease_owner: null,
          lease_until: null
        })
        expect(queue).toMatchObject({
          status: 'processed',
          attempts: 2,
          lease_owner: null,
          lease_until: null
        })
        expect(events.map((event) => event.event_type)).toEqual([
          'RECEIVED',
          'QUEUED',
          'CLAIMED',
          'RECOVERED',
          'CLAIMED',
          'RUNNING',
          'SUCCEEDED'
        ])
        expect(
          events.filter((event) => event.event_type === 'CLAIMED')
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ worker_id: workerA, attempt: 1 }),
            expect.objectContaining({ worker_id: workerB, attempt: 2 })
          ])
        )
        expect(
          events.filter((event) => event.event_type === 'SUCCEEDED')
        ).toHaveLength(1)
        expect(effects.rows[0]?.count).toBe(0)

        if (process.env.CVG_PHASE2_EVIDENCE === 'true') {
          console.info(
            JSON.stringify({
              event: 'phase2.r3.process_restart_proof',
              executionId: submitted.record.id,
              faultWorker: workerA,
              recoveryWorker: workerB,
              faultExit: interruptedExit,
              recoveryExit,
              final: completed,
              queue,
              events,
              effectCount: effects.rows[0]?.count ?? 0,
              processBoundary: 'child-process',
              database: 'disposable-postgresql-15',
              externalEffects: false
            })
          )
        }
      } finally {
        interrupted?.child.kill('SIGKILL')
        recovery?.child.kill('SIGKILL')
        await adminPool.end().catch(() => undefined)
        await admin
          .query(`DROP OWNED BY ${role} CASCADE`)
          .catch(() => undefined)
        await admin
          .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
          .catch(() => undefined)
        await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
        await admin.end().catch(() => undefined)
      }
    }, 90_000)
  }
)

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
