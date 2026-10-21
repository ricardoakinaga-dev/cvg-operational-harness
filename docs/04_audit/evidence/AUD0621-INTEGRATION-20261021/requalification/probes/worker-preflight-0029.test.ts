// Crítico AUD0621-REQUALIFY-20261021: o preflight do worker deriva
// WORKER_CRITICAL_TABLES do inventário (com as case_* da 0029). Prova:
// banco migrado até a 0029 + role mínimo passa; banco sem a 0029 é recusado.
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  runPostgresMigrations,
  TENANT_SCHEMA_TABLES
} from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/packages/persistence/src/index.ts'
import {
  assertPostgresWorkerPreflight,
  WORKER_CRITICAL_TABLES
} from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/apps/worker/src/postgres-role-preflight.ts'
import { assertPostgresKernelPrerequisites } from '/mnt/dados/cvg-work/cvg-aud0621-integration-20261021/apps/worker/src/kernel-composition.ts'

const url = process.env.TEST_DATABASE_URL as string
const tenant = 'tenant_00000000-0000-4000-8000-000000000931' as never
const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
const full = `critic_pf_full_${suffix}`
const no29 = `critic_pf_no29_${suffix}`
const role = `critic_pf_role_${suffix}`
const password = 'critic-synthetic-password'
const ALL = [
  '0000_initial', '0001_tenant_isolation', '0002_capability_approvals',
  '0003_test_suite_catalog', '0004_plugin_manifest_catalog',
  '0005_knowledge_source_catalog', '0006_release_candidate_evidence',
  '0007_audit_evidence_checkpoint', '0008_session_agent_version_pin',
  '0009_release_candidate_validator_integrity', '0010_outbox_durability',
  '0011_outbox_payload_redaction', '0012_channel_effect_journal',
  '0013_runtime_effect_journal', '0014_journeys',
  '0015_runtime_approval_store', '0016_operational_execution_spine',
  '0017_runtime_approval_execution_binding',
  '0018_operational_execution_invariants', '0019_iterative_execution_steps',
  '0020_conversation_intelligence', '0021_approval_decision_audit_dedupe',
  '0022_conversation_policy_standardization', '0023_rate_limit_buckets',
  '0024_approval_decision_causality', '0025_webhook_replay_fencing',
  '0026_rate_limit_key_hardening', '0027_worker_operations'
]

function roleUrl(): string {
  const parsed = new URL(url)
  parsed.username = role
  parsed.password = password
  return parsed.toString()
}

describe('worker preflight x migration 0029 (critic)', () => {
  let admin: Client
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: full })
    await admin.query('SET search_path TO public')
    await runPostgresMigrations(admin, { schemaName: no29, migrations: ALL })
    await admin.query('SET search_path TO public')
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    // Same grant shape as scripts/migrate-job.mjs (SELECT, INSERT, UPDATE on
    // every inventory table that exists in the schema).
    for (const schema of [full, no29]) {
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
      const existing = await admin.query<{ relname: string }>(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname=$1 AND c.relkind='r' AND c.relname = ANY($2::text[])`,
        [schema, TENANT_SCHEMA_TABLES]
      )
      for (const { relname } of existing.rows) {
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${schema}."${relname}" TO ${role}`
        )
      }
    }
  }, 240_000)

  afterAll(async () => {
    await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
    await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
    await admin.query(`DROP SCHEMA IF EXISTS ${full} CASCADE`).catch(() => undefined)
    await admin.query(`DROP SCHEMA IF EXISTS ${no29} CASCADE`).catch(() => undefined)
    await admin.end().catch(() => undefined)
  })

  it('inventory used by the worker contains the five case_* tables', () => {
    for (const table of [
      'case_principals', 'case_roots', 'case_assignments',
      'case_execution_links', 'case_audit_links'
    ]) {
      expect(WORKER_CRITICAL_TABLES).toContain(table)
    }
    expect(WORKER_CRITICAL_TABLES).toContain('effect_journal')
    expect(WORKER_CRITICAL_TABLES).toContain('runtime_approvals')
  })

  it('a database migrated through 0029 passes the worker preflight with a minimal role', async () => {
    const pool = new Pool({ connectionString: roleUrl(), max: 2, options: `-c search_path=${full}` })
    try {
      await expect(assertPostgresWorkerPreflight(pool as never, { tenantId: tenant })).resolves.toBeUndefined()
      await expect(assertPostgresKernelPrerequisites(pool as never, tenant)).resolves.toBeUndefined()
    } finally {
      await pool.end()
    }
  })

  it('a database without 0029 is refused by the worker preflight', async () => {
    const missing = await admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=$1 AND c.relname LIKE 'case\\_%'`,
      [no29]
    )
    expect(missing.rows[0]?.n).toBe(0)
    const pool = new Pool({ connectionString: roleUrl(), max: 2, options: `-c search_path=${no29}` })
    try {
      await expect(assertPostgresWorkerPreflight(pool as never, { tenantId: tenant })).rejects.toThrow(
        'PostgreSQL worker schema is missing tenant-isolated tables'
      )
    } finally {
      await pool.end()
    }
  })

  it('negative control: 0029 present but RLS disabled on case_assignments is refused', async () => {
    await admin.query(`ALTER TABLE ${full}.case_assignments DISABLE ROW LEVEL SECURITY`)
    const pool = new Pool({ connectionString: roleUrl(), max: 2, options: `-c search_path=${full}` })
    try {
      await expect(assertPostgresWorkerPreflight(pool as never, { tenantId: tenant })).rejects.toThrow(
        /tenant-isolated and not owned/
      )
    } finally {
      await pool.end()
      await admin.query(`ALTER TABLE ${full}.case_assignments ENABLE ROW LEVEL SECURITY`)
    }
  })
})
