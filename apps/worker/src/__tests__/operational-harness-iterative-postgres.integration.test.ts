import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  PostgresExecutionStepStore,
  runPostgresMigrations
} from '@cvg/persistence'
import { buildServer } from '../../../api/src/server.ts'
import {
  assertOperationalHarnessPostgresPreflight,
  createOperationalHarnessWorker
} from '../operational-harness-worker.ts'
import { OPERATIONAL_HARNESS_CRITICAL_TABLES } from '../postgres-role-preflight.ts'
import {
  PHASE3_TOOL_AVAILABILITY,
  PHASE3_TOOL_RESERVE
} from '../phase3-synthetic-agent.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenantId = 'tenant_00000000-0000-4000-8000-000000000933'
const otherTenantId = 'tenant_00000000-0000-4000-8000-000000000934'
const rolePassword = 'synthetic-phase3-role-password'

function runtime(profile: 'iterative' = 'iterative'): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.phase3.postgres' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 3 PostgreSQL iterative proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE3_TOOL_AVAILABILITY, PHASE3_TOOL_RESERVE],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_phase3_postgres' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_phase3_postgres' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_phase3_postgres' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_phase3_postgres' as RuntimeInput['traceId'],
    userMessage: 'phase 3 PostgreSQL iterative proof',
    context: {
      values: { fixture: 'phase3-postgres' },
      sourceIds: ['phase3-postgres'],
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-15T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30_000,
      maxCostUsd: 1,
      maxTokens: 4_000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    },
    runtimeProfile: profile
  }
}

function roleUrl(username: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = rolePassword
  return parsed.toString()
}

