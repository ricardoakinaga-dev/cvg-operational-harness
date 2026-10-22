/**
 * SPEC0176 — case-scoped readers, case registry routes and the execution
 * projection used by mutation responses. SPEC0251 adds the case
 * precondition of task and approval mutations (`authorizeCaseMutation`) and
 * the error branch those routes put ahead of their mapping.
 *
 * Every reader resolves the trusted identity first (401/403 as before), then
 * runs ONE case read unit: principal currency, object relationship, grant and
 * content come from the same snapshot. Operator/Approver need an ACTIVE
 * read_case grant on the object's root; Supervisor/Admin read the active
 * tenant explicitly per operation. Missing object, another tenant and a
 * missing grant share the same static 404.
 */
import type { FastifyInstance, FastifyReply } from 'fastify'
import { ZodError, z } from 'zod'
import {
  createCorrelationId,
  DomainError,
  fail,
  ok,
  roleHasPermission,
  type IdentityMode,
  type OperatorIdentity
} from '@cvg/shared'
import type { TenantId } from '@cvg/platform'
import {
  CASE_KINDS,
  CaseAuthorityError,
  PostgresExecutionStepStore,
  PostgresOperationalExecutionStore,
  applyExecutionCaseLinkInTransaction,
  isCaseId,
  isCaseOperatorId,
  isCaseResourceId,
  type CaseAuthorityPort,
  type CaseKind,
  type CaseReadSnapshot,
  type CoreParentPlan
} from '@cvg/persistence'
import {
  readExecutionTrajectory,
  type ExecutionRecord,
  type ExecutionStepStore,
  type ExecutionSubmission,
  type OperationalExecutionStore,
  type SubmitResult
} from '@cvg/harness'
import {
  acknowledgeExecution,
  projectAuditFull,
  projectAuditLimited,
  projectConversationPage,
  projectExecution,
  projectTimeline
} from './case-projections.ts'

export const CASE_NOT_FOUND_MESSAGE = 'Resource not found'

type CaseRole = OperatorIdentity['role']

/** SPEC0176 §6: new case permissions are Supervisor/Admin only. */
const CASE_PERMISSIONS: Readonly<Record<CaseRole, readonly string[]>> = {
  Operator: [],
  Approver: [],
  Supervisor: [
    'case:assignment_manage',
    'case:registry_read',
    'case:read_tenant'
  ],
  Admin: ['case:assignment_manage', 'case:registry_read', 'case:read_tenant']
}

export function caseRoleHasPermission(
  role: CaseRole,
  permission: string
): boolean {
  return CASE_PERMISSIONS[role]?.includes(permission) ?? false
}

export interface CasePrincipalPolicy {
  readonly identityMode: IdentityMode
  /**
   * Current version of the trusted principal producer (SPEC0152 adapter).
   * Absent in trusted mode means the authority is not configured: every case
   * read fails closed with 503 instead of trusting the session alone.
   */
  readonly authorityVersion: string | null
}

export type CaseReadScope =
  | { readonly kind: 'tenant' }
  | { readonly kind: 'assigned'; readonly operatorId: string }

function notFound(): DomainError {
  return new DomainError('not_found', CASE_NOT_FOUND_MESSAGE)
}

/**
 * Principal currency inside the read unit. The session authenticates the
 * identifier; `case_principals` is the authority for active/role/version.
 * A role that differs from the session is refused, never merged or promoted.
 */
