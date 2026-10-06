import { afterEach, describe, expect, it } from 'vitest'
import {
  createInMemoryExecutionStepStore,
  createInMemoryOperationalExecutionStore
} from '@cvg/harness'
import type { ExecutionStep, RuntimeInput } from '@cvg/harness-contracts'
import { buildServer } from '../server.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000741'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000742'
const now = new Date('2026-09-28T12:00:00.000Z')

function runtime(tenantId: string): RuntimeInput {
  return {
    agent: {
      id: 'agent.route-coverage.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic route coverage',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId:
      'conversation_route_coverage' as RuntimeInput['conversationId'],
    sessionId: 'session_route_coverage' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_route_coverage' as RuntimeInput['correlationId'],
    traceId: 'trace_route_coverage' as RuntimeInput['traceId'],
    userMessage: 'synthetic route test message',
    context: {
      values: { fixture: true },
      sourceIds: ['synthetic'],
      capturedAt: now.toISOString()
    },
    state: { version: 1, values: {}, updatedAt: now.toISOString() },
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

async function waitingForUserExecution(
  store: ReturnType<typeof createInMemoryOperationalExecutionStore>,
  tenantId: string
) {
  const submitted = await store.submit({
    tenantId,
    idempotencyKey: `route-input-${tenantId}`,
    runtime: runtime(tenantId)
  })
  const workerId = 'synthetic-route-worker'
  const claim = await store.claimNext(tenantId, workerId, now)
  if (!claim) throw new Error('Synthetic execution was not claimable')
  await store.transition(
    {
      tenantId,
      executionId: submitted.record.id,
      to: 'RUNNING',
      workerId,
      fenceToken: claim.record.attempt
    },
    now
  )
  await store.transition(
    {
      tenantId,
      executionId: submitted.record.id,
      to: 'WAITING_USER',
      workerId,
      fenceToken: claim.record.attempt,
      result: {
        response: 'synthetic input required',
        stopReason: 'NEEDS_USER_INPUT',
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    },
    now
  )
  return submitted.record
}

function operatorHeaders(tenantId: string) {
  return {
    'x-tenant-id': tenantId,
    'x-operator-id': 'operator.route-coverage.synthetic',
    'x-operator-role': 'Supervisor'
  }
}

describe('execution input and trajectory HTTP routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildServer>>> = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('resumes a waiting execution for its tenant and hides it from another tenant', async () => {
    const store = createInMemoryOperationalExecutionStore({
      clock: () => now
    })
    const execution = await waitingForUserExecution(store, tenantA)
    const app = buildServer({
      identityMode: 'simulation',
      operationalExecution: store
    })
    apps.push(app)

    const resumed = await app.inject({
      method: 'POST',
      url: `/v1/executions/${execution.id}/input`,
      headers: operatorHeaders(tenantA),
      payload: { message: 'synthetic answer' }
    })
    expect(resumed.statusCode).toBe(202)
    expect(resumed.json()).toMatchObject({
      success: true,
      data: {
        processing: 'queued',
        resume: 'user_input',
        execution: {
          id: execution.id,
          tenantId: tenantA,
          state: 'QUEUED',
          resume: { kind: 'user_input', input: 'synthetic answer' }
        }
      }
    })
    expect(await store.get(tenantA, execution.id)).toMatchObject({
      state: 'QUEUED',
      resume: { kind: 'user_input', input: 'synthetic answer' }
    })

    const crossTenant = await app.inject({
      method: 'POST',
      url: `/v1/executions/${execution.id}/input`,
      headers: operatorHeaders(tenantB),
      payload: { message: 'cross-tenant synthetic answer' }
    })
    expect(crossTenant.statusCode).toBe(404)
    expect(await store.get(tenantA, execution.id)).toMatchObject({
      resume: { kind: 'user_input', input: 'synthetic answer' }
    })
  })

  it('exports only structured trajectory metadata and enforces tenant scope', async () => {
    const store = createInMemoryOperationalExecutionStore({
      clock: () => now
    })
    const submitted = await store.submit({
      tenantId: tenantA,
      idempotencyKey: 'route-trajectory-synthetic',
      runtime: runtime(tenantA)
    })
    const stepStore = createInMemoryExecutionStepStore()
    const step: ExecutionStep = {
      stepId: 'step_route_coverage_synthetic',
      executionId: submitted.record.id,
      tenantId: tenantA,
      stepNumber: 1,
      stepType: 'RESPOND',
      status: 'SUCCEEDED',
      attempt: 1,
      sideEffecting: false,
      startedAt: now.toISOString(),
      completedAt: now.toISOString(),
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      observationRefs: ['private-observation-reference']
    }
    await stepStore.recordStep(step)
    const app = buildServer({
      identityMode: 'simulation',
      operationalExecution: store,
      executionSteps: stepStore
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: `/v1/executions/${submitted.record.id}/trajectory`,
      headers: operatorHeaders(tenantA)
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      success: true,
      data: {
        trajectory: {
          executionId: submitted.record.id,
          steps: [
            {
              stepNumber: 1,
              stepType: 'RESPOND',
              status: 'SUCCEEDED',
              decisionType: 'RESPOND',
              reasonCode: 'GOAL_SATISFIED'
            }
          ]
        }
      }
    })
    const returnedStep = response.json().data.trajectory.steps[0]
    expect(returnedStep).toEqual({
      stepNumber: 1,
      stepType: 'RESPOND',
      status: 'SUCCEEDED',
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED'
    })
    expect(returnedStep).not.toHaveProperty('observationRefs')
    expect(response.body).not.toContain('private-observation-reference')

    const crossTenant = await app.inject({
      method: 'GET',
      url: `/v1/executions/${submitted.record.id}/trajectory`,
      headers: operatorHeaders(tenantB)
    })
    expect(crossTenant.statusCode).toBe(404)
  })
})
