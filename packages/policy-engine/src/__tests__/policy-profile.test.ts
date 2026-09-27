import { describe, expect, it } from 'vitest'
import { PolicyRegistry } from '../documents.ts'
import { PolicyEngine } from '../engine.ts'
import {
  PolicyProfileError,
  createPolicyProfile,
  type PolicyProfileInput
} from '../profile.ts'

// SPEC-LEGACY-002 slice 1: the engine mechanism works with any product
// profile. This minimal neutral profile carries no legacy vocabulary.
function baseInput(): PolicyProfileInput {
  return {
    id: 'test.minimal',
    catalog: {
      'record.read': {
        capability: 'record.read',
        category: 'record',
        risk: 'READ_ONLY',
        description: 'Read a record'
      },
      'record.update': {
        capability: 'record.update',
        category: 'record',
        risk: 'HIGH_RISK_WRITE',
        description: 'Update a record'
      }
    },
    actions: {
      'record.read': ['record.read', 'read'],
      'record.update': ['record.update']
    },
    resourceTypes: { 'record.update': ['record'] },
    agentProfileGrants: {
      assistant: [
        { capability: 'record.read', level: 'allow' },
        { capability: 'record.update', level: 'allow' }
      ]
    },
    operatorRoleCapabilities: {
      Operator: ['record.read'],
      Approver: ['record.read', 'record.update'],
      Supervisor: ['record.read', 'record.update'],
      Admin: ['record.read', 'record.update'],
      System: ['record.read', 'record.update']
    },
    approverRoles: ['Approver', 'Supervisor', 'Admin', 'System'],
    invalidCapabilityFallback: 'record.update'
  }
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_a',
    operatorId: 'op_1',
    operatorRole: 'Approver',
    agentId: 'agent_1',
    agentProfile: 'assistant',
    capability: 'record.read',
    action: 'read',
    correlationId: 'corr_profile_test',
    ...overrides
  } as never
}

describe('PolicyProfile (SPEC-LEGACY-002)', () => {
  it('derives closed schemas and lookups from the catalog', () => {
    const profile = createPolicyProfile(baseInput())

    expect(profile.capabilitySchema.options).toEqual([
      'record.read',
      'record.update'
    ])
    expect(profile.agentProfileNames()).toEqual(['assistant'])
    expect(profile.risk('record.update')).toBe('HIGH_RISK_WRITE')
    expect(profile.isHighRisk('record.read')).toBe(false)
    expect(profile.resourceScope('record.read', undefined)).toEqual({
      status: 'not_scoped'
    })
    expect(profile.resourceScope('record.update', undefined)).toEqual({
      status: 'required'
    })
    expect(profile.resourceScope('record.update', { type: 'other' })).toEqual({
      status: 'not_allowed'
    })
    expect(profile.actionMatches('record.read', 'read')).toBe(true)
    expect(profile.actionMatches('record.unknown', 'read')).toBe(false)
    expect(profile.grantFor('nobody', 'record.read')).toBeUndefined()
    expect(profile.roleAllows('Operator', 'record.update')).toBe(false)
    expect(profile.canApprove('Operator', 'record.read')).toBe(false)
    expect(profile.canApprove('Approver', 'record.update')).toBe(true)
    expect(() => profile.risk('record.unknown')).toThrow(PolicyProfileError)
  })

  it('evaluates with the supplied profile and denies what it does not declare', () => {
    const engine = new PolicyEngine({
      profile: createPolicyProfile(baseInput()),
      clock: () => new Date('2026-09-26T12:00:00.000Z')
    })

    expect(engine.evaluate(request()).decision).toBe('ALLOW')
    expect(
      engine.evaluate(
        request({
          capability: 'record.update',
          action: 'record.update',
          resource: { type: 'record' }
        })
      ).decision
    ).toBe('REQUIRE_APPROVAL')

    const unknown = engine.evaluate(request({ capability: 'record.ghost' }))
    expect(unknown.decision).toBe('DENY')
    expect(unknown.reason).toBe('insufficient_context')
    expect(unknown.capability).toBe('record.update')
    expect(unknown.risk).toBe('HIGH_RISK_WRITE')
    expect(engine.listProfiles()).toEqual(['assistant'])
  })

  it('validates policy documents against the profile catalog', () => {
    const registry = new PolicyRegistry(createPolicyProfile(baseInput()))
    const document = {
      policyId: 'p',
      version: '1',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      rules: [
        {
          id: 'r',
          effect: 'DENY' as const,
          capabilities: ['record.update'],
          reason: 'deny updates'
        }
      ]
    }

    expect(registry.register(document).rules).toHaveLength(1)
    expect(() =>
      registry.register({
        ...document,
        version: '2',
        rules: [{ ...document.rules[0]!, capabilities: ['record.ghost'] }]
      })
    ).toThrow()
  })

  it.each([
    [
      'an invalid capability name',
      (input: PolicyProfileInput) => {
        input.catalog = {
          ...input.catalog,
          Bad: { ...input.catalog['record.read']!, capability: 'Bad' }
        }
        input.actions = { ...input.actions, Bad: ['Bad'] }
      }
    ],
    [
      'an inconsistent catalog entry',
      (input: PolicyProfileInput) => {
        input.catalog = {
          ...input.catalog,
          'record.read': {
            ...input.catalog['record.read']!,
            capability: 'record.other'
          }
        }
      }
    ],
    [
      'a capability without actions',
      (input: PolicyProfileInput) => {
        input.actions = { 'record.read': ['read'], 'record.update': [] }
      }
    ],
    [
      'actions for an unknown capability',
      (input: PolicyProfileInput) => {
        input.actions = { ...input.actions, 'record.ghost': ['x'] }
      }
    ],
    [
      'resource types for an unknown capability',
      (input: PolicyProfileInput) => {
        input.resourceTypes = { 'record.ghost': ['record'] }
      }
    ],
    [
      'an invalid agent profile name',
      (input: PolicyProfileInput) => {
        input.agentProfileGrants = { Assistant: [] }
      }
    ],
    [
      'a grant for an unknown capability',
      (input: PolicyProfileInput) => {
        input.agentProfileGrants = {
          assistant: [{ capability: 'record.ghost', level: 'allow' }]
        }
      }
    ],
    [
      'a role ceiling with an unknown capability',
      (input: PolicyProfileInput) => {
        input.operatorRoleCapabilities = {
          ...input.operatorRoleCapabilities,
          Operator: ['record.ghost']
        }
      }
    ],
    [
      'an unknown fallback capability',
      (input: PolicyProfileInput) => {
        input.invalidCapabilityFallback = 'record.ghost'
      }
    ],
    [
      'no agent profile',
      (input: PolicyProfileInput) => {
        input.agentProfileGrants = {}
      }
    ]
  ])('rejects a profile with %s', (_label, mutate) => {
    const input = baseInput()
    mutate(input)
    expect(() => createPolicyProfile(input)).toThrow(PolicyProfileError)
  })
})
