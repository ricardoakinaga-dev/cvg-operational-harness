import type { FastifyInstance } from 'fastify'
import { createCorrelationId, fail, type OperatorIdentity } from '@cvg/shared'
import {
  clearOperatorSessionCookie,
  parseOperatorSessionCookie,
  type OperatorSessionRecord,
  type OperatorSessionStore
} from './operator-session.ts'

export interface OperatorSessionHookOptions {
  app: FastifyInstance
  enforceHttps: boolean
  operatorSessionStore: OperatorSessionStore
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
    enforceHttps,
    operatorSessionStore,
    sessionIdentityByHeaders,
    sessionRecordByHeaders,
    sessionStoreFailureByHeaders
  } = options

  app.addHook('onRequest', async (request, reply) => {
    const rawPath = request.url.split('?')[0]
    const sessionId = parseOperatorSessionCookie(request.headers.cookie)
    if (!sessionId) return

    let record: OperatorSessionRecord | null = null
    try {
      record = await operatorSessionStore.get(sessionId)
    } catch {
      sessionStoreFailureByHeaders.add(request.headers)
      if (rawPath === '/v1/session' || rawPath === '/v1/session/logout') return
      reply
        .code(503)
        .header('cache-control', 'no-store')
        .header('set-cookie', clearOperatorSessionCookie(enforceHttps))
      return reply.send(
        fail(
          'configuration_error',
          'Operator session store is unavailable',
          createCorrelationId()
        )
      )
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
      .header('set-cookie', clearOperatorSessionCookie(enforceHttps))
    return reply.send(
      fail(
        'unauthorized',
        'Operator session is missing or expired',
        createCorrelationId()
      )
    )
  })
}
