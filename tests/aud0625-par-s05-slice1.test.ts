// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { canonicalizeJson } from '@cvg/harness-contracts'
import type {
  ApprovalReadPort,
  EffectJournalReadPort,
  SessionDirectoryRow,
  SessionEvent,
  SessionEventAppend,
  SessionEventStore,
  SessionListFilter,
  SessionSummary,
  TraceApproval
} from '@cvg/harness-contracts'
import {
  InMemorySessionDirectory,
  SESSION_TRACE_BUDGETS,
  SessionEventError,
  SessionQueryError,
  canonicalSessionFilter,
  createSessionQuery,
  decodeSessionCursor,
  encodeSessionCursor,
  materializeSessionEvent,
  matchesSessionFilter,
  sessionFilterDigest,
  sessionListLimit,
  sessionTenantDigest
} from '../packages/harness/src/session/index.ts'

// PAR-S05 slice 1 (SPEC 0295 R2): the pure listing and tracing over ports. Synthetic data only.
const TENANT = 'tenant-s05-a'
const OTHER_TENANT = 'tenant-s05-b'

const summary = (
  i: number,
  over: Partial<SessionSummary> = {}
): SessionSummary => ({
  sessionId: `s${i}`,
  createdAt: 1_000 + i,
  isSeeded: false,
  inheritedEventCount: 0,
  ...over
})
const rowsOf = (
  n: number,
  make: (i: number) => SessionSummary | null = summary
): SessionDirectoryRow[] =>
  Array.from({ length: n }, (_, k) => ({ key: k + 1, summary: make(k + 1) }))
const query = (
  rows: SessionDirectoryRow[],
  extra: Record<string, unknown> = {}
) =>
  createSessionQuery({
    tenantId: TENANT,
    directory: new InMemorySessionDirectory(rows),
    ...extra
  })
const failure = async (f: () => Promise<unknown>) => {
  try {
    await f()
  } catch (error) {
    return error as SessionQueryError
  }
  throw new Error('did not fail')
}

/* ---- listing ----------------------------------------------------------------------------- */
describe('the session listing (SPEC 0295 Q3, Q6, §4)', () => {
  it('lists newest key first with the default limit and ends with a null cursor on a short window', async () => {
    const page = await query(rowsOf(7)).list()
    expect(page.items.map((s) => s.sessionId)).toEqual([
      's7',
      's6',
      's5',
      's4',
      's3',
      's2',
      's1'
    ])
    expect(page).toMatchObject({
      nextCursor: null,
      examined: 7,
      skippedUnadopted: 0
    })
    expect(await query([]).list()).toEqual({
      items: [],
      nextCursor: null,
      examined: 0,
      skippedUnadopted: 0
    })
  })

  it('pages without a hole or a repeat, whatever the limit', async () => {
    const rows = rowsOf(60, (i) =>
      summary(i, { agentPreset: i % 3 === 0 ? 'p' : 'q' })
    )
    const q = query(rows)
    for (const limit of [1, 2, 7, 20, 60, 100]) {
      const seen: string[] = []
      let cursor: string | undefined
      let pages = 0
      do {
        const page = await q.list({
          filter: { agentPreset: 'p' },
          limit,
          ...(cursor === undefined ? {} : { cursor })
        })
        seen.push(...page.items.map((s) => s.sessionId))
        cursor = page.nextCursor ?? undefined
        pages += 1
      } while (cursor !== undefined && pages < 200)
      expect(seen, `limit ${limit}`).toEqual(
        rows
          .filter((r) => r.summary!.agentPreset === 'p')
          .map((r) => r.summary!.sessionId)
          .reverse()
      )
    }
  })

  it('the cursor after a filled page is the last candidate examined, and a fill at the end of a short window is the end', async () => {
    const q = query(rowsOf(5))
    const first = await q.list({ limit: 2 })
    expect(first.items.map((s) => s.sessionId)).toEqual(['s5', 's4'])
    expect(first.examined).toBe(2)
    expect(decodeSessionCursor(first.nextCursor!, {}, TENANT)).toBe(4)
    const last = await q.list({ limit: 5 })
    expect(last.nextCursor).toBeNull()
    const exact = await q.list({ limit: 3, cursor: first.nextCursor! })
    expect(exact.items.map((s) => s.sessionId)).toEqual(['s3', 's2', 's1'])
    expect(exact.nextCursor).toBeNull()
  })

  it('examines a window BEFORE the filter: 2001 candidates with the only match at the 1500th', async () => {
    // keys 2001..1 newest first: the 1500th examined is key 502
    const q = query(
      rowsOf(2001, (i) =>
        summary(i, { agentPreset: i === 502 ? 'target' : 'other' })
      )
    )
    const filter: SessionListFilter = { agentPreset: 'target' }
    const one = await q.list({ filter })
    expect(one).toMatchObject({
      items: [],
      examined: 1000,
      skippedUnadopted: 0
    })
    expect(one.nextCursor).not.toBeNull()
    const two = await q.list({ filter, cursor: one.nextCursor! })
    expect(two.items.map((s) => s.sessionId)).toEqual(['s502'])
    expect(two.examined).toBe(1000)
    expect(two.nextCursor).not.toBeNull()
    const three = await q.list({ filter, cursor: two.nextCursor! })
    expect(three).toMatchObject({ items: [], examined: 1, nextCursor: null })
  })

  it('a window of exactly 1000 candidates that fills the page at its end still has a cursor', async () => {
    const q = query(rowsOf(1000))
    const page = await q.list({ limit: 100 })
    expect(page.items).toHaveLength(100)
    expect(page.nextCursor).not.toBeNull()
    const fullNoFill = await query(
      rowsOf(1000, (i) => summary(i, { agentPreset: 'x' }))
    ).list({
      filter: { agentPreset: 'nobody' }
    })
    expect(fullNoFill.items).toEqual([])
    expect(fullNoFill.nextCursor).not.toBeNull()
    expect(
      decodeSessionCursor(
        fullNoFill.nextCursor!,
        { agentPreset: 'nobody' },
        TENANT
      )
    ).toBe(1)
    const tail = await query(rowsOf(1000)).list({
      limit: 100,
      cursor: encodeSessionCursor(1, {}, TENANT)
    })
    expect(tail).toMatchObject({ items: [], examined: 0, nextCursor: null })
  })

  it('counts and leaves out the streams without adopted metadata, per window', async () => {
    const q = query(rowsOf(10, (i) => (i % 4 === 0 ? null : summary(i))))
    const page = await q.list()
    expect(page.skippedUnadopted).toBe(2)
    expect(page.examined).toBe(10)
    expect(page.items).toHaveLength(8)
    expect(
      page.items.every((s) => s.sessionId !== 's4' && s.sessionId !== 's8')
    ).toBe(true)
    const limited = await q.list({ limit: 4 })
    expect(limited.skippedUnadopted).toBe(1)
    expect(limited.examined).toBe(5)
  })

  it('asks the directory for a window of 1000 below the cursor and passes the signal', async () => {
    const asked: unknown[] = []
    const q = createSessionQuery({
      tenantId: TENANT,
      directory: {
        window: async (input) => {
          asked.push(input)
          return []
        }
      }
    })
    const abort = new AbortController()
    await q.list({ signal: abort.signal })
    await q.list({ cursor: encodeSessionCursor(77, {}, TENANT) })
    expect(asked).toEqual([
      { size: 1000, signal: abort.signal },
      { before: 77, size: 1000 }
    ])
  })

  it('stops for a request that is aborted before or while the window is read', async () => {
    const abort = new AbortController()
    abort.abort()
    await expect(query(rowsOf(3)).list({ signal: abort.signal })).rejects.toBe(
      abort.signal.reason
    )
    const live = new AbortController()
    const q = createSessionQuery({
      tenantId: TENANT,
      directory: {
        window: async () => {
          live.abort(new Error('stop'))
          return rowsOf(3)
        }
      }
    })
    await expect(q.list({ signal: live.signal })).rejects.toThrow('stop')
    // a signal that is aborted but carries no reason
    const noReason = {
      aborted: true,
      reason: undefined
    } as unknown as AbortSignal
    await expect(query([]).list({ signal: noReason })).rejects.toBeInstanceOf(
      SessionQueryError
    )
  })
})

