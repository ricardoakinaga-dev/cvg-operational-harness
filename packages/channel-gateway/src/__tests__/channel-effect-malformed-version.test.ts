import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
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
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  LEGACY_HASH_VERSION,
  SHARED_HASH_VERSION,
  channelEffectKey,
  decideReserve,
  hashOutboundPayload,
  type ChannelEffectIdentity,
  type ChannelEffectRecord,
  type ChannelEffectReserveInput
} from '../effect-journal.ts'
import { ChannelGateway } from '../gateway.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000e1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000000e1'
const ABSENT = Symbol('absent')

const STATES = [
  'PENDING',
  'SENDING',
  'CONFIRMED',
  'FAILED',
  'UNCERTAIN',
  'EXPIRED'
] as const

const INVALID_VERSIONS: Array<[label: string, value: unknown]> = [
  ['unknown string', 'unknown-algorithm-v9'],
  ['null', null],
  ['number', 7],
  ['boolean', false],
  ['object', { v: 1 }],
  ['array', []],
  ['empty string', ''],
  ['whitespace', '   '],
  ['zero', 0]
]

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-c4-'))
  directories.push(directory)
  return directory
}

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_c4_1',
    tenantId: TENANT,
    conversationId: 'conv_c4',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'malformed version', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:c4-1`,
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

function buildRecord(
  identity: ChannelEffectIdentity,
  rawVersion: unknown,
  overrides: Record<string, unknown>
): Record<string, unknown> {
  const record: Record<string, unknown> = {
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
  if (rawVersion !== ABSENT) record.hashVersion = rawVersion
  return record
}

async function seed(
  directory: string,
  identity: ChannelEffectIdentity,
  rawVersion: unknown,
  overrides: Record<string, unknown>
): Promise<{ path: string; json: string }> {
  const path = recordPath(directory, identity)
  const json = JSON.stringify(buildRecord(identity, rawVersion, overrides))
  await writeFile(path, json, 'utf8')
  return { path, json }
}

function input(
  identity: ChannelEffectIdentity,
  hashVersion: string,
  payloadHash = 'fixture-hash'
): ChannelEffectReserveInput {
  return {
    identity,
    payloadHash,
    hashVersion,
    leaseOwner: 'c4-owner',
    leaseMs: 10_000
  }
}

function expectedActionFor(state: string): string {
  if (state === 'SENDING' || state === 'UNCERTAIN') return 'uncertain'
  if (state === 'CONFIRMED' || state === 'FAILED') return 'replay'
  return 'takeover'
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

describe('AAA12-C4-F01 missing vs malformed hashVersion', () => {
  it('decideReserve treats only the absent property as legacy', () => {
    const identity = identityOf(message())
    for (const state of STATES) {
      const base = { state, leaseExpiresAtMs: 1, payloadHash: 'fixture-hash' }
      const absent = buildRecord(
        identity,
        ABSENT,
        base
      ) as unknown as ChannelEffectRecord
      expect(
        decideReserve(absent, input(identity, LEGACY_HASH_VERSION), 10).action,
        `${state} absent/legacy`
      ).toBe(expectedActionFor(state))
      expect(
        decideReserve(absent, input(identity, SHARED_HASH_VERSION), 10).action,
        `${state} absent/shared`
      ).toBe('version_mismatch')

      const legacy = buildRecord(
        identity,
        LEGACY_HASH_VERSION,
        base
      ) as unknown as ChannelEffectRecord
      expect(
        decideReserve(legacy, input(identity, LEGACY_HASH_VERSION), 10).action
      ).toBe(expectedActionFor(state))
      expect(
        decideReserve(legacy, input(identity, SHARED_HASH_VERSION), 10).action
      ).toBe('version_mismatch')

      const shared = buildRecord(
        identity,
        SHARED_HASH_VERSION,
        base
      ) as unknown as ChannelEffectRecord
      expect(
        decideReserve(shared, input(identity, SHARED_HASH_VERSION), 10).action
      ).toBe(expectedActionFor(state))
      expect(
        decideReserve(shared, input(identity, LEGACY_HASH_VERSION), 10).action
      ).toBe('version_mismatch')

      for (const [label, value] of INVALID_VERSIONS) {
        const invalid = buildRecord(
          identity,
          value,
          base
        ) as unknown as ChannelEffectRecord
        expect(
          decideReserve(invalid, input(identity, LEGACY_HASH_VERSION), 10)
            .action,
          `${state} ${label}/legacy`
        ).toBe('version_mismatch')
        expect(
          decideReserve(invalid, input(identity, SHARED_HASH_VERSION), 10)
            .action,
          `${state} ${label}/shared`
        ).toBe('version_mismatch')
      }
    }
  })

  it('file adapter rejects malformed persisted versions without mutating bytes', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:c4-file` })
    const identity = identityOf(parsed)
    const payloadHash = hashOutboundPayload(parsed)
    const journal = new FileChannelEffectJournal({ directory })

    for (const [label, value] of INVALID_VERSIONS) {
      for (const state of STATES) {
        const seeded = await seed(directory, identity, value, {
          state,
          payloadHash,
          leaseOwner: 'c4-owner',
          leaseExpiresAtMs: 1
        })
        for (const caller of [LEGACY_HASH_VERSION, SHARED_HASH_VERSION]) {
          const outcome = await journal.reserve({
            identity,
            payloadHash,
            hashVersion: caller,
            leaseOwner: 'c4-owner',
            leaseMs: 10_000
          })
          expect(outcome.outcome, `${label}/${state}/${caller}`).toBe(
            'version_mismatch'
          )
        }
        await expect(
          journal.claimSend(identity, 'c4-owner'),
          `${label}/${state}/claimSend`
        ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
        expect(await readFile(seeded.path, 'utf8'), `${label}/${state}`).toBe(
          seeded.json
        )
      }
    }
  })

  it('all mutating methods fail closed on a malformed version without mutation', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:c4-mutate` })
    const identity = identityOf(parsed)
    const seeded = await seed(directory, identity, null, {
      state: 'SENDING',
      payloadHash: hashOutboundPayload(parsed),
      leaseOwner: 'c4-owner',
      leaseExpiresAtMs: Number.MAX_SAFE_INTEGER
    })
    const journal = new FileChannelEffectJournal({ directory })
    const found = await journal.find(identity)
    expect(
      (found as unknown as { hashVersion: unknown } | undefined)?.hashVersion
    ).toBeNull()

    const result: OutboundResult = {
      externalId: 'x',
      channel: 'whatsapp',
      accepted: true,
      sentAt: '2026-09-12T12:00:00.000Z'
    }
    await expect(journal.claimSend(identity, 'c4-owner')).rejects.toMatchObject(
      {
        code: 'hash_algorithm_mismatch'
      }
    )
    await expect(
      journal.renew(identity, 'c4-owner', 1_000)
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(
      journal.complete(identity, 'c4-owner', result)
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(
      journal.fail(identity, 'c4-owner', 'send_failed')
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(
      journal.release(identity, 'c4-owner', 'send_failed')
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(
      journal.markUncertain(identity, 'c4-owner', 'send_failed')
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(
      journal.resolveUncertain(
        identity,
        { kind: 'not_effected' },
        {
          actorId: 'operator:test-reconciler',
          reason: 'synthetic reconciliation'
        }
      )
    ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
    await expect(journal.waitForTerminal(identity, 20)).rejects.toMatchObject({
      code: 'hash_algorithm_mismatch'
    })
    expect(await readFile(seeded.path, 'utf8')).toBe(seeded.json)
  })

  it('absent and explicit valid versions preserve the supported happy paths', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:c4-valid` })
    const identity = identityOf(parsed)
    const payloadHash = hashOutboundPayload(parsed)
    const journal = new FileChannelEffectJournal({ directory })

    const absent = await seed(directory, identity, ABSENT, {
      state: 'PENDING',
      payloadHash,
      leaseExpiresAtMs: 1
    })
    const sharedAttempt = await journal.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(sharedAttempt.outcome).toBe('version_mismatch')
    expect(await readFile(absent.path, 'utf8')).toBe(absent.json)

    const legacyAttempt = await journal.reserve({
      identity,
      payloadHash,
      hashVersion: LEGACY_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(legacyAttempt.outcome).toBe('reserved')
    expect((await journal.find(identity))?.hashVersion).toBe(
      LEGACY_HASH_VERSION
    )
    expect((await journal.claimSend(identity, 'c4-owner')).state).toBe(
      'SENDING'
    )

    const explicitLegacy = await seed(
      directory,
      identity,
      LEGACY_HASH_VERSION,
      {
        state: 'PENDING',
        payloadHash,
        leaseExpiresAtMs: 1
      }
    )
    const explicitLegacyReserve = await journal.reserve({
      identity,
      payloadHash,
      hashVersion: LEGACY_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(explicitLegacyReserve.outcome).toBe('reserved')
    void explicitLegacy

    const explicitShared = await seed(
      directory,
      identity,
      SHARED_HASH_VERSION,
      {
        state: 'PENDING',
        payloadHash,
        leaseExpiresAtMs: 1
      }
    )
    const explicitSharedReserve = await journal.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(explicitSharedReserve.outcome).toBe('reserved')
    void explicitShared
  })

  it('memory and file agree on invalid input and valid version transitions', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:c4-parity` })
    const identity = identityOf(parsed)
    const payloadHash = hashOutboundPayload(parsed)
    const memory = new InMemoryChannelEffectJournal()
    const file = new FileChannelEffectJournal({ directory })

    for (const [, value] of INVALID_VERSIONS) {
      const memoryOutcome = await memory.reserve({
        identity,
        payloadHash,
        hashVersion: value as string,
        leaseOwner: 'c4-owner',
        leaseMs: 10_000
      })
      expect(memoryOutcome.outcome).toBe('version_mismatch')
      expect(await memory.find(identity)).toBeUndefined()

      const fileOutcome = await file.reserve({
        identity,
        payloadHash,
        hashVersion: value as string,
        leaseOwner: 'c4-owner',
        leaseMs: 10_000
      })
      expect(fileOutcome.outcome).toBe('version_mismatch')
      await expect(stat(recordPath(directory, identity))).rejects.toMatchObject(
        {
          code: 'ENOENT'
        }
      )
    }

    const memoryLegacy = await memory.reserve({
      identity,
      payloadHash,
      hashVersion: LEGACY_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(memoryLegacy.outcome).toBe('reserved')
    expect((await memory.find(identity))?.hashVersion).toBe(LEGACY_HASH_VERSION)
    const memoryShared = await memory.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(memoryShared.outcome).toBe('version_mismatch')

    const fileLegacy = await file.reserve({
      identity,
      payloadHash,
      hashVersion: LEGACY_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(fileLegacy.outcome).toBe('reserved')
    const fileShared = await file.reserve({
      identity,
      payloadHash,
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'c4-owner',
      leaseMs: 10_000
    })
    expect(fileShared.outcome).toBe('version_mismatch')
  })

  it('gateway produces zero sends for every state with a malformed version', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:c4-gateway` })
    const identity = identityOf(parsed)
    const payloadHash = hashOutboundPayload(parsed)

    for (const [, value] of INVALID_VERSIONS) {
      for (const state of STATES) {
        const seeded = await seed(directory, identity, value, {
          state,
          payloadHash,
          leaseOwner: 'c4-owner',
          leaseExpiresAtMs: 1
        })
        const adapter = new CountingAdapter()
        const gateway = new ChannelGateway({
          outboundAdapters: [adapter],
          effectJournal: new FileChannelEffectJournal({ directory })
        })
        await expect(
          gateway.dispatch(parsed, { takeoverActive: false })
        ).rejects.toMatchObject({ code: 'hash_algorithm_mismatch' })
        expect(adapter.sent, `${state}`).toHaveLength(0)
        expect(await readFile(seeded.path, 'utf8')).toBe(seeded.json)
      }
    }
  })
})
