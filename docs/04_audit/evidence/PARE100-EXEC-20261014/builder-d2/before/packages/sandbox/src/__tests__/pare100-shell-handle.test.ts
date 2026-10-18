import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SandboxHandle,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import { createShellTool, type ShellRunRequest } from '../shell-tool.ts'

const dirs: string[] = []
function workspace() {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-pare100-d-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
function context(sandboxHandle?: SandboxHandle): ToolExecutionContext {
  return {
    tenantId: 'synthetic-tenant' as never,
    agentId: 'synthetic-agent' as never,
    correlationId: 'synthetic-corr' as never,
    traceId: 'synthetic-trace' as never,
    ...(sandboxHandle ? { sandboxHandle } : {})
  }
}
function probe(root: string) {
  const calls: ShellRunRequest[] = []
  const tool = createShellTool({
    workspaceRoot: root,
    limits: { maxTimeoutMs: 100, defaultTimeoutMs: 200 },
    run: async (request) => {
      calls.push(request)
      return { exitCode: 0, stdout: '', stderr: '', truncated: false }
    }
  })
  return { tool, calls }
}
function grant(root: string): SandboxHandle {
  return Object.freeze({
    mode: 'PROCESS',
    workspaceRoot: root,
    allowNetwork: false,
    allowSubprocess: true,
    deadlineMs: 40
  })
}
const input = {
  argv: ['synthetic-command'],
  intent: 'synthetic only',
  sandboxHandle: {
    mode: 'PROCESS',
    workspaceRoot: '/',
    allowNetwork: true,
    allowSubprocess: true
  }
}

describe('SPEC0212 CTL-W03 shell handle consumption', () => {
  it('direct execution without governed handle rejects before runner, including forged JSON', async () => {
    const { tool, calls } = probe(workspace())
    expect((await tool.execute(input, context())).status).toBe('REJECTED')
    expect(calls).toHaveLength(0)
  })
  it.each([
    { mode: 'WORKSPACE' },
    { allowSubprocess: false },
    { allowNetwork: 'false' },
    { workspaceRoot: undefined },
    { workspaceRoot: 'relative' },
    { deadlineMs: 0 },
    { deadlineMs: Infinity }
  ])('rejects incompatible grant %j', async (override) => {
    const root = workspace()
    const { tool, calls } = probe(root)
    expect(
      (
        await tool.execute(
          input,
          context({ ...grant(root), ...override } as SandboxHandle)
        )
      ).status
    ).toBe('REJECTED')
    expect(calls).toHaveLength(0)
  })
  it('runner consumes original gate grants and timeout never exceeds handle or host limit', async () => {
    const root = workspace()
    const { tool, calls } = probe(root)
    const handle = grant(root)
    expect(
      (await tool.execute({ ...input, timeoutMs: 9999 }, context(handle)))
        .status
    ).toBe('SUCCEEDED')
    expect(calls[0]).toMatchObject({ handle, cwd: root, timeoutMs: 40 })
    await tool.execute({ ...input, timeoutMs: 10 }, context(handle))
    expect(calls[1]?.timeoutMs).toBe(10)
    await tool.execute(input, context({ ...handle, deadlineMs: 1000 }))
    expect(calls[2]?.timeoutMs).toBe(100)
  })
  it('rejects configured root outside granted workspace even when cwd targets grant', async () => {
    const root = workspace()
    mkdirSync(join(root, 'granted'))
    const { tool, calls } = probe(root)
    expect(
      (
        await tool.execute(
          { ...input, cwd: 'granted' },
          context(grant(join(root, 'granted')))
        )
      ).status
    ).toBe('REJECTED')
    expect(calls).toHaveLength(0)
  })
  it('checks gate root using realpath rather than trusting symlink spelling', async () => {
    const root = workspace()
    const outside = workspace()
    symlinkSync(outside, join(root, 'gate-link'))
    const { tool, calls } = probe(root)
    expect(
      (await tool.execute(input, context(grant(join(root, 'gate-link')))))
        .status
    ).toBe('REJECTED')
    expect(calls).toHaveLength(0)
  })
})
