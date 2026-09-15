/**
 * Phase 3 neutral contracts: iterative governed agent loop.
 *
 * These contracts describe the runtime-side structures of the hybrid loop
 * (steps, observations, structured decisions, checkpoints, context and
 * evaluation). They carry no product, provider or persistence dependency.
 * Hidden reasoning is deliberately absent from every structure here: only
 * structured decisions, observations, references and evaluations may be
 * persisted.
 */

import type {
  AgentId,
  ApprovalId,
  ContextSnapshot,
  CorrelationId,
  ExecutionBudget,
  StopReason,
  TenantId,
  ToolDescriptor,
  TraceId
} from './contracts.ts'

export const RUNTIME_PROFILES = ['single_pass', 'iterative'] as const
export type RuntimeProfile = (typeof RUNTIME_PROFILES)[number]

export const RUNTIME_V2_VERSION = '2.0.0'
export const HYBRID_ORCHESTRATOR_VERSION = '1.0.0'
export const CHECKPOINT_VERSION = 1
export const MAX_CHECKPOINT_OBSERVATIONS = 50

/* -------------------------------------------------------------------------- */
/* Step model                                                                 */
/* -------------------------------------------------------------------------- */

export const STEP_TYPES = [
  'MODEL',
  'TOOL',
  'KNOWLEDGE',
  'POLICY',
  'APPROVAL',
  'USER_INPUT',
  'VERIFY',
  'RESPOND',
  'HANDOFF',
  'STOP'
] as const
export type StepType = (typeof STEP_TYPES)[number]

export const STEP_STATUSES = [
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'WAITING',
  'SKIPPED'
] as const
export type StepStatus = (typeof STEP_STATUSES)[number]

export const STEP_TRANSITIONS: Record<StepStatus, readonly StepStatus[]> = {
  PENDING: ['RUNNING', 'SKIPPED'],
  RUNNING: ['SUCCEEDED', 'FAILED', 'WAITING'],
  WAITING: ['RUNNING', 'FAILED', 'SKIPPED'],
  SUCCEEDED: [],
  // A failed step may be retried; the effect journal still fences duplicates.
  FAILED: ['RUNNING'],
  SKIPPED: []
}

export function isStepTransitionAllowed(
  from: StepStatus,
  to: StepStatus
): boolean {
  return STEP_TRANSITIONS[from].includes(to)
}

export interface ExecutionStep {
  readonly stepId: string
  readonly executionId: string
  readonly tenantId: string
  readonly stepNumber: number
  readonly stepType: StepType
  readonly status: StepStatus
  readonly attempt: number
  readonly sideEffecting: boolean
  readonly startedAt: string
  readonly completedAt?: string
  readonly decisionType?: DecisionType | undefined
  readonly reasonCode?: DecisionReasonCode
  readonly observationRefs: readonly string[]
  readonly errorCode?: string
  readonly stopReason?: StopReason
}

/* -------------------------------------------------------------------------- */
/* Observation model                                                          */
/* -------------------------------------------------------------------------- */

export const OBSERVATION_SOURCES = [
  'USER',
  'TOOL',
  'KNOWLEDGE',
  'POLICY',
  'APPROVAL',
  'MODEL_INFERENCE',
  'SYSTEM'
] as const
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number]

export const OBSERVATION_TYPES = [
  'USER_MESSAGE',
  'TOOL_RESULT',
  'KNOWLEDGE_RESULT',
  'POLICY_DECISION',
  'APPROVAL_DECISION',
  'MODEL_PROPOSAL',
  'SUFFICIENCY',
  'VERIFICATION',
  'SYSTEM_EVENT',
  'EFFECT_CONFIRMED'
] as const
export type ObservationType = (typeof OBSERVATION_TYPES)[number]

export type ObservationTrust = 'TRUSTED' | 'UNTRUSTED'

export interface ObservationProvenance {
  readonly sourceId: string
  readonly sourceVersion?: string
  readonly operationKey?: string
  readonly effectRef?: string
  readonly category?: string
}

export interface Observation {
  readonly observationId: string
  readonly executionId: string
  readonly stepId: string
  readonly stepNumber: number
  readonly type: ObservationType
  readonly source: ObservationSource
  /**
   * UNTRUSTED content must never be promoted to system policy. Model
   * inference is not an external fact.
   */
  readonly trust: ObservationTrust
  readonly payload: unknown
  readonly summary: string
  readonly provenance: ObservationProvenance
  readonly timestamp: string
}

