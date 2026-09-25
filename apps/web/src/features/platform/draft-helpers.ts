/**
 * AUD19-011 — pure draft/config/manifest builders extracted from
 * `PlatformPanel` (`index.tsx`).
 *
 * Owner: frontend/platform. No React, no network, no side effects: pure
 * functions over draft forms and version configs, covered by the existing
 * platform characterization suite (unchanged behavior).
 */
import { redactSensitiveText } from '@cvg/shared'
import type {
  PlatformAgentView,
  PlatformPluginManifestView
} from '../../api/client.ts'
import {
  parsePromptProfile,
  serializePromptBlocks,
  serializeResponseTemplates
} from './prompt-profile.ts'

export type HandoffPriority = 'low' | 'medium' | 'high'

export interface DraftForm {
  slug: string
  name: string
  description: string
  personaName: string
  personaRole: string
  tone: string
  greeting: string
  promptBlocksText: string
  responseTemplatesText: string
  provider: string
  model: string
  clarifyThreshold: string
  handoffThreshold: string
  maxClarifications: string
  handoffDestinations: string
  handoffPriority: HandoffPriority
  knowledgeSource: string
  knowledgeVersion: string
  pluginName: string
  pluginVersion: string
  pluginTools: string
  pluginEnabled: boolean
  schedulingEnabled: boolean
}

export const initialForm: DraftForm = {
  slug: '',
  name: '',
  description: '',
  personaName: '',
  personaRole: 'assistant',
  tone: 'calm',
  greeting: '',
  promptBlocksText: serializePromptBlocks(undefined),
  responseTemplatesText: serializeResponseTemplates({
    unknown: 'Vou encaminhar sua solicitação.'
  }),
  provider: 'fake',
  model: 'deterministic-v1',
  clarifyThreshold: '0.7',
  handoffThreshold: '0',
  maxClarifications: '2',
  handoffDestinations: 'controlled-reception',
  handoffPriority: 'medium',
  knowledgeSource: '',
  knowledgeVersion: 'controlled-v1',
  pluginName: '',
  pluginVersion: '',
  pluginTools: '',
  pluginEnabled: false,
  schedulingEnabled: false
}

export function formFromVersion(
  agent: PlatformAgentView,
  rawConfig: Record<string, unknown>
): DraftForm {
  const persona = asRecord(rawConfig.persona)
  const model = asRecord(rawConfig.model)
  const policies = asRecord(rawConfig.policies)
  const handoff = asRecord(rawConfig.handoff)
  const knowledge = Array.isArray(rawConfig.knowledge)
    ? rawConfig.knowledge
        .map(asRecord)
        .find((item) => typeof item.source === 'string')
    : undefined
  const plugins = Array.isArray(rawConfig.plugins)
    ? rawConfig.plugins.map(asRecord)
    : []
  const scheduling = plugins.find(
    (plugin) => plugin.plugin === 'scheduling.controlled'
  )
  const customPlugin = plugins.find(
    (plugin) => plugin.plugin !== 'scheduling.controlled'
  )
  const customTools = Array.isArray(customPlugin?.allowedTools)
    ? customPlugin.allowedTools.filter(
        (tool): tool is string => typeof tool === 'string'
      )
    : []
  const destinations = Array.isArray(handoff.destinations)
    ? handoff.destinations.filter(
        (destination): destination is string => typeof destination === 'string'
      )
    : []
  const fallbackDestination = readString(
    handoff.lowConfidenceDestination,
    'controlled-reception'
  )
  const configuredDestinations = destinations.length
    ? destinations
    : [fallbackDestination]
  const clarifyThreshold =
    typeof policies.clarifyThreshold === 'number'
      ? policies.clarifyThreshold
      : typeof policies.minConfidence === 'number'
        ? policies.minConfidence
        : 0.7
  const handoffThreshold =
    typeof policies.handoffThreshold === 'number'
      ? policies.handoffThreshold
      : 0
  const maxClarifications =
    typeof policies.maxClarifications === 'number'
      ? policies.maxClarifications
      : typeof handoff.maxClarifications === 'number'
        ? handoff.maxClarifications
        : 2
  const handoffPriority: HandoffPriority =
    handoff.priority === 'low' ||
    handoff.priority === 'medium' ||
    handoff.priority === 'high'
      ? handoff.priority
      : 'medium'
  return {
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    personaName: readString(persona.name, agent.name),
    personaRole: readString(persona.role, 'assistant'),
    tone: readString(persona.tone, 'calm'),
    greeting: readString(rawConfig.greeting, 'Como posso ajudar?'),
    promptBlocksText: serializePromptBlocks(rawConfig.promptBlocks),
    responseTemplatesText: serializeResponseTemplates(
      rawConfig.responseTemplates
    ),
    provider: readString(model.provider, 'fake'),
    model: readString(model.model, 'deterministic-v1'),
    clarifyThreshold: String(clarifyThreshold),
    handoffThreshold: String(handoffThreshold),
    maxClarifications: String(maxClarifications),
    handoffDestinations: configuredDestinations.join(', '),
    handoffPriority,
    knowledgeSource: readString(knowledge?.source, ''),
    knowledgeVersion: readString(knowledge?.version, 'controlled-v1'),
    pluginName: readString(customPlugin?.plugin, ''),
    pluginVersion: readString(customPlugin?.version, ''),
    pluginTools: customTools.join(','),
    pluginEnabled: customPlugin?.enabled === true,
    schedulingEnabled: scheduling?.enabled === true
  }
}

