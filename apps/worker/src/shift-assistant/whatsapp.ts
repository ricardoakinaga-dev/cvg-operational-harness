import type { InboundMessage, MessageKind } from './domain.ts'
import { normalizePhone } from './domain.ts'
import type { FetchLike } from './egress.ts'

export interface MediaFile {
  bytes: Uint8Array
  mimetype: string
}

export interface WhatsAppClient {
  readonly provider: 'waha' | 'evolution'
  /** Returns undefined for anything that is not a direct inbound message. */
  parseWebhook(payload: unknown, receivedAt: string): InboundMessage | undefined
  sendText(phone: string, text: string): Promise<void>
  downloadMedia(message: InboundMessage): Promise<MediaFile>
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

async function ensureOk(response: Response, what: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${what} failed with HTTP ${response.status}`)
  }
}

export interface WahaOptions {
  baseUrl: string
  apiKey: string
  session: string
  fetch: FetchLike
}

/** WAHA (WhatsApp HTTP API): `message` webhook event, `/api/sendText`. */
export class WahaClient implements WhatsAppClient {
  readonly provider = 'waha' as const
  readonly #options: WahaOptions

  constructor(options: WahaOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') }
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

  async sendText(phone: string, text: string): Promise<void> {
    const response = await this.#options.fetch(
      `${this.#options.baseUrl}/api/sendText`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.#options.apiKey
        },
        body: JSON.stringify({
          session: this.#options.session,
          chatId: `${normalizePhone(phone)}@c.us`,
          text
        })
      }
    )
    await ensureOk(response, 'WAHA sendText')
  }

  async downloadMedia(message: InboundMessage): Promise<MediaFile> {
    if (!message.mediaRef) throw new Error('Message has no media')
    const response = await this.#options.fetch(message.mediaRef, {
      headers: { 'x-api-key': this.#options.apiKey }
    })
    await ensureOk(response, 'WAHA media download')
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimetype:
        message.mimetype ??
        response.headers.get('content-type') ??
        'application/octet-stream'
    }
  }
}

export interface EvolutionOptions {
  baseUrl: string
  apiKey: string
  instance: string
  fetch: FetchLike
}

/** Evolution API v2: `messages.upsert` webhook event, `/message/sendText`. */
export class EvolutionClient implements WhatsAppClient {
  readonly provider = 'evolution' as const
  readonly #options: EvolutionOptions

  constructor(options: EvolutionOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') }
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

  async sendText(phone: string, text: string): Promise<void> {
    const response = await this.#options.fetch(
      `${this.#options.baseUrl}/message/sendText/${encodeURIComponent(this.#options.instance)}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.#options.apiKey
        },
        body: JSON.stringify({ number: normalizePhone(phone), text })
      }
    )
    await ensureOk(response, 'Evolution sendText')
  }

  async downloadMedia(message: InboundMessage): Promise<MediaFile> {
    const ref = message.mediaRef
    if (!ref) throw new Error('Message has no media')
    const fallbackMime = message.mimetype ?? 'application/octet-stream'
    if (ref.startsWith('base64:')) {
      return {
        bytes: Buffer.from(ref.slice(7), 'base64'),
        mimetype: fallbackMime
      }
    }
    const response = await this.#options.fetch(
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
      }
    )
    await ensureOk(response, 'Evolution media download')
    const body = obj(await response.json())
    const base64 = str(body?.base64)
    if (!base64) throw new Error('Evolution media download returned no data')
    return {
      bytes: Buffer.from(base64, 'base64'),
      mimetype: str(body?.mimetype) ?? fallbackMime
    }
  }
}
