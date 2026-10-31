// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- error fields are read dynamically */
import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventAppend } from '@cvg/harness-contracts'
import {
  materializeSessionEvent,
  sessionEventInputDigest,
  validateSessionHeader
} from '../packages/harness/src/session/index.ts'
import * as session from '../packages/harness/src/session/index.ts'

// PAR-S04 (SPEC 0287): the pure half of fork and resume. Born as `it.fails` RED witnesses in
// phase 1; the markers came off in BUILD slice 1 without weakening any assertion.
// Controls (unmarked) pin the S01 starting point that must keep holding.
const api = session as unknown as Record<string, any>
const TENANT = 'tenant-synthetic-A'
const SOURCE = 'source-session'
const TARGET = 'fork-session'

let sequence = 0
const event = (
  type: SessionEventAppend['type'],
  correlationId: string,
  payload: Record<string, unknown>,
  sessionId = SOURCE
): SessionEvent => {
  sequence += 1
  return materializeSessionEvent(
    {
      tenantId: TENANT,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-e${sequence}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as SessionEventAppend,
    sequence
  )
}
const turn = (
  correlationId: string,
  options: {
    stop?: string
    tool?: { operationKey: string; outcome?: string }
    assistant?: boolean
    end?: boolean
  } = {}
): SessionEvent[] => {
  const out = [
    event('message/user', correlationId, { text: `ask ${correlationId}` }),
    event('turn/start', correlationId, { correlationId })
  ]
  if (options.tool) {
    out.push(
      event('tool/call', correlationId, {
        correlationId,
        toolId: 'tool-a',
        operationKey: options.tool.operationKey,
        input: {}
      })
    )
    if (options.tool.outcome)
      out.push(
        event('tool/result', correlationId, {
          correlationId,
          toolId: 'tool-a',
          outcome: options.tool.outcome
        })
      )
  }
  if (options.end !== false)
    out.push(
      event('turn/end', correlationId, {
        correlationId,
        stopReason: options.stop ?? 'COMPLETED'
      })
    )
  if (
    (options.stop ?? 'COMPLETED') === 'COMPLETED' &&
    options.assistant !== false &&
    options.end !== false
  )
    out.push(
      event('message/assistant', correlationId, {
        text: `answer ${correlationId}`
      })
    )
  return out
}
/** Builds fresh each time so sequences start at 1. */
const fixture = () => {
  sequence = 0
  const t1 = turn('c1', { tool: { operationKey: 'k1', outcome: 'succeeded' } })
  const t2 = turn('c2')
  const t3 = turn('c3', { stop: 'APPROVAL_REQUIRED' })
  const t4 = turn('c4', { tool: { operationKey: 'k4' }, end: false })
  return [...t1, ...t2, ...t3, ...t4]
}

describe('PAR-S04 phase 1: controls on the S01 starting point', () => {
  it('a seeded header with a cut larger than an empty body is accepted, so "seeded" alone proves nothing', () => {
    const out = validateSessionHeader(
      {
        version: 1,
        id: TARGET,
        createdAt: 1,
        isSeeded: true,
        parentSession: SOURCE
      },
      3
    )
    expect(out.inheritedEventCount).toBe(3)
    expect(out.header.parentSession).toBe(SOURCE)
  })
  it('extra header metadata (a forged lineage block) is kept losslessly and carries no authority', () => {
    const out = validateSessionHeader(
      {
        version: 1,
        id: TARGET,
        createdAt: 1,
        isSeeded: true,
        lineage: { source: 'someone', depth: 99 }
      },
      0
    )
    expect((out.header as unknown as Record<string, unknown>).lineage).toEqual({
      source: 'someone',
      depth: 99
    })
  })
  it('the event envelope groups a turn by correlationId, user and assistant messages included', () => {
    const events = fixture()
    expect(new Set(events.slice(0, 6).map((e) => e.correlationId))).toEqual(
      new Set(['c1'])
    )
    expect(events[0]!.type).toBe('message/user')
    expect(events[5]!.type).toBe('message/assistant')
  })
})

describe('PAR-S04 phase 1: analysis of the session log (SPEC 0287 §3)', () => {
  it('classifies completed, ended and open turns and finds the inheritable prefix', () => {
    const analysis = api.analyzeSessionLog(fixture())
    expect(analysis.turns.map((t: any) => [t.correlationId, t.state])).toEqual([
      ['c1', 'completed'],
      ['c2', 'completed'],
      ['c3', 'ended'],
      ['c4', 'open']
    ])
    expect(analysis.turns[2].stopReason).toBe('APPROVAL_REQUIRED')
    expect(analysis.inheritableThrough).toBe(analysis.turns[1].lastSequence)
    expect(analysis.openTurn.correlationId).toBe('c4')
    expect(analysis.openTurn.uncertainEffects).toEqual(['k4'])
  })

  it('a completed turn with an uncertain effect closes the inheritable prefix before it', () => {
    sequence = 0
    const events = [
      ...turn('c1'),
      ...turn('c2', { tool: { operationKey: 'k2', outcome: 'deadline' } }),
      ...turn('c3')
    ]
    const analysis = api.analyzeSessionLog(events)
    expect(analysis.turns[1].state).toBe('completed')
    expect(analysis.turns[1].uncertainEffects).toEqual(['k2'])
    expect(analysis.inheritableThrough).toBe(analysis.turns[0].lastSequence)
  })

  it.each(['deadline', 'cancelled', 'threw', 'confirm_failed'])(
    'the outcome %s is uncertain, a missing result too',
    (outcome) => {
      sequence = 0
      const analysis = api.analyzeSessionLog([
        ...turn('c1', { tool: { operationKey: 'k', outcome } })
      ])
      expect(analysis.turns[0].uncertainEffects).toEqual(['k'])
      expect(analysis.inheritableThrough).toBe(0)
    }
  )

  it.each(['succeeded', 'failed', 'not_started'])(
    'the outcome %s is certain and does not block inheritance',
    (outcome) => {
      sequence = 0
      const events = [...turn('c1', { tool: { operationKey: 'k', outcome } })]
      const analysis = api.analyzeSessionLog(events)
      expect(analysis.turns[0].uncertainEffects).toEqual([])
      expect(analysis.inheritableThrough).toBe(events.length)
    }
  )

  it('a user message without its assistant answer is not a completed turn (crash between the two)', () => {
    sequence = 0
    const events = [...turn('c1', { assistant: false })]
    const analysis = api.analyzeSessionLog(events)
    expect(analysis.turns[0].state).toBe('ended')
    expect(analysis.inheritableThrough).toBe(0)
  })

  it('an empty log has nothing to inherit', () => {
    expect(api.analyzeSessionLog([])).toMatchObject({
      turns: [],
      inheritableThrough: 0
    })
  })
})

describe('PAR-S04 phase 1: planning a fork (SPEC 0287 §4)', () => {
  it('copies the completed prefix without renumbering and swaps only the session id', () => {
    const source = fixture()
    const before = JSON.stringify(source)
    const plan = api.planSessionFork(source, { targetSessionId: TARGET })
    expect(plan.cutSequence).toBe(10)
    expect(plan.inherited).toHaveLength(10)
    plan.inherited.forEach((copy: SessionEvent, i: number) => {
      const original = source[i]!
      expect(copy.sessionId).toBe(TARGET)
      expect(copy.tenantId).toBe(TENANT)
      expect(copy.sequence).toBe(original.sequence)
      expect(copy.eventId).toBe(original.eventId)
      expect(copy.correlationId).toBe(original.correlationId)
      expect(copy.traceId).toBe(original.traceId)
      expect(copy.timestamp).toBe(original.timestamp)
      expect(copy.type).toBe(original.type)
      expect(copy.payload).toEqual(original.payload)
      const { sequence: _s, schemaFingerprint: _f, ...input } = copy
      void _s
      void _f
      // A valid event of the target session: its digest is computable from its own input.
      expect(sessionEventInputDigest(input)).toMatch(/^[a-f0-9]{64}$/)
    })
    expect(JSON.stringify(source)).toBe(before)
    expect(plan.lineage).toMatchObject({
      source: SOURCE,
      cutSequence: 10,
      depth: 1
    })
    expect(plan.lineage.sourceDigest).toMatch(/^[a-f0-9]{64}$/)
  })

  it('keeps a compaction marker pointing at the right sequence', () => {
    sequence = 0
    const t1 = turn('c1')
    const compacted = event('context/compacted', 'cmp', {
      throughSequence: t1.length,
      summary: 'short',
      sourceDigest: 'a'.repeat(64),
      strategyVersion: 'v1'
    })
    const plan = api.planSessionFork([...t1, compacted, ...turn('c2')], {
      targetSessionId: TARGET
    })
    const copy = plan.inherited.find(
      (e: SessionEvent) => e.type === 'context/compacted'
    )
    expect(copy.sequence).toBe(t1.length + 1)
    expect((copy.payload as any).throughSequence).toBe(t1.length)
  })

  it('can be asked to stop at the end of a given completed turn', () => {
    const plan = api.planSessionFork(fixture(), {
      targetSessionId: TARGET,
      through: { correlationId: 'c1' }
    })
    expect(plan.cutSequence).toBe(6)
    expect(plan.inherited).toHaveLength(6)
  })

  it.each([
    ['an ended turn', { correlationId: 'c3' }, 'fork_cut_not_inheritable'],
    ['an open turn', { correlationId: 'c4' }, 'fork_cut_not_inheritable'],
    ['an unknown turn', { correlationId: 'nope' }, 'fork_cut_unknown_turn']
  ])('refuses a cut at %s', (_name, through, code) => {
    let error: any
    try {
      api.planSessionFork(fixture(), { targetSessionId: TARGET, through })
    } catch (e) {
      error = e
    }
    expect(error?.name).toBe('SessionForkRefusedError')
    expect(error.code).toBe(code)
  })

  it('refuses when nothing can be inherited', () => {
    sequence = 0
    let error: any
    try {
      api.planSessionFork([...turn('c1', { stop: 'APPROVAL_REQUIRED' })], {
        targetSessionId: TARGET
      })
    } catch (e) {
      error = e
    }
    expect(error?.name).toBe('SessionForkRefusedError')
    expect(error.code).toBe('fork_nothing_to_inherit')
  })

  it('never inherits past a turn that is not completed, even when later turns are', () => {
    sequence = 0
    const events = [
      ...turn('c1'),
      ...turn('c2', { stop: 'APPROVAL_REQUIRED' }),
      ...turn('c3')
    ]
    const plan = api.planSessionFork(events, { targetSessionId: TARGET })
    expect(plan.cutSequence).toBe(4)
    expect(plan.inherited.map((e: SessionEvent) => e.correlationId)).toEqual(
      Array(4).fill('c1')
    )
  })

  it('does not carry the pending approval, the open turn or its uncertain effect', () => {
    const plan = api.planSessionFork(fixture(), { targetSessionId: TARGET })
    const copied = JSON.stringify(plan.inherited)
    expect(
      new Set(plan.inherited.map((e: SessionEvent) => e.correlationId))
    ).toEqual(new Set(['c1', 'c2']))
    expect(copied).not.toContain('"k4"')
    expect(copied).not.toContain('APPROVAL_REQUIRED')
  })

  it('refuses a target that is the source itself', () => {
    let error: any
    try {
      api.planSessionFork(fixture(), { targetSessionId: SOURCE })
    } catch (e) {
      error = e
    }
    expect(error?.name).toBe('SessionForkRefusedError')
    expect(error.code).toBe('fork_target_is_source')
  })
})

describe('PAR-S04 phase 1: the public surface', () => {
  it('exposes the pure functions and the refusal errors', () => {
    expect(typeof api.analyzeSessionLog).toBe('function')
    expect(typeof api.planSessionFork).toBe('function')
    expect(typeof api.SessionForkRefusedError).toBe('function')
    expect(typeof api.SessionPersistenceCorruptionError).toBe('function')
  })
})
