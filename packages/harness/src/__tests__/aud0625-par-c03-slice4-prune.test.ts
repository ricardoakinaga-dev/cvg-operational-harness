import { describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  ModelRequest,
  SpillPutInput,
  SpillReceipt,
  SpillStore
} from '@cvg/harness-contracts'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import { digestMessages } from '../compaction.ts'
import { createKernelRuntime } from '../index.ts'
import type { KernelPlugin } from '../kernel/types.ts'
import { createModelCompactionControl } from '../model-compaction.ts'
import {
  SpillStorageUnavailable,
  deterministicBlockMarker,
  pruneToolMessages,
  sha256Hex,
  type SpillComposition
} from '../spill/index.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

/** PAR-C03 / SPEC 0293 slice 4: old tool results leave the compaction prefix as a preview plus locator. Synthetic data only. */

const BIG = `CABECA-${'m'.repeat(9_000)}-MEIO-PERDIDO-${'n'.repeat(9_000)}-CAUDA`

/** Deterministic and idempotent like the real stores: same operation + same content, same locator. */
class KeyedStore implements SpillStore {
  readonly durability: 'process' | 'shared'
  readonly puts: SpillPutInput[] = []
  readonly #locators = new Map<string, string>()
  expiredAt: string | undefined
  constructor(
    durability: 'process' | 'shared' = 'shared',
    private readonly onPut?: () => void
  ) {
    this.durability = durability
  }
  async put(input: SpillPutInput): Promise<SpillReceipt> {
    this.onPut?.()
    const key = `${input.tenantId}|${input.sessionId}|${input.operationKey}`
    let locator = this.#locators.get(key)
    if (!locator) {
      locator = `spill_${sha256Hex(key).slice(0, 12)}`
      this.#locators.set(key, locator)
      this.puts.push(input)
    }
    return {
      locator,
      bytes: input.content.length,
      sha256: sha256Hex(input.content),
      createdAt: '2026-10-30T00:00:00.000Z',
      expiresAt: this.expiredAt ?? '2026-10-31T00:00:00.000Z'
    }
  }
  async read(): Promise<never> {
    throw new Error('not used')
  }
}

const history = (
  messages: { role: 'tool' | 'assistant' | 'user'; content: string }[]
): KernelPlugin => ({
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
})

interface Setup {
  readonly messages?: { role: 'tool' | 'assistant' | 'user'; content: string }[]
  readonly spill?: SpillComposition
  readonly signal?: AbortSignal
  readonly noExecutionId?: boolean
}

async function run(setup: Setup = {}) {
  const sent: string[] = []
  const digests: string[] = []
  let compactionCalls = 0
  const gateway: ModelGateway = {
    complete: async (request: ModelRequest) => {
      if (request.purpose === 'COMPACTION') {
        compactionCalls += 1
        sent.push(request.messages.map((m) => m.content).join('\n'))
      }
      return {
        text: 'resumo',
        provider: 'synthetic',
        model: 'synthetic-v1',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      }
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
      history(
        setup.messages ?? [
          { role: 'tool', content: BIG },
          { role: 'assistant', content: 'resposta anterior' }
        ]
      ),
      createModelCompactionControl({
        maxInputTokens: 600,
        keepRecentMessages: 1,
        pinned: () => [],
        logSequenceOf: (index: number) => 100 + index,
        onCompacted: (r) => {
          digests.push(r.sourceDigest as string)
        },
        ...(setup.spill ? { spill: setup.spill } : {})
      })
    ]
  })
  const input = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    userMessage: 'pergunta atual',
    agent: phase3AgentProfile({ instructions: ['instrução curta'] }),
    ...(setup.signal ? { signal: setup.signal } : {})
  })
  if (setup.noExecutionId)
    delete (input as { executionId?: string }).executionId
  const result = await kernel.execute(input)
  return { result, sent, digests, compactionCalls, input }
}

