import { describe, expect, it } from 'vitest'
import type {
  ContextBuildInput,
  IterativeOrchestrator,
  IterativeOrchestratorInput,
  IterativeOrchestratorTurn,
  ModelGateway,
  ModelRequest,
  ModelResult,
  RuntimeInput,
  StepContext
} from '@cvg/harness-contracts'
import {
  HybridOrchestrator,
  OrchestratorDecisionError,
  ScriptedModelGateway,
  type GovernedDecisionInput
} from '@cvg/harness-orchestrator'
import { createOperationalHarness } from '../createOperationalHarness.ts'
import { DefaultContextEngine } from '../context-engine.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
import {
  createPhase3ToolRegistry,
  InMemoryApprovalEngine,
  phase3RuntimeInput,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine
} from './fixtures/phase3-fixtures.ts'

/**
 * SPEC0248 (AUD-0621 F02/F03/F04): the decision step reserves every decision
 * model call in the runtime budget, keeps usage on failure, and races the
 * context build and the decision against the absolute deadline and the
 * caller's cancellation. Every case goes through the public factory, like
 * the auditor's probes.
 */

const STOP = JSON.stringify({
  decisionType: 'STOP',
  reasonCode: 'USER_REQUESTED_STOP'
})

interface Reply {
  readonly text: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly costUsd?: number
}

class CountingModel implements ModelGateway {
  public readonly requests: ModelRequest[] = []

  public constructor(private readonly reply: (call: number) => Reply) {}

  public get calls(): number {
    return this.requests.length
  }

  public async complete(request: ModelRequest): Promise<ModelResult> {
    this.requests.push(request)
    const reply = this.reply(this.requests.length)
    return {
      text: reply.text,
      provider: 'synthetic',
      model: 'synthetic-decision',
      inputTokens: reply.inputTokens ?? 1,
      outputTokens: reply.outputTokens ?? 1,
      costUsd: reply.costUsd ?? 0.01
    }
  }
}

function harnessWith(
  extra: Partial<Parameters<typeof createOperationalHarness>[0]>
) {
  const stepStore = new InMemoryExecutionStepStore()
  const harness = createOperationalHarness({
    modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore,
    ...extra
  })
  return { harness, stepStore }
}

