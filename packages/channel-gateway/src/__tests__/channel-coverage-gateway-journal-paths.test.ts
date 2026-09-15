import { createHash } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
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
  InMemoryChannelEffectJournal,
  SHARED_HASH_VERSION,
  channelEffectKey,
  hashOutboundPayload,
  type ChannelEffectIdentity,
  type ChannelEffectJournal,
  type ChannelEffectRecord,
  type ChannelEffectReserveOutcome,
  type ChannelEffectTransition
} from '../effect-journal.ts'
import { ChannelGateway, type ChannelEvent } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000104'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000104'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => {
      await chmod(directory, 0o755).catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    })
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-paths-'))
  directories.push(directory)
  return directory
}

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_paths',
    tenantId: TENANT,
    conversationId: 'conv_paths',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'coverage paths', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:paths`,
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

function resultOf(externalId: string): OutboundResult {
  return {
    externalId,
    channel: 'whatsapp',
    accepted: true,
    sentAt: '2026-09-12T12:00:00.000Z'
  }
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
    return resultOf(`path_${message.messageId}`)
  }
}

class PathJournal extends InMemoryChannelEffectJournal {
  renewThrows = false
  markUncertainThrows = false
  completeReturnsLeaseLost = false

  override async renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean> {
    if (this.renewThrows) throw new Error('renew rejected')
    return super.renew(identity, leaseOwner, leaseMs)
  }

  override async complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition> {
    if (this.completeReturnsLeaseLost) return 'lease_lost'
    return super.complete(identity, leaseOwner, result)
  }

  override async markUncertain(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: Parameters<InMemoryChannelEffectJournal['markUncertain']>[2]
  ): Promise<ChannelEffectTransition> {
    if (this.markUncertainThrows) throw new Error('markUncertain rejected')
    return super.markUncertain(identity, leaseOwner, errorCode)
  }
}

class ReplayOnlyJournal implements ChannelEffectJournal {
  constructor(private readonly record: ChannelEffectRecord) {}

  async reserve(): Promise<ChannelEffectReserveOutcome> {
    return { outcome: 'in_flight', record: this.record }
  }

  async waitForTerminal(): Promise<ChannelEffectRecord | undefined> {
    return this.record
  }

  async find(): Promise<ChannelEffectRecord | undefined> {
    return this.record
  }

  async claimSend(): Promise<ChannelEffectRecord> {
    throw new Error('not used')
  }

  async renew(): Promise<boolean> {
    throw new Error('not used')
  }

  async complete(): Promise<ChannelEffectTransition> {
    throw new Error('not used')
  }

  async fail(): Promise<ChannelEffectTransition> {
    throw new Error('not used')
  }

  async release(): Promise<ChannelEffectTransition> {
    throw new Error('not used')
  }

  async markUncertain(): Promise<ChannelEffectTransition> {
    throw new Error('not used')
  }

  async resolveUncertain(): Promise<ChannelEffectRecord> {
    throw new Error('not used')
  }
}

function effectRecord(
  identity: ChannelEffectIdentity,
  overrides: Partial<ChannelEffectRecord> = {}
): ChannelEffectRecord {
  return {
    identity,
    payloadHash: 'fixture-hash',
    hashVersion: SHARED_HASH_VERSION,
    state: 'PENDING',
    attempt: 1,
    leaseOwner: 'other-owner',
    leaseExpiresAtMs: Date.now() + 60_000,
    result: null,
    errorCode: null,
    updatedAtMs: 1,
    revision: 1,
    ...overrides
  }
}

describe('identity isolation between channels', () => {
  it('keeps the same key independent across channels', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const whatsapp = message({
      channel: 'whatsapp',
      idempotencyKey: 'shared-channel-key'
    })
    const web = message({
      channel: 'web',
      idempotencyKey: 'shared-channel-key'
    })

    const first = await journal.reserve({
      identity: identityOf(whatsapp),
      payloadHash: hashOutboundPayload(whatsapp),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    const second = await journal.reserve({
      identity: identityOf(web),
      payloadHash: hashOutboundPayload(web),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-b',
      leaseMs: 10_000
    })
    expect(first.outcome).toBe('reserved')
    expect(second.outcome).toBe('reserved')

    const gatewayDirectory = await temporaryDirectory()
    const webSent: CanonicalOutboundMessage[] = []
    const webAdapter: OutboundChannelAdapter = {
      channel: 'web',
      enabled: true,
      async send(outbound) {
        webSent.push(outbound)
        return resultOf(`web_${outbound.messageId}`)
      }
    }
    const whatsappAdapter = new GateAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [whatsappAdapter, webAdapter],
      effectJournal: new FileChannelEffectJournal({
        directory: gatewayDirectory
      })
    })
    await gateway.dispatch(whatsapp, { takeoverActive: false })
    await gateway.dispatch(web, { takeoverActive: false })
    expect(whatsappAdapter.sent).toHaveLength(1)
    expect(webSent).toHaveLength(1)
  })
})

describe('in-memory journal unsafe-crash and takeover paths', () => {
  it('turns an expired SENDING lease into UNCERTAIN and allows safe takeover', async () => {
    let now = 1_000
    const clock = () => now
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-crash` })
    const journal = new InMemoryChannelEffectJournal({ clock })
    const identity = identityOf(parsed)
    const input = {
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10
    }
    expect((await journal.reserve(input)).outcome).toBe('reserved')
    await journal.claimSend(identity, 'owner-a')
    now += 11
    expect(
      (await journal.reserve({ ...input, leaseOwner: 'owner-b' })).outcome
    ).toBe('uncertain')
    expect((await journal.find(identity))?.state).toBe('UNCERTAIN')

    const released = message({
      idempotencyKey: `${TENANT}:whatsapp:mem-takeover`
    })
    const releasedIdentity = identityOf(released)
    const releasedInput = {
      identity: releasedIdentity,
      payloadHash: hashOutboundPayload(released),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    }
    await journal.reserve(releasedInput)
    await journal.release(releasedIdentity, 'owner-a', 'send_failed')
    const takeover = await journal.reserve({
      ...releasedInput,
      leaseOwner: 'owner-b'
    })
    expect(takeover.outcome).toBe('reserved')
    if (takeover.outcome !== 'reserved') {
      throw new Error('expected reserved takeover')
    }
    expect(takeover.record.leaseOwner).toBe('owner-b')
  })
})

