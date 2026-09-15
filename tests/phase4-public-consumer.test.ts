import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import * as harness from '@cvg/harness'
import type {
  ApprovalEngine,
  CapabilityRegistration,
  ModelGateway,
  PolicyEngine,
  RuntimeInput
} from '@cvg/harness-contracts'

const tenantId =
  'tenant_00000000-0000-4000-8000-000000000901' as RuntimeInput['tenantId']
const capabilityId = 'consumer.synthetic.capability'

function registration(): CapabilityRegistration {
  return {
    descriptor: {
      id: capabilityId,
      version: '1.0.0',
      description: 'Public consumer fixture',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'LOW',
      sideEffect: 'READ',
      idempotent: true,
      requiresApproval: false,
      origin: 'core',
      providerId: 'consumer-provider',
      providerVersion: '1.0.0'
    },
    implementation: {
      validateInput: (input) =>
        typeof input === 'object' && input !== null && !Array.isArray(input),
      execute: async () => ({
        status: 'SUCCEEDED',
        output: { source: 'public-consumer' }
      }),
      validateOutput: (output) =>
        typeof output === 'object' && output !== null && !Array.isArray(output)
    }
  }
}

function input(): RuntimeInput {
  return {
    agent: {
      id: 'agent.public-consumer' as RuntimeInput['agent']['id'],
      version: '1.0.0' as RuntimeInput['agent']['version'],
      objective: 'Use the public capability contract.',
      instructions: ['synthetic only'],
      skills: [],
      tools: [capabilityId],
      policies: []
    },
    tenantId,
    conversationId:
      'conversation_public_consumer' as RuntimeInput['conversationId'],
    sessionId: 'session_public_consumer' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_public_consumer' as RuntimeInput['correlationId'],
    traceId: 'trace_public_consumer' as RuntimeInput['traceId'],
    userMessage: 'public consumer fixture',
    context: {
      values: {},
      sourceIds: [],
      capturedAt: '2026-09-15T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-15T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 0,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    },
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId: capabilityId,
      toolVersion: '1.0.0',
      operationKey: 'public-consumer-operation',
      input: { value: 'synthetic' }
    }
  }
}

describe('AAA-41 public package conformance', () => {
  it('composes through the package entrypoint without exposing an adapter', async () => {
    const registry: import('@cvg/harness-contracts').CapabilityRegistry =
      harness.createCapabilityRegistry([registration()])
    const approvals: ApprovalEngine = {
      request: async () => ({
        status: 'APPROVED',
        approvalId: 'approval_public_consumer' as never,
        reason: 'not required by this fixture'
      })
    }
    const modelGateway: ModelGateway = {
      complete: async () => ({
        text: 'unused',
        provider: 'consumer-provider',
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
        policyVersion: 'consumer-policy-v1'
      })
    }
    const operational = harness.createOperationalHarness({
      capabilities: registry,
      effectJournal: new harness.InMemoryEffectJournal(),
      orchestrator: {
        decideNextStep: async ({ runtime }) => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: runtime.requestedTool!
        })
      },
      modelGateway,
      policy,
      approvals,
      audit: { append: async () => undefined },
      telemetry: { record: () => undefined }
    })

    const result = await operational.execute(input())

    expect(result.stopReason).toBe('COMPLETED')
    expect(result.toolResult?.output).toEqual({ source: 'public-consumer' })
    expect(registry.listDescriptors()[0]).not.toHaveProperty('execute')
    expect(harness).not.toHaveProperty('createCapabilityToolRegistry')
  })

  it('rejects a published deep import of the internal executable adapter', () => {
    const result = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        "try { await import('@cvg/harness/capability-boundary.js'); process.stdout.write('IMPORTED') } catch (error) { process.stdout.write(error?.code ?? 'UNKNOWN') }"
      ],
      { cwd: process.cwd(), encoding: 'utf8' }
    )

    expect(result.trim()).toBe('ERR_PACKAGE_PATH_NOT_EXPORTED')
  })
})
