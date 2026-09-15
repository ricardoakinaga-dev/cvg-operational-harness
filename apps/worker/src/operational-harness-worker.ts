import { Pool } from 'pg'
import {
  OperationalExecutionWorker,
  InMemoryExecutionStepStore,
  createInMemoryOperationalExecutionStore,
  InMemoryEffectJournal,
  type EffectJournal,
  type OperationalExecutionStore,
  type OperationalHarnessOptions,
  type OperationalExecutionWorkerOptions,
  OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM,
  type OperationalExecutionFaultPoint
} from '@cvg/harness'
import { SinglePassOrchestrator } from '@cvg/harness-orchestrator'
import {
  createPhase3IterativeHarnessOptions,
  parsePhase3RuntimeProfile,
  parsePhase3Scenario
} from './phase3-synthetic-agent.ts'
import {
  ApprovalEngine,
  DurableApprovalEngineAdapter,
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  PostgresOperationalEffectJournal,
  PostgresExecutionStepStore,
  type PostgresPoolLike
} from '@cvg/persistence'
import type { ApprovalAuthority } from '@cvg/persistence'
import type { ExecutionStepStore } from '@cvg/harness'
import type { ExecutionRecord } from '@cvg/harness'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  assertPostgresWorkerPreflight,
  OPERATIONAL_HARNESS_CRITICAL_TABLES,
  OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS
} from './postgres-role-preflight.ts'
import { createPhase2SyntheticEffectRegistry } from './phase2-synthetic-effect.ts'
import type { SyntheticEffectObserver } from './phase2-synthetic-effect.ts'

export const OPERATIONAL_HARNESS_WORKER_RUNTIME = 'operational-harness' as const
export const OPERATIONAL_FAULT_POINT_AFTER_CLAIM =
  OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM
export const OPERATIONAL_SYNTHETIC_EFFECT_ENV =
  'CVG_WORKER_SYNTHETIC_EFFECT' as const

export type OperationalHarnessFaultInjector = (
  point: OperationalExecutionFaultPoint
) => Promise<void>

interface ControlledWorkerSafetyEnv {
  readonly NODE_ENV?: string
  readonly CVG_WORKER_CONTROLLED_MODE?: string
}

const MAX_OPERATIONAL_WORKER_CONCURRENCY = 32
const MAX_OPERATIONAL_WORKER_IDLE_WAIT_MS = 60_000
const MAX_OPERATIONAL_WORKER_POLL_INTERVAL_MS = 1_000

export function parseOperationalFaultPoint(
  raw: string | undefined,
  env: ControlledWorkerSafetyEnv = process.env
): OperationalExecutionFaultPoint | undefined {
  const value = raw?.trim()
  if (!value) return undefined
  if (env.NODE_ENV === 'production') {
    throw new Error('PHASE2_FAULT_POINT is forbidden in production')
  }
  if (env.CVG_WORKER_CONTROLLED_MODE !== 'true') {
    throw new Error(
      'PHASE2_FAULT_POINT requires CVG_WORKER_CONTROLLED_MODE=true'
    )
  }
  if (value !== OPERATIONAL_FAULT_POINT_AFTER_CLAIM) {
    throw new Error(
      `PHASE2_FAULT_POINT must be ${OPERATIONAL_FAULT_POINT_AFTER_CLAIM}`
    )
  }
  return OPERATIONAL_FAULT_POINT_AFTER_CLAIM
}

export function parseOperationalSyntheticEffect(
  raw: string | undefined,
  env: ControlledWorkerSafetyEnv = process.env
): boolean {
  const value = raw?.trim()
  if (!value || value === 'false') return false
  if (value !== 'true') {
    throw new Error(
      `${OPERATIONAL_SYNTHETIC_EFFECT_ENV} must be either true or false`
    )
  }
  if (env.NODE_ENV === 'production') {
    throw new Error(
      `${OPERATIONAL_SYNTHETIC_EFFECT_ENV} is forbidden in production`
    )
  }
  if (env.CVG_WORKER_CONTROLLED_MODE !== 'true') {
    throw new Error(
      `${OPERATIONAL_SYNTHETIC_EFFECT_ENV} requires CVG_WORKER_CONTROLLED_MODE=true`
    )
  }
  return true
}

