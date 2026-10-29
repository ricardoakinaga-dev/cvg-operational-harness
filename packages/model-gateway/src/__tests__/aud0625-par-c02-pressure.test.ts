import { describe, expect, it } from 'vitest'
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
import type { ProviderStreamEvent } from '../stream.ts'
import { TokenMeter } from '../token-meter.ts'

/**
 * PAR-C02 / SPEC 0285 phase 1 (RED). Usage per attempt, failures included,
 * must be reconstructable from the gateway event log, and the request
 * pressure must be known before the provider is called. The `it.fails`
 * cases describe the target and fail on the current gateway; the controls
 * pass before and after the BUILD. Synthetic data only.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-0000000c0201'
const INSTRUCTION = 'Approved synthetic instruction for the pressure proof.'
const NOW = new Date('2026-10-29T00:00:00.000Z')

function registry(): PromptRegistry {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'pressure-synthetic',
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
    streaming: true,
    ...overrides
  } as ModelProfile
}

function request(content = 'Synthetic input only'): ModelGatewayRequest {
  return {
    requestId: 'req_par_c02',
    tenantId: TENANT,
    correlationId: 'corr_par_c02',
    promptId: 'pressure-synthetic',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: {
      system: INSTRUCTION,
      messages: [{ role: 'user', content }]
    }
  }
}

type Attempt = (
  request: ProviderRequest,
  attempt: number
) => AsyncGenerator<ProviderStreamEvent>

function world(attempts: Attempt[], profileOverrides = {}) {
  const events: ModelGatewayEvent[] = []
  const order: string[] = []
  const meter = new TokenMeter()
  let calls = 0
  const provider = {
    id: 'fake',
    location: 'local' as const,
    models: ['fake-v1'],
    execute: async (): Promise<ProviderResult> => {
      throw new Error('execute must not be used by a streaming profile')
    },
    executeStream: (req: ProviderRequest) => {
      calls += 1
      order.push(`provider:${calls}`)
      const produce = attempts[calls - 1] ?? attempts[attempts.length - 1]!
      return produce(req, calls)
    }
  }
  const gateway = new ModelGateway({
    providers: [provider as never],
    profiles: { fast: profile(profileOverrides) },
    prompts: registry(),
    clock: () => NOW,
    sleep: async () => undefined,
    meter,
    onEvent: (event) => {
      events.push(event)
      order.push(`${event.type}:${event.attempt ?? '-'}`)
    }
  })
  return { gateway, events, order, meter, calls: () => calls }
}

const ok: Attempt = async function* () {
  yield { type: 'delta', text: 'resposta' }
  yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 3 } }
  yield { type: 'finish', reason: 'stop' }
}

const cutAfterOutput: Attempt = async function* () {
  yield { type: 'delta', text: 'parcial' }
  throw new ModelProviderError('fake', 'connection', 'synthetic cut')
}

const failedEvents = (events: ModelGatewayEvent[]) =>
  events.filter((e) => e.type === 'model.call.failed')

/** What the log alone says was consumed: reported tokens and unknown attempts. */
function reconstruct(events: ModelGatewayEvent[]) {
  let inputTokens = 0
  let outputTokens = 0
  let reportedRequests = 0
  let unreportedRequests = 0
  for (const event of events) {
    if (
      event.type !== 'model.call.completed' &&
      event.type !== 'model.call.failed'
    )
      continue
    if (event.detail === 'usage_unreported') {
      unreportedRequests += 1
      continue
    }
    if (event.type === 'model.call.completed') {
      reportedRequests += 1
      inputTokens += event.inputTokens ?? 0
      outputTokens += event.outputTokens ?? 0
    }
  }
  return { inputTokens, outputTokens, reportedRequests, unreportedRequests }
}

