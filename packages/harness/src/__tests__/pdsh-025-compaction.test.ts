import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { canonicalizeJson } from '@cvg/harness-contracts'
import type {
  ModelGateway,
  ModelRequest,
  RuntimeInput
} from '@cvg/harness-contracts'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import {
  COMPACTION_STRATEGY_VERSION,
  COMPACTION_SUMMARY_FRAME,
  compactConversation,
  createCompactionControl,
  createSessionCompactionRecorder,
  estimateContextTokens,
  type CompactableMessage,
  type ContextCompactionResult
} from '../compaction.ts'
import { createKernelRuntime, InMemorySessionEventStore } from '../index.ts'
import type { KernelPlugin } from '../kernel/types.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const TENANT = 'tenant_synthetic_compaction'
const SESSION = 'session_compaction_synthetic'

function messages(): CompactableMessage[] {
  return [
    {
      sequence: 1,
      role: 'user',
      content: 'primeira pergunta longa '.repeat(20)
    },
    {
      sequence: 2,
      role: 'assistant',
      content: 'primeira resposta longa '.repeat(20)
    },
    { sequence: 3, role: 'user', content: 'segunda pergunta '.repeat(20) },
    {
      sequence: 4,
      role: 'assistant',
      content: 'segunda resposta '.repeat(20)
    },
    { sequence: 5, role: 'user', content: 'pergunta atual' }
  ]
}

/** Earlier turns of the conversation, placed before the compaction control. */
const history: KernelPlugin = {
  name: 'owned.history',
  kind: 'control',
  apply(ctx) {
    ctx.on('model/before-call', async (call, next) => {
      const request = call.request as {
        messages: readonly ModelRequest['messages'][number][]
      }
      request.messages = [
        request.messages[0] as ModelRequest['messages'][number],
        { role: 'user', content: 'pergunta anterior longa '.repeat(40) },
        { role: 'assistant', content: 'resposta anterior longa '.repeat(40) },
        ...request.messages.slice(1)
      ]
      return next()
    })
  }
}

function buildRuntime(
  options: {
    readonly instructions?: readonly string[]
    readonly onCompacted?: (result: ContextCompactionResult) => void
    readonly maxInputTokens?: number
    readonly withHistory?: boolean
  } = {}
) {
  const captured: ModelRequest[] = []
  const modelGateway: ModelGateway = {
    complete: async (request) => {
      captured.push(request)
      return {
        text: 'resposta sintética',
        provider: 'synthetic',
        model: 'synthetic-v1',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      }
    }
  }
  const runtime = createKernelRuntime({
    orchestrator: new SinglePassOrchestrator(),
    modelGateway,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    plugins: [
      ...(options.withHistory ? [history] : []),
      createCompactionControl({
        maxInputTokens: options.maxInputTokens ?? 50,
        keepRecentMessages: 1,
        ...(options.onCompacted ? { onCompacted: options.onCompacted } : {})
      })
    ]
  })
  const input: RuntimeInput = phase3RuntimeInput({
    runtimeProfile: 'single_pass',
    userMessage: 'pergunta atual do plantão',
    agent: phase3AgentProfile({
      instructions: options.instructions ?? ['instrução curta']
    })
  })
  return { runtime, input, captured }
}

