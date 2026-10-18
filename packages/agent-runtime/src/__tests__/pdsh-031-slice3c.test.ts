import { describe, expect, it, vi } from 'vitest'
import {
  GOVERNED_KERNEL_COORDINATOR,
  LANGGRAPH_FRONTIER_COORDINATOR,
  RuntimeCompositionError,
  WORKFLOW_COORDINATOR_ENV,
  createGovernedRuntimeComposition,
  resolveWorkflowCoordinator,
  toGovernedTurnInput,
  type GovernedRuntimeCompositionInput,
  type WorkflowCoordinatorPort
} from '../composition.ts'
import { GovernedAgentRuntime } from '../runtime.ts'

const frontier: WorkflowCoordinatorPort = {
  planStep: async () => ({
    planId: 'plan_pdsh031',
    tenantId: 'tenant_pdsh031',
    conversationId: 'conv_pdsh031',
    correlationId: 'corr_pdsh031',
    steps: []
  })
}

const validPorts = {
  policy: { evaluate: () => undefined },
  approvals: {
    request: () => undefined,
    reserve: () => undefined,
    confirm: () => undefined,
    get: () => undefined,
    list: () => undefined
  },
  modelGateway: { generate: () => undefined },
  telemetry: { startSpan: () => undefined, recordMetric: () => undefined },
  audit: { append: () => undefined, verify: () => undefined },
  toolExecutor: async () => ({ result: {} }),
  outbox: async () => ({ eventId: 'event_pdsh031' })
} as unknown as GovernedRuntimeCompositionInput

describe('PDSH-031 slice 3c — coordinator resolution', () => {
  it('defaults to the governed kernel and rejects unknown values', () => {
    expect(resolveWorkflowCoordinator({})).toEqual({
      kind: 'governed-kernel',
      coordinator: null
    })
    expect(
      resolveWorkflowCoordinator({
        [WORKFLOW_COORDINATOR_ENV]: `  ${GOVERNED_KERNEL_COORDINATOR}  `
      })
    ).toEqual({ kind: 'governed-kernel', coordinator: null })

    expect(() =>
      resolveWorkflowCoordinator({ [WORKFLOW_COORDINATOR_ENV]: 'mystery' })
    ).toThrowError(
      expect.objectContaining({
        code: 'unknown_coordinator'
      }) as never
    )
  })

  it('requires an injected frontier adapter', () => {
    expect(
      resolveWorkflowCoordinator(
        { [WORKFLOW_COORDINATOR_ENV]: LANGGRAPH_FRONTIER_COORDINATOR },
        { [LANGGRAPH_FRONTIER_COORDINATOR]: frontier }
      )
    ).toEqual({ kind: 'langgraph-frontier', coordinator: frontier })

    expect(() =>
      resolveWorkflowCoordinator({
        [WORKFLOW_COORDINATOR_ENV]: LANGGRAPH_FRONTIER_COORDINATOR
      })
    ).toThrow(RuntimeCompositionError)

    expect(() =>
      resolveWorkflowCoordinator(
        { [WORKFLOW_COORDINATOR_ENV]: LANGGRAPH_FRONTIER_COORDINATOR },
        {
          [LANGGRAPH_FRONTIER_COORDINATOR]: {
            planStep: 'not-a-function'
          } as never
        }
      )
    ).toThrowError(
      expect.objectContaining({ code: 'frontier_not_configured' }) as never
    )
  })
})

describe('PDSH-031 slice 3c — turn mapping and composition gate', () => {
  const plan = {
    planId: 'plan_pdsh031',
    tenantId: 'tenant_pdsh031',
    conversationId: 'conv_pdsh031',
    correlationId: 'corr_pdsh031',
    steps: []
  }
  const envelope = {
    operatorId: 'operator_pdsh031',
    operatorRole: 'OPERATOR' as never,
    agentId: 'agent_pdsh031',
    agentVersion: 'v1',
    agentProfile: 'synthetic-profile' as never,
    prompt: { promptId: 'prompt_pdsh031', version: '1.0.0' },
    modelProfile: 'fast' as never
  }

  it('maps full and minimal workflow steps into governed turns', () => {
    const full = toGovernedTurnInput(
      { ...plan, sessionId: 'session_pdsh031' } as never,
      {
        stepId: 'step_pdsh031',
        capability: 'record.cancel',
        action: 'record.cancel',
        resource: { type: 'record' },
        dataClassification: 'INTERNAL',
        idempotencyKey: 'idem_pdsh031',
        modelMessages: { messages: [{ role: 'user', content: 'plan' }] },
        structuredOutput: { type: 'object' }
      } as never,
      { ...envelope, limits: { maxSteps: 3 } } as never
    )
    expect(full).toMatchObject({
      sessionId: 'session_pdsh031',
      idempotencyKey: 'idem_pdsh031',
      structuredOutput: { type: 'object' },
      limits: { maxSteps: 3 }
    })

    const minimal = toGovernedTurnInput(
      plan as never,
      {
        stepId: 'step_pdsh031',
        capability: 'record.cancel',
        action: 'record.cancel',
        resource: { type: 'record' },
        dataClassification: 'INTERNAL'
      } as never,
      envelope as never
    )
    expect(minimal).not.toHaveProperty('sessionId')
    expect(minimal).not.toHaveProperty('idempotencyKey')
    expect(minimal).not.toHaveProperty('structuredOutput')
    expect(minimal).not.toHaveProperty('limits')
    expect(minimal.modelMessages).toEqual({
      messages: [{ role: 'user', content: 'record.cancel' }]
    })
  })

  it('builds the runtime with and without optional wiring', () => {
    const minimal = createGovernedRuntimeComposition(validPorts)
    expect(minimal.runtime).toBeInstanceOf(GovernedAgentRuntime)
    expect(minimal.requireDurable).toBe(false)

    const clock = vi.fn(() => new Date('2026-10-12T00:00:00.000Z'))
    const pause = { isPaused: async () => false }
    const full = createGovernedRuntimeComposition({
      ...validPorts,
      clock,
      effectScopes: { 'record.cancel': 'controlled_fake' },
      realEffectAuthorizations: ['record.cancel'],
      reservationTtlMs: 500,
      effectJournal: { get: async () => undefined },
      pause,
      requireDurable: true,
      durableApprovals: true
    } as never)
    expect(full.runtime).toBeInstanceOf(GovernedAgentRuntime)
    expect(full.requireDurable).toBe(true)
  })

  it('fails closed on missing ports and unmet durability', () => {
    expect(() =>
      createGovernedRuntimeComposition({
        ...validPorts,
        policy: undefined
      } as never)
    ).toThrow(/missing required ports: policy/)

    expect(() =>
      createGovernedRuntimeComposition({
        ...validPorts,
        policy: { evaluate: 'not-a-function' }
      } as never)
    ).toThrow(/missing required ports: policy/)

    expect(() =>
      createGovernedRuntimeComposition({
        ...validPorts,
        toolExecutor: undefined,
        outbox: undefined
      } as never)
    ).toThrow(/missing required ports: toolExecutor, outbox/)

    expect(() =>
      createGovernedRuntimeComposition({
        ...validPorts,
        requireDurable: true
      } as never)
    ).toThrow(
      /Durable governed runtime composition requires: durable effectJournal, durable approvals/
    )

    expect(() =>
      createGovernedRuntimeComposition({
        ...validPorts,
        requireDurable: true,
        effectJournal: { get: async () => undefined },
        durableApprovals: false
      } as never)
    ).toThrow(/durable approvals/)
  })
})
