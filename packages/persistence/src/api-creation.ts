/**
 * SPEC 0257 R2 — atomic creation of an internal task / approval request and
 * its audit event, with a durable receipt keyed by an HTTP idempotency key.
 *
 * Invariant: resource, receipt and exactly one creation event are confirmed
 * together. Before commit a failure leaves none of the three; a retry after
 * commit returns the same resource without a new resource or event.
 *
 * This module holds what the memory and PostgreSQL adapters share: the exact
 * digests (§3), the command/result shapes and the in-memory adapter (§5).
 */
import { createHash } from 'node:crypto'
import { DomainError, type TaskPriority } from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { InMemoryDatabase } from './db.ts'
import { AuditRepository } from './repositories/audit-repository.ts'
import { TaskRepository } from './repositories/task-repository.ts'
import type {
  ApiCreationReceiptRecord,
  ApprovalRequestRecord,
  AuditEventRecord,
  DatabaseState,
  TaskRecord
} from './schema.ts'

export const API_CREATION_ROUTES = ['/v1/tasks', '/v1/approvals'] as const
export type ApiCreationRoute = (typeof API_CREATION_ROUTES)[number]
export const API_CREATION_DIGEST_VERSION = 1 as const
export const API_CREATION_POLICY_VERSION = 'api-runtime-v1'

/** Header value rule of SPEC 0257 §2 (also applied to a task body key). */
export const API_CREATION_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/

export interface ApiCreationActor {
  actorType: AuditEventRecord['actorType']
  actorId: string
}

export interface CreateTaskWithAuditCommand {
  actor: ApiCreationActor
  correlationId: string
  task: {
    sessionId: string
    title: string
    description: string
    priority: TaskPriority
    source: string
    /** The legacy body key: it is also the receipt key of `/v1/tasks`. */
    idempotencyKey: string
  }
}

export interface CreateApprovalWithAuditCommand {
  actor: ApiCreationActor
  correlationId: string
  /** The single `Idempotency-Key` header value. */
  idempotencyKey: string
  /** Already validated; its id and date are discarded on replay. */
  request: ApprovalRequestRecord
}

export type ApiCreationOutcome = 'created' | 'replayed'

export interface ApiCreationResult<T> {
  outcome: ApiCreationOutcome
  resource: T
}

/** What the API calls; absent port means the route answers 503 before writes. */
export interface ApiCreationPort {
  createTaskWithAudit(
    command: CreateTaskWithAuditCommand,
    tenantId?: TenantId
  ): ApiCreationResult<TaskRecord> | Promise<ApiCreationResult<TaskRecord>>
  createApprovalWithAudit(
    command: CreateApprovalWithAuditCommand,
    tenantId?: TenantId
  ):
    | ApiCreationResult<ApprovalRequestRecord>
    | Promise<ApiCreationResult<ApprovalRequestRecord>>
}

function sha256Hex(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(value), 'utf8')
    .digest('hex')
}

/** §3: `SHA256(UTF8(JSON.stringify(["api-creation-key-v1", key])))`. */
export function creationKeyDigest(key: string): string {
  return sha256Hex(['api-creation-key-v1', key])
}

/** §3 task digest; values are the ones after schema defaults, before IDs. */
export function taskRequestDigest(
  tenant: string,
  actor: ApiCreationActor,
  task: CreateTaskWithAuditCommand['task']
): string {
  return sha256Hex([
    'api-creation-request-v1',
    tenant,
    '/v1/tasks',
    actor.actorType,
    actor.actorId,
    task.sessionId,
    task.source,
    task.title,
    task.description,
    task.priority
  ])
}

/** §3 approval digest. */
export function approvalRequestDigest(
  tenant: string,
  actor: ApiCreationActor,
  request: Pick<
    ApprovalRequestRecord,
    'sessionId' | 'proposedAction' | 'summary' | 'riskLevel'
  >
): string {
  return sha256Hex([
    'api-creation-request-v1',
    tenant,
    '/v1/approvals',
    actor.actorType,
    actor.actorId,
    request.sessionId,
    request.proposedAction,
    request.summary,
    request.riskLevel
  ])
}

/** The tenantless memory profile lives in its own explicit namespace. */
export const MEMORY_TENANTLESS_NAMESPACE = 'memory:tenantless'

export function creationNamespaceTenant(tenantId?: TenantId): string {
  return tenantId ?? MEMORY_TENANTLESS_NAMESPACE
}

/**
 * Approvals take the strict header rule (8-200 characters of
 * `[A-Za-z0-9._:-]`). A task keeps the body key it already validates (8-200
 * characters, any text): SPEC 0257 §2 does not tighten it.
 */
export function assertCreationKey(
  key: string,
  route: ApiCreationRoute = '/v1/approvals'
): void {
  const valid =
    route === '/v1/approvals'
      ? API_CREATION_KEY_PATTERN.test(key)
      : key.length >= 8 && key.length <= 200
  if (!valid) {
    throw new DomainError(
      'validation_failed',
      'Idempotency key is outside the accepted range'
    )
  }
}

