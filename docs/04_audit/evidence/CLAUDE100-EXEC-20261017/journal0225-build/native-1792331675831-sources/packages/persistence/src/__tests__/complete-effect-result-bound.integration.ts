import assert from 'node:assert/strict'
import { before, after, describe, it } from 'node:test'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QueryResultRow } from 'pg'
import type {
  ModelGateway,
  ModelRequest,
  DecisionInputCounter,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import {
  verifyNativeJournalBinding,
  journalTenant,
  journalSchema,
  type NativeJournalBinding
} from './fixtures/journal-result-process.ts'
import { createJournalResourceFixture } from './fixtures/journal-result-resource.ts'

let binding: NativeJournalBinding
let resource: ReturnType<typeof createJournalResourceFixture>
before(async () => {
  binding = verifyNativeJournalBinding()
  assert.equal(binding.profile, 'bound-journal')
  resource = createJournalResourceFixture(binding)
  await resource.setup()
})
after(async () => {
  await resource?.cleanup()
})
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const output = { n: null, nul: '\0', fixture: 'bound-j225' }
function save(label: string, name: string, value: unknown) {
  const dir = join(binding.evidenceRoot, binding.runId + '-bound', label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, name + '.json'),
    JSON.stringify(value, null, 2) + '\n'
  )
}

async function prepare(label: string, timeoutMs = 30000) {
  verifyNativeJournalBinding()
  const platform = await import('../../../platform/dist/index.js')
  const persistence = await import('@cvg/persistence')
  const { createCorrelationId } = await import('@cvg/shared')
  const tenantId = platform.TenantIdSchema.parse(journalTenant)
  const config = platform.AgentConfigSchema.parse({
    persona: { name: 'Synthetic bound225', role: 'assistant', tone: 'calm' },
    greeting: 'Synthetic.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 512,
      timeoutMs,
      retries: 0
    },
    policies: {
      version: 'synthetic225-bound',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [
      {
        plugin: 'scheduling.controlled',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['find_available_slots'],
        config: {}
      }
    ],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'synthetic',
      destinations: ['synthetic'],
      maxClarifications: 2
    }
  })
  const control = new platform.InMemoryControlPlaneStore()
  const agent = await control.createAgent(
    { tenantId },
    {
      slug: 'j225-' + randomUUID(),
      name: 'Synthetic',
      description: 'Synthetic only'
    }
  )
  const version = await control.createVersion(
    { tenantId },
    agent.id,
    config,
    'synthetic'
  )
  await persistence.withTenantTransaction(
    resource.pool,
    tenantId,
    async (client) => {
      await client.query(
        "INSERT INTO platform_agents(tenant_id,id,slug,name,description) VALUES($1,$2,$3,'Synthetic','Fixture')",
        [tenantId, agent.id, agent.slug]
      )
      await client.query(
        "INSERT INTO platform_agent_versions(tenant_id,id,agent_id,version,status,config,created_by) VALUES($1,$2,$3,1,'PUBLISHED',$4::jsonb,'synthetic')",
        [tenantId, version.id, agent.id, JSON.stringify(config)]
      )
    }
  )
  const repo = new persistence.TenantScopedPostgresRuntimeRepository(
    resource.pool
  )
  const inbound = await repo.createWithSession({
    tenantId,
    channel: 'web',
    senderRef: 'synthetic-' + randomUUID(),
    externalMessageId: randomUUID(),
    body: 'Synthetic ' + label
  })
  const event = await repo.enqueue({
    tenantId,
    type: 'inbound.process',
    idempotencyKey: 'j225:' + randomUUID(),
    payload: { synthetic: true },
    conversationId: inbound.conversation.id,
    sessionId: inbound.session.id,
    inboundMessageId: inbound.message.id
  })
  const outer = await repo.claimNextFenced({
    tenantId,
    eventId: event.id,
    workerId: 'j225:' + randomUUID(),
    leaseMs: 30000
  })
  assert(outer)
  const input = {
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    traceId: platform.createTraceId(),
    executionId: 'exec_' + randomUUID(),
    correlationId: createCorrelationId(),
    inboundMessageId: inbound.message.id,
    message: 'Synthetic ' + label,
    history: [],
    executionMode: 'CONTROLLED_RUNTIME' as const,
    requireCapabilityApproval: false,
    context: {
      conversationId: inbound.conversation.id,
      sessionId: inbound.session.id
    }
  }
  const gateway = platform.createControlledCapabilityGateway({
    approvalAuthority:
      new persistence.TenantScopedPostgresCapabilityApprovalRepository(
        resource.pool
      )
  })
  const { controlledInventory } =
    await import('../../../platform/dist/controlled-kernel-continuation.js')
  const inventory = controlledInventory(config, gateway)
  assert.equal(inventory.length, 1)
  const admission = platform.prepareControlledPublishedAdmission({
    version,
    input,
    actor: { id: 'system.controlled-runtime', role: 'System', permissions: [] },
    gateway
  })
  const published = new persistence.PostgresControlledPublishedKernelStore(
    resource.pool
  )
  const admitted = await published.admit(admission, outer.claimRef)
  const claim = await published.claim(input.executionId, outer.claimRef)
  assert.equal(claim.disposition, 'ACTIVE')
  const signal = new AbortController().signal
  const host = published.createHost(
    claim,
    { assertActive() {}, requestStop() {}, async stopAndJoin() {} },
    signal
  )
  const prepared = {
    schema: 'controlled-published-prepared-v1' as const,
    requestDigest: claim.requestDigest,
    fingerprint: claim.fingerprint,
    message: input.message,
    history: [],
    promptWithHistory: 'Synthetic trusted preparation',
    intent: 'respond',
    policy: {
      decision: 'allowed' as const,
      reason: 'synthetic',
      layer: 'agent_behavior' as const,
      policyVersion: config.policies.version
    },
    risk: { level: 'low' as const, reason: 'synthetic' },
    response: { mode: 'answer' as const, text: 'Synthetic' },
    sourceIds: [],
    configDigest: platform.controlledDigest(config)
  }
  const started = await host.continuation.startPrepared(
    host.identity,
    prepared,
    admission.runtime
  )
  const phase = await host.continuation.beginPhase(
    host.identity,
    claim.state.sealId,
    'journal.bound-positive',
    platform.controlledDigest({ synthetic: true, label })
  )
  save(label, 'authority', {
    provenance:
      'Synthetic catalog and trusted preparation; actual native inbound/outbox/admit/claim/startPrepared/beginPhase. Not published adapter integration.',
    admission,
    admitted,
    claim,
    prepared,
    started,
    phase
  })
  return { admission, claim, descriptor: inventory[0]!.descriptor, host, phase }
}

