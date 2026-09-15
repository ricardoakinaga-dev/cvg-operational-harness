// P1-2R closure probe (fresh code, round-5 candidate 328d6a38).
// Goal: prove keyless legacy recovery fails closed with the tool never running
// and journal A never mutated into an executed/new intent; persisted-key paths
// keep the documented semantics.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  cpSync
} from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { z } from 'zod'
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
import { PolicyEngine, type Capability } from '@cvg/policy-engine'
import { HashChainedAuditLedger, InMemoryTelemetry } from '@cvg/observability'
import {
  GovernedAgentRuntime,
  sweepExpiredApprovals
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/runtime.ts'
import {
  FileEffectJournal,
  type EffectJournalPort,
  type EffectRecord
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
const TTL = 10_000
const KEY_A = 'caller-idempotency-A'
const KEY_B = 'caller-idempotency-B'
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}
const ROOT = '/tmp/opencode/p1-review3-20260913T063517Z/p12r-closure'
const JOURNAL_DIR = join(ROOT, 'journal')
const STATE_FILE = join(ROOT, 'crash-state.json')
const EFFECT_LOG = join(ROOT, 'effects.log')

function opKey(tenantId: string, key: string): string {
  return `op:${createHash('sha256')
    .update(canonicalizeJson({ tenantId, callerIdempotencyKey: key }), 'utf8')
    .digest('hex')}`
}

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

function buildRuntime(options: {
  approvals: ApprovalEngine
  journal: EffectJournalPort
  now: () => Date
  toolExecutor: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outboxKeys: string[]
}): GovernedAgentRuntime {
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
  return new GovernedAgentRuntime({
    policy: new PolicyEngine({ documents: [], clock: options.now }),
    approvals: options.approvals,
    modelGateway: new ModelGateway({
      providers: [provider],
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
      clock: options.now,
      retry: { maxRetries: 0 }
    }),
    telemetry: new InMemoryTelemetry({ clock: options.now }),
    audit: new HashChainedAuditLedger(),
    toolExecutor: options.toolExecutor,
    outbox: async (event: OutboxEnqueueInput) => {
      options.outboxKeys.push(event.idempotencyKey)
      return { eventId: `evt_${event.idempotencyKey}` }
    },
    clock: options.now,
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: options.journal,
    reservationTtlMs: TTL
  })
}

async function crashChild(): Promise<never> {
  rmSync(JOURNAL_DIR, { recursive: true, force: true })
  mkdirSync(JOURNAL_DIR, { recursive: true })
  writeFileSync(EFFECT_LOG, '')
  const now = () => T0
  const journal = new FileEffectJournal({ directory: JOURNAL_DIR, clock: now })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock: now, reservationTtlMs: TTL })
  let approvalId = ''
  const runtime = buildRuntime({
    approvals,
    journal,
    now,
    toolExecutor: async () => {
      appendFileSync(EFFECT_LOG, 'EFFECT\n')
      const record = approvals.get(TENANT, approvalId)
      const journalRecord = await journal.get(TENANT, opKey(TENANT, KEY_A))
      writeFileSync(
        STATE_FILE,
        JSON.stringify({ approvalRecord: record, journalRecord }, null, 2)
      )
      process.exit(99)
    },
    outboxKeys: []
  })
  const requested = await runtime.runTurn(turnInput({ idempotencyKey: KEY_A }))
  approvalId = requested.approvalId ?? ''
  approvals.submit(TENANT, approvalId, 'op_1')
  approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  await runtime.runTurn(turnInput({ approvalId, idempotencyKey: KEY_A }))
  console.error('CLOSURE-CRASH-CHILD: turn completed without crash')
  process.exit(98)
}

interface VariantResult {
  variant: string
  outcome: string
  reason: string
  approvalStatus: string
  toolCalls: number
  outboxKeys: string[]
  journalABefore: string | undefined
  journalAAfter: string | undefined
  journalBAfter: string | undefined
  journalAMutated: boolean
  ok: boolean
  notes: string[]
}

