import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'
import { webhookRoute } from './routes/webhooks.ts'

const sessionIndependentProbeRoutes = new Set([
  healthRoute,
  liveRoute,
  readyRoute,
  '/health/metrics'
])

/** Only exact resolved method/template pairs have independent authority. */
export function requiresOperatorSessionBoundary(
  method: string,
  resolvedRoute: string | undefined
): boolean {
  if (!resolvedRoute) return false
  if (
    (method === 'GET' || method === 'HEAD') &&
    sessionIndependentProbeRoutes.has(resolvedRoute)
  ) {
    return false
  }
  if (method === 'POST' && resolvedRoute === webhookRoute) return false
  // Every other registered pair, including future aliases, is protected.
  return true
}