/* -------------------------------------------------------------------------- */
/* Structured decisions                                                       */
/* -------------------------------------------------------------------------- */

export const DECISION_TYPES = [
  'RESPOND',
  'CALL_TOOL',
  'SEARCH_KNOWLEDGE',
  'ASK_USER',
  'REQUEST_APPROVAL',
  'VERIFY',
  'REPLAN',
  'HANDOFF',
  'STOP'
] as const
export type DecisionType = (typeof DECISION_TYPES)[number]

export const DECISION_REASON_CODES = [
  'MISSING_INFORMATION',
  'EVIDENCE_INCOMPLETE',
  'TOOL_REQUIRED',
  'ACTION_CONFIRMED',
  'POLICY_REQUIRED',
  'GOAL_SATISFIED',
  'USER_REQUESTED_STOP',
  'BUDGET_EXHAUSTED',
  'STRATEGY_CHANGED',
  'VERIFICATION_FAILED',
  'HANDOFF_REQUIRED',
  'LOOP_SUSPECTED',
  'CAPABILITY_UNAVAILABLE'
] as const
export type DecisionReasonCode = (typeof DECISION_REASON_CODES)[number]

export interface QuestionRequest {
  readonly questionType:
    | 'CLARIFICATION'
    | 'MISSING_FIELD'
    | 'CONFIRMATION'
    | 'CHOICE'
  readonly missingFields: readonly string[]
  readonly promptIntent: string
  readonly choices?: readonly string[]
}

export interface LoopDecision {
  readonly decisionType: DecisionType
  readonly reasonCode: DecisionReasonCode
  readonly selectedCapability?: string
  readonly toolId?: string
  readonly toolVersion?: string
  readonly toolInput?: unknown
  readonly query?: string
  readonly knowledgeCategories?: readonly string[]
  readonly responseIntent?: string
  readonly responseText?: string
  readonly requestedInput?: QuestionRequest
  readonly verificationTarget?: string
}

export interface DecisionValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/**
 * Structural validation for probabilistic orchestrator output. Anything that
 * fails here must never reach a tool, policy or approval boundary.
 */
export function validateLoopDecision(value: unknown): DecisionValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) {
    return { valid: false, errors: ['decision must be an object'] }
  }
  const decisionType = value.decisionType
  if (!DECISION_TYPES.includes(decisionType as DecisionType)) {
    errors.push('decisionType is not a supported decision')
  }
  if (!DECISION_REASON_CODES.includes(value.reasonCode as DecisionReasonCode)) {
    errors.push('reasonCode is not a supported reason code')
  }
  if (value.toolId !== undefined && !isNonEmptyString(value.toolId)) {
    errors.push('toolId must be a non-empty string when present')
  }
  if (value.toolVersion !== undefined && !isNonEmptyString(value.toolVersion)) {
    errors.push('toolVersion must be a non-empty string when present')
  }
  if (value.query !== undefined && !isNonEmptyString(value.query)) {
    errors.push('query must be a non-empty string when present')
  }
  if (
    value.knowledgeCategories !== undefined &&
    !isStringArray(value.knowledgeCategories)
  ) {
    errors.push('knowledgeCategories must be a string array when present')
  }
  if (
    value.responseIntent !== undefined &&
    !isNonEmptyString(value.responseIntent)
  ) {
    errors.push('responseIntent must be a non-empty string when present')
  }
  if (
    value.responseText !== undefined &&
    typeof value.responseText !== 'string'
  ) {
    errors.push('responseText must be a string when present')
  }
  if (
    value.verificationTarget !== undefined &&
    !isNonEmptyString(value.verificationTarget)
  ) {
    errors.push('verificationTarget must be a non-empty string when present')
  }
  if (value.decisionType === 'CALL_TOOL' && !isNonEmptyString(value.toolId)) {
    errors.push('CALL_TOOL requires a toolId')
  }
  if (
    value.decisionType === 'SEARCH_KNOWLEDGE' &&
    !isNonEmptyString(value.query)
  ) {
    errors.push('SEARCH_KNOWLEDGE requires a query')
  }
  if (value.decisionType === 'ASK_USER') {
    const requestedInput = value.requestedInput
    if (!isRecord(requestedInput)) {
      errors.push('ASK_USER requires a requestedInput object')
    } else {
      if (
        !['CLARIFICATION', 'MISSING_FIELD', 'CONFIRMATION', 'CHOICE'].includes(
          requestedInput.questionType as string
        )
      ) {
        errors.push('requestedInput.questionType is invalid')
      }
      if (!isStringArray(requestedInput.missingFields)) {
        errors.push('requestedInput.missingFields must be a string array')
      }
      if (!isNonEmptyString(requestedInput.promptIntent)) {
        errors.push('requestedInput.promptIntent is required')
      }
    }
  }
  if (
    value.decisionType === 'VERIFY' &&
    !isNonEmptyString(value.verificationTarget)
  ) {
    errors.push('VERIFY requires a verificationTarget')
  }
  return { valid: errors.length === 0, errors }
}

