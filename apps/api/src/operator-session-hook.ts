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
import {
  assertSessionBinding,
  SessionBindingError
} from './operator-session-binding.ts'
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

    let record: OperatorSessionRecord | null = null
    try {
      record = await operatorSessionStore.get(sessionId)
    } catch {
      sessionStoreFailureByHeaders.add(request.headers)
      if (rawPath === '/v1/session' || rawPath === '/v1/session/logout') return
      reply.code(503).header('cache-control', 'no-store')
      return reply.send(
        fail(
          'configuration_error',
          'Operator session store is unavailable',
          createCorrelationId()
        )
      )
    }

    if (record && record.expiresAt > Date.now()) {
      // SPEC 0262 §3: the cookie binds the principal revision it was issued
      // under. A stale binding is a 401 that retires the cookie; an outage is
      // a 503 that keeps it. Neither ever falls back to the session alone.
      try {
        await assertSessionBinding(caseAuthority, principalPolicy, record)
      } catch (error) {
        const status = error instanceof SessionBindingError ? error.status : 503
        if (status === 503) {
          sessionStoreFailureByHeaders.add(request.headers)
          if (rawPath === '/v1/session' || rawPath === '/v1/session/logout') {
            return
          }
          reply.code(503).header('cache-control', 'no-store')
          return reply.send(
            fail(
              'configuration_error',
              'Operator principal is unavailable',
              createCorrelationId()
            )
          )
        }
        record = null
      }
    }

    if (record && record.expiresAt > Date.now()) {
      sessionIdentityByHeaders.set(request.headers, record.identity)
      sessionRecordByHeaders.set(request.headers, record)
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