describe('the prefix a compaction sends (SPEC 0293 §3.4)', () => {
  it('replaces a big tool message by a preview block and stores the exact content once', async () => {
    const store = new KeyedStore()
    const t = await run({ spill: { store } })
    expect(t.result.stopReason).toBe('COMPLETED')
    expect(t.sent[0]).toMatch(
      /\[resultado de ferramenta cortado:[0-9a-f]{16}\]/
    )
    expect(t.sent[0]).toContain('CABECA-')
    expect(t.sent[0]).toContain('-CAUDA')
    expect(t.sent[0]).not.toContain('MEIO-PERDIDO')
    expect(t.sent[0]).toContain(
      `locator=${'spill_' + sha256Hex(`${t.input.tenantId}|${t.input.sessionId}|compaction:${sha256Hex(BIG)}`).slice(0, 12)}`
    )
    expect(store.puts).toHaveLength(1)
    expect(store.puts[0]).toMatchObject({
      tenantId: t.input.tenantId,
      sessionId: t.input.sessionId,
      sourceId: 'tool-history',
      classification: 'CONFIDENTIAL',
      mediaType: 'text/plain',
      content: BIG,
      operationKey: `compaction:${sha256Hex(BIG)}`
    })
  })

  it('names the execution as unbound when the turn has none', async () => {
    const store = new KeyedStore()
    await run({ spill: { store }, noExecutionId: true })
    expect(store.puts[0]!.executionId).toBe('unbound')
    const named = new KeyedStore()
    await run({ spill: { store: named } })
    expect(named.puts[0]!.executionId).toBe('exec_phase3_fixture')
  })

  it('leaves the prefix as it is when no spill composition is given', async () => {
    const t = await run()
    expect(t.sent[0]).toContain('MEIO-PERDIDO')
    expect(t.sent[0]).not.toContain('resultado de ferramenta cortado')
  })

  it('touches only tool messages above the threshold', async () => {
    const hugeUser = `USUARIO-${'u'.repeat(12_000)}-FIM-USUARIO`
    const store = new KeyedStore()
    const t = await run({
      spill: { store },
      messages: [
        { role: 'user', content: hugeUser },
        { role: 'tool', content: 'resultado curto de ferramenta' },
        { role: 'assistant', content: 'resposta anterior' }
      ]
    })
    expect(t.sent[0]).toContain(hugeUser)
    expect(t.sent[0]).toContain('resultado curto de ferramenta')
    expect(store.puts).toHaveLength(0)
  })

  it('records a digest over the text it sent, not over the raw output', async () => {
    const store = new KeyedStore()
    const t = await run({ spill: { store } })
    const scope = {
      tenantId: t.input.tenantId,
      sessionId: t.input.sessionId,
      executionId: t.input.executionId ?? 'unbound'
    }
    const rawPrefix = [
      { sequence: 2, role: 'tool' as const, content: BIG },
      { sequence: 3, role: 'assistant' as const, content: 'resposta anterior' }
    ]
    const pruned = await pruneToolMessages(rawPrefix, scope, { store })
    expect(t.digests[0]).toBe(digestMessages(pruned))
    expect(t.digests[0]).not.toBe(digestMessages(rawPrefix))
    const plain = await run()
    expect(plain.digests[0]).toBe(digestMessages(rawPrefix))
  })

  it('gives the same text and the same digest on every pass, also after the object expired (I13)', async () => {
    const store = new KeyedStore()
    const first = await run({ spill: { store } })
    store.expiredAt = '2026-12-31T00:00:00.000Z'
    const second = await run({ spill: { store } })
    expect(second.digests[0]).toBe(first.digests[0])
    expect(second.sent[0]).toBe(first.sent[0])
    // the block carries no expiry: it could not stay the same if it did
    expect(first.sent[0]).not.toContain('expiraEm')
    expect(store.puts).toHaveLength(1)
  })

  it('announces armazenado=não, deterministically, when the store fails', async () => {
    const failing: SpillStore = {
      durability: 'shared',
      put: async () => {
        throw new SpillStorageUnavailable('down')
      },
      read: async () => {
        throw new Error('unused')
      }
    }
    const a = await run({ spill: { store: failing } })
    const b = await run({ spill: { store: failing } })
    expect(a.result.stopReason).toBe('COMPLETED')
    expect(a.sent[0]).toContain('armazenado=não')
    expect(a.sent[0]).not.toContain('MEIO-PERDIDO')
    expect(a.digests[0]).toBe(b.digests[0])
  })

  it('does not store in a store that lives in one process unless the composition is a test', async () => {
    const store = new KeyedStore('process')
    const t = await run({ spill: { store } })
    expect(t.sent[0]).toContain('armazenado=não')
    expect(store.puts).toHaveLength(0)
    const allowed = new KeyedStore('process')
    const u = await run({ spill: { store: allowed, allowProcessLocal: true } })
    expect(u.sent[0]).toContain('armazenado=sim')
  })

  it('stores no more than the per-turn limit and shows the rest as not stored', async () => {
    const store = new KeyedStore()
    const other = `OUTRA-${'o'.repeat(20_000)}-FIM`
    const t = await run({
      spill: { store, policy: { maxLocatorsPerTurn: 1 } },
      messages: [
        { role: 'tool', content: BIG },
        { role: 'tool', content: other },
        { role: 'assistant', content: 'resposta anterior' }
      ]
    })
    expect(store.puts).toHaveLength(1)
    expect(t.sent[0]?.match(/armazenado=sim/g)).toHaveLength(1)
    expect(t.sent[0]?.match(/armazenado=não/g)).toHaveLength(1)
  })

  it('a turn cancelled while the prefix is being pruned sends and records nothing', async () => {
    const controller = new AbortController()
    const store = new KeyedStore('shared', () => controller.abort())
    const t = await run({
      spill: { store },
      signal: controller.signal,
      messages: [
        { role: 'tool', content: BIG },
        { role: 'tool', content: `${BIG}-OUTRA` },
        { role: 'assistant', content: 'resposta anterior' }
      ]
    })
    // the write that was in flight finished; no second one started after the abort
    expect(store.puts).toHaveLength(1)
    expect(t.compactionCalls).toBe(0)
    expect(t.digests).toHaveLength(0)
    expect(t.result.stopReason).toBe('CANCELLED')
  })
})

