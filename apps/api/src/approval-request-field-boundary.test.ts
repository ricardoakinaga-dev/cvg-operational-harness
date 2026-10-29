import { RequestHumanApprovalSchema } from '@cvg/shared'
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from './server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

const TENANT_ID = 'tenant_00000000-0000-4000-8000-000000000092' as const

const LIMITS = {
  sessionId: 160,
  proposedAction: 200,
  summary: 4000
} as const

type ApprovalField = keyof typeof LIMITS

function buildApprovalPayload(sessionId: string) {
  return {
    sessionId,
    proposedAction: 'create_appointment_draft',
    summary: 'Approval controlada',
    riskLevel: 'medium' as const
  }
}

async function createFixtureSession(app: ReturnType<typeof buildServer>) {
  const created = await app.persistence.conversations.createWithSession({
    tenantId: TENANT_ID,
    channel: 'internal',
    senderRef: 'fixture-approval-boundary',
    externalMessageId: `approval-boundary-${crypto.randomUUID()}`,
    body: 'fixture controlada'
  })
  return created.session.id
}

describe('approval request field boundary', () => {
  it('rejects every over-limit field at the shared schema boundary', () => {
    const base = buildApprovalPayload('sess_fixture')

    for (const field of Object.keys(LIMITS) as ApprovalField[]) {
      const result = RequestHumanApprovalSchema.safeParse({
        ...base,
        [field]: 'x'.repeat(LIMITS[field] + 1)
      })

      expect(result.success, `${field} should be bounded`).toBe(false)
    }
  })

  it.each(Object.entries(LIMITS) as Array<[ApprovalField, number]>)(
    'rejects over-limit %s before approvals.save',
    async (field, limit) => {
      const app = buildServer()
      const sessionId = await createFixtureSession(app)
      const save = vi.spyOn(app.persistence.approvals, 'save')
      const payload = {
        ...buildApprovalPayload(sessionId),
        [field]: 'x'.repeat(limit + 1)
      }

      const response = await app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: {
          'x-tenant-id': TENANT_ID,
          'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
        },
        payload
      })
      const body = response.json() as Envelope<never>
      await app.close()

      expect(response.statusCode).toBe(400)
      expect(body).toMatchObject({
        success: false,
        error: { code: 'validation_failed' }
      })
      expect(save).not.toHaveBeenCalled()
      expect(body.error?.message).not.toContain('x'.repeat(limit + 1))
    }
  )

  it('accepts values at the configured maxima and preserves approval pending', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(app)
    const payload = {
      ...buildApprovalPayload(sessionId),
      proposedAction: 'P'.repeat(LIMITS.proposedAction),
      summary: 'S'.repeat(LIMITS.summary)
    }

    const response = await app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        'x-tenant-id': TENANT_ID,
        'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
      },
      payload
    })
    const body = response.json() as Envelope<{
      status: string
      proposedAction: string
      summary: string
    }>
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({
      status: 'pending',
      proposedAction: payload.proposedAction,
      summary: payload.summary
    })
  })
})
