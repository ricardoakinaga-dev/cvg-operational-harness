import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  MAX_ROTATION_WINDOW_SECONDS,
  createLocalIdentityKeyRing,
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'

const NOW_SECONDS = 1_700_000_000
const NOW_MS = NOW_SECONDS * 1000
const ACTIVE = {
  keyId: 'kid_active_2026',
  secret: 'active-rotation-secret-2026-abcdefghijkl'
}
const PREVIOUS = {
  keyId: 'kid_previous_2026',
  secret: 'previous-rotation-secret-2026-abcdefghij'
}
const IDENTITY = {
  operatorId: 'operator.rotation',
  role: 'Supervisor' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-0000000009c1'
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(encodedClaims: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encodedClaims, 'utf8')
    .digest('base64url')
}

function signedClaims(claims: Record<string, unknown>, secret: string): string {
  const encodedClaims = encode(claims)
  return `${encodedClaims}.${sign(encodedClaims, secret)}`
}

describe('identity key ring rotation', () => {
  it('accepts current and previous keys inside the bounded rotation window', () => {
    const ring = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 100 }],
      rotationWindowSeconds: 600
    })
    const resolve = createTrustedOperatorIdentityResolver({
      keyRing: ring,
      now: () => NOW_MS
    })
    const activeToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      ACTIVE,
      () => NOW_MS
    )
    const previousToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      PREVIOUS,
      () => NOW_MS
    )

    expect(resolve({ 'x-cvg-operator-token': activeToken })).toEqual(IDENTITY)
    expect(resolve({ 'x-cvg-operator-token': previousToken })).toEqual(IDENTITY)
  })

  it('uses a default bounded window instead of accepting previous keys forever', () => {
    const ring = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 3_599 }]
    })
    const resolve = createTrustedOperatorIdentityResolver({
      keyRing: ring,
      now: () => NOW_MS
    })
    const previousToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      PREVIOUS,
      () => NOW_MS
    )

    expect(resolve({ 'x-cvg-operator-token': previousToken })).toEqual(IDENTITY)
  })

  it('rejects previous keys at and after the bounded rotation window', () => {
    const boundaryRing = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 600 }],
      rotationWindowSeconds: 600
    })
    const expiredRing = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 700 }],
      rotationWindowSeconds: 600
    })
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      PREVIOUS,
      () => NOW_MS
    )

    expect(() =>
      createTrustedOperatorIdentityResolver({
        keyRing: boundaryRing,
        now: () => NOW_MS
      })({ 'x-cvg-operator-token': token })
    ).toThrow(/not active/)
    expect(() =>
      createTrustedOperatorIdentityResolver({
        keyRing: expiredRing,
        now: () => NOW_MS
      })({ 'x-cvg-operator-token': token })
    ).toThrow(/not active/)
  })

  it('rejects revoked previous and current keys immediately', () => {
    const revokedPrevious = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 10 }],
      revokedKeyIds: [PREVIOUS.keyId],
      rotationWindowSeconds: 600
    })
    const revokedCurrent = createLocalIdentityKeyRing({
      current: ACTIVE,
      revokedKeyIds: [ACTIVE.keyId]
    })
    const previousToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      PREVIOUS,
      () => NOW_MS
    )
    const activeToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      ACTIVE,
      () => NOW_MS
    )

    expect(() =>
      createTrustedOperatorIdentityResolver({
        keyRing: revokedPrevious,
        now: () => NOW_MS
      })({ 'x-cvg-operator-token': previousToken })
    ).toThrow(/not active/)
    expect(() =>
      createTrustedOperatorIdentityResolver({
        keyRing: revokedCurrent,
        now: () => NOW_MS
      })({ 'x-cvg-operator-token': activeToken })
    ).toThrow(/not active/)
  })

  it('requires a key identifier when a key ring is configured', () => {
    const ring = createLocalIdentityKeyRing({ current: ACTIVE })
    const resolve = createTrustedOperatorIdentityResolver({
      keyRing: ring,
      now: () => NOW_MS
    })
    const legacyToken = createTrustedOperatorIdentityToken(
      IDENTITY,
      ACTIVE.secret,
      () => NOW_MS
    )

    expect(() => resolve({ 'x-cvg-operator-token': legacyToken })).toThrow(
      /key identifier/
    )
  })

  it('rejects unknown key identifiers and keys that do not match the signature', () => {
    const ring = createLocalIdentityKeyRing({
      current: ACTIVE,
      previous: [{ ...PREVIOUS, rotatedAt: NOW_SECONDS - 10 }],
      rotationWindowSeconds: 600
    })
    const resolve = createTrustedOperatorIdentityResolver({
      keyRing: ring,
      now: () => NOW_MS
    })
    const unknownKey = createTrustedOperatorIdentityToken(
      IDENTITY,
      { keyId: 'kid_unknown_2026', secret: ACTIVE.secret },
      () => NOW_MS
    )
    const mismatchedSignature = signedClaims(
      {
        ...IDENTITY,
        aud: 'cvg-api',
        iat: NOW_SECONDS,
        exp: NOW_SECONDS + 300,
        jti: 'jti_00000000-0000-4000-8000-0000000009c1',
        kid: ACTIVE.keyId
      },
      PREVIOUS.secret
    )

    expect(() => resolve({ 'x-cvg-operator-token': unknownKey })).toThrow(
      /not active/
    )
    expect(() =>
      resolve({ 'x-cvg-operator-token': mismatchedSignature })
    ).toThrow(/signature/)
  })

  it('rejects invalid rotation configuration', () => {
    expect(() =>
      createLocalIdentityKeyRing({ current: ACTIVE, rotationWindowSeconds: 0 })
    ).toThrow(/rotation window/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: ACTIVE,
        rotationWindowSeconds: MAX_ROTATION_WINDOW_SECONDS + 1
      })
    ).toThrow(/rotation window/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: ACTIVE,
        previous: [
          { ...PREVIOUS, rotatedAt: NOW_SECONDS - 10 },
          { ...PREVIOUS, rotatedAt: NOW_SECONDS - 20 }
        ]
      })
    ).toThrow(/duplicate/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: { keyId: ACTIVE.keyId, secret: 'too-short' }
      })
    ).toThrow(/signing secret/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: ACTIVE,
        previous: [{ ...PREVIOUS, rotatedAt: 1.5 }]
      })
    ).toThrow(/rotatedAt/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: { keyId: 'bad key id', secret: ACTIVE.secret }
      })
    ).toThrow(/key id/)
    expect(() =>
      createLocalIdentityKeyRing({
        current: ACTIVE,
        revokedKeyIds: ['bad key id']
      })
    ).toThrow(/key id/)
  })

  it('still accepts static secrets without a key ring for legacy callers', () => {
    const resolve = createTrustedOperatorIdentityResolver({
      secret: ACTIVE.secret,
      now: () => NOW_MS
    })
    const token = createTrustedOperatorIdentityToken(
      IDENTITY,
      ACTIVE.secret,
      () => NOW_MS
    )

    expect(resolve({ 'x-cvg-operator-token': token })).toEqual(IDENTITY)
    expect(() => createTrustedOperatorIdentityResolver({})).toThrow(/secret/)
  })
})
