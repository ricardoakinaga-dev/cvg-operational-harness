// @vitest-environment node
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import { fetchWithResolvedAddress } from '../adapters/ssrf-node.ts'

/**
 * SPEC0248 §3.5 (AUD-0621 F21, core): Evolution and Chatwoot pass their
 * byte ceiling and a deadline to the transport, read the body under both,
 * and keep the effect-unknown mapping when the deadline wins.
 */

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OUTBOUND = {
  messageId: 'msg_bounds_0248',
  tenantId: TENANT,
  conversationId: 'conv_0248',
  channel: 'whatsapp' as const,
  recipient: { id: '5511900000001', type: 'user' as const },
  body: { text: 'synthetic', attachments: [] },
  correlationId: 'corr_00000000-0000-4000-8000-000000000248',
  idempotencyKey: 'channel-bounds-0248',
  metadata: {}
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>

const kinds = {
  evolution: (options: Record<string, unknown>) =>
    new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      instance: 'i',
      ...options
    }),
  chatwoot: (options: Record<string, unknown>) =>
    new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      accountId: '1',
      ...options
    })
} as const

const servers: Server[] = []
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections()
          server.close(() => resolve())
        })
    )
  )
})

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void
): Promise<string> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function hangingBody(): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":'))
      }
    }),
    { status: 200 }
  )
}

/** A finite 1 MiB body: a reader without a ceiling still ends, and fails. */
function largeBody(state: { pulled: number; cancelled: boolean }): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (state.pulled >= 1024) {
          controller.close()
          return
        }
        state.pulled += 1
        controller.enqueue(new Uint8Array(1024).fill(120))
      },
      cancel() {
        state.cancelled = true
      }
    }),
    { status: 200 }
  )
}

