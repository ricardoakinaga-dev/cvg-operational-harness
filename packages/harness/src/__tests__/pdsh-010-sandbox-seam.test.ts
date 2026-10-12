import { describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  Orchestrator,
  OrchestratorDecision,
  PolicyEngine,
  RuntimeInput,
  SandboxGate,
  SandboxMode,
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

let executed = 0

function tool(
  overrides: Partial<ToolDefinition> & {
    readonly sandbox?: SandboxMode
  } = {}
): ToolDefinition {
  const { sandbox = 'WORKSPACE', ...rest } = overrides
  return {
    id: 'synthetic.sandbox.tool',
    version: 'v1',
    description: 'Synthetic sandbox tool',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    risk: 'LOW',
    sideEffect: 'WRITE',
    sandbox,
    idempotent: false,
    requiresApproval: false,
    execute: async () => {
      executed += 1
      return { status: 'SUCCEEDED', output: { ok: true } }
    },
    ...rest
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

const allowGate: SandboxGate = {
  evaluate: async (input) => ({
    kind: 'allowed',
    mode: input.policy?.requiredMode ?? 'WORKSPACE',
    handle: {
      mode: input.policy?.requiredMode ?? 'WORKSPACE',
      allowNetwork: false,
      allowSubprocess: false
    }
  })
}

const unavailableGate: SandboxGate = {
  evaluate: async () => ({
    kind: 'unavailable',
    reason: 'containment backend is not provisioned'
  })
}

const deniedGate: SandboxGate = {
  evaluate: async () => ({
    kind: 'denied',
    reason: 'workspace write path is blocked'
  })
}

const throwingGate: SandboxGate = {
  evaluate: async () => {
    throw new Error('synthetic sandbox outage')
  }
}

function build(options: {
  readonly decision: OrchestratorDecision
  readonly tools: ToolRegistry
  readonly sandbox?: SandboxGate
  readonly policy?: PolicyEngine
}): SinglePassGovernedRuntime {
  return new SinglePassGovernedRuntime({
    orchestrator: orchestrator(options.decision),
    modelGateway: defaultModel,
    policy: options.policy ?? new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: options.tools,
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    ...(options.sandbox ? { sandbox: options.sandbox } : {})
  })
}

function input(
  toolId: string,
  overrides: Partial<RuntimeInput> = {}
): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [toolId] }),
    runtimeProfile: 'single_pass',
    ...overrides
  })
}

function callDecision(toolId: string): OrchestratorDecision {
  return {
    action: 'CALL_TOOL',
    toolInvocation: {
      toolId,
      input: { value: 'synthetic' },
      operationKey: `sandbox-${toolId}`
    }
  }
}

describe('PDSH-010 sandbox seam (SPEC 0195)', () => {
  it('fails closed when a contained tool runs with no sandbox gate configured', async () => {
    const runtimeTool = tool()
    executed = 0
    const runtime = build({
      decision: callDecision(runtimeTool.id),
      tools: registry(runtimeTool)
    })
    await expect(runtime.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('no sandbox gate is configured')
      }
    )
    expect(executed).toBe(0)
  })

  it('fails closed when the gate reports the required mode unavailable', async () => {
    const runtimeTool = tool()
    executed = 0
    const runtime = build({
      decision: callDecision(runtimeTool.id),
      tools: registry(runtimeTool),
      sandbox: unavailableGate
    })
    await expect(runtime.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('unavailable')
      }
    )
    expect(executed).toBe(0)
  })

  it('fails closed when the gate denies', async () => {
    const runtimeTool = tool()
    executed = 0
    const runtime = build({
      decision: callDecision(runtimeTool.id),
      tools: registry(runtimeTool),
      sandbox: deniedGate
    })
    await expect(runtime.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('denied')
      }
    )
    expect(executed).toBe(0)
  })

  it('fails closed when the gate throws', async () => {
    const runtimeTool = tool()
    executed = 0
    const runtime = build({
      decision: callDecision(runtimeTool.id),
      tools: registry(runtimeTool),
      sandbox: throwingGate
    })
    await expect(runtime.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('Sandbox gate failed')
      }
    )
    expect(executed).toBe(0)
  })

  it('allows a contained tool once the gate grants a handle', async () => {
    const runtimeTool = tool()
    executed = 0
    const runtime = build({
      decision: callDecision(runtimeTool.id),
      tools: registry(runtimeTool),
      sandbox: allowGate
    })
    await expect(runtime.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'COMPLETED'
      }
    )
    expect(executed).toBe(1)
  })

  it('skips the gate entirely for a pure (mode NONE) capability', async () => {
    const pureTool = tool({
      sideEffect: 'NONE',
      sandbox: 'NONE',
      id: 'synthetic.pure.tool'
    })
    executed = 0
    const runtime = build({
      decision: callDecision(pureTool.id),
      tools: registry(pureTool)
    })
    await expect(runtime.execute(input(pureTool.id))).resolves.toMatchObject({
      stopReason: 'COMPLETED'
    })
    expect(executed).toBe(1)
  })

  it('requires EGRESS containment for a tool that declares it', async () => {
    const externalTool = tool({
      sideEffect: 'EXTERNAL',
      sandbox: 'EGRESS',
      id: 'synthetic.ext.tool'
    })
    executed = 0
    const seenModes: string[] = []
    const gate: SandboxGate = {
      evaluate: async (evaluation) => {
        seenModes.push(evaluation.policy?.requiredMode ?? 'NONE')
        return {
          kind: 'denied',
          reason: 'egress is never granted in this guard'
        }
      }
    }
    const runtime = build({
      decision: callDecision(externalTool.id),
      tools: registry(externalTool),
      sandbox: gate
    })
    await expect(
      runtime.execute(input(externalTool.id))
    ).resolves.toMatchObject({ stopReason: 'UNSAFE_REQUEST' })
    expect(seenModes).toEqual(['EGRESS'])
    expect(executed).toBe(0)
  })
})
