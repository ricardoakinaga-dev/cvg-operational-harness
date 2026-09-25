/**
 * AUD19-011 — tenant isolation preflight, extracted from `server.ts`.
 *
 * Owner: backend/persistence. Single authority for the startup migration,
 * schema, policy, constraint, index and role checks. `server.ts` re-exports
 * the assertions for compatibility; new callers import from here.
 */
import { createHash } from 'node:crypto'
import {
  TENANT_ONLY_TABLES,
  TENANT_SCHEMA_TABLES,
  readPostgresMigrationSql,
  type PostgresQueryable
} from '@cvg/persistence'

// AUD19-005: derived from the canonical inventory in
// `@cvg/persistence` (`tenant-schema.ts`) instead of a hardcoded list, so a
// tenant-scoped table added by a migration cannot stay invisible here.
const tenantIsolationTables: readonly string[] = TENANT_SCHEMA_TABLES

const tenantIsolationQuarantineTables = [
  'tenant_isolation_quarantine',
  'outbox_quarantine'
] as const

const webhookReplayTables = ['webhook_replay_events'] as const

const rateLimitTables = ['rate_limit_buckets'] as const

const rateLimitRequiredColumns = [
  'budget_key',
  'key_version',
  'key_digest',
  'count',
  'reset_at'
] as const
const rateLimitForbiddenColumns = ['key'] as const

const rateLimitRequiredConstraints = [
  'rate_limit_buckets_pkey',
  'rate_limit_buckets_count_check',
  'rate_limit_buckets_key_version_check',
  'rate_limit_buckets_key_digest_check'
] as const

const rateLimitRequiredIndexes = [
  'rate_limit_buckets_pkey',
  'idx_rate_limit_buckets_reset_at'
] as const

const approvalDecisionDedupeIndexes = ['uq_audit_approval_decision'] as const

const tenantIsolationMigrationTables = [
  ...tenantIsolationTables,
  ...webhookReplayTables,
  ...tenantIsolationQuarantineTables,
  ...rateLimitTables,
  'schema_migrations'
] as const

const tenantIsolationMigrationVersions = [
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
  '0026_rate_limit_key_hardening'
] as const

