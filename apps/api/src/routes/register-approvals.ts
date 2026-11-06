import {
  createCorrelationId,
  DomainError,
  ok,
  fail,
  ResolveApprovalSchema,
  ApprovalStatusSchema
} from '@cvg/shared'
import {
  resolveDataPlaneTenant,
  resolveOptionalRequestTenant
} from '../server-identity.ts'
import { requestHumanApproval } from '@cvg/agent-core'
import {
  authorizeCaseMutation,
  runAuthorizedCaseMutation,
  resolveCaseReadScope
} from '../case-authorization/case-routes.ts'
import {
  readCreationKey,
  parseStatusPageQuery,
  okPage
} from '../server-query.ts'
import { PostgresCaseAuthority, PostgresApiCreation } from '@cvg/persistence'
import type { RouteContext } from './context.ts'

export function registerApprovalsRoutes(ctx: RouteContext): void {
  const {
    app,
    approvals,
    assertAuthorizedWriteComposition,
    caseAuthority,
    caseRouteDeps,
    emitRuntimeLog,
    persistence,
    requireAuthenticatedMutations,
    requireIdentity,
    toSafeRouteError
  } = ctx

  app.post('/v1/approvals', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'approval:create')
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
}
