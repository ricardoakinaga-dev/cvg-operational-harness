import { describe, expect, it } from 'vitest'
import type { DataClassification } from '@cvg/shared'
import { ModelGateway } from '../gateway.ts'
import {
  BudgetGuard,
  InMemoryCostBudgetStore,
  budgetScopeKeys
} from '../budget.ts'
import { CircuitBreaker } from '../circuit-breaker.ts'
import {
  ModelGatewayError,
  ModelProviderError,
  toGatewayError
} from '../errors.ts'
import {
  PromptRegistry,
  computePromptSha256,
  promptContainsClassification
} from '../prompt-registry.ts'
import { ModelRouter } from '../router.ts'
import { DeterministicModelProvider } from '../providers/deterministic.ts'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-13T12:00:00.000Z')

function baseRequest(
  overrides: Partial<ModelGatewayRequest> = {}
): ModelGatewayRequest {
  return {
    requestId: 'req_hardening_0001',
    tenantId: TENANT,
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    promptId: 'secretary-core',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: { messages: [{ role: 'user', content: 'ola' }] },
    ...overrides
  }
}

function profile(
  name: ModelProfile['name'],
  overrides: Partial<ModelProfile> = {}
): ModelProfile {
  return {
    name,
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 512,
    timeoutMs: 1_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0.001,
    maxRetries: 2,
    pricing: { inputPer1kUsd: 0.01, outputPer1kUsd: 0.02 },
    ...overrides
  }
}

function registryFor(
  classification: DataClassification = 'INTERNAL',
  overrides: Partial<Parameters<PromptRegistry['register']>[0]> = {}
): PromptRegistry {
  const registry = new PromptRegistry()
  registry.register({
    promptId: 'secretary-core',
    version: '1.0.0',
    content: 'You are the CVG secretary assistant.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification,
    tenantId: TENANT,
    ...overrides
  })
  return registry
}

function successfulProvider(model = 'deterministic-v1') {
  return new DeterministicModelProvider({
    respond: () => ({
      text: 'ok',
      usage: { inputTokens: 10, outputTokens: 5 },
      providerId: 'deterministic',
      model,
      externalCall: false
    })
  })
}

