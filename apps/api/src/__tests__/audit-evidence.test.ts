import { describe, expect, it } from 'vitest'
import { buildServer, type RuntimeLogEntry } from '../server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

interface AuditEvidenceResponse {
  summary: {
    totalEvents: number
    byType: Record<string, number>
    byActorType: Record<string, number>
    byCorrelationId: Record<string, number>
    bySessionId: Record<string, number>
  }
  page: {
    items: Array<{
      id: string
      type: string
      actorType: string
      actorId: string
      correlationId: string
      payload: unknown
    }>
    pageInfo: {
      limit: number
      offset: number
      total: number
      hasNextPage: boolean
    }
  }
  export: {
    format: 'json'
    controlled: true
    externalDispatch: false
    requestedBy: string
  }
  governance: {
    retention: {
      policyId: string
      approvedForRealData: false
      humanSignoffRequired: true
    }
    payload: {
      mode: 'minimized'
      rawPayloadReturned: false
      redactedFields: string[]
    }
    export: {
      externalDispatch: false
      externalExportRequiresApproval: true
    }
  }
}

async function createEvidenceFixture(app: ReturnType<typeof buildServer>) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: 'audit-evidence-msg-1',
      senderRef: '+551144443333',
      body: 'Mensagem ficticia para evidencia operacional',
      receivedAt: '2026-04-29T17:00:00-03:00'
    }
  })
  const inboundBody = inbound.json() as Envelope<{
    sessionId: string
    conversationId: string
  }>
  const approval = await app.inject({
    method: 'POST',
    url: '/v1/approvals',
    payload: {
      sessionId: inboundBody.data.sessionId,
      proposedAction: 'create_appointment_draft',
      summary: 'Apenas rascunho controlado',
      riskLevel: 'medium'
    },
    headers: {
      'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
    }
  })
  const approvalBody = approval.json() as Envelope<{ id: string }>

  await app.inject({
    method: 'POST',
    url: `/v1/approvals/${approvalBody.data.id}/decision`,
    headers: {
      'x-operator-id': 'supervisor.evidence',
      'x-operator-role': 'Supervisor'
    },
    payload: { decision: 'approved' }
  })

  return inboundBody.data
}