describe('the filter', () => {
  it('is canonical: absent keys vanish and {} equals undefined', () => {
    expect(canonicalSessionFilter(undefined)).toEqual({})
    expect(canonicalSessionFilter({})).toEqual({})
    expect(sessionFilterDigest(canonicalSessionFilter({}))).toBe(
      sessionFilterDigest(canonicalSessionFilter(undefined))
    )
    expect(
      canonicalSessionFilter({
        parentSession: 'p',
        origin: 'subagent',
        agentPreset: 'a',
        isSeeded: false,
        createdAfter: 1,
        createdBefore: 2,
        ...{}
      })
    ).toEqual({
      parentSession: 'p',
      origin: 'subagent',
      agentPreset: 'a',
      isSeeded: false,
      createdAfter: 1,
      createdBefore: 2
    })
    expect(canonicalSessionFilter({ agentPreset: undefined })).toEqual({})
  })

  it.each([
    ['not an object', 'x'],
    ['an array', []],
    ['null', null],
    ['an unknown key', { nope: 1 }],
    ['an empty id', { parentSession: '' }],
    ['a NUL id', { agentPreset: 'a\u0000b' }],
    ['a long id', { parentSession: 'x'.repeat(201) }],
    ['a number id', { agentPreset: 5 }],
    ['another origin', { origin: 'human' }],
    ['a string flag', { isSeeded: 'true' }],
    ['a fractional date', { createdAfter: 1.5 }],
    ['a negative date', { createdBefore: -1 }],
    ['a string date', { createdAfter: '5' }],
    ['an inverted range', { createdAfter: 10, createdBefore: 10 }],
    ['an inverted range', { createdAfter: 11, createdBefore: 10 }]
  ])('refuses %s', (_name, filter) => {
    expect(() => canonicalSessionFilter(filter)).toThrow(SessionQueryError)
    try {
      canonicalSessionFilter(filter)
    } catch (error) {
      expect((error as SessionQueryError).code).toBe('invalid_params')
    }
  })

  it('matches each key, with an inclusive start and an exclusive end', () => {
    const s = summary(1, {
      parentSession: 'p',
      origin: 'subagent',
      agentPreset: 'a',
      isSeeded: true,
      createdAt: 100
    })
    const match = (f: SessionListFilter) => matchesSessionFilter(s, f)
    expect(match({})).toBe(true)
    expect(match({ parentSession: 'p' })).toBe(true)
    expect(match({ parentSession: 'q' })).toBe(false)
    expect(match({ origin: 'subagent' })).toBe(true)
    expect(match({ agentPreset: 'b' })).toBe(false)
    expect(match({ isSeeded: true })).toBe(true)
    expect(match({ isSeeded: false })).toBe(false)
    expect(match({ createdAfter: 100 })).toBe(true)
    expect(match({ createdAfter: 101 })).toBe(false)
    expect(match({ createdBefore: 100 })).toBe(false)
    expect(match({ createdBefore: 101 })).toBe(true)
    expect(matchesSessionFilter(summary(1), { origin: 'subagent' })).toBe(false)
    expect(matchesSessionFilter(summary(1), { parentSession: 'p' })).toBe(false)
  })

  it('filters a listing by every key', async () => {
    const q = query(
      rowsOf(6, (i) =>
        summary(i, {
          createdAt: i * 10,
          isSeeded: i % 2 === 0,
          ...(i === 3
            ? { parentSession: 's1', origin: 'subagent' as const }
            : {}),
          ...(i >= 4 ? { agentPreset: 'triage' } : {})
        })
      )
    )
    const ids = async (filter: SessionListFilter) =>
      (await q.list({ filter })).items.map((s) => s.sessionId)
    expect(await ids({ parentSession: 's1' })).toEqual(['s3'])
    expect(await ids({ origin: 'subagent' })).toEqual(['s3'])
    expect(await ids({ agentPreset: 'triage' })).toEqual(['s6', 's5', 's4'])
    expect(await ids({ isSeeded: true })).toEqual(['s6', 's4', 's2'])
    expect(await ids({ createdAfter: 30, createdBefore: 60 })).toEqual([
      's5',
      's4',
      's3'
    ])
  })
})

