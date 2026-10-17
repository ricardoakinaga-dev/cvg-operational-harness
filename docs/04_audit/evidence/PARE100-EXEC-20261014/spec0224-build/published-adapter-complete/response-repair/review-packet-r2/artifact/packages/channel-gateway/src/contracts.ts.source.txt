import { z } from 'zod'
import { ChannelSchema } from '@cvg/shared'

export const MessagePartySchema = z
  .object({
    id: z.string().min(1).max(200),
    type: z.enum(['phone', 'user', 'system']),
    displayName: z.string().max(200).optional()
  })
  .strict()

export type MessageParty = z.infer<typeof MessagePartySchema>

export const MessageAttachmentSchema = z
  .object({
    id: z.string().min(1).max(200),
    kind: z.enum(['image', 'audio', 'video', 'document', 'other']),
    mimeType: z.string().min(1).max(120),
    sizeBytes: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 1024 * 1024)
  })
  .strict()

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>

export const MessageBodySchema = z
  .object({
    text: z.string().max(8_000),
    attachments: z.array(MessageAttachmentSchema).max(10).default([])
  })
  .strict()

export type MessageBody = z.output<typeof MessageBodySchema>

export const CanonicalEnvelopeSchema = z
  .object({
    messageId: z.string().min(1).max(200),
    externalId: z.string().min(1).max(200),
    tenantId: z.string().min(1).max(120),
    conversationId: z.string().min(1).max(200),
    channel: ChannelSchema,
    sender: MessagePartySchema,
    recipient: MessagePartySchema,
    timestamp: z.string().datetime(),
    body: MessageBodySchema,
    correlationId: z.string().min(8).max(120),
    idempotencyKey: z.string().min(8).max(240),
    metadata: z
      .record(z.string().min(1).max(64), z.string().max(256))
      .default({})
  })
  .strict()

export type CanonicalEnvelope = z.output<typeof CanonicalEnvelopeSchema>
export type CanonicalEnvelopeInput = z.input<typeof CanonicalEnvelopeSchema>

export const CanonicalOutboundMessageSchema = z
  .object({
    messageId: z.string().min(1).max(200),
    tenantId: z.string().min(1).max(120),
    conversationId: z.string().min(1).max(200),
    channel: ChannelSchema,
    recipient: MessagePartySchema,
    body: MessageBodySchema,
    correlationId: z.string().min(8).max(120),
    idempotencyKey: z.string().min(8).max(240),
    metadata: z
      .record(z.string().min(1).max(64), z.string().max(256))
      .default({})
  })
  .strict()

export type CanonicalOutboundMessage = z.output<
  typeof CanonicalOutboundMessageSchema
>
export type CanonicalOutboundMessageInput = z.input<
  typeof CanonicalOutboundMessageSchema
>

export interface InboundNormalizeContext {
  tenantId: string
  conversationId: string
  correlationId: string
}

export interface InboundChannelAdapter {
  readonly channel: string
  readonly enabled: boolean
  normalize(
    raw: unknown,
    context: InboundNormalizeContext
  ): CanonicalEnvelopeInput
}

export interface OutboundResult {
  externalId: string
  channel: string
  accepted: boolean
  sentAt: string
}

export interface OutboundChannelAdapter {
  readonly channel: string
  readonly enabled: boolean
  send(message: CanonicalOutboundMessage): Promise<OutboundResult>
}

export function canonicalIdempotencyKey(input: {
  tenantId: string
  channel: string
  externalId: string
}): string {
  return `${input.tenantId}:${input.channel}:${input.externalId}`
}