export async function resolveCaseReadScope(
  snapshot: CaseReadSnapshot,
  identity: OperatorIdentity,
  policy: CasePrincipalPolicy
): Promise<CaseReadScope> {
  const principal = await snapshot.principal(identity.operatorId)
  if (policy.identityMode === 'trusted') {
    if (policy.authorityVersion === null) {
      throw new DomainError(
        'configuration_error',
        'Case authorization authority is unavailable'
      )
    }
    if (
      !principal ||
      !principal.active ||
      principal.role !== identity.role ||
      principal.authorityVersion !== policy.authorityVersion ||
      // §3.1: synthetic fixture principals exist only in the controlled test
      // profile; a trusted deployment accepts only the verified adapter.
      (process.env.NODE_ENV !== 'test' &&
        principal.identitySource !== 'verified_adapter')
    ) {
      throw new DomainError(
        'unauthorized',
        'Operator principal is not current; sign in again'
      )
    }
  } else if (
    principal &&
    (!principal.active || principal.role !== identity.role)
  ) {
    throw new DomainError(
      'unauthorized',
      'Operator principal is not current; sign in again'
    )
  }
  if (identity.role === 'Supervisor' || identity.role === 'Admin') {
    return { kind: 'tenant' }
  }
  if (!(await snapshot.scopedAuthorityAvailable())) {
    throw new DomainError(
      'configuration_error',
      'Case authorization authority is unavailable'
    )
  }
  return { kind: 'assigned', operatorId: identity.operatorId }
}

async function canReadCase(
  snapshot: CaseReadSnapshot,
  scope: CaseReadScope,
  caseId: string | null | undefined
): Promise<boolean> {
  if (scope.kind === 'tenant') return true
  if (!caseId) return false
  return snapshot.hasActiveGrant(caseId, scope.operatorId)
}

export interface SafeCaseError {
  readonly status: number
  readonly code: string
  readonly message: string
}

const DOMAIN_STATUS: Readonly<Record<string, number>> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  configuration_error: 503,
  internal_error: 500
}

export function toSafeCaseError(error: unknown): SafeCaseError {
  if (error instanceof CaseAuthorityError) {
    switch (error.code) {
      case 'assignment_conflict':
        return {
          status: 409,
          code: 'assignment_conflict',
          message: 'Assignment revision is stale'
        }
      case 'assignment_target_unavailable':
        return {
          status: 409,
          code: 'assignment_target_unavailable',
          message: 'Assignment target is unavailable'
        }
      case 'principal_not_current':
        return {
          status: 401,
          code: 'unauthorized',
          message: 'Operator principal is not current; sign in again'
        }
      case 'principal_conflict':
        return {
          status: 409,
          code: 'conflict',
          message: 'Principal revision is stale'
        }
      case 'case_not_found':
        return {
          status: 404,
          code: 'not_found',
          message: CASE_NOT_FOUND_MESSAGE
        }
      case 'case_link_conflict':
        return {
          status: 409,
          code: 'conflict',
          message: 'Execution case link cannot change'
        }
      case 'case_parent_invalid':
      case 'validation_failed':
        return {
          status: 400,
          code: 'validation_failed',
          message: 'Case lineage is invalid'
        }
      default:
        return {
          status: 503,
          code: 'configuration_error',
          message: 'Case authority is unavailable'
        }
    }
  }
  if (error instanceof DomainError) {
    return {
      status: DOMAIN_STATUS[error.code] ?? 400,
      code: error.code,
      message: error.message
    }
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'Input validation failed'
    }
  }
  return {
    status: 500,
    code: 'internal_error',
    message: 'Unexpected internal error'
  }
}

/**
 * SPEC0251 I7 — the case branch placed ahead of a route's existing error
 * mapping, never replacing it: a `CaseAuthorityError` becomes its safe case
 * error (404 for a case not found, 503 for an unavailable authority), so a
 * case failure never leaves as 500; anything else keeps the mapping the
 * route already had.
 */
export function mapCaseMutationError(
  error: unknown,
  existing: (error: unknown) => SafeCaseError
): SafeCaseError {
  return error instanceof CaseAuthorityError
    ? toSafeCaseError(error)
    : existing(error)
}

