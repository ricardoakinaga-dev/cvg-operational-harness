import { Pool } from 'pg'
import { executePublishedAgent, getConversationTimeline } from '@cvg/agent-core'
import { resolveWorkflowCoordinator } from '@cvg/agent-runtime'
import {
  TenantScopedPostgresControlPlaneRepository,
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  type PostgresPoolLike
} from '@cvg/persistence'
import {
  AgentIdSchema,
  TenantIdSchema,
  canBotRespond,
  type AgentId,
  type AgentVersionId,
  type PluginAuditEvent,
  type TenantId
} from '@cvg/platform'
import { CorrelationIdSchema, redactSensitiveText } from '@cvg/shared'
import {
  createControlledWorker,
  type ControlledWorker,
  type ControlledWorkerHandlers
} from './controlled-worker.ts'
import {
  createContinuousWorker,
  parseContinuousWorkerSettings,
  type ContinuousSweepHandle,
  type ContinuousWorker,
  type ContinuousWorkerTuning,
  type OutboxBacklogProbe
} from './continuous-worker.ts'
import {
  KERNEL_WORKER_RUNTIME,
  KernelRuntimeConfigurationError,
  createPostgresKernelHandlers,
  createPostgresKernelRuntime,
  resolveWorkerRuntimeKind,
  type PostgresKernelRuntime
} from './kernel-composition.ts'
import type { WorkerTelemetry } from './worker-observability.ts'

export const POSTGRES_CONTROLLED_QUEUE_ADAPTER = 'postgres-controlled' as const

export interface PostgresControlledWorkerRuntime {
  pool: Pool
  adapter: TenantScopedPostgresRuntimeRepository
  worker: ControlledWorker
}

export interface PostgresControlledConnection {
  pool: Pool
  adapter: TenantScopedPostgresRuntimeRepository
  platform: TenantScopedPostgresControlPlaneRepository
  tenantId: TenantId
  workerId: string
  handlers: ControlledWorkerHandlers
}

export interface PostgresContinuousWorkerOptions {
  handlers?: ControlledWorkerHandlers
  telemetry?: WorkerTelemetry
  tuning?: Partial<ContinuousWorkerTuning>
  heartbeatIntervalMs?: number
  lagSampleIntervalMs?: number
  sweeps?: ContinuousSweepHandle
}

export interface PostgresContinuousWorkerRuntime {
  pool: Pool
  adapter: TenantScopedPostgresRuntimeRepository
  worker: ContinuousWorker
  tenantId: TenantId
  workerId: string
  tuning: ContinuousWorkerTuning
}

export interface PostgresControlledHandlerOptions {
  /** Pool used only when the governed-kernel runtime is selected. */
  pool?: PostgresPoolLike
  /** Pre-composed durable kernel runtime; required if no pool is provided. */
  kernelRuntime?: PostgresKernelRuntime
}

/**
 * Validates the controlled PostgreSQL configuration and opens the shared
 * pool/adapter/control-plane resources. It never activates an external effect
 * path: production is rejected and controlled mode is mandatory.
 */
export function openPostgresControlledConnection(
  env: NodeJS.ProcessEnv,
  handlers?: ControlledWorkerHandlers
): PostgresControlledConnection {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Controlled PostgreSQL worker is disabled in production pending external gates'
    )
  }
  const databaseUrl = env.DATABASE_URL?.trim()
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for the PostgreSQL worker')
  }
  if (env.POSTGRES_RLS_ENFORCEMENT !== 'true') {
    throw new Error('PostgreSQL worker requires tenant RLS enforcement')
  }
  if (env.CVG_WORKER_CONTROLLED_MODE !== 'true') {
    throw new Error('PostgreSQL worker requires explicit controlled mode')
  }
  const tenantId = TenantIdSchema.parse(env.CVG_WORKER_TENANT_ID)
  const schemaName = env.POSTGRES_SCHEMA?.trim() || undefined
  assertSafeSchemaName(schemaName)
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(schemaName ? { options: `-c search_path=${schemaName}` } : {})
  })
  const adapter = new TenantScopedPostgresRuntimeRepository(
    pool as unknown as PostgresPoolLike
  )
  const platform = new TenantScopedPostgresControlPlaneRepository(
    pool as unknown as PostgresPoolLike
  )
  return {
    pool,
    adapter,
    platform,
    tenantId,
    workerId: env.CVG_WORKER_ID?.trim() || 'worker-controlled-postgres',
    handlers:
      handlers ??
      createPostgresControlledHandlers(env, adapter, platform, { pool })
  }
}

/**
 * Creates the worker against the same tenant-scoped PostgreSQL outbox used by
 * the API. This is intentionally a controlled/no-external-effects runtime;
 * production activation still requires an explicit controlled-mode flag.
 */
