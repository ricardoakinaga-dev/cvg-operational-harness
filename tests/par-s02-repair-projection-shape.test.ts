// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- states are patched field by field in the tables below */
import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventAppend } from '@cvg/harness-contracts'
import {
  foldSessionProjection,
  judgeSessionCheckpoint,
  materializeSessionEvent,
  projectSession,
  sessionCheckpointRow,
  sessionProjectionStateDigest
} from '../packages/harness/src/session/index.ts'

// PAR-S02 repair (SPEC 0292 I1, review finding S02-S12-F02): a checkpoint is served only when the
// state it carries is the structure the reducer reads, not only a digest-consistent object.
// Synthetic data only.
let n = 0
const ev = (
  type: SessionEventAppend['type'],
  c: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: 't',
      sessionId: 's',
      formatVersion: 1,
      eventId: `e${n + 1}`,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId: c,
      traceId: 'tr',
      type,
      payload
    } as SessionEventAppend,
    ++n
  )
const call = (c: string, key: string, tool = 'tool.a') =>
  ev('tool/call', c, {
    correlationId: c,
    toolId: tool,
    operationKey: key,
    input: {}
  })

/** Every field of the projection is present: a closed turn, an uncertain effect, a compaction, a stop, and an open group with calls. */
const richLog = (): SessionEvent[] => {
  n = 0
  return [
    ev('turn/start', 'a', { correlationId: 'a' }),
    ev('message/user', 'a', { text: 'x' }),
    call('a', 'k1'),
    ev('tool/result', 'a', {
      correlationId: 'a',
      toolId: 'tool.a',
      outcome: 'deadline'
    }),
    ev('turn/end', 'a', {
      correlationId: 'a',
      stopReason: 'APPROVAL_REQUIRED'
    }),
    ev('turn/start', 'b', { correlationId: 'b' }),
    ev('turn/end', 'b', { correlationId: 'b', stopReason: 'COMPLETED' }),
    ev('context/compacted', 'b', {
      throughSequence: 2,
      summary: 's',
      sourceDigest: 'd'.repeat(64),
      strategyVersion: 'v1'
    }),
    ev('turn/start', 'c', { correlationId: 'c' }),
    ev('message/user', 'c', { text: 'y' }),
    ev('message/assistant', 'c', { text: 'z' }),
    call('c', 'k2'),
    call('c', 'k3', 'tool.b')
  ]
}
const HEADER = '{"version":1,"id":"s","createdAt":1,"isSeeded":false}'
const rich = () => projectSession(richLog())
const judged = (state: any, through = state.throughSequence) =>
  judgeSessionCheckpoint(
    {
      projectionVersion: 1,
      throughSequence: through,
      tailInputDigest: 'd'.repeat(64),
      headerDigest: sessionCheckpointRow(rich(), HEADER, 'd'.repeat(64))
        .headerDigest,
      state,
      stateDigest: sessionProjectionStateDigest(state)
    },
    { headerText: HEADER, head: 13 }
  )
const clone = (): any => JSON.parse(JSON.stringify(rich()))

