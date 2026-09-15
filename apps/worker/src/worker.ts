import {
  executePublishedAgent,
  parsePublishedAgentJob,
  type PublishedAgentJobDependencies
} from '@cvg/agent-core'
import { TenantIdSchema } from '@cvg/platform'
import {
  CONTINUOUS_WORKER_RUN_MODE,
  parseContinuousWorkerSettings
} from './continuous-worker.ts'
import { parseOperationalFaultPoint } from './operational-harness-worker.ts'

export type WorkerRuntimeDependencies = PublishedAgentJobDependencies

export interface WorkerStartupFailure {
  code:
    | 'queue_adapter_missing'
    | 'queue_adapter_unsupported'
    | 'controlled_tenant_missing'
    | 'postgres_database_missing'
    | 'postgres_rls_required'
    | 'controlled_mode_required'
    | 'production_controlled_worker_forbidden'
    | 'worker_run_mode_unsupported'
    | 'continuous_durable_adapter_required'
    | 'continuous_settings_invalid'
    | 'phase2_fault_point_invalid'
  message: string
}

export async function processAgentTurnJob(
  rawInput: unknown,
  dependencies: WorkerRuntimeDependencies
) {
  const input = parsePublishedAgentJob(rawInput)

  const context = {
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {})
  }

  return executePublishedAgent({
    store: dependencies.platform,
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    message: input.message,
    history: input.history,
    ...(input.approvedKnowledge
      ? { approvedKnowledge: input.approvedKnowledge }
      : {}),
    ...(dependencies.resolveApprovedKnowledge
      ? { resolveApprovedKnowledge: dependencies.resolveApprovedKnowledge }
      : {}),
    ...(Object.keys(context).length > 0 ? { context } : {})
  })
}

export function getWorkerStartupFailure(
  env: NodeJS.ProcessEnv = process.env
): WorkerStartupFailure | null {
  const runMode = env.CVG_WORKER_RUN_MODE?.trim()
  const operationalHarness =
    env.CVG_WORKER_RUNTIME?.trim() === 'operational-harness'
  if (operationalHarness) {
    if (env.NODE_ENV === 'production') {
      return {
        code: 'production_controlled_worker_forbidden',
        message:
          'The neutral operational harness worker is controlled-only and disabled in production'
      }
    }
    if (!TenantIdSchema.safeParse(env.CVG_WORKER_TENANT_ID).success) {
      return {
        code: 'controlled_tenant_missing',
        message: 'Operational harness worker tenant is not configured'
      }
    }
    if (runMode) {
      return {
        code: 'worker_run_mode_unsupported',
        message:
          'The operational harness worker is a controlled single-pass drain and does not accept a run mode'
      }
    }
    try {
      parseOperationalFaultPoint(env.PHASE2_FAULT_POINT, env)
    } catch (error) {
      return {
        code: 'phase2_fault_point_invalid',
        message:
          error instanceof Error
            ? error.message
            : 'Phase 2 fault point is invalid'
      }
    }
    return null
  }

  const adapter = env.CVG_WORKER_QUEUE_ADAPTER?.trim()
  if (!adapter) {
    return {
      code: 'queue_adapter_missing',
      message: 'Worker queue adapter is not configured'
    }
  }

  if (runMode && runMode !== CONTINUOUS_WORKER_RUN_MODE) {
    return {
      code: 'worker_run_mode_unsupported',
      message: 'Worker run mode is not supported'
    }
  }

  if (adapter === 'controlled-memory') {
    if (!TenantIdSchema.safeParse(env.CVG_WORKER_TENANT_ID).success) {
      return {
        code: 'controlled_tenant_missing',
        message: 'Controlled worker tenant is not configured'
      }
    }
    if (runMode === CONTINUOUS_WORKER_RUN_MODE) {
      return {
        code: 'continuous_durable_adapter_required',
        message: 'Continuous worker requires the durable PostgreSQL outbox'
      }
    }
    return null
  }

  if (adapter === 'postgres-controlled' || adapter === 'postgres') {
    if (env.NODE_ENV === 'production') {
      return {
        code: 'production_controlled_worker_forbidden',
        message:
          'Controlled PostgreSQL worker is disabled in production pending external gates'
      }
    }
    if (!env.DATABASE_URL?.trim()) {
      return {
        code: 'postgres_database_missing',
        message: 'DATABASE_URL is required for the PostgreSQL worker'
      }
    }
    if (!TenantIdSchema.safeParse(env.CVG_WORKER_TENANT_ID).success) {
      return {
        code: 'controlled_tenant_missing',
        message: 'Controlled worker tenant is not configured'
      }
    }
    if (env.POSTGRES_RLS_ENFORCEMENT !== 'true') {
      return {
        code: 'postgres_rls_required',
        message: 'PostgreSQL worker requires tenant RLS enforcement'
      }
    }
    if (env.CVG_WORKER_CONTROLLED_MODE !== 'true') {
      return {
        code: 'controlled_mode_required',
        message: 'PostgreSQL worker requires explicit controlled mode'
      }
    }
    if (runMode === CONTINUOUS_WORKER_RUN_MODE) {
      try {
        parseContinuousWorkerSettings(env)
      } catch (error) {
        return {
          code: 'continuous_settings_invalid',
          message:
            error instanceof Error
              ? error.message
              : 'Continuous worker settings are invalid'
        }
      }
    }
    return null
  }

  return {
    code: 'queue_adapter_unsupported',
    message: 'No controlled worker queue adapter is available'
  }
}
