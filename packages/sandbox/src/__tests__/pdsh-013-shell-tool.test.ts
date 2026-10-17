import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createShellTool,
  hostProbe,
  type ShellLimits,
  type ShellRunRequest,
  type ShellRunResult
} from '../index.ts'

const tempDirs: string[] = []

function tempWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-shell-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

interface RunnerProbe {
  readonly tool: ReturnType<typeof createShellTool>
  readonly calls: ShellRunRequest[]
}

function probeTool(
  root: string,
  result: ShellRunResult,
  limits?: Partial<ShellLimits>
): RunnerProbe {
  const calls: ShellRunRequest[] = []
  const tool = createShellTool({
    workspaceRoot: root,
    ...(limits !== undefined ? { limits } : {}),
    run: async (request) => {
      calls.push(request)
      return result
    }
  })
  return { tool, calls }
}

const okRun: ShellRunResult = {
  exitCode: 0,
  stdout: 'ok\n',
  stderr: '',
  truncated: false
}

function context(root: string) {
  return {
    tenantId: 'tenant_00000000-0000-4000-8000-000000000001' as never,
    agentId: 'agent_00000000-0000-4000-8000-000000000001' as never,
    correlationId: 'corr_1' as never,
    traceId: 'trace_1' as never,
    operationKey: 'pdsh-013-shell.run',
    sandboxHandle: Object.freeze({
      mode: 'PROCESS' as const,
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true
    })
  }
}

describe('PDSH-013 shell tool boot (SPEC 0198 §1)', () => {
  it('fails closed when workspaceRoot is not an existing directory', () => {
    expect(() =>
      createShellTool({ workspaceRoot: join(tmpdir(), 'no-such-root-xyz') })
    ).toThrow(/workspaceRoot/)
  })

  it('fails closed when workspaceRoot is relative', () => {
    expect(() => createShellTool({ workspaceRoot: 'relative/path' })).toThrow(
      /workspaceRoot/
    )
  })
})

describe('PDSH-013 shell input validation (SPEC 0198 §3)', () => {
  it('rejects string-command fields — no interpolation path exists', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, okRun)
    for (const key of ['command', 'cmd', 'shell']) {
      const result = await tool.execute(
        { [key]: 'echo pwned', intent: 'x' },
        context(root)
      )
      expect(result.status).toBe('REJECTED')
      expect(result.error).toMatch(/string commands/)
    }
  })

  it('rejects malformed argv (missing, empty, non-string, empty element, NUL)', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, okRun)
    const bad: unknown[] = [
      undefined,
      'echo hi',
      [],
      [42],
      [''],
      ['echo\0hi'],
      [null]
    ]
    for (const argv of bad) {
      const result = await tool.execute({ argv, intent: 'x' }, context(root))
      expect(result.status, JSON.stringify(argv)).toBe('REJECTED')
    }
  })

  it('rejects argv over the count/length/total-byte limits', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, okRun, {
      maxArgs: 2,
      maxArgLength: 4,
      maxTotalArgBytes: 7
    })
    expect(
      (
        await tool.execute(
          { argv: ['a', 'b', 'c'], intent: 'x' },
          context(root)
        )
      ).status
    ).toBe('REJECTED')
    expect(
      (await tool.execute({ argv: ['abcde'], intent: 'x' }, context(root)))
        .status
    ).toBe('REJECTED')
    expect(
      (
        await tool.execute(
          { argv: ['abcd', 'efgh'], intent: 'x' },
          context(root)
        )
      ).status
    ).toBe('REJECTED')
  })

  it('rejects a missing or oversized intent before any spawn', async () => {
    const root = tempWorkspace()
    const { tool, calls } = probeTool(root, okRun, {
      maxIntentLength: 5
    })
    for (const intent of [undefined, '   ', 'abcdefg']) {
      const result = await tool.execute(
        { argv: ['true'], intent },
        context(root)
      )
      expect(result.status, String(intent)).toBe('REJECTED')
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects cwd that escapes the workspace (absolute, .., symlink out)', async () => {
    const root = tempWorkspace()
    const outside = tempWorkspace()
    symlinkSync(outside, join(root, 'escape-link'))
    const { tool, calls } = probeTool(root, okRun)
    for (const cwd of ['..', '../..', '/etc', 'escape-link']) {
      const result = await tool.execute(
        { argv: ['true'], cwd, intent: 'x' },
        context(root)
      )
      expect(result.status, cwd).toBe('REJECTED')
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects a cwd that does not exist or is not a directory', async () => {
    const root = tempWorkspace()
    mkdirSync(join(root, 'dir'))
    const { tool } = probeTool(root, okRun)
    expect(
      (
        await tool.execute(
          { argv: ['true'], cwd: 'missing-dir', intent: 'x' },
          context(root)
        )
      ).status
    ).toBe('REJECTED')
    // A file used as cwd: create one via fs tool-free helper.
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(root, 'arquivo.txt'), 'x', 'utf8')
    expect(
      (
        await tool.execute(
          { argv: ['true'], cwd: 'arquivo.txt', intent: 'x' },
          context(root)
        )
      ).status
    ).toBe('REJECTED')
  })

  it('rejects oversized stdin', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, okRun, { maxStdinBytes: 4 })
    const result = await tool.execute(
      { argv: ['true'], stdin: '12345', intent: 'x' },
      context(root)
    )
    expect(result.status).toBe('REJECTED')
  })
})