export function createPostgresControlledWorker(
  env: NodeJS.ProcessEnv,
  handlers?: ControlledWorkerHandlers
): PostgresControlledWorkerRuntime {
  const connection = openPostgresControlledConnection(env, handlers)
  const worker = createControlledWorker({
    tenantId: connection.tenantId,
    workerId: connection.workerId,
    adapter: connection.adapter,
    handlers: connection.handlers
  })
  return {
    pool: connection.pool,
    adapter: connection.adapter,
    worker
  }
}

/**
 * Creates the supervised continuous worker over the durable PostgreSQL
 * outbox. Tuning is read from the explicit override or the opt-in
 * `CVG_WORKER_*` environment; the queue lag probe is read-only and tenant
 * scoped. No external effect path is composed here.
 */
export function createPostgresContinuousWorker(
  env: NodeJS.ProcessEnv,
  options: PostgresContinuousWorkerOptions = {}
): PostgresContinuousWorkerRuntime {
  const connection = openPostgresControlledConnection(env, options.handlers)
  const tuning: ContinuousWorkerTuning = {
    ...parseContinuousWorkerSettings(env),
    ...options.tuning
  }
  const worker = createContinuousWorker({
    tenantId: connection.tenantId,
    workerId: connection.workerId,
    adapter: connection.adapter,
    handlers: connection.handlers,
    ...tuning,
    ...(options.telemetry ? { telemetry: options.telemetry } : {}),
    ...(options.heartbeatIntervalMs !== undefined
      ? { heartbeatIntervalMs: options.heartbeatIntervalMs }
      : {}),
    ...(options.lagSampleIntervalMs !== undefined
      ? { lagSampleIntervalMs: options.lagSampleIntervalMs }
      : {}),
    backlogProbe: createPostgresOutboxBacklogProbe(
      connection.pool,
      connection.tenantId
    ),
    ...(options.sweeps ? { sweeps: options.sweeps } : {})
  })
  return {
    pool: connection.pool,
    adapter: connection.adapter,
    worker,
    tenantId: connection.tenantId,
    workerId: connection.workerId,
    tuning
  }
}

/**
 * Read-only queue lag probe over the tenant-scoped outbox. It counts pending
 * events plus failed events already eligible for retry; no payload is read.
 */
