import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  IDENTITY_MODE_ENV,
  OperatorIdentitySchema,
  parseIdentityMode,
  type IdentityKeyRingPort,
  type IdentitySigningKey,
  type OperatorIdentity,
  type OperatorIdentityResolver
} from '@cvg/shared'

export const TRUSTED_OPERATOR_TOKEN_HEADER = 'x-cvg-operator-token'
export const OPERATOR_IDENTITY_KEYRING_ENV = 'CVG_OPERATOR_IDENTITY_KEYRING'
export const DEFAULT_ROTATION_WINDOW_SECONDS = 3_600
export const MAX_ROTATION_WINDOW_SECONDS = 86_400
const TRUSTED_OPERATOR_TOKEN_AUDIENCE = 'cvg-api'
const DEFAULT_TOKEN_LIFETIME_SECONDS = 300
const DEFAULT_CLOCK_SKEW_SECONDS = 30
const DEFAULT_REPLAY_CACHE_SIZE = 4_096
const MAX_REPLAY_CACHE_SIZE = 100_000

interface TrustedOperatorTokenClaims extends OperatorIdentity {
  aud: typeof TRUSTED_OPERATOR_TOKEN_AUDIENCE
  iat: number
  exp: number
  jti: string
  kid?: string
}

export type TrustedOperatorSigningKey = IdentitySigningKey

export interface TrustedOperatorIdentityResolverOptions {
  /**
   * Active secret first; previous secrets may remain during a bounded rotation.
   * Ignored when `keyRing` is provided.
   */
  secret?: string | readonly string[]
  /**
   * Rotation port. When present, every token must carry a `kid` bound to a key
   * the ring reports as usable at the current instant (current, or previous
   * inside the bounded window and not revoked).
   */
  keyRing?: IdentityKeyRingPort
  now?: () => number
  maxLifetimeSeconds?: number
  clockSkewSeconds?: number
  /** Maximum number of unexpired token IDs retained for replay protection. */
  replayCacheSize?: number
}

export interface LocalIdentityKeyRingOptions {
  current: TrustedOperatorSigningKey
  /** Previous keys with the instant (epoch seconds) they were rotated out. */
  previous?: readonly (TrustedOperatorSigningKey & { rotatedAt: number })[]
  revokedKeyIds?: readonly string[]
  /** Bounded window in seconds; defaults to one hour and caps at one day. */
  rotationWindowSeconds?: number
}

export function createTrustedOperatorIdentityToken(
  identity: OperatorIdentity,
  signingKey: string | TrustedOperatorSigningKey,
  now: () => number = Date.now,
  lifetimeSeconds = DEFAULT_TOKEN_LIFETIME_SECONDS
): string {
  const key = normalizeSigningKey(signingKey)
  assertSigningSecret(key.secret)
  assertTokenWindow(lifetimeSeconds, DEFAULT_CLOCK_SKEW_SECONDS)
  if (!identity.tenantId) {
    throw new Error('Trusted operator tokens require a tenant-bound identity')
  }

  const issuedAt = Math.floor(now() / 1000)
  const claims: TrustedOperatorTokenClaims = {
    ...OperatorIdentitySchema.parse(identity),
    aud: TRUSTED_OPERATOR_TOKEN_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + lifetimeSeconds,
    jti: `jti_${randomUUID()}`,
    ...(key.keyId === undefined ? {} : { kid: key.keyId })
  }
  const encodedClaims = encodeJson(claims)
  return `${encodedClaims}.${sign(encodedClaims, key.secret)}`
}

