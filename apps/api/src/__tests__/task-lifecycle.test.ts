import { describe, expect, it } from 'vitest'
import { buildServer, type RuntimeLogEntry } from '../server.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

async function createFixtureSession(app: ReturnType<typeof buildServer>) {
  const inbound = await app.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    payload: {
      externalMessageId: 'task-lifecycle-msg-1',
      senderRef: '+551166665555',
      body: 'Preciso de acompanhamento humano',
      receivedAt: '2026-04-29T15:00:00-03:00'
    }
  })
  return (inbound.json() as Envelope<{ sessionId: string }>).data.sessionId
}

describe('task lifecycle API', () => {
  it('updates internal task status with audit evidence and no external side effect', async () => {
    const logs: RuntimeLogEntry[] = []
    const app = buildServer({ runtimeLogger: (entry) => logs.push(entry) })
    const sessionId = await createFixtureSession(app)

    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Validar retorno humano',
        description: 'Operador deve tratar internamente',
        priority: 'high',
        source: 'task-lifecycle-test',
        idempotencyKey: 'task-life-1'
      }
    })
    const taskBody = task.json() as Envelope<{ id: string; status: string }>

    const update = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskBody.data.id}/status`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      },
      payload: { status: 'in_progress' }
    })
    // AUD-0621 F01 / SPEC0176: the unassigned Operator gets the static 404
    // on the session reader; the task event (not session-linked by its
    // producer) is asserted on the full tenant audit reader.
    const limitedAudit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      }
    })
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/observability/audit-evidence?sessionId=${sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.shift-a',
        'x-operator-role': 'Supervisor'
      }
    })
    await app.close()

    const updateBody = update.json() as Envelope<{ id: string; status: string }>
    const auditBody = audit.json() as Envelope<{
      page: {
        items: Array<{
          type: string
          correlationId: string
          payload: Record<string, unknown>
        }>
      }
    }>

    expect(limitedAudit.statusCode).toBe(404)
    expect(update.statusCode).toBe(200)
    expect(updateBody.data).toMatchObject({
      id: taskBody.data.id,
      status: 'in_progress'
    })
    expect(auditBody.data.page.items).toContainEqual(
      expect.objectContaining({
        type: 'integration_event',
        correlationId: expect.stringMatching(/^corr_/),
        payload: expect.objectContaining({
          sessionId,
          taskId: taskBody.data.id,
          fromStatus: 'open',
          toStatus: 'in_progress',
          effect: 'internal_task_state_only'
        })
      })
    )
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'task.status_changed',
        correlationId: expect.stringMatching(/^corr_/),
        sessionId,
        resourceId: taskBody.data.id
      })
    )
  })

  it('rejects terminal task transitions with a safe envelope', async () => {
    const app = buildServer()
    const sessionId = await createFixtureSession(app)
    const task = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId,
        title: 'Encerrar tarefa ficticia',
        description: 'Validar transicao terminal',
        priority: 'medium',
        source: 'task-lifecycle-test',
        idempotencyKey: 'task-life-2'
      }
    })
    const taskBody = task.json() as Envelope<{ id: string }>

    await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskBody.data.id}/status`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      },
      payload: { status: 'done' }
    })
    const invalid = await app.inject({
      method: 'PATCH',
      url: `/v1/tasks/${taskBody.data.id}/status`,
      headers: {
        'x-operator-id': 'operator.shift-a',
        'x-operator-role': 'Operator'
      },
      payload: { status: 'in_progress' }
    })
    await app.close()

    const invalidBody = invalid.json() as Envelope<never>
    expect(invalid.statusCode).toBe(400)
    expect(invalidBody.success).toBe(false)
    expect(invalidBody.error?.code).toBe('invalid_action')
  })

  it('returns a client error status when task creation validation fails', async () => {
    const app = buildServer()
    const invalid = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: { sessionId: 'not-a-valid-session' }
    })
    await app.close()

    expect(invalid.statusCode).toBe(400)
    expect(invalid.json()).toMatchObject({
      success: false,
      error: { code: 'validation_failed' }
    })
  })
})
