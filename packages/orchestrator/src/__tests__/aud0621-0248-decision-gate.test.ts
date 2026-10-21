import { describe, expect, it } from 'vitest'
import type {
  ModelRequest,
  ModelResult,
  StepContext
} from '@cvg/harness-contracts'
import {
  HybridOrchestrator,
  OrchestratorDecisionError,
  type DecisionModelGate
} from '../index.ts'

/**
 * SPEC0248 §3.1 (AUD-0621 F02): the hybrid orchestrator asks the runtime's
 * budget port before every decision model call and every repair, and every
 * error it raises carries the usage spent so far.
 */

function stepContext(): StepContext {
  return {
    executionId: 'exec_gate',
    tenantId: 'tenant_gate' as never,
    conversationId: 'conversation_gate',
    stepNumber: 1,
    runtimeProfile: 'iterative',
    agentId: 'agent.gate' as never,
    agentVersion: 'v1',
    objective: 'Synthetic objective',
    instructions: [],
    goal: 'Synthetic goal',
    userMessage: 'decide',
    stateSummary: 'step=0',
    observations: [],
    capabilities: [],
    knowledgeAvailable: false,
    completionStrategy: 'DETERMINISTIC',
    allowedDecisionTypes: ['RESPOND', 'ASK_USER', 'STOP'],
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
    correlationId: 'correlation_gate' as never,
    traceId: 'trace_gate' as never
  }
}

const respond = JSON.stringify({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseIntent: 'answer'
})

class Model {
  public readonly requests: ModelRequest[] = []
  public constructor(private readonly texts: string[]) {}
  public async complete(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request)
    return {
      text: this.texts.shift() ?? 'not-json',
      provider: 'synthetic',
      model: 'synthetic-1',
      inputTokens: 4,
      outputTokens: 6,
      costUsd: 0.01
    }
  }
}

function gate(
  answers: Partial<{
    begin: boolean[]
    record: boolean[]
    repair: boolean[]
  }> = {}
) {
  const log: string[] = []
  const take = (list: boolean[] | undefined) => list?.shift() ?? true
  const port: DecisionModelGate = {
    beginCall: () => {
      log.push('begin')
      return take(answers.begin)
    },
    recordCall: (usage) => {
      log.push(`record:${usage.inputTokens}/${usage.outputTokens}`)
      return take(answers.record)
    },
    beginRepair: () => {
      log.push('repair')
      return take(answers.repair)
    }
  }
  return { port, log }
}

const ONE_CALL = {
  modelCalls: 1,
  inputTokens: 4,
  outputTokens: 6,
  costUsd: 0.01
}

