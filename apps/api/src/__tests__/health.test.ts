import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import { grantCase } from './case-authorization-fixtures.ts'
import { approvalsRoute } from '../routes/approvals.ts'
import { auditSessionRoute } from '../routes/audit.ts'
import { conversationTimelineRoute } from '../routes/conversations.ts'
import { healthRoute } from '../routes/health.ts'
import { tasksRoute } from '../routes/tasks.ts'
import { webhookRoute } from '../routes/webhooks.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
}

interface InboundResult {
  conversationId: string
  sessionId: string | null
  messageId: string
  accepted: boolean
}

interface ApprovalResult {
  id: string
  sessionId: string
  status: string
}

const operatorHeaders = {
  'x-operator-id': 'operator.health',
  'x-operator-role': 'Operator'
}

const supervisorHeaders = {
  'x-operator-id': 'supervisor.health',
  'x-operator-role': 'Supervisor'
}

describe('api runtime', () => {
  it('exposes route contracts and health', async () => {
    const app = buildServer()
    const response = await app.inject({ method: 'GET', url: healthRoute })
    const body = response.json() as Envelope<{
      status: string
      runtime: string
    }>
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(body.data).toEqual({ status: 'ok', runtime: 'api' })
    expect(webhookRoute).toBe('/v1/webhooks/channels/:channel/messages')
    expect(conversationTimelineRoute).toBe(
      '/v1/conversations/:conversationId/timeline'
    )
    expect(approvalsRoute).toBe('/v1/approvals')
    expect(tasksRoute).toBe('/v1/tasks')
    expect(auditSessionRoute).toBe('/v1/audit/sessions/:sessionId')
  })

  it('runs conversation, task, approval and audit endpoints with real in-memory state', async () => {
    const app = buildServer()
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'msg-1',
        senderRef: '+5511999999999',
        body: 'Preciso agendar consulta',
        receivedAt: '2026-04-29T10:00:00-03:00'
      }
    })
    const inboundBody = inbound.json() as Envelope<InboundResult>
    const sessionId = inboundBody.data.sessionId ?? ''

    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'msg-1',
        senderRef: '+5511999999999',
        body: 'Preciso agendar consulta',
        receivedAt: '2026-04-29T10:00:00-03:00'
      }
    })
    const duplicateBody = duplicate.json() as Envelope<InboundResult>

    // AUD-0621 F01 / SPEC0176: the Operator reads the timeline only after a
    // read_case grant on the conversation root through the public registry.
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: inboundBody.data.conversationId,
      operatorId: 'operator.health'
    })
    const timeline = await app.inject({
      method: 'GET',
      url: `/v1/conversations/${inboundBody.data.conversationId}/timeline`,
      headers: operatorHeaders
    })
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Validar retorno',
        description: 'Ligar para tutor',
        priority: 'high',
        source: 'agent',
        idempotencyKey: 'task-key-1'
      }
    })
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Horario sugerido',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<ApprovalResult>
    // SPEC0251: the Approver decides only on an assigned case.
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: inboundBody.data.conversationId,
      operatorId: 'approver.shift-a',
      role: 'Approver'
    })
    const forbiddenDecision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      payload: { decision: 'approved' }
    })
    const allowedDecision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'approver.shift-a',
        'x-operator-role': 'Approver'
      },
      payload: { decision: 'approved' }
    })
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: supervisorHeaders
    })
    const fullAudit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: supervisorHeaders
    })
    await app.close()

    expect(inboundBody.data.accepted).toBe(true)
    expect(duplicateBody.data.accepted).toBe(false)
    expect(
      (timeline.json() as Envelope<{ messages: unknown[] }>).data.messages
    ).toHaveLength(1)
    expect((task.json() as Envelope<{ status: string }>).data.status).toBe(
      'open'
    )
    expect((forbiddenDecision.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
    expect(
      (allowedDecision.json() as Envelope<ApprovalResult>).data.status
    ).toBe('approved')
    // SPEC0176 §5: the session reader returns only events whose producer
    // linked them to this session (inbound acceptance and its duplicate);
    // task/approval events stay visible in the full tenant audit reader.
    expect(audit.statusCode).toBe(200)
    expect(
      (audit.json() as Envelope<{ events: unknown[] }>).data.events.length
    ).toBeGreaterThanOrEqual(1)
    expect(
      (fullAudit.json() as Envelope<{ summary: { totalEvents: number } }>).data
        .summary.totalEvents
    ).toBeGreaterThanOrEqual(3)
  })
})
