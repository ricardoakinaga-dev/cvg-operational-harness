import { describe, expect, it } from 'vitest'
import type { ModelGateway, RuntimeInput } from '@cvg/harness-contracts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import {
  StaticOrchestrator,
  ScriptedModelGateway
} from '@cvg/harness-orchestrator'
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
import { DefaultContextEngine } from '../context-engine.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'

/** RESPOND without responseText/responseIntent forces the kernel compose path. */
const respondViaCompose = decision({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseIntent: 'acknowledge the synthetic operational goal'
})

/** RESPOND with responseText completes without touching the model gateway. */
const respondWithText = decision({
  decisionType: 'RESPOND',
  reasonCode: 'GOAL_SATISFIED',
  responseText: 'Synthetic budget-gate response.'
})

function operationalInput(overrides: Partial<RuntimeInput> = {}): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile(),
    ...overrides
  })
}

function buildHarness(
  decisionValue: ReturnType<typeof decision>,
  options: { modelGateway?: ModelGateway } = {}
) {
  const model =
    options.modelGateway ??
    new ScriptedModelGateway({
      responses: [
        { text: 'composed ok', inputTokens: 10, outputTokens: 5, costUsd: 0.01 }
      ]
    })
  const orchestrator = new StaticOrchestrator({ decision: decisionValue })
  const runtime = new IterativeGovernedRuntime({
    orchestrator,
    modelGateway: model,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: new InMemoryExecutionStepStore(),
    contextEngine: new DefaultContextEngine()
  })
  return {
    runtime,
    modelCalls: () => (model instanceof ScriptedModelGateway ? model.calls : 0)
  }
}

describe('PDSH-004 — single pre-model budget gate (I11)', () => {
  it('exactly one compose call per successful turn; no silent extra calls', async () => {
    const harness = buildHarness(respondViaCompose)
    const result = await harness.runtime.execute(operationalInput())
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toContain('composed ok')
    expect(harness.modelCalls()).toBe(1)
  })

  it('MAX_MODEL_CALLS stops before the second compose call', async () => {
    const harness = buildHarness(respondViaCompose)
    const result = await harness.runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxModelCalls: 1 }
      })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(harness.modelCalls()).toBe(1)
  })

  it('failed compose attempts still consume the slot (fail-closed accounting)', async () => {
    let calls = 0
    const flaky: ModelGateway = {
      complete: async () => {
        calls += 1
        throw new Error('synthetic outage')
      }
    } as never
    const harness = buildHarness(respondViaCompose, { modelGateway: flaky })
    const result = await harness.runtime.execute(operationalInput())
    expect(calls).toBe(1)
    expect(result.stopReason).toBe('MODEL_FAILURE')
  })

  it('reported token usage from compose is recorded and stops on overrun', async () => {
    const gateway = new ScriptedModelGateway({
      responses: [
        { text: 'composed', inputTokens: 100, outputTokens: 100, costUsd: 0.5 }
      ]
    })
    const harness = buildHarness(respondViaCompose, { modelGateway: gateway })
    const result = await harness.runtime.execute(
      operationalInput({
        budget: {
          ...operationalInput().budget,
          maxTokens: 10,
          maxCostUsd: 0.1
        }
      })
    )
    expect(result.stopReason).toBe('MAX_TOKENS')
    expect(harness.modelCalls()).toBe(1)
  })

  it('cost overrun from compose is recorded and stops the turn', async () => {
    const gateway = new ScriptedModelGateway({
      responses: [
        { text: 'composed', inputTokens: 1, outputTokens: 1, costUsd: 10 }
      ]
    })
    const harness = buildHarness(respondViaCompose, { modelGateway: gateway })
    const result = await harness.runtime.execute(
      operationalInput({
        budget: { ...operationalInput().budget, maxCostUsd: 0.0001 }
      })
    )
    expect(result.stopReason).toBe('MAX_COST')
    expect(harness.modelCalls()).toBe(1)
  })

  it('regression: RESPOND with responseText completes without spending a model slot', async () => {
    const harness = buildHarness(respondWithText)
    const first = await harness.runtime.execute(operationalInput())
    expect(first.stopReason).toBe('COMPLETED')
    expect(first.response).toContain('Synthetic budget-gate response.')
    expect(harness.modelCalls()).toBe(0)
  })
})
