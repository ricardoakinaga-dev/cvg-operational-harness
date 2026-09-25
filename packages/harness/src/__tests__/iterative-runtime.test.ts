import { describe, expect, it } from 'vitest'
import {
  HYBRID_ORCHESTRATOR_VERSION,
  RUNTIME_V2_VERSION,
  type AgenticKnowledgeProvider,
  type ApprovalEngine,
  type ApprovalExecutionPort,
  type AuditSink,
  type Claim,
  type CompletionEvaluator,
  type ExecutionCheckpoint,
  type IterativeOrchestratorTurn,
  type LoopDecision,
  type ModelGateway,
  type RuntimeInput
} from '@cvg/harness-contracts'
import {
  ScriptedOrchestrator,
  ScriptedModelGateway,
  StaticOrchestrator
} from '@cvg/harness-orchestrator'
import {
  IterativeGovernedRuntime,
  detectDecisionCycle
} from '../iterative-runtime.ts'
import { DefaultContextEngine } from '../context-engine.ts'
import {
  InMemoryExecutionStepStore,
  sealCheckpoint,
  validateCheckpointIntegrity
} from '../step-store.ts'
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
  ThrowingModelGateway,
  createPhase3ToolRegistry,
  decision,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

interface RuntimeHarness {
  readonly runtime: IterativeGovernedRuntime
  readonly store: InMemoryExecutionStepStore
  readonly audit: RecordingAuditSink
  readonly telemetry: RecordingTelemetrySink
  readonly policy: ScriptedPolicyEngine
  readonly approvals: InMemoryApprovalEngine
  readonly toolCalls: Array<{ toolId: string; operationKey: string }>
  readonly model: ModelGateway
  readonly orchestrator: ScriptedOrchestrator | StaticOrchestrator
}

function buildHarness(options: {
  readonly decisions?: readonly (LoopDecision | IterativeOrchestratorTurn)[]
  readonly staticDecision?: LoopDecision
  readonly tools?: ReturnType<typeof createPhase3ToolRegistry>
  readonly knowledge?: SyntheticKnowledgeProvider
  readonly knowledgeProvider?: AgenticKnowledgeProvider
  readonly sufficiency?: CategorySufficiencyEvaluator
  readonly policy?: ScriptedPolicyEngine
  readonly approvals?: InMemoryApprovalEngine
  readonly approvalEngine?: ApprovalEngine
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
  readonly model?: ThrowingModelGateway
  readonly claimExtractor?: (response: string) => readonly Claim[]
  readonly completionStrategy?: 'DETERMINISTIC' | 'EVIDENCE_BASED' | 'HYBRID'
  readonly loopDetection?: { repeatThreshold: number }
  readonly maxObservationPayloadChars?: number
  readonly capabilityFingerprint?: string
  readonly completionEvaluator?: CompletionEvaluator
  readonly audit?: AuditSink
}): RuntimeHarness {
  const store = options.store ?? new InMemoryExecutionStepStore()
  const audit = new RecordingAuditSink()
  const telemetry = new RecordingTelemetrySink()
  const policy = options.policy ?? new ScriptedPolicyEngine()
  const approvals = options.approvals ?? new InMemoryApprovalEngine()
  const toolCalls: Array<{ toolId: string; operationKey: string }> = []
  const tools =
    options.tools ??
    createPhase3ToolRegistry({
      availability: 'AVAILABLE',
      observe: (event) =>
        toolCalls.push({
          toolId: event.toolId,
          operationKey: event.operationKey
        })
    })
  const model =
    options.model ??
    new ScriptedModelGateway({
      responses: options.modelResponses ?? ['synthetic response']
    })
  const orchestrator = options.staticDecision
    ? new StaticOrchestrator({ decision: options.staticDecision })
    : new ScriptedOrchestrator({ script: options.decisions ?? [] })
  const runtime = new IterativeGovernedRuntime({
    orchestrator,
    modelGateway: model,
    policy,
    approvals,
    tools,
    audit: options.audit ?? audit,
    telemetry,
    stepStore: store,
    ...(options.capabilityFingerprint
      ? { capabilityFingerprint: options.capabilityFingerprint }
      : {}),
    ...(options.approvalEngine ? { approvals: options.approvalEngine } : {}),
    contextEngine: new DefaultContextEngine(),
    ...(options.knowledge || options.knowledgeProvider
      ? { knowledge: options.knowledgeProvider ?? options.knowledge }
      : {}),
    ...(options.sufficiency
      ? { sufficiencyEvaluator: options.sufficiency }
      : {}),
    ...(options.claimExtractor
      ? { claimExtractor: options.claimExtractor }
      : {}),
    ...(options.loopDetection ? { loopDetection: options.loopDetection } : {}),
    ...(options.maxObservationPayloadChars
      ? { maxObservationPayloadChars: options.maxObservationPayloadChars }
      : {}),
    ...(options.completionEvaluator
      ? { completionEvaluator: options.completionEvaluator }
      : {})
  })
  return {
    runtime,
    store,
    audit,
    telemetry,
    policy,
    approvals,
    toolCalls,
    model,
    orchestrator
  }
}

function operationalInput(overrides: Partial<RuntimeInput> = {}): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile(),
    ...overrides
  })
}

function checkpointFor(
  input: RuntimeInput,
  options: {
    readonly runtimeProfile?: ExecutionCheckpoint['runtimeProfile']
    readonly runtimeVersion?: string
    readonly capabilityFingerprint?: string
    readonly stopReason?: ExecutionCheckpoint['state']['stopReason']
  } = {}
): ExecutionCheckpoint {
  return sealCheckpoint({
    executionId: input.executionId ?? 'exec_phase3_fixture',
    tenantId: input.tenantId,
    checkpointVersion: 1,
    runtimeProfile: options.runtimeProfile ?? 'iterative',
    runtimeVersion: options.runtimeVersion ?? RUNTIME_V2_VERSION,
    orchestratorVersion: HYBRID_ORCHESTRATOR_VERSION,
    stepNumber: 1,
    state: {
      goal: input.agent.objective,
      ...(options.capabilityFingerprint
        ? { capabilityFingerprint: options.capabilityFingerprint }
        : {}),
      stepNumber: 1,
      observations: [],
      openQuestions: [],
      resolvedInputs: {},
      loopSignatures: [],
      ...(options.stopReason ? { stopReason: options.stopReason } : {})
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
      activeDurationMs: 0
    }
  })
}

