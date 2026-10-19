import { randomUUID } from 'node:crypto'
import { executePublishedAgent, getConversationTimeline } from '@cvg/agent-core'
import {
  type ControlledPublishedAdmissionRecord,
  type ControlledPublishedClaim,
  type PostgresControlledPublishedKernelStore,
  type TenantScopedPostgresControlPlaneRepository,
  type TenantScopedPostgresRuntimeRepository
} from '@cvg/persistence'
import {
  AgentIdSchema,
  TraceIdSchema,
  canBotRespond,
  createControlledCapabilityGateway,
  createTraceId,
  controlledDigest,
  prepareControlledPublishedAdmission,
  type AgentExecutionActor,
  type ControlledKernelHostContext,
  type PluginAuditEvent,
  type TestRunTrace
} from '@cvg/platform'
import { CorrelationIdSchema, redactSensitiveText } from '@cvg/shared'
import type {
  ClaimedEventExecution,
  ClaimExecutionRegistry
} from './claimed-execution-lifecycle.ts'
import type { ControlledWorkerHandlers } from './controlled-worker.ts'
import { NonRetryableOutboxError } from './jobs/process-outbox-event.ts'

export const PUBLISHED_DURABILITY_ENV = 'CVG_WORKER_PUBLISHED_DURABILITY'
export const PUBLISHED_POSTGRES_DURABILITY = 'postgres-v1'

export function resolvePublishedDurability(
  env: NodeJS.ProcessEnv
): typeof PUBLISHED_POSTGRES_DURABILITY | undefined {
  const profile = env[PUBLISHED_DURABILITY_ENV]?.trim()
  if (!profile) return undefined
  if (profile !== PUBLISHED_POSTGRES_DURABILITY)
    throw new Error('Unknown published durability profile')
  if (env.NODE_ENV === 'production')
    throw new Error('Published PostgreSQL durability is disabled in production')
  if (
    !['postgres', 'postgres-controlled'].includes(
      env.CVG_WORKER_QUEUE_ADAPTER ?? ''
    )
  ) {
    throw new Error(
      'Published durability requires the PostgreSQL controlled adapter'
    )
  }
  if (
    env.CVG_WORKER_RUNTIME?.trim() &&
    env.CVG_WORKER_RUNTIME.trim() !== 'published-agent'
  ) {
    throw new Error('Published durability requires the published-agent runtime')
  }
  if (
    env.CVG_WORKER_CONTROLLED_MODE !== 'true' ||
    env.POSTGRES_RLS_ENFORCEMENT !== 'true'
  ) {
    throw new Error(
      'Published durability requires controlled mode and tenant RLS'
    )
  }
  for (const [key, expected] of [
    ['CVG_WORKER_CONCURRENCY', '1'],
    ['CVG_WORKER_LEASE_MS', '10000']
  ] as const) {
    if (env[key] !== undefined && env[key]?.trim() !== expected)
      throw new Error(`Published durability requires ${key}=${expected}`)
  }
  return profile
}

export function createPublishedProcessWorkerId(
  raw: string | undefined
): string {
  const base = raw?.trim() || 'worker-published-postgres'
  if (!/^[a-zA-Z0-9_.:-]{1,80}$/.test(base))
    throw new Error(
      'Published worker ID base must contain 1–80 safe characters'
    )
  return `${base}:${randomUUID()}`
}

export type PublishedKernelStore = Pick<
  PostgresControlledPublishedKernelStore,
  | 'readAdmission'
  | 'admit'
  | 'claim'
  | 'createHost'
  | 'renewPaired'
  | 'appendToolAudit'
>

export interface PublishedKernelHandlerOptions {
  env: NodeJS.ProcessEnv
  conversations: TenantScopedPostgresRuntimeRepository
  platform: TenantScopedPostgresControlPlaneRepository
  store: PublishedKernelStore
  claimContext: ClaimedEventExecution
}

