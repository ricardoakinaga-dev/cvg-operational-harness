import { coreHook } from '../kernel/hook-authority.ts'
import { describe, expect, it, vi } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  applyResume,
  composeResponse,
  dispatchKnowledge,
  dispatchRespond,
  dispatchTool,
  evaluate,
  pause,
  validateDecision,
  type IterativeDispatchContext
} from '../iterative-dispatch.ts'
import type { LoopRun } from '../iterative-runtime.ts'
import { DEADLINE } from '../kernel/types.ts'

const toolDefinition = {
  id: 'synthetic.tool',
  version: 'v1',
  description: 'synthetic tool',
  inputSchema: {},
  outputSchema: {},
  risk: 'LOW',
  sideEffect: 'READ',
  idempotent: true,
  requiresApproval: false,
  execute: async () => ({ status: 'SUCCEEDED', output: { ok: true } })
}

function runtimeInput(overrides: Record<string, unknown> = {}): RuntimeInput {
  return {
    agent: {
      id: 'agent.synthetic' as never,
      version: 'v1' as never,
      objective: 'synthetic objective',
      instructions: [],
      skills: [],
      tools: ['synthetic.tool'],
      policies: []
    },
    tenantId: 'tenant_pdsh031' as never,
    conversationId: 'conv_pdsh031' as never,
    sessionId: 'session_pdsh031' as never,
    correlationId: 'corr_pdsh031' as never,
    traceId: 'trace_pdsh031' as never,
    userMessage: 'synthetic question',
    context: { values: {}, sourceIds: [], capturedAt: '' },
    state: { version: 1, values: {}, updatedAt: '' },
    budget: {
      maxSteps: 5,
      maxModelCalls: 5,
      maxToolCalls: 5,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    },
    ...overrides
  } as never
}