export function parseOperationalWorkerIdleWait(
  raw: string | undefined,
  fallback = 0
): number {
  const value = raw?.trim() ? Number(raw) : fallback
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_OPERATIONAL_WORKER_IDLE_WAIT_MS
  ) {
    throw new Error(
      `CVG_WORKER_IDLE_WAIT_MS must be an integer between 0 and ${MAX_OPERATIONAL_WORKER_IDLE_WAIT_MS}`
    )
  }
  return value
}

export function parseOperationalWorkerPollInterval(
  raw: string | undefined,
  fallback = 25
): number {
  const value = raw?.trim() ? Number(raw) : fallback
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_OPERATIONAL_WORKER_POLL_INTERVAL_MS
  ) {
    throw new Error(
      `CVG_WORKER_POLL_INTERVAL_MS must be an integer between 1 and ${MAX_OPERATIONAL_WORKER_POLL_INTERVAL_MS}`
    )
  }
  return value
}

export function createOperationalHarnessFaultInjector(
  env: NodeJS.ProcessEnv,
  terminate: (signal: NodeJS.Signals) => void = (signal) => {
    process.kill(process.pid, signal)
  }
): OperationalHarnessFaultInjector | undefined {
  const point = parseOperationalFaultPoint(env.PHASE2_FAULT_POINT, env)
  if (!point) return undefined
  let triggered = false
  return async (receivedPoint) => {
    if (triggered || receivedPoint !== point) return
    triggered = true
    terminate('SIGKILL')
  }
}

export function parseOperationalWorkerConcurrency(
  raw: string | undefined,
  fallback = 1
): number {
  const value = raw?.trim() ? Number(raw) : fallback
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_OPERATIONAL_WORKER_CONCURRENCY
  ) {
    throw new Error(
      `CVG_WORKER_CONCURRENCY must be an integer between 1 and ${MAX_OPERATIONAL_WORKER_CONCURRENCY}`
    )
  }
  return value
}

function parseOperationalWorkerAttempts(
  raw: string | undefined
): number | undefined {
  if (!raw?.trim()) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error(
      'CVG_WORKER_MAX_ATTEMPTS must be an integer between 1 and 100'
    )
  }
  return value
}

export interface OperationalHarnessWorkerRuntime {
  readonly worker: OperationalExecutionWorker
  readonly store: OperationalExecutionStore
  readonly approvalAuthority: ApprovalAuthority
  readonly effectJournal: Pick<EffectJournal, 'get'> | null
  readonly stepStore: ExecutionStepStore | null
  readonly runtimeProfile: 'single_pass' | 'iterative'
  readonly tenantId: TenantId
  readonly pool: Pool | null
  close(): Promise<void>
}

/**
 * Neutral Phase 2 worker composition. It has no Secretary/product adapter and
 * uses only a deterministic model. The tool registry stays empty unless the
 * explicit controlled synthetic-effect fixture is enabled.
 */