const tenantIsolationRequiredConstraints = [
  'messages_runtime_status_check',
  'messages_tenant_id_not_null',
  'sessions_tenant_id_not_null',
  'agent_runs_tenant_id_not_null',
  'tool_calls_tenant_id_not_null',
  'approval_requests_tenant_id_not_null',
  'tasks_tenant_id_not_null',
  'audit_events_tenant_id_not_null',
  'outbox_events_tenant_id_not_null',
  'outbox_events_tenant_id_id_key',
  'outbox_events_tenant_id_idempotency_key_key',
  'outbox_events_status_check',
  'outbox_events_attempts_check',
  'outbox_events_processing_lease_check',
  'outbox_events_failed_available_check',
  'outbox_events_dead_letter_check',
  'outbox_effects_pkey',
  'outbox_effects_tenant_event_fk',
  'outbox_effects_tenant_id_event_id_key',
  'outbox_attempts_pkey',
  'outbox_attempts_attempt_check',
  'outbox_attempts_tenant_event_fk',
  'outbox_quarantine_pkey',
  'messages_tenant_conversation_fk',
  'sessions_tenant_conversation_fk',
  'sessions_agent_binding_pair_check',
  'sessions_agent_binding_agent_fk',
  'sessions_agent_binding_version_fk',
  'agent_runs_tenant_session_fk',
  'tool_calls_tenant_run_fk',
  'approval_requests_tenant_session_fk',
  'tasks_tenant_session_fk',
  'platform_versions_tenant_agent_fk',
  'platform_test_runs_tenant_agent_version_fk',
  'platform_execution_traces_tenant_agent_version_fk',
  'platform_capability_approvals_tenant_nonce_key',
  'platform_capability_approvals_tenant_agent_version_fk',
  'platform_test_suites_tenant_agent_version_fk',
  'platform_test_suites_previous_agent_fk',
  'platform_test_suite_runs_tenant_suite_fk',
  'platform_test_suite_runs_tenant_agent_fk',
  'platform_test_suite_runs_tenant_suite_agent_fk',
  'platform_plugin_catalog_pkey',
  'platform_plugin_catalog_tenant_name_version_key',
  'platform_plugin_catalog_status_check',
  'platform_plugin_catalog_manifest_identity_check',
  'platform_knowledge_sources_pkey',
  'platform_knowledge_sources_tenant_identity_key',
  'platform_knowledge_sources_status_check',
  'platform_knowledge_sources_secret_metadata_check',
  'platform_release_candidates_pkey',
  'platform_release_candidates_identity_key',
  'platform_release_candidates_status_check',
  'platform_release_candidates_gates_check',
  'platform_release_candidates_digest_check',
  'platform_release_candidates_validation_actor_check',
  'audit_evidence_checkpoints_pkey',
  'audit_evidence_checkpoints_identity_key',
  'audit_evidence_checkpoints_filters_check',
  'audit_evidence_checkpoints_event_ids_check',
  'audit_evidence_checkpoints_event_count_check',
  'audit_evidence_checkpoints_count_matches_ids_check',
  'audit_evidence_checkpoints_digest_check',
  'audit_evidence_checkpoints_status_check',
  'audit_evidence_checkpoints_created_by_check',
  'audit_evidence_checkpoints_updated_by_check',
  'runtime_approvals_pkey',
  'runtime_approvals_execution_count_check',
  'runtime_approvals_reservation_generation_check',
  'runtime_approvals_used_reservation_ids_check',
  'runtime_approvals_revision_check',
  'operational_executions_approval_binding',
  'operational_executions_waiting_approval_id',
  'operational_executions_success_payload',
  'operational_executions_failure_payload',
  'operational_executions_retry_failure_kind',
  'operational_executions_cancel_failure_kind',
  'operational_executions_inactive_lease_clear',
  'operational_executions_completed_timestamp_shape',
  // AUD19-005: tenant-scoped tables added by migrations 0012-0020, verified
  // against the live catalog (exact names, including PG-truncated FK names).
  'channel_effect_journal_pkey',
  'channel_effect_journal_operation_kind_check',
  'channel_effect_journal_state_check',
  'channel_effect_journal_attempt_check',
  'channel_effect_journal_revision_check',
  'channel_effect_journal_lease_check',
  'channel_effect_journal_terminal_check',
  'effect_journal_pkey',
  'effect_journal_state_check',
  'effect_journal_revision_check',
  'effect_journal_confirmed_check',
  'effect_journal_reconciliation_check',
  'journey_owner_drafts_pkey',
  'journey_owner_drafts_status_check',
  'journey_owner_drafts_candidate_ids_check',
  'journey_owner_drafts_tenant_id_conversation_id_fkey',
  'journey_owner_drafts_tenant_id_session_id_fkey',
  'journey_owner_drafts_tenant_id_idempotency_key_key',
  'journey_patient_drafts_pkey',
  'journey_patient_drafts_status_check',
  'journey_patient_drafts_candidate_ids_check',
  'journey_patient_drafts_tenant_id_conversation_id_fkey',
  'journey_patient_drafts_tenant_id_session_id_fkey',
  'journey_patient_drafts_tenant_id_owner_draft_id_fkey',
  'journey_patient_drafts_tenant_id_idempotency_key_key',
  'journey_appointment_drafts_pkey',
  'journey_appointment_drafts_status_check',
  'journey_appointment_drafts_confirmation_blocked_check',
  'journey_appointment_drafts_tenant_id_conversation_id_fkey',
  'journey_appointment_drafts_tenant_id_session_id_fkey',
  'journey_appointment_drafts_tenant_id_patient_draft_id_fkey',
  'journey_appointment_drafts_tenant_id_idempotency_key_key',
  'operational_execution_steps_pkey',
  'operational_execution_steps_status_check',
  'operational_execution_steps_step_type_check',
  'operational_execution_steps_step_number_check',
  'operational_execution_steps_attempt_check',
  'operational_execution_steps_decision_type_check',
  'operational_execution_steps_tenant_id_execution_id_fkey',
  'operational_execution_checkpoints_pkey',
  'operational_execution_checkpoints_step_number_check',
  'operational_execution_checkpoints_checkpoint_version_check',
  'operational_execution_checkpoints_runtime_profile_check',
  'operational_execution_checkpoints_tenant_id_execution_id_fkey',
  'cvg_conversation_sessions_pkey',
  'cvg_conversation_sessions_status_check',
  'cvg_conversation_sessions_state_version_check',
  'cvg_conversation_sessions_working_memory_check',
  'cvg_conversation_sessions_tenant_id_conversation_id_session_key',
  'cvg_conversation_messages_pkey',
  'cvg_conversation_messages_direction_check',
  'cvg_conversation_messages_body_check',
  'cvg_conversation_messages_tenant_id_conversation_id_fkey',
  'cvg_conversation_messages_tenant_id_conversation_id_turn_id_key',
  'cvg_conversation_turns_pkey',
  'cvg_conversation_turns_status_check',
  'cvg_conversation_turns_body_check',
  'cvg_conversation_turns_response_check',
  'cvg_conversation_turns_execution_status_check',
  'cvg_conversation_turns_idempotency_key_check',
  'cvg_conversation_turns_tenant_id_conversation_id_session_i_fkey',
  'cvg_conversation_turns_tenant_id_conversation_id_turn_id_key',
  'cvg_conversation_turns_tenant_id_idempotency_key_key',
  'cvg_conversation_turns_tenant_id_message_id_key',
  'cvg_conversation_execution_claims_pkey',
  'cvg_conversation_execution_claims_status_check',
  'cvg_conversation_execution_claims_operation_key_check',
  'cvg_conversation_execution_claims_proposal_hash_check',
  'cvg_conversation_execution_claims_output_check',
  'cvg_conversation_execution_claims_response_check',
  'cvg_conversation_execution_claims_evidence_refs_check',
  'cvg_conversation_execution_claim_tenant_id_conversation_id_fkey',
  'cvg_conversation_execution_cl_tenant_id_conversation_id_tu_fkey',
  'cvg_conversation_deliveries_pkey',
  'cvg_conversation_deliveries_status_check',
  'cvg_conversation_deliveries_attempts_check',
  'cvg_conversation_deliveries_body_check',
  'cvg_conversation_deliveries_payload_hash_check',
  'cvg_conversation_deliveries_tenant_id_conversation_id_turn_fkey',
  'cvg_conversation_deliveries_tenant_id_delivery_key_key'
] as const

