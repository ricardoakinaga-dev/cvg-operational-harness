// P1-2 adversarial adjudication probe (independent, fresh context).
// Scenario under test: crash after journal EFFECT_STARTED, TTL expiry, sweep,
// retry of the same approval with a changed/absent caller idempotency key.
// Invariant: the tool must execute AT MOST once; approval/journal must end
// UNCERTAIN or the retry must be denied; never APPROVED + re-execution.
//
// Mode 1 (no argv): runs all in-process scenarios + spawns itself as
// "crash-child" for the real process-crash scenario, then adjudicates it.
// Mode 2 (argv[2] === 'crash-child'): real execution turn with caller key A;
// the tool performs a synthetic effect and then process.exit(99) BEFORE the
// journal confirm, leaving approval EXECUTING + journal EFFECT_STARTED.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'
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
import type { ModelProfile } from '@cvg/model-gateway'
import {
  PolicyEngine,
  type Capability
} from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import {
  GovernedAgentRuntime,
  sweepExpiredApprovals
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/runtime.ts'
import {
  FileEffectJournal,
  InMemoryEffectJournal,
  type EffectJournalPort
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const T0 = new Date('2026-09-12T12:00:00.000Z')
const TTL = 1_000
const KEY_A = 'caller-idempotency-A'
const KEY_B = 'caller-idempotency-B'
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}
const WORKDIR = '/tmp/opencode/p1-review2-20260913T053543Z'

function callerKey(tenantId: string, key: string): string {
  return `op:${createHash('sha256').update(canonicalizeJson({ tenantId, callerIdempotencyKey: key }), 'utf8').digest('hex')}`
}

interface Harness {
  runtime: GovernedAgentRuntime
  approvals: ApprovalEngine
  store: InMemoryApprovalStore
  journal: EffectJournalPort
  toolCalls: () => number
  outboxCalls: () => number
  outboxKeys: string[]
  clock: () => Date
  setNow: (d: Date) => void
}

let currentNow: Date = T0

function buildHarness(options: {
  journal: EffectJournalPort
  clock?: () => Date
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
}): Harness {
  const clock = options.clock ?? (() => currentNow)
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
    clock,
    retry: { maxRetries: 0 }
  })
  const policy = new PolicyEngine({ documents: [], clock })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock, reservationTtlMs: TTL })
  const telemetry = new InMemoryTelemetry({ clock })
  const audit = new HashChainedAuditLedger()
  let toolCalls = 0
  const outboxKeys: string[] = []
  const toolExecutor = async (invocation: ToolInvocation) => {
    toolCalls += 1
    if (options.toolExecutor) return options.toolExecutor(invocation)
    return { result: { ok: true } }
  }
  const outbox = async (event: OutboxEnqueueInput) => {
    outboxKeys.push(event.idempotencyKey)
    return { eventId: `evt_${event.idempotencyKey}` }
  }
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway,
    telemetry,
    audit,
    toolExecutor,
    outbox,
    clock,
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: options.journal,
    reservationTtlMs: TTL
  })
  return {
    runtime,
    approvals,
    store,
    journal: options.journal,
    toolCalls: () => toolCalls,
    outboxCalls: () => outboxKeys.length,
    outboxKeys,
    clock,
    setNow: (d: Date) => {
      currentNow = d
    }
  }
}

