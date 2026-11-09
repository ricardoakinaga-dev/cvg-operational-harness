import {
  createCorrelationId,
  DomainError,
  redactSensitiveText,
  ok,
  toSafeError,
  fail
} from '@cvg/shared'
import { type WebhookVerificationLease } from '../webhook-security.ts'
import {
  isWebhookVerificationLease,
  parseInboundChannel,
  resolveInboundTenant,
  executeInboundRuntime
} from '../server-inbound.ts'
import {
  receiveInboundMessage,
  getConversationTimeline,
  createInboundIdempotencyKey
} from '@cvg/agent-core'
import { CaseAuthorityError } from '@cvg/persistence'
import { toSafeCaseError } from '../case-authorization/case-routes.ts'
import { statusCodeForError } from '../server-query.ts'
import type { RouteContext } from './context.ts'

export function registerWebhooksRoutes(ctx: RouteContext): void {
  const {
    agentRuntime,
    app,
    audit,
    caseAuthority,
    conversations,
    durableInbound,
    emitRuntimeLog,
    options,
    outbox,
    persistence,
    platform,
    rawBodyByRequest,
    sessionLinkedAudit
  } = ctx

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
}
