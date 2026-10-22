import { createHash } from 'node:crypto'
import { OperatorIdentitySchema, type OperatorIdentity } from '@cvg/shared'
import type { OidcGroupMatrix } from './oidc-config.ts'

const SESSION_LIFETIME_SECONDS = 15 * 60
const AUTHENTICATION_AGE_SECONDS = 5 * 60
const CLOCK_SKEW_SECONDS = 30
const MAX_GROUPS = 256
const MAX_GROUP_LENGTH = 256

/** SPEC0254 §4.9 — log-only reason codes; responses never carry them. */
export type OidcLoginReasonCode =
  | 'origin_invalid'
  | 'rate_limited'
  | 'state_invalid'
  | 'state_unavailable'
  | 'idp_error'
  | 'token_rejected'
  | 'idp_unavailable'
  | 'mfa_missing'
  | 'groups_invalid'
  | 'no_eligible_group'
  | 'ambiguous_group'
  | 'inactive_group'
  | 'principal_inactive'
  | 'principal_drift'
  | 'principal_version_ahead'
  | 'principal_conflict'
  | 'principal_unavailable'
  | 'session_unavailable'

/** A login refusal (401); the message is generic, the reason is for logs. */
export class OidcLoginRefusal extends Error {
  constructor(readonly reasonCode: OidcLoginReasonCode) {
    super('Operator login was refused')
    this.name = 'OidcLoginRefusal'
  }
}

export interface OidcIdentityPolicy {
  issuer: string
  clientId: string
  requiredAmr: readonly string[]
  matrix: OidcGroupMatrix
  now?: () => number
}

export interface MappedOidcIdentity {
  identity: OperatorIdentity & { tenantId: string }
  /** Whether the matched matrix entry is active (the producer decides, §4.5). */
  active: boolean
  expiresAt: number
  /** Opaque, secret-free proof reference; only its digest is persisted. */
  proofRef: string
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * SPEC0254 §4.4. Accepts claims ONLY after the OIDC client verified the ID
 * token (signature against the issuer JWKS, issuer, audience, nonce, max_age
 * and the token response). It repeats the identity checks and adds the MFA
 * policy and the versioned group matrix; it never decodes a browser token.
 */
export function mapVerifiedOidcIdentity(
  claims: unknown,
  policy: OidcIdentityPolicy
): MappedOidcIdentity {
  const nowMs = (policy.now ?? Date.now)()
  if (
    !Number.isFinite(nowMs) ||
    !policy.issuer ||
    !policy.clientId ||
    policy.requiredAmr.length === 0 ||
    !policy.matrix?.claim
  ) {
    throw new Error('OIDC identity policy is invalid')
  }
  const nowSeconds = Math.floor(nowMs / 1_000)
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) {
    throw new OidcLoginRefusal('token_rejected')
  }
  const value = claims as Record<string, unknown>
  if (
    value.iss !== policy.issuer ||
    !hasExpectedAudience(value.aud, value.azp, policy.clientId) ||
    typeof value.sub !== 'string' ||
    value.sub.length === 0 ||
    Buffer.byteLength(value.sub, 'utf8') > 255 ||
    !isEpochSecond(value.iat) ||
    !isEpochSecond(value.exp) ||
    !isEpochSecond(value.auth_time) ||
    value.iat > nowSeconds + CLOCK_SKEW_SECONDS ||
    value.exp <= nowSeconds ||
    value.exp <= value.iat ||
    value.auth_time > nowSeconds + CLOCK_SKEW_SECONDS ||
    value.auth_time < nowSeconds - AUTHENTICATION_AGE_SECONDS ||
    value.auth_time > value.iat + CLOCK_SKEW_SECONDS
  ) {
    throw new OidcLoginRefusal('token_rejected')
  }
  const amr = value.amr
  if (
    !Array.isArray(amr) ||
    !amr.every((method) => typeof method === 'string') ||
    !policy.requiredAmr.every((method) => amr.includes(method))
  ) {
    throw new OidcLoginRefusal('mfa_missing')
  }
  // Own top-level member only: an inherited (polluted) property never counts.
  const groups = Object.hasOwn(value, policy.matrix.claim)
    ? value[policy.matrix.claim]
    : undefined
  if (
    !Array.isArray(groups) ||
    groups.length > MAX_GROUPS ||
    !groups.every(
      (group) => typeof group === 'string' && group.length <= MAX_GROUP_LENGTH
    )
  ) {
    throw new OidcLoginRefusal('groups_invalid')
  }
  // P2: groups outside the matrix are ignored; exactly one entry must match.
  const eligible = policy.matrix.entries.filter((entry) =>
    groups.includes(entry.group)
  )
  if (eligible.length === 0) throw new OidcLoginRefusal('no_eligible_group')
  if (eligible.length > 1) throw new OidcLoginRefusal('ambiguous_group')
  const entry = eligible[0]!
  const operatorId = `oidc_${sha256(JSON.stringify([value.iss, value.sub]))}`
  const identity = OperatorIdentitySchema.parse({
    operatorId,
    tenantId: entry.tenantId,
    role: entry.role
  })
  return {
    identity: { ...identity, tenantId: entry.tenantId },
    active: entry.active,
    expiresAt:
      Math.min(value.exp, nowSeconds + SESSION_LIFETIME_SECONDS) * 1_000,
    proofRef: `oidc-login:${sha256(
      JSON.stringify([value.iss, value.sub, value.iat, value.auth_time])
    )}`
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
