import { describe, expect, it, vi } from 'vitest'
import { createRealCapabilityGuards } from '@cvg/shared'
import {
  AgentConfigSchema,
  assertComposedKnowledgeResolver,
  composeRealKnowledgeResolver,
  composeSyntheticKnowledgeResolver,
  createSyntheticKnowledgeResolver,
  executeConfiguredAgent,
  InMemoryControlPlaneStore,
  knowledgeExcerptSha256,
  PluginRegistry,
  CapabilityGateway,
  TenantIdSchema,
  TestLabCaseSchema,
  evaluatePlatformPolicy,
  type ApprovedKnowledgeResolution,
  type ApprovedKnowledgeResolver
} from '../index.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000141'
)
const otherTenant = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000142'
)
const source = 'controlled://institutional-hours'
const answer = 'Horário fictício.'
const QUESTION = 'Qual o horário de funcionamento?'

function createConfig() {
  return AgentConfigSchema.parse({
    persona: { name: 'Knowledge Boundary', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [
      {
        id: 'system',
        kind: 'system',
        content: 'Use somente fontes controladas.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: {
      institutional_question: 'Resposta institucional controlada.'
    },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/fake'
    },
    policies: {
      version: 'knowledge-boundary-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'institutional_question'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [
      { source, version: 'v1', enabled: true, requiresApprovedSource: true }
    ],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

async function createFixture() {
  const store = new InMemoryControlPlaneStore()
  const agent = await store.createAgent(
    { tenantId },
    {
      slug: 'knowledge-boundary',
      name: 'Knowledge Boundary',
      description: 'Controlled knowledge input fixture'
    }
  )
  const version = await store.createVersion(
    { tenantId },
    agent.id,
    createConfig(),
    'test.knowledge-boundary'
  )
  return { store, agent, version }
}

function resolution(
  overrides: Partial<ApprovedKnowledgeResolution> = {},
  provenance: Partial<ApprovedKnowledgeResolution['provenance']> = {}
): ApprovedKnowledgeResolution {
  return {
    tenantId,
    version: 'v1',
    answer,
    source,
    ...overrides,
    provenance: {
      recordId: 'record-1',
      status: 'approved',
      approvedAt: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: null,
      excerptSha256: knowledgeExcerptSha256(overrides.answer ?? answer),
      ...provenance
    }
  }
}

async function run(
  resolveApprovedKnowledge: ApprovedKnowledgeResolver | undefined,
  extra: { knowledgeTimeoutMs?: number; message?: string } = {}
) {
  const fixture = await createFixture()
  return executeConfiguredAgent({
    store: fixture.store,
    tenantId,
    agentId: fixture.agent.id,
    versionId: fixture.version.id,
    message: extra.message ?? QUESTION,
    history: [],
    executionMode: 'TEST_LAB',
    ...(resolveApprovedKnowledge ? { resolveApprovedKnowledge } : {}),
    ...(extra.knowledgeTimeoutMs !== undefined
      ? { knowledgeTimeoutMs: extra.knowledgeTimeoutMs }
      : {})
  })
}

function expectNoInstitutionalAnswer(
  trace: Awaited<ReturnType<typeof run>>,
  reason?: string
) {
  expect(trace.knowledge.status).toBe('approved_source_missing')
  expect(trace.knowledge.reason).toBe(reason)
  expect(trace.response.mode).toBe('handoff')
  expect(trace.handoff).toMatchObject({
    requested: true,
    reason: 'approved_source_missing'
  })
  expect(JSON.stringify(trace)).not.toContain(answer)
  expect(trace.provider.externalCall).toBe(false)
}

describe('SPEC 0317 G3 institutional knowledge authority', () => {
  it('hands off without a composed resolver', async () => {
    expectNoInstitutionalAnswer(await run(undefined))
  })

  it('ignores a forged runtime input: the fixture port no longer exists', async () => {
    const fixture = await createFixture()
    const trace = await executeConfiguredAgent({
      store: fixture.store,
      tenantId,
      agentId: fixture.agent.id,
      versionId: fixture.version.id,
      message: QUESTION,
      history: [],
      executionMode: 'TEST_LAB',
      approvedKnowledge: { source, version: 'v1', answer }
    } as never)
    expectNoInstitutionalAnswer(trace)
  })

  it('removes client knowledge from the suite case contract', () => {
    expect(
      TestLabCaseSchema.safeParse({
        id: 'forged',
        message: QUESTION,
        expectedResponseMode: 'answer',
        approvedKnowledge: { source, version: 'v1', answer }
      }).success
    ).toBe(false)
  })

  it('answers only with bound, current and verified knowledge', async () => {
    const trace = await run(
      composeSyntheticKnowledgeResolver(() => resolution())
    )
    expect(trace.knowledge).toEqual({
      status: 'answered',
      source,
      version: 'v1',
      provenance: {
        recordId: 'record-1',
        excerptSha256: knowledgeExcerptSha256(answer)
      }
    })
    expect(trace.response).toMatchObject({ mode: 'answer', text: answer })
  })

  it('gives the resolver the tenant, the version bindings and a signal', async () => {
    const resolve = vi.fn<ApprovedKnowledgeResolver>(() => resolution())
    await run(composeSyntheticKnowledgeResolver(resolve))
    expect(resolve).toHaveBeenCalledTimes(1)
    const [input] = resolve.mock.calls[0]!
    expect(input).toMatchObject({ tenantId, question: QUESTION })
    expect(input.bindings).toEqual([expect.objectContaining({ source })])
    expect(input.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not consult the resolver outside an institutional question', async () => {
    const resolve = vi.fn<ApprovedKnowledgeResolver>(() => resolution())
    const trace = await run(composeSyntheticKnowledgeResolver(resolve), {
      message: 'Olá'
    })
    expect(resolve).not.toHaveBeenCalled()
    expect(trace.knowledge).toEqual({ status: 'not_requested' })
  })

  it.each([
    [
      'forged source',
      () => resolution({ source: 'controlled://forged' }),
      'binding_mismatch'
    ],
    ['forged version', () => resolution({ version: 'v2' }), 'binding_mismatch'],
    [
      'other tenant',
      () => resolution({ tenantId: otherTenant }),
      'tenant_mismatch'
    ],
    [
      'revoked source',
      () => resolution({}, { status: 'revoked' }),
      'source_not_current'
    ],
    [
      'draft source',
      () => resolution({}, { status: 'draft' }),
      'source_not_current'
    ],
    [
      'expired source',
      () =>
        resolution({}, { validUntil: new Date('2026-01-02T00:00:00.000Z') }),
      'source_not_current'
    ],
    [
      'approval in the future',
      () =>
        resolution({}, { approvedAt: new Date('2999-01-01T00:00:00.000Z') }),
      'source_not_current'
    ],
    [
      'adulterated answer on a valid binding',
      () => ({
        ...resolution(),
        answer: 'Resposta adulterada, mesmo binding.'
      }),
      'provenance_mismatch'
    ],
    [
      'unprefixed but missing provenance',
      () => ({ tenantId, version: 'v1', answer, source }) as never,
      'resolver_invalid_response'
    ],
    [
      'oversized answer',
      () => ({ ...resolution(), answer: 'x'.repeat(4001) }),
      'resolver_invalid_response'
    ],
    [
      'unknown field',
      () => ({ ...resolution(), unexpected: true }) as never,
      'resolver_invalid_response'
    ],
    ['primitive answer', () => 'resposta' as never, 'resolver_invalid_response']
  ])('refuses %s with handoff', async (_label, resolve, reason) => {
    expectNoInstitutionalAnswer(
      await run(composeSyntheticKnowledgeResolver(resolve)),
      reason
    )
  })

  it('treats null as a missing source', async () => {
    expectNoInstitutionalAnswer(
      await run(composeSyntheticKnowledgeResolver(() => null))
    )
  })

  it('does not let the content leak from a failing resolver', async () => {
    const trace = await run(
      composeSyntheticKnowledgeResolver(() => {
        throw new Error(`upstream said ${answer}`)
      })
    )
    expectNoInstitutionalAnswer(trace, 'resolver_failed')
  })

  it('hands off when the resolver rejects', async () => {
    expectNoInstitutionalAnswer(
      await run(
        composeSyntheticKnowledgeResolver(() => Promise.reject(new Error('x')))
      ),
      'resolver_failed'
    )
  })

  it('hands off and aborts a slow resolver at the deadline', async () => {
    let signal: AbortSignal | undefined
    const trace = await run(
      composeSyntheticKnowledgeResolver((input) => {
        signal = input.signal
        return new Promise(() => undefined)
      }),
      { knowledgeTimeoutMs: 5 }
    )
    expectNoInstitutionalAnswer(trace, 'resolver_timeout')
    expect(signal?.aborted).toBe(true)
  })

  it('keeps the output filter after a valid resolution', async () => {
    const unsafe = 'Tome 2 comprimidos de dipirona a cada 8 horas.'
    const trace = await run(
      composeSyntheticKnowledgeResolver(() => resolution({ answer: unsafe }))
    )
    expect(trace.response.text).not.toContain('comprimidos')
    expect(trace.response.mode).toBe('handoff')
  })
})

describe('SPEC 0317 G4 knowledge resolver composition', () => {
  const t4 = { decisionId: 'T4-RAG', packageSha256: 'b'.repeat(64) }

  it('refuses a resolver the composition did not classify, without calling it', async () => {
    const resolve = vi.fn(() => resolution())
    const trace = await run(resolve as unknown as ApprovedKnowledgeResolver)
    expect(resolve).not.toHaveBeenCalled()
    expectNoInstitutionalAnswer(trace, 'resolver_not_composed')
    expect(() => assertComposedKnowledgeResolver(resolve)).toThrow(
      'classified by the composition'
    )
  })

  it.each([
    ['flag false', {}, undefined, 'flag_disabled'],
    [
      'flag true without T4',
      { ENABLE_REAL_RAG: 'true' },
      undefined,
      'authorization_missing'
    ]
  ])(
    'refuses a real resolver with %s before any I/O',
    (_label, env, authorization, reason) => {
      const guard = createRealCapabilityGuards({
        env,
        ...(authorization ? { authorizations: { rag: authorization } } : {})
      }).rag
      const resolve = vi.fn()
      expect(() =>
        composeRealKnowledgeResolver({ guard, resolve })
      ).toThrowError(
        expect.objectContaining({ code: 'real_capability_blocked', reason })
      )
      expect(resolve).not.toHaveBeenCalled()
    }
  )

  it('refuses a real resolver without a guard', () => {
    const resolve = vi.fn()
    expect(() =>
      composeRealKnowledgeResolver({ guard: undefined as never, resolve })
    ).toThrowError(expect.objectContaining({ reason: 'guard_missing' }))
  })

  it('still verifies source and provenance behind an open guard', async () => {
    const guard = createRealCapabilityGuards({
      env: { ENABLE_REAL_RAG: 'true' },
      authorizations: { rag: t4 }
    }).rag
    const forged = composeRealKnowledgeResolver({
      guard,
      resolve: () => ({ ...resolution(), answer: 'Resposta adulterada.' })
    })
    expectNoInstitutionalAnswer(await run(forged), 'provenance_mismatch')
    const valid = composeRealKnowledgeResolver({
      guard,
      resolve: () => resolution()
    })
    expect((await run(valid)).knowledge.status).toBe('answered')
  })

  it('refuses a real resolver in a process whose flag is off', () => {
    const open = createRealCapabilityGuards({
      env: { ENABLE_REAL_RAG: 'true' },
      authorizations: { rag: t4 }
    }).rag
    const resolver = composeRealKnowledgeResolver({
      guard: open,
      resolve: () => resolution()
    })
    const processGuard = createRealCapabilityGuards({ env: {} }).rag
    expect(() =>
      assertComposedKnowledgeResolver(resolver, processGuard)
    ).toThrowError(expect.objectContaining({ reason: 'flag_disabled' }))
    expect(() => assertComposedKnowledgeResolver(resolver, open)).not.toThrow()
  })

  it('classifies fixtures only under the test profile', () => {
    vi.stubEnv('NODE_ENV', 'development')
    try {
      expect(() => composeSyntheticKnowledgeResolver(() => null)).toThrow(
        'NODE_ENV=test'
      )
      expect(() => createSyntheticKnowledgeResolver()).toThrow('NODE_ENV=test')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('SPEC 0317 G4 absolute block of forbidden categories', () => {
  it.each(['payment.charge', 'prontuario.update', 'medical_record.read'])(
    'hard-blocks the policy action %s',
    (action) => {
      expect(
        evaluatePlatformPolicy({
          action,
          confidence: 1,
          config: createConfig()
        })
      ).toMatchObject({ decision: 'blocked', layer: 'hard_safety' })
    }
  )

  it.each([
    ['tool name', 'payment.charge', 'tool:run', []],
    ['tool permission', 'run', 'medical_record:write', []],
    ['plugin capability', 'run', 'tool:run', ['pix']]
  ])(
    'blocks dispatch by %s without running the handler',
    async (_label, tool, permission, capabilities) => {
      const input = { tool, permission }
      const handler = vi.fn(() => ({ status: 'succeeded' as const, data: {} }))
      const validator = { safeParse: () => ({ success: true, data: {} }) }
      const registry = new PluginRegistry([
        {
          manifest: {
            name: 'synthetic.plugin',
            version: '1.0.0',
            capabilities,
            permissions: [input.permission],
            tools: [
              {
                name: input.tool,
                permission: input.permission,
                risk: 'low',
                requiresApproval: false,
                intents: ['institutional_question']
              }
            ],
            hooks: [],
            dependencies: [],
            configSchemaVersion: '1'
          },
          handlers: { [input.tool]: handler },
          inputValidators: { [input.tool]: validator },
          outputValidators: { [input.tool]: validator }
        }
      ])
      const gateway = new CapabilityGateway(registry, {
        actorAuthorizer: () => [input.permission]
      } as never)
      const config = AgentConfigSchema.parse({
        ...createConfig(),
        plugins: [
          {
            plugin: 'synthetic.plugin',
            version: '1.0.0',
            enabled: true,
            allowedTools: [input.tool],
            config: {}
          }
        ]
      })
      expect(gateway.resolveConfiguredTool(config, input.tool)).toEqual({
        status: 'blocked',
        reason: 'forbidden_capability_category'
      })
      const result = await gateway.execute({
        tenantId,
        agentId: 'agent_00000000-0000-4000-8000-000000000141',
        versionId: 'agent_version_00000000-0000-4000-8000-000000000141',
        config,
        toolName: input.tool,
        input: {},
        actor: {
          id: 'operator.synthetic',
          role: 'Operator',
          permissions: [input.permission]
        },
        policy: { decision: 'allowed', reason: 'synthetic' },
        dryRun: false
      } as never)
      expect(result).toMatchObject({
        status: 'blocked',
        reason: 'forbidden_capability_category'
      })
      expect(handler).not.toHaveBeenCalled()
    }
  )
})
