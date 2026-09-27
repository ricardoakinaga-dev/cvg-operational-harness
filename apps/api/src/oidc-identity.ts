import { createHash } from 'node:crypto'
import { OperatorIdentitySchema, type OperatorIdentity } from '@cvg/shared'

const SESSION_LIFETIME_SECONDS = 15 * 60
const DEFAULT_AUTHENTICATION_AGE_SECONDS = 5 * 60
const CLOCK_SKEW_SECONDS = 30
const TENANT_GROUP =
  /^\/(tenant_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(Operator|Approver|Supervisor|Admin)$/

export interface VerifiedOidcIdentityOptions {
  issuer: string
  clientId: string
  now?: () => number
  maxAuthenticationAgeSeconds?: number
}

export interface MappedOidcIdentity {
  identity: OperatorIdentity
  expiresAt: number
}

/**
 * Accepts claims ONLY after an OIDC client has verified the ID token's
 * signature, issuer, audience, nonce and token response. This function adds
 * the local MFA, freshness and tenant-role authorization policy; it does not
 * decode or authenticate a browser-supplied token.
 */
export function mapVerifiedOidcClaims(
  claims: unknown,
  options: VerifiedOidcIdentityOptions
): MappedOidcIdentity {
  const nowSeconds = Math.floor((options.now ?? Date.now)() / 1_000)
  const maxAge =
    options.maxAuthenticationAgeSeconds ?? DEFAULT_AUTHENTICATION_AGE_SECONDS
  if (
    !Number.isInteger(nowSeconds) ||
    !Number.isInteger(maxAge) ||
    maxAge <= 0 ||
    maxAge > SESSION_LIFETIME_SECONDS ||
    !options.issuer ||
    !options.clientId
  ) {
    throw new Error('OIDC identity policy is invalid')
  }
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new Error('Verified OIDC claims are invalid')
  }
  const value = claims as Record<string, unknown>
  if (
    value.iss !== options.issuer ||
    !hasExpectedAudience(value.aud, value.azp, options.clientId) ||
    typeof value.sub !== 'string' ||
    value.sub.length === 0 ||
    Buffer.byteLength(value.sub, 'utf8') > 512 ||
    !isEpochSecond(value.iat) ||
    !isEpochSecond(value.exp) ||
    !isEpochSecond(value.auth_time) ||
    value.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    value.exp <= nowSeconds ||
    value.exp <= value.iat ||
    value.auth_time > nowSeconds + CLOCK_SKEW_SECONDS ||
    value.auth_time < nowSeconds - maxAge ||
    value.auth_time > value.iat + CLOCK_SKEW_SECONDS
  ) {
    throw new Error('Verified OIDC claims do not meet identity policy')
  }
  if (
    !Array.isArray(value.amr) ||
    !value.amr.every((method) => typeof method === 'string') ||
    !value.amr.includes('pwd') ||
    !value.amr.includes('otp')
  ) {
    throw new Error('Verified OIDC claims do not prove required MFA')
  }
  if (
    !Array.isArray(value.groups) ||
    !value.groups.every((group) => typeof group === 'string')
  ) {
    throw new Error('Verified OIDC claims lack trusted groups')
  }
  const tenantGroups = value.groups.filter((group: string) =>
    group.startsWith('/tenant_')
  )
  if (tenantGroups.length !== 1) {
    throw new Error('Operator must belong to exactly one tenant-role group')
  }
  const group = TENANT_GROUP.exec(tenantGroups[0] ?? '')
  if (!group) {
    throw new Error('Operator tenant-role group is malformed')
  }
  const operatorId = `oidc_${createHash('sha256')
    .update(JSON.stringify([value.iss, value.sub]))
    .digest('hex')}`
  return {
    identity: OperatorIdentitySchema.parse({
      operatorId,
      tenantId: group[1],
      role: group[2]
    }),
    expiresAt:
      Math.min(value.exp, nowSeconds + SESSION_LIFETIME_SECONDS) * 1_000
  }
}

function isEpochSecond(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function hasExpectedAudience(
  audience: unknown,
  authorizedParty: unknown,
  clientId: string
): boolean {
  if (typeof audience === 'string') {
    return (
      audience === clientId &&
      (authorizedParty === undefined || authorizedParty === clientId)
    )
  }
  return (
    Array.isArray(audience) &&
    audience.length > 0 &&
    audience.every((entry) => typeof entry === 'string') &&
    audience.includes(clientId) &&
    (audience.length === 1
      ? authorizedParty === undefined || authorizedParty === clientId
      : authorizedParty === clientId)
  )
}
