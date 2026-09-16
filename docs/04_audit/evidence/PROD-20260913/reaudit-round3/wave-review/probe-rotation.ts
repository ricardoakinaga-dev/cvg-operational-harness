/**
 * Independent critical probe (wave3): key-ring rotation + configured factory.
 * Synthetic keys only; no repo mutation.
 */
import { createHmac } from 'node:crypto'
import {
  createConfiguredOperatorIdentityResolver,
  createLocalIdentityKeyRing,
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '/home/ricardo/cvg-agent-secretary-v2/apps/api/src/operator-identity.ts'

const T0 = 1_700_000_000
const NOW_MS = T0 * 1000
const now = () => NOW_MS
const CURRENT = {
  keyId: 'kid_cur_2026',
  secret: 'current-probe-secret-0123456789abcdefgh'
}
const PREV = {
  keyId: 'kid_prev_2026',
  secret: 'previous-probe-secret-0123456789abcdefg'
}
const IDENTITY = {
  operatorId: 'operator.rotation.critic',
  role: 'Supervisor' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-0000000009c1'
}
const results: Record<string, unknown> = {}

function b64(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}
function sign(encoded: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(encoded, 'utf8')
    .digest('base64url')
}
function claimsToken(claims: Record<string, unknown>, secret: string): string {
  const encoded = b64(claims)
  return `${encoded}.${sign(encoded, secret)}`
}
function baseClaims(kid?: string): Record<string, unknown> {
  return {
    ...IDENTITY,
    aud: 'cvg-api',
    iat: T0,
    exp: T0 + 300,
    jti: `jti_${crypto.randomUUID()}`,
    ...(kid ? { kid } : {})
  }
}
function tryResolve(
  resolver: (h: Record<string, unknown>) => unknown,
  token: string
) {
  try {
    const identity = resolver({ 'x-cvg-operator-token': token })
    return { ok: true, identity }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

// previous within window accepted; at/after window rejected
const inWindowRing = createLocalIdentityKeyRing({
  current: CURRENT,
  previous: [{ ...PREV, rotatedAt: T0 - 100 }],
  rotationWindowSeconds: 600
})
const outWindowRing = createLocalIdentityKeyRing({
  current: CURRENT,
  previous: [{ ...PREV, rotatedAt: T0 - 601 }],
  rotationWindowSeconds: 600
})
const inWindow = createTrustedOperatorIdentityResolver({
  keyRing: inWindowRing,
  now
})
const outWindow = createTrustedOperatorIdentityResolver({
  keyRing: outWindowRing,
  now
})
results.previousInWindow = tryResolve(
  inWindow,
  createTrustedOperatorIdentityToken(IDENTITY, PREV, now)
)
results.previousAfterWindow = tryResolve(
  outWindow,
  createTrustedOperatorIdentityToken(IDENTITY, PREV, now)
)

// revoked previous key rejected immediately
const revokedRing = createLocalIdentityKeyRing({
  current: CURRENT,
  previous: [{ ...PREV, rotatedAt: T0 - 10 }],
  revokedKeyIds: [PREV.keyId],
  rotationWindowSeconds: 600
})
results.revokedPrevious = tryResolve(
  createTrustedOperatorIdentityResolver({ keyRing: revokedRing, now }),
  createTrustedOperatorIdentityToken(IDENTITY, PREV, now)
)

// unknown kid and missing kid rejected when key ring configured
const ring = createLocalIdentityKeyRing({ current: CURRENT })
const ringResolver = createTrustedOperatorIdentityResolver({
  keyRing: ring,
  now
})
results.unknownKid = tryResolve(
  ringResolver,
  claimsToken(baseClaims('kid_unknown_2026'), CURRENT.secret)
)
results.missingKid = tryResolve(
  ringResolver,
  claimsToken(baseClaims(), CURRENT.secret)
)
results.validKid = tryResolve(
  ringResolver,
  claimsToken(baseClaims(CURRENT.keyId), CURRENT.secret)
)

// configured factory path (production mechanism): revoked kid rejected
const env = {
  NODE_ENV: 'production',
  CVG_IDENTITY_MODE: 'trusted',
  CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({
    current: CURRENT,
    previous: [{ ...PREV, rotatedAt: T0 - 100 }],
    revokedKeyIds: [CURRENT.keyId],
    rotationWindowSeconds: 600
  })
}
const factory = createConfiguredOperatorIdentityResolver(env)
if (!factory) throw new Error('factory did not build a resolver')
results.factoryRevokedCurrent = tryResolve(
  factory,
  claimsToken(baseClaims(CURRENT.keyId), CURRENT.secret)
)

console.log(JSON.stringify(results, null, 1))
