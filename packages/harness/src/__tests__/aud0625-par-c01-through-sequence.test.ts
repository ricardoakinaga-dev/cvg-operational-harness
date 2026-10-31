import { coreHook } from '../kernel/hook-authority.ts'
import { describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  ModelRequest,
  SessionEventStore
} from '@cvg/harness-contracts'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import {
  createCompactionControl,
  createSessionCompactionRecorder,
  type ContextCompactionResult
} from '../compaction.ts'
import { createKernelRuntime, InMemorySessionEventStore } from '../index.ts'
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
 * SPEC 0290c (desvio 5 da C01): `throughSequence` of `context/compacted` is the
 * sequence of the session log (SPEC 0202: "referência a prefixo imutável"),
 * not the position of a message in the request. The request messages carry no
 * log sequence, so the host maps them with `logSequenceOf`. Synthetic data only.
 */

const TENANT = 'tenant_through_sequence'
const SESSION = 'session_through_sequence'

async function seededStore(
  padding: number,
  withCurrent = true
): Promise<SessionEventStore> {
  const store = new InMemorySessionEventStore()
  await store.openSession({
    tenantId: TENANT,
    sessionId: SESSION,
    formatVersion: 1
  })
  const events = [
    ...Array.from({ length: padding }, (_, i) => `padding ${i}`),
    'pergunta anterior',
    'resposta anterior',
    ...(withCurrent ? ['pergunta atual'] : [])
  ]
  let n = 0
  for (const text of events) {
    n += 1
    await store.append({
      tenantId: TENANT,
      sessionId: SESSION,
      formatVersion: 1,
      eventId: `seed_${n}`,
      timestamp: '2026-10-30T00:00:00.000Z',
      correlationId: 'corr_seed',
      traceId: 'trace_seed',
      type: n % 2 === 0 ? 'message/assistant' : 'message/user',
      payload: { text }
    })
  }
  return store
}

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

type Port = (index: number) => number | undefined | Promise<number | undefined>

interface Setup {
  readonly control: 'heuristic' | 'model'
  readonly padding?: number
  readonly port?: Port | 'absent'
  readonly recorder?: boolean
  /** The current user message is not yet in the log (a short log). */
  readonly withCurrent?: boolean
  /** The turn is cancelled while the host maps the messages. */
  readonly abortInPort?: boolean
}

async function run(setup: Setup) {
  const padding = setup.padding ?? 6
  const store = await seededStore(padding, setup.withCurrent ?? true)
  const recordedResults: ContextCompactionResult[] = []
  const record = createSessionCompactionRecorder({
    store,
    tenantId: TENANT,
    sessionId: SESSION,
    correlationId: 'corr_turn',
    traceId: 'trace_turn',
    clock: () => new Date('2026-10-30T00:00:00.000Z')
  })
  // [system, older user, older assistant, current user] -> log sequences
  const first = padding + 1
  const defaultPort: Port = (index) =>
    [undefined, first, first + 1, first + 2][index]
  const controller = new AbortController()
  const basePort =
    setup.port === 'absent' ? undefined : (setup.port ?? defaultPort)
  const port: Port | undefined =
    basePort && setup.abortInPort
      ? (index) => {
          controller.abort()
          return basePort(index)
        }
      : basePort
  let compactionCalls = 0
  let mainCalls = 0
  const gateway: ModelGateway = {
    complete: async (request) => {
      if (request.purpose === 'COMPACTION') compactionCalls += 1
      else mainCalls += 1
      return {
        text: 'resumo sintético',
        provider: 'synthetic',
        model: 'synthetic-v1',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      }
    }
  }
  const onCompacted =
    setup.recorder === false
      ? {}
      : {
          onCompacted: async (r: ContextCompactionResult) => {
            recordedResults.push(r)
            await record(r)
          }
        }
  const control =
    setup.control === 'heuristic'
      ? createCompactionControl({
          maxInputTokens: 200,
          keepRecentMessages: 1,
          ...onCompacted,
          ...(port ? { logSequenceOf: port } : {})
        })
      : createModelCompactionControl({
          maxInputTokens: 200,
          keepRecentMessages: 1,
          pinned: () => [],
          ...onCompacted,
          ...(port ? { logSequenceOf: port } : {})
        })
  const kernel = createKernelRuntime({
    orchestrator: new SinglePassOrchestrator(),
    modelGateway: gateway,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    plugins: [olderTurns, control]
  })
  const result = await kernel.execute(
    phase3RuntimeInput({
      runtimeProfile: 'single_pass',
      userMessage: 'pergunta atual',
      agent: phase3AgentProfile({ instructions: ['instrução curta'] }),
      signal: controller.signal
    })
  )
  const events = await store.read({
    tenantId: TENANT,
    sessionId: SESSION,
    limit: 500
  })
  const compacted = events.filter((e) => e.type === 'context/compacted')
  return {
    result,
    compacted,
    recordedResults,
    compactionCalls,
    mainCalls,
    padding,
    response: result.response
  }
}

