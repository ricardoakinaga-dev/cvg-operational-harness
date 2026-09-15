import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  runPostgresMigrations,
  TenantScopedPostgresRuntimeRepository,
  withTenantContext
} from '@cvg/persistence'
import { WORKER_CRITICAL_TABLES } from '../postgres-role-preflight.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenantIdRaw = 'tenant_00000000-0000-4000-8000-000000000193'
const tenantId = TenantIdSchema.parse(tenantIdRaw)
const correlationId = 'corr_00000000-0000-4000-8000-000000000193'
const rolePassword = 'synthetic-entrypoint-role-password'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function roleUrl(username: string, password: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = password
  return parsed.toString()
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

function spawnEntrypoint(env: NodeJS.ProcessEnv): {
  child: ChildProcess
  output: () => string
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
  return { child, output: () => output }
}

function waitForExit(
  child: ChildProcess,
  timeoutMs = 30_000
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('entrypoint did not exit within the timeout'))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 20_000,
  intervalMs = 50
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await delay(intervalMs)
  }
  throw new Error('condition was not satisfied before the timeout')
}

async function countRows(
  pool: Pool,
  tenant: TenantId,
  table: 'outbox_effects' | 'outbox_attempts',
  eventId?: string
): Promise<number> {
  return withTenantContext(pool, tenant, async (client) => {
    const result = eventId
      ? await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table}
            WHERE tenant_id = $1 AND event_id = $2`,
          [tenantIdRaw, eventId]
        )
      : await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM ${table} WHERE tenant_id = $1`,
          [tenantIdRaw]
        )
    return Number(result.rows[0]?.count ?? 0)
  })
}

function entrypointEnv(
  role: string,
  schema: string,
  workerId: string
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: roleUrl(role, rolePassword),
    POSTGRES_SCHEMA: schema,
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: tenantIdRaw,
    CVG_WORKER_ID: workerId,
    CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
    CVG_WORKER_RUN_MODE: 'continuous',
    CVG_WORKER_POLL_INTERVAL_MS: '20',
    CVG_WORKER_IDLE_MAX_BACKOFF_MS: '100',
    CVG_WORKER_DRAIN_MS: '5000'
  }
}

