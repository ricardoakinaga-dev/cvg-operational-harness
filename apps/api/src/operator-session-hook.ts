import type { FastifyInstance } from 'fastify'
import { createCorrelationId, fail, type OperatorIdentity } from '@cvg/shared'
import {
  clearOperatorSessionCookie,
  parseOperatorSessionCookie,
  type OperatorCookiePolicy,
  type OperatorSessionRecord,
  type OperatorSessionStore
} from './operator-session.ts'
import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'
import type { CaseAuthorityPort } from '@cvg/persistence'
import { revalidateOperatorSession } from './operator-session-revalidation.ts'
import { SESSION_STREAM_ROUTE } from './session-event-frames.ts'
import type { CasePrincipalPolicy } from './case-authorization/case-routes.ts'

const sessionIndependentProbePaths = new Set([
  healthRoute,
  liveRoute,
  readyRoute,
  '/health/metrics'
])
// SPEC0254 §4.6: the OIDC login routes apply their own operational-cookie
// rules (start retires or clears it; the callback never reads it).
const loginPaths = new Set(['/v1/auth/oidc/start', '/v1/auth/oidc/callback'])

export interface OperatorSessionHookOptions {
  app: FastifyInstance
  /** SPEC0259 §4.3: names, reads and clears the operational cookie. */
  cookiePolicy: OperatorCookiePolicy
  operatorSessionStore: OperatorSessionStore
  /** SPEC 0262 §3: where the bound principal revision is read (data plane). */
  caseAuthority: Pick<CaseAuthorityPort, 'readSnapshot'>
  principalPolicy: CasePrincipalPolicy
  sessionIdentityByHeaders: WeakMap<object, OperatorIdentity | null>
  sessionRecordByHeaders: WeakMap<object, OperatorSessionRecord>
  sessionStoreFailureByHeaders: WeakSet<object>
}

/**
 * Installs the trusted browser-session boundary. The request maps are owned by
 * the server composition because identity resolution and route recovery use
 * the same request-scoped facts; this module owns only the Fastify hook.
 */
export function installOperatorSessionHook(
  options: OperatorSessionHookOptions
): void {
  const {
    app,
    cookiePolicy,
    operatorSessionStore,
    caseAuthority,
    principalPolicy,
    sessionIdentityByHeaders,
    sessionRecordByHeaders,
    sessionStoreFailureByHeaders
  } = options

  app.addHook('onRequest', async (request, reply) => {
    const rawPath = request.url.split('?')[0]
    // A stale browser cookie must not turn public health probes into auth failures.
    if (sessionIndependentProbePaths.has(rawPath ?? '')) return
    if (loginPaths.has(rawPath ?? '')) return
    const sessionId = parseOperatorSessionCookie(
      request.headers.cookie,
      cookiePolicy
    )
    if (!sessionId) return

    // SPEC 0296 A10: the decision itself lives in `revalidateOperatorSession`, shared with the stream.
    const revalidation = await revalidateOperatorSession(
      { operatorSessionStore, caseAuthority, principalPolicy },
      sessionId
    )
    if (revalidation.status === 'unavailable') {
      sessionStoreFailureByHeaders.add(request.headers)
      if (rawPath === '/v1/session' || rawPath === '/v1/session/logout') return
      // SPEC 0296 (07 P3): the event stream answers an outage in band, so an EventSource retries
      if (request.routeOptions.url === SESSION_STREAM_ROUTE) return
      reply.code(503).header('cache-control', 'no-store')
      return reply.send(
        fail(
          'configuration_error',
          revalidation.source === 'store'
            ? 'Operator session store is unavailable'
            : 'Operator principal is unavailable',
          createCorrelationId()
        )
      )
    }

    if (revalidation.status === 'valid') {
      sessionIdentityByHeaders.set(
        request.headers,
        revalidation.record.identity
      )
      sessionRecordByHeaders.set(request.headers, revalidation.record)
      return
    }

    if (rawPath === '/v1/session' || rawPath === '/v1/session/logout') return

    sessionIdentityByHeaders.set(request.headers, null)
    reply
      .code(401)
      .header('cache-control', 'no-store')
      .header('set-cookie', clearOperatorSessionCookie(cookiePolicy))
    return reply.send(
      fail(
        'unauthorized',
        'Operator session is missing or expired',
        createCorrelationId()
      )
    )
  })
}
