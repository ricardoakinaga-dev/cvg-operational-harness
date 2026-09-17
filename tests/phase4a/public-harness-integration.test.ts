import { describe, expect, it } from 'vitest'
import * as harness from '@cvg/harness'
import type {
  ApprovalEngine,
  CapabilityRegistration,
  ModelGateway,
  PolicyEngine,
  RuntimeInput
} from '@cvg/harness-contracts'
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
  type HarnessActionRequest
} from '../../packages/conversation/src/index.ts'

const capabilityId = 'phase4a.synthetic.public-read'
const tenantId = asTenantId('tenant_00000000-0000-4000-8000-000000000919')
const proposal: ActionProposal = {
  proposalId: 'proposal-public-harness',
  action: 'READ',
  capabilityId,
  capabilityVersion: '1.0.0',
  payload: { date: 'friday' },
  resource: { type: 'synthetic' },
  proposalHash: 'public-harness-proposal-hash',
  operationKey: 'public-harness-operation-key',
  requiresApproval: false,
  entityVersions: {},
  createdTurnId: asTurnId('turn-public-harness'),
  status: 'DRAFT',
  createdAt: '2026-09-17T00:00:00.000Z'
}

const request: HarnessActionRequest = {
  identity: {
    tenantId,
    conversationId: asConversationId('conversation-public-harness'),
    sessionId: asSessionId('session-public-harness'),
    profileId: asProfileId('synthetic-service-desk'),
    profileVersion: '1.0.0',
    turnId: proposal.createdTurnId,
    messageId: asMessageId('message-public-harness'),
    correlationId: asCorrelationId('correlation-public-harness')
  },
  executionId: asExecutionId('execution-public-harness'),
  context: contextSnapshotForMemory(
    createEmptyWorkingMemory(),
    '2026-09-17T00:00:00.000Z'
  ),
  proposal,
  budget: {
    maxSteps: 2,
    maxModelCalls: 0,
    maxToolCalls: 1,
    maxDurationMs: 10_000,
    maxCostUsd: 0,
    maxTokens: 500
  }
}

function runtimeInput(
  input: HarnessActionRequest,
  fingerprint: string
): RuntimeInput {
  return {
    agent: {
      id: 'agent_phase4a_public' as RuntimeInput['agent']['id'],
      version: '1.0.0' as RuntimeInput['agent']['version'],
      objective: 'Run one synthetic governed read.',
      instructions: ['synthetic only'],
      skills: [],
      tools: [capabilityId],
      policies: []
    },
    tenantId: input.identity.tenantId,
    executionId: input.executionId,
    capabilityFingerprint: fingerprint,
    conversationId: input.identity.conversationId,
    sessionId: input.identity.sessionId,
    correlationId: input.identity.correlationId,
    traceId: 'trace_phase4a_public' as RuntimeInput['traceId'],
    userMessage: 'synthetic governed read',
    context: input.context,
    state: { version: 0, values: {}, updatedAt: '2026-09-17T00:00:00.000Z' },
    budget: input.budget,
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId: input.proposal.capabilityId,
      toolVersion: input.proposal.capabilityVersion,
      operationKey: input.proposal.operationKey,
      input: input.proposal.payload
    }
  }
}

describe('Phase 4A public Harness integration', () => {
  it('routes an action through the existing policy, capability and effect journal authorities', async () => {
    let executions = 0
    const registration: CapabilityRegistration = {
      descriptor: {
        id: capabilityId,
        version: '1.0.0',
        description: 'Synthetic availability read',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'array' },
        risk: 'LOW',
        sideEffect: 'READ',
        idempotent: true,
        requiresApproval: false,
        origin: 'core',
        providerId: 'phase4a-synthetic',
        providerVersion: '1.0.0'
      },
      implementation: {
        validateInput: (value) => typeof value === 'object' && value !== null,
        execute: async () => {
          executions += 1
          return { status: 'SUCCEEDED', output: [{ id: 'slot-public-1' }] }
        },
        validateOutput: (value) => Array.isArray(value)
      }
    }
    const registry = harness.createCapabilityRegistry([registration])
    const journal = new harness.InMemoryEffectJournal()
    const policy: PolicyEngine = {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic allow',
        policyVersion: 'phase4a-policy-v1'
      })
    }
    const approvals: ApprovalEngine = {
      request: async () => ({
        status: 'DENIED',
        reason: 'approval is not expected for this read'
      })
    }
    const modelGateway: ModelGateway = {
      complete: async () => ({
        text: '',
        provider: 'phase4a-synthetic',
        model: 'local',
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0
      })
    }
    const operational = harness.createOperationalHarness({
      capabilities: registry,
      effectJournal: journal,
      policy,
      approvals,
      modelGateway,
      audit: { append: async () => undefined },
      telemetry: { record: () => undefined },
      orchestrator: {
        decideNextStep: async ({ runtime }) => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: runtime.requestedTool!
        })
      }
    })
    const bridge = createOperationalHarnessBridge({
      trustedAgent: {
        id: 'agent_phase4a_public',
        version: '1.0.0'
      },
      harness: operational,
      buildRuntimeInput: (value) =>
        runtimeInput(value, operational.capabilityFingerprint ?? '')
    })

    const result = await bridge.execute(request)
    const journalRecord = await journal.get(
      String(tenantId),
      proposal.operationKey
    )

    expect(result).toMatchObject({ status: 'SUCCEEDED', effectConfirmed: true })
    expect(executions).toBe(1)
    expect(journalRecord?.state).toBe('CONFIRMED')
  })
})
