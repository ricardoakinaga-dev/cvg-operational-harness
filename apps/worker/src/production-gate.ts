import { CONTINUOUS_WORKER_RUN_MODE } from './continuous-worker.ts'
import { KERNEL_WORKER_RUNTIME } from './kernel-composition.ts'

/** Explicit operator opt-in for the PostgreSQL worker in production. */
export const WORKER_PRODUCTION_ENABLED_ENV = 'CVG_WORKER_PRODUCTION_ENABLED'

/**
 * Production runs only the durable governed path: the continuous PostgreSQL
 * worker with the kernel runtime (effect journal, approval authority and
 * audit all durable), after an explicit opt-in. Every other composition stays
 * disabled in production. Returns the refusal message, or null when allowed.
 */
export function postgresProductionOptInFailure(
  env: NodeJS.ProcessEnv
): string | null {
  if (env.NODE_ENV !== 'production') return null
  if (env[WORKER_PRODUCTION_ENABLED_ENV] !== 'true') {
    return `Controlled PostgreSQL worker is disabled in production unless ${WORKER_PRODUCTION_ENABLED_ENV}=true`
  }
  if (env.CVG_WORKER_RUN_MODE?.trim() !== CONTINUOUS_WORKER_RUN_MODE) {
    return 'Production PostgreSQL worker requires CVG_WORKER_RUN_MODE=continuous'
  }
  if (env.CVG_WORKER_RUNTIME?.trim() !== KERNEL_WORKER_RUNTIME) {
    return 'Production PostgreSQL worker requires the durable kernel runtime (CVG_WORKER_RUNTIME=kernel)'
  }
  return null
}
