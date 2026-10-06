import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApprovalEngine,
  InMemoryApprovalStore,
  type ApprovalRecord
} from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { PolicyEngine, REFERENCE_POLICY_PROFILE } from '@cvg/policy-engine'
import { GovernedAgentRuntime, sweepExpiredApprovals } from '../runtime.ts'
import {
  EffectJournalError,
  InMemoryEffectJournal,
  type EffectJournalPort,
  type EffectRecord,
  type EffectReserveInput
} from '../effect-journal.ts'
import type { GovernedTurnInput, GovernedTurnResult } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000072'
const AGENT = 'agent_00000000-0000-4000-8000-000000000072'
const PERSISTED_KEY = 'op:synthetic-up91-r3-original'
const TTL = 1_000

interface ObservedRead {
  tenantId: string
  operationKey: string
  record: EffectRecord | undefined
}

/**
 * All observations and reserve outcomes come from the memory journal. A hook
 * runs AFTER capturing the real get result, returning that original snapshot
 * after another actor's mutation. Reads on resume are sweep, recovery, active
 * recovery, in that order; no sweep or runtime implementation is replaced.
 */
class InterleavedJournal implements EffectJournalPort {
  readonly reads: ObservedRead[] = []
  afterRead:
    | ((read: ObservedRead, ordinal: number) => Promise<void> | void)
    | undefined
  beforeReserve:
    | ((input: EffectReserveInput) => Promise<void> | void)
    | undefined

  constructor(readonly inner: InMemoryEffectJournal) {}

  async get(tenantId: string, operationKey: string) {
    const record = await this.inner.get(tenantId, operationKey)
    const observed = { tenantId, operationKey, record }
    this.reads.push(observed)
    await this.afterRead?.(observed, this.reads.length)
    return record
  }

  async reserve(input: EffectReserveInput) {
    await this.beforeReserve?.(input)
    return this.inner.reserve(input)
  }

  markEffectStarted(
    ref: Parameters<EffectJournalPort['markEffectStarted']>[0]
  ) {
    return this.inner.markEffectStarted(ref)
  }

  confirmEffect(ref: Parameters<EffectJournalPort['confirmEffect']>[0]) {
    return this.inner.confirmEffect(ref)
  }

  failEffect(ref: Parameters<EffectJournalPort['failEffect']>[0]) {
    return this.inner.failEffect(ref)
  }

  markUncertain(ref: Parameters<EffectJournalPort['markUncertain']>[0]) {
    return this.inner.markUncertain(ref)
  }

  releaseExpired(now: Date, ttlMs: number) {
    return this.inner.releaseExpired(now, ttlMs)
  }

  reconcile(ref: Parameters<EffectJournalPort['reconcile']>[0]) {
    return this.inner.reconcile(ref)
  }
}

