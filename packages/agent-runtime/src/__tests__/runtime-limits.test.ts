import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
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
import { PolicyEngine, type Capability } from '@cvg/policy-engine'
import { canonicalizeJson } from '@cvg/shared'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import type { ActiveSpan, Attributes, TraceContext } from '@cvg/observability'
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

const FAKE_CREATE_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.create': 'controlled_fake'
}
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

interface SpanTracker {
  telemetry: InMemoryTelemetry
  pending: () => string[]
  opened: () => string[]
  closed: () => string[]
}

/**
 * Tracks every span opened through the runtime telemetry so a test can prove
 * that no span remains pending after any outcome.
 */
function trackingTelemetry(clock: () => Date): SpanTracker {
  const inner = new InMemoryTelemetry({ clock })
  const open = new Map<string, string>()
  const openedNames: string[] = []
  const closedNames: string[] = []
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
      closedNames.push(span.name)
      originalEnd(status, errorCode)
    }
    return span
  }
  return {
    telemetry: inner,
    pending: () => [...open.values()],
    opened: () => [...openedNames],
    closed: () => [...closedNames]
  }
}

interface HarnessOptions {
  responses?: readonly string[]
  clock?: () => Date
  pricing?: number
  effectScopes?: Partial<Record<Capability, EffectScope>>
  respond?: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
}

