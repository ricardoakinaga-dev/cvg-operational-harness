import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type OutboundChannelAdapter,
  type OutboundResult
} from '../contracts.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  CURRENT_HASH_VERSION,
  InMemoryChannelEffectJournal,
  channelEffectKey,
  hashOutboundPayload,
  type ChannelEffectIdentity
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000c1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000c1'
const NOW = new Date('2026-09-12T12:00:00.000Z')

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-edge-'))
  directories.push(directory)
  return directory
}

function message() {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_edge_journal',
    tenantId: TENANT,
    conversationId: 'conv_edge',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'edge', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:edge-1`,
    metadata: {}
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

function resultOf(externalId: string): OutboundResult {
  return {
    externalId,
    channel: 'whatsapp',
    accepted: true,
    sentAt: NOW.toISOString()
  }
}

const RECONCILIATION_ACTOR = {
  actorId: 'operator:test-reconciler',
  reason: 'synthetic reconciliation'
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

class SimpleAdapter implements OutboundChannelAdapter {
  readonly channel = 'whatsapp'
  enabled = true
  readonly sent: CanonicalOutboundMessage[] = []
  readonly result: OutboundResult = resultOf('edge_result')

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    this.sent.push(message)
    return { ...this.result }
  }
}

describe('channel effect journal edges', () => {
  it('rejects an empty directory and surfaces missing records as lease_lost', async () => {
    expect(
      () => new FileChannelEffectJournal({ directory: '  ' })
    ).toThrowError(expect.objectContaining({ code: 'invalid_config' }))

    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const identity = identityOf(message())
    await expect(journal.claimSend(identity, 'owner')).rejects.toMatchObject({
      code: 'lease_lost'
    })
    await expect(journal.renew(identity, 'owner', 100)).resolves.toBe(false)
    await expect(
      journal.complete(identity, 'owner', resultOf('x'))
    ).resolves.toBe('lease_lost')
    await expect(
      journal.markUncertain(identity, 'owner', 'send_failed')
    ).resolves.toBe('lease_lost')
  })

  it('fences stale owners and commits exactly one terminal result', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const parsed = message()
    const identity = identityOf(parsed)
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 1_000
    })
    await journal.claimSend(identity, 'owner-a')

    await expect(journal.renew(identity, 'owner-b', 1_000)).resolves.toBe(false)
    await expect(journal.renew(identity, 'owner-a', 1_000)).resolves.toBe(true)
    await expect(
      journal.complete(identity, 'owner-b', resultOf('stale'))
    ).resolves.toBe('lease_lost')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('winner'))
    ).resolves.toBe('committed')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('winner'))
    ).resolves.toBe('lease_lost')
    const record = await journal.find(identity)
    expect(record?.state).toBe('CONFIRMED')
    expect(record?.result?.externalId).toBe('winner')
  })

  it('release returns the operation to PENDING for a safe retry', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const parsed = message()
    const identity = identityOf(parsed)
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 1_000
    })
    await journal.claimSend(identity, 'owner-a')
    await expect(
      journal.release(identity, 'owner-a', 'send_failed')
    ).resolves.toBe('committed')

    const adapter = new SimpleAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const dispatched = await gateway.dispatch(parsed, { takeoverActive: false })
    expect(dispatched.externalId).toBe('edge_result')
    expect(adapter.sent).toHaveLength(1)
  })

  it('reconciliation to not_effected reopens the operation', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const parsed = message()
    const identity = identityOf(parsed)
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 1_000
    })
    await journal.claimSend(identity, 'owner-a')
    await expect(
      journal.resolveUncertain(
        identity,
        {
          kind: 'confirmed',
          result: resultOf('premature')
        },
        RECONCILIATION_ACTOR
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })
    await journal.markUncertain(identity, 'owner-a', 'send_failed')

    const resolved = await journal.resolveUncertain(
      identity,
      {
        kind: 'not_effected'
      },
      RECONCILIATION_ACTOR
    )
    expect(resolved.state).toBe('PENDING')

    const adapter = new SimpleAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const dispatched = await gateway.dispatch(parsed, {
      takeoverActive: false
    })
    expect(dispatched.externalId).toBe('edge_result')
    expect(adapter.sent).toHaveLength(1)
  })

  it('a corrupt durable record fails closed without sending', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const parsed = message()
    const identity = identityOf(parsed)
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 1_000
    })
    await writeFile(recordPath(directory, identity), '{not-json', 'utf8')

    await expect(journal.find(identity)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })

    const adapter = new SimpleAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'journal_unavailable' })
    expect(adapter.sent).toHaveLength(0)
  })

  it('times out when another process holds the journal lock', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({
      directory,
      lockTimeoutMs: 20,
      staleLockMs: 60_000,
      pollMs: 2
    })
    const parsed = message()
    const identity = identityOf(parsed)
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: CURRENT_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 1_000
    })
    await writeFile(`${recordPath(directory, identity)}.lock`, 'other', 'utf8')

    await expect(journal.claimSend(identity, 'owner-a')).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
  })

  it('in-memory journal times out waiters and refuses unknown records', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf(message())
    await expect(journal.waitForTerminal(identity, 20)).resolves.toBeUndefined()
    await expect(
      journal.complete(identity, 'owner', resultOf('x'))
    ).resolves.toBe('lease_lost')
    await expect(
      journal.resolveUncertain(
        identity,
        {
          kind: 'confirmed',
          result: resultOf('x')
        },
        RECONCILIATION_ACTOR
      )
    ).rejects.toMatchObject({ code: 'lease_lost' })
  })

  it('reports operation_in_progress when another worker does not finish in time', async () => {
    const journal = new InMemoryChannelEffectJournal()
    let releaseGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    class GatedAdapter extends SimpleAdapter {
      override async send(message: CanonicalOutboundMessage) {
        await gate
        return super.send(message)
      }
    }
    const adapterA = new GatedAdapter()
    const adapterB = new SimpleAdapter()
    const gatewayA = new ChannelGateway({
      outboundAdapters: [adapterA],
      effectJournal: journal,
      waitTimeoutMs: 30
    })
    const gatewayB = new ChannelGateway({
      outboundAdapters: [adapterB],
      effectJournal: journal,
      waitTimeoutMs: 30
    })
    const parsed = message()

    const stalled = gatewayA.dispatch(parsed, { takeoverActive: false })
    await expect(
      gatewayB.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'operation_in_progress', retryable: true })
    releaseGate()
    const finished = await stalled
    expect(finished.externalId).toBe('edge_result')
    expect(adapterA.sent).toHaveLength(1)
    expect(adapterB.sent).toHaveLength(0)
  })

  it('treats an unknown adapter error as an uncertain effect', async () => {
    class BrokenAdapter implements OutboundChannelAdapter {
      readonly channel = 'whatsapp'
      readonly enabled = true
      async send(): Promise<OutboundResult> {
        throw new Error('socket destroyed mid-flight')
      }
    }

    const adapter = new BrokenAdapter()
    const journal = new InMemoryChannelEffectJournal()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    const parsed = message()

    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain', retryable: false })
    expect((await journal.find(identityOf(parsed)))?.state).toBe('UNCERTAIN')
  })
})
