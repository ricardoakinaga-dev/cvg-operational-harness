import {
  type Channel,
  type IdentityMode,
  type OperatorIdentityResolver
} from '@cvg/shared'
import {
  type AgentExecutionActor,
  type CapabilityApprovalAuthority,
  type CapabilityApprovalResolver,
  type CapabilityGateway,
  type ApprovedKnowledgeForTest,
  type ApprovedKnowledgeResolver,
  type AgentId,
  type TenantId,
  type ControlPlaneStore
} from '@cvg/platform'
import { type JourneyRepositoryPort } from './legacy-composition.ts'
import {
  type ApprovalAuthority,
  type DurableOutboxAdapter,
  type InboundRuntimeCompletionInput,
  type PostgresPoolLike,
  type PostgresQueryable,
  type CaseAuthorityPort
} from '@cvg/persistence'
import { type Telemetry } from '@cvg/observability'
import {
  type ExecutionStepStore,
  type OperationalExecutionStore
} from '@cvg/harness'
import { type HttpSecurityOptions } from './http-security.ts'
import { type RateLimiterPort } from './rate-limit.ts'
import { type OperatorSessionStore } from './operator-session.ts'
import { type SessionEventStreamOptions } from './session-event-stream.ts'
import { type OidcTransport } from './oidc-authority.ts'
import { type OperatorLoginComposition } from './oidc-routes.ts'
import { ControlledRequestMetrics } from './request-metrics.ts'
import { type ReadinessProbe } from './readiness.ts'
import {
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
   * SPEC 0296: the SSE stream of session events. Absent = the route does not exist (404, D7).
   * The store is built per request with the tenant of the identity.
   */
  sessionEventStreams?: SessionEventStreamOptions
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
  /**
   * SPEC0176 case authority. Omitted: memory persistence uses the synthetic
   * in-memory authority and PostgreSQL the 0029 tables on the same database.
   */
  caseAuthority?: CaseAuthorityPort
  /**
   * SPEC0176 trusted principal producer (SPEC0152 adapter). Trusted case
   * reads require it; without it they fail closed with 503. Outside
   * NODE_ENV=test it exists only with `operatorLogin` (SPEC0254 I3), whose
   * authority version it must carry.
   */
  casePrincipalAuthority?: { authorityVersion: string }
  /**
   * SPEC0254 OIDC operator login: routes, verified principal producer,
   * CSRF by exact `Origin` and HMAC token refusal. Composed only with
   * NODE_ENV=test in this slice (synthetic IdP); never with an HMAC resolver.
   */
  operatorLogin?: OperatorLoginComposition
  /** SPEC0254: injected OIDC transport, accepted only with NODE_ENV=test. */
  oidcTransport?: OidcTransport
}

export type BuildServerFromEnvOptions = Omit<
  BuildServerOptions,
  'persistence'
> & {
  webhookReplayStore?: WebhookReplayStore
}
