// SPEC0224 TR05: native bound PostgreSQL CAS only; no runtime/model acceptance.
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  EMPTY_BUDGET_USAGE,
  canonicalizeCompleteJson,
  type ExecutionCheckpoint
} from '@cvg/harness-contracts'
import { sealCheckpoint } from '@cvg/harness'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  createControlledCapabilityGateway,
  createTraceId,
  prepareControlledPublishedAdmission,
  controlledDigest,
  type ControlledPublishedPrepared
} from '@cvg/platform'
import { createCorrelationId } from '@cvg/shared'
import { runPostgresMigrations } from '../postgres-migrations.ts'
import { PostgresControlledPublishedKernelStore } from '../controlled-published-kernel-store.ts'
import { PostgresExecutionStepStore } from '../operational-step-postgres.ts'
import { TenantScopedPostgresCapabilityApprovalRepository } from '../tenant-scoped-capability-approval-repository.ts'
import {
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  withTenantTransaction
} from '../tenant-scoped-postgres.ts'

const resourcePath = process.env.SPEC0224_FENCE_RESOURCE
const evidence = process.env.SPEC0224_FENCE_EVIDENCE
if (!resourcePath || !evidence)
  throw new Error(
    'Assigned SPEC0224 fence resource/evidence required; never skip'
  )
const tenantId = 'tenant_00000000-0000-4000-8000-000000000224'
const executionId = `exec_${randomUUID()}`
let admin: Client | undefined
let pool: Pool | undefined
let schema: string
let role: string
const emit = async (name: string, value: unknown) => {
  await writeFile(
    resolve(evidence, `${name}.json`),
    JSON.stringify(value, null, 2) + '\n'
  )
  console.info('SPEC0224_FENCE', name)
}
const token = (cp: ExecutionCheckpoint) => ({
  checkpointId: cp.checkpointId,
  digest: cp.digest
})

// Pure synthetic checkpoint payload, not a claim of tool/model execution.
function checkpoint(label: string): ExecutionCheckpoint {
  const output = { synthetic: 'bound-fence', value: 'x'.repeat(4096), label }
  const raw = canonicalizeCompleteJson(output)
  return sealCheckpoint({
    tenantId,
    executionId,
    checkpointVersion: 2,
    runtimeProfile: 'iterative',
    runtimeVersion: '2.0.0',
    orchestratorVersion: '1.0.0',
    stepNumber: 1,
    state: {
      goal: 'synthetic bound CAS only',
      stepNumber: 1,
      openQuestions: [],
      resolvedInputs: {},
      loopSignatures: [],
      observations: [
        {
          observationId: 'obs_fence',
          stepId: 'step_fence',
          executionId,
          stepNumber: 1,
          type: 'TOOL_RESULT',
          source: 'TOOL',
          trust: 'UNTRUSTED',
          payload: {
            schemaVersion: 1,
            status: 'SUCCEEDED',
            sideEffect: 'NONE',
            completion: 'COMPLETE',
            resultAvailability: 'AVAILABLE',
            output,
            outputBytes: Buffer.byteLength(raw),
            outputSha256: createHash('sha256').update(raw).digest('hex')
          },
          summary: 'synthetic fixture',
          provenance: { sourceId: 'synthetic-fence-fixture' },
          timestamp: '2026-10-16T00:00:00.000Z'
        }
      ],
      toolResultContext: {
        version: 1,
        deliveredThroughStep: 0,
        pendingDecisionAdmission: null,
        decisionAdmissions: []
      }
    },
    budgetUsage: {
      ...EMPTY_BUDGET_USAGE,
      steps: 1,
      modelCalls: 1,
      inputTokens: 100,
      outputTokens: 32,
      costUsd: 0.01
    }
  })
}

