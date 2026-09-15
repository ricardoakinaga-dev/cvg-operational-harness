import { z } from 'zod'
import {
  createGovernedRuntimeComposition,
  resolveWorkflowCoordinator,
  type EffectScope,
  type GovernedTurnInput,
  type GovernedTurnResult,
  type OutboxEnqueueInput,
  type ToolInvocation
} from '@cvg/agent-runtime'
import {
  DeterministicModelProvider,
  ModelGateway,
  ModelProfileNameSchema,
  PromptRegistry,
  type ModelProfile
} from '@cvg/model-gateway'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import {
  PostgresApprovalAuthority,
  PostgresEffectJournal,
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  type InboundRuntimeContext,
  type PostgresPoolLike
} from '@cvg/persistence'
import {
  AgentIdSchema,
  TenantIdSchema,
  canBotRespond,
  type AgentId,
  type TenantId
} from '@cvg/platform'
import {
  AgentProfileNameSchema,
  CapabilitySchema,
  PolicyDocumentSchema,
  PolicyEngine,
  type Capability,
  type PolicyDocumentInput
} from '@cvg/policy-engine'
import {
  CorrelationIdSchema,
  DataClassificationSchema,
  RoleSchema
} from '@cvg/shared'
import type { ControlledWorkerHandlers } from './controlled-worker.ts'

export const WORKER_RUNTIME_ENV = 'CVG_WORKER_RUNTIME'
export const KERNEL_WORKER_RUNTIME = 'kernel'
export const PUBLISHED_AGENT_WORKER_RUNTIME = 'published-agent'

export const CONTROLLED_KERNEL_POLICY_ID = 'synthetic.controlled-kernel'
export const CONTROLLED_KERNEL_POLICY_VERSION = '1.0.0'
export const CONTROLLED_KERNEL_PROMPT_ID = 'synthetic.controlled-kernel-prompt'
export const CONTROLLED_KERNEL_PROMPT_VERSION = '1.0.0'

export type KernelRuntimeConfigurationErrorCode =
  | 'kernel_runtime_prerequisites_missing'
  | 'unknown_worker_runtime'

export class KernelRuntimeConfigurationError extends Error {
  readonly code: KernelRuntimeConfigurationErrorCode

  constructor(code: KernelRuntimeConfigurationErrorCode, message: string) {
    super(message)
    this.name = 'KernelRuntimeConfigurationError'
    this.code = code
  }
}

/**
 * Worker runtime selection. The published-agent path stays the default; the
 * governed kernel is opt-in and any unknown value fails closed at startup.
 */
export function resolveWorkerRuntimeKind(
  env: NodeJS.ProcessEnv
): 'kernel' | 'published-agent' {
  const configured = env[WORKER_RUNTIME_ENV]?.trim()
  if (!configured || configured === PUBLISHED_AGENT_WORKER_RUNTIME) {
    return 'published-agent'
  }
  if (configured === KERNEL_WORKER_RUNTIME) return 'kernel'
  throw new KernelRuntimeConfigurationError(
    'unknown_worker_runtime',
    `Unknown ${WORKER_RUNTIME_ENV} value: ${configured}`
  )
}

/**
 * SYNTHETIC controlled policy document (marked synthetic; no real institutional
 * source). It allows a read of an appointment draft and requires approval for
 * the draft-only write capability `appointment.modify`. Real capabilities
 * (`appointment.confirm`/`reschedule`/`cancel`) receive no grant here, so the
 * kernel denies them before any executor call.
 */
export const CONTROLLED_KERNEL_POLICY_DOCUMENT: PolicyDocumentInput = {
  policyId: CONTROLLED_KERNEL_POLICY_ID,
  version: CONTROLLED_KERNEL_POLICY_VERSION,
  effectiveFrom: '2026-09-01T00:00:00.000Z',
  rules: [
    {
      id: 'synthetic-allow-schedule-read-appointment-draft',
      effect: 'ALLOW',
      priority: 10,
      capabilities: ['schedule.read'],
      resourceTypes: ['appointment_draft'],
      reason: 'Synthetic controlled read of an appointment draft'
    },
    {
      id: 'synthetic-require-approval-appointment-modify',
      effect: 'REQUIRE_APPROVAL',
      priority: 20,
      capabilities: ['appointment.modify'],
      resourceTypes: ['appointment_draft'],
      reason: 'Synthetic controlled write requires human approval'
    }
  ]
}

