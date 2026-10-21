import { describe, expect, it } from 'vitest'
import { buildServer } from '../../apps/api/src/server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
}

describe('critical runtime flows', () => {
  it('collects real runtime evidence for inbound, approval, task and audit flows', async () => {
    const app = buildServer()
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'e2e-msg-1',
        senderRef: '+5511988887777',
        body: 'Quero um horario para consulta',
        receivedAt: '2026-04-29T11:00:00-03:00'
      }
    })
    const inboundBody = inbound.json() as Envelope<{
      conversationId: string
      sessionId: string
      accepted: boolean
    }>
    const sessionId = inboundBody.data.sessionId

    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Slot sugerido para revisao humana',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<{
      id: string
      status: string
    }>

    const decision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'approver.shift-a',
        'x-operator-role': 'Approver'
      },
      payload: { decision: 'approved' }
    })
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Confirmar contato humano',
        description:
          'Operador deve confirmar dados antes de qualquer acao real',
        priority: 'urgent',
        source: 'operator',
        idempotencyKey: 'e2e-task-1'
      }
    })
    // SPEC0176 §5: approval/task events are not session-linked by their
    // producer; the full tenant audit reader still exposes them.
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    expect(inboundBody.data.accepted).toBe(true)
    expect(approvalBody.data.status).toBe('pending')
    expect((decision.json() as Envelope<{ status: string }>).data.status).toBe(
      'approved'
    )
    expect((task.json() as Envelope<{ status: string }>).data.status).toBe(
      'open'
    )
    expect(
      (
        audit.json() as Envelope<{
          page: { items: Array<{ type: string }> }
        }>
      ).data.page.items.map((event) => event.type)
    ).toContain('approval_decision')
  })
})
