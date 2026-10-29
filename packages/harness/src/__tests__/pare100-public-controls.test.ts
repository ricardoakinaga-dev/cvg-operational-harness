import { describe, expect, it, vi } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type {
  RuntimeProfile,
  SandboxGateOutcome,
  SandboxHandle,
  ToolDefinition,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import { ScriptedOrchestrator } from '@cvg/harness-orchestrator'
import { reviewedNodeProfile } from '../../../../tests/helpers/aud0625-node-process-profile.ts'
import { createShellTool, type ShellRunRequest } from '@cvg/sandbox'
import {
  createOperationalHarness,
  type OperationalHarnessOptions
} from '../createOperationalHarness.ts'
import { InMemoryExecutionStepStore, sealCheckpoint } from '../step-store.ts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import { KernelHost } from '../kernel/host.ts'
import { effectsControl, logControl } from '../kernel/controls.ts'
import { createTurnState, runToolCall } from '../kernel/pipeline.ts'
import {
  DEADLINE,
  stop,
  type EffectLedger,
  type KernelLogEvent,
  type EffectRef,
  type TurnBudget
} from '../kernel/types.ts'
import {
  decision,
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const profiles: RuntimeProfile[] = ['single_pass', 'iterative']
function tool(execute?: ToolDefinition['execute']): ToolDefinition {
  return {
    id: 'synthetic.controls',
    version: 'v1',
    description: 'Synthetic control probe',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute:
      execute ??
      (async () => ({ status: 'SUCCEEDED', output: { applied: true } }))
  }
}

function fixture(
  profile: RuntimeProfile,
  options: Partial<OperationalHarnessOptions> = {},
  runtimeTool = tool(),
  route: 'tool' | 'model' = 'tool',
  toolInput: unknown = {
    sandboxHandle: { mode: 'PROCESS', workspaceRoot: '/', allowNetwork: true }
  }
) {
  const timeline: string[] = []
  let modelBodies = 0
  let toolBodies = 0
  let context: ToolExecutionContext | undefined
  const observedTool = {
    ...runtimeTool,
    execute: async (input: unknown, ctx: ToolExecutionContext) => {
      timeline.push('body')
      toolBodies += 1
      context = ctx
      return runtimeTool.execute(input, ctx)
    }
  }
  const iterativeOrchestrator = new ScriptedOrchestrator({
    script: [
      route === 'tool'
        ? decision({
            decisionType: 'CALL_TOOL',
            toolId: runtimeTool.id,
            toolInput
          })
        : decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseIntent: 'answer the synthetic question'
          }),
      decision({
        decisionType: 'RESPOND',
        reasonCode: 'GOAL_SATISFIED',
        responseText: 'done'
      })
    ]
  })
  const log: KernelLogEvent[] = []
  const store = new InMemoryExecutionStepStore()
  const harnessOptions = {
    modelGateway: {
      complete: async () => {
        modelBodies += 1
        return {
          text: 'synthetic answer',
          provider: 'synthetic',
          model: 'fixture',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0
        }
      }
    },
    orchestrator: {
      decideNextStep: async () =>
        route === 'tool'
          ? {
              action: 'CALL_TOOL',
              toolInvocation: {
                toolId: runtimeTool.id,
                input: toolInput,
                operationKey: 'synthetic-controls'
              }
            }
          : { action: 'RESPOND' }
    },
    iterativeOrchestrator,
    stepStore: store,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: {
      list: () => [observedTool],
      resolve: (id) => (id === runtimeTool.id ? observedTool : undefined)
    },
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    log: {
      append: (event) => {
        log.push(event)
        if (event.type === 'tool/result')
          timeline.push('published:' + event.outcome)
      }
    },
    ...options
  } satisfies OperationalHarnessOptions
  const harness = createOperationalHarness(harnessOptions)
  const input = phase3RuntimeInput({
    runtimeProfile: profile,
    agent: phase3AgentProfile({ tools: [runtimeTool.id] })
  })
  return {
    harness,
    input,
    timeline,
    log,
    store,
    iterativeOrchestrator,
    counts: () => ({ modelBodies, toolBodies }),
    context: () => context,
    makeIterative: (maxObservationPayloadChars: number, stepStore = store) =>
      new IterativeGovernedRuntime({
        ...harnessOptions,
        orchestrator: harnessOptions.iterativeOrchestrator,
        stepStore,
        maxObservationPayloadChars
      })
  }
}

