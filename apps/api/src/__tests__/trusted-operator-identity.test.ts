import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createConfiguredOperatorIdentityResolver,
  createLocalIdentityKeyRing,
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken,
  decodeTrustedOperatorTokenClaims,
  TRUSTED_OPERATOR_TOKEN_ISSUER
} from '../operator-identity.ts'

const NOW_MS = 1_700_000_000_000
const NOW_SECONDS = Math.floor(NOW_MS / 1000)
const SECRET = 'trusted-operator-signing-secret-for-tests'
const IDENTITY = {
  operatorId: 'operator.test',
  role: 'Supervisor' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000001'
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(encodedClaims: string, secret = SECRET): string {
  return createHmac('sha256', secret)
    .update(encodedClaims, 'utf8')
    .digest('base64url')
}

function signedToken(claims: unknown, secret = SECRET): string {
  const encodedClaims = encode(claims)
  return `${encodedClaims}.${sign(encodedClaims, secret)}`
}

function validClaims(overrides: Record<string, unknown> = {}) {
  return {
    ...IDENTITY,
    iss: TRUSTED_OPERATOR_TOKEN_ISSUER,
    aud: 'cvg-api',
    iat: NOW_SECONDS,
    exp: NOW_SECONDS + 300,
    jti: 'jti_00000000-0000-4000-8000-000000000001',
    ...overrides
  }
}

describe('trusted operator identity tokens', () => {
  it('creates and resolves a tenant-bound identity token', () => {
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => NOW_MS,
      120
    )
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS,
      maxLifetimeSeconds: 120,
      clockSkewSeconds: 30
    })

    expect(resolve({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
  })

  it('uses default resolver windows and accepts a token created with default lifetime', () => {
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => NOW_MS
    )
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS
    })

    expect(resolve({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
  })

  it('accepts the previous secret only during an explicit rotation window', () => {
    const previous = 'previous-operator-secret-2026-long-enough-xxxxxxxx'
    const active = 'active-operator-secret-2026-long-enough-yyyyyyyy'
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      previous,
      () => NOW_MS
    )
    const resolve = createTrustedOperatorIdentityResolver({
      secret: [active, previous],
      now: () => NOW_MS
    })
    expect(resolve({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
    expect(() => createTrustedOperatorIdentityResolver({ secret: [] })).toThrow(
      /secret/
    )
  })

  it('rejects a replayed token while accepting a distinct token ID', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS
    })
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => NOW_MS
    )

    expect(resolve({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
    expect(() => resolve({ 'x-cvg-operator-token': token })).toThrow(/replay/i)

    const distinctToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => NOW_MS
    )
    expect(resolve({ 'x-cvg-operator-token': distinctToken })).toEqual(IDENTITY)
  })

  it('expires replay entries and fails closed when the bounded cache is full', () => {
    let now = NOW_MS
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => now,
      replayCacheSize: 1
    })
    const first = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => now,
      1
    )
    const second = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => now,
      1
    )

    expect(resolve({ 'x-cvg-operator-token': first })).toEqual(IDENTITY)
    expect(() => resolve({ 'x-cvg-operator-token': second })).toThrow(/full/i)

    now += 2_000
    const postExpiryToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      SECRET,
      () => now,
      1
    )
    expect(resolve({ 'x-cvg-operator-token': postExpiryToken })).toEqual(
      IDENTITY
    )
    expect(() => resolve({ 'x-cvg-operator-token': postExpiryToken })).toThrow(
      /replay/i
    )
  })

  it('rejects weak or placeholder signing secrets', () => {
    expect(() =>
      createTrustedOperatorIdentityToken(IDENTITY, 'too-short')
    ).toThrow(/signing secret/)
    expect(() =>
      createTrustedOperatorIdentityToken(
        IDENTITY,
        'replace_me_with_a_long_but_invalid_secret'
      )
    ).toThrow(/signing secret/)
    expect(() =>
      createTrustedOperatorIdentityResolver({ secret: 'too-short' })
    ).toThrow(/signing secret/)
  })

  it('rejects identities without a tenant and invalid token windows', () => {
    expect(() =>
      createTrustedOperatorIdentityToken(IDENTITYWithoutTenant, SECRET)
    ).toThrow(/tenant-bound/)
    expect(() =>
      createTrustedOperatorIdentityToken(IDENTITY, SECRET, () => NOW_MS, 0)
    ).toThrow(/token window/)
    expect(() =>
      createTrustedOperatorIdentityResolver({
        secret: SECRET,
        maxLifetimeSeconds: 901
      })
    ).toThrow(/token window/)
    expect(() =>
      createTrustedOperatorIdentityResolver({
        secret: SECRET,
        clockSkewSeconds: -1
      })
    ).toThrow(/token window/)
    expect(() =>
      createTrustedOperatorIdentityResolver({
        secret: SECRET,
        replayCacheSize: 0
      })
    ).toThrow(/replay cache/)
  })

  it('rejects missing, malformed, and tampered headers', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS
    })
    const token = signedToken(validClaims())
    const sameLengthBadSignature = `${'a'.repeat(sign(token.split('.')[0]!).length)}`

    expect(() => resolve({})).toThrow(/required/)
    expect(() => resolve({ 'x-cvg-operator-token': '   ' })).toThrow(/required/)
    expect(() => resolve({ 'x-cvg-operator-token': ['not-a-token'] })).toThrow(
      /required/
    )
    expect(() =>
      resolve({ 'x-cvg-operator-token': 'missing-separator' })
    ).toThrow(/format/)
    expect(() => resolve({ 'x-cvg-operator-token': `${token}.extra` })).toThrow(
      /format/
    )
    expect(() =>
      resolve({
        'x-cvg-operator-token': `${token.split('.')[0]}.${sameLengthBadSignature}`
      })
    ).toThrow(/signature/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': `${token.split('.')[0]}.wrong`
      })
    ).toThrow(/signature/)
  })

  it('rejects invalid encoded claims and invalid identity claims', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS
    })
    const invalidEncoding = 'not*base64url'

    expect(() =>
      resolve({
        'x-cvg-operator-token': `${invalidEncoding}.${sign(invalidEncoding)}`
      })
    ).toThrow(/payload/)
    const malformedJson = Buffer.from('not-json', 'utf8').toString('base64url')
    expect(() =>
      resolve({
        'x-cvg-operator-token': `${malformedJson}.${sign(malformedJson)}`
      })
    ).toThrow(/payload/)
    expect(() => resolve({ 'x-cvg-operator-token': signedToken([]) })).toThrow(
      /claims/
    )
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(validClaims({ role: 'Invalid' }))
      })
    ).toThrow()
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ tenantId: undefined })
        )
      })
    ).toThrow(/tenant/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(validClaims({ jti: undefined }))
      })
    ).toThrow(/claims/)
  })

  it('rejects invalid audience, time claims, future tokens, and expired tokens', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS,
      maxLifetimeSeconds: 300,
      clockSkewSeconds: 30
    })

    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(validClaims({ aud: 'other-api' }))
      })
    ).toThrow(/claims/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ iss: 'untrusted-issuer' })
        )
      })
    ).toThrow(/claims/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(validClaims({ iss: undefined }))
      })
    ).toThrow(/claims/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(validClaims({ exp: NOW_SECONDS }))
      })
    ).toThrow(/claims/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ exp: NOW_SECONDS + 301 })
        )
      })
    ).toThrow(/claims/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ iat: NOW_SECONDS + 31, exp: NOW_SECONDS + 100 })
        )
      })
    ).toThrow(/expired or not active/)
    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ iat: NOW_SECONDS - 301, exp: NOW_SECONDS - 1 })
        )
      })
    ).toThrow(/expired or not active/)
  })

  it('rejects a token whose expiration is exactly the current second', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: SECRET,
      now: () => NOW_MS,
      maxLifetimeSeconds: 300,
      clockSkewSeconds: 30
    })

    expect(() =>
      resolve({
        'x-cvg-operator-token': signedToken(
          validClaims({ iat: NOW_SECONDS - 1, exp: NOW_SECONDS })
        )
      })
    ).toThrow(/expired or not active/)
  })

  it('supports bounded key rotation and rejects missing or inactive key ids', () => {
    const previousSecret = 'previous-operator-secret-for-rotation-tests-2026'
    const currentSecret = 'current-operator-secret-for-rotation-tests-2026'
    const ring = createLocalIdentityKeyRing({
      current: { keyId: 'current', secret: currentSecret },
      previous: [
        {
          keyId: 'previous',
          secret: previousSecret,
          rotatedAt: NOW_SECONDS - 10
        }
      ],
      rotationWindowSeconds: 60
    })
    const resolve = createTrustedOperatorIdentityResolver({
      keyRing: ring,
      now: () => NOW_MS
    })
    const previousToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      { keyId: 'previous', secret: previousSecret },
      () => NOW_MS
    )
    expect(resolve({ 'x-cvg-operator-token': previousToken })).toEqual(IDENTITY)

    const missingKeyId = createTrustedOperatorIdentityToken(
      IDENTITY,
      currentSecret,
      () => NOW_MS
    )
    expect(() => resolve({ 'x-cvg-operator-token': missingKeyId })).toThrow(
      /key identifier/
    )
    const expiredRing = createLocalIdentityKeyRing({
      current: { keyId: 'current', secret: currentSecret },
      previous: [
        {
          keyId: 'previous',
          secret: previousSecret,
          rotatedAt: NOW_SECONDS - 10
        }
      ],
      rotationWindowSeconds: 1
    })
    expect(expiredRing.keysAt(NOW_SECONDS)).toEqual([
      { keyId: 'current', secret: currentSecret }
    ])
    const expiredResolve = createTrustedOperatorIdentityResolver({
      keyRing: expiredRing,
      now: () => NOW_MS
    })
    expect(() =>
      expiredResolve({ 'x-cvg-operator-token': previousToken })
    ).toThrow(/not active/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: { keyId: 'current', secret: currentSecret },
        previous: [
          {
            keyId: 'current',
            secret: previousSecret,
            rotatedAt: NOW_SECONDS
          }
        ]
      })
    ).toThrow(/duplicate/)
  })

  it('parses configured key rings and safely decodes replay claims', () => {
    const current = {
      keyId: 'configured',
      secret: 'configured-operator-secret-for-tests-2026'
    }
    const raw = JSON.stringify({ current, previous: [], revokedKeyIds: [] })
    const resolver = createConfiguredOperatorIdentityResolver({
      NODE_ENV: 'production',
      CVG_IDENTITY_MODE: 'trusted',
      CVG_OPERATOR_IDENTITY_KEYRING: raw
    })
    expect(resolver).toBeTypeOf('function')
    const configuredNow = Math.floor(Date.now() / 1000)
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      current,
      () => configuredNow * 1_000
    )
    expect(resolver?.({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
    expect(decodeTrustedOperatorTokenClaims(token)).toMatchObject({
      iat: configuredNow,
      exp: configuredNow + 300
    })
    expect(decodeTrustedOperatorTokenClaims(undefined)).toBeNull()
    expect(decodeTrustedOperatorTokenClaims('not-a-token')).toBeNull()
    expect(decodeTrustedOperatorTokenClaims(`${token}.extra`)).toBeNull()
    expect(
      decodeTrustedOperatorTokenClaims('not*base64url.signature')
    ).toBeNull()

    expect(
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'test',
        CVG_IDENTITY_MODE: undefined,
        CVG_OPERATOR_IDENTITY_KEYRING: undefined
      })
    ).toBeUndefined()
    expect(
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'production',
        CVG_IDENTITY_MODE: 'simulation',
        CVG_OPERATOR_IDENTITY_KEYRING: raw
      })
    ).toBeUndefined()
    expect(() =>
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'production',
        CVG_IDENTITY_MODE: 'trusted',
        CVG_OPERATOR_IDENTITY_KEYRING: '{invalid'
      })
    ).toThrow(/KEYRING.*invalid/i)
    expect(() =>
      createConfiguredOperatorIdentityResolver({
        NODE_ENV: 'production',
        CVG_IDENTITY_MODE: 'trusted',
        CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
          current: { keyId: 'configured', secret: current.secret },
          revokedKeyIds: ['bad', 1]
        })
      })
    ).toThrow(/KEYRING.*invalid/i)
  })
})

const IDENTITYWithoutTenant = {
  operatorId: IDENTITY.operatorId,
  role: IDENTITY.role
}
