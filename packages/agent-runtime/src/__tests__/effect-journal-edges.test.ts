import { createHash } from 'node:crypto'
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { chmodSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FileEffectJournal,
  InMemoryEffectJournal,
  cloneEffectRecord,
  effectJournalKey,
  isTerminalEffectState,
  type EffectRecord
} from '../effect-journal.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000031'
const operationKey = 'op:edge-journal-1'
const proposalHash = 'a'.repeat(64)

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

function reserveInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: tenant,
    operationKey,
    proposalHash,
    attemptId: 'attempt-1',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides
  }
}

function attemptRef(attemptId = 'attempt-1') {
  return { tenantId: tenant, operationKey, attemptId }
}

function recordPath(directory: string, key = operationKey): string {
  const digest = createHash('sha256')
    .update(effectJournalKey(tenant, key))
    .digest('hex')
  return join(directory, `${digest}.json`)
}

function effectRecord(overrides: Partial<EffectRecord> = {}): EffectRecord {
  return {
    tenantId: tenant,
    operationKey,
    proposalHash,
    attemptId: 'attempt-1',
    state: 'RESERVED',
    executionRef: null,
    resultDigest: null,
    errorCode: null,
    reason: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    reconciledBy: null,
    reconciliationEvidenceRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revision: 1,
    ...overrides
  }
}

