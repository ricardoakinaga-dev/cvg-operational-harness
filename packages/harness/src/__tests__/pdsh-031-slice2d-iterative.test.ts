import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HYBRID_ORCHESTRATOR_VERSION,
  RUNTIME_V2_VERSION,
  type ApprovalEngine,
  type AuditSink,
  type Claim,
  type ExecutionCheckpoint,
  type LoopDecision,
  type ModelGateway,
  type RuntimeInput
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import {
  IterativeGovernedRuntime,
  bindCapabilityFingerprint,
  boundedPayload,
  mapEvaluationToStopReason,
  stringifySummary
} from '../iterative-runtime.ts'
import { DefaultContextEngine } from '../context-engine.ts'
import { InMemoryExecutionStepStore, sealCheckpoint } from '../step-store.ts'
import {
  CategorySufficiencyEvaluator,
  InMemoryApprovalEngine,
  PHASE3_KNOWLEDGE_ITEMS,
  PHASE3_TOOL_AVAILABILITY,
  PHASE3_TOOL_RESERVE,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  SyntheticKnowledgeProvider,
  createPhase3ToolRegistry,
  decision,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

interface HarnessOptions {
  readonly decisions?: readonly LoopDecision[]
  readonly tools?: ReturnType<typeof createPhase3ToolRegistry>
  readonly knowledge?: SyntheticKnowledgeProvider
  readonly policy?: ScriptedPolicyEngine
  readonly approvals?: ApprovalEngine
  readonly store?: InMemoryExecutionStepStore
  readonly modelResponses?: readonly (
    | string
    | {
        readonly text: string
        readonly inputTokens?: number
        readonly outputTokens?: number
        readonly costUsd?: number
      }
  )[]
  readonly claimExtractor?: (response: string) => readonly Claim[]
  readonly completionEvaluator?: unknown
  readonly audit?: AuditSink
  readonly effects?: { started: unknown; finished: unknown }
  readonly pause?: { isPaused: (tenantId: string) => Promise<boolean> }
  readonly orchestratorOverride?: { decide: unknown }
  readonly sufficiency?: CategorySufficiencyEvaluator
}

function buildRuntime(options: HarnessOptions = {}) {
  const store = options.store ?? new InMemoryExecutionStepStore()
  const policy = options.policy ?? new ScriptedPolicyEngine()
  const approvals = options.approvals ?? new InMemoryApprovalEngine()
  const tools =
    options.tools ??
    createPhase3ToolRegistry({
      availability: 'AVAILABLE'
    })
  const model = new ScriptedModelGateway({
    responses: options.modelResponses ?? ['synthetic response']
  })
  const orchestrator = options.orchestratorOverride
    ? (options.orchestratorOverride as never)
    : new ScriptedOrchestrator({ script: options.decisions ?? [] })
  const runtime = new IterativeGovernedRuntime({
    orchestrator,
    modelGateway: model as ModelGateway,
    policy,
    approvals,
    tools,
    audit: options.audit ?? new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: store,
    contextEngine: new DefaultContextEngine(),
    ...(options.knowledge ? { knowledge: options.knowledge } : {}),
    ...(options.sufficiency
      ? { sufficiencyEvaluator: options.sufficiency }
      : {}),
    ...(options.claimExtractor
      ? { claimExtractor: options.claimExtractor }
      : {}),
    ...(options.effects ? { effects: options.effects } : {}),
    ...(options.pause ? { pause: options.pause } : {}),
    ...(options.completionEvaluator
      ? { completionEvaluator: options.completionEvaluator }
      : {})
  } as never)
  return { runtime, store }
}

function operationalInput(overrides: Partial<RuntimeInput> = {}): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile(),
    ...overrides
  })
}

