import { strict as assert } from 'node:assert'
import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { withTenantTransaction } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/tenant-scoped-postgres.ts'
import {
  createApproved,
  fail,
  newSchema,
  pass,
  requestInput,
  tenantId
} from './lib.ts'
import { PostgresApprovalAuthority } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts'

const h = await newSchema('e')
const role = `critic4_rls_${randomBytes(3).toString('hex')}`
const password = 'critic-synthetic-password'
try {
  const tenantA = tenantId('critic_rls_a')
  const tenantB = tenantId('critic_rls_b')
  const admin = h.admin

  await admin.query(
    `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`
  )
  await admin.query(`GRANT USAGE ON SCHEMA ${h.schema} TO ${role}`)
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${h.schema}.runtime_approvals TO ${role}`
  )

  const ownerPool = h.makePool(2)
  const owner = new PostgresApprovalAuthority(ownerPool)
  const rowA = await createApproved(owner, tenantA, 'rls_a')
  const rowB = await owner.request(requestInput(tenantB, 'rls_b'))

  const parsed = new URL(process.env.TEST_DATABASE_URL as string)
  parsed.username = role
  parsed.password = password
  const rolePool = new Pool({
    connectionString: parsed.toString(),
    max: 2,
    options: `-c search_path=${h.schema}`
  })
  const roleAuthority = new PostgresApprovalAuthority(rolePool)

  // (i) own tenant visible
  const own = await roleAuthority.get(tenantA, rowA.approvalId)
  assert.equal(own.approvalId, rowA.approvalId)

  // (ii) explicit other-tenant filter sees zero rows
  const cross = await withTenantTransaction(
    rolePool,
    tenantA,
    async (client) => {
      const result = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM runtime_approvals WHERE tenant_id = $1`,
        [tenantB]
      )
      return result.rows[0]?.count
    }
  )
  assert.equal(cross, 0, 'cross-tenant select must see zero rows')

  // (iii) no context sees zero rows
  const noContext = await rolePool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM runtime_approvals`
  )
  assert.equal(noContext.rows[0]?.count, 0, 'no context must see zero rows')

  // (iv) INSERT with the wrong tenant context must be rejected by WITH CHECK
  const insertMismatch = async () =>
    await withTenantTransaction(rolePool, tenantA, async (client) => {
      await client.query(
        `INSERT INTO runtime_approvals
           (tenant_id, approval_id, operator_id, agent_id, agent_version, action,
            resource_type, payload_hash, policy_version, correlation_id, status,
            single_use, requested_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REQUESTED',true, now(), now() + interval '15 minutes')`,
        [
          tenantB,
          `appr_forbidden_${randomBytes(3).toString('hex')}`,
          'op_critic',
          'agent_secretary',
          '1.0.0',
          'appointment.confirm',
          'appointment',
          'f'.repeat(64),
          'policy-v1',
          'corr:forbidden-insert'
        ]
      )
    })
  let insertError: Error | undefined
  try {
    await insertMismatch()
  } catch (error) {
    insertError = error as Error
  }
  assert.ok(
    insertError,
    'INSERT with tenant B rows under tenant A context must fail'
  )
  console.log(
    `cross-tenant INSERT rejected: ${insertError?.message.split('\n')[0]}`
  )

  // (v) UPDATE of the other tenant's row under tenant A context affects zero rows
  const updated = await withTenantTransaction(
    rolePool,
    tenantA,
    async (client) => {
      const result = await client.query(
        `UPDATE runtime_approvals SET decision_reason = 'critic-cross-update' WHERE tenant_id = $1 AND approval_id = $2`,
        [tenantB, rowB.approvalId]
      )
      return result.rowCount
    }
  )
  assert.equal(updated, 0, 'cross-tenant UPDATE must affect zero rows')

  // (vi) own-row insert under the correct context still works (grants are real)
  const ownInsert = await withTenantTransaction(
    rolePool,
    tenantA,
    async (client) => {
      const result = await client.query(
        `INSERT INTO runtime_approvals
         (tenant_id, approval_id, operator_id, agent_id, agent_version, action,
          resource_type, payload_hash, policy_version, correlation_id, status,
          single_use, requested_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'REQUESTED',true, now(), now() + interval '15 minutes')
       RETURNING approval_id`,
        [
          tenantA,
          `appr_own_${randomBytes(3).toString('hex')}`,
          'op_critic',
          'agent_secretary',
          '1.0.0',
          'appointment.confirm',
          'appointment',
          'a'.repeat(64),
          'policy-v1',
          'corr:own-insert'
        ]
      )
      return result.rows.length
    }
  )
  assert.equal(ownInsert, 1, 'own-tenant INSERT must succeed')

  const crossCount = await ownerPool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM runtime_approvals WHERE tenant_id = $1`,
    [tenantB]
  )
  assert.equal(crossCount.rows[0]?.count, '1', 'tenant B row must still exist')
  console.log(
    `RLS: own=${own.approvalId} cross-select=0 no-context=0 cross-insert=rejected cross-update=0`
  )
  await rolePool.end()
  await ownerPool.end()
  pass('RLS isolation holds for a real NOSUPERUSER NOBYPASSRLS role')
} catch (error) {
  console.error(error)
  fail(`probe-e aborted: ${(error as Error).message}`)
} finally {
  await h.admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
  await h.admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
  await h.drop()
}
