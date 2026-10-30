import type { QueryResultRow } from 'pg'
import {
  ApprovalEngine,
  ApprovalError,
  ApprovalDecisionActorTypeSchema,
  ApprovalStatusSchema,
  InMemoryApprovalStore,
  type ApprovalAuthority,
  type ApprovalConsumption,
  type ApprovalDecisionInput,
  type ApprovalEngineOptions,
  type ApprovalEvent,
  type ApprovalRecord,
  type ApprovalRequestInput,
  type ApprovalReserveInput,
  type ApprovalReservation,
  type ApprovalStatus,
  type EffectEvidence
} from '@cvg/approval-engine'
import { DomainError } from '@cvg/shared'
import {
  withTenantContext,
  withTenantTransaction,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

export interface PostgresApprovalAuthorityOptions {
  /**
   * Engine configuration shared by every scratch decision engine. `store` is
   * owned by the adapter because each operation seeds a fresh scratch store.
   */
  engine?: Omit<ApprovalEngineOptions, 'store'>
  /**
   * Repository-owned clock for row timestamps. Defaults to the engine clock so
   * the decision state machine and the persisted revision timestamps agree.
   */
  clock?: () => Date
}

export type DecisionPhaseResult =
  | {
      readonly outcome: 'OK'
      readonly record: ApprovalRecord
      readonly events: readonly ApprovalEvent[]
    }
  | {
      readonly outcome: 'COMMIT_EXPIRED'
      readonly error: ApprovalError
      readonly events: readonly ApprovalEvent[]
    }

export interface RuntimeApprovalRow extends QueryResultRow {
  tenant_id: string
  approval_id: string
  operator_id: string
  agent_id: string
  agent_version: string
  action: string
  resource_type: string
  resource_id: string | null
  payload_hash: string
  policy_version: string
  prompt_version: string | null
  correlation_id: string
  status: string
  single_use: boolean
  requested_at: Date | string
  expires_at: Date | string
  approved_at: Date | string | null
  executed_at: Date | string | null
  rejected_at: Date | string | null
  cancelled_at: Date | string | null
  expired_at: Date | string | null
  approver_id: string | null
  decision_actor_type: string | null
  decision_correlation_id: string | null
  decision_command_key: string | null
  decision_reason: string | null
  execution_count: number
  execution_ref: string | null
  reservation_id: string | null
  reservation_owner: string | null
  reservation_expires_at: Date | string | null
  reservation_generation: number | string
  used_reservation_ids: unknown
  reserved_at: Date | string | null
  executing_at: Date | string | null
  released_at: Date | string | null
  failed_at: Date | string | null
  uncertain_at: Date | string | null
  confirmed_at: Date | string | null
  confirmation_evidence_ref: string | null
  proposal_id: string | null
  proposal_hash: string | null
  capability: string | null
  data_classification: string | null
  proposal_payload: unknown
  operation_key: string | null
  origin_conversation_id: string | null
  origin_session_id: string | null
  revision: number | string
  created_at: Date | string
  updated_at: Date | string
}

export interface LoadedApproval {
  record: ApprovalRecord
  revision: number
}

const runtimeApprovalColumns = `
  tenant_id, approval_id, operator_id, agent_id, agent_version, action,
  resource_type, resource_id, payload_hash, policy_version, prompt_version,
  correlation_id, status, single_use, requested_at, expires_at, approved_at,
   executed_at, rejected_at, cancelled_at, expired_at, approver_id,
   decision_actor_type, decision_correlation_id, decision_command_key,
   decision_reason, execution_count, execution_ref, reservation_id,
  reservation_owner, reservation_expires_at, reservation_generation,
  used_reservation_ids, reserved_at, executing_at, released_at, failed_at,
  uncertain_at, confirmed_at, confirmation_evidence_ref, proposal_id,
  proposal_hash, capability, data_classification, proposal_payload,
  operation_key, origin_conversation_id, origin_session_id, revision,
  created_at, updated_at`

/**
 * Single source of truth for the mutation column order. `recordValues` must
 * emit the values in exactly this order; both INSERT and the compare-and-set
 * UPDATE are generated from it so a column can never drift from its binding.
 */
const persistedColumns = [
  'tenant_id',
  'approval_id',
  'operator_id',
  'agent_id',
  'agent_version',
  'action',
  'resource_type',
  'resource_id',
  'payload_hash',
  'policy_version',
  'prompt_version',
  'correlation_id',
  'status',
  'single_use',
  'requested_at',
  'expires_at',
  'approved_at',
  'executed_at',
  'rejected_at',
  'cancelled_at',
  'expired_at',
  'approver_id',
  'decision_actor_type',
  'decision_correlation_id',
  'decision_command_key',
  'decision_reason',
  'execution_count',
  'execution_ref',
  'reservation_id',
  'reservation_owner',
  'reservation_expires_at',
  'reservation_generation',
  'used_reservation_ids',
  'reserved_at',
  'executing_at',
  'released_at',
  'failed_at',
  'uncertain_at',
  'confirmed_at',
  'confirmation_evidence_ref',
  'proposal_id',
  'proposal_hash',
  'capability',
  'data_classification',
  'proposal_payload',
  'operation_key',
  'origin_conversation_id',
  'origin_session_id'
] as const

const insertColumns = [
  ...persistedColumns,
  'revision',
  'created_at',
  'updated_at'
].join(', ')

const insertPlaceholders = persistedColumns
  .map((_, index) => `$${index + 1}`)
  .join(', ')

const casSetClause = persistedColumns
  .slice(2)
  .map((column, index) => `${column} = $${index + 3}`)
  .join(', ')

const mutableValueCount = persistedColumns.length - 2
const casUpdatedAtParam = mutableValueCount + 3
const casRevisionParam = mutableValueCount + 4
const casStatusParam = mutableValueCount + 5
const casReservationIdParam = mutableValueCount + 6
const casGenerationParam = mutableValueCount + 7

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function readUsedReservationIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new DomainError(
      'conflict',
      'runtime_approvals.used_reservation_ids is not a JSON array'
    )
  }
  return value.map((entry) => {
    if (typeof entry !== 'string') {
      throw new DomainError(
        'conflict',
        'runtime_approvals.used_reservation_ids has a non-string entry'
      )
    }
    return entry
  })
}

