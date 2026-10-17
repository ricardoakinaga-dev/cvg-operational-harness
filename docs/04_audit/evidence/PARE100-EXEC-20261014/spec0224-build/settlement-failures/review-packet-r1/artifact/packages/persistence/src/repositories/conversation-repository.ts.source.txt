import {
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
  transitionHumanTakeover,
  type AgentId,
  type AgentVersionId,
  type HumanTakeoverEvent,
  type TenantId
} from '@cvg/platform'
import type { InMemoryDatabase } from '../db.ts'
import { OutboxRepository } from '../outbox.ts'
import type { OutboxEnqueueInput } from '../outbox.ts'
import { createSenderRefFingerprint } from '../sender-fingerprint.ts'
import type {
  ConversationListItem,
  ConversationPage,
  ConversationRecord,
  InboundRuntimeContext,
  MessageRecord,
  PaginationInput,
  SessionRecord
} from '../schema.ts'

export class ConversationRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  createWithSessionAndOutbox(
    input: Parameters<ConversationRepository['createWithSession']>[0],
    outboxInput: OutboxEnqueueInput
  ): ReturnType<ConversationRepository['createWithSession']> & {
    outbox: import('../schema.ts').OutboxEventRecord
  } {
    const snapshot = {
      conversations: this.db.state.conversations,
      sessions: this.db.state.sessions,
      messages: this.db.state.messages,
      outbox: this.db.state.outbox,
      outboxAttempts: this.db.state.outboxAttempts,
      outboxEffects: this.db.state.outboxEffects,
      auditEvents: this.db.state.auditEvents
    }
    try {
      const created = this.createWithSession(input)
      const outbox = new OutboxRepository(this.db).enqueue({
        ...outboxInput,
        correlationId:
          outboxInput.correlationId ?? created.conversation.correlationId,
        conversationId: created.conversation.id,
        sessionId: created.session.id,
        inboundMessageId: created.message.id,
        payload: {
          ...(typeof outboxInput.payload === 'object' &&
          outboxInput.payload !== null
            ? outboxInput.payload
            : { value: outboxInput.payload }),
          conversationId: created.conversation.id,
          sessionId: created.session.id,
          messageId: created.message.id
        }
      })
      return { ...created, outbox }
    } catch (error) {
      this.db.state.conversations = snapshot.conversations
      this.db.state.sessions = snapshot.sessions
      this.db.state.messages = snapshot.messages
      this.db.state.outbox = snapshot.outbox
      this.db.state.outboxAttempts = snapshot.outboxAttempts
      this.db.state.outboxEffects = snapshot.outboxEffects
      this.db.state.auditEvents = snapshot.auditEvents
      throw error
    }
  }

  findByExternalMessage(
    tenantId: TenantId,
    channel: Channel,
    externalMessageId: string
  ): MessageRecord | null {
    return (
      this.db.state.messages.find((message) => {
        const conversation = this.db.state.conversations.find(
          (item) => item.id === message.conversationId
        )
        return (
          conversation?.tenantId === tenantId &&
          conversation?.channel === channel &&
          message.externalMessageId === externalMessageId
        )
      }) ?? null
    )
  }

  createWithSession(input: {
    tenantId: TenantId
    channel: Channel
    senderRef: string
    externalMessageId: string
    body: string
    conversationId?: string | undefined
    sessionId?: string | undefined
  }): {
    conversation: ConversationRecord
    session: SessionRecord
    message: MessageRecord
  } {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const now = new Date()
    if (input.conversationId || input.sessionId) {
      const existingConversation = this.db.state.conversations.find(
        (candidate) =>
          candidate.id === input.conversationId &&
          candidate.tenantId === tenantId
      )
      const existingSession = this.db.state.sessions.find(
        (candidate) =>
          candidate.id === input.sessionId &&
          candidate.conversationId === input.conversationId
      )
      if (!existingConversation || !existingSession) {
        throw new DomainError(
          'invalid_action',
          'Conversation session not found'
        )
      }
      if (
        existingConversation.channel !== input.channel ||
        existingConversation.senderRefHash !==
          createSenderRefFingerprint(tenantId, input.senderRef) ||
        existingSession.status === 'closed' ||
        existingConversation.status === 'resolved' ||
        existingConversation.status === 'archived'
      ) {
        throw new DomainError(
          'invalid_action',
          'Conversation session is not eligible for continuation'
        )
      }
      const conversation: ConversationRecord = {
        ...existingConversation,
        updatedAt: now
      }
      const message: MessageRecord = {
        id: createDomainId('msg'),
        conversationId: conversation.id,
        externalMessageId: input.externalMessageId,
        direction: 'inbound',
        body: redactSensitiveText(input.body),
        runtimeStatus: 'pending',
        createdAt: now
      }
      this.db.state.conversations = this.db.state.conversations.map(
        (candidate) =>
          candidate.id === conversation.id ? conversation : candidate
      )
      this.db.state.messages = [...this.db.state.messages, message]
      return { conversation, session: existingSession, message }
    }
    const conversation: ConversationRecord = {
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
    const session: SessionRecord = {
      id: createDomainId('sess'),
      conversationId: conversation.id,
      status: 'open',
      takeoverState: 'BOT_ACTIVE',
      createdAt: now,
      updatedAt: now
    }
    const message: MessageRecord = {
      id: createDomainId('msg'),
      conversationId: conversation.id,
      externalMessageId: input.externalMessageId,
      direction: 'inbound',
      body: redactSensitiveText(input.body),
      runtimeStatus: 'pending',
      createdAt: now
    }
    this.db.state.conversations = [...this.db.state.conversations, conversation]
    this.db.state.sessions = [...this.db.state.sessions, session]
    this.db.state.messages = [...this.db.state.messages, message]
    return { conversation, session, message }
  }

  bindSessionAgentVersion(
    rawTenantId: TenantId,
    sessionId: string,
    rawAgentId: AgentId,
    rawAgentVersionId: AgentVersionId
  ): SessionRecord | null {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const agentId = AgentIdSchema.parse(rawAgentId)
    const agentVersionId = AgentVersionIdSchema.parse(rawAgentVersionId)
    const existing = this.db.state.sessions.find((candidate) => {
      if (candidate.id !== sessionId) return false
      const conversation = this.db.state.conversations.find(
        (item) => item.id === candidate.conversationId
      )
      return conversation?.tenantId === tenantId
    })
    if (!existing) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    const hasAgent = existing.agentId !== undefined
    const hasVersion = existing.agentVersionId !== undefined
    if (hasAgent !== hasVersion) {
      throw new DomainError(
        'invalid_action',
        'Session agent binding is incomplete'
      )
    }
    if (hasAgent && hasVersion) {
      if (
        existing.agentId !== agentId ||
        existing.agentVersionId !== agentVersionId
      ) {
        throw new DomainError(
          'conflict',
          'Session agent binding cannot be replaced'
        )
      }
      return { ...existing }
    }
    const updated: SessionRecord = {
      ...existing,
      agentId,
      agentVersionId,
      updatedAt: new Date()
    }
    this.db.state.sessions = this.db.state.sessions.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
    return { ...updated }
  }

  appendOutboundMessage(input: {
    tenantId: TenantId
    conversationId: string
    externalMessageId: string
    body: string
  }): MessageRecord {
    const tenantId = TenantIdSchema.parse(input.tenantId)
    const conversation = this.db.state.conversations.find(
      (candidate) =>
        candidate.id === input.conversationId && candidate.tenantId === tenantId
    )
    if (!conversation) {
      throw new DomainError('invalid_action', 'Conversation not found')
    }
    const message: MessageRecord = {
      id: createDomainId('msg'),
      conversationId: conversation.id,
      externalMessageId: input.externalMessageId,
      direction: 'outbound',
      body: redactSensitiveText(input.body),
      createdAt: new Date()
    }
    this.db.state.messages = [...this.db.state.messages, message]
    this.db.state.conversations = this.db.state.conversations.map(
      (candidate) =>
        candidate.id === conversation.id
          ? { ...candidate, updatedAt: message.createdAt }
          : candidate
    )
    return message
  }

  markInboundRuntimeCompleted(messageId: string, tenantId: TenantId): boolean {
    const scope = TenantIdSchema.parse(tenantId)
    const target = this.db.state.messages.find((message) => {
      if (
        message.id !== messageId ||
        message.direction !== 'inbound' ||
        message.runtimeStatus !== 'pending'
      ) {
        return false
      }
      const conversation = this.db.state.conversations.find(
        (candidate) => candidate.id === message.conversationId
      )
      return conversation?.tenantId === scope
    })
    if (!target) return false
    this.db.state.messages = this.db.state.messages.map((message) =>
      message.id === messageId
        ? { ...message, runtimeStatus: 'completed' as const }
        : message
    )
    return true
  }

  findInboundRuntimeContext(
    tenantId: TenantId,
    conversationId: string,
    sessionId: string | null,
    messageId: string
  ): InboundRuntimeContext | null {
    const scope = TenantIdSchema.parse(tenantId)
    const conversation = this.db.state.conversations.find(
      (candidate) =>
        candidate.id === conversationId && candidate.tenantId === scope
    )
    const message = this.db.state.messages.find(
      (candidate) =>
        candidate.id === messageId &&
        candidate.conversationId === conversationId &&
        candidate.direction === 'inbound'
    )
    if (!conversation || !message) return null
    const session = sessionId
      ? (this.db.state.sessions.find(
          (candidate) =>
            candidate.id === sessionId &&
            candidate.conversationId === conversationId
        ) ?? null)
      : null
    if (sessionId && !session) return null
    return {
      message: { ...message },
      channel: conversation.channel,
      senderRef: conversation.senderRef,
      correlationId: conversation.correlationId,
      session
    }
  }

  transitionTakeover(
    rawTenantId: TenantId,
    sessionId: string,
    event: HumanTakeoverEvent
  ): SessionRecord | null {
    const tenantId = TenantIdSchema.parse(rawTenantId)
    const existing = this.db.state.sessions.find((candidate) => {
      if (candidate.id !== sessionId) return false
      const conversation = this.db.state.conversations.find(
        (item) => item.id === candidate.conversationId
      )
      return conversation?.tenantId === tenantId
    })
    const conversation = existing
      ? this.db.state.conversations.find(
          (item) => item.id === existing.conversationId
        )
      : undefined
    if (
      !existing ||
      existing.status === 'closed' ||
      conversation?.status === 'resolved' ||
      conversation?.status === 'archived'
    ) {
      return null
    }
    const updated: SessionRecord = {
      ...existing,
      takeoverState: transitionHumanTakeover(existing.takeoverState, event),
      updatedAt: new Date()
    }
    this.db.state.sessions = this.db.state.sessions.map((candidate) =>
      candidate.id === updated.id ? updated : candidate
    )
    const nextConversationStatus =
      updated.takeoverState === 'BOT_ACTIVE' ? 'active' : 'waiting_human'
    this.db.state.conversations = this.db.state.conversations.map(
      (conversation) =>
        conversation.id === updated.conversationId
          ? {
              ...conversation,
              status: nextConversationStatus,
              updatedAt: updated.updatedAt
            }
          : conversation
    )
    return updated
  }

  timeline(
    tenantId: TenantId,
    conversationId: string
  ): {
    messages: MessageRecord[]
    sessions: SessionRecord[]
  } {
    const scope = TenantIdSchema.parse(tenantId)
    const conversation = this.db.state.conversations.find(
      (candidate) =>
        candidate.id === conversationId && candidate.tenantId === scope
    )
    if (!conversation) return { messages: [], sessions: [] }
    return {
      messages: this.db.state.messages.filter(
        (message) => message.conversationId === conversation.id
      ),
      sessions: this.db.state.sessions.filter(
        (session) => session.conversationId === conversation.id
      )
    }
  }

  listPage(tenantId: TenantId, input: PaginationInput): ConversationPage {
    const scope = TenantIdSchema.parse(tenantId)
    const indexedItems = this.db.state.conversations
      .filter((conversation) => conversation.tenantId === scope)
      .map((conversation, index) => ({
        item: this.toListItem(conversation),
        index
      }))
    const items = indexedItems
      .sort((left, right) => {
        const leftTime =
          left.item.lastMessageAt?.getTime() ?? left.item.updatedAt.getTime()
        const rightTime =
          right.item.lastMessageAt?.getTime() ?? right.item.updatedAt.getTime()
        if (rightTime !== leftTime) return rightTime - leftTime
        return right.index - left.index
      })
      .slice(input.offset, input.offset + input.limit)
      .map(({ item }) => item)

    const total = indexedItems.length
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

  private toListItem(conversation: ConversationRecord): ConversationListItem {
    const lastMessage = this.db.state.messages
      .filter((message) => message.conversationId === conversation.id)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      )[0]
    const openSession = this.db.state.sessions
      .filter(
        (session) =>
          session.conversationId === conversation.id &&
          session.status === 'open'
      )
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      )[0]

    return {
      id: conversation.id,
      channel: conversation.channel,
      senderRef: conversation.senderRef,
      status: conversation.status,
      correlationId: conversation.correlationId,
      openSessionId: openSession?.id ?? null,
      lastMessageBody: lastMessage?.body ?? null,
      lastMessageAt: lastMessage?.createdAt ?? null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }
  }
}
