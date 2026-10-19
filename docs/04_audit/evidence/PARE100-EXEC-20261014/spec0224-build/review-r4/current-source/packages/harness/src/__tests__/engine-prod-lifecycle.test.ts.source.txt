import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  ApprovalEngine,
  ApprovalExecutionPort,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  ScriptedModelGateway,
  ScriptedOrchestrator
} from '@cvg/harness-orchestrator'
import { ALL_AGENT_TOOLS, SinglePassGovernedRuntime } from '../runtime.ts'
import { IterativeGovernedRuntime } from '../iterative-runtime.ts'
import { DefaultContextEngine } from '../context-engine.ts'
import { InMemoryExecutionStepStore } from '../step-store.ts'
import {
  InMemoryApprovalEngine,
  PHASE3_TOOL_RESERVE,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  createPhase3ToolRegistry,
  decision,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

/**
 * ENGINE-PROD-20261004: lifecycle invariants that must hold when the duration
 * budget runs out between governed steps.
 */

let now = Date.parse('2026-10-04T12:00:00.000Z')

function freezeClock(): void {
  vi.spyOn(Date, 'now').mockImplementation(() => now)
}

afterEach(() => {
  vi.restoreAllMocks()
})

function recordingExecution(
  events: string[],
  onBegin: () => void = () => undefined
): ApprovalExecutionPort {
  return {
    begin: async () => {
      events.push('begin')
      onBegin()
      return {
        approvalId: 'approval-engine-prod' as never,
        reservationId: 'reservation-engine-prod'
      }
    },
    complete: async () => {
      events.push('complete')
    },
    fail: async (input) => {
      events.push(`fail:${input.evidenceRef.split(':').at(-1)}`)
    },
    uncertain: async () => {
      events.push('uncertain')
    }
  }
}

function approvingEngine(execution: ApprovalExecutionPort): ApprovalEngine {
  return {
    request: async () => ({
      status: 'APPROVED',
      approvalId: 'approval-engine-prod' as never,
      reason: 'approved'
    }),
    execution
  }
}

function singlePassTool(
  overrides: Partial<ToolDefinition> = {}
): ToolDefinition {
  return {
    id: 'synthetic.engine.tool',
    version: 'v1',
    description: 'Synthetic engine tool',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    idempotent: false,
    requiresApproval: false,
    execute: async () => ({ status: 'SUCCEEDED', output: { ok: true } }),
    ...overrides
  }
}

function registry(tool: ToolDefinition): ToolRegistry {
  return {
    list: () => [tool],
    resolve: (id) => (id === tool.id ? tool : undefined)
  }
}

describe('single-pass runtime lifecycle under an exhausted duration budget', () => {
  it('releases the approval reservation when the tool never starts', async () => {
    freezeClock()
    const events: string[] = []
    let executed = false
    const tool = singlePassTool({
      requiresApproval: true,
      execute: async () => {
        executed = true
        return { status: 'SUCCEEDED' }
      }
    })
    const audit = new RecordingAuditSink()
    const input = phase3RuntimeInput({
      agent: phase3AgentProfile({ tools: [tool.id] }),
      runtimeProfile: 'single_pass'
    })
    const runtime = new SinglePassGovernedRuntime({
      orchestrator: {
        decideNextStep: async () => ({
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: tool.id,
            input: {},
            operationKey: 'engine-prod-not-started'
          }
        })
      },
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvingEngine(
        recordingExecution(events, () => {
          now += input.budget.maxDurationMs + 1
        })
      ),
      tools: registry(tool),
      audit,
      telemetry: new RecordingTelemetrySink()
    })

    const result = await runtime.execute(input)

    expect(executed).toBe(false)
    expect(events).toEqual(['begin', 'fail:tool_not_started'])
    expect(result).toMatchObject({
      stopReason: 'MAX_DURATION',
      approvalId: 'approval-engine-prod',
      toolCalls: 0
    })
    expect(audit.events).toHaveLength(1)
  })

  it('audits a completed effect even when the budget ran out during it', async () => {
    freezeClock()
    const audit = new RecordingAuditSink()
    const input = phase3RuntimeInput({
      agent: phase3AgentProfile({ tools: ['synthetic.engine.tool'] }),
      runtimeProfile: 'single_pass'
    })
    const tool = singlePassTool({
      execute: async () => {
        now += input.budget.maxDurationMs + 1
        return { status: 'SUCCEEDED', output: { ok: true } }
      }
    })
    const runtime = new SinglePassGovernedRuntime({
      orchestrator: {
        decideNextStep: async () => ({
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: tool.id,
            input: {},
            operationKey: 'engine-prod-late-effect'
          }
        })
      },
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvingEngine(recordingExecution([])),
      tools: registry(tool),
      audit,
      telemetry: new RecordingTelemetrySink()
    })

    const result = await runtime.execute(input)

    expect(result).toMatchObject({ stopReason: 'MAX_DURATION', toolCalls: 1 })
    expect(audit.events).toEqual([
      expect.objectContaining({
        tool: tool.id,
        result: 'MAX_DURATION',
        correlationId: input.correlationId
      })
    ])
  })
})

