import { DomainError } from '@cvg/shared'
import {
  createControlledCapabilityGateway,
  createTestSuiteRunId,
  TenantIdSchema,
  evaluateTestLabSuite,
  InMemoryCapabilityApprovalAuthority,
  type CapabilityActorAuthorizer,
  type CapabilityApprovalAuthority,
  type ApprovedKnowledgeResolver,
  type AgentId,
  type TenantId,
  type AgentVersionId,
  type ControlPlaneStore,
  type TestLabCase,
  type TestSuiteRecord,
  type TestSuiteRunRecord,
  type TestSuiteVariantResult
} from '@cvg/platform'
import {
  ApprovalEngine,
  ApprovalError,
  type ApprovalAuthority,
  PostgresApprovalAuthority,
  TenantScopedPostgresCapabilityApprovalRepository
} from '@cvg/persistence'
import { AgentRuntimeOptions, BuildServerOptions } from './server-options.ts'
import { singleConnectionPool } from './server-persistence.ts'

export const CONTROLLED_CAPABILITY_PERMISSION = 'scheduling:read'

export const serverCapabilityActorAuthorizer: CapabilityActorAuthorizer = ({
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

export const CONTROLLED_TENANT_ID = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000001'
)

export async function evaluateTestSuiteVariant(input: {
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

export async function recordSuiteRun(input: {
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

export function withDefaultCapabilityGateway(
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

export function withDefaultKnowledgeResolver(
  agentRuntime: AgentRuntimeOptions | undefined,
  resolver: ApprovedKnowledgeResolver | undefined
): AgentRuntimeOptions | undefined {
  if (!agentRuntime || agentRuntime.resolveApprovedKnowledge || !resolver) {
    return agentRuntime
  }
  return { ...agentRuntime, resolveApprovedKnowledge: resolver }
}

export function createCapabilityApprovalAuthority(
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

export function createOperationalApprovalAuthority(
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

export function operationalApprovalError(error: ApprovalError): {
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

export function safeTelemetry(operation: () => void): void {
  try {
    operation()
  } catch {
    // Export/telemetry failures must never alter API, readiness or safety flow.
  }
}

export function httpStatusBucket(
  statusCode: number
): '2xx' | '3xx' | '4xx' | '5xx' | 'other' {
  if (statusCode >= 200 && statusCode <= 299) return '2xx'
  if (statusCode >= 300 && statusCode <= 399) return '3xx'
  if (statusCode >= 400 && statusCode <= 499) return '4xx'
  if (statusCode >= 500 && statusCode <= 599) return '5xx'
  return 'other'
}