const tenantIsolationRequiredIndexes = [
  'idempotency_pkey',
  'idx_conversations_tenant_id',
  'idx_messages_tenant_conversation',
  'idx_messages_runtime_status',
  'idx_sessions_tenant_conversation',
  'idx_sessions_tenant_agent_version',
  'idx_agent_runs_tenant_session',
  'idx_tool_calls_tenant_run',
  'idx_approval_requests_tenant_session',
  'idx_tasks_tenant_session',
  'idx_audit_events_tenant_created',
  'uq_audit_approval_decision',
  'idx_outbox_events_tenant_status',
  'idx_outbox_events_tenant_status_available',
  'idx_outbox_events_tenant_lease',
  'idx_outbox_effects_tenant_event',
  'idx_outbox_attempts_tenant_event',
  'idx_outbox_quarantine_tenant_captured',
  'idx_platform_agents_tenant_id',
  'idx_platform_agent_versions_tenant_agent',
  'idx_platform_test_runs_tenant_created',
  'idx_platform_execution_traces_tenant_created',
  'idx_platform_capability_approvals_tenant_status',
  'idx_platform_capability_approvals_tenant_actor',
  'idx_platform_test_suites_tenant_agent',
  'idx_platform_test_suite_runs_tenant_created',
  'idx_platform_plugin_catalog_tenant_status',
  'idx_platform_knowledge_sources_tenant_status',
  'idx_platform_release_candidates_tenant_status',
  'idx_platform_release_candidates_tenant_agent',
  'idx_audit_evidence_checkpoints_tenant_status',
  'idx_audit_evidence_checkpoints_tenant_created',
  'idx_runtime_approvals_status_reservation_expires',
  'idx_runtime_approvals_operation_key',
  'uq_runtime_approvals_execution_binding',
  'idx_operational_executions_tenant_state',
  'idx_operational_executions_approval',
  'idx_operational_execution_outbox_claim',
  'idx_operational_execution_events_lookup',
  'idx_operational_execution_events_approval',
  'idx_operational_effect_journal_state',
  // AUD19-005: indexes of the tables above (exact live-catalog names).
  'channel_effect_journal_pkey',
  'idx_channel_effect_journal_lease',
  'idx_channel_effect_journal_updated',
  'effect_journal_pkey',
  'idx_effect_journal_state_expires',
  'idx_effect_journal_updated',
  'journey_owner_drafts_pkey',
  'journey_owner_drafts_tenant_id_idempotency_key_key',
  'idx_journey_owner_drafts_tenant_status',
  'idx_journey_owner_drafts_tenant_phone',
  'journey_patient_drafts_pkey',
  'journey_patient_drafts_tenant_id_idempotency_key_key',
  'idx_journey_patient_drafts_tenant_status',
  'idx_journey_patient_drafts_tenant_owner',
  'journey_appointment_drafts_pkey',
  'journey_appointment_drafts_tenant_id_idempotency_key_key',
  'idx_journey_appointment_drafts_tenant_status',
  'operational_execution_steps_pkey',
  'idx_operational_execution_steps_lookup',
  'operational_execution_checkpoints_pkey',
  'cvg_conversation_sessions_pkey',
  'cvg_conversation_sessions_tenant_id_conversation_id_session_key',
  'cvg_conversation_messages_pkey',
  'cvg_conversation_messages_tenant_id_conversation_id_turn_id_key',
  'idx_cvg_conversation_messages_scope',
  'cvg_conversation_turns_pkey',
  'cvg_conversation_turns_tenant_id_conversation_id_turn_id_key',
  'cvg_conversation_turns_tenant_id_idempotency_key_key',
  'cvg_conversation_turns_tenant_id_message_id_key',
  'idx_cvg_conversation_turns_scope',
  'cvg_conversation_execution_claims_pkey',
  'idx_cvg_conversation_execution_status',
  'cvg_conversation_deliveries_pkey',
  'cvg_conversation_deliveries_tenant_id_delivery_key_key',
  'idx_cvg_conversation_deliveries_status'
] as const

