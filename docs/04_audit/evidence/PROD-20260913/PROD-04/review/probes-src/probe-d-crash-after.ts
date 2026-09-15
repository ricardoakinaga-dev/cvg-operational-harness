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

const h = await newSchema('d')
try {
  // --- missing evidence: crash after markExecuting -> UNCERTAIN, never expires
  const tenantMissing = tenantId('critic_crash_after_missing')
  const hintMissing = 'crash_after_missing'
  const pool1 = h.makePool(2)
  const a1 = new PostgresApprovalAuthority(pool1)
  const missing = await createApproved(a1, tenantMissing, hintMissing)
  const missingReservation = await a1.reserve(
    reserveInput(tenantMissing, hintMissing, missing.approvalId, `rsv_${hintMissing}_1`, {
      ttlMs: 1_000
    })
  )
  await a1.markExecuting({
    tenantId: tenantMissing,
    approvalId: missing.approvalId,
    reservationId: missingReservation.reservationId
  })
  await pool1.end()

  const pool2 = h.makePool(2)
  const a2 = new PostgresApprovalAuthority(pool2)
  const now = new Date(Date.parse(missingReservation.reservationExpiresAt) + 1_000)
  const firstSweep = await a2.releaseExpired({
    tenantId: tenantMissing,
    now,
    evidenceFor: () => undefined
  })
  assert.deepEqual(firstSweep, { released: 0, uncertain: 1 })

  const revisionBefore = await pool2.query<{ revision: string }>(
    `SELECT revision::text FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
    [tenantMissing, missing.approvalId]
  )
  const first = await a2.get(tenantMissing, missing.approvalId)
  assert.equal(first.status, 'UNCERTAIN')
  assert.equal(first.reservationId, missingReservation.reservationId)
  assert.equal(first.reservationGeneration, 1)
  assert.deepEqual(first.usedReservationIds, [missingReservation.reservationId])
  assert.ok(first.uncertainAt)
  assert.ok(first.decisionReason)

  const secondSweep = await a2.releaseExpired({
    tenantId: tenantMissing,
    now: new Date(now.getTime() + 120_000),
    evidenceFor: () => undefined
  })
  assert.deepEqual(secondSweep, { released: 0, uncertain: 0 })
  const second = await a2.get(tenantMissing, missing.approvalId)
  assert.equal(second.status, 'UNCERTAIN')
  const revisionAfter = await pool2.query<{ revision: string }>(
    `SELECT revision::text FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
    [tenantMissing, missing.approvalId]
  )
  assert.equal(
    revisionAfter.rows[0]?.revision,
    revisionBefore.rows[0]?.revision,
    'a second sweep must not mutate an UNCERTAIN row (revision unchanged)'
  )
  console.log(
    `crash-after-effect(missing): UNCERTAIN preserved across 2 sweeps (revision ${revisionAfter.rows[0]?.revision})`
  )

  // --- effect_possibly_started -> UNCERTAIN as well
  const tenantPossibly = tenantId('critic_crash_after_possibly')
  const hintPossibly = 'crash_after_possibly'
  const possible = await createApproved(a2, tenantPossibly, hintPossibly)
  const possibleReservation = await a2.reserve(
    reserveInput(
      tenantPossibly,
      hintPossibly,
      possible.approvalId,
      `rsv_${hintPossibly}_1`,
      { ttlMs: 1_000 }
    )
  )
  await a2.markExecuting({
    tenantId: tenantPossibly,
    approvalId: possible.approvalId,
    reservationId: possibleReservation.reservationId
  })
  const possibleSweep = await a2.releaseExpired({
    tenantId: tenantPossibly,
    now: new Date(Date.parse(possibleReservation.reservationExpiresAt) + 1_000),
    evidenceFor: () => ({
      outcome: 'effect_possibly_started',
      evidenceRef: `critic:${hintPossibly}:started`
    })
  })
  assert.deepEqual(possibleSweep, { released: 0, uncertain: 1 })
  const possibleNow = await a2.get(tenantPossibly, possible.approvalId)
  assert.equal(possibleNow.status, 'UNCERTAIN')
  const possibleSecond = await a2.releaseExpired({
    tenantId: tenantPossibly,
    now: new Date(Date.now() + 10 * 60_000),
    evidenceFor: () => ({
      outcome: 'effect_possibly_started',
      evidenceRef: 'critic:still-started'
    })
  })
  assert.deepEqual(possibleSecond, { released: 0, uncertain: 0 })
  assert.equal(
    (await a2.get(tenantPossibly, possible.approvalId)).status,
    'UNCERTAIN'
  )
  console.log('crash-after-effect(possibly_started): UNCERTAIN, no auto-expiry')

  // --- explicit reconciliation closes with effect_confirmed -> EXECUTED
  const reconciled = await a2.reconcile({
    tenantId: tenantMissing,
    approvalId: missing.approvalId,
    actorId: 'op_critic_reconciler',
    evidence: {
      outcome: 'effect_confirmed',
      executionRef: `exec_${hintMissing}`,
      evidenceRef: `critic:${hintMissing}:confirmed`
    }
  })
  assert.equal(reconciled.status, 'EXECUTED')
  assert.equal(reconciled.executionRef, `exec_${hintMissing}`)
  assert.equal(reconciled.executionCount, 1)
  assert.ok(reconciled.confirmedAt)
  assert.equal(reconciled.reservationGeneration, 1)
  assert.deepEqual(reconciled.usedReservationIds, [missingReservation.reservationId])
  console.log('reconcile(effect_confirmed): EXECUTED with executionRef and count=1')

  await pool2.end()
  pass('crash-after-effect keeps UNCERTAIN until explicit reconciliation')
} catch (error) {
  console.error(error)
  fail(`probe-d aborted: ${(error as Error).message}`)
} finally {
  await h.drop()
}