describe('the limit', () => {
  it('defaults to 50 and accepts 1..100', () => {
    expect(sessionListLimit(undefined)).toBe(50)
    expect(sessionListLimit(1)).toBe(1)
    expect(sessionListLimit(100)).toBe(100)
  })
  it.each([0, 101, 1.5, -1, Number.NaN, '5', null])('refuses %s', (limit) => {
    expect(() => sessionListLimit(limit)).toThrow(SessionQueryError)
  })
  it('refuses a bad limit in a listing before the directory is read', async () => {
    let read = false
    const q = createSessionQuery({
      tenantId: TENANT,
      directory: {
        window: async () => {
          read = true
          return []
        }
      }
    })
    const error = await failure(() => q.list({ limit: 101 }))
    expect(error.code).toBe('invalid_params')
    expect(read).toBe(false)
  })
})

describe('the cursor (D4: a position hint bound to a filter and a tenant, not authenticated)', () => {
  const filter: SessionListFilter = { agentPreset: 'a' }
  const good = () => encodeSessionCursor(42, filter, TENANT)
  const code = (f: () => unknown) => {
    try {
      f()
    } catch (error) {
      return (error as SessionQueryError).code
    }
    return 'no error'
  }

  it('round trips the position and binds the filter and the tenant', () => {
    expect(decodeSessionCursor(good(), filter, TENANT)).toBe(42)
    expect(sessionTenantDigest(TENANT)).not.toBe(
      sessionTenantDigest(OTHER_TENANT)
    )
    expect(
      code(() => decodeSessionCursor(good(), { agentPreset: 'b' }, TENANT))
    ).toBe('invalid_cursor')
    expect(code(() => decodeSessionCursor(good(), {}, TENANT))).toBe(
      'invalid_cursor'
    )
    expect(code(() => decodeSessionCursor(good(), filter, OTHER_TENANT))).toBe(
      'invalid_cursor'
    )
  })

  it('a client that keeps both digests and changes only the position is accepted, and only the start moves', async () => {
    const forged = encodeSessionCursor(3, filter, TENANT)
    expect(decodeSessionCursor(forged, filter, TENANT)).toBe(3)
    const page = await query(
      rowsOf(10, (i) => summary(i, { agentPreset: 'a' }))
    ).list({
      filter,
      cursor: forged
    })
    expect(page.items.map((s) => s.sessionId)).toEqual(['s2', 's1'])
  })

  // canonical key order, so that only the field under test can be the reason for the refusal
  const body = (o: Record<string, unknown>) =>
    Buffer.from(canonicalizeJson(o), 'utf8').toString('base64url')
  const f = sessionFilterDigest(canonicalSessionFilter(filter))
  const t = sessionTenantDigest(TENANT)
  it.each([
    ['empty', ''],
    ['too long', 'A'.repeat(513)],
    ['not base64url', 'not base64!'],
    ['padded', `${good()}=`],
    ['not JSON', Buffer.from('nope').toString('base64url')],
    ['an array', Buffer.from('[]').toString('base64url')],
    ['null', Buffer.from('null').toString('base64url')],
    ['missing keys', body({ v: 1, k: 1 })],
    ['extra keys', body({ v: 1, k: 1, f, t, z: 1 })],
    ['version 2', body({ v: 2, k: 1, f, t })],
    ['position zero', body({ v: 1, k: 0, f, t })],
    ['fractional position', body({ v: 1, k: 1.5, f, t })],
    ['string position', body({ v: 1, k: '1', f, t })],
    ['huge position', body({ v: 1, k: 2 ** 60, f, t })],
    ['short digests', body({ v: 1, k: 1, f: 'a', t })],
    ['non-hex digests', body({ v: 1, k: 1, f, t: 'z'.repeat(64) })],
    [
      'non-canonical order',
      Buffer.from(`{"k":42,"v":1,"f":"${f}","t":"${t}"}`).toString('base64url')
    ]
  ])('refuses a cursor that is %s', (_name, cursor) => {
    expect(code(() => decodeSessionCursor(cursor, filter, TENANT))).toBe(
      'invalid_cursor'
    )
  })

  it('refuses a cursor that is not a string', () => {
    expect(code(() => decodeSessionCursor(5 as never, filter, TENANT))).toBe(
      'invalid_cursor'
    )
  })

  it('a listing refuses a foreign cursor before reading the directory', async () => {
    const q = query(rowsOf(3))
    const error = await failure(() =>
      q.list({ cursor: encodeSessionCursor(2, {}, OTHER_TENANT) })
    )
    expect(error.code).toBe('invalid_cursor')
  })
})

