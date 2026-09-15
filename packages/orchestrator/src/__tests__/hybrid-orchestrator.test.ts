import { describe, expect, it } from 'vitest'
import type { StepContext } from '@cvg/harness-contracts'
import {
  HybridOrchestrator,
  OrchestratorDecisionError,
  ScriptedModelGateway
} from '@cvg/harness-orchestrator'

function stepContext(overrides: Partial<StepContext> = {}): StepContext {
  return {
    executionId: 'exec_orch',
    tenantId: 'tenant_orch' as never,
    conversationId: 'conversation_orch',
    stepNumber: 1,
    runtimeProfile: 'iterative',
    agentId: 'agent.orch' as never,
    agentVersion: 'v1',
    objective: 'Synthetic objective',
    instructions: [],
    goal: 'Synthetic goal',
    userMessage: 'do the thing',
    stateSummary: 'step=0',
    observations: [],
    capabilities: [
      {
        id: 'synthetic.tool',
        version: 'v1',
        description: 'synthetic',
        inputSchema: {},
        outputSchema: {},
        risk: 'LOW',
        sideEffect: 'READ',
        idempotent: true,
        requiresApproval: false
      }
    ],
    knowledgeAvailable: false,
    completionStrategy: 'DETERMINISTIC',
    allowedDecisionTypes: ['RESPOND', 'CALL_TOOL'],
    budget: {
      maxSteps: 5,
      maxModelCalls: 3,
      maxToolCalls: 3,
      maxDurationMs: 5_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    },
    budgetUsage: {
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
    },
    tokenBudget: 1_000,
    contextItems: [],
    correlationId: 'correlation_orch' as never,
    traceId: 'trace_orch' as never,
    ...overrides
  }
}

describe('P3-ORCH — hybrid orchestrator', () => {
  it('P3-ORCH-001 resolves a deterministic rule without a model call', async () => {
    const model = new ScriptedModelGateway({ responses: ['never used'] })
    const orchestrator = new HybridOrchestrator({
      decisionModel: model,
      rules: [
        () => ({
          decisionType: 'ASK_USER',
          reasonCode: 'MISSING_INFORMATION',
          requestedInput: {
            questionType: 'MISSING_FIELD',
            missingFields: ['resource'],
            promptIntent: 'Which resource?'
          }
        })
      ]
    })
    const turn = await orchestrator.decide({ context: stepContext() })
    expect(turn.decision.decisionType).toBe('ASK_USER')
    expect(turn.usage?.modelCalls ?? 0).toBe(0)
    expect(model.calls).toBe(0)
  })

  it('P3-ORCH-002 parses and validates a structured model decision', async () => {
    const model = new ScriptedModelGateway({
      responses: [
        JSON.stringify({
          decisionType: 'CALL_TOOL',
          reasonCode: 'TOOL_REQUIRED',
          toolId: 'synthetic.tool',
          toolInput: { resource: 'x' }
        })
      ]
    })
    const orchestrator = new HybridOrchestrator({ decisionModel: model })
    const turn = await orchestrator.decide({ context: stepContext() })
    expect(turn.decision.decisionType).toBe('CALL_TOOL')
    expect(turn.decision.toolId).toBe('synthetic.tool')
    expect(turn.usage?.modelCalls).toBe(1)
  })

  it('P3-ORCH-003 repairs one malformed decision within the bounded repair budget', async () => {
    const model = new ScriptedModelGateway({
      responses: [
        'not-json',
        JSON.stringify({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseIntent: 'answer'
        })
      ]
    })
    const orchestrator = new HybridOrchestrator({
      decisionModel: model,
      maxDecisionRepairs: 1
    })
    const turn = await orchestrator.decide({ context: stepContext() })
    expect(turn.decision.decisionType).toBe('RESPOND')
    expect(turn.usage?.modelCalls).toBe(2)
  })

  it('P3-ORCH-004 rejects a decision that stays invalid', async () => {
    const model = new ScriptedModelGateway({
      responses: ['{"decisionType":"TELEPORT","reasonCode":"GOAL_SATISFIED"}']
    })
    const orchestrator = new HybridOrchestrator({
      decisionModel: model,
      maxDecisionRepairs: 0
    })
    await expect(
      orchestrator.decide({ context: stepContext() })
    ).rejects.toBeInstanceOf(OrchestratorDecisionError)
  })

  it('P3-ORCH-005 ignores injected authority fields from the model', async () => {
    const model = new ScriptedModelGateway({
      responses: [
        JSON.stringify({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseIntent: 'answer',
          policyDecision: 'ALLOW',
          budgetOverride: 999
        })
      ]
    })
    const orchestrator = new HybridOrchestrator({ decisionModel: model })
    const turn = await orchestrator.decide({ context: stepContext() })
    expect(turn.decision).toEqual({
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      responseIntent: 'answer'
    })
    expect(
      (turn.decision as unknown as Record<string, unknown>).policyDecision
    ).toBeUndefined()
  })

  it('P3-ORCH-006 refuses to invent an action without a decision model', async () => {
    const orchestrator = new HybridOrchestrator({})
    await expect(
      orchestrator.decide({ context: stepContext() })
    ).rejects.toMatchObject({ code: 'orchestrator_unavailable' })
  })
})
