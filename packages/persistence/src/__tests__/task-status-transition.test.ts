/**
 * AUD0621 F15/F16 (SPEC0250 P6) — memory adapter for the atomic task status
 * transition: synchronous critical section, single transition rule and audit
 * staged before either write is published.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuditRepository,
  ConversationRepository,
  InMemoryDatabase,
  TaskRepository
} from '../index.ts'

const tenant = 'tenant_00000000-0000-4000-8000-000000000627'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000628'
const correlationId = 'corr_00000000-0000-4000-8000-000000000627'

afterEach(() => {
  vi.restoreAllMocks()
})

function setup() {
  const db = new InMemoryDatabase()
  const conversations = new ConversationRepository(db)
  const { session } = conversations.createWithSession({
    tenantId: tenant as never,
    channel: 'internal',
    senderRef: 'aud0621-transition',
    externalMessageId: 'aud0621-transition-1',
    body: 'Synthetic fixture'
  }) as { session: { id: string } }
  const tasks = new TaskRepository(db)
  const task = tasks.create(
    {
      sessionId: session.id,
      title: 'Synthetic task',
      description: 'Synthetic transition task',
      priority: 'medium',
      source: 'aud0621',
      idempotencyKey: 'aud0621-transition'
    },
    tenant as never
  )
  return { db, tasks, task, sessionId: session.id }
}

const command = (
  taskId: string,
  status: 'in_progress' | 'done' | 'canceled' | 'open'
) => ({
  taskId,
  status,
  actorType: 'Operator' as const,
  actorId: 'operator.aud0621',
  correlationId
})

describe('TaskRepository.transitionStatusWithAudit (AUD0621 F15/F16)', () => {
  it('P6: is synchronous and records exactly one event per committed change', () => {
    const { db, tasks, task, sessionId } = setup()
    const result = tasks.transitionStatusWithAudit(
      command(task.id, 'in_progress'),
      tenant as never
    )
    expect(result).not.toBeInstanceOf(Promise)
    expect(result).toMatchObject({ id: task.id, status: 'in_progress' })
    expect(db.state.auditEvents).toHaveLength(1)
    expect(db.state.auditEvents[0]).toMatchObject({
      type: 'integration_event',
      actorType: 'Operator',
      actorId: 'operator.aud0621',
      correlationId,
      policyVersion: 'api-runtime-v1',
      tenantId: tenant,
      payload: {
        sessionId,
        taskId: task.id,
        fromStatus: 'open',
        toStatus: 'in_progress',
        effect: 'internal_task_state_only',
        tenantId: tenant
      }
    })
  })

  it('P6: rejects leaving a terminal status and keeps the stored state', () => {
    const { db, tasks, task } = setup()
    tasks.transitionStatusWithAudit(command(task.id, 'done'), tenant as never)
    for (const status of ['in_progress', 'canceled', 'open'] as const) {
      expect(() =>
        tasks.transitionStatusWithAudit(
          command(task.id, status),
          tenant as never
        )
      ).toThrow(expect.objectContaining({ code: 'invalid_action' }))
    }
    expect(tasks.findById(task.id)?.status).toBe('done')
    expect(db.state.auditEvents).toHaveLength(1)
    // Same status stays an accepted no-op transition, as before.
    expect(
      tasks.transitionStatusWithAudit(command(task.id, 'done'), tenant as never)
        .status
    ).toBe('done')
  })

  it('P6: an audit failure publishes neither the task nor the event', () => {
    const { db, tasks, task } = setup()
    vi.spyOn(AuditRepository.prototype, 'append').mockImplementationOnce(() => {
      throw new Error('synthetic audit failure')
    })
    expect(() =>
      tasks.transitionStatusWithAudit(command(task.id, 'done'), tenant as never)
    ).toThrow('synthetic audit failure')
    expect(tasks.findById(task.id)?.status).toBe('open')
    expect(db.state.auditEvents).toEqual([])
  })

  it('P6: is tenant scoped', () => {
    const { tasks, task } = setup()
    expect(() =>
      tasks.transitionStatusWithAudit(
        command(task.id, 'done'),
        otherTenant as never
      )
    ).toThrow(expect.objectContaining({ code: 'invalid_action' }))
    expect(tasks.findById(task.id)?.status).toBe('open')
  })
})
