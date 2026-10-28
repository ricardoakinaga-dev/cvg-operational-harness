import { describe, expect, it } from 'vitest'
import {
  CanonicalOutboundMessageSchema,
  type OutboundChannelAdapter
} from '../contracts.ts'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import {
  oversizedResponseError,
  responseTooLarge
} from '../adapters/bounded-body.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

// Decision recorded by the orchestrator (review G2): a redirect (3xx) with an
// oversized body is a definitive FAILED, consistent with a plain 302 today: a
// redirect means the destination did not process the request. This pins it so
// a status-range mutation cannot turn it into UNCERTAIN unnoticed.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000f12'

function message(channel: string) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_followup_3xx',
    tenantId: TENANT,
    conversationId: '7',
    channel,
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: 'corr_00000000-0000-4000-8000-000000000f12',
    idempotencyKey: `${TENANT}:${channel}:followup-3xx`,
    metadata: {}
  })
}

/** The transport reports an oversized body together with the HTTP status. */
function adapterFor(
  name: string,
  status: number
): { adapter: OutboundChannelAdapter; attempts: () => number } {
  let attempts = 0
  const common = {
    enabled: true,
    apiKey: 'secret',
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: async (): Promise<Response> => {
      attempts += 1
      throw responseTooLarge(status)
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

async function dispatchTwice(name: string, status: number) {
  const subject = adapterFor(name, status)
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

describe('oversizedResponseError by status class', () => {
  const build = (status: number) =>
    oversizedResponseError(responseTooLarge(status), 'Synthetic')

  it.each([301, 302, 307, 308])(
    'a %i with an oversized body is a definitive refusal, not retryable and not uncertain',
    (status) => {
      expect(build(status)).toMatchObject({
        code: 'provider_rejected',
        retryable: false,
        effectUnknown: false
      })
    }
  )

  it('controls: 4xx definitive, 429 retryable, 5xx and 2xx uncertain', () => {
    expect(build(400)).toMatchObject({ retryable: false, effectUnknown: false })
    expect(build(429)).toMatchObject({ retryable: true, effectUnknown: false })
    expect(build(503)).toMatchObject({ retryable: false, effectUnknown: true })
    expect(build(200)).toMatchObject({ retryable: false, effectUnknown: true })
  })
})

describe.each(['evolution', 'chatwoot'])(
  '%s: a 3xx with an oversized body through the gateway',
  (name) => {
    it.each([302, 308])(
      'records FAILED and sends once (%i)',
      async (status) => {
        const result = await dispatchTwice(name, status)
        expect(result).toEqual({
          first: 'provider_rejected',
          second: 'provider_rejected',
          attempts: 1,
          state: 'FAILED'
        })
      }
    )

    it('control: a 200 with an oversized body stays UNCERTAIN', async () => {
      const result = await dispatchTwice(name, 200)
      expect(result).toMatchObject({ attempts: 1, state: 'UNCERTAIN' })
    })
  }
)
