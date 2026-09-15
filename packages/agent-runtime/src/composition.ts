import type { ApprovalAuthority } from '@cvg/approval-engine'
import type {
  AgentProfileName,
  Capability,
  PolicyEngine
} from '@cvg/policy-engine'
import type {
  ModelGateway,
  ModelInput,
  ModelProfileName,
  StructuredOutputContract
} from '@cvg/model-gateway'
import type { HashChainedAuditLedger, Telemetry } from '@cvg/observability'
import type { DataClassification, Role } from '@cvg/shared'
import type {
  EffectScope,
  GovernedResource,
  GovernedTurnInput,
  LoopLimits,
  OutboxEnqueueInput,
  ToolInvocation
} from './contracts.ts'
import type { EffectJournalPort } from './effect-journal.ts'
import { GovernedAgentRuntime } from './runtime.ts'

/**
 * AAA-06 composition contract (D01 = C) environment selection. The governed
 * kernel is the default; a LangGraph frontier is only reachable through an
 * explicitly injected adapter and is never imported by this module.
 */
export const WORKFLOW_COORDINATOR_ENV = 'WORKFLOW_COORDINATOR'
export const GOVERNED_KERNEL_COORDINATOR = 'governed-kernel'
export const LANGGRAPH_FRONTIER_COORDINATOR = 'langgraph-frontier'

export type WorkflowCoordinatorKind = 'governed-kernel' | 'langgraph-frontier'

/** Emitted only by a workflow coordinator. It never executes an effect. */
export interface WorkflowPlan {
  planId: string
  tenantId: string
  conversationId: string
  sessionId?: string
  correlationId: string
  steps: WorkflowStep[]
}

export interface WorkflowStep {
  stepId: string
  capability: Capability
  action: string
  resource: GovernedResource
  dataClassification: DataClassification
  idempotencyKey?: string
  modelMessages?: ModelInput
  structuredOutput?: StructuredOutputContract
}

/**
 * Port implemented by a composition behind the frontier. The graph never sees
 * the kernel, the tool executor, the outbox, journals or credentials.
 */
export interface WorkflowCoordinatorPort {
  planStep(input: {
    tenantId: string
    conversationId: string
    correlationId: string
    state: unknown
  }): Promise<WorkflowPlan>
}

export interface WorkflowCoordinatorAdapters {
  'langgraph-frontier'?: WorkflowCoordinatorPort
}

export interface ResolvedWorkflowCoordinator {
  kind: WorkflowCoordinatorKind
  coordinator: WorkflowCoordinatorPort | null
}

export type RuntimeCompositionErrorCode =
  | 'frontier_not_configured'
  | 'unknown_coordinator'
  | 'runtime_composition_invalid'
  | 'durable_runtime_configuration_required'

export class RuntimeCompositionError extends Error {
  readonly code: RuntimeCompositionErrorCode

  constructor(code: RuntimeCompositionErrorCode, message: string) {
    super(message)
    this.name = 'RuntimeCompositionError'
    this.code = code
  }
}

/**
 * Fail-closed coordinator selection (contract section 3(e)): absent means the
 * governed kernel, `langgraph-frontier` requires an injected adapter and any
 * unknown value rejects startup. LangGraph itself is not a dependency here.
 */
export function resolveWorkflowCoordinator(
  env: NodeJS.ProcessEnv,
  adapters: WorkflowCoordinatorAdapters = {}
): ResolvedWorkflowCoordinator {
  const configured = env[WORKFLOW_COORDINATOR_ENV]?.trim()
  if (!configured || configured === GOVERNED_KERNEL_COORDINATOR) {
    return { kind: 'governed-kernel', coordinator: null }
  }
  if (configured === LANGGRAPH_FRONTIER_COORDINATOR) {
    const adapter = adapters[LANGGRAPH_FRONTIER_COORDINATOR]
    if (!adapter || typeof adapter.planStep !== 'function') {
      throw new RuntimeCompositionError(
        'frontier_not_configured',
        'WORKFLOW_COORDINATOR=langgraph-frontier requires an injected frontier adapter; no adapter is configured'
      )
    }
    return { kind: 'langgraph-frontier', coordinator: adapter }
  }
  throw new RuntimeCompositionError(
    'unknown_coordinator',
    `Unknown ${WORKFLOW_COORDINATOR_ENV} value: ${configured}`
  )
}

/** Envelope carried by a composed caller; never the executed payload. */
export interface GovernedTurnEnvelope {
  operatorId: string
  operatorRole: Role
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  prompt: { promptId: string; version: string; sha256?: string }
  modelProfile: ModelProfileName
  limits?: Partial<LoopLimits>
}

/**
 * Normative 1:1 mapping of contract section 3. The executed payload still comes
 * exclusively from the immutable proposal; the step only declares intent.
 */
export function toGovernedTurnInput(
  plan: WorkflowPlan,
  step: WorkflowStep,
  envelope: GovernedTurnEnvelope
): GovernedTurnInput {
  return {
    tenantId: plan.tenantId,
    operatorId: envelope.operatorId,
    operatorRole: envelope.operatorRole,
    agentId: envelope.agentId,
    agentVersion: envelope.agentVersion,
    agentProfile: envelope.agentProfile,
    conversationId: plan.conversationId,
    ...(plan.sessionId !== undefined ? { sessionId: plan.sessionId } : {}),
    correlationId: plan.correlationId,
    capability: step.capability,
    action: step.action,
    resource: step.resource,
    dataClassification: step.dataClassification,
    prompt: envelope.prompt,
    modelProfile: envelope.modelProfile,
    modelMessages: step.modelMessages ?? {
      messages: [{ role: 'user', content: step.action }]
    },
    ...(step.structuredOutput !== undefined
      ? { structuredOutput: step.structuredOutput }
      : {}),
    ...(step.idempotencyKey !== undefined
      ? { idempotencyKey: step.idempotencyKey }
      : {}),
    ...(envelope.limits !== undefined ? { limits: envelope.limits } : {})
  }
}

