import { describe, expect, it } from 'vitest'
import type {
  ApprovalEngine,
  ApprovalExecutionPort,
  AuditSink,
  ModelGateway,
  Orchestrator,
  OrchestratorDecision,
  PolicyEngine,
  RuntimeInput,
  TelemetrySink,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import { SinglePassGovernedRuntime } from '../runtime.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const defaultModel: ModelGateway = {
  complete: async () => ({
    text: 'model response',
    provider: 'synthetic-provider',
    model: 'synthetic-model',
    inputTokens: 2,
    outputTokens: 3,
    costUsd: 0.01
  })
}

function tool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    id: 'synthetic.runtime.tool',
    version: 'v1',
    description: 'Synthetic runtime tool',
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

function registry(...tools: ToolDefinition[]): ToolRegistry {
  return {
    list: () => tools,
    resolve: (id, version) =>
      tools.find(
        (candidate) =>
          candidate.id === id &&
          (version === undefined || candidate.version === version)
      )
  }
}

function orchestrator(decision: OrchestratorDecision): Orchestrator {
  return { decideNextStep: async () => decision }
}

function build(options: {
  readonly decision: OrchestratorDecision
  readonly orchestrator?: Orchestrator
  readonly modelGateway?: ModelGateway
  readonly policy?: PolicyEngine
  readonly approvals?: ApprovalEngine
  readonly tools?: ToolRegistry
  readonly audit?: AuditSink
  readonly telemetry?: TelemetrySink
  readonly capabilityFingerprint?: string
}): {
  readonly runtime: SinglePassGovernedRuntime
  readonly audit: AuditSink
  readonly telemetry: TelemetrySink
} {
  const audit = options.audit ?? new RecordingAuditSink()
  const telemetry = options.telemetry ?? new RecordingTelemetrySink()
  return {
    runtime: new SinglePassGovernedRuntime({
      orchestrator: options.orchestrator ?? orchestrator(options.decision),
      modelGateway: options.modelGateway ?? defaultModel,
      policy: options.policy ?? new ScriptedPolicyEngine(),
      approvals: options.approvals ?? new InMemoryApprovalEngine(),
      tools: options.tools ?? registry(),
      ...(options.capabilityFingerprint
        ? { capabilityFingerprint: options.capabilityFingerprint }
        : {}),
      audit,
      telemetry
    }),
    audit,
    telemetry
  }
}

function input(overrides: Partial<RuntimeInput> = {}): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [] }),
    runtimeProfile: 'single_pass',
    ...overrides
  })
}

