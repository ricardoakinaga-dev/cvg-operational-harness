import { createHash } from 'node:crypto'
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

/**
 * PAR-M02 / SPEC 0289. The request the gateway hands to an adapter is frozen,
 * and the event log identifies it byte for byte. Phase 1 wrote these as
 * `it.fails`; the BUILD flipped them. Synthetic data only.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-0000000d0289'
const INSTRUCTION = 'Approved synthetic instruction for the frozen request.'
const NOW = new Date('2026-10-29T00:00:00.000Z')

function registry(): PromptRegistry {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'frozen-synthetic',
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
    maxRetries: 1,
    pricing: { inputPer1kUsd: 1, outputPer1kUsd: 1 },
    ...overrides
  } as ModelProfile
}

function request(): ModelGatewayRequest {
  return {
    requestId: 'req_par_m02',
    tenantId: TENANT,
    correlationId: 'corr_par_m02',
    promptId: 'frozen-synthetic',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: {
      system: INSTRUCTION,
      messages: [{ role: 'user', content: 'Synthetic input only' }]
    },
    metadata: { b: '2', a: '1' }
  }
}

const ok = (req: ProviderRequest): ProviderResult => ({
  text: 'ok',
  usage: { inputTokens: 1, outputTokens: 1 },
  providerId: 'fake',
  model: req.model,
  externalCall: false
})
const unavailable = () => new ModelProviderError('fake', 'unavailable', 'down')

type Adapter = (req: ProviderRequest, call: number) => Promise<ProviderResult>

function world(adapter: Adapter, options: Record<string, unknown> = {}) {
  const events: ModelGatewayEvent[] = []
  const seen: ProviderRequest[] = []
  let calls = 0
  const provider = {
    id: 'fake',
    location: 'local' as const,
    models: ['fake-v1', 'fake-v2'],
    execute: async (req: ProviderRequest) => {
      calls += 1
      seen.push(req)
      return adapter(req, calls)
    }
  }
  const gateway = new ModelGateway({
    providers: [provider as never],
    profiles: {
      fast: profile({ fallbackProfile: 'balanced' }),
      balanced: profile({ name: 'balanced', model: 'fake-v2' })
    },
    routing: { allowFallback: true },
    prompts: registry(),
    clock: () => NOW,
    sleep: async () => undefined,
    onEvent: (event: ModelGatewayEvent) => events.push(event),
    ...options
  } as never)
  return { gateway, events, seen }
}

/** The target canonical form `frozen-request-v1` (SPEC 0289 §3.2), built here independently of the gateway. */
function canonical(req: ProviderRequest): string {
  const b = req.promptBinding!
  return JSON.stringify({
    v: 'frozen-request-v1',
    requestId: req.requestId,
    tenantId: req.tenantId,
    correlationId: req.correlationId,
    model: req.model,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    timeoutMs: req.timeoutMs,
    promptSha256: req.promptSha256,
    promptBinding: {
      promptId: b.promptId,
      promptVersion: b.promptVersion,
      registrySha256: b.registrySha256,
      rendererVersion: b.rendererVersion,
      instructionSha256: b.instructionSha256,
      renderedInputSha256: b.renderedInputSha256
    },
    structuredSchemaName: req.structuredSchemaName ?? null,
    metadata: req.metadata
      ? Object.entries(req.metadata).sort(([a], [b]) => (a < b ? -1 : 1))
      : null,
    input: {
      system: req.input.system,
      messages: req.input.messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    }
  })
}
const field = (e: ModelGatewayEvent, name: string) =>
  (e as unknown as Record<string, unknown>)[name]
const sha = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex')

describe('PAR-M02 controls (pass before and after)', () => {
  it('the rendered input is already deeply frozen', async () => {
    const w = world(async (req) => ok(req))
    await w.gateway.generate(request())
    const input = w.seen[0]!.input
    expect(Object.isFrozen(input)).toBe(true)
    expect(Object.isFrozen(input.messages)).toBe(true)
    expect(Object.isFrozen(input.messages[0])).toBe(true)
  })
  it('the started event carries the projected size and no request content', async () => {
    const w = world(async (req) => ok(req))
    await w.gateway.generate(request())
    const started = w.events.find((e) => e.type === 'model.call.started')!
    expect(started.projectedInputTokens).toBeGreaterThan(0)
    for (const e of w.events) {
      expect(field(e, 'frozenRequest')).toBeUndefined()
      expect(JSON.stringify(e)).not.toContain('Synthetic input only')
    }
  })
  it('a request refused before dispatch leaves no request identity and never reaches the adapter', async () => {
    const w = world(async (req) => ok(req), { recordFrozenRequests: true })
    await expect(
      w.gateway.generate({
        ...request(),
        input: {
          system: 'tampered instruction',
          messages: [{ role: 'user', content: 'x' }]
        }
      })
    ).rejects.toBeDefined()
    expect(w.seen).toHaveLength(0)
    expect(
      w.events.filter((e) => e.type === 'model.call.started')
    ).toHaveLength(0)
    expect(w.events.every((e) => field(e, 'frozenRequest') === undefined)).toBe(
      true
    )
    expect(w.events.every((e) => field(e, 'requestSha256') === undefined)).toBe(
      true
    )
  })
})

