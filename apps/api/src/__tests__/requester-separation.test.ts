/**
 * SPEC 0317 G1 on the memory fallback of the decision route: the same rule as
 * the atomic PostgreSQL unit, which this path cannot roll back, so the check
 * must come before its first mutation. Synthetic data only.
 */
import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import { ApprovalEngine } from '@cvg/approval-engine'
import { createInMemoryOperationalExecutionStore } from '@cvg/harness'
import { buildServer } from '../server.ts'
import {
  CONTROLLED_TEST_TENANT,
  grantCase
} from './case-authorization-fixtures.ts'

const tenantId = CONTROLLED_TEST_TENANT as string

function runtime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.g1.memory' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'SPEC 0317 G1 memory proof',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId: 'conversation_g1_memory' as RuntimeInput['conversationId'],
    sessionId: 'session_g1_memory' as RuntimeInput['sessionId'],
    correlationId: 'correlation_g1_memory' as RuntimeInput['correlationId'],
    traceId: 'trace_g1_memory' as RuntimeInput['traceId'],
    userMessage: 'SPEC 0317 G1 memory proof',
    context: {
      values: {},
      sourceIds: ['spec-0317-g1'],
      capturedAt: '2026-11-06T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-11-06T00:00:00.000Z' },
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

function headers(operatorId: string, role = 'Approver') {
  return {
    'x-tenant-id': tenantId,
    'x-operator-id': operatorId,
    'x-operator-role': role
  }
}

async function fixture(options: {
  readonly submitter?: string
  readonly status?: 'REQUESTED' | 'PENDING'
  readonly requestedBy?: boolean
}) {
  const store = createInMemoryOperationalExecutionStore()
  const authority = new ApprovalEngine()
  const app = buildServer({
    operationalExecution: store,
    operationalApprovalAuthority: authority,
    requireAuthenticatedMutations: true
  })
  const accepted = await app.inject({
    method: 'POST',
    url: '/v1/executions',
    headers: options.submitter
      ? headers(options.submitter)
      : { 'x-tenant-id': tenantId },
    payload: { idempotencyKey: 'g1-memory-key', runtime: runtime() }
  })
  if (accepted.statusCode !== 202) {
    return { accepted, app, store, authority }
  }
  const executionId = accepted.json().data.execution.id as string
  const claimed = await store.claimNext(tenantId, 'worker-g1-memory')
  if (!claimed) throw new Error('claim failed')
  const running = await store.transition({
    tenantId,
    executionId,
    to: 'RUNNING',
    workerId: 'worker-g1-memory',
    fenceToken: claimed.record.attempt
  })
  const submittedBy = running.submittedBy
  const requested = authority.request({
    tenantId,
    operatorId: 'agent.g1.memory',
    agentId: 'agent.g1.memory',
    agentVersion: 'v1',
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.g1.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-g1-v1',
    correlationId: 'correlation_g1_memory',
    operationKey: 'operation.g1.memory',
    executionRef: executionId,
    ...(options.requestedBy !== false && submittedBy.kind !== 'unknown'
      ? { requestedBy: submittedBy }
      : {})
  })
  if (options.status !== 'REQUESTED') {
    authority.submit(tenantId, requested.approvalId, 'agent.g1.memory')
  }
  await store.transition({
    tenantId,
    executionId,
    to: 'WAITING_APPROVAL',
    workerId: 'worker-g1-memory',
    fenceToken: running.attempt,
    approvalId: requested.approvalId
  })
  return {
    accepted,
    app,
    store,
    authority,
    executionId,
    approvalId: requested.approvalId
  }
}

type Ready = Awaited<ReturnType<typeof fixture>> & {
  executionId: string
  approvalId: string
}

function decide(
  ready: Ready,
  operatorId: string,
  decision: 'approved' | 'rejected' = 'approved',
  role = 'Approver'
) {
  return ready.app.inject({
    method: 'POST',
    url: `/v1/executions/${ready.executionId}/approvals/${ready.approvalId}/decision`,
    headers: {
      ...headers(operatorId, role),
      'idempotency-key': `g1-memory-command-${operatorId}`
    },
    payload: { decision }
  })
}

async function snapshot(ready: Ready) {
  return {
    approval: ready.authority.get(tenantId, ready.approvalId),
    execution: await ready.store.get(tenantId, ready.executionId),
    events: await ready.store.listEvents(tenantId, ready.executionId)
  }
}