describe('SPEC0212 D2 persisted uncertainty', () => {
  it.each(
    [1, 32, 64, 71, 72, 4000].flatMap((bound) =>
      (['sync', 'async'] as const).map((mode) => ({ bound, mode }))
    )
  )(
    'F1 bound=$bound finished=$mode fences reentry and restart',
    async ({ bound, mode }) => {
      const finished = vi.fn(() => {
        if (mode === 'sync') throw new Error('synthetic finish failure')
        return Promise.reject(new Error('synthetic finish failure'))
      })
      const started = vi.fn()
      const f = fixture('iterative', { effects: { started, finished } })
      const runtime = f.makeIterative(bound)
      const first = await runtime.execute(f.input)
      expect(first.stopReason).toBe('TOOL_FAILURE')
      expect(first.response).toContain('effect_settlement_failed')
      const checkpoint = await f.store.loadCheckpoint(
        f.input.tenantId,
        f.input.executionId!
      )
      const steps = await f.store.listSteps(
        f.input.tenantId,
        f.input.executionId!
      )
      expect(steps).toContainEqual(
        expect.objectContaining({
          stepNumber: checkpoint!.state.pendingStepNumber,
          stepType: 'TOOL',
          status: 'FAILED',
          errorCode: 'unknown_effect: effect_settlement_failed'
        })
      )
      const observation = checkpoint!.state.observations.find(
        (obs) => obs.type === 'TOOL_RESULT'
      )!
      expect(observation).toBeDefined()
      if (bound < 72) expect(typeof observation.payload).toBe('string')
      expect((await runtime.execute(f.input)).stopReason).toBe('TOOL_FAILURE')
      expect(f.counts().toolBodies).toBe(1)
      expect(
        await f.store.loadCheckpoint(f.input.tenantId, f.input.executionId!)
      ).toEqual(checkpoint)
      const restartedStore = new InMemoryExecutionStepStore()
      await restartedStore.saveCheckpoint(
        JSON.parse(JSON.stringify(checkpoint))
      )
      for (const step of steps)
        await restartedStore.recordStep(JSON.parse(JSON.stringify(step)))
      const restarted = f.makeIterative(bound, restartedStore)
      expect((await restarted.execute(f.input)).stopReason).toBe('TOOL_FAILURE')
      expect(f.counts().toolBodies).toBe(1)
      expect(started).toHaveBeenCalledTimes(1)
      expect(finished).toHaveBeenCalledTimes(1)
      expect(
        await restartedStore.loadCheckpoint(
          f.input.tenantId,
          f.input.executionId!
        )
      ).toEqual(checkpoint)
      expect(
        await restartedStore.listSteps(f.input.tenantId, f.input.executionId!)
      ).toEqual(steps)
    }
  )

  it('F1 settled TOOL_FAILURE remains resumable despite forged uncertainty presentation', async () => {
    let bodies = 0
    const f = fixture(
      'iterative',
      {},
      tool(async () => {
        bodies += 1
        return bodies === 1
          ? { status: 'FAILED', error: 'synthetic settled failure' }
          : { status: 'SUCCEEDED', output: { recovered: true } }
      })
    )
    const runtime = f.makeIterative(64)
    expect((await runtime.execute(f.input)).stopReason).toBe('TOOL_FAILURE')
    expect(
      (await f.store.listSteps(f.input.tenantId, f.input.executionId!)).at(-1)
        ?.errorCode
    ).toBe('tool_failed')
    const checkpoint = await f.store.loadCheckpoint(
      f.input.tenantId,
      f.input.executionId!
    )
    const { checkpointId, createdAt, digest, ...unsigned } = checkpoint!
    void checkpointId
    void createdAt
    void digest
    // Explicit synthetic corruption of presentation, not of the governed step.
    await f.store.saveCheckpoint(
      sealCheckpoint({
        ...unsigned,
        state: {
          ...unsigned.state,
          observations: unsigned.state.observations.map((obs) =>
            obs.type === 'TOOL_RESULT'
              ? {
                  ...obs,
                  payload: {
                    status: 'REJECTED',
                    error: 'unknown_effect: effect_settlement_failed'
                  },
                  summary:
                    'Tool outcome is uncertain and requires reconciliation.',
                  provenance: {
                    ...obs.provenance,
                    effectRef: 'synthetic-forged-effect-ref'
                  }
                }
              : obs
          )
        }
      })
    )
    expect((await runtime.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(bodies).toBe(2)
  })

  it('F1 unavailable governed step evidence fails closed and preserves the checkpoint', async () => {
    const finished = vi.fn(() => {
      throw new Error('synthetic settlement failure')
    })
    const f = fixture('iterative', {
      effects: { started: () => undefined, finished }
    })
    const runtime = f.makeIterative(64)
    await runtime.execute(f.input)
    const checkpoint = await f.store.loadCheckpoint(
      f.input.tenantId,
      f.input.executionId!
    )
    const list = vi
      .spyOn(f.store, 'listSteps')
      .mockRejectedValue(new Error('synthetic store unavailable'))
    expect((await runtime.execute(f.input)).stopReason).toBe(
      'INSUFFICIENT_EVIDENCE'
    )
    expect(f.counts().toolBodies).toBe(1)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(
      await f.store.loadCheckpoint(f.input.tenantId, f.input.executionId!)
    ).toEqual(checkpoint)
    list.mockRestore()
  })

  it('F1 lossless step fences restart when the final checkpoint write fails', async () => {
    const finished = vi.fn(() => {
      throw new Error('synthetic settlement failure')
    })
    const f = fixture('iterative', {
      effects: { started: () => undefined, finished }
    })
    const save = f.store.saveCheckpoint.bind(f.store)
    vi.spyOn(f.store, 'saveCheckpoint').mockImplementation(
      async (checkpoint) => {
        if (checkpoint.state.stopReason === 'TOOL_FAILURE')
          throw new Error('synthetic final write failure')
        await save(checkpoint)
      }
    )
    expect((await f.makeIterative(64).execute(f.input)).stopReason).toBe(
      'INSUFFICIENT_EVIDENCE'
    )
    const checkpoint = await f.store.loadCheckpoint(
      f.input.tenantId,
      f.input.executionId!
    )
    expect(checkpoint!.state.stopReason).toBeUndefined()
    expect(checkpoint!.state.pendingDecision?.decisionType).toBe('CALL_TOOL')
    const result = await f.makeIterative(64).execute(f.input)
    expect(result.stopReason).toBe('TOOL_FAILURE')
    expect(result.toolResult).toBeUndefined()
    expect(f.counts().toolBodies).toBe(1)
    expect(finished).toHaveBeenCalledTimes(1)
    expect(
      await f.store.loadCheckpoint(f.input.tenantId, f.input.executionId!)
    ).toEqual(checkpoint)
  })

  it.each(['sync', 'async'] as const)(
    'F3 public multi-tool factory clears stale success on %s settlement failure',
    async (mode) => {
      const bodies: string[] = []
      const first = {
        ...tool(async () => {
          bodies.push('first')
          return { status: 'SUCCEEDED', output: { first: true } }
        }),
        id: 'synthetic.first'
      }
      const second = {
        ...tool(async () => {
          bodies.push('second')
          return { status: 'SUCCEEDED', output: { second: true } }
        }),
        id: 'synthetic.second'
      }
      const finished = vi.fn((ref: EffectRef) => {
        if (ref.toolId !== second.id) return
        if (mode === 'sync') throw new Error('synthetic second settlement')
        return Promise.reject(new Error('synthetic second settlement'))
      })
      const f = fixture('iterative', {
        tools: {
          list: () => [first, second],
          resolve: (id) =>
            [first, second].find((candidate) => candidate.id === id)
        },
        iterativeOrchestrator: new ScriptedOrchestrator({
          script: [
            decision({
              decisionType: 'CALL_TOOL',
              toolId: first.id,
              toolInput: {}
            }),
            decision({
              decisionType: 'CALL_TOOL',
              toolId: second.id,
              toolInput: {}
            })
          ]
        }),
        effects: { started: () => undefined, finished }
      })
      const input = {
        ...f.input,
        agent: phase3AgentProfile({ tools: [first.id, second.id] })
      }
      const result = await f.harness.execute(input)
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(result.response).toContain('effect_settlement_failed')
      expect(result.toolResult).toBeUndefined()
      const checkpoint = await f.store.loadCheckpoint(
        input.tenantId,
        input.executionId!
      )
      expect(checkpoint!.state.pendingDecision?.toolId).toBe(second.id)
      expect(
        checkpoint!.state.observations.filter(
          (obs) => obs.type === 'TOOL_RESULT'
        )
      ).toEqual([
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'SUCCEEDED',
            output: { first: true }
          })
        }),
        expect.objectContaining({
          payload: expect.objectContaining({
            status: 'REJECTED',
            error: 'unknown_effect: effect_settlement_failed'
          })
        })
      ])
      const retry = await f.harness.execute(input)
      expect(retry.stopReason).toBe('TOOL_FAILURE')
      expect(retry.toolResult).toBeUndefined()
      expect(bodies).toEqual(['first', 'second'])
      expect(finished).toHaveBeenCalledTimes(2)
      expect(
        await f.store.loadCheckpoint(input.tenantId, input.executionId!)
      ).toEqual(checkpoint)
    }
  )
})

