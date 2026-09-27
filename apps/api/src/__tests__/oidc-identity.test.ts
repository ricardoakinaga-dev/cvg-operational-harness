import { describe, expect, it } from 'vitest'
import { mapVerifiedOidcClaims } from '../oidc-identity.ts'

const nowSeconds = 1_800_000_000
const issuer = 'http://127.0.0.1:8087/realms/cvg-local'
const clientId = 'cvg-local-operator'
const group = '/tenant_00000000-0000-4000-8000-000000000701/Supervisor'
const options = { issuer, clientId, now: () => nowSeconds * 1_000 }
const validClaims = {
  iss: issuer,
  aud: clientId,
  sub: 'synthetic-subject-1',
  iat: nowSeconds - 5,
  exp: nowSeconds + 3_600,
  auth_time: nowSeconds - 20,
  amr: ['pwd', 'otp'],
  groups: [group]
}

describe('verified OIDC claims to operator identity', () => {
  it('binds issuer and opaque subject to a stable identifier and caps session lifetime', () => {
    const mapped = mapVerifiedOidcClaims(validClaims, options)
    expect(mapped).toMatchObject({
      identity: {
        role: 'Supervisor',
        tenantId: 'tenant_00000000-0000-4000-8000-000000000701'
      },
      expiresAt: (nowSeconds + 900) * 1_000
    })
    expect(mapped.identity.operatorId).toMatch(/^oidc_[0-9a-f]{64}$/)
    expect(
      mapVerifiedOidcClaims({ ...validClaims, sub: 'another-subject' }, options)
        .identity.operatorId
    ).not.toBe(mapped.identity.operatorId)
    expect(() =>
      mapVerifiedOidcClaims(validClaims, {
        ...options,
        issuer: 'https://other.example/realms/cvg-local'
      })
    ).toThrow()
  })

  it('uses the earlier ID token expiry and accepts a named authorized party for multi-audience tokens', () => {
    expect(
      mapVerifiedOidcClaims({ ...validClaims, exp: nowSeconds + 80 }, options)
        .expiresAt
    ).toBe((nowSeconds + 80) * 1_000)
    expect(
      mapVerifiedOidcClaims(
        { ...validClaims, aud: [clientId, 'other-client'], azp: clientId },
        options
      ).identity.role
    ).toBe('Supervisor')
    expect(
      mapVerifiedOidcClaims({ ...validClaims, aud: [clientId] }, options)
        .identity.role
    ).toBe('Supervisor')
  })

  it.each([
    ['issuer mismatch', { iss: 'https://evil.example' }],
    ['audience mismatch', { aud: 'other-client' }],
    ['multiple audiences without azp', { aud: [clientId, 'other-client'] }],
    ['wrong authorized party', { azp: 'other-client' }],
    ['missing subject', { sub: '' }],
    ['expired token', { exp: nowSeconds }],
    ['future token', { iat: nowSeconds + 60 }],
    ['stale authentication', { auth_time: nowSeconds - 301 }],
    ['missing authentication time', { auth_time: undefined }],
    ['future authentication', { auth_time: nowSeconds + 60 }],
    ['OTP absent', { amr: ['pwd'] }],
    ['password absent', { amr: ['otp'] }],
    ['MFA absent', { amr: undefined }],
    ['tenant absent', { groups: [] }],
    ['tenant malformed', { groups: ['/tenant_bad/Supervisor'] }],
    ['role unknown', { groups: [group.replace('Supervisor', 'System')] }],
    ['two roles', { groups: [group, group.replace('Supervisor', 'Admin')] }],
    [
      'two tenants',
      {
        groups: [group, '/tenant_00000000-0000-4000-8000-000000000702/Operator']
      }
    ],
    ['non-string group', { groups: [group, 7] }]
  ])('rejects %s', (_reason, changed) => {
    expect(() =>
      mapVerifiedOidcClaims({ ...validClaims, ...changed }, options)
    ).toThrow()
  })

  it('rejects invalid policy and non-object input', () => {
    expect(() => mapVerifiedOidcClaims(null, options)).toThrow()
    expect(() =>
      mapVerifiedOidcClaims(validClaims, {
        ...options,
        maxAuthenticationAgeSeconds: 901
      })
    ).toThrow()
  })
})
