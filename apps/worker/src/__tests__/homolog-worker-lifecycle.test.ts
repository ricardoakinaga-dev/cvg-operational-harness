import { spawn } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  assertHomologHealthPreflight,
  DEFAULT_HOMOLOG_HEALTH_INTERVAL_MS,
  DEFAULT_HOMOLOG_SWEEP_INTERVAL_MS,
  parseHomologConfig
} from '../homolog-worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000906'
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

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://synthetic.invalid/cvg',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: tenantId,
    CVG_HOMOLOG_SYNTHETIC_ONLY: 'true'
  }
}

describe('homolog worker lifecycle gates', () => {
  it('uses an independent health interval and rejects unsafe startup config', () => {
    expect(parseHomologConfig(baseEnv())).toEqual({
      tenantId,
      sweepIntervalMs: DEFAULT_HOMOLOG_SWEEP_INTERVAL_MS,
      healthIntervalMs: DEFAULT_HOMOLOG_HEALTH_INTERVAL_MS
    })
    expect(() =>
      parseHomologConfig({ ...baseEnv(), POSTGRES_RLS_ENFORCEMENT: 'false' })
    ).toThrow(/POSTGRES_RLS_ENFORCEMENT/)
    expect(() =>
      parseHomologConfig({ ...baseEnv(), CVG_WORKER_CONTROLLED_MODE: 'false' })
    ).toThrow(/CVG_WORKER_CONTROLLED_MODE/)
    expect(() =>
      parseHomologConfig({
        ...baseEnv(),
        CVG_HOMOLOG_HEALTH_INTERVAL_MS: '0'
      })
    ).toThrow(/CVG_HOMOLOG_HEALTH_INTERVAL_MS/)
  })

  it('blocks readiness when the database or queue health probe fails', async () => {
    const brokenPool = {
      connect: async () => {
        throw new Error('synthetic database outage')
      }
    }

    await expect(
      assertHomologHealthPreflight(brokenPool as never, tenantId, 25)
    ).rejects.toThrow(/health preflight failed.*database:failed/)

    const queueFailurePool = {
      connect: async () => ({
        query: async (text: string) => {
          if (text === 'SHOW search_path')
            return { rows: [{ search_path: 'public' }] }
          if (text.includes('COUNT(*) AS pending')) {
            throw new Error('synthetic queue outage')
          }
          return { rows: [] }
        },
        release: () => undefined
      })
    }

    await expect(
      assertHomologHealthPreflight(queueFailurePool as never, tenantId, 25)
    ).rejects.toThrow(/health preflight failed.*queue:failed/)
  })

  it('fails the real process before ready when PostgreSQL is unavailable', async () => {
    const child = spawn(
      path.resolve('node_modules/.bin/tsx'),
      ['apps/worker/src/main.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_URL: 'postgres://synthetic:synthetic@127.0.0.1:1/cvg',
          PGCONNECT_TIMEOUT: '1',
          POSTGRES_RLS_ENFORCEMENT: 'true',
          CVG_WORKER_CONTROLLED_MODE: 'true',
          CVG_WORKER_TENANT_ID: tenantId,
          CVG_WORKER_RUNTIME: 'operational-harness-homolog',
          CVG_HOMOLOG_SYNTHETIC_ONLY: 'true',
          CVG_WORKER_MAX_EVENTS: '1',
          CVG_WORKER_IDLE_WAIT_MS: '10',
          CVG_WORKER_POLL_INTERVAL_MS: '1'
        },
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
    const exit = await new Promise<{ code: number | null }>(
      (resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve({ code }))
      }
    )

    expect(exit.code).toBe(1)
    expect(output).toContain('worker.homolog_failed')
    expect(output).not.toContain('"event":"worker.homolog_ready"')
    expect(output).not.toContain('"status":"ready"')
  }, 15_000)

  it('emits controlled-memory readiness before the drain result', async () => {
    const child = spawn(
      path.resolve('node_modules/.bin/tsx'),
      ['apps/worker/src/main.ts'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
          CVG_WORKER_TENANT_ID: tenantId,
          CVG_WORKER_CONTROLLED_SMOKE: 'true'
        },
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
    const exit = await new Promise<{ code: number | null }>(
      (resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code) => resolve({ code }))
      }
    )

    const lines = parseJsonLines(output)
    const readyIndex = lines.findIndex(
      (line) => line.event === 'worker.readiness' && line.status === 'ready'
    )
    const controlledReadyIndex = lines.findIndex(
      (line) => line.event === 'worker.controlled_ready'
    )
    const completedIndex = lines.findIndex(
      (line) => line.event === 'worker.controlled_smoke_passed'
    )
    expect(exit.code).toBe(0)
    expect(readyIndex).toBeGreaterThanOrEqual(0)
    expect(controlledReadyIndex).toBeGreaterThan(readyIndex)
    expect(completedIndex).toBeGreaterThan(controlledReadyIndex)
  }, 15_000)
})
