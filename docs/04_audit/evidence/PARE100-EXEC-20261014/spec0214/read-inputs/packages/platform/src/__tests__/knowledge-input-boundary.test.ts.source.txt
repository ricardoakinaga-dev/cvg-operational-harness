import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  executeConfiguredAgent,
  InMemoryControlPlaneStore
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000141'

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
      {
        source: 'controlled://institutional-hours',
        version: 'v1',
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

describe('controlled knowledge input boundary', () => {
  it('rejects external source before runtime execution', async () => {
    const fixture = await createFixture()

    await expect(
      executeConfiguredAgent({
        store: fixture.store,
        tenantId,
        agentId: fixture.agent.id,
        versionId: fixture.version.id,
        message: 'Qual o horário de funcionamento?',
        history: [],
        executionMode: 'TEST_LAB',
        approvedKnowledge: {
          source: 'https://external.example/source',
          version: 'v1',
          answer: 'Resposta externa.'
        } as never
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('rejects oversized answer and unknown fields at the runtime boundary', async () => {
    const fixture = await createFixture()

    await expect(
      executeConfiguredAgent({
        store: fixture.store,
        tenantId,
        agentId: fixture.agent.id,
        versionId: fixture.version.id,
        message: 'Qual o horário de funcionamento?',
        history: [],
        executionMode: 'TEST_LAB',
        approvedKnowledge: {
          source: 'controlled://institutional-hours',
          version: 'v1',
          answer: 'x'.repeat(4001),
          unexpected: true
        } as never
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
  })

  it('accepts a bounded answer only when its configured source matches', async () => {
    const fixture = await createFixture()
    const trace = await executeConfiguredAgent({
      store: fixture.store,
      tenantId,
      agentId: fixture.agent.id,
      versionId: fixture.version.id,
      message: 'Qual o horário de funcionamento?',
      history: [],
      executionMode: 'TEST_LAB',
      approvedKnowledge: {
        source: 'controlled://institutional-hours',
        version: 'v1',
        answer: 'Horário fictício.'
      }
    })

    expect(trace.knowledge).toEqual({
      status: 'answered',
      source: 'controlled://institutional-hours',
      version: 'v1'
    })
  })
})
