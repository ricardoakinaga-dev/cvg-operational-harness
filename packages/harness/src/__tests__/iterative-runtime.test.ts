import { describe, expect, it } from 'vitest'
import {
  HYBRID_ORCHESTRATOR_VERSION,
  RUNTIME_V2_VERSION,
  type Claim,
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
  readonly sufficiency?: CategorySufficiencyEvaluator
  readonly policy?: ScriptedPolicyEngine
  readonly approvals?: InMemoryApprovalEngine
  readonly store?: InMemoryExecutionStepStore
  readonly modelResponses?: readonly string[]
  readonly model?: ThrowingModelGateway
  readonly claimExtractor?: (response: string) => readonly Claim[]
  readonly completionStrategy?: 'DETERMINISTIC' | 'EVIDENCE_BASED' | 'HYBRID'
  readonly loopDetection?: { repeatThreshold: number }
  readonly maxObservationPayloadChars?: number
  readonly capabilityFingerprint?: string
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
    audit,
    telemetry,
    stepStore: store,
    ...(options.capabilityFingerprint
      ? { capabilityFingerprint: options.capabilityFingerprint }
      : {}),
    contextEngine: new DefaultContextEngine(),
    ...(options.knowledge ? { knowledge: options.knowledge } : {}),
    ...(options.sufficiency
      ? { sufficiencyEvaluator: options.sufficiency }
      : {}),
    ...(options.claimExtractor
      ? { claimExtractor: options.claimExtractor }
      : {}),
    ...(options.loopDetection ? { loopDetection: options.loopDetection } : {}),
    ...(options.maxObservationPayloadChars
      ? { maxObservationPayloadChars: options.maxObservationPayloadChars }
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
