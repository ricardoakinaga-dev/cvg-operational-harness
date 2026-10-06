/**
 * AUD19-008 — durable homologation worker smoke (real processes, PG).
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  PostgresOperationalExecutionStore,
  runPostgresMigrations,
  type PostgresPoolLike
} from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import { OPERATIONAL_HARNESS_CRITICAL_TABLES } from '../postgres-role-preflight.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const describeWithPostgres = pgEnabled ? describe : describe.skip

const tenantIdRaw = 'tenant_00000000-0000-4000-8000-000000000931'
const tenantId = TenantIdSchema.parse(tenantIdRaw)
const rolePassword = 'synthetic-homolog-role-password'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.homolog.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Homologation durability fixture',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_homolog_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_homolog_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_homolog_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_homolog_synthetic' as RuntimeInput['traceId'],
    userMessage: 'homologation synthetic fixture',
    context: {
      values: { fixture: 'aud19-008' },
      sourceIds: ['homolog-smoke'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-13T00:00:00.000Z' },
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

function homologEnv(
  role: string,
  schema: string,
  workerId: string,
  options: {
    readonly faultAfterClaim?: boolean
    readonly maxEvents?: string
    readonly idleWaitMs?: number
    readonly sweepIntervalMs?: number
    readonly healthIntervalMs?: number
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
    CVG_WORKER_RUNTIME: 'operational-harness-homolog',
    CVG_HOMOLOG_SYNTHETIC_ONLY: 'true',
    CVG_WORKER_MAX_EVENTS: options.maxEvents ?? '10',
    CVG_WORKER_CONCURRENCY: '1',
    CVG_WORKER_LEASE_MS: '100',
    CVG_WORKER_IDLE_WAIT_MS: String(options.idleWaitMs ?? 2_000),
    CVG_WORKER_POLL_INTERVAL_MS: '10',
    CVG_HOMOLOG_SWEEP_INTERVAL_MS: String(options.sweepIntervalMs ?? 100),
    CVG_HOMOLOG_HEALTH_INTERVAL_MS: String(options.healthIntervalMs ?? 1_000)
  }
  delete env.CVG_WORKER_QUEUE_ADAPTER
  delete env.CVG_WORKER_RUN_MODE
  delete env.PHASE2_FAULT_POINT
  if (options.faultAfterClaim) {
    env.PHASE2_FAULT_POINT = 'AFTER_CLAIM'
  }
  return env
}

interface WorkerExit {
  code: number | null
  signal: NodeJS.Signals | null
}

function spawnWorker(env: NodeJS.ProcessEnv): {
  child: ChildProcess
  output(): string
  exit: Promise<WorkerExit>
} {
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
  worker: { child: ChildProcess; exit: Promise<WorkerExit> },
  timeoutMs = 30_000
): Promise<WorkerExit> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      worker.exit,
      new Promise<WorkerExit>((_, reject) => {
        timer = setTimeout(() => {
          worker.child.kill('SIGKILL')
          reject(new Error('homolog worker child did not exit in time'))
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
  timeoutMs = 20_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(20)
  }
  throw new Error('condition was not satisfied before the timeout')
}

function parseJsonLines(output: string): Array<Record<string, unknown>> {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('{'))
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, unknown>]
      } catch {
        return []
      }
    })
}

describeWithPostgres('homologation durable worker smoke (AUD19-008)', () => {
  it('reclaims a SIGKILLed claim in a second process with one terminal outcome', async () => {
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schema = `cvg_homolog_${suffix}`
    const role = `cvg_homolog_worker_${suffix}`
    const admin = new Client({ connectionString: testDatabaseUrl as string })
    const adminPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 2,
      options: `-c search_path=${schema}`
    })
    let interrupted: ReturnType<typeof spawnWorker> | undefined
    let recovery: ReturnType<typeof spawnWorker> | undefined
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
      await admin.query(
        `GRANT SELECT, INSERT ON ${schema}.audit_events TO ${role}`
      )
      await admin.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`
      )
      await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)

      const store = new PostgresOperationalExecutionStore(
        adminPool as unknown as PostgresPoolLike,
        { leaseMs: 100 }
      )
      const submitted = await store.submit({
        tenantId,
        idempotencyKey: `homolog-smoke-${suffix}`,
        runtime: runtime()
      })
      const workerA = `homolog-worker-a-${suffix}`
      const workerB = `homolog-worker-b-${suffix}`

      interrupted = spawnWorker(
        homologEnv(role, schema, workerA, { faultAfterClaim: true })
      )
      await waitFor(async () => {
        const snapshot = await admin.query(
          `SELECT state, lease_owner, attempt
             FROM ${schema}.operational_executions
            WHERE tenant_id = $1 AND id = $2`,
          [tenantIdRaw, submitted.record.id]
        )
        const row = snapshot.rows[0]
        return (
          row?.state === 'CLAIMED' &&
          row?.lease_owner === workerA &&
          Number(row?.attempt) === 1
        )
      })

      recovery = spawnWorker(homologEnv(role, schema, workerB))
      const interruptedExit = await waitForExit(interrupted)
      expect(
        interruptedExit.signal === 'SIGKILL' || interruptedExit.code === 137
      ).toBe(true)

      await waitFor(async () => {
        const snapshot = await admin.query(
          `SELECT state FROM ${schema}.operational_executions
            WHERE tenant_id = $1 AND id = $2`,
          [tenantIdRaw, submitted.record.id]
        )
        return snapshot.rows[0]?.state === 'SUCCEEDED'
      })
      const recoveryExit = await waitForExit(recovery)
      expect(recoveryExit).toEqual({ code: 0, signal: null })

      const lines = parseJsonLines(recovery.output())
      const readyIndex = lines.findIndex(
        (line) => line.event === 'worker.readiness' && line.status === 'ready'
      )
      const firstConsumptionIndex = lines.findIndex(
        (line) => line.event === 'worker.homolog_process_next'
      )
      expect(readyIndex).toBeGreaterThanOrEqual(0)
      expect(firstConsumptionIndex).toBeGreaterThan(readyIndex)
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: 'worker.homolog_ready',
          durable: true,
          externalEffects: false,
          syntheticOnly: true
        })
      )
      expect(
        lines.filter((line) => line.event === 'worker.homolog_sweep').length
      ).toBeGreaterThan(0)

      const completed = await admin.query(
        `SELECT state, attempt, lease_owner FROM ${schema}.operational_executions
          WHERE tenant_id = $1 AND id = $2`,
        [tenantIdRaw, submitted.record.id]
      )
      expect(completed.rows[0]).toMatchObject({
        state: 'SUCCEEDED',
        lease_owner: null
      })
      expect(Number(completed.rows[0].attempt)).toBe(2)
      const effects = await admin.query(
        `SELECT count(*)::int AS count FROM ${schema}.operational_effect_journal
          WHERE tenant_id = $1`,
        [tenantIdRaw]
      )
      expect(effects.rows[0].count).toBe(0)
    } finally {
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
      await adminPool.end().catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  })

  it('refuses to start without arming, database or outside homolog scope', async () => {
    const base: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
      CVG_WORKER_RUNTIME: 'operational-harness-homolog',
      CVG_WORKER_TENANT_ID: tenantIdRaw,
      CVG_WORKER_ID: 'homolog-refusal',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      DATABASE_URL: 'postgres://postgres:postgres@localhost:5434/cvg_test'
    }
    const withoutArming = spawnWorker({
      ...base,
      CVG_HOMOLOG_SYNTHETIC_ONLY: 'false'
    })
    expect(await waitForExit(withoutArming, 20_000)).toMatchObject({ code: 1 })
    expect(withoutArming.output()).toContain('worker.startup_failed')
    expect(withoutArming.output()).toContain('homolog_arming_required')

    const withoutDatabase = spawnWorker({
      ...base,
      CVG_HOMOLOG_SYNTHETIC_ONLY: 'true',
      DATABASE_URL: ''
    })
    expect(await waitForExit(withoutDatabase, 20_000)).toMatchObject({
      code: 1
    })
  })

  it('drains cleanly on SIGTERM with no work pending', async () => {
    if (!pgEnabled) return
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schema = `cvg_homolog_drain_${suffix}`
    const role = `cvg_homolog_drain_${suffix}`
    const admin = new Client({ connectionString: testDatabaseUrl as string })
    await admin.connect()
    let idle: ReturnType<typeof spawnWorker> | undefined
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
      await admin.query(
        `GRANT SELECT, INSERT ON ${schema}.audit_events TO ${role}`
      )
      await admin.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`
      )
      await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
      idle = spawnWorker(
        homologEnv(role, schema, `homolog-drain-${suffix}`, {
          maxEvents: '10',
          idleWaitMs: 60_000,
          sweepIntervalMs: 60_000,
          healthIntervalMs: 25
        })
      )
      await delay(1_500)
      idle.child.kill('SIGTERM')
      const exit = await waitForExit(idle, 20_000)
      expect(exit).toEqual({ code: 0, signal: null })
      const lines = parseJsonLines(idle.output())
      const notReadyIndex = lines.findIndex(
        (line) =>
          line.event === 'worker.readiness' && line.status === 'not_ready'
      )
      expect(lines).toContainEqual(
        expect.objectContaining({
          event: 'worker.homolog_health',
          healthy: true
        })
      )
      expect(notReadyIndex).toBeGreaterThanOrEqual(0)
      expect(
        lines
          .slice(notReadyIndex + 1)
          .some(
            (line) =>
              line.event === 'worker.readiness' && line.status === 'ready'
          )
      ).toBe(false)
      expect(lines).not.toContainEqual(
        expect.objectContaining({ event: 'worker.homolog_completed' })
      )
    } finally {
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  })
})