function tracedConnection() {
  let serial = 0
  const trace: {
    client: number
    transaction: number
    sql: string
    dbNow?: string
  }[] = []
  const connection = {
    connect: async () => {
      const client = await resource.pool.connect()
      const id = ++serial
      let transaction = 0
      return {
        release: (error?: Error) => client.release(error),
        query: async <T extends QueryResultRow = QueryResultRow>(
          text: string,
          values?: unknown[]
        ) => {
          if (text === 'BEGIN') transaction++
          const entry: (typeof trace)[number] = {
            client: id,
            transaction,
            sql: text.trim().replace(/\s+/g, ' ')
          }
          trace.push(entry)
          const result = await client.query<T>(text, values)
          if (entry.sql === 'SELECT clock_timestamp() AS now')
            entry.dbNow = new Date(
              result.rows[0]!.now as string | Date
            ).toISOString()
          return result
        }
      }
    }
  }
  return { connection, trace }
}

function journalLockOrder(trace: ReturnType<typeof tracedConnection>['trace']) {
  const transactions = new Map<string, string[]>()
  for (const entry of trace) {
    const table = /FROM (\w+) .*FOR UPDATE/.exec(entry.sql)?.[1]
    if (table) {
      const key = entry.client + ':' + entry.transaction
      const locks = transactions.get(key) ?? []
      locks.push(table)
      transactions.set(key, locks)
    }
  }
  const journal = [...transactions.values()].filter((locks) =>
    locks.includes('operational_effect_journal')
  )
  assert(journal.length >= 3)
  for (const locks of journal)
    assert.deepEqual(locks.slice(0, 8), [
      'operational_executions',
      'controlled_published_bindings',
      'operational_execution_outbox',
      'outbox_events',
      'outbox_attempts',
      'sessions',
      'kernel_pause_switches',
      'operational_effect_journal'
    ])
  return journal
}

