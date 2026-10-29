// @vitest-environment node
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { ModelProviderError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { OllamaProvider } from '../providers/ollama.ts'
import {
  OpenAICompatibleProvider,
  type OpenAICompatibleProviderOptions
} from '../providers/openai-compatible.ts'
import { fetchWithResolvedAddress } from '../providers/ssrf-node.ts'

/**
 * SPEC 0284 (PROPOSED_FOR_HUMAN_T3_REVIEW), PAR-M01 phase 1: a model stream
 * ends in exactly one terminal state, and a partial answer is never final.
 *
 * Tests marked `it.fails` assert the TARGET behavior of the proposed internal
 * contract (`ModelProvider.executeStream`, `ModelProfile.streaming`,
 * `responseMode: 'stream'` in the bound transport). They pass today because
 * none of it exists; they become plain `it` in the BUILD, after the T3
 * approval. Plain `it` tests are controls that hold before and after, and
 * they also prove that the loopback fixtures reproduce the wire behavior the
 * RED tests depend on. Synthetic data only; loopback servers, zero egress.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const INSTRUCTION = 'Approved synthetic instruction for the stream proof.'
const NOW = new Date('2026-10-29T00:00:00.000Z')

// ---------------------------------------------------------------------------
// Proposed internal contract (SPEC 0284 §4). Not exported by the package.
// ---------------------------------------------------------------------------
type ProviderStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: { inputTokens: number; outputTokens: number } }
  | { type: 'finish'; reason: string }

interface StreamingProvider {
  executeStream(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}

function streamOf(provider: unknown): StreamingProvider['executeStream'] {
  const candidate = (provider as Partial<StreamingProvider>).executeStream
  // Absent today: calling it fails for the defect's reason (no stream path).
  if (typeof candidate !== 'function') {
    throw new Error('provider has no executeStream (no streaming path)')
  }
  return candidate.bind(provider)
}

async function collect(
  iterable: AsyncIterable<ProviderStreamEvent>
): Promise<ProviderStreamEvent[]> {
  const events: ProviderStreamEvent[] = []
  for await (const event of iterable) events.push(event)
  return events
}

function textOf(events: ProviderStreamEvent[]): string {
  return events
    .filter((e): e is { type: 'delta'; text: string } => e.type === 'delta')
    .map((e) => e.text)
    .join('')
}

// ---------------------------------------------------------------------------
// Loopback fixture: a server driven by the test, one write at a time.
// ---------------------------------------------------------------------------
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

interface Script {
  (response: ServerResponse, request: IncomingMessage, body: string): void
}

async function startServer(script: Script): Promise<{
  url: string
  bodies: Record<string, unknown>[]
  closedEarly: () => boolean
}> {
  const bodies: Record<string, unknown>[] = []
  let closed = false
  const server = createServer((request, response) => {
    let raw = ''
    request.on('data', (chunk) => {
      raw += String(chunk)
    })
    request.on('end', () => {
      try {
        bodies.push(JSON.parse(raw) as Record<string, unknown>)
      } catch {
        // not JSON: the script decides.
      }
      response.on('close', () => {
        if (!response.writableEnded) closed = true
      })
      script(response, request, raw)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    bodies,
    closedEarly: () => closed
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store'
}

function sseData(value: unknown): string {
  return `data: ${JSON.stringify(value)}\n\n`
}

function openAiChunk(content: string, finish: string | null = null) {
  return {
    choices: [{ index: 0, delta: { content }, finish_reason: finish }]
  }
}

/** Bytes of "Olá, mundo" split inside the two-byte "á" (0xC3 | 0xA1). */
const OLA = Buffer.from('Olá, mundo', 'utf8')
const SPLIT_AT = OLA.indexOf(0xc3) + 1

function openAiProvider(
  url: string,
  extra: Record<string, unknown> = {}
): OpenAICompatibleProvider {
  return new OpenAICompatibleProvider({
    id: 'stream-openai',
    baseUrl: url,
    model: 'stream-model',
    location: 'local',
    allowHttp: true,
    allowPrivateNetworks: true,
    ...extra
  } as unknown as OpenAICompatibleProviderOptions)
}

function ollamaProvider(
  url: string,
  extra: Record<string, unknown> = {}
): OllamaProvider {
  return new OllamaProvider({
    id: 'stream-ollama',
    baseUrl: url,
    model: 'stream-model',
    allowPrivateNetworks: true,
    ...extra
  } as never)
}

function providerRequest(
  overrides: Partial<ProviderRequest> = {}
): ProviderRequest {
  return {
    requestId: 'req_par_m01_0001',
    tenantId: TENANT,
    correlationId: 'corr_00000000-0000-4000-8000-0000000000a1',
    model: 'stream-model',
    input: { messages: [{ role: 'user', content: 'ola' }] },
    temperature: 0,
    maxTokens: 64,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 5_000,
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Controls: they hold before and after the BUILD.
// ---------------------------------------------------------------------------
describe('PAR-M01 controls — fixtures and the default path', () => {
  it('control: the loopback fixture delivers the multibyte character split across two TCP writes, incrementally', async () => {
    const server = await startServer((response) => {
      response.writeHead(200, SSE_HEADERS)
      response.write(OLA.subarray(0, SPLIT_AT))
      setTimeout(() => response.end(OLA.subarray(SPLIT_AT)), 60)
    })
    const arrivals: { at: number; bytes: number }[] = []
    const started = Date.now()
    await new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        server.url,
        { method: 'POST' },
        (res: IncomingMessage) => {
          res.on('data', (chunk: Buffer) =>
            arrivals.push({ at: Date.now() - started, bytes: chunk.length })
          )
          res.on('end', resolve)
          res.on('error', reject)
        }
      )
      req.on('error', reject)
      req.end('{}')
    })
    expect(arrivals.length).toBeGreaterThanOrEqual(2)
    expect(arrivals[0]?.bytes).toBe(SPLIT_AT)
    expect(arrivals[arrivals.length - 1]!.at - arrivals[0]!.at).toBeGreaterThan(
      30
    )
  })

  it('control: the default provider path sends stream:false and returns one result', async () => {
    const server = await startServer((response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          choices: [{ message: { content: 'final' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 3, completion_tokens: 1 }
        })
      )
    })
    const result = await openAiProvider(server.url).execute(providerRequest())
    expect(result.text).toBe('final')
    expect(server.bodies[0]?.stream).toBe(false)
  })

  it('control: a profile without `streaming` never touches executeStream', async () => {
    let streamCalls = 0
    const prompts = registry()
    const gateway = new ModelGateway({
      providers: [
        {
          id: 'fake',
          location: 'local',
          models: ['fake-v1'],
          execute: async (): Promise<ProviderResult> => ({
            text: 'plain',
            usage: { inputTokens: 1, outputTokens: 1 },
            providerId: 'fake',
            model: 'fake-v1',
            externalCall: false
          }),
          executeStream: () => {
            streamCalls += 1
            throw new Error('must not be called')
          }
        } as never
      ],
      profiles: { fast: profile() },
      prompts,
      clock: () => NOW
    })
    const result = await gateway.generate(gatewayRequest())
    expect(result.output.text).toBe('plain')
    expect(streamCalls).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Transport: the bound Node transport buffers the whole body today.
// ---------------------------------------------------------------------------
describe('PAR-M01 §5 — bound transport in stream mode', () => {
  it.fails(
    'hands over the Response while the server still holds the rest of the body',
    async () => {
      let releaseSecond: () => void = () => undefined
      const gate = new Promise<void>((r) => (releaseSecond = r))
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(sseData(openAiChunk('primeiro')))
        void gate.then(() => response.end('data: [DONE]\n\n'))
      })
      const pending = fetchWithResolvedAddress(
        `${server.url}/chat/completions`,
        {
          method: 'POST',
          body: '{}',
          responseMode: 'stream',
          maxResponseBytes: 65_536
        },
        ['127.0.0.1']
      )
      const outcome = await Promise.race([
        pending.then(() => 'resolved' as const),
        sleep(400).then(() => 'still-buffering' as const)
      ])
      releaseSecond()
      expect(outcome).toBe('resolved')
      const reader = (await pending).body!.getReader()
      const first = await reader.read()
      expect(Buffer.from(first.value!).toString('utf8')).toContain('primeiro')
      await reader.cancel()
    },
    10_000
  )

  // Control: SPEC 0248 already cuts the socket at the byte ceiling in the
  // buffered mode, so this holds today (the mode flag is ignored) and must keep
  // holding in stream mode after the BUILD (SPEC 0284 §5.3).
  it('control: cuts the socket at the byte ceiling while the server is still writing', async () => {
    let written = 0
    const server = await startServer((response) => {
      response.writeHead(200, SSE_HEADERS)
      const timer = setInterval(() => {
        if (response.destroyed) return clearInterval(timer)
        written += 1024
        response.write('x'.repeat(1024))
      }, 2)
      response.on('close', () => clearInterval(timer))
    })
    const response = await Promise.race([
      fetchWithResolvedAddress(
        `${server.url}/chat/completions`,
        {
          method: 'POST',
          body: '{}',
          responseMode: 'stream',
          maxResponseBytes: 8_192
        },
        ['127.0.0.1']
      ),
      sleep(1_000).then(() => {
        throw new Error('transport still buffering an unbounded body')
      })
    ])
    const reader = response.body!.getReader()
    await expect(
      (async () => {
        for (;;) if ((await reader.read()).done) return 'ended'
      })()
    ).rejects.toMatchObject({ name: 'ResponseTooLargeError' })
    await sleep(100)
    expect(server.closedEarly()).toBe(true)
    expect(written).toBeLessThan(8_192 * 4)
  }, 10_000)
})

// ---------------------------------------------------------------------------
// Providers: OpenAI-compatible SSE and Ollama NDJSON.
// ---------------------------------------------------------------------------
describe('PAR-M01 §6 — OpenAI-compatible SSE reader', () => {
  it.fails(
    'asks for a stream with usage and assembles deltas, including a multibyte split',
    async () => {
      const first = Buffer.from(sseData(openAiChunk('Olá, mundo')), 'utf8')
      const cut = first.indexOf(0xc3) + 1
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(first.subarray(0, cut))
        setTimeout(() => {
          response.write(first.subarray(cut))
          response.write(sseData(openAiChunk('!', 'stop')))
          response.write(
            sseData({
              choices: [],
              usage: { prompt_tokens: 7, completion_tokens: 3 }
            })
          )
          response.end('data: [DONE]\n\n')
        }, 30)
      })
      const events = await collect(
        streamOf(openAiProvider(server.url))(providerRequest())
      )
      expect(server.bodies[0]).toMatchObject({
        stream: true,
        stream_options: { include_usage: true }
      })
      expect(textOf(events)).toBe('Olá, mundo!')
      expect(events.filter((e) => e.type === 'finish')).toEqual([
        { type: 'finish', reason: 'stop' }
      ])
      expect(events.find((e) => e.type === 'usage')).toEqual({
        type: 'usage',
        usage: { inputTokens: 7, outputTokens: 3 }
      })
    }
  )

  it.fails(
    'accepts CRLF, comment lines and multi-line data fields',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(': keep-alive\r\n\r\n')
        response.write(
          'data: {"choices":[{"delta":\r\ndata: {"content":"ok"},"finish_reason":null}]}\r\n\r\n'
        )
        response.write(sseData(openAiChunk('', 'stop')))
        response.end('data: [DONE]\n\n')
      })
      const events = await collect(
        streamOf(openAiProvider(server.url))(providerRequest())
      )
      expect(textOf(events)).toBe('ok')
    }
  )

  it.fails(
    'never emits a half frame as a delta when the connection is cut',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(sseData(openAiChunk('inteiro')))
        response.write('data: {"choices":[{"delta":{"content":"meio')
        setTimeout(() => response.destroy(), 20)
      })
      const seen: string[] = []
      const run = (async () => {
        for await (const event of streamOf(openAiProvider(server.url))(
          providerRequest()
        )) {
          if (event.type === 'delta') seen.push(event.text)
        }
      })()
      await expect(run).rejects.toMatchObject({ kind: 'connection' })
      expect(seen.join('')).not.toContain('meio')
    }
  )

  it.fails(
    'ends without a finish event as a connection failure, not as a result',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.end(sseData(openAiChunk('sem fim')))
      })
      await expect(
        collect(streamOf(openAiProvider(server.url))(providerRequest()))
      ).rejects.toMatchObject({ kind: 'connection' })
    }
  )

  it.fails(
    'refuses an event that is not valid JSON as malformed_response',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.end('data: {not json}\n\n')
      })
      await expect(
        collect(streamOf(openAiProvider(server.url))(providerRequest()))
      ).rejects.toMatchObject({ kind: 'malformed_response' })
    }
  )

  it.fails(
    'refuses anything after the [DONE] marker as malformed_response',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(sseData(openAiChunk('a', 'stop')))
        response.write('data: [DONE]\n\n')
        response.end(sseData(openAiChunk('tarde')))
      })
      await expect(
        collect(streamOf(openAiProvider(server.url))(providerRequest()))
      ).rejects.toMatchObject({ kind: 'malformed_response' })
    }
  )

  it.fails(
    'stops at the event ceiling with response_too_large and closes the socket',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        const timer = setInterval(() => {
          if (response.destroyed) return clearInterval(timer)
          response.write(sseData(openAiChunk('.')))
        }, 1)
        response.on('close', () => clearInterval(timer))
      })
      await expect(
        collect(
          streamOf(openAiProvider(server.url, { maxStreamEvents: 32 }))(
            providerRequest()
          )
        )
      ).rejects.toMatchObject({ kind: 'response_too_large' })
      await sleep(100)
      expect(server.closedEarly()).toBe(true)
    }
  )

  it.fails(
    'stops at the byte ceiling with response_too_large and closes the socket',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        const timer = setInterval(() => {
          if (response.destroyed) return clearInterval(timer)
          response.write(sseData(openAiChunk('y'.repeat(512))))
        }, 1)
        response.on('close', () => clearInterval(timer))
      })
      await expect(
        collect(
          streamOf(openAiProvider(server.url, { maxResponseBytes: 4_096 }))(
            providerRequest()
          )
        )
      ).rejects.toMatchObject({ kind: 'response_too_large' })
      await sleep(100)
      expect(server.closedEarly()).toBe(true)
    }
  )

  it.fails(
    'times out on idle well before the whole-call timeout',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(sseData(openAiChunk('parou')))
      })
      const started = Date.now()
      await expect(
        collect(
          streamOf(openAiProvider(server.url, { streamIdleTimeoutMs: 150 }))(
            providerRequest({ timeoutMs: 5_000 })
          )
        )
      ).rejects.toMatchObject({ kind: 'timeout' })
      expect(Date.now() - started).toBeLessThan(2_000)
    },
    10_000
  )

  it.fails(
    'a caller abort mid-stream ends as cancelled and closes the socket',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, SSE_HEADERS)
        response.write(sseData(openAiChunk('comecou')))
      })
      const controller = new AbortController()
      const run = collect(
        streamOf(openAiProvider(server.url))(
          providerRequest({ signal: controller.signal })
        )
      )
      setTimeout(() => controller.abort(), 60)
      await expect(run).rejects.toMatchObject({ kind: 'cancelled' })
      await sleep(100)
      expect(server.closedEarly()).toBe(true)
    }
  )
})