function input(
  budget: Partial<RuntimeInput['budget']> = {},
  signal?: AbortSignal
) {
  const base = phase3RuntimeInput()
  return {
    ...base,
    budget: { ...base.budget, ...budget },
    ...(signal ? { signal } : {})
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('SPEC0248 F02 — decision calls are reserved in the runtime budget', () => {
  it('AC01: a zero model-call budget never reaches the decision model', async () => {
    const model = new CountingModel(() => ({ text: STOP }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({ decisionModel: model })
    })
    const result = await harness.execute(input({ maxModelCalls: 0 }))
    expect(model.calls).toBe(0)
    expect(result.stopReason).toBe('MAX_MODEL_CALLS')
    expect(result.response).toBe(
      'Model-call budget exhausted before the call was started.'
    )
    expect(result.modelCalls).toBe(0)
  })

  it('AC02: internal repairs cannot spend past the model and repair budgets', async () => {
    const model = new CountingModel(() => ({ text: 'malformed' }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 5
      })
    })
    const result = await harness.execute(
      input({ maxModelCalls: 1, maxDecisionRepairs: 0 })
    )
    expect(model.calls).toBe(1)
    expect(result.modelCalls).toBe(1)
    expect(result.usage).toEqual({
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0.01
    })
  })

  it('AC03: internal repairs consume the per-execution repair budget', async () => {
    const model = new CountingModel(() => ({ text: 'malformed' }))
    const { harness, stepStore } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 5
      })
    })
    const run = input({ maxModelCalls: 10, maxDecisionRepairs: 1 })
    const result = await harness.execute(run)
    expect(model.calls).toBe(2)
    expect(result.modelCalls).toBe(2)
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    const checkpoint = await stepStore.loadCheckpoint(
      run.tenantId,
      run.executionId as string
    )
    expect(checkpoint?.budgetUsage.decisionRepairs).toBe(1)
    expect(checkpoint?.budgetUsage.modelCalls).toBe(2)
  })

  it('AC03: without a repair budget the runtime default of one repair applies', async () => {
    const model = new CountingModel(() => ({ text: 'malformed' }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 5
      })
    })
    const base = input({ maxModelCalls: 10 })
    const { maxDecisionRepairs: _omitted, ...budget } = base.budget
    void _omitted
    const result = await harness.execute({ ...base, budget })
    expect(model.calls).toBe(2)
    expect(result.modelCalls).toBe(2)
  })

  it('AC04: usage spent before a failed decision stays in the result', async () => {
    const model = new CountingModel(() => ({
      text: 'malformed',
      inputTokens: 11,
      outputTokens: 12,
      costUsd: 0.05
    }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 2
      })
    })
    const result = await harness.execute(input({ maxDecisionRepairs: 2 }))
    expect(model.calls).toBe(3)
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(result.response).toBe(
      'Execution failed internally: Orchestrator output did not contain a JSON object.'
    )
    expect(result.modelCalls).toBe(3)
    expect(result.usage.inputTokens).toBe(33)
    expect(result.usage.outputTokens).toBe(36)
    expect(result.usage.costUsd).toBeCloseTo(0.15, 10)
  })

  it('AC05: an exhausted token budget stops before the repair call', async () => {
    const model = new CountingModel(() => ({
      text: 'malformed',
      inputTokens: 30,
      outputTokens: 30
    }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 1
      })
    })
    const result = await harness.execute(input({ maxTokens: 50 }))
    expect(model.calls).toBe(1)
    expect(result.stopReason).toBe('MAX_TOKENS')
    expect(result.modelCalls).toBe(1)
    expect(result.usage.inputTokens + result.usage.outputTokens).toBe(60)
  })

  it('AC05: an exhausted cost budget stops before the repair call', async () => {
    const model = new CountingModel(() => ({
      text: 'malformed',
      costUsd: 0.5
    }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 1
      })
    })
    const result = await harness.execute(input({ maxCostUsd: 0.25 }))
    expect(model.calls).toBe(1)
    expect(result.stopReason).toBe('MAX_COST')
    expect(result.usage.costUsd).toBe(0.5)
  })

  it('AC06: gated usage is counted once on success', async () => {
    const model = new CountingModel((call) => ({
      text: call === 1 ? 'malformed' : STOP,
      inputTokens: 5,
      outputTokens: 7,
      costUsd: 0.02
    }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 1
      })
    })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('COMPLETED')
    expect(model.calls).toBe(2)
    expect(result.modelCalls).toBe(2)
    expect(result.usage).toEqual({
      inputTokens: 10,
      outputTokens: 14,
      costUsd: 0.04
    })
  })

  it('AC06: an orchestrator that ignores the gate is still counted from its report', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => ({
        decision: JSON.parse(STOP),
        usage: { modelCalls: 2, inputTokens: 3, outputTokens: 4, costUsd: 0.03 }
      })
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.modelCalls).toBe(2)
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0.03
    })
  })

  it('AC06: a success report above the budget stops with the budget reason', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => ({
        decision: JSON.parse(STOP),
        usage: { modelCalls: 9, inputTokens: 0, outputTokens: 0, costUsd: 0 }
      })
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('MAX_MODEL_CALLS')
    expect(result.response).toBe('Model-call budget exhausted.')
  })

  it('AC06: usage reported on an orchestrator failure is kept', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => {
        throw Object.assign(new Error('third-party failure'), {
          usage: {
            modelCalls: 1,
            inputTokens: 2,
            outputTokens: 3,
            costUsd: 0.04
          }
        })
      }
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(result.modelCalls).toBe(1)
    expect(result.usage).toEqual({
      inputTokens: 2,
      outputTokens: 3,
      costUsd: 0.04
    })
  })

  it('AC06: a failure report above the budget stops with the budget reason', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => {
        throw new OrchestratorDecisionError('decision_invalid', 'invalid', {
          modelCalls: 9,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0
        })
      }
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('MAX_MODEL_CALLS')
    expect(result.modelCalls).toBe(9)
  })

  it('AC07: invalid usage reported by an orchestrator is a model failure', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => ({
        decision: JSON.parse(STOP),
        usage: {
          modelCalls: 1,
          inputTokens: Number.NaN,
          outputTokens: 0,
          costUsd: 0
        }
      })
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('MODEL_FAILURE')
    expect(result.response).toBe('Orchestrator reported invalid model usage.')
  })

  it('AC07: fractional or missing usage fields are rejected before counting', async () => {
    for (const usage of [
      { modelCalls: 0.5, inputTokens: 0, outputTokens: 0, costUsd: 0 },
      { modelCalls: 1, inputTokens: 0, outputTokens: 0 },
      {
        modelCalls: 1,
        inputTokens: Number.POSITIVE_INFINITY,
        outputTokens: 0,
        costUsd: 0
      }
    ]) {
      const orchestrator: IterativeOrchestrator = {
        decide: async () => ({
          decision: JSON.parse(STOP),
          usage: usage as never
        })
      }
      const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
      const result = await harness.execute(input())
      expect(result.stopReason).toBe('MODEL_FAILURE')
      expect(result.modelCalls).toBe(0)
      expect(result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      })
    }
  })

  it('AC07: invalid usage from a gated decision call stops further calls', async () => {
    const model = new CountingModel(() => ({
      text: 'malformed',
      inputTokens: -1
    }))
    const { harness } = harnessWith({
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 3
      })
    })
    const result = await harness.execute(input({ maxDecisionRepairs: 3 }))
    expect(model.calls).toBe(1)
    expect(result.stopReason).toBe('MODEL_FAILURE')
    expect(result.modelCalls).toBe(1)
  })

  it('usage is read once: a getter that changes on a second read cannot leak NaN', async () => {
    function shifting() {
      let reads = 0
      return {
        modelCalls: 1,
        get inputTokens() {
          reads += 1
          return reads === 1 ? 5 : Number.NaN
        },
        outputTokens: 1,
        costUsd: 0.01
      }
    }
    const failing: IterativeOrchestrator = {
      decide: async () => {
        throw Object.assign(new Error('third-party failure'), {
          usage: shifting()
        })
      }
    }
    const failed = await harnessWith({
      iterativeOrchestrator: failing
    }).harness.execute(input())
    expect(failed.stopReason).toBe('INTERNAL_FAILURE')
    expect(failed.usage).toEqual({
      inputTokens: 5,
      outputTokens: 1,
      costUsd: 0.01
    })

    const answering: IterativeOrchestrator = {
      decide: async () => ({
        decision: JSON.parse(STOP),
        usage: shifting()
      })
    }
    const answered = await harnessWith({
      iterativeOrchestrator: answering
    }).harness.execute(input())
    expect(answered.stopReason).toBe('COMPLETED')
    expect(answered.usage).toEqual({
      inputTokens: 5,
      outputTokens: 1,
      costUsd: 0.01
    })
  })

  it('error usage that is malformed is ignored, not trusted', async () => {
    const orchestrator: IterativeOrchestrator = {
      decide: async () => {
        throw Object.assign(new Error('third-party failure'), {
          usage: { modelCalls: 'many' }
        })
      }
    }
    const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(result.modelCalls).toBe(0)
  })

  it('non-object and null failures, or a null usage, are rethrown as internal failures', async () => {
    const unreadable = new Error('unreadable usage')
    Object.defineProperty(unreadable, 'usage', {
      get() {
        throw new Error('getter failure')
      }
    })
    for (const thrown of [
      'plain failure',
      null,
      Object.assign(new Error('null usage'), { usage: null }),
      unreadable
    ]) {
      const orchestrator: IterativeOrchestrator = {
        decide: async () => {
          throw thrown
        }
      }
      const { harness } = harnessWith({ iterativeOrchestrator: orchestrator })
      const result = await harness.execute(input())
      expect(result.stopReason).toBe('INTERNAL_FAILURE')
      expect(result.modelCalls).toBe(0)
    }
  })
})

