import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/harness-contracts'
import {
  SESSION_EVENT_CATALOG_V1 as catalog,
  type SessionEvent,
  type SessionEventAppend,
  type SessionEventRead,
  type SessionEventType,
  type SessionStream
} from '@cvg/harness-contracts'

export class SessionEventError extends Error {
  constructor(
    readonly code:
      | 'invalid_session_event'
      | 'session_event_conflict'
      | 'session_not_open'
      | 'session_storage_unavailable',
    message: string
  ) {
    super(message)
    this.name = 'SessionEventError'
  }
}
function invalid(): never {
  throw new SessionEventError(
    'invalid_session_event',
    'Invalid session event, schema, version or fingerprint'
  )
}
export const SESSION_EVENT_MAX_BYTES = 1024 * 1024
interface Schema {
  readonly $ref?: string
  readonly type?: string
  readonly enum?: readonly unknown[]
  readonly minimum?: number
  readonly maximum?: number
  readonly minLength?: number
  readonly maxLength?: number
  readonly pattern?: string
  readonly 'x-maxUtf8Bytes'?: number
  readonly items?: Schema
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
  readonly properties?: Readonly<Record<string, Schema>>
}
/** Strict JSON, not JS values silently dropped/coerced by JSON.stringify. */
function json(value: unknown): void {
  let nodes = 0
  const seen = new Set<object>()
  const visit = (v: unknown, depth: number): void => {
    if (++nodes > 20_000 || depth > 64) invalid()
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) invalid()
      return
    }
    if (typeof v !== 'object' || v === null || seen.has(v)) invalid()
    seen.add(v)
    if (Object.getOwnPropertySymbols(v).length) invalid()
    if (Array.isArray(v)) {
      const descriptors = Object.getOwnPropertyDescriptors(v)
      if (
        Object.keys(descriptors).some(
          (key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)
        )
      )
        invalid()
      for (let i = 0; i < v.length; i++) {
        const descriptor = descriptors[String(i)]
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)
          invalid()
        visit(descriptor.value, depth + 1)
      }
    } else {
      if (
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      )
        invalid()
      for (const descriptor of Object.values(
        Object.getOwnPropertyDescriptors(v)
      )) {
        if (!('value' in descriptor) || !descriptor.enumerable) invalid()
        visit(descriptor.value, depth + 1)
      }
    }
    seen.delete(v)
  }
  visit(value, 0)
}
function check(schema: Schema, value: unknown): void {
  if (schema.$ref) {
    const key = schema.$ref.replace(/^#\/definitions\//, '')
    const target = (catalog.definitions as Record<string, Schema>)[key]
    // Unreachable: every catalog $ref points to a declared definition.
    /* v8 ignore next */
    if (!target) invalid()
    check(target, value)
    return
  }
  if (schema.enum && !schema.enum.includes(value)) invalid()
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') invalid()
      if (
        schema.minLength !== undefined &&
        (!value.trim() || value.length < schema.minLength)
      )
        invalid()
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        invalid()
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) invalid()
      if (
        schema['x-maxUtf8Bytes'] !== undefined &&
        Buffer.byteLength(value, 'utf8') > schema['x-maxUtf8Bytes']
      )
        invalid()
      break
    }
    case 'integer':
    case 'number':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        (schema.type === 'integer' && !Number.isSafeInteger(value))
      )
        invalid()
      if (schema.minimum !== undefined && value < schema.minimum) invalid()
      // Unreachable: every catalog maximum is the safe-integer ceiling.
      /* v8 ignore next */
      if (schema.maximum !== undefined && value > schema.maximum) invalid()
      break
    case 'array':
      if (!Array.isArray(value)) invalid()
      // Unreachable: every catalog array schema declares `items`.
      /* v8 ignore next */
      if (schema.items) for (const item of value) check(schema.items, item)
      break
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
      const record = value as Record<string, unknown>
      for (const key of schema.required ?? [])
        if (!Object.hasOwn(record, key)) invalid()
      for (const [key, item] of Object.entries(record)) {
        const child =
          schema.properties && Object.hasOwn(schema.properties, key)
            ? schema.properties[key]
            : undefined
        if (child) check(child, item)
        else if (schema.additionalProperties === false) invalid()
      }
      break
    }
  }
}
function exact(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
): void {
  if (
    required.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some(
      (key) => !required.includes(key) && !optional.includes(key)
    )
  )
    invalid()
}
function record(value: unknown): Record<string, unknown> {
  json(value)
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
const fields = [
  'tenantId',
  'sessionId',
  'formatVersion',
  'eventId',
  'timestamp',
  'correlationId',
  'traceId',
  'type',
  'payload'
] as const
export function sessionEventFingerprint(type: SessionEventType): string {
  if (!Object.hasOwn(catalog.events, type)) invalid()
  return createHash('sha256')
    .update(
      canonicalizeJson({
        formatVersion: 1,
        type,
        payload: catalog.events[type],
        definitions: catalog.definitions
      })
    )
    .digest('hex')
}
export function validateSessionStream(value: unknown): SessionStream {
  const r = record(value)
  exact(r, ['tenantId', 'sessionId', 'formatVersion'])
  check(catalog.definitions.id, r.tenantId)
  check(catalog.definitions.id, r.sessionId)
  if (r.formatVersion !== 1) invalid()
  return {
    tenantId: r.tenantId as string,
    sessionId: r.sessionId as string,
    formatVersion: 1
  }
}
function validateAppendRecord(r: Record<string, unknown>): void {
  validateSessionStream({
    tenantId: r.tenantId,
    sessionId: r.sessionId,
    formatVersion: r.formatVersion
  })
  for (const key of ['eventId', 'correlationId', 'traceId'])
    check(catalog.definitions.id, r[key])
  if (
    typeof r.timestamp !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.timestamp) ||
    !Number.isFinite(Date.parse(r.timestamp)) ||
    new Date(r.timestamp).toISOString() !== r.timestamp
  )
    invalid()
  if (typeof r.type !== 'string' || !Object.hasOwn(catalog.events, r.type))
    invalid()
  check(catalog.events[r.type as SessionEventType], r.payload)
  const payload = r.payload as Record<string, unknown>
  if ('correlationId' in payload && payload.correlationId !== r.correlationId)
    invalid()
  if (
    r.type === 'model/request' &&
    (payload.request as Record<string, unknown>).correlationId !==
      r.correlationId
  )
    invalid()
}
export function validateSessionEventAppend(value: unknown): SessionEventAppend {
  const r = record(value)
  exact(r, fields)
  validateAppendRecord(r)
  // Reserve enough room for store-owned fields; materialization checks exact cap.
  if (Buffer.byteLength(canonicalizeJson(r)) > SESSION_EVENT_MAX_BYTES)
    invalid()
  return JSON.parse(canonicalizeJson(r)) as SessionEventAppend
}
export function validateSessionEvent(value: unknown): SessionEvent {
  const r = record(value)
  exact(r, [...fields, 'sequence', 'schemaFingerprint'])
  validateAppendRecord(r)
  if (
    !Number.isSafeInteger(r.sequence) ||
    (r.sequence as number) < 1 ||
    r.schemaFingerprint !== sessionEventFingerprint(r.type as SessionEventType)
  )
    invalid()
  if (
    r.type === 'context/compacted' &&
    ((r.payload as Record<string, unknown>).throughSequence as number) >=
      (r.sequence as number)
  )
    invalid()
  if (Buffer.byteLength(canonicalizeJson(r)) > SESSION_EVENT_MAX_BYTES)
    invalid()
  return JSON.parse(canonicalizeJson(r)) as SessionEvent
}
export function materializeSessionEvent(
  input: SessionEventAppend,
  sequence: number
): SessionEvent {
  return validateSessionEvent({
    ...input,
    sequence,
    schemaFingerprint: sessionEventFingerprint(input.type)
  })
}
export function sessionEventInputDigest(value: SessionEventAppend): string {
  return createHash('sha256')
    .update(canonicalizeJson(validateSessionEventAppend(value)))
    .digest('hex')
}
export function validateSessionEventRead(
  value: unknown
): Required<SessionEventRead> {
  const r = record(value)
  exact(r, ['tenantId', 'sessionId'], ['afterSequence', 'limit'])
  check(catalog.definitions.id, r.tenantId)
  check(catalog.definitions.id, r.sessionId)
  const afterSequence = r.afterSequence ?? 0
  const limit = r.limit ?? 100
  if (
    !Number.isSafeInteger(afterSequence) ||
    (afterSequence as number) < 0 ||
    !Number.isSafeInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > 500
  )
    invalid()
  return {
    tenantId: r.tenantId as string,
    sessionId: r.sessionId as string,
    afterSequence: afterSequence as number,
    limit: limit as number
  }
}
