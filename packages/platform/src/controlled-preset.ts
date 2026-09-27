import type { ControlPlaneStore } from './control-plane-store.ts'
import {
  AgentConfigSchema,
  ReleaseCandidateCreateInputSchema,
  type AgentConfig,
  type AgentRecord,
  type ReleaseCandidateRecord
} from './contracts.ts'
import {
  TenantIdSchema,
  type AgentId,
  type AgentVersionId,
  type TenantId
} from './ids.ts'
import { runCriticalSafetyPreflight } from './critical-safety-preflight.ts'

/**
 * Controlled agent presets (SPEC-LEGACY-002 slice 2). The platform owns the
 * mechanism — create, test, approve, safety-preflight, validate a release
 * candidate and publish — and a neutral controlled configuration. Products
 * supply their own identity and configuration as a ControlledAgentPreset.
 */
export const CONTROLLED_DEFAULT_TENANT_ID = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000001'
)

export interface ControlledAgentPreset {
  slug: string
  name: string
  description: string
  config: AgentConfig
}

export async function createValidatedControlledReleaseCandidate(
  store: ControlPlaneStore,
  tenantId: TenantId,
  agentId: AgentId,
  versionId: AgentVersionId,
  createdBy: string
): Promise<ReleaseCandidateRecord> {
  const scope = { tenantId }
  const candidate = await store.createReleaseCandidate(
    scope,
    ReleaseCandidateCreateInputSchema.parse({
      agentId,
      versionId,
      gateResults: [
        {
          key: 'safety_preflight',
          status: 'PASS',
          evidenceRef: 'controlled://evidence/safety-preflight-v1'
        },
        {
          key: 'test_lab_regression',
          status: 'PASS',
          evidenceRef: 'controlled://evidence/test-lab-regression-v1'
        },
        {
          key: 'snapshot_integrity',
          status: 'PASS',
          evidenceRef: 'controlled://evidence/snapshot-integrity-v1'
        },
        {
          key: 'external_boundary',
          status: 'PASS',
          evidenceRef: 'controlled://evidence/external-boundary-v1'
        }
      ]
    }),
    createdBy
  )
  const validatorId =
    createdBy === 'approver.controlled'
      ? 'admin.controlled'
      : 'approver.controlled'
  return store.transitionReleaseCandidate(
    scope,
    candidate.id,
    'VALIDATED',
    validatorId,
    'DRAFT'
  )
}

/**
 * Idempotently publishes a controlled preset for a tenant: an existing agent
 * with the same slug is returned unchanged.
 */
export async function ensureControlledAgentPreset(
  store: ControlPlaneStore,
  preset: ControlledAgentPreset,
  tenantId: TenantId = CONTROLLED_DEFAULT_TENANT_ID,
  createdBy = 'bootstrap.controlled'
): Promise<AgentRecord> {
  const scope = { tenantId }
  const existing = (await store.listAgents(scope)).find(
    (agent) => agent.slug === preset.slug
  )
  if (existing) return existing

  const agent = await store.createAgent(scope, {
    slug: preset.slug,
    name: preset.name,
    description: preset.description
  })
  const draft = await store.createVersion(
    scope,
    agent.id,
    preset.config,
    createdBy
  )
  const testing = await store.transitionVersion(scope, draft.id, 'TESTING')
  const approved = await store.transitionVersion(scope, testing.id, 'APPROVED')
  const preflight = await runCriticalSafetyPreflight({
    store,
    tenantId,
    agentId: agent.id,
    versionId: approved.id
  })
  if (!preflight.passed) {
    throw new Error(`Controlled preset ${preset.slug} safety preflight failed`)
  }
  const validatedCandidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantId,
    agent.id,
    approved.id,
    createdBy
  )
  await store.publishVersion(scope, approved.id, validatedCandidate.id)
  return (await store.getAgent(scope, agent.id)) ?? agent
}

/**
 * Neutral controlled configuration. The scheduling plugin and the blocked
 * appointment actions are the platform's current controlled scope and its
 * safety preflight requirements, not product identity; they are tracked as
 * HARNESS_REVIEW in legacy/LEGACY_INVENTORY.md until the neutral reference
 * flow (PR-L07) replaces them.
 */
export function createControlledAgentConfig(): AgentConfig {
  return AgentConfigSchema.parse({
    persona: {
      name: 'Assistente',
      role: 'assistant',
      tone: 'claro e objetivo'
    },
    greeting: 'Olá! Sou a assistente virtual. Como posso ajudar?',
    promptBlocks: [
      {
        id: 'controlled-agent-safety',
        kind: 'safety',
        content:
          'Não prescreva, diagnostique, confirme consultas reais ou exponha dados confidenciais.',
        priority: 0,
        enabled: true
      },
      {
        id: 'controlled-agent-persona',
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
      version: 'controlled-agent-v1',
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

/** Neutral reference preset used by harness tests and demos. */
export function createControlledReferencePreset(): ControlledAgentPreset {
  return {
    slug: 'cvg-reference-agent',
    name: 'CVG Reference Agent',
    description: 'Agente de referência controlado do harness.',
    config: createControlledAgentConfig()
  }
}
