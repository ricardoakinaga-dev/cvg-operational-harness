import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  RuntimeInput,
  SandboxGate,
  SandboxMode,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  createLocalSandboxGate,
  type SandboxCapabilities,
  type SandboxJournalEntry
} from '@cvg/sandbox'
import { createOperationalHarness } from '../createOperationalHarness.ts'
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
const journal: SandboxJournalEntry[] = []

function tool(
  overrides: Partial<ToolDefinition> & { readonly sandbox?: SandboxMode } = {}
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

const platformCapabilities = (
  over: Partial<SandboxCapabilities> = {}
): SandboxCapabilities => ({
  bubblewrap: true,
  landlock: true,
  mode: 'PROCESS',
  partial: [],
  ...over
})

const tempDirs: string[] = []
function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-harness-sandbox-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  executed = 0
  journal.length = 0
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

function input(toolId: string): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [toolId] }),
    runtimeProfile: 'single_pass'
  })
}

function buildHarness(
  runtimeTool: ToolDefinition,
  gate?: SandboxGate
): ReturnType<typeof createOperationalHarness> {
  return createOperationalHarness({
    modelGateway: defaultModel,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: registry(runtimeTool),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    orchestrator: {
      decideNextStep: async () => ({
        action: 'CALL_TOOL' as const,
        toolInvocation: {
          toolId: runtimeTool.id,
          input: { value: 'synthetic' },
          operationKey: `pdsh-011-${runtimeTool.id}`
        }
      })
    },
    ...(gate ? { sandbox: gate } : {})
  })
}

describe('PDSH-011 gate composition into the operational harness (SPEC 0196 §6)', () => {
  it('runs a WORKSPACE tool once the local gate grants a handle', async () => {
    const runtimeTool = tool({ sandbox: 'WORKSPACE' })
    const harness = buildHarness(
      runtimeTool,
      createLocalSandboxGate({
        capabilities: platformCapabilities(),
        workspaceBase: tempWorkspace(),
        journal: (entry) => journal.push(entry)
      })
    )
    await expect(harness.execute(input(runtimeTool.id))).resolves.toMatchObject(
      { stopReason: 'COMPLETED' }
    )
    expect(executed).toBe(1)
    expect(journal).toEqual([
      expect.objectContaining({
        toolId: runtimeTool.id,
        mode: 'WORKSPACE',
        outcome: 'allowed'
      })
    ])
  })

  it('fails closed for a PROCESS tool when bubblewrap is missing (no downgrade)', async () => {
    const runtimeTool = tool({ sandbox: 'PROCESS' })
    const harness = buildHarness(
      runtimeTool,
      createLocalSandboxGate({
        capabilities: platformCapabilities({
          bubblewrap: false,
          mode: 'WORKSPACE',
          reason: 'bubblewrap ausente; PROCESS indisponível'
        }),
        workspaceBase: tempWorkspace()
      })
    )
    await expect(harness.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('unavailable')
      }
    )
    expect(executed).toBe(0)
  })

  it('never grants EGRESS through the local gate (PDSH-016 scope)', async () => {
    const runtimeTool = tool({ sandbox: 'EGRESS', sideEffect: 'EXTERNAL' })
    const harness = buildHarness(
      runtimeTool,
      createLocalSandboxGate({
        capabilities: platformCapabilities(),
        workspaceBase: tempWorkspace()
      })
    )
    await expect(harness.execute(input(runtimeTool.id))).resolves.toMatchObject(
      { stopReason: 'UNSAFE_REQUEST' }
    )
    expect(executed).toBe(0)
  })

  it('still fails closed for contained tools when no gate is configured', async () => {
    const runtimeTool = tool({ sandbox: 'WORKSPACE' })
    const harness = buildHarness(runtimeTool)
    await expect(harness.execute(input(runtimeTool.id))).resolves.toMatchObject(
      {
        stopReason: 'UNSAFE_REQUEST',
        response: expect.stringContaining('no sandbox gate is configured')
      }
    )
    expect(executed).toBe(0)
  })
})