export interface CaseRouteDependencies {
  readonly caseAuthority: CaseAuthorityPort
  readonly principalPolicy: CasePrincipalPolicy
  readonly operationalExecution: OperationalExecutionStore
  readonly executionSteps?: ExecutionStepStore
  readonly requireIdentity: (
    headers: Record<string, unknown>,
    permission: string
  ) => OperatorIdentity
  readonly requireAnyIdentity: (
    headers: Record<string, unknown>,
    permissions: string[]
  ) => OperatorIdentity
  readonly resolveDataPlaneTenant: (
    headers: Record<string, unknown>,
    identity: OperatorIdentity
  ) => TenantId
  readonly parsePagination: (
    query: unknown
  ) => { limit: number; offset: number } | null
  readonly paginationErrorMessage: string
  readonly log: (entry: {
    event: string
    correlationId: string
    route: string
    status: 'ok' | 'error'
    errorCode?: string
  }) => void
}

/**
 * Content stores bound to the read unit. When the composition uses the
 * canonical PostgreSQL stores, content is read through the snapshot
 * connection; injected stores (controlled fixtures) are read directly and
 * the memory authority serializes the unit.
 */
function executionReader(
  deps: CaseRouteDependencies,
  snapshot: CaseReadSnapshot
): Pick<OperationalExecutionStore, 'get'> {
  return snapshot.queryable &&
    deps.operationalExecution instanceof PostgresOperationalExecutionStore
    ? new PostgresOperationalExecutionStore(snapshot.queryable)
    : deps.operationalExecution
}

function stepReader(
  steps: ExecutionStepStore,
  snapshot: CaseReadSnapshot
): ExecutionStepStore {
  return snapshot.queryable && steps instanceof PostgresExecutionStepStore
    ? new PostgresExecutionStepStore(snapshot.queryable)
    : steps
}

function boundedParam(value: unknown): string {
  if (typeof value !== 'string' || !isCaseResourceId(value)) {
    throw new DomainError('validation_failed', 'Resource identifier is invalid')
  }
  return value
}

function sendFailure(
  reply: FastifyReply,
  deps: CaseRouteDependencies,
  route: string,
  event: string,
  correlationId: string,
  error: unknown
) {
  const safe = toSafeCaseError(error)
  deps.log({
    event,
    correlationId,
    route,
    status: 'error',
    errorCode: safe.code
  })
  reply.code(safe.status).header('cache-control', 'no-store')
  return reply.send(fail(safe.code, safe.message, correlationId))
}

const RegistryQuerySchema = z
  .object({
    kind: z.enum(CASE_KINDS).optional(),
    resourceId: z.string().optional(),
    limit: z.unknown().optional(),
    offset: z.unknown().optional()
  })
  .strict()

const AssignmentBodySchema = z
  .object({
    status: z.enum(['ACTIVE', 'REVOKED']),
    expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
  })
  .strict()

export async function readExecutionForCaller(
  deps: CaseRouteDependencies,
  identity: OperatorIdentity,
  tenantId: TenantId,
  executionId: string
): Promise<ExecutionRecord> {
  return deps.caseAuthority.readSnapshot(tenantId, async (snapshot) => {
    const scope = await resolveCaseReadScope(
      snapshot,
      identity,
      deps.principalPolicy
    )
    if (scope.kind === 'assigned') {
      const link = await snapshot.executionCase(executionId)
      if (!(await canReadCase(snapshot, scope, link?.caseId))) throw notFound()
    }
    const record = await executionReader(deps, snapshot).get(
      tenantId,
      executionId
    )
    if (!record) throw notFound()
    return record
  })
}

/** SPEC0251 §4.2 — the resource whose case a mutation must authorize. */
export type CaseMutationTarget =
  | { readonly kind: 'task'; readonly taskId: string }
  | { readonly kind: 'approval_request'; readonly approvalRequestId: string }
  | { readonly kind: 'core_session'; readonly sessionId: string }
  | { readonly kind: 'execution'; readonly executionId: string }

/**
 * SPEC0251 §4.2 — precondition of the task and approval mutations, run in
 * one case read unit after identity, tenant and body validation and before
 * any write. Operator/Approver need an ACTIVE grant on the target's case;
 * Supervisor/Admin act on the active tenant. A missing target, another
 * tenant, a session without a case root and a missing grant share the
 * static 404. The grant is a precondition, never a role permission: the
 * route checks the role first. Nothing from the unit is reused by the
 * write except this decision.
 */