function fixture() {
  let now = new Date('2026-09-30T12:00:00.000Z')
  const clock = () => new Date(now)
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms)
  }
  const inner = new InMemoryEffectJournal({ clock })
  const journal = new InterleavedJournal(inner)
  const journalReserve = vi.spyOn(journal, 'reserve')
  const journalStart = vi.spyOn(journal, 'markEffectStarted')
  const journalConfirm = vi.spyOn(journal, 'confirmEffect')
  const journalFail = vi.spyOn(journal, 'failEffect')
  const journalUncertain = vi.spyOn(journal, 'markUncertain')
  const journalReconcile = vi.spyOn(journal, 'reconcile')
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'recovery-boundary',
    version: '1.0.0',
    content: 'Synthetic recovery boundary.',
    owner: 'platform',
    approvedBy: 'synthetic-reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const respond = vi.fn(() => ({
    text: JSON.stringify({ text: 'synthetic approved proposal' }),
    usage: { inputTokens: 10, outputTokens: 5 },
    providerId: 'deterministic',
    model: 'deterministic-v1',
    externalCall: false
  }))
  const gateway = new ModelGateway({
    providers: [new DeterministicModelProvider({ respond })],
    profiles: {
      fast: {
        name: 'fast',
        providerId: 'deterministic',
        model: 'deterministic-v1',
        location: 'local',
        temperature: 0,
        maxTokens: 256,
        timeoutMs: 5_000,
        maxCostUsd: 1,
        estimatedCostUsd: 0,
        maxRetries: 0,
        pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
      }
    },
    prompts,
    clock,
    retry: { maxRetries: 0 }
  })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock })
  const approvalReserve = vi.spyOn(approvals, 'reserve')
  const release = vi.spyOn(approvals, 'release')
  const uncertain = vi.spyOn(approvals, 'markUncertain')
  const confirm = vi.spyOn(approvals, 'confirm')
  const telemetry = new InMemoryTelemetry({ clock })
  const startSpan = vi.spyOn(telemetry, 'startSpan')
  const audit = new HashChainedAuditLedger()
  const toolExecutor = vi.fn(async () => ({ result: { synthetic: true } }))
  const outbox = vi.fn(async () => ({ eventId: 'synthetic-event' }))
  const runtime = new GovernedAgentRuntime({
    policy: new PolicyEngine({ profile: REFERENCE_POLICY_PROFILE, clock }),
    approvals,
    modelGateway: gateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    effectJournal: journal,
    effectScopes: { 'record.cancel': 'controlled_fake' },
    reservationTtlMs: TTL,
    clock
  })
  const input = (
    overrides: Partial<GovernedTurnInput> = {}
  ): GovernedTurnInput => ({
    tenantId: TENANT,
    operatorId: 'synthetic-operator',
    operatorRole: 'Supervisor',
    agentId: AGENT,
    agentVersion: 'synthetic-v1',
    agentProfile: 'assistant',
    conversationId: 'synthetic-conversation',
    correlationId: 'corr_00000000-0000-4000-8000-000000000072',
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record', id: 'synthetic-record', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'recovery-boundary', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: {
      messages: [{ role: 'user', content: 'Synthetic draft.' }]
    },
    structuredOutput: {
      schemaName: 'SyntheticPayload',
      schema: z.object({ text: z.string() })
    },
    ...overrides
  })
  return {
    runtime,
    approvals,
    store,
    inner,
    journal,
    journalReserve,
    journalStart,
    journalConfirm,
    journalFail,
    journalUncertain,
    journalReconcile,
    approvalReserve,
    release,
    uncertain,
    confirm,
    respond,
    telemetry,
    startSpan,
    audit,
    toolExecutor,
    outbox,
    input,
    clock,
    advance
  }
}

type Fixture = ReturnType<typeof fixture>

async function approvedReservation(
  f: Fixture,
  options: { persisted: boolean; executing?: boolean; ttlMs?: number }
) {
  const requested = await f.runtime.runTurn(f.input())
  expect(requested.outcome).toBe('approval_required')
  if (requested.approvalId === undefined) throw new Error('missing approval id')
  const approvalId = requested.approvalId
  f.approvals.submit(TENANT, approvalId, 'synthetic-operator')
  f.approvals.approve(TENANT, approvalId, { approverId: 'synthetic-reviewer' })
  const proposal = f.approvals.get(TENANT, approvalId)
  if (proposal.proposalHash === undefined)
    throw new Error('missing proposal hash')
  const reservation = f.approvals.reserve({
    tenantId: TENANT,
    approvalId,
    action: proposal.action,
    resource: proposal.resource,
    payload: proposal.proposalPayload,
    proposalHash: proposal.proposalHash,
    agentId: AGENT,
    agentVersion: 'synthetic-v1',
    policyVersion: proposal.policyVersion,
    capability: 'record.cancel',
    ttlMs: options.ttlMs ?? TTL,
    ...(options.persisted ? { operationKey: PERSISTED_KEY } : {})
  })
  if (options.executing) {
    f.approvals.markExecuting({
      tenantId: TENANT,
      approvalId,
      reservationId: reservation.reservationId
    })
  }
  const before = f.approvals.get(TENANT, approvalId)
  expect(before.operationKey).toBe(
    options.persisted ? PERSISTED_KEY : undefined
  )
  // Clear only observations of setup; every spy still calls the real API.
  f.approvalReserve.mockClear()
  f.journal.reads.length = 0
  return { approvalId, before, proposalHash: proposal.proposalHash }
}

