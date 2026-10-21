import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { ShiftAssistant } from './assistant.ts'
import type { ShiftStore } from './store.ts'
import { LIMITS } from './transport-limits.ts'
import type { WhatsAppClient } from './whatsapp.ts'

export interface ShiftServerOptions {
  assistant: ShiftAssistant
  store: ShiftStore
  whatsapp: WhatsAppClient
  webhookSecret: string
  clock?: () => Date
  /** Webhooks may carry inline media (Evolution `webhook_base64`). */
  maxBodyBytes?: number
  /** Deadline to receive a whole webhook body (default 10 s). */
  bodyTimeoutMs?: number
}

/** Connection and body limits of the webhook listener (SPEC 0179 8.2). */
const MAX_CONNECTIONS = 16
const MAX_BODY_READS = 4

function secretMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

class BodyTooLargeError extends Error {}
class BodyTimeoutError extends Error {}

async function readJson(
  request: IncomingMessage,
  limit: number,
  timeoutMs: number
): Promise<unknown> {
  const declared = Number(request.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    throw new BodyTooLargeError()
  }
  const chunks: Buffer[] = []
  let size = 0
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    request.destroy()
  }, timeoutMs)
  try {
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > limit) throw new BodyTooLargeError()
      chunks.push(buffer)
    }
  } catch (error) {
    if (timedOut) throw new BodyTimeoutError()
    throw error
  } finally {
    clearTimeout(timer)
  }
  if (timedOut) throw new BodyTimeoutError()
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  )
}

function send(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): void {
  response.writeHead(status, { 'content-type': 'application/json', ...headers })
  response.end(JSON.stringify(body))
}

/**
 * Webhook endpoint for the configured WhatsApp provider (node:http, no
 * framework). It acknowledges only after the message is durably recorded;
 * health reports readiness from progress, storage and backlog, never domain
 * data (no notes, patients, numbers, text, URLs or secrets).
 */
export function buildShiftServer(options: ShiftServerOptions): Server {
  const clock = options.clock ?? (() => new Date())
  const limit = options.maxBodyBytes ?? 25 * 1024 * 1024
  const bodyTimeoutMs = options.bodyTimeoutMs ?? 10_000
  const webhookPath = `/webhooks/${options.whatsapp.provider}`
  let reading = 0

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://shift.local')
      if (request.method === 'GET' && url.pathname.startsWith('/health')) {
        const health = options.assistant.health()
        if (url.pathname === '/health/live') {
          send(response, 200, { live: true })
          return
        }
        if (url.pathname === '/health/ready') {
          send(response, health.ready ? 200 : 503, {
            ready: health.ready,
            mode: health.mode,
            effectsEnabled: health.effectsEnabled,
            reasonCodes: health.reasonCodes
          })
          return
        }
        if (url.pathname === '/health') {
          send(response, health.ready ? 200 : 503, {
            ok: health.ready,
            provider: options.whatsapp.provider,
            paused: options.store.paused,
            ...health
          })
          return
        }
      }
      if (request.method !== 'POST' || url.pathname !== webhookPath) {
        send(response, 404, { error: 'not_found' })
        return
      }
      const provided =
        request.headers['x-cvg-webhook-secret'] ??
        url.searchParams.get('secret')
      if (!secretMatches(options.webhookSecret, provided)) {
        request.resume()
        send(response, 401, { error: 'unauthorized' })
        return
      }
      if (reading >= MAX_BODY_READS) {
        request.resume()
        send(response, 503, { error: 'busy' }, { 'retry-after': '30' })
        return
      }
      let payload: unknown
      reading += 1
      try {
        payload = await readJson(request, limit, bodyTimeoutMs)
      } catch (error) {
        const [status, code] =
          error instanceof BodyTooLargeError
            ? [413, 'too_large']
            : error instanceof BodyTimeoutError
              ? [408, 'request_timeout']
              : [400, 'invalid_json']
        if (!request.destroyed) request.resume()
        if (!response.headersSent && !response.destroyed) {
          send(response, status, { error: code }, { connection: 'close' })
        }
        return
      } finally {
        reading -= 1
      }
      const message = options.whatsapp.parseWebhook(
        payload,
        clock().toISOString()
      )
      if (!message) {
        send(response, 200, { accepted: false })
        return
      }
      if (
        message.text.length > LIMITS.inboundTextChars ||
        message.messageId.length > LIMITS.inboundIdChars ||
        (message.mediaRef?.length ?? 0) > limit
      ) {
        send(response, 400, { error: 'invalid_payload' })
        return
      }
      switch (options.assistant.admit(message)) {
        case 'accepted':
          send(response, 200, { accepted: true })
          return
        case 'duplicate':
          send(response, 200, { accepted: false, duplicate: true })
          return
        case 'ignored':
          send(response, 200, { accepted: false })
          return
        case 'queue_full':
          send(response, 503, { error: 'queue_full' }, { 'retry-after': '30' })
          return
        case 'storage_unavailable':
          send(response, 503, { error: 'storage_unavailable' })
          return
        case 'stopping':
          send(response, 503, { error: 'stopping' })
          return
      }
    })().catch(() => {
      if (!response.headersSent) send(response, 500, { error: 'internal' })
    })
  })
  server.headersTimeout = 5_000
  server.requestTimeout = 15_000
  server.keepAliveTimeout = 5_000
  server.maxConnections = MAX_CONNECTIONS
  return server
}