function makeRun(overrides: Record<string, unknown> = {}): LoopRun {
  return {
    input: runtimeInput(),
    executionId: 'exec_pdsh031',
    startedAtMs: Date.now(),
    stepNumber: 1,
    state: {
      goal: 'synthetic goal',
      stepNumber: 0,
      observations: [],
      openQuestions: [],
      resolvedInputs: {},
      loopSignatures: []
    },
    usage: {
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
    observations: [],
    responseText: null,
    lastDecision: null,
    lastEvaluation: null,
    lastToolObservation: null,
    lastSufficiency: null,
    lastDecisionErrors: [],
    skipEvaluationOnce: false,
    countedSteps: new Set(),
    inFlightCounted: false,
    ...overrides
  } as unknown as LoopRun
}

interface ListenerEntry {
  readonly plugin: string
  readonly fn: (...args: never[]) => unknown
}

function fakeHost(
  options: {
    services?: Record<string, unknown>
    listeners?: Record<string, ListenerEntry[]>
    guards?: ((call: unknown) => unknown)[]
  } = {}
) {
  const services = options.services ?? {}
  const listeners = options.listeners ?? {}
  return {
    listeners: (point: string) => listeners[point] ?? [],
    guards: () => options.guards ?? [],
    has: (name: string) => name in services,
    get: (name: string) => services[name]
  } as never
}

function makeTurn(budgetOverrides: Record<string, unknown> = {}) {
  const controller = new AbortController()
  const budget = {
    remainingMs: () => 1_000,
    withDeadline: (operation: () => Promise<unknown>) => operation(),
    beginModelRequest: () => undefined,
    recordModelResult: () => undefined,
    ...budgetOverrides
  }
  const turn = {
    input: runtimeInput(),
    startedAt: Date.now(),
    signal: controller.signal,
    budget,
    metadata: {}
  }
  return { controller, turn, budget }
}

function makeCtx(
  overrides: Partial<IterativeDispatchContext> = {}
): IterativeDispatchContext & { steps: unknown[]; observations: unknown[] } {
  const steps: unknown[] = []
  const observations: unknown[] = []
  const ctx = {
    options: {
      tools: { resolve: () => toolDefinition },
      knowledge: undefined
    } as never,
    maxObservationPayloadChars: 1_000,
    stop: (stopReason: never, response: string) => ({
      kind: 'stop' as const,
      stopReason,
      response
    }),
    operationKey: () => 'op_pdsh031',
    remainingDuration: () => 1_000,
    makeObservation: (_run: unknown, input: Record<string, unknown>) => ({
      observationId: `obs_${observations.length + 1}`,
      executionId: 'exec_pdsh031',
      timestamp: '2026-10-12T00:00:00.000Z',
      ...input
    }),
    checkAfterUsage: () => null,
    allowedDecisionTypes: () => [
      'RESPOND',
      'CALL_TOOL',
      'SEARCH_KNOWLEDGE',
      'REQUEST_APPROVAL',
      'STOP'
    ],
    evaluatorFor: () =>
      ({
        evaluate: async () => ({
          outcome: 'INCOMPLETE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          deterministic: true
        })
      }) as never,
    validateClaims: () => ({ valid: true, unsupportedClaims: [] }),
    withDeadline: (operation: Promise<unknown>) => operation,
    recordObservation: async (_run: unknown, observation: unknown) => {
      observations.push(observation)
    },
    recordStep: async (_run: unknown, step: unknown) => {
      steps.push(step)
    },
    persistCheckpoint: async () => {},
    safeAudit: async () => {},
    composeResponse: async () => ({ response: 'composed response' }),
    kernel: () => fakeHost(),
    turn: () => makeTurn().turn as never,
    ...overrides,
    steps,
    observations
  }
  return ctx as never
}

const toolServices = (overrides: Record<string, unknown> = {}) => ({
  log: { append: async () => {} },
  effects: { started: async () => {}, finished: async () => {} },
  ...overrides
})

describe('PDSH-031 slice 2d-3b — iterative dispatch validation and resume', () => {
  it('rejects tool decisions without a selection and unconfigured knowledge', () => {
    const ctx = makeCtx()
    const run = makeRun()
    expect(
      validateDecision(ctx, run, {
        decisionType: 'REQUEST_APPROVAL',
        reasonCode: 'POLICY_REQUIRED'
      } as never)
    ).toMatchObject({ valid: false })
    expect(
      validateDecision(ctx, run, {
        decisionType: 'SEARCH_KNOWLEDGE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        query: 'q'
      } as never)
    ).toMatchObject({ valid: false })
  })

  it('rejects a resume without a checkpoint', () => {
    const ctx = makeCtx()
    const run = makeRun({
      input: runtimeInput({
        resume: { kind: 'approval', approvalId: 'approval-x' }
      })
    })
    expect(applyResume(ctx, run, null)).toMatchObject({
      stopReason: 'STATE_CONFLICT',
      response: expect.stringContaining('durable checkpoint')
    })
  })

  it('resolves approval resumes against the paused binding', () => {
    const ctx = makeCtx()
    const checkpoint = { checkpointId: 'cp_1' } as never

    const missing = makeRun({
      input: runtimeInput({
        resume: { kind: 'approval', approvalId: 'approval-x' }
      }),
      state: {
        ...makeRun().state,
        stopReason: 'APPROVAL_REQUIRED'
      }
    })
    expect(applyResume(ctx, missing, checkpoint)).toMatchObject({
      stopReason: 'STATE_CONFLICT',
      preserveCheckpoint: true
    })

    const consumed = makeRun({
      input: runtimeInput({
        resume: { kind: 'approval', approvalId: 'approval-x' }
      })
    })
    expect(applyResume(ctx, consumed, checkpoint)).toBeNull()
  })

  it('resolves user-input resumes against the pending question', () => {
    const ctx = makeCtx()
    const checkpoint = { checkpointId: 'cp_1' } as never

    const conflicting = makeRun({
      input: runtimeInput({
        resume: { kind: 'user_input', message: 'answer' }
      }),
      state: {
        ...makeRun().state,
        pendingApprovalId: 'approval-x'
      }
    })
    expect(applyResume(ctx, conflicting, checkpoint)).toMatchObject({
      stopReason: 'STATE_CONFLICT'
    })

    const resolved = makeRun({
      input: runtimeInput({
        resume: { kind: 'user_input', message: 'answer' }
      }),
      state: {
        ...makeRun().state,
        resolvedInputs: { answer_1: 'answer' }
      }
    })
    expect(applyResume(ctx, resolved, checkpoint)).toBeNull()

    const unexpected = makeRun({
      input: runtimeInput({
        resume: { kind: 'user_input', message: 'answer' }
      })
    })
    expect(applyResume(ctx, unexpected, checkpoint)).toMatchObject({
      stopReason: 'STATE_CONFLICT',
      response: expect.stringContaining('without a pending question')
    })
  })
})

describe('PDSH-031 slice 2d-3b — iterative tool dispatch edges', () => {
  it('stops on exhausted budgets and unavailable tools before the kernel', async () => {
    const exhausted = makeRun({
      usage: { ...makeRun().usage, toolCalls: 5 }
    })
    expect(
      await dispatchTool(makeCtx(), exhausted, {} as never, 1, false)
    ).toMatchObject({ stopReason: 'MAX_TOOL_CALLS' })

    const missingTool = makeCtx({
      options: { tools: { resolve: () => undefined } } as never
    })
    expect(
      await dispatchTool(missingTool, makeRun(), {} as never, 1, false)
    ).toMatchObject({ stopReason: 'STATE_CONFLICT' })

    const noWindow = makeCtx({ remainingDuration: () => -1 })
    expect(
      await dispatchTool(
        noWindow,
        makeRun(),
        { toolInput: undefined } as never,
        1,
        false
      )
    ).toMatchObject({ stopReason: 'MAX_DURATION' })
  })

  it('dispatches a versionless tool without explicit input', async () => {
    const versionless = { ...toolDefinition } as Record<string, unknown>
    delete versionless.version
    const ctx = makeCtx({
      options: { tools: { resolve: () => versionless } } as never,
      kernel: () => fakeHost({ services: toolServices() })
    })
    const run = makeRun()
    expect(
      await dispatchTool(
        ctx,
        run,
        { reasonCode: 'TOOL_SELECTED' } as never,
        1,
        false
      )
    ).toEqual({ kind: 'continue' })
    expect(ctx.steps.length).toBe(2)
    expect(ctx.observations.length).toBe(1)
  })

  it('parks a mid-dispatch pause for resume', async () => {
    let guardCalls = 0
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices(),
          guards: [
            () => {
              guardCalls += 1
              return guardCalls > 1
                ? {
                    reason: 'paused by operator',
                    stopReason: 'HUMAN_TAKEOVER',
                    cause: 'operator_paused'
                  }
                : undefined
            }
          ]
        })
    })
    const outcome = await dispatchTool(ctx, makeRun(), {} as never, 1, false)
    expect(outcome).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      preserveCheckpoint: true
    })
    expect(
      ctx.steps.some(
        (step) => (step as { status?: string }).status === 'WAITING'
      )
    ).toBe(true)
  })

  it('pauses before the checkpoint without opening a step', async () => {
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices(),
          guards: [
            () => ({
              reason: 'paused by operator',
              stopReason: 'HUMAN_TAKEOVER',
              cause: 'operator_paused'
            })
          ]
        })
    })
    const outcome = await dispatchTool(ctx, makeRun(), {} as never, 1, false)
    expect(outcome).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      preserveCheckpoint: true
    })
    expect(
      ctx.steps.some(
        (step) => (step as { status?: string }).status === 'WAITING'
      )
    ).toBe(false)
  })

  it('rejects an approval whose identity changed while resuming', async () => {
    const reservationListener = {
      kind: 'control',
      plugin: 'control.approvals',
      fn: coreHook('tool/pre-execute', (async (
        call: { grant?: unknown },
        next: () => unknown
      ) => {
        ;(call as { grant?: unknown }).grant = { approvalId: 'approval-y' }
        return (next as () => unknown)()
      }) as never)
    }
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices(),
          listeners: { 'tool/pre-execute': [reservationListener] }
        })
    })
    const run = makeRun({
      state: {
        ...makeRun().state,
        pendingApprovalId: 'approval-x'
      }
    })
    expect(await dispatchTool(ctx, run, {} as never, 1, false)).toMatchObject({
      stopReason: 'STATE_CONFLICT',
      response: expect.stringContaining('Approval identity changed')
    })
  })

  it('closes an open step for a handoff guard', async () => {
    let guardCalls = 0
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices(),
          guards: [
            () => {
              guardCalls += 1
              return guardCalls > 1
                ? {
                    reason: 'handoff required',
                    stopReason: 'HUMAN_TAKEOVER',
                    cause: 'policy_handoff'
                  }
                : undefined
            }
          ]
        })
    })
    expect(
      await dispatchTool(ctx, makeRun(), {} as never, 1, false)
    ).toMatchObject({ stopReason: 'HUMAN_TAKEOVER' })
    expect(
      ctx.steps.some(
        (step) =>
          (step as { errorCode?: string }).errorCode === 'policy_handoff'
      )
    ).toBe(true)
  })

  it('reports unsupported policy when the closing record was lost', async () => {
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices({
            log: {
              append: async (event: { type?: string }) => {
                if (event.type === 'tool/result') {
                  throw new Error('closing record lost')
                }
              }
            }
          }),
          listeners: {
            'tool/pre-execute': [
              {
                plugin: 'control.policy',
                fn: async () =>
                  ({
                    kind: 'stop',
                    stopReason: 'INSUFFICIENT_EVIDENCE',
                    response: 'Policy returned an unsupported decision.',
                    cause: 'policy_unsupported'
                  }) as never
              }
            ]
          }
        })
    })
    const outcome = await dispatchTool(ctx, makeRun(), {} as never, 1, false)
    expect(outcome).toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
    expect(
      ctx.observations.some((observation) =>
        JSON.stringify(observation).includes('UNSUPPORTED')
      )
    ).toBe(true)
  })

  it('pauses for approval without an approval identity', async () => {
    const ctx = makeCtx({
      kernel: () =>
        fakeHost({
          services: toolServices(),
          listeners: {
            'tool/pre-execute': [
              {
                plugin: 'control.approvals',
                fn: async () =>
                  ({
                    kind: 'stop',
                    stopReason: 'APPROVAL_REQUIRED',
                    response: 'approval required',
                    cause: 'approval_pending'
                  }) as never
              }
            ]
          }
        })
    })
    const outcome = await dispatchTool(ctx, makeRun(), {} as never, 1, false)
    expect(outcome).toMatchObject({
      kind: 'pause',
      pausedKind: 'APPROVAL_REQUIRED'
    })
    expect(outcome).not.toHaveProperty('approvalId')
  })

  it('reports unreserved cancellation and deadline outcomes', async () => {
    const { controller, turn } = makeTurn()
    const cancelledTool = {
      ...toolDefinition,
      execute: () => {
        controller.abort()
        return new Promise(() => {})
      }
    }
    const cancelledCtx = makeCtx({
      turn: () => turn as never,
      options: { tools: { resolve: () => cancelledTool } } as never,
      kernel: () => fakeHost({ services: toolServices() })
    })
    expect(
      await dispatchTool(cancelledCtx, makeRun(), {} as never, 1, false)
    ).toMatchObject({ stopReason: 'CANCELLED' })

    const { turn: deadlineTurn } = makeTurn({
      withDeadline: () => Promise.resolve(DEADLINE)
    })
    const deadlineCtx = makeCtx({
      turn: () => deadlineTurn as never,
      kernel: () => fakeHost({ services: toolServices() })
    })
    expect(
      await dispatchTool(deadlineCtx, makeRun(), {} as never, 1, false)
    ).toMatchObject({ stopReason: 'MAX_DURATION' })
  })

  it('reports reserved cancellation and deadline as unknown effects', async () => {
    const reservationListener = {
      kind: 'control',
      plugin: 'control.approvals',
      fn: coreHook('tool/pre-execute', (async (
        call: { grant?: unknown; approval?: unknown },
        next: () => unknown
      ) => {
        ;(call as { grant?: unknown }).grant = { approvalId: 'approval-x' }
        return (next as () => unknown)()
      }) as never)
    }
    const reserveListener = {
      kind: 'control',
      plugin: 'control.approvals',
      fn: coreHook('tool/execute', (async (
        call: { approval?: unknown; grant?: unknown },
        next: () => unknown
      ) => {
        ;(call as { approval?: unknown }).approval = {
          request: call.grant,
          handle: { reservationId: 'res_pdsh031' }
        }
        return (next as () => unknown)()
      }) as never)
    }
    const listeners = {
      'tool/pre-execute': [reservationListener],
      'tool/execute': [reserveListener]
    }

    const { controller, turn } = makeTurn()
    const cancelledTool = {
      ...toolDefinition,
      execute: () => {
        controller.abort()
        return new Promise(() => {})
      }
    }
    const cancelled = await dispatchTool(
      makeCtx({
        turn: () => turn as never,
        options: { tools: { resolve: () => cancelledTool } } as never,
        kernel: () => fakeHost({ services: toolServices(), listeners })
      }),
      makeRun(),
      {} as never,
      1,
      false
    )
    expect(cancelled).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('unknown_effect')
    })

    const { turn: deadlineTurn } = makeTurn({
      withDeadline: () => Promise.resolve(DEADLINE)
    })
    const deadline = await dispatchTool(
      makeCtx({
        turn: () => deadlineTurn as never,
        kernel: () => fakeHost({ services: toolServices(), listeners })
      }),
      makeRun(),
      {} as never,
      1,
      false
    )
    expect(deadline).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('unknown_effect')
    })
  })

  it('records failed and thrown tool outcomes with and without error details', async () => {
    const failureRun = async (tool: Record<string, unknown>) =>
      dispatchTool(
        makeCtx({
          options: { tools: { resolve: () => tool } } as never,
          kernel: () => fakeHost({ services: toolServices() })
        }),
        makeRun(),
        {} as never,
        1,
        false
      )

    const failedWithError = await failureRun({
      ...toolDefinition,
      execute: async () => ({ status: 'FAILED', error: 'synthetic failure' })
    })
    expect(failedWithError).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'synthetic failure'
    })

    const failedWithoutError = await failureRun({
      ...toolDefinition,
      execute: async () => ({ status: 'FAILED' })
    })
    expect(failedWithoutError).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'Tool execution failed.'
    })

    const versionless = { ...toolDefinition } as Record<string, unknown>
    delete versionless.version
    const thrown = await failureRun({
      ...versionless,
      execute: async () => {
        throw new Error('executor exploded')
      }
    })
    expect(thrown).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('unknown_effect')
    })
  })
})

