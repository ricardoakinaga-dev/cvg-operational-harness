import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApprovalEngine,
  ApprovalError,
  InMemoryApprovalStore
} from '@cvg/approval-engine'
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
  EffectJournalError,
  FileEffectJournal,
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

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

interface HarnessOptions {
  responses?: readonly string[]
  documents?: PolicyDocument[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
  clock?: () => Date
  journal?: EffectJournalPort
  reservationTtlMs?: number
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
  store?: InMemoryApprovalStore
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
  const responses = options.responses ?? [
    JSON.stringify({ text: 'APPROVED_PAYLOAD' })
  ]
  let providerCalls = 0
  const provider = new DeterministicModelProvider({
    respond: () => {
      const index = Math.min(providerCalls, responses.length - 1)
      providerCalls += 1
      return {
        text: responses[index] ?? '{}',
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
  const store = options.store ?? new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock: now })
  const telemetry = new InMemoryTelemetry({ clock: now })
  const audit = new HashChainedAuditLedger()
  const fallbackTool: (
    invocation: ToolInvocation
  ) => Promise<{ result: unknown }> = async () => ({
    result: { ok: true, synthetic: true }
  })
  const toolExecutor = vi.fn(options.toolExecutor ?? fallbackTool)
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
    policy,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    store,
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

function expectedDerivedOperationKey(proposalHash: string): string {
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

function expectedResultDigest(result: unknown): string {
  return createHash('sha256')
    .update(canonicalizeJson(result), 'utf8')
    .digest('hex')
}

const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

function reserveBinding(harness: Harness, approvalId: string, ttlMs: number) {
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
    ttlMs
  })
  harness.approvals.markExecuting({
    tenantId: TENANT,
    approvalId,
    reservationId: reservation.reservationId
  })
  return { stored, reservation }
}

class ThrowingSweepJournal extends InMemoryEffectJournal {
  override async releaseExpired(): Promise<number> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic sweep failure'
    )
  }
}

class ThrowingLookupJournal extends InMemoryEffectJournal {
  override async get(): Promise<never> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic lookup failure'
    )
  }
}

describe('AAA-10 fail-closed durability (F03 / artifact 3)', () => {
  it('denies a high-risk capability without an effect journal before the tool', async () => {
    const harness = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('durability_required')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('keeps a controlled-fake medium-risk capability executable without claiming durability', async () => {
    const harness = buildHarness({
      effectScopes: { 'appointment.create': 'controlled_fake' }
    })
    const result = await harness.runtime.runTurn(
      turnInput({
        capability: 'appointment.create',
        action: 'appointment.create'
      })
    )

    expect(result.outcome).toBe('executed')
    expect(result.replayed).toBeUndefined()
    expect(result.resultDigest).toBeUndefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('fails closed with journal_sweep_failed when the start-of-turn sweep throws', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingSweepJournal()
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_sweep_failed')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('AAA-10 T-07: outbox failure after a confirmed effect', () => {
  it('calls the tool exactly once and replays the persisted digest and ref', async () => {
    const toolResult = { ok: true, appointmentId: 'apt_1' }
    let outboxCalls = 0
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW }),
      toolExecutor: async () => ({ result: toolResult }),
      outbox: async (event) => {
        outboxCalls += 1
        if (outboxCalls <= 2) throw new Error('synthetic outbox outage')
        return { eventId: `evt_${event.idempotencyKey}` }
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const digest = expectedResultDigest(toolResult)

    const first = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(first.outcome).toBe('executed')
    expect(first.outboxPending).toBe(true)
    expect(first.executionRef).toBeDefined()
    expect(first.resultDigest).toBe(digest)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)

    const second = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(second.outcome).toBe('executed')
    expect(second.replayed).toBe(true)
    expect(second.outboxPending).toBe(true)
    expect(second.executionRef).toBe(first.executionRef)
    expect(second.resultDigest).toBe(digest)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')

    const third = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(third.outcome).toBe('executed')
    expect(third.replayed).toBe(true)
    expect(third.outboxEventId).toBeDefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).toHaveBeenCalledTimes(3)
    for (const [event] of harness.outbox.mock.calls) {
      expect(event.idempotencyKey).toBe(operationKey)
    }
  })
})

describe('AAA-10 T-06: crash after effect before ack', () => {
  it('recovers as UNCERTAIN with zero re-execution and no false success', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-runtime-journal-'))
    temporaryDirectories.push(directory)
    let now = NOW
    const store = new InMemoryApprovalStore()
    const firstJournal = new FileEffectJournal({
      directory,
      clock: () => now
    })
    const first = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: firstJournal,
      store,
      clock: () => now
    })
    const approvalId = await requestApproval(first)
    approveApproval(first, approvalId)
    const { stored } = reserveBinding(first, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await firstJournal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-crash',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await firstJournal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-crash'
    })
    now = new Date(now.getTime() + 2_000)

    const restartedJournal = new FileEffectJournal({
      directory,
      clock: () => now
    })
    const restarted = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: restartedJournal,
      store,
      clock: () => now
    })
    const result = await restarted.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(result.replayed).toBeUndefined()
    expect(restarted.toolExecutor).not.toHaveBeenCalled()
    expect(restarted.outbox).not.toHaveBeenCalled()
    expect(restarted.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    const journalRecord = await restartedJournal.get(TENANT, operationKey)
    expect(journalRecord?.state).toBe('UNCERTAIN')
    expect(journalRecord?.executionRef).toBeNull()
    expect(journalRecord?.resultDigest).toBeNull()
  })
})

