import { createInMemoryOperationalExecutionStore } from '@cvg/harness'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../apps/api/src/server.ts'
import { createOperationalHarnessWorker } from '../apps/worker/src/operational-harness-worker.ts'
import {
  PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
  PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION
} from '../apps/worker/src/phase2-synthetic-effect.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000925'
const operationKey = 'phase2-demo-operation'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.phase2.demo' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 2 controlled demonstration',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE2_SYNTHETIC_EFFECT_TOOL_ID],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_phase2_demo' as RuntimeInput['conversationId'],
    sessionId: 'session_phase2_demo' as RuntimeInput['sessionId'],
    correlationId: 'correlation_phase2_demo' as RuntimeInput['correlationId'],
    traceId: 'trace_phase2_demo' as RuntimeInput['traceId'],
    userMessage: 'phase 2 controlled demo',
    context: {
      values: { fixture: 'phase2-demo' },
      sourceIds: ['phase2-demo'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-14T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    },
    requestedTool: {
      toolId: PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
      toolVersion: PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION,
      operationKey,
      input: { fixture: 'phase2-demo' }
    }
  }
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('phase2 demo is forbidden in production')
  }
  // The demo uses the API's explicit simulation identity fixture. It never
  // changes a caller's production process because production was rejected
  // above and this script is a short-lived controlled process.
  process.env.NODE_ENV = 'test'
  const store = createInMemoryOperationalExecutionStore()
  const workerRuntime = createOperationalHarnessWorker(
    {
      NODE_ENV: 'test',
      CVG_WORKER_CONTROLLED_MODE: 'true',
      CVG_WORKER_SYNTHETIC_EFFECT: 'true',
      CVG_WORKER_TENANT_ID: tenantId,
      CVG_WORKER_ID: 'worker-phase2-demo'
    },
    { store }
  )
  const app = buildServer({
    operationalExecution: store,
    operationalApprovalAuthority: workerRuntime.approvalAuthority,
    identityMode: 'simulation',
    requireAuthenticatedMutations: false
  })

  try {
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantId },
      payload: { idempotencyKey: 'phase2-demo-1', runtime: runtime() }
    })
    if (accepted.statusCode !== 202) {
      throw new Error(`demo submission failed with HTTP ${accepted.statusCode}`)
    }
    const executionId = accepted.json().data.execution.id as string
    const processed = await workerRuntime.worker.processNext()
    if (
      processed.kind !== 'processed' ||
      processed.record.state !== 'SUCCEEDED'
    ) {
      throw new Error('demo worker did not persist SUCCEEDED')
    }
    const status = await app.inject({
      method: 'GET',
      url: `/v1/executions/${executionId}`,
      headers: {
        'x-tenant-id': tenantId,
        'x-operator-id': 'operator.phase2.demo',
        'x-operator-role': 'Operator'
      }
    })
    const journal = await workerRuntime.effectJournal?.get(
      tenantId,
      operationKey
    )
    if (status.statusCode !== 200 || journal?.state !== 'CONFIRMED') {
      throw new Error('demo status or effect journal did not confirm')
    }
    console.log(
      JSON.stringify({
        event: 'phase2.demo.completed',
        executionId,
        state: status.json().data.state,
        attempt: status.json().data.attempt,
        effectState: journal.state,
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
      event: 'phase2.demo.failed',
      error: error instanceof Error ? error.message : 'unknown failure',
      externalEffects: false
    })
  )
  process.exitCode = 1
})
