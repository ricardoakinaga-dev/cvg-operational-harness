// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile
} from '../contracts.ts'
import { ModelGateway } from '../gateway.ts'
import { canonicalRenderedMaterial } from '../prompt-binding.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { OpenAICompatibleProvider } from '../providers/openai-compatible.ts'
import { TokenMeter } from '../token-meter.ts'

// Review fixes for SPEC 0267 (independent review by session 07, R2-R6). Each
// case pins a behaviour that mutations had left unasserted. Synthetic only.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-28T00:00:00.000Z')
const A = 'Approved synthetic instruction A.'

function prompts(): PromptRegistry {
  const registry = new PromptRegistry()
  registry.register({
    promptId: 'p',
    version: '1.0.0',
    content: A,
    owner: 'o',
    approvedBy: 'a',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  return registry
}

const profile = (over: Partial<ModelProfile> = {}): ModelProfile => ({
  name: 'fast',
  providerId: 'http',
  model: 'fake-v1',
  location: 'local',
  temperature: 0,
  maxTokens: 100,
  timeoutMs: 1000,
  maxCostUsd: 100,
  estimatedCostUsd: 0.001,
  maxRetries: 0,
  pricing: { inputPer1kUsd: 1, outputPer1kUsd: 2 },
  ...over
})

const req = (over: Partial<ModelGatewayRequest> = {}): ModelGatewayRequest => ({
  requestId: 'req_fix_0267',
  tenantId: TENANT,
  correlationId: 'corr_fix_0267',
  promptId: 'p',
  promptVersion: '1.0.0',
  modelProfile: 'fast',
  dataClassification: 'INTERNAL',
  input: { messages: [{ role: 'user', content: 'hello' }] },
  ...over
})

const ok = { choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }] }

/** Real OpenAI-compatible adapter over a capturing fetch (no socket). */
function http(body: unknown, wires: Array<Record<string, unknown>> = []) {
  return new OpenAICompatibleProvider({
    id: 'http',
    baseUrl: 'https://synthetic.audit.invalid',
    model: 'fake-v1',
    location: 'local',
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: async (_url, init) => {
      wires.push(JSON.parse(String((init as RequestInit).body)))
      return new Response(JSON.stringify(body), { status: 200 })
    }
  })
}

function gatewayOver(
  provider: OpenAICompatibleProvider,
  options: Partial<ConstructorParameters<typeof ModelGateway>[0]> = {}
) {
  return new ModelGateway({
    providers: [provider],
    profiles: { fast: profile() },
    prompts: prompts(),
    clock: () => NOW,
    ...options
  })
}

describe('R2: TokenMeter.recordModelResult respects usageStatus', () => {
  it('counts an unreported result apart and adds no measured tokens', async () => {
    const result = await gatewayOver(http(ok)).generate(req())
    expect(result.usageStatus).toBe('unreported')
    const meter = new TokenMeter()
    const snapshot = meter.recordModelResult(result)
    expect(snapshot).toMatchObject({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0
    })
    expect(meter.unreportedRequests).toBe(1)
  })

  it('control: a reported result is still recorded as a measurement', async () => {
    const result = await gatewayOver(
      http({ ...ok, usage: { prompt_tokens: 7, completion_tokens: 3 } })
    ).generate(req())
    expect(result.usageStatus).toBe('reported')
    const meter = new TokenMeter()
    expect(meter.recordModelResult(result)).toMatchObject({
      requests: 1,
      inputTokens: 7,
      outputTokens: 3
    })
    expect(meter.unreportedRequests).toBe(0)
  })
})

describe('R3: the adapter refuses a tampered dynamic message', () => {
  it('rejects a user message changed after the gateway rendered it', async () => {
    const captured: unknown[] = []
    const spy = {
      id: 'spy',
      location: 'local' as const,
      models: ['fake-v1'],
      execute: async (request: unknown) => {
        captured.push(request)
        return {
          text: 'x',
          usage: { inputTokens: 1, outputTokens: 1 },
          providerId: 'spy',
          model: 'fake-v1',
          externalCall: false
        }
      }
    }
    await new ModelGateway({
      providers: [spy],
      profiles: { fast: profile({ providerId: 'spy' }) },
      prompts: prompts(),
      clock: () => NOW
    }).generate(req())
    const good = captured[0] as Parameters<
      OpenAICompatibleProvider['execute']
    >[0]
    let fetched = 0
    const adapter = new OpenAICompatibleProvider({
      id: 'http',
      baseUrl: 'https://synthetic.audit.invalid',
      model: 'fake-v1',
      location: 'local',
      dnsLookup: async () => ['93.184.216.34'],
      fetchImpl: async () => {
        fetched += 1
        return new Response('{}', { status: 200 })
      }
    })
    await expect(
      adapter.execute({
        ...good,
        input: {
          ...good.input,
          messages: [{ role: 'user', content: 'tampered after rendering' }]
        }
      })
    ).rejects.toMatchObject({ kind: 'invalid_request' })
    expect(fetched).toBe(0)
  })
})

