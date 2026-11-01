import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  ModelGateway,
  PolicyEngine,
  SessionQuery
} from '@cvg/harness-contracts'
import { InMemorySessionDirectory, createSessionQuery } from '@cvg/harness'
import {
  SDK_ERROR_CODES,
  SdkClientError,
  createInProcessTransport,
  createSdkClient,
  createSdkServer
} from '../index.ts'
import { validParams, validateCorrelatedResponse } from '../validators.ts'

// PAR-S05 slice 4 (SPEC 0295 section 3, D7/D8): `session.list` and `session.trace` over the SDK.
const TENANT = 'tenant_s05_slice4'
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
const row = (key: number, agentPreset = 'other') => ({
  key,
  summary: {
    sessionId: `s${key}`,
    createdAt: key * 10,
    isSeeded: false,
    inheritedEventCount: 0,
    agentPreset
  }
})
const serverWith = (sessionQuery?: SessionQuery) =>
  createSdkServer({
    tenantId: TENANT,
    modelGateway: gateway,
    policy,
    approvals,
    ...(sessionQuery ? { sessionQuery } : {})
  })
const realQuery = (count = 5) =>
  createSessionQuery({
    tenantId: TENANT,
    directory: new InMemorySessionDirectory(
      Array.from({ length: count }, (_, i) =>
        row(i + 1, i % 2 === 0 ? 'triage' : 'other')
      )
    )
  })
const fail = (code: string, text = 'PRIVATE_PORT_TEXT') =>
  Object.assign(new Error(text), { code })
const dispatch = (
  server: ReturnType<typeof serverWith>,
  method: string,
  params: unknown
) =>
  server.dispatch({ jsonrpc: '2.0', id: 1, method, params }) as Promise<{
    result?: unknown
    error?: { code: number; message: string }
  }>

describe('PAR-S05 slice 4: capability and routing', () => {
  it('advertises the methods only when the composition has the port, as a pair', async () => {
    const without = createSdkClient(createInProcessTransport(serverWith()))
    expect((await without.hello()).capabilities.methods).not.toContain(
      'session.list'
    )
    const withPort = createSdkClient(
      createInProcessTransport(serverWith(realQuery()))
    )
    const methods = (await withPort.hello()).capabilities.methods
    expect(methods).toContain('session.list')
    expect(methods).toContain('session.trace')
  })

  it('without the port both methods answer capability_not_available', async () => {
    const server = serverWith()
    for (const [method, params] of [
      ['session.list', {}],
      ['session.trace', { approvalId: 'a' }]
    ] as const)
      expect((await dispatch(server, method, params)).error?.code).toBe(
        SDK_ERROR_CODES.capability_not_available
      )
  })

  it('a client against a server without the port is refused, not misled', async () => {
    const client = createSdkClient(createInProcessTransport(serverWith()))
    await expect(client.listSessions()).rejects.toMatchObject({
      code: SDK_ERROR_CODES.capability_not_available
    })
  })
})

