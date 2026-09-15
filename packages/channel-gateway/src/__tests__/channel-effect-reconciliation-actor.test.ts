import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileChannelEffectJournal } from '../effect-journal-file.ts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  SHARED_HASH_VERSION,
  channelEffectKey,
  type ChannelEffectIdentity,
  type ChannelEffectJournal
} from '../effect-journal.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-0000000000a1'
const PAYLOAD_HASH = 'a'.repeat(64)

const VALID_ACTOR = {
  actorId: 'operator:reconcile-agent',
  reason: 'provider receipt consulted'
}

const INVALID_ACTORS: Array<[label: string, actor: unknown]> = [
  ['missing actor', undefined],
  ['missing actorId', { reason: 'checked' }],
  ['empty actorId', { actorId: '', reason: 'checked' }],
  ['blank actorId', { actorId: '   ', reason: 'checked' }],
  ['missing reason', { actorId: 'operator:reconcile-agent' }],
  ['empty reason', { actorId: 'operator:reconcile-agent', reason: '' }],
  ['blank reason', { actorId: 'operator:reconcile-agent', reason: '\t\n' }]
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
  const directory = await mkdtemp(join(tmpdir(), 'cvg-channel-actor-'))
  directories.push(directory)
  return directory
}

function identityOf(idempotencyKey: string): ChannelEffectIdentity {
  return {
    tenantId: TENANT,
    channel: 'whatsapp',
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey
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

async function reserveUncertain(
  journal: ChannelEffectJournal,
  identity: ChannelEffectIdentity
): Promise<void> {
  const outcome = await journal.reserve({
    identity,
    payloadHash: PAYLOAD_HASH,
    hashVersion: SHARED_HASH_VERSION,
    leaseOwner: 'owner-a',
    leaseMs: 10_000
  })
  expect(outcome.outcome).toBe('reserved')
  await journal.claimSend(identity, 'owner-a')
  await expect(
    journal.markUncertain(identity, 'owner-a', 'send_failed')
  ).resolves.toBe('committed')
}

describe('in-memory journal reconciliation actor', () => {
  it('rejects every invalid actor with reconciliation_required and zero mutation', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf('mem-actor-invalid')
    await reserveUncertain(journal, identity)
    const before = await journal.find(identity)
    expect(before?.state).toBe('UNCERTAIN')

    for (const [label, actor] of INVALID_ACTORS) {
      await expect(
        journal.resolveUncertain(
          identity,
          { kind: 'not_effected' },
          actor as never
        ),
        label
      ).rejects.toMatchObject({
        code: 'reconciliation_required',
        retryable: false
      })
    }

    const after = await journal.find(identity)
    expect(after?.state).toBe('UNCERTAIN')
    expect(after?.revision).toBe(before?.revision)
    expect(after?.result).toBeNull()
    expect(after?.errorCode).toBe('send_failed')
  })

  it('applies a valid actor resolution exactly once and never reopens terminals', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf('mem-actor-confirmed')
    await reserveUncertain(journal, identity)

    const result = {
      externalId: 'reconciled-mem',
      channel: 'whatsapp',
      accepted: true,
      sentAt: '2026-09-12T12:00:00.000Z'
    } as const
    const resolved = await journal.resolveUncertain(
      identity,
      { kind: 'confirmed', result },
      VALID_ACTOR
    )
    expect(resolved.state).toBe('CONFIRMED')
    expect(resolved.result?.externalId).toBe('reconciled-mem')
    const revision = resolved.revision

    await expect(
      journal.resolveUncertain(
        identity,
        { kind: 'not_effected' },
        { actorId: 'operator:other', reason: 'second attempt' }
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })

    const after = await journal.find(identity)
    expect(after?.state).toBe('CONFIRMED')
    expect(after?.revision).toBe(revision)
    expect(after?.result?.externalId).toBe('reconciled-mem')
  })

  it('reopens not_effected exactly once and rejects a repeated resolution', async () => {
    const journal = new InMemoryChannelEffectJournal()
    const identity = identityOf('mem-actor-reopen')
    await reserveUncertain(journal, identity)

    const reopened = await journal.resolveUncertain(
      identity,
      { kind: 'not_effected' },
      VALID_ACTOR
    )
    expect(reopened.state).toBe('PENDING')
    expect(reopened.errorCode).toBeNull()
    const revision = reopened.revision

    await expect(
      journal.resolveUncertain(identity, { kind: 'not_effected' }, VALID_ACTOR)
    ).rejects.toMatchObject({ code: 'reconciliation_required' })

    const after = await journal.find(identity)
    expect(after?.state).toBe('PENDING')
    expect(after?.revision).toBe(revision)
  })
})

describe('file journal reconciliation actor', () => {
  it('rejects every invalid actor without rewriting the UNCERTAIN record', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const identity = identityOf('file-actor-invalid')
    await reserveUncertain(journal, identity)
    const path = recordPath(directory, identity)
    const before = await readFile(path, 'utf8')

    for (const [label, actor] of INVALID_ACTORS) {
      await expect(
        journal.resolveUncertain(
          identity,
          { kind: 'not_effected' },
          actor as never
        ),
        label
      ).rejects.toMatchObject({
        code: 'reconciliation_required',
        retryable: false
      })
    }

    expect(await readFile(path, 'utf8')).toBe(before)
    expect((JSON.parse(before) as { state: string }).state).toBe('UNCERTAIN')
  })

  it('applies a valid actor resolution exactly once and never rewrites terminals', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const identity = identityOf('file-actor-confirmed')
    await reserveUncertain(journal, identity)
    const path = recordPath(directory, identity)

    const resolved = await journal.resolveUncertain(
      identity,
      {
        kind: 'confirmed',
        result: {
          externalId: 'reconciled-file',
          channel: 'whatsapp',
          accepted: true,
          sentAt: '2026-09-12T12:00:00.000Z'
        }
      },
      VALID_ACTOR
    )
    expect(resolved.state).toBe('CONFIRMED')
    const bytes = await readFile(path, 'utf8')

    await expect(
      journal.resolveUncertain(
        identity,
        { kind: 'not_effected' },
        { actorId: 'operator:other', reason: 'second attempt' }
      )
    ).rejects.toMatchObject({ code: 'reconciliation_required' })

    expect(await readFile(path, 'utf8')).toBe(bytes)
    expect((JSON.parse(bytes) as { state: string }).state).toBe('CONFIRMED')
  })

  it('reopens not_effected with a valid actor exactly once', async () => {
    const directory = await temporaryDirectory()
    const journal = new FileChannelEffectJournal({ directory })
    const identity = identityOf('file-actor-reopen')
    await reserveUncertain(journal, identity)

    const reopened = await journal.resolveUncertain(
      identity,
      { kind: 'not_effected' },
      VALID_ACTOR
    )
    expect(reopened.state).toBe('PENDING')
    const revision = reopened.revision

    await expect(
      journal.resolveUncertain(identity, { kind: 'not_effected' }, VALID_ACTOR)
    ).rejects.toMatchObject({ code: 'reconciliation_required' })

    const after = await journal.find(identity)
    expect(after?.state).toBe('PENDING')
    expect(after?.revision).toBe(revision)
  })
})