describe('gateway defaults and fallbacks', () => {
  it('uses the default clock, sleep and random sources when omitted', async () => {
    let calls = 0
    const provider = new DeterministicModelProvider({
      respond: () => {
        calls += 1
        if (calls === 1) {
          throw new ModelProviderError(
            'deterministic',
            'unavailable',
            'down',
            503
          )
        }
        return {
          text: 'default-sources',
          usage: { inputTokens: 0, outputTokens: 0 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast', { maxRetries: 1 }) },
      prompts: registryFor(),
      retry: { baseDelayMs: 1, maxDelayMs: 1, jitterRatio: 0 }
    })

    const result = await gateway.generate(baseRequest())
    expect(result.output.text).toBe('default-sources')
    expect(result.attempts).toBe(2)
  })

  it('emits circuit transitions through the options wrapper', async () => {
    const transitions: string[] = []
    const events: ModelGatewayEvent[] = []
    const provider = new DeterministicModelProvider({
      respond: () => {
        throw new ModelProviderError('deterministic', 'unavailable', 'down')
      }
    })
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast', { maxRetries: 0 }) },
      prompts: registryFor(),
      clock: () => NOW,
      circuitBreaker: {
        failureThreshold: 1,
        onTransition: (transition) => {
          transitions.push(`${transition.from}->${transition.to}`)
        }
      },
      onEvent: (event) => events.push(event)
    })

    await expect(gateway.generate(baseRequest())).rejects.toMatchObject({
      code: 'provider_unavailable'
    })
    expect(transitions).toEqual(['CLOSED->OPEN'])
    expect(events.map((event) => event.type)).toContain(
      'model.circuit.transition'
    )
    expect(gateway.circuitSnapshot()).toEqual({
      'deterministic:deterministic-v1': 'OPEN'
    })
  })

  it('falls back to the configured fallback profile after a retryable error', async () => {
    const requested: string[] = []
    const events: ModelGatewayEvent[] = []
    const provider = new DeterministicModelProvider({
      model: 'deterministic-v1',
      respond: (request) => {
        requested.push(request.model)
        if (request.model === 'fast-model') {
          throw new ModelProviderError('deterministic', 'unavailable', 'down')
        }
        return {
          text: 'fallback-answer',
          usage: { inputTokens: 0, outputTokens: 0 },
          providerId: 'deterministic',
          model: request.model,
          externalCall: false
        }
      }
    })
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: {
        fast: profile('fast', {
          model: 'fast-model',
          maxRetries: 0,
          fallbackProfile: 'critical-review'
        }),
        'critical-review': profile('critical-review', {
          model: 'critical-model'
        })
      },
      prompts: registryFor(),
      clock: () => NOW,
      routing: { allowFallback: true },
      onEvent: (event) => events.push(event)
    })
    const result = await gateway.generate(baseRequest())

    expect(requested).toEqual(['fast-model', 'critical-model'])
    expect(result.fallbackUsed).toBe(true)
    expect(result.profile).toBe('critical-review')
    expect(events.map((event) => event.type)).toContain(
      'model.routing.fallback'
    )
  })

  it('routes task hints, carries metadata and pins the prompt hash', async () => {
    const seen: Array<Record<string, unknown>> = []
    const provider = new DeterministicModelProvider({
      respond: (request) => {
        seen.push(request as unknown as Record<string, unknown>)
        return {
          text: 'routed',
          usage: { inputTokens: 0, outputTokens: 0 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast') },
      prompts: registryFor(),
      clock: () => NOW,
      routing: { rules: [{ task: 'triage', profile: 'fast' }] }
    })
    const result = await gateway.generate(
      baseRequest({
        task: 'triage',
        promptSha256: computePromptSha256(
          'You are the CVG secretary assistant.'
        ),
        metadata: { fixture: 'metadata' }
      })
    )
    expect(result.output.text).toBe('routed')
    expect(seen[0]).toMatchObject({ metadata: { fixture: 'metadata' } })
  })

  it('rejects unregistered providers before invoking them', async () => {
    const gateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast', { providerId: 'unregistered' }) },
      prompts: registryFor(),
      clock: () => NOW
    })
    await expect(gateway.generate(baseRequest())).rejects.toMatchObject({
      code: 'provider_unknown'
    })
  })
})

describe('gateway routing substitution and policy', () => {
  it('substitutes a local profile and records the substitution', async () => {
    const events: ModelGatewayEvent[] = []
    const gateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: {
        balanced: profile('balanced', {
          providerId: 'external-openai',
          location: 'external'
        }),
        local: profile('local')
      },
      prompts: registryFor('CONFIDENTIAL'),
      clock: () => NOW,
      routing: { allowLocalSubstitution: true },
      onEvent: (event) => events.push(event)
    })

    const result = await gateway.generate(
      baseRequest({
        modelProfile: 'balanced',
        dataClassification: 'CONFIDENTIAL'
      })
    )

    expect(result.profile).toBe('local')
    expect(result.substitutedProfile).toBe('balanced')
    expect(events.map((event) => event.type)).toContain(
      'model.routing.substituted'
    )
  })

  it('denies a request class broader than the approved prompt class', async () => {
    const gateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast') },
      prompts: registryFor('PUBLIC'),
      clock: () => NOW
    })
    await expect(
      gateway.generate(baseRequest({ dataClassification: 'CLINICAL' }))
    ).rejects.toMatchObject({ code: 'policy_denied' })
  })

  it('accepts a request class narrower than the approved prompt class', async () => {
    const gateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast') },
      prompts: registryFor('CLINICAL'),
      clock: () => NOW
    })
    const result = await gateway.generate(
      baseRequest({ dataClassification: 'INTERNAL' })
    )
    expect(result.output.text).toBe('ok')
  })

  it('maps prompt registry failures onto stable gateway codes', async () => {
    const revoked = registryFor('INTERNAL', { status: 'revoked' })
    const revokedGateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast') },
      prompts: revoked,
      clock: () => NOW
    })
    await expect(revokedGateway.generate(baseRequest())).rejects.toMatchObject({
      code: 'prompt_revoked'
    })

    const unknownGateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast') },
      prompts: registryFor(),
      clock: () => NOW
    })
    await expect(
      unknownGateway.generate(baseRequest({ promptId: 'missing-prompt' }))
    ).rejects.toMatchObject({ code: 'prompt_unknown' })
  })

  it('rethrows unexpected prompt resolution failures untouched', async () => {
    const exploding = {
      resolve: () => {
        throw new Error('unexpected registry failure')
      }
    } as unknown as PromptRegistry
    const gateway = new ModelGateway({
      providers: [successfulProvider()],
      profiles: { fast: profile('fast') },
      prompts: exploding,
      clock: () => NOW
    })
    await expect(gateway.generate(baseRequest())).rejects.toThrowError(
      'unexpected registry failure'
    )
  })
})

