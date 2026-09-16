import { strict as assert } from 'node:assert'
import type { ApprovalError } from '@cvg/approval-engine'
import {
  createApproved,
  fail,
  newSchema,
  pass,
  reserveInput,
  tenantId
} from './lib.ts'
import { PostgresApprovalAuthority } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts'

const h = await newSchema('b')
const pools: ReturnType<typeof h.makePool>[] = []
try {
  const tenant = tenantId('critic_fence')
  const hint = 'fence'
  const pool = h.makePool(4)
  pools.push(pool)
  const authority = new PostgresApprovalAuthority(pool)
  const record = await createApproved(authority, tenant, hint)

  const g1 = await authority.reserve(
    reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_g1`)
  )
  assert.equal(g1.generation, 1)
  await authority.release({
    tenantId: tenant,
    approvalId: record.approvalId,
    reservationId: g1.reservationId,
    evidence: {
      outcome: 'no_effect',
      source: 'adapter',
      evidenceRef: 'critic:g1'
    }
  })
  const afterRelease = await authority.get(tenant, record.approvalId)
  assert.equal(afterRelease.status, 'APPROVED')
  assert.equal(afterRelease.reservationId, undefined)
  assert.equal(afterRelease.reservationGeneration, 1)
  assert.deepEqual(afterRelease.usedReservationIds, [g1.reservationId])

  const g2 = await authority.reserve(
    reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_g2`)
  )
  assert.equal(g2.generation, 2)
  assert.deepEqual(g2.reservationId, `rsv_${hint}_g2`)

  const staleOps: Array<[string, () => Promise<unknown>]> = [
    [
      'confirm-g1',
      () =>
        authority.confirm({
          tenantId: tenant,
          approvalId: record.approvalId,
          reservationId: g1.reservationId,
          evidence: {
            outcome: 'effect_confirmed',
            executionRef: 'exec_stale',
            evidenceRef: 'critic:stale-confirm'
          }
        })
    ],
    [
      'release-g1',
      () =>
        authority.release({
          tenantId: tenant,
          approvalId: record.approvalId,
          reservationId: g1.reservationId,
          evidence: {
            outcome: 'no_effect',
            source: 'adapter',
            evidenceRef: 'critic:stale-release'
          }
        })
    ],
    [
      'uncertain-g1',
      () =>
        authority.markUncertain({
          tenantId: tenant,
          approvalId: record.approvalId,
          reservationId: g1.reservationId,
          reason: 'stale generation attempt'
        })
    ],
    [
      'executing-g1',
      () =>
        authority.markExecuting({
          tenantId: tenant,
          approvalId: record.approvalId,
          reservationId: g1.reservationId
        })
    ]
  ]
  for (const [label, op] of staleOps) {
    let rejected: ApprovalError | undefined
    try {
      await op()
    } catch (error) {
      rejected = error as ApprovalError
    }
    assert.ok(rejected, `${label}: stale g1 operation must be rejected`)
    assert.equal(rejected?.code, 'reservation_mismatch', `${label}: code`)
    const now = await authority.get(tenant, record.approvalId)
    assert.equal(now.status, 'RESERVED', `${label}: status mutated`)
    assert.equal(
      now.reservationId,
      g2.reservationId,
      `${label}: reservation mutated`
    )
    assert.equal(now.reservationGeneration, 2, `${label}: generation mutated`)
    assert.deepEqual(
      now.usedReservationIds,
      [g1.reservationId, g2.reservationId],
      `${label}: history mutated`
    )
    console.log(`${label}: rejected with ${rejected?.code}; g2 state intact`)
  }

  // Concurrent confirm vs release on the same live generation: exactly one wins.
  const c1 = h.makePool(1)
  const c2 = h.makePool(1)
  pools.push(c1, c2)
  const ca1 = new PostgresApprovalAuthority(c1)
  const ca2 = new PostgresApprovalAuthority(c2)
  const raced = await Promise.allSettled([
    ca1.confirm({
      tenantId: tenant,
      approvalId: record.approvalId,
      reservationId: g2.reservationId,
      evidence: {
        outcome: 'effect_confirmed',
        executionRef: 'exec_g2_race',
        evidenceRef: 'critic:race-confirm'
      }
    }),
    ca2.release({
      tenantId: tenant,
      approvalId: record.approvalId,
      reservationId: g2.reservationId,
      evidence: {
        outcome: 'no_effect',
        source: 'adapter',
        evidenceRef: 'critic:race-release'
      }
    })
  ])
  const wins = raced.filter((r) => r.status === 'fulfilled')
  const losses = raced.filter(
    (r) => r.status === 'rejected'
  ) as PromiseRejectedResult[]
  assert.equal(
    wins.length,
    1,
    `confirm/release race: expected 1 winner, got ${wins.length}`
  )
  assert.equal(losses.length, 1)
  const final = await authority.get(tenant, record.approvalId)
  assert.ok(
    final.status === 'EXECUTED' || final.status === 'APPROVED',
    `confirm/release race: unexpected final status ${final.status}`
  )
  if (final.status === 'EXECUTED') {
    assert.equal(final.executionRef, 'exec_g2_race')
    assert.equal(final.reservationGeneration, 2)
    assert.deepEqual(final.usedReservationIds, [
      g1.reservationId,
      g2.reservationId
    ])
  } else {
    assert.equal(final.reservationId, undefined)
    assert.equal(final.reservationGeneration, 2)
    assert.deepEqual(final.usedReservationIds, [
      g1.reservationId,
      g2.reservationId
    ])
  }
  console.log(
    `confirm/release race: winner final=${final.status} loser=${(losses[0]?.reason as ApprovalError)?.code} generation retained=${final.reservationGeneration}`
  )
  pass(
    'generation fencing: all stale g1 ops rejected; g2 confirmed/released atomically'
  )
} catch (error) {
  console.error(error)
  fail(`probe-b aborted: ${(error as Error).message}`)
} finally {
  await h.drop(...pools)
}
