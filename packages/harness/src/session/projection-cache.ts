import { createHash } from 'node:crypto'
import {
  SESSION_PROJECTION_VERSION,
  canonicalizeJson,
  type SessionProjection
} from '@cvg/harness-contracts'

/**
 * SPEC 0292 §4, the pure half of the checkpoint cache: how a checkpoint row is built and how it
 * is judged. A checkpoint is served only when its version, state digest, stream header digest and
 * position all hold (I4); the event at the point is checked against the log by the storage layer.
 * Pure: no IO, no clock. The state is never repaired: an invalid checkpoint is ignored.
 */
export const SESSION_PROJECTION_ID = 'session-state'

/** A checkpoint as stored: the columns of `session_projection_checkpoints` that the judgement reads. */
export interface SessionCheckpointRow {
  readonly projectionVersion: number
  readonly throughSequence: number
  readonly tailInputDigest: string
  readonly headerDigest: string
  readonly state: unknown
  readonly stateDigest: string
}

const sha256 = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex')

/** Identity of a stream: the digest of its header text, as the writer stored it. */
export function sessionHeaderDigest(headerText: string): string {
  return sha256(headerText)
}

/** Digest of a state, over its canonical JSON, so key order never matters. */
export function sessionProjectionStateDigest(
  projection: SessionProjection
): string {
  return sha256(canonicalizeJson(projection))
}

/** The row to store for `projection`, whose last event has `pointInputDigest`. */
export function sessionCheckpointRow(
  projection: SessionProjection,
  headerText: string,
  pointInputDigest: string
): SessionCheckpointRow {
  return {
    projectionVersion: SESSION_PROJECTION_VERSION,
    throughSequence: projection.throughSequence,
    tailInputDigest: pointInputDigest,
    headerDigest: sessionHeaderDigest(headerText),
    state: projection,
    stateDigest: sessionProjectionStateDigest(projection)
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const isText = (v: unknown): v is string => typeof v === 'string'
const isList = <T>(v: unknown, each: (item: unknown) => item is T): v is T[] =>
  Array.isArray(v) && v.every(each)

const FINAL_STOPS = ['approval_required', 'needs_user_input', 'human_takeover']
const TURN_STATES = ['completed', 'ended', 'open']

const isSource = (v: unknown): boolean =>
  isRecord(v) && isCount(v.sequence) && isText(v.eventId)
const isStop = (v: unknown): boolean =>
  isRecord(v) &&
  FINAL_STOPS.includes(v.kind as string) &&
  isText(v.correlationId) &&
  (v.operationKey === undefined || isText(v.operationKey)) &&
  isSource(v.source)
const isTurnReport = (v: unknown): boolean =>
  isRecord(v) &&
  isText(v.correlationId) &&
  isCount(v.firstSequence) &&
  isCount(v.lastSequence) &&
  TURN_STATES.includes(v.state as string) &&
  (v.stopReason === undefined || isText(v.stopReason)) &&
  isList(v.uncertainEffects, isText)
const isCallRef = (v: unknown): boolean =>
  isRecord(v) &&
  isText(v.operationKey) &&
  isCount(v.sequence) &&
  isText(v.eventId)
const isOpenCalls = (v: unknown): boolean =>
  isList(
    v,
    (pair): pair is [string, unknown[]] =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      isText(pair[0]) &&
      isList(pair[1], isCallRef as (item: unknown) => item is unknown)
  )
const isOpenGroup = (v: unknown): boolean =>
  isRecord(v) &&
  isText(v.correlationId) &&
  isCount(v.firstSequence) &&
  isCount(v.lastSequence) &&
  isSource(v.start) &&
  isText(v.startType) &&
  isOpenCalls(v.openCalls) &&
  isList(v.uncertain, isCallRef as (item: unknown) => item is unknown) &&
  typeof v.hasUser === 'boolean' &&
  typeof v.hasAssistant === 'boolean' &&
  typeof v.onlyMarkers === 'boolean' &&
  isCount(v.endCount) &&
  (v.end === undefined ||
    (isRecord(v.end) && isText(v.end.stopReason) && isCount(v.end.sequence)))

/**
 * Structural guard on a state read back from storage: every field the reducer reads, with the
 * type it reads it as. The digest says the state is what was written; it does not say that what
 * was written can be folded. A state that fails here is a rebuild, never a repair (SPEC 0292 I1).
 */
function isProjectionShape(state: unknown): state is SessionProjection {
  if (!isRecord(state)) return false
  const { turns, stops, closed, compaction } = state
  const totals = isRecord(stops) ? stops.total : undefined
  return (
    state.version === SESSION_PROJECTION_VERSION &&
    isCount(state.throughSequence) &&
    isCount(state.inheritableThrough) &&
    isRecord(turns) &&
    isCount(turns.total) &&
    isCount(turns.completed) &&
    isCount(turns.ended) &&
    isCount(turns.open) &&
    (state.lastTurn === undefined || isTurnReport(state.lastTurn)) &&
    isRecord(stops) &&
    isRecord(totals) &&
    FINAL_STOPS.every((kind) => isCount(totals[kind])) &&
    isList(stops.recent, isStop as (item: unknown) => item is unknown) &&
    (compaction === undefined ||
      (isRecord(compaction) &&
        isCount(compaction.throughSequence) &&
        isSource(compaction.source) &&
        isCount(compaction.count))) &&
    (state.open === undefined || isOpenGroup(state.open)) &&
    isRecord(closed) &&
    isCount(closed.completed) &&
    isCount(closed.ended) &&
    isCount(closed.open) &&
    isCount(closed.inheritable) &&
    typeof closed.broken === 'boolean' &&
    (closed.last === undefined || isTurnReport(closed.last))
  )
}

export type SessionCheckpointVerdict =
  | { readonly ok: true; readonly projection: SessionProjection }
  | { readonly ok: false; readonly reason: string }

/**
 * Judges a checkpoint against the stream it is about to serve: the version of the code, the
 * digest of the state, the digest of the stream header and a position inside the log. Anything
 * else is a rebuild, never a repair.
 */
export function judgeSessionCheckpoint(
  row: SessionCheckpointRow,
  stream: { readonly headerText: string; readonly head: number }
): SessionCheckpointVerdict {
  const refuse = (reason: string): SessionCheckpointVerdict => ({
    ok: false,
    reason
  })
  if (row.projectionVersion !== SESSION_PROJECTION_VERSION)
    return refuse('projection version differs')
  if (!isProjectionShape(row.state)) return refuse('state is malformed')
  if (row.state.throughSequence !== row.throughSequence)
    return refuse('state position differs from the checkpoint position')
  if (sessionProjectionStateDigest(row.state) !== row.stateDigest)
    return refuse('state digest differs')
  if (row.headerDigest !== sessionHeaderDigest(stream.headerText))
    return refuse('stream header differs')
  if (row.throughSequence < 1 || row.throughSequence > stream.head)
    return refuse('position is outside the log')
  return { ok: true, projection: row.state }
}
