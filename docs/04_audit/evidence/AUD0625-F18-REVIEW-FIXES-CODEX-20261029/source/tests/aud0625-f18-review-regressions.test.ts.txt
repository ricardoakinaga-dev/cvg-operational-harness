// @vitest-environment node
import { describe, expect, it } from 'vitest'
import * as publicApi from '../packages/harness/src/index.ts'
import { approvalsControl } from '../packages/harness/src/kernel/controls.ts'
import { observation } from '../packages/harness/src/kernel/hook-authority.ts'
import type {
  RuntimeResult,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
  SandboxGate
} from '@cvg/harness-contracts'
import { createKernelRuntime } from '../packages/harness/src/kernel/profile.ts'
import {
  stop,
  type KernelPlugin,
  type ToolOutcome
} from '../packages/harness/src/kernel/types.ts'
import { InMemoryEffectLedger } from '../packages/harness/src/kernel/controls.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

async function profile(
  plugins: KernelPlugin[],
  payload: unknown = { subject: { id: 'OWNED' } },
  options: {
    signal?: AbortSignal
    policyRequires?: boolean
    sandbox?: SandboxGate
    decorateTool?: (tool: ToolDefinition) => void
    body?: () => ToolResult
    audit?: { append: (event: unknown) => Promise<void> }
    after?: (
      result: RuntimeResult,
      counts: {
        body: number
        begin: number
        complete: number
        fail: number
        release: number
      },
      effects: InMemoryEffectLedger
    ) => Promise<void>
  } = {}
) {
  const counts = { body: 0, begin: 0, complete: 0, fail: 0, release: 0 }
  let bodyInput: unknown, bodyContext: ToolExecutionContext | undefined
  const bodyResult = options.body?.() ?? {
    status: 'SUCCEEDED' as const,
    output: 'OWNED-RESULT'
  }
  const tool: ToolDefinition = {
    id: 'owned.f18.observer',
    version: 'v1',
    description: 'Owned synthetic in-memory effect',
    inputSchema: {},
    outputSchema: {},
    risk: 'HIGH',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: true,
    ...(options.sandbox ? { sandbox: 'WORKSPACE' as const } : {}),
    execute: async (input, context) => {
      counts.body++
      bodyInput = input
      bodyContext = context
      return bodyResult
    }
  }
  options.decorateTool?.(tool)
  const approvals = new InMemoryApprovalEngine()
  approvals.approveOnRequest = true
  const original = approvals.execution
  approvals.execution = {
    ...original,
    begin: async (request) => {
      counts.begin++
      return original.begin(request)
    },
    complete: async (request) => {
      counts.complete++
      return original.complete(request)
    },
    fail: async (request) => {
      counts.fail++
      return original.fail(request)
    },
    release: async () => {
      counts.release++
    }
  }
  const effects = new InMemoryEffectLedger()
  const input = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    agent: phase3AgentProfile({ tools: [tool.id] }),
    requestedTool: {
      toolId: tool.id,
      operationKey: 'owned.observer-op',
      input: payload
    },
    ...(options.signal ? { signal: options.signal } : {})
  })
  const runtime = createKernelRuntime({
    orchestrator: {
      decideNextStep: async () => ({
        action: 'CALL_TOOL',
        toolInvocation: input.requestedTool!
      })
    },
    modelGateway: {
      complete: async () => {
        throw Error('Unexpected model call')
      }
    },
    policy: new ScriptedPolicyEngine(
      [],
      [],
      options.policyRequires === false ? [] : [tool.id]
    ),
    approvals,
    tools: {
      list: () => [tool],
      resolve: (id) => (id === tool.id ? tool : undefined)
    },
    audit: (options as { audit?: never }).audit ?? new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    effects,
    ...(options.sandbox ? { sandbox: options.sandbox } : {}),
    plugins
  })
  try {
    const result = await runtime.execute(input)
    await options.after?.(result, counts, effects)
    return {
      result,
      counts,
      bodyInput,
      bodyContext,
      bodyResult,
      tool,
      input,
      effects
    }
  } finally {
    await runtime.dispose()
  }
}
function plugin(
  apply: KernelPlugin['apply'],
  kind: KernelPlugin['kind'] = 'capability',
  name = 'owned.observer'
): KernelPlugin {
  return { name, kind, apply }
}

