import { Buffer } from 'node:buffer'
import type { SessionHeaderV1, SessionJson } from '@cvg/harness-contracts'

/** SPEC 0221 §8: distinct, safe errors. Messages never carry SQL, lock keys or credentials. */
export class SessionPersistenceError extends Error {
  constructor(
    message: string,
    readonly sessionId?: string,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options)
    this.name = new.target.name
  }
}
export class SessionPersistenceNotFoundError extends SessionPersistenceError {}
export class SessionAlreadyExistsError extends SessionPersistenceError {}
export class SessionAlreadyOwnedError extends SessionPersistenceError {}
export class SessionReadOnlyError extends SessionPersistenceError {}
export class SessionOwnershipLostError extends SessionPersistenceError {}
export class SessionHandleClosedError extends SessionPersistenceError {}
export class SessionPersistenceCorruptionError extends SessionPersistenceError {}
export class SessionFormatUnsupportedError extends SessionPersistenceError {}
export class SessionMigrationRequiredError extends SessionPersistenceError {}
export class SessionStorageUnavailableError extends SessionPersistenceError {}
/** The outcome is unknown: never collapsed into success or an automatic retry. */
export class SessionCommitUnknownError extends SessionPersistenceError {}
export class SessionHeaderValidationError extends SessionPersistenceError {}

export const SESSION_HEADER_MAX_BYTES = 64 * 1024
const MAX_DEPTH = 64
const MAX_NODES = 20_000
const SESSION_ID_MAX = 200

function bad(reason: string): never {
  throw new SessionHeaderValidationError(`Invalid session header: ${reason}`)
}
function uint(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  )
    bad(`${field} must be a non-negative safe integer`)
  return value
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0)
    bad(`${field} must be a non-empty string`)
  return value
}
/**
 * One traversal reads every property exactly once (an A/B getter cannot show one
 * value to validation and another to storage) and returns a detached lossless copy.
 */
function capture(root: unknown): SessionJson {
  let nodes = 0
  const seen = new Set<object>()
  const visit = (value: unknown, depth: number): SessionJson => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) bad('too large or too deep')
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'boolean'
    )
      return value
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0))
        bad('non-finite or negative-zero number')
      return value
    }
    if (typeof value !== 'object') bad('value is not JSON')
    if (seen.has(value)) bad('cycle or alias')
    seen.add(value)
    try {
      if (Object.getOwnPropertySymbols(value).length) bad('symbol key')
      const proto = Object.getPrototypeOf(value)
      if (Array.isArray(value)) {
        if (proto !== Array.prototype) bad('exotic array')
        if (Object.getOwnPropertyNames(value).length !== value.length + 1)
          bad('sparse array or extra array key')
        const out: SessionJson[] = []
        for (let i = 0; i < value.length; i++) {
          if (!Object.hasOwn(value, i)) bad('sparse array')
          out.push(visit(value[i], depth + 1))
        }
        return out
      }
      if (proto !== Object.prototype && proto !== null) bad('exotic prototype')
      const keys = Object.keys(value)
      if (Object.getOwnPropertyNames(value).length !== keys.length)
        bad('non-enumerable key')
      const out: Record<string, SessionJson> = Object.create(null) as Record<
        string,
        SessionJson
      >
      for (const key of keys)
        out[key] = visit((value as Record<string, unknown>)[key], depth + 1)
      return out
    } finally {
      seen.delete(value)
    }
  }
  return visit(root, 0)
}

export interface ValidatedSessionHeader {
  readonly header: SessionHeaderV1
  readonly inheritedEventCount: number
}
/**
 * Validates the recognised fields and keeps unknown metadata verbatim. `cut` is the
 * explicit inherited-history count: `isSeeded:true` requires it (0 included),
 * `isSeeded:false` only accepts absent or 0. It is never inferred.
 */
export function validateSessionHeader(
  raw: unknown,
  cut?: number
): ValidatedSessionHeader {
  const copy = capture(raw)
  if (copy === null || typeof copy !== 'object' || Array.isArray(copy))
    bad('header must be an object')
  const h = copy as { readonly [key: string]: SessionJson }
  if (h.version !== 1) bad('version must be 1')
  const id = text(h.id, 'id')
  if (id.length > SESSION_ID_MAX) bad('id is too long')
  uint(h.createdAt, 'createdAt')
  if (typeof h.isSeeded !== 'boolean') bad('isSeeded must be a boolean')
  if ('cwd' in h) {
    const cwd = text(h.cwd, 'cwd')
    if (!cwd.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(cwd))
      bad('cwd must be absolute')
  }
  if ('parentSession' in h) text(h.parentSession, 'parentSession')
  if ('agentPreset' in h) text(h.agentPreset, 'agentPreset')
  if ('origin' in h && h.origin !== 'subagent') bad('origin must be subagent')
  if ('delegationDepth' in h) uint(h.delegationDepth, 'delegationDepth')
  let inherited = 0
  if (cut !== undefined) inherited = uint(cut, 'inheritedEventCount')
  if (h.isSeeded) {
    if (cut === undefined) bad('a seeded session needs an explicit cut')
  } else if (inherited !== 0) bad('an unseeded session only accepts cut 0')
  if (
    Buffer.byteLength(JSON.stringify(copy), 'utf8') > SESSION_HEADER_MAX_BYTES
  )
    bad('header exceeds 64 KiB')
  return {
    header: copy as unknown as SessionHeaderV1,
    inheritedEventCount: inherited
  }
}
