/**
 * AUD19-009 — testable homologation alert evaluation (pure, no I/O).
 *
 * Thresholds are explicit and documented in
 * `docs/runbooks/homolog-observability.md`. Every alert carries the observed
 * values that fired it; absence of alerts is returned as an empty list,
 * never inferred from missing input.
 */
import type { RequestMetricsSnapshot } from './request-metrics.ts'

export type HomologAlertSeverity = 'warning' | 'critical'

export interface HomologAlert {
  severity: HomologAlertSeverity
  name: string
  detail: string
}

export interface HomologProbeStatus {
  name: string
  status: 'ok' | 'degraded' | 'failed'
}

export interface HomologAlertThresholds {
  /** Fire when the 5xx share of all requests exceeds this fraction. */
  maxServerErrorShare?: number
  /** Fire when the 4xx share of all requests exceeds this fraction. */
  maxClientErrorShare?: number
  /** Minimum request volume before share-based alerts may fire. */
  minRequestsForShareAlerts?: number
}

const DEFAULT_THRESHOLDS: Required<HomologAlertThresholds> = {
  maxServerErrorShare: 0.01,
  maxClientErrorShare: 0.2,
  minRequestsForShareAlerts: 20
}

export function evaluateHomologAlerts(
  metrics: Pick<
    RequestMetricsSnapshot,
    'totalRequests' | 'droppedRouteCount' | 'statusBuckets'
  >,
  probes: readonly HomologProbeStatus[],
  thresholds: HomologAlertThresholds = {}
): HomologAlert[] {
  const limits = { ...DEFAULT_THRESHOLDS, ...thresholds }
  const alerts: HomologAlert[] = []
  for (const probe of probes) {
    if (probe.status === 'failed') {
      alerts.push({
        severity: 'critical',
        name: `probe_failed:${probe.name}`,
        detail: `Dependency probe '${probe.name}' reported failed`
      })
    } else if (probe.status === 'degraded') {
      alerts.push({
        severity: 'warning',
        name: `probe_degraded:${probe.name}`,
        detail: `Dependency probe '${probe.name}' reported degraded`
      })
    }
  }
  if (metrics.droppedRouteCount > 0) {
    alerts.push({
      severity: 'warning',
      name: 'metrics_cardinality_shedding',
      detail: `${metrics.droppedRouteCount} route(s) aggregated into __other__ by the cardinality cap`
    })
  }
  const total = metrics.totalRequests
  if (total >= limits.minRequestsForShareAlerts && total > 0) {
    const buckets = metrics.statusBuckets as Record<string, number>
    const serverErrors = buckets['5xx'] ?? 0
    const clientErrors = buckets['4xx'] ?? 0
    if (serverErrors / total > limits.maxServerErrorShare) {
      alerts.push({
        severity: 'critical',
        name: 'server_error_budget',
        detail: `${serverErrors}/${total} requests in 5xx (limit ${limits.maxServerErrorShare * 100}%)`
      })
    }
    if (clientErrors / total > limits.maxClientErrorShare) {
      alerts.push({
        severity: 'warning',
        name: 'client_error_budget',
        detail: `${clientErrors}/${total} requests in 4xx (limit ${limits.maxClientErrorShare * 100}%)`
      })
    }
  }
  return alerts
}
