import { describe, expect, it } from 'vitest'
import { estimateInputTokens } from '@cvg/shared'
import { estimateInputTokens as fromContracts } from '@cvg/harness-contracts'
import type {
  ModelGatewayEvent,
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { ModelGatewayError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import type { ProviderStreamEvent } from '../stream.ts'
import { TokenMeter } from '../token-meter.ts'

/**
 * PAR-C01 / SPEC 0290 slice 3: the context-window refusal of the gateway
 * carries the additive `reason: 'context_window'` (the code stays
 * `invalid_request`), and the pressure estimate is the one shared with the
 * harness. Synthetic data only.
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

describe('PAR-C01 slice 3: gateway window refusal and shared estimator', () => {
  it('marks the window refusal with reason context_window and keeps the code', async () => {
    const w = world([ok], { contextWindow: 64 })
    const error = await w.gateway
      .generate(request('x'.repeat(4_000)))
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ModelGatewayError)
    expect(error).toMatchObject({
      code: 'invalid_request',
      retryable: false,
      reason: 'context_window'
    })
    expect((error as Error).message).toBe(
      'Request does not fit the context window of profile fast'
    )
    expect(w.calls()).toBe(0)
  })

  it('other refusals carry no reason', async () => {
    const w = world([ok])
    const error = await w.gateway
      .generate({ ...request(), promptVersion: '9.9.9' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ModelGatewayError)
    expect((error as ModelGatewayError).reason).toBeUndefined()
    expect(new ModelGatewayError('invalid_request', 'x').reason).toBeUndefined()
  })

  it('projects with the estimator shared with the harness, bytes and framing included', async () => {
    expect(estimateInputTokens).toBe(fromContracts)
    const content = 'ação clínica sintética: ' + 'ç'.repeat(40)
    const w = world([ok])
    await w.gateway.generate(request(content))
    const projected = w.events
      .map((e) => e.projectedInputTokens)
      .find((n) => n !== undefined)
    expect(projected).toBe(estimateInputTokens([INSTRUCTION, content]))
    expect(estimateInputTokens([])).toBe(0)
    expect(estimateInputTokens(['ab', 'çã'])).toBe(1 + 1 + 8)
    expect(estimateInputTokens([''])).toBe(4)
  })
})
