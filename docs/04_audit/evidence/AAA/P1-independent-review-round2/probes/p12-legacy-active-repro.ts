// P1-2 residual reproduction: pre-fix (legacy) persisted approval record, real
// child crash after EFFECT_STARTED, retry with a changed caller key while the
// reservation lease is still ACTIVE. No TTL expiry, no sweep transition.
// Expected safe behavior: denied / UNCERTAIN, tool 0. Observed on this tree:
// re-execution under the changed key while the original EFFECT_STARTED record
// is orphaned.
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
import { GovernedAgentRuntime } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/runtime.ts'
import { FileEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'
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
const ROOT = '/tmp/opencode/p1-review2-20260913T053543Z/p12-legacy-repro'
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
  journal: FileEffectJournal
  now: () => Date
  toolExecutor: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  outboxCounter: string[]
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
      options.outboxCounter.push(event.idempotencyKey)
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
    outboxCounter: []
  })
  const requested = await runtime.runTurn(turnInput({ idempotencyKey: KEY_A }))
  approvalId = requested.approvalId ?? ''
  approvals.submit(TENANT, approvalId, 'op_1')
  approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  await runtime.runTurn(turnInput({ approvalId, idempotencyKey: KEY_A }))
  process.exit(98)
}

async function adjudicate(): Promise<void> {
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as {
    approvalRecord: ApprovalRecord
    journalRecord: { state: string }
  }
  const effectsBefore = readFileSync(EFFECT_LOG, 'utf8').length
  const results: Record<string, unknown>[] = []

  for (const variant of ['persisted', 'legacy', 'legacy-absent-key'] as const) {
    const record =
      variant === 'persisted'
        ? state.approvalRecord
        : (() => {
            const copy = { ...state.approvalRecord }
            delete (copy as { operationKey?: string }).operationKey
            return copy
          })()
    // Fresh copy of the crashed journal per variant.
    const variantDir = join(ROOT, `journal-${variant}`)
    rmSync(variantDir, { recursive: true, force: true })
    cpSync(JOURNAL_DIR, variantDir, { recursive: true })
    const nowValue = new Date(T0.getTime() + 500) // ACTIVE lease (expires T0+TTL)
    const now = () => nowValue
    const journal = new FileEffectJournal({ directory: variantDir, clock: now })
    const store = new InMemoryApprovalStore()
    store.insert(record)
    const approvals = new ApprovalEngine({
      store,
      clock: now,
      reservationTtlMs: TTL
    })
    const outboxKeys: string[] = []
    let toolCalls = 0
    const runtime = buildRuntime({
      approvals,
      journal,
      now,
      toolExecutor: async () => {
        toolCalls += 1
        appendFileSync(EFFECT_LOG, `EFFECT-${variant}\n`)
        return { result: { ok: true } }
      },
      outboxCounter: outboxKeys
    })
    const retry = await runtime.runTurn(
      turnInput({
        approvalId: record.approvalId,
        ...(variant === 'legacy-absent-key' ? {} : { idempotencyKey: KEY_B })
      })
    )
    const after = approvals.get(TENANT, record.approvalId)
    const journalA = await journal.get(TENANT, opKey(TENANT, KEY_A))
    const journalB = await journal.get(TENANT, opKey(TENANT, KEY_B))
    results.push({
      variant,
      inputRecordHadOperationKey:
        state.approvalRecord.operationKey !== undefined,
      variantRecordOperationKey: record.operationKey ?? null,
      leaseActiveAtRetry: true,
      outcome: retry.outcome,
      reason: retry.reason,
      approvalStatusAfter: after.status,
      approvalOperationKeyAfter: after.operationKey ?? null,
      journalAStateAfter: journalA?.state,
      journalBStateAfter: journalB?.state,
      retryToolCalls: toolCalls,
      retryOutboxKeys: outboxKeys
    })
  }
  const effectsAfter = readFileSync(EFFECT_LOG, 'utf8').length
  console.log(
    JSON.stringify({
      probe: 'P1-2-legacy-active-repro',
      crashState: {
        approvalOperationKey: state.approvalRecord.operationKey ?? null,
        approvalStatus: state.approvalRecord.status,
        journalAStateAtCrash: state.journalRecord.state
      },
      effectsLogGrew: effectsAfter - effectsBefore > 0,
      results
    })
  )
  const legacy = results.find((r) => r.variant === 'legacy')
  const legacyAbsent = results.find((r) => r.variant === 'legacy-absent-key')
  const persisted = results.find((r) => r.variant === 'persisted')
  const ok =
    persisted?.outcome === 'denied' &&
    persisted?.retryToolCalls === 0 &&
    legacy?.outcome !== 'executed' &&
    legacy?.retryToolCalls === 0 &&
    legacyAbsent?.outcome !== 'executed' &&
    legacyAbsent?.retryToolCalls === 0
  if (!ok) process.exitCode = 1
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
    JSON.stringify({ probe: 'P1-2-legacy-child-exit', status: child.status })
  )
  await adjudicate()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
