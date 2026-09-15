import { z } from 'zod'
import type { DataClassification, Role } from '@cvg/shared'
import type { Capability, AgentProfileName } from '@cvg/policy-engine'
import type { PolicyDecision } from '@cvg/policy-engine'
import type {
  ModelInput,
  ModelProfileName,
  ModelResult,
  StructuredOutputContract
} from '@cvg/model-gateway'
import type { EffectJournalPort } from './effect-journal.ts'

export const LoopLimitsSchema = z
  .object({
    maxSteps: z.number().int().min(1).max(32).default(8),
    maxModelCalls: z.number().int().min(0).max(4).default(1),
    maxToolCalls: z.number().int().min(0).max(4).default(1),
    maxDurationMs: z.number().int().min(100).max(300_000).default(30_000),
    maxCostUsd: z.number().min(0).max(100).default(0.5)
  })
  .strict()

export type LoopLimits = z.output<typeof LoopLimitsSchema>

export interface GovernedResource {
  type: string
  id?: string
  tenantId?: string
}

export interface GovernedTurnInput {
  tenantId: string
  operatorId: string
  operatorRole: Role
  agentId: string
  agentVersion: string
  agentProfile: AgentProfileName
  conversationId: string
  sessionId?: string
  correlationId: string
  capability: Capability
  action: string
  resource: GovernedResource
  dataClassification: DataClassification
  prompt: { promptId: string; version: string; sha256?: string }
  modelProfile: ModelProfileName
  modelMessages: ModelInput
  structuredOutput?: StructuredOutputContract
  approvalId?: string
  approvalPayload?: unknown
  idempotencyKey?: string
  task?: string
  shadowMode?: boolean
  takeoverActive?: boolean
  limits?: Partial<LoopLimits>
  /**
   * Cooperative cancellation for the current turn. Propagated to the model
   * gateway and to the tool executor; checkpoints before each budgeted stage
   * and after each await interrupt the turn with `turn_cancelled`. A
   * dependency that ignores the signal never authorizes a later effect.
   */
  cancelSignal?: AbortSignal
}

export type GovernedOutcome =
  | 'executed'
  | 'approval_required'
  | 'denied'
  | 'shadowed'

export interface ToolInvocation {
  tenantId: string
  capability: Capability
  action: string
  resource: GovernedResource
  payload: unknown
  modelResult: ModelResult | undefined
  correlationId: string
  traceId: string
  shadowMode: boolean
  /** Same cooperative cancellation signal as the governed turn. */
  signal?: AbortSignal
}

export interface OutboxEnqueueInput {
  tenantId: string
  eventType: string
  idempotencyKey: string
  correlationId: string
  traceId: string
  payload: Record<string, unknown>
}

export interface GovernedTurnResult {
  outcome: GovernedOutcome
  reason: string
  decision: PolicyDecision
  traceId: string
  spanId: string
  correlationId: string
  modelResult?: ModelResult
  approvalId?: string
  toolResult?: unknown
  outboxEventId?: string
  outboxPending?: boolean
  executionRef?: string
  resultDigest?: string
  replayed?: boolean
  effectConfirmed?: boolean
  auditChainValid: boolean
  costUsd: number
  durationMs: number
}

/**
 * Declared effect scope of a governed capability. `controlled_fake` may only
 * target synthetic adapters; `real_authorized` additionally requires an
 * explicit entry in `realEffectAuthorizations`. Undeclared high-risk write
 * capabilities fail closed (T-19 / contract section 10 Q2).
 */
export type EffectScope = 'controlled_fake' | 'real_authorized'

/**
 * Certainty of a tool failure relative to the external effect. Only
 * `no_effect` allows an approval to be released back to APPROVED; anything
 * else keeps an honest UNCERTAIN state without automatic retry.
 */
export type ToolEffectCertainty = 'no_effect' | 'effect_started' | 'unknown'

export class ToolExecutionError extends Error {
  readonly code: string
  readonly certainty: ToolEffectCertainty

  constructor(
    code: string,
    message: string,
    options: { certainty?: ToolEffectCertainty } = {}
  ) {
    super(message)
    this.name = 'ToolExecutionError'
    this.code = code
    this.certainty = options.certainty ?? 'unknown'
  }
}

export interface GovernedAgentRuntimeOptions {
  policy: import('@cvg/policy-engine').PolicyEngine
  approvals: import('@cvg/approval-engine').ApprovalAuthority
  modelGateway: import('@cvg/model-gateway').ModelGateway
  telemetry: import('@cvg/observability').Telemetry
  audit: import('@cvg/observability').HashChainedAuditLedger
  toolExecutor: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
  clock?: () => Date
  effectScopes?: Partial<Record<Capability, EffectScope>>
  realEffectAuthorizations?: readonly string[]
  effectJournal?: EffectJournalPort
  reservationTtlMs?: number
}
