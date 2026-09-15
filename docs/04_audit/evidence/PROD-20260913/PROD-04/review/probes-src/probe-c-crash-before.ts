import { strict as assert } from 'node:assert'
import {
  createApproved,
  fail,
  newSchema,
  pass,
  reserveInput,
  tenantId
} from './lib.ts'
import { PostgresApprovalAuthority } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts'

const h = await newSchema('c')
try {
  const tenant = tenantId('critic_crash_before')
  const hint = 'crash_before'
  const pool1 = h.makePool(2)
  const a1 = new PostgresApprovalAuthority(pool1)
  const record = await createApproved(a1, tenant, hint)
  const reservation = await a1.reserve(
    reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_1`, { ttlMs: 1_000 })
  )
  assert.equal(reservation.generation, 1)
  // Simulated crash/restart: adapter and pool are discarded.
  await pool1.end()

  const pool2 = h.makePool(2)
  const a2 = new PostgresApprovalAuthority(pool2)
  const now = new Date(Date.parse(reservation.reservationExpiresAt) + 1_000)
  const sweep = await a2.releaseExpired({
    tenantId: tenant,
    now,
    evidenceFor: (candidate) =>
      candidate.approvalId === record.approvalId
        ? {
            outcome: 'no_effect',
            source: 'journal',
            evidenceRef: `critic:${hint}:absent`
          }
        : undefined
  })
  assert.deepEqual(sweep, { released: 1, uncertain: 0 })

  const persisted = await a2.get(tenant, record.approvalId)
  assert.equal(persisted.status, 'APPROVED')
  assert.equal(persisted.reservationId, undefined)
  assert.equal(persisted.reservationOwner, undefined)
  assert.equal(persisted.reservationExpiresAt, undefined)
  assert.equal(persisted.reservationGeneration, 1, 'generation must be retained')
  assert.deepEqual(
    persisted.usedReservationIds,
    [reservation.reservationId],
    'history must be retained'
  )
  assert.ok(persisted.releasedAt, 'releasedAt must be set')
  assert.equal(persisted.approvalId, record.approvalId)
  assert.equal(persisted.proposalHash, reservation.proposalHash)

  const sql = await pool2.query<{
    reservation_id: string | null
    reservation_generation: string
    used_reservation_ids: string[]
  }>(
    `SELECT reservation_id, reservation_generation::text, used_reservation_ids
     FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
    [tenant, record.approvalId]
  )
  assert.equal(sql.rows[0]?.reservation_id, null)
  assert.equal(sql.rows[0]?.reservation_generation, '1')
  assert.deepEqual(sql.rows[0]?.used_reservation_ids, [reservation.reservationId])
  console.log(
    `crash-before-effect: released=${sweep.released} status=${persisted.status} gen=${persisted.reservationGeneration} used=${persisted.usedReservationIds?.length}`
  )
  await pool2.end()
  pass('crash-before-effect releases to APPROVED with generation/history retained')
} catch (error) {
  console.error(error)
  fail(`probe-c aborted: ${(error as Error).message}`)
} finally {
  await h.drop()
}
