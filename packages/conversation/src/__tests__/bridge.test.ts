import { describe, expect, it, vi } from 'vitest'
import {
  asConversationId,
  asCorrelationId,
  asExecutionId,
  asMessageId,
  asProfileId,
  asSessionId,
  asTenantId,
  asTurnId,
  contextSnapshotForMemory,
  createEmptyWorkingMemory,
  createOperationalHarnessBridge,
  type ActionProposal,
  type HarnessActionRequest,
  type TurnIdentity
} from '../index.ts'
import type { RuntimeInput } from '@cvg/harness-contracts'

const identity: TurnIdentity = {
  tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000777'),
  conversationId: asConversationId('conversation-bridge'),
  sessionId: asSessionId('session-bridge'),
  profileId: asProfileId('profile-bridge'),
  profileVersion: '1.0.0',
  turnId: asTurnId('turn-bridge'),
  messageId: asMessageId('message-bridge'),
  correlationId: asCorrelationId('correlation-bridge')
}

const proposal: ActionProposal = {
  proposalId: 'proposal-bridge',
  action: 'READ',
  capabilityId: 'synthetic.read',
  capabilityVersion: '1.0.0',
  payload: { date: 'friday' },
  resource: { type: 'synthetic' },
  proposalHash: 'proposal-hash-bridge',
  operationKey: 'operation-bridge',
  requiresApproval: false,
  entityVersions: {},
  createdTurnId: identity.turnId,
  status: 'DRAFT',
  createdAt: '2026-09-17T00:00:00.000Z'
}

function request(): HarnessActionRequest {
  return {
    identity,
    executionId: asExecutionId('execution-bridge'),
    context: contextSnapshotForMemory(
      createEmptyWorkingMemory(),
      '2026-09-17T00:00:00.000Z'
    ),
    proposal,
    budget: {
      maxSteps: 4,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 1_000,
      maxCostUsd: 0,
      maxTokens: 1_000
    }
  }
}

function runtimeInput(
  input: HarnessActionRequest,
  overrides: Partial<RuntimeInput> = {}
): RuntimeInput {
  return {
    agent: {
      id: asProfileId('agent-bridge') as unknown as RuntimeInput['agent']['id'],
      version: '1.0.0' as RuntimeInput['agent']['version'],
      objective: 'controlled bridge test',
      instructions: [],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: input.identity.tenantId,
    executionId: input.executionId,
    conversationId: input.identity.conversationId,
    sessionId: input.identity.sessionId,
    correlationId: input.identity.correlationId,
    traceId: 'trace-bridge' as RuntimeInput['traceId'],
    userMessage: 'synthetic',
    context: input.context,
    state: { version: 0, values: {}, updatedAt: '2026-09-17T00:00:00.000Z' },
    budget: input.budget,
    requestedTool: {
      toolId: input.proposal.capabilityId,
      toolVersion: input.proposal.capabilityVersion,
      operationKey: input.proposal.operationKey,
      input: input.proposal.payload
    },
    ...overrides
  }
}

describe('operational Harness bridge', () => {
  it('passes the bounded conversation context to the existing public Harness', async () => {
    const input = request()
    const execute = vi.fn().mockResolvedValue({
      response: 'ok',
      stopReason: 'COMPLETED',
      steps: 1,
      modelCalls: 0,
      toolCalls: 1,
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
      toolResult: { status: 'SUCCEEDED', output: [{ id: 'slot-1' }] }
    })
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: { execute },
      buildRuntimeInput: (value) => runtimeInput(value)
    })

    const result = await bridge.execute(input)

    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      executionId: input.executionId,
      proposalHash: proposal.proposalHash,
      operationKey: proposal.operationKey,
      effectConfirmed: true
    })
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        executionId: input.executionId,
        context: input.context
      })
    )
  })

  it('fails closed when the runtime input loses the durable execution binding', async () => {
    const input = request()
    const execute = vi.fn()
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: { execute },
      buildRuntimeInput: (value) => {
        const broken = { ...runtimeInput(value) } as {
          executionId?: RuntimeInput['executionId']
        }
        delete broken.executionId
        return {
          ...runtimeInput(value),
          executionId: broken.executionId
        } as unknown as RuntimeInput
      }
    })

    const result = await bridge.execute(input)

    expect(result.status).toBe('DENIED')
    expect(result.stopReason).toBe('BRIDGE_IDENTITY_OR_RESUME_MISMATCH')
    expect(execute).not.toHaveBeenCalled()
  })

  it('maps malformed runtime output to uncertainty before response composition', async () => {
    const input = request()
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: {
        execute: vi.fn().mockResolvedValue({ response: 42 } as never)
      },
      buildRuntimeInput: (value) => runtimeInput(value)
    })

    const result = await bridge.execute(input)

    expect(result).toMatchObject({
      status: 'UNCERTAIN',
      effectConfirmed: false
    })
  })

  it('does not expose adapter exception text through the bridge', async () => {
    const input = request()
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: {
        execute: vi
          .fn()
          .mockRejectedValue(new Error('provider secret=synthetic-secret'))
      },
      buildRuntimeInput: (value) => runtimeInput(value)
    })

    const result = await bridge.execute(input)

    expect(result).toMatchObject({
      status: 'UNCERTAIN',
      stopReason: 'BRIDGE_EXCEPTION',
      response: 'governed bridge execution failed'
    })
    expect(result.response).not.toContain('synthetic-secret')
  })

  it('denies a runtime input that swaps the requested capability payload', async () => {
    const input = request()
    const execute = vi.fn()
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: { execute },
      buildRuntimeInput: (value) =>
        runtimeInput(value, {
          requestedTool: {
            toolId: 'hidden.capability',
            toolVersion: '9.9.9',
            operationKey: 'attacker-operation',
            input: { secret: 'do-not-run' }
          }
        })
    })

    const result = await bridge.execute(input)

    expect(result.status).toBe('DENIED')
    expect(result.stopReason).toBe('BRIDGE_IDENTITY_OR_RESUME_MISMATCH')
    expect(execute).not.toHaveBeenCalled()
  })

  it('denies a runtime input that swaps the trusted runtime agent binding', async () => {
    const input = request()
    const execute = vi.fn()
    const bridge = createOperationalHarnessBridge({
      trustedAgent: { id: 'agent-bridge', version: '1.0.0' },
      harness: { execute },
      buildRuntimeInput: (value) =>
        runtimeInput(value, {
          agent: {
            ...runtimeInput(value).agent,
            id: 'agent-attacker' as RuntimeInput['agent']['id']
          }
        })
    })

    const result = await bridge.execute(input)

    expect(result.status).toBe('DENIED')
    expect(result.stopReason).toBe('BRIDGE_IDENTITY_OR_RESUME_MISMATCH')
    expect(execute).not.toHaveBeenCalled()
  })
})
