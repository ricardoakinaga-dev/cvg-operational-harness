import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type { GovernedTurnInput, OutboxEnqueueInput } from '../contracts.ts'

/**
 * ENGINE-PROD-FIX ENG-012: an approval that was already executed may only
 * replay the exact operation it bound. Any other operation presented with the
 * same approval id is denied instead of being reported as executed.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')

function buildHarness() {
  const now = () => NOW
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'replay-binding',
    version: '1.0.0',
    content: 'Synthetic replay binding prompt.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
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
    providers: [
      new DeterministicModelProvider({
        respond: () => ({
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        })
      })
    ],
    profiles: { fast: profile },
    prompts,
    clock: now,
    retry: { maxRetries: 0 }
  })
  const approvals = new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock: now
  })
  const toolExecutor = vi.fn(async () => ({ result: { ok: true } }))
  const outbox = vi.fn(async (event: OutboxEnqueueInput) => ({
    eventId: `evt_${event.idempotencyKey}`
  }))
  const runtime = new GovernedAgentRuntime({
    policy: new PolicyEngine({
      profile: REFERENCE_POLICY_PROFILE,
      documents: [],
      clock: now
    }),
    approvals,
    modelGateway,
    telemetry: new InMemoryTelemetry({ clock: now }),
    audit: new HashChainedAuditLedger(),
    toolExecutor,
    outbox,
    clock: now,
    effectJournal: new InMemoryEffectJournal({ clock: now }),
    effectScopes: { 'record.cancel': 'controlled_fake' }
  })
  return { runtime, approvals, toolExecutor }
}

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
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'replay-binding', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'cancel' }] },
    structuredOutput: {
      schemaName: 'PayloadContract',
      schema: z.object({ text: z.string() })
    },
    ...overrides
  }
}

async function executedApproval() {
  const harness = buildHarness()
  const requested = await harness.runtime.runTurn(turnInput())
  const approvalId = requested.approvalId ?? ''
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  const executed = await harness.runtime.runTurn(turnInput({ approvalId }))
  expect(executed.outcome).toBe('executed')
  expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  return { harness, approvalId }
}

describe('ENG-012 replay of an executed approval stays bound', () => {
  it('replays the exact approved operation without a second effect', async () => {
    const { harness, approvalId } = await executedApproval()
    const replay = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(replay.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('denies an executed approval presented for another resource', async () => {
    const { harness, approvalId } = await executedApproval()
    const other = await harness.runtime.runTurn(
      turnInput({
        approvalId,
        resource: { type: 'record', id: 'apt_other', tenantId: TENANT }
      })
    )
    expect(other).toMatchObject({
      outcome: 'denied',
      reason: 'resource_mismatch'
    })
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('denies an executed approval presented with another agent or classification', async () => {
    const { harness, approvalId } = await executedApproval()
    await expect(
      harness.runtime.runTurn(turnInput({ approvalId, agentVersion: 'v2' }))
    ).resolves.toMatchObject({
      outcome: 'denied',
      reason: 'proposal_mismatch'
    })
    await expect(
      harness.runtime.runTurn(
        turnInput({ approvalId, dataClassification: 'CLINICAL' })
      )
    ).resolves.toMatchObject({
      outcome: 'denied',
      reason: 'proposal_mismatch'
    })
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })
})
