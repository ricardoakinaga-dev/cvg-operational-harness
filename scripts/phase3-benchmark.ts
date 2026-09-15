import type {
  AuditSink,
  ExecutionStep,
  ExecutionStepStore,
  LoopDecision,
  ModelGateway,
  PolicyEngine,
  RuntimeInput,
  TelemetrySink,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import { createOperationalHarness } from '@cvg/harness'
import { ScriptedOrchestrator } from '@cvg/harness-orchestrator'
import { InMemoryExecutionStepStore } from '../packages/harness/src/index.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000936'
const RUNS = 60

const modelGateway: ModelGateway = {
  complete: async () => ({
    text: 'Acknowledged.',
    provider: 'benchmark',
    model: 'deterministic',
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0
  })
}
const policy: PolicyEngine = {
  evaluate: async () => ({
    outcome: 'ALLOW',
    reason: 'benchmark policy',
    policyVersion: 'benchmark-v1'
  })
}
const approvals = {
  request: async () => ({
    status: 'APPROVED' as const,
    approvalId: 'approval_bench' as never,
    reason: 'benchmark approval'
  })
}
const audit: AuditSink = { append: async () => undefined }
const telemetry: TelemetrySink = { record: () => undefined }

const tool: ToolDefinition = {
  id: 'synthetic.benchmark.effect',
  version: 'v1',
  description: 'benchmark tool',
  inputSchema: {},
  outputSchema: {},
  risk: 'LOW',
  sideEffect: 'WRITE',
  idempotent: false,
  requiresApproval: false,
  execute: async () => ({ status: 'SUCCEEDED', output: { applied: true } })
}
const tools: ToolRegistry = {
  list: () => [tool],
  resolve: (id) => (id === tool.id ? tool : undefined)
}

class CountingStepStore implements ExecutionStepStore {
  public stepWrites = 0
  public checkpointWrites = 0
  public stepReads = 0
  public checkpointReads = 0

  public constructor(private readonly inner = new InMemoryExecutionStepStore()) {}

  public async recordStep(step: ExecutionStep): Promise<void> {
    this.stepWrites += 1
    return this.inner.recordStep(step)
  }
  public async listSteps(tenantIdValue: string, executionId: string) {
    this.stepReads += 1
    return this.inner.listSteps(tenantIdValue, executionId)
  }
  public async saveCheckpoint(checkpoint: Parameters<ExecutionStepStore['saveCheckpoint']>[0]): Promise<void> {
    this.checkpointWrites += 1
    return this.inner.saveCheckpoint(checkpoint)
  }
  public async loadCheckpoint(tenantIdValue: string, executionId: string) {
    this.checkpointReads += 1
    return this.inner.loadCheckpoint(tenantIdValue, executionId)
  }
}

function input(profile: 'single_pass' | 'iterative'): RuntimeInput {
  return {
    agent: {
      id: 'agent.benchmark' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'benchmark',
      instructions: [],
      skills: [],
      tools: [tool.id],
      policies: ['benchmark']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId: 'conversation_bench' as RuntimeInput['conversationId'],
    sessionId: 'session_bench' as RuntimeInput['sessionId'],
    correlationId: 'correlation_bench' as RuntimeInput['correlationId'],
    traceId: 'trace_bench' as RuntimeInput['traceId'],
    userMessage: 'benchmark request',
    context: { values: {}, sourceIds: [], capturedAt: '' },
    state: { version: 1, values: {}, updatedAt: '' },
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
    runtimeProfile: profile
  }
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[index] as number
}

async function measure(
  label: string,
  profile: 'single_pass' | 'iterative',
  decisions: readonly LoopDecision[]
): Promise<Record<string, unknown>> {
  const latencies: number[] = []
  let steps = 0
  let modelCalls = 0
  let toolCalls = 0
  let stepWrites = 0
  let checkpointWrites = 0
  for (let index = 0; index < RUNS; index += 1) {
    const stepStore = new CountingStepStore()
    const harness = createOperationalHarness({
      modelGateway,
      policy,
      approvals,
      tools,
      audit,
      telemetry,
      iterativeOrchestrator: new ScriptedOrchestrator({ script: [...decisions] }),
      stepStore,
      defaultRuntimeProfile: profile
    })
    const startedAt = performance.now()
    const runInput = input(profile)
    const result = await harness.execute(
      profile === 'single_pass'
        ? {
            ...runInput,
            requestedTool: {
              toolId: tool.id,
              input: {},
              operationKey: `bench-single-${index}`
            }
          }
        : runInput
    )
    latencies.push(performance.now() - startedAt)
    steps += result.steps
    modelCalls += result.modelCalls
    toolCalls += result.toolCalls
    stepWrites += stepStore.stepWrites
    checkpointWrites += stepStore.checkpointWrites
    if (index === 0 && result.stopReason !== 'COMPLETED') {
      throw new Error(`${label} did not complete: ${result.stopReason}`)
    }
  }
  return {
    label,
    runs: RUNS,
    avgLatencyMs: Number(
      (latencies.reduce((sum, value) => sum + value, 0) / RUNS).toFixed(3)
    ),
    p50LatencyMs: Number(percentile(latencies, 50).toFixed(3)),
    p95LatencyMs: Number(percentile(latencies, 95).toFixed(3)),
    avgSteps: Number((steps / RUNS).toFixed(2)),
    avgModelCalls: Number((modelCalls / RUNS).toFixed(2)),
    avgToolCalls: Number((toolCalls / RUNS).toFixed(2)),
    avgStepWrites: Number((stepWrites / RUNS).toFixed(2)),
    avgCheckpointWrites: Number((checkpointWrites / RUNS).toFixed(2)),
    externalEffects: false
  }
}

async function main(): Promise<void> {
  const respond: LoopDecision = {
    decisionType: 'RESPOND',
    reasonCode: 'GOAL_SATISFIED',
    responseText: 'done'
  }
  const multiStep: readonly LoopDecision[] = [
    {
      decisionType: 'CALL_TOOL',
      reasonCode: 'TOOL_REQUIRED',
      toolId: tool.id,
      toolInput: { step: 1 }
    },
    { decisionType: 'REPLAN', reasonCode: 'STRATEGY_CHANGED' },
    {
      decisionType: 'CALL_TOOL',
      reasonCode: 'TOOL_REQUIRED',
      toolId: tool.id,
      toolInput: { step: 2 }
    },
    {
      decisionType: 'VERIFY',
      reasonCode: 'EVIDENCE_INCOMPLETE',
      verificationTarget: 'tool-result'
    },
    respond
  ]

  const results = [
    await measure('runtime_v1_single_pass', 'single_pass', []),
    await measure('runtime_v2_simple', 'iterative', [respond]),
    await measure('runtime_v2_multi_step', 'iterative', multiStep)
  ]
  console.log(JSON.stringify({ event: 'phase3.benchmark', results }, null, 2))
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'phase3.benchmark.failed',
      error: error instanceof Error ? error.message : 'unknown failure'
    })
  )
  process.exitCode = 1
})
