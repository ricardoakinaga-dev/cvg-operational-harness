import { performance } from 'node:perf_hooks'
import Fastify from 'fastify'
import {
  auditEvidenceGovernance,
  createCorrelationId,
  DomainError,
  fail,
  IDENTITY_MODE_ENV,
  ok,
  parseIdentityMode,
  parseOperatorIdentity,
  redactSensitiveText,
  roleHasPermission,
  ResolveApprovalSchema,
  sanitizeAuditEvidencePayload,
  TaskStatusSchema,
  toSafeError,
  type Channel,
  type IdentityMode,
  type OperatorIdentity,
  type OperatorIdentityResolver,
  type TaskStatus
} from '@cvg/shared'
import {
  AgentConfigSchema,
  AgentIdSchema,
  AgentVersionIdSchema,
  AgentVersionStatusSchema,
  ApprovedKnowledgeForTestSchema,
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
  canBotRespond,
  createControlledCapabilityGateway,
  createTestSuiteRunId,
  executeConfiguredAgent,
  InMemoryControlPlaneStore,
  TenantIdSchema,
  TestLabCaseSchema,
  TestSuiteCloneInputSchema,
  TestSuiteCreateInputSchema,
  TestSuiteIdSchema,
  runCriticalSafetyPreflight,
  assessConversationSafety,
  evaluateTestLabSuite,
  runTestLab,
  InMemoryCapabilityApprovalAuthority,
  sanitizeTraceForPersistence,
  type AgentExecutionActor,
  type CapabilityActorAuthorizer,
  type CapabilityApproval,
  type CapabilityApprovalAuthority,
  type CapabilityApprovalRecord,
  type CapabilityApprovalResolver,
  type CapabilityGateway,
  type ApprovedKnowledgeForTest,
  type ApprovedKnowledgeResolver,
  type AgentId,
  type PluginAuditEvent,
  type TenantId,
  type AgentVersionId,
  type ControlPlaneStore,
  type TestLabCase,
  type TestSuiteRecord,
  type TestSuiteRunRecord,
  type TestSuiteVariantResult
} from '@cvg/platform'
import {
  JourneyRepository,
  PostgresJourneyRepository,
  ensureControlledSecretaryPreset,
  registerSecretaryJourneyRoutes,
  type JourneyRepositoryPort
} from './legacy-composition.ts'
import {
  ApprovalEngine,
  ApprovalRepository,
  ApprovalError,
  DurableApprovalEngineAdapter,
  type ApprovalAuthority,
  type AuditEventRecord,
  type AuditEventType,
  type AuditEvidenceFilters,
  type AuditEvidenceQuery,
  AuditEvidenceCheckpointCreateInputSchema,
  AuditEvidenceCheckpointIdSchema,
  AuditEvidenceCheckpointTransitionInputSchema,
  type AuditEvidenceCheckpointCreateInput,
  type AuditEvidenceCheckpointRecord,
  AuditRepository,
  ConversationRepository,
  type DurableOutboxAdapter,
  InMemoryDatabase,
  OutboxRepository,
  PostgresApprovalAuthority,
  PostgresOperationalExecutionStore,
  PostgresRuntimeRepository,
  PostgresControlPlaneRepository,
  TenantScopedPostgresCapabilityApprovalRepository,
  TenantScopedPostgresRuntimeRepository,
  TenantScopedPostgresControlPlaneRepository,
  type InboundRuntimeCompletionInput,
  type PostgresPoolClient,
  type PostgresPoolLike,
  type SessionRecord,
  runPostgresMigrations,
  TaskRepository,
  type PostgresQueryable
} from '@cvg/persistence'
import {
  createInternalTask,
  createInboundIdempotencyKey,
  executePublishedAgent,
  getConversationTimeline,
  receiveInboundMessage,
  requestHumanApproval
} from '@cvg/agent-core'
import { CompositeTelemetry, type Telemetry } from '@cvg/observability'
import {
  createInMemoryOperationalExecutionStore,
  OperationalExecutionError,
  deriveExecutionResume,
  parseExecutionSubmission,
  readExecutionTrajectory,
  toExecutionView,
  type ExecutionStepStore,
  type OperationalExecutionStore
} from '@cvg/harness'
import { Pool } from 'pg'
import { z } from 'zod'
import {
  installHttpSecurityHooks,
  normalizeHttpSecurityOptions,
  parseHttpSecurityEnv,
  type HttpSecurityOptions
} from './http-security.ts'
import {
  createConfiguredRateLimitKeyRing,
  InMemoryRateLimiter,
  PostgresRateLimiter
} from './rate-limit.ts'
import type { RateLimiterPort } from './rate-limit.ts'
import {
  decodeTrustedOperatorTokenClaims,
  TRUSTED_OPERATOR_TOKEN_HEADER
} from './operator-identity.ts'
import {
  clearOperatorSessionCookie,
  createInMemoryOperatorSessionStore,
  parseOperatorSessionCookie,
  type OperatorSessionRecord,
  type OperatorSessionStore,
  serializeOperatorSessionCookie
} from './operator-session.ts'
import { installOperatorSessionHook } from './operator-session-hook.ts'
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
import {
  classifyPaginationOffset,
  PAGINATION_OFFSET_ERROR_MESSAGE
} from './pagination-boundary.ts'
import { classifyAuditFilterValue } from './audit-filter-duplicate-boundary.ts'
import {
  HmacWebhookVerifier,
  PostgresWebhookReplayStore,
  type WebhookReplayStore,
  type WebhookVerificationLease
} from './webhook-security.ts'

export interface RuntimeLogEntry {
  event: string
  correlationId: string
  route: string
  status: 'ok' | 'error'
  sessionId?: string | null
  conversationId?: string | null
  resourceId?: string | null
  errorCode?: string
}

export type { OperatorIdentityResolver } from '@cvg/shared'

export type WebhookVerification = boolean | WebhookVerificationLease | null

export type WebhookVerifier = (input: {
  headers: Record<string, unknown>
  body: unknown
  channel: string
  rawBody?: string
}) => WebhookVerification | Promise<WebhookVerification>

export type InboundRuntimeCompletion = (
  input: InboundRuntimeCompletionInput
) => Promise<{ status: 'completed' | 'paused' }>

export type InboundTenantResolver = (input: {
  headers: Record<string, unknown>
  body: unknown
  channel: Channel
}) => TenantId | Promise<TenantId>

export interface AgentRuntimeOptions {
  resolveAgentId: (input: {
    tenantId: TenantId
    channel: Channel
    senderRef: string
  }) => AgentId | null | Promise<AgentId | null>
  approvedKnowledge?: ApprovedKnowledgeForTest
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
  capabilityGateway?: CapabilityGateway
  actor?: AgentExecutionActor
  resolveCapabilityApproval?: CapabilityApprovalResolver
  completeInboundRuntime?: InboundRuntimeCompletion
}

const CONTROLLED_CAPABILITY_PERMISSION = 'scheduling:read'
const serverCapabilityActorAuthorizer: CapabilityActorAuthorizer = ({
  actor,
  requiredPermission
}) => {
  if (requiredPermission !== CONTROLLED_CAPABILITY_PERMISSION) return []
  if (actor.role === 'System') {
    return actor.id.startsWith('system.') ? [requiredPermission] : []
  }
  return ['Operator', 'Approver', 'Supervisor', 'Admin'].includes(actor.role)
    ? [requiredPermission]
    : []
}

