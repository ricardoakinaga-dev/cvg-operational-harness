import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { InMemoryCostBudgetStore } from '../budget.ts'
import { ModelGatewayError, ModelProviderError } from '../errors.ts'
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

/**
 * What the log alone says was consumed (SPEC 0285 §4, as corrected by note
 * 0285b): every terminal event that carries tokens counts, completed or
 * failed; `detail` is a comma-separated flag list, and a terminal flagged
 * `usage_unreported` is an unknown attempt, never measured tokens.
 */
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
    if (event.inputTokens === undefined) continue
    const flags = (event.detail ?? '').split(',')
    if (flags.includes('usage_unreported')) {
      unreportedRequests += 1
      continue
    }
    reportedRequests += 1
    inputTokens += event.inputTokens
    outputTokens += event.outputTokens ?? 0
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

describe('PAR-C02 targets (RED in phase 1, GREEN after the BUILD)', () => {
  it('a retried attempt that failed after output has its own model.call.failed, before the retry is scheduled', async () => {
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
  })

  it('the log alone reconstructs the meter, also when an attempt failed and was retried', async () => {
    const w = world([cutAfterOutput, ok], { maxRetries: 1 })
    await w.gateway.generate(request())
    const log = reconstruct(w.events)
    const snap = w.meter.snapshot()
    expect(w.meter.unreportedRequests).toBe(1)
    expect(log.unreportedRequests).toBe(w.meter.unreportedRequests)
    expect(log.reportedRequests).toBe(snap.requests)
    expect(log.inputTokens).toBe(snap.inputTokens)
    expect(log.outputTokens).toBe(snap.outputTokens)
  })

  it('the request pressure is on model.call.started, before the provider is called', async () => {
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
  })

  it('a request whose projection overflows the declared context window never reaches the provider and is not charged', async () => {
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
  })
})

const failBeforeOutput: Attempt = async function* () {
  yield* []
  throw new ModelProviderError('fake', 'connection', 'refused')
}

function projectedOf(events: ModelGatewayEvent[]): number[] {
  return events
    .filter((e) => e.type === 'model.call.started')
    .map((e) => e.projectedInputTokens as number)
}

