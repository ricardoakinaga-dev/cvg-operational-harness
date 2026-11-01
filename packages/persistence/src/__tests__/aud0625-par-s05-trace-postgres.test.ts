// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { SessionEvent } from '@cvg/harness-contracts'
import {
  SessionQueryError,
  createSessionQuery,
  materializeSessionEvent
} from '@cvg/harness'
import { runPostgresMigrations } from '../postgres-migrations.ts'
import {
  PostgresSessionEventStore,
  runSessionQueryMigrations
} from '../session-events.ts'
import { PostgresSessionDirectory } from '../session-query-postgres.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence
} from '../session-persistence.ts'
import {
  PostgresApprovalReadPort,
  PostgresEffectJournalReadPort,
  TraceReadError
} from '../trace-read-ports.ts'

/**
 * PAR-S05 slice 3 (SPEC 0295 §5): the trace over the durable approval table, the effect journal
 * (default schema) and the session log (dedicated schema), as one tenant-bound query. Needs a
 * disposable database through TEST_DATABASE_URL. Synthetic data only.
 */
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S05_PG_REQUIRED === '1')
  throw new Error('PAR-S05 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(5).toString('hex')
const sess = `pars05s_${suffix}`
const data = `pars05d_${suffix}`
const role = `pars05t_${suffix}`
const password = 'pars05-trace-synthetic'
const tenantA = 'tenant_00000000-0000-4000-8000-0000000005a1'
const tenantB = 'tenant_00000000-0000-4000-8000-0000000005b1'
let admin: Client
let dataPool: Pool
let sessPool: Pool
let roleUrl: string

const mk = (
  tenantId: string,
  sessionId: string,
  sequence: number,
  type: SessionEvent['type'],
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-${sequence}`,
      timestamp: '2026-10-31T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as never,
    sequence
  )
const header = (id: string, extra: Record<string, unknown> = {}) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false,
  ...extra
})
const service = (tenantId = tenantA) =>
  createPostgresSessionPersistence(
    createPgPhysicalSessionPool({ connectionString: roleUrl }),
    sessPool as never,
    { tenantId, schemaName: sess, maxOpenWriters: 4, acquireTimeoutMs: 3000 }
  ).then((r) => r.service)
async function withLog(tenantId: string, id: string, key: string, c = 'c1') {
  const svc = await service(tenantId)
  const w = await svc.create(header(id))
  await w.append([
    mk(tenantId, id, 1, 'turn/start', c, { correlationId: c }),
    mk(tenantId, id, 2, 'tool/call', c, {
      correlationId: c,
      toolId: 'tool-a',
      operationKey: key,
      input: { secret: 'NAO-DEVE-SAIR' }
    }),
    mk(tenantId, id, 3, 'tool/result', c, {
      correlationId: c,
      toolId: 'tool-a',
      outcome: 'succeeded'
    }),
    mk(tenantId, id, 4, 'turn/end', c, {
      correlationId: c,
      stopReason: 'COMPLETED'
    })
  ])
  await w.close()
  return svc
}
async function approval(
  tenantId: string,
  id: string,
  key: string | null,
  ref: string | null,
  origin?: string,
  at = '2026-10-31T00:00:00Z'
) {
  // Wave 7 integration: with migration 0035 the origin is immutable, so it is written on INSERT
  // (the conversation id is required whenever a session id is set).
  await admin.query(
    `INSERT INTO ${data}.runtime_approvals
       (tenant_id, approval_id, operator_id, agent_id, agent_version, action, resource_type, payload_hash, policy_version,
        correlation_id, status, single_use, requested_at, expires_at, execution_count, operation_key, execution_ref,
        origin_conversation_id, origin_session_id)
     VALUES ($1,$2,'op','agent','v','a','r','h','p','c','REQUESTED',true,$3::timestamptz,$3::timestamptz + interval '1 day',0,$4,$5,$6,$7)`,
    [
      tenantId,
      id,
      at,
      key,
      ref,
      origin === undefined ? null : `conv-${id}`,
      origin ?? null
    ]
  )
}
async function effect(
  tenantId: string,
  key: string,
  ref: string | null,
  state = 'CONFIRMED'
) {
  await admin.query(
    `INSERT INTO ${data}.effect_journal (tenant_id, operation_key, proposal_hash, state, attempt_id, execution_ref, expires_at)
     VALUES ($1,$2,'ph',$3,'att',$4, now() + interval '1 day')`,
    [tenantId, key, state, ref]
  )
}
const composed = (tenantId = tenantA, extra: Record<string, unknown> = {}) =>
  createSessionQuery({
    tenantId,
    directory: new PostgresSessionDirectory(sessPool as never, {
      tenantId,
      schemaName: sess
    }),
    events: new PostgresSessionEventStore(sessPool as never, {
      tenantId,
      schemaName: sess
    }),
    approvals: new PostgresApprovalReadPort(dataPool as never),
    effects: new PostgresEffectJournalReadPort(dataPool as never),
    ...extra
  })

describe.skipIf(!url)('PAR-S05 slice 3 — the trace over PostgreSQL', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: data })
    await runSessionQueryMigrations(admin, { schemaName: sess })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${sess}, ${data} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT ON ${sess}.session_events, ${sess}.session_streams TO ${role}`
    )
    await admin.query(
      `GRANT UPDATE (next_sequence) ON ${sess}.session_streams TO ${role}`
    )
    await admin.query(`GRANT SELECT ON ${sess}.schema_migrations TO ${role}`)
    await admin.query(
      `GRANT SELECT ON ${data}.runtime_approvals, ${data}.effect_journal TO ${role}`
    )
    const u = new URL(url!)
    u.username = role
    u.password = password
    roleUrl = u.toString()
    dataPool = new Pool({
      connectionString: roleUrl,
      max: 4,
      options: `-c search_path=${data}`
    })
    sessPool = new Pool({ connectionString: roleUrl, max: 4 })
  }, 120000)
  afterAll(async () => {
    await dataPool?.end()
    await sessPool?.end()
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${sess} CASCADE`)
      await admin.query(`DROP SCHEMA IF EXISTS ${data} CASCADE`)
      await admin.query(`DROP OWNED BY ${role}`).catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`)
      await admin.end()
    }
  })

  it('follows an approval to its effect and to the events of the log, without the tool input', async () => {
    await withLog(tenantA, 'happy-s', 'op-happy')
    await approval(tenantA, 'appr-happy', 'op-happy', 'exec-1')
    await effect(tenantA, 'op-happy', 'exec-1')
    for (const input of [
      { approvalId: 'appr-happy' },
      { operationKey: 'op-happy' }
    ]) {
      const trace = await composed().trace(input)
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
      expect(trace.links[1]).toEqual({
        kind: 'effect',
        operationKey: 'op-happy',
        state: 'CONFIRMED',
        executionRef: 'exec-1'
      })
      expect(trace.gaps.map((g) => g.reason)).toEqual(['origin_unbound'])
      expect(trace.truncated).toBe(false)
      expect(JSON.stringify(trace)).not.toContain('NAO-DEVE-SAIR')
    }
  })

  it('uses the origin session of the approval first once the 0291 column exists, and drops the unbound gap', async () => {
    await admin.query(
      `ALTER TABLE ${data}.runtime_approvals ADD COLUMN IF NOT EXISTS origin_session_id text`
    )
    await withLog(tenantA, 'origin-s', 'op-origin')
    await approval(tenantA, 'appr-origin', 'op-origin', 'exec-o', 'origin-s')
    await effect(tenantA, 'op-origin', 'exec-o')
    const trace = await composed().trace({ approvalId: 'appr-origin' })
    expect(trace.links[0]).toMatchObject({
      kind: 'approval',
      originSessionId: 'origin-s'
    })
    expect(trace.gaps).toEqual([])
    expect(trace.links.filter((l) => l.kind === 'event')).toHaveLength(3)
  })

  it('a foreign approval, a missing one and a foreign key are all not_found, the same way', async () => {
    await withLog(tenantA, 'iso-s', 'op-iso')
    await approval(tenantA, 'appr-iso', 'op-iso', 'exec-i')
    await effect(tenantA, 'op-iso', 'exec-i')
    const own = await composed(tenantA).trace({ approvalId: 'appr-iso' })
    expect(own.links.length).toBeGreaterThan(1)
    const outcomes: string[] = []
    for (const input of [
      { approvalId: 'appr-iso' },
      { approvalId: 'appr-missing' },
      { operationKey: 'op-iso' }
    ]) {
      try {
        await composed(tenantB).trace(input)
        outcomes.push('traced')
      } catch (error) {
        outcomes.push(
          `${(error as SessionQueryError).code}:${(error as Error).message}`
        )
      }
    }
    expect(outcomes).toEqual([
      'not_found:trace root not found',
      'not_found:trace root not found',
      'not_found:trace root not found'
    ])
  })

  it('two approvals of one key are both returned; a different execution ref is a gap and nothing is chosen', async () => {
    await withLog(tenantA, 'amb-s', 'op-amb')
    await approval(
      tenantA,
      'appr-amb-1',
      'op-amb',
      'exec-a',
      undefined,
      '2026-10-31T01:00:00Z'
    )
    await approval(
      tenantA,
      'appr-amb-2',
      'op-amb',
      'exec-b',
      undefined,
      '2026-10-31T00:00:00Z'
    )
    await effect(tenantA, 'op-amb', 'exec-a')
    const trace = await composed().trace({ operationKey: 'op-amb' })
    expect(
      trace.links
        .filter((l) => l.kind === 'approval')
        .map((l) => (l as { approvalId: string }).approvalId)
    ).toEqual(['appr-amb-1', 'appr-amb-2'])
    const reasons = trace.gaps.map((g) => g.reason)
    expect(reasons).toContain('ambiguous_approval')
    expect(trace.gaps).toContainEqual({
      reason: 'execution_ref_mismatch',
      subject: { kind: 'approval', id: 'appr-amb-2' }
    })
  })

  it('an absent effect is a gap; an approval with no key follows nothing', async () => {
    await approval(tenantA, 'appr-noeffect', 'op-noeffect', 'exec-n')
    const t1 = await composed().trace({ approvalId: 'appr-noeffect' })
    expect(t1.gaps.map((g) => g.reason)).toEqual(
      expect.arrayContaining(['effect_absent', 'event_not_found'])
    )
    await approval(tenantA, 'appr-nokey', null, null)
    const t2 = await composed().trace({ approvalId: 'appr-nokey' })
    expect(t2.links.map((l) => l.kind)).toEqual(['approval'])
  })

  it('an event copied into a fork is marked inherited and is not a second candidate', async () => {
    const svc = await withLog(tenantA, 'fork-parent', 'op-fork')
    const child = await svc.fork('fork-parent', header('fork-child'))
    await child.close()
    await approval(tenantA, 'appr-fork', 'op-fork', 'exec-f', 'fork-parent')
    await effect(tenantA, 'op-fork', 'exec-f')
    const trace = await composed().trace({ approvalId: 'appr-fork' })
    const calls = trace.links.filter(
      (l) => l.kind === 'event' && l.type === 'tool/call'
    ) as { sessionId: string; inherited: boolean }[]
    expect(calls.map((c) => [c.sessionId, c.inherited]).sort()).toEqual([
      ['fork-child', true],
      ['fork-parent', false]
    ])
    expect(trace.gaps.map((g) => g.reason)).not.toContain(
      'multiple_event_candidates'
    )
  })

  it('a source that fails is a gap for the effect and an unavailable error for the approval root', async () => {
    await withLog(tenantA, 'fail-s', 'op-fail')
    await approval(tenantA, 'appr-fail', 'op-fail', 'exec-x')
    await effect(tenantA, 'op-fail', 'exec-x')
    await admin.query(`REVOKE SELECT ON ${data}.effect_journal FROM ${role}`)
    try {
      const trace = await composed().trace({ approvalId: 'appr-fail' })
      expect(trace.gaps).toContainEqual({
        reason: 'source_unavailable',
        subject: { kind: 'effect', id: 'op-fail' }
      })
      expect(trace.links.some((l) => l.kind === 'approval')).toBe(true)
    } finally {
      await admin.query(`GRANT SELECT ON ${data}.effect_journal TO ${role}`)
    }
    await admin.query(`REVOKE SELECT ON ${data}.runtime_approvals FROM ${role}`)
    try {
      const error = await composed()
        .trace({ approvalId: 'appr-fail' })
        .catch((e: SessionQueryError) => e)
      expect((error as SessionQueryError).code).toBe('unavailable')
      expect((error as Error).message).not.toMatch(
        /permission|runtime_approvals/i
      )
    } finally {
      await admin.query(`GRANT SELECT ON ${data}.runtime_approvals TO ${role}`)
    }
  })

  it('an abort stops the trace with the reason of the signal', async () => {
    const abort = new AbortController()
    abort.abort(new Error('caller left'))
    await expect(
      composed().trace({ approvalId: 'appr-happy', signal: abort.signal })
    ).rejects.toThrow('caller left')
  })

  it('F02: a signal that aborts while the connection is leased cancels every port, with a rollback', async () => {
    // the abort fires after the real lease and before the first statement
    const sent: string[] = []
    const leasing = (abort: AbortController) =>
      new Proxy(dataPool, {
        get(target, prop, receiver) {
          if (prop !== 'connect') return Reflect.get(target, prop, receiver)
          return async () => {
            const client = await target.connect()
            const query = client.query.bind(client) as (
              ...a: unknown[]
            ) => Promise<unknown>
            // from the lease on, nothing may be sent to the database
            client.query = (async (...args: unknown[]) => {
              if (
                /BEGIN READ ONLY|runtime_approvals|effect_journal/.test(
                  String(args[0])
                )
              )
                sent.push(String(args[0]))
              return query(...args)
            }) as never
            abort.abort()
            return client
          }
        }
      }) as never
    for (const run of [
      (pool: never, signal: AbortSignal) =>
        new PostgresApprovalReadPort(pool).get(tenantA, 'appr-happy', signal),
      (pool: never, signal: AbortSignal) =>
        new PostgresApprovalReadPort(pool).listByOperationKey(
          tenantA,
          'op-amb',
          5,
          signal
        ),
      (pool: never, signal: AbortSignal) =>
        new PostgresEffectJournalReadPort(pool).get(tenantA, 'op-happy', signal)
    ]) {
      const abort = new AbortController()
      await expect(run(leasing(abort), abort.signal)).rejects.toMatchObject({
        code: 'cancelled'
      })
    }
    expect(sent).toEqual([])
    // the connection went back to the pool clean: the next read works
    expect(
      await new PostgresEffectJournalReadPort(dataPool as never).get(
        tenantA,
        'op-none'
      )
    ).toBeUndefined()
  })

  it('F02: a read that finishes after the abort is not handed over', async () => {
    const abort = new AbortController()
    const slow = new Proxy(dataPool, {
      get(target, prop, receiver) {
        if (prop !== 'connect') return Reflect.get(target, prop, receiver)
        return async () => {
          const client = await target.connect()
          const query = client.query.bind(client) as (
            ...a: unknown[]
          ) => Promise<unknown>
          client.query = (async (...args: unknown[]) => {
            const out = await query(...args)
            // the caller leaves once the data has been read, before the COMMIT
            if (String(args[0]).includes('FROM effect_journal')) abort.abort()
            return out
          }) as never
          return client
        }
      }
    }) as never
    await expect(
      new PostgresEffectJournalReadPort(slow).get(
        tenantA,
        'op-happy',
        abort.signal
      )
    ).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('the ports refuse a bad tenant, a bad limit and an aborted call', async () => {
    const approvals = new PostgresApprovalReadPort(dataPool as never)
    const effects = new PostgresEffectJournalReadPort(dataPool as never)
    await expect(approvals.get('not-a-tenant', 'x')).rejects.toMatchObject({
      code: 'invalid_input'
    })
    await expect(
      approvals.listByOperationKey(tenantA, 'k', 0)
    ).rejects.toMatchObject({ code: 'invalid_input' })
    await expect(
      approvals.listByOperationKey(tenantA, 'k', 101)
    ).rejects.toMatchObject({ code: 'invalid_input' })
    const abort = new AbortController()
    abort.abort()
    await expect(effects.get(tenantA, 'k', abort.signal)).rejects.toMatchObject(
      { code: 'cancelled' }
    )
    await expect(
      approvals.get(tenantA, 'x', abort.signal)
    ).rejects.toBeInstanceOf(TraceReadError)
    const dead = {
      connect: async () => {
        throw new Error('down')
      }
    }
    await expect(
      new PostgresEffectJournalReadPort(dead as never).get(tenantA, 'k')
    ).rejects.toMatchObject({ code: 'unavailable' })
    // an abort that arrives while the read is failing is a cancellation, not a failure of the source
    const leaving = new AbortController()
    const leaves = {
      connect: async () => {
        leaving.abort()
        throw new Error('down')
      }
    }
    await expect(
      new PostgresEffectJournalReadPort(leaves as never).get(
        tenantA,
        'k',
        leaving.signal
      )
    ).rejects.toMatchObject({ code: 'cancelled' })
    expect(await effects.get(tenantA, 'op-none')).toBeUndefined()
    expect(await approvals.get(tenantB, 'appr-happy')).toBeUndefined()
    expect(
      (await approvals.listByOperationKey(tenantA, 'op-amb', 1)).map(
        (a) => a.approvalId
      )
    ).toEqual(['appr-amb-2'])
    expect(
      (await approvals.listByOperationKey(tenantA, 'op-amb', 5)).map(
        (a) => a.approvalId
      )
    ).toEqual(['appr-amb-2', 'appr-amb-1'])
  })
})
