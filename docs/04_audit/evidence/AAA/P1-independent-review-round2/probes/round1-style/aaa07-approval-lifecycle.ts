// P1 falsification probe AAA-07: approval lifecycle (reserve/CAS/TTL sweep/
// fencing/terminal immutability/expiry/tenant) against the real engine.
import {
  ApprovalEngine,
  ApprovalError
} from '@cvg/approval-engine'
import { report, TENANT } from './harness.ts'

const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-0000000000ff'
const ACTION = 'appointment.cancel'
const RESOURCE = { type: 'appointment', id: 'apt_1' }
const PAYLOAD = { text: 'APPROVED_PAYLOAD' }

let nowMs = Date.parse('2026-09-12T12:00:00.000Z')
const clock = () => new Date(nowMs)

function request(engine: ApprovalEngine, overrides: Record<string, unknown> = {}) {
  return engine.request({
    tenantId: TENANT,
    operatorId: 'op_1',
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentVersion: 'v1',
    action: ACTION,
    resource: RESOURCE,
    payload: PAYLOAD,
    policyVersion: 'policy-v1',
    correlationId: 'corr_00000000-0000-4000-8000-000000000007',
    expiresInMs: 60_000,
    proposalId: 'prop_probe',
    proposalHash: 'a'.repeat(64),
    capability: ACTION,
    dataClassification: 'INTERNAL',
    proposalPayload: PAYLOAD,
    ...overrides
  })
}

function reserveInput(approvalId: string, overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    approvalId,
    action: ACTION,
    resource: RESOURCE,
    payload: PAYLOAD,
    proposalHash: 'a'.repeat(64),
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentVersion: 'v1',
    policyVersion: 'policy-v1',
    ttlMs: 1_000,
    ...overrides
  }
}

function throwsCode(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (error) {
    return error instanceof ApprovalError ? error.code : `non-approval:${String(error)}`
  }
}