describe('pruneToolMessages and the deterministic marker', () => {
  const scope = { tenantId: 't', sessionId: 's', executionId: 'e' }
  it('keeps a message at the threshold and prunes one byte above it, counting bytes', async () => {
    const at = 'a'.repeat(8_192)
    const over = 'a'.repeat(8_193)
    const multibyte = 'ç'.repeat(4_097) // 8 194 bytes, 4 097 characters
    const out = await pruneToolMessages(
      [
        { role: 'tool', content: at },
        { role: 'tool', content: over },
        { role: 'tool', content: multibyte }
      ],
      scope,
      {}
    )
    expect(out[0]!.content).toBe(at)
    expect(out[1]!.content).toContain('resultado de ferramenta cortado')
    expect(out[2]!.content).toContain('resultado de ferramenta cortado')
  })
  it('gives each tenant and session its own block for the same content', async () => {
    const a = await pruneToolMessages(
      [{ role: 'tool', content: BIG }],
      scope,
      {}
    )
    const b = await pruneToolMessages(
      [{ role: 'tool', content: BIG }],
      { ...scope, sessionId: 'outra' },
      {}
    )
    const c = await pruneToolMessages(
      [{ role: 'tool', content: BIG }],
      { ...scope, tenantId: 'outro' },
      {}
    )
    expect(new Set([a[0]!.content, b[0]!.content, c[0]!.content]).size).toBe(3)
    expect(
      (await pruneToolMessages([{ role: 'tool', content: BIG }], scope, {}))[0]!
        .content
    ).toBe(a[0]!.content)
  })
  it('does not mutate its input and keeps the other fields', async () => {
    const input = [{ sequence: 7, role: 'tool', content: BIG }]
    const out = await pruneToolMessages(input, scope, {})
    expect(input[0]!.content).toBe(BIG)
    expect(out[0]).toMatchObject({ sequence: 7, role: 'tool' })
  })
  it('refuses an unusable policy', async () => {
    await expect(
      pruneToolMessages([{ role: 'tool', content: BIG }], scope, {
        policy: { thresholdBytes: 0 }
      })
    ).rejects.toThrow()
  })
  it('depends on the scope and on the content, and avoids a marker the content carries', () => {
    const a = deterministicBlockMarker('conteúdo', 't\u0000s')
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(deterministicBlockMarker('conteúdo', 't\u0000s')).toBe(a)
    expect(deterministicBlockMarker('conteúdo', 't\u0000z')).not.toBe(a)
    expect(deterministicBlockMarker('outro', 't\u0000s')).not.toBe(a)
    // a content that carries the first candidate moves on to the next one
    const hash = (text: string) =>
      text.endsWith('\u00000') ? 'a'.repeat(64) : 'b'.repeat(64)
    expect(
      deterministicBlockMarker('tem aaaaaaaaaaaaaaaa dentro', 's', hash)
    ).toBe('b'.repeat(16))
    expect(deterministicBlockMarker('limpo', 's', hash)).toBe('a'.repeat(16))
  })
})