const availabilityDecision = decision({
  decisionType: 'CALL_TOOL',
  toolId: PHASE3_TOOL_AVAILABILITY,
  toolInput: { resource: 'resource-x' }
})

const reserveDecision = decision({
  decisionType: 'CALL_TOOL',
  toolId: PHASE3_TOOL_RESERVE,
  toolInput: { resource: 'resource-x', date: '2026-10-01' }
})

const verifyToolDecision = decision({
  decisionType: 'VERIFY',
  reasonCode: 'EVIDENCE_INCOMPLETE',
  verificationTarget: 'tool-result'
})

const respondDecision = decision({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText: 'Reservation reservation-0001 confirmed.'
})

describe('P3-LOOP — iterative governed runtime', () => {
  it('P3-LOOP-001 executes a multi-step tool chain and completes', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        reserveDecision,
        verifyToolDecision,
        respondDecision
      ]
    })
    const result = await harness.runtime.execute(operationalInput())

    expect(result.stopReason).toBe('COMPLETED')
    expect(result.steps).toBeGreaterThanOrEqual(3)
    expect(result.toolCalls).toBe(2)
    expect(result.response).toContain('reservation-0001')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY,
      PHASE3_TOOL_RESERVE
    ])
    const steps = await harness.store.listSteps(
      operationalInput().tenantId,
      'exec_phase3_fixture'
    )
    expect(steps.length).toBeGreaterThanOrEqual(4)
    expect(
      harness.audit.events.some((event) => event.action === 'runtime.completed')
    ).toBe(true)
    expect(harness.audit.events.map((event) => event.action)).toContain(
      'orchestrator.decided'
    )
    expect(harness.telemetry.events[0]?.attributes?.outcome).toBe('COMPLETED')
  })

  it('P3-LOOP-002 keeps a simple query in a single step', async () => {
    const harness = buildHarness({ decisions: [respondDecision] })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.steps).toBe(1)
    expect(result.toolCalls).toBe(0)
  })

  it('P3-LOOP-003 replans after an observation changes the strategy', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        decision({ decisionType: 'REPLAN', reasonCode: 'STRATEGY_CHANGED' }),
        reserveDecision,
        respondDecision
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(
      harness.audit.events.some((event) => event.action === 'runtime.replanned')
    ).toBe(true)
  })

  it('P3-GOV-001 rejects an invalid tool selection with zero effect', async () => {
    const observed: string[] = []
    const harness = buildHarness({
      staticDecision: decision({
        decisionType: 'CALL_TOOL',
        toolId: 'synthetic.absent.tool',
        toolInput: {}
      }),
      tools: createPhase3ToolRegistry({
        availability: 'AVAILABLE',
        observe: (event) => observed.push(event.toolId)
      })
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(result.toolCalls).toBe(0)
    expect(observed).toHaveLength(0)
  })

  it('P3-GOV-003 fails closed on an unsupported policy outcome', async () => {
    const malformedPolicy = {
      evaluate: async () => ({ outcome: 'PERMIT' as never })
    }
    const harness = buildHarness({
      decisions: [availabilityDecision, respondDecision],
      policy: malformedPolicy as never
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(harness.toolCalls).toHaveLength(0)
  })

  it('P3-GOV-002 denies a mid-loop tool without unauthorized effect', async () => {
    const harness = buildHarness({
      decisions: [availabilityDecision, reserveDecision, respondDecision],
      policy: new ScriptedPolicyEngine([PHASE3_TOOL_RESERVE])
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('POLICY_DENIED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY
    ])
  })

  it('P3-BUDGET-001 stops a hostile loop at maxSteps', async () => {
    const knowledge = new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS)
    const harness = buildHarness({
      staticDecision: decision({
        decisionType: 'SEARCH_KNOWLEDGE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        query: 'condition-X causes'
      }),
      knowledge,
      sufficiency: new CategorySufficiencyEvaluator(),
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      loopDetection: { repeatThreshold: 10 }
    })
    const result = await harness.runtime.execute(
      operationalInput({
        agent: phase3AgentProfile({
          tools: [],
          completionStrategy: 'EVIDENCE_BASED'
        }),
        budget: { ...operationalInput().budget, maxSteps: 3 }
      })
    )
    expect(result.stopReason).toBe('MAX_STEPS')
    expect(result.steps).toBe(3)
  })

  it('P3-BUDGET-002 stops on model-call and cost exhaustion', async () => {
    const harness = buildHarness({
      decisions: [
        {
          decision: respondDecision,
          usage: {
            modelCalls: 2,
            inputTokens: 100,
            outputTokens: 100,
            costUsd: 0.5
          }
        }
      ]
    })
    const result = await harness.runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxModelCalls: 1 }
      })
    )
    expect(result.stopReason).toBe('MAX_MODEL_CALLS')

    const costHarness = buildHarness({
      decisions: [
        {
          decision: respondDecision,
          usage: {
            modelCalls: 1,
            inputTokens: 100,
            outputTokens: 100,
            costUsd: 0.5
          }
        }
      ]
    })
    const costResult = await costHarness.runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxCostUsd: 0.1 }
      })
    )
    expect(costResult.stopReason).toBe('MAX_COST')
  })

  it('P3-BUDGET-003 stops when the duration budget expires', async () => {
    const slowTools = createPhase3ToolRegistry({
      availability: 'AVAILABLE',
      observe: () => undefined
    })
    const slowRegistry = {
      list: slowTools.list,
      resolve: (toolId: string, version?: string) => {
        const tool = slowTools.resolve(toolId, version)
        if (!tool) return undefined
        return {
          ...tool,
          execute: async (
            input: unknown,
            context: Parameters<typeof tool.execute>[1]
          ) => {
            await new Promise((resolve) => setTimeout(resolve, 15))
            return tool.execute(input, context)
          }
        }
      }
    }
    const harness = buildHarness({
      decisions: [availabilityDecision, respondDecision],
      tools: slowRegistry
    })
    const result = await harness.runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxDurationMs: 5 }
      })
    )
    expect(result.stopReason).toBe('MAX_DURATION')
  })

  it('P3-LOOP-DETECT-001 detects repeated identical decisions at the configured threshold', async () => {
    const harness = buildHarness({
      staticDecision: availabilityDecision,
      loopDetection: { repeatThreshold: 3 }
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('LOOP_DETECTED')
    expect(result.toolCalls).toBe(3)
    expect(harness.toolCalls).toHaveLength(3)
  })

  it('P3-LOOP-DETECT-002 stops a repeated non-idempotent tool before a second effect', async () => {
    const harness = buildHarness({ staticDecision: reserveDecision })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('LOOP_DETECTED')
    expect(result.toolCalls).toBe(1)
    expect(harness.toolCalls).toHaveLength(1)
  })

  it('P3-LOOP-DETECT-003 stops an alternating decision cycle before repeating it', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        reserveDecision,
        availabilityDecision,
        reserveDecision,
        availabilityDecision,
        reserveDecision
      ],
      loopDetection: { repeatThreshold: 3 }
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('LOOP_DETECTED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY,
      PHASE3_TOOL_RESERVE
    ])
  })

  it('P3-LOOP-DETECT-004 uses a stricter default threshold for repeated idempotent reads', async () => {
    const harness = buildHarness({ staticDecision: availabilityDecision })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('LOOP_DETECTED')
    expect(result.toolCalls).toBe(2)
  })
})