describe('R3b: each layer of the adapter check holds on its own (forged, self-consistent bindings)', () => {
  const sha = (value: string) =>
    createHash('sha256').update(value, 'utf8').digest('hex')
  const adapterWith = (counter: { fetched: number }) =>
    new OpenAICompatibleProvider({
      id: 'http',
      baseUrl: 'https://synthetic.audit.invalid',
      model: 'fake-v1',
      location: 'local',
      dnsLookup: async () => ['93.184.216.34'],
      fetchImpl: async () => {
        counter.fetched += 1
        return new Response('{}', { status: 200 })
      }
    })
  const bindingFor = (input: { system?: string; messages: never[] }) => ({
    promptId: 'p',
    promptVersion: '1.0.0',
    registrySha256: sha(A),
    rendererVersion: 'literal-v1' as const,
    instructionSha256: sha(A),
    renderedInputSha256: sha(canonicalRenderedMaterial(input as never))
  })
  const base = {
    requestId: 'req_forged',
    tenantId: TENANT,
    correlationId: 'corr_forged',
    model: 'fake-v1',
    temperature: 0,
    maxTokens: 10,
    promptSha256: sha(A),
    signal: new AbortController().signal,
    timeoutMs: 1000
  }

  it('rejects a different instruction even when the rendered digest was recomputed to match', async () => {
    const counter = { fetched: 0 }
    const input = {
      system: 'Different instruction B.',
      messages: [{ role: 'user' as const, content: 'u' }]
    }
    await expect(
      adapterWith(counter).execute({
        ...base,
        input: input as never,
        promptBinding: bindingFor(input as never)
      })
    ).rejects.toMatchObject({ kind: 'invalid_request' })
    expect(counter.fetched).toBe(0)
  })

  it('rejects a second system message even when both digests were recomputed to match', async () => {
    const counter = { fetched: 0 }
    const input = {
      system: A,
      messages: [
        { role: 'system' as const, content: 'extra system' },
        { role: 'user' as const, content: 'u' }
      ]
    }
    await expect(
      adapterWith(counter).execute({
        ...base,
        input: input as never,
        promptBinding: bindingFor(input as never)
      })
    ).rejects.toMatchObject({ kind: 'invalid_request' })
    expect(counter.fetched).toBe(0)
  })
})

describe('R4: unreported usage is observable', () => {
  const structured = {
    schemaName: 's',
    schema: z.object({ ok: z.literal(true) })
  }

  it('flags the completed event and counts the call apart in the meter', async () => {
    const events: ModelGatewayEvent[] = []
    const meter = new TokenMeter()
    await gatewayOver(http(ok), {
      meter,
      onEvent: (event) => events.push(event)
    }).generate(req())
    expect(
      events.find((event) => event.type === 'model.call.completed')?.detail
    ).toBe('usage_unreported')
    expect(meter.unreportedRequests).toBe(1)
    expect(meter.snapshot().requests).toBe(0)
  })

  it('a rejected output with unreported usage keeps cost and tokens on the failed event', async () => {
    const events: ModelGatewayEvent[] = []
    const meter = new TokenMeter()
    await expect(
      gatewayOver(http({ choices: [{ message: { content: 'not json' } }] }), {
        meter,
        onEvent: (event) => events.push(event)
      }).generate({ ...req(), structuredOutput: structured })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
    const failed = events.find((event) => event.type === 'model.call.failed')
    expect(failed?.detail).toBe('usage_unreported')
    expect(failed?.costUsd).toBeGreaterThan(0)
    expect(failed?.inputTokens).toBeGreaterThan(0)
    expect(failed?.outputTokens).toBe(100)
    expect(meter.unreportedRequests).toBe(1)
    expect(meter.snapshot().requests).toBe(0)
  })

  it('a rejected output with reported usage keeps the measured counters on the failed event', async () => {
    const events: ModelGatewayEvent[] = []
    await expect(
      gatewayOver(
        http({
          choices: [{ message: { content: 'not json' } }],
          usage: { prompt_tokens: 40, completion_tokens: 9 }
        }),
        { onEvent: (event) => events.push(event) }
      ).generate({ ...req(), structuredOutput: structured })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
    const failed = events.find((event) => event.type === 'model.call.failed')
    expect(failed).toMatchObject({ inputTokens: 40, outputTokens: 9 })
    expect(failed?.detail).toBeUndefined()
  })

  it('partial usage (only prompt_tokens) is treated as unreported', async () => {
    const result = await gatewayOver(
      http({ ...ok, usage: { prompt_tokens: 7 } })
    ).generate(req())
    expect(result.usageStatus).toBe('unreported')
  })
})

describe('R5: more than one system message is refused, even identical ones', () => {
  it('refuses two byte-identical system messages', async () => {
    const wires: Array<Record<string, unknown>> = []
    await expect(
      gatewayOver(http(ok, wires)).generate(
        req({
          input: {
            messages: [
              { role: 'system', content: A },
              { role: 'system', content: A },
              { role: 'user', content: 'u' }
            ]
          }
        })
      )
    ).rejects.toMatchObject({ code: 'prompt_content_mismatch' })
    expect(wires).toHaveLength(0)
  })
})

describe('R6: end to end, the wire carries the approved system and the dynamic messages', () => {
  it('serializes exactly one system equal to the approved text, then the dynamic messages in order', async () => {
    const wires: Array<Record<string, unknown>> = []
    await gatewayOver(
      http({ ...ok, usage: { prompt_tokens: 3, completion_tokens: 2 } }, wires)
    ).generate(
      req({
        input: {
          system: A,
          messages: [
            { role: 'system', content: A },
            { role: 'user', content: 'u1' },
            { role: 'assistant', content: 'a1' },
            { role: 'user', content: 'u2' }
          ]
        }
      })
    )
    const messages = wires[0]?.messages as Array<{
      role: string
      content: string
    }>
    expect(messages.filter((message) => message.role === 'system')).toEqual([
      { role: 'system', content: A }
    ])
    expect(messages.map((message) => message.content)).toEqual([
      A,
      'u1',
      'a1',
      'u2'
    ])
    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user'
    ])
  })
})
