/**
 * SPEC 0257 R2 over HTTP on the memory composition: AC02, AC06 (server side),
 * AC11 (no atomic port => 503 before any write). Synthetic data only.
 */
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from '../server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
}

async function sessionOf(app: ReturnType<typeof buildServer>) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: `creation-http-${Math.random().toString(36).slice(2)}`,
      senderRef: '+551177776666',
      body: 'Mensagem sintetica',
      receivedAt: '2026-10-28T14:00:00-03:00'
    }
  })
  return (inbound.json() as Envelope<{ sessionId: string }>).data.sessionId
}

const approvalBody = (sessionId: string, summary = 'Resumo sintetico') => ({
  sessionId,
  proposedAction: 'handoff_to_operator',
  summary,
  riskLevel: 'high'
})

const taskBody = (sessionId: string, title = 'Revisar caso') => ({
  sessionId,
  title,
  description: 'Descricao sintetica',
  priority: 'medium',
  source: 'console',
  idempotencyKey: 'task-http-key-0001'
})

const viewer = {
  'x-operator-id': 'supervisor.shift-a',
  'x-operator-role': 'Supervisor'
}

const approvalCount = async (app: ReturnType<typeof buildServer>) =>
  (
    (
      await app.inject({
        method: 'GET',
        url: '/v1/approvals?status=pending&limit=100&offset=0',
        headers: viewer
      })
    ).json() as Envelope<unknown[]>
  ).data.length

describe('POST /v1/approvals Idempotency-Key (SPEC 0257 §2)', () => {
  it.each([
    ['missing', undefined],
    ['too short', 'short'],
    ['too long', 'x'.repeat(201)],
    ['space', 'has space 12345'],
    ['comma', 'first-key-0001,second-key-0002'],
    ['non ASCII', 'chave-ção-0001'],
    ['duplicated header', ['dup-key-00000001', 'dup-key-00000002']]
  ])(
    '%s is a 400 validation_failed and nothing is created',
    async (_name, key) => {
      const app = buildServer()
      const sessionId = await sessionOf(app)
      const response = await app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: key === undefined ? {} : { 'idempotency-key': key },
        payload: approvalBody(sessionId)
      })
      expect(response.statusCode).toBe(400)
      expect((response.json() as Envelope<null>).error?.code).toBe(
        'validation_failed'
      )
      expect(await approvalCount(app)).toBe(0)
    }
  )

  it('creates once, replays the same id with no-store, and a changed body under the same key is a 409', async () => {
    const app = buildServer()
    const sessionId = await sessionOf(app)
    const headers = { 'idempotency-key': 'approval-http-key-0001' }
    const first = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers,
      payload: approvalBody(sessionId)
    })
    expect(first.statusCode).toBe(200)
    const id = (first.json() as Envelope<{ id: string }>).data.id
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers,
      payload: approvalBody(sessionId)
    })
    expect(replay.statusCode).toBe(200)
    expect((replay.json() as Envelope<{ id: string }>).data.id).toBe(id)
    expect(replay.headers['cache-control']).toBe('no-store')
    expect(await approvalCount(app)).toBe(1)
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers,
      payload: approvalBody(sessionId, 'Outro resumo')
    })
    expect(changed.statusCode).toBe(409)
    expect(changed.headers['cache-control']).toBe('no-store')
    expect((changed.json() as Envelope<null>).error?.code).toBe('conflict')
    expect(JSON.stringify(changed.json())).not.toContain(
      headers['idempotency-key']
    )
    expect(await approvalCount(app)).toBe(1)
  })

  it('a new key creates a second approval (no deduplication by summary or session)', async () => {
    const app = buildServer()
    const sessionId = await sessionOf(app)
    for (const key of ['approval-http-key-0001', 'approval-http-key-0002']) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: { 'idempotency-key': key },
        payload: approvalBody(sessionId)
      })
      expect(response.statusCode).toBe(200)
    }
    expect(await approvalCount(app)).toBe(2)
  })
})

describe('POST /v1/tasks creation receipt (SPEC 0257)', () => {
  it('replays the same task for the same body key and refuses a changed body with 409', async () => {
    const app = buildServer()
    const sessionId = await sessionOf(app)
    const first = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskBody(sessionId)
    })
    expect(first.statusCode).toBe(200)
    const id = (first.json() as Envelope<{ id: string }>).data.id
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskBody(sessionId)
    })
    expect(replay.statusCode).toBe(200)
    expect((replay.json() as Envelope<{ id: string }>).data.id).toBe(id)
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskBody(sessionId, 'Titulo diferente')
    })
    expect(changed.statusCode).toBe(409)
    const list = await app.inject({
      method: 'GET',
      url: '/v1/tasks?status=open&limit=100&offset=0',
      headers: viewer
    })
    expect((list.json() as Envelope<unknown[]>).data).toHaveLength(1)
  })
})

describe('no atomic port (AC11)', () => {
  it('a shared queryable client answers 503 for both POSTs before any write', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }))
    const app = buildServer({
      persistence: { kind: 'postgres', client: { query } as never }
    })
    query.mockClear()
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { 'idempotency-key': 'approval-http-key-0001' },
      payload: approvalBody('sess_none')
    })
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskBody('sess_none')
    })
    expect(approval.statusCode).toBe(503)
    expect(task.statusCode).toBe(503)
    const writes = (query.mock.calls as unknown as Array<[string]>).filter(
      ([text]) => /INSERT|UPDATE|DELETE|BEGIN/i.test(String(text))
    )
    expect(writes).toEqual([])
  })
})
