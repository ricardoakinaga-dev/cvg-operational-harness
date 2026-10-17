import { describe, expect, it } from 'vitest'
import type {
  ExecutionCheckpoint,
  ExecutionStep,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import { HybridOrchestrator } from '@cvg/harness-orchestrator'
import {
  createJournaledToolRegistry,
  createOperationalHarness,
  InMemoryEffectJournal,
  InMemoryExecutionStepStore,
  type EffectJournal
} from '../index.ts'
import {
  phase3AgentProfile,
  phase3RuntimeInput,
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine
} from './fixtures/phase3-fixtures.ts'

const toolId = 'synthetic.recovery.write'
type JournalMode = 'none' | 'factory' | 'prewrapped'

function fixture(mode: JournalMode) {
  const journal = new InMemoryEffectJournal()
  const initialStore = new InMemoryExecutionStepStore()
  const base = phase3RuntimeInput()
  const input = {
    ...base,
    agent: phase3AgentProfile({ tools: [toolId] }),
    userMessage: 'Perform one synthetic in-memory operation.',
    budget: { ...base.budget, maxDurationMs: 5000 }
  }
  const operationKeys: string[] = []
  let bodies = 0
  let captured: ExecutionCheckpoint
  let capturedSteps: readonly ExecutionStep[]
  let entered!: () => void
  const bodyEntered = new Promise<void>((resolve) => {
    entered = resolve
  })
  const factory = (
    store: InMemoryExecutionStepStore,
    suspend: boolean,
    recovery?: { mode?: JournalMode; journal?: EffectJournal }
  ) => {
    const selectedMode = recovery?.mode ?? mode
    const authority = recovery?.journal ?? journal
    const tool: ToolDefinition = {
      id: toolId,
      version: '1',
      description: 'Synthetic in-memory counter only',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string' },
      risk: 'LOW',
      sideEffect: 'WRITE',
      idempotent: false,
      requiresApproval: false,
      execute: async (_input, context) => {
        bodies++
        operationKeys.push(context.operationKey!)
        if (suspend) {
          captured = (await initialStore.loadCheckpoint(
            input.tenantId,
            input.executionId!
          ))!
          capturedSteps = await initialStore.listSteps(
            input.tenantId,
            input.executionId!
          )
          entered()
          await new Promise<void>(() => {})
        }
        return { status: 'SUCCEEDED', output: 'synthetic operation done' }
      }
    }
    const raw: ToolRegistry = {
      list: () => [tool],
      resolve: (id) => (id === toolId ? tool : undefined)
    }
    return createOperationalHarness({
      toolResultContext: { version: 1 },
      ...(selectedMode === 'factory' ? { effectJournal: authority } : {}),
      tools:
        selectedMode === 'prewrapped'
          ? createJournaledToolRegistry(raw, authority)
          : raw,
      stepStore: store,
      iterativeOrchestrator: new HybridOrchestrator({
        rules: [
          (context) =>
            context.stepNumber === 1
              ? {
                  decisionType: 'CALL_TOOL',
                  reasonCode: 'TOOL_REQUIRED',
                  toolId,
                  toolVersion: '1',
                  toolInput: {}
                }
              : {
                  decisionType: 'RESPOND',
                  reasonCode: 'GOAL_SATISFIED',
                  responseText: 'Synthetic operation done.'
                }
        ]
      }),
      modelGateway: {
        complete: async () => {
          throw new Error('Must never call a model')
        }
      },
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink()
    })
  }
  const interrupt = async (failed = false) => {
    const controller = new AbortController()
    const running = factory(initialStore, true).run({
      ...input,
      signal: controller.signal
    })
    await bodyEntered
    controller.abort()
    await running
    // Recreate only state durable before the body completed. This is a memory
    // crash reconstruction; the interrupted process's later writes are absent.
    const restored = new InMemoryExecutionStepStore()
    await restored.compareAndSwapCheckpoint({
      tenantId: input.tenantId,
      executionId: input.executionId!,
      expected: null,
      next: captured
    })
    for (const step of capturedSteps)
      await restored.recordStep(
        failed && step.stepType === 'TOOL'
          ? { ...step, status: 'FAILED', errorCode: 'unknown_effect' }
          : step
      )
    return restored
  }
  return {
    input,
    factory,
    initialStore,
    interrupt,
    journal,
    operationKeys,
    bodyCount: () => bodies,
    checkpoint: () => captured
  }
}

describe('SPEC0224 unresolved dispatch recovery authority', () => {
  it.each([false, true])(
    'hands off an unjournaled in-flight dispatch without replay (failed=%s)',
    async (failed) => {
      const lane = fixture('none')
      const restored = await lane.interrupt(failed)
      const result = await lane.factory(restored, false).run(lane.input)
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(result.response).toContain('explicit reconciliation is required')
      expect(lane.bodyCount()).toBe(1)
      expect(result.toolCalls).toBe(1)
      expect(result.modelCalls).toBe(0)
      expect(
        await restored.loadCheckpoint(
          lane.input.tenantId,
          lane.input.executionId!
        )
      ).toEqual(lane.checkpoint())
    }
  )

  it.each(['factory', 'prewrapped'] as const)(
    'keeps native journal uncertainty authoritative through %s composition',
    async (mode) => {
      const lane = fixture(mode)
      const restored = await lane.interrupt()
      const result = await lane.factory(restored, false).run(lane.input)
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(result.response).toContain('explicit reconciliation is required')
      expect(lane.bodyCount()).toBe(1)
      expect(lane.operationKeys).toHaveLength(1)
    }
  )

  it.each(['factory', 'prewrapped'] as const)(
    'recovers a confirmed journal result without a second body through %s',
    async (mode) => {
      const lane = fixture(mode)
      const restored = await lane.interrupt()
      const operationKey = lane.operationKeys[0]!
      const record = await lane.journal.get(lane.input.tenantId, operationKey)
      expect(record?.state).toBe('EFFECT_STARTED')
      // Simulate the durable native confirmation arriving before recreation.
      await lane.journal.confirm({
        tenantId: lane.input.tenantId,
        operationKey,
        attemptId: record!.attemptId,
        result: 'synthetic operation done'
      })
      const result = await lane.factory(restored, false).run(lane.input)
      expect(result.stopReason).toBe('COMPLETED')
      expect(lane.bodyCount()).toBe(1)
      expect(result.toolCalls).toBe(1)
      expect(result.modelCalls).toBe(0)
    }
  )

  it('preserves the initial custom-tools invocation without a journal', async () => {
    const lane = fixture('none')
    const result = await lane.factory(lane.initialStore, false).run(lane.input)
    expect(result.stopReason).toBe('COMPLETED')
    expect(lane.bodyCount()).toBe(1)
    expect(result.toolCalls).toBe(1)
  })

  it.each(['none', 'factory', 'prewrapped'] as const)(
    'does not gain recovery authority from a fresh empty journal after %s',
    async (mode) => {
      const lane = fixture(mode)
      const restored = await lane.interrupt()
      const empty = new InMemoryEffectJournal()
      const result = await lane
        .factory(restored, false, { mode: 'factory', journal: empty })
        .run(lane.input)
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(lane.bodyCount()).toBe(1)
      expect(result.toolCalls).toBe(1)
      expect(
        await empty.get(lane.input.tenantId, lane.operationKeys[0]!)
      ).toBeNull()
      expect(
        await restored.loadCheckpoint(
          lane.input.tenantId,
          lane.input.executionId!
        )
      ).toEqual(lane.checkpoint())
    }
  )

  it.each(['throw', 'wrong-tenant', 'wrong-operation', 'never'] as const)(
    'hands off when the native journal proof is %s',
    async (fault) => {
      const lane = fixture('factory')
      const restored = await lane.interrupt()
      const originalGet = lane.journal.get.bind(lane.journal)
      lane.journal.get = async (tenantId, operationKey) => {
        if (fault === 'throw') throw new Error('Synthetic proof read failure')
        if (fault === 'never') return new Promise(() => {})
        const record = await originalGet(tenantId, operationKey)
        return {
          ...record!,
          ...(fault === 'wrong-tenant'
            ? { tenantId: 'synthetic-other-tenant' }
            : { operationKey: 'synthetic-other-operation' })
        }
      }
      const result = await lane.factory(restored, false).run({
        ...lane.input,
        ...(fault === 'never'
          ? { budget: { ...lane.input.budget, maxDurationMs: 50 } }
          : {})
      })
      expect(result.stopReason).toBe('TOOL_FAILURE')
      expect(lane.bodyCount()).toBe(1)
      expect(
        await restored.loadCheckpoint(
          lane.input.tenantId,
          lane.input.executionId!
        )
      ).toEqual(lane.checkpoint())
    }
  )
})
