import { describe, expect, it } from 'vitest'
import { EMPTY_MODEL_USAGE } from '@cvg/harness-contracts'
import type {
  IterativeOrchestrator,
  LoopDecision,
  ModelRequest,
  Observation,
  SpillPutInput,
  SpillReceipt,
  SpillStore
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  SinglePassOrchestrator
} from '@cvg/harness-orchestrator'
import { DefaultContextEngine } from '../context-engine.ts'
import { createKernelRuntime } from '../index.ts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import type { KernelPlugin } from '../kernel/types.ts'
import { createModelCompactionControl } from '../model-compaction.ts'
import {
  InMemorySpillStore,
  createSpillReadTool,
  toolHistoryFromObservations
} from '../spill/index.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
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

/** PAR-C03 host wiring (SPEC 0293 I11): the spill.read of a run survives the compaction of the next request. Synthetic data only. */

const CANARY = 'CANARIO-CENTRAL-DA-LEITURA'
const SLICE = `INICIO-${'f'.repeat(14_000)}-${CANARY}-${'g'.repeat(14_000)}-FIM`
const ORDINARY = `COMUM-${'x'.repeat(14_000)}-MEIO-COMUM-${'y'.repeat(14_000)}-FIM-COMUM`

class CountingStore implements SpillStore {
  readonly durability = 'shared' as const
  readonly puts: SpillPutInput[] = []
  readonly inner = new InMemorySpillStore()
  async put(input: SpillPutInput): Promise<SpillReceipt> {
    this.puts.push(input)
    return this.inner.put(input)
  }
  read(input: Parameters<SpillStore['read']>[0]) {
    return this.inner.read(input)
  }
}

/** A real run of the iterative runtime that executes the house spill.read; returns its observations. */
async function runWithHouseRead(): Promise<readonly Observation[]> {
  const store = new CountingStore()
  const input = phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: ['spill.read'] })
  })
  const { locator } = await store.put({
    tenantId: input.tenantId,
    sessionId: input.sessionId,
    executionId: 'exec_phase3_fixture',
    operationKey: 'op_original',
    sourceId: 'tool.original',
    classification: 'CONFIDENTIAL',
    mediaType: 'text/plain',
    content: SLICE
  })
  const base = createPhase3ToolRegistry({ availability: 'AVAILABLE' })
  const tools = [...base.list(), createSpillReadTool({ store })]
  const seen: { context: { observations: readonly Observation[] } }[] = []
  const script: LoopDecision[] = [
    decision({
      decisionType: 'CALL_TOOL',
      toolId: 'spill.read',
      toolInput: { locator, offset: 0, length: 32 * 1024 }
    }),
    decision({
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      responseText: 'lido'
    })
  ]
  let index = 0
  const orchestrator: IterativeOrchestrator = {
    decide: async (step) => {
      seen.push(step as never)
      const next = script[Math.min(index, script.length - 1)]!
      index += 1
      return { decision: next, usage: EMPTY_MODEL_USAGE }
    }
  }
  const runtime = new IterativeGovernedRuntime({
    orchestrator,
    modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: {
      list: () => tools,
      resolve: (id) => tools.find((t) => t.id === id)
    },
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: new InMemoryExecutionStepStore(),
    contextEngine: new DefaultContextEngine({ tokenBudget: 20_000 }),
    spill: { store, allowProcessLocal: true }
  })
  await runtime.execute(input)
  return seen[seen.length - 1]!.context.observations
}

