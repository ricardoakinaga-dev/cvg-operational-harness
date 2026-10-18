// @vitest-environment node
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolvePublishedDurability,
  createPublishedProcessWorkerId
} from '../published-kernel-composition.ts'
import {
  createPostgresControlledWorker,
  createPostgresContinuousWorker,
  createControlledNoopHandlers
} from '../postgres-controlled.ts'

const env = {
  DATABASE_URL:
    'postgres://synthetic:synthetic@127.0.0.1:1/synthetic_no_connection',
  CVG_WORKER_PUBLISHED_DURABILITY: 'postgres-v1',
  CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
  CVG_WORKER_RUNTIME: 'published-agent',
  CVG_WORKER_CONTROLLED_MODE: 'true',
  POSTGRES_RLS_ENFORCEMENT: 'true',
  CVG_WORKER_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000217'
}

describe('SPEC217 strict published worker opt-in (no database connections)', () => {
  it('is disabled by default and rejects unknown profile/memory/runtime/production or TTL/concurrency overrides', () => {
    expect(resolvePublishedDurability({})).toBeUndefined()
    expect(resolvePublishedDurability(env)).toBe('postgres-v1')
    for (const override of [
      { CVG_WORKER_PUBLISHED_DURABILITY: 'future-v2' },
      { CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory' },
      { CVG_WORKER_RUNTIME: 'kernel' },
      { CVG_WORKER_RUNTIME: 'operational-harness' },
      { NODE_ENV: 'production', CVG_WORKER_PRODUCTION_ENABLED: 'true' },
      { CVG_WORKER_LEASE_MS: '1000' },
      { CVG_WORKER_CONCURRENCY: '2' },
      { CVG_WORKER_CONTROLLED_MODE: 'false' },
      { POSTGRES_RLS_ENFORCEMENT: 'false' }
    ])
      expect(() =>
        resolvePublishedDurability({ ...env, ...override })
      ).toThrow()
  })
  it('gives controlled/continuous separate process UUIDs, pool4/connect1000, and the same registry path', async () => {
    const once = createPostgresControlledWorker(env)
    const continuous = createPostgresContinuousWorker(env)
    try {
      expect(once.workerId).not.toBe(continuous.workerId)
      expect(once.workerId).toMatch(/^worker-published-postgres:[0-9a-f-]{36}$/)
      expect(once.pool.options.max).toBe(4)
      expect(continuous.pool.options.max).toBe(4)
      expect(once.pool.options.connectionTimeoutMillis).toBe(1000)
      expect(continuous.tuning.concurrency).toBe(1)
      expect(continuous.tuning.leaseMs).toBe(10_000)
      expect(once.claimExecutions?.acceptingClaims).toBe(true)
      expect(continuous.claimExecutions?.acceptingClaims).toBe(true)
    } finally {
      await once.claimExecutions?.stopAndDrain()
      await continuous.worker.stop()
      await Promise.all([once.pool.end(), continuous.pool.end()])
    }
  })
  it('refuses injected handlers and alternate heartbeat/tuning before opening resources', () => {
    expect(() =>
      createPostgresControlledWorker(env, createControlledNoopHandlers())
    ).toThrow('injected')
    expect(() =>
      createPostgresContinuousWorker(env, { heartbeatIntervalMs: 2_000 })
    ).toThrow('shared renewal')
    expect(() =>
      createPostgresContinuousWorker(env, { tuning: { leaseMs: 1_000 } })
    ).toThrow('lease10000')
    expect(() =>
      createPostgresContinuousWorker(env, { tuning: { concurrency: 2 } })
    ).toThrow('concurrency1')
  })
  it('unbound default preserves the existing pool and worker id path', async () => {
    const { CVG_WORKER_PUBLISHED_DURABILITY, ...unbound } = env
    expect(CVG_WORKER_PUBLISHED_DURABILITY).toBe('postgres-v1')
    const runtime = createPostgresControlledWorker(
      { ...unbound, CVG_WORKER_ID: 'existing-worker' },
      createControlledNoopHandlers()
    )
    try {
      expect(runtime.workerId).toBe('existing-worker')
      expect(runtime.claimExecutions).toBeUndefined()
      expect(runtime.pool.options.max).toBe(10)
    } finally {
      await runtime.pool.end()
    }
  })
  it('validates the process ID base before pool construction', () => {
    expect(createPublishedProcessWorkerId('synthetic')).toMatch(
      /^synthetic:[0-9a-f-]{36}$/
    )
    expect(() => createPublishedProcessWorkerId('x'.repeat(81))).toThrow('80')
    expect(() => createPublishedProcessWorkerId('x\ninvalid')).toThrow('safe')
  })
  it('the real entrypoint refuses a durability profile on memory before memory readiness or execution', async () => {
    const home = await mkdtemp(join(tmpdir(), 'pare217-memory-refusal-'))
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'apps/worker/src/main.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...env,
          PATH: '/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/local/bin:/usr/bin:/bin',
          HOME: home,
          TMPDIR: home,
          XDG_CONFIG_HOME: home,
          XDG_DATA_HOME: home,
          LANG: 'C.UTF-8',
          CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
          CVG_WORKER_CONTROLLED_SMOKE: 'true'
        },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    let output = ''
    child.stdout.on('data', (data) => {
      output += String(data)
      if (Buffer.byteLength(output) > 1048576) child.kill('SIGKILL')
    })
    child.stderr.on('data', (data) => {
      output += String(data)
      if (Buffer.byteLength(output) > 1048576) child.kill('SIGKILL')
    })
    const exited = new Promise<number | null>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', resolve)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), 10000)
    try {
      const code = await exited
      expect(code).toBe(1)
      expect(output).toContain('published_durability_invalid')
      expect(output).not.toContain('worker.controlled_ready')
      expect(output).not.toContain('worker.controlled_smoke_passed')
    } finally {
      clearTimeout(timer)
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL')
      await exited.catch(() => undefined)
      await rm(home, { recursive: true, force: true })
    }
  }, 15_000)
})