describeWithPostgres(
  'AAA-19 continuous worker entrypoint over PostgreSQL',
  () => {
    it('consumes events around a restart and drains on a real SIGTERM without loss or duplication', async () => {
      const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
      const schema = `cvg_worker_sigterm_${suffix}`
      const role = `cvg_worker_sigterm_${suffix}`
      const admin = new Client({ connectionString: testDatabaseUrl as string })
      const pool = new Pool({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schema}`
      })
      let first: ReturnType<typeof spawnEntrypoint> | undefined
      let second: ReturnType<typeof spawnEntrypoint> | undefined

      await admin.connect()
      try {
        await runPostgresMigrations(admin, { schemaName: schema })
        await admin.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${WORKER_CRITICAL_TABLES.map(
            (table) => `${schema}.${table}`
          ).join(', ')} TO ${role}`
        )

        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const before = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'entrypoint-before-restart' },
          idempotencyKey: `entrypoint-sigterm-193-before-${suffix}`,
          correlationId
        })

        first = spawnEntrypoint(
          entrypointEnv(role, schema, `worker-entrypoint-sigterm-${suffix}-a`)
        )
        await waitFor(async () => {
          const record = await repository.findOutboxById(tenantId, before.id)
          return record?.status === 'processed'
        })
        expect(parseJsonLines(first.output())).toContainEqual(
          expect.objectContaining({ event: 'worker.continuous_ready' })
        )

        first.child.kill('SIGTERM')
        const firstExit = await waitForExit(first.child)
        const firstEvents = parseJsonLines(first.output())
        expect(firstExit).toEqual({ code: 0, signal: null })
        expect(firstEvents).toContainEqual(
          expect.objectContaining({
            event: 'worker.shutdown.started',
            signal: 'SIGTERM'
          })
        )
        expect(firstEvents).toContainEqual(
          expect.objectContaining({
            event: 'worker.stopped',
            drained: true,
            released: 0
          })
        )
        expect(firstEvents).toContainEqual(
          expect.objectContaining({
            event: 'worker.shutdown.completed',
            signal: 'SIGTERM',
            code: 0
          })
        )

        const after = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'entrypoint-after-restart' },
          idempotencyKey: `entrypoint-sigterm-193-after-${suffix}`,
          correlationId
        })
        second = spawnEntrypoint(
          entrypointEnv(role, schema, `worker-entrypoint-sigterm-${suffix}-b`)
        )
        await waitFor(async () => {
          const record = await repository.findOutboxById(tenantId, after.id)
          return record?.status === 'processed'
        })
        second.child.kill('SIGTERM')
        const secondExit = await waitForExit(second.child)
        expect(secondExit).toEqual({ code: 0, signal: null })

        const stored = await Promise.all(
          [before, after].map((event) =>
            repository.findOutboxById(tenantId, event.id)
          )
        )
        expect(stored.map((record) => record?.status)).toEqual([
          'processed',
          'processed'
        ])
        expect(await countRows(pool, tenantId, 'outbox_effects')).toBe(2)
        expect(
          await countRows(pool, tenantId, 'outbox_effects', before.id)
        ).toBe(1)
        expect(
          await countRows(pool, tenantId, 'outbox_effects', after.id)
        ).toBe(1)
        expect(await countRows(pool, tenantId, 'outbox_attempts')).toBe(2)
      } finally {
        first?.child.kill('SIGKILL')
        second?.child.kill('SIGKILL')
        await pool.end().catch(() => undefined)
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

    it('runs the role preflight before the first claim and leaves the queue untouched on rejection', async () => {
      const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
      const schema = `cvg_worker_preflight_gate_${suffix}`
      const role = `cvg_worker_preflight_gate_${suffix}`
      const admin = new Client({ connectionString: testDatabaseUrl as string })
      const pool = new Pool({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schema}`
      })
      let run: ReturnType<typeof spawnEntrypoint> | undefined

      await admin.connect()
      try {
        await runPostgresMigrations(admin, { schemaName: schema })
        await admin.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${WORKER_CRITICAL_TABLES.map(
            (table) => `${schema}.${table}`
          ).join(', ')} TO ${role}`
        )
        await admin.query(
          `CREATE POLICY synthetic_allow_all ON ${schema}.outbox_events FOR ALL USING (true) WITH CHECK (true)`
        )

        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const event = await repository.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: { fixture: 'entrypoint-preflight-rejection' },
          idempotencyKey: `entrypoint-preflight-193-${suffix}`,
          correlationId
        })

        run = spawnEntrypoint(
          entrypointEnv(role, schema, `worker-entrypoint-preflight-${suffix}`)
        )
        const exit = await waitForExit(run.child)
        const events = parseJsonLines(run.output())

        expect(exit).toEqual({ code: 1, signal: null })
        expect(events).not.toContainEqual(
          expect.objectContaining({ event: 'worker.continuous_ready' })
        )
        expect(events).toContainEqual(
          expect.objectContaining({
            event: 'worker.continuous_failed',
            code: 'continuous_worker_failed',
            message: expect.stringContaining(
              'tenant isolation policies are not verified'
            )
          })
        )

        const stored = await repository.findOutboxById(tenantId, event.id)
        expect(stored).toMatchObject({
          status: 'pending',
          attempts: 0,
          leaseOwner: null
        })
        expect(await countRows(pool, tenantId, 'outbox_effects')).toBe(0)
        expect(await countRows(pool, tenantId, 'outbox_attempts')).toBe(0)
      } finally {
        run?.child.kill('SIGKILL')
        await pool.end().catch(() => undefined)
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