export function createTrustedOperatorIdentityResolver(
  options: TrustedOperatorIdentityResolverOptions
): OperatorIdentityResolver {
  const keyRing = options.keyRing
  const secrets =
    options.secret === undefined
      ? []
      : (Array.isArray(options.secret) ? options.secret : [options.secret]).map(
          (secret) => secret.trim()
        )
  if (options.secret !== undefined && secrets.length === 0) {
    throw new Error('At least one signing secret is required')
  }
  if (secrets.length === 0 && !keyRing) {
    throw new Error('At least one signing secret is required')
  }
  secrets.forEach(assertSigningSecret)
  const now = options.now ?? Date.now
  const maxLifetimeSeconds =
    options.maxLifetimeSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS
  const clockSkewSeconds =
    options.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS
  const replayCacheSize = options.replayCacheSize ?? DEFAULT_REPLAY_CACHE_SIZE
  assertTokenWindow(maxLifetimeSeconds, clockSkewSeconds)
  assertReplayCacheSize(replayCacheSize)
  const replayedTokenIds = new Map<string, number>()

  return (headers) => {
    const token = headers[TRUSTED_OPERATOR_TOKEN_HEADER]
    if (typeof token !== 'string' || token.trim() === '') {
      throw new Error('Trusted operator token is required')
    }
    const [encodedClaims, encodedSignature, ...extraParts] = token.split('.')
    if (!encodedClaims || !encodedSignature || extraParts.length > 0) {
      throw new Error('Trusted operator token format is invalid')
    }
    const claims = decodeClaims(encodedClaims)
    const currentTime = Math.floor(now() / 1000)
    const candidateSecrets = resolveCandidateSecrets(
      claims,
      keyRing,
      secrets,
      currentTime
    )
    const receivedBuffer = Buffer.from(encodedSignature, 'utf8')
    const signatureMatches = candidateSecrets.some((secret) => {
      const expectedBuffer = Buffer.from(sign(encodedClaims, secret), 'utf8')
      return (
        expectedBuffer.length === receivedBuffer.length &&
        timingSafeEqual(expectedBuffer, receivedBuffer)
      )
    })
    if (!signatureMatches) {
      throw new Error('Trusted operator token signature is invalid')
    }

    const identity = OperatorIdentitySchema.parse({
      operatorId: claims.operatorId,
      role: claims.role,
      tenantId: claims.tenantId
    })
    if (!identity.tenantId) {
      throw new Error('Trusted operator token must include a tenant')
    }
    if (
      claims.aud !== TRUSTED_OPERATOR_TOKEN_AUDIENCE ||
      !Number.isInteger(claims.iat) ||
      !Number.isInteger(claims.exp) ||
      !isTrustedOperatorTokenId(claims.jti) ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > maxLifetimeSeconds
    ) {
      throw new Error('Trusted operator token claims are invalid')
    }

    if (
      claims.iat > currentTime + clockSkewSeconds ||
      claims.exp <= currentTime
    ) {
      throw new Error('Trusted operator token is expired or not active')
    }

    pruneReplayedTokenIds(replayedTokenIds, currentTime)
    if (replayedTokenIds.has(claims.jti)) {
      throw new Error('Trusted operator token replay detected')
    }
    if (replayedTokenIds.size >= replayCacheSize) {
      throw new Error('Trusted operator replay cache is full')
    }
    replayedTokenIds.set(claims.jti, claims.exp)
    return identity
  }
}

/**
 * Deterministic local key ring for controlled tests and self-hosted rotation.
 * No credential is embedded here: keys come from the caller/runtime secret
 * mechanism. Revoked keys are never usable and previous keys stop authorizing
 * once the bounded rotation window closes.
 */
export function createLocalIdentityKeyRing(
  options: LocalIdentityKeyRingOptions
): IdentityKeyRingPort {
  const current = normalizeRingKey(options.current)
  const rotationWindowSeconds =
    options.rotationWindowSeconds ?? DEFAULT_ROTATION_WINDOW_SECONDS
  if (
    !Number.isInteger(rotationWindowSeconds) ||
    rotationWindowSeconds <= 0 ||
    rotationWindowSeconds > MAX_ROTATION_WINDOW_SECONDS
  ) {
    throw new Error('Identity key rotation window is invalid')
  }
  const previous = (options.previous ?? []).map((entry) => {
    const key = normalizeRingKey(entry)
    if (!Number.isInteger(entry.rotatedAt) || entry.rotatedAt < 0) {
      throw new Error('Identity key rotatedAt must be epoch seconds')
    }
    return { ...key, rotatedAt: entry.rotatedAt }
  })
  const revokedKeyIds = new Set(
    (options.revokedKeyIds ?? []).map((keyId) => assertKeyId(keyId))
  )
  const keyIds = [current.keyId, ...previous.map((entry) => entry.keyId)]
  if (new Set(keyIds).size !== keyIds.length) {
    throw new Error('Identity key ring contains duplicate key ids')
  }

  return {
    keysAt: (nowSeconds: number) => {
      const active: IdentitySigningKey[] = []
      if (!revokedKeyIds.has(current.keyId)) {
        active.push({ keyId: current.keyId, secret: current.secret })
      }
      if (!Number.isFinite(nowSeconds)) return active
      for (const entry of previous) {
        if (revokedKeyIds.has(entry.keyId)) continue
        if (nowSeconds >= entry.rotatedAt + rotationWindowSeconds) continue
        active.push({ keyId: entry.keyId, secret: entry.secret })
      }
      return active
    }
  }
}

/**
 * Composition helper for the API entrypoint: builds a trusted resolver from the
 * explicit runtime key ring (`CVG_OPERATOR_IDENTITY_KEYRING`). Returns
 * `undefined` in simulation mode or when no key material is configured, so the
 * composition fails closed instead of inventing an identity. Production still
 * requires the resolver to be injected/configured; this is not the D04 IdP
 * integration.
 */
export function createConfiguredOperatorIdentityResolver(
  env: NodeJS.ProcessEnv
): OperatorIdentityResolver | undefined {
  const identityMode = parseIdentityMode(env[IDENTITY_MODE_ENV], env.NODE_ENV)
  if (identityMode !== 'trusted') return undefined
  const rawKeyRing = env[OPERATOR_IDENTITY_KEYRING_ENV]?.trim()
  if (!rawKeyRing) return undefined

  let decoded: unknown
  try {
    decoded = JSON.parse(rawKeyRing)
  } catch {
    throw new Error(`${OPERATOR_IDENTITY_KEYRING_ENV} is invalid`)
  }
  try {
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('invalid')
    }
    const record = decoded as Record<string, unknown>
    const current = parseKeyRingEntry(record.current)
    const previous = parsePreviousKeyRingEntries(record.previous)
    const revokedKeyIds = parseRevokedKeyIds(record.revokedKeyIds)
    const rotationWindowSeconds = parseRotationWindow(
      record.rotationWindowSeconds
    )
    return createTrustedOperatorIdentityResolver({
      keyRing: createLocalIdentityKeyRing({
        current,
        previous,
        revokedKeyIds,
        ...(rotationWindowSeconds === undefined
          ? {}
          : { rotationWindowSeconds })
      })
    })
  } catch {
    throw new Error(`${OPERATOR_IDENTITY_KEYRING_ENV} is invalid`)
  }
}

