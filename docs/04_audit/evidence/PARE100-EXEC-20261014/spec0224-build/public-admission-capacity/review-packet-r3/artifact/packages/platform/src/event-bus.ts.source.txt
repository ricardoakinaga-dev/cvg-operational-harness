import {
  createCorrelationId,
  DomainError,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  type CorrelationId
} from '@cvg/shared'
import {
  AgentExecutionModeSchema,
  type AgentExecutionMode,
  PluginManifestSchema
} from './contracts.ts'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TraceIdSchema,
  TenantIdSchema,
  type AgentId,
  type AgentVersionId,
  type TenantId,
  type TraceId
} from './ids.ts'
import type { RegisteredPlugin } from './plugin-gateway.ts'

export const PLATFORM_EVENT_NAMES = [
  'message.received',
  'message.normalized',
  'conversation.loaded',
  'context.loaded',
  'agent.resolved',
  'policy.input.before',
  'policy.input.after',
  'policy.output.before',
  'policy.output.after',
  'intent.before',
  'intent.after',
  'knowledge.before',
  'knowledge.after',
  'prompt.before',
  'prompt.after',
  'model.before',
  'model.after',
  'model.error',
  'tool.before',
  'tool.after',
  'tool.error',
  'response.before',
  'response.after',
  'handoff.requested',
  'handoff.created',
  'handoff.failed',
  'human_takeover.started',
  'human_takeover.ended',
  'message.delivery.before',
  'message.delivery.after',
  'conversation.completed',
  'security.blocked',
  'plugin.started',
  'plugin.stopped',
  'plugin.error'
] as const

export type PlatformEventName = (typeof PLATFORM_EVENT_NAMES)[number]

const platformEventNameSet = new Set<string>(PLATFORM_EVENT_NAMES)

export interface PlatformEventEnvelope {
  readonly id: CorrelationId
  readonly traceId?: TraceId
  readonly name: PlatformEventName
  readonly tenantId: TenantId
  readonly agentId?: AgentId
  readonly versionId?: AgentVersionId
  readonly executionMode?: AgentExecutionMode
  readonly occurredAt: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly redactedFields: readonly string[]
}

export interface PluginHookContext {
  readonly tenantId: TenantId
  readonly plugin: string
  readonly version: string
  readonly eventName: PlatformEventName
}

export type PluginHookHandler = (
  event: PlatformEventEnvelope,
  context: PluginHookContext
) => void | Promise<void>

export interface PlatformEventInput {
  name: PlatformEventName
  tenantId: TenantId
  traceId?: TraceId
  agentId?: AgentId
  versionId?: AgentVersionId
  executionMode?: AgentExecutionMode
  payload?: unknown
}

export interface PlatformEventDelivery {
  plugin: string
  version: string
  status: 'succeeded' | 'failed'
  error?: string
}

export interface PlatformEventResult {
  event: PlatformEventEnvelope
  deliveries: PlatformEventDelivery[]
}

export interface PlatformHookAuditEvent {
  type: 'plugin_hook'
  correlationId: CorrelationId
  traceId?: TraceId
  tenantId: TenantId
  plugin: string
  version: string
  eventName: PlatformEventName
  status: 'succeeded' | 'failed'
  payload: Readonly<Record<string, unknown>>
  error?: string
}

export interface PlatformEventBusOptions {
  onAudit?: (event: PlatformHookAuditEvent) => void | Promise<void>
}

interface PlatformEventSubscription {
  tenantId: TenantId
  plugin: string
  version: string
  eventName: PlatformEventName
  handler: PluginHookHandler
}

export class PlatformEventBus {
  private readonly subscriptions: readonly PlatformEventSubscription[]

  constructor(
    private readonly options: PlatformEventBusOptions = {},
    subscriptions: readonly PlatformEventSubscription[] = []
  ) {
    this.subscriptions = subscriptions.map(cloneSubscription)
  }

