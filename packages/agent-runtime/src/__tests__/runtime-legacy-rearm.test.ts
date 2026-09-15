import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import { canonicalizeJson } from '@cvg/shared'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type { ModelProfile } from '@cvg/model-gateway'
import { PolicyEngine, type Capability } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime } from '../runtime.ts'
import {
  EffectJournalError,
  InMemoryEffectJournal,
  type EffectJournalPort,
  type EffectRecord,
  type EffectReserveInput,
  type EffectReserveOutcome
} from '../effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000071'
const AGENT = 'agent_00000000-0000-4000-8000-000000000071'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000071'
const NOW = new Date('2026-09-13T09:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const CALLER_KEY_A = 'legacy-rearm-caller-A'
const CALLER_KEY_B = 'legacy-rearm-caller-B'

const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

interface HarnessOptions {
  clock?: () => Date
  journal?: EffectJournalPort
  reservationTtlMs?: number
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
}

function buildHarness(options: HarnessOptions = {}) {
  const now = options.clock ?? (() => NOW)
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'legacy-rearm-core',
    version: '1.0.0',
    content: 'You are the CVG secretary.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const provider = new DeterministicModelProvider({
    respond: () => ({
      text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
      usage: { inputTokens: 10, outputTokens: 5 },
      providerId: 'deterministic',
      model: 'deterministic-v1',
      externalCall: false
    })
  })
  const profile: ModelProfile = {
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
  const modelGateway = new ModelGateway({
    providers: [provider],
    profiles: { fast: profile },
    prompts,
    clock: now,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({ documents: [], clock: now })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock: now })
  const telemetry = new InMemoryTelemetry({ clock: now })
  const audit = new HashChainedAuditLedger()
  const toolExecutor = vi.fn(
    options.toolExecutor ?? (async () => ({ result: { ok: true } }))
  )
  const outbox = vi.fn(
    options.outbox ??
      (async (event: OutboxEnqueueInput) => ({
        eventId: `evt_${event.idempotencyKey}`
      }))
  )
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    clock: now,
    effectScopes: FAKE_CANCEL_SCOPE,
    ...(options.journal !== undefined
      ? { effectJournal: options.journal }
      : {}),
    ...(options.reservationTtlMs !== undefined
      ? { reservationTtlMs: options.reservationTtlMs }
      : {})
  })
  return { runtime, approvals, toolExecutor, outbox }
}

type Harness = ReturnType<typeof buildHarness>

function turnInput(
  overrides: Partial<GovernedTurnInput> = {}
): GovernedTurnInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Supervisor',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'secretary',
    conversationId: 'conv_1',
    correlationId: CORRELATION,
    capability: 'appointment.cancel',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'legacy-rearm-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: { messages: [{ role: 'user', content: 'cancelar' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

function approveApproval(harness: Harness, approvalId: string): void {
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
}

async function requestApproval(
  harness: Harness,
  overrides: Partial<GovernedTurnInput> = {}
): Promise<string> {
  const requested = await harness.runtime.runTurn(turnInput(overrides))
  expect(requested.outcome).toBe('approval_required')
  const approvalId = requested.approvalId ?? ''
  expect(approvalId).not.toBe('')
  return approvalId
}

function callerOperationKey(callerIdempotencyKey: string): string {
  return `op:${createHash('sha256')
    .update(
      canonicalizeJson({ tenantId: TENANT, callerIdempotencyKey }),
      'utf8'
    )
    .digest('hex')}`
}

function derivedOperationKey(proposalHash: string): string {
  return `op:${createHash('sha256')
    .update(
      canonicalizeJson({
        tenantId: TENANT,
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        proposalHash
      }),
      'utf8'
    )
    .digest('hex')}`
}

/**
 * Reserves the approval directly through the engine. Without `operationKey`
 * the record replicates the pre-P1-2 legacy shape: an active reservation with
 * no durable operation identity. With it the record replicates the fixed
 * runtime shape.
 */
