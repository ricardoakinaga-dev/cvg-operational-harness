import { describe, expect, it } from 'vitest'
import { KernelRuntime } from '../kernel/kernel-runtime.ts'
import { approvalsControl } from '../kernel/controls.ts'
import {
  CONTROL_SERVICES,
  LOOP_CAPABILITIES,
  stop,
  type KernelPlugin
} from '../kernel/types.ts'

const descriptor = {
  id: 'synthetic.tool',
  version: 'v1',
  description: 'synthetic tool',
  inputSchema: {},
  outputSchema: {},
  risk: 'LOW',
  sideEffect: 'READ',
  idempotent: true,
  requiresApproval: false
}

function runtimeInput(overrides: Record<string, unknown> = {}) {
  return {
    executionId: 'exec_pdsh031',
    tenantId: 'tenant_pdsh031',
    conversationId: 'conv_pdsh031',
    sessionId: 'session_pdsh031',
    correlationId: 'corr_pdsh031',
    traceId: 'trace_pdsh031',
    userMessage: 'synthetic question',
    context: { values: {}, sourceIds: [], capturedAt: '' },
    objective: 'synthetic objective',
    instructions: [],
    agent: {
      id: 'agent_pdsh031',
      version: 'v1',
      objective: 'synthetic objective',
      instructions: [],
      tools: ['synthetic.tool']
    },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    },
    ...overrides
  }
}

function defaultTurnBudget(overrides: Record<string, unknown> = {}) {
  return {
    remainingMs: () => 10_000,
    withDeadline: (operation: () => Promise<unknown>) => operation(),
    beginModelRequest: () => undefined,
    recordModelResult: () => undefined,
    ...overrides
  }
}

function defaultLog() {
  const events: unknown[] = []
  return {
    events,
    append: async (event: unknown) => {
      events.push(event)
    }
  }
}

const effectsStub = { started: async () => {}, finished: async () => {} }

interface RuntimeConfig {
  readonly planner?: unknown
  readonly model?: unknown
  readonly tools?: unknown
  readonly log?: unknown
  readonly turnBudget?: unknown
  readonly approvals?: unknown
  readonly extraPlugins?: readonly KernelPlugin[]
  readonly skipControlServices?: readonly string[]
}

function makePlugins(config: RuntimeConfig): KernelPlugin[] {
  const services: Record<string, unknown> = {
    policy: { evaluate: async () => ({ outcome: 'ALLOW' }) },
    approvals: config.approvals ?? { request: async () => ({}) },
    effects: effectsStub,
    audit: {},
    pause: {},
    log: config.log ?? defaultLog(),
    budget: {
      begin: () => config.turnBudget ?? defaultTurnBudget()
    }
  }
  const skipped = config.skipControlServices ?? []
  const provided = CONTROL_SERVICES.filter(
    (key) => !skipped.includes(key as string)
  )
  const control: KernelPlugin = {
    name: 'control.slice2d',
    kind: 'control',
    provides: [...provided],
    apply: (ctx: never) => {
      for (const key of provided) {
        ;(ctx as never as { provide(k: string, v: unknown): void }).provide(
          key as string,
          services[key as string]
        )
      }
    }
  } as never
  const capability: KernelPlugin = {
    name: 'capability.slice2d',
    kind: 'capability',
    provides: [...LOOP_CAPABILITIES],
    apply: (ctx: never) => {
      const provide = (ctx as never as { provide(k: string, v: unknown): void })
        .provide
      provide(
        'planner',
        config.planner ?? {
          decideNextStep: async () => ({
            action: 'RESPOND',
            response: 'default answer'
          })
        }
      )
      provide(
        'model',
        config.model ?? {
          complete: async () => ({
            provider: 'synthetic',
            inputTokens: 1,
            outputTokens: 1,
            costUsd: 0,
            text: 'model answer'
          })
        }
      )
      provide(
        'tools',
        config.tools ?? {
          list: () => [descriptor],
          resolve: () => ({
            ...descriptor,
            execute: async () => ({
              status: 'SUCCEEDED',
              output: 'synthetic output'
            })
          })
        }
      )
      provide('telemetry', { record: () => {} })
    }
  } as never
  return [control, capability, ...(config.extraPlugins ?? [])]
}

async function makeRuntime(config: RuntimeConfig = {}) {
  return KernelRuntime.boot(makePlugins(config), {})
}

async function runWith(
  config: RuntimeConfig,
  input: Record<string, unknown> = runtimeInput()
) {
  const runtime = await makeRuntime(config)
  return runtime.execute(input as never)
}

