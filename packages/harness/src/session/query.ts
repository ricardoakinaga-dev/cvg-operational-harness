import { Buffer } from 'node:buffer'
import {
  SESSION_QUERY_EXAMINE_CAP,
  SESSION_QUERY_MAX_LIMIT,
  type ApprovalReadPort,
  type EffectJournalReadPort,
  type SessionDirectory,
  type SessionEvent,
  type SessionEventStore,
  type SessionListInput,
  type SessionListPage,
  type SessionQuery,
  type SessionSummary,
  type SessionTrace,
  type SessionTraceInput,
  type TraceApproval,
  type TraceBudgetKind,
  type TraceEffect,
  type TraceGap,
  type TraceLink,
  type TraceRoot
} from '@cvg/harness-contracts'
import {
  SessionQueryError,
  canonicalSessionFilter,
  decodeSessionCursor,
  encodeSessionCursor,
  matchesSessionFilter,
  sessionListLimit
} from './query-cursor.ts'

/** SPEC 0295 §5.3: what one trace is allowed to read. */
export const SESSION_TRACE_BUDGETS = Object.freeze({
  sessions: 20,
  events: 5000,
  bytes: 4 * 1024 * 1024,
  calls: 30,
  deadlineMs: 5000,
  links: 100,
  pageEvents: 100,
  approvalCandidates: 10
})
export type SessionTraceBudgets = typeof SESSION_TRACE_BUDGETS

export interface SessionQueryOptions {
  /** The tenant of the composition; nothing in a request can change it. */
  readonly tenantId: string
  readonly directory: SessionDirectory
  /** Reads events of one session; a missing session raises `session_not_open`. */
  readonly events?: SessionEventStore
  readonly approvals?: ApprovalReadPort
  readonly effects?: EffectJournalReadPort
  /** Wall clock for `observed`. */
  readonly clock?: () => Date
  /** Monotonic milliseconds, for the trace deadline. */
  readonly monotonicMs?: () => number
  readonly budgets?: Partial<SessionTraceBudgets>
}

const gapOrder = (gap: TraceGap): string =>
  JSON.stringify([gap.reason, gap.subject])

const linkOrder = (link: TraceLink): string => {
  if (link.kind === 'approval') return `0\u0000${link.approvalId}`
  if (link.kind === 'effect') return `1\u0000${link.operationKey}`
  return `2\u0000${link.sessionId}\u0000${String(link.sequence).padStart(16, '0')}`
}

function checkAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted)
    throw signal.reason ?? new SessionQueryError('unavailable', 'cancelled')
}

/**
 * SPEC 0295: listing and tracing over ports, tenant-bound, read-only. The listing examines a
 * window of candidates BEFORE the filter and moves its cursor to the last one examined; the
 * trace follows an approval or an operation key to its effect and to the events of the log
 * with explicit gaps and global budgets, never choosing between candidates.
 */
