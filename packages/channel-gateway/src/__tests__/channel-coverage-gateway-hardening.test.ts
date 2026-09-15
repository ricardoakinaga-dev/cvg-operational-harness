import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type CanonicalOutboundMessageInput,
  type InboundChannelAdapter,
  type OutboundChannelAdapter,
  type OutboundResult
} from '../contracts.ts'
import { ChannelError } from '../errors.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  SHARED_HASH_VERSION,
  channelEffectKey,
  hashOutboundPayload,
  type ChannelEffectIdentity,
  type ChannelEffectRecord,
  type ChannelEffectTransition
} from '../effect-journal.ts'
import { ChannelGateway, type ChannelEvent } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000103'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000103'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-gateway-'))
  directories.push(directory)
  return directory
}

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_gateway_cov',
    tenantId: TENANT,
    conversationId: 'conv_gateway_cov',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'gateway coverage', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:gateway-cov`,
    metadata: {},
    ...overrides
  })
}

function identityOf(parsed: CanonicalOutboundMessage): ChannelEffectIdentity {
  return {
    tenantId: parsed.tenantId,
    channel: parsed.channel,
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: parsed.idempotencyKey
  }
}

function recordPath(
  directory: string,
  identity: ChannelEffectIdentity
): string {
  const digest = createHash('sha256')
    .update(channelEffectKey(identity))
    .digest('hex')
  return join(directory, `${digest}.json`)
}

class GateAdapter implements OutboundChannelAdapter {
  readonly channel = 'whatsapp'
  readonly enabled = true
  readonly sent: CanonicalOutboundMessage[] = []
  gate?: Promise<void>
  error?: unknown

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    if (this.gate) await this.gate
    if (this.error) throw this.error
    this.sent.push(message)
    return {
      externalId: `gate_${message.messageId}`,
      channel: this.channel,
      accepted: true,
      sentAt: '2026-09-12T12:00:00.000Z'
    }
  }
}

class HookedMemoryJournal extends InMemoryChannelEffectJournal {
  renewCalls = 0
  claimThrows = false
  completeMode: 'normal' | 'lease_lost_after_commit' | 'lease_lost_uncertain' =
    'normal'
  releaseReturnsLeaseLost = false

  override async renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean> {
    this.renewCalls += 1
    return super.renew(identity, leaseOwner, leaseMs)
  }

  override async claimSend(
    identity: ChannelEffectIdentity,
    leaseOwner: string
  ): Promise<ChannelEffectRecord> {
    if (this.claimThrows) {
      throw new ChannelError('lease_lost', 'forced claim failure', true)
    }
    return super.claimSend(identity, leaseOwner)
  }

  override async complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition> {
    if (this.completeMode === 'normal') {
      return super.complete(identity, leaseOwner, result)
    }
    if (this.completeMode === 'lease_lost_after_commit') {
      await super.complete(identity, leaseOwner, result)
      return 'lease_lost'
    }
    await super.markUncertain(identity, leaseOwner, 'send_failed')
    return 'lease_lost'
  }

  override async release(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: Parameters<InMemoryChannelEffectJournal['release']>[2]
  ): Promise<ChannelEffectTransition> {
    if (this.releaseReturnsLeaseLost) return 'lease_lost'
    return super.release(identity, leaseOwner, errorCode)
  }
}

function seedRecord(
  identity: ChannelEffectIdentity,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  return {
    identity,
    payloadHash: 'fixture-hash',
    hashVersion: SHARED_HASH_VERSION,
    state: 'PENDING',
    attempt: 1,
    leaseOwner: null,
    leaseExpiresAtMs: null,
    result: null,
    errorCode: null,
    updatedAtMs: 1,
    revision: 1,
    ...overrides
  }
}

async function seedGatewayRecord(
  directory: string,
  identity: ChannelEffectIdentity,
  overrides: Record<string, unknown>
): Promise<void> {
  await writeFile(
    recordPath(directory, identity),
    JSON.stringify(seedRecord(identity, overrides)),
    'utf8'
  )
}

describe('gateway construction and inbound hardening', () => {
  it('runs with the default clock and no event hook', async () => {
    const adapter = new GateAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    const result = await gateway.dispatch(message(), { takeoverActive: false })
    expect(result.accepted).toBe(true)
    expect(adapter.sent).toHaveLength(1)
  })

  it('maps a plain adapter error to invalid_payload on inbound rejection', () => {
    const broken: InboundChannelAdapter = {
      channel: 'whatsapp',
      enabled: true,
      normalize() {
        throw new Error('adapter exploded')
      }
    }
    const events: ChannelEvent[] = []
    const gateway = new ChannelGateway({
      inboundAdapters: [broken],
      onEvent: (event) => events.push(event)
    })
    expect(() =>
      gateway.ingest(
        'whatsapp',
        {},
        {
          tenantId: TENANT,
          conversationId: 'conv',
          correlationId: CORRELATION
        }
      )
    ).toThrowError('adapter exploded')
    expect(events.at(-1)).toMatchObject({
      type: 'channel.inbound.rejected',
      code: 'invalid_payload'
    })
  })
})

describe('gateway replay and uncertainty hardening', () => {
  it('replays FAILED and UNCERTAIN records with stable codes and zero sends', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-replay` })
    const identity = identityOf(parsed)

    await seedGatewayRecord(directory, identity, {
      state: 'FAILED',
      payloadHash: hashOutboundPayload(parsed),
      errorCode: null
    })
    const adapter = new GateAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: new FileChannelEffectJournal({ directory })
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'send_failed', retryable: false })
    expect(adapter.sent).toHaveLength(0)

    await seedGatewayRecord(directory, identity, {
      state: 'UNCERTAIN',
      payloadHash: hashOutboundPayload(parsed),
      errorCode: 'send_failed'
    })
    const events: ChannelEvent[] = []
    const uncertainGateway = new ChannelGateway({
      outboundAdapters: [new GateAdapter()],
      effectJournal: new FileChannelEffectJournal({ directory }),
      onEvent: (event) => events.push(event)
    })
    await expect(
      uncertainGateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(events.at(-1)).toMatchObject({
      type: 'channel.outbound.uncertain',
      code: 'send_failed'
    })

    await seedGatewayRecord(directory, identity, {
      state: 'UNCERTAIN',
      payloadHash: hashOutboundPayload(parsed),
      errorCode: null
    })
    const nullCodeGateway = new ChannelGateway({
      outboundAdapters: [new GateAdapter()],
      effectJournal: new FileChannelEffectJournal({ directory })
    })
    await expect(
      nullCodeGateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
  })

  it('replays a record committed by another lease and emits replayed', async () => {
    const journal = new HookedMemoryJournal()
    journal.completeMode = 'lease_lost_after_commit'
    const adapter = new GateAdapter()
    const events: ChannelEvent[] = []
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal,
      onEvent: (event) => events.push(event)
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-commit` })

    const result = await gateway.dispatch(parsed, { takeoverActive: false })
    expect(result.externalId).toBe(`gate_${parsed.messageId}`)
    expect(adapter.sent).toHaveLength(1)
    expect(
      events.filter((event) => event.type === 'channel.outbound.replayed')
    ).toHaveLength(1)
  })

  it('marks the operation uncertain when the commit is lost after an uncertain record', async () => {
    const journal = new HookedMemoryJournal()
    journal.completeMode = 'lease_lost_uncertain'
    const adapter = new GateAdapter()
    const events: ChannelEvent[] = []
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal,
      onEvent: (event) => events.push(event)
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-lost` })

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapter.sent).toHaveLength(1)
    expect(
      events.filter((event) => event.type === 'channel.outbound.uncertain')
    ).toHaveLength(1)
  })

  it('renews the lease while a slow send is in flight', async () => {
    const journal = new HookedMemoryJournal()
    let releaseGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const adapter = new GateAdapter()
    adapter.gate = gate
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal,
      leaseMs: 40,
      heartbeatIntervalMs: 5
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-renew` })

    const dispatch = gateway.dispatch(parsed, { takeoverActive: false })
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(journal.renewCalls).toBeGreaterThanOrEqual(1)
    releaseGate()
    const result = await dispatch
    expect(result.accepted).toBe(true)
    expect((await journal.find(identityOf(parsed)))?.state).toBe('CONFIRMED')
  })

  it('fails closed when the claim is lost before the send', async () => {
    const journal = new HookedMemoryJournal()
    journal.claimThrows = true
    const adapter = new GateAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(message(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'lease_lost', retryable: true })
    expect(adapter.sent).toHaveLength(0)
  })
})

describe('gateway failure mapping hardening', () => {
  it('fails permanently and replays the recorded failure without a new send', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const adapter = new GateAdapter()
    adapter.error = new ChannelError('provider_rejected', 'nope', false)
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-fail` })

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'provider_rejected', retryable: false })
    expect((await journal.find(identityOf(parsed)))?.state).toBe('FAILED')
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'provider_rejected' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('reports lease_lost when a retryable release loses the fence', async () => {
    const journal = new HookedMemoryJournal()
    journal.releaseReturnsLeaseLost = true
    const adapter = new GateAdapter()
    adapter.error = new ChannelError('send_failed', 'outage', true)
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(message(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'lease_lost', retryable: true })
    expect(adapter.sent).toHaveLength(0)
  })

  it('treats a plain error as an uncertain effect with zero retries', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const adapter = new GateAdapter()
    adapter.error = new Error('socket destroyed')
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:gw-plain` })

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain', retryable: false })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapter.sent).toHaveLength(0)
  })
})
