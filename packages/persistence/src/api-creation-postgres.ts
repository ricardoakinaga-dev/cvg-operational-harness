/**
 * SPEC 0257 R2 §4 — PostgreSQL adapter for the atomic creation of an internal
 * task / approval request, its single creation audit event and its receipt.
 *
 * One transaction, one owner: {@link runCreationTransaction} is the only
 * code that issues BEGIN / COMMIT / ROLLBACK and releases the client. The
 * repositories it hands the client to never open a transaction, connect to
 * the pool or replace the tenant context.
 */
import { DomainError, createDomainId } from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  API_CREATION_DIGEST_VERSION,
  ApiCreationIntegrityError,
  approvalCreationAudit,
  approvalRequestDigest,
  assertCreationKey,
  creationKeyDigest,
  taskCreationAudit,
  taskRequestDigest,
  type ApiCreationPort,
  type ApiCreationResult,
  type ApiCreationRoute,
  type CreateApprovalWithAuditCommand,
  type CreateTaskWithAuditCommand
} from './api-creation.ts'
import { PostgresRuntimeRepository } from './postgres.ts'
import {
  CVG_TENANT_CONTEXT_SETTING,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'
import type { ApprovalRequestRecord, TaskRecord } from './schema.ts'

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error('Unknown error')
}

/**
 * §4.2: lock key = signed 64-bit hash of the fixed-order JSON. A collision only
 * serializes two operations; it never decides equality or authorization.
 */
function lockText(
  tenantId: string,
  route: ApiCreationRoute,
  keyDigest: string
): string {
  return JSON.stringify(['api-creation-lock-v1', tenantId, route, keyDigest])
}

export interface CreationTransactionHooks {
  /** Test seam: runs after the tenant context was cleared, before COMMIT. */
  beforeCommit?: (client: PostgresPoolClient) => Promise<void>
}

/**
 * Runs `operation` in one transaction on an exclusive pool client.
 *
 * - BEGIN, parameterised tenant context, advisory lock for the operation.
 * - Before COMMIT: tenant context cleared and verified (as `withTenantTransaction`).
 * - A failure before COMMIT rolls back, clears the context, and a connection
 *   whose rollback/cleanup fails is destroyed with `release(error)`.
 * - After COMMIT was sent, any error (dropped connection, no answer) destroys
 *   the client: it is never returned to the pool as if it were clean, and it is
 *   never retried on that connection.
 * - `release` is called exactly once on every path.
 */
export async function runCreationTransaction<T>(
  pool: PostgresPoolLike,
  rawTenantId: TenantId,
  route: ApiCreationRoute,
  keyDigest: string,
  operation: (client: PostgresPoolClient) => Promise<T>,
  hooks: CreationTransactionHooks = {}
): Promise<T> {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const client = await pool.connect()
  let released = false
  const release = (error?: Error): void => {
    if (released) return
    released = true
    client.release(error)
  }
  let commitSent = false
  const clearTenantContext = async (): Promise<void> => {
    await client.query('SELECT set_config($1, $2, false)', [
      CVG_TENANT_CONTEXT_SETTING,
      ''
    ])
    const leaked = await client.query<{ tenant_id: string | null }>(
      `SELECT NULLIF(current_setting($1, true), '') AS tenant_id`,
      [CVG_TENANT_CONTEXT_SETTING]
    )
    if (leaked.rows.length !== 1 || leaked.rows[0]?.tenant_id !== null) {
      throw new Error('PostgreSQL tenant context cleanup was not verified')
    }
  }
  try {
    await client.query('BEGIN')
    await client.query('SELECT set_config($1, $2, false)', [
      CVG_TENANT_CONTEXT_SETTING,
      tenantId
    ])
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [lockText(tenantId, route, keyDigest)]
    )
    const result = await operation(client)
    await clearTenantContext()
    await hooks.beforeCommit?.(client)
    commitSent = true
    await client.query('COMMIT')
    release()
    return result
  } catch (error) {
    if (commitSent) {
      // COMMIT outcome unknown: destroy the connection, never reuse it.
      release(toError(error))
      throw error
    }
    try {
      await client.query('ROLLBACK')
    } catch (rollbackError) {
      release(toError(rollbackError))
      throw error
    }
    try {
      await clearTenantContext()
    } catch (cleanupError) {
      release(toError(cleanupError))
      throw error
    }
    release()
    throw error
  }
}

interface ReceiptRow {
  digest_version: number
  request_digest: string
  actor_type: string
  actor_id: string
  session_id: string
  task_source: string | null
  task_id: string | null
  approval_id: string | null
  audit_id: string
}

interface TaskRow {
  id: string
  session_id: string
  title: string
  description: string
  priority: TaskRecord['priority']
  source: string
  status: TaskRecord['status']
  idempotency_key: string
  created_at: Date
}

interface ApprovalRow {
  id: string
  session_id: string
  proposed_action: string
  summary: string
  risk_level: ApprovalRequestRecord['riskLevel']
  status: ApprovalRequestRecord['status']
  decided_by: string | null
  decided_at: Date | null
  created_at: Date
}

function mapTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    title: row.title,
    description: row.description,
    priority: row.priority,
    source: row.source,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at
  }
}

function mapApproval(row: ApprovalRow): ApprovalRequestRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    proposedAction: row.proposed_action,
    summary: row.summary,
    riskLevel: row.risk_level,
    status: row.status,
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    createdAt: row.created_at
  }
}

function keyConflict(): DomainError {
  return new DomainError('conflict', 'Idempotency key was already used')
}

export class PostgresApiCreation implements ApiCreationPort {
  constructor(
    private readonly pool: PostgresPoolLike,
    private readonly hooks: CreationTransactionHooks = {}
  ) {}

  async createTaskWithAudit(
    command: CreateTaskWithAuditCommand,
    rawTenantId?: TenantId
  ): Promise<ApiCreationResult<TaskRecord>> {
    const tenantId = this.requireTenant(rawTenantId)
    assertCreationKey(command.task.idempotencyKey, '/v1/tasks')
    const keyDigest = creationKeyDigest(command.task.idempotencyKey)
    const requestDigest = taskRequestDigest(
      tenantId,
      command.actor,
      command.task
    )
    return runCreationTransaction(
      this.pool,
      tenantId,
      '/v1/tasks',
      keyDigest,
      async (client) => {
        const receipt = await this.readReceipt(
          client,
          tenantId,
          '/v1/tasks',
          keyDigest
        )
        if (receipt) {
          this.assertReplayable(receipt, requestDigest)
          return {
            outcome: 'replayed',
            resource: await this.replayTask(client, tenantId, receipt)
          } as const
        }
        await this.assertSession(client, tenantId, command.task.sessionId)
        const task: TaskRecord = {
          id: createDomainId('task'),
          sessionId: command.task.sessionId,
          title: command.task.title,
          description: command.task.description,
          priority: command.task.priority,
          source: command.task.source,
          status: 'open',
          idempotencyKey: command.task.idempotencyKey,
          createdAt: new Date()
        }
        const inserted = await client.query(
          `INSERT INTO tasks (tenant_id, id, session_id, title, description, priority, source, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (session_id, source, idempotency_key) DO NOTHING
           RETURNING id`,
          [
            tenantId,
            task.id,
            task.sessionId,
            task.title,
            task.description,
            task.priority,
            task.source,
            task.status,
            task.idempotencyKey,
            task.createdAt
          ]
        )
        // Lost the legacy unique key without a receipt of ours (a legacy
        // writer or a pre-receipt task): never returned as a success.
        if (inserted.rows.length === 0) throw keyConflict()
        const event = await new PostgresRuntimeRepository(client, {
          tenantIsolation: true
        }).appendAudit(taskCreationAudit(task, command, tenantId))
        await this.insertReceipt(client, {
          tenantId,
          route: '/v1/tasks',
          keyDigest,
          requestDigest,
          command,
          sessionId: task.sessionId,
          taskSource: task.source,
          taskId: task.id,
          approvalId: null,
          auditId: event.id,
          createdAt: event.createdAt
        })
        return { outcome: 'created', resource: task } as const
      },
      this.hooks
    )
  }

  async createApprovalWithAudit(
    command: CreateApprovalWithAuditCommand,
    rawTenantId?: TenantId
  ): Promise<ApiCreationResult<ApprovalRequestRecord>> {
    const tenantId = this.requireTenant(rawTenantId)
    assertCreationKey(command.idempotencyKey)
    const keyDigest = creationKeyDigest(command.idempotencyKey)
    const requestDigest = approvalRequestDigest(
      tenantId,
      command.actor,
      command.request
    )
    return runCreationTransaction(
      this.pool,
      tenantId,
      '/v1/approvals',
      keyDigest,
      async (client) => {
        const receipt = await this.readReceipt(
          client,
          tenantId,
          '/v1/approvals',
          keyDigest
        )
        if (receipt) {
          this.assertReplayable(receipt, requestDigest)
          return {
            outcome: 'replayed',
            resource: await this.replayApproval(client, tenantId, receipt)
          } as const
        }
        await this.assertSession(client, tenantId, command.request.sessionId)
        const approval = command.request
        const inserted = await client.query(
          `INSERT INTO approval_requests (tenant_id, id, session_id, proposed_action, summary, risk_level, status, decided_by, decided_at, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO NOTHING RETURNING id`,
          [
            tenantId,
            approval.id,
            approval.sessionId,
            approval.proposedAction,
            approval.summary,
            approval.riskLevel,
            approval.status,
            approval.decidedBy,
            approval.decidedAt,
            approval.createdAt
          ]
        )
        if (inserted.rows.length === 0) {
          throw new DomainError('conflict', 'Approval request already exists')
        }
        const event = await new PostgresRuntimeRepository(client, {
          tenantIsolation: true
        }).appendAudit(approvalCreationAudit(approval, command, tenantId))
        await this.insertReceipt(client, {
          tenantId,
          route: '/v1/approvals',
          keyDigest,
          requestDigest,
          command,
          sessionId: approval.sessionId,
          taskSource: null,
          taskId: null,
          approvalId: approval.id,
          auditId: event.id,
          createdAt: event.createdAt
        })
        return { outcome: 'created', resource: approval } as const
      },
      this.hooks
    )
  }

