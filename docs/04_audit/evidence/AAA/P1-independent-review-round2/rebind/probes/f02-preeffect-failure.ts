// P1 falsification probe F02 (AAA-07 T-04 / AAA-09):
// force a pre-effect tool failure (ToolExecutionError certainty=no_effect).
// Expected: approval is never EXECUTED, journal is EFFECT_FAILED, retry with
// the same operationKey is allowed and a duplicate effect is not produced.
import { ToolExecutionError } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/contracts.ts'
import { ModelGatewayError } from '@cvg/model-gateway'
import {
  buildHarness,
  approveApproval,
  turnInput,
  FAKE_CANCEL_SCOPE,
  report,
  TENANT
} from './harness.ts'
import { InMemoryEffectJournal } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts'
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'

const FAIL_CODE = 'adapter_precheck_failed'

function operationKeyFor(proposalHash: string): string {
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

async function main(): Promise<void> {
  const failures: string[] = []
  const journal = new InMemoryEffectJournal()
  let attempts = 0
  const h = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: journal,
    toolExecutor: async () => {
      attempts += 1
      if (attempts === 1) {
        throw new ToolExecutionError(FAIL_CODE, 'pre-effect adapter failure', {
          certainty: 'no_effect'
        })
      }
      return { result: { ok: 'second-attempt-result' } }
    }
  })

  const requested = await h.runtime.runTurn(turnInput())
  const approvalId = requested.approvalId ?? ''
  const record = h.approvals.get(TENANT, approvalId)
  approveApproval(h, approvalId)

  const first = await h.runtime.runTurn(turnInput({ approvalId }))
  const afterFirst = h.approvals.get(TENANT, approvalId)
  const journalRecord = await journal.get(
    TENANT,
    operationKeyFor(record.proposalHash ?? '')
  )

  if (first.outcome !== 'denied' || first.reason !== FAIL_CODE) {
    failures.push(`first outcome ${first.outcome}/${first.reason}`)
  }
  if (afterFirst.status !== 'APPROVED') {
    failures.push(
      `approval status after pre-effect failure = ${afterFirst.status}`
    )
  }
  if (afterFirst.status === 'EXECUTED')
    failures.push('approval falsely EXECUTED')
  if (journalRecord?.state !== 'EFFECT_FAILED') {
    failures.push(`journal state = ${journalRecord?.state}`)
  }
  if (h.outboxCalls() !== 0) failures.push(`outbox calls = ${h.outboxCalls()}`)
  if (h.toolCalls() !== 1)
    failures.push(`tool calls after first turn = ${h.toolCalls()}`)

  // Retry E-1: same approval/operationKey may re-arm; effect confirmed once.
  const second = await h.runtime.runTurn(turnInput({ approvalId }))
  const afterSecond = h.approvals.get(TENANT, approvalId)
  const journalAfter = await journal.get(
    TENANT,
    operationKeyFor(record.proposalHash ?? '')
  )

  if (second.outcome !== 'executed') {
    failures.push(`retry outcome ${second.outcome}/${second.reason}`)
  }
  if (afterSecond.status !== 'EXECUTED') {
    failures.push(`approval after retry = ${afterSecond.status}`)
  }
  if (journalAfter?.state !== 'CONFIRMED') {
    failures.push(`journal after retry = ${journalAfter?.state}`)
  }
  if (h.toolCalls() !== 2)
    failures.push(`tool calls after retry = ${h.toolCalls()}`)
  if (h.outboxCalls() !== 1)
    failures.push(`outbox calls after retry = ${h.outboxCalls()}`)

  report('F02-pre-effect-failure', {
    first: { outcome: first.outcome, reason: first.reason },
    approvalAfterFirst: afterFirst.status,
    journalAfterFirst: journalRecord?.state ?? null,
    second: { outcome: second.outcome, reason: second.reason },
    approvalAfterSecond: afterSecond.status,
    journalAfterSecond: journalAfter?.state ?? null,
    toolCalls: h.toolCalls(),
    outboxCalls: h.outboxCalls(),
    failures
  })

  // T-03: model failure in the request turn never creates an approval/effect.
  const failingGateway = {
    async generate() {
      throw new ModelGatewayError(
        'provider_unavailable',
        'probe model outage',
        {
          retryable: true
        }
      )
    }
  }
  const hModel = buildHarness({
    effectScopes: FAKE_CANCEL_SCOPE,
    effectJournal: new InMemoryEffectJournal(),
    modelGateway: failingGateway
  })
  const modelFailed = await hModel.runtime.runTurn(turnInput())
  if (
    modelFailed.outcome !== 'denied' ||
    modelFailed.reason !== 'provider_unavailable'
  ) {
    failures.push(
      `model failure outcome=${modelFailed.outcome}/${modelFailed.reason}`
    )
  }
  if (hModel.approvals.list(TENANT).length !== 0) {
    failures.push(
      `model failure created ${hModel.approvals.list(TENANT).length} approval(s)`
    )
  }
  if (hModel.toolCalls() !== 0)
    failures.push(`model failure toolCalls=${hModel.toolCalls()}`)
  report('F02-model-failure', {
    outcome: modelFailed.outcome,
    reason: modelFailed.reason,
    approvals: hModel.approvals.list(TENANT).length,
    toolCalls: hModel.toolCalls()
  })

  console.log(
    JSON.stringify({ probe: 'F02', falsified: failures.length > 0, failures })
  )
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
