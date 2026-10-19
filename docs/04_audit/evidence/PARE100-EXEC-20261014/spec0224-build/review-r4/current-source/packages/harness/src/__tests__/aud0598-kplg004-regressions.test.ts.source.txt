import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  ApprovalExecutionPort,
  ExecutionCheckpoint,
  ExecutionStep,
  RuntimeInput,
  ToolDefinition
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
import {
  InMemoryEffectLedger,
  InMemoryKernelLog,
  InMemoryPauseSwitch,
  KernelRuntime,
  standardKernelPlugins,
  type KernelLogEvent,
  type KernelPlugin
} from '../kernel/index.ts'
import {
  PHASE3_TOOL_RESERVE,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

/**
 * AUD-0598 (Codex) regressions for the AUD-0597 remediation. The durable
 * approval cases (R01/R02 with the real adapter and state machine) live in
 * `tests/conformance/durable-approval-resume.conformance.test.ts`; this file
 * covers the port contract and the closing record of a call (R03/R04).
 */

const input = phase3RuntimeInput()
const callTool = {
  decisionType: 'CALL_TOOL',
  reasonCode: 'TOOL_REQUIRED',
  toolId: PHASE3_TOOL_RESERVE,
  toolInput: {}
} as const
const respond = {
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText: 'ok'
} as const

interface IterativeOptions {
  readonly checkpoint?: () => void
  readonly reserve?: () => void
  readonly recordStep?: (step: ExecutionStep) => void
  readonly logFailsOn?: KernelLogEvent['type']
  /** Adds the optional `release` to the execution port. */
  readonly release?: () => Promise<void>
  readonly maxToolCalls?: number
}

function iterative(options: IterativeOptions = {}) {
  const order: string[] = []
  const attempts: KernelLogEvent[] = []
  const pause = new InMemoryPauseSwitch()
  const effects = new InMemoryEffectLedger()
  const log = new InMemoryKernelLog()
  class Store extends InMemoryExecutionStepStore {
    override async saveCheckpoint(checkpoint: ExecutionCheckpoint) {
      if (checkpoint.state.pendingDecision && !checkpoint.state.stopReason) {
        order.push('checkpoint')
        options.checkpoint?.()
      }
      await super.saveCheckpoint(checkpoint)
    }
    override async recordStep(step: ExecutionStep) {
      options.recordStep?.(step)
      await super.recordStep(step)
    }
  }
  const release = options.release
  const execution: ApprovalExecutionPort = {
    begin: async () => {
      order.push('reserve')
      options.reserve?.()
      return { reservationId: 'reservation-audit' } as never
    },
    complete: async () => void order.push('complete'),
    fail: async () => void order.push('fail'),
    uncertain: async () => void order.push('uncertain'),
    ...(release
      ? {
          release: async () => {
            order.push('release')
            await release()
          }
        }
      : {})
  }
  const approvals: ApprovalEngine = {
    request: async () => ({
      status: 'APPROVED',
      approvalId: 'approval-audit' as never,
      reason: 'synthetic'
    }),
    execution
  }
  const tool: ToolDefinition = {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'synthetic only',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: true,
    execute: async () => {
      order.push('body')
      return { status: 'SUCCEEDED', output: { ok: true } }
    }
  }
  const runtime = new IterativeGovernedRuntime({
    orchestrator: new ScriptedOrchestrator({ script: [callTool, respond] }),
    modelGateway: new ScriptedModelGateway({ responses: ['synthetic'] }),
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic',
        policyVersion: 'v1'
      })
    },
    approvals,
    tools: {
      list: () => [tool],
      resolve: (id) => (id === tool.id ? tool : undefined)
    },
    audit: { append: async () => undefined },
    telemetry: { record: () => undefined },
    stepStore: new Store(),
    pause,
    effects,
    log: {
      append: async (event) => {
        attempts.push(event)
        if (event.type === options.logFailsOn) {
          throw new Error(`synthetic ${event.type} log failure`)
        }
        log.append(event)
      }
    }
  })
  const run = (overrides: Partial<RuntimeInput> = {}) =>
    runtime.execute({
      ...input,
      budget: {
        ...input.budget,
        maxToolCalls: options.maxToolCalls ?? input.budget.maxToolCalls
      },
      ...overrides
    })
  const count = (events: readonly KernelLogEvent[], type: string) =>
    events.filter((event) => event.type === type).length
  return { run, order, pause, effects, log, attempts, count }
}

describe('AUD-0598 regressions — approval settlement on pause (R01)', () => {
  it('a pause after the reservation releases it when the port can', async () => {
    let pauseOnce = true
    const h = iterative({
      release: async () => undefined,
      reserve: () => {
        if (pauseOnce) h.pause.pause(input.tenantId)
        pauseOnce = false
      }
    })
    const paused = await h.run()
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'release'])
    expect(h.effects.entries).toEqual([])

    h.pause.resume(input.tenantId)
    const resumed = await h.run()
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(resumed.toolCalls).toBe(1)
    expect(h.order.filter((value) => value === 'body')).toHaveLength(1)
    expect(h.order.at(-1)).toBe('complete')
  })

  it('a failing release falls back to a terminal settlement, never to a body', async () => {
    const h = iterative({
      release: async () => {
        throw new Error('synthetic release outage')
      },
      reserve: () => h.pause.pause(input.tenantId)
    })
    const paused = await h.run()
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'release', 'fail'])
    expect(h.effects.entries).toEqual([])
  })

  it('a cancellation after the reservation is terminal: it fails, never releases', async () => {
    const controller = new AbortController()
    const h = iterative({
      release: async () => undefined,
      reserve: () => controller.abort()
    })
    const result = await h.run({ signal: controller.signal })
    expect(result.stopReason).toBe('CANCELLED')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'fail'])
    expect(h.effects.entries).toEqual([])
  })
})

