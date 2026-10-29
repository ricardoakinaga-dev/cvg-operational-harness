import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000073'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000074'

function headers(tenantId: string) {
  return {
    'x-operator-id': 'operator.tenant-test',
    'x-operator-role': 'Supervisor',
    'x-tenant-id': tenantId
  }
}

async function inbound(
  app: ReturnType<typeof buildServer>,
  tenantId: string,
  externalMessageId: string
) {
  return app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/web/messages',
    headers: { 'x-tenant-id': tenantId },
    payload: {
      externalMessageId,
      senderRef: 'fixture-sender',
      body: `Mensagem de ${tenantId}`,
      receivedAt: '2026-08-23T10:00:00-03:00'
    }
  })
}

describe('tenant-scoped inbound data plane', () => {
  it('does not deduplicate or list another tenant data', async () => {
    const app = buildServer()
    const first = await inbound(app, tenantA, 'same-external-id')
    const second = await inbound(app, tenantB, 'same-external-id')
    const listA = await app.inject({
      method: 'GET',
      url: '/v1/conversations',
      headers: headers(tenantA)
    })
    const listB = await app.inject({
      method: 'GET',
      url: '/v1/conversations',
      headers: headers(tenantB)
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(200)
    expect(second.json().data.accepted).toBe(true)
    expect(listA.json().data.items).toHaveLength(1)
    expect(listA.json().data.items[0].lastMessageBody).toContain(tenantA)
    expect(listB.json().data.items).toHaveLength(1)
    expect(listB.json().data.items[0].lastMessageBody).toContain(tenantB)
  })

  it('does not expose a conversation timeline across tenant scopes', async () => {
    const app = buildServer()
    const first = await inbound(app, tenantA, 'cross-tenant-timeline')
    const conversationId = first.json().data.conversationId as string
    const response = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${conversationId}/timeline`,
      headers: headers(tenantB)
    })
    await app.close()

    // SPEC0176 §7: another tenant's object is the same static 404 as a
    // missing object (previously 400 invalid_action); still no data.
    expect(response.statusCode).toBe(404)
    expect(response.json().data).toBeNull()
    expect(response.json().error).toEqual({
      code: 'not_found',
      message: 'Resource not found'
    })
  })

  it('scopes tasks and approvals through the conversation tenant', async () => {
    const app = buildServer()
    const first = await inbound(app, tenantA, 'tenant-task-approval-a')
    const second = await inbound(app, tenantB, 'tenant-task-approval-b')
    const firstSessionId = first.json().data.sessionId as string
    const secondSessionId = second.json().data.sessionId as string

    const taskA = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'x-tenant-id': tenantA },
      payload: {
        sessionId: firstSessionId,
        title: 'Tarefa A',
        description: 'Escopo A',
        priority: 'medium',
        source: 'tenant-scope-test',
        idempotencyKey: 'tenant-task-a'
      }
    })
    const taskB = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'x-tenant-id': tenantB },
      payload: {
        sessionId: secondSessionId,
        title: 'Tarefa B',
        description: 'Escopo B',
        priority: 'medium',
        source: 'tenant-scope-test',
        idempotencyKey: 'tenant-task-b'
      }
    })
    const approvalA = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-tenant-id': tenantA,
        'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      payload: {
        sessionId: firstSessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Aprovação A',
        riskLevel: 'medium'
      }
    })
    const approvalB = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-tenant-id': tenantB,
        'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      payload: {
        sessionId: secondSessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Aprovação B',
        riskLevel: 'medium'
      }
    })
    const tasksA = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: headers(tenantA)
    })
    const tasksB = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: headers(tenantB)
    })
    const approvalsA = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: headers(tenantA)
    })
    const approvalsB = await app.inject({
      method: 'GET',
      url: '/v1/approvals',
      headers: headers(tenantB)
    })
    const crossTenantTask = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskA.json().data.id}/status`,
      headers: {
        ...headers(tenantB),
        'x-operator-role': 'Operator'
      },
      payload: { status: 'in_progress' }
    })
    const crossTenantApproval = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalA.json().data.id}/decision`,
      headers: {
        ...headers(tenantB),
        'x-operator-role': 'Supervisor'
      },
      payload: { decision: 'approved' }
    })
    await app.close()

    expect(taskA.statusCode).toBe(200)
    expect(taskB.statusCode).toBe(200)
    expect(approvalA.statusCode).toBe(200)
    expect(approvalB.statusCode).toBe(200)
    expect(tasksA.json().data).toHaveLength(1)
    expect(tasksB.json().data).toHaveLength(1)
    expect(approvalsA.json().data).toHaveLength(1)
    expect(approvalsB.json().data).toHaveLength(1)
    // SPEC0251 I3: another tenant's task or approval is the static 404.
    expect(crossTenantTask.statusCode).toBe(404)
    expect(crossTenantTask.json().error).toEqual({
      code: 'not_found',
      message: 'Resource not found'
    })
    expect(crossTenantApproval.statusCode).toBe(404)
    expect(crossTenantApproval.json().error).toEqual({
      code: 'not_found',
      message: 'Resource not found'
    })
  })

  it('does not expose audit events for a session outside the operator tenant', async () => {
    const app = buildServer()
    const first = await inbound(app, tenantA, 'tenant-audit-a')
    const sessionId = first.json().data.sessionId as string
    const response = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: headers(tenantB)
    })
    const evidence = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: headers(tenantB)
    })
    await app.close()

    // SPEC0176 §7: cross-tenant session → static 404 (previously 400).
    expect(response.statusCode).toBe(404)
    expect(response.json().data).toBeNull()
    expect(response.json().error.code).toBe('not_found')
    expect(evidence.statusCode).toBe(200)
    expect(evidence.json().data.summary.totalEvents).toBe(0)
    expect(evidence.json().data.page.items).toEqual([])
  })
})
