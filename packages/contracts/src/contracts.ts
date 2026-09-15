/**
 * Neutral contracts for the CVG Operational Harness.
 *
 * This module deliberately contains no runtime/framework/provider/product
 * dependency. Product profiles and adapters implement these ports; the
 * harness owns sequencing and governance.
 */

type Brand<Value, Name extends string> = Value & {
  readonly __harnessBrand: Name
}

export type AgentId = Brand<string, 'AgentId'>
export type AgentVersion = Brand<string, 'AgentVersion'>
export type TenantId = Brand<string, 'TenantId'>
export type ConversationId = Brand<string, 'ConversationId'>
export type SessionId = Brand<string, 'SessionId'>
export type CorrelationId = Brand<string, 'CorrelationId'>
export type TraceId = Brand<string, 'TraceId'>
export type ApprovalId = Brand<string, 'ApprovalId'>

export interface AgentProfile {
  readonly id: AgentId
  readonly version: AgentVersion
  readonly objective: string
  readonly instructions: readonly string[]
  readonly skills: readonly SkillRequirement[]
  readonly tools: readonly string[]
  readonly policies: readonly string[]
  /** Phase 3 completion strategy; ignored by the single-pass runtime. */
  readonly completionStrategy?: 'DETERMINISTIC' | 'EVIDENCE_BASED' | 'HYBRID'
}

export const STOP_REASONS = [
  'COMPLETED',
  'NEEDS_USER_INPUT',
  'APPROVAL_REQUIRED',
  'HUMAN_TAKEOVER',
  'POLICY_DENIED',
  'INSUFFICIENT_EVIDENCE',
  'MAX_STEPS',
  'MAX_COST',
  'MAX_DURATION',
  'MAX_TOKENS',
  'MAX_MODEL_CALLS',
  'MAX_TOOL_CALLS',
  'MAX_REPLANS',
  'MAX_KNOWLEDGE_CALLS',
  'MAX_VERIFICATION_CALLS',
  'VERIFICATION_FAILED',
  'LOOP_DETECTED',
  'TOOL_FAILURE',
  'MODEL_FAILURE',
  'INTERNAL_FAILURE',
  'STATE_CONFLICT',
  'CANCELLED',
  'UNSAFE_REQUEST'
] as const

export type StopReason = (typeof STOP_REASONS)[number]

export interface ExecutionBudget {
  readonly maxSteps: number
  readonly maxModelCalls: number
  readonly maxToolCalls: number
  readonly maxDurationMs: number
  readonly maxCostUsd: number
  readonly maxTokens: number
  /**
   * Phase 3 optional iterative budgets. Absent means "not constrained beyond
   * the shared budgets"; the iterative runtime never grants an unlimited
   * loop because maxSteps and maxDurationMs remain mandatory.
   */
  readonly maxKnowledgeCalls?: number
  readonly maxReplans?: number
  readonly maxVerificationCalls?: number
  readonly maxDecisionRepairs?: number
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type SideEffect = 'NONE' | 'READ' | 'WRITE' | 'EXTERNAL'

export interface SkillRequirement {
  readonly id: string
  readonly version?: string
}

export interface SkillDefinition {
  readonly id: string
  readonly version: string
  readonly description: string
  readonly requiredTools: readonly string[]
  readonly requiredKnowledge: readonly string[]
  readonly riskLevel: RiskLevel
}

export interface ToolInvocation {
  readonly toolId: string
  readonly toolVersion?: string
  readonly input: unknown
  readonly operationKey: string
}

export interface ToolResult {
  readonly status: 'SUCCEEDED' | 'FAILED' | 'REJECTED'
  readonly output?: unknown
  readonly error?: string
}

export interface ToolExecutionContext {
  readonly tenantId: TenantId
  readonly agentId: AgentId
  readonly correlationId: CorrelationId
  readonly traceId: TraceId
  readonly operationKey?: string
  readonly signal?: AbortSignal
}

export interface ToolDescriptor {
  readonly id: string
  readonly version: string
  readonly description: string
  readonly inputSchema: unknown
  readonly outputSchema: unknown
  readonly risk: RiskLevel
  readonly sideEffect: SideEffect
  readonly idempotent: boolean
  readonly requiresApproval: boolean
}

export interface ToolDefinition extends ToolDescriptor {
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult>
}

export interface ContextSnapshot {
  readonly values: Readonly<Record<string, unknown>>
  readonly sourceIds: readonly string[]
  readonly capturedAt: string
}

export interface StateSnapshot {
  readonly version: number
  readonly values: Readonly<Record<string, unknown>>
  readonly updatedAt: string
}

export interface ConversationState {
  readonly conversationId: ConversationId
  readonly snapshot: StateSnapshot
}

export interface ExecutionState {
  readonly sessionId: SessionId
  readonly step: number
  readonly snapshot: StateSnapshot
}

export interface WorkingMemory {
  readonly values: Readonly<Record<string, unknown>>
  readonly sourceIds: readonly string[]
}

/** Retrieval-oriented vocabulary only; no long-term memory implementation is included. */
export interface LongTermMemory {
  readonly providerId: string
  readonly retrievalOnly: true
}

export interface RuntimeInput {
  readonly agent: AgentProfile
  readonly tenantId: TenantId
  /** Set by the durable worker; never trusted from the public request body. */
  readonly executionId?: string
  /** Immutable capability composition binding supplied by the execution root. */
  readonly capabilityFingerprint?: string
  readonly conversationId: ConversationId
  readonly sessionId: SessionId
  readonly correlationId: CorrelationId
  readonly traceId: TraceId
  readonly userMessage: string
  readonly context: ContextSnapshot
  readonly state: StateSnapshot
  readonly budget: ExecutionBudget
  readonly requestedTool?: ToolInvocation
  /**
   * Explicit runtime selection. The composition root resolves the runtime
   * through its registry; no caller reaches a runtime class directly.
   */
  readonly runtimeProfile?: 'single_pass' | 'iterative'
  /**
   * Durable worker resume binding. The worker derives this from the execution
   * record; the public request body can never set it.
   */
  readonly resume?:
    | { readonly kind: 'approval'; readonly approvalId: string }
    | { readonly kind: 'user_input'; readonly message: string }
}

export interface RuntimeResult {
  readonly response: string
  readonly stopReason: StopReason
  /** Durable approval identity when execution is paused or approved. */
  readonly approvalId?: ApprovalId
  readonly steps: number
  readonly modelCalls: number
  readonly toolCalls: number
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }
  readonly toolResult?: ToolResult
}