async function physical(executionId: string) {
  const { withTenantContext, PostgresExecutionStepStore } =
    await import('@cvg/persistence')
  const { TenantIdSchema } = await import('@cvg/platform')
  return withTenantContext(
    resource.pool,
    TenantIdSchema.parse(journalTenant),
    async (client) => {
      const journal = (
        await client.query(
          'SELECT to_jsonb(j) AS row FROM operational_effect_journal j WHERE tenant_id=$1 AND operation_key=$2',
          [journalTenant, executionId + ':s2:find_available_slots']
        )
      ).rows
      const authority = (
        await client.query(
          'SELECT to_jsonb(b) AS row FROM controlled_published_bindings b WHERE tenant_id=$1 AND execution_id=$2',
          [journalTenant, executionId]
        )
      ).rows
      const identity = (
        await client.query(
          'SELECT current_user,session_user,pg_backend_pid() AS pid'
        )
      ).rows[0]
      const parent = (
        await client.query(
          'SELECT to_jsonb(e) AS row FROM operational_executions e WHERE tenant_id=$1 AND id=$2',
          [journalTenant, executionId]
        )
      ).rows
      const queue = (
        await client.query(
          'SELECT to_jsonb(e) AS row FROM operational_execution_outbox e WHERE tenant_id=$1 AND execution_id=$2',
          [journalTenant, executionId]
        )
      ).rows
      const outer = (
        await client.query(
          'SELECT to_jsonb(e) AS row FROM outbox_events e WHERE tenant_id=$1 AND id=(SELECT outbox_id FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2)',
          [journalTenant, executionId]
        )
      ).rows
      const attempts = (
        await client.query(
          'SELECT to_jsonb(e) AS row FROM outbox_attempts e WHERE tenant_id=$1 AND event_id=(SELECT outbox_id FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2) ORDER BY id',
          [journalTenant, executionId]
        )
      ).rows
      const guards = (
        await client.query(
          'SELECT tgname,tgenabled FROM pg_trigger WHERE tgrelid=$1::regclass AND NOT tgisinternal ORDER BY tgname',
          [journalSchema + '.operational_effect_journal']
        )
      ).rows
      // Use this same checked-out client; the fixture pool intentionally has one slot.
      const steps = new PostgresExecutionStepStore({
        query: client.query.bind(client)
      })
      return {
        journal,
        authority,
        identity,
        parent,
        queue,
        outer,
        attempts,
        guards,
        checkpoint: await steps.loadCheckpoint(journalTenant, executionId),
        steps: await steps.listSteps(journalTenant, executionId)
      }
    }
  )
}