describe('PAR-M02 target: the adapter receives a frozen request', () => {
  it('the request and everything it nests is deeply frozen', async () => {
    const w = world(async (req) => ok(req))
    await w.gateway.generate(request())
    const req = w.seen[0]!
    expect(Object.isFrozen(req)).toBe(true)
    expect(Object.isFrozen(req.metadata)).toBe(true)
    expect(Object.isFrozen(req.promptBinding)).toBe(true)
    expect(Object.isFrozen(req.input)).toBe(true)
  })

  it('a rewrite attempt does not take and a retry sees the original values', async () => {
    const original = canonical((await probe()).seen[0]!)
    const rewrites: string[] = []
    const atEntry: string[] = []
    const w = world(async (req, call) => {
      if (call === 1) {
        for (const attemptRewrite of [
          () => ((req as { maxTokens: number }).maxTokens = 1),
          () => ((req as { model: string }).model = 'rewritten'),
          () => ((req.metadata as Record<string, string>).a = 'rewritten'),
          () =>
            ((
              req.promptBinding as { renderedInputSha256: string }
            ).renderedInputSha256 = '0'.repeat(64))
        ]) {
          try {
            attemptRewrite()
          } catch {
            rewrites.push('threw')
          }
        }
        throw unavailable()
      }
      atEntry.push(canonical(req))
      return ok(req)
    })
    const result = await w.gateway.generate(request())
    expect(result.attempts).toBe(2)
    // every write of a strict-mode adapter is blocked ...
    expect(rewrites).toEqual(['threw', 'threw', 'threw', 'threw'])
    // ... and the retry receives, on entry, exactly the original bytes
    expect(atEntry).toEqual([original])
    expect(canonical(w.seen[0]!)).toBe(original)
  })

  it('a rewrite in the first candidate does not reach the fallback candidate', async () => {
    const w = world(async (req) => {
      if (req.model === 'fake-v1') {
        try {
          ;(req.metadata as Record<string, string>).a = 'rewritten'
          ;(
            req.promptBinding as { instructionSha256: string }
          ).instructionSha256 = '1'.repeat(64)
        } catch {
          /* a frozen request throws in strict mode */
        }
        throw unavailable()
      }
      return ok(req)
    })
    await w.gateway.generate(request()).catch(() => undefined)
    const fallback = w.seen.find((r) => r.model === 'fake-v2')
    expect(fallback?.metadata?.a).toBe('1')
    expect(fallback?.promptBinding?.instructionSha256).not.toBe('1'.repeat(64))
  })
})

async function probe() {
  const w = world(async (req) => ok(req))
  await w.gateway.generate(request())
  return w
}

describe('PAR-M02 target: the log identifies the request byte for byte', () => {
  it('model.call.started carries the digest and size of the canonical request', async () => {
    const w = await probe()
    const started = w.events.find((e) => e.type === 'model.call.started')!
    const text = canonical(w.seen[0]!)
    expect(field(started, 'requestSha256')).toBe(sha(text))
    expect(field(started, 'requestBytes')).toBe(Buffer.byteLength(text, 'utf8'))
  })

  it('with recording on, the event carries the exact bytes and they rebuild the digest', async () => {
    const w = world(async (req) => ok(req), { recordFrozenRequests: true })
    await w.gateway.generate(request())
    const started = w.events.find((e) => e.type === 'model.call.started')!
    const text = canonical(w.seen[0]!)
    expect(field(started, 'frozenRequest')).toBe(text)
    expect(sha(field(started, 'frozenRequest') as string)).toBe(
      field(started, 'requestSha256')
    )
  })

  it('the digest is stable across attempts of one candidate and differs for the fallback', async () => {
    const w = world(async (req, call) => {
      if (call <= 2) throw unavailable()
      return ok(req)
    })
    await w.gateway.generate(request())
    const digests = w.events
      .filter((e) => e.type === 'model.call.started')
      .map((e) => [e.profile, field(e, 'requestSha256')])
    expect(digests).toHaveLength(3)
    expect(digests[0]![1]).toBeDefined()
    expect(digests[0]![1]).toBe(digests[1]![1])
    expect(digests[2]![1]).not.toBe(digests[0]![1])
  })
})

