import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'
import { grantCase } from './case-authorization-fixtures.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

async function createFixtureSession(
  app: ReturnType<typeof buildServer>,
  suffix: string
) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: `operator-identity-${suffix}`,
      senderRef: '+551155551111',
      body: 'Atendimento ficticio para validar identidade operacional',
      receivedAt: '2026-04-29T16:00:00-03:00'
    }
  })
  return (inbound.json() as Envelope<{ sessionId: string }>).data.sessionId
}

/** Same fixture, also returning the conversation for a SPEC0251 grant. */
async function createFixtureCase(
  app: ReturnType<typeof buildServer>,
  suffix: string
) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: `operator-identity-${suffix}`,
      senderRef: '+551155551111',
      body: 'Atendimento ficticio para validar identidade operacional',
      receivedAt: '2026-04-29T16:00:00-03:00'
    }
  })
  return (
    inbound.json() as Envelope<{ sessionId: string; conversationId: string }>
  ).data
}

describe('operator identity RBAC hardening', () => {
  it('requires controlled identity headers for operational panel reads', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(app, 'panel-read-rbac')
    const approvalsRead = await app.inject({
      method: 'GET',
      url: '/v1/approvals'
    })
    const tasksRead = await app.inject({ method: 'GET', url: '/v1/tasks' })
    const conversationsRead = await app.inject({
      method: 'GET',
      url: '/v1/conversations?limit=25&offset=0'
    })
    const auditRead = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`
    })
    await app.close()

    for (const response of [
      approvalsRead,
      tasksRead,
      conversationsRead,
      auditRead
    ]) {
      const body = response.json() as Envelope<never>
      expect(response.statusCode).toBe(401)
      expect(body.success).toBe(false)
      expect(body.error?.code).toBe('unauthorized')
    }
  })

  it('requires explicit controlled identity headers for approval decisions', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(
      app,
      'approval-missing-headers'
    )
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Apenas rascunho controlado',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<{ id: string }>

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      payload: { decision: 'approved', note: 'sem identidade' }
    })
    await app.close()

    const rejectedBody = rejected.json() as Envelope<never>
    expect(rejected.statusCode).toBe(401)
    expect(rejectedBody.success).toBe(false)
    expect(rejectedBody.error?.code).toBe('unauthorized')
  })

  it('rejects approval decisions when the controlled role lacks approval permission', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(app, 'approval-forbidden-role')
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Apenas rascunho controlado',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<{ id: string }>

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      },
      payload: { decision: 'approved', note: 'papel errado' }
    })
    await app.close()

    const rejectedBody = rejected.json() as Envelope<never>
    expect(rejected.statusCode).toBe(403)
    expect(rejectedBody.success).toBe(false)
    expect(rejectedBody.error?.code).toBe('forbidden')
  })

  it('audits approval decisions with the controlled operator identity from headers', async () => {
    const app = buildServer()
    const { sessionId, conversationId } = await createFixtureCase(
      app,
      'approval-controlled-identity'
    )
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Apenas rascunho controlado',
        riskLevel: 'medium'
      }
    })
    const approvalBody = approval.json() as Envelope<{ id: string }>

    // AUD-0621 F01 / SPEC0176: an Approver without a read_case grant gets
    // the static 404 on the session reader; the decision actor is asserted
    // on the full tenant audit reader (approval events are not session-linked).
    // Read before the SPEC0251 grant, while the Approver is unassigned.
    const limitedAudit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: {
        'x-operator-id': 'approver.shift-a',
        'x-operator-role': 'Approver'
      }
    })
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: conversationId,
      operatorId: 'approver.shift-a',
      role: 'Approver'
    })
    const decision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalBody.data.id}/decision`,
      headers: {
        'x-operator-id': 'approver.shift-a',
        'x-operator-role': 'Approver'
      },
      payload: { decision: 'approved', note: 'identidade controlada' }
    })
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
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
          actorId: string
          actorType: string
          payload: Record<string, unknown>
        }>
      }
    }>
    expect(limitedAudit.statusCode).toBe(404)
    expect(decision.statusCode).toBe(200)
    expect(decisionBody.data).toMatchObject({
      status: 'approved',
      decidedBy: 'approver.shift-a'
    })
    expect(auditBody.data.page.items).toContainEqual(
      expect.objectContaining({
        type: 'approval_decision',
        actorId: 'approver.shift-a',
        actorType: 'Approver',
        payload: expect.objectContaining({ effect: 'approval_state_only' })
      })
    )
  })

  it('requires full audit identity for controlled audit evidence export approval requests', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(app, 'export-approval-rbac')
    const payload = {
      sessionId,
      proposedAction: 'audit_evidence_export_review',
      summary:
        'Solicitar revisao humana para export controlado de audit evidence sem despacho externo.',
      riskLevel: 'high'
    }

    const missingIdentity = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload
    })
    const forbiddenRole = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-operator-id': 'operator.audit',
        'x-operator-role': 'Operator'
      },
      payload
    })
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-operator-id': 'supervisor.audit',
        'x-operator-role': 'Supervisor'
      },
      payload
    })
    // SPEC0176 §5: approval events are not session-linked by their producer;
    // the actor is asserted on the full tenant audit reader.
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.audit',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    expect(missingIdentity.statusCode).toBe(401)
    expect((missingIdentity.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
    expect(forbiddenRole.statusCode).toBe(403)
    expect((forbiddenRole.json() as Envelope<never>).error?.code).toBe(
      'forbidden'
    )
    expect(accepted.statusCode).toBe(200)
    expect(
      (accepted.json() as Envelope<{ proposedAction: string }>).data
        .proposedAction
    ).toBe('audit_evidence_export_review')
    expect(
      (
        audit.json() as Envelope<{
          page: { items: Array<{ actorId: string; actorType: string }> }
        }>
      ).data.page.items
    ).toContainEqual(
      expect.objectContaining({
        actorId: 'supervisor.audit',
        actorType: 'Supervisor'
      })
    )
  })

  it('requires task lifecycle updates to use an Operator identity from headers', async () => {
    const app = buildServer()
    const { sessionId, conversationId } = await createFixtureCase(
      app,
      'task-controlled-identity'
    )
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Validar RBAC de tarefa',
        description: 'Tarefa interna controlada',
        priority: 'high',
        source: 'operator-identity-test',
        idempotencyKey: 'operator-task-1'
      }
    })
    const taskBody = task.json() as Envelope<{ id: string }>

    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskBody.data.id}/status`,
      headers: {
        'x-operator-id': 'approver.shift-a',
        'x-operator-role': 'Approver'
      },
      payload: { status: 'in_progress' }
    })
    // AUD-0621 F01 / SPEC0176: an unassigned Operator gets the static 404 on
    // the session reader; the task actor is asserted on the full tenant
    // audit reader (task events are not session-linked by their producer).
    // Read before the SPEC0251 grant, while the Operator is unassigned.
    const limitedAudit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      }
    })
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: conversationId,
      operatorId: 'operator.shift-a'
    })
    const accepted = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskBody.data.id}/status`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      },
      payload: { status: 'in_progress' }
    })
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    const forbiddenBody = forbidden.json() as Envelope<never>
    const acceptedBody = accepted.json() as Envelope<{ status: string }>
    const auditBody = audit.json() as Envelope<{
      page: {
        items: Array<{
          actorId: string
          actorType: string
          payload: Record<string, unknown>
        }>
      }
    }>
    expect(limitedAudit.statusCode).toBe(404)
    expect(forbidden.statusCode).toBe(403)
    expect(forbiddenBody.error?.code).toBe('forbidden')
    expect(accepted.statusCode).toBe(200)
    expect(acceptedBody.data.status).toBe('in_progress')
    expect(auditBody.data.page.items).toContainEqual(
      expect.objectContaining({
        actorId: 'operator.shift-a',
        actorType: 'Operator',
        payload: expect.objectContaining({ effect: 'internal_task_state_only' })
      })
    )
  })
})
