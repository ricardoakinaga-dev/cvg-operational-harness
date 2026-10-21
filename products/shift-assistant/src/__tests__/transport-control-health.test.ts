// @vitest-environment node
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import { chmodSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { composeShiftApp, type ShiftApp } from '../compose.ts'
import { loadShiftConfig } from '../config.ts'
import { allowlistedFetch } from '../egress.ts'
import { buildShiftServer } from '../server.ts'
import { WhisperTranscriber } from '../transcriber.ts'
import { EvolutionClient, WahaClient } from '../whatsapp.ts'
import { ANA, GESTOR, setup, tempDir, wahaPayload } from './support/harness.ts'

// AUD-0621 F21, product part (PISO-006): bounded reads and deadlines on every
// channel/Whisper call, pause outside the network queue, readiness that
// reflects progress and a bounded shutdown. SPEC 0179 section 8.

const SECRET = 'segredo-sintetico-de-teste-123456'
const MiB = 1024 * 1024
const servers: Server[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function serve(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<string> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

/** Fails the test instead of hanging when `promise` does not settle in time. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`did not settle in ${ms} ms`)), ms)
    )
  ])
}

function chunked(response: ServerResponse, total: number): void {
  response.writeHead(200, { 'content-type': 'audio/ogg' })
  const chunk = Buffer.alloc(64 * 1024, 7)
  let written = 0
  const pump = () => {
    while (written < total) {
      written += chunk.length
      if (!response.write(chunk)) {
        response.once('drain', pump)
        return
      }
    }
    response.end()
  }
  pump()
}

describe('F21: channel and Whisper reads are bounded', () => {
  it('cancels a WAHA download that exceeds the media ceiling', async () => {
    const base = await serve((_request, response) =>
      chunked(response, 11 * MiB)
    )
    const client = new WahaClient({
      baseUrl: base,
      apiKey: 'k',
      session: 'default',
      fetch: allowlistedFetch([base])
    })
    await expect(
      within(
        client.downloadMedia({
          provider: 'waha',
          messageId: 'a1',
          fromPhone: ANA,
          kind: 'audio',
          text: '',
          mediaRef: `${base}/api/files/a1.oga`,
          mimetype: 'audio/ogg',
          receivedAt: new Date().toISOString()
        }),
        5000
      )
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' })
  })

  it('counts decoded bytes of a compressed download and refuses redirects', async () => {
    const compressed = gzipSync(Buffer.alloc(11 * MiB))
    const base = await serve((request, response) => {
      if (request.url?.endsWith('redirect.oga')) {
        response.writeHead(302, { location: 'http://127.0.0.1:9/x' }).end()
        return
      }
      response.writeHead(200, {
        'content-type': 'audio/ogg',
        'content-encoding': 'gzip',
        'content-length': String(compressed.byteLength)
      })
      response.end(compressed)
    })
    const client = new WahaClient({
      baseUrl: base,
      apiKey: 'k',
      session: 'default',
      fetch: allowlistedFetch([base])
    })
    const message = {
      provider: 'waha' as const,
      messageId: 'g1',
      fromPhone: ANA,
      kind: 'audio' as const,
      text: '',
      mimetype: 'audio/ogg',
      receivedAt: new Date().toISOString()
    }
    await expect(
      within(
        client.downloadMedia({
          ...message,
          mediaRef: `${base}/api/files/g1.oga`
        }),
        5000
      )
    ).rejects.toMatchObject({ code: 'MEDIA_TOO_LARGE' })
    await expect(
      client.downloadMedia({
        ...message,
        mediaRef: `${base}/api/files/redirect.oga`
      })
    ).rejects.toMatchObject({ code: 'TRANSPORT_REDIRECT' })
  })

  it('gives up on a WAHA send that never answers, as uncertain', async () => {
    const base = await serve(() => undefined) // accepts, never responds
    const client = new WahaClient({
      baseUrl: base,
      apiKey: 'k',
      session: 'default',
      fetch: allowlistedFetch([base]),
      sendTimeoutMs: 300
    })
    await expect(
      within(client.sendText(ANA, 'oi'), 3000)
    ).rejects.toMatchObject({ code: 'TRANSPORT_TIMEOUT', outcome: 'uncertain' })
  })

  it('refuses an oversized Whisper response and an endless body', async () => {
    const big = await serve((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ text: 'x'.repeat(300 * 1024) }))
    })
    const transcriber = new WhisperTranscriber({
      baseUrl: big,
      model: 'm',
      language: 'pt',
      fetch: allowlistedFetch([big])
    })
    const audio = { bytes: new Uint8Array([1]), mimetype: 'audio/ogg' }
    await expect(
      within(transcriber.transcribe(audio), 5000)
    ).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })

    const endless = await serve((request, response) => {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"text":"')
    })
    const slow = new WhisperTranscriber({
      baseUrl: endless,
      model: 'm',
      language: 'pt',
      fetch: allowlistedFetch([endless]),
      timeoutMs: 300
    })
    await expect(within(slow.transcribe(audio), 3000)).rejects.toMatchObject({
      code: 'TRANSPORT_TIMEOUT'
    })
  })

  it('validates Evolution base64 and its size before decoding', async () => {
    const huge = await serve((request, response) => {
      request.resume()
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ base64: 'A'.repeat(17 * MiB) }))
    })
    const client = new EvolutionClient({
      baseUrl: huge,
      apiKey: 'k',
      instance: 'cvg',
      fetch: allowlistedFetch([huge])
    })
    const message = {
      provider: 'evolution' as const,
      messageId: 'e1',
      fromPhone: ANA,
      kind: 'audio' as const,
      text: '',
      mimetype: 'audio/ogg',
      receivedAt: new Date().toISOString()
    }
    await expect(
      within(client.downloadMedia({ ...message, mediaRef: 'id:e1' }), 10000)
    ).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' })
    await expect(
      client.downloadMedia({ ...message, mediaRef: 'base64:%%%not base64%%%' })
    ).rejects.toMatchObject({ code: 'MEDIA_INVALID' })
    await expect(
      client.downloadMedia({ ...message, mediaRef: 'base64:AQID' })
    ).resolves.toMatchObject({ bytes: new Uint8Array([1, 2, 3]) })
  })
})

describe('F21: pause, job deadline and readiness do not wait on the network', () => {
  it('records a manager pause while a content job hangs on Whisper', async () => {
    let calls = 0
    const hung = setup({
      transcribe: async () => {
        calls += 1
        return new Promise<string>(() => undefined) // ignores abort
      }
    })
    hung.assistant.receive(
      hung.waha.client.parseWebhook(
        wahaPayload('a1', ANA, '', {
          hasMedia: true,
          media: {
            url: 'http://waha.local:3000/api/files/a1.oga',
            mimetype: 'audio/ogg'
          }
        }),
        hung.now().toISOString()
      )!
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toBe(1)
    const pause = hung.waha.client.parseWebhook(
      wahaPayload('p1', GESTOR, 'pausar assistente'),
      hung.now().toISOString()
    )!
    expect(hung.assistant.receive(pause)).toBe(true)
    expect(hung.store.paused).toBe(true)
    await within(hung.assistant.idle(), 2000)
    expect(hung.waha.textsTo(GESTOR).at(-1)).toContain('pausado')
    // The aborted audio job is kept for after the resume, not failed.
    expect(hung.store.unprocessedMessages().map((m) => m.messageId)).toEqual([
      'a1'
    ])
    expect(hung.waha.textsTo(ANA)).toHaveLength(0)
  })

  it('ends a job that outlives its deadline and keeps the queue moving', async () => {
    let calls = 0
    const env = setup({
      transcribe: async () => {
        calls += 1
        return new Promise<string>(() => undefined) // ignores abort
      },
      extra: { jobTimeoutMs: 200 }
    })
    env.assistant.receive(
      env.waha.client.parseWebhook(
        wahaPayload('a1', ANA, '', {
          hasMedia: true,
          media: {
            url: 'http://waha.local:3000/api/files/a1.oga',
            mimetype: 'audio/ogg'
          }
        }),
        env.now().toISOString()
      )!
    )
    env.assistant.receive(
      env.waha.client.parseWebhook(
        wahaPayload('h1', ANA, 'ajuda'),
        env.now().toISOString()
      )!
    )
    await within(env.assistant.idle(), 3000)
    expect(calls).toBe(1)
    expect(env.waha.textsTo(ANA).join('\n')).toContain('como usar')
    expect(env.store.unprocessedMessages().map((m) => m.messageId)).toEqual([
      'a1'
    ])
  })

  it('reports readiness from progress, storage and backlog, not just liveness', async () => {
    const dataDir = tempDir('ready')
    const env = setup({ dataDir, extra: { maxPendingMessages: 2 } })
    const server = buildShiftServer({
      assistant: env.assistant,
      store: env.store,
      whatsapp: env.waha.client,
      webhookSecret: SECRET
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    const post = (payload: unknown) =>
      fetch(`${base}/webhooks/waha`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-cvg-webhook-secret': SECRET
        },
        body: JSON.stringify(payload)
      })

    expect((await fetch(`${base}/health/live`)).status).toBe(200)
    const ready = await fetch(`${base}/health/ready`)
    expect(ready.status).toBe(200)
    expect(await ready.json()).toMatchObject({ ready: true, mode: 'running' })

    // Oversized text is refused before anything is stored.
    const long = await post(wahaPayload('big', ANA, 'x'.repeat(16_385)))
    expect(long.status).toBe(400)
    expect(env.store.hasMessage('big')).toBe(false)

    // While paused, content is stored up to the backlog limit; then 503,
    // but the manager can still resume.
    await post(wahaPayload('p1', GESTOR, 'pausar assistente'))
    await env.assistant.idle()
    const paused = await fetch(`${base}/health/ready`)
    expect(paused.status).toBe(200)
    expect(await paused.json()).toMatchObject({
      mode: 'paused',
      effectsEnabled: false
    })
    expect((await post(wahaPayload('n1', ANA, 'nota 1'))).status).toBe(200)
    expect((await post(wahaPayload('n2', ANA, 'nota 2'))).status).toBe(200)
    const full = await post(wahaPayload('n3', ANA, 'nota 3'))
    expect(full.status).toBe(503)
    expect(full.headers.get('retry-after')).toBe('30')
    expect(await full.json()).toEqual({ error: 'queue_full' })
    expect(env.store.hasMessage('n3')).toBe(false)
    const backlog = await fetch(`${base}/health/ready`)
    expect(backlog.status).toBe(503)
    expect((await backlog.json()).reasonCodes).toContain('backlog_full')
    expect(
      (await post(wahaPayload('r1', GESTOR, 'retomar assistente'))).status
    ).toBe(200)
    await env.assistant.idle()

    // A journal that cannot be written makes the service unready.
    chmodSync(join(dataDir, 'events.jsonl'), 0o444)
    try {
      await post(wahaPayload('n4', ANA, 'nota 4'))
      await env.assistant.idle()
      const health = await fetch(`${base}/health`)
      expect(health.status).toBe(503)
      const body = await health.json()
      expect(body).toMatchObject({ ok: false, provider: 'waha' })
      expect(body.reasonCodes).toContain('storage_unavailable')
      expect((await post(wahaPayload('n5', ANA, 'nota 5'))).status).toBe(503)
    } finally {
      chmodSync(join(dataDir, 'events.jsonl'), 0o644)
    }
  })
})

describe('F21: composition schedules without overlap and stops in bounded time', () => {
  let app: ShiftApp | undefined

  afterEach(async () => {
    await app?.stop()
    app = undefined
  })

  function config(overrides: Record<string, string> = {}) {
    return loadShiftConfig({
      SHIFT_PROVIDER: 'waha',
      SHIFT_MEMBERS: `${ANA}=Dra Ana;${GESTOR}=Gestor*`,
      SHIFT_WEBHOOK_SECRET: SECRET,
      SHIFT_DATA_DIR: tempDir('compose'),
      SHIFT_PORT: '0',
      SHIFT_HOST: '127.0.0.1',
      SHIFT_TICK_SECONDS: '60',
      WAHA_URL: 'http://waha.local:3000',
      WAHA_API_KEY: 'k',
      WHISPER_URL: 'http://whisper.local:8000',
      LLM_BASE_URL: 'http://127.0.0.1:9/v1',
      LLM_MODEL: 'sandbox',
      LLM_LOCATION: 'local',
      ...overrides
    })
  }

  it('reports a stalled scheduler as not ready', async () => {
    let now = new Date('2026-10-01T17:00:00.000Z')
    app = composeShiftApp(config(), {
      clock: () => now,
      fetchImpl: async () => new Response('{}', { status: 201 })
    })
    const port = await app.start()
    const ready = () => fetch(`http://127.0.0.1:${port}/health/ready`)
    expect((await ready()).status).toBe(200)
    now = new Date(now.getTime() + 3 * 60_000) // > 2 ticks + 30 s, no tick
    const stalled = await ready()
    expect(stalled.status).toBe(503)
    expect((await stalled.json()).reasonCodes).toContain('scheduler_stale')
  })

  it('stops within the shutdown budget while a send hangs', async () => {
    app = composeShiftApp(config({ SHIFT_SHUTDOWN_TIMEOUT_MS: '1000' }), {
      // Ignores the abort signal on purpose.
      fetchImpl: () => new Promise<Response>(() => undefined)
    })
    const port = await app.start()
    const response = await fetch(`http://127.0.0.1:${port}/webhooks/waha`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-webhook-secret': SECRET
      },
      body: JSON.stringify(wahaPayload('h1', ANA, 'ajuda'))
    })
    expect(response.status).toBe(200)
    const started = Date.now()
    await within(app.stop(), 4000)
    expect(Date.now() - started).toBeLessThan(2500)
    app = undefined
  })
})