describe('SPEC0248 hybrid orchestrator budget port', () => {
  it('does not call the model when the port refuses the first call', async () => {
    const model = new Model([respond])
    const { port, log } = gate({ begin: [false] })
    const error = await new HybridOrchestrator({ decisionModel: model })
      .decide({ context: stepContext(), modelGate: port })
      .catch((caught: unknown) => caught)
    expect(model.requests).toHaveLength(0)
    expect(log).toEqual(['begin'])
    expect(error).toBeInstanceOf(OrchestratorDecisionError)
    expect(error).toMatchObject({
      code: 'budget_exhausted',
      usage: { modelCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
    })
  })

  it('stops after a call whose usage exhausts the budget', async () => {
    const model = new Model(['not-json', respond])
    const { port, log } = gate({ record: [false] })
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 3
      }).decide({ context: stepContext(), modelGate: port })
    ).rejects.toMatchObject({ code: 'budget_exhausted', usage: ONE_CALL })
    expect(model.requests).toHaveLength(1)
    expect(log).toEqual(['begin', 'record:4/6'])
  })

  it('does not repair an unparseable answer without a repair slot', async () => {
    const model = new Model(['not-json', respond])
    const { port, log } = gate({ repair: [false] })
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 3
      }).decide({ context: stepContext(), modelGate: port })
    ).rejects.toMatchObject({ code: 'decision_unparseable', usage: ONE_CALL })
    expect(model.requests).toHaveLength(1)
    expect(log).toEqual(['begin', 'record:4/6', 'repair'])
  })

  it('does not repair an invalid decision without a repair slot', async () => {
    const model = new Model([
      JSON.stringify({
        decisionType: 'CALL_TOOL',
        reasonCode: 'TOOL_REQUIRED'
      }),
      respond
    ])
    const { port } = gate({ repair: [false] })
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 3
      }).decide({ context: stepContext(), modelGate: port })
    ).rejects.toMatchObject({ code: 'decision_invalid', usage: ONE_CALL })
    expect(model.requests).toHaveLength(1)
  })

  it('reserves each repair and each call through the port', async () => {
    const model = new Model(['not-json', respond])
    const { port, log } = gate()
    const turn = await new HybridOrchestrator({
      decisionModel: model,
      maxDecisionRepairs: 1
    }).decide({ context: stepContext(), modelGate: port })
    expect(turn.decision.decisionType).toBe('RESPOND')
    expect(turn.usage).toEqual({
      modelCalls: 2,
      inputTokens: 8,
      outputTokens: 12,
      costUsd: 0.02
    })
    expect(log).toEqual([
      'begin',
      'record:4/6',
      'repair',
      'begin',
      'record:4/6'
    ])
  })

  it('keeps its own repair ceiling before asking the port', async () => {
    const model = new Model(['not-json'])
    const { port, log } = gate()
    await expect(
      new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 0
      }).decide({ context: stepContext(), modelGate: port })
    ).rejects.toMatchObject({ code: 'decision_unparseable', usage: ONE_CALL })
    expect(log).toEqual(['begin', 'record:4/6'])
  })

  it('reports usage on cancellation and on exhausted repairs without a port', async () => {
    const controller = new AbortController()
    const model = new Model(['not-json', respond])
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
    ).rejects.toMatchObject({
      code: 'orchestrator_unavailable',
      usage: ONE_CALL
    })

    const invalid = new Model(['not-json', 'not-json', 'not-json'])
    await expect(
      new HybridOrchestrator({
        decisionModel: invalid,
        maxDecisionRepairs: 2
      }).decide({ context: stepContext() })
    ).rejects.toMatchObject({
      code: 'decision_unparseable',
      usage: { modelCalls: 3, inputTokens: 12, outputTokens: 18 }
    })
  })

  it('lets a failure of the model result itself propagate unchanged', async () => {
    const raw = new Error('raw model failure')
    const rogue = {
      complete: async () => ({
        get text(): string {
          throw raw
        },
        provider: 'synthetic',
        model: 'synthetic-1',
        inputTokens: 4,
        outputTokens: 6,
        costUsd: 0.01
      })
    }
    await expect(
      new HybridOrchestrator({
        decisionModel: rogue as never,
        maxDecisionRepairs: 0
      }).decide({ context: stepContext() })
    ).rejects.toBe(raw)

    const { port, log } = gate({ repair: [false] })
    await expect(
      new HybridOrchestrator({
        decisionModel: rogue as never,
        maxDecisionRepairs: 3
      }).decide({ context: stepContext(), modelGate: port })
    ).rejects.toBe(raw)
    expect(log).toEqual(['begin', 'record:4/6', 'repair'])
  })

  it('leaves deterministic rules and their empty usage outside the port', async () => {
    const { port, log } = gate()
    const turn = await new HybridOrchestrator({
      rules: [() => JSON.parse(respond)]
    }).decide({ context: stepContext(), modelGate: port })
    expect(turn.usage?.modelCalls).toBe(0)
    expect(log).toEqual([])
  })

  it('defaults the error usage to empty', () => {
    expect(
      new OrchestratorDecisionError('decision_invalid', 'x').usage
    ).toEqual({ modelCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 })
  })
})