describe('router hardening', () => {
  it('skips invalid profile entries and resolves task rules', () => {
    const local = profile('local')
    const external = profile('balanced', {
      location: 'external',
      providerId: 'openai'
    })
    const router = new ModelRouter(
      {
        local,
        balanced: external,
        bogus: undefined,
        BAD: external
      } as unknown as Partial<Record<ModelProfile['name'], ModelProfile>>,
      { rules: [{ task: 'triage', profile: 'local' }] }
    )

    expect(router.profile('bogus' as ModelProfile['name'])).toBeUndefined()
    const routed = router.resolve({
      requestedProfile: 'balanced',
      task: 'triage',
      dataClassification: 'INTERNAL'
    })
    expect(routed.profile.name).toBe('local')
    expect(routed.ruleTask).toBe('triage')
    expect(router.allowFallback).toBe(false)
  })

  it('blocks a local profile from falling back to an external location', () => {
    const local = profile('local', { fallbackProfile: 'balanced' })
    const external = profile('balanced', {
      location: 'external',
      providerId: 'openai'
    })
    const router = new ModelRouter(
      { local, balanced: external },
      { allowFallback: true }
    )
    expect(router.fallbackFor(local)).toBeUndefined()
    expect(
      router.fallbackFor(profile('fast', { fallbackProfile: 'balanced' }))
    ).toBeUndefined()
  })
})

describe('budget hardening', () => {
  it('ignores invalid consumption and settlement amounts', () => {
    const store = new InMemoryCostBudgetStore()
    store.consume('scope', Number.NaN)
    store.consume('scope', 0)
    store.consume('scope', -1)
    expect(store.consumed('scope')).toBe(0)
    const guard = new BudgetGuard({
      store,
      limits: { tenant: 1, session: 1, agent: 1 }
    })
    guard.settle({
      reservedKeys: ['scope'],
      estimatedCostUsd: 1,
      actualCostUsd: Number.NaN
    })
    guard.settle({
      reservedKeys: ['scope'],
      estimatedCostUsd: 1,
      actualCostUsd: 0.5
    })
    expect(store.consumed('scope')).toBe(0)
  })

  it('uses the default clock when authorizing', () => {
    const store = new InMemoryCostBudgetStore()
    const guard = new BudgetGuard({ store, limits: { request: 1 } })
    const authorization = guard.authorize({
      request: baseRequest(),
      estimatedCostUsd: 0.1
    })
    expect(authorization.allowed).toBe(true)
    expect(store.consumed('request:req_hardening_0001')).toBeCloseTo(0.1, 6)
  })

  it('maps session and agent scopes and tolerates non-finite estimates', () => {
    const request = baseRequest({
      sessionId: 'sess_budget_1',
      agentId: 'agent_budget_1'
    })
    const keys = budgetScopeKeys(request, NOW)
    expect(keys.session).toBe(`session:${TENANT}:sess_budget_1`)
    expect(keys.agent).toBe(`agent:${TENANT}:agent_budget_1`)
    expect(budgetScopeKeys(baseRequest(), NOW).session).toBeNull()
    expect(budgetScopeKeys(baseRequest(), NOW).agent).toBeNull()

    const store = new InMemoryCostBudgetStore()
    const guard = new BudgetGuard({
      store,
      limits: { session: 1 },
      clock: () => NOW
    })
    const authorization = guard.authorize({
      request,
      estimatedCostUsd: Number.NaN
    })
    expect(authorization.allowed).toBe(true)
    expect(store.consumed(`session:${TENANT}:sess_budget_1`)).toBe(0)

    store.consume(`session:${TENANT}:sess_budget_1`, 2)
    expect(guard.authorize({ request, estimatedCostUsd: 0.5 })).toMatchObject({
      allowed: false,
      deniedScope: 'session'
    })
  })
})