export function createPostgresOutboxBacklogProbe(
  pool: Pool,
  tenantId: TenantId
): OutboxBacklogProbe {
  return async () =>
    withTenantContext(
      pool as unknown as PostgresPoolLike,
      tenantId,
      async (client) => {
        const result = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count
             FROM outbox_events
            WHERE tenant_id = $1
              AND (status = 'pending'
                   OR (status = 'failed' AND available_at <= now()))`,
          [tenantId]
        )
        return Number(result.rows[0]?.count ?? 0)
      }
    )
}

/**
 * Default inbound composition for the controlled PostgreSQL worker. It reads
 * the committed conversation by id, runs only the deterministic published
 * agent runtime, and finalizes through the tenant-scoped repository. No
 * provider, channel, plugin, or outbound transport is called here.
 */
export function createPostgresControlledHandlers(
  env: NodeJS.ProcessEnv,
  conversations: TenantScopedPostgresRuntimeRepository,
  platform: TenantScopedPostgresControlPlaneRepository,
  options: PostgresControlledHandlerOptions = {}
): ControlledWorkerHandlers {
  resolveWorkflowCoordinator(env)
  if (resolveWorkerRuntimeKind(env) === KERNEL_WORKER_RUNTIME) {
    const parsedTenantId = TenantIdSchema.safeParse(env.CVG_WORKER_TENANT_ID)
    if (!parsedTenantId.success) {
      throw new KernelRuntimeConfigurationError(
        'kernel_runtime_prerequisites_missing',
        'Kernel worker runtime requires CVG_WORKER_TENANT_ID'
      )
    }
    const tenantId = parsedTenantId.data
    if (options.kernelRuntime !== undefined) {
      if (options.kernelRuntime.tenantId !== tenantId) {
        throw new KernelRuntimeConfigurationError(
          'kernel_runtime_prerequisites_missing',
          'Kernel runtime tenant does not match CVG_WORKER_TENANT_ID'
        )
      }
      return createPostgresKernelHandlers(env, options.kernelRuntime)
    }
    const kernelAgentId = resolveWorkerAgentId(env)
    if (!kernelAgentId) {
      throw new KernelRuntimeConfigurationError(
        'kernel_runtime_prerequisites_missing',
        'Kernel worker runtime requires CVG_WORKER_AGENT_ID (or INBOUND_AGENT_ID)'
      )
    }
    if (options.pool === undefined) {
      throw new KernelRuntimeConfigurationError(
        'kernel_runtime_prerequisites_missing',
        'Kernel worker runtime requires a PostgreSQL pool for the durable effect journal and approval authority'
      )
    }
    return createPostgresKernelHandlers(
      env,
      createPostgresKernelRuntime({
        pool: options.pool,
        tenantId,
        env,
        agentId: kernelAgentId
      })
    )
  }

  const configuredAgentId = resolveWorkerAgentId(env)

  return {
    inboundProcess: async (event) => {
      if (!event.conversationId || !event.inboundMessageId) {
        throw new Error('Inbound outbox event is missing runtime identifiers')
      }
      const conversationId = event.conversationId
      const inboundMessageId = event.inboundMessageId
      const sessionId = event.sessionId ?? null
      const tenantId = TenantIdSchema.parse(event.tenantId)
      const correlationId = CorrelationIdSchema.parse(event.correlationId)
      const context = await conversations.findInboundRuntimeContext(
        tenantId,
        conversationId,
        sessionId,
        inboundMessageId
      )
      if (!context) {
        throw new Error('Inbound runtime context was not found')
      }
      if (context.message.runtimeStatus === 'completed') {
        return {
          status: 'already_completed',
          externalEffects: false
        }
      }
      if (context.session && !canBotRespond(context.session.takeoverState)) {
        return {
          status: 'paused_human_takeover',
          externalEffects: false
        }
      }

      const resolvedAgentId = context.session?.agentId ?? configuredAgentId
      if (!resolvedAgentId) {
        throw new Error('Controlled worker agent mapping is not configured')
      }
      let agentId: AgentId = resolvedAgentId
      let versionId: AgentVersionId | undefined =
        context.session?.agentVersionId
      if (!versionId) {
        const published = await platform.resolvePublished({ tenantId }, agentId)
        if (!published) {
          await conversations.markInboundRuntimeCompleted(
            inboundMessageId,
            tenantId
          )
          return {
            status: 'not_configured',
            reason: 'published_version_missing',
            externalEffects: false
          }
        }
        versionId = published.id
        if (context.session) {
          const bound = await conversations.bindSessionAgentVersion(
            tenantId,
            context.session.id,
            agentId,
            versionId
          )
          if (!bound?.agentId || !bound.agentVersionId) {
            throw new Error('Inbound session agent binding failed')
          }
          agentId = bound.agentId
          versionId = bound.agentVersionId
        }
      }

      if (!versionId) {
        throw new Error('Inbound runtime version could not be resolved')
      }

      const timeline = await getConversationTimeline(
        conversations,
        tenantId,
        conversationId
      )
      const history = timeline.messages
        .filter((message) => message.id !== inboundMessageId)
        .map(
          (message) =>
            `${message.direction}: ${redactSensitiveText(message.body)}`
        )
        .slice(-20)
      const toolAuditEvents: PluginAuditEvent[] = []
      const result = await executePublishedAgent({
        store: platform,
        tenantId,
        agentId,
        versionId,
        message: context.message.body,
        history,
        context: {
          conversationId,
          ...(sessionId ? { sessionId } : {})
        },
        onToolAudit: (auditEvent) => {
          toolAuditEvents.push(auditEvent)
        }
      })
      if (result.status !== 'completed') {
        await conversations.markInboundRuntimeCompleted(
          inboundMessageId,
          tenantId
        )
        return {
          status: 'not_configured',
          reason: result.reason,
          externalEffects: false
        }
      }

      const completion = await conversations.completeInboundRuntime({
        tenantId,
        conversationId,
        sessionId,
        inboundMessageId,
        trace: result.trace,
        toolAuditEvents,
        correlationId
      })
      return {
        status: completion.status,
        runtimeStatus: result.trace.status ?? 'completed',
        externalEffects: false
      }
    },
    messageOutbound: () => ({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
  }
}

export function createControlledNoopHandlers(): ControlledWorkerHandlers {
  return {
    inboundProcess: () => ({
      status: 'controlled_inbound_consumed',
      externalEffects: false
    }),
    messageOutbound: () => ({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
  }
}

export function parseControlledDrainLimit(
  rawValue: string | undefined,
  fallback = 10
): number {
  const value = rawValue === undefined ? fallback : Number(rawValue)
  if (!Number.isInteger(value) || value <= 0 || value > 100) {
    throw new Error(
      'CVG_WORKER_MAX_EVENTS must be an integer between 1 and 100'
    )
  }
  return value
}

function assertSafeSchemaName(schemaName: string | undefined): void {
  if (schemaName && !/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('Invalid PostgreSQL schema name')
  }
}

function resolveWorkerAgentId(env: NodeJS.ProcessEnv): AgentId | undefined {
  const raw = env.CVG_WORKER_AGENT_ID?.trim() || env.INBOUND_AGENT_ID?.trim()
  if (!raw) return undefined
  return AgentIdSchema.parse(raw)
}
