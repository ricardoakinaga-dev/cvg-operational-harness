// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- driver wrappers in negative tests */
import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type {
  ApprovalEngine,
  ApprovalRequest,
  PolicyEngine,
  SessionEvent,
  ToolDefinition
} from '@cvg/harness-contracts'
import {
  SessionAlreadyOwnedError,
  SessionOwnershipLostError,
  SessionPersistenceCorruptionError,
  SessionPersistenceNotFoundError,
  createOperationalHarness,
  createSessionKernelLog,
  materializeSessionEvent
} from '@cvg/harness'
import { runSessionEventMigrations } from '../session-events.ts'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  sessionEventStoreForHandle,
  verifySessionFork,
  type PostgresPhysicalSessionPool
} from '../session-persistence.ts'

// PAR-S04 slice 3: resumeSession (SPEC 0287 §5, FP07, FP08).
const url = process.env.TEST_DATABASE_URL
if (!url && process.env.PAR_S01_PG_REQUIRED === '1')
  throw new Error('PAR-S04 requires its own disposable TEST_DATABASE_URL')
const suffix = randomBytes(6).toString('hex')
const schema = `pars04r_${suffix}`
const role = `pars04r_role_${suffix}`
const password = 'pars04-synthetic-only'
const tenant = 'tenant-synthetic-A'
const hdr = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})

let admin: Client
let readPool: Pool
let roleUrl: string
let physical: PostgresPhysicalSessionPool
const service = (maxOpenWriters = 8, pool = physical) =>
  createPostgresSessionPersistence(pool, readPool, {
    tenantId: tenant,
    schemaName: schema,
    maxOpenWriters,
    acquireTimeoutMs: 3000
  }).then((r) => r.service)
const mk = (
  sessionId: string,
  sequence: number,
  type: SessionEvent['type'],
  correlationId: string,
  payload: Record<string, unknown>
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: tenant,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-${sequence}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId,
      traceId: `trace-${correlationId}`,
      type,
      payload
    } as any,
    sequence
  )
const completed = (sessionId: string, from: number, c: string) => [
  mk(sessionId, from, 'message/user', c, { text: `ask ${c}` }),
  mk(sessionId, from + 1, 'turn/start', c, { correlationId: c }),
  mk(sessionId, from + 2, 'turn/end', c, {
    correlationId: c,
    stopReason: 'COMPLETED'
  }),
  mk(sessionId, from + 3, 'message/assistant', c, { text: `answer ${c}` })
]
/** A crashed turn: asked, started, called a tool, never ended. */
const crashed = (sessionId: string, from: number, c: string) => [
  mk(sessionId, from, 'message/user', c, { text: `ask ${c}` }),
  mk(sessionId, from + 1, 'turn/start', c, { correlationId: c }),
  mk(sessionId, from + 2, 'tool/call', c, {
    correlationId: c,
    toolId: 'tool-a',
    operationKey: `op-${c}`,
    input: {}
  })
]
const counts = async (id: string) =>
  (
    await admin.query(
      `SELECT (SELECT count(*)::int FROM ${schema}.session_events WHERE session_id=$1) AS events,
              (SELECT next_sequence::int FROM ${schema}.session_streams WHERE session_id=$1) AS cursor`,
      [id]
    )
  ).rows[0]
async function holderPids(id: string): Promise<number[]> {
  return (
    await admin.query(
      `SELECT l.pid FROM pg_locks l WHERE l.locktype='advisory' AND l.objsubid=2 AND l.granted
       AND l.classid = ((SELECT '${schema}.session_streams'::regclass::oid::bigint + 2147483648) % 4294967296)::oid
       AND l.objid = (SELECT writer_lock_id FROM ${schema}.session_streams WHERE session_id=$1)::oid`,
      [id]
    )
  ).rows.map((r) => r.pid as number)
}
async function waitFor(check: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('condition not reached')
}
const logged = (log: string[]): PostgresPhysicalSessionPool => {
  const inner = createPgPhysicalSessionPool({ connectionString: roleUrl })
  return {
    acquire: async (o) => {
      const lease = await inner.acquire(o)
      return {
        backendPid: lease.backendPid,
        query: (sql: string, v?: unknown[]) => {
          log.push(sql)
          return lease.query(sql, v)
        },
        onLost: (l) => lease.onLost(l),
        release: () => lease.release(),
        destroy: () => lease.destroy()
      }
    }
  }
}
let seq = 0

