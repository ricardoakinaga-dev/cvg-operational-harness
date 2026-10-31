import { createHash } from 'node:crypto'
import type { SessionEvent } from '@cvg/harness-contracts'

/**
 * SPEC 0296 sections 5.1-5.2: what a request may ask for and what a frame may carry. Pure: no
 * IO, no clock. The projection is a per-type, per-field allow list that denies by default.
 */
export const SESSION_STREAM_ROUTE = '/v1/sessions/:sessionId/events/stream'
/** A frame whose projection is larger leaves with `payloadOmitted` (SPEC 0296 A11). */
export const MAX_FRAME_BYTES = 64 * 1024
export const MAX_EVENTS_PARAM = 50_000

const CURSOR = /^\d{1,15}$/
const OPERATION_KEY = /^[A-Za-z0-9._:@-]{1,200}$/

export type StreamParams =
  | {
      readonly ok: true
      /** The resolved resume position (A7): the last sequence the client already has. */
      readonly after: number
      readonly maxEvents: number | undefined
    }
  | { readonly ok: false; readonly message: string }

export function validStreamSessionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !value.includes('\u0000')
  )
}

const single = (value: unknown): string | undefined | null =>
  value === undefined ? undefined : typeof value === 'string' ? value : null

/**
 * A7: with both present the header wins when it is not below `?after=`, below is invalid; with one
 * of them that one; with none the start of the log. Anything not a plain non-negative integer,
 * or repeated, is invalid.
 */
export function parseStreamParams(
  query: Record<string, unknown>,
  lastEventId: unknown
): StreamParams {
  const after = single(query.after)
  const max = single(query.maxEvents)
  const header = single(lastEventId)
  if (after === null || (after !== undefined && !CURSOR.test(after)))
    return { ok: false, message: 'after must be a non-negative integer' }
  if (header === null || (header !== undefined && !CURSOR.test(header)))
    return {
      ok: false,
      message: 'Last-Event-ID must be a non-negative integer'
    }
  let maxEvents: number | undefined
  if (max !== undefined) {
    if (max === null || !CURSOR.test(max))
      return { ok: false, message: 'maxEvents must be a positive integer' }
    maxEvents = Number(max)
    if (maxEvents < 1 || maxEvents > MAX_EVENTS_PARAM)
      return {
        ok: false,
        message: `maxEvents must be from 1 to ${MAX_EVENTS_PARAM}`
      }
  }
  const fromUrl = after === undefined ? undefined : Number(after)
  const fromHeader = header === undefined ? undefined : Number(header)
  if (fromUrl !== undefined && fromHeader !== undefined && fromHeader < fromUrl)
    return { ok: false, message: 'Last-Event-ID is below after' }
  return { ok: true, after: fromHeader ?? fromUrl ?? 0, maxEvents }
}

const PROJECTED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  'turn/start': ['correlationId'],
  'turn/end': ['correlationId', 'stopReason'],
  'tool/call': ['correlationId', 'toolId'],
  'tool/result': ['correlationId', 'toolId', 'outcome'],
  'model/request': ['correlationId'],
  'model/result': ['correlationId', 'provider', 'inputTokens', 'outputTokens'],
  'context/compacted': ['throughSequence', 'sourceDigest', 'strategyVersion']
}
/** Message text never leaves in v1: there is no content permission yet (D3, D8-b). */
const ENVELOPE_ONLY = new Set(['message/user', 'message/assistant'])

type Primitive = string | number | boolean

const isPrimitive = (value: unknown): value is Primitive =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'

export interface ProjectedEvent {
  readonly sequence: number
  readonly eventId: string
  readonly type: string
  readonly timestamp: string
  readonly correlationId: string
  readonly traceId: string
  readonly payload?: Readonly<Record<string, Primitive>>
  readonly payloadOmitted?: true
}

export function projectEvent(event: SessionEvent): ProjectedEvent {
  const envelope = {
    sequence: event.sequence,
    eventId: event.eventId,
    type: event.type as string,
    timestamp: event.timestamp,
    correlationId: event.correlationId,
    traceId: event.traceId
  }
  const fields = PROJECTED_FIELDS[event.type]
  if (fields === undefined || ENVELOPE_ONLY.has(event.type))
    return { ...envelope, payloadOmitted: true }
  const source =
    typeof event.payload === 'object' &&
    event.payload !== null &&
    !Array.isArray(event.payload)
      ? (event.payload as Record<string, unknown>)
      : {}
  const payload: Record<string, Primitive> = {}
  for (const field of fields) {
    const value = source[field]
    if (isPrimitive(value)) payload[field] = value
  }
  if (event.type === 'tool/call' && typeof source.operationKey === 'string') {
    if (OPERATION_KEY.test(source.operationKey))
      payload.operationKey = source.operationKey
    else
      payload.operationKeyDigest = createHash('sha256')
        .update(source.operationKey, 'utf8')
        .digest('hex')
        .slice(0, 16)
  }
  return { ...envelope, payload }
}

const frame = (lines: readonly string[]): string => `${lines.join('\n')}\n\n`

/** One `session.event` frame; a projection over `MAX_FRAME_BYTES` leaves without its payload. */
export function formatEventFrame(event: SessionEvent): string {
  let projected: ProjectedEvent = projectEvent(event)
  let data = JSON.stringify(projected)
  if (Buffer.byteLength(data, 'utf8') > MAX_FRAME_BYTES) {
    const { payload, ...envelope } = projected
    void payload
    projected = { ...envelope, payloadOmitted: true }
    data = JSON.stringify(projected)
  }
  return frame([
    `id: ${event.sequence}`,
    'event: session.event',
    `data: ${data}`
  ])
}

export const HEARTBEAT_FRAME = ': hb\n\n'
export const CONNECTED_FRAME = ': connected\n\n'

/**
 * `retry:` goes immediately before `end` and applies to the reconnections that follow: the base
 * of the reason plus a jitter of up to half of it (a wave of clients must not return together).
 * The `end` has no `id:`: it is not an event of the log.
 */
export function formatEndFrame(input: {
  readonly reason: string
  readonly lastSequence: number
  readonly permanent: boolean
  readonly retryBaseMs: number
  readonly random: () => number
}): string {
  const retry =
    input.retryBaseMs + Math.floor(input.random() * input.retryBaseMs * 0.5)
  return frame([
    `retry: ${retry}`,
    'event: end',
    `data: ${JSON.stringify({
      reason: input.reason,
      lastSequence: input.lastSequence,
      permanent: input.permanent
    })}`
  ])
}
