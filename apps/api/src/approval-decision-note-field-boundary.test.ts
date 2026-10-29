import { ResolveApprovalSchema } from '@cvg/shared'
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.ts'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

const TENANT_ID = 'tenant_00000000-0000-4000-8000-000000000093' as const
const NOTE_LIMIT = 4000

async function createPendingApproval(app: ReturnType<typeof buildServer>) {
  const created = await app.persistence.conversations.createWithSession({
    tenantId: TENANT_ID,
    channel: 'internal',
    senderRef: 'fixture-approval-decision-boundary',
    externalMessageId: `approval-decision-boundary-${crypto.randomUUID()}`,
    body: 'fixture controlada'
  })
  const response = await app.inject({
    method: 'POST',
    url: '/v1/approvals',
    headers: {
      'x-tenant-id': TENANT_ID,
      'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    payload: {
      sessionId: created.session.id,
      proposedAction: 'controlled_action',
      summary: 'Approval controlada',
      riskLevel: 'medium'
    }
  })
  const body = response.json() as Envelope<{ id: string }>
  expect(response.statusCode).toBe(200)
  expect(body.data?.id).toMatch(/^approval_/)
  return body.data!.id
}

describe('approval decision note field boundary', () => {
  it('rejects an over-limit note at the shared schema boundary', () => {
    const result = ResolveApprovalSchema.safeParse({
      approvalRequestId: 'approval_fixture',
      decision: 'approved',
      operatorId: 'operator.fixture',
      note: 'N'.repeat(NOTE_LIMIT + 1)
    })

    expect(result.success).toBe(false)
  })

  it('rejects an over-limit note before approvals.save and preserves pending state', async () => {
    const app = buildServer()
    const approvalId = await createPendingApproval(app)
    const save = vi.spyOn(app.persistence.approvals, 'save')
    const sentinel = 'N'.repeat(NOTE_LIMIT + 1)

    const response = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalId}/decision`,
      headers: {
        'x-operator-id': 'supervisor.fixture',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': TENANT_ID
      },
      payload: { decision: 'approved', note: sentinel }
    })
    const body = response.json() as Envelope<never>
    const persisted = await app.persistence.approvals.findById(
      approvalId,
      TENANT_ID
    )
    await app.close()

    expect(response.statusCode).toBe(400)
    expect(body).toMatchObject({
      success: false,
      error: { code: 'validation_failed' }
    })
    expect(body.error?.message).not.toContain(sentinel)
    expect(save).not.toHaveBeenCalled()
    expect(persisted?.status).toBe('pending')
  })

  it('accepts a note at the maximum and preserves the approval decision flow', async () => {
    const app = buildServer()
    const approvalId = await createPendingApproval(app)
    const note = 'N'.repeat(NOTE_LIMIT)

    const response = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${approvalId}/decision`,
      headers: {
        'x-operator-id': 'supervisor.fixture',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': TENANT_ID
      },
      payload: { decision: 'approved', note }
    })
    const body = response.json() as Envelope<{ status: string }>
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ status: 'approved' })
  })
})
