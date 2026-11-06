import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { connect } from 'node:net'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadShiftConfig } from '../config.ts'
import { syntheticWebhook } from '../sandbox/webhook.ts'
import { buildShiftServer } from '../server.ts'
import { ShiftStore } from '../store.ts'
import {
  bodySha256,
  parseWebhookKeys,
  signWebhook,
  WEBHOOK_HEADERS,
  type WebhookAuth,
  type WebhookKey
} from '../webhook-auth.ts'
import { ANA, GESTOR, setup, tempDir, wahaPayload } from './support/harness.ts'

// SPEC 0317 section 7 (G6, SEC-SHIFT-WEBHOOK-20261105): the signed envelope
// over HTTP on a real listener and a real journal. Synthetic data only.

const NOW = new Date('2026-09-30T18:00:00.000Z')
const NOW_S = NOW.getTime() / 1000
const TENANT = 'synthetic-tenant'
const OTHER_TENANT = 'synthetic-other'
const KEY_A = Buffer.alloc(32, 0xa1)
const KEY_ROTATING = Buffer.alloc(32, 0xa2)
const KEY_REVOKED = Buffer.alloc(32, 0xa3)
const KEY_EXPIRED = Buffer.alloc(32, 0xa4)
const KEY_OTHER_TENANT = Buffer.alloc(32, 0xa5)
const KEY_OTHER_PROVIDER = Buffer.alloc(32, 0xa6)
const STATIC_SECRET = 'segredo-estatico-sintetico-que-nao-vale-123456'

function key(
  keyId: string,
  secret: Buffer,
  overrides: Partial<WebhookKey> = {}
): WebhookKey {
  return {
    provider: 'waha',
    tenant: TENANT,
    keyId,
    secret,
    notBeforeMs: Date.parse('2026-01-01T00:00:00Z'),
    notAfterMs: Date.parse('2027-01-01T00:00:00Z'),
    revoked: false,
    ...overrides
  }
}

const AUTH: WebhookAuth = {
  tenant: TENANT,
  keys: [
    key('key-a', KEY_A),
    key('key-rotating', KEY_ROTATING, {
      notAfterMs: NOW.getTime() + 60_000
    }),
    key('key-revoked', KEY_REVOKED, { revoked: true }),
    key('key-expired', KEY_EXPIRED, {
      notAfterMs: NOW.getTime() - 1
    }),
    key('key-other', KEY_OTHER_TENANT, { tenant: OTHER_TENANT }),
    key('key-evolution', KEY_OTHER_PROVIDER, { provider: 'evolution' })
  ]
}

interface SignOptions {
  provider?: 'waha' | 'evolution'
  tenant?: string
  keyId?: string
  secret?: Buffer
  deliveryId?: string
  timestamp?: number
}

function signed(
  body: string | Buffer,
  options: SignOptions = {}
): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...signWebhook({
      provider: options.provider ?? 'waha',
      tenant: options.tenant ?? TENANT,
      keyId: options.keyId ?? 'key-a',
      secret: options.secret ?? KEY_A,
      deliveryId: options.deliveryId ?? 'delivery-0001',
      timestamp: options.timestamp ?? NOW_S,
      body: Buffer.from(body)
    })
  }
}

const servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((done) => server.close(() => done()))
  }
})

interface BootOptions {
  dataDir?: string
  store?: ShiftStore
  maxBodyBytes?: number
  bodyTimeoutMs?: number
  maxPendingMessages?: number
}

