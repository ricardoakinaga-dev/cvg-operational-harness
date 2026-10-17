import { describe, expect, it, vi } from 'vitest'

vi.mock('../model-provider.ts', async () => {
  const actual = await vi.importActual<typeof import('../model-provider.ts')>(
    '../model-provider.ts'
  )
  return {
    ...actual,
    resolveControlledModelProvider: () => ({
      name: 'fake',
      supportedModels: ['deterministic-v1'],
      complete: vi.fn().mockResolvedValue(null)
    })
  }
})

import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  executeConfiguredAgent
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000242'

describe('controlled malformed model output boundary', () => {
  it('turns a null provider completion into a safe invalid-output fallback', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'malformed-output-agent',
        name: 'Malformed Output Agent',
        description: 'Controlled malformed provider fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      AgentConfigSchema.parse({
        persona: { name: 'Boundary', role: 'assistant', tone: 'calm' },
        greeting: 'Resposta controlada.',
        promptBlocks: [],
        responseTemplates: {},
        model: {
          provider: 'fake',
          model: 'deterministic-v1',
          temperature: 0,
          maxTokens: 128,
          timeoutMs: 1000,
          retries: 0,
          secretRef: 'secret://controlled/malformed-output'
        },
        policies: {
          version: 'malformed-output-v1',
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
      }),
      'malformed-output.test'
    )

    const trace = await executeConfiguredAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Mensagem fictícia',
      history: [],
      executionMode: 'TEST_LAB'
    })

    expect(trace.response).toEqual({
      mode: 'handoff',
      text: 'Vou encaminhar sua solicitação para a equipe responsável.'
    })
    expect(trace.outputPolicy).toEqual({
      decision: 'rewritten',
      reason: 'invalid_output',
      mode: 'handoff',
      redacted: false
    })
    expect(trace.provider).toEqual({
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
})