export async function assertTenantIsolationMigrationState(
  client: PostgresQueryable
): Promise<void> {
  const applied = await client.query<{
    version: string
    checksum: string | null
    applied_at: Date
    baseline_actor: string | null
    baseline_reference: string | null
    baseline_at: Date | null
  }>(
    `SELECT version, checksum, applied_at, baseline_actor, baseline_reference, baseline_at
     FROM schema_migrations
     WHERE version = ANY($1::text[])`,
    [tenantIsolationMigrationVersions]
  )
  const appliedByVersion = new Map(
    applied.rows.map((migration) => [migration.version, migration])
  )
  let previousAppliedAt = 0
  for (const version of tenantIsolationMigrationVersions) {
    const migration = appliedByVersion.get(version)
    const sql = await readPostgresMigrationSql(version)
    const expectedChecksum = createHash('sha256').update(sql).digest('hex')
    const appliedAt = migration?.applied_at
      ? new Date(migration.applied_at).getTime()
      : Number.NaN
    const baselineFields = migration
      ? [
          migration.baseline_actor,
          migration.baseline_reference,
          migration.baseline_at
        ]
      : []
    const baselineIsPartial =
      baselineFields.some((field) => field !== null && field !== undefined) &&
      baselineFields.some((field) => field === null || field === undefined)
    if (
      !migration ||
      migration.checksum !== expectedChecksum ||
      !Number.isFinite(appliedAt) ||
      appliedAt < previousAppliedAt ||
      baselineIsPartial
    ) {
      throw new Error(
        `PostgreSQL tenant-isolation migration state is not verified: ${version}`
      )
    }
    previousAppliedAt = appliedAt
  }
}

export async function assertApprovalDecisionAuditDedupe(
  client: PostgresQueryable
): Promise<void> {
  const result = await client.query<{
    index_name: string
    table_name: string
    indisunique: boolean
    indisvalid: boolean
    indisready: boolean
    indnkeyatts: number
    indnatts: number
    expressions: string | null
    predicate: string | null
  }>(
    `SELECT index_relation.relname AS index_name,
            table_relation.relname AS table_name,
            index_data.indisunique,
            index_data.indisvalid,
            index_data.indisready,
            index_data.indnkeyatts,
            index_data.indnatts,
            pg_get_expr(index_data.indexprs, index_data.indrelid) AS expressions,
            pg_get_expr(index_data.indpred, index_data.indrelid) AS predicate
     FROM pg_index AS index_data
     INNER JOIN pg_class AS index_relation
       ON index_relation.oid = index_data.indexrelid
     INNER JOIN pg_class AS table_relation
       ON table_relation.oid = index_data.indrelid
     INNER JOIN pg_namespace AS index_namespace
       ON index_namespace.oid = index_relation.relnamespace
     WHERE index_namespace.nspname = current_schema()
       AND index_relation.relname = ANY($1::text[])`,
    [approvalDecisionDedupeIndexes]
  )
  const index = result.rows.find(
    (candidate) => candidate.index_name === 'uq_audit_approval_decision'
  )
  const expressions = normalizeCatalogExpression(index?.expressions ?? null)
  const predicate = normalizeCatalogExpression(index?.predicate ?? null)
  const expectedExpressions =
    "COALESCE(tenant_id, ''), (payload ->> 'approvalId'), (payload ->> 'decision')"
  const expectedPredicate = "type = 'approval_decision'"
  if (
    !index ||
    index.table_name !== 'audit_events' ||
    !index.indisunique ||
    !index.indisvalid ||
    !index.indisready ||
    index.indnkeyatts !== 3 ||
    index.indnatts !== 3 ||
    expressions !== expectedExpressions ||
    predicate !== expectedPredicate
  ) {
    throw new Error(
      'PostgreSQL approval decision dedupe index is absent or not fully valid'
    )
  }
}