export interface BuildServerOptions {
  runtimeLogger?: (entry: RuntimeLogEntry) => void
  /** Optional composed telemetry; defaults to a bounded local facade. */
  telemetry?: Telemetry
  persistence?:
    | { kind: 'memory' }
    | { kind: 'postgres'; client: PostgresQueryable }
    | { kind: 'postgres-pool'; pool: PostgresPoolLike }
  platform?: ControlPlaneStore
  operatorIdentityResolver?: OperatorIdentityResolver
  /**
   * Explicit browser session authority. Local implementations are for
   * controlled fixtures only; production must inject an owned durable store.
   */
  operatorSessionStore?: OperatorSessionStore
  /**
   * Explicit identity mode. Defaults to `simulation` only for `NODE_ENV=test`;
   * every other environment defaults to `trusted` and must inject a resolver.
   */
  identityMode?: IdentityMode
  webhookVerifier?: WebhookVerifier
  inboundTenantResolver?: InboundTenantResolver
  agentRuntime?: AgentRuntimeOptions
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
  capabilityApprovalAuthority?: CapabilityApprovalAuthority
  requireAuthenticatedMutations?: boolean
  httpSecurity?: HttpSecurityOptions
  requestMetrics?: ControlledRequestMetrics
  requestMetricsEnabled?: boolean
  /**
   * Queue inbound work for the durable worker contract. Inline execution stays
   * the default for existing controlled fixtures until this flag is enabled.
   */
  durableInbound?: boolean
  /** Explicit adapter override, useful for deterministic controlled tests. */
  outbox?: DurableOutboxAdapter
  /**
   * REM21-003 / AUD19-006 — distributed token-replay authority. When set
   * with trusted identity mode, an onRequest hook authenticates each
   * presented token before claiming its id, so replays are rejected across
   * processes and restarts. Omitted: the resolver keeps its process-local
   * replay cache.
   */
  tokenReplayStore?: WebhookReplayStore
  /**
   * AUD19-006 — rate limiter authority. Defaults to process-local memory,
   * while `buildServerFromEnv` explicitly wires PostgreSQL for durable
   * deployments. Store errors deny (fail-closed).
   */
  rateLimiter?: RateLimiterPort
  /**
   * Extra bounded readiness probes (for example the consumer heartbeat wired
   * by the integrated composition). The database probe is built from
   * `persistence` and needs no injection.
   */
  readinessProbes?: readonly ReadinessProbe[]
  /**
   * Explicit journey persistence override. Omitted: memory uses the in-memory
   * repository and PostgreSQL constructs PostgresJourneyRepository or fails
   * startup. `null` keeps the journey routes fail-closed because no journey
   * adapter is available.
   */
  journeyRepository?: JourneyRepositoryPort | null
  /** Neutral Phase 2 execution authority. Memory is for controlled tests only. */
  operationalExecution?: OperationalExecutionStore
  /** Durable approval authority paired with the neutral execution spine. */
  operationalApprovalAuthority?: ApprovalAuthority
  /**
   * Phase 3 step/checkpoint authority. When present, the safe trajectory
   * export becomes available; it never exposes payloads or reasoning.
   */
  executionSteps?: ExecutionStepStore
}

export type BuildServerFromEnvOptions = Omit<
  BuildServerOptions,
  'persistence'
