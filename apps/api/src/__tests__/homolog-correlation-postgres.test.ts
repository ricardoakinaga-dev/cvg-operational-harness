/**
 * AUD19-009 — correlation without PII on the durable path.
 *
 * The decision response correlation id must match exactly one persisted
 * audit event, and that event must carry no secret, token, body or PII.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  runPostgresMigrations,
  type PostgresPoolLike
} from '@cvg/persistence'
import type { ApprovalRequestInput } from '@cvg/approval-engine'
import { buildServer } from '../server.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

const tenantA = 'tenant_00000000-0000-4000-8000-000000000341'

function runtimeInput() {
  return {
    agent: {
      id: 'agent.correlation.synthetic',
      version: 'v1',
      objective: 'correlation proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantA,
    conversationId: 'conversation_correlation_synthetic',
    sessionId: 'session_correlation_synthetic',
    correlationId: 'correlation_submission_synthetic',
    traceId: 'trace_correlation_synthetic',
    userMessage: 'synthetic HTTP message',
    context: {
      values: { fixture: true },
      sourceIds: ['synthetic'],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-13T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  } as never
}

describe('durable correlation without PII (AUD19-009)', () => {
  itWithPostgres(
    'binds the response correlation to one PII-free audit event',
    async () => {
      const admin = new Client({ connectionString: testDatabaseUrl as string })
      await admin.connect()
      const schemaName = `cvg_aud19_009_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
      let app: Awaited<ReturnType<typeof buildServer>> | undefined
      try {
        await runPostgresMigrations(admin, { schemaName })
        const pool = new Pool({
          connectionString: testDatabaseUrl as string,
          options: `-c search_path=${schemaName}`
        })
        const store = new PostgresOperationalExecutionStore(
          pool as unknown as PostgresPoolLike
        )
        const authority = new PostgresApprovalAuthority(
          pool as unknown as PostgresPoolLike
        )
        const accepted = await store.submit({
          tenantId: tenantA,
          idempotencyKey: `correlation-${Date.now()}`,
          runtime: runtimeInput()
        })
        const claimed = await store.claimNext(tenantA, 'worker-correlation')
        if (!claimed) throw new Error('claim failed')
        const running = await store.transition({
          tenantId: tenantA,
          executionId: accepted.record.id,
          to: 'RUNNING',
          workerId: 'worker-correlation',
          fenceToken: claimed.record.attempt
        })
        const request: ApprovalRequestInput = {
          tenantId: tenantA,
          operatorId: 'agent.correlation.synthetic',
          agentId: 'agent.correlation.synthetic',
          agentVersion: 'v1',
          action: 'tool.execute',
          resource: { type: 'tool', id: 'synthetic.correlation.tool' },
          payload: { synthetic: true },
          policyVersion: 'policy-approval-v1',
          correlationId: 'correlation_submission_synthetic',
          operationKey: `operation.correlation.${Date.now()}`,
          executionRef: accepted.record.id,
          singleUse: true,
          reason: 'correlation proof',
          proposalPayload: { synthetic: true }
        }
        const requested = await authority.request(request)
        await store.transition({
          tenantId: tenantA,
          executionId: accepted.record.id,
          to: 'WAITING_APPROVAL',
          workerId: 'worker-correlation',
          fenceToken: running.attempt,
          approvalId: requested.approvalId,
          reason: 'waiting for correlation proof'
        })
        app = buildServer({
          persistence: { kind: 'postgres', client: pool as never },
          operationalExecution: store as never,
          operationalApprovalAuthority: authority as never
        })
        const decision = await app.inject({
          method: 'POST',
          url: `/v1/executions/${accepted.record.id}/approvals/${requested.approvalId}/decision`,
          headers: {
            'x-tenant-id': tenantA,
            'x-operator-id': 'approver.synthetic',
            'x-operator-role': 'Approver',
            'idempotency-key': `correlation-cmd-${Date.now()}`
          },
          payload: { decision: 'approved' }
        })
        expect(decision.statusCode).toBe(202)
        const correlationId = decision.json().meta.correlationId as string
        expect(typeof correlationId).toBe('string')
        const events = await pool.query(
          `SELECT id, type, actor_id, correlation_id, payload
         FROM audit_events
         WHERE type = 'approval_decision' AND correlation_id = $1`,
          [correlationId]
        )
        expect(events.rows).toHaveLength(1)
        const serialized = JSON.stringify(events.rows[0])
        for (const forbidden of [
          'token',
          'secret',
          'password',
          'senderRef',
          'authorization',
          'Bearer'
        ]) {
          expect(serialized.toLowerCase()).not.toContain(forbidden)
        }
        await pool.end()
      } finally {
        await app?.close()
        await admin
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await admin.end().catch(() => undefined)
      }
    }
  )
})
