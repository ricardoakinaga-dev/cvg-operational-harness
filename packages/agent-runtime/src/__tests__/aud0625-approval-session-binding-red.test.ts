import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import {
  PolicyEngine,
  type Capability,
  type PolicyDocument,
  REFERENCE_POLICY_PROFILE
} from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })

interface HarnessOptions {
  responses?: readonly string[]
  documents?: PolicyDocument[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
  realEffectAuthorizations?: string[]
  clock?: () => Date
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  store?: InMemoryApprovalStore
}

function buildHarness(options: HarnessOptions = {}) {
  const now = options.clock ?? (() => NOW)
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'binding-core',
    version: '1.0.0',
    content: 'You are the CVG operational assistant.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const responses = options.responses ?? [
    JSON.stringify({ text: 'APPROVED_PAYLOAD' })
  ]
  let providerCalls = 0
  const provider = new DeterministicModelProvider({
    respond: () => {
      const index = Math.min(providerCalls, responses.length - 1)
      providerCalls += 1
      return {
        text: responses[index] ?? '{}',
        usage: { inputTokens: 10, outputTokens: 5 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      }
    }
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 256,
    timeoutMs: 5_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
  }
  const modelGateway = new ModelGateway({
    providers: [provider],
    profiles: { fast: profile },
    prompts,
    clock: now,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({
    profile: REFERENCE_POLICY_PROFILE,
    documents: options.documents ?? [],
    clock: now
  })
  const store = options.store ?? new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock: now })
  const telemetry = new InMemoryTelemetry({ clock: now })
  const audit = new HashChainedAuditLedger()
  const fallbackTool: (
    invocation: ToolInvocation
  ) => Promise<{ result: unknown }> = async () => ({ result: { ok: true } })
  const toolExecutor = vi.fn(options.toolExecutor ?? fallbackTool)
  const outbox = vi.fn(async (event: OutboxEnqueueInput) => ({
    eventId: `evt_${event.idempotencyKey}`
  }))
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    clock: now,
    effectJournal: new InMemoryEffectJournal({ clock: now }),
    ...(options.effectScopes !== undefined
      ? { effectScopes: options.effectScopes }
      : {}),
    ...(options.realEffectAuthorizations !== undefined
      ? { realEffectAuthorizations: options.realEffectAuthorizations }
      : {})
  })
  return {
    runtime,
    approvals,
    policy,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    store,
    providerCalls: () => providerCalls
  }
}

type Harness = ReturnType<typeof buildHarness>

function turnInput(
  overrides: Partial<GovernedTurnInput> = {}
): GovernedTurnInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Supervisor',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'assistant',
    conversationId: 'conv_1',
    correlationId: CORRELATION,
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'binding-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: {
      messages: [{ role: 'user', content: 'cancelar consulta' }]
    },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

function approveApproval(harness: Harness, approvalId: string): void {
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
}

const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'record.cancel': 'controlled_fake'
}

// SPEC 0291 phase 1 (PAR-S04 finding 3): the approval is bound to the proposal and, on the durable
// kernel path, to the execution; it is NOT bound to the session/conversation that asked for it.
// Controls pin what the real runtime does today; `it.fails` witnesses state the proposed rule.
const asked = {
  conversationId: 'conv_A',
  sessionId: 'sess_A',
  operatorId: 'op_1'
}
const elsewhere = { conversationId: 'conv_B', sessionId: 'sess_B' }

async function askAndApprove(harness: Harness) {
  const requested = await harness.runtime.runTurn(turnInput({ ...asked }))
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  approveApproval(harness, approvalId)
  return approvalId
}

describe('SPEC 0291 phase 1: controls on the real runtime and engine', () => {
  it('the approval record has no session or conversation field at all', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const record = harness.approvals.get(
      TENANT,
      approvalId
    ) as unknown as Record<string, unknown>
    expect(
      Object.keys(record).filter((k) => /session|conversation/i.test(k))
    ).toEqual([])
  })

  it('an approval asked in conversation A executes when presented from conversation B of the same tenant', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const executed = await harness.runtime.runTurn(
      turnInput({ ...elsewhere, approvalId })
    )
    expect(executed.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('an approval asked by one operator executes when presented by another operator', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const executed = await harness.runtime.runTurn(
      turnInput({ ...asked, operatorId: 'op_9', approvalId })
    )
    expect(executed.outcome).toBe('executed')
  })

  it('the tenant, action, resource, agent and payload bindings do hold (what is already closed)', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const other = await harness.runtime.runTurn(
      turnInput({
        ...elsewhere,
        approvalId,
        resource: { type: 'record', id: 'apt_other', tenantId: TENANT }
      })
    )
    expect(other.reason).toBe('resource_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('SPEC 0291 phase 1: RED witnesses of the proposed rule', () => {
  it.fails(
    'an approval asked in conversation A is denied when presented from conversation B',
    async () => {
      const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
      const approvalId = await askAndApprove(harness)
      const result = await harness.runtime.runTurn(
        turnInput({ ...elsewhere, approvalId })
      )
      expect(result.outcome).toBe('denied')
      expect(result.reason).toBe('origin_mismatch')
      expect(harness.toolExecutor).not.toHaveBeenCalled()
      expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    }
  )

  it.fails(
    'the same approval still executes in the conversation that asked for it',
    async () => {
      const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
      const approvalId = await askAndApprove(harness)
      const record = harness.approvals.get(
        TENANT,
        approvalId
      ) as unknown as Record<string, unknown>
      // The proposed record carries the origin of the request; today it has no such field.
      expect(record.origin).toEqual({
        conversationId: 'conv_A',
        sessionId: 'sess_A'
      })
      const result = await harness.runtime.runTurn(
        turnInput({ ...asked, approvalId })
      )
      expect(result.outcome).toBe('executed')
    }
  )

  it.fails(
    'an approval asked by one operator is denied when another operator presents it (decision D-C)',
    async () => {
      const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
      const approvalId = await askAndApprove(harness)
      const result = await harness.runtime.runTurn(
        turnInput({ ...asked, operatorId: 'op_9', approvalId })
      )
      expect(result.outcome).toBe('denied')
      expect(harness.toolExecutor).not.toHaveBeenCalled()
    }
  )
})