export async function authorizeCaseMutation(
  deps: CaseRouteDependencies,
  identity: OperatorIdentity,
  tenantId: TenantId,
  target: CaseMutationTarget
): Promise<void> {
  if (target.kind === 'execution') {
    // Same algorithm as the execution reader: link + grant in the assigned
    // scope, existence through the execution store for every role.
    await readExecutionForCaller(deps, identity, tenantId, target.executionId)
    return
  }
  await deps.caseAuthority.readSnapshot(tenantId, async (snapshot) => {
    const scope = await resolveCaseReadScope(
      snapshot,
      identity,
      deps.principalPolicy
    )
    const located =
      target.kind === 'task'
        ? await snapshot.taskCase(target.taskId)
        : target.kind === 'approval_request'
          ? await snapshot.approvalRequestCase(target.approvalRequestId)
          : await snapshot.coreSessionCase(target.sessionId)
    if (!located || !(await canReadCase(snapshot, scope, located.caseId))) {
      throw new CaseAuthorityError('case_not_found', CASE_NOT_FOUND_MESSAGE)
    }
  })
}

/**
 * Projection for mutation responses: the full presentation DTO only for an
 * actor who can read the case now; otherwise the `{id,state}` ack. A
 * projection failure never turns into a permissive answer.
 */
export async function presentExecutionForCaller(
  deps: CaseRouteDependencies,
  identity: OperatorIdentity | null,
  tenantId: TenantId,
  record: ExecutionRecord
) {
  if (!identity) return acknowledgeExecution(record)
  try {
    return await deps.caseAuthority.readSnapshot(tenantId, async (snapshot) => {
      const scope = await resolveCaseReadScope(
        snapshot,
        identity,
        deps.principalPolicy
      )
      if (scope.kind === 'tenant') return projectExecution(record)
      const link = await snapshot.executionCase(record.id)
      return (await canReadCase(snapshot, scope, link?.caseId))
        ? projectExecution(record)
        : acknowledgeExecution(record)
    })
  } catch {
    return acknowledgeExecution(record)
  }
}

/**
 * SPEC0176 §5: the public submission resolves only core parents, fixed by
 * the composition. Both absent → independent root; one present or a
 * contradictory pair → refused. A core case additionally requires the caller
 * to be able to read it. The link commits with the submission when the
 * canonical PostgreSQL stores are composed.
 */
export async function submitExecutionWithCase(
  deps: CaseRouteDependencies,
  identity: OperatorIdentity | null,
  tenantId: TenantId,
  submission: ExecutionSubmission
): Promise<SubmitResult> {
  const { conversationId, sessionId } = submission.runtime
  const classification = await deps.caseAuthority.classifyCoreParents(
    tenantId,
    conversationId,
    sessionId
  )
  if (classification.kind === 'invalid') {
    throw new DomainError(
      'validation_failed',
      'Execution parent pair is invalid'
    )
  }
  if (classification.kind === 'core') {
    if (!identity) throw notFound()
    await deps.caseAuthority.readSnapshot(tenantId, async (snapshot) => {
      const scope = await resolveCaseReadScope(
        snapshot,
        identity,
        deps.principalPolicy
      )
      if (!(await canReadCase(snapshot, scope, classification.caseId))) {
        throw notFound()
      }
    })
  }
  const plan: CoreParentPlan =
    classification.kind === 'core'
      ? { kind: 'core', conversationId, sessionId }
      : { kind: 'independent', conversationId, sessionId }
  const store = deps.operationalExecution
  if (
    deps.caseAuthority.kind === 'postgres' &&
    store instanceof PostgresOperationalExecutionStore
  ) {
    return store.submitWith(submission, (client, record, created, now) =>
      applyExecutionCaseLinkInTransaction(
        client,
        tenantId,
        record.id,
        plan,
        created,
        now
      )
    )
  }
  const result = await store.submit(submission)
  await deps.caseAuthority.registerExecutionLink(
    tenantId,
    result.record.id,
    plan,
    result.created
  )
  return result
}