export function buildPluginCatalogManifest(
  form: DraftForm
): { value: PlatformPluginManifestView } | { error: string } {
  const name = form.pluginName.trim()
  const version = form.pluginVersion.trim() || '1.0.0'
  const tools = Array.from(
    new Set(
      form.pluginTools
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean)
    )
  )
  const identifierPattern = /^[A-Za-z0-9._:-]+$/
  if (!name || name.length > 120 || !identifierPattern.test(name)) {
    return {
      error:
        'Informe um nome de plugin válido para a metadata (somente letras, números, ponto, sublinhado, dois-pontos ou hífen).'
    }
  }
  if (version.length > 80) {
    return { error: 'A versão da metadata do plugin é muito longa.' }
  }
  if (
    tools.some((tool) => tool.length > 120 || !identifierPattern.test(tool))
  ) {
    return {
      error:
        'Cada tool do catálogo deve usar somente letras, números, ponto, sublinhado, dois-pontos ou hífen.'
    }
  }
  const permissions = tools.map((tool) => `plugin:${name}:${tool}`)
  return {
    value: {
      name,
      version,
      capabilities: tools.map((tool) => `controlled:${name}:${tool}`),
      permissions,
      tools: tools.map((tool) => {
        const permission = `plugin:${name}:${tool}`
        return {
          name: tool,
          permission,
          risk: 'low',
          requiresApproval: false
        }
      }),
      hooks: [],
      dependencies: [],
      configSchemaVersion: '1'
    }
  }
}

export function buildConfig(
  form: DraftForm,
  rawBaseConfig?: Record<string, unknown>
): { value: Record<string, unknown> } | { error: string } {
  const base = rawBaseConfig ? structuredClone(rawBaseConfig) : {}
  const pluginName = form.pluginName.trim()
  const pluginVersion = form.pluginVersion.trim()
  const pluginTools = form.pluginTools
    .split(',')
    .map((tool) => tool.trim())
    .filter(Boolean)
  const source = form.knowledgeSource.trim()
  const clarifyThreshold = Number(form.clarifyThreshold)
  const handoffThreshold = Number(form.handoffThreshold)
  const maxClarifications = Number(form.maxClarifications)
  const destinationParts = form.handoffDestinations
    .split(',')
    .map((destination) => destination.trim())
  const destinations = destinationParts.filter(Boolean)
  const basePolicies = asRecord(base.policies)
  if (
    form.clarifyThreshold.trim().length === 0 ||
    !Number.isFinite(clarifyThreshold) ||
    clarifyThreshold < 0 ||
    clarifyThreshold > 1
  ) {
    return { error: 'O threshold de clarificação deve estar entre 0 e 1.' }
  }
  if (
    form.handoffThreshold.trim().length === 0 ||
    !Number.isFinite(handoffThreshold) ||
    handoffThreshold < 0 ||
    handoffThreshold > 1
  ) {
    return { error: 'O threshold de handoff deve estar entre 0 e 1.' }
  }
  if (handoffThreshold > clarifyThreshold) {
    return {
      error:
        'O threshold de handoff não pode ser maior que o threshold de clarificação.'
    }
  }
  if (
    form.maxClarifications.trim().length === 0 ||
    !Number.isInteger(maxClarifications) ||
    maxClarifications < 0 ||
    maxClarifications > 5
  ) {
    return {
      error: 'O máximo de clarificações deve ser um inteiro entre 0 e 5.'
    }
  }
  if (destinations.length === 0 || destinations.length > 32) {
    return {
      error: 'Informe entre 1 e 32 destinos de handoff controlados.'
    }
  }
  if (destinationParts.some((destination) => destination.length === 0)) {
    return {
      error: 'Os destinos de handoff não podem conter itens vazios.'
    }
  }
  if (destinations.some((destination) => destination.length > 120)) {
    return {
      error: 'Cada destino de handoff pode ter no máximo 120 caracteres.'
    }
  }
  const destinationPattern = /^[A-Za-z0-9._:-]+$/
  if (
    destinations.some((destination) => !destinationPattern.test(destination))
  ) {
    return {
      error:
        'Cada destino de handoff deve usar somente letras, números, ponto, sublinhado, dois-pontos ou hífen.'
    }
  }
  if (new Set(destinations).size !== destinations.length) {
    return { error: 'Os destinos de handoff não podem se repetir.' }
  }
  if (
    form.handoffPriority !== 'low' &&
    form.handoffPriority !== 'medium' &&
    form.handoffPriority !== 'high'
  ) {
    return { error: 'A prioridade de handoff é inválida.' }
  }
  const baseEnabledActions = readStringArray(basePolicies.enabledActions)
  const enabledActions = (
    baseEnabledActions.length
      ? baseEnabledActions
      : ['respond', 'institutional_question']
  ).filter((action) => action !== 'scheduling')
  if (form.schedulingEnabled) enabledActions.push('scheduling')
  const promptProfile = parsePromptProfile({
    promptBlocksText: form.promptBlocksText,
    responseTemplatesText: form.responseTemplatesText,
    basePromptBlocks: base.promptBlocks,
    baseResponseTemplates: base.responseTemplates
  })
  if ('error' in promptProfile) return promptProfile
  return {
    value: {
      ...base,
      persona: {
        ...asRecord(base.persona),
        name: form.personaName.trim() || form.name.trim(),
        role: form.personaRole.trim() || 'assistant',
        tone: form.tone.trim() || 'calm'
      },
      greeting: form.greeting.trim() || 'Como posso ajudar?',
      promptBlocks: promptProfile.value.promptBlocks,
      responseTemplates: promptProfile.value.responseTemplates,
      model: {
        ...asRecord(base.model),
        provider: form.provider.trim() || 'fake',
        model: form.model.trim() || 'deterministic-v1',
        temperature: 0,
        maxTokens: 512,
        timeoutMs: 3000,
        retries: 0,
        secretRef: `secret://controlled/${form.provider.trim() || 'fake'}`
      },
      featureFlags: {
        ...asRecord(base.featureFlags),
        testLab: true,
        realChannels: false,
        realRag: false,
        realPayments: false,
        realMedicalRecords: false
      },
      policies: {
        ...basePolicies,
        version: 'policy-ui-draft-v1',
        minConfidence: clarifyThreshold,
        clarifyThreshold,
        handoffThreshold,
        lowConfidence:
          basePolicies.lowConfidence === 'handoff' ? 'handoff' : 'clarify',
        maxClarifications,
        enabledActions: [...new Set(enabledActions)],
        approvalActions: readStringArray(basePolicies.approvalActions).length
          ? readStringArray(basePolicies.approvalActions)
          : ['create_appointment_draft'],
        blockedActions: readStringArray(basePolicies.blockedActions).length
          ? readStringArray(basePolicies.blockedActions)
          : ['confirm_appointment', 'cancel_appointment']
      },
      plugins: buildPlugins(
        form,
        base.plugins,
        pluginName,
        pluginVersion,
        pluginTools
      ),
      knowledge: source
        ? [
            {
              source,
              version: form.knowledgeVersion.trim() || 'controlled-v1',
              enabled: true,
              requiresApprovedSource: true
            }
          ]
        : [],
      handoff: {
        lowConfidenceDestination: destinations[0],
        destinations,
        maxClarifications,
        priority: form.handoffPriority
      }
    }
  }
}

