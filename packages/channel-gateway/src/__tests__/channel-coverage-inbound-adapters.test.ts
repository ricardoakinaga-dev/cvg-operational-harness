import { describe, expect, it } from 'vitest'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import { ControlledFakeChannelAdapter } from '../adapters/fake.ts'
import {
  InMemoryInboundDedupStore,
  InboundDeduplicator
} from '../idempotency.ts'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessageInput
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000f1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000f1'
const NOW = new Date('2026-09-12T12:00:00.000Z')

const context = {
  tenantId: TENANT,
  conversationId: 'conv_f1',
  correlationId: CORRELATION
}

function outbound(
  channel: 'whatsapp' | 'web' = 'whatsapp',
  overrides: Partial<CanonicalOutboundMessageInput> = {}
) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_cov_1',
    tenantId: TENANT,
    conversationId: 'conv_cov',
    channel,
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'coverage', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:${channel}:cov-1`,
    metadata: {},
    ...overrides
  })
}

describe('inbound dedup store without injected clock', () => {
  it('reserves, checks, sizes and sweeps with the default clock', () => {
    const store = new InMemoryInboundDedupStore()
    const now = Date.now()
    expect(store.reserve('key-1', now + 60_000)).toBe(true)
    expect(store.reserve('key-1', now + 60_000)).toBe(false)
    expect(store.has('key-1')).toBe(true)
    expect(store.size()).toBe(1)
    store.reserve('expired', now - 1)
    expect(store.has('expired')).toBe(false)
    expect(store.size()).toBe(1)
  })

  it('deduplicates through the default store and TTL', () => {
    const dedup = new InboundDeduplicator()
    expect(dedup.accept({ idempotencyKey: 'default-key' }).accepted).toBe(true)
    expect(dedup.accept({ idempotencyKey: 'default-key' }).accepted).toBe(false)
  })
})

describe('Evolution adapter hardening', () => {
  it('fails closed when disabled by default', async () => {
    const adapter = new EvolutionChannelAdapter()
    expect(adapter.enabled).toBe(false)
    expect(() => adapter.normalize({}, context)).toThrowError(
      expect.objectContaining({ code: 'channel_disabled' })
    )
    await expect(adapter.send(outbound())).rejects.toMatchObject({
      code: 'channel_disabled'
    })
  })

  it('constructs with the global fetch and default clock, then sends', async () => {
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      apiKey: 'k',
      instance: 'i',
      fetchImpl: async () => new Response('{}', { status: 200 })
    })
    expect(adapter.enabled).toBe(true)

    const withDefaultClock = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      apiKey: 'k',
      instance: 'i',
      fetchImpl: async () => new Response('{}', { status: 200 })
    })
    const result = await withDefaultClock.send(outbound())
    expect(result.accepted).toBe(true)
    expect(Number.isNaN(Date.parse(result.sentAt))).toBe(false)
  })

  it('normalizes extended text without pushName and rejects response overflow', async () => {
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      apiKey: 'k',
      instance: 'i',
      clock: () => NOW,
      fetchImpl: async () => new Response('{}', { status: 200 })
    })
    const envelope = adapter.normalize(
      {
        data: {
          key: { id: 'EVO-COV', remoteJid: '5511888888888@s.whatsapp.net' },
          message: { extendedTextMessage: { text: 'texto estendido' } }
        }
      },
      context
    )
    expect(envelope.body.text).toBe('texto estendido')
    expect(envelope.sender.displayName).toBeUndefined()

    const overflow = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      apiKey: 'k',
      instance: 'i',
      maxResponseBytes: 8,
      fetchImpl: async () => new Response('x'.repeat(100), { status: 200 })
    })
    await expect(overflow.send(outbound())).rejects.toMatchObject({
      code: 'provider_rejected'
    })
  })
})

describe('Chatwoot adapter hardening', () => {
  it('fails closed when disabled by default', async () => {
    const adapter = new ChatwootChannelAdapter()
    expect(adapter.enabled).toBe(false)
    expect(() => adapter.normalize({}, context)).toThrowError(
      expect.objectContaining({ code: 'channel_disabled' })
    )
    await expect(adapter.send(outbound('web'))).rejects.toMatchObject({
      code: 'channel_disabled'
    })
  })

  it('rejects an unsafe base URL when enabled', () => {
    expect(
      () =>
        new ChatwootChannelAdapter({
          enabled: true,
          baseUrl: 'http://169.254.169.254',
          apiKey: 'k',
          accountId: '1'
        })
    ).toThrowError(expect.objectContaining({ code: 'url_rejected' }))
  })

  it('rejects incomplete payloads and falls back on an invalid timestamp', () => {
    const adapter = new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      apiKey: 'k',
      accountId: '1',
      clock: () => NOW,
      fetchImpl: async () => new Response('{}')
    })
    expect(() =>
      adapter.normalize(
        { event: 'message_created', content: 'sem id' },
        context
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_payload' }))
    expect(() =>
      adapter.normalize(
        { event: 'message_created', id: 9, content: 42 },
        context
      )
    ).toThrowError(expect.objectContaining({ code: 'invalid_payload' }))
    expect(() =>
      adapter.normalize({ id: 10, created_at: 'not-a-date' }, context)
    ).toThrowError(expect.objectContaining({ code: 'invalid_payload' }))
    const envelope = adapter.normalize(
      {
        event: 'message_created',
        message_type: 'incoming',
        id: 11,
        content: 'texto',
        created_at: 'not-a-date',
        conversation: { id: 5, meta: { sender: { identifier: 'ana' } } }
      },
      context
    )
    expect(envelope.timestamp).toBe(NOW.toISOString())
    expect(envelope.sender.id).toBe('ana')
    expect(envelope.conversationId).toBe('5')
  })

  it('normalizes numeric and string timestamps and the unknown sender', () => {
    const adapter = new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      apiKey: 'k',
      accountId: '1',
      clock: () => NOW,
      fetchImpl: async () => new Response('{}')
    })
    const numeric = adapter.normalize(
      { id: 12, content: 'x', created_at: 1_789_000_000 },
      context
    )
    expect(numeric.timestamp).toBe(new Date(1_789_000_000 * 1000).toISOString())
    const absent = adapter.normalize({ id: 13, content: 'y' }, context)
    expect(absent.timestamp).toBe(NOW.toISOString())
    expect(absent.sender.id).toBe('unknown')
    expect(absent.conversationId).toBe(context.conversationId)
  })
})

describe('fake adapter without injected clock', () => {
  it('uses the default clock and expands attachments', () => {
    const adapter = new ControlledFakeChannelAdapter()
    const envelope = adapter.normalize(
      {
        externalId: 'FAKE-COV',
        senderId: '5511999999999',
        recipientId: 'instance',
        text: 'com anexos',
        attachmentCount: 2
      },
      context
    )
    expect(envelope.body.attachments).toHaveLength(2)
    expect(Number.isNaN(Date.parse(envelope.timestamp))).toBe(false)
  })

  it('sends with the default clock', async () => {
    const adapter = new ControlledFakeChannelAdapter()
    const result = await adapter.send(outbound())
    expect(result.accepted).toBe(true)
    expect(Number.isNaN(Date.parse(result.sentAt))).toBe(false)
  })
})
