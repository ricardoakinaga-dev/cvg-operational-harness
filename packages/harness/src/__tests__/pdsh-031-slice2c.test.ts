import { describe, expect, it } from 'vitest'
import {
  SessionEventError,
  sessionEventFingerprint,
  validateSessionEvent,
  validateSessionEventAppend
} from '../session/events.ts'

const TS = '2026-10-12T00:00:00.000Z'
const CORRELATION = 'corr_pdsh031'

function base(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_pdsh031',
    sessionId: 'session_pdsh031',
    formatVersion: 1,
    eventId: 'event-1',
    timestamp: TS,
    correlationId: CORRELATION,
    traceId: 'trace_pdsh031',
    type: 'message/user',
    payload: { text: 'synthetic' },
    ...overrides
  }
}

function rejected(event: unknown): void {
  expect(() => validateSessionEventAppend(event as never)).toThrow(
    SessionEventError
  )
}

const validBudget = {
  maxSteps: 1,
  maxModelCalls: 1,
  maxToolCalls: 1,
  maxDurationMs: 1,
  maxCostUsd: 0,
  maxTokens: 1
}

function toolCall(payloadOverrides: Record<string, unknown> = {}) {
  return base({
    type: 'tool/call',
    payload: {
      correlationId: CORRELATION,
      toolId: 'synthetic.tool',
      operationKey: 'op-1',
      input: { ok: true },
      ...payloadOverrides
    }
  })
}

describe('PDSH-031 slice 2c — session event validator edges', () => {
  it('enforces the JSON node and depth budgets before schema checks', () => {
    rejected(toolCall({ input: Array.from({ length: 20_010 }, () => 1) }))
    const deep: Record<string, unknown> = {}
    let cursor = deep
    for (let index = 0; index < 70; index += 1) {
      const next: Record<string, unknown> = {}
      cursor.child = next
      cursor = next
    }
    rejected(toolCall({ input: deep }))
  })

  it('rejects exotic array and object shapes', () => {
    rejected(toolCall({ input: Object.assign([1, 2], { extra: 1 }) }))
    const sparse: unknown[] = [1]
    sparse[3] = 4
    rejected(toolCall({ input: sparse }))
    const hidden = Object.defineProperty({ visible: 1 }, 'hidden', {
      value: 2,
      enumerable: false
    })
    rejected(toolCall({ input: hidden }))
    const accessor = {
      get value() {
        return 1
      }
    }
    rejected(toolCall({ input: accessor }))
  })

  it('rejects enum, string and number violations', () => {
    rejected(
      base({
        type: 'turn/end',
        payload: { correlationId: CORRELATION, stopReason: 'NOPE' }
      })
    )
    rejected(base({ payload: { text: 7 } }))
    rejected(base({ eventId: 'e'.repeat(210) }))
    rejected(
      base({
        type: 'model/result',
        payload: {
          correlationId: CORRELATION,
          provider: 'synthetic',
          inputTokens: 'many',
          outputTokens: 0
        }
      })
    )
    rejected(
      base({
        type: 'model/result',
        payload: {
          correlationId: CORRELATION,
          provider: 'synthetic',
          inputTokens: -1,
          outputTokens: 0
        }
      })
    )
  })

  it('rejects array and object shape violations', () => {
    rejected(
      base({
        type: 'model/request',
        payload: {
          correlationId: CORRELATION,
          request: {
            messages: 'nope',
            context: { values: {}, sourceIds: [], capturedAt: TS },
            budget: validBudget,
            correlationId: CORRELATION
          }
        }
      })
    )
    const valid = base({
      type: 'model/request',
      payload: {
        correlationId: CORRELATION,
        request: {
          messages: [{ role: 'user', content: 'x' }],
          context: { values: {}, sourceIds: [], capturedAt: TS },
          budget: validBudget,
          correlationId: CORRELATION
        }
      }
    })
    expect(() => validateSessionEventAppend(valid as never)).not.toThrow()
    rejected(base({ type: 'turn/start', payload: 'plain text' }))
    rejected(base({ type: 'turn/start', payload: {} }))
  })

  it('rejects non-objects and unknown schema fingerprints', () => {
    for (const value of [null, 'text', 7, []]) rejected(value)
    expect(() => sessionEventFingerprint('nope' as never)).toThrow(
      SessionEventError
    )
  })

  it('rejects a nested model request with a different correlation', () => {
    rejected(
      base({
        type: 'model/request',
        payload: {
          correlationId: CORRELATION,
          request: {
            messages: [{ role: 'user', content: 'x' }],
            context: { values: {}, sourceIds: [], capturedAt: TS },
            budget: validBudget,
            correlationId: 'corr_other'
          }
        }
      })
    )
  })

  it('enforces the serialized size cap on append and materialized events', () => {
    const big = toolCall({ input: 'x'.repeat(1_100_000) })
    rejected(big)
    expect(() =>
      validateSessionEvent({
        ...big,
        sequence: 1,
        schemaFingerprint: sessionEventFingerprint('tool/call')
      } as never)
    ).toThrow(SessionEventError)
  })

  it('rejects a compaction referencing its own sequence or later', () => {
    expect(() =>
      validateSessionEvent(
        base({
          type: 'context/compacted',
          payload: {
            throughSequence: 1,
            summary: 's',
            sourceDigest: 'a'.repeat(64),
            strategyVersion: 'v1'
          },
          sequence: 1,
          schemaFingerprint: sessionEventFingerprint('context/compacted')
        }) as never
      )
    ).toThrow(SessionEventError)
  })
})