function turnInput(overrides: Partial<GovernedTurnInput> = {}): GovernedTurnInput {
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
    modelMessages: { messages: [{ role: 'user', content: 'cancelar consulta' }] },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

function approve(h: Harness, approvalId: string): void {
  h.approvals.submit(TENANT, approvalId, 'op_1')
  h.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
}

async function requestApproval(
  h: Harness,
  overrides: Partial<GovernedTurnInput> = {}
): Promise<string> {
  const requested = await h.runtime.runTurn(turnInput(overrides))
  if (requested.outcome !== 'approval_required' || !requested.approvalId) {
    throw new Error(`request turn failed: ${requested.outcome}/${requested.reason}`)
  }
  return requested.approvalId
}

interface Observed {
  scenario: string
  outcome?: string
  reason?: string
  approvalStatus?: string
  approvalOperationKey?: string
  journalAState?: string
  journalBState?: string
  toolCalls: number
  outboxCalls: number
  sweep?: { released: number; uncertain: number }
  invariantHeld: boolean
  notes: string[]
}

function check(observed: Observed, condition: boolean, note: string): void {
  if (!condition) {
    observed.invariantHeld = false
    observed.notes.push(note)
  }
}

async function journalState(
  journal: EffectJournalPort,
  key: string
): Promise<string | undefined> {
  try {
    const record = await journal.get(TENANT, key)
    return record?.state
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------

async function legacyCrashState(
  h: Harness,
  callerKeyValue: string,
  executing = true
): Promise<{ approvalId: string; reservationId: string }> {
  const approvalId = await requestApproval(h, { idempotencyKey: callerKeyValue })
  approve(h, approvalId)
  const stored = h.approvals.get(TENANT, approvalId)
  const reservation = h.approvals.reserve({
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
    ttlMs: TTL
    // no operationKey: legacy reservation
  })
  if (executing) {
    h.approvals.markExecuting({
      tenantId: TENANT,
      approvalId,
      reservationId: reservation.reservationId
    })
  }
  await h.journal.reserve({
    tenantId: TENANT,
    operationKey: callerKey(TENANT, callerKeyValue),
    proposalHash: stored.proposalHash ?? '',
    attemptId: `att-${callerKeyValue}`,
    expiresAt: new Date(T0.getTime() + TTL).toISOString()
  })
  if (executing) {
    await h.journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: callerKey(TENANT, callerKeyValue),
      attemptId: `att-${callerKeyValue}`
    })
  }
  return { approvalId, reservationId: reservation.reservationId }
}

async function persistedCrashState(
  h: Harness,
  executing = true
): Promise<{ approvalId: string; operationKey: string }> {
  const approvalId = await requestApproval(h, { idempotencyKey: KEY_A })
  approve(h, approvalId)
  const stored = h.approvals.get(TENANT, approvalId)
  const opKey = callerKey(TENANT, KEY_A)
  const reservation = h.approvals.reserve({
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
    operationKey: opKey,
    ttlMs: TTL
  })
  if (executing) {
    h.approvals.markExecuting({
      tenantId: TENANT,
      approvalId,
      reservationId: reservation.reservationId
    })
    await h.journal.reserve({
      tenantId: TENANT,
      operationKey: opKey,
      proposalHash: stored.proposalHash ?? '',
      attemptId: 'att-persisted-A',
      expiresAt: new Date(T0.getTime() + TTL).toISOString()
    })
    await h.journal.markEffectStarted({
      tenantId: TENANT,
      operationKey: opKey,
      attemptId: 'att-persisted-A'
    })
  }
  return { approvalId, operationKey: opKey }
}

// ---------------------------------------------------------------------------
// In-process scenarios
// ---------------------------------------------------------------------------

async function scenarioLegacyImmediateChangedKey(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId } = await legacyCrashState(h, KEY_A, true)
  const beforeTools = h.toolCalls()
  // retry IMMEDIATELY (active lease), changed caller key B
  const retry = await h.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: KEY_B })
  )
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'legacy-crash+active-lease+changed-key-B (no sweep, no TTL wait)',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, callerKey(TENANT, KEY_A)),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    invariantHeld: true,
    notes: []
  }
  check(
    observed,
    observed.toolCalls === 0,
    'LEGACY ACTIVE: tool re-executed on legacy state with changed key B'
  )
  check(
    observed,
    observed.approvalStatus !== 'APPROVED',
    'LEGACY ACTIVE: approval ended APPROVED after changed-key retry'
  )
  return observed
}

async function scenarioLegacyExpiredChangedKey(
  explicitSweep: boolean
): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId } = await legacyCrashState(h, KEY_A, true)
  currentNow = new Date(T0.getTime() + TTL * 2)
  let sweep: { released: number; uncertain: number } | undefined
  if (explicitSweep) {
    sweep = await sweepExpiredApprovals({
      approvals: h.approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: currentNow,
      ttlMs: TTL
    })
  }
  const beforeTools = h.toolCalls()
  const retry = await h.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: KEY_B })
  )
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: explicitSweep
      ? 'legacy-crash+TTL+sweep+changed-key-B'
      : 'legacy-crash+TTL+changed-key-B (turn-start sweep)',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, callerKey(TENANT, KEY_A)),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    sweep,
    invariantHeld: true,
    notes: []
  }
  check(observed, observed.toolCalls === 0, 'tool re-executed')
  check(
    observed,
    observed.approvalStatus === 'UNCERTAIN' || observed.outcome === 'denied',
    'approval did not end UNCERTAIN/denied'
  )
  if (explicitSweep) {
    check(
      observed,
      sweep?.released === 0 && sweep?.uncertain === 1,
      `legacy sweep counters wrong: ${JSON.stringify(sweep)}`
    )
  }
  return observed
}

