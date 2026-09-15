import { describe, expect, it } from 'vitest'
import { RoleSchema, type Role } from '@cvg/shared'
import {
  CAPABILITY_RESOURCE_TYPES,
  CapabilitySchema,
  capabilityRisk,
  isHighRiskCapability,
  type Capability
} from '../capabilities.ts'
import {
  AGENT_PROFILE_GRANTS,
  AgentProfileNameSchema,
  APPROVER_ROLES,
  canApproveCapability,
  grantFor,
  roleAllowsCapability,
  type AgentProfileName
} from '../grants.ts'
import { PolicyRegistry } from '../documents.ts'
import { PolicyEngine, type PolicyEvaluationInput } from '../engine.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-12T12:00:00.000Z')

const PROFILES = AgentProfileNameSchema.options
const ROLES = RoleSchema.options
const CAPABILITIES = CapabilitySchema.options

type DecisionValue = 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL'

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

function engine(
  documents: Array<Parameters<PolicyRegistry['register']>[0]> = []
) {
  const registry = new PolicyRegistry()
  for (const document of documents) registry.register(document)
  return new PolicyEngine({ documents: registry.list(), clock: () => NOW })
}

function resourceFor(
  capability: Capability
): { type: string; id: string } | undefined {
  const allowed = CAPABILITY_RESOURCE_TYPES[capability]
  if (!allowed) return undefined
  const [first] = allowed
  return first ? { type: first, id: 'res_1' } : undefined
}

function expectedDecision(
  profile: AgentProfileName,
  capability: Capability,
  role: Role
): { decision: DecisionValue; reason: string } {
  const grant = grantFor(profile, capability)
  if (!grant) return { decision: 'DENY', reason: 'capability_not_granted' }
  if (!roleAllowsCapability(role, capability)) {
    return { decision: 'DENY', reason: 'operator_role_denied' }
  }
  if (grant.requiresMedicalOperator === true) {
    return {
      decision: 'REQUIRE_APPROVAL',
      reason: 'Capability requires a medical operator or explicit approval'
    }
  }
  if (grant.level === 'require_approval') {
    return {
      decision: 'REQUIRE_APPROVAL',
      reason: 'Capability grant requires human approval'
    }
  }
  if (isHighRiskCapability(capability)) {
    return {
      decision: 'REQUIRE_APPROVAL',
      reason: 'High-risk capability always requires human approval'
    }
  }
  return {
    decision: 'ALLOW',
    reason: 'Capability granted by least-privilege profile'
  }
}

