import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApprovalEngine,
  ApprovalError,
  InMemoryApprovalStore,
  type ApprovalRecord
} from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type {
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '@cvg/model-gateway'
import {
  PolicyEngine,
  type Capability,
  type PolicyDocument
} from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import type { ActiveSpan, Attributes, TraceContext } from '@cvg/observability'
import { GovernedAgentRuntime, sweepExpiredApprovals } from '../runtime.ts'
import {
  InMemoryEffectJournal,
  type EffectJournalPort
} from '../effect-journal.ts'
import { ToolExecutionError } from '../contracts.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000011'
const AGENT = 'agent_00000000-0000-4000-8000-000000000011'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000011'
const NOW = new Date('2026-09-13T12:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })

const FAKE_CREATE_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.create': 'controlled_fake'
}
const FAKE_SEND_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'message.send': 'controlled_fake'
}
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

interface SpanTracker {
  telemetry: InMemoryTelemetry
  pending: () => string[]
  opened: () => string[]
}

function trackingTelemetry(clock: () => Date): SpanTracker {
  const inner = new InMemoryTelemetry({ clock })
  const open = new Map<string, string>()
  const openedNames: string[] = []
  const originalStart = inner.startSpan.bind(inner)
  inner.startSpan = (
    name: string,
    attributes?: Attributes,
    parent?: TraceContext
  ): ActiveSpan => {
    const span = originalStart(name, attributes, parent)
    openedNames.push(span.name)
    open.set(span.spanId, span.name)
    const originalEnd = span.end.bind(span)
    span.end = (status?: 'ok' | 'error', errorCode?: string): void => {
      open.delete(span.spanId)
      originalEnd(status, errorCode)
    }
    return span
  }
  return {
    telemetry: inner,
    pending: () => [...open.values()],
    opened: () => [...openedNames]
  }
}