/** Both composed capabilities are explicitly synthetic-only effect scopes. */
export const CONTROLLED_KERNEL_EFFECT_SCOPES: Partial<
  Record<Capability, EffectScope>
> = {
  'schedule.read': 'controlled_fake',
  'appointment.modify': 'controlled_fake'
}

export const CONTROLLED_KERNEL_PAYLOAD_SCHEMA = z.object({
  text: z.string()
})

/**
 * Synthetic turn envelope carried in the inbound message body. The kernel
 * handler refuses any body that is not this JSON shape; free text never picks
 * a capability by inference.
 */
export const KernelTurnEnvelopeSchema = z
  .object({
    capability: CapabilitySchema,
    action: z.string().min(1).max(120),
    resource: z
      .object({
        type: z.string().min(1).max(120),
        id: z.string().min(1).max(160).optional()
      })
      .strict(),
    dataClassification: DataClassificationSchema.default('INTERNAL'),
    operatorId: z.string().min(1).max(120).default('op_synthetic_kernel'),
    operatorRole: RoleSchema.default('Operator'),
    agentVersion: z.string().min(1).max(120).default('synthetic-v1'),
    agentProfile: AgentProfileNameSchema.default('secretary'),
    modelProfile: ModelProfileNameSchema.default('fast'),
    message: z
      .string()
      .min(1)
      .max(4000)
      .default('synthetic controlled kernel turn'),
    idempotencyKey: z.string().min(8).max(200).optional(),
    approvalId: z.string().min(1).max(160).optional(),
    task: z.string().min(1).max(120).optional()
  })
  .strict()

export type KernelTurnEnvelope = z.output<typeof KernelTurnEnvelopeSchema>

export function parseKernelTurnEnvelope(body: string): KernelTurnEnvelope {
  let decoded: unknown
  try {
    decoded = JSON.parse(body)
  } catch {
    throw new Error(
      'kernel_turn_envelope_invalid: inbound body is not a JSON turn envelope'
    )
  }
  const candidate =
    decoded !== null && typeof decoded === 'object' && 'cvgTurn' in decoded
      ? (decoded as { cvgTurn: unknown }).cvgTurn
      : decoded
  const parsed = KernelTurnEnvelopeSchema.safeParse(candidate)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`kernel_turn_envelope_invalid: ${issues}`)
  }
  return parsed.data
}

export interface CreatePostgresKernelRuntimeInput {
  pool: PostgresPoolLike
  tenantId: TenantId
  env: NodeJS.ProcessEnv
  agentId: AgentId
}

export interface PostgresKernelRuntime {
  tenantId: TenantId
  agentId: AgentId
  policy: PolicyEngine
  approvals: PostgresApprovalAuthority
  audit: HashChainedAuditLedger
  telemetry: InMemoryTelemetry
  conversations: TenantScopedPostgresRuntimeRepository
  toolInvocations: readonly ToolInvocation[]
  turnResults: readonly GovernedTurnResult[]
  runTurn(input: GovernedTurnInput): Promise<GovernedTurnResult>
  preflight(): Promise<void>
}

