import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  ConversationId,
  CorrelationId,
  ContextSnapshot,
  ExecutionBudget,
  RuntimeInput,
  RuntimeResult,
  SessionId,
  TenantId
} from '@cvg/harness-contracts'

export const CONVERSATION_VERSION = '1.0.0'

export const CONVERSATION_STATUSES = [
  'ACTIVE',
  'WAITING_USER',
  'WAITING_APPROVAL',
  'HANDOFF',
  'COMPLETED',
  'CANCELLED'
] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export const EXECUTION_STATUSES = [
  'PENDING',
  'RUNNING',
  'WAITING_USER',
  'WAITING_APPROVAL',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'UNCERTAIN'
] as const
export type ConversationExecutionStatus = (typeof EXECUTION_STATUSES)[number]

export const TURN_STATUSES = [
  'ACCEPTED',
  'PROCESSING',
  'WAITING_USER',
  'WAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'HANDOFF',
  'CANCELLED'
] as const
export type TurnStatus = (typeof TURN_STATUSES)[number]

export const INTENTS = [
  'INFO',
  'COLLECT',
  'AVAILABILITY',
  'CREATE',
  'MODIFY',
  'CANCEL',
  'KNOWLEDGE',
  'CLARIFY',
  'CORRECT',
  'SIDE_QUESTION',
  'HANDOFF',
  'STOP'
] as const
export type DialogueIntent = (typeof INTENTS)[number]

export const ACTIONS = ['READ', 'CREATE', 'MODIFY', 'CANCEL'] as const
export type DialogueAction = (typeof ACTIONS)[number]

export const QUESTION_TYPES = [
  'CLARIFICATION',
  'MISSING_FIELD',
  'CONFIRMATION',
  'CHOICE'
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const ENTITY_STATUSES = ['ACTIVE', 'STALE', 'CORRECTED'] as const
export type EntityStatus = (typeof ENTITY_STATUSES)[number]

export const GOAL_STATUSES = [
  'ACTIVE',
  'SUSPENDED',
  'COMPLETED',
  'CANCELLED'
] as const
export type GoalStatus = (typeof GOAL_STATUSES)[number]

export const PROPOSAL_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'INVALIDATED',
  'EXECUTED',
  'FAILED',
  'UNCERTAIN'
] as const
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]

export const EXECUTION_RECORD_STATUSES = [
  'IN_FLIGHT',
  'WAITING_APPROVAL',
  'SUCCEEDED',
  'FAILED',
  'UNCERTAIN'
] as const
export type ExecutionRecordStatus = (typeof EXECUTION_RECORD_STATUSES)[number]

export const DELIVERY_STATUSES = [
  'NOT_REQUESTED',
  'PENDING',
  'DELIVERED',
  'FAILED'
] as const
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number]

export type ConversationJsonPrimitive = string | number | boolean | null
export type ConversationJsonValue =
  | ConversationJsonPrimitive
  | readonly ConversationJsonValue[]
  | { readonly [key: string]: ConversationJsonValue }

export type ConversationIdValue = ConversationId
export type SessionIdValue = SessionId
export type TenantIdValue = TenantId
export type CorrelationIdValue = CorrelationId
export type TurnId = string & { readonly __conversationBrand: 'TurnId' }
export type MessageId = string & { readonly __conversationBrand: 'MessageId' }
export type ExecutionId = string & {
  readonly __conversationBrand: 'ConversationExecutionId'
}
export type ProfileId = string & { readonly __conversationBrand: 'ProfileId' }

export interface ConversationScope {
  readonly tenantId: TenantIdValue
  readonly conversationId: ConversationIdValue
  readonly sessionId: SessionIdValue
  readonly profileId: ProfileId
  readonly profileVersion: string
}

export interface TurnIdentity extends ConversationScope {
  readonly turnId: TurnId
  readonly messageId: MessageId
  readonly correlationId: CorrelationIdValue
  readonly executionId?: ExecutionId | undefined
}