describe('PAR-M02 BUILD: further properties of the frozen request', () => {
  it('a streaming candidate receives the same frozen request', async () => {
    const seen: ProviderRequest[] = []
    const events: ModelGatewayEvent[] = []
    const gateway = new ModelGateway({
      providers: [
        {
          id: 'fake',
          location: 'local',
          models: ['fake-v1'],
          execute: async () => {
            throw new Error('unreachable')
          },
          executeStream: async function* (req: ProviderRequest) {
            seen.push(req)
            yield { type: 'delta', text: 'ok' }
            yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
            yield { type: 'finish', reason: 'stop' }
          }
        } as never
      ],
      profiles: { fast: profile({ streaming: true }) },
      prompts: registry(),
      clock: () => NOW,
      sleep: async () => undefined,
      onEvent: (e: ModelGatewayEvent) => events.push(e)
    } as never)
    await gateway.generate(request())
    const req = seen[0]!
    expect(Object.isFrozen(req)).toBe(true)
    expect(Object.isFrozen(req.metadata)).toBe(true)
    expect(Object.isFrozen(req.promptBinding)).toBe(true)
    const started = events.find((e) => e.type === 'model.call.started')!
    expect(field(started, 'requestSha256')).toBe(sha(canonical(req)))
  })

  it('the identity counts UTF-8 bytes, not characters', async () => {
    const w = world(async (req) => ok(req))
    await w.gateway.generate({
      ...request(),
      input: {
        system: INSTRUCTION,
        messages: [{ role: 'user', content: 'ação — 日本語 😀' }]
      }
    })
    const started = w.events.find((e) => e.type === 'model.call.started')!
    const text = canonical(w.seen[0]!)
    expect(field(started, 'requestBytes')).toBe(Buffer.byteLength(text, 'utf8'))
    expect(Buffer.byteLength(text, 'utf8')).toBeGreaterThan(text.length)
  })

  it('metadata key order does not change the digest, and a changed value does', async () => {
    const digest = async (metadata: Record<string, string> | undefined) => {
      const w = world(async (req) => ok(req))
      const r = { ...request() }
      if (metadata) r.metadata = metadata
      else delete (r as { metadata?: unknown }).metadata
      await w.gateway.generate(r)
      return field(
        w.events.find((e) => e.type === 'model.call.started')!,
        'requestSha256'
      )
    }
    const base = await digest({ a: '1', b: '2' })
    expect(await digest({ b: '2', a: '1' })).toBe(base)
    expect(await digest({ a: '1', b: '3' })).not.toBe(base)
    expect(await digest(undefined)).not.toBe(base)
  })

  it('the structured schema name is part of the identity', async () => {
    const { z } = await import('zod')
    const w1 = world(async (req) => ({ ...ok(req), text: '{"a":1}' }))
    await w1.gateway.generate({
      ...request(),
      structuredOutput: {
        schemaName: 'schema-one',
        schema: z.object({ a: z.number() })
      }
    })
    const w2 = world(async (req) => ({ ...ok(req), text: '{"a":1}' }))
    await w2.gateway.generate({
      ...request(),
      structuredOutput: {
        schemaName: 'schema-two',
        schema: z.object({ a: z.number() })
      }
    })
    const d = (w: ReturnType<typeof world>) =>
      field(
        w.events.find((e) => e.type === 'model.call.started')!,
        'requestSha256'
      )
    expect(d(w1)).toBeDefined()
    expect(d(w1)).not.toBe(d(w2))
    expect(canonical(w1.seen[0]!)).toContain(
      '"structuredSchemaName":"schema-one"'
    )
  })

  it('recording on or off never changes the digest, and off never emits the bytes', async () => {
    const off = world(async (req) => ok(req))
    const on = world(async (req) => ok(req), { recordFrozenRequests: true })
    await off.gateway.generate(request())
    await on.gateway.generate(request())
    const pick = (w: ReturnType<typeof world>) =>
      w.events.find((e) => e.type === 'model.call.started')!
    expect(field(pick(off), 'requestSha256')).toBe(
      field(pick(on), 'requestSha256')
    )
    expect(field(pick(off), 'frozenRequest')).toBeUndefined()
    expect(typeof field(pick(on), 'frozenRequest')).toBe('string')
    // only model.call.started ever carries the bytes
    for (const e of on.events.filter((x) => x.type !== 'model.call.started')) {
      expect(field(e, 'frozenRequest')).toBeUndefined()
    }
  })

  it('freezing is linear: a very large metadata map is frozen a constant number of times', async () => {
    const metadata: Record<string, string> = {}
    for (let i = 0; i < 5_000; i += 1) metadata[`k${i}`] = 'v'
    const freezeCalls: unknown[] = []
    const real = Object.freeze
    Object.freeze = ((value: unknown) => {
      freezeCalls.push(value)
      return real(value as object)
    }) as typeof Object.freeze
    try {
      const w = world(async (req) => ok(req))
      await w.gateway.generate({ ...request(), metadata })
      expect(Object.isFrozen(w.seen[0]!.metadata)).toBe(true)
    } finally {
      Object.freeze = real
    }
    const bigMaps = freezeCalls.filter(
      (v) => v && typeof v === 'object' && Object.keys(v).length >= 5_000
    )
    expect(bigMaps.length).toBeLessThanOrEqual(2)
    expect(freezeCalls.length).toBeLessThan(200)
  })

  it('a retry and the fallback share the immutable parts but each gets its own signal', async () => {
    const w = world(async (req, call) => {
      if (call <= 2) throw unavailable()
      return ok(req)
    })
    await w.gateway.generate(request())
    expect(w.seen).toHaveLength(3)
    expect(w.seen[0]).not.toBe(w.seen[1])
    expect(w.seen[0]!.signal).not.toBe(w.seen[1]!.signal)
    for (const r of w.seen) expect(Object.isFrozen(r)).toBe(true)
  })
})