export async function assertTenantIsolationSchema(
  client: PostgresQueryable
): Promise<void> {
  const policyTables = [...tenantIsolationTables, 'outbox_quarantine'] as const
  const tables = await client.query<{
    relname: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>(
    `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [policyTables]
  )
  const relationByName = new Map(
    tables.rows.map((table) => [table.relname, table])
  )
  const policies = await client.query<{
    tablename: string
    policyname: string
    permissive: string
    roles: string
    cmd: string
    qual: string | null
    with_check: string | null
  }>(
    `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies
     WHERE schemaname = current_schema()
       AND tablename = ANY($1::text[])`,
    [policyTables]
  )
  const policiesByTable = new Map<string, typeof policies.rows>()
  for (const policy of policies.rows) {
    const tablePolicies = policiesByTable.get(policy.tablename) ?? []
    policiesByTable.set(policy.tablename, [...tablePolicies, policy])
  }
  const expectedExpression =
    "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
  const expectedTenantOnlyExpression =
    "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"

  for (const table of policyTables) {
    const relation = relationByName.get(table)
    const tablePolicies = policiesByTable.get(table) ?? []
    const policy = tablePolicies[0]
    // AUD19-005: the tenant-only exception is derived from the canonical
    // inventory, not a hardcoded table list.
    const tenantOnly =
      TENANT_ONLY_TABLES.has(table) || table === 'outbox_quarantine'
    if (
      !relation ||
      !relation.relrowsecurity ||
      !relation.relforcerowsecurity ||
      tablePolicies.length !== 1 ||
      !policy ||
      policy.policyname !== `${table}_tenant_isolation` ||
      policy.permissive !== 'PERMISSIVE' ||
      policy.roles !== '{public}' ||
      policy.cmd !== 'ALL' ||
      normalizePolicyExpression(policy.qual) !==
        (tenantOnly ? expectedTenantOnlyExpression : expectedExpression) ||
      normalizePolicyExpression(policy.with_check) !==
        (tenantOnly ? expectedTenantOnlyExpression : expectedExpression)
    ) {
      throw new Error(
        'PostgreSQL tenant isolation policies are not fully installed'
      )
    }
  }

  const columns = await client.query<{
    table_name: string
    column_name: string
  }>(
    `SELECT c.relname AS table_name, a.attname AS column_name
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     INNER JOIN pg_attribute AS a ON a.attrelid = c.oid
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])
       AND a.attname = ANY($2::text[])
       AND a.attnum > 0
       AND NOT a.attisdropped`,
    [
      policyTables,
      [
        'tenant_id',
        'tenant_isolation_quarantined',
        'agent_id',
        'agent_version_id',
        'payload_protection_version',
        'result_protection_version'
      ]
    ]
  )
  const columnsByTable = new Map<string, Set<string>>()
  for (const column of columns.rows) {
    const tableColumns = columnsByTable.get(column.table_name) ?? new Set()
    tableColumns.add(column.column_name)
    columnsByTable.set(column.table_name, tableColumns)
  }
  const missingColumns = policyTables.filter((table) => {
    const tableColumns = columnsByTable.get(table)
    // AUD19-005: tenant-only tables carry no quarantine column (inventory).
    const requiresQuarantine =
      !TENANT_ONLY_TABLES.has(table) && table !== 'outbox_quarantine'
    return (
      !tableColumns?.has('tenant_id') ||
      (requiresQuarantine && !tableColumns.has('tenant_isolation_quarantined'))
    )
  })
  if (missingColumns.length > 0) {
    throw new Error(
      `PostgreSQL tenant isolation columns are incomplete: ${missingColumns.join(', ')}`
    )
  }
  const sessionColumns = columnsByTable.get('sessions')
  if (
    !sessionColumns?.has('agent_id') ||
    !sessionColumns.has('agent_version_id')
  ) {
    throw new Error('PostgreSQL session version pinning columns are incomplete')
  }
  const outboxEventsColumns = columnsByTable.get('outbox_events')
  const outboxEffectsColumns = columnsByTable.get('outbox_effects')
  if (
    !outboxEventsColumns?.has('payload_protection_version') ||
    !outboxEffectsColumns?.has('result_protection_version')
  ) {
    throw new Error(
      'PostgreSQL outbox payload protection columns are incomplete'
    )
  }

  const constraints = await client.query<{ conname: string }>(
    `SELECT conname
     FROM pg_constraint
     WHERE connamespace = current_schema()::regnamespace
       AND conname = ANY($1::text[])`,
    [tenantIsolationRequiredConstraints]
  )
  const constraintNames = new Set(
    constraints.rows.map((constraint) => constraint.conname)
  )
  const missingConstraints = tenantIsolationRequiredConstraints.filter(
    (constraint) => !constraintNames.has(constraint)
  )
  if (missingConstraints.length > 0) {
    throw new Error(
      `PostgreSQL tenant isolation constraints are incomplete: ${missingConstraints.join(', ')}`
    )
  }

  const indexes = await client.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = ANY($1::text[])`,
    [tenantIsolationRequiredIndexes]
  )
  const indexNames = new Set(indexes.rows.map((index) => index.indexname))
  const missingIndexes = tenantIsolationRequiredIndexes.filter(
    (index) => !indexNames.has(index)
  )
  if (missingIndexes.length > 0) {
    throw new Error(
      `PostgreSQL tenant isolation indexes are incomplete: ${missingIndexes.join(', ')}`
    )
  }
  await assertApprovalDecisionAuditDedupe(client)
}

