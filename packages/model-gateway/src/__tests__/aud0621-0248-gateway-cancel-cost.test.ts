import { describe, expect, it } from 'vitest'
import { DeterministicModelProvider } from '../providers/deterministic.ts'
import { InMemoryCostBudgetStore } from '../budget.ts'
import { ModelProviderError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest
} from '../contracts.ts'

/**
 * SPEC0248 §3.4 (AUD-0621 F13/F14): an aborted signal never reaches a
 * provider or the budget store, the backoff races the signal, and the
 * request and profile cost ceilings deny a call whose estimate exceeds them.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'

function prompts(): PromptRegistry {
  const registry = new PromptRegistry()
  registry.register({
    promptId: 'audit-safe',
    version: '1.0.0',
    content: 'Synthetic administrative text only',
    owner: 'audit',
    approvedBy: 'audit-reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL'
  })
  return registry
}

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 512,
    timeoutMs: 1_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0.1,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 1, outputPer1kUsd: 1 },
    ...overrides
  }
}

function request(
  overrides: Partial<ModelGatewayRequest> = {}
): ModelGatewayRequest {
  return {
    requestId: 'audit-req-0248',
    tenantId: TENANT,
    correlationId: 'audit-corr-0248',
    promptId: 'audit-safe',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: { messages: [{ role: 'user', content: 'Synthetic text' }] },
    ...overrides
  }
}

function setup(
  options: {
    profile?: Partial<ModelProfile>
    fallback?: Partial<ModelProfile>
    respond?: (call: number, request: ProviderRequest) => void
    tokens?: number
    sleep?: (ms: number) => Promise<void>
  } = {}
) {
  const signals: AbortSignal[] = []
  const events: ModelGatewayEvent[] = []
  const store = new InMemoryCostBudgetStore()
  let calls = 0
  const provider = new DeterministicModelProvider({
    respond: (providerRequest) => {
      calls += 1
      signals.push(providerRequest.signal)
      options.respond?.(calls, providerRequest)
      return {
        text: 'safe',
        usage: {
          inputTokens: options.tokens ?? 1,
          outputTokens: options.tokens ?? 1
        },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      }
    }
  })
  const gateway = new ModelGateway({
    providers: [provider],
    profiles: {
      fast: profile({
        ...(options.fallback ? { fallbackProfile: 'local' } : {}),
        ...options.profile
      }),
      ...(options.fallback
        ? { local: profile({ name: 'local', ...options.fallback }) }
        : {})
    },
    ...(options.fallback ? { routing: { allowFallback: true } } : {}),
    prompts: prompts(),
    budget: { store, limits: { tenant: 100 } },
    onEvent: (event) => events.push(event),
    ...(options.sleep ? { sleep: options.sleep } : {})
  })
  return {
    gateway,
    events,
    store,
    signals,
    calls: () => calls
  }
}

describe('SPEC0248 F13 — an aborted signal stops the gateway', () => {
  it('AC16: a pre-aborted request reaches no provider and reserves nothing', async () => {
    const x = setup()
    await expect(
      x.gateway.generate({ ...request(), signal: AbortSignal.abort() })
    ).rejects.toMatchObject({ code: 'cancelled', retryable: false })
    expect(x.calls()).toBe(0)
    expect(x.store.consumed(`tenant:${TENANT}`)).toBe(0)
    expect(x.events.map((event) => event.type)).not.toContain(
      'model.call.started'
    )
  })

  it('AC17: an abort during the backoff ends the call without a new attempt', async () => {
    const controller = new AbortController()
    const x = setup({
      profile: { maxRetries: 3 },
      respond: () => {
        throw new ModelProviderError('deterministic', 'unavailable', 'down')
      },
      sleep: () => {
        controller.abort()
        return new Promise(() => undefined)
      }
    })
    await expect(
      x.gateway.generate({ ...request(), signal: controller.signal })
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(x.calls()).toBe(1)
    const failed = x.events.filter(
      (event) => event.type === 'model.call.failed'
    )
    // SPEC 0285 D1/T-1: attempt 1 ends with its own failure; the attempt the
    // backoff waited for never started and is closed as cancelled.
    expect(failed).toEqual([
      expect.objectContaining({ code: 'provider_unavailable', attempt: 1 }),
      expect.objectContaining({
        code: 'cancelled',
        attempt: 2,
        detail: 'not_started'
      })
    ])
  })

  it('an abort that lands after the backoff still prevents the next attempt', async () => {
    const controller = new AbortController()
    const x = setup({
      profile: { maxRetries: 3 },
      respond: () => {
        throw new ModelProviderError('deterministic', 'unavailable', 'down')
      },
      sleep: async () => {
        controller.abort()
      }
    })
    await expect(
      x.gateway.generate({ ...request(), signal: controller.signal })
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(x.calls()).toBe(1)
    expect(
      x.events.filter((event) => event.type === 'model.call.started')
    ).toHaveLength(1)
    // SPEC 0285 T-1: the cancelled terminal belongs to the attempt that
    // never started.
    expect(x.events.at(-1)).toMatchObject({
      type: 'model.call.failed',
      code: 'cancelled',
      attempt: 2,
      detail: 'not_started'
    })
  })

  it('the provider signal follows the caller signal and its reason', async () => {
    const controller = new AbortController()
    const x = setup()
    const result = await x.gateway.generate({
      ...request(),
      signal: controller.signal
    })
    expect(result.output.text).toBe('safe')
    expect(x.signals[0]?.aborted).toBe(false)
    const reason = new Error('caller stopped')
    controller.abort(reason)
    expect(x.signals[0]?.aborted).toBe(true)
    expect(x.signals[0]?.reason).toBe(reason)
  })

  it('a completed backoff resumes the next attempt', async () => {
    const x = setup({
      profile: { maxRetries: 1 },
      respond: (call) => {
        if (call === 1) {
          throw new ModelProviderError('deterministic', 'unavailable', 'down')
        }
      },
      sleep: async () => undefined
    })
    const result = await x.gateway.generate({
      ...request(),
      signal: new AbortController().signal
    })
    expect(result.attempts).toBe(2)
    expect(x.calls()).toBe(2)
  })
})

describe('SPEC0248 F14 — request and profile cost ceilings', () => {
  it('AC18: zero ceilings with a positive estimate deny before the provider', async () => {
    const x = setup({ profile: { maxCostUsd: 0 } })
    await expect(
      x.gateway.generate(request({ maxCostUsd: 0 }))
    ).rejects.toMatchObject({ code: 'budget_exceeded', retryable: false })
    expect(x.calls()).toBe(0)
    expect(x.store.consumed(`tenant:${TENANT}`)).toBe(0)
    expect(x.events).toContainEqual(
      expect.objectContaining({
        type: 'model.budget.denied',
        code: 'cost_ceiling'
      })
    )
  })

  it('AC18: the request ceiling alone denies', async () => {
    const x = setup({ profile: { maxCostUsd: 1 } })
    await expect(
      x.gateway.generate(request({ maxCostUsd: 0.05 }))
    ).rejects.toMatchObject({ code: 'budget_exceeded' })
    expect(x.calls()).toBe(0)
  })

  it('AC18: the profile ceiling alone denies', async () => {
    const x = setup({ profile: { maxCostUsd: 0.05 } })
    await expect(x.gateway.generate(request())).rejects.toMatchObject({
      code: 'budget_exceeded'
    })
    expect(x.calls()).toBe(0)
  })

  it('AC18: a request estimate counts against the ceiling', async () => {
    const x = setup({ profile: { maxCostUsd: 1, estimatedCostUsd: 0 } })
    await expect(
      x.gateway.generate(request({ maxCostUsd: 0.2, estimatedCostUsd: 0.3 }))
    ).rejects.toMatchObject({ code: 'budget_exceeded' })
    expect(x.calls()).toBe(0)
  })

  it('a non-finite ceiling or estimate fails closed', async () => {
    const unbounded = setup({
      profile: { maxCostUsd: Number.POSITIVE_INFINITY }
    })
    await expect(unbounded.gateway.generate(request())).rejects.toMatchObject({
      code: 'budget_exceeded'
    })
    const infinite = setup({
      profile: {
        maxCostUsd: Number.POSITIVE_INFINITY,
        estimatedCostUsd: Number.POSITIVE_INFINITY
      }
    })
    await expect(infinite.gateway.generate(request())).rejects.toMatchObject({
      code: 'budget_exceeded'
    })
    expect(unbounded.calls() + infinite.calls()).toBe(0)
    const nanCeiling = setup({ profile: { maxCostUsd: Number.NaN } })
    await expect(nanCeiling.gateway.generate(request())).rejects.toMatchObject({
      code: 'budget_exceeded'
    })
    const nanEstimate = setup({ profile: { estimatedCostUsd: Number.NaN } })
    await expect(nanEstimate.gateway.generate(request())).rejects.toMatchObject(
      { code: 'budget_exceeded' }
    )
    expect(nanCeiling.calls() + nanEstimate.calls()).toBe(0)
  })

  it('AC19: an estimate within the ceiling proceeds and the real cost is reported', async () => {
    const x = setup({ profile: { maxCostUsd: 0.1, estimatedCostUsd: 0.1 } })
    const result = await x.gateway.generate(request({ maxCostUsd: 0.5 }))
    expect(x.calls()).toBe(1)
    expect(result.costUsd).toBe(0.002)
    const completed = x.events.find(
      (event) => event.type === 'model.call.completed'
    )
    expect(completed?.detail).toBeUndefined()
  })

  it('AC19: a real cost above the ceiling stays visible', async () => {
    const x = setup({
      profile: { maxCostUsd: 0.1, estimatedCostUsd: 0.01 },
      tokens: 100
    })
    const result = await x.gateway.generate(request())
    expect(result.costUsd).toBe(0.2)
    expect(x.events).toContainEqual(
      expect.objectContaining({
        type: 'model.call.completed',
        costUsd: 0.2,
        detail: 'cost_ceiling_exceeded'
      })
    )
    expect(x.store.consumed(`tenant:${TENANT}`)).toBeCloseTo(0.2, 10)
  })

  it('AC19: a fallback candidate is held to its own ceiling', async () => {
    const x = setup({
      profile: { maxCostUsd: 1 },
      fallback: { maxCostUsd: 0.01 },
      respond: (call) => {
        if (call === 1) {
          throw new ModelProviderError('deterministic', 'unavailable', 'down')
        }
      }
    })
    await expect(x.gateway.generate(request())).rejects.toMatchObject({
      code: 'budget_exceeded'
    })
    expect(x.calls()).toBe(1)
  })
})
