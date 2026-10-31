// Oracle of the Codex re-review of 6c723eea3 (F07, unknown cut), kept as regression.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type {
  SessionDirectory,
  SessionEvent,
  SessionEventStore,
  SessionSummary
} from '@cvg/harness-contracts'
import {
  createSessionQuery,
  materializeSessionEvent
} from '../session/index.ts'

const tenantId = 'synthetic-unknown-cut'
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
const log = (sessionId: string): SessionEvent[] => {
  const definitions: [SessionEvent['type'], Record<string, unknown>][] = [
    ['turn/start', { correlationId: 'c1' }],
    [
      'tool/call',
      { correlationId: 'c1', toolId: 'tool-a', operationKey: 'K', input: {} }
    ],
    [
      'tool/result',
      { correlationId: 'c1', toolId: 'tool-a', outcome: 'succeeded' }
    ],
    ['turn/end', { correlationId: 'c1', stopReason: 'COMPLETED' }]
  ]
  return definitions.map(([type, payload], index) =>
    materializeSessionEvent(
      {
        tenantId,
        sessionId,
        formatVersion: 1,
        eventId: `${sessionId}-${index + 1}`,
        timestamp: '2026-10-31T00:00:00.000Z',
        correlationId: 'c1',
        traceId: 'synthetic-trace',
        type,
        payload
      } as never,
      index + 1
    )
  )
}
const events: SessionEventStore = {
  openSession: async (input) => input,
  append: async () => {
    throw new Error('read only')
  },
  read: async (input) =>
    log(input.sessionId)
      .filter((event) => event.sequence > (input.afterSequence ?? 0))
      .slice(0, input.limit ?? 100)
}
const trace = (rows: SessionSummary[]) => {
  const directory: SessionDirectory = {
    window: async () =>
      rows.map((summary, index) => ({ key: 100 - index, summary }))
  }
  return createSessionQuery({
    tenantId,
    directory,
    events,
    approvals: {
      get: async (_tenant, approvalId) => ({
        approvalId,
        status: 'GRANTED',
        operationKey: 'K',
        originSessionId: 'child'
      }),
      listByOperationKey: async () => []
    },
    effects: { get: async () => undefined }
  }).trace({ approvalId: 'synthetic-approval' })
}
describe('F07 repair: unknown inheritance is not a negative fact', () => {
  it('control: known child cut marks all its copied event links inherited', async () => {
    expect(log('child')).toHaveLength(4)
    const result = await trace([child, parent])
    const links = result.links.filter(
      (link) => link.kind === 'event' && link.sessionId === 'child'
    )
    expect(links).toHaveLength(3)
    expect(
      links.every((link) => link.kind === 'event' && link.inherited === true)
    ).toBe(true)
    expect(result.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
  })
  it('unknown child cut records a source gap and never labels its events non-inherited', async () => {
    expect(log('child')).toHaveLength(4)
    const result = await trace([parent])
    expect(
      result.links.filter(
        (link) => link.kind === 'event' && link.sessionId === 'parent'
      )
    ).toHaveLength(3)
    expect(result.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'session', id: 'child' }
    })
    expect(result.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
    const unjustified = result.links.filter(
      (link) =>
        link.kind === 'event' &&
        link.sessionId === 'child' &&
        link.inherited === false
    )
    expect(unjustified).toHaveLength(0)
  })
})