function buildHarness(options: HarnessOptions = {}) {
  const clock = options.clock ?? (() => NOW)
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'limits-core',
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
  const pricing = options.pricing ?? 0
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
    clock,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({ documents: [], clock })
  const approvals = new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock
  })
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
  const journal = new InMemoryEffectJournal({ clock })
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry: tracker.telemetry,
    audit,
    toolExecutor,
    outbox,
    clock,
    effectScopes: options.effectScopes ?? FAKE_CREATE_SCOPE,
    effectJournal: journal
  })
  return {
    runtime,
    approvals,
    journal,
    tracker,
    audit,
    toolExecutor,
    outbox,
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
    prompt: { promptId: 'limits-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'agendar' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

async function requestApproval(
  harness: Harness,
  overrides: Partial<GovernedTurnInput> = {}
): Promise<string> {
  const requested = await harness.runtime.runTurn(
    turnInput({
      capability: 'appointment.cancel',
      action: 'appointment.cancel',
      ...overrides
    })
  )
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  expect(approvalId).not.toBe('')
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  return approvalId
}

function expectedDerivedOperationKey(proposalHash: string): string {
  return `op:${createHash('sha256')
    .update(
      canonicalizeJson({
        tenantId: TENANT,
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        proposalHash
      }),
      'utf8'
    )
    .digest('hex')}`
}

function expectNoPendingSpans(harness: Harness): void {
  expect(harness.tracker.pending()).toEqual([])
  expect(harness.tracker.opened()).toContain('agent.turn')
  expect(harness.tracker.closed()).toContain('agent.turn')
}

describe('AAA-11 T-09: per-turn maxSteps', () => {
  it('denies steps_budget_exceeded when maxSteps=1 and never starts tool/outbox', async () => {
    const harness = buildHarness()

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxSteps: 1 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('steps_budget_exceeded')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('tool.execute')
    expect(harness.tracker.opened()).not.toContain('outbox.enqueue')
    expectNoPendingSpans(harness)
    expect(harness.audit.verify().valid).toBe(true)
  })

  it('does not let the control steps (policy) consume maxSteps', async () => {
    const harness = buildHarness()

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxSteps: 3 } })
    )

    expect(result.outcome).toBe('executed')
    expect(harness.tracker.opened()).toEqual(
      expect.arrayContaining([
        'policy.evaluate',
        'model.generate',
        'tool.execute',
        'outbox.enqueue'
      ])
    )
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 T-10: deadline with a dependency that ignores AbortSignal', () => {
  it('ends the turn honestly after a slow tool, with no late outbox', async () => {
    let now = NOW
    const clock = () => now
    const harness = buildHarness({
      clock,
      effectScopes: FAKE_CANCEL_SCOPE,
      toolExecutor: async () => {
        now = new Date(now.getTime() + 60_000)
        return { result: { ok: true, late: true } }
      }
    })
    const approvalId = await requestApproval(harness)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId,
        limits: { maxDurationMs: 1_000 }
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(result.toolResult).toBeUndefined()
    expect(result.effectConfirmed).toBeUndefined()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(
      harness.journal.get(TENANT, operationKey)
    ).resolves.toMatchObject({ state: 'UNCERTAIN' })
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 T-11: cooperative cancellation', () => {
  it('denies turn_cancelled when the model ignores an abort mid-turn', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      respond: () => {
        controller.abort()
        return {
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('tool.execute')
    expectNoPendingSpans(harness)
  })

  it('denies turn_cancelled and marks the approval/journal UNCERTAIN when the tool ignores the abort', async () => {
    const controller = new AbortController()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      toolExecutor: async () => {
        controller.abort()
        return { result: { ok: true, late: true } }
      }
    })
    const approvalId = await requestApproval(harness)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId,
        cancelSignal: controller.signal
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(
      harness.journal.get(TENANT, operationKey)
    ).resolves.toMatchObject({ state: 'UNCERTAIN' })
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 budget call limits', () => {
  it('denies model_calls_exhausted for maxModelCalls=0 without calling the model', async () => {
    const harness = buildHarness()

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxModelCalls: 0 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('model_calls_exhausted')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('model.generate')
    expectNoPendingSpans(harness)
  })

  it('denies tool_calls_exhausted for maxToolCalls=0 without executing the tool', async () => {
    const harness = buildHarness()

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxToolCalls: 0 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tool_calls_exhausted')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('tool.execute')
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 outbox stage after an executed effect', () => {
  it('denies steps_budget_exceeded without starting the outbox and flags the confirmed effect', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await requestApproval(harness)

    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        approvalId,
        limits: { maxSteps: 1 }
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('steps_budget_exceeded')
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 signal propagation', () => {
  it('forwards the cancellation signal to the model gateway', async () => {
    const controller = new AbortController()
    let gatewaySignalAborted: boolean | undefined
    const harness = buildHarness({
      respond: (request) => {
        controller.abort()
        gatewaySignalAborted = request.signal.aborted
        return {
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(gatewaySignalAborted).toBe(true)
    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('forwards the cancellation signal to the tool invocation', async () => {
    const controller = new AbortController()
    let received: AbortSignal | undefined
    const harness = buildHarness({
      toolExecutor: async (invocation) => {
        received = invocation.signal
        return { result: { ok: true } }
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('executed')
    expect(received).toBe(controller.signal)
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 deadline and cost boundaries', () => {
  it('denies loop_deadline_exceeded between model and tool and starts no effect', async () => {
    let now = NOW
    const harness = buildHarness({
      clock: () => now,
      respond: () => {
        now = new Date(now.getTime() + 2_000)
        return {
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxDurationMs: 1_000 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.providerCalls()).toBe(1)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })

  it('denies loop_cost_exceeded after the model and before the tool', async () => {
    const harness = buildHarness({ pricing: 10 })

    const result = await harness.runtime.runTurn(
      turnInput({ limits: { maxCostUsd: 0.0001 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_cost_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 per-turn limit semantics', () => {
  it('resets counters for the next turn and applies limits only to the receiving turn', async () => {
    const harness = buildHarness()

    const limited = await harness.runtime.runTurn(
      turnInput({ limits: { maxSteps: 1 } })
    )
    expect(limited.outcome).toBe('denied')
    expect(limited.reason).toBe('steps_budget_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()

    const fresh = await harness.runtime.runTurn(turnInput())
    expect(fresh.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expectNoPendingSpans(harness)
  })

  it('does not inherit limits from a previous turn', async () => {
    const harness = buildHarness()

    const exhausted = await harness.runtime.runTurn(
      turnInput({ limits: { maxModelCalls: 0 } })
    )
    expect(exhausted.reason).toBe('model_calls_exhausted')

    const next = await harness.runtime.runTurn(turnInput())
    expect(next.outcome).toBe('executed')
    expect(harness.providerCalls()).toBe(1)
  })
})

describe('AAA-11 late responses after deadline or cancellation', () => {
  it('discards a late model result after cancellation and never triggers tool/outbox', async () => {
    const controller = new AbortController()
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    let releaseModel!: () => void
    const gate = new Promise<void>((resolve) => {
      releaseModel = resolve
    })
    const harness = buildHarness({
      respond: async () => {
        markStarted()
        await gate
        return {
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })

    const pending = harness.runtime.runTurn(
      turnInput({ cancelSignal: controller.signal })
    )
    await started
    controller.abort()
    releaseModel()
    const result = await pending

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.tracker.opened()).not.toContain('tool.execute')
    expect(harness.tracker.opened()).not.toContain('outbox.enqueue')
    expectNoPendingSpans(harness)
  })
})

describe('AAA-11 span closure', () => {
  it('closes root and child spans for success, policy denial, outbox failure and deadline', async () => {
    const success = buildHarness()
    await expect(success.runtime.runTurn(turnInput())).resolves.toMatchObject({
      outcome: 'executed'
    })
    expectNoPendingSpans(success)

    const policyDenied = buildHarness()
    await expect(
      policyDenied.runtime.runTurn(
        turnInput({
          capability: 'patient.record.write',
          action: 'patient.record.write'
        })
      )
    ).resolves.toMatchObject({ outcome: 'denied', reason: 'policy_denied' })
    expectNoPendingSpans(policyDenied)

    const outboxFailed = buildHarness({
      outbox: async () => {
        throw new Error('synthetic outbox outage')
      }
    })
    await expect(
      outboxFailed.runtime.runTurn(turnInput())
    ).resolves.toMatchObject({ outcome: 'denied', reason: 'outbox_failed' })
    expectNoPendingSpans(outboxFailed)

    let now = NOW
    const expired = buildHarness({
      clock: () => now,
      respond: () => {
        now = new Date(now.getTime() + 5_000)
        return {
          text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
          usage: { inputTokens: 10, outputTokens: 5 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })
    await expect(
      expired.runtime.runTurn(turnInput({ limits: { maxDurationMs: 1_000 } }))
    ).resolves.toMatchObject({
      outcome: 'denied',
      reason: 'loop_deadline_exceeded'
    })
    expectNoPendingSpans(expired)
  })
})