async function boot(options: BootOptions = {}) {
  const env = setup({
    ...(options.dataDir ? { dataDir: options.dataDir } : {}),
    ...(options.store ? { store: options.store } : {}),
    ...(options.maxPendingMessages
      ? { extra: { maxPendingMessages: options.maxPendingMessages } }
      : {}),
    start: NOW
  })
  const logs: string[] = []
  const log = (event: string, fields?: Record<string, unknown>) => {
    logs.push(JSON.stringify({ event, ...fields }))
  }
  const parse = vi.spyOn(env.waha.client, 'parseWebhook')
  const admit = vi.spyOn(env.assistant, 'admit')
  const server = buildShiftServer({
    assistant: env.assistant,
    store: env.store,
    whatsapp: env.waha.client,
    webhookAuth: AUTH,
    clock: env.now,
    logger: { info: log, error: log },
    ...(options.maxBodyBytes ? { maxBodyBytes: options.maxBodyBytes } : {}),
    ...(options.bodyTimeoutMs ? { bodyTimeoutMs: options.bodyTimeoutMs } : {})
  })
  servers.push(server)
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const port = (server.address() as AddressInfo).port
  const post = (
    body: string | Buffer,
    headers: Record<string, string>,
    path = '/webhooks/waha'
  ) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers,
      body: new Uint8Array(Buffer.from(body))
    })
  return { ...env, port, post, parse, admit, logs }
}

function journal(dataDir: string): string[] {
  return readdirSync(dataDir)
    .filter((file) => file.endsWith('.jsonl'))
    .sort()
    .flatMap((file) =>
      readFileSync(join(dataDir, file), 'utf8').split('\n').filter(Boolean)
    )
}

const ofType = (lines: string[], type: string) =>
  lines.filter((line) => (JSON.parse(line) as { type: string }).type === type)

const payload = (id: string, text = 'oi') =>
  JSON.stringify(wahaPayload(id, ANA, text))

describe('G6: an unauthenticated request changes nothing', () => {
  const body = payload('n1')
  const valid = signed(body)
  const without = (header: string) =>
    Object.fromEntries(
      Object.entries(valid).filter(([name]) => name !== header)
    )
  const cases: Array<
    [string, string, () => [string | Buffer, Record<string, string>, string?]]
  > = [
    ['no envelope', 'envelope_invalid', () => [body, {}]],
    [
      'static header alone',
      'envelope_invalid',
      () => [body, { 'x-cvg-webhook-secret': STATIC_SECRET }]
    ],
    [
      'query secret alone',
      'query_refused',
      () => [body, {}, `/webhooks/waha?secret=${STATIC_SECRET}`]
    ],
    [
      'query secret next to a valid signature',
      'query_refused',
      () => [body, valid, `/webhooks/waha?secret=${STATIC_SECRET}`]
    ],
    [
      'missing signature',
      'envelope_invalid',
      () => [body, without(WEBHOOK_HEADERS.signature)]
    ],
    [
      'unknown envelope version',
      'envelope_invalid',
      () => [
        body,
        {
          ...valid,
          [WEBHOOK_HEADERS.signature]: valid[
            WEBHOOK_HEADERS.signature
          ]!.replace('v1=', 'v2=')
        }
      ]
    ],
    [
      'signature of another key',
      'signature_invalid',
      () => [body, signed(body, { secret: Buffer.alloc(32, 0x01) })]
    ],
    [
      'one altered body byte',
      'signature_invalid',
      () => [payload('n1', 'oI'), valid]
    ],
    [
      'altered delivery ID',
      'signature_invalid',
      () => [body, { ...valid, [WEBHOOK_HEADERS.deliveryId]: 'delivery-9999' }]
    ],
    [
      'altered timestamp',
      'signature_invalid',
      () => [body, { ...valid, [WEBHOOK_HEADERS.timestamp]: String(NOW_S + 1) }]
    ],
    [
      'timestamp just past the window',
      'timestamp_outside_window',
      () => [body, signed(body, { timestamp: NOW_S - 301 })]
    ],
    [
      'timestamp just ahead of the window',
      'timestamp_outside_window',
      () => [body, signed(body, { timestamp: NOW_S + 301 })]
    ],
    [
      'wrong tenant with that tenant key',
      'tenant_mismatch',
      () => [
        body,
        signed(body, {
          tenant: OTHER_TENANT,
          keyId: 'key-other',
          secret: KEY_OTHER_TENANT
        })
      ]
    ],
    [
      'key of another tenant under this tenant',
      'key_unknown',
      () => [
        body,
        signed(body, { keyId: 'key-other', secret: KEY_OTHER_TENANT })
      ]
    ],
    [
      'key of another provider',
      'key_unknown',
      () => [
        body,
        signed(body, {
          provider: 'evolution',
          keyId: 'key-evolution',
          secret: KEY_OTHER_PROVIDER
        })
      ]
    ],
    [
      'envelope signed for another provider',
      'signature_invalid',
      () => [body, signed(body, { provider: 'evolution' })]
    ],
    [
      'revoked key',
      'key_revoked',
      () => [body, signed(body, { keyId: 'key-revoked', secret: KEY_REVOKED })]
    ],
    [
      'key past its rotation window',
      'key_outside_validity',
      () => [body, signed(body, { keyId: 'key-expired', secret: KEY_EXPIRED })]
    ],
    [
      'unknown key',
      'key_unknown',
      () => [body, signed(body, { keyId: 'key-nobody' })]
    ]
  ]

  it.each(cases)('%s: 401 (%s)', async (_name, reason, request) => {
    const dataDir = tempDir('webhook-negative')
    const env = await boot({ dataDir })
    const [sent, headers, path] = request()
    const response = await env.post(sent, headers, path)
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'unauthorized' })
    expect(env.parse).not.toHaveBeenCalled()
    expect(env.admit).not.toHaveBeenCalled()
    expect(journal(dataDir)).toEqual([])
    expect(readdirSync(join(dataDir, 'media'))).toEqual([])
    expect(env.waha.sent).toEqual([])
    expect(env.store.hasMessage('n1')).toBe(false)
    expect(env.logs).toEqual([
      JSON.stringify({
        event: 'shift.webhook.refused',
        provider: 'waha',
        reason
      })
    ])
  })

  it('never logs a query secret, a static header or key material', async () => {
    const env = await boot()
    const stdout = vi.spyOn(console, 'log')
    const stderr = vi.spyOn(console, 'error')
    await env.post(body, valid, `/webhooks/waha?secret=${STATIC_SECRET}`)
    await env.post(body, { 'x-cvg-webhook-secret': STATIC_SECRET })
    await env.post(payload('n1', 'oI'), valid)
    const written = JSON.stringify([
      env.logs,
      stdout.mock.calls,
      stderr.mock.calls
    ])
    stdout.mockRestore()
    stderr.mockRestore()
    expect(env.logs).toHaveLength(3)
    expect(written).not.toContain(STATIC_SECRET)
    expect(written).not.toContain('secret=')
    expect(written).not.toContain(KEY_A.toString('hex'))
    expect(written).not.toContain(KEY_A.toString('base64url'))
    expect(written).not.toContain(valid[WEBHOOK_HEADERS.signature]!.slice(3))
  })
})