describe(
  'SPEC0225 J13 native bound positive — no published activation',
  { concurrency: false },
  () => {
    it('confirms a synthetic tool through both native fence and mode1 guards', async () => {
      const label = 'wrapper'
      const f = await prepare(label)
      const { PostgresOperationalEffectJournal } =
        await import('@cvg/persistence')
      const { createJournaledToolRegistry } = await import('@cvg/harness')
      const { connection, trace } = tracedConnection()
      const journal = new PostgresOperationalEffectJournal(connection, {
        fence: f.claim.fence,
        resultStorage: { version: 1 }
      })

      let bodies = 0
      const tool = {
        ...f.descriptor,
        execute: async () => {
          bodies++
          return { status: 'SUCCEEDED' as const, output }
        }
      }
      const wrapped = createJournaledToolRegistry(
        {
          list: () => [tool],
          resolve: (id) => (id === tool.id ? tool : undefined)
        },
        journal,
        { compositionFingerprint: f.admission.fingerprint }
      )
      const result = await wrapped.resolve(tool.id)!.execute({}, {
        tenantId: journalTenant,
        agentId: f.admission.runtime.agent.id,
        traceId: f.admission.runtime.traceId,
        correlationId: f.admission.runtime.correlationId,
        operationKey: f.admission.input.executionId + ':s2:find_available_slots'
      } as ToolExecutionContext)
      assert.deepEqual(result, { status: 'SUCCEEDED', output })
      assert.equal(bodies, 1)
      const read = await journal.get(
        journalTenant,
        f.admission.input.executionId + ':s2:find_available_slots'
      )
      assert(read?.state === 'CONFIRMED')
      assert.deepEqual(read.result, output)
      assert.equal(
        Object.getOwnPropertyDescriptor(
          read,
          Symbol.for('cvg.journal.validated-result.v1')
        )?.value,
        1
      )
      const durable = await physical(f.admission.input.executionId)
      assert.equal(durable.journal[0]!.row.result_storage_version, 1)
      assert.deepEqual(durable.guards, [
        { tgname: 'controlled_bound_journal_writer', tgenabled: 'O' },
        { tgname: 'journal_result_storage_guard', tgenabled: 'O' }
      ])
      const locks = journalLockOrder(trace)
      save(label, 'PASS', {
        scope: 'BOUND_NATIVE_WRAPPER_ONLY',
        bodies,
        modelCalls: 0,
        durable,
        locks,
        trace
      })
    })

    it('runs the public factory with an unchanged bound admission and one synthetic model call', async () => {
      const label = 'factory'
      const f = await prepare(label)
      const persistence = await import('@cvg/persistence')
      const harness = await import('@cvg/harness')
      const { HybridOrchestrator } = await import('@cvg/harness-orchestrator')
      const { canonicalizeCompleteJson } =
        await import('@cvg/harness-contracts')
      const { DeterministicModelProvider } = await import('@cvg/platform')
      const { connection, trace } = tracedConnection()
      let bodies = 0
      const capabilities = harness.createCapabilityRegistry([
        {
          descriptor: f.descriptor,
          implementation: {
            validateInput: () => true,
            validateOutput: () => true,
            execute: async () => {
              bodies++
              return { status: 'SUCCEEDED', output }
            }
          }
        }
      ])
      assert.equal(
        capabilities.compositionFingerprint(),
        f.admission.fingerprint
      )
      const original = canonicalizeCompleteJson(f.admission.runtime)
      const requests: ModelRequest[] = []
      const count = (value: unknown) =>
        Math.ceil(Buffer.byteLength(canonicalizeCompleteJson(value)) / 64)
      const model: ModelGateway = {
        complete: async (request) => {
          const { signal, ...wire } = request
          assert(!signal?.aborted)
          requests.push(structuredClone(wire))
          const frame = JSON.parse(request.messages![1]!.content)
          const observation = frame.items.find(
            (item: { value?: { type?: string } }) =>
              item.value?.type === 'TOOL_RESULT'
          )?.value
          assert(observation)
          assert.deepEqual(observation.payload.output, output)
          const text = JSON.stringify({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText:
              'Synthetic digest ' + sha(canonicalizeCompleteJson(output))
          })
          const result = await new DeterministicModelProvider().complete({
            prompt: canonicalizeCompleteJson(wire),
            fallbackText: text
          })
          assert.equal(result.externalCall, false)
          return {
            text: result.text,
            provider: result.provider,
            model: result.model,
            inputTokens: count(wire),
            outputTokens: count(result.text),
            costUsd: 0
          }
        }
      }
      const counter: DecisionInputCounter = {
        measure: async (request) => ({
          counterId: 'toy64',
          counterVersion: '1',
          provider: 'fake',
          model: 'deterministic-v1',
          formattingVersion: '1',
          inputUpperBoundTokens: count(request),
          contextWindowTokens: 100000,
          costUpperBoundUsd: 0
        })
      }
      const runtime = harness.createOperationalHarness({
        toolResultContext: { version: 1 },
        capabilities,
        effectJournal: new persistence.PostgresOperationalEffectJournal(
          connection,
          { fence: f.claim.fence, resultStorage: { version: 1 } }
        ),
        stepStore: new persistence.PostgresExecutionStepStore(connection, {
          fence: f.claim.fence
        }),
        iterativeOrchestrator: new HybridOrchestrator({
          decisionModel: model,
          decisionInputCounter: counter,
          decisionModelSupportsMaxOutputTokens: true,
          maxDecisionRepairs: 0,
          rules: [
            (context) =>
              context.stepNumber === 1
                ? {
                    decisionType: 'VERIFY',
                    reasonCode: 'EVIDENCE_INCOMPLETE',
                    verificationTarget: 'tool-result'
                  }
                : context.stepNumber === 2
                  ? {
                      decisionType: 'CALL_TOOL',
                      reasonCode: 'TOOL_REQUIRED',
                      toolId: f.descriptor.id,
                      toolVersion: f.descriptor.version,
                      toolInput: {}
                    }
                  : undefined
          ]
        }),
        modelGateway: model,
        policy: {
          evaluate: async () => ({
            outcome: 'ALLOW',
            reason: 'Pure synthetic fixture only',
            policyVersion: 'synthetic225-bound'
          })
        },
        approvals: {
          request: async () => ({
            status: 'PENDING',
            reason: 'Synthetic fixture does not admit sensitive effects'
          })
        },
        audit: { append: async () => {} },
        telemetry: { record: () => {} }
      })
      const result = await runtime.run(f.admission.runtime)
      const durable = await physical(f.admission.input.executionId)
      save(label, 'observed', { result, durable, requests, bodies, trace })
      assert.equal(result.stopReason, 'COMPLETED')
      assert.equal(bodies, 1)
      assert.equal(requests.length, 1)
      assert.equal(canonicalizeCompleteJson(f.admission.runtime), original)
      assert.deepEqual(
        durable.authority[0]!.row.admission_runtime,
        f.admission.runtime
      )
      assert.deepEqual(
        durable.authority[0]!.row.prepared_runtime,
        f.admission.runtime
      )
      assert.equal(durable.journal[0]!.row.state, 'CONFIRMED')
      assert.equal(durable.journal[0]!.row.result_storage_version, 1)
      assert.equal(durable.checkpoint!.budgetUsage.steps, 3)
      assert.equal(durable.checkpoint!.budgetUsage.modelCalls, 1)
      const receipts =
        durable.checkpoint!.state.toolResultContext!.decisionAdmissions
      assert.equal(receipts.length, 1)
      assert.equal(receipts[0]!.status, 'SETTLED')
      assert.equal(durable.steps.length, 3)
      const step = durable.steps.find((s) => s.stepNumber === 2)!
      assert.equal(step.status, 'SUCCEEDED')
      const observation = durable.checkpoint!.state.observations.find(
        (o) => o.type === 'TOOL_RESULT'
      )!
      assert.equal(step.observationRefs[0], observation.observationId)
      const locks = journalLockOrder(trace)
      save(label, 'PASS', {
        scope: 'BOUND_NATIVE_FACTORY_POSITIVE_ONLY',
        result,
        bodies,
        modelCalls: requests.length,
        originalAdmissionUnchanged: true,
        locks,
        durable
      })
    })
  }
)