describe('PAR-M01 §6 — Ollama NDJSON reader', () => {
  it.fails(
    'asks for a stream and assembles lines, with usage only from the done line',
    async () => {
      const line = (value: unknown) => `${JSON.stringify(value)}\n`
      const first = Buffer.from(
        line({ message: { content: 'Olá, ' }, done: false }),
        'utf8'
      )
      const cut = first.indexOf(0xc3) + 1
      const server = await startServer((response) => {
        response.writeHead(200, { 'content-type': 'application/x-ndjson' })
        response.write(first.subarray(0, cut))
        setTimeout(() => {
          response.write(first.subarray(cut))
          response.write(line({ message: { content: 'mundo' }, done: false }))
          response.end(
            line({
              message: { content: '' },
              done: true,
              done_reason: 'stop',
              prompt_eval_count: 5,
              eval_count: 2
            })
          )
        }, 30)
      })
      const events = await collect(
        streamOf(ollamaProvider(server.url))(providerRequest())
      )
      expect(server.bodies[0]).toMatchObject({ stream: true })
      expect(textOf(events)).toBe('Olá, mundo')
      expect(events.find((e) => e.type === 'usage')).toEqual({
        type: 'usage',
        usage: { inputTokens: 5, outputTokens: 2 }
      })
    }
  )

  it.fails('ends without done:true as a connection failure', async () => {
    const server = await startServer((response) => {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' })
      response.end(
        `${JSON.stringify({ message: { content: 'x' }, done: false })}\n`
      )
    })
    await expect(
      collect(streamOf(ollamaProvider(server.url))(providerRequest()))
    ).rejects.toMatchObject({ kind: 'connection' })
  })

  it.fails(
    'a done line without counters reports no usage (unknown, never zero)',
    async () => {
      const server = await startServer((response) => {
        response.writeHead(200, { 'content-type': 'application/x-ndjson' })
        response.end(
          `${JSON.stringify({ message: { content: 'x' }, done: false })}\n${JSON.stringify({ done: true, done_reason: 'stop' })}\n`
        )
      })
      const events = await collect(
        streamOf(ollamaProvider(server.url))(providerRequest())
      )
      expect(events.some((e) => e.type === 'usage')).toBe(false)
    }
  )
})