describe('G6: transport limits hold for envelope-valid requests', () => {
  it('refuses an oversized body by its declared length', async () => {
    const dataDir = tempDir('webhook-large')
    const env = await boot({ dataDir, maxBodyBytes: 1024 })
    const big = 'x'.repeat(2048)
    const response = await env.post(big, signed(big))
    expect(response.status).toBe(413)
    expect(env.parse).not.toHaveBeenCalled()
    expect(journal(dataDir)).toEqual([])
  })

  it('refuses a body that overflows without declaring its length', async () => {
    const dataDir = tempDir('webhook-chunked')
    const env = await boot({ dataDir, maxBodyBytes: 1024 })
    const status = await rawRequest(env.port, signed('{}'), (socket) => {
      socket.write('Transfer-Encoding: chunked\r\n\r\n')
      socket.write(`800\r\n${'x'.repeat(2048)}\r\n`)
    })
    expect(status).toBe(413)
    expect(env.parse).not.toHaveBeenCalled()
    expect(journal(dataDir)).toEqual([])
  })

  it('cuts a body that never finishes at its deadline', async () => {
    const dataDir = tempDir('webhook-slow')
    const env = await boot({ dataDir, bodyTimeoutMs: 100 })
    const status = await rawRequest(env.port, signed('{}'), (socket) => {
      socket.write('Content-Length: 1000\r\n\r\n{')
    })
    // The deadline destroys the request; no body means no answer to read.
    expect([0, 408]).toContain(status)
    expect(env.parse).not.toHaveBeenCalled()
    expect(journal(dataDir)).toEqual([])
  })
})