export async function assertWebhookReplaySchema(
  client: PostgresQueryable
): Promise<void> {
  const requiredConstraints = [
    'webhook_replay_events_pkey',
    'webhook_replay_events_event_key_check',
    'webhook_replay_events_status_check',
    'webhook_replay_events_lease_generation_check',
    'webhook_replay_events_fencing_check'
  ]
  const requiredIndexes = [
    'webhook_replay_events_pkey',
    'idx_webhook_replay_events_expires'
  ]
  const relation = await client.query<{
    relname: string
    relkind: string
  }>(
    `SELECT c.relname, c.relkind
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [webhookReplayTables]
  )
  const columns = await client.query<{
    table_name: string
    column_name: string
  }>(
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])`,
    [webhookReplayTables]
  )
  const columnNames = new Set(columns.rows.map((row) => row.column_name))
  const constraints = await client.query<{ conname: string }>(
    `SELECT conname
     FROM pg_constraint
     WHERE connamespace = current_schema()::regnamespace
       AND conname = ANY($1::text[])`,
    [requiredConstraints]
  )
  const indexes = await client.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = ANY($1::text[])`,
    [requiredIndexes]
  )
  const constraintNames = new Set(
    constraints.rows.map((constraint) => constraint.conname)
  )
  const indexNames = new Set(indexes.rows.map((index) => index.indexname))
  if (
    relation.rows.length !== webhookReplayTables.length ||
    relation.rows[0]?.relkind !== 'r' ||
    ![
      'event_key',
      'status',
      'expires_at',
      'lease_generation',
      'lease_token'
    ].every((column) => columnNames.has(column)) ||
    requiredConstraints.some(
      (constraint) => !constraintNames.has(constraint)
    ) ||
    requiredIndexes.some((index) => !indexNames.has(index))
  ) {
    throw new Error('PostgreSQL webhook replay storage is not fully installed')
  }
}

export async function assertRateLimitSchema(
  client: PostgresQueryable
): Promise<void> {
  const relation = await client.query<{
    relname: string
    relkind: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>(
    `SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [rateLimitTables]
  )
  const columns = await client.query<{
    table_name: string
    column_name: string
  }>(
    `SELECT c.relname AS table_name, a.attname AS column_name
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     INNER JOIN pg_attribute AS a ON a.attrelid = c.oid
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])
       AND a.attname = ANY($2::text[])
       AND a.attnum > 0
       AND NOT a.attisdropped`,
    [
      rateLimitTables,
      [...rateLimitRequiredColumns, ...rateLimitForbiddenColumns]
    ]
  )
  const constraints = await client.query<{ conname: string }>(
    `SELECT conname
     FROM pg_constraint
     WHERE connamespace = current_schema()::regnamespace
       AND conname = ANY($1::text[])`,
    [rateLimitRequiredConstraints]
  )
  const indexes = await client.query<{ indexname: string }>(
    `SELECT indexname
     FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = ANY($1::text[])`,
    [rateLimitRequiredIndexes]
  )
  const table = relation.rows[0]
  const columnNames = new Set(columns.rows.map((column) => column.column_name))
  const constraintNames = new Set(
    constraints.rows.map((constraint) => constraint.conname)
  )
  const indexNames = new Set(indexes.rows.map((index) => index.indexname))
  const missingColumns = rateLimitRequiredColumns.filter(
    (column) => !columnNames.has(column)
  )
  const missingConstraints = rateLimitRequiredConstraints.filter(
    (constraint) => !constraintNames.has(constraint)
  )
  const missingIndexes = rateLimitRequiredIndexes.filter(
    (index) => !indexNames.has(index)
  )
  const legacyPlaintextKeyPresent = rateLimitForbiddenColumns.some((column) =>
    columnNames.has(column)
  )
  if (
    relation.rows.length !== rateLimitTables.length ||
    table?.relkind !== 'r' ||
    table?.relrowsecurity ||
    table?.relforcerowsecurity ||
    missingColumns.length > 0 ||
    missingConstraints.length > 0 ||
    missingIndexes.length > 0 ||
    legacyPlaintextKeyPresent
  ) {
    const missing = [
      ...(!table || table.relkind !== 'r' ? ['table'] : []),
      ...(table?.relrowsecurity || table?.relforcerowsecurity
        ? ['non-RLS table']
        : []),
      ...(legacyPlaintextKeyPresent ? ['legacy plaintext key column'] : []),
      ...missingColumns.map((column) => `column:${column}`),
      ...missingConstraints.map((constraint) => `constraint:${constraint}`),
      ...missingIndexes.map((index) => `index:${index}`)
    ]
    throw new Error(
      `PostgreSQL rate-limit storage is not fully installed${
        missing.length > 0 ? `: ${missing.join(', ')}` : ''
      }`
    )
  }
}

function normalizePolicyExpression(expression: string | null): string {
  return (expression ?? '')
    .replace(/::text/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\((tenant_isolation_quarantined = false)\)/g, '$1')
    .replace(
      /\((tenant_id = NULLIF\(current_setting\('cvg\.tenant_id', true\), ''\))\)/g,
      '$1'
    )
    .replace(/^\((.*)\)$/, '$1')
}

function normalizeCatalogExpression(expression: string | null): string {
  return (expression ?? '')
    .replace(/::text/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\((.*)\)$/, '$1')
}