function createControlledModelGateway(): ModelGateway {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: CONTROLLED_KERNEL_PROMPT_ID,
    version: CONTROLLED_KERNEL_PROMPT_VERSION,
    content:
      'SYNTHETIC controlled kernel prompt. Produce a deterministic appointment draft update; no real data, no external call.',
    owner: 'platform-synthetic',
    approvedBy: 'synthetic-reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL'
  })
  const provider = new DeterministicModelProvider({
    respond: () => ({
      text: JSON.stringify({ text: 'SYNTHETIC_CONTROLLED_KERNEL_PAYLOAD' }),
      usage: { inputTokens: 10, outputTokens: 5 },
      providerId: 'deterministic',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 256,
    timeoutMs: 5_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
  }
  return new ModelGateway({
    providers: [provider],
    profiles: { fast: profile },
    prompts,
    retry: { maxRetries: 0 }
  })
}

/**
 * Durable prerequisites probe: the tenant-scoped `effect_journal` (0013) and
 * `runtime_approvals` (0015) tables must exist and be reachable. Missing
 * migrations fail closed before any turn runs.
 */
export async function assertPostgresKernelPrerequisites(
  pool: PostgresPoolLike,
  tenantId: TenantId
): Promise<void> {
  try {
    await withTenantContext(pool, tenantId, async (client) => {
      await client.query(
        'SELECT 1 FROM effect_journal WHERE tenant_id = $1 LIMIT 0',
        [tenantId]
      )
      await client.query(
        'SELECT 1 FROM runtime_approvals WHERE tenant_id = $1 LIMIT 0',
        [tenantId]
      )
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new KernelRuntimeConfigurationError(
      'kernel_runtime_prerequisites_missing',
      `Durable kernel runtime prerequisites are missing (effect_journal/runtime_approvals): ${message}`
    )
  }
}

/**
 * Controlled governed-kernel composition for the worker. The effect journal is
 * constructed on one client checked out per turn from the pool (released by
 * `withTenantContext` in a finally), while approvals are the durable
 * `PostgresApprovalAuthority`. The tool executor is fake and records every
 * invocation; the outbox enqueues synthetic `message.outbound` events only.
 */
export function createPostgresKernelRuntime(
  input: CreatePostgresKernelRuntimeInput
): PostgresKernelRuntime {
  const { pool, tenantId, env, agentId } = input
  if (
    pool === undefined ||
    pool === null ||
    typeof (pool as { connect?: unknown }).connect !== 'function'
  ) {
    throw new KernelRuntimeConfigurationError(
      'kernel_runtime_prerequisites_missing',
      'Kernel worker runtime requires a PostgreSQL pool for the durable effect journal and approval authority'
    )
  }
  resolveWorkflowCoordinator(env)

  const policy = new PolicyEngine({
    documents: [PolicyDocumentSchema.parse(CONTROLLED_KERNEL_POLICY_DOCUMENT)]
  })
  const approvals = new PostgresApprovalAuthority(pool)
  const telemetry = new InMemoryTelemetry()
  const audit = new HashChainedAuditLedger()
  const modelGateway = createControlledModelGateway()
  const conversations = new TenantScopedPostgresRuntimeRepository(pool)

  const toolInvocations: ToolInvocation[] = []
  const turnResults: GovernedTurnResult[] = []
  const toolExecutor = async (
    invocation: ToolInvocation
  ): Promise<{ result: unknown }> => {
    toolInvocations.push(invocation)
    return { result: { synthetic: true, invocation } }
  }

  const runTurn = async (
    turnInput: GovernedTurnInput
  ): Promise<GovernedTurnResult> => {
    const result = await withTenantContext(pool, tenantId, async (client) => {
      const effectJournal = new PostgresEffectJournal(client)
      const outbox = async (
        event: OutboxEnqueueInput
      ): Promise<{ eventId: string }> => {
        const enqueued = await conversations.enqueue({
          tenantId,
          type: 'message.outbound',
          payload: {
            synthetic: true,
            sourceEventType: event.eventType,
            capability: turnInput.capability,
            action: turnInput.action,
            resourceType: turnInput.resource.type,
            correlationId: event.correlationId,
            traceId: event.traceId
          },
          idempotencyKey: `kernel-outbox:${event.idempotencyKey}`,
          correlationId: event.correlationId,
          conversationId: turnInput.conversationId,
          sessionId: turnInput.sessionId ?? null
        })
        return { eventId: enqueued.id }
      }
      const composition = createGovernedRuntimeComposition({
        policy,
        approvals,
        modelGateway,
        telemetry,
        audit,
        toolExecutor,
        outbox,
        effectJournal,
        requireDurable: true,
        durableApprovals: true,
        effectScopes: CONTROLLED_KERNEL_EFFECT_SCOPES
      })
      return composition.runtime.runTurn(turnInput)
    })
    turnResults.push(result)
    return result
  }

  return {
    tenantId,
    agentId,
    policy,
    approvals,
    audit,
    telemetry,
    conversations,
    toolInvocations,
    turnResults,
    runTurn,
    preflight: () => assertPostgresKernelPrerequisites(pool, tenantId)
  }
}

function resolveKernelAgentId(env: NodeJS.ProcessEnv): AgentId | undefined {
  const raw = env.CVG_WORKER_AGENT_ID?.trim() || env.INBOUND_AGENT_ID?.trim()
  if (!raw) return undefined
  return AgentIdSchema.parse(raw)
}

function buildKernelTurnInput(input: {
  tenantId: TenantId
  agentId: AgentId
  correlationId: string
  context: InboundRuntimeContext
  envelope: KernelTurnEnvelope
}): GovernedTurnInput {
  const { envelope } = input
  return {
    tenantId: input.tenantId,
    operatorId: envelope.operatorId,
    operatorRole: envelope.operatorRole,
    agentId: input.agentId,
    agentVersion: envelope.agentVersion,
    agentProfile: envelope.agentProfile,
    conversationId: input.context.message.conversationId,
    ...(input.context.session !== null
      ? { sessionId: input.context.session.id }
      : {}),
    correlationId: input.correlationId,
    capability: envelope.capability,
    action: envelope.action,
    resource: {
      type: envelope.resource.type,
      ...(envelope.resource.id !== undefined
        ? { id: envelope.resource.id }
        : {})
    },
    dataClassification: envelope.dataClassification,
    prompt: {
      promptId: CONTROLLED_KERNEL_PROMPT_ID,
      version: CONTROLLED_KERNEL_PROMPT_VERSION
    },
    modelProfile: envelope.modelProfile,
    modelMessages: {
      messages: [{ role: 'user', content: envelope.message }]
    },
    structuredOutput: {
      schemaName: 'ControlledKernelPayload',
      schema: CONTROLLED_KERNEL_PAYLOAD_SCHEMA
    },
    ...(envelope.idempotencyKey !== undefined
      ? { idempotencyKey: envelope.idempotencyKey }
      : {}),
    ...(envelope.approvalId !== undefined
      ? { approvalId: envelope.approvalId }
      : {}),
    ...(envelope.task !== undefined ? { task: envelope.task } : {})
  }
}

function kernelOutcomeStatus(outcome: GovernedTurnResult['outcome']): string {
  switch (outcome) {
    case 'executed':
      return 'completed'
    case 'approval_required':
      return 'approval_required'
    case 'shadowed':
      return 'shadowed'
    case 'denied':
      return 'denied'
  }
}

/**
 * Inbound composition for the governed kernel. It mirrors the published-agent
 * handler's context loading and fail-closed statuses, converts the synthetic
 * JSON body into a `GovernedTurnInput`, runs the kernel and marks the inbound
 * message completed. No external effect is ever produced here.
 */
export function createPostgresKernelHandlers(
  env: NodeJS.ProcessEnv,
  runtime: PostgresKernelRuntime
): ControlledWorkerHandlers {
  const configuredAgentId = resolveKernelAgentId(env)
  if (
    configuredAgentId !== undefined &&
    configuredAgentId !== runtime.agentId
  ) {
    throw new KernelRuntimeConfigurationError(
      'kernel_runtime_prerequisites_missing',
      'Kernel worker agent id does not match the composed runtime'
    )
  }

  return {
    inboundProcess: async (event) => {
      if (!event.conversationId || !event.inboundMessageId) {
        throw new Error('Inbound outbox event is missing runtime identifiers')
      }
      const conversationId = event.conversationId
      const inboundMessageId = event.inboundMessageId
      const sessionId = event.sessionId ?? null
      const tenantId = TenantIdSchema.parse(event.tenantId)
      const correlationId = CorrelationIdSchema.parse(event.correlationId)
      const context = await runtime.conversations.findInboundRuntimeContext(
        tenantId,
        conversationId,
        sessionId,
        inboundMessageId
      )
      if (!context) {
        throw new Error('Inbound runtime context was not found')
      }
      if (context.message.runtimeStatus === 'completed') {
        return { status: 'already_completed', externalEffects: false }
      }
      if (context.session && !canBotRespond(context.session.takeoverState)) {
        return { status: 'paused_human_takeover', externalEffects: false }
      }

      const envelope = parseKernelTurnEnvelope(context.message.body)
      const turnInput = buildKernelTurnInput({
        tenantId,
        agentId: runtime.agentId,
        correlationId,
        context,
        envelope
      })
      const result = await runtime.runTurn(turnInput)
      await runtime.conversations.markInboundRuntimeCompleted(
        inboundMessageId,
        tenantId
      )
      return {
        status: kernelOutcomeStatus(result.outcome),
        runtimeStatus: result.outcome,
        reason: result.reason,
        externalEffects: false,
        ...(result.approvalId !== undefined
          ? { approvalId: result.approvalId }
          : {}),
        traceId: result.traceId,
        correlationId: result.correlationId
      }
    },
    messageOutbound: () => ({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
  }
}
