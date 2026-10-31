import { createHash } from 'node:crypto'
import {
  SESSION_QUERY_CURSOR_MAX_CHARS,
  SESSION_QUERY_DEFAULT_LIMIT,
  SESSION_QUERY_MAX_LIMIT,
  canonicalizeJson,
  type SessionListFilter,
  type SessionQueryErrorCode,
  type SessionSummary
} from '@cvg/harness-contracts'

/**
 * SPEC 0295 §3-§4: the pure rules of the session listing: the canonical filter, the cursor and
 * what a filter matches. No IO, no clock. The cursor is a position hint bound to a filter and a
 * tenant, not a capability and not authenticated (SPEC 0295 Q4, D4).
 */
export class SessionQueryError extends Error {
  constructor(
    readonly code: SessionQueryErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'SessionQueryError'
  }
}

const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

const FILTER_KEYS = new Set([
  'parentSession',
  'origin',
  'agentPreset',
  'isSeeded',
  'createdAfter',
  'createdBefore'
])

const invalid = (message: string): never => {
  throw new SessionQueryError('invalid_params', message)
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 200 &&
  !value.includes('\u0000')

const isMillis = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** The filter with only the keys it sets, validated; `{}` and `undefined` are the same filter. */
export function canonicalSessionFilter(filter: unknown): SessionListFilter {
  if (filter === undefined) return {}
  if (typeof filter !== 'object' || filter === null || Array.isArray(filter))
    return invalid('filter must be an object')
  const input = filter as Record<string, unknown>
  for (const key of Object.keys(input))
    if (!FILTER_KEYS.has(key)) invalid(`unknown filter key ${key}`)
  const out: Record<string, unknown> = {}
  for (const key of ['parentSession', 'agentPreset'] as const) {
    if (input[key] === undefined) continue
    if (!isId(input[key]))
      invalid(`${key} must be 1..200 characters without NUL`)
    out[key] = input[key]
  }
  if (input.origin !== undefined) {
    if (input.origin !== 'subagent') invalid("origin must be 'subagent'")
    out.origin = 'subagent'
  }
  if (input.isSeeded !== undefined) {
    if (typeof input.isSeeded !== 'boolean') invalid('isSeeded must be boolean')
    out.isSeeded = input.isSeeded
  }
  for (const key of ['createdAfter', 'createdBefore'] as const) {
    if (input[key] === undefined) continue
    if (!isMillis(input[key]))
      invalid(`${key} must be a non-negative safe integer`)
    out[key] = input[key]
  }
  if (
    out.createdAfter !== undefined &&
    out.createdBefore !== undefined &&
    (out.createdAfter as number) >= (out.createdBefore as number)
  )
    invalid('createdAfter must be below createdBefore')
  return out as SessionListFilter
}

export function sessionListLimit(limit: unknown): number {
  if (limit === undefined) return SESSION_QUERY_DEFAULT_LIMIT
  if (
    typeof limit !== 'number' ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > SESSION_QUERY_MAX_LIMIT
  )
    return invalid(
      `limit must be an integer from 1 to ${SESSION_QUERY_MAX_LIMIT}`
    )
  return limit
}

export function sessionFilterDigest(filter: SessionListFilter): string {
  return sha256(canonicalizeJson(filter))
}
export function sessionTenantDigest(tenantId: string): string {
  return sha256(`tenant:${tenantId}`)
}

export function matchesSessionFilter(
  summary: SessionSummary,
  filter: SessionListFilter
): boolean {
  return (
    (filter.parentSession === undefined ||
      summary.parentSession === filter.parentSession) &&
    (filter.origin === undefined || summary.origin === filter.origin) &&
    (filter.agentPreset === undefined ||
      summary.agentPreset === filter.agentPreset) &&
    (filter.isSeeded === undefined || summary.isSeeded === filter.isSeeded) &&
    (filter.createdAfter === undefined ||
      summary.createdAt >= filter.createdAfter) &&
    (filter.createdBefore === undefined ||
      summary.createdAt < filter.createdBefore)
  )
}

interface CursorBody {
  readonly v: 1
  readonly k: number
  readonly f: string
  readonly t: string
}

/** `base64url` of the canonical JSON `{f, k, t, v}`. */
export function encodeSessionCursor(
  key: number,
  filter: SessionListFilter,
  tenantId: string
): string {
  const body: CursorBody = {
    v: 1,
    k: key,
    f: sessionFilterDigest(filter),
    t: sessionTenantDigest(tenantId)
  }
  return Buffer.from(canonicalizeJson(body), 'utf8').toString('base64url')
}

const HEX64 = /^[a-f0-9]{64}$/
const bad = (message: string): never => {
  throw new SessionQueryError('invalid_cursor', message)
}

/**
 * The position of a cursor, or `invalid_cursor`: the position must be a positive safe integer
 * and the cursor must be exactly the canonical encoding of this request's filter and tenant
 * with that position (this one comparison also refuses padding, other alphabets, other keys,
 * another version and any filter or tenant that is not this request's).
 */
export function decodeSessionCursor(
  cursor: string,
  filter: SessionListFilter,
  tenantId: string
): number {
  if (typeof cursor !== 'string' || cursor.length < 1)
    return bad('cursor is empty')
  if (cursor.length > SESSION_QUERY_CURSOR_MAX_CHARS)
    return bad('cursor is too long')
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    return bad('cursor is not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return bad('cursor is not an object')
  const body = parsed as Record<string, unknown>
  if (
    typeof body.k !== 'number' ||
    !Number.isSafeInteger(body.k) ||
    body.k < 1 ||
    typeof body.f !== 'string' ||
    !HEX64.test(body.f) ||
    typeof body.t !== 'string' ||
    !HEX64.test(body.t)
  )
    return bad('cursor fields are malformed')
  if (encodeSessionCursor(body.k, filter, tenantId) !== cursor) {
    // not canonical, or bound to another filter or tenant
    return bad('cursor does not belong to this request')
  }
  return body.k
}