describe('error taxonomy hardening', () => {
  it.each([
    'timeout',
    'rate_limited',
    'unavailable',
    'connection',
    'auth',
    'invalid_request',
    'response_too_large',
    'malformed_response',
    'cancelled',
    'internal'
  ] as const)('maps %s without a status', (kind) => {
    const error = toGatewayError(new ModelProviderError('p', kind, 'x'))
    expect(error.status).toBeUndefined()
    expect(error.code).toBeTruthy()
  })

  it('exposes retryability and falls back to an internal error', () => {
    expect(new ModelProviderError('p', 'timeout', 'x').retryable).toBe(true)
    expect(new ModelProviderError('p', 'internal', 'x').retryable).toBe(false)
    expect(
      toGatewayError(new ModelProviderError('p', 'internal', 'x')).code
    ).toBe('internal_error')
    expect(toGatewayError(null).code).toBe('internal_error')
  })

  it('retains statuses and gateway pass-through', () => {
    const original = new ModelGatewayError('circuit_open', 'open')
    expect(toGatewayError(original)).toBe(original)
    expect(
      toGatewayError(new ModelProviderError('p', 'auth', 'x', 401)).status
    ).toBe(401)
    expect(
      toGatewayError(new ModelProviderError('p', 'timeout', 'x', 504)).status
    ).toBe(504)
  })
})

describe('circuit breaker hardening', () => {
  it('uses defaults, snapshots state and gates half-open probes', () => {
    let nowMs = 0
    const transitions: string[] = []
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      openMs: 100,
      halfOpenSuccesses: 1,
      clock: () => nowMs,
      onTransition: (transition) => {
        transitions.push(`${transition.from}->${transition.to}`)
      }
    })
    expect(breaker.state('key')).toBe('CLOSED')
    expect(breaker.canRequest('key')).toBe(true)
    expect(breaker.snapshot()).toEqual({ key: 'CLOSED' })

    breaker.onFailure('key')
    expect(breaker.snapshot()).toEqual({ key: 'OPEN' })
    expect(breaker.canRequest('key')).toBe(false)

    nowMs += 101
    expect(breaker.state('key')).toBe('HALF_OPEN')
    expect(breaker.canRequest('key')).toBe(true)
    expect(breaker.canRequest('key')).toBe(false)
    breaker.onSuccess('key')
    expect(breaker.snapshot()).toEqual({ key: 'CLOSED' })
    expect(transitions).toEqual([
      'CLOSED->OPEN',
      'OPEN->HALF_OPEN',
      'HALF_OPEN->CLOSED'
    ])
    expect(new CircuitBreaker().state('default')).toBe('CLOSED')
  })

  it('uses the default clock when a breaker trips', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1 })
    breaker.onFailure('default-clock')
    expect(breaker.state('default-clock')).toBe('OPEN')
  })

  it('reopens on a failed half-open probe', () => {
    let nowMs = 0
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      openMs: 50,
      halfOpenSuccesses: 2,
      clock: () => nowMs
    })
    breaker.onFailure('probe')
    breaker.onFailure('probe')
    expect(breaker.state('probe')).toBe('OPEN')
    nowMs += 51
    expect(breaker.canRequest('probe')).toBe(true)
    breaker.onFailure('probe')
    expect(breaker.state('probe')).toBe('OPEN')
  })
})