/** Writes a request by hand; resolves with its status, 0 when the socket closes first. */
function rawRequest(
  port: number,
  headers: Record<string, string>,
  rest: (socket: ReturnType<typeof connect>) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write('POST /webhooks/waha HTTP/1.1\r\nHost: shift.local\r\n')
      for (const [name, value] of Object.entries(headers)) {
        socket.write(`${name}: ${value}\r\n`)
      }
      rest(socket)
    })
    let received = ''
    const done = () =>
      resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(received)?.[1] ?? 0))
    socket.on('data', (chunk) => {
      received += String(chunk)
      if (received.includes('\r\n\r\n')) {
        socket.destroy()
        done()
      }
    })
    socket.on('close', done)
    socket.on('error', reject)
  })
}

describe('G6: a valid signature admits once', () => {
  it('admits a signed member message and journals the reservation first', async () => {
    const dataDir = tempDir('webhook-positive')
    const env = await boot({ dataDir })
    const body = payload('p1')
    const response = await env.post(body, signed(body))
    expect(await response.json()).toEqual({ accepted: true })
    await env.assistant.idle()
    expect(env.store.hasMessage('p1')).toBe(true)
    const lines = journal(dataDir)
    const types = lines.map(
      (line) => (JSON.parse(line) as { type: string }).type
    )
    expect(types.indexOf('webhook_delivery_reserved')).toBeLessThan(
      types.indexOf('message_received')
    )
    expect(JSON.parse(lines[0]!)).toMatchObject({
      type: 'webhook_delivery_reserved',
      provider: 'waha',
      tenant: TENANT,
      deliveryId: 'delivery-0001'
    })
    // The reservation keeps a hash, never the body.
    expect(lines[0]).not.toContain(ANA)
  })

  it('accepts the edges of the window and a key in its rotation overlap', async () => {
    const env = await boot()
    const old = payload('w1')
    const ahead = payload('w2')
    const rotating = payload('w3')
    const responses = await Promise.all([
      env.post(
        old,
        signed(old, { timestamp: NOW_S - 300, deliveryId: 'delivery-w1' })
      ),
      env.post(
        ahead,
        signed(ahead, { timestamp: NOW_S + 300, deliveryId: 'delivery-w2' })
      ),
      env.post(
        rotating,
        signed(rotating, {
          keyId: 'key-rotating',
          secret: KEY_ROTATING,
          deliveryId: 'delivery-w3'
        })
      )
    ])
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200
    ])
    await env.assistant.idle()
  })

  it('stops a rotating key at the end of its window, by the server clock', async () => {
    const env = await boot()
    env.advance(2)
    const body = payload('r1')
    const timestamp = env.now().getTime() / 1000
    const response = await env.post(
      body,
      signed(body, { keyId: 'key-rotating', secret: KEY_ROTATING, timestamp })
    )
    expect(response.status).toBe(401)
    expect(env.parse).not.toHaveBeenCalled()
  })

  it('leaves a paused assistant paused: the message is stored, not answered', async () => {
    const dataDir = tempDir('webhook-paused')
    const env = await boot({ dataDir })
    const pause = JSON.stringify(
      wahaPayload('pause-1', GESTOR, 'pausar assistente')
    )
    await env.post(pause, signed(pause, { deliveryId: 'delivery-pause' }))
    await env.assistant.idle()
    expect(env.store.paused).toBe(true)
    const sent = env.waha.sent.length
    const body = payload('paused-1', 'Thor leito 3')
    const response = await env.post(
      body,
      signed(body, { deliveryId: 'delivery-paused' })
    )
    expect(await response.json()).toEqual({ accepted: true })
    await env.assistant.idle()
    expect(env.store.hasMessage('paused-1')).toBe(true)
    expect(env.waha.sent.length).toBe(sent)
  })
})

