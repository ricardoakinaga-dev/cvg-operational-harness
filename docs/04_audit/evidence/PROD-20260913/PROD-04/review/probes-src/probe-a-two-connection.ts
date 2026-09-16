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

const h = await newSchema('a')
try {
  for (let i = 0; i < 5; i++) {
    const tenant = tenantId(`critic_race_${i}`)
    const hint = `race_${i}`
    const main = h.makePool(4)
    const p1 = h.makePool(1)
    const p2 = h.makePool(1)
    try {
      const seed = new (
        await import('/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts')
      ).PostgresApprovalAuthority(main)
      const record = await createApproved(seed, tenant, hint)

      const { PostgresApprovalAuthority } =
        await import('/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts')
      const a1 = new PostgresApprovalAuthority(p1)
      const a2 = new PostgresApprovalAuthority(p2)

      const settled = await Promise.allSettled([
        a1.reserve(
          reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_1`)
        ),
        a2.reserve(
          reserveInput(tenant, hint, record.approvalId, `rsv_${hint}_2`)
        )
      ])
      const fulfilled = settled.filter((r) => r.status === 'fulfilled')
      const rejected = settled.filter(
        (r) => r.status === 'rejected'
      ) as PromiseRejectedResult[]
      assert.equal(
        fulfilled.length,
        1,
        `iteration ${i}: expected exactly one winner, got ${fulfilled.length}`
      )
      assert.equal(rejected.length, 1, `iteration ${i}: expected one loser`)
      const loser = rejected[0]?.reason as ApprovalError
      assert.equal(
        loser?.code,
        'already_reserved',
        `iteration ${i}: loser code ${loser?.code}`
      )

      const winner = (
        fulfilled[0] as PromiseFulfilledResult<{ reservationId: string }>
      ).value
      const persisted = await seed.get(tenant, record.approvalId)
      assert.equal(persisted.status, 'RESERVED')
      assert.equal(persisted.reservationGeneration, 1)
      assert.equal(persisted.reservationId, winner.reservationId)
      assert.equal(persisted.usedReservationIds?.length, 1)
      assert.deepEqual(persisted.usedReservationIds, [winner.reservationId])
      console.log(
        `iteration ${i}: winner=${winner.reservationId} loser=${loser.code} gen=${persisted.reservationGeneration} used=${persisted.usedReservationIds?.length}`
      )
    } finally {
      await main.end().catch(() => undefined)
      await p1.end().catch(() => undefined)
      await p2.end().catch(() => undefined)
    }
  }
  pass('two-connection reserve: exactly one winner in 5/5 iterations')
} catch (error) {
  console.error(error)
  fail(`probe-a aborted: ${(error as Error).message}`)
} finally {
  await h.drop()
}