const actor: AgentExecutionActor = Object.freeze({
  id: 'system.controlled-runtime',
  role: 'System',
  permissions: ['scheduling:read']
})

/** No timer owns a lease here: the job's exact claim handle is the sole owner. */
export function createPublishedKernelHandlers(
  options: PublishedKernelHandlerOptions
): ControlledWorkerHandlers {
  const { conversations, platform, store, claimContext } = options
  if (!resolvePublishedDurability(options.env))
    throw new Error('Published durable handlers require explicit opt-in')
  for (const key of [
    'readAdmission',
    'admit',
    'claim',
    'createHost',
    'renewPaired',
    'appendToolAudit'
  ] as const) {
    if (typeof store[key] !== 'function')
      throw new Error(`Published store method missing: ${key}`)
  }
  return {
    inboundProcess: async (event) => {
      claimContext.assertActive()
      if (
        event.id !== claimContext.event.id ||
        event.tenantId !== claimContext.claimRef.tenantId ||
        !event.conversationId ||
        !event.inboundMessageId ||
        !event.sessionId
      ) {
        throw new NonRetryableOutboxError(
          'Published inbound claim identifiers are missing or foreign'
        )
      }
      const tenantId = claimContext.claimRef.tenantId
      const correlationId = CorrelationIdSchema.parse(event.correlationId)
      const gateway = createControlledCapabilityGateway()
      const prepared = await stageBudget(claimContext, async () => {
        const context = await conversations.findInboundRuntimeContext(
          tenantId,
          event.conversationId!,
          event.sessionId!,
          event.inboundMessageId!
        )
        claimContext.assertActive()
        if (
          !context ||
          !context.session ||
          context.message.id !== event.inboundMessageId ||
          context.session?.id !== event.sessionId ||
          context.message.conversationId !== event.conversationId ||
          context.session.conversationId !== event.conversationId ||
          context.correlationId !== correlationId
        ) {
          throw new NonRetryableOutboxError(
            'Published inbound context binding mismatch'
          )
        }
        if (context.message.runtimeStatus === 'completed')
          return { skip: 'already_completed' } as const
        if (!canBotRespond(context.session.takeoverState))
          return { skip: 'paused_human_takeover' } as const
        let admission = await store.readAdmission(
          tenantId,
          event.inboundMessageId!
        )
        claimContext.assertActive()
        if (!admission) {
          const configuredAgent =
            options.env.CVG_WORKER_AGENT_ID?.trim() ||
            options.env.INBOUND_AGENT_ID?.trim()
          let agentId =
            context.session.agentId ??
            (configuredAgent ? AgentIdSchema.parse(configuredAgent) : undefined)
          if (!agentId)
            throw new NonRetryableOutboxError(
              'Published worker agent mapping is not configured'
            )
          let versionId = context.session.agentVersionId
          if (!versionId) {
            const published = await platform.resolvePublished(
              { tenantId },
              agentId
            )
            claimContext.assertActive()
            if (!published)
              throw new NonRetryableOutboxError('Published version is missing')
            const bound = await conversations.bindSessionAgentVersion(
              tenantId,
              event.sessionId!,
              agentId,
              published.id
            )
            claimContext.assertActive()
            if (!bound?.agentId || !bound.agentVersionId)
              throw new Error('Published session pin failed')
            agentId = bound.agentId
            versionId = bound.agentVersionId
          }
          const version = await platform.getVersion({ tenantId }, versionId)
          claimContext.assertActive()
          if (
            !version ||
            version.agentId !== agentId ||
            version.tenantId !== tenantId ||
            !['PUBLISHED', 'ARCHIVED'].includes(version.status) ||
            version.config.model.timeoutMs > 120_000
          ) {
            throw new NonRetryableOutboxError(
              'Published pinned version is unavailable'
            )
          }
          const timeline = await getConversationTimeline(
            conversations,
            tenantId,
            event.conversationId!
          )
          claimContext.assertActive()
          const history = timeline.messages
            .filter((message) => message.id !== event.inboundMessageId)
            .map(
              (message) =>
                `${message.direction}: ${redactSensitiveText(message.body)}`
            )
            .slice(-20)
          const proposed = prepareControlledPublishedAdmission({
            version,
            actor,
            gateway,
            input: {
              tenantId,
              agentId,
              versionId,
              message: context.message.body,
              history,
              executionId: `exec_${randomUUID()}`,
              traceId: createTraceId(),
              correlationId,
              inboundMessageId: event.inboundMessageId!,
              executionMode: 'CONTROLLED_RUNTIME',
              context: {
                conversationId: event.conversationId!,
                sessionId: event.sessionId!
              }
            }
          })
          admission = await store.admit(proposed, claimContext.claimRef)
          claimContext.assertActive()
        }
        validateAdmission(admission, claimContext)
        if (
          (context.session.agentId &&
            context.session.agentId !== admission.input.agentId) ||
          (context.session.agentVersionId &&
            context.session.agentVersionId !== admission.input.versionId)
        ) {
          throw new NonRetryableOutboxError(
            'Published persisted session pin conflicts'
          )
        }
        const claim = await store.claim(
          admission.executionId,
          claimContext.claimRef
        )
        claimContext.assertActive()
        validateClaim(claim, admission, claimContext)
        if (claim.disposition === 'ACTIVE') {
          if (
            claim.state.phaseState !== 'IDLE_SEALED' ||
            claim.state.snapshot?.fault ||
            claim.state.snapshot?.dispatchClosed ||
            (claim.expiresAt !== null &&
              Date.parse(claim.expiresAt) <= Date.now())
          ) {
            throw new Error('Published active claim is not dispatchable')
          }
          await claimContext.attachInner(claim.fence)
        } else if (
          claim.disposition !== 'CLOSED' &&
          claim.state.phaseState !== 'FAULTED' &&
          claim.state.phaseState !== 'OPEN'
        ) {
          throw new Error(
            'Published settlement claim must close dispatch durably'
          )
        }
        return { claim } as const
      })
      if ('skip' in prepared) {
        claimContext.requestStop('finalizing')
        await claimContext.stopAndJoin()
        return { status: prepared.skip, externalEffects: false }
      }
      const claim = prepared.claim
      let trace: TestRunTrace
      if (claim.disposition === 'CLOSED') {
        claimContext.requestStop('finalizing')
        await claimContext.stopAndJoin()
        trace = requireClosedTrace(claim)
      } else {
        // Unsafe recovery has no inner renewal or new admission; facade performs
        // settlement only using the persisted FAULTED/OPEN state.
        if (
          claim.disposition === 'SETTLEMENT' ||
          claim.disposition === 'CANCELLED'
        ) {
          claimContext.requestStop('finalizing')
          await claimContext.stopAndJoin()
        }
        const lifecycle: ControlledKernelHostContext['lifecycle'] = {
          assertActive: () => claimContext.assertActive(),
          requestStop: (reason) => claimContext.requestStop(reason),
          stopAndJoin: () => claimContext.stopAndJoin()
        }
        const host = store.createHost(claim, lifecycle, claimContext.signal)
        const callbacks = new Set<Promise<void>>()
        let callbackFailure: unknown
        let facadeFailure: unknown
        let facadeFailed = false
        let result:
          | Awaited<ReturnType<typeof executePublishedAgent>>
          | undefined
        try {
          result = await executePublishedAgent(
            {
              store: platform,
              tenantId,
              agentId: AgentIdSchema.parse(claim.input.agentId),
              versionId: claim.input.versionId,
              traceId: TraceIdSchema.parse(claim.input.traceId),
              message: claim.input.message,
              history: claim.input.history,
              context: claim.input.context,
              actor,
              capabilityGateway: gateway,
              ...(claim.input.requireCapabilityApproval
                ? { requireCapabilityApproval: true }
                : {}),
              onToolAudit: (auditEvent) => {
                const pending = Promise.resolve().then(async () => {
                  validateToolAudit(claim, auditEvent)
                  await store.appendToolAudit(claim, auditEvent)
                })
                callbacks.add(pending)
                void pending.catch((error: unknown) => {
                  callbackFailure ??= error
                  claimContext.requestStop(error)
                })
                return pending
              }
            },
            host
          )
        } catch (error) {
          facadeFailed = true
          facadeFailure = error
        }
        const mirrored = await Promise.allSettled(callbacks)
        if (
          callbackFailure !== undefined ||
          mirrored.some((item) => item.status === 'rejected')
        ) {
          throw facadeFailed
            ? new AggregateError(
                [facadeFailure, callbackFailure],
                'Published facade and tool mirror failed'
              )
            : (callbackFailure ??
                new Error('Published tool audit mirror failed'))
        }
        if (facadeFailed) throw facadeFailure
        if (!result || result.status !== 'completed')
          throw new NonRetryableOutboxError('Published facade did not complete')
        trace = result.trace
        // Terminal wrappers normally stopped already; join again is idempotent.
        await claimContext.stopAndJoin()
      }
      validateTrace(claim, trace)
      const completion = await stageBudget(claimContext, () =>
        conversations.completeInboundRuntime({
          tenantId,
          conversationId: event.conversationId!,
          sessionId: event.sessionId!,
          inboundMessageId: event.inboundMessageId!,
          trace,
          toolAuditEvents: [],
          correlationId
        })
      )
      return {
        status: completion.status,
        runtimeStatus: trace.status ?? 'completed',
        externalEffects: false
      }
    },
    messageOutbound: async () => {
      claimContext.requestStop('finalizing')
      await claimContext.stopAndJoin()
      return {
        status: 'controlled_outbound_suppressed',
        externalEffects: false
      }
    }
  }
}

