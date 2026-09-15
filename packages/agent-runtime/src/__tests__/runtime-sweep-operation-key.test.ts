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
import {
  PolicyEngine,
  type Capability,
  type PolicyDocument
} from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime, sweepExpiredApprovals } from '../runtime.ts'
import {
  InMemoryEffectJournal,
  type EffectJournalPort
} from '../effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const CALLER_KEY_A = 'caller-idempotency-A'
const CALLER_KEY_B = 'caller-idempotency-B'

interface HarnessOptions {
  documents?: PolicyDocument[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
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
    promptId: 'binding-core',
    version: '1.0.0',
    content: 'You are the CVG secretary.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  let providerCalls = 0
  const provider = new DeterministicModelProvider({
    respond: () => {
      providerCalls += 1
      return {
        text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
        usage: { inputTokens: 10, outputTokens: 5 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      }
    }
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
  const policy = new PolicyEngine({
    documents: options.documents ?? [],
    clock: now
  })
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
    ...(options.effectScopes !== undefined
      ? { effectScopes: options.effectScopes }
      : {}),
    ...(options.journal !== undefined
      ? { effectJournal: options.journal }
      : {}),
    ...(options.reservationTtlMs !== undefined
      ? { reservationTtlMs: options.reservationTtlMs }
      : {})
  })
  return {
    runtime,
    approvals,
    toolExecutor,
    outbox,
    providerCalls: () => providerCalls
  }
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
    prompt: { promptId: 'binding-core', version: '1.0.0' },
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

function expectedCallerOperationKey(callerIdempotencyKey: string): string {
  return `op:${createHash('sha256')
    .update(
      canonicalizeJson({ tenantId: TENANT, callerIdempotencyKey }),
      'utf8'
    )
    .digest('hex')}`
}

const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

function reserveOrphan(
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

describe('P1-2: caller operationKey persistence closes the TTL duplicate window', () => {
  it('does not re-execute a possibly-started effect when a legacy approval is retried with a changed caller key', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const { stored } = reserveOrphan(harness, approvalId, 1_000)
    const callerOperationKey = expectedCallerOperationKey(CALLER_KEY_A)
    await journal.reserve({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-caller-A',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      attemptId: 'attempt-caller-A'
    })
    now = new Date(now.getTime() + 2_000)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(
      journal.get(TENANT, callerOperationKey)
    ).resolves.toMatchObject({
      state: 'UNCERTAIN'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('does not re-execute when the reservation persisted the caller operation key and the retry changes the key', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const callerOperationKey = expectedCallerOperationKey(CALLER_KEY_A)
    const { stored } = reserveOrphan(harness, approvalId, 1_000, {
      operationKey: callerOperationKey
    })
    await journal.reserve({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-persisted-A',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      attemptId: 'attempt-persisted-A'
    })
    now = new Date(now.getTime() + 2_000)

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    const approval = harness.approvals.get(TENANT, approvalId)
    expect(approval.status).toBe('UNCERTAIN')
    expect(approval.operationKey).toBe(callerOperationKey)
    await expect(
      journal.get(TENANT, callerOperationKey)
    ).resolves.toMatchObject({
      state: 'UNCERTAIN'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('does not re-execute when a persisted caller key is retried without any idempotency key', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const callerOperationKey = expectedCallerOperationKey(CALLER_KEY_A)
    const { stored } = reserveOrphan(harness, approvalId, 1_000, {
      operationKey: callerOperationKey
    })
    await journal.reserve({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-absent-B',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: callerOperationKey,
      attemptId: 'attempt-absent-B'
    })
    now = new Date(now.getTime() + 2_000)

    const retry = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(retry.outcome).toBe('denied')
    expect(retry.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('releases a persisted-key reservation to APPROVED only when the journal proves no effect', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const operationKey = expectedCallerOperationKey(CALLER_KEY_A)
    reserveOrphan(harness, approvalId, 1_000, {
      operationKey,
      executing: false
    })
    now = new Date(now.getTime() + 2_000)

    const counters = await sweepExpiredApprovals({
      approvals: harness.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now,
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 1, uncertain: 0 })
    const approval = harness.approvals.get(TENANT, approvalId)
    expect(approval.status).toBe('APPROVED')
    expect(approval.operationKey).toBe(operationKey)
    expect(approval.reservationId).toBeUndefined()
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('keeps a persisted-key reservation UNCERTAIN when the journal shows EFFECT_STARTED', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const operationKey = expectedCallerOperationKey(CALLER_KEY_A)
    const { stored } = reserveOrphan(harness, approvalId, 1_000, {
      operationKey
    })
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-persisted-started',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-persisted-started'
    })
    now = new Date(now.getTime() + 2_000)

    const counters = await sweepExpiredApprovals({
      approvals: harness.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now,
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'EFFECT_STARTED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('keeps a legacy approval without a persisted operationKey UNCERTAIN even when the derived journal is absent', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveOrphan(harness, approvalId, 1_000)
    expect(
      harness.approvals.get(TENANT, approvalId).operationKey
    ).toBeUndefined()
    now = new Date(now.getTime() + 2_000)

    const counters = await sweepExpiredApprovals({
      approvals: harness.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now,
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('reuses the persisted operation key for journal and outbox after a proven-no-effect release', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: CALLER_KEY_A
    })
    approveApproval(harness, approvalId)
    const persistedKey = expectedCallerOperationKey(CALLER_KEY_A)
    reserveOrphan(harness, approvalId, 1_000, {
      operationKey: persistedKey,
      executing: false
    })
    now = new Date(now.getTime() + 2_000)
    await sweepExpiredApprovals({
      approvals: harness.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now,
      ttlMs: 1_000
    })
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')

    const retry = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: CALLER_KEY_B })
    )

    expect(retry.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    await expect(journal.get(TENANT, persistedKey)).resolves.toMatchObject({
      state: 'CONFIRMED'
    })
    await expect(
      journal.get(TENANT, expectedCallerOperationKey(CALLER_KEY_B))
    ).resolves.toBeUndefined()
    expect(harness.outbox).toHaveBeenCalledTimes(1)
    expect(harness.outbox.mock.calls[0]?.[0]?.idempotencyKey).toBe(persistedKey)
  })
})