export function createSessionQuery(options: SessionQueryOptions): SessionQuery {
  const tenantId = options.tenantId
  const clock = options.clock ?? (() => new Date())
  const monotonicMs = options.monotonicMs ?? (() => performance.now())
  const budgets: SessionTraceBudgets = {
    ...SESSION_TRACE_BUDGETS,
    ...options.budgets
  }

  async function list(input: SessionListInput = {}): Promise<SessionListPage> {
    const filter = canonicalSessionFilter(input.filter)
    const limit = sessionListLimit(input.limit)
    const before =
      input.cursor === undefined
        ? undefined
        : decodeSessionCursor(input.cursor, filter, tenantId)
    checkAborted(input.signal)
    const rows = await options.directory.window({
      ...(before === undefined ? {} : { before }),
      size: SESSION_QUERY_EXAMINE_CAP,
      ...(input.signal ? { signal: input.signal } : {})
    })
    checkAborted(input.signal)
    const items: SessionSummary[] = []
    let skippedUnadopted = 0
    let examined = 0
    const fullWindow = rows.length >= SESSION_QUERY_EXAMINE_CAP
    for (const [index, row] of rows.entries()) {
      examined += 1
      if (row.summary === null) skippedUnadopted += 1
      else if (matchesSessionFilter(row.summary, filter))
        items.push(row.summary)
      if (items.length === limit) {
        const lastOfShortWindow = index === rows.length - 1 && !fullWindow
        return {
          items,
          nextCursor: lastOfShortWindow
            ? null
            : encodeSessionCursor(row.key, filter, tenantId),
          examined,
          skippedUnadopted
        }
      }
    }
    return {
      items,
      nextCursor:
        fullWindow && rows.length > 0
          ? encodeSessionCursor(rows[rows.length - 1]!.key, filter, tenantId)
          : null,
      examined,
      skippedUnadopted
    }
  }

  async function trace(input: SessionTraceInput): Promise<SessionTrace> {
    const roots = [input.approvalId, input.operationKey].filter(
      (v) => v !== undefined
    )
    if (roots.length !== 1)
      throw new SessionQueryError(
        'invalid_params',
        'a trace needs exactly one of approvalId and operationKey'
      )
    const rootId = roots[0]
    if (
      typeof rootId !== 'string' ||
      rootId.length < 1 ||
      rootId.length > 4096 ||
      rootId.includes('\u0000')
    )
      throw new SessionQueryError(
        'invalid_params',
        'the trace root is malformed'
      )
    if (!options.approvals || !options.effects || !options.events)
      throw new SessionQueryError(
        'unsupported',
        'the trace sources are not composed'
      )
    const { approvals, effects, events } = options
    const signal = input.signal
    const root: TraceRoot =
      input.approvalId !== undefined
        ? { kind: 'approval', id: input.approvalId }
        : { kind: 'operationKey', id: rootId }
    const startedAt = monotonicMs()
    const gaps: TraceGap[] = []
    const links: TraceLink[] = []
    const observed: { approval?: string; effect?: string; events?: string } = {}
    let truncated = false
    let calls = 0
    const exhausted = (kind: TraceBudgetKind) => {
      truncated = true
      gaps.push({ reason: 'budget_exhausted', subject: { kind, id: kind } })
    }
    /** Counts one read against the budgets; false when a budget stops it. */
    const spendCall = (): boolean => {
      checkAborted(signal)
      if (monotonicMs() - startedAt > budgets.deadlineMs) {
        exhausted('deadline')
        return false
      }
      if (calls >= budgets.calls) {
        exhausted('calls')
        return false
      }
      calls += 1
      return true
    }

    // 1. approvals: the root source for an approval id and for a key alike
    let found: readonly TraceApproval[]
    let operationKey: string | undefined
    // a budget stop is the trace's own refusal, decided outside the source's try
    if (!spendCall())
      throw new SessionQueryError('unavailable', 'the trace budget is spent')
    try {
      observed.approval = clock().toISOString()
      if (input.approvalId !== undefined) {
        const approval = await approvals.get(tenantId, input.approvalId, signal)
        found = approval ? [approval] : []
        operationKey = approval?.operationKey
      } else {
        const candidates = await approvals.listByOperationKey(
          tenantId,
          rootId,
          budgets.approvalCandidates + 1,
          signal
        )
        found = candidates.slice(0, budgets.approvalCandidates)
        if (candidates.length > budgets.approvalCandidates)
          gaps.push({
            reason: 'candidates_capped',
            subject: { kind: 'operationKey', id: rootId }
          })
        operationKey = rootId
      }
    } catch {
      // whatever the source threw, its code and text never reach the caller
      checkAborted(signal)
      throw new SessionQueryError('unavailable', 'the trace root source failed')
    }
    // absence is not classified for a caller that has already left
    checkAborted(signal)
    if (input.approvalId !== undefined && found.length === 0)
      throw new SessionQueryError('not_found', 'trace root not found')
    for (const approval of found) {
      links.push({
        kind: 'approval',
        approvalId: approval.approvalId,
        status: approval.status,
        ...(approval.executionRef === undefined
          ? {}
          : { executionRef: approval.executionRef }),
        ...(approval.originSessionId === undefined
          ? {}
          : { originSessionId: approval.originSessionId })
      })
      if (approval.originSessionId === undefined)
        gaps.push({
          reason: 'origin_unbound',
          subject: { kind: 'approval', id: approval.approvalId }
        })
    }
    if (found.length > 1)
      gaps.push({
        reason: 'ambiguous_approval',
        subject: { kind: 'operationKey', id: rootId }
      })

    // 2. the effect
    let effect: TraceEffect | undefined
    if (operationKey === undefined) {
      gaps.push({
        reason: 'effect_absent',
        subject: { kind: 'approval', id: rootId }
      })
    } else if (spendCall()) {
      try {
        observed.effect = clock().toISOString()
        effect = await effects.get(tenantId, operationKey, signal)
      } catch {
        checkAborted(signal)
        gaps.push({
          reason: 'source_unavailable',
          subject: { kind: 'effect', id: operationKey }
        })
      }
      checkAborted(signal)
      if (effect === undefined)
        gaps.push({
          reason: 'effect_absent',
          subject: { kind: 'operationKey', id: operationKey }
        })
      else {
        links.push({
          kind: 'effect',
          operationKey: effect.operationKey,
          state: effect.state,
          ...(effect.executionRef === undefined
            ? {}
            : { executionRef: effect.executionRef })
        })
        for (const approval of found)
          if (
            approval.executionRef !== undefined &&
            effect.executionRef !== undefined &&
            approval.executionRef !== effect.executionRef
          )
            gaps.push({
              reason: 'execution_ref_mismatch',
              subject: { kind: 'approval', id: approval.approvalId }
            })
      }
    }

    // 3. the events of the log
    if (operationKey !== undefined && !truncated) {
      observed.events = clock().toISOString()
      await searchEvents(operationKey)
    }
    // the last await may have outlived the caller or the deadline: say so before publishing
    checkAborted(signal)
    if (monotonicMs() - startedAt > budgets.deadlineMs) exhausted('deadline')

    // the root was an operation key with nothing behind it anywhere
    if (
      input.approvalId === undefined &&
      found.length === 0 &&
      effect === undefined &&
      !links.some((link) => link.kind === 'event') &&
      !gaps.some((g) => g.reason === 'source_unavailable') &&
      !truncated
    )
      throw new SessionQueryError('not_found', 'trace root not found')
    if (input.approvalId === undefined && found.length === 0)
      gaps.push({
        reason: 'approval_not_found',
        subject: { kind: 'operationKey', id: rootId }
      })

    const ordered = [...links].sort((a, b) =>
      linkOrder(a) < linkOrder(b) ? -1 : 1
    )
    const seen = new Set<string>()
    const uniqueGaps = gaps
      .filter((gap) => {
        const key = gapOrder(gap)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (gapOrder(a) < gapOrder(b) ? -1 : 1))
    return { root, links: ordered, gaps: uniqueGaps, truncated, observed }

    async function searchEvents(key: string): Promise<void> {
      // sessions to look at: the origins named by the approvals first (a hint, never proof),
      // then the listing, newest first
      const hinted = [
        ...new Set(
          found.flatMap((a) =>
            a.originSessionId === undefined ? [] : [a.originSessionId]
          )
        )
      ]
      const summaries = new Map<string, SessionSummary>()
      const order: string[] = []
      const add = (id: string) => {
        if (!order.includes(id)) order.push(id)
      }
      hinted.forEach(add)
      let cursor: string | undefined
      let complete = false
      let bytes = 0
      let eventCount = 0
      let matched = 0
      const calls_: {
        sessionId: string
        sequence: number
        eventId: string
        correlationId: string
        toolId: string
      }[] = []
      const results = new Map<string, SessionEvent[]>()
      const callsPerTurnTool = new Map<string, number>()
      const ends = new Map<string, SessionEvent>()
      /** One more page of the listing; false when the budget or the source stops it. */
      const loadPage = async (): Promise<boolean> => {
        if (!spendCall()) return false
        let page: SessionListPage
        try {
          page = await list({
            ...(cursor === undefined ? {} : { cursor }),
            limit: SESSION_QUERY_MAX_LIMIT,
            ...(signal ? { signal } : {})
          })
        } catch {
          checkAborted(signal)
          gaps.push({
            reason: 'source_unavailable',
            subject: { kind: 'sessions', id: 'listing' }
          })
          complete = true
          return false
        }
        for (const item of page.items) {
          summaries.set(item.sessionId, item)
          add(item.sessionId)
        }
        if (page.nextCursor === null) complete = true
        else cursor = page.nextCursor
        return true
      }
      const sessionOf = async (index: number): Promise<string | undefined> => {
        while (order.length <= index && !complete)
          if (!(await loadPage())) return undefined
        return order[index]
      }
      let scannedSessions = 0
      for (let index = 0; ; index += 1) {
        if (scannedSessions >= budgets.sessions) {
          if (order.length > index || !complete) exhausted('sessions')
          break
        }
        const sessionId = await sessionOf(index)
        if (sessionId === undefined) break
        scannedSessions += 1
        let after = 0
        let stop = false
        for (;;) {
          if (eventCount >= budgets.events) {
            exhausted('events')
            stop = true
            break
          }
          if (!spendCall()) {
            stop = true
            break
          }
          const want = Math.min(budgets.pageEvents, budgets.events - eventCount)
          let page: readonly SessionEvent[]
          try {
            page = await events.read({
              tenantId,
              sessionId,
              afterSequence: after,
              limit: want
            })
            checkAborted(signal)
          } catch {
            checkAborted(signal)
            // a session that vanished or cannot be read is a gap, never a failed trace
            gaps.push({
              reason: 'source_unavailable',
              subject: { kind: 'session', id: sessionId }
            })
            break
          }
          for (const event of page) {
            const size = Buffer.byteLength(JSON.stringify(event), 'utf8')
            if (bytes + size > budgets.bytes) {
              exhausted('bytes')
              stop = true
              break
            }
            bytes += size
            eventCount += 1
            after = event.sequence
            const payload = event.payload as Record<string, unknown>
            if (event.type === 'tool/call') {
              const slot = `${sessionId}\u0000${event.correlationId}\u0000${String(payload.toolId)}`
              callsPerTurnTool.set(slot, (callsPerTurnTool.get(slot) ?? 0) + 1)
            }
            if (event.type === 'tool/call' && payload.operationKey === key) {
              matched += 1
              calls_.push({
                sessionId,
                sequence: event.sequence,
                eventId: event.eventId,
                correlationId: event.correlationId,
                toolId: payload.toolId as string
              })
            } else if (event.type === 'tool/result') {
              const slot = `${sessionId}\u0000${event.correlationId}\u0000${String(payload.toolId)}`
              results.set(slot, [...(results.get(slot) ?? []), event])
            } else if (event.type === 'turn/end') {
              ends.set(`${sessionId}\u0000${event.correlationId}`, event)
            }
          }
          if (stop || page.length < want) break
        }
        if (stop) break
      }
      // Inheritance is judged here, once the summaries are known: a hinted session is scanned
      // before the listing is read, and a missing cut must not read as "nothing inherited".
      // The scan above ends only when the listing is complete or a budget stopped it, so every
      // cut that exists is known by now; one that is not (a session missing from the listing)
      // is a gap, and its copies are not counted as original candidates.
      const unknown = new Set<string>()
      const inheritedOf = (c: { sessionId: string; sequence: number }) => {
        const summary = summaries.get(c.sessionId)
        if (summary === undefined) {
          unknown.add(c.sessionId)
          return false
        }
        return c.sequence <= summary.inheritedEventCount
      }
      const classified = calls_.map((c) => ({
        ...c,
        inherited: inheritedOf(c)
      }))
      for (const id of unknown)
        gaps.push({
          reason: 'source_unavailable',
          subject: { kind: 'session', id }
        })
      const real = classified.filter(
        (c) => !c.inherited && !unknown.has(c.sessionId)
      )
      const push = (link: TraceLink): boolean => {
        if (links.length >= budgets.links) {
          exhausted('links')
          return false
        }
        links.push(link)
        return true
      }
      for (const c of classified) {
        if (
          !push({
            kind: 'event',
            sessionId: c.sessionId,
            sequence: c.sequence,
            eventId: c.eventId,
            type: 'tool/call',
            correlationId: c.correlationId,
            toolId: c.toolId,
            inherited: c.inherited
          })
        )
          break
        const slot = `${c.sessionId}\u0000${c.correlationId}\u0000${c.toolId}`
        let room = true
        if (callsPerTurnTool.get(slot)! > 1)
          gaps.push({
            reason: 'tool_result_ambiguous',
            subject: { kind: 'session', id: c.sessionId }
          })
        else
          for (const r of results.get(slot) ?? [])
            if (
              r.sequence > c.sequence &&
              !(room = push({
                kind: 'event',
                sessionId: c.sessionId,
                sequence: r.sequence,
                eventId: r.eventId,
                type: 'tool/result',
                correlationId: r.correlationId,
                toolId: c.toolId,
                outcome: (r.payload as Record<string, unknown>)
                  .outcome as string,
                inherited: c.inherited
              }))
            )
              break
        if (!room) break
        const end = ends.get(`${c.sessionId}\u0000${c.correlationId}`)
        if (
          end &&
          !push({
            kind: 'event',
            sessionId: c.sessionId,
            sequence: end.sequence,
            eventId: end.eventId,
            type: 'turn/end',
            correlationId: end.correlationId,
            outcome: (end.payload as Record<string, unknown>)
              .stopReason as string,
            inherited: c.inherited
          })
        )
          break
      }
      if (real.length > 1)
        gaps.push({
          reason: 'multiple_event_candidates',
          subject: { kind: 'operationKey', id: key }
        })
      if (matched === 0 && !truncated)
        gaps.push({
          reason: 'event_not_found',
          subject: { kind: 'operationKey', id: key }
        })
    }
  }

  return { list, trace }
}
