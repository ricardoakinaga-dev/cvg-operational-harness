import type {
  EffectJournal,
  EffectJournalRecord,
  EffectJournalState,
  ExecutionEvent,
  ExecutionFailure,
  ExecutionRecord,
  ExecutionState,
  ExecutionSubmission,
  OperationalExecutionStore,
  SubmitResult,
  ClaimResult,
  ExecutionTransitionInput,
  ExecutionCancellationInput
} from '@cvg/harness'
import type { AuditEvent } from '@cvg/harness-contracts'
import {
  OperationalExecutionError,
  computeExecutionRequestHash,
  DEFAULT_MAX_EXECUTION_ATTEMPTS,
  isExecutionTransitionAllowed,
  parseExecutionSubmission,
  validateExecutionTransitionPayload
} from '@cvg/harness'
import type { TenantId } from '@cvg/platform'
import { TenantIdSchema } from '@cvg/platform'
import type { QueryResultRow } from 'pg'
import type { PostgresQueryable } from './postgres.ts'
import {
  withTenantContext,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

export type OperationalExecutionPostgresConnection =
  | PostgresQueryable
  | PostgresPoolLike

export interface PostgresOperationalExecutionStoreOptions {
  readonly leaseMs?: number
  readonly retryDelayMs?: number
  readonly maxAttempts?: number
  readonly clock?: () => Date
}

interface ExecutionRow extends QueryResultRow {
  tenant_id: string
  id: string
  idempotency_key: string
  request_hash: string
  request: unknown
  state: ExecutionState
  attempt: number
  lease_owner: string | null
  lease_until: Date | string | null
  result: unknown
  failure: unknown
  approval_id: string | null
  resume: unknown
  created_at: Date | string
  updated_at: Date | string
  completed_at: Date | string | null
}

interface EventRow extends QueryResultRow {
  sequence: string | number
  execution_id: string
  tenant_id: string
  event_type: ExecutionEvent['type']
  worker_id: string | null
  attempt: number
  reason: string | null
  approval_id: string | null
  audit_events: unknown
  created_at: Date | string
}

interface QueueRow extends QueryResultRow {
  tenant_id: string
  execution_id: string
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'dead_letter'
  available_at: Date | string
  attempts: number
  lease_owner: string | null
  lease_until: Date | string | null
  last_error: string | null
  processed_at: Date | string | null
}

interface EffectRow extends QueryResultRow {
  tenant_id: string
  operation_key: string
  proposal_hash: string
  state: EffectJournalState
  attempt_id: string
  result: unknown
  error: string | null
  created_at: Date | string
  updated_at: Date | string
}

const executionColumns = `
  tenant_id, id, idempotency_key, request_hash, request, state, attempt,
  lease_owner, lease_until, result, failure, approval_id, resume,
  created_at, updated_at, completed_at`

const executionColumnsFromJoin = `
  e.tenant_id, e.id, e.idempotency_key, e.request_hash, e.request, e.state,
  e.attempt, e.lease_owner, e.lease_until, e.result, e.failure,
  e.approval_id, e.resume, e.created_at, e.updated_at, e.completed_at`

const effectColumns = `
  tenant_id, operation_key, proposal_hash, state, attempt_id, result, error,
  created_at, updated_at`

const eventTypes = new Set<ExecutionEvent['type']>([
  'RECEIVED',
  'QUEUED',
  'CLAIMED',
  'RUNNING',
  'RECOVERED',
  'WAITING_APPROVAL',
  'WAITING_USER',
  'USER_INPUT',
  'SUCCEEDED',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED'
])

function positiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} must be a positive integer`
    )
  }
  return value
}

function asIso(value: Date | string | null): string | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new OperationalExecutionError(
      'invalid_action',
      'Persisted execution timestamp is invalid'
    )
  }
  return date.toISOString()
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new OperationalExecutionError(
      'invalid_action',
      'Persisted execution JSON is invalid'
    )
  }
}

function jsonText(value: unknown, label: string): string {
  let serialized: string
  try {
    serialized = JSON.stringify(value)
  } catch {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is not serializable`
    )
  }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > 256 * 1024) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} exceeds the bounded persistence envelope`
    )
  }
  return serialized
}

function text(value: string, label: string, max = 500): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is required`
    )
  }
  if (value.length > max) {
    throw new OperationalExecutionError(
      'validation_failed',
      `${label} is too long`
    )
  }
  return value.trim()
}

function retryExhaustedFailure(maxAttempts: number): ExecutionFailure {
  return {
    kind: 'SEMANTIC_TERMINAL',
    code: 'retry_exhausted',
    message: `Execution exhausted the maximum of ${maxAttempts} attempts.`
  }
}

function mapRecord(row: ExecutionRow): ExecutionRecord {
  const request = jsonValue(row.request) as ExecutionSubmission
  return {
    id: row.id,
    tenantId: row.tenant_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    ...(request.capabilityFingerprint ?? request.runtime.capabilityFingerprint
      ? {
          capabilityFingerprint:
            request.capabilityFingerprint ?? request.runtime.capabilityFingerprint
        }
      : {}),
    request,
    state: row.state,
    attempt: row.attempt,
    leaseOwner: row.lease_owner,
    leaseUntil: asIso(row.lease_until),
    result: jsonValue(row.result) as ExecutionRecord['result'],
    failure: jsonValue(row.failure) as ExecutionFailure | null,
    approvalId: row.approval_id ?? null,
    resume: jsonValue(row.resume) as ExecutionRecord['resume'],
    createdAt: asIso(row.created_at) as string,
    updatedAt: asIso(row.updated_at) as string,
    completedAt: asIso(row.completed_at)
  }
}