describe('PDSH-013 shell execution mapping (SPEC 0198 §4)', () => {
  it('passes a confined cwd, clamped timeout and pure argv to the runner', async () => {
    const root = tempWorkspace()
    mkdirSync(join(root, 'sub'))
    const { tool, calls } = probeTool(root, okRun, {
      defaultTimeoutMs: 1000,
      maxTimeoutMs: 2000
    })
    const result = await tool.execute(
      {
        argv: ['echo', 'sintetico'],
        cwd: 'sub',
        timeoutMs: 99_999,
        stdin: 'dados',
        intent: 'executar comando sintetico'
      },
      context(root)
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.argv).toEqual(['echo', 'sintetico'])
    expect(calls[0]?.cwd).toBe(join(root, 'sub'))
    expect(calls[0]?.timeoutMs).toBe(2000)
    expect(calls[0]?.stdin).toBe('dados')
  })

  it('clamps an invalid timeout to the default', async () => {
    const root = tempWorkspace()
    const { tool, calls } = probeTool(root, okRun, { defaultTimeoutMs: 500 })
    await tool.execute(
      { argv: ['true'], timeoutMs: -5, intent: 'x' },
      context(root)
    )
    expect(calls[0]?.timeoutMs).toBe(500)
  })

  it('surfaces a non-zero exit code as SUCCEEDED (consumer interprets)', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, {
      exitCode: 1,
      stdout: '',
      stderr: 'no match',
      truncated: false
    })
    const result = await tool.execute(
      { argv: ['grep', 'x'], intent: 'x' },
      context(root)
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(result.output).toMatchObject({ exitCode: 1, stderr: 'no match' })
  })

  it('maps spawn_failed to FAILED (containment failure, never an exit code)', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, {
      exitCode: 'spawn_failed',
      stdout: '',
      stderr: 'bwrap: exec failed',
      truncated: false
    })
    const result = await tool.execute(
      { argv: ['true'], intent: 'x' },
      context(root)
    )
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/containment failed/)
  })

  it('maps timeout to FAILED with the effective budget', async () => {
    const root = tempWorkspace()
    const { tool } = probeTool(root, {
      exitCode: 'timeout',
      stdout: '',
      stderr: '',
      truncated: false
    })
    const result = await tool.execute(
      { argv: ['sleep', '99'], timeoutMs: 1000, intent: 'x' },
      context(root)
    )
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/timed out after 1000ms/)
  })

  it('maps a throwing runner to FAILED', async () => {
    const root = tempWorkspace()
    const tool = createShellTool({
      workspaceRoot: root,
      run: async () => {
        throw new Error('runner exploded')
      }
    })
    const result = await tool.execute(
      { argv: ['true'], intent: 'x' },
      context(root)
    )
    expect(result.status).toBe('FAILED')
    expect(result.error).toMatch(/runner exploded/)
  })
})

describe('PDSH-013 shell descriptor (SPEC 0198 §2)', () => {
  it('declares PROCESS containment and mandatory approval', () => {
    const tool = createShellTool({ workspaceRoot: tempWorkspace() })
    expect(tool.id).toBe('shell.run')
    expect(tool.sandbox).toBe('PROCESS')
    expect(tool.requiresApproval).toBe(true)
    expect(tool.risk).toBe('HIGH')
    expect(tool.sideEffect).toBe('WRITE')
    expect(tool.idempotent).toBe(false)
  })
})

describe('PDSH-013 shell default runner (SPEC 0198 §1, host smoke)', () => {
  const bwrapWorks = hostProbe.probeBubblewrap()

  it.skipIf(!bwrapWorks)(
    'runs a command inside the namespace with workspace bind',
    async () => {
      const root = tempWorkspace()
      const tool = createShellTool({ workspaceRoot: root })
      const result = await tool.execute(
        { argv: ['/bin/echo', 'sintetico'], intent: 'fumaça do host' },
        context(root)
      )
      expect(result.status).toBe('SUCCEEDED')
      expect(result.output).toMatchObject({
        exitCode: 0,
        stdout: 'sintetico\n'
      })
    }
  )

  it.skipIf(!bwrapWorks)(
    'writes inside the workspace are visible outside the namespace',
    async () => {
      const root = tempWorkspace()
      const tool = createShellTool({ workspaceRoot: root })
      const result = await tool.execute(
        {
          argv: ['/bin/sh', '-c', 'echo sintetico > inside.txt'],
          intent: 'provar bind gravável do workspace'
        },
        context(root)
      )
      expect(result.status).toBe('SUCCEEDED')
      const { readFileSync } = await import('node:fs')
      expect(readFileSync(join(root, 'inside.txt'), 'utf8')).toBe('sintetico\n')
    }
  )
})