async function scenarioPersistedSweepThenChangedKey(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId, operationKey } = await persistedCrashState(h, true)
  currentNow = new Date(T0.getTime() + TTL * 2)
  const sweep = await sweepExpiredApprovals({
    approvals: h.approvals,
    effectJournal: journal,
    tenantId: TENANT,
    now: currentNow,
    ttlMs: TTL
  })
  const beforeTools = h.toolCalls()
  const retry = await h.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: KEY_B })
  )
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'persisted-crash+TTL+sweep+changed-key-B',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, operationKey),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    sweep,
    invariantHeld: true,
    notes: []
  }
  check(observed, observed.toolCalls === 0, 'tool re-executed')
  check(
    observed,
    observed.approvalStatus === 'UNCERTAIN',
    `approval did not end UNCERTAIN (got ${observed.approvalStatus})`
  )
  check(
    observed,
    sweep.released === 0 && sweep.uncertain === 1,
    `persisted sweep counters wrong: ${JSON.stringify(sweep)}`
  )
  check(
    observed,
    observed.journalBState === undefined,
    'a NEW journal intent was created under changed key B'
  )
  return observed
}

async function scenarioPersistedAbsentKey(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId, operationKey } = await persistedCrashState(h, true)
  currentNow = new Date(T0.getTime() + TTL * 2)
  const beforeTools = h.toolCalls()
  const retry = await h.runtime.runTurn(turnInput({ approvalId }))
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'persisted-crash+TTL+absent-key',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, operationKey),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    invariantHeld: true,
    notes: []
  }
  check(observed, observed.toolCalls === 0, 'tool re-executed')
  check(
    observed,
    observed.approvalStatus === 'UNCERTAIN' || observed.outcome === 'denied',
    `unexpected terminal state ${observed.approvalStatus}/${observed.outcome}`
  )
  return observed
}

async function scenarioPersistedActiveChangedKey(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId, operationKey } = await persistedCrashState(h, true)
  const beforeTools = h.toolCalls()
  const retry = await h.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: KEY_B })
  )
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'persisted-crash+active-lease+changed-key-B',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, operationKey),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    invariantHeld: true,
    notes: []
  }
  check(observed, observed.toolCalls === 0, 'tool re-executed')
  check(
    observed,
    observed.approvalStatus !== 'APPROVED',
    'approval ended APPROVED'
  )
  return observed
}

async function scenarioLegacyAbsentProof(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const approvalId = await requestApproval(h)
  approve(h, approvalId)
  const stored = h.approvals.get(TENANT, approvalId)
  const reservation = h.approvals.reserve({
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
    ttlMs: TTL
  })
  void reservation
  currentNow = new Date(T0.getTime() + TTL * 2)
  const sweep = await sweepExpiredApprovals({
    approvals: h.approvals,
    effectJournal: journal,
    tenantId: TENANT,
    now: currentNow,
    ttlMs: TTL
  })
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'legacy-no-key+empty-journal+TTL+sweep',
    approvalStatus: approval.status,
    sweep,
    toolCalls: h.toolCalls(),
    outboxCalls: h.outboxCalls(),
    invariantHeld: true,
    notes: []
  }
  check(
    observed,
    sweep.released === 0 && sweep.uncertain === 1,
    `legacy empty-sweep wrong: ${JSON.stringify(sweep)}`
  )
  check(observed, approval.status === 'UNCERTAIN', 'legacy approval released')
  return observed
}

