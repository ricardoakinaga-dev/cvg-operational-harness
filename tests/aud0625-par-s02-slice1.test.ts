// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
  SessionEvent,
  SessionEventAppend,
  SessionLogAnalysis,
  TurnReport
} from '@cvg/harness-contracts'
import {
  SESSION_PROJECTION_MAX_STATE_BYTES,
  SESSION_PROJECTION_RECENT_STOPS,
  SESSION_PROJECTION_VERSION,
  SessionPersistenceCorruptionError,
  analyzeSessionLog,
  currentStops,
  emptySessionProjection,
  foldSessionProjection,
  foldTurnAnalysis,
  EMPTY_TURN_ANALYSIS,
  materializeSessionEvent,
  projectSession,
  sessionProjectionStateBytes
} from '../packages/harness/src/session/index.ts'

// PAR-S02 slice 1 (SPEC 0292): the pure projection and `analyzeSessionLog` as a reducer.
// The oracle below is the S04 implementation as it was before the refactor, kept verbatim: the
// reducer must give the same analysis, or the same error, for every log.
const TENANT = 'tenant-synthetic-A'
const SESSION = 's02-slice1'

/* ---- the S04 analysis before SPEC 0292 (oracle) --------------------------------------- */
const UNCERTAIN_OUTCOMES: ReadonlySet<unknown> = new Set([
  'deadline',
  'cancelled',
  'threw',
  'confirm_failed'
])
function unanalyzable(reason: string): never {
  throw new SessionPersistenceCorruptionError(
    `Session log is not analyzable: ${reason}`
  )
}
interface Group {
  correlationId: string
  events: SessionEvent[]
}
function legacyGroupTurns(events: readonly SessionEvent[]): Group[] {
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
function legacyReport(group: Group): TurnReport {
  const { events } = group
  const ends = events.filter((e) => e.type === 'turn/end')
  if (ends.length > 1) unanalyzable('a turn has more than one turn/end')
  const open = new Map<string, string[]>()
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
function legacyAnalyze(events: readonly SessionEvent[]): SessionLogAnalysis {
  const turns = legacyGroupTurns(events).map(legacyReport)
  let inheritableThrough = 0
  for (const t of turns) {
    if (t.state !== 'completed' || t.uncertainEffects.length > 0) break
    inheritableThrough = t.lastSequence
  }
  const openTurn = [...turns].reverse().find((t) => t.state === 'open')
  return { turns, inheritableThrough, ...(openTurn ? { openTurn } : {}) }
}

/* ---- builders -------------------------------------------------------------------------- */
let n = 0
const ev = (
  type: SessionEventAppend['type'],
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: TENANT,
      sessionId: SESSION,
      formatVersion: 1,
      eventId: `e${n + 1}`,
      timestamp: '2026-10-30T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as SessionEventAppend,
    ++n
  )
const call = (c: string, toolId: string, key: string) =>
  ev('tool/call', c, { correlationId: c, toolId, operationKey: key, input: {} })
const result = (c: string, toolId: string, outcome: string) =>
  ev('tool/result', c, { correlationId: c, toolId, outcome })
const start = (c: string) => ev('turn/start', c, { correlationId: c })
const end = (c: string, stopReason: string) =>
  ev('turn/end', c, { correlationId: c, stopReason })
const user = (c: string) => ev('message/user', c, { text: `TEXT-${c}` })
const assistant = (c: string) =>
  ev('message/assistant', c, { text: `ANS-${c}` })
// the schema wants the recorded value below the event's own sequence
const compacted = (c: string, through: number) =>
  ev('context/compacted', c, {
    throughSequence: Math.max(1, Math.min(through, n)),
    summary: 'SUMMARY-TEXT',
    sourceDigest: 'a'.repeat(64),
    strategyVersion: 'v1'
  })
const reset = () => {
  n = 0
}
/** Rewrites the sequence of already built events (holes, overlaps) without changing the rest. */
const withSequences = (
  events: SessionEvent[],
  seqs: number[]
): SessionEvent[] => events.map((e, i) => ({ ...e, sequence: seqs[i]! }))
const outcome = (f: () => unknown): { ok: unknown } | { error: string } => {
  try {
    return { ok: f() }
  } catch (error) {
    return { error: (error as Error).message }
  }
}

/** Deterministic pseudo-random generator (mulberry32). */
function prng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const OUTCOMES = [
  'succeeded',
  'failed',
  'deadline',
  'cancelled',
  'threw',
  'confirm_failed',
  'not_started'
]
const STOPS = [
  'COMPLETED',
  'APPROVAL_REQUIRED',
  'NEEDS_USER_INPUT',
  'HUMAN_TAKEOVER',
  'INSUFFICIENT_EVIDENCE'
]
/** A random log: mostly analyzable, sometimes with a gap, an overlap, a dup turn/end or an interleaving. */
function randomLog(seed: number, corrupt: boolean): SessionEvent[] {
  const r = prng(seed)
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
  reset()
  const out: SessionEvent[] = []
  const turns = 1 + Math.floor(r() * 6)
  for (let t = 0; t < turns; t++) {
    const c = `c${t}`
    if (out.length > 0 && r() < 0.12) {
      out.push(compacted(c, 1 + Math.floor(r() * 3)))
      continue
    }
    if (r() < 0.6) out.push(user(c))
    if (r() < 0.9) out.push(start(c))
    const calls = Math.floor(r() * 4)
    const tools = ['t1', 't2', '3', '1']
    for (let k = 0; k < calls; k++) {
      const tool = pick(tools)
      out.push(call(c, tool, `${c}-${tool}-${k}`))
      if (r() < 0.6) out.push(result(c, pick(tools), pick(OUTCOMES)))
    }
    if (r() < 0.85) {
      out.push(end(c, pick(STOPS)))
      if (r() < 0.6) out.push(assistant(c))
    }
  }
  if (!corrupt) return out
  const kind = Math.floor(r() * 4)
  if (kind === 0 && out.length > 2) {
    const at = 1 + Math.floor(r() * (out.length - 1))
    return out.map((e, i) => (i >= at ? { ...e, sequence: e.sequence + 1 } : e))
  }
  if (kind === 1 && out.length > 2) {
    const at = 1 + Math.floor(r() * (out.length - 1))
    return out.map((e, i) =>
      i === at ? { ...e, sequence: e.sequence - 1 } : e
    )
  }
  if (kind === 2) {
    const dup = ev('turn/end', out.at(-1)!.correlationId, {
      correlationId: out.at(-1)!.correlationId,
      stopReason: 'COMPLETED'
    })
    return [...out, end(dup.correlationId, 'COMPLETED')].map((e, i) => ({
      ...e,
      sequence: i + 1
    }))
  }
  const back = ev('message/user', 'c0', { text: 'again' })
  return [...out, { ...back, sequence: out.length + 1 }]
}

describe('analyzeSessionLog as a reducer gives what S04 gave (FP/FK oracle)', () => {
  it('matches the S04 analysis, or its error, on 2400 random logs', () => {
    for (let seed = 1; seed <= 2400; seed++) {
      const log = randomLog(seed, seed % 3 === 0)
      expect(
        outcome(() => analyzeSessionLog(log)),
        `seed ${seed}`
      ).toEqual(outcome(() => legacyAnalyze(log)))
    }
  })

  it('the projection agrees with the analysis on turns, last turn and the inheritable cut, on the same random logs', () => {
    let compared = 0
    for (let seed = 1; seed <= 2400; seed++) {
      const log = randomLog(seed, seed % 3 === 0)
      const analysis = outcome(() => legacyAnalyze(log))
      const projection = outcome(() => projectSession(log))
      if ('error' in analysis) {
        expect('error' in projection, `seed ${seed}`).toBe(true)
        continue
      }
      expect('error' in projection, `seed ${seed}`).toBe(false)
      const a = analysis.ok as SessionLogAnalysis
      const p = (projection as { ok: ReturnType<typeof projectSession> }).ok
      const real = a.turns.filter(
        (t, i) =>
          !log
            .filter(
              (e) =>
                e.sequence >= t.firstSequence && e.sequence <= t.lastSequence
            )
            .every((e) => e.type === 'context/compacted') && i >= 0
      )
      expect(p.inheritableThrough, `seed ${seed}`).toBe(a.inheritableThrough)
      expect(p.turns.total, `seed ${seed}`).toBe(real.length)
      expect(p.turns.open, `seed ${seed}`).toBe(
        real.filter((t) => t.state === 'open').length
      )
      expect(p.turns.ended, `seed ${seed}`).toBe(
        real.filter((t) => t.state === 'ended').length
      )
      expect(p.lastTurn, `seed ${seed}`).toEqual(real.at(-1))
      compared++
    }
    expect(compared).toBeGreaterThan(1500)
  })

  it('finds a grouping error before a two-turn/end error, as the whole-log pass did', () => {
    reset()
    const log = [
      start('a'),
      end('a', 'COMPLETED'),
      end('a', 'COMPLETED'),
      start('b'),
      start('a')
    ]
    expect(outcome(() => analyzeSessionLog(log))).toEqual(
      outcome(() => legacyAnalyze(log))
    )
    expect(outcome(() => analyzeSessionLog(log))).toEqual({
      error: 'Session log is not analyzable: turns are interleaved'
    })
    reset()
    const two = [start('a'), end('a', 'COMPLETED'), end('a', 'COMPLETED')]
    expect(outcome(() => analyzeSessionLog(two))).toEqual({
      error: 'Session log is not analyzable: a turn has more than one turn/end'
    })
  })

  it('keeps the uncertain effects in the order of first sight of each tool, also for integer-like ids', () => {
    reset()
    const log = [
      start('a'),
      call('a', '2', 'k-2'),
      call('a', '1', 'k-1'),
      call('a', '2', 'k-2b')
    ]
    expect(analyzeSessionLog(log).turns[0]!.uncertainEffects).toEqual([
      'k-2',
      'k-2b',
      'k-1'
    ])
    expect(analyzeSessionLog(log)).toEqual(legacyAnalyze(log))
  })

  it('does not change the events it is given', () => {
    reset()
    const log = [start('a'), call('a', 't', 'k'), end('a', 'COMPLETED')]
    const before = JSON.stringify(log)
    analyzeSessionLog(log)
    expect(JSON.stringify(log)).toBe(before)
  })
})

describe('foldTurnAnalysis', () => {
  it('does not change the state it is given and continues exactly where it stopped', () => {
    reset()
    const log = [start('a'), call('a', 't', 'k'), result('a', 't', 'threw')]
    const head = foldTurnAnalysis(EMPTY_TURN_ANALYSIS, log.slice(0, 2))
    const frozen = JSON.stringify(head)
    const tail = foldTurnAnalysis(head, log.slice(2))
    expect(JSON.stringify(head)).toBe(frozen)
    expect(tail).toEqual(foldTurnAnalysis(EMPTY_TURN_ANALYSIS, log))
    expect(tail.through).toBe(3)
  })
})

describe('foldTurnAnalysis refuses a closed turn it cannot report', () => {
  it('throws when a later turn closes a group with two turn/end, unless the caller defers errors', () => {
    reset()
    const log = [
      start('a'),
      end('a', 'COMPLETED'),
      end('a', 'COMPLETED'),
      start('b')
    ]
    expect(() => foldTurnAnalysis(EMPTY_TURN_ANALYSIS, log)).toThrow(
      /more than one turn\/end/
    )
    const deferred: { error?: unknown } = {}
    foldTurnAnalysis(EMPTY_TURN_ANALYSIS, log, { deferred })
    expect(deferred.error).toBeInstanceOf(SessionPersistenceCorruptionError)
  })
})

describe('PJ01: the pure projection', () => {
  it('starts empty and an empty log is the empty projection', () => {
    expect(projectSession([])).toEqual(emptySessionProjection())
    const empty = emptySessionProjection()
    expect(empty).toMatchObject({
      version: SESSION_PROJECTION_VERSION,
      throughSequence: 0,
      turns: { total: 0, completed: 0, ended: 0, open: 0 },
      inheritableThrough: 0
    })
    expect(empty.lastTurn).toBeUndefined()
    expect(currentStops(empty)).toEqual([])
  })

  it('counts turns by state, leaves the compaction marker out and keeps the cut for it', () => {
    reset()
    const log = [
      user('c1'),
      start('c1'),
      end('c1', 'COMPLETED'),
      assistant('c1'),
      compacted('cmp', 2),
      start('c2'),
      end('c2', 'APPROVAL_REQUIRED'),
      start('c3')
    ]
    const p = projectSession(log)
    expect(p.turns).toEqual({ total: 3, completed: 1, ended: 1, open: 1 })
    expect(p.lastTurn).toMatchObject({ correlationId: 'c3', state: 'open' })
    // c1 completed, the marker is atomic and completed, c2 ended: the cut is at the marker
    expect(p.inheritableThrough).toBe(5)
    expect(p.inheritableThrough).toBe(analyzeSessionLog(log).inheritableThrough)
  })

  it('when the last group is a marker, the last turn is the last real one', () => {
    reset()
    const log = [
      start('c1'),
      end('c1', 'APPROVAL_REQUIRED'),
      compacted('cmp', 1)
    ]
    const p = projectSession(log)
    expect(p.lastTurn?.correlationId).toBe('c1')
    expect(p.turns.total).toBe(1)
    expect(p.inheritableThrough).toBe(analyzeSessionLog(log).inheritableThrough)
  })

  it('a group that grows past a marker is a turn again', () => {
    reset()
    const log = [
      start('w'),
      compacted('x', 1),
      start('x'),
      end('x', 'COMPLETED')
    ]
    expect(projectSession(log).turns.total).toBe(2)
  })

  it('records the compaction as the value written in the event, the latest by sequence, and counts all', () => {
    reset()
    const log = [
      start('a'),
      end('a', 'COMPLETED'),
      compacted('m1', 7),
      start('b'),
      compacted('m2', 1)
    ]
    const p = projectSession(log)
    expect(p.compaction).toEqual({
      throughSequence: 1,
      source: { sequence: 5, eventId: log[4]!.eventId },
      count: 2
    })
  })
})

describe('PJ01/PJ02: stops and their origins', () => {
  it('records final stops with the turn/end as origin and exact totals', () => {
    reset()
    const log = [
      start('a'),
      end('a', 'APPROVAL_REQUIRED'),
      start('b'),
      end('b', 'NEEDS_USER_INPUT'),
      start('c'),
      end('c', 'HUMAN_TAKEOVER'),
      start('d'),
      end('d', 'COMPLETED'),
      start('e'),
      end('e', 'INSUFFICIENT_EVIDENCE')
    ]
    const p = projectSession(log)
    expect(p.stops.total).toEqual({
      approval_required: 1,
      needs_user_input: 1,
      human_takeover: 1
    })
    for (const stop of currentStops(p)) {
      const origin = log[stop.source.sequence - 1]!
      expect(origin.eventId).toBe(stop.source.eventId)
      expect(origin.type).toBe('turn/end')
      expect(origin.correlationId).toBe(stop.correlationId)
    }
    expect(currentStops(p).map((s) => s.kind)).toEqual([
      'approval_required',
      'needs_user_input',
      'human_takeover'
    ])
  })

  it('derives the transitional stops from the open group, with the turn/start and the tool/call as origin', () => {
    reset()
    const log = [
      user('a'),
      start('a'),
      call('a', 't', 'k1'),
      call('a', 't', 'k2'),
      result('a', 't', 'succeeded')
    ]
    const stops = currentStops(projectSession(log))
    expect(stops.map((s) => [s.kind, s.operationKey ?? null])).toEqual([
      ['open_turn', null],
      ['uncertain_effect', 'k2']
    ])
    expect(log[stops[0]!.source.sequence - 1]!.type).toBe('turn/start')
    expect(log[stops[1]!.source.sequence - 1]!.type).toBe('tool/call')
    expect(log[stops[1]!.source.sequence - 1]!.eventId).toBe(
      stops[1]!.source.eventId
    )
  })

  it('an open group with no turn/start has its first event as origin, and a turn/start that comes later takes over', () => {
    reset()
    const noStart = [user('a')]
    expect(currentStops(projectSession(noStart))[0]!.source.sequence).toBe(1)
    reset()
    const later = [user('a'), start('a'), start('a')]
    expect(currentStops(projectSession(later))[0]!.source.sequence).toBe(2)
  })

  it('an effect resolved in the tail is no longer uncertain, and one resolved as uncertain stays', () => {
    reset()
    const base = [start('a'), call('a', 't', 'k')]
    const ok = result('a', 't', 'succeeded')
    const lostResult = { ...result('a', 't', 'deadline'), sequence: 3 }
    const finish = { ...end('a', 'COMPLETED'), sequence: 4 }
    const head = projectSession(base)
    expect(currentStops(head).map((s) => s.kind)).toContain('uncertain_effect')
    const resolved = foldSessionProjection(head, [ok])
    expect(currentStops(resolved).map((s) => s.kind)).toEqual(['open_turn'])
    expect(resolved).toEqual(projectSession([...base, ok]))
    const kinds = currentStops(
      foldSessionProjection(head, [lostResult, finish])
    )
    expect(kinds.map((s) => s.kind)).toEqual(['uncertain_effect'])
  })

  it('a compaction marker shows no stop', () => {
    reset()
    expect(
      currentStops(
        projectSession([start('a'), end('a', 'COMPLETED'), compacted('m', 1)])
      )
    ).toEqual([])
  })

  it('keeps a bounded tail per kind and counts everything', () => {
    reset()
    const log: SessionEvent[] = []
    const N = SESSION_PROJECTION_RECENT_STOPS
    for (let i = 0; i < N + 5; i++) {
      log.push(start(`a${i}`), end(`a${i}`, 'APPROVAL_REQUIRED'))
      if (i < 3) log.push(start(`h${i}`), end(`h${i}`, 'HUMAN_TAKEOVER'))
    }
    const p = projectSession(log)
    expect(p.stops.total).toMatchObject({
      approval_required: N + 5,
      human_takeover: 3
    })
    const approvals = p.stops.recent.filter(
      (s) => s.kind === 'approval_required'
    )
    expect(approvals).toHaveLength(N)
    expect(approvals[0]!.correlationId).toBe('a5')
    expect(approvals.at(-1)!.correlationId).toBe(`a${N + 4}`)
    expect(
      p.stops.recent.filter((s) => s.kind === 'human_takeover')
    ).toHaveLength(3)
    expect(sessionProjectionStateBytes(p)).toBeLessThan(
      SESSION_PROJECTION_MAX_STATE_BYTES
    )
  })

  it('a long session does not grow the state without bound', () => {
    reset()
    const log: SessionEvent[] = []
    for (let i = 0; i < 400; i++) {
      log.push(start(`a${i}`), end(`a${i}`, 'APPROVAL_REQUIRED'))
      log.push(start(`n${i}`), end(`n${i}`, 'NEEDS_USER_INPUT'))
      log.push(start(`h${i}`), end(`h${i}`, 'HUMAN_TAKEOVER'))
    }
    const bytes = sessionProjectionStateBytes(projectSession(log))
    expect(bytes).toBeLessThan(SESSION_PROJECTION_MAX_STATE_BYTES)
    expect(bytes).toBeGreaterThan(1000)
  })
})

describe('PJ03: fold(project(1..k), k+1..n) = project(1..n)', () => {
  it('holds at every cut of 800 random analyzable logs, also in the middle of a turn and between a call and its result', () => {
    let checked = 0
    for (let seed = 1; seed <= 800; seed++) {
      const log = randomLog(seed, false)
      const whole = outcome(() => projectSession(log))
      if ('error' in whole) continue
      for (let k = 0; k <= log.length; k++) {
        const resumed = foldSessionProjection(
          projectSession(log.slice(0, k)),
          log.slice(k)
        )
        expect(resumed, `seed ${seed} cut ${k}`).toEqual(whole.ok)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(3000)
  })

  it('refuses a tail with a gap or an overlap', () => {
    reset()
    const log = [
      start('a'),
      call('a', 't', 'k'),
      result('a', 't', 'succeeded'),
      end('a', 'COMPLETED')
    ]
    const head = projectSession(log.slice(0, 2))
    expect(() => foldSessionProjection(head, log.slice(3))).toThrow(
      SessionPersistenceCorruptionError
    )
    expect(() => foldSessionProjection(head, log.slice(1))).toThrow(
      SessionPersistenceCorruptionError
    )
    expect(() =>
      foldSessionProjection(head, withSequences(log.slice(2), [3, 5]))
    ).toThrow(SessionPersistenceCorruptionError)
    void withSequences
    expect(foldSessionProjection(head, [])).toEqual(head)
  })

  it('refuses a projection of another version', () => {
    const wrong = { ...emptySessionProjection(), version: 2 as never }
    expect(() => foldSessionProjection(wrong, [])).toThrow(
      SessionPersistenceCorruptionError
    )
  })

  it('a turn id that comes back after its turn closed: the full projection refuses, the fold at that cut accepts', () => {
    reset()
    const log = [
      start('a'),
      end('a', 'COMPLETED'),
      start('b'),
      end('b', 'COMPLETED'),
      start('a')
    ]
    expect(() => projectSession(log)).toThrow(/interleaved/)
    const head = projectSession(log.slice(0, 4))
    expect(() => foldSessionProjection(head, log.slice(4))).not.toThrow()
  })

  it('refuses a turn with two turn/end, from zero and by fold', () => {
    reset()
    const log = [start('a'), end('a', 'COMPLETED'), end('a', 'COMPLETED')]
    expect(() => projectSession(log)).toThrow(/more than one turn\/end/)
    const head = projectSession(log.slice(0, 2))
    expect(() => foldSessionProjection(head, log.slice(2))).toThrow(
      /more than one turn\/end/
    )
  })

  it('does not change the projection it is given', () => {
    reset()
    const log = [
      start('a'),
      call('a', 't', 'k'),
      end('a', 'APPROVAL_REQUIRED'),
      start('b')
    ]
    const head = projectSession(log.slice(0, 2))
    const frozen = JSON.stringify(head)
    foldSessionProjection(head, log.slice(2))
    expect(JSON.stringify(head)).toBe(frozen)
  })
})

describe('PJ09/PJ10: no text, forks and compaction', () => {
  it('carries no message text, summary or tool input', () => {
    reset()
    const log = [
      user('a'),
      start('a'),
      call('a', 't', 'k'),
      end('a', 'APPROVAL_REQUIRED'),
      assistant('a'),
      compacted('m', 3)
    ]
    const text = JSON.stringify(projectSession(log))
    for (const secret of ['TEXT-a', 'ANS-a', 'SUMMARY-TEXT'])
      expect(text).not.toContain(secret)
  })

  it('the projection of a fork up to its cut is the source projection up to the same cut', () => {
    reset()
    const log = [
      user('a'),
      start('a'),
      end('a', 'COMPLETED'),
      assistant('a'),
      start('b'),
      end('b', 'APPROVAL_REQUIRED')
    ]
    const cut = analyzeSessionLog(log).inheritableThrough
    expect(cut).toBe(4)
    const inherited = log
      .slice(0, cut)
      .map((e) => ({ ...e, sessionId: 'child' }))
    expect(projectSession(inherited)).toEqual(projectSession(log.slice(0, cut)))
  })
})

describe('golden: the reducer output for a reference log is pinned', () => {
  it('changes only together with SESSION_PROJECTION_VERSION', () => {
    reset()
    const log = [
      user('c1'),
      start('c1'),
      call('c1', 'tool-a', 'k1'),
      result('c1', 'tool-a', 'succeeded'),
      end('c1', 'COMPLETED'),
      assistant('c1'),
      start('c2'),
      end('c2', 'APPROVAL_REQUIRED'),
      compacted('cmp', 4),
      start('c3'),
      call('c3', 'tool-a', 'k3')
    ]
    expect(SESSION_PROJECTION_VERSION).toBe(1)
    const p = projectSession(log)
    expect(p.inheritableThrough).toBe(analyzeSessionLog(log).inheritableThrough)
    const snapshot = JSON.stringify(p)
    expect(snapshot).toBe(
      JSON.stringify({
        version: 1,
        throughSequence: 11,
        turns: { total: 3, completed: 1, ended: 1, open: 1 },
        lastTurn: {
          correlationId: 'c3',
          firstSequence: 10,
          lastSequence: 11,
          state: 'open',
          uncertainEffects: ['k3']
        },
        stops: {
          total: {
            approval_required: 1,
            needs_user_input: 0,
            human_takeover: 0
          },
          recent: [
            {
              kind: 'approval_required',
              correlationId: 'c2',
              source: { sequence: 8, eventId: 'e8' }
            }
          ]
        },
        inheritableThrough: 6,
        compaction: {
          throughSequence: 4,
          source: { sequence: 9, eventId: 'e9' },
          count: 1
        },
        open: {
          correlationId: 'c3',
          firstSequence: 10,
          lastSequence: 11,
          start: { sequence: 10, eventId: 'e10' },
          startType: 'turn/start',
          openCalls: [
            ['tool-a', [{ operationKey: 'k3', sequence: 11, eventId: 'e11' }]]
          ],
          uncertain: [],
          hasUser: false,
          hasAssistant: false,
          onlyMarkers: false,
          endCount: 0
        },
        closed: {
          completed: 1,
          ended: 1,
          open: 0,
          inheritable: 6,
          broken: true,
          last: {
            correlationId: 'c2',
            firstSequence: 7,
            lastSequence: 8,
            state: 'ended',
            stopReason: 'APPROVAL_REQUIRED',
            uncertainEffects: []
          }
        }
      })
    )
  })
})
