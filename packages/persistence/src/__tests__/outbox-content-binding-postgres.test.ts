/**
 * AUD19-004 — outbox idempotency bound to content on durable PostgreSQL.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  PostgresRuntimeRepository,
  runPostgresMigrations
} from '../postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

const tenantA = 'tenant_00000000-0000-4000-8000-000000000311'

function input(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: tenantA,
    type: 'synthetic.message',
    payload: { channel: 'web', urgent: true },
    idempotencyKey: `outbox-binding-pg-${overrides.keySuffix ?? '1'}`,
    envelopeVersion: 1,
    ...overrides
  } as never
}

async function setupDatabase() {
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  const schemaName = `cvg_aud19_004_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  await runPostgresMigrations(admin, { schemaName })
  const pool = new Pool({
    connectionString: testDatabaseUrl as string,
    options: `-c search_path=${schemaName}`
  })
  return { admin, pool, schemaName }
}

async function teardownDatabase(setup: {
  admin: Client
  pool: Pool
  schemaName: string
}) {
  await setup.pool.end().catch(() => undefined)
  await setup.admin
    .query(`DROP SCHEMA IF EXISTS ${setup.schemaName} CASCADE`)
    .catch(() => undefined)
  await setup.admin.end().catch(() => undefined)
}

describe('outbox content binding on PostgreSQL (AUD19-004)', () => {
  itWithPostgres(
    'returns the same record for an identical replay across instances',
    async () => {
      const setup = await setupDatabase()
      try {
        const firstRepo = new PostgresRuntimeRepository(setup.pool as never)
        const first = await firstRepo.enqueue(input({ keySuffix: 'replay' }))
        // Restart-equivalent: a fresh repository over the same database.
        const secondRepo = new PostgresRuntimeRepository(setup.pool as never)
        const second = await secondRepo.enqueue(input({ keySuffix: 'replay' }))
        expect(second.id).toBe(first.id)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'rejects divergent type/payload/version without mutating the winner',
    async () => {
      const setup = await setupDatabase()
      try {
        const repo = new PostgresRuntimeRepository(setup.pool as never)
        const first = await repo.enqueue(input({ keySuffix: 'divergent' }))
        await expect(
          repo.enqueue(
            input({ keySuffix: 'divergent', type: 'synthetic.other' })
          )
        ).rejects.toMatchObject({ code: 'conflict' })
        await expect(
          repo.enqueue(
            input({
              keySuffix: 'divergent',
              payload: { channel: 'whatsapp', urgent: true }
            })
          )
        ).rejects.toMatchObject({ code: 'conflict' })
        await expect(
          repo.enqueue(input({ keySuffix: 'divergent', envelopeVersion: 2 }))
        ).rejects.toMatchObject({ code: 'conflict' })
        const winner = await repo.findOutboxById(tenantA as never, first.id)
        expect(winner?.id).toBe(first.id)
        expect(winner?.type).toBe('synthetic.message')
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'lets one concurrent divergent writer win and rejects the other',
    async () => {
      const setup = await setupDatabase()
      try {
        const repo = new PostgresRuntimeRepository(setup.pool as never)
        const keySuffix = `race-${Date.now()}`
        const outcomes = await Promise.allSettled([
          repo.enqueue(
            input({ keySuffix, payload: { channel: 'web', urgent: true } })
          ),
          repo.enqueue(
            input({ keySuffix, payload: { channel: 'whatsapp', urgent: true } })
          )
        ])
        const fulfilled = outcomes.filter(
          (outcome) => outcome.status === 'fulfilled'
        )
        const rejected = outcomes.filter(
          (outcome) => outcome.status === 'rejected'
        )
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect((rejected[0] as PromiseRejectedResult).reason?.code).toBe(
          'conflict'
        )
      } finally {
        await teardownDatabase(setup)
      }
    }
  )
})
