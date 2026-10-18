import { describe, expect, it, vi } from 'vitest'
import type { ToolDefinition } from '@cvg/harness-contracts'
import {
  InMemorySessionEventStore,
  createSessionKernelLog
} from '../session/index.ts'
import { createOperationalHarness } from '../createOperationalHarness.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3RuntimeInput,
  phase3AgentProfile
} from './fixtures/phase3-fixtures.ts'

describe('PDSH-021 session log at governed dispatch boundary', () => {
  function fixture(failType?: string, modelOnly = false) {
    const input = phase3RuntimeInput({
      runtimeProfile: 'single_pass',
      agent: phase3AgentProfile({ tools: ['synthetic.session'] }),
      requestedTool: {
        toolId: 'synthetic.session',
        input: { value: 1 },
        operationKey: 'session-op'
      }
    })
    const store = new InMemorySessionEventStore()
    const stream = {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      formatVersion: 1
    } as const
    const append = store.append.bind(store)
    vi.spyOn(store, 'append').mockImplementation(async (event) => {
      if (event.type === failType) throw new Error('synthetic log unavailable')
      return append(event)
    })
    const execute = vi.fn(async () => ({
      status: 'SUCCEEDED' as const,
      output: { value: 1 }
    }))
    const tool: ToolDefinition = {
      id: 'synthetic.session',
      version: 'v1',
      description: 'synthetic',
      inputSchema: {},
      outputSchema: {},
      sideEffect: 'READ',
      risk: 'LOW',
      requiresApproval: false,
      idempotent: true,
      execute
    }
    const complete = vi.fn(async () => ({
      text: 'synthetic',
      provider: 'synthetic',
      model: 'synthetic',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    }))
    const harness = createOperationalHarness({
      log: createSessionKernelLog({
        ...stream,
        traceId: input.traceId,
        correlationId: input.correlationId,
        store
      }),
      modelGateway: { complete },
      approvals: new InMemoryApprovalEngine(),
      policy: new ScriptedPolicyEngine(),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      tools: {
        list: () => [tool],
        resolve: (id) => (id === tool.id ? tool : undefined)
      },
      orchestrator: {
        decideNextStep: async () =>
          modelOnly
            ? { action: 'RESPOND' }
            : {
                action: 'CALL_TOOL',
                toolInvocation: input.requestedTool!
              }
      }
    })
    return { store, stream, harness, input, execute, complete }
  }
  it('composes the public log port and stores call before effect/result after effect', async () => {
    const f = fixture()
    await f.store.openSession(f.stream)
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.execute).toHaveBeenCalledTimes(1)
    const events = await f.store.read({
      tenantId: f.stream.tenantId,
      sessionId: f.stream.sessionId
    })
    expect(events.map((e) => e.type)).toEqual([
      'turn/start',
      'tool/call',
      'tool/result',
      'turn/end'
    ])
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3, 4])
  })
  it('fails closed before dispatch when log append fails', async () => {
    const f = fixture('tool/call')
    await f.store.openSession(f.stream)
    expect((await f.harness.execute(f.input)).stopReason).toBe(
      'INSUFFICIENT_EVIDENCE'
    )
    expect(f.execute).not.toHaveBeenCalled()
  })
  it('logs the model request without a host signal and result tokens after the call', async () => {
    const f = fixture(undefined, true)
    await f.store.openSession(f.stream)
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.complete).toHaveBeenCalledTimes(1)
    const events = await f.store.read({
      tenantId: f.stream.tenantId,
      sessionId: f.stream.sessionId
    })
    expect(events.map((e) => e.type)).toEqual([
      'turn/start',
      'model/request',
      'model/result',
      'turn/end'
    ])
    expect(events[1]?.payload).toHaveProperty('request')
    expect(events[1]?.payload).not.toHaveProperty('request.signal')
  })
  it('prevents a model call when persisting its request fails', async () => {
    const f = fixture('model/request', true)
    await f.store.openSession(f.stream)
    expect((await f.harness.execute(f.input)).stopReason).toBe(
      'INSUFFICIENT_EVIDENCE'
    )
    expect(f.complete).not.toHaveBeenCalled()
  })
})
