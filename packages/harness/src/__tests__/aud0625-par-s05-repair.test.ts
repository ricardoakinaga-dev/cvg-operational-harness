import { describe, expect, it } from 'vitest'
import type {
  ApprovalReadPort,
  SessionDirectory,
  SessionEvent,
  SessionEventStore,
  SessionSummary
} from '@cvg/harness-contracts'
import { createSessionQuery } from '../session/index.ts'

// PAR-S05 repair of the Codex review: F02 (abort before classifying absence) and F07 (a trace
// that starts from an origin in a fork child judges inheritance with the child's own cut).
const T = 'tenant-s05-repair'

const ev = (
  sessionId: string,
  sequence: number,
  type: string,
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  ({
    tenantId: T,
    sessionId,
    formatVersion: 1,
    sequence,
    eventId: `${sessionId}-${sequence}`,
    timestamp: '2026-10-31T00:00:00.000Z',
    correlationId,
    traceId: `t-${correlationId}`,
    type,
    payload,
    schemaFingerprint: 'a'.repeat(64)
  }) as unknown as SessionEvent

/** Four events of the parent; the fork child holds copies of them under its own id. */
const parentLog = (id: string): SessionEvent[] => [
  ev(id, 1, 'turn/start', 'c1', { correlationId: 'c1' }),
  ev(id, 2, 'tool/call', 'c1', {
    correlationId: 'c1',
    toolId: 'tool-a',
    operationKey: 'K'
  }),
  ev(id, 3, 'tool/result', 'c1', {
    correlationId: 'c1',
    toolId: 'tool-a',
    outcome: 'ok'
  }),
  ev(id, 4, 'turn/end', 'c1', { correlationId: 'c1', stopReason: 'done' })
]
const parent: SessionSummary = {
  sessionId: 'parent',
  createdAt: 1,
  isSeeded: false,
  inheritedEventCount: 0
}
const child: SessionSummary = {
  sessionId: 'child',
  createdAt: 2,
  isSeeded: true,
  parentSession: 'parent',
  inheritedEventCount: 4
}
const logs: Record<string, SessionEvent[]> = {
  parent: parentLog('parent'),
  child: parentLog('child')
}
const eventsOf = (): SessionEventStore => ({
  openSession: async (i) => i,
  append: async () => {
    throw new Error('read only')
  },
  read: async (input) => {
    const log = logs[input.sessionId]
    if (!log) throw new Error('not open')
    return log
      .filter((e) => e.sequence > (input.afterSequence ?? 0))
      .slice(0, input.limit ?? 100)
  }
})
const directoryOf = (rows: SessionSummary[]): SessionDirectory => ({
  window: async () => rows.map((summary, i) => ({ key: 100 - i, summary }))
})
const originIn = (sessionId: string | undefined): ApprovalReadPort => ({
  get: async (_t, approvalId) => ({
    approvalId,
    status: 'GRANTED',
    operationKey: 'K',
    ...(sessionId === undefined ? {} : { originSessionId: sessionId })
  }),
  listByOperationKey: async () => []
})

describe('F07: inheritance with the origin in a fork child', () => {
  const trace = (rows: SessionSummary[], origin = 'child') =>
    createSessionQuery({
      tenantId: T,
      directory: directoryOf(rows),
      events: eventsOf(),
      approvals: originIn(origin),
      effects: { get: async () => undefined }
    }).trace({ approvalId: 'a' })

  it('the copies are inherited in the child, the original is not, and no false candidate appears', async () => {
    const out = await trace([child, parent])
    const events = out.links.filter((l) => l.kind === 'event')
    const by = (sessionId: string) =>
      events.filter((l) => l.kind === 'event' && l.sessionId === sessionId)
    expect(by('child').length).toBe(3)
    expect(
      by('child').every((l) => l.kind === 'event' && l.inherited === true)
    ).toBe(true)
    expect(by('parent').length).toBe(3)
    expect(
      by('parent').every((l) => l.kind === 'event' && l.inherited === false)
    ).toBe(true)
    expect(out.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
  })

  it('a cut that cannot be resolved is a gap and its copies are not counted as originals', async () => {
    // the hinted child is not in the listing: its cut is unknown, never read as zero
    const out = await trace([parent])
    expect(out.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'session', id: 'child' }
    })
    // and none of its links is published as original: the cut that would say so is unknown
    const sessions = out.links.flatMap((l) =>
      l.kind === 'event' ? [l.sessionId] : []
    )
    expect(sessions).not.toContain('child')
    expect(new Set(sessions)).toEqual(new Set(['parent']))
    expect(
      out.links.filter((l) => l.kind === 'event' && l.inherited).length
    ).toBe(0)
    expect(out.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
  })
})

describe('F02: absence is not classified for a caller that left', () => {
  it('an empty root read that aborted the caller rejects with the reason, not not_found', async () => {
    const abort = new AbortController()
    const approvals: ApprovalReadPort = {
      get: async () => {
        abort.abort(new Error('caller left'))
        return undefined
      },
      listByOperationKey: async () => []
    }
    await expect(
      createSessionQuery({
        tenantId: T,
        directory: directoryOf([]),
        events: eventsOf(),
        effects: { get: async () => undefined },
        approvals
      }).trace({ approvalId: 'gone', signal: abort.signal })
    ).rejects.toThrow('caller left')
  })

  it('without an abort the same empty root is not_found', async () => {
    await expect(
      createSessionQuery({
        tenantId: T,
        directory: directoryOf([]),
        events: eventsOf(),
        effects: { get: async () => undefined },
        approvals: {
          get: async () => undefined,
          listByOperationKey: async () => []
        }
      }).trace({ approvalId: 'gone' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
