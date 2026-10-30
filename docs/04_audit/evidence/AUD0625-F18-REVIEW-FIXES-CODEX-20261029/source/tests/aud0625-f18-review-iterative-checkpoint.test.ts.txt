// @vitest-environment node
import { expect, it, vi } from 'vitest'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { IterativeGovernedRuntime } from '../packages/harness/src/iterative-runtime.ts'
import { DefaultContextEngine } from '../packages/harness/src/context-engine.ts'
import { InMemoryExecutionStepStore } from '../packages/harness/src/step-store.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  decision,
  phase3RuntimeInput,
  PHASE3_TOOL_RESERVE
} from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

const observed = vi.hoisted(() => ({
  calls: [] as { raw: unknown; view: unknown }[]
}))
// Observe the genuine iterative checkpoint boundary without replacing its
// implementation, the kernel pipeline, policy, approval or effect execution.
vi.mock(
  '../packages/harness/src/kernel/pipeline.ts',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../packages/harness/src/kernel/pipeline.ts')
      >()
    return {
      ...actual,
      runToolCall: ((host, call, hooks = {}) => {
        const beforeDispatch = hooks.beforeDispatch
        return actual.runToolCall(host, call, {
          ...hooks,
          ...(beforeDispatch
            ? {
                beforeDispatch: async (view) => {
                  observed.calls.push({ raw: call, view })
                  return beforeDispatch(view)
                }
              }
            : {})
        })
      }) as typeof actual.runToolCall
    }
  }
)

it('P-R23 the real iterative beforeDispatch checkpoint receives a detached immutable view', async () => {
  observed.calls.length = 0
  let bodies = 0
  const tools = createPhase3ToolRegistry({
    availability: 'AVAILABLE',
    observe: () => {
      bodies++
    }
  })
  const approvals = new InMemoryApprovalEngine()
  approvals.approveOnRequest = true
  const runtime = new IterativeGovernedRuntime({
    orchestrator: new ScriptedOrchestrator({
      script: [
        decision({
          decisionType: 'CALL_TOOL',
          toolId: PHASE3_TOOL_RESERVE,
          toolInput: { resource: 'OWNED', date: '2026-10-01' }
        })
      ]
    }),
    modelGateway: new ScriptedModelGateway({ responses: ['owned'] }),
    policy: new ScriptedPolicyEngine(),
    approvals,
    tools,
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    stepStore: new InMemoryExecutionStepStore(),
    contextEngine: new DefaultContextEngine()
  })
  const result = await runtime.execute(phase3RuntimeInput())
  expect(result.toolCalls).toBe(1)
  expect(bodies).toBe(1)
  expect(observed.calls).toHaveLength(1)
  const { raw, view } = observed.calls[0]!
  expect(view).not.toBe(raw)
  expect(Object.isFrozen(view)).toBe(true)
  for (const key of ['grant', 'approval', 'sandboxHandle'])
    expect(key in (view as object), key).toBe(false)
  const call = view as {
    invocation: { input: unknown }
    tool: object
    turn: { input: unknown; budget: object }
  }
  expect(Object.isFrozen(call.invocation)).toBe(true)
  expect(Object.isFrozen(call.invocation.input)).toBe(true)
  expect(Object.isFrozen(call.turn.budget)).toBe(true)
  expect('execute' in call.tool).toBe(false)
  expect('beginModelRequest' in call.turn.budget).toBe(false)
})
