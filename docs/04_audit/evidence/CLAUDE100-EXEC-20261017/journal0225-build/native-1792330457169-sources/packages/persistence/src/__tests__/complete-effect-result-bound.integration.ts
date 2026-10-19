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

async function prepare(label: string) {
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
      timeoutMs: 30000,
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
  return { admission, claim, descriptor: inventory[0]!.descriptor }
}

function tracedConnection() {
  let serial = 0
  const trace: { client: number; transaction: number; sql: string }[] = []
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
          trace.push({
            client: id,
            transaction,
            sql: text.trim().replace(/\s+/g, ' ')
          })
          return client.query<T>(text, values)
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
