import type {
  AgenticKnowledgeProvider,
  AgentProfile,
  ApprovalDecision,
  ApprovalEngine,
  ApprovalRequest,
  AuditEvent,
  AuditSink,
  KnowledgeSearchRequest,
  KnowledgeSearchResult,
  LoopDecision,
  ModelGateway,
  ModelResult,
  PolicyDecision,
  PolicyEngine,
  PolicyRequest,
  RuntimeInput,
  SufficiencyEvaluation,
  SufficiencyEvaluator,
  TelemetryEvent,
  TelemetrySink,
  ToolDefinition,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'
import { EMPTY_MODEL_USAGE } from '@cvg/harness-contracts'

export const PHASE3_TENANT =
  'tenant_00000000-0000-4000-8000-000000000003' as RuntimeInput['tenantId']

export const PHASE3_TOOL_AVAILABILITY = 'synthetic.phase3.availability'
export const PHASE3_TOOL_RESERVE = 'synthetic.phase3.reserve'

export function phase3RuntimeInput(
  overrides: Partial<RuntimeInput> = {}
): RuntimeInput {
  return {
    agent: phase3AgentProfile(),
    tenantId: PHASE3_TENANT,
    executionId: 'exec_phase3_fixture',
    conversationId:
      'conversation_phase3_fixture' as RuntimeInput['conversationId'],
    sessionId: 'session_phase3_fixture' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_phase3_fixture' as RuntimeInput['correlationId'],
    traceId: 'trace_phase3_fixture' as RuntimeInput['traceId'],
    userMessage: 'phase 3 controlled fixture',
    context: {
      values: { fixture: 'phase3' },
      sourceIds: ['phase3-fixture'],
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-15T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30_000,
      maxCostUsd: 1,
      maxTokens: 4_000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    },
    runtimeProfile: 'iterative',
    ...overrides
  }
}

export function phase3AgentProfile(
  overrides: Partial<AgentProfile> = {}
): AgentProfile {
  return {
    id: 'agent.phase3.synthetic' as AgentProfile['id'],
    version: 'v1' as AgentProfile['version'],
    objective: 'Complete the synthetic operational goal.',
    instructions: ['synthetic only', 'never act without authorization'],
    skills: [],
    tools: [PHASE3_TOOL_AVAILABILITY, PHASE3_TOOL_RESERVE],
    policies: ['synthetic-only'],
    ...overrides
  }
}

export interface Phase3ToolObserver {
  (event: { toolId: string; operationKey: string; input: unknown }): void
}

export function createPhase3ToolRegistry(options: {
  readonly availability: 'AVAILABLE' | 'UNAVAILABLE'
  readonly reserveFails?: boolean
  readonly observe?: Phase3ToolObserver
}): ToolRegistry {
  const availabilityTool: ToolDefinition = {
    id: PHASE3_TOOL_AVAILABILITY,
    version: 'v1',
    description: 'Checks the synthetic resource availability.',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async (input, context): Promise<ToolResult> => {
      options.observe?.({
        toolId: availabilityTool.id,
        operationKey: context.operationKey ?? '',
        input
      })
      return {
        status: 'SUCCEEDED',
        output:
          options.availability === 'AVAILABLE'
            ? { available: true }
            : { available: false, reason: 'occupied' }
      }
    }
  }
  const reserveTool: ToolDefinition = {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'Creates a synthetic reservation.',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'MEDIUM',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async (input, context): Promise<ToolResult> => {
      options.observe?.({
        toolId: reserveTool.id,
        operationKey: context.operationKey ?? '',
        input
      })
      if (options.reserveFails) {
        return { status: 'FAILED', error: 'synthetic failure' }
      }
      return {
        status: 'SUCCEEDED',
        output: { reservationRef: 'reservation-0001', applied: true }
      }
    }
  }
  const tools = [availabilityTool, reserveTool]
  return {
    list: () => tools,
    resolve: (toolId, version) =>
      tools.find(
        (tool) =>
          tool.id === toolId &&
          (version === undefined || tool.version === version)
      )
  }
}

export interface SyntheticKnowledgeItem {
  readonly itemId: string
  readonly text: string
  readonly sourceId: string
  readonly category: string
}

export class SyntheticKnowledgeProvider implements AgenticKnowledgeProvider {
  public readonly queries: string[] = []

  public constructor(
    private readonly catalog: readonly SyntheticKnowledgeItem[]
  ) {}

  public async search(
    request: KnowledgeSearchRequest
  ): Promise<KnowledgeSearchResult> {
    this.queries.push(request.query)
    const tokens = request.query.toLowerCase().split(/\s+/)
    const items = this.catalog.filter((item) => {
      const text = `${item.text} ${item.category}`.toLowerCase()
      return tokens.some((token) => token.length > 2 && text.includes(token))
    })
    return {
      query: request.query,
      items: items.map((item) => ({
        itemId: item.itemId,
        text: item.text,
        sourceId: item.sourceId,
        sourceVersion: 'v1',
        category: item.category
      })),
      provenance: items.map((item) => ({
        sourceId: item.sourceId,
        sourceVersion: 'v1',
        category: item.category
      }))
    }
  }
}

/** Requires all requested categories to be present before SUFFICIENT. */
export class CategorySufficiencyEvaluator implements SufficiencyEvaluator {
  public async evaluate(input: {
    readonly query: string
    readonly requestedCategories: readonly string[]
    readonly observations: readonly {
      readonly payload: unknown
    }[]
  }): Promise<SufficiencyEvaluation> {
    const found = new Map<string, Set<string>>()
    for (const observation of input.observations) {
      const payload = observation.payload as {
        items?: readonly {
          itemId: string
          category?: string
          sourceId: string
        }[]
      } | null
      for (const item of payload?.items ?? []) {
        const category = item.category ?? 'unknown'
        const sources = found.get(category) ?? new Set<string>()
        sources.add(item.sourceId)
        found.set(category, sources)
      }
    }
    const requested =
      input.requestedCategories.length > 0
        ? input.requestedCategories
        : [...found.keys()]
    const missing = requested.filter((category) => !found.has(category))
    const conflicting = requested.filter(
      (category) => (found.get(category)?.size ?? 0) > 1
    )
    const covered = requested.filter((category) => found.has(category))
    if (missing.length === 0 && conflicting.length === 0) {
      return {
        level: 'SUFFICIENT',
        reasonCode: 'ALL_CATEGORIES_COVERED',
        missingCategories: [],
        conflictingSources: [],
        coveredCategories: covered
      }
    }
    if (missing.length === 0) {
      return {
        level: 'CONFLICTING',
        reasonCode: 'CONFLICTING_SOURCES',
        missingCategories: [],
        conflictingSources: conflicting,
        coveredCategories: covered
      }
    }
    return {
      level: covered.length > 0 ? 'PARTIAL' : 'INSUFFICIENT',
      reasonCode: 'MISSING_CATEGORIES',
      missingCategories: missing,
      conflictingSources: conflicting,
      coveredCategories: covered
    }
  }
}

export const PHASE3_KNOWLEDGE_ITEMS: readonly SyntheticKnowledgeItem[] = [
  {
    itemId: 'evidence-infectious-1',
    text: 'condition-X infectious causes include pathogen-alpha.',
    sourceId: 'source-infectious',
    category: 'infectious'
  },
  {
    itemId: 'evidence-nutritional-1',
    text: 'condition-X nutritional causes include diet-deficiency-beta.',
    sourceId: 'source-nutritional',
    category: 'nutritional'
  },
  {
    itemId: 'evidence-metabolic-1',
    text: 'condition-X metabolic causes include enzyme-gamma.',
    sourceId: 'source-metabolic',
    category: 'metabolic'
  }
]

export class ScriptedPolicyEngine implements PolicyEngine {
  public readonly evaluations: PolicyRequest[] = []

  public constructor(
    private readonly deniedTools: readonly string[] = [],
    private readonly handoffTools: readonly string[] = [],
    private readonly approvalTools: readonly string[] = []
  ) {}

  public async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
    this.evaluations.push(request)
    if (this.deniedTools.includes(request.tool.id)) {
      return {
        outcome: 'DENY',
        reason: `Policy denies ${request.tool.id}.`,
        policyVersion: 'synthetic-policy-v1'
      }
    }
    if (this.handoffTools.includes(request.tool.id)) {
      return {
        outcome: 'HANDOFF',
        reason: `Policy requires a human for ${request.tool.id}.`,
        policyVersion: 'synthetic-policy-v1'
      }
    }
    if (this.approvalTools.includes(request.tool.id)) {
      return {
        outcome: 'REQUIRE_APPROVAL',
        reason: `Policy requires approval for ${request.tool.id}.`,
        policyVersion: 'synthetic-policy-v1'
      }
    }
    return {
      outcome: 'ALLOW',
      reason: 'Allowed by synthetic policy.',
      policyVersion: 'synthetic-policy-v1'
    }
  }
}

