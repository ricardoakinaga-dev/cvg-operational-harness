import {
  createCorrelationId,
  DomainError,
  ok,
  toSafeError,
  fail
} from '@cvg/shared'
import { resolveDataPlaneTenant } from '../server-identity.ts'
import { TakeoverRequestSchema } from '../server-schemas.ts'
import { CaseAuthorityError } from '@cvg/persistence'
import { toSafeCaseError } from '../case-authorization/case-routes.ts'
import { statusCodeForError } from '../server-query.ts'
import type { RouteContext } from './context.ts'

export function registerTakeoverRoutes(ctx: RouteContext): void {
  const { app, caseAuthority, conversations, requireIdentity } = ctx

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
}
