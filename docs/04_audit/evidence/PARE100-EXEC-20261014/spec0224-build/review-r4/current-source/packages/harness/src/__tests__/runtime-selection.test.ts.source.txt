import { describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import {
  InMemoryExecutionStepStore,
  createOperationalHarness
} from '../index.ts'
import { readExecutionTrajectory } from '../trajectory.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  decision,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

function withoutProfile(input: RuntimeInput): RuntimeInput {
  const { runtimeProfile: _runtimeProfile, ...rest } = input
  void _runtimeProfile
  return rest as RuntimeInput
}

function ports() {
  return {
    modelGateway: new ScriptedModelGateway({ responses: ['ok'] }),
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink()
  }
}

describe('P3-COMPAT — runtime profile selection through the public factory', () => {
  it('P3-COMPAT-001 runs single-pass and iterative through the same factory', async () => {
    const stepStore = new InMemoryExecutionStepStore()
    const harness = createOperationalHarness({
      ...ports(),
      iterativeOrchestrator: new ScriptedOrchestrator({
        script: [
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText: 'iterative answer'
          })
        ]
      }),
      stepStore
    })

    const iterativeInput: RuntimeInput = phase3RuntimeInput({
      agent: phase3AgentProfile(),
      runtimeProfile: 'iterative'
    })
    const iterative = await harness.execute(iterativeInput)
    expect(iterative.stopReason).toBe('COMPLETED')
    expect(iterative.response).toBe('iterative answer')
    expect(iterative.steps).toBe(1)

    const singlePassInput: RuntimeInput = phase3RuntimeInput({
      agent: phase3AgentProfile(),
      runtimeProfile: 'single_pass'
    })
    const singlePass = await harness.execute(singlePassInput)
    expect(singlePass.stopReason).toBe('COMPLETED')
    expect(singlePass.steps).toBe(1)

    expect(harness.resolveProfile(iterativeInput)).toBe('iterative')
    expect(harness.resolveProfile(singlePassInput)).toBe('single_pass')
    expect(harness.resolveProfile(withoutProfile(phase3RuntimeInput()))).toBe(
      'single_pass'
    )
  })

  it('P3-COMPAT-002 fails closed when the iterative profile is unconfigured', async () => {
    const harness = createOperationalHarness({ ...ports() })
    const result = await harness.execute(
      phase3RuntimeInput({
        agent: phase3AgentProfile(),
        runtimeProfile: 'iterative'
      })
    )
    expect(result.stopReason).toBe('STATE_CONFLICT')
    expect(result.steps).toBe(0)
  })

  it('P3-COMPAT-003 drops authority fields injected by the orchestrator', async () => {
    const stepStore = new InMemoryExecutionStepStore()
    const injected = {
      decisionType: 'RESPOND',
      reasonCode: 'GOAL_SATISFIED',
      responseText: 'ok',
      policyDecision: 'ALLOW',
      budgetOverride: 999
    } as never
    const harness = createOperationalHarness({
      ...ports(),
      iterativeOrchestrator: new ScriptedOrchestrator({ script: [injected] }),
      stepStore
    })
    const input = phase3RuntimeInput({
      agent: phase3AgentProfile(),
      runtimeProfile: 'iterative'
    })
    const result = await harness.execute(input)
    expect(result.stopReason).toBe('COMPLETED')
    const checkpoint = await stepStore.loadCheckpoint(
      input.tenantId,
      'exec_phase3_fixture'
    )
    const serialized = JSON.stringify(checkpoint)
    expect(serialized).not.toContain('policyDecision')
    expect(serialized).not.toContain('budgetOverride')
  })

  it('P3-COMPAT-004 exports a trajectory without payloads', async () => {
    const stepStore = new InMemoryExecutionStepStore()
    const harness = createOperationalHarness({
      ...ports(),
      iterativeOrchestrator: new ScriptedOrchestrator({
        script: [
          decision({
            decisionType: 'CALL_TOOL',
            toolId: 'synthetic.phase3.availability',
            toolInput: { resource: 'resource-x' }
          }),
          decision({
            decisionType: 'RESPOND',
            reasonCode: 'GOAL_SATISFIED',
            responseText: 'done'
          })
        ]
      }),
      stepStore
    })
    const input = phase3RuntimeInput({
      agent: phase3AgentProfile(),
      runtimeProfile: 'iterative'
    })
    const result = await harness.execute(input)
    expect(result.stopReason).toBe('COMPLETED')
    const trajectory = await readExecutionTrajectory(
      stepStore,
      input.tenantId,
      'exec_phase3_fixture'
    )
    expect(trajectory?.runtimeVersion).toBe('2.0.0')
    expect(trajectory?.steps.map((step) => step.stepType)).toEqual([
      'TOOL',
      'RESPOND'
    ])
    expect(JSON.stringify(trajectory)).not.toContain('resource-x')
    expect(JSON.stringify(trajectory)).not.toContain('"output":')
  })
})
