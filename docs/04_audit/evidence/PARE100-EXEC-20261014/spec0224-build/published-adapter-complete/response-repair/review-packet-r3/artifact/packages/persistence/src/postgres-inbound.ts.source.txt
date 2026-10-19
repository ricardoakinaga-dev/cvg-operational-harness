import { createInboundIdempotencyKey } from './postgres-outbox.ts'
import { assertInboundToolAuditParents } from './postgres-audit.ts'
import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainError,
  redactSensitiveText,
  type Channel
} from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  TenantIdSchema,
  sanitizeTraceForPersistence,
  type AgentId,
  type AgentVersionId,
  type HumanTakeoverState,
  type TenantId,
  type TestRunTrace
} from '@cvg/platform'
import type {
  DurableOutboxEventRecord,
  InboundRuntimeCompletionInput,
  PostgresOutboxEnqueueInput,
  PostgresQueryable,
  PostgresRuntimeRepository
} from './postgres.ts'
import type {
  ConversationRecord,
  InboundRuntimeContext,
  MessageRecord,
  SessionRecord
} from './schema.ts'
import { createSenderRefFingerprint } from './sender-fingerprint.ts'

export interface PostgresInboundContext {
  client: PostgresQueryable
  tenantIsolation: boolean
  enqueue: PostgresRuntimeRepository['enqueue']
  transitionTakeoverInTransaction: PostgresRuntimeRepository['transitionTakeoverInTransaction']
  appendAudit: PostgresRuntimeRepository['appendAudit']
  appendOutboundMessage: PostgresRuntimeRepository['appendOutboundMessage']
  markInboundRuntimeCompleted: PostgresRuntimeRepository['markInboundRuntimeCompleted']
}