/** Audit event for a created task (SPEC 0257 §6; payload unchanged). */
export function taskCreationAudit(
  task: TaskRecord,
  command: CreateTaskWithAuditCommand,
  tenantId?: TenantId
): Omit<AuditEventRecord, 'id' | 'createdAt'> {
  return {
    ...(tenantId ? { tenantId } : {}),
    type: 'integration_event',
    actorType: command.actor.actorType,
    actorId: command.actor.actorId,
    correlationId: command.correlationId,
    policyVersion: API_CREATION_POLICY_VERSION,
    payload: {
      sessionId: task.sessionId,
      taskId: task.id,
      source: task.source,
      ...(tenantId ? { tenantId } : {})
    }
  }
}

/**
 * Audit event for a created approval. It is NOT the decision event with
 * `payload.approvalId/decision` (SPEC 0257 §6), so it never feeds that dedupe.
 */
export function approvalCreationAudit(
  approval: ApprovalRequestRecord,
  command: CreateApprovalWithAuditCommand,
  tenantId?: TenantId
): Omit<AuditEventRecord, 'id' | 'createdAt'> {
  return {
    ...(tenantId ? { tenantId } : {}),
    type: 'approval_decision',
    actorType: command.actor.actorType,
    actorId: command.actor.actorId,
    correlationId: command.correlationId,
    policyVersion: API_CREATION_POLICY_VERSION,
    payload: {
      sessionId: approval.sessionId,
      approvalRequestId: approval.id,
      status: approval.status,
      ...(tenantId ? { tenantId } : {})
    }
  }
}

/** Constant diagnostic for a receipt or reference that does not hold. */
export class ApiCreationIntegrityError extends Error {
  constructor() {
    super('Creation receipt integrity check failed')
    this.name = 'ApiCreationIntegrityError'
  }
}

function conflict(): DomainError {
  return new DomainError('conflict', 'Idempotency key was already used')
}

/**
 * Memory adapter (SPEC 0257 §5). The critical section is synchronous: nothing
 * awaits between reading the live state and publishing a detached one, so no
 * other writer interleaves; a fault-injection hook that mutates the live
 * state in between makes the publication abort instead of overwriting it.
 */
export class InMemoryApiCreation implements ApiCreationPort {
  #busy = false

  constructor(private readonly db: InMemoryDatabase) {}

