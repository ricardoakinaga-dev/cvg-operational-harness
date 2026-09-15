import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  OperationalExecutionError,
  type ExecutionSubmission
} from '@cvg/harness'
import { PostgresOperationalExecutionStore } from '../operational-execution-postgres.ts'
import { readPostgresMigrationSql, runPostgresMigrations } from '../postgres.ts'
import type { PostgresPoolLike } from '../tenant-scoped-postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenantA = 'tenant_00000000-0000-4000-8000-00000000b201'
const tenantB = 'tenant_00000000-0000-4000-8000-00000000b202'

function runtime(tenantId: string): RuntimeInput {
  return {
    agent: {
      id: 'agent.pg.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic postgres execution',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_pg_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_pg_synthetic' as RuntimeInput['sessionId'],
    correlationId: 'correlation_pg_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_pg_synthetic' as RuntimeInput['traceId'],
    userMessage: 'postgres synthetic fixture',
    context: {
      values: { fixture: true },
      sourceIds: ['postgres-fixture'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: {
      version: 1,
      values: {},
      updatedAt: '2026-09-14T00:00:00.000Z'
    },
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

function submission(
  idempotencyKey: string,
  tenantId = tenantA
): ExecutionSubmission {
  return { tenantId, idempotencyKey, runtime: runtime(tenantId) }
}

describe('operational execution migration artifact', () => {
  it('ships bounded retry and state invariants as additive SQL', async () => {
    const migration = await readPostgresMigrationSql(
      '0018_operational_execution_invariants'
    )
    expect(migration).toContain('operational_executions_success_payload')
    expect(migration).toContain('operational_executions_failure_payload')
    expect(migration).toContain('operational_executions_retry_failure_kind')
    expect(migration).toContain('operational_executions_cancel_failure_kind')
    expect(migration).toContain('operational_executions_inactive_lease_clear')
    expect(migration).toContain(
      'operational_executions_completed_timestamp_shape'
    )
    expect(migration).toContain("failure ->> 'kind'")
  })
})

describeWithPostgres('PostgreSQL operational execution authority', () => {
  const schema = `cvg_aaa21_r2_${Date.now()}_${randomBytes(3).toString('hex')}`
  let admin: Client
  let pool: Pool

  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = new Pool({
      connectionString: testDatabaseUrl,
      max: 4,
      options: `-c search_path=${schema}`
    })
  })

  afterAll(async () => {
    if (!testDatabaseUrl) return
    await pool?.end().catch(() => undefined)
    await admin
      ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  it('survives a new pool, fences claims, and dead-letters retry exhaustion', async () => {
    const store = new PostgresOperationalExecutionStore(
      pool as unknown as PostgresPoolLike,
      { maxAttempts: 2, retryDelayMs: 1 }
    )
    const now = new Date('2026-09-14T01:00:00.000Z')
    const submitted = await store.submit(submission('pg-retry-bound'), now)
    const duplicate = await store.submit(submission('pg-retry-bound'), now)
    expect(duplicate.created).toBe(false)
    expect(duplicate.record.id).toBe(submitted.record.id)
    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'CLAIMED',
        workerId: 'pg-direct-claim'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const claims = await Promise.all([
      store.claimNext(tenantA, 'pg-worker-a', now),
      store.claimNext(tenantA, 'pg-worker-b', now)
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const first = claims.find(Boolean)!
    await store.transition(
      {
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'RUNNING',
        workerId: first.record.leaseOwner ?? 'pg-worker-a',
        fenceToken: first.record.attempt
      },
      now
    )
    const firstFailure = await store.transition(
      {
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'FAILED_RETRYABLE',
        workerId: first.record.leaseOwner ?? 'pg-worker-a',
        fenceToken: first.record.attempt,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'synthetic_timeout',
          message: 'synthetic retryable failure',
          retryAt: now.toISOString()
        }
      },
      now
    )
    expect(firstFailure.state).toBe('FAILED_RETRYABLE')

    const second = await store.claimNext(tenantA, 'pg-worker-restarted', now)
    expect(second?.record.attempt).toBe(2)
    await store.transition(
      {
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'RUNNING',
        workerId: 'pg-worker-restarted',
        fenceToken: second!.record.attempt
      },
      now
    )
    const terminal = await store.transition(
      {
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'FAILED_RETRYABLE',
        workerId: 'pg-worker-restarted',
        fenceToken: second!.record.attempt,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'synthetic_timeout',
          message: 'synthetic retryable failure',
          retryAt: now.toISOString()
        }
      },
      now
    )
    expect(terminal.state).toBe('FAILED_TERMINAL')
    expect(terminal.failure?.code).toBe('retry_exhausted')

    const freshPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 1,
      options: `-c search_path=${schema}`
    })
    try {
      const restartedStore = new PostgresOperationalExecutionStore(
        freshPool as unknown as PostgresPoolLike
      )
      expect(
        (await restartedStore.get(tenantA, submitted.record.id))?.state
      ).toBe('FAILED_TERMINAL')
      const events = await restartedStore.listEvents(
        tenantA,
        submitted.record.id
      )
      expect(events.map((event) => event.type)).toContain('FAILED_TERMINAL')
      const outbox = await admin.query<{ status: string }>(
        `SELECT status FROM ${schema}.operational_execution_outbox
          WHERE tenant_id = $1 AND execution_id = $2`,
        [tenantA, submitted.record.id]
      )
      expect(outbox.rows[0]?.status).toBe('dead_letter')
    } finally {
      await freshPool.end()
    }
  })

  it('enforces tenant visibility and safe cancellation at the durable boundary', async () => {
    const store = new PostgresOperationalExecutionStore(
      pool as unknown as PostgresPoolLike
    )
    const submitted = await store.submit(
      submission('pg-cancel-safe'),
      new Date()
    )
    expect(await store.get(tenantB, submitted.record.id)).toBeNull()

    const cancelled = await store.cancel({
      tenantId: tenantA,
      executionId: submitted.record.id,
      actorId: 'operator.pg.synthetic'
    })
    expect(cancelled.state).toBe('CANCELLED')
    expect(await store.claimNext(tenantA, 'pg-after-cancel')).toBeNull()

    const active = await store.submit(
      submission('pg-cancel-active'),
      new Date()
    )
    const claim = await store.claimNext(tenantA, 'pg-active')
    await store.transition({
      tenantId: tenantA,
      executionId: active.record.id,
      to: 'RUNNING',
      workerId: 'pg-active',
      fenceToken: claim!.record.attempt
    })
    await expect(
      store.cancel({
        tenantId: tenantA,
        executionId: active.record.id,
        actorId: 'operator.pg.synthetic'
      })
    ).rejects.toBeInstanceOf(OperationalExecutionError)
  })
})