/* ---- trace ------------------------------------------------------------------------------- */
let seq = 0
const ev = (
  sessionId: string,
  sequence: number,
  type: SessionEventAppend['type'],
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: TENANT,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-e${sequence}-${++seq}`,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId,
      traceId: 'tr',
      type,
      payload
    } as SessionEventAppend,
    sequence
  )
const callEv = (
  s: string,
  n: number,
  c: string,
  tool: string,
  key: string,
  input: unknown = {}
) =>
  ev(s, n, 'tool/call', c, {
    correlationId: c,
    toolId: tool,
    operationKey: key,
    input
  })
const resultEv = (
  s: string,
  n: number,
  c: string,
  tool: string,
  outcome = 'succeeded'
) => ev(s, n, 'tool/result', c, { correlationId: c, toolId: tool, outcome })
const endEv = (s: string, n: number, c: string, stop = 'COMPLETED') =>
  ev(s, n, 'turn/end', c, { correlationId: c, stopReason: stop })
const startEv = (s: string, n: number, c: string) =>
  ev(s, n, 'turn/start', c, { correlationId: c })

interface World {
  sessions: Record<string, SessionEvent[]>
  approvals?: TraceApproval[]
  effects?: Record<string, { state: string; executionRef?: string }>
  rows?: SessionDirectoryRow[]
}
function world(w: World) {
  const reads: string[] = []
  let readCount = 0
  const store: SessionEventStore = {
    openSession: async (i) => i,
    append: async () => {
      throw new Error('not used')
    },
    read: async (input) => {
      readCount += 1
      reads.push(`${input.sessionId}:${input.afterSequence}:${input.limit}`)
      const log = w.sessions[input.sessionId]
      if (!log) throw new SessionEventError('session_not_open', 'not found')
      return log
        .filter((e) => e.sequence > (input.afterSequence ?? 0))
        .slice(0, input.limit)
    }
  }
  const approvals: ApprovalReadPort = {
    get: async (_t, id) => (w.approvals ?? []).find((a) => a.approvalId === id),
    listByOperationKey: async (_t, key, limit) =>
      (w.approvals ?? []).filter((a) => a.operationKey === key).slice(0, limit)
  }
  const effects: EffectJournalReadPort = {
    get: async (_t, key) => {
      const e = w.effects?.[key]
      return e ? { operationKey: key, ...e } : undefined
    }
  }
  const rows =
    w.rows ??
    Object.keys(w.sessions).map((id, i) => ({
      key: i + 1,
      summary: summary(i + 1, { sessionId: id })
    }))
  return { store, approvals, effects, rows, reads, reads_: () => readCount }
}
const traceQuery = (
  w: ReturnType<typeof world>,
  extra: Record<string, unknown> = {}
) =>
  createSessionQuery({
    tenantId: TENANT,
    directory: new InMemorySessionDirectory(w.rows),
    events: w.store,
    approvals: w.approvals,
    effects: w.effects,
    clock: () => new Date('2026-10-31T12:00:00.000Z'),
    ...extra
  })
const APPROVAL: TraceApproval = {
  approvalId: 'appr_1',
  operationKey: 'op-1',
  executionRef: 'exec-1',
  status: 'EXECUTED',
  originSessionId: 'sess-a'
}
const noOrigin = (a: TraceApproval): TraceApproval => {
  const { originSessionId: _o, ...rest } = a
  void _o
  return rest
}
const happy = (): World => ({
  sessions: {
    'sess-a': [
      startEv('sess-a', 1, 'c1'),
      callEv('sess-a', 2, 'c1', 'tool-a', 'op-1'),
      resultEv('sess-a', 3, 'c1', 'tool-a'),
      endEv('sess-a', 4, 'c1')
    ]
  },
  approvals: [APPROVAL],
  effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } }
})

describe('the trace of an approval (SPEC 0295 §5)', () => {
  it('follows approval, effect and the events of the log, in a stable order, without gaps', async () => {
    const w = world(happy())
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(trace.root).toEqual({ kind: 'approval', id: 'appr_1' })
    expect(trace.gaps).toEqual([])
    expect(trace.truncated).toBe(false)
    expect(
      trace.links.map((l) =>
        l.kind === 'event' ? `${l.type}@${l.sequence}` : l.kind
      )
    ).toEqual([
      'approval',
      'effect',
      'tool/call@2',
      'tool/result@3',
      'turn/end@4'
    ])
    expect(trace.links[0]).toEqual({
      kind: 'approval',
      approvalId: 'appr_1',
      status: 'EXECUTED',
      executionRef: 'exec-1',
      originSessionId: 'sess-a'
    })
    expect(trace.links[1]).toEqual({
      kind: 'effect',
      operationKey: 'op-1',
      state: 'CONFIRMED',
      executionRef: 'exec-1'
    })
    expect(trace.links[4]).toMatchObject({
      outcome: 'COMPLETED',
      inherited: false
    })
    expect(trace.observed).toEqual({
      approval: '2026-10-31T12:00:00.000Z',
      effect: '2026-10-31T12:00:00.000Z',
      events: '2026-10-31T12:00:00.000Z'
    })
    expect(JSON.stringify(trace)).not.toContain('"input"')
    const again = await traceQuery(world(happy())).trace({
      approvalId: 'appr_1'
    })
    const bare = (t: typeof trace) =>
      JSON.parse(
        JSON.stringify(t).replace(/"eventId":"[^"]*"/g, '"eventId":"-"')
      )
    expect(bare(again)).toEqual(bare(trace))
  })

  it('traces from the operation key to the same links, naming the approval candidates', async () => {
    const trace = await traceQuery(world(happy())).trace({
      operationKey: 'op-1'
    })
    expect(trace.root).toEqual({ kind: 'operationKey', id: 'op-1' })
    expect(trace.links.map((l) => l.kind)).toEqual([
      'approval',
      'effect',
      'event',
      'event',
      'event'
    ])
    expect(trace.gaps).toEqual([])
  })

  it('reads the origin session named by the approval first, and the listing after it', async () => {
    const w = world({
      ...happy(),
      sessions: {
        'sess-z': [startEv('sess-z', 1, 'cz')],
        'sess-a': happy().sessions['sess-a']!
      },
      rows: [
        { key: 1, summary: summary(1, { sessionId: 'sess-z' }) },
        { key: 2, summary: summary(2, { sessionId: 'sess-a' }) }
      ]
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(w.reads[0]!.startsWith('sess-a:')).toBe(true)
    expect(w.reads.some((r) => r.startsWith('sess-z:'))).toBe(true)
    expect(trace.links.filter((l) => l.kind === 'event')).toHaveLength(3)
  })

  it('does not take the origin as proof: a hint without an event is only a gap', async () => {
    const w = world({
      sessions: { 'sess-a': [startEv('sess-a', 1, 'c1')] },
      approvals: [APPROVAL],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } }
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(trace.links.filter((l) => l.kind === 'event')).toEqual([])
    expect(trace.gaps).toEqual([
      {
        reason: 'event_not_found',
        subject: { kind: 'operationKey', id: 'op-1' }
      }
    ])
  })
})

describe('the error matrix (SPEC 0295 §5.4)', () => {
  it('a missing approval and an approval of another tenant answer the same not_found', async () => {
    const q = traceQuery(world(happy()))
    const missing = await failure(() => q.trace({ approvalId: 'nope' }))
    expect(missing).toBeInstanceOf(SessionQueryError)
    expect(missing.code).toBe('not_found')
    const foreignPort: ApprovalReadPort = {
      get: async () => undefined,
      listByOperationKey: async () => []
    }
    const foreign = await failure(() =>
      traceQuery(world(happy()), { approvals: foreignPort }).trace({
        approvalId: 'appr_1'
      })
    )
    expect(foreign.code).toBe('not_found')
    expect(foreign.message).toBe(missing.message)
  })

  it('an operation key with nothing behind it anywhere is not_found; with an effect or an event it is a trace', async () => {
    const nothing = world({ sessions: {} })
    expect(
      (await failure(() => traceQuery(nothing).trace({ operationKey: 'none' })))
        .code
    ).toBe('not_found')
    const effectOnly = world({
      sessions: {},
      effects: { k: { state: 'CONFIRMED' } }
    })
    const t1 = await traceQuery(effectOnly).trace({ operationKey: 'k' })
    expect(t1.links.map((l) => l.kind)).toEqual(['effect'])
    expect(t1.gaps.map((g) => g.reason)).toEqual([
      'approval_not_found',
      'event_not_found'
    ])
    const eventOnly = world({
      sessions: { s: [callEv('s', 1, 'c', 't', 'k')] }
    })
    const t2 = await traceQuery(eventOnly).trace({ operationKey: 'k' })
    expect(t2.links.map((l) => l.kind)).toEqual(['event'])
    expect(t2.gaps.map((g) => g.reason)).toEqual([
      'approval_not_found',
      'effect_absent'
    ])
  })

  it('a failing root source is unavailable, never not_found and never an empty trace', async () => {
    const boom: ApprovalReadPort = {
      get: async () => {
        throw new Error('RAW DATABASE ERROR')
      },
      listByOperationKey: async () => {
        throw new Error('RAW DATABASE ERROR')
      }
    }
    for (const input of [{ approvalId: 'a' }, { operationKey: 'k' }]) {
      const error = await failure(() =>
        traceQuery(world(happy()), { approvals: boom }).trace(input)
      )
      expect(error.code).toBe('unavailable')
      expect(error.message).not.toContain('RAW')
    }
  })

  it('a failing secondary source is a gap, the trace goes on', async () => {
    const w = world(happy())
    const trace = await traceQuery(w, {
      effects: {
        get: async () => {
          throw new Error('RAW')
        }
      }
    }).trace({ approvalId: 'appr_1' })
    expect(trace.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'effect', id: 'op-1' }
    })
    expect(trace.links.some((l) => l.kind === 'effect')).toBe(false)
    expect(trace.links.some((l) => l.kind === 'event')).toBe(true)
    expect(JSON.stringify(trace)).not.toContain('RAW')
  })

  it('a session that cannot be read and a listing that fails are gaps', async () => {
    const w = world({
      ...happy(),
      sessions: {},
      rows: [{ key: 1, summary: summary(1, { sessionId: 'ghost' }) }]
    })
    const gone = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(gone.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'session', id: 'sess-a' }
    })
    expect(gone.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'session', id: 'ghost' }
    })
    const noList = traceQuery(world(happy()), {
      directory: {
        window: async () => {
          throw new Error('RAW')
        }
      }
    })
    const t = await noList.trace({ approvalId: 'appr_1' })
    expect(t.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'sessions', id: 'listing' }
    })
    // without the listing the cut of the hinted session is unknown: its links are not published
    // as original (Q7/Q8/Q9); the gap says which session and why
    expect(t.links.filter((l) => l.kind === 'event')).toHaveLength(0)
    expect(t.gaps).toContainEqual({
      reason: 'source_unavailable',
      subject: { kind: 'session', id: 'sess-a' }
    })
  })

  it('an abort is a rejection with the reason, never a gap', async () => {
    const abort = new AbortController()
    abort.abort(new Error('caller left'))
    await expect(
      traceQuery(world(happy())).trace({
        approvalId: 'appr_1',
        signal: abort.signal
      })
    ).rejects.toThrow('caller left')
    for (const where of [
      'approvals',
      'effects',
      'events',
      'directory'
    ] as const) {
      const live = new AbortController()
      const w = world(happy())
      const extra: Record<string, unknown> = {}
      const trip = async () => {
        live.abort(new Error(`left at ${where}`))
        throw new Error('RAW')
      }
      if (where === 'approvals')
        extra.approvals = {
          get: async () => {
            await trip()
          },
          listByOperationKey: async () => []
        }
      if (where === 'effects') extra.effects = { get: trip }
      if (where === 'events') extra.events = { ...w.store, read: trip }
      if (where === 'directory') extra.directory = { window: trip }
      const q = traceQuery(
        where === 'directory'
          ? world({
              ...happy(),
              sessions: { x: [] },
              approvals: [noOrigin(APPROVAL)]
            })
          : w,
        extra
      )
      await expect(
        q.trace({ approvalId: 'appr_1', signal: live.signal }),
        where
      ).rejects.toThrow(`left at ${where}`)
    }
  })

  it('an abort during the last read of the log is still a rejection, not a trace with a gap', async () => {
    const live = new AbortController()
    const w = world(happy())
    const q = traceQuery(w, {
      budgets: { sessions: 1 },
      events: {
        ...w.store,
        read: async () => {
          live.abort(new Error('left at the last read'))
          throw new Error('RAW')
        }
      }
    })
    await expect(
      q.trace({ approvalId: 'appr_1', signal: live.signal })
    ).rejects.toThrow('left at the last read')
  })

  it('refuses malformed requests before reading anything', async () => {
    const w = world(happy())
    const q = traceQuery(w)
    for (const input of [
      {},
      { approvalId: 'a', operationKey: 'k' },
      { approvalId: '' },
      { approvalId: 'a\u0000b' },
      { operationKey: 'k'.repeat(4097) },
      { approvalId: 5 as never }
    ])
      expect((await failure(() => q.trace(input))).code).toBe('invalid_params')
    expect(w.reads_()).toBe(0)
  })

  it('says it is unsupported when the sources are not composed', async () => {
    const bare = createSessionQuery({
      tenantId: TENANT,
      directory: new InMemorySessionDirectory([])
    })
    expect((await failure(() => bare.trace({ approvalId: 'a' }))).code).toBe(
      'unsupported'
    )
  })
})

describe('ambiguity, divergence and inheritance (F04)', () => {
  it('returns every approval of a key without choosing, and flags it', async () => {
    const second: TraceApproval = noOrigin({
      ...APPROVAL,
      approvalId: 'appr_2',
      executionRef: 'exec-2'
    })
    const w = world({ ...happy(), approvals: [APPROVAL, second] })
    const trace = await traceQuery(w).trace({ operationKey: 'op-1' })
    expect(
      trace.links
        .filter((l) => l.kind === 'approval')
        .map((l) => (l as { approvalId: string }).approvalId)
    ).toEqual(['appr_1', 'appr_2'])
    expect(trace.gaps.map((g) => g.reason)).toEqual([
      'ambiguous_approval',
      'execution_ref_mismatch',
      'origin_unbound'
    ])
    expect(
      trace.gaps.find((g) => g.reason === 'execution_ref_mismatch')?.subject
    ).toEqual({ kind: 'approval', id: 'appr_2' })
  })

  it('caps the approval candidates and says so', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      ...APPROVAL,
      approvalId: `a${String(i).padStart(2, '0')}`
    }))
    const trace = await traceQuery(
      world({ ...happy(), approvals: many })
    ).trace({ operationKey: 'op-1' })
    expect(trace.links.filter((l) => l.kind === 'approval')).toHaveLength(10)
    expect(trace.gaps.map((g) => g.reason)).toContain('candidates_capped')
  })

  it('an approval without an operation key has no effect and no events to follow', async () => {
    const { operationKey: _k, ...bare } = APPROVAL
    void _k
    const trace = await traceQuery(
      world({ ...happy(), approvals: [bare] })
    ).trace({ approvalId: 'appr_1' })
    expect(trace.links.map((l) => l.kind)).toEqual(['approval'])
    expect(trace.gaps).toEqual([
      { reason: 'effect_absent', subject: { kind: 'approval', id: 'appr_1' } }
    ])
  })

  it('an effect without an execution ref raises no mismatch, and an absent effect is a gap', async () => {
    const noRef = world({
      ...happy(),
      effects: { 'op-1': { state: 'CONFIRMED' } }
    })
    expect(
      (await traceQuery(noRef).trace({ approvalId: 'appr_1' })).gaps
    ).toEqual([])
    const absent = world({ ...happy(), effects: {} })
    expect(
      (await traceQuery(absent).trace({ approvalId: 'appr_1' })).gaps
    ).toEqual([
      { reason: 'effect_absent', subject: { kind: 'operationKey', id: 'op-1' } }
    ])
  })

  it('an event copied into a fork is marked inherited and is not a second candidate', async () => {
    const parent = [
      startEv('parent', 1, 'c1'),
      callEv('parent', 2, 'c1', 'tool-a', 'op-1'),
      resultEv('parent', 3, 'c1', 'tool-a'),
      endEv('parent', 4, 'c1')
    ]
    const child = parent.map((e) => ({
      ...e,
      sessionId: 'child',
      eventId: `${e.eventId}-copy`
    }))
    const w = world({
      sessions: { parent, child },
      approvals: [{ ...APPROVAL, originSessionId: 'parent' }],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } },
      rows: [
        { key: 1, summary: summary(1, { sessionId: 'parent' }) },
        {
          key: 2,
          summary: summary(2, {
            sessionId: 'child',
            parentSession: 'parent',
            origin: 'subagent',
            inheritedEventCount: 4
          })
        }
      ]
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    const calls = trace.links.filter(
      (l) => l.kind === 'event' && l.type === 'tool/call'
    )
    expect(
      calls
        .map((l) => (l as { sessionId: string; inherited: boolean }).inherited)
        .sort()
    ).toEqual([false, true])
    expect(trace.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
  })

  it('orders the links by session and sequence whatever the order the sessions were read in', async () => {
    const w = world({
      sessions: {
        s9: [callEv('s9', 1, 'c9', 't', 'op-1')],
        s1: [callEv('s1', 1, 'c1', 't', 'op-1')]
      },
      approvals: [{ ...APPROVAL, originSessionId: 's9' }],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } },
      rows: [
        { key: 1, summary: summary(1, { sessionId: 's1' }) },
        { key: 2, summary: summary(2, { sessionId: 's9' }) }
      ]
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(w.reads[0]!.startsWith('s9:')).toBe(true)
    expect(
      trace.links
        .filter((l) => l.kind === 'event')
        .map((l) => (l as { sessionId: string }).sessionId)
    ).toEqual(['s1', 's9'])
  })

  it('two real calls with the same key in two sessions are both returned and flagged', async () => {
    const w = world({
      sessions: {
        s1: [callEv('s1', 1, 'c1', 't', 'op-1')],
        s2: [callEv('s2', 1, 'c2', 't', 'op-1')]
      },
      approvals: [noOrigin(APPROVAL)],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } }
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(trace.links.filter((l) => l.kind === 'event')).toHaveLength(2)
    expect(trace.gaps.map((g) => g.reason)).toContain(
      'multiple_event_candidates'
    )
  })

  it('the same tool twice in one turn leaves the result ambiguous', async () => {
    const w = world({
      sessions: {
        s1: [
          callEv('s1', 1, 'c', 't', 'op-1'),
          callEv('s1', 2, 'c', 't', 'op-2'),
          resultEv('s1', 3, 'c', 't')
        ]
      },
      approvals: [{ ...APPROVAL, originSessionId: 's1' }],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } }
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(trace.gaps).toContainEqual({
      reason: 'tool_result_ambiguous',
      subject: { kind: 'session', id: 's1' }
    })
    expect(
      trace.links.some((l) => l.kind === 'event' && l.type === 'tool/result')
    ).toBe(false)
  })

  it('a result that comes before its call is not paired', async () => {
    const w = world({
      sessions: {
        s1: [resultEv('s1', 1, 'c', 't'), callEv('s1', 2, 'c', 't', 'op-1')]
      },
      approvals: [{ ...APPROVAL, originSessionId: 's1' }],
      effects: { 'op-1': { state: 'CONFIRMED' } }
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(
      trace.links.some((l) => l.kind === 'event' && l.type === 'tool/result')
    ).toBe(false)
  })
})

describe('the global budgets (F03, SPEC 0295 §5.3)', () => {
  const noMatch = (id: string, n: number): SessionEvent[] =>
    Array.from({ length: n }, (_, i) => startEv(id, i + 1, `c${i}`))
  const noEffect: World = {
    sessions: {},
    approvals: [APPROVAL],
    effects: { 'op-1': { state: 'CONFIRMED' } }
  }

  it('stops at 20 sessions', async () => {
    const sessions: Record<string, SessionEvent[]> = {}
    for (let i = 1; i <= 25; i++) sessions[`n${i}`] = noMatch(`n${i}`, 1)
    const w = world({
      ...noEffect,
      sessions,
      approvals: [noOrigin(APPROVAL)]
    })
    const trace = await traceQuery(w, { budgets: { calls: 100 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.truncated).toBe(true)
    expect(trace.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'sessions', id: 'sessions' }
    })
    expect(trace.gaps.map((g) => g.reason)).not.toContain('event_not_found')
    expect(new Set(w.reads.map((r) => r.split(':')[0])).size).toBe(20)
  })

  it('stops at 5000 events: a log of 10001 events with no match ends by budget, not by a full scan', async () => {
    const big = noMatch('big', 10_001)
    const w = world({
      ...noEffect,
      sessions: { big },
      approvals: [{ ...APPROVAL, originSessionId: 'big' }]
    })
    const trace = await traceQuery(w, { budgets: { calls: 100 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.truncated).toBe(true)
    expect(trace.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'events', id: 'events' }
    })
    expect(trace.links.filter((l) => l.kind === 'event')).toEqual([])
    const asked = w.reads.map((r) => Number(r.split(':')[2]))
    expect(asked.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(
      SESSION_TRACE_BUDGETS.events
    )
    expect(Math.max(...asked)).toBe(100)
  })

  it('stops at 30 reads', async () => {
    const big = noMatch('big', 10_001)
    const w = world({
      ...noEffect,
      sessions: { big },
      approvals: [{ ...APPROVAL, originSessionId: 'big' }]
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(trace.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'calls', id: 'calls' }
    })
    expect(w.reads_()).toBe(28) // 30 minus the approval read and the effect read
  })

  it('stops at the deadline', async () => {
    let now = 0
    const w = world(happy())
    const trace = await traceQuery(w, {
      monotonicMs: () => (now += 3000)
    }).trace({ approvalId: 'appr_1' })
    expect(trace.truncated).toBe(true)
    expect(
      trace.gaps.some(
        (g) => g.reason === 'budget_exhausted' && g.subject?.kind === 'deadline'
      )
    ).toBe(true)
  })

  it('stops at 100 links', async () => {
    const sessions: Record<string, SessionEvent[]> = {}
    for (let i = 1; i <= 8; i++)
      sessions[`m${i}`] = [callEv(`m${i}`, 1, 'c', 't', 'op-1')]
    const w = world({
      ...noEffect,
      sessions,
      approvals: [noOrigin(APPROVAL)]
    })
    const trace = await traceQuery(w, { budgets: { links: 4 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.links).toHaveLength(4)
    expect(trace.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'links', id: 'links' }
    })
    expect(trace.truncated).toBe(true)
  })

  it('a blocked first read is an unavailable trace, not a silent empty one', async () => {
    const w = world(happy())
    const error = await failure(() =>
      traceQuery(w, { budgets: { calls: 0 } }).trace({ approvalId: 'appr_1' })
    )
    expect(error.code).toBe('unavailable')
  })

  it('a budget reached after the effect read skips the log and the gaps say so', async () => {
    const w = world(happy())
    const trace = await traceQuery(w, { budgets: { calls: 2 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.truncated).toBe(true)
    expect(trace.links.map((l) => l.kind)).toEqual(['approval', 'effect'])
  })

  it('uses the wall clock when none is composed', async () => {
    const w = world(happy())
    const q = createSessionQuery({
      tenantId: TENANT,
      directory: new InMemorySessionDirectory(w.rows),
      events: w.store,
      approvals: w.approvals,
      effects: w.effects
    })
    const trace = await q.trace({ approvalId: 'appr_1' })
    expect(Number.isNaN(Date.parse(trace.observed.approval!))).toBe(false)
  })

  it('links an approval that carries neither an execution ref nor an origin', async () => {
    const bare: TraceApproval = {
      approvalId: 'appr_b',
      operationKey: 'op-1',
      status: 'APPROVED'
    }
    const trace = await traceQuery(
      world({ ...happy(), approvals: [bare] })
    ).trace({ approvalId: 'appr_b' })
    expect(trace.links[0]).toEqual({
      kind: 'approval',
      approvalId: 'appr_b',
      status: 'APPROVED'
    })
    expect(trace.gaps.map((g) => g.reason)).toContain('origin_unbound')
  })

  it('reports an ambiguous result once even when both calls carry the key', async () => {
    const w = world({
      sessions: {
        s1: [
          callEv('s1', 1, 'c', 't', 'op-1'),
          callEv('s1', 2, 'c', 't', 'op-1'),
          resultEv('s1', 3, 'c', 't')
        ]
      },
      approvals: [{ ...APPROVAL, originSessionId: 's1' }],
      effects: { 'op-1': { state: 'CONFIRMED', executionRef: 'exec-1' } }
    })
    const trace = await traceQuery(w).trace({ approvalId: 'appr_1' })
    expect(
      trace.gaps.filter((g) => g.reason === 'tool_result_ambiguous')
    ).toHaveLength(1)
    expect(trace.links.filter((l) => l.kind === 'event')).toHaveLength(2)
  })

  it('a budget reached while the listing is read ends the search with the budget gap', async () => {
    const w = world({ ...happy(), approvals: [noOrigin(APPROVAL)] })
    const trace = await traceQuery(w, { budgets: { calls: 2 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.truncated).toBe(true)
    expect(trace.gaps).toContainEqual({
      reason: 'budget_exhausted',
      subject: { kind: 'calls', id: 'calls' }
    })
    expect(w.reads_()).toBe(0)
  })

  it('walks a second page of the listing when the first hundred sessions do not hold the key', async () => {
    const sessions: Record<string, SessionEvent[]> = {}
    for (let i = 1; i <= 150; i++)
      sessions[`p${i}`] = i === 1 ? [callEv('p1', 1, 'c', 't', 'op-1')] : []
    const w = world({ ...noEffect, sessions, approvals: [noOrigin(APPROVAL)] })
    const trace = await traceQuery(w, {
      budgets: { sessions: 200, calls: 400 }
    }).trace({ approvalId: 'appr_1' })
    expect(trace.links.filter((l) => l.kind === 'event')).toHaveLength(1)
    expect(trace.truncated).toBe(false)
    expect(w.reads_()).toBe(150)
  })

  it('exactly the budgeted number of sessions, all of them read, is not a truncation', async () => {
    const sessions: Record<string, SessionEvent[]> = {}
    for (let i = 1; i <= 20; i++) sessions[`q${i}`] = []
    const w = world({ ...noEffect, sessions, approvals: [noOrigin(APPROVAL)] })
    const trace = await traceQuery(w, { budgets: { calls: 100 } }).trace({
      approvalId: 'appr_1'
    })
    expect(trace.truncated).toBe(false)
    expect(trace.gaps.map((g) => g.reason)).toEqual([
      'event_not_found',
      'origin_unbound'
    ])
  })

  describe('bytes are UTF-8 bytes, not UTF-16 units (R2)', () => {
    const size = (events: SessionEvent[]) =>
      events.map((e) => Buffer.byteLength(JSON.stringify(e), 'utf8'))
    const units = (events: SessionEvent[]) =>
      events.map((e) => JSON.stringify(e).length)
    const run = (events: SessionEvent[], bytes: number) =>
      traceQuery(
        world({
          ...noEffect,
          sessions: { s: events },
          approvals: [{ ...APPROVAL, originSessionId: 's' }]
        }),
        {
          budgets: { bytes }
        }
      ).trace({ approvalId: 'appr_1' })

    it('ascii: the exact total passes and one byte less stops at the boundary', async () => {
      const events = [
        startEv('s', 1, 'a'),
        callEv('s', 2, 'a', 't', 'op-1'),
        endEv('s', 3, 'a')
      ]
      const total = size(events).reduce((a, b) => a + b, 0)
      const ok = await run(events, total)
      expect(ok.truncated).toBe(false)
      expect(ok.links.filter((l) => l.kind === 'event')).toHaveLength(2)
      const short = await run(events, total - 1)
      expect(short.truncated).toBe(true)
      expect(short.gaps).toContainEqual({
        reason: 'budget_exhausted',
        subject: { kind: 'bytes', id: 'bytes' }
      })
      // the event that would have crossed is neither examined nor linked
      expect(
        short.links.filter((l) => l.kind === 'event' && l.type === 'turn/end')
      ).toEqual([])
    })

    it('multibyte: a budget the UTF-16 length would pass is exhausted by the bytes', async () => {
      const events = [
        startEv('s', 1, 'a'),
        callEv('s', 2, 'a', 't', 'op-1', { note: '漢'.repeat(400) }),
        callEv('s', 3, 'a', 't2', 'op-9', { note: '😀'.repeat(300) })
      ]
      const lengthTotal = units(events).reduce((a, b) => a + b, 0)
      const byteTotal = size(events).reduce((a, b) => a + b, 0)
      expect(byteTotal).toBeGreaterThan(lengthTotal)
      const trace = await run(events, lengthTotal + 1)
      expect(trace.truncated).toBe(true)
      expect(trace.gaps).toContainEqual({
        reason: 'budget_exhausted',
        subject: { kind: 'bytes', id: 'bytes' }
      })
      const generous = await run(events, byteTotal)
      expect(generous.truncated).toBe(false)
    })

    it('oversized: a single event over the whole budget is not examined and leaves no link', async () => {
      const events = [
        callEv('s', 1, 'a', 't', 'op-1', { note: 'x'.repeat(5000) })
      ]
      const trace = await run(events, 2000)
      expect(trace.truncated).toBe(true)
      expect(trace.links.filter((l) => l.kind === 'event')).toEqual([])
      expect(trace.gaps.map((g) => g.reason)).not.toContain('event_not_found')
      expect(trace.gaps).toContainEqual({
        reason: 'budget_exhausted',
        subject: { kind: 'bytes', id: 'bytes' }
      })
    })
  })
})

describe('the tenant of the composition', () => {
  it('passes only its own tenant to every port', async () => {
    const seen: string[] = []
    const w = world(happy())
    const trace = await traceQuery(w, {
      approvals: {
        get: async (t: string, id: string) => {
          seen.push(`approval:${t}`)
          return w.approvals.get(t, id)
        },
        listByOperationKey: async (t: string) => {
          seen.push(`list:${t}`)
          return []
        }
      },
      effects: {
        get: async (t: string, k: string) => {
          seen.push(`effect:${t}`)
          return w.effects.get(t, k)
        }
      },
      events: {
        ...w.store,
        read: async (input: { tenantId: string; sessionId: string }) => {
          seen.push(`events:${input.tenantId}`)
          return w.store.read(input as never)
        }
      }
    }).trace({ approvalId: 'appr_1' })
    expect(trace.links.length).toBeGreaterThan(0)
    expect([...new Set(seen.map((s) => s.split(':')[1]))]).toEqual([TENANT])
  })
})
