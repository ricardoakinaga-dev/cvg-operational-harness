/**
 * SPEC 0317 G1 on PostgreSQL, through HTTP and the real worker: the human who
 * submitted an execution cannot approve it. Each negative compares a snapshot
 * of every durable surface a decision could touch. Synthetic data only.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention).
 */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PostgresApprovalAuthority,
  PostgresExecutionStepStore,
  PostgresOperationalExecutionStore,
  runPostgresMigrations,
  type PostgresPoolLike
} from '@cvg/persistence'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../server.ts'
import {
  grantCase,
  managerHeaders,
  putAssignment
} from './case-authorization-fixtures.ts'
import {
  assertOperationalHarnessPostgresPreflight,
  createOperationalHarnessWorker
} from '../../../worker/src/operational-harness-worker.ts'
import { OPERATIONAL_HARNESS_CRITICAL_TABLES } from '../../../worker/src/postgres-role-preflight.ts'
import {
  PHASE3_TOOL_AVAILABILITY,
  PHASE3_TOOL_RESERVE
} from '../../../worker/src/phase3-synthetic-agent.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenantId = 'tenant_00000000-0000-4000-8000-000000000e17'
const otherTenantId = 'tenant_00000000-0000-4000-8000-000000000e18'
const rolePassword = 'synthetic-g1-role-password'

/** Removes the 0039 objects, as a rollback to the backup before it would. */
const ROLLBACK_0039 = `
  DROP TRIGGER IF EXISTS operational_executions_submitted_by_immutable ON operational_executions;
  DROP FUNCTION IF EXISTS cvg_operational_executions_submitted_by_immutable();
  DROP TRIGGER IF EXISTS runtime_approvals_requested_by_immutable ON runtime_approvals;
  DROP FUNCTION IF EXISTS cvg_runtime_approvals_requested_by_immutable();
  ALTER TABLE operational_executions
    DROP CONSTRAINT IF EXISTS operational_executions_submitted_by_check,
    DROP COLUMN IF EXISTS submitted_by_kind,
    DROP COLUMN IF EXISTS submitted_by_id,
    DROP COLUMN IF EXISTS submitted_by_tenant_id;
  ALTER TABLE runtime_approvals
    DROP CONSTRAINT IF EXISTS runtime_approvals_requested_by_check,
    DROP COLUMN IF EXISTS requested_by_kind,
    DROP COLUMN IF EXISTS requested_by_id,
    DROP COLUMN IF EXISTS requested_by_tenant_id,
    DROP COLUMN IF EXISTS requester_binding;
  DELETE FROM schema_migrations WHERE version = '0039_requester_principal';`

function runtime(tenant: string = tenantId): RuntimeInput {
  return {
    agent: {
      id: 'agent.g1.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'SPEC 0317 G1 proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE3_TOOL_AVAILABILITY, PHASE3_TOOL_RESERVE],
      policies: ['synthetic-only']
    },
    tenantId: tenant as RuntimeInput['tenantId'],
    conversationId:
      'conversation_g1_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_g1_synthetic' as RuntimeInput['sessionId'],
    correlationId: 'correlation_g1_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_g1_synthetic' as RuntimeInput['traceId'],
    userMessage: 'SPEC 0317 G1 synthetic proof',
    context: {
      values: { fixture: 'spec-0317-g1' },
      sourceIds: ['spec-0317-g1'],
      capturedAt: '2026-11-06T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-11-06T00:00:00.000Z' },
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
    runtimeProfile: 'iterative'
  }
}

function headers(
  operatorId: string,
  role: 'Operator' | 'Approver' | 'Supervisor' = 'Approver',
  tenant: string = tenantId
): Record<string, string> {
  return {
    'x-tenant-id': tenant,
    'x-operator-id': operatorId,
    'x-operator-role': role
  }
}