describe('iterative runtime lifecycle under an exhausted duration budget', () => {
  it('releases the approval reservation when the tool never starts', async () => {
    freezeClock()
    const events: string[] = []
    const toolCalls: string[] = []
    const input = phase3RuntimeInput({ agent: phase3AgentProfile() })
    const runtime = new IterativeGovernedRuntime({
      orchestrator: new ScriptedOrchestrator({
        script: [
          decision({
            decisionType: 'REQUEST_APPROVAL',
            reasonCode: 'POLICY_REQUIRED',
            toolId: PHASE3_TOOL_RESERVE,
            toolInput: { resource: 'resource-x' }
          })
        ]
      }),
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvingEngine(
        recordingExecution(events, () => {
          now += input.budget.maxDurationMs + 1
        })
      ),
      tools: createPhase3ToolRegistry({
        availability: 'AVAILABLE',
        observe: (event) => toolCalls.push(event.toolId)
      }),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      stepStore: new InMemoryExecutionStepStore(),
      contextEngine: new DefaultContextEngine()
    })

    const result = await runtime.execute(input)

    expect(toolCalls).toEqual([])
    expect(events).toEqual(['begin', 'fail:tool_not_started'])
    expect(result.stopReason).toBe('MAX_DURATION')
  })
})

describe('ENG-002 approvals are single-use', () => {
  function approvedWithoutPort(): ApprovalEngine {
    return {
      request: async () => ({
        status: 'APPROVED',
        approvalId: 'approval-unbound' as never,
        reason: 'approved'
      })
    }
  }

  it('single-pass refuses an approved effect without an execution port', async () => {
    let executed = false
    const tool = singlePassTool({
      requiresApproval: true,
      execute: async () => {
        executed = true
        return { status: 'SUCCEEDED' }
      }
    })
    const runtime = new SinglePassGovernedRuntime({
      orchestrator: {
        decideNextStep: async () => ({
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: tool.id,
            input: {},
            operationKey: 'engine-prod-unbound'
          }
        })
      },
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvedWithoutPort(),
      tools: registry(tool),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink()
    })

    const result = await runtime.execute(
      phase3RuntimeInput({
        agent: phase3AgentProfile({ tools: [tool.id] }),
        runtimeProfile: 'single_pass'
      })
    )

    expect(executed).toBe(false)
    expect(result).toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      toolCalls: 0
    })
  })

  it('iterative refuses an approved effect without an execution port', async () => {
    const toolCalls: string[] = []
    const runtime = new IterativeGovernedRuntime({
      orchestrator: new ScriptedOrchestrator({
        script: [
          decision({
            decisionType: 'REQUEST_APPROVAL',
            reasonCode: 'POLICY_REQUIRED',
            toolId: PHASE3_TOOL_RESERVE,
            toolInput: { resource: 'resource-x' }
          })
        ]
      }),
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvedWithoutPort(),
      tools: createPhase3ToolRegistry({
        availability: 'AVAILABLE',
        observe: (event) => toolCalls.push(event.toolId)
      }),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink(),
      stepStore: new InMemoryExecutionStepStore(),
      contextEngine: new DefaultContextEngine()
    })

    const result = await runtime.execute(
      phase3RuntimeInput({ agent: phase3AgentProfile() })
    )

    expect(toolCalls).toEqual([])
    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
  })

  it('the in-memory fixture consumes an approval exactly once', async () => {
    const approvals = new InMemoryApprovalEngine()
    const request = {
      tenantId: 'tenant_x' as never,
      approvalId: 'approval-once' as never,
      agentId: 'agent_x' as never,
      agentVersion: 'v1' as never,
      action: 'tool.execute',
      resource: { type: 'tool', id: 'synthetic' },
      payload: {},
      policyVersion: 'v1',
      operationKey: 'op-once',
      executionRef: 'exec-once'
    }
    const handle = await approvals.execution.begin(request)
    await approvals.execution.complete({
      request,
      reservationId: handle.reservationId,
      evidenceRef: 'done'
    })
    await expect(approvals.execution.begin(request)).rejects.toThrow('consumed')
  })
})

