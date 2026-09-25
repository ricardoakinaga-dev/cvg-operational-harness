import { describe, expect, it, vi } from 'vitest'
import {
  OpenAICompatibleProvider,
  type FetchLike
} from '../providers/openai-compatible.ts'
import { OllamaProvider } from '../providers/ollama.ts'
import { ModelProviderError } from '../errors.ts'
import type { ProviderRequest } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'

function providerRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    requestId: 'req_provider_0001',
    tenantId: TENANT,
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    model: 'gpt-test',
    input: { messages: [{ role: 'user', content: 'ola' }] },
    temperature: 0,
    maxTokens: 64,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 1_000,
    ...overrides
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

describe('OpenAI-compatible provider', () => {
  it('rejects public HTTP even when an external API key is configured', () => {
    expect(
      () =>
        new OpenAICompatibleProvider({
          id: 'openai',
          baseUrl: 'http://api.example.com/v1',
          model: 'gpt-test',
          location: 'external',
          apiKey: 'test-key',
          allowHttp: true
        })
    ).toThrowError(expect.objectContaining({ kind: 'invalid_request' }))
  })

  it('parses a successful completion and requests JSON mode for structured output', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        choices: [
          { message: { content: '{"ok":true}' }, finish_reason: 'stop' }
        ],
        usage: { prompt_tokens: 11, completion_tokens: 7 }
      })
    )
    const provider = new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: 'https://api.example.com/v1',
      dnsLookup: async () => ['93.184.216.34'],
      model: 'gpt-test',
      location: 'external',
      apiKey: 'test-key',
      fetchImpl
    })
    const result = await provider.execute(
      providerRequest({ structuredSchemaName: 'AgentDecision' })
    )
    expect(result.text).toBe('{"ok":true}')
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 })
    expect(result.externalCall).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0] ?? []
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init?.redirect).toBe('manual')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(payload.response_format).toEqual({ type: 'json_object' })
    expect(payload.model).toBe('gpt-test')
  })

  it.each([
    [401, 'auth'],
    [403, 'auth'],
    [400, 'invalid_request'],
    [422, 'invalid_request'],
    [429, 'rate_limited'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [504, 'timeout']
  ])('maps HTTP %i to %s', async (status, kind) => {
    const provider = new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: 'https://api.example.com/v1',
      dnsLookup: async () => ['93.184.216.34'],
      model: 'gpt-test',
      location: 'external',
      apiKey: 'test-key',
      fetchImpl: async () => jsonResponse({ error: 'nope' }, status)
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind,
      status
    })
  })

  it('fails closed on malformed JSON and oversized responses', async () => {
    const malformed = new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: 'https://api.example.com/v1',
      dnsLookup: async () => ['93.184.216.34'],
      model: 'gpt-test',
      location: 'external',
      apiKey: 'k',
      fetchImpl: async () => new Response('not json', { status: 200 })
    })
    await expect(malformed.execute(providerRequest())).rejects.toMatchObject({
      kind: 'malformed_response'
    })

    const oversized = new OpenAICompatibleProvider({
      id: 'openai',
      baseUrl: 'https://api.example.com/v1',
      dnsLookup: async () => ['93.184.216.34'],
      model: 'gpt-test',
      location: 'external',
      apiKey: 'k',
      maxResponseBytes: 16,
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: 'x'.repeat(100) } }]
        })
    })
    await expect(oversized.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
  })

  it('rejects construction of external providers without API keys and unsafe URLs', () => {
    expect(
      () =>
        new OpenAICompatibleProvider({
          id: 'openai',
          baseUrl: 'https://api.example.com/v1',
          dnsLookup: async () => ['93.184.216.34'],
          model: 'gpt-test',
          location: 'external'
        })
    ).toThrow(ModelProviderError)
    expect(
      () =>
        new OpenAICompatibleProvider({
          id: 'openai',
          baseUrl: 'http://169.254.169.254/v1',
          model: 'gpt-test',
          location: 'external',
          apiKey: 'k',
          allowHttp: true
        })
    ).toThrow(ModelProviderError)
  })

  it('sends bearer auth only when configured', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ choices: [{ message: { content: 'ok' } }] })
    )
    const provider = new OpenAICompatibleProvider({
      id: 'vllm',
      baseUrl: 'http://127.0.0.1:8000/v1',
      allowPrivateNetworks: true,
      model: 'local-model',
      location: 'local',
      requiresApiKey: false,
      allowHttp: true,
      fetchImpl
    })
    await provider.execute(providerRequest({ model: 'local-model' }))
    const init = fetchImpl.mock.calls[0]?.[1]
    const headers = init?.headers as Record<string, string>
    expect(headers.authorization).toBeUndefined()
  })
})

describe('Ollama provider', () => {
  it('parses a local chat response without external calls', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({
        message: { content: 'resposta local' },
        prompt_eval_count: 5,
        eval_count: 3,
        done: true
      })
    )
    const provider = new OllamaProvider({
      allowPrivateNetworks: true,
      model: 'llama-test',
      fetchImpl
    })
    const result = await provider.execute(providerRequest())
    expect(result.text).toBe('resposta local')
    expect(result.usage).toEqual({ inputTokens: 5, outputTokens: 3 })
    expect(result.externalCall).toBe(false)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://127.0.0.1:11434/api/chat')
  })

  it('maps provider failures and malformed payloads', async () => {
    const failing = new OllamaProvider({
      allowPrivateNetworks: true,
      model: 'llama-test',
      fetchImpl: async () => jsonResponse({ error: 'busy' }, 503)
    })
    await expect(failing.execute(providerRequest())).rejects.toMatchObject({
      kind: 'unavailable'
    })

    const malformed = new OllamaProvider({
      allowPrivateNetworks: true,
      model: 'llama-test',
      fetchImpl: async () => new Response('nope', { status: 200 })
    })
    await expect(malformed.execute(providerRequest())).rejects.toMatchObject({
      kind: 'malformed_response'
    })
  })
})
