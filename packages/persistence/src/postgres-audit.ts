import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TenantIdSchema,
  TraceIdSchema,
  type HumanTakeoverState,
  type PluginAuditEvent,
  type TenantId,
  type TestRunTrace
} from '@cvg/platform'
import {
  CorrelationIdSchema,
  createDomainId,
  DomainError,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  type Channel
} from '@cvg/shared'
import { auditEventMatches } from './repositories/audit-repository.ts'
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
  AuditEventRecord,
  AuditEvidenceFilters,
  ConversationListItem,
  ConversationPage,
  ConversationRecord,
  MessageRecord,
  PaginationInput,
  SessionRecord
} from './schema.ts'
import {
  hasTenantContext,
  isUniqueViolation,
  readPayloadTenantId,
  type AuditEventRow,
  type AuditEvidenceCheckpointRow,
  type PostgresQueryable
} from './postgres.ts'

/**
 * Explicit dependency surface for the extracted audit and checkpoint domain.
 * The repository builds it from its own private members, so the exported class
 * keeps its exact public contract.
 */
export interface PostgresAuditContext {
  readonly client: PostgresQueryable
  readonly tenantIsolation: boolean
  findApprovalDecisionAudit(payload: unknown): Promise<AuditEventRecord | null>
  hasAuditTenantColumn(): Promise<boolean>
  listAuditEventsByIds(
    rawIds: string[],
    rawTenantId?: TenantId
  ): Promise<AuditEventRecord[]>
}

export async function appendAudit(
  ctx: PostgresAuditContext,
  input: Omit<AuditEventRecord, 'id' | 'createdAt'>
): Promise<AuditEventRecord> {
  const tenantId = ctx.tenantIsolation
    ? TenantIdSchema.safeParse(input.tenantId)
    : null
  if (ctx.tenantIsolation && (!tenantId || !tenantId.success)) {
    throw new DomainError('invalid_action', 'Tenant scope is required')
  }
  if (
    ctx.tenantIsolation &&
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
  // AUD19-003: exactly-once approval decisions. A repeated
  // `approval_decision` for the same (tenant, approvalId, decision)
  // converges on the recorded event instead of duplicating it.
  if (input.type === 'approval_decision') {
    const replay = await ctx.findApprovalDecisionAudit(payload)
    if (replay) return replay
  }
  const event: AuditEventRecord = {
    ...input,
    payload,
    id: createDomainId('audit'),
    createdAt: new Date()
  }
  try {
    if (ctx.tenantIsolation) {
      await ctx.client.query(
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
    } else if (input.tenantId && (await ctx.hasAuditTenantColumn())) {
      // AUD19-003: tenant ownership is written explicitly on schemas that
      // carry the isolation column. The column probe is cached per instance
      // (schemas do not change under a running repository); on the legacy
      // initial schema the probe selects the branch below. On modern schemas
      // without a scope the NOT NULL constraint rejects fail-closed.
      await ctx.client.query(
        `INSERT INTO audit_events (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          input.tenantId,
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
      // Legacy initial-schema shape (0000 has no tenant_id column); kept so
      // migration-smoke fixtures on the base schema keep working.
      await ctx.client.query(
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
  } catch (error) {
    // AUD19-003: concurrent duplicate appends race the SELECT above; the
    // 0021 partial unique index turns the loser into a convergence read.
    if (input.type === 'approval_decision' && isUniqueViolation(error)) {
      const replay = await ctx.findApprovalDecisionAudit(payload)
      if (replay) return replay
    }
    throw error
  }
  return event
}

export async function createAuditEvidenceCheckpoint(
  ctx: PostgresAuditContext,
  rawInput: AuditEvidenceCheckpointCreateInput,
  rawCreatedBy: string,
  rawTenantId?: TenantId
): Promise<AuditEvidenceCheckpointRecord> {
  const tenantId = requireCheckpointTenant(rawTenantId)
  const input = AuditEvidenceCheckpointCreateInputSchema.parse(rawInput)
  const createdBy = AuditEvidenceCheckpointActorIdSchema.parse(rawCreatedBy)
  await ctx.client.query('BEGIN')
  try {
    const events = await ctx.listAuditEventsByIds(input.eventIds, tenantId)
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
      await ctx.client.query(
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
    await ctx.client.query('COMMIT')
    return cloneAuditEvidenceCheckpoint(checkpoint)
  } catch (error) {
    await ctx.client.query('ROLLBACK')
    throw error
  }
}

export async function transitionAuditEvidenceCheckpoint(
  ctx: PostgresAuditContext,
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
  await ctx.client.query('BEGIN')
  try {
    const current = await ctx.client.query<AuditEvidenceCheckpointRow>(
      `SELECT tenant_id, id, filters, event_ids, event_count, evidence_digest, status,
              created_by, updated_by, created_at, updated_at
       FROM audit_evidence_checkpoints
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, id]
    )
    const row = current.rows[0]
    if (!row) {
      await ctx.client.query('COMMIT')
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
    const updated = await ctx.client.query<AuditEvidenceCheckpointRow>(
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
    await ctx.client.query('COMMIT')
    return mapAuditEvidenceCheckpoint(result)
  } catch (error) {
    await ctx.client.query('ROLLBACK')
    throw error
  }
}

export async function timeline(
  ctx: PostgresAuditContext,
  tenantId: TenantId,
  conversationId: string
): Promise<{ messages: MessageRecord[]; sessions: SessionRecord[] }> {
  const sessionAgentColumns = ctx.tenantIsolation
    ? 'sessions.agent_id, sessions.agent_version_id'
    : 'NULL::text AS agent_id, NULL::text AS agent_version_id'
  const messages = await ctx.client.query<{
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
  const sessions = await ctx.client.query<{
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

export function mapAuditEvent(
  ctx: PostgresAuditContext,
  row: AuditEventRow
): AuditEventRecord {
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

export async function listPage(
  ctx: PostgresAuditContext,
  tenantId: TenantId,
  input: PaginationInput
): Promise<ConversationPage> {
  const result = await ctx.client.query<{
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

export function requireCheckpointTenant(rawTenantId?: TenantId): TenantId {
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

export function mapAuditEvidenceCheckpoint(
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

export function buildAuditWhereClause(
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

export function assertInboundToolAuditParents(
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
