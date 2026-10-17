import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  ExecutionCheckpoint,
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
  type KernelLogEvent
} from '../kernel/index.ts'
import {
  PHASE3_TOOL_RESERVE,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

/**
 * AUD-0597 (Codex) regressions for KPLG-004 part A. Each case reproduces a
 * confirmed finding through the public `execute` of the runtime; the probes
 * come from `docs/04_audit/evidence/AUD-KPLG004-20261006/probes.test.ts.txt`.
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
  readonly pending?: () => boolean
  readonly logFailsOn?: KernelLogEvent['type']
  readonly requiresApproval?: boolean
  readonly maxToolCalls?: number
}

function iterative(options: IterativeOptions = {}) {
  const order: string[] = []
  const pause = new InMemoryPauseSwitch()
  const effects = new InMemoryEffectLedger()
  const log = new InMemoryKernelLog()
  class Store extends InMemoryExecutionStepStore {
    override async saveCheckpoint(checkpoint: ExecutionCheckpoint) {
      await super.saveCheckpoint(checkpoint)
      if (checkpoint.state.pendingDecision && !checkpoint.state.stopReason) {
        order.push('checkpoint')
        options.checkpoint?.()
      }
    }
  }
  const store = new Store()
  const approvals: ApprovalEngine = {
    request: async () =>
      options.pending?.()
        ? {
            status: 'PENDING',
            approvalId: 'approval-audit' as never,
            reason: 'waiting'
          }
        : {
            status: 'APPROVED',
            approvalId: 'approval-audit' as never,
            reason: 'synthetic'
          },
    execution: {
      begin: async () => {
        order.push('reserve')
        options.reserve?.()
        return { reservationId: 'reservation-audit' } as never
      },
      complete: async () => void order.push('complete'),
      fail: async () => void order.push('fail'),
      uncertain: async () => void order.push('uncertain')
    }
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
    requiresApproval: options.requiresApproval ?? true,
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
    stepStore: store,
    pause,
    effects,
    log: {
      append: async (event) => {
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
  return { run, order, pause, effects, log }
}

const approvalResume = {
  resume: { kind: 'approval', approvalId: 'approval-audit' }
} as const

describe('AUD-0597 regressions — iterative runtime on the kernel pipeline', () => {
  it('control: checkpoint precedes the reservation and the body runs once', async () => {
    const h = iterative()
    const result = await h.run()
    expect(result.stopReason).toBe('COMPLETED')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'body', 'complete'])
  })

  it('F01 — pause acknowledged during the checkpoint blocks reservation and body', async () => {
    const h = iterative({ checkpoint: () => h.pause.pause(input.tenantId) })
    const result = await h.run()
    expect(result.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.order).not.toContain('reserve')
    expect(h.order).not.toContain('body')
    expect(h.effects.entries).toEqual([])
  })

  it('F01 — pause acknowledged during the reservation releases it without a body', async () => {
    const h = iterative({ reserve: () => h.pause.pause(input.tenantId) })
    const result = await h.run()
    expect(result.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'fail'])
    expect(h.effects.entries).toEqual([])
  })

  it('F02 — cancellation during the checkpoint neither reserves nor records an effect', async () => {
    const controller = new AbortController()
    const h = iterative({ checkpoint: () => controller.abort() })
    const result = await h.run({ signal: controller.signal })
    expect(result.stopReason).toBe('CANCELLED')
    expect(h.order).toEqual(['checkpoint'])
    expect(h.effects.entries).toEqual([])
  })

  it('F02 — cancellation during the reservation releases it as certain, never uncertain', async () => {
    const controller = new AbortController()
    const h = iterative({ reserve: () => controller.abort() })
    const result = await h.run({ signal: controller.signal })
    expect(result.stopReason).toBe('CANCELLED')
    expect(h.order).toEqual(['checkpoint', 'reserve', 'fail'])
    expect(h.effects.entries).toEqual([])
  })

  it('F03 — operator pause keeps a pending approval resumable', async () => {
    let pending = true
    const h = iterative({ pending: () => pending })
    const first = await h.run()
    expect(first.stopReason).toBe('APPROVAL_REQUIRED')
    pending = false
    h.pause.pause(input.tenantId)
    const paused = await h.run(approvalResume)
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    expect(h.order).not.toContain('body')
    h.pause.resume(input.tenantId)
    const resumed = await h.run(approvalResume)
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(h.order.filter((value) => value === 'body')).toHaveLength(1)
  })

  it('F03 + recount — pause after the checkpoint resumes without spending the tool budget twice', async () => {
    let pauseOnce = true
    const h = iterative({
      maxToolCalls: 1,
      checkpoint: () => {
        if (pauseOnce) h.pause.pause(input.tenantId)
        pauseOnce = false
      }
    })
    const paused = await h.run()
    expect(paused.stopReason).toBe('HUMAN_TAKEOVER')
    h.pause.resume(input.tenantId)
    const resumed = await h.run()
    expect(resumed.stopReason).toBe('COMPLETED')
    expect(h.order.filter((value) => value === 'body')).toHaveLength(1)
  })

  it('F04 — a failed tool-result log never reads as success and keeps the effect fact', async () => {
    const h = iterative({ logFailsOn: 'tool/result' })
    const result = await h.run()
    expect(h.order.filter((value) => value === 'body')).toHaveLength(1)
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.toolCalls).toBe(1)
    const replay = await h.run()
    expect(replay.stopReason).toBe('STATE_CONFLICT')
    expect(h.order.filter((value) => value === 'body')).toHaveLength(1)
  })
})

function singlePass(options: {
  readonly plugins?: Parameters<typeof standardKernelPlugins>[0]['plugins']
  readonly respond?: boolean
  readonly logFailsOn?: KernelLogEvent['type']
  readonly sent?: (request: unknown) => void
}) {
  const log = new InMemoryKernelLog()
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
        options.respond
          ? ({ action: 'RESPOND' } as const)
          : ({
              action: 'CALL_TOOL',
              toolInvocation: {
                toolId: tool.id,
                input: {},
                operationKey: 'aud0597'
              }
            } as const)
    },
    modelGateway: {
      complete: async (request) => {
        const { signal, ...rest } = request
        void signal
        options.sent?.(rest)
        return {
          text: 'synthetic',
          provider: 'synthetic',
          model: 'synthetic',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0
        }
      }
    },
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic',
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
    body: () => body
  }
}

describe('AUD-0597 regressions — kernel single-turn loop', () => {
  it('F05 — the logged model request equals the request actually sent', async () => {
    let sent: unknown
    const h = singlePass({
      respond: true,
      sent: (request) => {
        sent = request
      },
      plugins: [
        {
          name: 'control.rewrite',
          kind: 'control',
          apply: (ctx) =>
            void ctx.on('model/before-call', async (call, next) => {
              Object.assign(call.request, {
                messages: [{ role: 'user', content: 'rewritten synthetic' }]
              })
              return next()
            })
        }
      ]
    })
    const result = await h.run()
    expect(result.stopReason).toBe('COMPLETED')
    const logged = h.log.events.find((event) => event.type === 'model/request')
    expect(logged?.type === 'model/request' ? logged.request : null).toEqual(
      sent
    )
  })

  it('F06 — a guard denial closes the call with exactly one not-started result', async () => {
    const h = singlePass({
      plugins: [
        {
          name: 'control.deny',
          kind: 'control',
          apply: (ctx) => void ctx.guard(() => 'synthetic denial')
        }
      ]
    })
    const result = await h.run()
    expect(result.stopReason).toBe('POLICY_DENIED')
    expect(h.body()).toBe(0)
    const results = h.log.events.filter((event) => event.type === 'tool/result')
    expect(results).toEqual([
      expect.objectContaining({ type: 'tool/result', outcome: 'not_started' })
    ])
  })

  it('F04 — a failed tool-result log fails closed and keeps the tool result', async () => {
    const h = singlePass({ logFailsOn: 'tool/result' })
    const result = await h.run()
    expect(h.body()).toBe(1)
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.toolCalls).toBe(1)
    expect(result.toolResult).toMatchObject({ status: 'SUCCEEDED' })
  })

  it('F04 — a failed turn-end log fails closed', async () => {
    const h = singlePass({ logFailsOn: 'turn/end' })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('F04 — a failed model-result log fails closed and still counts the call', async () => {
    const h = singlePass({ respond: true, logFailsOn: 'model/result' })
    const result = await h.run()
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.modelCalls).toBe(1)
  })
})
