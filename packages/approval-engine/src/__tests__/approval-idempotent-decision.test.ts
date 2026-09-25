/**
 * AUD19-003 — idempotent approval decisions (RED→GREEN characterization).
 *
 * Desired: repeating an identical approve/reject on an already-decided
 * approval is a no-op success (retry convergence); any divergent repeat
 * fails closed without mutating the winner.
 */
import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError } from '../engine.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-20T12:00:00.000Z')

const BINDING = {
  tenantId: TENANT,
  action: 'appointment.cancel',
  resource: { type: 'appointment', id: 'apt_1' },
  payload: { appointmentId: 'apt_1', reason: 'patient request' },
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  policyVersion: 'policy_v1',
  correlationId: 'corr_00000000-0000-4000-8000-000000000009'
}

function buildEngine() {
  let counter = 0
  return new ApprovalEngine({
    clock: () => NOW,
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000
  })
}

function pendingApproval() {
  const engine = buildEngine()
  const requested = engine.request({
    ...BINDING,
    tenantId: TENANT,
    operatorId: 'op_requester'
  })
  const pending = engine.submit(TENANT, requested.approvalId, 'op_requester')
  return { engine, approvalId: pending.approvalId }
}

describe('idempotent approval decisions (AUD19-003)', () => {
  it('repeating an identical approve is a no-op success', () => {
    const { engine, approvalId } = pendingApproval()
    const first = engine.approve(TENANT, approvalId, {
      approverId: 'op_approver',
      reason: 'synthetic ok'
    })
    expect(first.status).toBe('APPROVED')
    const second = engine.approve(TENANT, approvalId, {
      approverId: 'op_approver',
      reason: 'synthetic ok'
    })
    expect(second.status).toBe('APPROVED')
    expect(second.approverId).toBe('op_approver')
    expect(second.approvedAt).toBe(first.approvedAt)
  })

  it('repeating approve with a different approver fails closed', () => {
    const { engine, approvalId } = pendingApproval()
    engine.approve(TENANT, approvalId, { approverId: 'op_approver' })
    expect(() =>
      engine.approve(TENANT, approvalId, { approverId: 'op_other' })
    ).toThrowError(ApprovalError)
    expect(engine.get(TENANT, approvalId).approverId).toBe('op_approver')
  })

  it('approve after reject fails closed without mutating the rejection', () => {
    const { engine, approvalId } = pendingApproval()
    engine.reject(TENANT, approvalId, { approverId: 'op_approver' })
    expect(() =>
      engine.approve(TENANT, approvalId, { approverId: 'op_approver' })
    ).toThrowError(ApprovalError)
    expect(engine.get(TENANT, approvalId).status).toBe('REJECTED')
  })

  it('repeating an identical reject is a no-op success', () => {
    const { engine, approvalId } = pendingApproval()
    const first = engine.reject(TENANT, approvalId, {
      approverId: 'op_approver'
    })
    expect(first.status).toBe('REJECTED')
    const second = engine.reject(TENANT, approvalId, {
      approverId: 'op_approver'
    })
    expect(second.status).toBe('REJECTED')
    expect(second.rejectedAt).toBe(first.rejectedAt)
  })
})