/** Untrusted transport data. The boolean is retained for compatibility only. */
export interface ApprovalResumeRequest {
  readonly authenticated?: boolean | undefined
  readonly approvalId: string
  readonly proposalHash: string
  readonly operationKey: string
  readonly executionId?: ExecutionId | undefined
  /** Opaque non-persisted proof consumed by the injected authority. */
  readonly proof?: string | undefined
}

/** Internal binding emitted only after the injected approval authority agrees. */
export interface AuthenticatedApprovalResume {
  readonly authenticated: true
  readonly approvalId: string
  readonly proposalHash: string
  readonly operationKey: string
  readonly executionId: ExecutionId
}

export interface TurnEnvelope extends TurnIdentity {
  readonly text: string
  readonly idempotencyKey: string
  readonly receivedAt: string
  readonly approvalResume?: ApprovalResumeRequest | undefined
}

export interface EntityFact {
  readonly key: string
  readonly value: ConversationJsonValue
  readonly source: 'USER' | 'SYSTEM'
  readonly status: EntityStatus
  readonly version: number
  readonly turnId: TurnId
  readonly updatedAt: string
}

export interface ReferenceCandidate {
  readonly id: string
  readonly label: string
  readonly value: ConversationJsonValue
  readonly sourceRef: string
  readonly status: 'ELIGIBLE' | 'STALE'
}

export interface GoalRecord {
  readonly goalId: string
  readonly kind: DialogueIntent
  readonly label: string
  readonly requiredFields: readonly string[]
  readonly collectedFields: readonly string[]
  readonly status: GoalStatus
  readonly depth: number
  readonly createdTurnId: TurnId
  readonly updatedAt: string
}

export interface PendingQuestion {
  readonly questionId: string
  readonly type: QuestionType
  readonly prompt: string
  readonly missingFields: readonly string[]
  readonly choices?: readonly string[]
  readonly goalId: string
  readonly createdTurnId: TurnId
  readonly createdAt: string
}

export interface PendingApproval {
  readonly approvalId: string
  readonly proposalHash: string
  readonly operationKey: string
  readonly executionId: ExecutionId
  readonly requestedAt: string
}

export interface ActionProposal {
  readonly proposalId: string
  readonly action: DialogueAction
  readonly capabilityId: string
  readonly capabilityVersion: string
  readonly payload: Readonly<Record<string, ConversationJsonValue>>
  readonly resource?:
    | { readonly type: string; readonly id?: string | undefined }
    | undefined
  readonly proposalHash: string
  readonly operationKey: string
  readonly requiresApproval: boolean
  readonly entityVersions: Readonly<Record<string, number>>
  readonly createdTurnId: TurnId
  readonly status: ProposalStatus
  readonly createdAt: string
}

export interface WorkingMemory {
  readonly version: number
  readonly entities: readonly EntityFact[]
  readonly goals: readonly GoalRecord[]
  readonly activeGoalId?: string | undefined
  readonly goalStack: readonly string[]
  readonly pendingQuestion?: PendingQuestion | undefined
  readonly pendingProposal?: ActionProposal | undefined
  readonly pendingApproval?: PendingApproval | undefined
  readonly options: readonly ReferenceCandidate[]
  readonly sourceRefs: readonly string[]
  readonly invalidatedProposalIds: readonly string[]
  /** Durable handoff checkpoint; it contains no hidden reasoning or tokens. */
  readonly handoff?: HandoffPacket | undefined
}

export type HandoffReason =
  | 'USER_REQUESTED_HANDOFF'
  | 'CAPABILITY_UNAVAILABLE'
  | 'APPROVED_KNOWLEDGE_SOURCE_UNAVAILABLE'
  | 'APPROVAL_BINDING_MISMATCH'
  | 'REFERENCE_NOT_ELIGIBLE'
  | 'REPEATED_MISUNDERSTANDING'
  | 'OPERATIONAL_FAILURE'

