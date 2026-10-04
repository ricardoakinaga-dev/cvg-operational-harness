import { describe, expect, it } from 'vitest'
import type {
  ModelRequest,
  ModelResult,
  StepContext
} from '@cvg/harness-contracts'
import {
  HybridOrchestrator,
  OrchestratorDecisionError,
  ScriptedModelGateway
} from '../index.ts'

/**
 * ENGINE-PROD-FIX ENG-010: contract tests for the decision boundary that
 * picks the next governed step in production loops.
 */

function stepContext(overrides: Partial<StepContext> = {}): StepContext {
  return {
    executionId: 'exec_orch_contract',
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
    capabilities: [],
    knowledgeAvailable: false,
    completionStrategy: 'DETERMINISTIC',
    allowedDecisionTypes: ['RESPOND', 'ASK_USER'],
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

const respond = JSON.stringify({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseIntent: 'answer'
})

class RecordingModel {
  public readonly requests: ModelRequest[] = []

  public constructor(private readonly responses: string[]) {}

  public async complete(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request)
    const text = this.responses.shift()
    if (text === undefined) throw new Error('responses exhausted')
    return {
      text,
      provider: 'recording',
      model: 'recording-1',
      inputTokens: 7,
      outputTokens: 3,
      costUsd: 0.002
    }
  }
}

describe('hybrid orchestrator decision contract', () => {
  it('repairs a decision type that is not allowed in the step', async () => {
    const model = new RecordingModel([
      JSON.stringify({
        decisionType: 'CALL_TOOL',
        reasonCode: 'TOOL_REQUIRED',
        toolId: 'synthetic.tool'
      }),
      respond
    ])
    const turn = await new HybridOrchestrator({
      decisionModel: model,
      maxDecisionRepairs: 1
    }).decide({ context: stepContext() })

    expect(turn.decision.decisionType).toBe('RESPOND')
    expect(model.requests).toHaveLength(2)
    expect(model.requests[1]?.purpose).toBe('REPAIR')
    expect(model.requests[1]?.messages[0]?.content).toContain(
      'decisionType CALL_TOOL is not allowed'
    )
  })

  it('rejects a disallowed decision type once repairs are exhausted', async () => {
    const model = new ScriptedModelGateway({
      responses: [
        JSON.stringify({
          decisionType: 'CALL_TOOL',
          reasonCode: 'TOOL_REQUIRED'
        })
      ]
    })
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 0
      }).decide({ context: stepContext() })
    ).rejects.toMatchObject({ code: 'decision_invalid' })
  })

  it('accumulates usage across every model call of a repaired decision', async () => {
    const model = new RecordingModel(['not-json', respond])
    const turn = await new HybridOrchestrator({
      decisionModel: model,
      maxDecisionRepairs: 2
    }).decide({ context: stepContext() })

    expect(turn.usage).toEqual({
      modelCalls: 2,
      inputTokens: 14,
      outputTokens: 6,
      costUsd: 0.004
    })
  })

  it('parses a fenced JSON decision', async () => {
    const model = new RecordingModel(['```json\n' + respond + '\n```'])
    const turn = await new HybridOrchestrator({ decisionModel: model }).decide({
      context: stepContext()
    })
    expect(turn.decision.decisionType).toBe('RESPOND')
  })

  it('clamps the repair budget to the 0..5 range', async () => {
    const neverValid = Array.from({ length: 10 }, () => 'not-json')
    const many = new RecordingModel([...neverValid])
    await expect(
      new HybridOrchestrator({
        decisionModel: many,
        maxDecisionRepairs: 50
      }).decide({ context: stepContext() })
    ).rejects.toBeInstanceOf(OrchestratorDecisionError)
    expect(many.requests).toHaveLength(6)

    const none = new RecordingModel([...neverValid])
    await expect(
      new HybridOrchestrator({
        decisionModel: none,
        maxDecisionRepairs: -3
      }).decide({ context: stepContext() })
    ).rejects.toBeInstanceOf(OrchestratorDecisionError)
    expect(none.requests).toHaveLength(1)
  })

  it('forwards the runtime abort signal and stops repairing once aborted', async () => {
    const controller = new AbortController()
    const model = new RecordingModel(['not-json', respond])
    const original = model.complete.bind(model)
    model.complete = async (request) => {
      const result = await original(request)
      controller.abort()
      return result
    }

    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 3
      }).decide({ context: stepContext(), signal: controller.signal })
    ).rejects.toMatchObject({ code: 'orchestrator_unavailable' })
    expect(model.requests).toHaveLength(1)
    expect(model.requests[0]?.signal).toBe(controller.signal)
  })

  it('rejects an invalid decision produced by a deterministic rule', async () => {
    const orchestrator = new HybridOrchestrator({
      rules: [() => ({ decisionType: 'TELEPORT' }) as never]
    })
    await expect(
      orchestrator.decide({ context: stepContext() })
    ).rejects.toMatchObject({ code: 'decision_invalid' })
  })
})