export class RecordingAuditSink implements AuditSink {
  public readonly events: AuditEvent[] = []

  public async append(event: AuditEvent): Promise<void> {
    this.events.push(event)
  }
}

export class RecordingTelemetrySink implements TelemetrySink {
  public readonly events: TelemetryEvent[] = []

  public record(event: TelemetryEvent): void {
    this.events.push(event)
  }
}

export class InMemoryApprovalEngine implements ApprovalEngine {
  private readonly decisions = new Map<string, ApprovalDecision>()

  public readonly requests: ApprovalRequest[] = []
  public approveOnRequest = false

  public async request(request: ApprovalRequest): Promise<ApprovalDecision> {
    this.requests.push(request)
    const existing = this.decisions.get(request.operationKey)
    if (existing) return existing
    if (this.approveOnRequest) {
      const decision: ApprovalDecision = {
        status: 'APPROVED',
        approvalId: `approval_${request.operationKey}` as never,
        reason: 'approved by fixture'
      }
      this.decisions.set(request.operationKey, decision)
      return decision
    }
    const decision: ApprovalDecision = {
      status: 'PENDING',
      approvalId: `approval_${request.operationKey}` as never,
      reason: 'approval pending'
    }
    this.decisions.set(request.operationKey, decision)
    return decision
  }

  public approve(operationKey: string): void {
    this.decisions.set(operationKey, {
      status: 'APPROVED',
      approvalId: `approval_${operationKey}` as never,
      reason: 'approved by operator'
    })
  }

  public deny(operationKey: string): void {
    this.decisions.set(operationKey, {
      status: 'DENIED',
      approvalId: `approval_${operationKey}` as never,
      reason: 'denied by operator'
    })
  }
}

export class ThrowingModelGateway implements ModelGateway {
  public calls = 0

  public async complete(): Promise<ModelResult> {
    this.calls += 1
    throw new Error('synthetic model outage')
  }
}

export function decision(
  value: Omit<LoopDecision, 'reasonCode'> &
    Partial<Pick<LoopDecision, 'reasonCode'>>
): LoopDecision {
  return { reasonCode: 'TOOL_REQUIRED', ...value }
}

export function orchestratorTurn(decisionValue: LoopDecision): {
  decision: LoopDecision
  usage: typeof EMPTY_MODEL_USAGE
} {
  return { decision: decisionValue, usage: EMPTY_MODEL_USAGE }
}