// ---------------------------------------------------------------------------
// Gateway: exactly one terminal result; a partial answer is never final.
// ---------------------------------------------------------------------------
function registry(): PromptRegistry {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'stream-synthetic',
    version: '1.0.0',
    content: INSTRUCTION,
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  return prompts
}

function profile(overrides: Record<string, unknown> = {}): ModelProfile {
  return {
    name: 'fast',
    providerId: 'fake',
    model: 'fake-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 32,
    timeoutMs: 1_000,
    maxCostUsd: 100,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 1, outputPer1kUsd: 1 },
    ...overrides
  } as ModelProfile
}

function gatewayRequest(): ModelGatewayRequest {
  return {
    requestId: 'req_par_m01_gateway',
    tenantId: TENANT,
    correlationId: 'corr_par_m01_gateway',
    promptId: 'stream-synthetic',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: {
      system: INSTRUCTION,
      messages: [{ role: 'user', content: 'Synthetic input only' }]
    }
  }
}

interface FakeStreamState {
  calls: number
  returned: number
}

function streamingGateway(
  produce: (request: ProviderRequest) => AsyncGenerator<ProviderStreamEvent>,
  options: {
    profileOverrides?: Record<string, unknown>
    maxRetries?: number
  } = {}
) {
  const state: FakeStreamState = { calls: 0, returned: 0 }
  const events: ModelGatewayEvent[] = []
  const provider = {
    id: 'fake',
    location: 'local' as const,
    models: ['fake-v1'],
    execute: async (): Promise<ProviderResult> => {
      throw new Error('execute must not be used by a streaming profile')
    },
    executeStream: (request: ProviderRequest) => {
      state.calls += 1
      const inner = produce(request)
      return {
        [Symbol.asyncIterator]: () => ({
          next: () => inner.next(),
          return: async () => {
            state.returned += 1
            return inner.return(undefined)
          }
        })
      }
    }
  }
  const gateway = new ModelGateway({
    providers: [provider as never],
    profiles: {
      fast: profile({
        streaming: true,
        maxRetries: options.maxRetries ?? 0,
        ...options.profileOverrides
      })
    },
    prompts: registry(),
    clock: () => NOW,
    sleep: async () => undefined,
    onEvent: (event) => events.push(event)
  })
  return { gateway, state, events }
}

