import { describe, expect, it } from 'vitest'
import { PolicyRegistry, type PolicyDocumentInput } from '../documents.ts'
import { PolicyEngine, type PolicyEvaluationInput } from '../engine.ts'
import { REFERENCE_POLICY_PROFILE } from '../reference-profile.ts'

// SPEC-LEGACY-002: engine mechanism exercised with the neutral reference
// profile, independent of any product (the legacy secretary content and its
// tests live under legacy/).
const NOW = new Date('2026-09-26T12:00:00.000Z')
const TENANT = 'tenant_a'

function input(
  overrides: Partial<PolicyEvaluationInput> = {}
): PolicyEvaluationInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Approver',
    agentId: 'agent_1',
    agentProfile: 'assistant',
    capability: 'resource.read',
    action: 'read',
    correlationId: 'corr_reference_engine',
    ...overrides
  }
}

function engine(documents: PolicyDocumentInput[] = []): PolicyEngine {
  const registry = new PolicyRegistry(REFERENCE_POLICY_PROFILE)
  for (const document of documents) registry.register(document)
  return new PolicyEngine({
    profile: REFERENCE_POLICY_PROFILE,
    documents: registry.list(),
    clock: () => NOW
  })
}

function rule(
  effect: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL',
  extra: Record<string, unknown> = {},
  document: Partial<PolicyDocumentInput> = {}
): PolicyDocumentInput {
  return {
    policyId: `p-${effect.toLowerCase()}`,
    version: '1',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    rules: [{ id: `r-${effect}`, effect, reason: `rule ${effect}`, ...extra }],
    ...document
  }
}

describe('PolicyEngine with the reference profile', () => {
  it('allows a granted read-only capability', () => {
    const decision = engine().evaluate(input())
    expect(decision.decision).toBe('ALLOW')
    expect(decision.risk).toBe('READ_ONLY')
    expect(decision.policyId).toBe('builtin.deny_by_default')
  })

  it.each([
    [
      'tenant_mismatch',
      input({ resource: { type: 'record', tenantId: 'tenant_b' } })
    ],
    [
      'resource_type_required',
      input({ capability: 'record.create', action: 'record.create' })
    ],
    [
      'resource_type_not_allowed',
      input({
        capability: 'record.update',
        action: 'record.update',
        resource: { type: 'record' }
      })
    ],
    [
      'action_capability_mismatch',
      input({ capability: 'resource.read', action: 'record.update' })
    ],
    [
      'capability_not_granted',
      input({
        capability: 'record.confirm',
        action: 'record.confirm',
        resource: { type: 'record' }
      })
    ],
    [
      'operator_role_denied',
      input({
        operatorRole: 'Operator',
        capability: 'record.cancel',
        action: 'record.cancel',
        resource: { type: 'record' }
      })
    ],
    ['insufficient_context', input({ capability: 'unknown.capability' })]
  ])('denies with %s', (reason, request) => {
    const decision = engine().evaluate(request)
    expect(decision.decision).toBe('DENY')
    expect(decision.reason).toBe(reason)
  })

  it('requires approval from the grant level and for a privileged directive', () => {
    expect(
      engine().evaluate(
        input({
          capability: 'record.cancel',
          action: 'record.cancel',
          resource: { type: 'record' }
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')

    const directive = input({
      agentProfile: 'specialist',
      operatorRole: 'Supervisor',
      capability: 'restricted.directive.issue',
      action: 'restricted.directive.issue'
    })
    expect(engine().evaluate(directive).reason).toBe(
      'Capability requires a medical operator or explicit approval'
    )
  })

  it('applies policy documents: DENY wins, then REQUIRE_APPROVAL, scoped by tenant and time', () => {
    const readRule = { capabilities: ['resource.read'] }
    expect(
      engine([rule('ALLOW', readRule), rule('DENY', readRule)]).evaluate(
        input()
      ).decision
    ).toBe('DENY')
    expect(
      engine([rule('REQUIRE_APPROVAL', readRule)]).evaluate(input()).decision
    ).toBe('REQUIRE_APPROVAL')
    expect(
      engine([rule('DENY', readRule, { tenantId: 'tenant_b' })]).evaluate(
        input()
      ).decision
    ).toBe('ALLOW')
    expect(
      engine([
        rule('DENY', readRule, { effectiveFrom: '2027-01-01T00:00:00.000Z' })
      ]).evaluate(input()).decision
    ).toBe('ALLOW')
    const allowed = engine([rule('ALLOW', readRule)]).evaluate(input())
    expect(allowed.decision).toBe('ALLOW')
    expect(allowed.policyId).toBe('p-allow')
  })

  it('rejects documents that reference capabilities outside the profile', () => {
    expect(() =>
      new PolicyRegistry(REFERENCE_POLICY_PROFILE).register(
        rule('DENY', { capabilities: ['unknown.capability'] })
      )
    ).toThrow()
  })
})
