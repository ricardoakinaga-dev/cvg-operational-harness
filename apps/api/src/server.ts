import { performance } from 'node:perf_hooks'
import Fastify from 'fastify'
import {
  createCorrelationId,
  createRealCapabilityGuards,
  describeRealCapabilityGuards,
  DomainError,
  fail,
  IDENTITY_MODE_ENV,
  parseIdentityMode,
  toSafeError,
  type OperatorIdentity
} from '@cvg/shared'
import {
  assertComposedKnowledgeResolver,
  createControlledCapabilityGateway,
  InMemoryControlPlaneStore,
  type AgentId,
  type TenantId
} from '@cvg/platform'
import {
  ensureControlledSecretaryPreset,
  registerSecretaryJourneyRoutes
} from './legacy-composition.ts'
import {
  DurableApprovalEngineAdapter,
  PostgresRuntimeApprovalDecision,
  PostgresAuthorizedWrites,
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  PostgresControlPlaneRepository,
  TenantScopedPostgresControlPlaneRepository,
  runPostgresMigrations,
  InMemoryCaseAuthority,
  PostgresCaseAuthority,
  type CaseAuthorityPort
} from '@cvg/persistence'
import { CompositeTelemetry } from '@cvg/observability'
import { createInMemoryOperationalExecutionStore } from '@cvg/harness'
import {
  installHttpSecurityHooks,
  normalizeHttpSecurityOptions,
  parseHttpSecurityEnv
} from './http-security.ts'
import {
  createConfiguredRateLimitKeyRing,
  InMemoryRateLimiter,
  PostgresRateLimiter,
  type RateLimiterPort
} from './rate-limit.ts'
import {
  decodeTrustedOperatorTokenClaims,
  TRUSTED_OPERATOR_TOKEN_HEADER
} from './operator-identity.ts'
import {
  createInMemoryOperatorSessionStore,
  parseOperatorSessionCookie,
  type OperatorCookiePolicy,
  type OperatorSessionRecord
} from './operator-session.ts'
import { installOperatorSessionHook } from './operator-session-hook.ts'
import { revalidateOperatorSession } from './operator-session-revalidation.ts'
import { installSessionEventStream } from './session-event-stream.ts'
import {
  installOperatorPrincipalGuard,
  recordRegisteredRoutes
} from './operator-principal-guard.ts'
import { type RegisteredRoute } from './operator-route-class.ts'
import { parseOperatorLoginConfig } from './oidc-config.ts'
import { installOperatorLoginGuards } from './oidc-routes.ts'
import {
  authorizeCaseMutation,
  mapCaseMutationError,
  registerCaseAuthorizationRoutes,
  runAuthorizedCaseMutation,
  type CaseRouteDependencies,
  type SafeCaseError
} from './case-authorization/case-routes.ts'
import { ControlledRequestMetrics } from './request-metrics.ts'
import { installResponseCorrelationHook } from './response-correlation.ts'
import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'
import { type ReadinessProbe } from './readiness.ts'
import {
  classifyHttpRequestError,
  createInvalidJsonBodyError,
  HTTP_REQUEST_BODY_LIMIT_BYTES
} from './http-request-boundary.ts'
import {
  classifyHttpRequestTarget,
  HTTP_REQUEST_MAX_PARAM_LENGTH
} from './http-target-boundary.ts'
import { PAGINATION_OFFSET_ERROR_MESSAGE } from './pagination-boundary.ts'
import {
  PostgresWebhookReplayStore,
  type WebhookReplayStore
} from './webhook-security.ts'
import {
  assertApprovalDecisionAuditDedupe,
  assertCaseAuthorizationSchema,
  assertMigrationOwnerFromCatalog,
  assertMigrationRoleIsLeastPrivilege,
  assertMigrationRoleSecurityBoundary,
  assertRateLimitSchema,
  assertRuntimeRoleIsLeastPrivilege,
  assertRuntimeRoleIsNotRlsBypass,
  assertTenantIsolationMigrationState,
  assertTenantIsolationSchema,
  assertWebhookReplaySchema,
  readCurrentDatabaseRole
} from './tenant-preflight.ts'
import {
  BuildServerFromEnvOptions,
  BuildServerOptions,
  RuntimeLogEntry,
  WebhookVerifier
} from './server-options.ts'
import {
  createCapabilityApprovalAuthority,
  createOperationalApprovalAuthority,
  httpStatusBucket,
  safeTelemetry,
  serverCapabilityActorAuthorizer,
  withDefaultCapabilityGateway,
  withDefaultKnowledgeResolver
} from './server-capability.ts'
import {
  createConfiguredInboundAgentRuntime,
  createConfiguredInboundTenantResolver,
  createConfiguredWebhookVerifier,
  withDefaultInboundCompletion
} from './server-inbound.ts'
import {
  assertOperatorLoginComposition,
  assertPrincipalVersionsCurrent,
  createEffectiveOperatorIdentityResolver,
  createSessionAwareOperatorIdentityResolver,
  requireAnyOperatorPermission,
  requireOperatorIdentity,
  resolveDataPlaneTenant,
  resolveOptionalRequestTenant
} from './server-identity.ts'
import { parsePagination, statusCodeForError } from './server-query.ts'
import {
  RuntimePersistence,
  assertSafeRuntimeSchemaName,
  createPersistence,
  createPostgresPool,
  createReadinessDatabaseProbe
} from './server-persistence.ts'
import { registerHealthRoutes } from './routes/register-health.ts'
import { registerSessionRoutes } from './routes/register-session.ts'
import { registerExecutionsRoutes } from './routes/register-executions.ts'
import { registerWebhooksRoutes } from './routes/register-webhooks.ts'
import { registerTakeoverRoutes } from './routes/register-takeover.ts'
import { registerTasksRoutes } from './routes/register-tasks.ts'
import { registerApprovalsRoutes } from './routes/register-approvals.ts'
import { registerCapabilityApprovalsRoutes } from './routes/register-capability-approvals.ts'
import { registerObservabilityRoutes } from './routes/register-observability.ts'
import { registerCatalogRoutes } from './routes/register-catalog.ts'
import { registerReleaseCandidatesRoutes } from './routes/register-release-candidates.ts'
import { registerAgentsRoutes } from './routes/register-agents.ts'
import {
  registerExecutionTraceRoutes,
  registerTestLabRoutes
} from './routes/register-test-lab.ts'
import {
  assertTestLabBootstrap,
  createConfiguredTestLab
} from './test-lab-composition.ts'
import type { RouteContext } from './routes/context.ts'
export type {
  RuntimeLogEntry,
  WebhookVerification,
  WebhookVerifier,
  InboundRuntimeCompletion,
  InboundTenantResolver,
  AgentRuntimeOptions,
  BuildServerOptions,
  BuildServerFromEnvOptions
} from './server-options.ts'

