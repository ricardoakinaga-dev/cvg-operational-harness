import {
  evaluateOutboundUrl,
  fetchWithSsrfGuard,
  isLoopbackHostname
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
import { fetchWithResolvedAddress } from './ssrf-node.ts'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface EvolutionAdapterOptions {
  /** Integrations are opt-in; disabled adapters fail closed. */
  enabled?: boolean
  baseUrl?: string
  apiKey?: string
  instance?: string
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

interface EvolutionWebhook {
  event?: string
  data?: {
    key?: { id?: string; remoteJid?: string; fromMe?: boolean }
    pushName?: string
    message?: { conversation?: string; extendedTextMessage?: { text?: string } }
    messageTimestamp?: number
  }
}

const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024

/**
 * EvolutionAPI adapter. Disabled by default; when enabled it requires an
 * explicit HTTPS base URL (or loopback), API key and instance.
 */
export class EvolutionChannelAdapter
  implements InboundChannelAdapter, OutboundChannelAdapter
{
  readonly channel = 'whatsapp'
  readonly enabled: boolean
  readonly #baseUrl?: string
  readonly #apiKey?: string
  readonly #instance?: string
  readonly #fetch?: FetchLike
  readonly #clock: () => Date
  readonly #maxResponseBytes: number
  readonly #allowedHosts: string[]
  readonly #allowPrivateNetworks: boolean
  readonly #allowHttp: boolean
  readonly #dnsLookup: EgressDns['lookup'] | undefined
  readonly #boundFetch: typeof fetchWithResolvedAddress | undefined

  constructor(options: EvolutionAdapterOptions = {}) {
    this.enabled = options.enabled ?? false
    this.#clock = options.clock ?? (() => new Date())
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    if (this.enabled) {
      const baseUrl = options.baseUrl?.trim().replace(/\/+$/, '')
      if (!baseUrl || !options.apiKey || !options.instance) {
        throw new ChannelError(
          'invalid_config',
          'EvolutionAPI requires baseUrl, apiKey and instance when enabled'
        )
      }
      let parsedBaseUrl: URL
      try {
        parsedBaseUrl = new URL(baseUrl)
      } catch {
        throw new ChannelError(
          'url_rejected',
          'EvolutionAPI base URL rejected: malformed_url'
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
          `EvolutionAPI base URL rejected: ${guard.reason}`
        )
      }
      this.#baseUrl = baseUrl
      this.#apiKey = options.apiKey
      this.#instance = options.instance
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
    const payload = raw as EvolutionWebhook
    const data = payload?.data
    const remoteJid = data?.key?.remoteJid
    const externalId = data?.key?.id
    const text =
      data?.message?.conversation ?? data?.message?.extendedTextMessage?.text
    if (!remoteJid || !externalId || typeof text !== 'string') {
      throw new ChannelError(
        'invalid_payload',
        'EvolutionAPI payload is missing message fields'
      )
    }
    if (data?.key?.fromMe === true) {
      throw new ChannelError(
        'invalid_payload',
        'Outbound echo events are not accepted as inbound messages'
      )
    }
    const senderId = remoteJid.split('@')[0] ?? remoteJid
    const timestamp = data?.messageTimestamp
      ? new Date(data.messageTimestamp * 1000).toISOString()
      : this.#clock().toISOString()
    return CanonicalEnvelopeSchema.parse({
      messageId: `msg_${externalId}`,
      externalId,
      tenantId: context.tenantId,
      conversationId: context.conversationId,
      channel: this.channel,
      sender: {
        id: senderId,
        type: 'phone',
        ...(data?.pushName ? { displayName: data.pushName } : {})
      },
      recipient: { id: this.#instance ?? 'instance', type: 'system' },
      timestamp,
      body: { text, attachments: [] },
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
    const endpoint = `${this.#baseUrl}/message/sendText/${this.#instance}`
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
            apikey: this.#apiKey ?? ''
          },
          body: JSON.stringify({
            number: message.recipient.id,
            text: message.body.text
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
          `EvolutionAPI endpoint rejected: ${error.message}`
        )
      }
      throw new ChannelError(
        'send_failed',
        'EvolutionAPI request failed',
        true,
        { effectUnknown: true }
      )
    }
  }

  async #mapResponse(
    response: Response,
    message: CanonicalOutboundMessage
  ): Promise<OutboundResult> {
    if (!response.ok) {
      throw new ChannelError(
        'provider_rejected',
        `EvolutionAPI responded with status ${response.status}`,
        response.status >= 500 || response.status === 429
      )
    }
    const body = await response.text()
    if (new TextEncoder().encode(body).length > this.#maxResponseBytes) {
      throw new ChannelError(
        'provider_rejected',
        'EvolutionAPI response exceeded the size limit'
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
        'EvolutionAPI channel is disabled; enable it explicitly to use it'
      )
    }
  }
}