describe('P3-KNOWLEDGE — agentic knowledge loop', () => {
  const knowledgeAgent = phase3AgentProfile({
    tools: [],
    completionStrategy: 'EVIDENCE_BASED'
  })

  it('P3-KNOWLEDGE-001 refines a search after an insufficient result', async () => {
    const knowledge = new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS)
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'infectious',
          knowledgeCategories: ['infectious', 'nutritional', 'metabolic']
        }),
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'STRATEGY_CHANGED',
          query: 'condition-X causes',
          knowledgeCategories: ['infectious', 'nutritional', 'metabolic']
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText:
            'condition-X causes: infectious, nutritional, metabolic.'
        })
      ],
      knowledge,
      sufficiency: new CategorySufficiencyEvaluator()
    })
    const result = await harness.runtime.execute(
      operationalInput({ agent: knowledgeAgent })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(knowledge.queries).toEqual(['infectious', 'condition-X causes'])
    expect(result.modelCalls).toBe(0)
  })

  it('P3-KNOWLEDGE-002 does not complete when evidence stays insufficient', async () => {
    const knowledge = new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS)
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'infectious',
          knowledgeCategories: ['infectious', 'nutritional', 'metabolic']
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'The cause is definitely pathogen-alpha.'
        })
      ],
      knowledge,
      sufficiency: new CategorySufficiencyEvaluator()
    })
    const result = await harness.runtime.execute(
      operationalInput({ agent: knowledgeAgent })
    )
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).not.toContain('definitely')
    expect(result.modelCalls).toBe(0)
  })

  it('P3-KNOWLEDGE-003 flags conflicting sources without choosing silently', async () => {
    const knowledge = new SyntheticKnowledgeProvider([
      {
        itemId: 'evidence-a',
        text: 'condition-X cause is alpha.',
        sourceId: 'source-1',
        category: 'infectious'
      },
      {
        itemId: 'evidence-b',
        text: 'condition-X cause is beta.',
        sourceId: 'source-2',
        category: 'infectious'
      }
    ])
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'condition-X cause alpha beta',
          knowledgeCategories: ['infectious']
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'The cause is alpha.'
        })
      ],
      knowledge,
      sufficiency: new CategorySufficiencyEvaluator()
    })
    const result = await harness.runtime.execute(
      operationalInput({ agent: knowledgeAgent })
    )
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('P3-GROUNDING-001 blocks a response with unsupported claims', async () => {
    const knowledge = new SyntheticKnowledgeProvider(PHASE3_KNOWLEDGE_ITEMS)
    const claimExtractor = (response: string): readonly Claim[] => {
      const refs = [...response.matchAll(/\[evidence-([a-z0-9-]+)\]/g)].map(
        (match) => `evidence-${match[1]}`
      )
      return [{ text: response.slice(0, 120), evidenceRefs: refs }]
    }
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'condition-X causes',
          knowledgeCategories: ['infectious', 'nutritional', 'metabolic']
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'One cause is pathogen-alpha [evidence-invented-9].'
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText:
            'Infectious causes include pathogen-alpha [evidence-infectious-1].'
        })
      ],
      knowledge,
      sufficiency: new CategorySufficiencyEvaluator(),
      claimExtractor
    })
    const result = await harness.runtime.execute(
      operationalInput({ agent: knowledgeAgent })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toContain('evidence-infectious-1')
    expect(result.response).not.toContain('invented')
    expect(
      harness.audit.events.filter(
        (event) => event.result === 'SYSTEM:VERIFICATION'
      ).length
    ).toBeGreaterThanOrEqual(1)
  })

  it('P3-GROUNDING-002 refuses a false success claim without effect', async () => {
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('VERIFICATION_FAILED')
    expect(result.toolCalls).toBe(0)
    expect(harness.toolCalls).toHaveLength(0)
  })

  it('P3-GROUNDING-004 refuses an action claim grounded only in a prior read', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('VERIFICATION_FAILED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY
    ])
  })

  it('P3-GROUNDING-005 refuses an action claim naming a tool that never ran', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          toolId: PHASE3_TOOL_RESERVE,
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('VERIFICATION_FAILED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY
    ])
  })

  it('P3-GROUNDING-006 accepts an action claim grounded in the claimed effect', async () => {
    const harness = buildHarness({
      decisions: [
        reserveDecision,
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          toolId: PHASE3_TOOL_RESERVE,
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_RESERVE
    ])
  })

  it('P3-GROUNDING-007 refuses an action claim naming a read-only tool', async () => {
    const harness = buildHarness({
      decisions: [
        availabilityDecision,
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          toolId: PHASE3_TOOL_AVAILABILITY,
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('VERIFICATION_FAILED')
    expect(harness.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY
    ])
  })

  it('P3-GROUNDING-003 refuses a false success claim that names a tool', async () => {
    const harness = buildHarness({
      decisions: [
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'ACTION_CONFIRMED',
          toolId: PHASE3_TOOL_RESERVE,
          responseText: 'Feito: reserva confirmada.'
        })
      ]
    })
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('VERIFICATION_FAILED')
    expect(result.toolCalls).toBe(0)
    expect(harness.toolCalls).toHaveLength(0)
  })
})