function assertClosed(f: Fixture) {
  const spans = f.telemetry.spans()
  expect(spans).toHaveLength(f.startSpan.mock.calls.length)
  expect(new Set(spans.map((span) => span.spanId)).size).toBe(spans.length)
  for (const span of spans) {
    expect(Date.parse(span.endedAt)).toBeGreaterThanOrEqual(
      Date.parse(span.startedAt)
    )
  }
  expect(f.audit.size()).toBeGreaterThan(0)
  expect(f.audit.verify()).toEqual({ valid: true })
}

function assertNoEffects(f: Fixture) {
  expect(f.respond).toHaveBeenCalledTimes(1)
  expect(f.toolExecutor).not.toHaveBeenCalled()
  expect(f.outbox).not.toHaveBeenCalled()
  expect(f.journalStart).not.toHaveBeenCalled()
  expect(f.journalConfirm).not.toHaveBeenCalled()
  expect(f.journalFail).not.toHaveBeenCalled()
  expect(f.journalUncertain).not.toHaveBeenCalled()
  expect(f.journalReconcile).not.toHaveBeenCalled()
  expect(f.confirm).not.toHaveBeenCalled()
  expect(f.release).not.toHaveBeenCalled()
  assertClosed(f)
}

function assertDenied(
  f: Fixture,
  result: GovernedTurnResult,
  reason = 'operation_uncertain'
) {
  expect(result.outcome).toBe('denied')
  expect(result.reason).toBe(reason)
  expect(result.auditChainValid).toBe(true)
  expect(result.effectConfirmed).toBeUndefined()
  expect(result.executionRef).toBeUndefined()
  expect(result.outboxEventId).toBeUndefined()
  expect(result.toolResult).toBeUndefined()
  expect(result.replayed).toBeUndefined()
  expect(f.audit.records()).toContainEqual(
    expect.objectContaining({ type: 'runtime.denied' })
  )
  assertNoEffects(f)
}

function assertApproval(
  f: Fixture,
  before: ApprovalRecord,
  status: ApprovalRecord['status']
) {
  const after = f.approvals.get(TENANT, before.approvalId)
  const {
    status: oldStatus,
    decisionReason,
    uncertainAt,
    ...immutable
  } = before
  void oldStatus
  void decisionReason
  void uncertainAt
  expect(after).toMatchObject({ ...immutable, status })
  expect(after.operationKey).toBe(before.operationKey)
  expect(after.reservationId).toBe(before.reservationId)
  expect(after.reservationGeneration).toBe(before.reservationGeneration)
  expect(f.store.get(TENANT, before.approvalId)).toEqual(after)
  if (status === before.status) expect(after).toEqual(before)
  if (status === 'UNCERTAIN') {
    expect(f.uncertain).toHaveBeenCalledTimes(1)
    expect(after.uncertainAt).toBe(f.clock().toISOString())
  } else expect(f.uncertain).not.toHaveBeenCalled()
}

async function otherActorReserve(
  f: Fixture,
  read: ObservedRead,
  proposalHash: string
) {
  const ref = {
    tenantId: read.tenantId,
    operationKey: read.operationKey,
    attemptId: 'synthetic-other-actor'
  }
  const outcome = await f.inner.reserve({
    ...ref,
    proposalHash,
    expiresAt: new Date(f.clock().getTime() + 60_000).toISOString()
  })
  expect(outcome).toEqual({ outcome: 'reserved' })
  return ref
}

