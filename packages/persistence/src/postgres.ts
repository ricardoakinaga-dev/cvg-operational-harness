import {
  assertApprovalCreation,
  validateAttendanceDecision,
  attendanceDecisionAudit,
  type AttendanceApprovalDecision
} from './attendance-approval.ts'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainError,
  IdempotencyKeySchema,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  sanitizeOutboxError,
  sanitizeOutboxPayload,
  type Channel,
  type TaskPriority,
  type TaskStatus
} from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TenantIdSchema,
  sanitizeTraceForPersistence,
  TraceIdSchema,
  type AgentId,
  type AgentVersionId,
  type PluginAuditEvent,
  type TestRunTrace,
  transitionHumanTakeover,
  type HumanTakeoverEvent,
  type HumanTakeoverState,
  type TenantId
} from '@cvg/platform'
import type { QueryResult, QueryResultRow } from 'pg'
import {
  auditEventMatches,
  summarizeAuditEvents
} from './repositories/audit-repository.ts'
import {
  AuditEvidenceCheckpointActorIdSchema,
  AuditEvidenceCheckpointCreateInputSchema,
  AuditEvidenceCheckpointFiltersSchema,
  AuditEvidenceCheckpointIdSchema,
  AuditEvidenceCheckpointStatusSchema,
  cloneAuditEvidenceCheckpoint,
  computeAuditEvidenceCheckpointDigest,
  createAuditEvidenceCheckpointId,
  normalizeAuditEvidenceCheckpointFilters,
  type AuditEvidenceCheckpointCreateInput,
  type AuditEvidenceCheckpointRecord,
  type AuditEvidenceCheckpointStatus
} from './audit-evidence-checkpoint.ts'
import type {
  ApprovalRequestRecord,
  AuditEventRecord,
  AuditEvidenceFilters,
  AuditEvidencePage,
  AuditEvidenceQuery,
  AuditEvidenceSummary,
  ConversationListItem,
  ConversationPage,
  ConversationRecord,
  InboundRuntimeContext,
  MessageRecord,
  PaginationInput,
  OutboxEventRecord,
  SessionRecord,
  TaskRecord
} from './schema.ts'
import {
  DEFAULT_OUTBOX_LEASE_MS,
  DEFAULT_OUTBOX_MAX_ATTEMPTS,
  DEFAULT_OUTBOX_RETRY_BASE_MS,
  DEFAULT_OUTBOX_RETRY_MAX_MS,
  OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
  type OutboxAckInput as MemoryOutboxAckInput,
  type OutboxClaimInput,
  type OutboxEnqueueInput as MemoryOutboxEnqueueInput,
  type OutboxFailInput,
  type OutboxRequeueInput as MemoryOutboxRequeueInput,
  type OutboxTakeoverCheck
} from './outbox.ts'
import { createSenderRefFingerprint } from './sender-fingerprint.ts'

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
  '0019_iterative_execution_steps'
]

export interface PostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>
}

/**
 * A checked-out pool connection is required for approval transactions. A
 * `pg.Pool` also exposes `query`, but it may route each statement to a
 * different connection and therefore cannot safely carry BEGIN/COMMIT.
 */
export interface PostgresTransactionClient extends PostgresQueryable {
  release(error?: Error): void
}

export interface PostgresRuntimeRepositoryOptions {
  tenantIsolation?: boolean
  /** Repository-owned clock; callers cannot override lease/retry decisions. */
  clock?: () => Date
}

export interface InboundRuntimeCompletionInput {
  tenantId: TenantId
  conversationId: string
  sessionId: string | null
  inboundMessageId: string
  trace: TestRunTrace
  toolAuditEvents: PluginAuditEvent[]
  correlationId: string
}

export type DurableOutboxStatus = OutboxEventRecord['status']

export type DurableOutboxEventRecord = OutboxEventRecord & {
  tenantId: TenantId
  correlationId: string
  idempotencyKey: string
  envelopeVersion: number
  conversationId: string | null
  sessionId: string | null
  agentId: string | null
  agentVersionId: string | null
  inboundMessageId: string | null
  availableAt: Date
  attempts: number
  leaseOwner: string | null
  leaseUntil: Date | null
  lastError: string | null
  processedAt: Date | null
  deadLetteredAt: Date | null
  parentEventId: string | null
}

export type PostgresOutboxEnqueueInput = MemoryOutboxEnqueueInput & {
  /** Optional deterministic values are used by PostgreSQL integration tests. */
  createdAt?: Date
  availableAt?: Date
}

export type PostgresOutboxAckInput = Omit<MemoryOutboxAckInput, 'effect'> & {
  effect?: MemoryOutboxAckInput['effect']
}

export type PostgresOutboxRequeueInput = MemoryOutboxRequeueInput & {
  now?: Date
}

export const OUTBOX_MAX_ATTEMPTS = DEFAULT_OUTBOX_MAX_ATTEMPTS
export const OUTBOX_DEFAULT_LEASE_MS = DEFAULT_OUTBOX_LEASE_MS
export const OUTBOX_BASE_BACKOFF_MS = DEFAULT_OUTBOX_RETRY_BASE_MS
export const OUTBOX_MAX_BACKOFF_MS = DEFAULT_OUTBOX_RETRY_MAX_MS
const OUTBOX_MAX_PAYLOAD_BYTES = 256 * 1024
const SAFE_LEGACY_OUTBOX_ERRORS = new Set([
  'legacy_outbox_missing_tenant',
  'legacy_inbound_missing_runtime_identifiers',
  'legacy_outbox_event_type_not_controlled',
  'legacy_outbox_quarantined',
  'legacy_processed_without_effect_journal',
  'legacy_failed_without_retry_time'
])

const outboxSelectColumns = `
  id, tenant_id, type, envelope_version, correlation_id, idempotency_key,
  conversation_id, session_id, agent_id, agent_version_id,
  inbound_message_id, payload, status, created_at, available_at, attempts,
  lease_owner, lease_until, last_error, processed_at, dead_lettered_at,
  parent_event_id`

interface DurableOutboxRow {
  id: string
  tenant_id: TenantId
  type: string
  envelope_version: number
  correlation_id: string
  idempotency_key: string
  conversation_id: string | null
  session_id: string | null
  agent_id: string | null
  agent_version_id: string | null
  inbound_message_id: string | null
  payload: unknown
  status: DurableOutboxStatus
  created_at: Date
  available_at: Date
  attempts: number
  lease_owner: string | null
  lease_until: Date | null
  last_error: string | null
  processed_at: Date | null
  dead_lettered_at: Date | null
  parent_event_id: string | null
}

function assertOutboxText(value: string, label: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DomainError('validation_failed', `${label} is required`)
  }
  if (value.length > max) {
    throw new DomainError('validation_failed', `${label} is too long`)
  }
  return value
}

function assertOutboxDate(value: Date, label: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('validation_failed', `${label} is invalid`)
  }
  return value
}

function assertOutboxPayload(payload: unknown): unknown {
  if (payload === undefined) {
    throw new DomainError('validation_failed', 'Outbox payload is required')
  }
  return sanitizeAndValidateOutboxValue(payload, 'Outbox payload')
}

function assertOutboxResult(result: unknown): unknown {
  return sanitizeAndValidateOutboxValue(result ?? null, 'Outbox result')
}

function sanitizeAndValidateOutboxValue(
  value: unknown,
  label: string
): unknown {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) return null
    if (Buffer.byteLength(serialized, 'utf8') > OUTBOX_MAX_PAYLOAD_BYTES) {
      throw new DomainError('payload_too_large', `${label} is too large`)
    }
    const sanitized = sanitizeOutboxPayload(value).payload
    const sanitizedSerialized = JSON.stringify(sanitized) ?? 'null'
    if (
      Buffer.byteLength(sanitizedSerialized, 'utf8') > OUTBOX_MAX_PAYLOAD_BYTES
    ) {
      throw new DomainError(
        'payload_too_large',
        `Sanitized ${label.toLowerCase()} is too large`
      )
    }
    return sanitized
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('validation_failed', `${label} is not JSON`)
  }
}

function serializeOutboxJson(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value ?? null)
    if (serialized === undefined) return 'null'
    return serialized
  } catch {
    throw new DomainError('validation_failed', `${label} is not JSON`)
  }
}

function redactOutboxError(error: unknown): string {
  if (error === OUTBOX_TAKEOVER_SUPPRESSED_ERROR) {
    return OUTBOX_TAKEOVER_SUPPRESSED_ERROR
  }
  if (typeof error === 'string' && SAFE_LEGACY_OUTBOX_ERRORS.has(error)) {
    return error
  }
  return sanitizeOutboxError(error)
}

function createInboundIdempotencyKey(
  channel: string,
  externalMessageId: string
): string {
  const digest = createHash('sha256')
    .update(externalMessageId, 'utf8')
    .digest('hex')
  return `inbound:${channel}:sha256:${digest}`
}

async function resolveTakeoverCheck(
  value: OutboxTakeoverCheck | undefined
): Promise<boolean> {
  if (typeof value === 'function') return Boolean(await value())
  return value === true
}

function outboxDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function mapDurableOutboxRow(row: DurableOutboxRow): DurableOutboxEventRecord {
  const tenantId = TenantIdSchema.parse(row.tenant_id)
  const availableAt = outboxDate(row.available_at)
  const createdAt = outboxDate(row.created_at)
  if (!availableAt || !createdAt) {
    throw new DomainError(
      'invalid_action',
      'Outbox event timestamps are invalid'
    )
  }
  return {
    id: row.id,
    tenantId,
    type: row.type,
    envelopeVersion: row.envelope_version,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    conversationId: row.conversation_id,
    sessionId: row.session_id,
    agentId: row.agent_id,
    agentVersionId: row.agent_version_id,
    inboundMessageId: row.inbound_message_id,
    payload: sanitizeOutboxPayload(row.payload).payload,
    status: row.status,
    createdAt,
    availableAt,
    attempts: row.attempts,
    leaseOwner: row.lease_owner,
    leaseUntil: outboxDate(row.lease_until),
    lastError: row.last_error ? redactOutboxError(row.last_error) : null,
    processedAt: outboxDate(row.processed_at),
    deadLetteredAt: outboxDate(row.dead_lettered_at),
    parentEventId: row.parent_event_id
  }
}

async function withOutboxTransaction<T>(
  client: PostgresQueryable,
  operation: () => Promise<T>
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Preserve the original database or handler error.
    }
    throw error
  }
}

function validateOutboxWorker(workerId: string): string {
  return assertOutboxText(workerId, 'workerId', 120)
}

function validateOutboxEnvelopeVersion(version: number): number {
  if (!Number.isSafeInteger(version) || version < 1 || version > 100) {
    throw new DomainError(
      'validation_failed',
      'Outbox envelope version is invalid'
    )
  }
  return version
}

function validateOutboxLeaseMs(leaseMs: number): number {
  if (
    !Number.isSafeInteger(leaseMs) ||
    leaseMs < 1_000 ||
    leaseMs > 3_600_000
  ) {
    throw new DomainError(
      'validation_failed',
      'Outbox lease duration is invalid'
    )
  }
  return leaseMs
}

function outboxBackoffMs(attempt: number): number {
  return Math.min(
    OUTBOX_MAX_BACKOFF_MS,
    OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(0, Math.min(attempt - 1, 16))
  )
}

