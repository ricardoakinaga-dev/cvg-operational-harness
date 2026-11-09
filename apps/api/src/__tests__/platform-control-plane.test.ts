import { describe, expect, it } from 'vitest'
import {
  createSyntheticKnowledgeResolver,
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  type TenantScope,
  type TestRunTrace
} from '@cvg/platform'
import { buildServer } from '../server.ts'
import { createSyntheticTestLabComposition } from '../test-lab-composition.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000011'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000012'

const adminHeaders = (tenantId: string) => ({
  'x-operator-id': 'admin.controlled',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
})

const controlledReleaseGates = [
  {
    key: 'safety_preflight',
    status: 'PASS',
    evidenceRef: 'controlled://evidence/safety-preflight-v1'
  },
  {
    key: 'test_lab_regression',
    status: 'PASS',
    evidenceRef: 'controlled://evidence/test-lab-regression-v1'
  },
  {
    key: 'snapshot_integrity',
    status: 'PASS',
    evidenceRef: 'controlled://evidence/snapshot-integrity-v1'
  },
  {
    key: 'external_boundary',
    status: 'PASS',
    evidenceRef: 'controlled://evidence/external-boundary-v1'
  }
]

async function createValidatedReleaseCandidate(
  app: ReturnType<typeof buildServer>,
  tenantId: string,
  agentId: string,
  versionId: string
): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/v1/admin/release-candidates',
    headers: adminHeaders(tenantId),
    payload: { agentId, versionId, gateResults: controlledReleaseGates }
  })
  const candidate = (created.json() as Envelope<{ id: string }>).data
  const validated = await app.inject({
    method: 'POST',
    url: `/v1/admin/release-candidates/${candidate?.id}/transition`,
    headers: {
      ...adminHeaders(tenantId),
      'x-operator-id': 'approver.controlled'
    },
    payload: { target: 'VALIDATED', expectedStatus: 'DRAFT' }
  })
  expect(created.statusCode).toBe(200)
  expect(validated.statusCode).toBe(200)
  return candidate?.id as string
}

