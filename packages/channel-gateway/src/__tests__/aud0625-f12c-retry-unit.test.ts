import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CanonicalOutboundMessageSchema } from '../contracts.ts'
import { ChatwootChannelAdapter } from '../adapters/chatwoot.ts'
import { EvolutionChannelAdapter } from '../adapters/evolution.ts'
import {
  MAX_RETRY_AFTER_MS,
  parseRetryAfter
} from '../adapters/bounded-body.ts'
import {
  CHANNEL_OPERATION_KIND,
  CURRENT_HASH_VERSION,
  DEFAULT_CHANNEL_MAX_ATTEMPTS,
  InMemoryChannelEffectJournal,
  type ChannelEffectIdentity,
  type ChannelEffectJournal
} from '../effect-journal.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import { ChannelGateway } from '../gateway.ts'

// SPEC 0282: Retry-After parsing, the journal rules at their boundaries, both
// adapters end to end, and the gateway options. Synthetic data only.

const TENANT = 'tenant_00000000-0000-4000-8000-000000000f12'
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe('parseRetryAfter', () => {
  const NOW = Date.parse('2026-10-29T12:00:00.000Z')
  it('reads delta-seconds as milliseconds', () => {
    expect(parseRetryAfter('2', NOW)).toBe(2000)
    expect(parseRetryAfter(' 30 ', NOW)).toBe(30_000)
  })
  it('reads an HTTP date relative to now', () => {
    expect(parseRetryAfter('Thu, 29 Oct 2026 12:00:07 GMT', NOW)).toBe(7000)
  })
  it('cuts at the ceiling', () => {
    expect(parseRetryAfter('86400', NOW)).toBe(MAX_RETRY_AFTER_MS)
    expect(parseRetryAfter('86400', NOW, 1000)).toBe(1000)
    expect(parseRetryAfter('Fri, 30 Oct 2026 12:00:00 GMT', NOW)).toBe(
      MAX_RETRY_AFTER_MS
    )
  })
  it.each([
    ['zero', '0'],
    ['negative', '-5'],
    ['fraction', '1.5'],
    ['letters', 'soon'],
    ['empty', ''],
    ['a date in the past', 'Thu, 29 Oct 2026 11:59:00 GMT'],
    ['a huge number', '9'.repeat(30)]
  ])('ignores %s', (_name, value) => {
    expect(parseRetryAfter(value, NOW)).toBeUndefined()
  })
  it('ignores an absent header', () => {
    expect(parseRetryAfter(null, NOW)).toBeUndefined()
    expect(parseRetryAfter(undefined, NOW)).toBeUndefined()
  })
})

function identity(key = 'op-f12c'): ChannelEffectIdentity {
  return {
    tenantId: TENANT,
    channel: 'whatsapp',
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: key
  }
}
const reserveInput = (extra: Record<string, unknown> = {}) => ({
  identity: identity(),
  payloadHash: 'a'.repeat(64),
  hashVersion: CURRENT_HASH_VERSION,
  leaseOwner: 'worker',
  leaseMs: 1000,
  ...extra
})

