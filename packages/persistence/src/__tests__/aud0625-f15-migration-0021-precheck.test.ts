// AUD0625 F15 (SPEC 0271): the pre-check of migration 0021 counts groups that
// the unique index it creates never rejects. Attendance decisions are
// `approval_decision` audit events keyed by approvalRequestId/status, so their
// (approvalId, decision) is (NULL, NULL); the index treats NULLs as distinct
// but the pre-check's GROUP BY puts two of them in one group and aborts with
// 23505. The `it.fails` below documents the defect and flips to `it` with the
// SPEC 0271 correction; the plain tests are controls.
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '../postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
const itFailsWithPostgres = testDatabaseUrl ? it.fails : it.skip
const tenantA = 'tenant_00000000-0000-4000-8000-000000000271'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000272'
const guard = '0021_approval_decision_audit_dedupe'
const upTo0020 = [
  '0000_initial',
  '0001_tenant_isolation',
  '0002_capability_approvals',
  '0003_test_suite_catalog',
  '0004_plugin_manifest_catalog',
  '0005_knowledge_source_catalog',
  '0006_release_candidate_evidence',
  '0007_audit_evidence_checkpoint',
  '0008_session_agent_version_pin',
  '0009_release_candidate_validator_integrity',
  '0010_outbox_durability',
  '0011_outbox_payload_redaction',
  '0012_channel_effect_journal',
  '0013_runtime_effect_journal',
  '0014_journeys',
  '0015_runtime_approval_store',
  '0016_operational_execution_spine',
  '0017_runtime_approval_execution_binding',
  '0018_operational_execution_invariants',
  '0019_iterative_execution_steps',
  '0020_conversation_intelligence'
]

let admin: Client
const schemas: string[] = []

async function freshSchemaBefore0021(): Promise<string> {
  const schemaName = `cvg_f15_${Date.now()}_${randomBytes(3).toString('hex')}`
  schemas.push(schemaName)
  await runPostgresMigrations(admin, { schemaName, migrations: upTo0020 })
  return schemaName
}

let counter = 0
async function insertEvent(
  tenantId: string,
  payload: Record<string, unknown>
): Promise<void> {
  counter += 1
  await admin.query(
    `INSERT INTO audit_events
       (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload)
     VALUES ($1, $2, 'approval_decision', 'Approver', 'synthetic', $3, 'policy-v1', $4::jsonb)`,
    [tenantId, `audit_f15_${counter}`, `correlation_f15_${counter}`, payload]
  )
}

// Shape of attendanceDecisionAudit (packages/persistence/src/attendance-approval.ts).
const attendance = (n: number) => ({
  sessionId: `session_f15_${n}`,
  approvalRequestId: `approval_request_f15_${n}`,
  status: 'approved',
  effect: 'approval_state_only'
})

async function seedHarnessDecisions(): Promise<void> {
  await insertEvent(tenantA, {
    approvalId: 'approval_f15_1',
    decision: 'approved'
  })
  await insertEvent(tenantA, {
    approvalId: 'approval_f15_2',
    decision: 'rejected'
  })
  await insertEvent(tenantB, {
    approvalId: 'approval_f15_1',
    decision: 'approved'
  })
}

async function seedAttendanceEvents(): Promise<void> {
  await insertEvent(tenantA, attendance(1))
  await insertEvent(tenantA, attendance(2))
  await insertEvent(tenantB, attendance(3))
  await insertEvent(tenantB, attendance(4))
}

async function apply0021(schemaName: string): Promise<void> {
  await runPostgresMigrations(admin, {
    schemaName,
    createSchema: false,
    migrations: [guard]
  })
}

async function indexExists(): Promise<boolean> {
  const rows = await admin.query(
    `SELECT 1 FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'uq_audit_approval_decision'`
  )
  return rows.rows.length === 1
}

describe('AUD0625 F15 — migration 0021 pre-check scope (SPEC 0271)', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
  }, 60_000)
  afterAll(async () => {
    if (!testDatabaseUrl) return
    for (const schemaName of schemas)
      await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
    await admin.end()
  }, 60_000)

  itFailsWithPostgres(
    'applies 0021 over mixed history: harness decisions plus two attendance events per tenant',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await seedAttendanceEvents()
      await apply0021(schemaName)
      expect(await indexExists()).toBe(true)
    },
    180_000
  )

  itWithPostgres(
    'control: the same migration applies when the history has only harness decisions',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await apply0021(schemaName)
      expect(await indexExists()).toBe(true)
    },
    180_000
  )

  itWithPostgres(
    'control: a single attendance event per tenant does not form a group',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await insertEvent(tenantA, attendance(1))
      await insertEvent(tenantB, attendance(2))
      await apply0021(schemaName)
      expect(await indexExists()).toBe(true)
    },
    180_000
  )

  itWithPostgres(
    'control: the index itself accepts two NULL/NULL events (the pre-check is stricter than the index)',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await apply0021(schemaName)
      await seedAttendanceEvents()
      const count = await admin.query(
        `SELECT count(*)::int AS n FROM audit_events
          WHERE type = 'approval_decision' AND payload->>'approvalId' IS NULL`
      )
      expect(count.rows[0]?.n).toBe(4)
    },
    180_000
  )

  itWithPostgres(
    'control: a real duplicate decision still blocks 0021, even with attendance events present',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await insertEvent(tenantA, {
        approvalId: 'approval_f15_1',
        decision: 'approved'
      })
      await expect(apply0021(schemaName)).rejects.toThrow(
        'legacy duplicate approval_decision key groups prevent unique index creation'
      )
      expect(await indexExists()).toBe(false)
    },
    180_000
  )
})
