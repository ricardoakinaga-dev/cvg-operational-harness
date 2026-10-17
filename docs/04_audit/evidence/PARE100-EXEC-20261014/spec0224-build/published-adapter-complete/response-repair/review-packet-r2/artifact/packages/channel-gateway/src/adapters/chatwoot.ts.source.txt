import {
  evaluateOutboundUrl,
  fetchWithSsrfGuard,
  isLoopbackHostname,
  withoutTrailingSlashes
} from '@cvg/shared'
import type { EgressDns } from '@cvg/shared'
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
import { fetchWithResolvedAddress } from './ssrf-node.ts'

export interface ChatwootAdapterOptions {
  enabled?: boolean
  baseUrl?: string
  apiKey?: string
  accountId?: string
  fetchImpl?: FetchLike
  clock?: () => Date
  maxResponseBytes?: number
  /**
   * AUD19-007 — explicit opt-in for loopback/private networks (local
   * homologation). Default false: private/reserved addresses are denied.
   */
  allowPrivateNetworks?: boolean
  /** AUD19-007 — injectable DNS for the composed egress guard (tests). */
  dnsLookup?: EgressDns['lookup']
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
  readonly #allowPrivateNetworks: boolean
  readonly #allowHttp: boolean
  readonly #dnsLookup: EgressDns['lookup'] | undefined
  readonly #boundFetch: typeof fetchWithResolvedAddress | undefined

  constructor(options: ChatwootAdapterOptions = {}) {
    this.enabled = options.enabled ?? false
    this.#clock = options.clock ?? (() => new Date())
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    if (this.enabled) {
      const baseUrl = withoutTrailingSlashes(options.baseUrl?.trim() ?? '')
      if (!baseUrl || !options.apiKey || !options.accountId) {
        throw new ChannelError(
          'invalid_config',
          'Chatwoot requires baseUrl, apiKey and accountId when enabled'
        )
      }
      let parsedBaseUrl: URL
      try {
        parsedBaseUrl = new URL(baseUrl)
      } catch {
        throw new ChannelError(
          'url_rejected',
          'Chatwoot base URL rejected: malformed_url'
        )
      }
      const allowPrivateNetworks = options.allowPrivateNetworks ?? false
      const allowHttp =
        parsedBaseUrl.protocol === 'http:' &&
        allowPrivateNetworks &&
        isLoopbackHostname(parsedBaseUrl.hostname)
      const guard = evaluateOutboundUrl(baseUrl, {
        allowedProtocols: allowHttp ? ['https:', 'http:'] : ['https:'],
        allowPrivateNetworks
      })
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
      this.#allowedHosts = [parsedBaseUrl.hostname.toLowerCase()]
      this.#allowPrivateNetworks = allowPrivateNetworks
      this.#allowHttp = allowHttp
      this.#dnsLookup = options.dnsLookup
      this.#boundFetch = options.fetchImpl
        ? undefined
        : fetchWithResolvedAddress
    } else {
      this.#allowedHosts = []
      this.#allowPrivateNetworks = false
      this.#allowHttp = false
      this.#boundFetch = undefined
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
    // AUD21-REM21-004 — validate every hop and bind the default Node socket
    // to the addresses returned by that same validation.
    try {
      const fetchImpl = (url: string, requestInit: Record<string, unknown>) =>
        this.#fetch!(url, requestInit as RequestInit)
      const deps = this.#boundFetch
        ? {
            ...(this.#dnsLookup ? { dnsLookup: this.#dnsLookup } : {}),
            boundFetchImpl: this.#boundFetch
          }
        : { ...(this.#dnsLookup ? { dnsLookup: this.#dnsLookup } : {}) }
      const response = await fetchWithSsrfGuard(
        fetchImpl,
        endpoint,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            api_access_token: this.#apiKey ?? ''
          },
          body: JSON.stringify({
            content: message.body.text,
            message_type: 'outgoing'
          }),
          redirect: 'manual'
        },
        {
          allowedHosts: this.#allowedHosts,
          allowedProtocols: this.#allowHttp ? ['https:', 'http:'] : ['https:'],
          allowPrivateNetworks: this.#allowPrivateNetworks,
          allowLoopbackOnly: this.#allowHttp
        },
        deps
      )
      return this.#mapResponse(response, message)
    } catch (error) {
      if (error instanceof ChannelError) throw error
      if (error instanceof Error && error.name === 'UnsafeUrlError') {
        throw new ChannelError(
          'url_rejected',
          `Chatwoot endpoint rejected: ${error.message}`
        )
      }
      throw new ChannelError('send_failed', 'Chatwoot request failed', true, {
        effectUnknown: true
      })
    }
  }

  async #mapResponse(
    response: Response,
    message: CanonicalOutboundMessage
  ): Promise<OutboundResult> {
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
