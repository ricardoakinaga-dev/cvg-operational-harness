import { describe, expect, it } from 'vitest'
import {
  createBasicAgentFixture,
  createBasicAgentInput
} from '../examples/basic-agent/index.ts'
import type { ApprovalDecision, PolicyDecision } from '@cvg/harness-contracts'

describe('basic agent harness proof', () => {
  it('uses the model gateway for a governed Hello response', async () => {
    const fixture = createBasicAgentFixture()

    const result = await fixture.harness.run(createBasicAgentInput('hello'))

    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toBe('Hello from the CVG Operational Harness.')
    expect(fixture.modelCalls.count).toBe(1)
    expect(fixture.toolCalls.count).toBe(0)
    expect(fixture.auditEvents).toHaveLength(1)
    expect(fixture.telemetryEvents).toHaveLength(1)
    expect(fixture.telemetryEvents[0]?.provider).toBe('basic-agent-mock')
  })

  it('routes an explicit echo request through policy and the generic tool registry', async () => {
    const fixture = createBasicAgentFixture()

    const result = await fixture.harness.run(
      createBasicAgentInput('echo this', {
        toolId: 'echo',
        toolVersion: '0.1.0',
        input: { value: 'this' },
        operationKey: 'basic-test-echo-1'
      })
    )

    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toContain('"echo"')
    expect(fixture.modelCalls.count).toBe(0)
    expect(fixture.toolCalls.count).toBe(1)
    expect(fixture.auditEvents[0]?.policy).toBe('ALLOW')
    expect(fixture.auditEvents[0]?.tool).toBe('echo')
  })

  it('exposes tool descriptors, never executable tools, to a custom orchestrator', async () => {
    let exposedToolExecute: unknown
    const fixture = createBasicAgentFixture({
      orchestrator: {
        async decideNextStep(input) {
          exposedToolExecute = input.availableTools[0]
            ? Reflect.get(input.availableTools[0], 'execute')
            : undefined
          return { action: 'RESPOND', response: 'safe orchestrator response' }
        }
      }
    })

    const result = await fixture.harness.run(createBasicAgentInput('hello'))

    expect(result.response).toBe('safe orchestrator response')
    expect(exposedToolExecute).toBeUndefined()
    expect(fixture.toolCalls.count).toBe(0)
  })

  it('stops before execution when policy denies the requested tool', async () => {
    const fixture = createBasicAgentFixture({ policyOutcome: 'DENY' })

    const result = await fixture.harness.run(
      createBasicAgentInput('do not execute', {
        toolId: 'echo',
        input: { value: 'blocked' },
        operationKey: 'basic-test-denied-1'
      })
    )

    expect(result.stopReason).toBe('POLICY_DENIED')
    expect(fixture.toolCalls.count).toBe(0)
    expect(fixture.approvalCalls.count).toBe(0)
    expect(fixture.auditEvents[0]?.policy).toBe('DENY')
  })

  it('requests approval before a pending governed tool execution', async () => {
    const fixture = createBasicAgentFixture({
      policyOutcome: 'REQUIRE_APPROVAL',
      approvalStatus: 'PENDING'
    })

    const result = await fixture.harness.run(
      createBasicAgentInput('approval required', {
        toolId: 'echo',
        input: { value: 'pending' },
        operationKey: 'basic-test-approval-1'
      })
    )

    expect(result.stopReason).toBe('APPROVAL_REQUIRED')
    expect(fixture.toolCalls.count).toBe(0)
    expect(fixture.approvalCalls.count).toBe(1)
    expect(fixture.auditEvents[0]?.approval).toBeNull()
  })

  it('executes only after an approval decision is granted', async () => {
    const fixture = createBasicAgentFixture({
      policyOutcome: 'REQUIRE_APPROVAL',
      approvalStatus: 'APPROVED'
    })

    const result = await fixture.harness.run(
      createBasicAgentInput('approved echo', {
        toolId: 'echo',
        input: { value: 'approved' },
        operationKey: 'basic-test-approved-1'
      })
    )

    expect(result.stopReason).toBe('COMPLETED')
    expect(fixture.approvalCalls.count).toBe(1)
    expect(fixture.toolCalls.count).toBe(1)
    expect(fixture.auditEvents[0]?.approval).toBe('demo-approval')
  })

  it('fails closed when audit evidence cannot be recorded', async () => {
    const fixture = createBasicAgentFixture({ auditFailure: true })

    const result = await fixture.harness.run(createBasicAgentInput('hello'))

    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('audit recording failed')
    expect(fixture.telemetryEvents).toHaveLength(1)
  })

  it('fails closed on unsupported policy and approval outcomes', async () => {
    const policyFixture = createBasicAgentFixture({
      policyOverride: {
        async evaluate() {
          return {
            outcome: 'UNKNOWN',
            reason: 'malformed policy fixture',
            policyVersion: 'invalid'
          } as unknown as PolicyDecision
        }
      }
    })
    const policyResult = await policyFixture.harness.run(
      createBasicAgentInput('malformed policy', {
        toolId: 'echo',
        input: {},
        operationKey: 'basic-test-malformed-policy'
      })
    )

    const approvalFixture = createBasicAgentFixture({
      policyOutcome: 'REQUIRE_APPROVAL',
      approvalOverride: {
        async request() {
          return {
            status: 'UNKNOWN',
            reason: 'malformed approval fixture'
          } as unknown as ApprovalDecision
        }
      }
    })
    const approvalResult = await approvalFixture.harness.run(
      createBasicAgentInput('malformed approval', {
        toolId: 'echo',
        input: {},
        operationKey: 'basic-test-malformed-approval'
      })
    )

    expect(policyResult.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(policyFixture.toolCalls.count).toBe(0)
    expect(approvalResult.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(approvalFixture.toolCalls.count).toBe(0)
  })
})
