import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import { ConversationRepository } from '../repositories/conversation-repository.ts'

const tenantA = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000a01'
)
const tenantB = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000a02'
)
const agentId = 'agent_00000000-0000-4000-8000-000000000a01' as const
const agentVersionId =
  'agent_version_00000000-0000-4000-8000-000000000a01' as const
const otherAgentId = 'agent_00000000-0000-4000-8000-000000000a02' as const
const correlationId = 'corr_00000000-0000-4000-8000-000000000a01'

function fixture() {
  const db = new InMemoryDatabase()
  return { db, repository: new ConversationRepository(db) }
}

function createConversation(repository: ConversationRepository) {
  return repository.createWithSession({
    tenantId: tenantA,
    channel: 'web',
    senderRef: 'owner@example.test',
    externalMessageId: 'external-conversation-a01',
    body: 'contato owner@example.test'
  })
}

describe('conversation repository behavior', () => {
  it('creates a conversation, session and message, redacting sensitive text', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)

    expect(created.conversation.tenantId).toBe(tenantA)
    expect(created.conversation.status).toBe('active')
    expect(created.session.takeoverState).toBe('BOT_ACTIVE')
    expect(created.message.body).toBe('contato [redacted-email]')
    expect(created.message.runtimeStatus).toBe('pending')
    expect(db.state.conversations).toHaveLength(1)
    expect(db.state.sessions).toHaveLength(1)
    expect(db.state.messages).toHaveLength(1)
  })

  it('continues an existing eligible conversation and session', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)
    const continued = repository.createWithSession({
      tenantId: tenantA,
      channel: 'web',
      senderRef: 'owner@example.test',
      externalMessageId: 'external-conversation-a02',
      body: 'second message',
      conversationId: created.conversation.id,
      sessionId: created.session.id
    })

    expect(continued.conversation.id).toBe(created.conversation.id)
    expect(continued.session.id).toBe(created.session.id)
    expect(continued.message.externalMessageId).toBe(
      'external-conversation-a02'
    )
    expect(db.state.messages).toHaveLength(2)
  })

  it('rejects continuation when conversation or session is missing', () => {
    const { repository } = fixture()
    expect(() =>
      repository.createWithSession({
        tenantId: tenantA,
        channel: 'web',
        senderRef: 'owner@example.test',
        externalMessageId: 'external-missing',
        body: 'fixture',
        conversationId: 'conv_missing',
        sessionId: 'sess_missing'
      })
    ).toThrowError(/Conversation session not found/)
  })

  it('rejects continuation for a foreign tenant, channel, sender or closed state', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)
    const base = {
      tenantId: tenantA,
      channel: 'web' as const,
      senderRef: 'owner@example.test',
      externalMessageId: 'external-continuation-reject',
      body: 'fixture',
      conversationId: created.conversation.id,
      sessionId: created.session.id
    }
    expect(() =>
      repository.createWithSession({
        ...base,
        tenantId: tenantB
      })
    ).toThrowError(/Conversation session not found/)
    expect(() =>
      repository.createWithSession({ ...base, channel: 'whatsapp' })
    ).toThrowError(/not eligible for continuation/)
    expect(() =>
      repository.createWithSession({ ...base, senderRef: 'other@example.test' })
    ).toThrowError(/not eligible for continuation/)
    db.state.sessions[0]!.status = 'closed'
    expect(() => repository.createWithSession(base)).toThrowError(
      /not eligible for continuation/
    )
    db.state.sessions[0]!.status = 'open'
    db.state.conversations[0]!.status = 'resolved'
    expect(() => repository.createWithSession(base)).toThrowError(
      /not eligible for continuation/
    )
    db.state.conversations[0]!.status = 'archived'
    expect(() => repository.createWithSession(base)).toThrowError(
      /not eligible for continuation/
    )
  })

  it('creates the conversation, session and outbox event atomically', () => {
    const { repository, db } = fixture()
    const created = repository.createWithSessionAndOutbox(
      {
        tenantId: tenantA,
        channel: 'web',
        senderRef: 'owner@example.test',
        externalMessageId: 'external-outbox-a01',
        body: 'fixture'
      },
      {
        tenantId: tenantA,
        type: 'message.inbound',
        payload: { fixture: true, body: 'owner@example.test' },
        idempotencyKey: 'conversation-outbox-a01'
      }
    )

    expect(created.outbox.conversationId).toBe(created.conversation.id)
    expect(created.outbox.sessionId).toBe(created.session.id)
    expect(created.outbox.inboundMessageId).toBe(created.message.id)
    expect(created.outbox.correlationId).toBe(
      created.conversation.correlationId
    )
    expect(created.outbox.payload).toMatchObject({
      conversationId: created.conversation.id,
      sessionId: created.session.id,
      messageId: created.message.id
    })
    expect(db.state.outbox).toHaveLength(1)

    const wrapped = repository.createWithSessionAndOutbox(
      {
        tenantId: tenantA,
        channel: 'web',
        senderRef: 'owner2@example.test',
        externalMessageId: 'external-outbox-a02',
        body: 'fixture'
      },
      {
        tenantId: tenantA,
        type: 'message.inbound',
        payload: 'plain-payload',
        idempotencyKey: 'conversation-outbox-a02',
        correlationId
      }
    )
    expect(wrapped.outbox.payload).toMatchObject({
      value: '[redacted-outbox-text]'
    })
  })

  it('rolls back the composed create when the outbox enqueue fails', () => {
    const { repository, db } = fixture()
    expect(() =>
      repository.createWithSessionAndOutbox(
        {
          tenantId: tenantA,
          channel: 'web',
          senderRef: 'owner@example.test',
          externalMessageId: 'external-outbox-rollback',
          body: 'fixture'
        },
        {
          tenantId: tenantA,
          type: 'message.inbound',
          payload: { fixture: true },
          idempotencyKey: 'short'
        }
      )
    ).toThrowError(/idempotency key is invalid/)
    expect(db.state.conversations).toHaveLength(0)
    expect(db.state.sessions).toHaveLength(0)
    expect(db.state.messages).toHaveLength(0)
    expect(db.state.outbox).toHaveLength(0)
  })

  it('binds, preserves and rejects incompatible agent versions', () => {
    const { repository } = fixture()
    const created = createConversation(repository)
    expect(() =>
      repository.bindSessionAgentVersion(
        tenantA,
        'sess_missing',
        agentId,
        agentVersionId
      )
    ).toThrowError(/Session not found/)

    const bound = repository.bindSessionAgentVersion(
      tenantA,
      created.session.id,
      agentId,
      agentVersionId
    )
    expect(bound).toMatchObject({ agentId, agentVersionId })

    expect(
      repository.bindSessionAgentVersion(
        tenantA,
        created.session.id,
        agentId,
        agentVersionId
      )
    ).toMatchObject({ agentId, agentVersionId })

    expect(() =>
      repository.bindSessionAgentVersion(
        tenantA,
        created.session.id,
        otherAgentId,
        agentVersionId
      )
    ).toThrowError(/cannot be replaced/)

    repository['db'].state.sessions[0]!.agentId = agentId
    delete repository['db'].state.sessions[0]!.agentVersionId
    expect(() =>
      repository.bindSessionAgentVersion(
        tenantA,
        created.session.id,
        agentId,
        agentVersionId
      )
    ).toThrowError(/binding is incomplete/)
  })

  it('appends outbound messages only inside the tenant scope', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)
    const message = repository.appendOutboundMessage({
      tenantId: tenantA,
      conversationId: created.conversation.id,
      externalMessageId: 'external-outbound-a01',
      body: 'resposta para owner@example.test'
    })
    expect(message.direction).toBe('outbound')
    expect(message.body).toContain('[redacted-email]')
    expect(db.state.messages).toHaveLength(2)
    expect(() =>
      repository.appendOutboundMessage({
        tenantId: tenantB,
        conversationId: created.conversation.id,
        externalMessageId: 'external-outbound-a02',
        body: 'fixture'
      })
    ).toThrowError(/Conversation not found/)
  })

  it('completes pending inbound work only once and only in scope', () => {
    const { repository } = fixture()
    const created = createConversation(repository)
    expect(
      repository.markInboundRuntimeCompleted(created.message.id, tenantB)
    ).toBe(false)
    expect(
      repository.markInboundRuntimeCompleted(created.message.id, tenantA)
    ).toBe(true)
    expect(
      repository.markInboundRuntimeCompleted(created.message.id, tenantA)
    ).toBe(false)
    expect(repository.markInboundRuntimeCompleted('msg_missing', tenantA)).toBe(
      false
    )
  })

  it('loads an inbound runtime context with bounded tenant scope', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)
    const context = repository.findInboundRuntimeContext(
      tenantA,
      created.conversation.id,
      created.session.id,
      created.message.id
    )
    expect(context).toMatchObject({
      channel: 'web',
      senderRef: '[redacted-email]',
      correlationId: created.conversation.correlationId
    })
    expect(context?.session?.id).toBe(created.session.id)

    expect(
      repository.findInboundRuntimeContext(
        tenantA,
        created.conversation.id,
        null,
        created.message.id
      )?.session
    ).toBeNull()
    expect(
      repository.findInboundRuntimeContext(
        tenantB,
        created.conversation.id,
        null,
        created.message.id
      )
    ).toBeNull()
    expect(
      repository.findInboundRuntimeContext(
        tenantA,
        created.conversation.id,
        'sess_missing',
        created.message.id
      )
    ).toBeNull()
    db.state.messages[0]!.direction = 'outbound'
    expect(
      repository.findInboundRuntimeContext(
        tenantA,
        created.conversation.id,
        null,
        created.message.id
      )
    ).toBeNull()
  })

  it('transitions takeover state and mirrors it on the conversation', () => {
    const { repository, db } = fixture()
    const created = createConversation(repository)
    expect(
      repository.transitionTakeover(
        tenantB,
        created.session.id,
        'request_handoff'
      )
    ).toBeNull()
    expect(
      repository.transitionTakeover(tenantA, 'sess_missing', 'request_handoff')
    ).toBeNull()

    const requested = repository.transitionTakeover(
      tenantA,
      created.session.id,
      'request_handoff'
    )
    expect(requested?.takeoverState).toBe('HANDOFF_REQUESTED')
    expect(db.state.conversations[0]?.status).toBe('waiting_human')

    const accepted = repository.transitionTakeover(
      tenantA,
      created.session.id,
      'accept_handoff'
    )
    expect(accepted?.takeoverState).toBe('HUMAN_ACTIVE')
    const resolved = repository.transitionTakeover(
      tenantA,
      created.session.id,
      'resolve_handoff'
    )
    expect(resolved?.takeoverState).toBe('RESOLVED')
    const released = repository.transitionTakeover(
      tenantA,
      created.session.id,
      'release_to_bot'
    )
    expect(released?.takeoverState).toBe('BOT_ACTIVE')
    expect(db.state.conversations[0]?.status).toBe('active')

    db.state.sessions[0]!.status = 'closed'
    expect(
      repository.transitionTakeover(
        tenantA,
        created.session.id,
        'request_handoff'
      )
    ).toBeNull()
    db.state.sessions[0]!.status = 'open'
    db.state.conversations[0]!.status = 'resolved'
    expect(
      repository.transitionTakeover(
        tenantA,
        created.session.id,
        'request_handoff'
      )
    ).toBeNull()
  })

  it('returns a tenant-scoped timeline and pages conversation summaries', () => {
    const { repository, db } = fixture()
    const first = createConversation(repository)
    const second = repository.createWithSession({
      tenantId: tenantA,
      channel: 'whatsapp',
      senderRef: 'second@example.test',
      externalMessageId: 'external-conversation-a03',
      body: 'second'
    })
    const foreign = new ConversationRepository(db)
    expect(foreign.timeline(tenantB, first.conversation.id)).toEqual({
      messages: [],
      sessions: []
    })
    const timeline = repository.timeline(tenantA, first.conversation.id)
    expect(timeline.messages).toHaveLength(1)
    expect(timeline.sessions).toHaveLength(1)

    repository.appendOutboundMessage({
      tenantId: tenantA,
      conversationId: second.conversation.id,
      externalMessageId: 'external-outbound-a03',
      body: 'reply'
    })
    const page = repository.listPage(tenantA, { limit: 1, offset: 0 })
    expect(page.items).toHaveLength(1)
    expect(page.pageInfo).toMatchObject({ total: 2, hasNextPage: true })
    const nextPage = repository.listPage(tenantA, { limit: 1, offset: 1 })
    expect(nextPage.items).toHaveLength(1)
    expect(nextPage.pageInfo.hasNextPage).toBe(false)
    expect(
      repository.listPage(tenantB, { limit: 10, offset: 0 }).items
    ).toHaveLength(0)
    expect(
      repository.listPage(tenantA, { limit: 10, offset: 0 }).items[0]
        ?.lastMessageBody
    ).toBeTruthy()
  })

  it('resolves external message lookups by tenant and channel', () => {
    const { repository } = fixture()
    const created = createConversation(repository)
    expect(
      repository.findByExternalMessage(
        tenantA,
        'web',
        created.message.externalMessageId
      )?.id
    ).toBe(created.message.id)
    expect(
      repository.findByExternalMessage(
        tenantA,
        'whatsapp',
        created.message.externalMessageId
      )
    ).toBeNull()
    expect(
      repository.findByExternalMessage(
        tenantB,
        'web',
        created.message.externalMessageId
      )
    ).toBeNull()
    expect(
      repository.findByExternalMessage(tenantA, 'web', 'external-missing')
    ).toBeNull()
  })
})