describe('P3-PAUSE — durable pauses', () => {
  it('P3-PAUSE-001 pauses for user input and resumes durably', async () => {
    const store = new InMemoryExecutionStepStore()
    const askDecision = decision({
      decisionType: 'ASK_USER',
      reasonCode: 'MISSING_INFORMATION',
      requestedInput: {
        questionType: 'MISSING_FIELD',
        missingFields: ['date'],
        promptIntent: 'Which date should be reserved?'
      }
    })
    const first = buildHarness({
      decisions: [askDecision],
      store
    })
    const paused = await first.runtime.execute(operationalInput())
    expect(paused.stopReason).toBe('NEEDS_USER_INPUT')
    expect(paused.steps).toBe(1)
    expect(paused.response).toContain('date')

    const second = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store
    })
    const resumed = await second.runtime.execute(
      operationalInput({
        resume: { kind: 'user_input', message: '2026-10-01' }
      })
    )
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(second.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_RESERVE
    ])
  })

  it('P3-PAUSE-002 pauses for approval and resumes without duplicate effect', async () => {
    const store = new InMemoryExecutionStepStore()
    const approvals = new InMemoryApprovalEngine()
    const policy = new ScriptedPolicyEngine([], [], [PHASE3_TOOL_RESERVE])
    const first = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store,
      approvals,
      policy
    })
    const paused = await first.runtime.execute(operationalInput())
    expect(paused.stopReason).toBe('APPROVAL_REQUIRED')
    expect(paused.approvalId).toBeTruthy()

    approvals.approve(`exec_phase3_fixture:s1:${PHASE3_TOOL_RESERVE}`)

    const second = buildHarness({
      decisions: [respondDecision],
      store,
      approvals,
      policy
    })
    const resumed = await second.runtime.execute(
      operationalInput({
        resume: {
          kind: 'approval',
          approvalId: String(paused.approvalId)
        }
      })
    )
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(
      second.toolCalls.filter((c) => c.toolId === PHASE3_TOOL_RESERVE)
    ).toHaveLength(1)
    expect(
      first.toolCalls.filter((c) => c.toolId === PHASE3_TOOL_RESERVE)
    ).toHaveLength(0)
  })

  it('P3-PAUSE-004 keeps a paused execution resumable after a rejected approval binding', async () => {
    const store = new InMemoryExecutionStepStore()
    const approvals = new InMemoryApprovalEngine()
    const policy = new ScriptedPolicyEngine([], [], [PHASE3_TOOL_RESERVE])
    const first = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store,
      approvals,
      policy
    })
    const paused = await first.runtime.execute(operationalInput())
    expect(paused.stopReason).toBe('APPROVAL_REQUIRED')

    const wrong = buildHarness({
      decisions: [respondDecision],
      store,
      approvals,
      policy
    })
    const rejected = await wrong.runtime.execute(
      operationalInput({
        resume: { kind: 'approval', approvalId: 'approval_wrong' }
      })
    )
    expect(rejected.stopReason).toBe('STATE_CONFLICT')

    approvals.approve(`exec_phase3_fixture:s1:${PHASE3_TOOL_RESERVE}`)
    const second = buildHarness({
      decisions: [respondDecision],
      store,
      approvals,
      policy
    })
    const resumed = await second.runtime.execute(
      operationalInput({
        resume: {
          kind: 'approval',
          approvalId: String(paused.approvalId)
        }
      })
    )
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(
      second.toolCalls.filter((c) => c.toolId === PHASE3_TOOL_RESERVE)
    ).toHaveLength(1)
  })

  it('P3-PAUSE-005 rejects an approval resume while a question is pending', async () => {
    const store = new InMemoryExecutionStepStore()
    const askDecision = decision({
      decisionType: 'ASK_USER',
      reasonCode: 'MISSING_INFORMATION',
      requestedInput: {
        questionType: 'MISSING_FIELD',
        missingFields: ['date'],
        promptIntent: 'Which date should be reserved?'
      }
    })
    const first = buildHarness({ decisions: [askDecision], store })
    const paused = await first.runtime.execute(operationalInput())
    expect(paused.stopReason).toBe('NEEDS_USER_INPUT')

    const wrongKind = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store
    })
    const result = await wrongKind.runtime.execute(
      operationalInput({
        resume: { kind: 'approval', approvalId: 'approval_forged' }
      })
    )
    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(wrongKind.toolCalls).toHaveLength(0)
    const checkpoint = await store.loadCheckpoint(
      operationalInput().tenantId,
      'exec_phase3_fixture'
    )
    expect(checkpoint?.state.pendingQuestion?.promptIntent).toContain('date')
    expect(checkpoint?.state.stopReason).toBe('NEEDS_USER_INPUT')

    const correct = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store
    })
    const resumed = await correct.runtime.execute(
      operationalInput({
        resume: { kind: 'user_input', message: '2026-10-01' }
      })
    )
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(correct.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_RESERVE
    ])
  })

  it('P3-PAUSE-003 rejects a resume that does not match the pending question', async () => {
    const store = new InMemoryExecutionStepStore()
    const first = buildHarness({
      decisions: [
        decision({
          decisionType: 'ASK_USER',
          reasonCode: 'MISSING_INFORMATION',
          requestedInput: {
            questionType: 'MISSING_FIELD',
            missingFields: ['date'],
            promptIntent: 'Which date?'
          }
        })
      ],
      store
    })
    await first.runtime.execute(operationalInput())
    const second = buildHarness({ decisions: [respondDecision], store })
    const result = await second.runtime.execute(operationalInput())
    // No resume binding: the loop re-asks instead of acting on stale input.
    expect(result.stopReason).toBe('NEEDS_USER_INPUT')
  })
})

