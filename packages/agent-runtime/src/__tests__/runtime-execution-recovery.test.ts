import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  ApprovalEngine,
  ApprovalError,
  InMemoryApprovalStore,
  type ApprovalRecord
} from '@cvg/approval-engine'
import { canonicalizeJson } from '@cvg/shared'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type {
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '@cvg/model-gateway'
import { PolicyEngine, type Capability } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import { GovernedAgentRuntime, sweepExpiredApprovals } from '../runtime.ts'
import {
  EffectJournalError,
  InMemoryEffectJournal,
  type EffectAttemptRef,
  type EffectConfirmRef,
  type EffectFailRef,
  type EffectJournalPort,
  type EffectRecord,
  type EffectReconcileRef,
  type EffectReserveInput,
  type EffectReserveOutcome,
  type EffectUncertainRef
} from '../effect-journal.ts'
import { ToolExecutionError } from '../contracts.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000021'
const AGENT = 'agent_00000000-0000-4000-8000-000000000021'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000021'
const NOW = new Date('2026-09-13T12:00:00.000Z')
const PAYLOAD_SCHEMA = z.object({ text: z.string() })

const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

interface HarnessOptions {
  responses?: readonly string[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
  clock?: () => Date
  runtimeClock?: () => Date
  omitClock?: boolean
  journal?: EffectJournalPort
  reservationTtlMs?: number
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
  store?: InMemoryApprovalStore
  respond?: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>
}

function buildHarness(options: HarnessOptions = {}) {
  const clock = options.clock ?? (() => NOW)
  const runtimeClock = options.runtimeClock ?? clock
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'recovery-core',
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
    respond: (request) => {
      providerCalls += 1
      if (options.respond !== undefined) return options.respond(request)
      const index = Math.min(providerCalls - 1, responses.length - 1)
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
    clock,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({ documents: [], clock })
  const store = options.store ?? new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock })
  const telemetry = new InMemoryTelemetry({ clock })
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
    ...(options.omitClock === true ? {} : { clock: runtimeClock }),
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
    prompt: { promptId: 'recovery-core', version: '1.0.0' },
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

function persistedOperationKeyFor(
  harness: Harness,
  approvalId: string
): string {
  const stored = harness.approvals.get(TENANT, approvalId)
  return expectedDerivedOperationKey(stored.proposalHash ?? '')
}

function reserveBinding(
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

async function seedJournal(
  journal: InMemoryEffectJournal,
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
}

class JournalProxy implements EffectJournalPort {
  readonly inner: EffectJournalPort
  constructor(inner: EffectJournalPort) {
    this.inner = inner
  }
  reserve(input: EffectReserveInput): Promise<EffectReserveOutcome> {
    return this.inner.reserve(input)
  }
  markEffectStarted(ref: EffectAttemptRef): Promise<EffectRecord> {
    return this.inner.markEffectStarted(ref)
  }
  confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord> {
    return this.inner.confirmEffect(ref)
  }
  failEffect(ref: EffectFailRef): Promise<EffectRecord> {
    return this.inner.failEffect(ref)
  }
  markUncertain(ref: EffectUncertainRef): Promise<EffectRecord> {
    return this.inner.markUncertain(ref)
  }
  get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord | undefined> {
    return this.inner.get(tenantId, operationKey)
  }
  releaseExpired(now: Date, ttlMs: number): Promise<number> {
    return this.inner.releaseExpired(now, ttlMs)
  }
  reconcile(ref: EffectReconcileRef): Promise<EffectRecord> {
    return this.inner.reconcile(ref)
  }
}

class NoSweepJournal extends JournalProxy {
  override async releaseExpired(): Promise<number> {
    return 0
  }
}

class ThrowingGetJournal extends JournalProxy {
  override async get(): Promise<EffectRecord | undefined> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic journal get failure'
    )
  }
}

class StaticGetJournal extends JournalProxy {
  readonly #record: EffectRecord | undefined
  constructor(inner: EffectJournalPort, record: EffectRecord | undefined) {
    super(inner)
    this.#record = record
  }
  override async get(): Promise<EffectRecord | undefined> {
    return this.#record
  }
}

class AbortingGetJournal extends JournalProxy {
  readonly #controller: AbortController
  readonly #record: EffectRecord
  constructor(
    inner: EffectJournalPort,
    controller: AbortController,
    record: EffectRecord
  ) {
    super(inner)
    this.#controller = controller
    this.#record = record
  }
  override async get(): Promise<EffectRecord | undefined> {
    this.#controller.abort()
    return this.#record
  }
}

class ThrowingReserveJournal extends JournalProxy {
  readonly #error: Error
  constructor(
    inner: EffectJournalPort,
    error: Error = new EffectJournalError(
      'journal_unavailable',
      'synthetic journal reserve failure'
    )
  ) {
    super(inner)
    this.#error = error
  }
  override async reserve(): Promise<EffectReserveOutcome> {
    throw this.#error
  }
}

class AbortingReserveJournal extends JournalProxy {
  readonly #controller: AbortController
  constructor(inner: EffectJournalPort, controller: AbortController) {
    super(inner)
    this.#controller = controller
  }
  override async reserve(
    input: EffectReserveInput
  ): Promise<EffectReserveOutcome> {
    const outcome = await this.inner.reserve(input)
    this.#controller.abort()
    return outcome
  }
}

class AbortingMarkStartedJournal extends JournalProxy {
  readonly #controller: AbortController
  constructor(inner: EffectJournalPort, controller: AbortController) {
    super(inner)
    this.#controller = controller
  }
  override async markEffectStarted(
    ref: EffectAttemptRef
  ): Promise<EffectRecord> {
    const record = await this.inner.markEffectStarted(ref)
    this.#controller.abort()
    return record
  }
}

class ThrowingMarkStartedJournal extends JournalProxy {
  readonly #error: Error
  constructor(
    inner: EffectJournalPort,
    error: Error = new EffectJournalError(
      'journal_unavailable',
      'synthetic markEffectStarted failure'
    )
  ) {
    super(inner)
    this.#error = error
  }
  override async markEffectStarted(): Promise<EffectRecord> {
    throw this.#error
  }
}

class ThrowingMarkStartedAndFailJournal extends JournalProxy {
  override async markEffectStarted(): Promise<EffectRecord> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic markEffectStarted failure'
    )
  }
  override async failEffect(): Promise<EffectRecord> {
    throw new EffectJournalError(
      'journal_unavailable',
      'synthetic failEffect failure'
    )
  }
}