describe('G6: durable replay', () => {
  it('converges concurrent identical deliveries on one admission', async () => {
    const dataDir = tempDir('webhook-concurrent')
    const env = await boot({ dataDir })
    const body = payload('c1', 'ajuda')
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => env.post(body, signed(body)))
    )
    const answers = await Promise.all(
      responses.map((response) => response.json())
    )
    await env.assistant.idle()
    expect(responses.map((response) => response.status)).toEqual([
      200, 200, 200, 200
    ])
    expect(answers.filter((answer) => answer.accepted === true)).toHaveLength(1)
    expect(answers.filter((answer) => answer.duplicate === true)).toHaveLength(
      3
    )
    const lines = journal(dataDir)
    expect(ofType(lines, 'webhook_delivery_reserved')).toHaveLength(1)
    expect(ofType(lines, 'message_received')).toHaveLength(1)
    expect(env.waha.textsTo(ANA)).toHaveLength(1)
  })

  it('lets exactly one body win a concurrent ID conflict', async () => {
    const dataDir = tempDir('webhook-race')
    const env = await boot({ dataDir })
    const bodies = [payload('x1'), payload('x2')]
    const responses = await Promise.all(
      bodies.map((body) => env.post(body, signed(body)))
    )
    const statuses = responses.map((response) => response.status).sort()
    expect(statuses).toEqual([200, 409])
    await env.assistant.idle()
    const lines = journal(dataDir)
    expect(ofType(lines, 'webhook_delivery_reserved')).toHaveLength(1)
    expect(ofType(lines, 'message_received')).toHaveLength(1)
  })

  it('refuses the same ID with another hash without touching the first', async () => {
    const dataDir = tempDir('webhook-conflict')
    const env = await boot({ dataDir })
    const first = payload('f1', 'primeira versão')
    await env.post(first, signed(first))
    await env.assistant.idle()
    const before = journal(dataDir)
    env.parse.mockClear()
    env.admit.mockClear()
    const second = payload('f1', 'versão adulterada')
    const response = await env.post(second, signed(second))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'delivery_conflict' })
    expect(env.parse).not.toHaveBeenCalled()
    expect(env.admit).not.toHaveBeenCalled()
    expect(journal(dataDir)).toEqual(before)
    expect(env.store.message('f1')?.text).toBe('primeira versão')
  })

  it('keeps an ID for its own tenant and provider key only', () => {
    const store = new ShiftStore()
    const at = NOW.toISOString()
    const delivery = {
      provider: 'waha' as const,
      tenant: TENANT,
      deliveryId: 'delivery-0001',
      bodySha256: 'a'.repeat(64)
    }
    expect(store.reserveWebhookDelivery(delivery, at)).toBe('reserved')
    expect(
      store.reserveWebhookDelivery({ ...delivery, tenant: OTHER_TENANT }, at)
    ).toBe('reserved')
    expect(
      store.reserveWebhookDelivery({ ...delivery, provider: 'evolution' }, at)
    ).toBe('reserved')
  })

  it('remembers the reservation across a restart', async () => {
    const dataDir = tempDir('webhook-restart')
    const first = await boot({ dataDir })
    const body = payload('s1', 'ajuda')
    await first.post(body, signed(body))
    await first.assistant.idle()
    const before = journal(dataDir)

    const restarted = await boot({ dataDir })
    // A retry re-signs with a fresh timestamp and the same ID.
    restarted.advance(30)
    const timestamp = restarted.now().getTime() / 1000
    const replay = await restarted.post(body, signed(body, { timestamp }))
    expect(await replay.json()).toEqual({ accepted: false, duplicate: true })
    await restarted.assistant.idle()
    expect(journal(dataDir)).toEqual(before)
    expect(restarted.waha.sent).toEqual([])

    const other = payload('s2', 'outro corpo')
    const conflict = await restarted.post(other, signed(other, { timestamp }))
    expect(conflict.status).toBe(409)
    expect(journal(dataDir)).toEqual(before)
    expect(restarted.store.hasMessage('s2')).toBe(false)
  })

  it('refuses the original signature once its window has passed', async () => {
    const dataDir = tempDir('webhook-stale')
    const env = await boot({ dataDir })
    const body = payload('o1')
    const headers = signed(body)
    await env.post(body, headers)
    await env.assistant.idle()
    env.advance(6)
    env.parse.mockClear()
    const replay = await env.post(body, headers)
    expect(replay.status).toBe(401)
    expect(env.parse).not.toHaveBeenCalled()
  })

  it('completes a delivery whose process died between reservation and admission', async () => {
    const dataDir = tempDir('webhook-crash')
    const body = payload('k1', 'ajuda')
    // The reservation is on disk; the admission never happened.
    const crashed = new ShiftStore(dataDir)
    crashed.reserveWebhookDelivery(
      {
        provider: 'waha',
        tenant: TENANT,
        deliveryId: 'delivery-0001',
        bodySha256: bodySha256(Buffer.from(body))
      },
      NOW.toISOString()
    )
    const env = await boot({ dataDir })
    const response = await env.post(body, signed(body))
    expect(await response.json()).toEqual({ accepted: true })
    await env.assistant.idle()
    expect(env.store.hasMessage('k1')).toBe(true)
    expect(ofType(journal(dataDir), 'webhook_delivery_reserved')).toHaveLength(
      1
    )
  })

  it('lets a delivery refused by a full queue retry under the same ID', async () => {
    const dataDir = tempDir('webhook-queue')
    const env = await boot({ dataDir, maxPendingMessages: 1 })
    env.admit.mockReturnValueOnce('queue_full')
    const body = payload('q1', 'ajuda')
    const refused = await env.post(body, signed(body))
    expect(refused.status).toBe(503)
    expect(env.store.hasMessage('q1')).toBe(false)
    const retry = await env.post(body, signed(body))
    expect(await retry.json()).toEqual({ accepted: true })
    await env.assistant.idle()
    expect(ofType(journal(dataDir), 'webhook_delivery_reserved')).toHaveLength(
      1
    )
    expect(ofType(journal(dataDir), 'message_received')).toHaveLength(1)
  })

  it('answers 503 and admits nothing when the reservation cannot be durable', async () => {
    const dataDir = tempDir('webhook-readonly')
    new ShiftStore(dataDir)
    const env = await boot({
      store: new ShiftStore(dataDir, { readOnly: true })
    })
    const body = payload('h1')
    const response = await env.post(body, signed(body))
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'storage_unavailable' })
    expect(env.parse).not.toHaveBeenCalled()
    expect(env.admit).not.toHaveBeenCalled()
    expect(existsSync(join(dataDir, 'events.jsonl'))).toBe(false)
  })

  it('projects the reservation, so restore compares it, and omits it when empty', () => {
    const empty = new ShiftStore()
    expect(empty.projection()).not.toHaveProperty('webhookDeliveries')
    const dataDir = tempDir('webhook-projection')
    const store = new ShiftStore(dataDir)
    store.reserveWebhookDelivery(
      {
        provider: 'waha',
        tenant: TENANT,
        deliveryId: 'delivery-0001',
        bodySha256: 'b'.repeat(64)
      },
      NOW.toISOString()
    )
    const projected = store.projection()
    expect(projected.webhookDeliveries).toHaveLength(1)
    expect(JSON.stringify(projected)).not.toContain('delivery-0001')
    expect(new ShiftStore(dataDir).projection()).toEqual(projected)
  })
})

