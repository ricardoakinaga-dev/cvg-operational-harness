import { evaluateOutboundUrl } from '@cvg/shared'
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
import type { FetchLike } from './evolution.ts'

export interface ChatwootAdapterOptions {
  enabled?: boolean
  baseUrl?: string
  apiKey?: string
  accountId?: string
  fetchImpl?: FetchLike
  clock?: () => Date
  maxResponseBytes?: number
}

interface ChatwootWebhook {
  event?: string
  message_type?: string
  id?: number | string
  content?: string
  created_at?: number | string
  conversation?: { id?: number | string; meta?: { sender?: ChatwootSender } }
  sender?: ChatwootSender
}

interface ChatwootSender {
  id?: number | string
  name?: string
  phone_number?: string
  identifier?: string
}

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024

/**
 * Chatwoot adapter. Disabled by default and fail-closed when enabled without
 * complete configuration.
 */
export class ChatwootChannelAdapter
  implements InboundChannelAdapter, OutboundChannelAdapter
{
  readonly channel = 'web'
  readonly enabled: boolean
  readonly #baseUrl?: string
  readonly #apiKey?: string
  readonly #accountId?: string
  readonly #fetch?: FetchLike
  readonly #clock: () => Date
  readonly #maxResponseBytes: number
  readonly #allowedHosts: string[]

  constructor(options: ChatwootAdapterOptions = {}) {
    this.enabled = options.enabled ?? false
    this.#clock = options.clock ?? (() => new Date())
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    if (this.enabled) {
      const baseUrl = options.baseUrl?.trim().replace(/\/+$/, '')
      if (!baseUrl || !options.apiKey || !options.accountId) {
        throw new ChannelError(
          'invalid_config',
          'Chatwoot requires baseUrl, apiKey and accountId when enabled'
        )
      }
      const guard = evaluateOutboundUrl(baseUrl, { allowHttp: true })
      if (!guard.allowed) {
        throw new ChannelError(
          'url_rejected',
          `Chatwoot base URL rejected: ${guard.reason}`
        )
      }
      this.#baseUrl = baseUrl
      this.#apiKey = options.apiKey
      this.#accountId = options.accountId
      this.#fetch = options.fetchImpl ?? (globalThis.fetch as FetchLike)
      this.#allowedHosts = [new URL(baseUrl).hostname.toLowerCase()]
    } else {
      this.#allowedHosts = []
    }
  }

  normalize(
    raw: unknown,
    context: InboundNormalizeContext
  ): CanonicalEnvelopeInput {
    this.#assertEnabled()
    const payload = raw as ChatwootWebhook
    if (payload?.event && payload.event !== 'message_created') {
      throw new ChannelError('invalid_payload', 'Unsupported Chatwoot event')
    }
    if (payload?.message_type && payload.message_type !== 'incoming') {
      throw new ChannelError(
        'invalid_payload',
        'Only incoming Chatwoot messages are accepted'
      )
    }
    const sender = payload?.sender ?? payload?.conversation?.meta?.sender
    const externalId =
      payload?.id !== undefined ? String(payload.id) : undefined
    const conversationId =
      payload?.conversation?.id !== undefined
        ? String(payload.conversation.id)
        : context.conversationId
    if (!externalId || typeof payload?.content !== 'string') {
      throw new ChannelError(
        'invalid_payload',
        'Chatwoot payload is incomplete'
      )
    }
    const senderId =
      sender?.phone_number ??
      sender?.identifier ??
      String(sender?.id ?? 'unknown')
    const timestamp = normalizeTimestamp(payload.created_at, this.#clock())
    return CanonicalEnvelopeSchema.parse({
      messageId: `msg_${externalId}`,
      externalId,
      tenantId: context.tenantId,
      conversationId,
      channel: this.channel,
      sender: {
        id: senderId,
        type: 'user',
        ...(sender?.name ? { displayName: sender.name } : {})
      },
      recipient: { id: this.#accountId ?? 'account', type: 'system' },
      timestamp,
      body: { text: payload.content, attachments: [] },
      correlationId: context.correlationId,
      idempotencyKey: canonicalIdempotencyKey({
        tenantId: context.tenantId,
        channel: this.channel,
        externalId
      }),
      metadata: {}
    })
  }

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    this.#assertEnabled()
    const endpoint = `${this.#baseUrl}/api/v1/accounts/${this.#accountId}/conversations/${message.conversationId}/messages`
    const guard = evaluateOutboundUrl(endpoint, {
      allowedHosts: this.#allowedHosts,
      allowedProtocols: ['https:', 'http:']
    })
    if (!guard.allowed) {
      throw new ChannelError(
        'url_rejected',
        `Chatwoot endpoint rejected: ${guard.reason}`
      )
    }
    let response: Response
    try {
      response = await this.#fetch!(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          api_access_token: this.#apiKey ?? ''
        },
        body: JSON.stringify({
          content: message.body.text,
          message_type: 'outgoing'
        }),
        redirect: 'error'
      })
    } catch {
      throw new ChannelError('send_failed', 'Chatwoot request failed', true, {
        effectUnknown: true
      })
    }
    if (!response.ok) {
      throw new ChannelError(
        'provider_rejected',
        `Chatwoot responded with status ${response.status}`,
        response.status >= 500 || response.status === 429
      )
    }
    const body = await response.text()
    if (new TextEncoder().encode(body).length > this.#maxResponseBytes) {
      throw new ChannelError(
        'provider_rejected',
        'Chatwoot response exceeded the size limit'
      )
    }
    return {
      externalId: message.messageId,
      channel: this.channel,
      accepted: true,
      sentAt: this.#clock().toISOString()
    }
  }

  #assertEnabled(): void {
    if (!this.enabled) {
      throw new ChannelError(
        'channel_disabled',
        'Chatwoot channel is disabled; enable it explicitly to use it'
      )
    }
  }
}

function normalizeTimestamp(
  value: number | string | undefined,
  now: Date
): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString()
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString()
  }
  return now.toISOString()
}
