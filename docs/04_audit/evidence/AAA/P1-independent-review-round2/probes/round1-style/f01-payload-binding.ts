// P1 falsification probe F01 (AAA-09 T-01/T-02):
// approval proposal payload = A; caller supplies B; model has B available.
// Expected: tool receives exactly A; B is denied before the tool.
import {
  buildHarness,
  approveApproval,
  turnInput,
  FAKE_CANCEL_SCOPE,
  report
} from './harness.ts'
import { InMemoryEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'

async function main(): Promise<void> {
  const failures: string[] = []

  // F01 fail-closed control: without a durable journal a high-risk effect is
  // denied before the tool (durability_required).
  const h0 = buildHarness({ effectScopes: FAKE_CANCEL_SCOPE })
  const req0 = await h0.runtime.runTurn(turnInput())
  approveApproval(h0, req0.approvalId ?? '')
  const deniedNoJournal = await h0.runtime.runTurn(
    turnInput({ approvalId: req0.approvalId ?? '' })
  )
  const noJournalOk =
    deniedNoJournal.outcome === 'denied' &&
    deniedNoJournal.reason === 'durability_required' &&
    h0.toolCalls() === 0

  // Scenario 1: execution turn uses approval.proposalPayload exclusively and
  // never regenerates the payload (model responses contain A then B).
  const h1 = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: new InMemoryEffectJournal(),
    responses: [
      JSON.stringify({ text: 'APPROVED_PAYLOAD' }),
      JSON.stringify({ text: 'UNAPPROVED_MODEL_PAYLOAD' })
    ]
  })
  const requested = await h1.runtime.runTurn(turnInput())
  const approvalId = requested.approvalId ?? ''
  const stored = h1.approvals.get('tenant_00000000-0000-4000-8000-000000000001', approvalId)
  approveApproval(h1, approvalId)

  const executed = await h1.runtime.runTurn(turnInput({ approvalId }))
  const toolPayload = h1.toolInvocations[0]?.payload

  if (requested.outcome !== 'approval_required') failures.push('request outcome != approval_required')
  if (requested.outcome === 'denied') failures.push(`request denied: ${requested.reason}`)
  if (stored.proposalPayload === undefined) failures.push('approval has no stored proposalPayload')
  if (executed.outcome !== 'executed') failures.push(`execution outcome ${executed.outcome}: ${executed.reason}`)
  if (JSON.stringify(toolPayload) !== JSON.stringify({ text: 'APPROVED_PAYLOAD' })) {
    failures.push(`tool received ${JSON.stringify(toolPayload)} instead of A`)
  }
  if (h1.providerCalls() !== 1) failures.push(`execution turn called model (providerCalls=${h1.providerCalls()})`)
  if (h1.outboxCalls() !== 1) failures.push(`outbox calls = ${h1.outboxCalls()}`)

  report('F01-scenario0-fail-closed-no-journal', {
    outcome: deniedNoJournal.outcome,
    reason: deniedNoJournal.reason,
    toolCalls: h0.toolCalls(),
    ok: noJournalOk
  })

  report('F01-scenario1-tool-gets-A', {
    approvalStatus: h1.approvals.get('tenant_00000000-0000-4000-8000-000000000001', approvalId).status,
    outcome: executed.outcome,
    reason: executed.reason,
    toolPayload,
    toolCalls: h1.toolCalls(),
    providerCalls: h1.providerCalls(),
    outboxCalls: h1.outboxCalls(),
    failures
  })

  // Scenario 2: caller supplies approvalPayload B -> payload_mismatch, zero tool.
  const h2 = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: new InMemoryEffectJournal()
  })
  const req2 = await h2.runtime.runTurn(turnInput())
  const approvalId2 = req2.approvalId ?? ''
  approveApproval(h2, approvalId2)
  const denied = await h2.runtime.runTurn(
    turnInput({ approvalId: approvalId2, approvalPayload: { text: 'CALLER_B_PAYLOAD' } })
  )
  const failures2: string[] = []
  if (denied.outcome !== 'denied' || denied.reason !== 'payload_mismatch') {
    failures2.push(`expected denied/payload_mismatch, got ${denied.outcome}/${denied.reason}`)
  }
  if (h2.toolCalls() !== 0) failures2.push(`tool executed ${h2.toolCalls()} time(s)`)
  if (h2.outboxCalls() !== 0) failures2.push(`outbox executed ${h2.outboxCalls()} time(s)`)
  const status2 = h2.approvals.get('tenant_00000000-0000-4000-8000-000000000001', approvalId2).status
  if (status2 !== 'APPROVED') failures2.push(`approval status mutated to ${status2}`)

  report('F01-scenario2-caller-B-denied', {
    outcome: denied.outcome,
    reason: denied.reason,
    approvalStatus: status2,
    toolCalls: h2.toolCalls(),
    outboxCalls: h2.outboxCalls(),
    failures: failures2
  })

  const all = [...failures, ...failures2]
  if (!noJournalOk) {
    all.push(
      `fail-closed control broken: no-journal execution was ${deniedNoJournal.outcome}/${deniedNoJournal.reason}`
    )
  }
  console.log(JSON.stringify({ probe: 'F01', falsified: all.length > 0, failures: all }))
  if (all.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