  private requireTenant(rawTenantId?: TenantId): TenantId {
    const parsed = TenantIdSchema.safeParse(rawTenantId)
    if (!parsed.success) {
      throw new DomainError('invalid_action', 'Tenant scope is required')
    }
    return parsed.data
  }

  private async assertSession(
    client: PostgresPoolClient,
    tenantId: TenantId,
    sessionId: string
  ): Promise<void> {
    const session = await client.query(
      'SELECT 1 FROM sessions WHERE tenant_id = $1 AND id = $2',
      [tenantId, sessionId]
    )
    if (session.rows.length === 0) {
      throw new DomainError('invalid_action', 'Session not found')
    }
  }

  private async readReceipt(
    client: PostgresPoolClient,
    tenantId: TenantId,
    route: ApiCreationRoute,
    keyDigest: string
  ): Promise<ReceiptRow | null> {
    const result = await client.query<ReceiptRow>(
      `SELECT digest_version, request_digest, actor_type, actor_id, session_id,
              task_source, task_id, approval_id, audit_id
         FROM api_creation_receipts
        WHERE tenant_id = $1 AND route = $2 AND key_digest = $3`,
      [tenantId, route, keyDigest]
    )
    return result.rows[0] ?? null
  }

  private assertReplayable(receipt: ReceiptRow, requestDigest: string): void {
    if (receipt.digest_version !== API_CREATION_DIGEST_VERSION) {
      throw new ApiCreationIntegrityError()
    }
    if (receipt.request_digest !== requestDigest) throw keyConflict()
  }

  private async insertReceipt(
    client: PostgresPoolClient,
    input: {
      tenantId: TenantId
      route: ApiCreationRoute
      keyDigest: string
      requestDigest: string
      command: { actor: { actorType: string; actorId: string } }
      sessionId: string
      taskSource: string | null
      taskId: string | null
      approvalId: string | null
      auditId: string
      createdAt: Date
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO api_creation_receipts
         (tenant_id, route, digest_version, key_digest, request_digest, actor_type,
          actor_id, session_id, task_source, task_id, approval_id, audit_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        input.tenantId,
        input.route,
        API_CREATION_DIGEST_VERSION,
        input.keyDigest,
        input.requestDigest,
        input.command.actor.actorType,
        input.command.actor.actorId,
        input.sessionId,
        input.taskSource,
        input.taskId,
        input.approvalId,
        input.auditId,
        input.createdAt
      ]
    )
  }

  /** §4.1: resource and audit are validated against the receipt; failure is a 500. */
  private async checkAudit(
    client: PostgresPoolClient,
    tenantId: TenantId,
    receipt: ReceiptRow,
    expectedType: string,
    expectedPayload: Record<string, unknown>
  ): Promise<void> {
    const result = await client.query<{
      type: string
      actor_type: string
      actor_id: string
      payload: Record<string, unknown>
    }>(
      `SELECT type, actor_type, actor_id, payload
         FROM audit_events WHERE tenant_id = $1 AND id = $2`,
      [tenantId, receipt.audit_id]
    )
    const event = result.rows[0]
    if (
      !event ||
      event.type !== expectedType ||
      event.actor_type !== receipt.actor_type ||
      event.actor_id !== receipt.actor_id ||
      Object.entries(expectedPayload).some(
        ([key, value]) => event.payload?.[key] !== value
      )
    ) {
      throw new ApiCreationIntegrityError()
    }
  }

  private async replayTask(
    client: PostgresPoolClient,
    tenantId: TenantId,
    receipt: ReceiptRow
  ): Promise<TaskRecord> {
    const result = await client.query<TaskRow>(
      `SELECT id, session_id, title, description, priority, source, status, idempotency_key, created_at
         FROM tasks WHERE tenant_id = $1 AND session_id = $2 AND id = $3`,
      [tenantId, receipt.session_id, receipt.task_id]
    )
    const row = result.rows[0]
    if (!row || row.source !== receipt.task_source) {
      throw new ApiCreationIntegrityError()
    }
    await this.checkAudit(client, tenantId, receipt, 'integration_event', {
      sessionId: receipt.session_id,
      taskId: receipt.task_id,
      source: receipt.task_source
    })
    return mapTask(row)
  }

  private async replayApproval(
    client: PostgresPoolClient,
    tenantId: TenantId,
    receipt: ReceiptRow
  ): Promise<ApprovalRequestRecord> {
    const result = await client.query<ApprovalRow>(
      `SELECT id, session_id, proposed_action, summary, risk_level, status, decided_by, decided_at, created_at
         FROM approval_requests WHERE tenant_id = $1 AND session_id = $2 AND id = $3`,
      [tenantId, receipt.session_id, receipt.approval_id]
    )
    const row = result.rows[0]
    if (!row) throw new ApiCreationIntegrityError()
    await this.checkAudit(client, tenantId, receipt, 'approval_decision', {
      sessionId: receipt.session_id,
      approvalRequestId: receipt.approval_id
    })
    return mapApproval(row)
  }
}