describe('single-pass governed runtime boundaries', () => {
  it('fails closed for invalid identity, exhausted budgets, and mismatched capabilities', async () => {
    const { runtime } = build({
      decision: { action: 'RESPOND', response: 'ok' }
    })
    await expect(
      runtime.execute(
        input({ agent: phase3AgentProfile({ id: '' as never, tools: [] }) })
      )
    ).resolves.toMatchObject({ stopReason: 'UNSAFE_REQUEST', steps: 1 })
    await expect(
      runtime.execute(input({ budget: { ...input().budget, maxSteps: 0 } }))
    ).resolves.toMatchObject({ stopReason: 'MAX_STEPS' })
    await expect(
      runtime.execute(
        input({ budget: { ...input().budget, maxDurationMs: 0 } })
      )
    ).resolves.toMatchObject({
      stopReason: 'MAX_DURATION',
      response: 'Execution duration budget is not available.'
    })
  })

  it('maps every non-tool orchestrator action to a governed result', async () => {
    const cases: Array<[OrchestratorDecision, string]> = [
      [{ action: 'ASK_USER', response: 'need date' }, 'NEEDS_USER_INPUT'],
      [
        { action: 'REQUEST_APPROVAL', reason: 'approve first' },
        'APPROVAL_REQUIRED'
      ],
      [{ action: 'HANDOFF', reason: 'human required' }, 'HUMAN_TAKEOVER'],
      [{ action: 'STOP', reason: 'stop now' }, 'INSUFFICIENT_EVIDENCE'],
      [{ action: 'RETRIEVE' }, 'INSUFFICIENT_EVIDENCE'],
      [{ action: 'VERIFY' }, 'INSUFFICIENT_EVIDENCE']
    ]
    for (const [decision, stopReason] of cases) {
      const { runtime } = build({ decision })
      await expect(runtime.execute(input())).resolves.toMatchObject({
        stopReason
      })
    }
  })

  it('returns direct responses, model responses, model failures, and model budget stops', async () => {
    await expect(
      build({
        decision: { action: 'RESPOND', response: 'direct' }
      }).runtime.execute(input())
    ).resolves.toMatchObject({ stopReason: 'COMPLETED', response: 'direct' })

    await expect(
      build({ decision: { action: 'RESPOND' } }).runtime.execute(input())
    ).resolves.toMatchObject({
      stopReason: 'COMPLETED',
      response: 'model response'
    })

    await expect(
      build({
        decision: { action: 'RESPOND' },
        modelGateway: {
          complete: async () => {
            throw new Error('synthetic model failure')
          }
        }
      }).runtime.execute(input())
    ).resolves.toMatchObject({ stopReason: 'MODEL_FAILURE' })

    await expect(
      build({ decision: { action: 'RESPOND' } }).runtime.execute(
        input({ budget: { ...input().budget, maxModelCalls: 0 } })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_MODEL_CALLS' })

    await expect(
      build({
        decision: { action: 'RESPOND' },
        modelGateway: {
          complete: async () => ({
            text: 'too many tokens',
            provider: 'synthetic-provider',
            model: 'synthetic-model',
            inputTokens: 50,
            outputTokens: 50,
            costUsd: 2
          })
        }
      }).runtime.execute(
        input({ budget: { ...input().budget, maxTokens: 10 } })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_TOKENS' })

    await expect(
      build({
        decision: { action: 'RESPOND' },
        modelGateway: {
          complete: async () => ({
            text: 'too expensive',
            provider: 'synthetic-provider',
            model: 'synthetic-model',
            inputTokens: 1,
            outputTokens: 1,
            costUsd: 2
          })
        }
      }).runtime.execute(input())
    ).resolves.toMatchObject({ stopReason: 'MAX_COST' })
  })

  it('rejects missing, unavailable, unexposed, and over-budget tool calls', async () => {
    await expect(
      build({
        decision: { action: 'CALL_TOOL' },
        tools: registry()
      }).runtime.execute(input())
    ).resolves.toMatchObject({ stopReason: 'TOOL_FAILURE' })

    await expect(
      build({
        decision: {
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: 'synthetic.missing',
            input: {},
            operationKey: 'missing-op'
          }
        },
        tools: registry()
      }).runtime.execute(input())
    ).resolves.toMatchObject({ stopReason: 'TOOL_FAILURE' })

    const runtimeTool = tool()
    await expect(
      build({
        decision: {
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: runtimeTool.id,
            input: {},
            operationKey: 'hidden-op'
          }
        },
        tools: registry(runtimeTool)
      }).runtime.execute(
        input({ agent: phase3AgentProfile({ tools: ['another.tool'] }) })
      )
    ).resolves.toMatchObject({ stopReason: 'POLICY_DENIED' })

    await expect(
      build({
        decision: {
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: runtimeTool.id,
            input: {},
            operationKey: 'budget-op'
          }
        },
        tools: registry(runtimeTool)
      }).runtime.execute(
        input({
          agent: phase3AgentProfile({ tools: [runtimeTool.id] }),
          budget: { ...input().budget, maxToolCalls: 0 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'MAX_TOOL_CALLS' })
  })

  it('enforces policy outcomes before execution', async () => {
    const runtimeTool = tool()
    const decision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: runtimeTool.id,
        input: { value: 'synthetic' },
        operationKey: 'policy-op'
      }
    }
    const toolInput = input({
      agent: phase3AgentProfile({ tools: [runtimeTool.id] })
    })

    await expect(
      build({
        decision,
        tools: registry(runtimeTool),
        policy: new ScriptedPolicyEngine([runtimeTool.id])
      }).runtime.execute(toolInput)
    ).resolves.toMatchObject({ stopReason: 'POLICY_DENIED' })
    await expect(
      build({
        decision,
        tools: registry(runtimeTool),
        policy: new ScriptedPolicyEngine([], [runtimeTool.id])
      }).runtime.execute(toolInput)
    ).resolves.toMatchObject({ stopReason: 'HUMAN_TAKEOVER' })
    await expect(
      build({
        decision,
        tools: registry(runtimeTool),
        policy: { evaluate: async () => ({ outcome: 'UNKNOWN' }) as never }
      }).runtime.execute(toolInput)
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
    await expect(
      build({
        decision,
        tools: registry(runtimeTool),
        policy: {
          evaluate: async () => {
            throw new Error('synthetic policy outage')
          }
        }
      }).runtime.execute(toolInput)
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
  })

  it('handles approval states and capability-bound payloads', async () => {
    const approvedTool = tool({ requiresApproval: true })
    const decision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: approvedTool.id,
        input: { value: 'synthetic' },
        operationKey: 'approval-op'
      }
    }
    const runtimeInput = input({
      agent: phase3AgentProfile({ tools: [approvedTool.id] }),
      capabilityFingerprint: 'cap-a'
    })

    const pending = new InMemoryApprovalEngine()
    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: pending,
        capabilityFingerprint: 'cap-a'
      }).runtime.execute(runtimeInput)
    ).resolves.toMatchObject({ stopReason: 'APPROVAL_REQUIRED' })
    expect(pending.requests[0]?.payload).toEqual({
      capabilityFingerprint: 'cap-a',
      input: { value: 'synthetic' }
    })

    const approved = new InMemoryApprovalEngine()
    approved.approveOnRequest = true
    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: approved
      }).runtime.execute(runtimeInput)
    ).resolves.toMatchObject({ stopReason: 'COMPLETED', toolCalls: 1 })

    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: {
          request: async () =>
            ({
              status: 'APPROVED',
              reason: 'missing approval id'
            }) as never
        }
      }).runtime.execute(runtimeInput)
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
  })

  it('normalizes failed and thrown tool outcomes without claiming success', async () => {
    const failed = tool({
      execute: async () => ({ status: 'FAILED', error: 'synthetic failure' })
    })
    const decision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: failed.id,
        input: {},
        operationKey: 'failure-op'
      }
    }
    const runtimeInput = input({
      agent: phase3AgentProfile({ tools: [failed.id] })
    })
    await expect(
      build({ decision, tools: registry(failed) }).runtime.execute(runtimeInput)
    ).resolves.toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'synthetic failure'
    })

    const throwing = tool({
      execute: async () => {
        throw new Error('synthetic throw')
      }
    })
    await expect(
      build({
        decision: {
          ...decision,
          toolInvocation: { ...decision.toolInvocation!, toolId: throwing.id }
        },
        tools: registry(throwing)
      }).runtime.execute(
        input({ agent: phase3AgentProfile({ tools: [throwing.id] }) })
      )
    ).resolves.toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'synthetic throw'
    })
  })

  it('degrades honestly when audit or telemetry sinks fail', async () => {
    const audit: AuditSink = {
      append: async () => {
        throw new Error('audit unavailable')
      }
    }
    const telemetry: TelemetrySink = {
      record: () => {
        throw new Error('telemetry unavailable')
      }
    }
    const { runtime } = build({
      decision: { action: 'RESPOND', response: 'direct' },
      audit,
      telemetry
    })
    await expect(runtime.execute(input())).resolves.toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      response: expect.stringContaining('audit recording failed')
    })
  })

  it('fails closed when planning, model, policy, approval, or audit deadlines expire', async () => {
    const never = <T>(): Promise<T> => new Promise<T>(() => undefined)
    const auditDeadline: AuditSink = {
      append: () => never<void>()
    }

    await expect(
      build({
        decision: { action: 'RESPOND' },
        orchestrator: { decideNextStep: () => never() },
        audit: auditDeadline
      }).runtime.execute(
        input({ budget: { ...input().budget, maxDurationMs: 10 } })
      )
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })

    await expect(
      build({
        decision: { action: 'RESPOND' },
        modelGateway: { complete: () => never() },
        audit: auditDeadline
      }).runtime.execute(
        input({ budget: { ...input().budget, maxDurationMs: 10 } })
      )
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })

    const runtimeTool = tool()
    const toolDecision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: runtimeTool.id,
        input: {},
        operationKey: 'deadline-policy'
      }
    }
    await expect(
      build({
        decision: toolDecision,
        tools: registry(runtimeTool),
        policy: { evaluate: () => never() },
        audit: auditDeadline
      }).runtime.execute(
        input({
          agent: phase3AgentProfile({ tools: [runtimeTool.id] }),
          budget: { ...input().budget, maxDurationMs: 10 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })

    await expect(
      build({
        decision: toolDecision,
        tools: registry(tool({ requiresApproval: true })),
        policy: {
          evaluate: async () => ({
            outcome: 'ALLOW' as const,
            reason: 'synthetic allow',
            policyVersion: 'policy-v1'
          })
        },
        approvals: { request: () => never() },
        audit: auditDeadline
      }).runtime.execute(
        input({
          agent: phase3AgentProfile({ tools: [runtimeTool.id] }),
          budget: { ...input().budget, maxDurationMs: 10 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })

    await expect(
      build({
        decision: { action: 'RESPOND', response: 'direct' },
        audit: auditDeadline
      }).runtime.execute(
        input({ budget: { ...input().budget, maxDurationMs: 10 } })
      )
    ).resolves.toMatchObject({
      stopReason: 'INSUFFICIENT_EVIDENCE',
      response: expect.stringContaining('audit recording failed')
    })
  })

  it('handles unsupported and denied approval decisions before any tool effect', async () => {
    const approvedTool = tool({ requiresApproval: true })
    const decision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: approvedTool.id,
        input: {},
        operationKey: 'approval-state'
      }
    }
    const baseInput = input({
      agent: phase3AgentProfile({ tools: [approvedTool.id] })
    })

    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: {
          request: async () => ({ status: 'DENIED', reason: 'denied' })
        }
      }).runtime.execute(baseInput)
    ).resolves.toMatchObject({
      stopReason: 'POLICY_DENIED',
      response: 'denied'
    })

    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: {
          request: async () =>
            ({ status: 'UNSUPPORTED', reason: 'unsupported' }) as never
        }
      }).runtime.execute(baseInput)
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
  })

  it('reconciles approved tool executions on failure, throws, and confirmation failure', async () => {
    const approvedTool = tool({ requiresApproval: true })
    const decision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: approvedTool.id,
        input: {},
        operationKey: 'approval-execution'
      }
    }
    const events: string[] = []
    const execution: ApprovalExecutionPort = {
      begin: async () => {
        events.push('begin')
        return {
          approvalId: 'approval-execution' as never,
          reservationId: 'reservation-1'
        }
      },
      complete: async () => {
        events.push('complete')
      },
      fail: async () => {
        events.push('fail')
      },
      uncertain: async () => {
        events.push('uncertain')
      }
    }
    const approvals: ApprovalEngine = {
      request: async () => ({
        status: 'APPROVED',
        approvalId: 'approval-execution' as never,
        reason: 'approved'
      }),
      execution
    }
    const approvedInput = input({
      agent: phase3AgentProfile({ tools: [approvedTool.id] })
    })

    await expect(
      build({
        decision,
        tools: registry(
          tool({
            ...approvedTool,
            execute: async () => ({ status: 'FAILED', error: 'failed effect' })
          })
        ),
        approvals
      }).runtime.execute(approvedInput)
    ).resolves.toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: 'failed effect'
    })
    expect(events).toEqual(['begin', 'fail'])

    events.length = 0
    await expect(
      build({
        decision,
        tools: registry(
          tool({
            ...approvedTool,
            execute: async () => {
              throw new Error('thrown effect')
            }
          })
        ),
        approvals
      }).runtime.execute(approvedInput)
    ).resolves.toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('unknown_effect')
    })
    expect(events).toEqual(['begin', 'uncertain'])

    events.length = 0
    const confirmationFailure: ApprovalExecutionPort = {
      ...execution,
      complete: async () => {
        events.push('complete')
        throw new Error('confirmation failed')
      }
    }
    await expect(
      build({
        decision,
        tools: registry(approvedTool),
        approvals: { ...approvals, execution: confirmationFailure }
      }).runtime.execute(approvedInput)
    ).resolves.toMatchObject({
      stopReason: 'TOOL_FAILURE',
      response: expect.stringContaining('approval confirmation failed')
    })
    expect(events).toEqual(['begin', 'complete'])
  })

  it('serializes non-string tool results and rejects a tool deadline after approval', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const plainTool = tool({
      execute: async () => ({ status: 'SUCCEEDED', output: circular })
    })
    const plainDecision: OrchestratorDecision = {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: plainTool.id,
        input: {},
        operationKey: 'circular-output'
      }
    }
    await expect(
      build({
        decision: plainDecision,
        tools: registry(plainTool)
      }).runtime.execute(
        input({ agent: phase3AgentProfile({ tools: [plainTool.id] }) })
      )
    ).resolves.toMatchObject({
      stopReason: 'COMPLETED',
      response: '[object Object]'
    })

    const slowTool = tool({
      requiresApproval: true,
      execute: () => new Promise(() => undefined)
    })
    const approvalEvents: string[] = []
    const auditDeadline: AuditSink = {
      append: () => new Promise<void>(() => undefined)
    }
    const approvalExecution: ApprovalExecutionPort = {
      begin: async () => ({
        approvalId: 'approval-deadline' as never,
        reservationId: 'reservation-deadline'
      }),
      complete: async () => undefined,
      fail: async () => undefined,
      uncertain: async () => {
        approvalEvents.push('uncertain')
      }
    }
    await expect(
      build({
        decision: {
          action: 'CALL_TOOL',
          toolInvocation: {
            toolId: slowTool.id,
            input: {},
            operationKey: 'tool-deadline'
          }
        },
        tools: registry(slowTool),
        approvals: {
          request: async () => ({
            status: 'APPROVED',
            approvalId: 'approval-deadline' as never,
            reason: 'approved'
          }),
          execution: approvalExecution
        },
        audit: auditDeadline
      }).runtime.execute(
        input({
          agent: phase3AgentProfile({ tools: [slowTool.id] }),
          budget: { ...input().budget, maxDurationMs: 10 }
        })
      )
    ).resolves.toMatchObject({ stopReason: 'INSUFFICIENT_EVIDENCE' })
    expect(approvalEvents).toEqual(['uncertain'])
  })
})
