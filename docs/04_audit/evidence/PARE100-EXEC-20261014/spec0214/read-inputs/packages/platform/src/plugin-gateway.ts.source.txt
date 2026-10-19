import {
  createCorrelationId,
  RoleSchema,
  sanitizeAuditEvidencePayload,
  type CorrelationId
} from '@cvg/shared'
import {
  AgentConfigSchema,
  PluginManifestSchema,
  PlatformDecisionSchema,
  type AgentConfig,
  type PluginManifest,
  type PluginBinding,
  type PluginTool,
  type PlatformPolicyResult
} from './contracts.ts'
import { z } from 'zod'
import {
  type CapabilityApprovalAuthority,
  type CapabilityApprovalVerificationInput
} from './approval-authority.ts'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  createTraceId,
  TenantIdSchema,
  TraceIdSchema
} from './ids.ts'
import type { AgentId, AgentVersionId, TenantId, TraceId } from './ids.ts'
import type { PluginHookHandler } from './event-bus.ts'
import {
  blockedResult,
  createSafeExecutionInput,
  isPlainRecord,
  normalizePluginHandlerResult,
  parseToolInput
} from './tool-invocation-boundary.ts'

export interface PluginHandlerContext {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  dryRun: boolean
}

export interface PluginHandlerResult {
  status: 'succeeded' | 'failed' | 'blocked'
  data?: unknown
  error?: string
}

export type PluginHandler = (
  input: unknown,
  context: PluginHandlerContext
) => PluginHandlerResult | Promise<PluginHandlerResult>

export interface PluginToolInputValidator {
  safeParse(input: unknown): unknown
}

export type PluginToolOutputValidator = PluginToolInputValidator

export interface RegisteredPlugin {
  manifest: PluginManifest
  handlers: Record<string, PluginHandler>
  inputValidators?: Record<string, PluginToolInputValidator>
  outputValidators?: Record<string, PluginToolOutputValidator>
  hooks?: Record<string, PluginHookHandler>
}

export interface PlannedCapabilityTool {
  plugin: string
  version: string
  toolName: string
}

export type CapabilityToolBlockReason =
  | 'plugin_binding_missing'
  | 'plugin_version_required'
  | 'plugin_version_not_registered'
  | 'tool_binding_ambiguous'
  | 'tool_not_registered'
  | 'tool_input_validator_missing'
  | 'tool_output_validator_missing'
  | 'invalid_tool_context'
  | 'plugin_permission_not_declared'

export type CapabilityToolResolution =
  | {
      status: 'resolved'
      plugin: string
      version: string
      toolName: string
      permission: string
      requiresApproval: boolean
    }
  | {
      status: 'blocked'
      reason: CapabilityToolBlockReason
    }

export interface PluginAuditEvent {
  type: 'tool_call'
  correlationId: CorrelationId
  traceId: TraceId
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  plugin: string
  toolName: string
  status: 'succeeded' | 'failed' | 'blocked'
  payload: unknown
}

export class PluginRegistry {
  private readonly plugins: RegisteredPlugin[]

  constructor(plugins: RegisteredPlugin[] = []) {
    this.plugins = plugins.map(normalizeRegisteredPlugin)
  }

  register(plugin: RegisteredPlugin): PluginRegistry {
    const normalized = normalizeRegisteredPlugin(plugin)
    if (this.get(normalized.manifest.name, normalized.manifest.version)) {
      throw new Error(
        `Plugin already registered: ${normalized.manifest.name}@${normalized.manifest.version}`
      )
    }
    return new PluginRegistry([...this.plugins, normalized])
  }

  get(name: string, version: string): RegisteredPlugin | null {
    const plugin = this.plugins.find(
      (candidate) =>
        candidate.manifest.name === name &&
        candidate.manifest.version === version
    )
    return plugin ? cloneRegisteredPlugin(plugin) : null
  }

  getLatest(name: string): RegisteredPlugin | null {
    const plugin = [...this.plugins]
      .filter((candidate) => candidate.manifest.name === name)
      .sort((left, right) =>
        comparePluginVersions(right.manifest.version, left.manifest.version)
      )[0]
    return plugin ? cloneRegisteredPlugin(plugin) : null
  }