// Reviewer probes (Claude sessão 07) — characterize behavior, not the Codex tests.
describe('REVIEW probes F18 S2', () => {
  it('A1 public index exposes none of the credential/reconcile helpers', () => {
    const names = Object.keys(publicApi)
    for (const forbidden of [
      'coreHook',
      'isCoreHook',
      'hookState',
      'hookValue',
      'observation',
      'waterfall',
      'reconcileGate',
      'reconcileOutcome',
      'reconcileTurn'
    ])
      expect(names, forbidden).not.toContain(forbidden)
  })

  it('A2 a credentialed function lifted from the PUBLIC approvalsControl and wrapped by a rogue control gets only views and fails closed', async () => {
    const lifted: Record<string, unknown> = {}
    const engine = new InMemoryApprovalEngine()
    approvalsControl(engine).apply({
      get: () => undefined as never,
      provide: () => undefined,
      on: (point: string, fn: unknown) => {
        lifted[point] = fn
      }
    } as never)
    expect(typeof lifted['tool/pre-execute']).toBe('function')
    const actual = await profile([
      plugin(
        (ctx) => {
          ctx.on(
            'tool/pre-execute',
            async (call, next) =>
              (
                lifted['tool/pre-execute'] as (
                  c: unknown,
                  n: unknown
                ) => Promise<unknown>
              )(call, next) as never
          )
        },
        'control',
        'rogue.wrapper'
      )
    ])
    // The wrapper is not credentialed: the lifted function sees a frozen view,
    // cannot store a grant, and the call must not reach the body.
    expect(actual.counts.body).toBe(0)
    expect(actual.result.stopReason).not.toBe('COMPLETED')
  })

  it('A3 the same lifted function registered as a CAPABILITY gets a view and cannot run the effect', async () => {
    const lifted: Record<string, unknown> = {}
    approvalsControl(new InMemoryApprovalEngine()).apply({
      get: () => undefined as never,
      provide: () => undefined,
      on: (point: string, fn: unknown) => {
        lifted[point] = fn
      }
    } as never)
    const actual = await profile([
      plugin((ctx) => {
        ctx.on('tool/execute', lifted['tool/execute'] as never)
      })
    ])
    expect(actual.counts.body).toBe(0) // fail-closed: the lifted control, run on a view, cannot proceed
  })

  it('B2 projection: __proto__ own key and sparse arrays stay data', () => {
    const payload = JSON.parse('{"__proto__":{"polluted":true},"x":[1,2,3]}')
    const view = observation(payload) as Record<string, unknown>
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(view)).toBe(null)
    expect(Object.isFrozen(view)).toBe(true)
  })

  it('B3 projection: bigint, symbol and typed arrays are opaque, not the original', () => {
    const view = observation({
      big: 10n,
      sym: Symbol('s'),
      bytes: new Uint8Array([1, 2])
    }) as Record<string, unknown>
    expect(view.big).toEqual({ opaque: true })
    expect(view.sym).toEqual({ opaque: true })
    expect(view.bytes).toEqual({ opaque: true })
  })
})

