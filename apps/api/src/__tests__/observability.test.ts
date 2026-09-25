import { describe, expect, it } from 'vitest'
import { buildServer, type RuntimeLogEntry } from '../server.ts'
import {
  CompositeTelemetry,
  InMemoryObservationExporter,
  type ObservationExporter
} from '@cvg/observability'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

describe('api observability', () => {
  it('emits structured logs with correlationId for inbound, approval, task and audit flows', async () => {
    const logs: RuntimeLogEntry[] = []
    const app = buildServer({ runtimeLogger: (entry) => logs.push(entry) })

    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'obs-msg-1',
        senderRef: '+5511888887777',
        body: 'Mensagem ficticia para observabilidade',
        receivedAt: '2026-04-29T12:00:00-03:00'
      }
    })
    const inboundBody = inbound.json() as Envelope<{
      conversationId: string
      sessionId: string
    }>

    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId: inboundBody.data.sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Aprovacao ficticia',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<{ id: string }>

    await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'approver.observability',
        'x-operator-role': 'Approver'
      },
      payload: { decision: 'approved' }
    })
    await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId: inboundBody.data.sessionId,
        title: 'Tarefa ficticia',
        description: 'Validar correlationId',
        priority: 'high',
        source: 'observability-test',
        idempotencyKey: 'observability-task'
      }
    })
    await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${inboundBody.data.sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.observability',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    expect(logs.map((entry) => entry.event)).toEqual(
      expect.arrayContaining([
        'inbound.accepted',
        'approval.created',
        'approval.decided',
        'task.created',
        'audit.session_read'
      ])
    )
    expect(logs.every((entry) => entry.correlationId.startsWith('corr_'))).toBe(
      true
    )
    expect(
      logs.find((entry) => entry.event === 'inbound.accepted')?.sessionId
    ).toBe(inboundBody.data.sessionId)
  })

  it('keeps readiness healthy when an injected exporter fails', async () => {
    const collector = new InMemoryObservationExporter('api-synthetic-collector')
    const failing: ObservationExporter = {
      name: 'api-synthetic-failing-exporter',
      emit: () => {
        throw new Error('synthetic exporter outage')
      }
    }
    const telemetry = new CompositeTelemetry({
      exporters: [collector, failing]
    })
    const app = buildServer({ telemetry })

    const live = await app.inject({ method: 'GET', url: '/live' })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    await app.close()

    expect(live.statusCode).toBe(200)
    expect(ready.statusCode).toBe(200)
    expect(telemetry.exporter.health().status).toBe('degraded')
    expect(collector.observations().length).toBeGreaterThanOrEqual(4)
  })
})
