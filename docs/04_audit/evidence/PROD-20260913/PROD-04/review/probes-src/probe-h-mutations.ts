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

const h = await newSchema('h')
const pools: ReturnType<typeof h.makePool>[] = []
try {
  const pool = h.makePool(4)
  pools.push(pool)
  const authority = new PostgresApprovalAuthority(pool)

  // fail(no_effect) persists FAILED while retaining generation/history
  const failTenant = tenantId('critic_fail')
  const failHint = 'fail'
  const toFail = await createApproved(authority, failTenant, failHint)
  const fr = await authority.reserve(
    reserveInput(failTenant, failHint, toFail.approvalId, `rsv_${failHint}_1`)
  )
  const failed = await authority.fail({
    tenantId: failTenant,
    approvalId: toFail.approvalId,
    reservationId: fr.reservationId,
    evidence: {
      outcome: 'no_effect',
      source: 'adapter',
      evidenceRef: 'critic:fail'
    }
  })
  assert.equal(failed.status, 'FAILED')
  assert.equal(failed.reservationGeneration, 1)
  assert.deepEqual(failed.usedReservationIds, [fr.reservationId])
  assert.ok(failed.failedAt)
  // terminal: a second reserve must fail closed
  await assert.rejects(
    async () =>
      await authority.reserve(
        reserveInput(
          failTenant,
          failHint,
          toFail.approvalId,
          `rsv_${failHint}_2`
        )
      ),
    (error: { code?: string }) => error.code === 'invalid_state'
  )
  console.log(
    'fail(no_effect): FAILED persisted, generation/history retained, terminal enforced'
  )

  // verifyAndConsume persists EXECUTED and rejects the second consumption
  const consumeTenant = tenantId('critic_consume')
  const consumeHint = 'consume'
  const toConsume = await createApproved(authority, consumeTenant, consumeHint)
  const consumption = await authority.verifyAndConsume({
    tenantId: consumeTenant,
    approvalId: toConsume.approvalId,
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${consumeHint}` },
    payload: (await import('./lib.ts')).syntheticPayload(consumeHint),
    executionRef: 'exec_consume_1'
  })
  assert.equal(consumption.executionRef, 'exec_consume_1')
  const consumed = await authority.get(consumeTenant, toConsume.approvalId)
  assert.equal(consumed.status, 'EXECUTED')
  assert.equal(consumed.executionCount, 1)
  await assert.rejects(
    async () =>
      await authority.verifyAndConsume({
        tenantId: consumeTenant,
        approvalId: toConsume.approvalId,
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: `apt_${consumeHint}` },
        payload: (await import('./lib.ts')).syntheticPayload(consumeHint)
      }),
    (error: { code?: string }) => error.code === 'already_executed'
  )
  console.log(
    'verifyAndConsume: EXECUTED persisted, replay rejected already_executed'
  )

  // submit/reject/cancel durable paths
  const opTenant = tenantId('critic_decisions')
  const submitRec = await authority.request(
    (await import('./lib.ts')).requestInput(opTenant, 'submit')
  )
  const pending = await authority.submit(
    opTenant,
    submitRec.approvalId,
    'op_critic'
  )
  assert.equal(pending.status, 'PENDING')
  const rejected = await authority.reject(opTenant, submitRec.approvalId, {
    approverId: 'op_approver_critic',
    reason: 'critic rejection'
  })
  assert.equal(rejected.status, 'REJECTED')

  const cancelRec = await authority.request(
    (await import('./lib.ts')).requestInput(opTenant, 'cancel')
  )
  const cancelled = await authority.cancel(
    opTenant,
    cancelRec.approvalId,
    'op_critic'
  )
  assert.equal(cancelled.status, 'CANCELLED')
  console.log('submit/reject/cancel durable transitions persisted')

  await pool.end()
  pass('all remaining durable mutations persist through the engine with CAS')
} catch (error) {
  console.error(error)
  fail(`probe-h aborted: ${(error as Error).message}`)
} finally {
  await h.drop(...(pools as never[]))
}