async function main(): Promise<void> {
  const failures: string[] = []
  const expect = (label: string, actual: unknown, expected: unknown) => {
    if (actual !== expected) failures.push(`${label}: got ${String(actual)}, expected ${String(expected)}`)
  }

  const engine = new ApprovalEngine({ clock })
  const observed: Record<string, unknown> = {}

  // --- CAS / fencing generation ---
  const a1 = request(engine)
  engine.submit(TENANT, a1.approvalId, 'op_1')
  engine.approve(TENANT, a1.approvalId, { approverId: 'op_2' })
  const r1 = engine.reserve(reserveInput(a1.approvalId))
  observed.reserveStatus = engine.get(TENANT, a1.approvalId).status
  expect('reserve status', observed.reserveStatus, 'RESERVED')
  expect(
    'second reserve without token',
    throwsCode(() => engine.reserve(reserveInput(a1.approvalId))),
    'already_reserved'
  )
  expect(
    'markExecuting wrong token',
    throwsCode(() =>
      engine.markExecuting({ tenantId: TENANT, approvalId: a1.approvalId, reservationId: 'rsv_wrong' })
    ),
    'reservation_mismatch'
  )
  expect(
    'confirm wrong token',
    throwsCode(() =>
      engine.confirm({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: 'rsv_wrong',
        evidence: { outcome: 'effect_confirmed', executionRef: 'exec_x', evidenceRef: 'probe' }
      })
    ),
    'reservation_mismatch'
  )
  expect(
    'release wrong token',
    throwsCode(() =>
      engine.release({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: 'rsv_wrong',
        evidence: { outcome: 'no_effect', source: 'journal', evidenceRef: 'probe' }
      })
    ),
    'reservation_mismatch'
  )
  engine.markExecuting({ tenantId: TENANT, approvalId: a1.approvalId, reservationId: r1.reservationId })
  observed.executingStatus = engine.get(TENANT, a1.approvalId).status
  expect('markExecuting status', observed.executingStatus, 'EXECUTING')
  engine.release({
    tenantId: TENANT,
    approvalId: a1.approvalId,
    reservationId: r1.reservationId,
    evidence: { outcome: 'no_effect', source: 'journal', evidenceRef: 'probe:release' }
  })
  expect('release status', engine.get(TENANT, a1.approvalId).status, 'APPROVED')
  // After release the approval is APPROVED without reservation: an old token
  // is refused by state guard (fail closed); while a *new* generation is
  // active the same stale token must be refused by fencing.
  expect(
    'stale token after release',
    throwsCode(() =>
      engine.confirm({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: r1.reservationId,
        evidence: { outcome: 'effect_confirmed', executionRef: 'exec_stale', evidenceRef: 'probe' }
      })
    ),
    'invalid_state'
  )
  expect(
    'reservation token reuse',
    throwsCode(() =>
      engine.reserve(reserveInput(a1.approvalId, { reservationId: r1.reservationId }))
    ),
    'reservation_reused'
  )

  // --- terminal immutability ---
  const r1b = engine.reserve(reserveInput(a1.approvalId))
  engine.markExecuting({ tenantId: TENANT, approvalId: a1.approvalId, reservationId: r1b.reservationId })
  expect(
    'stale token during new generation',
    throwsCode(() =>
      engine.confirm({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: r1.reservationId,
        evidence: { outcome: 'effect_confirmed', executionRef: 'exec_stale', evidenceRef: 'probe' }
      })
    ),
    'reservation_mismatch'
  )
  engine.confirm({
    tenantId: TENANT,
    approvalId: a1.approvalId,
    reservationId: r1b.reservationId,
    evidence: { outcome: 'effect_confirmed', executionRef: 'exec_1', evidenceRef: 'probe:confirm' }
  })
  observed.executedStatus = engine.get(TENANT, a1.approvalId).status
  expect('confirm status', observed.executedStatus, 'EXECUTED')
  expect(
    'reserve after EXECUTED',
    throwsCode(() => engine.reserve(reserveInput(a1.approvalId))),
    'invalid_state'
  )
  expect(
    'release after EXECUTED',
    throwsCode(() =>
      engine.release({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: r1b.reservationId,
        evidence: { outcome: 'no_effect', source: 'journal', evidenceRef: 'probe' }
      })
    ),
    'invalid_state'
  )
  expect(
    'markUncertain after EXECUTED',
    throwsCode(() =>
      engine.markUncertain({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: r1b.reservationId,
        reason: 'probe'
      })
    ),
    'invalid_state'
  )
  expect(
    'reconcile after EXECUTED',
    throwsCode(() =>
      engine.reconcile({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        actorId: 'op_9',
        evidence: { outcome: 'no_effect', source: 'operator', evidenceRef: 'probe' }
      })
    ),
    'invalid_state'
  )
  const idemConfirm = engine.confirm({
    tenantId: TENANT,
    approvalId: a1.approvalId,
    reservationId: r1b.reservationId,
    evidence: { outcome: 'effect_confirmed', executionRef: 'exec_1', evidenceRef: 'probe:confirm' }
  })
  expect('idempotent confirm keeps EXECUTED', idemConfirm.status, 'EXECUTED')
  expect(
    'confirm different executionRef',
    throwsCode(() =>
      engine.confirm({
        tenantId: TENANT,
        approvalId: a1.approvalId,
        reservationId: r1b.reservationId,
        evidence: { outcome: 'effect_confirmed', executionRef: 'exec_other', evidenceRef: 'probe' }
      })
    ),
    'already_executed'
  )

  // --- TTL sweep: no_effect -> APPROVED; ambiguous -> UNCERTAIN; never effect ---
  const a2 = request(engine)
  engine.submit(TENANT, a2.approvalId, 'op_1')
  engine.approve(TENANT, a2.approvalId, { approverId: 'op_2' })
  engine.reserve(reserveInput(a2.approvalId))
  nowMs += 5_000
  const sweep1 = engine.releaseExpired({
    tenantId: TENANT,
    now: clock(),
    ttlMs: 1_000,
    evidenceFor: () => ({ outcome: 'no_effect', source: 'journal', evidenceRef: 'probe:sweep' })
  })
  observed.sweepReleased = sweep1
  expect('sweep released count', sweep1.released, 1)
  expect('sweep released status', engine.get(TENANT, a2.approvalId).status, 'APPROVED')

  const r2b = engine.reserve(reserveInput(a2.approvalId))
  nowMs += 5_000
  const sweep2 = engine.releaseExpired({
    tenantId: TENANT,
    now: clock(),
    ttlMs: 1_000,
    evidenceFor: () => undefined
  })
  observed.sweepUncertain = sweep2
  expect('sweep uncertain count', sweep2.uncertain, 1)
  expect('sweep uncertain status', engine.get(TENANT, a2.approvalId).status, 'UNCERTAIN')
  expect(
    'reserve UNCERTAIN',
    throwsCode(() => engine.reserve(reserveInput(a2.approvalId, { reservationId: r2b.reservationId }))),
    'uncertain'
  )
  const reconciled = engine.reconcile({
    tenantId: TENANT,
    approvalId: a2.approvalId,
    actorId: 'op_9',
    evidence: { outcome: 'no_effect', source: 'operator', evidenceRef: 'probe:reconcile' }
  })
  expect('reconcile no_effect -> FAILED', reconciled.status, 'FAILED')

  const a3 = request(engine)
  engine.submit(TENANT, a3.approvalId, 'op_1')
  engine.approve(TENANT, a3.approvalId, { approverId: 'op_2' })
  engine.reserve(reserveInput(a3.approvalId))
  nowMs += 5_000
  engine.releaseExpired({ tenantId: TENANT, now: clock(), ttlMs: 1_000, evidenceFor: () => undefined })
  const reconciled2 = engine.reconcile({
    tenantId: TENANT,
    approvalId: a3.approvalId,
    actorId: 'op_9',
    evidence: { outcome: 'effect_confirmed', executionRef: 'exec_recon', evidenceRef: 'probe:reconcile' }
  })
  expect('reconcile effect_confirmed -> EXECUTED', reconciled2.status, 'EXECUTED')

  // --- expiry and tenant isolation ---
  const a4 = request(engine, { expiresInMs: 1_000 })
  engine.submit(TENANT, a4.approvalId, 'op_1')
  nowMs += 5_000
  expect(
    'approve expired',
    throwsCode(() => engine.approve(TENANT, a4.approvalId, { approverId: 'op_2' })),
    'expired'
  )
  expect('expired status', engine.get(TENANT, a4.approvalId).status, 'EXPIRED')
  expect(
    'cross-tenant get',
    throwsCode(() => engine.get(OTHER_TENANT, a4.approvalId)),
    'not_found'
  )
  expect(
    'cross-tenant reserve',
    throwsCode(() => engine.reserve(reserveInput(a4.approvalId, { tenantId: OTHER_TENANT }))),
    'not_found'
  )

  // --- self approval ---
  const a5 = request(engine)
  engine.submit(TENANT, a5.approvalId, 'op_1')
  expect(
    'self approval',
    throwsCode(() => engine.approve(TENANT, a5.approvalId, { approverId: 'op_1' })),
    'self_approval_denied'
  )

  report('AAA07-approval-lifecycle', { observed, failures })
  console.log(JSON.stringify({ probe: 'AAA-07', falsified: failures.length > 0, failures }))
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