async function appendDurableOutboxAudit(
  client: PostgresQueryable,
  input: {
    tenantId: TenantId
    eventId: string
    correlationId: string
    actorId: string
    action: 'ack' | 'fail' | 'dead_letter' | 'requeue' | 'handoff'
    attempts: number
    status: DurableOutboxStatus
    error?: string | null
    sessionId?: string | null
    conversationId?: string | null
  }
): Promise<void> {
  const payload = sanitizeAuditEvidencePayload({
    tenantId: input.tenantId,
    eventId: input.eventId,
    correlationId: input.correlationId,
    action: input.action,
    attempts: input.attempts,
    status: input.status,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.error ? { error: input.error } : {})
  }).payload
  await client.query(
    `INSERT INTO audit_events
       (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
     VALUES ($1, $2, 'integration_event', $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      input.tenantId,
      createDomainId('audit'),
      input.action === 'requeue' ? 'Operator' : 'System',
      input.actorId,
      input.correlationId,
      'outbox-r2',
      JSON.stringify(payload),
      new Date()
    ]
  )
}

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

export class PostgresRuntimeRepository {
  private readonly tenantIsolation: boolean
  private readonly clock: () => Date

  constructor(
    private readonly client: PostgresQueryable,
    options: PostgresRuntimeRepositoryOptions = {}
  ) {
    this.tenantIsolation = options.tenantIsolation ?? false
    this.clock = options.clock ?? (() => new Date())
  }

  /**
   * Enqueues an event using the durable tenant/idempotency boundary. Passing
   * a transaction client lets the inbound finalizer include this insert in
   * its existing commit; otherwise this method owns a short transaction.
   */
  async enqueue(
    rawInput: PostgresOutboxEnqueueInput,
    transactionClient?: PostgresQueryable
  ): Promise<DurableOutboxEventRecord> {
    const tenantId = TenantIdSchema.parse(rawInput.tenantId)
    const type = assertOutboxText(rawInput.type, 'Outbox type', 120)
    const correlationId = rawInput.correlationId
      ? CorrelationIdSchema.parse(rawInput.correlationId)
      : createCorrelationId()
    const idempotencyKey = IdempotencyKeySchema.parse(rawInput.idempotencyKey)
    const envelopeVersion = validateOutboxEnvelopeVersion(
      rawInput.envelopeVersion ?? 1
    )
    const eventId =
      (rawInput.eventId ?? rawInput.id)
        ? assertOutboxText(rawInput.eventId ?? rawInput.id!, 'eventId', 160)
        : createDomainId('outbox')
    const payload = assertOutboxPayload(rawInput.payload)
    const createdAt = assertOutboxDate(
      rawInput.createdAt ?? this.repositoryNow(),
      'createdAt'
    )
    const availableAt = assertOutboxDate(
      rawInput.availableAt ?? createdAt,
      'availableAt'
    )
    const client = transactionClient ?? this.client
    const operation = async (): Promise<DurableOutboxEventRecord> => {
      const existing = await client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [tenantId, idempotencyKey]
      )
      if (existing.rows[0]) return mapDurableOutboxRow(existing.rows[0])

      const insert = await client.query<DurableOutboxRow>(
        `INSERT INTO outbox_events
           (id, tenant_id, type, envelope_version, correlation_id, idempotency_key,
            conversation_id, session_id, agent_id, agent_version_id,
            inbound_message_id, payload, payload_protection_version, status, created_at, available_at,
            attempts, lease_owner, lease_until, last_error, processed_at,
            dead_lettered_at, parent_event_id, tenant_isolation_quarantined)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
                 $13, 'pending', $14, $15, 0, NULL, NULL, NULL, NULL, NULL, $16, false)
         ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
         RETURNING ${outboxSelectColumns}`,
        [
          eventId,
          tenantId,
          type,
          envelopeVersion,
          correlationId,
          idempotencyKey,
          rawInput.conversationId ?? null,
          rawInput.sessionId ?? null,
          rawInput.agentId ?? null,
          rawInput.agentVersionId ?? null,
          rawInput.inboundMessageId ?? null,
          serializeOutboxJson(payload, 'Outbox payload'),
          'outbox-r6',
          createdAt,
          availableAt,
          rawInput.parentEventId ?? null
        ]
      )
      if (insert.rows[0]) return mapDurableOutboxRow(insert.rows[0])

      // A concurrent insert won the idempotency key. Read the winner in the
      // same READ COMMITTED command boundary instead of inventing a second id.
      const winner = await client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [tenantId, idempotencyKey]
      )
      if (!winner.rows[0]) {
        throw new DomainError(
          'conflict',
          'Outbox idempotency winner could not be read'
        )
      }
      return mapDurableOutboxRow(winner.rows[0])
    }
    return transactionClient
      ? operation()
      : withOutboxTransaction(this.client, operation)
  }

  async findOutboxById(
    rawTenantId: TenantId,
    eventId: string
  ): Promise<DurableOutboxEventRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const id = assertOutboxText(eventId, 'eventId', 160)
    const result = await this.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND id = $2
       LIMIT 1`,
      [tenantId, id]
    )
    return result.rows[0] ? mapDurableOutboxRow(result.rows[0]) : null
  }

  async claimNext(
    rawInput: OutboxClaimInput
  ): Promise<DurableOutboxEventRecord | null> {
    const tenantId = TenantIdSchema.parse(rawInput.tenantId)
    const workerId = validateOutboxWorker(rawInput.workerId)
    const now = this.repositoryNow()
    const leaseMs = validateOutboxLeaseMs(
      rawInput.leaseMs ?? OUTBOX_DEFAULT_LEASE_MS
    )
    const leaseUntil = new Date(now.getTime() + leaseMs)

    return withOutboxTransaction(this.client, async () => {
      const candidate = await this.client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1
           AND (
             (status = 'pending' AND available_at <= $2)
             OR (status = 'failed' AND available_at <= $2)
             OR (status = 'processing' AND lease_until <= $2)
           )
           AND ($3::text IS NULL OR id = $3)
         ORDER BY available_at ASC, created_at ASC, id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1`,
        [tenantId, now, rawInput.eventId ?? null]
      )
      const row = candidate.rows[0]
      if (!row) return null

      if (row.status === 'processing') {
        await this.client.query(
          `UPDATE outbox_attempts
           SET outcome = COALESCE(outcome, 'lease_expired'),
               error = COALESCE(error, 'outbox_error:lease_expired')
           WHERE tenant_id = $1 AND event_id = $2 AND outcome IS NULL`,
          [tenantId, row.id]
        )
      }

      const claimed = await this.client.query<DurableOutboxRow>(
        `UPDATE outbox_events
         SET status = 'processing',
             attempts = attempts + 1,
             lease_owner = $3,
             lease_until = $4,
             available_at = $2,
             last_error = NULL
         WHERE tenant_id = $1 AND id = $5
           AND (
             status = 'pending'
             OR (status = 'failed' AND available_at <= $2)
             OR (status = 'processing' AND lease_until <= $2)
           )
         RETURNING ${outboxSelectColumns}`,
        [tenantId, now, workerId, leaseUntil, row.id]
      )
      const claimedRow = claimed.rows[0]
      if (!claimedRow) return null
      await this.client.query(
        `INSERT INTO outbox_attempts
           (tenant_id, event_id, attempt, worker_id, claimed_at, outcome, error)
         VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
        [tenantId, claimedRow.id, claimedRow.attempts, workerId, now]
      )
      return mapDurableOutboxRow(claimedRow)
    })
  }

  async ack(
    rawInput: PostgresOutboxAckInput
  ): Promise<DurableOutboxEventRecord> {
    const tenantId = TenantIdSchema.parse(rawInput.tenantId)
    const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
    const workerId = validateOutboxWorker(rawInput.workerId)
    const now = this.repositoryNow()

    /**
     * Claim/ack is intentionally at-least-once. The first transaction only
     * validates ownership and observes the journal; it must commit before a
     * handler can touch the runtime repository through another pool
     * connection. The final transaction performs the compare-and-swap and
     * journals the sanitized result. Controlled handlers are idempotent, so a
     * crash between the handler and this final transaction is safe to retry.
     */
    const prepared = await withOutboxTransaction(this.client, async () => {
      const selected = await this.client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, eventId]
      )
      const event = selected.rows[0]
      if (!event)
        throw new DomainError('invalid_action', 'Outbox event not found')
      if (event.status !== 'processing' && event.status !== 'processed') {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }
      if (
        event.status === 'processing' &&
        (event.lease_owner !== workerId ||
          !event.lease_until ||
          new Date(event.lease_until).getTime() <= now.getTime())
      ) {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }

      const journal = await this.client.query<{
        result: unknown
        event_id: string
      }>(
        `SELECT result, event_id
         FROM outbox_effects
         WHERE tenant_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [tenantId, event.idempotency_key]
      )
      if (journal.rows[0] && journal.rows[0].event_id !== event.id) {
        throw new DomainError(
          'invalid_action',
          'Outbox effect journal points to another event'
        )
      }
      if (event.status === 'processed') {
        if (!journal.rows[0] || journal.rows[0].event_id !== event.id) {
          throw new DomainError(
            'invalid_action',
            'Processed outbox event has no matching effect journal'
          )
        }
        return {
          kind: 'processed' as const,
          event: mapDurableOutboxRow(event)
        }
      }
      if (
        await this.isOutboxTakeoverActive(
          tenantId,
          event,
          rawInput.takeoverActive
        )
      ) {
        return { kind: 'takeover' as const, event }
      }
      return {
        kind: 'execute' as const,
        event,
        hasJournal: Boolean(journal.rows[0]),
        journalResult: journal.rows[0]
          ? assertOutboxResult(journal.rows[0].result)
          : undefined
      }
    })

    if (prepared.kind === 'processed') return prepared.event
    if (prepared.kind === 'takeover') {
      return withOutboxTransaction(this.client, () =>
        this.suppressOutboxForTakeover(
          prepared.event,
          tenantId,
          workerId,
          this.repositoryNow()
        )
      )
    }

    let result = prepared.journalResult
    if (!prepared.hasJournal) {
      if (rawInput.effect) {
        // The handler receives only the durable event envelope. It runs after
        // the validation transaction has committed, so it may use the same
        // PostgreSQL pool for tenant-scoped finalization without deadlocking
        // on the outbox row held above.
        result = await rawInput.effect(mapDurableOutboxRow(prepared.event))
      } else if (rawInput.result !== undefined) {
        result = rawInput.result
      } else {
        throw new DomainError(
          'validation_failed',
          'A local effect or result is required before ack'
        )
      }
    }

    return withOutboxTransaction(this.client, async () => {
      const ackNow = this.repositoryNow()
      const selected = await this.client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, eventId]
      )
      const event = selected.rows[0]
      if (!event)
        throw new DomainError('invalid_action', 'Outbox event not found')
      if (event.status !== 'processing' && event.status !== 'processed') {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }
      if (
        event.status === 'processing' &&
        (event.lease_owner !== workerId ||
          !event.lease_until ||
          new Date(event.lease_until).getTime() <= ackNow.getTime())
      ) {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }

      const journal = await this.client.query<{
        result: unknown
        event_id: string
      }>(
        `SELECT result, event_id
         FROM outbox_effects
         WHERE tenant_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [tenantId, event.idempotency_key]
      )
      if (journal.rows[0] && journal.rows[0].event_id !== event.id) {
        throw new DomainError(
          'invalid_action',
          'Outbox effect journal points to another event'
        )
      }
      if (event.status === 'processed') {
        if (!journal.rows[0] || journal.rows[0].event_id !== event.id) {
          throw new DomainError(
            'invalid_action',
            'Processed outbox event has no matching effect journal'
          )
        }
        return mapDurableOutboxRow(event)
      }
      if (
        await this.isOutboxTakeoverActive(
          tenantId,
          event,
          rawInput.takeoverActive
        )
      ) {
        return this.suppressOutboxForTakeover(event, tenantId, workerId, ackNow)
      }

      if (!journal.rows[0]) {
        const safeResult = assertOutboxResult(result)
        await this.client.query(
          `INSERT INTO outbox_effects
             (tenant_id, idempotency_key, event_id, result,
              result_protection_version, applied_at)
           VALUES ($1, $2, $3, $4::jsonb, 'outbox-r6', $5)
           ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
          [
            tenantId,
            event.idempotency_key,
            event.id,
            serializeOutboxJson(safeResult, 'Outbox result'),
            ackNow
          ]
        )
      }

      const persisted = await this.client.query<{ result: unknown }>(
        `SELECT result
         FROM outbox_effects
         WHERE tenant_id = $1 AND idempotency_key = $2
         FOR UPDATE`,
        [tenantId, event.idempotency_key]
      )
      if (!persisted.rows[0]) {
        throw new DomainError(
          'invalid_action',
          'Outbox effect journal could not be persisted'
        )
      }
      const safePersistedResult = assertOutboxResult(persisted.rows[0].result)
      await this.client.query(
        `UPDATE outbox_effects
         SET result = $3::jsonb,
             result_protection_version = 'outbox-r6'
         WHERE tenant_id = $1 AND idempotency_key = $2`,
        [
          tenantId,
          event.idempotency_key,
          serializeOutboxJson(safePersistedResult, 'Outbox result')
        ]
      )

      const updated = await this.client.query<DurableOutboxRow>(
        `UPDATE outbox_events
         SET status = 'processed',
             processed_at = $3,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL,
             available_at = $3
         WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
           AND lease_owner = $4
         RETURNING ${outboxSelectColumns}`,
        [tenantId, event.id, ackNow, workerId]
      )
      const updatedRow = updated.rows[0]
      if (!updatedRow)
        throw new DomainError('conflict', 'Outbox ack lost its lease')
      await this.client.query(
        `UPDATE outbox_attempts
         SET outcome = 'processed', error = NULL
         WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
           AND outcome IS NULL`,
        [tenantId, event.id, workerId]
      )
      await appendDurableOutboxAudit(this.client, {
        tenantId,
        eventId: event.id,
        correlationId: event.correlation_id,
        actorId: workerId,
        action: 'ack',
        attempts: updatedRow.attempts,
        status: updatedRow.status
      })
      // Keep the result in the durable journal; the event record deliberately
      // does not duplicate arbitrary handler output.
      return mapDurableOutboxRow(updatedRow)
    })
  }

  async fail(rawInput: OutboxFailInput): Promise<DurableOutboxEventRecord> {
    const tenantId = TenantIdSchema.parse(rawInput.tenantId)
    const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
    const workerId = validateOutboxWorker(rawInput.workerId)
    const now = this.repositoryNow()
    const error = redactOutboxError(rawInput.error)

    return withOutboxTransaction(this.client, async () => {
      const selected = await this.client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, eventId]
      )
      const event = selected.rows[0]
      if (!event)
        throw new DomainError('invalid_action', 'Outbox event not found')
      if (
        event.status !== 'processing' ||
        event.lease_owner !== workerId ||
        !event.lease_until ||
        new Date(event.lease_until).getTime() <= now.getTime()
      ) {
        throw new DomainError('conflict', 'Outbox lease is not owned by worker')
      }
      const terminal =
        rawInput.handoff === true ||
        rawInput.terminal === true ||
        event.attempts >= OUTBOX_MAX_ATTEMPTS
      const status: DurableOutboxStatus = terminal ? 'dead_letter' : 'failed'
      const availableAt = terminal
        ? now
        : new Date(now.getTime() + outboxBackoffMs(event.attempts))
      const updated = await this.client.query<DurableOutboxRow>(
        `UPDATE outbox_events
         SET status = $3,
             available_at = $4,
             last_error = $5,
             lease_owner = NULL,
             lease_until = NULL,
             dead_lettered_at = CASE WHEN $3 = 'dead_letter' THEN $6::timestamptz ELSE NULL END
         WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
           AND lease_owner = $7
         RETURNING ${outboxSelectColumns}`,
        [tenantId, event.id, status, availableAt, error, now, workerId]
      )
      const updatedRow = updated.rows[0]
      if (!updatedRow)
        throw new DomainError('conflict', 'Outbox failure lost its lease')
      if (rawInput.handoff && event.session_id) {
        await this.markOutboxSessionHandoff(tenantId, event.session_id, now)
      }
      await this.client.query(
        `UPDATE outbox_attempts
         SET outcome = $4, error = $5
         WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
           AND outcome IS NULL`,
        [
          tenantId,
          event.id,
          workerId,
          rawInput.handoff ? 'handoff' : status,
          error
        ]
      )
      await appendDurableOutboxAudit(this.client, {
        tenantId,
        eventId: event.id,
        correlationId: event.correlation_id,
        actorId: workerId,
        action: rawInput.handoff
          ? 'handoff'
          : terminal
            ? 'dead_letter'
            : 'fail',
        attempts: updatedRow.attempts,
        status: updatedRow.status,
        ...(rawInput.handoff && event.session_id
          ? { sessionId: event.session_id }
          : {}),
        ...(rawInput.handoff && event.conversation_id
          ? { conversationId: event.conversation_id }
          : {}),
        error
      })
      return mapDurableOutboxRow(updatedRow)
    })
  }

  async requeueDeadLetter(
    rawInput: PostgresOutboxRequeueInput
  ): Promise<DurableOutboxEventRecord> {
    const tenantId = TenantIdSchema.parse(rawInput.tenantId)
    const eventId = assertOutboxText(rawInput.eventId, 'eventId', 160)
    const operatorId = assertOutboxText(rawInput.operatorId, 'operatorId', 160)
    const correlationId = CorrelationIdSchema.parse(rawInput.correlationId)
    const now = this.repositoryNow()

    return withOutboxTransaction(this.client, async () => {
      const selected = await this.client.query<DurableOutboxRow>(
        `SELECT ${outboxSelectColumns}
         FROM outbox_events
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, eventId]
      )
      const event = selected.rows[0]
      if (!event)
        throw new DomainError('invalid_action', 'Outbox event not found')
      if (event.status !== 'dead_letter') {
        throw new DomainError(
          'conflict',
          'Only dead-letter events can be requeued'
        )
      }
      const updated = await this.client.query<DurableOutboxRow>(
        `UPDATE outbox_events
         SET status = 'pending',
             attempts = 0,
             available_at = $3,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL,
             processed_at = NULL,
             dead_lettered_at = NULL
         WHERE tenant_id = $1 AND id = $2 AND status = 'dead_letter'
         RETURNING ${outboxSelectColumns}`,
        [tenantId, event.id, now]
      )
      const updatedRow = updated.rows[0]
      if (!updatedRow)
        throw new DomainError(
          'conflict',
          'Outbox requeue lost its compare-and-swap'
        )
      await this.client.query(
        `INSERT INTO outbox_attempts
           (tenant_id, event_id, attempt, worker_id, claimed_at, outcome, error)
         VALUES ($1, $2, $3, $4, $5, 'requeued', $6)`,
        [
          tenantId,
          event.id,
          Math.max(1, event.attempts ?? 0),
          operatorId,
          now,
          event.last_error ? redactOutboxError(event.last_error) : null
        ]
      )
      await appendDurableOutboxAudit(this.client, {
        tenantId,
        eventId: event.id,
        correlationId,
        actorId: operatorId,
        action: 'requeue',
        attempts: updatedRow.attempts,
        status: updatedRow.status
      })
      return mapDurableOutboxRow(updatedRow)
    })
  }

  async findByExternalMessage(
    tenantId: TenantId,
    channel: Channel,
    externalMessageId: string
  ): Promise<MessageRecord | null> {
    const result = await this.client.query<{
      id: string
      conversation_id: string
      external_message_id: string
      direction: 'inbound' | 'outbound'
      body: string
      runtime_status: 'pending' | 'completed' | null
      created_at: Date
    }>(
      `SELECT messages.id, messages.conversation_id, messages.external_message_id, messages.direction, messages.body, messages.runtime_status, messages.created_at
       FROM messages
       INNER JOIN conversations ON conversations.id = messages.conversation_id
       WHERE conversations.tenant_id = $1
         AND conversations.channel = $2
         AND messages.external_message_id = $3
       LIMIT 1`,
      [tenantId, channel, externalMessageId]
    )

    const row = result.rows[0]
    if (!row) return null
    return {
      id: row.id,
      conversationId: row.conversation_id,
      externalMessageId: row.external_message_id,
      direction: row.direction,
      body: redactSensitiveText(row.body),
      ...(row.direction === 'inbound'
        ? { runtimeStatus: row.runtime_status ?? 'pending' }
        : {}),
      createdAt: row.created_at
    }
  }

  async createWithSession(
    input: {
      tenantId: TenantId
      channel: Channel
      senderRef: string
      externalMessageId: string
      body: string
      conversationId?: string | undefined
      sessionId?: string | undefined
    },
    durableOutbox?: PostgresOutboxEnqueueInput
  ): Promise<{
    conversation: ConversationRecord
    session: SessionRecord
    message: MessageRecord
    outbox?: DurableOutboxEventRecord
  }> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const now = new Date()
    const idempotencyKey = createInboundIdempotencyKey(
      input.channel,
      input.externalMessageId
    )
    let conversation: ConversationRecord
    let session: SessionRecord
    let message: MessageRecord
    const sessionAgentColumns = this.tenantIsolation
      ? 'sessions.agent_id AS session_agent_id, sessions.agent_version_id AS session_agent_version_id'
      : 'NULL::text AS session_agent_id, NULL::text AS session_agent_version_id'

    await this.client.query('BEGIN')
    try {
      if (input.conversationId || input.sessionId) {
        const existing = await this.client.query<{
          conversation_tenant_id: TenantId
          conversation_id: string
          channel: Channel
          sender_ref: string
          sender_ref_hash: string | null
          conversation_status: ConversationRecord['status']
          correlation_id: string
          conversation_created_at: Date
          conversation_updated_at: Date
          session_id: string
          session_status: SessionRecord['status']
          session_takeover_state: HumanTakeoverState
          session_agent_id: string | null
          session_agent_version_id: string | null
          session_created_at: Date
          session_updated_at: Date
        }>(
          `SELECT conversations.tenant_id AS conversation_tenant_id,
                  conversations.id AS conversation_id,
                  conversations.channel,
                  conversations.sender_ref,
                  conversations.sender_ref_hash,
                  conversations.status AS conversation_status,
                  conversations.correlation_id,
                  conversations.created_at AS conversation_created_at,
                  conversations.updated_at AS conversation_updated_at,
                  sessions.id AS session_id,
                  sessions.status AS session_status,
                  sessions.takeover_state AS session_takeover_state,
                  ${sessionAgentColumns},
                  sessions.created_at AS session_created_at,
                  sessions.updated_at AS session_updated_at
           FROM conversations
           INNER JOIN sessions ON sessions.conversation_id = conversations.id
           WHERE conversations.id = $1
             AND sessions.id = $2
             AND conversations.tenant_id = $3
           FOR UPDATE`,
          [input.conversationId, input.sessionId, tenantId]
        )
        const row = existing.rows[0]
        if (!row) {
          throw new DomainError(
            'invalid_action',
            'Conversation session not found'
          )
        }
        if (
          row.channel !== input.channel ||
          row.sender_ref_hash !==
            createSenderRefFingerprint(tenantId, input.senderRef) ||
          row.session_status === 'closed' ||
          row.conversation_status === 'resolved' ||
          row.conversation_status === 'archived'
        ) {
          throw new DomainError(
            'invalid_action',
            'Conversation session is not eligible for continuation'
          )
        }
        conversation = {
          tenantId: row.conversation_tenant_id,
          id: row.conversation_id,
          channel: row.channel,
          senderRef: redactSensitiveText(row.sender_ref),
          senderRefHash: row.sender_ref_hash ?? '',
          status: row.conversation_status,
          correlationId: row.correlation_id,
          createdAt: row.conversation_created_at,
          updatedAt: now
        }
        session = {
          id: row.session_id,
          conversationId: row.conversation_id,
          status: row.session_status,
          takeoverState: row.session_takeover_state,
          ...(row.session_agent_id
            ? { agentId: AgentIdSchema.parse(row.session_agent_id) }
            : {}),
          ...(row.session_agent_version_id
            ? {
                agentVersionId: AgentVersionIdSchema.parse(
                  row.session_agent_version_id
                )
              }
            : {}),
          createdAt: row.session_created_at,
          updatedAt: row.session_updated_at
        }
        await this.client.query(
          `UPDATE conversations SET updated_at = $2 WHERE id = $1`,
          [conversation.id, now]
        )
      } else {
        conversation = {
          tenantId,
          id: createDomainId('conv'),
          channel: input.channel,
          senderRef: redactSensitiveText(input.senderRef),
          senderRefHash: createSenderRefFingerprint(tenantId, input.senderRef),
          status: 'active',
          correlationId: createCorrelationId(),
          createdAt: now,
          updatedAt: now
        }
        session = {
          id: createDomainId('sess'),
          conversationId: conversation.id,
          status: 'open',
          takeoverState: 'BOT_ACTIVE',
          createdAt: now,
          updatedAt: now
        }
        await this.client.query(
          `INSERT INTO conversations (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            conversation.tenantId,
            conversation.id,
            conversation.channel,
            conversation.senderRef,
            conversation.senderRefHash,
            conversation.status,
            conversation.correlationId,
            conversation.createdAt,
            conversation.updatedAt
          ]
        )
        if (this.tenantIsolation) {
          await this.client.query(
            `INSERT INTO sessions (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              tenantId,
              session.id,
              session.conversationId,
              session.status,
              session.takeoverState,
              session.createdAt,
              session.updatedAt
            ]
          )
        } else {
          await this.client.query(
            `INSERT INTO sessions (id, conversation_id, status, takeover_state, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              session.id,
              session.conversationId,
              session.status,
              session.takeoverState,
              session.createdAt,
              session.updatedAt
            ]
          )
        }
      }
      message = {
        id: createDomainId('msg'),
        conversationId: conversation.id,
        externalMessageId: input.externalMessageId,
        direction: 'inbound',
        body: redactSensitiveText(input.body),
        runtimeStatus: 'pending',
        createdAt: now
      }
      await this.client.query(
        `INSERT INTO idempotency (tenant_id, key, resource_id, created_at)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, idempotencyKey, message.id, now]
      )
      if (this.tenantIsolation) {
        await this.client.query(
          `INSERT INTO messages (tenant_id, id, conversation_id, external_message_id, direction, body, runtime_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            tenantId,
            message.id,
            message.conversationId,
            message.externalMessageId,
            message.direction,
            message.body,
            message.runtimeStatus,
            message.createdAt
          ]
        )
      } else {
        await this.client.query(
          `INSERT INTO messages (id, conversation_id, external_message_id, direction, body, runtime_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            message.id,
            message.conversationId,
            message.externalMessageId,
            message.direction,
            message.body,
            message.runtimeStatus,
            message.createdAt
          ]
        )
      }
      const outbox = durableOutbox
        ? await this.enqueue(
            {
              ...durableOutbox,
              tenantId,
              correlationId:
                durableOutbox.correlationId ?? conversation.correlationId,
              conversationId: conversation.id,
              sessionId: session.id,
              inboundMessageId: message.id,
              payload: mergeOutboxPayload(durableOutbox.payload, {
                conversationId: conversation.id,
                sessionId: session.id,
                messageId: message.id
              })
            },
            this.client
          )
        : undefined
      await this.client.query('COMMIT')
      if (outbox) return { conversation, session, message, outbox }
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }

    return { conversation, session, message }
  }

  async createWithSessionAndOutbox(
    input: Parameters<PostgresRuntimeRepository['createWithSession']>[0],
    outbox: PostgresOutboxEnqueueInput
  ): Promise<{
    conversation: ConversationRecord
    session: SessionRecord
    message: MessageRecord
    outbox: DurableOutboxEventRecord
  }> {
    const created = await this.createWithSession(input, outbox)
    if (!created.outbox) {
      throw new DomainError(
        'invalid_action',
        'Inbound outbox intent was not committed'
      )
    }
    return {
      conversation: created.conversation,
      session: created.session,
      message: created.message,
      outbox: created.outbox
    }
  }

  async bindSessionAgentVersion(
    rawTenantId: TenantId,
    sessionId: string,
    rawAgentId: AgentId,
    rawAgentVersionId: AgentVersionId
  ): Promise<SessionRecord | null> {
    if (!this.tenantIsolation) {
      throw new DomainError(
        'invalid_action',
        'Session agent pinning requires tenant-scoped persistence'
      )
    }
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const agentVersionId = AgentVersionIdSchema.parse(rawAgentVersionId)
    await this.client.query('BEGIN')
    try {
      const result = await this.client.query<{
        id: string
        conversation_id: string
        status: SessionRecord['status']
        takeover_state: HumanTakeoverState
        agent_id: string | null
        agent_version_id: string | null
        created_at: Date
        updated_at: Date
      }>(
        `SELECT sessions.id, sessions.conversation_id, sessions.status,
                sessions.takeover_state, sessions.agent_id,
                sessions.agent_version_id, sessions.created_at, sessions.updated_at
         FROM sessions
         INNER JOIN conversations ON conversations.id = sessions.conversation_id
         WHERE sessions.id = $1 AND conversations.tenant_id = $2
         FOR UPDATE`,
        [sessionId, tenantId]
      )
      const row = result.rows[0]
      if (!row) {
        await this.client.query('COMMIT')
        return null
      }
      const hasAgent = row.agent_id !== null
      const hasVersion = row.agent_version_id !== null
      if (hasAgent !== hasVersion) {
        throw new DomainError(
          'invalid_action',
          'Session agent binding is incomplete'
        )
      }
      if (hasAgent && hasVersion) {
        if (
          row.agent_id !== agentId ||
          row.agent_version_id !== agentVersionId
        ) {
          throw new DomainError(
            'conflict',
            'Session agent binding cannot be replaced'
          )
        }
        await this.client.query('COMMIT')
        return {
          id: row.id,
          conversationId: row.conversation_id,
          status: row.status,
          takeoverState: row.takeover_state,
          agentId: AgentIdSchema.parse(row.agent_id),
          agentVersionId: AgentVersionIdSchema.parse(row.agent_version_id),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      }
      const updatedAt = new Date()
      await this.client.query(
        `UPDATE sessions
         SET agent_id = $3, agent_version_id = $4, updated_at = $5
         WHERE id = $1 AND tenant_id = $2`,
        [row.id, tenantId, agentId, agentVersionId, updatedAt]
      )
      await this.client.query('COMMIT')
      return {
        id: row.id,
        conversationId: row.conversation_id,
        status: row.status,
        takeoverState: row.takeover_state,
        agentId,
        agentVersionId,
        createdAt: row.created_at,
        updatedAt
      }
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async appendOutboundMessage(input: {
    tenantId: TenantId
    conversationId: string
    externalMessageId: string
    body: string
  }): Promise<MessageRecord> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const conversation = await this.client.query<{
      id: string
      tenant_id: TenantId
    }>(
      `SELECT id, tenant_id
       FROM conversations
       WHERE id = $1 AND tenant_id = $2
       LIMIT 1`,
      [input.conversationId, tenantId]
    )
    if (!conversation.rows[0]) {
      throw new DomainError('invalid_action', 'Conversation not found')
    }
    const message: MessageRecord = {
      id: createDomainId('msg'),
      conversationId: input.conversationId,
      externalMessageId: input.externalMessageId,
      direction: 'outbound',
      body: redactSensitiveText(input.body),
      createdAt: new Date()
    }
    if (this.tenantIsolation) {
      await this.client.query(
        `INSERT INTO messages (tenant_id, id, conversation_id, external_message_id, direction, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          message.id,
          message.conversationId,
          message.externalMessageId,
          message.direction,
          message.body,
          message.createdAt
        ]
      )
    } else {
      await this.client.query(
        `INSERT INTO messages (id, conversation_id, external_message_id, direction, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          message.id,
          message.conversationId,
          message.externalMessageId,
          message.direction,
          message.body,
          message.createdAt
        ]
      )
    }
    await this.client.query(
      `UPDATE conversations SET updated_at = $2 WHERE id = $1 AND tenant_id = $3`,
      [input.conversationId, message.createdAt, tenantId]
    )
    return message
  }

  async markInboundRuntimeCompleted(
    messageId: string,
    rawTenantId: TenantId
  ): Promise<boolean> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const result = this.tenantIsolation
      ? await this.client.query(
          `UPDATE messages
           SET runtime_status = 'completed'
           WHERE id = $1
             AND tenant_id = $2
             AND direction = 'inbound'
             AND runtime_status = 'pending'
           RETURNING id`,
          [messageId, tenantId]
        )
      : await this.client.query(
          `UPDATE messages
           SET runtime_status = 'completed'
           WHERE id = $1
             AND direction = 'inbound'
             AND runtime_status = 'pending'
           RETURNING id`,
          [messageId]
        )
    return result.rows.length > 0
  }

  async findInboundRuntimeContext(
    rawTenantId: TenantId,
    conversationId: string,
    sessionId: string | null,
    messageId: string
  ): Promise<InboundRuntimeContext | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const sessionAgentColumns = this.tenantIsolation
      ? 'sessions.agent_id, sessions.agent_version_id'
      : 'NULL::text AS agent_id, NULL::text AS agent_version_id'
    const result = await this.client.query<{
      message_id: string
      conversation_id: string
      external_message_id: string
      direction: 'inbound' | 'outbound'
      body: string
      runtime_status: 'pending' | 'completed'
      message_created_at: Date
      channel: Channel
      sender_ref: string
      correlation_id: string
      session_id: string | null
      session_status: SessionRecord['status'] | null
      session_takeover_state: HumanTakeoverState | null
      agent_id: string | null
      agent_version_id: string | null
      session_created_at: Date | null
      session_updated_at: Date | null
    }>(
      `SELECT messages.id AS message_id,
              messages.conversation_id,
              messages.external_message_id,
              messages.direction,
              messages.body,
              messages.runtime_status,
              messages.created_at AS message_created_at,
              conversations.channel,
              conversations.sender_ref,
              conversations.correlation_id,
              sessions.id AS session_id,
              sessions.status AS session_status,
              sessions.takeover_state AS session_takeover_state,
              ${sessionAgentColumns},
              sessions.created_at AS session_created_at,
              sessions.updated_at AS session_updated_at
       FROM messages
       INNER JOIN conversations
         ON conversations.id = messages.conversation_id
       LEFT JOIN sessions
         ON sessions.conversation_id = conversations.id
        AND sessions.id = $3
       WHERE messages.id = $1
         AND messages.conversation_id = $2
         AND messages.direction = 'inbound'
         AND conversations.tenant_id = $4
       LIMIT 1`,
      [messageId, conversationId, sessionId, tenantId]
    )
    const row = result.rows[0]
    if (!row || (sessionId !== null && row.session_id !== sessionId)) {
      return null
    }
    const message: MessageRecord = {
      id: row.message_id,
      conversationId: row.conversation_id,
      externalMessageId: row.external_message_id,
      direction: row.direction,
      body: redactSensitiveText(row.body),
      runtimeStatus: row.runtime_status,
      createdAt: row.message_created_at
    }
    const session = row.session_id
      ? {
          id: row.session_id,
          conversationId: row.conversation_id,
          status: row.session_status as SessionRecord['status'],
          takeoverState: row.session_takeover_state as HumanTakeoverState,
          ...(row.agent_id
            ? { agentId: AgentIdSchema.parse(row.agent_id) }
            : {}),
          ...(row.agent_version_id
            ? {
                agentVersionId: AgentVersionIdSchema.parse(row.agent_version_id)
              }
            : {}),
          createdAt: row.session_created_at as Date,
          updatedAt: row.session_updated_at as Date
        }
      : null
    return {
      message,
      channel: row.channel,
      senderRef: redactSensitiveText(row.sender_ref),
      correlationId: CorrelationIdSchema.parse(row.correlation_id),
      session
    }
  }

  async transitionTakeover(
    rawTenantId: TenantId,
    sessionId: string,
    event: HumanTakeoverEvent
  ): Promise<SessionRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    await this.client.query('BEGIN')
    try {
      const updated = await this.transitionTakeoverInTransaction(
        tenantId,
        sessionId,
        event
      )
      await this.client.query('COMMIT')
      return updated
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async transitionTakeoverInTransaction(
    rawTenantId: TenantId,
    sessionId: string,
    event: HumanTakeoverEvent
  ): Promise<SessionRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const sessionAgentColumns = this.tenantIsolation
      ? 'sessions.agent_id, sessions.agent_version_id'
      : 'NULL::text AS agent_id, NULL::text AS agent_version_id'
    const result = await this.client.query<{
      id: string
      conversation_id: string
      status: SessionRecord['status']
      takeover_state: HumanTakeoverState
      agent_id: string | null
      agent_version_id: string | null
      conversation_status: ConversationRecord['status']
      created_at: Date
      updated_at: Date
    }>(
      `SELECT sessions.id, sessions.conversation_id, sessions.status,
                sessions.takeover_state, conversations.status AS conversation_status,
                ${sessionAgentColumns},
                sessions.created_at, sessions.updated_at
         FROM sessions
         INNER JOIN conversations ON conversations.id = sessions.conversation_id
         WHERE sessions.id = $1 AND conversations.tenant_id = $2
         FOR UPDATE`,
      [sessionId, tenantId]
    )
    const row = result.rows[0]
    if (
      !row ||
      row.status === 'closed' ||
      row.conversation_status === 'resolved' ||
      row.conversation_status === 'archived'
    ) {
      return null
    }
    const updated: SessionRecord = {
      id: row.id,
      conversationId: row.conversation_id,
      status: row.status,
      takeoverState: transitionHumanTakeover(row.takeover_state, event),
      ...(row.agent_id ? { agentId: AgentIdSchema.parse(row.agent_id) } : {}),
      ...(row.agent_version_id
        ? { agentVersionId: AgentVersionIdSchema.parse(row.agent_version_id) }
        : {}),
      createdAt: row.created_at,
      updatedAt: new Date()
    }
    await this.client.query(
      `UPDATE sessions SET takeover_state = $2, updated_at = $3 WHERE id = $1`,
      [updated.id, updated.takeoverState, updated.updatedAt]
    )
    const conversationStatus =
      updated.takeoverState === 'BOT_ACTIVE' ? 'active' : 'waiting_human'
    await this.client.query(
      `UPDATE conversations SET status = $2, updated_at = $3 WHERE id = $1`,
      [updated.conversationId, conversationStatus, updated.updatedAt]
    )
    return updated
  }

  async completeInboundRuntime(
    input: InboundRuntimeCompletionInput,
    controlPlane: {
      recordExecutionTrace: (
        scope: { tenantId: TenantId },
        trace: TestRunTrace
      ) => Promise<TestRunTrace>
    }
  ): Promise<{ status: 'completed' | 'paused' }> {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const trace = sanitizeTraceForPersistence(input.trace)
    assertInboundRuntimeCorrelation(input.correlationId)
    assertInboundToolAuditParents(trace, input.toolAuditEvents)
    await this.client.query('BEGIN')
    try {
      const inbound = this.tenantIsolation
        ? await this.client.query<{
            runtime_status: 'pending' | 'completed'
          }>(
            `SELECT runtime_status
             FROM messages
             WHERE id = $1 AND tenant_id = $2 AND direction = 'inbound'
             FOR UPDATE`,
            [input.inboundMessageId, tenantId]
          )
        : await this.client.query<{
            runtime_status: 'pending' | 'completed'
          }>(
            `SELECT runtime_status
             FROM messages
             WHERE id = $1 AND direction = 'inbound'
             FOR UPDATE`,
            [input.inboundMessageId]
          )
      if (!inbound.rows[0]) {
        throw new DomainError('invalid_action', 'Inbound message not found')
      }
      if (inbound.rows[0].runtime_status === 'completed') {
        await this.client.query('COMMIT')
        return { status: 'completed' }
      }
      if (input.sessionId) {
        const session = await this.client.query<{
          id: string
          takeover_state: HumanTakeoverState
        }>(
          `SELECT sessions.id, sessions.takeover_state
           FROM sessions
           INNER JOIN conversations ON conversations.id = sessions.conversation_id
           WHERE sessions.id = $1 AND conversations.tenant_id = $2
           FOR UPDATE`,
          [input.sessionId, tenantId]
        )
        if (session.rows[0]?.takeover_state !== 'BOT_ACTIVE') {
          await this.client.query('COMMIT')
          return { status: 'paused' }
        }
      }

      if (trace.handoff.requested && input.sessionId) {
        const handoff = await this.transitionTakeoverInTransaction(
          tenantId,
          input.sessionId,
          'request_handoff'
        )
        if (!handoff) {
          await this.client.query('COMMIT')
          return { status: 'paused' }
        }
        await this.appendAudit({
          type: 'handoff',
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: input.correlationId,
          policyVersion: 'human-takeover-v1',
          tenantId,
          payload: {
            tenantId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            traceId: trace.traceId,
            state: handoff.takeoverState,
            reason: trace.handoff.reason,
            effect: 'human_handoff_requested'
          }
        })
      }

      if (trace.response.text.trim().length > 0) {
        await this.appendOutboundMessage({
          tenantId,
          conversationId: input.conversationId,
          externalMessageId: `runtime:${trace.traceId}`,
          body: trace.response.text
        })
      }
      for (const event of input.toolAuditEvents) {
        await this.appendAudit({
          type: event.type,
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: event.correlationId,
          policyVersion: 'plugin-gateway-v1',
          tenantId,
          payload: {
            tenantId,
            agentId: event.agentId,
            versionId: event.versionId,
            traceId: event.traceId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            plugin: event.plugin,
            toolName: event.toolName,
            status: event.status,
            payload: event.payload
          }
        })
      }
      await controlPlane.recordExecutionTrace({ tenantId }, trace)
      const markedCompleted = await this.markInboundRuntimeCompleted(
        input.inboundMessageId,
        tenantId
      )
      if (!markedCompleted) {
        throw new DomainError(
          'invalid_action',
          'Inbound runtime completion marker was not updated'
        )
      }
      await this.appendAudit({
        type: 'integration_event',
        actorType: 'System',
        actorId: 'api',
        correlationId: input.correlationId,
        policyVersion: 'api-runtime-v1',
        tenantId,
        payload: {
          sessionId: input.sessionId,
          conversationId: input.conversationId,
          accepted: true,
          tenantId,
          runtimeStatus: 'completed',
          traceId: trace.traceId,
          externalCall: trace.provider.externalCall
        }
      })
      await this.client.query('COMMIT')
      return { status: 'completed' }
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async appendAudit(
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>
  ): Promise<AuditEventRecord> {
    const tenantId = this.tenantIsolation
      ? TenantIdSchema.safeParse(input.tenantId)
      : null
    if (this.tenantIsolation && (!tenantId || !tenantId.success)) {
      throw new DomainError('invalid_action', 'Tenant scope is required')
    }
    if (
      this.tenantIsolation &&
      input.payload &&
      (!hasTenantContext(input.payload) ||
        readPayloadTenantId(input.payload) !== tenantId?.data)
    ) {
      throw new DomainError(
        'invalid_action',
        'A tenant-scoped audit context is required'
      )
    }
    const payload = sanitizeAuditEvidencePayload(input.payload).payload
    const event: AuditEventRecord = {
      ...input,
      payload,
      id: createDomainId('audit'),
      createdAt: new Date()
    }
    if (this.tenantIsolation) {
      await this.client.query(
        `INSERT INTO audit_events (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
         VALUES (NULLIF(current_setting('cvg.tenant_id', true), ''), $1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          event.id,
          event.type,
          event.actorType,
          event.actorId,
          event.correlationId,
          event.policyVersion,
          JSON.stringify(sanitizeAuditEvidencePayload(event.payload).payload),
          event.createdAt
        ]
      )
    } else {
      await this.client.query(
        `INSERT INTO audit_events (id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
        [
          event.id,
          event.type,
          event.actorType,
          event.actorId,
          event.correlationId,
          event.policyVersion,
          JSON.stringify(sanitizeAuditEvidencePayload(event.payload).payload),
          event.createdAt
        ]
      )
    }
    return event
  }

  async listAuditBySession(
    sessionId: string,
    rawTenantId?: TenantId
  ): Promise<AuditEventRecord[]> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeFilter = tenantId
      ? this.tenantIsolation
        ? 'AND audit_events.tenant_id = $2'
        : `AND EXISTS (
             SELECT 1
             FROM sessions
             INNER JOIN conversations ON conversations.id = sessions.conversation_id
             WHERE sessions.id = $1 AND conversations.tenant_id = $2
           )`
      : ''
    const tenantColumn = this.tenantIsolation ? ', tenant_id' : ''
    const result = await this.client.query<{
      id: string
      tenant_id?: TenantId | null
      type: AuditEventRecord['type']
      actor_type: AuditEventRecord['actorType']
      actor_id: string
      correlation_id: string
      policy_version: string
      payload: unknown
      created_at: Date
    }>(
      `SELECT id${tenantColumn}, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at
       FROM audit_events
       WHERE payload->>'sessionId' = $1
       ${scopeFilter}
       ORDER BY created_at ASC`,
      [sessionId, ...(tenantId ? [tenantId] : [])]
    )

    return result.rows.map((row) => ({
      id: row.id,
      ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
      type: row.type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      correlationId: row.correlation_id,
      policyVersion: row.policy_version,
      payload: sanitizeAuditEvidencePayload(row.payload).payload,
      createdAt: row.created_at
    }))
  }

  async listAuditEvidence(
    query: AuditEvidenceQuery,
    rawTenantId?: TenantId
  ): Promise<AuditEvidencePage> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const where = buildAuditWhereClause(query, tenantId, this.tenantIsolation)
    const tenantColumn = this.tenantIsolation ? ', tenant_id' : ''
    const result = await this.client.query<AuditEventRow & { total: number }>(
      `SELECT id${tenantColumn}, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at,
              COUNT(*) OVER()::integer AS total
       FROM audit_events
       ${where.sql}
       ORDER BY created_at ASC
       LIMIT $${where.values.length + 1} OFFSET $${where.values.length + 2}`,
      [...where.values, query.limit, query.offset]
    )
    const items = result.rows.map((row) => this.mapAuditEvent(row))
    const total = result.rows[0]?.total ?? 0
    return {
      items,
      pageInfo: {
        limit: query.limit,
        offset: query.offset,
        total,
        hasNextPage: query.offset + items.length < total
      }
    }
  }

  async summarizeAuditEvidence(
    filters: AuditEvidenceFilters,
    rawTenantId?: TenantId
  ): Promise<AuditEvidenceSummary> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const where = buildAuditWhereClause(filters, tenantId, this.tenantIsolation)
    const tenantColumn = this.tenantIsolation ? ', tenant_id' : ''
    const result = await this.client.query<AuditEventRow>(
      `SELECT id${tenantColumn}, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at
       FROM audit_events
       ${where.sql}
       ORDER BY created_at ASC`,
      where.values
    )
    return summarizeAuditEvents(
      result.rows.map((row) => this.mapAuditEvent(row))
    )
  }

  async listAuditEventsByIds(
    rawIds: string[],
    rawTenantId?: TenantId
  ): Promise<AuditEventRecord[]> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const tenantColumn = this.tenantIsolation ? ', tenant_id' : ''
    const values: unknown[] = [rawIds]
    const tenantClause = tenantId
      ? this.tenantIsolation
        ? (() => {
            values.push(tenantId)
            return `AND audit_events.tenant_id = $${values.length}`
          })()
        : (() => {
            values.push(tenantId)
            return `AND audit_events.payload->>'tenantId' = $${values.length}`
          })()
      : ''
    const result = await this.client.query<AuditEventRow>(
      `SELECT id${tenantColumn}, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at
       FROM audit_events
       WHERE id = ANY($1::text[])
       ${tenantClause}
       ORDER BY created_at ASC`,
      values
    )
    return result.rows.map((row) => this.mapAuditEvent(row))
  }

  async createAuditEvidenceCheckpoint(
    rawInput: AuditEvidenceCheckpointCreateInput,
    rawCreatedBy: string,
    rawTenantId?: TenantId
  ): Promise<AuditEvidenceCheckpointRecord> {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const input = AuditEvidenceCheckpointCreateInputSchema.parse(rawInput)
    const createdBy = AuditEvidenceCheckpointActorIdSchema.parse(rawCreatedBy)
    await this.client.query('BEGIN')
    try {
      const events = await this.listAuditEventsByIds(input.eventIds, tenantId)
      assertCheckpointEvents(input, events, input.eventIds)
      const evidenceDigest = computeAuditEvidenceCheckpointDigest(
        tenantId,
        input,
        events
      )
      const now = new Date()
      const checkpoint: AuditEvidenceCheckpointRecord = {
        tenantId,
        id: createAuditEvidenceCheckpointId(),
        filters: { ...(input.filters ?? {}) },
        eventIds: [...input.eventIds].sort(),
        eventCount: input.eventIds.length,
        evidenceDigest,
        status: 'SEALED',
        createdBy,
        updatedBy: createdBy,
        createdAt: now,
        updatedAt: now
      }
      try {
        await this.client.query(
          `INSERT INTO audit_evidence_checkpoints
             (tenant_id, id, filters, event_ids, event_count, evidence_digest, status, created_by, updated_by, created_at, updated_at)
           VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10, $11)`,
          [
            checkpoint.tenantId,
            checkpoint.id,
            JSON.stringify(checkpoint.filters),
            JSON.stringify(checkpoint.eventIds),
            checkpoint.eventCount,
            checkpoint.evidenceDigest,
            checkpoint.status,
            checkpoint.createdBy,
            checkpoint.updatedBy,
            checkpoint.createdAt,
            checkpoint.updatedAt
          ]
        )
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new DomainError(
            'conflict',
            'Audit evidence checkpoint already exists'
          )
        }
        throw error
      }
      await this.client.query('COMMIT')
      return cloneAuditEvidenceCheckpoint(checkpoint)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async getAuditEvidenceCheckpoint(
    rawId: string,
    rawTenantId?: TenantId
  ): Promise<AuditEvidenceCheckpointRecord | null> {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const id = AuditEvidenceCheckpointIdSchema.parse(rawId)
    const result = await this.client.query<AuditEvidenceCheckpointRow>(
      `SELECT tenant_id, id, filters, event_ids, event_count, evidence_digest, status,
              created_by, updated_by, created_at, updated_at
       FROM audit_evidence_checkpoints
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    )
    const row = result.rows[0]
    return row ? mapAuditEvidenceCheckpoint(row) : null
  }

  async listAuditEvidenceCheckpoints(
    rawTenantId?: TenantId
  ): Promise<AuditEvidenceCheckpointRecord[]> {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const result = await this.client.query<AuditEvidenceCheckpointRow>(
      `SELECT tenant_id, id, filters, event_ids, event_count, evidence_digest, status,
              created_by, updated_by, created_at, updated_at
       FROM audit_evidence_checkpoints
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId]
    )
    return result.rows.map(mapAuditEvidenceCheckpoint)
  }

  async transitionAuditEvidenceCheckpoint(
    rawId: string,
    rawStatus: AuditEvidenceCheckpointStatus,
    rawUpdatedBy: string,
    rawExpectedStatus: AuditEvidenceCheckpointStatus,
    rawTenantId?: TenantId
  ): Promise<AuditEvidenceCheckpointRecord | null> {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const id = AuditEvidenceCheckpointIdSchema.parse(rawId)
    const status = AuditEvidenceCheckpointStatusSchema.parse(rawStatus)
    const expectedStatus =
      AuditEvidenceCheckpointStatusSchema.parse(rawExpectedStatus)
    const updatedBy = AuditEvidenceCheckpointActorIdSchema.parse(rawUpdatedBy)
    if (status !== 'ARCHIVED' || expectedStatus !== 'SEALED') {
      throw new DomainError(
        'invalid_action',
        'Audit evidence checkpoint transition is not allowed'
      )
    }
    await this.client.query('BEGIN')
    try {
      const current = await this.client.query<AuditEvidenceCheckpointRow>(
        `SELECT tenant_id, id, filters, event_ids, event_count, evidence_digest, status,
                created_by, updated_by, created_at, updated_at
         FROM audit_evidence_checkpoints
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, id]
      )
      const row = current.rows[0]
      if (!row) {
        await this.client.query('COMMIT')
        return null
      }
      const checkpoint = mapAuditEvidenceCheckpoint(row)
      if (checkpoint.status !== expectedStatus) {
        throw new DomainError(
          'conflict',
          `Audit evidence checkpoint status is ${checkpoint.status}, expected ${expectedStatus}`
        )
      }
      const updatedAt = new Date()
      const updated = await this.client.query<AuditEvidenceCheckpointRow>(
        `UPDATE audit_evidence_checkpoints
         SET status = $3, updated_by = $4, updated_at = $5
         WHERE tenant_id = $1 AND id = $2 AND status = $6
         RETURNING tenant_id, id, filters, event_ids, event_count, evidence_digest, status,
                   created_by, updated_by, created_at, updated_at`,
        [tenantId, id, status, updatedBy, updatedAt, expectedStatus]
      )
      const result = updated.rows[0]
      if (!result) {
        throw new DomainError(
          'conflict',
          'Audit evidence checkpoint transition lost its compare-and-swap'
        )
      }
      await this.client.query('COMMIT')
      return mapAuditEvidenceCheckpoint(result)
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async timeline(
    tenantId: TenantId,
    conversationId: string
  ): Promise<{ messages: MessageRecord[]; sessions: SessionRecord[] }> {
    const sessionAgentColumns = this.tenantIsolation
      ? 'sessions.agent_id, sessions.agent_version_id'
      : 'NULL::text AS agent_id, NULL::text AS agent_version_id'
    const messages = await this.client.query<{
      id: string
      conversation_id: string
      external_message_id: string
      direction: 'inbound' | 'outbound'
      body: string
      created_at: Date
    }>(
      `SELECT messages.id, messages.conversation_id, messages.external_message_id, messages.direction, messages.body, messages.created_at
       FROM messages
       INNER JOIN conversations ON conversations.id = messages.conversation_id
       WHERE messages.conversation_id = $1 AND conversations.tenant_id = $2
       ORDER BY messages.created_at ASC`,
      [conversationId, tenantId]
    )
    const sessions = await this.client.query<{
      id: string
      conversation_id: string
      status: SessionRecord['status']
      takeover_state: HumanTakeoverState
      agent_id: string | null
      agent_version_id: string | null
      created_at: Date
      updated_at: Date
    }>(
      `SELECT sessions.id, sessions.conversation_id, sessions.status, sessions.takeover_state,
              ${sessionAgentColumns}, sessions.created_at, sessions.updated_at
       FROM sessions
       INNER JOIN conversations ON conversations.id = sessions.conversation_id
       WHERE sessions.conversation_id = $1 AND conversations.tenant_id = $2
       ORDER BY sessions.created_at ASC`,
      [conversationId, tenantId]
    )

    return {
      messages: messages.rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        externalMessageId: row.external_message_id,
        direction: row.direction,
        body: redactSensitiveText(row.body),
        createdAt: row.created_at
      })),
      sessions: sessions.rows.map((row) => ({
        id: row.id,
        conversationId: row.conversation_id,
        status: row.status,
        takeoverState: row.takeover_state,
        ...(row.agent_id ? { agentId: AgentIdSchema.parse(row.agent_id) } : {}),
        ...(row.agent_version_id
          ? { agentVersionId: AgentVersionIdSchema.parse(row.agent_version_id) }
          : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    }
  }

  async listPage(
    tenantId: TenantId,
    input: PaginationInput
  ): Promise<ConversationPage> {
    const result = await this.client.query<{
      id: string
      channel: Channel
      sender_ref: string
      status: ConversationRecord['status']
      correlation_id: string
      open_session_id: string | null
      last_message_body: string | null
      last_message_at: Date | null
      created_at: Date
      updated_at: Date
      total: number
    }>(
      `SELECT conversations.id,
              conversations.channel,
              conversations.sender_ref,
              conversations.status,
              conversations.correlation_id,
              open_sessions.id AS open_session_id,
              last_messages.body AS last_message_body,
              last_messages.created_at AS last_message_at,
              conversations.created_at,
              conversations.updated_at,
              COUNT(*) OVER()::integer AS total
       FROM conversations
       LEFT JOIN LATERAL (
         SELECT sessions.id
         FROM sessions
         WHERE sessions.conversation_id = conversations.id AND sessions.status = 'open'
         ORDER BY sessions.created_at DESC
         LIMIT 1
       ) open_sessions ON true
       LEFT JOIN LATERAL (
         SELECT messages.body, messages.created_at
         FROM messages
         WHERE messages.conversation_id = conversations.id
         ORDER BY messages.created_at DESC
         LIMIT 1
       ) last_messages ON true
       WHERE conversations.tenant_id = $3
       ORDER BY COALESCE(last_messages.created_at, conversations.updated_at) DESC, conversations.created_at DESC
       LIMIT $1 OFFSET $2`,
      [input.limit, input.offset, tenantId]
    )

    const items: ConversationListItem[] = result.rows.map((row) => ({
      id: row.id,
      channel: row.channel,
      senderRef: redactSensitiveText(row.sender_ref),
      status: row.status,
      correlationId: row.correlation_id,
      openSessionId: row.open_session_id,
      lastMessageBody: row.last_message_body
        ? redactSensitiveText(row.last_message_body)
        : null,
      lastMessageAt: row.last_message_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
    const total = result.rows[0]?.total ?? 0
    return {
      items,
      pageInfo: {
        limit: input.limit,
        offset: input.offset,
        total,
        hasNextPage: input.offset + items.length < total
      }
    }
  }

  async createTask(
    input: {
      sessionId: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      idempotencyKey: string
    },
    rawTenantId?: TenantId,
    // Runs only for a new row on this client; the caller owns the transaction.
    onCreated?: (task: TaskRecord) => Promise<void>
  ): Promise<TaskRecord> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    if (this.tenantIsolation && !tenantId) {
      throw new DomainError('invalid_action', 'Tenant scope is required')
    }
    if (tenantId) await this.assertSessionTenant(input.sessionId, tenantId)
    const scopeJoin = tenantId
      ? `INNER JOIN sessions ON sessions.id = tasks.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id`
      : ''
    const scopeFilter = tenantId ? ' AND conversations.tenant_id = $4' : ''
    const existing = await this.client.query<{
      id: string
      session_id: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      status: TaskRecord['status']
      idempotency_key: string
      created_at: Date
    }>(
      `SELECT tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority, tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at
       FROM tasks
       ${scopeJoin}
       WHERE session_id = $1 AND source = $2 AND idempotency_key = $3
       ${scopeFilter}
       LIMIT 1`,
      [
        input.sessionId,
        input.source,
        input.idempotencyKey,
        ...(tenantId ? [tenantId] : [])
      ]
    )
    const existingRow = existing.rows[0]
    if (existingRow) return this.mapTask(existingRow)

    const task: TaskRecord = {
      id: createDomainId('task'),
      sessionId: input.sessionId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      source: input.source,
      status: 'open',
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date()
    }
    let inserted
    if (this.tenantIsolation) {
      inserted = await this.client.query(
        `INSERT INTO tasks (tenant_id, id, session_id, title, description, priority, source, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (session_id, source, idempotency_key) DO NOTHING
           RETURNING id`,
        [
          tenantId,
          task.id,
          task.sessionId,
          task.title,
          task.description,
          task.priority,
          task.source,
          task.status,
          task.idempotencyKey,
          task.createdAt
        ]
      )
    } else {
      inserted = await this.client.query(
        `INSERT INTO tasks (id, session_id, title, description, priority, source, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (session_id, source, idempotency_key) DO NOTHING
           RETURNING id`,
        [
          task.id,
          task.sessionId,
          task.title,
          task.description,
          task.priority,
          task.source,
          task.status,
          task.idempotencyKey,
          task.createdAt
        ]
      )
    }
    if (inserted.rows.length === 0) {
      const winner = await this.client.query<(typeof existing.rows)[number]>(
        `SELECT tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority, tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at
           FROM tasks
           ${scopeJoin}
           WHERE session_id = $1 AND source = $2 AND idempotency_key = $3
           ${scopeFilter}
           LIMIT 1`,
        [
          input.sessionId,
          input.source,
          input.idempotencyKey,
          ...(tenantId ? [tenantId] : [])
        ]
      )
      const winnerRow = winner.rows[0]
      if (winnerRow) return this.mapTask(winnerRow)
      throw new DomainError('conflict', 'Task insert was not stored')
    }
    await onCreated?.(task)
    return task
  }

  async listTasks(rawTenantId?: TenantId): Promise<TaskRecord[]> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeJoin = tenantId
      ? `INNER JOIN sessions ON sessions.id = tasks.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id`
      : ''
    const scopeFilter = tenantId ? 'WHERE conversations.tenant_id = $1' : ''
    const result = await this.client.query<{
      id: string
      session_id: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      status: TaskRecord['status']
      idempotency_key: string
      created_at: Date
    }>(
      `SELECT tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority, tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at
       FROM tasks
       ${scopeJoin}
       ${scopeFilter}
       ORDER BY tasks.created_at ASC`,
      tenantId ? [tenantId] : undefined
    )
    return result.rows.map((row) => this.mapTask(row))
  }

  async findTaskById(
    id: string,
    rawTenantId?: TenantId
  ): Promise<TaskRecord | null> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeJoin = tenantId
      ? `INNER JOIN sessions ON sessions.id = tasks.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id`
      : ''
    const scopeFilter = tenantId ? ' AND conversations.tenant_id = $2' : ''
    const result = await this.client.query<{
      id: string
      session_id: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      status: TaskRecord['status']
      idempotency_key: string
      created_at: Date
    }>(
      `SELECT tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority, tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at
       FROM tasks
       ${scopeJoin}
       WHERE tasks.id = $1
       ${scopeFilter}
       LIMIT 1`,
      [id, ...(tenantId ? [tenantId] : [])]
    )
    const row = result.rows[0]
    return row ? this.mapTask(row) : null
  }

  async updateTaskStatus(
    id: string,
    status: TaskStatus,
    rawTenantId?: TenantId
  ): Promise<TaskRecord | null> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeFilter = tenantId
      ? ` AND EXISTS (
           SELECT 1
           FROM sessions
           INNER JOIN conversations ON conversations.id = sessions.conversation_id
           WHERE sessions.id = tasks.session_id
             AND conversations.tenant_id = $3
         )`
      : ''
    const result = await this.client.query<{
      id: string
      session_id: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      status: TaskRecord['status']
      idempotency_key: string
      created_at: Date
    }>(
      `UPDATE tasks
       SET status = $2
       WHERE tasks.id = $1
       ${scopeFilter}
       RETURNING tasks.id, tasks.session_id, tasks.title, tasks.description, tasks.priority, tasks.source, tasks.status, tasks.idempotency_key, tasks.created_at`,
      [id, status, ...(tenantId ? [tenantId] : [])]
    )
    const row = result.rows[0]
    return row ? this.mapTask(row) : null
  }

  private async assertSessionTenant(
    sessionId: string,
    tenantId: TenantId
  ): Promise<void> {
    const result = await this.client.query(
      `SELECT sessions.id
       FROM sessions
       INNER JOIN conversations ON conversations.id = sessions.conversation_id
       WHERE sessions.id = $1 AND conversations.tenant_id = $2
       LIMIT 1`,
      [sessionId, tenantId]
    )
    if (result.rows.length === 0) {
      throw new DomainError('invalid_action', 'Session not found')
    }
  }

  async saveApproval(
    request: ApprovalRequestRecord,
    rawTenantId?: TenantId
  ): Promise<ApprovalRequestRecord> {
    assertApprovalCreation(request)
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    if (this.tenantIsolation && !tenantId) {
      throw new DomainError('invalid_action', 'Tenant scope is required')
    }
    if (tenantId) await this.assertSessionTenant(request.sessionId, tenantId)
    if (this.tenantIsolation) {
      const result = await this.client.query(
        `INSERT INTO approval_requests (tenant_id, id, session_id, proposed_action, summary, risk_level, status, decided_by, decided_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [
          tenantId,
          request.id,
          request.sessionId,
          request.proposedAction,
          request.summary,
          request.riskLevel,
          request.status,
          request.decidedBy,
          request.decidedAt,
          request.createdAt
        ]
      )
      if (!result.rows.length)
        throw new DomainError('conflict', 'Approval request already exists')
    } else {
      const result = await this.client.query(
        `INSERT INTO approval_requests (id, session_id, proposed_action, summary, risk_level, status, decided_by, decided_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING RETURNING id`,
        [
          request.id,
          request.sessionId,
          request.proposedAction,
          request.summary,
          request.riskLevel,
          request.status,
          request.decidedBy,
          request.decidedAt,
          request.createdAt
        ]
      )
      if (!result.rows.length)
        throw new DomainError('conflict', 'Approval request already exists')
    }
    return request
  }

  async decideApprovalWithAudit(
    input: AttendanceApprovalDecision,
    rawTenantId?: TenantId
  ): Promise<ApprovalRequestRecord> {
    input = validateAttendanceDecision(input)
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    if (this.tenantIsolation && !tenantId)
      throw new DomainError('invalid_action', 'Tenant scope is required')
    await this.client.query('BEGIN')
    try {
      // The conditional update is the authority; any earlier read is only for scoped existence.
      const current = await this.findApprovalById(
        input.approvalRequestId,
        tenantId
      )
      if (!current)
        throw new DomainError('invalid_action', 'Approval request not found')
      const decidedAt = new Date()
      const result = await this.client.query(
        `UPDATE approval_requests SET status = $2, decided_by = $3, decided_at = $4
         WHERE id = $1 AND status = 'pending'
         ${tenantId ? 'AND session_id IN (SELECT sessions.id FROM sessions INNER JOIN conversations ON conversations.id = sessions.conversation_id WHERE conversations.tenant_id = $5)' : ''}
         RETURNING id`,
        [
          input.approvalRequestId,
          input.decision,
          input.operatorId,
          decidedAt,
          ...(tenantId ? [tenantId] : [])
        ]
      )
      if (!result.rows.length)
        throw new DomainError(
          'conflict',
          'Approval request is no longer pending'
        )
      const decided: ApprovalRequestRecord = {
        ...current,
        status: input.decision,
        decidedBy: input.operatorId,
        decidedAt
      }
      await this.appendAudit(attendanceDecisionAudit(decided, input, tenantId))
      await this.client.query('COMMIT')
      return decided
    } catch (error) {
      await this.client.query('ROLLBACK')
      throw error
    }
  }

  async findApprovalById(
    id: string,
    rawTenantId?: TenantId
  ): Promise<ApprovalRequestRecord | null> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeJoin = tenantId
      ? `INNER JOIN sessions ON sessions.id = approval_requests.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id`
      : ''
    const scopeFilter = tenantId ? ' AND conversations.tenant_id = $2' : ''
    const result = await this.client.query<{
      id: string
      session_id: string
      proposed_action: string
      summary: string
      risk_level: ApprovalRequestRecord['riskLevel']
      status: ApprovalRequestRecord['status']
      decided_by: string | null
      decided_at: Date | null
      created_at: Date
    }>(
      `SELECT approval_requests.id, approval_requests.session_id, approval_requests.proposed_action, approval_requests.summary, approval_requests.risk_level, approval_requests.status, approval_requests.decided_by, approval_requests.decided_at, approval_requests.created_at
       FROM approval_requests
       ${scopeJoin}
       WHERE approval_requests.id = $1
       ${scopeFilter}
       LIMIT 1`,
      [id, ...(tenantId ? [tenantId] : [])]
    )
    const row = result.rows[0]
    return row ? this.mapApproval(row) : null
  }

  async listApprovals(
    rawTenantId?: TenantId
  ): Promise<ApprovalRequestRecord[]> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const scopeJoin = tenantId
      ? `INNER JOIN sessions ON sessions.id = approval_requests.session_id
         INNER JOIN conversations ON conversations.id = sessions.conversation_id`
      : ''
    const scopeFilter = tenantId ? 'WHERE conversations.tenant_id = $1' : ''
    const result = await this.client.query<{
      id: string
      session_id: string
      proposed_action: string
      summary: string
      risk_level: ApprovalRequestRecord['riskLevel']
      status: ApprovalRequestRecord['status']
      decided_by: string | null
      decided_at: Date | null
      created_at: Date
    }>(
      `SELECT approval_requests.id, approval_requests.session_id, approval_requests.proposed_action, approval_requests.summary, approval_requests.risk_level, approval_requests.status, approval_requests.decided_by, approval_requests.decided_at, approval_requests.created_at
       FROM approval_requests
       ${scopeJoin}
       ${scopeFilter}
       ORDER BY approval_requests.created_at ASC`,
      tenantId ? [tenantId] : undefined
    )
    return result.rows.map((row) => this.mapApproval(row))
  }

  private async markOutboxSessionHandoff(
    tenantId: TenantId,
    sessionId: string,
    now: Date
  ): Promise<void> {
    const updated = this.tenantIsolation
      ? await this.client.query<{ conversation_id: string }>(
          `UPDATE sessions
           SET takeover_state = 'HANDOFF_REQUESTED', updated_at = $3
           WHERE id = $1 AND tenant_id = $2 AND takeover_state = 'BOT_ACTIVE'
           RETURNING conversation_id`,
          [sessionId, tenantId, now]
        )
      : await this.client.query<{ conversation_id: string }>(
          `UPDATE sessions
           SET takeover_state = 'HANDOFF_REQUESTED', updated_at = $2
           WHERE id = $1 AND takeover_state = 'BOT_ACTIVE'
           RETURNING conversation_id`,
          [sessionId, now]
        )
    const conversationId = updated.rows[0]?.conversation_id
    if (!conversationId) return
    await this.client.query(
      `UPDATE conversations
       SET status = 'waiting_human', updated_at = $2
       WHERE id = $1${this.tenantIsolation ? ' AND tenant_id = $3' : ''}`,
      this.tenantIsolation
        ? [conversationId, now, tenantId]
        : [conversationId, now]
    )
  }

  private async isOutboxTakeoverActive(
    tenantId: TenantId,
    event: DurableOutboxRow,
    configuredCheck: OutboxTakeoverCheck | undefined
  ): Promise<boolean> {
    if (event.session_id) {
      const session = await this.client.query<{
        takeover_state: HumanTakeoverState
      }>(
        `SELECT sessions.takeover_state
         FROM sessions
         INNER JOIN conversations ON conversations.id = sessions.conversation_id
         WHERE sessions.id = $1 AND conversations.tenant_id = $2
         FOR UPDATE`,
        [event.session_id, tenantId]
      )
      if (!session.rows[0] || session.rows[0].takeover_state !== 'BOT_ACTIVE') {
        return true
      }
    }
    return resolveTakeoverCheck(configuredCheck)
  }

  private async suppressOutboxForTakeover(
    event: DurableOutboxRow,
    tenantId: TenantId,
    workerId: string,
    now: Date
  ): Promise<DurableOutboxEventRecord> {
    const updated = await this.client.query<DurableOutboxRow>(
      `UPDATE outbox_events
       SET status = 'dead_letter',
           available_at = $3,
           last_error = $4,
           lease_owner = NULL,
           lease_until = NULL,
           dead_lettered_at = $3
       WHERE tenant_id = $1 AND id = $2 AND status = 'processing'
         AND lease_owner = $5
       RETURNING ${outboxSelectColumns}`,
      [tenantId, event.id, now, OUTBOX_TAKEOVER_SUPPRESSED_ERROR, workerId]
    )
    const updatedRow = updated.rows[0]
    if (!updatedRow) {
      throw new DomainError('conflict', 'Outbox takeover lost its lease')
    }
    if (event.session_id) {
      await this.markOutboxSessionHandoff(tenantId, event.session_id, now)
    }
    await this.client.query(
      `UPDATE outbox_attempts
       SET outcome = 'handoff', error = $4
       WHERE tenant_id = $1 AND event_id = $2 AND worker_id = $3
         AND outcome IS NULL`,
      [tenantId, event.id, workerId, OUTBOX_TAKEOVER_SUPPRESSED_ERROR]
    )
    await appendDurableOutboxAudit(this.client, {
      tenantId,
      eventId: event.id,
      correlationId: event.correlation_id,
      actorId: workerId,
      action: 'handoff',
      attempts: updatedRow.attempts,
      status: updatedRow.status,
      ...(event.session_id ? { sessionId: event.session_id } : {}),
      ...(event.conversation_id
        ? { conversationId: event.conversation_id }
        : {}),
      error: OUTBOX_TAKEOVER_SUPPRESSED_ERROR
    })
    return mapDurableOutboxRow(updatedRow)
  }

  private repositoryNow(): Date {
    const value = new Date(this.clock())
    if (!Number.isFinite(value.getTime())) {
      throw new DomainError(
        'validation_failed',
        'Outbox repository clock returned an invalid date'
      )
    }
    return value
  }

  private mapTask(row: {
    id: string
    session_id: string
    title: string
    description: string
    priority: TaskPriority
    source: string
    status: TaskRecord['status']
    idempotency_key: string
    created_at: Date
  }): TaskRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      source: row.source,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      createdAt: row.created_at
    }
  }

  private mapApproval(row: {
    id: string
    session_id: string
    proposed_action: string
    summary: string
    risk_level: ApprovalRequestRecord['riskLevel']
    status: ApprovalRequestRecord['status']
    decided_by: string | null
    decided_at: Date | null
    created_at: Date
  }): ApprovalRequestRecord {
    return {
      id: row.id,
      sessionId: row.session_id,
      proposedAction: row.proposed_action,
      summary: row.summary,
      riskLevel: row.risk_level,
      status: row.status,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at,
      createdAt: row.created_at
    }
  }

  private mapAuditEvent(row: AuditEventRow): AuditEventRecord {
    return {
      id: row.id,
      ...(row.tenant_id ? { tenantId: row.tenant_id } : {}),
      type: row.type,
      actorType: row.actor_type,
      actorId: row.actor_id,
      correlationId: row.correlation_id,
      policyVersion: row.policy_version,
      payload: sanitizeAuditEvidencePayload(row.payload).payload,
      createdAt: row.created_at
    }
  }
}