/**
 * Maps a `runtime_approvals` row back to the exact canonical `ApprovalRecord`
 * shape the in-memory store would hold. Optional fields absent from the row
 * stay absent (never `undefined` keys) so equality with the scratch engine
 * record is stable.
 */
export function mapRuntimeApprovalRow(row: RuntimeApprovalRow): ApprovalRecord {
  const usedReservationIds = readUsedReservationIds(row.used_reservation_ids)
  const generation = Number(row.reservation_generation)
  return {
    approvalId: row.approval_id,
    tenantId: row.tenant_id,
    operatorId: row.operator_id,
    agentId: row.agent_id,
    agentVersion: row.agent_version,
    action: row.action,
    resource: {
      type: row.resource_type,
      ...(row.resource_id !== null ? { id: row.resource_id } : {})
    },
    payloadHash: row.payload_hash,
    policyVersion: row.policy_version,
    ...(row.prompt_version !== null
      ? { promptVersion: row.prompt_version }
      : {}),
    correlationId: row.correlation_id,
    status: ApprovalStatusSchema.parse(row.status),
    singleUse: row.single_use,
    requestedAt: toIsoString(row.requested_at),
    expiresAt: toIsoString(row.expires_at),
    ...(row.approved_at !== null
      ? { approvedAt: toIsoString(row.approved_at) }
      : {}),
    ...(row.executed_at !== null
      ? { executedAt: toIsoString(row.executed_at) }
      : {}),
    ...(row.rejected_at !== null
      ? { rejectedAt: toIsoString(row.rejected_at) }
      : {}),
    ...(row.cancelled_at !== null
      ? { cancelledAt: toIsoString(row.cancelled_at) }
      : {}),
    ...(row.expired_at !== null
      ? { expiredAt: toIsoString(row.expired_at) }
      : {}),
    ...(row.approver_id !== null ? { approverId: row.approver_id } : {}),
    ...(row.decision_actor_type !== null
      ? {
          decisionActorType: ApprovalDecisionActorTypeSchema.parse(
            row.decision_actor_type
          )
        }
      : {}),
    ...(row.decision_correlation_id !== null
      ? { decisionCorrelationId: row.decision_correlation_id }
      : {}),
    ...(row.decision_command_key !== null
      ? { decisionCommandKey: row.decision_command_key }
      : {}),
    ...(row.decision_reason !== null
      ? { decisionReason: row.decision_reason }
      : {}),
    executionCount: row.execution_count,
    ...(row.execution_ref !== null ? { executionRef: row.execution_ref } : {}),
    ...(row.reservation_id !== null
      ? { reservationId: row.reservation_id }
      : {}),
    ...(row.reservation_owner !== null
      ? { reservationOwner: row.reservation_owner }
      : {}),
    ...(row.reservation_expires_at !== null
      ? { reservationExpiresAt: toIsoString(row.reservation_expires_at) }
      : {}),
    ...(generation > 0 ? { reservationGeneration: generation } : {}),
    ...(usedReservationIds.length > 0 ? { usedReservationIds } : {}),
    ...(row.reserved_at !== null
      ? { reservedAt: toIsoString(row.reserved_at) }
      : {}),
    ...(row.executing_at !== null
      ? { executingAt: toIsoString(row.executing_at) }
      : {}),
    ...(row.released_at !== null
      ? { releasedAt: toIsoString(row.released_at) }
      : {}),
    ...(row.failed_at !== null ? { failedAt: toIsoString(row.failed_at) } : {}),
    ...(row.uncertain_at !== null
      ? { uncertainAt: toIsoString(row.uncertain_at) }
      : {}),
    ...(row.confirmed_at !== null
      ? { confirmedAt: toIsoString(row.confirmed_at) }
      : {}),
    ...(row.confirmation_evidence_ref !== null
      ? { confirmationEvidenceRef: row.confirmation_evidence_ref }
      : {}),
    ...(row.proposal_id !== null ? { proposalId: row.proposal_id } : {}),
    ...(row.proposal_hash !== null ? { proposalHash: row.proposal_hash } : {}),
    ...(row.capability !== null ? { capability: row.capability } : {}),
    ...(row.data_classification !== null
      ? { dataClassification: row.data_classification }
      : {}),
    ...(row.proposal_payload !== null
      ? { proposalPayload: row.proposal_payload }
      : {}),
    ...(row.operation_key !== null ? { operationKey: row.operation_key } : {}),
    ...(row.origin_conversation_id !== null
      ? {
          origin: {
            conversationId: row.origin_conversation_id,
            ...(row.origin_session_id !== null
              ? { sessionId: row.origin_session_id }
              : {})
          }
        }
      : {})
  }
}

