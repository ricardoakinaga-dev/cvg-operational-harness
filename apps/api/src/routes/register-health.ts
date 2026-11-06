import { healthRoute, liveRoute, readyRoute } from './health.ts'
import { ok, createCorrelationId, fail } from '@cvg/shared'
import { evaluateReadinessWithProbes } from '../readiness.ts'
import type { RouteContext } from './context.ts'

export function registerHealthRoutes(ctx: RouteContext): void {
  const {
    app,
    durableInbound,
    options,
    readinessProbes,
    requestMetrics,
    requestMetricsEnabled
  } = ctx

  app.get(healthRoute, async () =>
    ok({ status: 'ok', runtime: 'api' }, createCorrelationId())
  )

  app.get(liveRoute, async () =>
    ok({ status: 'ok', runtime: 'api', probe: 'live' }, createCorrelationId())
  )

  app.get(readyRoute, async (_request, reply) => {
    const readiness = await evaluateReadinessWithProbes({
      persistenceMode: options.persistence?.kind ?? 'memory',
      durableInbound,
      production: process.env.NODE_ENV === 'production',
      probes: readinessProbes
    })
    reply.header('cache-control', 'no-store')
    reply.code(readiness.ready ? 200 : 503)
    return ok(readiness, createCorrelationId())
  })

  app.get('/health/metrics', async (_request, reply) => {
    const correlationId = createCorrelationId()
    reply.header('cache-control', 'no-store')
    if (!requestMetricsEnabled) {
      reply.code(404)
      return fail('invalid_action', 'Not found', correlationId)
    }
    return ok({ metrics: requestMetrics.snapshot() }, correlationId)
  })
}