function mapEvent(row: EventRow): ExecutionEvent {
  if (!eventTypes.has(row.event_type)) {
    throw new OperationalExecutionError(
      'invalid_action',
      'Persisted execution event type is invalid'
    )
  }
  return {
    sequence: Number(row.sequence),
    executionId: row.execution_id,
    tenantId: row.tenant_id,
    type: row.event_type,
    workerId: row.worker_id,
    attempt: row.attempt,
    reason: row.reason,
    ...(row.approval_id ? { approvalId: row.approval_id } : {}),
    ...(row.audit_events !== null
      ? { auditEvents: jsonValue(row.audit_events) as readonly AuditEvent[] }
      : {}),
    createdAt: asIso(row.created_at) as string
  }
}

async function transaction<T>(
  client: PostgresQueryable,
  operation: () => Promise<T>
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

function isPool(
  connection: OperationalExecutionPostgresConnection
): connection is PostgresPoolLike {
  return typeof (connection as PostgresPoolLike).connect === 'function'
}

/** PostgreSQL authority for the neutral AAA-21 execution spine. */
export class PostgresOperationalExecutionStore implements OperationalExecutionStore {
  private readonly leaseMs: number
  private readonly retryDelayMs: number
  private readonly maxAttempts: number
  private readonly clock: () => Date

  public constructor(
    private readonly connection: OperationalExecutionPostgresConnection,
    options: PostgresOperationalExecutionStoreOptions = {}
  ) {
    this.leaseMs = positiveInt(options.leaseMs ?? 30_000, 'leaseMs')
    this.retryDelayMs = positiveInt(
      options.retryDelayMs ?? 1_000,
      'retryDelayMs'
    )
    this.maxAttempts = positiveInt(
      options.maxAttempts ?? DEFAULT_MAX_EXECUTION_ATTEMPTS,
      'maxAttempts'
    )
    this.clock = options.clock ?? (() => new Date())
  }

  public submit(
    input: ExecutionSubmission,
    rawNow?: Date
  ): Promise<SubmitResult> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const normalized = parseExecutionSubmission(input, tenant)
    const now = rawNow ?? this.clock()
    const requestHash = computeExecutionRequestHash(normalized)
    const id = `exec_${cryptoRandomUuid()}`
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const existing = await client.query<ExecutionRow>(
          `SELECT ${executionColumns}
             FROM operational_executions
            WHERE tenant_id = $1 AND idempotency_key = $2
            FOR UPDATE`,
          [tenant, normalized.idempotencyKey]
        )
        if (existing.rows[0]) {
          const record = mapRecord(existing.rows[0])
          if (record.requestHash !== requestHash) {
            throw new OperationalExecutionError(
              'conflict',
              'Idempotency key is already bound to a different request'
            )
          }
          return { record, created: false }
        }

        const inserted = await client.query<ExecutionRow>(
          `INSERT INTO operational_executions
             (tenant_id, id, idempotency_key, request_hash, request, state,
              attempt, lease_owner, lease_until, result, failure,
              approval_id, resume, created_at, updated_at, completed_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, 'RECEIVED', 0, NULL, NULL,
                   NULL, NULL, NULL, NULL, $6, $6, NULL)
           ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
           RETURNING ${executionColumns}`,
          [
            tenant,
            id,
            normalized.idempotencyKey,
            requestHash,
            jsonText(normalized, 'Execution request'),
            now
          ]
        )
        if (!inserted.rows[0]) {
          const winner = await client.query<ExecutionRow>(
            `SELECT ${executionColumns}
               FROM operational_executions
              WHERE tenant_id = $1 AND idempotency_key = $2
              FOR UPDATE`,
            [tenant, normalized.idempotencyKey]
          )
          if (!winner.rows[0]) {
            throw new OperationalExecutionError(
              'conflict',
              'Execution idempotency winner could not be read'
            )
          }
          const record = mapRecord(winner.rows[0])
          if (record.requestHash !== requestHash) {
            throw new OperationalExecutionError(
              'conflict',
              'Idempotency key is already bound to a different request'
            )
          }
          return { record, created: false }
        }

        const received = mapRecord(inserted.rows[0])
        await this.appendEvent(
          client,
          received,
          'RECEIVED',
          null,
          null,
          undefined,
          now
        )
        const queueInserted = await client.query(
          `INSERT INTO operational_execution_outbox
             (tenant_id, execution_id, status, available_at, attempts,
              lease_owner, lease_until, last_error, created_at, processed_at)
           VALUES ($1, $2, 'pending', $3, 0, NULL, NULL, NULL, $3, NULL)`,
          [tenant, received.id, now]
        )
        if (queueInserted.rowCount !== 1) {
          throw new OperationalExecutionError(
            'conflict',
            'Execution queue could not be paired'
          )
        }
        const queued = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET state = 'QUEUED', updated_at = $3
            WHERE tenant_id = $1 AND id = $2 AND state = 'RECEIVED'
            RETURNING ${executionColumns}`,
          [tenant, received.id, now]
        )
        if (!queued.rows[0]) {
          throw new OperationalExecutionError(
            'conflict',
            'Execution could not be queued'
          )
        }
        const record = mapRecord(queued.rows[0])
        await this.appendEvent(
          client,
          record,
          'QUEUED',
          null,
          'submission_enqueued',
          undefined,
          now
        )
        return { record, created: true }
      })
    )
  }

  public get(
    tenantId: string,
    executionId: string
  ): Promise<ExecutionRecord | null> {
    const tenant = TenantIdSchema.parse(tenantId)
    const id = text(executionId, 'executionId', 200)
    return this.run(tenant, async (client) => {
      const result = await client.query<ExecutionRow>(
        `SELECT ${executionColumns}
           FROM operational_executions
          WHERE tenant_id = $1 AND id = $2`,
        [tenant, id]
      )
      return result.rows[0] ? mapRecord(result.rows[0]) : null
    })
  }

  public claimNext(
    tenantId: string,
    workerId: string,
    rawNow?: Date,
    rawLeaseMs = this.leaseMs
  ): Promise<ClaimResult | null> {
    const tenant = TenantIdSchema.parse(tenantId)
    const worker = text(workerId, 'workerId', 120)
    const now = rawNow ?? this.clock()
    const leaseMs = positiveInt(rawLeaseMs, 'leaseMs')
    const leaseUntil = new Date(now.getTime() + leaseMs)
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        while (true) {
          const selected = await client.query<ExecutionRow & QueueRow>(
            `SELECT ${executionColumnsFromJoin}, q.execution_id, q.status, q.available_at,
                    q.attempts AS queue_attempts, q.lease_owner AS queue_lease_owner,
                    q.lease_until AS queue_lease_until, q.last_error,
                    q.processed_at
               FROM operational_execution_outbox q
               JOIN operational_executions e
                 ON e.tenant_id = q.tenant_id AND e.id = q.execution_id
              WHERE q.tenant_id = $1
                AND e.state IN ('QUEUED', 'FAILED_RETRYABLE')
                AND (
                  (q.status IN ('pending', 'failed') AND q.available_at <= $2)
                  OR (q.status = 'processing' AND q.lease_until <= $2)
                )
              ORDER BY q.available_at ASC, q.created_at ASC, q.execution_id ASC
              FOR UPDATE OF q, e SKIP LOCKED
              LIMIT 1`,
            [tenant, now]
          )
          const row = selected.rows[0]
          if (!row) return null

          if (
            row.state === 'FAILED_RETRYABLE' &&
            row.attempt >= this.maxAttempts
          ) {
            const exhausted = retryExhaustedFailure(this.maxAttempts)
            const exhaustedResult = await client.query<ExecutionRow>(
              `UPDATE operational_executions
                  SET state = 'FAILED_TERMINAL', lease_owner = NULL,
                      lease_until = NULL, failure = $3::jsonb,
                      updated_at = $2, completed_at = $2
                WHERE tenant_id = $1 AND id = $4
                  AND state = 'FAILED_RETRYABLE'
                  AND attempt >= $5
                RETURNING ${executionColumns}`,
              [
                tenant,
                now,
                jsonText(exhausted, 'Execution failure'),
                row.execution_id,
                this.maxAttempts
              ]
            )
            if (!exhaustedResult.rows[0]) {
              throw new OperationalExecutionError(
                'conflict',
                'Retry exhaustion transition lost'
              )
            }
            const exhaustedRecord = mapRecord(exhaustedResult.rows[0])
            const deadLettered = await client.query(
              `UPDATE operational_execution_outbox
                  SET status = 'dead_letter', available_at = $3,
                      lease_owner = NULL, lease_until = NULL,
                      last_error = $4, processed_at = $3
                WHERE tenant_id = $1 AND execution_id = $2`,
              [tenant, exhaustedRecord.id, now, exhausted.message]
            )
            if (deadLettered.rowCount !== 1) {
              throw new OperationalExecutionError(
                'conflict',
                'Retry exhaustion queue pairing was lost'
              )
            }
            await this.appendEvent(
              client,
              exhaustedRecord,
              'FAILED_TERMINAL',
              null,
              'retry_exhausted',
              undefined,
              now
            )
            continue
          }

          const recovered = row.status === 'processing'
          const updated = await client.query<ExecutionRow>(
            `UPDATE operational_executions
                SET state = 'CLAIMED', attempt = attempt + 1,
                    lease_owner = $3, lease_until = $4,
                    updated_at = $2,
                    failure = CASE WHEN state = 'FAILED_RETRYABLE' THEN NULL ELSE failure END
              WHERE tenant_id = $1 AND id = $5
                AND state IN ('QUEUED', 'FAILED_RETRYABLE')
              RETURNING ${executionColumns}`,
            [tenant, now, worker, leaseUntil, row.execution_id]
          )
          if (!updated.rows[0]) {
            throw new OperationalExecutionError(
              'conflict',
              'Execution claim was lost'
            )
          }
          const record = mapRecord(updated.rows[0])
          const queueUpdated = await client.query(
            `UPDATE operational_execution_outbox
                SET status = 'processing', attempts = attempts + 1,
                    lease_owner = $3, lease_until = $4,
                    available_at = $2, last_error = NULL
              WHERE tenant_id = $1 AND execution_id = $5`,
            [tenant, now, worker, leaseUntil, record.id]
          )
          if (queueUpdated.rowCount !== 1) {
            throw new OperationalExecutionError(
              'conflict',
              'Execution claim queue pairing was lost'
            )
          }
          await this.appendEvent(
            client,
            record,
            'CLAIMED',
            worker,
            recovered ? 'stale_lease_reclaimed' : 'worker_claimed',
            undefined,
            now
          )
          return { record, recovered }
        }
      })
    )
  }

  public heartbeat(
    tenantId: string,
    executionId: string,
    workerId: string,
    fenceToken: number,
    rawNow?: Date,
    rawLeaseMs = this.leaseMs
  ): Promise<ExecutionRecord> {
    const tenant = TenantIdSchema.parse(tenantId)
    const id = text(executionId, 'executionId', 200)
    const worker = text(workerId, 'workerId', 120)
    const now = rawNow ?? this.clock()
    const leaseUntil = new Date(
      now.getTime() + positiveInt(rawLeaseMs, 'leaseMs')
    )
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const current = await this.lockedRecord(client, tenant, id)
        this.assertLease(current, worker, now, fenceToken)
        const updated = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET lease_until = $3, updated_at = $4
            WHERE tenant_id = $1 AND id = $2
              AND lease_owner = $5 AND attempt = $6
              AND state IN ('CLAIMED', 'RUNNING') AND lease_until > $4
            RETURNING ${executionColumns}`,
          [tenant, id, leaseUntil, now, worker, fenceToken]
        )
        const queueUpdated = await client.query(
          `UPDATE operational_execution_outbox
              SET lease_until = $3
            WHERE tenant_id = $1 AND execution_id = $2
              AND lease_owner = $4 AND status = 'processing'
              AND lease_until > $5`,
          [tenant, id, leaseUntil, worker, now]
        )
        if (!updated.rows[0])
          throw new OperationalExecutionError(
            'lease_lost',
            'Execution lease is not owned by this worker'
          )
        if (queueUpdated.rowCount !== 1) {
          throw new OperationalExecutionError(
            'lease_lost',
            'Execution queue lease is not owned by this worker'
          )
        }
        return mapRecord(updated.rows[0])
      })
    )
  }

  public transition(
    input: ExecutionTransitionInput,
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const id = text(input.executionId, 'executionId', 200)
    const now = rawNow ?? this.clock()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const current = await this.lockedRecord(client, tenant, id)
        if (!isExecutionTransitionAllowed(current.state, input.to)) {
          throw new OperationalExecutionError(
            'invalid_action',
            `Transition ${current.state} -> ${input.to} is not allowed`
          )
        }
        if (current.state === 'WAITING_APPROVAL' && input.to === 'QUEUED') {
          throw new OperationalExecutionError(
            'invalid_action',
            'WAITING_APPROVAL must be resolved through resolveApproval'
          )
        }
        if (input.to === 'CLAIMED') {
          throw new OperationalExecutionError(
            'invalid_action',
            'CLAIMED must be assigned through claimNext'
          )
        }
        if (['CLAIMED', 'RUNNING'].includes(current.state)) {
          if (!input.workerId) {
            throw new OperationalExecutionError(
              'validation_failed',
              'Active execution transitions require workerId'
            )
          }
          this.assertLease(current, input.workerId, now, input.fenceToken)
        }
        const requestedApprovalId =
          input.approvalId ?? input.result?.approvalId ?? current.approvalId
        const exhausted =
          input.to === 'FAILED_RETRYABLE' && current.attempt >= this.maxAttempts
        const targetState: ExecutionState = exhausted
          ? 'FAILED_TERMINAL'
          : input.to
        const clearsLease = new Set<ExecutionState>([
          'WAITING_APPROVAL',
          'WAITING_USER',
          'SUCCEEDED',
          'FAILED_RETRYABLE',
          'FAILED_TERMINAL',
          'CANCELLED',
          'QUEUED'
        ]).has(targetState)
        const completedAt =
          targetState === 'SUCCEEDED' ||
          targetState === 'FAILED_TERMINAL' ||
          targetState === 'CANCELLED'
            ? now
            : current.completedAt
        const failure = exhausted
          ? retryExhaustedFailure(this.maxAttempts)
          : input.failure !== undefined
            ? validateFailure(input.failure)
            : targetState === 'RUNNING'
              ? null
              : current.failure
        const result =
          input.result !== undefined ? input.result : current.result
        const approvalId =
          targetState === 'WAITING_APPROVAL'
            ? requestedApprovalId
            : current.approvalId
        validateExecutionTransitionPayload({
          to: targetState,
          result: result as ExecutionRecord['result'],
          failure,
          approvalId
        })
        const updated = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET state = $3, lease_owner = $4, lease_until = $5,
                  result = $6::jsonb, failure = $7::jsonb, approval_id = $8,
                  updated_at = $9, completed_at = $10
            WHERE tenant_id = $1 AND id = $2
            RETURNING ${executionColumns}`,
          [
            tenant,
            id,
            targetState,
            clearsLease ? null : current.leaseOwner,
            clearsLease ? null : current.leaseUntil,
            result === null ? null : jsonText(result, 'Execution result'),
            failure === null ? null : jsonText(failure, 'Execution failure'),
            approvalId,
            now,
            completedAt
          ]
        )
        if (!updated.rows[0])
          throw new OperationalExecutionError(
            'conflict',
            'Execution transition lost'
          )
        const record = mapRecord(updated.rows[0])
        const queueState = this.queueUpdateForTransition(
          targetState,
          failure,
          now,
          current
        )
        const queueUpdated = await client.query(
          `UPDATE operational_execution_outbox
              SET status = $3, available_at = $4, lease_owner = $5,
                  lease_until = $6, last_error = $7, processed_at = $8
            WHERE tenant_id = $1 AND execution_id = $2`,
          [
            tenant,
            id,
            queueState.status,
            queueState.availableAt,
            queueState.leaseOwner,
            queueState.leaseUntil,
            queueState.lastError,
            queueState.processedAt
          ]
        )
        if (queueUpdated.rowCount !== 1) {
          throw new OperationalExecutionError(
            'conflict',
            'Execution transition queue pairing was lost'
          )
        }
        await this.appendEvent(
          client,
          record,
          eventType(targetState),
          input.workerId ?? null,
          exhausted
            ? 'retry_exhausted'
            : (input.reason ??
                `transition_${current.state.toLowerCase()}_${targetState.toLowerCase()}`),
          input.auditEvents,
          now
        )
        return record
      })
    )
  }

  public cancel(
    input: ExecutionCancellationInput,
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const id = text(input.executionId, 'executionId', 200)
    const actorId = text(input.actorId, 'actorId', 120)
    const now = rawNow ?? this.clock()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const current = await this.lockedRecord(client, tenant, id)
        if (current.state === 'CANCELLED') return current
        if (current.state === 'CLAIMED' || current.state === 'RUNNING') {
          throw new OperationalExecutionError(
            'conflict',
            'Active execution cannot be cancelled safely'
          )
        }
        if (
          current.state === 'SUCCEEDED' ||
          current.state === 'FAILED_TERMINAL'
        ) {
          throw new OperationalExecutionError(
            'invalid_action',
            'Terminal execution cannot be cancelled'
          )
        }
        const failure: ExecutionFailure = {
          kind: 'CANCELLED',
          code: 'cancelled_by_operator',
          message: input.reason?.trim() || 'Execution cancelled by operator.'
        }
        validateExecutionTransitionPayload({ to: 'CANCELLED', failure })
        const updated = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET state = 'CANCELLED', lease_owner = NULL,
                  lease_until = NULL, failure = $3::jsonb,
                  updated_at = $4, completed_at = $4
            WHERE tenant_id = $1 AND id = $2
              AND state NOT IN ('SUCCEEDED', 'FAILED_TERMINAL', 'CANCELLED', 'CLAIMED', 'RUNNING')
            RETURNING ${executionColumns}`,
          [tenant, id, jsonText(failure, 'Cancellation failure'), now]
        )
        if (!updated.rows[0]) {
          throw new OperationalExecutionError(
            'conflict',
            'Execution cancellation lost its state binding'
          )
        }
        const record = mapRecord(updated.rows[0])
        const queueState = this.queueUpdateForTransition(
          'CANCELLED',
          failure,
          now,
          current
        )
        const queueUpdated = await client.query(
          `UPDATE operational_execution_outbox
              SET status = $3, available_at = $4, lease_owner = $5,
                  lease_until = $6, last_error = $7, processed_at = $8
            WHERE tenant_id = $1 AND execution_id = $2`,
          [
            tenant,
            id,
            queueState.status,
            queueState.availableAt,
            queueState.leaseOwner,
            queueState.leaseUntil,
            queueState.lastError,
            queueState.processedAt
          ]
        )
        if (queueUpdated.rowCount !== 1) {
          throw new OperationalExecutionError(
            'conflict',
            'Execution cancellation queue pairing was lost'
          )
        }
        await this.appendEvent(
          client,
          record,
          'CANCELLED',
          null,
          `cancelled:${actorId}`,
          undefined,
          now
        )
        return record
      })
    )
  }

  public resolveApproval(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly approvalId: string
      readonly actorId: string
      readonly decision: 'APPROVED' | 'REJECTED'
      readonly reason?: string
    },
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const id = text(input.executionId, 'executionId', 200)
    const approvalId = text(input.approvalId, 'approvalId', 160)
    const actorId = text(input.actorId, 'actorId', 120)
    const now = rawNow ?? this.clock()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const current = await this.lockedRecord(client, tenant, id)
        if (
          current.state !== 'WAITING_APPROVAL' &&
          current.approvalId === approvalId &&
          ((input.decision === 'APPROVED' &&
            current.state !== 'FAILED_TERMINAL') ||
            (input.decision === 'REJECTED' &&
              current.state === 'FAILED_TERMINAL' &&
              current.failure?.code === 'approval_rejected'))
        ) {
          return current
        }
        if (current.state !== 'WAITING_APPROVAL') {
          throw new OperationalExecutionError(
            'invalid_action',
            'Execution is not waiting for approval'
          )
        }
        if (current.approvalId !== approvalId) {
          throw new OperationalExecutionError(
            'conflict',
            'Approval is not bound to this execution'
          )
        }
        const rejected = input.decision === 'REJECTED'
        const failure: ExecutionFailure | null = rejected
          ? {
              kind: 'POLICY_DENIED',
              code: 'approval_rejected',
              message: input.reason?.trim() || 'Approval was rejected.'
            }
          : null
        const nextState: ExecutionState = rejected
          ? 'FAILED_TERMINAL'
          : 'QUEUED'
        validateExecutionTransitionPayload({
          to: nextState,
          result: current.result,
          failure
        })
        const resumeBinding = rejected
          ? null
          : { kind: 'approval', approvalId, boundAt: asIso(now) as string }
        const updated = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET state = $3, lease_owner = NULL, lease_until = NULL,
                  failure = $4::jsonb, updated_at = $5, completed_at = $6,
                  resume = $8::jsonb
            WHERE tenant_id = $1 AND id = $2
              AND state = 'WAITING_APPROVAL' AND approval_id = $7
            RETURNING ${executionColumns}`,
          [
            tenant,
            id,
            nextState,
            failure === null ? null : jsonText(failure, 'Approval failure'),
            now,
            rejected ? now : null,
            approvalId,
            resumeBinding === null
              ? null
              : jsonText(resumeBinding, 'Approval resume binding')
          ]
        )
        if (!updated.rows[0]) {
          throw new OperationalExecutionError(
            'conflict',
            'Approval resolution lost its execution binding'
          )
        }
        const record = mapRecord(updated.rows[0])
        const queueState = this.queueUpdateForTransition(
          nextState,
          failure,
          now,
          current
        )
        const queueUpdated = await client.query(
          `UPDATE operational_execution_outbox
              SET status = $3, available_at = $4, lease_owner = $5,
                  lease_until = $6, last_error = $7, processed_at = $8
            WHERE tenant_id = $1 AND execution_id = $2`,
          [
            tenant,
            id,
            queueState.status,
            queueState.availableAt,
            queueState.leaseOwner,
            queueState.leaseUntil,
            queueState.lastError,
            queueState.processedAt
          ]
        )
        if (queueUpdated.rowCount !== 1) {
          throw new OperationalExecutionError(
            'conflict',
            'Approval resolution queue pairing was lost'
          )
        }
        await this.appendEvent(
          client,
          record,
          eventType(nextState),
          null,
          `${rejected ? 'approval_rejected' : 'approval_resumed'}:${actorId}`,
          undefined,
          now
        )
        return record
      })
    )
  }

  public provideUserInput(
    input: {
      readonly tenantId: string
      readonly executionId: string
      readonly actorId: string
      readonly message: string
    },
    rawNow?: Date
  ): Promise<ExecutionRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const id = text(input.executionId, 'executionId', 200)
    const actorId = text(input.actorId, 'actorId', 120)
    const message = text(input.message, 'message', 32_000)
    const now = rawNow ?? this.clock()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const selected = await client.query<ExecutionRow>(
          `SELECT ${executionColumns}
             FROM operational_executions
            WHERE tenant_id = $1 AND id = $2
            FOR UPDATE`,
          [tenant, id]
        )
        const current = selected.rows[0]
        if (!current) {
          throw new OperationalExecutionError(
            'not_found',
            'Execution not found'
          )
        }
        const record = mapRecord(current)
        const resumeBinding = {
          kind: 'user_input' as const,
          input: message,
          boundAt: asIso(now) as string
        }
        if (record.state !== 'WAITING_USER') {
          if (
            record.state === 'QUEUED' &&
            record.resume?.kind === 'user_input' &&
            record.resume.input === message
          ) {
            return record
          }
          throw new OperationalExecutionError(
            'invalid_action',
            'Execution is not waiting for user input'
          )
        }
        const updated = await client.query<ExecutionRow>(
          `UPDATE operational_executions
              SET state = 'QUEUED', lease_owner = NULL, lease_until = NULL,
                  resume = $3::jsonb, updated_at = $4
            WHERE tenant_id = $1 AND id = $2 AND state = 'WAITING_USER'
            RETURNING ${executionColumns}`,
          [
            tenant,
            id,
            jsonText(resumeBinding, 'User input resume binding'),
            now
          ]
        )
        if (!updated.rows[0]) {
          throw new OperationalExecutionError(
            'conflict',
            'User input resume lost its execution binding'
          )
        }
        const queued = mapRecord(updated.rows[0])
        const queueState = this.queueUpdateForTransition(
          'QUEUED',
          null,
          now,
          record
        )
        const queueUpdated = await client.query(
          `UPDATE operational_execution_outbox
              SET status = $3, available_at = $4, lease_owner = $5,
                  lease_until = $6, last_error = $7, processed_at = $8
            WHERE tenant_id = $1 AND execution_id = $2`,
          [
            tenant,
            id,
            queueState.status,
            queueState.availableAt,
            queueState.leaseOwner,
            queueState.leaseUntil,
            queueState.lastError,
            queueState.processedAt
          ]
        )
        if (queueUpdated.rowCount !== 1) {
          throw new OperationalExecutionError(
            'conflict',
            'User input resume queue pairing was lost'
          )
        }
        await this.appendEvent(
          client,
          queued,
          'USER_INPUT',
          null,
          `user_input_provided:${actorId}`,
          undefined,
          now
        )
        return queued
      })
    )
  }

  public recoverExpired(
    tenantId: string,
    rawNow?: Date
  ): Promise<readonly ExecutionRecord[]> {
    const tenant = TenantIdSchema.parse(tenantId)
    const now = rawNow ?? this.clock()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const selected = await client.query<ExecutionRow>(
          `SELECT ${executionColumns}
             FROM operational_executions
            WHERE tenant_id = $1
              AND state IN ('CLAIMED', 'RUNNING')
              AND lease_until <= $2
            FOR UPDATE SKIP LOCKED`,
          [tenant, now]
        )
        const recovered: ExecutionRecord[] = []
        for (const row of selected.rows) {
          const updated = await client.query<ExecutionRow>(
            `UPDATE operational_executions
                SET state = 'QUEUED', lease_owner = NULL, lease_until = NULL,
                    updated_at = $3
              WHERE tenant_id = $1 AND id = $2
              RETURNING ${executionColumns}`,
            [tenant, row.id, now]
          )
          if (!updated.rows[0]) continue
          const record = mapRecord(updated.rows[0])
          const queueUpdated = await client.query(
            `UPDATE operational_execution_outbox
                SET status = 'pending', available_at = $3,
                    lease_owner = NULL, lease_until = NULL,
                    last_error = 'stale_lease_recovered', processed_at = NULL
              WHERE tenant_id = $1 AND execution_id = $2`,
            [tenant, record.id, now]
          )
          if (queueUpdated.rowCount !== 1) {
            throw new OperationalExecutionError(
              'conflict',
              'Execution recovery queue pairing was lost'
            )
          }
          await this.appendEvent(
            client,
            record,
            'RECOVERED',
            null,
            'stale_lease_recovered',
            undefined,
            now
          )
          recovered.push(record)
        }
        return recovered
      })
    )
  }

  public listEvents(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionEvent[]> {
    const tenant = TenantIdSchema.parse(tenantId)
    const id = text(executionId, 'executionId', 200)
    return this.run(tenant, async (client) => {
      const result = await client.query<EventRow>(
        `SELECT sequence, execution_id, tenant_id, event_type, worker_id,
                attempt, reason, approval_id, audit_events, created_at
           FROM operational_execution_events
          WHERE tenant_id = $1 AND execution_id = $2
          ORDER BY sequence ASC`,
        [tenant, id]
      )
      return result.rows.map(mapEvent)
    })
  }

  private async run<T>(
    tenant: TenantId,
    operation: (client: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    if (isPool(this.connection)) {
      return withTenantContext(
        this.connection,
        tenant,
        (client: PostgresPoolClient) => operation(client)
      )
    }
    return operation(this.connection)
  }

  private async lockedRecord(
    client: PostgresQueryable,
    tenant: TenantId,
    id: string
  ): Promise<ExecutionRecord> {
    const result = await client.query<ExecutionRow>(
      `SELECT ${executionColumns}
         FROM operational_executions
        WHERE tenant_id = $1 AND id = $2
        FOR UPDATE`,
      [tenant, id]
    )
    if (!result.rows[0]) {
      throw new OperationalExecutionError('not_found', 'Execution not found')
    }
    return mapRecord(result.rows[0])
  }

  private assertLease(
    record: ExecutionRecord,
    workerId: string,
    now: Date,
    fenceToken: number | undefined
  ): void {
    const worker = text(workerId, 'workerId', 120)
    if (
      record.leaseOwner !== worker ||
      fenceToken !== record.attempt ||
      !record.leaseUntil ||
      Date.parse(record.leaseUntil) <= now.getTime()
    ) {
      throw new OperationalExecutionError(
        'lease_lost',
        'Execution lease is not owned by this worker'
      )
    }
  }

  private queueUpdateForTransition(
    to: ExecutionState,
    failure: ExecutionFailure | null,
    now: Date,
    current: ExecutionRecord
  ): {
    status: QueueRow['status']
    availableAt: Date
    leaseOwner: string | null
    leaseUntil: Date | null
    lastError: string | null
    processedAt: Date | null
  } {
    if (to === 'FAILED_RETRYABLE') {
      return {
        status: 'failed',
        availableAt: failure?.retryAt
          ? new Date(failure.retryAt)
          : new Date(now.getTime() + this.retryDelayMs),
        leaseOwner: null,
        leaseUntil: null,
        lastError: failure?.message ?? 'retryable execution failure',
        processedAt: null
      }
    }
    if (to === 'FAILED_TERMINAL') {
      return {
        status: 'dead_letter',
        availableAt: now,
        leaseOwner: null,
        leaseUntil: null,
        lastError: failure?.message ?? 'terminal execution failure',
        processedAt: now
      }
    }
    if (
      to === 'SUCCEEDED' ||
      to === 'WAITING_APPROVAL' ||
      to === 'WAITING_USER' ||
      to === 'CANCELLED'
    ) {
      return {
        status: 'processed',
        availableAt: now,
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        processedAt: now
      }
    }
    if (to === 'QUEUED') {
      return {
        status: 'pending',
        availableAt: failure?.retryAt ? new Date(failure.retryAt) : now,
        leaseOwner: null,
        leaseUntil: null,
        lastError: null,
        processedAt: null
      }
    }
    return {
      status: 'processing',
      availableAt: now,
      leaseOwner: current.leaseOwner,
      leaseUntil: current.leaseUntil ? new Date(current.leaseUntil) : null,
      lastError: null,
      processedAt: null
    }
  }

  private appendEvent(
    client: PostgresQueryable,
    record: ExecutionRecord,
    type: ExecutionEvent['type'],
    workerId: string | null,
    reason: string | null,
    auditEvents: readonly AuditEvent[] | undefined,
    now: Date
  ): Promise<void> {
    return client
      .query(
        `INSERT INTO operational_execution_events
           (tenant_id, execution_id, event_type, worker_id, attempt, reason,
            approval_id, audit_events, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
        [
          record.tenantId,
          record.id,
          type,
          workerId,
          record.attempt,
          reason,
          record.approvalId,
          auditEvents?.length ? jsonText(auditEvents, 'Audit events') : null,
          now
        ]
      )
      .then(() => undefined)
  }
}

