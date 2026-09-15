import { createOperationalHarness } from '@cvg/harness'
import type {
  AgentId,
  AgentProfile,
  AgentVersion,
  ApprovalDecision,
  ApprovalEngine,
  ApprovalId,
  AuditEvent,
  AuditSink,
  ConversationId,
  ContextSnapshot,
  CorrelationId,
  ExecutionBudget,
  ModelGateway,
  ModelResult,
  Orchestrator,
  PolicyDecision,
  PolicyEngine,
  RuntimeInput,
  SessionId,
  TenantId,
  TelemetryEvent,
  TelemetrySink,
  ToolDefinition,
  ToolRegistry,
  TraceId
} from '@cvg/harness-contracts'

export const basicAgentProfile: AgentProfile = {
  id: 'basic-agent' as AgentId,
  version: '0.1.0' as AgentVersion,
  objective:
    'Provide a deterministic, governed greeting and echo demonstration.',
  instructions: [
    'Keep the response concise.',
    'Never claim an external effect occurred.'
  ],
  skills: [{ id: 'basic-demonstration', version: '0.1.0' }],
  tools: ['echo'],
  policies: ['demo-safe-default']
}

export const basicBudget: ExecutionBudget = {
  maxSteps: 1,
  maxModelCalls: 1,
  maxToolCalls: 1,
  maxDurationMs: 2_000,
  maxCostUsd: 1,
  maxTokens: 256
}

export function createBasicAgentInput(
  userMessage: string,
  requestedTool?: RuntimeInput['requestedTool']
): RuntimeInput {
  const context: ContextSnapshot = {
    values: { demo: true },
    sourceIds: ['basic-agent-fixture'],
    capturedAt: '2026-09-13T00:00:00.000Z'
  }

  return {
    agent: basicAgentProfile,
    tenantId: 'demo-tenant' as TenantId,
    conversationId: 'demo-conversation' as ConversationId,
    sessionId: 'demo-session' as SessionId,
    correlationId: 'demo-correlation' as CorrelationId,
    traceId: 'demo-trace' as TraceId,
    userMessage,
    context,
    state: {
      version: 1,
      values: {},
      updatedAt: '2026-09-13T00:00:00.000Z'
    },
    budget: basicBudget,
    ...(requestedTool ? { requestedTool } : {})
  }
}

interface BasicFixtureOptions {
  readonly orchestrator?: Orchestrator
  readonly policyOverride?: PolicyEngine
  readonly approvalOverride?: ApprovalEngine
  readonly policyOutcome?: PolicyDecision['outcome']
  readonly approvalStatus?: ApprovalDecision['status']
  readonly auditFailure?: boolean
}

export interface BasicAgentFixture {
  readonly harness: ReturnType<typeof createOperationalHarness>
  readonly auditEvents: AuditEvent[]
  readonly telemetryEvents: TelemetryEvent[]
  readonly modelCalls: { count: number }
  readonly toolCalls: { count: number }
  readonly approvalCalls: { count: number }
}

export function createBasicAgentFixture(
  options: BasicFixtureOptions = {}
): BasicAgentFixture {
  const auditEvents: AuditEvent[] = []
  const telemetryEvents: TelemetryEvent[] = []
  const modelCalls = { count: 0 }
  const toolCalls = { count: 0 }
  const approvalCalls = { count: 0 }

  const modelGateway: ModelGateway = {
    async complete(): Promise<ModelResult> {
      modelCalls.count += 1
      return {
        text: 'Hello from the CVG Operational Harness.',
        provider: 'basic-agent-mock',
        model: 'deterministic-demo',
        inputTokens: 12,
        outputTokens: 8,
        costUsd: 0
      }
    }
  }

  const echoTool: ToolDefinition = {
    id: 'echo',
    version: '0.1.0',
    description:
      'Return the supplied demo input without external side effects.',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'NONE',
    idempotent: true,
    requiresApproval: false,
    async execute(input) {
      toolCalls.count += 1
      return { status: 'SUCCEEDED', output: { echo: input } }
    }
  }

  const tools: ToolRegistry = {
    list: () => [echoTool],
    resolve: (toolId, version) =>
      toolId === echoTool.id && (!version || version === echoTool.version)
        ? echoTool
        : undefined
  }

  const policy: PolicyEngine = options.policyOverride ?? {
    async evaluate(): Promise<PolicyDecision> {
      return {
        outcome: options.policyOutcome ?? 'ALLOW',
        reason: 'demo policy decision',
        policyVersion: 'demo-safe-default@0.1.0'
      }
    }
  }

  const approvals: ApprovalEngine = options.approvalOverride ?? {
    async request(): Promise<ApprovalDecision> {
      approvalCalls.count += 1
      const status = options.approvalStatus ?? 'APPROVED'
      if (status === 'APPROVED') {
        return {
          status,
          approvalId: 'demo-approval' as ApprovalId,
          reason: 'demo approval granted'
        }
      }

      return { status, reason: `demo approval ${status.toLowerCase()}` }
    }
  }

  const audit: AuditSink = {
    async append(event) {
      if (options.auditFailure) {
        throw new Error('synthetic audit sink failure')
      }
      auditEvents.push(event)
    }
  }

  const telemetry: TelemetrySink = {
    record(event) {
      telemetryEvents.push(event)
    }
  }

  return {
    harness: createOperationalHarness({
      ...(options.orchestrator ? { orchestrator: options.orchestrator } : {}),
      modelGateway,
      policy,
      approvals,
      tools,
      audit,
      telemetry
    }),
    auditEvents,
    telemetryEvents,
    modelCalls,
    toolCalls,
    approvalCalls
  }
}

export async function runBasicAgentDemo(): Promise<{
  readonly greeting: Awaited<ReturnType<BasicAgentFixture['harness']['run']>>
  readonly echo: Awaited<ReturnType<BasicAgentFixture['harness']['run']>>
}> {
  const fixture = createBasicAgentFixture()
  const greeting = await fixture.harness.run(createBasicAgentInput('hello'))
  const echo = await fixture.harness.run(
    createBasicAgentInput('echo this', {
      toolId: 'echo',
      toolVersion: '0.1.0',
      input: { value: 'this' },
      operationKey: 'basic-demo-echo-1'
    })
  )

  return { greeting, echo }
}