interface AuditEventRow {
  id: string
  tenant_id?: TenantId | null
  type: AuditEventRecord['type']
  actor_type: AuditEventRecord['actorType']
  actor_id: string
  correlation_id: string
  policy_version: string
  payload: unknown
  created_at: Date
}

interface AuditEvidenceCheckpointRow {
  tenant_id: TenantId
  id: string
  filters: unknown
  event_ids: unknown
  event_count: number
  evidence_digest: string
  status: AuditEvidenceCheckpointStatus
  created_by: string
  updated_by: string
  created_at: Date
  updated_at: Date
}

function requireCheckpointTenant(rawTenantId?: TenantId): TenantId {
  const parsed = TenantIdSchema.safeParse(rawTenantId)
  if (!parsed.success) {
    throw new DomainError('unauthorized', 'Tenant scope is required')
  }
  return parsed.data
}

function assertCheckpointEvents(
  input: AuditEvidenceCheckpointCreateInput,
  events: AuditEventRecord[],
  requestedIds: string[]
): void {
  if (events.length !== requestedIds.length) {
    throw new DomainError(
      'invalid_action',
      'All audit evidence events must exist in the tenant scope'
    )
  }
  const filters = normalizeAuditEvidenceCheckpointFilters(input.filters ?? {})
  if (events.some((event) => !auditEventMatches(event, filters))) {
    throw new DomainError(
      'invalid_action',
      'All audit evidence events must match the checkpoint filters'
    )
  }
}