describe('SPEC0248 F03 — context build is bounded by the deadline and cancel', () => {
  function blockedContext() {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fallback = new DefaultContextEngine()
    return {
      release,
      engine: {
        build: async (value: ContextBuildInput): Promise<StepContext> => {
          await gate
          return fallback.build(value)
        }
      }
    }
  }

  it('AC08: cancellation during the context build stops without waiting', async () => {
    const context = blockedContext()
    let decisions = 0
    const { harness } = harnessWith({
      contextEngine: context.engine,
      iterativeOrchestrator: {
        decide: async () => {
          decisions += 1
          return { decision: JSON.parse(STOP) }
        }
      }
    })
    const controller = new AbortController()
    let settled = false
    const pending = harness
      .execute(input({ maxDurationMs: 5_000 }, controller.signal))
      .then((result) => {
        settled = true
        return result
      })
    await sleep(25)
    controller.abort()
    await sleep(50)
    const settledBeforeRelease = settled
    context.release()
    const result = await pending
    expect(settledBeforeRelease).toBe(true)
    expect(result.stopReason).toBe('CANCELLED')
    expect(decisions).toBe(0)
  })

  it('AC09: the deadline during the context build stops without waiting', async () => {
    const context = blockedContext()
    let decisions = 0
    const { harness } = harnessWith({
      contextEngine: context.engine,
      iterativeOrchestrator: {
        decide: async () => {
          decisions += 1
          return { decision: JSON.parse(STOP) }
        }
      }
    })
    let settled = false
    const pending = harness
      .execute(input({ maxDurationMs: 40 }))
      .then((result) => {
        settled = true
        return result
      })
    await sleep(200)
    const settledBeforeRelease = settled
    context.release()
    const result = await pending
    expect(settledBeforeRelease).toBe(true)
    expect(result.stopReason).toBe('MAX_DURATION')
    expect(result.response).toBe(
      'Duration budget exhausted while building the decision context.'
    )
    expect(decisions).toBe(0)
  })

  it('AC10: the decision gets only what the context build left of the deadline', async () => {
    const fallback = new DefaultContextEngine()
    const { harness } = harnessWith({
      contextEngine: {
        build: async (value: ContextBuildInput) => {
          await sleep(200)
          return fallback.build(value)
        }
      },
      iterativeOrchestrator: { decide: () => new Promise(() => undefined) }
    })
    const started = Date.now()
    const result = await harness.execute(input({ maxDurationMs: 300 }))
    const elapsed = Date.now() - started
    expect(result.stopReason).toBe('MAX_DURATION')
    expect(result.response).toBe(
      'Duration budget exhausted while deciding the next step.'
    )
    // Base: 200 ms of build plus a fresh 300 ms window (about 500 ms).
    expect(elapsed).toBeLessThan(450)
  })
})

