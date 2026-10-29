// @vitest-environment node
import { createServer, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryCostBudgetStore } from '../budget.ts'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { ModelProviderError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import * as barrel from '../index.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { OllamaProvider } from '../providers/ollama.ts'
import { OpenAICompatibleProvider } from '../providers/openai-compatible.ts'
import type { ProviderStreamEvent } from '../stream.ts'
import { TokenMeter } from '../token-meter.ts'

/**
 * SPEC 0284 slice 5: the stream through the real gateway, budget and meter,
 * and through the real providers over loopback. Synthetic data only.
 */
const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const INSTRUCTION = 'Approved synthetic instruction for the stream proof.'
const NOW = new Date('2026-10-29T00:00:00.000Z')
const USER_TEXT = 'Synthetic input only'

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
  script: (response: ServerResponse) => void
): Promise<string> {
  const server = createServer((request, response) => {
    request.resume()
    request.on('end', () => script(response))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

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

function profile(overrides: Partial<ModelProfile> = {}): ModelProfile {
  return {
    name: 'fast',
    providerId: 'fake',
    model: 'fake-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 100,
    timeoutMs: 2_000,
    maxCostUsd: 100,
    estimatedCostUsd: 0.001,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 1, outputPer1kUsd: 2 },
    streaming: true,
    ...overrides
  }
}

function gatewayRequest(): ModelGatewayRequest {
  return {
    requestId: 'req_par_m01_integration',
    tenantId: TENANT,
    correlationId: 'corr_par_m01_integration',
    promptId: 'stream-synthetic',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: {
      system: INSTRUCTION,
      messages: [{ role: 'user', content: USER_TEXT }]
    }
  }
}

const bound = (maxTokens = 100) =>
  Math.round(
    ((Buffer.byteLength(INSTRUCTION) + Buffer.byteLength(USER_TEXT)) / 1000) *
      1_000_000 +
      (maxTokens / 1000) * 2 * 1_000_000
  ) / 1_000_000

function fakeStreamGateway(
  scripts: ((
    request: ProviderRequest
  ) => AsyncGenerator<ProviderStreamEvent>)[],
  profileOverrides: Partial<ModelProfile> = {}
) {
  let call = 0
  const store = new InMemoryCostBudgetStore()
  const meter = new TokenMeter()
  const events: ModelGatewayEvent[] = []
  const gateway = new ModelGateway({
    providers: [
      {
        id: 'fake',
        location: 'local',
        models: ['fake-v1'],
        execute: async (): Promise<ProviderResult> => {
          throw new Error('not used by a streaming profile')
        },
        executeStream: (request: ProviderRequest) =>
          scripts[Math.min(call++, scripts.length - 1)]!(request)
      }
    ],
    profiles: { fast: profile(profileOverrides) },
    prompts: registry(),
    budget: { store, limits: { tenant: 100 } },
    meter,
    clock: () => NOW,
    sleep: async () => undefined,
    onEvent: (event) => events.push(event)
  })
  return { gateway, store, meter, events, calls: () => call }
}

describe('PAR-M01 §7/§8 — budget and meter with a stream', () => {
  it('a cut after output is charged the bound exactly once and counted as unreported', async () => {
    const { gateway, store, meter } = fakeStreamGateway([
      async function* () {
        yield { type: 'delta', text: 'algo' }
        throw new ModelProviderError('fake', 'connection', 'cut')
      }
    ])
    await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
      code: 'provider_connection_reset'
    })
    expect(store.consumed(`tenant:${TENANT}`)).toBeCloseTo(bound(), 6)
    expect(meter.unreportedRequests).toBe(1)
  })

  it('a retry after a cut charges the first attempt at the bound and the second at its measured usage', async () => {
    const { gateway, store, result } = await (async () => {
      const f = fakeStreamGateway(
        [
          async function* () {
            yield { type: 'delta', text: 'parcial' }
            throw new ModelProviderError('fake', 'connection', 'cut')
          },
          async function* () {
            yield { type: 'delta', text: 'completa' }
            yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } }
            yield { type: 'finish', reason: 'stop' }
          }
        ],
        { maxRetries: 1 }
      )
      return { ...f, result: await f.gateway.generate(gatewayRequest()) }
    })()
    void gateway
    const second = (10 / 1000) * 1 + (5 / 1000) * 2
    expect(result.output.text).toBe('completa')
    expect(result.attempts).toBe(2)
    expect(result.usageStatus).toBe('reported')
    expect(store.consumed(`tenant:${TENANT}`)).toBeCloseTo(bound() + second, 6)
  })

  it('two cut attempts are each charged the bound, the reservation counted once', async () => {
    const cut = async function* (): AsyncGenerator<ProviderStreamEvent> {
      yield { type: 'delta', text: 'parcial' }
      throw new ModelProviderError('fake', 'connection', 'cut')
    }
    const { gateway, store, meter } = fakeStreamGateway([cut, cut], {
      maxRetries: 1
    })
    await expect(gateway.generate(gatewayRequest())).rejects.toMatchObject({
      code: 'provider_connection_reset'
    })
    expect(store.consumed(`tenant:${TENANT}`)).toBeCloseTo(2 * bound(), 6)
    expect(meter.unreportedRequests).toBe(2)
  })

  it('a failure before any output is accounted exactly like the non-stream path', async () => {
    const failing = async function* (): AsyncGenerator<ProviderStreamEvent> {
      throw new ModelProviderError('fake', 'unavailable', 'down')
    }
    const streamed = fakeStreamGateway([failing])
    await expect(
      streamed.gateway.generate(gatewayRequest())
    ).rejects.toBeDefined()

    const plainStore = new InMemoryCostBudgetStore()
    const plain = new ModelGateway({
      providers: [
        {
          id: 'fake',
          location: 'local',
          models: ['fake-v1'],
          execute: async () => {
            throw new ModelProviderError('fake', 'unavailable', 'down')
          }
        }
      ],
      profiles: { fast: profile({ streaming: false }) },
      prompts: registry(),
      budget: { store: plainStore, limits: { tenant: 100 } },
      clock: () => NOW
    })
    await expect(plain.generate(gatewayRequest())).rejects.toBeDefined()
    expect(streamed.store.consumed(`tenant:${TENANT}`)).toBe(
      plainStore.consumed(`tenant:${TENANT}`)
    )
  })

  it('a completed stream with measured usage charges the measured cost once', async () => {
    const { gateway, store, meter } = fakeStreamGateway([
      async function* () {
        yield { type: 'delta', text: 'ok' }
        yield { type: 'usage', usage: { inputTokens: 20, outputTokens: 10 } }
        yield { type: 'finish', reason: 'stop' }
      }
    ])
    const result = await gateway.generate(gatewayRequest())
    expect(result.costUsd).toBeCloseTo(0.04, 6)
    expect(store.consumed(`tenant:${TENANT}`)).toBeCloseTo(0.04, 6)
    expect(meter.unreportedRequests).toBe(0)
  })
})