  registerPlugin(input: {
    tenantId: TenantId
    plugin: RegisteredPlugin
  }): PlatformEventBus {
    assertTenantId(input.tenantId)
    const parsedManifest = PluginManifestSchema.safeParse(input.plugin.manifest)
    if (!parsedManifest.success) {
      throw new DomainError('validation_failed', 'Plugin manifest is invalid')
    }
    const manifest = parsedManifest.data
    const hooks = input.plugin.hooks ?? {}

    Object.entries(hooks).forEach(([eventName, handler]) => {
      assertPlatformEventName(eventName)
      if (!manifest.hooks.includes(eventName)) {
        throw new DomainError(
          'validation_failed',
          `Plugin hook ${eventName} is not declared by the manifest`
        )
      }
      if (typeof handler !== 'function') {
        throw new DomainError(
          'validation_failed',
          `Plugin hook ${eventName} requires a handler`
        )
      }
    })

    manifest.hooks.forEach((eventName) => {
      assertPlatformEventName(eventName)
      if (typeof hooks[eventName] !== 'function') {
        throw new DomainError(
          'validation_failed',
          `Plugin hook ${eventName} requires a handler`
        )
      }
    })

    const additions = manifest.hooks.map((eventName) => {
      const duplicate = this.subscriptions.some(
        (subscription) =>
          subscription.tenantId === input.tenantId &&
          subscription.plugin === manifest.name &&
          subscription.version === manifest.version &&
          subscription.eventName === eventName
      )
      if (duplicate) {
        throw new DomainError(
          'conflict',
          `Plugin hook already registered: ${manifest.name}@${manifest.version}/${eventName}`
        )
      }
      return {
        tenantId: input.tenantId,
        plugin: manifest.name,
        version: manifest.version,
        eventName: eventName as PlatformEventName,
        handler: hooks[eventName]!
      }
    })

    return new PlatformEventBus(this.options, [
      ...this.subscriptions,
      ...additions
    ])
  }

  listSubscriptions(): Array<{
    tenantId: TenantId
    plugin: string
    version: string
    eventName: PlatformEventName
  }> {
    return [...this.subscriptions]
      .sort((left, right) => {
        const tenant = left.tenantId.localeCompare(right.tenantId)
        if (tenant !== 0) return tenant
        const plugin = left.plugin.localeCompare(right.plugin)
        if (plugin !== 0) return plugin
        const version = left.version.localeCompare(right.version)
        if (version !== 0) return version
        return left.eventName.localeCompare(right.eventName)
      })
      .map(({ tenantId, plugin, version, eventName }) => ({
        tenantId,
        plugin,
        version,
        eventName
      }))
  }

  async emit(input: PlatformEventInput): Promise<PlatformEventResult> {
    assertPlatformEventName(input.name)
    assertTenantId(input.tenantId)
    assertOptionalScopeIds(input)
    assertOptionalTraceId(input.traceId)
    if (
      input.executionMode !== undefined &&
      !AgentExecutionModeSchema.safeParse(input.executionMode).success
    ) {
      throw new DomainError('validation_failed', 'Execution mode is invalid')
    }

    const sanitized = sanitizeAuditEvidencePayload(input.payload ?? {})
    const payload = asPayloadRecord(sanitized.payload)
    const event = deepFreeze({
      id: createCorrelationId(),
      ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
      name: input.name,
      tenantId: input.tenantId,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.versionId ? { versionId: input.versionId } : {}),
      ...(input.executionMode ? { executionMode: input.executionMode } : {}),
      occurredAt: new Date().toISOString(),
      payload: deepFreeze(payload),
      redactedFields: deepFreeze([...sanitized.redactedFields])
    }) as PlatformEventEnvelope