export function isLoopDecision(value: unknown): value is LoopDecision {
  return validateLoopDecision(value).valid
}

const LOOP_DECISION_KEYS = [
  'decisionType',
  'reasonCode',
  'selectedCapability',
  'toolId',
  'toolVersion',
  'toolInput',
  'query',
  'knowledgeCategories',
  'responseIntent',
  'responseText',
  'requestedInput',
  'verificationTarget'
] as const

/**
 * Drops every field that is not part of the decision contract. A model that
 * injects `policyDecision`, `budgetOverride` or similar authority fields can
 * therefore never carry them into the governed runtime.
 */
export function sanitizeLoopDecision(value: unknown): LoopDecision {
  const record = (value ?? {}) as Record<string, unknown>
  const sanitized: Record<string, unknown> = {}
  for (const key of LOOP_DECISION_KEYS) {
    if (record[key] !== undefined) sanitized[key] = record[key]
  }
  return sanitized as unknown as LoopDecision
}

/* -------------------------------------------------------------------------- */
/* Budgets and checkpoints                                                    */
/* -------------------------------------------------------------------------- */

export interface BudgetUsage {
  readonly steps: number
  readonly modelCalls: number
  readonly toolCalls: number
  readonly knowledgeCalls: number
  readonly verificationCalls: number
  readonly replans: number
  readonly decisionRepairs: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
  /** Accumulated active processing time across attempts; pauses are excluded. */
  readonly activeDurationMs: number
}

export const EMPTY_BUDGET_USAGE: BudgetUsage = {
  steps: 0,
  modelCalls: 0,
  toolCalls: 0,
  knowledgeCalls: 0,
  verificationCalls: 0,
  replans: 0,
  decisionRepairs: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  activeDurationMs: 0
}

export interface AgentLoopState {
  readonly goal: string
  /** Immutable capability composition binding for checkpoint/replay safety. */
  readonly capabilityFingerprint?: string
  /** Number of the last completed step. */
  readonly stepNumber: number
  readonly observations: readonly Observation[]
  readonly openQuestions: readonly string[]
  readonly pendingQuestion?: QuestionRequest | undefined
  readonly pendingApprovalId?: string | undefined
  /** Persisted decision reused after restart instead of regenerating. */
  readonly pendingDecision?: LoopDecision | undefined
  readonly pendingStepNumber?: number | undefined
  readonly selectedCapability?: string | undefined
  readonly resolvedInputs: Readonly<Record<string, unknown>>
  readonly loopSignatures: readonly string[]
  readonly stopReason?: StopReason | undefined
  readonly lastEvaluation?: CompletionEvaluation | undefined
}

export interface ExecutionCheckpoint {
  readonly checkpointId: string
  readonly executionId: string
  readonly tenantId: string
  readonly checkpointVersion: number
  readonly runtimeProfile: RuntimeProfile
  readonly runtimeVersion: string
  readonly orchestratorVersion: string
  readonly stepNumber: number
  readonly state: AgentLoopState
  readonly budgetUsage: BudgetUsage
  readonly createdAt: string
  readonly digest: string
}