/** PostgreSQL incarnation of the neutral effect journal. */
export class PostgresOperationalEffectJournal implements EffectJournal {
  public constructor(
    private readonly connection: OperationalExecutionPostgresConnection
  ) {}

  public reserve(input: {
    tenantId: string
    operationKey: string
    proposalHash: string
    attemptId: string
  }): Promise<EffectJournalRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const operationKey = text(input.operationKey, 'operationKey', 240)
    const proposalHash = text(input.proposalHash, 'proposalHash', 160)
    const attemptId = text(input.attemptId, 'attemptId', 240)
    const timestamp = new Date()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        await client.query(
          `INSERT INTO operational_effect_journal
             (tenant_id, operation_key, proposal_hash, state, attempt_id,
              result, error, created_at, updated_at)
           VALUES ($1, $2, $3, 'RESERVED', $4, NULL, NULL, $5, $5)
           ON CONFLICT (tenant_id, operation_key) DO NOTHING`,
          [tenant, operationKey, proposalHash, attemptId, timestamp]
        )
        const selected = await client.query<EffectRow>(
          `SELECT ${effectColumns}
             FROM operational_effect_journal
            WHERE tenant_id = $1 AND operation_key = $2
            FOR UPDATE`,
          [tenant, operationKey]
        )
        const row = selected.rows[0]
        if (!row)
          throw new OperationalExecutionError(
            'conflict',
            'Effect reservation could not be read'
          )
        if (row.proposal_hash !== proposalHash) {
          throw new OperationalExecutionError(
            'conflict',
            'Operation key is bound to a different proposal'
          )
        }
        if (row.state === 'FAILED') {
          const retried = await client.query<EffectRow>(
            `UPDATE operational_effect_journal
                SET state = 'RESERVED', attempt_id = $3,
                    result = NULL, error = NULL, updated_at = $4
              WHERE tenant_id = $1 AND operation_key = $2
              RETURNING ${effectColumns}`,
            [tenant, operationKey, attemptId, timestamp]
          )
          if (retried.rows[0]) return mapEffect(retried.rows[0])
        }
        return mapEffect(row)
      })
    )
  }

  public markStarted(input: {
    tenantId: string
    operationKey: string
    attemptId: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'EFFECT_STARTED')
  }

  public confirm(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    result: unknown
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'CONFIRMED', { result: input.result })
  }

  public fail(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    error: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'FAILED', {
      error: text(input.error, 'error')
    })
  }

  public markUncertain(input: {
    tenantId: string
    operationKey: string
    attemptId: string
    reason: string
  }): Promise<EffectJournalRecord> {
    return this.transition(input, 'UNCERTAIN', {
      error: text(input.reason, 'reason')
    })
  }

  public get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectJournalRecord | null> {
    const tenant = TenantIdSchema.parse(tenantId)
    const operation = text(operationKey, 'operationKey', 240)
    return this.run(tenant, async (client) => {
      const result = await client.query<EffectRow>(
        `SELECT ${effectColumns}
           FROM operational_effect_journal
          WHERE tenant_id = $1 AND operation_key = $2`,
        [tenant, operation]
      )
      return result.rows[0] ? mapEffect(result.rows[0]) : null
    })
  }

  private transition(
    input: {
      tenantId: string
      operationKey: string
      attemptId: string
    },
    state: EffectJournalState,
    values: { result?: unknown; error?: string } = {}
  ): Promise<EffectJournalRecord> {
    const tenant = TenantIdSchema.parse(input.tenantId)
    const operation = text(input.operationKey, 'operationKey', 240)
    const attemptId = text(input.attemptId, 'attemptId', 240)
    const timestamp = new Date()
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const selected = await client.query<EffectRow>(
          `SELECT ${effectColumns}
             FROM operational_effect_journal
            WHERE tenant_id = $1 AND operation_key = $2
            FOR UPDATE`,
          [tenant, operation]
        )
        const row = selected.rows[0]
        if (!row)
          throw new OperationalExecutionError(
            'not_found',
            'Effect reservation is missing'
          )
        if (row.attempt_id !== attemptId) {
          throw new OperationalExecutionError(
            'lease_lost',
            'Effect attempt is fenced'
          )
        }
        if (state === 'EFFECT_STARTED' && row.state !== 'RESERVED') {
          if (row.state === state) return mapEffect(row)
          throw new OperationalExecutionError(
            'invalid_action',
            'Effect cannot start from its current state'
          )
        }
        if (state !== 'EFFECT_STARTED' && row.state !== 'EFFECT_STARTED') {
          if (row.state === state) return mapEffect(row)
          throw new OperationalExecutionError(
            'invalid_action',
            'Effect outcome is not valid for its current state'
          )
        }
        const updated = await client.query<EffectRow>(
          `UPDATE operational_effect_journal
              SET state = $3, result = $4::jsonb, error = $5,
                  updated_at = $6
            WHERE tenant_id = $1 AND operation_key = $2
            RETURNING ${effectColumns}`,
          [
            tenant,
            operation,
            state,
            values.result === undefined
              ? null
              : jsonText(values.result, 'effect result'),
            values.error ?? null,
            timestamp
          ]
        )
        if (!updated.rows[0])
          throw new OperationalExecutionError(
            'conflict',
            'Effect transition lost'
          )
        return mapEffect(updated.rows[0])
      })
    )
  }

  private async run<T>(
    tenant: TenantId,
    operation: (client: PostgresQueryable) => Promise<T>
  ): Promise<T> {
    if (isPool(this.connection)) {
      return withTenantContext(
        this.connection,
        tenant,
        (client: PostgresPoolClient) => operation(client)
      )
    }
    return operation(this.connection)
  }
}