describe('effect journal validators', () => {
  it('rejects every malformed reserve input with invalid_input', async () => {
    const journal = new InMemoryEffectJournal()

    await expect(
      journal.reserve(reserveInput({ tenantId: ' ' }))
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      journal.reserve(reserveInput({ operationKey: '' }))
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      journal.reserve(reserveInput({ proposalHash: '   ' }))
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      journal.reserve(reserveInput({ attemptId: '' }))
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      journal.reserve(reserveInput({ expiresAt: 'not-a-date' }))
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('rejects an invalid sweep window with invalid_input', async () => {
    const journal = new InMemoryEffectJournal()

    await expect(
      journal.releaseExpired(new Date('invalid'), 1)
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(journal.releaseExpired(new Date(), -1)).rejects.toMatchObject({
      code: 'invalid_input'
    })
    await expect(journal.releaseExpired(new Date(), 1.5)).rejects.toMatchObject(
      { code: 'invalid_input' }
    )
  })

  it('exposes terminal state detection and tenancy-scoped keys', () => {
    expect(isTerminalEffectState('CONFIRMED')).toBe(true)
    expect(isTerminalEffectState('EFFECT_FAILED')).toBe(true)
    expect(isTerminalEffectState('ABANDONED')).toBe(false)
    expect(isTerminalEffectState('RESERVED')).toBe(false)
    expect(effectJournalKey('tenant-a', 'op-1')).toBe('tenant-a\u0000op-1')
  })

  it('clones records defensively', () => {
    const record = effectRecord()
    const clone = cloneEffectRecord(record)
    expect(clone).toEqual(record)
    clone.state = 'CONFIRMED'
    expect(record.state).toBe('RESERVED')
  })
})

describe('effect journal transition immutability', () => {
  it('requires a matching attempt for every transition', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve(reserveInput())

    await expect(
      journal.confirmEffect({
        ...attemptRef('other'),
        executionRef: 'ref-1',
        resultDigest: 'b'.repeat(64)
      })
    ).rejects.toMatchObject({ code: 'attempt_mismatch' })
    await expect(
      journal.failEffect({ ...attemptRef('other'), errorCode: 'x' })
    ).rejects.toMatchObject({ code: 'attempt_mismatch' })
    await expect(
      journal.markUncertain({ ...attemptRef('other'), reason: 'x' })
    ).rejects.toMatchObject({ code: 'attempt_mismatch' })
  })

  it('keeps EFFECT_FAILED immutable while accepting an identical repeat', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve(reserveInput())
    await journal.markEffectStarted(attemptRef())
    const failed = await journal.failEffect({
      ...attemptRef(),
      errorCode: 'tool_pre_effect_failure'
    })

    await expect(
      journal.failEffect({
        ...attemptRef(),
        errorCode: 'tool_pre_effect_failure'
      })
    ).resolves.toEqual(failed)
    await expect(
      journal.failEffect({ ...attemptRef(), errorCode: 'other_failure' })
    ).rejects.toMatchObject({ code: 'invalid_transition' })
    await expect(journal.markEffectStarted(attemptRef())).rejects.toMatchObject(
      { code: 'invalid_transition' }
    )
    await expect(
      journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'ref-1',
        resultDigest: 'b'.repeat(64)
      })
    ).rejects.toMatchObject({ code: 'invalid_transition' })
    await expect(
      journal.markUncertain({ ...attemptRef(), reason: 'x' })
    ).rejects.toMatchObject({ code: 'invalid_transition' })
  })

  it('treats repeated starts and repeated uncertainty as idempotent', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve(reserveInput())
    const started = await journal.markEffectStarted(attemptRef())
    const startedAgain = await journal.markEffectStarted(attemptRef())
    expect(startedAgain.revision).toBe(started.revision)
    expect(startedAgain.state).toBe('EFFECT_STARTED')

    const uncertain = await journal.markUncertain({
      ...attemptRef(),
      reason: 'ambiguous'
    })
    const uncertainAgain = await journal.markUncertain({
      ...attemptRef(),
      reason: 'ambiguous'
    })
    expect(uncertainAgain.revision).toBe(uncertain.revision)
    expect(uncertainAgain.state).toBe('UNCERTAIN')
  })

  it('refuses a repeated reconciliation and requires actor/evidence text', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve(reserveInput())
    await journal.markEffectStarted(attemptRef())
    await journal.markUncertain({ ...attemptRef(), reason: 'ambiguous' })

    await expect(
      journal.reconcile({
        tenantId: tenant,
        operationKey,
        actorId: ' ',
        outcome: 'no_effect',
        evidenceRef: 'evidence://synthetic'
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      journal.reconcile({
        tenantId: tenant,
        operationKey,
        actorId: 'operator-1',
        outcome: 'no_effect',
        evidenceRef: ''
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })

    await journal.reconcile({
      tenantId: tenant,
      operationKey,
      actorId: 'operator-1',
      outcome: 'no_effect',
      evidenceRef: 'evidence://synthetic/1'
    })
    await expect(
      journal.reconcile({
        tenantId: tenant,
        operationKey,
        actorId: 'operator-1',
        outcome: 'no_effect',
        evidenceRef: 'evidence://synthetic/2'
      })
    ).rejects.toMatchObject({ code: 'invalid_transition' })
  })

  it('keeps a re-armed record append-only in revision history', async () => {
    const journal = new InMemoryEffectJournal()
    await journal.reserve(reserveInput())
    await journal.markEffectStarted(attemptRef())
    const failed = await journal.failEffect({
      ...attemptRef(),
      errorCode: 'pre_effect'
    })
    await journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
    const rearmed = await journal.get(tenant, operationKey)
    expect(rearmed?.revision).toBe(failed.revision + 1)
    expect(rearmed?.attemptId).toBe('attempt-2')
  })
})

describe('FileEffectJournal adapter edge cases', () => {
  it('returns zero when sweeping a directory that does not exist', async () => {
    const missing = join(
      tmpdir(),
      `cvg-effect-journal-missing-${process.pid}-${Date.now()}`
    )
    const journal = new FileEffectJournal({ directory: missing })

    await expect(journal.releaseExpired(new Date(), 1_000)).resolves.toBe(0)
  })

  it('fails closed when the sweep directory is not a directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const filePath = join(directory, 'not-a-directory')
    await writeFile(filePath, 'synthetic')
    const journal = new FileEffectJournal({ directory: filePath })

    await expect(
      journal.releaseExpired(new Date(), 1_000)
    ).rejects.toMatchObject({ code: 'journal_unavailable' })
  })

  it('fails closed on corrupted JSON records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({ directory })
    await writeFileSync(recordPath(directory), '{ not json', 'utf8')

    await expect(journal.get(tenant, operationKey)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
  })

  it('fails closed on records missing required fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({ directory })
    await writeFileSync(
      recordPath(directory),
      JSON.stringify({ tenantId: tenant }),
      'utf8'
    )

    await expect(journal.get(tenant, operationKey)).rejects.toMatchObject({
      code: 'journal_unavailable'
    })
  })

  it('fails closed when a new record cannot be created', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({ directory })
    chmodSync(directory, 0o500)
    try {
      await expect(journal.reserve(reserveInput())).rejects.toMatchObject({
        code: 'journal_unavailable'
      })
    } finally {
      chmodSync(directory, 0o700)
    }
  })

  it('fails closed when the record cannot be persisted after a read', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    let armed = false
    let clockCalls = 0
    const journal = new FileEffectJournal({
      directory,
      clock: () => {
        if (armed) {
          clockCalls += 1
          if (clockCalls === 2)
            rmSync(directory, { recursive: true, force: true })
        }
        return new Date()
      }
    })
    await journal.reserve(reserveInput())
    armed = true

    await expect(journal.markEffectStarted(attemptRef())).rejects.toMatchObject(
      { code: 'journal_unavailable' }
    )
  })

  it('skips non-json entries and dangling json links during a sweep', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({ directory })
    writeFileSync(join(directory, 'notes.txt'), 'not a record', 'utf8')
    symlinkSync(
      join(directory, 'missing-target.json'),
      join(directory, 'ghost.json')
    )

    await expect(journal.releaseExpired(new Date(), 1_000)).resolves.toBe(0)
  })

  it('fails closed when the lock itself cannot be created', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({ directory })
    await journal.reserve(reserveInput())
    chmodSync(directory, 0o500)
    try {
      await expect(
        journal.markEffectStarted(attemptRef())
      ).rejects.toMatchObject({ code: 'journal_unavailable' })
    } finally {
      chmodSync(directory, 0o700)
    }
  })

  it('recovers from a stale lock left by a crashed writer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({
      directory,
      staleLockMs: 1,
      pollMs: 1
    })
    await journal.reserve(reserveInput())
    const lockPath = `${recordPath(directory)}.lock`
    await writeFile(lockPath, 'stale-owner', 'utf8')
    const old = new Date(Date.now() - 60_000)
    await utimes(lockPath, old, old)

    await expect(
      journal.markEffectStarted(attemptRef())
    ).resolves.toMatchObject({ state: 'EFFECT_STARTED' })
  })

  it('times out when the lock is held by a live writer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-edge-'))
    temporaryDirectories.push(directory)
    const journal = new FileEffectJournal({
      directory,
      lockTimeoutMs: 0,
      staleLockMs: 60_000,
      pollMs: 1
    })
    await journal.reserve(reserveInput())
    await writeFile(`${recordPath(directory)}.lock`, 'live-owner', 'utf8')

    await expect(journal.markEffectStarted(attemptRef())).rejects.toMatchObject(
      { code: 'journal_unavailable' }
    )
  })
})
