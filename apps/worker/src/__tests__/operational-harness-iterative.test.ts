import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../../../api/src/server.ts'
import { createOperationalHarnessWorker } from '../operational-harness-worker.ts'
import {
  PHASE3_TOOL_AVAILABILITY,
  PHASE3_TOOL_RESERVE,
  type Phase3Observer
} from '../phase3-synthetic-agent.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000003'

function runtime(profile: 'iterative' | null = 'iterative'): RuntimeInput {
  return {
    agent: {
      id: 'agent.phase3.worker' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 3 iterative worker proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE3_TOOL_AVAILABILITY, PHASE3_TOOL_RESERVE],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_phase3_worker' as RuntimeInput['conversationId'],
    sessionId: 'session_phase3_worker' as RuntimeInput['sessionId'],
    correlationId: 'correlation_phase3_worker' as RuntimeInput['correlationId'],
    traceId: 'trace_phase3_worker' as RuntimeInput['traceId'],
    userMessage: 'reserve resource-x',
    context: {
      values: { fixture: 'phase3-worker' },
      sourceIds: ['phase3-worker'],
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-15T00:00:00.000Z' },
    budget: {
      maxSteps: 8,
      maxModelCalls: 4,
      maxToolCalls: 4,
      maxDurationMs: 30_000,
      maxCostUsd: 1,
      maxTokens: 4_000,
      maxKnowledgeCalls: 3,
      maxReplans: 2,
      maxVerificationCalls: 3,
      maxDecisionRepairs: 1
    },
    ...(profile ? { runtimeProfile: profile } : {})
  }
}

function workerFor(
  scenario: 'operational' | 'knowledge' | 'waiting_user' | 'approval',
  observer: Phase3Observer
) {
  return createOperationalHarnessWorker(
    {
      NODE_ENV: 'test',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_SYNTHETIC_EFFECT: 'true',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_ID: `worker-phase3-${scenario}`,
      CVG_WORKER_RUNTIME_PROFILE: 'iterative',
      CVG_WORKER_ITERATIVE_SCENARIO: scenario
    },
    { syntheticEffectObserver: observer }
  )
}

async function submit(
  app: ReturnType<typeof buildServer>,
  key: string,
  profile: 'iterative' | null = 'iterative'
): Promise<string> {
  const accepted = await app.inject({
    method: 'POST',
    url: '/v1/executions',
    headers: { 'x-tenant-id': tenantId },
    payload: { idempotencyKey: key, runtime: runtime(profile) }
  })
  if (accepted.statusCode !== 202) {
    throw new Error(`submission failed with HTTP ${accepted.statusCode}`)
  }
  return accepted.json().data.execution.id as string
}

describe('P3-WORKER — iterative governed loop through the durable spine', () => {
  it('P3-WORKER-001 completes a multi-step operational execution', async () => {
    const observed: string[] = []
    const workerRuntime = workerFor('operational', (context) =>
      observed.push(context.operationKey ?? '')
    )
    const app = buildServer({
      operationalExecution: workerRuntime.store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority,
      ...(workerRuntime.stepStore
        ? { executionSteps: workerRuntime.stepStore }
        : {})
    })
    try {
      const executionId = await submit(app, 'phase3-operational-1')
      const processed = await workerRuntime.worker.processNext()
      expect(processed.kind).toBe('processed')
      if (processed.kind !== 'processed') return
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.stopReason).toBe('COMPLETED')
      expect(processed.record.result?.steps).toBeGreaterThanOrEqual(4)
      expect(processed.record.result?.toolCalls).toBe(2)
      expect(observed).toHaveLength(2)

      const journal = await workerRuntime.effectJournal?.get(
        tenantId,
        observed[1] as string
      )
      expect(journal?.state).toBe('CONFIRMED')

      const trajectory = await app.inject({
        method: 'GET',
        url: `/v1/executions/${executionId}/trajectory`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'operator.phase3',
          'x-operator-role': 'Operator'
        }
      })
      expect(trajectory.statusCode).toBe(200)
      const steps = trajectory.json().data.trajectory.steps as Array<{
        stepType: string
        decisionType?: string
      }>
      expect(steps.length).toBeGreaterThanOrEqual(4)
      expect(steps.some((step) => step.decisionType === 'REPLAN')).toBe(true)
      expect(steps.some((step) => step.stepType === 'TOOL')).toBe(true)
      expect(steps.some((step) => step.stepType === 'VERIFY')).toBe(true)
      expect(steps.some((step) => step.stepType === 'RESPOND')).toBe(true)

      const idle = await workerRuntime.worker.processNext()
      expect(idle.kind).toBe('idle')
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })

  it('P3-WORKER-002 completes the synthetic knowledge loop with two searches', async () => {
    const workerRuntime = workerFor('knowledge', () => undefined)
    const app = buildServer({
      operationalExecution: workerRuntime.store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority,
      ...(workerRuntime.stepStore
        ? { executionSteps: workerRuntime.stepStore }
        : {})
    })
    try {
      const executionId = await submit(app, 'phase3-knowledge-1')
      const processed = await workerRuntime.worker.processNext()
      expect(processed.kind).toBe('processed')
      if (processed.kind !== 'processed') return
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.response).toContain(
        'evidence-infectious-1'
      )
      const trajectory = await app.inject({
        method: 'GET',
        url: `/v1/executions/${executionId}/trajectory`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'operator.phase3',
          'x-operator-role': 'Operator'
        }
      })
      const steps = trajectory.json().data.trajectory.steps as Array<{
        stepType: string
      }>
      expect(
        steps.filter((step) => step.stepType === 'KNOWLEDGE')
      ).toHaveLength(2)
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })

  it('P3-WORKER-003 pauses for user input, resumes and completes once', async () => {
    const observed: string[] = []
    const workerRuntime = workerFor('waiting_user', (context) =>
      observed.push(context.operationKey ?? '')
    )
    const app = buildServer({
      operationalExecution: workerRuntime.store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority,
      ...(workerRuntime.stepStore
        ? { executionSteps: workerRuntime.stepStore }
        : {})
    })
    try {
      const executionId = await submit(app, 'phase3-waiting-1')
      const paused = await workerRuntime.worker.processNext()
      expect(paused.kind).toBe('processed')
      if (paused.kind !== 'processed') return
      expect(paused.record.state).toBe('WAITING_USER')
      expect(observed).toHaveLength(0)

      const provided = await app.inject({
        method: 'POST',
        url: `/v1/executions/${executionId}/input`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'operator.phase3',
          'x-operator-role': 'Operator'
        },
        payload: { message: '2026-10-01' }
      })
      expect(provided.statusCode).toBe(202)
      expect(provided.json().data.resume).toBe('user_input')

      const completed = await workerRuntime.worker.processNext()
      expect(completed.kind).toBe('processed')
      if (completed.kind !== 'processed') return
      expect(completed.record.state).toBe('SUCCEEDED')
      expect(observed).toHaveLength(1)
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })

  it('P3-WORKER-004 pauses for approval and resumes without duplicate effect', async () => {
    const observed: string[] = []
    const workerRuntime = workerFor('approval', (context) =>
      observed.push(context.operationKey ?? '')
    )
    const app = buildServer({
      operationalExecution: workerRuntime.store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority,
      ...(workerRuntime.stepStore
        ? { executionSteps: workerRuntime.stepStore }
        : {})
    })
    try {
      const executionId = await submit(app, 'phase3-approval-1')
      const paused = await workerRuntime.worker.processNext()
      expect(paused.kind).toBe('processed')
      if (paused.kind !== 'processed') return
      expect(paused.record.state).toBe('WAITING_APPROVAL')
      expect(observed).toHaveLength(0)

      const approvalId = paused.record.approvalId as string
      const decision = await app.inject({
        method: 'POST',
        url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
        headers: {
          'x-tenant-id': tenantId,
          'x-operator-id': 'approver.phase3',
          'x-operator-role': 'Approver',
          'idempotency-key': 'phase3-approval-command-1'
        },
        payload: { decision: 'approved', note: 'synthetic approval' }
      })
      expect(decision.statusCode).toBe(202)

      const completed = await workerRuntime.worker.processNext()
      expect(completed.kind).toBe('processed')
      if (completed.kind !== 'processed') return
      expect(completed.record.state).toBe('SUCCEEDED')
      expect(observed).toHaveLength(1)

      const repeated = await workerRuntime.worker.processNext()
      expect(repeated.kind).toBe('idle')
      expect(observed).toHaveLength(1)
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })

  it('P3-WORKER-005 keeps the single-pass profile on the same factory', async () => {
    const workerRuntime = createOperationalHarnessWorker({
      NODE_ENV: 'test',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_ID: 'worker-phase3-single-pass'
    })
    const app = buildServer({
      operationalExecution: workerRuntime.store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority
    })
    try {
      const accepted = await app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: { 'x-tenant-id': tenantId },
        payload: {
          idempotencyKey: 'phase3-single-pass-1',
          runtime: runtime(null)
        }
      })
      expect(accepted.statusCode).toBe(202)
      const processed = await workerRuntime.worker.processNext()
      expect(processed.kind).toBe('processed')
      if (processed.kind !== 'processed') return
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.steps).toBe(1)
      expect(workerRuntime.runtimeProfile).toBe('single_pass')
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })
})
