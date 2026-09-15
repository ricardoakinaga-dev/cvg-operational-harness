import { createHash, randomBytes } from 'node:crypto'
import { Pool } from 'pg'
import { runPostgresMigrations } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/postgres.ts'
import { PostgresApprovalAuthority } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts'

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required')
  process.exit(2)
}

export const dbUrl = process.env.TEST_DATABASE_URL
export const REPO = '/home/ricardo/cvg-agent-secretary-v2'
export const REVIEW_DIR = `${REPO}/docs/04_audit/evidence/PROD-20260913/PROD-04/review`

export interface SchemaHarness {
  schema: string
  admin: Pool
  makePool(max?: number): Pool
  drop(...pools: Pool[]): Promise<void>
}

export async function newSchema(prefix: string): Promise<SchemaHarness> {
  const schema = `critic4_${prefix}_${randomBytes(3).toString('hex')}`
  const admin = new Pool({ connectionString: dbUrl, max: 2 })
  await runPostgresMigrations(admin, { schemaName: schema })
  const makePool = (max = 4): Pool =>
    new Pool({
      connectionString: dbUrl,
      max,
      options: `-c search_path=${schema}`
    })
  return {
    schema,
    admin,
    makePool,
    async drop(...pools: Pool[]) {
      for (const pool of pools) await pool.end().catch(() => undefined)
      await admin
        .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin.end().catch(() => undefined)
    }
  }
}

export function tenantId(label: string): string {
  const hex = createHash('sha256').update(label).digest('hex').slice(0, 12)
  return `tenant_00000000-0000-4000-8000-${hex}`
}

export function proposalHash(hint: string): string {
  return createHash('sha256').update(`critic:${hint}`, 'utf8').digest('hex')
}

export function syntheticPayload(hint: string): unknown {
  return { kind: 'critic_synthetic', draftId: `c_${hint}`, label: 'critic only' }
}

export function requestInput(tenantId: string, hint: string) {
  return {
    tenantId,
    operatorId: 'op_critic',
    agentId: 'agent_secretary',
    agentVersion: '1.0.0',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${hint}` },
    payload: syntheticPayload(hint),
    policyVersion: 'policy-v1',
    correlationId: `corr:${hint}`,
    proposalId: `proposal_${hint}`,
    proposalHash: proposalHash(hint),
    capability: 'appointments.manage',
    dataClassification: 'synthetic',
    proposalPayload: syntheticPayload(hint)
  }
}

export function reserveInput(
  tenantId: string,
  hint: string,
  approvalId: string,
  reservationId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    tenantId,
    approvalId,
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${hint}` },
    payload: syntheticPayload(hint),
    proposalHash: proposalHash(hint),
    agentId: 'agent_secretary',
    agentVersion: '1.0.0',
    policyVersion: 'policy-v1',
    capability: 'appointments.manage',
    reservationId,
    ownerId: 'op_critic',
    ttlMs: 60_000,
    ...overrides
  }
}

export async function createApproved(
  authority: PostgresApprovalAuthority,
  tenantId: string,
  hint: string
) {
  const record = await authority.request(requestInput(tenantId, hint))
  await authority.submit(tenantId, record.approvalId, 'op_critic')
  return await authority.approve(tenantId, record.approvalId, {
    approverId: 'op_approver_critic'
  })
}

export function fail(message: string): never {
  console.error(`FAIL: ${message}`)
  process.exit(1)
}

export function pass(message: string): void {
  console.log(`PASS: ${message}`)
}