async function scenarioPositiveControl(): Promise<Observed> {
  currentNow = new Date(T0.getTime())
  const journal = new InMemoryEffectJournal({ clock: () => currentNow })
  const h = buildHarness({ journal })
  const { approvalId, operationKey } = await persistedCrashState(h, false)
  currentNow = new Date(T0.getTime() + TTL * 2)
  const sweep = await sweepExpiredApprovals({
    approvals: h.approvals,
    effectJournal: journal,
    tenantId: TENANT,
    now: currentNow,
    ttlMs: TTL
  })
  const beforeTools = h.toolCalls()
  const retry = await h.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: KEY_B })
  )
  const approval = h.approvals.get(TENANT, approvalId)
  const observed: Observed = {
    scenario: 'positive-control: persisted key + proven-absent journal + never-EXECUTING',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, operationKey),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: h.toolCalls() - beforeTools,
    outboxCalls: h.outboxCalls(),
    sweep,
    invariantHeld: true,
    notes: []
  }
  check(
    observed,
    sweep.released === 1 && sweep.uncertain === 0,
    `positive control sweep wrong: ${JSON.stringify(sweep)}`
  )
  check(observed, observed.outcome === 'executed', 'retry not executed')
  check(observed, observed.toolCalls === 1, `tool calls ${observed.toolCalls} != 1`)
  check(
    observed,
    observed.journalAState === 'CONFIRMED',
    `journal A state ${observed.journalAState} != CONFIRMED`
  )
  check(
    observed,
    observed.journalBState === undefined,
    'journal under key B was created (persisted key lost)'
  )
  check(
    observed,
    h.outboxKeys.length === 1 && h.outboxKeys[0] === operationKey,
    `outbox key mismatch: ${JSON.stringify(h.outboxKeys)}`
  )
  return observed
}

// ---------------------------------------------------------------------------
// Real process-crash child
// ---------------------------------------------------------------------------

const stateDir = join(WORKDIR, 'p12-crash')
const journalDir = join(stateDir, 'journal')
const stateFile = join(stateDir, 'crash-state.json')
const effectLog = join(stateDir, 'effects.log')

async function runCrashChild(): Promise<never> {
  currentNow = new Date(T0.getTime())
  mkdirSync(journalDir, { recursive: true })
  writeFileSync(effectLog, '')
  const journal = new FileEffectJournal({
    directory: journalDir,
    clock: () => currentNow
  })
  let capturedApprovalId = ''
  const h = buildHarness({
    journal,
    toolExecutor: async () => {
      appendFileSync(effectLog, 'EFFECT\n')
      const record: ApprovalRecord = h.approvals.get(TENANT, capturedApprovalId)
      const journalRecord = await journal.get(
        TENANT,
        callerKey(TENANT, KEY_A)
      )
      writeFileSync(
        stateFile,
        JSON.stringify(
          { approvalRecord: record, journalRecord, at: currentNow.toISOString() },
          null,
          2
        )
      )
      // Hard crash: effect was performed, journal confirm never happened.
      process.exit(99)
    }
  })
  capturedApprovalId = await requestApproval(h, { idempotencyKey: KEY_A })
  approve(h, capturedApprovalId)
  await h.runtime.runTurn(
    turnInput({ approvalId: capturedApprovalId, idempotencyKey: KEY_A })
  )
  // Should never get here.
  console.error('CRASH-CHILD: turn completed without crash')
  process.exit(98)
}