describe('file journal crash-write and storage-failure paths', () => {
  it('writes UNCERTAIN when an expired SENDING record is re-presented', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-crash` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    await writeFile(
      path,
      JSON.stringify({
        identity,
        payloadHash: hashOutboundPayload(parsed),
        hashVersion: SHARED_HASH_VERSION,
        state: 'SENDING',
        attempt: 1,
        leaseOwner: 'crashed',
        leaseExpiresAtMs: 1,
        result: null,
        errorCode: null,
        updatedAtMs: 1,
        revision: 1
      }),
      'utf8'
    )
    const before = await readFile(path, 'utf8')
    const journal = new FileChannelEffectJournal({ directory })
    const outcome = await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-b',
      leaseMs: 10_000
    })
    expect(outcome.outcome).toBe('uncertain')
    const after = await readFile(path, 'utf8')
    expect(after).not.toBe(before)
    expect(JSON.parse(after).state).toBe('UNCERTAIN')
  })

  it('fails closed on a fresh reserve when the directory is not writable', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-ro` })
    await chmod(directory, 0o555)
    const journal = new FileChannelEffectJournal({ directory })
    await expect(
      journal.reserve({
        identity: identityOf(parsed),
        payloadHash: hashOutboundPayload(parsed),
        hashVersion: SHARED_HASH_VERSION,
        leaseOwner: 'owner-a',
        leaseMs: 10_000
      })
    ).rejects.toMatchObject({ code: 'journal_unavailable' })
    await chmod(directory, 0o755)
  })

  it('detects a payload conflict on the file adapter without rewriting bytes', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-conf` })
    const identity = identityOf(parsed)
    const journal = new FileChannelEffectJournal({ directory })
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    const bytes = await readFile(recordPath(directory, identity), 'utf8')
    const conflict = await journal.reserve({
      identity,
      payloadHash: 'different-payload-hash',
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-b',
      leaseMs: 10_000
    })
    expect(conflict.outcome).toBe('conflict')
    expect(await readFile(recordPath(directory, identity), 'utf8')).toBe(bytes)
  })

  it('fails closed on structurally invalid records', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-shape` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    const journal = new FileChannelEffectJournal({ directory })

    await writeFile(path, 'null', 'utf8')
    await expect(journal.find(identity)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
    await writeFile(
      path,
      JSON.stringify({ revision: 'x', state: 'PENDING' }),
      'utf8'
    )
    await expect(journal.find(identity)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
  })

  it('creates the record after acquiring the lock for a dangling link path', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-link` })
    const identity = identityOf(parsed)
    await symlink(
      join(directory, 'missing-target.json'),
      recordPath(directory, identity)
    )
    const journal = new FileChannelEffectJournal({ directory })
    const outcome = await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    expect(outcome.outcome).toBe('reserved')
    expect((await journal.find(identity))?.state).toBe('PENDING')
  })

  it('steals a stale lock before a transition on an existing record', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-steal` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    await writeFile(
      path,
      JSON.stringify({
        identity,
        payloadHash: hashOutboundPayload(parsed),
        hashVersion: SHARED_HASH_VERSION,
        state: 'PENDING',
        attempt: 1,
        leaseOwner: 'owner-a',
        leaseExpiresAtMs: Date.now() + 60_000,
        result: null,
        errorCode: null,
        updatedAtMs: 1,
        revision: 1
      }),
      'utf8'
    )
    const lockPath = `${path}.lock`
    await writeFile(lockPath, 'stale-owner', 'utf8')
    const past = new Date(Date.now() - 60_000)
    await utimes(lockPath, past, past)

    const journal = new FileChannelEffectJournal({
      directory,
      staleLockMs: 50,
      lockTimeoutMs: 2_000,
      pollMs: 2
    })
    await expect(journal.claimSend(identity, 'owner-a')).resolves.toMatchObject(
      {
        state: 'SENDING'
      }
    )
  })

  it('waits and reconciles missing records without side effects', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-miss` })
    const identity = identityOf(parsed)
    const journal = new FileChannelEffectJournal({ directory, pollMs: 2 })
    await expect(journal.waitForTerminal(identity, 10)).resolves.toBeUndefined()
    await expect(
      journal.resolveUncertain(
        identity,
        { kind: 'not_effected' },
        {
          actorId: 'operator:test-reconciler',
          reason: 'synthetic reconciliation'
        }
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })
  })

  it('fails closed when the record path is unreadable', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-dir` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    await rm(path, { force: true })
    await mkdir(path)

    const journal = new FileChannelEffectJournal({ directory })
    await expect(journal.find(identity)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
    await rm(path, { recursive: true, force: true })
  })
})