for (const [name, make] of Object.entries(kinds)) {
  describe(`SPEC0248 F21 — ${name} send bounds`, () => {
    it('AC24: passes the ceiling and a deadline signal to the transport', async () => {
      const seen: RequestInit[] = []
      const fetchImpl: Fetch = async (_input, init) => {
        seen.push(init)
        return new Response('{}', { status: 200 })
      }
      await make({ fetchImpl }).send(OUTBOUND)
      const init = seen[0] as RequestInit & { maxResponseBytes?: number }
      expect(init.signal).toBeInstanceOf(AbortSignal)
      expect(init.signal?.aborted).toBe(false)
      expect(init.maxResponseBytes).toBe(64 * 1024)
    })

    it('AC24: a provider that never answers ends as an uncertain send', async () => {
      const fetchImpl: Fetch = (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason)
          )
        })
      const started = Date.now()
      await expect(
        make({ fetchImpl, timeoutMs: 100 }).send(OUTBOUND)
      ).rejects.toMatchObject({
        code: 'send_failed',
        retryable: true,
        effectUnknown: true
      })
      expect(Date.now() - started).toBeLessThan(2_000)
    })

    it('AC24: a guard DNS lookup that never answers ends within the deadline', async () => {
      const started = Date.now()
      await expect(
        make({
          dnsLookup: () => new Promise(() => undefined),
          fetchImpl: async () => new Response('{}'),
          timeoutMs: 100
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'send_failed', effectUnknown: true })
      expect(Date.now() - started).toBeLessThan(2_000)
    })

    it('AC24: a body that hangs after the headers ends as an uncertain send', async () => {
      const started = Date.now()
      await expect(
        make({ fetchImpl: async () => hangingBody(), timeoutMs: 100 }).send(
          OUTBOUND
        )
      ).rejects.toMatchObject({ code: 'send_failed', effectUnknown: true })
      expect(Date.now() - started).toBeLessThan(2_000)
    })

    it('AC24: a large body is cut without reading it whole', async () => {
      const state = { pulled: 0, cancelled: false }
      await expect(
        make({
          fetchImpl: async () => largeBody(state),
          maxResponseBytes: 4 * 1024
        }).send(OUTBOUND)
      ).rejects.toMatchObject({
        code: 'provider_rejected',
        message: expect.stringContaining('exceeded the size limit')
      })
      expect(state.cancelled).toBe(true)
      expect(state.pulled).toBeLessThan(10)
    })

    it('AC24: a declared length above the ceiling is refused before reading', async () => {
      await expect(
        make({
          fetchImpl: async () =>
            new Response('x', {
              status: 200,
              headers: { 'content-length': '999999' }
            }),
          maxResponseBytes: 8
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'provider_rejected' })
    })

    it('AC24: the bound transport cuts at the ceiling and honors the deadline', async () => {
      let written = 0
      const big = await startServer((request, response) => {
        request.resume()
        response.writeHead(200)
        const tick = () => {
          if (response.destroyed || written >= 512) return
          response.write('x'.repeat(1024))
          written += 1
          setTimeout(tick, 1)
        }
        tick()
      })
      await expect(
        make({
          baseUrl: big,
          allowPrivateNetworks: true,
          dnsLookup: undefined,
          maxResponseBytes: 4 * 1024
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'provider_rejected' })
      expect(written).toBeLessThan(512)

      const failing = await startServer((request, response) => {
        request.resume()
        response.writeHead(503)
        response.end('x'.repeat(64 * 1024))
      })
      await expect(
        make({
          baseUrl: failing,
          allowPrivateNetworks: true,
          dnsLookup: undefined,
          maxResponseBytes: 1024
        }).send(OUTBOUND)
      ).rejects.toMatchObject({
        code: 'provider_rejected',
        retryable: true,
        message: expect.stringContaining('status 503')
      })

      const limited = await startServer((request, response) => {
        request.resume()
        response.writeHead(429)
        response.end('x'.repeat(64 * 1024))
      })
      await expect(
        make({
          baseUrl: limited,
          allowPrivateNetworks: true,
          dnsLookup: undefined,
          maxResponseBytes: 1024
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'provider_rejected', retryable: true })

      const rejected = await startServer((request, response) => {
        request.resume()
        response.writeHead(400)
        response.end('x'.repeat(64 * 1024))
      })
      await expect(
        make({
          baseUrl: rejected,
          allowPrivateNetworks: true,
          dnsLookup: undefined,
          maxResponseBytes: 1024
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'provider_rejected', retryable: false })

      const stalled = await startServer((request, response) => {
        request.resume()
        response.writeHead(200)
        response.write('{')
      })
      const started = Date.now()
      await expect(
        make({
          baseUrl: stalled,
          allowPrivateNetworks: true,
          dnsLookup: undefined,
          timeoutMs: 100
        }).send(OUTBOUND)
      ).rejects.toMatchObject({ code: 'send_failed', effectUnknown: true })
      expect(Date.now() - started).toBeLessThan(2_000)
    })

    it('AC24: an empty 2xx body is accepted', async () => {
      const result = await make({
        fetchImpl: async () => new Response(null, { status: 200 })
      }).send(OUTBOUND)
      expect(result.accepted).toBe(true)
    })

    it('AC25: rejects a deadline outside 1..120000 ms', () => {
      for (const timeoutMs of [0, -1, 1.5, 120_001, Number.NaN]) {
        expect(() => make({ timeoutMs })).toThrowError(
          expect.objectContaining({ code: 'invalid_config' })
        )
      }
      expect(() => make({ timeoutMs: 1 })).not.toThrow()
      expect(() => make({ timeoutMs: 120_000 })).not.toThrow()
    })
  })
}

describe('SPEC0248 F21 — channel transport ceiling error', () => {
  it('names the ceiling error so adapters can map it', async () => {
    const url = await startServer((request, response) => {
      request.resume()
      response.writeHead(200)
      response.end('x'.repeat(4096))
    })
    await expect(
      fetchWithResolvedAddress(
        `${url}/`,
        { method: 'GET', maxResponseBytes: 16 },
        ['127.0.0.1']
      )
    ).rejects.toMatchObject({
      name: 'ResponseTooLargeError',
      message: 'Response exceeds maxResponseBytes',
      status: 200
    })
  })
})
