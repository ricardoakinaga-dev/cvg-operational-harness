/**
 * AUD19-008 — durable homologation worker composition.
 *
 * `CVG_WORKER_RUNTIME=operational-harness-homolog` runs the neutral
 * operational harness against durable PostgreSQL with periodic sweeps and
 * approval-convergence recovery, restricted to synthetic homologation:
 *
 * - explicit arming (`CVG_HOMOLOG_SYNTHETIC_ONLY=true`) is required;
 * - `NODE_ENV=production` refuses to start (production stays `NO_GO`);
 * - `DATABASE_URL` is required (memory mode is refused: homologation
 *   without durability proves nothing);
 * - the tool surface is the synthetic empty registry (no tool resolves,
 *   no real effect is possible).
 *
 * Rollback is configuration-only: change `CVG_WORKER_RUNTIME` back.
 */
import { Pool } from 'pg'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { createShutdownController } from '@cvg/shared'
import { sweepExpiredApprovals } from '@cvg/agent-runtime'
import { reconcileApprovalDecision } from '@cvg/agent-core'
import {
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  type PostgresPoolLike
} from '@cvg/persistence'
import { createJsonWorkerTelemetry } from './worker-observability.ts'
import { checkHomologHealth } from './health.ts'
import {
  createOperationalHarnessWorker,
  assertOperationalHarnessPostgresPreflight,
  parseOperationalWorkerIdleWait,
  parseOperationalWorkerPollInterval,
  type OperationalHarnessWorkerRuntime
} from './operational-harness-worker.ts'
import { createWorkerReadiness } from './readiness.ts'

export const OPERATIONAL_HARNESS_HOMOLOG_RUNTIME =
  'operational-harness-homolog' as const
export const HOMOLOG_SYNTHETIC_ONLY_ENV = 'CVG_HOMOLOG_SYNTHETIC_ONLY'
export const HOMOLOG_SWEEP_INTERVAL_ENV = 'CVG_HOMOLOG_SWEEP_INTERVAL_MS'
export const HOMOLOG_HEALTH_INTERVAL_ENV = 'CVG_HOMOLOG_HEALTH_INTERVAL_MS'
export const HOMOLOG_RECONCILE_MAX_AGE_ENV =
  'CVG_HOMOLOG_RECONCILE_MAX_AGE_HOURS'
export const DEFAULT_HOMOLOG_RECONCILE_MIN_AGE_SECONDS = 30
export const DEFAULT_HOMOLOG_RECONCILE_MAX_AGE_SECONDS = 24 * 60 * 60
export const DEFAULT_HOMOLOG_SWEEP_INTERVAL_MS = 5_000
export const DEFAULT_HOMOLOG_HEALTH_INTERVAL_MS = 1_000

export interface HomologSweepResult {
  approvalsReleased: number
  approvalsUncertain: number
  approvalsReconciled: number
}

export function parseHomologConfig(env: NodeJS.ProcessEnv): {
  tenantId: TenantId
  sweepIntervalMs: number
  healthIntervalMs: number
} {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Homologation worker is forbidden in production; production remains NO_GO'
    )
  }
  if (env[HOMOLOG_SYNTHETIC_ONLY_ENV] !== 'true') {
    throw new Error(
      `${HOMOLOG_SYNTHETIC_ONLY_ENV}=true is required to arm the homologation worker`
    )
  }
  if (!env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required for the homologation worker')
  }
  if (env.POSTGRES_RLS_ENFORCEMENT !== 'true') {
    throw new Error(
      'POSTGRES_RLS_ENFORCEMENT=true is required for the homologation worker'
    )
  }
  if (env.CVG_WORKER_CONTROLLED_MODE !== 'true') {
    throw new Error(
      'CVG_WORKER_CONTROLLED_MODE=true is required for the homologation worker'
    )
  }
  const tenantId = TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
  const rawSweep = env[HOMOLOG_SWEEP_INTERVAL_ENV]?.trim()
  const sweepIntervalMs =
    rawSweep === undefined || rawSweep === ''
      ? DEFAULT_HOMOLOG_SWEEP_INTERVAL_MS
      : Number(rawSweep)
  if (!Number.isInteger(sweepIntervalMs) || sweepIntervalMs <= 0) {
    throw new Error(`${HOMOLOG_SWEEP_INTERVAL_ENV} must be a positive integer`)
  }
  const rawHealth = env[HOMOLOG_HEALTH_INTERVAL_ENV]?.trim()
  const healthIntervalMs =
    rawHealth === undefined || rawHealth === ''
      ? DEFAULT_HOMOLOG_HEALTH_INTERVAL_MS
      : Number(rawHealth)
  if (!Number.isInteger(healthIntervalMs) || healthIntervalMs <= 0) {
    throw new Error(`${HOMOLOG_HEALTH_INTERVAL_ENV} must be a positive integer`)
  }
  return { tenantId, sweepIntervalMs, healthIntervalMs }
}

