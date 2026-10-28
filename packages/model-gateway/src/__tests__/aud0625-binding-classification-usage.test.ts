// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { InMemoryCostBudgetStore } from '../budget.ts'
import type {
  ModelGatewayRequest,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { ModelProviderError } from '../errors.ts'
import { ModelGateway } from '../gateway.ts'
import { PromptRegistry } from '../prompt-registry.ts'
import { OpenAICompatibleProvider } from '../providers/openai-compatible.ts'
import { TokenMeter } from '../token-meter.ts'

/**
 * SPEC 0267 (PROPOSED_FOR_HUMAN_T3_REVIEW) characterization of AUD-0625
 * F06, F10 and F11. Tests marked `it.fails` assert the TARGET behavior: they
 * pass today because the defect exists, and become plain `it` in the BUILD
 * after the T3 approval. Plain `it` tests are good controls that hold before
 * and after. Synthetic data only; fake providers and fake fetch, zero egress.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-28T00:00:00.000Z')
const INSTRUCTION_A = 'Approved synthetic instruction A.'
const INSTRUCTION_B = 'Different synthetic instruction B.'

type Classification = 'INTERNAL' | 'CONFIDENTIAL' | 'CLINICAL'
type Location = 'local' | 'external'

function registry(
  classification: Classification = 'INTERNAL',
  status: 'approved' | 'revoked' = 'approved'
): PromptRegistry {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'audit-synthetic',
    version: '1.0.0',
    content: INSTRUCTION_A,
    owner: 'platform',
    approvedBy: 'reviewer',
    status,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification,
    tenantId: TENANT
  })
  return prompts
}

function approvedSha256(prompts: PromptRegistry): string {
  return prompts.resolve(
    { promptId: 'audit-synthetic', version: '1.0.0' },
    { tenantId: TENANT, at: NOW }
  ).sha256
}

function request(
  overrides: Partial<ModelGatewayRequest> = {}
): ModelGatewayRequest {
  return {
    requestId: 'req_audit_0625',
    tenantId: TENANT,
    correlationId: 'corr_audit_0625',
    promptId: 'audit-synthetic',
    promptVersion: '1.0.0',
    modelProfile: 'fast',
    dataClassification: 'INTERNAL',
    input: {
      system: INSTRUCTION_A,
      messages: [{ role: 'user', content: 'Synthetic input only' }]
    },
    ...overrides
  }
}

function fakeProvider(
  id: string,
  location: Location,
  seen: ProviderRequest[],
  result: Partial<ProviderResult> = {}
) {
  return {
    id,
    location,
    models: ['fake-v1'],
    execute: async (input: ProviderRequest): Promise<ProviderResult> => {
      seen.push(input)
      return {
        text: 'synthetic response',
        usage: { inputTokens: 1, outputTokens: 1 },
        providerId: id,
        model: 'fake-v1',
        externalCall: location === 'external',
        ...result
      }
    }
  }
}

function profile(
  name: 'fast' | 'local',
  providerId: string,
  location: Location,
  overrides: Partial<ModelProfile> = {}
): ModelProfile {
  return {
    name,
    providerId,
    model: 'fake-v1',
    location,
    temperature: 0,
    maxTokens: 32,
    timeoutMs: 1000,
    maxCostUsd: 100,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 },
    ...overrides
  }
}

function gateway(
  prompts: PromptRegistry,
  location: Location,
  seen: ProviderRequest[],
  options: Partial<ConstructorParameters<typeof ModelGateway>[0]> = {},
  providerResult: Partial<ProviderResult> = {},
  profileOverrides: Partial<ModelProfile> = {}
) {
  return new ModelGateway({
    providers: [fakeProvider('fake', location, seen, providerResult)],
    profiles: { fast: profile('fast', 'fake', location, profileOverrides) },
    prompts,
    clock: () => NOW,
    ...options
  })
}

describe('AUD0625 F06 — prompt hash binds the instruction sent to the provider', () => {
  it('control: a revoked prompt is refused without dispatch', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('INTERNAL', 'revoked'), 'local', seen).generate(
        request()
      )
    ).rejects.toMatchObject({ code: 'prompt_revoked' })
    expect(seen).toHaveLength(0)
  })

  it('control: a system byte-identical to the approved text is delivered with its hash and the dynamic messages in order', async () => {
    const seen: ProviderRequest[] = []
    const prompts = registry()
    const messages = [
      { role: 'user' as const, content: 'first dynamic' },
      { role: 'assistant' as const, content: 'second dynamic' },
      { role: 'user' as const, content: 'third dynamic' }
    ]
    await gateway(prompts, 'local', seen).generate(
      request({ input: { system: INSTRUCTION_A, messages } })
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]?.input.system).toBe(INSTRUCTION_A)
    expect(seen[0]?.input.messages).toEqual(messages)
    expect(seen[0]?.promptSha256).toBe(approvedSha256(prompts))
  })

  it('control: dynamic user data differing from anything approved is still allowed', async () => {
    const seen: ProviderRequest[] = []
    await gateway(registry(), 'local', seen).generate(
      request({
        input: {
          system: INSTRUCTION_A,
          messages: [{ role: 'user', content: 'arbitrary user data B' }]
        }
      })
    )
    expect(seen).toHaveLength(1)
  })

  it('refuses a divergent system with prompt_content_mismatch before the provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry(), 'local', seen).generate(
        request({
          input: {
            system: INSTRUCTION_B,
            messages: [{ role: 'user', content: 'Synthetic input only' }]
          }
        })
      )
    ).rejects.toMatchObject({ code: 'prompt_content_mismatch' })
    expect(seen).toHaveLength(0)
  })

  it('refuses a divergent system-role message before the provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry(), 'local', seen).generate(
        request({
          input: {
            system: INSTRUCTION_A,
            messages: [
              { role: 'system', content: INSTRUCTION_B },
              { role: 'user', content: 'Synthetic input only' }
            ]
          }
        })
      )
    ).rejects.toMatchObject({ code: 'prompt_content_mismatch' })
    expect(seen).toHaveLength(0)
  })

  it('renders exactly the approved instruction when the caller supplies none', async () => {
    const seen: ProviderRequest[] = []
    await gateway(registry(), 'local', seen).generate(
      request({
        input: {
          messages: [{ role: 'user', content: 'Synthetic input only' }]
        }
      })
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]?.input.system).toBe(INSTRUCTION_A)
  })

  it('hands the provider a binding whose digests match the approved and rendered material', async () => {
    const seen: ProviderRequest[] = []
    const prompts = registry()
    const messages = [
      { role: 'user' as const, content: 'Synthetic input only' }
    ]
    await gateway(prompts, 'local', seen).generate(
      request({ input: { system: INSTRUCTION_A, messages } })
    )
    const material = JSON.stringify({
      rendererVersion: 'literal-v1',
      system: INSTRUCTION_A,
      messages
    })
    expect(
      (seen[0] as { promptBinding?: unknown } | undefined)?.promptBinding
    ).toMatchObject({
      rendererVersion: 'literal-v1',
      instructionSha256: approvedSha256(prompts),
      renderedInputSha256: createHash('sha256').update(material).digest('hex')
    })
  })
})

describe('AUD0625 F10 — effective classification is the strictest of registry and request', () => {
  it('control: a CLINICAL request is refused before an external provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('CLINICAL'), 'external', seen).generate(
        request({ dataClassification: 'CLINICAL' })
      )
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })

  it('control: INTERNAL registry and INTERNAL request reach an external provider', async () => {
    const seen: ProviderRequest[] = []
    await gateway(registry('INTERNAL'), 'external', seen).generate(request())
    expect(seen).toHaveLength(1)
  })

  it('control: a request broader than the approved prompt class stays refused', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('INTERNAL'), 'local', seen).generate(
        request({ dataClassification: 'CLINICAL' })
      )
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })

  it('control: CONFIDENTIAL registry with an INTERNAL request may use a local provider', async () => {
    const seen: ProviderRequest[] = []
    await gateway(registry('CONFIDENTIAL'), 'local', seen).generate(request())
    expect(seen).toHaveLength(1)
  })

  it('refuses a CLINICAL registry with an INTERNAL request before an external provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('CLINICAL'), 'external', seen).generate(request())
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })

  it('does not let the schema default INTERNAL loosen a CLINICAL prompt', async () => {
    const seen: ProviderRequest[] = []
    const omitted = request() as Partial<ModelGatewayRequest>
    delete omitted.dataClassification
    await expect(
      gateway(registry('CLINICAL'), 'external', seen).generate(
        omitted as ModelGatewayRequest
      )
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })

  it('routes by the effective class: opt-in local substitution replaces the external profile', async () => {
    const externalSeen: ProviderRequest[] = []
    const localSeen: ProviderRequest[] = []
    const g = new ModelGateway({
      providers: [
        fakeProvider('ext', 'external', externalSeen),
        fakeProvider('loc', 'local', localSeen)
      ],
      profiles: {
        fast: profile('fast', 'ext', 'external'),
        local: profile('local', 'loc', 'local')
      },
      prompts: registry('CONFIDENTIAL'),
      routing: { allowLocalSubstitution: true },
      clock: () => NOW
    })
    await g.generate(request())
    expect(externalSeen).toHaveLength(0)
    expect(localSeen).toHaveLength(1)
  })
})

describe('AUD0625 F11 — unknown usage is not zero and a rejected output is still accounted', () => {
  function openAiProvider(body: unknown) {
    return new OpenAICompatibleProvider({
      id: 'synthetic-http',
      baseUrl: 'https://synthetic.audit.invalid',
      model: 'fake-v1',
      location: 'local',
      dnsLookup: async () => ['93.184.216.34'],
      fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 })
    })
  }
  const providerRequest: ProviderRequest = {
    requestId: 'req_audit_0625',
    tenantId: TENANT,
    correlationId: 'corr_audit_0625',
    model: 'fake-v1',
    input: request().input,
    temperature: 0,
    maxTokens: 32,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs: 1000
  }

  it('control: reported usage is preserved by the adapter', async () => {
    const result = await openAiProvider({
      choices: [{ message: { content: 'synthetic' } }],
      usage: { prompt_tokens: 7, completion_tokens: 3 }
    }).execute(providerRequest)
    expect(result.usage).toEqual({ inputTokens: 7, outputTokens: 3 })
  })

  it('control: an explicit reported zero stays a zero', async () => {
    const result = await openAiProvider({
      choices: [{ message: { content: 'synthetic' } }],
      usage: { prompt_tokens: 0, completion_tokens: 0 }
    }).execute(providerRequest)
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('does not fabricate 0/0 when the response carries no usage', async () => {
    const result = await openAiProvider({
      choices: [{ message: { content: 'synthetic' } }]
    }).execute(providerRequest)
    expect(result.usage).not.toEqual({ inputTokens: 0, outputTokens: 0 })
  })

  it('marks the gateway result as unreported and charges at least the reservation when usage is absent', async () => {
    const seen: ProviderRequest[] = []
    const store = new InMemoryCostBudgetStore()
    const g = gateway(
      registry(),
      'local',
      seen,
      { budget: { store, limits: { tenant: 100 } } },
      { usage: undefined as never },
      { estimatedCostUsd: 0.5 }
    )
    const result = await g.generate(
      request({
        input: {
          system: INSTRUCTION_A,
          messages: [{ role: 'user', content: 'x' }]
        }
      })
    )
    expect((result as { usageStatus?: string }).usageStatus).toBe('unreported')
    expect(store.consumed(`tenant:${TENANT}`)).toBeGreaterThanOrEqual(0.5)
  })

  const structured = {
    schemaName: 'synthetic',
    schema: z.object({ ok: z.literal(true) })
  }
  const rejectedOutput = {
    text: 'not json',
    usage: { inputTokens: 1000, outputTokens: 500 }
  }

  it('control: an invalid structured output is rejected with schema_invalid', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry(), 'local', seen, {}, rejectedOutput).generate({
        ...request({
          input: {
            system: INSTRUCTION_A,
            messages: [{ role: 'user', content: 'x' }]
          }
        }),
        structuredOutput: structured
      })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
  })

  it('records the usage of a call whose output was rejected in the meter', async () => {
    const seen: ProviderRequest[] = []
    const meter = new TokenMeter()
    await expect(
      gateway(registry(), 'local', seen, { meter }, rejectedOutput).generate({
        ...request({
          input: {
            system: INSTRUCTION_A,
            messages: [{ role: 'user', content: 'x' }]
          }
        }),
        structuredOutput: structured
      })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
    expect(meter.snapshot()).toMatchObject({
      inputTokens: 1000,
      outputTokens: 500
    })
  })

  it('charges the real cost of a call whose output was rejected when it exceeds the reservation', async () => {
    const seen: ProviderRequest[] = []
    const store = new InMemoryCostBudgetStore()
    await expect(
      gateway(
        registry(),
        'local',
        seen,
        { budget: { store, limits: { tenant: 100 } } },
        rejectedOutput,
        {
          estimatedCostUsd: 0,
          pricing: { inputPer1kUsd: 1, outputPer1kUsd: 1 }
        }
      ).generate({
        ...request({
          input: {
            system: INSTRUCTION_A,
            messages: [{ role: 'user', content: 'x' }]
          }
        }),
        structuredOutput: structured
      })
    ).rejects.toMatchObject({ code: 'schema_invalid' })
    expect(store.consumed(`tenant:${TENANT}`)).toBeCloseTo(1.5, 6)
  })
})

describe('AUD0625 F10 — a prompt class that forbids every model stays forbidden', () => {
  it('refuses a CLINICAL registry with an INTERNAL request even on a local provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('CLINICAL'), 'local', seen).generate(request())
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })

  it('refuses a CONFIDENTIAL registry with an INTERNAL request on an external provider', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry('CONFIDENTIAL'), 'external', seen).generate(request())
    ).rejects.toMatchObject({ code: 'policy_denied' })
    expect(seen).toHaveLength(0)
  })
})

describe('AUD0625 SPEC 0267 BUILD — revocation, ordering and adapters', () => {
  it('refuses a prompt revoked between attempts instead of retrying', async () => {
    const prompts = registry()
    const seen: ProviderRequest[] = []
    const provider = {
      id: 'fake',
      location: 'local' as const,
      models: ['fake-v1'],
      execute: async (input: ProviderRequest): Promise<ProviderResult> => {
        seen.push(input)
        const record = prompts.get('audit-synthetic', '1.0.0')
        if (record) record.status = 'revoked'
        throw new ModelProviderError('fake', 'unavailable', 'synthetic 503')
      }
    }
    const g = new ModelGateway({
      providers: [provider],
      profiles: { fast: profile('fast', 'fake', 'local', { maxRetries: 2 }) },
      prompts,
      clock: () => NOW,
      sleep: async () => undefined
    })
    await expect(g.generate(request())).rejects.toMatchObject({
      code: 'prompt_revoked'
    })
    expect(seen).toHaveLength(1)
  })

  it('refuses a divergent instruction before any budget reservation', async () => {
    const store = new InMemoryCostBudgetStore()
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry(), 'local', seen, {
        budget: { store, limits: { tenant: 100 } }
      }).generate(
        request({
          input: {
            system: INSTRUCTION_B,
            messages: [{ role: 'user', content: 'x' }]
          }
        })
      )
    ).rejects.toMatchObject({ code: 'prompt_content_mismatch' })
    expect(store.consumed(`tenant:${TENANT}`)).toBe(0)
  })

  it('accepts one byte-identical system message and renders a single system', async () => {
    const seen: ProviderRequest[] = []
    await gateway(registry(), 'local', seen).generate(
      request({
        input: {
          messages: [
            { role: 'system', content: INSTRUCTION_A },
            { role: 'user', content: 'x' }
          ]
        }
      })
    )
    expect(seen[0]?.input.system).toBe(INSTRUCTION_A)
    expect(seen[0]?.input.messages).toEqual([{ role: 'user', content: 'x' }])
  })

  it('does not normalize: a trailing newline or decomposed Unicode is a mismatch', async () => {
    const seen: ProviderRequest[] = []
    await expect(
      gateway(registry(), 'local', seen).generate(
        request({
          input: {
            system: `${INSTRUCTION_A}\n`,
            messages: [{ role: 'user', content: 'x' }]
          }
        })
      )
    ).rejects.toMatchObject({ code: 'prompt_content_mismatch' })
  })

  it('has the adapters refuse a tampered rendered input before the wire', async () => {
    const seen: ProviderRequest[] = []
    const g = gateway(registry(), 'local', seen)
    await g.generate(request())
    const good = seen[0] as ProviderRequest
    let fetched = 0
    const adapter = new OpenAICompatibleProvider({
      id: 'synthetic-http',
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
        input: { ...good.input, system: INSTRUCTION_B }
      })
    ).rejects.toMatchObject({ kind: 'invalid_request' })
    await expect(
      adapter.execute({
        ...good,
        input: {
          ...good.input,
          messages: [
            { role: 'system', content: INSTRUCTION_B },
            ...good.input.messages
          ]
        }
      })
    ).rejects.toMatchObject({ kind: 'invalid_request' })
    expect(fetched).toBe(0)
  })
})
