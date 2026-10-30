import { describe, expect, it } from 'vitest'
import type {
  IterativeOrchestrator,
  IterativeOrchestratorInput,
  SpillPutInput,
  SpillReceipt,
  SpillSlice,
  SpillStore,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import { DEFAULT_SPILL_POLICY, EMPTY_MODEL_USAGE } from '@cvg/harness-contracts'
import { ScriptedModelGateway } from '@cvg/harness-orchestrator'
import { DefaultContextEngine } from '../context-engine.ts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import {
  InMemorySpillStore,
  SpillCommitUnknown,
  SpillExpired,
  SpillNotFound,
  SpillPolicyError,
  SpillStorageUnavailable,
  SpillTooLarge,
  newBlockMarker,
  prepareToolOutput,
  renderPreviewBlock,
  resolveSpillPolicy,
  serializeToolOutput,
  sha256Hex,
  utf8Bytes,
  utf8Head,
  utf8Tail,
  type SpillComposition
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

/** PAR-C03 / SPEC 0293 slice 1: rendering, preparation, policy and the in-memory store. Synthetic data only. */

const policy = resolveSpillPolicy()
const T = DEFAULT_SPILL_POLICY.thresholdBytes

describe('resolveSpillPolicy', () => {
  it('returns frozen defaults', () => {
    expect(policy).toEqual(DEFAULT_SPILL_POLICY)
    expect(Object.isFrozen(policy)).toBe(true)
  })
  it.each([
    [{ thresholdBytes: 0 }],
    [{ readMaxBytes: 1.5 }],
    [{ maxLocatorsPerTurn: -1 }],
    [{ previewHeadBytes: 8_000, previewTailBytes: 1_000 }],
    [{ ttlMs: 8 * 24 * 60 * 60 * 1000 }],
    [{ thresholdBytes: 10_000_000 }]
  ])('refuses %j', (override) => {
    expect(() => resolveSpillPolicy(override)).toThrow(SpillPolicyError)
  })
  it('accepts a coherent override', () => {
    expect(
      resolveSpillPolicy({ thresholdBytes: 4_096, previewHeadBytes: 1_024 })
        .thresholdBytes
    ).toBe(4_096)
  })
})

describe('serialization and safe cuts (I8)', () => {
  it('keeps a string as is and serialises anything else as JSON', () => {
    expect(serializeToolOutput('abc')).toEqual({
      text: 'abc',
      mediaType: 'text/plain',
      truncatedAtSource: false
    })
    expect(serializeToolOutput({ a: 1 })).toMatchObject({
      text: '{"a":1}',
      mediaType: 'application/json'
    })
    expect(serializeToolOutput(undefined).text).toBe('')
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(serializeToolOutput(cyclic).text).toBe('')
  })
  it('reads the tool-reported truncation flag only from an object', () => {
    expect(serializeToolOutput({ truncated: true }).truncatedAtSource).toBe(
      true
    )
    expect(serializeToolOutput({ truncated: 'yes' }).truncatedAtSource).toBe(
      false
    )
    expect(serializeToolOutput(null).truncatedAtSource).toBe(false)
    expect(serializeToolOutput('truncated').truncatedAtSource).toBe(false)
  })
  it('counts bytes, not characters', () => {
    expect(utf8Bytes('ação')).toBe(6)
    expect(utf8Bytes('😀')).toBe(4)
  })
  it('cuts the head and the tail on a code point boundary', () => {
    const text = 'aç😀bç'
    // bytes: a(1) ç(2) 😀(4) b(1) ç(2)
    expect(utf8Head(text, 3)).toBe('aç')
    expect(utf8Head(text, 4)).toBe('aç')
    expect(utf8Head(text, 7)).toBe('aç😀')
    expect(utf8Tail(text, 2)).toBe('ç')
    expect(utf8Tail(text, 3)).toBe('bç')
    expect(utf8Tail(text, 4)).toBe('bç')
    expect(utf8Head('curto', 100)).toBe('curto')
    expect(utf8Tail('curto', 100)).toBe('curto')
    expect(utf8Head('😀', 3)).toBe('')
    expect(utf8Tail('😀', 3)).toBe('')
  })
  it('never splits a surrogate pair in a long text', () => {
    const text = '😀'.repeat(50)
    for (const cut of [1, 2, 3, 5, 7]) {
      expect(utf8Head(text, cut)).not.toContain('�')
      expect(utf8Tail(text, cut)).not.toContain('�')
    }
  })
})

describe('the per-block marker (I12)', () => {
  it('is 16 hex characters and regenerated when the content contains it', () => {
    const marker = newBlockMarker('conteúdo')
    expect(marker).toMatch(/^[0-9a-f]{16}$/)
    const draws = [
      Buffer.from('aaaaaaaaaaaaaaaa', 'hex'),
      Buffer.from('bbbbbbbbbbbbbbbb', 'hex')
    ]
    const random = () => draws.shift() as Buffer
    expect(newBlockMarker('tem aaaaaaaaaaaaaaaa dentro', random)).toBe(
      'bbbbbbbbbbbbbbbb'
    )
  })
})

describe('the marker source', () => {
  it('differs from block to block', () => {
    const markers = new Set(
      Array.from({ length: 20 }, () => newBlockMarker('x'))
    )
    expect(markers.size).toBe(20)
  })
})

describe('renderPreviewBlock', () => {
  const text = `INICIO-${'x'.repeat(5000)}-FIM`
  const block = (over = {}) =>
    renderPreviewBlock({
      toolId: 'tool.x',
      text,
      headBytes: 10,
      tailBytes: 6,
      stored: { locator: 'spill_abc' },
      truncatedAtSource: false,
      commitUncertain: false,
      marker: '0123456789abcdef',
      ...over
    })
  it('declares size, hash, slice sizes, omitted bytes, storage and locator', () => {
    const lines = block().split('\n')
    expect(lines[0]).toBe(
      `[resultado de ferramenta cortado:0123456789abcdef] ferramenta=tool.x bytes=${utf8Bytes(text)} sha256=${sha256Hex(text).slice(0, 16)} previewHeadBytes=10 previewTailBytes=6 omitidos=${utf8Bytes(text) - 16} armazenado=sim locator=spill_abc`
    )
    expect(lines.slice(1)).toEqual([
      '--- início:0123456789abcdef ---',
      'INICIO-xxx',
      '--- meio:0123456789abcdef ---',
      'xxxx-FIM'.slice(-6),
      '--- fim:0123456789abcdef ---'
    ])
  })
  it('says armazenado=não without a locator, and flags the source cut and the uncertain commit', () => {
    const header = block({
      stored: null,
      truncatedAtSource: true,
      commitUncertain: true
    }).split('\n')[0]!
    expect(header).toContain('armazenado=não')
    expect(header).not.toContain('locator=')
    expect(header).toContain('cortadoNaOrigem')
    expect(header).toContain('commitIncerto')
  })
  it('reports what it really cut when the slices overlap the whole text', () => {
    const header = renderPreviewBlock({
      toolId: 't',
      text: 'abc',
      headBytes: 10,
      tailBytes: 10,
      stored: null,
      truncatedAtSource: false,
      commitUncertain: false,
      marker: '0123456789abcdef'
    }).split('\n')[0]!
    expect(header).toContain('omitidos=0')
  })
})

class ScriptedStore implements SpillStore {
  readonly puts: SpillPutInput[] = []
  constructor(
    private readonly outcomes: (Error | 'ok')[],
    readonly durability: 'process' | 'shared' = 'shared'
  ) {}
  async put(input: SpillPutInput): Promise<SpillReceipt> {
    this.puts.push(input)
    const outcome = this.outcomes.shift() ?? 'ok'
    if (outcome !== 'ok') throw outcome
    return {
      locator: `spill_scripted_${this.puts.length}`,
      bytes: utf8Bytes(input.content),
      sha256: sha256Hex(input.content),
      createdAt: '2026-10-30T00:00:00.000Z',
      expiresAt: '2026-10-31T00:00:00.000Z'
    }
  }
  async read(): Promise<SpillSlice> {
    throw new SpillNotFound('not used')
  }
}

const prepare = (
  output: unknown,
  extra: Partial<Parameters<typeof prepareToolOutput>[0]> = {}
) =>
  prepareToolOutput({
    tenantId: 'tenant_a',
    sessionId: 'session_a',
    executionId: 'exec_a',
    operationKey: 'op_a',
    toolId: 'tool.x',
    classification: 'CONFIDENTIAL',
    output,
    policy,
    storedSoFar: 0,
    marker: () => '0123456789abcdef',
    ...extra
  })

describe('prepareToolOutput: the threshold', () => {
  it('shows an output at the threshold whole, without a store', async () => {
    const store = new ScriptedStore([])
    const out = 'a'.repeat(T)
    const prepared = await prepare(out, { store })
    expect(prepared.rendering).toMatchObject({
      form: 'inline',
      text: out,
      bytes: T,
      stored: false
    })
    expect(prepared.wrote).toBe(false)
    expect(store.puts).toHaveLength(0)
  })
  it('previews and stores one byte above the threshold', async () => {
    const store = new ScriptedStore([])
    const out = 'a'.repeat(T + 1)
    const prepared = await prepare(out, { store })
    expect(prepared.rendering).toMatchObject({
      form: 'preview',
      bytes: T + 1,
      stored: true,
      locator: 'spill_scripted_1'
    })
    expect(prepared.wrote).toBe(true)
    expect(store.puts[0]).toMatchObject({
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      executionId: 'exec_a',
      operationKey: 'op_a',
      sourceId: 'tool.x',
      classification: 'CONFIDENTIAL',
      mediaType: 'text/plain',
      content: out
    })
  })
  it('measures bytes, not characters, against the threshold', async () => {
    const characters = 'ç'.repeat(T / 2 + 1)
    expect(characters.length).toBeLessThan(T)
    expect((await prepare(characters)).rendering.form).toBe('preview')
  })
  it('stores a JSON output as application/json', async () => {
    const store = new ScriptedStore([])
    await prepare({ texto: 'x'.repeat(T) }, { store })
    expect(store.puts[0]!.mediaType).toBe('application/json')
  })
})

describe('prepareToolOutput: when it does not store (I5, I14, I7)', () => {
  const big = 'b'.repeat(T + 1)
  it('has no store', async () => {
    const prepared = await prepare(big)
    expect(prepared.rendering.stored).toBe(false)
    expect(prepared.rendering.text).toContain('armazenado=não')
  })
  it('refuses a store that lives in one process unless the composition is a test', async () => {
    const store = new ScriptedStore([], 'process')
    expect((await prepare(big, { store })).rendering.stored).toBe(false)
    expect(store.puts).toHaveLength(0)
    expect(
      (await prepare(big, { store, allowProcessLocal: true })).rendering.stored
    ).toBe(true)
  })
  it('does not store more than the policy allows per object and per turn', async () => {
    const store = new ScriptedStore([])
    const tooBig = 'c'.repeat(policy.maxStoredBytes + 1)
    expect((await prepare(tooBig, { store })).rendering.stored).toBe(false)
    expect(
      (await prepare(big, { store, storedSoFar: policy.maxLocatorsPerTurn }))
        .rendering.stored
    ).toBe(false)
    expect(
      (
        await prepare(big, {
          store,
          storedSoFar: policy.maxLocatorsPerTurn - 1
        })
      ).rendering.stored
    ).toBe(true)
  })
  it('does not start a write after the turn was cancelled', async () => {
    const store = new ScriptedStore([])
    const controller = new AbortController()
    controller.abort()
    const prepared = await prepare(big, { store, signal: controller.signal })
    expect(prepared.rendering.stored).toBe(false)
    expect(store.puts).toHaveLength(0)
  })
})

describe('prepareToolOutput: failure and the single repeat (SPEC 0293 §3.5)', () => {
  const big = 'd'.repeat(T + 1)
  it('repeats once after a retryable error and then stores', async () => {
    const store = new ScriptedStore([new SpillStorageUnavailable('down')])
    const prepared = await prepare(big, { store })
    expect(store.puts).toHaveLength(2)
    expect(prepared.rendering.stored).toBe(true)
  })
  it('repeats once after an unknown commit and flags it when the repeat fails too', async () => {
    const store = new ScriptedStore([
      new SpillCommitUnknown('?'),
      new SpillCommitUnknown('?')
    ])
    const prepared = await prepare(big, { store })
    expect(store.puts).toHaveLength(2)
    expect(prepared.rendering.stored).toBe(false)
    expect(prepared.rendering.text).toContain('commitIncerto')
  })
  it('does not flag an uncertain commit that the repeat resolved', async () => {
    const store = new ScriptedStore([new SpillCommitUnknown('?')])
    const prepared = await prepare(big, { store })
    expect(prepared.rendering.stored).toBe(true)
    expect(prepared.rendering.text).not.toContain('commitIncerto')
  })
  it('never repeats a non-retryable error nor an unknown shape', async () => {
    for (const error of [
      new SpillTooLarge('x'),
      new Error('plain'),
      'oops' as unknown as Error
    ]) {
      const store = new ScriptedStore([error])
      const prepared = await prepare(big, { store })
      expect(store.puts).toHaveLength(1)
      expect(prepared.rendering.stored).toBe(false)
      expect(prepared.rendering.text).not.toContain('commitIncerto')
    }
  })
  it('does not repeat once the turn was cancelled', async () => {
    const controller = new AbortController()
    const store = new ScriptedStore([new SpillStorageUnavailable('down')])
    const original = store.put.bind(store)
    store.put = async (input) => {
      controller.abort()
      return original(input)
    }
    await prepare(big, { store, signal: controller.signal })
    expect(store.puts).toHaveLength(1)
  })
})

describe('InMemorySpillStore', () => {
  const clock = (iso: string) => () => new Date(iso)
  const put = (store: InMemorySpillStore, content: string, over = {}) =>
    store.put({
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      executionId: 'exec_a',
      operationKey: 'op_a',
      sourceId: 'tool.x',
      classification: 'CONFIDENTIAL',
      mediaType: 'text/plain',
      content,
      ...over
    })
  const read = (store: InMemorySpillStore, locator: string, over = {}) =>
    store.read({
      tenantId: 'tenant_a',
      sessionId: 'session_a',
      locator,
      offset: 0,
      length: 100,
      ...over
    })

  it('is only a process-local fixture', () => {
    expect(new InMemorySpillStore().durability).toBe('process')
  })
  it('returns an opaque locator with exact bytes and hash', async () => {
    const store = new InMemorySpillStore()
    const receipt = await put(store, 'ação clínica')
    expect(receipt.locator).toMatch(/^spill_[A-Za-z0-9_-]{22}$/)
    expect(receipt.bytes).toBe(utf8Bytes('ação clínica'))
    expect(receipt.sha256).toBe(sha256Hex('ação clínica'))
    expect(receipt.locator).not.toContain('tenant')
    expect(receipt.locator).not.toContain('session')
  })
  it('is idempotent and keeps the original expiry (I6)', async () => {
    let now = '2026-10-30T00:00:00.000Z'
    const store = new InMemorySpillStore({ clock: () => new Date(now) })
    const first = await put(store, 'mesmo')
    now = '2026-10-30T12:00:00.000Z'
    const again = await put(store, 'mesmo')
    expect(again.locator).toBe(first.locator)
    expect(again.expiresAt).toBe(first.expiresAt)
    expect(again.createdAt).toBe(first.createdAt)
    expect((await put(store, 'outro')).locator).not.toBe(first.locator)
    expect(
      (await put(store, 'mesmo', { operationKey: 'op_b' })).locator
    ).not.toBe(first.locator)
  })
  it('refuses content above the stored limit', async () => {
    const store = new InMemorySpillStore({
      policy: {
        maxStoredBytes: 10_000,
        thresholdBytes: 4_000,
        previewHeadBytes: 100,
        previewTailBytes: 100
      }
    })
    await expect(put(store, 'z'.repeat(10_001))).rejects.toBeInstanceOf(
      SpillTooLarge
    )
    await expect(put(store, 'z'.repeat(10_000))).resolves.toBeDefined()
  })
  it('reads a slice with its position and end of data', async () => {
    const store = new InMemorySpillStore()
    const { locator } = await put(store, 'abcdefghij')
    expect(await read(store, locator, { offset: 2, length: 3 })).toEqual({
      text: 'cde',
      offset: 2,
      bytesRead: 3,
      totalBytes: 10,
      eof: false
    })
    expect((await read(store, locator, { offset: 8, length: 5 })).eof).toBe(
      true
    )
  })
  it('caps a read at readMaxBytes', async () => {
    const store = new InMemorySpillStore({
      policy: { readMaxBytes: 4 }
    })
    const { locator } = await put(store, 'abcdefghij')
    expect((await read(store, locator, { length: 1000 })).bytesRead).toBe(4)
  })
  it('hides an object from another tenant or session, and an unknown locator (I4)', async () => {
    const store = new InMemorySpillStore()
    const { locator } = await put(store, 'segredo')
    await expect(
      read(store, locator, { tenantId: 'tenant_b' })
    ).rejects.toBeInstanceOf(SpillNotFound)
    await expect(
      read(store, locator, { sessionId: 'session_b' })
    ).rejects.toBeInstanceOf(SpillNotFound)
    await expect(read(store, 'spill_desconhecido')).rejects.toBeInstanceOf(
      SpillNotFound
    )
  })
  it('does not serve an expired object', async () => {
    let now = '2026-10-30T00:00:00.000Z'
    const store = new InMemorySpillStore({ clock: () => new Date(now) })
    const { locator } = await put(store, 'vale um dia')
    now = '2026-10-30T23:59:59.999Z'
    await expect(read(store, locator)).resolves.toBeDefined()
    now = '2026-10-31T00:00:00.000Z'
    await expect(read(store, locator)).rejects.toBeInstanceOf(SpillExpired)
  })
  it('validates its policy at construction', () => {
    expect(() => new InMemorySpillStore({ policy: { ttlMs: 0 } })).toThrow(
      SpillPolicyError
    )
    void clock
  })
})

const BIG_TOOL = 'synthetic.slice1-tool'

function registryOf(
  output: unknown,
  extra: Partial<ToolDefinition> = {}
): ToolRegistry {
  const base = createPhase3ToolRegistry({ availability: 'AVAILABLE' })
  const tool: ToolDefinition = {
    id: BIG_TOOL,
    version: 'v1',
    description: 'Returns a synthetic result.',
    inputSchema: { type: 'object' },
    outputSchema: {},
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    requiresApproval: false,
    execute: async () => ({ status: 'SUCCEEDED', output }),
    ...extra
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

async function runIterative(
  output: unknown,
  spill?: SpillComposition,
  toolExtra: Partial<ToolDefinition> = {},
  toolCalls = 1,
  signal?: AbortSignal
) {
  const seen: IterativeOrchestratorInput[] = []
  let calls = 0
  const orchestrator: IterativeOrchestrator = {
    decide: async (input) => {
      seen.push(input)
      calls += 1
      return {
        decision:
          calls <= toolCalls
            ? decision({
                decisionType: 'CALL_TOOL',
                toolId: BIG_TOOL,
                toolInput: { n: calls }
              })
            : decision({
                decisionType: 'RESPOND',
                reasonCode: 'GOAL_SATISFIED',
                responseText: 'ok'
              }),
        usage: EMPTY_MODEL_USAGE
      }
    }
  }
  const runtime = new IterativeGovernedRuntime({
    orchestrator,
    modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: registryOf(output, toolExtra),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: new InMemoryExecutionStepStore(),
    contextEngine: new DefaultContextEngine(),
    ...(spill ? { spill } : {})
  })
  const result = await runtime.execute(
    phase3RuntimeInput({
      agent: phase3AgentProfile({ tools: [BIG_TOOL] }),
      ...(signal ? { signal } : {})
    })
  )
  const last = seen[seen.length - 1]!
  return {
    result,
    last,
    view: last.context.contextItems.map((i) => i.content).join('\n')
  }
}

describe('the runtime wiring (SPEC 0293 §3.3, §3.5)', () => {
  it('shows an output up to the threshold whole instead of 300 characters', async () => {
    const text = `INICIO-${'m'.repeat(5_000)}-FIM`
    const { view, last } = await runIterative(text)
    expect(view).toContain(text)
    const observation = last.context.observations.find(
      (o) => o.type === 'TOOL_RESULT'
    )!
    expect(observation.rendering).toMatchObject({
      form: 'inline',
      stored: false
    })
  })
  it('shows a larger output as a preview block with the locator of the stored content', async () => {
    const store = new InMemorySpillStore()
    const content = `CABECA-${'n'.repeat(20_000)}-CAUDA`
    const { view, last } = await runIterative(content, {
      store,
      allowProcessLocal: true
    })
    expect(view).toMatch(/\[resultado de ferramenta cortado:[0-9a-f]{16}\]/)
    expect(view).toContain('armazenado=sim')
    expect(view).toContain('CABECA-')
    expect(view).toContain('-CAUDA')
    const observation = last.context.observations.find(
      (o) => o.type === 'TOOL_RESULT'
    )!
    expect(observation.rendering).toMatchObject({
      form: 'preview',
      stored: true
    })
  })
  it('puts a cut marker in the 300-character summary and leaves a short one alone', async () => {
    const long = await runIterative('s'.repeat(1_000))
    const longObs = long.last.context.observations.find(
      (o) => o.type === 'TOOL_RESULT'
    )!
    expect(longObs.summary).toContain('[…cortado: 1000 bytes no total]')
    const short = await runIterative({ ok: true })
    const shortObs = short.last.context.observations.find(
      (o) => o.type === 'TOOL_RESULT'
    )!
    expect(shortObs.summary).toBe('{"ok":true}')
  })
  it('marks an output the tool itself reported as cut', async () => {
    const { view } = await runIterative({
      truncated: true,
      stdout: 'x'.repeat(20_000)
    })
    expect(view).toContain('cortadoNaOrigem')
  })
  it('refuses the turn for a decisive tool whose big result cannot be stored', async () => {
    const { result } = await runIterative('r'.repeat(20_000), undefined, {
      requiresCompleteResult: true
    })
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('too large')
  })
  it('does not refuse a decisive tool whose big result was stored', async () => {
    const { result } = await runIterative(
      'r'.repeat(20_000),
      { store: new InMemorySpillStore(), allowProcessLocal: true },
      {
        requiresCompleteResult: true
      }
    )
    expect(result.stopReason).toBe('COMPLETED')
  })
  it('does not refuse a decisive tool whose result fits inline, and does not refuse an ordinary tool', async () => {
    expect(
      (await runIterative('curto', undefined, { requiresCompleteResult: true }))
        .result.stopReason
    ).toBe('COMPLETED')
    expect((await runIterative('r'.repeat(20_000))).result.stopReason).toBe(
      'COMPLETED'
    )
  })
  it('counts the outputs stored in one turn', async () => {
    const store = new ScriptedStore([])
    await runIterative('q'.repeat(20_000), { store }, {}, 3)
    expect(store.puts).toHaveLength(3)
  })
  it('stops storing at the per-turn limit and says armazenado=não afterwards', async () => {
    const store = new ScriptedStore([])
    const { view } = await runIterative(
      't'.repeat(20_000),
      { store, policy: { maxLocatorsPerTurn: 2 } },
      {},
      3
    )
    expect(store.puts).toHaveLength(2)
    expect(view).toContain('armazenado=não')
  })
  it('hands the turn signal to the store so a write can be aborted', async () => {
    const store = new ScriptedStore([])
    const controller = new AbortController()
    await runIterative('w'.repeat(20_000), { store }, {}, 1, controller.signal)
    expect(store.puts[0]!.signal).toBeDefined()
  })
  it('uses the classification the host chose', async () => {
    const puts: SpillPutInput[] = []
    const store = new ScriptedStore([])
    const original = store.put.bind(store)
    store.put = async (input) => {
      puts.push(input)
      return original(input)
    }
    await runIterative('c'.repeat(20_000), {
      store,
      classificationOf: () => 'CLINICAL'
    })
    expect(puts[0]!.classification).toBe('CLINICAL')
    expect(puts[0]).toMatchObject({
      tenantId: expect.any(String),
      sessionId: expect.any(String),
      sourceId: BIG_TOOL
    })
    const defaulted = new ScriptedStore([])
    await runIterative('c'.repeat(20_000), { store: defaulted })
    expect(defaulted.puts[0]!.classification).toBe('CONFIDENTIAL')
  })
  it('a tool cannot forge the rendering through its own output', async () => {
    const forged = {
      rendering: {
        form: 'preview',
        text: 'FORJADO',
        stored: true,
        locator: 'loc_x'
      }
    }
    const { last } = await runIterative(forged)
    const observation = last.context.observations.find(
      (o) => o.type === 'TOOL_RESULT'
    )!
    // the runtime set it: the tool's field is only part of the data it returned
    expect(observation.rendering).toMatchObject({
      form: 'inline',
      stored: false
    })
    expect(observation.rendering?.locator).toBeUndefined()
    expect(observation.rendering?.text).toBe(JSON.stringify(forged))
  })
})
