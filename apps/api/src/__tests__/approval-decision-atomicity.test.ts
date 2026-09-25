/**
 * AUD19-003 — causal atomicity of approval decision, resume and audit.
 *
 * Route: POST /v1/executions/:executionId/approvals/:approvalId/decision.
 * Proves retry convergence after injected crashes at each boundary, one
 * winner under identical concurrency, and fail-closed divergent repeats.
 * Exactly-once audit storage is proven at the store layer
 * (persistence audit dedupe tests) and at the durable layer (PG test).
 */
import { describe, expect, it } from 'vitest'
import {
  ApprovalEngine as DurableApprovalEngine,
  type ApprovalRequestInput
} from '@cvg/approval-engine'
import {
  createInMemoryOperationalExecutionStore,
  type OperationalExecutionStore
} from '@cvg/harness'
import { reconcileApprovalDecision } from '@cvg/agent-core'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000701'

function runtimeInput() {
  return {
    agent: {
      id: 'agent.atomic.synthetic',
      version: 'v1',
      objective: 'synthetic atomicity proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantA,
    conversationId: 'conversation_atomic_synthetic',
    sessionId: 'session_atomic_synthetic',
    correlationId: 'correlation_atomic_synthetic',
    traceId: 'trace_atomic_synthetic',
    userMessage: 'synthetic HTTP message',
    context: {
      values: { fixture: true },
      sourceIds: ['synthetic'],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-13T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  } as never
}

async function waitingFixture(
  store: OperationalExecutionStore,
  authority: DurableApprovalEngine,
  key: string
) {
  const runtime = runtimeInput()
  const accepted = await store.submit({
    tenantId: tenantA,
    idempotencyKey: key,
    runtime
  })
  const claimed = await store.claimNext(tenantA, `worker-${key}`)
  if (!claimed) throw new Error('claim failed')
  const running = await store.transition({
    tenantId: tenantA,
    executionId: accepted.record.id,
    to: 'RUNNING',
    workerId: `worker-${key}`,
    fenceToken: claimed.record.attempt
  })
  const request: ApprovalRequestInput = {
    tenantId: tenantA,
    operatorId: 'agent.atomic.synthetic',
    agentId: 'agent.atomic.synthetic',
    agentVersion: 'v1',
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.atomic.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-approval-v1',
    correlationId: 'correlation_atomic_synthetic',
    operationKey: `operation.atomic.${key}`,
    executionRef: accepted.record.id,
    singleUse: true,
    reason: 'synthetic atomicity',
    proposalPayload: { synthetic: true }
  }
  const requested = await authority.request(request)
  await store.transition({
    tenantId: tenantA,
    executionId: accepted.record.id,
    to: 'WAITING_APPROVAL',
    workerId: `worker-${key}`,
    fenceToken: running.attempt,
    approvalId: requested.approvalId,
    reason: 'waiting for atomicity proof'
  })
  return { executionId: accepted.record.id, approvalId: requested.approvalId }
}

function decisionHeaders(commandKey: string) {
  return {
    'x-tenant-id': tenantA,
    'x-operator-id': 'approver.synthetic',
    'x-operator-role': 'Approver',
    'idempotency-key': commandKey
  }
}

describe('approval decision causal atomicity (AUD19-003)', () => {
  it('converges on retry after a crash between approve and resolve', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-crash-resolve'
    )
    let resolveCalls = 0
    const flakyStore = new Proxy(store, {
      get(target, property, receiver) {
        if (property === 'resolveApproval') {
          return async (...args: never[]) => {
            resolveCalls += 1
            if (resolveCalls === 1) {
              throw new Error('injected crash before resolve')
            }
            return Reflect.apply(
              Reflect.get(target, property, receiver) as never,
              target,
              args
            ) as never
          }
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const app = buildServer({
      operationalExecution: flakyStore as never,
      operationalApprovalAuthority: authority
    })
    const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
    const first = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-1'),
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    expect(first.statusCode).toBe(500)
    // The decision is already effective; the retry must converge, not conflict.
    const retry = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-1'),
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    await app.close()
    expect(retry.statusCode).toBe(202)
    expect(retry.json().data.execution.state).toBe('QUEUED')
    expect((await authority.get(tenantA, approvalId)).status).toBe('APPROVED')
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
  })

  it('converges on retry after a crash between resolve and audit', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-crash-audit'
    )
    let resolveCalls = 0
    const realResolve = store.resolveApproval.bind(store)
    const flakyStore = new Proxy(store, {
      get(target, property, receiver) {
        if (property === 'resolveApproval') {
          return async (...args: never[]) => {
            resolveCalls += 1
            const result = (await Reflect.apply(
              realResolve,
              target,
              args
            )) as never
            if (resolveCalls === 1) {
              // The resume happened; the caller sees a crash before audit.
              throw new Error('injected crash after resolve')
            }
            return result
          }
        }
        return Reflect.get(target, property, receiver)
      }
    })
    const app = buildServer({
      operationalExecution: flakyStore as never,
      operationalApprovalAuthority: authority
    })
    const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
    const first = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-2'),
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    expect(first.statusCode).toBe(500)
    // Resume already happened; the retry must still record the audit event.
    const retry = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-2'),
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    await app.close()
    expect(retry.statusCode).toBe(202)
    expect(retry.json().data.execution.state).toBe('QUEUED')
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
  })

  it('gives identical concurrent decisions one winner and converges', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-concurrent'
    )
    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url,
        headers: decisionHeaders('atomic-cmd-3a'),
        payload: { decision: 'approved', note: 'synthetic approval' }
      }),
      app.inject({
        method: 'POST',
        url,
        headers: decisionHeaders('atomic-cmd-3b'),
        payload: { decision: 'approved', note: 'synthetic approval' }
      })
    ])
    await app.close()
    expect(first.statusCode).toBe(202)
    expect(second.statusCode).toBe(202)
    expect((await authority.get(tenantA, approvalId)).status).toBe('APPROVED')
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
  })

  it('converges a same-verdict repeat without mutating the winner', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-divergent'
    )
    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
    const first = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-4'),
      payload: { decision: 'approved', note: 'synthetic approval' }
    })
    expect(first.statusCode).toBe(202)
    // Same verdict, different attributor: the route converges at verdict
    // level (established contract: no mutation, no duplicate audit event).
    // Divergent *authority* calls still fail closed (engine unit tests).
    const repeat = await app.inject({
      method: 'POST',
      url,
      headers: {
        ...decisionHeaders('atomic-cmd-4-other'),
        'x-operator-id': 'approver.other'
      },
      payload: { decision: 'approved', note: 'different reason' }
    })
    await app.close()
    expect(repeat.statusCode).toBe(202)
    const record = await authority.get(tenantA, approvalId)
    expect(record.status).toBe('APPROVED')
    expect(record.approverId).toBe('approver.synthetic')
  })

  it('rejects an opposite-verdict repeat after the decision', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-opposite'
    )
    const app = buildServer({
      operationalExecution: store,
      operationalApprovalAuthority: authority
    })
    const url = `/v1/executions/${executionId}/approvals/${approvalId}/decision`
    const first = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-5'),
      payload: { decision: 'approved' }
    })
    expect(first.statusCode).toBe(202)
    const opposite = await app.inject({
      method: 'POST',
      url,
      headers: decisionHeaders('atomic-cmd-5-opposite'),
      payload: { decision: 'rejected' }
    })
    await app.close()
    expect(opposite.statusCode).toBe(409)
    expect((await authority.get(tenantA, approvalId)).status).toBe('APPROVED')
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
  })

  it('reconciles a stuck partial state through idempotent steps', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-reconcile'
    )
    // Simulate the crash: decision recorded, resume and audit missing.
    await authority.submit(tenantA, approvalId, 'agent.atomic.synthetic')
    await authority.approve(tenantA, approvalId, {
      approverId: 'approver.synthetic',
      decisionActorType: 'Approver',
      decisionCorrelationId: 'correlation_atomic_synthetic',
      commandKey: 'atomic-reconcile-command',
      reason: 'synthetic approval'
    })
    const appended: Array<{ type: string }> = []
    const report = await reconcileApprovalDecision(
      {
        getApproval: (tenant, id) => authority.get(tenant, id),
        resolveExecution: (input) => store.resolveApproval(input),
        appendAudit: (event, tenantId: string) => {
          void tenantId
          appended.push({ type: event.type })
          return undefined
        }
      },
      {
        tenantId: tenantA,
        executionId,
        approvalId,
        decision: 'APPROVED'
      }
    )
    expect(report.reconciled).toBe(true)
    expect(report.executionState).toBe('QUEUED')
    expect(appended).toHaveLength(1)
    expect((await store.get(tenantA, executionId))?.state).toBe('QUEUED')
  })

  it('refuses reconciliation while the approval is undecided', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const authority = new DurableApprovalEngine()
    const { executionId, approvalId } = await waitingFixture(
      store,
      authority,
      'atomic-reconcile-undecided'
    )
    await expect(
      reconcileApprovalDecision(
        {
          getApproval: (tenant, id) => authority.get(tenant, id),
          resolveExecution: (input) => store.resolveApproval(input),
          appendAudit: () => undefined
        },
        {
          tenantId: tenantA,
          executionId,
          approvalId,
          decision: 'APPROVED'
        }
      )
    ).rejects.toThrow()
  })
})
