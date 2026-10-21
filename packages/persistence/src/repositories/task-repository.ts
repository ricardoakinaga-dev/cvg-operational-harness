import {
  createDomainId,
  DomainError,
  TaskStatusSchema,
  type TaskPriority,
  type TaskStatus
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import type { AuditEventRecord, PageInfo, TaskRecord } from '../schema.ts'
import { AuditRepository } from './audit-repository.ts'

/** SPEC0250 §3.2 — listing bounds shared by the memory and SQL adapters. */
export const STATUS_PAGE_MAX_LIMIT = 100
export const STATUS_PAGE_MAX_OFFSET = 10_000

export interface StatusPageQuery<S extends string> {
  limit: number
  offset: number
  statuses?: readonly S[] | undefined
}

export type TaskListQuery = StatusPageQuery<TaskStatus>

export interface TaskPage {
  items: TaskRecord[]
  pageInfo: PageInfo
}

/**
 * Defense in depth for list queries: the HTTP layer validates first, and the
 * adapters refuse anything outside the documented bounds (SPEC0250 §3.2).
 */
export function assertStatusPageQuery<S extends string>(
  query: StatusPageQuery<S>,
  allowed: readonly S[]
): { limit: number; offset: number; statuses: readonly S[] | undefined } {
  if (
    !Number.isInteger(query.limit) ||
    query.limit < 1 ||
    query.limit > STATUS_PAGE_MAX_LIMIT ||
    !Number.isInteger(query.offset) ||
    query.offset < 0 ||
    query.offset > STATUS_PAGE_MAX_OFFSET
  ) {
    throw new DomainError(
      'invalid_pagination',
      `limit must be between 1 and ${STATUS_PAGE_MAX_LIMIT} and offset between 0 and ${STATUS_PAGE_MAX_OFFSET}`
    )
  }
  const statuses = query.statuses
  if (
    statuses !== undefined &&
    (statuses.length === 0 ||
      new Set(statuses).size !== statuses.length ||
      statuses.some((status) => !allowed.includes(status)))
  ) {
    throw new DomainError(
      'invalid_pagination',
      'status filter must list distinct known values'
    )
  }
  return { limit: query.limit, offset: query.offset, statuses }
}

export function pageInfoFor(
  query: { limit: number; offset: number },
  itemCount: number,
  total: number
): PageInfo {
  return {
    limit: query.limit,
    offset: query.offset,
    total,
    hasNextPage: query.offset + itemCount < total
  }
}

/** SPEC0250 §3.1 — atomic, audited internal task status change. */
export interface TaskStatusTransitionCommand {
  taskId: string
  status: TaskStatus
  actorType: AuditEventRecord['actorType']
  actorId: string
  correlationId: string
}

const allowedTaskTransitions: Record<TaskStatus, readonly TaskStatus[]> = {
  open: ['in_progress', 'done', 'canceled'],
  in_progress: ['done', 'canceled'],
  done: [],
  canceled: []
}

/** Single transition rule for every adapter; a same-status write is a no-op. */
export function assertTaskStatusTransition(
  fromStatus: TaskStatus,
  toStatus: TaskStatus
): void {
  if (fromStatus === toStatus) return
  if (!allowedTaskTransitions[fromStatus].includes(toStatus)) {
    throw new DomainError(
      'invalid_action',
      'Task status transition is not allowed'
    )
  }
}

export function taskStatusTransitionAudit(
  previous: TaskRecord,
  next: TaskRecord,
  command: TaskStatusTransitionCommand,
  tenantId?: TenantId
): Omit<AuditEventRecord, 'id' | 'createdAt'> {
  return {
    ...(tenantId ? { tenantId } : {}),
    type: 'integration_event',
    actorType: command.actorType,
    actorId: command.actorId,
    correlationId: command.correlationId,
    policyVersion: 'api-runtime-v1',
    payload: {
      sessionId: next.sessionId,
      taskId: next.id,
      fromStatus: previous.status,
      toStatus: next.status,
      effect: 'internal_task_state_only',
      ...(tenantId ? { tenantId } : {})
    }
  }
}

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
    return this.findStored(id, tenantId)
  }

  /**
   * SPEC0250 §3.2 — bounded page in insertion (creation) order, optionally
   * filtered by status; `total` counts every matching task of the tenant.
   */
  listPage(rawTenantId: TenantId | undefined, query: TaskListQuery): TaskPage {
    const { limit, offset, statuses } = assertStatusPageQuery(
      query,
      TaskStatusSchema.options
    )
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const matching = this.db.state.tasks.filter(
      (task) =>
        (!tenantId || this.taskBelongsToTenant(task, tenantId)) &&
        (!statuses || statuses.includes(task.status))
    )
    const items = matching.slice(offset, offset + limit)
    return {
      items,
      pageInfo: pageInfoFor({ limit, offset }, items.length, matching.length)
    }
  }

  /**
   * SPEC0250 §3.1 — synchronous critical section: reads the stored task (not
   * the overridable `findById`), validates the transition against it, stages
   * the audit event and only then publishes task and event together. Nothing
   * awaits in between, so no other transition can interleave, and an audit
   * failure leaves both untouched.
   */
  transitionStatusWithAudit(
    command: TaskStatusTransitionCommand,
    rawTenantId?: TenantId
  ): TaskRecord {
    const status = TaskStatusSchema.parse(command.status)
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const current = this.findStored(command.taskId, tenantId)
    if (!current) throw new DomainError('invalid_action', 'Task not found')
    assertTaskStatusTransition(current.status, status)
    const updated: TaskRecord = { ...current, status }
    const staged = new InMemoryDatabase({ ...this.db.state })
    new AuditRepository(staged).append(
      taskStatusTransitionAudit(current, updated, command, tenantId),
      tenantId
    )
    this.db.state.tasks = this.db.state.tasks.map((task) =>
      task.id === updated.id ? updated : task
    )
    this.db.state.auditEvents = staged.state.auditEvents
    return updated
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

  private findStored(id: string, tenantId?: TenantId): TaskRecord | null {
    return (
      this.db.state.tasks.find(
        (task) =>
          task.id === id &&
          (!tenantId || this.taskBelongsToTenant(task, tenantId))
      ) ?? null
    )
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
