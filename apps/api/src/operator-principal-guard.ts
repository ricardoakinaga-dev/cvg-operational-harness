/**
 * SPEC 0262 §5 — trusted-mode guard: every route classified `operator` needs
 * a CURRENT principal, whatever the credential (cookie or per-request signed
 * token). The identity is resolved by the server's own resolver (memoized by
 * request headers, so a single-use token is consumed once) and the principal
 * check precedes the handler's own validation and role matrix.
 */
import type { FastifyInstance } from 'fastify'
import type { CaseAuthorityPort } from '@cvg/persistence'
import { createCorrelationId, fail, type OperatorIdentity } from '@cvg/shared'
import type { CasePrincipalPolicy } from './case-authorization/case-routes.ts'
import {
  readCurrentPrincipal,
  SessionBindingError
} from './operator-session-binding.ts'
import {
  classifyOperatorRoute,
  type RegisteredRoute
} from './operator-route-class.ts'
import {
  clearOperatorSessionCookie,
  type OperatorCookiePolicy,
  type OperatorSessionRecord
} from './operator-session.ts'

export interface OperatorPrincipalGuardOptions {
  readonly app: FastifyInstance
  readonly caseAuthority: Pick<CaseAuthorityPort, 'readSnapshot'>
  readonly principalPolicy: CasePrincipalPolicy
  readonly cookiePolicy: OperatorCookiePolicy
  /** Same resolver the handlers use; it may throw (no/invalid credential). */
  readonly resolveIdentity: (
    headers: Record<string, unknown>
  ) => OperatorIdentity
  /** Requests whose cookie binding the session hook already verified. */
  readonly sessionRecordByHeaders: WeakMap<object, OperatorSessionRecord>
  readonly registry: RegisteredRoute[]
}

/** Records the registered inventory; install BEFORE any route is registered. */
export function recordRegisteredRoutes(
  app: FastifyInstance,
  registry: RegisteredRoute[]
): void {
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method]
    for (const method of methods) {
      registry.push({
        method: String(method).toUpperCase(),
        template: route.url,
        class: classifyOperatorRoute(String(method), route.url)
      })
    }
  })
}

export function installOperatorPrincipalGuard(
  options: OperatorPrincipalGuardOptions
): void {
  const {
    app,
    caseAuthority,
    principalPolicy,
    cookiePolicy,
    resolveIdentity,
    sessionRecordByHeaders
  } = options
  app.addHook('preHandler', async (request, reply) => {
    if (
      classifyOperatorRoute(request.method, request.routeOptions.url) !==
      'operator'
    ) {
      return
    }
    // The session hook already bound this cookie to the current revision.
    if (sessionRecordByHeaders.has(request.headers)) return
    let identity: OperatorIdentity
    try {
      identity = resolveIdentity(request.headers)
    } catch {
      // No usable credential: the handler answers 401/403/503 exactly as before.
      return
    }
    try {
      await readCurrentPrincipal(caseAuthority, principalPolicy, identity)
    } catch (error) {
      const status = error instanceof SessionBindingError ? error.status : 503
      reply.code(status).header('cache-control', 'no-store')
      if (status === 401) {
        reply.header('set-cookie', clearOperatorSessionCookie(cookiePolicy))
      }
      return reply.send(
        status === 401
          ? fail(
              'unauthorized',
              'Operator principal is not current; sign in again',
              createCorrelationId()
            )
          : fail(
              'configuration_error',
              'Operator principal is unavailable',
              createCorrelationId()
            )
      )
    }
  })
}