export async function assertRuntimeRoleIsLeastPrivilege(
  client: PostgresQueryable,
  migrationRoleName?: string
): Promise<void> {
  const roleResult = await client.query<{
    rolname: string
    rolsuper: boolean
    rolbypassrls: boolean
    rolcreatedb: boolean
    rolcreaterole: boolean
    rolreplication: boolean
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
     FROM pg_roles
     WHERE rolname = current_user
     LIMIT 1`
  )
  const role = roleResult.rows[0]
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolname === migrationRoleName
  ) {
    throw new Error(
      'PostgreSQL runtime role must satisfy least-privilege separation'
    )
  }

  const memberships = await client.query<{ granted_role: string }>(
    `WITH RECURSIVE inherited_roles(role_oid) AS (
       SELECT oid
       FROM pg_roles
       WHERE rolname = current_user
       UNION
       SELECT membership.roleid
       FROM pg_auth_members AS membership
       INNER JOIN inherited_roles AS parent ON parent.role_oid = membership.member
     )
     SELECT granted.rolname AS granted_role
     FROM inherited_roles
     INNER JOIN pg_roles AS granted ON granted.oid = inherited_roles.role_oid
     WHERE granted.rolname <> current_user`
  )
  const tablePrivileges = await client.query<{
    relname: string
    owner: string
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    can_delete: boolean
    can_truncate: boolean
    can_trigger: boolean
    can_references: boolean
  }>(
    `SELECT c.relname,
            pg_get_userbyid(c.relowner) AS owner,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'SELECT') AS can_select,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'INSERT') AS can_insert,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'UPDATE') AS can_update,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'DELETE') AS can_delete,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRUNCATE') AS can_truncate,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRIGGER') AS can_trigger,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'REFERENCES') AS can_references
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [tenantIsolationTables]
  )
  const schemaPrivilege = await client.query<{ can_create: boolean }>(
    `SELECT has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create`
  )
  const quarantinePrivilege = await client.query<{
    owner: string
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    can_delete: boolean
    can_truncate: boolean
  }>(
    `SELECT pg_get_userbyid(c.relowner) AS owner,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'SELECT') AS can_select,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'INSERT') AS can_insert,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'UPDATE') AS can_update,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'DELETE') AS can_delete,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRUNCATE') AS can_truncate
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [tenantIsolationQuarantineTables]
  )
  const replayPrivileges = await client.query<{
    owner: string
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    can_delete: boolean
    can_truncate: boolean
    can_trigger: boolean
    can_references: boolean
  }>(
    `SELECT pg_get_userbyid(c.relowner) AS owner,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'SELECT') AS can_select,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'INSERT') AS can_insert,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'UPDATE') AS can_update,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'DELETE') AS can_delete,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRUNCATE') AS can_truncate,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRIGGER') AS can_trigger,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'REFERENCES') AS can_references
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [webhookReplayTables]
  )
  const rateLimitPrivileges = await client.query<{
    owner: string
    can_select: boolean
    can_insert: boolean
    can_update: boolean
    can_delete: boolean
    can_truncate: boolean
    can_trigger: boolean
    can_references: boolean
  }>(
    `SELECT pg_get_userbyid(c.relowner) AS owner,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'SELECT') AS can_select,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'INSERT') AS can_insert,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'UPDATE') AS can_update,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'DELETE') AS can_delete,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRUNCATE') AS can_truncate,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'TRIGGER') AS can_trigger,
            has_table_privilege(current_user, format('%I.%I', n.nspname, c.relname), 'REFERENCES') AS can_references
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [rateLimitTables]
  )
  if (
    tablePrivileges.rows.length !== tenantIsolationTables.length ||
    tablePrivileges.rows.some(
      (table) =>
        table.owner === role.rolname ||
        !table.can_select ||
        !table.can_insert ||
        !table.can_update ||
        table.can_delete ||
        table.can_truncate ||
        table.can_trigger ||
        table.can_references
    ) ||
    memberships.rows.length > 0 ||
    schemaPrivilege.rows[0]?.can_create ||
    quarantinePrivilege.rows.length !==
      tenantIsolationQuarantineTables.length ||
    quarantinePrivilege.rows.some(
      (table) =>
        table.owner === role.rolname ||
        table.can_select ||
        table.can_insert ||
        table.can_update ||
        table.can_delete ||
        table.can_truncate
    ) ||
    replayPrivileges.rows.length !== webhookReplayTables.length ||
    replayPrivileges.rows.some(
      (table) =>
        table.owner === role.rolname ||
        !table.can_select ||
        !table.can_insert ||
        !table.can_update ||
        !table.can_delete ||
        table.can_truncate ||
        table.can_trigger ||
        table.can_references
    ) ||
    rateLimitPrivileges.rows.length !== rateLimitTables.length ||
    rateLimitPrivileges.rows.some(
      (table) =>
        table.owner === role.rolname ||
        !table.can_select ||
        !table.can_insert ||
        !table.can_update ||
        !table.can_delete ||
        table.can_truncate ||
        table.can_trigger ||
        table.can_references
    )
  ) {
    throw new Error(
      'PostgreSQL runtime role must satisfy least-privilege separation'
    )
  }
}

export async function assertMigrationRoleIsLeastPrivilege(
  client: PostgresQueryable,
  runtimeRoleName?: string
): Promise<void> {
  const roleResult = await client.query<{
    rolname: string
    rolsuper: boolean
    rolbypassrls: boolean
    rolcreatedb: boolean
    rolcreaterole: boolean
    rolreplication: boolean
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
     FROM pg_roles
     WHERE rolname = current_user
     LIMIT 1`
  )
  const role = roleResult.rows[0]
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolname === runtimeRoleName
  ) {
    throw new Error(
      'PostgreSQL migration role must be a separate non-privileged DDL owner'
    )
  }

  const memberships = await client.query<{ granted_role: string }>(
    `SELECT granted.rolname AS granted_role
     FROM pg_auth_members AS membership
     INNER JOIN pg_roles AS member ON member.oid = membership.member
     INNER JOIN pg_roles AS granted ON granted.oid = membership.roleid
     WHERE member.rolname = current_user`
  )
  const databaseOwner = await client.query<{ owner: string }>(
    `SELECT pg_get_userbyid(datdba) AS owner
     FROM pg_database
     WHERE datname = current_database()`
  )
  const schemaPrivilege = await client.query<{
    can_usage: boolean
    can_create: boolean
  }>(
    `SELECT has_schema_privilege(current_user, current_schema(), 'USAGE') AS can_usage,
            has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create`
  )
  const managedTables = await client.query<{
    relname: string
    owner: string
  }>(
    `SELECT c.relname, pg_get_userbyid(c.relowner) AS owner
     FROM pg_class AS c
     INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
     WHERE n.nspname = current_schema()
       AND c.relname = ANY($1::text[])`,
    [tenantIsolationMigrationTables]
  )
  if (
    memberships.rows.length > 0 ||
    databaseOwner.rows[0]?.owner === role.rolname ||
    !schemaPrivilege.rows[0]?.can_usage ||
    !schemaPrivilege.rows[0]?.can_create ||
    managedTables.rows.length !== tenantIsolationMigrationTables.length ||
    managedTables.rows.some((table) => table.owner !== role.rolname)
  ) {
    throw new Error(
      'PostgreSQL migration role must be a separate non-privileged DDL owner'
    )
  }
}

