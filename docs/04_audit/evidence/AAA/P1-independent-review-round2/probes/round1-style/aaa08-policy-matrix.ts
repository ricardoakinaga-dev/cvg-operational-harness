// P1 falsification probe AAA-08 (T-12/T-13, F15 draft x real):
// policy matrix for draft vs real and the runtime denial of a real modify.
import { buildHarness, turnInput, report, TENANT } from './harness.ts'
import { PolicyEngine } from '@cvg/policy-engine'

const base = {
  tenantId: TENANT,
  operatorId: 'op_1',
  operatorRole: 'Supervisor' as const,
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentProfile: 'secretary' as const,
  correlationId: 'corr_00000000-0000-4000-8000-000000000008',
  context: { dataClassification: 'INTERNAL' as const }
}

async function main(): Promise<void> {
  const failures: string[] = []
  const policy = new PolicyEngine()

  const cases: Array<{
    name: string
    evaluate: () => { decision: string; reason: string }
    expected: string
  }> = [
    {
      name: 'appointment.modify on real appointment',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.modify',
          action: 'appointment.modify',
          resource: { type: 'appointment', id: 'apt_1' }
        }),
      expected: 'DENY'
    },
    {
      name: 'appointment.modify on appointment_draft',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.modify',
          action: 'appointment.modify',
          resource: { type: 'appointment_draft', id: 'drf_1' }
        }),
      expected: 'ALLOW'
    },
    {
      name: 'appointment.confirm',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.confirm',
          action: 'appointment.confirm',
          resource: { type: 'appointment', id: 'apt_1' }
        }),
      expected: 'DENY'
    },
    {
      name: 'appointment.reschedule',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.reschedule',
          action: 'appointment.reschedule',
          resource: { type: 'appointment', id: 'apt_1' }
        }),
      expected: 'DENY'
    },
    {
      name: 'appointment.create with no resource type',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.create',
          action: 'appointment.create'
        }),
      expected: 'DENY'
    },
    {
      name: 'appointment.create on appointment_draft',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.create',
          action: 'appointment.create',
          resource: { type: 'appointment_draft' }
        }),
      expected: 'ALLOW'
    },
    {
      name: 'appointment.cancel on draft resource',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.cancel',
          action: 'appointment.cancel',
          resource: { type: 'appointment_draft', id: 'drf_1' }
        }),
      expected: 'DENY'
    },
    {
      name: 'missing context (no operatorRole)',
      evaluate: () =>
        policy.evaluate({
          ...base,
          operatorRole: undefined as never,
          capability: 'schedule.read',
          action: 'schedule.read',
          resource: { type: 'schedule' }
        }),
      expected: 'DENY'
    },
    {
      name: 'resource tenant mismatch',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.cancel',
          action: 'appointment.cancel',
          resource: {
            type: 'appointment',
            id: 'apt_1',
            tenantId: 'tenant_other'
          }
        }),
      expected: 'DENY'
    },
    {
      name: 'action smuggled under modify capability',
      evaluate: () =>
        policy.evaluate({
          ...base,
          capability: 'appointment.modify',
          action: 'appointment.confirm',
          resource: { type: 'appointment_draft', id: 'drf_1' }
        }),
      expected: 'DENY'
    }
  ]

  const observed: Record<string, string> = {}
  for (const c of cases) {
    const d = c.evaluate()
    observed[c.name] = `${d.decision}:${d.reason}`
    if (d.decision !== c.expected) {
      failures.push(
        `${c.name}: expected ${c.expected}, got ${d.decision} (${d.reason})`
      )
    }
  }

  // F15 reproduction through the governed runtime: no tool is ever reached.
  const h = buildHarness()
  const r = await h.runtime.runTurn(
    turnInput({
      capability: 'appointment.modify',
      action: 'appointment.modify',
      resource: { type: 'appointment', id: 'apt_real', tenantId: TENANT }
    })
  )
  if (r.outcome !== 'denied')
    failures.push(`F15 runtime outcome=${r.outcome}/${r.reason}`)
  if (h.toolCalls() !== 0)
    failures.push(`F15 runtime toolCalls=${h.toolCalls()}`)
  if (h.providerCalls() !== 0)
    failures.push(`F15 runtime providerCalls=${h.providerCalls()}`)

  // Real confirm/reschedule through the runtime: policy DENY, zero tool.
  for (const capability of [
    'appointment.confirm',
    'appointment.reschedule'
  ] as const) {
    const hx = buildHarness()
    const rx = await hx.runtime.runTurn(
      turnInput({
        capability,
        action: capability,
        resource: { type: 'appointment', id: 'apt_real', tenantId: TENANT }
      })
    )
    if (rx.outcome !== 'denied')
      failures.push(`${capability} runtime=${rx.outcome}/${rx.reason}`)
    if (hx.toolCalls() !== 0)
      failures.push(`${capability} toolCalls=${hx.toolCalls()}`)
  }

  report('AAA08-draft-real-matrix', {
    observed,
    f15Runtime: {
      outcome: r.outcome,
      reason: r.reason,
      toolCalls: h.toolCalls()
    },
    failures
  })

  console.log(
    JSON.stringify({
      probe: 'AAA-08',
      falsified: failures.length > 0,
      failures
    })
  )
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
