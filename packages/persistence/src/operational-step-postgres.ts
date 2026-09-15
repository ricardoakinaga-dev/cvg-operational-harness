import type {
  ExecutionCheckpoint,
  ExecutionStep,
  ExecutionStepStore
} from '@cvg/harness-contracts'
import {
  isStepTransitionAllowed,
  type StepStatus
} from '@cvg/harness-contracts'
import { CheckpointError, validateCheckpointIntegrity } from '@cvg/harness'
import type { TenantId } from '@cvg/platform'
import { TenantIdSchema } from '@cvg/platform'
import type { QueryResultRow } from 'pg'
import type { PostgresQueryable } from './postgres.ts'
import {
  withTenantContext,
  type PostgresPoolClient,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

export type OperationalStepPostgresConnection =
  | PostgresQueryable
  | PostgresPoolLike

export interface PostgresExecutionStepStoreOptions {
  readonly clock?: () => Date
}

interface StepRow extends QueryResultRow {
  tenant_id: string
  execution_id: string
  step_number: number
  step_id: string
  step_type: ExecutionStep['stepType']
  status: StepStatus
  attempt: number
  side_effecting: boolean
  decision_type: ExecutionStep['decisionType'] | null
  reason_code: string | null
  error_code: string | null
  observation_refs: unknown
  started_at: Date | string
  completed_at: Date | string | null
}

interface CheckpointRow extends QueryResultRow {
  tenant_id: string
  execution_id: string
  checkpoint_id: string
  checkpoint_version: number
  runtime_profile: string
  runtime_version: string
  orchestrator_version: string
  step_number: number
  state: unknown
  budget_usage: unknown
  digest: string
  created_at: Date | string
}

const stepColumns = `
  tenant_id, execution_id, step_number, step_id, step_type, status, attempt,
  side_effecting, decision_type, reason_code, error_code, observation_refs,
  started_at, completed_at`

const checkpointColumns = `
  tenant_id, execution_id, checkpoint_id, checkpoint_version, runtime_profile,
  runtime_version, orchestrator_version, step_number, state, budget_usage,
  digest, created_at`

function text(value: unknown, label: string, max = 200): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CheckpointError('checkpoint_binding', `${label} is required`)
  }
  if (value.length > max) {
    throw new CheckpointError('checkpoint_binding', `${label} is too long`)
  }
  return value.trim()
}

function asIso(value: Date | string | null): string | null {
  if (value === null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new CheckpointError(
      'checkpoint_integrity',
      'Persisted step JSON is invalid'
    )
  }
}

function jsonText(value: unknown, label: string): string {
  try {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new Error('undefined')
    return serialized
  } catch {
    throw new CheckpointError(
      'checkpoint_integrity',
      `${label} cannot be serialized`
    )
  }
}

function mapStep(row: StepRow): ExecutionStep {
  const refs = jsonValue(row.observation_refs)
  return {
    stepId: row.step_id,
    executionId: row.execution_id,
    tenantId: row.tenant_id,
    stepNumber: row.step_number,
    stepType: row.step_type,
    status: row.status,
    attempt: row.attempt,
    sideEffecting: row.side_effecting,
    startedAt: asIso(row.started_at) as string,
    ...(row.completed_at
      ? { completedAt: asIso(row.completed_at) as string }
      : {}),
    ...(row.decision_type ? { decisionType: row.decision_type } : {}),
    ...(row.reason_code
      ? {
          reasonCode: row.reason_code as NonNullable<
            ExecutionStep['reasonCode']
          >
        }
      : {}),
    observationRefs: Array.isArray(refs) ? (refs as string[]) : [],
    ...(row.error_code ? { errorCode: row.error_code } : {})
  }
}

function mapCheckpoint(row: CheckpointRow): ExecutionCheckpoint {
  return {
    checkpointId: row.checkpoint_id,
    executionId: row.execution_id,
    tenantId: row.tenant_id,
    checkpointVersion: row.checkpoint_version,
    runtimeProfile:
      row.runtime_profile as ExecutionCheckpoint['runtimeProfile'],
    runtimeVersion: row.runtime_version,
    orchestratorVersion: row.orchestrator_version,
    stepNumber: row.step_number,
    state: jsonValue(row.state) as ExecutionCheckpoint['state'],
    budgetUsage: jsonValue(
      row.budget_usage
    ) as ExecutionCheckpoint['budgetUsage'],
    createdAt: asIso(row.created_at) as string,
    digest: row.digest
  }
}

function isPool(
  connection: OperationalStepPostgresConnection
): connection is PostgresPoolLike {
  return typeof (connection as PostgresPoolLike).connect === 'function'
}

/**
 * Durable Phase 3 step/checkpoint authority. Tenant scoping is inherited from
 * the Phase 2 connection discipline; checkpoint integrity is validated before
 * every write and after every read.
 */
export class PostgresExecutionStepStore implements ExecutionStepStore {
  private readonly clock: () => Date

  public constructor(
    private readonly connection: OperationalStepPostgresConnection,
    options: PostgresExecutionStepStoreOptions = {}
  ) {
    this.clock = options.clock ?? (() => new Date())
  }

