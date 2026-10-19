import { describe, expect, it } from 'vitest'
import {
  CHECKPOINT_VERSION,
  EMPTY_BUDGET_USAGE,
  type AgentLoopState,
  type CompletionEvaluationInput,
  type ExecutionCheckpoint,
  type ExecutionStep,
  type ExecutionStepStore,
  type LoopDecision,
  type Observation
} from '@cvg/harness-contracts'
import {
  DeterministicCompletionEvaluator,
  createCompletionEvaluator
} from '../completion.ts'
import {
  CheckpointError,
  InMemoryExecutionStepStore,
  createInMemoryExecutionStepStore,
  sealCheckpoint,
  validateCheckpointIntegrity,
  type UnsignedCheckpoint
} from '../step-store.ts'
import { readExecutionTrajectory } from '../trajectory.ts'

const NOW = '2026-10-12T00:00:00.000Z'
const TENANT = 'tenant_pdsh031'
const EXECUTION = 'exec_pdsh031'

function loopState(overrides: Partial<AgentLoopState> = {}): AgentLoopState {
  return {
    goal: 'Synthetic goal.',
    stepNumber: 1,
    observations: [],
    openQuestions: [],
    resolvedInputs: {},
    loopSignatures: [],
    ...overrides
  }
}

function unsigned(
  overrides: Partial<UnsignedCheckpoint> = {}
): UnsignedCheckpoint {
  return {
    executionId: EXECUTION,
    tenantId: TENANT,
    checkpointVersion: CHECKPOINT_VERSION,
    runtimeProfile: 'iterative',
    runtimeVersion: 'rv1',
    orchestratorVersion: 'ov1',
    stepNumber: 0,
    state: loopState(),
    budgetUsage: EMPTY_BUDGET_USAGE,
    ...overrides
  }
}

function executionStep(overrides: Partial<ExecutionStep> = {}): ExecutionStep {
  return {
    stepId: 'step-1',
    executionId: EXECUTION,
    tenantId: TENANT,
    stepNumber: 1,
    stepType: 'MODEL',
    status: 'RUNNING',
    attempt: 1,
    sideEffecting: false,
    startedAt: NOW,
    observationRefs: [],
    ...overrides
  }
}

function checkpointCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof CheckpointError
      ? error.code
      : `unexpected:${String(error)}`
  }
}

function observation(
  payload: unknown,
  overrides: Partial<Observation> = {}
): Observation {
  return {
    observationId: 'observation-1',
    executionId: EXECUTION,
    stepId: 'step-1',
    stepNumber: 1,
    type: 'TOOL_RESULT',
    source: 'TOOL',
    trust: 'UNTRUSTED',
    payload,
    summary: 'synthetic observation',
    provenance: { sourceId: 'synthetic.tool' },
    timestamp: NOW,
    ...overrides
  }
}

function decision(overrides: Partial<LoopDecision> = {}): LoopDecision {
  return {
    decisionType: 'RESPOND',
    reasonCode: 'GOAL_SATISFIED',
    responseText: 'A synthetic answer.',
    ...overrides
  }
}

function evaluationInput(
  overrides: Partial<CompletionEvaluationInput> = {}
): CompletionEvaluationInput {
  return {
    goal: 'Answer the synthetic question.',
    state: loopState(),
    observations: [],
    lastDecision: decision(),
    ...overrides
  }
}

describe('PDSH-031 slice 2a — trajectory export', () => {
  it('returns null when the execution has no checkpoint and no steps', async () => {
    const store = createInMemoryExecutionStepStore()
    expect(await readExecutionTrajectory(store, TENANT, EXECUTION)).toBeNull()
  })

  it('falls back to defaults and maps optional step fields', async () => {
    const store = createInMemoryExecutionStepStore()
    await store.recordStep(
      executionStep({
        status: 'SUCCEEDED',
        decisionType: 'RESPOND',
        reasonCode: 'GOAL_SATISFIED'
      })
    )
    await store.recordStep(
      executionStep({ stepId: 'step-2', stepNumber: 2, status: 'SUCCEEDED' })
    )

    const trajectory = await readExecutionTrajectory(store, TENANT, EXECUTION)

    expect(trajectory).toMatchObject({
      executionId: EXECUTION,
      runtimeProfile: 'iterative',
      runtimeVersion: 'unknown',
      orchestratorVersion: 'unknown',
      stopReason: 'INSUFFICIENT_EVIDENCE',
      budgetUsage: EMPTY_BUDGET_USAGE
    })
    expect(trajectory?.steps[0]).toEqual({
      stepNumber: 1,
      stepType: 'MODEL',
      status: 'SUCCEEDED',
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED'
    })
    expect(trajectory?.steps[1]).toEqual({
      stepNumber: 2,
      stepType: 'MODEL',
      status: 'SUCCEEDED'
    })
  })

  it('uses checkpoint metadata when present', async () => {
    const checkpoint: ExecutionCheckpoint = sealCheckpoint(
      unsigned({
        runtimeProfile: 'single_pass',
        runtimeVersion: 'rv9',
        orchestratorVersion: 'ov9',
        state: loopState({ stopReason: 'COMPLETED' })
      })
    )
    const store = {
      loadCheckpoint: async () => checkpoint,
      listSteps: async () => [],
      recordStep: async () => {},
      saveCheckpoint: async () => {}
    } as unknown as ExecutionStepStore

    const trajectory = await readExecutionTrajectory(store, TENANT, EXECUTION)

    expect(trajectory).toMatchObject({
      runtimeProfile: 'single_pass',
      runtimeVersion: 'rv9',
      orchestratorVersion: 'ov9',
      stopReason: 'COMPLETED',
      steps: []
    })
  })
})