function recordValues(record: ApprovalRecord): unknown[] {
  return [
    record.tenantId,
    record.approvalId,
    record.operatorId,
    record.agentId,
    record.agentVersion,
    record.action,
    record.resource.type,
    record.resource.id ?? null,
    record.payloadHash,
    record.policyVersion,
    record.promptVersion ?? null,
    record.correlationId,
    record.status,
    record.singleUse,
    record.requestedAt,
    record.expiresAt,
    record.approvedAt ?? null,
    record.executedAt ?? null,
    record.rejectedAt ?? null,
    record.cancelledAt ?? null,
    record.expiredAt ?? null,
    record.approverId ?? null,
    record.decisionActorType ?? null,
    record.decisionCorrelationId ?? null,
    record.decisionCommandKey ?? null,
    record.decisionReason ?? null,
    record.executionCount,
    record.executionRef ?? null,
    record.reservationId ?? null,
    record.reservationOwner ?? null,
    record.reservationExpiresAt ?? null,
    record.reservationGeneration ?? 0,
    JSON.stringify(record.usedReservationIds ?? []),
    record.reservedAt ?? null,
    record.executingAt ?? null,
    record.releasedAt ?? null,
    record.failedAt ?? null,
    record.uncertainAt ?? null,
    record.confirmedAt ?? null,
    record.confirmationEvidenceRef ?? null,
    record.proposalId ?? null,
    record.proposalHash ?? null,
    record.capability ?? null,
    record.dataClassification ?? null,
    record.proposalPayload === undefined
      ? null
      : JSON.stringify(record.proposalPayload),
    record.operationKey ?? null,
    record.origin?.conversationId ?? null,
    record.origin?.sessionId ?? null
  ]
}