export function createOperationalHarnessWorker(
  env: NodeJS.ProcessEnv,
  options: {
    readonly store?: OperationalExecutionStore
    readonly harnessOptions?: OperationalHarnessOptions
    readonly syntheticEffectObserver?: SyntheticEffectObserver
  } = {}
): OperationalHarnessWorkerRuntime {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Neutral operational harness worker remains controlled-only; production is forbidden'
    )
  }
  const faultInjector = createOperationalHarnessFaultInjector(env)
  const runtimeProfile = parsePhase3RuntimeProfile(
    env.CVG_WORKER_RUNTIME_PROFILE
  )
  const iterativeScenario = parsePhase3Scenario(
    env.CVG_WORKER_ITERATIVE_SCENARIO
  )
  if (runtimeProfile === 'iterative' && !iterativeScenario) {
    throw new Error(
      'CVG_WORKER_RUNTIME_PROFILE=iterative requires CVG_WORKER_ITERATIVE_SCENARIO'
    )
  }
  const syntheticEffectEnabled = parseOperationalSyntheticEffect(
    env[OPERATIONAL_SYNTHETIC_EFFECT_ENV],
    env
  )
  const tenantId = TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
  const maxAttempts = parseOperationalWorkerAttempts(
    env.CVG_WORKER_MAX_ATTEMPTS
  )
  const schemaName = env.POSTGRES_SCHEMA?.trim() || undefined
  assertSafeSchemaName(schemaName)
  let pool: Pool | null = null
  const store =
    options.store ??
    (env.DATABASE_URL
      ? ((pool = new Pool({
          connectionString: env.DATABASE_URL,
          ...(schemaName ? { options: `-c search_path=${schemaName}` } : {})
        })),
        new PostgresOperationalExecutionStore(
          pool as unknown as PostgresPoolLike,
          maxAttempts !== undefined ? { maxAttempts } : {}
        ))
      : createInMemoryOperationalExecutionStore(
          maxAttempts !== undefined ? { maxAttempts } : {}
        ))
  const approvalAuthority: ApprovalAuthority = pool
    ? new PostgresApprovalAuthority(pool as unknown as PostgresPoolLike)
    : new ApprovalEngine()
  const effectJournal: EffectJournal | undefined = pool
    ? new PostgresOperationalEffectJournal(pool as unknown as PostgresPoolLike)
    : syntheticEffectEnabled || runtimeProfile === 'iterative'
      ? new InMemoryEffectJournal()
      : undefined
  const stepStore: ExecutionStepStore | null =
    runtimeProfile === 'iterative'
      ? pool
        ? new PostgresExecutionStepStore(pool as unknown as PostgresPoolLike)
        : new InMemoryExecutionStepStore()
      : null
  const approvalEngine = new DurableApprovalEngineAdapter(approvalAuthority)
  const harnessOptions: OperationalExecutionWorkerOptions['harnessOptions'] =
    options.harnessOptions ??
    (runtimeProfile === 'iterative' && iterativeScenario && stepStore
      ? (record: ExecutionRecord) =>
          createPhase3IterativeHarnessOptions({
            scenario: iterativeScenario,
            stepStore,
            approvals: approvalEngine,
            ...(record.resume ? { resumeKind: record.resume.kind } : {}),
            ...(options.syntheticEffectObserver
              ? { observer: options.syntheticEffectObserver }
              : {})
          })
      : createSyntheticHarnessOptions(
          approvalEngine,
          syntheticEffectEnabled
            ? createPhase2SyntheticEffectRegistry(
                options.syntheticEffectObserver
              )
            : { list: () => [], resolve: () => undefined }
        ))
  let closed = false
  const workerOptions: OperationalExecutionWorkerOptions = {
    store,
    workerId: env.CVG_WORKER_ID?.trim() || 'worker-operational-harness',
    tenantId,
    ...(env.CVG_WORKER_LEASE_MS
      ? { leaseMs: Number(env.CVG_WORKER_LEASE_MS) }
      : {}),
    harnessOptions,
    ...(effectJournal ? { effectJournal } : {}),
    ...(faultInjector ? { faultInjector } : {})
  }
  const worker = new OperationalExecutionWorker(workerOptions)
  return {
    worker,
    store,
    approvalAuthority,
    effectJournal: effectJournal ?? null,
    stepStore,
    runtimeProfile,
    tenantId,
    pool,
    close: async () => {
      if (closed) return
      closed = true
      if (pool) await pool.end()
    }
  }
}

export async function assertOperationalHarnessPostgresPreflight(
  runtime: OperationalHarnessWorkerRuntime
): Promise<void> {
  if (!runtime.pool) return
  await assertPostgresWorkerPreflight(
    runtime.pool as unknown as PostgresPoolLike,
    {
      tenantId: runtime.tenantId,
      criticalTables: OPERATIONAL_HARNESS_CRITICAL_TABLES,
      requiredMigrations: OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS
    }
  )
}

function createSyntheticHarnessOptions(
  approvals: OperationalHarnessOptions['approvals'],
  tools: NonNullable<OperationalHarnessOptions['tools']>
): OperationalHarnessOptions {
  return {
    orchestrator: new SinglePassOrchestrator(),
    modelGateway: {
      complete: async () => ({
        text: 'Acknowledged.',
        provider: 'deterministic-v1',
        model: 'synthetic-fixture',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    },
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic controlled policy',
        policyVersion: 'synthetic-v1'
      })
    },
    approvals,
    tools,
    audit: {
      append: async () => undefined
    },
    telemetry: {
      record: () => undefined
    }
  }
}

function assertSafeSchemaName(schemaName: string | undefined): void {
  if (schemaName && !/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('POSTGRES_SCHEMA must be a safe lowercase identifier')
  }
}