describe('SPEC0224 TR05 native bound checkpoint V2 CAS', () => {
  beforeAll(async () => {
    const resource = JSON.parse(await readFile(resourcePath, 'utf8')) as {
      test_database_url: string
      containerId: string
      synthetic: boolean
      exclusiveClaim: string
      schemaName: string
      roleName: string
      hostPort: { HostIp: string; HostPort: string }
    }
    const url = new URL(resource.test_database_url)
    if (
      resource.containerId !==
        '0f148bb34b78385de5c7d70bd0f807658918e13295c6645a0daedf4680d2681c' ||
      resource.synthetic !== true ||
      !resource.exclusiveClaim ||
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/pare224_synthetic' ||
      url.username !== 'pare224' ||
      resource.hostPort.HostIp !== '127.0.0.1' ||
      url.port !== resource.hostPort.HostPort ||
      !/^pare224_fence[a-z0-9_]*$/.test(resource.schemaName) ||
      !/^pare224_fence[a-z0-9_]*$/.test(resource.roleName)
    )
      throw new Error('Refusing non-assigned PG224 resource')
    schema = resource.schemaName
    role = resource.roleName
    admin = new Client({ connectionString: url.toString() })
    await admin.connect()
    // CREATE without IF NOT EXISTS refuses reuse of any earlier fixture.
    await admin.query(`CREATE SCHEMA ${schema}`)
    await runPostgresMigrations(admin, {
      schemaName: schema,
      createSchema: false
    })
    const password = randomBytes(24).toString('hex')
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${role}`
    )
    await admin.query(
      `REVOKE DELETE ON ${schema}.controlled_published_bindings FROM ${role}`
    )
    await admin.query(
      `REVOKE UPDATE,DELETE ON ${schema}.controlled_published_evidence FROM ${role}`
    )
    await admin.query(
      `GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schema} TO ${role}`
    )
    url.username = role
    url.password = password
    pool = new Pool({
      connectionString: url.toString(),
      max: 2,
      options: `-c search_path=${schema} -c lock_timeout=1500 -c statement_timeout=3000`
    })
    await emit(
      'serving-identity',
      (
        await pool.query(
          `SELECT current_user,session_user,current_database(),current_schema(),
      r.rolsuper,r.rolbypassrls,r.rolinherit,
      (SELECT count(*)::int FROM pg_auth_members WHERE member=r.oid) AS memberships,
      (SELECT count(*)::int FROM pg_namespace WHERE nspname=$1 AND nspowner=r.oid) AS owned_schemas,
      (SELECT count(*)::int FROM pg_class WHERE relnamespace=$1::regnamespace AND relowner=r.oid) AS owned_relations
      FROM pg_roles r WHERE rolname=current_user`,
          [schema]
        )
      ).rows
    )
    const identity = (
      await pool.query(
        `SELECT rolsuper,rolbypassrls,rolinherit FROM pg_roles WHERE rolname=current_user`
      )
    ).rows[0]
    expect(identity).toEqual({
      rolsuper: false,
      rolbypassrls: false,
      rolinherit: false
    })
    const saved = JSON.parse(
      await readFile(resolve(evidence, 'serving-identity.json'), 'utf8')
    )[0]
    expect(saved.current_user).toBe(role)
    expect(saved.session_user).toBe(role)
    expect(saved.current_database).toBe('pare224_synthetic')
    expect(saved.memberships).toBe(0)
    expect(saved.owned_schemas).toBe(0)
    expect(saved.owned_relations).toBe(0)
    const rls = (
      await pool.query(
        `SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class
      WHERE relnamespace=$1::regnamespace AND relname=ANY($2) ORDER BY relname`,
        [
          schema,
          [
            'controlled_published_bindings',
            'controlled_published_evidence',
            'operational_execution_checkpoints'
          ]
        ]
      )
    ).rows
    expect(rls).toHaveLength(3)
    for (const row of rls) {
      expect(row.relrowsecurity).toBe(true)
      expect(row.relforcerowsecurity).toBe(true)
    }
    await emit('native-rls', rls)
    await emit(
      'native-triggers-before',
      (
        await pool.query(
          `SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=$1::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
          [schema]
        )
      ).rows
    )
  })
  afterAll(async () => {
    // Preserve all own schema/roles/data for Lead inspection. Stop container externally.
    await pool?.end()
    await admin?.end()
  })

  it('applies with native prepared OPEN authority, rejects old token/absent/stale/expired fence and simple V2 save without mutating prior state', async () => {
    if (!pool) throw new Error('Serving pool not provisioned')
    const serving = pool
    const repository = new TenantScopedPostgresRuntimeRepository(serving)
    const published = new PostgresControlledPublishedKernelStore(serving)
    const config = AgentConfigSchema.parse({
      persona: { name: 'Synthetic224', role: 'assistant', tone: 'calm' },
      greeting: 'Synthetic.',
      promptBlocks: [],
      responseTemplates: {},
      model: {
        provider: 'fake',
        model: 'deterministic-v1',
        temperature: 0,
        maxTokens: 128,
        timeoutMs: 3000,
        retries: 0,
        secretRef: 'secret://controlled/synthetic'
      },
      policies: {
        version: 'synthetic224',
        minConfidence: 0.7,
        lowConfidence: 'clarify',
        maxClarifications: 2,
        enabledActions: ['respond'],
        approvalActions: [],
        blockedActions: []
      },
      plugins: [],
      knowledge: [],
      handoff: {
        lowConfidenceDestination: 'synthetic',
        destinations: ['synthetic'],
        maxClarifications: 2
      }
    })
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: `fence-${randomUUID()}`,
        name: 'Synthetic224',
        description: 'Synthetic only'
      }
    )
    const version = await platform.createVersion(
      { tenantId },
      agent.id,
      config,
      'synthetic'
    )
    // Published catalog provisioning is fixture DML, not fabricated native admission/binding.
    await withTenantTransaction(serving, tenantId, async (c) => {
      await c.query(
        `INSERT INTO platform_agents(tenant_id,id,slug,name,description) VALUES($1,$2,$3,'Synthetic224','Synthetic only')`,
        [tenantId, agent.id, agent.slug]
      )
      await c.query(
        `INSERT INTO platform_agent_versions(tenant_id,id,agent_id,version,status,config,created_by) VALUES($1,$2,$3,1,'PUBLISHED',$4::jsonb,'synthetic')`,
        [tenantId, version.id, agent.id, JSON.stringify(config)]
      )
    })
    const inbound = await repository.createWithSession({
      tenantId,
      channel: 'web',
      senderRef: `synthetic-${randomUUID()}`,
      externalMessageId: randomUUID(),
      body: 'Synthetic fence proof'
    })
    const event = await repository.enqueue({
      tenantId,
      type: 'inbound.process',
      idempotencyKey: `synthetic224:${randomUUID()}`,
      payload: { synthetic: true },
      conversationId: inbound.conversation.id,
      sessionId: inbound.session.id,
      inboundMessageId: inbound.message.id
    })
    const claimed = await repository.claimNextFenced({
      tenantId,
      workerId: `synthetic224:${randomUUID()}`,
      eventId: event.id
    })
    if (!claimed) throw new Error('Native outer claim unavailable')
    const input = {
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      traceId: createTraceId(),
      executionId,
      correlationId: createCorrelationId(),
      inboundMessageId: inbound.message.id,
      message: 'Synthetic fence proof',
      history: [],
      executionMode: 'CONTROLLED_RUNTIME' as const,
      requireCapabilityApproval: false,
      context: {
        conversationId: inbound.conversation.id,
        sessionId: inbound.session.id
      }
    }
    const gateway = createControlledCapabilityGateway({
      approvalAuthority: new TenantScopedPostgresCapabilityApprovalRepository(
        serving
      )
    })
    const admission = prepareControlledPublishedAdmission({
      version,
      input,
      actor: {
        id: 'system.controlled-runtime',
        role: 'System',
        permissions: []
      },
      gateway
    })
    const admitted = await published.admit(admission, claimed.claimRef)
    const claim = await published.claim(executionId, claimed.claimRef)
    expect(claim.disposition).toBe('ACTIVE')
    const host = published.createHost(
      claim,
      { assertActive() {}, requestStop() {}, async stopAndJoin() {} },
      new AbortController().signal
    )
    const prepared: ControlledPublishedPrepared = {
      schema: 'controlled-published-prepared-v1',
      requestDigest: claim.requestDigest,
      fingerprint: claim.fingerprint,
      message: input.message,
      history: [],
      promptWithHistory: 'Synthetic prepared prompt',
      intent: 'respond',
      policy: {
        decision: 'allowed',
        reason: 'synthetic',
        layer: 'agent_behavior',
        policyVersion: 'synthetic224'
      },
      risk: { level: 'low', reason: 'synthetic' },
      response: { mode: 'answer', text: 'Synthetic.' },
      sourceIds: [],
      configDigest: controlledDigest(config)
    }
    const started = await host.continuation.startPrepared(
      host.identity,
      prepared,
      admission.runtime
    )
    const phase = await host.continuation.beginPhase(
      host.identity,
      claim.state.sealId,
      'checkpoint.bound-cas',
      controlledDigest({ synthetic: true })
    )
    await emit('native-admission-claim-prepared-phase', {
      admitted,
      admission,
      claim,
      identity: host.identity,
      fence: claim.fence,
      prepared,
      started,
      phase
    })
    const steps = new PostgresExecutionStepStore(serving, {
      fence: claim.fence
    })
    const first = checkpoint('complete')
    const firstResult = await steps.compareAndSwapCheckpoint({
      tenantId,
      executionId,
      expected: null,
      next: first
    })
    await emit('positive-initial', { checkpoint: first, result: firstResult })
    expect(firstResult).toEqual({ status: 'APPLIED', token: token(first) })
    const {
      checkpointId: _id,
      createdAt: _at,
      digest: _digest,
      ...unsigned
    } = first
    void _id
    void _at
    void _digest
    const current = sealCheckpoint(unsigned)
    const updated = await steps.compareAndSwapCheckpoint({
      tenantId,
      executionId,
      expected: token(first),
      next: current
    })
    await emit('positive-update', { checkpoint: current, result: updated })
    expect(updated).toEqual({ status: 'APPLIED', token: token(current) })
    expect(await steps.loadCheckpoint(tenantId, executionId)).toEqual(current)

    const snapshot = () =>
      withTenantContext(serving, tenantId, async (c) => {
        const result: Record<string, unknown> = {}
        for (const table of [
          'operational_execution_checkpoints',
          'operational_executions',
          'operational_execution_outbox',
          'controlled_published_bindings',
          'controlled_published_evidence',
          'operational_execution_steps',
          'operational_execution_events',
          'outbox_events',
          'outbox_attempts',
          'effect_journal',
          'operational_effect_journal'
        ]) {
          result[table] = (
            await c.query(
              `SELECT to_jsonb(t) AS row FROM ${table} t ORDER BY to_jsonb(t)::text`
            )
          ).rows
        }
        return result
      })
    const before = await snapshot()
    await emit('snapshot-before-negatives', before)
    const binding = (
      before.controlled_published_bindings as { row: Record<string, unknown> }[]
    )[0]!.row
    expect(binding.phase_state).toBe('OPEN')
    expect(binding.open_phase_acked).toBe(false)
    expect(binding.prepared_digest).toBe(controlledDigest(prepared))
    // A refused write proposes new result data and a larger budget, while
    // retaining the already committed result. The baseline must stay exact.
    const proposedObservation =
      checkpoint('must-never-persist').state.observations[0]!
    const next = sealCheckpoint({
      ...unsigned,
      stepNumber: 2,
      state: {
        ...unsigned.state,
        stepNumber: 2,
        observations: [
          ...unsigned.state.observations,
          {
            ...proposedObservation,
            observationId: 'obs_refused',
            stepId: 'step_refused',
            stepNumber: 2
          }
        ]
      },
      budgetUsage: {
        ...unsigned.budgetUsage,
        steps: 2,
        modelCalls: 2,
        inputTokens: 200,
        outputTokens: 64,
        costUsd: 0.02
      }
    })
    await emit('refused-candidate', next)
    const cas = { tenantId, executionId, expected: token(current), next }
    const unchanged = async (name: string) => {
      const after = await snapshot()
      await emit(`snapshot-${name}`, after)
      expect(after).toEqual(before)
      expect(await steps.loadCheckpoint(tenantId, executionId)).toEqual(current)
    }
    const oldToken = await steps.compareAndSwapCheckpoint({
      ...cas,
      expected: token(first)
    })
    await emit('negative-old-token', oldToken)
    expect(oldToken).toEqual({
      status: 'CONFLICT',
      currentToken: token(current)
    })
    await unchanged('old-token')
    const refusal = async (
      name: string,
      action: () => unknown,
      code: string
    ) => {
      let failure: unknown
      try {
        await action()
      } catch (error) {
        failure = error
      }
      await emit(
        `negative-${name}`,
        failure instanceof Error
          ? {
              name: failure.name,
              message: failure.message,
              code: (failure as Error & { code?: string }).code,
              stack: failure.stack
            }
          : { failure: String(failure) }
      )
      expect(failure).toMatchObject({ code })
      await unchanged(name)
    }
    await refusal(
      'absent-fence',
      () =>
        new PostgresExecutionStepStore(serving).compareAndSwapCheckpoint(cas),
      'lease_lost'
    )
    await refusal(
      'stale-attempt-fence',
      () =>
        new PostgresExecutionStepStore(serving, {
          fence: { ...claim.fence, attempt: claim.fence.attempt + 1 }
        }).compareAndSwapCheckpoint(cas),
      'lease_lost'
    )
    await refusal(
      'simple-v2-save',
      () => steps.saveCheckpoint(next),
      'checkpoint_version'
    )
    const clock = (await serving.query('SELECT clock_timestamp() AS now'))
      .rows[0]!.now as Date
    const delay = Date.parse(started.expiresAt) - clock.getTime() + 100
    expect(delay).toBeGreaterThan(0)
    expect(delay).toBeLessThanOrEqual(12100)
    await emit('expiry-wait', {
      clock,
      started,
      delayMs: delay,
      mechanism: 'natural DB deadline, no SQL lease edits, no renewal'
    })
    await new Promise((done) => setTimeout(done, delay))
    const afterClock = (await serving.query('SELECT clock_timestamp() AS now'))
      .rows[0]!.now as Date
    expect(afterClock.getTime()).toBeGreaterThanOrEqual(
      Date.parse(started.expiresAt)
    )
    await emit('expired-db-clock', {
      now: afterClock,
      expiresAt: started.expiresAt
    })
    await refusal(
      'expired-native-fence',
      () => steps.compareAndSwapCheckpoint(cas),
      'lease_lost'
    )
    await emit(
      'native-triggers-after',
      (
        await serving.query(
          `SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace=$1::regnamespace AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`,
          [schema]
        )
      ).rows
    )
    expect(
      JSON.parse(
        await readFile(resolve(evidence, 'native-triggers-after.json'), 'utf8')
      )
    ).toEqual(
      JSON.parse(
        await readFile(resolve(evidence, 'native-triggers-before.json'), 'utf8')
      )
    )
    await emit('result', {
      status: 'BUILDER_EVIDENCE_ONLY',
      observed:
        'two APPLIED native OPEN fence CAS; stale token CONFLICT; absent/stale-attempt/expired fence lease_lost; simple V2 save checkpoint_version; full row snapshots identical',
      fixture:
        'synthetic checkpoint/result/usage and prepared object supplied through native APIs; no model/tool body executed',
      acceptance: false
    })
  })
})