function cloneRecord(record: ApprovalRecord): ApprovalRecord {
  return structuredClone(record)
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
          )
        )
      : nested
  )
}

/** SPEC 0262 §4.3: only `status` and `expiredAt` may differ. */
function onlyExpiryChanged(
  before: ApprovalRecord,
  after: ApprovalRecord
): boolean {
  const strip = (record: ApprovalRecord): unknown => {
    const copy: Record<string, unknown> = { ...record }
    delete copy.status
    delete copy.expiredAt
    return copy
  }
  return stableJson(strip(before)) === stableJson(strip(after))
}

function recordsEquivalent(
  left: ApprovalRecord,
  right: ApprovalRecord
): boolean {
  // Both records derive from the same mapper column order, so key order is a
  // stable comparison basis; a semantic difference always changes the JSON.
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * PostgreSQL incarnation of `ApprovalAuthority` (PROD-04, architecture A2).
 *
 * The canonical decision state machine is not duplicated: every operation
 * loads the affected record(s) `FOR UPDATE` inside one `withTenantTransaction`,
 * seeds a scratch `InMemoryApprovalStore`, runs the same synchronous
 * `ApprovalEngine` method and persists the resulting record(s) with a
 * compare-and-set on revision, status, reservation id and reservation
 * generation. SQL serializes writers; the engine remains the only authority
 * that decides transitions.
 */
export class PostgresApprovalAuthority implements ApprovalAuthority {
  readonly #pool: PostgresPoolLike
  readonly #clock: () => Date
  readonly #engineOptions: Omit<ApprovalEngineOptions, 'store'>

  constructor(
    pool: PostgresPoolLike,
    options: PostgresApprovalAuthorityOptions = {}
  ) {
    this.#pool = pool
    const engineOptions = options.engine ?? {}
    this.#clock = options.clock ?? engineOptions.clock ?? (() => new Date())
    this.#engineOptions = { ...engineOptions, clock: this.#clock }
  }

  async request(input: ApprovalRequestInput): Promise<ApprovalRecord> {
    return withTenantTransaction(this.#pool, input.tenantId, async (client) => {
      const engine = this.#createEngine(new InMemoryApprovalStore())
      const record = engine.request(input)
      await this.#insert(client, record)
      return record
    })
  }

  submit(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): Promise<ApprovalRecord> {
    return this.#mutateRecord(tenantId, approvalId, (engine) =>
      engine.submit(tenantId, approvalId, actorId)
    )
  }

  approve(
    tenantId: string,
    approvalId: string,
    input: ApprovalDecisionInput
  ): Promise<ApprovalRecord> {
    return this.#mutateRecord(tenantId, approvalId, (engine) =>
      engine.approve(tenantId, approvalId, input)
    )
  }

  reject(
    tenantId: string,
    approvalId: string,
    input: ApprovalDecisionInput
  ): Promise<ApprovalRecord> {
    return this.#mutateRecord(tenantId, approvalId, (engine) =>
      engine.reject(tenantId, approvalId, input)
    )
  }

  cancel(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): Promise<ApprovalRecord> {
    return this.#mutateRecord(tenantId, approvalId, (engine) =>
      engine.cancel(tenantId, approvalId, actorId)
    )
  }

  verifyAndConsume(input: {
    tenantId: string
    approvalId: string
    action: string
    resource: { type: string; id?: string }
    payload: unknown
    executionRef?: string
  }): Promise<ApprovalConsumption> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.verifyAndConsume(input)
    )
  }

  reserve(input: ApprovalReserveInput): Promise<ApprovalReservation> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.reserve(input)
    )
  }

  markExecuting(input: {
    tenantId: string
    approvalId: string
    reservationId: string
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.markExecuting(input)
    )
  }

  confirm(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.confirm(input)
    )
  }

  release(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.release(input)
    )
  }

  fail(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.fail(input)
    )
  }

  markUncertain(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    reason: string
    evidence?: EffectEvidence
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.markUncertain(input)
    )
  }

  reconcile(input: {
    tenantId: string
    approvalId: string
    actorId: string
    evidence: EffectEvidence
  }): Promise<ApprovalRecord> {
    return this.#mutateRecord(input.tenantId, input.approvalId, (engine) =>
      engine.reconcile(input)
    )
  }

  async releaseExpired(input: {
    tenantId: string
    now?: Date
    ttlMs?: number
    evidenceFor: (record: ApprovalRecord) => EffectEvidence | undefined
  }): Promise<{ released: number; uncertain: number }> {
    return withTenantTransaction(this.#pool, input.tenantId, async (client) => {
      const now = input.now ?? this.#clock()
      const result = await client.query<RuntimeApprovalRow>(
        `SELECT ${runtimeApprovalColumns}
         FROM runtime_approvals
         WHERE tenant_id = $1
           AND status IN ('RESERVED', 'EXECUTING')
           AND reservation_expires_at IS NOT NULL
           AND reservation_expires_at <= $2
         ORDER BY approval_id
         FOR UPDATE`,
        [input.tenantId, now]
      )
      const loaded = new Map<string, LoadedApproval>()
      const store = new InMemoryApprovalStore()
      for (const row of result.rows) {
        const record = mapRuntimeApprovalRow(row)
        loaded.set(record.approvalId, {
          record,
          revision: Number(row.revision)
        })
        store.insert(cloneRecord(record))
      }
      const engine = this.#createEngine(store)
      const sweep = engine.releaseExpired({ ...input, now })
      await this.#persistChanged(client, loaded, store, input.tenantId)
      return sweep
    })
  }

  /**
   * The engine sweep is cross-tenant (`store.listExpiringBefore` has no tenant
   * filter) while every durable connection carries exactly one
   * `cvg.tenant_id`. The durable authority fails closed instead of pretending
   * the RLS scope can cover every tenant; production sweeps per tenant through
   * `releaseExpired`.
   */
  expireStale(): Promise<never> {
    return Promise.reject(
      new DomainError(
        'invalid_action',
        'expireStale is unsupported by PostgresApprovalAuthority: the engine sweep is cross-tenant while every durable connection is scoped by PostgreSQL RLS to one cvg.tenant_id. Sweep each tenant with releaseExpired.'
      )
    )
  }

  async list(
    tenantId: string,
    status?: ApprovalStatus
  ): Promise<ApprovalRecord[]> {
    return withTenantContext(this.#pool, tenantId, async (client) => {
      const result =
        status === undefined
          ? await client.query<RuntimeApprovalRow>(
              `SELECT ${runtimeApprovalColumns}
               FROM runtime_approvals
               WHERE tenant_id = $1
               ORDER BY requested_at, approval_id`,
              [tenantId]
            )
          : await client.query<RuntimeApprovalRow>(
              `SELECT ${runtimeApprovalColumns}
               FROM runtime_approvals
               WHERE tenant_id = $1 AND status = $2
               ORDER BY requested_at, approval_id`,
              [tenantId, status]
            )
      return result.rows.map(mapRuntimeApprovalRow)
    })
  }

  async get(tenantId: string, approvalId: string): Promise<ApprovalRecord> {
    const record = await withTenantContext(
      this.#pool,
      tenantId,
      async (client) => {
        const result = await client.query<RuntimeApprovalRow>(
          `SELECT ${runtimeApprovalColumns}
           FROM runtime_approvals
           WHERE tenant_id = $1 AND approval_id = $2`,
          [tenantId, approvalId]
        )
        const row = result.rows[0]
        return row ? mapRuntimeApprovalRow(row) : undefined
      }
    )
    if (record === undefined) {
      throw new ApprovalError('not_found', 'Approval not found for this tenant')
    }
    return record
  }

  /** Approvals still awaiting an operator decision (REQUESTED or PENDING). */
  async listPending(tenantId: string): Promise<ApprovalRecord[]> {
    return withTenantContext(this.#pool, tenantId, async (client) => {
      const result = await client.query<RuntimeApprovalRow>(
        `SELECT ${runtimeApprovalColumns}
         FROM runtime_approvals
         WHERE tenant_id = $1 AND status IN ('REQUESTED', 'PENDING')
         ORDER BY requested_at, approval_id`,
        [tenantId]
      )
      return result.rows.map(mapRuntimeApprovalRow)
    })
  }

  /**
   * Returns every candidate sharing the operation key. The key is not unique:
   * the effect journal (0013) is the authority that binds a key to a single
   * effect, so callers must reconcile candidates explicitly.
   */
  async getByOperationKey(
    tenantId: string,
    operationKey: string
  ): Promise<ApprovalRecord[]> {
    return withTenantContext(this.#pool, tenantId, async (client) => {
      const result = await client.query<RuntimeApprovalRow>(
        `SELECT ${runtimeApprovalColumns}
         FROM runtime_approvals
         WHERE tenant_id = $1 AND operation_key = $2
         ORDER BY requested_at, approval_id`,
        [tenantId, operationKey]
      )
      return result.rows.map(mapRuntimeApprovalRow)
    })
  }

  /**
   * SPEC 0262 §4.2: the approval row, locked `FOR UPDATE` in the caller's
   * transaction (after the execution row).
   */
  async lockInTransaction(
    client: PostgresPoolClient,
    tenantId: string,
    approvalId: string
  ): Promise<LoadedApproval | undefined> {
    return this.#selectForUpdate(client, tenantId, approvalId)
  }

  /**
   * SPEC 0262 §4.3 — the new decision phase, computed on a detached store
   * seeded with the locked row. No SQL runs while the engine computes.
   *
   * - OK: the final state is persisted with one compare-and-set.
   * - COMMIT_EXPIRED: ONLY when the engine raised `expired` for a
   *   REQUESTED/PENDING record, the final status is EXPIRED and nothing but
   *   `status`/`expiredAt` changed in the step that threw. The intermediate
   *   submit is discarded; only the expiry is persisted, and the original
   *   error is handed back so the owner rethrows it AFTER the commit.
   * - anything else rethrows, so the owning transaction rolls back.
   *
   * Engine events are collected, never emitted here; the owner publishes them
   * after the commit is acknowledged.
   */
  async applyDecisionPhaseInTransaction(
    client: PostgresPoolClient,
    loaded: LoadedApproval,
    plan: {
      readonly submitOperatorId?: string
      readonly verdict: 'APPROVED' | 'REJECTED'
      readonly input: ApprovalDecisionInput
    }
  ): Promise<DecisionPhaseResult> {
    const tenantId = loaded.record.tenantId
    const approvalId = loaded.record.approvalId
    const events: ApprovalEvent[] = []
    const store = new InMemoryApprovalStore()
    store.insert(cloneRecord(loaded.record))
    const engine = new ApprovalEngine({
      ...this.#engineOptions,
      store,
      onEvent: (event) => {
        events.push(event)
      }
    })
    const startedFrom = loaded.record.status
    let beforeStep = cloneRecord(loaded.record)
    try {
      if (plan.submitOperatorId !== undefined) {
        engine.submit(tenantId, approvalId, plan.submitOperatorId)
        beforeStep = cloneRecord(store.get(tenantId, approvalId)!)
      }
      const current = store.get(tenantId, approvalId)!
      if (current.status === 'PENDING') {
        if (plan.verdict === 'APPROVED') {
          engine.approve(tenantId, approvalId, plan.input)
        } else {
          engine.reject(tenantId, approvalId, plan.input)
        }
      }
    } catch (error) {
      const final = store.get(tenantId, approvalId)
      if (
        error instanceof ApprovalError &&
        error.code === 'expired' &&
        (startedFrom === 'REQUESTED' || startedFrom === 'PENDING') &&
        final !== undefined &&
        final.status === 'EXPIRED' &&
        onlyExpiryChanged(beforeStep, final)
      ) {
        const expired: ApprovalRecord = {
          ...cloneRecord(loaded.record),
          status: 'EXPIRED',
          ...(final.expiredAt !== undefined
            ? { expiredAt: final.expiredAt }
            : {})
        }
        if (!(await this.#compareAndSet(client, loaded, expired))) {
          throw new DomainError(
            'conflict',
            `Approval ${approvalId} compare-and-set failed`
          )
        }
        return {
          outcome: 'COMMIT_EXPIRED',
          error,
          events: events.filter((event) => event.type === 'approval.expired')
        }
      }
      throw error
    }
    const decided = store.get(tenantId, approvalId)!
    if (!recordsEquivalent(loaded.record, decided)) {
      if (!(await this.#compareAndSet(client, loaded, decided))) {
        throw new DomainError(
          'conflict',
          `Approval ${approvalId} compare-and-set failed`
        )
      }
    }
    return { outcome: 'OK', record: decided, events }
  }

  #createEngine(store: InMemoryApprovalStore): ApprovalEngine {
    return new ApprovalEngine({ ...this.#engineOptions, store })
  }

  async #mutateRecord<T>(
    tenantId: string,
    approvalId: string,
    run: (engine: ApprovalEngine, loaded: LoadedApproval) => T
  ): Promise<T> {
    const outcome = await withTenantTransaction(
      this.#pool,
      tenantId,
      async (client) => {
        const loaded = await this.#selectForUpdate(client, tenantId, approvalId)
        if (loaded === undefined) {
          throw new ApprovalError(
            'not_found',
            'Approval not found for this tenant'
          )
        }
        const store = new InMemoryApprovalStore()
        store.insert(cloneRecord(loaded.record))
        const engine = this.#createEngine(store)
        const loadedById = new Map([[approvalId, loaded]])
        try {
          const value = run(engine, loaded)
          await this.#persistChanged(client, loadedById, store, tenantId)
          return { ok: true as const, value }
        } catch (error) {
          // The engine expiry guard marks the record EXPIRED before throwing
          // `expired`. Committing that transition and then rethrowing keeps the
          // durable record equal to the in-memory state machine.
          await this.#persistChanged(client, loadedById, store, tenantId)
          return { ok: false as const, error }
        }
      }
    )
    if (!outcome.ok) throw outcome.error
    return outcome.value
  }

  async #selectForUpdate(
    client: PostgresPoolClient,
    tenantId: string,
    approvalId: string
  ): Promise<LoadedApproval | undefined> {
    const result = await client.query<RuntimeApprovalRow>(
      `SELECT ${runtimeApprovalColumns}
       FROM runtime_approvals
       WHERE tenant_id = $1 AND approval_id = $2
       FOR UPDATE`,
      [tenantId, approvalId]
    )
    const row = result.rows[0]
    return row
      ? { record: mapRuntimeApprovalRow(row), revision: Number(row.revision) }
      : undefined
  }

  async #persistChanged(
    client: PostgresPoolClient,
    loaded: Map<string, LoadedApproval>,
    store: InMemoryApprovalStore,
    tenantId: string
  ): Promise<number> {
    let persisted = 0
    for (const [approvalId, original] of loaded) {
      const current = store.get(tenantId, approvalId)
      if (current === undefined) continue
      if (recordsEquivalent(original.record, current)) continue
      const updated = await this.#compareAndSet(client, original, current)
      if (!updated) {
        throw new DomainError(
          'conflict',
          `Approval ${approvalId} compare-and-set failed`
        )
      }
      persisted += 1
    }
    return persisted
  }

  async #compareAndSet(
    client: PostgresPoolClient,
    loaded: LoadedApproval,
    next: ApprovalRecord
  ): Promise<boolean> {
    const values = recordValues(next)
    const mutable = values.slice(2)
    const updatedAt = this.#clock().toISOString()
    const result = await client.query(
      `UPDATE runtime_approvals
       SET ${casSetClause},
           revision = revision + 1,
           updated_at = $${casUpdatedAtParam}
       WHERE tenant_id = $1
         AND approval_id = $2
         AND revision = $${casRevisionParam}
         AND status = $${casStatusParam}
         AND COALESCE(reservation_id, '') = $${casReservationIdParam}
         AND reservation_generation = $${casGenerationParam}
       RETURNING revision`,
      [
        loaded.record.tenantId,
        loaded.record.approvalId,
        ...mutable,
        updatedAt,
        loaded.revision,
        loaded.record.status,
        loaded.record.reservationId ?? '',
        loaded.record.reservationGeneration ?? 0
      ]
    )
    return (result.rowCount ?? 0) === 1
  }

  async #insert(
    client: PostgresPoolClient,
    record: ApprovalRecord
  ): Promise<void> {
    const createdAt = this.#clock().toISOString()
    await client.query(
      `INSERT INTO runtime_approvals (${insertColumns})
       VALUES (${insertPlaceholders}, 1, $${persistedColumns.length + 1}, $${persistedColumns.length + 1})`,
      [...recordValues(record), createdAt]
    )
  }
}