describe('PAR-M01 — the gateway with the real providers over loopback', () => {
  function realGateway(provider: OpenAICompatibleProvider | OllamaProvider) {
    const events: ModelGatewayEvent[] = []
    const gateway = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile({ providerId: provider.id, model: 'm' }) },
      prompts: registry(),
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    return { gateway, events }
  }
  const sse = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`

  it('OpenAI-compatible: one result from an SSE stream, multibyte intact, usage reported', async () => {
    const url = await startServer((response) => {
      const first = Buffer.from(
        sse({ choices: [{ delta: { content: 'Olá, mundo' } }] })
      )
      const cut = first.indexOf(0xc3) + 1
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(first.subarray(0, cut))
      setTimeout(() => {
        response.write(first.subarray(cut))
        response.write(sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }))
        response.write(
          sse({
            choices: [],
            usage: { prompt_tokens: 7, completion_tokens: 3 }
          })
        )
        response.end('data: [DONE]\n\n')
      }, 25)
    })
    const { gateway } = realGateway(
      new OpenAICompatibleProvider({
        id: 'real-openai',
        baseUrl: url,
        model: 'm',
        location: 'local',
        allowHttp: true,
        allowPrivateNetworks: true
      })
    )
    const result = await gateway.generate(gatewayRequest())
    expect(result.output.text).toBe('Olá, mundo')
    expect(result.usageStatus).toBe('reported')
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3 })
  })

  it('OpenAI-compatible: a cut stream is a failure and the partial text is nowhere', async () => {
    const url = await startServer((response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(
        sse({ choices: [{ delta: { content: 'PARCIAL-SECRETO' } }] })
      )
      setTimeout(() => response.destroy(), 20)
    })
    const { gateway, events } = realGateway(
      new OpenAICompatibleProvider({
        id: 'real-openai',
        baseUrl: url,
        model: 'm',
        location: 'local',
        allowHttp: true,
        allowPrivateNetworks: true
      })
    )
    const failure = await gateway.generate(gatewayRequest()).then(
      () => undefined,
      (error: unknown) => error
    )
    expect(failure).toMatchObject({ code: 'provider_connection_reset' })
    expect(JSON.stringify({ failure, events })).not.toContain('PARCIAL-SECRETO')
    expect(events.find((e) => e.type === 'model.call.failed')).toMatchObject({
      detail: 'usage_unreported'
    })
  })

  it('Ollama: one result from an NDJSON stream, usage from the done line', async () => {
    const url = await startServer((response) => {
      response.writeHead(200, { 'content-type': 'application/x-ndjson' })
      response.write(
        `${JSON.stringify({ message: { content: 'Olá, ' }, done: false })}\n`
      )
      response.end(
        `${JSON.stringify({
          message: { content: 'mundo' },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 4,
          eval_count: 2
        })}\n`
      )
    })
    const { gateway } = realGateway(
      new OllamaProvider({
        id: 'real-ollama',
        baseUrl: url,
        model: 'm',
        allowPrivateNetworks: true
      })
    )
    const result = await gateway.generate(gatewayRequest())
    expect(result.output.text).toBe('Olá, mundo')
    expect(result.usage).toEqual({ inputTokens: 4, outputTokens: 2 })
  })

  it('a caller abort mid-stream ends cancelled through the real transport and charges the bound', async () => {
    const url = await startServer((response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.write(sse({ choices: [{ delta: { content: 'comecou' } }] }))
    })
    const { gateway, events } = realGateway(
      new OpenAICompatibleProvider({
        id: 'real-openai',
        baseUrl: url,
        model: 'm',
        location: 'local',
        allowHttp: true,
        allowPrivateNetworks: true
      })
    )
    const controller = new AbortController()
    const running = gateway.generate({
      ...gatewayRequest(),
      signal: controller.signal
    })
    setTimeout(() => controller.abort(), 80)
    await expect(running).rejects.toMatchObject({ code: 'cancelled' })
    expect(events.find((e) => e.type === 'model.call.failed')).toMatchObject({
      code: 'cancelled',
      detail: 'usage_unreported'
    })
  })
})

describe('PAR-M01 D1 — nothing internal leaves the package', () => {
  it('the barrel exports no stream symbol', () => {
    const names = Object.keys(barrel)
    for (const internal of [
      'assembleProviderStream',
      'readStreamFrames',
      'streamLimit',
      'DEFAULT_MAX_STREAM_EVENTS',
      'DEFAULT_MAX_STREAM_EVENT_BYTES',
      'DEFAULT_STREAM_IDLE_TIMEOUT_MS',
      'fetchWithResolvedAddress'
    ]) {
      expect(names).not.toContain(internal)
    }
  })

  it('generate still returns a single ModelResult with no delta surface', async () => {
    const { gateway } = fakeStreamGateway([
      async function* () {
        yield { type: 'delta', text: 'a' }
        yield { type: 'finish', reason: 'stop' }
      }
    ])
    const result = await gateway.generate(gatewayRequest())
    expect(Object.keys(result)).not.toContain('deltas')
    expect(typeof result.output.text).toBe('string')
  })
})