describe('PDSH-031 slice 2d-1b — kernel runtime edges', () => {
  it('fails closed on boot errors and disposes every runtime state', async () => {
    const unattached = KernelRuntime.lazy([])
    await unattached.dispose()

    const failing = KernelRuntime.lazy([
      {
        name: 'boom',
        kind: 'control',
        apply: async () => {
          throw new Error('boot exploded')
        }
      } as never
    ])
    const failed = await failing.execute(runtimeInput() as never)
    expect(failed.stopReason).toBe('INTERNAL_FAILURE')
    expect(failed.response).toBe('Kernel could not start: boot exploded.')
    await failing.dispose()

    const custom = KernelRuntime.lazy(
      [
        {
          name: 'boom',
          kind: 'control',
          apply: async () => {
            throw 'raw failure'
          }
        } as never
      ],
      { bootFailureResponse: 'kickoff failed' }
    )
    expect((await custom.execute(runtimeInput() as never)).response).toBe(
      'kickoff failed'
    )

    const booted = await makeRuntime()
    await booted.dispose()
  })

  it('stops when the turn/start record cannot be written', async () => {
    const log = {
      events: [],
      append: async (event: { type?: string }) => {
        if (event.type === 'turn/start') {
          throw new Error('journal down')
        }
      }
    }
    const result = await runWith({ log })
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('journal down')
  })

  it('stops at the entry gate when a control blocks the turn', async () => {
    const blocker: KernelPlugin = {
      name: 'control.blocker',
      kind: 'control',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'turn/before-step',
          async () => stop('HUMAN_TAKEOVER', 'paused by operator')
        )
      }
    } as never
    const result = await runWith({ extraPlugins: [blocker] })
    expect(result).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      response: 'paused by operator'
    })
  })

  it('cancels before planning and while planning', async () => {
    const controller = new AbortController()
    controller.abort()
    const preAborted = await runWith(
      {},
      runtimeInput({ signal: controller.signal })
    )
    expect(preAborted.stopReason).toBe('CANCELLED')

    const midFlight = new AbortController()
    const result = await runWith(
      {
        planner: {
          decideNextStep: () => {
            midFlight.abort()
            return new Promise(() => {})
          }
        }
      },
      runtimeInput({ signal: midFlight.signal })
    )
    expect(result.stopReason).toBe('CANCELLED')
  })

  it('stops when the duration budget is gone before planning', async () => {
    const result = await runWith({
      turnBudget: defaultTurnBudget({ remainingMs: () => -1 })
    })
    expect(result).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: 'Duration budget exhausted before planning.'
    })
  })

  it('normalizes planner failures', async () => {
    const result = await runWith({
      planner: {
        decideNextStep: async () => {
          throw new Error('planner exploded')
        }
      }
    })
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toBe(
      'Execution could not be planned: planner exploded.'
    )

    const raw = await runWith({
      planner: {
        decideNextStep: async () => {
          throw 'raw planner failure'
        }
      }
    })
    expect(raw.response).toBe(
      'Execution could not be planned: unknown failure.'
    )
  })

  it('resolves every decision text fallback', async () => {
    const decisions = [
      { action: 'ASK_USER', reason: 'need more input' },
      { action: 'ASK_USER' },
      { action: 'REQUEST_APPROVAL', reason: 'approval demanded' },
      { action: 'REQUEST_APPROVAL' },
      { action: 'HANDOFF', reason: 'human needed' },
      { action: 'HANDOFF' },
      { action: 'STOP' },
      { action: 'RETRIEVE' }
    ]
    const runtime = await makeRuntime({
      planner: {
        decideNextStep: async () => decisions.shift()
      }
    })
    const results = []
    for (let index = 0; index < 8; index += 1) {
      results.push(await runtime.execute(runtimeInput() as never))
    }
    expect(results[0]).toMatchObject({
      stopReason: 'NEEDS_USER_INPUT',
      response: 'need more input'
    })
    expect(results[1]).toMatchObject({
      stopReason: 'NEEDS_USER_INPUT',
      response: 'More information is required.'
    })
    expect(results[2]).toMatchObject({
      stopReason: 'APPROVAL_REQUIRED',
      response: 'approval demanded'
    })
    expect(results[3]).toMatchObject({
      stopReason: 'APPROVAL_REQUIRED',
      response: 'Approval is required before continuing.'
    })
    expect(results[4]).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      response: 'human needed'
    })
    expect(results[5]).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      response: 'Human takeover is required.'
    })
    expect(results[6]).toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      response: 'Execution stopped.'
    })
    expect(results[7]).toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE'
    })
  })

  it('handles model cancellation at the respond step', async () => {
    const controller = new AbortController()
    const result = await runWith(
      {
        planner: { decideNextStep: async () => ({ action: 'RESPOND' }) },
        model: {
          complete: () => {
            controller.abort()
            return new Promise(() => {})
          }
        }
      },
      runtimeInput({ signal: controller.signal })
    )
    expect(result).toMatchObject({ stopReason: 'CANCELLED', modelCalls: 1 })
  })

  it('reports an unrecorded model result and an exhausted budget', async () => {
    const log = {
      events: [],
      append: async (event: { type?: string }) => {
        if (event.type === 'model/result') {
          throw new Error('result lost')
        }
      }
    }
    const unrecorded = await runWith({
      log,
      planner: { decideNextStep: async () => ({ action: 'RESPOND' }) }
    })
    expect(unrecorded.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(unrecorded.usage.inputTokens).toBe(1)

    const exhausted = await runWith({
      planner: { decideNextStep: async () => ({ action: 'RESPOND' }) },
      turnBudget: defaultTurnBudget({
        recordModelResult: (() => {
          let calls = 0
          return () => {
            calls += 1
            return calls >= 2
              ? stop(
                  'MAX_TOKENS',
                  'Token budget exhausted after the model call.'
                )
              : undefined
          }
        })()
      })
    })
    expect(exhausted.stopReason).toBe('MAX_TOKENS')
  })

  it('reports tool cancellation without and with an approval reservation', async () => {
    const plain = new AbortController()
    const withoutApproval = await runWith(
      {
        planner: {
          decideNextStep: async () => ({
            action: 'CALL_TOOL',
            toolInvocation: { toolId: 'synthetic.tool', toolVersion: 'v1' }
          })
        },
        tools: {
          list: () => [descriptor],
          resolve: () => ({
            ...descriptor,
            execute: () => {
              plain.abort()
              return new Promise(() => {})
            }
          })
        }
      },
      runtimeInput({ signal: plain.signal })
    )
    expect(withoutApproval.stopReason).toBe('CANCELLED')

    const reserved = new AbortController()
    const uncertainty: unknown[] = []
    const approvals = {
      request: async () => ({
        status: 'APPROVED',
        approvalId: 'appr_pdsh031'
      }),
      execution: {
        begin: async () => ({ reservationId: 'res_pdsh031' }),
        fail: async () => {},
        uncertain: async (evidence: unknown) => {
          uncertainty.push(evidence)
        },
        complete: async () => {}
      }
    }
    const withApproval = await runWith(
      {
        skipControlServices: ['approvals'],
        approvals,
        extraPlugins: [approvalsControl(approvals as never)],
        planner: {
          decideNextStep: async () => ({
            action: 'CALL_TOOL',
            toolInvocation: { toolId: 'synthetic.tool', toolVersion: 'v1' }
          })
        },
        tools: {
          list: () => [descriptor],
          resolve: () => ({
            ...descriptor,
            requiresApproval: true,
            execute: () => {
              reserved.abort()
              return new Promise(() => {})
            }
          })
        }
      },
      runtimeInput({ signal: reserved.signal })
    )
    expect(withApproval).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('unknown_effect')
    })
    expect(uncertainty).toHaveLength(1)
  })

  it('stringifies tool outputs and defaults missing ones', async () => {
    const stringOutput = await runWith({
      planner: toolPlanner(),
      tools: toolRegistry('plain output')
    })
    expect(stringOutput).toMatchObject({
      stopReason: 'COMPLETED',
      response: 'plain output'
    })

    const symbolOutput = await runWith({
      planner: toolPlanner(),
      tools: toolRegistry(Symbol('synthetic'))
    })
    expect(symbolOutput.response).toContain('Symbol(synthetic)')

    const missingOutput = await runWith({
      planner: toolPlanner(),
      tools: toolRegistry(undefined)
    })
    expect(missingOutput).toMatchObject({
      stopReason: 'COMPLETED',
      response: 'Tool completed successfully.'
    })

    const failedWithoutError = await runWith({
      planner: toolPlanner(),
      tools: {
        list: () => [descriptor],
        resolve: () => ({
          ...descriptor,
          execute: async () => ({ status: 'FAILED' })
        })
      }
    })
    expect(failedWithoutError).toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'Tool execution failed.'
    })
  })

  it('stops a successful tool whose duration overran the budget', async () => {
    const result = await runWith(
      {
        planner: toolPlanner(),
        tools: {
          list: () => [descriptor],
          resolve: () => ({
            ...descriptor,
            execute: async () => {
              await new Promise((resolve) => setTimeout(resolve, 10))
              return { status: 'SUCCEEDED', output: 'late output' }
            }
          })
        }
      },
      runtimeInput({
        budget: {
          maxSteps: 1,
          maxModelCalls: 1,
          maxToolCalls: 1,
          maxDurationMs: 4,
          maxCostUsd: 1,
          maxTokens: 1_000
        }
      })
    )
    expect(result).toMatchObject({
      stopReason: 'MAX_DURATION',
      response: 'Duration budget exhausted after tool execution.'
    })
  })

  it('reports a lost closing record for both settled tool outcomes', async () => {
    const failingLog = {
      events: [],
      append: async (event: { type?: string }) => {
        if (event.type === 'tool/result') {
          throw new Error('closing record lost')
        }
      }
    }
    const settledSuccess = await runWith({
      log: failingLog,
      planner: toolPlanner(),
      tools: toolRegistry('ok')
    })
    expect(settledSuccess.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(settledSuccess.response).toContain('closing record lost')

    const blockingListener: KernelPlugin = {
      name: 'control.thrower',
      kind: 'control',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'tool/execute',
          async () => {
            throw new Error('pre-dispatch boom')
          }
        )
      }
    } as never
    const settledBlocked = await runWith({
      log: failingLog,
      planner: toolPlanner(),
      tools: toolRegistry('never'),
      extraPlugins: [blockingListener]
    } as never)
    expect(settledBlocked.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(settledBlocked.response).toContain(
      'The call was blocked before it started'
    )
  })

  it('rewires a throwing control listener and ignores capability failures at turn/end', async () => {
    const controlThrower: KernelPlugin = {
      name: 'control.endboom',
      kind: 'control',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'turn/end',
          async () => {
            throw new Error('end failed')
          }
        )
      }
    } as never
    const rewired = await runWith({ extraPlugins: [controlThrower] })
    expect(rewired.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(rewired.response).toBe(
      'Execution could not be completed because control.endboom failed: end failed.'
    )

    const capabilityThrower: KernelPlugin = {
      name: 'capability.endboom',
      kind: 'capability',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'turn/end',
          async () => {
            throw new Error('observability failed')
          }
        )
      }
    } as never
    const tolerated = await runWith({ extraPlugins: [capabilityThrower] })
    expect(tolerated.stopReason).toBe('COMPLETED')
  })

  it('degrades a turn whose closing record was lost, keeping prior stops', async () => {
    const failingLog = {
      events: [],
      append: async (event: { type?: string }) => {
        if (event.type === 'turn/end') {
          throw new Error('turn record lost')
        }
      }
    }
    const lostResponse =
      'Kernel log could not record the turn: turn record lost.'

    const completed = await runWith({ log: failingLog })
    expect(completed.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(completed.response).toBe(lostResponse)

    const sameResponse: KernelPlugin = {
      name: 'control.blocker',
      kind: 'control',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'turn/before-step',
          async () => stop('POLICY_DENIED', lostResponse)
        )
      }
    } as never
    const stoppedSame = await runWith({
      log: failingLog,
      extraPlugins: [sameResponse]
    })
    expect(stoppedSame.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(stoppedSame.response).toBe(lostResponse)

    const differentResponse: KernelPlugin = {
      name: 'control.blocker',
      kind: 'control',
      apply: (ctx: never) => {
        ;(ctx as never as { on: (p: string, fn: unknown) => void }).on(
          'turn/before-step',
          async () => stop('POLICY_DENIED', 'blocked early')
        )
      }
    } as never
    const stoppedDifferent = await runWith({
      log: failingLog,
      extraPlugins: [differentResponse]
    })
    expect(stoppedDifferent.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(stoppedDifferent.response).toBe(
      `${lostResponse} The turn had already stopped (POLICY_DENIED): blocked early`
    )
  })
})

function toolPlanner() {
  return {
    decideNextStep: async () => ({
      action: 'CALL_TOOL',
      toolInvocation: { toolId: 'synthetic.tool', toolVersion: 'v1' }
    })
  }
}

function toolRegistry(output: unknown) {
  return {
    list: () => [descriptor],
    resolve: () => ({
      ...descriptor,
      execute: async () => ({ status: 'SUCCEEDED', output })
    })
  }
}
