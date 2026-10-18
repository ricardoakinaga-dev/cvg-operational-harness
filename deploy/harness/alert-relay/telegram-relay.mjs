// A3 (plano 0374), decided on 2026-10-16: the stop alert reaches the
// manager on Telegram. The API's stop-alert monitor (packages/observability
// src/stop-alert.ts) posts a signed JSON notification here; this relay checks
// the HMAC-SHA256 signature over `${timestamp}.${body}`, refuses stale or
// replayed deliveries, and forwards a short message to the Telegram Bot API.
//
// A non-2xx answer makes the monitor keep the incident unsent and retry it
// on the next check, so a Telegram failure is answered with 502, never 2xx.
// No dependency beyond Node: it runs in the harness runtime image.
//
// Environment (rendered from Vault into /etc/cvg-harness/alert-relay.env):
//   ALERT_RELAY_SECRET      same value as CVG_STOP_ALERT_WEBHOOK_SECRET (>= 32 chars)
//   TELEGRAM_BOT_TOKEN      bot token from @BotFather
//   TELEGRAM_CHAT_ID        chat or group that receives the alerts
//   ALERT_RELAY_PORT        default 8790
//   ALERT_RELAY_HOST        default 0.0.0.0 (only reachable inside the compose network)
//   ALERT_RELAY_MAX_SKEW_MS default 300000

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

export const MAX_BODY_BYTES = 16 * 1024
const CODES = new Set(['worker_down', 'queue_stalled'])
const STATES = new Set(['firing', 'resolved'])
const LABELS = {
  worker_down: 'nenhum worker ativo',
  queue_stalled: 'fila sem progresso'
}

function log(event, fields = {}) {
  console.error(JSON.stringify({ event, ...fields }))
}

export function signAlert(secret, timestamp, body) {
  return createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex')
}

function safeEqualHex(expected, received) {
  if (typeof received !== 'string' || !/^[0-9a-f]{64}$/.test(received)) {
    return false
  }
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(received, 'hex')
  )
}

function parseNotification(body) {
  let value
  try {
    value = JSON.parse(body)
  } catch {
    return undefined
  }
  if (
    value === null ||
    typeof value !== 'object' ||
    !CODES.has(value.code) ||
    !STATES.has(value.state) ||
    typeof value.tenantId !== 'string' ||
    typeof value.observedAt !== 'string' ||
    Number.isNaN(Date.parse(value.observedAt))
  ) {
    return undefined
  }
  const detail =
    value.detail && typeof value.detail === 'object' ? value.detail : {}
  return { ...value, detail }
}

/** Plain text only: numeric detail fields, no payload echo. */
export function formatMessage(notification) {
  const head =
    notification.state === 'firing'
      ? `ALERTA CVG harness: ${LABELS[notification.code]}`
      : `RESOLVIDO CVG harness: ${LABELS[notification.code]}`
  const facts = Object.entries(notification.detail)
    .filter(([, v]) => typeof v === 'number' || v === null)
    .map(([k, v]) => `${k}=${v === null ? '-' : v}`)
    .join(', ')
  return [
    head,
    `codigo: ${notification.code}`,
    `tenant: ${notification.tenantId}`,
    `observado em: ${notification.observedAt}`,
    facts ? `detalhe: ${facts}` : undefined
  ]
    .filter(Boolean)
    .join('\n')
}

export function createTelegramRelay(options) {
  const secret = options.secret ?? ''
  if (secret.length < 32) {
    throw new Error('ALERT_RELAY_SECRET must have at least 32 characters')
  }
  if (!options.botToken) throw new Error('TELEGRAM_BOT_TOKEN is required')
  if (!options.chatId) throw new Error('TELEGRAM_CHAT_ID is required')
  const send = options.fetch ?? fetch
  const clock = options.clock ?? (() => Date.now())
  const maxSkewMs = options.maxSkewMs ?? 300_000
  const apiBase = (
    options.telegramApiBase ?? 'https://api.telegram.org'
  ).replace(/\/+$/, '')
  // Signatures seen inside the skew window; older ones are rejected by time.
  const seen = new Map()

  function forget(now) {
    for (const [signature, at] of seen) {
      if (now - at > 2 * maxSkewMs) seen.delete(signature)
    }
  }

  async function forward(text) {
    const response = await send(
      `${apiBase}/bot${options.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: options.chatId,
          text,
          disable_web_page_preview: true
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeoutMs ?? 5_000)
      }
    )
    return response.status >= 200 && response.status <= 299
  }

  async function handle(request, body) {
    const timestamp = request.headers['x-cvg-alert-timestamp']
    const signature = request.headers['x-cvg-alert-signature']
    const at = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN
    const now = clock()
    if (Number.isNaN(at) || Math.abs(now - at) > maxSkewMs) {
      return [401, 'stale_or_missing_timestamp']
    }
    if (!safeEqualHex(signAlert(secret, timestamp, body), signature)) {
      return [401, 'bad_signature']
    }
    forget(now)
    if (seen.has(signature)) return [409, 'replayed']
    const notification = parseNotification(body)
    if (!notification) return [400, 'invalid_notification']
    seen.set(signature, now)
    let delivered = false
    try {
      delivered = await forward(formatMessage(notification))
    } catch (error) {
      log('alert_relay.telegram_error', {
        error: String(error?.name ?? 'Error')
      })
    }
    if (!delivered) {
      // Let the monitor retry with a fresh signature.
      seen.delete(signature)
      return [502, 'telegram_unavailable']
    }
    log('alert_relay.forwarded', {
      code: notification.code,
      state: notification.state
    })
    return [200, 'forwarded']
  }

  return createServer((request, response) => {
    const reply = (status, outcome) => {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ outcome }))
    }
    if (request.method === 'GET' && request.url === '/healthz') {
      return reply(200, 'ok')
    }
    if (request.method !== 'POST' || request.url !== '/alert') {
      return reply(404, 'not_found')
    }
    const chunks = []
    let size = 0
    let tooLarge = false
    request.on('data', (chunk) => {
      if (tooLarge) return
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        response.setHeader('connection', 'close')
        log('alert_relay.refused', { status: 413, outcome: 'body_too_large' })
        reply(413, 'body_too_large')
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (tooLarge) return
      handle(request, Buffer.concat(chunks).toString('utf8')).then(
        ([status, outcome]) => {
          if (status >= 400) log('alert_relay.refused', { status, outcome })
          reply(status, outcome)
        },
        () => reply(500, 'internal_error')
      )
    })
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const env = process.env
  const server = createTelegramRelay({
    secret: env.ALERT_RELAY_SECRET,
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
    maxSkewMs: env.ALERT_RELAY_MAX_SKEW_MS
      ? Number(env.ALERT_RELAY_MAX_SKEW_MS)
      : undefined
  })
  const port = Number(env.ALERT_RELAY_PORT ?? 8790)
  server.listen(port, env.ALERT_RELAY_HOST ?? '0.0.0.0', () => {
    log('alert_relay.listening', { port })
  })
  const stop = () => server.close(() => process.exit(0))
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