describe('SPEC0172: public recovery boundaries with real journal interleavings', () => {
  it.each([
    { name: 'legacy RESERVED', persisted: false, executing: false },
    { name: 'persisted EXECUTING', persisted: true, executing: true }
  ])(
    'keeps expired $name UNCERTAIN when the journal is missing',
    async (options) => {
      const f = fixture()
      const { approvalId, before } = await approvedReservation(f, options)
      // Expire after the start-of-turn timestamp was captured. The real sweep
      // uses that older timestamp; recovery must handle the newly expired lease.
      f.journal.afterRead = (read, ordinal) => {
        expect(read.record).toBeUndefined()
        if (ordinal === 1) f.advance(TTL + 1)
      }
      const result = await f.runtime.runTurn(
        f.input({ approvalId, idempotencyKey: 'synthetic-retry-key' })
      )
      assertDenied(f, result)
      assertApproval(f, before, 'UNCERTAIN')
      expect(f.journal.reads).toHaveLength(2)
      expect(f.approvalReserve).not.toHaveBeenCalled()
      expect(f.journalReserve).not.toHaveBeenCalled()
      const recovery = f.journal.reads[1]
      if (recovery === undefined) throw new Error('missing recovery read')
      if (options.persisted) expect(recovery.operationKey).toBe(PERSISTED_KEY)
      await expect(
        f.inner.get(TENANT, recovery.operationKey)
      ).resolves.toBeUndefined()
    }
  )

  it('denies a different proposal inserted after the recovery read but before the active read', async () => {
    const f = fixture()
    const { approvalId, before, proposalHash } = await approvedReservation(f, {
      persisted: true
    })
    let inserted: EffectRecord | undefined
    f.journal.afterRead = async (read, ordinal) => {
      if (ordinal !== 2) return
      expect(read.record).toBeUndefined()
      const otherHash = 'f'.repeat(64)
      expect(otherHash).not.toBe(proposalHash)
      await otherActorReserve(f, read, otherHash)
      inserted = await f.inner.get(TENANT, read.operationKey)
    }
    const result = await f.runtime.runTurn(f.input({ approvalId }))
    assertDenied(f, result)
    assertApproval(f, before, 'RESERVED')
    expect(f.journal.reads.map((read) => read.record?.state)).toEqual([
      undefined,
      undefined,
      'RESERVED'
    ])
    expect(f.approvalReserve).toHaveBeenCalledTimes(1)
    expect(f.journalReserve).not.toHaveBeenCalled()
    expect(inserted).toMatchObject({
      proposalHash: 'f'.repeat(64),
      attemptId: 'synthetic-other-actor'
    })
    await expect(f.inner.get(TENANT, PERSISTED_KEY)).resolves.toEqual(inserted)
  })

  it.each([false, true])(
    'marks approval UNCERTAIN when a row appears between reads (persisted=%s)',
    async (persisted) => {
      const f = fixture()
      const { approvalId, before, proposalHash } = await approvedReservation(
        f,
        { persisted }
      )
      let inserted: EffectRecord | undefined
      f.journal.afterRead = async (read, ordinal) => {
        if (ordinal !== 2) return
        expect(read.record).toBeUndefined()
        const ref = await otherActorReserve(f, read, proposalHash)
        inserted = await f.inner.markUncertain({
          ...ref,
          reason: 'synthetic other actor lost confirmation'
        })
      }
      const result = await f.runtime.runTurn(f.input({ approvalId }))
      assertDenied(f, result)
      assertApproval(f, before, 'UNCERTAIN')
      expect(f.journal.reads.map((read) => read.record?.state)).toEqual([
        undefined,
        undefined,
        'UNCERTAIN'
      ])
      expect(f.approvalReserve).toHaveBeenCalledTimes(1)
      expect(f.journalReserve).not.toHaveBeenCalled()
      const active = f.journal.reads[2]
      if (active === undefined) throw new Error('missing active read')
      expect(active.record).toEqual(inserted)
      expect(inserted).toMatchObject({
        proposalHash,
        attemptId: 'synthetic-other-actor',
        state: 'UNCERTAIN'
      })
      await expect(f.inner.get(TENANT, active.operationKey)).resolves.toEqual(
        inserted
      )
    }
  )

  it('loses a real reserve race after reading ABANDONED without rearming or executing', async () => {
    const f = fixture()
    const { approvalId, before, proposalHash } = await approvedReservation(f, {
      persisted: true,
      ttlMs: 60_000
    })
    await f.inner.reserve({
      tenantId: TENANT,
      operationKey: PERSISTED_KEY,
      proposalHash,
      attemptId: 'synthetic-never-started',
      expiresAt: new Date(f.clock().getTime() + TTL).toISOString()
    })
    f.advance(TTL + 1)
    let winner: EffectRecord | undefined
    f.journal.afterRead = async (read, ordinal) => {
      if (ordinal !== 3) return
      expect(read.record).toMatchObject({
        state: 'ABANDONED',
        attemptId: 'synthetic-never-started'
      })
      await otherActorReserve(f, read, proposalHash)
      winner = await f.inner.get(TENANT, read.operationKey)
    }
    const result = await f.runtime.runTurn(f.input({ approvalId }))
    assertDenied(f, result, 'operation_in_progress')
    assertApproval(f, before, 'RESERVED')
    expect(f.journal.reads.map((read) => read.record?.state)).toEqual([
      'ABANDONED',
      'ABANDONED',
      'ABANDONED'
    ])
    expect(f.approvalReserve).toHaveBeenCalledTimes(1)
    expect(f.journalReserve).toHaveBeenCalledTimes(1)
    await expect(f.journalReserve.mock.results[0]?.value).resolves.toEqual({
      outcome: 'in_progress'
    })
    expect(f.journalReserve.mock.calls[0]?.[0]).toMatchObject({
      operationKey: PERSISTED_KEY,
      proposalHash
    })
    expect(f.journalReserve.mock.calls[0]?.[0].attemptId).not.toBe(
      winner?.attemptId
    )
    expect(winner).toMatchObject({
      state: 'RESERVED',
      attemptId: 'synthetic-other-actor',
      proposalHash
    })
    await expect(f.inner.get(TENANT, PERSISTED_KEY)).resolves.toEqual(winner)
  })

  it('denies a fault in the second recovery read after a successful missing first recovery read', async () => {
    const f = fixture()
    const { approvalId, before } = await approvedReservation(f, {
      persisted: true
    })
    f.journal.afterRead = (read, ordinal) => {
      expect(read.record).toBeUndefined()
      if (ordinal === 3)
        throw new EffectJournalError(
          'journal_unavailable',
          'synthetic active recovery read fault'
        )
    }
    const result = await f.runtime.runTurn(f.input({ approvalId }))
    assertDenied(f, result)
    assertApproval(f, before, 'RESERVED')
    expect(f.journal.reads).toHaveLength(3)
    expect(
      f.journal.reads.every((read) => read.operationKey === PERSISTED_KEY)
    ).toBe(true)
    expect(f.approvalReserve).toHaveBeenCalledTimes(1)
    expect(f.journalReserve).not.toHaveBeenCalled()
  })

  it('sweeps missing persisted keys by real approval state: RESERVED releases, EXECUTING stays UNCERTAIN', async () => {
    for (const executing of [false, true]) {
      const f = fixture()
      const { approvalId, before } = await approvedReservation(f, {
        persisted: true,
        executing
      })
      f.advance(TTL + 1)
      const counters = await sweepExpiredApprovals({
        approvals: f.approvals,
        effectJournal: f.journal,
        tenantId: TENANT,
        now: f.clock(),
        ttlMs: TTL
      })
      expect(counters).toEqual(
        executing
          ? { released: 0, uncertain: 1 }
          : { released: 1, uncertain: 0 }
      )
      const after = f.approvals.get(TENANT, approvalId)
      expect(after.status).toBe(executing ? 'UNCERTAIN' : 'APPROVED')
      expect(after.operationKey).toBe(PERSISTED_KEY)
      expect(after.proposalHash).toBe(before.proposalHash)
      expect(after.proposalPayload).toEqual(before.proposalPayload)
      expect(after.reservationGeneration).toBe(before.reservationGeneration)
      expect(after.reservationId).toBe(
        executing ? before.reservationId : undefined
      )
      expect(f.journal.reads).toEqual([
        { tenantId: TENANT, operationKey: PERSISTED_KEY, record: undefined }
      ])
      await expect(f.inner.get(TENANT, PERSISTED_KEY)).resolves.toBeUndefined()
      expect(f.approvalReserve).not.toHaveBeenCalled()
      expect(f.journalReserve).not.toHaveBeenCalled()
      assertNoEffects(f)
    }
  })
})
