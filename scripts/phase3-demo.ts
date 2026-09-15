import type { RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../apps/api/src/server.ts'
import { createOperationalHarnessWorker } from '../apps/worker/src/operational-harness-worker.ts'
import {
  PHASE3_TOOL_AVAILABILITY,
  PHASE3_TOOL_RESERVE
} from '../apps/worker/src/phase3-synthetic-agent.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000935'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.phase3.demo' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 3 controlled demonstration',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE3_TOOL_AVAILABILITY, PHASE3_TOOL_RESERVE],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_phase3_demo' as RuntimeInput['conversationId'],
    sessionId: 'session_phase3_demo' as RuntimeInput['sessionId'],
    correlationId: 'correlation_phase3_demo' as RuntimeInput['correlationId'],
    traceId: 'trace_phase3_demo' as RuntimeInput['traceId'],
    userMessage: 'phase 3 controlled demo',
    context: {
      values: { fixture: 'phase3-demo' },
      sourceIds: ['phase3-demo'],
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
    runtimeProfile: 'iterative'
  }
}

function workerFor(
  scenario: 'operational' | 'waiting_user' | 'knowledge',
  observed: string[]
) {
  return createOperationalHarnessWorker(
    {
      NODE_ENV: 'test',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_SYNTHETIC_EFFECT: 'true',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_ID: `worker-phase3-demo-${scenario}`,
      CVG_WORKER_RUNTIME_PROFILE: 'iterative',
      CVG_WORKER_ITERATIVE_SCENARIO: scenario
    },
    {
      syntheticEffectObserver: (context) =>
        observed.push(context.operationKey ?? '')
    }
  )
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('phase3 demo is forbidden in production')
  }
  process.env.NODE_ENV = 'test'
  const observed: string[] = []
  const workerRuntime = workerFor('operational', observed)
  const app = buildServer({
    operationalExecution: workerRuntime.store,
    operationalApprovalAuthority: workerRuntime.approvalAuthority,
    ...(workerRuntime.stepStore
      ? { executionSteps: workerRuntime.stepStore }
      : {})
  })
  try {
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantId },
      payload: { idempotencyKey: 'phase3-demo-1', runtime: runtime() }
    })
    if (accepted.statusCode !== 202) {
      throw new Error(`demo submission failed with HTTP ${accepted.statusCode}`)
    }
    const executionId = accepted.json().data.execution.id as string
    const processed = await workerRuntime.worker.processNext()
    if (processed.kind !== 'processed') {
      throw new Error('demo worker returned idle')
    }
    const trajectory = await app.inject({
      method: 'GET',
      url: `/v1/executions/${executionId}/trajectory`,
      headers: {
        'x-tenant-id': tenantId,
        'x-operator-id': 'operator.phase3.demo',
        'x-operator-role': 'Operator'
      }
    })
    console.log(
      JSON.stringify({
        event: 'phase3.demo.completed',
        executionId,
        state: processed.record.state,
        stopReason: processed.record.result?.stopReason,
        steps: processed.record.result?.steps,
        toolCalls: processed.record.result?.toolCalls,
        trajectory: trajectory
          .json()
          .data.trajectory.steps.map(
            (step: { stepType: string }) => step.stepType
          ),
        observedEffects: observed.length,
        externalEffects: false,
        persistence: 'in-memory-controlled'
      })
    )
  } finally {
    await app.close()
    await workerRuntime.close()
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'phase3.demo.failed',
      error: error instanceof Error ? error.message : 'unknown failure',
      externalEffects: false
    })
  )
  process.exitCode = 1
})