export type { OperatorIdentityResolver } from '@cvg/shared'

export function buildServer(options: BuildServerOptions = {}) {
  // SPEC 0317 G4: refuses forbidden capabilities in every composition path.
  const realCapabilities = createRealCapabilityGuards({ env: process.env })
  const testLab = assertTestLabBootstrap(process.env, options.testLab)
  for (const resolver of [
    options.resolveApprovedKnowledge,
    options.agentRuntime?.resolveApprovedKnowledge
  ]) {
    if (resolver) {
      assertComposedKnowledgeResolver(resolver, realCapabilities.rag)
    }
  }
  const identityMode =
    options.identityMode === undefined
      ? parseIdentityMode(process.env[IDENTITY_MODE_ENV], process.env.NODE_ENV)
      : parseIdentityMode(options.identityMode, process.env.NODE_ENV)
  if (process.env.NODE_ENV === 'production' && identityMode === 'simulation') {
    throw new Error(
      'Production requires trusted operator identity mode; simulation is forbidden'
    )
  }
  if (identityMode === 'simulation' && process.env.NODE_ENV !== 'test') {
    throw new Error(
      'Simulation identity mode requires the explicit controlled test profile'
    )
  }
  assertOperatorLoginComposition(options, identityMode)
  const trustedOperatorIdentityResolver =
    createEffectiveOperatorIdentityResolver(
      identityMode,
      options.operatorIdentityResolver
    )
  const sessionIdentityByHeaders = new WeakMap<
    object,
    OperatorIdentity | null
  >()
  const sessionRecordByHeaders = new WeakMap<object, OperatorSessionRecord>()
  const sessionStoreFailureByHeaders = new WeakSet<object>()
  const operatorIdentityResolver = createSessionAwareOperatorIdentityResolver(
    trustedOperatorIdentityResolver,
    options.operatorSessionStore,
    sessionIdentityByHeaders,
    identityMode === 'trusted'
  )
  if (
    process.env.NODE_ENV !== 'test' &&
    options.persistence?.kind === 'postgres'
  ) {
    throw new Error(
      'Production PostgreSQL requires a tenant-scoped pool and startup preflight'
    )
  }
  const persistence = createPersistence(
    options.persistence,
    options.journeyRepository
  )
  const caseAuthority: CaseAuthorityPort =
    options.caseAuthority ??
    (options.persistence?.kind === 'postgres'
      ? new PostgresCaseAuthority(options.persistence.client)
      : options.persistence?.kind === 'postgres-pool'
        ? new PostgresCaseAuthority(options.persistence.pool, {
            mode: 'pool'
          })
        : new InMemoryCaseAuthority(persistence.memoryDb!))
  const operationalExecution =
    options.operationalExecution ??
    (options.persistence?.kind === 'postgres'
      ? new PostgresOperationalExecutionStore(options.persistence.client)
      : options.persistence?.kind === 'postgres-pool'
        ? new PostgresOperationalExecutionStore(options.persistence.pool)
        : createInMemoryOperationalExecutionStore())
  const operationalApprovalAuthority =
    options.operationalApprovalAuthority ??
    createOperationalApprovalAuthority(options.persistence)
  const runtimeApprovalDecision =
    options.persistence?.kind === 'postgres-pool' &&
    operationalApprovalAuthority instanceof PostgresApprovalAuthority &&
    operationalExecution instanceof PostgresOperationalExecutionStore
      ? new PostgresRuntimeApprovalDecision(
          options.persistence.pool,
          operationalApprovalAuthority,
          operationalExecution
        )
      : null
  const operationalApprovals = new DurableApprovalEngineAdapter(
    operationalApprovalAuthority
  )
  const outbox = options.outbox ?? persistence.outbox
  const durableInbound = options.durableInbound ?? false
  const databaseProbe = createReadinessDatabaseProbe(options.persistence)
  const readinessProbes: ReadinessProbe[] = [
    ...(databaseProbe
      ? [{ name: 'database', check: databaseProbe, timeoutMs: 1_000 }]
      : []),
    ...(options.readinessProbes ?? [])
  ]
  if (durableInbound && !outbox) {
    throw new Error('Durable inbound processing requires an outbox adapter')
  }
  if (process.env.NODE_ENV === 'production' && !durableInbound) {
    throw new Error(
      'Production requires durable inbound processing; inline execution is forbidden'
    )
  }
  const capabilityApprovalAuthority = createCapabilityApprovalAuthority(
    options.capabilityApprovalAuthority,
    options.persistence
  )
  const configuredRuntimeWithKnowledge = withDefaultKnowledgeResolver(
    options.agentRuntime,
    options.resolveApprovedKnowledge
  )
  const configuredAgentRuntime = withDefaultCapabilityGateway(
    configuredRuntimeWithKnowledge,
    capabilityApprovalAuthority,
    serverCapabilityActorAuthorizer
  )
  const agentRuntime = withDefaultInboundCompletion(
    configuredAgentRuntime,
    options.persistence
  )
  const platform =
    options.platform ??
    (options.persistence?.kind === 'postgres'
      ? new PostgresControlPlaneRepository(options.persistence.client)
      : options.persistence?.kind === 'postgres-pool'
        ? new TenantScopedPostgresControlPlaneRepository(
            options.persistence.pool
          )
        : new InMemoryControlPlaneStore())
  // SPEC0259 §4.2: credentialed CORS only for the OIDC console origin.
  const httpSecurity = normalizeHttpSecurityOptions({
    ...options.httpSecurity,
    credentialedOrigin: options.operatorLogin?.consoleOrigin ?? null
  })
  // SPEC0259 §4.3: `__Host-` cookies only with the OIDC login over HTTPS; the
  // authority that writes the pending cookie must use the same profile.
  const operatorCookiePolicy: OperatorCookiePolicy =
    options.operatorLogin && httpSecurity.enforceHttps
      ? { profile: 'host-prefixed' }
      : { profile: 'legacy', secure: httpSecurity.enforceHttps }
  if (
    options.operatorLogin &&
    options.operatorLogin.authority.cookieProfile !==
      operatorCookiePolicy.profile
  ) {
    throw new Error(
      'OIDC login cookie profile does not match the server cookie profile'
    )
  }
  const requestMetrics =
    options.requestMetrics ?? new ControlledRequestMetrics()
  const requestMetricsEnabled =
    (process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development') &&
    options.requestMetricsEnabled !== false
  const telemetry = options.telemetry ?? new CompositeTelemetry()
  for (const guard of describeRealCapabilityGuards(realCapabilities)) {
    safeTelemetry(() =>
      telemetry.log('info', 'real_capability.guard', {
        capability: guard.capability,
        state: guard.state,
        reason: guard.reason ?? 'none'
      })
    )
  }
  const requestStartedAt = new WeakMap<object, number>()
  const app = Object.assign(
    Fastify({
      logger: false,
      trustProxy: httpSecurity.trustedProxyAddresses.length
        ? [...httpSecurity.trustedProxyAddresses]
        : false,
      bodyLimit: HTTP_REQUEST_BODY_LIMIT_BYTES,
      routerOptions: { maxParamLength: HTTP_REQUEST_MAX_PARAM_LENGTH },
      // Fastify answers 503 to what arrives while it closes, before any hook; an `EventSource`
      // that gets a 503 stops for good, so the stream route answers in band during the grace
      // (SPEC 0296 A13) and the other routes finish like the requests already in flight.
      return503OnClosing: !options.sessionEventStreams
    }),
    {
      persistence,
      platform,
      requestMetrics,
      operationalExecution,
      operationalApprovalAuthority,
      operationalApprovals,
      telemetry,
      caseAuthority
    }
  )
  // SPEC 0262 §5: the registered inventory (method + template) and its class.
  const routeRegistry: RegisteredRoute[] = []
  recordRegisteredRoutes(app, routeRegistry)
  Object.assign(app, { operatorRouteInventory: routeRegistry })
  app.setErrorHandler((error, _request, reply) => {
    const failure = classifyHttpRequestError(error)
    reply.code(failure.statusCode)
    return reply.send(
      fail(failure.code, failure.message, createCorrelationId())
    )
  })
  app.setNotFoundHandler((request, reply) => {
    const targetFailure = classifyHttpRequestTarget(request.raw.url)
    if (targetFailure) {
      reply.code(targetFailure.statusCode)
      return reply.send(
        fail(targetFailure.code, targetFailure.message, createCorrelationId())
      )
    }

    reply.code(404)
    return reply.send(
      fail('not_found', 'Route not found', createCorrelationId())
    )
  })
  // Named: SPEC0259 §4.2 pins the HTTP hook right after this one.
  app.addHook(
    'onRequest',
    async function requestTargetOnRequest(request, reply) {
      const targetFailure = classifyHttpRequestTarget(request.raw.url)
      if (!targetFailure) return

      reply.code(targetFailure.statusCode)
      return reply.send(
        fail(targetFailure.code, targetFailure.message, createCorrelationId())
      )
    }
  )
  installHttpSecurityHooks(app, httpSecurity)
  installResponseCorrelationHook(app)
  if (options.operatorLogin) {
    // SPEC0254 §4.7: after the HTTP hook, before the session hook.
    installOperatorLoginGuards(app, {
      consoleOrigin: options.operatorLogin.consoleOrigin
    })
  }
  // SPEC 0262: the principal rules shared by the session binding and the case policy.
  const principalPolicy = {
    identityMode,
    authorityVersion:
      options.operatorLogin?.authorityVersion ??
      options.casePrincipalAuthority?.authorityVersion ??
      null
  }
  if (identityMode === 'trusted' && options.operatorSessionStore) {
    installOperatorSessionHook({
      app,
      cookiePolicy: operatorCookiePolicy,
      operatorSessionStore: options.operatorSessionStore,
      caseAuthority,
      principalPolicy,
      sessionIdentityByHeaders,
      sessionRecordByHeaders,
      sessionStoreFailureByHeaders
    })
  }
  if (identityMode === 'trusted') {
    installOperatorPrincipalGuard({
      app,
      caseAuthority,
      principalPolicy,
      cookiePolicy: operatorCookiePolicy,
      resolveIdentity: (headers) => {
        if (!operatorIdentityResolver) throw new Error('no resolver')
        return operatorIdentityResolver(headers)
      },
      sessionRecordByHeaders,
      registry: routeRegistry
    })
  }
  const firstFrameLatencyMs = new WeakMap<object, number>()
  app.addHook('onRequest', async (request) => {
    requestStartedAt.set(request, performance.now())
  })
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartedAt.get(request) ?? performance.now()
    // a stream lives for minutes: its latency is the time to the first frame (SPEC 0296)
    const latencyMs =
      firstFrameLatencyMs.get(request) ??
      Math.max(0, performance.now() - startedAt)
    requestMetrics.record({
      method: request.method,
      routeTemplate: request.routeOptions.url,
      statusCode: reply.statusCode,
      latencyMs
    })
    safeTelemetry(() => {
      const status = httpStatusBucket(reply.statusCode)
      telemetry.recordMetric('http_requests_total', 1, {
        operation: 'http_request',
        status
      })
      telemetry.recordMetric('http_request_duration_ms', latencyMs, {
        operation: 'http_request',
        status
      })
    })
    requestStartedAt.delete(request)
  })
  const rawBodyByRequest = new WeakMap<object, string>()
  app.removeContentTypeParser('application/json')
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request, body, done) => {
      const rawBody = typeof body === 'string' ? body : body.toString('utf8')
      rawBodyByRequest.set(request, rawBody)
      try {
        done(null, JSON.parse(rawBody))
      } catch {
        done(createInvalidJsonBodyError())
      }
    }
  )
  // AUD19-006: process-local memory is the default so legacy fixtures and
  // schemas without the 0023 buckets keep working. Durable deployments opt
  // into the shared limiter explicitly (buildServerFromEnv does it for
  // PostgreSQL persistence). Store errors deny (fail-closed), never admit.
  const rateLimiter: RateLimiterPort =
    options.rateLimiter ?? new InMemoryRateLimiter()
  app.addHook('onRequest', async (request, reply) => {
    // AUD19-006: infrastructure probes are never rate-billed; liveness must
    // stay distinguishable from dependency health (AUD19-009). The abuse
    // surface below stays limited and fail-closed.
    const rawUrl = request.url.split('?')[0]
    if (
      rawUrl === healthRoute ||
      rawUrl === liveRoute ||
      rawUrl === readyRoute ||
      rawUrl === '/health/metrics'
    ) {
      return
    }
    const correlationId = createCorrelationId()
    const deny = (retryAfterSeconds: number) => {
      reply
        .code(429)
        .header('retry-after', String(retryAfterSeconds))
        .header('cache-control', 'no-store')
      return reply.send(
        fail(
          'rate_limited',
          'Request rate limit exceeded. Retry later.',
          correlationId
        )
      )
    }
    // AUD19-006: store errors deny (fail-closed), never admit.
    let limit
    try {
      limit = await rateLimiter.check(`ip:${request.ip}`, {
        max: 300,
        windowMs: 60_000
      })
    } catch {
      return deny(60)
    }
    if (!limit.allowed) {
      return deny(limit.retryAfterSeconds)
    }
  })
  // REM21-003 / AUD19-006 — distributed operator-token replay enforcement.
  // Authenticate the complete token before extracting its jti for the shared
  // store. The effective resolver memoizes by request headers, so protected
  // route helpers reuse this authenticated identity instead of consuming the
  // process-local replay cache a second time.
  if (options.tokenReplayStore && identityMode === 'trusted') {
    const tokenReplayStore = options.tokenReplayStore
    app.addHook('onRequest', async (request, reply) => {
      const rawPath = request.url.split('?')[0]
      if (
        sessionRecordByHeaders.has(request.headers) &&
        rawPath !== '/v1/session'
      )
        return
      const raw = request.headers[TRUSTED_OPERATOR_TOKEN_HEADER]
      if (typeof raw !== 'string' || raw.trim() === '') return
      let identity: OperatorIdentity
      try {
        if (!trustedOperatorIdentityResolver) {
          throw new Error('trusted operator identity resolver is required')
        }
        identity = trustedOperatorIdentityResolver(request.headers)
        if (!identity.tenantId) {
          throw new Error('trusted operator identity must be tenant-bound')
        }
      } catch {
        const correlationId = createCorrelationId()
        reply.code(401).header('cache-control', 'no-store')
        return reply.send(
          fail(
            'unauthorized',
            'Valid operator identity headers are required',
            correlationId
          )
        )
      }
      // The resolver above is the authentication authority. This decoder is
      // used only after that authority has accepted the same raw header, never
      // as a pre-authentication decision.
      const claims = decodeTrustedOperatorTokenClaims(raw)
      if (!claims) {
        const correlationId = createCorrelationId()
        reply.code(401).header('cache-control', 'no-store')
        return reply.send(
          fail(
            'unauthorized',
            'Valid operator identity headers are required',
            correlationId
          )
        )
      }
      let claimed: boolean
      try {
        claimed = await tokenReplayStore.claim(
          `operator-jti:${claims.jti}`,
          Number(claims.exp) * 1000
        )
      } catch {
        const correlationId = createCorrelationId()
        reply.code(401).header('cache-control', 'no-store')
        return reply.send(
          fail(
            'unauthorized',
            'Valid operator identity headers are required',
            correlationId
          )
        )
      }
      if (!claimed) {
        const correlationId = createCorrelationId()
        reply.code(401).header('cache-control', 'no-store')
        return reply.send(
          fail(
            'unauthorized',
            'Trusted operator token replay detected',
            correlationId
          )
        )
      }
    })
  }
  const conversations = persistence.conversations
  const tasks = persistence.tasks
  const approvals = persistence.approvals
  const audit = persistence.audit
  const journeys = persistence.journeys
  const fallbackCapabilityGateway = createControlledCapabilityGateway({
    approvalAuthority: capabilityApprovalAuthority,
    actorAuthorizer: serverCapabilityActorAuthorizer
  })
  const emitRuntimeLog = (entry: RuntimeLogEntry) => {
    safeTelemetry(() =>
      telemetry.log(runtimeLogLevel(entry), entry.event, {
        correlationId: entry.correlationId,
        route: entry.route,
        status: entry.status,
        ...(entry.sessionId !== undefined
          ? { sessionId: entry.sessionId }
          : {}),
        ...(entry.conversationId !== undefined
          ? { conversationId: entry.conversationId }
          : {}),
        ...(entry.resourceId !== undefined
          ? { resourceId: entry.resourceId }
          : {}),
        ...(entry.errorCode !== undefined ? { errorCode: entry.errorCode } : {})
      })
    )
    options.runtimeLogger?.(entry)
  }
  const requireIdentity = (
    headers: Record<string, unknown>,
    permission: string
  ) => requireOperatorIdentity(headers, permission, operatorIdentityResolver)
  const requireAnyIdentity = (
    headers: Record<string, unknown>,
    permissions: string[]
  ) =>
    requireAnyOperatorPermission(headers, permissions, operatorIdentityResolver)
  const requireAuthenticatedMutations =
    process.env.NODE_ENV === 'test' && identityMode === 'simulation'
      ? (options.requireAuthenticatedMutations ?? false)
      : true
  const sessionLinkedAudit = (
    scope: TenantId,
    sessionId: string
  ): Pick<RuntimePersistence['audit'], 'append'> => ({
    append: (input: Parameters<typeof audit.append>[0]) =>
      caseAuthority.appendLinkedAudit(scope, input, {
        kind: 'core',
        sessionId
      })
  })
  // SPEC0176: one dependency bag for the case readers, the registry and the
  // execution projection used by mutation responses.
  /**
   * SPEC 0262: a PostgreSQL authority only hands its lock hook to the
   * PostgreSQL writers; any other pairing would commit the write without the
   * authorization unit, so it is refused before any write.
   */
  const assertRuntimeApprovalDecisionComposition = (): void => {
    if (
      caseAuthority instanceof PostgresCaseAuthority &&
      !runtimeApprovalDecision
    ) {
      throw new DomainError(
        'configuration_error',
        'Runtime approval decisions are not available in this persistence composition'
      )
    }
  }

  const assertAuthorizedWriteComposition = (): void => {
    if (
      caseAuthority instanceof PostgresCaseAuthority &&
      !(persistence.authorizedWrites instanceof PostgresAuthorizedWrites)
    ) {
      throw new DomainError(
        'configuration_error',
        'Authorized writes are not available in this persistence composition'
      )
    }
  }

  const caseRouteDeps: CaseRouteDependencies = {
    caseAuthority,
    principalPolicy,
    operationalExecution,
    ...(options.executionSteps
      ? { executionSteps: options.executionSteps }
      : {}),
    requireIdentity,
    requireAnyIdentity,
    resolveDataPlaneTenant,
    parsePagination,
    paginationErrorMessage: PAGINATION_OFFSET_ERROR_MESSAGE,
    log: emitRuntimeLog
  }
  // SPEC0251 I7: tasks and approvals put the case branch ahead of their
  // existing mapping (`toSafeError` + `statusCodeForError`), as takeover does.
  const toSafeRouteError = (error: unknown): SafeCaseError =>
    mapCaseMutationError(error, (other) => {
      const safe = toSafeError(other)
      return { status: statusCodeForError(safe.code), ...safe }
    })
  // SPEC0251 I7: every response of the eight case-scoped task and approval
  // routes is `no-store`, including the answers produced before their
  // handler (body parsing, media type, size and origin refusals).
  const caseScopedTaskApprovalRoutes = new Set([
    'GET /v1/tasks',
    'POST /v1/tasks',
    'PATCH /v1/tasks/:taskId/status',
    'POST /v1/journeys/tasks',
    'GET /v1/approvals',
    'POST /v1/approvals',
    'POST /v1/approvals/:approvalRequestId/decision',
    'POST /v1/executions/:executionId/approvals/:approvalId/decision'
  ])
  app.addHook('onSend', async (request, reply, payload) => {
    if (
      caseScopedTaskApprovalRoutes.has(
        `${request.method} ${request.routeOptions.url}`
      )
    ) {
      reply.header('cache-control', 'no-store')
    }
    return payload
  })
  const routeContext: RouteContext = {
    agentRuntime,
    app,
    approvals,
    assertAuthorizedWriteComposition,
    assertRuntimeApprovalDecisionComposition,
    audit,
    capabilityApprovalAuthority,
    caseAuthority,
    caseRouteDeps,
    conversations,
    durableInbound,
    emitRuntimeLog,
    fallbackCapabilityGateway,
    identityMode,
    operationalApprovalAuthority,
    operationalExecution,
    operatorCookiePolicy,
    operatorIdentityResolver,
    options,
    outbox,
    persistence,
    platform,
    principalPolicy,
    rateLimiter,
    rawBodyByRequest,
    readinessProbes,
    requestMetrics,
    requestMetricsEnabled,
    requireAuthenticatedMutations,
    requireIdentity,
    runtimeApprovalDecision,
    sessionLinkedAudit,
    sessionRecordByHeaders,
    sessionStoreFailureByHeaders,
    tasks,
    telemetry,
    toSafeRouteError,
    trustedOperatorIdentityResolver
  }

  registerHealthRoutes(routeContext)
  registerSessionRoutes(routeContext)
  registerExecutionsRoutes(routeContext)

  registerCaseAuthorizationRoutes(app, caseRouteDeps)
  registerWebhooksRoutes(routeContext)
  registerTakeoverRoutes(routeContext)

  registerSecretaryJourneyRoutes(app, {
    journeys,
    requireIdentity,
    requireAuthenticatedMutations,
    resolveDataPlaneTenant,
    resolveOptionalRequestTenant,
    statusCodeForError,
    // SPEC0251 §4.3: the journey task route authorizes the session's case and
    // maps errors with the same I7 branch as POST /v1/tasks.
    authorizeTaskSession: (identity, tenantId, sessionId) =>
      authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
        kind: 'core_session',
        sessionId
      }),
    // SPEC 0262: the case policy and the journey task share one unit.
    runAuthorizedTaskWrite: (identity, tenantId, sessionId, write) =>
      runAuthorizedCaseMutation(
        caseRouteDeps,
        identity,
        tenantId,
        { kind: 'core_session', sessionId },
        (unit) =>
          write(
            unit.authorizeOnClient ? { authorize: unit.authorizeOnClient } : {}
          )
      ),
    toSafeTaskError: toSafeRouteError
  })
  registerTasksRoutes(routeContext)
  registerApprovalsRoutes(routeContext)
  registerCapabilityApprovalsRoutes(routeContext)
  registerObservabilityRoutes(routeContext)
  registerCatalogRoutes(routeContext)
  registerReleaseCandidatesRoutes(routeContext)
  registerAgentsRoutes(routeContext)
  registerExecutionTraceRoutes(routeContext)
  if (testLab) registerTestLabRoutes(routeContext, testLab)

  if (options.sessionEventStreams) {
    installSessionEventStream({
      app,
      options: options.sessionEventStreams,
      requireIdentity,
      resolveDataPlaneTenant,
      mapError: (error) => {
        const safe = toSafeError(error)
        return {
          status: statusCodeForError(safe.code),
          code: safe.code,
          message: safe.message
        }
      },
      ...(identityMode === 'trusted' && options.operatorSessionStore
        ? {
            revalidation: {
              sessionIdOf: (headers: Record<string, unknown>) =>
                parseOperatorSessionCookie(
                  typeof headers.cookie === 'string'
                    ? headers.cookie
                    : undefined,
                  operatorCookiePolicy
                ) ?? undefined,
              revalidate: (sessionId: string) =>
                revalidateOperatorSession(
                  {
                    operatorSessionStore: options.operatorSessionStore!,
                    caseAuthority,
                    principalPolicy
                  },
                  sessionId
                )
            }
          }
        : {}),
      sessionStoreFailureByHeaders,
      firstFrameLatencyMs
    })
  }

  return app
}

