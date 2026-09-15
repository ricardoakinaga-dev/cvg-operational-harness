/**
 * PROD-04 negative-first probe (RED, before durable wiring).
 *
 * The canonical runtime currently persists approvals only in
 * InMemoryApprovalStore. The invariant under test is "an approved reservation
 * survives a process restart"; a fresh engine over a fresh in-memory store
 * cannot see the previous process state.
 */
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'

const tenant = 'tenant_00000000-0000-4000-8000-000000000a02'
const payload = { draftId: 'draft_synthetic_1', note: 'synthetic only' }

function newEngine(): ApprovalEngine {
  return new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock: () => new Date('2026-09-13T12:00:00.000Z'),
    idFactory: () => 'appr_restart_red_0001'
  })
}

async function main(): Promise<void> {
  const before = newEngine()
  const record = before.request({
    tenantId: tenant,
    operatorId: 'op_1',
    agentId: 'agent_x',
    agentVersion: '1',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: 'apt_synthetic_1' },
    payload,
    policyVersion: 'pv1',
    correlationId: 'corr:restart:red',
    proposalHash: 'b'.repeat(64),
    proposalPayload: payload
  })
  before.submit(tenant, record.approvalId, 'op_1')
  before.approve(tenant, record.approvalId, { approverId: 'op_2' })
  const reservation = before.reserve({
    tenantId: tenant,
    approvalId: record.approvalId,
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: 'apt_synthetic_1' },
    payload,
    proposalHash: 'b'.repeat(64)
  })
  console.log(
    `before restart: status=${before.get(tenant, record.approvalId).status} reservation=${reservation.reservationId} generation=${reservation.generation}`
  )

  const after = newEngine()
  try {
    const persisted = after.get(tenant, record.approvalId)
    console.log(
      `GREEN: record survived restart with status=${persisted.status} reservation=${persisted.reservationId}`
    )
  } catch (error) {
    console.error(
      `RED: a fresh process cannot see approval ${record.approvalId} after restart; only in-memory state existed (${error instanceof Error ? error.message : 'unknown error'})`
    )
    process.exitCode = 1
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
