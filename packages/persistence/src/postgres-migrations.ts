import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { PostgresQueryable } from './postgres.ts'

export interface PostgresMigrationOptions {
  schemaName?: string
  migrations?: string[]
  createSchema?: boolean
}

const migrationPath = resolve(
  process.cwd(),
  'packages/persistence/migrations/0000_initial.sql'
)
const migrationDirectory = resolve(
  process.cwd(),
  'packages/persistence/migrations'
)
const defaultPostgresMigrations = [
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
  '0020_conversation_intelligence',
  '0021_approval_decision_audit_dedupe',
  '0022_conversation_policy_standardization',
  '0023_rate_limit_buckets',
  '0024_approval_decision_causality',
  '0025_webhook_replay_fencing',
  '0026_rate_limit_key_hardening',
  '0027_worker_operations'
]

function assertSafeSchemaName(schemaName: string): void {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('Invalid PostgreSQL schema name')
  }
}

export async function readInitialMigrationSql(): Promise<string> {
  return readFile(migrationPath, 'utf8')
}

export async function readPostgresMigrationSql(
  version: string
): Promise<string> {
  if (!/^\d{4}_[a-z0-9_]+$/.test(version)) {
    throw new Error('Invalid PostgreSQL migration version')
  }
  return readFile(resolve(migrationDirectory, `${version}.sql`), 'utf8')
}