interface HarnessOptions {
  responses?: readonly string[]
  documents?: PolicyDocument[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
  realEffectAuthorizations?: string[]
  clock?: () => Date
  runtimeClock?: () => Date
  omitClock?: boolean
  journal?: EffectJournalPort
  reservationTtlMs?: number
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
  store?: InMemoryApprovalStore
  respond?: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>
}

function buildHarness(options: HarnessOptions = {}) {
  const clock = options.clock ?? (() => NOW)
  const runtimeClock = options.runtimeClock ?? clock
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'kernel-core',
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
    respond: (request) => {
      providerCalls += 1
      if (options.respond !== undefined) return options.respond(request)
      const index = Math.min(providerCalls - 1, responses.length - 1)
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
    clock,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({
    documents: options.documents ?? [],
    clock
  })
  const store = options.store ?? new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock })
  const tracker = trackingTelemetry(clock)
  const audit = new HashChainedAuditLedger()
  const fallbackTool: (
    invocation: ToolInvocation
  ) => Promise<{ result: unknown }> = async () => ({
    result: { ok: true, synthetic: true }
  })
  const toolExecutor = vi.fn(options.toolExecutor ?? fallbackTool)
  const outbox = vi.fn(
    options.outbox ??
      (async (event: OutboxEnqueueInput) => ({
        eventId: `evt_${event.idempotencyKey}`
      }))
  )
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry: tracker.telemetry,
    audit,
    toolExecutor,
    outbox,
    ...(options.omitClock === true ? {} : { clock: runtimeClock }),
    ...(options.effectScopes !== undefined
      ? { effectScopes: options.effectScopes }
      : {}),
    ...(options.realEffectAuthorizations !== undefined
      ? { realEffectAuthorizations: options.realEffectAuthorizations }
      : {}),
    ...(options.journal !== undefined
      ? { effectJournal: options.journal }
      : {}),
    ...(options.reservationTtlMs !== undefined
      ? { reservationTtlMs: options.reservationTtlMs }
      : {})
  })
  return {
    runtime,
    approvals,
    policy,
    modelGateway,
    telemetry: tracker.telemetry,
    tracker,
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
    capability: 'appointment.create',
    action: 'appointment.create',
    resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'kernel-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'agendar' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

function policyDocument(
  rule: PolicyDocument['rules'][number],
  version = '1.0.0'
): PolicyDocument {
  return {
    policyId: 'tenant.kernel',
    version,
    tenantId: TENANT,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    rules: [rule]
  }
}

function expectNoPendingSpans(harness: Harness): void {
  expect(harness.tracker.pending()).toEqual([])
  expect(harness.tracker.opened()).toContain('agent.turn')
}

class AbortingSweepJournal extends InMemoryEffectJournal {
  readonly #controller: AbortController
  constructor(controller: AbortController, clock: () => Date = () => NOW) {
    super({ clock })
    this.#controller = controller
  }
  override async releaseExpired(): Promise<number> {
    this.#controller.abort()
    return 0
  }
}

describe('kernel policy matrix through the public runTurn', () => {
  it('denies a policy DENY without invoking model, tool or outbox', async () => {
    const harness = buildHarness({
      documents: [
        policyDocument({
          id: 'deny-create',
          effect: 'DENY',
          priority: 10,
          capabilities: ['appointment.create'],
          reason: 'tenant forbids automatic creation'
        })
      ]
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_denied')
    expect(result.decision.decision).toBe('DENY')
    expect(result.decision.policyId).toBe('tenant.kernel')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('maps a DENY carrying an approvalId to policy_changed before any approval read', async () => {
    const harness = buildHarness({
      documents: [
        policyDocument({
          id: 'deny-create',
          effect: 'DENY',
          priority: 10,
          capabilities: ['appointment.create'],
          reason: 'tenant forbids automatic creation'
        })
      ]
    })

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId: 'appr_synthetic' })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_changed')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('maps an ALLOW decision carrying an approvalId to policy_changed in the execution header', async () => {
    const harness = buildHarness({ effectScopes: FAKE_SEND_SCOPE })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'message.send',
        action: 'message.send',
        resource: { type: 'conversation', id: 'conv_1', tenantId: TENANT },
        approvalId: 'appr_synthetic'
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('policy_changed')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('turns a policy REQUIRE_APPROVAL into a frozen proposal before any side effect', async () => {
    const harness = buildHarness({
      documents: [
        policyDocument({
          id: 'approval-create',
          effect: 'REQUIRE_APPROVAL',
          priority: 5,
          capabilities: ['appointment.create'],
          reason: 'synthetic tightened policy'
        })
      ]
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('approval_required')
    expect(result.approvalId).toBeDefined()
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    const record = harness.approvals.get(TENANT, result.approvalId ?? '')
    expect(record.status).toBe('REQUESTED')
    expect(record.proposalPayload).toEqual({ text: 'APPROVED_PAYLOAD' })
    expect(record.proposalHash).toMatch(/^[0-9a-f]{64}$/)
    expectNoPendingSpans(harness)
  })
})

describe('kernel budget and stop checkpoints through the public runTurn', () => {
  it('cancels at the pre-sweep checkpoint without calling any dependency', async () => {
    const harness = buildHarness()
    const controller = new AbortController()
    controller.abort()

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('policy.evaluate')
    expectNoPendingSpans(harness)
  })

  it('cancels at the post-journal-sweep checkpoint', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      effectScopes: FAKE_CREATE_SCOPE,
      journal: new AbortingSweepJournal(controller)
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('cancels at the post-approval-sweep checkpoint', async () => {
    const controller = new AbortController()
    const harness = buildHarness({ effectScopes: FAKE_CREATE_SCOPE })
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => {
      controller.abort()
      return { released: 0, uncertain: 0 }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('cancels at the model-stage start checkpoint after policy decided', async () => {
    const controller = new AbortController()
    const harness = buildHarness()
    const original = harness.audit.append.bind(harness.audit)
    vi.spyOn(harness.audit, 'append').mockImplementation((entry) => {
      if (entry.type === 'policy.decided') controller.abort()
      return original(entry)
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.tracker.opened()).not.toContain('model.generate')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('rejects malformed loop limits before any dependency runs', async () => {
    const harness = buildHarness()

    await expect(
      harness.runtime.runTurn(turnInput({ limits: { maxSteps: 0 } }))
    ).rejects.toThrow()
    await expect(
      harness.runtime.runTurn(turnInput({ limits: { maxCostUsd: -1 } }))
    ).rejects.toThrow()

    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('kernel model failure handling', () => {
  it('denies a provider failure with a stable code and no downstream stage', async () => {
    const harness = buildHarness({
      respond: () => {
        throw new Error('synthetic provider outage')
      }
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('internal_error')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('prefers the cancellation reason over a late provider failure', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      respond: () => {
        controller.abort()
        throw new Error('synthetic late failure')
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('reports an approval request failure as approval_invalid without side effects', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    vi.spyOn(harness.approvals, 'request').mockImplementation(() => {
      throw new Error('synthetic approval store outage')
    })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel'
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('propagates a typed approval request failure code', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    vi.spyOn(harness.approvals, 'request').mockImplementation(() => {
      throw new ApprovalError('invalid_request', 'synthetic schema failure')
    })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel'
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('invalid_request')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })
})

describe('kernel allow-path tool failure handling', () => {
  it('maps a generic tool failure to tool_failed with no outbox', async () => {
    const harness = buildHarness({
      toolExecutor: async () => {
        throw new Error('synthetic tool crash')
      }
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tool_failed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('propagates a typed ToolExecutionError code', async () => {
    const harness = buildHarness({
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic tool rejection',
          { certainty: 'no_effect' }
        )
      }
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tool_rejected')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('prefers cancellation over a tool that returns after the abort', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      toolExecutor: async () => {
        controller.abort()
        return { result: { ok: true, late: true } }
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(result.outboxPending).toBeUndefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('prefers cancellation over a tool that throws after the abort', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      toolExecutor: async () => {
        controller.abort()
        throw new Error('synthetic late tool failure')
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('flags outbox_pending when the outbox budget is exhausted after an allow-path effect', async () => {
    const harness = buildHarness()

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxSteps: 2 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('steps_budget_exceeded')
    expect(result.outboxPending).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('outbox.enqueue')
    expectNoPendingSpans(harness)
  })
})

describe('kernel real-effect authorization and durability', () => {
  it('executes an explicitly authorized real_authorized capability when a journal exists', async () => {
    const harness = buildHarness({
      effectScopes: { 'message.send': 'real_authorized' },
      realEffectAuthorizations: ['message.send'],
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'message.send',
        action: 'message.send',
        resource: { type: 'conversation', id: 'conv_1', tenantId: TENANT }
      })
    )

    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expectNoPendingSpans(harness)
  })

  it('denies real_authorized without a durable journal before the tool', async () => {
    const harness = buildHarness({
      effectScopes: { 'message.send': 'real_authorized' },
      realEffectAuthorizations: ['message.send']
    })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'message.send',
        action: 'message.send',
        resource: { type: 'conversation', id: 'conv_1', tenantId: TENANT }
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('durability_required')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('denies an undeclared real_authorized capability even when a journal exists', async () => {
    const harness = buildHarness({
      effectScopes: { 'message.send': 'real_authorized' },
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'message.send',
        action: 'message.send',
        resource: { type: 'conversation', id: 'conv_1', tenantId: TENANT }
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('real_effect_not_authorized')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })
})

describe('kernel unexpected failure safety net', () => {
  it('closes every span and rethrows when the audit ledger fails mid-turn', async () => {
    const harness = buildHarness()
    vi.spyOn(harness.audit, 'append').mockImplementationOnce(() => {
      throw new Error('synthetic audit ledger outage')
    })

    await expect(harness.runtime.runTurn(turnInput())).rejects.toThrow(
      'synthetic audit ledger outage'
    )

    expect(harness.tracker.pending()).toEqual([])
    expect(harness.tracker.opened()).toContain('agent.turn')
    expect(harness.audit.verify().valid).toBe(true)
  })

  it('defaults ToolExecutionError certainty to unknown', () => {
    const error = new ToolExecutionError('tool_failed', 'synthetic')
    expect(error.certainty).toBe('unknown')
    expect(error.code).toBe('tool_failed')
    expect(error.name).toBe('ToolExecutionError')
  })
})

function approveApproval(harness: Harness, approvalId: string): void {
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
}

const MODIFY_DOCUMENTS: PolicyDocument[] = [
  policyDocument({
    id: 'modify-requires-approval',
    effect: 'REQUIRE_APPROVAL',
    priority: 5,
    capabilities: ['appointment.modify'],
    reason: 'synthetic approval requirement'
  })
]
const FAKE_MODIFY_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.modify': 'controlled_fake'
}

function modifyInput(
  overrides: Partial<GovernedTurnInput> = {}
): GovernedTurnInput {
  return turnInput({
    capability: 'appointment.modify',
    action: 'appointment.modify',
    resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT },
    ...overrides
  })
}

async function requestModifyApproval(harness: Harness): Promise<string> {
  const requested = await harness.runtime.runTurn(modifyInput())
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  expect(approvalId).not.toBe('')
  approveApproval(harness, approvalId)
  return approvalId
}

describe('kernel optional input wiring and adapter fallbacks', () => {
  it('carries sessionId, prompt sha256 and task through a successful turn', async () => {
    const harness = buildHarness()
    const sha256 = createHash('sha256')
      .update('You are the CVG secretary.', 'utf8')
      .digest('hex')

    const result = await harness.runtime.runTurn(
      turnInput({
        sessionId: 'session_synthetic_1',
        task: 'synthetic-task',
        prompt: { promptId: 'kernel-core', version: '1.0.0', sha256 }
      })
    )

    expect(result.outcome).toBe('executed')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('uses the default wall clock when none is injected', async () => {
    const harness = buildHarness({ omitClock: true })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('executed')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('executes a resource without optional id or tenant scope', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const input = turnInput({
      capability: 'appointment.cancel',
      action: 'appointment.cancel',
      resource: { type: 'appointment' }
    })
    const requested = await harness.runtime.runTurn(input)
    expect(requested.outcome).toBe('approval_required')
    approveApproval(harness, requested.approvalId ?? '')

    const executed = await harness.runtime.runTurn({
      ...input,
      approvalId: requested.approvalId ?? ''
    })

    expect(executed.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('maps a non-gateway model failure to model_failed', async () => {
    const harness = buildHarness()
    vi.spyOn(harness.modelGateway, 'generate').mockImplementation(() => {
      throw new Error('synthetic non-gateway failure')
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('model_failed')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('sweeps expired approvals with default now and ttl', async () => {
    const store = new InMemoryApprovalStore()
    const approvals = new ApprovalEngine({ store, clock: () => NOW })

    const counters = await sweepExpiredApprovals({
      approvals,
      tenantId: TENANT
    })

    expect(counters).toEqual({ released: 0, uncertain: 0 })
  })
})

describe('kernel execution without a durable journal', () => {
  it('executes an approved medium-risk capability and uses the fallback outbox key', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE
    })
    const approvalId = await requestModifyApproval(harness)

    const executed = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(executed.outcome).toBe('executed')
    expect(executed.replayed).toBeUndefined()
    expect(executed.resultDigest).toBeUndefined()
    expect(executed.executionRef).toBeUndefined()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    const event = harness.outbox.mock.calls[0]?.[0]
    expect(event?.idempotencyKey).toBe(
      `${TENANT}:appointment.modify:${CORRELATION}`
    )
  })

  it('omits the proposal id from the outbox payload for a legacy approval', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE
    })
    const approvalId = await requestModifyApproval(harness)
    harness.store.update(
      TENANT,
      approvalId,
      'APPROVED',
      (current) =>
        ({
          ...current,
          proposalId: undefined
        }) as unknown as ApprovalRecord
    )

    const executed = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(executed.outcome).toBe('executed')
    const event = harness.outbox.mock.calls[0]?.[0]
    expect(event?.payload.proposalId).toBeNull()
  })

  it('marks UNCERTAIN when a journal-less tool returns after cancellation', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        controller.abort()
        return { result: { ok: true, late: true } }
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(
      modifyInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN when a journal-less tool throws after cancellation', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        controller.abort()
        throw new Error('synthetic late tool failure')
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(
      modifyInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('releases a journal-less no-effect failure back to APPROVED', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tool_rejected')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN on a journal-less ambiguous failure', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        throw new Error('synthetic ambiguous transport failure')
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('denies with approval_invalid when a journal-less release fails unexpectedly', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const approvalId = await requestModifyApproval(harness)
    vi.spyOn(harness.approvals, 'release').mockImplementation(() => {
      throw new Error('synthetic unexpected release failure')
    })

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
  })

  it('denies with approval_invalid when a journal-less markUncertain fails unexpectedly', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        throw new Error('synthetic ambiguous transport failure')
      }
    })
    const approvalId = await requestModifyApproval(harness)
    vi.spyOn(harness.approvals, 'markUncertain').mockImplementation(() => {
      throw new Error('synthetic unexpected markUncertain failure')
    })

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
  })
})

describe('kernel safety net and outbox-pending fallbacks', () => {
  it('closes an open child span when telemetry fails mid-stage', async () => {
    const harness = buildHarness()
    const original = harness.telemetry.recordMetric.bind(harness.telemetry)
    vi.spyOn(harness.telemetry, 'recordMetric').mockImplementation(
      (name, value, attributes) => {
        if (name === 'model_calls_total') {
          throw new Error('synthetic telemetry outage')
        }
        original(name, value, attributes)
      }
    )

    await expect(harness.runtime.runTurn(turnInput())).rejects.toThrow(
      'synthetic telemetry outage'
    )

    expect(harness.tracker.pending()).toEqual([])
    expect(harness.tracker.opened()).toContain('model.generate')
  })

  it('reports outbox_pending when a journal-less outbox enqueue throws', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      outbox: async () => {
        throw new Error('synthetic outbox outage')
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(result.reason).toBe('outbox_pending')
    expect(result.outboxPending).toBe(true)
    expect(result.executionRef).toBeUndefined()
    expect(result.resultDigest).toBeUndefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('reports outbox_pending when a journal-less outbox budget is exhausted', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(
      modifyInput({ approvalId, limits: { maxSteps: 1 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('steps_budget_exceeded')
    expect(result.outboxPending).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(result.executionRef).toBeUndefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('treats a thrown non-Error as an ambiguous failure with a fallback message', async () => {
    const harness = buildHarness({
      documents: MODIFY_DOCUMENTS,
      effectScopes: FAKE_MODIFY_SCOPE,
      toolExecutor: async () => {
        throw 'synthetic string failure'
      }
    })
    const approvalId = await requestModifyApproval(harness)

    const result = await harness.runtime.runTurn(modifyInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})
