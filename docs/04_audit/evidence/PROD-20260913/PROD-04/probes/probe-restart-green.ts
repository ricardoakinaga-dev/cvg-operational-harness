/**
 * PROD-04 positive probe (GREEN, after durable wiring).
 *
 * The same request->submit->approve->reserve sequence as the RED probe is now
 * served by PostgresApprovalAuthority. After dropping the first adapter and
 * its pool, a second adapter on the same database must return the identical
 * proposal hash, reservation token, generation and expiry.
 */
import { randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import {
  PostgresApprovalAuthority,
  runPostgresMigrations
} from '@cvg/persistence'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required')

const tenant = 'tenant_00000000-0000-4000-8000-000000000b02'
const payload = { draftId: 'draft_green_restart', note: 'synthetic only' }
const proposalHash = 'e'.repeat(64)

async function main(): Promise<void> {
  const schema = `prod04_probe_${Date.now()}_${randomUUID().slice(0, 6)}`
  const admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const poolA = new Pool({
    connectionString: databaseUrl,
    max: 2,
    options: `-c search_path=${schema}`
  })
  let poolB: Pool | undefined
  try {
    await runPostgresMigrations(admin, { schemaName: schema })
    const authorityA = new PostgresApprovalAuthority(poolA)
    const record = await authorityA.request({
      tenantId: tenant,
      operatorId: 'op_1',
      agentId: 'agent_x',
      agentVersion: '1',
      action: 'appointment.confirm',
      resource: { type: 'appointment', id: 'apt_green_restart' },
      payload,
      policyVersion: 'pv1',
      correlationId: 'corr:restart:green',
      proposalHash,
      proposalPayload: payload
    })
    await authorityA.submit(tenant, record.approvalId, 'op_1')
    await authorityA.approve(tenant, record.approvalId, {
      approverId: 'op_2'
    })
    const reservation = await authorityA.reserve({
      tenantId: tenant,
      approvalId: record.approvalId,
      action: 'appointment.confirm',
      resource: { type: 'appointment', id: 'apt_green_restart' },
      payload,
      proposalHash
    })
    const before = await authorityA.get(tenant, record.approvalId)
    console.log(
      `before restart: status=${before.status} reservation=${before.reservationId} generation=${before.reservationGeneration} expires=${before.reservationExpiresAt}`
    )

    await poolA.end()
    poolB = new Pool({
      connectionString: databaseUrl,
      max: 2,
      options: `-c search_path=${schema}`
    })
    const authorityB = new PostgresApprovalAuthority(poolB)
    const after = await authorityB.get(tenant, record.approvalId)
    console.log(
      `after restart: status=${after.status} reservation=${after.reservationId} generation=${after.reservationGeneration} expires=${after.reservationExpiresAt}`
    )

    if (
      after.status !== 'RESERVED' ||
      after.proposalHash !== proposalHash ||
      after.reservationId !== reservation.reservationId ||
      after.reservationGeneration !== reservation.generation ||
      after.reservationExpiresAt !== reservation.reservationExpiresAt
    ) {
      console.error('RED: reservation state did not survive the restart')
      process.exitCode = 1
      return
    }
    console.log(
      'GREEN: proposal hash, reservation token, generation and expiry survived the restart'
    )
  } finally {
    await poolB?.end().catch(() => undefined)
    await poolA.end().catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin.end().catch(() => undefined)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
