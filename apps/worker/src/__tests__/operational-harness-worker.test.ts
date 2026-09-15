import { describe, expect, it, vi } from 'vitest'
import { NoopOrchestrator } from '@cvg/harness-orchestrator'
import {
  createInMemoryOperationalExecutionStore,
  type OperationalHarnessOptions
} from '@cvg/harness'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  OPERATIONAL_HARNESS_WORKER_RUNTIME,
  OPERATIONAL_FAULT_POINT_AFTER_CLAIM,
  createOperationalHarnessFaultInjector,
  createOperationalHarnessWorker,
  parseOperationalFaultPoint,
  parseOperationalSyntheticEffect,
  parseOperationalWorkerConcurrency,
  parseOperationalWorkerIdleWait,
  parseOperationalWorkerPollInterval
} from '../operational-harness-worker.ts'
import { getWorkerStartupFailure } from '../worker.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000701'

function input(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'worker fixture',
      instructions: ['synthetic'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_synthetic' as RuntimeInput['traceId'],
    userMessage: 'worker fixture',
    context: {
      values: {},
      sourceIds: [],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-13T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 0,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    }
  }
}

function harnessOptions(): OperationalHarnessOptions {
  return {
    orchestrator: new NoopOrchestrator(),
    modelGateway: {
      complete: async () => ({
        text: 'worker synthetic response',
        provider: 'deterministic-v1',
        model: 'fixture',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    },
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'fixture',
        policyVersion: 'fixture-v1'
      })
    },
    approvals: {
      request: async () => ({ status: 'PENDING', reason: 'fixture' })
    },
    tools: { list: () => [], resolve: () => undefined },
    audit: { append: async () => undefined },
    telemetry: { record: () => undefined }
  }
}

describe('worker operational-harness composition', () => {
  it('uses the neutral worker runtime and public harness boundary', async () => {
    const store = createInMemoryOperationalExecutionStore()
    await store.submit({
      tenantId,
      idempotencyKey: 'worker-composition-1',
      runtime: input()
    })
    const runtime = createOperationalHarnessWorker(
      {
        NODE_ENV: 'test',
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_ID: 'worker-composition-proof'
      },
      { store, harnessOptions: harnessOptions() }
    )
    const processed = await runtime.worker.processNext()
    await runtime.close()

    expect(OPERATIONAL_HARNESS_WORKER_RUNTIME).toBe('operational-harness')
    expect(processed.kind).toBe('processed')
    if (processed.kind === 'processed') {
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.response).toBe('Acknowledged.')
    }
  })

  it('rejects production startup for the controlled neutral worker', () => {
    expect(() =>
      createOperationalHarnessWorker({
        NODE_ENV: 'production',
        CVG_WORKER_TENANT_ID: tenantId
      })
    ).toThrow(/controlled-only/)
  })

  it('selects the neutral runtime without requiring the legacy queue adapter', () => {
    expect(
      getWorkerStartupFailure({
        NODE_ENV: 'test',
        CVG_WORKER_RUNTIME: OPERATIONAL_HARNESS_WORKER_RUNTIME,
        CVG_WORKER_TENANT_ID: tenantId
      })
    ).toBeNull()
  })

  it('parses a bounded explicit worker concurrency', () => {
    expect(parseOperationalWorkerConcurrency(undefined)).toBe(1)
    expect(parseOperationalWorkerConcurrency('4')).toBe(4)
    expect(() => parseOperationalWorkerConcurrency('0')).toThrow()
    expect(() => parseOperationalWorkerConcurrency('33')).toThrow()
    expect(() => parseOperationalWorkerConcurrency('not-a-number')).toThrow()
  })

  it('keeps the process fault point controlled-only and allowlisted', async () => {
    const controlled = {
      NODE_ENV: 'test',
      CVG_WORKER_CONTROLLED_MODE: 'true'
    }
    expect(parseOperationalFaultPoint(undefined, controlled)).toBeUndefined()
    expect(parseOperationalFaultPoint('AFTER_CLAIM', controlled)).toBe(
      OPERATIONAL_FAULT_POINT_AFTER_CLAIM
    )
    expect(() =>
      parseOperationalFaultPoint('BEFORE_CLAIM', controlled)
    ).toThrow(/must be AFTER_CLAIM/)
    expect(() =>
      parseOperationalFaultPoint('AFTER_CLAIM', {
        NODE_ENV: 'test'
      })
    ).toThrow(/CONTROLLED_MODE=true/)
    expect(() =>
      parseOperationalFaultPoint('AFTER_CLAIM', {
        NODE_ENV: 'production',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toThrow(/forbidden in production/)

    const terminate = vi.fn()
    const injector = createOperationalHarnessFaultInjector(
      {
        ...controlled,
        PHASE2_FAULT_POINT: 'AFTER_CLAIM'
      },
      terminate
    )
    expect(injector).toBeDefined()
    await injector?.(OPERATIONAL_FAULT_POINT_AFTER_CLAIM)
    await injector?.(OPERATIONAL_FAULT_POINT_AFTER_CLAIM)
    expect(terminate).toHaveBeenCalledTimes(1)
    expect(terminate).toHaveBeenCalledWith('SIGKILL')
  })

  it('keeps the synthetic effect fixture opt-in and controlled-only', () => {
    expect(parseOperationalSyntheticEffect(undefined)).toBe(false)
    expect(
      parseOperationalSyntheticEffect('true', {
        NODE_ENV: 'test',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toBe(true)
    expect(parseOperationalSyntheticEffect('false')).toBe(false)
    expect(() =>
      parseOperationalSyntheticEffect('true', { NODE_ENV: 'test' })
    ).toThrow(/CONTROLLED_MODE=true/)
    expect(() =>
      parseOperationalSyntheticEffect('true', {
        NODE_ENV: 'production',
        CVG_WORKER_CONTROLLED_MODE: 'true'
      })
    ).toThrow(/forbidden in production/)
    expect(() => parseOperationalSyntheticEffect('enabled')).toThrow(
      /true or false/
    )
  })

  it('keeps controlled idle polling finite and bounded', () => {
    expect(parseOperationalWorkerIdleWait(undefined)).toBe(0)
    expect(parseOperationalWorkerIdleWait('1000')).toBe(1000)
    expect(parseOperationalWorkerPollInterval(undefined)).toBe(25)
    expect(parseOperationalWorkerPollInterval('10')).toBe(10)
    expect(() => parseOperationalWorkerIdleWait('-1')).toThrow()
    expect(() => parseOperationalWorkerIdleWait('60001')).toThrow()
    expect(() => parseOperationalWorkerPollInterval('0')).toThrow()
    expect(() => parseOperationalWorkerPollInterval('1001')).toThrow()
  })

  it('rejects an unsafe PostgreSQL schema before opening the pool', () => {
    expect(() =>
      createOperationalHarnessWorker({
        NODE_ENV: 'test',
        CVG_WORKER_TENANT_ID: tenantId,
        DATABASE_URL: 'postgres://synthetic.invalid/phase2',
        POSTGRES_SCHEMA: 'unsafe-schema'
      })
    ).toThrow(/safe lowercase identifier/)
  })
})
