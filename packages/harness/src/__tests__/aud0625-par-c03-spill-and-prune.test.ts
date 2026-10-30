import { describe, expect, it } from 'vitest'
import type {
  IterativeOrchestrator,
  IterativeOrchestratorInput,
  LoopDecision,
  ModelRequest,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import { EMPTY_MODEL_USAGE } from '@cvg/harness-contracts'
import { ScriptedModelGateway } from '@cvg/harness-orchestrator'
import { DefaultContextEngine } from '../context-engine.ts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import { createKernelRuntime } from '../index.ts'
import { createModelCompactionControl } from '../model-compaction.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
import type { KernelPlugin } from '../kernel/types.ts'
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
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'

/**
 * PAR-C03 / SPEC 0293 phase 1 (RED). A large tool output must not be cut
 * silently: the model gets a preview (head and tail), the exact size, a
 * notice of the cut and an opaque locator for the stored content; a store
 * failure is never a silent discard; old tool results leave the context as a
 * preview plus locator. The `it.fails` cases describe the target (the spill
 * store and policy are passed through options that do not exist yet) and fail
 * on the current runtime; the controls pass before and after the BUILD.
 * Synthetic data only.
 */

const HEAD = 'CABECA-DA-SAIDA-'
const TAIL = '-CAUDA-FINAL-DA-SAIDA'
const FILL = 'linha de preenchimento sem relevância clínica. '
const BIG = `${HEAD}${FILL.repeat(1200)}MEIO-PERDIDO-${FILL.repeat(1200)}${TAIL}`
const BIG_BYTES = Buffer.byteLength(BIG, 'utf8')

const BIG_TOOL = 'synthetic.big-report'

function bigToolRegistry(output: unknown): ToolRegistry {
  const base = createPhase3ToolRegistry({ availability: 'AVAILABLE' })
  const tool: ToolDefinition = {
    id: BIG_TOOL,
    version: 'v1',
    description: 'Returns a large synthetic report.',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'string' },
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async () => ({ status: 'SUCCEEDED', output })
  }
  const tools = [...base.list(), tool]
  return {
    list: () => tools,
    resolve: (id, version) =>
      tools.find(
        (t) => t.id === id && (version === undefined || t.version === version)
      )
  }
}

/** An in-memory stand-in for the future spill port (shape proposed in SPEC 0293). */
class FakeSpillStore {
  readonly puts: { readonly content: string; readonly locator: string }[] = []
  constructor(private readonly failing = false) {}
  async put(input: { readonly content: string }): Promise<{
    readonly locator: string
    readonly bytes: number
  }> {
    if (this.failing) throw new Error('storage unavailable')
    const locator = `loc_opaque_${String(this.puts.length + 1).padStart(3, '0')}`
    this.puts.push({ content: input.content, locator })
    return { locator, bytes: Buffer.byteLength(input.content, 'utf8') }
  }
}

const operational = () =>
  phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [BIG_TOOL] })
  })

function iterative(options: {
  readonly output: unknown
  readonly calls?: number
  readonly spill?: FakeSpillStore
}) {
  const seen: IterativeOrchestratorInput[] = []
  const calls = options.calls ?? 1
  const script: LoopDecision[] = [
    ...Array.from({ length: calls }, () =>
      decision({ decisionType: 'CALL_TOOL', toolId: BIG_TOOL, toolInput: {} })
    ),
    decision({
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      responseText: 'Relatório lido.'
    })
  ]
  let index = 0
  const orchestrator: IterativeOrchestrator = {
    decide: async (input) => {
      seen.push(input)
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
    tools: bigToolRegistry(options.output),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: new InMemoryExecutionStepStore(),
    contextEngine: new DefaultContextEngine(),
    // not an option yet: the BUILD adds `spill` (SPEC 0293 §3)
    ...(options.spill ? { spill: { store: options.spill } } : {})
  } as never)
  return { runtime, seen }
}

const modelView = (input: IterativeOrchestratorInput): string =>
  input.context.contextItems.map((item) => item.content).join('\n')