describe('PAR-S05 slice 4: list through the client', () => {
  it('pages newest first with the cursor and filters by preset', async () => {
    const client = createSdkClient(
      createInProcessTransport(serverWith(realQuery()))
    )
    const first = await client.listSessions({ limit: 2 })
    expect(first.items.map((s) => s.sessionId)).toEqual(['s5', 's4'])
    const second = await client.listSessions({
      limit: 2,
      ...(first.nextCursor ? { cursor: first.nextCursor } : {})
    })
    expect(second.items.map((s) => s.sessionId)).toEqual(['s3', 's2'])
    const filtered = await client.listSessions({
      filter: { agentPreset: 'triage' }
    })
    expect(filtered.items.map((s) => s.sessionId)).toEqual(['s5', 's3', 's1'])
  })

  it('a cursor of another filter is invalid_params, and unknown keys are refused', async () => {
    const server = serverWith(realQuery())
    const client = createSdkClient(createInProcessTransport(server))
    const page = await client.listSessions({
      filter: { agentPreset: 'triage' },
      limit: 1
    })
    await expect(
      client.listSessions({ cursor: page.nextCursor! })
    ).rejects.toMatchObject({ code: SDK_ERROR_CODES.invalid_params })
    for (const params of [
      { tenantId: 'other' },
      { filter: { tenantId: 'other' } },
      { cursor: 7 },
      []
    ])
      expect((await dispatch(server, 'session.list', params)).error?.code).toBe(
        SDK_ERROR_CODES.invalid_params
      )
  })

  it('a port error never leaks its text: unavailable and unknown failures are internal_error', async () => {
    for (const thrown of [
      fail('unavailable'),
      new Error('PRIVATE_PORT_TEXT')
    ]) {
      const server = serverWith({
        list: async () => {
          throw thrown
        },
        trace: async () => {
          throw thrown
        }
      })
      for (const [method, params] of [
        ['session.list', {}],
        ['session.trace', { operationKey: 'k' }]
      ] as const) {
        const res = await dispatch(server, method, params)
        expect(res.error?.code).toBe(SDK_ERROR_CODES.internal_error)
        expect(JSON.stringify(res)).not.toContain('PRIVATE_PORT_TEXT')
      }
    }
  })

  it('maps the remaining port codes', async () => {
    const codes: Record<string, number> = {
      invalid_params: SDK_ERROR_CODES.invalid_params,
      invalid_cursor: SDK_ERROR_CODES.invalid_params,
      unsupported: SDK_ERROR_CODES.capability_not_available,
      not_found: SDK_ERROR_CODES.session_not_found
    }
    for (const [code, expected] of Object.entries(codes)) {
      const server = serverWith({
        list: async () => {
          throw fail(code)
        },
        trace: async () => {
          throw fail(code)
        }
      })
      expect((await dispatch(server, 'session.list', {})).error?.code).toBe(
        expected
      )
      expect(
        (await dispatch(server, 'session.trace', { approvalId: 'a' })).error
          ?.code
      ).toBe(expected)
    }
  })
})

describe('PAR-S05 slice 4: trace through the client', () => {
  const traced = (root: object) => ({
    root,
    links: [
      { kind: 'approval', approvalId: 'a1', status: 'approved' },
      { kind: 'effect', operationKey: 'k1', state: 'succeeded' },
      {
        kind: 'event',
        sessionId: 's1',
        sequence: 2,
        eventId: 'e2',
        type: 'tool/call',
        correlationId: 'c1',
        toolId: 't',
        inherited: false
      }
    ],
    gaps: [
      {
        reason: 'origin_unbound',
        subject: { kind: 'approval', id: 'a1' }
      }
    ],
    truncated: false,
    observed: { approval: '2026-10-31T00:00:00.000Z' }
  })

  it('returns the trace of the port for either root, and refuses both or none', async () => {
    const roots: object[] = []
    const server = serverWith({
      list: async () => ({
        items: [],
        nextCursor: null,
        examined: 0,
        skippedUnadopted: 0
      }),
      trace: async (input) => {
        roots.push(input)
        return traced(
          input.approvalId !== undefined
            ? { kind: 'approval', id: input.approvalId }
            : { kind: 'operationKey', id: input.operationKey! }
        ) as never
      }
    })
    const client = createSdkClient(createInProcessTransport(server))
    expect((await client.traceSession({ approvalId: 'a1' })).root).toEqual({
      kind: 'approval',
      id: 'a1'
    })
    expect(
      (await client.traceSession({ operationKey: 'k1' })).links
    ).toHaveLength(3)
    expect(roots).toEqual([{ approvalId: 'a1' }, { operationKey: 'k1' }])
    for (const params of [
      {},
      { approvalId: 'a', operationKey: 'k' },
      { approvalId: '' },
      { approvalId: 'x'.repeat(4097) },
      { approvalId: 'a\u0000b' },
      { approvalId: 'a', extra: 1 },
      { approvalId: 7 }
    ])
      expect(
        (await dispatch(server, 'session.trace', params)).error?.code
      ).toBe(SDK_ERROR_CODES.invalid_params)
    expect(roots).toHaveLength(2)
  })
})

