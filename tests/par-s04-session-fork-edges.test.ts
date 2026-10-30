// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type {
  SessionEvent,
  SessionEventAppend,
  SessionHeaderV1
} from '@cvg/harness-contracts'
import {
  SESSION_FORK_MAX_DEPTH,
  SessionForkRefusedError,
  SessionPersistenceCorruptionError,
  analyzeSessionLog,
  checkSessionFork,
  materializeSessionEvent,
  planSessionFork,
  sessionEventInputDigest,
  sessionForkSourceDigest
} from '../packages/harness/src/session/index.ts'

// PAR-S04 slice 1: edges of the pure functions that the SPEC 0287 witnesses do not reach.
const SOURCE = 's-src'
let n = 0
const ev = (
  type: SessionEventAppend['type'],
  correlationId: string,
  payload: Record<string, unknown>,
  sequence = ++n
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: 't',
      sessionId: SOURCE,
      formatVersion: 1,
      eventId: `e${sequence}-${correlationId}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId,
      traceId: 'tr',
      type,
      payload
    } as SessionEventAppend,
    sequence
  )
const done = (c: string): SessionEvent[] => [
  ev('turn/start', c, { correlationId: c }),
  ev('turn/end', c, { correlationId: c, stopReason: 'COMPLETED' })
]
const call = (c: string, toolId: string, operationKey: string) =>
  ev('tool/call', c, { correlationId: c, toolId, operationKey, input: {} })
const result = (c: string, toolId: string, outcome: string) =>
  ev('tool/result', c, { correlationId: c, toolId, outcome })

describe('PAR-S04 slice 1: analyzeSessionLog edges', () => {
  it('refuses a log whose sequences have a gap or do not start at 1', () => {
    n = 1
    expect(() => analyzeSessionLog(done('c1'))).toThrow(
      SessionPersistenceCorruptionError
    )
    n = 0
    const log = done('c1')
    expect(() =>
      analyzeSessionLog([
        log[0]!,
        log[1]!,
        ev('turn/start', 'c2', { correlationId: 'c2' }, 4)
      ])
    ).toThrow(SessionPersistenceCorruptionError)
  })
  it('refuses interleaved turns, since no prefix cut would be honest', () => {
    n = 0
    const log = [
      ev('turn/start', 'a', { correlationId: 'a' }),
      ev('turn/start', 'b', { correlationId: 'b' }),
      ev('turn/end', 'a', { correlationId: 'a', stopReason: 'COMPLETED' })
    ]
    expect(() => analyzeSessionLog(log)).toThrow(
      SessionPersistenceCorruptionError
    )
  })
  it('refuses a turn with two turn/end events', () => {
    n = 0
    const log = [
      ...done('a'),
      ev('turn/end', 'a', { correlationId: 'a', stopReason: 'COMPLETED' })
    ]
    expect(() => analyzeSessionLog(log)).toThrow(
      SessionPersistenceCorruptionError
    )
  })
  it('pairs results with calls per tool in order and keeps unpaired calls uncertain', () => {
    n = 0
    const log = [
      ev('turn/start', 'a', { correlationId: 'a' }),
      call('a', 't1', 'k1'),
      call('a', 't1', 'k2'),
      call('a', 't2', 'k3'),
      result('a', 't1', 'succeeded'), // closes k1
      result('a', 't1', 'deadline'), // k2 is uncertain
      result('a', 'orphan', 'threw'), // no call: ignored
      ev('turn/end', 'a', { correlationId: 'a', stopReason: 'COMPLETED' })
    ]
    const analysis = analyzeSessionLog(log)
    expect(analysis.turns[0]!.uncertainEffects).toEqual(['k2', 'k3'])
    expect(analysis.inheritableThrough).toBe(0)
  })
  it('treats a lone compaction marker as an atomic completed group', () => {
    n = 0
    const log = [
      ...done('a'),
      ev('context/compacted', 'cmp', {
        throughSequence: 2,
        summary: 's',
        sourceDigest: 'a'.repeat(64),
        strategyVersion: 'v1'
      })
    ]
    const analysis = analyzeSessionLog(log)
    expect(analysis.turns.map((t) => t.state)).toEqual([
      'completed',
      'completed'
    ])
    expect(analysis.inheritableThrough).toBe(3)
  })
  it('reports the most recent open turn and stops the prefix at the first open one', () => {
    n = 0
    const log = [
      ev('turn/start', 'a', { correlationId: 'a' }),
      ...done('b'),
      ev('turn/start', 'c', { correlationId: 'c' })
    ]
    const analysis = analyzeSessionLog(log)
    expect(analysis.openTurn?.correlationId).toBe('c')
    expect(analysis.inheritableThrough).toBe(0)
  })
  it('a COMPLETED turn/end without the assistant message of a user message is only ended', () => {
    n = 0
    const log = [ev('message/user', 'a', { text: 'hi' }), ...done('a')]
    expect(analyzeSessionLog(log).turns[0]).toMatchObject({
      state: 'ended',
      stopReason: 'COMPLETED'
    })
  })
})

describe('PAR-S04 slice 1: planSessionFork edges', () => {
  it('has a closed set of refusal codes and a message without log content', () => {
    n = 0
    const log = [ev('message/user', 'a', { text: 'secret text' }), ...done('a')]
    try {
      planSessionFork(log, { targetSessionId: 'x' })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(SessionForkRefusedError)
      expect((e as SessionForkRefusedError).code).toBe(
        'fork_nothing_to_inherit'
      )
      expect((e as Error).message).not.toContain('secret')
      expect((e as SessionForkRefusedError).sessionId).toBe(SOURCE)
    }
  })
  it('grows the depth from the source lineage and keeps its root', () => {
    n = 0
    const plan = planSessionFork(done('a'), {
      targetSessionId: 'x',
      sourceLineage: { depth: 3, root: 'origin' }
    })
    expect(plan.lineage).toMatchObject({
      depth: 4,
      root: 'origin',
      source: SOURCE
    })
  })
  it(`refuses a fork deeper than ${SESSION_FORK_MAX_DEPTH}`, () => {
    n = 0
    const log = done('a')
    expect(() =>
      planSessionFork(log, {
        targetSessionId: 'x',
        sourceLineage: { depth: SESSION_FORK_MAX_DEPTH, root: 'r' }
      })
    ).toThrow(expect.objectContaining({ code: 'fork_depth_exceeded' }))
    expect(
      planSessionFork(log, {
        targetSessionId: 'x',
        sourceLineage: { depth: SESSION_FORK_MAX_DEPTH - 1, root: 'r' }
      }).lineage.depth
    ).toBe(SESSION_FORK_MAX_DEPTH)
  })
  it('an empty log has nothing to inherit', () => {
    expect(() => planSessionFork([], { targetSessionId: 'x' })).toThrow(
      expect.objectContaining({ code: 'fork_nothing_to_inherit' })
    )
  })
  it('the source digest binds sequence and content, in order', () => {
    n = 0
    const log = done('a')
    const digest = sessionForkSourceDigest(log)
    expect(digest).toMatch(/^[a-f0-9]{64}$/)
    expect(sessionForkSourceDigest([...log].reverse())).not.toBe(digest)
    expect(sessionForkSourceDigest(log.slice(0, 1))).not.toBe(digest)
    expect(
      planSessionFork(log, { targetSessionId: 'x' }).lineage.sourceDigest
    ).toBe(digest)
  })
  it('the source digest is the documented hash of the ordered sequence:input_digest lines', () => {
    n = 0
    const log = done('a')
    const lines = log.map((e) => {
      const { sequence, schemaFingerprint: _f, ...input } = e
      void _f
      return `${sequence}:${sessionEventInputDigest(input)}`
    })
    expect(sessionForkSourceDigest(log)).toBe(
      createHash('sha256').update(lines.join('\n')).digest('hex')
    )
  })
  it('refuses a cut at a one-event open turn right after the inheritable prefix', () => {
    n = 0
    const log = [...done('a'), ev('turn/start', 'b', { correlationId: 'b' })]
    expect(() =>
      planSessionFork(log, {
        targetSessionId: 'x',
        through: { correlationId: 'b' }
      })
    ).toThrow(expect.objectContaining({ code: 'fork_cut_not_inheritable' }))
  })
  it('does not mutate its input and returns copies that do not alias the source', () => {
    n = 0
    const log = done('a')
    const plan = planSessionFork(log, { targetSessionId: 'x' })
    expect(log.every((e) => e.sessionId === SOURCE)).toBe(true)
    expect(plan.inherited[0]).not.toBe(log[0])
  })
})

describe('PAR-S04 slice 2: checkSessionFork', () => {
  const header = (id: string, extra: Record<string, unknown> = {}) =>
    ({
      version: 1,
      id,
      createdAt: 1,
      isSeeded: false,
      ...extra
    }) as unknown as SessionHeaderV1
  const setup = () => {
    n = 0
    const events = [
      ev('message/user', 'a', { text: 'hi' }),
      ...done('a'),
      ev('message/assistant', 'a', { text: 'yo' }),
      ev('turn/start', 'b', { correlationId: 'b' })
    ]
    const plan = planSessionFork(events, { targetSessionId: 'child' })
    const lineage = { ...plan.lineage }
    const source = { header: header(SOURCE), events }
    const child = {
      header: header('child', {
        isSeeded: true,
        parentSession: SOURCE,
        lineage
      }),
      inheritedEventCount: plan.cutSequence,
      events: [...plan.inherited]
    }
    return { source, child, plan }
  }
  const withLineage = (
    child: ReturnType<typeof setup>['child'],
    patch: object
  ) => ({
    ...child,
    header: header('child', {
      isSeeded: true,
      parentSession: SOURCE,
      lineage: { ...(child.header.lineage as object), ...patch }
    })
  })

  it('accepts exactly what the planner produced', () => {
    const { source, child } = setup()
    expect(checkSessionFork(source, child)).toEqual([])
  })
  it('names each way a child can be wrong', () => {
    const { source, child } = setup()
    const text = (c: Parameters<typeof checkSessionFork>[1]) =>
      checkSessionFork(source, c).join('|')
    expect(
      text({
        ...child,
        header: header('child', { ...child.header, isSeeded: false })
      })
    ).toMatch(/not seeded/)
    expect(
      text({
        ...child,
        header: header('child', {
          isSeeded: true,
          lineage: child.header.lineage
        })
      })
    ).toMatch(/parentSession/)
    for (const bad of [
      null,
      [],
      'x',
      { source: SOURCE },
      { ...(child.header.lineage as object), depth: 1.5 }
    ])
      expect(
        text({
          ...child,
          header: header('child', {
            isSeeded: true,
            parentSession: SOURCE,
            lineage: bad
          })
        })
      ).toMatch(/no well-formed lineage/)
    expect(text({ ...child, inheritedEventCount: 0 })).toMatch(/cut is empty/)
    expect(text({ ...child, inheritedEventCount: 99 })).toMatch(
      /exceeds its body/
    )
    expect(
      checkSessionFork(
        { ...source, events: source.events.slice(0, 2) },
        child
      ).join()
    ).toMatch(/exceeds the source/)
    expect(text(withLineage(child, { source: 'other' }))).toMatch(
      /lineage source/
    )
    expect(text(withLineage(child, { cutSequence: 3 }))).toMatch(/lineage cut/)
    expect(text(withLineage(child, { depth: 2 }))).toMatch(
      /lineage depth differs/
    )
    expect(text(withLineage(child, { root: 'other' }))).toMatch(/lineage root/)
    expect(text(withLineage(child, { sourceDigest: 'f'.repeat(64) }))).toMatch(
      /digest differs/
    )
  })
  it('checks depth against the source lineage and the limit', () => {
    const { source, child } = setup()
    const deep = {
      ...source,
      header: header(SOURCE, {
        lineage: {
          source: 'r',
          cutSequence: 1,
          sourceDigest: 'd',
          depth: SESSION_FORK_MAX_DEPTH,
          root: 'r'
        }
      })
    }
    expect(
      checkSessionFork(
        deep,
        withLineage(child, { depth: SESSION_FORK_MAX_DEPTH + 1, root: 'r' })
      ).join()
    ).toMatch(/exceeds the limit/)
    const mid = {
      ...source,
      header: header(SOURCE, {
        lineage: {
          source: 'r',
          cutSequence: 1,
          sourceDigest: 'd',
          depth: 2,
          root: 'r'
        }
      })
    }
    expect(
      checkSessionFork(mid, withLineage(child, { depth: 3, root: 'r' })).join()
    ).not.toMatch(/depth|root/)
  })
  it('finds a changed event, a swapped session id and a prefix that is not inheritable', () => {
    const { source, child } = setup()
    const changed = [...child.events]
    changed[0] = { ...changed[0]!, payload: { text: 'other' } } as never
    expect(
      checkSessionFork(source, { ...child, events: changed }).join()
    ).toMatch(/inherited event 1 differs/)
    const unswapped = [...child.events]
    unswapped[1] = { ...unswapped[1]!, sessionId: SOURCE } as never
    expect(
      checkSessionFork(source, { ...child, events: unswapped }).join()
    ).toMatch(/inherited event 2 differs/)
    // A source whose prefix ends inside an open turn is not a completed-turn prefix.
    const open = { header: header(SOURCE), events: source.events.slice(0, 2) }
    const cut2 = {
      ...child,
      inheritedEventCount: 2,
      header: header('child', {
        isSeeded: true,
        parentSession: SOURCE,
        lineage: {
          ...(child.header.lineage as object),
          cutSequence: 2,
          sourceDigest: 'x'
        }
      }),
      events: child.events.slice(0, 2)
    }
    expect(checkSessionFork(open, cut2).join()).toMatch(
      /not made of completed certain turns/
    )
    const gap = {
      header: header(SOURCE),
      events: [source.events[0]!, source.events[2]!]
    }
    expect(
      checkSessionFork(gap, {
        ...cut2,
        events: [child.events[0]!, child.events[2]!]
      }).join()
    ).toMatch(/not analyzable/)
  })
})