async function adjudicateCrash(): Promise<Observed> {
  const state = JSON.parse(readFileSync(stateFile, 'utf8')) as {
    approvalRecord: ApprovalRecord
    journalRecord: { state?: string; operationKey?: string }
  }
  const effectsBefore = readFileSync(effectLog, 'utf8').length
  currentNow = new Date(T0.getTime() + TTL * 2)
  const store = new InMemoryApprovalStore()
  store.insert(state.approvalRecord)
  const approvals = new ApprovalEngine({
    store,
    clock: () => currentNow,
    reservationTtlMs: TTL
  })
  const journal = new FileEffectJournal({
    directory: journalDir,
    clock: () => currentNow
  })
  const sweep = await sweepExpiredApprovals({
    approvals,
    effectJournal: journal,
    tenantId: TENANT,
    now: currentNow,
    ttlMs: TTL
  })
  const afterSweep = approvals.get(TENANT, state.approvalRecord.approvalId)
  let retryToolCalls = 0
  const retryRuntime = new GovernedAgentRuntime({
    policy: new PolicyEngine({ documents: [], clock: () => currentNow }),
    approvals,
    modelGateway: new ModelGateway({
      providers: [
        new DeterministicModelProvider({
          respond: () => ({
            text: JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
            usage: { inputTokens: 10, outputTokens: 5 },
            providerId: 'deterministic',
            model: 'deterministic-v1',
            externalCall: false
          })
        })
      ],
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
      prompts: (() => {
        const p = new PromptRegistry()
        p.register({
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
        return p
      })(),
      clock: () => currentNow,
      retry: { maxRetries: 0 }
    }),
    telemetry: new InMemoryTelemetry({ clock: () => currentNow }),
    audit: new HashChainedAuditLedger(),
    toolExecutor: async () => {
      retryToolCalls += 1
      return { result: { ok: true } }
    },
    outbox: async (event: OutboxEnqueueInput) => ({
      eventId: `evt_${event.idempotencyKey}`
    }),
    clock: () => currentNow,
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: journal,
    reservationTtlMs: TTL
  })
  const retry = await retryRuntime.runTurn(
    turnInput({ approvalId: state.approvalRecord.approvalId, idempotencyKey: KEY_B })
  )
  const approval = approvals.get(TENANT, state.approvalRecord.approvalId)
  const effectsAfter = readFileSync(effectLog, 'utf8').length
  const observed: Observed = {
    scenario: 'REAL CRASH child (exit 99 after effect, before confirm) + sweep + changed-key-B retry',
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: approval.status,
    approvalOperationKey: approval.operationKey,
    journalAState: await journalState(journal, callerKey(TENANT, KEY_A)),
    journalBState: await journalState(journal, callerKey(TENANT, KEY_B)),
    toolCalls: retryToolCalls,
    outboxCalls: 0,
    sweep,
    invariantHeld: true,
    notes: [
      `child effects.log bytes before=${effectsBefore} after=${effectsAfter}`,
      `crash approvalOperationKey=${state.approvalRecord.operationKey}`,
      `crash journal state=${state.journalRecord.state}`
    ]
  }
  check(
    observed,
    state.approvalRecord.operationKey === callerKey(TENANT, KEY_A),
    'crash-state approval did not persist operationKey A'
  )
  check(
    observed,
    state.journalRecord.state === 'EFFECT_STARTED',
    `crash-state journal was ${state.journalRecord.state}`
  )
  check(
    observed,
    sweep.released === 0 && sweep.uncertain === 1,
    `post-crash sweep wrong: ${JSON.stringify(sweep)}`
  )
  check(
    observed,
    afterSweep.status === 'UNCERTAIN',
    `post-sweep approval status ${afterSweep.status}`
  )
  check(observed, retry.outcome === 'denied', 'retry not denied')
  check(
    observed,
    retry.reason === 'operation_uncertain',
    `retry reason ${retry.reason} != operation_uncertain`
  )
  check(
    observed,
    approval.status === 'UNCERTAIN',
    `final approval status ${approval.status} != UNCERTAIN`
  )
  check(
    observed,
    effectsAfter === effectsBefore,
    'tool re-executed after crash (effects.log grew)'
  )
  check(
    observed,
    retryToolCalls === 0,
    `retry tool executor called ${retryToolCalls} time(s)`
  )
  return observed
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv[2] === 'crash-child') {
    await runCrashChild()
    return
  }

  // Clean crash dir before the spawn.
  mkdirSync(stateDir, { recursive: true })
  const child = spawnSync('npx', ['tsx', fileURLToPath(import.meta.url), 'crash-child'], {
    cwd: '/home/ricardo/cvg-agent-secretary-v2',
    stdio: ['ignore', 'inherit', 'inherit']
  })
  console.log(
    JSON.stringify({
      probe: 'P1-2-crash-child-exit',
      status: child.status,
      signal: child.signal,
      expectedStatus: 99
    })
  )

  const results: Observed[] = []
  results.push(await scenarioLegacyImmediateChangedKey())
  results.push(await scenarioLegacyExpiredChangedKey(true))
  results.push(await scenarioLegacyExpiredChangedKey(false))
  results.push(await scenarioPersistedSweepThenChangedKey())
  results.push(await scenarioPersistedAbsentKey())
  results.push(await scenarioPersistedActiveChangedKey())
  results.push(await scenarioLegacyAbsentProof())
  results.push(await scenarioPositiveControl())
  results.push(await adjudicateCrash())

  let failed = 0
  for (const observed of results) {
    console.log(JSON.stringify({ probe: 'P1-2-scenario', ...observed }))
    if (!observed.invariantHeld) failed += 1
  }
  const childOk = child.status === 99
  if (!childOk) failed += 1
  console.log(
    JSON.stringify({
      probe: 'P1-2-summary',
      scenarios: results.length,
      failed,
      falsified: failed > 0,
      childCrashExitOk: childOk
    })
  )
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
