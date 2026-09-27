import { describe, expect, it } from 'vitest'
import { SECRETARY_POLICY_PROFILE } from '../policy-profile.ts'
import {
  CAPABILITY_CATALOG,
  capabilityRisk,
  isHighRiskCapability
} from '../policy-profile.ts'
import {
  AGENT_PROFILE_GRANTS,
  APPROVER_ROLES,
  canApproveCapability,
  grantFor,
  roleAllowsCapability
} from '../policy-profile.ts'
import { PolicyRegistry, policyDocumentKey } from '@cvg/policy-engine'
import { PolicyEngine } from '@cvg/policy-engine'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-11T12:00:00.000Z')

const baseDocument = {
  policyId: 'coverage.document',
  version: '1.0.0',
  tenantId: TENANT,
  effectiveFrom: '2026-09-01T00:00:00.000Z',
  effectiveUntil: '2026-10-01T00:00:00.000Z',
  rules: [
    {
      id: 'allow-read',
      effect: 'ALLOW' as const,
      priority: 0,
      capabilities: ['schedule.read' as const],
      reason: 'read'
    }
  ]
}

describe('capability helpers', () => {
  it('exposes risk for every catalog entry', () => {
    for (const capability of Object.keys(CAPABILITY_CATALOG) as Array<
      keyof typeof CAPABILITY_CATALOG
    >) {
      expect(capabilityRisk(capability)).toBeTruthy()
    }
    expect(isHighRiskCapability('appointment.cancel')).toBe(true)
    expect(isHighRiskCapability('admin.agent.manage')).toBe(true)
    expect(isHighRiskCapability('schedule.read')).toBe(false)
  })

  it('resolves grants and approval authority', () => {
    expect(grantFor('clinical', 'clinical.prescribe')?.level).toBe(
      'require_approval'
    )
    expect(grantFor('secretary', 'clinical.prescribe')).toBeUndefined()
    expect(
      AGENT_PROFILE_GRANTS.hospitalization.some(
        (grant) => grant.capability === 'patient.record.read'
      )
    ).toBe(true)
    expect(canApproveCapability('System', 'admin.policy.manage')).toBe(true)
    expect(canApproveCapability('Operator', 'admin.policy.manage')).toBe(false)
    expect(canApproveCapability('Approver', 'finance.write')).toBe(true)
    expect(roleAllowsCapability('Admin', 'admin.agent.manage')).toBe(true)
    expect(APPROVER_ROLES).toContain('Supervisor')
  })
})

describe('policy registry', () => {
  it('registers idempotently and rejects conflicting duplicates', () => {
    const registry = new PolicyRegistry(SECRETARY_POLICY_PROFILE)
    const first = registry.register(baseDocument)
    const second = registry.register(baseDocument)
    expect(second).toEqual(first)
    expect(registry.get('coverage.document', '1.0.0')).toEqual(first)
    expect(registry.list()).toHaveLength(1)
    expect(policyDocumentKey('coverage.document', '1.0.0')).toBe(
      'coverage.document@1.0.0'
    )
    expect(() =>
      registry.register({
        ...baseDocument,
        rules: [
          {
            id: 'different',
            effect: 'DENY',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'different'
          }
        ]
      })
    ).toThrowError(/different content/)
  })

  it('filters documents by tenant and effective window', () => {
    const registry = new PolicyRegistry(SECRETARY_POLICY_PROFILE)
    registry.register(baseDocument)
    registry.register({
      ...baseDocument,
      policyId: 'other.tenant',
      tenantId: 'tenant_00000000-0000-4000-8000-0000000000ff'
    })
    registry.register({
      ...baseDocument,
      policyId: 'future',
      effectiveFrom: '2027-01-01T00:00:00.000Z',
      effectiveUntil: undefined
    })
    const effective = registry.effectiveFor({ tenantId: TENANT, at: NOW })
    expect(effective.map((document) => document.policyId)).toEqual([
      'coverage.document'
    ])
    const afterExpiry = registry.effectiveFor({
      tenantId: TENANT,
      at: new Date('2026-11-01T00:00:00.000Z')
    })
    expect(afterExpiry).toHaveLength(0)
  })
})

describe('policy engine edge rules', () => {
  it('matches optional rule dimensions and ignores non-matching ones', () => {
    const engineFor = (rule: Record<string, unknown>) =>
      new PolicyEngine({
        profile: SECRETARY_POLICY_PROFILE,
        clock: () => NOW,
        documents: [
          {
            policyId: 'edge',
            version: '1.0.0',
            effectiveFrom: '2026-09-01T00:00:00.000Z',
            rules: [
              {
                id: 'edge-rule',
                effect: 'DENY',
                priority: 5,
                reason: 'edge',
                ...rule
              }
            ]
          }
        ]
      })
    const input = {
      tenantId: TENANT,
      operatorId: 'op_1',
      operatorRole: 'Supervisor' as const,
      agentId: 'agent_1',
      agentProfile: 'secretary' as const,
      capability: 'schedule.read' as const,
      action: 'read',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      resource: { type: 'schedule', id: 's1' }
    }
    expect(engineFor({ roles: ['Admin'] }).evaluate(input).decision).toBe(
      'ALLOW'
    )
    expect(
      engineFor({ agentProfiles: ['clinical'] }).evaluate(input).decision
    ).toBe('ALLOW')
    expect(engineFor({ actions: ['write'] }).evaluate(input).decision).toBe(
      'ALLOW'
    )
    expect(
      engineFor({ resourceTypes: ['appointment'] }).evaluate(input).decision
    ).toBe('ALLOW')
    expect(
      engineFor({ classificationAtLeast: 'CLINICAL' }).evaluate(input).decision
    ).toBe('ALLOW')
    expect(
      engineFor({ classificationAtLeast: 'PUBLIC' }).evaluate({
        ...input,
        context: { dataClassification: 'CLINICAL' }
      }).decision
    ).toBe('DENY')
    expect(
      engineFor({ roles: ['Supervisor'], actions: ['read'] }).evaluate(input)
        .decision
    ).toBe('DENY')
  })

  it('denies malformed capability and profile inputs safely', () => {
    const engine = new PolicyEngine({
      profile: SECRETARY_POLICY_PROFILE,
      clock: () => NOW
    })
    const decision = engine.evaluate({
      tenantId: TENANT,
      operatorId: 'op_1',
      operatorRole: 'Supervisor',
      agentId: 'agent_1',
      agentProfile: 'not-a-profile' as never,
      capability: 'not-a-capability' as never,
      action: 'read',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001'
    })
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe('insufficient_context')
    expect(decision.risk).toBe('ADMIN')
  })
})
