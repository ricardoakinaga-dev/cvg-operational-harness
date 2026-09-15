/**
 * PROD-04 negative-first probe (RED, before durable wiring).
 *
 * Two independent connections read the same APPROVED approval and then both
 * update it without a compare-and-set predicate. The invariant under test is
 * "at most one reservation wins"; without revision/status/reservation fencing
 * both writers believe they reserved the same approval (lost update).
 */
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { runPostgresMigrations } from '@cvg/persistence'

const databaseUrl = process.env.TEST_DATABASE_URL
if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required')

const tenant = 'tenant_00000000-0000-4000-8000-000000000a01'
const approvalId = `appr_cas_red_${randomUUID()}`
const nowIso = new Date().toISOString()

async function main(): Promise<void> {
  const admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const first = new Client({ connectionString: databaseUrl })
  const second = new Client({ connectionString: databaseUrl })
  await first.connect()
  await second.connect()
  try {
    await runPostgresMigrations(admin)
    await admin.query(
      `INSERT INTO runtime_approvals
         (tenant_id, approval_id, operator_id, agent_id, agent_version, action,
          resource_type, payload_hash, policy_version, correlation_id, status,
          single_use, requested_at, expires_at, revision)
       VALUES ($1, $2, 'op_1', 'agent_x', '1', 'appointment.confirm',
               'appointment', $3, 'pv1', 'corr:cas:red', 'APPROVED',
               true, $4, $4, 1)`,
      [tenant, approvalId, 'a'.repeat(64), nowIso]
    )

    const readObservation = async (client: Client) =>
      client.query<{ status: string }>(
        `SELECT status FROM runtime_approvals
         WHERE tenant_id = $1 AND approval_id = $2`,
        [tenant, approvalId]
      )

    const [observedFirst, observedSecond] = await Promise.all([
      readObservation(first),
      readObservation(second)
    ])
    console.log(
      `both connections observed: ${observedFirst.rows[0]?.status}, ${observedSecond.rows[0]?.status}`
    )

    const naiveUpdate = (client: Client, token: string) =>
      client.query(
        `UPDATE runtime_approvals
         SET status = 'RESERVED',
             reservation_id = $3,
             reservation_owner = 'probe',
             reservation_generation = 1,
             reserved_at = $4,
             revision = revision + 1
         WHERE tenant_id = $1 AND approval_id = $2`,
        [tenant, approvalId, token, nowIso]
      )

    const [winnerFirst, winnerSecond] = await Promise.all([
      naiveUpdate(first, `rsv_red_${randomUUID()}`),
      naiveUpdate(second, `rsv_red_${randomUUID()}`)
    ])
    const winners = (winnerFirst.rowCount ?? 0) + (winnerSecond.rowCount ?? 0)
    console.log(
      `connection updates that reported success: ${winnerFirst.rowCount} + ${winnerSecond.rowCount} = ${winners}`
    )

    if (winners !== 1) {
      console.error(
        `RED: ${winners} connections believe they reserved the same approval; without compare-and-set the reservation lost update is invisible`
      )
      process.exitCode = 1
      return
    }
    console.log('GREEN: exactly one connection reserved the approval')
  } finally {
    await first.end().catch(() => undefined)
    await second.end().catch(() => undefined)
    await admin.end().catch(() => undefined)
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
