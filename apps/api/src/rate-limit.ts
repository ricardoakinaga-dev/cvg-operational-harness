import { createHmac, randomBytes } from 'node:crypto'

export interface RateLimitPolicy {
  max: number
  windowMs: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

/**
 * AUD19-006 / REM21-007 — limiter port. Memory is synchronous; the
 * distributed PostgreSQL limiter is asynchronous. Callers always `await`.
 */
export interface RateLimiterPort {
  check(
    key: string,
    policy: RateLimitPolicy
  ): RateLimitResult | Promise<RateLimitResult>
}

export const RATE_LIMIT_KEYRING_ENV = 'CVG_RATE_LIMIT_KEYRING'
export const DEFAULT_MAX_BUCKETS = 4_096
export const MAX_ALLOWED_BUCKETS = 65_536
export const MAX_RATE_LIMIT_WINDOW_MS = 86_400_000
export const MAX_RATE_LIMIT_REQUESTS = 1_000_000
export const MAX_RATE_LIMIT_KEY_LENGTH = 256
const MAX_RATE_LIMIT_KEYRING_PREVIOUS = 8
const MIN_RATE_LIMIT_SECRET_LENGTH = 32
const BUDGET_HMAC_DOMAIN = 'cvg-rate-limit:budget:v1:'
const KEY_HMAC_DOMAIN = 'cvg-rate-limit:key:v1:'

export interface RateLimitSigningKey {
  keyId: string
  secret: string
}

export interface RateLimitKeyRing {
  /** Stable across a normal key rotation; changing it needs a migration. */
  budgetSecret: string
  current: RateLimitSigningKey
  previous?: readonly RateLimitSigningKey[]
}

export interface RateLimitKeyMaterial {
  budgetKey: string
  keyVersion: string
  keyDigest: string
}

/**
 * Controlled-only keyring used by test fixtures that need multiple limiter
 * instances to share one synthetic namespace. It is not a production secret.
 */
export function createControlledRateLimitKeyRing(): RateLimitKeyRing {
  return createRateLimitKeyRing({
    budgetSecret:
      'controlled-rate-limit-budget-secret-for-tests-2026-09-21-0000000001',
    current: {
      keyId: 'rl-controlled-v1',
      secret: 'controlled-rate-limit-hmac-secret-for-tests-2026-09-21-0001'
    },
    previous: []
  })
}

export function createRateLimitKeyRing(
  input: RateLimitKeyRing
): RateLimitKeyRing {
  const current = normalizeRateLimitSigningKey(input.current)
  const previous = (input.previous ?? []).map(normalizeRateLimitSigningKey)
  const keyIds = [current.keyId, ...previous.map((key) => key.keyId)]
  if (new Set(keyIds).size !== keyIds.length) {
    throw new Error('Rate limit key ring contains duplicate key ids')
  }
  if (previous.length > MAX_RATE_LIMIT_KEYRING_PREVIOUS) {
    throw new Error(
      `Rate limit key ring supports at most ${MAX_RATE_LIMIT_KEYRING_PREVIOUS} previous keys`
    )
  }
  const budgetSecret = normalizeRateLimitSecret(input.budgetSecret)
  return {
    budgetSecret,
    current,
    ...(previous.length > 0 ? { previous } : {})
  }
}

/**
 * Parses the explicit runtime keyring. The test fallback is deliberately
 * synthetic and deterministic so disposable PostgreSQL fixtures can share a
 * budget across limiter instances without inventing a production secret.
 */
export function createConfiguredRateLimitKeyRing(
  env: NodeJS.ProcessEnv
): RateLimitKeyRing | undefined {
  const raw = env[RATE_LIMIT_KEYRING_ENV]?.trim()
  if (!raw) {
    return env.NODE_ENV === 'test'
      ? createControlledRateLimitKeyRing()
      : undefined
  }
  try {
    const decoded: unknown = JSON.parse(raw)
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('invalid')
    }
    const record = decoded as Record<string, unknown>
    const current = parseRateLimitSigningKey(record.current)
    const previous = parseRateLimitSigningKeys(record.previous)
    if (typeof record.budgetSecret !== 'string') throw new Error('invalid')
    return createRateLimitKeyRing({
      budgetSecret: record.budgetSecret,
      current,
      previous
    })
  } catch {
    throw new Error(`${RATE_LIMIT_KEYRING_ENV} is invalid`)
  }
}

function createEphemeralRateLimitKeyRing(): RateLimitKeyRing {
  const secret = randomBytes(32).toString('base64url')
  const budgetSecret = randomBytes(32).toString('base64url')
  return createRateLimitKeyRing({
    budgetSecret,
    current: { keyId: 'rl-ephemeral-v1', secret }
  })
}

function parseRateLimitSigningKey(value: unknown): RateLimitSigningKey {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid')
  }
  const record = value as Record<string, unknown>
  if (typeof record.keyId !== 'string' || typeof record.secret !== 'string') {
    throw new Error('invalid')
  }
  return { keyId: record.keyId, secret: record.secret }
}