  createTaskWithAudit(
    command: CreateTaskWithAuditCommand,
    rawTenantId?: TenantId
  ): ApiCreationResult<TaskRecord> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    assertCreationKey(command.task.idempotencyKey, '/v1/tasks')
    const namespace = creationNamespaceTenant(tenantId)
    const keyDigest = creationKeyDigest(command.task.idempotencyKey)
    const requestDigest = taskRequestDigest(
      namespace,
      command.actor,
      command.task
    )
    return this.#critical((live) => {
      const receipt = this.#findReceipt(live, tenantId, '/v1/tasks', keyDigest)
      if (receipt) {
        if (receipt.requestDigest !== requestDigest) throw conflict()
        return {
          outcome: 'replayed',
          resource: this.#replayTask(live, receipt)
        }
      }
      const detached: DatabaseState = { ...live }
      const staged = new InMemoryDatabase(detached)
      const tasks = new TaskRepository(staged)
      const legacy = live.tasks.find(
        (task) =>
          task.sessionId === command.task.sessionId &&
          task.source === command.task.source &&
          task.idempotencyKey === command.task.idempotencyKey
      )
      // A task of the legacy unique key without our receipt is never returned
      // as a success (SPEC 0257 §3): 409 with nothing written.
      if (legacy) throw conflict()
      const task = tasks.create(command.task, tenantId)
      const event = new AuditRepository(staged).append(
        taskCreationAudit(task, command, tenantId),
        tenantId
      )
      const receiptRecord: ApiCreationReceiptRecord = {
        tenantId: tenantId ?? null,
        route: '/v1/tasks',
        digestVersion: API_CREATION_DIGEST_VERSION,
        keyDigest,
        requestDigest,
        actorType: command.actor.actorType,
        actorId: command.actor.actorId,
        sessionId: task.sessionId,
        taskSource: task.source,
        taskId: task.id,
        approvalId: null,
        auditId: event.id,
        createdAt: event.createdAt
      }
      detached.apiCreationReceipts = [
        ...live.apiCreationReceipts,
        receiptRecord
      ]
      return { next: detached, result: { outcome: 'created', resource: task } }
    })
  }

  createApprovalWithAudit(
    command: CreateApprovalWithAuditCommand,
    rawTenantId?: TenantId
  ): ApiCreationResult<ApprovalRequestRecord> {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    assertCreationKey(command.idempotencyKey)
    const namespace = creationNamespaceTenant(tenantId)
    const keyDigest = creationKeyDigest(command.idempotencyKey)
    const requestDigest = approvalRequestDigest(
      namespace,
      command.actor,
      command.request
    )
    return this.#critical((live) => {
      const receipt = this.#findReceipt(
        live,
        tenantId,
        '/v1/approvals',
        keyDigest
      )
      if (receipt) {
        if (receipt.requestDigest !== requestDigest) throw conflict()
        return {
          outcome: 'replayed',
          resource: this.#replayApproval(live, receipt)
        }
      }
      if (
        tenantId &&
        !this.#sessionBelongsToTenant(live, command.request.sessionId, tenantId)
      ) {
        throw new DomainError('invalid_action', 'Session not found')
      }
      if (live.approvals.some((item) => item.id === command.request.id)) {
        throw new DomainError('conflict', 'Approval request already exists')
      }
      const detached: DatabaseState = { ...live }
      const staged = new InMemoryDatabase(detached)
      const approval: ApprovalRequestRecord = { ...command.request }
      detached.approvals = [...live.approvals, approval]
      const event = new AuditRepository(staged).append(
        approvalCreationAudit(approval, command, tenantId),
        tenantId
      )
      detached.apiCreationReceipts = [
        ...live.apiCreationReceipts,
        {
          tenantId: tenantId ?? null,
          route: '/v1/approvals',
          digestVersion: API_CREATION_DIGEST_VERSION,
          keyDigest,
          requestDigest,
          actorType: command.actor.actorType,
          actorId: command.actor.actorId,
          sessionId: approval.sessionId,
          taskSource: null,
          taskId: null,
          approvalId: approval.id,
          auditId: event.id,
          createdAt: event.createdAt
        }
      ]
      return {
        next: detached,
        result: { outcome: 'created', resource: approval }
      }
    })
  }

  #critical<T>(
    operation: (
      live: DatabaseState
    ) =>
      | ApiCreationResult<T>
      | { next: DatabaseState; result: ApiCreationResult<T> }
  ): ApiCreationResult<T> {
    if (this.#busy) {
      throw new DomainError('conflict', 'Creation is already in progress')
    }
    this.#busy = true
    try {
      const live = this.db.state
      // Every collection of the live state: any concurrent writer aborts us.
      const captured: Partial<DatabaseState> = { ...live }
      const outcome = operation(live)
      if (!('next' in outcome)) return outcome
      if (!this.db.publish(live, captured, outcome.next)) {
        throw new DomainError(
          'conflict',
          'Creation aborted: the state changed concurrently'
        )
      }
      return {
        outcome: outcome.result.outcome,
        resource: structuredClone(outcome.result.resource)
      }
    } finally {
      this.#busy = false
    }
  }

  #findReceipt(
    state: DatabaseState,
    tenantId: TenantId | undefined,
    route: ApiCreationRoute,
    keyDigest: string
  ): ApiCreationReceiptRecord | undefined {
    return state.apiCreationReceipts.find(
      (receipt) =>
        (receipt.tenantId ?? null) === (tenantId ?? null) &&
        receipt.route === route &&
        receipt.keyDigest === keyDigest
    )
  }

  #sessionBelongsToTenant(
    state: DatabaseState,
    sessionId: string,
    tenantId: TenantId
  ): boolean {
    const session = state.sessions.find((item) => item.id === sessionId)
    const conversation = session
      ? state.conversations.find((item) => item.id === session.conversationId)
      : undefined
    return conversation?.tenantId === tenantId
  }

  #checkAudit(
    state: DatabaseState,
    receipt: ApiCreationReceiptRecord,
    expectedType: AuditEventRecord['type'],
    expectedPayload: Record<string, unknown>
  ): void {
    const event = state.auditEvents.find((item) => item.id === receipt.auditId)
    const payload = event?.payload as Record<string, unknown> | undefined
    if (
      !event ||
      event.type !== expectedType ||
      event.actorType !== receipt.actorType ||
      event.actorId !== receipt.actorId ||
      (event.tenantId ?? null) !== (receipt.tenantId ?? null) ||
      !payload ||
      Object.entries(expectedPayload).some(
        ([key, value]) => payload[key] !== value
      )
    ) {
      throw new ApiCreationIntegrityError()
    }
  }

  #replayTask(
    state: DatabaseState,
    receipt: ApiCreationReceiptRecord
  ): TaskRecord {
    const task = state.tasks.find(
      (item) =>
        item.id === receipt.taskId && item.sessionId === receipt.sessionId
    )
    if (!task || task.source !== receipt.taskSource) {
      throw new ApiCreationIntegrityError()
    }
    this.#checkAudit(state, receipt, 'integration_event', {
      sessionId: receipt.sessionId,
      taskId: receipt.taskId,
      source: receipt.taskSource
    })
    return structuredClone(task)
  }

  #replayApproval(
    state: DatabaseState,
    receipt: ApiCreationReceiptRecord
  ): ApprovalRequestRecord {
    const approval = state.approvals.find(
      (item) =>
        item.id === receipt.approvalId && item.sessionId === receipt.sessionId
    )
    if (!approval) throw new ApiCreationIntegrityError()
    this.#checkAudit(state, receipt, 'approval_decision', {
      sessionId: receipt.sessionId,
      approvalRequestId: receipt.approvalId
    })
    return structuredClone(approval)
  }
}
