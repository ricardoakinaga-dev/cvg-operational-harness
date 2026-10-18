import { describe, expect, it } from 'vitest'
import {
  SESSION_EVENT_CATALOG_V1,
  STOP_REASONS,
  type SessionEventAppend,
  type SessionJson
} from '@cvg/harness-contracts'
import {
  InMemorySessionEventStore,
  sessionEventFingerprint,
  validateSessionEvent,
  validateSessionEventAppend
} from '../session/index.ts'
import type { ToolOutcome } from '../kernel/types.ts'

const stream = {
  tenantId: 'tenant-synthetic',
  sessionId: 'session-synthetic',
  formatVersion: 1
} as const
const scope = { tenantId: stream.tenantId, sessionId: stream.sessionId }
const base = {
  ...stream,
  eventId: 'event1',
  timestamp: '2026-10-12T00:00:00.000Z',
  correlationId: 'corr-synthetic',
  traceId: 'trace-synthetic'
}
const request = {
  messages: [{ role: 'user', content: 'synthetic' }],
  context: { values: {}, sourceIds: [], capturedAt: base.timestamp },
  budget: {
    maxSteps: 4,
    maxModelCalls: 2,
    maxToolCalls: 2,
    maxDurationMs: 30000,
    maxCostUsd: 1,
    maxTokens: 1000
  },
  correlationId: base.correlationId
}
const examples: Record<SessionEventAppend['type'], SessionJson> = {
  'turn/start': { correlationId: base.correlationId },
  'model/request': { correlationId: base.correlationId, request },
  'model/result': {
    correlationId: base.correlationId,
    provider: 'synthetic',
    inputTokens: 1,
    outputTokens: 2
  },
  'tool/call': {
    correlationId: base.correlationId,
    toolId: 'synthetic',
    operationKey: 'synthetic-op',
    input: { value: 1 }
  },
  'tool/result': {
    correlationId: base.correlationId,
    toolId: 'synthetic',
    outcome: 'succeeded'
  },
  'turn/end': { correlationId: base.correlationId, stopReason: 'COMPLETED' },
  'message/user': { text: 'synthetic user' },
  'message/assistant': { text: 'synthetic response' },
  'context/compacted': {
    throughSequence: 0,
    summary: 'synthetic summary',
    sourceDigest: 'a'.repeat(64),
    strategyVersion: 'synthetic-v1'
  }
}
function event(over: Record<string, unknown> = {}): SessionEventAppend {
  return {
    ...base,
    type: 'message/user',
    payload: { text: 'synthetic user' },
    ...over
  } as SessionEventAppend
}

