// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { RuntimeInput, ToolDefinition } from '@cvg/harness-contracts'
import { ScriptedModelGateway } from '@cvg/harness-orchestrator'
import {
  InMemoryKernelLog,
  KernelRuntime,
  standardKernelPlugins,
  type HookPoint,
  type KernelGate,
  type KernelPlugin
} from '../../packages/harness/src/kernel/index.ts'
import {
  RecordingAudit,
  RecordingTelemetry
} from '../support/governed-test-kit/index.js'

const TOOL = 'synthetic.listener.read'
const PLUGIN = 'synthetic.failing-listener'
const FAILURE = 'synthetic hook failure'

function input(): RuntimeInput {
  return {
    agent: {
      id: 'agent.listener' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Synthetic listener conformance',
      instructions: ['synthetic only'],
      skills: [],
      tools: [TOOL],
      policies: ['synthetic-only']
    },
    tenantId:
      'tenant_00000000-0000-4000-8000-000000000096' as RuntimeInput['tenantId'],
    executionId: 'exec_listener',
    conversationId: 'conversation_listener' as RuntimeInput['conversationId'],
    sessionId: 'session_listener' as RuntimeInput['sessionId'],
    correlationId: 'correlation_listener' as RuntimeInput['correlationId'],
    traceId: 'trace_listener' as RuntimeInput['traceId'],
    userMessage: 'Synthetic request',
    context: {
      values: {},
      sourceIds: ['synthetic'],
      capturedAt: '2026-10-27T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-27T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30_000,
      maxCostUsd: 1,
      maxTokens: 4_000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    },
    runtimeProfile: 'single_pass'
  }
}

