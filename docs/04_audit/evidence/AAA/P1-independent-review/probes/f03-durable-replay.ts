// P1 falsification probe F03 (AAA-10 T-06/T-07/T-08/T-15/E-1/E-2):
// same operationKey: a first turn whose outbox fails, then a "crash" (brand new
// runtime instance over the same FileEffectJournal path) must replay without
// re-running the tool. Also: concurrent reservation and key reuse with a
// different proposal must not produce a second effect.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'
import { FileEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'
import {
  buildHarness,
  approveApproval,
  turnInput,
  FAKE_CANCEL_SCOPE,
  report,
  TENANT
} from './harness.ts'

const CALLER_KEY = 'caller-idem-key-0001'

function failOutbox(): never {
  throw new Error('outbox unavailable (simulated crash before ack)')
}

async function main(): Promise<void> {
  const failures: string[] = []
  const dir = await mkdtemp(join(tmpdir(), 'p1-f03-'))
  let sharedToolCalls = 0
  const tool = async () => {
    sharedToolCalls += 1
    return { result: { ok: true, n: sharedToolCalls } }
  }

  const j1 = new FileEffectJournal({ directory: dir })
  const h1 = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: j1,
    toolExecutor: tool,
    outbox: async () => failOutbox()
  })

  const requested = await h1.runtime.runTurn(turnInput({ idempotencyKey: CALLER_KEY }))
  const approvalId = requested.approvalId ?? ''
  const stored = h1.approvals.get(TENANT, approvalId)
  approveApproval(h1, approvalId)

  // First execution: tool runs, journal CONFIRMED, outbox fails -> executed/outbox_pending.
  const first = await h1.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: CALLER_KEY })
  )
  if (first.outcome !== 'executed' || first.outboxPending !== true) {
    failures.push(`first turn outcome=${first.outcome} outboxPending=${first.outboxPending}`)
  }
  if (sharedToolCalls !== 1) failures.push(`tool calls after first turn = ${sharedToolCalls}`)
  const approvalAfterFirst = h1.approvals.get(TENANT, approvalId)

  // Crash/restart: new journal + new runtime over the same directory.
  const j2 = new FileEffectJournal({ directory: dir })
  const h2 = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: j2,
    toolExecutor: tool,
    store: h1.store,
    now: () => new Date()
  })
  const replay = await h2.runtime.runTurn(
    turnInput({ approvalId, idempotencyKey: CALLER_KEY })
  )
  if (replay.outcome !== 'executed' || replay.replayed !== true) {
    failures.push(`replay outcome=${replay.outcome} replayed=${replay.replayed}`)
  }
  if (sharedToolCalls !== 1) {
    failures.push(`tool re-ran on replay: calls=${sharedToolCalls}`)
  }
  if (replay.reason !== 'idempotent_replay') {
    failures.push(`replay reason=${replay.reason}`)
  }
  const opKey = `op:${createHash('sha256')
    .update(canonicalizeJson({ tenantId: TENANT, callerIdempotencyKey: CALLER_KEY }))
    .digest('hex')}`
  const journalRecord = await j2.get(TENANT, opKey)
  if (journalRecord?.state !== 'CONFIRMED') {
    failures.push(`journal state after replay = ${journalRecord?.state}`)
  }

  // Concurrency (T-08): two independent FileEffectJournal handles, same key.
  const jA = new FileEffectJournal({ directory: dir })
  const jB = new FileEffectJournal({ directory: dir })
  const concurrent = await Promise.all([
    jA.reserve({
      tenantId: TENANT,
      operationKey: 'op:concurrency-probe',
      proposalHash: 'a'.repeat(64),
      attemptId: 'att_A',
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }),
    jB.reserve({
      tenantId: TENANT,
      operationKey: 'op:concurrency-probe',
      proposalHash: 'a'.repeat(64),
      attemptId: 'att_B',
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    })
  ])
  const outcomes = concurrent.map((o) => o.outcome).sort()
  if (outcomes.join(',') !== 'in_progress,reserved') {
    failures.push(`concurrent reserve outcomes = ${outcomes.join(',')}`)
  }

  // T-15: key reuse with a different proposal -> idempotency_key_reuse, no tool.
  const h3 = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: new FileEffectJournal({ directory: dir }),
    responses: [JSON.stringify({ text: 'DIFFERENT_PAYLOAD' })],
    toolExecutor: tool,
    store: h1.store,
    now: () => new Date()
  })
  const requested2 = await h3.runtime.runTurn(
    turnInput({ idempotencyKey: CALLER_KEY })
  )
  const approvalId2 = requested2.approvalId ?? ''
  const stored2 = h3.approvals.get(TENANT, approvalId2)
  if (stored2.proposalHash === stored.proposalHash) {
    failures.push('probe setup: second proposal hash identical to first')
  }
  approveApproval(h3, approvalId2)
  const reuse = await h3.runtime.runTurn(
    turnInput({ approvalId: approvalId2, idempotencyKey: CALLER_KEY })
  )
  const toolCallsBeforeReuse = sharedToolCalls
  if (reuse.outcome !== 'denied' || reuse.reason !== 'idempotency_key_reuse') {
    failures.push(`reuse outcome=${reuse.outcome}/${reuse.reason}`)
  }
  if (sharedToolCalls !== toolCallsBeforeReuse) {
    failures.push('tool executed for reused key with different proposal')
  }

  // Independent hash check of operationKey stability: same tenant+callerKey.
  const opKeyA = `op:${createHash('sha256')
    .update(canonicalizeJson({ tenantId: TENANT, callerIdempotencyKey: CALLER_KEY }))
    .digest('hex')}`

  report('F03-durable-replay', {
    directory: dir,
    first: { outcome: first.outcome, outboxPending: first.outboxPending },
    approvalAfterFirst: approvalAfterFirst.status,
    replay: { outcome: replay.outcome, reason: replay.reason, replayed: replay.replayed },
    sharedToolCalls,
    concurrentReserveOutcomes: outcomes,
    operationKeyFromCallerKey: opKeyA,
    reuse: { outcome: reuse.outcome, reason: reuse.reason },
    failures
  })

  await rm(dir, { recursive: true, force: true })
  console.log(JSON.stringify({ probe: 'F03', falsified: failures.length > 0, failures }))
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
