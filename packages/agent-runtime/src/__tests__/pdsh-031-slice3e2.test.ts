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
import type { GovernedTurnInput } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const PAYLOAD_SCHEMA = z.object({ text: z.string() })

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

interface HarnessOptions {
  readonly withJournal?: boolean
  readonly pause?: {
    next: () => boolean
  }
  readonly limits?: Record<string, unknown>
  readonly delayApprovalGetMs?: number
}

function buildHarness(options: HarnessOptions = {}) {
  const clock = () => new Date()
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'pdsh031-core',
    version: '1.0.0',
    content: 'Synthetic governed prompt.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const provider = new DeterministicModelProvider({
    respond: () => ({
      text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
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
    clock,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({
    profile: REFERENCE_POLICY_PROFILE,
    documents: [],
    clock
  })
  const approvals = new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock
  })
  if (options.delayApprovalGetMs !== undefined) {
    const original = approvals.get.bind(approvals)
    vi.spyOn(approvals, 'get').mockImplementation((tenantId, id) => {
      return (async () => {
        await sleep(options.delayApprovalGetMs ?? 0)
        return original(tenantId, id as never)
      })() as never
    })
  }
  const telemetry = new InMemoryTelemetry({ clock })
  const toolExecutor = vi.fn(async () => ({ result: { ok: true } }))
  const journal =
    options.withJournal === false
      ? undefined
      : new InMemoryEffectJournal({ clock })
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry,
    audit: new HashChainedAuditLedger(),
    toolExecutor,
    outbox: async (event: { idempotencyKey: string }) => ({
      eventId: `evt_${event.idempotencyKey}`
    }),
    clock,
    effectScopes: { 'record.cancel': 'controlled_fake' },
    ...(journal ? { effectJournal: journal } : {}),
    ...(options.pause
      ? { pause: { isPaused: async () => options.pause?.next() ?? false } }
      : {})
  } as never)
  const limits = options.limits ?? {
    maxSteps: 5,
    maxModelCalls: 4,
    maxToolCalls: 2,
    maxDurationMs: 10_000,
    maxCostUsd: 1
  }
  const run = (overrides: Partial<GovernedTurnInput> = {}) =>
    runtime.runTurn(turnInput({ limits: limits as never, ...overrides }))
  return { runtime, approvals, toolExecutor, run }
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
    correlationId: CORRELATION,
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'pdsh031-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'agendar' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

async function approved(
  harness: ReturnType<typeof buildHarness>
): Promise<string> {
  const requested = await harness.run()
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  return approvalId
}

describe('PDSH-031 slice 3e-ii — runtime durable execution edges', () => {
  it('stops before the reservation on a deadline during the approval read', async () => {
    const harness = buildHarness({
      delayApprovalGetMs: 150,
      limits: {
        maxSteps: 5,
        maxModelCalls: 4,
        maxToolCalls: 2,
        maxDurationMs: 100,
        maxCostUsd: 1
      }
    })
    const approvalId = await approved(harness)
    const result = await harness.run({ approvalId } as never)
    expect(result).toMatchObject({
      outcome: 'denied',
      reason: 'loop_deadline_exceeded'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('pauses before reserving the approval', async () => {
    let paused = false
    const harness = buildHarness({ pause: { next: () => paused } })
    const approvalId = await approved(harness)
    paused = true
    const result = await harness.run({ approvalId } as never)
    expect(result).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('pauses after the effect started and before the body', async () => {
    const reads: boolean[] = []
    const harness = buildHarness({
      pause: {
        next: () => reads.shift() ?? false
      }
    })
    const approvalId = await approved(harness)
    reads.push(false, true)
    const result = await harness.run({ approvalId } as never)
    expect(result).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('pauses at the last guard before the tool body', async () => {
    const reads: boolean[] = []
    const harness = buildHarness({
      pause: {
        next: () => reads.shift() ?? false
      }
    })
    const approvalId = await approved(harness)
    reads.push(false, false, true)
    const result = await harness.run({ approvalId } as never)
    expect(result).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})
