import { describe, expect, it } from 'vitest'
import {
  ApprovalEngine as DurableApprovalEngine,
  type ApprovalRequestInput
} from '@cvg/approval-engine'
import {
  OperationalExecutionWorker,
  createInMemoryOperationalExecutionStore
} from '@cvg/harness'
import { DurableApprovalEngineAdapter } from '@cvg/persistence'
import type {
  ApprovalEngine,
  AuditEvent,
  ModelGateway,
  PolicyEngine,
  RuntimeInput,
  TelemetryEvent,
  ToolRegistry
} from '@cvg/harness-contracts'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000601'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000602'

function runtime(tenantId: string): RuntimeInput {
  return {
    agent: {
      id: 'agent.http.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic HTTP execution',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_http_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_http_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_http_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_http_synthetic' as RuntimeInput['traceId'],
    userMessage: 'synthetic HTTP message',
    context: {
      values: { fixture: true },
      sourceIds: ['synthetic'],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: {
      version: 1,
      values: {},
      updatedAt: '2026-09-13T00:00:00.000Z'
    },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  }
}

function harnessFixtures() {
  const audit: AuditEvent[] = []
  const telemetry: TelemetryEvent[] = []
  const modelGateway: ModelGateway = {
    complete: async () => ({
      text: 'unused deterministic model',
      provider: 'deterministic-v1',
      model: 'fixture',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0
    })
  }
  const policy: PolicyEngine = {
    evaluate: async () => ({
      outcome: 'ALLOW',
      reason: 'synthetic allow',
      policyVersion: 'synthetic-v1'
    })
  }
  const approvals: ApprovalEngine = {
    request: async () => ({ status: 'PENDING', reason: 'synthetic pending' })
  }
  const tools: ToolRegistry = { list: () => [], resolve: () => undefined }
  return {
    audit,
    telemetry,
    options: {
      orchestrator: {
        decideNextStep: async () => ({
          action: 'RESPOND' as const,
          response: 'synthetic worker response'
        })
      },
      modelGateway,
      policy,
      approvals,
      tools,
      audit: {
        append: async (event: AuditEvent) => {
          audit.push(event)
        }
      },
      telemetry: {
        record: (event: TelemetryEvent) => {
          telemetry.push(event)
        }
      }
    }
  }
}

describe('canonical execution HTTP boundary', () => {
  it('accepts, deduplicates, scopes, and leaves work queued without inline execution', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = buildServer({ operationalExecution: store })
    const payload = {
      idempotencyKey: 'http-idempotency-1',
      runtime: runtime(tenantA)
    }

    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload
    })
    const duplicate = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload
    })
    const mismatch = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload: {
        ...payload,
        runtime: { ...payload.runtime, userMessage: 'different' }
      }
    })

    expect(accepted.statusCode).toBe(202)
    expect(duplicate.statusCode).toBe(202)
    expect(duplicate.json().data.created).toBe(false)
    expect(duplicate.json().data.execution.id).toBe(
      accepted.json().data.execution.id
    )
    expect(mismatch.statusCode).toBe(409)
    expect(
      (await store.get(tenantA, accepted.json().data.execution.id))?.state
    ).toBe('QUEUED')
    expect(accepted.json().data.execution).not.toHaveProperty('request')

    const get = await app.inject({
      method: 'GET',
      url: `/v1/executions/${accepted.json().data.execution.id}`,
      headers: {
        'x-operator-id': 'operator.execution',
        'x-operator-role': 'Operator',
        'x-tenant-id': tenantA
      }
    })
    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/executions/${accepted.json().data.execution.id}`,
      headers: {
        'x-operator-id': 'operator.other-tenant',
        'x-operator-role': 'Operator',
        'x-tenant-id': tenantB
      }
    })
    await app.close()

    expect(get.statusCode).toBe(200)
    expect(get.json().data.state).toBe('QUEUED')
    expect(crossTenant.statusCode).toBe(404)
  })

  it('hands accepted work to the public harness worker and persists the result', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = buildServer({ operationalExecution: store })
    const fixtures = harnessFixtures()
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload: { idempotencyKey: 'http-worker-1', runtime: runtime(tenantA) }
    })
    const executionId = accepted.json().data.execution.id as string
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
    expect(fixtures.audit).toHaveLength(0)

    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-http-proof',
      tenantId: tenantA,
      harnessOptions: fixtures.options
    })
    const processed = await worker.processNext()
    const result = await app.inject({
      method: 'GET',
      url: `/v1/executions/${executionId}`,
      headers: {
        'x-operator-id': 'operator.execution',
        'x-operator-role': 'Operator',
        'x-tenant-id': tenantA
      }
    })
    await app.close()

    expect(processed.kind).toBe('processed')
    expect(result.statusCode).toBe(200)
    expect(result.json().data.state).toBe('SUCCEEDED')
    expect(result.json().data.result.response).toBe('synthetic worker response')
    expect(fixtures.audit).toHaveLength(1)
    expect(fixtures.telemetry).toHaveLength(1)
  })

  it('keeps one execution identity under concurrent duplicate HTTP submissions', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = buildServer({ operationalExecution: store })
    const payload = {
      idempotencyKey: 'http-concurrent-1',
      runtime: runtime(tenantA)
    }
    const responses = await Promise.all(
      Array.from({ length: 100 }, () =>
        app.inject({
          method: 'POST',
          url: '/v1/executions',
          headers: { 'x-tenant-id': tenantA },
          payload
        })
      )
    )
    const ids = new Set(
      responses.map((response) => response.json().data.execution.id)
    )
    await app.close()

    expect(responses.every((response) => response.statusCode === 202)).toBe(
      true
    )
    expect(ids.size).toBe(1)
    expect(
      (await store.listEvents(tenantA, [...ids][0])).map((event) => event.type)
    ).toEqual(['RECEIVED', 'QUEUED'])
  })

  it('cancels queued execution through the authenticated tenant boundary', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = buildServer({ operationalExecution: store })
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload: { idempotencyKey: 'http-cancel-1', runtime: runtime(tenantA) }
    })
    const executionId = accepted.json().data.execution.id as string
    const headers = {
      'x-tenant-id': tenantA,
      'x-operator-id': 'operator.cancel',
      'x-operator-role': 'Operator',
      'idempotency-key': 'cancel-command-1'
    }
    const cancelled = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/cancel`,
      headers,
      payload: { reason: 'synthetic operator cancellation' }
    })
    const duplicate = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/cancel`,
      headers,
      payload: {}
    })

    const activeStore = createInMemoryOperationalExecutionStore()
    const activeApp = buildServer({ operationalExecution: activeStore })
    const activeAccepted = await activeApp.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload: {
        idempotencyKey: 'http-cancel-active',
        runtime: runtime(tenantA)
      }
    })
    const activeId = activeAccepted.json().data.execution.id as string
    const claimed = await activeStore.claimNext(tenantA, 'worker-cancel-active')
    await activeStore.transition({
      tenantId: tenantA,
      executionId: activeId,
      to: 'RUNNING',
      workerId: 'worker-cancel-active',
      fenceToken: claimed!.record.attempt
    })
    const activeCancel = await activeApp.inject({
      method: 'POST',
      url: `/v1/executions/${activeId}/cancel`,
      headers: { ...headers, 'idempotency-key': 'cancel-command-active' },
      payload: {}
    })
    await app.close()
    await activeApp.close()

    expect(cancelled.statusCode).toBe(200)
    expect(cancelled.json().data.execution.state).toBe('CANCELLED')
    expect(cancelled.json().data.cancelled).toBe(true)
    expect(duplicate.statusCode).toBe(200)
    expect(duplicate.json().data.cancelled).toBe(false)
    expect(activeCancel.statusCode).toBe(409)
  })

  it('authenticates durable approval, resumes after a worker restart, and executes once', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const approvalAuthority = new DurableApprovalEngine()
    const approvals = new DurableApprovalEngineAdapter(approvalAuthority)
    let toolCalls = 0
    const tool = {
      id: 'synthetic.approval.tool',
      version: 'v1',
      description: 'Synthetic approved side effect',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'HIGH' as const,
      sideEffect: 'WRITE' as const,
      idempotent: false,
      requiresApproval: true,
      execute: async () => {
        toolCalls += 1
        return { status: 'SUCCEEDED' as const, output: { synthetic: true } }
      }
    }
    const harnessOptions = {
      orchestrator: {
        decideNextStep: async () => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: {
            toolId: tool.id,
            input: { synthetic: true },
            operationKey: 'operation.approval.restart'
          }
        })
      },
      modelGateway: {
        complete: async () => ({
          text: 'unused',
          provider: 'deterministic-v1',
          model: 'fixture',
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0
        })
      },
      policy: {
        evaluate: async () => ({
          outcome: 'REQUIRE_APPROVAL' as const,
          reason: 'synthetic approval required',
          policyVersion: 'policy-approval-v1'
        })
      },
      approvals,
      tools: {
        list: () => [tool],
        resolve: () => tool
      },
      audit: { append: async () => undefined },
      telemetry: { record: () => undefined }
    }
    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: approvalAuthority
    })
    const accepted = await app.inject({
      method: 'POST',
      url: '/v1/executions',
      headers: { 'x-tenant-id': tenantA },
      payload: {
        idempotencyKey: 'approval-restart-1',
        runtime: runtime(tenantA)
      }
    })
    const executionId = accepted.json().data.execution.id as string

    const firstWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-before-approval',
      tenantId: tenantA,
      harnessOptions
    })
    const paused = await firstWorker.processNext()
    expect(paused.kind).toBe('processed')
    if (paused.kind !== 'processed') return
    expect(paused.record.state).toBe('WAITING_APPROVAL')
    expect(paused.record.approvalId).toBeTruthy()
    expect(toolCalls).toBe(0)

    const approvalId = paused.record.approvalId as string
    const crossTenant = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
      headers: {
        'x-tenant-id': tenantB,
        'x-operator-id': 'approver.synthetic',
        'x-operator-role': 'Approver',
        'idempotency-key': 'approval-command-cross-tenant'
      },
      payload: { decision: 'approved' }
    })
    expect(crossTenant.statusCode).toBe(404)

    const unauthorized = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
      headers: {
        'x-tenant-id': tenantA,
        'x-operator-id': 'operator.synthetic',
        'x-operator-role': 'Operator',
        'idempotency-key': 'approval-command-unauthorized'
      },
      payload: { decision: 'approved' }
    })
    expect(unauthorized.statusCode).toBe(403)

    const decision = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
      headers: {
        'x-tenant-id': tenantA,
        'x-operator-id': 'approver.synthetic',
        'x-operator-role': 'Approver',
        'idempotency-key': 'approval-command-1'
      },
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    expect(decision.statusCode).toBe(202)
    expect(decision.json().data.execution.state).toBe('QUEUED')

    const secondWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-after-restart',
      tenantId: tenantA,
      harnessOptions: {
        ...harnessOptions,
        approvals: new DurableApprovalEngineAdapter(approvalAuthority)
      }
    })
    const completed = await secondWorker.processNext()
    expect(completed.kind).toBe('processed')
    if (completed.kind !== 'processed') return
    expect(completed.record.state).toBe('SUCCEEDED')
    expect(toolCalls).toBe(1)
    expect((await approvalAuthority.get(tenantA, approvalId)).status).toBe(
      'EXECUTED'
    )

    const duplicate = await app.inject({
      method: 'POST',
      url: `/v1/executions/${executionId}/approvals/${approvalId}/decision`,
      headers: {
        'x-tenant-id': tenantA,
        'x-operator-id': 'approver.synthetic',
        'x-operator-role': 'Approver',
        'idempotency-key': 'approval-command-1'
      },
      payload: { decision: 'approved' }
    })
    await app.close()
    expect(duplicate.statusCode).toBe(202)
    expect(duplicate.json().data.execution.state).toBe('SUCCEEDED')
    expect(toolCalls).toBe(1)
  })

  it('recovers an approval left in REQUESTED before submit', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const approvalAuthority = new DurableApprovalEngine()
    const runtimeInput = runtime(tenantA)
    const accepted = await store.submit({
      tenantId: tenantA,
      idempotencyKey: 'approval-requested-recovery-1',
      runtime: runtimeInput
    })
    const claimed = await store.claimNext(tenantA, 'worker-requested-recovery')
    expect(claimed?.record.id).toBe(accepted.record.id)
    if (!claimed) return
    const running = await store.transition({
      tenantId: tenantA,
      executionId: accepted.record.id,
      to: 'RUNNING',
      workerId: 'worker-requested-recovery',
      fenceToken: claimed.record.attempt
    })
    const request: ApprovalRequestInput = {
      tenantId: tenantA,
      operatorId: runtimeInput.agent.id,
      agentId: runtimeInput.agent.id,
      agentVersion: runtimeInput.agent.version,
      action: 'tool.execute',
      resource: { type: 'tool', id: 'synthetic.requested.tool' },
      payload: { synthetic: true },
      policyVersion: 'policy-approval-v1',
      correlationId: runtimeInput.correlationId,
      operationKey: 'operation.requested.recovery',
      executionRef: accepted.record.id,
      singleUse: true,
      reason: 'synthetic requested recovery',
      proposalPayload: { synthetic: true }
    }
    const requested = await approvalAuthority.request(request)
    expect(requested.status).toBe('REQUESTED')
    await store.transition({
      tenantId: tenantA,
      executionId: accepted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-requested-recovery',
      fenceToken: running.attempt,
      approvalId: requested.approvalId,
      reason: 'approval requested before submit'
    })

    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: approvalAuthority
    })
    const decision = await app.inject({
      method: 'POST',
      url: `/v1/executions/${accepted.record.id}/approvals/${requested.approvalId}/decision`,
      headers: {
        'x-tenant-id': tenantA,
        'x-operator-id': 'approver.synthetic',
        'x-operator-role': 'Approver',
        'idempotency-key': 'approval-requested-recovery-command'
      },
      payload: { decision: 'approved' }
    })
    await app.close()

    expect(decision.statusCode).toBe(202)
    expect(decision.json().data.execution.state).toBe('QUEUED')
    expect(
      (await approvalAuthority.get(tenantA, requested.approvalId)).status
    ).toBe('APPROVED')
  })
})
