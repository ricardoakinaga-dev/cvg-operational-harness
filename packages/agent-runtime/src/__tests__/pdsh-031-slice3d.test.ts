import { describe, expect, it } from 'vitest'
import type { LoopLimits } from '../contracts.ts'
import {
  GovernedKernelBridge,
  modelGateStopCode,
  pauseCodeFromGate
} from '../runtime-kernel-bridge.ts'

const startedAt = new Date('2026-10-12T00:00:00.000Z')

function limits(overrides: Partial<LoopLimits> = {}): LoopLimits {
  return {
    maxSteps: 5,
    maxModelCalls: 2,
    maxToolCalls: 2,
    maxDurationMs: 1_000,
    maxCostUsd: 1,
    ...overrides
  } as never
}

function bridge(
  options: {
    readonly clock?: () => Date
    readonly pause?: unknown
    readonly log?: unknown
    readonly gate?: unknown
    readonly limits?: unknown
    readonly cancelSignal?: AbortSignal
  } = {}
) {
  return GovernedKernelBridge.boot({
    limits: limits(options.limits as never),
    clock: options.clock ?? (() => startedAt),
    startedAt,
    tenantId: 'tenant_pdsh031',
    traceId: 'trace_pdsh031',
    correlationId: 'corr_pdsh031',
    agentId: 'agent_pdsh031',
    agentVersion: 'v1',
    modelGateway: {
      generate:
        options.gate ??
        (async () => ({
          providerId: 'synthetic',
          model: 'synthetic-v1',
          costUsd: 0.1,
          usage: { inputTokens: 1, outputTokens: 2 },
          output: { text: 'drafted' }
        }))
    },
    ...(options.pause !== undefined ? { pause: options.pause } : {}),
    ...(options.log !== undefined ? { log: options.log } : {}),
    ...(options.cancelSignal !== undefined
      ? { cancelSignal: options.cancelSignal }
      : {})
  } as never)
}

function scriptedClock(offsets: number[]): () => Date {
  let index = 0
  return () => {
    const offset = offsets[Math.min(index, offsets.length - 1)] ?? 0
    index += 1
    return new Date(startedAt.getTime() + offset)
  }
}