async function runVariant(
  state: { approvalRecord: ApprovalRecord; journalRecord: EffectRecord },
  options: {
    name: string
    keyless: boolean
    lease: 'active' | 'expired'
    key: 'changed' | 'absent'
    dropJournal?: boolean
    expectDenied: boolean
    expectedReason: string
    allowAfter: string[]
  }
): Promise<VariantResult> {
  const record: ApprovalRecord = options.keyless
    ? (() => {
        const copy = { ...state.approvalRecord }
        delete (copy as { operationKey?: string }).operationKey
        return copy
      })()
    : { ...state.approvalRecord }
  const variantDir = join(ROOT, `journal-${options.name}`)
  rmSync(variantDir, { recursive: true, force: true })
  if (!options.dropJournal) cpSync(JOURNAL_DIR, variantDir, { recursive: true })
  else mkdirSync(variantDir, { recursive: true })
  const nowValue =
    options.lease === 'active'
      ? new Date(T0.getTime() + TTL / 2)
      : new Date(T0.getTime() + TTL * 2)
  const now = () => nowValue
  const journal = new FileEffectJournal({ directory: variantDir, clock: now })
  const store = new InMemoryApprovalStore()
  store.insert(record)
  const approvals = new ApprovalEngine({ store, clock: now, reservationTtlMs: TTL })
  const outboxKeys: string[] = []
  let toolCalls = 0
  const journalABefore = (
    await journal.get(TENANT, opKey(TENANT, KEY_A))
  )?.state
  const runtime = buildRuntime({
    approvals,
    journal,
    now,
    toolExecutor: async () => {
      toolCalls += 1
      appendFileSync(EFFECT_LOG, `EFFECT-${options.name}\n`)
      return { result: { ok: true } }
    },
    outboxKeys
  })
  const retry = await runtime.runTurn(
    turnInput({
      approvalId: record.approvalId,
      ...(options.key === 'changed' ? { idempotencyKey: KEY_B } : {})
    })
  )
  const after = approvals.get(TENANT, record.approvalId)
  const journalAAfter = (await journal.get(TENANT, opKey(TENANT, KEY_A)))?.state
  const journalBAfter = (await journal.get(TENANT, opKey(TENANT, KEY_B)))?.state
  const journalAMutated = journalAAfter !== journalABefore
  const notes: string[] = []
  if (options.expectDenied) {
    if (retry.outcome !== 'denied') notes.push(`outcome ${retry.outcome} != denied`)
    if (retry.reason !== options.expectedReason)
      notes.push(`reason ${retry.reason} != ${options.expectedReason}`)
    if (toolCalls !== 0) notes.push(`tool calls ${toolCalls} != 0`)
    if (outboxKeys.length !== 0) notes.push(`outbox ${outboxKeys.length} != 0`)
    if (journalBAfter !== undefined)
      notes.push(`journal B created (${journalBAfter})`)
    if (after.status === 'APPROVED' || after.status === 'EXECUTED')
      notes.push(`approval status ${after.status}`)
    if (!options.allowAfter.includes(journalAAfter ?? 'undefined'))
      notes.push(`journal A ${journalAAfter} not in ${JSON.stringify(options.allowAfter)}`)
  }
  return {
    variant: options.name,
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatus: after.status,
    toolCalls,
    outboxKeys,
    journalABefore,
    journalAAfter,
    journalBAfter,
    journalAMutated,
    ok: notes.length === 0,
    notes
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === 'crash-child') {
    await crashChild()
    return
  }
  const child = spawnSync(
    'npx',
    ['tsx', fileURLToPath(import.meta.url), 'crash-child'],
    { cwd: '/home/ricardo/cvg-agent-secretary-v2', stdio: ['ignore', 'inherit', 'inherit'] }
  )
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    approvalRecord: ApprovalRecord
    journalRecord: EffectRecord
  }
  const effectsBefore = readFileSync(EFFECT_LOG, 'utf8').length
  const results: VariantResult[] = []

  results.push(
    await runVariant(state, {
      name: 'legacy-active-changed-B',
      keyless: true,
      lease: 'active',
      key: 'changed',
      expectDenied: true,
      expectedReason: 'operation_uncertain',
      allowAfter: ['EFFECT_STARTED']
    })
  )
  results.push(
    await runVariant(state, {
      name: 'legacy-active-absent-key',
      keyless: true,
      lease: 'active',
      key: 'absent',
      expectDenied: true,
      expectedReason: 'operation_uncertain',
      allowAfter: ['EFFECT_STARTED']
    })
  )
  results.push(
    await runVariant(state, {
      name: 'legacy-expired-changed-B',
      keyless: true,
      lease: 'expired',
      key: 'changed',
      expectDenied: true,
      expectedReason: 'operation_uncertain',
      allowAfter: ['EFFECT_STARTED', 'UNCERTAIN']
    })
  )
  results.push(
    await runVariant(state, {
      name: 'legacy-expired-absent-key',
      keyless: true,
      lease: 'expired',
      key: 'absent',
      expectDenied: true,
      expectedReason: 'operation_uncertain',
      allowAfter: ['EFFECT_STARTED', 'UNCERTAIN']
    })
  )
  results.push(
    await runVariant(state, {
      name: 'persisted-active-changed-B',
      keyless: false,
      lease: 'active',
      key: 'changed',
      expectDenied: true,
      expectedReason: 'operation_in_progress',
      allowAfter: ['EFFECT_STARTED']
    })
  )
  // persisted + active + journal record dropped: EXECUTING without record -> uncertain
  {
    const variantDir = join(ROOT, 'journal-persisted-executing-absent')
    rmSync(variantDir, { recursive: true, force: true })
    mkdirSync(variantDir, { recursive: true })
    const nowValue = new Date(T0.getTime() + TTL / 2)
    const now = () => nowValue
    const journal = new FileEffectJournal({ directory: variantDir, clock: now })
    const store = new InMemoryApprovalStore()
    store.insert({ ...state.approvalRecord })
    const approvals = new ApprovalEngine({ store, clock: now, reservationTtlMs: TTL })
    const outboxKeys: string[] = []
    let toolCalls = 0
    const runtime = buildRuntime({
      approvals,
      journal,
      now,
      toolExecutor: async () => {
        toolCalls += 1
        return { result: { ok: true } }
      },
      outboxKeys
    })
    const retry = await runtime.runTurn(
      turnInput({ approvalId: state.approvalRecord.approvalId, idempotencyKey: KEY_B })
    )
    const after = approvals.get(TENANT, state.approvalRecord.approvalId)
    const notes: string[] = []
    if (retry.outcome !== 'denied' || retry.reason !== 'operation_uncertain')
      notes.push(`unexpected ${retry.outcome}/${retry.reason}`)
    if (toolCalls !== 0) notes.push(`tool calls ${toolCalls}`)
    if (after.status === 'APPROVED' || after.status === 'EXECUTED')
      notes.push(`status ${after.status}`)
    results.push({
      variant: 'persisted-executing-absent-journal',
      outcome: retry.outcome,
      reason: retry.reason,
      approvalStatus: after.status,
      toolCalls,
      outboxKeys,
      journalABefore: undefined,
      journalAAfter: undefined,
      journalBAfter: (await journal.get(TENANT, opKey(TENANT, KEY_B)))?.state,
      journalAMutated: false,
      ok: notes.length === 0,
      notes
    })
  }

  // Positive control: persisted key + expired + never EXECUTING + absent journal
  // -> sweep releases to APPROVED, retry with changed key executes exactly once
  // under the persisted key A.
  {
    const variantDir = join(ROOT, 'journal-positive-control')
    rmSync(variantDir, { recursive: true, force: true })
    mkdirSync(variantDir, { recursive: true })
    const store = new InMemoryApprovalStore()
    let positiveNow = new Date(T0.getTime())
    const now = () => positiveNow
    const journal = new FileEffectJournal({ directory: variantDir, clock: now })
    const approvals = new ApprovalEngine({ store, clock: now, reservationTtlMs: TTL })
    // Rebuild an APPROVED record with persisted key A and an expired RESERVED lease.
    const base = { ...state.approvalRecord }
    delete (base as { operationKey?: string }).operationKey
    base.status = 'APPROVED'
    delete base.reservationId
    delete base.reservationExpiresAt
    delete base.reservedAt
    store.insert(base)
    const stored = approvals.get(TENANT, base.approvalId)
    const reservation = approvals.reserve({
      tenantId: TENANT,
      approvalId: base.approvalId,
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: stored.proposalPayload,
      proposalHash: stored.proposalHash,
      agentId: AGENT,
      agentVersion: 'v1',
      policyVersion: stored.policyVersion,
      capability: 'appointment.cancel',
      operationKey: opKey(TENANT, KEY_A),
      ttlMs: TTL
    })
    void reservation
    // Advance past the reservation lease; the retry happens after the sweep.
    positiveNow = new Date(T0.getTime() + TTL * 2)
    const sweep = await sweepExpiredApprovals({
      approvals,
      effectJournal: journal,
      tenantId: TENANT,
      now: positiveNow,
      ttlMs: TTL
    })
    const beforeRetry = approvals.get(TENANT, base.approvalId)
    const outboxKeys: string[] = []
    let toolCalls = 0
    const runtime = buildRuntime({
      approvals,
      journal,
      now,
      toolExecutor: async () => {
        toolCalls += 1
        return { result: { ok: true } }
      },
      outboxKeys
    })
    const retry = await runtime.runTurn(
      turnInput({ approvalId: base.approvalId, idempotencyKey: KEY_B })
    )
    const after = approvals.get(TENANT, base.approvalId)
    const notes: string[] = []
    if (sweep.released !== 1 || sweep.uncertain !== 0)
      notes.push(`sweep ${JSON.stringify(sweep)}`)
    if (beforeRetry.status !== 'APPROVED') notes.push(`pre-retry ${beforeRetry.status}`)
    if (retry.outcome !== 'executed') notes.push(`outcome ${retry.outcome}`)
    if (toolCalls !== 1) notes.push(`tool calls ${toolCalls}`)
    if (after.status !== 'EXECUTED') notes.push(`final ${after.status}`)
    if ((await journal.get(TENANT, opKey(TENANT, KEY_A)))?.state !== 'CONFIRMED')
      notes.push('journal A not CONFIRMED')
    if ((await journal.get(TENANT, opKey(TENANT, KEY_B))) !== undefined)
      notes.push('journal B created')
    if (outboxKeys.length !== 1 || outboxKeys[0] !== opKey(TENANT, KEY_A))
      notes.push(`outbox ${JSON.stringify(outboxKeys)}`)
    results.push({
      variant: 'positive-control-persisted-proven-absent',
      outcome: retry.outcome,
      reason: retry.reason,
      approvalStatus: after.status,
      toolCalls,
      outboxKeys,
      journalABefore: undefined,
      journalAAfter: (await journal.get(TENANT, opKey(TENANT, KEY_A)))?.state,
      journalBAfter: undefined,
      journalAMutated: true,
      ok: notes.length === 0,
      notes
    })
  }

  const effectsAfter = readFileSync(EFFECT_LOG, 'utf8').length
  const failed = results.filter((r) => !r.ok)
  console.log(
    JSON.stringify(
      {
        probe: 'P1-2R-closure',
        candidate: '328d6a384658e75dc241db08d59072cbc4c8c4c430bc7d48063653443f092f67',
        childCrashExit: child.status,
        crashState: {
          status: state.approvalRecord.status,
          operationKey: state.approvalRecord.operationKey,
          journalA: state.journalRecord.state
        },
        effectsLogGrew: effectsAfter - effectsBefore > 0,
        results,
        failed: failed.length,
        falsified: failed.length > 0
      },
      null,
      2
    )
  )
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