function checkpointFor(
  input: RuntimeInput,
  state: Record<string, unknown> = {},
  budgetUsage: Record<string, unknown> = {}
): ExecutionCheckpoint {
  return sealCheckpoint({
    executionId: input.executionId ?? 'exec_phase3_fixture',
    tenantId: input.tenantId,
    checkpointVersion: 1,
    runtimeProfile: 'iterative',
    runtimeVersion: RUNTIME_V2_VERSION,
    orchestratorVersion: HYBRID_ORCHESTRATOR_VERSION,
    stepNumber: 1,
    state: {
      goal: input.agent.objective,
      stepNumber: 1,
      observations: [],
      openQuestions: [],
      resolvedInputs: {},
      loopSignatures: [],
      ...state
    },
    budgetUsage: {
      steps: 1,
      modelCalls: 0,
      toolCalls: 0,
      knowledgeCalls: 0,
      verificationCalls: 0,
      replans: 0,
      decisionRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      activeDurationMs: 0,
      ...budgetUsage
    }
  })
}

async function recordToolStep(
  store: InMemoryExecutionStepStore,
  input: RuntimeInput,
  stepNumber: number,
  status: 'WAITING' | 'RUNNING',
  reasonCode?: string
): Promise<void> {
  await store.recordStep({
    stepId: `step_${input.executionId}_${stepNumber}_tool`,
    executionId: input.executionId as string,
    tenantId: input.tenantId,
    stepNumber,
    stepType: 'TOOL',
    status,
    attempt: 1,
    sideEffecting: true,
    startedAt: '2026-10-12T00:00:00.000Z',
    ...(reasonCode ? { reasonCode } : {})
  } as never)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PDSH-031 slice 2d-3c — iterative runtime helper edges', () => {
  it('binds capability fingerprints and maps evaluations to stop reasons', () => {
    expect(bindCapabilityFingerprint({ a: 1 }, 'fp')).toEqual({
      capabilityFingerprint: 'fp',
      input: { a: 1 }
    })
    expect(bindCapabilityFingerprint({ a: 1 }, undefined)).toEqual({ a: 1 })

    expect(
      mapEvaluationToStopReason({
        outcome: 'FAILED',
        reasonCode: 'HANDOFF_REQUIRED',
        deterministic: true
      } as never)
    ).toBe('HUMAN_TAKEOVER')
    expect(
      mapEvaluationToStopReason({
        outcome: 'INSUFFICIENT_EVIDENCE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: true
      } as never)
    ).toBe('INSUFFICIENT_EVIDENCE')
    expect(
      mapEvaluationToStopReason({
        outcome: 'NEEDS_USER',
        reasonCode: 'MISSING_INFORMATION',
        deterministic: true
      } as never)
    ).toBe('NEEDS_USER_INPUT')
    expect(
      mapEvaluationToStopReason({
        outcome: 'WAITING_APPROVAL',
        reasonCode: 'POLICY_REQUIRED',
        deterministic: true
      } as never)
    ).toBe('APPROVAL_REQUIRED')
    expect(
      mapEvaluationToStopReason({
        outcome: 'FAILED',
        reasonCode: 'LOOP_SUSPECTED',
        deterministic: true
      } as never)
    ).toBe('VERIFICATION_FAILED')
    expect(
      mapEvaluationToStopReason({
        outcome: 'INCOMPLETE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: true
      } as never)
    ).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('bounds payloads and stringifies summaries without failing', () => {
    expect(boundedPayload(undefined, 10)).toBeUndefined()
    expect(boundedPayload('short', 10)).toBe('short')
    expect(boundedPayload('x'.repeat(20), 5)).toBe('"xxxx…[truncated]')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(boundedPayload(circular, 10)).toBe('[unserializable payload]')

    expect(stringifySummary(undefined, 'fallback')).toBe('fallback')
    expect(stringifySummary(null, 'fallback')).toBe('fallback')
    expect(stringifySummary('text', 'fallback')).toBe('text')
    expect(stringifySummary({ a: 1 }, 'fallback')).toBe('{"a":1}')
    expect(stringifySummary(() => 1, 'fallback')).toBe('fallback')
    expect(stringifySummary(circular, 'fallback')).toBe('fallback')
  })
})

describe('PDSH-031 slice 2d-3c — iterative runtime loop edges', () => {
  it('derives the execution id and honors a pre-aborted signal', async () => {
    const { runtime } = buildRuntime({
      decisions: [decision({ decisionType: 'RESPOND', responseText: 'done' })]
    })
    const derived = await runtime.execute(
      operationalInput({ executionId: undefined as never })
    )
    expect(derived.stopReason).toBe('COMPLETED')

    const controller = new AbortController()
    controller.abort()
    const aborted = await runtime.execute(
      operationalInput({ signal: controller.signal })
    )
    expect(aborted.stopReason).toBe('CANCELLED')
  })

  it('keeps a pending question for an already-answered user input', async () => {
    const store = new InMemoryExecutionStepStore()
    const input = operationalInput({
      resume: { kind: 'user_input', message: 'answer' }
    })
    await store.saveCheckpoint(
      checkpointFor(input, {
        pendingQuestion: {
          questionType: 'CLARIFICATION',
          missingFields: [],
          promptIntent: 'Which resource?'
        },
        resolvedInputs: { answer_1: 'answer' }
      })
    )
    const { runtime } = buildRuntime({
      store,
      decisions: [decision({ decisionType: 'RESPOND', responseText: 'done' })]
    })
    const result = await runtime.execute(input)
    expect(result.stopReason).toBe('COMPLETED')
  })

  it('preserves the checkpoint when an operator pause blocks the step', async () => {
    const { runtime } = buildRuntime({
      decisions: [decision({ decisionType: 'RESPOND', responseText: 'done' })],
      pause: { isPaused: async () => true }
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('HUMAN_TAKEOVER')
  })

  it('stops with MAX_STEPS when a replayed decision overruns the bound', async () => {
    const store = new InMemoryExecutionStepStore()
    const input = operationalInput({
      budget: {
        maxSteps: 1,
        maxModelCalls: 5,
        maxToolCalls: 5,
        maxDurationMs: 10_000,
        maxCostUsd: 1,
        maxTokens: 1_000
      }
    })
    await store.saveCheckpoint(
      checkpointFor(input, {
        pendingDecision: decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY
        })
      })
    )
    const { runtime } = buildRuntime({ store })
    const result = await runtime.execute(input)
    expect(result.stopReason).toBe('MAX_STEPS')
  })

  it('repairs one invalid decision and reports repeated ones', async () => {
    const invalid = {
      decisionType: 'CALL_TOOL',
      reasonCode: 'TOOL_REQUIRED',
      toolId: 'missing.tool'
    } as never
    const { runtime } = buildRuntime({
      decisions: [
        invalid,
        decision({ decisionType: 'RESPOND', responseText: 'done' })
      ]
    })
    expect((await runtime.execute(operationalInput())).stopReason).toBe(
      'COMPLETED'
    )

    const { runtime: exhausted } = buildRuntime({
      decisions: [invalid, invalid]
    })
    const rejected = await exhausted.execute(operationalInput())
    expect(['MODEL_FAILURE', 'STATE_CONFLICT']).toContain(rejected.stopReason)
  })

  it('stops on exact and overrun duration bounds', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z'))
    const budget = {
      maxSteps: 5,
      maxModelCalls: 5,
      maxToolCalls: 5,
      maxDurationMs: 100,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
    const exact = buildRuntime({
      orchestratorOverride: {
        decide: async () => {
          vi.setSystemTime(new Date('2026-10-12T00:00:00.100Z'))
          return decision({
            decisionType: 'REPLAN',
            reasonCode: 'STRATEGY_CHANGED'
          })
        }
      }
    })
    const exactResult = await exact.runtime.execute(
      operationalInput({ budget })
    )
    // First decide burns exactly the budget; the second loop check sees zero.
    expect(exactResult.stopReason).toBe('MAX_DURATION')

    vi.setSystemTime(new Date('2026-10-12T00:00:00.000Z'))
    const overrun = buildRuntime({
      orchestratorOverride: {
        decide: async () => {
          vi.setSystemTime(new Date('2026-10-12T00:00:00.150Z'))
          return decision({
            decisionType: 'REPLAN',
            reasonCode: 'STRATEGY_CHANGED'
          })
        }
      }
    })
    const overrunResult = await overrun.runtime.execute(
      operationalInput({ budget })
    )
    expect(overrunResult.stopReason).toBe('MAX_DURATION')
  })

  it('stops when the decision deadline wins', async () => {
    const { runtime } = buildRuntime({
      orchestratorOverride: {
        decide: () => new Promise(() => {})
      }
    })
    const result = await runtime.execute(
      operationalInput({
        budget: {
          maxSteps: 5,
          maxModelCalls: 5,
          maxToolCalls: 5,
          maxDurationMs: 30,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    )
    expect(result.stopReason).toBe('MAX_DURATION')
    expect(result.response).toContain('while deciding')
  })

  it('computes allowed decision types from optional budgets', async () => {
    const strippedBudget = {
      maxSteps: 5,
      maxModelCalls: 5,
      maxToolCalls: 5,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'resource'
        }),
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          verificationTarget: 'evidence-coverage'
        }),
        decision({
          decisionType: 'REPLAN',
          reasonCode: 'STRATEGY_CHANGED'
        }),
        decision({ decisionType: 'RESPOND', responseText: 'done' })
      ],
      knowledge: new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS),
      sufficiency: new CategorySufficiencyEvaluator(),
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'COMPLETE',
          reasonCode: 'GOAL_SATISFIED',
          deterministic: true
        })
      }
    })
    const result = await runtime.execute(
      operationalInput({ budget: strippedBudget })
    )
    expect(result.stopReason).toBe('COMPLETED')

    const { runtime: noReplans } = buildRuntime({
      decisions: [
        decision({ decisionType: 'REPLAN', reasonCode: 'STRATEGY_CHANGED' }),
        decision({ decisionType: 'REPLAN', reasonCode: 'STRATEGY_CHANGED' })
      ]
    })
    const blocked = await noReplans.execute(
      operationalInput({
        budget: { ...strippedBudget, maxSteps: 5, maxReplans: 0 }
      })
    )
    expect(blocked.stopReason).toBe('STATE_CONFLICT')
  })

  it('uses the default threshold for an idempotent repeated tool', async () => {
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        }),
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        }),
        decision({ decisionType: 'RESPOND', responseText: 'done' })
      ]
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
  })

  it('dispatches handoff and stop decisions', async () => {
    const { runtime: handoff } = buildRuntime({
      decisions: [
        decision({ decisionType: 'HANDOFF', reasonCode: 'HANDOFF_REQUIRED' })
      ]
    })
    expect((await handoff.execute(operationalInput())).stopReason).toBe(
      'HUMAN_TAKEOVER'
    )

    const completedEvaluator = {
      evaluate: async () => ({
        outcome: 'COMPLETE',
        reasonCode: 'USER_REQUESTED_STOP',
        deterministic: true
      })
    }
    const { runtime: stopped } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'STOP',
          reasonCode: 'USER_REQUESTED_STOP'
        })
      ],
      completionEvaluator: completedEvaluator as never
    })
    expect((await stopped.execute(operationalInput())).stopReason).toBe(
      'COMPLETED'
    )
  })

  it('validates claims against tool and knowledge observations', async () => {
    const itemId = 'evidence-infectious-1'
    const operationKey = `exec_phase3_fixture:s2:${PHASE3_TOOL_AVAILABILITY}`
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'infectious evidence'
        }),
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        }),
        decision({
          decisionType: 'RESPOND',
          responseText: 'grounded answer'
        })
      ],
      knowledge: new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS),
      claimExtractor: () =>
        [
          { text: 'grounded claim', evidenceRefs: [itemId, operationKey] }
        ] as never,
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'COMPLETE',
          reasonCode: 'GOAL_SATISFIED',
          deterministic: true
        })
      }
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toBe('grounded answer')
  })

  it('verifies response claims without a response and evidence coverage', async () => {
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          verificationTarget: 'response-claims'
        }),
        decision({ decisionType: 'RESPOND', responseText: 'draft' }),
        decision({ decisionType: 'RESPOND', responseText: 'final' })
      ]
    })
    expect((await runtime.execute(operationalInput())).stopReason).toBe(
      'COMPLETED'
    )

    const { runtime: coverage } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          verificationTarget: 'evidence-coverage'
        }),
        decision({ decisionType: 'RESPOND', responseText: 'draft' }),
        decision({ decisionType: 'RESPOND', responseText: 'final' })
      ]
    })
    const result = await coverage.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
  })

  it('closes a pending tool step for every terminal outcome', async () => {
    const runWith = async (
      status: 'WAITING' | 'RUNNING',
      options: {
        readonly signalAborted?: boolean
        readonly activeDurationMs?: number
        readonly budget?: RuntimeInput['budget']
      } = {}
    ) => {
      const store = new InMemoryExecutionStepStore()
      const controller = new AbortController()
      if (options.signalAborted) controller.abort()
      const input = operationalInput({
        ...(options.signalAborted ? { signal: controller.signal } : {}),
        ...(options.budget ? { budget: options.budget } : {})
      })
      await store.saveCheckpoint(
        checkpointFor(
          input,
          { pendingStepNumber: 1 },
          { activeDurationMs: options.activeDurationMs ?? 0 }
        )
      )
      await recordToolStep(
        store,
        input,
        1,
        status,
        status === 'RUNNING' ? 'TOOL_REQUIRED' : undefined
      )
      const invalid = {
        decisionType: 'CALL_TOOL',
        reasonCode: 'TOOL_REQUIRED',
        toolId: 'missing.tool'
      } as never
      const { runtime } = buildRuntime({
        store,
        decisions: [invalid, invalid]
      })
      return { result: await runtime.execute(input), store, input }
    }

    const running = await runWith('RUNNING')
    expect(running.result.stopReason).toBe('STATE_CONFLICT')
    const runningSteps = await running.store.listSteps(
      running.input.tenantId,
      running.input.executionId as string
    )
    expect(runningSteps.at(-1)).toMatchObject({
      status: 'FAILED',
      errorCode: 'unknown_effect'
    })
    const waiting = await runWith('WAITING')
    expect(waiting.result.stopReason).toBe('STATE_CONFLICT')
    const waitingSteps = await waiting.store.listSteps(
      waiting.input.tenantId,
      waiting.input.executionId as string
    )
    expect(waitingSteps.at(-1)).toMatchObject({
      status: 'FAILED',
      errorCode: 'not_started'
    })
    expect(
      (await runWith('WAITING', { signalAborted: true })).result.stopReason
    ).toBe('CANCELLED')
    expect(
      (
        await runWith('WAITING', {
          activeDurationMs: 1_000,
          budget: {
            maxSteps: 5,
            maxModelCalls: 5,
            maxToolCalls: 5,
            maxDurationMs: 100,
            maxCostUsd: 1,
            maxTokens: 1_000
          }
        })
      ).result.stopReason
    ).toBe('MAX_DURATION')

    const throwingStore = new InMemoryExecutionStepStore()
    const throwingInput = operationalInput()
    await throwingStore.saveCheckpoint(
      checkpointFor(throwingInput, { pendingStepNumber: 1 })
    )
    throwingStore.listSteps = async () => {
      throw new Error('step store unavailable')
    }
    const invalidDecision = {
      decisionType: 'CALL_TOOL',
      reasonCode: 'TOOL_REQUIRED',
      toolId: 'missing.tool'
    } as never
    const { runtime: degraded } = buildRuntime({
      store: throwingStore,
      decisions: [invalidDecision, invalidDecision]
    })
    const degradedResult = await degraded.execute(throwingInput)
    expect(degradedResult.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('degrades the result when the closing audit cannot be recorded', async () => {
    const hangingAudit = {
      append: (event: { action?: string }) =>
        event.action === 'runtime.completed'
          ? new Promise(() => {})
          : Promise.resolve()
    }
    const { runtime } = buildRuntime({
      decisions: [decision({ decisionType: 'RESPOND', responseText: 'done' })],
      audit: hangingAudit as never
    })
    const result = await runtime.execute(
      operationalInput({
        budget: {
          maxSteps: 5,
          maxModelCalls: 5,
          maxToolCalls: 5,
          maxDurationMs: 300,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    )
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('audit recording failed')
  }, 10_000)

  it('reports a failed tool observation as a rejected tool result', async () => {
    const tools = createPhase3ToolRegistry({
      availability: 'AVAILABLE',
      reserveFails: true
    })
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_RESERVE,
          toolInput: { resource: 'resource-x', date: '2026-10-01' }
        })
      ],
      tools
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('TOOL_FAILURE')
  })

  it('normalizes raw orchestrator failures', async () => {
    const { runtime } = buildRuntime({
      orchestratorOverride: {
        decide: async () => {
          throw 'raw failure'
        }
      }
    })
    const raw = await runtime.execute(operationalInput())
    expect(raw.stopReason).toBe('INTERNAL_FAILURE')
    expect(raw.response).toContain('unknown failure')
  })

  it('tolerates knowledge items without identities', async () => {
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'infectious evidence'
        }),
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        }),
        decision({ decisionType: 'RESPOND', responseText: 'grounded' })
      ],
      knowledge: {
        search: async () => ({
          query: 'infectious evidence',
          items: [{ text: 'anonymous item' }],
          provenance: []
        })
      } as never,
      claimExtractor: () =>
        [
          {
            text: 'tool claim',
            evidenceRefs: [`exec_phase3_fixture:s2:${PHASE3_TOOL_AVAILABILITY}`]
          }
        ] as never,
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'COMPLETE',
          reasonCode: 'GOAL_SATISFIED',
          deterministic: true
        })
      }
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
  })

  it('runs the after-usage gate for evaluator-reported usage', async () => {
    const { runtime } = buildRuntime({
      decisions: [decision({ decisionType: 'RESPOND', responseText: 'done' })],
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'COMPLETE',
          reasonCode: 'GOAL_SATISFIED',
          deterministic: true,
          usage: {
            modelCalls: 0,
            inputTokens: 1,
            outputTokens: 1,
            costUsd: 0
          }
        })
      }
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.usage.inputTokens).toBeGreaterThan(0)
  })

  it('clamps the turn deadline when the duration is already gone', async () => {
    const effects = {
      started: async () => {
        await new Promise((resolve) => setTimeout(resolve, 250))
      },
      finished: async () => {}
    }
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_AVAILABILITY,
          toolInput: { resource: 'resource-x' }
        })
      ],
      effects: effects as never
    })
    const result = await runtime.execute(
      operationalInput({
        budget: {
          maxSteps: 5,
          maxModelCalls: 5,
          maxToolCalls: 5,
          maxDurationMs: 200,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    )
    expect(result.stopReason).toBe('MAX_DURATION')
  })

  it('stops composition when the model-call budget is empty', async () => {
    const { runtime } = buildRuntime({
      decisions: [
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseIntent: 'compose the final answer'
        })
      ]
    })
    const result = await runtime.execute(
      operationalInput({
        budget: {
          maxSteps: 5,
          maxModelCalls: 0,
          maxToolCalls: 5,
          maxDurationMs: 10_000,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    )
    expect(result.stopReason).toBe('MAX_MODEL_CALLS')
  })
})