> & {
  webhookReplayStore?: WebhookReplayStore
}

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
  const httpSecurity = normalizeHttpSecurityOptions(options.httpSecurity)
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
      routerOptions: { maxParamLength: HTTP_REQUEST_MAX_PARAM_LENGTH }
    }),
    {
      persistence,
      platform,
      requestMetrics,
      operationalExecution,
      operationalApprovalAuthority,
      operationalApprovals,
      telemetry
    }
  )
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
  app.addHook('onRequest', async (request, reply) => {
    const targetFailure = classifyHttpRequestTarget(request.raw.url)
    if (!targetFailure) return

    reply.code(targetFailure.statusCode)
    return reply.send(
      fail(targetFailure.code, targetFailure.message, createCorrelationId())
    )
  })
  installHttpSecurityHooks(app, httpSecurity)
  installResponseCorrelationHook(app)
  if (identityMode === 'trusted' && options.operatorSessionStore) {
    installOperatorSessionHook({
      app,
      enforceHttps: httpSecurity.enforceHttps,
      operatorSessionStore: options.operatorSessionStore,
      sessionIdentityByHeaders,
      sessionRecordByHeaders,
      sessionStoreFailureByHeaders
    })
  }
  app.addHook('onRequest', async (request) => {
    requestStartedAt.set(request, performance.now())
  })
  app.addHook('onResponse', async (request, reply) => {
    const startedAt = requestStartedAt.get(request) ?? performance.now()
    const latencyMs = Math.max(0, performance.now() - startedAt)
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
      let record: OperatorSessionRecord
      try {
        record = await options.operatorSessionStore.create({
          identity,
          expiresAt: Number(claims.exp) * 1000
        })
      } catch {
        reply.code(503)
        return fail(
          'configuration_error',
          'Operator session store is unavailable',
          correlationId
        )
      }
      reply.header(
        'set-cookie',
        serializeOperatorSessionCookie(record, httpSecurity.enforceHttps)
      )
      if (existing) {
        try {
          await options.operatorSessionStore.revoke(existing.sessionId)
        } catch {
          try {
            await options.operatorSessionStore.revoke(record.sessionId)
          } catch {
            // Best effort cleanup; the response remains fail-closed below.
          }
          reply
            .code(503)
            .header('cache-control', 'no-store')
            .header(
              'set-cookie',
              clearOperatorSessionCookie(httpSecurity.enforceHttps)
            )
          return fail(
            'configuration_error',
            'Operator session store is unavailable',
            correlationId
          )
        }
      }
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
        clearOperatorSessionCookie(httpSecurity.enforceHttps)
      )
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/session/logout', async (request, reply) => {
    const correlationId = createCorrelationId()
    reply.header('cache-control', 'no-store')
    reply.header(
      'set-cookie',
      clearOperatorSessionCookie(httpSecurity.enforceHttps)
    )
    try {
      const sessionId = parseOperatorSessionCookie(request.headers.cookie)
      if (sessionId && options.operatorSessionStore) {
        await options.operatorSessionStore.revoke(sessionId)
      }
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
      const result = await operationalExecution.submit(submission)
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
            execution: toExecutionView(result.record),
            processing: 'queued' as const,
            created: result.created
          },
          correlationId
        )
      )
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError ? error : toSafeError(error)
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

  app.get('/v1/executions/:executionId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { executionId?: unknown }
      if (typeof params.executionId !== 'string') {
        throw new DomainError('validation_failed', 'Execution id is required')
      }
      const record = await operationalExecution.get(
        tenantId,
        params.executionId
      )
      if (!record) throw new DomainError('not_found', 'Execution not found')
      return reply.send(ok(toExecutionView(record), correlationId))
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError ? error : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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
            execution: toExecutionView(resumed),
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

  app.get('/v1/executions/:executionId/trajectory', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { executionId?: unknown }
      if (typeof params.executionId !== 'string') {
        throw new DomainError('validation_failed', 'Execution id is required')
      }
      if (!options.executionSteps) {
        throw new DomainError(
          'invalid_action',
          'Trajectory export is not configured'
        )
      }
      const record = await operationalExecution.get(
        tenantId,
        params.executionId
      )
      if (!record) throw new DomainError('not_found', 'Execution not found')
      const trajectory = await readExecutionTrajectory(
        options.executionSteps,
        tenantId,
        record.id
      )
      reply.code(200)
      return reply.send(ok({ trajectory }, correlationId))
    } catch (error) {
      const safeError =
        error instanceof OperationalExecutionError ? error : toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'execution.trajectory_failed',
        correlationId,
        route: '/v1/executions/:executionId/trajectory',
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
            execution: toExecutionView(cancelled),
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
        const execution = await operationalExecution.get(
          tenantId,
          params.executionId
        )
        if (!execution) {
          throw new DomainError('not_found', 'Execution not found')
        }
        if (execution.approvalId !== params.approvalId) {
          throw new DomainError('not_found', 'Approval not found')
        }
        let approval = await operationalApprovalAuthority.get(
          tenantId,
          params.approvalId
        )
        if (
          approval.executionRef !== execution.id ||
          approval.agentId !== execution.request.runtime.agent.id ||
          approval.agentVersion !== execution.request.runtime.agent.version ||
          approval.correlationId !== execution.request.runtime.correlationId
        ) {
          throw new DomainError('not_found', 'Approval not found')
        }
        const decision = body.decision
        const decisionReason = body.note
        const decisionActorType =
          identity.role === 'Supervisor' ? ('Supervisor' as const) : 'Approver'
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
        reply.code(decision === 'APPROVED' ? 202 : 200)
        return reply.send(
          ok(
            {
              execution: toExecutionView(resolved),
              approvalId: approval.approvalId,
              decision,
              processing: decision === 'APPROVED' ? 'queued' : 'terminal'
            },
            correlationId
          )
        )
      } catch (error) {
        const safeError =
          error instanceof ApprovalError
            ? operationalApprovalError(error)
            : error instanceof OperationalExecutionError
              ? error
              : toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
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

  app.get('/v1/conversations', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const pagination = parsePagination(request.query)
      if (!pagination) {
        throw new DomainError(
          'invalid_pagination',
          `limit must be between 1 and 100 and ${PAGINATION_OFFSET_ERROR_MESSAGE}`
        )
      }

      const page = await conversations.listPage(tenantId, pagination)
      emitRuntimeLog({
        event: 'conversation.list_read',
        correlationId,
        route: '/v1/conversations',
        status: 'ok'
      })
      return ok(page, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'conversation.list_failed',
        correlationId,
        route: '/v1/conversations',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

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
                audit,
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
          await audit.append(
            {
              type: 'integration_event',
              actorType: 'System',
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
                      externalCall:
                        runtime.trace?.provider.externalCall ?? false
                    }
                  : {})
              }
            },
            tenantId
          )
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
        const safeError = toSafeError(error)
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
      await audit.append(
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
        tenantId
      )
      return ok(session, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get(
    '/v1/conversations/:conversationId/timeline',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(
          request.headers,
          'conversation:view_assigned'
        )
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as { conversationId: string }
        const timeline = await getConversationTimeline(
          conversations,
          tenantId,
          params.conversationId
        )
        if (timeline.messages.length === 0 && timeline.sessions.length === 0) {
          throw new DomainError('invalid_action', 'Conversation not found')
        }
        return ok(timeline, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  registerSecretaryJourneyRoutes(app, {
    journeys,
    requireIdentity,
    requireAuthenticatedMutations,
    resolveDataPlaneTenant,
    resolveOptionalRequestTenant,
    statusCodeForError
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
      const task = await createInternalTask({ tasks }, request.body, tenantId)
      await audit.append(
        {
          type: 'integration_event',
          actorType: 'System',
          actorId: 'api',
          correlationId,
          policyVersion: 'api-runtime-v1',
          payload: {
            sessionId: task.sessionId,
            taskId: task.id,
            source: task.source,
            tenantId
          }
        },
        tenantId
      )
      emitRuntimeLog({
        event: 'task.created',
        correlationId,
        route: '/v1/tasks',
        status: 'ok',
        sessionId: task.sessionId,
        resourceId: task.id
      })
      return ok(task, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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
      return ok(await tasks.list(tenantId), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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
      const existing = await tasks.findById(params.taskId, tenantId)
      if (!existing) {
        throw new DomainError('invalid_action', 'Task not found')
      }
      assertTaskTransition(existing.status, status.data)
      const updated = await tasks.updateStatus(
        params.taskId,
        status.data,
        tenantId
      )
      if (!updated) {
        throw new DomainError('invalid_action', 'Task not found')
      }
      await audit.append(
        {
          type: 'integration_event',
          actorType: identity.role,
          actorId: identity.operatorId,
          correlationId,
          policyVersion: 'api-runtime-v1',
          payload: {
            sessionId: updated.sessionId,
            taskId: updated.id,
            fromStatus: existing.status,
            toStatus: updated.status,
            effect: 'internal_task_state_only',
            tenantId
          }
        },
        tenantId
      )
      emitRuntimeLog({
        event: 'task.status_changed',
        correlationId,
        route: '/v1/tasks/:taskId/status',
        status: 'ok',
        sessionId: updated.sessionId,
        resourceId: updated.id
      })
      return ok(updated, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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
      const approval = await approvals.save(requestedApproval, tenantId)
      await audit.append(
        {
          type: 'approval_decision',
          actorType: requester?.role ?? 'System',
          actorId: requester?.operatorId ?? 'api',
          correlationId,
          policyVersion: 'api-runtime-v1',
          payload: {
            sessionId: approval.sessionId,
            approvalRequestId: approval.id,
            status: approval.status,
            tenantId
          }
        },
        tenantId
      )
      emitRuntimeLog({
        event: 'approval.created',
        correlationId,
        route: '/v1/approvals',
        status: 'ok',
        sessionId: approval.sessionId,
        resourceId: approval.id
      })
      return ok(approval, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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
        const decided = await approvals.decideWithAudit(
          {
            approvalRequestId: parsedBody.approvalRequestId,
            decision: parsedBody.decision,
            operatorId: parsedBody.operatorId,
            role: identity.role,
            correlationId,
            ...(parsedBody.note === undefined ? {} : { note: parsedBody.note })
          },
          tenantId
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
        return ok(decided, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
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
      return ok(await approvals.list(tenantId), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
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

  app.get('/v1/audit/sessions/:sessionId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAnyIdentity(request.headers, [
        'audit:view_full',
        'audit:view_limited'
      ])
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const params = request.params as { sessionId: string }
      const events = await audit.listBySession(params.sessionId, tenantId)
      if (events.length === 0) {
        throw new DomainError('invalid_action', 'Audit session not found')
      }
      emitRuntimeLog({
        event: 'audit.session_read',
        correlationId,
        route: '/v1/audit/sessions/:sessionId',
        status: 'ok',
        sessionId: params.sessionId
      })
      return ok({ events }, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

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

  return app
}

const CONTROLLED_TENANT_ID = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000001'
)

async function evaluateTestSuiteVariant(input: {
  store: ControlPlaneStore
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionId
  cases: TestLabCase[]
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
  label: 'A' | 'B'
}): Promise<TestSuiteVariantResult> {
  const version = await input.store.getVersion(
    { tenantId: input.tenantId },
    input.versionId
  )
  if (!version || version.agentId !== input.agentId) {
    throw new DomainError(
      'invalid_action',
      'A/B version is outside agent scope'
    )
  }
  const result = await evaluateTestLabSuite({
    store: input.store,
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: version.id,
    cases: input.cases,
    ...(input.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: input.resolveApprovedKnowledge }
      : {})
  })
  return {
    label: input.label,
    versionId: version.id,
    passed: result.passed,
    results: result.results
  }
}

async function recordSuiteRun(input: {
  platform: ControlPlaneStore
  scope: { tenantId: TenantId }
  suite: TestSuiteRecord
  variants: TestSuiteVariantResult[]
  createdBy: string
}): Promise<TestSuiteRunRecord> {
  const run: TestSuiteRunRecord = {
    id: createTestSuiteRunId(),
    tenantId: input.scope.tenantId,
    suiteId: input.suite.id,
    agentId: input.suite.agentId,
    variants: input.variants,
    passed: input.variants.every((variant) => variant.passed),
    createdBy: input.createdBy,
    createdAt: new Date()
  }
  return input.platform.recordTestSuiteRun(input.scope, run)
}

async function executeInboundRuntime(input: {
  options: AgentRuntimeOptions
  platform: ControlPlaneStore
  tenantId: TenantId
  correlationId: string
  channel: Channel
  senderRef: string
  message: string
  conversationId: string
  sessionId: string | null
  messageId: string
  audit: RuntimePersistence['audit']
  conversations: RuntimePersistence['conversations']
  sessionVersionPinning: boolean
}) {
  let history: string[] = []
  let session: SessionRecord | null = null
  let parsedAgentId: AgentId | undefined
  let pinnedVersionId: AgentVersionId | undefined
  const toolAuditEvents: PluginAuditEvent[] = []
  if (input.sessionId) {
    const timeline = await getConversationTimeline(
      input.conversations,
      input.tenantId,
      input.conversationId
    )
    session =
      timeline.sessions.find((candidate) => candidate.id === input.sessionId) ??
      null
    if (!session) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    if (!canBotRespond(session.takeoverState)) {
      return {
        status: 'paused' as const,
        trace: null,
        reason: 'human_takeover_active' as const
      }
    }
    const timelineHistory = timeline.messages
      .filter((message) => message.id !== input.messageId)
      .map(
        (message) =>
          `${message.direction}: ${redactSensitiveText(message.body)}`
      )
    const historicalSafety = assessConversationSafety('', timelineHistory)
    history = timelineHistory.slice(-20)
    // Keep the model context bounded without discarding an older safety
    // signal. The marker carries no user text and is intentionally lexical so
    // the independent Test Lab gate remains conservative after truncation.
    if (historicalSafety.level === 'critical') {
      history = ['history: medication safety signal', ...history]
    } else if (historicalSafety.level === 'high') {
      history = ['history: unresolved symptom dor signal', ...history]
    }
  }
  if (session) {
    const hasAgent = session.agentId !== undefined
    const hasVersion = session.agentVersionId !== undefined
    if (hasAgent !== hasVersion) {
      throw new DomainError(
        'invalid_action',
        'Session agent binding is incomplete'
      )
    }
    if (hasAgent && hasVersion) {
      parsedAgentId = AgentIdSchema.parse(session.agentId)
      pinnedVersionId = AgentVersionIdSchema.parse(session.agentVersionId)
    }
  }
  if (!parsedAgentId) {
    const agentId = await input.options.resolveAgentId({
      tenantId: input.tenantId,
      channel: input.channel,
      senderRef: input.senderRef
    })
    if (!agentId) {
      await input.conversations.markInboundRuntimeCompleted(
        input.messageId,
        input.tenantId
      )
      return {
        status: 'not_configured' as const,
        trace: null,
        reason: 'agent_mapping_missing' as const
      }
    }
    parsedAgentId = AgentIdSchema.parse(agentId)
    if (session && input.sessionVersionPinning) {
      const published = await input.platform.resolvePublished(
        { tenantId: input.tenantId },
        parsedAgentId
      )
      if (!published) {
        await input.conversations.markInboundRuntimeCompleted(
          input.messageId,
          input.tenantId
        )
        return {
          status: 'not_configured' as const,
          trace: null,
          reason: 'published_version_missing' as const
        }
      }
      if (!input.sessionId) {
        throw new DomainError(
          'invalid_action',
          'Session id is required for runtime pinning'
        )
      }
      const bound = await input.conversations.bindSessionAgentVersion(
        input.tenantId,
        input.sessionId,
        parsedAgentId,
        published.id
      )
      if (!bound?.agentId || !bound.agentVersionId) {
        throw new DomainError(
          'invalid_action',
          'Session agent binding could not be established'
        )
      }
      parsedAgentId = AgentIdSchema.parse(bound.agentId)
      pinnedVersionId = AgentVersionIdSchema.parse(bound.agentVersionId)
    }
  }
  if (!parsedAgentId) {
    throw new DomainError(
      'invalid_action',
      'Agent mapping could not be resolved'
    )
  }
  const result = await executePublishedAgent({
    store: input.platform,
    tenantId: input.tenantId,
    agentId: parsedAgentId,
    ...(pinnedVersionId ? { versionId: pinnedVersionId } : {}),
    message: input.message,
    history,
    ...(input.options.capabilityGateway
      ? { capabilityGateway: input.options.capabilityGateway }
      : {}),
    ...(input.options.actor ? { actor: input.options.actor } : {}),
    ...(input.options.resolveCapabilityApproval
      ? { resolveCapabilityApproval: input.options.resolveCapabilityApproval }
      : {}),
    onToolAudit: async (event) => {
      if (input.options.completeInboundRuntime) {
        toolAuditEvents.push(event)
        return
      }
      await input.audit.append(
        {
          type: event.type,
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: event.correlationId,
          policyVersion: 'plugin-gateway-v1',
          payload: {
            tenantId: event.tenantId,
            agentId: event.agentId,
            versionId: event.versionId,
            traceId: event.traceId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            plugin: event.plugin,
            toolName: event.toolName,
            status: event.status,
            payload: event.payload
          }
        },
        event.tenantId
      )
    },
    context: {
      conversationId: input.conversationId,
      ...(input.sessionId ? { sessionId: input.sessionId } : {})
    },
    ...(input.options.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: input.options.resolveApprovedKnowledge }
      : {}),
    ...(input.options.approvedKnowledge &&
    !input.options.resolveApprovedKnowledge
      ? { approvedKnowledge: input.options.approvedKnowledge }
      : {})
  })
  if (result.status === 'completed') {
    const safeTrace = sanitizeTraceForPersistence(result.trace)
    if (input.options.completeInboundRuntime) {
      const completion = await input.options.completeInboundRuntime({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        sessionId: input.sessionId,
        inboundMessageId: input.messageId,
        trace: safeTrace,
        toolAuditEvents,
        correlationId: input.correlationId
      })
      if (completion.status === 'paused') {
        return {
          status: 'paused' as const,
          trace: null,
          reason: 'human_takeover_active' as const
        }
      }
      return { ...result, trace: safeTrace }
    }
    if (input.sessionId) {
      const latestTimeline = await getConversationTimeline(
        input.conversations,
        input.tenantId,
        input.conversationId
      )
      const latestSession = latestTimeline.sessions.find(
        (candidate) => candidate.id === input.sessionId
      )
      if (!latestSession || !canBotRespond(latestSession.takeoverState)) {
        return {
          status: 'paused' as const,
          trace: null,
          reason: 'human_takeover_active' as const
        }
      }
    }
    if (safeTrace.handoff.requested && input.sessionId) {
      const session = await input.conversations.transitionTakeover(
        input.tenantId,
        input.sessionId,
        'request_handoff'
      )
      if (!session) {
        throw new DomainError('invalid_action', 'Session not found')
      }
      await input.audit.append(
        {
          type: 'handoff',
          actorType: 'System',
          actorId: 'agent-runtime',
          correlationId: input.correlationId,
          policyVersion: 'human-takeover-v1',
          payload: {
            tenantId: input.tenantId,
            conversationId: input.conversationId,
            sessionId: input.sessionId,
            traceId: safeTrace.traceId,
            state: session.takeoverState,
            reason: safeTrace.handoff.reason,
            effect: 'human_handoff_requested'
          }
        },
        input.tenantId
      )
    }
    if (safeTrace.response.text.trim().length > 0) {
      await input.conversations.appendOutboundMessage({
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        externalMessageId: `runtime:${safeTrace.traceId}`,
        body: safeTrace.response.text
      })
    }
    await input.platform.recordExecutionTrace(
      { tenantId: input.tenantId },
      safeTrace
    )
    await input.conversations.markInboundRuntimeCompleted(
      input.messageId,
      input.tenantId
    )
    return { ...result, trace: safeTrace }
  }
  return result
}

function parseInboundChannel(rawChannel: string): Channel {
  const parsed = z.enum(['whatsapp', 'web', 'internal']).safeParse(rawChannel)
  if (!parsed.success) {
    throw new DomainError('validation_failed', 'Channel is invalid')
  }
  return parsed.data
}

async function resolveInboundTenant(
  input: Parameters<InboundTenantResolver>[0],
  resolver?: InboundTenantResolver
): Promise<TenantId> {
  if (resolver) return TenantIdSchema.parse(await resolver(input))
  if (process.env.NODE_ENV !== 'test') {
    throw new DomainError(
      'unauthorized',
      'A trusted inbound tenant resolver is required in production'
    )
  }
  const rawHeader = input.headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsed = TenantIdSchema.safeParse(candidate)
  return parsed.success ? parsed.data : CONTROLLED_TENANT_ID
}

function resolveDataPlaneTenant(
  headers: Record<string, unknown>,
  identity: OperatorIdentity
): TenantId {
  const rawHeader = headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsedHeader = TenantIdSchema.safeParse(candidate)
  if (
    identity.tenantId &&
    parsedHeader.success &&
    identity.tenantId !== parsedHeader.data
  ) {
    throw new DomainError(
      'forbidden',
      'Operator identity cannot access this tenant scope'
    )
  }
  if (process.env.NODE_ENV !== 'test' && !identity.tenantId) {
    throw new DomainError(
      'unauthorized',
      'Trusted operator tenant scope is required in production'
    )
  }
  return (
    identity.tenantId ??
    (parsedHeader.success ? parsedHeader.data : CONTROLLED_TENANT_ID)
  )
}

function resolveOptionalRequestTenant(
  headers: Record<string, unknown>
): TenantId {
  const rawHeader = headers['x-tenant-id']
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const parsed = TenantIdSchema.safeParse(candidate)
  if (process.env.NODE_ENV !== 'test' && !parsed.success) {
    throw new DomainError(
      'unauthorized',
      'Trusted tenant scope is required for this mutation'
    )
  }
  return parsed.success ? parsed.data : CONTROLLED_TENANT_ID
}

function requireOperatorIdentity(
  headers: Record<string, unknown>,
  permission: string,
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  try {
    const identity = resolveOperatorIdentity(headers, resolver)
    if (!roleHasPermission(identity.role, permission)) {
      throw new DomainError('forbidden', `Role cannot perform ${permission}`)
    }
    return identity
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError(
      'unauthorized',
      'Valid operator identity headers are required'
    )
  }
}

function requireAnyOperatorPermission(
  headers: Record<string, unknown>,
  permissions: string[],
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  try {
    const identity = resolveOperatorIdentity(headers, resolver)
    if (
      !permissions.some((permission) =>
        roleHasPermission(identity.role, permission)
      )
    ) {
      throw new DomainError('forbidden', 'Role cannot access this resource')
    }
    return identity
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError(
      'unauthorized',
      'Valid operator identity headers are required'
    )
  }
}

const TestLabRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    message: z.string().trim().min(1).max(4000),
    history: z.array(z.string().max(4000)).max(50).default([]),
    approvedKnowledge: ApprovedKnowledgeForTestSchema.optional()
  })
  .strict()

const VersionCloneRequestSchema = z
  .object({ config: AgentConfigSchema.optional() })
  .strict()

const TakeoverRequestSchema = z
  .object({
    event: z.enum([
      'request_handoff',
      'accept_handoff',
      'resolve_handoff',
      'release_to_bot'
    ])
  })
  .strict()

const TestLabEvaluationRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    cases: z.array(TestLabCaseSchema).min(1).max(100)
  })
  .strict()

const OperationalApprovalDecisionSchema = z
  .object({
    decision: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      z.enum(['APPROVED', 'REJECTED'])
    ),
    note: z.string().trim().max(500).optional()
  })
  .strict()

const OperationalExecutionCancelSchema = z
  .object({
    reason: z.string().trim().max(500).optional()
  })
  .strict()

const OperationalExecutionInputSchema = z
  .object({
    message: z.string().trim().min(1).max(32_000)
  })
  .strict()

const CapabilityApprovalParamsSchema = z
  .object({ approvalId: z.string().trim().min(1).max(160) })
  .strict()

const CapabilityApprovalIssueRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    toolName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
    actorId: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9._:-]+$/),
    input: z
      .object({
        message: z.string().trim().min(1).max(4000)
      })
      .strict(),
    expiresAt: z.coerce.date(),
    nonce: z
      .string()
      .trim()
      .min(8)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional()
  })
  .strict()
  .superRefine((input, context) => {
    const now = Date.now()
    const expiry = input.expiresAt.getTime()
    if (!Number.isFinite(expiry) || expiry <= now) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Approval expiry must be in the future'
      })
    } else if (expiry > now + 15 * 60 * 1000) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Approval lifetime cannot exceed 15 minutes'
      })
    }
  })

const CapabilityApprovalExecutionRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    history: z.array(z.string().max(4000)).max(50).default([]),
    approvedKnowledge: ApprovedKnowledgeForTestSchema.optional()
  })
  .strict()

function requirePlatformScope(
  headers: Record<string, unknown>,
  permission: string,
  resolver?: OperatorIdentityResolver
): { tenantId: z.infer<typeof TenantIdSchema> } {
  const identity = requireOperatorIdentity(headers, permission, resolver)
  const rawTenant = Array.isArray(headers['x-tenant-id'])
    ? headers['x-tenant-id'][0]
    : headers['x-tenant-id']
  const tenant = TenantIdSchema.safeParse(rawTenant)
  const scopedTenant = tenant.success
    ? tenant.data
    : identity.tenantId
      ? TenantIdSchema.parse(identity.tenantId)
      : null
  if (!scopedTenant) {
    throw new DomainError(
      'unauthorized',
      'Valid tenant scope headers are required'
    )
  }
  if (identity.tenantId && identity.tenantId !== scopedTenant) {
    throw new DomainError(
      'forbidden',
      'Operator identity cannot access this tenant scope'
    )
  }
  if (process.env.NODE_ENV !== 'test' && !identity.tenantId) {
    throw new DomainError(
      'unauthorized',
      'Trusted operator tenant scope is required in production'
    )
  }
  return { tenantId: scopedTenant }
}

