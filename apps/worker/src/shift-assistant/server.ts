import { timingSafeEqual } from 'node:crypto'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { ShiftAssistant } from './assistant.ts'
import type { ShiftStore } from './store.ts'
import type { WhatsAppClient } from './whatsapp.ts'

export interface ShiftServerOptions {
  assistant: ShiftAssistant
  store: ShiftStore
  whatsapp: WhatsAppClient
  webhookSecret: string
  clock?: () => Date
  /** Webhooks may carry inline media (Evolution `webhook_base64`). */
  maxBodyBytes?: number
}

function secretMatches(expected: string, received: unknown): boolean {
  if (typeof received !== 'string') return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

class BodyTooLargeError extends Error {}

async function readJson(
  request: IncomingMessage,
  limit: number
): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > limit) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

/**
 * Webhook endpoint for the configured WhatsApp provider (node:http, no
 * framework). It acknowledges quickly; the assistant records the message
 * before processing it.
 */
export function buildShiftServer(options: ShiftServerOptions): Server {
  const clock = options.clock ?? (() => new Date())
  const limit = options.maxBodyBytes ?? 25 * 1024 * 1024
  const webhookPath = `/webhooks/${options.whatsapp.provider}`

  return createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://shift.local')
      if (request.method === 'GET' && url.pathname === '/health') {
        send(response, 200, {
          ok: true,
          provider: options.whatsapp.provider,
          paused: options.store.paused,
          pendingMessages: options.store.unprocessedMessages().length,
          openTasks: options.store.openTasks().length
        })
        return
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
      let payload: unknown
      try {
        payload = await readJson(request, limit)
      } catch (error) {
        send(response, error instanceof BodyTooLargeError ? 413 : 400, {
          error:
            error instanceof BodyTooLargeError ? 'too_large' : 'invalid_json'
        })
        return
      }
      const message = options.whatsapp.parseWebhook(
        payload,
        clock().toISOString()
      )
      const accepted = message ? options.assistant.receive(message) : false
      send(response, 200, { accepted })
    })().catch(() => {
      if (!response.headersSent) send(response, 500, { error: 'internal' })
    })
  })
}
