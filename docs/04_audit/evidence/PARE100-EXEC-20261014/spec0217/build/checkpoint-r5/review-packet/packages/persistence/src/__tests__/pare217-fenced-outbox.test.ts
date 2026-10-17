import { describe, expect, it, vi } from 'vitest'
import type { QueryResult, QueryResultRow } from 'pg'
import {
  PostgresRuntimeRepository,
  type DurableOutboxRow
} from '../postgres.ts'
import { renewOutboxClaimOnClient } from '../postgres-outbox.ts'
import {
  TenantScopedPostgresRuntimeRepository,
  type PostgresPoolClient
} from '../tenant-scoped-postgres.ts'
import type { FencedOuterClaimRef, FencedRenewalControl } from '../outbox.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const origin = Date.parse('2026-10-15T12:00:00.000Z')
const ref: FencedOuterClaimRef = {
  tenantId,
  eventId: 'outbox_synthetic217',
  processWorkerId: 'synthetic-worker:217',
  expectedOuterAttempt: 1,
  expectedAttemptRowId: '9007199254740993'
}
function control(): FencedRenewalControl {
  return { signal: new AbortController().signal, assertActive() {} }
}
function fixture() {
  let dbTime = origin
  let event: DurableOutboxRow = {
    id: ref.eventId,
    tenant_id: tenantId,
    type: 'synthetic217',
    envelope_version: 1,
    correlation_id: 'cor_00000000-0000-4000-8000-000000000217',
    idempotency_key: 'synthetic217',
    conversation_id: null,
    session_id: null,
    agent_id: null,
    agent_version_id: null,
    inbound_message_id: null,
    payload: {},
    status: 'processing',
    created_at: new Date(origin),
    available_at: new Date(origin),
    attempts: 1,
    lease_owner: ref.processWorkerId,
    lease_until: new Date(origin + 10000),
    last_error: null,
    processed_at: null,
    dead_lettered_at: null,
    parent_event_id: null
  }
  type Attempt = {
    id: string
    attempt: number
    worker_id: string
    outcome: string | null
  }
  let attempts: Attempt[] = [
    {
      id: ref.expectedAttemptRowId,
      attempt: 1,
      worker_id: ref.processWorkerId,
      outcome: null
    }
  ]
  let marker: { event_id: string; result: unknown } | undefined
  let snapshot:
    | {
        event: DurableOutboxRow
        attempts: Attempt[]
        marker: typeof marker
        audits: number
      }
    | undefined
  let audits = 0
  let txActive = false
  const calls: { sql: string; values: unknown[] }[] = []
  const releases: (Error | undefined)[] = []
  let hook: ((sql: string) => void) | undefined
  let takeover = false
  let zeroUpdate = false
  let zeroAttempt = false
  const client: PostgresPoolClient = {
    async query<T extends QueryResultRow>(
      sql: string,
      values: unknown[] = []
    ): Promise<QueryResult<T>> {
      calls.push({ sql, values })
      hook?.(sql)
      let rows: unknown[] = []
      const sameFence = (attempt: unknown, id: unknown, worker: unknown) =>
        event.attempts === attempt &&
        event.lease_owner === worker &&
        event.status === 'processing' &&
        event.lease_until &&
        new Date(event.lease_until).getTime() > dbTime &&
        attempts.some(
          (a) =>
            a.id === id &&
            a.attempt === attempt &&
            a.worker_id === worker &&
            a.outcome === null
        )
      if (sql === 'BEGIN') {
        if (txActive) throw new Error('Nested BEGIN forbidden')
        snapshot = structuredClone({ event, attempts, marker, audits })
        txActive = true
      } else if (sql === 'COMMIT') {
        snapshot = undefined
        txActive = false
      } else if (sql === 'ROLLBACK') {
        if (snapshot) {
          ;({ event, attempts, marker, audits } = snapshot)
          snapshot = undefined
        }
        txActive = false
      } else if (sql === 'SHOW search_path')
        rows = [{ search_path: 'synthetic217' }]
      else if (sql.includes('NULLIF(current_setting'))
        rows = [{ tenant_id: null }]
      else if (sql.includes('clock_timestamp() AS db_now'))
        rows = [{ db_now: new Date(dbTime) }]
      else if (
        sql.trimStart().startsWith('SELECT') &&
        sql.includes('FROM outbox_events')
      ) {
        const due =
          event.status === 'processing' ? event.lease_until : event.available_at
        if (
          values[0] === tenantId &&
          (!sql.includes('SKIP LOCKED') ||
            (due && new Date(due).getTime() <= dbTime))
        )
          rows = [structuredClone(event)]
      } else if (
        sql.trimStart().startsWith('SELECT') &&
        sql.includes('FROM outbox_attempts')
      ) {
        const found = sql.includes('id = $3::bigint')
          ? attempts.filter(
              (a) =>
                a.id === values[2] &&
                a.worker_id === values[3] &&
                a.attempt === values[4] &&
                !attempts.some((b) => BigInt(b.id) > BigInt(a.id))
            )
          : attempts.filter(
              (a) =>
                a.attempt === values[2] &&
                a.worker_id === values[3] &&
                a.outcome === null
            )
        rows = structuredClone(found)
      } else if (sql.includes('UPDATE outbox_events')) {
        if (!zeroUpdate) {
          if (sql.includes('attempts = attempts + 1')) {
            event = {
              ...event,
              status: 'processing',
              attempts: event.attempts + 1,
              lease_owner: String(values[2]),
              lease_until: values[3] as Date,
              available_at: values[1] as Date
            }
            rows = [structuredClone(event)]
          } else if (sql.includes('SET lease_until')) {
            if (sameFence(values[3], values[6], values[2])) {
              event.lease_until = values[5] as Date
              rows = [structuredClone(event)]
            }
          } else if (sql.includes("status = 'processed'")) {
            if (
              !sql.includes('AND attempts =') ||
              sameFence(values[4], values[5], values[3])
            ) {
              event = {
                ...event,
                status: 'processed',
                processed_at: values[2] as Date,
                lease_owner: null,
                lease_until: null
              }
              rows = [structuredClone(event)]
            }
          } else if (sql.includes("status = 'dead_letter'")) {
            if (
              !sql.includes('AND attempts =') ||
              sameFence(values[5], values[6], values[4])
            ) {
              event = {
                ...event,
                status: 'dead_letter',
                dead_lettered_at: values[2] as Date,
                lease_owner: null,
                lease_until: null
              }
              rows = [structuredClone(event)]
            }
          } else if (sql.includes('SET status = $3')) {
            if (
              !sql.includes('AND attempts =') ||
              sameFence(values[7], values[8], values[6])
            ) {
              event = {
                ...event,
                status: values[2] as DurableOutboxRow['status'],
                available_at: values[3] as Date,
                lease_owner: null,
                lease_until: null,
                last_error: String(values[4])
              }
              rows = [structuredClone(event)]
            }
          }
        }
      } else if (sql.includes('INSERT INTO outbox_attempts')) {
        const nextId = String(
          attempts.reduce(
            (max, a) => (BigInt(a.id) > max ? BigInt(a.id) : max),
            9007199254740992n
          ) + 1n
        )
        attempts.push({
          id: nextId,
          attempt: Number(values[2]),
          worker_id: String(values[3]),
          outcome: null
        })
        rows = [{ id: nextId }]
      } else if (sql.includes('UPDATE outbox_attempts')) {
        const idIndex = sql.includes('id = $3::bigint')
          ? 2
          : sql.includes('id = $5::bigint')
            ? 4
            : sql.includes('id = $6::bigint')
              ? 5
              : 6
        for (const a of attempts) {
          if (
            a.outcome !== null ||
            (sql.includes('RETURNING') &&
              (zeroAttempt || a.id !== values[idIndex]))
          )
            continue
          a.outcome = sql.includes("outcome = 'processed'")
            ? 'processed'
            : sql.includes("outcome = 'handoff'")
              ? 'handoff'
              : sql.includes("outcome = 'lease_expired'")
                ? 'lease_expired'
                : String(values[3])
          rows.push({ id: a.id })
        }
      } else if (
        sql.trimStart().startsWith('SELECT') &&
        sql.includes('FROM outbox_effects')
      )
        rows = marker ? [structuredClone(marker)] : []
      else if (sql.includes('INSERT INTO outbox_effects'))
        marker ??= {
          event_id: String(values[2]),
          result: JSON.parse(String(values[3]))
        }
      else if (sql.includes('INSERT INTO audit_events')) audits++
      else if (sql.includes('SELECT sessions.takeover_state'))
        rows = [{ takeover_state: takeover ? 'HUMAN_ACTIVE' : 'BOT_ACTIVE' }]
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        fields: [],
        oid: 0
      } as QueryResult<T>
    },
    release(error) {
      releases.push(error)
    }
  }
  const repo = new PostgresRuntimeRepository(client, {
    clock: () => new Date(origin)
  })
  const pool = { connect: vi.fn(async () => client) }
  const scoped = new TenantScopedPostgresRuntimeRepository(pool)
  return {
    repo,
    scoped,
    client,
    pool,
    calls,
    releases,
    get event() {
      return event
    },
    get attempts() {
      return attempts
    },
    get marker() {
      return marker
    },
    get audits() {
      return audits
    },
    get txActive() {
      return txActive
    },
    setTime(ms: number) {
      dbTime = ms
    },
    onQuery(fn: typeof hook) {
      hook = fn
    },
    setMarker(value: typeof marker) {
      marker = value
    },
    setTakeover(value: boolean) {
      takeover = value
      event.session_id = 'session_synthetic217'
    },
    setZeroUpdate() {
      zeroUpdate = true
    },
    setZeroAttempt() {
      zeroAttempt = true
    }
  }
}