describe('PAR-C02 BUILD (SPEC 0285)', () => {
  it('every started attempt ends in exactly one terminal event, for any mix of failures', async () => {
    for (const plan of [
      [failBeforeOutput, cutAfterOutput, ok],
      [cutAfterOutput, cutAfterOutput, ok],
      [failBeforeOutput, failBeforeOutput, failBeforeOutput],
      [cutAfterOutput, failBeforeOutput, cutAfterOutput]
    ]) {
      const w = world(plan, { maxRetries: 2 })
      await w.gateway.generate(request()).catch(() => undefined)
      const started = w.events.filter((e) => e.type === 'model.call.started')
      for (const s of started) {
        const terminals = w.events.filter(
          (e) =>
            (e.type === 'model.call.completed' ||
              e.type === 'model.call.failed') &&
            e.attempt === s.attempt
        )
        expect(terminals).toHaveLength(1)
      }
      const log = reconstruct(w.events)
      const snap = w.meter.snapshot()
      expect(log.unreportedRequests).toBe(w.meter.unreportedRequests)
      expect(log.reportedRequests).toBe(snap.requests)
      expect(log.inputTokens).toBe(snap.inputTokens)
      expect(log.outputTokens).toBe(snap.outputTokens)
    }
  })

  it('a failure before output that is retried carries no tokens', async () => {
    const w = world([failBeforeOutput, ok], { maxRetries: 1 })
    await w.gateway.generate(request())
    const failed = failedEvents(w.events)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ attempt: 1 })
    expect(failed[0]?.inputTokens).toBeUndefined()
    expect(failed[0]?.detail).toBeUndefined()
  })

  it('the projection is in every started event and counts 4 UTF-8 bytes per token', async () => {
    const small = world([ok])
    await small.gateway.generate(request('abcd'))
    const large = world([ok])
    await large.gateway.generate(request('abcd'.repeat(101)))
    expect(projectedOf(large.events)[0]! - projectedOf(small.events)[0]!).toBe(
      100
    )
    // 'é' is two UTF-8 bytes: two of them weigh as much as four ASCII bytes.
    const multibyte = world([ok])
    await multibyte.gateway.generate(request('éé'))
    expect(projectedOf(multibyte.events)[0]).toBe(projectedOf(small.events)[0])
    const retried = world([cutAfterOutput, ok], { maxRetries: 1 })
    await retried.gateway.generate(request('abcd'))
    expect(projectedOf(retried.events)).toEqual([
      projectedOf(small.events)[0],
      projectedOf(small.events)[0]
    ])
  })

  it('each message adds 4 tokens of framing to the projection', async () => {
    const one = world([ok])
    await one.gateway.generate(request('abcd'))
    const two = world([ok])
    await two.gateway.generate({
      ...request('abcd'),
      input: {
        system: INSTRUCTION,
        messages: [
          { role: 'user', content: 'abcd' },
          { role: 'assistant', content: 'abcd' }
        ]
      }
    })
    expect(projectedOf(two.events)[0]! - projectedOf(one.events)[0]!).toBe(5)
  })

  it('the window boundary: projection plus the request output limit may equal the window, not exceed it', async () => {
    const probe = world([ok])
    await probe.gateway.generate(request())
    const projected = projectedOf(probe.events)[0]!
    const maxTokens = 16
    const fits = world([ok], { contextWindow: projected + maxTokens })
    await expect(
      fits.gateway.generate({ ...request(), maxTokens })
    ).resolves.toBeDefined()
    const over = world([ok], { contextWindow: projected + maxTokens - 1 })
    await expect(
      over.gateway.generate({ ...request(), maxTokens })
    ).rejects.toMatchObject({ code: 'invalid_request', retryable: false })
    expect(over.calls()).toBe(0)
    // Without the request limit, the profile limit (32) applies.
    const profileLimit = world([ok], { contextWindow: projected + maxTokens })
    await expect(
      profileLimit.gateway.generate(request())
    ).rejects.toMatchObject({ code: 'invalid_request' })
  })

  it('a window refusal reserves no budget and emits no call event', async () => {
    const store = new InMemoryCostBudgetStore()
    const events: ModelGatewayEvent[] = []
    let calls = 0
    const gateway = new ModelGateway({
      providers: [
        {
          id: 'fake',
          location: 'local',
          models: ['fake-v1'],
          execute: async () => {
            calls += 1
            throw new Error('unreachable')
          },
          executeStream: () => {
            calls += 1
            return ok({} as ProviderRequest, 1)
          }
        } as never
      ],
      profiles: { fast: profile({ contextWindow: 8, estimatedCostUsd: 1 }) },
      prompts: registry(),
      clock: () => NOW,
      sleep: async () => undefined,
      budget: { store, limits: { tenant: 100 } },
      onEvent: (event) => events.push(event)
    })
    await expect(gateway.generate(request())).rejects.toBeInstanceOf(
      ModelGatewayError
    )
    expect(calls).toBe(0)
    expect(store.consumed(`tenant:${TENANT}`)).toBe(0)
    expect(events.map((e) => e.type)).toEqual([])
  })

  it('a window refusal does not trigger the fallback profile', async () => {
    const events: ModelGatewayEvent[] = []
    let calls = 0
    const gateway = new ModelGateway({
      providers: [
        {
          id: 'fake',
          location: 'local',
          models: ['fake-v1'],
          execute: async () => {
            throw new Error('unreachable')
          },
          executeStream: () => {
            calls += 1
            return ok({} as ProviderRequest, 1)
          }
        } as never
      ],
      profiles: {
        fast: profile({ contextWindow: 8, fallbackProfile: 'balanced' }),
        balanced: profile({ name: 'balanced' })
      },
      routing: { allowFallback: true },
      prompts: registry(),
      clock: () => NOW,
      sleep: async () => undefined,
      onEvent: (event) => events.push(event)
    })
    await expect(gateway.generate(request())).rejects.toMatchObject({
      code: 'invalid_request'
    })
    expect(calls).toBe(0)
    expect(events.some((e) => e.type === 'model.routing.fallback')).toBe(false)
  })

  it('an invalid declared window fails the construction', () => {
    for (const contextWindow of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.MAX_SAFE_INTEGER + 1
    ]) {
      expect(
        () =>
          new ModelGateway({
            providers: [],
            profiles: { fast: profile({ contextWindow }) },
            prompts: registry()
          })
      ).toThrow(ModelGatewayError)
    }
  })
})

describe('PAR-C02 review regressions (Codex 17895, note 0285b)', () => {
  const expectReconstructed = (
    events: ModelGatewayEvent[],
    meter: TokenMeter
  ) => {
    const log = reconstruct(events)
    const snap = meter.snapshot()
    expect(log.unreportedRequests).toBe(meter.unreportedRequests)
    expect(log.reportedRequests).toBe(snap.requests)
    expect(log.inputTokens).toBe(snap.inputTokens)
    expect(log.outputTokens).toBe(snap.outputTokens)
  }

  it('a failed attempt whose usage the provider reported is reconstructed as measured', async () => {
    const w = world([ok])
    await expect(
      w.gateway.generate({
        ...request(),
        structuredOutput: {
          schemaName: 'c02',
          schema: z.object({ never: z.literal(true) })
        }
      })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
    const failed = failedEvents(w.events)
    expect(failed).toHaveLength(1)
    expect(failed[0]).toMatchObject({ inputTokens: 7, outputTokens: 3 })
    expect(w.meter.snapshot().requests).toBe(1)
    expectReconstructed(w.events, w.meter)
  })

  it('an unreported success over the cost ceiling keeps both flags and stays unknown', async () => {
    const w = world(
      [
        async function* () {
          yield { type: 'delta', text: 'sem contagem' }
          yield { type: 'finish', reason: 'stop' }
        }
      ],
      { maxCostUsd: 0.0001 }
    )
    await w.gateway.generate(request())
    const completed = w.events.find((e) => e.type === 'model.call.completed')
    expect(completed?.detail?.split(',')).toEqual([
      'usage_unreported',
      'cost_ceiling_exceeded'
    ])
    expect(w.meter.unreportedRequests).toBe(1)
    expectReconstructed(w.events, w.meter)
  })
})