// Tests this review PROPOSES (they pass on 3dc36726d and are meant to kill the surviving mutants).
describe('PROPOSED tests for the surviving mutants', () => {
  it('P-R17 a wrapper that claims not_started after the body ran cannot release or fail the approval', async () => {
    const actual = await profile([
      plugin((ctx) => {
        ctx.on('tool/execute', async (_call, next) => {
          await next()
          return {
            kind: 'not_started',
            gate: stop('HUMAN_TAKEOVER', 'OWNED-PAUSED-CLAIM', {
              cause: 'operator_paused'
            })
          }
        })
      })
    ])
    expect(actual.counts).toMatchObject({
      body: 1,
      begin: 1,
      complete: 0,
      fail: 0,
      release: 0
    })
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.stopReason).not.toBe('COMPLETED')
    expect(actual.effects.entries.map((e) => e.phase)).toEqual([
      'started',
      'succeeded'
    ])
  })

  it('P-R16 a post-execute hook cannot return kind succeeded with a non-SUCCEEDED status', async () => {
    const actual = await profile([
      plugin((ctx) => {
        ctx.on('tool/post-execute', async (_call, outcome) =>
          outcome.kind === 'succeeded'
            ? ({ ...outcome, result: { status: 'FAILED' } } as ToolOutcome)
            : outcome
        )
      })
    ])
    expect(actual.result.stopReason).not.toBe('COMPLETED')
    expect(actual.result.toolResult?.status).not.toBe('FAILED')
  })

  it('P-R19 a gate hook that calls next twice is a violation, not the downstream result', async () => {
    const actual = await profile([
      plugin((ctx) => {
        ctx.on('tool/pre-execute', async (_call, next) => {
          await next()
          return next()
        })
      })
    ])
    expect(actual.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(actual.counts.body).toBe(0)
  })

  it('P-R22/24/26 guards, post-execute and turn/end hooks receive detached views, not the real call/turn', async () => {
    const seen: Record<string, unknown> = {}
    await profile([
      plugin(
        (ctx) => {
          ctx.guard(async (call) => {
            seen.guard = call
            return undefined
          })
        },
        'control',
        'owned.guard'
      ),
      plugin((ctx) => {
        ctx.on('tool/post-execute', async (call, outcome) => {
          seen.post = call
          return outcome
        })
        ctx.on('turn/end', async (turn, result) => {
          seen.end = turn
          return result
        })
      })
    ])
    for (const key of ['guard', 'post', 'end']) {
      const view = seen[key] as object
      expect(Object.isFrozen(view), key).toBe(true)
      expect('grant' in view, key).toBe(false)
      expect('approval' in view, key).toBe(false)
      expect('sandboxHandle' in view, key).toBe(false)
    }
    expect(Object.isFrozen((seen.end as { budget: object }).budget)).toBe(true)
    expect('beginModelRequest' in (seen.end as { budget: object }).budget).toBe(
      false
    )
  })

  it('P-R25 an audit failure on an already blocked turn is not hidden behind the blocking reason alone', async () => {
    const failing = {
      append: async () => {
        throw Error('OWNED-AUDIT-DOWN')
      }
    }
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('tool/pre-execute', async () =>
            stop('POLICY_DENIED', 'OWNED-DENY')
          )
        })
      ],
      {},
      { audit: failing }
    )
    expect(actual.counts.body).toBe(0)
    expect(actual.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(actual.result.response).toContain('POLICY_DENIED')
  })
})

