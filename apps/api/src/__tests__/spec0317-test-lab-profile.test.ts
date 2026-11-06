import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompositeTelemetry } from '@cvg/observability'
import {
  AgentConfigSchema,
  composeSyntheticKnowledgeResolver,
  createControlledAgentConfig,
  createSyntheticKnowledgeResolver,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  knowledgeExcerptSha256,
  type ApprovedKnowledgeResolver
} from '@cvg/platform'
import { buildServer, buildServerFromEnv } from '../server.ts'
import {
  createConfiguredTestLab,
  createSyntheticTestLabComposition,
  TEST_LAB_PROFILE_ENV
} from '../test-lab-composition.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000317'
const adminHeaders = {
  'x-operator-id': 'admin.spec0317',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
}
const source = 'controlled://spec0317'
const version = 'spec0317-v1'
const suiteId = 'test_suite_00000000-0000-4000-8000-000000000317'
const forgedKnowledge = {
  source,
  version,
  answer: 'Resposta institucional inventada pelo cliente.'
}

const LAB_ROUTES = [
  ['POST', '/v1/admin/test-lab/runs'],
  ['GET', '/v1/admin/test-lab/runs'],
  ['POST', '/v1/admin/test-lab/evaluate'],
  ['POST', '/v1/admin/test-lab/suites'],
  ['GET', '/v1/admin/test-lab/suites'],
  ['POST', `/v1/admin/test-lab/suites/${suiteId}/clone`],
  ['POST', `/v1/admin/test-lab/suites/${suiteId}/evaluate`],
  ['POST', `/v1/admin/test-lab/suites/${suiteId}/compare`],
  ['GET', `/v1/admin/test-lab/suites/${suiteId}/runs`]
] as const

function knowledgeConfig() {
  return AgentConfigSchema.parse({
    ...createControlledAgentConfig(),
    knowledge: [
      { source, version, enabled: true, requiresApprovedSource: true }
    ]
  })
}

async function publishedAgent(store: InMemoryControlPlaneStore) {
  const agent = await store.createAgent(
    { tenantId },
    { slug: 'spec0317', name: 'Spec 0317', description: 'Fixture' }
  )
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    knowledgeConfig(),
    'admin.spec0317'
  )
  const testing = await store.transitionVersion(
    { tenantId },
    draft.id,
    'TESTING'
  )
  const approved = await store.transitionVersion(
    { tenantId },
    testing.id,
    'APPROVED'
  )
  const candidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantId,
    agent.id,
    approved.id,
    'admin.spec0317'
  )
  await store.publishVersion({ tenantId }, approved.id, candidate.id)
  return { agent, version: draft }
}

