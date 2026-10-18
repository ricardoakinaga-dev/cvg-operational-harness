import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
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
  createFsTools,
  createLocalSandboxGate,
  type FsWriteJournalEntry
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
const journalEntries: FsWriteJournalEntry[] = []

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-fs-int-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  journalEntries.length = 0
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
  toolId: string,
  options: { readonly withSandbox?: boolean } = {}
): ReturnType<typeof createOperationalHarness> {
  const tools = createFsTools({
    workspaceRoot: root,
    writeJournal: {
      record: async (entry) => {
        journalEntries.push(entry)
      }
    }
  })
  return createOperationalHarness({
    modelGateway: defaultModel,
    policy: new ScriptedPolicyEngine(),
    approvals: new InMemoryApprovalEngine(),
    tools: registry(tools),
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    orchestrator: {
      decideNextStep: async ({ runtime }) => ({
        action: 'CALL_TOOL' as const,
        toolInvocation: runtime.requestedTool ?? {
          toolId,
          input: {},
          operationKey: `pdsh-012-${toolId}`
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

function input(toolId: string, toolInput: unknown): RuntimeInput {
  return phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [toolId] }),
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId,
      input: toolInput,
      operationKey: `pdsh-012-${toolId}`
    }
  })
}

describe('PDSH-012 fs tools in the operational harness (SPEC 0197 §6)', () => {
  it('reads a workspace file through the governed pipeline', async () => {
    const root = tempWorkspace()
    writeFileSync(join(root, 'laudo.txt'), 'laudo sintetico', 'utf8')
    const harness = harnessFor(root, 'fs.read')
    const result = await harness.execute(
      input('fs.read', { path: 'laudo.txt' })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(result.response).toContain('laudo sintetico')
  })

  it('writes with intent, journals the attempt and the effect is visible on disk', async () => {
    const root = tempWorkspace()
    const harness = harnessFor(root, 'fs.write')
    const result = await harness.execute(
      input('fs.write', {
        path: 'saida.txt',
        content: 'conteudo sintetico',
        intent: 'gravar saida do turno sintetico'
      })
    )
    expect(result.stopReason).toBe('COMPLETED')
    expect(readFileSync(join(root, 'saida.txt'), 'utf8')).toBe(
      'conteudo sintetico'
    )
    expect(journalEntries).toEqual([
      expect.objectContaining({
        toolId: 'fs.write',
        path: 'saida.txt',
        intent: 'gravar saida do turno sintetico',
        action: 'write'
      })
    ])
  })

  it('rejects a write without intent — no mutation, turn still governed', async () => {
    const root = tempWorkspace()
    const harness = harnessFor(root, 'fs.write')
    const result = await harness.execute(
      input('fs.write', {
        path: 'nao-grava.txt',
        content: 'x'
      })
    )
    // A REJECTED tool result is a governed failure (TOOL_FAILURE), not a
    // silent success and not a kernel stop.
    expect(result.stopReason).toBe('TOOL_FAILURE')
    expect(journalEntries).toHaveLength(0)
    expect(existsSync(join(root, 'nao-grava.txt'))).toBe(false)
  })

  it('fails closed with UNSAFE_REQUEST when no sandbox gate is configured', async () => {
    const root = tempWorkspace()
    const harness = harnessFor(root, 'fs.read', { withSandbox: false })
    const result = await harness.execute(input('fs.read', { path: 'x.txt' }))
    expect(result.stopReason).toBe('UNSAFE_REQUEST')
  })
})
