// @vitest-environment node
// Source of the oracles: docs/04_audit/evidence/AUD0625-REVIEW-0295-S1-CODEX-20261031 (own-oracles).
/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial port/fixture responses are intentional */
import { describe, expect, it } from 'vitest'
import {
  InMemorySessionDirectory,
  createSessionQuery,
  SessionQueryError,
  materializeSessionEvent
} from '../packages/harness/src/session/index.ts'
const T = 'synthetic-codex-s05'
const row = (key: number, preset = 'other') => ({
  key,
  summary: {
    sessionId: `s${key}`,
    createdAt: key,
    isSeeded: false,
    inheritedEventCount: 0,
    agentPreset: preset
  }
})
const event = (n: number, type: string, payload: any, c = `c${n}`): any =>
  materializeSessionEvent(
    {
      tenantId: T,
      sessionId: 's1',
      formatVersion: 1,
      eventId: `e${n}`,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId: c,
      traceId: 'tr',
      type,
      payload
    } as any,
    n
  )
const call = (n: number, c = `c${n}`, pad = '') =>
  event(
    n,
    'tool/call',
    { correlationId: c, toolId: 'tool', operationKey: 'k', input: { pad } },
    c
  )
function world(log: any[] = [], extra: any = {}) {
  const approvals = {
    get: async () => ({
      approvalId: 'a',
      operationKey: 'k',
      status: 'approved'
    }),
    listByOperationKey: async () => [
      { approvalId: 'a', operationKey: 'k', status: 'approved' }
    ],
    ...extra.approvals
  }
  const store = {
    openSession: async (i: any) => i,
    append: async () => {
      throw Error('write forbidden')
    },
    read: async (i: any) => {
      const page = log
        .filter((e) => e.sequence > (i.afterSequence ?? 0))
        .slice(0, i.limit)
      extra.afterRead?.(i, page)
      return page
    }
  }
  return createSessionQuery({
    tenantId: T,
    directory: new InMemorySessionDirectory([row(1)]),
    approvals,
    effects: { get: async () => ({ operationKey: 'k', state: 'succeeded' }) },
    events: store,
    clock: () => new Date('2026-10-31T00:00:00Z'),
    ...extra.options
  })
}
const inspect = async (p: Promise<any>) =>
  p.then(
    (value) => ({ value }),
    (error) => ({
      error: { name: error.name, code: error.code, message: error.message }
    })
  )
describe('PAR-S05 repair of the Codex review F01-F04 (oracles of the review, kept as regression tests)', () => {
  it('ordinary root port error is sanitized (positive control)', async () => {
    const q = world([], {
      approvals: {
        get: async () => {
          throw Error('PRIVATE_PORT_CANARY')
        }
      }
    })
    const out = await inspect(q.trace({ approvalId: 'a' }))
    expect(out).toMatchObject({
      error: { code: 'unavailable', message: 'the trace root source failed' }
    })
    expect(JSON.stringify(out)).not.toContain('PRIVATE_PORT_CANARY')
  })
  it.each(['approval', 'operationKey'])(
    'same exported error class from %s root port is also sanitized',
    async (kind) => {
      const bad = async () => {
        throw new SessionQueryError('not_found', 'PRIVATE_PORT_CANARY')
      }
      const q = world([], { approvals: { get: bad, listByOperationKey: bad } })
      const out = await inspect(
        q.trace(
          kind === 'approval' ? { approvalId: 'a' } : { operationKey: 'k' }
        )
      )
      expect(out).toMatchObject({
        error: { code: 'unavailable', message: 'the trace root source failed' }
      })
      expect(JSON.stringify(out)).not.toContain('PRIVATE_PORT_CANARY')
    }
  )
  it('abort after successful root read is a rejection, not a partial trace', async () => {
    const ac = new AbortController()
    const q = world([], {
      approvals: {
        get: async () => {
          ac.abort(Error('cancelled by caller'))
          return { approvalId: 'a', status: 'approved' }
        }
      }
    })
    const out = await inspect(q.trace({ approvalId: 'a', signal: ac.signal }))
    expect(out).toHaveProperty('error')
  })
  it('abort after final event page rejects and is not source_unavailable', async () => {
    const ac = new AbortController()
    const q = world([call(1)], {
      afterRead: () => ac.abort(Error('cancelled by caller'))
    })
    const out = await inspect(q.trace({ operationKey: 'k', signal: ac.signal }))
    expect(out).toHaveProperty('error')
  })
  it('default100 link budget reports a missing final turn/end as truncation', async () => {
    const log: any[] = []
    for (let i = 0; i < 33; i++) {
      const n = i * 4 + 1,
        c = `group${i}`
      log.push(
        event(n, 'turn/start', { correlationId: c }, c),
        call(n + 1, c),
        event(
          n + 2,
          'tool/result',
          { correlationId: c, toolId: 'tool', outcome: 'succeeded' },
          c
        ),
        event(
          n + 3,
          'turn/end',
          { correlationId: c, stopReason: 'COMPLETED' },
          c
        )
      )
    }
    const out = await world(log).trace({ operationKey: 'k' })
    expect(out.links).toHaveLength(100)
    expect(out.truncated).toBe(true)
    expect(out.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'links', id: 'links' }
    })
  })
  it('default5s total deadline reached by final page is reported', async () => {
    let now = 0
    const q = world([call(1)], {
      options: { monotonicMs: () => now },
      afterRead: () => {
        now = 6000
      }
    })
    const out = await q.trace({ operationKey: 'k' })
    expect(out.truncated).toBe(true)
    expect(out.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'deadline', id: 'deadline' }
    })
  })
  it.each([2, 3, 4])(
    'a ceiling of %i links leaves out the call, then its result, then its end, and says so',
    async (links) => {
      const c = 'g'
      const log = [
        event(1, 'turn/start', { correlationId: c }, c),
        call(2, c),
        event(
          3,
          'tool/result',
          { correlationId: c, toolId: 'tool', outcome: 'succeeded' },
          c
        ),
        event(4, 'turn/end', { correlationId: c, stopReason: 'COMPLETED' }, c)
      ]
      const out = await world(log, { options: { budgets: { links } } }).trace({
        operationKey: 'k'
      })
      expect(out.links).toHaveLength(links)
      expect(out.truncated).toBe(true)
      expect(out.gaps).toContainEqual({
        reason: 'budget_exhausted',
        subject: { kind: 'links', id: 'links' }
      })
    }
  )
})
