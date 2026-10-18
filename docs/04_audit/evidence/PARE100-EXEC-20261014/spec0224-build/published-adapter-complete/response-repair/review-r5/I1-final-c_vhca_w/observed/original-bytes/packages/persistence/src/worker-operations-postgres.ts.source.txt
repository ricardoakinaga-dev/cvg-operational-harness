import type { TenantId } from '@cvg/platform'
import {
  withTenantContext,
  type PostgresPoolLike
} from './tenant-scoped-postgres.ts'

/**
 * PROD-0373 (barra 0373, condições 9 e 10) — worker liveness, the durable
 * kernel pause switch and the queue reading a stop-alert monitor needs.
 * Every call runs under the tenant's RLS context (migration 0027).
 */

export interface WorkerHeartbeatRecord {
  readonly workerId: string
  readonly startedAt: Date
  readonly lastBeatAt: Date
  readonly lastProgressAt: Date | null
  readonly processed: number
}

export interface KernelPauseState {
  readonly paused: boolean
  readonly reason: string | null
  readonly updatedBy: string | null
  readonly updatedAt: Date | null
}

export interface WorkerQueueStatus {
  /** Outbox events ready to run now (pending, or failed and due). */
  readonly ready: number
  /** Age of the oldest ready event, or null when none is ready. */
  readonly oldestReadyAgeMs: number | null
  /** Events still `processing` after their lease expired. */
  readonly expiredLeases: number
}

export interface WorkerOperationsStatus {
  readonly observedAt: Date
  readonly workers: readonly WorkerHeartbeatRecord[]
  readonly queue: WorkerQueueStatus
  readonly pause: KernelPauseState
}

const NOT_PAUSED: KernelPauseState = {
  paused: false,
  reason: null,
  updatedBy: null,
  updatedAt: null
}

function boundedText(value: string, field: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed.length < 1 || trimmed.length > max) {
    throw new Error(`${field} must have 1..${max} characters`)
  }
  return trimmed
}

export class PostgresWorkerOperations {
  readonly #pool: PostgresPoolLike

  public constructor(pool: PostgresPoolLike) {
    this.#pool = pool
  }

  /** Upserts this worker's heartbeat; `progressed` counts settled events. */
  public async beat(
    tenantId: TenantId,
    input: { workerId: string; startedAt: Date; progressed: number }
  ): Promise<void> {
    const workerId = boundedText(input.workerId, 'workerId', 200)
    const progressed = Math.max(0, Math.trunc(input.progressed))
    await withTenantContext(this.#pool, tenantId, (client) =>
      client.query(
        `INSERT INTO worker_heartbeats
           (tenant_id, worker_id, started_at, last_beat_at, last_progress_at, processed)
         VALUES ($1, $2, $3, now(), CASE WHEN $4::bigint > 0 THEN now() END, $4::bigint)
         ON CONFLICT (tenant_id, worker_id) DO UPDATE SET
           started_at = EXCLUDED.started_at,
           last_beat_at = now(),
           last_progress_at = CASE WHEN $4::bigint > 0 THEN now()
             ELSE worker_heartbeats.last_progress_at END,
           processed = worker_heartbeats.processed + $4::bigint`,
        [tenantId, workerId, input.startedAt, progressed]
      )
    )
  }

  public async pauseState(tenantId: TenantId): Promise<KernelPauseState> {
    const result = await withTenantContext(this.#pool, tenantId, (client) =>
      client.query<{
        paused: boolean
        reason: string | null
        updated_by: string
        updated_at: Date
      }>(
        `SELECT paused, reason, updated_by, updated_at
           FROM kernel_pause_switches WHERE tenant_id = $1`,
        [tenantId]
      )
    )
    const row = result.rows[0]
    if (!row) return NOT_PAUSED
    return {
      paused: row.paused,
      reason: row.reason,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at
    }
  }

  public async isPaused(tenantId: TenantId): Promise<boolean> {
    return (await this.pauseState(tenantId)).paused
  }

  /** The durable off button: pausing never deletes pending work. */
  public async setPaused(
    tenantId: TenantId,
    input: { paused: boolean; actor: string; reason?: string }
  ): Promise<KernelPauseState> {
    const actor = boundedText(input.actor, 'actor', 200)
    const reason =
      input.reason === undefined
        ? null
        : boundedText(input.reason, 'reason', 500)
    await withTenantContext(this.#pool, tenantId, (client) =>
      client.query(
        `INSERT INTO kernel_pause_switches (tenant_id, paused, reason, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (tenant_id) DO UPDATE SET
           paused = EXCLUDED.paused,
           reason = EXCLUDED.reason,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [tenantId, input.paused, reason, actor]
      )
    )
    return this.pauseState(tenantId)
  }

  public async status(tenantId: TenantId): Promise<WorkerOperationsStatus> {
    return withTenantContext(this.#pool, tenantId, async (client) => {
      const now = await client.query<{ now: Date }>('SELECT now() AS now')
      const workers = await client.query<{
        worker_id: string
        started_at: Date
        last_beat_at: Date
        last_progress_at: Date | null
        processed: string
      }>(
        `SELECT worker_id, started_at, last_beat_at, last_progress_at, processed
           FROM worker_heartbeats WHERE tenant_id = $1
          ORDER BY last_beat_at DESC LIMIT 50`,
        [tenantId]
      )
      const queue = await client.query<{
        ready: string
        oldest_ready_age_ms: string | null
        expired_leases: string
      }>(
        `SELECT
           count(*) FILTER (WHERE ready) AS ready,
           (extract(epoch FROM now() - min(ready_at) FILTER (WHERE ready)) * 1000)::bigint
             AS oldest_ready_age_ms,
           count(*) FILTER (WHERE expired) AS expired_leases
         FROM (
           SELECT
             (status = 'pending' OR status = 'failed')
               AND coalesce(available_at, created_at) <= now() AS ready,
             coalesce(available_at, created_at) AS ready_at,
             status = 'processing' AND lease_until < now() AS expired
           FROM outbox_events
          WHERE tenant_id = $1 AND status IN ('pending', 'failed', 'processing')
         ) AS candidates`,
        [tenantId]
      )
      const pause = await client.query<{
        paused: boolean
        reason: string | null
        updated_by: string
        updated_at: Date
      }>(
        `SELECT paused, reason, updated_by, updated_at
           FROM kernel_pause_switches WHERE tenant_id = $1`,
        [tenantId]
      )
      const queueRow = queue.rows[0]
      const pauseRow = pause.rows[0]
      return {
        observedAt: now.rows[0]?.now ?? new Date(),
        workers: workers.rows.map((row) => ({
          workerId: row.worker_id,
          startedAt: row.started_at,
          lastBeatAt: row.last_beat_at,
          lastProgressAt: row.last_progress_at,
          processed: Number(row.processed)
        })),
        queue: {
          ready: Number(queueRow?.ready ?? 0),
          oldestReadyAgeMs:
            queueRow?.oldest_ready_age_ms == null
              ? null
              : Number(queueRow.oldest_ready_age_ms),
          expiredLeases: Number(queueRow?.expired_leases ?? 0)
        },
        pause: pauseRow
          ? {
              paused: pauseRow.paused,
              reason: pauseRow.reason,
              updatedBy: pauseRow.updated_by,
              updatedAt: pauseRow.updated_at
            }
          : NOT_PAUSED
      }
    })
  }
}
