/**
 * AUD19-009 — composed observability: health distinction, redaction,
 * cardinality and testable alerts (memory-level proofs; durable correlation
 * is proven on PostgreSQL in homolog-correlation-postgres.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { buildServer, type RuntimeLogEntry } from '../server.ts'
import { evaluateReadinessWithProbes } from '../readiness.ts'
import { evaluateHomologAlerts } from '../homolog-alerts.ts'
import {
  ControlledRequestMetrics,
  OTHER_ROUTE_TEMPLATE
} from '../request-metrics.ts'

const SECRET = 'homolog-observability-secret-value-abcdef0123456789'

function operatorHeaders() {
  return {
    'x-operator-id': 'operator.synthetic',
    'x-operator-role': 'Operator',
    'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000901'
  }
}

describe('homolog observability (AUD19-009)', () => {
  it('fails /ready without sinking /live or /health when the database is down', async () => {
    const broken = {
      query: async () => {
        throw new Error('synthetic database outage')
      }
    }
    const app = buildServer({
      persistence: { kind: 'postgres', client: broken as never }
    })
    const ready = await app.inject({ method: 'GET', url: '/ready' })
    const live = await app.inject({ method: 'GET', url: '/live' })
    const health = await app.inject({ method: 'GET', url: '/health' })
    await app.close()
    expect(ready.statusCode).toBe(503)
    expect(ready.json().data.ready).toBe(false)
    expect(live.statusCode).toBe(200)
    expect(health.statusCode).toBe(200)
  })

  it('bounds a hanging dependency probe', async () => {
    const started = Date.now()
    const result = await evaluateReadinessWithProbes({
      persistenceMode: 'memory',
      durableInbound: false,
      production: false,
      probes: [
        {
          name: 'hanging',
          timeoutMs: 100,
          check: () => new Promise<void>(() => undefined)
        }
      ]
    })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(result.ready).toBe(false)
    expect(result.checks).toContainEqual(
      expect.objectContaining({ name: 'hanging', status: 'failed' })
    )
  })

  it('never leaks secrets, tokens, bodies or PII into logs or metrics', async () => {
    const logs: RuntimeLogEntry[] = []
    const metrics = new ControlledRequestMetrics()
    const app = buildServer({
      runtimeLogger: (entry) => logs.push(entry),
      requestMetrics: metrics
    })
    const token = `header.${SECRET}.signature`
    await app.inject({
      method: 'GET',
      url: '/v1/conversations?limit=1',
      headers: {
        ...operatorHeaders(),
        'x-cvg-operator-token': token,
        authorization: `Bearer ${SECRET}`
      }
    })
    await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      headers: { 'x-tenant-id': operatorHeaders()['x-tenant-id'] },
      payload: {
        externalMessageId: 'redaction-probe-1',
        senderRef: '+5511999990001',
        body: `my secret is ${SECRET}`,
        receivedAt: '2026-09-05T12:00:00.000Z'
      }
    })
    await app.inject({ method: 'GET', url: '/no-such-route' })
    await app.close()
    const serialized = JSON.stringify({ logs, metrics: metrics.snapshot() })
    expect(serialized).not.toContain(SECRET)
    expect(serialized).not.toContain('+5511999990001')
    expect(serialized).not.toContain('my secret is')
    expect(serialized).not.toContain('Bearer')
  })

  it('bounds metric cardinality and surfaces shedding', () => {
    const metrics = new ControlledRequestMetrics({ maxRoutes: 2 })
    metrics.record({
      method: 'GET',
      routeTemplate: '/a',
      statusCode: 200,
      latencyMs: 1
    })
    metrics.record({
      method: 'GET',
      routeTemplate: '/b',
      statusCode: 200,
      latencyMs: 1
    })
    metrics.record({
      method: 'GET',
      routeTemplate: '/c',
      statusCode: 200,
      latencyMs: 1
    })
    const snapshot = metrics.snapshot()
    expect(snapshot.droppedRouteCount).toBe(1)
    expect(
      snapshot.routes.some(
        (route) => route.routeTemplate === OTHER_ROUTE_TEMPLATE
      )
    ).toBe(true)
    const alerts = evaluateHomologAlerts(snapshot, [])
    expect(alerts).toContainEqual(
      expect.objectContaining({ name: 'metrics_cardinality_shedding' })
    )
  })

  it('evaluates alert thresholds without inventing evidence', () => {
    expect(
      evaluateHomologAlerts(
        {
          totalRequests: 0,
          droppedRouteCount: 0,
          statusBuckets: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 }
        },
        []
      )
    ).toEqual([])
    const probes = evaluateHomologAlerts(
      {
        totalRequests: 0,
        droppedRouteCount: 0,
        statusBuckets: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 }
      },
      [
        { name: 'database', status: 'failed' },
        { name: 'queue', status: 'degraded' }
      ]
    )
    expect(probes).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        name: 'probe_failed:database'
      })
    )
    expect(probes).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        name: 'probe_degraded:queue'
      })
    )
    // Below the volume floor, shares never fire.
    expect(
      evaluateHomologAlerts(
        {
          totalRequests: 10,
          droppedRouteCount: 0,
          statusBuckets: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 10, other: 0 }
        },
        []
      )
    ).toEqual([])
    const budget = evaluateHomologAlerts(
      {
        totalRequests: 100,
        droppedRouteCount: 0,
        statusBuckets: { '2xx': 73, '3xx': 0, '4xx': 25, '5xx': 2, other: 0 }
      },
      []
    )
    expect(budget).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        name: 'server_error_budget'
      })
    )
    expect(budget).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        name: 'client_error_budget'
      })
    )
  })
})