describe.each(['memory', 'file'] as const)('journal rules (%s)', (kind) => {
  function journalFor(clock: () => number): ChannelEffectJournal {
    if (kind === 'memory') return new InMemoryChannelEffectJournal({ clock })
    const directory = mkdtempSync(join(tmpdir(), 'cvg-f12c-unit-'))
    dirs.push(directory)
    return new FileChannelEffectJournal({ directory, clock })
  }

  it('the ceiling falls exactly on the reservation after maxAttempts', async () => {
    let now = 1_000
    const journal = journalFor(() => now)
    const attempts: number[] = []
    for (let i = 0; i < DEFAULT_CHANNEL_MAX_ATTEMPTS; i += 1) {
      const outcome = await journal.reserve(reserveInput())
      expect(outcome.outcome).toBe('reserved')
      if (outcome.outcome === 'reserved') attempts.push(outcome.record.attempt)
      await journal.release(identity(), 'worker', 'provider_rejected')
      now += 1
    }
    expect(attempts).toEqual([1, 2, 3, 4, 5])
    const sixth = await journal.reserve(reserveInput())
    expect(sixth.outcome).toBe('replay')
    expect(
      (sixth as { record: { state: string; errorCode: string } }).record
    ).toMatchObject({ state: 'FAILED', errorCode: 'attempts_exhausted' })
  })

  it('a custom maxAttempts is honoured', async () => {
    const journal = journalFor(() => 1_000)
    expect(
      (await journal.reserve(reserveInput({ maxAttempts: 1 }))).outcome
    ).toBe('reserved')
    await journal.release(identity(), 'worker', 'provider_rejected')
    const second = await journal.reserve(reserveInput({ maxAttempts: 1 }))
    expect(second.outcome).toBe('replay')
  })

  it('retry_later grants no lease, keeps attempt and revision, and reports the remaining time', async () => {
    let now = 5_000
    const journal = journalFor(() => now)
    await journal.reserve(reserveInput())
    await journal.release(identity(), 'worker', 'provider_rejected', 30_000)
    const before = await journal.find(identity())
    now += 10_000
    const waiting = await journal.reserve(reserveInput({ leaseOwner: 'other' }))
    expect(waiting).toMatchObject({
      outcome: 'retry_later',
      retryAfterMs: 20_000
    })
    const after = await journal.find(identity())
    expect(after).toEqual(before)
    expect(after).toMatchObject({ attempt: 1, leaseOwner: null })
  })

  it('at the moment the wait ends the operation is reserved again and the wait is cleared', async () => {
    let now = 5_000
    const journal = journalFor(() => now)
    await journal.reserve(reserveInput())
    await journal.release(identity(), 'worker', 'provider_rejected', 30_000)
    now += 30_000
    const again = await journal.reserve(reserveInput())
    expect(again.outcome).toBe('reserved')
    expect((await journal.find(identity()))?.notBeforeMs ?? null).toBeNull()
  })

  it('the ceiling wins over a pending wait', async () => {
    let now = 5_000
    const journal = journalFor(() => now)
    await journal.reserve(reserveInput({ maxAttempts: 1 }))
    await journal.release(identity(), 'worker', 'provider_rejected', 60_000)
    now += 10_000
    const outcome = await journal.reserve(reserveInput({ maxAttempts: 1 }))
    expect(outcome.outcome).toBe('replay')
    expect(await journal.find(identity())).toMatchObject({
      state: 'FAILED',
      errorCode: 'attempts_exhausted'
    })
  })

  it('a zero, negative or non-finite retryAfterMs means no wait', async () => {
    const journal = journalFor(() => 5_000)
    for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const key = `op-nowait-${String(value)}`
      const id = identity(key)
      await journal.reserve(reserveInput({ identity: id }))
      await journal.release(id, 'worker', 'provider_rejected', value)
      const outcome = await journal.reserve(reserveInput({ identity: id }))
      expect(outcome.outcome).toBe('reserved')
    }
  })

  it('a released operation that is UNCERTAIN or CONFIRMED is never a retry_later', async () => {
    const journal = journalFor(() => 5_000)
    const id = identity('op-terminal')
    await journal.reserve(reserveInput({ identity: id }))
    await journal.claimSend(id, 'worker')
    await journal.markUncertain(id, 'worker', 'send_failed')
    expect(
      (await journal.reserve(reserveInput({ identity: id }))).outcome
    ).toBe('uncertain')
  })
})