function parseRateLimitSigningKeys(
  value: unknown
): readonly RateLimitSigningKey[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('invalid')
  return value.map(parseRateLimitSigningKey)
}

function normalizeRateLimitSigningKey(
  input: RateLimitSigningKey
): RateLimitSigningKey {
  if (!/^[A-Za-z0-9._:-]{3,80}$/.test(input.keyId.trim())) {
    throw new Error('Rate limit key id is invalid')
  }
  return {
    keyId: input.keyId.trim(),
    secret: normalizeRateLimitSecret(input.secret)
  }
}

function normalizeRateLimitSecret(secret: string): string {
  const normalized = secret.trim()
  if (
    normalized.length < MIN_RATE_LIMIT_SECRET_LENGTH ||
    /replace[_-]?me|change[_-]?me|example/i.test(normalized)
  ) {
    throw new Error(
      `Rate limit HMAC secrets must contain at least ${MIN_RATE_LIMIT_SECRET_LENGTH} non-placeholder characters`
    )
  }
  return normalized
}

export function deriveRateLimitKeyMaterial(
  key: string,
  keyRing: RateLimitKeyRing
): RateLimitKeyMaterial {
  const normalizedKey = normalizeRateLimitKey(key)
  const current = keyRing.current
  return {
    budgetKey: hmacHex(
      keyRing.budgetSecret,
      `${BUDGET_HMAC_DOMAIN}${normalizedKey}`
    ),
    keyVersion: current.keyId,
    keyDigest: hmacHex(
      current.secret,
      `${KEY_HMAC_DOMAIN}${current.keyId}:${normalizedKey}`
    )
  }
}

function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex')
}

export class RateLimitCapacityError extends Error {
  readonly code = 'rate_limit_capacity'

  constructor() {
    super('Rate limit capacity is full of active budgets')
    this.name = 'RateLimitCapacityError'
  }
}

export interface InMemoryRateLimiterOptions {
  now?: () => number
  maxBuckets?: number
  keyRing?: RateLimitKeyRing
}

export interface RateLimitSnapshot {
  bucketCount: number
  maxBuckets: number
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

export class InMemoryRateLimiter implements RateLimiterPort {
  private buckets = new Map<string, RateLimitBucket>()
  private readonly now: () => number
  private readonly maxBuckets: number
  private readonly keyRing: RateLimitKeyRing

  constructor(
    nowOrOptions: (() => number) | InMemoryRateLimiterOptions = Date.now
  ) {
    const options =
      typeof nowOrOptions === 'function' ? { now: nowOrOptions } : nowOrOptions
    this.now = options.now ?? Date.now
    this.maxBuckets = validateMaxBuckets(options.maxBuckets)
    this.keyRing = createRateLimitKeyRing(
      options.keyRing ?? createEphemeralRateLimitKeyRing()
    )
  }

  check(key: string, policy: RateLimitPolicy): RateLimitResult {
    const normalizedKey = normalizeRateLimitKey(key)
    validateRateLimitPolicy(policy)
    const currentTime = this.now()
    if (!Number.isFinite(currentTime)) {
      throw new RangeError('Rate limit clock must return a finite number')
    }

    const { budgetKey } = deriveRateLimitKeyMaterial(
      normalizedKey,
      this.keyRing
    )
    const nextBuckets = withoutExpiredBuckets(this.buckets, currentTime)
    const existing = nextBuckets.get(budgetKey)
    if (!existing) {
      this.buckets = nextBuckets
      if (nextBuckets.size >= this.maxBuckets) {
        throw new RateLimitCapacityError()
      }
      this.buckets = new Map(nextBuckets).set(budgetKey, {
        count: 1,
        resetAt: currentTime + policy.windowMs
      })
      return { allowed: true, retryAfterSeconds: 0 }
    }
    if (existing.count >= policy.max) {
      this.buckets = nextBuckets
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.resetAt - currentTime) / 1000)
        )
      }
    }
    this.buckets = new Map(nextBuckets).set(budgetKey, {
      count: existing.count + 1,
      resetAt: existing.resetAt
    })
    return { allowed: true, retryAfterSeconds: 0 }
  }

  snapshot(): RateLimitSnapshot {
    return {
      bucketCount: this.buckets.size,
      maxBuckets: this.maxBuckets
    }
  }
}

function validateMaxBuckets(value: number | undefined): number {
  const maxBuckets = value ?? DEFAULT_MAX_BUCKETS
  if (
    !Number.isSafeInteger(maxBuckets) ||
    maxBuckets < 1 ||
    maxBuckets > MAX_ALLOWED_BUCKETS
  ) {
    throw new RangeError(
      `Rate limit maxBuckets must be an integer between 1 and ${MAX_ALLOWED_BUCKETS}`
    )
  }
  return maxBuckets
}

