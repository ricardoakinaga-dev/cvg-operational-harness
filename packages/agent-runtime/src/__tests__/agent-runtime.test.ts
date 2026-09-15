import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import { PolicyEngine, type PolicyDocument } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type { GovernedTurnInput, ToolInvocation } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-11T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'

function buildHarness(
  options: { documents?: PolicyDocument[]; pricing?: number } = {}
) {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'secretary-core',
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
      text: JSON.stringify({
        intent: 'schedule',
        proposed: ['appointment.create']
      }),
      usage: { inputTokens: 100, outputTokens: 50 },
      providerId: 'deterministic',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
  const pricing = options.pricing ?? 0.001
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
    pricing: { inputPer1kUsd: pricing, outputPer1kUsd: pricing }
  }
  const modelGateway = new ModelGateway({
    providers: [provider],
    profiles: { fast: profile },
    prompts,
    clock: () => NOW,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({
    documents: options.documents ?? [],
    clock: () => NOW
  })
  let approvalCounter = 0
  const approvals = new ApprovalEngine({
    clock: () => NOW,
    idFactory: () => {
      approvalCounter += 1
      return `appr_00000000-0000-4000-8000-${String(approvalCounter).padStart(12, '0')}`
    }
  })
  let spanCounter = 0
  const telemetry = new InMemoryTelemetry({
    clock: () => NOW,
    idGenerator: {
      traceId: () => 'a'.repeat(32),
      spanId: () => (++spanCounter).toString(16).padStart(16, '0')
    }
  })
  const audit = new HashChainedAuditLedger()
  const fallbackTool: (
    invocation: ToolInvocation
  ) => Promise<{ result: unknown }> = async () => ({ result: { ok: true } })
  const toolExecutor = vi.fn(fallbackTool)
  const outbox = vi.fn(async (event: { idempotencyKey: string }) => ({
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
    clock: () => NOW,
    effectJournal: new InMemoryEffectJournal({ clock: () => NOW }),
    effectScopes: { 'appointment.cancel': 'controlled_fake' }
  })
  return { runtime, approvals, telemetry, audit, toolExecutor, outbox, prompts }
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
    capability: 'appointment.create',
    action: 'appointment.create',
    resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'secretary-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'quero agendar' }] },
    structuredOutput: {
      schemaName: 'AgentDecision',
      schema: z.object({ intent: z.string(), proposed: z.array(z.string()) })
    },
    ...overrides
  }
}

describe('governed agent runtime', () => {
  it('executes the full pipeline with trace propagation and a valid audit chain', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('executed')
    expect(result.modelResult?.output.structured).toEqual({
      intent: 'schedule',
      proposed: ['appointment.create']
    })
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expect(result.outboxEventId).toBeDefined()
    expect(result.auditChainValid).toBe(true)
    expect(harness.audit.verify().valid).toBe(true)

    const spanNames = harness.telemetry.spans().map((span) => span.name)
    expect(spanNames).toEqual(
      expect.arrayContaining([
        'policy.evaluate',
        'model.generate',
        'tool.execute',
        'outbox.enqueue'
      ])
    )
    const traceIds = new Set(
      harness.telemetry.spans().map((span) => span.traceId)
    )
    expect(traceIds).toEqual(new Set(['a'.repeat(32)]))
    expect(
      harness.telemetry
        .spans()
        .every((span) => span.correlationId === CORRELATION)
    ).toBe(true)
  })

  it('denies capabilities outside the least-privilege profile before any model call', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'patient.record.write',
        action: 'patient.record.write'
      })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_denied')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(
      harness.telemetry.spans().some((span) => span.name === 'model.generate')
    ).toBe(false)
  })

  it('returns approval_required and creates a pending approval without side effects', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel'
      })
    )
    expect(result.outcome).toBe('approval_required')
    expect(result.approvalId).toBeDefined()
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, result.approvalId ?? '').status).toBe(
      'REQUESTED'
    )
  })

  // AAA-09 contract section 3: the request turn freezes the model structured
  // output into the proposal; the execution turn uses exclusively the stored
  // proposal payload (caller-supplied approvalPayload only revalidates).
  // AAA-10: a retry with the same approval replays the durable journal record
  // instead of executing the tool again.
  it('binds approval to the exact frozen proposal payload and replays without repeating the tool', async () => {
    const harness = buildHarness()
    const requested = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel'
      })
    )
    expect(requested.outcome).toBe('approval_required')
    const approvalId = requested.approvalId ?? ''
    const approvedPayload = harness.approvals.get(
      TENANT,
      approvalId
    ).proposalPayload
    expect(approvedPayload).toEqual({
      intent: 'schedule',
      proposed: ['appointment.create']
    })
    harness.approvals.submit(TENANT, approvalId, 'op_1')
    harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })

    const mismatched = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId,
        approvalPayload: { appointmentId: 'apt_1', reason: 'mutado' }
      })
    )
    expect(mismatched.outcome).toBe('denied')
    expect(mismatched.reason).toBe('payload_mismatch')

    const executed = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId
      })
    )
    expect(executed.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.toolExecutor.mock.calls[0]?.[0]?.payload).toEqual({
      intent: 'schedule',
      proposed: ['appointment.create']
    })
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')

    const replayed = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId
      })
    )
    expect(replayed.outcome).toBe('executed')
    expect(replayed.reason).toBe('idempotent_replay')
    expect(replayed.replayed).toBe(true)
    expect(replayed.resultDigest).toBeDefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('blocks every side effect while human takeover is active', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'message.send',
        action: 'message.send',
        takeoverActive: true
      })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('human_takeover_active')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('supports shadow mode: model decides but no effect is executed', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(
      turnInput({ shadowMode: true })
    )
    expect(result.outcome).toBe('shadowed')
    expect(result.modelResult).toBeDefined()
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.audit.verify().valid).toBe(true)
  })

  it('fails closed when structured output does not match the contract', async () => {
    const harness = buildHarness()
    const result = await harness.runtime.runTurn(
      turnInput({
        structuredOutput: {
          schemaName: 'AgentDecision',
          schema: z.object({ mustHaveThis: z.string() })
        }
      })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('schema_invalid')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies cost overruns before executing tools', async () => {
    const harness = buildHarness({ pricing: 10 })
    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxCostUsd: 0.0001 } })
    )
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_cost_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('honors policy documents that restrict granted capabilities', async () => {
    const harness = buildHarness({
      documents: [
        {
          policyId: 'tenant.strict',
          version: '1.0.0',
          tenantId: TENANT,
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          rules: [
            {
              id: 'deny-appointment-create',
              effect: 'DENY',
              priority: 10,
              capabilities: ['appointment.create'],
              reason: 'Tenant forbids automatic creation'
            }
          ]
        }
      ]
    })
    const result = await harness.runtime.runTurn(turnInput())
    expect(result.outcome).toBe('denied')
    expect(result.decision.policyId).toBe('tenant.strict')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})
