/**
 * AUD19-003 — causal atomicity on durable PostgreSQL (fail-closed gate).
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { randomUUID } from 'node:crypto'
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
import { grantCase } from './case-authorization-fixtures.ts'
import {
  reconcileStuckApprovalDecisions,
  STUCK_APPROVAL_DECISIONS_SQL,
  INCOHERENT_TERMINAL_COUNT_SQL
} from '../../../worker/src/homolog-worker.ts'

// SPEC 0272 fix: the worker waits 30 s before recovering; these tests recover at once.
const noFloor = {
  window: { minAgeSeconds: 0, maxAgeSeconds: null as number | null }
}

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

/**
 * Reproduces the state the pre-SPEC-0262 route could leave after a crash
 * between the decision and the audit append (decision persisted, execution
 * resolved, no `approval_decision` event). The route itself is now one
 * transaction and can no longer produce it; legacy rows can still exist, so
 * the worker recovery (SPEC 0272) is exercised on this state.
 */
async function leaveCrashedDecision(
  store: PostgresOperationalExecutionStore,
  authority: PostgresApprovalAuthority,
  input: {
    executionId: string
    approvalId: string
    commandKey: string
    reason: string
    approverId?: string
    verdict?: 'approved' | 'rejected'
  }
) {
  const approverId = input.approverId ?? 'approver.synthetic'
  const verdict = input.verdict ?? 'approved'
  await authority.submit(tenantA, input.approvalId, 'agent.atomic.pg.synthetic')
  const decision = {
    approverId,
    decisionActorType: 'Approver' as const,
    decisionCorrelationId: `corr_${randomUUID()}`,
    commandKey: input.commandKey,
    reason: input.reason
  }
  if (verdict === 'approved') {
    await authority.approve(tenantA, input.approvalId, decision)
  } else {
    await authority.reject(tenantA, input.approvalId, decision)
  }
  await store.resolveApproval({
    tenantId: tenantA,
    executionId: input.executionId,
    approvalId: input.approvalId,
    actorId: approverId,
    decision: verdict === 'approved' ? 'APPROVED' : 'REJECTED',
    reason: input.reason
  })
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

/**
 * SPEC0251 (§6 adjustment a): the fixture execution is created directly in
 * the store, so its independent case link is registered through the port and
 * the deciding Approver receives the grant before deciding.
 */
async function grantExecution(
  app: ReturnType<typeof buildServer>,
  executionId: string
) {
  await app.caseAuthority.registerExecutionLink(
    tenantA as never,
    executionId,
    {
      kind: 'independent',
      conversationId: 'conversation_atomic_pg_synthetic',
      sessionId: 'session_atomic_pg_synthetic'
    },
    true
  )
  await grantCase(app, {
    kind: 'independent_execution',
    resourceId: executionId,
    operatorId: 'approver.synthetic',
    role: 'Approver',
    tenantId: tenantA as never
  })
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
        const realResolve = store.resolveApprovalInTransaction.bind(store)
        const flakyStore = new Proxy(store, {
          get(target, property, receiver) {
            if (property === 'resolveApprovalInTransaction') {
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
            kind: 'postgres-pool',
            pool: setup.pool as never
          },
          operationalExecution: flakyStore as never,
          operationalApprovalAuthority: authority as never
        })
        await grantExecution(app, executionId)
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
            kind: 'postgres-pool',
            pool: setup.pool as never
          },
          operationalExecution: store as never,
          operationalApprovalAuthority: authority as never
        })
        await grantExecution(app, executionId)
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
    'SPEC 0262: an audit failure rolls the whole decision back; the retry decides once',
    async () => {
      const setup = await setupDatabase()
      const triggerName = `reject_audit_unit_${Date.now()}`
      const functionName = `${triggerName}_fn`
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
          `pg-unit-${Date.now()}`
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
        const app = buildServer({
          persistence: { kind: 'postgres-pool', pool: setup.pool as never },
          operationalExecution: store as never,
          operationalApprovalAuthority: authority as never
        })
        await grantExecution(app, executionId)
        const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
        const before = await authority.get(tenantA, approvalId)
        const first = await app.inject({
          method: 'POST',
          url,
          headers: decisionHeaders('pg-unit-command-1'),
          payload: { decision: 'approved', note: 'unit reason' }
        })
        expect(first.statusCode).toBe(500)
        // Nothing of the decision survived: approval, execution and audit.
        const after = await authority.get(tenantA, approvalId)
        expect(after.status).toBe(before.status)
        expect(after.approverId).toBeUndefined()
        expect((await store.get(tenantA, executionId))?.state).toBe(
          'WAITING_APPROVAL'
        )
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(0)
        await setup.pool.query(`DROP TRIGGER ${triggerName} ON audit_events`)
        await setup.pool.query(`DROP FUNCTION ${functionName}()`)
        const retry = await app.inject({
          method: 'POST',
          url,
          headers: decisionHeaders('pg-unit-command-2'),
          payload: { decision: 'approved', note: 'unit reason' }
        })
        await app.close()
        expect(retry.statusCode).toBe(202)
        expect(await countDecisionEvents(setup.pool, approvalId)).toBe(1)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'worker recovery preserves the decision envelope after audit failure',
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
          `pg-causality-${Date.now()}`
        )
        await leaveCrashedDecision(store, authority, {
          executionId,
          approvalId,
          commandKey: 'pg-causality-command-1',
          reason: 'preserve this reason'
        })

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

        const runtime = {
          approvalAuthority: authority,
          store,
          pool: setup.pool
        } as never
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime, noFloor)
        ).resolves.toBe(1)
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime, noFloor)
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
        await teardownDatabase(setup)
      }
    }
  )

  for (const advancedStatus of ['RESERVED', 'EXECUTING', 'EXECUTED']) {
    itWithPostgres(
      `AUD0625 F08: worker records the decision event after the approval advanced to ${advancedStatus} (SPEC 0272)`,
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
            `pg-f08-${advancedStatus}-${Date.now()}`
          )
          await leaveCrashedDecision(store, authority, {
            executionId,
            approvalId,
            commandKey: 'pg-f08-command-1',
            reason: 'f08 reason'
          })
          expect(await countDecisionEvents(setup.pool, approvalId)).toBe(0)

          // The execution advanced after the crash: the approval left APPROVED.
          await setup.pool.query(
            `UPDATE runtime_approvals SET status = $2 WHERE approval_id = $1`,
            [approvalId, advancedStatus]
          )
          const stateBefore = (await store.get(tenantA, executionId))?.state

          const runtime = {
            approvalAuthority: authority,
            store,
            pool: setup.pool
          } as never
          const ticks = await Promise.all([
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            ),
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            )
          ])
          expect(ticks.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1)
          await expect(
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            )
          ).resolves.toBe(0)
          expect(await countDecisionEvents(setup.pool, approvalId)).toBe(1)
          expect((await store.get(tenantA, executionId))?.state).toBe(
            stateBefore
          )

          const event = await setup.pool.query<{
            payload: Record<string, unknown>
          }>(
            `SELECT payload FROM audit_events
              WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
            [approvalId]
          )
          expect(event.rows[0]?.payload).toMatchObject({
            decision: 'approved',
            commandKey: 'pg-f08-command-1',
            recovered: true,
            observedApprovalStatus: advancedStatus
          })
        } finally {
          await teardownDatabase(setup)
        }
      }
    )
  }

  // SPEC 0272 review fixes (D9): age window, envelope filter, infra errors, plan.
  /**
   * Builds one waiting execution per tag, then decides every one of them with
   * the audit append failing (the crash), so no tag's resume re-queues an
   * execution another tag still has to claim.
   */
  async function crashedDecisions(
    setup: Awaited<ReturnType<typeof setupDatabase>>,
    tags: string[],
    decisionFor: (tag: string) => 'approved' | 'rejected' = () => 'approved'
  ) {
    const store = new PostgresOperationalExecutionStore(
      setup.pool as unknown as PostgresPoolLike
    )
    const authority = new PostgresApprovalAuthority(
      setup.pool as unknown as PostgresPoolLike
    )
    const waiting: Array<{
      tag: string
      executionId: string
      approvalId: string
    }> = []
    for (const tag of tags) {
      const fixture = await waitingFixture(
        store,
        authority,
        `pg-f08-${tag}-${Date.now()}`
      )
      waiting.push({ tag, ...fixture })
    }
    for (const item of waiting) {
      await leaveCrashedDecision(store, authority, {
        executionId: item.executionId,
        approvalId: item.approvalId,
        commandKey: `pg-f08-${item.tag}-command`,
        reason: 'f08 window',
        verdict: decisionFor(item.tag)
      })
    }
    return {
      items: waiting,
      runtime: {
        approvalAuthority: authority,
        store,
        pool: setup.pool
      } as never
    }
  }

  const age = (setup: { pool: Pool }, executionId: string, interval: string) =>
    setup.pool.query(
      `UPDATE operational_executions SET updated_at = now() - $2::interval WHERE id = $1`,
      [executionId, interval]
    )

  itWithPostgres(
    'AUD0625 F08 fix: wait floor of 30 s (fresh row left alone, aged row recovered)',
    async () => {
      const setup = await setupDatabase()
      try {
        const { items, runtime } = await crashedDecisions(setup, ['floor'])
        const fresh = items[0]!
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime)
        ).resolves.toBe(0)
        expect(await countDecisionEvents(setup.pool, fresh.approvalId)).toBe(0)
        await age(setup, fresh.executionId, '2 minutes')
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime)
        ).resolves.toBe(1)
        expect(await countDecisionEvents(setup.pool, fresh.approvalId)).toBe(1)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'AUD0625 F08 fix: default 24 h ceiling ignores old history; no ceiling (backfill) recovers it',
    async () => {
      const setup = await setupDatabase()
      try {
        const { items, runtime } = await crashedDecisions(setup, ['ceiling'])
        const old = items[0]!
        await age(setup, old.executionId, '48 hours')
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime)
        ).resolves.toBe(0)
        expect(await countDecisionEvents(setup.pool, old.approvalId)).toBe(0)
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime, {
            window: { minAgeSeconds: 30, maxAgeSeconds: null }
          })
        ).resolves.toBe(1)
        expect(await countDecisionEvents(setup.pool, old.approvalId)).toBe(1)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'AUD0625 F08 fix (N1): rows without the persisted envelope do not take the batch slots and are counted',
    async () => {
      const setup = await setupDatabase()
      try {
        const { items, runtime } = await crashedDecisions(setup, [
          'bad',
          'good'
        ])
        const [bad, good] = items as [(typeof items)[0], (typeof items)[0]]
        await setup.pool.query(
          `UPDATE runtime_approvals SET decision_command_key = NULL WHERE approval_id = $1`,
          [bad.approvalId]
        )
        await age(setup, bad.executionId, '10 minutes')
        await age(setup, good.executionId, '5 minutes')
        const counts: number[] = []
        const failures: Array<{ approvalId: string }> = []
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime, {
            limit: 1,
            onIncompleteEnvelope: (count) => counts.push(count),
            onRowFailed: (failure) => failures.push(failure)
          })
        ).resolves.toBe(1)
        // limit 1 and the oldest row is unrecoverable: it must not hold the slot.
        expect(await countDecisionEvents(setup.pool, good.approvalId)).toBe(1)
        expect(await countDecisionEvents(setup.pool, bad.approvalId)).toBe(0)
        expect(counts).toEqual([1])
        expect(failures).toEqual([])
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'AUD0625 F08 fix (N2): a server shutdown (57P01) in the middle of the loop fails the tick',
    async () => {
      const setup = await setupDatabase()
      try {
        const { items, runtime } = await crashedDecisions(setup, ['a', 'b'])
        for (const item of items)
          await age(setup, item.executionId, '5 minutes')
        const failing = {
          ...(runtime as unknown as Record<string, unknown>),
          approvalAuthority: {
            get: async () => {
              throw Object.assign(new Error('terminating connection'), {
                code: '57P01'
              })
            }
          }
        } as never
        await expect(
          reconcileStuckApprovalDecisions(setup.pool, tenantA, failing)
        ).rejects.toMatchObject({ code: '57P01' })
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  // SPEC 0274 (F08b): the approval ended FAILED or EXPIRED after a decision whose
  // event never reached the audit trail. Real rows: the decision goes through
  // the HTTP route (which persists approved_at/rejected_at), the audit append
  // fails, and only then the status moves to the terminal state.
  for (const [terminal, decision] of [
    ['FAILED', 'approved'],
    ['EXPIRED', 'approved'],
    ['EXPIRED', 'rejected']
  ] as const) {
    itWithPostgres(
      `AUD0625 F08b: worker records the ${decision} event of an approval that ended ${terminal}, once, under a concurrent retry (SPEC 0274)`,
      async () => {
        const setup = await setupDatabase()
        try {
          const tag = `term-${terminal.toLowerCase()}-${decision}`
          const { items, runtime } = await crashedDecisions(
            setup,
            [tag],
            () => decision
          )
          const item = items[0]!
          const timestamps = await setup.pool.query<{
            approved_at: Date | null
            rejected_at: Date | null
          }>(
            `SELECT approved_at, rejected_at FROM runtime_approvals WHERE approval_id = $1`,
            [item.approvalId]
          )
          expect(timestamps.rows[0]?.approved_at !== null).toBe(
            decision === 'approved'
          )
          expect(timestamps.rows[0]?.rejected_at !== null).toBe(
            decision === 'rejected'
          )
          await setup.pool.query(
            `UPDATE runtime_approvals SET status = $2 WHERE approval_id = $1`,
            [item.approvalId, terminal]
          )
          const store = (
            runtime as unknown as { store: PostgresOperationalExecutionStore }
          ).store
          const stateBefore = (await store.get(tenantA, item.executionId))
            ?.state

          const authority = new PostgresApprovalAuthority(
            setup.pool as unknown as PostgresPoolLike
          )
          const app = buildServer({
            persistence: { kind: 'postgres-pool', pool: setup.pool as never },
            operationalExecution: store as never,
            operationalApprovalAuthority: authority as never
          })
          // The retry is authorized for the execution's case: the route runs
          // the decision unit and must refuse the terminal approval itself.
          await app.caseAuthority.registerExecutionLink(
            tenantA as never,
            item.executionId,
            {
              kind: 'independent',
              conversationId: 'conversation_atomic_pg_synthetic',
              sessionId: 'session_atomic_pg_synthetic'
            },
            true
          )
          await grantCase(app, {
            kind: 'independent_execution',
            resourceId: item.executionId,
            operatorId: 'approver.f08.0',
            role: 'Approver',
            tenantId: tenantA as never
          })
          const retry = app.inject({
            method: 'POST',
            url: `/v1/executions/${item.executionId}/approvals/${item.approvalId}/decision`,
            headers: {
              ...decisionHeaders(`pg-f08-${tag}-command`),
              'x-operator-id': 'approver.f08.0'
            },
            payload: { decision, note: 'f08 window' }
          })
          const ticks = await Promise.all([
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            ),
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            ),
            retry.then(() => 0)
          ])
          await retry.then(() => app.close())
          expect(ticks[0]! + ticks[1]!).toBeGreaterThanOrEqual(0)
          await reconcileStuckApprovalDecisions(
            setup.pool,
            tenantA,
            runtime,
            noFloor
          )
          await expect(
            reconcileStuckApprovalDecisions(
              setup.pool,
              tenantA,
              runtime,
              noFloor
            )
          ).resolves.toBe(0)
          expect(await countDecisionEvents(setup.pool, item.approvalId)).toBe(1)
          const event = await setup.pool.query<{
            payload: Record<string, unknown>
          }>(
            `SELECT payload FROM audit_events
              WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
            [item.approvalId]
          )
          expect(event.rows[0]?.payload).toMatchObject({
            decision,
            recovered: true
          })
          // A terminal approval is never resumed (and is not resumed again).
          expect((await store.get(tenantA, item.executionId))?.state).toBe(
            stateBefore
          )
        } finally {
          await teardownDatabase(setup)
        }
      },
      180_000
    )
  }

  for (const [shape, status, setSql, counted] of [
    [
      'EXPIRED without any timestamp (expired undecided, silent)',
      'EXPIRED',
      `status = 'EXPIRED', approved_at = NULL, rejected_at = NULL`,
      []
    ],
    [
      'EXPIRED with both timestamps',
      'EXPIRED',
      `status = 'EXPIRED', rejected_at = approved_at`,
      [1]
    ],
    [
      'FAILED with rejected_at only',
      'FAILED',
      `status = 'FAILED', rejected_at = approved_at, approved_at = NULL`,
      [1]
    ],
    [
      'FAILED without approved_at',
      'FAILED',
      `status = 'FAILED', approved_at = NULL, rejected_at = NULL`,
      [1]
    ]
  ] as const) {
    itWithPostgres(
      `AUD0625 F08b: ${shape} stays out of the batch, is counted only when incoherent and does not hold back the next row (SPEC 0274)`,
      async () => {
        const setup = await setupDatabase()
        try {
          const { items, runtime } = await crashedDecisions(setup, [
            `bad-${status.toLowerCase()}-${counted.length}-${setSql.length}`,
            `ok-${status.toLowerCase()}-${counted.length}-${setSql.length}`
          ])
          const [bad, good] = items as [(typeof items)[0], (typeof items)[0]]
          await setup.pool.query(
            `UPDATE runtime_approvals SET ${setSql} WHERE approval_id = $1`,
            [bad.approvalId]
          )
          await setup.pool.query(
            `UPDATE runtime_approvals SET status = 'FAILED' WHERE approval_id = $1`,
            [good.approvalId]
          )
          await age(setup, bad.executionId, '10 minutes')
          await age(setup, good.executionId, '5 minutes')
          const incoherent: number[] = []
          const failures: Array<{ approvalId: string }> = []
          await expect(
            reconcileStuckApprovalDecisions(setup.pool, tenantA, runtime, {
              limit: 1,
              onIncoherentTerminal: (count) => incoherent.push(count),
              onRowFailed: (failure) => failures.push(failure)
            })
          ).resolves.toBe(1)
          // limit 1 and the oldest row has no coherent decision: it must not hold the slot.
          expect(await countDecisionEvents(setup.pool, good.approvalId)).toBe(1)
          expect(await countDecisionEvents(setup.pool, bad.approvalId)).toBe(0)
          expect(incoherent).toEqual(counted)
          expect(failures).toEqual([])
        } finally {
          await teardownDatabase(setup)
        }
      },
      180_000
    )
  }

  itWithPostgres(
    'AUD0625 F08b: plan of the selector with FAILED/EXPIRED rows on ~10k synthetic rows still uses uq_audit_approval_decision (SPEC 0274)',
    async () => {
      const setup = await setupDatabase()
      const client = await setup.pool.connect()
      try {
        const { items } = await crashedDecisions(setup, ['seed-f08b'])
        const seed = items[0]!
        await age(setup, seed.executionId, '10 minutes')
        const total = 10_000
        await client.query(
          `INSERT INTO runtime_approvals
             SELECT (jsonb_populate_record(NULL::runtime_approvals,
               to_jsonb(a) || jsonb_build_object(
                 'approval_id', 'synb_' || g,
                 'operation_key', 'synb_op_' || g))).*
             FROM runtime_approvals a, generate_series(1, $2::int) AS g
            WHERE a.approval_id = $1`,
          [seed.approvalId, total]
        )
        // A third FAILED, a third EXPIRED, the rest APPROVED; every seventh
        // carries a rejection instead of an approval; every thirteenth is undecided.
        await client.query(
          `UPDATE runtime_approvals SET
             status = CASE (substring(approval_id from 6)::int % 3)
                        WHEN 0 THEN 'FAILED' WHEN 1 THEN 'EXPIRED' ELSE status END,
             rejected_at = CASE WHEN substring(approval_id from 6)::int % 7 = 0
                                THEN approved_at ELSE rejected_at END,
             approved_at = CASE WHEN substring(approval_id from 6)::int % 7 = 0
                                  OR substring(approval_id from 6)::int % 13 = 0
                                THEN NULL ELSE approved_at END
           WHERE approval_id LIKE 'synb\\_%'`
        )
        await client.query(
          `INSERT INTO operational_executions
             SELECT (jsonb_populate_record(NULL::operational_executions,
               to_jsonb(e) || jsonb_build_object(
                 'id', 'synb_exec_' || g,
                 'approval_id', 'synb_' || g,
                 'idempotency_key', 'synb_key_' || g,
                 'updated_at', now() - (g || ' seconds')::interval))).*
             FROM operational_executions e, generate_series(1, $2::int) AS g
            WHERE e.id = $1`,
          [seed.executionId, total]
        )
        await client.query(
          `INSERT INTO audit_events
             (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           SELECT $1, 'synb_audit_' || g, 'approval_decision', 'Approver', 'synthetic',
                  'corr_synb_' || g, 'policy-v1',
                  jsonb_build_object('approvalId', 'synb_' || g, 'decision', 'approved')
             FROM generate_series(1, $2::int) AS g WHERE g % 2 = 0`,
          [tenantA, total]
        )
        await client.query('ANALYZE')
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantA
        ])
        const explain = async (
          settings: string,
          sql: string,
          params: unknown[]
        ) => {
          await client.query(settings)
          const plan = await client.query<{ 'QUERY PLAN': string }>(
            `EXPLAIN (ANALYZE, BUFFERS) ${sql}`,
            params
          )
          return plan.rows.map((row) => row['QUERY PLAN']).join('\n')
        }
        const natural = await explain(
          'RESET enable_seqscan',
          STUCK_APPROVAL_DECISIONS_SQL,
          [25, 30, 86_400]
        )
        const forced = await explain(
          'SET enable_seqscan = off',
          STUCK_APPROVAL_DECISIONS_SQL,
          [25, 30, 86_400]
        )
        const incoherentPlan = await explain(
          'RESET enable_seqscan',
          INCOHERENT_TERMINAL_COUNT_SQL,
          [30, 86_400]
        )
        const rows = await client.query(
          STUCK_APPROVAL_DECISIONS_SQL,
          [25, 30, 86_400]
        )
        const counted = await client.query<{ incoherent: number }>(
          INCOHERENT_TERMINAL_COUNT_SQL,
          [30, 86_400]
        )
        const out = process.env.F08B_EXPLAIN_OUT
        if (out) {
          const { writeFileSync } = await import('node:fs')
          writeFileSync(
            out,
            `-- ${total} synthetic approvals (1/3 FAILED, 1/3 EXPIRED, 1/7 rejected, 1/13 undecided), half with their event; window 30 s .. 24 h\n-- selector, natural plan\n${natural}\n\n-- selector, enable_seqscan = off (index availability)\n${forced}\n\n-- incoherent-terminal count, natural plan\n${incoherentPlan}\n`
          )
        }
        expect(forced).toContain('uq_audit_approval_decision')
        expect(rows.rows.length).toBe(25)
        expect(Number(counted.rows[0]?.incoherent)).toBeGreaterThan(0)
      } finally {
        client.release()
        await teardownDatabase(setup)
      }
    },
    180_000
  )

  itWithPostgres(
    'AUD0625 F08 fix: plan of the final selector on ~10k synthetic rows uses uq_audit_approval_decision',
    async () => {
      const setup = await setupDatabase()
      const client = await setup.pool.connect()
      try {
        const { items } = await crashedDecisions(setup, ['seed'])
        const seed = items[0]!
        await age(setup, seed.executionId, '10 minutes')
        const total = 10_000
        // Clone the real rows (jsonb keeps every NOT NULL column valid).
        await client.query(
          `INSERT INTO runtime_approvals
             SELECT (jsonb_populate_record(NULL::runtime_approvals,
               to_jsonb(a) || jsonb_build_object(
                 'approval_id', 'syn_' || g,
                 'operation_key', 'syn_op_' || g))).*
             FROM runtime_approvals a, generate_series(1, $2::int) AS g
            WHERE a.approval_id = $1`,
          [seed.approvalId, total]
        )
        await client.query(
          `INSERT INTO operational_executions
             SELECT (jsonb_populate_record(NULL::operational_executions,
               to_jsonb(e) || jsonb_build_object(
                 'id', 'syn_exec_' || g,
                 'approval_id', 'syn_' || g,
                 'idempotency_key', 'syn_key_' || g,
                 'updated_at', now() - (g || ' seconds')::interval))).*
             FROM operational_executions e, generate_series(1, $2::int) AS g
            WHERE e.id = $1`,
          [seed.executionId, total]
        )
        // Half already carry their decision event (what the NOT EXISTS skips).
        await client.query(
          `INSERT INTO audit_events
             (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           SELECT $1, 'syn_audit_' || g, 'approval_decision', 'Approver', 'synthetic',
                  'corr_syn_' || g, 'policy-v1',
                  jsonb_build_object('approvalId', 'syn_' || g, 'decision', 'approved')
             FROM generate_series(1, $2::int) AS g WHERE g % 2 = 0`,
          [tenantA, total]
        )
        await client.query('ANALYZE')
        await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantA
        ])
        const explain = async (settings: string) => {
          await client.query(settings)
          const plan = await client.query<{ 'QUERY PLAN': string }>(
            `EXPLAIN (ANALYZE, BUFFERS) ${STUCK_APPROVAL_DECISIONS_SQL}`,
            [25, 30, 86_400]
          )
          return plan.rows.map((row) => row['QUERY PLAN']).join('\n')
        }
        const natural = await explain('RESET enable_seqscan')
        const forced = await explain('SET enable_seqscan = off')
        const out = process.env.F08_EXPLAIN_OUT
        if (out) {
          const { writeFileSync } = await import('node:fs')
          writeFileSync(
            out,
            `-- ${total} synthetic approvals/executions, half with their event; window 30 s .. 24 h\n-- natural plan\n${natural}\n\n-- enable_seqscan = off (index availability)\n${forced}\n`
          )
        }
        expect(forced).toContain('uq_audit_approval_decision')
      } finally {
        client.release()
        await teardownDatabase(setup)
      }
    },
    // Seeding 10k rows plus two EXPLAIN ANALYZE runs exceeds the 15 s default
    // on the hosted runner (PR #32 REM21 bar); the plan is what is asserted.
    180_000
  )
})