describe('PDSH-031 slice 2a — step store integrity', () => {
  it('rejects an unsupported checkpoint version and a foreign binding', () => {
    const sealed = sealCheckpoint(unsigned())
    expect(
      checkpointCode(() =>
        validateCheckpointIntegrity(
          { ...sealed, checkpointVersion: 999 },
          { tenantId: TENANT, executionId: EXECUTION }
        )
      )
    ).toBe('checkpoint_version')
    expect(
      checkpointCode(() =>
        validateCheckpointIntegrity(sealed, {
          tenantId: 'tenant_other',
          executionId: EXECUTION
        })
      )
    ).toBe('checkpoint_binding')
  })

  it('rejects conflicting, malformed and out-of-order step records', async () => {
    const store = createInMemoryExecutionStepStore()
    await store.recordStep(executionStep({ stepId: 'step-a' }))
    await expect(
      store.recordStep(executionStep({ stepId: 'step-b' }))
    ).rejects.toMatchObject({ code: 'step_conflict' })

    const fresh = createInMemoryExecutionStepStore()
    for (const stepNumber of [0, 1.5]) {
      await expect(
        fresh.recordStep(executionStep({ stepNumber }))
      ).rejects.toMatchObject({ code: 'step_conflict' })
    }
    await fresh.recordStep(executionStep({ status: 'SUCCEEDED' }))
    await expect(
      fresh.recordStep(executionStep({ status: 'RUNNING' }))
    ).rejects.toMatchObject({ code: 'step_transition' })
  })

  it('lists an empty execution and exposes the factory instance', async () => {
    const store = createInMemoryExecutionStepStore()
    expect(store).toBeInstanceOf(InMemoryExecutionStepStore)
    expect(await store.listSteps(TENANT, EXECUTION)).toEqual([])
  })
})

describe('PDSH-031 slice 2a — completion evidence edges', () => {
  it('treats a non-object tool payload as neither success nor failure', async () => {
    const evaluator = new DeterministicCompletionEvaluator()
    const result = await evaluator.evaluate(
      evaluationInput({
        observations: [observation('plain text')],
        state: loopState({ observations: [observation('plain text')] })
      })
    )
    expect(result).toMatchObject({ outcome: 'COMPLETE' })
  })

  it('ignores a sufficiency observation without a level', async () => {
    const evaluator = new DeterministicCompletionEvaluator({
      strategy: 'EVIDENCE_BASED'
    })
    const result = await evaluator.evaluate(
      evaluationInput({
        observations: [observation(null, { type: 'SUFFICIENCY' })]
      })
    )
    expect(result).toMatchObject({
      outcome: 'INSUFFICIENT_EVIDENCE',
      reasonCode: 'EVIDENCE_INCOMPLETE'
    })
  })

  it.each([
    ['null payload', null, undefined, 'FAILED'],
    [
      'failed status',
      { status: 'FAILED', sideEffect: 'WRITE' },
      undefined,
      'FAILED'
    ],
    ['no side effect', { status: 'SUCCEEDED' }, undefined, 'FAILED'],
    [
      'write effect',
      { status: 'SUCCEEDED', sideEffect: 'WRITE' },
      undefined,
      'COMPLETE'
    ],
    [
      'external effect',
      { status: 'SUCCEEDED', sideEffect: 'EXTERNAL' },
      undefined,
      'COMPLETE'
    ],
    [
      'named tool match',
      { status: 'SUCCEEDED', sideEffect: 'WRITE' },
      'synthetic.tool',
      'COMPLETE'
    ],
    [
      'named tool mismatch',
      { status: 'SUCCEEDED', sideEffect: 'WRITE' },
      'other.tool',
      'FAILED'
    ]
  ])(
    'grounds ACTION_CONFIRMED with %s',
    async (_label, payload, toolId, expected) => {
      const evaluator = new DeterministicCompletionEvaluator()
      const result = await evaluator.evaluate(
        evaluationInput({
          lastDecision: decision({
            reasonCode: 'ACTION_CONFIRMED',
            ...(toolId !== undefined ? { toolId } : {})
          }),
          observations: [observation(payload)]
        })
      )
      expect(result.outcome).toBe(expected)
    }
  )

  it('degrades to EVALUATOR_UNAVAILABLE when the semantic judge fails', async () => {
    const evaluator = createCompletionEvaluator({
      strategy: 'HYBRID',
      semanticJudge: {
        judge: async () => {
          throw new Error('synthetic judge outage')
        }
      }
    })
    const result = await evaluator.evaluate(evaluationInput())
    expect(result).toMatchObject({
      outcome: 'COMPLETE',
      reasonCode: 'EVALUATOR_UNAVAILABLE'
    })
    expect(result.detail).toContain('semantic_judge_unavailable')
  })
})
