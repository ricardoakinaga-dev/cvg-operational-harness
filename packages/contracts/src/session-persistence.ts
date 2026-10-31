import type { SessionEvent, SessionJson } from './session-events.ts'

/** SPEC 0221 + recomposition f64a1b89: first slice (owner, create/open/read/append/flush/close). */
export type SessionAccess = 'read' | 'write'
export interface SessionHeaderV1 {
  readonly version: 1
  readonly id: string
  readonly createdAt: number
  readonly isSeeded: boolean
  readonly cwd?: string
  readonly parentSession?: string
  readonly origin?: 'subagent'
  readonly delegationDepth?: number
  readonly agentPreset?: string
  /** Extra lossless JSON metadata is kept in the snapshot; it never authorizes anything. */
  readonly [extra: string]: SessionJson | undefined
}
export interface SessionPersistenceOptions {
  readonly signal?: AbortSignal
}
export interface SessionCreateOptions extends SessionPersistenceOptions {
  /** Explicit cut of the inherited history; never inferred from the body or the parent. */
  readonly inheritedEventCount?: number
}
export interface SessionHandle extends AsyncDisposable {
  readonly id: string
  readonly header: SessionHeaderV1
  readonly inheritedEventCount: number
  readonly access: SessionAccess
  read(
    offset?: number,
    length?: number,
    options?: SessionPersistenceOptions
  ): Promise<{
    readonly eventState: 'detached'
    readonly events: readonly SessionEvent[]
  }>
  append(
    events: readonly SessionEvent[],
    options?: SessionPersistenceOptions
  ): Promise<void>
  flush(options?: SessionPersistenceOptions): Promise<void>
  close(): Promise<void>
}
/** SPEC 0287 §3: one turn of a session log, grouped by the envelope correlation id. */
export interface TurnReport {
  readonly correlationId: string
  readonly firstSequence: number
  readonly lastSequence: number
  /** `ended` = a `turn/end` that does not make a completed turn; `open` = no `turn/end`. */
  readonly state: 'completed' | 'ended' | 'open'
  readonly stopReason?: string
  /** `operationKey`s whose effect the log cannot prove either way. */
  readonly uncertainEffects: readonly string[]
}
export interface SessionLogAnalysis {
  readonly turns: readonly TurnReport[]
  /** Last sequence of the longest contiguous prefix of completed, certain turns; 0 for none. */
  readonly inheritableThrough: number
  /** The most recent turn without `turn/end`. */
  readonly openTurn?: TurnReport
}
export interface SessionResume {
  readonly handle: SessionHandle
  readonly analysis: SessionLogAnalysis
}
export interface SessionPersistenceForkOptions extends SessionPersistenceOptions {
  /** Stops at the end of this completed turn; default is the whole inheritable prefix. */
  readonly through?: { readonly correlationId: string }
}
/** First slice: stat/list, aggregate flush, owner shutdown and recovery tickets are deferred. */
export interface SessionPersistence {
  readonly identity: symbol
  create(
    header: SessionHeaderV1,
    options?: SessionCreateOptions
  ): Promise<SessionHandle>
  open(
    id: string,
    access: SessionAccess,
    options?: SessionPersistenceOptions
  ): Promise<SessionHandle>
  /**
   * SPEC 0287: atomic copy of the completed-turn prefix of `sourceId` into a new session with
   * its own writer. The service writes `isSeeded`, `parentSession` and `lineage` itself.
   */
  fork(
    sourceId: string,
    header: SessionHeaderV1,
    options?: SessionPersistenceForkOptions
  ): Promise<SessionHandle>
  /**
   * SPEC 0287 §5: opens the session as its writer (try-lock only: a live owner is
   * `SessionAlreadyOwnedError`) and analyzes its log. Writes, closes and repairs nothing.
   */
  resumeSession(
    id: string,
    options?: SessionPersistenceOptions
  ): Promise<SessionResume>
}