async function build(
  plugin: KernelPlugin,
  respond = false,
  body?: () => Promise<void>
) {
  const calls: string[] = []
  const log = new InMemoryKernelLog()
  const scripted = new ScriptedModelGateway({ responses: ['synthetic answer'] })
  const tool: ToolDefinition = {
    id: TOOL,
    version: 'v1',
    description: 'Synthetic in-memory read',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async () => {
      calls.push('body')
      await body?.()
      return { status: 'SUCCEEDED', output: { ok: true } }
    }
  }
  const runtime = await KernelRuntime.boot(
    standardKernelPlugins({
      orchestrator: {
        decideNextStep: async () =>
          respond
            ? { action: 'RESPOND' }
            : {
                action: 'CALL_TOOL',
                toolInvocation: {
                  toolId: TOOL,
                  input: {},
                  operationKey: 'listener-op'
                }
              }
      },
      modelGateway: {
        complete: (request) => {
          calls.push('model')
          return scripted.complete(request)
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
        request: async () => ({
          status: 'DENIED',
          reason: 'synthetic unused approval'
        })
      },
      tools: {
        list: () => [tool],
        resolve: (id) => (id === TOOL ? tool : undefined)
      },
      audit: new RecordingAudit(),
      telemetry: new RecordingTelemetry(),
      log,
      effects: {
        started: () => {
          calls.push('started')
        },
        finished: (_ref, outcome) => {
          calls.push(`finished:${outcome}`)
        }
      },
      plugins: [plugin]
    })
  )
  return { runtime, calls, log }
}

const gatePoints = [
  'turn/before-step',
  'model/before-call',
  'tool/pre-execute'
] as const

describe('SPEC0181 I7: public runtime normalizes listener failures', () => {
  for (const point of gatePoints) {
    for (const mode of ['sync', 'async'] as const) {
      it(`${point}: ${mode} failure after next waits for a pending gate`, async () => {
        const events: string[] = []
        let enter!: () => void
        let release!: () => void
        const entered = new Promise<void>((resolve) => {
          enter = resolve
        })
        const released = new Promise<void>((resolve) => {
          release = resolve
        })
        const { runtime, calls, log } = await build(
          {
            name: PLUGIN,
            kind: 'capability',
            apply(ctx) {
              ctx.on(
                point,
                (_state: unknown, next: () => Promise<KernelGate>) => {
                  const delegated = next()
                  if (mode === 'sync') throw new Error(FAILURE)
                  return delegated.then(() => {
                    throw new Error(FAILURE)
                  })
                }
              )
              ctx.on(
                point,
                async (_state: unknown, next: () => Promise<KernelGate>) => {
                  events.push('downstream:start')
                  enter()
                  await released
                  events.push('downstream:end')
                  return next()
                }
              )
            }
          },
          point === 'model/before-call'
        )
        const execution = runtime.execute(input()).then((result) => {
          events.push('returned')
          return result
        })
        void execution.catch(() => undefined)
        try {
          await entered
          // Drain the event loop while the downstream gate is held. Returning
          // early would expose a result while plugin control work still runs.
          await new Promise<void>((resolve) => setImmediate(resolve))
          expect(events).toEqual(['downstream:start'])
          expect(calls).toEqual([])
          release()
          const result = await execution
          expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          expect(result.response).toContain(PLUGIN)
          expect(result.response).toContain(FAILURE)
          expect(events).toEqual([
            'downstream:start',
            'downstream:end',
            'returned'
          ])
          expect(calls).toEqual([])
          if (point === 'tool/pre-execute')
            expect(
              log.events.filter((event) => event.type === 'tool/result')
            ).toEqual([expect.objectContaining({ outcome: 'not_started' })])
        } finally {
          release()
          await execution.catch(() => undefined)
          await runtime.dispose()
        }
      })
    }
  }

  for (const point of [...gatePoints, 'tool/execute'] as const) {
    for (const mode of ['sync', 'async'] as const) {
      it(`${point}: ${mode} failure before next starts no capability`, async () => {
        const plugin: KernelPlugin = {
          name: PLUGIN,
          kind: 'capability',
          apply(ctx) {
            const fail = () => {
              throw new Error(FAILURE)
            }
            ctx.on(point, mode === 'sync' ? fail : async () => fail())
          }
        }
        const { runtime, calls, log } = await build(
          plugin,
          point === 'model/before-call'
        )
        try {
          const result = await runtime.execute(input())
          expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
          expect(result.response).toContain(PLUGIN)
          expect(result.response).toContain(FAILURE)
          expect(result.toolCalls).toBe(0)
          expect(calls).toEqual([])
          const toolResults = log.events.filter(
            (event) => event.type === 'tool/result'
          )
          if (point.startsWith('tool/'))
            expect(toolResults).toEqual([
              expect.objectContaining({ outcome: 'not_started' })
            ])
        } finally {
          await runtime.dispose()
        }
      })
    }
  }

  it('failure after awaited dispatch settles one effect and reports failure', async () => {
    const { runtime, calls, log } = await build({
      name: PLUGIN,
      kind: 'capability',
      apply(ctx) {
        ctx.on('tool/execute', async (_call, next) => {
          await next()
          throw new Error(FAILURE)
        })
      }
    })
    try {
      const result = await runtime.execute(input())
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(result.response).toContain(PLUGIN)
      expect(result.response).toContain(FAILURE)
      expect(result.toolCalls).toBe(1)
      expect(calls).toEqual(['started', 'body', 'finished:threw'])
      expect(
        log.events.filter((event) => event.type === 'tool/result')
      ).toEqual([expect.objectContaining({ outcome: 'threw' })])
    } finally {
      await runtime.dispose()
    }
  })

  it('sync throw after next observes the pending body before closing its ledger', async () => {
    let enter!: () => void
    let release!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const { runtime, calls, log } = await build(
      {
        name: PLUGIN,
        kind: 'capability',
        apply(ctx) {
          ctx.on('tool/execute', (_call, next) => {
            void next()
            throw new Error(FAILURE)
          })
        }
      },
      false,
      async () => {
        enter()
        await released
      }
    )
    // Convert rejection to data immediately so the failing baseline cannot
    // leave an unhandled rejection while the synthetic body is held.
    const execution = runtime.execute(input()).then(
      (result) => ({ result }),
      (error) => ({ error })
    )
    try {
      await entered
      expect(calls).toEqual(['started', 'body'])
      release()
      const outcome = await execution
      expect(outcome).toHaveProperty('result.stopReason', 'TOOL_FAILURE')
      expect(outcome).toHaveProperty('result.toolCalls', 1)
      expect(calls).toEqual(['started', 'body', 'finished:threw'])
      expect(
        log.events.filter((event) => event.type === 'tool/result')
      ).toEqual([expect.objectContaining({ outcome: 'threw' })])
    } finally {
      release()
      await execution
      await runtime.dispose()
    }
  })

  it('correct listeners keep one dispatch and one settlement', async () => {
    const visited: HookPoint[] = []
    const { runtime, calls } = await build({
      name: 'synthetic.delegating-listener',
      kind: 'capability',
      apply(ctx) {
        ctx.on('turn/before-step', (_state, next) => {
          visited.push('turn/before-step')
          return next()
        })
        ctx.on('tool/pre-execute', (_state, next) => {
          visited.push('tool/pre-execute')
          return next()
        })
        ctx.on('tool/execute', (_state, next) => {
          visited.push('tool/execute')
          return next()
        })
      }
    })
    try {
      const result = await runtime.execute(input())
      expect(result.stopReason).toBe('COMPLETED')
      expect(visited).toEqual([
        'turn/before-step',
        'tool/pre-execute',
        'tool/execute'
      ])
      expect(calls).toEqual(['started', 'body', 'finished:succeeded'])
    } finally {
      await runtime.dispose()
    }
  })
})