    const matching = this.subscriptions.filter(
      (subscription) =>
        subscription.tenantId === input.tenantId &&
        subscription.eventName === input.name
    )
    const deliveries: PlatformEventDelivery[] = []
    for (const subscription of matching) {
      const deliveryEvent = cloneFrozenEvent(event)
      const context = deepFreeze({
        tenantId: subscription.tenantId,
        plugin: subscription.plugin,
        version: subscription.version,
        eventName: subscription.eventName
      })
      try {
        await subscription.handler(deliveryEvent, context)
        deliveries.push({
          plugin: subscription.plugin,
          version: subscription.version,
          status: 'succeeded'
        })
        await this.audit({
          event,
          subscription,
          status: 'succeeded'
        })
      } catch (error) {
        const safeError = safeHookError(error)
        deliveries.push({
          plugin: subscription.plugin,
          version: subscription.version,
          status: 'failed',
          error: safeError
        })
        await this.audit({
          event,
          subscription,
          status: 'failed',
          error: safeError
        })
      }
    }

    return {
      event,
      deliveries
    }
  }

  private async audit(input: {
    event: PlatformEventEnvelope
    subscription: PlatformEventSubscription
    status: PlatformHookAuditEvent['status']
    error?: string
  }): Promise<void> {
    if (!this.options.onAudit) return
    const audit = deepFreeze({
      type: 'plugin_hook' as const,
      correlationId: input.event.id,
      ...(input.event.traceId !== undefined
        ? { traceId: input.event.traceId }
        : {}),
      tenantId: input.subscription.tenantId,
      plugin: input.subscription.plugin,
      version: input.subscription.version,
      eventName: input.subscription.eventName,
      status: input.status,
      payload: input.event.payload,
      ...(input.error ? { error: input.error } : {})
    }) as PlatformHookAuditEvent
    try {
      await this.options.onAudit(audit)
    } catch {
      // Audit observers are deliberately non-blocking for the controlled bus.
    }
  }
}

function assertPlatformEventName(
  value: string
): asserts value is PlatformEventName {
  if (!platformEventNameSet.has(value)) {
    throw new DomainError('validation_failed', 'Platform event name is invalid')
  }
}

function assertTenantId(value: string): asserts value is TenantId {
  if (!TenantIdSchema.safeParse(value).success) {
    throw new DomainError('validation_failed', 'Tenant scope is invalid')
  }
}

function assertOptionalScopeIds(input: PlatformEventInput): void {
  if (
    input.agentId !== undefined &&
    !AgentIdSchema.safeParse(input.agentId).success
  ) {
    throw new DomainError('validation_failed', 'Agent scope is invalid')
  }
  if (
    input.versionId !== undefined &&
    !AgentVersionIdSchema.safeParse(input.versionId).success
  ) {
    throw new DomainError('validation_failed', 'Agent version scope is invalid')
  }
}

function assertOptionalTraceId(value: TraceId | undefined): void {
  if (value !== undefined && !TraceIdSchema.safeParse(value).success) {
    throw new DomainError('validation_failed', 'Execution trace ID is invalid')
  }
}

function asPayloadRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return { value }
}

function safeHookError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Plugin hook failed'
  return redactSensitiveText(message)
    .replace(
      /(api[_-]?key|access[_-]?token|client[_-]?secret|credential|password|private[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+/gi,
      '$1=[redacted-secret]'
    )
    .replace(
      /\b(?:sk-|pk_|ghp_|xox[baprs]-)[A-Za-z0-9._-]+/gi,
      '[redacted-secret]'
    )
    .slice(0, 500)
}

function cloneSubscription(
  subscription: PlatformEventSubscription
): PlatformEventSubscription {
  return { ...subscription }
}

function cloneFrozenEvent(event: PlatformEventEnvelope): PlatformEventEnvelope {
  return deepFreeze(structuredClone(event))
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    Object.isFrozen(value)
  ) {
    return value
  }
  Object.values(value as Record<string, unknown>).forEach((child) =>
    deepFreeze(child)
  )
  return Object.freeze(value)
}
