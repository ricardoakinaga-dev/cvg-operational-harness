import { randomBytes } from 'node:crypto'
import { OperatorIdentitySchema, type OperatorIdentity } from '@cvg/shared'

export const OPERATOR_SESSION_COOKIE = 'cvg_operator_session'
/** SPEC0259 §4.3: the operational cookie of the HTTPS OIDC profile. */
export const HOST_OPERATOR_SESSION_COOKIE = '__Host-cvg_operator_session'
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/

/**
 * SPEC0259 §4.3 — cookie profile. `host-prefixed` (OIDC login composed and
 * HTTPS enforced) uses `__Host-` names, always `Secure`, host-only; `legacy`
 * keeps today's names and the `Secure` decision of the caller.
 */
export type OperatorCookieProfile = 'host-prefixed' | 'legacy'

export type OperatorCookiePolicy =
  | { readonly profile: 'host-prefixed' }
  | { readonly profile: 'legacy'; readonly secure: boolean }

export function operatorSessionCookieName(
  profile: OperatorCookieProfile
): string {
  return profile === 'host-prefixed'
    ? HOST_OPERATOR_SESSION_COOKIE
    : OPERATOR_SESSION_COOKIE
}

function isSecure(policy: OperatorCookiePolicy): boolean {
  return policy.profile === 'host-prefixed' || policy.secure
}

/**
 * SPEC0259 §4.3 (M1) — the exact cookie-name rule shared by every parser that
 * authenticates: segments by `;`, the name is the text before the first `=`
 * (a segment without `=` is ignored), only SP and HTAB are trimmed from the
 * name and the value, and the name is compared by code units. The header is
 * decoded as latin1 by Node, so this is a byte comparison: `\xA0__Host-…`,
 * `__HOST-…` or any Unicode space never becomes the expected name.
 */
export function readExactCookieValues(header: string, name: string): string[] {
  const values: string[] = []
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=')
    if (separator === -1) continue
    if (trimSpaceAndTab(segment.slice(0, separator)) !== name) continue
    values.push(trimSpaceAndTab(segment.slice(separator + 1)))
  }
  return values
}

function trimSpaceAndTab(value: string): string {
  let start = 0
  let end = value.length
  while (start < end && (value[start] === ' ' || value[start] === '\t')) {
    start += 1
  }
  while (end > start && (value[end - 1] === ' ' || value[end - 1] === '\t')) {
    end -= 1
  }
  return value.slice(start, end)
}

export function createOpaqueOperatorSessionId(): string {
  return `opsess_${randomBytes(32).toString('base64url')}`
}

export interface OperatorSessionRecord {
  sessionId: string
  identity: OperatorIdentity
  expiresAt: number
}

export interface OperatorSessionStore {
  create(input: {
    identity: OperatorIdentity
    expiresAt: number
  }): Promise<OperatorSessionRecord>
  get(sessionId: string): Promise<OperatorSessionRecord | null>
  revoke(sessionId: string): Promise<void>
  replace?(
    previousSessionId: string,
    input: { identity: OperatorIdentity; expiresAt: number }
  ): Promise<OperatorSessionRecord>
  /**
   * Atomically retires the whole family of `previousSessionId` (any digest
   * of its lineage, live or already rotated) and creates a session in a new
   * family. If either step fails nothing changes (SPEC 0144, AUD-0603).
   */
  switchIdentity?(
    previousSessionId: string,
    input: { identity: OperatorIdentity; expiresAt: number }
  ): Promise<OperatorSessionRecord>
}

export interface InMemoryOperatorSessionStoreOptions {
  now?: () => number
  maxSessions?: number
}

export function createInMemoryOperatorSessionStore(
  options: InMemoryOperatorSessionStoreOptions = {}
): OperatorSessionStore {
  const now = options.now ?? Date.now
  const maxSessions = options.maxSessions ?? 1_024
  if (!Number.isSafeInteger(maxSessions) || maxSessions <= 0) {
    throw new Error('maxSessions must be a positive safe integer')
  }

  const records = new Map<string, OperatorSessionRecord>()
  const prune = (): void => {
    const currentTime = now()
    for (const [sessionId, record] of records) {
      if (record.expiresAt <= currentTime) records.delete(sessionId)
    }
  }

  return {
    async create(input) {
      const identity = OperatorIdentitySchema.parse(input.identity)
      if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now()) {
        throw new Error('Operator session expiry must be in the future')
      }
      prune()
      if (records.size >= maxSessions) {
        throw new Error('Operator session store is full')
      }
      const record: OperatorSessionRecord = {
        sessionId: createOpaqueOperatorSessionId(),
        identity,
        expiresAt: input.expiresAt
      }
      records.set(record.sessionId, record)
      return cloneRecord(record)
    },
    async get(sessionId) {
      if (!SESSION_ID_PATTERN.test(sessionId)) return null
      prune()
      const record = records.get(sessionId)
      return record ? cloneRecord(record) : null
    },
    async revoke(sessionId) {
      if (!SESSION_ID_PATTERN.test(sessionId)) return
      records.delete(sessionId)
    }
  }
}

export function parseOperatorSessionCookie(
  value: unknown,
  policy: OperatorCookiePolicy
): string | null {
  if (Array.isArray(value) || typeof value !== 'string') return null
  const candidates = readExactCookieValues(
    value,
    operatorSessionCookieName(policy.profile)
  )
  // Two cookies with the exact name fail closed (SPEC0254, O15).
  if (candidates.length !== 1) return null
  const candidate = candidates[0]!
  if (!candidate) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(candidate)
  } catch {
    return null
  }
  return SESSION_ID_PATTERN.test(decoded) ? decoded : null
}

/** True when the header carries a cookie with the exact name of the profile. */
export function hasExactOperatorSessionCookie(
  value: unknown,
  policy: OperatorCookiePolicy
): boolean {
  return (
    typeof value === 'string' &&
    readExactCookieValues(value, operatorSessionCookieName(policy.profile))
      .length > 0
  )
}

export function serializeOperatorSessionCookie(
  session: OperatorSessionRecord,
  policy: OperatorCookiePolicy
): string {
  const maxAge = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
  return [
    `${operatorSessionCookieName(policy.profile)}=${encodeURIComponent(session.sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(session.expiresAt).toUTCString()}`,
    ...(isSecure(policy) ? ['Secure'] : [])
  ].join('; ')
}

export function clearOperatorSessionCookie(
  policy: OperatorCookiePolicy
): string {
  return [
    `${operatorSessionCookieName(policy.profile)}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(isSecure(policy) ? ['Secure'] : [])
  ].join('; ')
}

function cloneRecord(record: OperatorSessionRecord): OperatorSessionRecord {
  return {
    sessionId: record.sessionId,
    identity: { ...record.identity },
    expiresAt: record.expiresAt
  }
}