async function compact(
  observations: readonly Observation[],
  wirePort: boolean,
  extra: { role: 'tool' | 'assistant'; content: string }[]
) {
  const history = toolHistoryFromObservations(observations, 1)
  const messages = [...history.messages, ...extra]
  const puts = new CountingStore()
  const sent: string[] = []
  const plugin: KernelPlugin = {
    name: 'owned.history',
    kind: 'control',
    apply(ctx) {
      ctx.on('model/before-call', async (call, next) => {
        const request = call.request as {
          messages: readonly { role: string; content: string }[]
        }
        request.messages = [
          ...request.messages.slice(0, 1),
          ...messages,
          ...request.messages.slice(1)
        ]
        return next()
      })
    }
  }
  const kernel = createKernelRuntime({
    orchestrator: new SinglePassOrchestrator(),
    modelGateway: {
      complete: async (request: ModelRequest) => {
        if (request.purpose === 'COMPACTION')
          sent.push(request.messages.map((m) => m.content).join('\n'))
        return {
          text: 'resumo',
          provider: 'synthetic',
          model: 'synthetic-v1',
          inputTokens: 1,
          outputTokens: 1,
          costUsd: 0
        }
      }
    },
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    plugins: [
      plugin,
      createModelCompactionControl({
        maxInputTokens: 600,
        keepRecentMessages: 1,
        pinned: () => [],
        spill: { store: puts },
        ...(wirePort ? { houseReadOf: history.houseReadOf } : {})
      })
    ]
  })
  const result = await kernel.execute(
    phase3RuntimeInput({
      runtimeProfile: 'single_pass',
      userMessage: 'pergunta'
    })
  )
  return { result, sent, puts: puts.puts }
}

describe('host wiring of houseReadOf from the observations of a run', () => {
  it('the runtime marks the house read, and only it', async () => {
    const observations = await runWithHouseRead()
    const results = observations.filter((o) => o.type === 'TOOL_RESULT')
    expect(results).toHaveLength(1)
    expect(results[0]!.rendering?.houseRead).toBe(true)
    expect(results[0]!.rendering?.text).toContain(CANARY)
  })

  it('the spill.read of the run survives the compaction, and an ordinary big result is still cut', async () => {
    const observations = await runWithHouseRead()
    const t = await compact(observations, true, [
      { role: 'tool', content: ORDINARY },
      { role: 'assistant', content: 'resposta' }
    ])
    expect(t.result.stopReason).toBe('COMPLETED')
    expect(t.sent[0]).toContain(CANARY)
    expect(t.sent[0]).not.toContain('MEIO-COMUM')
    expect(t.puts).toHaveLength(1)
    expect(t.puts[0]!.content).toBe(ORDINARY)
  })

  it('control: without the port the same read is stored again and loses its centre', async () => {
    const observations = await runWithHouseRead()
    const t = await compact(observations, false, [
      { role: 'assistant', content: 'resposta' }
    ])
    expect(t.puts).toHaveLength(1)
    expect(t.sent[0]).not.toContain(CANARY)
  })
})

describe('toolHistoryFromObservations', () => {
  const observation = (over: Partial<Observation>): Observation =>
    ({
      id: 'o',
      type: 'TOOL_RESULT',
      source: 'TOOL',
      trust: 'UNTRUSTED',
      summary: 'resumo',
      payload: {},
      provenance: { sourceId: 't' },
      timestamp: '2026-10-30T00:00:00.000Z',
      ...over
    }) as Observation
  const rendering = (houseRead?: true) => ({
    form: 'inline' as const,
    text: 'texto renderizado',
    bytes: 1,
    sha256: 'a'.repeat(64),
    stored: false,
    ...(houseRead ? { houseRead } : {})
  })

  it('keeps only tool results, in order, and aligns the port with the request position', () => {
    const history = toolHistoryFromObservations(
      [
        observation({ type: 'USER_MESSAGE' as never, source: 'USER' as never }),
        observation({ rendering: rendering() }),
        observation({ rendering: rendering(true) }),
        observation({ summary: 'sem renderização' })
      ],
      3
    )
    expect(history.messages.map((m) => m.content)).toEqual([
      'texto renderizado',
      'texto renderizado',
      'sem renderização'
    ])
    expect([2, 3, 4, 5, 6].map((i) => history.houseReadOf(i))).toEqual([
      false,
      false,
      true,
      false,
      false
    ])
  })

  it('ignores a rendering mark on an observation that is not a tool result', () => {
    const history = toolHistoryFromObservations([
      observation({ source: 'USER' as never, rendering: rendering(true) })
    ])
    expect(history.messages).toEqual([])
    expect(history.houseReadOf(0)).toBe(false)
  })
})
