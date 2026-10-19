import {
  CanonicalEnvelopeSchema,
  canonicalIdempotencyKey,
  type CanonicalEnvelopeInput,
  type CanonicalOutboundMessage,
  type InboundChannelAdapter,
  type InboundNormalizeContext,
  type OutboundChannelAdapter,
  type OutboundResult
} from '../contracts.ts'
import { ChannelError } from '../errors.ts'

export interface FakeRawMessage {
  externalId: string
  senderId: string
  senderName?: string
  recipientId: string
  text: string
  timestamp?: string
  attachmentCount?: number
}

export interface ControlledFakeChannelAdapterOptions {
  channel?: string
  clock?: () => Date
  failNextSend?: boolean
}

/**
 * Deterministic fake channel used by tests, evals and dry runs. It never
 * performs network calls and keeps an inspectable outbound journal.
 */
export class ControlledFakeChannelAdapter
  implements InboundChannelAdapter, OutboundChannelAdapter
{
  readonly channel: string
  readonly enabled = true
  readonly sent: CanonicalOutboundMessage[] = []
  readonly #clock: () => Date
  #failNextSend: boolean

  constructor(options: ControlledFakeChannelAdapterOptions = {}) {
    this.channel = options.channel ?? 'whatsapp'
    this.#clock = options.clock ?? (() => new Date())
    this.#failNextSend = options.failNextSend ?? false
  }

  failNextSend(): void {
    this.#failNextSend = true
  }

  normalize(
    raw: unknown,
    context: InboundNormalizeContext
  ): CanonicalEnvelopeInput {
    const message = raw as Partial<FakeRawMessage>
    if (
      !message ||
      typeof message.externalId !== 'string' ||
      typeof message.senderId !== 'string' ||
      typeof message.recipientId !== 'string' ||
      typeof message.text !== 'string'
    ) {
      throw new ChannelError(
        'invalid_payload',
        'Fake channel payload is invalid'
      )
    }
    const envelope = {
      messageId: `msg_${message.externalId}`,
      externalId: message.externalId,
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      channel: this.channel as CanonicalEnvelopeInput['channel'],
      sender: { id: message.senderId, type: 'phone' as const },
      recipient: { id: message.recipientId, type: 'phone' as const },
      timestamp: message.timestamp ?? this.#clock().toISOString(),
      body: {
        text: message.text,
        attachments: Array.from(
          { length: message.attachmentCount ?? 0 },
          (_, index) => ({
            id: `att_${index}`,
            kind: 'document' as const,
            mimeType: 'application/octet-stream',
            sizeBytes: 1024
          })
        )
      },
      correlationId: context.correlationId,
      idempotencyKey: canonicalIdempotencyKey({
        tenantId: context.tenantId,
        channel: this.channel,
        externalId: message.externalId
      }),
      metadata: {}
    }
    return CanonicalEnvelopeSchema.parse(envelope)
  }

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    if (this.#failNextSend) {
      this.#failNextSend = false
      throw new ChannelError('send_failed', 'Fake channel outage', true)
    }
    this.sent.push(message)
    return {
      externalId: `fake_${message.messageId}`,
      channel: this.channel,
      accepted: true,
      sentAt: this.#clock().toISOString()
    }
  }
}
