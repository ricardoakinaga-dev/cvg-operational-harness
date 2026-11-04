import type { FastifyInstance } from 'fastify'
import { type OperationalExecutionStore } from '@cvg/harness'
import { type Telemetry } from '@cvg/observability'
import { type OperatorIdentityResolver } from '@cvg/shared'
import {
  type ApprovalAuthority,
  type DurableOutboxAdapter
} from '@cvg/persistence'
import {
  type CapabilityApprovalAuthority,
  type CapabilityGateway,
  type ControlPlaneStore
} from '@cvg/platform'
import { type AgentRuntimeOptions } from '../server-options.ts'
import { type RuntimePersistence } from '../server-persistence.ts'
import {
  type CaseAuthorityPort,
  type PostgresRuntimeApprovalDecision
} from '@cvg/persistence'
import {
  type CaseRouteDependencies,
  type SafeCaseError
} from '../case-authorization/case-routes.ts'
import {
  type RuntimeLogEntry,
  type BuildServerOptions
} from '../server-options.ts'
import {
  type OperatorCookiePolicy,
  type OperatorSessionRecord
} from '../operator-session.ts'
import { type RateLimiterPort } from '../rate-limit.ts'
import { type ReadinessProbe } from '../readiness.ts'
import { type ControlledRequestMetrics } from '../request-metrics.ts'
import { type requireOperatorIdentity } from '../server-identity.ts'
import { type TenantId } from '@cvg/platform'
export interface RouteContext {
  readonly agentRuntime: AgentRuntimeOptions | undefined
  readonly app: FastifyInstance
  readonly approvals: RuntimePersistence['approvals']
  readonly assertAuthorizedWriteComposition: () => void
  readonly assertRuntimeApprovalDecisionComposition: () => void
  readonly audit: RuntimePersistence['audit']
  readonly capabilityApprovalAuthority: CapabilityApprovalAuthority
  readonly caseAuthority: CaseAuthorityPort
  readonly caseRouteDeps: CaseRouteDependencies
  readonly conversations: RuntimePersistence['conversations']
  readonly durableInbound: boolean
  readonly emitRuntimeLog: (entry: RuntimeLogEntry) => void
  readonly fallbackCapabilityGateway: CapabilityGateway
  readonly identityMode: 'simulation' | 'trusted'
  readonly operationalApprovalAuthority: ApprovalAuthority
  readonly operationalExecution: OperationalExecutionStore
  readonly operatorCookiePolicy: OperatorCookiePolicy
  readonly operatorIdentityResolver: OperatorIdentityResolver | undefined
  readonly options: BuildServerOptions
  readonly outbox: DurableOutboxAdapter
  readonly persistence: RuntimePersistence
  readonly platform: ControlPlaneStore
  readonly principalPolicy: {
    identityMode: 'simulation' | 'trusted'
    authorityVersion: string | null
  }
  readonly rateLimiter: RateLimiterPort
  readonly rawBodyByRequest: WeakMap<object, string>
  readonly readinessProbes: ReadinessProbe[]
  readonly requestMetrics: ControlledRequestMetrics
  readonly requestMetricsEnabled: boolean
  readonly requireAuthenticatedMutations: boolean
  readonly requireIdentity: (
    headers: Record<string, unknown>,
    permission: string
  ) => ReturnType<typeof requireOperatorIdentity>
  readonly runtimeApprovalDecision: PostgresRuntimeApprovalDecision | null
  readonly sessionLinkedAudit: (
    scope: TenantId,
    sessionId: string
  ) => Pick<RuntimePersistence['audit'], 'append'>
  readonly sessionRecordByHeaders: WeakMap<object, OperatorSessionRecord>
  readonly sessionStoreFailureByHeaders: WeakSet<object>
  readonly tasks: RuntimePersistence['tasks']
  readonly telemetry: Telemetry
  readonly toSafeRouteError: (error: unknown) => SafeCaseError
  readonly trustedOperatorIdentityResolver: OperatorIdentityResolver | undefined
}
