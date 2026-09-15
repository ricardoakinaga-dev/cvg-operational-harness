import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  CapabilityRegistration,
  ModelGateway,
  RuntimeInput,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import {
  OperationalExecutionWorker,
  createCapabilityRegistry,
  createOperationalHarness
} from '@cvg/harness'
import {
  DurableApprovalEngineAdapter,
  PostgresApprovalAuthority,
  PostgresOperationalEffectJournal,
  PostgresOperationalExecutionStore,
  runPostgresMigrations,
  type PostgresPoolLike
} from '@cvg/persistence'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const CAPABILITY_ID = 'synthetic.phase4.postgres-capability'
const CAPABILITY_VERSION = '1.0.0'
const tenantA = 'tenant_00000000-0000-4000-8000-000000000941'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000942'
const rolePassword = 'synthetic-phase4-role-password'

interface ObservedExecution {
  readonly input: unknown
  readonly context: ToolExecutionContext
}

function roleUrl(username: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = rolePassword
  return parsed.toString()
}

function capability(
  observed: ObservedExecution[],
  options: { readonly requiresApproval?: boolean } = {}
): CapabilityRegistration {
  return {
    descriptor: {
      id: CAPABILITY_ID,
      version: CAPABILITY_VERSION,
      description: 'Synthetic Phase 4 PostgreSQL capability',
      inputSchema: { type: 'object', required: ['fixture'] },
      outputSchema: { type: 'object', required: ['fixture', 'tenantId'] },
      risk: 'LOW',
      sideEffect: 'WRITE',
      idempotent: false,
      requiresApproval: options.requiresApproval ?? false,
      origin: 'core',
      providerId: 'synthetic-postgres-provider',
      providerVersion: '1.0.0'
    },
    implementation: {
      validateInput: (input) =>
        typeof input === 'object' &&
        input !== null &&
        !Array.isArray(input) &&
        typeof (input as { fixture?: unknown }).fixture === 'string',
      execute: async (input, context) => {
        observed.push({ input, context })
        return {
          status: 'SUCCEEDED',
          output: {
            fixture: (input as { fixture: string }).fixture,
            tenantId: context.tenantId
          }
        }
      },
      validateOutput: (output) =>
        typeof output === 'object' &&
        output !== null &&
        !Array.isArray(output) &&
        typeof (output as { fixture?: unknown }).fixture === 'string' &&
        typeof (output as { tenantId?: unknown }).tenantId === 'string'
    }
  }
}

function ports(approvalEngine?: ApprovalEngine) {
  const modelGateway: ModelGateway = {
    complete: async () => ({
      text: 'unused',
      provider: 'synthetic-model',
      model: 'fixture',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  }
  const defaultApprovals: ApprovalEngine = {
    request: async () => ({
      status: 'PENDING',
      reason: 'synthetic capability does not require approval'
    })
  }
  return {
    modelGateway,
    approvals: approvalEngine ?? defaultApprovals,
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW' as const,
        reason: 'synthetic controlled policy',
        policyVersion: 'synthetic-phase4-v1'
      })
    },
    audit: { append: async () => undefined },
    telemetry: { record: () => undefined },
    orchestrator: {
      decideNextStep: async ({ runtime }: { runtime: RuntimeInput }) => ({
        action: 'CALL_TOOL' as const,
        toolInvocation: runtime.requestedTool!
      })
    }
  }
}

function runtime(
  tenantId: string,
  operationKey: string,
  capabilityFingerprint: string,
  executionId?: string
): RuntimeInput {
  return {
    agent: {
      id: 'agent.phase4.postgres' as RuntimeInput['agent']['id'],
      version: '1.0.0' as RuntimeInput['agent']['version'],
      objective: 'Execute a synthetic capability through the governed path',
      instructions: ['synthetic only'],
      skills: [],
      tools: [CAPABILITY_ID],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    ...(executionId ? { executionId } : {}),
    capabilityFingerprint,
    conversationId:
      `conversation-${tenantId}` as RuntimeInput['conversationId'],
    sessionId: `session-${tenantId}` as RuntimeInput['sessionId'],
    correlationId: `correlation-${tenantId}` as RuntimeInput['correlationId'],
    traceId: `trace-${tenantId}` as RuntimeInput['traceId'],
    userMessage: 'synthetic Phase 4 PostgreSQL proof',
    context: {
      values: { source: 'phase4-postgres' },
      sourceIds: ['phase4-postgres-capability'],
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-15T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    },
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId: CAPABILITY_ID,
      toolVersion: CAPABILITY_VERSION,
      operationKey,
      input: { fixture: 'phase4-postgres-capability' }
    }
  }
}

