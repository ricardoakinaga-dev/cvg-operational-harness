import { coreHook } from '../kernel/hook-authority.ts'
import { describe, expect, it } from 'vitest'
import type {
  ExecutionBudget,
  ModelGateway,
  ModelRequest,
  ModelResult
} from '@cvg/harness-contracts'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import { createKernelRuntime } from '../index.ts'
import type { KernelPlugin } from '../kernel/types.ts'
import { createModelCompactionControl } from '../model-compaction.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

/**
 * PAR-C01 / SPEC 0290 slice 3: an overflow reported by the model port
 * (`reason: 'context_window'`) is compacted and retried exactly once.
 * Synthetic data only.
 */

const ok = (text: string): ModelResult => ({
  text,
  provider: 'synthetic',
  model: 'synthetic-v1',
  inputTokens: 1,
  outputTokens: 1,
  costUsd: 0
})
const overflow = (...reason: [] | [unknown]) =>
  Object.assign(
    new Error('does not fit the context window'),
    reason.length === 0 ? { reason: 'context_window' } : { reason: reason[0] }
  )

const olderTurns: KernelPlugin = {
  name: 'owned.older-turns',
  kind: 'control',
  apply(ctx) {
    ctx.on(
      'model/before-call',
      coreHook('model/before-call', async (call, next) => {
        const request = call.request as {
          messages: readonly ModelRequest['messages'][number][]
        }
        request.messages = [
          ...request.messages.slice(0, 1),
          { role: 'user', content: 'pergunta anterior longa '.repeat(40) },
          { role: 'assistant', content: 'resposta anterior longa '.repeat(40) },
          ...request.messages.slice(1)
        ]
        return next()
      })
    )
  }
}

interface Setup {
  /** Decides each main request; `size` is the sent characters. */
  readonly main: (request: ModelRequest, n: number) => Promise<ModelResult>
  readonly compaction?: (request: ModelRequest) => Promise<ModelResult>
  readonly withControl?: boolean
  readonly withHistory?: boolean
  readonly budget?: Partial<ExecutionBudget>
  readonly signal?: AbortSignal
  readonly maxInputTokens?: number
  readonly extra?: readonly KernelPlugin[]
}

function build(setup: Setup) {
  const mainCalls: ModelRequest[] = []
  const compactionCalls: ModelRequest[] = []
  const gateway: ModelGateway = {
    complete: async (request) => {
      if (request.purpose === 'COMPACTION') {
        compactionCalls.push(request)
        return (setup.compaction ?? (async () => ok('resumo sintético')))(
          request
        )
      }
      // the pipeline mutates `messages` in place: keep what was sent now
      mainCalls.push({ ...request, messages: [...request.messages] })
      return setup.main(request, mainCalls.length)
    }
  }
  const kernel = createKernelRuntime({
    orchestrator: new SinglePassOrchestrator(),
    modelGateway: gateway,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    plugins: [
      ...(setup.withHistory === false ? [] : [olderTurns]),
      ...(setup.extra ?? []),
      ...(setup.withControl === false
        ? []
        : [
            createModelCompactionControl({
              maxInputTokens: setup.maxInputTokens ?? 100_000,
              keepRecentMessages: 1,
              pinned: () => []
            })
          ])
    ]
  })
  const base = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    userMessage: 'pergunta atual',
    agent: phase3AgentProfile({ instructions: ['instrução curta'] }),
    ...(setup.signal ? { signal: setup.signal } : {})
  })
  const input = setup.budget
    ? { ...base, budget: { ...base.budget, ...setup.budget } }
    : base
  return { kernel, input, mainCalls, compactionCalls }
}

const sizeOf = (request: ModelRequest) =>
  request.messages.reduce((n, m) => n + m.content.length, 0)
/** Overflows while the history is still there; fits once it was summarised. */
const fitsOnceSummarised = async (request: ModelRequest) => {
  if (sizeOf(request) > 600) throw overflow()
  return ok('resposta sintética')
}