describe('PDSH-031 slice 2d-3b — knowledge, respond, compose, evaluate, pause', () => {
  it('bounds knowledge calls and checks window, provider and evaluator', async () => {
    const limitedRun = makeRun({
      input: runtimeInput({
        budget: {
          maxSteps: 0,
          maxModelCalls: 5,
          maxToolCalls: 5,
          maxDurationMs: 10_000,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    })
    expect(
      await dispatchKnowledge(makeCtx(), limitedRun, {} as never, 1)
    ).toMatchObject({ stopReason: 'MAX_KNOWLEDGE_CALLS' })

    const exhaustedCtx = makeCtx({ remainingDuration: () => -1 })
    expect(
      await dispatchKnowledge(exhaustedCtx, makeRun(), {} as never, 1)
    ).toMatchObject({ stopReason: 'MAX_DURATION' })

    expect(
      await dispatchKnowledge(makeCtx(), makeRun(), {} as never, 1)
    ).toMatchObject({ stopReason: 'STATE_CONFLICT' })

    const search = vi.fn(async () => ({ items: [], provenance: [] }))
    const providerCtx = makeCtx({
      options: {
        tools: { resolve: () => toolDefinition },
        knowledge: { search }
      } as never
    })
    expect(
      await dispatchKnowledge(providerCtx, makeRun(), {} as never, 1)
    ).toEqual({ kind: 'continue' })
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('fails verification-bound responses without a verification budget field', async () => {
    const ctx = makeCtx({
      validateClaims: () => ({ valid: false, unsupportedClaims: ['claim-a'] })
    })
    const run = makeRun({
      input: runtimeInput({
        budget: {
          maxSteps: 0,
          maxModelCalls: 5,
          maxToolCalls: 5,
          maxDurationMs: 10_000,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    })
    expect(
      await dispatchRespond(
        ctx,
        run,
        { responseText: 'answer', reasonCode: 'GOAL_SATISFIED' } as never,
        1
      )
    ).toMatchObject({
      stopReason: 'VERIFICATION_FAILED',
      response: expect.stringContaining('claim-a')
    })
  })

  it('re-queues an unverified response for revision', async () => {
    const ctx = makeCtx({
      validateClaims: () => ({ valid: false, unsupportedClaims: ['claim-a'] })
    })
    const run = makeRun()
    const outcome = await dispatchRespond(
      ctx,
      run,
      { responseText: 'answer', reasonCode: 'GOAL_SATISFIED' } as never,
      1
    )
    expect(outcome).toEqual({ kind: 'continue' })
    expect(run.skipEvaluationOnce).toBe(true)
    expect(run.lastEvaluation).toMatchObject({
      outcome: 'INCOMPLETE',
      reasonCode: 'VERIFICATION_FAILED'
    })
  })

  it('composes responses and maps every model outcome', async () => {
    const noWindow = makeCtx({ remainingDuration: () => -1 })
    expect(
      await composeResponse(noWindow, makeRun(), {} as never)
    ).toMatchObject({ stopReason: 'MAX_DURATION' })

    const composeWith = async (
      modelOverrides: Record<string, unknown>,
      options: {
        budget?: Record<string, unknown>
        logAppend?: (event: { type?: string }) => Promise<void>
      } = {}
    ) => {
      const { turn } = makeTurn(options.budget)
      const ctx = makeCtx({
        turn: () => turn as never,
        kernel: () =>
          fakeHost({
            services: {
              log: { append: options.logAppend ?? (async () => {}) },
              model: {
                complete: async () => ({
                  provider: 'synthetic',
                  inputTokens: 1,
                  outputTokens: 1,
                  costUsd: 0,
                  text: 'composed'
                }),
                ...modelOverrides
              }
            }
          })
      })
      return composeResponse(ctx, makeRun(), {} as never)
    }

    expect(await composeWith({})).toEqual({ response: 'composed' })
    expect(
      await composeWith({}, { budget: { withDeadline: () => DEADLINE } })
    ).toMatchObject({ stopReason: 'MAX_DURATION' })

    const { controller, turn: cancelTurn } = makeTurn()
    const cancelCtx = makeCtx({
      turn: () => cancelTurn as never,
      kernel: () =>
        fakeHost({
          services: {
            log: { append: async () => {} },
            model: {
              complete: () => {
                controller.abort()
                return new Promise(() => {})
              }
            }
          }
        })
    })
    expect(
      await composeResponse(cancelCtx, makeRun(), {} as never)
    ).toMatchObject({ stopReason: 'CANCELLED' })

    expect(
      await composeWith({
        complete: async () => {
          throw new Error('model exploded')
        }
      })
    ).toMatchObject({ stopReason: 'MODEL_FAILURE' })

    expect(
      await composeWith(
        {},
        {
          logAppend: async (event) => {
            if (event.type === 'model/result') {
              throw new Error('result lost')
            }
          }
        }
      )
    ).toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
  })

  it('evaluates usage, outcomes and after-usage stops', async () => {
    const withUsage = makeCtx({
      evaluatorFor: () =>
        ({
          evaluate: async () => ({
            outcome: 'INCOMPLETE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true,
            usage: {
              modelCalls: 1,
              inputTokens: 2,
              outputTokens: 3,
              costUsd: 0.01
            }
          })
        }) as never,
      checkAfterUsage: () => ({
        reason: 'MAX_COST',
        response: 'Cost budget exhausted after the evaluation.'
      })
    })
    const usageRun = makeRun()
    expect(
      await evaluate(withUsage, usageRun, {
        decisionType: 'CALL_TOOL'
      } as never)
    ).toMatchObject({ stopReason: 'MAX_COST' })
    expect(usageRun.usage.modelCalls).toBe(1)
    expect(usageRun.usage.outputTokens).toBe(3)

    const usageWithoutStop = makeCtx({
      evaluatorFor: () =>
        ({
          evaluate: async () => ({
            outcome: 'INCOMPLETE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true,
            usage: {
              modelCalls: 1,
              inputTokens: 1,
              outputTokens: 1,
              costUsd: 0
            }
          })
        }) as never
    })
    expect(
      await evaluate(usageWithoutStop, makeRun(), {
        decisionType: 'CALL_TOOL'
      } as never)
    ).toBeNull()

    const completeEvaluator = () =>
      ({
        evaluate: async () => ({
          outcome: 'COMPLETE',
          reasonCode: 'GOAL_SATISFIED',
          deterministic: true
        })
      }) as never

    expect(
      await evaluate(makeCtx({ evaluatorFor: completeEvaluator }), makeRun(), {
        decisionType: 'CALL_TOOL'
      } as never)
    ).toBeNull()

    expect(
      await evaluate(makeCtx({ evaluatorFor: completeEvaluator }), makeRun(), {
        decisionType: 'RESPOND'
      } as never)
    ).toMatchObject({
      stopReason: 'COMPLETED',
      response: 'Execution completed.'
    })

    const failedEvaluator = (detail?: string) => () =>
      ({
        evaluate: async () => ({
          outcome: 'FAILED',
          reasonCode: 'LOOP_DETECTED',
          deterministic: true,
          ...(detail ? { detail } : {})
        })
      }) as never

    expect(
      await evaluate(
        makeCtx({ evaluatorFor: failedEvaluator('loop signature repeated') }),
        makeRun(),
        { decisionType: 'CALL_TOOL' } as never
      )
    ).toMatchObject({
      response: expect.stringContaining('loop signature repeated')
    })

    expect(
      await evaluate(makeCtx({ evaluatorFor: failedEvaluator() }), makeRun(), {
        decisionType: 'CALL_TOOL'
      } as never)
    ).toMatchObject({
      response: expect.stringContaining('LOOP_DETECTED')
    })

    const insufficient = makeCtx({
      evaluatorFor: () =>
        ({
          evaluate: async () => ({
            outcome: 'INSUFFICIENT_EVIDENCE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true
          })
        }) as never
    })
    expect(
      await evaluate(
        insufficient,
        makeRun({ responseText: 'partial answer' }),
        {
          decisionType: 'STOP'
        } as never
      )
    ).toMatchObject({ response: 'partial answer' })

    expect(
      await evaluate(insufficient, makeRun(), {
        decisionType: 'STOP'
      } as never)
    ).toMatchObject({
      response: 'The available evidence is insufficient for a complete answer.'
    })

    expect(
      await evaluate(insufficient, makeRun(), {
        decisionType: 'CALL_TOOL'
      } as never)
    ).toBeNull()
  })

  it('pauses for approval without an identity or explicit step number', async () => {
    const ctx = makeCtx()
    const run = makeRun()
    const outcome = await pause(ctx, run, 7, {
      kind: 'pause',
      pausedKind: 'APPROVAL_REQUIRED',
      decision: undefined as never,
      approvalId: undefined,
      pauseStepNumber: undefined
    } as never)
    expect(outcome).toMatchObject({
      stopReason: 'APPROVAL_REQUIRED',
      response: 'Approval is required before continuing.'
    })
    expect(run.state.pendingStepNumber).toBe(7)
    expect(run.state.pendingDecision).toBeUndefined()
  })
})