describe('PDSH-025 deterministic context compaction (SPEC 0206)', () => {
  it('estimates deterministically and skips compaction below the cap', () => {
    expect(
      estimateContextTokens([{ content: '12345678' }, { content: '1234' }])
    ).toBe(3)
    const input = messages()
    const frozen = canonicalizeJson(input)
    const result = compactConversation(input, { maxInputTokens: 10_000 })
    expect(result.compacted).toBe(false)
    expect(result.inputTokens).toBeGreaterThan(0)
    expect(result.droppedMessages).toBe(0)
    expect(result.throughSequence).toBeNull()
    expect(result.sourceDigest).toBeNull()
    expect(result.summary).toBeNull()
    expect(result.messages).toEqual(input)
    expect(result.messages).not.toBe(input)
    expect(canonicalizeJson(input)).toBe(frozen)
  })

  it('never compacts a single message even above the cap', () => {
    const result = compactConversation(
      [{ sequence: 1, role: 'user', content: 'x'.repeat(400) }],
      { maxInputTokens: 1 }
    )
    expect(result.compacted).toBe(false)
    expect(result.messages).toHaveLength(1)
  })

  it('compacts the prefix into a deterministic, bounded summary with a canonical digest', () => {
    const input = messages()
    const frozen = canonicalizeJson(input)
    const first = compactConversation(input, {
      maxInputTokens: 10,
      keepRecentMessages: 2
    })
    const second = compactConversation(input, {
      maxInputTokens: 10,
      keepRecentMessages: 2
    })
    expect(first.compacted).toBe(true)
    expect(canonicalizeJson(second)).toBe(canonicalizeJson(first))
    expect(first.keptMessages).toBe(2)
    expect(first.droppedMessages).toBe(3)
    expect(first.throughSequence).toBe(3)
    expect(first.strategyVersion).toBe(COMPACTION_STRATEGY_VERSION)
    expect(first.sourceDigest).toMatch(/^[0-9a-f]{64}$/)
    const expectedDigest = createHash('sha256')
      .update(canonicalizeJson(input.slice(0, 3)))
      .digest('hex')
    expect(first.sourceDigest).toBe(expectedDigest)
    // SPEC 0290 §3.3: history becomes a `user` data message, never `system`.
    expect(first.messages[0]).toMatchObject({ role: 'user' })
    expect((first.messages[0] as { content: string }).content).toContain(
      `[contexto compactado] ${COMPACTION_SUMMARY_FRAME}`
    )
    expect(first.messages.slice(1)).toEqual(input.slice(3))
    expect(canonicalizeJson(input)).toBe(frozen)
  })

  it('clamps the window and bounds the summary length', () => {
    const clamped = compactConversation(messages(), {
      maxInputTokens: 10,
      keepRecentMessages: 0
    })
    expect(clamped.keptMessages).toBe(4)
    expect(clamped.droppedMessages).toBe(1)
    const bounded = compactConversation(messages(), {
      maxInputTokens: 10,
      keepRecentMessages: 1,
      summaryMaxChars: 60
    })
    expect((bounded.summary as string).length).toBeLessThanOrEqual(60)
    expect((bounded.summary as string).endsWith('…')).toBe(true)
  })

  it('throttles/validates options fail-closed', () => {
    expect(() =>
      compactConversation(messages(), { maxInputTokens: 0 })
    ).toThrow(/maxInputTokens/)
    expect(() =>
      compactConversation(messages(), { maxInputTokens: 1.5 })
    ).toThrow(/maxInputTokens/)
  })

  it('compacts inside the kernel before the model and audits the event', async () => {
    const compacted: ContextCompactionResult[] = []
    const { runtime, input, captured } = buildRuntime({
      instructions: ['instrução curta'],
      maxInputTokens: 200,
      withHistory: true,
      onCompacted: (result) => {
        compacted.push(result)
      }
    })

    const result = await runtime.execute(input)

    expect(result.stopReason).toBe('COMPLETED')
    expect(captured).toHaveLength(1)
    const request = captured[0] as ModelRequest
    expect(request.messages).toHaveLength(3)
    // the governed instruction stays first and verbatim (SPEC 0290 §3.1)
    expect(request.messages[0]?.role).toBe('system')
    expect(request.messages[0]?.content).toContain('instrução curta')
    expect(request.messages[1]?.role).toBe('user')
    expect(request.messages[1]?.content).toContain('[contexto compactado]')
    expect(request.messages[2]).toEqual({
      role: 'user',
      content: 'pergunta atual do plantão'
    })
    expect(compacted).toHaveLength(1)
    expect(compacted[0]).toMatchObject({
      compacted: true,
      droppedMessages: 2,
      throughSequence: 3,
      strategyVersion: COMPACTION_STRATEGY_VERSION
    })
  })

  it('passes through untouched when below the cap', async () => {
    const compacted: ContextCompactionResult[] = []
    const { runtime, input, captured } = buildRuntime({
      onCompacted: (result) => {
        compacted.push(result)
      }
    })

    const result = await runtime.execute(input)

    expect(result.stopReason).toBe('COMPLETED')
    expect(compacted).toHaveLength(0)
    const request = captured[0] as ModelRequest
    expect(request.messages).toHaveLength(2)
    expect(request.messages[0]?.content).not.toContain('[contexto compactado]')
    expect(request.messages[1]?.content).toBe('pergunta atual do plantão')
  })

  it('fails closed before the model when the audit callback fails', async () => {
    const { runtime, input, captured } = buildRuntime({
      instructions: ['instrução curta'],
      maxInputTokens: 200,
      withHistory: true,
      onCompacted: () => {
        throw new Error('audit store down')
      }
    })

    const result = await runtime.execute(input)

    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(captured).toHaveLength(0)
  })

  it('records the auditable context/compacted session event (PDSH-021)', async () => {
    const store = new InMemorySessionEventStore()
    await store.openSession({
      tenantId: TENANT,
      sessionId: SESSION,
      formatVersion: 1
    })
    for (const text of ['um', 'dois', 'três', 'quatro', 'cinco']) {
      await store.append({
        tenantId: TENANT,
        sessionId: SESSION,
        formatVersion: 1,
        eventId: `seed_${text}`,
        timestamp: '2026-10-12T00:00:00.000Z',
        correlationId: 'corr_synthetic',
        traceId: 'trace_synthetic',
        type: 'message/user',
        payload: { text }
      })
    }
    const input = messages()
    const result = compactConversation(input, {
      maxInputTokens: 10,
      keepRecentMessages: 1
    })
    const recorder = createSessionCompactionRecorder({
      store,
      tenantId: TENANT,
      sessionId: SESSION,
      correlationId: 'corr_synthetic',
      traceId: 'trace_synthetic',
      clock: () => new Date('2026-10-12T00:00:00.000Z'),
      eventId: (() => {
        let counter = 0
        return () => `compacted_${(counter += 1)}`
      })()
    })

    await recorder(result)
    await recorder(compactConversation(input, { maxInputTokens: 10_000 }))

    const events = await store.read({
      tenantId: TENANT,
      sessionId: SESSION,
      limit: 500
    })
    const compactedEvents = events.filter(
      (event) => event.type === 'context/compacted'
    )
    expect(compactedEvents).toHaveLength(1)
    expect(compactedEvents[0]?.sequence).toBe(6)
    expect(compactedEvents[0]?.payload).toEqual({
      throughSequence: result.throughSequence,
      summary: result.summary,
      sourceDigest: result.sourceDigest,
      strategyVersion: COMPACTION_STRATEGY_VERSION
    })
  })
})
