/**
 * AUD0621 F15/F16 (SPEC0250 P1/P3) — the task status route validates and
 * writes against the same state, and the status change commits together with
 * its audit event. Adapted from the auditor probes `task-concurrent-terminal`
 * and `task-audit-partial` (AUD-CRITICAL-20261020/integration.test.ts).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuditRepository } from '@cvg/persistence'
import { buildServer } from '../server.ts'

const operatorHeaders = {
  'x-operator-id': 'operator.aud0621.tasks',
  'x-operator-role': 'Operator'
}
const supervisorHeaders = {
  'x-operator-id': 'supervisor.aud0621.tasks',
  'x-operator-role': 'Supervisor'
}

type App = ReturnType<typeof buildServer>

interface StatusEvent {
  type: string
  actorId: string
  payload: {
    taskId?: string
    fromStatus?: string
    toStatus?: string
    effect?: string
  }
}

async function fixture(app: App) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: `aud0621-task-${crypto.randomUUID()}`,
      senderRef: '+5511900000625',
      body: 'Synthetic AUD0621 task fixture',
      receivedAt: '2026-10-20T12:00:00.000Z'
    }
  })
  expect(inbound.statusCode).toBe(200)
  const sessionId = inbound.json().data.sessionId as string
  const created = await app.inject({
    method: 'POST',
    url: '/v1/tasks',
    payload: {
      sessionId,
      title: 'Synthetic task',
      description: 'Synthetic AUD0621 task',
      priority: 'medium',
      source: 'aud0621',
      idempotencyKey: `aud0621-${crypto.randomUUID()}`
    }
  })
  expect(created.statusCode).toBe(200)
  return { sessionId, taskId: created.json().data.id as string }
}

async function statusEvents(
  app: App,
  sessionId: string,
  taskId: string
): Promise<StatusEvent[]> {
  const audit = await app.inject({
    method: 'GET',
    url: `/v1/audit/sessions/${sessionId}`,
    headers: supervisorHeaders
  })
  expect(audit.statusCode).toBe(200)
  return (audit.json().data.events as StatusEvent[]).filter(
    (event) =>
      event.payload.taskId === taskId &&
      event.payload.effect === 'internal_task_state_only'
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('task status transition atomicity (AUD0621 F15/F16, SPEC0250)', () => {
  it('P1: concurrent PATCHes cannot reopen a terminal task', async () => {
    const app = buildServer()
    try {
      const f = await fixture(app)
      // The auditor's interleaving: both requests read `open` before either
      // writes, `done` is written first, then `in_progress`. With the atomic
      // port the route no longer reads separately, so the barrier is inert
      // and the requests serialize.
      const port = app.persistence.tasks as unknown as Record<
        string,
        (...args: unknown[]) => unknown
      >
      const originalFind = port.findById!.bind(port)
      const originalUpdate = port.updateStatus!.bind(port)
      let reads = 0
      let releaseReads: () => void = () => undefined
      let markDone: () => void = () => undefined
      const bothRead = new Promise<void>((resolve) => {
        releaseReads = resolve
      })
      const doneWritten = new Promise<void>((resolve) => {
        markDone = resolve
      })
      port.findById = async (...args: unknown[]) => {
        const snapshot = { ...((await originalFind(...args)) as object) }
        reads += 1
        if (reads === 2) releaseReads()
        await bothRead
        return snapshot
      }
      port.updateStatus = async (...args: unknown[]) => {
        if (args[1] === 'in_progress') await doneWritten
        const result = await originalUpdate(...args)
        if (args[1] === 'done') markDone()
        return result
      }

      const responses = await Promise.all(
        ['done', 'in_progress'].map((status) =>
          app.inject({
            method: 'PATCH',
            url: `/v1/tasks/${f.taskId}/status`,
            headers: operatorHeaders,
            payload: { status }
          })
        )
      )
      port.findById = originalFind
      port.updateStatus = originalUpdate

      // Any serial order is acceptable: `done` then a rejected
      // `in_progress`, or `in_progress` then `done`. A terminal task is never
      // reopened and every event starts from the previously committed status.
      const task = (await app.persistence.tasks.findById(f.taskId)) as {
        status: string
      } | null
      expect(task?.status).toBe('done')
      for (const response of responses) {
        if (response.statusCode !== 200) {
          expect(response.statusCode).toBe(400)
          expect(response.json().error.code).toBe('invalid_action')
        }
      }
      const events = await statusEvents(app, f.sessionId, f.taskId)
      const accepted = responses.filter((r) => r.statusCode === 200).length
      expect(events).toHaveLength(accepted)
      let previous = 'open'
      for (const event of events) {
        expect(event.payload.fromStatus).toBe(previous)
        previous = event.payload.toStatus!
      }
      expect(previous).toBe('done')
    } finally {
      await app.close()
    }
  })

  it('P3: an audit failure leaves the task unchanged and records nothing', async () => {
    const app = buildServer()
    try {
      const f = await fixture(app)
      vi.spyOn(AuditRepository.prototype, 'append').mockImplementationOnce(
        () => {
          throw new Error('synthetic audit unavailable')
        }
      )
      const failed = await app.inject({
        method: 'PATCH',
        url: `/v1/tasks/${f.taskId}/status`,
        headers: operatorHeaders,
        payload: { status: 'done' }
      })
      expect(failed.statusCode).toBe(500)
      expect(failed.json().error.code).toBe('internal_error')
      const unchanged = (await app.persistence.tasks.findById(f.taskId)) as {
        status: string
      } | null
      expect(unchanged?.status).toBe('open')
      expect(await statusEvents(app, f.sessionId, f.taskId)).toEqual([])

      vi.restoreAllMocks()
      const retried = await app.inject({
        method: 'PATCH',
        url: `/v1/tasks/${f.taskId}/status`,
        headers: operatorHeaders,
        payload: { status: 'done' }
      })
      expect(retried.statusCode).toBe(200)
      const events = await statusEvents(app, f.sessionId, f.taskId)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        type: 'integration_event',
        actorId: 'operator.aud0621.tasks',
        payload: { fromStatus: 'open', toStatus: 'done' }
      })
    } finally {
      await app.close()
    }
  })
})