describe('deterministic provider hardening', () => {
  it('uses the default responder and honors latency', async () => {
    const provider = new DeterministicModelProvider({ latencyMs: 5 })
    const startedAt = Date.now()
    const result = await provider.execute({
      requestId: 'req_det_1',
      tenantId: TENANT,
      correlationId: 'corr_det_1',
      model: 'deterministic-v1',
      input: { messages: [{ role: 'user', content: 'hi' }] },
      temperature: 0,
      maxTokens: 8,
      promptSha256: 'a'.repeat(64),
      signal: new AbortController().signal,
      timeoutMs: 1_000
    })
    expect(result.text).toBe('deterministic:deterministic-v1')
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(4)
  })

  it('fails closed when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider = new DeterministicModelProvider()
    await expect(
      provider.execute({
        requestId: 'req_det_2',
        tenantId: TENANT,
        correlationId: 'corr_det_2',
        model: 'deterministic-v1',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        temperature: 0,
        maxTokens: 8,
        promptSha256: 'a'.repeat(64),
        signal: controller.signal,
        timeoutMs: 1_000
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects an aborted signal before a latency wait starts', async () => {
    const controller = new AbortController()
    controller.abort()
    const provider = new DeterministicModelProvider({ latencyMs: 5_000 })
    await expect(
      provider.execute({
        requestId: 'req_det_4',
        tenantId: TENANT,
        correlationId: 'corr_det_4',
        model: 'deterministic-v1',
        input: { messages: [{ role: 'user', content: 'hi' }] },
        temperature: 0,
        maxTokens: 8,
        promptSha256: 'a'.repeat(64),
        signal: controller.signal,
        timeoutMs: 10_000
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('aborts an in-flight latency wait', async () => {
    const controller = new AbortController()
    const provider = new DeterministicModelProvider({ latencyMs: 5_000 })
    const pending = provider.execute({
      requestId: 'req_det_3',
      tenantId: TENANT,
      correlationId: 'corr_det_3',
      model: 'deterministic-v1',
      input: { messages: [{ role: 'user', content: 'hi' }] },
      temperature: 0,
      maxTokens: 8,
      promptSha256: 'a'.repeat(64),
      signal: controller.signal,
      timeoutMs: 10_000
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('prompt registry hardening', () => {
  it('lists records, reuses identical registrations and exposes classification', () => {
    const registry = new PromptRegistry()
    const input = {
      promptId: 'p',
      version: '1',
      content: 'same content',
      owner: 'owner',
      approvedBy: 'reviewer',
      status: 'approved' as const,
      effectiveFrom: '2026-01-01T00:00:00.000Z'
    }
    const first = registry.register(input)
    const second = registry.register(input)
    expect(second.sha256).toBe(first.sha256)
    expect(registry.list()).toHaveLength(1)
    expect(promptContainsClassification(first)).toBe('INTERNAL')
    expect(registry.resolve({ promptId: 'p', version: '1' })).toMatchObject({
      promptId: 'p'
    })
  })

  it('rejects tenant mismatches only when both sides declare a tenant', () => {
    const registry = new PromptRegistry()
    registry.register({
      promptId: 'p',
      version: '2',
      content: 'tenant-bound',
      owner: 'owner',
      approvedBy: 'reviewer',
      status: 'approved',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      tenantId: TENANT
    })
    expect(() =>
      registry.resolve(
        { promptId: 'p', version: '2' },
        { tenantId: 'tenant_00000000-0000-4000-8000-0000000000ff' }
      )
    ).toThrowError(/not visible/)
    expect(
      registry.resolve({ promptId: 'p', version: '2' }, { tenantId: TENANT })
    ).toMatchObject({ promptId: 'p' })
  })
})