describe('P3-CHECKPOINT — crash and restart safety', () => {
  it('P3-CHECKPOINT-001 resumes between steps without replaying completed work', async () => {
    const store = new InMemoryExecutionStepStore()
    const first = buildHarness({
      decisions: [availabilityDecision, reserveDecision],
      store
    })
    const partial = await first.runtime.execute(operationalInput())
    expect(partial.stopReason).toBe('INTERNAL_FAILURE')
    expect(first.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY,
      PHASE3_TOOL_RESERVE
    ])

    const second = buildHarness({
      decisions: [verifyToolDecision, respondDecision],
      store
    })
    const resumed = await second.runtime.execute(operationalInput())
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(resumed.steps).toBe(4)
    expect(second.toolCalls).toHaveLength(0)
  })

  it('P3-CHECKPOINT-002 reuses the persisted decision after a failed effect', async () => {
    const store = new InMemoryExecutionStepStore()
    let failNext = true
    const flakyTools = createPhase3ToolRegistry({
      availability: 'AVAILABLE'
    })
    const flakyRegistry = {
      list: flakyTools.list,
      resolve: (toolId: string, version?: string) => {
        const tool = flakyTools.resolve(toolId, version)
        if (!tool || tool.id !== PHASE3_TOOL_RESERVE) return tool
        return {
          ...tool,
          execute: async () => {
            if (failNext) {
              failNext = false
              throw new Error('synthetic crash after decision')
            }
            return {
              status: 'SUCCEEDED' as const,
              output: { reservationRef: 'r-1' }
            }
          }
        }
      }
    }
    const first = buildHarness({
      decisions: [reserveDecision, respondDecision],
      store,
      tools: flakyRegistry
    })
    const failed = await first.runtime.execute(operationalInput())
    expect(failed.stopReason).toBe('TOOL_FAILURE')

    const second = buildHarness({
      decisions: [respondDecision],
      store,
      tools: flakyRegistry
    })
    const resumed = await second.runtime.execute(operationalInput())
    expect(resumed.stopReason).toBe('COMPLETED')
    expect((second.orchestrator as ScriptedOrchestrator).calls).toBe(1)
  })

  it('P3-CHECKPOINT-003 fails closed on an incompatible checkpoint version', async () => {
    const store = new InMemoryExecutionStepStore()
    const input = operationalInput()
    const checkpoint: ExecutionCheckpoint = sealCheckpoint({
      executionId: 'exec_phase3_fixture',
      tenantId: input.tenantId,
      checkpointVersion: 1,
      runtimeProfile: 'iterative',
      runtimeVersion: '9.9.9',
      orchestratorVersion: HYBRID_ORCHESTRATOR_VERSION,
      stepNumber: 1,
      state: {
        goal: 'stale goal',
        stepNumber: 1,
        observations: [],
        openQuestions: [],
        resolvedInputs: {},
        loopSignatures: []
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
        activeDurationMs: 0
      }
    })
    await store.saveCheckpoint(checkpoint)
    const harness = buildHarness({ decisions: [respondDecision], store })
    const result = await harness.runtime.execute(input)
    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(result.response).toContain(RUNTIME_V2_VERSION)
  })

  it('P3-CHECKPOINT-004 does not execute new steps after completion', async () => {
    const store = new InMemoryExecutionStepStore()
    const first = buildHarness({ decisions: [respondDecision], store })
    const completed = await first.runtime.execute(operationalInput())
    expect(completed.stopReason).toBe('COMPLETED')

    const second = buildHarness({ decisions: [reserveDecision], store })
    const replay = await second.runtime.execute(operationalInput())
    expect(replay.stopReason).toBe('STATE_CONFLICT')
    expect(second.toolCalls).toHaveLength(0)
  })

  it('binds iterative checkpoints to the capability composition', async () => {
    const store = new InMemoryExecutionStepStore()
    const input = operationalInput({
      capabilityFingerprint: 'capability-composition-a'
    })
    const first = buildHarness({
      staticDecision: respondDecision,
      store,
      capabilityFingerprint: 'capability-composition-a'
    })
    const firstResult = await first.runtime.execute(input)
    expect(firstResult.stopReason).toBe('COMPLETED')
    const checkpoint = await store.loadCheckpoint(
      input.tenantId,
      'exec_phase3_fixture'
    )
    expect(checkpoint?.state.capabilityFingerprint).toBe(
      'capability-composition-a'
    )

    const second = buildHarness({
      staticDecision: respondDecision,
      store,
      capabilityFingerprint: 'capability-composition-b'
    })
    const secondResult = await second.runtime.execute(
      operationalInput({ capabilityFingerprint: 'capability-composition-b' })
    )
    expect(secondResult.stopReason).toBe('STATE_CONFLICT')
    expect(secondResult.response).toContain('different capability composition')
  })
})

describe('P3-RESILIENCE — post-effect recovery', () => {
  it('P3-RESILIENCE-001 composes the response after an effect without repeating it', async () => {
    const store = new InMemoryExecutionStepStore()
    const first = buildHarness({
      decisions: [
        availabilityDecision,
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseIntent: 'Summarize the availability result.'
        })
      ],
      store,
      model: new ThrowingModelGateway()
    })
    const failed = await first.runtime.execute(operationalInput())
    expect(failed.stopReason).toBe('MODEL_FAILURE')
    expect(first.toolCalls.map((call) => call.toolId)).toEqual([
      PHASE3_TOOL_AVAILABILITY
    ])

    const second = buildHarness({
      decisions: [
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseIntent: 'Summarize the availability result.'
        })
      ],
      store,
      modelResponses: ['The resource is available.']
    })
    const resumed = await second.runtime.execute(operationalInput())
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(second.toolCalls).toHaveLength(0)
    expect(resumed.response).toBe('The resource is available.')
  })
})

describe('P3-LOOP — cycle detector', () => {
  it('P3-LOOP-DETECT-005 detects alternating cycles and allows repeats to the threshold', () => {
    expect(detectDecisionCycle(['a'], 'b')).toBe(false)
    expect(detectDecisionCycle(['a', 'b'], 'a')).toBe(true)
    expect(detectDecisionCycle(['a', 'b', 'c'], 'a')).toBe(true)
    expect(detectDecisionCycle(['a', 'a'], 'a')).toBe(false)
    expect(detectDecisionCycle(['a', 'b', 'c'], 'd')).toBe(false)
  })
})