describe('PAR-C01 slice 3: overflow → compact → one retry', () => {
  it('compacts after the first overflow and completes with the second request', async () => {
    const t = build({ main: fitsOnceSummarised })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).toBe('COMPLETED')
    expect(t.mainCalls).toHaveLength(2)
    expect(t.compactionCalls).toHaveLength(1)
    const second = t.mainCalls[1]!
    expect(sizeOf(second)).toBeLessThan(sizeOf(t.mainCalls[0]!))
    expect(second.messages.map((m) => m.role)).toEqual([
      'system',
      'user',
      'user'
    ])
    expect(second.messages[1]!.content).toContain('[contexto compactado]')
  })

  it('a second overflow ends the turn: never a third request, no second compaction', async () => {
    const t = build({
      main: async () => {
        throw overflow()
      }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).not.toBe('COMPLETED')
    expect(t.mainCalls).toHaveLength(2)
    expect(t.compactionCalls).toHaveLength(1)
  })

  it('does not retry an error without the context_window reason', async () => {
    for (const reason of [undefined, 'other', 'CONTEXT_WINDOW']) {
      const t = build({
        main: async () => {
          throw overflow(reason)
        }
      })
      const result = await t.kernel.execute(t.input)
      expect(result.stopReason, String(reason)).not.toBe('COMPLETED')
      expect(t.mainCalls, String(reason)).toHaveLength(1)
      expect(t.compactionCalls).toHaveLength(0)
    }
    const plain = build({
      main: async () => {
        throw new Error('boom')
      }
    })
    await plain.kernel.execute(plain.input)
    expect(plain.mainCalls).toHaveLength(1)
    const notObject = build({
      main: async () => {
        throw 'context_window'
      }
    })
    await notObject.kernel.execute(notObject.input)
    expect(notObject.mainCalls).toHaveLength(1)
  })

  it('keeps the original failure when no control changes the request', async () => {
    const t = build({ main: fitsOnceSummarised, withControl: false })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).not.toBe('COMPLETED')
    expect(t.mainCalls).toHaveLength(1)
    expect(t.compactionCalls).toHaveLength(0)
  })

  it('refuses when nothing can be compacted instead of resending', async () => {
    const t = build({
      withHistory: false,
      main: async () => {
        throw overflow()
      }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(t.mainCalls).toHaveLength(1)
    expect(t.compactionCalls).toHaveLength(0)
  })

  it('refuses when the compaction fails twice, with no retry of the turn', async () => {
    const t = build({
      main: fitsOnceSummarised,
      compaction: async () => {
        throw Object.assign(new Error('provider down'), { retryable: true })
      }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(t.compactionCalls).toHaveLength(2)
    expect(t.mainCalls).toHaveLength(1)
  })

  it('stops when the turn has no model call left for the retry', async () => {
    const t = build({
      main: fitsOnceSummarised,
      budget: { maxModelCalls: 2 }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).not.toBe('COMPLETED')
    // the compaction took the last slot; the retry itself has none
    expect(t.compactionCalls).toHaveLength(1)
    expect(t.mainCalls).toHaveLength(1)
  })

  it('a turn cancelled during the overflow compaction is not retried', async () => {
    const controller = new AbortController()
    const t = build({
      signal: controller.signal,
      main: fitsOnceSummarised,
      compaction: async () => {
        controller.abort()
        return ok('resumo tardio')
      }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).not.toBe('COMPLETED')
    expect(t.mainCalls).toHaveLength(1)
  })

  it('a turn cancelled by any overflow control is not retried even if it changed the request', async () => {
    const controller = new AbortController()
    const shrinkAndAbort: KernelPlugin = {
      name: 'owned.shrink-and-abort',
      kind: 'control',
      apply(ctx) {
        ctx.on(
          'model/overflow',
          coreHook('model/overflow', async (call, next) => {
            ;(call.request as { messages: unknown }).messages = [
              { role: 'user', content: 'curto' }
            ]
            controller.abort()
            return next()
          })
        )
      }
    }
    const t = build({
      signal: controller.signal,
      withControl: false,
      extra: [shrinkAndAbort],
      // no slot left: without the cancellation check the turn would report
      // the budget instead of the cancellation
      budget: { maxModelCalls: 1 },
      main: async () => {
        throw overflow()
      }
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).toBe('CANCELLED')
    expect(t.mainCalls).toHaveLength(1)
  })

  it('a first request that fits is sent once and never compacted', async () => {
    const t = build({
      withHistory: false,
      main: async () => ok('direto')
    })
    const result = await t.kernel.execute(t.input)
    expect(result.stopReason).toBe('COMPLETED')
    expect(t.mainCalls).toHaveLength(1)
    expect(t.compactionCalls).toHaveLength(0)
  })

  it('a first request that fits the cap is not compacted before the overflow either', async () => {
    const t = build({ main: fitsOnceSummarised, maxInputTokens: 100_000 })
    await t.kernel.execute(t.input)
    // the trigger did not fire for the first request; only the overflow did
    expect(t.mainCalls[0]!.messages).toHaveLength(4)
  })
})
