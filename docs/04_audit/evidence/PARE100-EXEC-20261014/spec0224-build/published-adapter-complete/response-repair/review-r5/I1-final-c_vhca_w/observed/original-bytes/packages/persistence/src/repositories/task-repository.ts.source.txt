import {
  createDomainId,
  DomainError,
  type TaskPriority,
  type TaskStatus
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import type { InMemoryDatabase } from '../db.ts'
import type { TaskRecord } from '../schema.ts'

export class TaskRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  create(
    input: {
      sessionId: string
      title: string
      description: string
      priority: TaskPriority
      source: string
      idempotencyKey: string
    },
    rawTenantId?: TenantId
  ): TaskRecord {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    if (tenantId && !this.sessionBelongsToTenant(input.sessionId, tenantId)) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    const existing = this.db.state.tasks.find(
      (task) =>
        task.sessionId === input.sessionId &&
        task.source === input.source &&
        task.idempotencyKey === input.idempotencyKey &&
        (!tenantId || this.taskBelongsToTenant(task, tenantId))
    )
    if (existing) return existing
    const task: TaskRecord = {
      id: createDomainId('task'),
      sessionId: input.sessionId,
      title: input.title,
      description: input.description,
      priority: input.priority,
      source: input.source,
      status: 'open',
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date()
    }
    this.db.state.tasks = [...this.db.state.tasks, task]
    return task
  }

  list(rawTenantId?: TenantId): TaskRecord[] {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    return this.db.state.tasks.filter(
      (task) => !tenantId || this.taskBelongsToTenant(task, tenantId)
    )
  }

  findById(id: string, rawTenantId?: TenantId): TaskRecord | null {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    return (
      this.db.state.tasks.find(
        (task) =>
          task.id === id &&
          (!tenantId || this.taskBelongsToTenant(task, tenantId))
      ) ?? null
    )
  }

  updateStatus(
    id: string,
    status: TaskStatus,
    rawTenantId?: TenantId
  ): TaskRecord | null {
    const existing = this.findById(id, rawTenantId)
    if (!existing) return null
    const updated: TaskRecord = { ...existing, status }
    this.db.state.tasks = this.db.state.tasks.map((task) =>
      task.id === id ? updated : task
    )
    return updated
  }

  private taskBelongsToTenant(task: TaskRecord, tenantId: TenantId): boolean {
    return this.sessionBelongsToTenant(task.sessionId, tenantId)
  }

  private sessionBelongsToTenant(
    sessionId: string,
    tenantId: TenantId
  ): boolean {
    const session = this.db.state.sessions.find((item) => item.id === sessionId)
    const conversation = session
      ? this.db.state.conversations.find(
          (item) => item.id === session.conversationId
        )
      : undefined
    return conversation?.tenantId === tenantId
  }
}
