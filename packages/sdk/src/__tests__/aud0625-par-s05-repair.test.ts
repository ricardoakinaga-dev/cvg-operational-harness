// PAR-S05 repair F08/F09: the Codex oracles (review of d5f1e5e20), kept as regression.
// F08: the server projects by allow list and the client refuses a forbidden field.
// @vitest-environment node
import { expect, it } from 'vitest'
import { PassThrough } from 'node:stream'
import type {
  ModelGateway,
  PolicyEngine,
  ApprovalEngine,
  SessionQuery,
  SessionListPage,
  SessionTrace
} from '@cvg/harness-contracts'
import {
  createSdkServer,
  createSdkClient,
  createInProcessTransport,
  createStdioSdkTransport,
  serveStdioSdk,
  SdkClientError
} from '../index.ts'
const T = 'synthetic-sdk-review'
const gateway: ModelGateway = {
  complete: async () => ({
    text: 'synthetic',
    provider: 'deterministic',
    model: 'keyless',
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
const item = {
  sessionId: 's1',
  createdAt: 1,
  isSeeded: false,
  inheritedEventCount: 0
}
const page: SessionListPage = {
  items: [item],
  nextCursor: null,
  examined: 1,
  skippedUnadopted: 0
}
const trace: SessionTrace = {
  root: { kind: 'approval', id: 'a' },
  links: [{ kind: 'approval', approvalId: 'a', status: 'REQUESTED' }],
  gaps: [],
  truncated: false,
  observed: { approval: '2026-10-31T00:00:00.000Z' }
}
const server = (sessionQuery?: SessionQuery) =>
  createSdkServer({
    tenantId: T,
    modelGateway: gateway,
    policy,
    approvals,
    ...(sessionQuery ? { sessionQuery } : {})
  })
const responseClient = (value: unknown) =>
  createSdkClient({
    request: async (req) => ({ jsonrpc: '2.0', id: req.id, result: value })
  })
it.each(['list', 'trace'] as const)(
  'F08: actual stdio %s exposes only the metadata allowlist',
  async (kind) => {
    const canary = 'SYNTHETIC_PAYLOAD_SHOULD_NOT_BE_PUBLIC'
    const extendedPage = {
      ...page,
      items: [{ ...item, payload: { text: canary } }]
    }
    const extendedTrace = {
      ...trace,
      links: [
        ...trace.links,
        {
          kind: 'event' as const,
          sessionId: 's1',
          sequence: 2,
          eventId: 'e2',
          type: 'tool/call' as const,
          correlationId: 'c',
          inherited: false,
          payload: { input: { private: canary } }
        }
      ]
    }
    // Structurally typed port results can carry extra columns without an unsafe cast.
    const q: SessionQuery = {
      list: async () => extendedPage,
      trace: async () => extendedTrace
    }
    const input = new PassThrough(),
      output = new PassThrough()
    const wire: Buffer[] = []
    output.on('data', (c) => wire.push(Buffer.from(c)))
    const serving = serveStdioSdk({ server: server(q), input, output })
    const transport = createStdioSdkTransport({
      input: output,
      output: input,
      expectedTenantId: T
    })
    try {
      const c = createSdkClient(transport)
      await c.hello()
      const result =
        kind === 'list'
          ? await c.listSessions()
          : await c.traceSession({ approvalId: 'a' })
      expect(JSON.stringify(result)).not.toContain(canary)
      expect(Buffer.concat(wire).toString()).not.toContain(canary)
    } finally {
      await transport.close()
      await serving.close()
      input.destroy()
      output.destroy()
    }
  }
)
it.each([
  { examined: 0, skippedUnadopted: 0 },
  { examined: 1, skippedUnadopted: 1 }
])('F09: client rejects impossible list accounting %j', async (patch) => {
  const value = { ...page, ...patch }
  const c = responseClient(value)
  const out = await c.listSessions().then(
    (value) => ({ accepted: true, value }),
    (error) => ({ accepted: false, code: error.code })
  )
  expect(out).toMatchObject({ accepted: false })
})
it.each([undefined, { kind: 'tenant', id: 'other' }])(
  'F09: truncated trace must identify a real budget dimension %j',
  async (subject) => {
    const value = {
      ...trace,
      truncated: true,
      gaps: [{ reason: 'budget_exhausted', ...(subject ? { subject } : {}) }]
    }
    const c = responseClient(value)
    const out = await c.traceSession({ approvalId: 'a' }).then(
      (value) => ({ accepted: true, value }),
      (error) => ({ accepted: false, code: error.code })
    )
    expect(out).toMatchObject({ accepted: false })
  }
)
it('client positive controls accept the public metadata and correctly dimensioned truncation', async () => {
  expect(await responseClient(page).listSessions()).toEqual(page)
  const value = {
    ...trace,
    truncated: true,
    gaps: [
      { reason: 'budget_exhausted', subject: { kind: 'links', id: 'links' } }
    ]
  }
  expect(await responseClient(value).traceSession({ approvalId: 'a' })).toEqual(
    value
  )
})

it.each([
  ['list', { ...page, items: [{ ...item, payload: { text: 'x' } }] }],
  ['list', { ...page, extra: 1 }],
  ['trace', { ...trace, payload: { text: 'x' } }],
  [
    'trace',
    {
      ...trace,
      links: [
        {
          kind: 'event',
          sessionId: 's1',
          sequence: 2,
          eventId: 'e2',
          type: 'tool/call',
          correlationId: 'c',
          inherited: false,
          payload: { input: 'x' }
        }
      ]
    }
  ],
  ['trace', { ...trace, gaps: [{ reason: 'effect_absent', note: 'x' }] }],
  ['trace', { ...trace, root: { kind: 'approval', id: 'a', extra: 1 } }]
] as const)(
  'F08: the client refuses a forbidden field (%s)',
  async (kind, value) => {
    const c = responseClient(value)
    const out = await (
      kind === 'list' ? c.listSessions() : c.traceSession({ approvalId: 'a' })
    ).then(
      () => 'accepted',
      () => 'refused'
    )
    expect(out).toBe('refused')
  }
)

it('F08: the server projection keeps every public field and drops the rest, at every level', async () => {
  const full: SessionTrace = {
    root: { kind: 'approval', id: 'a' },
    links: [
      {
        kind: 'approval',
        approvalId: 'a',
        status: 'GRANTED',
        executionRef: 'x',
        originSessionId: 's1'
      },
      { kind: 'effect', operationKey: 'k', state: 'DONE', executionRef: 'x' },
      {
        kind: 'event',
        sessionId: 's1',
        sequence: 2,
        eventId: 'e2',
        type: 'tool/result',
        correlationId: 'c',
        toolId: 't',
        outcome: 'ok',
        inherited: true
      }
    ],
    gaps: [
      { reason: 'origin_unbound', subject: { kind: 'approval', id: 'a' } }
    ],
    truncated: false,
    observed: { approval: '2026-10-31T00:00:00.000Z' }
  }
  const noisy = JSON.parse(
    JSON.stringify(full).replace(/\}/g, ',"leak":"SYNTHETIC"}')
  )
  const c = createSdkClient(
    createInProcessTransport(
      server({ list: async () => page, trace: async () => noisy })
    )
  )
  await c.hello()
  expect(await c.traceSession({ approvalId: 'a' })).toEqual(full)
})

it('F09: a list that returns more than it examined is refused', async () => {
  const c = responseClient({
    ...page,
    items: [item, { ...item, sessionId: 's2' }],
    examined: 1
  })
  await expect(c.listSessions()).rejects.toBeInstanceOf(SdkClientError)
})