/**
 * Small, durable handoff checkpoint. The packet intentionally contains
 * structured facts and references only; it never carries chain of thought,
 * approval credentials, provider secrets or unrelated conversation history.
 */
export interface HandoffPacket {
  readonly handoffId: string
  readonly idempotencyKey: string
  readonly scope: ConversationScope
  readonly turnId: TurnId
  readonly reason: HandoffReason | string
  readonly activeGoal?: GoalRecord | undefined
  readonly confirmedFacts: readonly EntityFact[]
  readonly pendingQuestion?: PendingQuestion | undefined
  readonly executionRefs: readonly string[]
  readonly createdAt: string
}

export interface HandoffReceipt {
  readonly status: 'ACCEPTED' | 'REPLAYED' | 'FAILED'
  readonly handoffId: string
  readonly idempotencyKey: string
  readonly reason?: string | undefined
}

export interface HandoffSink {
  /** Must be idempotent on tenant-scoped handoffId/idempotencyKey. */
  submit(input: HandoffPacket): Promise<HandoffReceipt>
}

export interface ConversationSnapshot {
  readonly scope: ConversationScope
  readonly status: ConversationStatus
  readonly stateVersion: number
  readonly workingMemory: WorkingMemory
  readonly createdAt: string
  readonly updatedAt: string
}

export interface DialogueEntityInput {
  readonly key: string
  readonly value: ConversationJsonValue
  readonly confidence?: number | undefined
}

export interface DialogueReference {
  readonly kind: 'ORDINAL' | 'PRONOUN' | 'EXPLICIT'
  readonly token: string
  readonly ordinal?: number | undefined
  readonly targetKey?: string | undefined
}

export interface DialogueCorrection {
  readonly key: string
  readonly value: ConversationJsonValue
}

export interface DialogueInterpretation {
  readonly intent: DialogueIntent
  readonly action?: DialogueAction | undefined
  readonly confidence: number
  readonly entities: readonly DialogueEntityInput[]
  readonly references: readonly DialogueReference[]
  readonly query?: string | undefined
  readonly requestedCapability?: string | undefined
  readonly confirmationSignal: boolean
  readonly correction?: DialogueCorrection | undefined
  readonly untrustedSpans: readonly string[]
  readonly reasonCodes: readonly string[]
}

export interface InterpretationInput {
  readonly identity: TurnIdentity
  readonly text: string
  readonly memory: WorkingMemory
  readonly profile: ConversationProfile
  readonly budget?: InterpretationBudget | undefined
}

export interface InterpretationBudget {
  readonly maxModelCalls: number
  readonly maxInputChars: number
}

export interface DialogueInterpreter {
  interpret(input: InterpretationInput): Promise<DialogueInterpretation>
}

export interface ConversationCapability {
  readonly id: string
  readonly version: string
  readonly action: DialogueAction
  readonly description: string
  readonly requiredFields: readonly string[]
  readonly sideEffect: 'NONE' | 'READ' | 'WRITE'
  readonly requiresApproval: boolean
  /** Profile-owned mapping for a successful result fact; the core stays domain-agnostic. */
  readonly resultEntityKey?: string | undefined
}

export type ConversationEntityNormalization = 'TEXT' | 'DAY' | 'TIME_PERIOD'

export interface ConversationEntityPattern {
  readonly key: string
  readonly pattern: string
  readonly valueGroup?: number | undefined
  readonly confidence: number
  readonly normalization?: ConversationEntityNormalization | undefined
}

