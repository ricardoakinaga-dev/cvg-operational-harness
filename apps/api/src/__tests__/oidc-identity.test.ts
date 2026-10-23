import { describe, expect, it } from 'vitest'
import {
  mapVerifiedOidcIdentity,
  OidcLoginRefusal,
  type OidcIdentityPolicy
} from '../oidc-identity.ts'

const nowSeconds = 1_800_000_000
const issuer = 'https://idp.synthetic.test'
const clientId = 'cvg-synthetic-console'
const tenantA = 'tenant_00000000-0000-4000-8000-000000000701'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000702'
const policy: OidcIdentityPolicy = {
  issuer,
  clientId,
  requiredAmr: ['pwd', 'otp'],
  matrix: {
    version: 1,
    claim: 'synthetic_groups',
    entries: [
      {
        group: 'synthetic-a-supervisor',
        tenantId: tenantA,
        role: 'Supervisor',
        active: true
      },
      {
        group: 'synthetic-a-admin',
        tenantId: tenantA,
        role: 'Admin',
        active: true
      },
      {
        group: 'synthetic-b-operator',
        tenantId: tenantB,
        role: 'Operator',
        active: true
      },
      {
        group: 'synthetic-a-disabled',
        tenantId: tenantA,
        role: 'Operator',
        active: false
      }
    ]
  },
  now: () => nowSeconds * 1_000
}
const validClaims = {
  iss: issuer,
  aud: clientId,
  sub: 'synthetic-subject-1',
  iat: nowSeconds - 5,
  exp: nowSeconds + 3_600,
  auth_time: nowSeconds - 20,
  amr: ['pwd', 'otp'],
  synthetic_groups: ['synthetic-a-supervisor']
}

function reason(claims: unknown, override: Partial<OidcIdentityPolicy> = {}) {
  try {
    mapVerifiedOidcIdentity(claims, { ...policy, ...override })
  } catch (error) {
    expect(error).toBeInstanceOf(OidcLoginRefusal)
    return (error as OidcLoginRefusal).reasonCode
  }
  return 'accepted'
}