  list(): RegisteredPlugin[] {
    return [...this.plugins]
      .sort((left, right) => {
        const byName = left.manifest.name.localeCompare(right.manifest.name)
        return byName !== 0
          ? byName
          : comparePluginVersions(left.manifest.version, right.manifest.version)
      })
      .map(cloneRegisteredPlugin)
  }

  listPlannedTools(
    config: AgentConfig,
    intent: string
  ): PlannedCapabilityTool[] {
    const plans = new Map<string, PlannedCapabilityTool>()
    const identitiesByTool = new Map<string, Set<string>>()

    for (const binding of config.plugins) {
      if (!binding.enabled || !binding.version) continue
      const registered = this.get(binding.plugin, binding.version)
      if (!registered) continue
      for (const tool of registered.manifest.tools) {
        if (
          !binding.allowedTools.includes(tool.name) ||
          !(tool.intents ?? []).includes(intent) ||
          !registered.handlers[tool.name]
        ) {
          continue
        }
        const identity = `${registered.manifest.name}@${registered.manifest.version}/${tool.name}`
        plans.set(identity, {
          plugin: registered.manifest.name,
          version: registered.manifest.version,
          toolName: tool.name
        })
        const identities = identitiesByTool.get(tool.name) ?? new Set<string>()
        identities.add(identity)
        identitiesByTool.set(tool.name, identities)
      }
    }

    return [...plans.values()]
      .filter((plan) => (identitiesByTool.get(plan.toolName)?.size ?? 0) === 1)
      .sort((left, right) => {
        const byTool = left.toolName.localeCompare(right.toolName)
        if (byTool !== 0) return byTool
        const byPlugin = left.plugin.localeCompare(right.plugin)
        return byPlugin !== 0
          ? byPlugin
          : comparePluginVersions(right.version, left.version)
      })
  }
}

export interface CapabilityExecutionInput {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  traceId?: TraceId
  config: AgentConfig
  toolName: string
  input: unknown
  actor: { id: string; role: string; permissions: string[] }
  policy: Pick<PlatformPolicyResult, 'decision' | 'reason'>
  approval?: CapabilityApproval
  requireApproval?: boolean
  dryRun: boolean
  onAudit?: (event: PluginAuditEvent) => void | Promise<void>
}

export interface CapabilityApproval {
  id: string
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  actorId: string
  expiresAt: Date
}

export interface CapabilityApprovalResolutionInput {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  input: unknown
  actor: { id: string; role: string; permissions: string[] }
}

export interface CapabilityActorAuthorizationInput {
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  toolName: string
  requiredPermission: string
  actor: { id: string; role: string }
}

export type CapabilityActorAuthorizer = (
  input: CapabilityActorAuthorizationInput
) => readonly string[] | null | Promise<readonly string[] | null>

export type CapabilityApprovalResolver = (
  input: CapabilityApprovalResolutionInput
) => CapabilityApproval | null | Promise<CapabilityApproval | null>

export interface CapabilityGatewayOptions {
  actorAuthorizer?: CapabilityActorAuthorizer
  approvalAuthority?: CapabilityApprovalAuthority
  now?: () => Date
}

export interface CapabilityExecutionResult {
  status: 'succeeded' | 'failed' | 'blocked'
  reason?: string
  data?: unknown
  correlationId: CorrelationId
}

const CapabilityToolNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/)

const CapabilityIntentSchema = z.string().trim().min(1).max(120)

const CapabilityActorSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    role: RoleSchema,
    permissions: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(160)
          .regex(/^[A-Za-z0-9._:-]+$/)
      )
      .max(128)
  })
  .strict()

const CapabilityPolicySchema = z.object({
  decision: PlatformDecisionSchema,
  reason: z.string().trim().min(1).max(240)
})

const CapabilityPermissionListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/)
  )
  .max(128)

const CapabilityApprovalSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    tenantId: TenantIdSchema,
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    toolName: CapabilityToolNameSchema,
    actorId: z
      .string()
      .trim()
      .min(3)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/),
    expiresAt: z.date()
  })
  .strict()

export class CapabilityGateway {
  private readonly now: () => Date

  constructor(
    private readonly registry: PluginRegistry,
    private readonly options: CapabilityGatewayOptions = {}
  ) {
    this.now = options.now ?? (() => new Date())
  }

