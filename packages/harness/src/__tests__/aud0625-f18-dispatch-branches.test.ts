import { describe, expect, it } from 'vitest'
import type { ToolDefinition, ToolResult } from '@cvg/harness-contracts'
import { InMemoryEffectLedger } from '../kernel/controls.ts'
import { createKernelRuntime } from '../kernel/profile.ts'
import type { KernelPlugin, ToolOutcome } from '../kernel/types.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

async function dispatch(
  hook: (
    call: unknown,
    next: () => Promise<ToolOutcome>,
    gates: { bodyStarted: Promise<void>; release: () => void }
  ) => Promise<unknown>,
  execute: (started: () => void, released: Promise<void>) => Promise<ToolResult>
) {
  let started!: () => void
  const bodyStarted = new Promise<void>((resolve) => (started = resolve))
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  let bodies = 0
  const tool: ToolDefinition = {
    id: 'owned.dispatch.branches',
    version: 'v1',
    description: 'Owned synthetic in-memory effect',
    inputSchema: {},
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async () => {
      bodies++
      return execute(started, released)
    }
  }
  const input = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    agent: phase3AgentProfile({ tools: [tool.id] }),
    requestedTool: {
      toolId: tool.id,
      operationKey: 'owned.branch-op',
      input: {}
    }
  })
  const plugin: KernelPlugin = {
    name: 'owned.dispatch.hook',
    kind: 'capability',
    apply: (ctx) => {
      ctx.on('tool/execute', (async (call: unknown, next: never) =>
        hook(call, next, { bodyStarted, release })) as never)
    }
  }
  const effects = new InMemoryEffectLedger()
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
    policy: new ScriptedPolicyEngine([], [], []),
    approvals: new InMemoryApprovalEngine(),
    tools: {
      list: () => [tool],
      resolve: (id) => (id === tool.id ? tool : undefined)
    },
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    effects,
    plugins: [plugin]
  })
  try {
    const result = await runtime.execute(input)
    return { result, bodies: () => bodies, effects }
  } finally {
    await runtime.dispose()
  }
}

const done: ToolResult = { status: 'SUCCEEDED', output: 'OWNED' }

describe('F18 dispatch branch behavior', () => {
  it('records a non-Error throw from the tool body as an unknown failure', async () => {
    const actual = await dispatch(
      (_call, next) => next(),
      async () => {
        throw 'plain string'
      }
    )
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
    expect(actual.result.toolResult?.error).toContain('unknown failure')
  })

  it('does not accept a success claimed by a hook that never delegated', async () => {
    const actual = await dispatch(
      async () => ({ kind: 'succeeded', result: done, durationMs: 0 }),
      async () => done
    )
    expect(actual.bodies()).toBe(0)
    expect(actual.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('does not accept an unknown result from a hook that never delegated', async () => {
    const actual = await dispatch(
      async () => ({ kind: 'bogus' }),
      async () => done
    )
    expect(actual.bodies()).toBe(0)
    expect(actual.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(actual.result.response).toContain('Invalid result before dispatch')
  })

  it('rejects a not-started claim that carries a proceed gate', async () => {
    const actual = await dispatch(
      async () => ({ kind: 'not_started', gate: { kind: 'proceed' } }),
      async () => done
    )
    expect(actual.bodies()).toBe(0)
    expect(actual.result.response).toContain('Invalid not-started gate')
  })

  it('reports a second continuation made while the body runs with a zero duration', async () => {
    let second: unknown
    const actual = await dispatch(
      async (_call, next, gates) => {
        const first = next()
        await gates.bodyStarted
        second = await next()
        gates.release()
        return first
      },
      async (started, released) => {
        started()
        await released
        return done
      }
    )
    expect(second).toMatchObject({ kind: 'threw', durationMs: 0 })
    expect(actual.bodies()).toBe(1)
    expect(actual.result.stopReason).toBe('TOOL_FAILURE')
  })
})
