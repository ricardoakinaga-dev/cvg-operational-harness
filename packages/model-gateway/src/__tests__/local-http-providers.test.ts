import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { evaluateOutboundUrl } from '@cvg/shared'
import { ModelProviderError } from '../errors.ts'
import { OllamaProvider } from '../providers/ollama.ts'
import {
  OpenAICompatibleProvider,
  type FetchLike
} from '../providers/openai-compatible.ts'
import type { ProviderRequest } from '../contracts.ts'

vi.mock('@cvg/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cvg/shared')>()
  return { ...actual, evaluateOutboundUrl: vi.fn(actual.evaluateOutboundUrl) }
})

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
})

async function startServer(
  handler: (
    request: IncomingMessage,
    response: import('node:http').ServerResponse
  ) => void
): Promise<string> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

function providerRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    requestId: 'req_local_http_0001',
    tenantId: TENANT,
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    model: 'local-model',
    input: {
      system: 'system fixture',
      messages: [{ role: 'user', content: 'ola' }]
    },
    temperature: 0,
    maxTokens: 32,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 1_000,
    ...overrides
  }
}

function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    request.on('data', (chunk) => {
      body += String(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>)
      } catch (error) {
        reject(error)
      }
    })
  })
}

describe('OpenAI-compatible provider against a local fake server', () => {
  it('sends system messages and JSON mode to the loopback endpoint', async () => {
    let seenBody: Record<string, unknown> = {}
    let seenAuth: string | undefined
    let seenPath: string | undefined
    const baseUrl = await startServer(async (request, response) => {
      seenPath = request.url
      seenAuth = request.headers.authorization as string | undefined
      seenBody = await readJson(request)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: 'stop'
            }
          ],
          usage: { prompt_tokens: 4, completion_tokens: 2 }
        })
      )
    })
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      apiKey: 'loopback-key'
    })

    const result = await provider.execute(
      providerRequest({ structuredSchemaName: 'FixtureDecision' })
    )

    expect(seenPath).toBe('/chat/completions')
    expect(seenAuth).toBe('Bearer loopback-key')
    expect(seenBody).toMatchObject({
      model: 'local-model',
      stream: false,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'system fixture' },
        { role: 'user', content: 'ola' }
      ]
    })
    expect(result).toMatchObject({
      text: '{"ok":true}',
      usage: { inputTokens: 4, outputTokens: 2 },
      externalCall: false,
      finishReason: 'stop'
    })
  })

  it('defaults usage to zero and maps HTTP failures', async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'unavailable' }))
    })
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'unavailable',
      status: 500
    })

    const okUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ choices: [{ message: { content: null } }] })
      )
    })
    const defaultUsage = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: okUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true
    })
    const result = await defaultUsage.execute(providerRequest())
    expect(result.text).toBe('')
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
    expect(result.finishReason).toBeUndefined()
  })

  it('fails closed on malformed or oversized local responses', async () => {
    const malformedUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ choices: [] }))
    })
    const malformed = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: malformedUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true
    })
    await expect(malformed.execute(providerRequest())).rejects.toMatchObject({
      kind: 'malformed_response'
    })

    const oversizedUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({ choices: [{ message: { content: 'x'.repeat(200) } }] })
      )
    })
    const oversized = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: oversizedUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      maxResponseBytes: 32
    })
    await expect(oversized.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
  })

  it('times out and cancels against a stalled loopback server', async () => {
    const baseUrl = await startServer(() => undefined)
    const timeoutProvider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl,
      model: 'local-model',
      location: 'local',
      allowHttp: true
    })
    await expect(
      timeoutProvider.execute(providerRequest({ timeoutMs: 50 }))
    ).rejects.toMatchObject({ kind: 'timeout' })

    const controller = new AbortController()
    const pending = timeoutProvider.execute(
      providerRequest({ timeoutMs: 5_000, signal: controller.signal })
    )
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
  })

  it('maps a failing response body read to a connection error', async () => {
    const failingFetch: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error('socket closed')
        }
      }) as unknown as Response
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      fetchImpl: failingFetch
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'connection'
    })
  })

  it('rejects endpoints that stop matching the pinned host before sending', async () => {
    const mocked = vi.mocked(evaluateOutboundUrl)
    mocked.mockReturnValueOnce({
      allowed: true,
      url: new URL('http://127.0.0.1:9/')
    })
    mocked.mockReturnValueOnce({
      allowed: false,
      reason: 'host_not_allowlisted'
    })
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'local-model',
      location: 'local',
      allowHttp: true
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'invalid_request'
    })
  })
})