  public recordStep(step: ExecutionStep): Promise<void> {
    const tenant = TenantIdSchema.parse(step.tenantId)
    if (!Number.isSafeInteger(step.stepNumber) || step.stepNumber < 1) {
      throw new CheckpointError(
        'step_conflict',
        'A step number must be a positive integer'
      )
    }
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        const existing = await client.query<StepRow>(
          `SELECT ${stepColumns}
             FROM operational_execution_steps
            WHERE tenant_id = $1 AND execution_id = $2 AND step_number = $3
            FOR UPDATE`,
          [tenant, step.executionId, step.stepNumber]
        )
        const current = existing.rows[0]
        if (current) {
          if (current.step_id !== step.stepId) {
            throw new CheckpointError(
              'step_conflict',
              'A different step already occupies this step number'
            )
          }
          if (
            current.status !== step.status &&
            !isStepTransitionAllowed(current.status, step.status)
          ) {
            throw new CheckpointError(
              'step_transition',
              `Step transition ${current.status} -> ${step.status} is not allowed`
            )
          }
          await client.query(
            `UPDATE operational_execution_steps
                SET status = $4, attempt = $5, side_effecting = $6,
                    decision_type = $7, reason_code = $8, error_code = $9,
                    observation_refs = $10::jsonb,
                    started_at = $11, completed_at = $12
              WHERE tenant_id = $1 AND execution_id = $2 AND step_number = $3`,
            [
              tenant,
              step.executionId,
              step.stepNumber,
              step.status,
              step.attempt,
              step.sideEffecting,
              step.decisionType ?? null,
              step.reasonCode ?? null,
              step.errorCode ?? null,
              jsonText(step.observationRefs, 'observation refs'),
              step.startedAt,
              step.completedAt ?? null
            ]
          )
          return
        }
        const blocking = await client.query<{ step_number: number }>(
          `SELECT step_number
             FROM operational_execution_steps
            WHERE tenant_id = $1 AND execution_id = $2
              AND step_number < $3
              AND status NOT IN ('SUCCEEDED', 'FAILED', 'SKIPPED', 'WAITING')
            ORDER BY step_number ASC
            LIMIT 1`,
          [tenant, step.executionId, step.stepNumber]
        )
        if (blocking.rows[0]) {
          throw new CheckpointError(
            'step_transition',
            `Step ${step.stepNumber} cannot start before step ${blocking.rows[0].step_number} settles`
          )
        }
        await client.query(
          `INSERT INTO operational_execution_steps
             (tenant_id, execution_id, step_number, step_id, step_type, status,
              attempt, side_effecting, decision_type, reason_code, error_code,
              observation_refs, started_at, completed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb,
                   $13, $14)`,
          [
            tenant,
            step.executionId,
            step.stepNumber,
            step.stepId,
            step.stepType,
            step.status,
            step.attempt,
            step.sideEffecting,
            step.decisionType ?? null,
            step.reasonCode ?? null,
            step.errorCode ?? null,
            jsonText(step.observationRefs, 'observation refs'),
            step.startedAt,
            step.completedAt ?? null
          ]
        )
      })
    )
  }

  public listSteps(
    tenantId: string,
    executionId: string
  ): Promise<readonly ExecutionStep[]> {
    const tenant = TenantIdSchema.parse(tenantId)
    const id = text(executionId, 'executionId')
    return this.run(tenant, async (client) => {
      const result = await client.query<StepRow>(
        `SELECT ${stepColumns}
           FROM operational_execution_steps
          WHERE tenant_id = $1 AND execution_id = $2
          ORDER BY step_number ASC`,
        [tenant, id]
      )
      return result.rows.map(mapStep)
    })
  }

  public saveCheckpoint(checkpoint: ExecutionCheckpoint): Promise<void> {
    const tenant = TenantIdSchema.parse(checkpoint.tenantId)
    validateCheckpointIntegrity(checkpoint, {
      tenantId: checkpoint.tenantId,
      executionId: checkpoint.executionId
    })
    return this.run(tenant, (client) =>
      transaction(client, async () => {
        await client.query(
          `INSERT INTO operational_execution_checkpoints
             (tenant_id, execution_id, checkpoint_id, checkpoint_version,
              runtime_profile, runtime_version, orchestrator_version,
              step_number, state, budget_usage, digest, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
                   $11, $12)
           ON CONFLICT (tenant_id, execution_id) DO UPDATE
             SET checkpoint_id = EXCLUDED.checkpoint_id,
                 checkpoint_version = EXCLUDED.checkpoint_version,
                 runtime_profile = EXCLUDED.runtime_profile,
                 runtime_version = EXCLUDED.runtime_version,
                 orchestrator_version = EXCLUDED.orchestrator_version,
                 step_number = EXCLUDED.step_number,
                 state = EXCLUDED.state,
                 budget_usage = EXCLUDED.budget_usage,
                 digest = EXCLUDED.digest,
                 created_at = EXCLUDED.created_at`,
          [
            tenant,
            checkpoint.executionId,
            checkpoint.checkpointId,
            checkpoint.checkpointVersion,
            checkpoint.runtimeProfile,
            checkpoint.runtimeVersion,
            checkpoint.orchestratorVersion,
            checkpoint.stepNumber,
            jsonText(checkpoint.state, 'checkpoint state'),
            jsonText(checkpoint.budgetUsage, 'checkpoint budget usage'),
            checkpoint.digest,
            checkpoint.createdAt
          ]
        )
      })
    )
  }

  public loadCheckpoint(
    tenantId: string,
    executionId: string
  ): Promise<ExecutionCheckpoint | null> {
    const tenant = TenantIdSchema.parse(tenantId)
    const id = text(executionId, 'executionId')
    return this.run(tenant, async (client) => {
      const result = await client.query<CheckpointRow>(
        `SELECT ${checkpointColumns}
           FROM operational_execution_checkpoints
          WHERE tenant_id = $1 AND execution_id = $2`,
        [tenant, id]
      )
      const row = result.rows[0]
      if (!row) return null
      const checkpoint = mapCheckpoint(row)
      validateCheckpointIntegrity(checkpoint, { tenantId, executionId: id })
      return checkpoint
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
