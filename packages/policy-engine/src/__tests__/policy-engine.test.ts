import { describe, expect, it } from 'vitest'
import {
  AGENT_PROFILE_GRANTS,
  APPROVER_ROLES,
  canApproveCapability,
  grantFor,
  roleAllowsCapability
} from '../grants.ts'
import { CAPABILITY_CATALOG, type Capability } from '../capabilities.ts'
import { PolicyRegistry } from '../documents.ts'
import { PolicyEngine, type PolicyEvaluationInput } from '../engine.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-11T12:00:00.000Z')

function input(
  overrides: Partial<PolicyEvaluationInput> = {}
): PolicyEvaluationInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_00000000-0000-4000-8000-000000000001',
    operatorRole: 'Supervisor',
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentProfile: 'secretary',
    capability: 'schedule.read',
    action: 'read',
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    ...overrides
  }
}

function engine(documents: Parameters<PolicyRegistry['register']>[0][] = []) {
  const registry = new PolicyRegistry()
  for (const document of documents) registry.register(document)
  return new PolicyEngine({ documents: registry.list(), clock: () => NOW })
}

describe('capability catalog and least privilege', () => {
  it('grants the secretary only the operational least-privilege set', () => {
    const granted = AGENT_PROFILE_GRANTS.secretary.map(
      (grant) => grant.capability
    )
    expect(granted).toEqual(
      expect.arrayContaining([
        'schedule.read',
        'appointment.create',
        'appointment.modify',
        'conversation.read',
        'message.draft',
        'message.send',
        'patient.summary.read'
      ])
    )
    for (const forbidden of [
      'patient.record.write',
      'clinical.prescribe',
      'clinical.diagnose',
      'exam.release',
      'finance.write',
      'admin.policy.manage',
      'admin.agent.manage',
      'appointment.confirm',
      'appointment.reschedule'
    ] satisfies Capability[]) {
      expect(granted).not.toContain(forbidden)
    }
  })

  it('classifies risk levels for every capability', () => {
    for (const [capability, definition] of Object.entries(CAPABILITY_CATALOG)) {
      expect(definition.capability).toBe(capability)
      expect(typeof definition.risk).toBe('string')
    }
  })

  it('keeps operators and approvers separated', () => {
    expect(canApproveCapability('Operator', 'exam.release')).toBe(false)
    expect(canApproveCapability('Approver', 'exam.release')).toBe(true)
    expect(canApproveCapability('Supervisor', 'appointment.cancel')).toBe(true)
    expect(APPROVER_ROLES).not.toContain('Operator')
    expect(roleAllowsCapability('Operator', 'admin.policy.manage')).toBe(false)
  })
})

