// P1-2R residual corner probe (multi-generation legacy approval).
// Declared out of scope by docs/04_audit/evidence/AAA/AAA-07/sweep-legacy-fix/limitations.md.
// State: keyless (legacy) approval, expired reservation; derived proposal key has
// a no-effect record (EFFECT_FAILED) while caller key A has EFFECT_STARTED.
// Question: does the tenant-wide sweep still release to APPROVED and allow a new
// execution under the derived key while the A record stays orphaned?
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalizeJson } from '@cvg/shared'
import {
  ApprovalEngine,
  InMemoryApprovalStore
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
import { InMemoryEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'
import type {
  EffectScope,
  GovernedTurnInput,
  OutboxEnqueueInput
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const T0 = new Date('2026-09-12T12:00:00.000Z')
const TTL = 1_000
const KEY_A = 'caller-idempotency-A'
const PAYLOAD_SCHEMA = z.object({ text: z.string() })
const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

let now = new Date(T0.getTime())
const clock = () => now

function derivedKey(tenantId: string, proposalHash: string): string {
  const canonical = canonicalizeJson({
    tenantId,
    capability: 'appointment.cancel',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1' },
    proposalHash
  })
  return `op:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}
function callerKey(tenantId: string, key: string): string {
  const canonical = canonicalizeJson({ tenantId, callerIdempotencyKey: key })
  return `op:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
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

function buildRuntime(
  approvals: ApprovalEngine,
  journal: InMemoryEffectJournal,
  onTool: () => void
): GovernedAgentRuntime {
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
    policy: new PolicyEngine({ documents: [], clock }),
    approvals,
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
      clock,
      retry: { maxRetries: 0 }
    }),
    telemetry: new InMemoryTelemetry({ clock }),
    audit: new HashChainedAuditLedger(),
    toolExecutor: async () => {
      onTool()
      return { result: { ok: true } }
    },
    outbox: async (event: OutboxEnqueueInput) => ({
      eventId: `evt_${event.idempotencyKey}`
    }),
    clock,
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: journal,
    reservationTtlMs: TTL
  })
}

async function main(): Promise<void> {
  const journal = new InMemoryEffectJournal({ clock })
  const store = new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock, reservationTtlMs: TTL })
  let toolCalls = 0
  const runtime = buildRuntime(approvals, journal, () => {
    toolCalls += 1
  })

  const requested = await runtime.runTurn(
    turnInput({ idempotencyKey: KEY_A })
  )
  const approvalId = requested.approvalId ?? ''
  approvals.submit(TENANT, approvalId, 'op_1')
  approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
  const stored = approvals.get(TENANT, approvalId)

  // Legacy reservation (no operationKey), expired.
  const reservation = approvals.reserve({
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
  approvals.markExecuting({
    tenantId: TENANT,
    approvalId,
    reservationId: reservation.reservationId
  })
  // Older generation left a no-effect record under the derived candidate key.
  await journal.reserve({
    tenantId: TENANT,
    operationKey: derivedKey(TENANT, stored.proposalHash ?? ''),
    proposalHash: stored.proposalHash ?? '',
    attemptId: 'att-old-gen',
    expiresAt: new Date(T0.getTime() + TTL).toISOString()
  })
  await journal.failEffect({
    tenantId: TENANT,
    operationKey: derivedKey(TENANT, stored.proposalHash ?? ''),
    attemptId: 'att-old-gen',
    errorCode: 'old_generation'
  })
  // Newer generation crashed after EFFECT_STARTED under caller key A.
  await journal.reserve({
    tenantId: TENANT,
    operationKey: callerKey(TENANT, KEY_A),
    proposalHash: stored.proposalHash ?? '',
    attemptId: 'att-new-gen',
    expiresAt: new Date(T0.getTime() + TTL).toISOString()
  })
  await journal.markEffectStarted({
    tenantId: TENANT,
    operationKey: callerKey(TENANT, KEY_A),
    attemptId: 'att-new-gen'
  })

  const callerABeforeSweep = (
    await journal.get(TENANT, callerKey(TENANT, KEY_A))
  )?.state
  const derivedBeforeSweep = (
    await journal.get(TENANT, derivedKey(TENANT, stored.proposalHash ?? ''))
  )?.state
  now = new Date(T0.getTime() + TTL * 2)
  const sweep = await sweepExpiredApprovals({
    approvals,
    effectJournal: journal,
    tenantId: TENANT,
    now,
    ttlMs: TTL
  })
  const afterSweep = approvals.get(TENANT, approvalId)

  // Retry the released approval with no caller key (derived identity).
  const retry = await runtime.runTurn(turnInput({ approvalId }))
  const afterRetry = approvals.get(TENANT, approvalId)
  const derived = derivedKey(TENANT, stored.proposalHash ?? '')
  const derivedState = (await journal.get(TENANT, derived))?.state
  const callerState = (await journal.get(TENANT, callerKey(TENANT, KEY_A)))
    ?.state

  const releasedAndReexecuted =
    sweep.released === 1 &&
    afterSweep.status === 'APPROVED' &&
    retry.outcome === 'executed' &&
    toolCalls === 1 &&
    callerABeforeSweep === 'EFFECT_STARTED' &&
    derivedBeforeSweep === 'EFFECT_FAILED'
  console.log(
    JSON.stringify(
      {
        probe: 'p12r-multigen-corner',
        finding:
          'AA-07/sweep-legacy-fix/limitations.md multi-generation legacy corner',
        setup: {
          keylessApproval: afterSweep.operationKey === undefined,
          derivedOldGeneration: 'EFFECT_FAILED',
          callerA: 'EFFECT_STARTED'
        },
        sweep,
        afterSweepStatus: afterSweep.status,
        retryOutcome: retry.outcome,
        retryReason: retry.reason,
        afterRetryStatus: afterRetry.status,
        toolCalls,
        derivedState,
        callerAState: callerState,
        callerAStateBeforeSweep: callerABeforeSweep,
        derivedStateBeforeSweep: derivedBeforeSweep,
        releasedAndReexecuted,
        note: releasedAndReexecuted
          ? 'CONFIRMED: inherited sweep-only corner can still add a second execution under the derived key while caller key A stays EFFECT_STARTED (legacy multi-generation state only)'
          : 'corner not reproduced on this candidate'
      },
      null,
      2
    )
  )
  if (retry.outcome === 'executed' && toolCalls > 0) process.exitCode = 0
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
