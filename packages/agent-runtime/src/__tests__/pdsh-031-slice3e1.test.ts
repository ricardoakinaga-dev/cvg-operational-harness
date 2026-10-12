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
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type { GovernedTurnInput } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-12T12:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

interface HarnessOptions {
  readonly clock?: () => Date
  readonly limits?: Record<string, unknown>
  readonly policy?: unknown
  readonly pause?: { isPaused: (tenantId: string) => Promise<boolean> } | null
  readonly respond?: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>
  readonly toolExecutor?: () => Promise<{ result: unknown }>
  readonly clockController?: { now: number }
}

function buildHarness(options: HarnessOptions = {}) {
  const controller = options.clockController
  const clock =
    options.clock ?? (controller ? () => new Date(controller.now) : () => NOW)
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
    respond: (request) =>
      options.respond?.(request) ?? {
        text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
        usage: { inputTokens: 10, outputTokens: 5 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
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
  const policy =
    options.policy ??
    new PolicyEngine({
      profile: REFERENCE_POLICY_PROFILE,
      documents: [],
      clock
    })
  const approvals = new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock
  })
  const telemetry = new InMemoryTelemetry({ clock })
  const toolExecutor = vi.fn(
    options.toolExecutor ?? (async () => ({ result: { ok: true } }))
  )
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
    effectScopes: { 'record.create': 'controlled_fake' },
    effectJournal: new InMemoryEffectJournal({ clock }),
    ...(options.pause ? { pause: options.pause } : {})
  } as never)
  return {
    runtime,
    toolExecutor,
    run: (overrides: Partial<GovernedTurnInput> = {}) =>
      runtime.runTurn(
        turnInput({
          ...(options.limits !== undefined
            ? { limits: options.limits as never }
            : {}),
          ...overrides
        })
      )
  }
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
    capability: 'record.create',
    action: 'record.create',
    resource: { type: 'record', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'pdsh031-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'agendar' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

describe('PDSH-031 slice 3e-i — runtime gates and kernel stages', () => {
  it('pauses at the turn gate and reports a failing policy', async () => {
    const paused = buildHarness({ pause: { isPaused: async () => true } })
    const pausedResult = await paused.run()
    expect(pausedResult).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(paused.toolExecutor).not.toHaveBeenCalled()

    const failing = buildHarness({
      policy: {
        profile: REFERENCE_POLICY_PROFILE,
        evaluate: () => {
          throw new Error('policy exploded')
        }
      }
    })
    const denied = await failing.run()
    expect(denied).toMatchObject({ outcome: 'denied', reason: 'policy_failed' })
  })

  it('pauses after the model before the tool stage', async () => {
    let calls = 0
    const harness = buildHarness({
      pause: {
        isPaused: async () => {
          calls += 1
          return calls >= 2
        }
      }
    })
    const result = await harness.run()
    expect(result).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies when the model-call budget is empty', async () => {
    const harness = buildHarness({
      limits: {
        maxSteps: 5,
        maxModelCalls: 0,
        maxToolCalls: 2,
        maxDurationMs: 10_000,
        maxCostUsd: 1
      }
    })
    const result = await harness.run()
    expect(result).toMatchObject({
      outcome: 'denied',
      reason: 'model_calls_exhausted'
    })
  })

  it('denies on model deadline and on a failing gateway after the deadline', async () => {
    const deadline = buildHarness({
      clock: () => new Date(),
      limits: {
        maxSteps: 5,
        maxModelCalls: 4,
        maxToolCalls: 2,
        maxDurationMs: 100,
        maxCostUsd: 1
      },
      respond: () => new Promise(() => {})
    })
    expect(await deadline.run()).toMatchObject({
      outcome: 'denied',
      reason: 'loop_deadline_exceeded'
    })

    const modelController = new AbortController()
    const failing = buildHarness({
      respond: async () => {
        queueMicrotask(() => modelController.abort())
        throw new Error('provider exploded after a late cancellation')
      }
    })
    const failed = await failing.run({
      cancelSignal: modelController.signal
    } as never)
    expect(failed).toMatchObject({
      outcome: 'denied',
      reason: 'turn_cancelled'
    })
  })

  it('pauses inside the tool guard before any effect', async () => {
    let calls = 0
    const harness = buildHarness({
      pause: {
        isPaused: async () => {
          calls += 1
          return calls >= 3
        }
      }
    })
    const result = await harness.run()
    expect(result).toMatchObject({
      outcome: 'paused',
      reason: 'operator_paused'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies on tool deadline and tool cancellation', async () => {
    const deadline = buildHarness({
      clock: () => new Date(),
      limits: {
        maxSteps: 5,
        maxModelCalls: 4,
        maxToolCalls: 2,
        maxDurationMs: 150,
        maxCostUsd: 1
      },
      toolExecutor: () => new Promise(() => {})
    })
    const expired = await deadline.run()
    expect(expired).toMatchObject({
      outcome: 'denied',
      reason: 'loop_deadline_exceeded'
    })

    const controller = new AbortController()
    const cancelled = buildHarness({
      clock: () => new Date(),
      limits: {
        maxSteps: 5,
        maxModelCalls: 4,
        maxToolCalls: 2,
        maxDurationMs: 5_000,
        maxCostUsd: 1
      },
      toolExecutor: () => {
        controller.abort()
        return new Promise(() => {})
      }
    })
    const aborted = await cancelled.run({
      cancelSignal: controller.signal
    } as never)
    expect(aborted).toMatchObject({
      outcome: 'denied',
      reason: 'turn_cancelled'
    })
  })

  it('denies a late tool success and a late tool failure', async () => {
    const clockController = { now: NOW.getTime() }
    const lateSuccess = buildHarness({
      clockController,
      limits: {
        maxSteps: 5,
        maxModelCalls: 4,
        maxToolCalls: 2,
        maxDurationMs: 100,
        maxCostUsd: 1
      },
      toolExecutor: async () => {
        clockController.now += 1_000
        return { result: { ok: true } }
      }
    })
    const succeeded = await lateSuccess.run()
    expect(succeeded).toMatchObject({
      outcome: 'denied',
      reason: 'loop_deadline_exceeded'
    })

    const failureController = new AbortController()
    const lateFailure = buildHarness({
      toolExecutor: async () => {
        queueMicrotask(() => failureController.abort())
        throw new Error('late tool failure')
      }
    })
    const failed = await lateFailure.run({
      cancelSignal: failureController.signal
    } as never)
    expect(failed).toMatchObject({
      outcome: 'denied',
      reason: 'turn_cancelled'
    })
  })
})
