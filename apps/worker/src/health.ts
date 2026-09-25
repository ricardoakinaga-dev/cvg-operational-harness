/**
 * Worker health.
 *
 * `workerHealth` stays a static liveness answer (the process responds).
 * AUD19-009 adds `checkHomologHealth`: real dependency checks for the
 * homologation composition (database round-trip plus queue depth), each
 * with its own timeout. Callers keep health observation independent from work
 * and may pause claims while an unhealthy report is active; recovery is
 * observed on the next health tick.
 */
import { withTenantContext, type PostgresPoolLike } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

export function workerHealth() {
  return { status: 'ok' as const }
}

export interface HomologHealthCheck {
  name: string
  status: 'ok' | 'failed'
  detail: string
  latencyMs: number
}

export interface HomologHealthReport {
  healthy: boolean
  checks: HomologHealthCheck[]
}

async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  task: () => Promise<T>
): Promise<
  | { ok: true; value: T; latencyMs: number }
  | { ok: false; detail: string; latencyMs: number }
> {
  const started = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const value = await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out`)),
          timeoutMs
        )
        timer.unref?.()
      })
    ])
    return { ok: true, value, latencyMs: Date.now() - started }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'unknown error',
      latencyMs: Date.now() - started
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function checkHomologHealth(
  pool: PostgresPoolLike,
  tenantId: TenantId,
  timeoutMs = 1_000
): Promise<HomologHealthReport> {
  const database = await withTimeout('database', timeoutMs, async () => {
    await withTenantContext(pool, tenantId, async (client) => {
      await client.query('SELECT 1')
    })
  })
  const queue = await withTimeout('queue', timeoutMs, async () =>
    withTenantContext(pool, tenantId, async (client) => {
      const result = await client.query<{ pending: string }>(
        `SELECT COUNT(*) AS pending
         FROM operational_execution_outbox
         WHERE tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')
           AND status = 'pending'`
      )
      return Number(result.rows[0]?.pending ?? 0)
    })
  )
  const checks: HomologHealthCheck[] = [
    database.ok
      ? {
          name: 'database',
          status: 'ok',
          detail: 'round-trip succeeded',
          latencyMs: database.latencyMs
        }
      : {
          name: 'database',
          status: 'failed',
          detail: database.detail,
          latencyMs: database.latencyMs
        },
    queue.ok
      ? {
          name: 'queue',
          status: 'ok',
          detail: `${queue.value} pending execution(s)`,
          latencyMs: queue.latencyMs
        }
      : {
          name: 'queue',
          status: 'failed',
          detail: queue.detail,
          latencyMs: queue.latencyMs
        }
  ]
  return {
    healthy: checks.every((check) => check.status === 'ok'),
    checks
  }
}