class AbortingConfirmJournal extends JournalProxy {
  readonly #controller: AbortController
  constructor(inner: EffectJournalPort, controller: AbortController) {
    super(inner)
    this.#controller = controller
  }
  override async confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord> {
    const record = await this.inner.confirmEffect(ref)
    this.#controller.abort()
    return record
  }
}

class ThrowingConfirmJournal extends JournalProxy {
  readonly #error: Error
  constructor(
    inner: EffectJournalPort,
    error: Error = new EffectJournalError(
      'journal_unavailable',
      'synthetic confirmEffect failure'
    )
  ) {
    super(inner)
    this.#error = error
  }
  override async confirmEffect(): Promise<EffectRecord> {
    throw this.#error
  }
}

class ThrowingFailJournal extends JournalProxy {
  readonly #error: Error
  constructor(
    inner: EffectJournalPort,
    error: Error = new EffectJournalError(
      'journal_unavailable',
      'synthetic failEffect failure'
    )
  ) {
    super(inner)
    this.#error = error
  }
  override async failEffect(): Promise<EffectRecord> {
    throw this.#error
  }
}

describe('execution header fencing', () => {
  it('denies an unknown approval with not_found before any side effect', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId: 'appr_missing' })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('not_found')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('maps an unexpected approval read failure to approval_invalid', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    vi.spyOn(harness.approvals, 'get').mockImplementation(() => {
      throw new Error('synthetic approval store outage')
    })

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId: 'appr_any' })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies already_executed without a journal and never re-executes', async () => {
    const store = new InMemoryApprovalStore()
    const withJournal = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW }),
      store
    })
    const approvalId = await requestApproval(withJournal)
    approveApproval(withJournal, approvalId)
    const executed = await withJournal.runtime.runTurn(
      turnInput({ approvalId })
    )
    expect(executed.outcome).toBe('executed')

    const withoutJournal = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      store
    })
    const result = await withoutJournal.runtime.runTurn(
      turnInput({ approvalId })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_executed')
    expect(withoutJournal.toolExecutor).not.toHaveBeenCalled()
    expect(withoutJournal.outbox).not.toHaveBeenCalled()
  })

  it('denies a tenant mismatch on the persisted approval', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const record = harness.approvals.get(TENANT, approvalId)
    const originalGet = harness.approvals.get.bind(harness.approvals)
    vi.spyOn(harness.approvals, 'get').mockImplementation((tenant, id) =>
      id === approvalId
        ? { ...record, tenantId: 'tenant_other_synthetic' }
        : originalGet(tenant, id)
    )

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('tenant_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies an action mismatch on the persisted approval', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const record = harness.approvals.get(TENANT, approvalId)
    vi.spyOn(harness.approvals, 'get').mockImplementation(() => ({
      ...record,
      action: 'appointment.reschedule'
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('action_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies a resource id mismatch in both directions', async () => {
    const missingId = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const missingIdApproval = await requestApproval(missingId)
    approveApproval(missingId, missingIdApproval)
    const missingIdRecord = missingId.approvals.get(TENANT, missingIdApproval)
    vi.spyOn(missingId.approvals, 'get').mockImplementation(() => ({
      ...missingIdRecord,
      resource: { type: 'appointment' }
    }))

    const missingResult = await missingId.runtime.runTurn(
      turnInput({ approvalId: missingIdApproval })
    )
    expect(missingResult.outcome).toBe('denied')
    expect(missingResult.reason).toBe('resource_mismatch')

    const extraId = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const extraIdApproval = await requestApproval(extraId)
    approveApproval(extraId, extraIdApproval)
    const extraResult = await extraId.runtime.runTurn(
      turnInput({
        approvalId: extraIdApproval,
        resource: { type: 'appointment', tenantId: TENANT }
      })
    )
    expect(extraResult.outcome).toBe('denied')
    expect(extraResult.reason).toBe('resource_mismatch')
    expect(extraId.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies a capability divergence on the persisted approval', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const record = harness.approvals.get(TENANT, approvalId)
    vi.spyOn(harness.approvals, 'get').mockImplementation(() => ({
      ...record,
      capability: 'appointment.create'
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('proposal_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies a missing proposal hash as proposal_missing', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const record = harness.approvals.get(TENANT, approvalId)
    vi.spyOn(harness.approvals, 'get').mockImplementation(
      () =>
        ({
          ...record,
          proposalHash: undefined
        }) as unknown as typeof record
    )

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('proposal_missing')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies a non-canonicalizable proposal payload as payload_mismatch', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const record = harness.approvals.get(TENANT, approvalId)
    vi.spyOn(harness.approvals, 'get').mockImplementation(
      () =>
        ({
          ...record,
          proposalPayload: 1n
        }) as unknown as typeof record
    )

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('payload_mismatch')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies an UNCERTAIN approval with operation_uncertain and zero effect', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { reservation } = reserveBinding(harness, approvalId, 60_000)
    harness.approvals.markUncertain({
      tenantId: TENANT,
      approvalId,
      reservationId: reservation.reservationId,
      reason: 'synthetic ambiguity'
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('denies terminal REJECTED, FAILED and EXPIRED approvals with invalid_state', async () => {
    const rejected = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const rejectedId = await requestApproval(rejected)
    rejected.approvals.submit(TENANT, rejectedId, 'op_1')
    rejected.approvals.reject(TENANT, rejectedId, { approverId: 'op_2' })
    const rejectedResult = await rejected.runtime.runTurn(
      turnInput({ approvalId: rejectedId })
    )
    expect(rejectedResult.outcome).toBe('denied')
    expect(rejectedResult.reason).toBe('invalid_state')

    const failed = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const failedId = await requestApproval(failed)
    approveApproval(failed, failedId)
    const failedBinding = reserveBinding(failed, failedId, 60_000)
    failed.approvals.fail({
      tenantId: TENANT,
      approvalId: failedId,
      reservationId: failedBinding.reservation.reservationId,
      evidence: {
        outcome: 'no_effect',
        source: 'adapter',
        evidenceRef: 'evidence://synthetic/failed'
      }
    })
    const failedResult = await failed.runtime.runTurn(
      turnInput({ approvalId: failedId })
    )
    expect(failedResult.outcome).toBe('denied')
    expect(failedResult.reason).toBe('invalid_state')

    const expired = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const expiredId = await requestApproval(expired)
    expired.store.update(TENANT, expiredId, 'REQUESTED', (current) => ({
      ...current,
      status: 'EXPIRED'
    }))
    const expiredResult = await expired.runtime.runTurn(
      turnInput({ approvalId: expiredId })
    )
    expect(expiredResult.outcome).toBe('denied')
    expect(expiredResult.reason).toBe('invalid_state')

    expect(rejected.toolExecutor).not.toHaveBeenCalled()
    expect(failed.toolExecutor).not.toHaveBeenCalled()
    expect(expired.toolExecutor).not.toHaveBeenCalled()
  })

  it('shadows an approved execution without any tool or outbox call', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, shadowMode: true })
    )

    expect(result.outcome).toBe('shadowed')
    expect(result.reason).toBe('shadow_mode')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('idempotent replay fencing', () => {
  async function executedHarness() {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const executed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    expect(executed.resultDigest).toBeDefined()
    const record = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(record.proposalHash ?? '')
    const journalRecord = await inner.get(TENANT, operationKey)
    expect(journalRecord?.state).toBe('CONFIRMED')
    return { inner, store, approvalId, journalRecord }
  }

  it('falls back to already_executed when the journal replay read fails', async () => {
    const base = await executedHarness()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingGetJournal(base.inner),
      store: base.store
    })

    const result = await replay.runtime.runTurn(
      turnInput({ approvalId: base.approvalId })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_executed')
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })

  it('requires a CONFIRMED journal state for replay', async () => {
    const base = await executedHarness()
    expect(base.journalRecord).toBeDefined()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(base.inner, {
        ...(base.journalRecord as EffectRecord),
        state: 'RESERVED'
      }),
      store: base.store
    })

    const result = await replay.runtime.runTurn(
      turnInput({ approvalId: base.approvalId })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_executed')
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })

  it('requires the replay journal hash to match the approval hash', async () => {
    const base = await executedHarness()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(base.inner, {
        ...(base.journalRecord as EffectRecord),
        proposalHash: 'f'.repeat(64)
      }),
      store: base.store
    })

    const result = await replay.runtime.runTurn(
      turnInput({ approvalId: base.approvalId })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_executed')
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })

  it('reports an honest replay denial with effectConfirmed when cancelled during replay', async () => {
    const base = await executedHarness()
    const controller = new AbortController()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingGetJournal(
        base.inner,
        controller,
        base.journalRecord as EffectRecord
      ),
      store: base.store
    })

    const result = await replay.runtime.runTurn(
      turnInput({
        approvalId: base.approvalId,
        cancelSignal: controller.signal
      })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(result.replayed).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(result.executionRef).toBeDefined()
    expect(result.resultDigest).toBeDefined()
    expect(replay.outbox).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN and denies when the replay approval confirmation fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-replay-confirm',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-replay-confirm'
    })
    await inner.confirmEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-replay-confirm',
      executionRef: 'exec_replay_1',
      resultDigest: 'd'.repeat(64)
    })
    vi.spyOn(harness.approvals, 'confirm').mockImplementationOnce(() => {
      throw new ApprovalError('invalid_state', 'synthetic confirm failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(result.executionRef).toBe('exec_replay_1')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })
})

describe('reservation recovery and lease fencing', () => {
  it('fails closed when the journal lookup fails during recovery', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingGetJournal(inner),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('turns an UNCERTAIN journal record into an honest approval UNCERTAIN', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-uncertain',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await inner.markUncertain({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-uncertain',
      reason: 'synthetic ambiguity'
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN when an EFFECT_STARTED lease expired without confirmation', async () => {
    let now = new Date(NOW.getTime())
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new NoSweepJournal(inner),
      store,
      clock: () => now
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 1_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-expired-lease',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-expired-lease'
    })
    now = new Date(now.getTime() + 2_000)
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => ({
      released: 0,
      uncertain: 0
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('keeps a live EFFECT_STARTED lease fenced with operation_in_progress', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-live',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-live'
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_in_progress')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('re-arms an ABANDONED record through recovery and executes exactly once', async () => {
    let now = new Date(NOW.getTime())
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new NoSweepJournal(inner),
      store,
      clock: () => now
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 1_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-abandoned',
      expiresAt: new Date(now.getTime() + 1_000).toISOString()
    })
    const abandonedNow = new Date(now.getTime() + 2_000)
    await inner.releaseExpired(abandonedNow, 1_000)
    await expect(inner.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'ABANDONED'
    })
    now = abandonedNow
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => ({
      released: 0,
      uncertain: 0
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')
    await expect(inner.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'CONFIRMED',
      attemptId: expect.not.stringMatching('attempt-abandoned')
    })
  })

  it('denies already_reserved when recovery lacks a reservation token', async () => {
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_reserved')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies with the journal error when the re-arm reserve fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingReserveJournal(inner),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId),
      executing: false
    })
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('turns a re-arm UNCERTAIN outcome into approval UNCERTAIN', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(inner, undefined),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId),
      executing: false
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-rearm-uncertain',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await inner.markUncertain({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-rearm-uncertain',
      reason: 'synthetic ambiguity'
    })
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('fails the re-armed journal and releases the approval when cancelled mid-rearm', async () => {
    const controller = new AbortController()
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingReserveJournal(inner, controller),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await inner.reserve({
      tenantId: TENANT,
      operationKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'attempt-rearm-stop',
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString()
    })
    await inner.failEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-rearm-stop',
      errorCode: 'synthetic_pre_effect'
    })
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    await expect(inner.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'EFFECT_FAILED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies already_reserved when releasing the re-armed approval fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-rearm-release',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.failEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-rearm-release',
      errorCode: 'synthetic_pre_effect'
    })
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })
    vi.spyOn(harness.approvals, 'release').mockImplementation(() => {
      throw new ApprovalError('invalid_state', 'synthetic release failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_reserved')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('propagates an invalid_state when the second approval reserve fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-second-reserve',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.failEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-second-reserve',
      errorCode: 'synthetic_pre_effect'
    })
    vi.spyOn(harness.approvals, 'reserve')
      .mockImplementationOnce(() => {
        throw new ApprovalError(
          'already_reserved',
          'synthetic concurrent reserve'
        )
      })
      .mockImplementationOnce(() => {
        throw new ApprovalError('invalid_state', 'synthetic second reserve')
      })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('invalid_state')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('journal reservation outcomes in the execution turn', () => {
  it('turns a journal UNCERTAIN outcome into approval UNCERTAIN', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-uncertain-reserve',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.markUncertain({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-uncertain-reserve',
      reason: 'synthetic ambiguity'
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('operation_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies the concurrent loser with operation_in_progress deterministically', async () => {
    let releaseWinner!: () => void
    const winnerGate = new Promise<void>((resolve) => {
      releaseWinner = resolve
    })
    let winnerEnteredTool!: () => void
    const winnerInTool = new Promise<void>((resolve) => {
      winnerEnteredTool = resolve
    })
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const winner = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store,
      toolExecutor: async () => {
        winnerEnteredTool()
        await winnerGate
        return { result: { ok: true, winner: true } }
      }
    })
    const winnerApproval = await requestApproval(winner)
    approveApproval(winner, winnerApproval)
    const loser = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const loserApproval = await requestApproval(loser)
    approveApproval(loser, loserApproval)

    const winnerTurn = winner.runtime.runTurn(
      turnInput({ approvalId: winnerApproval })
    )
    await winnerInTool
    const loserResult = await loser.runtime.runTurn(
      turnInput({ approvalId: loserApproval })
    )

    expect(loserResult.outcome).toBe('denied')
    expect(loserResult.reason).toBe('operation_in_progress')
    expect(loser.toolExecutor).not.toHaveBeenCalled()
    expect(loser.approvals.get(TENANT, loserApproval).status).toBe('APPROVED')

    releaseWinner()
    const winnerResult = await winnerTurn
    expect(winnerResult.outcome).toBe('executed')
    expect(winner.toolExecutor).toHaveBeenCalledTimes(1)
  })

  it('releases the approval reservation when the journal reserve fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingReserveJournal(inner),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('fails the fresh reservation and releases it when cancelled after journal reserve', async () => {
    const controller = new AbortController()
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingReserveJournal(inner, controller),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })
})

describe('post-start and confirmation fencing', () => {
  it('marks journal and approval UNCERTAIN when cancelled after effect start', async () => {
    const controller = new AbortController()
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingMarkStartedJournal(inner, controller)
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    const record = harness.approvals.get(TENANT, approvalId)
    expect(record.reservationId).toBeDefined()
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('fails the journal record and releases the approval when markEffectStarted fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingMarkStartedJournal(inner)
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    await expect(inner.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'EFFECT_FAILED'
    })
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('still releases the approval when markEffectStarted and failEffect both fail', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingMarkStartedAndFailJournal(inner)
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies when markExecuting fails before the effect starts', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'markExecuting').mockImplementation(() => {
      throw new ApprovalError(
        'invalid_state',
        'synthetic markExecuting failure'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('invalid_state')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN when the tool result is not canonicalizable', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      toolExecutor: async () => ({ result: 1n })
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(result.toolResult).toBe(1n)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN when confirmEffect fails after the tool executed', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingConfirmJournal(inner)
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('reports effectConfirmed and outboxPending when cancelled after journal confirm', async () => {
    const controller = new AbortController()
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingConfirmJournal(inner, controller)
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(result.executionRef).toBeDefined()
    expect(result.resultDigest).toBeDefined()
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.outbox).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
  })

  it('marks UNCERTAIN when the tool throws after cancellation', async () => {
    const controller = new AbortController()
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      toolExecutor: async () => {
        controller.abort()
        throw new Error('synthetic late tool failure')
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('tool failure certainty handling', () => {
  it('marks UNCERTAIN when a no_effect failure cannot be journaled', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingFailJournal(inner),
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })

  it('denies with the release error when a no_effect approval release fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'release').mockImplementation(() => {
      throw new ApprovalError('invalid_state', 'synthetic release failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('invalid_state')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
  })

  it('marks UNCERTAIN with effect_possibly_started evidence for effect_started failures', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_transport_lost',
          'synthetic transport loss',
          { certainty: 'effect_started' }
        )
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })

  it('denies with the approval error when marking UNCERTAIN fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      toolExecutor: async () => {
        throw new Error('synthetic ambiguous transport failure')
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'markUncertain').mockImplementation(() => {
      throw new ApprovalError(
        'invalid_state',
        'synthetic markUncertain failure'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('invalid_state')
    expect(harness.outbox).not.toHaveBeenCalled()
  })
})

describe('approval sweep evidence resolution', () => {
  function buildSweepHarness(proposalHash?: string) {
    let now = new Date(NOW.getTime())
    const store = new InMemoryApprovalStore()
    const approvals = new ApprovalEngine({ store, clock: () => now })
    const requested = approvals.request({
      tenantId: TENANT,
      operatorId: 'op_1',
      agentId: AGENT,
      agentVersion: 'v1',
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: { text: 'sweep' },
      policyVersion: 'policy-v1',
      correlationId: CORRELATION,
      expiresInMs: 60_000,
      capability: 'appointment.cancel',
      ...(proposalHash !== undefined ? { proposalHash } : {})
    })
    approvals.submit(TENANT, requested.approvalId, 'op_1')
    approvals.approve(TENANT, requested.approvalId, { approverId: 'op_2' })
    approvals.reserve({
      tenantId: TENANT,
      approvalId: requested.approvalId,
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: { text: 'sweep' },
      agentId: AGENT,
      agentVersion: 'v1',
      policyVersion: 'policy-v1',
      capability: 'appointment.cancel',
      ttlMs: 1_000
    })
    now = new Date(now.getTime() + 2_000)
    return {
      approvals,
      approvalId: requested.approvalId,
      now: () => now,
      advance: (ms: number) => {
        now = new Date(now.getTime() + ms)
      }
    }
  }

  it('keeps a legacy reservation without proposal identity UNCERTAIN', async () => {
    const base = buildSweepHarness()
    const journal = new InMemoryEffectJournal({ clock: base.now })

    const counters = await sweepExpiredApprovals({
      approvals: base.approvals,
      effectJournal: new NoSweepJournal(journal),
      tenantId: TENANT,
      now: base.now(),
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
    expect(base.approvals.get(TENANT, base.approvalId).status).toBe('UNCERTAIN')
  })

  it('keeps a reservation without a proposal hash UNCERTAIN', async () => {
    const base = buildSweepHarness('a'.repeat(64))
    const record = base.approvals.get(TENANT, base.approvalId)
    const withoutHash = { ...record, proposalHash: undefined }
    const journal = new StaticGetJournal(
      new InMemoryEffectJournal({ clock: base.now }),
      withoutHash as unknown as EffectRecord
    )

    const counters = await sweepExpiredApprovals({
      approvals: base.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: base.now(),
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
  })

  it('ignores a journal record bound to a different proposal hash', async () => {
    const base = buildSweepHarness('a'.repeat(64))
    const journal = new StaticGetJournal(
      new InMemoryEffectJournal({ clock: base.now }),
      {
        tenantId: TENANT,
        operationKey: 'op:other',
        proposalHash: 'b'.repeat(64),
        attemptId: 'attempt-other',
        state: 'RESERVED',
        executionRef: null,
        resultDigest: null,
        errorCode: null,
        reason: null,
        expiresAt: new Date(base.now().getTime() + 60_000).toISOString(),
        reconciledBy: null,
        reconciliationEvidenceRef: null,
        createdAt: base.now().toISOString(),
        updatedAt: base.now().toISOString(),
        revision: 1
      }
    )

    const counters = await sweepExpiredApprovals({
      approvals: base.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: base.now(),
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
  })

  it('keeps the reservation UNCERTAIN when the journal lookup fails', async () => {
    const base = buildSweepHarness('a'.repeat(64))
    const journal = new ThrowingGetJournal(
      new InMemoryEffectJournal({ clock: base.now })
    )

    const counters = await sweepExpiredApprovals({
      approvals: base.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: base.now(),
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 0, uncertain: 1 })
  })

  it('releases a reservation to APPROVED when the journal proves no effect', async () => {
    const base = buildSweepHarness('a'.repeat(64))
    const journal = new StaticGetJournal(
      new InMemoryEffectJournal({ clock: base.now }),
      {
        tenantId: TENANT,
        operationKey: 'op:any',
        proposalHash: 'a'.repeat(64),
        attemptId: 'attempt-safe',
        state: 'ABANDONED',
        executionRef: null,
        resultDigest: null,
        errorCode: null,
        reason: 'reservation_expired',
        expiresAt: new Date(base.now().getTime() - 1_000).toISOString(),
        reconciledBy: null,
        reconciliationEvidenceRef: null,
        createdAt: base.now().toISOString(),
        updatedAt: base.now().toISOString(),
        revision: 1
      }
    )

    const counters = await sweepExpiredApprovals({
      approvals: base.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: base.now(),
      ttlMs: 1_000
    })

    expect(counters).toEqual({ released: 1, uncertain: 0 })
    expect(base.approvals.get(TENANT, base.approvalId).status).toBe('APPROVED')
  })
})

function armedStepClock(stepMs: number): {
  clock: () => Date
  arm: () => void
} {
  let armed = false
  let call = 0
  return {
    clock: () => {
      if (!armed) return NOW
      const value = new Date(NOW.getTime() + call * stepMs)
      call += 1
      return value
    },
    arm: () => {
      armed = true
      call = 0
    }
  }
}

describe('kernel edge branches: stop checkpoints, generic faults and null evidence', () => {
  it('denies loop_deadline_exceeded at the pre-tool checkpoint', async () => {
    const stepped = armedStepClock(20)
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new InMemoryEffectJournal({ clock: () => NOW }),
      runtimeClock: stepped.clock
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    stepped.arm()

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 100 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('denies loop_deadline_exceeded right after reservation recovery', async () => {
    const stepped = armedStepClock(20)
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store,
      runtimeClock: stepped.clock
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-step-recovery',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-step-recovery'
    })
    stepped.arm()

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 120 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('denies loop_deadline_exceeded at the tool-stage boundary after effect start', async () => {
    const stepped = armedStepClock(20)
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      runtimeClock: stepped.clock
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    stepped.arm()

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 160 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('denies the replay outbox stage after a confirmed replay under deadline', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const base = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(base)
    approveApproval(base, approvalId)
    const executed = await base.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')

    const stepped = armedStepClock(20)
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store,
      runtimeClock: stepped.clock
    })
    stepped.arm()
    const result = await replay.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 120 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(result.replayed).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(replay.outbox).not.toHaveBeenCalled()
  })

  it('denies a replay through the reserve path when the approval has no reservation', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-replay-no-reservation',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-replay-no-reservation'
    })
    await inner.confirmEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-replay-no-reservation',
      executionRef: 'exec_replay_no_reservation',
      resultDigest: 'd'.repeat(64)
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(result.executionRef).toBe('exec_replay_no_reservation')
    expect(result.resultDigest).toBe('d'.repeat(64))
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('completes a journal replay through the recovery reserve path', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-rearm-replay',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-rearm-replay'
    })
    await inner.confirmEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-rearm-replay',
      executionRef: 'exec_rearm_replay',
      resultDigest: 'e'.repeat(64)
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(result.reason).toBe('idempotent_replay')
    expect(result.replayed).toBe(true)
    expect(result.executionRef).toBe('exec_rearm_replay')
    expect(result.resultDigest).toBe('e'.repeat(64))
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.outbox).toHaveBeenCalledTimes(1)
  })

  it('replays a CONFIRMED record without digest or executionRef', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const executed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const confirmed = await inner.get(TENANT, operationKey)
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(inner, {
        ...(confirmed as EffectRecord),
        executionRef: null,
        resultDigest: null
      }),
      store
    })

    const result = await replay.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(result.replayed).toBe(true)
    expect(result.executionRef).toMatch(/^exec_/)
    expect(result.resultDigest).toBeUndefined()
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })

  it('reports replay honesty when cancelled during a record without digest', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const executed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const confirmed = await inner.get(TENANT, operationKey)
    const controller = new AbortController()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new AbortingGetJournal(inner, controller, {
        ...(confirmed as EffectRecord),
        executionRef: null,
        resultDigest: null
      }),
      store
    })

    const result = await replay.runtime.runTurn(
      turnInput({ approvalId, cancelSignal: controller.signal })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('turn_cancelled')
    expect(result.replayed).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(result.resultDigest).toBeUndefined()
    expect(replay.outbox).not.toHaveBeenCalled()
  })

  it('denies approval_confirm_failed with a generic replay confirmation failure', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const confirmed = await (async () => {
      await seedJournal(
        inner,
        operationKey,
        stored.proposalHash ?? '',
        'attempt-replay-generic',
        new Date(NOW.getTime() + 60_000).toISOString()
      )
      await inner.markEffectStarted({
        tenantId: TENANT,
        operationKey,
        attemptId: 'attempt-replay-generic'
      })
      return inner.confirmEffect({
        tenantId: TENANT,
        operationKey,
        attemptId: 'attempt-replay-generic',
        executionRef: 'exec_replay_generic',
        resultDigest: null as unknown as string
      })
    })()
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(inner, confirmed),
      store
    })
    vi.spyOn(replay.approvals, 'confirm').mockImplementationOnce(() => {
      throw new Error('synthetic generic confirm failure')
    })

    const result = await replay.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(result.resultDigest).toBeUndefined()
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })

  it('falls through recovery when the reservation token is missing', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 60_000)
    const record = harness.approvals.get(TENANT, approvalId)
    vi.spyOn(harness.approvals, 'get').mockImplementation(
      () =>
        ({
          ...record,
          reservationId: undefined
        }) as unknown as ApprovalRecord
    )

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_reserved')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('releases an expired reservation with no journal record and executes', async () => {
    let now = new Date(NOW.getTime())
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store,
      clock: () => now
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 1_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId),
      executing: false
    })
    now = new Date(now.getTime() + 2_000)
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => ({
      released: 0,
      uncertain: 0
    }))

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(harness.toolExecutor).toHaveBeenCalledTimes(1)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTED')
  })

  it('keeps already_reserved when releasing the expired reservation fails', async () => {
    let now = new Date(NOW.getTime())
    const inner = new InMemoryEffectJournal({ clock: () => now })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store,
      clock: () => now
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 1_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId),
      executing: false
    })
    now = new Date(now.getTime() + 2_000)
    vi.spyOn(harness.approvals, 'releaseExpired').mockImplementation(() => ({
      released: 0,
      uncertain: 0
    }))
    vi.spyOn(harness.approvals, 'release').mockImplementation(() => {
      throw new ApprovalError('invalid_state', 'synthetic release failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('already_reserved')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('maps a generic re-arm reserve failure to journal_unavailable', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingReserveJournal(
        inner,
        new Error('synthetic generic')
      ),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId),
      executing: false
    })
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new ApprovalError(
        'already_reserved',
        'synthetic concurrent reserve'
      )
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('maps a generic second approval reserve to approval_invalid', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const { stored } = reserveBinding(harness, approvalId, 60_000, {
      operationKey: persistedOperationKeyFor(harness, approvalId)
    })
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-second-generic',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.failEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-second-generic',
      errorCode: 'synthetic_pre_effect'
    })
    vi.spyOn(harness.approvals, 'reserve')
      .mockImplementationOnce(() => {
        throw new ApprovalError(
          'already_reserved',
          'synthetic concurrent reserve'
        )
      })
      .mockImplementationOnce(() => {
        throw new Error('synthetic generic reserve failure')
      })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('maps a generic approval reserve failure to approval_invalid', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'reserve').mockImplementation(() => {
      throw new Error('synthetic generic reserve failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
  })

  it('maps a generic markExecuting failure to approval_invalid', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'markExecuting').mockImplementation(() => {
      throw new Error('synthetic generic markExecuting failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_invalid')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('maps a generic markEffectStarted failure to journal_unavailable', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingMarkStartedJournal(
        inner,
        new Error('synthetic generic markEffectStarted failure')
      ),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
  })

  it('maps a generic confirmEffect failure to effect_uncertain', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingConfirmJournal(
        inner,
        new Error('synthetic generic confirmEffect failure')
      ),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('marks UNCERTAIN when approval.confirm fails with a generic error', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'confirm').mockImplementationOnce(() => {
      throw new Error('synthetic generic approval confirm failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('still reports effect_uncertain when the uncertainty transition fails', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingConfirmJournal(inner),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    vi.spyOn(harness.approvals, 'markUncertain').mockImplementation(() => {
      throw new Error('synthetic markUncertain failure')
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('EXECUTING')
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('maps a generic fresh journal reserve failure to journal_unavailable', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingReserveJournal(
        inner,
        new Error('synthetic generic')
      ),
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('journal_unavailable')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
  })

  it('omits the proposal id from a replayed outbox payload for a legacy approval', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const executed = await harness.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    harness.store.update(
      TENANT,
      approvalId,
      'EXECUTED',
      (current) =>
        ({
          ...current,
          proposalId: undefined
        }) as unknown as ApprovalRecord
    )

    const replayed = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(replayed.outcome).toBe('executed')
    expect(replayed.replayed).toBe(true)
    const event = harness.outbox.mock.calls.at(-1)?.[0]
    expect(event?.payload.proposalId).toBeNull()
  })
})

describe('kernel edge branches: remaining generic faults and null evidence', () => {
  it('denies loop_deadline_exceeded at the tool-stage boundary after effect start', async () => {
    let armed = false
    let callsAfter = 0
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      runtimeClock: () => {
        if (!armed) return NOW
        callsAfter += 1
        return callsAfter === 1 ? NOW : new Date(NOW.getTime() + 10_000)
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const original = harness.audit.append.bind(harness.audit)
    vi.spyOn(harness.audit, 'append').mockImplementation((entry) => {
      if (entry.type === 'journal.effect_started') armed = true
      return original(entry)
    })

    const result = await harness.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 500 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(harness.toolExecutor).not.toHaveBeenCalled()
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('APPROVED')
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await expect(inner.get(TENANT, operationKey)).resolves.toMatchObject({
      state: 'EFFECT_FAILED'
    })
  })

  it('marks UNCERTAIN when a no_effect failure fails with a generic journal error', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new ThrowingFailJournal(inner, new Error('synthetic generic')),
      store,
      toolExecutor: async () => {
        throw new ToolExecutionError(
          'tool_rejected',
          'synthetic pre-effect failure',
          { certainty: 'no_effect' }
        )
      }
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('effect_uncertain')
    expect(harness.approvals.get(TENANT, approvalId).status).toBe('UNCERTAIN')
  })

  it('omits the replay digest when the approval has no reservation and the record has none', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const harness = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(harness)
    approveApproval(harness, approvalId)
    const stored = harness.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    await seedJournal(
      inner,
      operationKey,
      stored.proposalHash ?? '',
      'attempt-null-digest-no-reservation',
      new Date(NOW.getTime() + 60_000).toISOString()
    )
    await inner.markEffectStarted({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-null-digest-no-reservation'
    })
    await inner.confirmEffect({
      tenantId: TENANT,
      operationKey,
      attemptId: 'attempt-null-digest-no-reservation',
      executionRef: 'exec_null_digest',
      resultDigest: null as unknown as string
    })

    const result = await harness.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('approval_confirm_failed')
    expect(result.effectConfirmed).toBe(true)
    expect(result.executionRef).toBe('exec_null_digest')
    expect(result.resultDigest).toBeUndefined()
    expect(harness.outbox).not.toHaveBeenCalled()
  })

  it('denies the replay outbox stage for a record without digest', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const base = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(base)
    approveApproval(base, approvalId)
    const executed = await base.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    const stored = base.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const confirmed = await inner.get(TENANT, operationKey)
    const stepped = armedStepClock(20)
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(inner, {
        ...(confirmed as EffectRecord),
        executionRef: null,
        resultDigest: null
      }),
      store,
      runtimeClock: stepped.clock
    })
    stepped.arm()

    const result = await replay.runtime.runTurn(
      turnInput({ approvalId, limits: { maxDurationMs: 120 } })
    )

    expect(result.outcome).toBe('denied')
    expect(result.reason).toBe('loop_deadline_exceeded')
    expect(result.replayed).toBe(true)
    expect(result.effectConfirmed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(result.resultDigest).toBeUndefined()
    expect(result.executionRef).toMatch(/^exec_/)
    expect(replay.outbox).not.toHaveBeenCalled()
  })

  it('reports outbox_pending on a replay outbox failure for a record without digest', async () => {
    const inner = new InMemoryEffectJournal({ clock: () => NOW })
    const store = new InMemoryApprovalStore()
    const base = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: inner,
      store
    })
    const approvalId = await requestApproval(base)
    approveApproval(base, approvalId)
    const executed = await base.runtime.runTurn(turnInput({ approvalId }))
    expect(executed.outcome).toBe('executed')
    const stored = base.approvals.get(TENANT, approvalId)
    const operationKey = expectedDerivedOperationKey(stored.proposalHash ?? '')
    const confirmed = await inner.get(TENANT, operationKey)
    const replay = buildHarness({
      effectScopes: FAKE_CANCEL_SCOPE,
      journal: new StaticGetJournal(inner, {
        ...(confirmed as EffectRecord),
        executionRef: null,
        resultDigest: null
      }),
      store,
      outbox: async () => {
        throw new Error('synthetic replay outbox outage')
      }
    })

    const result = await replay.runtime.runTurn(turnInput({ approvalId }))

    expect(result.outcome).toBe('executed')
    expect(result.reason).toBe('outbox_pending')
    expect(result.replayed).toBe(true)
    expect(result.outboxPending).toBe(true)
    expect(result.resultDigest).toBeUndefined()
    expect(replay.toolExecutor).not.toHaveBeenCalled()
  })
})