describe('PAR-S05 slice 4: the client validates what the server returns', () => {
  const request = (method: string, params: object) =>
    ({ jsonrpc: '2.0', id: 1, method, params }) as never
  const ok = (value: unknown) => ({ jsonrpc: '2.0', id: 1, result: value })
  const page = {
    items: [
      {
        sessionId: 's1',
        createdAt: 10,
        isSeeded: false,
        inheritedEventCount: 0,
        agentPreset: 'triage'
      }
    ],
    nextCursor: null,
    examined: 1,
    skippedUnadopted: 0
  }
  const trace = {
    root: { kind: 'approval', id: 'a1' },
    links: [],
    gaps: [],
    truncated: false,
    observed: {}
  }
  const accepts = (method: string, params: object, value: unknown) =>
    validateCorrelatedResponse(request(method, params), ok(value))
  const refuses = (method: string, params: object, value: unknown) =>
    expect(() => accepts(method, params, value)).toThrow('Invalid SDK result')

  it('accepts well-formed results', () => {
    accepts('session.list', {}, page)
    accepts('session.list', { filter: { agentPreset: 'triage' } }, page)
    accepts('session.trace', { approvalId: 'a1' }, trace)
  })

  it.each([
    [
      'more items than the limit',
      { limit: 1 },
      { ...page, items: [...page.items, { ...page.items[0], sessionId: 's2' }] }
    ],
    [
      'a repeated session',
      {},
      { ...page, items: [page.items[0], page.items[0]], examined: 2 }
    ],
    ['an item outside the filter', { filter: { agentPreset: 'other' } }, page],
    ['an item before createdAfter', { filter: { createdAfter: 11 } }, page],
    ['an item at createdBefore', { filter: { createdBefore: 10 } }, page],
    ['a parent outside the filter', { filter: { parentSession: 'p' } }, page],
    ['an origin outside the filter', { filter: { origin: 'subagent' } }, page],
    ['a seeded flag outside the filter', { filter: { isSeeded: true } }, page],
    [
      'a cursor over 512 characters',
      {},
      { ...page, nextCursor: 'a'.repeat(513) }
    ],
    ['a missing cursor', {}, { ...page, nextCursor: undefined }],
    ['examined above the window', {}, { ...page, examined: 1001 }],
    ['skipped above examined', {}, { ...page, skippedUnadopted: 2 }],
    [
      'an item without createdAt',
      {},
      { ...page, items: [{ ...page.items[0], createdAt: undefined }] }
    ],
    [
      'a bad origin',
      {},
      { ...page, items: [{ ...page.items[0], origin: 'x' }] }
    ],
    ['a non-array', {}, { ...page, items: 'x' }]
  ])('refuses a list with %s', (_name, params, value) => {
    refuses('session.list', params, value)
  })

  it.each([
    ['another root', { ...trace, root: { kind: 'approval', id: 'zz' } }],
    [
      'the other root kind',
      { ...trace, root: { kind: 'operationKey', id: 'a1' } }
    ],
    [
      'more than 100 links',
      {
        ...trace,
        links: Array.from({ length: 101 }, () => ({
          kind: 'effect',
          operationKey: 'k',
          state: 's'
        }))
      }
    ],
    ['an unknown link kind', { ...trace, links: [{ kind: 'x' }] }],
    [
      'an approval link without status',
      { ...trace, links: [{ kind: 'approval', approvalId: 'a' }] }
    ],
    [
      'an effect link without state',
      { ...trace, links: [{ kind: 'effect', operationKey: 'k' }] }
    ],
    [
      'an event link at sequence 0',
      {
        ...trace,
        links: [
          {
            kind: 'event',
            sessionId: 's',
            sequence: 0,
            eventId: 'e',
            type: 't',
            correlationId: 'c',
            inherited: false
          }
        ]
      }
    ],
    ['an unknown gap reason', { ...trace, gaps: [{ reason: 'x' }] }],
    [
      'a gap subject without id',
      { ...trace, gaps: [{ reason: 'effect_absent', subject: { kind: 'k' } }] }
    ],
    ['truncated without a budget gap', { ...trace, truncated: true }],
    [
      'a budget gap without truncated',
      { ...trace, gaps: [{ reason: 'budget_exhausted' }] }
    ],
    [
      'an unknown observed source',
      { ...trace, observed: { other: '2026-10-31T00:00:00.000Z' } }
    ],
    [
      'an observed instant that is not a date',
      { ...trace, observed: { approval: 'soon' } }
    ],
    ['a non-object link', { ...trace, links: ['x'] }],
    ['a missing observed', { ...trace, observed: undefined }]
  ])('refuses a trace with %s', (_name, value) => {
    refuses('session.trace', { approvalId: 'a1' }, value)
  })

  it('accepts every link kind, the budget gap and an operationKey root', () => {
    accepts(
      'session.trace',
      { operationKey: 'k' },
      {
        root: { kind: 'operationKey', id: 'k' },
        links: [
          {
            kind: 'approval',
            approvalId: 'a',
            status: 's',
            executionRef: 'x',
            originSessionId: 'o'
          },
          { kind: 'effect', operationKey: 'k', state: 's', executionRef: 'x' },
          {
            kind: 'event',
            sessionId: 's',
            sequence: 1,
            eventId: 'e',
            type: 'tool/result',
            correlationId: 'c',
            outcome: 'ok',
            inherited: true
          }
        ],
        gaps: [
          {
            reason: 'budget_exhausted',
            subject: { kind: 'links', id: 'links' }
          },
          { reason: 'effect_absent' }
        ],
        truncated: true,
        observed: {
          approval: '2026-10-31T00:00:00.000Z',
          effect: '2026-10-31T00:00:01.000Z',
          events: '2026-10-31T00:00:02.000Z'
        }
      }
    )
  })

  it('validates the params the same way the server does (stdio side)', () => {
    const v = (method: string, params: unknown) =>
      validParams({ jsonrpc: '2.0', id: 1, method, params } as never)
    expect(v('session.list', {})).toBe(true)
    expect(
      v('session.list', {
        filter: { origin: 'subagent' },
        limit: 100,
        cursor: 'c'
      })
    ).toBe(true)
    for (const bad of [
      { limit: 101 },
      { filter: { createdAfter: 20, createdBefore: 10 } },
      { cursor: 'a'.repeat(513) },
      { cursor: '' },
      { cursor: 3 },
      { tenantId: 't' }
    ])
      expect(v('session.list', bad)).toBe(false)
    expect(v('session.trace', { approvalId: 'a' })).toBe(true)
    expect(v('session.trace', { operationKey: 'k' })).toBe(true)
    for (const bad of [
      {},
      { approvalId: 'a', operationKey: 'k' },
      { approvalId: 1 },
      { approvalId: '' },
      { approvalId: 'a\u0000' },
      { approvalId: 'a', x: 1 }
    ])
      expect(v('session.trace', bad)).toBe(false)
  })

  it('hello: the pair is advertised together or not at all', () => {
    const hello = (methods: string[]) =>
      validateCorrelatedResponse(
        request('sdk.hello', { protocolVersion: 1 }),
        ok({
          protocolVersion: 1,
          capabilities: { sessions: false, events: false, methods }
        })
      )
    hello(['sdk.hello', 'turn.send'])
    hello(['sdk.hello', 'turn.send', 'session.list', 'session.trace'])
    expect(() => hello(['sdk.hello', 'turn.send', 'session.list'])).toThrow()
    expect(() => hello(['sdk.hello', 'turn.send', 'session.trace'])).toThrow()
  })

  it('an in-band error of the server is still a client error with the stable code', async () => {
    const client = createSdkClient(
      createInProcessTransport(serverWith(realQuery()))
    )
    await expect(client.listSessions({ limit: 101 })).rejects.toBeInstanceOf(
      SdkClientError
    )
  })
})