function reserveApproval(
  harness: Harness,
  approvalId: string,
  ttlMs: number,
  options: { operationKey?: string; executing?: boolean } = {}
) {
  const stored = harness.approvals.get(TENANT, approvalId)
  const reservation = harness.approvals.reserve({
    tenantId: TENANT,
    approvalId,
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1' },
    payload: stored.proposalPayload,
    proposalHash: stored.proposalHash,
    agentId: AGENT,
    agentVersion: 'v1',
    policyVersion: stored.policyVersion,
    capability: 'appointment.cancel',
    ttlMs,
    ...(options.operationKey !== undefined
      ? { operationKey: options.operationKey }
      : {})
  })
  if (options.executing ?? true) {
    harness.approvals.markExecuting({
      tenantId: TENANT,
      approvalId,
      reservationId: reservation.reservationId
    })
  }
  return { stored, reservation }
}

async function seedEffectStarted(
  journal: EffectJournalPort,
  operationKey: string,
  proposalHash: string,
  attemptId: string,
  expiresAt: string
): Promise<void> {
  await journal.reserve({
    tenantId: TENANT,
    operationKey,
    proposalHash,
    attemptId,
    expiresAt
  })
  await journal.markEffectStarted({
    tenantId: TENANT,
    operationKey,
    attemptId
  })
}

class NoSweepJournal implements EffectJournalPort {
  readonly inner: EffectJournalPort
  constructor(inner: EffectJournalPort) {
    this.inner = inner
  }
  reserve(input: EffectReserveInput): Promise<EffectReserveOutcome> {
    return this.inner.reserve(input)
  }
  markEffectStarted(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
  }): Promise<EffectRecord> {
    return this.inner.markEffectStarted(ref)
  }
  confirmEffect(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    executionRef: string
    resultDigest: string
  }): Promise<EffectRecord> {
    return this.inner.confirmEffect(ref)
  }
  failEffect(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    errorCode: string
  }): Promise<EffectRecord> {
    return this.inner.failEffect(ref)
  }
  markUncertain(ref: {
    tenantId: string
    operationKey: string
    attemptId: string
    reason: string
  }): Promise<EffectRecord> {
    return this.inner.markUncertain(ref)
  }
  get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord | undefined> {
    return this.inner.get(tenantId, operationKey)
  }
  async releaseExpired(): Promise<number> {
    return 0
  }
  reconcile(ref: {
    tenantId: string
    operationKey: string
    actorId: string
    outcome: 'effect_confirmed' | 'no_effect'
    evidenceRef: string
  }): Promise<EffectRecord> {
    return this.inner.reconcile(ref)
  }
}

class ThrowingGetJournal extends NoSweepJournal {
  override async get(): Promise<EffectRecord | undefined> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic journal get failure'
    )
  }
}

