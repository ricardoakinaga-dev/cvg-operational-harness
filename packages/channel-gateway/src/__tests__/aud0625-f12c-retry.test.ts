import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CanonicalOutboundMessageSchema } from '../contracts.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  type ChannelEffectJournal
} from '../effect-journal.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import { ChannelGateway } from '../gateway.ts'

// AUD0625 F12c / SPEC 0282 (phase 1): a 429 releases the operation to PENDING
// today, with no wait for Retry-After and no ceiling on attempts. `it.fails`
// states the target and fails today for the gap; controls pass before and
// after the BUILD. Memory and file journals; synthetic data only.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000f12'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function message() {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_f12c',
    tenantId: TENANT,
    conversationId: '7',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: 'corr_00000000-0000-4000-8000-000000000f12',
    idempotencyKey: `${TENANT}:whatsapp:f12c`,
    metadata: {}
  })
}

type Script = (call: number) => Response

function world(kind: 'memory' | 'file', script: Script) {
  let now = 1_000_000
  let calls = 0
  const clock = () => now
  let journal: ChannelEffectJournal
  if (kind === 'memory') {
    journal = new InMemoryChannelEffectJournal({ clock })
  } else {
    const directory = mkdtempSync(join(tmpdir(), 'cvg-f12c-'))
    dirs.push(directory)
    journal = new FileChannelEffectJournal({ directory, clock })
  }
  const adapter = new EvolutionChannelAdapter({
    enabled: true,
    apiKey: 'secret',
    baseUrl: 'https://evolution.example.com',
    instance: 'cvg',
    maxResponseBytes: 1024,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: async () => {
      calls += 1
      return script(calls)
    }
  })
  const gateway = new ChannelGateway({
    outboundAdapters: [adapter],
    effectJournal: journal,
    clock
  })
  const outbound = message()
  const dispatch = () =>
    gateway.dispatch(outbound, { takeoverActive: false }).then(
      () => 'ok',
      (error: unknown) => (error as { code?: string }).code ?? 'unknown'
    )
  const record = () =>
    journal.find({
      tenantId: outbound.tenantId,
      channel: outbound.channel,
      operationKind: CHANNEL_OPERATION_KIND,
      idempotencyKey: outbound.idempotencyKey
    })
  return {
    dispatch,
    record,
    calls: () => calls,
    advance: (ms: number) => {
      now += ms
    }
  }
}

const rateLimited = (retryAfter?: string) =>
  new Response('slow down', {
    status: 429,
    ...(retryAfter !== undefined
      ? { headers: { 'retry-after': retryAfter } }
      : {})
  })

describe.each(['memory', 'file'] as const)(
  'F12c retry policy (%s journal)',
  (kind) => {
    it.fails(
      'a 429 with Retry-After blocks the resend until the moment, without network or a new attempt',
      async () => {
        const w = world(kind, (call) =>
          call === 1 ? rateLimited('2') : new Response('ok', { status: 200 })
        )
        expect(await w.dispatch()).toBe('provider_rejected')
        expect(w.calls()).toBe(1)
        w.advance(1_000)
        expect(await w.dispatch()).toBe('retry_later')
        expect(w.calls()).toBe(1)
        expect((await w.record())?.attempt).toBe(1)
        w.advance(1_000)
        expect(await w.dispatch()).toBe('ok')
        expect(w.calls()).toBe(2)
        expect((await w.record())?.state).toBe('CONFIRMED')
      }
    )

    it.fails(
      'a huge Retry-After is clamped to the ceiling (default 5 minutes)',
      async () => {
        const w = world(kind, (call) =>
          call === 1
            ? rateLimited('86400')
            : new Response('ok', { status: 200 })
        )
        expect(await w.dispatch()).toBe('provider_rejected')
        w.advance(299_000)
        expect(await w.dispatch()).toBe('retry_later')
        expect(w.calls()).toBe(1)
        w.advance(2_000)
        expect(await w.dispatch()).toBe('ok')
        expect(w.calls()).toBe(2)
      }
    )

    it.fails(
      'after the attempt ceiling (default 5) the operation is FAILED attempts_exhausted and never resent',
      async () => {
        const w = world(kind, () => rateLimited())
        const codes: string[] = []
        for (let i = 0; i < 9; i += 1) {
          codes.push(await w.dispatch())
          w.advance(1)
        }
        expect(w.calls()).toBe(5)
        expect(codes.slice(5)).toEqual(Array(4).fill('attempts_exhausted'))
        const record = await w.record()
        expect(record?.state).toBe('FAILED')
        expect(record?.errorCode).toBe('attempts_exhausted')
      }
    )

    it('control: a 429 without Retry-After may be resent at once while under the ceiling', async () => {
      const w = world(kind, (call) =>
        call === 1 ? rateLimited() : new Response('ok', { status: 200 })
      )
      expect(await w.dispatch()).toBe('provider_rejected')
      expect(await w.dispatch()).toBe('ok')
      expect(w.calls()).toBe(2)
      const record = await w.record()
      expect(record).toMatchObject({ state: 'CONFIRMED', attempt: 2 })
    })

    it('control: a confirmed operation is replayed and never resent', async () => {
      const w = world(kind, () => new Response('ok', { status: 200 }))
      expect(await w.dispatch()).toBe('ok')
      expect(await w.dispatch()).toBe('ok')
      expect(w.calls()).toBe(1)
    })

    it('control: a 4xx other than 429 is a definitive FAILED and is not resent', async () => {
      const w = world(kind, () => new Response('no', { status: 400 }))
      expect(await w.dispatch()).toBe('provider_rejected')
      expect(await w.dispatch()).toBe('provider_rejected')
      expect(w.calls()).toBe(1)
      expect((await w.record())?.state).toBe('FAILED')
    })
  }
)