/**
 * Client-caused refusals (4xx such as a rejected webhook signature) are
 * warnings; only server-side failures are logged as errors (ENG-018).
 */
export function runtimeLogLevel(
  entry: Pick<RuntimeLogEntry, 'status' | 'errorCode'>
): 'info' | 'warn' | 'error' {
  if (entry.status !== 'error') return 'info'
  return entry.errorCode !== undefined &&
    statusCodeForError(entry.errorCode) < 500
    ? 'warn'
    : 'error'
}

export {
  assertApprovalDecisionAuditDedupe,
  assertCaseAuthorizationSchema,
  assertMigrationOwnerFromCatalog,
  assertMigrationRoleIsLeastPrivilege,
  assertMigrationRoleSecurityBoundary,
  assertRateLimitSchema,
  assertRuntimeRoleIsLeastPrivilege,
  assertRuntimeRoleIsNotRlsBypass,
  assertTenantIsolationMigrationState,
  assertTenantIsolationSchema,
  assertWebhookReplaySchema,
  readCurrentDatabaseRole
} from './tenant-preflight.ts'

export async function buildServerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  options: BuildServerFromEnvOptions = {}
) {
  if (!['development', 'test', 'production'].includes(env.NODE_ENV ?? '')) {
    throw new Error(
      'NODE_ENV must be explicitly set to development, test or production'
    )
  }
  const { webhookReplayStore, ...explicitBuildOptions } = options
  // SPEC 0317: both refusals happen before any pool or listener exists.
  createRealCapabilityGuards({ env })
  const testLab = createConfiguredTestLab(env, explicitBuildOptions.testLab)
  const buildOptions = {
    ...explicitBuildOptions,
    ...(testLab ? { testLab } : {})
  }
  // SPEC0254 §4.1: validated without I/O, before any pool or listener.
  const operatorLoginConfig = parseOperatorLoginConfig(env)
  if (!operatorLoginConfig && buildOptions.operatorLogin) {
    throw new Error('operatorLogin requires CVG_OPERATOR_LOGIN=oidc')
  }
  if (
    operatorLoginConfig &&
    (!buildOptions.operatorLogin || !buildOptions.operatorSessionStore)
  ) {
    throw new Error(
      'OIDC login requires the durable operator session and login state stores'
    )
  }
  if (
    operatorLoginConfig &&
    (buildOptions.operatorLogin!.authorityVersion !==
      operatorLoginConfig.authorityVersion ||
      buildOptions.operatorLogin!.consoleOrigin !==
        operatorLoginConfig.consoleOrigin)
  ) {
    throw new Error('operatorLogin does not match the OIDC configuration')
  }
  /**
   * The identity mode follows the explicit option, then `CVG_IDENTITY_MODE`,
   * then the process environment (the source `buildServer` itself reads).
   * Production always composes as trusted so a simulated environment can never
   * fall back to self-asserted headers.
   */
  const identityMode =
    buildOptions.identityMode ??
    (env[IDENTITY_MODE_ENV]?.trim()
      ? parseIdentityMode(env[IDENTITY_MODE_ENV], env.NODE_ENV)
      : env.NODE_ENV === 'production'
        ? ('trusted' as const)
        : parseIdentityMode(undefined, env.NODE_ENV))
  if (env.NODE_ENV === 'production' && identityMode === 'simulation') {
    throw new Error(
      'Production requires trusted operator identity mode; simulation is forbidden'
    )
  }
  const persistenceMode = env.API_PERSISTENCE_MODE ?? 'memory'
  if (persistenceMode !== 'memory' && persistenceMode !== 'postgres') {
    throw new Error('API_PERSISTENCE_MODE must be memory or postgres')
  }
  if (env.NODE_ENV === 'production' && persistenceMode !== 'postgres') {
    throw new Error(
      'Production requires PostgreSQL persistence; in-memory mode is forbidden'
    )
  }
  const durableInbound =
    buildOptions.durableInbound ?? env.OUTBOX_DURABLE_INBOUND === 'true'
  if (persistenceMode === 'memory') {
    const httpSecurity = parseHttpSecurityEnv(env, buildOptions.httpSecurity)
    const configuredWebhookVerifier = createConfiguredWebhookVerifier(
      env,
      buildOptions.webhookVerifier,
      webhookReplayStore
    )
    let configuredInboundAgentRuntime = createConfiguredInboundAgentRuntime(
      env,
      buildOptions.agentRuntime
    )
    let controlledAgentId: AgentId | undefined
    if (env.NODE_ENV === 'development' && !configuredInboundAgentRuntime) {
      configuredInboundAgentRuntime = {
        resolveAgentId: () => {
          if (!controlledAgentId) {
            throw new Error('Controlled Secretary agent is not initialized')
          }
          return controlledAgentId
        }
      }
    }
    const configuredInboundTenantResolver =
      createConfiguredInboundTenantResolver(
        env,
        buildOptions.inboundTenantResolver
      )
    const app = buildServer({
      ...buildOptions,
      ...(configuredInboundAgentRuntime
        ? { agentRuntime: configuredInboundAgentRuntime }
        : {}),
      ...(configuredWebhookVerifier
        ? { webhookVerifier: configuredWebhookVerifier }
        : {}),
      ...(configuredInboundTenantResolver
        ? { inboundTenantResolver: configuredInboundTenantResolver }
        : {}),
      identityMode,
      durableInbound: durableInbound,
      httpSecurity,
      ...(env.NODE_ENV === 'test' && identityMode === 'trusted'
        ? {
            operatorSessionStore:
              buildOptions.operatorSessionStore ??
              createInMemoryOperatorSessionStore()
          }
        : {}),
      persistence: { kind: 'memory' }
    })
    if (env.NODE_ENV === 'development') {
      try {
        const controlledAgent = await ensureControlledSecretaryPreset(
          app.platform
        )
        controlledAgentId = controlledAgent.id
      } catch (error) {
        await app.close()
        throw error
      }
    }
    return app
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for PostgreSQL persistence mode')
  }

  // SPEC 0144: a separate job applies migrations before serving starts; the
  // serving process holds only runtime credentials and never runs DDL.
  if (env.NODE_ENV === 'production') {
    if (env.DATABASE_MIGRATION_URL !== undefined) {
      throw new Error(
        'Production serving must not receive DATABASE_MIGRATION_URL'
      )
    }
    if (env.POSTGRES_AUTO_MIGRATE === 'true') {
      throw new Error('Production serving must not run PostgreSQL migrations')
    }
  }

  if (
    env.NODE_ENV === 'production' &&
    env.POSTGRES_RLS_ENFORCEMENT !== 'true'
  ) {
    throw new Error(
      'Production requires tenant-scoped PostgreSQL RLS enforcement'
    )
  }
  if (env.NODE_ENV === 'production' && !durableInbound) {
    throw new Error(
      'Production requires OUTBOX_DURABLE_INBOUND=true; inline inbound execution is forbidden'
    )
  }

  const configuredInboundTenantResolver = createConfiguredInboundTenantResolver(
    env,
    buildOptions.inboundTenantResolver
  )
  const configuredInboundAgentRuntime = createConfiguredInboundAgentRuntime(
    env,
    buildOptions.agentRuntime
  )
  const effectiveBuildOptions = {
    ...buildOptions,
    ...(configuredInboundTenantResolver
      ? { inboundTenantResolver: configuredInboundTenantResolver }
      : {}),
    ...(configuredInboundAgentRuntime
      ? { agentRuntime: configuredInboundAgentRuntime }
      : {})
  }
  if (
    env.NODE_ENV === 'production' &&
    !effectiveBuildOptions.operatorIdentityResolver
  ) {
    throw new Error(
      'Production requires an injected operator identity resolver'
    )
  }
  const configuredHttpSecurity = parseHttpSecurityEnv(
    env,
    buildOptions.httpSecurity
  )
  const schemaName = env.POSTGRES_SCHEMA?.trim() || undefined
  assertSafeRuntimeSchemaName(schemaName)
  const configuredRateLimitKeyRing =
    effectiveBuildOptions.rateLimiter === undefined
      ? createConfiguredRateLimitKeyRing(env)
      : undefined
  if (
    effectiveBuildOptions.rateLimiter === undefined &&
    !configuredRateLimitKeyRing
  ) {
    throw new Error(
      'CVG_RATE_LIMIT_KEYRING is required for PostgreSQL rate limiting outside test mode'
    )
  }
  const pool = createPostgresPool(env.DATABASE_URL, schemaName)
  // Production never reaches here with a DDL URL (rejected above).
  const migrationPool = env.DATABASE_MIGRATION_URL
    ? createPostgresPool(env.DATABASE_MIGRATION_URL, schemaName)
    : pool
  const servingWithoutDdl = env.NODE_ENV === 'production'
  const closePools = async () => {
    if (migrationPool !== pool) await migrationPool.end()
    await pool.end()
  }

  let configuredWebhookVerifier: WebhookVerifier | undefined
  // AUD19-006: hoisted so the token-replay hook can share the distributed
  // webhook replay authority (same table, `operator-jti:` prefix).
  let effectiveReplayStore: WebhookReplayStore | undefined
  try {
    effectiveReplayStore =
      webhookReplayStore ??
      (env.NODE_ENV === 'production'
        ? new PostgresWebhookReplayStore(pool)
        : undefined)
    configuredWebhookVerifier = createConfiguredWebhookVerifier(
      env,
      effectiveBuildOptions.webhookVerifier,
      effectiveReplayStore
    )
    let migrationRoleName: string | undefined
    let runtimeRoleName: string | undefined
    if (env.POSTGRES_RLS_ENFORCEMENT === 'true') {
      const runtimeCheckClient = await pool.connect()
      try {
        await assertRuntimeRoleIsNotRlsBypass(runtimeCheckClient)
        runtimeRoleName = await readCurrentDatabaseRole(runtimeCheckClient)
      } finally {
        runtimeCheckClient.release()
      }
      if (!servingWithoutDdl) {
        const migrationIdentityClient = await migrationPool.connect()
        try {
          migrationRoleName = await readCurrentDatabaseRole(
            migrationIdentityClient
          )
          await assertMigrationRoleSecurityBoundary(
            migrationIdentityClient,
            runtimeRoleName
          )
        } finally {
          migrationIdentityClient.release()
        }
      }
    }

    if (env.POSTGRES_AUTO_MIGRATE === 'true') {
      const migrationClient = await migrationPool.connect()
      try {
        const migrationOptions = schemaName
          ? {
              schemaName,
              ...(env.DATABASE_MIGRATION_URL ? { createSchema: false } : {})
            }
          : {}
        await runPostgresMigrations(migrationClient, migrationOptions)
      } finally {
        migrationClient.release()
      }
    }
    const rateLimitSchemaClient = await pool.connect()
    try {
      await assertRateLimitSchema(rateLimitSchemaClient)
      if (env.POSTGRES_RLS_ENFORCEMENT !== 'true') {
        await assertApprovalDecisionAuditDedupe(rateLimitSchemaClient)
      }
    } finally {
      rateLimitSchemaClient.release()
    }
    if (env.POSTGRES_RLS_ENFORCEMENT === 'true') {
      if (!servingWithoutDdl) {
        const migrationRoleClient = await migrationPool.connect()
        try {
          await assertMigrationRoleIsLeastPrivilege(
            migrationRoleClient,
            runtimeRoleName
          )
        } finally {
          migrationRoleClient.release()
        }
      }
      const runtimeSchemaClient = await pool.connect()
      try {
        if (servingWithoutDdl) {
          // Same properties as the migration-role checks, read from the live
          // catalogs through the runtime connection.
          migrationRoleName = await assertMigrationOwnerFromCatalog(
            runtimeSchemaClient,
            runtimeRoleName
          )
        }
        await assertRuntimeRoleIsLeastPrivilege(
          runtimeSchemaClient,
          migrationRoleName
        )
        if (runtimeRoleName === migrationRoleName) {
          throw new Error(
            'PostgreSQL runtime and migration roles must be distinct'
          )
        }
        await assertTenantIsolationMigrationState(runtimeSchemaClient)
        await assertTenantIsolationSchema(runtimeSchemaClient)
        await assertCaseAuthorizationSchema(runtimeSchemaClient)
        await assertWebhookReplaySchema(runtimeSchemaClient)
      } finally {
        runtimeSchemaClient.release()
      }
    }
  } catch (error) {
    await closePools()
    throw error
  }

  const useTenantScopedPersistence = env.POSTGRES_RLS_ENFORCEMENT === 'true'
  const persistenceConfig = useTenantScopedPersistence
    ? ({ kind: 'postgres-pool', pool } as const)
    : ({ kind: 'postgres', client: await pool.connect() } as const)
  const legacyClient =
    persistenceConfig.kind === 'postgres' ? persistenceConfig.client : null

  const app = buildServer({
    ...effectiveBuildOptions,
    ...(configuredWebhookVerifier
      ? { webhookVerifier: configuredWebhookVerifier }
      : {}),
    ...(env.NODE_ENV === 'production'
      ? { requireAuthenticatedMutations: true }
      : {}),
    // AUD19-006: the distributed webhook replay authority doubles as the
    // operator-token replay authority (same table, `operator-jti:` prefix).
    ...(identityMode === 'trusted' && effectiveReplayStore
      ? { tokenReplayStore: effectiveReplayStore }
      : {}),
    // AUD19-006: durable deployments share one rate-limit budget in
    // PostgreSQL (migration 0026, guaranteed by the migration preflight).
    // An explicitly injected limiter always wins.
    ...(effectiveBuildOptions.rateLimiter === undefined &&
    (persistenceConfig.kind === 'postgres' ||
      persistenceConfig.kind === 'postgres-pool')
      ? {
          rateLimiter: new PostgresRateLimiter(
            (persistenceConfig.kind === 'postgres'
              ? persistenceConfig.client
              : persistenceConfig.pool) as never,
            { keyRing: configuredRateLimitKeyRing! }
          )
        }
      : {}),
    identityMode,
    durableInbound: durableInbound,
    httpSecurity: configuredHttpSecurity,
    persistence: persistenceConfig
  })
  app.addHook('onClose', async () => {
    legacyClient?.release()
    await closePools()
  })
  if (operatorLoginConfig) {
    try {
      await assertPrincipalVersionsCurrent(
        app.caseAuthority,
        operatorLoginConfig
      )
    } catch (error) {
      await app.close()
      throw error
    }
    // Secret-free boot summary (§4.1).
    safeTelemetry(() =>
      app.telemetry.log('info', 'operator_login.configured', {
        mode: operatorLoginConfig.kind,
        issuerOrigin: new URL(operatorLoginConfig.issuer).origin,
        matrixVersion: operatorLoginConfig.groupMatrix.version,
        authorityVersion: operatorLoginConfig.authorityVersion,
        mfaPolicyVersion: operatorLoginConfig.mfaPolicy.version
      })
    )
  }
  return app
}
