import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import { createFsTools, type FsWriteJournalEntry } from '../index.ts'

const context: ToolExecutionContext = {
  tenantId: 'tenant-fs' as never,
  agentId: 'agent-fs' as never,
  correlationId: 'corr-fs' as never,
  traceId: 'trace-fs' as never,
  operationKey: 'fs-op-1',
  // SPEC 0270 §3.1: every workspace below the temp dir is inside this grant.
  sandboxHandle: {
    mode: 'WORKSPACE',
    workspaceRoot: tmpdir(),
    allowNetwork: false,
    allowSubprocess: false
  }
}

const tempDirs: string[] = []
const journalEntries: FsWriteJournalEntry[] = []

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-fs-tool-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  journalEntries.length = 0
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

function tools(
  root: string,
  over: Parameters<typeof createFsTools>[0] extends infer O
    ? Partial<O>
    : never = {}
) {
  return Object.fromEntries(
    createFsTools({ workspaceRoot: root, ...over }).map((tool) => [
      tool.id,
      tool
    ])
  )
}

const recording = () => ({
  record: async (entry: FsWriteJournalEntry) => {
    journalEntries.push(entry)
  }
})

describe('PDSH-012 fs tools (SPEC 0197)', () => {
  it('refuses to boot without an existing absolute workspace root', () => {
    expect(() => createFsTools({ workspaceRoot: tmpdir() })).not.toThrow()
    expect(() =>
      createFsTools({ workspaceRoot: join(tmpdir(), 'cvg-missing-root') })
    ).toThrow(/workspaceRoot/)
    expect(() => createFsTools({ workspaceRoot: 'relative/root' })).toThrow(
      /workspaceRoot/
    )
  })

  it('refuses to boot when requireWriteJournal is set without a journal', () => {
    expect(() =>
      createFsTools({ workspaceRoot: workspace(), requireWriteJournal: true })
    ).toThrow(/writeJournal/)
  })

  it('declares the four tools with WORKSPACE containment', () => {
    const registry = tools(workspace())
    expect(Object.keys(registry).sort()).toEqual([
      'fs.edit',
      'fs.list',
      'fs.read',
      'fs.write'
    ])
    for (const tool of Object.values(registry)) {
      expect(tool.sandbox).toBe('WORKSPACE')
      expect(tool.requiresApproval).toBe(false)
    }
  })

  it('reads a file inside the workspace', async () => {
    const root = workspace()
    writeFileSync(join(root, 'note.txt'), 'conteudo sintetico', 'utf8')
    const registry = tools(root)
    const result = await registry['fs.read']!.execute(
      { path: 'note.txt' },
      context
    )
    expect(result).toMatchObject({
      status: 'SUCCEEDED',
      output: { path: 'note.txt', content: 'conteudo sintetico', bytes: 18 }
    })
  })

  it('lists a directory inside the workspace', async () => {
    const root = workspace()
    writeFileSync(join(root, 'a.txt'), 'a', 'utf8')
    mkdirSync(join(root, 'sub'))
    const registry = tools(root)
    const result = await registry['fs.list']!.execute({ path: '.' }, context)
    expect(result.status).toBe('SUCCEEDED')
    if (result.status === 'SUCCEEDED') {
      const output = result.output as {
        entries: { name: string; kind: string }[]
      }
      expect(output.entries).toEqual(
        expect.arrayContaining([
          { name: 'a.txt', kind: 'file' },
          { name: 'sub', kind: 'directory' }
        ])
      )
    }
  })

  it('rejects path escapes: absolute, .., and symlink out of the root', async () => {
    const root = workspace()
    const outside = workspace()
    writeFileSync(join(outside, 'secret.txt'), 'segredo', 'utf8')
    symlinkSync(outside, join(root, 'escape-link'))
    const registry = tools(root)
    for (const path of [
      outside + '/secret.txt',
      '../outside/secret.txt',
      'escape-link/secret.txt'
    ]) {
      const result = await registry['fs.read']!.execute({ path }, context)
      expect(result.status).toBe('REJECTED')
    }
  })

  it('refuses reads above maxReadBytes without truncating', async () => {
    const root = workspace()
    writeFileSync(join(root, 'big.txt'), 'x'.repeat(2048), 'utf8')
    const registry = tools(root, { limits: { maxReadBytes: 1024 } })
    const result = await registry['fs.read']!.execute(
      { path: 'big.txt' },
      context
    )
    expect(result).toMatchObject({ status: 'FAILED' })
  })

  it('writes with a declared intent and journals before the mutation', async () => {
    const root = workspace()
    mkdirSync(join(root, 'out'))
    const registry = tools(root, { writeJournal: recording() })
    const ok = await registry['fs.write']!.execute(
      {
        path: 'out/report.md',
        content: '# relatorio',
        intent: 'gerar relatorio sintetico'
      },
      context
    )
    expect(ok.status).toBe('SUCCEEDED')
    expect(journalEntries).toHaveLength(1)
    expect(journalEntries[0]).toMatchObject({
      tenantId: 'tenant-fs',
      operationKey: 'fs-op-1',
      toolId: 'fs.write',
      path: 'out/report.md',
      intent: 'gerar relatorio sintetico',
      action: 'write'
    })
    expect(journalEntries[0]!.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('fails the write when the parent directory does not exist (journal already recorded)', async () => {
    const root = workspace()
    const registry = tools(root, { writeJournal: recording() })
    const result = await registry['fs.write']!.execute(
      { path: 'missing-dir/report.md', content: 'x', intent: 'sem diretorio' },
      context
    )
    expect(result).toMatchObject({ status: 'FAILED' })
    // Pre-mutation journal: the intent is recorded even though the mutation
    // could not complete, so reconciliation can see the attempt.
    expect(journalEntries).toHaveLength(1)
  })

  it('rejects writes without intent and never mutates', async () => {
    const root = workspace()
    const registry = tools(root, { writeJournal: recording() })
    const missing = await registry['fs.write']!.execute(
      { path: 'a.txt', content: 'x' },
      context
    )
    expect(missing).toMatchObject({ status: 'REJECTED' })
    const empty = await registry['fs.write']!.execute(
      { path: 'a.txt', content: 'x', intent: '   ' },
      context
    )
    expect(empty).toMatchObject({ status: 'REJECTED' })
    expect(journalEntries).toHaveLength(0)
  })

  it('fails closed when the journal throws — no mutation', async () => {
    const root = workspace()
    const registry = tools(root, {
      writeJournal: {
        record: async () => {
          throw new Error('journal fora do ar')
        }
      }
    })
    const result = await registry['fs.write']!.execute(
      { path: 'a.txt', content: 'x', intent: 'teste' },
      context
    )
    expect(result).toMatchObject({ status: 'FAILED' })
    expect(existsSync(join(root, 'a.txt'))).toBe(false)
  })

  it('proceeds without a journal only when requireWriteJournal is not set', async () => {
    const root = workspace()
    const registry = tools(root)
    const result = await registry['fs.write']!.execute(
      { path: 'a.txt', content: 'x', intent: 'teste' },
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(existsSync(join(root, 'a.txt'))).toBe(true)
  })

  it('edits a unique occurrence', async () => {
    const root = workspace()
    writeFileSync(join(root, 'doc.md'), 'alfa beta gama', 'utf8')
    const registry = tools(root, { writeJournal: recording() })
    const result = await registry['fs.edit']!.execute(
      {
        path: 'doc.md',
        find: 'beta',
        replace: 'BETA',
        intent: 'corrigir destaque'
      },
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(journalEntries[0]).toMatchObject({
      action: 'edit',
      toolId: 'fs.edit'
    })
  })

  it('refuses edits with zero or multiple occurrences', async () => {
    const root = workspace()
    writeFileSync(join(root, 'doc.md'), 'x x y', 'utf8')
    const registry = tools(root, { writeJournal: recording() })
    const zero = await registry['fs.edit']!.execute(
      { path: 'doc.md', find: 'zz', replace: 'q', intent: 'teste' },
      context
    )
    expect(zero).toMatchObject({ status: 'FAILED' })
    const many = await registry['fs.edit']!.execute(
      { path: 'doc.md', find: 'x', replace: 'q', intent: 'teste' },
      context
    )
    expect(many).toMatchObject({ status: 'FAILED' })
    expect(journalEntries).toHaveLength(0)
  })

  it('refuses the reserved temp namespace', async () => {
    const root = workspace()
    const registry = tools(root)
    const result = await registry['fs.read']!.execute(
      { path: '.cvg-fs-tmp-abc' },
      context
    )
    expect(result.status).toBe('REJECTED')
  })
})