describe('gateway in-flight replay terminal paths', () => {
  it('maps UNCERTAIN from a waiting peer to effect_uncertain', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:wait-unc` })
    const identity = identityOf(parsed)
    const journal = new ReplayOnlyJournal(
      effectRecord(identity, {
        state: 'UNCERTAIN',
        errorCode: 'send_failed'
      })
    )
    const events: ChannelEvent[] = []
    const gateway = new ChannelGateway({
      outboundAdapters: [new GateAdapter()],
      effectJournal: journal,
      onEvent: (event) => events.push(event)
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain', retryable: false })
    expect(events.at(-1)).toMatchObject({
      type: 'channel.outbound.uncertain',
      code: 'send_failed'
    })
  })

  it('maps UNCERTAIN without errorCode to the default effect_uncertain code', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:wait-null` })
    const identity = identityOf(parsed)
    const journal = new ReplayOnlyJournal(
      effectRecord(identity, { state: 'UNCERTAIN', errorCode: null })
    )
    const events: ChannelEvent[] = []
    const gateway = new ChannelGateway({
      outboundAdapters: [new GateAdapter()],
      effectJournal: journal,
      onEvent: (event) => events.push(event)
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(events.at(-1)).toMatchObject({
      type: 'channel.outbound.uncertain',
      code: 'effect_uncertain'
    })
  })

  it('fails closed with operation_in_progress for a non-terminal peer record', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:wait-prog` })
    const journal = new ReplayOnlyJournal(
      effectRecord(identityOf(parsed), { state: 'PENDING' })
    )
    const gateway = new ChannelGateway({
      outboundAdapters: [new GateAdapter()],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'operation_in_progress', retryable: true })
  })
})

describe('gateway heartbeat and lost-settlement failure paths', () => {
  it('keeps the dispatch healthy when heartbeat renewal fails', async () => {
    const journal = new PathJournal()
    journal.renewThrows = true
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
    const dispatch = gateway.dispatch(message(), { takeoverActive: false })
    await new Promise((resolve) => setTimeout(resolve, 25))
    releaseGate()
    const result = await dispatch
    expect(result.accepted).toBe(true)
    expect((await journal.find(identityOf(message())))?.state).toBe('CONFIRMED')
  })

  it('survives a rejected markUncertain after a lost settlement', async () => {
    const journal = new PathJournal()
    journal.completeReturnsLeaseLost = true
    journal.markUncertainThrows = true
    const adapter = new GateAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(message(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapter.sent).toHaveLength(1)
  })

  it('survives a rejected markUncertain after an unknown effect', async () => {
    const journal = new PathJournal()
    journal.markUncertainThrows = true
    const adapter = new GateAdapter()
    adapter.error = new ChannelError('send_failed', 'lost ack', true, {
      effectUnknown: true
    })
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: journal
    })
    await expect(
      gateway.dispatch(message(), { takeoverActive: false })
    ).rejects.toMatchObject({ code: 'effect_uncertain' })
    expect(adapter.sent).toHaveLength(0)
  })
})