export async function assertMigrationRoleSecurityBoundary(
  client: PostgresQueryable,
  runtimeRoleName?: string
): Promise<void> {
  const roleResult = await client.query<{
    rolname: string
    rolsuper: boolean
    rolbypassrls: boolean
    rolcreatedb: boolean
    rolcreaterole: boolean
    rolreplication: boolean
  }>(
    `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication
     FROM pg_roles
     WHERE rolname = current_user
     LIMIT 1`
  )
  const role = roleResult.rows[0]
  const memberships = await client.query(
    `SELECT granted.rolname AS granted_role
     FROM pg_auth_members AS membership
     INNER JOIN pg_roles AS member ON member.oid = membership.member
     INNER JOIN pg_roles AS granted ON granted.oid = membership.roleid
     WHERE member.rolname = current_user`
  )
  const databaseOwner = await client.query<{ owner: string }>(
    `SELECT pg_get_userbyid(datdba) AS owner
     FROM pg_database
     WHERE datname = current_database()`
  )
  if (
    !role ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreatedb ||
    role.rolcreaterole ||
    role.rolreplication ||
    role.rolname === runtimeRoleName ||
    memberships.rows.length > 0 ||
    databaseOwner.rows[0]?.owner === role.rolname
  ) {
    throw new Error(
      'PostgreSQL migration role must be a separate non-privileged DDL owner'
    )
  }
}

export async function readCurrentDatabaseRole(
  client: PostgresQueryable
): Promise<string> {
  const result = await client.query<{ role_name: string }>(
    `SELECT current_user::text AS role_name`
  )
  const roleName = result.rows[0]?.role_name
  if (!roleName) {
    throw new Error('PostgreSQL current role could not be identified')
  }
  return roleName
}

export async function assertRuntimeRoleIsNotRlsBypass(
  client: PostgresQueryable
): Promise<void> {
  const result = await client.query<{
    rolsuper: boolean
    rolbypassrls: boolean
  }>(
    `SELECT rolsuper, rolbypassrls
     FROM pg_roles
     WHERE rolname = current_user
     LIMIT 1`
  )
  const role = result.rows[0]
  if (!role || role.rolsuper || role.rolbypassrls) {
    throw new Error(
      'PostgreSQL runtime role must be a non-superuser without BYPASSRLS'
    )
  }
}