describe('audit evidence observability API', () => {
  it('requires audit-view identity for controlled audit evidence export', async () => {
    const app = buildServer()
    const fixture = await createEvidenceFixture(app)

    const missingIdentity = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${fixture.sessionId}`
    })
    const forbiddenRole = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${fixture.sessionId}`,
      headers: {
        'x-operator-id': 'operator.evidence',
        'x-operator-role': 'Operator'
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
  })

  it('returns paginated audit evidence, summary counts and controlled export metadata', async () => {
    const logs: RuntimeLogEntry[] = []
    const app = buildServer({ runtimeLogger: (entry) => logs.push(entry) })
    const fixture = await createEvidenceFixture(app)

    const response = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${fixture.sessionId}&limit=2&offset=0`,
      headers: {
        'x-operator-id': 'supervisor.evidence',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    const body = response.json() as Envelope<AuditEvidenceResponse>
    expect(response.statusCode).toBe(200)
    expect(body.data.summary.totalEvents).toBeGreaterThanOrEqual(3)
    expect(body.data.summary.byType).toMatchObject({
      integration_event: expect.any(Number),
      approval_decision: expect.any(Number)
    })
    expect(body.data.summary.byActorType).toMatchObject({
      System: expect.any(Number),
      Supervisor: expect.any(Number)
    })
    expect(body.data.summary.bySessionId).toMatchObject({
      [fixture.sessionId]: expect.any(Number)
    })
    expect(
      Object.keys(body.data.summary.byCorrelationId).every((correlationId) =>
        correlationId.startsWith('corr_')
      )
    ).toBe(true)
    expect(body.data.page.items).toHaveLength(2)
    expect(
      body.data.page.items.every((event) =>
        event.correlationId.startsWith('corr_')
      )
    ).toBe(true)
    expect(body.data.page.pageInfo).toMatchObject({
      limit: 2,
      offset: 0,
      total: body.data.summary.totalEvents,
      hasNextPage: true
    })
    expect(body.data.export).toMatchObject({
      format: 'json',
      controlled: true,
      externalDispatch: false,
      requestedBy: 'supervisor.evidence'
    })
    expect(body.data.governance).toMatchObject({
      retention: {
        policyId: 'controlled-construction-audit-retention-v1',
        approvedForRealData: false,
        humanSignoffRequired: true
      },
      payload: {
        mode: 'minimized',
        rawPayloadReturned: false
      },
      export: {
        externalDispatch: false,
        externalExportRequiresApproval: true
      }
    })
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'observability.audit_evidence_exported',
        route: '/v1/observability/audit-evidence',
        status: 'ok',
        sessionId: fixture.sessionId
      })
    )
  })

  it('filters audit evidence by correlationId and rejects invalid query input safely', async () => {
    const app = buildServer()
    const fixture = await createEvidenceFixture(app)
    const sessionAudit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${fixture.sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.evidence',
        'x-operator-role': 'Supervisor'
      }
    })
    const sessionAuditBody = sessionAudit.json() as Envelope<{
      events: Array<{ correlationId: string }>
    }>
    const correlationId = sessionAuditBody.data.events[0]?.correlationId ?? ''

    const filtered = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?correlationId=${correlationId}`,
      headers: {
        'x-operator-id': 'admin.evidence',
        'x-operator-role': 'Admin'
      }
    })
    const invalidType = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?type=not_a_real_type',
      headers: {
        'x-operator-id': 'admin.evidence',
        'x-operator-role': 'Admin'
      }
    })
    const invalidPagination = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?limit=250',
      headers: {
        'x-operator-id': 'admin.evidence',
        'x-operator-role': 'Admin'
      }
    })
    await app.close()

    const filteredBody = filtered.json() as Envelope<AuditEvidenceResponse>
    expect(filtered.statusCode).toBe(200)
    expect(filteredBody.data.page.items.length).toBeGreaterThanOrEqual(1)
    expect(
      filteredBody.data.page.items.every(
        (event) => event.correlationId === correlationId
      )
    ).toBe(true)
    expect(invalidType.statusCode).toBe(400)
    expect((invalidType.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(invalidPagination.statusCode).toBe(400)
    expect((invalidPagination.json() as Envelope<never>).error?.code).toBe(
      'invalid_pagination'
    )
  })

  it('redacts sensitive audit evidence payload fields and supports positive governance filters', async () => {
    const app = buildServer()
    const fixture = await createEvidenceFixture(app)
    await app.persistence.audit.append(
      {
        type: 'safety_event',
        actorType: 'System',
        actorId: 'governance.fixture',
        correlationId: 'corr_00000000-0000-4000-8000-000000000099',
        policyVersion: 'test-policy',
        payload: {
          sessionId: fixture.sessionId,
          effect: 'redaction_test_only',
          body: 'Mensagem pessoal ficticia',
          phone: '+5511999999999',
          token: 'secret-token',
          nested: {
            authorization: 'Bearer secret',
            safeStatus: 'kept'
          }
        }
      },
      'tenant_00000000-0000-4000-8000-000000000001'
    )

    const response = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${fixture.sessionId}&type=safety_event&actorId=governance.fixture`,
      headers: {
        'x-operator-id': 'supervisor.evidence',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    const body = response.json() as Envelope<AuditEvidenceResponse>
    expect(response.statusCode).toBe(200)
    expect(body.data.summary.totalEvents).toBe(1)
    expect(body.data.page.pageInfo.total).toBe(body.data.summary.totalEvents)
    expect(body.data.page.items).toHaveLength(1)
    expect(body.data.page.items[0]).toMatchObject({
      type: 'safety_event',
      actorId: 'governance.fixture',
      payload: {
        sessionId: fixture.sessionId,
        effect: 'redaction_test_only',
        nested: { safeStatus: 'kept' }
      }
    })
    const serializedPayload = JSON.stringify(body.data.page.items[0]?.payload)
    expect(serializedPayload).not.toContain('Mensagem pessoal')
    expect(serializedPayload).not.toContain('+5511999999999')
    expect(serializedPayload).not.toContain('secret-token')
    expect(serializedPayload).not.toContain('Bearer secret')
    expect(body.data.governance.payload.redactedFields).toEqual([])
  })
})
