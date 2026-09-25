import { describe, expect, it } from 'vitest'
import {
  ModelGatewayError,
  ModelProviderError,
  toGatewayError
} from '../errors.ts'
import { computeRetryDelayMs, isRetryable } from '../retry.ts'
import {
  mapHttpStatusToKind,
  networkError,
  providerHttpError,
  assertResponseSize
} from '../providers/http-errors.ts'
import { ModelRouter } from '../router.ts'
import { OllamaProvider } from '../providers/ollama.ts'

describe('model gateway error mapping', () => {
  it.each([
    ['timeout', 'provider_timeout', true],
    ['rate_limited', 'provider_rate_limited', true],
    ['unavailable', 'provider_unavailable', true],
    ['connection', 'provider_connection_reset', true],
    ['auth', 'provider_auth_failed', false],
    ['invalid_request', 'provider_invalid_request', false],
    ['response_too_large', 'provider_response_too_large', false],
    ['malformed_response', 'provider_malformed_response', false],
    ['cancelled', 'cancelled', false],
    ['internal', 'internal_error', false]
  ] as const)('maps %s provider failures to %s', (kind, code, retryable) => {
    const error = toGatewayError(new ModelProviderError('p', kind, 'x', 500))
    expect(error.code).toBe(code)
    expect(error.retryable).toBe(retryable)
  })

  it('passes gateway errors through and maps abort errors', () => {
    const original = new ModelGatewayError('circuit_open', 'open')
    expect(toGatewayError(original)).toBe(original)
    const abort = new Error('aborted')
    abort.name = 'AbortError'
    expect(toGatewayError(abort).code).toBe('provider_timeout')
    const timeout = new Error('timeout')
    timeout.name = 'TimeoutError'
    expect(toGatewayError(timeout).retryable).toBe(true)
    expect(toGatewayError(new Error('other')).code).toBe('internal_error')
    expect(toGatewayError('string')).toBeInstanceOf(ModelGatewayError)
  })
})

describe('retry and http error helpers', () => {
  it('clamps jitter inputs', () => {
    const policy = {
      maxRetries: 2,
      baseDelayMs: 100,
      maxDelayMs: 1_000,
      jitterRatio: 0.2
    }
    expect(
      computeRetryDelayMs({ attempt: 1, policy, random: () => Number.NaN })
    ).toBe(80)
    expect(computeRetryDelayMs({ attempt: 1, policy, random: () => -5 })).toBe(
      80
    )
    expect(computeRetryDelayMs({ attempt: 1, policy, random: () => 99 })).toBe(
      100
    )
    expect(
      isRetryable(
        new ModelGatewayError('provider_timeout', 'x', { retryable: true })
      )
    ).toBe(true)
  })

  it('maps statuses and normalizes network errors', () => {
    expect(mapHttpStatusToKind(401)).toBe('auth')
    expect(mapHttpStatusToKind(403)).toBe('auth')
    expect(mapHttpStatusToKind(408)).toBe('timeout')
    expect(mapHttpStatusToKind(504)).toBe('timeout')
    expect(mapHttpStatusToKind(429)).toBe('rate_limited')
    expect(mapHttpStatusToKind(404)).toBe('invalid_request')
    expect(mapHttpStatusToKind(409)).toBe('invalid_request')
    expect(mapHttpStatusToKind(500)).toBe('unavailable')
    expect(mapHttpStatusToKind(418)).toBe('internal')
    expect(providerHttpError('p', 503).status).toBe(503)
    const abort = new Error('x')
    abort.name = 'AbortError'
    expect(networkError('p', abort).kind).toBe('cancelled')
    const timeout = new Error('x')
    timeout.name = 'TimeoutError'
    expect(networkError('p', timeout).kind).toBe('timeout')
    expect(networkError('p', new Error('boom')).kind).toBe('connection')
    const original = new ModelProviderError('p', 'auth', 'x')
    expect(networkError('p', original)).toBe(original)
    expect(() => assertResponseSize('p', 'x'.repeat(100), 10)).toThrowError(
      ModelProviderError
    )
  })
})

describe('router and provider edge paths', () => {
  it('rejects unknown profiles and disallowed fallbacks', () => {
    const local = {
      name: 'local' as const,
      providerId: 'p',
      model: 'm',
      location: 'local' as const,
      temperature: 0,
      maxTokens: 1,
      timeoutMs: 100,
      maxCostUsd: 0,
      estimatedCostUsd: 0,
      maxRetries: 0,
      pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 },
      fallbackProfile: 'critical-review' as const
    }
    const router = new ModelRouter({ local }, { allowFallback: true })
    expect(() =>
      router.resolve({ requestedProfile: 'fast', dataClassification: 'PUBLIC' })
    ).toThrowError(/not configured/)
    expect(router.fallbackFor(local)).toBeUndefined()
    expect(router.profile('local')).toEqual(local)
    const noFallback = new ModelRouter({ local })
    expect(noFallback.allowFallback).toBe(false)
    expect(noFallback.fallbackFor(local)).toBeUndefined()
  })

  it('maps Ollama failure paths', async () => {
    const rejecting = new OllamaProvider({
      model: 'm',
      allowPrivateNetworks: true,
      fetchImpl: async () => {
        throw new Error('network down')
      }
    })
    await expect(rejecting.execute(request())).rejects.toMatchObject({
      kind: 'connection'
    })
    const invalidJson = new OllamaProvider({
      model: 'm',
      allowPrivateNetworks: true,
      fetchImpl: async () => new Response('nope', { status: 200 })
    })
    await expect(invalidJson.execute(request())).rejects.toMatchObject({
      kind: 'malformed_response'
    })
  })
})

function request() {
  return {
    requestId: 'req_edge_0001',
    tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    model: 'm',
    input: { messages: [{ role: 'user' as const, content: 'hi' }] },
    temperature: 0,
    maxTokens: 1,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 100
  }
}