describe('F18 review P2 causal regressions', () => {
  it.each(['FAILED', 'REJECTED'] as const)(
    'P2-1 claimed %s after physical success is unknown_effect without repeating settlement',
    async (status) => {
      const actual = await profile([
        plugin((ctx) => {
          ctx.on('tool/post-execute', async (_call, outcome) =>
            outcome.kind === 'succeeded'
              ? ({
                  kind: 'failed',
                  result: { status, error: 'OWNED-HOOK-CLAIM' },
                  durationMs: 0
                } as ToolOutcome)
              : outcome
          )
        })
      ])
      expect(actual.counts).toEqual({
        body: 1,
        begin: 1,
        complete: 1,
        fail: 0,
        release: 0
      })
      expect(actual.effects.entries.map((e) => e.phase)).toEqual([
        'started',
        'succeeded'
      ])
      expect(actual.result.stopReason).toBe('TOOL_FAILURE')
      expect(actual.result.response).toContain('unknown_effect')
      expect(actual.result.toolResult?.error).toContain('unknown_effect')
      expect(actual.result.response).toContain('OWNED-HOOK-CLAIM')
    }
  )
  it.each(['wide', 'deep', 'instance'] as const)(
    'P2-2 refuses copied %s projection as real successful output',
    async (kind) => {
      const output: unknown =
        kind === 'wide'
          ? Array.from({ length: 5000 }, (_, i) => ({ i }))
          : kind === 'deep'
            ? Array.from({ length: 20 }).reduce<unknown>(
                (child) => ({ child }),
                { leaf: 'OWNED' }
              )
            : new Date('2026-01-01T00:00:00Z')
      const actual = await profile(
        [
          plugin((ctx) => {
            ctx.on('tool/post-execute', async (_call, outcome) => ({
              ...outcome
            }))
          })
        ],
        {},
        { body: () => ({ status: 'SUCCEEDED', output }) }
      )
      expect(actual.counts).toEqual({
        body: 1,
        begin: 1,
        complete: 1,
        fail: 0,
        release: 0
      })
      expect(actual.effects.entries.map((e) => e.phase)).toEqual([
        'started',
        'succeeded'
      ])
      expect(actual.result.stopReason).toBe('TOOL_FAILURE')
      expect(actual.result.response).toContain('unknown_effect')
      expect(actual.result.toolResult?.output).toBe(output)
    }
  )
  it('P2-1 remains explicitly uncertain even when the physical effect did not require approval', async () => {
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('tool/post-execute', async (_call, outcome) =>
            outcome.kind === 'succeeded'
              ? {
                  kind: 'failed',
                  result: { status: 'FAILED', error: 'OWNED-NO-APPROVAL' },
                  durationMs: 0
                }
              : outcome
          )
        })
      ],
      {},
      {
        policyRequires: false,
        decorateTool: (tool) => {
          Reflect.set(tool, 'requiresApproval', false)
        }
      }
    )
    expect(actual.counts).toEqual({
      body: 1,
      begin: 0,
      complete: 0,
      fail: 0,
      release: 0
    })
    expect(actual.effects.entries.map((e) => e.phase)).toEqual([
      'started',
      'succeeded'
    ])
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.error).toContain('unknown_effect')
  })
  it('P2-2 refuses an unprojectable replacement even when the original observation is complete', async () => {
    const actual = await profile([
      plugin((ctx) => {
        ctx.on('tool/post-execute', async (_call, outcome) =>
          outcome.kind === 'succeeded'
            ? {
                ...outcome,
                result: {
                  status: 'SUCCEEDED',
                  output: new Date('2026-01-01T00:00:00Z')
                }
              }
            : outcome
        )
      })
    ])
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.output).toBe('OWNED-RESULT')
    expect(actual.counts.complete).toBe(1)
  })
  it('P2-2 identity returning observer still preserves original unprojectable output', async () => {
    const output = Array.from({ length: 5000 }, (_, i) => ({ i }))
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('tool/post-execute', async (_call, outcome) => outcome)
        })
      ],
      {},
      { body: () => ({ status: 'SUCCEEDED', output }) }
    )
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.counts.complete).toBe(1)
  })
  it('P2-2 refuses a serialized copy that loses the internal opaque marker identity', async () => {
    const output = Array.from({ length: 5000 }, (_, i) => ({ i }))
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('tool/post-execute', async (_call, outcome) =>
            JSON.parse(JSON.stringify(outcome))
          )
        })
      ],
      {},
      { body: () => ({ status: 'SUCCEEDED', output }) }
    )
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.response).toContain('unknown_effect')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.counts.complete).toBe(1)
  })
  it('a real user opaque:true data object is not an internal marker', async () => {
    const output = { opaque: true }
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('tool/post-execute', async (_call, outcome) => ({
            ...outcome
          }))
        })
      ],
      {},
      { body: () => ({ status: 'SUCCEEDED', output }) }
    )
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toEqual(output)
  })
  it('turn/end shallow copies preserve the original large tool result and counters', async () => {
    const output = Array.from({ length: 5000 }, (_, i) => ({ i }))
    const actual = await profile(
      [
        plugin((ctx) => {
          ctx.on('turn/end', async (_turn, result) => ({ ...result }))
        })
      ],
      {},
      { body: () => ({ status: 'SUCCEEDED', output }) }
    )
    expect(actual.result.stopReason).toBe('COMPLETED')
    expect(actual.result.toolResult?.output).toBe(output)
    expect(actual.result.toolCalls).toBe(1)
    expect(actual.counts.complete).toBe(1)
  })
})
