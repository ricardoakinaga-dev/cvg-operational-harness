import { describe, expect, it } from 'vitest'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { composeCapabilities } from '../capability-boundary.ts'
import { DefaultContextEngine } from '../context-engine.ts'
import { createOperationalHarness } from '../createOperationalHarness.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
import {
  CANCELLED,
  race,
  runGate,
  runGuards,
  runModelCall,
  runToolCall,
  unrecordedBlock
} from '../kernel/pipeline.ts'
import { stop } from '../kernel/types.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  decision,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

interface StopLike {
  readonly stopReason?: string
  readonly response?: string
  readonly cause?: string
  readonly approvalId?: string
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

function makeTurn() {
  const controller = new AbortController()
  const turn = {
    input: {
      tenantId: 'tenant_pdsh031',
      correlationId: 'corr_pdsh031',
      traceId: 'trace_pdsh031',
      executionId: 'exec_pdsh031',
      agent: { id: 'agent_pdsh031', version: 'v1' },
      userMessage: 'synthetic',
      context: { values: {}, sourceIds: [], capturedAt: '' },
      objective: 'synthetic objective',
      instructions: [],
      budget: {
        maxSteps: 10,
        maxModelCalls: 5,
        maxToolCalls: 5,
        maxDurationMs: 10_000,
        maxCostUsd: 1,
        maxTokens: 1_000
      }
    },
    startedAt: Date.now(),
    signal: controller.signal,
    budget: {
      remainingMs: () => 1_000,
      withDeadline: (operation: () => Promise<unknown>) => operation(),
      beginModelRequest: () => undefined,
      recordModelResult: () => undefined
    },
    metadata: {
      policy: null,
      approval: null,
      tool: null,
      provider: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      toolDurationMs: 0
    }
  }
  return { controller, turn }
}

const toolBase = {
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

function toolCallStub(turn: unknown, overrides: Record<string, unknown> = {}) {
  return {
    turn,
    tool: toolBase,
    invocation: { operationKey: 'op_pdsh031', input: { in: 1 } },
    needsApproval: false,
    ...overrides
  }
}

function toolServices(overrides: Record<string, unknown> = {}) {
  return {
    log: { append: async () => {} },
    effects: { started: async () => {}, finished: async () => {} },
    ...overrides
  }
}

describe('PDSH-031 slice 2d — kernel pipeline edges', () => {
  it('races a pre-aborted and a mid-flight signal into CANCELLED', async () => {
    const first = makeTurn()
    first.controller.abort()
    expect(await race(first.turn as never, async () => 'unused')).toBe(
      CANCELLED
    )

    const second = makeTurn()
    const pending = race(second.turn as never, () => new Promise(() => {}))
    second.controller.abort()
    expect(await pending).toBe(CANCELLED)
  })

  it('turns a throwing gate listener into an INSUFFICIENT_EVIDENCE stop', async () => {
    const host = fakeHost({
      listeners: {
        'turn/before-step': [
          {
            plugin: 'control.boom',
            fn: async () => {
              throw 'plain failure'
            }
          }
        ]
      }
    })
    const gate = (await runGate(host, 'turn/before-step', {})) as StopLike
    expect(gate).toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      response: 'control.boom failed at turn/before-step: unknown failure.'
    })
  })

  it('denies when a guard throws and forwards a guard cause', async () => {
    const throwing = fakeHost({
      guards: [
        async () => {
          throw new Error('guard boom')
        }
      ]
    })
    expect(await runGuards(throwing, {} as never)).toMatchObject({
      stopReason: 'POLICY_DENIED',
      response: 'A guard failed: guard boom.'
    })

    const caused = fakeHost({
      guards: [
        () => ({
          reason: 'paused by operator',
          stopReason: 'HUMAN_TAKEOVER',
          cause: 'operator_paused'
        })
      ]
    })
    expect(await runGuards(caused, {} as never)).toMatchObject({
      stopReason: 'HUMAN_TAKEOVER',
      response: 'paused by operator',
      cause: 'operator_paused'
    })

    const uncaused = fakeHost({
      guards: [() => ({ reason: 'denied', stopReason: 'POLICY_DENIED' })]
    })
    const denial = (await runGuards(uncaused, {} as never)) as StopLike
    expect(denial.stopReason).toBe('POLICY_DENIED')
    expect(denial.cause).toBeUndefined()
  })

  it('preserves the approval id when the closing record was lost', () => {
    const lost = stop('INSUFFICIENT_EVIDENCE', 'record lost.')
    const blocked = stop('APPROVAL_REQUIRED', 'approval required.', {
      approvalId: 'appr_pdsh031' as never
    })
    const reported = unrecordedBlock(lost, blocked)
    expect(reported.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(reported.response).toContain('record lost.')
    expect(reported.response).toContain('approval required.')
    expect(reported.approvalId).toBe('appr_pdsh031')
  })

  it('logs an uncloneable model request and completes normally', async () => {
    const { turn } = makeTurn()
    const host = fakeHost({
      services: {
        log: { append: async () => {} },
        model: {
          complete: async () => ({
            provider: 'synthetic',
            inputTokens: 1,
            outputTokens: 2,
            costUsd: 0,
            content: 'ok'
          })
        }
      }
    })
    const request = {
      messages: [{ role: 'user', content: { fn: () => 1 } }]
    }
    expect(
      await runModelCall(host, turn as never, request as never)
    ).toMatchObject({ kind: 'completed' })
  })

  it('reports a cancelled model call before dispatch and during the call', async () => {
    const stopped = makeTurn()
    stopped.controller.abort()
    const host = fakeHost({
      services: {
        log: { append: async () => {} },
        model: { complete: async () => ({}) }
      }
    })
    expect(
      await runModelCall(host, stopped.turn as never, {} as never)
    ).toMatchObject({ kind: 'cancelled' })

    const racing = makeTurn()
    const racingHost = fakeHost({
      services: {
        log: { append: async () => {} },
        model: {
          complete: () => {
            racing.controller.abort()
            return new Promise(() => {})
          }
        }
      }
    })
    expect(
      await runModelCall(racingHost, racing.turn as never, {} as never)
    ).toMatchObject({ kind: 'cancelled' })
  })

  it('closes a hooked call as not started with the hook stop', async () => {
    const { turn } = makeTurn()
    const host = fakeHost({ services: toolServices() })
    const result = await runToolCall(host, toolCallStub(turn) as never, {
      beforeDispatch: async () => stop('HUMAN_TAKEOVER', 'paused by operator')
    })
    expect(result).toMatchObject({
      kind: 'stopped',
      gate: { stopReason: 'HUMAN_TAKEOVER', response: 'paused by operator' }
    })
  })

  it('fails closed when a reported sandbox gate cannot be read', async () => {
    const { turn } = makeTurn()
    const host = {
      listeners: () => [],
      guards: () => [],
      has: (name: string) => name === 'sandbox' || name === 'log',
      get: (name: string) =>
        name === 'log' ? { append: async () => {} } : undefined
    } as never
    const call = toolCallStub(turn, {
      tool: { ...toolBase, sandbox: 'WORKSPACE' }
    })
    expect(await runToolCall(host, call as never)).toMatchObject({
      kind: 'stopped',
      gate: { stopReason: 'UNSAFE_REQUEST' }
    })
  })

  it('settles a throwing dispatch listener as not started or threw', async () => {
    const first = makeTurn()
    const hostA = fakeHost({
      services: toolServices(),
      listeners: {
        'tool/execute': [
          {
            plugin: 'test.pre',
            fn: async () => {
              throw new Error('pre-dispatch failure')
            }
          }
        ]
      }
    })
    expect(
      await runToolCall(hostA, toolCallStub(first.turn) as never)
    ).toMatchObject({
      kind: 'settled',
      outcome: {
        kind: 'not_started',
        gate: {
          stopReason: 'INSUFFICIENT_EVIDENCE',
          response: expect.stringContaining('test.pre')
        }
      }
    })

    const second = makeTurn()
    const hostB = fakeHost({
      services: toolServices(),
      listeners: {
        'tool/execute': [
          {
            plugin: 'test.late',
            fn: (async (_call: never, next: never) => {
              await (next as () => Promise<unknown>)()
              throw new Error('post-dispatch failure')
            }) as never
          }
        ]
      }
    })
    expect(
      await runToolCall(hostB, toolCallStub(second.turn) as never)
    ).toMatchObject({
      kind: 'settled',
      outcome: {
        kind: 'threw',
        error: 'test.late failed: post-dispatch failure'
      }
    })

    const failing = makeTurn()
    const failingHost = fakeHost({
      services: toolServices(),
      listeners: {
        'tool/post-execute': [
          {
            plugin: 'control.settle',
            fn: () => {
              throw new Error('settlement failure')
            }
          }
        ]
      }
    })
    const failingCall = toolCallStub(failing.turn, {
      tool: {
        ...toolBase,
        execute: async () => ({ status: 'FAILED', output: {} })
      }
    })
    expect(await runToolCall(failingHost, failingCall as never)).toMatchObject({
      kind: 'settled',
      outcome: { kind: 'failed' }
    })
  })

  it('downgrades a settled success when a post-execute listener fails', async () => {
    const { turn } = makeTurn()
    const host = fakeHost({
      services: toolServices(),
      listeners: {
        'tool/post-execute': [
          {
            plugin: 'control.settle',
            fn: () => {
              throw new Error('settlement failure')
            }
          }
        ]
      }
    })
    expect(await runToolCall(host, toolCallStub(turn) as never)).toMatchObject({
      kind: 'settled',
      outcome: {
        kind: 'confirm_failed',
        error: 'control.settle failed: settlement failure'
      }
    })
  })

  it('reports cancellation at dispatch before and during the body', async () => {
    const preAborted = makeTurn()
    const hostA = fakeHost({
      services: toolServices({
        effects: {
          started: async () => {
            preAborted.controller.abort()
          },
          finished: async () => {}
        }
      })
    })
    const callA = toolCallStub(preAborted.turn, {
      tool: { ...toolBase, execute: () => new Promise(() => {}) }
    })
    expect(await runToolCall(hostA, callA as never)).toMatchObject({
      kind: 'settled',
      outcome: { kind: 'cancelled' }
    })

    const midFlight = makeTurn()
    const hostB = fakeHost({ services: toolServices() })
    const callB = toolCallStub(midFlight.turn, {
      tool: {
        ...toolBase,
        execute: () => {
          setTimeout(() => midFlight.controller.abort(), 0)
          return new Promise(() => {})
        }
      }
    })
    expect(await runToolCall(hostB, callB as never)).toMatchObject({
      kind: 'settled',
      outcome: { kind: 'cancelled' }
    })
  })

  it('keeps the outcome when the effect ledger closing write fails', async () => {
    const { turn } = makeTurn()
    const host = fakeHost({
      services: toolServices({
        effects: {
          started: async () => {},
          finished: () => Promise.reject(new Error('synthetic ledger failure'))
        }
      })
    })
    expect(await runToolCall(host, toolCallStub(turn) as never)).toMatchObject({
      kind: 'settled',
      outcome: { kind: 'succeeded' }
    })
  })
})

describe('PDSH-031 slice 2d — operational harness composition edges', () => {
  it('wires every optional iterative dependency and the run alias', async () => {
    const stepStore = new InMemoryExecutionStepStore()
    const { registry, fingerprint } = composeCapabilities([])
    const harness = createOperationalHarness({
      modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      capabilities: registry,
      effectJournal: {} as never,
      iterativeOrchestrator: new ScriptedOrchestrator({
        script: [
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText: 'iterative answer'
          })
        ]
      }),
      stepStore,
      contextEngine: new DefaultContextEngine(),
      knowledge: { search: async () => ({ items: [] }) } as never,
      sufficiencyEvaluator: {
        evaluate: async () => ({ outcome: 'SUFFICIENT' })
      } as never,
      completionEvaluator: {
        evaluate: async () => ({ outcome: 'COMPLETE' })
      } as never,
      claimExtractor: () => [],
      defaultRuntimeProfile: 'iterative',
      clock: () => new Date('2026-10-12T00:00:00.000Z'),
      sandbox: {
        evaluate: async () => ({ kind: 'unavailable', reason: 'none' })
      } as never,
      log: { append: async () => {} }
    })

    expect(harness.capabilityFingerprint).toBe(fingerprint)

    const conflict = await harness.run(
      phase3RuntimeInput({
        agent: phase3AgentProfile(),
        runtimeProfile: 'iterative'
      })
    )
    expect(conflict.stopReason).toBe('STATE_CONFLICT')
    expect(conflict.response).toContain(
      'Capability composition fingerprint is required'
    )
  })

  it('keeps the compatibility registry path with a journal and no fingerprint', async () => {
    const harness = createOperationalHarness({
      modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      effectJournal: {} as never
    })
    expect(harness.capabilityFingerprint).toBeUndefined()
    const { runtimeProfile: _runtimeProfile, ...withoutProfile } =
      phase3RuntimeInput()
    void _runtimeProfile
    expect(harness.resolveProfile(withoutProfile as never)).toBe('single_pass')
  })
})