async function statusOfEveryLabRoute(
  app: ReturnType<typeof buildServer>,
  headers: Record<string, string> = adminHeaders
) {
  const statuses: number[] = []
  for (const [method, url] of LAB_ROUTES) {
    const response = await app.inject({
      method,
      url,
      headers,
      ...(method === 'POST' ? { payload: {} } : {})
    })
    statuses.push(response.statusCode)
  }
  return statuses
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SPEC 0317 G3 §1 Test Lab profile', () => {
  it('keeps the inventory of this file complete against the route module', () => {
    const module = readFileSync(
      resolve(process.cwd(), 'apps/api/src/routes/register-test-lab.ts'),
      'utf8'
    )
    const declared = [
      ...module.matchAll(/app\.(get|post)\(\s*'(\/v1\/admin\/test-lab[^']*)'/g)
    ].map((match) => [
      match[1]!.toUpperCase(),
      match[2]!.replace(':suiteId', suiteId)
    ])
    expect(declared.sort()).toEqual(
      LAB_ROUTES.map((route) => [...route]).sort()
    )
  })

  it('registers every route only with the synthetic composition', async () => {
    const app = buildServer({ testLab: createSyntheticTestLabComposition() })
    for (const [method, url] of LAB_ROUTES) {
      expect(
        app.hasRoute({
          method,
          url: url.replace(suiteId, ':suiteId')
        })
      ).toBe(true)
    }
    await app.close()
  })

  it('has no lab route without the profile, even for an authenticated Admin', async () => {
    const app = buildServer()
    expect(await statusOfEveryLabRoute(app)).toEqual(LAB_ROUTES.map(() => 404))
    await app.close()
  })

  it('is absent outside NODE_ENV=test with a trusted Admin', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: () => ({
        operatorId: 'admin.spec0317',
        role: 'Admin',
        tenantId
      })
    } as never)
    expect(await statusOfEveryLabRoute(app)).toEqual(LAB_ROUTES.map(() => 404))
    await app.close()
  })

  it('a flag alone registers nothing, even under NODE_ENV=test', async () => {
    vi.stubEnv(TEST_LAB_PROFILE_ENV, 'synthetic')
    const app = buildServer()
    expect(await statusOfEveryLabRoute(app)).toEqual(LAB_ROUTES.map(() => 404))
    await app.close()
  })

  it('headers and body cannot ask for the lab', async () => {
    const app = buildServer()
    const statuses = await statusOfEveryLabRoute(app, {
      ...adminHeaders,
      'x-cvg-test-lab-profile': 'synthetic',
      'x-test-lab': 'true'
    })
    expect(statuses).toEqual(LAB_ROUTES.map(() => 404))
    await app.close()
  })

  it.each(['development', 'production'])(
    'refuses the boot when the flag is set under NODE_ENV=%s',
    (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv)
      vi.stubEnv(TEST_LAB_PROFILE_ENV, 'synthetic')
      expect(() => buildServer()).toThrow(
        'Test Lab requires the explicit test profile'
      )
    }
  )

  it('refuses an unknown profile value', () => {
    vi.stubEnv(TEST_LAB_PROFILE_ENV, 'enabled')
    expect(() => buildServer()).toThrow(`${TEST_LAB_PROFILE_ENV} must be`)
  })

  it.each([
    ['boolean', true],
    ['look-alike object', { profile: 'synthetic' }],
    ['string', 'synthetic']
  ])('refuses a forged composition: %s', (_label, testLab) => {
    expect(() => buildServer({ testLab } as never)).toThrow(
      'Test Lab requires a synthetic composition'
    )
  })

  it('refuses a composition created in test and used outside it', () => {
    const testLab = createSyntheticTestLabComposition()
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => buildServer({ testLab })).toThrow(
      'Test Lab requires the explicit test profile'
    )
    expect(() => createSyntheticTestLabComposition()).toThrow(
      'Test Lab requires the explicit test profile'
    )
  })

  it.each(['ENABLE_REAL_CHANNELS', 'ENABLE_REAL_RAG'])(
    'refuses a lab composed next to %s=true',
    (flag) => {
      vi.stubEnv(flag, 'true')
      expect(() => createSyntheticTestLabComposition()).toThrow(
        'Test Lab requires a synthetic composition'
      )
    }
  )

  it('refuses an unclassified fixture in the lab composition', () => {
    expect(() =>
      createSyntheticTestLabComposition({
        resolveApprovedKnowledge: (() => null) as ApprovedKnowledgeResolver
      })
    ).toThrow('classified by the composition')
  })

  it('hosts built from the environment need the whole test profile', () => {
    expect(
      createConfiguredTestLab(
        { NODE_ENV: 'test', [TEST_LAB_PROFILE_ENV]: 'synthetic' },
        undefined
      )
    ).toMatchObject({ profile: 'synthetic' })
    expect(createConfiguredTestLab({ NODE_ENV: 'test' }, undefined)).toBe(
      undefined
    )
    expect(() =>
      createConfiguredTestLab(
        {
          NODE_ENV: 'test',
          API_PERSISTENCE_MODE: 'postgres',
          [TEST_LAB_PROFILE_ENV]: 'synthetic'
        },
        undefined
      )
    ).toThrow('Test Lab requires a synthetic composition')
    for (const nodeEnv of ['development', 'production'] as const) {
      expect(() =>
        createConfiguredTestLab(
          { NODE_ENV: nodeEnv, [TEST_LAB_PROFILE_ENV]: 'synthetic' },
          undefined
        )
      ).toThrow('Test Lab requires the explicit test profile')
    }
  })

  it('serves the lab from the environment profile with the internal fixture', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version: agentVersion } = await publishedAgent(platform)
    const app = await buildServerFromEnv(
      { NODE_ENV: 'test', [TEST_LAB_PROFILE_ENV]: 'synthetic' },
      { platform }
    )
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: agentVersion.id,
        message: 'Qual o horário de funcionamento?',
        history: []
      }
    })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.knowledge).toMatchObject({
      status: 'answered',
      source,
      version
    })
  })

  it('keeps the audit read of real executions outside the lab', async () => {
    const app = buildServer()
    const response = await app.inject({
      method: 'GET',
      url: '/v1/admin/execution-traces',
      headers: {
        ...adminHeaders,
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()
    expect(response.statusCode).not.toBe(404)
  })
})

describe('SPEC 0317 G3 client knowledge has no authority', () => {
  it('refuses a well-formed forged answer before any effect', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version: agentVersion } = await publishedAgent(platform)
    const resolve = vi.fn<ApprovedKnowledgeResolver>(() => null)
    const app = buildServer({
      platform,
      testLab: createSyntheticTestLabComposition({
        resolveApprovedKnowledge: composeSyntheticKnowledgeResolver(resolve)
      })
    })
    const run = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: agentVersion.id,
        message: 'Qual o horário de funcionamento?',
        history: [],
        approvedKnowledge: forgedKnowledge
      }
    })
    const evaluation = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/evaluate',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: agentVersion.id,
        cases: [
          {
            id: 'forged',
            message: 'Qual o horário de funcionamento?',
            expectedResponseMode: 'answer',
            approvedKnowledge: forgedKnowledge
          }
        ]
      }
    })
    const suite = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/suites',
      headers: adminHeaders,
      payload: {
        slug: 'forged-suite',
        name: 'Forged',
        description: 'Fixture',
        agentId: agent.id,
        versionId: agentVersion.id,
        cases: [
          {
            id: 'forged',
            message: 'Qual o horário de funcionamento?',
            expectedResponseMode: 'answer',
            approvedKnowledge: forgedKnowledge
          }
        ]
      }
    })
    await app.close()

    expect(run.statusCode).toBe(400)
    expect(evaluation.statusCode).toBe(400)
    expect(suite.statusCode).toBe(400)
    expect(resolve).not.toHaveBeenCalled()
    await expect(platform.listTestRuns({ tenantId }, 10)).resolves.toEqual([])
    await expect(
      platform.listTestSuites({ tenantId }, agent.id)
    ).resolves.toEqual([])
  })

  it('hands off in the lab with no resolver: the request cannot fill the gap', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version: agentVersion } = await publishedAgent(platform)
    const app = buildServer({
      platform,
      testLab: createSyntheticTestLabComposition()
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: agentVersion.id,
        message: 'Qual o horário de funcionamento?',
        history: []
      }
    })
    await app.close()
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toMatchObject({
      knowledge: { status: 'approved_source_missing' },
      handoff: { requested: true, reason: 'approved_source_missing' }
    })
  })

  it('applies the composed fixture to suites and comparisons', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version: agentVersion } = await publishedAgent(platform)
    const app = buildServer({
      platform,
      testLab: createSyntheticTestLabComposition({
        resolveApprovedKnowledge: createSyntheticKnowledgeResolver()
      })
    })
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/suites',
      headers: adminHeaders,
      payload: {
        slug: 'fixture-suite',
        name: 'Fixture',
        description: 'Fixture',
        agentId: agent.id,
        versionId: agentVersion.id,
        cases: [
          {
            id: 'institutional',
            message: 'Qual o horário de funcionamento?',
            expectedResponseMode: 'answer'
          }
        ]
      }
    })
    expect(created.statusCode).toBe(200)
    const evaluated = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${created.json().data.id}/evaluate`,
      headers: adminHeaders,
      payload: {}
    })
    await app.close()
    expect(evaluated.statusCode).toBe(200)
    expect(evaluated.json().data.passed).toBe(true)
  })
})

describe('SPEC 0317 G3 §4 channel entry', () => {
  async function inbound(resolveApprovedKnowledge?: ApprovedKnowledgeResolver) {
    const platform = new InMemoryControlPlaneStore()
    const { agent } = await publishedAgent(platform)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId as never,
      agentRuntime: {
        resolveAgentId: () => agent.id,
        ...(resolveApprovedKnowledge ? { resolveApprovedKnowledge } : {})
      }
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        externalMessageId: `spec0317-${Math.random()}`,
        senderRef: 'fixture-sender',
        body: 'Qual endereço?',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()
    return response
  }

  it('hands off without a composed resolver', async () => {
    const response = await inbound()
    expect(response.statusCode).toBe(200)
    expect(response.json().data.runtime.trace).toMatchObject({
      knowledge: { status: 'approved_source_missing' },
      response: { mode: 'handoff' },
      provider: { externalCall: false }
    })
  })

  it.each([
    [
      'failing',
      () => {
        throw new Error('rag offline')
      },
      'resolver_failed'
    ],
    [
      'adulterated',
      (input: { tenantId: string }) => ({
        tenantId: input.tenantId,
        source,
        version,
        answer: 'Resposta adulterada.',
        provenance: {
          recordId: 'record',
          status: 'approved',
          approvedAt: new Date(0),
          validUntil: null,
          excerptSha256: knowledgeExcerptSha256('Resposta original.')
        }
      }),
      'provenance_mismatch'
    ],
    [
      'revoked',
      (input: { tenantId: string }) => ({
        tenantId: input.tenantId,
        source,
        version,
        answer: 'Resposta revogada.',
        provenance: {
          recordId: 'record',
          status: 'revoked',
          approvedAt: new Date(0),
          validUntil: null,
          excerptSha256: knowledgeExcerptSha256('Resposta revogada.')
        }
      }),
      'source_not_current'
    ]
  ])('hands off with a %s resolver', async (_label, resolve, reason) => {
    const response = await inbound(
      composeSyntheticKnowledgeResolver(resolve as never)
    )
    expect(response.statusCode).toBe(200)
    const trace = response.json().data.runtime.trace
    expect(trace.knowledge).toEqual({
      status: 'approved_source_missing',
      reason
    })
    expect(trace.response.mode).toBe('handoff')
    expect(response.body).not.toContain('Resposta adulterada')
    expect(response.body).not.toContain('Resposta revogada')
    expect(response.body).not.toContain('rag offline')
  })

  it('answers from a verified resolver', async () => {
    const response = await inbound(
      createSyntheticKnowledgeResolver({ answer: 'Endereço fictício.' })
    )
    expect(response.json().data.runtime.trace.response).toMatchObject({
      mode: 'answer',
      text: 'Endereço fictício.'
    })
  })

  it('refuses a raw resolver at the bootstrap of every composition slot', () => {
    const raw = (() => null) as ApprovedKnowledgeResolver
    expect(() => buildServer({ resolveApprovedKnowledge: raw })).toThrow(
      'classified by the composition'
    )
    expect(() =>
      buildServer({
        agentRuntime: {
          resolveAgentId: () => null,
          resolveApprovedKnowledge: raw
        }
      })
    ).toThrow('classified by the composition')
  })
})

describe('SPEC 0317 G4 bootstrap', () => {
  it.each(['ENABLE_REAL_PAYMENTS', 'ENABLE_REAL_MEDICAL_RECORDS'])(
    '%s=true stops every composition path before serving',
    async (flag) => {
      await expect(
        buildServerFromEnv({ NODE_ENV: 'test', [flag]: 'true' })
      ).rejects.toThrow(`${flag} must stay false`)
      vi.stubEnv(flag, 'true')
      expect(() => buildServer()).toThrow(`${flag} must stay false`)
    }
  )

  it('refuses an invalid flag value at the bootstrap', async () => {
    await expect(
      buildServerFromEnv({ NODE_ENV: 'test', ENABLE_REAL_RAG: 'yes' })
    ).rejects.toThrow('ENABLE_REAL_RAG must be true or false')
  })

  it('publishes the safe state of each guard without treating a flag as GO', async () => {
    vi.stubEnv('ENABLE_REAL_RAG', 'true')
    vi.stubEnv('WEBHOOK_SIGNING_SECRET', 'synthetic-secret-that-must-not-leak')
    const telemetry = new CompositeTelemetry()
    const log = vi.spyOn(telemetry, 'log')
    const app = buildServer({ telemetry })
    await app.close()
    const entries = log.mock.calls.filter(
      ([, event]) => event === 'real_capability.guard'
    )
    expect(entries.map(([, , attributes]) => attributes)).toEqual([
      { capability: 'channels', state: 'blocked', reason: 'flag_disabled' },
      {
        capability: 'rag',
        state: 'blocked',
        reason: 'authorization_missing'
      }
    ])
    expect(JSON.stringify(entries)).not.toContain('synthetic-secret')
  })

  it('cannot classify a plugin as synthetic through the catalog request', async () => {
    const app = buildServer()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/plugins/catalog',
      headers: { ...adminHeaders, 'x-synthetic': 'true' },
      payload: {
        name: 'real.plugin',
        version: '1.0.0',
        synthetic: true,
        classification: 'synthetic'
      }
    })
    await app.close()
    expect(response.statusCode).toBe(400)
  })
})
