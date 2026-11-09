import {
  createCorrelationId,
  ok,
  toSafeError,
  fail,
  DomainError
} from '@cvg/shared'
import {
  resolveDataPlaneTenant,
  resolveOptionalRequestTenant
} from '../server-identity.ts'
import {
  parseExecutionSubmission,
  OperationalExecutionError,
  deriveExecutionResume
} from '@cvg/harness'
import {
  submitExecutionWithCase,
  presentExecutionForCaller,
  toSafeCaseError,
  authorizeCaseMutation,
  runAuthorizedCaseMutation,
  mapCaseMutationError
} from '../case-authorization/case-routes.ts'
import { assertRequesterDecision } from '@cvg/approval-engine'
import { CaseAuthorityError, ApprovalError } from '@cvg/persistence'
import { statusCodeForError, readIdempotencyKey } from '../server-query.ts'
import {
  OperationalExecutionInputSchema,
  OperationalExecutionCancelSchema,
  OperationalApprovalDecisionSchema
} from '../server-schemas.ts'
import { operationalApprovalError } from '../server-capability.ts'
import type { RouteContext } from './context.ts'

export function registerExecutionsRoutes(ctx: RouteContext): void {
  const {
    app,
    assertRuntimeApprovalDecisionComposition,
    audit,
    caseRouteDeps,
    emitRuntimeLog,
    operationalApprovalAuthority,
    operationalExecution,
    rateLimiter,
    requireAuthenticatedMutations,
    requireIdentity,
    runtimeApprovalDecision
  } = ctx

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
            // SPEC 0317 G1: same check as the atomic unit, ahead of the
            // submit below, which this path could not roll back.
            assertRequesterDecision({
              submittedBy: execution.submittedBy,
              approval,
              verdict: decision,
              actorId: identity.operatorId
            })
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
                  operationKey: approval.operationKey ?? null,
                  requestedBy: approval.requestedBy ?? { kind: 'unknown' }
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
}