/**
 * SPEC 0272 BUILD fix (review D9): how old an undecided-event approval must be
 * before the worker recovers it (`minAgeSeconds`, lets a slow API finish its
 * own append) and how far back it looks (`maxAgeSeconds`, `null` = no ceiling,
 * the standalone backfill mode). Hours come from the environment; `0` means no
 * ceiling.
 */
export interface StuckDecisionWindow {
  minAgeSeconds: number
  maxAgeSeconds: number | null
}

export function parseReconcileWindow(
  env: NodeJS.ProcessEnv
): StuckDecisionWindow {
  const raw = env[HOMOLOG_RECONCILE_MAX_AGE_ENV]?.trim()
  if (raw === undefined || raw === '') {
    return {
      minAgeSeconds: DEFAULT_HOMOLOG_RECONCILE_MIN_AGE_SECONDS,
      maxAgeSeconds: DEFAULT_HOMOLOG_RECONCILE_MAX_AGE_SECONDS
    }
  }
  const hours = Number(raw)
  if (!Number.isInteger(hours) || hours < 0) {
    throw new Error(
      `${HOMOLOG_RECONCILE_MAX_AGE_ENV} must be a non-negative integer (0 = no ceiling)`
    )
  }
  return {
    minAgeSeconds: DEFAULT_HOMOLOG_RECONCILE_MIN_AGE_SECONDS,
    maxAgeSeconds: hours === 0 ? null : hours * 3600
  }
}

function healthFailureDetail(
  report: Awaited<ReturnType<typeof checkHomologHealth>>
): string {
  return report.checks
    .map((check) => `${check.name}:${check.status}:${check.detail}`)
    .join(', ')
}

export async function assertHomologHealthPreflight(
  pool: PostgresPoolLike,
  tenantId: TenantId,
  timeoutMs = 1_000
): Promise<void> {
  const report = await checkHomologHealth(pool, tenantId, timeoutMs)
  if (!report.healthy) {
    throw new Error(
      `Homologation worker health preflight failed: ${healthFailureDetail(report)}`
    )
  }
}

/**
 * Recovery tick for approvals decided while their execution stayed waiting
 * (crash between decision and resume/audit), including approvals whose
 * execution already advanced past APPROVED (SPEC 0272). Every step is idempotent, so
 * the tick converges without risking a second effect.
 */
/**
 * SPEC 0272: also approvals whose execution already advanced. The anti-join
 * uses the expression of uq_audit_approval_decision (COALESCE(tenant_id, ''),
 * approvalId, decision) so the index serves it; the age window keeps the tick
 * away from a merely slow API and from the whole decided history.
 * `minParam`/`maxParam` are the positional parameters of the minimum age (s)
 * and of the maximum age (s, or NULL for no ceiling).
 */
function stuckDecisionsFrom(minParam: string, maxParam: string): string {
  return `FROM operational_executions AS e
       INNER JOIN runtime_approvals AS a
         ON a.tenant_id = e.tenant_id AND a.approval_id = e.approval_id
       WHERE e.tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
          AND a.status IN ('APPROVED', 'RESERVED', 'EXECUTING', 'EXECUTED', 'REJECTED')
          AND e.updated_at < now() - make_interval(secs => ${minParam}::double precision)
          AND (${maxParam}::double precision IS NULL
               OR e.updated_at > now() - make_interval(secs => ${maxParam}::double precision))
          AND NOT EXISTS (
            SELECT 1
            FROM audit_events AS audit
            WHERE audit.type = 'approval_decision'
              AND COALESCE(audit.tenant_id, '') = COALESCE(e.tenant_id, '')
              AND audit.payload->>'approvalId' = a.approval_id
              AND audit.payload->>'decision' =
                CASE WHEN a.status = 'REJECTED' THEN 'rejected' ELSE 'approved' END
          )`
}