export function buildPlugins(
  form: DraftForm,
  rawPlugins: unknown,
  pluginName: string,
  pluginVersion: string,
  pluginTools: string[]
): Array<Record<string, unknown>> {
  const plugins = Array.isArray(rawPlugins) ? rawPlugins.map(asRecord) : []
  const scheduling = plugins.find(
    (plugin) => plugin.plugin === 'scheduling.controlled'
  )
  const withoutScheduling = plugins.filter(
    (plugin) => plugin.plugin !== 'scheduling.controlled'
  )
  const nextScheduling = scheduling
    ? {
        ...scheduling,
        version: '1.0.0',
        enabled: form.schedulingEnabled,
        allowedTools: ['find_available_slots']
      }
    : form.schedulingEnabled
      ? {
          plugin: 'scheduling.controlled',
          version: '1.0.0',
          enabled: true,
          allowedTools: ['find_available_slots'],
          config: {}
        }
      : null
  const existingCustom = withoutScheduling.find(
    (plugin) => plugin.plugin === pluginName
  )
  const custom = pluginName
    ? {
        ...withoutPluginVersion(existingCustom),
        plugin: pluginName,
        ...(pluginVersion ? { version: pluginVersion } : {}),
        enabled: form.pluginEnabled,
        allowedTools: pluginTools,
        config: existingCustom ? asRecord(existingCustom.config) : {}
      }
    : null
  const preservedCustom = pluginName
    ? withoutScheduling.filter((plugin) => plugin.plugin !== pluginName)
    : withoutScheduling
  return [
    ...preservedCustom,
    ...(nextScheduling ? [nextScheduling] : []),
    ...(custom ? [custom] : [])
  ]
}

export function withoutPluginVersion(
  plugin: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!plugin) return {}
  return Object.fromEntries(
    Object.entries(plugin).filter(([key]) => key !== 'version')
  )
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback
}

export function traceText(value: unknown, fallback = 'unknown'): string {
  return typeof value === 'string' ? redactSensitiveText(value) : fallback
}

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === 'string' && item.trim().length > 0
      )
    : []
}