export interface OrchestratorInput {
  readonly runtime: RuntimeInput
  readonly availableTools: readonly ToolDescriptor[]
  readonly step: number
  readonly previousResult?: RuntimeResult
}

export type OrchestratorAction =
  | 'RESPOND'
  | 'CALL_TOOL'
  | 'RETRIEVE'
  | 'ASK_USER'
  | 'REQUEST_APPROVAL'
  | 'HANDOFF'
  | 'VERIFY'
  | 'STOP'

export interface OrchestratorDecision {
  readonly action: OrchestratorAction
  readonly response?: string
  readonly toolInvocation?: ToolInvocation
  readonly reason?: string
}

export interface Orchestrator {
  decideNextStep(input: OrchestratorInput): Promise<OrchestratorDecision>
}

export interface ModelMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool'
  readonly content: string
}

export type ModelCallPurpose =
  | 'ORCHESTRATION'
  | 'RESPONSE'
  | 'EVALUATION'
  | 'REPAIR'

export interface ModelRequest {
  readonly messages: readonly ModelMessage[]
  readonly context: ContextSnapshot
  readonly budget: ExecutionBudget
  readonly correlationId: CorrelationId
  /** Phase 3 accounting hint; providers may ignore it. */
  readonly purpose?: ModelCallPurpose
}

export interface ModelResult {
  readonly text: string
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly costUsd: number
}

export interface ModelGateway {
  complete(request: ModelRequest): Promise<ModelResult>
}

export interface PolicyRequest {
  readonly tenantId: TenantId
  readonly agentId: AgentId
  readonly action: string
  readonly tool: ToolDefinition
  readonly invocation: ToolInvocation
  readonly correlationId: CorrelationId
}

export type PolicyOutcome = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL' | 'HANDOFF'

export interface PolicyDecision {
  readonly outcome: PolicyOutcome
  readonly reason: string
  readonly policyVersion: string
}

export interface PolicyEngine {
  evaluate(request: PolicyRequest): Promise<PolicyDecision>
}

export interface ApprovalRequest {
  readonly tenantId: TenantId
  readonly agentId: AgentId
  readonly operationKey: string
  readonly toolId: string
  readonly summary: string
  readonly correlationId: CorrelationId
  /** Durable execution identity injected by the worker before approval request. */
  readonly executionRef?: string
  /** Optional durable-binding fields supplied by the governed runtime. */
  readonly operatorId?: string
  readonly agentVersion?: AgentVersion
  readonly action?: string
  readonly resource?: { readonly type: string; readonly id?: string }
  readonly payload?: unknown
  readonly policyVersion?: string
}

export type ApprovalStatus = 'APPROVED' | 'DENIED' | 'PENDING'

