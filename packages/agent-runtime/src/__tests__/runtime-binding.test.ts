import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import { canonicalizeJson } from '@cvg/shared'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import {
  PolicyEngine,
  type Capability,
  type PolicyDocument
} from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import { ToolExecutionError } from '../contracts.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'
import {
  computeExecutionProposalHash,
  createExecutionProposal,
  isExecutionProposalExpired,
  verifyExecutionProposalHash
} from '../proposal.ts'

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
    content: 'You are the CVG secretary.',
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
    agentProfile: 'secretary',
    conversationId: 'conv_1',
    correlationId: CORRELATION,
    capability: 'appointment.cancel',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
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
  'appointment.cancel': 'controlled_fake'
}

describe('AAA-09 T-16: legacy consumption path removed from the governed runtime', () => {
  it('keeps runtime.ts free of verifyAndConsume while reserving/confirming', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/agent-runtime/src/runtime.ts'),
      'utf8'
    )
    expect(source).not.toContain('verifyAndConsume')
    expect(source).toContain('.reserve(')
    expect(source).toContain('.confirm(')
  })
})

describe('AAA-09 proposal art. 3: immutable ExecutionProposal', () => {
  it('deep-freezes a canonical copy so source mutations cannot change the proposal', () => {
    const source = {
      text: 'APPROVED_PAYLOAD',
      nested: { count: 1 },
      list: [1, { deep: true }]
    }
    const proposal = createExecutionProposal(
      {
        tenantId: TENANT,
        operatorId: 'op_1',
        agentId: AGENT,
        agentVersion: 'v1',
        agentProfile: 'secretary',
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        dataClassification: 'INTERNAL',
        policyVersion: 'policy-engine-v1',
        promptVersion: '1.0.0',
        payload: source
      },
      { now: NOW }
    )

    source.nested.count = 99
    ;(source.list[1] as { deep: boolean }).deep = false

    expect(proposal.payload).toEqual({
      text: 'APPROVED_PAYLOAD',
      nested: { count: 1 },
      list: [1, { deep: true }]
    })
    expect(proposal.schemaVersion).toBe('aaa-proposal-v1')
    expect(proposal.proposalId).toMatch(/^prop_/)
    expect(Object.isFrozen(proposal)).toBe(true)
    expect(Object.isFrozen(proposal.payload)).toBe(true)
    expect(
      Object.isFrozen((proposal.payload as { nested: object }).nested)
    ).toBe(true)
    expect(() => {
      ;(proposal.payload as { nested: { count: number } }).nested.count = 2
    }).toThrow(TypeError)
    expect(verifyExecutionProposalHash(proposal)).toBe(true)
    expect(isExecutionProposalExpired(proposal, NOW)).toBe(false)
    expect(
      isExecutionProposalExpired(
        proposal,
        new Date(Date.parse(proposal.expiresAt) + 1)
      )
    ).toBe(true)
  })

  it('derives the section 2 proposalHash and defaults to a 15 minute expiry', () => {
    const proposal = createExecutionProposal(
      {
        tenantId: TENANT,
        operatorId: 'op_1',
        agentId: AGENT,
        agentVersion: 'v1',
        agentProfile: 'secretary',
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        dataClassification: 'INTERNAL',
        policyVersion: 'policy-engine-v1',
        payload: { text: 'APPROVED_PAYLOAD' }
      },
      { now: NOW }
    )
    const expectedHash = createHash('sha256')
      .update(
        canonicalizeJson({
          schemaVersion: 'aaa-proposal-v1',
          tenantId: TENANT,
          operatorId: 'op_1',
          agentId: AGENT,
          agentVersion: 'v1',
          agentProfile: 'secretary',
          capability: 'appointment.cancel',
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' },
          dataClassification: 'INTERNAL',
          payload: { text: 'APPROVED_PAYLOAD' }
        }),
        'utf8'
      )
      .digest('hex')
    expect(proposal.proposalHash).toBe(expectedHash)
    expect(
      computeExecutionProposalHash({
        schemaVersion: proposal.schemaVersion,
        tenantId: proposal.tenantId,
        operatorId: proposal.operatorId,
        agentId: proposal.agentId,
        agentVersion: proposal.agentVersion,
        agentProfile: proposal.agentProfile,
        capability: proposal.capability,
        action: proposal.action,
        resource: proposal.resource,
        dataClassification: proposal.dataClassification,
        payload: proposal.payload
      })
    ).toBe(expectedHash)
    expect(
      Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)
    ).toBe(15 * 60 * 1000)
    expect(
      verifyExecutionProposalHash({ ...proposal, proposalHash: 'f'.repeat(64) })
    ).toBe(false)
  })
})

describe('AAA-09 T-01: tool executes exactly the approved payload', () => {
  it('uses the stored proposal payload and never regenerates it from the model', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      responses: [
        JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
        JSON.stringify({ text: 'UNAPPROVED_MODEL_PAYLOAD' })
      ]
    })
    const requested = await harness.runtime.runTurn(turnInput())
    expect(requested.outcome).toBe('approval_required')
    const approvalId = requested.approvalId ?? ''
    expect(approvalId).not.toBe('')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('REQUESTED')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()

    const stored = harness.approvals.get(TENANT, approvalId)
    expect(stored.proposalPayload).toEqual({ text: 'APPROVED_PAYLOAD' })
    expect(stored.proposalId).toMatch(/^prop_/)
    expect(stored.proposalHash).toMatch(/^[0-9a-f]{64}$/)

    approveApproval(harness, approvalId)
    const executed = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(executed.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    const invocation = harness.toolExecutor.mock.calls[0]?.[0]
    expect(invocation?.payload).toEqual({ text: 'APPROVED_PAYLOAD' })
    expect(harness.providerCalls()).toBe(1)
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')
  })

  it('denies a divergent caller approvalPayload before the tool', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, approvalPayload: { text: 'OTHER_PAYLOAD' } })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('payload_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })
})

