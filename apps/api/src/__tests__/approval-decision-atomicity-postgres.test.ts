/**
 * AUD19-003 — causal atomicity on durable PostgreSQL (fail-closed gate).
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
import { assertApprovalDecisionAuditDedupe, buildServer } from '../server.ts'
import { reconcileStuckApprovalDecisions } from '../../../worker/src/homolog-worker.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

const tenantA = 'tenant_00000000-0000-4000-8000-000000000711'

function runtimeInput() {
  return {
    agent: {
      id: 'agent.atomic.pg.synthetic',
      version: 'v1',
      objective: 'synthetic PG atomicity proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantA,
    conversationId: 'conversation_atomic_pg_synthetic',
    sessionId: 'session_atomic_pg_synthetic',
    correlationId: 'correlation_atomic_pg_synthetic',
    traceId: 'trace_atomic_pg_synthetic',
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

async function setupDatabase() {
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  const schemaName = `cvg_aud19_003_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
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

async function waitingFixture(
  store: PostgresOperationalExecutionStore,
  authority: PostgresApprovalAuthority,
  key: string
) {
  const runtime = runtimeInput()
  const accepted = await store.submit({
    tenantId: tenantA,
    idempotencyKey: key,
    runtime
  })
  const claimed = await store.claimNext(tenantA, `worker-${key}`)
  if (!claimed) throw new Error('claim failed')
  const running = await store.transition({
    tenantId: tenantA,
    executionId: accepted.record.id,
    to: 'RUNNING',
    workerId: `worker-${key}`,
    fenceToken: claimed.record.attempt
  })
  const request: ApprovalRequestInput = {
    tenantId: tenantA,
    operatorId: 'agent.atomic.pg.synthetic',
    agentId: 'agent.atomic.pg.synthetic',
    agentVersion: 'v1',
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.atomic.pg.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-approval-v1',
    correlationId: 'correlation_atomic_pg_synthetic',
    operationKey: `operation.atomic.pg.${key}`,
    executionRef: accepted.record.id,
    singleUse: true,
    reason: 'synthetic PG atomicity',
    proposalPayload: { synthetic: true }
  }
  const requested = await authority.request(request)
  await store.transition({
    tenantId: tenantA,
    executionId: accepted.record.id,
    to: 'WAITING_APPROVAL',
    workerId: `worker-${key}`,
    fenceToken: running.attempt,
    approvalId: requested.approvalId,
    reason: 'waiting for PG atomicity proof'
  })
  return { executionId: accepted.record.id, approvalId: requested.approvalId }
}

async function countDecisionEvents(
  pool: Pool,
  approvalId: string
): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM audit_events
     WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
    [approvalId]
  )
  return result.rows[0].count as number
}

function decisionHeaders(commandKey: string) {
  return {
    'x-tenant-id': tenantA,
    'x-operator-id': 'approver.synthetic',
    'x-operator-role': 'Approver',
    'idempotency-key': commandKey
  }
}

async function insertDuplicateDecisionEvents(client: Client): Promise<void> {
  const payload = JSON.stringify({
    approvalId: 'approval_legacy_duplicate',
    decision: 'approved'
  })
  await client.query(
    `INSERT INTO audit_events
       (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload)
     VALUES
       ($1, 'audit_legacy_duplicate_1', 'approval_decision', 'Approver', 'synthetic', 'correlation_legacy_1', 'policy-v1', $2::jsonb),
       ($1, 'audit_legacy_duplicate_2', 'approval_decision', 'Approver', 'synthetic', 'correlation_legacy_2', 'policy-v1', $2::jsonb)`,
    [tenantA, payload]
  )
}

describe('approval decision causal atomicity on PostgreSQL (AUD19-003)', () => {
  itWithPostgres('applies migration 0021 exactly-once guard', async () => {
    const setup = await setupDatabase()
    try {
      const indexes = await setup.pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uq_audit_approval_decision'`
      )
      // search_path is schema-scoped; pg_indexes reflects it via current_schemas.
      const scoped = await setup.pool.query(
        `SELECT indexname FROM pg_indexes WHERE indexname = 'uq_audit_approval_decision'`
      )
      expect(
        [...indexes.rows, ...scoped.rows].map((row) => row.indexname)
      ).toContain('uq_audit_approval_decision')
      await expect(
        assertApprovalDecisionAuditDedupe(setup.admin)
      ).resolves.toBeUndefined()
    } finally {
      await teardownDatabase(setup)
    }
  })

  itWithPostgres(
    'blocks migration 0021 when legacy duplicate decision keys exist',
    async () => {
      const setup = await setupDatabase()
      try {
        await setup.admin.query('DROP INDEX uq_audit_approval_decision')
        await setup.admin.query(
          `DELETE FROM schema_migrations
           WHERE version = '0021_approval_decision_audit_dedupe'`
        )
        await insertDuplicateDecisionEvents(setup.admin)

        await expect(
          runPostgresMigrations(setup.admin, {
            migrations: ['0021_approval_decision_audit_dedupe']
          })
        ).rejects.toThrow(
          'legacy duplicate approval_decision key groups prevent unique index creation'
        )

        const marker = await setup.admin.query(
          `SELECT 1 FROM schema_migrations
           WHERE version = '0021_approval_decision_audit_dedupe'`
        )
        expect(marker.rows).toHaveLength(0)
        await expect(
          setup.admin.query(
            `SELECT 1 FROM pg_indexes
             WHERE schemaname = current_schema()
               AND indexname = 'uq_audit_approval_decision'`
          )
        ).resolves.toMatchObject({ rows: [] })
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'rejects a valid-looking index with the wrong definition',
    async () => {
      const setup = await setupDatabase()
      try {
        await setup.admin.query('DROP INDEX uq_audit_approval_decision')
        await setup.admin.query(
          `CREATE INDEX uq_audit_approval_decision ON audit_events (id)`
        )
        await expect(
          assertApprovalDecisionAuditDedupe(setup.admin)
        ).rejects.toThrow('approval decision dedupe index')
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres('rejects an invalid and not-ready unique index', async () => {
    const setup = await setupDatabase()
    try {
      await setup.admin.query('DROP INDEX uq_audit_approval_decision')
      await insertDuplicateDecisionEvents(setup.admin)
      await expect(
        setup.admin.query(
          `CREATE UNIQUE INDEX CONCURRENTLY uq_audit_approval_decision
             ON audit_events (
               COALESCE(tenant_id, ''),
               (payload->>'approvalId'),
               (payload->>'decision')
             )
             WHERE type = 'approval_decision'`
        )
      ).rejects.toThrow()
      const catalog = await setup.admin.query<{
        indisvalid: boolean
        indisready: boolean
      }>(
        `SELECT i.indisvalid, i.indisready
           FROM pg_index AS i
           INNER JOIN pg_class AS index_relation
             ON index_relation.oid = i.indexrelid
           INNER JOIN pg_namespace AS index_namespace
             ON index_namespace.oid = index_relation.relnamespace
           WHERE index_namespace.nspname = current_schema()
             AND index_relation.relname = 'uq_audit_approval_decision'`
      )
      expect(catalog.rows).toHaveLength(1)
      expect(catalog.rows[0]?.indisvalid).toBe(false)
      expect(catalog.rows[0]?.indisready).toBe(false)
      await expect(
        assertApprovalDecisionAuditDedupe(setup.admin)
      ).rejects.toThrow('approval decision dedupe index')
    } finally {
      await teardownDatabase(setup)
    }
  })

  itWithPostgres(
    'converges concurrent applications of migration 0021',
    async () => {
      const setup = await setupDatabase()
      const concurrentAdmin = new Client({
        connectionString: testDatabaseUrl as string
      })
      await concurrentAdmin.connect()
      try {
        await setup.admin.query('DROP INDEX uq_audit_approval_decision')
        await setup.admin.query(
          `DELETE FROM schema_migrations
           WHERE version = '0021_approval_decision_audit_dedupe'`
        )
        const results = await Promise.allSettled([
          runPostgresMigrations(setup.admin, {
            schemaName: setup.schemaName,
            migrations: ['0021_approval_decision_audit_dedupe']
          }),
          runPostgresMigrations(concurrentAdmin, {
            schemaName: setup.schemaName,
            migrations: ['0021_approval_decision_audit_dedupe']
          })
        ])
        expect(results.every((result) => result.status === 'fulfilled')).toBe(
          true
        )
        const markers = await setup.admin.query(
          `SELECT version FROM schema_migrations
           WHERE version = '0021_approval_decision_audit_dedupe'`
        )
        expect(markers.rows).toHaveLength(1)
        await expect(
          assertApprovalDecisionAuditDedupe(setup.admin)
        ).resolves.toBeUndefined()
      } finally {
        await concurrentAdmin.end().catch(() => undefined)
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'retries converge with exactly one audit event after an injected crash',
    async () => {
      const setup = await setupDatabase()
      try {
        const store = new PostgresOperationalExecutionStore(
          setup.pool as unknown as PostgresPoolLike
        )
        const authority = new PostgresApprovalAuthority(
          setup.pool as unknown as PostgresPoolLike
        )
        const { executionId, approvalId } = await waitingFixture(
          store,
          authority,
          `pg-crash-${Date.now()}`
        )
        let resolveCalls = 0
        const realResolve = store.resolveApproval.bind(store)
        const flakyStore = new Proxy(store, {
          get(target, property, receiver) {
            if (property === 'resolveApproval') {
              return async (...args: never[]) => {
                resolveCalls += 1
                if (resolveCalls === 1) {
                  throw new Error('injected PG crash before resolve')
                }
                return Reflect.apply(realResolve, target, args) as never
              }
            }
            return Reflect.get(target, property, receiver)
          }
        })
        const app = buildServer({
          persistence: {
            kind: 'postgres',
            client: setup.pool as never
          },
          operationalExecution: flakyStore as never,
          operationalApprovalAuthority: authority as never
        })
        const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
        const first = await app.inject({
          method: 'POST',
          url,
          headers: decisionHeaders('pg-cmd-1'),
          payload: { decision: 'approved', note: 'synthetic approval' }
        })
        expect(first.statusCode).toBe(500)
        const retry = await app.inject({
          method: 'POST',
          url,
          headers: decisionHeaders('pg-cmd-1'),
          payload: { decision: 'approved', note: 'synthetic approval' }
        })
        await app.close()
        expect(retry.statusCode).toBe(202)
        expect(retry.json().data.execution.state).toBe('QUEUED')
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(1)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'identical concurrent decisions keep one winner and one audit event',
    async () => {
      const setup = await setupDatabase()
      try {
        const store = new PostgresOperationalExecutionStore(
          setup.pool as unknown as PostgresPoolLike
        )
        const authority = new PostgresApprovalAuthority(
          setup.pool as unknown as PostgresPoolLike
        )
        const { executionId, approvalId } = await waitingFixture(
          store,
          authority,
          `pg-concurrent-${Date.now()}`
        )
        const app = buildServer({
          persistence: {
            kind: 'postgres',
            client: setup.pool as never
          },
          operationalExecution: store as never,
          operationalApprovalAuthority: authority as never
        })
        const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
        const [first, second] = await Promise.all([
          app.inject({
            method: 'POST',
            url,
            headers: decisionHeaders('pg-cmd-2a'),
            payload: { decision: 'approved', note: 'synthetic approval' }
          }),
          app.inject({
            method: 'POST',
            url,
            headers: decisionHeaders('pg-cmd-2b'),
            payload: { decision: 'approved', note: 'synthetic approval' }
          })
        ])
        await app.close()
        expect(first.statusCode).toBe(202)
        expect(second.statusCode).toBe(202)
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(1)
        expect((await authority.get(tenantA, approvalId)).status).toBe(
          'APPROVED'
        )
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'worker recovery preserves the decision envelope after audit failure',
    async () => {
      const setup = await setupDatabase()
      const triggerName = `reject_audit_${Date.now()}`
      const functionName = `${triggerName}_fn`
      let triggerInstalled = false
      try {
        const store = new PostgresOperationalExecutionStore(
          setup.pool as unknown as PostgresPoolLike
        )
        const authority = new PostgresApprovalAuthority(
          setup.pool as unknown as PostgresPoolLike
        )
        const { executionId, approvalId } = await waitingFixture(
          store,
          authority,
          `pg-causality-${Date.now()}`
        )
        await setup.pool.query(`
          CREATE FUNCTION ${functionName}() RETURNS trigger
          LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.type = 'approval_decision' THEN
              RAISE EXCEPTION 'injected approval audit failure';
            END IF;
            RETURN NEW;
          END;
          $$
        `)
        await setup.pool.query(
          `CREATE TRIGGER ${triggerName}
             BEFORE INSERT ON audit_events
             FOR EACH ROW EXECUTE FUNCTION ${functionName}()`
        )
        triggerInstalled = true

        const app = buildServer({
          persistence: {
            kind: 'postgres',
            client: setup.pool as never
          },
          operationalExecution: store as never,
          operationalApprovalAuthority: authority as never
        })
        const first = await app.inject({
          method: 'POST',
          url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
          headers: decisionHeaders('pg-causality-command-1'),
          payload: { decision: 'approved', note: 'preserve this reason' }
        })
        await app.close()
        expect(first.statusCode).toBe(500)

        const approved = await authority.get(tenantA, approvalId)
        expect(approved).toMatchObject({
          status: 'APPROVED',
          approverId: 'approver.synthetic',
          decisionActorType: 'Approver',
          decisionReason: 'preserve this reason',
          decisionCommandKey: 'pg-causality-command-1'
        })
        expect(approved.decisionCorrelationId).toMatch(/^corr_/)
        expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(0)

        await setup.pool.query(`DROP TRIGGER ${triggerName} ON audit_events`)
        await setup.pool.query(`DROP FUNCTION ${functionName}()`)
        triggerInstalled = false

        const runtime = {
          approvalAuthority: authority,
          store,
          pool: setup.pool
        } as never
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime)
        ).resolves.toBe(1)
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime)
        ).resolves.toBe(0)
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(1)

        const event = await setup.pool.query<{
          actor_type: string
          actor_id: string
          correlation_id: string
          policy_version: string
          payload: Record<string, unknown>
        }>(
          `SELECT actor_type, actor_id, correlation_id, policy_version, payload
             FROM audit_events
            WHERE type = 'approval_decision'
              AND payload->>'approvalId' = $1`,
          [approvalId]
        )
        expect(event.rows[0]).toMatchObject({
          actor_type: 'Approver',
          actor_id: approved.approverId,
          correlation_id: approved.decisionCorrelationId,
          policy_version: approved.policyVersion,
          payload: {
            decision: 'approved',
            reason: 'preserve this reason',
            payloadHash: approved.payloadHash,
            commandKey: 'pg-causality-command-1',
            operationKey: approved.operationKey
          }
        })
      } finally {
        if (triggerInstalled) {
          await setup.pool
            .query(`DROP TRIGGER ${triggerName} ON audit_events`)
            .catch(() => undefined)
          await setup.pool
            .query(`DROP FUNCTION ${functionName}()`)
            .catch(() => undefined)
        }
        await teardownDatabase(setup)
      }
    }
  )
})
