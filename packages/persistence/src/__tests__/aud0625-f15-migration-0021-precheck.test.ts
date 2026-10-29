// AUD0625 F15 (SPEC 0271): the pre-check of migration 0021 counts groups that
// the unique index it creates never rejects. Attendance decisions are
// `approval_decision` audit events keyed by approvalRequestId/status, so their
// (approvalId, decision) is (NULL, NULL); the index treats NULLs as distinct
// but the pre-check's GROUP BY puts two of them in one group and aborts with
// 23505. SPEC 0271 BUILD: the pre-check counts only what the index can reject,
// and databases that applied the previous text of the 0021 keep working
// (`supersededMigrationChecksums`), while any other checksum is still an error.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  isAcceptedMigrationChecksum,
  readPostgresMigrationSql,
  runPostgresMigrations,
  supersededMigrationChecksums
} from '../postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
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

describe('AUD0625 F15 — migration 0021 pre-check scope (SPEC 0271)', () => {
  itWithPostgres(
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
    'events with only ONE null key part are not groups either (each filter of the pre-check matters)',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      // approvalId present, decision missing: two of them in the same tenant.
      await insertEvent(tenantA, { approvalId: 'approval_f15_x' })
      await insertEvent(tenantA, { approvalId: 'approval_f15_x' })
      // decision present, approvalId missing: two of them in the same tenant.
      await insertEvent(tenantB, { decision: 'approved' })
      await insertEvent(tenantB, { decision: 'approved' })
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

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
const oldChecksum =
  '038de370b42478ee8987109c4d799ce15bf00d93cba973f19d189c244cadeb7e'
const oldGuardSql = readFileSync(
  resolve(
    process.cwd(),
    'packages/persistence/src/__tests__/fixtures/0021_approval_decision_audit_dedupe.pre-0271.sql'
  ),
  'utf8'
)

async function recordedChecksum(version: string): Promise<string | undefined> {
  const rows = await admin.query<{ checksum: string }>(
    'SELECT checksum FROM schema_migrations WHERE version = $1',
    [version]
  )
  return rows.rows[0]?.checksum
}

// A database that applied the 0021 BEFORE SPEC 0271: the old text ran and the
// runner recorded its checksum.
async function applyOld0021(): Promise<void> {
  await admin.query(oldGuardSql)
  await admin.query(
    'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
    [guard, oldChecksum]
  )
}

describe('AUD0625 F15 — checksum of the superseded 0021 text (SPEC 0271)', () => {
  it('pins the previous text: its sha256 is the superseded one and the current file is different', async () => {
    expect(sha256(oldGuardSql)).toBe(oldChecksum)
    expect(supersededMigrationChecksums[guard]).toEqual([oldChecksum])
    expect(sha256(await readPostgresMigrationSql(guard))).not.toBe(oldChecksum)
  })

  it('accepts the current and the superseded checksum of the 0021 only', () => {
    const current = 'c'.repeat(64)
    expect(isAcceptedMigrationChecksum(guard, current, current)).toBe(true)
    expect(isAcceptedMigrationChecksum(guard, oldChecksum, current)).toBe(true)
    expect(isAcceptedMigrationChecksum(guard, 'f'.repeat(64), current)).toBe(
      false
    )
    expect(isAcceptedMigrationChecksum(guard, null, current)).toBe(false)
    expect(isAcceptedMigrationChecksum(guard, undefined, current)).toBe(false)
    expect(isAcceptedMigrationChecksum(guard, '', current)).toBe(false)
    // The old checksum of the 0021 is not an alias for any other migration.
    expect(
      isAcceptedMigrationChecksum(
        '0022_conversation_policy_standardization',
        oldChecksum,
        current
      )
    ).toBe(false)
  })

  itWithPostgres(
    'a database that applied the OLD 0021 keeps running: no error, old checksum untouched, later migrations apply',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await applyOld0021()
      await runPostgresMigrations(admin, { schemaName, createSchema: false })
      expect(await recordedChecksum(guard)).toBe(oldChecksum)
      expect(
        await recordedChecksum('0022_conversation_policy_standardization')
      ).toBeDefined()
      expect(
        await recordedChecksum('0031_channel_effect_retry_not_before')
      ).toBeDefined()
      // And again: idempotent, still no mismatch.
      await runPostgresMigrations(admin, { schemaName, createSchema: false })
      expect(await recordedChecksum(guard)).toBe(oldChecksum)
    },
    180_000
  )

  itWithPostgres(
    'a database stuck at the 0021 by the defect now passes and applies 0021 to 0031 in one run',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await seedAttendanceEvents()
      await runPostgresMigrations(admin, { schemaName, createSchema: false })
      expect(await recordedChecksum(guard)).toBe(
        sha256(await readPostgresMigrationSql(guard))
      )
      expect(
        await recordedChecksum('0022_conversation_policy_standardization')
      ).toBeDefined()
      expect(
        await recordedChecksum('0031_channel_effect_retry_not_before')
      ).toBeDefined()
      expect(await indexExists()).toBe(true)
    },
    180_000
  )

  itWithPostgres(
    'an unknown checksum of the 0021 is still an error (and so is a missing one)',
    async () => {
      const schemaName = await freshSchemaBefore0021()
      await seedHarnessDecisions()
      await applyOld0021()
      await admin.query(
        'UPDATE schema_migrations SET checksum = $2 WHERE version = $1',
        [guard, 'f'.repeat(64)]
      )
      await expect(
        runPostgresMigrations(admin, {
          schemaName,
          createSchema: false,
          migrations: [guard]
        })
      ).rejects.toThrow(`PostgreSQL migration checksum mismatch: ${guard}`)
      await admin.query(
        'UPDATE schema_migrations SET checksum = NULL WHERE version = $1',
        [guard]
      )
      await expect(
        runPostgresMigrations(admin, {
          schemaName,
          createSchema: false,
          migrations: [guard]
        })
      ).rejects.toThrow(`PostgreSQL migration checksum missing: ${guard}`)
    },
    180_000
  )
})
