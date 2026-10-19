import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ModelGateway,
  RuntimeInput,
  ToolDefinition,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  createLocalSandboxGate,
  createShellTool,
  hostProbe
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

const tempDirs: string[] = []

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-shell-int-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

function registry(tools: readonly ToolDefinition[]): ToolRegistry {
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

function harnessFor(
  root: string,
  approvals: InMemoryApprovalEngine,
  options: { readonly withSandbox?: boolean; readonly runner?: unknown } = {}
): ReturnType<typeof createOperationalHarness> {
  const tool = createShellTool({
    workspaceRoot: root,
    ...(options.runner !== undefined ? { run: options.runner as never } : {})
  })
  return createOperationalHarness({
    modelGateway: defaultModel,
    policy: new ScriptedPolicyEngine(),
    approvals,
    tools: registry([tool]),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    orchestrator: {
      decideNextStep: async ({ runtime }) => ({
        action: 'CALL_TOOL' as const,
        toolInvocation: runtime.requestedTool ?? {
          toolId: 'shell.run',
          input: {},
          operationKey: 'pdsh-013-shell.run'
        }
      })
    },
    ...(options.withSandbox !== false
      ? {
          sandbox: createLocalSandboxGate({
            capabilities: {
              bubblewrap: true,
              landlock: true,
              mode: 'PROCESS',
              partial: []
            },
            workspaceBase: root
          })
        }
      : {})
  })
}

function input(toolInput: unknown): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: ['shell.run'] }),
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId: 'shell.run',
      input: toolInput,
      operationKey: 'pdsh-013-shell.run'
    }
  })
}

const bwrapWorks = hostProbe.probeBubblewrap()

describe('PDSH-013 shell tool in the operational harness (SPEC 0198 §2)', () => {
  it('stops with APPROVAL_REQUIRED when the approval is pending', async () => {
    const root = tempWorkspace()
    const approvals = new InMemoryApprovalEngine()
    const harness = harnessFor(root, approvals, {
      runner: async () => ({
        exitCode: 0,
        stdout: 'não deveria rodar',
        stderr: '',
        truncated: false
      })
    })
    const result = await harness.execute(
      input({ argv: ['echo', 'x'], intent: 'aguardando approval' })
    )
    expect(result.stopReason).toBe('APPROVAL_REQUIRED')
    expect(approvals.requests).toHaveLength(1)
    expect(approvals.requests[0]?.toolId).toBe('shell.run')
  })

  it('fails closed with UNSAFE_REQUEST when no sandbox gate is configured', async () => {
    const root = tempWorkspace()
    const approvals = new InMemoryApprovalEngine()
    approvals.approveOnRequest = true
    const harness = harnessFor(root, approvals, {
      withSandbox: false,
      runner: async () => ({
        exitCode: 0,
        stdout: 'não deveria rodar',
        stderr: '',
        truncated: false
      })
    })
    const result = await harness.execute(
      input({ argv: ['echo', 'x'], intent: 'sem gate' })
    )
    expect(result.stopReason).toBe('UNSAFE_REQUEST')
  })

  it.skipIf(!bwrapWorks)(
    'executes an approved command inside the workspace sandbox',
    async () => {
      const root = tempWorkspace()
      const approvals = new InMemoryApprovalEngine()
      approvals.approveOnRequest = true
      const harness = harnessFor(root, approvals)
      const result = await harness.execute(
        input({
          argv: ['/bin/echo', 'sintetico'],
          intent: 'fumaça de integração com approval'
        })
      )
      expect(result.stopReason).toBe('COMPLETED')
      expect(result.response).toContain('sintetico')
    }
  )

  it('rejects a command string through the governed pipeline (no interpolation)', async () => {
    const root = tempWorkspace()
    const approvals = new InMemoryApprovalEngine()
    approvals.approveOnRequest = true
    const harness = harnessFor(root, approvals, {
      runner: async () => ({
        exitCode: 0,
        stdout: 'não deveria rodar',
        stderr: '',
        truncated: false
      })
    })
    const result = await harness.execute(
      input({ command: 'echo pwned', intent: 'interpolação negada' })
    )
    expect(result.stopReason).toBe('TOOL_FAILURE')
  })
})
