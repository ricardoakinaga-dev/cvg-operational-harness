import type { InboundMessage, MessageKind } from './domain.ts'
import { normalizePhone } from './domain.ts'
import type { FetchLike } from './egress.ts'
import {
  acceptedMediaType,
  assertNotRedirect,
  deadlineSignal,
  decodeBase64Media,
  DEFAULT_TIMEOUTS,
  DispatchError,
  LIMITS,
  readLimitedBytes,
  readLimitedJson,
  TransportError,
  transportFailure,
  untilAborted,
  utf8Bytes
} from './transport-limits.ts'

export interface MediaFile {
  bytes: Uint8Array
  mimetype: string
}

export interface WhatsAppClient {
  readonly provider: 'waha' | 'evolution'
  /** Returns undefined for anything that is not a direct inbound message. */
  parseWebhook(payload: unknown, receivedAt: string): InboundMessage | undefined
  /**
   * Resolves when the channel accepted the text. Rejects with a
   * DispatchError: `not_sent` when nothing left the process, `uncertain`
   * once the request started (the channel may have accepted it).
   */
  sendText(phone: string, text: string, signal?: AbortSignal): Promise<void>
  downloadMedia(
    message: InboundMessage,
    signal?: AbortSignal
  ): Promise<MediaFile>
}

/** Deadlines and media ceiling shared by both channel clients. */
export interface ChannelLimits {
  sendTimeoutMs?: number
  mediaTimeoutMs?: number
  maxMediaBytes?: number
}

type Json = Record<string, unknown>

function obj(value: unknown): Json | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Json)
    : undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function kindFromMime(mimetype: string | undefined): MessageKind | undefined {
  if (!mimetype) return undefined
  if (mimetype.startsWith('audio/')) return 'audio'
  if (mimetype.startsWith('image/')) return 'image'
  return undefined
}

function limitsOf(options: ChannelLimits) {
  return {
    sendMs: options.sendTimeoutMs ?? DEFAULT_TIMEOUTS.sendMs,
    mediaMs: options.mediaTimeoutMs ?? DEFAULT_TIMEOUTS.mediaMs,
    mediaBytes: Math.min(
      options.maxMediaBytes ?? LIMITS.mediaBytes,
      LIMITS.mediaBytes
    )
  }
}

/**
 * One bounded POST of a text: local checks first (nothing sent), then a
 * deadline that covers the response body, read up to its ceiling.
 */
async function postText(
  fetch: FetchLike,
  url: string,
  headers: Record<string, string>,
  body: string,
  text: string,
  timeoutMs: number,
  caller: AbortSignal | undefined
): Promise<void> {
  if (utf8Bytes(text) > LIMITS.sendTextBytes) {
    throw new DispatchError('TEXT_TOO_LARGE', 'not_sent')
  }
  if (caller?.aborted) throw new DispatchError('TRANSPORT_ABORTED', 'not_sent')
  const signal = deadlineSignal(timeoutMs, caller)
  let response: Response
  try {
    response = await untilAborted(
      fetch(url, { method: 'POST', headers, body, signal }),
      signal
    )
  } catch (error) {
    const failure = transportFailure(error, signal)
    // An egress denial happens before any byte leaves the process.
    throw new DispatchError(
      failure.code,
      failure.code === 'EGRESS_DENIED' ? 'not_sent' : 'uncertain'
    )
  }
  try {
    assertNotRedirect(response)
    await readLimitedBytes(response, LIMITS.sendResponseBytes, signal)
  } catch (error) {
    const failure = transportFailure(error, signal)
    throw new DispatchError(
      failure.code,
      'uncertain',
      failure.status !== undefined ? { status: failure.status } : {}
    )
  }
  if (!response.ok) {
    // Without a qualified provider contract a non-2xx answer does not prove
    // the text was refused.
    throw new DispatchError('TRANSPORT_HTTP_STATUS', 'uncertain', {
      status: response.status
    })
  }
}

/** A bounded GET/POST for media, mapped to stable transport errors. */
async function fetchBounded(
  fetch: FetchLike,
  url: string,
  init: RequestInit,
  signal: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    response = await untilAborted(fetch(url, { ...init, signal }), signal)
  } catch (error) {
    throw transportFailure(error, signal)
  }
  assertNotRedirect(response)
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    throw new TransportError('TRANSPORT_HTTP_STATUS', response.status >= 500, {
      status: response.status
    })
  }
  return response
}

export interface WahaOptions extends ChannelLimits {
  baseUrl: string
  apiKey: string
  session: string
  fetch: FetchLike
}

/** WAHA (WhatsApp HTTP API): `message` webhook event, `/api/sendText`. */
export class WahaClient implements WhatsAppClient {
  readonly provider = 'waha' as const
  readonly #options: WahaOptions
  readonly #limits: ReturnType<typeof limitsOf>

  constructor(options: WahaOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') }
    this.#limits = limitsOf(options)
  }

  parseWebhook(
    payload: unknown,
    receivedAt: string
  ): InboundMessage | undefined {
    const root = obj(payload)
    if (root?.event !== 'message') return undefined
    const message = obj(root.payload)
    const id = str(message?.id)
    const from = str(message?.from)
    if (!message || !id || !from || message.fromMe === true) return undefined
    if (!from.endsWith('@c.us')) return undefined // groups, broadcasts, newsletters
    const media = obj(message.media)
    const mimetype = str(media?.mimetype)
    const mediaKind =
      message.hasMedia === true ? kindFromMime(mimetype) : undefined
    const text = str(message.body) ?? ''
    if (!mediaKind && !text.trim()) return undefined
    return {
      provider: 'waha',
      messageId: id,
      fromPhone: normalizePhone(from),
      kind: mediaKind ?? 'text',
      text,
      ...(mediaKind && str(media?.url) ? { mediaRef: str(media?.url)! } : {}),
      ...(mediaKind && mimetype ? { mimetype } : {}),
      receivedAt
    }
  }

