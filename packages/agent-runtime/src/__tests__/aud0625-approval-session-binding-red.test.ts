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

// SPEC 0291 (PAR-S04 finding 3): the approval is bound to the proposal and, on the durable
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
/** Re-inserts the record the way it was stored before the SPEC or by the durable adapter. */
function storeWithoutOrigin(
  harness: Harness,
  approvalId: string,
  patch: Record<string, unknown> = {}
): void {
  const { origin: _origin, ...rest } = harness.approvals.get(
    TENANT,
    approvalId
  ) as unknown as Record<string, unknown>
  void _origin
  harness.store.insert({ ...rest, ...patch } as never)
}

describe('SPEC 0291 slice 1: the approval is executable only where it was asked', () => {
  it('AP02: the record carries the origin, and the approval executes in the conversation and session that asked', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const record = harness.approvals.get(
      TENANT,
      approvalId
    ) as unknown as Record<string, unknown>
    expect(record.origin).toEqual({
      conversationId: 'conv_A',
      sessionId: 'sess_A'
    })
    const result = await harness.runtime.runTurn(
      turnInput({ ...asked, approvalId })
    )
    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('AP01: asked in conversation A, denied from conversation B before any reservation, and still APPROVED', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const result = await harness.runtime.runTurn(
      turnInput({ ...elsewhere, approvalId })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    // The denial left the approval usable where it was asked.
    const back = await harness.runtime.runTurn(
      turnInput({ ...asked, approvalId })
    )
    expect(back.outcome).toBe('executed')
  })

  it('AP01: the executed approval cannot be replayed from another conversation either', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    await harness.runtime.runTurn(turnInput({ ...asked, approvalId }))
    const replay = await harness.runtime.runTurn(
      turnInput({ ...elsewhere, approvalId })
    )
    expect(replay.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('AP03: the same conversation but another session is denied, and so is a turn without a session', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const otherSession = await harness.runtime.runTurn(
      turnInput({ ...asked, sessionId: 'sess_other', approvalId })
    )
    expect(otherSession.reason).toBe('origin_mismatch')
    const { sessionId: _omit, ...withoutSession } = { ...asked, approvalId }
    void _omit
    const absent = await harness.runtime.runTurn(turnInput(withoutSession))
    expect(absent.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('AP01: the conversation is compared on its own: another conversation with the same session id is denied', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const result = await harness.runtime.runTurn(
      turnInput({ conversationId: 'conv_B', sessionId: 'sess_A', approvalId })
    )
    expect(result.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('AP03: asked without a session, only the conversation counts: another session of it executes', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const { sessionId: _omit, ...noSession } = asked
    void _omit
    const requested = await harness.runtime.runTurn(turnInput(noSession))
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    const result = await harness.runtime.runTurn(
      turnInput({ ...noSession, sessionId: 'sess_any', approvalId })
    )
    expect(result.outcome).toBe('executed')
  })

  it('AP04: a record without origin (before the SPEC) still executes, with an audit event and a metric', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    storeWithoutOrigin(harness, approvalId)
    const result = await harness.runtime.runTurn(
      turnInput({ ...elsewhere, approvalId })
    )
    expect(result.outcome).toBe('executed')
    expect(harness.audit.records().map((r) => r.type)).toContain(
      'runtime.origin_unbound'
    )
    expect(harness.telemetry.metrics().map((m) => m.name)).toContain(
      'approval_origin_unbound_total'
    )
  })

  it('AP04: a record with origin leaves no origin_unbound trace', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    await harness.runtime.runTurn(turnInput({ ...asked, approvalId }))
    expect(harness.audit.records().map((r) => r.type)).not.toContain(
      'runtime.origin_unbound'
    )
    expect(harness.telemetry.metrics().map((m) => m.name)).not.toContain(
      'approval_origin_unbound_total'
    )
  })

  it('AP11: an approval made for a durable execution (executionRef, no origin) is not executable by a library turn', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    storeWithoutOrigin(harness, approvalId, { executionRef: 'exec_durable_1' })
    const result = await harness.runtime.runTurn(
      turnInput({ ...asked, approvalId })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('AP11b: a legacy record left UNCERTAIN by an execution (executionRef, no origin) is denied and stays UNCERTAIN, never replayed', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    storeWithoutOrigin(harness, approvalId, {
      executionRef: 'exec_legacy_1',
      status: 'UNCERTAIN'
    })
    const result = await harness.runtime.runTurn(
      turnInput({ ...asked, approvalId })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })

  it('AP07 (S04): in a fork of the session, the original approvalId is origin_mismatch and the same action asks again', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    // The fork has its own session id (S04), and the host names its conversation after it.
    const parent = { conversationId: 'sess_parent', sessionId: 'sess_parent' }
    const fork = { conversationId: 'sess_fork', sessionId: 'sess_fork' }
    const requested = await harness.runtime.runTurn(
      turnInput({ ...parent, operatorId: 'op_1' })
    )
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    const reused = await harness.runtime.runTurn(
      turnInput({ ...fork, approvalId })
    )
    expect(reused.reason).toBe('origin_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    const asksAgain = await harness.runtime.runTurn(turnInput({ ...fork }))
    expect(asksAgain.outcome).toBe('approval_required')
    expect(asksAgain.approvalId).not.toBe(approvalId)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('AO-C: the operator is not part of the binding: another operator executes in the same conversation', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const executed = await harness.runtime.runTurn(
      turnInput({ ...asked, operatorId: 'op_9', approvalId })
    )
    expect(executed.outcome).toBe('executed')
  })

  it('control: the tenant, action, resource, agent and payload bindings still hold, and keep their own code', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await askAndApprove(harness)
    const other = await harness.runtime.runTurn(
      turnInput({
        ...asked,
        approvalId,
        resource: { type: 'record', id: 'apt_other', tenantId: TENANT }
      })
    )
    expect(other.reason).toBe('resource_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})