/**
 * The persisted decision envelope `reconcileApprovalDecision` requires. Rows
 * without it (history from before migration 0024, or lost) can never be
 * recovered, so they are left out of the batch and only counted.
 */
const ENVELOPE_COMPLETE = `COALESCE(a.approver_id, '') <> ''
          AND COALESCE(a.decision_actor_type, '') <> ''
          AND COALESCE(a.decision_correlation_id, '') <> ''
          AND COALESCE(a.decision_command_key, '') <> ''`

/** Parameters: $1 limit, $2 minimum age (s), $3 maximum age (s) or NULL. */
export const STUCK_APPROVAL_DECISIONS_SQL = `SELECT e.id AS execution_id, e.approval_id,
               CASE WHEN a.status = 'REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END AS decision
       ${stuckDecisionsFrom('$2', '$3')}
          AND ${ENVELOPE_COMPLETE}
       ORDER BY e.updated_at ASC
       LIMIT $1`

/** Parameters: $1 minimum age (s), $2 maximum age (s) or NULL. */
export const INCOMPLETE_ENVELOPE_COUNT_SQL = `SELECT count(*)::integer AS incomplete
       ${stuckDecisionsFrom('$1', '$2')}
          AND NOT (${ENVELOPE_COMPLETE})`

const INFRA_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'ENOTFOUND',
  '57P01',
  '57P02',
  '57P03'
])

/** Connection and server-shutdown failures: the whole tick must fail. */
export function isInfrastructureError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code !== 'string') return false
  return INFRA_ERROR_CODES.has(code) || code.startsWith('08')
}

export interface StuckDecisionOptions {
  limit?: number
  window?: StuckDecisionWindow
  /** Test seam: replaces the audit append of the PostgreSQL repository. */
  appendAudit?: (
    event: Record<string, unknown> & { payload: unknown },
    tenant: string
  ) => Promise<unknown> | unknown
  /** One line per row that could not be recovered; the tick goes on. */
  onRowFailed?: (failure: { approvalId: string; reason: string }) => void
  /** Rows in the window that have no complete envelope (manual handling). */
  onIncompleteEnvelope?: (count: number) => void
}

export async function reconcileStuckApprovalDecisions(
  pool: Pool,
  tenantId: TenantId,
  runtime: OperationalHarnessWorkerRuntime,
  options: StuckDecisionOptions = {}
): Promise<number> {
  const limit = options.limit ?? 25
  const window = options.window ?? {
    minAgeSeconds: DEFAULT_HOMOLOG_RECONCILE_MIN_AGE_SECONDS,
    maxAgeSeconds: DEFAULT_HOMOLOG_RECONCILE_MAX_AGE_SECONDS
  }
  const onRowFailed =
    options.onRowFailed ??
    ((failure) =>
      console.error(
        JSON.stringify({
          event: 'worker.homolog_reconcile_row_failed',
          approvalId: failure.approvalId,
          reason: failure.reason
        })
      ))
  const onIncompleteEnvelope =
    options.onIncompleteEnvelope ??
    ((count) =>
      console.error(
        JSON.stringify({
          event: 'worker.homolog_reconcile_incomplete_envelope',
          count
        })
      ))
  const stuck = await withTenantContext(pool, tenantId, async (client) => {
    const incomplete = await client.query<{ incomplete: number }>(
      INCOMPLETE_ENVELOPE_COUNT_SQL,
      [window.minAgeSeconds, window.maxAgeSeconds]
    )
    const incompleteCount = Number(incomplete.rows[0]?.incomplete ?? 0)
    if (incompleteCount > 0) onIncompleteEnvelope(incompleteCount)
    return client.query<{
      execution_id: string
      approval_id: string
      decision: string
    }>(STUCK_APPROVAL_DECISIONS_SQL, [
      limit,
      window.minAgeSeconds,
      window.maxAgeSeconds
    ])
  })
  const audit = new TenantScopedPostgresRuntimeRepository(
    pool as unknown as PostgresPoolLike
  )
  const appendAudit =
    options.appendAudit ??
    ((event: Record<string, unknown> & { payload: unknown }, tenant: string) =>
      audit.appendAudit(event as never, tenant as never))
  let reconciled = 0
  for (const row of stuck.rows) {
    // One unrecoverable row (for example an approval from before the decision
    // envelope was persisted) must never stop the rows behind it.
    try {
      const decision =
        row.decision === 'APPROVED' ? 'APPROVED' : ('REJECTED' as const)
      const approval = await runtime.approvalAuthority.get(
        tenantId as string,
        row.approval_id
      )
      await reconcileApprovalDecision(
        {
          getApproval: () => approval,
          resolveExecution: (input) => runtime.store.resolveApproval(input),
          appendAudit: (event, tenant) =>
            appendAudit(
              {
                ...event,
                payload: {
                  ...(event.payload as Record<string, unknown>),
                  tenantId: tenant
                }
              },
              tenant
            )
        },
        {
          tenantId: tenantId as string,
          executionId: row.execution_id,
          approvalId: row.approval_id,
          decision
        }
      )
      reconciled += 1
    } catch (error) {
      // A broken connection or a server shutdown is not a bad row: the whole
      // tick fails so worker.homolog_sweep_failed fires.
      if (isInfrastructureError(error)) throw error
      onRowFailed({
        approvalId: row.approval_id,
        reason: error instanceof Error ? error.message : 'unknown'
      })
    }
  }
  return reconciled
}