export async function runInitialPostgresMigration(
  client: PostgresQueryable,
  options: PostgresMigrationOptions = {}
): Promise<void> {
  const migration = await readInitialMigrationSql()

  if (options.schemaName) {
    assertSafeSchemaName(options.schemaName)
  }

  await client.query('BEGIN')
  try {
    if (options.schemaName) {
      if (options.createSchema !== false) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${options.schemaName}`)
      }
      await client.query(`SET search_path TO ${options.schemaName}`)
    }
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('cvg-agent-secretary:migrations'))`
    )
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    )
    const applied = await client.query<{ version: string }>(
      `SELECT version FROM schema_migrations
       WHERE version = $1
       FOR UPDATE`,
      ['0000_initial']
    )
    if (applied.rows.length > 0) {
      await client.query('COMMIT')
      return
    }
    await client.query(migration)
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/**
 * Applies ordered migrations with a checksum guard. The legacy 0000 file is
 * intentionally preserved; production startup must use this runner so a
 * database marked with 0000 cannot silently skip tenant isolation.
 */
export async function runPostgresMigrations(
  client: PostgresQueryable,
  options: PostgresMigrationOptions = {}
): Promise<void> {
  const migrations = options.migrations ?? defaultPostgresMigrations
  for (const version of migrations) {
    const migration = await readPostgresMigrationSql(version)
    const checksum = createHash('sha256').update(migration).digest('hex')

    await client.query('BEGIN')
    try {
      if (options.schemaName) {
        assertSafeSchemaName(options.schemaName)
        if (options.createSchema !== false) {
          await client.query(
            `CREATE SCHEMA IF NOT EXISTS ${options.schemaName}`
          )
        }
        await client.query(`SET search_path TO ${options.schemaName}`)
      }
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('cvg-agent-secretary:migrations'))`
      )
      await client.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           version text PRIMARY KEY,
           applied_at timestamptz NOT NULL DEFAULT now()
         )`
      )
      await client.query(
        `ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text`
      )
      const applied = await client.query<{
        version: string
        checksum: string | null
      }>(
        `SELECT version, checksum
         FROM schema_migrations
         WHERE version = $1
         FOR UPDATE`,
        [version]
      )
      const current = applied.rows[0]
      if (current) {
        if (!current.checksum) {
          throw new Error(`PostgreSQL migration checksum missing: ${version}`)
        }
        if (current.checksum !== checksum) {
          throw new Error(`PostgreSQL migration checksum mismatch: ${version}`)
        }
      } else {
        await client.query(migration)
        await client.query(
          `INSERT INTO schema_migrations (version, checksum)
           VALUES ($1, $2)
           ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum`,
          [version, checksum]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  }
}

export interface LegacyMigrationBaselineApproval {
  actor: string
  reference: string
}

const legacyMigrationTables = [
  'conversations',
  'messages',
  'sessions',
  'agent_runs',
  'tool_calls',
  'approval_requests',
  'tasks',
  'audit_events',
  'idempotency',
  'outbox_events',
  'platform_agents',
  'platform_agent_versions',
  'platform_test_runs',
  'platform_execution_traces'
] as const

export const legacyRequiredColumns = [
  ['conversations', 'tenant_id'],
  ['conversations', 'id'],
  ['conversations', 'channel'],
  ['conversations', 'sender_ref'],
  ['conversations', 'sender_ref_hash'],
  ['conversations', 'status'],
  ['conversations', 'correlation_id'],
  ['conversations', 'created_at'],
  ['conversations', 'updated_at'],
  ['messages', 'id'],
  ['messages', 'conversation_id'],
  ['messages', 'external_message_id'],
  ['messages', 'direction'],
  ['messages', 'body'],
  ['messages', 'runtime_status'],
  ['messages', 'created_at'],
  ['sessions', 'id'],
  ['sessions', 'conversation_id'],
  ['sessions', 'status'],
  ['sessions', 'takeover_state'],
  ['sessions', 'created_at'],
  ['sessions', 'updated_at'],
  ['agent_runs', 'id'],
  ['agent_runs', 'session_id'],
  ['agent_runs', 'status'],
  ['agent_runs', 'created_at'],
  ['agent_runs', 'updated_at'],
  ['tool_calls', 'id'],
  ['tool_calls', 'agent_run_id'],
  ['tool_calls', 'tool_name'],
  ['tool_calls', 'status'],
  ['tool_calls', 'input'],
  ['tool_calls', 'output'],
  ['tool_calls', 'error'],
  ['tool_calls', 'created_at'],
  ['approval_requests', 'id'],
  ['approval_requests', 'session_id'],
  ['approval_requests', 'proposed_action'],
  ['approval_requests', 'summary'],
  ['approval_requests', 'risk_level'],
  ['approval_requests', 'status'],
  ['approval_requests', 'decided_by'],
  ['approval_requests', 'decided_at'],
  ['approval_requests', 'created_at'],
  ['tasks', 'id'],
  ['tasks', 'session_id'],
  ['tasks', 'title'],
  ['tasks', 'description'],
  ['tasks', 'priority'],
  ['tasks', 'source'],
  ['tasks', 'status'],
  ['tasks', 'idempotency_key'],
  ['tasks', 'created_at'],
  ['audit_events', 'id'],
  ['audit_events', 'type'],
  ['audit_events', 'actor_type'],
  ['audit_events', 'actor_id'],
  ['audit_events', 'correlation_id'],
  ['audit_events', 'policy_version'],
  ['audit_events', 'payload'],
  ['audit_events', 'created_at'],
  ['idempotency', 'tenant_id'],
  ['idempotency', 'key'],
  ['idempotency', 'resource_id'],
  ['idempotency', 'created_at'],
  ['outbox_events', 'id'],
  ['outbox_events', 'type'],
  ['outbox_events', 'payload'],
  ['outbox_events', 'status'],
  ['outbox_events', 'created_at'],
  ['platform_agents', 'tenant_id'],
  ['platform_agents', 'id'],
  ['platform_agents', 'slug'],
  ['platform_agents', 'name'],
  ['platform_agents', 'description'],
  ['platform_agents', 'active_version_id'],
  ['platform_agents', 'created_at'],
  ['platform_agents', 'updated_at'],
  ['platform_agent_versions', 'tenant_id'],
  ['platform_agent_versions', 'id'],
  ['platform_agent_versions', 'agent_id'],
  ['platform_agent_versions', 'version'],
  ['platform_agent_versions', 'status'],
  ['platform_agent_versions', 'config'],
  ['platform_agent_versions', 'created_by'],
  ['platform_agent_versions', 'created_at'],
  ['platform_agent_versions', 'published_at'],
  ['platform_test_runs', 'tenant_id'],
  ['platform_test_runs', 'trace_id'],
  ['platform_test_runs', 'agent_id'],
  ['platform_test_runs', 'version_id'],
  ['platform_test_runs', 'trace'],
  ['platform_test_runs', 'created_at'],
  ['platform_execution_traces', 'tenant_id'],
  ['platform_execution_traces', 'trace_id'],
  ['platform_execution_traces', 'agent_id'],
  ['platform_execution_traces', 'version_id'],
  ['platform_execution_traces', 'trace'],
  ['platform_execution_traces', 'created_at']
] as const

export const legacyRequiredIndexes = [
  'conversations_pkey',
  'messages_pkey',
  'sessions_pkey',
  'agent_runs_pkey',
  'tool_calls_pkey',
  'approval_requests_pkey',
  'tasks_pkey',
  'audit_events_pkey',
  'idempotency_pkey',
  'outbox_events_pkey',
  'platform_agents_pkey',
  'platform_agent_versions_pkey',
  'platform_test_runs_pkey',
  'platform_execution_traces_pkey',
  'idx_messages_conversation_id',
  'idx_messages_runtime_status',
  'idx_conversations_tenant_id',
  'idx_sessions_conversation_id',
  'idx_agent_runs_session_id',
  'idx_approval_requests_session_id',
  'idx_tasks_session_id',
  'idx_audit_events_correlation_id',
  'idx_audit_events_type',
  'idx_audit_events_actor_id',
  'idx_audit_events_payload_session_id',
  'idx_outbox_events_status',
  'idx_platform_agents_tenant_id',
  'idx_platform_agent_versions_tenant_agent',
  'idx_platform_agent_versions_one_published',
  'idx_platform_test_runs_tenant_created',
  'idx_platform_execution_traces_tenant_created'
] as const

function assertBaselineApprovalText(value: string, label: string): void {
  if (!/^[A-Za-z0-9._:/-]{3,200}$/.test(value)) {
    throw new Error(`${label} is required for a legacy migration baseline`)
  }
}

/**
 * Records an operator-approved checksum baseline for a legacy database that
 * was created by 0000_initial before checksum tracking existed. This is never
 * called by application startup; it is an explicit infrastructure operation.
 */
export async function baselineLegacyPostgresMigration(
  client: PostgresQueryable,
  options: PostgresMigrationOptions & {
    approval: LegacyMigrationBaselineApproval
  }
): Promise<void> {
  assertBaselineApprovalText(options.approval.actor, 'Baseline actor')
  assertBaselineApprovalText(options.approval.reference, 'Baseline reference')
  if (options.schemaName) assertSafeSchemaName(options.schemaName)
  const migration = await readPostgresMigrationSql('0000_initial')
  const checksum = createHash('sha256').update(migration).digest('hex')

  await client.query('BEGIN')
  try {
    if (options.schemaName) {
      if (options.createSchema !== false) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS ${options.schemaName}`)
      }
      await client.query(`SET search_path TO ${options.schemaName}`)
    }
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext('cvg-agent-secretary:migrations'))`
    )
    const tables = await client.query<{ table_name: string }>(
      `SELECT c.relname AS table_name
       FROM pg_class AS c
       INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
       WHERE n.nspname = current_schema()
         AND c.relkind = 'r'
         AND c.relname = ANY($1::text[])`,
      [legacyMigrationTables]
    )
    if (tables.rows.length !== legacyMigrationTables.length) {
      throw new Error(
        'Legacy database does not match the required 0000_initial baseline'
      )
    }
    const columns = await client.query<{
      table_name: string
      column_name: string
    }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = ANY($1::text[])`,
      [legacyMigrationTables]
    )
    const availableColumns = new Set(
      columns.rows.map((column) => `${column.table_name}:${column.column_name}`)
    )
    const missingColumns = legacyRequiredColumns.filter(
      ([tableName, columnName]) =>
        !availableColumns.has(`${tableName}:${columnName}`)
    )
    if (missingColumns.length > 0) {
      throw new Error(
        `Legacy database columns are incomplete: ${missingColumns
          .map(([tableName, columnName]) => `${tableName}.${columnName}`)
          .join(', ')}`
      )
    }
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = ANY($1::text[])`,
      [legacyRequiredIndexes]
    )
    const availableIndexes = new Set(
      indexes.rows.map((index) => index.indexname)
    )
    const missingIndexes = legacyRequiredIndexes.filter(
      (index) => !availableIndexes.has(index)
    )
    if (missingIndexes.length > 0) {
      throw new Error(
        `Legacy database indexes are incomplete: ${missingIndexes.join(', ')}`
      )
    }
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`
    )
    await client.query(
      `ALTER TABLE schema_migrations
         ADD COLUMN IF NOT EXISTS checksum text,
         ADD COLUMN IF NOT EXISTS baseline_actor text,
         ADD COLUMN IF NOT EXISTS baseline_reference text,
         ADD COLUMN IF NOT EXISTS baseline_at timestamptz`
    )
    const applied = await client.query<{
      version: string
      checksum: string | null
    }>(
      `SELECT version, checksum
       FROM schema_migrations
       WHERE version = $1
       FOR UPDATE`,
      ['0000_initial']
    )
    const current = applied.rows[0]
    if (!current) {
      throw new Error('Legacy database has no 0000_initial migration marker')
    }
    if (current.checksum) {
      throw new Error('0000_initial already has a migration checksum')
    }
    await client.query(
      `UPDATE schema_migrations
       SET checksum = $2,
           baseline_actor = $3,
           baseline_reference = $4,
           baseline_at = now()
       WHERE version = $1`,
      [
        '0000_initial',
        checksum,
        options.approval.actor,
        options.approval.reference
      ]
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