function capabilityApprovalReference(
  record: CapabilityApprovalRecord
): CapabilityApproval {
  return {
    id: record.id,
    tenantId: record.tenantId,
    agentId: record.agentId,
    versionId: record.versionId,
    toolName: record.toolName,
    actorId: record.actorId,
    expiresAt: new Date(record.expiresAt.getTime())
  }
}

function resolveOperatorIdentity(
  headers: Record<string, unknown>,
  resolver?: OperatorIdentityResolver
): OperatorIdentity {
  if (resolver) return resolver(headers)
  if (process.env.NODE_ENV !== 'test') {
    throw new DomainError(
      'unauthorized',
      'A trusted operator identity resolver is required in production'
    )
  }
  return parseOperatorIdentity(headers)
}

/**
 * Trusted mode never falls back to simulation headers: without a resolver it
 * fails closed, and resolver identities must be tenant-bound so a
 * self-asserted tenant header can never widen scope. Simulation mode keeps the
 * controlled header flow, delegating to an injected resolver when present.
 */
function createEffectiveOperatorIdentityResolver(
  identityMode: IdentityMode,
  resolver: OperatorIdentityResolver | undefined
): OperatorIdentityResolver | undefined {
  if (!resolver) {
    if (identityMode === 'trusted') {
      return () => {
        throw new DomainError(
          'unauthorized',
          'A trusted operator identity resolver is required in production'
        )
      }
    }
    return undefined
  }
  if (identityMode === 'simulation') return resolver
  /**
   * Trusted resolvers enforce replay protection per token. Some platform/admin
   * routes resolve the identity more than once for the same request, so the
   * effective resolver memoizes per headers object: a replay is rejected only
   * when the same token is presented in a different request.
   */
  const memo = new WeakMap<object, OperatorIdentity>()
  return (headers) => {
    const cached = memo.get(headers)
    if (cached) return cached
    const identity = resolver(headers)
    if (!identity.tenantId) {
      throw new DomainError(
        'unauthorized',
        'Trusted operator identity must be tenant-bound'
      )
    }
    memo.set(headers, identity)
    return identity
  }
}

