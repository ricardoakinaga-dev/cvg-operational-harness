import {
  assertApprovalCreation,
  validateAttendanceDecision,
  attendanceDecisionAudit,
  type AttendanceApprovalDecision
} from './attendance-approval.ts'
import {
  ack,
  appendDurableOutboxAudit,
  assertOutboxText,
  claimNext,
  createInboundIdempotencyKey,
  enqueue,
  fail,
  mapDurableOutboxRow,
  requeueDeadLetter,
  resolveTakeoverCheck,
  type PostgresOutboxContext
} from './postgres-outbox.ts'
import {
  appendAudit,
  assertInboundToolAuditParents,
  buildAuditWhereClause,
  createAuditEvidenceCheckpoint,
  listPage,
  mapAuditEvent,
  mapAuditEvidenceCheckpoint,
  requireCheckpointTenant,
  timeline,
  transitionAuditEvidenceCheckpoint,
  type PostgresAuditContext
} from './postgres-audit.ts'
import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainError,
  IdempotencyKeySchema,
  redactSensitiveText,
  sanitizeAuditEvidencePayload,
  type Channel,
  type TaskPriority,
  type TaskStatus
} from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TenantIdSchema,
  sanitizeTraceForPersistence,
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
import { summarizeAuditEvents } from './repositories/audit-repository.ts'
import {
  AuditEvidenceCheckpointIdSchema,
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

export interface PostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<QueryResult<T>>
}

export {
  baselineLegacyPostgresMigration,
  legacyRequiredColumns,
  legacyRequiredIndexes,
  readInitialMigrationSql,
  readPostgresMigrationSql,
  runInitialPostgresMigration,
  runPostgresMigrations
} from './postgres-migrations.ts'
export type {
  LegacyMigrationBaselineApproval,
  PostgresMigrationOptions
} from './postgres-migrations.ts'

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
export const OUTBOX_MAX_PAYLOAD_BYTES = 256 * 1024
export const SAFE_LEGACY_OUTBOX_ERRORS = new Set([
  'legacy_outbox_missing_tenant',
  'legacy_inbound_missing_runtime_identifiers',
  'legacy_outbox_event_type_not_controlled',
  'legacy_outbox_quarantined',
  'legacy_processed_without_effect_journal',
  'legacy_failed_without_retry_time'
])

export const outboxSelectColumns = `
  id, tenant_id, type, envelope_version, correlation_id, idempotency_key,
  conversation_id, session_id, agent_id, agent_version_id,
  inbound_message_id, payload, status, created_at, available_at, attempts,
  lease_owner, lease_until, last_error, processed_at, dead_lettered_at,
  parent_event_id`

export interface DurableOutboxRow {
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
   * Dependency surface handed to the extracted durable outbox domain. Built
   * here, where private members are reachable, so the exported class keeps its
   * exact public contract.
   */
  private get outboxContext(): PostgresOutboxContext {
    return {
      client: this.client,
      repositoryNow: () => this.repositoryNow(),
      isOutboxTakeoverActive: (tenantId, event, configuredCheck) =>
        this.isOutboxTakeoverActive(tenantId, event, configuredCheck),
      markOutboxSessionHandoff: (tenantId, sessionId, now) =>
        this.markOutboxSessionHandoff(tenantId, sessionId, now),
      suppressOutboxForTakeover: (event, tenantId, workerId, now) =>
        this.suppressOutboxForTakeover(event, tenantId, workerId, now)
    }
  }

