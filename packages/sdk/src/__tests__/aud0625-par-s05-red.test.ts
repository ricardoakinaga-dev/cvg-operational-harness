import { describe, expect, it } from 'vitest'
import { SESSION_EVENT_CATALOG_V1 } from '@cvg/harness-contracts'
import type {
  ApprovalEngine,
  ModelGateway,
  PolicyEngine,
  SessionEvent,
  SessionEventStore
} from '@cvg/harness-contracts'
import { SessionEventError } from '@cvg/harness'
import { SDK_ERROR_CODES, SDK_METHODS, createSdkServer } from '../index.ts'

// SPEC 0295 (PAR-S05), phase-1 RED witnesses. The controls pass today and pin what the SPEC
// keeps; the former `it.fails` witnesses are plain assertions since slice 4 delivered them.
const TENANT = 'tenant_s05_a'
const OTHER = 'tenant_s05_b'

const gateway: ModelGateway = {
  complete: async () => ({
    text: 'ok',
    provider: 'deterministic',
    model: 'deterministic-v1',
    inputTokens: 1,
    outputTokens: 1,
    costUsd: 0
  })
}
const policy: PolicyEngine = {
  evaluate: async () => ({
    outcome: 'ALLOW',
    reason: 'synthetic',
    policyVersion: 'p1'
  })
}
const approvals: ApprovalEngine = {
  request: async () => ({ status: 'DENIED', reason: 'synthetic' })
}

// Multi-tenant in-memory store: the SDK server binds one tenant, the store knows both.
function store(): SessionEventStore {
  const streams = new Map<string, SessionEvent[]>()
  const key = (t: string, s: string) => `${t}|${s}`
  return {
    openSession: async (input) => {
      streams.set(key(input.tenantId, input.sessionId), [])
      return input
    },
    append: async () => {
      throw new Error('not used')
    },
    read: async (input) => {
      const stream = streams.get(key(input.tenantId, input.sessionId))
      if (stream === undefined)
        throw new SessionEventError('session_not_open', 'not found')
      return stream
    }
  }
}

function server(sessions: SessionEventStore, extra: object = {}) {
  return createSdkServer({
    tenantId: TENANT,
    modelGateway: gateway,
    policy,
    approvals,
    sessions,
    ...extra
  } as never)
}
const call = (s: ReturnType<typeof server>, method: string, params: object) =>
  s.dispatch({ jsonrpc: '2.0', id: 1, method, params }) as unknown as Promise<{
    result?: unknown
    error?: { code: number }
  }>

describe('PAR-S05 baseline controls (pass today, kept by the SPEC)', () => {
  it('session.events refuses limit above 500 and negative cursors', async () => {
    const s = server(store())
    expect(
      (await call(s, 'session.events', { sessionId: 'x', limit: 501 })).error
        ?.code
    ).toBe(SDK_ERROR_CODES.invalid_params)
    expect(
      (await call(s, 'session.events', { sessionId: 'x', afterSequence: -1 }))
        .error?.code
    ).toBe(SDK_ERROR_CODES.invalid_params)
  })

  it('a session of another tenant is not found, never empty-but-existing', async () => {
    const sessions = store()
    await sessions.openSession({
      tenantId: OTHER,
      sessionId: 'foreign',
      formatVersion: 1
    })
    const s = server(sessions)
    const res = await call(s, 'session.events', { sessionId: 'foreign' })
    expect(res.error?.code).toBe(SDK_ERROR_CODES.session_not_found)
  })

  it('baseline pin: the event catalog carries no approval id, and tool/result has no operationKey', () => {
    const events = SESSION_EVENT_CATALOG_V1.events as Record<
      string,
      { properties: Record<string, unknown> }
    >
    const fields = (type: string) => Object.keys(events[type]?.properties ?? {})
    for (const type of Object.keys(events))
      expect(fields(type)).not.toContain('approvalId')
    expect(fields('tool/call')).toContain('operationKey')
    expect(fields('tool/result')).not.toContain('operationKey')
  })

  it('the method vocabulary gains listing and trace and keeps the v1 four in place', () => {
    expect(SDK_METHODS).toEqual([
      'sdk.hello',
      'session.open',
      'turn.send',
      'session.events',
      'session.list',
      'session.trace'
    ])
  })
})

