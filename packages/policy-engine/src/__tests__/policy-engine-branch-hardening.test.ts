import { describe, expect, it } from 'vitest'
import { PolicyRegistry } from '../documents.ts'
import { PolicyEngine, type PolicyEvaluationInput } from '../engine.ts'
import { AGENT_PROFILE_GRANTS, riskRequiresApproval } from '../grants.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
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

describe('AAA34 policy-engine branch hardening', () => {
  it('defaults the clock, the document list and lists every profile', () => {
    const policy = new PolicyEngine()
    const decision = policy.evaluate(input())
    expect(decision.decision).toBe('ALLOW')
    expect(decision.policyId).toBe('builtin.deny_by_default')
    expect(decision.policyVersion).toBe('policy-engine-v1')
    expect(Number.isNaN(Date.parse(decision.evaluatedAt))).toBe(false)
    expect(policy.listProfiles()).toEqual(Object.keys(AGENT_PROFILE_GRANTS))
  })

  it('fails closed on non-object runtime inputs with safe fallbacks', () => {
    const policy = new PolicyEngine({ clock: () => NOW })
    for (const malformed of [undefined, null, 42, 'not-an-input']) {
      const decision = policy.evaluate(malformed as never)
      expect(decision.decision).toBe('DENY')
      expect(decision.reason).toBe('insufficient_context')
      expect(decision.correlationId).toBe('corr_unknown')
      expect(decision.capability).toBe('admin.policy.manage')
      expect(decision.risk).toBe('ADMIN')
    }
  })

  it('applies an ALLOW policy winner and preserves the document identity', () => {
    const policy = engine([
      {
        policyId: 'tenant.allow',
        version: '3.2.1',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'allow-read',
            effect: 'ALLOW',
            priority: 5,
            capabilities: ['schedule.read'],
            reason: 'Explicitly allowed by tenant policy'
          }
        ]
      }
    ])
    const decision = policy.evaluate(input())
    expect(decision.decision).toBe('ALLOW')
    expect(decision.reason).toBe('Explicitly allowed by tenant policy')
    expect(decision.policyId).toBe('tenant.allow')
    expect(decision.policyVersion).toBe('3.2.1')
  })

  it('keeps an ALLOW rule from removing the grant approval floor', () => {
    const policy = engine([
      {
        policyId: 'tenant.allow-cancel',
        version: '1.4.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'allow-cancel',
            effect: 'ALLOW',
            priority: 5,
            capabilities: ['appointment.cancel'],
            reason: 'Tenant accepts this cancellation'
          }
        ]
      }
    ])
    const decision = policy.evaluate(
      input({
        capability: 'appointment.cancel',
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' }
      })
    )
    expect(decision.decision).toBe('REQUIRE_APPROVAL')
    expect(decision.reason).toBe('Tenant accepts this cancellation')
    expect(decision.policyId).toBe('tenant.allow-cancel')
    expect(decision.policyVersion).toBe('1.4.0')
  })

  it('applies a REQUIRE_APPROVAL policy winner with its reason', () => {
    const policy = engine([
      {
        policyId: 'tenant.approval',
        version: '2.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'approval-read',
            effect: 'REQUIRE_APPROVAL',
            priority: 5,
            capabilities: ['schedule.read'],
            reason: 'Reads need a human in this tenant'
          }
        ]
      }
    ])
    const decision = policy.evaluate(input())
    expect(decision.decision).toBe('REQUIRE_APPROVAL')
    expect(decision.reason).toBe('Reads need a human in this tenant')
    expect(decision.policyVersion).toBe('2.0.0')
  })

  it('prefers the highest priority rule when priorities differ', () => {
    const policy = engine([
      {
        policyId: 'tenant.priority',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-09-01T00:00:00.000Z',
        rules: [
          {
            id: 'low-priority-allow',
            effect: 'ALLOW',
            priority: 1,
            capabilities: ['schedule.read'],
            reason: 'Low priority allow'
          },
          {
            id: 'high-priority-approval',
            effect: 'REQUIRE_APPROVAL',
            priority: 10,
            capabilities: ['schedule.read'],
            reason: 'High priority approval'
          }
        ]
      }
    ])
    const decision = policy.evaluate(input())
    expect(decision.decision).toBe('REQUIRE_APPROVAL')
    expect(decision.reason).toBe('High priority approval')
  })

  it('skips rules outside the document effective window', () => {
    const expired = engine([
      {
        policyId: 'tenant.expired',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-08-01T00:00:00.000Z',
        effectiveUntil: '2026-09-10T00:00:00.000Z',
        rules: [
          {
            id: 'expired-deny',
            effect: 'DENY',
            priority: 100,
            capabilities: ['schedule.read'],
            reason: 'Expired deny'
          }
        ]
      }
    ])
    expect(expired.evaluate(input()).decision).toBe('ALLOW')

    const active = engine([
      {
        policyId: 'tenant.active',
        version: '1.0.0',
        tenantId: TENANT,
        effectiveFrom: '2026-08-01T00:00:00.000Z',
        effectiveUntil: '2026-09-20T00:00:00.000Z',
        rules: [
          {
            id: 'active-deny',
            effect: 'DENY',
            priority: 100,
            capabilities: ['schedule.read'],
            reason: 'Active deny'
          }
        ]
      }
    ])
    expect(active.evaluate(input()).decision).toBe('DENY')
  })

  it('honours explicit medical operator and emergency context', () => {
    const policy = engine()
    const medicalOperator = policy.evaluate(
      input({
        agentProfile: 'clinical',
        capability: 'clinical.prescribe',
        action: 'clinical.prescribe',
        context: { medicalOperator: true }
      })
    )
    expect(medicalOperator.decision).toBe('REQUIRE_APPROVAL')
    expect(medicalOperator.reason).toBe(
      'Capability grant requires human approval'
    )

    const emergency = policy.evaluate(
      input({
        agentProfile: 'clinical',
        capability: 'clinical.prescribe',
        action: 'clinical.prescribe',
        context: { emergency: true }
      })
    )
    expect(emergency.decision).toBe('REQUIRE_APPROVAL')
    expect(emergency.reason).toBe('Capability grant requires human approval')
  })

  it('reports approval thresholds for every risk level', () => {
    expect(riskRequiresApproval('HIGH_RISK_WRITE')).toBe(true)
    expect(riskRequiresApproval('ADMIN')).toBe(true)
    expect(riskRequiresApproval('READ_ONLY')).toBe(false)
    expect(riskRequiresApproval('LOW_RISK_WRITE')).toBe(false)
    expect(riskRequiresApproval('MEDIUM_RISK_WRITE')).toBe(false)
  })
})