describe('P3-STEP-STORE — checkpoint integrity', () => {
  it('P3-CHECKPOINT-005 rejects a tampered checkpoint', async () => {
    const store = new InMemoryExecutionStepStore()
    const input = operationalInput()
    const checkpoint = sealCheckpoint({
      executionId: 'exec_phase3_fixture',
      tenantId: input.tenantId,
      checkpointVersion: 1,
      runtimeProfile: 'iterative',
      runtimeVersion: RUNTIME_V2_VERSION,
      orchestratorVersion: HYBRID_ORCHESTRATOR_VERSION,
      stepNumber: 1,
      state: {
        goal: 'tampered goal',
        stepNumber: 1,
        observations: [],
        openQuestions: [],
        resolvedInputs: {},
        loopSignatures: []
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
        activeDurationMs: 0
      }
    })
    await store.saveCheckpoint(checkpoint)
    const tampered = { ...checkpoint, stepNumber: 99, digest: 'tampered' }
    expect(() =>
      validateCheckpointIntegrity(tampered, {
        tenantId: input.tenantId,
        executionId: 'exec_phase3_fixture'
      })
    ).toThrow(/digest|version|binding|Checkpoint/i)
  })

  it('P3-CHECKPOINT-007 degrades a terminal claim when the final checkpoint cannot be written', async () => {
    const base = new InMemoryExecutionStepStore()
    let saves = 0
    const flakyStore = {
      recordStep: (step: Parameters<typeof base.recordStep>[0]) =>
        base.recordStep(step),
      listSteps: (tenantId: string, executionId: string) =>
        base.listSteps(tenantId, executionId),
      loadCheckpoint: (tenantId: string, executionId: string) =>
        base.loadCheckpoint(tenantId, executionId),
      saveCheckpoint: async (
        checkpoint: Parameters<typeof base.saveCheckpoint>[0]
      ) => {
        saves += 1
        if (saves > 1) throw new Error('synthetic checkpoint failure')
        return base.saveCheckpoint(checkpoint)
      }
    }
    const harness = buildHarness({ decisions: [respondDecision] })
    const runtime = new IterativeGovernedRuntime({
      orchestrator: harness.orchestrator,
      modelGateway: harness.model,
      policy: harness.policy,
      approvals: harness.approvals,
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      audit: harness.audit,
      telemetry: harness.telemetry,
      stepStore: flakyStore
    })
    const result = await runtime.execute(operationalInput())
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('P3-CHECKPOINT-006 keeps step ordering sequential', async () => {
    const store = new InMemoryExecutionStepStore()
    const base = {
      executionId: 'exec_order',
      tenantId: 'tenant_order',
      stepType: 'MODEL' as const,
      attempt: 1,
      sideEffecting: false,
      startedAt: '2026-09-15T00:00:00.000Z'
    }
    await store.recordStep({
      ...base,
      stepId: 'step_order_1_model',
      stepNumber: 1,
      status: 'RUNNING',
      observationRefs: []
    })
    await expect(
      store.recordStep({
        ...base,
        stepId: 'step_order_2_model',
        stepNumber: 2,
        status: 'SUCCEEDED',
        observationRefs: []
      })
    ).rejects.toThrow(/cannot start before/)
    await store.recordStep({
      ...base,
      stepId: 'step_order_1_model',
      stepNumber: 1,
      status: 'SUCCEEDED',
      observationRefs: []
    })
    await store.recordStep({
      ...base,
      stepId: 'step_order_2_model',
      stepNumber: 2,
      status: 'SUCCEEDED',
      observationRefs: []
    })
    const steps = await store.listSteps('tenant_order', 'exec_order')
    expect(steps.map((step) => step.status)).toEqual(['SUCCEEDED', 'SUCCEEDED'])
  })
})

describe('P3-BOUNDARY — iterative runtime rejection paths', () => {
  it('fails closed before loading a checkpoint for invalid budgets and bindings', async () => {
    const harness = buildHarness({ staticDecision: respondDecision })
    await expect(
      harness.runtime.execute(
        operationalInput({
          agent: phase3AgentProfile({ id: '' as never })
        })
      )
    ).resolves.toMatchObject({ stopReason: 'UNSAFE_REQUEST', steps: 0 })
    await expect(
      harness.runtime.execute(
        operationalInput({
          budget: { ...operationalInput().budget, maxSteps: 0 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_STEPS' })
    await expect(
      harness.runtime.execute(
        operationalInput({
          budget: { ...operationalInput().budget, maxDurationMs: 0 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_DURATION' })

    const loadFailure = new InMemoryExecutionStepStore()
    loadFailure.loadCheckpoint = async () => {
      throw new Error('synthetic checkpoint store failure')
    }
    await expect(
      buildHarness({
        store: loadFailure,
        staticDecision: respondDecision
      }).runtime.execute(operationalInput())
    ).resolves.toMatchObject({ stopReason: 'STATE_CONFLICT' })

    await expect(
      buildHarness({
        capabilityFingerprint: 'composition-a',
        staticDecision: respondDecision
      }).runtime.execute(
        operationalInput({ capabilityFingerprint: 'composition-b' })
      )
    ).resolves.toMatchObject({ stopReason: 'STATE_CONFLICT' })
  })

  it('rejects decisions that are unavailable, unbound, or outside the profile', async () => {
    const noKnowledge = buildHarness({
      staticDecision: decision({
        decisionType: 'SEARCH_KNOWLEDGE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        query: 'synthetic'
      })
    })
    await expect(
      noKnowledge.runtime.execute(
        operationalInput({
          agent: phase3AgentProfile({
            tools: [],
            completionStrategy: 'EVIDENCE_BASED'
          })
        })
      )
    ).resolves.toMatchObject({ stopReason: 'STATE_CONFLICT' })

    const absentTool = buildHarness({
      staticDecision: decision({
        decisionType: 'CALL_TOOL',
        reasonCode: 'TOOL_REQUIRED',
        toolId: 'synthetic.absent'
      })
    })
    await expect(
      absentTool.runtime.execute(operationalInput())
    ).resolves.toMatchObject({
      stopReason: 'STATE_CONFLICT'
    })

    const notExposed = buildHarness({ staticDecision: reserveDecision })
    await expect(
      notExposed.runtime.execute(
        operationalInput({
          agent: phase3AgentProfile({ tools: [PHASE3_TOOL_AVAILABILITY] })
        })
      )
    ).resolves.toMatchObject({ stopReason: 'STATE_CONFLICT' })
  })

  it('fails closed on unsupported and failing policy decisions', async () => {
    const decisionInput = operationalInput()
    const unsupported = buildHarness({
      staticDecision: availabilityDecision,
      policy: {
        evaluate: async () => ({ outcome: 'UNKNOWN' }) as never
      } as never
    })
    await expect(
      unsupported.runtime.execute(decisionInput)
    ).resolves.toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE'
    })

    const throwing = buildHarness({
      staticDecision: availabilityDecision,
      policy: {
        evaluate: async () => {
          throw new Error('synthetic policy failure')
        }
      } as never
    })
    await expect(
      throwing.runtime.execute(decisionInput)
    ).resolves.toMatchObject({
      stopReason: 'POLICY_DENIED'
    })
  })

  it('covers approval execution lifecycle failures without replaying the tool', async () => {
    const approvalExecutionEvents: string[] = []
    const approvals = new InMemoryApprovalEngine() as InMemoryApprovalEngine & {
      execution: {
        begin: () => Promise<{ approvalId: string; reservationId: string }>
        complete: () => Promise<void>
        fail: () => Promise<void>
        uncertain: () => Promise<void>
      }
    }
    approvals.approveOnRequest = true
    approvals.execution = {
      begin: async () => {
        approvalExecutionEvents.push('begin')
        return {
          approvalId: 'approval-execution',
          reservationId: 'reservation-1'
        }
      },
      complete: async () => {
        approvalExecutionEvents.push('complete')
      },
      fail: async () => {
        approvalExecutionEvents.push('fail')
      },
      uncertain: async () => {
        approvalExecutionEvents.push('uncertain')
      }
    }
    const approvalDecision = decision({
      decisionType: 'REQUEST_APPROVAL',
      reasonCode: 'POLICY_REQUIRED',
      toolId: PHASE3_TOOL_RESERVE,
      toolInput: { resource: 'resource-x' }
    })
    const successful = buildHarness({
      decisions: [approvalDecision, respondDecision],
      approvals
    })
    const first = await successful.runtime.execute(operationalInput())
    expect(first.stopReason).toBe('COMPLETED')
    expect(approvalExecutionEvents).toEqual(['begin', 'complete'])

    approvalExecutionEvents.length = 0
    approvals.execution.complete = async () => {
      approvalExecutionEvents.push('complete')
      throw new Error('synthetic confirmation failure')
    }
    const confirmationFailure = buildHarness({
      decisions: [approvalDecision, respondDecision],
      approvals
    })
    const second = await confirmationFailure.runtime.execute(
      operationalInput({ executionId: 'exec_approval_confirmation_failure' })
    )
    expect(second.stopReason).toBe('TOOL_FAILURE')
    expect(second.response).toContain('unknown_effect')
    expect(approvalExecutionEvents).toEqual(['begin', 'complete'])
  })

  it('rejects incompatible checkpoint profiles, bindings, and terminal resumes', async () => {
    const cases: Array<{
      readonly checkpoint: Parameters<typeof checkpointFor>[1]
      readonly input?: Partial<RuntimeInput>
      readonly capabilityFingerprint?: string
    }> = [
      { checkpoint: { runtimeProfile: 'single_pass' } },
      { checkpoint: { runtimeVersion: '9.9.9' } },
      {
        checkpoint: {},
        input: { runtimeProfile: 'single_pass' }
      },
      {
        checkpoint: { capabilityFingerprint: 'composition-a' },
        input: { capabilityFingerprint: 'composition-b' },
        capabilityFingerprint: 'composition-b'
      },
      { checkpoint: { stopReason: 'COMPLETED' } }
    ]

    for (const [index, entry] of cases.entries()) {
      const input = operationalInput({
        executionId: `exec_checkpoint_rejection_${index}`,
        ...entry.input
      })
      const store = new InMemoryExecutionStepStore()
      await store.saveCheckpoint(checkpointFor(input, entry.checkpoint))
      const result = await buildHarness({
        store,
        staticDecision: respondDecision,
        ...(entry.capabilityFingerprint
          ? { capabilityFingerprint: entry.capabilityFingerprint }
          : {})
      }).runtime.execute(input)
      expect(result.stopReason).toBe('STATE_CONFLICT')
    }
  })

  it('bounds decision repair, model usage, policy handoff, and response composition', async () => {
    await expect(
      buildHarness({
        staticDecision: decision({
          decisionType: 'CALL_TOOL',
          reasonCode: 'TOOL_REQUIRED'
        }) as never
      }).runtime.execute(operationalInput())
    ).resolves.toMatchObject({ stopReason: 'MODEL_FAILURE' })

    await expect(
      buildHarness({ staticDecision: respondDecision }).runtime.execute(
        operationalInput({
          budget: { ...operationalInput().budget, maxModelCalls: 0 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_MODEL_CALLS' })

    await expect(
      buildHarness({
        decisions: [
          {
            decision: respondDecision,
            usage: {
              modelCalls: 0,
              inputTokens: 100,
              outputTokens: 100,
              costUsd: 0
            }
          }
        ]
      }).runtime.execute(
        operationalInput({
          budget: { ...operationalInput().budget, maxTokens: 10 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_TOKENS' })

    await expect(
      buildHarness({
        decisions: [availabilityDecision],
        policy: new ScriptedPolicyEngine([], [PHASE3_TOOL_AVAILABILITY])
      }).runtime.execute(operationalInput())
    ).resolves.toMatchObject({ stopReason: 'HUMAN_TAKEOVER' })

    await expect(
      buildHarness({
        decisions: [
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED'
          })
        ]
      }).runtime.execute(operationalInput())
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })

    await expect(
      buildHarness({
        decisions: [
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseIntent: 'compose an answer'
          })
        ],
        modelResponses: ['composed answer']
      }).runtime.execute(operationalInput())
    ).resolves.toMatchObject({
      stopReason: 'COMPLETED',
      response: 'composed answer'
    })

    await expect(
      buildHarness({
        decisions: [
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseIntent: 'compose an answer'
          })
        ],
        modelResponses: [
          { text: 'too many tokens', inputTokens: 100, outputTokens: 100 }
        ]
      }).runtime.execute(
        operationalInput({
          budget: { ...operationalInput().budget, maxTokens: 10 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_TOKENS' })
  })

  it('covers knowledge, verification, replan, and claim-grounding branches', async () => {
    const noVersionKnowledge: AgenticKnowledgeProvider = {
      search: async () => ({
        query: 'synthetic',
        items: [
          {
            itemId: 'knowledge-item',
            text: 'synthetic evidence',
            sourceId: 'synthetic-source',
            sourceVersion: 'v1',
            category: 'synthetic'
          }
        ],
        provenance: []
      })
    }
    const sufficient = {
      evaluate: async () => ({
        level: 'SUFFICIENT' as const,
        reasonCode: 'SYNTHETIC_SUFFICIENT',
        missingCategories: [],
        conflictingSources: [],
        coveredCategories: ['synthetic']
      })
    }
    const knowledgeResult = await buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'synthetic',
          knowledgeCategories: ['synthetic']
        }),
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          verificationTarget: 'evidence-coverage'
        }),
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'synthetic evidence'
        })
      ],
      knowledgeProvider: noVersionKnowledge,
      sufficiency: sufficient
    }).runtime.execute(
      operationalInput({
        agent: phase3AgentProfile({
          tools: [],
          completionStrategy: 'EVIDENCE_BASED'
        })
      })
    )
    expect(knowledgeResult.stopReason).toBe('COMPLETED')

    const unsupportedVerification = await buildHarness({
      decisions: [
        decision({
          decisionType: 'VERIFY',
          reasonCode: 'VERIFICATION_FAILED',
          verificationTarget: 'unsupported-target'
        }),
        respondDecision
      ]
    }).runtime.execute(operationalInput())
    expect(unsupportedVerification.stopReason).toBe('COMPLETED')

    const failedKnowledge = await buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'synthetic'
        })
      ],
      knowledgeProvider: {
        search: async () => {
          throw new Error('synthetic knowledge failure')
        }
      }
    }).runtime.execute(
      operationalInput({
        agent: phase3AgentProfile({
          tools: [],
          completionStrategy: 'EVIDENCE_BASED'
        })
      })
    )
    expect(failedKnowledge.stopReason).toBe('INSUFFICIENT_EVIDENCE')

    const claimExtractor = (): readonly Claim[] => [
      { text: 'unsupported claim', evidenceRefs: ['missing-ref'] }
    ]
    const claimResult = await buildHarness({
      decisions: [
        decision({
          decisionType: 'RESPOND',
          reasonCode: 'GOAL_SATISFIED',
          responseText: 'unsupported claim'
        })
      ],
      claimExtractor,
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'INCOMPLETE' as const,
          reasonCode: 'EVIDENCE_INCOMPLETE' as const,
          deterministic: true
        })
      }
    }).runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxVerificationCalls: 0 }
      })
    )
    expect(claimResult.stopReason).toBe('VERIFICATION_FAILED')
  })

  it('maps evaluator outcomes and approval states without opening the loop', async () => {
    const evaluations = [
      ['FAILED', 'VERIFICATION_FAILED'],
      ['INSUFFICIENT_EVIDENCE', 'INSUFFICIENT_EVIDENCE']
    ] as const
    for (const [outcome, stopReason] of evaluations) {
      const result = await buildHarness({
        decisions: [respondDecision],
        completionEvaluator: {
          evaluate: async () => ({
            outcome,
            reasonCode:
              outcome === 'FAILED'
                ? ('VERIFICATION_FAILED' as const)
                : ('EVIDENCE_INCOMPLETE' as const),
            deterministic: true,
            detail: 'synthetic evaluation'
          })
        }
      }).runtime.execute(operationalInput())
      expect(result.stopReason).toBe(stopReason)
    }

    const stopped = await buildHarness({
      decisions: [
        decision({ decisionType: 'STOP', reasonCode: 'USER_REQUESTED_STOP' })
      ],
      completionEvaluator: {
        evaluate: async () => ({
          outcome: 'COMPLETE' as const,
          reasonCode: 'COMPLETION_CONFIRMED' as const,
          deterministic: true
        })
      }
    }).runtime.execute(operationalInput())
    expect(stopped.stopReason).toBe('COMPLETED')

    const approvalDecision = decision({
      decisionType: 'REQUEST_APPROVAL',
      reasonCode: 'POLICY_REQUIRED',
      toolId: PHASE3_TOOL_RESERVE,
      toolInput: { resource: 'resource-x' }
    })
    for (const approval of [
      { status: 'DENIED', reason: 'synthetic denial' },
      { status: 'UNSUPPORTED', reason: 'synthetic unsupported' },
      { status: 'APPROVED', reason: 'missing identity' }
    ]) {
      const result = await buildHarness({
        decisions: [approvalDecision],
        approvalEngine: {
          request: async () => approval as never
        }
      }).runtime.execute(operationalInput())
      expect(['POLICY_DENIED', 'INSUFFICIENT_EVIDENCE']).toContain(
        result.stopReason
      )
    }
  })

  it('handles timeout and failure paths after an approved effect reservation', async () => {
    const events: string[] = []
    const execution: ApprovalExecutionPort = {
      begin: async () => ({
        approvalId: 'approval-runtime-v2' as never,
        reservationId: 'reservation-runtime-v2'
      }),
      complete: async () => undefined,
      fail: async () => {
        events.push('fail')
      },
      uncertain: async () => {
        events.push('uncertain')
      }
    }
    const approvalEngine: ApprovalEngine = {
      request: async () => ({
        status: 'APPROVED',
        approvalId: 'approval-runtime-v2' as never,
        reason: 'approved'
      }),
      execution
    }
    const approvalDecision = decision({
      decisionType: 'REQUEST_APPROVAL',
      reasonCode: 'POLICY_REQUIRED',
      toolId: PHASE3_TOOL_RESERVE,
      toolInput: { resource: 'resource-x' }
    })
    const failed = await buildHarness({
      decisions: [approvalDecision],
      approvalEngine,
      tools: createPhase3ToolRegistry({
        availability: 'AVAILABLE',
        reserveFails: true
      })
    }).runtime.execute(operationalInput())
    expect(failed.stopReason).toBe('TOOL_FAILURE')
    expect(events).toEqual(['fail'])

    events.length = 0
    const throwingTools = createPhase3ToolRegistry({
      availability: 'AVAILABLE'
    })
    const throwingRegistry = {
      list: throwingTools.list,
      resolve: (toolId: string, version?: string) => {
        const tool = throwingTools.resolve(toolId, version)
        return tool?.id === PHASE3_TOOL_RESERVE
          ? {
              ...tool,
              execute: async () => {
                throw new Error('synthetic effect throw')
              }
            }
          : tool
      }
    }
    const thrown = await buildHarness({
      decisions: [approvalDecision],
      approvalEngine,
      tools: throwingRegistry
    }).runtime.execute(operationalInput())
    expect(thrown.stopReason).toBe('TOOL_FAILURE')
    expect(thrown.response).toContain('unknown_effect')
    expect(events).toEqual(['uncertain'])

    const pendingKnowledge = await buildHarness({
      decisions: [
        decision({
          decisionType: 'SEARCH_KNOWLEDGE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          query: 'slow'
        })
      ],
      knowledgeProvider: {
        search: () => new Promise(() => undefined)
      }
    }).runtime.execute(
      operationalInput({
        agent: phase3AgentProfile({
          tools: [],
          completionStrategy: 'EVIDENCE_BASED'
        }),
        budget: { ...operationalInput().budget, maxDurationMs: 10 }
      })
    )
    expect(pendingKnowledge.stopReason).toBe('MAX_DURATION')
  })
})