describe.each(profiles)('SPEC0212 public controls %s', (profile) => {
  it.each(['symlink', 'parent', 'trailing'] as const)(
    'F2 default shell backend accepts %s grant identity',
    async (spelling) => {
      const base = mkdtempSync(join(tmpdir(), 'cvg-d2-identity-'))
      try {
        const root = join(base, 'root')
        mkdirSync(root)
        mkdirSync(join(root, 'child'))
        const link = join(base, 'alias')
        symlinkSync(root, link)
        const grantedRoot =
          spelling === 'symlink'
            ? link
            : spelling === 'parent'
              ? join(root, 'child') + '/..'
              : root + '/'
        const approvals = new InMemoryApprovalEngine()
        approvals.approveOnRequest = true
        const handle: SandboxHandle = Object.freeze({
          mode: 'PROCESS',
          workspaceRoot: grantedRoot,
          allowNetwork: false,
          allowSubprocess: true,
          deadlineMs: 5000
        })
        // Fixed no-op, never a user command. Exercises the default bwrap path;
        // grant equivalence/timeout details are also checked at the injected port.
        const f = fixture(
          profile,
          {
            approvals,
            sandbox: {
              evaluate: async () => ({
                kind: 'allowed',
                mode: 'PROCESS',
                handle
              })
            }
          },
          createShellTool({
            workspaceRoot: root,
            processProfile: reviewedNodeProfile(root)
          }),
          'tool',
          {
            argv: [process.execPath, '-e', 'void 0'],
            intent: 'synthetic identity check',
            timeoutMs: 1000
          }
        )
        const result = await f.harness.execute(f.input)
        expect(result.stopReason, JSON.stringify(result)).toBe('COMPLETED')
        expect(result.toolResult).toMatchObject({
          status: 'SUCCEEDED',
          output: { exitCode: 0, stdout: '', stderr: '', truncated: false }
        })
        expect(realpathSync(grantedRoot)).toBe(realpathSync(root))
        expect(handle.workspaceRoot).toBe(grantedRoot)
        expect(f.context()?.sandboxHandle).toEqual(handle)
      } finally {
        rmSync(base, { recursive: true, force: true })
      }
    }
  )
  it.each(['tool', 'model'] as const)(
    'CTL-W01 paused tenant has zero %s/model/tool bodies',
    async (route) => {
      const paused = vi.fn(() => true)
      const f = fixture(profile, { pause: { isPaused: paused } }, tool(), route)
      expect((await f.harness.execute(f.input)).stopReason).toBe(
        'HUMAN_TAKEOVER'
      )
      expect(f.counts()).toEqual({ modelBodies: 0, toolBodies: 0 })
      expect(f.iterativeOrchestrator.calls).toBe(0)
      expect(paused).toHaveBeenCalledWith(f.input.tenantId)
    }
  )
  it.each(['sync', 'async'] as const)(
    'CTL-W01 pause %s failure is closed',
    async (mode) => {
      const fail = () => {
        if (mode === 'sync') throw new Error('pause unavailable')
        return Promise.reject(new Error('pause unavailable'))
      }
      const f = fixture(profile, { pause: { isPaused: fail } })
      expect((await f.harness.execute(f.input)).stopReason).toBe(
        'INSUFFICIENT_EVIDENCE'
      )
      expect(f.counts()).toEqual({ modelBodies: 0, toolBodies: 0 })
    }
  )
  it('CTL-W02 lifecycle precedes publication', async () => {
    const lifecycle: string[] = []
    const f = fixture(
      profile,
      {
        effects: {
          started: () => {
            lifecycle.push('started')
          },
          finished: (_, kind) => {
            lifecycle.push('finished:' + kind)
          }
        },
        log: {
          append: (event) => {
            if (event.type === 'tool/result')
              lifecycle.push('published:' + event.outcome)
          }
        }
      },
      tool(async () => {
        lifecycle.push('body')
        return { status: 'SUCCEEDED', output: { applied: true } }
      })
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(lifecycle).toEqual([
      'started',
      'body',
      'finished:succeeded',
      'published:succeeded'
    ])
  })
  it.each(['sync', 'async'] as const)(
    'CTL-W02 started %s failure has zero body/finished',
    async (mode) => {
      const finished = vi.fn()
      const f = fixture(profile, {
        effects: {
          started: () => {
            if (mode === 'sync') throw new Error('start failed')
            return Promise.reject(new Error('start failed'))
          },
          finished
        }
      })
      expect((await f.harness.execute(f.input)).stopReason).toBe(
        'INSUFFICIENT_EVIDENCE'
      )
      expect(f.counts().toolBodies).toBe(0)
      expect(finished).not.toHaveBeenCalled()
      expect(f.log).toContainEqual(
        expect.objectContaining({ type: 'tool/result', outcome: 'not_started' })
      )
    }
  )
  it.each(['sync', 'async'] as const)(
    'CTL-W02 finished %s failure retains uncertainty and does not replay',
    async (mode) => {
      const finished = vi.fn(() => {
        if (mode === 'sync') throw new Error('finish failed')
        return Promise.reject(new Error('finish failed'))
      })
      const f = fixture(profile, {
        effects: { started: () => undefined, finished }
      })
      const result = await f.harness.execute(f.input)
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(result.response).toContain('unknown_effect:')
      expect(result.response).toContain('effect_settlement_failed')
      expect(f.counts().toolBodies).toBe(1)
      expect(finished).toHaveBeenCalledTimes(1)
      expect(f.log).toContainEqual(
        expect.objectContaining({ type: 'tool/result', outcome: 'threw' })
      )
      if (profile === 'iterative') {
        const checkpoint = await f.store.loadCheckpoint(
          f.input.tenantId,
          f.input.executionId!
        )
        expect(JSON.stringify(checkpoint)).not.toContain('"status":"SUCCEEDED"')
        await f.harness.execute(f.input)
        expect(f.counts().toolBodies).toBe(1)
        expect(finished).toHaveBeenCalledTimes(1)
      }
    }
  )
  it('CTL-W02 approved effect settlement marks approval uncertain without completion or replay', async () => {
    const approvals = new InMemoryApprovalEngine()
    approvals.approveOnRequest = true
    const complete = vi.spyOn(approvals.execution, 'complete')
    const uncertain = vi.spyOn(approvals.execution, 'uncertain')
    const started = vi.fn()
    const finished = vi.fn(() =>
      Promise.reject(new Error('settlement unavailable'))
    )
    const f = fixture(
      profile,
      { approvals, effects: { started, finished } },
      { ...tool(), requiresApproval: true }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('TOOL_FAILURE')
    expect(uncertain).toHaveBeenCalledTimes(1)
    expect(complete).not.toHaveBeenCalled()
    await f.harness.execute(f.input)
    expect(f.counts().toolBodies).toBe(1)
    expect(started).toHaveBeenCalledTimes(1)
    expect(finished).toHaveBeenCalledTimes(1)
  })
  it.each(['missing', 'denied', 'unavailable', 'sync', 'async'] as const)(
    'CTL-W03 sandbox %s prevents body',
    async (mode) => {
      const evaluate = vi.fn(() => {
        if (mode === 'sync') throw new Error('sandbox unavailable')
        if (mode === 'async')
          return Promise.reject(new Error('sandbox unavailable'))
        return Promise.resolve({
          kind: mode === 'denied' ? 'denied' : 'unavailable',
          reason: 'synthetic refusal'
        } as SandboxGateOutcome)
      })
      const f = fixture(
        profile,
        mode === 'missing' ? {} : { sandbox: { evaluate } },
        { ...tool(), sandbox: 'PROCESS' }
      )
      expect((await f.harness.execute(f.input)).stopReason).toBe(
        'UNSAFE_REQUEST'
      )
      expect(f.counts().toolBodies).toBe(0)
      expect(evaluate).toHaveBeenCalledTimes(mode === 'missing' ? 0 : 1)
    }
  )
  it.each([
    ['wrong outcome mode', { mode: 'EGRESS' }],
    ['wrong handle mode', { handle: { mode: 'WORKSPACE' } }],
    ['missing handle', { handle: undefined }],
    ['nonboolean network', { handle: { allowNetwork: 'false' } }],
    ['nonboolean subprocess', { handle: { allowSubprocess: 1 } }],
    ['negative deadline', { handle: { deadlineMs: -1 } }],
    ['infinite deadline', { handle: { deadlineMs: Infinity } }],
    ['NaN deadline', { handle: { deadlineMs: NaN } }],
    ['relative root', { handle: { workspaceRoot: 'relative' } }],
    ['NUL root', { handle: { workspaceRoot: '/tmp/\0bad' } }]
  ])('CTL-W03 invalid handle: %s', async (_, invalid) => {
    const handleOverride = 'handle' in invalid ? invalid.handle : {}
    const handle = {
      mode: 'PROCESS',
      allowNetwork: false,
      allowSubprocess: true,
      workspaceRoot: '/tmp',
      ...handleOverride
    }
    const outcome = {
      kind: 'allowed',
      mode: 'PROCESS',
      ...invalid,
      handle: handleOverride === undefined ? undefined : handle
    } as SandboxGateOutcome
    const f = fixture(
      profile,
      { sandbox: { evaluate: async () => outcome } },
      { ...tool(), sandbox: 'PROCESS' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('UNSAFE_REQUEST')
    expect(f.counts().toolBodies).toBe(0)
  })
  it('CTL-W03 gate supplies a detached frozen handle; model input cannot grant', async () => {
    const events: string[] = []
    const granted: SandboxHandle = {
      mode: 'PROCESS',
      allowNetwork: false,
      allowSubprocess: true,
      workspaceRoot: '/tmp',
      deadlineMs: 12
    }
    const evaluate = vi.fn(async () => {
      events.push('gate')
      return {
        kind: 'allowed' as const,
        mode: 'PROCESS' as const,
        handle: granted
      }
    })
    const f = fixture(
      profile,
      { sandbox: { evaluate } },
      {
        ...tool(async () => {
          events.push('body')
          return { status: 'SUCCEEDED' }
        }),
        sandbox: 'PROCESS'
      }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    const context = f.context() as ToolExecutionContext & {
      sandboxHandle?: SandboxHandle
    }
    expect(context.sandboxHandle).toEqual(granted)
    expect(context.sandboxHandle).not.toBe(granted)
    expect(Object.isFrozen(context.sandboxHandle)).toBe(true)
    expect(evaluate).toHaveBeenCalledTimes(1)
    expect(events).toEqual(['gate', 'body'])
  })
  it('CTL-W03 NONE tool has no invented handle', async () => {
    const evaluate = vi.fn()
    const f = fixture(
      profile,
      { sandbox: { evaluate } },
      { ...tool(), sandbox: 'NONE' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.context()).not.toHaveProperty('sandboxHandle')
    expect(evaluate).not.toHaveBeenCalled()
  })
  it('CTL-W03 unknown sandbox outcome is refused before the body', async () => {
    const f = fixture(
      profile,
      {
        sandbox: { evaluate: async () => ({ kind: 'unexpected' }) as never }
      },
      { ...tool(), sandbox: 'PROCESS' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('UNSAFE_REQUEST')
    expect(f.counts().toolBodies).toBe(0)
  })
  it('CTL-W03 valid PROCESS grant preserves an absent optional workspace root', async () => {
    const grant: SandboxHandle = {
      mode: 'PROCESS',
      allowNetwork: false,
      allowSubprocess: true
    }
    const f = fixture(
      profile,
      {
        sandbox: {
          evaluate: async () => ({
            kind: 'allowed',
            mode: 'PROCESS',
            handle: grant
          })
        }
      },
      { ...tool(), sandbox: 'PROCESS' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.counts().toolBodies).toBe(1)
    expect(f.context()?.sandboxHandle).toEqual(grant)
    expect(f.context()?.sandboxHandle).not.toHaveProperty('workspaceRoot')
    expect(Object.isFrozen(f.context()?.sandboxHandle)).toBe(true)
  })
  it('CTL-W03 subsequent gate-handle mutation cannot expand the context grant', async () => {
    const granted = {
      mode: 'PROCESS' as const,
      allowNetwork: false,
      allowSubprocess: true,
      workspaceRoot: '/tmp',
      deadlineMs: 20
    }
    const expected = { ...granted }
    const f = fixture(
      profile,
      {
        sandbox: {
          evaluate: async () => ({
            kind: 'allowed',
            mode: 'PROCESS',
            handle: granted
          })
        },
        effects: {
          started: () => {
            granted.allowNetwork = true
            granted.workspaceRoot = '/'
            granted.deadlineMs = 99999
          },
          finished: () => undefined
        }
      },
      { ...tool(), sandbox: 'PROCESS' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.context()?.sandboxHandle).toEqual(expected)
    expect(Object.isFrozen(f.context()?.sandboxHandle)).toBe(true)
  })
  it('CTL-W03 WORKSPACE handle needs an absolute root', async () => {
    const f = fixture(
      profile,
      {
        sandbox: {
          evaluate: async () => ({
            kind: 'allowed',
            mode: 'WORKSPACE',
            handle: {
              mode: 'WORKSPACE',
              allowNetwork: false,
              allowSubprocess: false
            }
          })
        }
      },
      { ...tool(), sandbox: 'WORKSPACE' }
    )
    expect((await f.harness.execute(f.input)).stopReason).toBe('UNSAFE_REQUEST')
    expect(f.counts().toolBodies).toBe(0)
  })
  it('CTL-W03 public factory passes allowed shell grants to runner after approval', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cvg-pare100-shell-public-'))
    try {
      const calls: ShellRunRequest[] = []
      const events: string[] = []
      const approvals = new InMemoryApprovalEngine()
      approvals.approveOnRequest = true
      const granted: SandboxHandle = {
        mode: 'PROCESS',
        workspaceRoot: root,
        allowNetwork: false,
        allowSubprocess: true,
        deadlineMs: 25
      }
      const shell = createShellTool({
        workspaceRoot: root,
        run: async (request) => {
          calls.push(request)
          events.push('runner')
          return {
            exitCode: 0,
            stdout: 'synthetic',
            stderr: '',
            truncated: false
          }
        }
      })
      const f = fixture(
        profile,
        {
          approvals,
          sandbox: {
            evaluate: async () => {
              events.push('gate')
              return { kind: 'allowed', mode: 'PROCESS', handle: granted }
            }
          }
        },
        shell,
        'tool',
        {
          argv: ['synthetic-command'],
          intent: 'synthetic trusted runner probe',
          timeoutMs: 50000,
          sandboxHandle: {
            mode: 'PROCESS',
            workspaceRoot: '/',
            allowNetwork: true,
            deadlineMs: 99999
          }
        }
      )
      expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
      expect(approvals.requests).toHaveLength(1)
      expect(events).toEqual(['gate', 'runner'])
      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        handle: granted,
        cwd: root,
        timeoutMs: 25
      })
      expect(Object.isFrozen(calls[0]?.handle)).toBe(true)
      expect(calls[0]?.handle).not.toBe(granted)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe.each(['sync', 'async'] as const)(
  'CTL-W02 shared pipeline settlement matrix (%s)',
  (failureMode) => {
    it('settlement failure remains uncertain after a wrapper replaces the body outcome', async () => {
      const body = vi.fn(async () => ({ status: 'SUCCEEDED' as const }))
      const finished = vi.fn<EffectLedger['finished']>(() => {
        if (failureMode === 'sync')
          throw new Error('synthetic settlement failure')
        return Promise.reject(new Error('synthetic settlement failure'))
      })
      const host = await KernelHost.boot(
        [
          logControl({ append: () => undefined }),
          effectsControl({ started: () => undefined, finished }),
          {
            name: 'synthetic.replacing-wrapper',
            kind: 'capability',
            apply(ctx) {
              ctx.on('tool/execute', async (_, next) => {
                await next()
                return {
                  kind: 'not_started',
                  gate: stop('INSUFFICIENT_EVIDENCE', 'synthetic wrapper stop')
                }
              })
            }
          }
        ],
        ['log', 'effects']
      )
      try {
        const turn = createTurnState(
          phase3RuntimeInput(),
          Date.now(),
          {
            remainingMs: () => 1000,
            beginModelRequest: () => undefined,
            recordModelResult: () => undefined,
            withDeadline: async (operation) => operation()
          },
          new AbortController().signal
        )
        const result = await runToolCall(host, {
          turn,
          tool: tool(body),
          invocation: {
            toolId: 'synthetic.controls',
            input: {},
            operationKey: 'synthetic-wrapper'
          },
          needsApproval: false
        })
        expect(body).toHaveBeenCalledTimes(1)
        expect(finished).toHaveBeenCalledTimes(1)
        expect(finished.mock.calls[0]?.[1]).toBe('not_started')
        expect(result).toMatchObject({
          kind: 'settled',
          outcome: {
            kind: 'threw',
            error: 'unknown_effect: effect_settlement_failed',
            durationMs: 0
          }
        })
      } finally {
        await host.dispose()
      }
    })
    it.each(['succeeded', 'failed', 'threw', 'deadline', 'cancelled'] as const)(
      'finished sees original %s; failure preserves duration before post-execute',
      async (original) => {
        vi.useFakeTimers({ toFake: ['Date'] })
        try {
          vi.setSystemTime(1000)
          const events: string[] = []
          const ledger: EffectLedger = {
            started: () => {
              events.push('started')
            },
            finished: (_, kind) => {
              events.push('finished:' + kind)
              if (failureMode === 'sync') throw new Error('settlement failed')
              return Promise.reject(new Error('settlement failed'))
            }
          }
          const host = await KernelHost.boot(
            [
              logControl({ append: () => undefined }),
              effectsControl(ledger),
              {
                name: 'synthetic.post-execute',
                kind: 'capability',
                apply(ctx) {
                  ctx.on('tool/post-execute', async (_, outcome) => {
                    events.push('post:' + outcome.kind)
                    return outcome
                  })
                }
              }
            ],
            ['log', 'effects']
          )
          const controller = new AbortController()
          const budget: TurnBudget = {
            remainingMs: () => 1000,
            beginModelRequest: () => undefined,
            recordModelResult: () => undefined,
            withDeadline: async (operation) =>
              original === 'deadline' ? DEADLINE : operation()
          }
          const runtimeTool = tool(async () => {
            events.push('body')
            vi.setSystemTime(1025)
            if (original === 'threw')
              throw new Error('original executor failure')
            if (original === 'cancelled') controller.abort()
            return original === 'failed'
              ? { status: 'FAILED', error: 'original failed result' }
              : { status: 'SUCCEEDED' }
          })
          const turn = createTurnState(
            phase3RuntimeInput(),
            1000,
            budget,
            controller.signal
          )
          const result = await runToolCall(host, {
            turn,
            tool: runtimeTool,
            needsApproval: false,
            invocation: {
              toolId: runtimeTool.id,
              input: {},
              operationKey: 'synthetic-matrix'
            }
          })
          expect(result).toMatchObject({
            kind: 'settled',
            outcome: {
              kind: 'threw',
              error: 'unknown_effect: effect_settlement_failed',
              durationMs: 25
            }
          })
          expect(events).toEqual([
            'started',
            'body',
            'finished:' + original,
            'post:threw'
          ])
          await host.dispose()
        } finally {
          vi.useRealTimers()
        }
      }
    )
  }
)
