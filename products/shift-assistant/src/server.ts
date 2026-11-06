import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { ShiftAssistant, ShiftLogger } from './assistant.ts'
import type { ShiftStore } from './store.ts'
import { LIMITS } from './transport-limits.ts'
import {
  bodySha256,
  checkEnvelope,
  verifyWebhookBody,
  type WebhookAuth,
  type WebhookRefusal
} from './webhook-auth.ts'
import type { WhatsAppClient } from './whatsapp.ts'

export interface ShiftServerOptions {
  assistant: ShiftAssistant
  store: ShiftStore
  whatsapp: WhatsAppClient
  webhookAuth: WebhookAuth
  /** Trusted clock of the webhook window; request headers never set it. */
  clock?: () => Date
  /** Receives refusal codes only: no URL, header, body or key material. */
  logger?: ShiftLogger
  /** Webhooks may carry inline media (Evolution `webhook_base64`). */
  maxBodyBytes?: number
  /** Deadline to receive a whole webhook body (default 10 s). */
  bodyTimeoutMs?: number
}

/** Connection and body limits of the webhook listener (SPEC 0179 8.2). */
const MAX_CONNECTIONS = 16
const MAX_BODY_READS = 4

class BodyTooLargeError extends Error {}
class BodyTimeoutError extends Error {}

async function readBody(
  request: IncomingMessage,
  limit: number,
  timeoutMs: number
): Promise<Buffer> {
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
  return Buffer.concat(chunks)
}

function parseJson(body: Buffer): unknown {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body))
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
  const provider = options.whatsapp.provider
  const webhookPath = `/webhooks/${provider}`
  let reading = 0

  const refuse = (
    request: IncomingMessage,
    response: ServerResponse,
    reason: WebhookRefusal
  ): void => {
    options.logger?.info('shift.webhook.refused', { provider, reason })
    if (!request.destroyed) request.resume()
    send(response, 401, { error: 'unauthorized' }, { connection: 'close' })
  }

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
            reasonCodes: health.reasonCodes,
            // Content-free codes for the external monitor (health.ts).
            attention: health.attention
          })
          return
        }
        if (url.pathname === '/health') {
          send(response, health.ready ? 200 : 503, {
            ok: health.ready,
            provider,
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
      // The contract has no query: a credential in a URL is refused, never
      // read, and the URL goes nowhere near a log.
      if (url.search !== '') {
        refuse(request, response, 'query_refused')
        return
      }
      const checked = checkEnvelope(
        request.headers,
        options.webhookAuth,
        provider,
        clock().getTime()
      )
      if ('refusal' in checked) {
        refuse(request, response, checked.refusal)
        return
      }
      if (reading >= MAX_BODY_READS) {
        request.resume()
        send(response, 503, { error: 'busy' }, { 'retry-after': '30' })
        return
      }
      let body: Buffer
      reading += 1
      try {
        body = await readBody(request, limit, bodyTimeoutMs)
      } catch (error) {
        const [status, code] =
          error instanceof BodyTooLargeError
            ? [413, 'too_large']
            : error instanceof BodyTimeoutError
              ? [408, 'request_timeout']
              : [400, 'invalid_body']
        if (!request.destroyed) request.resume()
        if (!response.headersSent && !response.destroyed) {
          send(response, status, { error: code }, { connection: 'close' })
        }
        return
      } finally {
        reading -= 1
      }
      // From here to the admission nothing awaits: concurrent deliveries of
      // one ID run one after the other, and the first reservation decides.
      if (!verifyWebhookBody(checked.envelope, provider, body)) {
        refuse(request, response, 'signature_invalid')
        return
      }
      const now = clock().toISOString()
      let reservation: ReturnType<ShiftStore['reserveWebhookDelivery']>
      try {
        reservation = options.store.reserveWebhookDelivery(
          {
            provider,
            tenant: checked.envelope.tenant,
            deliveryId: checked.envelope.deliveryId,
            bodySha256: bodySha256(body)
          },
          now
        )
      } catch {
        send(response, 503, { error: 'storage_unavailable' })
        return
      }
      if (reservation === 'conflict') {
        options.logger?.info('shift.webhook.conflict', { provider })
        send(response, 409, { error: 'delivery_conflict' })
        return
      }
      // A replay continues on purpose: a crash or a 503 may have come between
      // the reservation and the admission, and admit() is idempotent by
      // message ID, so a retry completes the first delivery or converges.
      let payload: unknown
      try {
        payload = parseJson(body)
      } catch {
        send(response, 400, { error: 'invalid_json' })
        return
      }
      const message = options.whatsapp.parseWebhook(payload, now)
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