function createSessionAwareOperatorIdentityResolver(
  resolver: OperatorIdentityResolver | undefined,
  sessionStore: OperatorSessionStore | undefined,
  sessionIdentityByHeaders: WeakMap<object, OperatorIdentity | null>,
  requireSessionStore: boolean
): OperatorIdentityResolver | undefined {
  if (!resolver) return undefined
  if (requireSessionStore && !sessionStore) {
    return () => {
      throw new DomainError(
        'configuration_error',
        'Operator session store is required for trusted requests'
      )
    }
  }
  if (!sessionStore) return resolver
  return (headers) => {
    if (sessionIdentityByHeaders.has(headers)) {
      const identity = sessionIdentityByHeaders.get(headers)
      if (!identity) {
        throw new DomainError(
          'unauthorized',
          'Operator session is missing or expired'
        )
      }
      return identity
    }
    return resolver(headers)
  }
}

async function appendPlatformAudit(
  audit: RuntimePersistence['audit'],
  identity: OperatorIdentity,
  correlationId: string,
  tenantId: TenantId,
  payload: Record<string, unknown>
): Promise<void> {
  await audit.append(
    {
      type: 'integration_event',
      actorType: identity.role,
      actorId: identity.operatorId,
      correlationId,
      policyVersion: 'platform-control-plane-v1',
      payload
    },
    tenantId
  )
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

function statusCodeForError(code: string): number {
  if (code === 'unauthorized') return 401
  if (code === 'forbidden') return 403
  if (code === 'conflict') return 409
  if (code === 'rate_limited') return 429
  if (code === 'payload_too_large') return 413
  if (code === 'unsupported_media_type') return 415
  if (code === 'not_found') return 404
  if (code === 'request_uri_too_long') return 414
  if (code === 'configuration_error') return 503
  if (code === 'internal_error') return 500
  return 400
}

export {
  assertApprovalDecisionAuditDedupe,
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

function assertSafeRuntimeSchemaName(schemaName: string | undefined): void {
  if (schemaName && !/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('Invalid PostgreSQL schema name')
  }
}

/**
 * Builds a bounded database readiness probe from the configured persistence.
 * Pool connections are returned on success and destroyed on failure/timeout so
 * repeated probes cannot accumulate leaked clients.
 */
function createReadinessDatabaseProbe(
  persistence: BuildServerOptions['persistence']
): (() => Promise<void>) | undefined {
  if (!persistence || persistence.kind === 'memory') return undefined
  if (persistence.kind === 'postgres') {
    const client = persistence.client
    return async () => {
      await client.query('SELECT 1')
    }
  }
  const pool = persistence.pool
  // Keep admission occupied until the underlying acquisition/query settles.
  // A deadline cannot cancel pool.connect(), so admitting another probe while
  // it is pending would grow the pool queue on every health check.
  let occupied = false
  return async () => {
    if (occupied) throw new Error('readiness probe is still pending')
    occupied = true
    let expired = false
    let releaseClient: ((error?: Error) => void) | undefined
    const timeoutError = new Error('readiness probe timeout')
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        expired = true
        reject(timeoutError)
        releaseClient?.(timeoutError)
      }, 900)
      timer.unref?.()
    })
    const operation = (async () => {
      try {
        const client = await pool.connect()
        let released = false
        releaseClient = (error?: Error): void => {
          if (released) return
          released = true
          client.release(error)
        }
        if (expired) {
          releaseClient(timeoutError)
          throw timeoutError
        }
        try {
          await client.query('SELECT 1')
          if (expired) throw timeoutError
          releaseClient()
        } catch (error) {
          releaseClient(
            error instanceof Error ? error : new Error('readiness failed')
          )
          throw error
        }
      } finally {
        occupied = false
      }
    })()
    try {
      await Promise.race([operation, deadline])
    } finally {
      clearTimeout(timer)
    }
  }
}

function createPostgresPool(
  connectionString: string,
  schemaName: string | undefined
): Pool {
  assertSafeRuntimeSchemaName(schemaName)
  return new Pool({
    connectionString,
    ...(schemaName ? { options: `-c search_path=${schemaName}` } : {})
  })
}
import {
  assertApprovalDecisionAuditDedupe,
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

interface RuntimePersistence {
  /** Legacy direct-client fixtures do not have the tenant-scoped pin columns. */
  sessionVersionPinning: boolean
  outbox: DurableOutboxAdapter
  /** R3 controlled journey store: memory or tenant-scoped PostgreSQL adapter. */
  journeys: JourneyRepositoryPort | null
  conversations:
    | ConversationRepository
    | PostgresRuntimeRepository
    | TenantScopedPostgresRuntimeRepository

  tasks: {
    create: TaskRepository['create'] | PostgresRuntimeRepository['createTask']
    list: TaskRepository['list'] | PostgresRuntimeRepository['listTasks']
    findById:
      | TaskRepository['findById']
      | PostgresRuntimeRepository['findTaskById']
    updateStatus:
      | TaskRepository['updateStatus']
      | PostgresRuntimeRepository['updateTaskStatus']
  }
  approvals: {
    save: ApprovalRepository['save'] | PostgresRuntimeRepository['saveApproval']
    decideWithAudit:
      | ApprovalRepository['decideWithAudit']
      | PostgresRuntimeRepository['decideApprovalWithAudit']
    findById:
      | ApprovalRepository['findById']
      | PostgresRuntimeRepository['findApprovalById']
    list:
      | ApprovalRepository['list']
      | PostgresRuntimeRepository['listApprovals']
  }
  audit: {
    append: (
      input: Parameters<AuditRepository['append']>[0],
      tenantId?: TenantId
    ) => AuditEventRecord | Promise<AuditEventRecord>
    listBySession:
      | AuditRepository['listBySession']
      | PostgresRuntimeRepository['listAuditBySession']
    listEvidence:
      | AuditRepository['listEvidence']
      | PostgresRuntimeRepository['listAuditEvidence']
    summarizeEvidence:
      | AuditRepository['summarizeEvidence']
      | PostgresRuntimeRepository['summarizeAuditEvidence']
    createAuditEvidenceCheckpoint: (
      input: AuditEvidenceCheckpointCreateInput,
      createdBy: string,
      tenantId: TenantId
    ) => AuditEvidenceCheckpointRecord | Promise<AuditEvidenceCheckpointRecord>
    getAuditEvidenceCheckpoint: (
      id: string,
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord
      | null
      | Promise<AuditEvidenceCheckpointRecord | null>
    listAuditEvidenceCheckpoints: (
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord[]
      | Promise<AuditEvidenceCheckpointRecord[]>
    transitionAuditEvidenceCheckpoint: (
      id: string,
      status: 'SEALED' | 'ARCHIVED',
      updatedBy: string,
      expectedStatus: 'SEALED' | 'ARCHIVED',
      tenantId: TenantId
    ) =>
      | AuditEvidenceCheckpointRecord
      | null
      | Promise<AuditEvidenceCheckpointRecord | null>
  }
}

function sanitizeAuditEvidencePage(page: {
  items: Array<{ payload: unknown }>
  pageInfo: unknown
}) {
  const redactedFields = new Set<string>()
  const items = page.items.map((event) => {
    const sanitized = sanitizeAuditEvidencePayload(event.payload)
    sanitized.redactedFields.forEach((field) => redactedFields.add(field))
    return { ...event, payload: sanitized.payload }
  })

  return {
    page: { ...page, items },
    governance: {
      ...auditEvidenceGovernance,
      payload: {
        ...auditEvidenceGovernance.payload,
        redactedFields: Array.from(redactedFields)
      }
    }
  }
}

function assertTaskTransition(
  fromStatus: TaskStatus,
  toStatus: TaskStatus
): void {
  if (fromStatus === toStatus) return
  const allowed: Record<TaskStatus, TaskStatus[]> = {
    open: ['in_progress', 'done', 'canceled'],
    in_progress: ['done', 'canceled'],
    done: [],
    canceled: []
  }
  if (!allowed[fromStatus].includes(toStatus)) {
    throw new DomainError(
      'invalid_action',
      'Task status transition is not allowed'
    )
  }
}

function parsePagination(
  query: unknown
): { limit: number; offset: number } | null {
  const params = query as { limit?: unknown; offset?: unknown }
  const limit = params.limit === undefined ? 25 : Number(params.limit)
  const rawOffset = params.offset === undefined ? 0 : params.offset
  const offsetFailure = classifyPaginationOffset(rawOffset)

  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || offsetFailure) {
    return null
  }

  const offset = Number(rawOffset)
  return { limit, offset }
}

function parseTraceLimit(query: unknown): number {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25)
    })
    .strict()
    .safeParse(query)
  if (!parsed.success) {
    throw new DomainError(
      'invalid_pagination',
      'limit must be between 1 and 100'
    )
  }
  return parsed.data.limit
}

