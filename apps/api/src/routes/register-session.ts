import {
  createCorrelationId,
  fail,
  DomainError,
  ok,
  type OperatorIdentity,
  toSafeError
} from '@cvg/shared'
import {
  TRUSTED_OPERATOR_TOKEN_HEADER,
  decodeTrustedOperatorTokenClaims
} from '../operator-identity.ts'
import {
  readCurrentPrincipal,
  SessionBindingError,
  assertSessionBinding
} from '../operator-session-binding.ts'
import {
  parseOperatorSessionCookie,
  type OperatorSessionRecord,
  serializeOperatorSessionCookie,
  clearOperatorSessionCookie
} from '../operator-session.ts'
import { statusCodeForError } from '../server-query.ts'
import { registerOperatorLoginRoutes } from '../oidc-routes.ts'
import { safeTelemetry } from '../server-capability.ts'
import type { RouteContext } from './context.ts'

export function registerSessionRoutes(ctx: RouteContext): void {
  const {
    app,
    caseAuthority,
    identityMode,
    operatorCookiePolicy,
    operatorIdentityResolver,
    options,
    principalPolicy,
    rateLimiter,
    sessionRecordByHeaders,
    sessionStoreFailureByHeaders,
    telemetry,
    trustedOperatorIdentityResolver
  } = ctx

  app.get('/v1/session', async (request, reply) => {
    const correlationId = createCorrelationId()
    reply.header('cache-control', 'no-store')
    try {
      if (
        identityMode !== 'trusted' ||
        !options.operatorSessionStore ||
        !trustedOperatorIdentityResolver
      ) {
        reply.code(503)
        return fail(
          'configuration_error',
          'Trusted operator session bootstrap is unavailable',
          correlationId
        )
      }

      if (sessionStoreFailureByHeaders.has(request.headers)) {
        reply.code(503)
        return fail(
          'configuration_error',
          'Operator session store is unavailable',
          correlationId
        )
      }

      const existing = sessionRecordByHeaders.get(request.headers)
      if (options.operatorLogin) {
        // SPEC0254 §4.6: the OIDC mode only restores by cookie; the session
        // is created by the callback, never here.
        if (!existing) {
          throw new DomainError(
            'unauthorized',
            'Operator session is missing or expired'
          )
        }
        return ok(
          {
            identity: existing.identity,
            expiresAt: new Date(existing.expiresAt).toISOString()
          },
          correlationId
        )
      }
      const rawToken = request.headers[TRUSTED_OPERATOR_TOKEN_HEADER]
      const hasBootstrapToken =
        typeof rawToken === 'string' && rawToken.trim().length > 0
      if (existing && !hasBootstrapToken) {
        return ok(
          {
            identity: existing.identity,
            expiresAt: new Date(existing.expiresAt).toISOString()
          },
          correlationId
        )
      }

      let identity: OperatorIdentity
      try {
        identity = (
          existing && hasBootstrapToken
            ? trustedOperatorIdentityResolver
            : operatorIdentityResolver
        )!(request.headers)
      } catch (error) {
        if (error instanceof DomainError) throw error
        throw new DomainError(
          'unauthorized',
          'A valid trusted bootstrap token is required'
        )
      }
      const claims = decodeTrustedOperatorTokenClaims(rawToken)
      if (!claims) {
        throw new DomainError(
          'unauthorized',
          'A valid trusted bootstrap token is required'
        )
      }
      // Rotation keeps the session family (SPEC 0144, AUD-0601 F02): logout
      // with any digest of the lineage then revokes every successor.
      // SPEC 0262 §3: the cookie binds the principal revision read now, from
      // the data plane. A missing/inactive principal is a 401, an outage a 503.
      let principalRevision: number
      try {
        principalRevision = (
          await readCurrentPrincipal(caseAuthority, principalPolicy, identity)
        ).revision
      } catch (error) {
        if (error instanceof SessionBindingError && error.status === 401) {
          throw new DomainError(
            'unauthorized',
            'Operator principal is not current; sign in again'
          )
        }
        throw new DomainError(
          'configuration_error',
          'Operator principal is unavailable'
        )
      }
      const sameOperator =
        existing !== undefined &&
        existing.identity.tenantId === identity.tenantId &&
        existing.identity.operatorId === identity.operatorId &&
        existing.identity.role === identity.role &&
        // A moved revision is a new family (switchIdentity), never a rotation.
        existing.principalRevision === principalRevision
      const rotate =
        sameOperator && options.operatorSessionStore.replace !== undefined
      // Any other presented cookie — another identity, or a rotated/stale
      // digest whose lineage lives on in a successor — retires its whole
      // family in the same transaction that creates the new session, so a
      // failure in either step changes nothing (AUD-0603 F01/F02).
      const presentedSessionId = parseOperatorSessionCookie(
        request.headers.cookie,
        operatorCookiePolicy
      )
      const retireLineage = !rotate && presentedSessionId !== null
      const next = {
        identity,
        expiresAt: Number(claims.exp) * 1000,
        principalRevision
      }
      const store = options.operatorSessionStore
      let record: OperatorSessionRecord
      try {
        if (rotate && existing) {
          record = await store.replace!(existing.sessionId, next)
        } else if (retireLineage && store.switchIdentity) {
          record = await store.switchIdentity(presentedSessionId, next)
        } else if (retireLineage) {
          // Stores without an atomic switch (the in-memory test store).
          await store.revoke(presentedSessionId)
          record = await store.create(next)
        } else {
          record = await store.create(next)
        }
      } catch {
        // Nothing committed: the previous cookie stays as it was.
        reply.code(503)
        return fail(
          'configuration_error',
          'Operator session store is unavailable',
          correlationId
        )
      }
      // SPEC 0262 §6.2: re-read the principal before Set-Cookie; a moved
      // revision retires the family just created and no cookie is emitted.
      try {
        await assertSessionBinding(caseAuthority, principalPolicy, record)
      } catch (error) {
        try {
          await store.revoke(record.sessionId)
        } catch {
          // The family without a disclosed token is retained; no cookie.
        }
        if (error instanceof SessionBindingError && error.status === 401) {
          throw new DomainError(
            'unauthorized',
            'Operator principal is not current; sign in again'
          )
        }
        reply.code(503)
        return fail(
          'configuration_error',
          'Operator principal is unavailable',
          correlationId
        )
      }
      // Set-Cookie only after the durable change committed.
      reply.header(
        'set-cookie',
        serializeOperatorSessionCookie(record, operatorCookiePolicy)
      )
      return ok(
        {
          identity: record.identity,
          expiresAt: new Date(record.expiresAt).toISOString()
        },
        correlationId
      )
    } catch (error) {
      reply.header(
        'set-cookie',
        clearOperatorSessionCookie(operatorCookiePolicy)
      )
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/session/logout', async (request, reply) => {
    const correlationId = createCorrelationId()
    reply.header('cache-control', 'no-store')
    try {
      const sessionId = parseOperatorSessionCookie(
        request.headers.cookie,
        operatorCookiePolicy
      )
      if (sessionId && options.operatorSessionStore) {
        await options.operatorSessionStore.revoke(sessionId)
      }
      // The cookie is cleared only after the revocation committed; a failed
      // revocation keeps it so the operator can retry (AUD-0601 F03).
      reply.header(
        'set-cookie',
        clearOperatorSessionCookie(operatorCookiePolicy)
      )
      return ok({ loggedOut: true }, correlationId)
    } catch {
      reply.code(503)
      return fail(
        'configuration_error',
        'Operator session could not be revoked',
        correlationId
      )
    }
  })

  if (options.operatorLogin && options.operatorSessionStore) {
    registerOperatorLoginRoutes(app, {
      login: options.operatorLogin,
      sessionStore: options.operatorSessionStore,
      caseAuthority,
      rateLimiter,
      cookiePolicy: operatorCookiePolicy,
      log: (entry) => {
        safeTelemetry(() =>
          telemetry.log(entry.status === 'ok' ? 'info' : 'warn', entry.event, {
            correlationId: entry.correlationId,
            route: entry.route,
            step: entry.step,
            status: entry.status,
            ...(entry.reasonCode ? { reasonCode: entry.reasonCode } : {})
          })
        )
        options.runtimeLogger?.({
          event: entry.event,
          correlationId: entry.correlationId,
          route: entry.route,
          status: entry.status,
          ...(entry.reasonCode ? { errorCode: entry.reasonCode } : {})
        })
      }
    })
  }
  if (options.operatorLogin) {
    // SPEC0259 §4.4 (J7): in the OIDC mode every /v1/** answer is
    // `private, no-store`, including hook, error-handler and 303 answers.
    // Registered after the `onSend` hooks that set the plain `no-store`.
    app.addHook('onSend', async (request, reply, payload) => {
      if (request.url.startsWith('/v1/')) {
        reply.header('cache-control', 'private, no-store')
      }
      return payload
    })
  }
}