export type ApprovalDecision =
  | {
      readonly status: 'APPROVED'
      readonly approvalId: ApprovalId
      readonly reason: string
    }
  | {
      readonly status: 'DENIED' | 'PENDING'
      readonly approvalId?: ApprovalId
      readonly reason: string
    }

export interface ApprovalEngine {
  request(request: ApprovalRequest): Promise<ApprovalDecision>
  /** Optional durable effect lifecycle; legacy in-memory fixtures may omit it. */
  readonly execution?: ApprovalExecutionPort
}

export interface ApprovalExecutionRequest {
  readonly tenantId: TenantId
  readonly approvalId: ApprovalId
  readonly agentId: AgentId
  readonly agentVersion: AgentVersion
  readonly action: string
  readonly resource: { readonly type: string; readonly id?: string }
  readonly payload: unknown
  readonly policyVersion: string
  readonly operationKey: string
  readonly executionRef: string
}

export interface ApprovalExecutionHandle {
  readonly approvalId: ApprovalId
  readonly reservationId: string
}

export interface ApprovalExecutionPort {
  begin(request: ApprovalExecutionRequest): Promise<ApprovalExecutionHandle>
  complete(input: {
    readonly request: ApprovalExecutionRequest
    readonly reservationId: string
    readonly evidenceRef: string
  }): Promise<void>
  fail(input: {
    readonly request: ApprovalExecutionRequest
    readonly reservationId: string
    readonly evidenceRef: string
  }): Promise<void>
  uncertain(input: {
    readonly request: ApprovalExecutionRequest
    readonly reservationId: string
    readonly reason: string
    readonly evidenceRef: string
  }): Promise<void>
}

export interface ToolRegistry {
  list(): readonly ToolDefinition[]
  resolve(toolId: string, version?: string): ToolDefinition | undefined
}

export type CapabilityOrigin = 'core' | 'skill' | 'plugin' | 'knowledge' | 'mcp'

/** Data-only identity for a capability exposed to a governed runtime. */
export interface CapabilityDescriptor extends ToolDescriptor {
  readonly origin: CapabilityOrigin
  readonly providerId: string
  readonly providerVersion: string
}

/** Executable code is intentionally separate from the descriptor contract. */
export interface CapabilityImplementation {
  validateInput(input: unknown): boolean
  execute(input: unknown, context: ToolExecutionContext): Promise<ToolResult>
  validateOutput(output: unknown): boolean
}

export interface CapabilityRegistration {
  readonly descriptor: CapabilityDescriptor
  readonly implementation: CapabilityImplementation
}

/** Explicit data-only registry port; implementations stay behind the harness. */
export interface CapabilityRegistry {
  register(registration: CapabilityRegistration): CapabilityRegistry
  listDescriptors(): readonly CapabilityDescriptor[]
  resolveDescriptor(
    capabilityId: string,
    version: string
  ): CapabilityDescriptor | undefined
  compositionFingerprint(): string
}

export interface AuditEvent {
  readonly actor: string | null
  readonly agent: AgentId
  readonly tenant: TenantId
  readonly action: string
  readonly policy: string | null
  readonly approval: ApprovalId | null
  readonly tool: string | null
  readonly result: string
  readonly timestamp: string
  readonly traceId: TraceId
  readonly correlationId: CorrelationId
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>
}

export interface TelemetryEvent {
  readonly name: string
  readonly latencyMs: number
  readonly errors: number
  readonly costUsd: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly provider: string | null
  readonly toolDurationMs: number
  readonly steps: number
  readonly traceId: TraceId
  readonly correlationId: CorrelationId
  /**
   * Bounded, non-identifying attributes (fixed labels only; never
   * execution/conversation identifiers).
   */
  readonly attributes?: Readonly<Record<string, string | number>>
}

export interface TelemetrySink {
  record(event: TelemetryEvent): void
}

export interface KnowledgeResult {
  readonly id: string
  readonly text: string
  readonly source: string
  readonly version: string
}

export interface KnowledgeProvider {
  search(
    query: string,
    context: ContextSnapshot
  ): Promise<readonly KnowledgeResult[]>
}

export interface MemoryStore {
  load(sessionId: SessionId): Promise<StateSnapshot>
  save(sessionId: SessionId, state: StateSnapshot): Promise<void>
}

export interface InboundMessage {
  readonly tenantId: TenantId
  readonly conversationId: ConversationId
  readonly externalMessageId: string
  readonly text: string
  readonly receivedAt: string
  readonly correlationId: CorrelationId
}

export interface OutboundMessage {
  readonly conversationId: ConversationId
  readonly text: string
  readonly correlationId: CorrelationId
}

export interface HarnessRuntime {
  execute(input: RuntimeInput): Promise<RuntimeResult>
}