function resolveCandidateSecrets(
  claims: TrustedOperatorTokenClaims,
  keyRing: IdentityKeyRingPort | undefined,
  staticSecrets: readonly string[],
  currentTime: number
): readonly string[] {
  if (!keyRing) return staticSecrets
  const keyId = claims.kid
  if (typeof keyId !== 'string' || keyId.trim() === '') {
    throw new Error(
      'Trusted operator token requires a key identifier when a key ring is configured'
    )
  }
  const key = keyRing
    .keysAt(currentTime)
    .find((candidate) => candidate.keyId === keyId.trim())
  if (!key) {
    throw new Error('Trusted operator token signing key is not active')
  }
  assertSigningSecret(key.secret)
  return [key.secret.trim()]
}

function normalizeSigningKey(signingKey: string | TrustedOperatorSigningKey): {
  keyId?: string
  secret: string
} {
  if (typeof signingKey === 'string') return { secret: signingKey }
  return {
    keyId: assertKeyId(signingKey.keyId),
    secret: signingKey.secret
  }
}

function normalizeRingKey(key: TrustedOperatorSigningKey): IdentitySigningKey {
  assertSigningSecret(key.secret)
  return { keyId: assertKeyId(key.keyId), secret: key.secret }
}

function assertKeyId(keyId: unknown): string {
  if (typeof keyId !== 'string' || !/^[A-Za-z0-9._:-]{3,80}$/.test(keyId)) {
    throw new Error('Identity signing key id is invalid')
  }
  return keyId
}

function parseKeyRingEntry(value: unknown): TrustedOperatorSigningKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid')
  }
  const { keyId, secret } = value as Record<string, unknown>
  if (typeof keyId !== 'string' || typeof secret !== 'string') {
    throw new Error('invalid')
  }
  return { keyId, secret }
}

function parsePreviousKeyRingEntries(
  value: unknown
): readonly (TrustedOperatorSigningKey & { rotatedAt: number })[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('invalid')
  return value.map((entry) => {
    const key = parseKeyRingEntry(entry)
    const rotatedAt = (entry as Record<string, unknown>).rotatedAt
    if (typeof rotatedAt !== 'number') throw new Error('invalid')
    return { ...key, rotatedAt }
  })
}

function parseRevokedKeyIds(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('invalid')
  return value.map((keyId) => {
    if (typeof keyId !== 'string') throw new Error('invalid')
    return keyId
  })
}

function parseRotationWindow(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number') throw new Error('invalid')
  return value
}

function assertSigningSecret(secret: string): void {
  const normalized = secret.trim()
  if (
    normalized.length < 32 ||
    /replace[_-]?me|change[_-]?me|example/i.test(normalized)
  ) {
    throw new Error(
      'Trusted operator identity signing secret must contain at least 32 non-placeholder characters'
    )
  }
}

function assertTokenWindow(
  lifetimeSeconds: number,
  clockSkewSeconds: number
): void {
  if (
    !Number.isInteger(lifetimeSeconds) ||
    lifetimeSeconds <= 0 ||
    lifetimeSeconds > 900 ||
    !Number.isInteger(clockSkewSeconds) ||
    clockSkewSeconds < 0 ||
    clockSkewSeconds > 300
  ) {
    throw new Error('Trusted operator token window is invalid')
  }
}

function assertReplayCacheSize(size: number): void {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    size > MAX_REPLAY_CACHE_SIZE
  ) {
    throw new Error('Trusted operator replay cache size is invalid')
  }
}

function isTrustedOperatorTokenId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^jti_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      value
    )
  )
}

function pruneReplayedTokenIds(
  entries: Map<string, number>,
  currentTime: number
): void {
  for (const [jti, expiresAt] of entries) {
    if (expiresAt <= currentTime) entries.delete(jti)
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function sign(encodedClaims: string, secret: string): string {
  return createHmac('sha256', secret.trim())
    .update(encodedClaims, 'utf8')
    .digest('base64url')
}

function decodeClaims(encodedClaims: string): TrustedOperatorTokenClaims {
  if (!/^[A-Za-z0-9_-]+$/.test(encodedClaims)) {
    throw new Error('Trusted operator token payload is invalid')
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(
      Buffer.from(encodedClaims, 'base64url').toString('utf8')
    )
  } catch {
    throw new Error('Trusted operator token payload is invalid')
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Trusted operator token claims are invalid')
  }
  return decoded as TrustedOperatorTokenClaims
}