  planTools(config: AgentConfig, intent: string): PlannedCapabilityTool[] {
    const parsedConfig = safeParseAgentConfig(config)
    const parsedIntent = CapabilityIntentSchema.safeParse(intent)
    if (!parsedConfig || !parsedIntent.success) return []
    return this.registry.listPlannedTools(parsedConfig, parsedIntent.data)
  }

  resolveConfiguredTool(
    config: AgentConfig,
    toolName: string
  ): CapabilityToolResolution {
    const parsedConfig = safeParseAgentConfig(config)
    const parsedToolName = CapabilityToolNameSchema.safeParse(toolName)
    if (!parsedConfig || !parsedToolName.success) {
      return { status: 'blocked', reason: 'invalid_tool_context' }
    }
    const resolved = this.resolveBoundTool(parsedConfig, parsedToolName.data)
    if (resolved.status === 'blocked') return resolved
    return {
      status: 'resolved',
      plugin: resolved.plugin.manifest.name,
      version: resolved.plugin.manifest.version,
      toolName: resolved.tool.name,
      permission: resolved.tool.permission,
      requiresApproval: resolved.tool.requiresApproval
    }
  }

  permissionForConfiguredTool(
    config: AgentConfig,
    toolName: string
  ): string | null {
    const resolution = this.resolveConfiguredTool(config, toolName)
    return resolution.status === 'resolved' ? resolution.permission : null
  }

  async execute(
    input: CapabilityExecutionInput
  ): Promise<CapabilityExecutionResult> {
    const correlationId = createCorrelationId()
    if (!isPlainRecord(input)) {
      return blockedResult('invalid_execution_input', correlationId)
    }

    try {
      const trace =
        input.traceId === undefined
          ? { success: true as const, data: createTraceId() }
          : TraceIdSchema.safeParse(input.traceId)
      if (!trace.success) {
        return blockedResult('invalid_execution_input', correlationId)
      }
      const tenant = TenantIdSchema.safeParse(input.tenantId)
      const agent = AgentIdSchema.safeParse(input.agentId)
      const version = AgentVersionIdSchema.safeParse(input.versionId)
      if (!tenant.success || !agent.success || !version.success) {
        return blockedResult('invalid_scope_id', correlationId)
      }

      const parsedConfig = AgentConfigSchema.safeParse(input.config)
      const parsedToolName = CapabilityToolNameSchema.safeParse(input.toolName)
      const parsedPolicy = CapabilityPolicySchema.safeParse(input.policy)
      const parsedDryRun = z.boolean().safeParse(input.dryRun)
      const parsedActor = CapabilityActorSchema.safeParse(input.actor)
      const parsedRequireApproval =
        input.requireApproval === undefined
          ? { success: true as const, data: undefined }
          : z.boolean().safeParse(input.requireApproval)
      const onAudit = input.onAudit
      if (
        !parsedConfig.success ||
        !parsedToolName.success ||
        !parsedPolicy.success ||
        !parsedDryRun.success ||
        !parsedRequireApproval.success ||
        (onAudit !== undefined && typeof onAudit !== 'function')
      ) {
        return blockedResult('invalid_execution_input', correlationId)
      }

      const safeInput = createSafeExecutionInput({
        tenantId: tenant.data,
        agentId: agent.data,
        versionId: version.data,
        traceId: trace.data,
        config: parsedConfig.data,
        toolName: parsedToolName.data,
        actor: parsedActor.success
          ? parsedActor.data
          : { id: 'invalid.actor', role: 'System', permissions: [] },
        policy: parsedPolicy.data,
        dryRun: parsedDryRun.data,
        ...(parsedRequireApproval.data !== undefined
          ? { requireApproval: parsedRequireApproval.data }
          : {}),
        ...(input.approval !== undefined ? { approval: input.approval } : {}),
        ...(typeof onAudit === 'function' ? { onAudit } : {})
      })
      if (!parsedActor.success) {
        return this.blocked(safeInput, correlationId, 'invalid_actor')
      }

      const resolved = this.resolveBoundTool(
        safeInput.config,
        safeInput.toolName
      )
      if (resolved.status === 'blocked') {
        return this.blocked(safeInput, correlationId, resolved.reason)
      }

      const parsedToolInput = parseToolInput(
        resolved.inputValidator,
        input.input
      )
      if (!parsedToolInput.success) {
        return this.blocked(safeInput, correlationId, 'tool_input_invalid')
      }

      const executionInput = {
        ...safeInput,
        input: parsedToolInput.data
      }
      const { tool, handler } = resolved
      if (!this.options.actorAuthorizer) {
        return this.blocked(
          executionInput,
          correlationId,
          'actor_authorization_unavailable'
        )
      }
      const effectivePermissions = await this.authorizeActor(
        executionInput,
        tool.permission
      )
      if (!effectivePermissions) {
        return this.blocked(
          executionInput,
          correlationId,
          'actor_authorization_denied'
        )
      }
      if (!effectivePermissions.includes(tool.permission)) {
        return this.blocked(executionInput, correlationId, 'permission_denied')
      }
      if (executionInput.policy.decision === 'blocked') {
        return this.blocked(executionInput, correlationId, 'policy_blocked')
      }
      if (
        executionInput.policy.decision !== 'allowed' &&
        executionInput.policy.decision !== 'requires_approval'
      ) {
        return this.blocked(
          executionInput,
          correlationId,
          `policy_${executionInput.policy.decision}`
        )
      }
      const approvalRequired =
        executionInput.requireApproval === true ||
        executionInput.policy.decision === 'requires_approval' ||
        tool.requiresApproval
      if (
        approvalRequired &&
        !(await this.hasValidApproval(executionInput, correlationId))
      ) {
        return this.blocked(executionInput, correlationId, 'approval_required')
      }

      try {
        const rawResult = await handler(executionInput.input, {
          tenantId: executionInput.tenantId,
          agentId: executionInput.agentId,
          versionId: executionInput.versionId,
          toolName: executionInput.toolName,
          dryRun: executionInput.dryRun
        })
        const result = normalizePluginHandlerResult(
          rawResult,
          resolved.outputValidator
        )
        if (!result) {
          const audited = await this.auditSafely(
            executionInput,
            correlationId,
            'failed',
            undefined
          )
          return {
            status: 'failed',
            reason: audited ? 'tool_result_invalid' : 'audit_unavailable',
            correlationId
          }
        }
        const audited = await this.auditSafely(
          executionInput,
          correlationId,
          result.status,
          result.data
        )
        if (!audited) {
          return {
            ...result,
            reason: 'audit_unavailable',
            correlationId
          }
        }
        return { ...result, correlationId }
      } catch {
        const audited = await this.auditSafely(
          executionInput,
          correlationId,
          'failed',
          undefined
        )
        return {
          status: 'failed',
          reason: audited ? 'tool_execution_failed' : 'audit_unavailable',
          correlationId
        }
      }
    } catch {
      return blockedResult('invalid_execution_input', correlationId)
    }
  }