/** Profile-owned language recognition used by the deterministic interpreter. */
export interface ConversationRecognition {
  readonly confirmationPatterns: readonly string[]
  readonly stopPatterns: readonly string[]
  readonly handoffPatterns: readonly string[]
  readonly correctionPatterns: readonly string[]
  readonly sideQuestionPrefixPatterns: readonly string[]
  readonly sideQuestionContextPatterns: readonly string[]
  readonly availabilityPatterns: readonly string[]
  readonly cancelPatterns: readonly string[]
  readonly modifyPatterns: readonly string[]
  readonly createPatterns: readonly string[]
  readonly knowledgePatterns: readonly string[]
  readonly questionPatterns: readonly string[]
  /** The first capture group is the numeric ordinal value. */
  readonly ordinalPattern: string
  readonly ordinalWords: Readonly<Record<string, number>>
  readonly pronounPatterns: readonly string[]
  readonly entityPatterns: readonly ConversationEntityPattern[]
  readonly correctionEntityKeys: readonly string[]
  readonly normalizations: Readonly<{
    readonly DAY: Readonly<Record<string, string>>
    readonly TIME_PERIOD: Readonly<Record<string, string>>
  }>
}

export interface ConversationCopy {
  readonly locale: string
  readonly actionLabels: Readonly<Record<DialogueAction, string>>
  readonly proposalIntro: string
  readonly confirmationPrompt: string
  readonly missingFieldsPrompt: string
  readonly choicePrompt: string
  readonly successPatterns: readonly string[]
  readonly successNegationPatterns: readonly string[]
  readonly noApprovedKnowledge: string
  readonly waitingApproval: string
  readonly handoffAccepted: string
  readonly handoffReplayed: string
  readonly handoffFailed: string
  readonly handoffRecorded: string
  readonly stop: string
  readonly processing: string
  readonly success: string
  readonly successWithoutEvidence: string
  readonly denied: string
  readonly uncertain: string
  readonly failed: string
  readonly repair: string
  readonly answers: Readonly<Record<string, string>> & {
    readonly DEFAULT: string
  }
}

export interface KnowledgePolicy {
  readonly approvedSourceIds: readonly string[]
  readonly maxResults: number
}

export interface ConversationProfile {
  readonly id: ProfileId
  readonly version: string
  readonly name: string
  readonly capabilities: readonly ConversationCapability[]
  readonly knowledge?: KnowledgePolicy | undefined
  readonly copy: ConversationCopy
  readonly recognition?: ConversationRecognition | undefined
  readonly handoffLabel: string
  readonly maxGoalDepth: number
}

/** Public service input. Profile descriptors are optional transport hints. */
export interface ConversationRequest extends TurnEnvelope {
  /** Ignored by the service; kept only for source compatibility with callers. */
  readonly profile?: ConversationProfile | undefined
}

/**
 * Trusted, instance-scoped profile authority. Transport supplied capability
 * and knowledge descriptors are never used to select runtime authority.
 */
export interface ConversationProfileAuthority {
  resolve(input: {
    readonly profileId: ProfileId
    readonly profileVersion: string
  }): ConversationProfile | undefined | Promise<ConversationProfile | undefined>
}

export interface DialogueManagerInput {
  readonly identity: TurnIdentity
  readonly conversationStatus: ConversationStatus
  readonly memory: WorkingMemory
  readonly interpretation: DialogueInterpretation
  readonly profile: ConversationProfile
  readonly now: string
  readonly approvalResume?: AuthenticatedApprovalResume | undefined
}

export type DialoguePlan =
  | {
      readonly kind: 'ANSWER'
      readonly intent: DialogueIntent
      readonly memory: WorkingMemory
      readonly responseIntent: string
    }
  | {
      readonly kind: 'ASK_USER'
      readonly question: PendingQuestion
      readonly memory: WorkingMemory
    }
  | {
      readonly kind: 'SEARCH_KNOWLEDGE'
      readonly query: string
      readonly memory: WorkingMemory
    }
  | {
      readonly kind: 'PROPOSE_ACTION'
      readonly proposal: ActionProposal
      readonly question: PendingQuestion
      readonly memory: WorkingMemory
    }
  | {
      readonly kind: 'EXECUTE_ACTION'
      readonly proposal: ActionProposal
      readonly memory: WorkingMemory
      readonly approvalResume?: AuthenticatedApprovalResume | undefined
    }
  | {
      readonly kind: 'WAIT_APPROVAL'
      readonly proposal: ActionProposal
      readonly memory: WorkingMemory
    }
  | {
      readonly kind: 'HANDOFF'
      readonly reason: string
      readonly memory: WorkingMemory
    }
  | {
      readonly kind: 'STOP'
      readonly memory: WorkingMemory
    }

