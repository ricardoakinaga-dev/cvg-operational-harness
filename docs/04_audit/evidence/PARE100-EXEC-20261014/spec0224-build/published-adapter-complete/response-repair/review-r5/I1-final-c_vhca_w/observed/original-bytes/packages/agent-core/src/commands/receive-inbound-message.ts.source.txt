import { createHash } from 'node:crypto'
import { DomainError, ReceiveInboundMessageSchema } from '@cvg/shared'
import type {
  DurableOutboxAdapter,
  OutboxEnqueueInput,
  OutboxEventRecord
} from '@cvg/persistence'
import type {
  ConversationRecord,
  MessageRecord,
  SessionRecord
} from '@cvg/persistence'

type Awaitable<T> = T | Promise<T>

export interface ConversationCommandRepository {
  findByExternalMessage(
    tenantId: string,
    channel: string,
    externalMessageId: string
  ): Awaitable<MessageRecord | null>
  createWithSession(input: {
    tenantId: string
    channel: 'whatsapp' | 'web' | 'internal'
    senderRef: string
    externalMessageId: string
    body: string
    conversationId?: string | undefined
    sessionId?: string | undefined
  }): Awaitable<{
    conversation: ConversationRecord
    session: SessionRecord
    message: MessageRecord
  }>
  /**
   * Optional atomic variant. Persistent implementations insert the inbound
   * message and its outbox intent in one transaction; memory implements the
   * same boundary with a rollback snapshot.
   */
  createWithSessionAndOutbox?: (
    input: {
      tenantId: string
      channel: 'whatsapp' | 'web' | 'internal'
      senderRef: string
      externalMessageId: string
      body: string
      conversationId?: string | undefined
      sessionId?: string | undefined
    },
    outbox: OutboxEnqueueInput
  ) => Awaitable<{
    conversation: ConversationRecord
    session: SessionRecord
    message: MessageRecord
    outbox: OutboxEventRecord
  }>
}

export interface ReceiveInboundMessageDeps {
  conversations: ConversationCommandRepository
  /** Enables the durable acceptance path when paired with the atomic method. */
  outbox?: DurableOutboxAdapter
}

export interface ReceiveInboundMessageResult {
  conversationId: string
  messageId: string
  sessionId: string | null
  accepted: boolean
  runtimeStatus: 'pending' | 'completed'
  correlationId?: string
  outbox?: OutboxEventRecord
}

export async function receiveInboundMessage(
  deps: ReceiveInboundMessageDeps,
  rawInput: unknown
): Promise<ReceiveInboundMessageResult> {
  const input = ReceiveInboundMessageSchema.parse(rawInput)
  const duplicate = await deps.conversations.findByExternalMessage(
    input.tenantId,
    input.channel,
    input.externalMessageId
  )
  if (duplicate) {
    return {
      conversationId: duplicate.conversationId,
      messageId: duplicate.id,
      sessionId: null,
      accepted: false,
      runtimeStatus: duplicate.runtimeStatus ?? 'completed'
    }
  }
  if (!input.body.trim()) {
    throw new DomainError('empty_body', 'Message body is required')
  }
  let result: Awaited<
    ReturnType<ConversationCommandRepository['createWithSession']>
  > & {
    outbox?: OutboxEventRecord
  }
  try {
    const outboxInput = deps.outbox
      ? {
          tenantId: input.tenantId,
          type: 'inbound.process',
          payload: {
            tenantId: input.tenantId,
            channel: input.channel,
            senderRef: input.senderRef,
            body: input.body,
            externalMessageId: input.externalMessageId
          },
          idempotencyKey: createInboundIdempotencyKey(
            input.channel,
            input.externalMessageId
          ),
          conversationId: null,
          sessionId: null,
          inboundMessageId: null
        }
      : undefined
    if (outboxInput && !deps.conversations.createWithSessionAndOutbox) {
      throw new DomainError(
        'invalid_action',
        'Durable inbound processing requires an atomic conversation repository'
      )
    }
    if (outboxInput && deps.conversations.createWithSessionAndOutbox) {
      result = await deps.conversations.createWithSessionAndOutbox(
        input,
        outboxInput
      )
    } else {
      const created = await deps.conversations.createWithSession(input)
      result = { ...created }
    }
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      const concurrentDuplicate =
        await deps.conversations.findByExternalMessage(
          input.tenantId,
          input.channel,
          input.externalMessageId
        )
      if (concurrentDuplicate) {
        return {
          conversationId: concurrentDuplicate.conversationId,
          messageId: concurrentDuplicate.id,
          sessionId: null,
          accepted: false,
          runtimeStatus: concurrentDuplicate.runtimeStatus ?? 'completed'
        }
      }
    }
    throw error
  }
  return {
    conversationId: result.conversation.id,
    sessionId: result.session.id,
    messageId: result.message.id,
    correlationId: result.conversation.correlationId,
    accepted: true,
    runtimeStatus: result.message.runtimeStatus ?? 'pending',
    ...(result.outbox ? { outbox: result.outbox } : {})
  }
}

/**
 * Provider message identifiers are opaque and may contain contact data. Keep
 * the stable deduplication contract without copying that identifier into a
 * durable idempotency or outbox key.
 */
export function createInboundIdempotencyKey(
  channel: string,
  externalMessageId: string
): string {
  const digest = createHash('sha256')
    .update(externalMessageId, 'utf8')
    .digest('hex')
  return `inbound:${channel}:sha256:${digest}`
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23505'
  )
}
