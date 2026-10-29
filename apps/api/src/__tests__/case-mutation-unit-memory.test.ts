/**
 * SPEC 0262 slice 1, memory composition: the authorization decision and the
 * write run in the SAME authority queue (R11), so a revocation never
 * interleaves with a write that was authorized (R02 in memory), and a revoked
 * grant denies a new creation and its replay (R01/R04). Synthetic data only.
 */
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from '../server.ts'
import {
  CONTROLLED_TEST_TENANT,
  findCaseId,
  grantCase,
  managerHeaders,
  putAssignment
} from './case-authorization-fixtures.ts'

const OPERATOR = {
  'x-operator-id': 'operator.unit.memory',
  'x-operator-role': 'Operator'
}

async function setup() {
  const app = buildServer({ requireAuthenticatedMutations: true })
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': CONTROLLED_TEST_TENANT },
    payload: {
      externalMessageId: `unit-memory-${Math.random().toString(36).slice(2)}`,
      senderRef: '+551177776666',
      body: 'Mensagem sintetica',
      receivedAt: '2026-10-28T14:00:00-03:00'
    }
  })
  const data = inbound.json().data as {
    sessionId: string
    conversationId: string
  }
  await grantCase(app, {
    kind: 'core_conversation',
    resourceId: data.conversationId,
    operatorId: OPERATOR['x-operator-id']
  })
  return { app, ...data }
}

const taskBody = (sessionId: string, key: string) => ({
  sessionId,
  title: 'Revisar caso',
  description: 'Descricao sintetica',
  priority: 'medium',
  source: 'console',
  idempotencyKey: key
})

const post = (
  app: Awaited<ReturnType<typeof setup>>['app'],
  sessionId: string,
  key: string
) =>
  app.inject({
    method: 'POST',
    url: '/v1/tasks',
    headers: { ...OPERATOR, 'x-tenant-id': CONTROLLED_TEST_TENANT },
    payload: taskBody(sessionId, key)
  })

describe('SPEC 0262 the creation routes use the unit', () => {
  it('POST /v1/tasks and POST /v1/approvals with an identity go through runAuthorizedMutation exactly once', async () => {
    const { app, sessionId } = await setup()
    const spy = vi.spyOn(app.caseAuthority, 'runAuthorizedMutation')
    expect(
      (await post(app, sessionId, 'unit-memory-key-0001')).statusCode
    ).toBe(200)
    expect(spy).toHaveBeenCalledTimes(1)
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-operator-id': 'supervisor.case-manager',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': CONTROLLED_TEST_TENANT,
        'idempotency-key': 'unit-memory-approval-0001'
      },
      payload: {
        sessionId,
        proposedAction: 'handoff_to_operator',
        summary: 'Resumo sintetico',
        riskLevel: 'high'
      }
    })
    expect(approval.statusCode).toBe(200)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('without an identity (controlled test profile) the unit is not involved', async () => {
    const app = buildServer()
    const spy = vi.spyOn(app.caseAuthority, 'runAuthorizedMutation')
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'unit-memory-noid-1',
        senderRef: '+551177776666',
        body: 'Mensagem sintetica',
        receivedAt: '2026-10-28T14:00:00-03:00'
      }
    })
    const sessionId = inbound.json().data.sessionId as string
    const created = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: taskBody(sessionId, 'unit-memory-key-0009')
    })
    expect(created.statusCode).toBe(200)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('SPEC 0262 authorization unit (memory)', () => {
  it('R01: a granted Operator creates the task through the unit', async () => {
    const { app, sessionId } = await setup()
    const response = await post(app, sessionId, 'unit-memory-key-0001')
    expect(response.statusCode).toBe(200)
  })

  it('R01/R04: after the revocation a new creation and the replay of the earlier one are 404', async () => {
    const { app, sessionId, conversationId } = await setup()
    expect(
      (await post(app, sessionId, 'unit-memory-key-0001')).statusCode
    ).toBe(200)
    const caseId = await findCaseId(
      app,
      'core_conversation',
      conversationId,
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    )
    const revoked = await putAssignment(
      app,
      caseId,
      OPERATOR['x-operator-id'],
      { status: 'REVOKED', expectedRevision: 1 },
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    )
    expect(revoked.statusCode).toBe(200)
    const replay = await post(app, sessionId, 'unit-memory-key-0001')
    const fresh = await post(app, sessionId, 'unit-memory-key-0002')
    expect(replay.statusCode).toBe(404)
    expect(fresh.statusCode).toBe(404)
    expect(JSON.stringify(replay.json())).not.toContain('unit-memory-key-0001')
  })

  it('R11: a revocation issued while an authorized write is in flight waits for it (same queue) and the order is preserved', async () => {
    const { app, sessionId, conversationId } = await setup()
    const caseId = await findCaseId(
      app,
      'core_conversation',
      conversationId,
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    )
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered!: () => void
    const inside = new Promise<void>((resolve) => {
      entered = resolve
    })
    const order: string[] = []
    const unit = app.caseAuthority.runAuthorizedMutation(
      CONTROLLED_TEST_TENANT,
      {
        operatorId: OPERATOR['x-operator-id'],
        authorize: async (snapshot) => {
          const located = await snapshot.coreSessionCase(sessionId)
          if (
            !located?.caseId ||
            !(await snapshot.hasActiveGrant(
              located.caseId,
              OPERATOR['x-operator-id']
            ))
          ) {
            throw new Error('denied')
          }
        },
        write: async () => {
          entered()
          await gate
          order.push('write')
          return 'wrote'
        }
      }
    )
    await inside
    const revocation = putAssignment(
      app,
      caseId,
      OPERATOR['x-operator-id'],
      { status: 'REVOKED', expectedRevision: 1 },
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    ).then((response) => {
      order.push('revocation')
      return response
    })
    await new Promise((resolve) => setTimeout(resolve, 100))
    // Authorized and still writing: the revocation has not run.
    expect(order).toEqual([])
    release()
    expect(await unit).toBe('wrote')
    expect((await revocation).statusCode).toBe(200)
    expect(order).toEqual(['write', 'revocation'])
  })

  it('R02 (revocation first): a unit that starts after the revocation is denied before writing', async () => {
    const { app, sessionId, conversationId } = await setup()
    const caseId = await findCaseId(
      app,
      'core_conversation',
      conversationId,
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    )
    await putAssignment(
      app,
      caseId,
      OPERATOR['x-operator-id'],
      { status: 'REVOKED', expectedRevision: 1 },
      managerHeaders('supervisor.case-manager', CONTROLLED_TEST_TENANT)
    )
    let wrote = false
    await expect(
      app.caseAuthority.runAuthorizedMutation(CONTROLLED_TEST_TENANT, {
        operatorId: OPERATOR['x-operator-id'],
        authorize: async (snapshot) => {
          const located = await snapshot.coreSessionCase(sessionId)
          if (
            !located?.caseId ||
            !(await snapshot.hasActiveGrant(
              located.caseId,
              OPERATOR['x-operator-id']
            ))
          ) {
            throw new Error('denied')
          }
        },
        write: async () => {
          wrote = true
        }
      })
    ).rejects.toThrow('denied')
    expect(wrote).toBe(false)
  })
})