const auditEventTypes: AuditEventType[] = [
  'tool_call',
  'safety_event',
  'integration_event',
  'policy_decision',
  'approval_decision',
  'handoff'
]

function parseAuditEvidenceQuery(query: unknown): {
  query: AuditEvidenceQuery
  filters: AuditEvidenceFilters
} {
  const pagination = parsePagination(query)
  if (!pagination) {
    throw new DomainError(
      'invalid_pagination',
      `limit must be between 1 and 100 and ${PAGINATION_OFFSET_ERROR_MESSAGE}`
    )
  }
  const params = query as Record<string, unknown>
  const filters: AuditEvidenceFilters = {}
  const sessionId = parseOptionalAuditFilter(params.sessionId)
  const correlationId = parseOptionalAuditFilter(params.correlationId)
  const actorId = parseOptionalAuditFilter(params.actorId)
  const type = parseOptionalAuditFilter(params.type)

  if (sessionId) filters.sessionId = sessionId
  if (correlationId) filters.correlationId = correlationId
  if (actorId) filters.actorId = actorId
  if (type) {
    if (!auditEventTypes.includes(type as AuditEventType)) {
      throw new DomainError('validation_failed', 'Audit event type is invalid')
    }
    filters.type = type as AuditEventType
  }

  return { query: { ...pagination, ...filters }, filters }
}

function parseOptionalAuditFilter(value: unknown): string | undefined {
  if (value === undefined) return undefined
  const duplicateFailure = classifyAuditFilterValue(value)
  if (duplicateFailure) {
    throw new DomainError(duplicateFailure.code, duplicateFailure.message)
  }
  if (typeof value !== 'string') {
    throw new DomainError(
      'validation_failed',
      'Audit evidence filters must be strings'
    )
  }
  const trimmed = value.trim()
  if (
    trimmed.length === 0 ||
    trimmed.length > 120 ||
    !/^[A-Za-z0-9._:-]+$/.test(trimmed)
  ) {
    throw new DomainError(
      'validation_failed',
      'Audit evidence filter is invalid'
    )
  }
  return trimmed
}

function createPersistence(
  config: BuildServerOptions['persistence'],
  journeyRepository?: JourneyRepositoryPort | null
): RuntimePersistence {
  if (config?.kind === 'postgres' || config?.kind === 'postgres-pool') {
    const postgres =
      config.kind === 'postgres'
        ? new PostgresRuntimeRepository(config.client)
        : new TenantScopedPostgresRuntimeRepository(config.pool)
    const journeys =
      journeyRepository !== undefined
        ? journeyRepository
        : createPostgresJourneyRepository(config)
    return {
      sessionVersionPinning: config.kind === 'postgres-pool',
      outbox: postgres as unknown as DurableOutboxAdapter,
      journeys,
      conversations: postgres,
      tasks: {
        create: (
          input: Parameters<PostgresRuntimeRepository['createTask']>[0],
          tenantId?: TenantId
        ) => postgres.createTask(input, tenantId),
        list: (tenantId) => postgres.listTasks(tenantId),
        findById: (id, tenantId) => postgres.findTaskById(id, tenantId),
        updateStatus: (id, status, tenantId) =>
          postgres.updateTaskStatus(id, status, tenantId)
      },
      approvals: {
        decideWithAudit: (input, tenantId) =>
          postgres.decideApprovalWithAudit(input, tenantId),
        save: (request, tenantId) => postgres.saveApproval(request, tenantId),
        findById: (id, tenantId) => postgres.findApprovalById(id, tenantId),
        list: (tenantId) => postgres.listApprovals(tenantId)
      },
      audit: {
        append: (input, tenantId) =>
          config.kind === 'postgres-pool'
            ? postgres.appendAudit(input, tenantId)
            : postgres.appendAudit(
                tenantId === undefined ? input : { ...input, tenantId }
              ),
        listBySession: (sessionId, tenantId: TenantId) =>
          postgres.listAuditBySession(sessionId, tenantId),
        listEvidence: (query: AuditEvidenceQuery, tenantId: TenantId) =>
          postgres.listAuditEvidence(query, tenantId),
        summarizeEvidence: (
          filters: AuditEvidenceFilters,
          tenantId: TenantId
        ) => postgres.summarizeAuditEvidence(filters, tenantId),
        createAuditEvidenceCheckpoint: (
          input: AuditEvidenceCheckpointCreateInput,
          createdBy: string,
          tenantId: TenantId
        ) => postgres.createAuditEvidenceCheckpoint(input, createdBy, tenantId),
        getAuditEvidenceCheckpoint: (id: string, tenantId: TenantId) =>
          postgres.getAuditEvidenceCheckpoint(id, tenantId),
        listAuditEvidenceCheckpoints: (tenantId: TenantId) =>
          postgres.listAuditEvidenceCheckpoints(tenantId),
        transitionAuditEvidenceCheckpoint: (
          id: string,
          status: 'SEALED' | 'ARCHIVED',
          updatedBy: string,
          expectedStatus: 'SEALED' | 'ARCHIVED',
          tenantId: TenantId
        ) =>
          postgres.transitionAuditEvidenceCheckpoint(
            id,
            status,
            updatedBy,
            expectedStatus,
            tenantId
          )
      }
    }
  }

  const db = new InMemoryDatabase()
  const outbox = new OutboxRepository(db)
  return {
    sessionVersionPinning: true,
    outbox,
    journeys:
      journeyRepository !== undefined
        ? journeyRepository
        : new JourneyRepository(db),
    conversations: new ConversationRepository(db),
    tasks: new TaskRepository(db),
    approvals: new ApprovalRepository(db),
    audit: new AuditRepository(db)
  }
}

type PostgresPersistenceConfig = Extract<
  NonNullable<BuildServerOptions['persistence']>,
  { kind: 'postgres' } | { kind: 'postgres-pool' }
>

/**
 * PostgreSQL persistence mode always exposes a concrete journey repository.
 * If the configured adapter cannot carry tenant-scoped transactions, startup
 * fails closed instead of hiding a missing adapter behind a cast.
 */
function createPostgresJourneyRepository(
  config: PostgresPersistenceConfig
): PostgresJourneyRepository {
  if (config.kind === 'postgres-pool') {
    if (typeof config.pool?.connect !== 'function') {
      throw new Error(
        'PostgreSQL journey persistence requires a pool adapter with connect()'
      )
    }
    return new PostgresJourneyRepository(config.pool)
  }
  if (typeof config.client?.query !== 'function') {
    throw new Error(
      'PostgreSQL journey persistence requires a queryable persistence client'
    )
  }
  return new PostgresJourneyRepository(singleConnectionPool(config.client))
}

