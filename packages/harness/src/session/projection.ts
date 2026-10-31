import {
  SESSION_PROJECTION_VERSION,
  type FinalStopKind,
  type SessionEvent,
  type SessionProjection,
  type Stop,
  type StopLog,
  type TurnReport
} from '@cvg/harness-contracts'
import { SessionPersistenceCorruptionError } from './persistence.ts'
import {
  EMPTY_TURN_ANALYSIS,
  foldTurnAnalysis,
  reportOfGroup,
  uncertainCalls
} from './turn-analysis.ts'

/**
 * SPEC 0292: the pure projection of a session log. A function of the events and nothing else;
 * it can be dropped and rebuilt at any time (I1), keeps ids, counters and references but never
 * message or tool text (I6), and `fold(project(1..k), k+1..n) = project(1..n)` for every
 * analyzable log (I2). No IO, no clock, no randomness.
 */
export { SESSION_PROJECTION_VERSION }

/** Recent final stops kept per kind (SPEC 0292 §3); the totals stay exact. */
export const SESSION_PROJECTION_RECENT_STOPS = 32
/** A state that serializes beyond this is not checkpointed (SPEC 0292 §3). */
export const SESSION_PROJECTION_MAX_STATE_BYTES = 64 * 1024

const FINAL_STOPS: Readonly<Record<string, FinalStopKind>> = {
  APPROVAL_REQUIRED: 'approval_required',
  NEEDS_USER_INPUT: 'needs_user_input',
  HUMAN_TAKEOVER: 'human_takeover'
}

type FinalStop = Stop & { readonly kind: FinalStopKind }

interface Core {
  throughSequence: number
  turn: ReturnType<typeof foldTurnAnalysis>
  total: Record<FinalStopKind, number>
  recent: FinalStop[]
  compaction?: SessionProjection['compaction']
}

/** The part of the projection that is not derived: everything else is a function of it. */
function coreOf(projection: SessionProjection): Core {
  return {
    throughSequence: projection.throughSequence,
    turn: {
      through: projection.throughSequence,
      closed: projection.closed,
      ...(projection.open ? { open: projection.open } : {})
    },
    total: { ...projection.stops.total },
    recent: projection.stops.recent.map((s) => ({
      ...s,
      source: { ...s.source }
    })),
    ...(projection.compaction
      ? {
          compaction: {
            ...projection.compaction,
            source: { ...projection.compaction.source }
          }
        }
      : {})
  }
}

function derive(core: Core): SessionProjection {
  const { open, closed } = core.turn
  const provisional: TurnReport | undefined = open
    ? reportOfGroup(open)
    : undefined
  // a compaction marker is not a turn (SPEC 0292 §3), but it does count for the cut
  const turn = open && !open.onlyMarkers ? provisional : undefined
  const count = (state: TurnReport['state']) =>
    closed[state] + (turn?.state === state ? 1 : 0)
  const completed = count('completed')
  const ended = count('ended')
  const openTurns = count('open')
  const lastTurn = turn ?? closed.last
  const inheritableThrough =
    !closed.broken &&
    provisional?.state === 'completed' &&
    provisional.uncertainEffects.length === 0
      ? provisional.lastSequence
      : closed.inheritable
  const stops: StopLog = { total: core.total, recent: core.recent }
  return {
    version: SESSION_PROJECTION_VERSION,
    throughSequence: core.throughSequence,
    turns: {
      total: completed + ended + openTurns,
      completed,
      ended,
      open: openTurns
    },
    ...(lastTurn ? { lastTurn } : {}),
    stops,
    inheritableThrough,
    ...(core.compaction ? { compaction: core.compaction } : {}),
    ...(open ? { open } : {}),
    closed
  }
}

export function emptySessionProjection(): SessionProjection {
  return derive({
    throughSequence: 0,
    turn: EMPTY_TURN_ANALYSIS,
    total: { approval_required: 0, needs_user_input: 0, human_takeover: 0 },
    recent: []
  })
}

function pushFinalStop(core: Core, stop: FinalStop): void {
  core.total[stop.kind] += 1
  core.recent.push(stop)
  const ofKind = core.recent.filter((s) => s.kind === stop.kind)
  if (ofKind.length > SESSION_PROJECTION_RECENT_STOPS)
    core.recent.splice(core.recent.indexOf(ofKind[0]!), 1)
}

function fold(
  projection: SessionProjection,
  tail: readonly SessionEvent[],
  closedIds?: Set<string>
): SessionProjection {
  if (projection.version !== SESSION_PROJECTION_VERSION)
    throw new SessionPersistenceCorruptionError(
      'Session projection version differs'
    )
  const core = coreOf(projection)
  // grouping and contiguity first: a tail that does not continue the state is refused whole
  core.turn = foldTurnAnalysis(core.turn, tail, closedIds ? { closedIds } : {})
  // a second turn/end of one turn makes the group unreportable and the fold refuses it below
  for (const e of tail) {
    if (e.type === 'turn/end') {
      const kind =
        FINAL_STOPS[(e.payload as Record<string, unknown>).stopReason as string]
      if (kind !== undefined)
        pushFinalStop(core, {
          kind,
          correlationId: e.correlationId,
          source: { sequence: e.sequence, eventId: e.eventId }
        })
    } else if (e.type === 'context/compacted') {
      core.compaction = {
        throughSequence: (e.payload as Record<string, unknown>)
          .throughSequence as number,
        source: { sequence: e.sequence, eventId: e.eventId },
        count: (core.compaction?.count ?? 0) + 1
      }
    }
  }
  core.throughSequence = core.turn.through
  return derive(core)
}

/** The state of a whole log; the full analysis also refuses interleaved turns (I2). */
export function projectSession(
  events: readonly SessionEvent[]
): SessionProjection {
  return fold(emptySessionProjection(), events, new Set())
}

/**
 * Continues `projection` with `tail`; refuses a tail that is not contiguous with it. It does
 * not remember closed turns, so it may accept a log the full analysis refuses (I2): that
 * is for `verifyProjectionCache` to report.
 */
export function foldSessionProjection(
  projection: SessionProjection,
  tail: readonly SessionEvent[]
): SessionProjection {
  return fold(projection, tail)
}

/**
 * What the log shows as stopped: the final stops recorded, plus what the group still open
 * shows now (an open turn, effects without a certain result). Transitional stops are derived
 * here and never stored (SPEC 0292 §3). The log does not say whether an approval was decided
 * later: this is "the turn stopped here", not "still pending".
 */
export function currentStops(projection: SessionProjection): Stop[] {
  const stops: Stop[] = [...projection.stops.recent]
  const { open } = projection
  if (open === undefined) return stops
  if (reportOfGroup(open).state === 'open')
    stops.push({
      kind: 'open_turn',
      correlationId: open.correlationId,
      source: { ...open.start }
    })
  for (const call of uncertainCalls(open))
    stops.push({
      kind: 'uncertain_effect',
      correlationId: open.correlationId,
      operationKey: call.operationKey,
      source: { sequence: call.sequence, eventId: call.eventId }
    })
  return stops
}

/** Serialized size of the state, the measure behind the checkpoint ceiling. */
export function sessionProjectionStateBytes(
  projection: SessionProjection
): number {
  return Buffer.byteLength(JSON.stringify(projection), 'utf8')
}