describe('AAA-03 §10 capability matrix across every profile and role', () => {
  it('matches grants, role ceiling and risk for every profile/role/capability', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    let evaluated = 0
    for (const profile of PROFILES) {
      for (const role of ROLES) {
        for (const capability of CAPABILITIES) {
          const resource = resourceFor(capability)
          const label = `${profile}/${role}/${capability}`
          const decision = policy.evaluate({
            tenantId: TENANT,
            operatorId: 'op_00000000-0000-4000-8000-000000000001',
            operatorRole: role,
            agentId: 'agent_00000000-0000-4000-8000-000000000001',
            agentProfile: profile,
            capability,
            action: capability,
            correlationId: 'corr_00000000-0000-4000-8000-000000000002',
            ...(resource ? { resource } : {})
          })
          const expected = expectedDecision(profile, capability, role)
          expect(decision.decision, label).toBe(expected.decision)
          expect(decision.reason, label).toBe(expected.reason)
          expect(decision.risk, label).toBe(capabilityRisk(capability))
          expect(decision.capability, label).toBe(capability)
          evaluated += 1
        }
      }
    }
    expect(evaluated).toBe(PROFILES.length * ROLES.length * CAPABILITIES.length)
  })

  it('has no grant for real confirm or reschedule in any profile or role', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const profile of PROFILES) {
      for (const capability of [
        'appointment.confirm',
        'appointment.reschedule'
      ] as const) {
        expect(grantFor(profile, capability), profile).toBeUndefined()
        for (const role of ROLES) {
          const decision = policy.evaluate(
            input({
              agentProfile: profile,
              operatorRole: role,
              capability,
              action: capability,
              resource: { type: 'appointment', id: 'apt_1' }
            })
          )
          expect(decision.decision, `${profile}/${role}`).toBe('DENY')
          expect(decision.reason, `${profile}/${role}`).toBe(
            'capability_not_granted'
          )
        }
      }
    }
    for (const [profile, grants] of Object.entries(AGENT_PROFILE_GRANTS)) {
      for (const capability of [
        'appointment.confirm',
        'appointment.reschedule'
      ] as const) {
        expect(
          grants.some((grant) => grant.capability === capability),
          `${profile}/${capability}`
        ).toBe(false)
      }
    }
  })

  it('requires appointment_draft for modify and denies the real type', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const profile of PROFILES) {
      const real = policy.evaluate(
        input({
          agentProfile: profile,
          capability: 'appointment.modify',
          action: 'appointment.modify',
          resource: { type: 'appointment', id: 'apt_1' }
        })
      )
      expect(real.decision, profile).toBe('DENY')
      expect(real.reason, profile).toBe('resource_type_not_allowed')

      const draft = policy.evaluate(
        input({
          agentProfile: profile,
          capability: 'appointment.modify',
          action: 'appointment.modify',
          resource: { type: 'appointment_draft', id: 'draft_1' }
        })
      )
      const expected = expectedDecision(
        profile,
        'appointment.modify',
        'Supervisor'
      )
      expect(draft.decision, profile).toBe(expected.decision)
      expect(draft.reason, profile).toBe(expected.reason)
    }
  })

  it('denies unknown resource types for every scoped capability and profile', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const capability of Object.keys(
      CAPABILITY_RESOURCE_TYPES
    ) as Capability[]) {
      for (const profile of PROFILES) {
        const decision = policy.evaluate(
          input({
            agentProfile: profile,
            operatorRole: 'System',
            capability,
            action: capability,
            resource: { type: 'unknown_resource_type', id: 'unknown_1' }
          })
        )
        expect(decision.decision, `${profile}/${capability}`).toBe('DENY')
        expect(decision.reason, `${profile}/${capability}`).toBe(
          'resource_type_not_allowed'
        )
      }
    }
  })

  it('requires an explicit resource for every scoped capability', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const capability of Object.keys(
      CAPABILITY_RESOURCE_TYPES
    ) as Capability[]) {
      for (const profile of PROFILES) {
        const decision = policy.evaluate(
          input({
            agentProfile: profile,
            operatorRole: 'System',
            capability,
            action: capability
          })
        )
        expect(decision.decision, `${profile}/${capability}`).toBe('DENY')
        expect(decision.reason, `${profile}/${capability}`).toBe(
          'resource_type_required'
        )
      }
    }
  })

  it('fails closed when a provided resource has no usable type', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const resource of [{}, { type: 123 }, { type: '' }, { id: 'res_1' }]) {
      const decision = policy.evaluate(
        input({
          capability: 'appointment.modify',
          action: 'appointment.modify',
          resource: resource as never
        })
      )
      expect(decision.decision).toBe('DENY')
      expect(decision.reason).toBe('insufficient_context')
    }
  })

  it('orders tenant, resource, action, grant, role and policy documents', () => {
    const policy = new PolicyEngine({ clock: () => NOW })

    const tenantFirst = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.confirm',
        resource: {
          type: 'unknown_resource_type',
          id: 'unknown_1',
          tenantId: OTHER_TENANT
        }
      })
    )
    expect(tenantFirst.reason).toBe('tenant_mismatch')

    const resourceBeforeAction = policy.evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(resourceBeforeAction.reason).toBe('resource_type_not_allowed')

    const resourceBeforeGrant = policy.evaluate(
      input({
        agentProfile: 'financial',
        capability: 'appointment.modify',
        action: 'appointment.modify',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(resourceBeforeGrant.reason).toBe('resource_type_not_allowed')

    const resourceBeforeDocuments = engine([
      {
        policyId: 'tenant.expand-real-modify',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'allow-real-modify',
            effect: 'ALLOW',
            priority: 100,
            capabilities: ['appointment.modify'],
            resourceTypes: ['appointment'],
            reason: 'Attempt to expand modify to a real appointment'
          }
        ]
      }
    ]).evaluate(
      input({
        capability: 'appointment.modify',
        action: 'appointment.modify',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(resourceBeforeDocuments.decision).toBe('DENY')
    expect(resourceBeforeDocuments.reason).toBe('resource_type_not_allowed')
    expect(resourceBeforeDocuments.policyId).toBe('builtin.deny_by_default')

    const actionBeforeGrant = policy.evaluate(
      input({
        agentProfile: 'financial',
        capability: 'appointment.modify',
        action: 'appointment.confirm',
        resource: { type: 'appointment_draft', id: 'draft_1' }
      })
    )
    expect(actionBeforeGrant.reason).toBe('action_capability_mismatch')

    const grantBeforeRole = policy.evaluate(
      input({
        capability: 'appointment.confirm',
        action: 'appointment.confirm',
        operatorRole: 'System',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(grantBeforeRole.reason).toBe('capability_not_granted')

    const roleAfterGrant = policy.evaluate(
      input({
        agentProfile: 'clinical',
        capability: 'patient.record.write',
        action: 'patient.record.write',
        operatorRole: 'Operator'
      })
    )
    expect(roleAfterGrant.reason).toBe('operator_role_denied')
  })

  it('reports builtin identity on denials and document identity on rule wins', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    const builtin = policy.evaluate(input())
    expect(builtin.policyId).toBe('builtin.deny_by_default')
    expect(builtin.policyVersion).toBe('policy-engine-v1')

    const denied = policy.evaluate(
      input({ capability: 'finance.write', action: 'finance.write' })
    )
    expect(denied.decision).toBe('DENY')
    expect(denied.policyId).toBe('builtin.deny_by_default')
    expect(denied.policyVersion).toBe('policy-engine-v1')

    const globalDocument = engine([
      {
        policyId: 'global.strict',
        version: '7.0.0',
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'global-approval',
            effect: 'REQUIRE_APPROVAL',
            priority: 5,
            capabilities: ['schedule.read'],
            reason: 'Global read approval'
          }
        ]
      }
    ]).evaluate(input())
    expect(globalDocument.decision).toBe('REQUIRE_APPROVAL')
    expect(globalDocument.policyId).toBe('global.strict')
    expect(globalDocument.policyVersion).toBe('7.0.0')

    const versioned = engine([
      {
        policyId: 'tenant.versioned',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'v1-deny',
            effect: 'DENY',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'v1 denies'
          }
        ]
      },
      {
        policyId: 'tenant.versioned',
        version: '2.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'v2-approval',
            effect: 'REQUIRE_APPROVAL',
            priority: 20,
            capabilities: ['schedule.read'],
            reason: 'v2 asks for approval'
          }
        ]
      }
    ]).evaluate(input())
    expect(versioned.decision).toBe('REQUIRE_APPROVAL')
    expect(versioned.reason).toBe('v2 asks for approval')
    expect(versioned.policyId).toBe('tenant.versioned')
    expect(versioned.policyVersion).toBe('2.0.0')

    const expired = engine([
      {
        policyId: 'tenant.expired-version',
        version: '9.9.9',
        tenantId: TENANT,
        effectiveFrom: '2026-08-01T00:00:00.000Z',
        effectiveUntil: '2026-09-10T00:00:00.000Z',
        rules: [
          {
            id: 'expired-deny',
            effect: 'DENY',
            priority: 50,
            capabilities: ['schedule.read'],
            reason: 'Expired deny'
          }
        ]
      }
    ]).evaluate(input())
    expect(expired.decision).toBe('ALLOW')
    expect(expired.policyId).toBe('builtin.deny_by_default')
    expect(expired.policyVersion).toBe('policy-engine-v1')
  })

  it('denies when any required context field is absent, empty or unknown', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    const requiredFields: Array<keyof PolicyEvaluationInput> = [
      'tenantId',
      'operatorId',
      'operatorRole',
      'agentId',
      'agentProfile',
      'capability',
      'action',
      'correlationId'
    ]
    for (const field of requiredFields) {
      const candidate: Record<string, unknown> = { ...input() }
      delete candidate[field]
      const decision = policy.evaluate(candidate as never)
      expect(decision.decision, field).toBe('DENY')
      expect(decision.reason, field).toBe('insufficient_context')
    }

    for (const [field, value] of [
      ['tenantId', ''],
      ['operatorId', ''],
      ['agentId', ''],
      ['action', ''],
      ['correlationId', 'x'],
      ['correlationId', 'y'.repeat(121)],
      ['operatorRole', 'Owner'],
      ['agentProfile', 'unknown'],
      ['capability', 'unknown.capability'],
      ['action', 'z'.repeat(121)]
    ] as const) {
      const decision = policy.evaluate({
        ...input(),
        [field]: value
      } as never)
      expect(decision.decision, `${field}=${value}`).toBe('DENY')
      expect(decision.reason, `${field}=${value}`).toBe('insufficient_context')
    }

    const strictEnvelope = policy.evaluate({
      ...input(),
      extraField: true
    } as never)
    expect(strictEnvelope.decision).toBe('DENY')
    expect(strictEnvelope.reason).toBe('insufficient_context')
  })

  it('separates operator, approver, supervisor and admin approval authority', () => {
    expect(canApproveCapability('Operator', 'schedule.read')).toBe(false)
    expect(canApproveCapability('Operator', 'admin.policy.manage')).toBe(false)
    expect(canApproveCapability('Approver', 'finance.write')).toBe(true)
    expect(canApproveCapability('Approver', 'admin.policy.manage')).toBe(false)
    expect(canApproveCapability('Supervisor', 'appointment.cancel')).toBe(true)
    expect(canApproveCapability('Supervisor', 'admin.agent.manage')).toBe(false)
    expect(canApproveCapability('Admin', 'admin.policy.manage')).toBe(true)
    expect(canApproveCapability('System', 'admin.agent.manage')).toBe(true)
    expect(APPROVER_ROLES).toEqual([
      'Approver',
      'Supervisor',
      'Admin',
      'System'
    ])
    for (const role of ROLES) {
      for (const capability of CAPABILITIES) {
        const canApprove = canApproveCapability(role, capability)
        if (!APPROVER_ROLES.includes(role)) {
          expect(canApprove, `${role}/${capability}`).toBe(false)
        }
        if (canApprove) {
          expect(roleAllowsCapability(role, capability)).toBe(true)
        }
      }
    }
  })
})