describe('PDSH-031 slice 3d — kernel bridge gates and stages', () => {
  it('maps pause and model stop codes', () => {
    expect(
      pauseCodeFromGate({ cause: 'policy_denied' } as never)
    ).toBeUndefined()
    expect(
      pauseCodeFromGate({
        cause: 'operator_paused',
        response: 'operator_paused'
      } as never)
    ).toBe('operator_paused')
    expect(
      pauseCodeFromGate({
        cause: 'operator_paused',
        response: 'pause_state_unavailable'
      } as never)
    ).toBe('pause_state_unavailable')
    expect(
      pauseCodeFromGate({
        cause: 'operator_paused',
        response: 'something else'
      } as never)
    ).toBe('operator_paused')

    expect(modelGateStopCode({ stopReason: 'MAX_MODEL_CALLS' } as never)).toBe(
      'model_calls_exhausted'
    )
    expect(modelGateStopCode({ stopReason: 'MAX_DURATION' } as never)).toBe(
      'loop_deadline_exceeded'
    )
    expect(modelGateStopCode({ stopReason: 'CANCELLED' } as never)).toBe(
      'turn_cancelled'
    )
    expect(
      modelGateStopCode({
        stopReason: 'POLICY_DENIED',
        response: 'denied by policy'
      } as never)
    ).toBe('denied by policy')
  })

  it('reads the pause switch through every state', async () => {
    const unconfigured = bridge()
    expect(unconfigured.turnState).toBeDefined()
    expect(unconfigured.pauseSwitch).toBeDefined()
    expect(await unconfigured.gateTurnStep()).toMatchObject({ kind: 'proceed' })
    expect(await unconfigured.readPause()).toBeUndefined()
    await unconfigured.dispose()

    const active = bridge({ pause: { isPaused: async () => false } })
    expect(await active.readPause()).toBeUndefined()
    await active.dispose()

    const paused = bridge({ pause: { isPaused: async () => true } })
    expect(await paused.readPause()).toBe('operator_paused')
    expect(await paused.gateTurnStep()).toMatchObject({
      kind: 'stop',
      stopReason: 'HUMAN_TAKEOVER',
      response: 'operator_paused',
      cause: 'operator_paused'
    })
    await paused.dispose()

    const unavailable = bridge({
      pause: {
        isPaused: async () => {
          throw new Error('pause backend down')
        }
      }
    })
    expect(await unavailable.readPause()).toBe('pause_state_unavailable')
    expect(await unavailable.gateTurnStep()).toMatchObject({
      kind: 'stop',
      response: 'pause_state_unavailable'
    })
    await unavailable.dispose()
  })

  it('stops the model stage on call and duration gates', async () => {
    const noCalls = bridge({ limits: { maxModelCalls: 0 } as never })
    expect(await noCalls.runModelStage({})).toMatchObject({
      kind: 'stopped',
      gate: { stopReason: 'MAX_MODEL_CALLS' }
    })
    await noCalls.dispose()

    const gateStop = bridge({
      clock: scriptedClock([10, 20]),
      limits: { maxDurationMs: 15 } as never
    })
    expect(await gateStop.runModelStage({})).toMatchObject({
      kind: 'stopped',
      gate: { stopReason: 'MAX_DURATION' }
    })
    await gateStop.dispose()

    const expired = bridge({
      clock: scriptedClock([20]),
      limits: { maxDurationMs: 15 } as never
    })
    expect(await expired.runModelStage({})).toMatchObject({
      kind: 'stopped',
      gate: { stopReason: 'MAX_DURATION' }
    })
    await expired.dispose()
  })

  it('maps model deadline, completion and unrecorded outcomes', async () => {
    const immediate = bridge({
      clock: scriptedClock([10, 10, 5_000])
    })
    expect(await immediate.runModelStage({})).toMatchObject({
      kind: 'deadline'
    })
    await immediate.dispose()

    const timedOut = bridge({
      clock: scriptedClock([1, 1, 1]),
      limits: { maxDurationMs: 50 } as never,
      gate: () => new Promise(() => {})
    })
    expect(await timedOut.runModelStage({})).toMatchObject({
      kind: 'deadline'
    })
    await timedOut.dispose()

    const completed = bridge()
    expect(await completed.runModelStage({})).toMatchObject({
      kind: 'completed',
      result: { output: { text: 'drafted' } }
    })
    await completed.dispose()

    const unrecorded = bridge({
      log: {
        append: async (event: { type?: string }) => {
          if (event.type === 'model/result') {
            throw new Error('result lost')
          }
        }
      }
    })
    expect(await unrecorded.runModelStage({})).toMatchObject({
      kind: 'unrecorded',
      gate: { stopReason: 'INSUFFICIENT_EVIDENCE' }
    })
    await unrecorded.dispose()
  })

  it('runs the tool stage through success, failure and gates', async () => {
    const succeeded = bridge()
    const spec = {
      toolId: 'synthetic.tool',
      operationKey: 'op_pdsh031',
      input: { synthetic: true },
      executor: async () => ({ result: { applied: true } })
    }
    expect(await succeeded.runToolStage(spec as never)).toMatchObject({
      kind: 'succeeded',
      result: { applied: true }
    })
    await succeeded.dispose()

    const thrownError = new Error('executor exploded')
    const threw = bridge()
    expect(
      await threw.runToolStage({
        ...spec,
        executor: async () => {
          throw thrownError
        }
      } as never)
    ).toMatchObject({ kind: 'threw', error: thrownError })
    await threw.dispose()

    const gateStop = bridge({
      clock: scriptedClock([5_000])
    })
    expect(await gateStop.runToolStage(spec as never)).toMatchObject({
      kind: 'not_started',
      gate: { stopReason: 'MAX_DURATION' }
    })
    await gateStop.dispose()

    const paused = bridge({ pause: { isPaused: async () => true } })
    expect(await paused.runToolStage(spec as never)).toMatchObject({
      kind: 'not_started',
      gate: { stopReason: 'HUMAN_TAKEOVER' }
    })
    await paused.dispose()
  })

  it('reports cancellation and deadline through the stop reason', async () => {
    const controller = new AbortController()
    const cancelled = bridge({ cancelSignal: controller.signal })
    expect(cancelled.stopReason()).toBeUndefined()
    controller.abort()
    expect(cancelled.stopReason()).toBe('turn_cancelled')
    await cancelled.dispose()

    const expired = bridge({
      clock: scriptedClock([2_000])
    })
    expect(expired.stopReason()).toBe('loop_deadline_exceeded')
    await expired.dispose()

    const counters = bridge()
    expect(counters.takeModelError()).toBeUndefined()
    expect(counters.takeToolError()).toBeUndefined()
    counters.addCost(0.5)
    await counters.dispose()
  })
})
