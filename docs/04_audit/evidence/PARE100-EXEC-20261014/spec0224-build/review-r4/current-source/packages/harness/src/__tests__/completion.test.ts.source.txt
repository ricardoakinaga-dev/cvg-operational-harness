import { describe, expect, it, vi } from 'vitest'
import type {
  AgentLoopState,
  CompletionEvaluationInput,
  LoopDecision,
  Observation
} from '@cvg/harness-contracts'
import {
  createCompletionEvaluator,
  createModelCompletionJudge,
  DeterministicCompletionEvaluator
} from '../completion.ts'

function state(overrides: Partial<AgentLoopState> = {}): AgentLoopState {
  return {
    goal: 'Answer the synthetic question.',
    stepNumber: 1,
    observations: [],
    openQuestions: [],
    resolvedInputs: {},
    loopSignatures: [],
    ...overrides
  }
}

type DecisionOverrides = Omit<
  Partial<LoopDecision>,
  'responseText' | 'toolId'
> & {
  responseText?: string | undefined
  toolId?: string | undefined
}

function decision(overrides: DecisionOverrides = {}): LoopDecision {
  const { responseText, toolId, ...rest } = overrides
  return {
    decisionType: 'RESPOND',
    reasonCode: 'GOAL_SATISFIED',
    ...rest,
    ...(Object.prototype.hasOwnProperty.call(overrides, 'responseText')
      ? responseText === undefined
        ? {}
        : { responseText }
      : { responseText: 'A synthetic answer.' }),
    ...(toolId === undefined ? {} : { toolId })
  }
}

function observation(
  payload: unknown,
  overrides: Partial<Observation> = {}
): Observation {
  return {
    observationId: 'observation-1',
    executionId: 'execution-1',
    stepId: 'step-1',
    stepNumber: 1,
    type: 'TOOL_RESULT',
    source: 'TOOL',
    trust: 'UNTRUSTED',
    payload,
    summary: 'synthetic observation',
    provenance: { sourceId: 'synthetic.tool' },
    timestamp: '2026-09-20T00:00:00.000Z',
    ...overrides
  }
}

type InputOverrides = Omit<
  Partial<CompletionEvaluationInput>,
  'lastDecision'
> & {
  lastDecision?: LoopDecision | undefined
}

function input(overrides: InputOverrides = {}): CompletionEvaluationInput {
  const { lastDecision, ...rest } = overrides
  return {
    goal: 'Answer the synthetic question.',
    state: state(),
    observations: [],
    ...rest,
    ...(Object.prototype.hasOwnProperty.call(overrides, 'lastDecision')
      ? lastDecision === undefined
        ? {}
        : { lastDecision }
      : { lastDecision: decision() })
  }
}

describe('deterministic completion evaluator', () => {
  it('honors pending user questions and approvals before any decision', async () => {
    const evaluator = new DeterministicCompletionEvaluator()

    await expect(
      evaluator.evaluate({
        ...input({ lastDecision: undefined }),
        state: state({
          pendingQuestion: {
            questionType: 'MISSING_FIELD',
            missingFields: ['date'],
            promptIntent: 'Which date?'
          }
        })
      })
    ).resolves.toMatchObject({
      outcome: 'NEEDS_USER',
      reasonCode: 'MISSING_INFORMATION'
    })

    await expect(
      evaluator.evaluate({
        ...input({ lastDecision: undefined }),
        state: state({ pendingApprovalId: 'approval-1' })
      })
    ).resolves.toMatchObject({
      outcome: 'WAITING_APPROVAL',
      reasonCode: 'POLICY_REQUIRED'
    })

    await expect(
      evaluator.evaluate(input({ lastDecision: undefined }))
    ).resolves.toMatchObject({
      outcome: 'INCOMPLETE',
      reasonCode: 'EVIDENCE_INCOMPLETE'
    })
  })

  it('requires a successful effect for action-confirmation claims', async () => {
    const evaluator = new DeterministicCompletionEvaluator()
    const actionDecision = decision({
      reasonCode: 'ACTION_CONFIRMED',
      toolId: 'synthetic.write'
    })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: actionDecision,
          observations: [observation(null)]
        })
      )
    ).resolves.toMatchObject({
      outcome: 'FAILED',
      reasonCode: 'ACTION_CONFIRMED'
    })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: actionDecision,
          observations: [
            observation({ status: 'SUCCEEDED', sideEffect: 'READ' }),
            observation(
              { status: 'SUCCEEDED', sideEffect: 'WRITE' },
              {
                observationId: 'observation-2',
                provenance: { sourceId: 'synthetic.write' }
              }
            )
          ]
        })
      )
    ).resolves.toMatchObject({ outcome: 'COMPLETE' })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            reasonCode: 'ACTION_CONFIRMED',
            toolId: undefined
          }),
          observations: [
            observation({ status: 'SUCCEEDED', sideEffect: 'EXTERNAL' })
          ]
        })
      )
    ).resolves.toMatchObject({ outcome: 'COMPLETE' })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            reasonCode: 'ACTION_CONFIRMED',
            toolId: undefined
          }),
          observations: [
            observation({ status: 'SUCCEEDED', sideEffect: 'READ' })
          ]
        })
      )
    ).resolves.toMatchObject({ outcome: 'FAILED' })
  })

  it('handles replan, non-final decisions, failed tools, and empty responses', async () => {
    const evaluator = new DeterministicCompletionEvaluator()

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            decisionType: 'REPLAN',
            reasonCode: 'STRATEGY_CHANGED',
            responseText: undefined
          })
        })
      )
    ).resolves.toMatchObject({
      outcome: 'INCOMPLETE',
      reasonCode: 'STRATEGY_CHANGED'
    })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            decisionType: 'CALL_TOOL',
            reasonCode: 'TOOL_REQUIRED',
            responseText: undefined
          })
        })
      )
    ).resolves.toMatchObject({ outcome: 'INCOMPLETE' })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision(),
          observations: [observation({ status: 'FAILED' })]
        })
      )
    ).resolves.toMatchObject({ outcome: 'FAILED', reasonCode: 'TOOL_REQUIRED' })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({ responseText: '   ', responseIntent: '   ' })
        })
      )
    ).resolves.toMatchObject({ outcome: 'INCOMPLETE' })
  })

  it('maps stop decisions and accepts ordinary deterministic responses', async () => {
    const evaluator = new DeterministicCompletionEvaluator()

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            decisionType: 'STOP',
            reasonCode: 'USER_REQUESTED_STOP',
            responseText: undefined
          })
        })
      )
    ).resolves.toMatchObject({ outcome: 'COMPLETE' })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            decisionType: 'STOP',
            reasonCode: 'HANDOFF_REQUIRED',
            responseText: undefined
          })
        })
      )
    ).resolves.toMatchObject({
      outcome: 'FAILED',
      reasonCode: 'HANDOFF_REQUIRED'
    })

    await expect(
      evaluator.evaluate(
        input({
          lastDecision: decision({
            decisionType: 'STOP',
            reasonCode: 'GOAL_SATISFIED',
            responseText: undefined
          })
        })
      )
    ).resolves.toMatchObject({ outcome: 'COMPLETE' })

    await expect(evaluator.evaluate(input())).resolves.toMatchObject({
      outcome: 'COMPLETE',
      detail: 'Structured completion accepted by the deterministic strategy.'
    })
  })
})