describe('file journal', () => {
  it('reads a record written before the field existed as no wait, and ignores a malformed one', async () => {
    let now = 5_000
    const directory = mkdtempSync(join(tmpdir(), 'cvg-f12c-legacy-'))
    dirs.push(directory)
    const journal = new FileChannelEffectJournal({
      directory,
      clock: () => now
    })
    await journal.reserve(reserveInput())
    await journal.release(identity(), 'worker', 'provider_rejected')
    const file = readdirSync(directory).find((name) => name.endsWith('.json'))!
    const path = join(directory, file)
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >
    delete parsed.notBeforeMs
    writeFileSync(path, JSON.stringify(parsed))
    now += 1
    expect((await journal.reserve(reserveInput())).outcome).toBe('reserved')
    await journal.release(identity(), 'worker', 'provider_rejected')
    const again = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >
    writeFileSync(path, JSON.stringify({ ...again, notBeforeMs: 'forever' }))
    now += 1
    expect((await journal.reserve(reserveInput())).outcome).toBe('reserved')
  })
})

function message(channel: string) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_f12c_unit',
    tenantId: TENANT,
    conversationId: '7',
    channel,
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola', attachments: [] },
    correlationId: 'corr_00000000-0000-4000-8000-000000000f12',
    idempotencyKey: `${TENANT}:${channel}:f12c-unit`,
    metadata: {}
  })
}

describe.each(['evolution', 'chatwoot'] as const)('%s adapter', (name) => {
  function world(
    headers: Record<string, string>,
    maxRetryAfterMs?: number,
    maxAttempts?: number
  ) {
    let calls = 0
    let now = 1_000_000
    const common = {
      enabled: true,
      apiKey: 'secret',
      maxResponseBytes: 1024,
      dnsLookup: async () => ['93.184.216.34'],
      clock: () => new Date(now),
      fetchImpl: async () => {
        calls += 1
        return calls === 1 || maxAttempts !== undefined
          ? new Response('slow', { status: 429, headers })
          : new Response('ok', { status: 200 })
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
    const journal = new InMemoryChannelEffectJournal({ clock: () => now })
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal,
      ...(maxRetryAfterMs !== undefined ? { maxRetryAfterMs } : {}),
      ...(maxAttempts !== undefined ? { maxAttempts } : {})
    })
    const outbound = message(adapter.channel)
    const dispatch = () =>
      gateway.dispatch(outbound, { takeoverActive: false }).then(
        () => 'ok',
        (error: unknown) => (error as { code?: string }).code ?? 'unknown'
      )
    return {
      dispatch,
      calls: () => calls,
      advance: (ms: number) => {
        now += ms
      }
    }
  }

  it('reads Retry-After in seconds', async () => {
    const w = world({ 'retry-after': '3' })
    expect(await w.dispatch()).toBe('provider_rejected')
    w.advance(2_000)
    expect(await w.dispatch()).toBe('retry_later')
    expect(w.calls()).toBe(1)
    w.advance(1_000)
    expect(await w.dispatch()).toBe('ok')
  })

  it('reads Retry-After as an HTTP date', async () => {
    const date = new Date(1_000_000 + 4_000).toUTCString()
    const w = world({ 'retry-after': date })
    expect(await w.dispatch()).toBe('provider_rejected')
    w.advance(1_000)
    expect(await w.dispatch()).toBe('retry_later')
    w.advance(4_000)
    expect(await w.dispatch()).toBe('ok')
  })

  it('ignores a malformed Retry-After (resend at once)', async () => {
    const w = world({ 'retry-after': 'tomorrow-ish' })
    expect(await w.dispatch()).toBe('provider_rejected')
    expect(await w.dispatch()).toBe('ok')
  })

  it('the gateway ceiling cuts what the adapter let through', async () => {
    const w = world({ 'retry-after': '200' }, 5_000)
    expect(await w.dispatch()).toBe('provider_rejected')
    w.advance(4_000)
    expect(await w.dispatch()).toBe('retry_later')
    w.advance(1_000)
    expect(await w.dispatch()).toBe('ok')
  })

  it('the gateway maxAttempts option reaches the journal', async () => {
    const w = world({}, undefined, 2)
    expect(await w.dispatch()).toBe('provider_rejected')
    expect(await w.dispatch()).toBe('provider_rejected')
    expect(await w.dispatch()).toBe('attempts_exhausted')
    expect(w.calls()).toBe(2)
  })
})