function config() {
  return AgentConfigSchema.parse({
    persona: { name: 'Test Agent', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [
      {
        id: 'system',
        kind: 'system',
        content: 'Use apenas dados fictícios.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: {
      institutional_question: 'Informação institucional fictícia.'
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
      version: 'policy-api-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'institutional_question'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [
      {
        source: 'controlled://hours',
        version: 'controlled-v1',
        enabled: true,
        requiresApprovedSource: true
      }
    ],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('platform control plane API', () => {
  it('lets an Admin create, publish and list an agent within its tenant', async () => {
    const app = buildServer()
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'controlled-agent',
        name: 'Controlled Agent',
        description: 'Agent fictício para teste'
      }
    })
    const created = (create.json() as Envelope<{ id: string }>).data
    expect(create.statusCode).toBe(200)
    expect(created?.id).toMatch(/^agent_/)

    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const version = (versionResponse.json() as Envelope<{ id: string }>).data
    expect(versionResponse.statusCode).toBe(200)

    for (const target of ['TESTING', 'APPROVED']) {
      const transition = await app.inject({
        method: 'POST',
        url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/transition`,
        headers: adminHeaders(tenantA),
        payload: { target }
      })
      expect(transition.statusCode).toBe(200)
    }

    const releaseCandidateId = await createValidatedReleaseCandidate(
      app,
      tenantA,
      created?.id as string,
      version?.id as string
    )

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/publish`,
      headers: adminHeaders(tenantA),
      payload: { releaseCandidateId }
    })
    const published = (publish.json() as Envelope<{ status: string }>).data
    const versions = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/${created?.id}/versions`,
      headers: adminHeaders(tenantA)
    })
    const rollback = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/rollback`,
      headers: adminHeaders(tenantA),
      payload: { versionId: version?.id, releaseCandidateId }
    })
    const list = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA)
    })
    await app.close()

    expect(publish.statusCode).toBe(200)
    expect(published?.status).toBe('PUBLISHED')
    expect(versions.statusCode).toBe(200)
    expect((versions.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(rollback.statusCode).toBe(200)
    expect((rollback.json() as Envelope<{ status: string }>).data?.status).toBe(
      'PUBLISHED'
    )
    expect(
      (list.json() as Envelope<Array<{ slug: string }>>).data
    ).toContainEqual(expect.objectContaining({ slug: 'controlled-agent' }))
  })

  it('returns HTTP 409 when an Admin submits a stale lifecycle status', async () => {
    const app = buildServer()
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'optimistic-api-agent',
        name: 'Optimistic API Agent',
        description: 'Controlled conflict fixture'
      }
    })
    const agentId = (create.json() as Envelope<{ id: string }>).data?.id
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const version = (
      versionResponse.json() as Envelope<{
        id: string
        status: string
      }>
    ).data
    const first = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions/${version?.id}/transition`,
      headers: adminHeaders(tenantA),
      payload: { target: 'TESTING', expectedStatus: 'DRAFT' }
    })
    const stale = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions/${version?.id}/transition`,
      headers: adminHeaders(tenantA),
      payload: { target: 'APPROVED', expectedStatus: 'DRAFT' }
    })
    const reread = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA)
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(stale.statusCode).toBe(409)
    expect((stale.json() as Envelope<null>).error).toMatchObject({
      code: 'conflict'
    })
    expect((reread.json() as Envelope<Array<{ status: string }>>).data).toEqual(
      [expect.objectContaining({ status: 'TESTING' })]
    )
  })

  it('creates an immutable draft when an Admin edits a version', async () => {
    const app = buildServer()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'versioned-edit-agent',
        name: 'Versioned Edit Agent',
        description: 'Controlled edit fixture'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const original = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const originalVersion = (
      original.json() as Envelope<{
        id: string
        version: number
        config: { greeting: string }
      }>
    ).data
    const edited = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions/${originalVersion?.id}/clone`,
      headers: adminHeaders(tenantA),
      payload: {
        config: { ...config(), greeting: 'Saudação editada, fictícia.' }
      }
    })
    const versions = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA)
    })
    await app.close()

    const editedVersion = (
      edited.json() as Envelope<{
        id: string
        version: number
        status: string
        config: { greeting: string }
      }>
    ).data
    const listed = (
      versions.json() as Envelope<
        Array<{ version: number; config: { greeting: string } }>
      >
    ).data

    expect(edited.statusCode).toBe(200)
    expect(editedVersion).toMatchObject({
      version: 2,
      status: 'DRAFT',
      config: { greeting: 'Saudação editada, fictícia.' }
    })
    expect(editedVersion?.id).not.toBe(originalVersion?.id)
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          version: 1,
          config: expect.objectContaining({ greeting: 'Resposta controlada.' })
        }),
        expect.objectContaining({
          version: 2,
          config: expect.objectContaining({
            greeting: 'Saudação editada, fictícia.'
          })
        })
      ])
    )
  })

  it('rejects a newly forged protected block without creating a clone', async () => {
    const app = buildServer()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'protected-clone-agent',
        name: 'Protected Clone Agent',
        description: 'Protected clone boundary fixture'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const original = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const originalVersion = (original.json() as Envelope<{ id: string }>).data
    const sourceConfig = config()
    const forgedConfig = AgentConfigSchema.parse({
      ...sourceConfig,
      promptBlocks: [
        ...sourceConfig.promptBlocks,
        {
          id: 'new-system-block',
          kind: 'system',
          content: 'Tentativa de alterar a camada protegida.',
          priority: 0,
          enabled: true
        }
      ]
    })
    const clone = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions/${originalVersion?.id}/clone`,
      headers: adminHeaders(tenantA),
      payload: { config: forgedConfig }
    })
    const versions = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA)
    })
    await app.close()

    expect(clone.statusCode).toBe(400)
    expect(clone.json() as Envelope<null>).toMatchObject({
      success: false,
      error: { code: 'invalid_action' }
    })
    expect((versions.json() as Envelope<unknown[]>).data).toHaveLength(1)
  })

  it('does not expose another tenant and requires Admin for configuration', async () => {
    const app = buildServer()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'isolated-agent',
        name: 'Isolated Agent',
        description: 'Tenant A only'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const otherTenant = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantB)
    })
    const operator = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: {
        'x-operator-id': 'operator.controlled',
        'x-operator-role': 'Operator',
        'x-tenant-id': tenantA
      }
    })
    const crossTenantVersion = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantB),
      payload: { config: config() }
    })
    await app.close()

    expect(otherTenant.statusCode).toBe(200)
    expect((otherTenant.json() as Envelope<unknown[]>).data).toEqual([])
    expect(operator.statusCode).toBe(403)
    expect((operator.json() as Envelope<never>).error?.code).toBe('forbidden')
    expect(crossTenantVersion.statusCode).toBe(403)
  })

  it('runs Test Lab with a controlled source and no external dispatch', async () => {
    const app = buildServer({
      testLab: createSyntheticTestLabComposition({
        resolveApprovedKnowledge: createSyntheticKnowledgeResolver({
          version: 'controlled-v1',
          answer: 'Horário fictício.',
          source: 'controlled://hours'
        })
      })
    })
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'lab-agent',
        name: 'Lab Agent',
        description: 'Test Lab fictício'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const versionId = (versionResponse.json() as Envelope<{ id: string }>).data
      ?.id
    const run = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders(tenantA),
      payload: {
        agentId,
        versionId,
        message: 'Qual o horário de funcionamento?',
        history: []
      }
    })
    const evaluation = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/evaluate',
      headers: adminHeaders(tenantA),
      payload: {
        agentId,
        versionId,
        cases: [
          {
            id: 'institutional',
            message: 'Qual o horário de funcionamento?',
            history: [],
            expectedPolicyDecision: 'allowed',
            expectedResponseMode: 'answer'
          },
          {
            id: 'hard-safety',
            message: 'Confirmar consulta',
            history: [],
            expectedPolicyDecision: 'blocked',
            expectedResponseMode: 'blocked',
            expectedHandoff: false
          }
        ]
      }
    })
    await app.close()

    const body = run.json() as Envelope<{
      provider: { externalCall: boolean }
      knowledge: { status: string }
    }>
    expect(run.statusCode).toBe(200)
    expect(body.data).toMatchObject({
      provider: { externalCall: false },
      knowledge: { status: 'answered' }
    })
    expect(evaluation.statusCode).toBe(200)
    expect(
      (evaluation.json() as Envelope<{ passed: boolean }>).data?.passed
    ).toBe(true)
  })

  it('lists persisted Test Lab and runtime traces only inside the tenant scope', async () => {
    const app = buildServer({ testLab: createSyntheticTestLabComposition() })
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'trace-history-agent',
        name: 'Trace History Agent',
        description: 'Trace history fixture'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const versionId = (versionResponse.json() as Envelope<{ id: string }>).data
      ?.id
    await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders(tenantA),
      payload: {
        agentId,
        versionId,
        message: 'Mensagem de histórico fictícia',
        history: []
      }
    })

    const testRuns = await app.inject({
      method: 'GET',
      url: '/v1/admin/test-lab/runs?limit=10',
      headers: adminHeaders(tenantA)
    })
    const runtimeTraces = await app.inject({
      method: 'GET',
      url: '/v1/admin/execution-traces?limit=10',
      headers: adminHeaders(tenantA)
    })
    const otherTenantRuns = await app.inject({
      method: 'GET',
      url: '/v1/admin/test-lab/runs?limit=10',
      headers: adminHeaders(tenantB)
    })
    await app.close()

    expect(testRuns.statusCode).toBe(200)
    expect(
      (testRuns.json() as Envelope<{ items: Array<{ executionMode: string }> }>)
        .data?.items
    ).toEqual([expect.objectContaining({ executionMode: 'TEST_LAB' })])
    expect(runtimeTraces.statusCode).toBe(200)
    expect(
      (runtimeTraces.json() as Envelope<{ items: unknown[] }>).data?.items
    ).toEqual([])
    expect(otherTenantRuns.statusCode).toBe(200)
    expect(
      (otherTenantRuns.json() as Envelope<{ items: unknown[] }>).data?.items
    ).toEqual([])
  })

  it('exposes a redacted critical safety preflight and enforces it before publish', async () => {
    const app = buildServer()
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'preflight-agent',
        name: 'Preflight Agent',
        description: 'Fixture for publish safety gate'
      }
    })
    const created = (create.json() as Envelope<{ id: string }>).data
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const version = (versionResponse.json() as Envelope<{ id: string }>).data

    for (const target of ['TESTING', 'APPROVED']) {
      await app.inject({
        method: 'POST',
        url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/transition`,
        headers: adminHeaders(tenantA),
        payload: { target }
      })
    }

    const arbitraryCases = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/publish-preflight`,
      headers: adminHeaders(tenantA),
      payload: { cases: [] }
    })
    expect(arbitraryCases.statusCode).toBe(400)

    const preflight = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/publish-preflight`,
      headers: adminHeaders(tenantA),
      payload: {}
    })
    const report = (
      preflight.json() as Envelope<{
        passed: boolean
        caseCount: number
        externalCall: boolean
        cases: Array<Record<string, unknown>>
      }>
    ).data
    expect(preflight.statusCode).toBe(200)
    expect(report).toMatchObject({
      passed: true,
      caseCount: 10,
      externalCall: false
    })
    expect(JSON.stringify(report)).not.toContain('Posso dar dipirona')
    expect(JSON.stringify(report)).not.toContain('Confirmar consulta real')
    expect(report?.cases[0]).not.toHaveProperty('trace')

    const releaseCandidateId = await createValidatedReleaseCandidate(
      app,
      tenantA,
      created?.id as string,
      version?.id as string
    )

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/publish`,
      headers: adminHeaders(tenantA),
      payload: { releaseCandidateId }
    })
    expect(publish.statusCode).toBe(200)
    await app.close()
  })

  it('blocks publish without mutating the version when the preflight detects an external call', async () => {
    class UnsafeTraceStore extends InMemoryControlPlaneStore {
      override async recordTestRun(
        scope: TenantScope,
        trace: TestRunTrace
      ): Promise<TestRunTrace> {
        const unsafeTrace = {
          ...trace,
          provider: { ...trace.provider, externalCall: true }
        } as unknown as TestRunTrace
        void scope
        return unsafeTrace
      }
    }

    const app = buildServer({ platform: new UnsafeTraceStore() })
    const create = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(tenantA),
      payload: {
        slug: 'unsafe-preflight-agent',
        name: 'Unsafe Preflight Agent',
        description: 'Fixture for failed safety gate'
      }
    })
    const created = (create.json() as Envelope<{ id: string }>).data
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions`,
      headers: adminHeaders(tenantA),
      payload: { config: config() }
    })
    const version = (versionResponse.json() as Envelope<{ id: string }>).data
    for (const target of ['TESTING', 'APPROVED']) {
      await app.inject({
        method: 'POST',
        url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/transition`,
        headers: adminHeaders(tenantA),
        payload: { target }
      })
    }

    const releaseCandidateId = await createValidatedReleaseCandidate(
      app,
      tenantA,
      created?.id as string,
      version?.id as string
    )

    const publish = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/versions/${version?.id}/publish`,
      headers: adminHeaders(tenantA),
      payload: { releaseCandidateId }
    })
    const rollback = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${created?.id}/rollback`,
      headers: adminHeaders(tenantA),
      payload: { versionId: version?.id, releaseCandidateId }
    })
    const versions = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/${created?.id}/versions`,
      headers: adminHeaders(tenantA)
    })

    expect(publish.statusCode).toBe(400)
    expect((publish.json() as Envelope<null>).error?.message).toMatch(
      /safety preflight/i
    )
    expect(rollback.statusCode).toBe(400)
    expect((rollback.json() as Envelope<null>).error?.message).toMatch(
      /safety preflight/i
    )
    expect(
      (versions.json() as Envelope<Array<{ id: string; status: string }>>).data
    ).toEqual([
      expect.objectContaining({ id: version?.id, status: 'APPROVED' })
    ])
    await app.close()
  })
})
