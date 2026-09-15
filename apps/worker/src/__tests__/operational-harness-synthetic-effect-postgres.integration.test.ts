import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../../../api/src/server.ts'
import {
  assertOperationalHarnessPostgresPreflight,
  createOperationalHarnessWorker,
  OPERATIONAL_HARNESS_WORKER_RUNTIME
} from '../operational-harness-worker.ts'
import { OPERATIONAL_HARNESS_CRITICAL_TABLES } from '../postgres-role-preflight.ts'
import {
  PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
  PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION
} from '../phase2-synthetic-effect.ts'
import { runPostgresMigrations } from '@cvg/persistence'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenantId = 'tenant_00000000-0000-4000-8000-000000000926'
const otherTenantId = 'tenant_00000000-0000-4000-8000-000000000927'
const operationKey = 'phase2-r4-postgres-effect-operation'
const rolePassword = 'synthetic-r4-role-password'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.r4.postgres' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 2 PostgreSQL synthetic effect proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE2_SYNTHETIC_EFFECT_TOOL_ID],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_r4_postgres' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_r4_postgres' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_r4_postgres' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_r4_postgres' as RuntimeInput['traceId'],
    userMessage: 'phase 2 PostgreSQL synthetic effect proof',
    context: {
      values: { fixture: 'aaa-21-r4-postgres' },
      sourceIds: ['phase2-r4-postgres-effect'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-14T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    },
    requestedTool: {
      toolId: PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
      toolVersion: PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION,
      operationKey,
      input: { fixture: 'phase2-postgres' }
    }
  }
}

function roleUrl(username: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = rolePassword
  return parsed.toString()
}

describeWithPostgres(
  'AAA-21 R4 PostgreSQL synthetic effect vertical path',
  () => {
    it('persists HTTP acceptance, one journaled synthetic effect, replay, and status', async () => {
      const schema = `cvg_aaa21_r4_effect_${Date.now()}_${randomBytes(3).toString('hex')}`
      const role = `cvg_aaa21_r4_worker_${Date.now()}_${randomBytes(3).toString('hex')}`
      const workerId = `worker-phase2-r4-postgres-${Date.now()}`
      const admin = new Client({ connectionString: testDatabaseUrl as string })
      const apiPool = new Pool({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schema}`
      })
      let workerRuntime:
        | ReturnType<typeof createOperationalHarnessWorker>
        | undefined
      let app: Awaited<ReturnType<typeof buildServer>> | undefined
      let syntheticEffectCalls = 0

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
        workerRuntime = createOperationalHarnessWorker(
          {
            NODE_ENV: 'test',
            CVG_WORKER_CONTROLLED_MODE: 'true',
            CVG_WORKER_SYNTHETIC_EFFECT: 'true',
            CVG_WORKER_RUNTIME: OPERATIONAL_HARNESS_WORKER_RUNTIME,
            DATABASE_URL: roleUrl(role),
            POSTGRES_SCHEMA: schema,
            POSTGRES_RLS_ENFORCEMENT: 'true',
            CVG_WORKER_TENANT_ID: tenantId,
            CVG_WORKER_ID: workerId
          },
          {
            syntheticEffectObserver: () => {
              syntheticEffectCalls += 1
            }
          }
        )
        app = buildServer({
          persistence: { kind: 'postgres-pool', pool: apiPool }
        })
        await assertOperationalHarnessPostgresPreflight(workerRuntime)

        const payload = {
          idempotencyKey: `phase2-r4-postgres-${Date.now()}`,
          runtime: runtime()
        }
        const accepted = await app.inject({
          method: 'POST',
          url: '/v1/executions',
          headers: { 'x-tenant-id': tenantId },
          payload
        })
        expect(accepted.statusCode).toBe(202)
        const executionId = accepted.json().data.execution.id as string

        const processed = await workerRuntime.worker.processNext()
        expect(processed.kind).toBe('processed')
        if (processed.kind !== 'processed') return
        expect(processed.record.state).toBe('SUCCEEDED')

        const replay = await app.inject({
          method: 'POST',
          url: '/v1/executions',
          headers: { 'x-tenant-id': tenantId },
          payload
        })
        const status = await app.inject({
          method: 'GET',
          url: `/v1/executions/${executionId}`,
          headers: {
            'x-tenant-id': tenantId,
            'x-operator-id': 'operator.phase2.r4',
            'x-operator-role': 'Operator'
          }
        })
        const idle = await workerRuntime.worker.processNext()
        const journal = await workerRuntime.effectJournal?.get(
          tenantId,
          operationKey
        )
        const hiddenJournal = await workerRuntime.effectJournal?.get(
          otherTenantId,
          operationKey
        )
        const executionRows = await admin.query<{
          state: string
          attempt: number
        }>(
          `SELECT state, attempt FROM ${schema}.operational_executions WHERE tenant_id = $1 AND id = $2`,
          [tenantId, executionId]
        )
        const queueRows = await admin.query<{
          status: string
          attempts: number
        }>(
          `SELECT status, attempts FROM ${schema}.operational_execution_outbox WHERE tenant_id = $1 AND execution_id = $2`,
          [tenantId, executionId]
        )
        const eventRows = await admin.query<{ event_type: string }>(
          `SELECT event_type FROM ${schema}.operational_execution_events WHERE tenant_id = $1 AND execution_id = $2 ORDER BY sequence`,
          [tenantId, executionId]
        )
        const effectRows = await admin.query<{
          count: number
          state: string
        }>(
          `SELECT count(*)::int AS count, min(state) AS state FROM ${schema}.operational_effect_journal WHERE tenant_id = $1 AND operation_key = $2`,
          [tenantId, operationKey]
        )

        expect(replay.statusCode).toBe(202)
        expect(replay.json().data.created).toBe(false)
        expect(replay.json().data.execution.id).toBe(executionId)
        expect(status.statusCode).toBe(200)
        expect(status.json().data.state).toBe('SUCCEEDED')
        expect(status.json().data.result.toolResult.output).toEqual({
          fixture: 'phase2',
          applied: true
        })
        expect(idle).toEqual({ kind: 'idle' })
        expect(journal).toMatchObject({
          state: 'CONFIRMED',
          operationKey,
          attemptId: expect.any(String)
        })
        expect(hiddenJournal).toBeNull()
        expect(executionRows.rows).toEqual([{ state: 'SUCCEEDED', attempt: 1 }])
        expect(queueRows.rows).toEqual([{ status: 'processed', attempts: 1 }])
        expect(eventRows.rows.map((row) => row.event_type)).toEqual([
          'RECEIVED',
          'QUEUED',
          'CLAIMED',
          'RUNNING',
          'SUCCEEDED'
        ])
        expect(effectRows.rows).toEqual([{ count: 1, state: 'CONFIRMED' }])
        expect(syntheticEffectCalls).toBe(1)

        if (process.env.CVG_PHASE2_EVIDENCE === 'true') {
          console.info(
            JSON.stringify({
              event: 'phase2.r4.synthetic_effect_proof',
              executionId,
              workerId,
              finalState: status.json().data.state,
              journalState: journal?.state,
              effectRows: effectRows.rows,
              events: eventRows.rows.map((row) => row.event_type),
              duplicateCreated: replay.json().data.created,
              syntheticEffectCalls,
              externalEffects: false,
              database: 'disposable-postgresql'
            })
          )
        }
      } finally {
        await app?.close().catch(() => undefined)
        await workerRuntime?.close().catch(() => undefined)
        await apiPool.end().catch(() => undefined)
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