describe('policy engine decisions', () => {
  it('allows secretary capabilities that are explicitly granted', () => {
    const policy = engine()
    for (const capability of [
      'schedule.read',
      'conversation.read',
      'message.draft',
      'message.send',
      'patient.summary.read'
    ] satisfies Capability[]) {
      const decision = policy.evaluate(
        input({ capability, action: capability })
      )
      expect(decision.decision, capability).toBe('ALLOW')
      expect(decision.policyId).toBe('builtin.deny_by_default')
      expect(decision.policyVersion).toBe('policy-engine-v1')
    }
    const draftCreate = policy.evaluate(
      input({
        capability: 'appointment.create',
        action: 'appointment.create',
        resource: { type: 'appointment_draft', id: 'draft_1' }
      })
    )
    expect(draftCreate.decision).toBe('ALLOW')
    const shellCreate = policy.evaluate(
      input({
        capability: 'appointment.create',
        action: 'appointment.create',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(shellCreate.decision).toBe('ALLOW')
    const draftModify = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.modify',
        resource: { type: 'appointment_draft', id: 'draft_1' }
      })
    )
    expect(draftModify.decision).toBe('ALLOW')
  })

  it('denies every capability outside the profile grant (deny by default)', () => {
    const policy = engine()
    for (const capability of [
      'patient.record.read',
      'patient.record.write',
      'exam.release',
      'finance.write',
      'finance.read',
      'clinical.prescribe',
      'clinical.diagnose',
      'hospitalization.manage',
      'admin.policy.manage',
      'admin.agent.manage'
    ] satisfies Capability[]) {
      const decision = policy.evaluate(
        input({ capability, action: capability })
      )
      expect(decision.decision, capability).toBe('DENY')
      expect(decision.reason, capability).toBe('capability_not_granted')
    }
  })

  it('requires approval for declared grant levels and high-risk capabilities', () => {
    const policy = engine()
    expect(
      policy.evaluate(
        input({
          capability: 'appointment.cancel',
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' }
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')
    expect(
      policy.evaluate(
        input({
          capability: 'patient.record.write',
          action: 'patient.record.write',
          agentProfile: 'clinical'
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')
    expect(
      policy.evaluate(
        input({
          capability: 'finance.write',
          action: 'finance.write',
          agentProfile: 'financial'
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')
    expect(
      policy.evaluate(
        input({
          capability: 'exam.release',
          action: 'exam.release',
          agentProfile: 'clinical'
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')
  })

  it('denies when tenant, identity or context cannot be verified', () => {
    const policy = engine()
    const missingTenant = policy.evaluate({
      ...input(),
      tenantId: ''
    })
    expect(missingTenant.decision).toBe('DENY')
    expect(missingTenant.reason).toBe('insufficient_context')

    const missingCorrelation = policy.evaluate({
      ...input(),
      correlationId: 'x'
    })
    expect(missingCorrelation.decision).toBe('DENY')

    const tenantMismatch = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.modify',
        resource: { type: 'appointment', id: 'a1', tenantId: OTHER_TENANT }
      })
    )
    expect(tenantMismatch.decision).toBe('DENY')
    expect(tenantMismatch.reason).toBe('tenant_mismatch')
  })

  it('enforces the operator role ceiling', () => {
    const policy = engine()
    const operatorReadingRecord = policy.evaluate(
      input({
        agentProfile: 'clinical',
        capability: 'patient.record.read',
        operatorRole: 'Operator'
      })
    )
    expect(operatorReadingRecord.decision).toBe('DENY')
    expect(operatorReadingRecord.reason).toBe('operator_role_denied')
  })

  it('lets policies restrict but never expand grants', () => {
    const policy = engine([
      {
        policyId: 'tenant.strict',
        version: '2.1.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'no-message-send',
            effect: 'DENY',
            priority: 10,
            capabilities: ['message.send'],
            reason: 'Tenant requires human review before outbound messages'
          },
          {
            id: 'allow-finance',
            effect: 'ALLOW',
            priority: 50,
            capabilities: ['finance.write'],
            reason: 'Attempt to expand finance capability'
          }
        ]
      }
    ])
    const denied = policy.evaluate(
      input({ capability: 'message.send', action: 'message.send' })
    )
    expect(denied.decision).toBe('DENY')
    expect(denied.policyId).toBe('tenant.strict')
    expect(denied.policyVersion).toBe('2.1.0')

    const expansion = policy.evaluate(
      input({ capability: 'finance.write', action: 'finance.write' })
    )
    expect(expansion.decision).toBe('DENY')
    expect(expansion.reason).toBe('capability_not_granted')
  })

  it('selects the most restrictive matching rule deterministically', () => {
    const policy = engine([
      {
        policyId: 'tenant.rules',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'allow-read',
            effect: 'ALLOW',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'Read is fine'
          },
          {
            id: 'approval-read',
            effect: 'REQUIRE_APPROVAL',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'Read requires approval'
          },
          {
            id: 'deny-read',
            effect: 'DENY',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'Read is denied'
          }
        ]
      }
    ])
    const decision = policy.evaluate(input({ capability: 'schedule.read' }))
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe('Read is denied')
  })

  it('applies classification-based rules only when the threshold is met', () => {
    const policy = engine([
      {
        policyId: 'clinical.guard',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'clinical-send-approval',
            effect: 'REQUIRE_APPROVAL',
            priority: 5,
            capabilities: ['message.send'],
            classificationAtLeast: 'CLINICAL',
            reason: 'Clinical content requires human review'
          }
        ]
      }
    ])
    expect(
      policy.evaluate(
        input({ capability: 'message.send', action: 'message.send' })
      ).decision
    ).toBe('ALLOW')
    const clinical = policy.evaluate(
      input({
        capability: 'message.send',
        action: 'message.send',
        context: { dataClassification: 'CLINICAL' }
      })
    )
    expect(clinical.decision).toBe('REQUIRE_APPROVAL')
    expect(clinical.policyId).toBe('clinical.guard')
  })

  it('requires a medical operator for medical capabilities', () => {
    const policy = engine()
    const withoutMedical = policy.evaluate(
      input({
        capability: 'clinical.prescribe',
        action: 'clinical.prescribe',
        agentProfile: 'clinical'
      })
    )
    expect(withoutMedical.decision).toBe('REQUIRE_APPROVAL')
    expect(withoutMedical.reason).toMatch(/medical operator/)
  })

  it('ignores tenant documents from other tenants and respects effective windows', () => {
    const policy = engine([
      {
        policyId: 'other-tenant',
        version: '1.0.0',
        tenantId: OTHER_TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'deny-all',
            effect: 'DENY',
            priority: 100,
            capabilities: ['schedule.read'],
            reason: 'Should not apply'
          }
        ]
      },
      {
        policyId: 'future-policy',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2027-01-01T00:00:00.000Z',
        rules: [
          {
            id: 'future-deny',
            effect: 'DENY',
            priority: 100,
            capabilities: ['schedule.read'],
            reason: 'Not yet effective'
          }
        ]
      }
    ])
    expect(
      policy.evaluate(input({ capability: 'schedule.read' })).decision
    ).toBe('ALLOW')
  })

  it('reports capability grant lookup deterministically', () => {
    expect(grantFor('secretary', 'message.send')?.level).toBe('allow')
    expect(grantFor('secretary', 'finance.write')).toBeUndefined()
  })
})