describe('PAR-M01 §4 — gateway terminal state', () => {
  it.fails(
    'returns one result whose text is the concatenated deltas',
    async () => {
      const { gateway, state } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'Olá, ' }
        yield { type: 'delta', text: 'mundo' }
        yield { type: 'usage', usage: { inputTokens: 4, outputTokens: 2 } }
        yield { type: 'finish', reason: 'stop' }
      })
      const result = await gateway.generate(gatewayRequest())
      expect(result.output.text).toBe('Olá, mundo')
      expect(result.usageStatus).toBe('reported')
      expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 2 })
      expect(result.attempts).toBe(1)
      expect(state.calls).toBe(1)
    }
  )

  it.fails(
    'a cut after deltas is a failure: no result, no partial text anywhere',
    async () => {
      const { gateway, events } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'PARCIAL-SECRETO' }
        throw new ModelProviderError('fake', 'connection', 'cut')
      })
      const failure = await gateway.generate(gatewayRequest()).then(
        () => undefined,
        (error: unknown) => error
      )
      expect(failure).toMatchObject({ code: 'provider_connection_reset' })
      expect(JSON.stringify({ failure, events })).not.toContain(
        'PARCIAL-SECRETO'
      )
      expect(events.filter((e) => e.type === 'model.call.failed')).toHaveLength(
        1
      )
      expect(events.some((e) => e.type === 'model.call.completed')).toBe(false)
    }
  )

  it.fails(
    'an iterator that ends without finish is a failure, not a result',
    async () => {
      const { gateway } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'sem fim' }
      })
      await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
        code: 'provider_connection_reset'
      })
    }
  )

  it.fails(
    'a caller abort is cancelled, closes the stream once and is not retried',
    async () => {
      const controller = new AbortController()
      const { gateway, state } = streamingGateway(
        async function* () {
          yield { type: 'delta', text: 'a' }
          await new Promise((r) => setTimeout(r, 5_000))
          yield { type: 'finish', reason: 'stop' }
        },
        { maxRetries: 2 }
      )
      const run = gateway.generate({
        ...gatewayRequest(),
        signal: controller.signal
      })
      setTimeout(() => controller.abort(), 50)
      await expect(run).rejects.toMatchObject({ code: 'cancelled' })
      expect(state.calls).toBe(1)
      expect(state.returned).toBe(1)
    },
    10_000
  )

  it.fails(
    'anything after finish is a protocol violation, not extra text',
    async () => {
      const { gateway } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'a' }
        yield { type: 'finish', reason: 'stop' }
        yield { type: 'delta', text: 'tarde' }
      })
      await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
        code: 'provider_malformed_response'
      })
    }
  )

  it.fails('a second finish is a protocol violation', async () => {
    const { gateway } = streamingGateway(async function* () {
      yield { type: 'finish', reason: 'stop' }
      yield { type: 'finish', reason: 'length' }
    })
    await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
      code: 'provider_malformed_response'
    })
  })

  it.fails(
    'a streaming profile on a provider without executeStream fails closed',
    async () => {
      const gateway = new ModelGateway({
        providers: [
          {
            id: 'fake',
            location: 'local',
            models: ['fake-v1'],
            execute: async (): Promise<ProviderResult> => ({
              text: 'silent fallback',
              providerId: 'fake',
              model: 'fake-v1',
              externalCall: false
            })
          }
        ],
        profiles: { fast: profile({ streaming: true }) },
        prompts: registry(),
        clock: () => NOW
      })
      await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
        code: 'invalid_request'
      })
    }
  )

  it.fails(
    'a retry after a cut yields only the complete attempt, both attempts counted',
    async () => {
      let attempt = 0
      const { gateway, events } = streamingGateway(
        async function* () {
          attempt += 1
          if (attempt === 1) {
            yield { type: 'delta', text: 'PRIMEIRA-PARCIAL' }
            throw new ModelProviderError('fake', 'connection', 'cut')
          }
          yield { type: 'delta', text: 'segunda completa' }
          yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 2 } }
          yield { type: 'finish', reason: 'stop' }
        },
        { maxRetries: 1 }
      )
      const result = await gateway.generate(gatewayRequest())
      expect(result.output.text).toBe('segunda completa')
      expect(result.output.text).not.toContain('PRIMEIRA')
      expect(result.attempts).toBe(2)
      expect(events.some((e) => e.type === 'model.retry.scheduled')).toBe(true)
    }
  )

  it.fails(
    'structured output is parsed only from a complete stream',
    async () => {
      const complete = streamingGateway(async function* () {
        yield { type: 'delta', text: '{"ok":' }
        yield { type: 'delta', text: 'true}' }
        yield { type: 'finish', reason: 'stop' }
      })
      const structured = {
        schemaName: 'ok',
        schema: {
          parse: (v: unknown) => v,
          safeParse: (v: unknown) => ({ success: true, data: v })
        } as never
      }
      const ok = await complete.gateway.generate({
        ...gatewayRequest(),
        structuredOutput: structured
      })
      expect(ok.output.structured).toEqual({ ok: true })

      const cut = streamingGateway(async function* () {
        yield { type: 'delta', text: '{"ok":true}' }
        throw new ModelProviderError('fake', 'connection', 'cut')
      })
      await expect(
        cut.gateway.generate({
          ...gatewayRequest(),
          structuredOutput: structured
        })
      ).rejects.toMatchObject({ code: 'provider_connection_reset' })
    }
  )
})

