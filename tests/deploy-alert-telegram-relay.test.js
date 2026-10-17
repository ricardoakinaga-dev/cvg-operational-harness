import { afterEach, describe, expect, it } from 'vitest'
import { signStopAlert } from '../packages/observability/src/stop-alert.ts'
import {
  MAX_BODY_BYTES,
  createTelegramRelay,
  formatMessage
} from '../deploy/harness/alert-relay/telegram-relay.mjs'

// A3 (plano 0374): the stop-alert monitor posts signed notifications to the
// Telegram relay. The signature comes from the monitor's own signer so the
// two sides cannot drift apart.

const SECRET = 'synthetic-relay-secret-0123456789abcdef'
const NOW = Date.parse('2026-10-16T12:00:00.000Z')

const servers = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((done) => server.close(done)))
  )
})

function notification(overrides = {}) {
  return {
    code: 'worker_down',
    state: 'firing',
    tenantId: 'tenant-synthetic',
    observedAt: '2026-10-16T11:59:30.000Z',
    detail: { knownWorkers: 1, lastBeatAgeMs: 180000, workerStaleMs: 120000 },
    ...overrides
  }
}

async function startRelay({
  telegramStatus = 200,
  telegramThrows = false
} = {}) {
  const calls = []
  const server = createTelegramRelay({
    secret: SECRET,
    botToken: 'synthetic-bot-token',
    chatId: '-100123',
    clock: () => NOW,
    telegramApiBase: 'https://telegram.invalid',
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(init.body) })
      if (telegramThrows) throw new TypeError('network down')
      return new Response('{}', { status: telegramStatus })
    }
  })
  servers.push(server)
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address()
  return { base: `http://127.0.0.1:${port}`, calls }
}

function signedPost(base, body, { timestamp, signature } = {}) {
  const ts = timestamp ?? new Date(NOW).toISOString()
  return fetch(`${base}/alert`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-cvg-alert-timestamp': ts,
      'x-cvg-alert-signature': signature ?? signStopAlert(SECRET, ts, body)
    },
    body
  })
}

describe('Telegram alert relay', () => {
  it('forwards a notification signed by the stop-alert monitor', async () => {
    const { base, calls } = await startRelay()
    const response = await signedPost(base, JSON.stringify(notification()))
    expect(response.status).toBe(200)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      'https://telegram.invalid/botsynthetic-bot-token/sendMessage'
    )
    expect(calls[0].body.chat_id).toBe('-100123')
    expect(calls[0].body.text).toContain(
      'ALERTA CVG harness: nenhum worker ativo'
    )
    expect(calls[0].body.text).toContain('lastBeatAgeMs=180000')
  })

  it('refuses a bad signature, a stale timestamp and a missing one without calling Telegram', async () => {
    const { base, calls } = await startRelay()
    const body = JSON.stringify(notification())
    const bad = await signedPost(base, body, { signature: 'f'.repeat(64) })
    const stale = await signedPost(base, body, {
      timestamp: new Date(NOW - 10 * 60_000).toISOString()
    })
    const missing = await fetch(`${base}/alert`, { method: 'POST', body })
    expect([bad.status, stale.status, missing.status]).toEqual([401, 401, 401])
    expect(calls).toHaveLength(0)
  })

  it('refuses a replayed delivery', async () => {
    const { base, calls } = await startRelay()
    const body = JSON.stringify(notification({ state: 'resolved' }))
    const ts = new Date(NOW).toISOString()
    expect((await signedPost(base, body, { timestamp: ts })).status).toBe(200)
    expect((await signedPost(base, body, { timestamp: ts })).status).toBe(409)
    expect(calls).toHaveLength(1)
    expect(calls[0].body.text).toContain('RESOLVIDO')
  })

  it('answers 502 when Telegram fails so the monitor retries', async () => {
    const failing = await startRelay({ telegramStatus: 500 })
    const body = JSON.stringify(notification())
    const ts = new Date(NOW).toISOString()
    expect(
      (await signedPost(failing.base, body, { timestamp: ts })).status
    ).toBe(502)
    // The same delivery may be retried after a failure.
    expect(
      (await signedPost(failing.base, body, { timestamp: ts })).status
    ).toBe(502)
    const offline = await startRelay({ telegramThrows: true })
    expect((await signedPost(offline.base, body)).status).toBe(502)
  })

  it('rejects malformed notifications, oversized bodies and other routes', async () => {
    const { base, calls } = await startRelay()
    const invalid = await signedPost(base, JSON.stringify({ code: 'other' }))
    expect(invalid.status).toBe(400)
    const big = await signedPost(base, 'x'.repeat(MAX_BODY_BYTES + 1))
    expect(big.status).toBe(413)
    expect((await fetch(`${base}/other`, { method: 'POST' })).status).toBe(404)
    expect((await fetch(`${base}/healthz`)).status).toBe(200)
    expect(calls).toHaveLength(0)
  })

  it('requires a long secret, a bot token and a chat id', () => {
    expect(() =>
      createTelegramRelay({ secret: 'short', botToken: 't', chatId: 'c' })
    ).toThrow(/32 characters/)
    expect(() => createTelegramRelay({ secret: SECRET, chatId: 'c' })).toThrow(
      /TELEGRAM_BOT_TOKEN/
    )
    expect(() =>
      createTelegramRelay({ secret: SECRET, botToken: 't' })
    ).toThrow(/TELEGRAM_CHAT_ID/)
  })

  it('formats only numeric detail, never other payload fields', () => {
    const text = formatMessage(
      notification({ code: 'queue_stalled', detail: { ready: 3, note: 'x' } })
    )
    expect(text).toContain('fila sem progresso')
    expect(text).toContain('ready=3')
    expect(text).not.toContain('note')
  })
})
