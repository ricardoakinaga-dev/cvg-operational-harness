import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import { CANONICAL_JSON_MAX_DEPTH } from '@cvg/shared'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type { GovernedTurnInput } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000071'
const clock = () => new Date('2026-09-30T12:00:00.000Z')

function fixture() {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'proposal-boundary',
    version: '1.0.0',
    content: 'Synthetic proposal boundary test.',
    owner: 'platform',
    approvedBy: 'synthetic-reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const respond = vi.fn(() => ({
    text: JSON.stringify({ text: 'synthetic draft' }),
    usage: { inputTokens: 10, outputTokens: 5 },
    providerId: 'deterministic',
    model: 'deterministic-v1',
    externalCall: false
  }))
  const gateway = new ModelGateway({
    providers: [new DeterministicModelProvider({ respond })],
    profiles: {
      fast: {
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
    },
    prompts,
    clock,
    retry: { maxRetries: 0 }
  })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock })
  // Observe the real engine; do not replace its implementation.
  const request = vi.spyOn(approvals, 'request')
  const telemetry = new InMemoryTelemetry({ clock })
  const startSpan = vi.spyOn(telemetry, 'startSpan')
  const toolExecutor = vi.fn(async () => ({ result: { synthetic: true } }))
  const outbox = vi.fn(async () => ({ eventId: 'synthetic-event' }))
  const runtime = new GovernedAgentRuntime({
    policy: new PolicyEngine({ profile: REFERENCE_POLICY_PROFILE, clock }),
    approvals,
    modelGateway: gateway,
    telemetry,
    audit: new HashChainedAuditLedger(),
    toolExecutor,
    outbox,
    effectJournal: new InMemoryEffectJournal({ clock }),
    effectScopes: { 'record.cancel': 'controlled_fake' },
    clock
  })
  const input = (schema: z.ZodType): GovernedTurnInput => ({
    tenantId: TENANT,
    operatorId: 'synthetic-operator',
    operatorRole: 'Supervisor',
    agentId: 'agent_00000000-0000-4000-8000-000000000071',
    agentVersion: 'synthetic-v1',
    agentProfile: 'assistant',
    conversationId: 'synthetic-conversation',
    correlationId: 'corr_00000000-0000-4000-8000-000000000071',
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'synthetic-record', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'proposal-boundary', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: {
      messages: [{ role: 'user', content: 'Synthetic draft.' }]
    },
    structuredOutput: { schemaName: 'SyntheticTransformedPayload', schema }
  })
  return {
    runtime,
    store,
    request,
    respond,
    telemetry,
    startSpan,
    toolExecutor,
    outbox,
    input
  }
}

const invalidPayloads: [string, () => unknown][] = [
  ['BigInt', () => ({ value: 1n })],
  ['non-finite number', () => ({ value: Number.NaN })],
  [
    'cycle',
    () => {
      const value: Record<string, unknown> = {}
      value.self = value
      return value
    }
  ],
  [
    'depth budget exceeded',
    () => {
      let value: unknown = 'synthetic leaf'
      for (let i = 0; i <= CANONICAL_JSON_MAX_DEPTH; i += 1)
        value = { next: value }
      return value
    }
  ]
]

describe('public runtime proposal boundary after structured-output transformation', () => {
  it.each(invalidPayloads)(
    'denies %s before approval or effects',
    async (_, makePayload) => {
      const h = fixture()
      const schema = z.object({ text: z.string() }).transform(makePayload)

      const result = await h.runtime.runTurn(h.input(schema))

      expect(result.outcome).toBe('denied')
      expect(result.reason).toBe('proposal_payload_invalid')
      expect(result.decision.decision).toBe('REQUIRE_APPROVAL')
      expect(result.approvalId).toBeUndefined()
      expect(result.auditChainValid).toBe(true)
      expect(h.respond).toHaveBeenCalledTimes(1)
      expect(h.request).not.toHaveBeenCalled()
      expect(h.store.list({ tenantId: TENANT })).toEqual([])
      expect(h.toolExecutor).not.toHaveBeenCalled()
      expect(h.outbox).not.toHaveBeenCalled()
      expect(h.startSpan).toHaveBeenCalled()
      expect(h.telemetry.spans()).toHaveLength(h.startSpan.mock.calls.length)
    }
  )

  it('persists exactly one valid transformed proposal without dispatching an effect', async () => {
    const h = fixture()
    const schema = z.object({ text: z.string() }).transform(({ text }) => ({
      text: text.toUpperCase(),
      version: 1
    }))

    const result = await h.runtime.runTurn(h.input(schema))

    expect(result.outcome).toBe('approval_required')
    expect(result.auditChainValid).toBe(true)
    expect(h.respond).toHaveBeenCalledTimes(1)
    expect(h.request).toHaveBeenCalledTimes(1)
    const records = h.store.list({ tenantId: TENANT })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      approvalId: result.approvalId,
      status: 'REQUESTED',
      proposalPayload: { text: 'SYNTHETIC DRAFT', version: 1 }
    })
    expect(h.request.mock.calls[0]?.[0].payload).toEqual({
      text: 'SYNTHETIC DRAFT',
      version: 1
    })
    expect(h.toolExecutor).not.toHaveBeenCalled()
    expect(h.outbox).not.toHaveBeenCalled()
    expect(h.startSpan).toHaveBeenCalled()
    expect(h.telemetry.spans()).toHaveLength(h.startSpan.mock.calls.length)
  })
})
