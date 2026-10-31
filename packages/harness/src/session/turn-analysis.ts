import type {
  CallRef,
  ClosedTurns,
  OpenGroup,
  SessionEvent,
  TurnReport
} from '@cvg/harness-contracts'
import { SessionPersistenceCorruptionError } from './persistence.ts'

/**
 * SPEC 0287 §3 as a reducer (SPEC 0292 §3): the grouping of a log into turns one event at a
 * time. `analyzeSessionLog` is this reducer folded over a whole log, and the projection folds
 * it over a tail: one logic (I10). No IO, no clock, no randomness.
 */
const UNCERTAIN_OUTCOMES: ReadonlySet<unknown> = new Set([
  'deadline',
  'cancelled',
  'threw',
  'confirm_failed'
])

/** A log that cannot be grouped into turns without guessing is a corrupt log (review of slice 1). */
export function unanalyzable(reason: string): never {
  throw new SessionPersistenceCorruptionError(
    `Session log is not analyzable: ${reason}`
  )
}

export interface TurnAnalysisState {
  readonly through: number
  readonly open?: OpenGroup
  readonly closed: ClosedTurns
}

export const EMPTY_TURN_ANALYSIS: TurnAnalysisState = Object.freeze({
  through: 0,
  closed: Object.freeze({
    completed: 0,
    ended: 0,
    open: 0,
    inheritable: 0,
    broken: false
  })
})

/** Optional side channels of one fold; none of them is part of the state. */
export interface TurnFoldContext {
  /** Remembers the groups already closed so that a reappearing one is refused (full analysis only). */
  readonly closedIds?: Set<string>
  /** Receives every group when a later group closes it, with its report and marker flag. */
  readonly onClose?: (report: TurnReport, marker: boolean) => void
  /**
   * When present, a group that cannot be reported (two `turn/end`) does not stop the fold: the
   * first such error is kept here, so that grouping errors of the whole log (gaps, interleaving)
   * are still found first, as the full analysis has always done.
   */
  readonly deferred?: { error?: unknown }
}

interface MutableOpen {
  correlationId: string
  firstSequence: number
  lastSequence: number
  start: { sequence: number; eventId: string }
  startType: string
  openCalls: [string, CallRef[]][]
  uncertain: CallRef[]
  hasUser: boolean
  hasAssistant: boolean
  onlyMarkers: boolean
  endCount: number
  end?: { stopReason: string; sequence: number }
}

interface MutableClosed {
  completed: number
  ended: number
  open: number
  last?: TurnReport
  inheritable: number
  broken: boolean
}

interface Working {
  through: number
  open: MutableOpen | undefined
  closed: MutableClosed
}

function cloneOpen(group: OpenGroup): MutableOpen {
  return {
    correlationId: group.correlationId,
    firstSequence: group.firstSequence,
    lastSequence: group.lastSequence,
    start: { ...group.start },
    startType: group.startType,
    openCalls: group.openCalls.map(([tool, calls]) => [
      tool,
      calls.map((c) => ({ ...c }))
    ]),
    uncertain: group.uncertain.map((c) => ({ ...c })),
    hasUser: group.hasUser,
    hasAssistant: group.hasAssistant,
    onlyMarkers: group.onlyMarkers,
    endCount: group.endCount,
    ...(group.end ? { end: { ...group.end } } : {})
  }
}

function cloneClosed(closed: ClosedTurns): MutableClosed {
  return {
    completed: closed.completed,
    ended: closed.ended,
    open: closed.open,
    inheritable: closed.inheritable,
    broken: closed.broken,
    ...(closed.last
      ? {
          last: {
            ...closed.last,
            uncertainEffects: [...closed.last.uncertainEffects]
          }
        }
      : {})
  }
}

function newGroup(e: SessionEvent): MutableOpen {
  return {
    correlationId: e.correlationId,
    firstSequence: e.sequence,
    lastSequence: e.sequence,
    start: { sequence: e.sequence, eventId: e.eventId },
    startType: e.type,
    openCalls: [],
    uncertain: [],
    hasUser: false,
    hasAssistant: false,
    onlyMarkers: true,
    endCount: 0
  }
}

/** The report of a group, as `analyzeSessionLog` has always built it. */
export function reportOfGroup(group: OpenGroup): TurnReport {
  if (group.endCount > 1) unanalyzable('a turn has more than one turn/end')
  const uncertain = [
    ...group.uncertain.map((c) => c.operationKey),
    ...group.openCalls.flatMap(([, calls]) => calls.map((c) => c.operationKey))
  ]
  // Only a lone compaction marker has no turn of its own; it is atomic.
  const stopReason = group.end?.stopReason
  let state: TurnReport['state']
  if (group.onlyMarkers) state = 'completed'
  else if (!group.end) state = 'open'
  else if (stopReason === 'COMPLETED' && (!group.hasUser || group.hasAssistant))
    state = 'completed'
  else state = 'ended'
  return {
    correlationId: group.correlationId,
    firstSequence: group.firstSequence,
    lastSequence: group.lastSequence,
    state,
    ...(stopReason === undefined ? {} : { stopReason }),
    uncertainEffects: uncertain
  }
}

