import { describe, expect, it } from 'vitest'
import { DeterministicModelProvider } from '../providers/deterministic.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { ModelProviderError } from '../errors.ts'
import { TokenMeter, TokenMeterError } from '../token-meter.ts'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ModelProvider
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-11T12:00:00.000Z')

function baseRequest(
  overrides: Partial<ModelGatewayRequest> = {}
): ModelGatewayRequest {
  return {
    requestId: 'req_test_00000001',
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

function approvedPromptRegistry(): PromptRegistry {
  const registry = new PromptRegistry()
  registry.register({
    promptId: 'secretary-core',
    version: '1.0.0',
    content: 'You are the CVG secretary assistant.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  return registry
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

function respondingProvider(usage: {
  inputTokens: number
  outputTokens: number
}) {
  return new DeterministicModelProvider({
    respond: () => ({
      text: 'ok',
      usage,
      providerId: 'deterministic',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
}

describe('PDSH-024 token meter (SPEC 0205)', () => {
  it('aggregates per-request usage into a detached turn snapshot', () => {
    const meter = new TokenMeter()
    expect(meter.snapshot()).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    })
    meter.record({ inputTokens: 100, outputTokens: 40 })
    meter.record({ inputTokens: 250, outputTokens: 10 })
    meter.recordModelResult({ usage: { inputTokens: 0, outputTokens: 5 } })
    expect(meter.snapshot()).toEqual({
      requests: 3,
      inputTokens: 350,
      outputTokens: 55,
      totalTokens: 405
    })
    const frozen = meter.snapshot()
    expect(Object.isFrozen(frozen)).toBe(true)
    meter.record({ inputTokens: 1, outputTokens: 1 })
    expect(frozen.totalTokens).toBe(405)
    expect(meter.snapshot().totalTokens).toBe(407)
  })

  it('rejects invalid or overflowing usage without corrupting counters', () => {
    const meter = new TokenMeter()
    meter.record({ inputTokens: 10, outputTokens: 5 })
    const invalid = [
      { inputTokens: -1, outputTokens: 0 },
      { inputTokens: 1.5, outputTokens: 0 },
      { inputTokens: Number.NaN, outputTokens: 0 },
      { inputTokens: Number.POSITIVE_INFINITY, outputTokens: 0 },
      { inputTokens: '10', outputTokens: 0 },
      { inputTokens: 10 },
      {}
    ]
    for (const usage of invalid) {
      expect(() => meter.record(usage as never)).toThrow(TokenMeterError)
    }
    expect(() => meter.record(null as never)).toThrow(TokenMeterError)
    expect(() => meter.recordModelResult({} as never)).toThrow(TokenMeterError)
    expect(() => meter.recordModelResult(null as never)).toThrow(
      TokenMeterError
    )
    expect(meter.snapshot()).toEqual({
      requests: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15
    })

    const overflow = new TokenMeter()
    overflow.record({
      inputTokens: Number.MAX_SAFE_INTEGER,
      outputTokens: 0
    })
    expect(() => overflow.record({ inputTokens: 1, outputTokens: 0 })).toThrow(
      TokenMeterError
    )
    expect(overflow.snapshot().inputTokens).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('records successful calls and exposes tokens in the result and event', async () => {
    const events: ModelGatewayEvent[] = []
    const meter = new TokenMeter()
    const gateway = new ModelGateway({
      providers: [respondingProvider({ inputTokens: 1000, outputTokens: 500 })],
      profiles: { fast: profile('fast') },
      prompts: approvedPromptRegistry(),
      clock: () => NOW,
      onEvent: (event) => events.push(event),
      meter
    })

    const result = await gateway.generate(baseRequest())

    expect(result.usage).toEqual({ inputTokens: 1000, outputTokens: 500 })
    expect(meter.snapshot()).toEqual({
      requests: 1,
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500
    })
    const completed = events.find(
      (event) => event.type === 'model.call.completed'
    )
    expect(completed).toMatchObject({
      inputTokens: 1000,
      outputTokens: 500,
      costUsd: result.costUsd
    })
    expect(meter.recordModelResult(result).requests).toBe(2)
  })

  it('aggregates sequential calls into the turn meter', async () => {
    const meter = new TokenMeter()
    const gateway = new ModelGateway({
      providers: [respondingProvider({ inputTokens: 1000, outputTokens: 500 })],
      profiles: { fast: profile('fast') },
      prompts: approvedPromptRegistry(),
      clock: () => NOW,
      meter
    })

    await gateway.generate(baseRequest())
    await gateway.generate(baseRequest({ requestId: 'req_test_00000002' }))

    expect(meter.snapshot()).toEqual({
      requests: 2,
      inputTokens: 2000,
      outputTokens: 1000,
      totalTokens: 3000
    })
  })

  it('records only the successful attempt after a retry', async () => {
    let calls = 0
    const provider = new DeterministicModelProvider({
      respond: () => {
        calls += 1
        if (calls === 1) {
          throw new ModelProviderError(
            'deterministic',
            'rate_limited',
            'slow down',
            429
          )
        }
        return {
          text: 'ok',
          usage: { inputTokens: 7, outputTokens: 3 },
          providerId: 'deterministic',
          model: 'deterministic-v1',
          externalCall: false
        }
      }
    })
    const meter = new TokenMeter()
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast') },
      prompts: approvedPromptRegistry(),
      clock: () => NOW,
      sleep: async () => {},
      meter
    })

    const result = await gateway.generate(baseRequest())

    expect(result.attempts).toBe(2)
    expect(meter.snapshot()).toEqual({
      requests: 1,
      inputTokens: 7,
      outputTokens: 3,
      totalTokens: 10
    })
  })

  it('does not record failed calls', async () => {
    const provider = new DeterministicModelProvider({
      respond: () => {
        throw new ModelProviderError('deterministic', 'auth', 'nope', 401)
      }
    })
    const meter = new TokenMeter()
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast', { maxRetries: 0 }) },
      prompts: approvedPromptRegistry(),
      clock: () => NOW,
      meter
    })

    await expect(gateway.generate(baseRequest())).rejects.toMatchObject({
      code: 'provider_auth_failed'
    })
    expect(meter.snapshot()).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    })
  })

  it('fails closed on malformed provider usage instead of a NaN cost', async () => {
    const rogue: ModelProvider = {
      id: 'rogue',
      location: 'local',
      models: ['rogue-v1'],
      execute: async () => ({
        text: 'ok',
        usage: { inputTokens: -5, outputTokens: 1 },
        providerId: 'rogue',
        model: 'rogue-v1',
        externalCall: false
      })
    }
    const meter = new TokenMeter()
    const gateway = new ModelGateway({
      providers: [rogue],
      profiles: {
        fast: profile('fast', {
          providerId: 'rogue',
          model: 'rogue-v1',
          maxRetries: 0
        })
      },
      prompts: approvedPromptRegistry(),
      clock: () => NOW,
      meter
    })

    await expect(gateway.generate(baseRequest())).rejects.toMatchObject({
      code: 'provider_malformed_response'
    })
    expect(meter.snapshot().requests).toBe(0)
  })
})
