/**
 * SPEC 0262 §5 — closed classification of every REGISTERED method/template
 * pair (never by URL prefix). Anything not named here is `operator`, so a
 * new route gets no exception by omission.
 */
import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'
import { webhookRoute } from './routes/webhooks.ts'

export type OperatorRouteClass =
  | 'probe'
  | 'webhook'
  | 'oidc_bootstrap'
  | 'session'
  | 'logout'
  | 'operator'

const PROBES = new Set([healthRoute, liveRoute, readyRoute, '/health/metrics'])
const OIDC_START = '/v1/auth/oidc/start'
const OIDC_CALLBACK = '/v1/auth/oidc/callback'

export function classifyOperatorRoute(
  method: string,
  template: string | undefined
): OperatorRouteClass {
  if (!template) return 'operator'
  const verb = method.toUpperCase()
  if ((verb === 'GET' || verb === 'HEAD') && PROBES.has(template)) {
    return 'probe'
  }
  if (verb === 'POST' && template === webhookRoute) return 'webhook'
  if (verb === 'POST' && template === OIDC_START) return 'oidc_bootstrap'
  if (verb === 'GET' && template === OIDC_CALLBACK) return 'oidc_bootstrap'
  if ((verb === 'GET' || verb === 'HEAD') && template === '/v1/session') {
    return 'session'
  }
  if (verb === 'POST' && template === '/v1/session/logout') return 'logout'
  return 'operator'
}

export interface RegisteredRoute {
  readonly method: string
  readonly template: string
  readonly class: OperatorRouteClass
}