describe('ENG-004 tool exposure is deny-by-default', () => {
  function runtimeFor(tool: ToolDefinition) {
    return new SinglePassGovernedRuntime({
      orchestrator: {
        decideNextStep: async () => ({
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: tool.id,
            input: {},
            operationKey: 'engine-prod-exposure'
          }
        })
      },
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: approvingEngine(recordingExecution([])),
      tools: registry(tool),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink()
    })
  }

  it('an empty tool list exposes no tool', async () => {
    let executed = false
    const tool = singlePassTool({
      execute: async () => {
        executed = true
        return { status: 'SUCCEEDED' }
      }
    })
    const result = await runtimeFor(tool).execute(
      phase3RuntimeInput({
        agent: phase3AgentProfile({ tools: [] }),
        runtimeProfile: 'single_pass'
      })
    )
    expect(executed).toBe(false)
    expect(result.stopReason).toBe('POLICY_DENIED')
  })

  it('the explicit wildcard exposes the whole registry', async () => {
    const tool = singlePassTool()
    const result = await runtimeFor(tool).execute(
      phase3RuntimeInput({
        agent: phase3AgentProfile({ tools: [ALL_AGENT_TOOLS] }),
        runtimeProfile: 'single_pass'
      })
    )
    expect(result).toMatchObject({ stopReason: 'COMPLETED', toolCalls: 1 })
  })
})

describe('ENG-008 iterative audit failure is fail-closed', () => {
  it('degrades a budget stop whose audit cannot be recorded', async () => {
    const runtime = new IterativeGovernedRuntime({
      orchestrator: new ScriptedOrchestrator({ script: [] }),
      modelGateway: new ScriptedModelGateway({ responses: ['unused'] }),
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      tools: createPhase3ToolRegistry({ availability: 'AVAILABLE' }),
      audit: {
        append: async () => {
          throw new Error('synthetic audit outage')
        }
      },
      telemetry: new RecordingTelemetrySink(),
      stepStore: new InMemoryExecutionStepStore(),
      contextEngine: new DefaultContextEngine()
    })
    const input = phase3RuntimeInput({ agent: phase3AgentProfile() })

    const result = await runtime.execute({
      ...input,
      budget: { ...input.budget, maxSteps: 0 }
    })

    expect(result.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.response).toContain('audit recording failed')
  })
})

describe('ENG-003 model calls are cancelled at the deadline', () => {
  it('aborts the in-flight model request when the duration budget expires', async () => {
    let received: AbortSignal | undefined
    const runtime = new SinglePassGovernedRuntime({
      orchestrator: { decideNextStep: async () => ({ action: 'RESPOND' }) },
      modelGateway: {
        complete: (request) => {
          received = request.signal
          return new Promise(() => undefined)
        }
      },
      policy: new ScriptedPolicyEngine(),
      approvals: new InMemoryApprovalEngine(),
      tools: registry(singlePassTool()),
      audit: new RecordingAuditSink(),
      telemetry: new RecordingTelemetrySink()
    })
    const input = phase3RuntimeInput({
      agent: phase3AgentProfile({ tools: [] }),
      runtimeProfile: 'single_pass'
    })

    const result = await runtime.execute({
      ...input,
      budget: { ...input.budget, maxDurationMs: 30 }
    })

    expect(result.stopReason).toBe('MAX_DURATION')
    expect(received?.aborted).toBe(true)
  })
})
