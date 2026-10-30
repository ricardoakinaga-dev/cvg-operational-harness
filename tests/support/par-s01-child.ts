/* PAR-S01 slice 6: synthetic child process. A tiny IPC RPC over the public session service,
 * so the parent can observe real process boundaries (ownership, ACK barriers, abrupt kill). */
import { Client, Pool } from 'pg'
import type {
  ApprovalEngine,
  PolicyEngine,
  SessionEvent,
  SessionHandle
} from '@cvg/harness-contracts'
import { createSdk } from '@cvg/sdk'
import { materializeSessionEvent } from '@cvg/harness'
import {
  createPgPhysicalSessionPool,
  createPostgresSessionPersistence,
  sessionEventStoreForHandle
} from '../../packages/persistence/src/session-persistence.ts'

interface Config {
  readonly url: string
  readonly schema: string
  readonly tenant: string
}
type Request = { readonly id: number; readonly cmd: string } & Record<
  string,
  unknown
>

const config = JSON.parse(process.env.PAR_S01_CHILD_CONFIG!) as Config
const handles = new Map<string, SessionHandle>()
const header = (id: string) => ({
  version: 1 as const,
  id,
  createdAt: 1_700_000_000_000,
  isSeeded: false
})
const event = (
  sessionId: string,
  sequence: number,
  text: string
): SessionEvent =>
  materializeSessionEvent(
    {
      tenantId: config.tenant,
      sessionId,
      formatVersion: 1,
      eventId: `${sessionId}-e${sequence}`,
      timestamp: '2026-10-29T00:00:00.000Z',
      correlationId: 'corr-synthetic',
      traceId: 'trace-synthetic',
      type: 'message/user',
      payload: { text }
    },
    sequence
  )

const readPool = new Pool({ connectionString: config.url, max: 4 })
readPool.on('error', () => undefined) // an idle reader lost with the server is replaced by the pool
const physical = createPgPhysicalSessionPool({ connectionString: config.url })
const service = createPostgresSessionPersistence(physical, readPool, {
  tenantId: config.tenant,
  schemaName: config.schema,
  maxOpenWriters: 4,
  acquireTimeoutMs: 3000
}).then((r) => r.service)

const allow: PolicyEngine = {
  evaluate: async () => ({
    outcome: 'ALLOW',
    reason: 'synthetic',
    policyVersion: 'p1'
  })
}
const deny: ApprovalEngine = {
  request: async () => ({ status: 'DENIED', reason: 'synthetic' })
}

async function run(r: Request): Promise<unknown> {
  const svc = await service
  const name = String(r.name ?? r.session)
  switch (r.cmd) {
    case 'create':
      handles.set(name, await svc.create(header(String(r.session))))
      return { access: handles.get(name)!.access }
    case 'open':
      handles.set(
        name,
        await svc.open(String(r.session), r.access as 'read' | 'write')
      )
      return { access: handles.get(name)!.access }
    case 'append': {
      const session = String(r.session)
      const from = Number(r.from)
      const count = Number(r.count)
      await handles
        .get(name)!
        .append(
          Array.from({ length: count }, (_, i) =>
            event(session, from + i, `${session}#${from + i}`)
          )
        )
      return {}
    }
    case 'flush':
      await handles.get(name)!.flush()
      return {}
    case 'close':
      await handles.get(name)!.close()
      return {}
    case 'read': {
      const read = await handles.get(name)!.read()
      return { events: read.events }
    }
    case 'readFresh': {
      // A fresh reader handle: what any other process would see.
      const reader = await svc.open(String(r.session), 'read')
      const read = await reader.read()
      await reader.close()
      return { events: read.events }
    }
    case 'sdkTurn': {
      const session = String(r.session)
      let n = Number(r.idStart ?? 0)
      const sdk = createSdk({
        tenantId: config.tenant,
        modelGateway: {
          complete: async () => ({
            text: 'synthetic reply',
            provider: 'deterministic',
            model: 'deterministic-v1',
            inputTokens: 2,
            outputTokens: 3,
            costUsd: 0
          })
        },
        policy: allow,
        approvals: deny,
        sessions: sessionEventStoreForHandle(handles.get(name)!),
        clock: () => new Date('2026-10-29T00:00:00.000Z'),
        newEventId: () => `${r.prefix}_${(n += 1)}`,
        newCorrelationId: () => 'corr_sdk',
        newTraceId: () => 'trace_sdk'
      })
      await sdk.openSession(session)
      await sdk.sendTurn(session, String(r.text))
      return { events: await sdk.readEvents(session) }
    }
    case 'sql': {
      // Raw statement under the child's own (non-owner) role.
      const c = new Client({ connectionString: config.url })
      await c.connect()
      try {
        return { rows: (await c.query(String(r.sql))).rows }
      } finally {
        await c.end()
      }
    }
    default:
      throw new Error(`unknown command ${r.cmd}`)
  }
}

process.on('message', (raw) => {
  const r = raw as Request
  run(r).then(
    (value) => process.send!({ id: r.id, ok: true, value }),
    (e: unknown) => {
      const err = e as Error & { code?: string }
      process.send!({
        id: r.id,
        ok: false,
        error: { name: err.name, message: err.message, code: err.code }
      })
    }
  )
})
process.send!({ id: 0, ok: true, value: 'ready' })
