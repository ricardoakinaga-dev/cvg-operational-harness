import { DomainError, redactSensitiveText, type Channel } from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  canBotRespond,
  TenantIdSchema,
  assessConversationSafety,
  sanitizeTraceForPersistence,
  type AgentId,
  type PluginAuditEvent,
  type TenantId,
  type AgentVersionId,
  type ControlPlaneStore
} from '@cvg/platform'
import {
  TenantScopedPostgresRuntimeRepository,
  type SessionRecord
} from '@cvg/persistence'
import { executePublishedAgent, getConversationTimeline } from '@cvg/agent-core'
import { z } from 'zod'
import {
  HmacWebhookVerifier,
  type WebhookReplayStore,
  type WebhookVerificationLease
} from './webhook-security.ts'
import {
  AgentRuntimeOptions,
  BuildServerOptions,
  InboundTenantResolver,
  WebhookVerification,
  WebhookVerifier
} from './server-options.ts'
import { CONTROLLED_TENANT_ID } from './server-capability.ts'
import { RuntimePersistence } from './server-persistence.ts'

export async function executeInboundRuntime(input: {
  options: AgentRuntimeOptions
  platform: ControlPlaneStore
  tenantId: TenantId
  correlationId: string
  channel: Channel
  senderRef: string
  message: string
  conversationId: string
  sessionId: string | null
  messageId: string
  audit: Pick<RuntimePersistence['audit'], 'append'>
  conversations: RuntimePersistence['conversations']
  sessionVersionPinning: boolean
}) {
  let history: string[] = []
  let session: SessionRecord | null = null
  let parsedAgentId: AgentId | undefined
  let pinnedVersionId: AgentVersionId | undefined
  const toolAuditEvents: PluginAuditEvent[] = []
  if (input.sessionId) {
    const timeline = await getConversationTimeline(
      input.conversations,
      input.tenantId,
      input.conversationId
    )
    session =
      timeline.sessions.find((candidate) => candidate.id === input.sessionId) ??
      null
    if (!session) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    if (!canBotRespond(session.takeoverState)) {
      return {
        status: 'paused' as const,
        trace: null,
        reason: 'human_takeover_active' as const
      }
    }
    const timelineHistory = timeline.messages
      .filter((message) => message.id !== input.messageId)
      .map(
        (message) =>
          `${message.direction}: ${redactSensitiveText(message.body)}`
      )
    const historicalSafety = assessConversationSafety('', timelineHistory)
    history = timelineHistory.slice(-20)
    // Keep the model context bounded without discarding an older safety
    // signal. The marker carries no user text and is intentionally lexical so
    // the independent Test Lab gate remains conservative after truncation.
    if (historicalSafety.level === 'critical') {
      history = ['history: medication safety signal', ...history]
    } else if (historicalSafety.level === 'high') {
      history = ['history: unresolved symptom dor signal', ...history]
    }
  }
  if (session) {
    const hasAgent = session.agentId !== undefined
    const hasVersion = session.agentVersionId !== undefined
    if (hasAgent !== hasVersion) {
      throw new DomainError(
        'invalid_action',
        'Session agent binding is incomplete'
      )
    }
    if (hasAgent && hasVersion) {
      parsedAgentId = AgentIdSchema.parse(session.agentId)
      pinnedVersionId = AgentVersionIdSchema.parse(session.agentVersionId)
    }
  }
  if (!parsedAgentId) {
    const agentId = await input.options.resolveAgentId({
      tenantId: input.tenantId,
      channel: input.channel,
      senderRef: input.senderRef
    })
    if (!agentId) {
      await input.conversations.markInboundRuntimeCompleted(
        input.messageId,
        input.tenantId
      )
      return {
        status: 'not_configured' as const,
        trace: null,
        reason: 'agent_mapping_missing' as const
      }
    }
    parsedAgentId = AgentIdSchema.parse(agentId)
    if (session && input.sessionVersionPinning) {
      const published = await input.platform.resolvePublished(
        { tenantId: input.tenantId },
        parsedAgentId
      )
      if (!published) {
        await input.conversations.markInboundRuntimeCompleted(
          input.messageId,
          input.tenantId
        )
        return {
          status: 'not_configured' as const,
          trace: null,
          reason: 'published_version_missing' as const
        }
      }
      if (!input.sessionId) {
        throw new DomainError(
          'invalid_action',
          'Session id is required for runtime pinning'
        )
      }
      const bound = await input.conversations.bindSessionAgentVersion(
        input.tenantId,
        input.sessionId,
        parsedAgentId,
        published.id
      )
      if (!bound?.agentId || !bound.agentVersionId) {
        throw new DomainError(
          'invalid_action',
          'Session agent binding could not be established'
        )
      }
      parsedAgentId = AgentIdSchema.parse(bound.agentId)
      pinnedVersionId = AgentVersionIdSchema.parse(bound.agentVersionId)
    }
  }
  if (!parsedAgentId) {
    throw new DomainError(
      'invalid_action',
      'Agent mapping could not be resolved'
    )
  }
  const result = await executePublishedAgent({
    store: input.platform,
    tenantId: input.tenantId,
    agentId: parsedAgentId,
    ...(pinnedVersionId ? { versionId: pinnedVersionId } : {}),
    message: input.message,
    history,
    ...(input.options.capabilityGateway
      ? { capabilityGateway: input.options.capabilityGateway }
      : {}),
    ...(input.options.actor ? { actor: input.options.actor } : {}),
    ...(input.options.resolveCapabilityApproval
      ? { resolveCapabilityApproval: input.options.resolveCapabilityApproval }
      : {}),
    onToolAudit: async (event) => {
      if (input.options.completeInboundRuntime) {
        toolAuditEvents.push(event)
        return
      }
      await input.audit.append(
        {
          type: event.type,
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: event.correlationId,
          policyVersion: 'plugin-gateway-v1',
          payload: {
            tenantId: event.tenantId,
            agentId: event.agentId,
            versionId: event.versionId,
            traceId: event.traceId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            plugin: event.plugin,
            toolName: event.toolName,
            status: event.status,
            payload: event.payload
          }
        },
        event.tenantId
      )
    },
    context: {
      conversationId: input.conversationId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {})
    },
    ...(input.options.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: input.options.resolveApprovedKnowledge }
      : {}),
    ...(input.options.approvedKnowledge &&
    !input.options.resolveApprovedKnowledge
      ? { approvedKnowledge: input.options.approvedKnowledge }
      : {})
  })
  if (result.status === 'completed') {
    const safeTrace = sanitizeTraceForPersistence(result.trace)
    if (input.options.completeInboundRuntime) {
      const completion = await input.options.completeInboundRuntime({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        sessionId: input.sessionId,
        inboundMessageId: input.messageId,
        trace: safeTrace,
        toolAuditEvents,
        correlationId: input.correlationId
      })
      if (completion.status === 'paused') {
        return {
          status: 'paused' as const,
          trace: null,
          reason: 'human_takeover_active' as const
        }
      }
      return { ...result, trace: safeTrace }
    }
    if (input.sessionId) {
      const latestTimeline = await getConversationTimeline(
        input.conversations,
        input.tenantId,
        input.conversationId
      )
      const latestSession = latestTimeline.sessions.find(
        (candidate) => candidate.id === input.sessionId
      )
      if (!latestSession || !canBotRespond(latestSession.takeoverState)) {
        return {
          status: 'paused' as const,
          trace: null,
          reason: 'human_takeover_active' as const
        }
      }
    }
    if (safeTrace.handoff.requested && input.sessionId) {
      const session = await input.conversations.transitionTakeover(
        input.tenantId,
        input.sessionId,
        'request_handoff'
      )
      if (!session) {
        throw new DomainError('invalid_action', 'Session not found')
      }
      await input.audit.append(
        {
          type: 'handoff',
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: input.correlationId,
          policyVersion: 'human-takeover-v1',
          payload: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            traceId: safeTrace.traceId,
            state: session.takeoverState,
            reason: safeTrace.handoff.reason,
            effect: 'human_handoff_requested'
          }
        },
        input.tenantId
      )
    }
    if (safeTrace.response.text.trim().length > 0) {
      await input.conversations.appendOutboundMessage({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        externalMessageId: `runtime:${safeTrace.traceId}`,
        body: safeTrace.response.text
      })
    }
    await input.platform.recordExecutionTrace(
      { tenantId: input.tenantId },
      safeTrace
    )
    await input.conversations.markInboundRuntimeCompleted(
      input.messageId,
      input.tenantId
    )
    return { ...result, trace: safeTrace }
  }
  return result
}