describeWithPostgres('SPEC 0317 G1 — requester separation (HTTP, PG)', () => {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_g1_${suffix}`
  const role = `cvg_g1_worker_${suffix}`
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  const apiPool = new Pool({
    connectionString: testDatabaseUrl,
    options: `-c search_path=${schema}`
  })
  const observed: string[] = []
  let app: ReturnType<typeof buildServer>
  let worker: ReturnType<typeof createOperationalHarnessWorker>
  let commands = 0

  function roleUrl(): string {
    const parsed = new URL(testDatabaseUrl as string)
    parsed.username = role
    parsed.password = rolePassword
    return parsed.toString()
  }

  function createWorker() {
    return createOperationalHarnessWorker(
      {
        NODE_ENV: 'test',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_SYNTHETIC_EFFECT: 'true',
        DATABASE_URL: roleUrl(),
        POSTGRES_SCHEMA: schema,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_RUNTIME_PROFILE: 'iterative',
        CVG_WORKER_ITERATIVE_SCENARIO: 'approval',
        CVG_WORKER_ID: `worker-g1-${suffix}`
      },
      {
        syntheticEffectObserver: (context) =>
          observed.push(context.operationKey ?? '')
      }
    )
  }

  beforeAll(async () => {
    await admin.connect()
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
    await admin.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`)
    await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
    await admin.query(`SET search_path TO ${schema}`)
    worker = createWorker()
    app = buildServer({
      persistence: { kind: 'postgres-pool', pool: apiPool },
      executionSteps: new PostgresExecutionStepStore(apiPool as never),
      requireAuthenticatedMutations: true
    })
  })

  afterAll(async () => {
    await app?.close()
    await worker?.close()
    await apiPool.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin.query(`DROP ROLE IF EXISTS ${role}`)
    await admin.end()
  })

  async function submit(
    operatorId: string,
    key: string,
    operatorRole: 'Operator' | 'Approver' | 'Supervisor' = 'Approver'
  ): Promise<string> {
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: headers(operatorId, operatorRole),
      payload: { idempotencyKey: key, runtime: runtime() }
    })
    expect(accepted.statusCode).toBe(202)
    return accepted.json().data.execution.id as string
  }

  /** The real worker pauses the execution on its approval. */
  async function waitingApproval(): Promise<string> {
    const paused = await worker.worker.processNext()
    if (paused.kind !== 'processed') throw new Error('worker was idle')
    expect(paused.record.state).toBe('WAITING_APPROVAL')
    return paused.record.approvalId as string
  }

  function decide(
    executionId: string,
    approvalId: string,
    operatorId: string,
    options: {
      readonly decision?: 'approved' | 'rejected'
      readonly role?: 'Approver' | 'Supervisor'
      readonly tenant?: string
      readonly key?: string
    } = {}
  ) {
    commands += 1
    return app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
      headers: {
        ...headers(operatorId, options.role ?? 'Approver', options.tenant),
        'idempotency-key': options.key ?? `g1-command-${suffix}-${commands}`
      },
      payload: { decision: options.decision ?? 'approved' }
    })
  }

  async function grant(
    executionId: string,
    operatorId: string,
    provision = true
  ) {
    return grantCase(app, {
      kind: 'independent_execution',
      resourceId: executionId,
      operatorId,
      role: 'Approver',
      tenantId: tenantId as never,
      provision
    })
  }

  /** Every durable surface a decision reaches, minus the rate-limit budget. */
  async function snapshot(executionId: string, approvalId: string) {
    const rows = async (sql: string, values: unknown[]) =>
      (await admin.query(sql, values)).rows
    return {
      approval: await rows(
        'SELECT * FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2',
        [tenantId, approvalId]
      ),
      execution: await rows(
        'SELECT * FROM operational_executions WHERE tenant_id = $1 AND id = $2',
        [tenantId, executionId]
      ),
      queue: await rows(
        'SELECT * FROM operational_execution_outbox WHERE tenant_id = $1 AND execution_id = $2',
        [tenantId, executionId]
      ),
      events: await rows(
        'SELECT * FROM operational_execution_events WHERE tenant_id = $1 AND execution_id = $2 ORDER BY sequence',
        [tenantId, executionId]
      ),
      journal: await rows(
        'SELECT * FROM operational_effect_journal WHERE tenant_id = $1 ORDER BY operation_key',
        [tenantId]
      ),
      decisionAudit: await rows(
        `SELECT id FROM audit_events
          WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
        [approvalId]
      ),
      effects: [...observed]
    }
  }

  it('A submits, the worker waits, A is denied without effect, B approves', async () => {
    const humanA = `human.a.${suffix}`
    const humanB = `human.b.${suffix}`
    const executionId = await submit(humanA, `g1-main-${suffix}`)
    await grant(executionId, humanA)
    await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    expect(observed).toHaveLength(0)

    const stored = await admin.query(
      `SELECT e.submitted_by_kind, e.submitted_by_id, e.submitted_by_tenant_id,
              a.requested_by_kind, a.requested_by_id, a.requested_by_tenant_id,
              a.requester_binding, a.operator_id, a.agent_id
         FROM operational_executions e
         JOIN runtime_approvals a ON a.approval_id = e.approval_id
        WHERE e.id = $1`,
      [executionId]
    )
    expect(stored.rows[0]).toMatchObject({
      submitted_by_kind: 'human',
      submitted_by_id: humanA,
      submitted_by_tenant_id: tenantId,
      requested_by_kind: 'human',
      requested_by_id: humanA,
      requested_by_tenant_id: tenantId,
      // The legacy field keeps naming the agent: no silent change of meaning.
      operator_id: 'agent.g1.synthetic',
      agent_id: 'agent.g1.synthetic'
    })
    expect(stored.rows[0].requester_binding).toMatch(/^v1:[0-9a-f]{64}$/)

    const before = await snapshot(executionId, approvalId)
    const denied = await decide(executionId, approvalId, humanA)
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error.code).toBe('forbidden')
    expect(await snapshot(executionId, approvalId)).toEqual(before)

    const allowed = await decide(executionId, approvalId, humanB)
    expect(allowed.statusCode).toBe(202)
    const decided = await snapshot(executionId, approvalId)
    expect(decided.approval[0].status).toBe('APPROVED')
    expect(decided.approval[0].approver_id).toBe(humanB)
    expect(decided.decisionAudit).toHaveLength(1)
    const audit = await admin.query(
      `SELECT payload FROM audit_events
        WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
      [approvalId]
    )
    expect(audit.rows[0].payload.requestedBy).toEqual({
      kind: 'human',
      id: humanA,
      tenantId
    })

    const completed = await worker.worker.processNext()
    if (completed.kind !== 'processed') throw new Error('worker was idle')
    expect(completed.record.state).toBe('SUCCEEDED')
    expect(observed.length).toBeGreaterThan(0)

    // Even after the decision, the requester's approval is refused, not replayed.
    const effects = await snapshot(executionId, approvalId)
    const late = await decide(executionId, approvalId, humanA)
    expect(late.statusCode).toBe(403)
    expect(await snapshot(executionId, approvalId)).toEqual(effects)
  })

  it('denies a Supervisor who submitted, and keeps rejection available', async () => {
    const supervisor = `human.supervisor.${suffix}`
    const executionId = await submit(
      supervisor,
      `g1-supervisor-${suffix}`,
      'Supervisor'
    )
    const approvalId = await waitingApproval()
    const before = await snapshot(executionId, approvalId)
    const denied = await decide(executionId, approvalId, supervisor, {
      role: 'Supervisor'
    })
    expect(denied.statusCode).toBe(403)
    expect(await snapshot(executionId, approvalId)).toEqual(before)

    // Rejection keeps its contract and grants no approving power.
    const rejected = await decide(executionId, approvalId, supervisor, {
      role: 'Supervisor',
      decision: 'rejected'
    })
    expect(rejected.statusCode).toBe(200)
    const after = await snapshot(executionId, approvalId)
    expect(after.approval[0].status).toBe('REJECTED')
    expect(after.execution[0].state).toBe('FAILED_TERMINAL')
  })

  it('refuses a forged submittedBy, top level or in the runtime', async () => {
    const forged = { kind: 'human', id: 'human.forged', tenantId }
    const count = async () =>
      Number(
        (await admin.query('SELECT count(*) AS n FROM operational_executions'))
          .rows[0].n
      )
    const before = await count()
    for (const payload of [
      {
        idempotencyKey: `g1-forge-top-${suffix}`,
        submittedBy: forged,
        runtime: runtime()
      },
      {
        idempotencyKey: `g1-forge-runtime-${suffix}`,
        runtime: { ...runtime(), submittedBy: forged }
      }
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: headers(`human.forger.${suffix}`),
        payload
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('validation_failed')
    }
    expect(await count()).toBe(before)
  })

  it('a replay by another principal conflicts without changing the author', async () => {
    const humanA = `human.replay.a.${suffix}`
    const humanB = `human.replay.b.${suffix}`
    const key = `g1-replay-${suffix}`
    const executionId = await submit(humanA, key)
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: headers(humanA),
      payload: { idempotencyKey: key, runtime: runtime() }
    })
    expect(replay.statusCode).toBe(202)
    expect(replay.json().data.created).toBe(false)

    const other = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: headers(humanB),
      payload: { idempotencyKey: key, runtime: runtime() }
    })
    expect(other.statusCode).toBe(409)
    expect(JSON.stringify(other.json())).not.toContain(executionId)
    expect(JSON.stringify(other.json())).not.toContain(humanA)

    const raced = await Promise.all(
      [humanA, humanB].map((operatorId) =>
        app.inject({
          method: 'POST',
          url: '/v1/executions',
          headers: headers(operatorId),
          payload: {
            idempotencyKey: `g1-replay-race-${suffix}`,
            runtime: runtime()
          }
        })
      )
    )
    expect(raced.map((reply) => reply.statusCode).sort()).toEqual([202, 409])

    const stored = await admin.query(
      'SELECT submitted_by_id FROM operational_executions WHERE id = $1',
      [executionId]
    )
    expect(stored.rows[0].submitted_by_id).toBe(humanA)
    // These two wait on the queue; run them out so later tests start clean.
    for (let drained = 0; drained < 2; drained += 1) {
      await worker.worker.processNext()
    }
  })

  it('the same id in another tenant, and a lost grant, do not decide', async () => {
    const humanA = `human.tenant.a.${suffix}`
    const humanB = `human.tenant.b.${suffix}`
    const executionId = await submit(humanA, `g1-tenant-${suffix}`)
    const caseId = await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    const before = await snapshot(executionId, approvalId)

    const crossTenant = await decide(executionId, approvalId, humanB, {
      tenant: otherTenantId
    })
    expect(crossTenant.statusCode).toBe(404)
    expect(await snapshot(executionId, approvalId)).toEqual(before)

    const revoked = await putAssignment(
      app,
      caseId,
      humanB,
      { status: 'REVOKED', expectedRevision: 1 },
      managerHeaders('supervisor.case-manager', tenantId)
    )
    expect(revoked.statusCode).toBe(200)
    const noGrant = await decide(executionId, approvalId, humanB)
    expect(noGrant.statusCode).toBe(404)
    expect(await snapshot(executionId, approvalId)).toEqual(before)
  })

  it('a changed proposal revision loses its binding and cannot be approved', async () => {
    const humanA = `human.revision.a.${suffix}`
    const humanB = `human.revision.b.${suffix}`
    const executionId = await submit(humanA, `g1-revision-${suffix}`)
    await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    await admin.query(
      `UPDATE runtime_approvals SET policy_version = 'policy-tampered'
        WHERE tenant_id = $1 AND approval_id = $2`,
      [tenantId, approvalId]
    )
    const before = await snapshot(executionId, approvalId)
    const denied = await decide(executionId, approvalId, humanB)
    expect(denied.statusCode).toBe(404)
    expect(await snapshot(executionId, approvalId)).toEqual(before)
  })

  it('under concurrency only B decides; a retry by B converges on one event', async () => {
    const humanA = `human.race.a.${suffix}`
    const humanB = `human.race.b.${suffix}`
    const executionId = await submit(humanA, `g1-race-${suffix}`)
    await grant(executionId, humanA)
    await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    const key = `g1-race-command-${suffix}`
    const replies = await Promise.all([
      decide(executionId, approvalId, humanA),
      decide(executionId, approvalId, humanB, { key }),
      decide(executionId, approvalId, humanA)
    ])
    expect(replies.map((reply) => reply.statusCode)).toEqual([403, 202, 403])
    const retry = await decide(executionId, approvalId, humanB, { key })
    expect(retry.statusCode).toBe(202)
    const after = await snapshot(executionId, approvalId)
    expect(after.approval[0].approver_id).toBe(humanB)
    expect(after.decisionAudit).toHaveLength(1)
    await worker.worker.processNext()
  })

  it('a restart keeps the original requester; A is still denied', async () => {
    const humanA = `human.restart.a.${suffix}`
    const humanB = `human.restart.b.${suffix}`
    const executionId = await submit(humanA, `g1-restart-${suffix}`)
    await grant(executionId, humanA)
    await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    await worker.close()
    worker = createWorker()
    await assertOperationalHarnessPostgresPreflight(worker)

    const fresh = new PostgresApprovalAuthority(
      apiPool as unknown as PostgresPoolLike
    )
    expect((await fresh.get(tenantId, approvalId)).requestedBy?.id).toBe(humanA)
    const store = new PostgresOperationalExecutionStore(
      apiPool as unknown as PostgresPoolLike
    )
    expect((await store.get(tenantId, executionId))?.submittedBy).toEqual({
      kind: 'human',
      id: humanA,
      tenantId
    })
    const before = await snapshot(executionId, approvalId)
    expect((await decide(executionId, approvalId, humanA)).statusCode).toBe(403)
    expect(await snapshot(executionId, approvalId)).toEqual(before)
    expect((await decide(executionId, approvalId, humanB)).statusCode).toBe(202)
    const completed = await worker.worker.processNext()
    if (completed.kind !== 'processed') throw new Error('worker was idle')
    expect(completed.record.state).toBe('SUCCEEDED')
    expect(completed.record.submittedBy).toEqual({
      kind: 'human',
      id: humanA,
      tenantId
    })
  })

  it('the columns are immutable and malformed principals never reach a row', async () => {
    const humanA = `human.immutable.a.${suffix}`
    const executionId = await submit(humanA, `g1-immutable-${suffix}`)
    const approvalId = await waitingApproval()
    for (const update of [
      `UPDATE operational_executions SET submitted_by_id = 'human.other' WHERE id = '${executionId}'`,
      `UPDATE operational_executions SET submitted_by_kind = 'unknown', submitted_by_id = NULL, submitted_by_tenant_id = NULL WHERE id = '${executionId}'`,
      `UPDATE runtime_approvals SET requested_by_id = 'human.other' WHERE approval_id = '${approvalId}'`,
      `UPDATE runtime_approvals SET requester_binding = NULL WHERE approval_id = '${approvalId}'`
    ]) {
      await expect(admin.query(update)).rejects.toMatchObject({ code: '55000' })
    }
    const store = new PostgresOperationalExecutionStore(
      apiPool as unknown as PostgresPoolLike
    )
    expect(() =>
      store.submit({
        tenantId,
        idempotencyKey: `g1-other-tenant-${suffix}`,
        submittedBy: {
          kind: 'human',
          id: 'human.other',
          tenantId: otherTenantId
        },
        runtime: runtime()
      })
    ).toThrow('submittedBy must belong to the execution tenant')
    expect(() =>
      store.submit({
        tenantId,
        idempotencyKey: `g1-undeclared-${suffix}`,
        submittedBy: { kind: 'system', id: 'system.undeclared', tenantId },
        runtime: runtime()
      })
    ).toThrow('System principal is not declared by this composition')

    const declared = new PostgresOperationalExecutionStore(
      apiPool as unknown as PostgresPoolLike,
      { systemPrincipals: ['system.declared'] }
    )
    const accepted = await declared.submit({
      tenantId,
      idempotencyKey: `g1-declared-${suffix}`,
      submittedBy: { kind: 'system', id: 'system.declared', tenantId },
      runtime: runtime()
    })
    expect(accepted.record.submittedBy).toEqual({
      kind: 'system',
      id: 'system.declared',
      tenantId
    })
    // The principal stays out of the stored request and of its hash.
    expect('submittedBy' in accepted.record.request).toBe(false)
    await worker.worker.processNext()
  })

  it('the preflight refuses a worker when a requester guard was dropped', async () => {
    await admin.query(
      'ALTER TABLE operational_executions DISABLE TRIGGER operational_executions_submitted_by_immutable'
    )
    try {
      await expect(
        assertOperationalHarnessPostgresPreflight(worker)
      ).rejects.toThrow(/0039_requester_principal/)
    } finally {
      await admin.query(
        'ALTER TABLE operational_executions ENABLE TRIGGER operational_executions_submitted_by_immutable'
      )
    }
    await assertOperationalHarnessPostgresPreflight(worker)
  })

  it('rollback and roll-forward leave older records unknown, which approves nothing', async () => {
    const humanA = `human.legacy.a.${suffix}`
    const humanB = `human.legacy.b.${suffix}`
    const executionId = await submit(humanA, `g1-legacy-${suffix}`)
    await grant(executionId, humanB)
    const approvalId = await waitingApproval()
    const rejectedExecutionId = await submit(humanA, `g1-legacy-2-${suffix}`)
    await grant(rejectedExecutionId, humanB, false)
    const rejectedApprovalId = await waitingApproval()

    await admin.query(ROLLBACK_0039)
    const dropped = await admin.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'runtime_approvals'
          AND column_name LIKE 'requested_by%'`,
      [schema]
    )
    expect(dropped.rows).toEqual([])

    await runPostgresMigrations(admin, {
      schemaName: schema,
      migrations: ['0039_requester_principal']
    })
    await admin.query(`SET search_path TO ${schema}`)

    const legacy = await admin.query(
      `SELECT e.submitted_by_kind, e.submitted_by_id, a.requested_by_kind,
              a.requested_by_id, a.requester_binding, a.operator_id
         FROM operational_executions e
         JOIN runtime_approvals a ON a.approval_id = e.approval_id
        WHERE e.id = $1`,
      [executionId]
    )
    // Nothing is inferred from the agent id, or from what the row said before.
    expect(legacy.rows[0]).toEqual({
      submitted_by_kind: 'unknown',
      submitted_by_id: null,
      requested_by_kind: 'unknown',
      requested_by_id: null,
      requester_binding: null,
      operator_id: 'agent.g1.synthetic'
    })
    await expect(
      admin.query(
        `UPDATE runtime_approvals SET requested_by_kind = 'human',
                requested_by_id = 'human.backfill',
                requested_by_tenant_id = tenant_id
          WHERE approval_id = $1`,
        [approvalId]
      )
    ).rejects.toBeDefined()

    const before = await snapshot(executionId, approvalId)
    const denied = await decide(executionId, approvalId, humanB)
    expect(denied.statusCode).toBe(409)
    expect(denied.json().error.message).toContain('no trusted requester')
    expect(await snapshot(executionId, approvalId)).toEqual(before)

    const rejected = await decide(
      rejectedExecutionId,
      rejectedApprovalId,
      humanB,
      { decision: 'rejected' }
    )
    expect(rejected.statusCode).toBe(200)
  })

  it('a requester without a grant is denied by the case first, as 404', async () => {
    const humanA = `human.nogrant.a.${suffix}`
    const executionId = await submit(humanA, `g1-nogrant-${suffix}`)
    const approvalId = await waitingApproval()
    const before = await snapshot(executionId, approvalId)
    const denied = await decide(executionId, approvalId, humanA)
    expect(denied.statusCode).toBe(404)
    expect(await snapshot(executionId, approvalId)).toEqual(before)
  })
})
