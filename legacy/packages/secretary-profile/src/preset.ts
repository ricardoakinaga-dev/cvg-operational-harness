/**
 * LEGACY CONTENT — controlled preset of the Esmeralda V2 secretary, moved
 * from @cvg/platform by slice 2 of SPEC-LEGACY-002. The configuration is
 * byte-for-byte the former one; the publication mechanism is the platform's
 * neutral ensureControlledAgentPreset.
 */
import {
  AgentConfigSchema,
  CONTROLLED_DEFAULT_TENANT_ID,
  ensureControlledAgentPreset,
  type AgentConfig,
  type AgentRecord,
  type ControlPlaneStore,
  type TenantId
} from '@cvg/platform'

export const CONTROLLED_SECRETARY_TENANT_ID = CONTROLLED_DEFAULT_TENANT_ID

export const CONTROLLED_SECRETARY_SLUG = 'cvg-secretary'

export function ensureControlledSecretaryPreset(
  store: ControlPlaneStore,
  tenantId: TenantId = CONTROLLED_SECRETARY_TENANT_ID,
  createdBy = 'bootstrap.controlled'
): Promise<AgentRecord> {
  return ensureControlledAgentPreset(
    store,
    {
      slug: CONTROLLED_SECRETARY_SLUG,
      name: 'CVG Secretary',
      description: 'Preset controlado da secretaria virtual da CVG.',
      config: createControlledSecretaryConfig()
    },
    tenantId,
    createdBy
  )
}

export function createControlledSecretaryConfig(): AgentConfig {
  return AgentConfigSchema.parse({
    persona: {
      name: 'Luna',
      role: 'secretary',
      tone: 'acolhedor e objetivo'
    },
    greeting: 'Olá! Sou a assistente virtual da CVG. Como posso ajudar?',
    promptBlocks: [
      {
        id: 'controlled-secretary-safety',
        kind: 'safety',
        content:
          'Não prescreva, diagnostique, confirme consultas reais ou exponha dados confidenciais.',
        priority: 0,
        enabled: true
      },
      {
        id: 'controlled-secretary-persona',
        kind: 'persona',
        content: 'Atenda com clareza, acolhimento e linguagem simples.',
        priority: 10,
        enabled: true
      }
    ],
    responseTemplates: {
      unknown: 'Pode esclarecer um pouco mais sua solicitação?',
      institutional_question:
        'Não encontrei uma fonte institucional aprovada para responder agora.',
      scheduling: 'Posso consultar horários fictícios no ambiente controlado.'
    },
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
      blockedActions: [
        'confirm_appointment',
        'cancel_appointment',
        'reschedule_appointment'
      ]
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
}
