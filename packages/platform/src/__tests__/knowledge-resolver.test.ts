import { describe, expect, it } from 'vitest'
import { VersionedKnowledgeCatalog } from '@cvg/rag'
import {
  AgentConfigSchema,
  executeConfiguredAgent,
  InMemoryControlPlaneStore,
  createControlledAgentConfig,
  type ApprovedKnowledgeResolver
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-0000-0000-000000000611' as const

describe('controlled knowledge resolver', () => {
  it('uses the versioned catalog and hands off immediately after revocation', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'catalog-runtime',
        name: 'Catalog Runtime',
        description: 'Controlled catalog resolver fixture'
      }
    )
    const config = AgentConfigSchema.parse({
      ...createControlledAgentConfig(),
      knowledge: [
        {
          source: 'controlled://institutional-hours',
          version: 'fixture-v1',
          enabled: true,
          requiresApprovedSource: true
        }
      ]
    })
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      config,
      'test.knowledge-resolver'
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

    const answered = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      resolveApprovedKnowledge
    })
    expect(answered.knowledge).toMatchObject({
      status: 'answered',
      version: 'fixture-v1'
    })

    await catalog.revoke(tenantId, source.id)
    const revoked = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      resolveApprovedKnowledge
    })
    expect(revoked.knowledge).toEqual({ status: 'approved_source_missing' })
    expect(revoked.handoff).toMatchObject({
      requested: true,
      reason: 'approved_source_missing'
    })
  })
})