export interface DialogueManager {
  plan(input: DialogueManagerInput): DialoguePlan
}

export interface KnowledgeEvidence {
  readonly sourceId: string
  readonly version: string
  readonly title: string
  readonly text: string
  readonly approved: true
  readonly citation?: string | undefined
}

export interface KnowledgeSearchInput {
  readonly scope: ConversationScope
  readonly query: string
  readonly maxResults: number
}

export interface KnowledgeProvider {
  search(input: KnowledgeSearchInput): Promise<readonly KnowledgeEvidence[]>
}

export type ResponseSourceKind =
  | 'USER_CONFIRMED'
  | 'TOOL_RESULT'
  | 'KNOWLEDGE_EVIDENCE'
  | 'SYSTEM_STATE'

export interface ResponseSource {
  readonly kind: ResponseSourceKind
  readonly ref: string
  readonly status?:
    | 'SUCCEEDED'
    | 'FAILED'
    | 'REJECTED'
    | 'UNCERTAIN'
    | 'WAITING_APPROVAL'
    | 'HANDOFF'
    | 'DELIVERY_PENDING'
  readonly approved?: boolean
  readonly version?: string
}

export interface ResponseClaim {
  readonly text: string
  readonly sourceRefs: readonly string[]
  readonly kind: 'FACT' | 'STATUS' | 'PROPOSAL'
  readonly successClaim?: boolean
}

export interface ResponseDraft {
  readonly responseId: string
  readonly deliveryKey: string
  readonly text: string
  readonly claims: readonly ResponseClaim[]
  readonly sources: readonly ResponseSource[]
}

export interface VerifiedResponse {
  readonly accepted: boolean
  readonly response: ResponseDraft
  readonly errors: readonly string[]
}

export interface ResponseComposer {
  compose(input: ResponseComposeInput): ResponseDraft
  verify(draft: ResponseDraft, profile?: ConversationProfile): VerifiedResponse
}

export interface ResponseComposeInput {
  readonly identity: TurnIdentity
  readonly profile: ConversationProfile
  readonly plan: DialoguePlan
  readonly memory: WorkingMemory
  readonly knowledge?: readonly KnowledgeEvidence[] | undefined
  readonly execution?: HarnessActionResult | undefined
  readonly handoffReceipt?: HandoffReceipt | undefined
  readonly replayed?: boolean | undefined
}

export interface HarnessActionRequest {
  readonly identity: TurnIdentity
  /** Stable execution reservation identity allocated by the service boundary. */
  readonly executionId: ExecutionId
  /** Bounded state projection consumed by the existing Harness ContextEngine. */
  readonly context: ConversationContextSnapshot
  readonly proposal: ActionProposal
  readonly approvalResume?: AuthenticatedApprovalResume | undefined
  readonly budget: ExecutionBudget
}

export interface HarnessActionResult {
  readonly status:
    | 'SUCCEEDED'
    | 'APPROVAL_REQUIRED'
    | 'DENIED'
    | 'FAILED'
    | 'UNCERTAIN'
  readonly executionId: ExecutionId
  readonly approvalId?: string
  readonly proposalHash: string
  readonly operationKey: string
  readonly effectConfirmed: boolean
  readonly response?: string | undefined
  readonly output?: ConversationJsonValue | undefined
  readonly stopReason?: string | undefined
  readonly evidenceRefs: readonly string[]
}