describe('SPEC0248 F04 — cancellation reaches the decision', () => {
  it('AC11: aborting the caller ends a pending decision at once', async () => {
    let received: AbortSignal | undefined
    let release!: (turn: IterativeOrchestratorTurn) => void
    const deciding = new Promise<IterativeOrchestratorTurn>((resolve) => {
      release = resolve
    })
    const { harness } = harnessWith({
      iterativeOrchestrator: {
        decide: async (value: IterativeOrchestratorInput) => {
          received = value.signal
          return deciding
        }
      }
    })
    const controller = new AbortController()
    let settled = false
    const pending = harness
      .execute(input({ maxDurationMs: 5_000 }, controller.signal))
      .then((result) => {
        settled = true
        return result
      })
    await sleep(25)
    controller.abort()
    await sleep(50)
    const observed = { settled, aborted: received?.aborted }
    release({ decision: JSON.parse(STOP) })
    const result = await pending
    expect(observed).toEqual({ settled: true, aborted: true })
    expect(result.stopReason).toBe('CANCELLED')
    expect(result.response).toBe('Execution was cancelled by the caller.')
  })

  it('a caller signal aborted before the first decision never builds context', async () => {
    let builds = 0
    const fallback = new DefaultContextEngine()
    const { harness } = harnessWith({
      contextEngine: {
        build: async (value: ContextBuildInput) => {
          builds += 1
          return fallback.build(value)
        }
      },
      iterativeOrchestrator: {
        decide: async () => ({ decision: JSON.parse(STOP) })
      }
    })
    const result = await harness.execute(input({}, AbortSignal.abort()))
    expect(result.stopReason).toBe('CANCELLED')
    expect(builds).toBe(0)
  })

  it('AC12: the decision deadline aborts the signal the orchestrator holds', async () => {
    let received: AbortSignal | undefined
    const { harness } = harnessWith({
      iterativeOrchestrator: {
        decide: (value: IterativeOrchestratorInput) => {
          received = value.signal
          return new Promise(() => undefined)
        }
      }
    })
    const result = await harness.execute(input({ maxDurationMs: 200 }))
    expect(result.stopReason).toBe('MAX_DURATION')
    expect(result.response).toBe(
      'Duration budget exhausted while deciding the next step.'
    )
    expect(received?.aborted).toBe(true)
  })

  it('AC13: an abandoned orchestrator cannot start or record calls through a closed gate', async () => {
    let gateSeen: GovernedDecisionInput['modelGate']
    let release!: () => void
    const parked = new Promise<void>((resolve) => {
      release = resolve
    })
    const afterClose: boolean[] = []
    const { harness } = harnessWith({
      iterativeOrchestrator: {
        decide: async (value: GovernedDecisionInput) => {
          gateSeen = value.modelGate
          await parked
          afterClose.push(
            value.modelGate?.beginCall() ?? true,
            value.modelGate?.recordCall({
              inputTokens: 1,
              outputTokens: 1,
              costUsd: 0
            }) ?? true,
            value.modelGate?.beginRepair() ?? true
          )
          return { decision: JSON.parse(STOP) }
        }
      }
    })
    const controller = new AbortController()
    const pending = harness.execute(
      input({ maxDurationMs: 5_000 }, controller.signal)
    )
    await sleep(25)
    controller.abort()
    const result = await pending
    release()
    await sleep(10)
    expect(gateSeen).toBeDefined()
    expect(result.stopReason).toBe('CANCELLED')
    expect(result.modelCalls).toBe(0)
    expect(afterClose).toEqual([false, false, false])
  })

  it('AC13: a cancelled turn refuses new calls and repairs but counts a returned call', async () => {
    const seen: boolean[] = []
    const { harness } = harnessWith({
      iterativeOrchestrator: {
        decide: (value: GovernedDecisionInput) => {
          value.signal?.addEventListener('abort', () => {
            const gate = value.modelGate
            seen.push(
              gate?.beginCall() ?? true,
              gate?.beginRepair() ?? true,
              gate?.recordCall({
                inputTokens: 3,
                outputTokens: 4,
                costUsd: 0.01
              }) ?? true
            )
          })
          return new Promise(() => undefined)
        }
      }
    })
    const controller = new AbortController()
    const pending = harness.execute(
      input({ maxDurationMs: 5_000 }, controller.signal)
    )
    await sleep(25)
    controller.abort()
    const result = await pending
    expect(result.stopReason).toBe('CANCELLED')
    expect(seen).toEqual([false, false, false])
    expect(result.modelCalls).toBe(0)
    expect(result.usage).toEqual({
      inputTokens: 3,
      outputTokens: 4,
      costUsd: 0.01
    })
  })

  it('AC14: a cancellation while the decision is audited stops before dispatch', async () => {
    const controller = new AbortController()
    const actions: string[] = []
    const audit = {
      append: async (event: { action: string }) => {
        actions.push(event.action)
        if (event.action === 'orchestrator.decided') controller.abort()
      }
    }
    const stepStore = new InMemoryExecutionStepStore()
    const { harness } = harnessWith({
      audit: audit as never,
      stepStore,
      iterativeOrchestrator: {
        decide: async () => ({ decision: JSON.parse(STOP) })
      }
    })
    const run = input({ maxDurationMs: 5_000 }, controller.signal)
    const result = await harness.execute(run)
    expect(result.stopReason).toBe('CANCELLED')
    expect(actions).toContain('orchestrator.decided')
    const steps = await stepStore.listSteps(
      run.tenantId,
      run.executionId as string
    )
    expect(steps.some((step) => step.stepType === 'STOP')).toBe(false)
  })

  it('a gate stop also refuses later begin and repair requests', async () => {
    const seen: boolean[] = []
    const { harness } = harnessWith({
      iterativeOrchestrator: {
        decide: async (value: GovernedDecisionInput) => {
          const gate = value.modelGate
          seen.push(gate?.beginCall() ?? false)
          seen.push(
            gate?.recordCall({
              inputTokens: 10_000,
              outputTokens: 0,
              costUsd: 0
            }) ?? true
          )
          seen.push(gate?.beginCall() ?? true, gate?.beginRepair() ?? true)
          // Usage of a call that still returns after the stop is counted.
          seen.push(
            gate?.recordCall({ inputTokens: 1, outputTokens: 0, costUsd: 0 }) ??
              true,
            gate?.recordCall({
              inputTokens: Number.NaN,
              outputTokens: 0,
              costUsd: 0
            }) ?? true
          )
          // A misbehaving orchestrator that still answers is stopped anyway.
          return { decision: JSON.parse(STOP) }
        }
      }
    })
    const result = await harness.execute(input())
    expect(seen).toEqual([true, false, false, false, false, false])
    expect(result.stopReason).toBe('MAX_TOKENS')
    expect(result.modelCalls).toBe(1)
    expect(result.usage.inputTokens).toBe(10_001)
  })
})