describe('PAR-C03 controls (pass before and after the BUILD)', () => {
  it('a small tool output reaches the model whole and is not spilled', async () => {
    const spill = new FakeSpillStore()
    const { runtime, seen } = iterative({
      output: { total: 3, itens: ['a', 'b', 'c'] },
      spill
    })
    const result = await runtime.execute(operational())
    expect(result.stopReason).toBe('COMPLETED')
    expect(modelView(seen[seen.length - 1]!)).toContain('"total":3')
    expect(spill.puts).toHaveLength(0)
  })

  it('the session log never carries a tool output, only its outcome', async () => {
    const kernel = createKernelRuntime({
      orchestrator: new SinglePassOrchestrator(),
      modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink()
    })
    const result = await kernel.execute(
      phase3RuntimeInput({ runtimeProfile: 'single_pass' })
    )
    expect(result.stopReason).toBeDefined()
    // the catalog for `tool/result` has only correlationId, toolId and outcome
    const { SESSION_EVENT_CATALOG_V1 } = await import('@cvg/harness-contracts')
    expect(
      Object.keys(SESSION_EVENT_CATALOG_V1.events['tool/result'].properties)
    ).toEqual(['correlationId', 'toolId', 'outcome'])
  })
})

describe('PAR-C03 target: a large output is stored and shown as a preview', () => {
  it.fails(
    'shows head, tail, exact size, a cut notice and the locator',
    async () => {
      const spill = new FakeSpillStore()
      const { runtime, seen } = iterative({ output: BIG, spill })
      await runtime.execute(operational())
      const view = modelView(seen[seen.length - 1]!)
      expect(view).toContain('loc_opaque_001')
      expect(view).toContain(HEAD)
      expect(view).toContain(TAIL)
      expect(view).not.toContain('MEIO-PERDIDO-')
      expect(view).toContain(String(BIG_BYTES))
      expect(view).toMatch(/cortad[oa]/i)
    }
  )

  it.fails('stores the exact content once, byte for byte', async () => {
    const spill = new FakeSpillStore()
    const { runtime } = iterative({ output: BIG, spill })
    await runtime.execute(operational())
    expect(spill.puts).toHaveLength(1)
    expect(spill.puts[0]!.content).toBe(BIG)
  })

  it.fails(
    'never discards silently: a store failure is announced or refuses the turn',
    async () => {
      const spill = new FakeSpillStore(true)
      const { runtime, seen } = iterative({ output: BIG, spill })
      const result = await runtime.execute(operational())
      const view = modelView(seen[seen.length - 1]!)
      expect(
        view.includes('não armazenado') ||
          result.stopReason === 'INSUFFICIENT_EVIDENCE'
      ).toBe(true)
    }
  )

  it.fails('announces the cut even without any store', async () => {
    const { runtime, seen } = iterative({ output: BIG })
    await runtime.execute(operational())
    const view = modelView(seen[seen.length - 1]!)
    expect(view).toMatch(/cortad[oa]|truncad[oa]/i)
    expect(view).toContain(String(BIG_BYTES))
  })
})

describe('PAR-C03 target: pruning old tool results before compaction', () => {
  it.fails(
    'an old tool result in the compaction prefix is sent as preview plus locator',
    async () => {
      const spill = new FakeSpillStore()
      const sentToSummariser: ModelRequest[] = []
      const older: KernelPlugin = {
        name: 'owned.tool-history',
        kind: 'control',
        apply(ctx) {
          ctx.on('model/before-call', async (call, next) => {
            const request = call.request as {
              messages: readonly ModelRequest['messages'][number][]
            }
            request.messages = [
              ...request.messages.slice(0, 1),
              { role: 'tool', content: BIG },
              { role: 'assistant', content: 'resposta anterior' },
              ...request.messages.slice(1)
            ]
            return next()
          })
        }
      }
      const kernel = createKernelRuntime({
        orchestrator: new SinglePassOrchestrator(),
        modelGateway: {
          complete: async (request) => {
            if (request.purpose === 'COMPACTION') sentToSummariser.push(request)
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
          older,
          // not an option yet: the BUILD adds `spill` (SPEC 0293 §3.4)
          createModelCompactionControl({
            maxInputTokens: 400,
            keepRecentMessages: 1,
            pinned: () => [],
            spill: { store: spill }
          } as never)
        ]
      })
      await kernel.execute(
        phase3RuntimeInput({ runtimeProfile: 'single_pass' })
      )
      const payload = sentToSummariser
        .flatMap((r) => r.messages.map((m) => m.content))
        .join('\n')
      expect(payload.length).toBeGreaterThan(0)
      expect(payload).not.toContain('MEIO-PERDIDO-')
      expect(payload).toContain('loc_opaque_001')
    }
  )
})