describe('G6: configuration', () => {
  const signer = syntheticWebhook()
  const base = {
    SHIFT_PROVIDER: 'waha',
    SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
    SHIFT_DATA_DIR: '/tmp/shift',
    WAHA_URL: 'http://waha.local:3000',
    WAHA_API_KEY: 'k',
    WHISPER_URL: 'http://whisper.local:8000',
    LLM_BASE_URL: 'http://127.0.0.1:9/v1',
    LLM_MODEL: 'sandbox',
    LLM_LOCATION: 'local',
    ...signer.env
  }
  const material = Buffer.alloc(32, 0x07).toString('base64url')
  const entry = (overrides: Record<string, unknown> = {}) => ({
    provider: 'waha',
    tenant: signer.tenant,
    keyId: 'key-1',
    secret: material,
    notBefore: '2026-01-01T00:00:00Z',
    notAfter: '2027-01-01T00:00:00Z',
    ...overrides
  })

  it('loads the synthetic composition', () => {
    const config = loadShiftConfig(base)
    expect(config.webhook.tenant).toBe(signer.tenant)
    expect(config.webhook.keys).toHaveLength(1)
  })

  it('blocks the real channel: no signed ingress composition exists', () => {
    expect(() =>
      loadShiftConfig({ ...base, SHIFT_CHANNEL_MODE: 'real' })
    ).toThrow('CHANNEL_REAL_BLOCKED')
  })

  it('requires the channel mode to be stated', () => {
    expect(() =>
      loadShiftConfig({ ...base, SHIFT_CHANNEL_MODE: undefined })
    ).toThrow('SHIFT_CHANNEL_MODE')
  })

  it.each(['production', 'test', undefined])(
    'has no static secret fallback under NODE_ENV=%s',
    (nodeEnv) => {
      const stale = { SHIFT_WEBHOOK_SECRET: STATIC_SECRET, NODE_ENV: nodeEnv }
      expect(() =>
        loadShiftConfig({ ...base, ...stale, SHIFT_WEBHOOK_KEYS: undefined })
      ).toThrow('SHIFT_WEBHOOK_SECRET')
      expect(() => loadShiftConfig({ ...base, ...stale })).toThrow(
        'SHIFT_WEBHOOK_SECRET'
      )
    }
  )

  it('needs a live key for its own provider and tenant', () => {
    for (const overrides of [
      { provider: 'evolution' },
      { tenant: 'synthetic-other' },
      { revoked: true }
    ]) {
      expect(() =>
        loadShiftConfig({
          ...base,
          SHIFT_WEBHOOK_KEYS: JSON.stringify([entry(overrides)])
        })
      ).toThrow('no live key')
    }
  })

  it.each([
    ['not JSON', `{${material}`, 'not valid JSON'],
    ['empty list', '[]', '1 to 32'],
    ['short key', [entry({ secret: 'c2hvcnQ' })], 'under 32 bytes'],
    ['no material', [entry({ secret: undefined })], 'without material'],
    ['unknown field', [entry({ extra: true })], 'malformed'],
    ['bad name', [entry({ keyId: 'a\nb' })], 'malformed'],
    [
      'empty validity',
      [entry({ notAfter: '2026-01-01T00:00:00Z' })],
      'empty validity'
    ],
    ['repeated id', [entry(), entry()], 'repeats a key id'],
    [
      'shared material',
      [entry(), entry({ keyId: 'key-2', tenant: 'synthetic-other' })],
      'reuses key material'
    ],
    [
      'unbounded rotation',
      [
        entry(),
        entry({
          keyId: 'key-2',
          secret: Buffer.alloc(32, 0x08).toString('base64url'),
          notBefore: '2026-06-01T00:00:00Z'
        })
      ],
      'overlap exceeds 7 days'
    ]
  ])('refuses %s without echoing it', (_name, value, message) => {
    const raw = typeof value === 'string' ? value : JSON.stringify(value)
    const parsed = parseWebhookKeys(raw)
    expect(parsed).toEqual({ error: expect.stringContaining(message) })
    expect(JSON.stringify(parsed)).not.toContain(material)
  })

  it('accepts a bounded rotation overlap and a revoked entry without material', () => {
    const parsed = parseWebhookKeys(
      JSON.stringify([
        entry({ notAfter: '2026-06-08T00:00:00Z' }),
        entry({
          keyId: 'key-2',
          secret: Buffer.alloc(32, 0x08).toString('base64url'),
          notBefore: '2026-06-01T00:00:00Z'
        }),
        entry({ keyId: 'key-0', secret: undefined, revoked: true })
      ])
    )
    expect(parsed).toHaveProperty('keys')
  })
})