export function parseInboundChannel(rawChannel: string): Channel {
  const parsed = z.enum(['whatsapp', 'web', 'internal']).safeParse(rawChannel)
  if (!parsed.success) {
    throw new DomainError('validation_failed', 'Channel is invalid')
  }
  return parsed.data
}

export async function resolveInboundTenant(
  input: Parameters<InboundTenantResolver>[0],
  resolver?: InboundTenantResolver
): Promise<TenantId> {
  if (resolver) return TenantIdSchema.parse(await resolver(input))
  if (process.env.NODE_ENV !== 'test') {
    throw new DomainError(
      'unauthorized',
      'A trusted inbound tenant resolver is required in production'
    )
  }
  const rawHeader = input.headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsed = TenantIdSchema.safeParse(candidate)
  return parsed.success ? parsed.data : CONTROLLED_TENANT_ID
}

export function withDefaultInboundCompletion(
  agentRuntime: AgentRuntimeOptions | undefined,
  persistence: BuildServerOptions['persistence']
): AgentRuntimeOptions | undefined {
  if (
    !agentRuntime ||
    agentRuntime.completeInboundRuntime ||
    persistence?.kind !== 'postgres-pool'
  ) {
    return agentRuntime
  }
  const runtime = new TenantScopedPostgresRuntimeRepository(persistence.pool)
  return {
    ...agentRuntime,
    completeInboundRuntime: (input) => runtime.completeInboundRuntime(input)
  }
}

