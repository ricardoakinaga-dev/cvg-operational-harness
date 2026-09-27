import { randomBytes } from 'node:crypto'
import { OperatorIdentitySchema, type OperatorIdentity } from '@cvg/shared'

export const OPERATOR_SESSION_COOKIE = 'cvg_operator_session'
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/

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

export function parseOperatorSessionCookie(value: unknown): string | null {
  if (Array.isArray(value) || typeof value !== 'string') return null
  let parsed: string | null = null
  for (const segment of value.split(';')) {
    const [rawName, ...rawValue] = segment.split('=')
    if (rawName?.trim() !== OPERATOR_SESSION_COOKIE) continue
    if (parsed !== null) return null
    const candidate = rawValue.join('=').trim()
    if (!candidate) return null
    let decoded: string
    try {
      decoded = decodeURIComponent(candidate)
    } catch {
      return null
    }
    if (!SESSION_ID_PATTERN.test(decoded)) return null
    parsed = decoded
  }
  return parsed
}

export function serializeOperatorSessionCookie(
  session: OperatorSessionRecord,
  secure: boolean
): string {
  const maxAge = Math.max(0, Math.ceil((session.expiresAt - Date.now()) / 1000))
  return [
    `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(session.sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    `Expires=${new Date(session.expiresAt).toUTCString()}`,
    ...(secure ? ['Secure'] : [])
  ].join('; ')
}

export function clearOperatorSessionCookie(secure: boolean): string {
  return [
    `${OPERATOR_SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    ...(secure ? ['Secure'] : [])
  ].join('; ')
}

function cloneRecord(record: OperatorSessionRecord): OperatorSessionRecord {
  return {
    sessionId: record.sessionId,
    identity: { ...record.identity },
    expiresAt: record.expiresAt
  }
}
