import { describe, expect, it } from 'vitest'
import { getWorkerStartupFailure } from '../worker.ts'

/**
 * ENGINE-PROD-FIX ENG-015: production runs only the explicitly enabled,
 * durable kernel path; everything else stays refused.
 */

const productionKernel = {
  NODE_ENV: 'production',
  CVG_WORKER_PRODUCTION_ENABLED: 'true',
  CVG_WORKER_QUEUE_ADAPTER: 'postgres',
  CVG_WORKER_RUN_MODE: 'continuous',
  CVG_WORKER_RUNTIME: 'kernel',
  DATABASE_URL: 'postgres://fixture.invalid/cvg',
  CVG_WORKER_TENANT_ID: 'tenant_00000000-0000-4000-8000-000000000163',
  POSTGRES_RLS_ENFORCEMENT: 'true',
  CVG_WORKER_CONTROLLED_MODE: 'true'
}

describe('worker production gate', () => {
  it('accepts the explicitly enabled durable kernel worker', () => {
    expect(getWorkerStartupFailure(productionKernel)).toBeNull()
  })

  it.each([
    ['without the opt-in', { CVG_WORKER_PRODUCTION_ENABLED: 'false' }],
    ['outside continuous mode', { CVG_WORKER_RUN_MODE: '' }],
    ['with a non-durable runtime', { CVG_WORKER_RUNTIME: 'published-agent' }]
  ])('refuses production %s', (_label, override) => {
    expect(
      getWorkerStartupFailure({ ...productionKernel, ...override })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
  })

  it('keeps RLS and controlled mode mandatory after the opt-in', () => {
    expect(
      getWorkerStartupFailure({
        ...productionKernel,
        POSTGRES_RLS_ENFORCEMENT: 'false'
      })
    ).toMatchObject({ code: 'postgres_rls_required' })
    expect(
      getWorkerStartupFailure({
        ...productionKernel,
        CVG_WORKER_CONTROLLED_MODE: 'false'
      })
    ).toMatchObject({ code: 'controlled_mode_required' })
  })

  it('keeps the in-memory and homologation workers out of production', () => {
    expect(
      getWorkerStartupFailure({
        ...productionKernel,
        CVG_WORKER_QUEUE_ADAPTER: 'controlled-memory',
        CVG_WORKER_RUN_MODE: ''
      })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
    expect(
      getWorkerStartupFailure({
        ...productionKernel,
        CVG_WORKER_RUNTIME: 'operational-harness'
      })
    ).toMatchObject({ code: 'production_controlled_worker_forbidden' })
  })
})