function normalizeRateLimitKey(key: string): string {
  if (typeof key !== 'string') {
    throw new RangeError('Rate limit key must be a non-empty string')
  }
  const normalizedKey = key.trim()
  if (
    normalizedKey.length === 0 ||
    normalizedKey.length > MAX_RATE_LIMIT_KEY_LENGTH
  ) {
    throw new RangeError(
      `Rate limit key must contain between 1 and ${MAX_RATE_LIMIT_KEY_LENGTH} characters`
    )
  }
  return normalizedKey
}

function validateRateLimitPolicy(policy: RateLimitPolicy): void {
  if (
    !policy ||
    !Number.isSafeInteger(policy.max) ||
    policy.max < 1 ||
    policy.max > MAX_RATE_LIMIT_REQUESTS ||
    !Number.isSafeInteger(policy.windowMs) ||
    policy.windowMs < 1 ||
    policy.windowMs > MAX_RATE_LIMIT_WINDOW_MS
  ) {
    throw new RangeError(
      `Rate limit policy max must be between 1 and ${MAX_RATE_LIMIT_REQUESTS} and windowMs must be between 1 and ${MAX_RATE_LIMIT_WINDOW_MS}`
    )
  }
}

function withoutExpiredBuckets(
  buckets: Map<string, RateLimitBucket>,
  currentTime: number
): Map<string, RateLimitBucket> {
  const activeBuckets = new Map<string, RateLimitBucket>()
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt > currentTime) {
      activeBuckets.set(key, bucket)
    }
  }
  return activeBuckets
}

/**
 * AUD19-006 / REM21-007 — distributed fixed-window rate limiter on
 * PostgreSQL. The database clock owns window boundaries and a short constant
 * advisory lock serializes only the active-capacity decision. Store errors
 * propagate to the caller; request middleware denies on error.
 */
export interface PostgresRateLimiterOptions {
  maxBuckets?: number
  /** Sample 1-in-N checks for expired-row cleanup. */
  cleanupSampleRate?: number
  keyRing: RateLimitKeyRing
}

interface RateLimitRow {
  count: number
  reset_at: Date
}

interface RateLimitQueryable {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>
}

export class PostgresRateLimiter implements RateLimiterPort {
  private readonly maxBuckets: number
  private readonly cleanupSampleRate: number
  private readonly keyRing: RateLimitKeyRing
  private cleanupCounter = 0

  constructor(
    private readonly db: RateLimitQueryable,
    options: PostgresRateLimiterOptions
  ) {
    this.maxBuckets = validateMaxBuckets(options.maxBuckets)
    const sampleRate = options.cleanupSampleRate ?? 100
    if (!Number.isSafeInteger(sampleRate) || sampleRate < 1) {
      throw new RangeError(
        'Rate limit cleanupSampleRate must be a positive integer'
      )
    }
    this.cleanupSampleRate = sampleRate
    this.keyRing = createRateLimitKeyRing(options.keyRing)
  }

  async check(key: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
    const normalizedKey = normalizeRateLimitKey(key)
    validateRateLimitPolicy(policy)
    const material = deriveRateLimitKeyMaterial(normalizedKey, this.keyRing)
    await this.maybeCleanup()
    const upserted = await this.db.query<RateLimitRow>(
      `WITH capacity_lock AS MATERIALIZED (
         SELECT pg_advisory_xact_lock(hashtext('cvg-rate-limit:capacity:v1')) AS locked
       ), upserted AS (
         INSERT INTO rate_limit_buckets
           (budget_key, key_version, key_digest, count, reset_at)
         SELECT $1, $2, $3, 1,
           now() + ($5 || ' milliseconds')::interval
         FROM capacity_lock
         WHERE EXISTS (
           SELECT 1 FROM rate_limit_buckets
           WHERE budget_key = $1
         )
         OR (
           SELECT COUNT(*) FROM rate_limit_buckets
           WHERE reset_at > now()
         ) < $4
         ON CONFLICT (budget_key) DO UPDATE SET
           key_version = EXCLUDED.key_version,
           key_digest = EXCLUDED.key_digest,
           count = CASE
             WHEN rate_limit_buckets.reset_at <= now() THEN 1
             ELSE rate_limit_buckets.count + 1
           END,
           reset_at = CASE
             WHEN rate_limit_buckets.reset_at <= now()
             THEN now() + ($5 || ' milliseconds')::interval
             ELSE rate_limit_buckets.reset_at
           END
         RETURNING count, reset_at
       )
       SELECT count, reset_at FROM upserted`,
      [
        material.budgetKey,
        material.keyVersion,
        material.keyDigest,
        this.maxBuckets,
        String(policy.windowMs)
      ]
    )
    const row = upserted.rows[0]
    if (!row) {
      throw new RateLimitCapacityError()
    }
    if (row.count > policy.max) {
      const retryAfterMs = new Date(row.reset_at).getTime() - Date.now()
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000))
      }
    }
    return { allowed: true, retryAfterSeconds: 0 }
  }

  private async maybeCleanup(): Promise<void> {
    this.cleanupCounter += 1
    if (this.cleanupCounter % this.cleanupSampleRate !== 0) return
    await this.db.query(
      'DELETE FROM rate_limit_buckets WHERE reset_at <= now()'
    )
  }
}
