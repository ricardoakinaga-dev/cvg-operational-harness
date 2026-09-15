import { afterEach, describe, expect, it, vi } from 'vitest'
import { InMemoryCapabilityApprovalAuthority } from '@cvg/platform'
import { buildServer } from '../server.ts'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

const operatorHeaders = {
  'x-operator-id': 'operator.envelope',
  'x-operator-role': 'Operator',
  'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000821'
}

const supervisorHeaders = {
  'x-operator-id': 'supervisor.envelope',
  'x-operator-role': 'Supervisor',
  'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000821'
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('server boundary envelopes', () => {
  it('answers liveness and readiness probes without exposing internals', async () => {
    const app = buildServer()
    const live = await app.inject({ method: 'GET', url: '/live' })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    await app.close()

    expect(live.statusCode).toBe(200)
    expect((live.json() as Envelope<{ probe: string }>).data?.probe).toBe(
      'live'
    )
    expect(ready.statusCode).toBe(200)
    expect(ready.headers['cache-control']).toBe('no-store')
    expect((ready.json() as Envelope<{ ready: boolean }>).data?.ready).toBe(
      true
    )
  })

  it('reports 503 when production readiness fails closed', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.envelope',
        role: 'Supervisor',
        tenantId: operatorHeaders['x-tenant-id']
      }),
      webhookVerifier: () => true,
      inboundTenantResolver: () => operatorHeaders['x-tenant-id']
    })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    await app.close()

    expect(ready.statusCode).toBe(503)
    const body = ready.json() as Envelope<{
      ready: boolean
      checks: Array<{ name: string; status: string }>
    }>
    expect(body.data?.ready).toBe(false)
    expect(body.data?.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'persistence', status: 'failed' })
      ])
    )
  })

  it('hides request metrics when the endpoint is disabled', async () => {
    const app = buildServer({ requestMetricsEnabled: false })
    const response = await app.inject({ method: 'GET', url: '/health/metrics' })
    await app.close()

    expect(response.statusCode).toBe(404)
    expect((response.json() as Envelope<never>).error?.code).toBe(
      'invalid_action'
    )
  })

  it('rejects oversize request targets with a stable 414 envelope', async () => {
    const app = buildServer()
    const longPath = `/${'a'.repeat(9 * 1024)}`
    const response = await app.inject({ method: 'GET', url: longPath })
    await app.close()

    expect(response.statusCode).toBe(414)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'request_uri_too_long' }
    })
  })

  it('maps malformed JSON, unsupported media type and oversized bodies', async () => {
    const app = buildServer()
    const invalidJson = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'content-type': 'application/json' },
      payload: '{"broken":'
    })
    const mediaType = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'content-type': 'application/xml' },
      payload: '<body>plain text body</body>'
    })
    const tooLarge = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'content-type': 'application/json' },
      payload: `{"body":"${'x'.repeat(1024 * 1024 + 16)}"}`
    })
    const notFound = await app.inject({
      method: 'GET',
      url: '/v1/does-not-exist'
    })
    await app.close()

    expect(invalidJson.statusCode).toBe(400)
    expect(invalidJson.json()).toMatchObject({
      success: false,
      error: { code: 'validation_failed' }
    })
    expect(mediaType.statusCode).toBe(415)
    expect(mediaType.json()).toMatchObject({
      success: false,
      error: { code: 'unsupported_media_type' }
    })
    expect(tooLarge.statusCode).toBe(413)
    expect(tooLarge.json()).toMatchObject({
      success: false,
      error: { code: 'payload_too_large' }
    })
    expect(notFound.statusCode).toBe(404)
    expect(notFound.json()).toMatchObject({
      success: false,
      error: { code: 'not_found' }
    })
  })

  it('validates audit evidence pagination and filters', async () => {
    const app = buildServer()
    const invalidLimit = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?limit=101',
      headers: supervisorHeaders
    })
    const invalidOffset = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?offset=-1',
      headers: supervisorHeaders
    })
    const invalidType = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?type=not_a_type',
      headers: supervisorHeaders
    })
    const duplicateFilter = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?sessionId=one&sessionId=two',
      headers: supervisorHeaders
    })
    const invalidFilter = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence?actorId=%20',
      headers: supervisorHeaders
    })
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence',
      headers: operatorHeaders
    })
    await app.close()

    expect(invalidLimit.statusCode).toBe(400)
    expect((invalidLimit.json() as Envelope<never>).error?.code).toBe(
      'invalid_pagination'
    )
    expect(invalidOffset.statusCode).toBe(400)
    expect((invalidOffset.json() as Envelope<never>).error?.code).toBe(
      'invalid_pagination'
    )
    expect(invalidType.statusCode).toBe(400)
    expect((invalidType.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(duplicateFilter.statusCode).toBe(400)
    expect((duplicateFilter.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(invalidFilter.statusCode).toBe(400)
    expect(unauthorized.statusCode).toBe(403)
  })

  it('rejects invalid platform scope, task transitions and missing checkpoints', async () => {
    const app = buildServer()
    const missingTenant = await app.inject({
      method: 'POST',
      url: '/v1/admin/agents',
      headers: {
        'x-operator-id': 'admin.envelope',
        'x-operator-role': 'Admin'
      },
      payload: {
        slug: 'no-tenant-agent',
        name: 'No Tenant',
        description: 'Fixture'
      }
    })
    const missingCheckpoint = await app.inject({
      method: 'POST',
      url: `/v1/observability/audit-evidence/checkpoints/audit_checkpoint_00000000-0000-4000-8000-000000000000/transition`,
      headers: supervisorHeaders,
      payload: { status: 'ARCHIVED', expectedStatus: 'SEALED' }
    })
    const missingDecision = await app.inject({
      method: 'POST',
      url: `/v1/approvals/approval_request_00000000-0000-4000-8000-000000000000/decision`,
      headers: {
        'x-operator-id': 'approver.envelope',
        'x-operator-role': 'Approver',
        'x-tenant-id': operatorHeaders['x-tenant-id']
      },
      payload: { decision: 'approved' }
    })
    const invalidApproval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: { sessionId: 'not-a-session' }
    })
    await app.close()

    expect(missingTenant.statusCode).toBe(401)
    expect((missingTenant.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
    expect(missingCheckpoint.statusCode).toBe(400)
    expect(missingDecision.statusCode).toBe(400)
    expect(invalidApproval.statusCode).toBe(400)
    expect((invalidApproval.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
  })

  it('accepts a same-status task update and rejects invalid transition payloads', async () => {
    const app = buildServer({
      requireAuthenticatedMutations: true,
      inboundTenantResolver: () => operatorHeaders['x-tenant-id']
    })
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'envelope-task-1',
        senderRef: 'fixture-sender',
        body: 'Mensagem fictícia para tarefa',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const sessionId = (inbound.json() as Envelope<{ sessionId: string }>).data
      ?.sessionId
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: operatorHeaders,
      payload: {
        sessionId,
        title: 'Tarefa de envelope',
        description: 'Sem efeito real',
        priority: 'medium',
        source: 'envelope-coverage',
        idempotencyKey: 'envelope-task-key-1'
      }
    })
    const taskId = (task.json() as Envelope<{ id: string }>).data?.id
    const sameStatus = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskId}/status`,
      headers: operatorHeaders,
      payload: { status: 'open' }
    })
    const invalidStatus = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskId}/status`,
      headers: operatorHeaders,
      payload: { status: 'not-a-status' }
    })
    const missingTask = await app.inject({
      method: 'PATCH',
      url: '/v1/tasks/task_00000000-0000-4000-8000-000000000000/status',
      headers: operatorHeaders,
      payload: { status: 'in_progress' }
    })
    const unauthenticatedTask = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Tarefa sem identidade',
        description: 'Sem efeito real',
        priority: 'medium',
        source: 'envelope-coverage',
        idempotencyKey: 'envelope-task-key-2'
      }
    })
    const approval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: operatorHeaders,
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Horário fictício sugerido',
        riskLevel: 'medium'
      }
    })
    const unauthenticatedApproval = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      payload: {
        sessionId,
        proposedAction: 'create_appointment_draft',
        summary: 'Horário fictício sugerido',
        riskLevel: 'medium'
      }
    })
    await app.close()

    expect(sameStatus.statusCode).toBe(200)
    expect(
      (sameStatus.json() as Envelope<{ status: string }>).data?.status
    ).toBe('open')
    expect(invalidStatus.statusCode).toBe(400)
    expect((invalidStatus.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(missingTask.statusCode).toBe(400)
    expect((missingTask.json() as Envelope<never>).error?.code).toBe(
      'invalid_action'
    )
    expect(unauthenticatedTask.statusCode).toBe(401)
    expect(approval.statusCode).toBe(200)
    expect(unauthenticatedApproval.statusCode).toBe(401)
  })

  it('rejects audit-review approvals without full audit authority', async () => {
    const app = buildServer()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: operatorHeaders,
      payload: {
        sessionId: 'sess_00000000-0000-4000-8000-000000000821',
        proposedAction: 'audit_evidence_export_review',
        summary: 'Revisão fictícia',
        riskLevel: 'low'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(403)
    expect((response.json() as Envelope<never>).error?.code).toBe('forbidden')
  })

  it('composes injected knowledge, capability authority and postgres defaults', async () => {
    const app = buildServer({
      persistence: {
        kind: 'postgres-pool',
        pool: {
          connect: async () => {
            throw new Error('pool connection must not open during construction')
          }
        }
      },
      capabilityApprovalAuthority: new InMemoryCapabilityApprovalAuthority(),
      resolveApprovedKnowledge: () => null,
      agentRuntime: { resolveAgentId: () => null }
    })
    const health = await app.inject({ method: 'GET', url: '/health' })
    await app.close()

    expect(health.statusCode).toBe(200)
  })

  it('rejects unknown takeover sessions, malformed audit identity and expired approvals', async () => {
    const app = buildServer()
    const takeover = await app.inject({
      method: 'POST',
      url: '/v1/sessions/sess_00000000-0000-4000-8000-000000000000/takeover',
      headers: supervisorHeaders,
      payload: { event: 'accept_handoff' }
    })
    const invalidAuditRole = await app.inject({
      method: 'GET',
      url: '/v1/audit/sessions/sess_00000000-0000-4000-8000-000000000000',
      headers: {
        'x-operator-id': 'operator.envelope',
        'x-operator-role': 'Root'
      }
    })
    const expiredApproval = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: {
        'x-operator-id': 'supervisor.envelope',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': operatorHeaders['x-tenant-id']
      },
      payload: {
        agentId: 'agent_00000000-0000-4000-8000-000000000000',
        versionId: 'agent_version_00000000-0000-4000-8000-000000000000',
        toolName: 'find_available_slots',
        actorId: 'operator.other',
        input: { message: 'Mensagem fictícia' },
        expiresAt: new Date(Date.now() - 60_000).toISOString()
      }
    })
    const longApproval = await app.inject({
      method: 'POST',
      url: '/v1/admin/capability-approvals',
      headers: {
        'x-operator-id': 'supervisor.envelope',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': operatorHeaders['x-tenant-id']
      },
      payload: {
        agentId: 'agent_00000000-0000-4000-8000-000000000000',
        versionId: 'agent_version_00000000-0000-4000-8000-000000000000',
        toolName: 'find_available_slots',
        actorId: 'operator.other',
        input: { message: 'Mensagem fictícia' },
        expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString()
      }
    })
    await app.close()

    expect(takeover.statusCode).toBe(400)
    expect((takeover.json() as Envelope<never>).error?.code).toBe(
      'invalid_action'
    )
    expect(invalidAuditRole.statusCode).toBe(401)
    expect(expiredApproval.statusCode).toBe(400)
    expect((expiredApproval.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
    expect(longApproval.statusCode).toBe(400)
  })

  it('requires a trusted operator tenant for production data-plane reads', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.envelope',
        role: 'Operator'
      }),
      webhookVerifier: () => true,
      inboundTenantResolver: () => operatorHeaders['x-tenant-id']
    })
    const response = await app.inject({ method: 'GET', url: '/v1/tasks' })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect((response.json() as Envelope<never>).error?.code).toBe(
      'unauthorized'
    )
  })
})
