import { performance } from 'node:perf_hooks'
import Fastify from 'fastify'
import {
  ApprovalStatusSchema,
  createCorrelationId,
  CreateInternalTaskSchema,
  DomainError,
  fail,
  IDENTITY_MODE_ENV,
  ok,
  parseIdentityMode,
  redactSensitiveText,
  ResolveApprovalSchema,
  TaskStatusSchema,
  toSafeError,
  type OperatorIdentity
} from '@cvg/shared'
import {
  AgentConfigSchema,
  AgentIdSchema,
  AgentVersionIdSchema,
  AgentVersionStatusSchema,
  assertReleaseCandidatePublishAuthority,
  assertPromptProfileClone,
  KnowledgeSourceCreateInputSchema,
  KnowledgeSourceIdSchema,
  KnowledgeSourceTransitionInputSchema,
  ReleaseCandidateCreateInputSchema,
  ReleaseCandidateIdSchema,
  ReleaseCandidateTransitionInputSchema,
  PluginCatalogCreateInputSchema,
  PluginCatalogIdSchema,
  PluginCatalogTransitionInputSchema,
  createControlledCapabilityGateway,
  executeConfiguredAgent,
  InMemoryControlPlaneStore,
  TestSuiteCloneInputSchema,
  TestSuiteCreateInputSchema,
  TestSuiteIdSchema,
  runCriticalSafetyPreflight,
  evaluateTestLabSuite,
  runTestLab,
  type AgentExecutionActor,
  type AgentId,
  type TenantId,
  type TestSuiteVariantResult
} from '@cvg/platform'
import {
  ensureControlledSecretaryPreset,
  registerSecretaryJourneyRoutes
} from './legacy-composition.ts'
import {
  ApprovalError,
  DurableApprovalEngineAdapter,
  AuditEvidenceCheckpointCreateInputSchema,
  AuditEvidenceCheckpointIdSchema,
  AuditEvidenceCheckpointTransitionInputSchema,
  PostgresApiCreation,
  PostgresRuntimeApprovalDecision,
  PostgresAuthorizedWrites,
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  PostgresControlPlaneRepository,
  TenantScopedPostgresControlPlaneRepository,
  runPostgresMigrations,
  CaseAuthorityError,
  InMemoryCaseAuthority,
  PostgresCaseAuthority,
  type CaseAuthorityPort
} from '@cvg/persistence'
import {
  createInboundIdempotencyKey,
  getConversationTimeline,
  receiveInboundMessage,
  requestHumanApproval
} from '@cvg/agent-core'
import { CompositeTelemetry } from '@cvg/observability'
import {
  createInMemoryOperationalExecutionStore,
  OperationalExecutionError,
  deriveExecutionResume,
  parseExecutionSubmission
} from '@cvg/harness'
import { z } from 'zod'
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
  clearOperatorSessionCookie,
  createInMemoryOperatorSessionStore,
  parseOperatorSessionCookie,
  type OperatorCookiePolicy,
  type OperatorSessionRecord,
  serializeOperatorSessionCookie
} from './operator-session.ts'
import { installOperatorSessionHook } from './operator-session-hook.ts'
import { revalidateOperatorSession } from './operator-session-revalidation.ts'
import { installSessionEventStream } from './session-event-stream.ts'
import {
  installOperatorPrincipalGuard,
  recordRegisteredRoutes
} from './operator-principal-guard.ts'
import { type RegisteredRoute } from './operator-route-class.ts'
import {
  assertSessionBinding,
  readCurrentPrincipal,
  SessionBindingError
} from './operator-session-binding.ts'
import { parseOperatorLoginConfig } from './oidc-config.ts'
import {
  installOperatorLoginGuards,
  registerOperatorLoginRoutes
} from './oidc-routes.ts'
import {
  authorizeCaseMutation,
  mapCaseMutationError,
  presentExecutionForCaller,
  registerCaseAuthorizationRoutes,
  runAuthorizedCaseMutation,
  resolveCaseReadScope,
  submitExecutionWithCase,
  toSafeCaseError,
  type CaseRouteDependencies,
  type SafeCaseError
} from './case-authorization/case-routes.ts'
import { ControlledRequestMetrics } from './request-metrics.ts'
import { installResponseCorrelationHook } from './response-correlation.ts'
import { healthRoute, liveRoute, readyRoute } from './routes/health.ts'
import {
  evaluateReadinessWithProbes,
  type ReadinessProbe
} from './readiness.ts'
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
  type WebhookReplayStore,
  type WebhookVerificationLease
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
  evaluateTestSuiteVariant,
  httpStatusBucket,
  operationalApprovalError,
  recordSuiteRun,
  safeTelemetry,
  serverCapabilityActorAuthorizer,
  withDefaultCapabilityGateway,
  withDefaultKnowledgeResolver
} from './server-capability.ts'
import {
  createConfiguredInboundAgentRuntime,
  createConfiguredInboundTenantResolver,
  createConfiguredWebhookVerifier,
  executeInboundRuntime,
  isWebhookVerificationLease,
  parseInboundChannel,
  resolveInboundTenant,
  withDefaultInboundCompletion
} from './server-inbound.ts'
import {
  appendPlatformAudit,
  assertOperatorLoginComposition,
  assertPrincipalVersionsCurrent,
  capabilityApprovalReference,
  createEffectiveOperatorIdentityResolver,
  createSessionAwareOperatorIdentityResolver,
  requireAnyOperatorPermission,
  requireOperatorIdentity,
  requirePlatformScope,
  resolveDataPlaneTenant,
  resolveOperatorIdentity,
  resolveOptionalRequestTenant
} from './server-identity.ts'
import {
  CapabilityApprovalExecutionRequestSchema,
  CapabilityApprovalIssueRequestSchema,
  CapabilityApprovalParamsSchema,
  OperationalApprovalDecisionSchema,
  OperationalExecutionCancelSchema,
  OperationalExecutionInputSchema,
  TakeoverRequestSchema,
  TestLabEvaluationRequestSchema,
  TestLabRequestSchema,
  VersionCloneRequestSchema
} from './server-schemas.ts'
import {
  okPage,
  parseAuditEvidenceQuery,
  parsePagination,
  parseStatusPageQuery,
  parseTraceLimit,
  readCreationKey,
  readIdempotencyKey,
  sanitizeAuditEvidencePage,
  statusCodeForError
} from './server-query.ts'
import {
  RuntimePersistence,
  assertSafeRuntimeSchemaName,
  createPersistence,
  createPostgresPool,
  createReadinessDatabaseProbe
} from './server-persistence.ts'
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

  app.post('/v1/executions', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'conversation:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      const submission = parseExecutionSubmission(request.body, tenantId)
      const result = await submitExecutionWithCase(
        caseRouteDeps,
        identity,
        tenantId,
        submission
      )
      reply.code(202)
      emitRuntimeLog({
        event: result.created ? 'execution.accepted' : 'execution.duplicate',
        correlationId,
        route: '/v1/executions',
        status: 'ok',
        resourceId: result.record.id
      })
      return reply.send(
        ok(
          {
            execution: await presentExecutionForCaller(
              caseRouteDeps,
              identity,
              tenantId,
              result.record
            ),
            processing: 'queued' as const,
            created: result.created
          },
          correlationId
        )
      )
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError
          ? error
          : error instanceof CaseAuthorityError
            ? toSafeCaseError(error)
            : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'execution.submit_failed',
        correlationId,
        route: '/v1/executions',
        status: 'error',
        errorCode: safeError.code
      })
      return reply.send(fail(safeError.code, safeError.message, correlationId))
    }
  })

  app.post('/v1/executions/:executionId/input', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'conversation:update')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { executionId?: unknown }
      if (typeof params.executionId !== 'string') {
        throw new DomainError('validation_failed', 'Execution id is required')
      }
      const body = OperationalExecutionInputSchema.parse(request.body ?? {})
      const before = await operationalExecution.get(
        tenantId,
        params.executionId
      )
      if (!before) throw new DomainError('not_found', 'Execution not found')
      const resumed = await operationalExecution.provideUserInput({
        tenantId,
        executionId: before.id,
        actorId: identity.operatorId,
        message: body.message
      })
      await audit.append(
        {
          type: 'safety_event',
          actorType: identity.role,
          actorId: identity.operatorId,
          correlationId,
          policyVersion: 'operational-execution-v2',
          payload: {
            tenantId,
            executionId: resumed.id,
            previousState: before.state,
            nextState: resumed.state,
            resumeKind: 'user_input',
            messageLength: body.message.length
          }
        },
        tenantId
      )
      reply.code(202)
      return reply.send(
        ok(
          {
            execution: await presentExecutionForCaller(
              caseRouteDeps,
              identity,
              tenantId,
              resumed
            ),
            processing: 'queued' as const,
            resume: deriveExecutionResume(resumed)?.kind ?? null
          },
          correlationId
        )
      )
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError ? error : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'execution.user_input_failed',
        correlationId,
        route: '/v1/executions/:executionId/input',
        status: 'error',
        errorCode: safeError.code
      })
      return reply.send(fail(safeError.code, safeError.message, correlationId))
    }
  })

  app.post('/v1/executions/:executionId/cancel', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'conversation:update')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { executionId?: unknown }
      if (typeof params.executionId !== 'string') {
        throw new DomainError('validation_failed', 'Execution id is required')
      }
      const body = OperationalExecutionCancelSchema.parse(request.body ?? {})
      const commandKey = readIdempotencyKey(request.headers)
      const before = await operationalExecution.get(
        tenantId,
        params.executionId
      )
      if (!before) throw new DomainError('not_found', 'Execution not found')
      const cancelled = await operationalExecution.cancel({
        tenantId,
        executionId: before.id,
        actorId: identity.operatorId,
        ...(body.reason !== undefined ? { reason: body.reason } : {})
      })
      if (before.state !== 'CANCELLED') {
        await audit.append(
          {
            type: 'safety_event',
            actorType: identity.role,
            actorId: identity.operatorId,
            correlationId,
            policyVersion: 'operational-execution-v1',
            payload: {
              executionId: cancelled.id,
              previousState: before.state,
              nextState: cancelled.state,
              commandKey,
              reason: body.reason ?? null
            }
          },
          tenantId
        )
      }
      reply.code(200)
      return reply.send(
        ok(
          {
            execution: await presentExecutionForCaller(
              caseRouteDeps,
              identity,
              tenantId,
              cancelled
            ),
            processing: 'terminal' as const,
            cancelled: before.state !== 'CANCELLED'
          },
          correlationId
        )
      )
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError ? error : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'execution.cancel_failed',
        correlationId,
        route: '/v1/executions/:executionId/cancel',
        status: 'error',
        errorCode: safeError.code
      })
      return reply.send(fail(safeError.code, safeError.message, correlationId))
    }
  })

  app.post(
    '/v1/executions/:executionId/approvals/:approvalId/decision',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'approval:decide')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        // AUD19-006: tenant/subject-scoped mutation budget on the sensitive
        // decision path. Store errors deny (fail-closed), never admit.
        try {
          const scoped = await rateLimiter.check(
            `tenant:${tenantId}:sub:${identity.operatorId}`,
            { max: 120, windowMs: 60_000 }
          )
          if (!scoped.allowed) {
            reply
              .code(429)
              .header('retry-after', String(scoped.retryAfterSeconds))
              .header('cache-control', 'no-store')
            return reply.send(
              fail(
                'rate_limited',
                'Request rate limit exceeded. Retry later.',
                correlationId
              )
            )
          }
        } catch {
          reply
            .code(429)
            .header('retry-after', '60')
            .header('cache-control', 'no-store')
          return reply.send(
            fail(
              'rate_limited',
              'Request rate limit exceeded. Retry later.',
              correlationId
            )
          )
        }
        const params = request.params as {
          executionId?: unknown
          approvalId?: unknown
        }
        if (
          typeof params.executionId !== 'string' ||
          typeof params.approvalId !== 'string'
        ) {
          throw new DomainError(
            'validation_failed',
            'Execution and approval identifiers are required'
          )
        }
        const body = OperationalApprovalDecisionSchema.parse(request.body)
        const commandKey = readIdempotencyKey(request.headers)
        // SPEC0251 §4.3: the execution case is authorized before the
        // approval is touched (Operator/Approver need the grant; Supervisor
        // decides tenant-wide). The rate-limit budget above is not an effect.
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'execution',
          executionId: params.executionId
        })
        const decision = body.decision
        const decisionReason = body.note
        const decisionActorType =
          identity.role === 'Supervisor' ? ('Supervisor' as const) : 'Approver'
        assertRuntimeApprovalDecisionComposition()
        const executionId = params.executionId
        const approvalId = params.approvalId
        // SPEC 0262: the case policy and the whole decision share one unit
        // (PostgreSQL: one transaction; memory: the authority queue).
        const { approval, resolved } = await runAuthorizedCaseMutation(
          caseRouteDeps,
          identity,
          tenantId,
          { kind: 'execution', executionId: executionId },
          async (unit) => {
            if (runtimeApprovalDecision && unit.authorizeOnClient) {
              const result = await runtimeApprovalDecision.decide(
                {
                  tenantId,
                  executionId: executionId,
                  approvalId: approvalId,
                  verdict: decision,
                  actorId: identity.operatorId,
                  decisionActorType,
                  correlationId,
                  commandKey,
                  ...(decisionReason !== undefined
                    ? { reason: decisionReason }
                    : {})
                },
                { authorize: unit.authorizeOnClient }
              )
              return { approval: result.approval, resolved: result.execution }
            }
            const execution = await operationalExecution.get(
              tenantId,
              executionId
            )
            if (!execution) {
              throw new DomainError('not_found', 'Execution not found')
            }
            if (execution.approvalId !== approvalId) {
              throw new DomainError('not_found', 'Approval not found')
            }
            let approval = await operationalApprovalAuthority.get(
              tenantId,
              approvalId
            )
            if (
              approval.executionRef !== execution.id ||
              approval.agentId !== execution.request.runtime.agent.id ||
              approval.agentVersion !==
                execution.request.runtime.agent.version ||
              approval.correlationId !== execution.request.runtime.correlationId
            ) {
              throw new DomainError('not_found', 'Approval not found')
            }
            if (
              execution.state !== 'WAITING_APPROVAL' &&
              (approval.status === 'PENDING' || approval.status === 'REQUESTED')
            ) {
              throw new DomainError(
                'conflict',
                'Execution is no longer waiting for this approval decision'
              )
            }
            if (
              execution.state === 'WAITING_APPROVAL' &&
              ['RESERVED', 'EXECUTING', 'EXECUTED'].includes(approval.status)
            ) {
              throw new DomainError(
                'conflict',
                'Approval has already entered effect execution'
              )
            }
            if (approval.status === 'REQUESTED') {
              try {
                approval = await operationalApprovalAuthority.submit(
                  tenantId,
                  approval.approvalId,
                  approval.operatorId
                )
              } catch (error) {
                const refreshed = await operationalApprovalAuthority.get(
                  tenantId,
                  approval.approvalId
                )
                if (refreshed.status === 'REQUESTED') throw error
                approval = refreshed
              }
            }
            if (decision === 'APPROVED') {
              if (approval.status === 'PENDING') {
                approval = await operationalApprovalAuthority.approve(
                  tenantId,
                  approval.approvalId,
                  {
                    approverId: identity.operatorId,
                    decisionActorType,
                    decisionCorrelationId: correlationId,
                    commandKey,
                    ...(decisionReason !== undefined
                      ? { reason: decisionReason }
                      : {})
                  }
                )
              } else if (
                !['APPROVED', 'RESERVED', 'EXECUTING', 'EXECUTED'].includes(
                  approval.status
                )
              ) {
                throw new DomainError(
                  'conflict',
                  'Approval is not available for approval'
                )
              }
            } else if (approval.status === 'PENDING') {
              approval = await operationalApprovalAuthority.reject(
                tenantId,
                approval.approvalId,
                {
                  approverId: identity.operatorId,
                  decisionActorType,
                  decisionCorrelationId: correlationId,
                  commandKey,
                  ...(decisionReason !== undefined
                    ? { reason: decisionReason }
                    : {})
                }
              )
            } else if (approval.status !== 'REJECTED') {
              throw new DomainError(
                'conflict',
                'Approval is not available for rejection'
              )
            }

            const decisionActorId = approval.approverId
            const persistedDecisionActorType = approval.decisionActorType
            const persistedDecisionCorrelation = approval.decisionCorrelationId
            const persistedDecisionCommandKey = approval.decisionCommandKey
            if (
              !decisionActorId ||
              !persistedDecisionActorType ||
              !persistedDecisionCorrelation ||
              !persistedDecisionCommandKey
            ) {
              throw new DomainError(
                'conflict',
                'Approval decision causality is incomplete'
              )
            }

            const resolved = await operationalExecution.resolveApproval({
              tenantId,
              executionId: execution.id,
              approvalId: approval.approvalId,
              actorId: decisionActorId,
              decision,
              ...(approval.decisionReason !== undefined
                ? { reason: approval.decisionReason }
                : {})
            })
            // AUD19-003: the decision audit event is appended unconditionally.
            // `audit.append` deduplicates `approval_decision` by
            // (tenant, approvalId, decision), so retries after a crash between
            // resume and audit converge on exactly one event instead of losing
            // it (previous code gated on the stale pre-resolve state) or
            // duplicating it.
            await audit.append(
              {
                type: 'approval_decision',
                actorType: persistedDecisionActorType,
                actorId: decisionActorId,
                correlationId: persistedDecisionCorrelation,
                policyVersion: approval.policyVersion,
                payload: {
                  tenantId,
                  executionId: execution.id,
                  approvalId: approval.approvalId,
                  decision: decision.toLowerCase(),
                  reason: approval.decisionReason ?? null,
                  previousState: execution.state,
                  nextState: resolved.state,
                  payloadHash: approval.payloadHash,
                  commandKey: persistedDecisionCommandKey,
                  operationKey: approval.operationKey ?? null
                }
              },
              tenantId
            )
            return { approval, resolved }
          }
        )
        reply
          .code(decision === 'APPROVED' ? 202 : 200)
          .header('cache-control', 'no-store')
        return reply.send(
          ok(
            {
              execution: await presentExecutionForCaller(
                caseRouteDeps,
                identity,
                tenantId,
                resolved
              ),
              approvalId: approval.approvalId,
              decision,
              processing: decision === 'APPROVED' ? 'queued' : 'terminal'
            },
            correlationId
          )
        )
      } catch (error) {
        // SPEC0251 I7: case branch ahead of the unchanged chain of this route.
        const safeError = mapCaseMutationError(error, (other) => {
          const mapped =
            other instanceof ApprovalError
              ? operationalApprovalError(other)
              : other instanceof OperationalExecutionError
                ? other
                : toSafeError(other)
          return {
            status: statusCodeForError(mapped.code),
            code: mapped.code,
            message: mapped.message
          }
        })
        reply.code(safeError.status).header('cache-control', 'no-store')
        emitRuntimeLog({
          event: 'execution.approval_decision_failed',
          correlationId,
          route: '/v1/executions/:executionId/approvals/:approvalId/decision',
          status: 'error',
          errorCode: safeError.code
        })
        return reply.send(
          fail(safeError.code, safeError.message, correlationId)
        )
      }
    }
  )

  registerCaseAuthorizationRoutes(app, caseRouteDeps)

  app.post(
    '/v1/webhooks/channels/:channel/messages',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      let webhookLease: WebhookVerificationLease | undefined
      try {
        const params = request.params as { channel: string }
        if (options.webhookVerifier) {
          const rawBody =
            rawBodyByRequest.get(request.raw) ?? rawBodyByRequest.get(request)
          const verified = await options.webhookVerifier({
            headers: request.headers,
            body: request.body,
            channel: params.channel,
            ...(rawBody !== undefined ? { rawBody } : {})
          })
          if (isWebhookVerificationLease(verified)) {
            webhookLease = verified
          } else if (!verified) {
            throw new DomainError('unauthorized', 'Webhook verification failed')
          }
        } else if (process.env.NODE_ENV !== 'test') {
          throw new DomainError(
            'unauthorized',
            'A trusted webhook verifier is required in production'
          )
        }
        const body = request.body as Record<string, unknown>
        const channel = parseInboundChannel(params.channel)
        const tenantId = await resolveInboundTenant(
          {
            headers: request.headers,
            body,
            channel
          },
          options.inboundTenantResolver
        )
        const result = await receiveInboundMessage(
          { conversations, ...(durableInbound ? { outbox } : {}) },
          { ...body, tenantId, channel }
        )
        let runtimeSessionId = result.sessionId
        const shouldRetryRuntime = Boolean(
          !result.accepted && result.runtimeStatus === 'pending' && agentRuntime
        )
        if (shouldRetryRuntime) {
          const timeline = await getConversationTimeline(
            conversations,
            tenantId,
            result.conversationId
          )
          runtimeSessionId = timeline.sessions.at(-1)?.id ?? null
        }
        const shouldQueueInbound =
          durableInbound &&
          (result.accepted || result.runtimeStatus === 'pending')
        // AUD19-004: the fallback enqueue carries post-creation ids that the
        // atomic path did not have, so a redelivery hits the content binding.
        // Converge on the already-queued winner instead of silently
        // reusing the key with divergent content.
        const queueInboundFallback = async () => {
          const idempotencyKey = createInboundIdempotencyKey(
            channel,
            String(body.externalMessageId ?? '')
          )
          try {
            return await outbox!.enqueue({
              tenantId,
              type: 'inbound.process',
              payload: {
                tenantId,
                channel,
                senderRef: redactSensitiveText(String(body.senderRef ?? '')),
                body: redactSensitiveText(String(body.body ?? '')),
                externalMessageId: String(body.externalMessageId ?? ''),
                conversationId: result.conversationId,
                sessionId: runtimeSessionId,
                messageId: result.messageId
              },
              correlationId: result.correlationId ?? correlationId,
              idempotencyKey,
              conversationId: result.conversationId,
              sessionId: runtimeSessionId,
              inboundMessageId: result.messageId
            })
          } catch (error) {
            if (
              error instanceof DomainError &&
              error.code === 'conflict' &&
              typeof outbox!.findByIdempotencyKey === 'function'
            ) {
              const winner = await outbox!.findByIdempotencyKey(
                tenantId,
                idempotencyKey
              )
              if (winner) return winner
            }
            throw error
          }
        }
        const queuedOutbox = shouldQueueInbound
          ? (result.outbox ?? (await queueInboundFallback()))
          : undefined
        const runtime =
          !durableInbound &&
          (result.accepted || shouldRetryRuntime) &&
          agentRuntime
            ? await executeInboundRuntime({
                options: agentRuntime,
                platform,
                tenantId,
                correlationId: result.correlationId ?? correlationId,
                channel,
                senderRef: String(body.senderRef ?? ''),
                message: String(body.body ?? ''),
                conversationId: result.conversationId,
                sessionId: runtimeSessionId,
                messageId: result.messageId,
                // SPEC0176: runtime events are linked to the persisted session
                // this producer validated, never to the payload claim.
                audit: runtimeSessionId
                  ? sessionLinkedAudit(tenantId, runtimeSessionId)
                  : audit,
                conversations,
                sessionVersionPinning: persistence.sessionVersionPinning
              })
            : undefined
        if (
          !(
            (result.accepted || shouldRetryRuntime) &&
            runtime?.status === 'completed' &&
            agentRuntime?.completeInboundRuntime
          )
        ) {
          const inboundAudit = {
            type: 'integration_event' as const,
            actorType: 'System' as const,
            actorId: 'api',
            correlationId: result.correlationId ?? correlationId,
            policyVersion: 'api-runtime-v1',
            payload: {
              sessionId: result.sessionId,
              conversationId: result.conversationId,
              accepted: result.accepted,
              tenantId,
              ...(queuedOutbox
                ? {
                    processing: 'queued',
                    outboxEventId: queuedOutbox.id,
                    outboxStatus: queuedOutbox.status
                  }
                : {}),
              ...(runtime
                ? {
                    runtimeStatus: runtime.status,
                    traceId: runtime.trace?.traceId ?? null,
                    externalCall: runtime.trace?.provider.externalCall ?? false
                  }
                : {})
            }
          }
          // SPEC0176: the producer links the event to the session it persisted
          // (never to the payload claim) in the same unit as the event.
          if (typeof result.sessionId === 'string') {
            await caseAuthority.appendLinkedAudit(tenantId, inboundAudit, {
              kind: 'core',
              sessionId: result.sessionId
            })
          } else {
            await audit.append(inboundAudit, tenantId)
          }
        }
        if (webhookLease) {
          await webhookLease.commit()
          webhookLease = undefined
        }
        emitRuntimeLog({
          event: result.accepted ? 'inbound.accepted' : 'inbound.duplicate',
          correlationId: result.correlationId ?? correlationId,
          route: '/v1/webhooks/channels/:channel/messages',
          status: 'ok',
          sessionId: result.sessionId,
          conversationId: result.conversationId,
          resourceId: result.messageId
        })
        return ok(
          queuedOutbox
            ? { ...result, processing: 'queued', outbox: queuedOutbox }
            : runtime
              ? { ...result, runtime }
              : result,
          result.correlationId ?? correlationId
        )
      } catch (error) {
        if (webhookLease) {
          await Promise.resolve(webhookLease.release()).catch(() => undefined)
        }
        const safeError =
          error instanceof CaseAuthorityError
            ? toSafeCaseError(error)
            : toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        emitRuntimeLog({
          event: 'inbound.failed',
          correlationId,
          route: '/v1/webhooks/channels/:channel/messages',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/sessions/:sessionId/takeover', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'conversation:assume')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { sessionId: string }
      const body = TakeoverRequestSchema.parse(request.body)
      const session = await conversations.transitionTakeover(
        tenantId,
        params.sessionId,
        body.event
      )
      if (!session) {
        throw new DomainError('invalid_action', 'Session not found')
      }
      // SPEC0176: linked to the persisted session the transition operated on.
      await caseAuthority.appendLinkedAudit(
        tenantId,
        {
          type: 'handoff',
          actorType: identity.role,
          actorId: identity.operatorId,
          correlationId,
          policyVersion: 'human-takeover-v1',
          payload: {
            tenantId,
            sessionId: session.id,
            event: body.event,
            state: session.takeoverState,
            effect: 'human_takeover_state_only'
          }
        },
        { kind: 'core', sessionId: session.id }
      )
      return ok(session, correlationId)
    } catch (error) {
      const safeError =
        error instanceof CaseAuthorityError
          ? toSafeCaseError(error)
          : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

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

  app.post('/v1/tasks', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'task:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      const input = CreateInternalTaskSchema.parse(request.body)
      // SPEC0251 §4.3: the session's case before the task (and before an
      // idempotent replay could return an existing task).
      if (identity) {
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'core_session',
          sessionId: input.sessionId
        })
      }
      // SPEC 0257: resource, creation audit and receipt commit together.
      if (
        !persistence.apiCreation ||
        // SPEC 0262: a PostgreSQL authority only hands its lock hook to the
        // PostgreSQL creation port; any other pairing would commit the write
        // without the authorization unit, so it is refused before any write.
        (caseAuthority instanceof PostgresCaseAuthority &&
          !(persistence.apiCreation instanceof PostgresApiCreation))
      ) {
        throw new DomainError(
          'configuration_error',
          'Atomic creation is not available in this persistence composition'
        )
      }
      const taskCommand = {
        actor: identity
          ? { actorType: identity.role, actorId: identity.operatorId }
          : { actorType: 'System' as const, actorId: 'api' },
        correlationId,
        task: input
      }
      const taskCreation = persistence.apiCreation
      // SPEC 0262: with an authenticated identity the case policy runs in the
      // same unit as the write (locks held to COMMIT / authority queue).
      const created = identity
        ? await runAuthorizedCaseMutation(
            caseRouteDeps,
            identity,
            tenantId,
            { kind: 'core_session', sessionId: input.sessionId },
            async (unit) =>
              taskCreation.createTaskWithAudit(
                taskCommand,
                tenantId,
                unit.authorizeOnClient
                  ? { authorize: unit.authorizeOnClient }
                  : undefined
              )
          )
        : await taskCreation.createTaskWithAudit(taskCommand, tenantId)
      const task = created.resource
      emitRuntimeLog({
        event: 'task.created',
        correlationId,
        route: '/v1/tasks',
        status: 'ok',
        sessionId: task.sessionId,
        resourceId: task.id
      })
      reply.header('cache-control', 'no-store')
      return ok(task, correlationId)
    } catch (error) {
      const safeError = toSafeRouteError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
      emitRuntimeLog({
        event: 'task.failed',
        correlationId,
        route: '/v1/tasks',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/tasks', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'task:view')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      // SPEC0250 §3.4 (AUD0621 F23): bounded, validated page; `data` stays
      // an array and the page metadata travels in `meta.pageInfo`.
      const query = parseStatusPageQuery(
        request.query,
        TaskStatusSchema.options
      )
      // SPEC0251 §4.3: Operator/Approver page only their assigned cases,
      // filtered in the snapshot before COUNT/offset/limit.
      const page = await caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) =>
          snapshot.listTasks(
            await resolveCaseReadScope(
              snapshot,
              identity,
              caseRouteDeps.principalPolicy
            ),
            query
          )
      )
      reply.header('cache-control', 'no-store')
      return okPage(page, correlationId)
    } catch (error) {
      const safeError = toSafeRouteError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.patch('/v1/tasks/:taskId/status', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const params = request.params as { taskId: string }
      const body = request.body as { status?: unknown }
      const identity = requireIdentity(request.headers, 'task:update')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const status = TaskStatusSchema.safeParse(body.status)
      if (!status.success) {
        throw new DomainError('validation_failed', 'Task status is required')
      }
      // SPEC0251 §4.3: the task's case is authorized before the transition.
      await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
        kind: 'task',
        taskId: params.taskId
      })
      assertAuthorizedWriteComposition()
      const statusCommand = {
        taskId: params.taskId,
        status: status.data,
        actorType: identity.role,
        actorId: identity.operatorId,
        correlationId
      }
      // SPEC0250 §3.1 (AUD0621 F15/F16): one atomic port call validates the
      // transition against the committed status, writes it with a CAS and
      // records the audit event in the same unit; a failure changes nothing.
      // SPEC 0262: the case policy runs in that same unit.
      const updated = await runAuthorizedCaseMutation(
        caseRouteDeps,
        identity,
        tenantId,
        { kind: 'task', taskId: params.taskId },
        async (unit) =>
          persistence.authorizedWrites && unit.authorizeOnClient
            ? persistence.authorizedWrites.transitionTaskStatus(
                statusCommand,
                tenantId,
                { authorize: unit.authorizeOnClient }
              )
            : tasks.transitionStatusWithAudit(statusCommand, tenantId)
      )
      emitRuntimeLog({
        event: 'task.status_changed',
        correlationId,
        route: '/v1/tasks/:taskId/status',
        status: 'ok',
        sessionId: updated.sessionId,
        resourceId: updated.id
      })
      reply.header('cache-control', 'no-store')
      return ok(updated, correlationId)
    } catch (error) {
      const safeError = toSafeRouteError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
      emitRuntimeLog({
        event: 'task.status_failed',
        correlationId,
        route: '/v1/tasks/:taskId/status',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/approvals', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'approval:view')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      const requestedApproval = requestHumanApproval(request.body)
      const requester =
        requestedApproval.proposedAction === 'audit_evidence_export_review'
          ? requireIdentity(request.headers, 'audit:view_full')
          : null
      // SPEC0251 §4.3: the session's case before the approval is created.
      if (identity) {
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'core_session',
          sessionId: requestedApproval.sessionId
        })
      }
      // SPEC 0257 §2: exactly one valid header, checked after authentication
      // and case authorization and before any mutation.
      const creationKey = readCreationKey(request.raw.rawHeaders)
      // SPEC 0257: resource, creation audit and receipt commit together; a
      // replay returns the same approval.
      if (
        !persistence.apiCreation ||
        // SPEC 0262: a PostgreSQL authority only hands its lock hook to the
        // PostgreSQL creation port; any other pairing would commit the write
        // without the authorization unit, so it is refused before any write.
        (caseAuthority instanceof PostgresCaseAuthority &&
          !(persistence.apiCreation instanceof PostgresApiCreation))
      ) {
        throw new DomainError(
          'configuration_error',
          'Atomic creation is not available in this persistence composition'
        )
      }
      const approvalCommand = {
        actor: requester
          ? { actorType: requester.role, actorId: requester.operatorId }
          : identity
            ? { actorType: identity.role, actorId: identity.operatorId }
            : { actorType: 'System' as const, actorId: 'api' },
        correlationId,
        idempotencyKey: creationKey,
        request: requestedApproval
      }
      const approvalCreation = persistence.apiCreation
      const created = identity
        ? await runAuthorizedCaseMutation(
            caseRouteDeps,
            identity,
            tenantId,
            { kind: 'core_session', sessionId: requestedApproval.sessionId },
            async (unit) =>
              approvalCreation.createApprovalWithAudit(
                approvalCommand,
                tenantId,
                unit.authorizeOnClient
                  ? { authorize: unit.authorizeOnClient }
                  : undefined
              )
          )
        : await approvalCreation.createApprovalWithAudit(
            approvalCommand,
            tenantId
          )
      const approval = created.resource
      emitRuntimeLog({
        event: 'approval.created',
        correlationId,
        route: '/v1/approvals',
        status: 'ok',
        sessionId: approval.sessionId,
        resourceId: approval.id
      })
      reply.header('cache-control', 'no-store')
      return ok(approval, correlationId)
    } catch (error) {
      const safeError = toSafeRouteError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
      emitRuntimeLog({
        event: 'approval.create_failed',
        correlationId,
        route: '/v1/approvals',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/approvals/:approvalRequestId/decision',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const params = request.params as { approvalRequestId: string }
        const identity = requireIdentity(request.headers, 'approval:decide')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const parsedBody = ResolveApprovalSchema.parse({
          ...(request.body as Record<string, unknown>),
          approvalRequestId: params.approvalRequestId,
          operatorId: identity.operatorId
        })
        // SPEC0251 §4.3: approved, rejected and assumed all require the
        // approval's case for Approver; Supervisor decides tenant-wide.
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'approval_request',
          approvalRequestId: parsedBody.approvalRequestId
        })
        assertAuthorizedWriteComposition()
        const decision = {
          approvalRequestId: parsedBody.approvalRequestId,
          decision: parsedBody.decision,
          operatorId: parsedBody.operatorId,
          role: identity.role,
          correlationId,
          ...(parsedBody.note === undefined ? {} : { note: parsedBody.note })
        }
        // SPEC 0262: the case policy and the decision share one unit.
        const decided = await runAuthorizedCaseMutation(
          caseRouteDeps,
          identity,
          tenantId,
          {
            kind: 'approval_request',
            approvalRequestId: parsedBody.approvalRequestId
          },
          async (unit) =>
            persistence.authorizedWrites && unit.authorizeOnClient
              ? persistence.authorizedWrites.decideAttendanceApproval(
                  decision,
                  tenantId,
                  { authorize: unit.authorizeOnClient }
                )
              : approvals.decideWithAudit(decision, tenantId)
        )
        const event =
          decided.status === 'assumed'
            ? 'approval.handoff_assumed'
            : 'approval.decided'
        emitRuntimeLog({
          event,
          correlationId,
          route: '/v1/approvals/:approvalRequestId/decision',
          status: 'ok',
          sessionId: decided.sessionId,
          resourceId: decided.id
        })
        reply.header('cache-control', 'no-store')
        return ok(decided, correlationId)
      } catch (error) {
        const safeError = toSafeRouteError(error)
        reply.code(safeError.status).header('cache-control', 'no-store')
        emitRuntimeLog({
          event: 'approval.decision_failed',
          correlationId,
          route: '/v1/approvals/:approvalRequestId/decision',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/approvals', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'approval:view')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      // SPEC0250 §3.4 (AUD0621 F23): bounded, validated, filterable queue.
      const query = parseStatusPageQuery(
        request.query,
        ApprovalStatusSchema.options
      )
      // SPEC0251 §4.3: same case scope as GET /v1/tasks.
      const page = await caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) =>
          snapshot.listApprovalRequests(
            await resolveCaseReadScope(
              snapshot,
              identity,
              caseRouteDeps.principalPolicy
            ),
            query
          )
      )
      reply.header('cache-control', 'no-store')
      return okPage(page, correlationId)
    } catch (error) {
      const safeError = toSafeRouteError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/capability-approvals', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'approval:decide',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const body = CapabilityApprovalIssueRequestSchema.parse(request.body)
      const version = await platform.getVersion(scope, body.versionId)
      if (
        !version ||
        version.agentId !== body.agentId ||
        !['APPROVED', 'PUBLISHED'].includes(version.status)
      ) {
        throw new DomainError(
          'invalid_action',
          'Only an approved agent version can receive a capability approval'
        )
      }
      const approvalGateway =
        agentRuntime?.capabilityGateway ?? fallbackCapabilityGateway
      const configuredTool = approvalGateway.resolveConfiguredTool(
        version.config,
        body.toolName
      )
      if (configuredTool.status !== 'resolved') {
        throw new DomainError(
          'invalid_action',
          'Capability tool is not available in the approved agent version'
        )
      }
      if (body.actorId === identity.operatorId) {
        throw new DomainError(
          'forbidden',
          'Capability approvals require a separate executor'
        )
      }
      const approval = await capabilityApprovalAuthority.issue({
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        toolName: body.toolName,
        input: { message: redactSensitiveText(body.input.message) },
        actorId: body.actorId,
        issuer: identity.operatorId,
        expiresAt: body.expiresAt,
        ...(body.nonce ? { nonce: body.nonce } : {})
      })
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'capability_approval_issued',
          tenantId: scope.tenantId,
          approvalId: approval.id,
          agentId: approval.agentId,
          versionId: approval.versionId,
          toolName: approval.toolName,
          actorId: approval.actorId,
          expiresAt: approval.expiresAt.toISOString()
        }
      )
      return ok(approval, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get(
    '/v1/admin/capability-approvals/:approvalId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:view',
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const approval = await capabilityApprovalAuthority.get(
          params.approvalId,
          scope.tenantId
        )
        if (!approval) {
          throw new DomainError(
            'invalid_action',
            'Capability approval not found'
          )
        }
        return ok(approval, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/capability-approvals/:approvalId/revoke',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:decide',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const revoked = await capabilityApprovalAuthority.revoke(
          params.approvalId,
          identity.operatorId,
          scope.tenantId
        )
        if (!revoked) {
          throw new DomainError(
            'invalid_action',
            'Capability approval cannot be revoked by this issuer'
          )
        }
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'capability_approval_revoked',
            tenantId: scope.tenantId,
            approvalId: params.approvalId
          }
        )
        return ok(
          { revoked: true, approvalId: params.approvalId },
          correlationId
        )
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/capability-approvals/:approvalId/execute',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:execute',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const body = CapabilityApprovalExecutionRequestSchema.parse(
          request.body
        )
        const record = await capabilityApprovalAuthority.get(
          params.approvalId,
          scope.tenantId
        )
        if (!record || record.status !== 'issued') {
          throw new DomainError(
            'invalid_action',
            'Capability approval is not available for execution'
          )
        }
        if (record.actorId !== identity.operatorId) {
          throw new DomainError(
            'forbidden',
            'Capability approval is bound to another operator'
          )
        }
        const version = await platform.getVersion(scope, record.versionId)
        if (
          !version ||
          version.agentId !== record.agentId ||
          !['APPROVED', 'PUBLISHED'].includes(version.status)
        ) {
          throw new DomainError(
            'invalid_action',
            'Approved agent version is no longer executable'
          )
        }
        const runtimeGateway =
          agentRuntime?.capabilityGateway ?? fallbackCapabilityGateway
        const configuredTool = runtimeGateway.resolveConfiguredTool(
          version.config,
          record.toolName
        )
        if (configuredTool.status !== 'resolved') {
          throw new DomainError(
            'invalid_action',
            'Capability tool is not available in the approved agent version'
          )
        }
        const actor: AgentExecutionActor = {
          id: identity.operatorId,
          role: identity.role,
          permissions: [configuredTool.permission]
        }
        const trace = await executeConfiguredAgent({
          store: platform,
          tenantId: scope.tenantId,
          agentId: record.agentId,
          versionId: record.versionId,
          message: body.message,
          history: body.history,
          executionMode: 'CONTROLLED_RUNTIME',
          capabilityGateway: runtimeGateway,
          actor,
          capabilityApproval: capabilityApprovalReference(record),
          requireCapabilityApproval: true,
          onToolAudit: async (event) => {
            await audit.append(
              {
                type: event.type,
                actorType: 'System',
                actorId: 'capability-approval-runtime',
                correlationId: event.correlationId,
                policyVersion: 'plugin-gateway-v1',
                payload: {
                  tenantId: event.tenantId,
                  agentId: event.agentId,
                  versionId: event.versionId,
                  traceId: event.traceId,
                  plugin: event.plugin,
                  toolName: event.toolName,
                  status: event.status,
                  payload: event.payload
                }
              },
              event.tenantId
            )
          },
          ...(options.resolveApprovedKnowledge
            ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
            : {}),
          ...(body.approvedKnowledge && !options.resolveApprovedKnowledge
            ? { approvedKnowledge: body.approvedKnowledge }
            : {})
        })
        const capabilityResult = trace.tools.find(
          (tool) => tool.name === record.toolName
        )
        if (capabilityResult?.status !== 'succeeded') {
          throw new DomainError(
            'invalid_action',
            'Capability approval was not consumed by the controlled tool'
          )
        }
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'capability_approval_executed',
            tenantId: scope.tenantId,
            approvalId: record.id,
            traceId: trace.traceId,
            toolName: record.toolName,
            externalCall: trace.provider.externalCall
          }
        )
        return ok(trace, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/observability/audit-evidence', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'audit:view_full')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const evidenceQuery = parseAuditEvidenceQuery(request.query)
      const [summary, page] = await Promise.all([
        audit.summarizeEvidence(evidenceQuery.filters, tenantId),
        audit.listEvidence(evidenceQuery.query, tenantId)
      ])
      emitRuntimeLog({
        event: 'observability.audit_evidence_exported',
        correlationId,
        route: '/v1/observability/audit-evidence',
        status: 'ok',
        sessionId: evidenceQuery.filters.sessionId ?? null,
        resourceId: identity.operatorId
      })
      return ok(
        {
          summary,
          ...sanitizeAuditEvidencePage(page),
          export: {
            format: 'json',
            controlled: true,
            externalDispatch: false,
            requestedBy: identity.operatorId
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'observability.audit_evidence_failed',
        correlationId,
        route: '/v1/observability/audit-evidence',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/observability/audit-evidence/checkpoints',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const input = AuditEvidenceCheckpointCreateInputSchema.parse(
          request.body
        )
        const checkpoint = await audit.createAuditEvidenceCheckpoint(
          input,
          identity.operatorId,
          tenantId
        )
        await appendPlatformAudit(audit, identity, correlationId, tenantId, {
          event: 'audit_evidence_checkpoint_sealed',
          tenantId,
          checkpointId: checkpoint.id,
          eventIds: checkpoint.eventIds,
          eventCount: checkpoint.eventCount,
          evidenceDigest: checkpoint.evidenceDigest,
          status: checkpoint.status,
          filters: checkpoint.filters
        })
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_sealed',
          correlationId,
          route: '/v1/observability/audit-evidence/checkpoints',
          status: 'ok',
          sessionId: checkpoint.filters.sessionId ?? null,
          resourceId: checkpoint.id
        })
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_failed',
          correlationId,
          route: '/v1/observability/audit-evidence/checkpoints',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get(
    '/v1/observability/audit-evidence/checkpoints',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const checkpoints = await audit.listAuditEvidenceCheckpoints(tenantId)
        return ok({ checkpoints }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get(
    '/v1/observability/audit-evidence/checkpoints/:checkpointId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as { checkpointId: string }
        const checkpointId = AuditEvidenceCheckpointIdSchema.parse(
          params.checkpointId
        )
        const checkpoint = await audit.getAuditEvidenceCheckpoint(
          checkpointId,
          tenantId
        )
        if (!checkpoint) {
          throw new DomainError(
            'invalid_action',
            'Audit evidence checkpoint not found'
          )
        }
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as { checkpointId: string }
        const checkpointId = AuditEvidenceCheckpointIdSchema.parse(
          params.checkpointId
        )
        const input = AuditEvidenceCheckpointTransitionInputSchema.parse(
          request.body
        )
        const checkpoint = await audit.transitionAuditEvidenceCheckpoint(
          checkpointId,
          input.status,
          identity.operatorId,
          input.expectedStatus,
          tenantId
        )
        if (!checkpoint) {
          throw new DomainError(
            'invalid_action',
            'Audit evidence checkpoint not found'
          )
        }
        await appendPlatformAudit(audit, identity, correlationId, tenantId, {
          event: 'audit_evidence_checkpoint_archived',
          tenantId,
          checkpointId: checkpoint.id,
          eventCount: checkpoint.eventCount,
          evidenceDigest: checkpoint.evidenceDigest,
          status: checkpoint.status,
          filters: checkpoint.filters
        })
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_archived',
          correlationId,
          route:
            '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
          status: 'ok',
          sessionId: checkpoint.filters.sessionId ?? null,
          resourceId: checkpoint.id
        })
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_transition_failed',
          correlationId,
          route:
            '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/plugins/catalog', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const entry = await platform.createPluginCatalogEntry(
        scope,
        PluginCatalogCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'plugin_catalog_created',
          tenantId: scope.tenantId,
          pluginCatalogId: entry.id,
          pluginName: entry.manifest.name,
          pluginVersion: entry.manifest.version,
          status: entry.status
        }
      )
      return ok(entry, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/plugins/catalog', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const query = z
        .object({
          name: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .regex(/^[A-Za-z0-9._:-]+$/)
            .optional()
        })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listPluginCatalogEntries(scope, query.name),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/plugins/catalog/:pluginId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const params = z
        .object({ pluginId: PluginCatalogIdSchema })
        .strict()
        .parse(request.params)
      const entry = await platform.getPluginCatalogEntry(scope, params.pluginId)
      if (!entry) {
        throw new DomainError(
          'invalid_action',
          'Plugin catalog entry not found'
        )
      }
      return ok(entry, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/plugins/catalog/:pluginId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ pluginId: PluginCatalogIdSchema })
          .strict()
          .parse(request.params)
        const body = PluginCatalogTransitionInputSchema.parse(request.body)
        const entry = await platform.transitionPluginCatalogEntry(
          scope,
          params.pluginId,
          body.target,
          identity.operatorId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'plugin_catalog_transitioned',
            tenantId: scope.tenantId,
            pluginCatalogId: entry.id,
            pluginName: entry.manifest.name,
            pluginVersion: entry.manifest.version,
            status: entry.status
          }
        )
        return ok(entry, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/knowledge-sources', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const source = await platform.createKnowledgeSource(
        scope,
        KnowledgeSourceCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'knowledge_source_created',
          tenantId: scope.tenantId,
          knowledgeSourceId: source.id,
          source: source.source,
          version: source.version,
          status: source.status
        }
      )
      return ok(source, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/knowledge-sources', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      return ok(await platform.listKnowledgeSources(scope), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/knowledge-sources/:sourceId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const params = z
        .object({ sourceId: KnowledgeSourceIdSchema })
        .strict()
        .parse(request.params)
      const source = await platform.getKnowledgeSource(scope, params.sourceId)
      if (!source) {
        throw new DomainError('invalid_action', 'Knowledge source not found')
      }
      return ok(source, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/knowledge-sources/:sourceId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ sourceId: KnowledgeSourceIdSchema })
          .strict()
          .parse(request.params)
        const body = KnowledgeSourceTransitionInputSchema.parse(request.body)
        const source = await platform.transitionKnowledgeSource(
          scope,
          params.sourceId,
          body.target,
          identity.operatorId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'knowledge_source_transitioned',
            tenantId: scope.tenantId,
            knowledgeSourceId: source.id,
            source: source.source,
            version: source.version,
            status: source.status
          }
        )
        return ok(source, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/release-candidates', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const candidate = await platform.createReleaseCandidate(
        scope,
        ReleaseCandidateCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'release_candidate_created',
          tenantId: scope.tenantId,
          releaseCandidateId: candidate.id,
          agentId: candidate.agentId,
          versionId: candidate.versionId,
          evidenceDigest: candidate.evidenceDigest,
          status: candidate.status,
          gateKeys: candidate.gateResults.map((gate) => gate.key)
        }
      )
      return ok(candidate, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/release-candidates', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const query = z
        .object({ agentId: AgentIdSchema })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listReleaseCandidates(scope, query.agentId),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get(
    '/v1/admin/release-candidates/:candidateId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = z
          .object({ candidateId: ReleaseCandidateIdSchema })
          .strict()
          .parse(request.params)
        const candidate = await platform.getReleaseCandidate(
          scope,
          params.candidateId
        )
        if (!candidate) {
          throw new DomainError('invalid_action', 'Release candidate not found')
        }
        return ok(candidate, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/release-candidates/:candidateId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ candidateId: ReleaseCandidateIdSchema })
          .strict()
          .parse(request.params)
        const body = ReleaseCandidateTransitionInputSchema.parse(request.body)
        const candidate = await platform.transitionReleaseCandidate(
          scope,
          params.candidateId,
          body.target,
          identity.operatorId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'release_candidate_transitioned',
            tenantId: scope.tenantId,
            releaseCandidateId: candidate.id,
            agentId: candidate.agentId,
            versionId: candidate.versionId,
            evidenceDigest: candidate.evidenceDigest,
            status: candidate.status,
            gateKeys: candidate.gateResults.map((gate) => gate.key)
          }
        )
        return ok(candidate, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/agents', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const agent = await platform.createAgent(
        { tenantId: scope.tenantId },
        request.body as { slug: string; name: string; description: string }
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'agent_created',
          tenantId: scope.tenantId,
          agentId: agent.id
        }
      )
      emitRuntimeLog({
        event: 'platform.agent_created',
        correlationId,
        route: '/v1/admin/agents',
        status: 'ok',
        resourceId: agent.id
      })
      return ok(agent, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/agents', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:view',
        operatorIdentityResolver
      )
      return ok(await platform.listAgents(scope), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/agents/:agentId/versions', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      const body = request.body as { config?: unknown }
      const version = await platform.createVersion(
        scope,
        agentId,
        AgentConfigSchema.parse(body.config),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'version_created',
          tenantId: scope.tenantId,
          agentId,
          versionId: version.id,
          version: version.version
        }
      )
      return ok(version, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/clone',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const source = await platform.getVersion(scope, versionId)
        if (!source || source.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const body = VersionCloneRequestSchema.parse(request.body)
        if (body.config) {
          assertPromptProfileClone(source.config, body.config)
        }
        const version = await platform.createVersion(
          scope,
          agentId,
          body.config ?? source.config,
          identity.operatorId
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_cloned',
            tenantId: scope.tenantId,
            agentId,
            sourceVersionId: source.id,
            versionId: version.id,
            version: version.version
          }
        )
        return ok(version, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/admin/agents/:agentId/versions', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:view',
        operatorIdentityResolver
      )
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      return ok(await platform.listVersions(scope, agentId), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const body = z
          .object({
            target: AgentVersionStatusSchema,
            expectedStatus: AgentVersionStatusSchema.optional()
          })
          .strict()
          .parse(request.body)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const updated = await platform.transitionVersion(
          scope,
          versionId,
          body.target,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_transitioned',
            tenantId: scope.tenantId,
            agentId,
            versionId,
            target: updated.status
          }
        )
        return ok(updated, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/publish-preflight',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        z.object({})
          .strict()
          .parse(request.body ?? {})
        const report = await runCriticalSafetyPreflight({
          store: platform,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_publish_preflight',
            tenantId: scope.tenantId,
            agentId,
            versionId,
            passed: report.passed,
            caseCount: report.caseCount,
            externalCall: report.externalCall,
            failedCaseIds: report.failures.map((failure) => failure.caseId)
          }
        )
        return ok(report, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/publish',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const body = z
          .object({
            releaseCandidateId: ReleaseCandidateIdSchema,
            expectedStatus: AgentVersionStatusSchema.optional()
          })
          .strict()
          .parse(request.body ?? {})
        const releaseCandidate = await platform.getReleaseCandidate(
          scope,
          body.releaseCandidateId
        )
        assertReleaseCandidatePublishAuthority({
          candidate: releaseCandidate,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        const preflight = await runCriticalSafetyPreflight({
          store: platform,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        if (!preflight.passed) {
          await appendPlatformAudit(
            audit,
            identity,
            correlationId,
            scope.tenantId,
            {
              event: 'version_publish_preflight_failed',
              tenantId: scope.tenantId,
              agentId,
              versionId,
              caseCount: preflight.caseCount,
              externalCall: preflight.externalCall,
              failedCaseIds: preflight.failures.map((failure) => failure.caseId)
            }
          )
          throw new DomainError(
            'invalid_action',
            'Critical safety preflight failed; version was not published'
          )
        }
        const published = await platform.publishVersion(
          scope,
          versionId,
          body.releaseCandidateId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_published',
            tenantId: scope.tenantId,
            agentId,
            versionId: published.id,
            version: published.version,
            safetyPreflight: {
              passed: preflight.passed,
              caseCount: preflight.caseCount
            }
          }
        )
        return ok(published, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/agents/:agentId/rollback', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      const body = z
        .object({
          versionId: AgentVersionIdSchema,
          releaseCandidateId: ReleaseCandidateIdSchema,
          expectedStatus: AgentVersionStatusSchema.optional()
        })
        .strict()
        .parse(request.body)
      const versionId = body.versionId
      const source = await platform.getVersion(scope, versionId)
      if (!source || source.agentId !== agentId) {
        throw new DomainError('invalid_action', 'Agent version not found')
      }
      const releaseCandidate = await platform.getReleaseCandidate(
        scope,
        body.releaseCandidateId
      )
      assertReleaseCandidatePublishAuthority({
        candidate: releaseCandidate,
        tenantId: scope.tenantId,
        agentId,
        versionId
      })
      const preflight = await runCriticalSafetyPreflight({
        store: platform,
        tenantId: scope.tenantId,
        agentId,
        versionId
      })
      if (!preflight.passed) {
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_rollback_preflight_failed',
            tenantId: scope.tenantId,
            agentId,
            sourceVersionId: versionId,
            caseCount: preflight.caseCount,
            externalCall: preflight.externalCall,
            failedCaseIds: preflight.failures.map((failure) => failure.caseId)
          }
        )
        throw new DomainError(
          'invalid_action',
          'Critical safety preflight failed; rollback was not published'
        )
      }
      const version = await platform.rollback(
        scope,
        agentId,
        versionId,
        identity.operatorId,
        body.releaseCandidateId,
        body.expectedStatus
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'version_rollback',
          tenantId: scope.tenantId,
          agentId,
          sourceVersionId: versionId,
          publishedVersionId: version.id,
          version: version.version,
          safetyPreflight: {
            passed: preflight.passed,
            caseCount: preflight.caseCount
          }
        }
      )
      return ok(version, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/test-lab/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const body = TestLabRequestSchema.parse(request.body)
      const trace = await runTestLab({
        store: platform,
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        message: body.message,
        history: body.history,
        ...(options.resolveApprovedKnowledge
          ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
          : {}),
        ...(body.approvedKnowledge && !options.resolveApprovedKnowledge
          ? { approvedKnowledge: body.approvedKnowledge }
          : {})
      })
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'test_lab_completed',
          tenantId: scope.tenantId,
          agentId: trace.agentId,
          versionId: trace.versionId,
          traceId: trace.traceId,
          externalCall: trace.provider.externalCall
        }
      )
      emitRuntimeLog({
        event: 'platform.test_lab_completed',
        correlationId,
        route: '/v1/admin/test-lab/runs',
        status: 'ok',
        resourceId: trace.traceId
      })
      return ok(trace, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/test-lab/suites', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const suite = await platform.createTestSuite(
        scope,
        TestSuiteCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'test_suite_created',
          tenantId: scope.tenantId,
          suiteId: suite.id,
          agentId: suite.agentId,
          versionId: suite.versionId,
          version: suite.version
        }
      )
      return ok(suite, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/test-lab/suites', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const query = z
        .object({ agentId: AgentIdSchema })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listTestSuites(scope, query.agentId),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/clone',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        return ok(
          await platform.cloneTestSuite(
            scope,
            params.suiteId,
            TestSuiteCloneInputSchema.parse(request.body),
            identity.operatorId
          ),
          correlationId
        )
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/evaluate',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'test:run',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        const body = z
          .object({ versionId: AgentVersionIdSchema.optional() })
          .strict()
          .parse(request.body)
        const suite = await platform.getTestSuite(scope, params.suiteId)
        if (!suite)
          throw new DomainError('invalid_action', 'Test suite not found')
        const versionId = body.versionId ?? suite.versionId
        const variant = await evaluateTestSuiteVariant({
          store: platform,
          tenantId: scope.tenantId,
          agentId: suite.agentId,
          versionId,
          cases: suite.cases,
          label: 'A',
          ...(options.resolveApprovedKnowledge
            ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
            : {})
        })
        const run = await recordSuiteRun({
          platform,
          scope,
          suite,
          variants: [variant],
          createdBy: identity.operatorId
        })
        return ok(run, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/compare',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'test:run',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        const body = z
          .object({
            versionAId: AgentVersionIdSchema,
            versionBId: AgentVersionIdSchema
          })
          .strict()
          .parse(request.body)
        const suite = await platform.getTestSuite(scope, params.suiteId)
        if (!suite)
          throw new DomainError('invalid_action', 'Test suite not found')
        const variants: TestSuiteVariantResult[] = await Promise.all([
          evaluateTestSuiteVariant({
            store: platform,
            tenantId: scope.tenantId,
            agentId: suite.agentId,
            versionId: body.versionAId,
            cases: suite.cases,
            label: 'A',
            ...(options.resolveApprovedKnowledge
              ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
              : {})
          }),
          evaluateTestSuiteVariant({
            store: platform,
            tenantId: scope.tenantId,
            agentId: suite.agentId,
            versionId: body.versionBId,
            cases: suite.cases,
            label: 'B',
            ...(options.resolveApprovedKnowledge
              ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
              : {})
          })
        ])
        return ok(
          await recordSuiteRun({
            platform,
            scope,
            suite,
            variants,
            createdBy: identity.operatorId
          }),
          correlationId
        )
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/admin/test-lab/suites/:suiteId/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const params = z
        .object({ suiteId: TestSuiteIdSchema })
        .strict()
        .parse(request.params)
      const limit = parseTraceLimit(request.query)
      const items = await platform.listTestSuiteRuns(
        scope,
        params.suiteId,
        limit
      )
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/test-lab/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const limit = parseTraceLimit(request.query)
      const items = await platform.listTestRuns(scope, limit)
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/execution-traces', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'audit:view_full',
        operatorIdentityResolver
      )
      const limit = parseTraceLimit(request.query)
      const items = await platform.listExecutionTraces(scope, limit)
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/test-lab/evaluate', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const body = TestLabEvaluationRequestSchema.parse(request.body)
      const result = await evaluateTestLabSuite({
        store: platform,
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        cases: body.cases,
        ...(options.resolveApprovedKnowledge
          ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
          : {})
      })
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'test_lab_evaluated',
          tenantId: scope.tenantId,
          agentId: body.agentId,
          versionId: body.versionId,
          caseCount: result.results.length,
          passed: result.passed
        }
      )
      return ok(result, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

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
  const { webhookReplayStore, ...buildOptions } = options
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