/** Adapter to the existing Effect Journal; this layer has no effect authority. */
export interface EffectEvidenceVerifier {
  verify(input: {
    readonly scope: ConversationScope
    readonly proposal: ActionProposal
    readonly result: HarnessActionResult
  }): Promise<boolean>
  /** Returns a terminal effect-backed result after a restart-equivalent gap. */
  recover?(input: {
    readonly scope: ConversationScope
    readonly proposal: ActionProposal
    readonly executionId: ExecutionId
  }): Promise<HarnessActionResult | null>
}

export interface ConversationHarness {
  execute(input: HarnessActionRequest): Promise<HarnessActionResult>
}

export interface OperationalHarnessBridgeOptions {
  /** Trusted composition-root identity that the runtime input must preserve. */
  readonly trustedAgent: {
    readonly id: string
    readonly version: string
  }
  readonly harness: {
    execute(input: RuntimeInput): Promise<RuntimeResult>
  }
  readonly buildRuntimeInput: (input: HarnessActionRequest) => RuntimeInput
}

export interface TurnResponse {
  readonly responseId: string
  readonly deliveryKey: string
  readonly text: string
  readonly groundingAccepted: boolean
  readonly deliveryStatus: DeliveryStatus
}

export interface TurnRecord {
  readonly identity: TurnIdentity
  readonly idempotencyKey: string
  readonly text: string
  readonly status: TurnStatus
  readonly executionStatus?: ConversationExecutionStatus | undefined
  readonly interpretation?: DialogueInterpretation | undefined
  readonly planKind?: DialoguePlan['kind'] | undefined
  readonly response?: TurnResponse | undefined
  readonly createdAt: string
  readonly updatedAt: string
}

export interface AcceptedTurn {
  readonly turn: TurnRecord
  readonly snapshot: ConversationSnapshot
  readonly replayed: boolean
}

export interface TurnAcceptanceInput extends TurnEnvelope {
  readonly profile: ConversationProfile
}

export interface TurnCommitInput {
  readonly scope: ConversationScope
  readonly turnId: TurnId
  readonly idempotencyKey: string
  readonly expectedStateVersion: number
  readonly conversationStatus: ConversationStatus
  readonly status: TurnStatus
  readonly executionStatus?: ConversationExecutionStatus | undefined
  /** Execution identity bound to this turn after a governed result exists. */
  readonly executionId?: ExecutionId | undefined
  readonly memory: WorkingMemory
  /** Accepted snapshot used for a three-way merge after optimistic conflict. */
  readonly baseMemory?: WorkingMemory | undefined
  readonly interpretation: DialogueInterpretation
  readonly planKind: DialoguePlan['kind']
  readonly response: TurnResponse
  readonly now: string
}

export interface TurnCommitResult {
  readonly turn: TurnRecord
  readonly snapshot: ConversationSnapshot
}

export interface ExecutionOutcome {
  readonly status: ExecutionRecordStatus
  /** Conversation turn that created and owns this execution reservation. */
  readonly turnId: TurnId
  readonly executionId: ExecutionId
  readonly proposalHash: string
  readonly operationKey: string
  readonly approvalId?: string | undefined
  readonly effectConfirmed: boolean
  readonly output?: ConversationJsonValue | undefined
  readonly response?: string | undefined
  readonly stopReason?: string | undefined
  readonly evidenceRefs: readonly string[]
  readonly recordedAt: string
  /** Internal coordination lease; never included in user-facing context. */
  readonly leaseUntil?: string | undefined
  readonly leaseToken?: string | undefined
}

export interface ExecutionClaimInput {
  readonly scope: ConversationScope
  readonly proposal: ActionProposal
  readonly turnId: TurnId
  readonly executionId: ExecutionId
  /** State version observed when the accepted turn built this proposal. */
  readonly expectedStateVersion: number
  readonly approvalResume?: AuthenticatedApprovalResume
}