describe('P1-2R: legacy recovery without a persisted operationKey fails closed', () => {
  it('denies a legacy active-lease retry with a changed caller key and never re-executes', async () => {
    const now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    reserveApproval(harness, approvalId, 60_000)
    expect(stored.operationKey).toBeUndefined()
    const keyA = callerOperationKey(CALLER_KEY_A)
    await seedEffectStarted(
      journal,
      keyA,
      stored.proposalHash ?? '',
      'attempt-legacy-A',
      new Date(now.getTime() + 60_000).toISOString()
    )
    const journalABefore = await journal.get(TENANT, keyA)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, keyA)).resolves.toEqual(journalABefore)
    await expect(
      journal.get(TENANT, callerOperationKey(CALLER_KEY_B))
    ).resolves.toBeUndefined()
    expect(
      harness.approvals.get(TENANT, approvalId).operationKey
    ).toBeUndefined()
  })

  it('denies a legacy active-lease retry without any caller key and never re-executes', async () => {
    const now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    reserveApproval(harness, approvalId, 60_000)
    const keyA = callerOperationKey(CALLER_KEY_A)
    await seedEffectStarted(
      journal,
      keyA,
      stored.proposalHash ?? '',
      'attempt-legacy-absent-key',
      new Date(now.getTime() + 60_000).toISOString()
    )
    const journalABefore = await journal.get(TENANT, keyA)

    const retry = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, keyA)).resolves.toEqual(journalABefore)
    await expect(
      journal.get(TENANT, derivedOperationKey(stored.proposalHash ?? ''))
    ).resolves.toBeUndefined()
  })

  it('never re-executes the legacy scenario once the reservation lease expired (sweep path)', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    reserveApproval(harness, approvalId, 1_000)
    const keyA = callerOperationKey(CALLER_KEY_A)
    await seedEffectStarted(
      journal,
      keyA,
      stored.proposalHash ?? '',
      'attempt-legacy-expired',
      new Date(now.getTime() + 1_000).toISOString()
    )
    now = new Date(now.getTime() + 120_000)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, keyA)).resolves.not.toMatchObject({
      state: 'CONFIRMED'
    })
    await expect(
      journal.get(TENANT, callerOperationKey(CALLER_KEY_B))
    ).resolves.toBeUndefined()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })

  it('denies a legacy reservation when the recovery lookup fails', async () => {
    const now = NOW
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal: new ThrowingGetJournal(inner),
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    reserveApproval(harness, approvalId, 60_000)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('P1-2R: persisted operation key recovery keeps positive proof', () => {
  it('re-arms a persisted key with a proven-absent journal and never-executing state', async () => {
    const now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const persistedKey = callerOperationKey(CALLER_KEY_A)
    reserveApproval(harness, approvalId, 60_000, {
      operationKey: persistedKey,
      executing: false
    })

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    await expect(journal.get(TENANT, persistedKey)).resolves.toMatchObject({
      state: 'CONFIRMED'
    })
    await expect(
      journal.get(TENANT, callerOperationKey(CALLER_KEY_B))
    ).resolves.toBeUndefined()
    expect(harness.approvals.get(TENANT, approvalId).operationKey).toBe(
      persistedKey
    )
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expect(harness.outbox.mock.calls[0]?.[0]?.idempotencyKey).toBe(persistedKey)
  })

  it('denies a persisted key whose journal shows EFFECT_STARTED and never re-executes', async () => {
    const now = NOW
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal: new NoSweepJournal(inner),
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const persistedKey = callerOperationKey(CALLER_KEY_A)
    reserveApproval(harness, approvalId, 60_000, {
      operationKey: persistedKey,
      executing: true
    })
    await seedEffectStarted(
      inner,
      persistedKey,
      stored.proposalHash ?? '',
      'attempt-persisted-started',
      new Date(now.getTime() - 1_000).toISOString()
    )

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(inner.get(TENANT, persistedKey)).resolves.toMatchObject({
      state: 'EFFECT_STARTED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('denies a persisted key when the approval reached EXECUTING without a journal record', async () => {
    const now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const persistedKey = callerOperationKey(CALLER_KEY_A)
    reserveApproval(harness, approvalId, 60_000, {
      operationKey: persistedKey,
      executing: true
    })

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, persistedKey)).resolves.toBeUndefined()
  })

  it('denies a persisted key whose journal record is bound to another proposal', async () => {
    const now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      clock: () => now,
      journal,
      reservationTtlMs: 60_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const persistedKey = callerOperationKey(CALLER_KEY_A)
    reserveApproval(harness, approvalId, 60_000, {
      operationKey: persistedKey,
      executing: true
    })
    await journal.reserve({
      tenantId: TENANT,
      operationKey: persistedKey,
      proposalHash: 'f'.repeat(64),
      attemptId: 'attempt-foreign-proposal',
      expiresAt: new Date(now.getTime() + 60_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: persistedKey,
      attemptId: 'attempt-foreign-proposal'
    })
    const before = await journal.get(TENANT, persistedKey)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, persistedKey)).resolves.toEqual(before)
  })
})
