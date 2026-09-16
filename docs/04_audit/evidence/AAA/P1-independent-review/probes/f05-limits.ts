// P1 falsification probe F05 (AAA-11 T-09/T-10/T-11):
// maxSteps=1, deadline mid-turn and cancellation mid-turn must stop before any
// tool/outbox step and leave no pending span.
import { buildHarness, turnInput, report, NOW, TENANT } from './harness.ts'

function stubResult(
  requestId: string,
  correlationId: string,
  createdAt: string
) {
  return {
    requestId,
    tenantId: TENANT,
    correlationId,
    providerId: 'stub',
    model: 'stub',
    profile: 'fast' as const,
    output: { text: 'late-result' },
    usage: { inputTokens: 0, outputTokens: 0 },
    costUsd: 0,
    attempts: 1,
    latencyMs: 0,
    promptSha256: 'a'.repeat(64),
    createdAt,
    fallbackUsed: false
  }
}

function readTurn(overrides: Record<string, unknown> = {}) {
  return turnInput({
    capability: 'schedule.read',
    action: 'schedule.read',
    resource: { type: 'schedule' },
    ...overrides
  })
}

async function main(): Promise<void> {
  const failures: string[] = []

  // T-09: maxSteps=1 allows only the model stage; the tool/outbox never start.
  const h1 = buildHarness()
  const r1 = await h1.runtime.runTurn(readTurn({ limits: { maxSteps: 1 } }))
  if (r1.outcome !== 'denied' || r1.reason !== 'steps_budget_exceeded') {
    failures.push(`maxSteps=1 outcome=${r1.outcome}/${r1.reason}`)
  }
  if (h1.toolCalls() !== 0)
    failures.push(`maxSteps=1 toolCalls=${h1.toolCalls()}`)
  if (h1.outboxCalls() !== 0)
    failures.push(`maxSteps=1 outboxCalls=${h1.outboxCalls()}`)
  if (h1.providerCalls() !== 1)
    failures.push(`maxSteps=1 providerCalls=${h1.providerCalls()}`)
  if (h1.tracker.open.size !== 0) {
    failures.push(`maxSteps=1 pending spans=${[...h1.tracker.open].join(',')}`)
  }
  report('F05-maxSteps1', {
    outcome: r1.outcome,
    reason: r1.reason,
    toolCalls: h1.toolCalls(),
    outboxCalls: h1.outboxCalls(),
    providerCalls: h1.providerCalls(),
    spansStarted: h1.tracker.started,
    spansEnded: h1.tracker.ended,
    pendingSpans: h1.tracker.open.size,
    spanNames: h1.tracker.names
  })

  // T-10: dependency exceeds the deadline and ignores AbortSignal.
  let nowMs = NOW.getTime()
  const clock = () => new Date(nowMs)
  const slowGateway = {
    async generate(req: { requestId: string; correlationId: string }) {
      nowMs += 500
      return stubResult(
        req.requestId,
        req.correlationId,
        new Date(nowMs).toISOString()
      )
    }
  }
  const h2 = buildHarness({ now: clock, modelGateway: slowGateway })
  const r2 = await h2.runtime.runTurn(
    readTurn({ limits: { maxDurationMs: 100 } })
  )
  if (r2.outcome !== 'denied' || r2.reason !== 'loop_deadline_exceeded') {
    failures.push(`deadline outcome=${r2.outcome}/${r2.reason}`)
  }
  if (h2.toolCalls() !== 0)
    failures.push(`deadline toolCalls=${h2.toolCalls()}`)
  if (h2.outboxCalls() !== 0)
    failures.push(`deadline outboxCalls=${h2.outboxCalls()}`)
  if (h2.tracker.open.size !== 0) {
    failures.push(`deadline pending spans=${[...h2.tracker.open].join(',')}`)
  }
  report('F05-deadline', {
    outcome: r2.outcome,
    reason: r2.reason,
    toolCalls: h2.toolCalls(),
    outboxCalls: h2.outboxCalls(),
    pendingSpans: h2.tracker.open.size,
    spanNames: h2.tracker.names
  })

  // T-11: cancel signal aborts while the model is running.
  const controller = new AbortController()
  const cancelGateway = {
    async generate(req: { requestId: string; correlationId: string }) {
      controller.abort()
      return stubResult(req.requestId, req.correlationId, NOW.toISOString())
    }
  }
  const h3 = buildHarness({ modelGateway: cancelGateway })
  const r3 = await h3.runtime.runTurn(
    readTurn({ cancelSignal: controller.signal })
  )
  if (r3.outcome !== 'denied' || r3.reason !== 'turn_cancelled') {
    failures.push(`cancel outcome=${r3.outcome}/${r3.reason}`)
  }
  if (h3.toolCalls() !== 0) failures.push(`cancel toolCalls=${h3.toolCalls()}`)
  if (h3.outboxCalls() !== 0)
    failures.push(`cancel outboxCalls=${h3.outboxCalls()}`)
  if (h3.tracker.open.size !== 0) {
    failures.push(`cancel pending spans=${[...h3.tracker.open].join(',')}`)
  }
  report('F05-cancel', {
    outcome: r3.outcome,
    reason: r3.reason,
    toolCalls: h3.toolCalls(),
    outboxCalls: h3.outboxCalls(),
    pendingSpans: h3.tracker.open.size,
    spanNames: h3.tracker.names
  })

  console.log(
    JSON.stringify({ probe: 'F05', falsified: failures.length > 0, failures })
  )
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
