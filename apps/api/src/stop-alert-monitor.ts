import { Pool } from 'pg'
import {
  PostgresWorkerOperations,
  guardPostgresPoolErrors,
  type PostgresPoolLike
} from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import {
  DEFAULT_STOP_ALERT_THRESHOLDS,
  createStopAlertMonitor,
  createWebhookStopAlertDelivery
} from '@cvg/observability'

/**
 * PROD-0373 (barra 0373, condição 9). The API process watches the worker:
 * it runs outside the worker, so a dead worker is still noticed. Configured
 * by `CVG_STOP_ALERT_*`; without a webhook the monitor is off and production
 * logs that nobody would be told when the worker stops.
 */

export interface StopAlertRuntime {
  start(): void
  close(): Promise<void>
}

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number
): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer (milliseconds)`)
  }
  return value
}

function log(event: string, fields: Record<string, unknown>): void {
  console.error(JSON.stringify({ event, ...fields }))
}

export function createStopAlertRuntimeFromEnv(
  env: NodeJS.ProcessEnv
): StopAlertRuntime | undefined {
  const url = env.CVG_STOP_ALERT_WEBHOOK_URL?.trim()
  if (!url) {
    if (env.NODE_ENV === 'production') {
      log('stop_alert.disabled', {
        reason: 'CVG_STOP_ALERT_WEBHOOK_URL is not set'
      })
    }
    return undefined
  }
  const secret = env.CVG_STOP_ALERT_WEBHOOK_SECRET ?? ''
  const tenantId = TenantIdSchema.parse(
    env.CVG_STOP_ALERT_TENANT_ID ?? env.CVG_WORKER_TENANT_ID
  )
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('The stop-alert monitor requires DATABASE_URL')
  }
  const deliver = createWebhookStopAlertDelivery({ url, secret })
  const thresholds = {
    workerStaleMs: positiveInteger(
      env,
      'CVG_STOP_ALERT_WORKER_STALE_MS',
      DEFAULT_STOP_ALERT_THRESHOLDS.workerStaleMs
    ),
    queueStalledMs: positiveInteger(
      env,
      'CVG_STOP_ALERT_QUEUE_STALLED_MS',
      DEFAULT_STOP_ALERT_THRESHOLDS.queueStalledMs
    )
  }
  const intervalMs = positiveInteger(env, 'CVG_STOP_ALERT_INTERVAL_MS', 30_000)
  const pool = guardPostgresPoolErrors(
    new Pool({
      connectionString: databaseUrl,
      max: 2,
      connectionTimeoutMillis: 5_000,
      query_timeout: 5_000
    })
  )
  const operations = new PostgresWorkerOperations(
    pool as unknown as PostgresPoolLike
  )
  const monitor = createStopAlertMonitor({
    tenantId,
    read: () => operations.status(tenantId),
    deliver,
    thresholds,
    intervalMs,
    log
  })
  log('stop_alert.enabled', { tenantId, intervalMs, ...thresholds })
  return {
    start: () => monitor.start(),
    close: async () => {
      await monitor.stop()
      await pool.end().catch(() => undefined)
    }
  }
}
