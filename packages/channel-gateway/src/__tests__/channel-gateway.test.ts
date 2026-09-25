import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlledFakeChannelAdapter } from '../adapters/fake.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { ChannelError } from '../errors.ts'
import {
  InboundDeduplicator,
  InMemoryInboundDedupStore
} from '../idempotency.ts'
import { ChannelGateway } from '../gateway.ts'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessageInput
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-11T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'

const context = {
  tenantId: TENANT,
  conversationId: 'conv_1',
  correlationId: CORRELATION
}

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

function outbound(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_out_1',
    tenantId: TENANT,
    conversationId: 'conv_1',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:out_1`,
    metadata: {},
    ...overrides
  })
}

describe('channel gateway inbound', () => {
  it('normalizes a fake inbound message into the canonical envelope', () => {
    const gateway = new ChannelGateway({
      inboundAdapters: [new ControlledFakeChannelAdapter({ clock: () => NOW })]
    })
    const result = gateway.ingest(
      'whatsapp',
      {
        externalId: 'ABC123',
        senderId: '5511999999999',
        recipientId: 'instance',
        text: 'quero agendar'
      },
      context
    )
    expect(result.accepted).toBe(true)
    expect(result.envelope.tenantId).toBe(TENANT)
    expect(result.envelope.body.text).toBe('quero agendar')
    expect(result.envelope.idempotencyKey).toBe(`${TENANT}:whatsapp:ABC123`)
    expect(result.envelope.timestamp).toBe(NOW.toISOString())
  })

  it('turns duplicated webhook deliveries into a single inbound domain event', () => {
    const events: string[] = []
    const dedup = new InboundDeduplicator({ clock: () => NOW.getTime() })
    const gateway = new ChannelGateway({
      inboundAdapters: [new ControlledFakeChannelAdapter({ clock: () => NOW })],
      deduplicator: dedup,
      onEvent: (event) => events.push(event.type)
    })
    const raw = {
      externalId: 'DUP-1',
      senderId: '5511999999999',
      recipientId: 'instance',
      text: 'oi'
    }
    const first = gateway.ingest('whatsapp', raw, context)
    const second = gateway.ingest('whatsapp', raw, context)
    const third = gateway.ingest('whatsapp', raw, context)
    expect(first.accepted).toBe(true)
    expect(second.accepted).toBe(false)
    expect(third.duplicate).toBe(true)
    expect(
      events.filter((type) => type === 'channel.inbound.accepted')
    ).toHaveLength(1)
    expect(
      events.filter((type) => type === 'channel.inbound.duplicate')
    ).toHaveLength(2)
  })

  it('fails closed for unknown or disabled channels', () => {
    const gateway = new ChannelGateway({
      inboundAdapters: [new EvolutionChannelAdapter()]
    })
    expect(() => gateway.ingest('whatsapp', {}, context)).toThrowError(
      expect.objectContaining({ code: 'channel_disabled' })
    )
    expect(() => gateway.ingest('telegram', {}, context)).toThrowError(
      expect.objectContaining({ code: 'channel_unknown' })
    )
  })

  it('sweeps expired dedup entries to bound memory', () => {
    let now = NOW.getTime()
    const store = new InMemoryInboundDedupStore({ clock: () => now })
    const dedup = new InboundDeduplicator({
      store,
      ttlMs: 1_000,
      clock: () => now
    })
    expect(dedup.accept({ idempotencyKey: 'k1' }).accepted).toBe(true)
    expect(dedup.accept({ idempotencyKey: 'k1' }).accepted).toBe(false)
    now += 1_001
    expect(dedup.accept({ idempotencyKey: 'k1' }).accepted).toBe(true)
  })
})

describe('channel gateway outbound', () => {
  it('sends once and journals the effect so retries never duplicate it', async () => {
    const adapter = new ControlledFakeChannelAdapter({ clock: () => NOW })
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    const first = await gateway.dispatch(outbound(), { takeoverActive: false })
    const second = await gateway.dispatch(outbound(), { takeoverActive: false })
    expect(adapter.sent).toHaveLength(1)
    expect(second).toEqual(first)
  })

  it('blocks every automatic outbound effect during human takeover', async () => {
    const adapter = new ControlledFakeChannelAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    await expect(
      gateway.dispatch(outbound(), { takeoverActive: true })
    ).rejects.toMatchObject({ code: 'human_takeover_active' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('retries a failed send without duplicating the successful effect', async () => {
    const adapter = new ControlledFakeChannelAdapter({ clock: () => NOW })
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    adapter.failNextSend()
    await expect(
      gateway.dispatch(outbound(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'send_failed', retryable: true })
    await gateway.dispatch(outbound(), { takeoverActive: false })
    expect(adapter.sent).toHaveLength(1)
  })

  it('validates outbound payloads before any adapter call', async () => {
    const adapter = new ControlledFakeChannelAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    await expect(
      gateway.dispatch(
        { ...outbound(), tenantId: '' } as CanonicalOutboundMessageInput,
        { takeoverActive: false }
      )
    ).rejects.toMatchObject({ code: 'invalid_payload' })
    expect(adapter.sent).toHaveLength(0)
  })
})

describe('EvolutionAPI adapter', () => {
  it('normalizes realistic webhook payloads', () => {
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      instance: 'cvg',
      clock: () => NOW,
      fetchImpl: async () => new Response('{}')
    })
    const envelope = adapter.normalize(
      {
        event: 'messages.upsert',
        data: {
          key: {
            id: 'EVO-1',
            remoteJid: '5511888888888@s.whatsapp.net',
            fromMe: false
          },
          pushName: 'Maria',
          message: { conversation: 'bom dia' },
          messageTimestamp: 1_789_000_000
        }
      },
      context
    )
    expect(envelope.sender.id).toBe('5511888888888')
    expect(envelope.body.text).toBe('bom dia')
    expect(envelope.externalId).toBe('EVO-1')
  })

  it('rejects outbound echoes and incomplete payloads', () => {
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      instance: 'cvg',
      fetchImpl: async () => new Response('{}')
    })
    expect(() =>
      adapter.normalize(
        {
          data: {
            key: { id: 'x', remoteJid: 'a@s.whatsapp.net', fromMe: true },
            message: { conversation: 'echo' }
          }
        },
        context
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_payload' }))
    expect(() => adapter.normalize({ data: {} }, context)).toThrow(ChannelError)
  })

  it('fails closed when enabled without configuration or with unsafe URLs', () => {
    expect(() => new EvolutionChannelAdapter({ enabled: true })).toThrowError(
      expect.objectContaining({ code: 'invalid_config' })
    )
    expect(
      () =>
        new EvolutionChannelAdapter({
          enabled: true,
          baseUrl: 'http://169.254.169.254',
          apiKey: 'k',
          instance: 'i'
        })
    ).toThrowError(expect.objectContaining({ code: 'url_rejected' }))
  })

  it('requires HTTPS for public base URLs and permits only explicit loopback HTTP', async () => {
    expect(
      () =>
        new EvolutionChannelAdapter({
          enabled: true,
          baseUrl: 'http://evolution.example.com',
          apiKey: 'k',
          instance: 'i'
        })
    ).toThrowError(expect.objectContaining({ code: 'url_rejected' }))
    expect(
      () =>
        new ChatwootChannelAdapter({
          enabled: true,
          baseUrl: 'http://chatwoot.example.com',
          apiKey: 'k',
          accountId: '1'
        })
    ).toThrowError(expect.objectContaining({ code: 'url_rejected' }))

    let seenHost: string | undefined
    let seenBody = ''
    const server = createServer((request, response) => {
      seenHost = request.headers.host
      request.on('data', (chunk) => {
        seenBody += String(chunk)
      })
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end('{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    servers.push(server)
    const port = (server.address() as AddressInfo).port
    const loopback = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: `http://127.0.0.1:${port}`,
      allowPrivateNetworks: true,
      apiKey: 'synthetic-key',
      instance: 'i',
      clock: () => NOW
    })

    const result = await loopback.send(outbound())
    expect(result.accepted).toBe(true)
    expect(seenHost).toBe(`127.0.0.1:${port}`)
    expect(JSON.parse(seenBody)).toEqual({
      number: '5511999999999',
      text: 'ola'
    })
  })

  it('sends through the configured endpoint with bounded failure mapping', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      instance: 'cvg',
      fetchImpl,
      clock: () => NOW
    })
    const result = await adapter.send(outbound())
    expect(result.accepted).toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://evolution.example.com/message/sendText/cvg',
      expect.objectContaining({ redirect: 'manual' })
    )

    // AUD19-007: an allowlisted hostname that resolves to a private
    // address is rejected before any fetch happens (no DNS-rebinding
    // bypass through the allowlist).
    const reboundFetch = vi.fn(async () => new Response('{}', { status: 200 }))
    const rebound = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['169.254.169.254'],
      apiKey: 'secret',
      instance: 'cvg',
      fetchImpl: reboundFetch
    })
    await expect(rebound.send(outbound())).rejects.toMatchObject({
      code: 'url_rejected'
    })
    expect(reboundFetch).not.toHaveBeenCalled()

    const failing = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      instance: 'cvg',
      fetchImpl: async () => new Response('{}', { status: 503 })
    })
    await expect(failing.send(outbound())).rejects.toMatchObject({
      code: 'provider_rejected',
      retryable: true
    })
  })
})

describe('Chatwoot adapter', () => {
  it('normalizes incoming messages and rejects outgoing echoes', () => {
    const adapter = new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      accountId: '1',
      clock: () => NOW,
      fetchImpl: async () => new Response('{}')
    })
    const envelope = adapter.normalize(
      {
        event: 'message_created',
        message_type: 'incoming',
        id: 77,
        content: 'preciso remarcar',
        sender: { id: 5, name: 'Joao', phone_number: '5511977777777' }
      },
      context
    )
    expect(envelope.externalId).toBe('77')
    expect(envelope.sender.id).toBe('5511977777777')
    expect(envelope.body.text).toBe('preciso remarcar')

    expect(() =>
      adapter.normalize(
        {
          event: 'message_created',
          message_type: 'outgoing',
          id: 78,
          content: 'x'
        },
        context
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_payload' }))
  })

  it('requires explicit enablement and complete configuration', () => {
    expect(
      () =>
        new ChatwootChannelAdapter({
          enabled: true,
          baseUrl: 'https://x.example'
        })
    ).toThrowError(expect.objectContaining({ code: 'invalid_config' }))
  })
})
