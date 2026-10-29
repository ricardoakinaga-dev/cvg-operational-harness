import { describe, expect, it, vi } from 'vitest'
import { AuditRepository } from '@cvg/persistence'
import { buildServer } from '../server.ts'
import { grantCase } from './case-authorization-fixtures.ts'
const tenant = 'tenant_00000000-0000-4000-8000-000000000093'
const headers = {
  'x-tenant-id': tenant,
  'x-operator-id': 'synthetic.approver',
  'x-operator-role': 'Approver'
}
async function setup() {
  const app = buildServer()
  const { conversation, session } =
    await app.persistence.conversations.createWithSession({
      tenantId: tenant,
      channel: 'internal',
      senderRef: 'synthetic-attendance',
      externalMessageId: crypto.randomUUID(),
      body: 'Synthetic fixture'
    })
  // SPEC0251: the Approver decides only on an assigned case.
  await grantCase(app, {
    kind: 'core_conversation',
    resourceId: conversation.id,
    operatorId: headers['x-operator-id'],
    role: 'Approver',
    tenantId: tenant as never
  })
  const response = await app.inject({
    method: 'POST',
    url: '/v1/approvals',
    headers: {
      ...headers,
      'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
    },
    payload: {
      sessionId: session.id,
      proposedAction: 'synthetic_review',
      summary: 'Synthetic only',
      riskLevel: 'low'
    }
  })
  expect(response.statusCode).toBe(200)
  return { app, id: response.json().data.id as string, sessionId: session.id }
}
describe('attendance approval HTTP atomic contract', () => {
  it('returns one winner and one safe 409; server identity wins and audit is singular', async () => {
    const { app, id, sessionId } = await setup()
    try {
      const results = await Promise.all(
        ['approved', 'rejected'].map((decision) =>
          app.inject({
            method: 'POST',
            url: `/v1/approvals/${id}/decision`,
            headers,
            payload: {
              decision,
              operatorId: 'forged',
              role: 'Admin',
              correlationId: 'forged'
            }
          })
        )
      )
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409])
      const winner = results.find((r) => r.statusCode === 200)!.json().data
      const loser = results.find((r) => r.statusCode === 409)!.json()
      expect(winner.decidedBy).toBe('synthetic.approver')
      expect(loser.error.code).toBe('conflict')
      expect(JSON.stringify(loser)).not.toContain('synthetic.approver')
      const audit = await app.persistence.audit.listBySession(sessionId, tenant)
      expect(
        audit.filter(
          (event) =>
            typeof event.payload === 'object' &&
            event.payload &&
            'effect' in event.payload
        )
      ).toHaveLength(1)
      expect(
        await app.persistence.approvals.findById(id, tenant)
      ).toMatchObject({ status: winner.status, decidedBy: winner.decidedBy })
    } finally {
      await app.close()
    }
  })
  it('keeps missing and cross-tenant responses indistinguishable and rolls back audit failures', async () => {
    const { app, id } = await setup()
    try {
      const request = (target: string, scope = tenant) =>
        app.inject({
          method: 'POST',
          url: `/v1/approvals/${target}/decision`,
          headers: { ...headers, 'x-tenant-id': scope },
          payload: { decision: 'assumed' }
        })
      const missing = await request('approval_missing')
      const cross = await request(
        id,
        'tenant_00000000-0000-4000-8000-000000000094'
      )
      expect(cross.statusCode).toBe(missing.statusCode)
      expect(cross.json().error).toEqual(missing.json().error)
      const spy = vi
        .spyOn(AuditRepository.prototype, 'append')
        .mockImplementationOnce(() => {
          throw new Error('synthetic-audit-failure')
        })
      try {
        const failed = await request(id)
        expect(failed.statusCode).toBe(500)
        expect(failed.body).not.toContain('synthetic-audit-failure')
      } finally {
        spy.mockRestore()
      }
      expect(
        await app.persistence.approvals.findById(id, tenant)
      ).toMatchObject({ status: 'pending', decidedBy: null, decidedAt: null })
    } finally {
      await app.close()
    }
  })
  it.each([
    null,
    {},
    { decision: 'pending' },
    { decision: 'approved', note: 'N'.repeat(4001) }
  ])('rejects malformed decisions before mutation', async (payload) => {
    const { app, id } = await setup()
    try {
      const response = await app.inject({
        method: 'POST',
        url: `/v1/approvals/${id}/decision`,
        headers: { ...headers, 'content-type': 'application/json' },
        payload: JSON.stringify(payload)
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('validation_failed')
      expect(
        await app.persistence.approvals.findById(id, tenant)
      ).toMatchObject({ status: 'pending', decidedBy: null })
    } finally {
      await app.close()
    }
  })
})
