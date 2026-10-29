/**
 * SPEC0254 §4.3 and §4.7 — OIDC login routes and the request guards of the
 * OIDC mode (HMAC token refusal and CSRF by exact `Origin`). Installed only
 * when `buildServer` composes `operatorLogin`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createCorrelationId, fail, ok } from '@cvg/shared'
import type { CaseAuthorityPort, CasePrincipalRecord } from '@cvg/persistence'
import {
  assertSessionBinding,
  SessionBindingError
} from './operator-session-binding.ts'
import {
  PrincipalProducerError,
  produceVerifiedPrincipal
} from './case-principal-producer.ts'
import { normalizeOrigin } from './http-security.ts'
import {
  OidcIdpUnavailableError,
  type OidcOperatorAuthority
} from './oidc-authority.ts'
import { OIDC_CALLBACK_PATH } from './oidc-config.ts'
import {
  mapVerifiedOidcIdentity,
  OidcLoginRefusal,
  type MappedOidcIdentity,
  type OidcLoginReasonCode
} from './oidc-identity.ts'
import {
  OidcLoginStateUnavailableError,
  type OidcLoginStateStore,
  type PendingOidcLogin
} from './oidc-login-transaction.ts'
import {
  clearOperatorSessionCookie,
  hasExactOperatorSessionCookie,
  HOST_OPERATOR_SESSION_COOKIE,
  OPERATOR_SESSION_COOKIE,
  parseOperatorSessionCookie,
  serializeOperatorSessionCookie,
  type OperatorCookiePolicy,
  type OperatorSessionRecord,
  type OperatorSessionStore
} from './operator-session.ts'
import type { RateLimiterPort } from './rate-limit.ts'
import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'

export const OIDC_START_ROUTE = '/v1/auth/oidc/start'
export const OIDC_CALLBACK_ROUTE = OIDC_CALLBACK_PATH
const CALLBACK_TARGET_LIMIT_BYTES = 4_096
const TOKEN_HEADER = 'x-cvg-operator-token'
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const PROBE_PATHS = new Set([
  healthRoute,
  liveRoute,
  readyRoute,
  '/health/metrics'
])
const START_LIMIT = { max: 10, windowMs: 60_000 }
const CALLBACK_LIMIT = { max: 30, windowMs: 60_000 }
const OPERATOR_SESSION_COOKIE_NAMES = new Set([
  OPERATOR_SESSION_COOKIE,
  HOST_OPERATOR_SESSION_COOKIE
])

/** SPEC0259 §4.5 (DB1): the only two failure fragments of the landing. */
export type OperatorLoginLanding = 'negado' | 'indisponivel'

/** `BuildServerOptions.operatorLogin` (SPEC0254 §4.8). */
export interface OperatorLoginComposition {
  readonly kind: 'oidc'
  readonly authorityVersion: string
  readonly consoleOrigin: string
  readonly authority: OidcOperatorAuthority
  readonly stateStore: OidcLoginStateStore
}

export interface OperatorLoginLogEntry {
  readonly event: 'operator_login.start' | 'operator_login.callback'
  readonly route: string
  readonly step: string
  readonly status: 'ok' | 'error'
  readonly reasonCode?: OidcLoginReasonCode
  readonly correlationId: string
}

export interface OperatorLoginRouteDependencies {
  readonly login: OperatorLoginComposition
  readonly sessionStore: OperatorSessionStore
  readonly caseAuthority: Pick<
    CaseAuthorityPort,
    'readSnapshot' | 'applyVerifiedPrincipalState'
  >
  readonly rateLimiter: RateLimiterPort
  /** SPEC0259 §4.3: the operational cookie profile of the server. */
  readonly cookiePolicy: OperatorCookiePolicy
  readonly log: (entry: OperatorLoginLogEntry) => void
}

/**
 * Either operational cookie name (legacy or `__Host-`, SPEC0259 §4.3), cut
 * more widely than the exact parser: segments by `;` and `,` (how `inject`
 * joins an array header), name before the first `=`, JavaScript `trim()`,
 * any value, every element of an array header. The guard may see more
 * cookies than the parser, never fewer.
 */
export function hasOperatorSessionCookieName(value: unknown): boolean {
  const headers = Array.isArray(value) ? value : [value]
  return headers.some(
    (header) =>
      typeof header === 'string' &&
      header
        .split(/[;,]/)
        .some((segment) =>
          OPERATOR_SESSION_COOKIE_NAMES.has(segment.split('=')[0]?.trim() ?? '')
        )
  )
}

