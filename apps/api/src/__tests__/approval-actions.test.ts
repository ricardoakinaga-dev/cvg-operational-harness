import { describe, expect, it } from 'vitest'
import { buildServer, type RuntimeLogEntry } from '../server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

describe('approval controlled actions API', () => {
  it('records assumed approvals as controlled handoffs with correlationId and no real-world side effect', async () => {
    const logs: RuntimeLogEntry[] = []
    const app = buildServer({ runtimeLogger: (entry) => logs.push(entry) })

    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'approval-action-msg-1',
        senderRef: '+551177776666',
        body: 'Preciso que alguem acompanhe o caso',
        receivedAt: '2026-04-29T14:00:00-03:00'
      }
    })
    const inboundBody = inbound.json() as Envelope<{ sessionId: string }>
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId: inboundBody.data.sessionId,
        proposedAction: 'handoff_to_operator',
        summary: 'Operador deve assumir atendimento ficticio',
        riskLevel: 'high'
      },
      headers: {
        'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
      }
    })
    const approvalBody = approval.json() as Envelope<{ id: string }>

    const decision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      },
      payload: { decision: 'assumed', note: 'handoff controlado' }
    })
    // SPEC0176 §5: the approval producer does not link its event to a case
    // session (payload.sessionId is not a lineage source), so the handoff is
    // asserted on the full tenant audit reader that still exposes it.
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${inboundBody.data.sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    const decisionBody = decision.json() as Envelope<{
      status: string
      decidedBy: string
    }>
    const auditBody = audit.json() as Envelope<{
      page: {
        items: Array<{
          type: string
          correlationId: string
          payload: Record<string, unknown>
        }>
      }
    }>
    const handoffEvent = auditBody.data.page.items.find(
      (event) => event.type === 'handoff'
    )

    expect(decision.statusCode).toBe(200)
    expect(decisionBody.data).toMatchObject({
      status: 'assumed',
      decidedBy: 'supervisor.shift-a'
    })
    expect(handoffEvent).toBeTruthy()
    expect(handoffEvent?.correlationId).toMatch(/^corr_/)
    expect(handoffEvent?.payload).toMatchObject({
      sessionId: inboundBody.data.sessionId,
      approvalRequestId: approvalBody.data.id,
      status: 'assumed',
      effect: 'handoff_only'
    })
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'approval.handoff_assumed',
        correlationId: expect.stringMatching(/^corr_/),
        sessionId: inboundBody.data.sessionId,
        resourceId: approvalBody.data.id
      })
    )
  })
})
