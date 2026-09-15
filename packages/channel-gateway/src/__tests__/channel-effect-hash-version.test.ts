import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalizeJson } from '@cvg/shared'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type CanonicalOutboundMessageInput,
  type OutboundChannelAdapter,
  type OutboundResult
} from '../contracts.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  channelEffectKey,
  hashOutboundPayload,
  InMemoryChannelEffectJournal,
  type ChannelEffectIdentity,
  type ChannelEffectRecord
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000d1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000d1'
const SHARED = 'shared-rfc8785-subset-v1'
const LEGACY = 'legacy-local-v1'
const UNKNOWN = 'unknown-algorithm-v9'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-hash-'))
  directories.push(directory)
  return directory
}

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_hash_1',
    tenantId: TENANT,
    conversationId: 'conv_hash',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'hash version', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:hash-1`,
    metadata: {},
    ...overrides
  })
}

function withMetadata(metadata: Record<string, string>) {
  return message({ metadata })
}

function identityOf(parsed: CanonicalOutboundMessage): ChannelEffectIdentity {
  return {
    tenantId: parsed.tenantId,
    channel: parsed.channel,
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: parsed.idempotencyKey
  }
}

function projectionOf(parsed: CanonicalOutboundMessage) {
  return {
    conversationId: parsed.conversationId,
    channel: parsed.channel,
    recipient: parsed.recipient,
    body: parsed.body,
    correlationId: parsed.correlationId,
    metadata: parsed.metadata
  }
}

function runtimeHash(parsed: CanonicalOutboundMessage): string {
  return createHash('sha256')
    .update(canonicalizeJson(projectionOf(parsed)))
    .digest('hex')
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

function seedRecord(
  identity: ChannelEffectIdentity,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const record = {
    identity,
    payloadHash: 'fixture-hash',
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
  return record
}

class CountingAdapter implements OutboundChannelAdapter {
  readonly channel = 'whatsapp'
  readonly enabled = true
  readonly sent: CanonicalOutboundMessage[] = []

  async send(message: CanonicalOutboundMessage): Promise<OutboundResult> {
    this.sent.push(message)
    return {
      externalId: `counted_${message.messageId}`,
      channel: this.channel,
      accepted: true,
      sentAt: new Date('2026-09-12T12:00:00.000Z').toISOString()
    }
  }
}

describe('AAA-12 hash canonicalization and versioning', () => {
  it('runtime and channel agree on the full projection with integer-like metadata keys', () => {
    const parsed = withMetadata({ '2': 'two', '10': 'ten' })
    expect(hashOutboundPayload(parsed)).toBe(runtimeHash(parsed))
  })

  it('permutations and Unicode keys are stable, changed fields change the hash', () => {
    const first = withMetadata({ '2': 'two', '10': 'ten', á: 'a' })
    const second = withMetadata({ á: 'a', '10': 'ten', '2': 'two' })
    expect(hashOutboundPayload(first)).toBe(hashOutboundPayload(second))
    expect(hashOutboundPayload(first)).not.toBe(
      hashOutboundPayload(withMetadata({ '2': 'two', '10': 'DEZ' }))
    )
  })

  it('new records persist the shared hash version in memory and in the file round-trip', async () => {
    const parsed = message()
    const identity = identityOf(parsed)
    const payloadHash = hashOutboundPayload(parsed)

    const memory = new InMemoryChannelEffectJournal()
    const memoryOutcome = await memory.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED,
      leaseOwner: 'owner-memory',
      leaseMs: 1_000
    })
    expect(memoryOutcome.outcome).toBe('reserved')
    if (memoryOutcome.outcome !== 'reserved') {
      throw new Error('expected reserved outcome')
    }
    const memoryRecord: ChannelEffectRecord = memoryOutcome.record
    const memoryVersion: string = memoryRecord.hashVersion
    expect(memoryVersion).toBe(SHARED)

    const directory = await temporaryDirectory()
    const file = new FileChannelEffectJournal({ directory })
    await file.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED,
      leaseOwner: 'owner-file',
      leaseMs: 1_000
    })
    const persisted = await file.find(identity)
    if (!persisted) throw new Error('record not found')
    const persistedVersion: string = persisted.hashVersion
    expect(persistedVersion).toBe(SHARED)

    const restarted = new FileChannelEffectJournal({ directory })
    expect((await restarted.find(identity))?.hashVersion).toBe(SHARED)
  })

  it('gateway replays a new record after restart without a second send', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:replay-new` })
    const adapterA = new CountingAdapter()
    const adapterB = new CountingAdapter()
    const gatewayA = new ChannelGateway({
      outboundAdapters: [adapterA],
      effectJournal: new FileChannelEffectJournal({ directory })
    })
    const gatewayB = new ChannelGateway({
      outboundAdapters: [adapterB],
      effectJournal: new FileChannelEffectJournal({ directory })
    })

    const first = await gatewayA.dispatch(parsed, { takeoverActive: false })
    const second = await gatewayB.dispatch(parsed, { takeoverActive: false })

    expect(adapterA.sent).toHaveLength(1)
    expect(adapterB.sent).toHaveLength(0)
    expect(second).toEqual(first)
  })

  it('a legacy record without hashVersion is read as legacy-local-v1 and never replayed under a new algorithm', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:legacy-1` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    const legacy = seedRecord(identity, {
      state: 'CONFIRMED',
      result: {
        externalId: 'legacy_effect',
        channel: 'whatsapp',
        accepted: true,
        sentAt: '2026-09-01T00:00:00.000Z'
      }
    })
    await writeFile(path, JSON.stringify(legacy), 'utf8')
    const bytesBefore = await readFile(path, 'utf8')

    const journal = new FileChannelEffectJournal({ directory })
    expect((await journal.find(identity))?.hashVersion).toBe(LEGACY)

    const adapter = new CountingAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: new FileChannelEffectJournal({ directory })
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({
      code: 'hash_algorithm_mismatch',
      retryable: false
    })
    expect(adapter.sent).toHaveLength(0)
    expect(await readFile(path, 'utf8')).toBe(bytesBefore)
  })

  it('zero sends when hash bytes are equal but versions differ', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:same-bytes` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    const sharedBytes = runtimeHash(parsed)
    await writeFile(
      path,
      JSON.stringify(
        seedRecord(identity, {
          payloadHash: sharedBytes,
          hashVersion: LEGACY,
          state: 'PENDING',
          leaseExpiresAtMs: 1
        })
      ),
      'utf8'
    )
    const bytesBefore = await readFile(path, 'utf8')

    const adapter = new CountingAdapter()
    const gateway = new ChannelGateway({
      outboundAdapters: [adapter],
      effectJournal: new FileChannelEffectJournal({ directory })
    })
    await expect(
      gateway.dispatch(parsed, { takeoverActive: false })
    ).rejects.toMatchObject({
      code: 'hash_algorithm_mismatch',
      retryable: false
    })
    expect(adapter.sent).toHaveLength(0)
    expect(await readFile(path, 'utf8')).toBe(bytesBefore)
  })

  it('every persisted state fails closed on an unknown version without mutating the record', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:states` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    const journal = new FileChannelEffectJournal({ directory })

    for (const state of [
      'PENDING',
      'SENDING',
      'CONFIRMED',
      'FAILED',
      'UNCERTAIN'
    ]) {
      await writeFile(
        path,
        JSON.stringify(
          seedRecord(identity, {
            state,
            hashVersion: UNKNOWN,
            leaseExpiresAtMs: 1
          })
        ),
        'utf8'
      )
      const bytesBefore = await readFile(path, 'utf8')
      const outcome = await journal.reserve({
        identity,
        payloadHash: hashOutboundPayload(parsed),
        hashVersion: SHARED,
        leaseOwner: 'new-owner',
        leaseMs: 1_000
      })
      expect(outcome.outcome, state).toBe('version_mismatch')
      expect(await readFile(path, 'utf8'), state).toBe(bytesBefore)
    }
  })

  it('rejects an unknown requested version without creating a record', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:unknown-in` })
    const identity = identityOf(parsed)
    const outcome = await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: UNKNOWN,
      leaseOwner: 'owner',
      leaseMs: 1_000
    })
    expect(outcome.outcome).toBe('version_mismatch')
    expect(await journal.find(identity)).toBeUndefined()
  })

  it('legacy records remain usable under the legacy version', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:legacy-ok` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)
    await writeFile(
      path,
      JSON.stringify(
        seedRecord(identity, {
          state: 'PENDING',
          leaseExpiresAtMs: 1
        })
      ),
      'utf8'
    )
    const journal = new FileChannelEffectJournal({ directory })
    const outcome = await journal.reserve({
      identity,
      payloadHash: 'fixture-hash',
      hashVersion: LEGACY,
      leaseOwner: 'legacy-owner',
      leaseMs: 1_000
    })
    expect(outcome.outcome).toBe('reserved')
    if (outcome.outcome !== 'reserved') {
      throw new Error('expected reserved outcome')
    }
    expect(outcome.record.hashVersion).toBe(LEGACY)
  })
})