function isConsoleOrigin(value: unknown, consoleOrigin: string): boolean {
  if (typeof value !== 'string') return false
  try {
    return normalizeOrigin(value) === consoleOrigin
  } catch {
    return false
  }
}

/** §4.7 — installed after the HTTP hook and before the session hook. */
export function installOperatorLoginGuards(
  app: FastifyInstance,
  options: { consoleOrigin: string }
): void {
  app.addHook('onRequest', async (request, reply) => {
    const rawPath = request.url.split('?')[0] ?? ''
    if (PROBE_PATHS.has(rawPath)) return
    if (request.headers[TOKEN_HEADER] === undefined) return
    reply.code(401).header('cache-control', 'no-store')
    return reply.send(
      fail(
        'unauthorized',
        'Bootstrap tokens are disabled',
        createCorrelationId()
      )
    )
  })
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return
    if (!hasOperatorSessionCookieName(request.headers.cookie)) return
    if (isConsoleOrigin(request.headers.origin, options.consoleOrigin)) return
    reply.code(403).header('cache-control', 'no-store')
    return reply.send(
      fail('forbidden', 'Origin is not allowed', createCorrelationId())
    )
  })
}

interface CallbackParameters {
  readonly state: string
  readonly code?: string
  readonly error?: string
}

/** §4.3 step 2: exact path, bounded target, single state and code xor error. */
function readCallbackParameters(
  rawUrl: string | undefined
): CallbackParameters | null {
  if (
    typeof rawUrl !== 'string' ||
    Buffer.byteLength(rawUrl, 'utf8') > CALLBACK_TARGET_LIMIT_BYTES
  ) {
    return null
  }
  const separator = rawUrl.indexOf('?')
  const path = separator === -1 ? rawUrl : rawUrl.slice(0, separator)
  if (path !== OIDC_CALLBACK_ROUTE) return null
  const query = new URLSearchParams(
    separator === -1 ? '' : rawUrl.slice(separator + 1)
  )
  const states = query.getAll('state')
  const codes = query.getAll('code')
  const errors = query.getAll('error')
  if (states.length !== 1 || !states[0]) return null
  if (codes.length + errors.length !== 1) return null
  if (codes.length === 1) {
    return codes[0] ? { state: states[0], code: codes[0] } : null
  }
  return { state: states[0], error: errors[0]! }
}

/** HTTP class of an unexpected callback failure; 500 when it has none. */
function failureStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const { statusCode, status } = error as {
      statusCode?: unknown
      status?: unknown
    }
    if (typeof statusCode === 'number') return statusCode
    if (typeof status === 'number') return status
  }
  return 500
}

function isEmptyBody(body: unknown): boolean {
  return (
    body === undefined ||
    (typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      Object.keys(body).length === 0)
  )
}