function sameDurableSnapshot(
  before: Awaited<ReturnType<typeof physical>>,
  after: Awaited<ReturnType<typeof physical>>
) {
  const { identity: bi, ...bd } = before
  const { identity: ai, ...ad } = after
  assert(ai && bi)
  assert.equal(ai.current_user, bi.current_user)
  assert.equal(ai.session_user, bi.session_user)
  assert.deepEqual(ad, bd)
}

describe(
  'SPEC0225 J13 independent SQL barriers and encode lease',
  { concurrency: false },
  () => {
    for (const point of ['missing0029', 'mode0-under0029'] as const)
      it(
        point + ': independent rejection followed by valid mode1 control',
        async () => {
          const label = 'and-' + point
          const f = await prepare(label)
          const { withTenantTransaction, PostgresOperationalEffectJournal } =
            await import('@cvg/persistence')
          const { TenantIdSchema } = await import('@cvg/platform')
          const { guardControlledPublishedFence } =
            await import('../../dist/controlled-published-fencing.js')
          const op = f.claim.fence.executionId + ':s2:find_available_slots'
          const tenant = TenantIdSchema.parse(journalTenant)
          const insert = (version: 0 | 1, guarded: boolean) =>
            withTenantTransaction(resource.pool, tenant, async (client) => {
              const guard = guarded
                ? await guardControlledPublishedFence(client, f.claim.fence, {
                    requirePhase: true
                  })
                : undefined
              await client.query(
                "INSERT INTO operational_effect_journal(tenant_id,operation_key,proposal_hash,state,attempt_id,result_storage_version) VALUES($1,$2,'p','RESERVED','direct-a',$3)",
                [journalTenant, op, version]
              )
              await guard?.recheck()
            })
          const before = await physical(f.claim.fence.executionId)
          let error:
            | { code: string | undefined; message: string | undefined }
            | undefined
          try {
            await insert(
              point === 'missing0029' ? 1 : 0,
              point !== 'missing0029'
            )
          } catch (thrown) {
            const e = thrown as { code?: string; message?: string }
            error = { code: e.code, message: e.message }
          }
          const after = await physical(f.claim.fence.executionId)
          save(label, 'negative', {
            before,
            after,
            error,
            guarded: point !== 'missing0029',
            storageVersion: point === 'missing0029' ? 1 : 0
          })
          assert.equal(error?.code, '42501')
          assert.equal(
            error.message,
            point === 'missing0029'
              ? 'bound execution requires controlled fence context'
              : 'JOURNAL_STORAGE_MODE'
          )
          sameDurableSnapshot(before, after)
          assert.equal(after.journal.length, 0)
          await insert(1, true)
          const journal = new PostgresOperationalEffectJournal(resource.pool, {
            fence: f.claim.fence,
            resultStorage: { version: 1 }
          })
          await journal.markStarted({
            tenantId: journalTenant,
            operationKey: op,
            attemptId: 'direct-a'
          })
          await journal.confirm({
            tenantId: journalTenant,
            operationKey: op,
            attemptId: 'direct-a',
            result: null
          })
          const control = await journal.get(journalTenant, op)
          assert(
            control?.state === 'CONFIRMED' &&
              Object.hasOwn(control, 'result') &&
              control.result === null
          )
          const positive = await physical(f.claim.fence.executionId)
          save(label, 'PASS', {
            scope: 'BOUND_NATIVE_INDEPENDENT_SQL_BARRIERS',
            point,
            error,
            negativeDurableUnchanged: true,
            positiveMode1: positive,
            modelCalls: 0,
            toolBodies: 0
          })
        }
      )
    it('expires the actual outer lease between native clocks around encoding', async () => {
      const label = 'lease-during-encode'
      const f = await prepare(label)
      const { PostgresOperationalEffectJournal, withTenantContext } =
        await import('@cvg/persistence')
      const { TenantIdSchema } = await import('@cvg/platform')
      const { connection, trace } = tracedConnection()
      const journal = new PostgresOperationalEffectJournal(connection, {
        fence: f.claim.fence,
        resultStorage: { version: 1 }
      })
      const input = {
        tenantId: journalTenant,
        operationKey: f.claim.fence.executionId + ':s2:find_available_slots',
        proposalHash: 'p',
        attemptId: 'encode-a'
      }
      await journal.reserve(input)
      await journal.markStarted(input)
      const before = await physical(f.claim.fence.executionId)
      const value = Array(524287).fill(0) as number[]
      const offset = trace.length
      const expiration = await withTenantContext(
        resource.pool,
        TenantIdSchema.parse(journalTenant),
        async (client) =>
          (
            await client.query(
              "UPDATE outbox_events e SET lease_until=clock_timestamp()+interval '150 milliseconds' WHERE tenant_id=$1 AND id=$2 RETURNING to_jsonb(e) AS row",
              [journalTenant, f.claim.fence.outer.eventId]
            )
          ).rows[0]!
      )
      let error:
        | { code: string | undefined; message: string | undefined }
        | undefined
      try {
        await journal.confirm({ ...input, result: value })
      } catch (thrown) {
        const e = thrown as { code?: string; message?: string }
        error = { code: e.code, message: e.message }
      }
      const after = await physical(f.claim.fence.executionId)
      const confirmTrace = trace.slice(offset)
      const clocks = confirmTrace.filter((entry) => entry.dbNow !== undefined)
      const expiry = Date.parse(expiration.row.lease_until)
      save(label, 'observed', {
        error,
        before,
        after,
        expiration,
        clocks,
        confirmTrace,
        inputBytes: 1048575,
        inputNodes: 524288,
        inputHooks: false,
        clockMocked: false
      })
      assert.equal(error?.code, 'lease_lost')
      assert.equal(clocks.length, 4)
      assert(
        Date.parse(clocks[2]!.dbNow!) < expiry,
        'lease had already expired before encoding'
      )
      assert(
        Date.parse(clocks[3]!.dbNow!) >= expiry,
        'lease did not expire across encoding'
      )
      const second = confirmTrace.indexOf(clocks[2]!)
      const third = confirmTrace.indexOf(clocks[3]!)
      assert.equal(
        third,
        second + 1,
        'another SQL operation intervened across encode'
      )
      assert.match(
        confirmTrace[second - 1]!.sql,
        /FROM operational_effect_journal .*FOR UPDATE/
      )
      assert(
        !confirmTrace.some((entry) =>
          /^UPDATE operational_effect_journal\b/.test(entry.sql)
        )
      )
      assert(confirmTrace.some((entry) => entry.sql === 'ROLLBACK'))
      sameDurableSnapshot({ ...before, outer: [expiration] }, after)
      assert.equal(after.journal[0]!.row.state, 'EFFECT_STARTED')
      assert.equal(after.journal[0]!.row.result_storage_payload, null)
      save(label, 'PASS', {
        scope: 'BOUND_NATIVE_LEASE_DURING_ENCODE_ONLY',
        error,
        expiry,
        beforeEncode: clocks[2]!.dbNow,
        afterEncode: clocks[3]!.dbNow,
        noConfirmationUpdate: true,
        startedRowUnchanged: true,
        modelCalls: 0,
        toolBodies: 0
      })
    })
  }
)