export interface ExecutionStepStore {
  recordStep(step: ExecutionStep): Promise<void>
  listSteps(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionStep[]>
  saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void>
  loadCheckpoint(
    tenantId: string,
    executionId: string
  ): Promise<ExecutionCheckpoint | null>
}

/* -------------------------------------------------------------------------- */
/* Completion / sufficiency evaluation                                        */
/* -------------------------------------------------------------------------- */

export const COMPLETION_OUTCOMES = [
  'COMPLETE',
  'INCOMPLETE',
  'NEEDS_USER',
  'WAITING_APPROVAL',
  'INSUFFICIENT_EVIDENCE',
  'FAILED'
] as const
export type CompletionOutcome = (typeof COMPLETION_OUTCOMES)[number]

export type CompletionStrategy = 'DETERMINISTIC' | 'EVIDENCE_BASED' | 'HYBRID'

export interface CompletionEvaluation {
  readonly outcome: CompletionOutcome
  readonly reasonCode:
    | DecisionReasonCode
    | 'COMPLETION_CONFIRMED'
    | 'EVALUATOR_UNAVAILABLE'
  readonly deterministic: boolean
  readonly detail?: string
  /** Model/evaluation usage reported by a hybrid evaluator. */
  readonly usage?: {
    readonly modelCalls: number
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }
}

export interface CompletionEvaluationInput {
  readonly goal: string
  readonly state: AgentLoopState
  readonly observations: readonly Observation[]
  readonly lastDecision?: LoopDecision
  readonly result?: unknown
}

export interface CompletionEvaluator {
  evaluate(input: CompletionEvaluationInput): Promise<CompletionEvaluation>
}

export const SUFFICIENCY_LEVELS = [
  'SUFFICIENT',
  'PARTIAL',
  'INSUFFICIENT',
  'CONFLICTING'
] as const
export type SufficiencyLevel = (typeof SUFFICIENCY_LEVELS)[number]

export interface SufficiencyEvaluation {
  readonly level: SufficiencyLevel
  readonly reasonCode: string
  readonly missingCategories: readonly string[]
  readonly conflictingSources: readonly string[]
  readonly coveredCategories: readonly string[]
}

export interface SufficiencyEvaluator {
  evaluate(input: {
    readonly query: string
    readonly requestedCategories: readonly string[]
    readonly observations: readonly Observation[]
  }): Promise<SufficiencyEvaluation>
}

/* -------------------------------------------------------------------------- */
/* Evidence model                                                             */
/* -------------------------------------------------------------------------- */

export interface EvidenceReference {
  readonly evidenceId: string
  readonly sourceId: string
  readonly sourceVersion?: string
  readonly chunkRef?: string
  readonly provenance: ObservationProvenance
}

export interface EvidenceSet {
  readonly items: readonly EvidenceReference[]
  readonly coverage: SufficiencyLevel
}

export interface Claim {
  readonly text: string
  readonly evidenceRefs: readonly string[]
}

export interface ClaimValidation {
  readonly valid: boolean
  readonly unsupportedClaims: readonly string[]
}

/* -------------------------------------------------------------------------- */
/* Context engine                                                             */
/* -------------------------------------------------------------------------- */

export const CONTEXT_PRIORITIES = [
  'SYSTEM',
  'AGENT_PROFILE',
  'CURRENT_GOAL',
  'CURRENT_STATE',
  'FRESH_TOOL_RESULTS',
  'TRUSTED_KNOWLEDGE',
  'RELEVANT_HISTORY',
  'OLDER_CONTEXT'
] as const
export type ContextPriority = (typeof CONTEXT_PRIORITIES)[number]

export interface ContextItem {
  readonly contextId: string
  readonly priority: ContextPriority
  readonly trust: ObservationTrust
  readonly source: string
  readonly content: string
  readonly tokenEstimate: number
  readonly evidenceRefs?: readonly string[]
}

export interface StepContext {
  readonly executionId: string
  readonly tenantId: string
  readonly conversationId: string
  readonly stepNumber: number
  readonly runtimeProfile: RuntimeProfile
  readonly agentId: AgentId
  readonly agentVersion: string
  readonly objective: string
  readonly instructions: readonly string[]
  readonly goal: string
  readonly userMessage: string
  readonly stateSummary: string
  readonly observations: readonly Observation[]
  readonly capabilities: readonly ToolDescriptor[]
  readonly knowledgeAvailable: boolean
  readonly completionStrategy: CompletionStrategy
  readonly allowedDecisionTypes: readonly DecisionType[]
  readonly budget: ExecutionBudget
  readonly budgetUsage: BudgetUsage
  readonly tokenBudget: number
  readonly contextItems: readonly ContextItem[]
  readonly pendingApprovalId?: string
  readonly pendingQuestion?: QuestionRequest
  readonly lastEvaluation?: CompletionEvaluation
  readonly correlationId: CorrelationId
  readonly traceId: TraceId
  readonly decisionRepair?: {
    readonly attempt: number
    readonly errors: readonly string[]
  }
}

export interface ContextBuildInput {
  readonly runtime: {
    readonly executionId?: string
    readonly tenantId: TenantId
    readonly conversationId: string
    readonly correlationId: CorrelationId
    readonly traceId: TraceId
    readonly userMessage: string
    readonly context: ContextSnapshot
    readonly objective: string
    readonly instructions: readonly string[]
    readonly agentId: AgentId
    readonly agentVersion: string
  }
  readonly profile: RuntimeProfile
  readonly stepNumber: number
  readonly goal: string
  readonly state: AgentLoopState
  readonly capabilities: readonly ToolDescriptor[]
  readonly knowledgeAvailable: boolean
  readonly completionStrategy: CompletionStrategy
  readonly allowedDecisionTypes: readonly DecisionType[]
  readonly budget: ExecutionBudget
  readonly budgetUsage: BudgetUsage
  readonly decisionRepair?: {
    readonly attempt: number
    readonly errors: readonly string[]
  }
}

export interface ContextEngine {
  build(input: ContextBuildInput): Promise<StepContext>
}

/* -------------------------------------------------------------------------- */
/* Iterative orchestrator and knowledge boundaries                            */
/* -------------------------------------------------------------------------- */

export interface IterativeOrchestratorInput {
  readonly context: StepContext
}

export interface ModelUsage {
  readonly modelCalls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
}

export const EMPTY_MODEL_USAGE: ModelUsage = {
  modelCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0
}

/**
 * The orchestrator reports its own model usage so the runtime can enforce
 * budgets deterministically without reaching into orchestrator internals.
 */
export interface IterativeOrchestratorTurn {
  readonly decision: LoopDecision
  readonly usage?: ModelUsage
}

export interface IterativeOrchestrator {
  decide(input: IterativeOrchestratorInput): Promise<IterativeOrchestratorTurn>
}

export interface KnowledgeSearchRequest {
  readonly query: string
  readonly categories?: readonly string[]
  readonly context?: ContextSnapshot
  readonly correlationId?: CorrelationId
}

export interface KnowledgeObservationItem {
  readonly itemId: string
  readonly text: string
  readonly sourceId: string
  readonly sourceVersion: string
  readonly chunkRef?: string
  readonly category?: string
  readonly confidence?: number
}

export interface KnowledgeSearchResult {
  readonly query: string
  readonly items: readonly KnowledgeObservationItem[]
  readonly provenance: readonly ObservationProvenance[]
}

export interface AgenticKnowledgeProvider {
  search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResult>
}

/* -------------------------------------------------------------------------- */
/* Resume and trajectory                                                      */
/* -------------------------------------------------------------------------- */

export type ExecutionResume =
  | { readonly kind: 'approval'; readonly approvalId: string }
  | { readonly kind: 'user_input'; readonly message: string }

export interface ExecutionTrajectoryStep {
  readonly stepNumber: number
  readonly stepType: StepType
  readonly status: StepStatus
  readonly decisionType?: DecisionType
  readonly reasonCode?: DecisionReasonCode
  readonly capability?: string
  readonly observationType?: ObservationType
  readonly evaluation?: CompletionOutcome
  readonly stopReason?: StopReason
}

export interface ExecutionTrajectory {
  readonly executionId: string
  readonly runtimeProfile: RuntimeProfile
  readonly runtimeVersion: string
  readonly orchestratorVersion: string
  readonly steps: readonly ExecutionTrajectoryStep[]
  readonly stopReason: StopReason
  readonly budgetUsage: BudgetUsage
}

/* -------------------------------------------------------------------------- */
/* Audit action vocabulary                                                    */
/* -------------------------------------------------------------------------- */

export const RUNTIME_V2_AUDIT_ACTIONS = [
  'runtime_v2.started',
  'orchestrator.decided',
  'step.started',
  'step.completed',
  'observation.recorded',
  'evaluation.completed',
  'runtime.replanned',
  'runtime.paused',
  'runtime.completed',
  'runtime.stopped'
] as const
export type RuntimeV2AuditAction = (typeof RUNTIME_V2_AUDIT_ACTIONS)[number]

export interface ApprovalBinding {
  readonly approvalId: ApprovalId
  readonly stepNumber: number
}