export function registerOperatorLoginRoutes(
  app: FastifyInstance,
  deps: OperatorLoginRouteDependencies
): void {
  const { login } = deps
  const scoped = new Set([
    `POST ${OIDC_START_ROUTE}`,
    `GET ${OIDC_CALLBACK_ROUTE}`
  ])
  // Every answer of the two routes is `no-store`, including the ones given
  // by global hooks before the handler.
  app.addHook('onSend', async (request, reply, payload) => {
    if (scoped.has(`${request.method} ${request.routeOptions.url}`)) {
      reply.header('cache-control', 'no-store')
    }
    return payload
  })

  const unavailable = (
    reply: FastifyReply,
    correlationId: string,
    message = 'Operator login is temporarily unavailable'
  ) => {
    reply.code(503)
    return fail('configuration_error', message, correlationId)
  }

  // Step 2 runs before the body is parsed: no state, cookie or body is read.
  const requireConsoleOrigin = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    if (isConsoleOrigin(request.headers.origin, login.consoleOrigin)) return
    const correlationId = createCorrelationId()
    deps.log({
      event: 'operator_login.start',
      route: OIDC_START_ROUTE,
      step: 'origin',
      status: 'error',
      reasonCode: 'origin_invalid',
      correlationId
    })
    reply.code(403).header('cache-control', 'no-store')
    return reply.send(
      fail('forbidden', 'Operator login origin is invalid', correlationId)
    )
  }

  app.post(
    OIDC_START_ROUTE,
    { onRequest: requireConsoleOrigin },
    async (request, reply) => {
      const correlationId = createCorrelationId()
      const log = (
        step: string,
        status: 'ok' | 'error',
        reasonCode?: OidcLoginReasonCode
      ) =>
        deps.log({
          event: 'operator_login.start',
          route: OIDC_START_ROUTE,
          step,
          status,
          ...(reasonCode ? { reasonCode } : {}),
          correlationId
        })
      if (!isEmptyBody(request.body)) {
        reply.code(400)
        return fail(
          'validation_failed',
          'Operator login start takes no body',
          correlationId
        )
      }
      let limit
      try {
        limit = await deps.rateLimiter.check(
          `oidc:start:ip:${request.ip}`,
          START_LIMIT
        )
      } catch {
        log('rate_limit', 'error', 'rate_limited')
        return unavailable(reply, correlationId)
      }
      if (!limit.allowed) {
        log('rate_limit', 'error', 'rate_limited')
        reply.code(429).header('retry-after', String(limit.retryAfterSeconds))
        return fail(
          'rate_limited',
          'Request rate limit exceeded. Retry later.',
          correlationId
        )
      }
      // Step 5: only a single valid cookie of a live session is carried.
      const cookies: string[] = []
      let previousSessionId: string | undefined
      if (
        hasExactOperatorSessionCookie(request.headers.cookie, deps.cookiePolicy)
      ) {
        const sessionId = parseOperatorSessionCookie(
          request.headers.cookie,
          deps.cookiePolicy
        )
        let record: OperatorSessionRecord | null = null
        if (sessionId) {
          try {
            record = await deps.sessionStore.get(sessionId)
          } catch {
            log('session', 'error', 'session_unavailable')
            return unavailable(reply, correlationId)
          }
        }
        if (sessionId && record && record.expiresAt > Date.now()) {
          previousSessionId = sessionId
        } else {
          cookies.push(clearOperatorSessionCookie(deps.cookiePolicy))
        }
      }
      let started
      try {
        started = await login.authority.start({
          stateStore: login.stateStore,
          ...(previousSessionId !== undefined ? { previousSessionId } : {})
        })
      } catch {
        log('state', 'error', 'state_unavailable')
        return unavailable(reply, correlationId)
      }
      log('start', 'ok')
      reply.header('set-cookie', [started.setCookie, ...cookies])
      return ok({ authorizationUrl: started.authorizationUrl }, correlationId)
    }
  )

  app.get(
    OIDC_CALLBACK_ROUTE,
    { exposeHeadRoute: false },
    async (request, reply) => {
      const correlationId = createCorrelationId()
      const log = (
        step: string,
        status: 'ok' | 'error',
        reasonCode?: OidcLoginReasonCode
      ) =>
        deps.log({
          event: 'operator_login.callback',
          route: OIDC_CALLBACK_ROUTE,
          step,
          status,
          ...(reasonCode ? { reasonCode } : {}),
          correlationId
        })
      // SPEC0259 §4.5: the callback is a top-level navigation, so every
      // answer of the handler goes back to the fixed console origin. The
      // fragment carries only the category; the reason goes to the log.
      const land = (outcome: OperatorLoginLanding, setCookie?: string) => {
        reply
          .code(303)
          .header('location', `${login.consoleOrigin}/#cvg-login=${outcome}`)
        if (setCookie !== undefined) reply.header('set-cookie', setCookie)
        return reply.send()
      }
      // I8: the default exit below clears the pending cookie only from step
      // 2 on, and never on the state-store outage of step 3.
      let clearPendingOnFailure = false
      try {
        // Step 1: answers before step 2 never touch the pending cookie (I8).
        let limit
        try {
          limit = await deps.rateLimiter.check(
            `oidc:callback:ip:${request.ip}`,
            CALLBACK_LIMIT
          )
        } catch {
          log('rate_limit', 'error', 'rate_limited')
          return land('indisponivel')
        }
        if (!limit.allowed) {
          log('rate_limit', 'error', 'rate_limited')
          return land('indisponivel')
        }
        clearPendingOnFailure = true
        const clearPending = login.authority.clearPendingCookie()
        // One landing for every refusal; the reason goes only to the log (M21).
        const refuse = (step: string, reasonCode: OidcLoginReasonCode) => {
          log(step, 'error', reasonCode)
          return land('negado', clearPending)
        }
        const outage = (step: string, reasonCode: OidcLoginReasonCode) => {
          log(step, 'error', reasonCode)
          return land('indisponivel', clearPending)
        }

        // Step 2.
        const parameters = readCallbackParameters(request.raw.url)
        if (!parameters) return refuse('parameters', 'state_invalid')

        // Step 3: the state is consumed before any call to the token endpoint.
        let pending: PendingOidcLogin
        try {
          pending = await login.authority.readCallback({
            cookieHeader: request.headers.cookie,
            state: parameters.state,
            stateStore: login.stateStore
          })
        } catch (error) {
          if (error instanceof OidcLoginStateUnavailableError) {
            // The pending cookie stays: the operator can retry the same callback.
            clearPendingOnFailure = false
            log('state', 'error', 'state_unavailable')
            return land('indisponivel')
          }
          return refuse('state', 'state_invalid')
        }

        // Step 4.
        if (parameters.code === undefined) return refuse('idp', 'idp_error')

        // Step 5.
        let claims: Record<string, unknown>
        try {
          claims = await login.authority.complete({
            code: parameters.code,
            state: parameters.state,
            pending
          })
        } catch (error) {
          return error instanceof OidcIdpUnavailableError
            ? outage('token', 'idp_unavailable')
            : refuse('token', 'token_rejected')
        }

        // Step 6.
        let mapped: MappedOidcIdentity
        try {
          mapped = mapVerifiedOidcIdentity(
            claims,
            login.authority.identityPolicy
          )
        } catch (error) {
          return refuse(
            'claims',
            error instanceof OidcLoginRefusal
              ? error.reasonCode
              : 'token_rejected'
          )
        }

        // Step 7: the principal is current BEFORE the session exists (I2).
        let principal: CasePrincipalRecord
        try {
          principal = await produceVerifiedPrincipal(deps.caseAuthority, {
            tenantId: mapped.identity.tenantId,
            operatorId: mapped.identity.operatorId,
            role: mapped.identity.role,
            entryActive: mapped.active,
            authorityVersion: login.authorityVersion,
            proofRef: mapped.proofRef
          })
        } catch (error) {
          if (error instanceof PrincipalProducerError && error.status === 401) {
            return refuse('principal', error.reasonCode)
          }
          return outage(
            'principal',
            error instanceof PrincipalProducerError
              ? error.reasonCode
              : 'principal_unavailable'
          )
        }
        if (!mapped.active) return refuse('principal', 'inactive_group')

        // Step 8: every login starts a new family; a live previous session of
        // this browser is retired in the same unit (D7).
        const next = {
          identity: mapped.identity,
          expiresAt: mapped.expiresAt,
          principalRevision: principal.revision
        }
        let record: OperatorSessionRecord
        try {
          const previous = pending.previousSessionId
          if (previous !== undefined && deps.sessionStore.switchIdentity) {
            record = await deps.sessionStore.switchIdentity(previous, next)
          } else if (previous !== undefined) {
            // Stores without an atomic switch (the in-memory test store).
            await deps.sessionStore.revoke(previous)
            record = await deps.sessionStore.create(next)
          } else {
            record = await deps.sessionStore.create(next)
          }
        } catch {
          return outage('session', 'session_unavailable')
        }

        // SPEC 0262 §6.2: re-read the principal before any Set-Cookie. If its
        // revision, role, active or version moved meanwhile, the new family
        // is retired and no cookie is emitted (never a knowingly stale one).
        try {
          await assertSessionBinding(
            deps.caseAuthority,
            {
              identityMode: 'trusted',
              authorityVersion: login.authorityVersion
            },
            record
          )
        } catch (error) {
          try {
            await deps.sessionStore.revoke(record.sessionId)
          } catch {
            // The unannounced family is retained without a token; no cookie.
            return outage('session', 'session_unavailable')
          }
          if (error instanceof SessionBindingError && error.status === 401) {
            return refuse('principal', 'principal_drift')
          }
          return outage('principal', 'principal_unavailable')
        }

        // Step 9.
        log('session', 'ok')
        reply
          .code(303)
          .header('location', `${login.consoleOrigin}/`)
          .header('set-cookie', [
            serializeOperatorSessionCookie(record, deps.cookiePolicy),
            clearPending
          ])
        return reply.send()
      } catch (error) {
        // SPEC0259 §4.5 default exit (rebase rule with the U04; build note
        // O5): a failure of the handler outside the table lands on the
        // console instead of the global 500 JSON. Class 4xx is "negado",
        // anything else "indisponivel". The pending cookie follows I8
        // (cleared from step 2 on, kept on the state-store outage); no other
        // cookie of this answer survives (never a partial session cookie).
        if (reply.sent) throw error
        reply.removeHeader('set-cookie')
        let clearPending: string | undefined
        if (clearPendingOnFailure) {
          try {
            clearPending = login.authority.clearPendingCookie()
          } catch {
            clearPending = undefined
          }
        }
        const status = failureStatus(error)
        return land(
          status >= 400 && status < 500 ? 'negado' : 'indisponivel',
          clearPending
        )
      }
    }
  )
}