/** Budget aborts admission, but still joins the actual IO; never detach SQL. */
async function stageBudget<T>(
  execution: ClaimedEventExecution,
  operation: () => Promise<T>
): Promise<T> {
  if (execution.signal.aborted) throw execution.signal.reason
  const timer = setTimeout(
    () =>
      execution.requestStop(
        new Error('Published stage exceeded 5000ms budget')
      ),
    5_000
  )
  timer.unref?.()
  try {
    const result = await operation()
    if (execution.signal.aborted) throw execution.signal.reason
    return result
  } finally {
    clearTimeout(timer)
  }
}

function validateAdmission(
  admission: ControlledPublishedAdmissionRecord,
  execution: ClaimedEventExecution
): void {
  const input = admission.input
  if (
    admission.executionId !== input.executionId ||
    input.tenantId !== execution.claimRef.tenantId ||
    input.inboundMessageId !== execution.event.inboundMessageId ||
    input.context.conversationId !== execution.event.conversationId ||
    input.context.sessionId !== execution.event.sessionId ||
    input.correlationId !== execution.event.correlationId ||
    input.executionMode !== 'CONTROLLED_RUNTIME' ||
    admission.runtime.executionId !== admission.executionId ||
    admission.runtime.capabilityFingerprint !== admission.fingerprint ||
    !/^sha256-[a-f0-9]{64}$/.test(admission.requestDigest)
  )
    throw new Error('Published admission identity mismatch')
}

