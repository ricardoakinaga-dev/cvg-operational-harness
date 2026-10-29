/**
 * SPEC 0257 — closes the test gaps D9 found in the review of slices 2-3
 * (S1, S4, S6/S7). Authenticated mutations on the memory composition, with
 * synthetic principals and case grants. Test-only: no production code.
 */
import { randomUUID } from 'node:crypto'
import { request as httpRequest } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import {
  CONTROLLED_TEST_TENANT,
  grantCase
} from './case-authorization-fixtures.ts'

type App = ReturnType<typeof buildServer>
interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
}

const apps: App[] = []
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

const as = (operatorId: string, role = 'Operator') => ({
  'x-operator-id': operatorId,
  'x-operator-role': role,
  'x-tenant-id': CONTROLLED_TEST_TENANT
})

/** One conversation/session granted to operator.a and operator.c. */
async function world() {
  const app = buildServer({ requireAuthenticatedMutations: true })
  apps.push(app)
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': CONTROLLED_TEST_TENANT },
    payload: {
      externalMessageId: `p3-${randomUUID()}`,
      senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
      body: 'Mensagem sintetica',
      receivedAt: '2026-10-28T14:00:00-03:00'
    }
  })
  expect(inbound.statusCode).toBe(200)
  const data = inbound.json().data as {
    conversationId: string
    sessionId: string
  }
  for (const operatorId of ['operator.a', 'operator.c']) {
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: data.conversationId,
      operatorId
    })
  }
  return { app, sessionId: data.sessionId }
}

const approvalBody = (sessionId: string, summary = 'Resumo sintetico') => ({
  sessionId,
  proposedAction: 'handoff_to_operator',
  summary,
  riskLevel: 'high'
})
const taskBody = (sessionId: string, key: string, title = 'Revisar caso') => ({
  sessionId,
  title,
  description: 'Descricao sintetica',
  priority: 'medium',
  source: 'console',
  idempotencyKey: key
})
const memory = (app: App) => {
  const db = app.persistence.memoryDb
  if (!db) throw new Error('memory persistence expected')
  return db
}
const approvalCount = (app: App) => memory(app).state.approvals.length
const taskCount = (app: App) => memory(app).state.tasks.length

describe('S1: the Idempotency-Key header is read AFTER authentication and case authorization', () => {
  it.each([
    ['missing', undefined],
    ['invalid value', 'has space 12345'],
    ['too short', 'short']
  ])(
    'an operator without a grant is a 404 and nothing is created (%s header)',
    async (_name, key) => {
      const { app, sessionId } = await world()
      const response = await app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: {
          ...as('operator.nogrant'),
          ...(key === undefined ? {} : { 'idempotency-key': key })
        },
        payload: approvalBody(sessionId)
      })
      expect(response.statusCode).toBe(404)
      expect((response.json() as Envelope<null>).error?.code).toBe('not_found')
      expect(approvalCount(app)).toBe(0)
    }
  )

  it('no identity is a 401 even with an invalid header', async () => {
    const { app, sessionId } = await world()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { 'idempotency-key': 'has space 12345' },
      payload: approvalBody(sessionId)
    })
    expect(response.statusCode).toBe(401)
    expect(approvalCount(app)).toBe(0)
  })

  it('a granted operator with a missing header still gets the 400', async () => {
    const { app, sessionId } = await world()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: as('operator.a'),
      payload: approvalBody(sessionId)
    })
    expect(response.statusCode).toBe(400)
    expect((response.json() as Envelope<null>).error?.code).toBe(
      'validation_failed'
    )
    expect(approvalCount(app)).toBe(0)
  })
})

describe('S6/S7: the authenticated actor is the actor of the event and of the digest', () => {
  it('approval: the creation event carries the operator, and another actor with the same key is a 409', async () => {
    const { app, sessionId } = await world()
    const key = 'approval-actor-key-0001'
    const created = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { ...as('operator.a'), 'idempotency-key': key },
      payload: approvalBody(sessionId)
    })
    expect(created.statusCode).toBe(200)
    const id = (created.json() as Envelope<{ id: string }>).data.id
    const events = memory(app).state.auditEvents.filter(
      (event) =>
        event.type === 'approval_decision' &&
        (event.payload as { approvalRequestId?: string }).approvalRequestId ===
          id
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorType: 'Operator',
      actorId: 'operator.a'
    })
    // The same key and body from another granted operator is not a replay.
    const other = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { ...as('operator.c'), 'idempotency-key': key },
      payload: approvalBody(sessionId)
    })
    expect(other.statusCode).toBe(409)
    expect((other.json() as Envelope<null>).error?.code).toBe('conflict')
    expect(approvalCount(app)).toBe(1)
    // The author replaying the same request gets the same approval.
    const replay = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: { ...as('operator.a'), 'idempotency-key': key },
      payload: approvalBody(sessionId)
    })
    expect(replay.statusCode).toBe(200)
    expect((replay.json() as Envelope<{ id: string }>).data.id).toBe(id)
    expect(approvalCount(app)).toBe(1)
  })

  it('task: the creation event carries the operator, and another actor with the same body key is a 409', async () => {
    const { app, sessionId } = await world()
    const key = 'task-actor-key-0001'
    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: as('operator.a'),
      payload: taskBody(sessionId, key)
    })
    expect(created.statusCode).toBe(200)
    const id = (created.json() as Envelope<{ id: string }>).data.id
    const events = memory(app).state.auditEvents.filter(
      (event) =>
        event.type === 'integration_event' &&
        (event.payload as { taskId?: string }).taskId === id
    )
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorType: 'Operator',
      actorId: 'operator.a'
    })
    const other = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: as('operator.c'),
      payload: taskBody(sessionId, key)
    })
    expect(other.statusCode).toBe(409)
    expect((other.json() as Envelope<null>).error?.code).toBe('conflict')
    expect(taskCount(app)).toBe(1)
  })
})

describe('S4: the header name is matched case-insensitively', () => {
  /** Flat header list: each name stays exactly as written; Host and framing are explicit. */
  const send = (
    port: number,
    keyHeaders: string[],
    body: string
  ): Promise<number> =>
    new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/v1/approvals',
          headers: [
            'host',
            `127.0.0.1:${port}`,
            ...keyHeaders,
            'content-type',
            'application/json',
            'content-length',
            String(Buffer.byteLength(body)),
            'x-operator-id',
            'operator.a',
            'x-operator-role',
            'Operator',
            'x-tenant-id',
            CONTROLLED_TEST_TENANT
          ]
        },
        (res) => {
          res.resume()
          resolve(res.statusCode ?? 0)
        }
      )
      req.on('error', reject)
      req.end(body)
    })

  it('Idempotency-Key + idempotency-key is a duplicate (400) even when each value is valid; a single mixed-case header is accepted', async () => {
    const { app, sessionId } = await world()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const { port } = app.server.address() as AddressInfo
    const body = JSON.stringify(approvalBody(sessionId))
    // Control: the framing is right, so one mixed-case header is a 200.
    expect(
      await send(port, ['Idempotency-Key', 'single-key-0000001'], body)
    ).toBe(200)
    expect(approvalCount(app)).toBe(1)
    // The same name in two cases is two header lines: refused, nothing created.
    expect(
      await send(
        port,
        [
          'Idempotency-Key',
          'dup-key-00000001',
          'idempotency-key',
          'dup-key-00000002'
        ],
        body
      )
    ).toBe(400)
    expect(approvalCount(app)).toBe(1)
  })
})