describe('SPEC0248 — repair notice follows runtime rejections only', () => {
  it('a counted internal repair does not leak a repair notice into later steps', async () => {
    const captured: ContextBuildInput[] = []
    const fallback = new DefaultContextEngine()
    const replan = JSON.stringify({
      decisionType: 'REPLAN',
      reasonCode: 'STRATEGY_CHANGED'
    })
    const model = new CountingModel((call) => ({
      text: call === 1 ? 'malformed' : call === 2 ? replan : STOP
    }))
    const { harness } = harnessWith({
      contextEngine: {
        build: async (value: ContextBuildInput) => {
          captured.push(value)
          return fallback.build(value)
        }
      },
      iterativeOrchestrator: new HybridOrchestrator({
        decisionModel: model,
        maxDecisionRepairs: 1
      })
    })
    const result = await harness.execute(input({ maxModelCalls: 5 }))
    expect(result.stopReason).toBe('COMPLETED')
    expect(captured.length).toBeGreaterThanOrEqual(2)
    expect(captured.every((value) => value.decisionRepair === undefined)).toBe(
      true
    )
  })

  it('a runtime rejection still sends its errors to the next decision', async () => {
    const captured: ContextBuildInput[] = []
    const fallback = new DefaultContextEngine()
    const script = [
      {
        decisionType: 'CALL_TOOL',
        reasonCode: 'TOOL_REQUIRED',
        toolId: 'unknown.tool'
      },
      JSON.parse(STOP)
    ]
    let index = 0
    const { harness } = harnessWith({
      contextEngine: {
        build: async (value: ContextBuildInput) => {
          captured.push(value)
          return fallback.build(value)
        }
      },
      iterativeOrchestrator: {
        decide: async () => ({ decision: script[index++] })
      }
    })
    const result = await harness.execute(input())
    expect(result.stopReason).toBe('COMPLETED')
    expect(captured[0]?.decisionRepair).toBeUndefined()
    expect(captured[1]?.decisionRepair?.attempt).toBe(1)
    expect(captured[1]?.decisionRepair?.errors.length).toBeGreaterThan(0)
  })
})
