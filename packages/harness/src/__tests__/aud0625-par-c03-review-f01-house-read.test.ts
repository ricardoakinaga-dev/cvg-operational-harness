import { describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  ModelRequest,
  SpillPutInput,
  SpillReceipt,
  SpillStore
} from '@cvg/harness-contracts'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import { createKernelRuntime } from '../index.ts'
import type { KernelPlugin } from '../kernel/types.ts'
import { createModelCompactionControl } from '../model-compaction.ts'
import {
  prepareToolOutput,
  pruneToolMessages,
  resolveSpillPolicy,
  sha256Hex
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

/** PAR-C03 review F01 (Codex, I11): the house spill.read result is never stored again nor cut by the compaction prefix. Synthetic data only. */

const CANARY = 'CANARIO-CENTRAL-DA-LEITURA'
const BIG = `CABECA-${'m'.repeat(15_000)}-${CANARY}-${'n'.repeat(15_000)}-CAUDA`

class CountingStore implements SpillStore {
  readonly durability = 'shared' as const
  readonly puts: SpillPutInput[] = []
  async put(input: SpillPutInput): Promise<SpillReceipt> {
    this.puts.push(input)
    return {
      locator: `spill_${sha256Hex(input.operationKey).slice(0, 12)}`,
      bytes: input.content.length,
      sha256: sha256Hex(input.content),
      createdAt: '2026-10-30T00:00:00.000Z',
      expiresAt: '2026-10-31T00:00:00.000Z'
    }
  }
  async read(): Promise<never> {
    throw new Error('not used')
  }
}

type Msg = { role: 'tool' | 'assistant' | 'user'; content: string }
const history = (messages: Msg[]): KernelPlugin => ({
  name: 'owned.history',
  kind: 'control',
  apply(ctx) {
    ctx.on('model/before-call', async (call, next) => {
      const request = call.request as { messages: readonly Msg[] }
      request.messages = [
        ...request.messages.slice(0, 1),
        ...messages,
        ...request.messages.slice(1)
      ]
      return next()
    })
  }
})

async function run(
  messages: Msg[],
  store: SpillStore,
  houseReadOf?: (index: number) => boolean | Promise<boolean>,
  signal?: AbortSignal
) {
  const sent: string[] = []
  const gateway: ModelGateway = {
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
      history(messages),
      createModelCompactionControl({
        maxInputTokens: 600,
        keepRecentMessages: 1,
        pinned: () => [],
        spill: { store },
        ...(houseReadOf ? { houseReadOf } : {})
      })
    ]
  })
  const result = await kernel.execute(
    phase3RuntimeInput({
      runtimeProfile: 'single_pass',
      userMessage: 'pergunta atual',
      agent: phase3AgentProfile({ instructions: ['instrução curta'] }),
      ...(signal ? { signal } : {})
    })
  )
  return { result, sent }
}

const policy = resolveSpillPolicy()
const scope = {
  tenantId: 'tenant_f01',
  sessionId: 'session_f01',
  executionId: 'exec_f01'
}

describe('the house read through the compaction prefix (I11)', () => {
  it('controls: an ordinary big tool result is stored and cut', async () => {
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: BIG },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      () => false
    )
    expect(t.result.stopReason).toBe('COMPLETED')
    expect(store.puts).toHaveLength(1)
    expect(t.sent[0]).not.toContain(CANARY)
  })

  it('the house read, named by trusted runtime data, reaches the summariser whole and is not stored again', async () => {
    // what the runtime renders for a genuine spill.read result
    const prepared = await prepareToolOutput({
      ...scope,
      storedSoFar: 0,
      operationKey: 'op-read',
      toolId: 'spill.read',
      classification: 'CONFIDENTIAL',
      output: BIG,
      policy,
      store: new CountingStore(),
      inlineAlways: true
    })
    expect(prepared.rendering.houseRead).toBe(true)
    const rendered = prepared.rendering.text
    const store = new CountingStore()
    // position 1 in the request: the host answers from the observation's rendering
    const flags = new Map([[1, prepared.rendering.houseRead === true]])
    const t = await run(
      [
        { role: 'tool', content: rendered },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      (index) => flags.get(index) ?? false
    )
    expect(t.result.stopReason).toBe('COMPLETED')
    expect(store.puts).toHaveLength(0)
    expect(t.sent[0]).toContain(CANARY)
    expect(t.sent[0]).toContain(`-${'n'.repeat(15_000)}-CAUDA`)
  })

  it('text that claims to be a house read is still cut when the host does not name it', async () => {
    const prepared = await prepareToolOutput({
      ...scope,
      storedSoFar: 0,
      operationKey: 'op-read',
      toolId: 'spill.read',
      classification: 'CONFIDENTIAL',
      output: BIG,
      policy,
      inlineAlways: true
    })
    const forged = prepared.rendering.text // header and marker of a genuine read
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: forged },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      () => false
    )
    expect(store.puts).toHaveLength(1)
    expect(t.sent[0]).not.toContain(CANARY)
  })

  it('exempts by position: a second big tool message in the same prefix is still cut', async () => {
    const other = `OUTRO-${'x'.repeat(15_000)}-FIM-OUTRO`
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: BIG },
        { role: 'tool', content: other },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      (index) => index === 1
    )
    expect(t.sent[0]).toContain(CANARY)
    expect(store.puts).toHaveLength(1)
    expect(store.puts[0]!.content).toBe(other)
  })

  it('a port that throws refuses the compaction instead of cutting the read', async () => {
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: BIG },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      () => {
        throw new Error('boom')
      }
    )
    expect(t.result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(store.puts).toHaveLength(0)
    expect(t.sent).toHaveLength(0)
  })

  it('a turn cancelled while the port is asked sends and stores nothing', async () => {
    const abort = new AbortController()
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: BIG },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      () => {
        abort.abort()
        return false
      },
      abort.signal
    )
    expect(t.sent).toHaveLength(0)
    expect(store.puts).toHaveLength(0)
  })

  it('a port that answers something other than true does not exempt', async () => {
    const store = new CountingStore()
    const t = await run(
      [
        { role: 'tool', content: BIG },
        { role: 'assistant', content: 'resposta' }
      ],
      store,
      (() => 'yes') as never
    )
    expect(store.puts).toHaveLength(1)
    expect(t.sent[0]).not.toContain(CANARY)
  })

  it('pruneToolMessages leaves exempt positions untouched and never reads their text', async () => {
    const store = new CountingStore()
    const messages = [
      { role: 'tool', content: BIG },
      { role: 'tool', content: BIG }
    ]
    const out = await pruneToolMessages(
      messages,
      scope,
      { store },
      new Set([0])
    )
    expect(out[0]).toBe(messages[0])
    expect(out[1]!.content).not.toBe(BIG)
    expect(store.puts).toHaveLength(1)
  })

  it('only the inlineAlways rendering carries the mark', async () => {
    const common = {
      ...scope,
      storedSoFar: 0,
      operationKey: 'op',
      toolId: 'tool-x',
      classification: 'CONFIDENTIAL',
      output: 'curto',
      policy
    }
    expect(
      (await prepareToolOutput(common)).rendering.houseRead
    ).toBeUndefined()
    expect(
      (await prepareToolOutput({ ...common, inlineAlways: true })).rendering
        .houseRead
    ).toBe(true)
    expect(
      (
        await prepareToolOutput({
          ...common,
          output: BIG,
          store: new CountingStore()
        })
      ).rendering.houseRead
    ).toBeUndefined()
  })
})