async function setupDatabase() {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_aaa41_capability_${suffix}`
  const role = `cvg_aaa41_capability_${suffix}`
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  await runPostgresMigrations(admin, { schemaName: schema })
  await admin.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${rolePassword}'
       NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
  )
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${schema}.operational_effect_journal TO ${role}`
  )
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${schema}.operational_executions TO ${role}`
  )
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${schema}.operational_execution_outbox TO ${role}`
  )
  await admin.query(
    `GRANT SELECT, INSERT ON ${schema}.operational_execution_events TO ${role}`
  )
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${schema}.runtime_approvals TO ${role}`
  )
  await admin.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`
  )
  await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
  const pool = new Pool({
    connectionString: roleUrl(role),
    options: `-c search_path=${schema}`
  })
  return { admin, pool, role, schema }
}

async function teardownDatabase(
  setup: Awaited<ReturnType<typeof setupDatabase>>
): Promise<void> {
  await setup.pool.end().catch(() => undefined)
  await setup.admin
    .query(`DROP OWNED BY ${setup.role} CASCADE`)
    .catch(() => undefined)
  await setup.admin
    .query(`DROP SCHEMA IF EXISTS ${setup.schema} CASCADE`)
    .catch(() => undefined)
  await setup.admin
    .query(`DROP ROLE IF EXISTS ${setup.role}`)
    .catch(() => undefined)
  await setup.admin.end().catch(() => undefined)
}

function harness(
  pool: Pool,
  registry: ReturnType<typeof createCapabilityRegistry>,
  effectJournalOptions: {
    readonly crashAfterEffectBeforeConfirm?: boolean
  } = {}
) {
  const effectJournal = new PostgresOperationalEffectJournal(
    pool as unknown as PostgresPoolLike
  )
  return {
    harness: createOperationalHarness({
      ...ports(),
      capabilities: registry,
      effectJournal,
      effectJournalOptions
    }),
    effectJournal
  }
}

