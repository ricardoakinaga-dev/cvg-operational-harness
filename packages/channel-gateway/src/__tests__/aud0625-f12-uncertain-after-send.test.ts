import { describe, expect, it } from 'vitest'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type OutboundChannelAdapter
} from '../contracts.ts'
import { CHANNEL_OPERATION_KIND } from '../effect-journal.ts'
import { InMemoryChannelEffectJournal } from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

// AUD0625 F12 / SPEC 0268. The `it.fails` cases state the target behaviour and
// pass today only because the defect exists: when a case starts passing for
// real (fix applied), vitest reports it and the marker must be removed.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000f12'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000f12'

type FakeFetch = () => Promise<Response>

function message(channel: string, key: string): CanonicalOutboundMessage {
  return CanonicalOutboundMessageSchema.parse({
    messageId: `msg_${key}`,
    tenantId: TENANT,
    conversationId: '7',
    channel,
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:${channel}:${key}`,
    metadata: {}
  })
}

interface Subject {
  adapter: OutboundChannelAdapter
  attempts: () => number
}

const builders: Record<string, (respond: FakeFetch) => Subject> = {
  evolution(respond) {
    let attempts = 0
    const adapter = new EvolutionChannelAdapter({
      enabled: true,
      baseUrl: 'https://evolution.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      instance: 'cvg',
      fetchImpl: async () => {
        attempts += 1
        return respond()
      }
    })
    return { adapter, attempts: () => attempts }
  },
  chatwoot(respond) {
    let attempts = 0
    const adapter = new ChatwootChannelAdapter({
      enabled: true,
      baseUrl: 'https://chatwoot.example.com',
      dnsLookup: async () => ['93.184.216.34'],
      apiKey: 'secret',
      accountId: '1',
      fetchImpl: async () => {
        attempts += 1
        return respond()
      }
    })
    return { adapter, attempts: () => attempts }
  }
}

async function dispatchTwice(name: string, respond: FakeFetch) {
  const subject = builders[name]!(respond)
  const journal = new InMemoryChannelEffectJournal()
  const gateway = new ChannelGateway({
    outboundAdapters: [subject.adapter],
    effectJournal: journal
  })
  const parsed = message(subject.adapter.channel, 'f12')
  const first = await gateway.dispatch(parsed, { takeoverActive: false }).then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? 'error'
  )
  const second = await gateway.dispatch(parsed, { takeoverActive: false }).then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? 'error'
  )
  const record = await journal.find({
    tenantId: parsed.tenantId,
    channel: parsed.channel,
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: parsed.idempotencyKey
  })
  return { first, second, attempts: subject.attempts(), state: record?.state }
}

describe.each(['evolution', 'chatwoot'])(
  'F12 %s: erro depois do envio',
  (name) => {
    describe.each([500, 502, 503, 504])('HTTP %i', (status) => {
      it.fails(
        'alvo: fica UNCERTAIN e a mesma operação não gera segunda tentativa',
        async () => {
          const result = await dispatchTwice(
            name,
            async () => new Response('{}', { status })
          )
          expect(result.attempts).toBe(1)
          expect(result.state).toBe('UNCERTAIN')
          expect(result.first).toBe('effect_uncertain')
          expect(result.second).toBe('effect_uncertain')
        }
      )
    })

    it('caracterização: hoje HTTP 503 libera o journal e gera 2 tentativas', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('{}', { status: 503 })
      )
      expect(result.attempts).toBe(2)
      expect(result.first).toBe('provider_rejected')
      expect(result.second).toBe('provider_rejected')
      expect(result.state).toBe('PENDING')
    })

    it('controle: falha de conexão (fetch lança) já fica UNCERTAIN sem reenvio', async () => {
      const result = await dispatchTwice(name, async () => {
        throw new TypeError('fetch failed')
      })
      expect(result.attempts).toBe(1)
      expect(result.state).toBe('UNCERTAIN')
      expect(result.second).toBe('effect_uncertain')
    })

    it('controle: 200 confirma e o replay não reenvia', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('{}', { status: 200 })
      )
      expect(result.attempts).toBe(1)
      expect(result.state).toBe('CONFIRMED')
      expect(result.second).toBe('ok')
    })

    it('controle: 400 é rejeição definitiva, registrada como FAILED, sem reenvio', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('{}', { status: 400 })
      )
      expect(result.attempts).toBe(1)
      expect(result.state).toBe('FAILED')
    })

    it('controle: 429 (limite antes do processamento) continua liberando nova tentativa', async () => {
      const result = await dispatchTwice(
        name,
        async () => new Response('{}', { status: 429 })
      )
      expect(result.attempts).toBe(2)
      expect(result.first).toBe('provider_rejected')
    })
  }
)
