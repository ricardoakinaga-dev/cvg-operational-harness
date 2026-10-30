import { createHash } from 'node:crypto'
import type { SessionEvent, SessionEventAppend } from '@cvg/harness-contracts'
import { sessionEventInputDigest } from './events.ts'
import { SessionPersistenceError } from './persistence.ts'

/** SPEC 0287 §3-§4: pure analysis of a session log and planning of a fork. No IO, no clock. */
export const SESSION_FORK_MAX_DEPTH = 16

export type SessionForkRefusalCode =
  | 'fork_nothing_to_inherit'
  | 'fork_cut_not_inheritable'
  | 'fork_cut_unknown_turn'
  | 'fork_target_is_source'
  | 'fork_too_large'
  | 'fork_depth_exceeded'

/** A fork the rules refuse (FK-C): closed codes, a safe message, never the log content. */
export class SessionForkRefusedError extends SessionPersistenceError {
  constructor(
    readonly code: SessionForkRefusalCode,
    sessionId?: string
  ) {
    super(`Session fork refused: ${code}`, sessionId)
  }
}
/** The log cannot be grouped into turns without guessing, so nothing is concluded from it. */
export class SessionLogUnanalyzableError extends SessionPersistenceError {}

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

const UNCERTAIN_OUTCOMES: ReadonlySet<unknown> = new Set([
  'deadline',
  'cancelled',
  'threw',
  'confirm_failed'
])

function unanalyzable(reason: string): never {
  throw new SessionLogUnanalyzableError(
    `Session log is not analyzable: ${reason}`
  )
}

interface Group {
  correlationId: string
  events: SessionEvent[]
}

function groupTurns(events: readonly SessionEvent[]): Group[] {
  const groups: Group[] = []
  const closed = new Set<string>()
  let previous = 0
  for (const e of events) {
    if (e.sequence !== previous + 1)
      unanalyzable('sequences are not contiguous from 1')
    previous = e.sequence
    const last = groups.at(-1)
    if (last && last.correlationId === e.correlationId) last.events.push(e)
    else {
      if (closed.has(e.correlationId)) unanalyzable('turns are interleaved')
      if (last) closed.add(last.correlationId)
      groups.push({ correlationId: e.correlationId, events: [e] })
    }
  }
  return groups
}

function report(group: Group): TurnReport {
  const { events } = group
  const ends = events.filter((e) => e.type === 'turn/end')
  if (ends.length > 1) unanalyzable('a turn has more than one turn/end')
  const open = new Map<string, string[]>() // toolId -> operationKeys awaiting a result
  const uncertain: string[] = []
  for (const e of events) {
    const payload = e.payload as Record<string, unknown>
    if (e.type === 'tool/call') {
      const queue = open.get(payload.toolId as string) ?? []
      queue.push(payload.operationKey as string)
      open.set(payload.toolId as string, queue)
    } else if (e.type === 'tool/result') {
      const key = open.get(payload.toolId as string)?.shift()
      if (key !== undefined && UNCERTAIN_OUTCOMES.has(payload.outcome))
        uncertain.push(key)
    }
  }
  for (const queue of open.values()) uncertain.push(...queue)
  // Only a lone compaction marker has no turn of its own; it is atomic.
  const marker = events.every((e) => e.type === 'context/compacted')
  const hasUser = events.some((e) => e.type === 'message/user')
  const hasAssistant = events.some((e) => e.type === 'message/assistant')
  const end = ends[0]
  const stopReason = end
    ? ((end.payload as Record<string, unknown>).stopReason as string)
    : undefined
  let state: TurnReport['state']
  if (marker) state = 'completed'
  else if (!end) state = 'open'
  else if (stopReason === 'COMPLETED' && (!hasUser || hasAssistant))
    state = 'completed'
  else state = 'ended'
  return {
    correlationId: group.correlationId,
    firstSequence: events[0]!.sequence,
    lastSequence: events.at(-1)!.sequence,
    state,
    ...(stopReason === undefined ? {} : { stopReason }),
    uncertainEffects: uncertain
  }
}

export function analyzeSessionLog(
  events: readonly SessionEvent[]
): SessionLogAnalysis {
  const turns = groupTurns(events).map(report)
  let inheritableThrough = 0
  for (const t of turns) {
    if (t.state !== 'completed' || t.uncertainEffects.length > 0) break
    inheritableThrough = t.lastSequence
  }
  const openTurn = [...turns].reverse().find((t) => t.state === 'open')
  return { turns, inheritableThrough, ...(openTurn ? { openTurn } : {}) }
}

export interface SessionForkLineage {
  readonly source: string
  readonly cutSequence: number
  /** SHA-256 hex of the ordered `sequence:input_digest` lines of the inherited prefix. */
  readonly sourceDigest: string
  readonly depth: number
  readonly root: string
}
export interface SessionForkPlan {
  readonly inherited: readonly SessionEvent[]
  readonly cutSequence: number
  readonly lineage: SessionForkLineage
}
export interface SessionForkOptions {
  readonly targetSessionId: string
  /** Stops at the end of this completed turn instead of the whole inheritable prefix. */
  readonly through?: { readonly correlationId: string }
  /** Lineage of the source itself, when it is a fork: depth grows from here. */
  readonly sourceLineage?: { readonly depth: number; readonly root: string }
}

function appendOf(event: SessionEvent): SessionEventAppend {
  const {
    sequence: _sequence,
    schemaFingerprint: _fingerprint,
    ...input
  } = event
  void _sequence
  void _fingerprint
  return input
}
/** Digest of the prefix as the source stores it: also what `verifySessionFork` recomputes. */
export function sessionForkSourceDigest(
  prefix: readonly SessionEvent[]
): string {
  return createHash('sha256')
    .update(
      prefix
        .map((e) => `${e.sequence}:${sessionEventInputDigest(appendOf(e))}`)
        .join('\n')
    )
    .digest('hex')
}

export function planSessionFork(
  events: readonly SessionEvent[],
  options: SessionForkOptions
): SessionForkPlan {
  const sourceId = events[0]?.sessionId
  if (sourceId === options.targetSessionId)
    throw new SessionForkRefusedError('fork_target_is_source', sourceId)
  const analysis = analyzeSessionLog(events)
  let cut = analysis.inheritableThrough
  if (options.through) {
    const turn = analysis.turns.find(
      (t) => t.correlationId === options.through!.correlationId
    )
    if (!turn)
      throw new SessionForkRefusedError('fork_cut_unknown_turn', sourceId)
    if (turn.lastSequence > analysis.inheritableThrough)
      throw new SessionForkRefusedError('fork_cut_not_inheritable', sourceId)
    cut = turn.lastSequence
  }
  if (cut === 0)
    throw new SessionForkRefusedError('fork_nothing_to_inherit', sourceId)
  const depth = (options.sourceLineage?.depth ?? 0) + 1
  if (depth > SESSION_FORK_MAX_DEPTH)
    throw new SessionForkRefusedError('fork_depth_exceeded', sourceId)
  const prefix = events.slice(0, cut)
  return {
    inherited: prefix.map((e) => ({
      ...e,
      sessionId: options.targetSessionId
    })),
    cutSequence: cut,
    lineage: {
      // `sourceId` is defined here: a non-empty prefix implies a first event.
      source: sourceId!,
      cutSequence: cut,
      sourceDigest: sessionForkSourceDigest(prefix),
      depth,
      root: options.sourceLineage?.root ?? sourceId!
    }
  }
}