describe('SPEC 0317 G1 — requester separation (memory fallback)', () => {
  it('records the authenticated author and denies A with no change, then B approves', async () => {
    const ready = (await fixture({ submitter: 'human.a' })) as Ready
    try {
      expect(await ready.store.get(tenantId, ready.executionId)).toMatchObject({
        submittedBy: { kind: 'human', id: 'human.a', tenantId }
      })
      await grantCase(ready.app, {
        kind: 'independent_execution',
        resourceId: ready.executionId,
        operatorId: 'human.a',
        role: 'Approver'
      })
      await grantCase(ready.app, {
        kind: 'independent_execution',
        resourceId: ready.executionId,
        operatorId: 'human.b',
        role: 'Approver'
      })
      const before = await snapshot(ready)
      const denied = await decide(ready, 'human.a')
      expect(denied.statusCode).toBe(403)
      expect(denied.json().error.code).toBe('forbidden')
      expect(await snapshot(ready)).toEqual(before)

      const allowed = await decide(ready, 'human.b')
      expect(allowed.statusCode).toBe(202)
      const after = await snapshot(ready)
      expect(after.approval.status).toBe('APPROVED')
      expect(after.approval.approverId).toBe('human.b')
      expect(after.execution?.state).toBe('QUEUED')
    } finally {
      await ready.app.close()
    }
  })

  it('checks before the REQUESTED to PENDING step, which has no rollback here', async () => {
    const ready = (await fixture({
      submitter: 'human.a',
      status: 'REQUESTED'
    })) as Ready
    try {
      await grantCase(ready.app, {
        kind: 'independent_execution',
        resourceId: ready.executionId,
        operatorId: 'human.a',
        role: 'Approver'
      })
      const before = await snapshot(ready)
      expect(before.approval.status).toBe('REQUESTED')
      expect((await decide(ready, 'human.a')).statusCode).toBe(403)
      expect(await snapshot(ready)).toEqual(before)
    } finally {
      await ready.app.close()
    }
  })

  it('denies a Supervisor requester and leaves rejection to the same person', async () => {
    const ready = (await fixture({ submitter: 'human.a' })) as Ready
    try {
      const before = await snapshot(ready)
      const denied = await decide(ready, 'human.a', 'approved', 'Supervisor')
      expect(denied.statusCode).toBe(403)
      expect(await snapshot(ready)).toEqual(before)
      const rejected = await decide(ready, 'human.a', 'rejected', 'Supervisor')
      expect(rejected.statusCode).toBe(200)
      expect((await snapshot(ready)).approval.status).toBe('REJECTED')
    } finally {
      await ready.app.close()
    }
  })

  it('an approval without the requester of its execution cannot be approved', async () => {
    const ready = (await fixture({
      submitter: 'human.a',
      requestedBy: false
    })) as Ready
    try {
      const before = await snapshot(ready)
      const denied = await decide(ready, 'human.b', 'approved', 'Supervisor')
      expect(denied.statusCode).toBe(409)
      expect(denied.json().error.message).toContain('no trusted requester')
      expect(await snapshot(ready)).toEqual(before)
      const rejected = await decide(ready, 'human.b', 'rejected', 'Supervisor')
      expect(rejected.statusCode).toBe(200)
    } finally {
      await ready.app.close()
    }
  })

  it('a forged submittedBy never reaches the store', async () => {
    const store = createInMemoryOperationalExecutionStore()
    const app = buildServer({
      operationalExecution: store,
      requireAuthenticatedMutations: true
    })
    try {
      const forged = { kind: 'human', id: 'human.forged', tenantId }
      for (const payload of [
        {
          idempotencyKey: 'g1-forge-1',
          submittedBy: forged,
          runtime: runtime()
        },
        {
          idempotencyKey: 'g1-forge-2',
          runtime: { ...runtime(), submittedBy: forged }
        }
      ]) {
        const response = await app.inject({
          method: 'POST',
          url: '/v1/executions',
          headers: headers('human.a'),
          payload
        })
        expect(response.statusCode).toBe(400)
      }
      expect(await store.claimNext(tenantId, 'worker-g1-forge')).toBeNull()
    } finally {
      await app.close()
    }
  })

  it('an idempotency replay by another principal conflicts without revealing the record', async () => {
    const ready = (await fixture({ submitter: 'human.a' })) as Ready
    try {
      const other = await ready.app.inject({
        method: 'POST',
        url: '/v1/executions',
        headers: headers('human.b'),
        payload: { idempotencyKey: 'g1-memory-key', runtime: runtime() }
      })
      expect(other.statusCode).toBe(409)
      expect(JSON.stringify(other.json())).not.toContain(ready.executionId)
      expect(JSON.stringify(other.json())).not.toContain('human.a')
      expect(
        (await ready.store.get(tenantId, ready.executionId))?.submittedBy
      ).toEqual({ kind: 'human', id: 'human.a', tenantId })
    } finally {
      await ready.app.close()
    }
  })
})