describe('PDSH-021 immutable session event contracts and fixture store', () => {
  it('round-trips every catalog type with schema fingerprints', async () => {
    const store = new InMemorySessionEventStore()
    await store.openSession(stream)
    for (const [type, payload] of Object.entries(examples)) {
      const stored = await store.append(event({ type, payload, eventId: type }))
      expect(stored.type).toBe(type)
      expect(stored.schemaFingerprint).toBe(
        sessionEventFingerprint(stored.type)
      )
      expect(validateSessionEvent(stored)).toEqual(stored)
    }
    expect(await store.read(scope)).toHaveLength(9)
  })
  it('closed vocabulary tracks the real stop/outcome contracts', () => {
    expect(
      SESSION_EVENT_CATALOG_V1.events['turn/end'].properties.stopReason.enum
    ).toEqual([...STOP_REASONS])
    const outcomes: Record<ToolOutcome['kind'], true> = {
      not_started: true,
      deadline: true,
      cancelled: true,
      threw: true,
      failed: true,
      succeeded: true,
      confirm_failed: true
    }
    expect(
      [
        ...SESSION_EVENT_CATALOG_V1.events['tool/result'].properties.outcome
          .enum
      ].sort()
    ).toEqual(Object.keys(outcomes).sort())
  })
  it.each([
    { extra: true },
    { formatVersion: 2 },
    { sequence: 1 },
    { schemaFingerprint: 'a'.repeat(64) },
    { type: 'unknown' },
    { timestamp: '2026-02-30T00:00:00.000Z' },
    { tenantId: '' },
    { sessionId: '\0' },
    { eventId: ' '.repeat(2) },
    { payload: { text: 'x', extra: true } },
    { payload: { text: 'x', unknown: undefined } },
    { payload: { text: undefined } },
    { payload: JSON.parse('{"text":"x","constructor":{}}') },
    { payload: JSON.parse('{"text":"x","__proto__":{}}') },
    { type: 'turn/start', payload: { correlationId: 'other' } },
    {
      type: 'model/request',
      payload: {
        correlationId: base.correlationId,
        request: { ...request, signal: new AbortController().signal }
      }
    },
    {
      type: 'model/result',
      payload: {
        correlationId: base.correlationId,
        provider: 'synthetic',
        inputTokens: -1,
        outputTokens: 0
      }
    }
  ])('rejects malformed version/envelope/payload %j', (over) => {
    expect(() => validateSessionEventAppend(event(over))).toThrow()
  })
  it.each([
    1n,
    new Date(),
    new AbortController().signal,
    Buffer.from('x'),
    NaN,
    () => 1
  ])('rejects non-JSON tool input', (input) => {
    expect(() =>
      validateSessionEventAppend(
        event({
          type: 'tool/call',
          payload: {
            correlationId: base.correlationId,
            toolId: 'synthetic',
            operationKey: 'op',
            input
          }
        })
      )
    ).toThrow()
  })
  it('refuses UTF-8 overflow, object cycles and unsafe sequence', async () => {
    expect(() =>
      validateSessionEventAppend(
        event({ payload: { text: 'é'.repeat(32769) } })
      )
    ).toThrow()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() =>
      validateSessionEventAppend(event({ payload: cyclic }))
    ).toThrow()
    const store = new InMemorySessionEventStore()
    await store.openSession(stream)
    const stored = await store.append(event())
    expect(() =>
      validateSessionEvent({ ...stored, sequence: Number.MAX_SAFE_INTEGER + 1 })
    ).toThrow()
    expect(() =>
      validateSessionEvent({ ...stored, schemaFingerprint: 'b'.repeat(64) })
    ).toThrow()
  })
  it('deduplicates concurrent matching appends, rejects conflict, keeps sequence contiguous', async () => {
    const store = new InMemorySessionEventStore()
    await store.openSession(stream)
    const events = await Promise.all(
      Array.from({ length: 20 }, () => store.append(event()))
    )
    expect(new Set(events.map((e) => e.sequence))).toEqual(new Set([1]))
    await expect(
      store.append(event({ payload: { text: 'different' } }))
    ).rejects.toMatchObject({ code: 'session_event_conflict' })
    expect((await store.append(event({ eventId: 'event2' }))).sequence).toBe(2)
  })
  it('isolates tuples and returns detached snapshots on open/append/read', async () => {
    const store = new InMemorySessionEventStore()
    await store.openSession(stream)
    const input = event()
    const stored = await store.append(input)
    ;(input.payload as { text: string }).text = 'caller mutation'
    ;(stored.payload as { text: string }).text = 'return mutation'
    const read = await store.read(scope)
    expect(read[0]?.payload).toEqual({ text: 'synthetic user' })
    ;(read[0]?.payload as { text: string }).text = 'read mutation'
    expect((await store.read(scope))[0]?.payload).toEqual({
      text: 'synthetic user'
    })
    const other = { ...stream, tenantId: 'other-tenant' }
    await store.openSession(other)
    expect(
      await store.read({ tenantId: other.tenantId, sessionId: other.sessionId })
    ).toEqual([])
  })
  it('bounds pagination and never auto-opens a missing stream', async () => {
    const store = new InMemorySessionEventStore()
    await expect(store.append(event())).rejects.toMatchObject({
      code: 'session_not_open'
    })
    await store.openSession(stream)
    await store.append(event())
    await store.append(event({ eventId: 'event2' }))
    expect(
      (await store.read({ ...scope, afterSequence: 1, limit: 1 })).map(
        (e) => e.sequence
      )
    ).toEqual([2])
    await expect(store.read({ ...scope, limit: 501 })).rejects.toThrow()
    await expect(store.read({ ...scope, afterSequence: -1 })).rejects.toThrow()
  })
})