describe('AUD-0598 regressions — a logged call is always closed (R03)', () => {
  it('a rejected checkpoint closes the call once and never reserves', async () => {
    const h = iterative({
      checkpoint: () => {
        throw new Error('synthetic checkpoint storage outage')
      }
    })
    const result = await h.run()
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(h.order).toEqual(['checkpoint'])
    expect(h.effects.entries).toEqual([])
    expect(h.count(h.log.events, 'tool/call')).toBe(1)
    expect(
      h.log.events.filter((event) => event.type === 'tool/result')
    ).toEqual([
      expect.objectContaining({ type: 'tool/result', outcome: 'not_started' })
    ])
  })

  it('a rejected step record in the same hook closes the call once', async () => {
    const h = iterative({
      recordStep: (step) => {
        if (step.stepType === 'TOOL' && step.status === 'RUNNING') {
          throw new Error('synthetic step storage outage')
        }
      }
    })
    const result = await h.run()
    expect(result.stopReason).toBe('INTERNAL_FAILURE')
    expect(h.order).toEqual(['checkpoint'])
    expect(h.effects.entries).toEqual([])
    expect(h.count(h.log.events, 'tool/call')).toBe(1)
    expect(h.count(h.log.events, 'tool/result')).toBe(1)
  })

  it('a rejected checkpoint with a failing log still attempts the closing record once', async () => {
    const h = iterative({
      logFailsOn: 'tool/result',
      checkpoint: () => {
        throw new Error('synthetic checkpoint storage outage')
      }
    })
    const result = await h.run()
    expect(result.stopReason).not.toBe('COMPLETED')
    expect(h.order).toEqual(['checkpoint'])
    expect(h.count(h.attempts, 'tool/result')).toBe(1)
  })
})

function singleTurn(options: {
  readonly plugins?: readonly KernelPlugin[]
  readonly policy?: 'ALLOW' | 'DENY'
  readonly logFailsOn?: KernelLogEvent['type']
}) {
  const log = new InMemoryKernelLog()
  const attempts: KernelLogEvent[] = []
  let body = 0
  const tool: ToolDefinition = {
    id: PHASE3_TOOL_RESERVE,
    version: 'v1',
    description: 'synthetic only',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async () => {
      body += 1
      return { status: 'SUCCEEDED', output: {} }
    }
  }
  const plugins = standardKernelPlugins({
    orchestrator: {
      decideNextStep: async () =>
        ({
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: tool.id,
            input: {},
            operationKey: 'aud0598'
          }
        }) as const
    },
    modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
    policy: {
      evaluate: async () => ({
        outcome: options.policy ?? 'ALLOW',
        reason: 'synthetic policy',
        policyVersion: 'v1'
      })
    },
    approvals: {
      request: async () => ({ status: 'DENIED', reason: 'unused' })
    },
    tools: { list: () => [tool], resolve: () => tool },
    audit: { append: async () => undefined },
    telemetry: { record: () => undefined },
    log: {
      append: (event) => {
        attempts.push(event)
        if (event.type === options.logFailsOn) {
          throw new Error(`synthetic ${event.type} log failure`)
        }
        log.append(event)
      }
    },
    ...(options.plugins ? { plugins: options.plugins } : {})
  })
  return {
    run: async () =>
      (await KernelRuntime.boot(plugins)).execute({
        ...input,
        runtimeProfile: 'single_pass'
      }),
    log,
    attempts,
    body: () => body
  }
}

const denyGuard: KernelPlugin = {
  name: 'control.deny',
  kind: 'control',
  apply: (ctx) => void ctx.guard(() => 'synthetic denial')
}

describe('AUD-0598 regressions — a lost closing record is reported (R04)', () => {
  it('guard denial whose closing record fails reports insufficient evidence', async () => {
    const h = singleTurn({ plugins: [denyGuard], logFailsOn: 'tool/result' })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('synthetic denial')
    expect(h.body()).toBe(0)
    expect(
      h.attempts.filter((event) => event.type === 'tool/result')
    ).toHaveLength(1)
  })

  it('policy denial whose closing record fails reports insufficient evidence', async () => {
    const h = singleTurn({ policy: 'DENY', logFailsOn: 'tool/result' })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(h.body()).toBe(0)
    expect(
      h.attempts.filter((event) => event.type === 'tool/result')
    ).toHaveLength(1)
  })

  it('control: the same denials with a healthy log keep their own stop reason', async () => {
    const guard = await singleTurn({ plugins: [denyGuard] }).run()
    expect(guard.stopReason).toBe('POLICY_DENIED')
    const policy = await singleTurn({ policy: 'DENY' }).run()
    expect(policy.stopReason).toBe('POLICY_DENIED')
  })

  it('iterative: a pause after the reservation whose closing record fails is not a clean pause', async () => {
    const h = iterative({
      logFailsOn: 'tool/result',
      release: async () => undefined,
      reserve: () => h.pause.pause(input.tenantId)
    })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'release'])
    expect(h.effects.entries).toEqual([])
    expect(h.count(h.attempts, 'tool/result')).toBe(1)
  })

  it('iterative: a pause whose closing record fails is not reported as a clean pause', async () => {
    const h = iterative({
      logFailsOn: 'tool/result',
      checkpoint: () => h.pause.pause(input.tenantId)
    })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(h.order).toEqual(['checkpoint'])
    expect(h.effects.entries).toEqual([])
  })
})
