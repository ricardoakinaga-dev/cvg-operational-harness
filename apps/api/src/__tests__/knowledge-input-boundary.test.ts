import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  createControlledAgentConfig,
  InMemoryControlPlaneStore,
  type ApprovedKnowledgeResolver
} from '@cvg/platform'
import { VersionedKnowledgeCatalog } from '@cvg/rag'
import { buildServer } from '../server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000142'

const adminHeaders = {
  'x-operator-id': 'admin.knowledge-boundary',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
}

describe('API controlled knowledge input boundary', () => {
  it('rejects a source identifier above the shared bounded limit', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'knowledge-api-boundary',
        name: 'Knowledge API Boundary',
        description: 'Controlled API fixture'
      }
    )
    const version = await platform.createVersion(
      { tenantId },
      agent.id,
      createControlledAgentConfig(),
      'test.knowledge-api-boundary'
    )
    const app = buildServer({ platform })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: version.id,
        message: 'Qual o horário de funcionamento?',
        history: [],
        approvedKnowledge: {
          source: `controlled://${'x'.repeat(201)}`,
          version: 'v1',
          answer: 'Resposta controlada.'
        }
      }
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'validation_failed' }
    })
  })

  it('resolves the versioned catalog and hands off after revocation', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'knowledge-api-catalog',
        name: 'Knowledge API Catalog',
        description: 'Controlled catalog resolver fixture'
      }
    )
    const version = await platform.createVersion(
      { tenantId },
      agent.id,
      AgentConfigSchema.parse({
        ...createControlledAgentConfig(),
        knowledge: [
          {
            source: 'controlled://institutional-hours',
            version: 'fixture-v1',
            enabled: true,
            requiresApprovedSource: true
          }
        ]
      }),
      'test.knowledge-api-catalog'
    )
    const catalog = new VersionedKnowledgeCatalog()
    const source = catalog.add({
      tenantId,
      version: 'fixture-v1',
      question: 'horário de funcionamento',
      answer: 'Atendimento fictício das 9h às 17h.',
      source: 'fixture-manual'
    })
    await catalog.publish(tenantId, source.id)
    const resolveApprovedKnowledge: ApprovedKnowledgeResolver = ({
      tenantId: scope,
      question
    }) => {
      const answer = catalog.answer(scope, question)
      return answer.status === 'answered' && answer.version && answer.answer
        ? {
            source: 'controlled://institutional-hours',
            version: answer.version,
            answer: answer.answer
          }
        : undefined
    }
    const app = buildServer({
      platform,
      resolveApprovedKnowledge
    })

    const request = {
      method: 'POST' as const,
      url: '/v1/admin/test-lab/runs',
      headers: adminHeaders,
      payload: {
        agentId: agent.id,
        versionId: version.id,
        message: 'Qual o horário de funcionamento?',
        history: []
      }
    }
    const answered = await app.inject(request)
    expect(answered.statusCode).toBe(200)
    expect(answered.json().data.knowledge).toMatchObject({
      status: 'answered',
      version: 'fixture-v1'
    })

    await catalog.revoke(tenantId, source.id)
    const revoked = await app.inject(request)
    await app.close()
    expect(revoked.statusCode).toBe(200)
    expect(revoked.json().data.knowledge).toEqual({
      status: 'approved_source_missing'
    })
    expect(revoked.json().data.handoff).toMatchObject({ requested: true })
  })
})
