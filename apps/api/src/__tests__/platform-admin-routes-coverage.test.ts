import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  type TenantScope,
  type TestRunTrace
} from '@cvg/platform'
import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000811'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000812'
const missingUuid = '00000000-0000-4000-8000-000000000000'

const adminHeaders = (tenantId = tenantA, operatorId = 'admin.coverage') => ({
  'x-operator-id': operatorId,
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

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

function config(enableScheduling = false) {
  return AgentConfigSchema.parse({
    persona: { name: 'Coverage Agent', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta fictícia.',
    promptBlocks: [
      {
        id: 'system',
        kind: 'system',
        content: 'Use apenas dados fictícios.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: { institutional_question: 'Template fictício.' },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/coverage'
    },
    policies: {
      version: 'coverage-policy-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: [
        'respond',
        'institutional_question',
        ...(enableScheduling ? ['scheduling'] : [])
      ],
      approvalActions: [],
      blockedActions: []
    },
    plugins: enableScheduling
      ? [
          {
            plugin: 'scheduling.controlled',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['find_available_slots'],
            config: {}
          }
        ]
      : [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

async function seedAgent(store: InMemoryControlPlaneStore, scheduling = false) {
  const agent = await store.createAgent(
    { tenantId: tenantA },
    {
      slug: 'coverage-admin-agent',
      name: 'Coverage Admin Agent',
      description: 'Fixture controlada'
    }
  )
  const version = await store.createVersion(
    { tenantId: tenantA },
    agent.id,
    config(scheduling),
    'admin.coverage'
  )
  return { agent, version }
}

async function seedApprovedAgent(
  store: InMemoryControlPlaneStore,
  scheduling = false
) {
  const { agent, version } = await seedAgent(store, scheduling)
  const testing = await store.transitionVersion(
    { tenantId: tenantA },
    version.id,
    'TESTING'
  )
  const approved = await store.transitionVersion(
    { tenantId: tenantA },
    testing.id,
    'APPROVED'
  )
  return { agent, version: approved }
}

describe('platform admin routes coverage', () => {
  it('runs the knowledge source lifecycle and failure envelopes', async () => {
    const platform = new InMemoryControlPlaneStore()
    const app = buildServer({ platform })

    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/knowledge-sources',
      headers: adminHeaders(),
      payload: {
        source: 'controlled://coverage/hours',
        version: 'coverage-v1',
        label: 'Fonte fictícia',
        description: 'Fonte institucional sintética'
      }
    })
    const source = (created.json() as Envelope<{ id: string }>).data
    const list = await app.inject({
      method: 'GET',
      url: '/v1/admin/knowledge-sources',
      headers: adminHeaders()
    })
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/knowledge-sources/${source?.id}`,
      headers: adminHeaders()
    })
    const missing = await app.inject({
      method: 'GET',
      url: `/v1/admin/knowledge-sources/knowledge_source_${missingUuid}`,
      headers: adminHeaders()
    })
    const approved = await app.inject({
      method: 'POST',
      url: `/v1/admin/knowledge-sources/${source?.id}/transition`,
      headers: adminHeaders(),
      payload: { target: 'APPROVED', expectedStatus: 'DRAFT' }
    })
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/admin/knowledge-sources'
    })
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/admin/knowledge-sources/${source?.id}`,
      headers: adminHeaders(tenantB)
    })
    await app.close()

    expect(created.statusCode).toBe(200)
    expect(source?.id).toMatch(/^knowledge_source_/)
    expect((list.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(detail.statusCode).toBe(200)
    expect(missing.statusCode).toBe(400)
    expect((missing.json() as Envelope<never>).error?.code).toBe(
      'invalid_action'
    )
    expect(approved.statusCode).toBe(200)
    expect((approved.json() as Envelope<{ status: string }>).data?.status).toBe(
      'APPROVED'
    )
    expect(unauthorized.statusCode).toBe(401)
    expect(crossTenant.statusCode).toBe(400)
  })

  it('runs the release candidate lifecycle and failure envelopes', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await seedAgent(platform)
    const app = buildServer({ platform })

    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/release-candidates',
      headers: adminHeaders(),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        gateResults: controlledReleaseGates
      }
    })
    const candidate = (created.json() as Envelope<{ id: string }>).data
    const list = await app.inject({
      method: 'GET',
      url: `/v1/admin/release-candidates?agentId=${agent.id}`,
      headers: adminHeaders()
    })
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/release-candidates/${candidate?.id}`,
      headers: adminHeaders()
    })
    const missing = await app.inject({
      method: 'GET',
      url: `/v1/admin/release-candidates/release_candidate_${missingUuid}`,
      headers: adminHeaders()
    })
    const validated = await app.inject({
      method: 'POST',
      url: `/v1/admin/release-candidates/${candidate?.id}/transition`,
      headers: { ...adminHeaders(), 'x-operator-id': 'approver.coverage' },
      payload: { target: 'VALIDATED', expectedStatus: 'DRAFT' }
    })
    const unauthorized = await app.inject({
      method: 'GET',
      url: `/v1/admin/release-candidates?agentId=${agent.id}`
    })
    await app.close()

    expect(created.statusCode).toBe(200)
    expect((list.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(detail.statusCode).toBe(200)
    expect(missing.statusCode).toBe(400)
    expect(validated.statusCode).toBe(200)
    expect(
      (validated.json() as Envelope<{ status: string }>).data?.status
    ).toBe('VALIDATED')
    expect(unauthorized.statusCode).toBe(401)
  })

  it('runs the plugin catalog lifecycle and filter validation', async () => {
    const platform = new InMemoryControlPlaneStore()
    const app = buildServer({ platform })
    const manifest = {
      name: 'coverage.plugin',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: [],
      dependencies: [],
      configSchemaVersion: 'v1'
    }

    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/plugins/catalog',
      headers: adminHeaders(),
      payload: { manifest }
    })
    const entry = (created.json() as Envelope<{ id: string }>).data
    const filtered = await app.inject({
      method: 'GET',
      url: '/v1/admin/plugins/catalog?name=coverage.plugin',
      headers: adminHeaders()
    })
    const invalidFilter = await app.inject({
      method: 'GET',
      url: '/v1/admin/plugins/catalog?name=***',
      headers: adminHeaders()
    })
    const detail = await app.inject({
      method: 'GET',
      url: `/v1/admin/plugins/catalog/${entry?.id}`,
      headers: adminHeaders()
    })
    const missing = await app.inject({
      method: 'GET',
      url: `/v1/admin/plugins/catalog/plugin_catalog_${missingUuid}`,
      headers: adminHeaders()
    })
    const transitioned = await app.inject({
      method: 'POST',
      url: `/v1/admin/plugins/catalog/${entry?.id}/transition`,
      headers: adminHeaders(),
      payload: { target: 'APPROVED', expectedStatus: 'DRAFT' }
    })
    await app.close()

    expect(created.statusCode).toBe(200)
    expect(filtered.statusCode).toBe(200)
    expect((filtered.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(invalidFilter.statusCode).toBe(400)
    expect(detail.statusCode).toBe(200)
    expect(missing.statusCode).toBe(400)
    expect(transitioned.statusCode).toBe(200)
    expect(
      (transitioned.json() as Envelope<{ status: string }>).data?.status
    ).toBe('APPROVED')
  })

  it('clones test suites, lists runs and rejects invalid limits and missing suites', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await seedAgent(platform)
    const app = buildServer({ platform })

    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/suites',
      headers: adminHeaders(),
      payload: {
        slug: 'coverage-suite',
        name: 'Coverage Suite',
        description: 'Suite fictícia',
        agentId: agent.id,
        versionId: version.id,
        cases: [
          {
            id: 'coverage-hello',
            message: 'Olá',
            expectedResponseMode: 'clarify',
            expectedHandoff: false
          }
        ]
      }
    })
    const suite = (suiteResponse.json() as Envelope<{ id: string }>).data
    const clone = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/clone`,
      headers: adminHeaders(),
      payload: { name: 'Coverage Suite Clone' }
    })
    const invalidClone = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/clone`,
      headers: adminHeaders(),
      payload: { name: 7 }
    })
    const evaluated = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/evaluate`,
      headers: adminHeaders(),
      payload: {}
    })
    const invalidEvaluate = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/evaluate`,
      headers: adminHeaders(),
      payload: { versionId: 'not-a-version' }
    })
    const runs = await app.inject({
      method: 'GET',
      url: `/v1/admin/test-lab/suites/${suite?.id}/runs?limit=10`,
      headers: adminHeaders()
    })
    const missingEvaluate = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/test_suite_${missingUuid}/evaluate`,
      headers: adminHeaders(),
      payload: {}
    })
    const missingCompare = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/test_suite_${missingUuid}/compare`,
      headers: adminHeaders(),
      payload: { versionAId: version.id, versionBId: version.id }
    })
    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/v1/admin/test-lab/runs?limit=1000',
      headers: adminHeaders()
    })
    const invalidTraceLimit = await app.inject({
      method: 'GET',
      url: '/v1/admin/execution-traces?limit=0',
      headers: adminHeaders()
    })
    const invalidEvaluation = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/evaluate',
      headers: adminHeaders(),
      payload: { agentId: agent.id, versionId: version.id, cases: [] }
    })
    const unauthorizedCreate = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/suites',
      payload: {
        slug: 'unauthorized-suite',
        name: 'Unauthorized Suite',
        description: 'Fixture',
        agentId: agent.id,
        versionId: version.id,
        cases: [
          {
            id: 'unauthorized-case',
            message: 'Olá',
            expectedResponseMode: 'clarify',
            expectedHandoff: false
          }
        ]
      }
    })
    const unauthorizedRuns = await app.inject({
      method: 'GET',
      url: `/v1/admin/test-lab/suites/${suite?.id}/runs`
    })
    await app.close()

    expect(suiteResponse.statusCode).toBe(200)
    expect(clone.statusCode).toBe(200)
    expect((clone.json() as Envelope<{ name: string }>).data?.name).toBe(
      'Coverage Suite Clone'
    )
    expect(invalidClone.statusCode).toBe(400)
    expect(evaluated.statusCode).toBe(200)
    expect(invalidEvaluate.statusCode).toBe(400)
    expect(runs.statusCode).toBe(200)
    expect(
      (runs.json() as Envelope<{ pageInfo: { total: number } }>).data?.pageInfo
        .total
    ).toBe(1)
    expect(missingEvaluate.statusCode).toBe(400)
    expect(missingCompare.statusCode).toBe(400)
    expect(invalidLimit.statusCode).toBe(400)
    expect((invalidLimit.json() as Envelope<never>).error?.code).toBe(
      'invalid_pagination'
    )
    expect(invalidTraceLimit.statusCode).toBe(400)
    expect(invalidEvaluation.statusCode).toBe(400)
    expect(unauthorizedCreate.statusCode).toBe(401)
    expect(unauthorizedRuns.statusCode).toBe(401)
  })

  it('rejects version operations outside the agent scope and invalid identifiers', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await seedAgent(platform)
    const app = buildServer({ platform })
    const missingVersionId = `agent_version_${missingUuid}`

    const cloneMissing = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/versions/${missingVersionId}/clone`,
      headers: adminHeaders(),
      payload: {}
    })
    const transitionMissing = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/versions/${missingVersionId}/transition`,
      headers: adminHeaders(),
      payload: { target: 'TESTING' }
    })
    const preflightMissing = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/versions/${missingVersionId}/publish-preflight`,
      headers: adminHeaders(),
      payload: {}
    })
    const publishMissing = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/versions/${missingVersionId}/publish`,
      headers: adminHeaders(),
      payload: {
        releaseCandidateId: `release_candidate_${missingUuid}`
      }
    })
    const rollbackMissing = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/rollback`,
      headers: adminHeaders(),
      payload: {
        versionId: missingVersionId,
        releaseCandidateId: `release_candidate_${missingUuid}`
      }
    })
    const invalidAgentId = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents/agent_not-a-uuid/versions',
      headers: adminHeaders()
    })
    const invalidCreate = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: adminHeaders(),
      payload: { slug: '', name: '', description: '' }
    })
    const scopedVersion = await app.inject({
      method: 'GET',
      url: `/v1/admin/agents/agent_${missingUuid}/versions`,
      headers: adminHeaders()
    })
    await app.close()

    expect(cloneMissing.statusCode).toBe(400)
    expect(transitionMissing.statusCode).toBe(400)
    expect(preflightMissing.statusCode).toBe(400)
    expect(publishMissing.statusCode).toBe(400)
    expect(rollbackMissing.statusCode).toBe(400)
    expect(invalidAgentId.statusCode).toBe(400)
    expect(invalidCreate.statusCode).toBe(400)
    expect(scopedVersion.statusCode).toBe(400)
    expect((scopedVersion.json() as Envelope<never>).error?.code).toBe(
      'invalid_action'
    )
    expect(version.id).toMatch(/^agent_version_/)
  })

  it('reports failing safety preflight cases in the publish-preflight report', async () => {
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

    const platform = new UnsafeTraceStore()
    const { agent, version } = await seedApprovedAgent(platform)
    const app = buildServer({ platform })
    const report = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agent.id}/versions/${version.id}/publish-preflight`,
      headers: adminHeaders(),
      payload: {}
    })
    await app.close()

    expect(report.statusCode).toBe(200)
    const body = report.json() as Envelope<{
      passed: boolean
      failures: Array<{ caseId: string }>
    }>
    expect(body.data?.passed).toBe(false)
    expect(body.data?.failures?.length).toBeGreaterThan(0)
    expect(body.data?.failures?.[0]?.caseId).toBeDefined()
  })

  it('rejects capability approval misuse and revoked execution authority', async () => {
    const platform = new InMemoryControlPlaneStore()
    const { agent, version } = await seedApprovedAgent(platform, true)
    const candidate = await createValidatedControlledReleaseCandidate(
      platform,
      tenantA,
      agent.id,
      version.id,
      'admin.coverage'
    )
    await platform.publishVersion(
      { tenantId: tenantA },
      version.id,
      candidate.id
    )
    const app = buildServer({ platform })
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const supervisorHeaders = (operatorId: string) => ({
      'x-operator-id': operatorId,
      'x-operator-role': 'Supervisor',
      'x-tenant-id': tenantA
    })
    const operatorHeaders = {
      'x-operator-id': 'operator.coverage',
      'x-operator-role': 'Operator',
      'x-tenant-id': tenantA
    }

    const wrongIssuer = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders('supervisor.issuer'),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.other',
        nonce: 'coverage-nonce-1234',
        input: { message: 'Quero agendar uma consulta' },
        expiresAt
      }
    })
    const wrongIssuerApproval = (wrongIssuer.json() as Envelope<{ id: string }>)
      .data
    const revokeByOther = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${wrongIssuerApproval?.id}/revoke`,
      headers: supervisorHeaders('supervisor.other')
    })
    const actorMismatch = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${wrongIssuerApproval?.id}/execute`,
      headers: operatorHeaders,
      payload: { message: 'Quero agendar uma consulta', history: [] }
    })

    const unusedTool = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders('supervisor.issuer'),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.coverage',
        input: { message: 'Mensagem sem intenção de agendamento' },
        expiresAt
      }
    })
    const unusedToolApproval = (unusedTool.json() as Envelope<{ id: string }>)
      .data
    const notConsumed = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${unusedToolApproval?.id}/execute`,
      headers: operatorHeaders,
      payload: {
        message: 'Olá',
        history: [],
        approvedKnowledge: {
          version: 'coverage-v1',
          answer: 'Resposta fictícia.',
          source: 'controlled://coverage/knowledge'
        }
      }
    })

    const archived = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders('supervisor.issuer'),
      payload: {
        agentId: agent.id,
        versionId: version.id,
        toolName: 'find_available_slots',
        actorId: 'operator.coverage',
        input: { message: 'Quero agendar uma consulta' },
        expiresAt
      }
    })
    const archivedApproval = (archived.json() as Envelope<{ id: string }>).data
    await platform.transitionVersion(
      { tenantId: tenantA },
      version.id,
      'ARCHIVED'
    )
    const goneVersion = await app.inject({
      method: 'POST',
      url: `/v1/admin/capability-approvals/${archivedApproval?.id}/execute`,
      headers: operatorHeaders,
      payload: { message: 'Quero agendar uma consulta', history: [] }
    })

    const draftVersion = await platform.createVersion(
      { tenantId: tenantA },
      agent.id,
      config(true),
      'admin.coverage'
    )
    const unapprovedVersion = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: supervisorHeaders('supervisor.issuer'),
      payload: {
        agentId: agent.id,
        versionId: draftVersion.id,
        toolName: 'find_available_slots',
        actorId: 'operator.coverage',
        input: { message: 'Quero agendar uma consulta' },
        expiresAt
      }
    })
    await app.close()

    expect(wrongIssuer.statusCode).toBe(200)
    expect(revokeByOther.statusCode).toBe(400)
    expect(actorMismatch.statusCode).toBe(403)
    expect(notConsumed.statusCode).toBe(400)
    expect(goneVersion.statusCode).toBe(400)
    expect(unapprovedVersion.statusCode).toBe(400)
    expect(
      (unapprovedVersion.json() as Envelope<never>).error?.message
    ).toMatch(/approved agent version/i)
  })
})
