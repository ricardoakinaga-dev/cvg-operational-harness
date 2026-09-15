import { describe, expect, it } from 'vitest'
import { PolicyEngine, type PolicyEvaluationInput } from '../engine.ts'
import { CAPABILITY_RESOURCE_TYPES, type Capability } from '../capabilities.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-12T12:00:00.000Z')

function input(
  overrides: Partial<PolicyEvaluationInput> = {}
): PolicyEvaluationInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_00000000-0000-4000-8000-000000000001',
    operatorRole: 'Supervisor',
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentProfile: 'secretary',
    capability: 'appointment.modify',
    action: 'appointment.modify',
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    ...overrides
  }
}

const policy = new PolicyEngine({ clock: () => NOW })

describe('AB-08 draft vs real capability scope (F15)', () => {
  it('denies modifying a real appointment through the draft capability', () => {
    const decision = policy.evaluate(
      input({
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe('resource_type_not_allowed')
  })

  it('allows modifying an appointment draft', () => {
    const decision = policy.evaluate(
      input({
        resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT }
      })
    )
    expect(decision.decision).toBe('ALLOW')
  })

  it('denies modify without a resource and with an unknown resource type', () => {
    const missing = policy.evaluate(input())
    expect(missing.decision).toBe('DENY')
    expect(missing.reason).toBe('resource_type_required')

    const unknown = policy.evaluate(
      input({ resource: { type: 'slot', id: 'slot_1', tenantId: TENANT } })
    )
    expect(unknown.decision).toBe('DENY')
    expect(unknown.reason).toBe('resource_type_not_allowed')
  })

  it('denies real confirmation and reschedule in the controlled scope', () => {
    for (const profile of [
      'secretary',
      'hospitalization',
      'clinical',
      'financial',
      'admin'
    ] as const) {
      for (const capability of [
        'appointment.confirm',
        'appointment.reschedule'
      ] satisfies Capability[]) {
        const decision = policy.evaluate(
          input({
            agentProfile: profile,
            capability,
            action: capability,
            resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
          })
        )
        expect(decision.decision, `${profile}:${capability}`).toBe('DENY')
        expect(decision.reason, `${profile}:${capability}`).toBe(
          'capability_not_granted'
        )
      }
    }
  })

  it('does not let a tenant policy expand confirm/reschedule authority', () => {
    const expanding = new PolicyEngine({
      clock: () => NOW,
      documents: [
        {
          policyId: 'tenant.expand',
          version: '1.0.0',
          tenantId: TENANT,
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          rules: [
            {
              id: 'allow-confirm',
              effect: 'ALLOW',
              priority: 100,
              capabilities: ['appointment.confirm', 'appointment.reschedule'],
              reason: 'attempt to expand'
            }
          ]
        }
      ]
    })
    for (const capability of [
      'appointment.confirm',
      'appointment.reschedule'
    ] satisfies Capability[]) {
      const decision = expanding.evaluate(
        input({
          capability,
          action: capability,
          resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
        })
      )
      expect(decision.decision, capability).toBe('DENY')
      expect(decision.reason, capability).toBe('capability_not_granted')
    }
  })

  it('keeps cancel behind approval and requires a real appointment resource', () => {
    const withResource = policy.evaluate(
      input({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(withResource.decision).toBe('REQUIRE_APPROVAL')

    const missing = policy.evaluate(
      input({ capability: 'appointment.cancel', action: 'appointment.cancel' })
    )
    expect(missing.decision).toBe('DENY')
    expect(missing.reason).toBe('resource_type_required')

    const wrongType = policy.evaluate(
      input({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT }
      })
    )
    expect(wrongType.decision).toBe('DENY')
    expect(wrongType.reason).toBe('resource_type_not_allowed')
  })

  it('allows creation targets that are a real shell or a draft', () => {
    for (const type of ['appointment', 'appointment_draft']) {
      const decision = policy.evaluate(
        input({
          capability: 'appointment.create',
          action: 'appointment.create',
          resource: { type, id: 'target_1', tenantId: TENANT }
        })
      )
      expect(decision.decision, type).toBe('ALLOW')
    }
  })

  it('keeps tenant mismatch precedence and fail-closed context', () => {
    const mismatch = policy.evaluate(
      input({
        resource: {
          type: 'appointment_draft',
          id: 'draft_1',
          tenantId: OTHER_TENANT
        }
      })
    )
    expect(mismatch.decision).toBe('DENY')
    expect(mismatch.reason).toBe('tenant_mismatch')

    const noCorrelation = policy.evaluate({
      ...input({ resource: { type: 'appointment_draft', id: 'draft_1' } }),
      correlationId: 'x'
    })
    expect(noCorrelation.decision).toBe('DENY')
    expect(noCorrelation.reason).toBe('insufficient_context')
  })

  it('publishes a closed resource map for effect capabilities', () => {
    expect(CAPABILITY_RESOURCE_TYPES['appointment.modify']).toEqual([
      'appointment_draft'
    ])
    expect(CAPABILITY_RESOURCE_TYPES['appointment.confirm']).toEqual([
      'appointment'
    ])
    expect(CAPABILITY_RESOURCE_TYPES['appointment.reschedule']).toEqual([
      'appointment'
    ])
    expect(CAPABILITY_RESOURCE_TYPES['appointment.cancel']).toEqual([
      'appointment'
    ])
  })
})

describe('AAA08-C1-F01 action/capability binding', () => {
  it('denies sensitive actions smuggled through a draft capability', () => {
    for (const action of [
      'appointment.confirm',
      'appointment.reschedule',
      'appointment.cancel'
    ]) {
      const decision = policy.evaluate(
        input({
          capability: 'appointment.modify',
          action,
          resource: {
            type: 'appointment_draft',
            id: 'draft_1',
            tenantId: TENANT
          }
        })
      )
      expect(decision.decision, action).toBe('DENY')
      expect(decision.reason, action).toBe('action_capability_mismatch')
    }
  })

  it('denies sensitive actions smuggled through create or read capabilities', () => {
    const viaCreate = policy.evaluate(
      input({
        capability: 'appointment.create',
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(viaCreate.decision).toBe('DENY')
    expect(viaCreate.reason).toBe('action_capability_mismatch')

    const viaRead = policy.evaluate(
      input({
        capability: 'schedule.read',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(viaRead.decision).toBe('DENY')
    expect(viaRead.reason).toBe('action_capability_mismatch')
  })

  it('keeps declared aliases and rejects undeclared ones', () => {
    const alias = policy.evaluate(
      input({ capability: 'schedule.read', action: 'read' })
    )
    expect(alias.decision).toBe('ALLOW')

    const summaryAlias = policy.evaluate(
      input({ capability: 'patient.summary.read', action: 'read' })
    )
    expect(summaryAlias.decision).toBe('ALLOW')

    const undeclared = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'modify_draft',
        resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT }
      })
    )
    expect(undeclared.decision).toBe('DENY')
    expect(undeclared.reason).toBe('action_capability_mismatch')
  })

  it('does not let tenant policy expand a capability/action mismatch', () => {
    const expanding = new PolicyEngine({
      clock: () => NOW,
      documents: [
        {
          policyId: 'tenant.expand-action',
          version: '1.0.0',
          tenantId: TENANT,
          effectiveFrom: '2026-09-01T00:00:00.000Z',
          rules: [
            {
              id: 'allow-smuggled-confirm',
              effect: 'ALLOW',
              priority: 100,
              capabilities: ['appointment.modify'],
              actions: ['appointment.confirm'],
              reason: 'attempt to expand'
            }
          ]
        }
      ]
    })
    const decision = expanding.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.confirm',
        resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT }
      })
    )
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe('action_capability_mismatch')
  })

  it('keeps legitimate draft, cancel and grant behavior after binding', () => {
    const draftModify = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.modify',
        resource: { type: 'appointment_draft', id: 'draft_1', tenantId: TENANT }
      })
    )
    expect(draftModify.decision).toBe('ALLOW')

    const cancel = policy.evaluate(
      input({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(cancel.decision).toBe('REQUIRE_APPROVAL')

    const confirm = policy.evaluate(
      input({
        capability: 'appointment.confirm',
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT }
      })
    )
    expect(confirm.decision).toBe('DENY')
    expect(confirm.reason).toBe('capability_not_granted')
  })

  it('keeps tenant mismatch precedence over action binding', () => {
    const mismatch = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.confirm',
        resource: {
          type: 'appointment_draft',
          id: 'draft_1',
          tenantId: OTHER_TENANT
        }
      })
    )
    expect(mismatch.decision).toBe('DENY')
    expect(mismatch.reason).toBe('tenant_mismatch')
  })
})