/** The uncertain effects of a group with the event each one comes from. */
export function uncertainCalls(group: OpenGroup): readonly CallRef[] {
  return [...group.uncertain, ...group.openCalls.flatMap(([, calls]) => calls)]
}

function reportOrDefer(
  group: OpenGroup,
  context: TurnFoldContext
): TurnReport | undefined {
  try {
    return reportOfGroup(group)
  } catch (error) {
    if (!context.deferred) throw error
    context.deferred.error ??= error
    return undefined
  }
}

function closeGroup(
  working: Working,
  group: MutableOpen,
  context: TurnFoldContext
): void {
  const report = reportOrDefer(group, context)
  if (report === undefined) return
  const marker = group.onlyMarkers
  const closed = working.closed
  if (!marker) {
    if (report.state === 'completed') closed.completed += 1
    else if (report.state === 'ended') closed.ended += 1
    else closed.open += 1
    closed.last = report
  }
  if (!closed.broken) {
    if (report.state === 'completed' && report.uncertainEffects.length === 0)
      closed.inheritable = report.lastSequence
    else closed.broken = true
  }
  context.onClose?.(report, marker)
}

function absorb(group: MutableOpen, e: SessionEvent): void {
  group.lastSequence = e.sequence
  if (e.type !== 'context/compacted') group.onlyMarkers = false
  if (e.type === 'turn/start' && group.startType !== 'turn/start') {
    group.start = { sequence: e.sequence, eventId: e.eventId }
    group.startType = 'turn/start'
  }
  if (e.type === 'message/user') group.hasUser = true
  else if (e.type === 'message/assistant') group.hasAssistant = true
  else if (e.type === 'turn/end') {
    group.endCount += 1
    if (group.endCount === 1)
      group.end = {
        stopReason: (e.payload as Record<string, unknown>).stopReason as string,
        sequence: e.sequence
      }
  } else if (e.type === 'tool/call') {
    const payload = e.payload as Record<string, unknown>
    const toolId = payload.toolId as string
    const ref: CallRef = {
      operationKey: payload.operationKey as string,
      sequence: e.sequence,
      eventId: e.eventId
    }
    const entry = group.openCalls.find(([tool]) => tool === toolId)
    if (entry) entry[1].push(ref)
    else group.openCalls.push([toolId, [ref]])
  } else if (e.type === 'tool/result') {
    const payload = e.payload as Record<string, unknown>
    const ref = group.openCalls
      .find(([tool]) => tool === payload.toolId)?.[1]
      .shift()
    if (ref !== undefined && UNCERTAIN_OUTCOMES.has(payload.outcome))
      group.uncertain.push(ref)
  }
}

/**
 * Folds `events` into `state` and returns the new state; the input is never changed. The tail
 * must continue the state (`through + 1` first, then consecutive): anything else is a corrupt
 * log, refused (SPEC 0292 §3). Without `context.closedIds` a correlation id that comes back
 * after its group closed is not noticed (SPEC 0292 I2): the full analysis passes it.
 */
export function foldTurnAnalysis(
  state: TurnAnalysisState,
  events: readonly SessionEvent[],
  context: TurnFoldContext = {}
): TurnAnalysisState {
  const working: Working = {
    through: state.through,
    open: state.open ? cloneOpen(state.open) : undefined,
    closed: cloneClosed(state.closed)
  }
  for (const e of events) {
    if (e.sequence !== working.through + 1)
      unanalyzable('sequences are not contiguous from 1')
    working.through = e.sequence
    const current = working.open
    if (current && current.correlationId === e.correlationId) {
      absorb(current, e)
      continue
    }
    if (context.closedIds?.has(e.correlationId))
      unanalyzable('turns are interleaved')
    if (current) {
      context.closedIds?.add(current.correlationId)
      closeGroup(working, current, context)
    }
    const group = newGroup(e)
    working.open = group
    absorb(group, e)
  }
  return working as unknown as TurnAnalysisState
}

/** Closes the group still open at the end of a log, for the full analysis. */
export function finishTurnAnalysis(
  state: TurnAnalysisState,
  context: TurnFoldContext = {}
): void {
  if (!state.open) return
  const report = reportOrDefer(state.open, context)
  if (report !== undefined) context.onClose?.(report, state.open.onlyMarkers)
}
