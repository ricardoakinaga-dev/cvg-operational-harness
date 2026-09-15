/**
 * P1-2R adjudication probe (synthetic, no real data).
 *
 * Reproduces the reviewer scenario from a REAL child-process crash after
 * `journal.markEffectStarted`: a governed execution turn reserves with caller
 * key A, the tool appends a synthetic effect and the child exits before
 * confirmation. The parent then derives the migration state (the same crashed
 * record with `operationKey` removed = pre-fix legacy record) and exercises:
 *
 *   1. legacy + active lease + retry key B        -> must deny, tool 0
 *   2. legacy + active lease + retry without key  -> must deny, tool 0
 *   3. persisted + active lease + retry key B     -> must deny, tool 0
 *   4. persisted + proven-absent journal + never
 *      EXECUTING                                  -> must re-arm and execute
 *                                                     exactly once under the
 *                                                     persisted key
 *   5. legacy + expired lease + retry key B       -> must deny, tool 0
 *
 * Exit 0 only when every invariant holds. Raw JSON trace on stdout.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  appendFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
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
import { GovernedAgentRuntime } from '../../../../../../packages/agent-runtime/src/runtime.ts'
import { FileEffectJournal } from '../../../../../../packages/agent-runtime/src/effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput,
  ToolInvocation
} from '../../../../../../packages/agent-runtime/src/contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const T0 = new Date('2026-09-13T09:00:00.000Z')
const TTL = 10_000
const KEY_A = 'sweep-legacy-fix-caller-A'
const KEY_B = 'sweep-legacy-fix-caller-B'
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}
const ROOT = '/tmp/opencode/aaa07-sweep-legacy-fix'
const JOURNAL_DIR = join(ROOT, 'journal-crash')
const STATE_FILE = join(ROOT, 'crash-state.json')
const EFFECT_LOG = join(ROOT, 'effects.log')

function opKey(tenantId: string, callerKey: string): string {
  return `op:${createHash('sha256')
    .update(
      canonicalizeJson({ tenantId, callerIdempotencyKey: callerKey }),
      'utf8'
    )
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
  journal: FileEffectJournal
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
  rmSync(ROOT, { recursive: true, force: true })
  mkdirSync(JOURNAL_DIR, { recursive: true })
  writeFileSync(EFFECT_LOG, '')
  const now = () => T0
  const journal = new FileEffectJournal({ directory: JOURNAL_DIR, clock: now })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({
    store,
    clock: now,
    reservationTtlMs: TTL
  })
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
  process.exit(98)
}

interface VariantOptions {
  label: string
  record: ApprovalRecord
  now: () => Date
  journalDir: string
  retryKey?: string
  expectExecuted: boolean
}

async function runVariant(
  options: VariantOptions
): Promise<Record<string, unknown>> {
  const journal = new FileEffectJournal({
    directory: options.journalDir,
    clock: options.now
  })
  const store = new InMemoryApprovalStore()
  store.insert(options.record)
  const approvals = new ApprovalEngine({
    store,
    clock: options.now,
    reservationTtlMs: TTL
  })
  const outboxKeys: string[] = []
  let toolCalls = 0
  const runtime = buildRuntime({
    approvals,
    journal,
    now: options.now,
    toolExecutor: async () => {
      toolCalls += 1
      appendFileSync(EFFECT_LOG, `EFFECT-${options.label}\n`)
      return { result: { ok: true } }
    },
    outboxKeys
  })
  const retry = await runtime.runTurn(
    turnInput({
      approvalId: options.record.approvalId,
      ...(options.retryKey !== undefined
        ? { idempotencyKey: options.retryKey }
        : {})
    })
  )
  const after = approvals.get(TENANT, options.record.approvalId)
  const journalA = await journal.get(TENANT, opKey(TENANT, KEY_A))
  const journalB = await journal.get(TENANT, opKey(TENANT, KEY_B))
  return {
    variant: options.label,
    recordHadOperationKey: options.record.operationKey !== undefined,
    recordStatusAtStart: options.record.status,
    retryKey: options.retryKey ?? null,
    outcome: retry.outcome,
    reason: retry.reason,
    approvalStatusAfter: after.status,
    approvalOperationKeyAfter: after.operationKey ?? null,
    journalAStateAfter: journalA?.state ?? null,
    journalARevisionAfter: journalA?.revision ?? null,
    journalBStateAfter: journalB?.state ?? null,
    retryToolCalls: toolCalls,
    retryOutboxKeys: outboxKeys,
    expectExecuted: options.expectExecuted
  }
}

function withoutOperationKey(record: ApprovalRecord): ApprovalRecord {
  const copy: Record<string, unknown> = { ...record }
  delete copy.operationKey
  return copy as unknown as ApprovalRecord
}

function freshJournalDir(label: string): string {
  const dir = join(ROOT, `journal-${label}`)
  rmSync(dir, { recursive: true, force: true })
  cpSync(JOURNAL_DIR, dir, { recursive: true })
  return dir
}

function emptyJournalDir(label: string): string {
  const dir = join(ROOT, `journal-${label}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

async function adjudicate(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    approvalRecord: ApprovalRecord
    journalRecord: { state: string }
  }
  const active = () => new Date(T0.getTime() + 500)
  const expired = () => new Date(T0.getTime() + TTL * 5)
  const results: Record<string, unknown>[] = []

  results.push(
    await runVariant({
      label: 'legacy-active-changed-key',
      record: withoutOperationKey(state.approvalRecord),
      now: active,
      journalDir: freshJournalDir('legacy-active-changed-key'),
      retryKey: KEY_B,
      expectExecuted: false
    })
  )
  results.push(
    await runVariant({
      label: 'legacy-active-absent-key',
      record: withoutOperationKey(state.approvalRecord),
      now: active,
      journalDir: freshJournalDir('legacy-active-absent-key'),
      expectExecuted: false
    })
  )
  results.push(
    await runVariant({
      label: 'persisted-active-changed-key',
      record: { ...state.approvalRecord },
      now: active,
      journalDir: freshJournalDir('persisted-active-changed-key'),
      retryKey: KEY_B,
      expectExecuted: false
    })
  )
  results.push(
    await runVariant({
      label: 'persisted-proven-absent',
      record: {
        ...state.approvalRecord,
        status: 'RESERVED',
        operationKey: opKey(TENANT, KEY_A)
      },
      now: active,
      journalDir: emptyJournalDir('persisted-proven-absent'),
      retryKey: KEY_B,
      expectExecuted: true
    })
  )
  results.push(
    await runVariant({
      label: 'legacy-expired-changed-key',
      record: withoutOperationKey(state.approvalRecord),
      now: expired,
      journalDir: freshJournalDir('legacy-expired-changed-key'),
      retryKey: KEY_B,
      expectExecuted: false
    })
  )

  const invariants = results.map((result) => {
    if (result.expectExecuted === true) {
      return (
        result.outcome === 'executed' &&
        result.retryToolCalls === 1 &&
        result.journalAStateAfter === 'CONFIRMED' &&
        result.journalBStateAfter === null &&
        result.approvalOperationKeyAfter === opKey(TENANT, KEY_A) &&
        Array.isArray(result.retryOutboxKeys) &&
        result.retryOutboxKeys[0] === opKey(TENANT, KEY_A)
      )
    }
    return (
      result.outcome === 'denied' &&
      result.retryToolCalls === 0 &&
      (result.retryOutboxKeys as string[]).length === 0
    )
  })
  console.log(
    JSON.stringify(
      {
        probe: 'AAA-07-P1-2R-legacy-rearm',
        observedAt: new Date().toISOString(),
        crashState: {
          approvalStatus: state.approvalRecord.status,
          approvalOperationKey: state.approvalRecord.operationKey ?? null,
          journalAStateAtCrash: state.journalRecord.state
        },
        results,
        invariants
      },
      null,
      2
    )
  )
  if (invariants.some((held) => held !== true)) {
    process.exitCode = 1
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === 'crash-child') {
    await crashChild()
    return
  }
  mkdirSync(ROOT, { recursive: true })
  const child = spawnSync(
    'npx',
    ['tsx', fileURLToPath(import.meta.url), 'crash-child'],
    {
      cwd: '/home/ricardo/cvg-agent-secretary-v2',
      stdio: ['ignore', 'inherit', 'inherit']
    }
  )
  console.log(
    JSON.stringify({
      probe: 'AAA-07-P1-2R-crash-child',
      status: child.status
    })
  )
  await adjudicate()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
