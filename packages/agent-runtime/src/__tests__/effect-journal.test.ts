import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FileEffectJournal,
  InMemoryEffectJournal,
  type EffectJournalPort
} from '../effect-journal.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000201'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000202'
const operationKey = 'op:fixture-effect-1'
const proposalHash = 'a'.repeat(64)
const resultDigest = 'b'.repeat(64)

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

type JournalFactory = () => Promise<EffectJournalPort> | EffectJournalPort

async function createFileJournal(): Promise<FileEffectJournal> {
  const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-'))
  temporaryDirectories.push(directory)
  return new FileEffectJournal({ directory })
}

function describeEffectJournal(
  name: string,
  createJournal: JournalFactory
): void {
  describe(name, () => {
    it('reserves once and keeps the same reservation for the same attempt', async () => {
      const journal = await createJournal()

      await expect(journal.reserve(reserveInput())).resolves.toEqual({
        outcome: 'reserved'
      })
      await expect(journal.reserve(reserveInput())).resolves.toEqual({
        outcome: 'reserved'
      })
      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        state: 'RESERVED',
        attemptId: 'attempt-1',
        proposalHash
      })
    })

    it('keeps the same operation key isolated per tenant', async () => {
      const journal = await createJournal()

      await journal.reserve(reserveInput())
      await expect(
        journal.reserve(reserveInput({ tenantId: otherTenant }))
      ).resolves.toEqual({ outcome: 'reserved' })
      await expect(
        journal.get(otherTenant, operationKey)
      ).resolves.toMatchObject({ tenantId: otherTenant, state: 'RESERVED' })
    })

    it('fails closed with idempotency_key_reuse for a different proposal hash', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())

      await expect(
        journal.reserve(reserveInput({ proposalHash: 'c'.repeat(64) }))
      ).rejects.toMatchObject({
        name: 'EffectJournalError',
        code: 'idempotency_key_reuse'
      })
      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        proposalHash,
        state: 'RESERVED',
        revision: 1
      })
    })

    it('reports in_progress while another attempt owns a live reservation', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())

      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'in_progress' })
    })

    it('requires a matching attemptId to start the effect', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())

      await expect(
        journal.markEffectStarted(attemptRef('attempt-2'))
      ).rejects.toMatchObject({ code: 'attempt_mismatch' })
      await expect(
        journal.markEffectStarted(attemptRef('missing-attempt'))
      ).rejects.toMatchObject({ code: 'attempt_mismatch' })
      await expect(
        journal.markEffectStarted(attemptRef())
      ).resolves.toMatchObject({
        state: 'EFFECT_STARTED',
        attemptId: 'attempt-1'
      })
    })

    it('requires the record to exist for transitions', async () => {
      const journal = await createJournal()

      await expect(
        journal.markEffectStarted(attemptRef())
      ).rejects.toMatchObject({ code: 'not_found' })
      await expect(
        journal.confirmEffect({
          ...attemptRef(),
          executionRef: 'ref-1',
          resultDigest
        })
      ).rejects.toMatchObject({ code: 'not_found' })
    })

    it('reports in_progress after the effect started', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())

      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'in_progress' })
    })

    it('confirms the effect with executionRef and resultDigest and replays it', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      const confirmed = await journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'execution-ref-1',
        resultDigest
      })

      expect(confirmed).toMatchObject({
        state: 'CONFIRMED',
        executionRef: 'execution-ref-1',
        resultDigest,
        attemptId: 'attempt-1'
      })
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'replay', record: confirmed })
    })

    it('keeps CONFIRMED immutable for every effect transition', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      const confirmed = await journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'execution-ref-1',
        resultDigest
      })

      await expect(
        journal.confirmEffect({
          ...attemptRef(),
          executionRef: 'execution-ref-2',
          resultDigest: 'd'.repeat(64)
        })
      ).rejects.toMatchObject({ code: 'invalid_transition' })
      await expect(
        journal.failEffect({ ...attemptRef(), errorCode: 'tool_failed' })
      ).rejects.toMatchObject({ code: 'invalid_transition' })
      await expect(
        journal.markUncertain({ ...attemptRef(), reason: 'timeout' })
      ).rejects.toMatchObject({ code: 'invalid_transition' })
      await expect(
        journal.markEffectStarted(attemptRef())
      ).rejects.toMatchObject({ code: 'invalid_transition' })
      await expect(journal.get(tenant, operationKey)).resolves.toEqual(
        confirmed
      )
    })

    it('treats a repeated confirm with identical evidence as idempotent', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      const confirmed = await journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'execution-ref-1',
        resultDigest
      })

      await expect(
        journal.confirmEffect({
          ...attemptRef(),
          executionRef: 'execution-ref-1',
          resultDigest
        })
      ).resolves.toEqual(confirmed)
    })

    it('fails the effect without a result and re-arms a retry for the same key', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      const failed = await journal.failEffect({
        ...attemptRef(),
        errorCode: 'tool_pre_effect_failure'
      })

      expect(failed).toMatchObject({
        state: 'EFFECT_FAILED',
        errorCode: 'tool_pre_effect_failure',
        executionRef: null,
        resultDigest: null
      })
      await expect(
        journal.confirmEffect({
          ...attemptRef(),
          executionRef: 'never',
          resultDigest
        })
      ).rejects.toMatchObject({ code: 'invalid_transition' })

      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'reserved' })
      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        state: 'RESERVED',
        attemptId: 'attempt-2',
        errorCode: null,
        revision: failed.revision + 1
      })
    })

    it('marks the effect uncertain and reports it on retry', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      const uncertain = await journal.markUncertain({
        ...attemptRef(),
        reason: 'provider timeout'
      })

      expect(uncertain).toMatchObject({
        state: 'UNCERTAIN',
        reason: 'provider timeout'
      })
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'uncertain', record: uncertain })
    })

    it('never executes effects while releasing expired reservations', async () => {
      const journal = await createJournal()
      await journal.reserve(
        reserveInput({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
      )

      await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(1)
      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        state: 'ABANDONED',
        executionRef: null,
        resultDigest: null
      })
      await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(0)
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toEqual({ outcome: 'reserved' })
    })

    it('marks an expired EFFECT_STARTED reservation UNCERTAIN instead of retrying', async () => {
      const journal = await createJournal()
      await journal.reserve(
        reserveInput({ expiresAt: new Date(Date.now() - 1_000).toISOString() })
      )
      await journal.markEffectStarted(attemptRef())

      await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(1)
      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        state: 'UNCERTAIN'
      })
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toMatchObject({ outcome: 'uncertain' })
    })

    it('leaves fresh and terminal records untouched during a sweep', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.reserve(
        reserveInput({
          operationKey: 'op:fixture-effect-2',
          attemptId: 'attempt-2',
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        })
      )
      await journal.markEffectStarted(attemptRef())
      await journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'execution-ref-1',
        resultDigest
      })

      await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(0)
    })

    it('reconciles UNCERTAIN explicitly with actor and evidence', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      await journal.markUncertain({
        ...attemptRef(),
        reason: 'provider timeout'
      })

      const reconciled = await journal.reconcile({
        tenantId: tenant,
        operationKey,
        actorId: 'operator-1',
        outcome: 'effect_confirmed',
        evidenceRef: 'evidence://synthetic/1'
      })

      expect(reconciled).toMatchObject({
        state: 'CONFIRMED',
        reconciledBy: 'operator-1',
        reconciliationEvidenceRef: 'evidence://synthetic/1'
      })
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toMatchObject({ outcome: 'replay' })
    })

    it('reconciles UNCERTAIN as no_effect into a safe abandoned state', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      await journal.markEffectStarted(attemptRef())
      await journal.markUncertain({
        ...attemptRef(),
        reason: 'ambiguous crash'
      })

      await expect(
        journal.reconcile({
          tenantId: tenant,
          operationKey,
          actorId: 'operator-1',
          outcome: 'no_effect',
          evidenceRef: 'evidence://synthetic/2'
        })
      ).resolves.toMatchObject({ state: 'ABANDONED' })
      await expect(
        journal.reserve(reserveInput({ attemptId: 'attempt-2' }))
      ).resolves.toMatchObject({ outcome: 'reserved' })
    })

    it('refuses reconciliation outside UNCERTAIN and never runs automatically', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())

      await expect(
        journal.reconcile({
          tenantId: tenant,
          operationKey,
          actorId: 'operator-1',
          outcome: 'effect_confirmed',
          evidenceRef: 'evidence://synthetic/3'
        })
      ).rejects.toMatchObject({ code: 'invalid_transition' })

      await journal.markEffectStarted(attemptRef())
      await journal.confirmEffect({
        ...attemptRef(),
        executionRef: 'execution-ref-1',
        resultDigest
      })
      await expect(
        journal.reconcile({
          tenantId: tenant,
          operationKey,
          actorId: 'operator-1',
          outcome: 'no_effect',
          evidenceRef: 'evidence://synthetic/4'
        })
      ).rejects.toMatchObject({ code: 'invalid_transition' })
    })

    it('returns defensive clones from get', async () => {
      const journal = await createJournal()
      await journal.reserve(reserveInput())
      const record = await journal.get(tenant, operationKey)
      expect(record).toBeDefined()
      if (!record) return
      record.state = 'CONFIRMED'

      await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
        state: 'RESERVED'
      })
    })
  })
}

