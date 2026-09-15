import { describe, expect, it } from 'vitest'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import { createOperationalHarness } from '../createOperationalHarness.ts'
import {
  InMemoryEffectJournal,
  createJournaledToolRegistry
} from '../effect-journal.ts'
import type {
  ApprovalEngine,
  AuditEvent,
  ModelGateway,
  PolicyEngine,
  RuntimeInput,
  TelemetryEvent,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000801'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.effect.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'effect fixture',
      instructions: ['synthetic'],
      skills: [],
      tools: ['synthetic.side-effect'],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_effect_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_effect_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_effect_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_effect_synthetic' as RuntimeInput['traceId'],
    userMessage: 'effect fixture',
    context: {
      values: {},
      sourceIds: [],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-13T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    },
    requestedTool: {
      toolId: 'synthetic.side-effect',
      operationKey: 'effect-operation-1',
      input: { value: 'synthetic' }
    }
  }
}

function createTool(counter: { value: number }): ToolDefinition {
  return {
    id: 'synthetic.side-effect',
    version: 'v1',
    description: 'Synthetic side effect fixture',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async () => {
      counter.value += 1
      return {
        status: 'SUCCEEDED',
        output: { applied: true, count: counter.value }
      }
    }
  }
}

function options(tools: ToolRegistry, journal: InMemoryEffectJournal) {
  const audit: AuditEvent[] = []
  const telemetry: TelemetryEvent[] = []
  const modelGateway: ModelGateway = {
    complete: async () => ({
      text: 'unused',
      provider: 'deterministic-v1',
      model: 'fixture',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  }
  const policy: PolicyEngine = {
    evaluate: async () => ({
      outcome: 'ALLOW',
      reason: 'synthetic allow',
      policyVersion: 'synthetic-v1'
    })
  }
  const approvals: ApprovalEngine = {
    request: async () => ({
      status: 'APPROVED',
      approvalId: 'approval_synthetic' as never,
      reason: 'fixture'
    })
  }
  return {
    orchestrator: new SinglePassOrchestrator(),
    modelGateway,
    policy,
    approvals,
    tools: createJournaledToolRegistry(tools, journal),
    audit: {
      append: async (event: AuditEvent) => {
        audit.push(event)
      }
    },
    telemetry: {
      record: (event: TelemetryEvent) => {
        telemetry.push(event)
      }
    },
    auditEvents: audit,
    telemetryEvents: telemetry
  }
}

describe('synthetic effect journal boundary', () => {
  it('replays a confirmed result without executing the effect twice', async () => {
    const counter = { value: 0 }
    const journal = new InMemoryEffectJournal()
    const registry: ToolRegistry = {
      list: () => [createTool(counter)],
      resolve: (toolId) =>
        toolId === 'synthetic.side-effect' ? createTool(counter) : undefined
    }
    const first = options(registry, journal)
    const harness = createOperationalHarness(first)
    const firstResult = await harness.execute(runtime())
    const second = options(registry, journal)
    const replay = await createOperationalHarness(second).execute(runtime())

    expect(firstResult.stopReason).toBe('COMPLETED')
    expect(replay.stopReason).toBe('COMPLETED')
    expect(replay.toolResult?.output).toEqual({ applied: true, count: 1 })
    expect(counter.value).toBe(1)
    expect((await journal.get(tenantId, 'effect-operation-1'))?.state).toBe(
      'CONFIRMED'
    )
  })

  it('marks a crash after the synthetic effect as UNCERTAIN and blocks silent retry', async () => {
    const counter = { value: 0 }
    const journal = new InMemoryEffectJournal()
    const registry: ToolRegistry = {
      list: () => [createTool(counter)],
      resolve: (toolId) =>
        toolId === 'synthetic.side-effect' ? createTool(counter) : undefined
    }
    const crashing = createOperationalHarness({
      ...options(registry, journal),
      tools: createJournaledToolRegistry(registry, journal, {
        crashAfterEffectBeforeConfirm: true
      })
    })
    const replay = createOperationalHarness(options(registry, journal))
    const crashed = await crashing.execute(runtime())
    const retried = await replay.execute(runtime())

    expect(crashed.stopReason).toBe('TOOL_FAILURE')
    expect(retried.stopReason).toBe('TOOL_FAILURE')
    expect(retried.response).toContain('unknown_effect')
    expect(counter.value).toBe(1)
    expect((await journal.get(tenantId, 'effect-operation-1'))?.state).toBe(
      'UNCERTAIN'
    )
  })
})