  private async authorizeActor(
    input: CapabilityExecutionInput,
    requiredPermission: string
  ): Promise<string[] | null> {
    const authorizer = this.options.actorAuthorizer
    if (!authorizer) return null
    try {
      const granted = await authorizer({
        tenantId: input.tenantId,
        agentId: input.agentId,
        versionId: input.versionId,
        toolName: input.toolName,
        requiredPermission,
        actor: { id: input.actor.id, role: input.actor.role }
      })
      const parsed = CapabilityPermissionListSchema.safeParse(granted)
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private async hasValidApproval(
    input: CapabilityExecutionInput,
    correlationId: CorrelationId
  ): Promise<boolean> {
    const parsedApproval = CapabilityApprovalSchema.safeParse(input.approval)
    if (!parsedApproval.success) return false
    const approval = parsedApproval.data
    const authority = this.options.approvalAuthority
    let currentTimeMs: number
    try {
      const currentTime = this.now()
      currentTimeMs =
        currentTime instanceof Date ? currentTime.getTime() : Number.NaN
    } catch {
      return false
    }
    if (
      TenantIdSchema.safeParse(input.tenantId).success === false ||
      AgentIdSchema.safeParse(input.agentId).success === false ||
      AgentVersionIdSchema.safeParse(input.versionId).success === false ||
      approval.tenantId !== input.tenantId ||
      approval.agentId !== input.agentId ||
      approval.versionId !== input.versionId ||
      approval.toolName !== input.toolName ||
      approval.actorId !== input.actor.id ||
      !Number.isFinite(approval.expiresAt.getTime()) ||
      !Number.isFinite(currentTimeMs) ||
      approval.expiresAt.getTime() <= currentTimeMs
    ) {
      return false
    }
    try {
      if (authority) {
        const verification: CapabilityApprovalVerificationInput = {
          approvalId: approval.id,
          tenantId: input.tenantId,
          agentId: input.agentId,
          versionId: input.versionId,
          toolName: input.toolName,
          input: input.input,
          actorId: input.actor.id,
          consumptionAudit: {
            correlationId,
            policyVersion: 'capability-approval-v1',
            ...(input.traceId !== undefined ? { traceId: input.traceId } : {})
          }
        }
        return Boolean(await authority.verifyAndConsume(verification))
      }
      return false
    } catch {
      return false
    }
  }

  private async blocked(
    input: CapabilityExecutionInput,
    correlationId: CorrelationId,
    reason: string,
    auditInput: unknown = input.input
  ): Promise<CapabilityExecutionResult> {
    const audited = await this.auditSafely(
      input,
      correlationId,
      'blocked',
      { reason },
      auditInput
    )
    return {
      status: 'blocked',
      reason: audited ? reason : 'audit_unavailable',
      correlationId
    }
  }

  private async auditSafely(
    input: CapabilityExecutionInput,
    correlationId: CorrelationId,
    status: PluginAuditEvent['status'],
    data: unknown,
    auditInput: unknown = input.input
  ): Promise<boolean> {
    try {
      await this.audit(input, correlationId, status, data, auditInput)
      return true
    } catch {
      return false
    }
  }

  private async audit(
    input: CapabilityExecutionInput,
    correlationId: CorrelationId,
    status: PluginAuditEvent['status'],
    data: unknown,
    auditInput: unknown = input.input
  ): Promise<void> {
    if (!input.onAudit) return
    const resolved = this.resolveConfiguredTool(input.config, input.toolName)
    const sanitized = sanitizeAuditEvidencePayload({
      toolName: input.toolName,
      input: auditInput,
      result: data
    })
    await input.onAudit({
      type: 'tool_call',
      correlationId,
      traceId: input.traceId!,
      tenantId: input.tenantId,
      agentId: input.agentId,
      versionId: input.versionId,
      plugin: resolved.status === 'resolved' ? resolved.plugin : 'unknown',
      toolName: input.toolName,
      status,
      payload: sanitized.payload
    })
  }

  private resolveBoundTool(
    config: AgentConfig,
    toolName: string
  ):
    | {
        status: 'resolved'
        binding: PluginBinding
        plugin: RegisteredPlugin
        tool: PluginTool
        handler: PluginHandler
        inputValidator: PluginToolInputValidator
        outputValidator: PluginToolOutputValidator
      }
    | { status: 'blocked'; reason: CapabilityToolBlockReason } {
    const bindings = config.plugins.filter(
      (candidate) =>
        candidate.enabled && candidate.allowedTools.includes(toolName)
    )
    if (bindings.length === 0) {
      return { status: 'blocked', reason: 'plugin_binding_missing' as const }
    }

    const identities = new Set(
      bindings.map((binding) =>
        binding.version
          ? `${binding.plugin}@${binding.version}`
          : `${binding.plugin}@<unversioned>`
      )
    )
    if (identities.size > 1) {
      return { status: 'blocked', reason: 'tool_binding_ambiguous' as const }
    }

    const binding = bindings[0]!
    if (!binding.version) {
      return { status: 'blocked', reason: 'plugin_version_required' as const }
    }
    const plugin = this.registry.get(binding.plugin, binding.version)
    if (!plugin) {
      return {
        status: 'blocked',
        reason: 'plugin_version_not_registered' as const
      }
    }
    const tool = plugin.manifest.tools.find(
      (candidate) => candidate.name === toolName
    )
    const handler = plugin.handlers[toolName]
    if (!tool || typeof handler !== 'function') {
      return { status: 'blocked', reason: 'tool_not_registered' as const }
    }
    const inputValidator = plugin.inputValidators?.[toolName]
    if (!inputValidator) {
      return {
        status: 'blocked',
        reason: 'tool_input_validator_missing' as const
      }
    }
    const outputValidator = plugin.outputValidators?.[toolName]
    if (!outputValidator) {
      return {
        status: 'blocked',
        reason: 'tool_output_validator_missing' as const
      }
    }
    if (!plugin.manifest.permissions.includes(tool.permission)) {
      return {
        status: 'blocked',
        reason: 'plugin_permission_not_declared' as const
      }
    }
    return {
      status: 'resolved',
      binding,
      plugin,
      tool,
      handler,
      inputValidator,
      outputValidator
    }
  }
}

function normalizeRegisteredPlugin(plugin: RegisteredPlugin): RegisteredPlugin {
  const manifest = PluginManifestSchema.parse(plugin.manifest)
  const toolNames = new Set(manifest.tools.map((tool) => tool.name))
  const handlers = Object.fromEntries(
    Object.entries(plugin.handlers).filter(([name]) => toolNames.has(name))
  )
  if (Object.keys(handlers).length !== manifest.tools.length) {
    throw new Error('Every manifest tool requires a handler')
  }
  if (
    manifest.tools.some((tool) => typeof handlers[tool.name] !== 'function')
  ) {
    throw new Error('Every manifest tool requires a callable handler')
  }
  const inputValidators = plugin.inputValidators ?? {}
  const validatorNames = Object.keys(inputValidators)
  if (
    validatorNames.length !== manifest.tools.length ||
    manifest.tools.some((tool) => !validatorNames.includes(tool.name))
  ) {
    throw new Error(
      'Every manifest tool requires an input validator and no extra validators are allowed'
    )
  }
  for (const tool of manifest.tools) {
    if (typeof inputValidators[tool.name]?.safeParse !== 'function') {
      throw new Error(`Invalid input validator for tool: ${tool.name}`)
    }
  }
  const outputValidators = plugin.outputValidators ?? {}
  const outputValidatorNames = Object.keys(outputValidators)
  if (
    outputValidatorNames.length !== manifest.tools.length ||
    manifest.tools.some((tool) => !outputValidatorNames.includes(tool.name))
  ) {
    throw new Error(
      'Every manifest tool requires an output validator and no extra validators are allowed'
    )
  }
  for (const tool of manifest.tools) {
    if (typeof outputValidators[tool.name]?.safeParse !== 'function') {
      throw new Error(`Invalid output validator for tool: ${tool.name}`)
    }
  }
  const hooks = Object.fromEntries(
    Object.entries(plugin.hooks ?? {}).map(([name, handler]) => {
      if (!manifest.hooks.includes(name)) {
        throw new Error(
          'Every plugin hook handler must be declared by the manifest'
        )
      }
      if (typeof handler !== 'function') {
        throw new Error('Every manifest hook requires a handler')
      }
      return [name, handler]
    })
  )
  return {
    manifest,
    handlers,
    inputValidators: { ...inputValidators },
    outputValidators: { ...outputValidators },
    hooks
  }
}

function safeParseAgentConfig(value: unknown): AgentConfig | null {
  try {
    const parsed = AgentConfigSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function cloneRegisteredPlugin(plugin: RegisteredPlugin): RegisteredPlugin {
  return {
    manifest: {
      ...plugin.manifest,
      capabilities: [...plugin.manifest.capabilities],
      permissions: [...plugin.manifest.permissions],
      tools: plugin.manifest.tools.map(cloneTool),
      hooks: [...plugin.manifest.hooks],
      dependencies: [...plugin.manifest.dependencies]
    },
    handlers: { ...plugin.handlers },
    ...(plugin.inputValidators
      ? { inputValidators: { ...plugin.inputValidators } }
      : {}),
    ...(plugin.outputValidators
      ? { outputValidators: { ...plugin.outputValidators } }
      : {}),
    ...(plugin.hooks ? { hooks: { ...plugin.hooks } } : {})
  }
}

function cloneTool(tool: PluginTool): PluginTool {
  return { ...tool }
}

function comparePluginVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left)
  const rightParts = numericVersionParts(right)
  if (leftParts && rightParts) {
    for (let index = 0; index < leftParts.length; index += 1) {
      const difference = leftParts[index]! - rightParts[index]!
      if (difference !== 0) return difference
    }
    return left.localeCompare(right)
  }
  return left.localeCompare(right)
}

function numericVersionParts(value: string): [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}
