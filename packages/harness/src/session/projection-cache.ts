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

/** Structural guard on a state read back from storage; the digest says it is what was written. */
function isProjectionShape(state: unknown): state is SessionProjection {
  if (!isRecord(state)) return false
  const { turns, stops, closed } = state
  return (
    state.version === SESSION_PROJECTION_VERSION &&
    isCount(state.throughSequence) &&
    isCount(state.inheritableThrough) &&
    isRecord(turns) &&
    isCount(turns.total) &&
    isRecord(stops) &&
    isRecord(stops.total) &&
    Array.isArray(stops.recent) &&
    isRecord(closed) &&
    isCount(closed.inheritable) &&
    (state.open === undefined || isRecord(state.open))
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