export type GovernedRuntimeToolExecutor = (
  invocation: ToolInvocation
) => Promise<{ result: unknown }>

export type GovernedRuntimeOutbox = (
  event: OutboxEnqueueInput
) => Promise<{ eventId: string }>

export interface GovernedRuntimeCompositionInput {
  policy: PolicyEngine
  approvals: ApprovalAuthority
  modelGateway: ModelGateway
  telemetry: Telemetry
  audit: HashChainedAuditLedger
  toolExecutor: GovernedRuntimeToolExecutor
  outbox: GovernedRuntimeOutbox
  effectJournal?: EffectJournalPort
  /**
   * Fail-closed durability gate (N4 / AAA12-R3-F02). When true, the caller must
   * supply a durable effect journal and explicitly attest that the approvals
   * port is durable; no in-memory journal is ever injected silently.
   */
  requireDurable?: boolean
  /**
   * Caller attestation required by `requireDurable`. The composition cannot
   * introspect an `ApprovalAuthority` across package boundaries, so the
   * composed entrypoint must declare that it wired a durable implementation
   * (for the controlled path, `PostgresApprovalAuthority`).
   */
  durableApprovals?: boolean
  clock?: () => Date
  effectScopes?: Partial<Record<Capability, EffectScope>>
  realEffectAuthorizations?: readonly string[]
  reservationTtlMs?: number
}

export interface GovernedRuntimeComposition {
  runtime: GovernedAgentRuntime
  requireDurable: boolean
}

const REQUIRED_PORTS: ReadonlyArray<{
  label: string
  read: (input: GovernedRuntimeCompositionInput) => unknown
  methods: readonly string[]
}> = [
  { label: 'policy', read: (input) => input.policy, methods: ['evaluate'] },
  {
    label: 'approvals',
    read: (input) => input.approvals,
    methods: ['request', 'reserve', 'confirm', 'get', 'list']
  },
  {
    label: 'modelGateway',
    read: (input) => input.modelGateway,
    methods: ['generate']
  },
  {
    label: 'telemetry',
    read: (input) => input.telemetry,
    methods: ['startSpan', 'recordMetric']
  },
  {
    label: 'audit',
    read: (input) => input.audit,
    methods: ['append', 'verify']
  }
]

function missingPorts(input: GovernedRuntimeCompositionInput): string[] {
  const missing: string[] = []
  for (const port of REQUIRED_PORTS) {
    const value = port.read(input)
    if (value === undefined || value === null) {
      missing.push(port.label)
      continue
    }
    if (
      port.methods.some(
        (method) =>
          typeof (value as Record<string, unknown>)[method] !== 'function'
      )
    ) {
      missing.push(port.label)
    }
  }
  if (typeof input.toolExecutor !== 'function') missing.push('toolExecutor')
  if (typeof input.outbox !== 'function') missing.push('outbox')
  return missing
}

/**
 * Builds the governed kernel behind the composition boundary. Required ports
 * are validated up front; durable mode fails closed when the journal is absent
 * or durability was not attested. The controlled entrypoints pass
 * `requireDurable: true` and a PostgreSQL-backed journal/approvals pair.
 */
export function createGovernedRuntimeComposition(
  input: GovernedRuntimeCompositionInput
): GovernedRuntimeComposition {
  const missing = missingPorts(input)
  if (missing.length > 0) {
    throw new RuntimeCompositionError(
      'runtime_composition_invalid',
      `Governed runtime composition is missing required ports: ${missing.join(', ')}`
    )
  }

  const requireDurable = input.requireDurable === true
  if (requireDurable) {
    const unmet: string[] = []
    if (input.effectJournal === undefined) unmet.push('durable effectJournal')
    if (input.durableApprovals !== true) unmet.push('durable approvals')
    if (unmet.length > 0) {
      throw new RuntimeCompositionError(
        'durable_runtime_configuration_required',
        `Durable governed runtime composition requires: ${unmet.join(', ')}`
      )
    }
  }

  const runtime = new GovernedAgentRuntime({
    policy: input.policy,
    approvals: input.approvals,
    modelGateway: input.modelGateway,
    telemetry: input.telemetry,
    audit: input.audit,
    toolExecutor: input.toolExecutor,
    outbox: input.outbox,
    ...(input.clock !== undefined ? { clock: input.clock } : {}),
    ...(input.effectScopes !== undefined
      ? { effectScopes: input.effectScopes }
      : {}),
    ...(input.realEffectAuthorizations !== undefined
      ? { realEffectAuthorizations: input.realEffectAuthorizations }
      : {}),
    ...(input.reservationTtlMs !== undefined
      ? { reservationTtlMs: input.reservationTtlMs }
      : {}),
    ...(input.effectJournal !== undefined
      ? { effectJournal: input.effectJournal }
      : {})
  })

  return { runtime, requireDurable }
}