function ackInput(
  f: ReturnType<typeof fixture>,
  extra: Record<string, unknown> = {}
) {
  return {
    tenantId,
    eventId: ref.eventId,
    workerId: ref.processWorkerId,
    claimRef: { ...ref },
    effect: vi.fn(async () => {
      expect(f.txActive).toBe(false)
      return { status: 'completed' }
    }),
    beforeFinalAck: vi.fn(async () => {
      expect(f.txActive).toBe(false)
    }),
    ...extra
  }
}

describe('SPEC0217 fenced PostgreSQL outbox (synthetic boundary)', () => {
  it('returns the attempt bigint identity without Number conversion and fixes claim TTL to 10s', async () => {
    const f = fixture()
    f.event.status = 'pending'
    f.event.attempts = 0
    f.attempts.length = 0
    f.setTime(origin + 2000)
    const claimed = await f.scoped.claimNextFenced({
      tenantId,
      workerId: ref.processWorkerId,
      leaseMs: 30000,
      now: new Date(0)
    })
    expect(claimed?.claimRef).toEqual(ref)
    expect(claimed?.dbClaimedAt).toBe(new Date(origin + 2000).toISOString())
    expect(claimed?.event.leaseUntil?.getTime()).toBe(origin + 12000)
    expect(
      f.calls.find((c) => c.sql.includes('INSERT INTO outbox_attempts'))?.sql
    ).toContain('RETURNING id::text AS id')
    expect(f.pool.connect).toHaveBeenCalledTimes(1)
    expect(f.releases).toEqual([undefined])
  })

  it('preserves the unbound claim clock and supplied TTL', async () => {
    const f = fixture()
    f.event.status = 'pending'
    f.event.attempts = 0
    f.attempts.length = 0
    const claimed = await f.repo.claimNext({
      tenantId,
      workerId: ref.processWorkerId,
      leaseMs: 30000
    })
    expect(claimed?.leaseUntil?.getTime()).toBe(origin + 30000)
    expect(
      f.calls.some((c) => c.sql.includes('clock_timestamp() AS db_now'))
    ).toBe(false)
    expect(
      f.calls.find((c) => c.sql.includes('INSERT INTO outbox_attempts'))?.sql
    ).not.toContain('RETURNING')
  })

  it('returns null when there is no due candidate', async () => {
    const f = fixture()
    expect(
      await f.repo.claimNextFenced({ tenantId, workerId: ref.processWorkerId })
    ).toBeNull()
    expect(
      f.calls.some((c) => c.sql.includes('INSERT INTO outbox_attempts'))
    ).toBe(false)
  })

  it('retires only the predecessor and claims with a fresh row identity', async () => {
    const f = fixture()
    f.setTime(origin + 10000)
    const claimed = await f.repo.claimNextFenced({
      tenantId,
      workerId: 'synthetic-worker:218'
    })
    expect(claimed?.claimRef.expectedOuterAttempt).toBe(2)
    expect(claimed?.claimRef.expectedAttemptRowId).toBe('9007199254740994')
    expect(f.attempts[0]?.outcome).toBe('lease_expired')
    expect(
      f.calls.find((c) => c.sql.includes('UPDATE outbox_attempts'))?.values[2]
    ).toBe(ref.expectedAttemptRowId)
  })

  it('renews on the supplied client without BEGIN/COMMIT/checkout and leaves attempt/availability untouched', async () => {
    const f = fixture()
    f.setTime(origin + 5000)
    const before = structuredClone(f.event)
    const renewed = await renewOutboxClaimOnClient(f.client, ref, control())
    expect(renewed).toEqual({
      claimRef: ref,
      dbNow: new Date(origin + 5000).toISOString(),
      leaseUntil: new Date(origin + 15000).toISOString()
    })
    expect(f.event.attempts).toBe(before.attempts)
    expect(f.event.available_at).toEqual(before.available_at)
    expect(f.attempts[0]?.outcome).toBeNull()
    expect(f.calls.map((c) => c.sql)).not.toContain('BEGIN')
    expect(f.pool.connect).not.toHaveBeenCalled()
    expect(
      f.calls.find((c) => c.sql.includes('FROM outbox_attempts'))?.values
    ).toEqual([
      tenantId,
      ref.eventId,
      ref.expectedAttemptRowId,
      ref.processWorkerId,
      1
    ])
  })

  it('root renewal uses exactly one checkout and transaction', async () => {
    const f = fixture()
    f.setTime(origin + 1000)
    expect((await f.scoped.renewOutboxClaim(ref, control())).leaseUntil).toBe(
      new Date(origin + 11000).toISOString()
    )
    expect(f.pool.connect).toHaveBeenCalledTimes(1)
    expect(f.calls.filter((c) => c.sql === 'BEGIN')).toHaveLength(1)
    expect(f.calls.filter((c) => c.sql === 'COMMIT')).toHaveLength(1)
    expect(f.releases).toEqual([undefined])
  })

  it('rereads DB time after waiting for the exact attempt row and refuses expired renewal', async () => {
    const f = fixture()
    f.onQuery((sql) => {
      if (sql.includes('FROM outbox_attempts')) f.setTime(origin + 10000)
    })
    await expect(
      renewOutboxClaimOnClient(f.client, ref, control())
    ).rejects.toThrow('lost its lease')
    expect(f.calls.some((c) => c.sql.includes('UPDATE outbox_events'))).toBe(
      false
    )
  })

  it.each(['failed', 'processed', 'dead_letter', 'pending'] as const)(
    'does not renew status %s',
    async (status) => {
      const f = fixture()
      f.event.status = status
      await expect(renewOutboxClaimOnClient(f.client, ref)).rejects.toThrow(
        'lost its lease'
      )
    }
  )

  it.each([
    'owner',
    'attempt',
    'row',
    'outcome',
    'null',
    'malformed',
    'expired',
    'newer-row'
  ])('does not renew invalid %s', async (kind) => {
    const f = fixture()
    if (kind === 'owner') f.event.lease_owner = 'other-worker'
    if (kind === 'attempt') f.event.attempts = 2
    if (kind === 'row') f.attempts[0]!.id = '9007199254740994'
    if (kind === 'outcome') f.attempts[0]!.outcome = 'failed'
    if (kind === 'null') f.event.lease_until = null
    if (kind === 'malformed') f.event.lease_until = 'invalid' as unknown as Date
    if (kind === 'expired') f.setTime(origin + 10000)
    if (kind === 'newer-row')
      f.attempts.push({ ...f.attempts[0]!, id: '9007199254740994' })
    await expect(renewOutboxClaimOnClient(f.client, ref)).rejects.toThrow(
      'lost its lease'
    )
    expect(f.calls.some((c) => c.sql.includes('UPDATE outbox_events'))).toBe(
      false
    )
  })

  it.each(['0', '01', '-1', '1.2', '9223372036854775808'])(
    'rejects malformed attempt row ID %s before SQL',
    async (id) => {
      const f = fixture()
      await expect(
        renewOutboxClaimOnClient(f.client, { ...ref, expectedAttemptRowId: id })
      ).rejects.toThrow('Invalid outbox attempt fence')
      expect(f.calls).toEqual([])
    }
  )

  it('rejects zero-row renewal CAS without claiming success', async () => {
    const f = fixture()
    f.setZeroUpdate()
    await expect(f.scoped.renewOutboxClaim(ref, control())).rejects.toThrow(
      'renewal lost its lease'
    )
    expect(f.calls.some((c) => c.sql === 'ROLLBACK')).toBe(true)
  })

  it('runs effect then hook outside locks between the two ACK transactions on one retained client', async () => {
    const f = fixture()
    const input = ackInput(f)
    expect((await f.scoped.ackClaim(input)).status).toBe('processed')
    expect(input.effect).toHaveBeenCalledTimes(1)
    expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
    expect(input.effect.mock.invocationCallOrder[0]).toBeLessThan(
      input.beforeFinalAck.mock.invocationCallOrder[0]!
    )
    expect(f.calls.filter((c) => c.sql === 'BEGIN')).toHaveLength(2)
    expect(f.calls.filter((c) => c.sql === 'COMMIT')).toHaveLength(2)
    expect(f.pool.connect).toHaveBeenCalledTimes(1)
    expect(f.attempts[0]?.outcome).toBe('processed')
    expect(f.audits).toBe(1)
    expect(f.marker?.event_id).toBe(ref.eventId)
  })

  it.each(['tenantId', 'eventId', 'workerId'])(
    'validates duplicate flat %s against claimRef before SQL',
    async (field) => {
      const f = fixture()
      const input = ackInput(f, { [field]: 'mismatched' })
      await expect(f.repo.ackClaim(input)).rejects.toThrow(
        'does not match claim ref'
      )
      expect(f.calls).toEqual([])
    }
  )

  it('denies stale ref after the effect and hook without updating the new owner', async () => {
    const f = fixture()
    const input = ackInput(f)
    input.beforeFinalAck.mockImplementation(async () => {
      expect(f.txActive).toBe(false)
      f.event.attempts = 2
      f.event.lease_owner = 'other-worker'
      f.attempts[0]!.outcome = 'lease_expired'
    })
    await expect(f.repo.ackClaim(input)).rejects.toThrow('lost its lease')
    expect(f.event.attempts).toBe(2)
    expect(f.marker).toBeUndefined()
    expect(f.event.status).toBe('processing')
  })

  it('does not finalize if the trusted hook rejects', async () => {
    const f = fixture()
    const failure = new Error('renewal failed')
    const input = ackInput(f)
    input.beforeFinalAck.mockRejectedValue(failure)
    await expect(f.repo.ackClaim(input)).rejects.toBe(failure)
    expect(f.calls.filter((c) => c.sql === 'BEGIN')).toHaveLength(1)
    expect(f.marker).toBeUndefined()
  })

  it('denies lease expiry during a takeover/session lock wait before effect', async () => {
    const f = fixture()
    f.setTakeover(false)
    f.onQuery((sql) => {
      if (sql.includes('SELECT sessions.takeover_state'))
        f.setTime(origin + 10000)
    })
    const input = ackInput(f)
    await expect(f.repo.ackClaim(input)).rejects.toThrow('lost its lease')
    expect(input.effect).not.toHaveBeenCalled()
  })

  it.each(['marker', 'processed'])(
    'skips effect for %s but still joins hook outside tx and validates final fence',
    async (kind) => {
      const f = fixture()
      f.setMarker({ event_id: ref.eventId, result: { status: 'completed' } })
      if (kind === 'processed') {
        f.event.status = 'processed'
        f.event.lease_owner = null
        f.event.lease_until = null
        f.attempts[0]!.outcome = 'processed'
      }
      const input = ackInput(f)
      expect((await f.repo.ackClaim(input)).status).toBe('processed')
      expect(input.effect).not.toHaveBeenCalled()
      expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
      expect(f.calls.filter((c) => c.sql === 'COMMIT')).toHaveLength(2)
    }
  )

  it('rejects processed replay for an older row even after attempt counter resets', async () => {
    const f = fixture()
    f.event.status = 'processed'
    f.event.lease_owner = null
    f.event.lease_until = null
    f.attempts[0]!.outcome = 'processed'
    f.attempts.push({ ...f.attempts[0]!, id: '9007199254740994' })
    f.setMarker({ event_id: ref.eventId, result: {} })
    await expect(f.repo.ackClaim(ackInput(f))).rejects.toThrow('lost its lease')
  })

  it('takeover skips effect, joins hook and settles only the exact attempt', async () => {
    const f = fixture()
    f.setTakeover(true)
    const input = ackInput(f)
    expect((await f.repo.ackClaim(input)).status).toBe('dead_letter')
    expect(input.effect).not.toHaveBeenCalled()
    expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
    expect(f.attempts[0]?.outcome).toBe('handoff')
    expect(f.marker).toBeUndefined()
    expect(
      f.calls.find((c) => c.sql.includes("SET status = 'dead_letter'"))?.sql
    ).toContain('id = $7::bigint')
  })

  it('fails with backoff and only the exact attempt row', async () => {
    const f = fixture()
    expect(
      (
        await f.scoped.failClaim({
          tenantId,
          eventId: ref.eventId,
          workerId: ref.processWorkerId,
          claimRef: ref,
          error: 'synthetic failure'
        })
      ).status
    ).toBe('failed')
    expect(f.event.available_at).toEqual(new Date(origin + 1000))
    expect(f.attempts[0]?.outcome).toBe('failed')
    expect(
      f.calls.find((c) => c.sql.includes('SET outcome = $4'))?.values.at(-1)
    ).toBe(ref.expectedAttemptRowId)
  })

  it('stale failure does not mutate a winning attempt', async () => {
    const f = fixture()
    f.event.attempts = 2
    await expect(
      f.repo.failClaim({
        tenantId,
        eventId: ref.eventId,
        workerId: ref.processWorkerId,
        claimRef: ref,
        error: 'failure'
      })
    ).rejects.toThrow('lost its lease')
    expect(f.calls.some((c) => c.sql.includes('UPDATE outbox_events'))).toBe(
      false
    )
  })

  it.each(['ack', 'fail', 'takeover'])(
    'rolls back %s if exact attempt settlement returns no row',
    async (kind) => {
      const f = fixture()
      f.setZeroAttempt()
      if (kind === 'takeover') f.setTakeover(true)
      const job =
        kind === 'fail'
          ? f.repo.failClaim({
              tenantId,
              eventId: ref.eventId,
              workerId: ref.processWorkerId,
              claimRef: ref,
              error: 'failure'
            })
          : f.repo.ackClaim(ackInput(f))
      await expect(job).rejects.toThrow('attempt row')
      expect(f.event.status).toBe('processing')
      expect(f.marker).toBeUndefined()
      expect(f.audits).toBe(0)
    }
  )

  it('unbound ACK retains two transactions and invokes no fenced query', async () => {
    const f = fixture()
    const input = ackInput(f)
    const unbound = {
      tenantId: input.tenantId,
      eventId: input.eventId,
      workerId: input.workerId,
      effect: input.effect
    }
    expect((await f.repo.ack(unbound)).status).toBe('processed')
    expect(f.calls.filter((c) => c.sql === 'COMMIT')).toHaveLength(2)
    expect(
      f.calls.some((c) => c.sql.includes('clock_timestamp() AS db_now'))
    ).toBe(false)
    expect(
      f.calls.some((c) => c.sql.includes('SELECT id::text AS id, outcome'))
    ).toBe(false)
  })

  it('fails final ACK if lease expires during the effect, leaving no marker', async () => {
    const f = fixture()
    const input = ackInput(f)
    input.effect.mockImplementation(async () => {
      f.setTime(origin + 10000)
      return { status: 'completed' }
    })
    await expect(f.repo.ackClaim(input)).rejects.toThrow('lost its lease')
    expect(input.beforeFinalAck).toHaveBeenCalledTimes(1)
    expect(f.marker).toBeUndefined()
    expect(f.event.status).toBe('processing')
  })

  it('does not suppress a replacement attempt after the takeover preparation transaction', async () => {
    const f = fixture()
    f.setTakeover(true)
    const input = ackInput(f)
    input.beforeFinalAck.mockImplementation(async () => {
      expect(f.txActive).toBe(false)
      f.event.attempts = 2
      f.event.lease_owner = 'other-worker'
    })
    await expect(f.repo.ackClaim(input)).rejects.toThrow('lost its lease')
    expect(input.effect).not.toHaveBeenCalled()
    expect(f.event.status).toBe('processing')
    expect(f.event.lease_owner).toBe('other-worker')
  })

  it('vetoes ACK commit when the signal aborts during the final audit', async () => {
    const f = fixture()
    const controller = new AbortController()
    f.onQuery((sql) => {
      if (sql.includes('INSERT INTO audit_events')) controller.abort()
    })
    await expect(
      f.repo.ackClaim({ ...ackInput(f), signal: controller.signal })
    ).rejects.toThrow('aborted')
    expect(f.event.status).toBe('processing')
    expect(f.marker).toBeUndefined()
    expect(f.audits).toBe(0)
  })

  it('does not begin ACK when the attempt is already aborted', async () => {
    const f = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(
      f.repo.ackClaim({ ...ackInput(f), signal: controller.signal })
    ).rejects.toThrow('aborted')
    expect(f.calls).toEqual([])
  })

  it('refuses expired fail and validates fail flat identity before SQL', async () => {
    const f = fixture()
    await expect(
      f.repo.failClaim({
        tenantId,
        eventId: 'other-event',
        workerId: ref.processWorkerId,
        claimRef: ref,
        error: 'failure'
      })
    ).rejects.toThrow('does not match claim ref')
    expect(f.calls).toEqual([])
    f.setTime(origin + 10000)
    await expect(
      f.repo.failClaim({
        tenantId,
        eventId: ref.eventId,
        workerId: ref.processWorkerId,
        claimRef: ref,
        error: 'failure'
      })
    ).rejects.toThrow('lost its lease')
    expect(f.calls.some((c) => c.sql.includes('UPDATE outbox_events'))).toBe(
      false
    )
  })

  it('preserves the unbound fail clock, backoff and original attempt predicate', async () => {
    const f = fixture()
    f.setTime(origin + 9999)
    expect(
      (
        await f.repo.fail({
          tenantId,
          eventId: ref.eventId,
          workerId: ref.processWorkerId,
          error: 'failure'
        })
      ).status
    ).toBe('failed')
    expect(f.event.available_at).toEqual(new Date(origin + 1000))
    expect(
      f.calls.some((c) => c.sql.includes('clock_timestamp() AS db_now'))
    ).toBe(false)
    expect(
      f.calls.find((c) => c.sql.includes('SET outcome = $4'))?.sql
    ).not.toContain('::bigint')
  })
})