function validateClaim(
  claim: ControlledPublishedClaim,
  admission: ControlledPublishedAdmissionRecord,
  execution: ClaimedEventExecution
): void {
  validateAdmission(claim, execution)
  const identity = claim.identity
  const outer = execution.claimRef
  if (
    claim.executionId !== admission.executionId ||
    claim.requestDigest !== admission.requestDigest ||
    claim.fingerprint !== admission.fingerprint ||
    controlledDigest(claim.input) !== controlledDigest(admission.input) ||
    identity.executionId !== claim.executionId ||
    identity.tenantId !== outer.tenantId ||
    identity.workerId !== outer.processWorkerId ||
    !Number.isSafeInteger(identity.attempt) ||
    identity.attempt <
      (claim.disposition === 'CANCELLED' ||
      (claim.disposition === 'CLOSED' &&
        claim.state.runtimeResult?.stopReason === 'CANCELLED')
        ? 0
        : 1) ||
    identity.outboxId !== outer.eventId ||
    identity.outerWorkerId !== outer.processWorkerId ||
    identity.outerAttempt !== outer.expectedOuterAttempt ||
    identity.outerAttemptRowId !== outer.expectedAttemptRowId ||
    identity.requestDigest !== claim.requestDigest ||
    identity.correlationId !== claim.input.correlationId ||
    identity.inboundMessageId !== claim.input.inboundMessageId ||
    identity.conversationId !== claim.input.context.conversationId ||
    identity.sessionId !== claim.input.context.sessionId ||
    identity.traceId !== claim.input.traceId ||
    identity.agentId !== claim.input.agentId ||
    identity.versionId !== claim.input.versionId ||
    claim.fence.workerId !== identity.workerId ||
    claim.fence.attempt !== identity.attempt ||
    claim.fence.executionId !== identity.executionId ||
    claim.fence.tenantId !== identity.tenantId ||
    controlledDigest(claim.fence.outer) !== controlledDigest(outer) ||
    (claim.expiresAt !== null &&
      !Number.isFinite(Date.parse(claim.expiresAt))) ||
    !['ACTIVE', 'SETTLEMENT', 'CANCELLED', 'CLOSED'].includes(claim.disposition)
  )
    throw new Error('Published claim identity mismatch')
}

