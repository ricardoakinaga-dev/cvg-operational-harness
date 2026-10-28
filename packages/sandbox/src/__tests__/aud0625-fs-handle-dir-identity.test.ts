import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SandboxHandle,
  ToolExecutionContext
} from '@cvg/harness-contracts'
import { createFsTools, type FsWriteJournal } from '../index.ts'

// SPEC0270 (AUD0625 F03/F04). The first eight cases failed before the BUILD
// for the audited defect (red-output.txt in the evidence) and pass after it.
// Controls pass before and after the fix. Synthetic owned directories only.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

function base(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-aud0625-fs-'))
  dirs.push(dir)
  return dir
}

function workspaceHandle(workspaceRoot: string): SandboxHandle {
  return {
    mode: 'WORKSPACE',
    workspaceRoot,
    allowNetwork: false,
    allowSubprocess: false
  }
}

function context(sandboxHandle?: SandboxHandle): ToolExecutionContext {
  return {
    tenantId: 'synthetic-tenant' as never,
    agentId: 'synthetic-agent' as never,
    correlationId: 'synthetic-corr' as never,
    traceId: 'synthetic-trace' as never,
    operationKey: 'synthetic-op',
    ...(sandboxHandle ? { sandboxHandle } : {})
  }
}

function tool(
  workspaceRoot: string,
  id: string,
  writeJournal?: FsWriteJournal
) {
  const found = createFsTools({
    workspaceRoot,
    ...(writeJournal ? { writeJournal, requireWriteJournal: true } : {})
  }).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing tool ${id}`)
  return found
}

/** Journal that swaps `<root>/sub` for a symlink to `outside` while it runs. */
function swappingJournal(root: string, outside: string): FsWriteJournal {
  return {
    record: async () => {
      renameSync(join(root, 'sub'), join(root, 'original-sub'))
      symlinkSync(outside, join(root, 'sub'))
    }
  }
}

describe('AUD0625 F03: the handle bounds the fs tools root (SPEC0270 §3.1)', () => {
  it('rejects fs.read when the handle grants a different workspace', async () => {
    const dir = base()
    const a = join(dir, 'A')
    const b = join(dir, 'B')
    mkdirSync(a)
    mkdirSync(b)
    writeFileSync(join(b, 'sentinel.txt'), 'SYNTHETIC-B')
    const result = await tool(b, 'fs.read').execute(
      { path: 'sentinel.txt' },
      context(workspaceHandle(a))
    )
    expect(result.status).toBe('REJECTED')
  })

  for (const id of ['fs.read', 'fs.list', 'fs.write', 'fs.edit']) {
    it(`rejects ${id} without a governed handle`, async () => {
      const root = base()
      writeFileSync(join(root, 'file.txt'), 'SYNTHETIC')
      const result = await tool(root, id).execute(
        {
          path: id === 'fs.list' ? '.' : 'file.txt',
          content: 'SYNTHETIC-NEW',
          find: 'SYNTHETIC',
          replace: 'SYNTHETIC-EDIT',
          intent: 'synthetic probe'
        },
        context()
      )
      expect(result.status).toBe('REJECTED')
    })
  }

  it('control: a handle granting the configured root reads it', async () => {
    const root = base()
    writeFileSync(join(root, 'sentinel.txt'), 'SYNTHETIC-OK')
    const result = await tool(root, 'fs.read').execute(
      { path: 'sentinel.txt' },
      context(workspaceHandle(root))
    )
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      output: { content: 'SYNTHETIC-OK' }
    })
  })

  it('control: a handle granting an ancestor of the configured root reads it', async () => {
    const dir = base()
    const root = join(dir, 'tenant')
    mkdirSync(root)
    writeFileSync(join(root, 'sentinel.txt'), 'SYNTHETIC-OK')
    const result = await tool(root, 'fs.read').execute(
      { path: 'sentinel.txt' },
      context(workspaceHandle(dir))
    )
    expect(result.status).toBe('SUCCEEDED')
  })
})

describe('AUD0625 F04: operations keep the directory identity (SPEC0270 §3.2)', () => {
  for (const id of ['fs.write', 'fs.edit']) {
    it(`${id} fails closed when a directory is swapped during the journal`, async () => {
      const dir = base()
      const root = join(dir, 'workspace')
      const outside = join(dir, 'synthetic-outside')
      mkdirSync(root)
      mkdirSync(outside)
      mkdirSync(join(root, 'sub'))
      writeFileSync(join(root, 'sub', 'sentinel.txt'), 'SYNTHETIC-BEFORE')
      writeFileSync(join(outside, 'sentinel.txt'), 'SYNTHETIC-BEFORE')
      const result = await tool(
        root,
        id,
        swappingJournal(root, outside)
      ).execute(
        {
          path: 'sub/sentinel.txt',
          content: 'SYNTHETIC-ESCAPE',
          find: 'BEFORE',
          replace: 'ESCAPE',
          intent: 'synthetic swap probe'
        },
        context(workspaceHandle(root))
      )
      expect(result.status).toBe('FAILED')
      expect(readFileSync(join(outside, 'sentinel.txt'), 'utf8')).toBe(
        'SYNTHETIC-BEFORE'
      )
      expect(
        readdirSync(outside).filter((name) => name.startsWith('.cvg-fs-tmp-'))
      ).toEqual([])
    })
  }

  it('rejects a symlinked directory that stays inside the workspace', async () => {
    const root = base()
    mkdirSync(join(root, 'real'))
    writeFileSync(join(root, 'real', 'file.txt'), 'SYNTHETIC')
    symlinkSync(join(root, 'real'), join(root, 'alias'))
    const result = await tool(root, 'fs.read').execute(
      { path: 'alias/file.txt' },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('REJECTED')
  })

  it('control: an ordinary journaled write lands inside the root', async () => {
    const root = base()
    mkdirSync(join(root, 'sub'))
    const recorded: string[] = []
    const result = await tool(root, 'fs.write', {
      record: async (entry) => {
        recorded.push(entry.path)
      }
    }).execute(
      {
        path: 'sub/out.txt',
        content: 'SYNTHETIC-WRITE',
        intent: 'synthetic control'
      },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(recorded).toEqual([join('sub', 'out.txt')])
    expect(readFileSync(join(root, 'sub', 'out.txt'), 'utf8')).toBe(
      'SYNTHETIC-WRITE'
    )
  })

  it('control: a symlink pointing outside the root is refused', async () => {
    const dir = base()
    const root = join(dir, 'workspace')
    const outside = join(dir, 'synthetic-outside')
    mkdirSync(root)
    mkdirSync(outside)
    writeFileSync(join(outside, 'secret.txt'), 'SYNTHETIC-OUTSIDE')
    symlinkSync(outside, join(root, 'escape'))
    const result = await tool(root, 'fs.read').execute(
      { path: 'escape/secret.txt' },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('REJECTED')
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true)
  })
})

describe('AUD0625 SPEC0270 boundaries of the fix', () => {
  it('boot-fails closed where /proc/self/fd directory binding is unavailable', () => {
    const root = base()
    const original = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    try {
      expect(() => createFsTools({ workspaceRoot: root })).toThrow(
        /\/proc\/self\/fd/
      )
    } finally {
      if (original) Object.defineProperty(process, 'platform', original)
    }
  })

  it('rejects a final symlink that stays inside the workspace', async () => {
    const root = base()
    writeFileSync(join(root, 'real.txt'), 'SYNTHETIC')
    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'))
    const result = await tool(root, 'fs.read').execute(
      { path: 'alias.txt' },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('REJECTED')
  })

  it('accepts a PROCESS handle and refuses a NONE handle', async () => {
    const root = base()
    writeFileSync(join(root, 'file.txt'), 'SYNTHETIC')
    const read = tool(root, 'fs.read')
    const processHandle: SandboxHandle = {
      mode: 'PROCESS',
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true
    }
    const noneHandle: SandboxHandle = {
      mode: 'NONE',
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: false
    }
    expect(
      (await read.execute({ path: 'file.txt' }, context(processHandle))).status
    ).toBe('SUCCEEDED')
    expect(
      (await read.execute({ path: 'file.txt' }, context(noneHandle))).status
    ).toBe('REJECTED')
  })

  it('leaves no temp file behind after a successful write', async () => {
    const root = base()
    const result = await tool(root, 'fs.write').execute(
      { path: 'out.txt', content: 'SYNTHETIC', intent: 'synthetic control' },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(readdirSync(root)).toEqual(['out.txt'])
  })
})

describe('AUD0625 SPEC0270 review AUD0625-REVIEW-0270-D9 follow-ups', () => {
  it('fs.write refuses a final symlink inside the workspace and keeps both files', async () => {
    const root = base()
    writeFileSync(join(root, 'real.txt'), 'SYNTHETIC-REAL')
    symlinkSync(join(root, 'real.txt'), join(root, 'alias.txt'))
    const result = await tool(root, 'fs.write', {
      record: async () => {}
    }).execute(
      {
        path: 'alias.txt',
        content: 'SYNTHETIC-NEW',
        intent: 'synthetic probe'
      },
      context(workspaceHandle(root))
    )
    expect(result.status).toBe('REJECTED')
    expect(readFileSync(join(root, 'real.txt'), 'utf8')).toBe('SYNTHETIC-REAL')
    expect(lstatSync(join(root, 'alias.txt')).isSymbolicLink()).toBe(true)
  })

  it('rejects a grant whose path is only a sibling prefix of the root', async () => {
    const dir = base()
    const granted = join(dir, 'ws')
    const root = join(dir, 'ws2')
    mkdirSync(granted)
    mkdirSync(root)
    writeFileSync(join(root, 'file.txt'), 'SYNTHETIC')
    const result = await tool(root, 'fs.read').execute(
      { path: 'file.txt' },
      context(workspaceHandle(granted))
    )
    expect(result.status).toBe('REJECTED')
  })

  for (const [label, patch] of [
    ['a relative workspaceRoot', { workspaceRoot: 'relative/root' }],
    ['a NUL in workspaceRoot', { workspaceRoot: '/tmp/\0x' }],
    ['a non-boolean allowNetwork', { allowNetwork: 'no' }],
    ['a non-positive deadlineMs', { deadlineMs: 0 }]
  ] as const) {
    it(`rejects a handle with ${label}`, async () => {
      const root = base()
      writeFileSync(join(root, 'file.txt'), 'SYNTHETIC')
      const handle = {
        ...workspaceHandle(root),
        ...patch
      } as unknown as SandboxHandle
      const result = await tool(root, 'fs.read').execute(
        { path: 'file.txt' },
        context(handle)
      )
      expect(result.status).toBe('REJECTED')
    })
  }

  for (const id of ['fs.list', 'fs.write', 'fs.edit']) {
    it(`${id} rejects an intermediate symlink inside the workspace`, async () => {
      const root = base()
      mkdirSync(join(root, 'real'))
      writeFileSync(join(root, 'real', 'file.txt'), 'SYNTHETIC')
      symlinkSync(join(root, 'real'), join(root, 'alias'))
      const result = await tool(root, id, { record: async () => {} }).execute(
        {
          path: id === 'fs.list' ? 'alias' : 'alias/file.txt',
          content: 'SYNTHETIC-NEW',
          find: 'SYNTHETIC',
          replace: 'SYNTHETIC-EDIT',
          intent: 'synthetic probe'
        },
        context(workspaceHandle(root))
      )
      expect(result.status).toBe('REJECTED')
      expect(readFileSync(join(root, 'real', 'file.txt'), 'utf8')).toBe(
        'SYNTHETIC'
      )
    })
  }

  it('closes every descriptor on success and on error paths', async () => {
    const root = base()
    mkdirSync(join(root, 'sub'))
    writeFileSync(join(root, 'sub', 'file.txt'), 'SYNTHETIC')
    symlinkSync(join(root, 'sub'), join(root, 'alias'))
    symlinkSync(join(root, 'sub', 'file.txt'), join(root, 'link.txt'))
    const handle = context(workspaceHandle(root))
    const all = Object.fromEntries(
      createFsTools({ workspaceRoot: root }).map((t) => [t.id, t])
    )
    const calls: Array<[string, Record<string, unknown>]> = [
      ['fs.list', { path: 'sub' }],
      ['fs.list', { path: 'alias' }],
      ['fs.list', { path: 'missing' }],
      ['fs.read', { path: 'sub/file.txt' }],
      ['fs.read', { path: 'alias/file.txt' }],
      ['fs.read', { path: 'sub/missing.txt' }],
      ['fs.write', { path: 'sub/out.txt', content: 'X', intent: 'probe' }],
      ['fs.write', { path: 'alias/out.txt', content: 'X', intent: 'probe' }],
      ['fs.write', { path: 'missing/out.txt', content: 'X', intent: 'probe' }],
      ['fs.write', { path: 'link.txt', content: 'X', intent: 'probe' }],
      [
        'fs.edit',
        { path: 'sub/file.txt', find: 'SYN', replace: 'syn', intent: 'probe' }
      ],
      [
        'fs.edit',
        { path: 'sub/file.txt', find: 'absent', replace: 'x', intent: 'probe' }
      ]
    ]
    const before = readdirSync('/proc/self/fd').length
    for (let round = 0; round < 3; round++) {
      for (const [id, input] of calls) await all[id]!.execute(input, handle)
    }
    expect(readdirSync('/proc/self/fd').length).toBe(before)
  })
})
