// P1 falsification probe T-19 (AAA-09 acceptance item / contract §10 Q2):
// declared real_authorized without authorization, and undeclared high-risk
// capability, must both deny with real_effect_not_authorized and zero executor
// calls.
import {
  buildHarness,
  turnInput,
  report
} from './harness.ts'

async function main(): Promise<void> {
  const failures: string[] = []

  // 1) High-risk capability declared real_authorized but not authorized.
  const h1 = buildHarness({
    effectScopes: { 'appointment.cancel': 'real_authorized' }
  })
  const r1 = await h1.runtime.runTurn(turnInput())
  if (r1.outcome !== 'denied' || r1.reason !== 'real_effect_not_authorized') {
    failures.push(`declared-unauthorized outcome=${r1.outcome}/${r1.reason}`)
  }
  if (h1.toolCalls() !== 0) failures.push(`declared-unauthorized toolCalls=${h1.toolCalls()}`)
  if (h1.providerCalls() !== 0) failures.push(`declared-unauthorized providerCalls=${h1.providerCalls()}`)
  if (h1.outboxCalls() !== 0) failures.push(`declared-unauthorized outboxCalls=${h1.outboxCalls()}`)

  // 2) Undeclared high-risk capability.
  const h2 = buildHarness({})
  const r2 = await h2.runtime.runTurn(turnInput())
  if (r2.outcome !== 'denied' || r2.reason !== 'real_effect_not_authorized') {
    failures.push(`undeclared outcome=${r2.outcome}/${r2.reason}`)
  }
  if (h2.toolCalls() !== 0) failures.push(`undeclared toolCalls=${h2.toolCalls()}`)
  if (h2.providerCalls() !== 0) failures.push(`undeclared providerCalls=${h2.providerCalls()}`)

  // 3) Declared real_authorized, authorized: must NOT be blocked by T-19 guard
  //    (policy then requires approval, which is the expected next step).
  const h3 = buildHarness({
    effectScopes: { 'appointment.cancel': 'real_authorized' },
    realEffectAuthorizations: ['appointment.cancel']
  })
  const r3 = await h3.runtime.runTurn(turnInput())
  if (r3.outcome === 'denied' && r3.reason === 'real_effect_not_authorized') {
    failures.push('authorized capability still denied by T-19 guard')
  }

  // 4) Declared real_authorized without authorization for a MEDIUM risk
  //    capability (message.send) must also fail closed.
  const h4 = buildHarness({ effectScopes: { 'message.send': 'real_authorized' } })
  const r4 = await h4.runtime.runTurn(
    turnInput({ capability: 'message.send', action: 'message.send', resource: { type: 'message' } })
  )
  if (r4.outcome !== 'denied' || r4.reason !== 'real_effect_not_authorized') {
    failures.push(`medium declared-unauthorized outcome=${r4.outcome}/${r4.reason}`)
  }
  if (h4.toolCalls() !== 0) failures.push(`medium declared-unauthorized toolCalls=${h4.toolCalls()}`)

  report('T19-real-effect-gate', {
    declaredUnauthorized: { outcome: r1.outcome, reason: r1.reason, toolCalls: h1.toolCalls() },
    undeclaredHighRisk: { outcome: r2.outcome, reason: r2.reason, toolCalls: h2.toolCalls() },
    authorized: { outcome: r3.outcome, reason: r3.reason },
    mediumDeclaredUnauthorized: { outcome: r4.outcome, reason: r4.reason, toolCalls: h4.toolCalls() },
    failures
  })

  console.log(JSON.stringify({ probe: 'T-19', falsified: failures.length > 0, failures }))
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
