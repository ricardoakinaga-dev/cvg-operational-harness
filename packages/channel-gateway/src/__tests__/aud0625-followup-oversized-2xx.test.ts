import { describe, expect, it } from 'vitest'
import {
  CanonicalOutboundMessageSchema,
  type OutboundChannelAdapter
} from '../contracts.ts'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

// AUD0625 follow-up of the 0268/0269 review (P2): a 2xx whose body is over the
// ceiling means the destination accepted the send, so the journal must keep it
// UNCERTAIN (SPEC 0268 invariant 1) instead of recording FAILED.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000f12'

function message(channel: string) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_followup',
    tenantId: TENANT,
    conversationId: '7',
    channel,
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: 'corr_00000000-0000-4000-8000-000000000f12',
    idempotencyKey: `${TENANT}:${channel}:followup`,
    metadata: {}
  })
}

function adapterFor(
  name: string,
  respond: () => Promise<Response>
): { adapter: OutboundChannelAdapter; attempts: () => number } {
  let attempts = 0
  const common = {
    enabled: true,
    apiKey: 'secret',
    maxResponseBytes: 1024,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: async () => {
      attempts += 1
      return respond()
    }
  }
  const adapter =
    name === 'evolution'
      ? new EvolutionChannelAdapter({
          ...common,
          baseUrl: 'https://evolution.example.com',
          instance: 'cvg'
        })
      : new ChatwootChannelAdapter({
          ...common,
          baseUrl: 'https://chatwoot.example.com',
          accountId: '1'
        })
  return { adapter, attempts: () => attempts }
}

async function dispatchTwice(name: string, respond: () => Promise<Response>) {
  const subject = adapterFor(name, respond)
  const journal = new InMemoryChannelEffectJournal()
  const gateway = new ChannelGateway({
    outboundAdapters: [subject.adapter],
    effectJournal: journal
  })
  const outbound = message(subject.adapter.channel)
  const codeOf = (error: unknown) => (error as { code?: string }).code
  const first = await gateway
    .dispatch(outbound, { takeoverActive: false })
    .then(() => 'ok', codeOf)
  const second = await gateway
    .dispatch(outbound, { takeoverActive: false })
    .then(() => 'ok', codeOf)
  const record = await journal.find({
    tenantId: outbound.tenantId,
    channel: outbound.channel,
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: outbound.idempotencyKey
  })
  return { first, second, attempts: subject.attempts(), state: record?.state }
}

describe.each(['evolution', 'chatwoot'])(
  '%s: 2xx with an oversized body',
  (name) => {
    it('stays UNCERTAIN and is never resent', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('x'.repeat(5000), { status: 200 })
      )
      expect(result).toEqual({
        first: 'effect_uncertain',
        second: 'effect_uncertain',
        attempts: 1,
        state: 'UNCERTAIN'
      })
    })

    it('stays UNCERTAIN when the oversize is declared by content-length', async () => {
      const result = await dispatchTwice(
        name,
        async () =>
          new Response('x', {
            status: 200,
            headers: { 'content-length': '999999' }
          })
      )
      expect(result.attempts).toBe(1)
      expect(result.state).toBe('UNCERTAIN')
    })

    it('control: a small 2xx body still confirms and replays without resending', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('{}', { status: 200 })
      )
      expect(result).toMatchObject({
        attempts: 1,
        state: 'CONFIRMED',
        second: 'ok'
      })
    })

    it('control: a 4xx with an oversized body is still a definitive FAILED', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('x'.repeat(5000), { status: 400 })
      )
      expect(result).toMatchObject({ attempts: 1, state: 'FAILED' })
    })

    it('control: 429 with an oversized body stays retryable (2 attempts)', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('x'.repeat(5000), { status: 429 })
      )
      expect(result.attempts).toBe(2)
    })
  }
)