export async function findByExternalMessage(
  ctx: PostgresInboundContext,
  tenantId: TenantId,
  channel: Channel,
  externalMessageId: string
): Promise<MessageRecord | null> {
  const result = await ctx.client.query<{
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

export async function createWithSession(
  ctx: PostgresInboundContext,
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
  const sessionAgentColumns = ctx.tenantIsolation
    ? 'sessions.agent_id AS session_agent_id, sessions.agent_version_id AS session_agent_version_id'
    : 'NULL::text AS session_agent_id, NULL::text AS session_agent_version_id'

  await ctx.client.query('BEGIN')
  try {
    if (input.conversationId || input.sessionId) {
      const existing = await ctx.client.query<{
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
      await ctx.client.query(
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
      await ctx.client.query(
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
      if (ctx.tenantIsolation) {
        await ctx.client.query(
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
        await ctx.client.query(
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
    await ctx.client.query(
      `INSERT INTO idempotency (tenant_id, key, resource_id, created_at)
         VALUES ($1, $2, $3, $4)`,
      [tenantId, idempotencyKey, message.id, now]
    )
    if (ctx.tenantIsolation) {
      await ctx.client.query(
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
      await ctx.client.query(
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
      ? await ctx.enqueue(
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
          ctx.client
        )
      : undefined
    await ctx.client.query('COMMIT')
    if (outbox) return { conversation, session, message, outbox }
  } catch (error) {
    await ctx.client.query('ROLLBACK')
    throw error
  }

  return { conversation, session, message }
}

export async function bindSessionAgentVersion(
  ctx: PostgresInboundContext,
  rawTenantId: TenantId,
  sessionId: string,
  rawAgentId: AgentId,
  rawAgentVersionId: AgentVersionId
): Promise<SessionRecord | null> {
  if (!ctx.tenantIsolation) {
    throw new DomainError(
      'invalid_action',
      'Session agent pinning requires tenant-scoped persistence'
    )
  }
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const agentId = AgentIdSchema.parse(rawAgentId)
  const agentVersionId = AgentVersionIdSchema.parse(rawAgentVersionId)
  await ctx.client.query('BEGIN')
  try {
    const result = await ctx.client.query<{
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
      await ctx.client.query('COMMIT')
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
      if (row.agent_id !== agentId || row.agent_version_id !== agentVersionId) {
        throw new DomainError(
          'conflict',
          'Session agent binding cannot be replaced'
        )
      }
      await ctx.client.query('COMMIT')
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
    await ctx.client.query(
      `UPDATE sessions
         SET agent_id = $3, agent_version_id = $4, updated_at = $5
         WHERE id = $1 AND tenant_id = $2`,
      [row.id, tenantId, agentId, agentVersionId, updatedAt]
    )
    await ctx.client.query('COMMIT')
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
    await ctx.client.query('ROLLBACK')
    throw error
  }
}

export async function appendOutboundMessage(
  ctx: PostgresInboundContext,
  input: {
    tenantId: TenantId
    conversationId: string
    externalMessageId: string
    body: string
  }
): Promise<MessageRecord> {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const conversation = await ctx.client.query<{
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
  if (ctx.tenantIsolation) {
    await ctx.client.query(
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
    await ctx.client.query(
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
  await ctx.client.query(
    `UPDATE conversations SET updated_at = $2 WHERE id = $1 AND tenant_id = $3`,
    [input.conversationId, message.createdAt, tenantId]
  )
  return message
}

export async function markInboundRuntimeCompleted(
  ctx: PostgresInboundContext,
  messageId: string,
  rawTenantId: TenantId
): Promise<boolean> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const result = ctx.tenantIsolation
    ? await ctx.client.query(
        `UPDATE messages
           SET runtime_status = 'completed'
           WHERE id = $1
             AND tenant_id = $2
             AND direction = 'inbound'
             AND runtime_status = 'pending'
           RETURNING id`,
        [messageId, tenantId]
      )
    : await ctx.client.query(
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

export async function findInboundRuntimeContext(
  ctx: PostgresInboundContext,
  rawTenantId: TenantId,
  conversationId: string,
  sessionId: string | null,
  messageId: string
): Promise<InboundRuntimeContext | null> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const sessionAgentColumns = ctx.tenantIsolation
    ? 'sessions.agent_id, sessions.agent_version_id'
    : 'NULL::text AS agent_id, NULL::text AS agent_version_id'
  const result = await ctx.client.query<{
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
        ...(row.agent_id ? { agentId: AgentIdSchema.parse(row.agent_id) } : {}),
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

export async function completeInboundRuntime(
  ctx: PostgresInboundContext,
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
  await ctx.client.query('BEGIN')
  try {
    const inbound = ctx.tenantIsolation
      ? await ctx.client.query<{
          runtime_status: 'pending' | 'completed'
        }>(
          `SELECT runtime_status
             FROM messages
             WHERE id = $1 AND tenant_id = $2 AND direction = 'inbound'
             FOR UPDATE`,
          [input.inboundMessageId, tenantId]
        )
      : await ctx.client.query<{
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
      await ctx.client.query('COMMIT')
      return { status: 'completed' }
    }
    if (input.sessionId) {
      const session = await ctx.client.query<{
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
        await ctx.client.query('COMMIT')
        return { status: 'paused' }
      }
    }

    if (trace.handoff.requested && input.sessionId) {
      const handoff = await ctx.transitionTakeoverInTransaction(
        tenantId,
        input.sessionId,
        'request_handoff'
      )
      if (!handoff) {
        await ctx.client.query('COMMIT')
        return { status: 'paused' }
      }
      await ctx.appendAudit({
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
      await ctx.appendOutboundMessage({
        tenantId,
        conversationId: input.conversationId,
        externalMessageId: `runtime:${trace.traceId}`,
        body: trace.response.text
      })
    }
    for (const event of input.toolAuditEvents) {
      await ctx.appendAudit({
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
    const markedCompleted = await ctx.markInboundRuntimeCompleted(
      input.inboundMessageId,
      tenantId
    )
    if (!markedCompleted) {
      throw new DomainError(
        'invalid_action',
        'Inbound runtime completion marker was not updated'
      )
    }
    await ctx.appendAudit({
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
    await ctx.client.query('COMMIT')
    return { status: 'completed' }
  } catch (error) {
    await ctx.client.query('ROLLBACK')
    throw error
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