describeEffectJournal(
  'InMemoryEffectJournal (ephemeral)',
  () => new InMemoryEffectJournal()
)

describeEffectJournal('FileEffectJournal (single-host durable)', () =>
  createFileJournal()
)

describe('FileEffectJournal restart semantics', () => {
  it('survives a new instance over the same directory and proves replay', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-'))
    temporaryDirectories.push(directory)

    const first = new FileEffectJournal({ directory })
    await first.reserve(reserveInput())
    await first.markEffectStarted(attemptRef())

    const second = new FileEffectJournal({ directory })
    await expect(second.get(tenant, operationKey)).resolves.toMatchObject({
      state: 'EFFECT_STARTED'
    })
    await second.confirmEffect({
      ...attemptRef(),
      executionRef: 'execution-ref-restart',
      resultDigest
    })

    const third = new FileEffectJournal({ directory })
    await expect(
      third.reserve(reserveInput({ attemptId: 'attempt-2' }))
    ).resolves.toMatchObject({
      outcome: 'replay',
      record: expect.objectContaining({
        state: 'CONFIRMED',
        executionRef: 'execution-ref-restart'
      })
    })
  })

  it('reserves atomically across two instances sharing a directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-effect-journal-'))
    temporaryDirectories.push(directory)
    const first = new FileEffectJournal({ directory })
    const second = new FileEffectJournal({ directory })

    const outcomes = await Promise.all([
      first.reserve(reserveInput({ attemptId: 'attempt-1' })),
      second.reserve(reserveInput({ attemptId: 'attempt-2' }))
    ])

    expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual([
      'in_progress',
      'reserved'
    ])
    await expect(first.get(tenant, operationKey)).resolves.toMatchObject({
      revision: 1
    })
  })

  it('rejects an empty directory option', () => {
    expect(() => new FileEffectJournal({ directory: '   ' })).toThrow()
  })
})