function mapAuditEvidenceCheckpoint(
  row: AuditEvidenceCheckpointRow
): AuditEvidenceCheckpointRecord {
  const parsedFilters = AuditEvidenceCheckpointFiltersSchema.parse(row.filters)
  const parsedEventIds =
    AuditEvidenceCheckpointCreateInputSchema.shape.eventIds.parse(row.event_ids)
  return {
    tenantId: TenantIdSchema.parse(row.tenant_id),
    id: AuditEvidenceCheckpointIdSchema.parse(row.id),
    filters: { ...parsedFilters },
    eventIds: [...parsedEventIds],
    eventCount: row.event_count,
    evidenceDigest: row.evidence_digest,
    status: AuditEvidenceCheckpointStatusSchema.parse(row.status),
    createdBy: AuditEvidenceCheckpointActorIdSchema.parse(row.created_by),
    updatedBy: AuditEvidenceCheckpointActorIdSchema.parse(row.updated_by),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

function buildAuditWhereClause(
  filters: AuditEvidenceFilters,
  tenantId?: TenantId,
  tenantIsolation = false
): {
  sql: string
  values: unknown[]
} {
  const clauses: string[] = []
  const values: unknown[] = []

  if (filters.sessionId) {
    values.push(filters.sessionId)
    clauses.push(`payload->>'sessionId' = $${values.length}`)
  }
  if (filters.correlationId) {
    values.push(filters.correlationId)
    clauses.push(`correlation_id = $${values.length}`)
  }
  if (filters.type) {
    values.push(filters.type)
    clauses.push(`type = $${values.length}`)
  }
  if (filters.actorId) {
    values.push(filters.actorId)
    clauses.push(`actor_id = $${values.length}`)
  }
  if (tenantId) {
    values.push(tenantId)
    const tenantParameter = `$${values.length}`
    clauses.push(
      tenantIsolation
        ? `audit_events.tenant_id = ${tenantParameter}`
        : `(
            EXISTS (
              SELECT 1
              FROM sessions
              INNER JOIN conversations ON conversations.id = sessions.conversation_id
              WHERE sessions.id = payload->>'sessionId'
                AND conversations.tenant_id = ${tenantParameter}
            )
          )`
    )
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values
  }
}

function assertInboundRuntimeCorrelation(correlationId: unknown): void {
  if (!CorrelationIdSchema.safeParse(correlationId).success) {
    throw new DomainError(
      'validation_failed',
      'Inbound runtime correlation ID is invalid'
    )
  }
}

function assertInboundToolAuditParents(
  trace: TestRunTrace,
  rawEvents: unknown
): asserts rawEvents is PluginAuditEvent[] {
  if (!Array.isArray(rawEvents)) {
    throw new DomainError(
      'validation_failed',
      'Inbound runtime tool audit events are invalid'
    )
  }

  for (const rawEvent of rawEvents) {
    try {
      if (
        typeof rawEvent !== 'object' ||
        rawEvent === null ||
        Array.isArray(rawEvent)
      ) {
        throw new DomainError(
          'validation_failed',
          'Inbound runtime tool audit event is invalid'
        )
      }
      const event = rawEvent as Record<string, unknown>
      if (
        !CorrelationIdSchema.safeParse(event.correlationId).success ||
        !TraceIdSchema.safeParse(event.traceId).success ||
        event.traceId !== trace.traceId ||
        !TenantIdSchema.safeParse(event.tenantId).success ||
        event.tenantId !== trace.tenantId ||
        !AgentIdSchema.safeParse(event.agentId).success ||
        event.agentId !== trace.agentId ||
        !AgentVersionIdSchema.safeParse(event.versionId).success ||
        event.versionId !== trace.versionId
      ) {
        throw new DomainError(
          'validation_failed',
          'Inbound runtime tool audit trace parent is invalid'
        )
      }
    } catch (error) {
      if (error instanceof DomainError) throw error
      throw new DomainError(
        'validation_failed',
        'Inbound runtime tool audit event is invalid'
      )
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

function hasTenantContext(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'tenantId' in payload &&
    typeof payload.tenantId === 'string' &&
    payload.tenantId.length > 0
  )
}

function readPayloadTenantId(payload: unknown): TenantId | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('tenantId' in payload)
  ) {
    return null
  }
  const parsed = TenantIdSchema.safeParse(payload.tenantId)
  return parsed.success ? parsed.data : null
}

function mergeOutboxPayload(
  payload: unknown,
  context: { conversationId: string; sessionId: string; messageId: string }
): unknown {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    !Array.isArray(payload)
  ) {
    return { ...(payload as Record<string, unknown>), ...context }
  }
  return { value: payload, ...context }
}
