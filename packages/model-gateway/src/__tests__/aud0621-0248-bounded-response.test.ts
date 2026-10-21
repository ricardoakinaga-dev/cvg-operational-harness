// @vitest-environment node
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ModelProviderError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { networkError, readBoundedText } from '../providers/http-errors.ts'
import { OllamaProvider } from '../providers/ollama.ts'
import { OpenAICompatibleProvider } from '../providers/openai-compatible.ts'
import { fetchWithResolvedAddress } from '../providers/ssrf-node.ts'
import type { ProviderRequest } from '../contracts.ts'

/**
 * SPEC0248 §3.5 (AUD-0621 F21, core): model responses are cut chunk by
 * chunk at the byte ceiling, before the excess is buffered, and the provider
 * deadline holds until the end of the body.
 */

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
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<{ url: string; port: number }> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const { port } = server.address() as AddressInfo
  return { url: `http://127.0.0.1:${port}`, port }
}

/** Streams `chunks` × 1 KiB, one per tick, and records how far it got. */
function streamingServer(chunks: number, status = 200) {
  const state = { written: 0, closedEarly: false }
  const handler = (request: IncomingMessage, response: ServerResponse) => {
    request.resume()
    response.writeHead(status, { 'content-type': 'application/json' })
    response.on('close', () => {
      if (state.written < chunks) state.closedEarly = true
    })
    const tick = () => {
      if (response.destroyed) return
      if (state.written >= chunks) {
        response.end()
        return
      }
      response.write('x'.repeat(1024))
      state.written += 1
      setTimeout(tick, 2)
    }
    tick()
  }
  return { state, handler }
}

function providerRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    requestId: 'req_bounded_0248',
    tenantId: TENANT,
    correlationId: 'corr_00000000-0000-4000-8000-000000000248',
    model: 'local-model',
    input: { messages: [{ role: 'user', content: 'ola' }] },
    temperature: 0,
    maxTokens: 32,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    ...overrides
  }
}

function streamResponse(chunks: number, chunkBytes = 1024) {
  const state = { pulled: 0, cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (state.pulled >= chunks) {
        controller.close()
        return
      }
      state.pulled += 1
      controller.enqueue(new Uint8Array(chunkBytes).fill(120))
    },
    cancel() {
      state.cancelled = true
    }
  })
  return { state, response: new Response(body, { status: 200 }) }
}