/**
 * Second fence immediately before the governed Harness call. The store
 * linearizes effect authorization against a correction or competing turn;
 * the lease token proves that the claimant still owns the reservation.
 */
export interface ExecutionAuthorizationInput extends ExecutionClaimInput {
  readonly leaseToken: string
}

export type ExecutionClaim =
  | {
      readonly kind: 'EXECUTE'
      readonly leaseToken: string
      /** Owner turn used to fence finalization after a resume or reclaim. */
      readonly turnId: TurnId
    }
  | { readonly kind: 'REPLAY'; readonly outcome: ExecutionOutcome }
  | { readonly kind: 'IN_FLIGHT'; readonly outcome: ExecutionOutcome }
  | { readonly kind: 'WAITING_APPROVAL'; readonly outcome: ExecutionOutcome }
  | { readonly kind: 'STALE'; readonly outcome: ExecutionOutcome }

export interface ConversationStore {
  acceptTurn(input: TurnAcceptanceInput): Promise<AcceptedTurn>
  load(scope: ConversationScope): Promise<ConversationSnapshot | null>
  commitTurn(input: TurnCommitInput): Promise<TurnCommitResult>
  getTurn(scope: ConversationScope, turnId: TurnId): Promise<TurnRecord | null>
  getTurnByMessage(
    scope: ConversationScope,
    messageId: MessageId
  ): Promise<TurnRecord | null>
  updateDelivery(
    scope: ConversationScope,
    turnId: TurnId,
    deliveryStatus: DeliveryStatus
  ): Promise<TurnRecord>
  claimExecution(input: ExecutionClaimInput): Promise<ExecutionClaim>
  authorizeExecution(input: ExecutionAuthorizationInput): Promise<void>
  finalizeExecution(
    scope: ConversationScope,
    outcome: ExecutionOutcome
  ): Promise<void>
}

export interface DeliveryRequest {
  readonly scope: ConversationScope
  readonly turnId: TurnId
  readonly responseId: string
  readonly deliveryKey: string
  readonly text: string
}

export interface DeliveryReceipt {
  readonly status: Exclude<DeliveryStatus, 'NOT_REQUESTED'>
  readonly responseId: string
  readonly deliveryKey: string
  readonly attempts: number
}

export interface ResponseDelivery {
  /**
   * Delivers the already committed response. `deliveryKey` is the stable
   * idempotency key for the external sink. An adapter may retry after a
   * crash window, so a production sink must deduplicate that key; the
   * conversation layer does not claim external exactly-once delivery.
   */
  deliver(input: DeliveryRequest): Promise<DeliveryReceipt>
}

export interface ConversationTurnResult {
  readonly turn: TurnRecord
  readonly snapshot: ConversationSnapshot
  readonly response: TurnResponse
  readonly replayed: boolean
}

export interface ConversationServiceOptions {
  readonly store: ConversationStore
  readonly interpreter: DialogueInterpreter
  /** Required trusted registry; the input profile descriptor is ignored. */
  readonly profileAuthority: ConversationProfileAuthority
  readonly manager?: DialogueManager
  readonly composer?: ResponseComposer
  readonly harness?: ConversationHarness
  readonly knowledge?: KnowledgeProvider
  readonly handoff?: HandoffSink
  readonly approval?: ApprovalResumeVerifier
  readonly effectEvidence?: EffectEvidenceVerifier
  readonly delivery?: ResponseDelivery
  readonly clock?: () => Date
  readonly defaultBudget?: ExecutionBudget
  /** Maximum time duplicate callers may wait for an existing reservation. */
  readonly maxInFlightWaitMs?: number
}

export interface ApprovalResumeVerifier {
  /**
   * Delegates authentication to the existing approval authority. This
   * package never interprets `authenticated` from the transport as proof.
   */
  verify(input: {
    readonly scope: ConversationScope
    readonly pendingApproval: PendingApproval
    readonly resume: ApprovalResumeRequest
  }): Promise<boolean>
}