export function createConfiguredWebhookVerifier(
  env: NodeJS.ProcessEnv,
  configuredVerifier: WebhookVerifier | undefined,
  replayStore: WebhookReplayStore | undefined
): WebhookVerifier | undefined {
  if (configuredVerifier) return configuredVerifier
  if (env.NODE_ENV === 'test') return undefined
  const secret = env.WEBHOOK_SIGNING_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'WEBHOOK_SIGNING_SECRET is required outside test mode when no verifier is injected'
    )
  }
  if (
    env.NODE_ENV === 'production' &&
    (secret.length < 32 || /replace[_-]?me|change[_-]?me|example/i.test(secret))
  ) {
    throw new Error(
      'Production webhook signing secret must contain at least 32 non-placeholder characters'
    )
  }
  if (env.NODE_ENV === 'production' && !replayStore) {
    throw new Error(
      'Production requires a distributed webhook replay store when no verifier is injected'
    )
  }
  return new HmacWebhookVerifier({
    secret,
    ...(replayStore ? { replayStore } : {})
  }).verifyWithLease
}

export function createConfiguredInboundTenantResolver(
  env: NodeJS.ProcessEnv,
  configuredResolver: InboundTenantResolver | undefined
): InboundTenantResolver | undefined {
  if (configuredResolver) return configuredResolver
  const rawTenantId = env.INBOUND_TENANT_ID?.trim()
  if (!rawTenantId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Production requires INBOUND_TENANT_ID or an injected tenant resolver'
      )
    }
    return undefined
  }
  const tenantId = TenantIdSchema.safeParse(rawTenantId)
  if (!tenantId.success) {
    throw new Error('INBOUND_TENANT_ID must be a valid tenant identifier')
  }
  return () => tenantId.data
}

export function createConfiguredInboundAgentRuntime(
  env: NodeJS.ProcessEnv,
  configuredRuntime: AgentRuntimeOptions | undefined
): AgentRuntimeOptions | undefined {
  if (configuredRuntime) return configuredRuntime
  const rawAgentId = env.INBOUND_AGENT_ID?.trim()
  if (!rawAgentId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Production requires INBOUND_AGENT_ID or an injected agent runtime'
      )
    }
    return undefined
  }
  const agentId = AgentIdSchema.safeParse(rawAgentId)
  if (!agentId.success) {
    throw new Error('INBOUND_AGENT_ID must be a valid agent id')
  }
  return {
    resolveAgentId: () => agentId.data
  }
}

export function isWebhookVerificationLease(
  value: WebhookVerification
): value is WebhookVerificationLease {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.verified === true &&
    typeof value.commit === 'function' &&
    typeof value.release === 'function'
  )
}