describe('AAA-09 T-02: mutated or adulterated proposal never reaches the tool', () => {
  it('denies a mutated proposal payload with payload_mismatch', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    harness.store.update(TENANT, approvalId, 'APPROVED', (current) => ({
      ...current,
      proposalPayload: { text: 'MUTATED_PAYLOAD' }
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('payload_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies an adulterated proposal hash with payload_mismatch', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    harness.store.update(TENANT, approvalId, 'APPROVED', (current) => ({
      ...current,
      proposalHash: 'f'.repeat(64)
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('payload_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies revalidated binding divergences without an effect', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const changedResource = await harness.runtime.runTurn(
      turnInput({
        approvalId,
        resource: { type: 'appointment', id: 'apt_other', tenantId: TENANT }
      })
    )
    expect(changedResource.outcome).toBe('denied')
    expect(changedResource.reason).toBe('resource_mismatch')

    const changedAgent = await harness.runtime.runTurn(
      turnInput({ approvalId, agentVersion: 'v2' })
    )
    expect(changedAgent.outcome).toBe('denied')
    expect(changedAgent.reason).toBe('proposal_mismatch')

    const changedClassification = await harness.runtime.runTurn(
      turnInput({ approvalId, dataClassification: 'CLINICAL' })
    )
    expect(changedClassification.outcome).toBe('denied')
    expect(changedClassification.reason).toBe('proposal_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies policy_changed when the policy version moved after approval', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const changedPolicy = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      documents: [
        {
          policyId: 'tenant.strict',
          version: '2.0.0',
          tenantId: TENANT,
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          rules: [
            {
              id: 'cancel-requires-approval',
              effect: 'REQUIRE_APPROVAL',
              priority: 5,
              capabilities: ['appointment.cancel'],
              reason: 'Synthetic tightened policy'
            }
          ]
        }
      ]
    })
    const shared = new GovernedAgentRuntime({
      policy: changedPolicy.policy,
      approvals: harness.approvals,
      modelGateway: changedPolicy.modelGateway,
      telemetry: changedPolicy.telemetry,
      audit: changedPolicy.audit,
      toolExecutor: harness.toolExecutor,
      outbox: harness.outbox,
      clock: () => NOW,
      effectScopes: FAKE_CANCEL_SCOPE
    })

    const result = await shared.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_changed')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('AAA-09: request/execution turn boundaries', () => {
  it('denies an expired proposal before any tool', async () => {
    let now = NOW
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      clock: () => now
    })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    now = new Date(NOW.getTime() + 16 * 60 * 1000)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('proposal_expired')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('surfaces structured_output_invalid without creating an approval', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      responses: [JSON.stringify({ wrong: true })]
    })
    const result = await harness.runtime.runTurn(turnInput())
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('structured_output_invalid')
    expect(harness.approvals.list(TENANT)).toHaveLength(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('AAA-09 T-19: fail-closed real-effect authorization', () => {
  it('denies an undeclared high-risk capability before the executor', async () => {
    const harness = buildHarness({ effectScopes: {} })
    const result = await harness.runtime.runTurn(turnInput())
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('real_effect_not_authorized')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.providerCalls()).toBe(0)
    expect(harness.approvals.list(TENANT)).toHaveLength(0)
  })

  it('denies real_authorized without an explicit authorization entry', async () => {
    const harness = buildHarness({
      effectScopes: { 'appointment.cancel': 'real_authorized' }
    })
    const result = await harness.runtime.runTurn(turnInput())
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('real_effect_not_authorized')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.providerCalls()).toBe(0)
  })

  it('blocks an already approved proposal when the adapter scope is unauthorized', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const restricted = buildHarness({
      effectScopes: { 'appointment.cancel': 'real_authorized' }
    })
    const restrictedRuntime = new GovernedAgentRuntime({
      policy: harness.policy,
      approvals: harness.approvals,
      modelGateway: restricted.modelGateway,
      telemetry: restricted.telemetry,
      audit: restricted.audit,
      toolExecutor: harness.toolExecutor,
      outbox: harness.outbox,
      clock: () => NOW,
      effectScopes: { 'appointment.cancel': 'real_authorized' }
    })
    const result = await restrictedRuntime.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('real_effect_not_authorized')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('keeps a declared controlled_fake capability executable', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)
    const result = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })
})

describe('AAA-09 T-16: release/uncertain on tool failures', () => {
  it('releases the approval when the tool proves a pre-effect failure', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const failed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(failed.outcome).toBe('denied')
    expect(failed.reason).toBe('tool_rejected')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks the approval UNCERTAIN and never retries on an ambiguous failure', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      toolExecutor: async () => {
        throw new Error('synthetic ambiguous transport failure')
      }
    })
    const requested = await harness.runtime.runTurn(turnInput())
    const approvalId = requested.approvalId ?? ''
    approveApproval(harness, approvalId)

    const failed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(failed.outcome).toBe('denied')
    expect(failed.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()

    const retried = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(retried.outcome).toBe('denied')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })
})