const boundNegativePoints = [
  'worker',
  'attempt',
  'outer-attempt',
  'outer-worker',
  'outer-row',
  'missing-fence',
  'cancelled',
  'paused',
  'deadline',
  'phase-acked',
  'outer-lease',
  'outer-reclaimed'
] as const
describe(
  'SPEC0225 J13 bound refusal before tool body',
  { concurrency: false },
  () => {
    for (const point of boundNegativePoints)
      it(point + ': no body or durable change after refusal', async () => {
        const label = 'deny-' + point
        const f = await prepare(label, point === 'deadline' ? 300 : 30000)
        const { PostgresOperationalEffectJournal, withTenantContext } =
          await import('@cvg/persistence')
        const { TenantIdSchema } = await import('@cvg/platform')
        const { createJournaledToolRegistry } = await import('@cvg/harness')
        const tenant = TenantIdSchema.parse(journalTenant)
        const query = (text: string, values: unknown[]) =>
          withTenantContext(resource.pool, tenant, (client) =>
            client.query(text, values)
          )
        let fence = f.claim.fence
        if (point === 'worker')
          fence = {
            ...fence,
            workerId: 'j225:stale',
            outer: { ...fence.outer, processWorkerId: 'j225:stale' }
          }
        if (point === 'attempt')
          fence = { ...fence, attempt: fence.attempt + 1 }
        if (point === 'outer-attempt')
          fence = {
            ...fence,
            outer: {
              ...fence.outer,
              expectedOuterAttempt: fence.outer.expectedOuterAttempt + 1
            }
          }
        if (point === 'outer-worker')
          fence = {
            ...fence,
            outer: { ...fence.outer, processWorkerId: 'j225:stale' }
          }
        if (point === 'outer-row')
          fence = {
            ...fence,
            outer: {
              ...fence.outer,
              expectedAttemptRowId: '999999999999'
            }
          }
        if (point === 'cancelled')
          fence = { ...fence, signal: AbortSignal.abort() }
        let deadlineWitness: unknown = null
        let reclaimed: unknown = null
        try {
          if (point === 'paused')
            await query(
              "UPDATE kernel_pause_switches SET paused=true,updated_by='j225-negative' WHERE tenant_id=$1",
              [journalTenant]
            )
          if (point === 'phase-acked')
            await f.host.continuation.ackPhase(f.host.identity, f.phase, {
              phaseType: f.phase.phaseType,
              completed: true
            })
          if (point === 'outer-lease' || point === 'outer-reclaimed')
            await query(
              "UPDATE outbox_events SET lease_until=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",
              [journalTenant, fence.outer.eventId]
            )
          if (point === 'outer-reclaimed') {
            const { TenantScopedPostgresRuntimeRepository } =
              await import('@cvg/persistence')
            const next = await new TenantScopedPostgresRuntimeRepository(
              resource.pool
            ).claimNextFenced({
              tenantId: tenant,
              eventId: fence.outer.eventId,
              workerId: 'j225:reclaimed',
              leaseMs: 30000
            })
            assert(next)
            assert.equal(next.claimRef.eventId, fence.outer.eventId)
            assert.equal(
              next.claimRef.expectedOuterAttempt,
              fence.outer.expectedOuterAttempt + 1
            )
            assert.notEqual(
              next.claimRef.expectedAttemptRowId,
              fence.outer.expectedAttemptRowId
            )
            assert.notEqual(
              next.claimRef.processWorkerId,
              fence.outer.processWorkerId
            )
            reclaimed = next
          }
          if (point === 'deadline') {
            const clocks = () =>
              query(
                'SELECT expires_at,clock_timestamp() AS now FROM controlled_published_bindings WHERE tenant_id=$1 AND execution_id=$2',
                [journalTenant, fence.executionId]
              )
            const before = (await clocks()).rows[0]!
            assert(
              new Date(before.expires_at).getTime() >
                new Date(before.now).getTime()
            )
            await new Promise((resolve) => setTimeout(resolve, 350))
            const after = (await clocks()).rows[0]!
            assert(
              new Date(after.expires_at).getTime() <
                new Date(after.now).getTime()
            )
            deadlineWitness = { before, after, clockMocked: false }
          }
          const before = await physical(f.admission.input.executionId)
          const { connection, trace } = tracedConnection()
          const journal = new PostgresOperationalEffectJournal(connection, {
            ...(point === 'missing-fence' ? {} : { fence }),
            resultStorage: { version: 1 }
          })
          let bodies = 0
          const tool = {
            ...f.descriptor,
            execute: async () => {
              bodies++
              return { status: 'SUCCEEDED' as const, output }
            }
          }
          const wrapped = createJournaledToolRegistry(
            {
              list: () => [tool],
              resolve: (id) => (id === tool.id ? tool : undefined)
            },
            journal,
            { compositionFingerprint: f.admission.fingerprint }
          )
          let error:
            | { code: string | undefined; message: string | undefined }
            | undefined
          try {
            await wrapped.resolve(tool.id)!.execute({}, {
              tenantId: journalTenant,
              agentId: f.admission.runtime.agent.id,
              traceId: f.admission.runtime.traceId,
              correlationId: f.admission.runtime.correlationId,
              operationKey:
                f.admission.input.executionId + ':s2:find_available_slots'
            } as ToolExecutionContext)
          } catch (thrown) {
            const e = thrown as { code?: string; message?: string }
            error = { code: e.code, message: e.message }
          }
          const after = await physical(f.admission.input.executionId)
          save(label, 'observed', {
            point,
            error,
            bodies,
            before,
            after,
            trace,
            deadlineWitness,
            reclaimed,
            attemptedFence: {
              supplied: point !== 'missing-fence',
              tenantId: fence.tenantId,
              executionId: fence.executionId,
              workerId: fence.workerId,
              attempt: fence.attempt,
              outer: fence.outer,
              signalAborted: fence.signal?.aborted === true
            },
            cancelled: fence.signal?.aborted === true
          })
          assert.equal(error?.code, 'lease_lost')
          assert.equal(
            error.message,
            'Controlled published execution guard rejected the operation'
          )
          assert.equal(bodies, 0)
          assert.equal(before.journal.length, 0)
          assert.equal(before.steps.length, 0)
          assert.equal(before.checkpoint, null)
          sameDurableSnapshot(before, after)
          save(label, 'PASS', {
            scope: 'BOUND_NATIVE_PRE_BODY_REFUSAL_ONLY',
            point,
            bodyCalls: bodies,
            modelCalls: 0,
            guardError: error,
            durableUnchanged: true,
            deadlineWitness,
            reclaimed,
            resourceId: binding.containerId
          })
        } finally {
          if (point === 'paused')
            await query(
              "UPDATE kernel_pause_switches SET paused=false,updated_by='j225-negative-restored' WHERE tenant_id=$1",
              [journalTenant]
            )
        }
      })
  }
)
