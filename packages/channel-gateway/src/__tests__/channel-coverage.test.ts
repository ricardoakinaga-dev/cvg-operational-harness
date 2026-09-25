import { describe, expect, it } from 'vitest'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import { ControlledFakeChannelAdapter } from '../adapters/fake.ts'
import { ChannelGateway } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const CONTEXT = {
  tenantId: TENANT,
  conversationId: 'conv_1',
  correlationId: 'corr_00000000-0000-4000-8000-000000000001'
}
const OUTBOUND = {
  messageId: 'msg_edge_1',
  tenantId: TENANT,
  conversationId: 'conv_1',
  channel: 'web' as const,
  recipient: { id: 'user_1', type: 'user' as const },
  body: { text: 'ola', attachments: [] },
  correlationId: CONTEXT.correlationId,
  idempotencyKey: 'channel-edge-key-1',
  metadata: {}
}

describe('Chatwoot adapter edges', () => {
  function adapter(
    fetchImpl: (input: string, init: RequestInit) => Promise<Response>
  ) {
    return new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      accountId: '1',
      fetchImpl
    })
  }

  it('sends, maps failures and enforces response limits', async () => {
    const ok = adapter(async () => new Response('{}', { status: 200 }))
    const result = await ok.send(OUTBOUND)
    expect(result.accepted).toBe(true)

    const failing = adapter(async () => new Response('{}', { status: 429 }))
    await expect(failing.send(OUTBOUND)).rejects.toMatchObject({
      code: 'provider_rejected',
      retryable: true
    })

    const network = adapter(async () => {
      throw new Error('boom')
    })
    await expect(network.send(OUTBOUND)).rejects.toMatchObject({
      code: 'send_failed',
      retryable: true
    })

    const oversized = adapter(
      async () => new Response('x'.repeat(100), { status: 200 })
    )
    const small = new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      accountId: '1',
      fetchImpl: async () => new Response('x'.repeat(100), { status: 200 }),
      maxResponseBytes: 8
    })
    await expect(small.send(OUTBOUND)).rejects.toMatchObject({
      code: 'provider_rejected'
    })
    void oversized
  })

  it('normalizes timestamp variants and rejects unsupported events', () => {
    const instance = adapter(async () => new Response('{}'))
    expect(
      instance.normalize(
        {
          event: 'message_created',
          message_type: 'incoming',
          id: 5,
          content: 'x',
          created_at: 1_789_000_000,
          conversation: { id: 9, meta: { sender: { id: 8, name: 'Ana' } } }
        },
        CONTEXT
      ).conversationId
    ).toBe('9')
    expect(
      instance.normalize(
        {
          event: 'message_created',
          message_type: 'incoming',
          id: 6,
          content: 'y',
          created_at: '2026-09-11T12:00:00.000Z',
          sender: { id: 8, identifier: 'ana' }
        },
        CONTEXT
      ).sender.id
    ).toBe('ana')
    expect(() =>
      instance.normalize({ event: 'conversation_updated' }, CONTEXT)
    ).toThrowError(/Unsupported/)
  })

  it('uses the context conversation when the payload omits it', () => {
    const instance = adapter(async () => new Response('{}'))
    const envelope = instance.normalize(
      {
        event: 'message_created',
        message_type: 'incoming',
        id: 7,
        content: 'z'
      },
      CONTEXT
    )
    expect(envelope.conversationId).toBe(CONTEXT.conversationId)
    expect(envelope.sender.id).toBe('unknown')
  })
})

describe('Evolution and gateway edges', () => {
  it('maps Evolution network failures and provider rejections', async () => {
    const network = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      instance: 'i',
      fetchImpl: async () => {
        throw new Error('down')
      }
    })
    await expect(network.send(OUTBOUND)).rejects.toMatchObject({
      code: 'send_failed'
    })

    const rejected = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'k',
      instance: 'i',
      fetchImpl: async () => new Response('{}', { status: 400 })
    })
    await expect(rejected.send(OUTBOUND)).rejects.toMatchObject({
      code: 'provider_rejected',
      retryable: false
    })
  })

  it('validates gateway outbound routing and emits rejection events', async () => {
    const events: string[] = []
    const disabledEvolution = new EvolutionChannelAdapter({ enabled: false })
    const gateway = new ChannelGateway({
      outboundAdapters: [disabledEvolution],
      onEvent: (event) => events.push(event.type)
    })
    await expect(
      gateway.dispatch(
        { ...OUTBOUND, channel: 'whatsapp' },
        { takeoverActive: false }
      )
    ).rejects.toMatchObject({ code: 'channel_disabled' })
    expect(events).toContain('channel.outbound.rejected')

    const internalOnly = new ChannelGateway({ outboundAdapters: [] })
    await expect(
      internalOnly.dispatch(OUTBOUND, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'channel_unknown' })
  })

  it('rejects inbound payloads that adapters cannot normalize', () => {
    const gateway = new ChannelGateway({
      inboundAdapters: [new ControlledFakeChannelAdapter()]
    })
    expect(() =>
      gateway.ingest('whatsapp', { externalId: 'x' }, CONTEXT)
    ).toThrowError(/invalid/)
  })
})