  async sendText(
    phone: string,
    text: string,
    signal?: AbortSignal
  ): Promise<void> {
    await postText(
      this.#options.fetch,
      `${this.#options.baseUrl}/api/sendText`,
      {
        'content-type': 'application/json',
        'x-api-key': this.#options.apiKey
      },
      JSON.stringify({
        session: this.#options.session,
        chatId: `${normalizePhone(phone)}@c.us`,
        text
      }),
      text,
      this.#limits.sendMs,
      signal
    )
  }

  async downloadMedia(
    message: InboundMessage,
    caller?: AbortSignal
  ): Promise<MediaFile> {
    if (!message.mediaRef) throw new TransportError('MEDIA_INVALID', false)
    const signal = deadlineSignal(this.#limits.mediaMs, caller)
    // The allowlisted fetch refuses any origin other than the WAHA one.
    const response = await fetchBounded(
      this.#options.fetch,
      message.mediaRef,
      { headers: { 'x-api-key': this.#options.apiKey } },
      signal
    )
    const mimetype = acceptedMediaType(
      message.mimetype ?? response.headers.get('content-type') ?? undefined
    )
    const bytes = await readLimitedBytes(
      response,
      this.#limits.mediaBytes,
      signal,
      'MEDIA_TOO_LARGE'
    )
    return { bytes, mimetype }
  }
}

export interface EvolutionOptions extends ChannelLimits {
  baseUrl: string
  apiKey: string
  instance: string
  fetch: FetchLike
}

/** Evolution API v2: `messages.upsert` webhook event, `/message/sendText`. */
export class EvolutionClient implements WhatsAppClient {
  readonly provider = 'evolution' as const
  readonly #options: EvolutionOptions
  readonly #limits: ReturnType<typeof limitsOf>

  constructor(options: EvolutionOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') }
    this.#limits = limitsOf(options)
  }

  parseWebhook(
    payload: unknown,
    receivedAt: string
  ): InboundMessage | undefined {
    const root = obj(payload)
    const event = str(root?.event)?.toLowerCase().replace('_', '.')
    if (event !== 'messages.upsert') return undefined
    const data = obj(root?.data)
    const key = obj(data?.key)
    const id = str(key?.id)
    const remoteJid = str(key?.remoteJid)
    if (!data || !id || !remoteJid || key?.fromMe === true) return undefined
    if (!remoteJid.endsWith('@s.whatsapp.net')) return undefined
    const content = obj(data.message)
    if (!content) return undefined
    const audio = obj(content.audioMessage)
    const image = obj(content.imageMessage)
    const extended = obj(content.extendedTextMessage)
    const text =
      str(content.conversation) ??
      str(extended?.text) ??
      str(image?.caption) ??
      ''
    const kind: MessageKind = audio ? 'audio' : image ? 'image' : 'text'
    if (kind === 'text' && !text.trim()) return undefined
    const mimetype = str(audio?.mimetype) ?? str(image?.mimetype)
    // With `webhook_base64` enabled the media arrives inline; otherwise it is
    // fetched by message id.
    const inline = str(content.base64)
    return {
      provider: 'evolution',
      messageId: id,
      fromPhone: normalizePhone(remoteJid),
      kind,
      text,
      ...(kind !== 'text'
        ? { mediaRef: inline ? `base64:${inline}` : `id:${id}` }
        : {}),
      ...(kind !== 'text' && mimetype ? { mimetype } : {}),
      receivedAt
    }
  }

  async sendText(
    phone: string,
    text: string,
    signal?: AbortSignal
  ): Promise<void> {
    await postText(
      this.#options.fetch,
      `${this.#options.baseUrl}/message/sendText/${encodeURIComponent(this.#options.instance)}`,
      { 'content-type': 'application/json', apikey: this.#options.apiKey },
      JSON.stringify({ number: normalizePhone(phone), text }),
      text,
      this.#limits.sendMs,
      signal
    )
  }

  async downloadMedia(
    message: InboundMessage,
    caller?: AbortSignal
  ): Promise<MediaFile> {
    const ref = message.mediaRef
    if (!ref) throw new TransportError('MEDIA_INVALID', false)
    if (ref.startsWith('base64:')) {
      const mimetype = acceptedMediaType(message.mimetype)
      return {
        bytes: decodeBase64Media(ref.slice(7), this.#limits.mediaBytes),
        mimetype
      }
    }
    const signal = deadlineSignal(this.#limits.mediaMs, caller)
    const response = await fetchBounded(
      this.#options.fetch,
      `${this.#options.baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(this.#options.instance)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.#options.apiKey
        },
        body: JSON.stringify({
          message: { key: { id: ref.replace(/^id:/, '') } },
          convertToMp4: false
        })
      },
      signal
    )
    const body = obj(
      await readLimitedJson(response, LIMITS.evolutionMediaJsonBytes, signal)
    )
    const base64 = str(body?.base64)
    if (!base64) throw new TransportError('MEDIA_INVALID', false)
    const mimetype = acceptedMediaType(str(body?.mimetype) ?? message.mimetype)
    return {
      bytes: decodeBase64Media(base64, this.#limits.mediaBytes),
      mimetype
    }
  }
}