describe('Ollama provider against a local fake server', () => {
  it('posts chat options and reads usage from the loopback endpoint', async () => {
    let seenBody: Record<string, unknown> = {}
    let seenAuth: string | undefined
    let seenPath: string | undefined
    const baseUrl = await startServer(async (request, response) => {
      seenPath = request.url
      seenAuth = request.headers.authorization as string | undefined
      seenBody = await readJson(request)
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          message: { content: 'resposta local' },
          prompt_eval_count: 6,
          eval_count: 3,
          done: true
        })
      )
    })
    const provider = new OllamaProvider({
      id: 'local-ollama',
      baseUrl,
      model: 'llama-local',
      apiKey: 'ollama-key'
    })

    const result = await provider.execute(
      providerRequest({ structuredSchemaName: 'FixtureDecision' })
    )

    expect(seenPath).toBe('/api/chat')
    expect(seenAuth).toBe('Bearer ollama-key')
    expect(seenBody).toMatchObject({
      model: 'llama-local',
      stream: false,
      format: 'json',
      options: { temperature: 0, num_predict: 32 },
      messages: [
        { role: 'system', content: 'system fixture' },
        { role: 'user', content: 'ola' }
      ]
    })
    expect(result).toMatchObject({
      text: 'resposta local',
      usage: { inputTokens: 6, outputTokens: 3 },
      externalCall: false
    })
  })

  it('falls back to the legacy response field and zero usage', async () => {
    const baseUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ response: 'legacy answer' }))
    })
    const provider = new OllamaProvider({ model: 'llama-local', baseUrl })
    const result = await provider.execute(providerRequest())
    expect(result.text).toBe('legacy answer')
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('maps HTTP failures and malformed payloads from the loopback server', async () => {
    const failingUrl = await startServer((_request, response) => {
      response.writeHead(503, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'busy' }))
    })
    const failing = new OllamaProvider({ model: 'm', baseUrl: failingUrl })
    await expect(failing.execute(providerRequest())).rejects.toMatchObject({
      kind: 'unavailable',
      status: 503
    })

    const malformedUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ message: { content: 42 } }))
    })
    const malformed = new OllamaProvider({ model: 'm', baseUrl: malformedUrl })
    await expect(malformed.execute(providerRequest())).rejects.toMatchObject({
      kind: 'malformed_response'
    })

    const oversizedUrl = await startServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ response: 'x'.repeat(200) }))
    })
    const oversized = new OllamaProvider({
      model: 'm',
      baseUrl: oversizedUrl,
      maxResponseBytes: 16
    })
    await expect(oversized.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
  })

  it('maps a failing ollama body read to a connection error', async () => {
    const failingFetch: FetchLike = async () =>
      ({
        ok: true,
        status: 200,
        text: async () => {
          throw new Error('socket closed')
        }
      }) as unknown as Response
    const provider = new OllamaProvider({
      model: 'm',
      baseUrl: 'http://127.0.0.1:9',
      fetchImpl: failingFetch
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'connection'
    })
  })

  it('times out against a stalled loopback server', async () => {
    const baseUrl = await startServer(() => undefined)
    const provider = new OllamaProvider({ model: 'm', baseUrl })
    await expect(
      provider.execute(providerRequest({ timeoutMs: 50 }))
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('rejects unsafe base URLs and unpinned endpoints', async () => {
    expect(
      () =>
        new OllamaProvider({
          model: 'm',
          baseUrl: 'http://user:pass@127.0.0.1:11434'
        })
    ).toThrow(ModelProviderError)

    const mocked = vi.mocked(evaluateOutboundUrl)
    mocked.mockReturnValueOnce({
      allowed: true,
      url: new URL('http://127.0.0.1:9/')
    })
    mocked.mockReturnValueOnce({
      allowed: false,
      reason: 'host_not_allowlisted'
    })
    const provider = new OllamaProvider({
      model: 'm',
      baseUrl: 'http://127.0.0.1:9'
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'invalid_request'
    })
  })
})