describe('PAR-S05 RED witnesses (delivered by slice 4)', () => {
  it('RED-1: session.list returns only the sessions of the bound tenant, newest first, with a cursor', async () => {
    const sessionQuery = {
      list: async () => ({
        items: [{ sessionId: 's2' }, { sessionId: 's1' }],
        nextCursor: null
      })
    }
    const s = server(store(), { sessionQuery })
    const res = await call(s, 'session.list', { limit: 10 })
    expect(res.error).toBeUndefined()
    expect((res.result as { items: unknown[] }).items).toHaveLength(2)
  })

  it('RED-2: a forged or foreign-filter cursor is invalid_params, not a silent restart', async () => {
    const s = server(store(), {
      sessionQuery: { list: async () => ({ items: [], nextCursor: null }) }
    })
    const res = await call(s, 'session.list', { cursor: 'not-a-cursor' })
    expect(res.error?.code).toBe(SDK_ERROR_CODES.invalid_params)
  })

  it('RED-3: session.trace of an approval names the effect and the origin event, with explicit gaps', async () => {
    const trace = async () => ({
      root: { kind: 'approval', id: 'appr_1' },
      links: [
        { kind: 'effect', id: 'op_1', via: 'operationKey' },
        { kind: 'event', sessionId: 's1', sequence: 3, via: 'operationKey' }
      ],
      gaps: []
    })
    const s = server(store(), { sessionQuery: { trace } })
    const res = await call(s, 'session.trace', { approvalId: 'appr_1' })
    expect(res.error).toBeUndefined()
    expect((res.result as { links: unknown[] }).links).toHaveLength(2)
  })

  it('RED-4: session.list is capability_not_available when the composition has no query port', async () => {
    const res = await call(server(store()), 'session.list', {})
    expect(res.error?.code).toBe(SDK_ERROR_CODES.capability_not_available)
  })
})

// R1 (review F01-F05): behaviour witnesses at the SDK. They fail today with `method_not_found`
// and become positive assertions in the BUILD; the semantic pairs of the SPEC (cursor, window,
// ambiguity) need the code and are listed in SPEC 0295 section 7.
class QueryError extends Error {
  constructor(readonly code: 'not_found' | 'unavailable') {
    super(code)
  }
}
const countingPort = (
  handlers: { list?: () => unknown; trace?: () => unknown } = {}
) => {
  const calls: string[] = []
  return {
    calls,
    port: {
      list: async (input: unknown) => {
        calls.push(`list:${JSON.stringify(input)}`)
        return (
          handlers.list?.() ?? {
            items: [],
            nextCursor: null,
            examined: 0,
            skippedUnadopted: 0
          }
        )
      },
      trace: async () => {
        calls.push('trace')
        return handlers.trace?.()
      }
    }
  }
}

describe('PAR-S05 R1 behaviour witnesses (delivered by slice 4)', () => {
  it('RED-5: a foreign and a missing trace root answer identically with session_not_found', async () => {
    const { port } = countingPort({
      trace: () => {
        throw new QueryError('not_found')
      }
    })
    const s = server(store(), { sessionQuery: port })
    const foreign = await call(s, 'session.trace', { approvalId: 'foreign' })
    const missing = await call(s, 'session.trace', { approvalId: 'missing' })
    expect(foreign.error?.code).toBe(SDK_ERROR_CODES.session_not_found)
    expect(JSON.stringify(foreign.error)).toBe(JSON.stringify(missing.error))
  })

  it('RED-6: a failing root source is an internal error, never not_found nor an empty trace', async () => {
    const { port } = countingPort({
      trace: () => {
        throw new QueryError('unavailable')
      }
    })
    const res = await call(
      server(store(), { sessionQuery: port }),
      'session.trace',
      {
        approvalId: 'a1'
      }
    )
    expect(res.error?.code).toBe(SDK_ERROR_CODES.internal_error)
  })

  it('RED-7: an inverted date filter is invalid_params and never reaches the port', async () => {
    const { port, calls } = countingPort()
    const res = await call(
      server(store(), { sessionQuery: port }),
      'session.list',
      {
        filter: { createdAfter: 20, createdBefore: 10 }
      }
    )
    expect(res.error?.code).toBe(SDK_ERROR_CODES.invalid_params)
    expect(calls).toEqual([])
  })

  it('RED-8: a cursor over 512 characters is invalid_params and never reaches the port', async () => {
    const { port, calls } = countingPort()
    const res = await call(
      server(store(), { sessionQuery: port }),
      'session.list',
      {
        cursor: 'a'.repeat(513)
      }
    )
    expect(res.error?.code).toBe(SDK_ERROR_CODES.invalid_params)
    expect(calls).toEqual([])
  })

  it('RED-9: limit 101 is invalid_params; an absent limit reaches the port as 50', async () => {
    const { port, calls } = countingPort()
    const s = server(store(), { sessionQuery: port })
    expect((await call(s, 'session.list', { limit: 101 })).error?.code).toBe(
      SDK_ERROR_CODES.invalid_params
    )
    expect(calls).toEqual([])
    await call(s, 'session.list', {})
    expect(calls[0]).toContain('"limit":50')
  })

  it('RED-10: a trace needs exactly one root: both or none is invalid_params', async () => {
    const { port, calls } = countingPort()
    const s = server(store(), { sessionQuery: port })
    for (const params of [{}, { approvalId: 'a', operationKey: 'k' }])
      expect((await call(s, 'session.trace', params)).error?.code).toBe(
        SDK_ERROR_CODES.invalid_params
      )
    expect(calls).toEqual([])
  })
})
