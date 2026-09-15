import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { createInMemoryOperationalExecutionStore } from '@cvg/harness'
import { buildServer } from '../../../api/src/server.ts'
import {
  createOperationalHarnessWorker,
  OPERATIONAL_HARNESS_WORKER_RUNTIME
} from '../operational-harness-worker.ts'
import {
  PHASE2_SYNTHETIC_EFFECT_TOOL_ID,
  PHASE2_SYNTHETIC_EFFECT_TOOL_VERSION
} from '../phase2-synthetic-effect.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000924'
const operationKey = 'phase2-synthetic-effect-operation'

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.r4.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'Phase 2 synthetic effect proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [PHASE2_SYNTHETIC_EFFECT_TOOL_ID],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_r4_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_r4_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_r4_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_r4_synthetic' as RuntimeInput['traceId'],
    userMessage: 'phase 2 synthetic effect proof',
    context: {
      values: { fixture: 'aaa-21-r4' },
      sourceIds: ['phase2-r4-synthetic-effect'],
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
      input: { fixture: 'phase2' }
    }
  }
}

function statusHeaders(): Record<string, string> {
  return {
    'x-tenant-id': tenantId,
    'x-operator-id': 'operator.phase2.synthetic',
    'x-operator-role': 'Operator'
  }
}

describe('AAA-21 R4 operational synthetic effect vertical path', () => {
  it('runs HTTP → queue → public worker → journaled tool → GET and replays once', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const workerRuntime = createOperationalHarnessWorker(
      {
        NODE_ENV: 'test',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_SYNTHETIC_EFFECT: 'true',
        CVG_WORKER_RUNTIME: OPERATIONAL_HARNESS_WORKER_RUNTIME,
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_ID: 'worker-phase2-r4-synthetic'
      },
      { store }
    )
    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: workerRuntime.approvalAuthority
    })

    try {
      const payload = {
        idempotencyKey: 'phase2-r4-http-effect-1',
        runtime: runtime()
      }
      const accepted = await app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: { 'x-tenant-id': tenantId },
        payload
      })
      expect(accepted.statusCode).toBe(202)
      const executionId = accepted.json().data.execution.id as string
      expect((await store.get(tenantId, executionId))?.state).toBe('QUEUED')

      const processed = await workerRuntime.worker.processNext()
      expect(processed.kind).toBe('processed')
      if (processed.kind !== 'processed') return
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.toolResult?.output).toEqual({
        fixture: 'phase2',
        applied: true
      })

      const replay = await app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: { 'x-tenant-id': tenantId },
        payload
      })
      const status = await app.inject({
        method: 'GET',
        url: `/v1/executions/${executionId}`,
        headers: statusHeaders()
      })
      const idle = await workerRuntime.worker.processNext()
      const journal = await workerRuntime.effectJournal?.get(
        tenantId,
        operationKey
      )
      const events = await store.listEvents(tenantId, executionId)

      expect(replay.statusCode).toBe(202)
      expect(replay.json().data.created).toBe(false)
      expect(replay.json().data.execution.id).toBe(executionId)
      expect(status.statusCode).toBe(200)
      expect(status.json().data.state).toBe('SUCCEEDED')
      expect(status.json().data.result.toolResult.output).toEqual({
        fixture: 'phase2',
        applied: true
      })
      expect(idle).toEqual({ kind: 'idle' })
      expect(journal).toMatchObject({
        state: 'CONFIRMED',
        operationKey,
        proposalHash: expect.stringMatching(/^[0-9a-f]{64}$/)
      })
      expect(events.map((event) => event.type)).toEqual([
        'RECEIVED',
        'QUEUED',
        'CLAIMED',
        'RUNNING',
        'SUCCEEDED'
      ])
    } finally {
      await app.close()
      await workerRuntime.close()
    }
  })

  it('keeps the default worker effect-free when the fixture flag is absent', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const workerRuntime = createOperationalHarnessWorker(
      {
        NODE_ENV: 'test',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_ID: 'worker-phase2-r4-default'
      },
      { store }
    )

    try {
      const submitted = await store.submit({
        tenantId,
        idempotencyKey: 'phase2-r4-default-effect-free',
        runtime: runtime()
      })
      const processed = await workerRuntime.worker.processNext()

      expect(processed.kind).toBe('processed')
      if (processed.kind !== 'processed') return
      expect(processed.record.state).toBe('FAILED_TERMINAL')
      expect(workerRuntime.effectJournal).toBeNull()
      expect(await store.get(tenantId, submitted.record.id)).toMatchObject({
        state: 'FAILED_TERMINAL',
        failure: {
          code: 'insufficient_evidence'
        }
      })
    } finally {
      await workerRuntime.close()
    }
  })
})
