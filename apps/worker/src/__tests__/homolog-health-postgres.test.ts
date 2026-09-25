/**
 * AUD19-009 — homolog worker health against real dependencies.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { checkHomologHealth, workerHealth } from '../health.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip
const tenantA = 'tenant_00000000-0000-4000-8000-000000000351' as TenantId

describe('homolog worker health (AUD19-009)', () => {
  it('keeps a static liveness answer', () => {
    expect(workerHealth()).toEqual({ status: 'ok' })
  })

  itWithPostgres('reports healthy dependencies with queue depth', async () => {
    const admin = new Client({ connectionString: testDatabaseUrl as string })
    await admin.connect()
    const schemaName = `cvg_aud19_009_h_${Date.now()}`
    const pool = new Pool({
      connectionString: testDatabaseUrl as string,
      options: `-c search_path=${schemaName}`
    })
    try {
      await runPostgresMigrations(admin, { schemaName })
      const report = await checkHomologHealth(pool as never, tenantA, 5_000)
      expect(report.healthy).toBe(true)
      expect(report.checks).toContainEqual(
        expect.objectContaining({ name: 'database', status: 'ok' })
      )
      const queue = report.checks.find((check) => check.name === 'queue')
      expect(queue?.status).toBe('ok')
      expect(queue?.detail).toMatch(/pending execution/)
    } finally {
      await pool.end().catch(() => undefined)
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        .catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  })

  itWithPostgres('fails bounded when dependencies are down', async () => {
    const broken = {
      connect: async () => {
        throw new Error('synthetic pool outage')
      }
    }
    const started = Date.now()
    const report = await checkHomologHealth(broken as never, tenantA, 500)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(report.healthy).toBe(false)
    expect(report.checks).toHaveLength(2)
    expect(report.checks.every((check) => check.status === 'failed')).toBe(true)
  })

  it('reports synthetic healthy dependencies without requiring PostgreSQL', async () => {
    const query = async (text: string) => {
      if (text === 'SHOW search_path')
        return { rows: [{ search_path: 'public' }] }
      if (text.includes('COUNT(*) AS pending'))
        return { rows: [{ pending: '3' }] }
      return { rows: [] }
    }
    const pool = {
      connect: async () => ({
        query,
        release: () => undefined
      })
    }

    const report = await checkHomologHealth(pool as never, tenantA, 100)

    expect(report).toMatchObject({
      healthy: true,
      checks: [
        { name: 'database', status: 'ok', detail: 'round-trip succeeded' },
        { name: 'queue', status: 'ok', detail: '3 pending execution(s)' }
      ]
    })
  })

  it('keeps database and queue failures isolated and bounded', async () => {
    const databaseFailure = {
      connect: async () => {
        throw new Error('synthetic database outage')
      }
    }
    const failedDatabase = await checkHomologHealth(
      databaseFailure as never,
      tenantA,
      100
    )
    expect(failedDatabase.healthy).toBe(false)
    expect(failedDatabase.checks).toContainEqual(
      expect.objectContaining({
        name: 'database',
        status: 'failed',
        detail: 'synthetic database outage'
      })
    )
    expect(failedDatabase.checks).toContainEqual(
      expect.objectContaining({ name: 'queue', status: 'failed' })
    )

    const queueFailure = {
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
    const failedQueue = await checkHomologHealth(
      queueFailure as never,
      tenantA,
      100
    )
    expect(failedQueue.healthy).toBe(false)
    expect(failedQueue.checks).toContainEqual(
      expect.objectContaining({
        name: 'database',
        status: 'ok'
      })
    )
    expect(failedQueue.checks).toContainEqual(
      expect.objectContaining({
        name: 'queue',
        status: 'failed',
        detail: 'synthetic queue outage'
      })
    )

    const timeout = await checkHomologHealth(
      {
        connect: async () => new Promise(() => undefined)
      } as never,
      tenantA,
      1
    )
    expect(timeout.healthy).toBe(false)
    expect(timeout.checks.every((check) => check.status === 'failed')).toBe(
      true
    )
    expect(timeout.checks.map((check) => check.detail)).toEqual([
      'database timed out',
      'queue timed out'
    ])
  })
})
