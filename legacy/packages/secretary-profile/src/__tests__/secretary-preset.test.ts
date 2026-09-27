import { describe, expect, it } from 'vitest'
import { AgentConfigSchema, InMemoryControlPlaneStore } from '@cvg/platform'
import {
  CONTROLLED_SECRETARY_TENANT_ID,
  ensureControlledSecretaryPreset
} from '../preset.ts'

describe('controlled CVG Secretary preset', () => {
  it('creates one published immutable preset and is idempotent', async () => {
    const store = new InMemoryControlPlaneStore()

    const first = await ensureControlledSecretaryPreset(store)
    const firstVersion = await store.resolvePublished(
      { tenantId: CONTROLLED_SECRETARY_TENANT_ID },
      first.id
    )

    expect(first).toMatchObject({
      tenantId: CONTROLLED_SECRETARY_TENANT_ID,
      slug: 'cvg-secretary',
      name: 'CVG Secretary',
      activeVersionId: firstVersion?.id
    })
    expect(firstVersion).toMatchObject({
      status: 'PUBLISHED',
      config: {
        persona: { name: 'Luna' },
        featureFlags: {
          testLab: true,
          realChannels: false,
          realRag: false,
          realPayments: false,
          realMedicalRecords: false
        },
        plugins: [
          expect.objectContaining({
            plugin: 'scheduling.controlled',
            enabled: true
          })
        ]
      }
    })

    const second = await ensureControlledSecretaryPreset(store)
    const agents = await store.listAgents({
      tenantId: CONTROLLED_SECRETARY_TENANT_ID
    })
    const versions = await store.listVersions(
      { tenantId: CONTROLLED_SECRETARY_TENANT_ID },
      first.id
    )

    expect(second).toEqual(first)
    expect(agents).toHaveLength(1)
    expect(versions).toHaveLength(1)
  })

  it('keeps the preset config compatible with the public schema', () => {
    expect(() =>
      AgentConfigSchema.parse({
        persona: { name: 'Luna', role: 'secretary', tone: 'calm' },
        greeting: 'Olá! Sou a assistente virtual da CVG.',
        promptBlocks: [],
        responseTemplates: { unknown: 'Vou encaminhar sua solicitação.' },
        model: {
          provider: 'fake',
          model: 'deterministic-v1',
          temperature: 0,
          maxTokens: 512,
          timeoutMs: 3000,
          retries: 0,
          secretRef: 'secret://controlled/fake'
        },
        featureFlags: {
          testLab: true,
          realChannels: false,
          realRag: false,
          realPayments: false,
          realMedicalRecords: false
        },
        policies: {
          version: 'controlled-secretary-v1',
          minConfidence: 0.65,
          lowConfidence: 'clarify',
          maxClarifications: 2,
          enabledActions: ['respond', 'institutional_question', 'scheduling'],
          approvalActions: [],
          blockedActions: ['confirm_appointment', 'cancel_appointment']
        },
        plugins: [
          {
            plugin: 'scheduling.controlled',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['find_available_slots'],
            config: {}
          }
        ],
        knowledge: [],
        handoff: {
          lowConfidenceDestination: 'controlled-reception',
          destinations: ['controlled-reception'],
          maxClarifications: 2
        }
      })
    ).not.toThrow()
  })
})
