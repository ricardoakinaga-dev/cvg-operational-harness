import { createHash } from 'node:crypto'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalizeJson } from '@cvg/shared'
import {
  CanonicalOutboundMessageSchema,
  type CanonicalOutboundMessage,
  type CanonicalOutboundMessageInput,
  type OutboundResult
} from '../contracts.ts'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  LEGACY_HASH_VERSION,
  SHARED_HASH_VERSION,
  canonicalizePayload,
  channelEffectKey,
  hashOutboundPayload,
  InMemoryChannelEffectJournal,
  type ChannelEffectIdentity
} from '../effect-journal.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000102'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000102'

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
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-journal-'))
  directories.push(directory)
  return directory
}

function message(overrides: Partial<CanonicalOutboundMessageInput> = {}) {
  return CanonicalOutboundMessageSchema.parse({
    messageId: 'msg_journal_cov',
    tenantId: TENANT,
    conversationId: 'conv_journal_cov',
    channel: 'whatsapp',
    recipient: { id: '5511999999999', type: 'phone' },
    body: { text: 'journal coverage', attachments: [] },
    correlationId: CORRELATION,
    idempotencyKey: `${TENANT}:whatsapp:journal-cov`,
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

const RECONCILIATION_ACTOR = {
  actorId: 'operator:test-reconciler',
  reason: 'synthetic reconciliation'
}

async function reserveAndClaim(
  journal: InMemoryChannelEffectJournal | FileChannelEffectJournal,
  parsed: CanonicalOutboundMessage,
  leaseOwner = 'owner-a',
  leaseMs = 10_000
): Promise<ChannelEffectIdentity> {
  const identity = identityOf(parsed)
  const outcome = await journal.reserve({
    identity,
    payloadHash: hashOutboundPayload(parsed),
    hashVersion: SHARED_HASH_VERSION,
    leaseOwner,
    leaseMs
  })
  expect(outcome.outcome).toBe('reserved')
  await journal.claimSend(identity, leaseOwner)
  return identity
}

describe('canonicalizePayload compatibility wrapper', () => {
  it('delegates to the shared canonical JSON implementation', () => {
    const value = { 2: 'two', 10: 'ten', nested: { b: 1, a: 2 } }
    expect(canonicalizePayload(value)).toBe(canonicalizeJson(value))
  })
})

describe('in-memory journal hardening', () => {
  it('covers renew, release and the terminal guard', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-renew` })
    const journal = new InMemoryChannelEffectJournal()
    const identity = await reserveAndClaim(journal, parsed)

    await expect(journal.renew(identity, 'other-owner', 1_000)).resolves.toBe(
      false
    )
    await expect(journal.renew(identity, 'owner-a', 1_000)).resolves.toBe(true)

    await expect(
      journal.complete(identity, 'other-owner', resultOf('stale'))
    ).resolves.toBe('lease_lost')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('winner'))
    ).resolves.toBe('committed')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('winner'))
    ).resolves.toBe('lease_lost')
    await expect(
      journal.release(identity, 'owner-a', 'send_failed')
    ).resolves.toBe('lease_lost')
    await expect(
      journal.fail(identity, 'owner-a', 'send_failed')
    ).resolves.toBe('lease_lost')
    await expect(
      journal.markUncertain(identity, 'owner-a', 'send_failed')
    ).resolves.toBe('lease_lost')
  })

  it('renews only an active owned lease and releases for retry', async () => {
    let now = 1_000
    const clock = () => now
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-release` })
    const journal = new InMemoryChannelEffectJournal({ clock })
    const identity = await reserveAndClaim(journal, parsed, 'owner-a', 10)

    now += 11
    await expect(journal.renew(identity, 'owner-a', 10)).resolves.toBe(false)
    await expect(journal.claimSend(identity, 'owner-a')).rejects.toMatchObject({
      code: 'lease_lost'
    })
    await expect(
      journal.release(identity, 'owner-a', 'send_failed')
    ).resolves.toBe('committed')
    expect((await journal.find(identity))?.state).toBe('PENDING')
  })

  it('fails, marks uncertain and reconciles explicitly', async () => {
    const failed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-fail` })
    const journal = new InMemoryChannelEffectJournal()
    const failedIdentity = await reserveAndClaim(journal, failed)
    await expect(
      journal.fail(failedIdentity, 'owner-a', 'provider_rejected')
    ).resolves.toBe('committed')
    expect((await journal.find(failedIdentity))?.state).toBe('FAILED')
    await expect(
      journal.resolveUncertain(
        failedIdentity,
        { kind: 'not_effected' },
        RECONCILIATION_ACTOR
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })

    const uncertain = message({ idempotencyKey: `${TENANT}:whatsapp:mem-unc` })
    const uncertainIdentity = await reserveAndClaim(journal, uncertain)
    await expect(
      journal.markUncertain(uncertainIdentity, 'owner-a', 'send_failed')
    ).resolves.toBe('committed')
    const resolved = await journal.resolveUncertain(
      uncertainIdentity,
      {
        kind: 'confirmed',
        result: resultOf('reconciled')
      },
      RECONCILIATION_ACTOR
    )
    expect(resolved.state).toBe('CONFIRMED')
    expect(resolved.result?.externalId).toBe('reconciled')

    const reopen = message({ idempotencyKey: `${TENANT}:whatsapp:mem-reopen` })
    const reopenIdentity = await reserveAndClaim(journal, reopen)
    await journal.markUncertain(reopenIdentity, 'owner-a', 'send_failed')
    const reopened = await journal.resolveUncertain(
      reopenIdentity,
      {
        kind: 'not_effected'
      },
      RECONCILIATION_ACTOR
    )
    expect(reopened.state).toBe('PENDING')
    await expect(
      journal.resolveUncertain(
        reopenIdentity,
        { kind: 'not_effected' },
        RECONCILIATION_ACTOR
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })
  })

  it('refuses completion outside SENDING and waits for terminals', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-wait` })
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf(parsed)
    await expect(journal.claimSend(identity, 'owner-a')).rejects.toMatchObject({
      code: 'lease_lost'
    })
    await expect(journal.find(identity)).resolves.toBeUndefined()

    const outcome = await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    expect(outcome.outcome).toBe('reserved')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('too-early'))
    ).rejects.toMatchObject({ code: 'lease_lost' })
    await expect(journal.waitForTerminal(identity, 20)).resolves.toBeUndefined()

    await journal.claimSend(identity, 'owner-a')
    await expect(
      journal.complete(identity, 'owner-a', resultOf('done'))
    ).resolves.toBe('committed')
    const terminal = await journal.waitForTerminal(identity, 20)
    expect(terminal?.state).toBe('CONFIRMED')
  })

  it('reports conflicts, uncertain reserves and in-flight leases', async () => {
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:mem-states` })
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf(parsed)
    const base = {
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    }
    expect((await journal.reserve(base)).outcome).toBe('reserved')
    expect(
      (
        await journal.reserve({
          ...base,
          payloadHash: 'different-hash',
          leaseOwner: 'owner-b'
        })
      ).outcome
    ).toBe('conflict')
    expect(
      (await journal.reserve({ ...base, leaseOwner: 'owner-b' })).outcome
    ).toBe('in_flight')

    await journal.markUncertain(identity, 'owner-a', 'send_failed')
    expect(
      (await journal.reserve({ ...base, leaseOwner: 'owner-b' })).outcome
    ).toBe('uncertain')
  })
})

describe('file journal hardening', () => {
  it('fails, releases, marks uncertain and never rewrites an UNCERTAIN reserve', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })

    const failed = message({ idempotencyKey: `${TENANT}:whatsapp:file-fail` })
    const failedIdentity = await reserveAndClaim(journal, failed)
    await expect(
      journal.fail(failedIdentity, 'owner-a', 'provider_rejected')
    ).resolves.toBe('committed')
    expect((await journal.find(failedIdentity))?.state).toBe('FAILED')

    const released = message({
      idempotencyKey: `${TENANT}:whatsapp:file-release`
    })
    const releasedIdentity = await reserveAndClaim(journal, released)
    await expect(
      journal.release(releasedIdentity, 'owner-a', 'send_failed')
    ).resolves.toBe('committed')
    expect((await journal.find(releasedIdentity))?.state).toBe('PENDING')

    const uncertain = message({
      idempotencyKey: `${TENANT}:whatsapp:file-uncertain`
    })
    const uncertainIdentity = await reserveAndClaim(journal, uncertain)
    await expect(
      journal.markUncertain(uncertainIdentity, 'owner-a', 'send_failed')
    ).resolves.toBe('committed')
    const bytes = await readFile(
      recordPath(directory, uncertainIdentity),
      'utf8'
    )
    const outcome = await journal.reserve({
      identity: uncertainIdentity,
      payloadHash: hashOutboundPayload(uncertain),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-b',
      leaseMs: 10_000
    })
    expect(outcome.outcome).toBe('uncertain')
    expect(
      await readFile(recordPath(directory, uncertainIdentity), 'utf8')
    ).toBe(bytes)
  })

  it('waits for terminal records and times out otherwise', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory, pollMs: 2 })
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-wait` })
    const identity = await reserveAndClaim(journal, parsed)
    await expect(journal.waitForTerminal(identity, 20)).resolves.toBeUndefined()
    await expect(
      journal.complete(identity, 'owner-a', resultOf('done'))
    ).resolves.toBe('committed')
    expect((await journal.waitForTerminal(identity, 20))?.state).toBe(
      'CONFIRMED'
    )
  })

  it('fails closed on unreadable records and unwritable storage', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-io` })
    const identity = identityOf(parsed)
    const path = recordPath(directory, identity)

    await mkdir(path, { recursive: true })
    const unreadable = new FileChannelEffectJournal({ directory })
    await expect(unreadable.find(identity)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
    await rm(path, { recursive: true, force: true })

    const writable = new FileChannelEffectJournal({ directory })
    await writable.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    await writable.claimSend(identity, 'owner-a')
    await writable.release(identity, 'owner-a', 'send_failed')

    await chmod(directory, 0o555)
    const readOnly = new FileChannelEffectJournal({ directory })
    await expect(readOnly.claimSend(identity, 'owner-a')).rejects.toMatchObject(
      {
        code: 'journal_unavailable'
      }
    )
    await chmod(directory, 0o755)
  })

  it('fails closed when the temporary write path is blocked', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-temp` })
    const identity = identityOf(parsed)
    const journal = new FileChannelEffectJournal({ directory })
    await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    await mkdir(`${recordPath(directory, identity)}.${process.pid}.0.tmp`)
    await expect(journal.claimSend(identity, 'owner-a')).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
  })

  it('steals a stale lock and succeeds', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-lock` })
    const identity = identityOf(parsed)
    await mkdir(directory, { recursive: true })
    const lockPath = `${recordPath(directory, identity)}.lock`
    await writeFile(lockPath, 'stale-owner', 'utf8')
    const past = new Date(Date.now() - 60_000)
    await utimes(lockPath, past, past)

    const journal = new FileChannelEffectJournal({
      directory,
      staleLockMs: 50,
      lockTimeoutMs: 2_000,
      pollMs: 2
    })
    const outcome = await journal.reserve({
      identity,
      payloadHash: hashOutboundPayload(parsed),
      hashVersion: SHARED_HASH_VERSION,
      leaseOwner: 'owner-a',
      leaseMs: 10_000
    })
    expect(outcome.outcome).toBe('reserved')
  })

  it('accepts explicit legacy version and rejects unknown input', async () => {
    const directory = await temporaryDirectory()
    const parsed = message({ idempotencyKey: `${TENANT}:whatsapp:file-input` })
    const identity = identityOf(parsed)
    const journal = new FileChannelEffectJournal({ directory })
    expect(
      (
        await journal.reserve({
          identity,
          payloadHash: hashOutboundPayload(parsed),
          hashVersion: LEGACY_HASH_VERSION,
          leaseOwner: 'owner-a',
          leaseMs: 10_000
        })
      ).outcome
    ).toBe('reserved')
    expect(
      (
        await journal.reserve({
          identity,
          payloadHash: hashOutboundPayload(parsed),
          hashVersion: 'unknown-algorithm-v9',
          leaseOwner: 'owner-b',
          leaseMs: 10_000
        })
      ).outcome
    ).toBe('version_mismatch')
  })
})
