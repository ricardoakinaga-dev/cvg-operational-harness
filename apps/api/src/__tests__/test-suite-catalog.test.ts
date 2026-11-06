import { describe, expect, it } from 'vitest'
import { AgentConfigSchema } from '@cvg/platform'
import { buildServer } from '../server.ts'
import { createSyntheticTestLabComposition } from '../test-lab-composition.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000081'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000082'

const headers = (tenantId: string) => ({
  'x-operator-id': 'admin.suite',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
})

function config() {
  return AgentConfigSchema.parse({
    persona: { name: 'Suite API Agent', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta fictícia.',
    promptBlocks: [],
    responseTemplates: { unknown: 'Handoff fictício.' },
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
      version: 'suite-api-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 1,
      enabledActions: ['respond'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 1
    }
  })
}

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('controlled Test Lab suite API', () => {
  it('creates, evaluates and compares a suite without external effects', async () => {
    const app = buildServer({ testLab: createSyntheticTestLabComposition() })
    const created = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: headers(tenantA),
      payload: {
        slug: 'suite-api-agent',
        name: 'Suite API Agent',
        description: 'Fictício'
      }
    })
    const agentId = (created.json() as Envelope<{ id: string }>).data?.id
    const versionResponse = await app.inject({
      method: 'POST',
      url: `/v1/admin/agents/${agentId}/versions`,
      headers: headers(tenantA),
      payload: { config: config() }
    })
    const versionId = (versionResponse.json() as Envelope<{ id: string }>).data
      ?.id
    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/suites',
      headers: headers(tenantA),
      payload: {
        slug: 'api-smoke-suite',
        name: 'API Smoke Suite',
        description: 'Suite fictícia',
        agentId,
        versionId,
        cases: [
          {
            id: 'hello-case',
            message: 'Olá',
            expectedResponseMode: 'clarify',
            expectedHandoff: false
          }
        ]
      }
    })
    const suite = (suiteResponse.json() as Envelope<{ id: string }>).data
    const evaluation = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/evaluate`,
      headers: headers(tenantA),
      payload: {}
    })
    const comparison = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/compare`,
      headers: headers(tenantA),
      payload: { versionAId: versionId, versionBId: versionId }
    })
    const invalidComparison = await app.inject({
      method: 'POST',
      url: `/v1/admin/test-lab/suites/${suite?.id}/compare`,
      headers: headers(tenantA),
      payload: {
        versionAId: 'agent_version_00000000-0000-4000-8000-000000000099',
        versionBId: versionId
      }
    })
    const scopedSuites = await app.inject({
      method: 'GET',
      url: `/v1/admin/test-lab/suites?agentId=${agentId}`,
      headers: headers(tenantA)
    })
    const otherTenant = await app.inject({
      method: 'GET',
      url: '/v1/admin/test-lab/suites',
      headers: headers(tenantB)
    })
    await app.close()

    expect(suiteResponse.statusCode).toBe(200)
    expect(suite?.id).toMatch(/^test_suite_/)
    expect(evaluation.statusCode).toBe(200)
    expect(
      (evaluation.json() as Envelope<{ passed: boolean }>).data?.passed
    ).toBe(true)
    expect(comparison.statusCode).toBe(200)
    expect(
      (comparison.json() as Envelope<{ variants: unknown[] }>).data?.variants
    ).toHaveLength(2)
    expect(invalidComparison.statusCode).toBe(400)
    expect(scopedSuites.statusCode).toBe(200)
    expect((scopedSuites.json() as Envelope<unknown[]>).data).toHaveLength(1)
    expect(otherTenant.statusCode).toBe(400)
  })
})