export function registerCaseAuthorizationRoutes(
  app: FastifyInstance,
  deps: CaseRouteDependencies
): void {
  app.get('/v1/conversations', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/conversations'
    try {
      const identity = deps.requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const pagination = deps.parsePagination(request.query)
      if (!pagination) {
        throw new DomainError(
          'invalid_pagination',
          `limit must be between 1 and 100 and ${deps.paginationErrorMessage}`
        )
      }
      const page = await deps.caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) => {
          const scope = await resolveCaseReadScope(
            snapshot,
            identity,
            deps.principalPolicy
          )
          return snapshot.listCoreConversations(scope, pagination)
        }
      )
      deps.log({
        event: 'conversation.list_read',
        correlationId,
        route,
        status: 'ok'
      })
      reply.header('cache-control', 'no-store')
      return reply.send(ok(projectConversationPage(page), correlationId))
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'conversation.list_failed',
        correlationId,
        error
      )
    }
  })

  app.get(
    '/v1/conversations/:conversationId/timeline',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      const route = '/v1/conversations/:conversationId/timeline'
      try {
        const identity = deps.requireIdentity(
          request.headers,
          'conversation:view_assigned'
        )
        const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
        const conversationId = boundedParam(
          (request.params as { conversationId?: unknown }).conversationId
        )
        const timeline = await deps.caseAuthority.readSnapshot(
          tenantId,
          async (snapshot) => {
            const scope = await resolveCaseReadScope(
              snapshot,
              identity,
              deps.principalPolicy
            )
            if (scope.kind === 'tenant') {
              if (!(await snapshot.coreConversationExists(conversationId))) {
                throw notFound()
              }
            } else {
              const root = await snapshot.coreConversationCase(conversationId)
              if (!root || !(await canReadCase(snapshot, scope, root.caseId))) {
                throw notFound()
              }
            }
            return snapshot.coreTimeline(conversationId)
          }
        )
        reply.header('cache-control', 'no-store')
        return reply.send(ok(projectTimeline(timeline), correlationId))
      } catch (error) {
        return sendFailure(
          reply,
          deps,
          route,
          'conversation.timeline_failed',
          correlationId,
          error
        )
      }
    }
  )

  const auditProjection = (identity: OperatorIdentity) =>
    roleHasPermission(identity.role, 'audit:view_full')
      ? projectAuditFull
      : projectAuditLimited

  app.get('/v1/audit/sessions/:sessionId', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/audit/sessions/:sessionId'
    try {
      const identity = deps.requireAnyIdentity(request.headers, [
        'audit:view_full',
        'audit:view_limited'
      ])
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const sessionId = boundedParam(
        (request.params as { sessionId?: unknown }).sessionId
      )
      const events = await deps.caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) => {
          const scope = await resolveCaseReadScope(
            snapshot,
            identity,
            deps.principalPolicy
          )
          const session = await snapshot.coreSessionCase(sessionId)
          if (
            !session ||
            !(await canReadCase(snapshot, scope, session.caseId))
          ) {
            throw notFound()
          }
          return snapshot.linkedAuditEvents({ kind: 'core', sessionId })
        }
      )
      deps.log({
        event: 'audit.session_read',
        correlationId,
        route,
        status: 'ok'
      })
      reply.header('cache-control', 'no-store')
      return reply.send(
        ok({ events: auditProjection(identity)(events) }, correlationId)
      )
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'audit.session_failed',
        correlationId,
        error
      )
    }
  })

  app.get(
    '/v1/cases/harness/conversations/:conversationId/sessions/:sessionId/audit',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      const route =
        '/v1/cases/harness/conversations/:conversationId/sessions/:sessionId/audit'
      try {
        const identity = deps.requireAnyIdentity(request.headers, [
          'audit:view_full',
          'audit:view_limited'
        ])
        const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as {
          conversationId?: unknown
          sessionId?: unknown
        }
        const conversationId = boundedParam(params.conversationId)
        const sessionId = boundedParam(params.sessionId)
        const events = await deps.caseAuthority.readSnapshot(
          tenantId,
          async (snapshot) => {
            const scope = await resolveCaseReadScope(
              snapshot,
              identity,
              deps.principalPolicy
            )
            const session = await snapshot.harnessSessionCase(
              conversationId,
              sessionId
            )
            if (
              !session ||
              !(await canReadCase(snapshot, scope, session.caseId))
            ) {
              throw notFound()
            }
            return snapshot.linkedAuditEvents({
              kind: 'harness',
              conversationId,
              sessionId
            })
          }
        )
        reply.header('cache-control', 'no-store')
        return reply.send(
          ok({ events: auditProjection(identity)(events) }, correlationId)
        )
      } catch (error) {
        return sendFailure(
          reply,
          deps,
          route,
          'audit.harness_session_failed',
          correlationId,
          error
        )
      }
    }
  )

  app.get('/v1/executions/:executionId', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/executions/:executionId'
    try {
      const identity = deps.requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const executionId = boundedParam(
        (request.params as { executionId?: unknown }).executionId
      )
      const record = await readExecutionForCaller(
        deps,
        identity,
        tenantId,
        executionId
      )
      reply.header('cache-control', 'no-store')
      return reply.send(ok(projectExecution(record), correlationId))
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'execution.read_failed',
        correlationId,
        error
      )
    }
  })

  app.get('/v1/executions/:executionId/trajectory', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/executions/:executionId/trajectory'
    try {
      const identity = deps.requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const executionId = boundedParam(
        (request.params as { executionId?: unknown }).executionId
      )
      const steps = deps.executionSteps
      if (!steps) {
        throw new DomainError(
          'invalid_action',
          'Trajectory export is not configured'
        )
      }
      const trajectory = await deps.caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) => {
          const scope = await resolveCaseReadScope(
            snapshot,
            identity,
            deps.principalPolicy
          )
          if (scope.kind === 'assigned') {
            const link = await snapshot.executionCase(executionId)
            if (!(await canReadCase(snapshot, scope, link?.caseId))) {
              throw notFound()
            }
          }
          const record = await executionReader(deps, snapshot).get(
            tenantId,
            executionId
          )
          if (!record) throw notFound()
          return readExecutionTrajectory(
            stepReader(steps, snapshot),
            tenantId,
            record.id
          )
        }
      )
      reply.code(200).header('cache-control', 'no-store')
      return reply.send(ok({ trajectory }, correlationId))
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'execution.trajectory_failed',
        correlationId,
        error
      )
    }
  })

  const requireCaseManager = (
    headers: Record<string, unknown>,
    permission: 'case:registry_read' | 'case:assignment_manage'
  ) => {
    const identity = deps.requireAnyIdentity(headers, [
      'conversation:view_assigned'
    ])
    if (!caseRoleHasPermission(identity.role, permission)) {
      throw new DomainError('forbidden', `Role cannot perform ${permission}`)
    }
    return identity
  }

  const parseRegistryQuery = (raw: unknown) => {
    const parsed = RegistryQuerySchema.safeParse(raw ?? {})
    const pagination = parsed.success ? deps.parsePagination(raw ?? {}) : null
    if (
      !parsed.success ||
      !pagination ||
      (parsed.data.resourceId !== undefined &&
        (parsed.data.kind === undefined ||
          !isCaseResourceId(parsed.data.resourceId)))
    ) {
      throw new DomainError('validation_failed', 'Case query is invalid')
    }
    return {
      ...(parsed.data.kind !== undefined
        ? { kind: parsed.data.kind as CaseKind }
        : {}),
      ...(parsed.data.resourceId !== undefined
        ? { resourceId: parsed.data.resourceId }
        : {}),
      limit: pagination.limit,
      offset: pagination.offset
    }
  }

  app.get('/v1/cases', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/cases'
    try {
      const identity = requireCaseManager(request.headers, 'case:registry_read')
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const query = parseRegistryQuery(request.query)
      const page = await deps.caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) => {
          await resolveCaseReadScope(snapshot, identity, deps.principalPolicy)
          return snapshot.listRoots(query)
        }
      )
      reply.header('cache-control', 'no-store')
      return reply.send(
        ok(
          {
            items: page.items.map((root) => ({
              caseId: root.caseId,
              kind: root.kind,
              resourceId: root.resourceId,
              createdAt: root.createdAt
            })),
            pageInfo: page.pageInfo
          },
          correlationId
        )
      )
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'case.list_failed',
        correlationId,
        error
      )
    }
  })

  app.get('/v1/cases/assignments', async (request, reply) => {
    const correlationId = createCorrelationId()
    const route = '/v1/cases/assignments'
    try {
      const identity = requireCaseManager(request.headers, 'case:registry_read')
      const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
      const query = parseRegistryQuery(request.query)
      const page = await deps.caseAuthority.readSnapshot(
        tenantId,
        async (snapshot) => {
          await resolveCaseReadScope(snapshot, identity, deps.principalPolicy)
          return snapshot.listAssignments(query)
        }
      )
      reply.header('cache-control', 'no-store')
      return reply.send(
        ok(
          {
            items: page.items.map((item) => ({
              caseId: item.caseId,
              kind: item.kind,
              resourceId: item.resourceId,
              operatorId: item.operatorId,
              scope: item.scope,
              status: item.status,
              revision: item.revision,
              changedBy: item.changedBy,
              changedAt: item.changedAt
            })),
            pageInfo: page.pageInfo
          },
          correlationId
        )
      )
    } catch (error) {
      return sendFailure(
        reply,
        deps,
        route,
        'case.assignment_list_failed',
        correlationId,
        error
      )
    }
  })

  app.put(
    '/v1/cases/:caseId/assignments/:operatorId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      const route = '/v1/cases/:caseId/assignments/:operatorId'
      try {
        const identity = requireCaseManager(
          request.headers,
          'case:assignment_manage'
        )
        const tenantId = deps.resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as {
          caseId?: unknown
          operatorId?: unknown
        }
        if (!isCaseId(params.caseId) || !isCaseOperatorId(params.operatorId)) {
          throw new DomainError(
            'validation_failed',
            'Case assignment target is invalid'
          )
        }
        const body = AssignmentBodySchema.parse(request.body ?? {})
        // The actor must still be a current tenant-wide principal in the unit
        // that decides; a downgrade committed before it refuses the write.
        await deps.caseAuthority.readSnapshot(tenantId, async (snapshot) => {
          const scope = await resolveCaseReadScope(
            snapshot,
            identity,
            deps.principalPolicy
          )
          if (scope.kind !== 'tenant') {
            throw new DomainError('forbidden', 'Role cannot manage assignments')
          }
        })
        const result = await deps.caseAuthority.putAssignment({
          tenantId,
          caseId: params.caseId,
          operatorId: params.operatorId,
          status: body.status,
          expectedRevision: body.expectedRevision,
          actor: {
            operatorId: identity.operatorId,
            role: identity.role as 'Supervisor' | 'Admin'
          },
          correlationId,
          actorPrincipal: {
            required: deps.principalPolicy.identityMode === 'trusted',
            authorityVersion: deps.principalPolicy.authorityVersion
          }
        })
        deps.log({
          event: result.changed
            ? 'case.assignment_changed'
            : 'case.assignment_unchanged',
          correlationId,
          route,
          status: 'ok'
        })
        reply.header('cache-control', 'no-store')
        return reply.send(
          ok(
            {
              assignment: {
                caseId: result.assignment.caseId,
                kind: result.assignment.kind,
                resourceId: result.assignment.resourceId,
                operatorId: result.assignment.operatorId,
                scope: result.assignment.scope,
                status: result.assignment.status,
                revision: result.assignment.revision,
                changedBy: result.assignment.changedBy,
                changedAt: result.assignment.changedAt
              },
              changed: result.changed
            },
            correlationId
          )
        )
      } catch (error) {
        return sendFailure(
          reply,
          deps,
          route,
          'case.assignment_failed',
          correlationId,
          error
        )
      }
    }
  )
}
