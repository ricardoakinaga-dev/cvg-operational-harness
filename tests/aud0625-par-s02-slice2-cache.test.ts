// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- rows are patched field by field in the table below */
import { describe, expect, it } from 'vitest'
import type { SessionEvent, SessionEventAppend } from '@cvg/harness-contracts'
import {
  SESSION_PROJECTION_ID,
  SESSION_PROJECTION_VERSION,
  judgeSessionCheckpoint,
  materializeSessionEvent,
  projectSession,
  sessionCheckpointRow,
  sessionHeaderDigest,
  sessionProjectionStateDigest
} from '../packages/harness/src/session/index.ts'

// PAR-S02 slice 2 (SPEC 0292 §4): the pure judgement of a checkpoint. Synthetic data only.
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
const log = (): SessionEvent[] => {
  n = 0
  return [
    ev('turn/start', 'a', { correlationId: 'a' }),
    ev('turn/end', 'a', {
      correlationId: 'a',
      stopReason: 'APPROVAL_REQUIRED'
    }),
    ev('turn/start', 'b', { correlationId: 'b' })
  ]
}
const HEADER = '{"version":1,"id":"s","createdAt":1,"isSeeded":false}'
const stream = { headerText: HEADER, head: 3 }
const good = () =>
  sessionCheckpointRow(projectSession(log()), HEADER, 'd'.repeat(64))

describe('sessionCheckpointRow and judgeSessionCheckpoint', () => {
  it('builds the row the migration stores and accepts it for the stream it came from', () => {
    const row = good()
    expect(SESSION_PROJECTION_ID).toBe('session-state')
    expect(row).toMatchObject({
      projectionVersion: SESSION_PROJECTION_VERSION,
      throughSequence: 3,
      tailInputDigest: 'd'.repeat(64),
      headerDigest: sessionHeaderDigest(HEADER)
    })
    expect(row.stateDigest).toMatch(/^[a-f0-9]{64}$/)
    const verdict = judgeSessionCheckpoint(row, stream)
    expect(verdict).toEqual({ ok: true, projection: projectSession(log()) })
  })

  it('accepts a checkpoint behind the head and one at it', () => {
    const behind = sessionCheckpointRow(
      projectSession(log().slice(0, 2)),
      HEADER,
      'd'.repeat(64)
    )
    expect(judgeSessionCheckpoint(behind, { ...stream, head: 9 }).ok).toBe(true)
    expect(judgeSessionCheckpoint(behind, { ...stream, head: 2 }).ok).toBe(true)
  })

  it('digests do not depend on key order, and change with any value', () => {
    const p = projectSession(log())
    const reordered = JSON.parse(
      JSON.stringify(Object.fromEntries(Object.entries(p).reverse()))
    )
    expect(sessionProjectionStateDigest(reordered)).toBe(
      sessionProjectionStateDigest(p)
    )
    expect(
      sessionProjectionStateDigest({ ...p, inheritableThrough: 1 })
    ).not.toBe(sessionProjectionStateDigest(p))
    expect(sessionHeaderDigest('a')).not.toBe(sessionHeaderDigest('b'))
  })

  it.each([
    [
      'another projection version',
      (r: any) => ({ ...r, projectionVersion: 2 }),
      'projection version differs'
    ],
    [
      'a state of another version',
      (r: any) => ({ ...r, state: { ...r.state, version: 2 } }),
      'state is malformed'
    ],
    [
      'a state that is not an object',
      (r: any) => ({ ...r, state: 'x' }),
      'state is malformed'
    ],
    [
      'a state that is an array',
      (r: any) => ({ ...r, state: [] }),
      'state is malformed'
    ],
    [
      'a state without turns',
      (r: any) => ({ ...r, state: { ...r.state, turns: null } }),
      'state is malformed'
    ],
    [
      'a state without stops',
      (r: any) => ({
        ...r,
        state: { ...r.state, stops: { total: {}, recent: 'x' } }
      }),
      'state is malformed'
    ],
    [
      'a state with a negative count',
      (r: any) => ({ ...r, state: { ...r.state, throughSequence: -1 } }),
      'state is malformed'
    ],
    [
      'a fractional counter',
      (r: any) => ({ ...r, state: { ...r.state, inheritableThrough: 1.5 } }),
      'state is malformed'
    ],
    [
      'a state without the closed block',
      (r: any) => ({ ...r, state: { ...r.state, closed: undefined } }),
      'state is malformed'
    ],
    [
      'an open group that is not an object',
      (r: any) => ({ ...r, state: { ...r.state, open: 'x' } }),
      'state is malformed'
    ],
    [
      'a position that differs from the state',
      (r: any) => ({ ...r, throughSequence: 2 }),
      'state position differs from the checkpoint position'
    ],
    [
      'a tampered state',
      (r: any) => ({
        ...r,
        state: { ...r.state, turns: { ...r.state.turns, total: 99 } }
      }),
      'state digest differs'
    ],
    [
      'a tampered digest',
      (r: any) => ({ ...r, stateDigest: 'f'.repeat(64) }),
      'state digest differs'
    ],
    [
      'another stream header',
      (r: any) => ({ ...r, headerDigest: sessionHeaderDigest('{}') }),
      'stream header differs'
    ]
  ])('refuses %s', (_name, change, reason) => {
    expect(judgeSessionCheckpoint(change(good()), stream)).toEqual({
      ok: false,
      reason
    })
  })

  it('refuses a position outside the log', () => {
    expect(judgeSessionCheckpoint(good(), { ...stream, head: 2 })).toEqual({
      ok: false,
      reason: 'position is outside the log'
    })
    const zero = sessionCheckpointRow(
      projectSession([]),
      HEADER,
      'd'.repeat(64)
    )
    expect(judgeSessionCheckpoint(zero, stream)).toEqual({
      ok: false,
      reason: 'position is outside the log'
    })
  })

  it('keeps no text: the row is made of the projection and digests only', () => {
    expect(JSON.stringify(good())).not.toMatch(/TEXT|summary/i)
  })
})