describe.each(['heuristic', 'model'] as const)(
  'SPEC 0290c — %s compaction records the log sequence',
  (control) => {
    it('records the sequence of the last summarised log event, not the message position', async () => {
      const t = await run({ control })
      expect(t.result.stopReason).toBe('COMPLETED')
      expect(t.compacted).toHaveLength(1)
      const payload = t.compacted[0]!.payload as { throughSequence: number }
      // older assistant message = log sequence padding + 2; its position in the request is 3
      expect(payload.throughSequence).toBe(t.padding + 2)
      expect(payload.throughSequence).toBeLessThan(t.compacted[0]!.sequence)
    })

    it('a short log is recorded with the real sequence', async () => {
      // log: older user (1), older assistant (2); the event will be 3
      const t = await run({ control, padding: 0, withCurrent: false })
      expect(t.result.stopReason).toBe('COMPLETED')
      const payload = t.compacted[0]!.payload as { throughSequence: number }
      expect(payload.throughSequence).toBe(2)
    })

    it('maps only messages backed by the log: the max over the summarised ones', async () => {
      const t = await run({
        control,
        port: (index) => ({ 1: 7, 2: undefined })[index] as number | undefined
      })
      const payload = t.compacted[0]!.payload as { throughSequence: number }
      expect(payload.throughSequence).toBe(7)
    })
  }
)

describe('SPEC 0290c — fail-closed mapping', () => {
  const bad: [string, Port][] = [
    ['not increasing', (i) => [undefined, 8, 7, 9][i]],
    ['zero', (i) => [undefined, 0, 8, 9][i]],
    ['a fraction', (i) => [undefined, 7.5, 8, 9][i]],
    ['negative', (i) => [undefined, -7, 8, 9][i]],
    [
      'throws',
      () => {
        throw new Error('port down')
      }
    ],
    [
      'nothing mapped for the summarised messages',
      (i) => [undefined, undefined, undefined, 9][i]
    ],
    [
      'a kept message not after the summarised ones',
      (i) => [undefined, 7, 8, 8][i]
    ]
  ]
  for (const [name, port] of bad) {
    it(`the model path refuses ${name} before it pays for a summary`, async () => {
      const t = await run({ control: 'model', port })
      expect(t.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
      expect(t.compactionCalls).toBe(0)
      expect(t.mainCalls).toBe(0)
      expect(t.compacted).toHaveLength(0)
    })
    it(`the heuristic path refuses ${name} and records nothing`, async () => {
      const t = await run({ control: 'heuristic', port })
      expect(t.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
      expect(t.mainCalls).toBe(0)
      expect(t.compacted).toHaveLength(0)
      // refused by the control itself, not by the gate that wraps a thrown error
      expect(t.response).not.toContain('failed at')
    })
  }

  it('the model path with a recorder and no mapping refuses before the model call', async () => {
    const t = await run({ control: 'model', port: 'absent' })
    expect(t.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(t.compactionCalls).toBe(0)
    expect(t.compacted).toHaveLength(0)
  })

  it('the model path without a recorder needs no mapping', async () => {
    const t = await run({ control: 'model', port: 'absent', recorder: false })
    expect(t.result.stopReason).toBe('COMPLETED')
    expect(t.compactionCalls).toBe(1)
  })

  it('control: without a mapping a short log makes the validator reject the position-based value', async () => {
    // position 3 is not below the event sequence 3: the recorder fails, the turn is refused
    const t = await run({
      control: 'heuristic',
      port: 'absent',
      padding: 0,
      withCurrent: false
    })
    expect(t.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(t.mainCalls).toBe(0)
    expect(t.compacted).toHaveLength(0)
  })

  it('the heuristic path without a mapping keeps the legacy position (documented value registrado)', async () => {
    const t = await run({ control: 'heuristic', port: 'absent' })
    expect(t.result.stopReason).toBe('COMPLETED')
    const payload = t.compacted[0]!.payload as { throughSequence: number }
    expect(payload.throughSequence).toBe(3)
  })
})

describe('SPEC 0290c — cancellation while the host maps the messages', () => {
  for (const control of ['heuristic', 'model'] as const) {
    it(`the ${control} path records nothing and sends nothing`, async () => {
      const t = await run({ control, abortInPort: true })
      expect(t.result.stopReason).toBe('CANCELLED')
      expect(t.mainCalls).toBe(0)
      expect(t.compactionCalls).toBe(0)
      expect(t.compacted).toHaveLength(0)
    })
  }
})