function singleConnectionPool(client: PostgresQueryable): PostgresPoolLike {
  const pooled: PostgresPoolClient = {
    query: (text, values) => client.query(text, values),
    release: () => undefined
  }
  return { connect: async () => pooled }
}

function withDefaultCapabilityGateway(
  agentRuntime: AgentRuntimeOptions | undefined,
  approvalAuthority: CapabilityApprovalAuthority,
  actorAuthorizer: CapabilityActorAuthorizer
): AgentRuntimeOptions | undefined {
  if (!agentRuntime || agentRuntime.capabilityGateway) {
    return agentRuntime
  }

  return {
    ...agentRuntime,
    capabilityGateway: createControlledCapabilityGateway({
      approvalAuthority,
      actorAuthorizer
    })
  }
}

function withDefaultKnowledgeResolver(
  agentRuntime: AgentRuntimeOptions | undefined,
  resolver: ApprovedKnowledgeResolver | undefined
): AgentRuntimeOptions | undefined {
  if (!agentRuntime || agentRuntime.resolveApprovedKnowledge || !resolver) {
    return agentRuntime
  }
  return { ...agentRuntime, resolveApprovedKnowledge: resolver }
}

function createCapabilityApprovalAuthority(
  configured: CapabilityApprovalAuthority | undefined,
  persistence: BuildServerOptions['persistence']
): CapabilityApprovalAuthority {
  if (configured) return configured
  if (persistence?.kind === 'postgres-pool') {
    return new TenantScopedPostgresCapabilityApprovalRepository(
      persistence.pool
    )
  }
  return new InMemoryCapabilityApprovalAuthority()
}

function createOperationalApprovalAuthority(
  persistence: BuildServerOptions['persistence']
): ApprovalAuthority {
  if (persistence?.kind === 'postgres-pool') {
    return new PostgresApprovalAuthority(persistence.pool)
  }
  if (persistence?.kind === 'postgres') {
    return new PostgresApprovalAuthority(
      singleConnectionPool(persistence.client)
    )
  }
  return new ApprovalEngine()
}

function readIdempotencyKey(headers: Record<string, unknown>): string {
  const raw = headers['idempotency-key'] ?? headers['x-idempotency-key']
  const candidate = Array.isArray(raw) ? raw[0] : raw
  const parsed = z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .safeParse(candidate)
  if (!parsed.success) {
    throw new DomainError(
      'validation_failed',
      'Idempotency-Key is required and invalid'
    )
  }
  return parsed.data
}

function operationalApprovalError(error: ApprovalError): {
  code: string
  message: string
} {
  if (error.code === 'not_found') {
    return { code: 'not_found', message: error.message }
  }
  if (
    error.code === 'not_authorized' ||
    error.code === 'self_approval_denied'
  ) {
    return { code: 'forbidden', message: error.message }
  }
  if (error.code === 'invalid_request') {
    return { code: 'validation_failed', message: error.message }
  }
  return { code: 'conflict', message: error.message }
}

function withDefaultInboundCompletion(
  agentRuntime: AgentRuntimeOptions | undefined,
  persistence: BuildServerOptions['persistence']
): AgentRuntimeOptions | undefined {
  if (
    !agentRuntime ||
    agentRuntime.completeInboundRuntime ||
    persistence?.kind !== 'postgres-pool'
  ) {
    return agentRuntime
  }
  const runtime = new TenantScopedPostgresRuntimeRepository(persistence.pool)
  return {
    ...agentRuntime,
    completeInboundRuntime: (input) => runtime.completeInboundRuntime(input)
  }
}

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
  const migrationPool = env.DATABASE_MIGRATION_URL
    ? createPostgresPool(env.DATABASE_MIGRATION_URL, schemaName)
    : pool
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
      if (env.NODE_ENV === 'production' && !env.DATABASE_MIGRATION_URL) {
        throw new Error(
          'Production tenant RLS requires a separate DATABASE_MIGRATION_URL'
        )
      }
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

    if (env.POSTGRES_AUTO_MIGRATE === 'true') {
      if (env.NODE_ENV === 'production' && !env.DATABASE_MIGRATION_URL) {
        throw new Error(
          'Production auto-migration requires a separate DATABASE_MIGRATION_URL'
        )
      }
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
      const migrationRoleClient = await migrationPool.connect()
      try {
        await assertMigrationRoleIsLeastPrivilege(
          migrationRoleClient,
          runtimeRoleName
        )
      } finally {
        migrationRoleClient.release()
      }
      const runtimeSchemaClient = await pool.connect()
      try {
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
  return app
}

function safeTelemetry(operation: () => void): void {
  try {
    operation()
  } catch {
    // Export/telemetry failures must never alter API, readiness or safety flow.
  }
}

function httpStatusBucket(
  statusCode: number
): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (statusCode >= 200 && statusCode <= 299) return '2xx'
  if (statusCode >= 300 && statusCode <= 399) return '3xx'
  if (statusCode >= 400 && statusCode <= 499) return '4xx'
  if (statusCode >= 500 && statusCode <= 599) return '5xx'
  return 'other'
}

function createConfiguredWebhookVerifier(
  env: NodeJS.ProcessEnv,
  configuredVerifier: WebhookVerifier | undefined,
  replayStore: WebhookReplayStore | undefined
): WebhookVerifier | undefined {
  if (configuredVerifier) return configuredVerifier
  if (env.NODE_ENV === 'test') return undefined
  const secret = env.WEBHOOK_SIGNING_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'WEBHOOK_SIGNING_SECRET is required outside test mode when no verifier is injected'
    )
  }
  if (
    env.NODE_ENV === 'production' &&
    (secret.length < 32 || /replace[_-]?me|change[_-]?me|example/i.test(secret))
  ) {
    throw new Error(
      'Production webhook signing secret must contain at least 32 non-placeholder characters'
    )
  }
  if (env.NODE_ENV === 'production' && !replayStore) {
    throw new Error(
      'Production requires a distributed webhook replay store when no verifier is injected'
    )
  }
  return new HmacWebhookVerifier({
    secret,
    ...(replayStore ? { replayStore } : {})
  }).verifyWithLease
}

function createConfiguredInboundTenantResolver(
  env: NodeJS.ProcessEnv,
  configuredResolver: InboundTenantResolver | undefined
): InboundTenantResolver | undefined {
  if (configuredResolver) return configuredResolver
  const rawTenantId = env.INBOUND_TENANT_ID?.trim()
  if (!rawTenantId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Production requires INBOUND_TENANT_ID or an injected tenant resolver'
      )
    }
    return undefined
  }
  const tenantId = TenantIdSchema.safeParse(rawTenantId)
  if (!tenantId.success) {
    throw new Error('INBOUND_TENANT_ID must be a valid tenant identifier')
  }
  return () => tenantId.data
}

function createConfiguredInboundAgentRuntime(
  env: NodeJS.ProcessEnv,
  configuredRuntime: AgentRuntimeOptions | undefined
): AgentRuntimeOptions | undefined {
  if (configuredRuntime) return configuredRuntime
  const rawAgentId = env.INBOUND_AGENT_ID?.trim()
  if (!rawAgentId) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'Production requires INBOUND_AGENT_ID or an injected agent runtime'
      )
    }
    return undefined
  }
  const agentId = AgentIdSchema.safeParse(rawAgentId)
  if (!agentId.success) {
    throw new Error('INBOUND_AGENT_ID must be a valid agent id')
  }
  return {
    resolveAgentId: () => agentId.data
  }
}

function isWebhookVerificationLease(
  value: WebhookVerification
): value is WebhookVerificationLease {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.verified === true &&
    typeof value.commit === 'function' &&
    typeof value.release === 'function'
  )
}