describe('judgeSessionCheckpoint: the state must be the structure the reducer reads', () => {
  it('the fixture really has every optional part, so the table below is not vacuous', () => {
    const p: any = rich()
    expect(p.lastTurn).toBeDefined()
    expect(p.compaction).toBeDefined()
    expect(p.open?.openCalls.length).toBe(2)
    expect(p.closed.last).toBeDefined()
    expect(p.stops.recent.length).toBeGreaterThan(0)
    expect(p.open.start).toBeDefined()
  })

  it('accepts the state the reducer produced, at every prefix of the log (the guard never refuses a real state)', () => {
    const events = richLog()
    for (let through = 1; through <= events.length; through += 1) {
      const state: any = projectSession(events.slice(0, through))
      expect(judged(state)).toEqual({ ok: true, projection: state })
    }
  })

  it('accepts a state whose closed turn never ended (no stopReason) and one that was interleaved', () => {
    n = 0
    const events = [
      ev('turn/start', 'a', { correlationId: 'a' }),
      ev('message/user', 'a', { text: 'x' }),
      ev('turn/start', 'b', { correlationId: 'b' }),
      ev('turn/end', 'b', {
        correlationId: 'b',
        stopReason: 'NEEDS_USER_INPUT'
      }),
      ev('turn/start', 'c', { correlationId: 'c' })
    ]
    for (let through = 1; through <= events.length; through += 1) {
      const state: any = projectSession(events.slice(0, through))
      expect(judged(state)).toEqual({ ok: true, projection: state })
    }
    const last: any = projectSession(events)
    expect(last.closed.last?.state).toBeDefined()
  })

  it('accepts the state without its optional parts (lastTurn, compaction, open, closed.last, operationKey)', () => {
    const state = clone()
    delete state.lastTurn
    delete state.compaction
    delete state.open
    delete state.closed.last
    for (const stop of state.stops.recent) delete stop.operationKey
    expect(judged(state)).toMatchObject({ ok: true })
  })

  it('accepts a stop that carries a text operationKey and refuses one that carries a number', () => {
    const state = clone()
    state.stops.recent[0].operationKey = 'k1'
    expect(judged(state)).toMatchObject({ ok: true })
    state.stops.recent[0].operationKey = 7
    expect(judged(state)).toEqual({ ok: false, reason: 'state is malformed' })
  })

  const wipe = (path: readonly (string | number)[], value: unknown) => {
    const state = clone()
    let at = state
    for (const key of path.slice(0, -1)) at = at[key]
    if (value === undefined) delete at[path[path.length - 1]!]
    else at[path[path.length - 1]!] = value
    return state
  }
  const BAD: Array<[string, readonly (string | number)[], unknown]> = [
    ['open as an empty object', ['open'], {}],
    ['open as a string', ['open'], 'x'],
    ['open without correlationId', ['open', 'correlationId'], undefined],
    ['open without firstSequence', ['open', 'firstSequence'], undefined],
    ['open with a negative lastSequence', ['open', 'lastSequence'], -1],
    ['open without start', ['open', 'start'], undefined],
    ['open with a start without eventId', ['open', 'start', 'eventId'], 3],
    ['open without startType', ['open', 'startType'], undefined],
    ['open with openCalls as a record', ['open', 'openCalls'], {}],
    [
      'open with an openCalls pair of three',
      ['open', 'openCalls', 0],
      ['a', [], 1]
    ],
    [
      'open with an openCalls pair without tool',
      ['open', 'openCalls', 0],
      [1, []]
    ],
    [
      'open with a call without operationKey',
      ['open', 'openCalls', 0, 1, 0, 'operationKey'],
      undefined
    ],
    [
      'open with a call whose sequence is a string',
      ['open', 'openCalls', 0, 1, 0, 'sequence'],
      '1'
    ],
    ['open without uncertain', ['open', 'uncertain'], undefined],
    [
      'open with uncertain entries that are strings',
      ['open', 'uncertain'],
      ['k1']
    ],
    ['open without hasUser', ['open', 'hasUser'], undefined],
    ['open with hasAssistant as a number', ['open', 'hasAssistant'], 1],
    ['open without onlyMarkers', ['open', 'onlyMarkers'], undefined],
    ['open without endCount', ['open', 'endCount'], undefined],
    [
      'open with an end without sequence',
      ['open', 'end'],
      { stopReason: 'COMPLETED' }
    ],
    ['version of another code', ['version'], 2],
    ['throughSequence as a string', ['throughSequence'], '13'],
    ['negative inheritableThrough', ['inheritableThrough'], -1],
    ['turns as an array', ['turns'], []],
    ['turns without completed', ['turns', 'completed'], undefined],
    ['turns without ended', ['turns', 'ended'], undefined],
    ['turns without open', ['turns', 'open'], undefined],
    ['turns without total', ['turns', 'total'], undefined],
    ['lastTurn as an empty object', ['lastTurn'], {}],
    ['lastTurn with an unknown state', ['lastTurn', 'state'], 'paused'],
    [
      'lastTurn with uncertainEffects as a string',
      ['lastTurn', 'uncertainEffects'],
      'k1'
    ],
    ['lastTurn with a numeric stopReason', ['lastTurn', 'stopReason'], 3],
    ['stops as a string', ['stops'], 'x'],
    ['stops without total', ['stops', 'total'], undefined],
    [
      'stops.total without a kind',
      ['stops', 'total', 'human_takeover'],
      undefined
    ],
    [
      'stops.total with a negative kind',
      ['stops', 'total', 'approval_required'],
      -1
    ],
    ['stops.recent as a record', ['stops', 'recent'], {}],
    [
      'a stop with a kind that is not final',
      ['stops', 'recent', 0, 'kind'],
      'open_turn'
    ],
    ['a stop without source', ['stops', 'recent', 0, 'source'], undefined],
    [
      'a stop with a source sequence that is a string',
      ['stops', 'recent', 0, 'source', 'sequence'],
      'x'
    ],
    [
      'a stop with a numeric correlationId',
      ['stops', 'recent', 0, 'correlationId'],
      1
    ],
    ['compaction as an empty object', ['compaction'], {}],
    ['compaction without count', ['compaction', 'count'], undefined],
    ['compaction without source', ['compaction', 'source'], undefined],
    ['closed as an array', ['closed'], []],
    ['closed without completed', ['closed', 'completed'], undefined],
    ['closed without ended', ['closed', 'ended'], undefined],
    ['closed without open', ['closed', 'open'], undefined],
    ['closed without inheritable', ['closed', 'inheritable'], undefined],
    ['closed without broken', ['closed', 'broken'], undefined],
    ['closed.last as an empty object', ['closed', 'last'], {}]
  ]
  it.each(BAD)(
    'refuses %s even when its digest is recomputed',
    (_name, path, value) => {
      const state = wipe(path, value)
      const verdict = judged(state)
      expect(verdict).toEqual({ ok: false, reason: 'state is malformed' })
    }
  )

  it('a refused state is a rebuild: folding it would have thrown, which is the symptom of the finding', () => {
    const state = wipe(['open'], {})
    expect(() => foldSessionProjection(state, [call('c', 'k9')])).toThrow()
  })
})