describe('AAA-10 T-08: concurrent attempts on the same operationKey', () => {
  it('produces at most one effect and denies the loser with operation_in_progress', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-runtime-journal-'))
    temporaryDirectories.push(directory)
    const store = new InMemoryApprovalStore()
    let releaseFirstTool!: () => void
    const firstToolGate = new Promise<void>((resolve) => {
      releaseFirstTool = resolve
    })
    let firstEnteredTool!: () => void
    const firstInTool = new Promise<void>((resolve) => {
      firstEnteredTool = resolve
    })
    const first = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new FileEffectJournal({ directory, clock: () => NOW }),
      store,
      toolExecutor: async () => {
        firstEnteredTool()
        await firstToolGate
        return { result: { ok: true, winner: true } }
      }
    })
    const second = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new FileEffectJournal({ directory, clock: () => NOW }),
      store
    })
    const firstApproval = await requestApproval(first, {
      idempotencyKey: 'shared-operation'
    })
    const secondApproval = await requestApproval(second, {
      idempotencyKey: 'shared-operation'
    })
    approveApproval(first, firstApproval)
    approveApproval(second, secondApproval)

    // The winner holds the journal EFFECT_STARTED lease while the loser
    // attempts the same operation key, so the in_progress outcome is
    // deterministic instead of depending on event-loop timing.
    const firstTurn = first.runtime.runTurn(
      turnInput({
        approvalId: firstApproval,
        idempotencyKey: 'shared-operation'
      })
    )
    await firstInTool
    const secondResult = await second.runtime.runTurn(
      turnInput({
        approvalId: secondApproval,
        idempotencyKey: 'shared-operation'
      })
    )
    expect(secondResult.outcome).toBe('denied')
    expect(secondResult.reason).toBe('operation_in_progress')
    expect(second.toolExecutor).not.toHaveBeenCalled()

    releaseFirstTool()
    const firstResult = await firstTurn
    expect(firstResult.outcome).toBe('executed')

    const toolCalls =
      first.toolExecutor.mock.calls.length +
      second.toolExecutor.mock.calls.length
    expect(toolCalls).toBe(1)
  })
})

describe('AAA-10 T-14: restart between confirmEffect and approval.confirm', () => {
  it('concludes the approval confirmation without repeating the effect', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cvg-runtime-journal-'))
    temporaryDirectories.push(directory)
    const store = new InMemoryApprovalStore()
    const journal = new FileEffectJournal({ directory, clock: () => NOW })
    const crashed = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      store
    })
    const approvalId = await requestApproval(crashed)
    approveApproval(crashed, approvalId)
    const { stored } = reserveBinding(crashed, approvalId, 60_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-confirmed',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-confirmed'
    })
    await journal.confirmEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-confirmed',
      executionRef: 'exec_recovered_1',
      resultDigest: 'd'.repeat(64)
    })
    expect(crashed.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')

    const restarted = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new FileEffectJournal({ directory, clock: () => NOW }),
      store
    })
    const result = await restarted.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(result.replayed).toBe(true)
    expect(result.executionRef).toBe('exec_recovered_1')
    expect(result.resultDigest).toBe('d'.repeat(64))
    expect(restarted.toolExecutor).not.toHaveBeenCalled()
    const record = restarted.approvals.get(TENANT, approvalId)
    expect(record.status).toBe('EXECUTED')
    expect(record.executionRef).toBe('exec_recovered_1')
    expect(restarted.outbox).toHaveBeenCalledTimes(1)
    expect(restarted.outbox.mock.calls[0]?.[0].idempotencyKey).toBe(
      operationKey
    )
  })
})

describe('AAA-10 T-15: operationKey reuse with a different proposal', () => {
  it('denies idempotency_key_reuse with zero new effect', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW }),
      responses: [
        JSON.stringify({ text: 'FIRST_PROPOSAL' }),
        JSON.stringify({ text: 'SECOND_PROPOSAL' })
      ]
    })
    const firstApproval = await requestApproval(harness, {
      idempotencyKey: 'caller-key-1'
    })
    approveApproval(harness, firstApproval)
    const first = await harness.runtime.runTurn(
      turnInput({ approvalId: firstApproval, idempotencyKey: 'caller-key-1' })
    )
    expect(first.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)

    const secondApproval = await requestApproval(harness, {
      idempotencyKey: 'caller-key-1'
    })
    approveApproval(harness, secondApproval)
    const second = await harness.runtime.runTurn(
      turnInput({ approvalId: secondApproval, idempotencyKey: 'caller-key-1' })
    )

    expect(second.outcome).toBe('denied')
    expect(second.reason).toBe('idempotency_key_reuse')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, secondApproval).status).toBe(
      'APPROVED'
    )
  })
})

