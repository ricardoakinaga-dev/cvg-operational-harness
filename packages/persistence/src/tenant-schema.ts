/**
 * AUD19-005 — canonical tenant-scoped schema inventory.
 *
 * Single authority for "which tables carry tenant isolation". The API
 * startup preflight consumes this inventory instead of a hardcoded list, so
 * removing any tenant-scoped table, policy or grant from the catalog fails
 * the preflight. Add new tenant-scoped tables here AND in their migration;
 * the closed-world test (`tenant-schema-inventory-postgres`) proves the two
 * stay in sync against a live migrated catalog.
 */
export type TenantIsolationExpression = 'quarantined' | 'tenant-only'

export interface TenantScopedTable {
  readonly table: string
  /** Exact RLS policy name the preflight requires. */
  readonly policy: string
  /**
   * `quarantined`: policy also requires `tenant_isolation_quarantined =
   * false` and the column must exist. `tenant-only`: tenant equality alone.
   */
  readonly expression: TenantIsolationExpression
}

function entry(
  table: string,
  expression: TenantIsolationExpression = 'quarantined'
): TenantScopedTable {
  return { table, policy: `${table}_tenant_isolation`, expression }
}

export const TENANT_SCHEMA_INVENTORY: readonly TenantScopedTable[] = [
  entry('conversations'),
  entry('messages'),
  entry('sessions'),
  entry('agent_runs'),
  entry('tool_calls'),
  entry('approval_requests'),
  entry('tasks'),
  entry('audit_events'),
  entry('idempotency'),
  entry('outbox_events'),
  entry('outbox_effects', 'tenant-only'),
  entry('outbox_attempts', 'tenant-only'),
  entry('platform_agents'),
  entry('platform_agent_versions'),
  entry('platform_test_runs'),
  entry('platform_execution_traces'),
  entry('platform_capability_approvals'),
  entry('platform_test_suites'),
  entry('platform_test_suite_runs'),
  entry('platform_plugin_catalog'),
  entry('platform_knowledge_sources'),
  entry('platform_release_candidates'),
  entry('audit_evidence_checkpoints'),
  entry('runtime_approvals', 'tenant-only'),
  entry('operational_executions'),
  entry('operational_execution_outbox'),
  entry('operational_execution_events'),
  entry('operational_effect_journal'),
  // AUD19-005: tables below were tenant-scoped by their migrations but
  // invisible to the startup preflight.
  entry('channel_effect_journal', 'tenant-only'),
  entry('effect_journal', 'tenant-only'),
  entry('journey_owner_drafts', 'tenant-only'),
  entry('journey_patient_drafts', 'tenant-only'),
  entry('journey_appointment_drafts', 'tenant-only'),
  entry('operational_execution_steps'),
  entry('operational_execution_checkpoints'),
  entry('cvg_conversation_sessions'),
  entry('cvg_conversation_messages'),
  entry('cvg_conversation_turns'),
  entry('cvg_conversation_execution_claims'),
  entry('cvg_conversation_deliveries'),
  // PROD-0373: worker liveness and the kernel pause switch.
  entry('worker_heartbeats', 'tenant-only'),
  entry('kernel_pause_switches', 'tenant-only')
]

export const TENANT_SCHEMA_TABLES: readonly string[] =
  TENANT_SCHEMA_INVENTORY.map((item) => item.table)

export const TENANT_ONLY_TABLES: ReadonlySet<string> = new Set(
  TENANT_SCHEMA_INVENTORY.filter(
    (item) => item.expression === 'tenant-only'
  ).map((item) => item.table)
)
