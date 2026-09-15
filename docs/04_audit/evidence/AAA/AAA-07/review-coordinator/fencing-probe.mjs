import { ApprovalEngine } from '../../../../../../packages/approval-engine/src/engine.ts'
import assert from 'node:assert/strict'
const tenantId = 'tenant_00000000-0000-4000-8000-000000000001'
const binding = {
  tenantId,
  action: 'appointment.cancel',
  resource: { type: 'appointment', id: 'synthetic' },
  payload: { synthetic: true },
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  policyVersion: 'v1'
}
const evidence = {
  outcome: 'no_effect',
  source: 'journal',
  evidenceRef: 'synthetic:old-reservation'
}
function setup() {
  let now = new Date('2026-09-12T12:00:00Z')
  const engine = new ApprovalEngine({ clock: () => now })
  const r = engine.request({
    ...binding,
    operatorId: 'requester',
    correlationId: 'corr_00000000-0000-4000-8000-000000000001'
  })
  engine.submit(tenantId, r.approvalId, 'requester')
  engine.approve(tenantId, r.approvalId, { approverId: 'reviewer' })
  const reserve = (reservationId) =>
    engine.reserve({
      ...binding,
      approvalId: r.approvalId,
      reservationId,
      ttlMs: 1000
    })
  reserve('old-token')
  return {
    engine,
    reserve,
    approvalId: r.approvalId,
    expire: () => {
      now = new Date(now.getTime() + 1001)
    }
  }
}
const results = []
for (const ambiguous of [false, true]) {
  const { engine, reserve, approvalId, expire } = setup()
  expire()
  const counters = engine.releaseExpired({
    tenantId,
    evidenceFor: () => {
      engine.release({
        tenantId,
        approvalId,
        reservationId: 'old-token',
        evidence
      })
      reserve('new-token')
      return ambiguous
        ? { outcome: 'unknown', reason: 'old snapshot unknown' }
        : evidence
    }
  })
  const current = engine.get(tenantId, approvalId)
  results.push({
    case: ambiguous ? 'stale-sweep-uncertain' : 'stale-sweep-release',
    counters,
    status: current.status,
    reservationId: current.reservationId ?? null
  })
  assert.equal(
    current.status,
    ambiguous ? 'UNCERTAIN' : 'APPROVED',
    'Counterexample changed: inspect fencing'
  )
}
{
  const { engine, reserve, approvalId } = setup()
  engine.release({ tenantId, approvalId, reservationId: 'old-token', evidence })
  reserve('old-token')
  const current = engine.markExecuting({
    tenantId,
    approvalId,
    reservationId: 'old-token'
  })
  results.push({
    case: 'reused-token',
    status: current.status,
    reservationId: current.reservationId
  })
  assert.equal(current.status, 'EXECUTING')
}
console.log(
  JSON.stringify({ syntheticOnly: true, effectsExecuted: 0, results }, null, 2)
)
