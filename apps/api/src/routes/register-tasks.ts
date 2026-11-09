import {
  createCorrelationId,
  CreateInternalTaskSchema,
  DomainError,
  ok,
  fail,
  TaskStatusSchema
} from '@cvg/shared'
import {
  resolveDataPlaneTenant,
  resolveOptionalRequestTenant
} from '../server-identity.ts'
import {
  authorizeCaseMutation,
  runAuthorizedCaseMutation,
  resolveCaseReadScope
} from '../case-authorization/case-routes.ts'
import { PostgresCaseAuthority, PostgresApiCreation } from '@cvg/persistence'
import { parseStatusPageQuery, okPage } from '../server-query.ts'
import type { RouteContext } from './context.ts'

export function registerTasksRoutes(ctx: RouteContext): void {
  const {
    app,
    assertAuthorizedWriteComposition,
    caseAuthority,
    caseRouteDeps,
    emitRuntimeLog,
    persistence,
    requireAuthenticatedMutations,
    requireIdentity,
    tasks,
    toSafeRouteError
  } = ctx

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
}
