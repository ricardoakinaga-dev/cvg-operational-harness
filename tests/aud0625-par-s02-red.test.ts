// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- the not-yet-existing API is reached dynamically */
import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventAppend } from '@cvg/harness-contracts'
import {
  analyzeSessionLog,
  materializeSessionEvent
} from '../packages/harness/src/session/index.ts'
import * as session from '../packages/harness/src/session/index.ts'

// PAR-S02 phase 1 (SPEC 0292): RED witnesses for the pure half of session projections. The
// `it.fails` bodies are the specification; the markers come off in BUILD, never replaced by a
// weaker check. Controls (unmarked) pin what already holds and must keep holding.
const api = session as unknown as Record<string, any>
const TENANT = 'tenant-synthetic-A'
const SESSION = 'proj-session'

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
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as SessionEventAppend,
    ++n
  )
const turn = (
  c: string,
  o: { stop?: string; tool?: [string, string?]; end?: boolean } = {}
): SessionEvent[] => {
  const out = [
    ev('message/user', c, { text: `PATIENT-TEXT ${c}` }),
    ev('turn/start', c, { correlationId: c })
  ]
  if (o.tool) {
    out.push(
      ev('tool/call', c, {
        correlationId: c,
        toolId: 'tool-a',
        operationKey: o.tool[0],
        input: {}
      })
    )
    if (o.tool[1])
      out.push(
        ev('tool/result', c, {
          correlationId: c,
          toolId: 'tool-a',
          outcome: o.tool[1]
        })
      )
  }
  if (o.end !== false) {
    out.push(
      ev('turn/end', c, { correlationId: c, stopReason: o.stop ?? 'COMPLETED' })
    )
    if ((o.stop ?? 'COMPLETED') === 'COMPLETED')
      out.push(ev('message/assistant', c, { text: `PATIENT-ANSWER ${c}` }))
  }
  return out
}
const fixture = (): SessionEvent[] => {
  n = 0
  const t1 = turn('c1', { tool: ['k1', 'succeeded'] })
  const t2 = turn('c2', { stop: 'APPROVAL_REQUIRED' })
  const cmp = ev('context/compacted', 'cmp', {
    throughSequence: t1.length,
    summary: 'short',
    sourceDigest: 'a'.repeat(64),
    strategyVersion: 'v1'
  })
  const t3 = turn('c3', { tool: ['k3'], end: false })
  return [...t1, ...t2, cmp, ...t3]
}

describe('PAR-S02 phase 1: controls on the starting point', () => {
  it('the projection API exists beside the S04 analysis of turns (flipped from the phase-1 absence pin)', () => {
    for (const name of [
      'projectSession',
      'foldSessionProjection',
      'currentStops',
      'emptySessionProjection'
    ])
      expect(typeof api[name]).toBe('function')
    expect(typeof api.analyzeSessionLog).toBe('function')
  })
  it('the S04 analysis already finds the turns, the open turn and its uncertain effect (reused by S02)', () => {
    const analysis = analyzeSessionLog(fixture())
    expect(analysis.turns.map((t) => [t.correlationId, t.state])).toEqual([
      ['c1', 'completed'],
      ['c2', 'ended'],
      ['cmp', 'completed'],
      ['c3', 'open']
    ])
    expect(analysis.openTurn?.uncertainEffects).toEqual(['k3'])
  })
  it('catalog v1 has no goal or todo event, so those projections cannot exist yet', () => {
    const events = new Set(
      fixture()
        .map((e) => e.type)
        .concat(['message/user'])
    )
    expect([...events].some((t) => /goal|todo/.test(t))).toBe(false)
  })
})

describe('PAR-S02 phase 1: RED witnesses of the pure projection (SPEC 0292 §3)', () => {
  it('projects the current state: counts, last turn, stops, open turn, compaction coverage', () => {
    const state = api.projectSession(fixture())
    expect(state.version).toBe(1)
    expect(state.throughSequence).toBe(fixture().length)
    expect(state.turns).toMatchObject({
      total: 3,
      completed: 1,
      ended: 1,
      open: 1
    })
    expect(state.lastTurn).toMatchObject({
      correlationId: 'c3',
      state: 'open'
    })
    expect(state.compaction).toMatchObject({ throughSequence: 6 })
  })

  it('lists what the log shows as stopped, open or uncertain, each citing its origin event', () => {
    const events = fixture()
    const state = api.projectSession(events)
    const stops = api.currentStops(state)
    const kinds = stops.map((s: any) => s.kind).sort()
    expect(kinds).toEqual([
      'approval_required',
      'open_turn',
      'uncertain_effect'
    ])
    for (const item of stops) {
      const origin = events[item.source.sequence - 1]!
      expect(origin.eventId).toBe(item.source.eventId)
    }
    const uncertain = stops.find((s: any) => s.kind === 'uncertain_effect')
    expect(uncertain.operationKey).toBe('k3')
    expect(events[uncertain.source.sequence - 1]!.type).toBe('tool/call')
  })

  it('folding a checkpoint plus the tail equals the projection from zero, at every cut', () => {
    const events = fixture()
    const whole = api.projectSession(events)
    for (let cut = 0; cut <= events.length; cut++) {
      const head = api.projectSession(events.slice(0, cut))
      const resumed = api.foldSessionProjection(head, events.slice(cut))
      expect(resumed).toEqual(whole)
    }
  })

  it('keeps no message text: the projection carries ids, counters and references only', () => {
    const state = JSON.stringify(api.projectSession(fixture()))
    expect(state).not.toContain('PATIENT-TEXT')
    expect(state).not.toContain('PATIENT-ANSWER')
    expect(state).not.toContain('short')
  })

  it('is deterministic and does not mutate its input', () => {
    const events = fixture()
    const before = JSON.stringify(events)
    expect(api.projectSession(events)).toEqual(api.projectSession(events))
    expect(JSON.stringify(events)).toBe(before)
  })

  it('refuses a tail that is not contiguous with the checkpoint instead of guessing', () => {
    const events = fixture()
    const head = api.projectSession(events.slice(0, 5))
    expect(() => api.foldSessionProjection(head, events.slice(6))).toThrow()
    expect(() => api.foldSessionProjection(head, events.slice(3))).toThrow()
  })

  it('the projection of a fork up to its cut equals the source projection up to the same cut', () => {
    const events = fixture()
    const plan = api.planSessionFork(events, { targetSessionId: 'child' })
    expect(plan.inherited.length).toBeGreaterThan(0)
    const source = api.projectSession(events.slice(0, plan.cutSequence))
    const child = api.projectSession(plan.inherited)
    expect(child).toEqual(source)
  })

  it('a context/compacted event does not change the state of the turns it summarizes', () => {
    const events = fixture()
    // dropping the marker leaves a hole in the sequence: renumber, as a log without it would be
    const without = events
      .filter((e) => e.type !== 'context/compacted')
      .map((e, i) => {
        const { sequence: _s, schemaFingerprint: _f, ...input } = e
        void _s
        void _f
        return materializeSessionEvent(input as SessionEventAppend, i + 1)
      })
    const a = api.projectSession(events)
    expect(a.turns.completed).toBe(1)
    expect(a.compaction.source.eventId).toBe(
      events.find((e) => e.type === 'context/compacted')!.eventId
    )
    expect(api.projectSession(without).compaction).toBeUndefined()
  })
})