describe('evidence-based and hybrid completion', () => {
  it('requires and classifies sufficiency observations', async () => {
    const evaluator = new DeterministicCompletionEvaluator({
      strategy: 'EVIDENCE_BASED'
    })

    await expect(evaluator.evaluate(input())).resolves.toMatchObject({
      outcome: 'INSUFFICIENT_EVIDENCE'
    })

    const levels = [
      ['SUFFICIENT', 'COMPLETE'],
      ['PARTIAL', 'INCOMPLETE'],
      ['INSUFFICIENT', 'INSUFFICIENT_EVIDENCE'],
      ['CONFLICTING', 'INSUFFICIENT_EVIDENCE']
    ] as const
    for (const [level, outcome] of levels) {
      await expect(
        evaluator.evaluate(
          input({
            observations: [
              observation(
                {
                  level,
                  reasonCode: 'synthetic',
                  missingCategories: [],
                  conflictingSources: [],
                  coveredCategories: []
                },
                { type: 'SUFFICIENCY', source: 'SYSTEM' }
              )
            ]
          })
        )
      ).resolves.toMatchObject({ outcome })
    }
  })

  it('delegates hybrid completion to a bounded semantic judge', async () => {
    const judge = vi.fn().mockResolvedValue('COMPLETE' as const)
    const evaluator = new DeterministicCompletionEvaluator({
      strategy: 'HYBRID',
      semanticJudge: createModelCompletionJudge(judge)
    })
    const evaluationInput = input()
    await expect(evaluator.evaluate(evaluationInput)).resolves.toMatchObject({
      outcome: 'COMPLETE',
      deterministic: false
    })
    expect(judge).toHaveBeenCalledWith({
      goal: evaluationInput.goal,
      stateSummary: 'step=1 observations=0',
      observationSummaries: []
    })

    judge.mockResolvedValueOnce('INSUFFICIENT_EVIDENCE')
    await expect(evaluator.evaluate(evaluationInput)).resolves.toMatchObject({
      outcome: 'INSUFFICIENT_EVIDENCE'
    })
    judge.mockResolvedValueOnce('INCOMPLETE')
    await expect(evaluator.evaluate(evaluationInput)).resolves.toMatchObject({
      outcome: 'INCOMPLETE'
    })

    judge.mockRejectedValueOnce(new Error('semantic outage'))
    await expect(evaluator.evaluate(evaluationInput)).resolves.toMatchObject({
      outcome: 'COMPLETE',
      reasonCode: 'EVALUATOR_UNAVAILABLE'
    })
  })

  it('exposes factories and summarizes only structured input for model judges', async () => {
    expect(createCompletionEvaluator()).toBeInstanceOf(
      DeterministicCompletionEvaluator
    )
    const judge = vi.fn().mockResolvedValue('COMPLETE' as const)
    const semanticJudge = createModelCompletionJudge(judge)
    const evaluationInput = input({
      state: state({ stepNumber: 4 }),
      observations: [observation({ status: 'SUCCEEDED' })]
    })

    await expect(semanticJudge.judge(evaluationInput)).resolves.toMatchObject({
      outcome: 'COMPLETE',
      deterministic: false
    })
    expect(judge).toHaveBeenCalledWith({
      goal: evaluationInput.goal,
      stateSummary: 'step=4 observations=1',
      observationSummaries: ['synthetic observation']
    })
  })
})