describeWithPostgres('AAA-41 capability boundary PostgreSQL durability', () => {
  it('replays a confirmed capability effect after a fresh pool/composition and isolates tenants', async () => {
    const setup = await setupDatabase()
    const observed: ObservedExecution[] = []
    const registry = createCapabilityRegistry([capability(observed)])
    const fingerprint = registry.compositionFingerprint()
    const operationKey = `phase4-postgres-replay-${Date.now()}`

    try {
      const first = harness(setup.pool, registry)
      const firstResult = await first.harness.execute(
        runtime(tenantA, operationKey, fingerprint, 'exec-phase4-first')
      )
      expect(firstResult.stopReason).toBe('COMPLETED')
      expect(firstResult.toolResult?.output).toEqual({
        fixture: 'phase4-postgres-capability',
        tenantId: tenantA
      })
      await setup.pool.end()

      const restartedPool = new Pool({
        connectionString: roleUrl(setup.role),
        options: `-c search_path=${setup.schema}`
      })
      const restarted = harness(restartedPool, registry)
      const replay = await restarted.harness.execute(
        runtime(tenantA, operationKey, fingerprint, 'exec-phase4-restarted')
      )
      const otherTenant = await restarted.harness.execute(
        runtime(tenantB, operationKey, fingerprint, 'exec-phase4-other-tenant')
      )

      expect(replay.stopReason).toBe('COMPLETED')
      expect(replay.toolResult?.output).toEqual({
        fixture: 'phase4-postgres-capability',
        tenantId: tenantA
      })
      expect(otherTenant.stopReason).toBe('COMPLETED')
      expect(otherTenant.toolResult?.output).toEqual({
        fixture: 'phase4-postgres-capability',
        tenantId: tenantB
      })
      expect(observed).toHaveLength(2)
      expect(observed.map(({ context }) => context.tenantId)).toEqual([
        tenantA,
        tenantB
      ])
      await expect(
        restarted.effectJournal.get(tenantA, operationKey)
      ).resolves.toMatchObject({ state: 'CONFIRMED', tenantId: tenantA })
      await expect(
        restarted.effectJournal.get(tenantB, operationKey)
      ).resolves.toMatchObject({ state: 'CONFIRMED', tenantId: tenantB })
      await restartedPool.end()
    } finally {
      await teardownDatabase(setup)
    }
  }, 90_000)

  it('persists an uncertain capability effect and rejects retry after fresh composition', async () => {
    const setup = await setupDatabase()
    const observed: ObservedExecution[] = []
    const registry = createCapabilityRegistry([capability(observed)])
    const fingerprint = registry.compositionFingerprint()
    const operationKey = `phase4-postgres-uncertain-${Date.now()}`

    try {
      const first = harness(setup.pool, registry, {
        crashAfterEffectBeforeConfirm: true
      })
      const uncertain = await first.harness.execute(
        runtime(tenantA, operationKey, fingerprint, 'exec-phase4-uncertain')
      )
      expect(uncertain.stopReason).toBe('TOOL_FAILURE')
      expect(uncertain.toolResult?.error).toContain('unknown_effect')
      await expect(
        first.effectJournal.get(tenantA, operationKey)
      ).resolves.toMatchObject({ state: 'UNCERTAIN', tenantId: tenantA })
      await setup.pool.end()

      const restartedPool = new Pool({
        connectionString: roleUrl(setup.role),
        options: `-c search_path=${setup.schema}`
      })
      const restarted = harness(restartedPool, registry)
      const retry = await restarted.harness.execute(
        runtime(
          tenantA,
          operationKey,
          fingerprint,
          'exec-phase4-uncertain-retry'
        )
      )

      expect(retry.stopReason).toBe('TOOL_FAILURE')
      expect(retry.toolResult?.error).toContain('unknown_effect')
      expect(observed).toHaveLength(1)
      await expect(
        restarted.effectJournal.get(tenantA, operationKey)
      ).resolves.toMatchObject({ state: 'UNCERTAIN', tenantId: tenantA })
      await restartedPool.end()
    } finally {
      await teardownDatabase(setup)
    }
  }, 90_000)

  it('executes the capability through the durable PostgreSQL worker path for isolated tenants', async () => {
    const setup = await setupDatabase()
    const observed: ObservedExecution[] = []
    const registry = createCapabilityRegistry([capability(observed)])
    const fingerprint = registry.compositionFingerprint()
    const operationKey = `phase4-postgres-worker-${Date.now()}`
    const store = new PostgresOperationalExecutionStore(
      setup.pool as unknown as PostgresPoolLike
    )
    const effectJournal = new PostgresOperationalEffectJournal(
      setup.pool as unknown as PostgresPoolLike
    )
    const harnessOptions = { ...ports(), capabilities: registry }
    const workerA = new OperationalExecutionWorker({
      store,
      workerId: 'worker-phase4-postgres-tenant-a',
      tenantId: tenantA,
      effectJournal,
      harnessOptions
    })
    const workerB = new OperationalExecutionWorker({
      store,
      workerId: 'worker-phase4-postgres-tenant-b',
      tenantId: tenantB,
      effectJournal,
      harnessOptions
    })

    try {
      const submittedA = await store.submit({
        tenantId: tenantA,
        idempotencyKey: `phase4-worker-a-${Date.now()}`,
        capabilityFingerprint: fingerprint,
        runtime: runtime(tenantA, operationKey, fingerprint)
      })
      const submittedB = await store.submit({
        tenantId: tenantB,
        idempotencyKey: `phase4-worker-b-${Date.now()}`,
        capabilityFingerprint: fingerprint,
        runtime: runtime(tenantB, operationKey, fingerprint)
      })

      const processedA = await workerA.processNext()
      const processedB = await workerB.processNext()

      expect(processedA.kind).toBe('processed')
      expect(processedB.kind).toBe('processed')
      if (processedA.kind !== 'processed' || processedB.kind !== 'processed') {
        throw new Error('Expected both PostgreSQL worker executions to process')
      }
      expect(processedA.record.id).toBe(submittedA.record.id)
      expect(processedB.record.id).toBe(submittedB.record.id)
      expect(processedA.record.state).toBe('SUCCEEDED')
      expect(processedB.record.state).toBe('SUCCEEDED')
      expect(observed.map(({ context }) => context.tenantId)).toEqual([
        tenantA,
        tenantB
      ])
      await expect(
        effectJournal.get(tenantA, operationKey)
      ).resolves.toMatchObject({
        state: 'CONFIRMED',
        tenantId: tenantA
      })
      await expect(
        effectJournal.get(tenantB, operationKey)
      ).resolves.toMatchObject({
        state: 'CONFIRMED',
        tenantId: tenantB
      })
    } finally {
      await teardownDatabase(setup)
    }
  }, 90_000)

  it('recovers a durable approval and executes the capability after fresh worker composition', async () => {
    const setup = await setupDatabase()
    const observed: ObservedExecution[] = []
    const registry = createCapabilityRegistry([
      capability(observed, { requiresApproval: true })
    ])
    const fingerprint = registry.compositionFingerprint()
    const operationKey = `phase4-postgres-approval-${Date.now()}`
    const store = new PostgresOperationalExecutionStore(
      setup.pool as unknown as PostgresPoolLike
    )
    const approvalAuthority = new PostgresApprovalAuthority(
      setup.pool as unknown as PostgresPoolLike
    )
    const approvals = new DurableApprovalEngineAdapter(approvalAuthority)
    const effectJournal = new PostgresOperationalEffectJournal(
      setup.pool as unknown as PostgresPoolLike
    )
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-phase4-postgres-approval-initial',
      tenantId: tenantA,
      effectJournal,
      harnessOptions: { ...ports(approvals), capabilities: registry }
    })

    try {
      const submitted = await store.submit({
        tenantId: tenantA,
        idempotencyKey: `phase4-approval-${Date.now()}`,
        capabilityFingerprint: fingerprint,
        runtime: runtime(tenantA, operationKey, fingerprint)
      })
      const waiting = await worker.processNext()

      expect(waiting.kind).toBe('processed')
      if (waiting.kind !== 'processed') {
        throw new Error(
          'Expected approval execution to reach a processed state'
        )
      }
      expect(waiting.record.id).toBe(submitted.record.id)
      expect(waiting.record.state).toBe('WAITING_APPROVAL')
      expect(waiting.record.approvalId).toEqual(expect.any(String))
      const approvalId = waiting.record.approvalId as string
      await expect(
        approvalAuthority.get(tenantA, approvalId)
      ).resolves.toMatchObject({
        status: 'PENDING',
        approvalId
      })

      await approvalAuthority.approve(tenantA, approvalId, {
        approverId: 'synthetic-phase4-approver'
      })
      await store.resolveApproval({
        tenantId: tenantA,
        executionId: submitted.record.id,
        approvalId,
        actorId: 'synthetic-phase4-approver',
        decision: 'APPROVED'
      })

      await setup.pool.end()
      const restartedPool = new Pool({
        connectionString: roleUrl(setup.role),
        options: `-c search_path=${setup.schema}`
      })
      setup.pool = restartedPool
      const restartedStore = new PostgresOperationalExecutionStore(
        restartedPool as unknown as PostgresPoolLike
      )
      const restartedAuthority = new PostgresApprovalAuthority(
        restartedPool as unknown as PostgresPoolLike
      )
      const restartedApprovals = new DurableApprovalEngineAdapter(
        restartedAuthority
      )
      const restartedJournal = new PostgresOperationalEffectJournal(
        restartedPool as unknown as PostgresPoolLike
      )
      const restartedWorker = new OperationalExecutionWorker({
        store: restartedStore,
        workerId: 'worker-phase4-postgres-approval-restarted',
        tenantId: tenantA,
        effectJournal: restartedJournal,
        harnessOptions: {
          ...ports(restartedApprovals),
          capabilities: registry
        }
      })

      const completed = await restartedWorker.processNext()

      expect(completed.kind).toBe('processed')
      if (completed.kind !== 'processed') {
        throw new Error('Expected approved execution to complete after restart')
      }
      expect(completed.record.state).toBe('SUCCEEDED')
      expect(completed.record.result?.stopReason).toBe('COMPLETED')
      expect(observed).toHaveLength(1)
      await expect(
        restartedAuthority.get(tenantA, approvalId)
      ).resolves.toMatchObject({
        status: 'EXECUTED',
        approvalId
      })
      await expect(
        restartedJournal.get(tenantA, operationKey)
      ).resolves.toMatchObject({ state: 'CONFIRMED', tenantId: tenantA })
    } finally {
      await teardownDatabase(setup)
    }
  }, 90_000)
})
