import { describe, expect, it, vi } from 'vitest'
import { ApprovalEngine } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import { PolicyEngine } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import type { GovernedTurnInput } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')

function buildHarness() {
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
  const provider = new DeterministicModelProvider({
    respond: () => ({
      text: 'synthetic output',
      usage: { inputTokens: 10, outputTokens: 5 },
      providerId: 'deterministic',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 128,
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
    clock: () => NOW,
    retry: { maxRetries: 0 }
  })
  const toolExecutor = vi.fn(async () => ({ result: { ok: true } }))
  const runtime = new GovernedAgentRuntime({
    policy: new PolicyEngine({ clock: () => NOW }),
    approvals: new ApprovalEngine({ clock: () => NOW }),
    modelGateway,
    telemetry: new InMemoryTelemetry({ clock: () => NOW }),
    audit: new HashChainedAuditLedger(),
    toolExecutor,
    outbox: vi.fn(async () => ({ eventId: 'evt_binding' })),
    clock: () => NOW,
    effectScopes: { 'appointment.cancel': 'controlled_fake' }
  })
  return { runtime, toolExecutor }
}

function turnInput(
  overrides: Partial<GovernedTurnInput> = {}
): GovernedTurnInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Supervisor',
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentVersion: 'v1',
    agentProfile: 'secretary',
    conversationId: 'conv_1',
    correlationId: CORRELATION,
    capability: 'appointment.modify',
    action: 'appointment.modify',
    resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'binding-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'fixture' }] },
    ...overrides
  }
}

describe('AAA08-C1-F01 public boundary: capability/action/resource binding', () => {
  it('denies smuggled sensitive actions with zero fake-tool calls', async () => {
    for (const action of [
      'appointment.confirm',
      'appointment.reschedule',
      'appointment.cancel'
    ]) {
      const harness = buildHarness()
      const result = await harness.runtime.runTurn(
        turnInput({ capability: 'appointment.modify', action })
      )
      expect(result.outcome, action).toBe('denied')
      expect(result.decision.decision, action).toBe('DENY')
      expect(result.decision.reason, action).toBe('action_capability_mismatch')
      expect(result.reason, action).toBe('policy_denied')
      expect(harness.toolExecutor, action).not.toHaveBeenCalled()
    }
  })

  it('keeps the legitimate draft update executable against the fake tool', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(turnInput())
    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('keeps confirm/reschedule denied without grant and cancel behind approval', async () => {
    const confirm = buildHarness()
    const confirmResult = await confirm.runtime.runTurn(
      turnInput({
        capability: 'appointment.confirm',
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(confirmResult.outcome).toBe('denied')
    expect(confirmResult.decision.reason).toBe('capability_not_granted')
    expect(confirm.toolExecutor).not.toHaveBeenCalled()

    const cancel = buildHarness()
    const cancelResult = await cancel.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(cancelResult.outcome).toBe('approval_required')
    expect(cancel.toolExecutor).not.toHaveBeenCalled()
  })
})