describe('PAR-C02 controls (pass before and after the BUILD)', () => {
  it('a reported success is in the log and in the meter with the same numbers', async () => {
    const w = world([ok])
    await w.gateway.generate(request())
    const log = reconstruct(w.events)
    const snap = w.meter.snapshot()
    expect(log.reportedRequests).toBe(snap.requests)
    expect(log.inputTokens).toBe(snap.inputTokens)
    expect(log.outputTokens).toBe(snap.outputTokens)
    expect(log.unreportedRequests).toBe(w.meter.unreportedRequests)
  })

  it('a final failure after output is logged once as usage_unreported', async () => {
    const w = world([cutAfterOutput])
    await expect(w.gateway.generate(request())).rejects.toBeDefined()
    const failed = failedEvents(w.events)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ attempt: 1, detail: 'usage_unreported' })
    expect(w.meter.unreportedRequests).toBe(1)
  })

  it('a failure before any output stays uncharged and carries no tokens', async () => {
    const w = world([
      async function* () {
        throw new ModelProviderError('fake', 'connection', 'refused')
      }
    ])
    await expect(w.gateway.generate(request())).rejects.toBeDefined()
    const failed = failedEvents(w.events)
    expect(failed).toHaveLength(1)
    expect(failed[0]?.inputTokens).toBeUndefined()
    expect(w.meter.unreportedRequests).toBe(0)
  })
})

describe('PAR-C02 targets (RED in phase 1)', () => {
  it.fails(
    'a retried attempt that failed after output has its own model.call.failed, before the retry is scheduled',
    async () => {
      const w = world([cutAfterOutput, ok], { maxRetries: 1 })
      const result = await w.gateway.generate(request())
      expect(result.attempts).toBe(2)
      const failed = failedEvents(w.events)
      expect(failed).toHaveLength(1)
      expect(failed[0]).toMatchObject({
        attempt: 1,
        detail: 'usage_unreported'
      })
      expect(failed[0]?.inputTokens).toBeGreaterThan(0)
      expect(w.order.indexOf('model.call.failed:1')).toBeLessThan(
        w.order.indexOf('model.retry.scheduled:2')
      )
    }
  )

  it.fails(
    'the log alone reconstructs the meter, also when an attempt failed and was retried',
    async () => {
      const w = world([cutAfterOutput, ok], { maxRetries: 1 })
      await w.gateway.generate(request())
      const log = reconstruct(w.events)
      const snap = w.meter.snapshot()
      expect(w.meter.unreportedRequests).toBe(1)
      expect(log.unreportedRequests).toBe(w.meter.unreportedRequests)
      expect(log.reportedRequests).toBe(snap.requests)
      expect(log.inputTokens).toBe(snap.inputTokens)
      expect(log.outputTokens).toBe(snap.outputTokens)
    }
  )

  it.fails(
    'the request pressure is on model.call.started, before the provider is called',
    async () => {
      const w = world([ok])
      await w.gateway.generate(request())
      const started = w.events.find((e) => e.type === 'model.call.started') as
        | (ModelGatewayEvent & { projectedInputTokens?: number })
        | undefined
      expect(started?.projectedInputTokens).toBeGreaterThan(0)
      expect(Number.isSafeInteger(started?.projectedInputTokens)).toBe(true)
      expect(w.order.indexOf('model.call.started:1')).toBeLessThan(
        w.order.indexOf('provider:1')
      )
    }
  )

  it.fails(
    'a request whose projection overflows the declared context window never reaches the provider and is not charged',
    async () => {
      const w = world([ok], { contextWindow: 64 })
      await expect(
        w.gateway.generate(request('x'.repeat(4_000)))
      ).rejects.toBeDefined()
      expect(w.calls()).toBe(0)
      expect(w.meter.snapshot().requests).toBe(0)
      expect(w.meter.unreportedRequests).toBe(0)
      expect(
        w.events.some(
          (e) =>
            (e.type === 'model.call.completed' ||
              e.type === 'model.call.failed') &&
            e.inputTokens !== undefined
        )
      ).toBe(false)
    }
  )
})
