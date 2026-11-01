import type { TurnReport } from './session-persistence.ts'

/** SPEC 0292 §3: the projection of a session log, derived and disposable (I1). */
export const SESSION_PROJECTION_VERSION = 1

export type FinalStopKind =
  | 'approval_required'
  | 'needs_user_input'
  | 'human_takeover'

export interface StopSource {
  readonly sequence: number
  readonly eventId: string
}

export interface Stop {
  readonly kind: FinalStopKind | 'open_turn' | 'uncertain_effect'
  readonly correlationId: string
  readonly operationKey?: string
  readonly source: StopSource
}

/** Final stops only (SPEC 0292 §3): exact totals, a bounded tail of the most recent ones. */
export interface StopLog {
  readonly total: Readonly<Record<FinalStopKind, number>>
  readonly recent: readonly (Stop & { readonly kind: FinalStopKind })[]
}

/** An effect call seen in the open group: the key and the `tool/call` event it comes from. */
export interface CallRef {
  readonly operationKey: string
  readonly sequence: number
  readonly eventId: string
}

/**
 * The accumulator of the turn that is still open (SPEC 0292 §3): what makes `fold` exact at a
 * cut in the middle of a turn. `openCalls` is a list of pairs, not a record, so the order of
 * first sight of each tool survives keys that look like integers.
 */
export interface OpenGroup {
  readonly correlationId: string
  readonly firstSequence: number
  readonly lastSequence: number
  /** The group's `turn/start` event, or its first event when the turn has none (yet). */
  readonly start: StopSource
  readonly startType: string
  readonly openCalls: readonly (readonly [string, readonly CallRef[]])[]
  readonly uncertain: readonly CallRef[]
  readonly hasUser: boolean
  readonly hasAssistant: boolean
  readonly onlyMarkers: boolean
  readonly endCount: number
  readonly end?: { readonly stopReason: string; readonly sequence: number }
}

/** Turn bookkeeping of the groups already closed by a later group. */
export interface ClosedTurns {
  readonly completed: number
  readonly ended: number
  readonly open: number
  /** The last closed group that was not a compaction marker. */
  readonly last?: TurnReport
  /** Last sequence of the contiguous prefix of completed, certain turns (markers included). */
  readonly inheritable: number
  /** A closed group broke that prefix: nothing after it is inheritable. */
  readonly broken: boolean
}

export interface SessionProjection {
  readonly version: typeof SESSION_PROJECTION_VERSION
  readonly throughSequence: number
  readonly turns: {
    readonly total: number
    readonly completed: number
    readonly ended: number
    readonly open: number
  }
  readonly lastTurn?: TurnReport
  readonly stops: StopLog
  readonly inheritableThrough: number
  /** The value recorded in the event, not a position in the log (SPEC 0292 §3). */
  readonly compaction?: {
    readonly throughSequence: number
    readonly source: StopSource
    readonly count: number
  }
  readonly open?: OpenGroup
  readonly closed: ClosedTurns
}

/** SPEC 0292 §4: where a projection came from, and what the checkpoint cache did for it. */
export type SessionProjectionOrigin = 'cache' | 'incremental' | 'rebuild'
export type SessionProjectionCacheState =
  | 'hit'
  | 'absent'
  | 'invalid'
  | 'unavailable'

export interface SessionProjectionResult {
  readonly projection: SessionProjection
  readonly origin: SessionProjectionOrigin
  readonly throughSequence: number
  /** `hit` for `cache` and `incremental`; otherwise why the log had to be read whole. */
  readonly cache: SessionProjectionCacheState
}
