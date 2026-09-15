import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type CanonicalOutboundMessageInput,
  type OutboundChannelAdapter,
  type OutboundResult
} from '../contracts.ts'
import { ChannelError } from '../errors.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  CURRENT_HASH_VERSION,
  hashOutboundPayload,
  type ChannelEffectIdentity
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000b1'
const TENANT_B = 'tenant_00000000-0000-4000-8000-0000000000b2'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000b1'
const NOW = new Date('2026-09-12T12:00:00.000Z')

const directories: string[] = []

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-effect-'))
  directories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_journal_1',
    tenantId: TENANT,
    conversationId: 'conv_journal',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'ola journal', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:journal-1`,
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

class ScriptedChannelAdapter implements OutboundChannelAdapter {
  readonly channel = 'whatsapp'
  enabled = true
  readonly sent: CanonicalOutboundMessage[] = []
  failBeforeSend = false
  failAfterSend = false
  gate: Promise<void> | undefined
  started = 0

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    this.started += 1
    if (this.gate) await this.gate
    if (this.failBeforeSend) {
      this.failBeforeSend = false
      throw new ChannelError('send_failed', 'outage before effect', true)
    }
    this.sent.push(message)
    if (this.failAfterSend) {
      this.failAfterSend = false
      throw new ChannelError('send_failed', 'ack lost after effect', true, {
        effectUnknown: true
      })
    }
    return {
      externalId: `scripted_${message.messageId}`,
      channel: this.channel,
      accepted: true,
      sentAt: NOW.toISOString()
    }
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('channel effect journal contract', () => {
  it('1. two simultaneous dispatches with the same key produce one send', async () => {
    const adapter = new ScriptedChannelAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })

    const [first, second] = await Promise.all([
      gateway.dispatch(message(), { takeoverActive: false }),
      gateway.dispatch(message(), { takeoverActive: false })
    ])

    expect(adapter.sent).toHaveLength(1)
    expect(first).toEqual(second)
  })

  it('2. two instances dispute one operation through a shared durable journal', async () => {
    const directory = await temporaryDirectory()
    const adapterA = new ScriptedChannelAdapter()
    const adapterB = new ScriptedChannelAdapter()
    const gatewayA = new ChannelGateway({
      outboundAdapters: [adapterA],
      effectJournal: new FileChannelEffectJournal({
        directory,
        lockTimeoutMs: 5_000
      })
    })
    const gatewayB = new ChannelGateway({
      outboundAdapters: [adapterB],
      effectJournal: new FileChannelEffectJournal({
        directory,
        lockTimeoutMs: 5_000
      })
    })

    const [first, second] = await Promise.all([
      gatewayA.dispatch(message(), { takeoverActive: false }),
      gatewayB.dispatch(message(), { takeoverActive: false })
    ])

    expect(adapterA.sent.length + adapterB.sent.length).toBe(1)
    expect(first).toEqual(second)
  })

  it('3. replay after success returns the durable result without a new send', async () => {
    const directory = await temporaryDirectory()
    const adapter = new ScriptedChannelAdapter()
    const events: string[] = []
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: new FileChannelEffectJournal({ directory }),
      onEvent: (event) => events.push(event.type)
    })
    const parsed = message()

    const first = await gateway.dispatch(parsed, { takeoverActive: false })
    const second = await gateway.dispatch(parsed, { takeoverActive: false })

    expect(adapter.sent).toHaveLength(1)
    expect(second).toEqual(first)
    expect(
      events.filter((type) => type === 'channel.outbound.sent')
    ).toHaveLength(1)
    expect(
      events.filter((type) => type === 'channel.outbound.replayed')
    ).toHaveLength(1)
  })

  it('4. restart after reservation takes over the lease and sends exactly once', async () => {
    const directory = await temporaryDirectory()
    let nowMs = Date.now()
    const clock = () => nowMs
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:restart-1` })
    const journal = new FileChannelEffectJournal({
      directory,
      clock,
      pollMs: 2
    })
    await journal.reserve({
      identity: identityOf(parsed),
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'crashed-worker',
      leaseMs: 50
    })
    expect((await journal.find(identityOf(parsed)))?.state).toBe('PENDING')

    nowMs += 51
    const adapter = new ScriptedChannelAdapter()
    const restarted = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: new FileChannelEffectJournal({
        directory,
        clock,
        pollMs: 2
      }),
      leaseMs: 50,
      clock
    })
    const result = await restarted.dispatch(parsed, { takeoverActive: false })

    expect(adapter.sent).toHaveLength(1)
    expect(result.accepted).toBe(true)
    expect((await journal.find(identityOf(parsed)))?.state).toBe('CONFIRMED')
    const replay = await restarted.dispatch(parsed, { takeoverActive: false })
    expect(replay).toEqual(result)
    expect(adapter.sent).toHaveLength(1)
  })

  it('5. failure before the send releases the lease so a retry sends once', async () => {
    const adapter = new ScriptedChannelAdapter()
    adapter.failBeforeSend = true
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })

    await expect(
      gateway.dispatch(message(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'send_failed', retryable: true })
    expect(adapter.sent).toHaveLength(0)

    const result = await gateway.dispatch(message(), { takeoverActive: false })
    expect(result.accepted).toBe(true)
    expect(adapter.sent).toHaveLength(1)
  })

  it('6. failure after the send marks the operation uncertain and blocks blind retry', async () => {
    const directory = await temporaryDirectory()
    const adapter = new ScriptedChannelAdapter()
    adapter.failAfterSend = true
    const journal = new FileChannelEffectJournal({ directory })
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:uncertain-1` })

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain', retryable: false })
    expect(adapter.sent).toHaveLength(1)
    expect((await journal.find(identityOf(parsed)))?.state).toBe('UNCERTAIN')

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapter.sent).toHaveLength(1)

    const reconciled = await journal.resolveUncertain(
      identityOf(parsed),
      {
        kind: 'confirmed',
        result: {
          externalId: 'reconciled_1',
          channel: 'whatsapp',
          accepted: true,
          sentAt: NOW.toISOString()
        }
      },
      {
        actorId: 'operator:test-reconciler',
        reason: 'synthetic reconciliation'
      }
    )
    expect(reconciled.state).toBe('CONFIRMED')
    const replay = await gateway.dispatch(parsed, { takeoverActive: false })
    expect(replay.externalId).toBe('reconciled_1')
    expect(adapter.sent).toHaveLength(1)
  })

  it('7. expired lease with a late worker never produces a second send or false success', async () => {
    const directory = await temporaryDirectory()
    let nowMs = Date.now()
    const clock = () => nowMs
    const adapterA = new ScriptedChannelAdapter()
    let releaseGate: () => void = () => undefined
    adapterA.gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const journalA = new FileChannelEffectJournal({
      directory,
      clock,
      pollMs: 2
    })
    const gatewayA = new ChannelGateway({
      outboundAdapters: [adapterA],
      effectJournal: journalA,
      leaseMs: 50,
      heartbeatIntervalMs: 60_000,
      waitTimeoutMs: 200,
      clock
    })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:late-1` })

    const lateDispatch = gatewayA.dispatch(parsed, { takeoverActive: false })
    await waitFor(() => adapterA.started === 1)
    nowMs += 51

    const adapterB = new ScriptedChannelAdapter()
    const gatewayB = new ChannelGateway({
      outboundAdapters: [adapterB],
      effectJournal: new FileChannelEffectJournal({
        directory,
        clock,
        pollMs: 2
      }),
      leaseMs: 50,
      waitTimeoutMs: 100,
      clock
    })
    await expect(
      gatewayB.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapterB.sent).toHaveLength(0)

    releaseGate()
    await expect(lateDispatch).rejects.toMatchObject({
      code: 'effect_uncertain'
    })
    expect(adapterA.sent).toHaveLength(1)
    expect(adapterB.sent).toHaveLength(0)
    expect((await journalA.find(identityOf(parsed)))?.state).toBe('UNCERTAIN')
  })

  it('8. the same key with a different payload is rejected as a conflict', async () => {
    const adapter = new ScriptedChannelAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    const parsed = message()

    await gateway.dispatch(parsed, { takeoverActive: false })
    await expect(
      gateway.dispatch(
        message({ body: { text: 'outro conteudo', attachments: [] } }),
        { takeoverActive: false }
      )
    ).rejects.toMatchObject({ code: 'idempotency_key_reuse', retryable: false })
    expect(adapter.sent).toHaveLength(1)
  })

  it('9. distinct tenants with the same key do not interfere', async () => {
    const adapter = new ScriptedChannelAdapter()
    const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
    const first = message({ idempotencyKey: 'shared-key-tenant' })
    const second = message({
      idempotencyKey: 'shared-key-tenant',
      tenantId: TENANT_B
    })

    const [resultA, resultB] = await Promise.all([
      gateway.dispatch(first, { takeoverActive: false }),
      gateway.dispatch(second, { takeoverActive: false })
    ])

    expect(adapter.sent).toHaveLength(2)
    expect(resultA.accepted).toBe(true)
    expect(resultB.accepted).toBe(true)
  })

  it('10. active human takeover blocks the effect before any reservation', async () => {
    const directory = await temporaryDirectory()
    const adapter = new ScriptedChannelAdapter()
    const journal = new FileChannelEffectJournal({ directory })
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message()

    await expect(
      gateway.dispatch(parsed, { takeoverActive: true })
    ).rejects.toMatchObject({ code: 'human_takeover_active' })
    expect(adapter.sent).toHaveLength(0)
    expect(await journal.find(identityOf(parsed))).toBeUndefined()
  })

  it('11. disabled or unconfigured channels fail closed without a reservation', async () => {
    const directory = await temporaryDirectory()
    const adapter = new ScriptedChannelAdapter()
    adapter.enabled = false
    const journal = new FileChannelEffectJournal({ directory })
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message()

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'channel_disabled' })
    await expect(
      gateway.dispatch(message({ channel: 'web' }), {
        takeoverActive: false
      })
    ).rejects.toMatchObject({ code: 'channel_unknown' })
    expect(adapter.sent).toHaveLength(0)
    expect(await journal.find(identityOf(parsed))).toBeUndefined()
  })
})