export async function runHomologSweepTick(
  runtime: OperationalHarnessWorkerRuntime,
  tenantId: TenantId,
  window?: StuckDecisionWindow
): Promise<HomologSweepResult> {
  const now = new Date()
  const approvals = await sweepExpiredApprovals({
    approvals: runtime.approvalAuthority,
    tenantId: tenantId as string,
    now,
    ttlMs: 60_000
  })
  let reconciled = 0
  if (runtime.pool) {
    reconciled = await reconcileStuckApprovalDecisions(
      runtime.pool,
      tenantId,
      runtime,
      window ? { window } : {}
    )
  }
  return {
    approvalsReleased: approvals.released,
    approvalsUncertain: approvals.uncertain,
    approvalsReconciled: reconciled
  }
}

export async function runOperationalHarnessHomologWorker(
  env: NodeJS.ProcessEnv
): Promise<void> {
  const { tenantId, sweepIntervalMs, healthIntervalMs } =
    parseHomologConfig(env)
  const reconcileWindow = parseReconcileWindow(env)
  const runtime = createOperationalHarnessWorker(env)
  if (!runtime.pool) {
    await runtime.close()
    throw new Error(
      'Homologation worker requires durable PostgreSQL; memory mode is refused'
    )
  }
  const telemetry = createJsonWorkerTelemetry()
  const workerId = env.CVG_WORKER_ID?.trim() || 'worker-homolog'
  const readiness = createWorkerReadiness({
    onTransition: (transition) =>
      telemetry.log('worker.readiness', {
        workerId,
        status: transition.to,
        reason: transition.reason,
        readinessAt: transition.at
      })
  })
  let cleanupPromise: Promise<void> | undefined
  const cleanup = (reason: 'shutdown_started' | 'run_completed') => {
    if (cleanupPromise) return cleanupPromise
    cleanupPromise = (async () => {
      readiness.markNotReady(reason)
      runtime.worker.requestStop()
      await runtime.worker.stop()
      await runtime.close()
      readiness.markStopped(
        reason === 'shutdown_started' ? 'shutdown_completed' : 'run_completed'
      )
    })()
    return cleanupPromise
  }
  const shutdown = createShutdownController({
    close: () => cleanup('shutdown_started'),
    exit: (code) => {
      process.exitCode = code
    },
    timeoutMs: 15_000,
    log: (event) => {
      if (event.type !== 'shutdown.started') {
        console.error(
          JSON.stringify({ event: event.type, signal: event.signal })
        )
      }
    }
  })
  shutdown.install(process)
  const idleWaitMs = parseOperationalWorkerIdleWait(env.CVG_WORKER_IDLE_WAIT_MS)
  const pollIntervalMs = parseOperationalWorkerPollInterval(
    env.CVG_WORKER_POLL_INTERVAL_MS
  )
  const maxEventsRaw = env.CVG_WORKER_MAX_EVENTS?.trim()
  const maxEvents =
    maxEventsRaw === undefined || maxEventsRaw === ''
      ? Number.POSITIVE_INFINITY
      : Number(maxEventsRaw)
  let processed = 0
  let lastSweep = 0
  let lastHealth = 0
  try {
    await assertOperationalHarnessPostgresPreflight(runtime)
    await assertHomologHealthPreflight(
      runtime.pool as unknown as PostgresPoolLike,
      tenantId,
      Math.min(healthIntervalMs, 1_000)
    )
    if (shutdown.isShuttingDown()) return
    readiness.markReady('startup_preflight_passed')
    console.log(
      JSON.stringify({
        event: 'worker.homolog_ready',
        workerId,
        processed: 0,
        durable: true,
        externalEffects: false,
        syntheticOnly: true,
        runtime: OPERATIONAL_HARNESS_HOMOLOG_RUNTIME
      })
    )
    lastHealth = Date.now()
    const startMs = Date.now()
    const idleDeadlineMs =
      idleWaitMs > 0 ? startMs + idleWaitMs : Number.POSITIVE_INFINITY
    while (!shutdown.isShuttingDown()) {
      if (processed >= maxEvents) break
      const now = Date.now()
      if (now - lastHealth >= healthIntervalMs) {
        lastHealth = now
        const health = await checkHomologHealth(
          runtime.pool as unknown as PostgresPoolLike,
          tenantId,
          Math.min(healthIntervalMs, 1_000)
        )
        if (shutdown.isShuttingDown()) break
        telemetry.log(
          'worker.homolog_health',
          {
            workerId,
            healthy: health.healthy,
            checks: health.checks.map(
              (check) => `${check.name}:${check.status}`
            )
          },
          health.healthy ? 'info' : 'warn'
        )
        if (!health.healthy) {
          telemetry.log(
            'worker.homolog_unhealthy',
            {
              workerId,
              checks: health.checks.map(
                (check) => `${check.name}:${check.status}`
              )
            },
            'warn'
          )
          readiness.markNotReady('dependency_health_failed')
          continue
        }
        if (!readiness.isReady()) {
          readiness.markReady('dependencies_recovered')
        }
      }
      if (!readiness.isReady()) {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
        continue
      }
      if (shutdown.isShuttingDown()) break
      telemetry.log('worker.homolog_process_next', { workerId })
      const result = await runtime.worker.processNext()
      if (shutdown.isShuttingDown()) break
      if (result.kind === 'processed') {
        processed += 1
      } else if (Date.now() > idleDeadlineMs) {
        break
      }
      const sweepNow = Date.now()
      if (sweepNow - lastSweep >= sweepIntervalMs) {
        lastSweep = sweepNow
        try {
          const sweep = await runHomologSweepTick(
            runtime,
            tenantId,
            reconcileWindow
          )
          telemetry.log('worker.homolog_sweep', {
            workerId,
            released: sweep.approvalsReleased,
            uncertain: sweep.approvalsUncertain,
            reconciled: sweep.approvalsReconciled
          })
        } catch (error) {
          telemetry.log('worker.homolog_sweep_failed', {
            workerId,
            error: error instanceof Error ? error.message : 'unknown'
          })
        }
      }
      if (result.kind !== 'processed') {
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      }
    }
    if (!shutdown.isShuttingDown()) {
      console.log(
        JSON.stringify({
          event: 'worker.homolog_completed',
          workerId,
          processed,
          durable: true,
          externalEffects: false,
          syntheticOnly: true,
          runtime: OPERATIONAL_HARNESS_HOMOLOG_RUNTIME
        })
      )
    }
  } catch (error) {
    if (shutdown.isShuttingDown()) return
    throw error
  } finally {
    await cleanup(
      shutdown.isShuttingDown() ? 'shutdown_started' : 'run_completed'
    )
  }
}