describe('PAR-M01 §7 — usage of a stream is unknown, never zero', () => {
  it.fails(
    'a completed stream without counters is unreported with the conservative bound',
    async () => {
      const { gateway, events } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'sem contadores' }
        yield { type: 'finish', reason: 'stop' }
      })
      const result = await gateway.generate(gatewayRequest())
      expect(result.usageStatus).toBe('unreported')
      expect(result.usage.outputTokens).toBeGreaterThan(0)
      expect(result.costUsd).toBeGreaterThan(0)
      expect(
        events.find((e) => e.type === 'model.call.completed')
      ).toMatchObject({ detail: expect.stringContaining('usage_unreported') })
    }
  )

  it.fails(
    'a stream cut after output is charged the conservative bound, flagged unreported',
    async () => {
      const { gateway, events } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'algo foi gerado' }
        throw new ModelProviderError('fake', 'connection', 'cut')
      })
      await expect(gateway.generate(gatewayRequest())).rejects.toBeDefined()
      const failed = events.find((e) => e.type === 'model.call.failed')
      expect(failed).toMatchObject({ detail: 'usage_unreported' })
      expect(failed?.costUsd).toBeGreaterThan(0)
      expect(failed?.outputTokens).toBeGreaterThan(0)
    }
  )

  it.fails(
    'a stream cancelled after output is also charged, never as zero',
    async () => {
      const controller = new AbortController()
      const { gateway, events } = streamingGateway(async function* () {
        yield { type: 'delta', text: 'saiu algo' }
        await new Promise((r) => setTimeout(r, 5_000))
        yield { type: 'finish', reason: 'stop' }
      })
      const run = gateway.generate({
        ...gatewayRequest(),
        signal: controller.signal
      })
      setTimeout(() => controller.abort(), 50)
      await expect(run).rejects.toMatchObject({ code: 'cancelled' })
      const failed = events.find((e) => e.type === 'model.call.failed')
      expect(failed).toMatchObject({ detail: 'usage_unreported' })
      expect(failed?.costUsd).toBeGreaterThan(0)
    },
    10_000
  )

  it.fails(
    "a stream that fails before any output keeps today's failure accounting",
    async () => {
      const { gateway, events } = streamingGateway(async function* () {
        throw new ModelProviderError('fake', 'unavailable', 'down')
      })
      await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
        code: 'provider_unavailable'
      })
      const failed = events.find((e) => e.type === 'model.call.failed')
      expect(failed?.detail).toBeUndefined()
      expect(failed?.costUsd).toBeUndefined()
    }
  )
})