describe('AAA-10 T-17: idempotencyKey equals operationKey across replay', () => {
  it('preserves the op: key when a retry replays a confirmed effect', async () => {
    let outboxCalls = 0
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW }),
      outbox: async (event) => {
        outboxCalls += 1
        if (outboxCalls === 1) throw new Error('synthetic outbox outage')
        return { eventId: `evt_${event.idempotencyKey}` }
      }
    })
    const approvalId = await requestApproval(harness, {
      idempotencyKey: 'caller-op-7'
    })
    approveApproval(harness, approvalId)

    const first = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: 'caller-op-7' })
    )
    expect(first.outcome).toBe('executed')
    expect(first.outboxPending).toBe(true)
    const second = await harness.runtime.runTurn(
      turnInput({ approvalId, idempotencyKey: 'caller-op-7' })
    )
    expect(second.outcome).toBe('executed')
    expect(second.replayed).toBe(true)
    const expectedKey = expectedCallerOperationKey('caller-op-7')
    expect(
      harness.outbox.mock.calls.map(([event]) => event.idempotencyKey)
    ).toEqual([expectedKey, expectedKey])
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
  })
})

describe('AAA-10 T-18: start-of-turn releaseExpired sweep', () => {
  it('returns an expired RESERVED attempt to APPROVED and never executes', async () => {
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
    const { stored } = reserveBinding(harness, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-reserved',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    now = new Date(now.getTime() + 2_000)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, limits: { maxToolCalls: 0 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tool_calls_exhausted')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'ABANDONED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('turns an expired EFFECT_STARTED attempt UNCERTAIN and never executes', async () => {
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
    const { stored } = reserveBinding(harness, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-started',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-started'
    })
    now = new Date(now.getTime() + 2_000)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'UNCERTAIN'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('P2-1: start-of-turn approval releaseExpired sweep', () => {
  it('releases an orphaned expired RESERVED reservation to APPROVED at the next turn start', async () => {
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
    const { stored } = reserveBinding(harness, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-orphan',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    now = new Date(now.getTime() + 2_000)

    // The turn targets a different approval, so only the tenant-wide sweep can
    // recover the orphan.
    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('approval_required')
    expect(result.approvalId).not.toBe(approvalId)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'ABANDONED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('keeps an expired legacy reservation without a persisted operationKey UNCERTAIN', async () => {
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
    reserveBinding(harness, approvalId, 1_000)
    now = new Date(now.getTime() + 2_000)

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('approval_required')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks an expired reservation with EFFECT_STARTED uncertainty UNCERTAIN', async () => {
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
    const { stored } = reserveBinding(harness, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-started',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-started'
    })
    now = new Date(now.getTime() + 2_000)

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('approval_required')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'UNCERTAIN'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('fails closed with approval_sweep_failed and no effect when the approval sweep throws', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => {
      throw new Error('synthetic approval sweep outage')
    })

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_sweep_failed')
    expect(harness.providerCalls()).toBe(0)
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('never releases when the effect journal lookup fails', async () => {
    let now = NOW
    const journal = new ThrowingLookupJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 1_000)
    now = new Date(now.getTime() + 2_000)

    const result = await harness.runtime.runTurn(turnInput())

    expect(result.outcome).toBe('approval_required')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('exports a periodic tenant sweep helper that never executes effects', async () => {
    let now = NOW
    const journal = new InMemoryEffectJournal({ clock: () => now })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal,
      clock: () => now,
      reservationTtlMs: 1_000,
      responses: [
        JSON.stringify({ text: 'RELEASED_PAYLOAD' }),
        JSON.stringify({ text: 'UNCERTAIN_PAYLOAD' })
      ]
    })
    const releasedId = await requestApproval(harness)
    approveApproval(harness, releasedId)
    const released = reserveBinding(harness, releasedId, 1_000)
    const releasedKey = expectedDerivedOperationKey(
      released.stored.proposalHash ?? ''
    )
    await journal.reserve({
      tenantId: TENANT,
      operationKey: releasedKey,
      proposalHash: released.stored.proposalHash ?? '',
      attemptId: 'attempt-helper-released',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    const uncertainId = await requestApproval(harness)
    approveApproval(harness, uncertainId)
    const { stored } = reserveBinding(harness, uncertainId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await journal.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-helper',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-helper'
    })
    now = new Date(now.getTime() + 2_000)

    const counters = await sweepExpiredApprovals({
      approvals: harness.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now,
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 1, uncertain: 1 })
    expect(harness.approvals.get(TENANT, releasedId).status).toBe('APPROVED')
    expect(harness.approvals.get(TENANT, uncertainId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('AAA-10 honesty: effect confirmed but approval confirmation failed', () => {
  it('returns approval_confirm_failed with effectConfirmed true', async () => {
    const journal = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    vi.spyOn(harness.approvals, 'confirm').mockImplementationOnce(() => {
      throw new ApprovalError('invalid_state', 'synthetic confirm failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    await expect(journal.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'CONFIRMED'
    })
  })
})