function validateTrace(
  claim: ControlledPublishedClaim,
  trace: TestRunTrace
): void {
  if (
    trace.tenantId !== claim.input.tenantId ||
    trace.traceId !== claim.input.traceId ||
    trace.agentId !== claim.input.agentId ||
    trace.versionId !== claim.input.versionId ||
    trace.conversationId !== claim.input.context.conversationId ||
    trace.sessionId !== claim.input.context.sessionId ||
    trace.provider.externalCall !== false ||
    trace.knowledge.status === 'answered'
  )
    throw new Error('Published trace binding mismatch')
}

function requireClosedTrace(claim: ControlledPublishedClaim): TestRunTrace {
  const trace = claim.state.closedTrace
  if (
    claim.state.phaseState !== 'CLOSED' ||
    !trace ||
    !claim.state.runtimeResult ||
    trace.response.text !== claim.state.runtimeResult.response ||
    (claim.state.runtimeResult.stopReason !== 'COMPLETED' &&
      (trace.status === 'completed' ||
        trace.response.mode !== 'handoff' ||
        trace.tools.some((tool) => tool.status === 'succeeded')))
  ) {
    throw new Error('Published closed trace is invalid')
  }
  validateTrace(claim, trace)
  return trace
}

function validateToolAudit(
  claim: ControlledPublishedClaim,
  event: PluginAuditEvent
): void {
  if (
    event.type !== 'tool_call' ||
    event.tenantId !== claim.identity.tenantId ||
    event.traceId !== claim.identity.traceId ||
    event.agentId !== claim.identity.agentId ||
    event.versionId !== claim.identity.versionId ||
    event.correlationId !== claim.identity.correlationId
  )
    throw new Error('Published tool audit parents mismatch')
}

/** Starts abort synchronously, and closes the pool only after every owned promise settles. */
export function closePublishedWorkerResources(
  registry: ClaimExecutionRegistry,
  pool: { end(): Promise<void> },
  job?: Promise<unknown>
): Promise<void> {
  const drain = registry.stopAndDrain()
  const pending: Promise<unknown>[] = job ? [drain, job] : [drain]
  return Promise.allSettled(pending).then(async (results) => {
    const failed = results.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    try {
      await pool.end()
    } catch (error) {
      failed.push({ status: 'rejected', reason: error })
    }
    if (failed.length)
      throw new AggregateError(
        failed.map((result) => result.reason),
        'Published worker shutdown failed'
      )
  })
}