describe('SPEC0248 F21 — bound model transport', () => {
  it('AC20: cuts a chunked 2xx body at the ceiling and fails only the body', async () => {
    const server = streamingServer(256)
    const { url } = await startServer(server.handler)
    const response = await fetchWithResolvedAddress(
      `${url}/v1/chat/completions`,
      { method: 'POST', body: '{}', maxResponseBytes: 4 * 1024 },
      ['127.0.0.1']
    )
    expect(response.status).toBe(200)
    await expect(response.text()).rejects.toMatchObject({
      name: 'ResponseTooLargeError'
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(server.state.closedEarly).toBe(true)
    expect(server.state.written).toBeLessThan(256)
  })

  it('AC20: does not read a 2xx body whose declared length is above the ceiling', async () => {
    const { url } = await startServer((request, response) => {
      request.resume()
      response.writeHead(200, { 'content-length': String(1024 * 1024) })
      response.flushHeaders()
    })
    const started = Date.now()
    const response = await fetchWithResolvedAddress(
      `${url}/`,
      { method: 'GET', maxResponseBytes: 1024 },
      ['127.0.0.1']
    )
    expect(Date.now() - started).toBeLessThan(1_000)
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      name: 'ResponseTooLargeError'
    })
  })

  it('AC21: keeps the status of a non-2xx response over the ceiling', async () => {
    const server = streamingServer(256, 503)
    const { url } = await startServer(server.handler)
    const response = await fetchWithResolvedAddress(
      `${url}/`,
      { method: 'GET', maxResponseBytes: 1024 },
      ['127.0.0.1']
    )
    expect(response.status).toBe(503)
    expect(response.body).toBeNull()
  })

  it('keeps a body within the ceiling intact', async () => {
    const server = streamingServer(2)
    const { url } = await startServer(server.handler)
    const response = await fetchWithResolvedAddress(
      `${url}/`,
      { method: 'GET', maxResponseBytes: 4 * 1024 },
      ['127.0.0.1']
    )
    expect((await response.text()).length).toBe(2048)
  })

  it('AC21: the OpenAI-compatible provider maps the cut to response_too_large', async () => {
    const server = streamingServer(256)
    const { url } = await startServer(server.handler)
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: url,
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      allowPrivateNetworks: true,
      maxResponseBytes: 4 * 1024
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large',
      message: 'Provider response exceeded 4096 bytes'
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(server.state.closedEarly).toBe(true)
  })

  it('AC21: the Ollama provider maps the cut to response_too_large', async () => {
    const server = streamingServer(256)
    const { url } = await startServer(server.handler)
    const provider = new OllamaProvider({
      id: 'local-ollama',
      baseUrl: url,
      model: 'local-model',
      allowPrivateNetworks: true,
      maxResponseBytes: 4 * 1024
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(server.state.closedEarly).toBe(true)
  })

  it('AC21: HTTP and redirect outcomes keep priority over the ceiling', async () => {
    const cases = [
      [500, 'unavailable'],
      [429, 'rate_limited'],
      [302, 'invalid_request']
    ] as const
    for (const [status, kind] of cases) {
      const { url } = await startServer((request, response) => {
        request.resume()
        response.writeHead(status, {
          location: 'http://127.0.0.1:9/elsewhere'
        })
        response.end('x'.repeat(64 * 1024))
      })
      const provider = new OpenAICompatibleProvider({
        id: 'local-openai',
        baseUrl: url,
        model: 'local-model',
        location: 'local',
        allowHttp: true,
        allowPrivateNetworks: true,
        maxResponseBytes: 1024
      })
      await expect(provider.execute(providerRequest())).rejects.toMatchObject({
        kind
      })
    }
  })

  it('AC21: the gateway reports provider_response_too_large', async () => {
    const server = streamingServer(256)
    const { url } = await startServer(server.handler)
    const prompts = new PromptRegistry()
    prompts.register({
      promptId: 'bounded',
      version: '1.0.0',
      content: 'Synthetic administrative text only',
      owner: 'audit',
      approvedBy: 'audit-reviewer',
      status: 'approved',
      effectiveFrom: '2026-09-01T00:00:00.000Z',
      classification: 'INTERNAL'
    })
    const gateway = new ModelGateway({
      providers: [
        new OpenAICompatibleProvider({
          id: 'local-openai',
          baseUrl: url,
          model: 'local-model',
          location: 'local',
          allowHttp: true,
          allowPrivateNetworks: true,
          maxResponseBytes: 4 * 1024
        })
      ],
      profiles: {
        local: {
          name: 'local',
          providerId: 'local-openai',
          model: 'local-model',
          location: 'local',
          temperature: 0,
          maxTokens: 32,
          timeoutMs: 5_000,
          maxCostUsd: 1,
          estimatedCostUsd: 0,
          maxRetries: 0,
          pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
        }
      },
      prompts
    })
    await expect(
      gateway.generate({
        requestId: 'req_bounded_gateway',
        tenantId: TENANT,
        correlationId: 'corr_bounded_gateway',
        promptId: 'bounded',
        promptVersion: '1.0.0',
        modelProfile: 'local',
        dataClassification: 'INTERNAL',
        input: { messages: [{ role: 'user', content: 'ola' }] }
      })
    ).rejects.toMatchObject({
      code: 'provider_response_too_large',
      retryable: false
    })
  })

  it('AC23: the provider deadline holds while the body hangs', async () => {
    const { url } = await startServer((request, response) => {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"choices":')
    })
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: url,
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      allowPrivateNetworks: true
    })
    const started = Date.now()
    await expect(
      provider.execute(providerRequest({ timeoutMs: 150 }))
    ).rejects.toMatchObject({ kind: 'timeout' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('SPEC0248 F21 — bounded body read with an injected fetch', () => {
  it('AC22: OpenAI-compatible cancels the stream past the ceiling', async () => {
    const stream = streamResponse(1_000)
    const provider = new OpenAICompatibleProvider({
      id: 'local-openai',
      baseUrl: 'http://127.0.0.1:9',
      model: 'local-model',
      location: 'local',
      allowHttp: true,
      allowPrivateNetworks: true,
      maxResponseBytes: 4 * 1024,
      fetchImpl: async () => stream.response
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
    expect(stream.state.cancelled).toBe(true)
    expect(stream.state.pulled).toBeLessThan(10)
  })

  it('AC22: Ollama cancels the stream past the ceiling', async () => {
    const stream = streamResponse(1_000)
    const provider = new OllamaProvider({
      id: 'local-ollama',
      baseUrl: 'http://127.0.0.1:9',
      model: 'local-model',
      allowPrivateNetworks: true,
      maxResponseBytes: 4 * 1024,
      fetchImpl: async () => stream.response
    })
    await expect(provider.execute(providerRequest())).rejects.toMatchObject({
      kind: 'response_too_large'
    })
    expect(stream.state.cancelled).toBe(true)
    expect(stream.state.pulled).toBeLessThan(10)
  })

  it('reads bounded text, declared lengths, empty bodies and read failures', async () => {
    await expect(
      readBoundedText('p', new Response('{"ok":true}'), 64)
    ).resolves.toBe('{"ok":true}')
    await expect(readBoundedText('p', new Response(null), 64)).resolves.toBe('')
    await expect(
      readBoundedText(
        'p',
        new Response('x', { headers: { 'content-length': '999' } }),
        64
      )
    ).rejects.toMatchObject({ kind: 'response_too_large' })
    const failing = new Response(
      new ReadableStream({
        pull() {
          throw new Error('socket closed')
        }
      })
    )
    await expect(readBoundedText('p', failing, 64)).rejects.toMatchObject({
      kind: 'connection'
    })
    const minimal = {
      text: async () => 'y'.repeat(100)
    } as unknown as Response
    await expect(readBoundedText('p', minimal, 64)).rejects.toMatchObject({
      kind: 'response_too_large'
    })
  })

  it('AC22: decodes UTF-8 split across chunks like Response.text()', async () => {
    const split = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([0x7b, 0x22, 0xc3]))
          controller.enqueue(new Uint8Array([0xa1, 0x22, 0x7d]))
          controller.close()
        }
      })
    )
    await expect(readBoundedText('p', split, 64)).resolves.toBe('{"á"}')
  })

  it('ends a read on abort and on timeout with the matching kind', async () => {
    const hanging = () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([0x7b]))
          }
        })
      )
    const controller = new AbortController()
    const pending = readBoundedText('p', hanging(), 64, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
    await expect(
      readBoundedText('p', hanging(), 64, AbortSignal.timeout(20))
    ).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('maps the transport ceiling error to a non-retryable provider error', () => {
    const cut = Object.assign(new Error('Response exceeds maxResponseBytes'), {
      name: 'ResponseTooLargeError'
    })
    const mapped = networkError('p', cut)
    expect(mapped).toBeInstanceOf(ModelProviderError)
    expect(mapped.kind).toBe('response_too_large')
    expect(mapped.retryable).toBe(false)
  })
})