  /**
   * Dependency surface handed to the extracted audit and checkpoint domain.
   * Built here, where private members are reachable, so the exported class
   * keeps its exact public contract.
   */
  private get auditContext(): PostgresAuditContext {
    return {
      client: this.client,
      tenantIsolation: this.tenantIsolation,
      findApprovalDecisionAudit: (payload) =>
        this.findApprovalDecisionAudit(payload),
      hasAuditTenantColumn: () => this.hasAuditTenantColumn(),
      listAuditEventsByIds: (rawIds, rawTenantId) =>
        this.listAuditEventsByIds(rawIds, rawTenantId)
    }
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
    return enqueue(this.outboxContext, rawInput, transactionClient)
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

  /**
   * AUD19-004 — convergence read for redeliveries (see
   * `DurableOutboxAdapter.findByIdempotencyKey`).
   */
  async findByIdempotencyKey(
    rawTenantId: TenantId,
    rawIdempotencyKey: string
  ): Promise<DurableOutboxEventRecord | null> {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const idempotencyKey = IdempotencyKeySchema.parse(rawIdempotencyKey)
    const result = await this.client.query<DurableOutboxRow>(
      `SELECT ${outboxSelectColumns}
       FROM outbox_events
       WHERE tenant_id = $1 AND idempotency_key = $2
       LIMIT 1`,
      [tenantId, idempotencyKey]
    )
    return result.rows[0] ? mapDurableOutboxRow(result.rows[0]) : null
  }

  async claimNext(
    rawInput: OutboxClaimInput
  ): Promise<DurableOutboxEventRecord | null> {
    return claimNext(this.outboxContext, rawInput)
  }

  async ack(
    rawInput: PostgresOutboxAckInput
  ): Promise<DurableOutboxEventRecord> {
    return ack(this.outboxContext, rawInput)
  }

  async fail(rawInput: OutboxFailInput): Promise<DurableOutboxEventRecord> {
    return fail(this.outboxContext, rawInput)
  }

  async requeueDeadLetter(
    rawInput: PostgresOutboxRequeueInput
  ): Promise<DurableOutboxEventRecord> {
    return requeueDeadLetter(this.outboxContext, rawInput)
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

  private auditTenantColumn: boolean | null = null

  /**
   * AUD19-005 — capability probe for the 0001 isolation column. Cached per
   * instance: migrations run at bootstrap, never under a live repository.
   */
  private async hasAuditTenantColumn(): Promise<boolean> {
    if (this.auditTenantColumn === null) {
      const probe = await this.client.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'audit_events'
           AND column_name = 'tenant_id'`
      )
      this.auditTenantColumn = probe.rows.length > 0
    }
    return this.auditTenantColumn
  }

  async appendAudit(
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>
  ): Promise<AuditEventRecord> {
    return appendAudit(this.auditContext, input)
  }

  /**
   * AUD19-003 — idempotency read for approval decisions. Matches the memory
   * `AuditRepository.findApprovalDecision` predicate (payload approvalId +
   * decision, tenant-scoped when row-level isolation is active).
   */
  async findApprovalDecisionAudit(
    payload: unknown
  ): Promise<AuditEventRecord | null> {
    if (typeof payload !== 'object' || payload === null) return null
    const record = payload as { approvalId?: unknown; decision?: unknown }
    if (
      typeof record.approvalId !== 'string' ||
      typeof record.decision !== 'string'
    ) {
      return null
    }
    const tenantColumn = this.tenantIsolation ? ', tenant_id' : ''
    const tenantFilter = this.tenantIsolation
      ? `AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')`
      : ''
    const result = await this.client.query<AuditEventRow>(
      `SELECT id${tenantColumn}, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at
       FROM audit_events
       WHERE type = 'approval_decision'
         AND payload->>'approvalId' = $1
         AND payload->>'decision' = $2
         ${tenantFilter}
       ORDER BY created_at ASC
       LIMIT 1`,
      [record.approvalId, record.decision]
    )
    const row = result.rows[0]
    return row ? this.mapAuditEvent(row) : null
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
    return createAuditEvidenceCheckpoint(
      this.auditContext,
      rawInput,
      rawCreatedBy,
      rawTenantId
    )
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
    return transitionAuditEvidenceCheckpoint(
      this.auditContext,
      rawId,
      rawStatus,
      rawUpdatedBy,
      rawExpectedStatus,
      rawTenantId
    )
  }

  async timeline(
    tenantId: TenantId,
    conversationId: string
  ): Promise<{ messages: MessageRecord[]; sessions: SessionRecord[] }> {
    return timeline(this.auditContext, tenantId, conversationId)
  }

  async listPage(
    tenantId: TenantId,
    input: PaginationInput
  ): Promise<ConversationPage> {
    return listPage(this.auditContext, tenantId, input)
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
    return mapAuditEvent(this.auditContext, row)
  }
}

export interface AuditEventRow {
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

export interface AuditEvidenceCheckpointRow {
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

function assertInboundRuntimeCorrelation(correlationId: unknown): void {
  if (!CorrelationIdSchema.safeParse(correlationId).success) {
    throw new DomainError(
      'validation_failed',
      'Inbound runtime correlation ID is invalid'
    )
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}

export function hasTenantContext(payload: unknown): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'tenantId' in payload &&
    typeof payload.tenantId === 'string' &&
    payload.tenantId.length > 0
  )
}

export function readPayloadTenantId(payload: unknown): TenantId | null {
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
