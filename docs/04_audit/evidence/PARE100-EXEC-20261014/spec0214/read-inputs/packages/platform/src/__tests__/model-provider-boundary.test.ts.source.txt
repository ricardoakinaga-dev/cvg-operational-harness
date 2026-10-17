import { describe, expect, it, vi } from 'vitest'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  createDryRunModelProvider,
  executeConfiguredAgent,
  type PlatformEventBus
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000240'

const baseModel = {
  provider: 'fake',
  model: 'deterministic-v1',
  temperature: 0,
  maxTokens: 128,
  timeoutMs: 1000,
  retries: 0,
  secretRef: 'secret://controlled/model-boundary'
}

function createConfig(model = baseModel) {
  return AgentConfigSchema.parse({
    persona: { name: 'Controlled', role: 'secretary', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [
      {
        id: 'model-boundary',
        kind: 'instruction',
        content: 'Use somente configuração fictícia.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: { unknown: 'Não compreendi.' },
    model,
    policies: {
      version: 'model-boundary-policy-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

describe('controlled model provider boundary', () => {
  it.each([
    { provider: 'openai', model: 'gpt-controlled-fixture' },
    { provider: 'fake', model: 'deterministic-v2' }
  ])(
    'rejects an unsupported $provider/$model identity',
    ({ provider, model }) => {
      expect(() =>
        createDryRunModelProvider({ ...baseModel, provider, model })
      ).toThrowError(/controlled|provider|model|supported/i)
    }
  )

  it('does not silently ignore a configured fallback provider', () => {
    expect(() =>
      createDryRunModelProvider({ ...baseModel, fallbackProvider: 'fake' })
    ).toThrowError(/fallback|controlled|supported/i)
  })

  it('rejects an unsupported identity before emitting runtime lifecycle events', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'model-boundary-agent',
        name: 'Model Boundary Agent',
        description: 'Controlled provider identity fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      createConfig({ ...baseModel, provider: 'openrouter', model: 'external' }),
      'model-boundary.test'
    )
    const eventBus = {
      emit: vi.fn().mockResolvedValue(undefined)
    } as unknown as PlatformEventBus

    await expect(
      executeConfiguredAgent({
        store,
        tenantId,
        agentId: agent.id,
        versionId: version.id,
        message: 'Mensagem fictícia',
        history: [],
        executionMode: 'TEST_LAB',
        eventBus
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    expect(eventBus.emit).not.toHaveBeenCalled()
  })
})
