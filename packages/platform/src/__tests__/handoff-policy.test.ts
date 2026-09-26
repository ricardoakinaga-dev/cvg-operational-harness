import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  createControlledAgentConfig,
  evaluatePlatformPolicy,
  InMemoryControlPlaneStore,
  runTestLab
} from '../index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000081'

function configuredPolicy() {
  const base = createControlledAgentConfig()
  return AgentConfigSchema.parse({
    ...base,
    policies: {
      ...base.policies,
      minConfidence: 0.65,
      clarifyThreshold: 0.65,
      handoffThreshold: 0.4,
      lowConfidence: 'clarify',
      maxClarifications: 2
    },
    handoff: {
      ...base.handoff,
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception', 'controlled-supervisor'],
      priority: 'low'
    }
  })
}

describe('controlled handoff policy', () => {
  it('validates thresholds, keeps the legacy alias coherent and rejects unsafe ordering', () => {
    const config = configuredPolicy()
    expect(config.policies).toMatchObject({
      minConfidence: 0.65,
      clarifyThreshold: 0.65,
      handoffThreshold: 0.4
    })

    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        policies: { ...config.policies, handoffThreshold: 0.7 }
      })
    ).toThrow(/handoff|clarif|threshold/i)

    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        policies: { ...config.policies, clarifyThreshold: 0.6 }
      })
    ).toThrow(/minConfidence|clarif|threshold/i)

    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        handoff: {
          ...config.handoff,
          destinations: ['controlled-reception', 'controlled-reception']
        }
      })
    ).toThrow(/destination|duplic/i)

    expect(() =>
      AgentConfigSchema.parse({
        ...config,
        handoff: {
          ...config.handoff,
          destinations: ['controlled reception']
        }
      })
    ).toThrow(/destination|format|invalid/i)
  })

  it('selects direct handoff, clarification and exhaustion deterministically', () => {
    const config = configuredPolicy()
    expect(
      evaluatePlatformPolicy({
        action: 'respond',
        confidence: 0.3,
        config
      })
    ).toMatchObject({
      decision: 'handoff',
      reason: 'low_confidence_handoff_threshold'
    })
    expect(
      evaluatePlatformPolicy({
        action: 'respond',
        confidence: 0.5,
        config,
        clarificationCount: 0
      })
    ).toMatchObject({ decision: 'clarify' })
    expect(
      evaluatePlatformPolicy({
        action: 'respond',
        confidence: 0.5,
        config,
        clarificationCount: 2
      })
    ).toMatchObject({ decision: 'handoff' })
  })

  it('uses configured destination/priority and elevates critical safety handoff', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'handoff-policy-agent',
        name: 'Handoff Policy Agent',
        description: 'Controlled handoff policy fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      configuredPolicy(),
      'admin.handoff'
    )

    const lowConfidence = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Olá',
      history: []
    })
    expect(lowConfidence.handoff).toMatchObject({
      requested: true,
      destination: 'controlled-reception',
      priority: 'low'
    })

    const medication = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Posso dar dipirona?',
      history: []
    })
    expect(medication.handoff).toMatchObject({
      requested: true,
      priority: 'high'
    })
    expect(medication.response.mode).toBe('handoff')
    expect(medication.provider.externalCall).toBe(false)
  })
})