describe('verified OIDC claims to operator identity (policy mapper)', () => {
  it('binds issuer and opaque subject to a stable identifier and caps session lifetime', () => {
    const mapped = mapVerifiedOidcIdentity(validClaims, policy)
    expect(mapped).toMatchObject({
      identity: { role: 'Supervisor', tenantId: tenantA },
      active: true,
      expiresAt: (nowSeconds + 900) * 1_000
    })
    expect(mapped.identity.operatorId).toMatch(/^oidc_[0-9a-f]{64}$/)
    expect(mapped.proofRef).toMatch(/^oidc-login:[0-9a-f]{64}$/)
    expect(JSON.stringify(mapped)).not.toContain(validClaims.sub)
    expect(JSON.stringify(mapped)).not.toContain('synthetic-a-supervisor')
    expect(
      mapVerifiedOidcIdentity(
        { ...validClaims, sub: 'another-subject' },
        policy
      ).identity.operatorId
    ).not.toBe(mapped.identity.operatorId)
    expect(
      mapVerifiedOidcIdentity({ ...validClaims, iat: nowSeconds - 6 }, policy)
        .proofRef
    ).not.toBe(mapped.proofRef)
    expect(
      reason(validClaims, { issuer: 'https://other.synthetic.test' })
    ).toBe('token_rejected')
  })

  it('uses the earlier ID token expiry and accepts a named authorized party for multi-audience tokens', () => {
    expect(
      mapVerifiedOidcIdentity({ ...validClaims, exp: nowSeconds + 80 }, policy)
        .expiresAt
    ).toBe((nowSeconds + 80) * 1_000)
    expect(
      mapVerifiedOidcIdentity(
        { ...validClaims, aud: [clientId, 'other-client'], azp: clientId },
        policy
      ).identity.role
    ).toBe('Supervisor')
    expect(
      mapVerifiedOidcIdentity({ ...validClaims, aud: [clientId] }, policy)
        .identity.role
    ).toBe('Supervisor')
  })

  it('ignores groups outside the matrix (P2) and maps tenant and role from the matrix', () => {
    const mapped = mapVerifiedOidcIdentity(
      {
        ...validClaims,
        synthetic_groups: [
          'unrelated',
          'synthetic-b-operator',
          '/tenant_x/Admin'
        ]
      },
      policy
    )
    expect(mapped.identity).toMatchObject({
      tenantId: tenantB,
      role: 'Operator'
    })
  })

  it('returns an inactive entry for the producer to decide (inactive_group)', () => {
    const mapped = mapVerifiedOidcIdentity(
      { ...validClaims, synthetic_groups: ['synthetic-a-disabled'] },
      policy
    )
    expect(mapped).toMatchObject({
      active: false,
      identity: { tenantId: tenantA, role: 'Operator' }
    })
  })

  it('requires every configured amr value', () => {
    expect(
      reason(
        { ...validClaims, amr: ['pwd', 'otp'] },
        { requiredAmr: ['pwd', 'otp', 'hwk'] }
      )
    ).toBe('mfa_missing')
    expect(
      reason(
        { ...validClaims, amr: ['otp', 'hwk', 'pwd'] },
        { requiredAmr: ['pwd', 'otp', 'hwk'] }
      )
    ).toBe('accepted')
  })

  it.each([
    ['issuer mismatch', { iss: 'https://evil.example' }, 'token_rejected'],
    ['audience mismatch', { aud: 'other-client' }, 'token_rejected'],
    [
      'multiple audiences without azp',
      { aud: [clientId, 'other-client'] },
      'token_rejected'
    ],
    ['wrong authorized party', { azp: 'other-client' }, 'token_rejected'],
    ['missing subject', { sub: '' }, 'token_rejected'],
    ['subject over 255 bytes', { sub: 's'.repeat(256) }, 'token_rejected'],
    ['expired token', { exp: nowSeconds }, 'token_rejected'],
    ['future token', { iat: nowSeconds + 60 }, 'token_rejected'],
    ['fractional iat', { iat: nowSeconds - 5.5 }, 'token_rejected'],
    ['stale authentication', { auth_time: nowSeconds - 301 }, 'token_rejected'],
    ['missing authentication time', { auth_time: undefined }, 'token_rejected'],
    ['future authentication', { auth_time: nowSeconds + 60 }, 'token_rejected'],
    ['OTP absent', { amr: ['pwd'] }, 'mfa_missing'],
    ['password absent', { amr: ['otp'] }, 'mfa_missing'],
    ['MFA absent', { amr: undefined }, 'mfa_missing'],
    ['MFA not an array', { amr: 'pwd otp' }, 'mfa_missing'],
    ['MFA with a non-string', { amr: ['pwd', 'otp', 1] }, 'mfa_missing'],
    ['groups absent', { synthetic_groups: undefined }, 'groups_invalid'],
    [
      'groups as a scalar',
      { synthetic_groups: 'synthetic-a-supervisor' },
      'groups_invalid'
    ],
    [
      'nested groups',
      { synthetic_groups: [['synthetic-a-supervisor']] },
      'groups_invalid'
    ],
    [
      'non-string group',
      { synthetic_groups: ['synthetic-a-supervisor', 7] },
      'groups_invalid'
    ],
    [
      'more than 256 groups',
      { synthetic_groups: Array.from({ length: 257 }, (_, i) => `g${i}`) },
      'groups_invalid'
    ],
    [
      'a group over 256 characters',
      { synthetic_groups: ['g'.repeat(257)] },
      'groups_invalid'
    ],
    ['no group of the matrix', { synthetic_groups: [] }, 'no_eligible_group'],
    [
      'two roles of one tenant',
      { synthetic_groups: ['synthetic-a-supervisor', 'synthetic-a-admin'] },
      'ambiguous_group'
    ],
    [
      'two tenants',
      { synthetic_groups: ['synthetic-a-supervisor', 'synthetic-b-operator'] },
      'ambiguous_group'
    ],
    [
      'an active and an inactive entry',
      { synthetic_groups: ['synthetic-a-supervisor', 'synthetic-a-disabled'] },
      'ambiguous_group'
    ]
  ])('rejects %s', (_reason, changed, code) => {
    expect(reason({ ...validClaims, ...changed })).toBe(code)
  })

  it('reads the groups claim only as an own property', () => {
    const inherited = Object.create({
      synthetic_groups: ['synthetic-a-supervisor']
    }) as Record<string, unknown>
    Object.assign(inherited, validClaims)
    delete inherited.synthetic_groups
    expect(reason(inherited)).toBe('groups_invalid')
  })

  it('rejects invalid policy and non-object input', () => {
    expect(reason(null)).toBe('token_rejected')
    expect(reason([validClaims])).toBe('token_rejected')
    expect(() =>
      mapVerifiedOidcIdentity(validClaims, {
        ...policy,
        now: () => Number.NaN
      })
    ).toThrow(/policy/)
    expect(() =>
      mapVerifiedOidcIdentity(validClaims, { ...policy, clientId: '' })
    ).toThrow(/policy/)
  })
})