/**
 * Adapter input for the existing harness ContextEngine. Conversation state is
 * represented as bounded structured values; the Harness remains responsible
 * for priority ordering, trust labels and final token-budget trimming.
 */
export interface ConversationContextInput {
  readonly memory: WorkingMemory
  readonly capturedAt: string
}

export type ConversationContextSnapshot = ContextSnapshot

export interface ConversationService {
  runTurn(input: ConversationRequest): Promise<ConversationTurnResult>
  inspect(scope: ConversationScope): Promise<ConversationSnapshot | null>
}

export class ConversationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'STATE_CONFLICT'
      | 'TENANT_MISMATCH'
      | 'PROFILE_MISMATCH'
      | 'UNSAFE_REFERENCE'
      | 'PERSISTENCE_FAILURE',
    message: string
  ) {
    super(message)
    this.name = 'ConversationError'
  }
}

export function createId(prefix: string): string {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(prefix)) {
    throw new ConversationError('INVALID_INPUT', 'Invalid identifier prefix')
  }
  return `${prefix}_${randomUUID()}`
}

export function asTenantId(value: string): TenantIdValue {
  return value as TenantIdValue
}

export function asConversationId(value: string): ConversationIdValue {
  return value as ConversationIdValue
}

export function asSessionId(value: string): SessionIdValue {
  return value as SessionIdValue
}

export function asCorrelationId(value: string): CorrelationIdValue {
  return value as CorrelationIdValue
}

export function asTurnId(value: string): TurnId {
  return value as TurnId
}

export function asMessageId(value: string): MessageId {
  return value as MessageId
}

export function asExecutionId(value: string): ExecutionId {
  return value as ExecutionId
}

export function asProfileId(value: string): ProfileId {
  return value as ProfileId
}

const entityValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
  z.null()
])

export const DialogueInterpretationSchema = z
  .object({
    intent: z.enum(INTENTS),
    action: z.enum(ACTIONS).optional(),
    confidence: z.number().min(0).max(1),
    entities: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(80),
            value: entityValueSchema,
            confidence: z.number().min(0).max(1).optional()
          })
          .strict()
      )
      .max(32),
    references: z
      .array(
        z
          .object({
            kind: z.enum(['ORDINAL', 'PRONOUN', 'EXPLICIT']),
            token: z.string().trim().min(1).max(80),
            ordinal: z.number().int().min(1).max(8).optional(),
            targetKey: z.string().trim().min(1).max(80).optional()
          })
          .strict()
      )
      .max(8),
    query: z.string().trim().min(1).max(500).optional(),
    requestedCapability: z.string().trim().min(1).max(120).optional(),
    confirmationSignal: z.boolean(),
    correction: z
      .object({
        key: z.string().trim().min(1).max(80),
        value: entityValueSchema
      })
      .strict()
      .optional(),
    untrustedSpans: z.array(z.string().max(240)).max(8),
    reasonCodes: z.array(z.string().trim().min(1).max(80)).max(12)
  })
  .strict()

export function validateDialogueInterpretation(value: unknown):
  | { readonly valid: true; readonly value: DialogueInterpretation }
  | {
      readonly valid: false
      readonly errors: readonly string[]
    } {
  const result = DialogueInterpretationSchema.safeParse(value)
  if (result.success) return { valid: true, value: result.data }
  return {
    valid: false,
    errors: result.error.issues.map((issue) => issue.message)
  }
}

export function validateText(text: string, max = 4_000): string {
  if (typeof text !== 'string') {
    throw new ConversationError('INVALID_INPUT', 'Turn text must be a string')
  }
  const normalized = text.normalize('NFKC').trim()
  if (normalized.length === 0 || normalized.length > max) {
    throw new ConversationError('INVALID_INPUT', 'Turn text is outside bounds')
  }
  return normalized
}

export function isTerminalConversationStatus(
  status: ConversationStatus
): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED'
}