function mapEffect(row: EffectRow): EffectJournalRecord {
  return {
    tenantId: row.tenant_id,
    operationKey: row.operation_key,
    proposalHash: row.proposal_hash,
    state: row.state,
    attemptId: row.attempt_id,
    createdAt: asIso(row.created_at) as string,
    updatedAt: asIso(row.updated_at) as string,
    ...(row.result !== null ? { result: jsonValue(row.result) } : {}),
    ...(row.error !== null ? { error: row.error } : {})
  }
}

function validateFailure(failure: ExecutionFailure): ExecutionFailure {
  if (
    failure.kind !== 'TECHNICAL_RETRYABLE' &&
    failure.kind !== 'SEMANTIC_TERMINAL' &&
    failure.kind !== 'POLICY_DENIED' &&
    failure.kind !== 'UNKNOWN_EFFECT' &&
    failure.kind !== 'CANCELLED'
  ) {
    throw new OperationalExecutionError(
      'validation_failed',
      'failure.kind is invalid'
    )
  }
  const normalized: ExecutionFailure = {
    kind: failure.kind,
    code: text(failure.code, 'failure.code', 80),
    message: text(failure.message, 'failure.message', 500),
    ...(failure.retryAt
      ? { retryAt: text(failure.retryAt, 'failure.retryAt', 80) }
      : {})
  }
  if (normalized.retryAt && Number.isNaN(Date.parse(normalized.retryAt))) {
    throw new OperationalExecutionError(
      'validation_failed',
      'failure.retryAt is invalid'
    )
  }
  return normalized
}

function eventType(state: ExecutionState): ExecutionEvent['type'] {
  if (state === 'RECEIVED') return 'RECEIVED'
  if (state === 'QUEUED') return 'QUEUED'
  if (state === 'CLAIMED') return 'CLAIMED'
  if (state === 'RUNNING') return 'RUNNING'
  if (state === 'WAITING_APPROVAL') return 'WAITING_APPROVAL'
  if (state === 'WAITING_USER') return 'WAITING_USER'
  if (state === 'SUCCEEDED') return 'SUCCEEDED'
  if (state === 'FAILED_RETRYABLE') return 'FAILED_RETRYABLE'
  if (state === 'FAILED_TERMINAL') return 'FAILED_TERMINAL'
  if (state === 'CANCELLED') return 'CANCELLED'
  return 'RECOVERED'
}

function cryptoRandomUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
