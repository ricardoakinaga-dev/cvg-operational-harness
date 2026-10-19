import {
  AgentConfigSchema,
  createControlledAgentConfig,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  TenantIdSchema,
  type AgentId
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { processAgentTurnJob } from '../worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000138'
)
const knowledge = {
  source: 'controlled://institutional-hours',
  version: 'v1',
  answer: 'Atendimento fictício de segunda a sexta.'
}

async function publishKnowledgeVersion(store: InMemoryControlPlaneStore) {
  const agent = await store.createAgent(
    { tenantId },
    {
      slug: 'worker-knowledge-agent',
      name: 'Worker Knowledge Agent',
      description: 'Controlled worker knowledge fixture'
    }
  )
  const config = AgentConfigSchema.parse({
    ...createControlledAgentConfig(),
    knowledge: [
      {
        source: knowledge.source,
        version: knowledge.version,
        enabled: true,
        requiresApprovedSource: true
      }
    ]
  })
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    config,
    'worker.knowledge.test'
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
    'worker.knowledge.test'
  )
  const published = await store.publishVersion(
    { tenantId },
    approved.id,
    candidate.id
  )
  return { agentId: agent.id, versionId: published.id }
}

describe('published worker knowledge input boundary', () => {
  it('forwards valid controlled knowledge to the pinned runtime', async () => {
    const platform = new InMemoryControlPlaneStore()
    const target = await publishKnowledgeVersion(platform)

    const result = await processAgentTurnJob(
      {
        tenantId,
        agentId: target.agentId,
        versionId: target.versionId,
        message: 'Qual o horário de funcionamento?',
        history: [],
        approvedKnowledge: knowledge,
        conversationId: 'conversation_worker_knowledge',
        sessionId: 'session_worker_knowledge'
      },
      { platform }
    )

    expect(result).toMatchObject({
      status: 'completed',
      trace: {
        tenantId,
        agentId: target.agentId,
        versionId: target.versionId,
        conversationId: 'conversation_worker_knowledge',
        sessionId: 'session_worker_knowledge',
        knowledge: {
          status: 'answered',
          source: knowledge.source,
          version: knowledge.version
        }
      }
    })
  })

  it('accepts the shared bounded history limit and forwards context', async () => {
    const platform = new InMemoryControlPlaneStore()
    const target = await publishKnowledgeVersion(platform)
    const history = Array.from({ length: 21 }, (_, index) => `item-${index}`)

    const result = await processAgentTurnJob(
      {
        tenantId,
        agentId: target.agentId,
        versionId: target.versionId,
        message: 'Qual o horário de funcionamento?',
        history,
        conversationId: 'conversation_worker_knowledge',
        sessionId: 'session_worker_knowledge',
        approvedKnowledge: knowledge
      },
      { platform }
    )

    expect(result.status).toBe('completed')
    expect(result.trace).toMatchObject({
      conversationId: 'conversation_worker_knowledge',
      sessionId: 'session_worker_knowledge',
      knowledge: { status: 'answered' }
    })
  })

  it('rejects history beyond the shared bounded limit before touching the store', async () => {
    const getVersion = vi.fn()
    const platform = { getVersion } as never

    await expect(
      processAgentTurnJob(
        {
          tenantId,
          agentId: 'agent_00000000-0000-4000-8000-000000000138',
          versionId: 'agent_version_00000000-0000-4000-8000-000000000138',
          message: 'Mensagem controlada',
          history: Array.from({ length: 51 }, () => 'item')
        },
        { platform }
      )
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Worker runtime job is invalid'
    })
    expect(getVersion).not.toHaveBeenCalled()
  })

  it('rejects invalid knowledge before touching the store', async () => {
    const getVersion = vi.fn()
    const platform = { getVersion } as never

    await expect(
      processAgentTurnJob(
        {
          tenantId,
          agentId: 'agent_00000000-0000-4000-8000-000000000138' as AgentId,
          versionId: 'agent_version_00000000-0000-4000-8000-000000000138',
          message: 'Qual o horário de funcionamento?',
          history: [],
          approvedKnowledge: {
            ...knowledge,
            source: 'https://external.invalid/source'
          }
        },
        { platform }
      )
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Worker runtime job is invalid'
    })
    expect(getVersion).not.toHaveBeenCalled()
  })

  it('rejects unknown knowledge fields before touching the store', async () => {
    const getVersion = vi.fn()
    const platform = { getVersion } as never

    await expect(
      processAgentTurnJob(
        {
          tenantId,
          agentId: 'agent_00000000-0000-4000-8000-000000000138',
          versionId: 'agent_version_00000000-0000-4000-8000-000000000138',
          message: 'Qual o horário de funcionamento?',
          history: [],
          approvedKnowledge: { ...knowledge, unexpected: true }
        },
        { platform }
      )
    ).rejects.toMatchObject({
      code: 'validation_failed',
      message: 'Worker runtime job is invalid'
    })
    expect(getVersion).not.toHaveBeenCalled()
  })
})