describe.skipIf(!url)('PAR-S04 slice 3: resumeSession', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runSessionEventMigrations(admin, { schemaName: schema })
    await admin.query(
      `CREATE ROLE ${role} LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT PASSWORD '${password}'`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT ON ${schema}.session_events, ${schema}.session_streams TO ${role}`
    )
    await admin.query(
      `GRANT UPDATE (next_sequence) ON ${schema}.session_streams TO ${role}`
    )
    await admin.query(`GRANT SELECT ON ${schema}.schema_migrations TO ${role}`)
    const u = new URL(url!)
    u.username = role
    u.password = password
    roleUrl = u.toString()
    readPool = new Pool({ connectionString: roleUrl, max: 8 })
    physical = createPgPhysicalSessionPool({ connectionString: roleUrl })
  })
  afterAll(async () => {
    await readPool?.end()
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${role}`)
    await admin?.end()
  })

  it('a live owner is AlreadyOwned at once, with nothing taken and nothing written', async () => {
    const svc = await service()
    const id = `r${++seq}`
    const owner = await svc.create(hdr(id))
    await owner.append(completed(id, 1, 'c1'))
    const before = await counts(id)
    const started = Date.now()
    await expect(svc.resumeSession(id)).rejects.toBeInstanceOf(
      SessionAlreadyOwnedError
    )
    expect(Date.now() - started).toBeLessThan(2_000)
    expect(await counts(id)).toEqual(before)
    expect(await holderPids(id)).toHaveLength(1)
    // The owner is undisturbed.
    await owner.append(completed(id, 5, 'c2'))
    await owner.close()
  })

  it('after the owner dies, a new handle reads the exact prefix and the analysis points at the open turn', async () => {
    const svc = await service()
    const id = `r${++seq}`
    const old = await svc.create(hdr(id))
    const log = [...completed(id, 1, 'c1'), ...crashed(id, 5, 'c2')]
    await old.append(log)
    const [pid] = await holderPids(id)
    await admin.query('SELECT pg_terminate_backend($1)', [pid])
    await waitFor(async () => (await holderPids(id)).length === 0)
    const sql: string[] = []
    const { handle, analysis } = await (
      await service(8, logged(sql))
    ).resumeSession(id)
    expect(handle.access).toBe('write')
    expect((await handle.read(0)).events).toEqual(log)
    expect(analysis.inheritableThrough).toBe(4)
    expect(analysis.openTurn).toMatchObject({
      correlationId: 'c2',
      state: 'open',
      uncertainEffects: ['op-c2']
    })
    expect(analysis.turns.map((t) => t.state)).toEqual(['completed', 'open'])
    // Nothing was written: no INSERT, the log and the cursor are as the crash left them.
    expect(sql.filter((s) => /INSERT/i.test(s))).toEqual([])
    expect(await counts(id)).toEqual({ events: 7, cursor: 8 })
    // The old handle never revives; the new one is a fresh owner.
    await expect(
      old.append([mk(id, 8, 'message/user', 'c3', { text: 'x' })])
    ).rejects.toBeInstanceOf(SessionOwnershipLostError)
    // The next turn takes a new correlation id; the interrupted turn is not closed by inference.
    await handle.append(completed(id, 8, 'c3'))
    const again = (await handle.read(0)).events
    expect(
      again.filter((e) => e.type === 'turn/end').map((e) => e.correlationId)
    ).toEqual(['c1', 'c3'])
    await handle.close()
    const reopened = await (await service()).resumeSession(id)
    expect(
      reopened.analysis.turns.map((t) => [t.correlationId, t.state])
    ).toEqual([
      ['c1', 'completed'],
      ['c2', 'open'],
      ['c3', 'completed']
    ])
    // The prefix stays closed behind the interrupted turn.
    expect(reopened.analysis.inheritableThrough).toBe(4)
    expect(reopened.analysis.openTurn?.correlationId).toBe('c2')
    await reopened.handle.close()
  })

  it('a fork of a resumed session leaves the interrupted turn and its uncertain effect behind', async () => {
    const svc = await service()
    const id = `r${++seq}`
    const old = await svc.create(hdr(id))
    await old.append([...completed(id, 1, 'c1'), ...crashed(id, 5, 'c2')])
    await old.close()
    const { handle, analysis } = await svc.resumeSession(id)
    const child = await svc.fork(id, hdr(`k${seq}`), {
      through: { correlationId: 'c1' }
    })
    expect(child.inheritedEventCount).toBe(analysis.inheritableThrough)
    expect(JSON.stringify((await child.read(0)).events)).not.toContain('op-c2')
    expect(await verifySessionFork(svc, child.id, id)).toEqual([])
    await child.close()
    await handle.close()
  })

  it('refuses an unknown session and an unanalyzable log without keeping the lock or the slot', async () => {
    const svc = await service(1)
    await expect(svc.resumeSession('nope')).rejects.toBeInstanceOf(
      SessionPersistenceNotFoundError
    )
    const id = `r${++seq}`
    const w = await svc.create(hdr(id))
    // Two turns interleaved: legal to store, impossible to cut honestly.
    await w.append([
      mk(id, 1, 'turn/start', 'a', { correlationId: 'a' }),
      mk(id, 2, 'turn/start', 'b', { correlationId: 'b' }),
      mk(id, 3, 'turn/end', 'a', {
        correlationId: 'a',
        stopReason: 'COMPLETED'
      })
    ])
    await w.close()
    for (let i = 0; i < 2; i++)
      await expect(svc.resumeSession(id)).rejects.toBeInstanceOf(
        SessionPersistenceCorruptionError
      )
    expect(await holderPids(id)).toEqual([])
  })

  it('FP07: an approval pending or granted for the original does not reach the fork; the same action there asks again', async () => {
    const svc = await service()
    const id = `a${++seq}`
    const execute = vi.fn(async () => ({
      status: 'SUCCEEDED' as const,
      output: { synthetic: true }
    }))
    const tool: ToolDefinition = {
      id: 'synthetic.neutral',
      version: 'v1',
      description: 'synthetic only',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'LOW',
      sideEffect: 'NONE',
      idempotent: true,
      requiresApproval: true,
      execute
    }
    const requests: ApprovalRequest[] = []
    const approvals: ApprovalEngine = {
      request: async (request) => {
        requests.push(request)
        return {
          status: 'PENDING',
          approvalId: `ap-${requests.length}` as never,
          reason: 'asked'
        }
      }
    }
    const policy: PolicyEngine = {
      evaluate: async () => ({
        outcome: 'REQUIRE_APPROVAL',
        reason: 'synthetic',
        policyVersion: 'p1'
      })
    }
    let n = 0
    /** One real-kernel turn that asks for the same governed tool, logged into the handle's session. */
    const governedTurn = async (
      handle: Parameters<typeof sessionEventStoreForHandle>[0],
      correlationId: string
    ) => {
      const store = sessionEventStoreForHandle(handle)
      await store.append({
        tenantId: tenant,
        sessionId: handle.id,
        formatVersion: 1,
        eventId: `ev_${handle.id}_${(n += 1)}`,
        timestamp: '2026-10-29T00:00:00.000Z',
        correlationId,
        traceId: 'trace_sdk',
        type: 'message/user',
        payload: { text: 'do the thing' }
      })
      const harness = createOperationalHarness({
        modelGateway: {
          complete: async () => ({
            text: 'synthetic',
            provider: 'keyless',
            model: 'v1',
            inputTokens: 2,
            outputTokens: 3,
            costUsd: 0
          })
        },
        policy,
        approvals,
        tools: {
          list: () => [tool],
          resolve: (toolId) => (toolId === tool.id ? tool : undefined)
        },
        audit: { append: async () => {} },
        telemetry: { record: () => {} },
        log: createSessionKernelLog({
          store,
          tenantId: tenant,
          sessionId: handle.id,
          formatVersion: 1,
          traceId: 'trace_sdk',
          correlationId,
          eventId: () => `ev_${handle.id}_${(n += 1)}`,
          clock: () => new Date('2026-10-29T00:00:00.000Z')
        })
      })
      return harness.execute({
        tenantId: tenant as never,
        conversationId: handle.id as never,
        sessionId: handle.id as never,
        correlationId: correlationId as never,
        traceId: 'trace_sdk' as never,
        agent: {
          id: 'a' as never,
          version: 'v1' as never,
          objective: 'synthetic',
          instructions: [],
          skills: [],
          tools: [tool.id],
          policies: []
        },
        userMessage: 'do the thing',
        context: {
          values: {},
          sourceIds: [],
          capturedAt: '2026-10-29T00:00:00.000Z'
        },
        state: {
          version: 0,
          values: {},
          updatedAt: '2026-10-29T00:00:00.000Z'
        },
        budget: {
          maxSteps: 4,
          maxModelCalls: 2,
          maxToolCalls: 2,
          maxCostUsd: 1,
          maxTokens: 100,
          maxDurationMs: 30000
        },
        requestedTool: {
          toolId: tool.id,
          input: {},
          operationKey: 'synthetic-operation'
        }
      })
    }
    const parent = await svc.create(hdr(id))
    await parent.append(completed(id, 1, 'c0'))
    const original = await governedTurn(parent, 'corr_original')
    expect(original.stopReason).toBe('APPROVAL_REQUIRED')
    expect(requests).toHaveLength(1)
    // The original's request is granted from here on; nothing of that is in the session log.
    const sourceLog = (await parent.read(0)).events
    expect(sourceLog.at(-1)).toMatchObject({
      type: 'turn/end',
      payload: { stopReason: 'APPROVAL_REQUIRED' }
    })
    const childId = `k${seq}`
    const child = await svc.fork(id, hdr(childId))
    expect(child.inheritedEventCount).toBe(4)
    const copied = JSON.stringify((await child.read(0)).events)
    for (const absent of [
      'ap-1',
      'APPROVAL_REQUIRED',
      'synthetic-operation',
      'corr_original'
    ])
      expect(copied).not.toContain(absent)
    const again = await governedTurn(child, 'corr_fork')
    // A new request, not the original's grant: the fork's turn waits for approval again.
    expect(again.stopReason).toBe('APPROVAL_REQUIRED')
    expect(requests).toHaveLength(2)
    expect(JSON.stringify(requests[1])).not.toContain('ap-1')
    expect(execute).not.toHaveBeenCalled()
    // The original is unchanged by the fork and the fork verifies.
    expect((await parent.read(0)).events).toEqual(sourceLog)
    expect(await verifySessionFork(svc, childId, id)).toEqual([])
    await child.close()
    await parent.close()
  })
})