describeWithPostgres('Phase 3 PostgreSQL iterative runtime durability', () => {
  it('persists steps/checkpoints, isolates tenants, and resumes WAITING_USER on a fresh pool', async () => {
    const schema = `cvg_phase3_iterative_${Date.now()}_${randomBytes(3).toString('hex')}`
    const role = `cvg_phase3_worker_${Date.now()}_${randomBytes(3).toString('hex')}`
    const admin = new Client({ connectionString: testDatabaseUrl as string })
    const apiPool = new Pool({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schema}`
    })
    let firstRuntime:
      | ReturnType<typeof createOperationalHarnessWorker>
      | undefined
    let secondRuntime:
      | ReturnType<typeof createOperationalHarnessWorker>
      | undefined
    let app: Awaited<ReturnType<typeof buildServer>> | undefined
    const observed: string[] = []

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

      const env = {
        NODE_ENV: 'test',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_SYNTHETIC_EFFECT: 'true',
        DATABASE_URL: roleUrl(role),
        POSTGRES_SCHEMA: schema,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_RUNTIME_PROFILE: 'iterative',
        CVG_WORKER_ITERATIVE_SCENARIO: 'waiting_user',
        CVG_WORKER_ID: `worker-phase3-pg-${Date.now()}`
      }
      firstRuntime = createOperationalHarnessWorker(env, {
        syntheticEffectObserver: (context) =>
          observed.push(context.operationKey ?? '')
      })
      const stepStore = new PostgresExecutionStepStore(apiPool as never)
      app = buildServer({
        persistence: { kind: 'postgres-pool', pool: apiPool },
        executionSteps: stepStore
      })
      await assertOperationalHarnessPostgresPreflight(firstRuntime)

      const key = `phase3-pg-${Date.now()}`
      const accepted = await app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: { 'x-tenant-id': tenantId },
        payload: { idempotencyKey: key, runtime: runtime() }
      })
      expect(accepted.statusCode).toBe(202)
      const executionId = accepted.json().data.execution.id as string

      const paused = await firstRuntime.worker.processNext()
      expect(paused.kind).toBe('processed')
      if (paused.kind !== 'processed') return
      expect(paused.record.state).toBe('WAITING_USER')
      expect(observed).toHaveLength(0)

      const checkpointRows = await admin.query<{
        step_number: number
        runtime_version: string
        digest: string
      }>(
        `SELECT step_number, runtime_version, digest
             FROM ${schema}.operational_execution_checkpoints
            WHERE tenant_id = $1 AND execution_id = $2`,
        [tenantId, executionId]
      )
      expect(checkpointRows.rows).toHaveLength(1)
      expect(checkpointRows.rows[0]?.runtime_version).toBe('2.0.0')
      expect(checkpointRows.rows[0]?.digest).toHaveLength(64)

      const stepRows = await admin.query<{ step_type: string; status: string }>(
        `SELECT step_type, status
             FROM ${schema}.operational_execution_steps
            WHERE tenant_id = $1 AND execution_id = $2
            ORDER BY step_number ASC`,
        [tenantId, executionId]
      )
      expect(stepRows.rows).toEqual([
        { step_type: 'USER_INPUT', status: 'WAITING' }
      ])

      const hiddenSteps = await stepStore.listSteps(otherTenantId, executionId)
      const hiddenCheckpoint = await stepStore.loadCheckpoint(
        otherTenantId,
        executionId
      )
      expect(hiddenSteps).toEqual([])
      expect(hiddenCheckpoint).toBeNull()

      // Restart-equivalent: close the first worker pool and rebuild it.
      await firstRuntime.close()
      firstRuntime = undefined
      secondRuntime = createOperationalHarnessWorker(
        {
          ...env,
          CVG_WORKER_ID: `worker-phase3-pg-restart-${Date.now()}`
        },
        {
          syntheticEffectObserver: (context) =>
            observed.push(context.operationKey ?? '')
        }
      )
      await assertOperationalHarnessPostgresPreflight(secondRuntime)

      const provided = await app.inject({
        method: 'POST',
        url: `/v1/executions/${executionId}/input`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'operator.phase3',
          'x-operator-role': 'Operator'
        },
        payload: { message: '2026-10-01' }
      })
      expect(provided.statusCode).toBe(202)
      expect(provided.json().data.resume).toBe('user_input')

      const completed = await secondRuntime.worker.processNext()
      expect(completed.kind).toBe('processed')
      if (completed.kind !== 'processed') return
      expect(completed.record.state).toBe('SUCCEEDED')
      expect(completed.record.result?.steps).toBeGreaterThanOrEqual(3)
      expect(observed).toHaveLength(1)

      const trajectory = await app.inject({
        method: 'GET',
        url: `/v1/executions/${executionId}/trajectory`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'operator.phase3',
          'x-operator-role': 'Operator'
        }
      })
      expect(trajectory.statusCode).toBe(200)
      const steps = trajectory.json().data.trajectory.steps as Array<{
        stepType: string
      }>
      expect(steps.map((step) => step.stepType)).toEqual([
        'USER_INPUT',
        'TOOL',
        'RESPOND'
      ])

      const effectRows = await admin.query<{ state: string; count: number }>(
        `SELECT state, count(*)::int AS count
             FROM ${schema}.operational_effect_journal
            WHERE tenant_id = $1 AND operation_key LIKE $2
            GROUP BY state`,
        [tenantId, `%${PHASE3_TOOL_RESERVE}`]
      )
      expect(effectRows.rows).toEqual([{ state: 'CONFIRMED', count: 1 }])

      if (process.env.CVG_PHASE3_EVIDENCE === 'true') {
        console.info(
          JSON.stringify({
            event: 'phase3.postgres.iterative_proof',
            executionId,
            finalState: completed.record.state,
            steps: steps.map((step) => step.stepType),
            journalRows: effectRows.rows,
            externalEffects: false,
            database: 'disposable-postgresql'
          })
        )
      }
    } finally {
      await app?.close().catch(() => undefined)
      await firstRuntime?.close().catch(() => undefined)
      await secondRuntime?.close().catch(() => undefined)
      await apiPool.end().catch(() => undefined)
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  }, 120_000)
})
