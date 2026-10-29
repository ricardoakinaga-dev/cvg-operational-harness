/**
 * SPEC 0262 §4.2/§4.3 on PostgreSQL: the runtime approval decision is one unit.
 * R15 (convergence matrix, gap, incompatible pairs, causality), R13 (expiry
 * commits only EXPIRED and the original error; every other failure rolls
 * back) and the authorization hook. Synthetic data only.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention).
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  PostgresRuntimeApprovalDecision,
  runPostgresMigrations,
  type PostgresPoolLike
} from '@cvg/persistence'
import { ApprovalError, type ApprovalRequestInput } from '@cvg/approval-engine'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
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

async function teardown(setup: {
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

describe(
  'SPEC 0262 runtime approval unit on PostgreSQL',
  { timeout: 180_000 },
  () => {
    let clockOffsetMs = 0
    const clock = () => new Date(Date.now() + clockOffsetMs)

    async function harness() {
      clockOffsetMs = 0
      const setup = await setupDatabase()
      const poolLike = setup.pool as unknown as PostgresPoolLike
      const store = new PostgresOperationalExecutionStore(poolLike)
      const authority = new PostgresApprovalAuthority(poolLike, { clock })
      const unit = new PostgresRuntimeApprovalDecision(
        poolLike,
        authority,
        store
      )
      const fixture = await waitingFixture(
        store,
        authority,
        `unit-${Math.random().toString(36).slice(2)}`
      )
      const command = (
        overrides: Partial<
          Parameters<PostgresRuntimeApprovalDecision['decide']>[0]
        > = {}
      ) => ({
        tenantId: tenantA as never,
        executionId: fixture.executionId,
        approvalId: fixture.approvalId,
        verdict: 'APPROVED' as const,
        actorId: 'approver.one',
        decisionActorType: 'Approver' as const,
        correlationId: `corr_${Math.random().toString(36).slice(2)}`,
        commandKey: `cmd-${Math.random().toString(36).slice(2)}`,
        reason: 'unit reason',
        ...overrides
      })
      const snapshot = async () => {
        const approval = await setup.pool.query(
          `SELECT status, revision, approver_id, decision_correlation_id, decision_command_key, decision_reason, decision_actor_type, expired_at FROM runtime_approvals WHERE approval_id = $1`,
          [fixture.approvalId]
        )
        const events = await setup.pool.query(
          `SELECT COUNT(*)::int AS n FROM audit_events WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
          [fixture.approvalId]
        )
        return {
          approval: approval.rows[0] as Record<string, unknown>,
          execution: (await store.get(tenantA, fixture.executionId))?.state,
          events: events.rows[0].n as number
        }
      }
      return { setup, store, authority, unit, fixture, command, snapshot }
    }

    itWithPostgres(
      'positive: approve decides, resolves the execution and writes one event; a replay by another approver converges with no new CAS or event (R15)',
      async () => {
        const h = await harness()
        try {
          const first = await h.unit.decide(h.command())
          expect(first.approval.status).toBe('APPROVED')
          expect(first.execution.state).toBe('QUEUED')
          const afterFirst = await h.snapshot()
          expect(afterFirst.events).toBe(1)
          const replay = await h.unit.decide(
            h.command({
              actorId: 'approver.two',
              commandKey: 'cmd-other',
              reason: 'other note'
            })
          )
          expect(replay.approval.status).toBe('APPROVED')
          const afterReplay = await h.snapshot()
          expect(afterReplay).toEqual(afterFirst)
          expect(afterReplay.approval.approver_id).toBe('approver.one')
          expect(afterReplay.approval.decision_reason).toBe('unit reason')
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'opposite verdict after a decision is a 409 conflict and changes nothing (R15)',
      async () => {
        const h = await harness()
        try {
          await h.unit.decide(h.command())
          const before = await h.snapshot()
          await expect(
            h.unit.decide(h.command({ verdict: 'REJECTED' }))
          ).rejects.toMatchObject({ code: 'conflict' })
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    for (const advanced of ['RESERVED', 'EXECUTING', 'EXECUTED']) {
      itWithPostgres(
        `approval advanced to ${advanced} converges for APPROVED and conflicts for REJECTED, without a new event or CAS (R15)`,
        async () => {
          const h = await harness()
          try {
            await h.unit.decide(h.command())
            await h.setup.pool.query(
              `UPDATE runtime_approvals SET status = $2 WHERE approval_id = $1`,
              [h.fixture.approvalId, advanced]
            )
            const before = await h.snapshot()
            const same = await h.unit.decide(
              h.command({ actorId: 'approver.three' })
            )
            expect(same.approval.status).toBe(advanced)
            expect(await h.snapshot()).toEqual(before)
            await expect(
              h.unit.decide(h.command({ verdict: 'REJECTED' }))
            ).rejects.toMatchObject({ code: 'conflict' })
            expect(await h.snapshot()).toEqual(before)
          } finally {
            await teardown(h.setup)
          }
        }
      )
    }

    itWithPostgres(
      'REJECTED converges for REJECTED and conflicts for APPROVED (R15)',
      async () => {
        const h = await harness()
        try {
          const first = await h.unit.decide(h.command({ verdict: 'REJECTED' }))
          expect(first.approval.status).toBe('REJECTED')
          expect(first.execution.state).toBe('FAILED_TERMINAL')
          const before = await h.snapshot()
          const again = await h.unit.decide(
            h.command({
              verdict: 'REJECTED',
              actorId: 'supervisor.x',
              decisionActorType: 'Supervisor'
            })
          )
          expect(again.approval.status).toBe('REJECTED')
          expect(await h.snapshot()).toEqual(before)
          await expect(
            h.unit.decide(h.command({ verdict: 'APPROVED' }))
          ).rejects.toMatchObject({ code: 'conflict' })
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'incompatible pairs conflict without repair: execution not waiting + open approval; waiting + RESERVED (R15)',
      async () => {
        const h = await harness()
        try {
          // The execution already left WAITING_APPROVAL while the approval is still open.
          await h.store.resolveApproval({
            tenantId: tenantA,
            executionId: h.fixture.executionId,
            approvalId: h.fixture.approvalId,
            actorId: 'approver.other',
            decision: 'APPROVED'
          })
          const before = await h.snapshot()
          await expect(h.unit.decide(h.command())).rejects.toMatchObject({
            code: 'conflict'
          })
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
        const h2 = await harness()
        try {
          await h2.setup.pool.query(
            `UPDATE runtime_approvals SET status = 'RESERVED' WHERE approval_id = $1`,
            [h2.fixture.approvalId]
          )
          const before2 = await h2.snapshot()
          await expect(h2.unit.decide(h2.command())).rejects.toMatchObject({
            code: 'conflict'
          })
          expect(await h2.snapshot()).toEqual(before2)
        } finally {
          await teardown(h2.setup)
        }
      }
    )

    itWithPostgres(
      'persisted decision without causality is a 409 and nothing is filled in from the retry (R15)',
      async () => {
        const h = await harness()
        try {
          await h.unit.decide(h.command())
          await h.setup.pool.query(
            `UPDATE runtime_approvals SET decision_command_key = NULL WHERE approval_id = $1`,
            [h.fixture.approvalId]
          )
          const before = await h.snapshot()
          await expect(
            h.unit.decide(h.command({ commandKey: 'retry-key' }))
          ).rejects.toMatchObject({ code: 'conflict' })
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'legacy gap: decision persisted but execution still waiting and no event completes only what is missing with the original decision (R15)',
      async () => {
        const h = await harness()
        try {
          await h.authority.submit(
            tenantA,
            h.fixture.approvalId,
            'agent.atomic.pg.synthetic'
          )
          await h.authority.approve(tenantA, h.fixture.approvalId, {
            approverId: 'approver.original',
            decisionActorType: 'Approver',
            decisionCorrelationId: 'corr_original',
            commandKey: 'cmd-original',
            reason: 'original reason'
          })
          const before = await h.snapshot()
          expect(before.execution).toBe('WAITING_APPROVAL')
          expect(before.events).toBe(0)
          const result = await h.unit.decide(
            h.command({
              actorId: 'approver.retry',
              commandKey: 'cmd-retry',
              reason: 'retry reason'
            })
          )
          expect(result.execution.state).toBe('QUEUED')
          const after = await h.snapshot()
          expect(after.events).toBe(1)
          expect(after.approval.revision).toBe(before.approval.revision)
          expect(after.approval.approver_id).toBe('approver.original')
          expect(after.approval.decision_command_key).toBe('cmd-original')
          const event = await h.setup.pool.query(
            `SELECT actor_id, correlation_id, payload FROM audit_events WHERE type = 'approval_decision' AND payload->>'approvalId' = $1`,
            [h.fixture.approvalId]
          )
          expect(event.rows[0].actor_id).toBe('approver.original')
          expect(event.rows[0].correlation_id).toBe('corr_original')
          expect(event.rows[0].payload.commandKey).toBe('cmd-original')
          expect(event.rows[0].payload.reason).toBe('original reason')
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'gap with a failing audit rolls the completion back and keeps the previous state (R15)',
      async () => {
        const h = await harness()
        try {
          await h.authority.submit(
            tenantA,
            h.fixture.approvalId,
            'agent.atomic.pg.synthetic'
          )
          await h.authority.approve(tenantA, h.fixture.approvalId, {
            approverId: 'approver.original',
            decisionActorType: 'Approver',
            decisionCorrelationId: 'corr_original',
            commandKey: 'cmd-original'
          })
          await h.setup.pool.query(
            `CREATE FUNCTION fail_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type = 'approval_decision' THEN RAISE EXCEPTION 'injected'; END IF; RETURN NEW; END; $$`
          )
          await h.setup.pool.query(
            `CREATE TRIGGER fail_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_audit_fn()`
          )
          const before = await h.snapshot()
          await expect(h.unit.decide(h.command())).rejects.toBeTruthy()
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'expired PENDING: only EXPIRED commits and the original expired error is rethrown after; no resolution, no event (R13)',
      async () => {
        const h = await harness()
        try {
          await h.authority.submit(
            tenantA,
            h.fixture.approvalId,
            'agent.atomic.pg.synthetic'
          )
          clockOffsetMs = 60 * 60 * 1000
          const before = await h.snapshot()
          const error = await h.unit
            .decide(h.command())
            .catch((e: unknown) => e)
          expect(error).toBeInstanceOf(ApprovalError)
          expect((error as ApprovalError).code).toBe('expired')
          const after = await h.snapshot()
          expect(after.approval.status).toBe('EXPIRED')
          expect(after.approval.expired_at).not.toBeNull()
          expect(after.approval.approver_id).toBeNull()
          expect(after.approval.decision_command_key).toBeNull()
          expect(after.execution).toBe(before.execution)
          expect(after.events).toBe(0)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'expired REQUESTED: the intermediate submit is discarded, only EXPIRED commits (R13)',
      async () => {
        const h = await harness()
        try {
          clockOffsetMs = 60 * 60 * 1000
          const error = await h.unit
            .decide(h.command())
            .catch((e: unknown) => e)
          expect((error as ApprovalError).code).toBe('expired')
          const after = await h.snapshot()
          expect(after.approval.status).toBe('EXPIRED')
          expect(after.approval.approver_id).toBeNull()
          expect(after.execution).toBe('WAITING_APPROVAL')
          expect(after.events).toBe(0)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'self-approval (not expired) rolls everything back, including the intermediate submit (R13)',
      async () => {
        const h = await harness()
        try {
          const before = await h.snapshot()
          await expect(
            h.unit.decide(h.command({ actorId: 'agent.atomic.pg.synthetic' }))
          ).rejects.toBeInstanceOf(ApprovalError)
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'a failing authorization hook leaves approval, execution and audit untouched',
      async () => {
        const h = await harness()
        try {
          const before = await h.snapshot()
          await expect(
            h.unit.decide(h.command(), {
              authorize: async () => {
                throw new Error('denied')
              }
            })
          ).rejects.toThrow('denied')
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )

    itWithPostgres(
      'execution/approval binding mismatches are 404 not_found without effects',
      async () => {
        const h = await harness()
        try {
          const before = await h.snapshot()
          await expect(
            h.unit.decide(h.command({ approvalId: 'approval-does-not-exist' }))
          ).rejects.toMatchObject({ code: 'not_found' })
          await expect(
            h.unit.decide(
              h.command({ executionId: 'execution-does-not-exist' })
            )
          ).rejects.toMatchObject({ code: 'not_found' })
          expect(await h.snapshot()).toEqual(before)
        } finally {
          await teardown(h.setup)
        }
      }
    )
  }
)
