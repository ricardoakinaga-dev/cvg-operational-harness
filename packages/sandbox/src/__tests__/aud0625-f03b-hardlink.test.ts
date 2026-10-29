import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
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

// AUD0625 F03b / SPEC 0278 (phase 1): a hard link inside the workspace to a
// file outside it must not carry the outside content into the tool result,
// the workspace or the write journal. The `it.fails` cases fail today for the
// audited defect; controls pass before and after the BUILD. Synthetic owned
// directories only; every outside file is created by the test itself.

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

/** A workspace and a sibling outside directory on the same filesystem. */
function layout() {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-aud0625-f03b-'))
  dirs.push(dir)
  const root = join(dir, 'workspace')
  const outside = join(dir, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  const secret = join(outside, 'secret.txt')
  writeFileSync(secret, 'SYNTHETIC-OUTSIDE-SECRET')
  return { root, outside, secret }
}

function handle(workspaceRoot: string): SandboxHandle {
  return {
    mode: 'WORKSPACE',
    workspaceRoot,
    allowNetwork: false,
    allowSubprocess: false
  }
}

function context(workspaceRoot: string): ToolExecutionContext {
  return {
    tenantId: 'synthetic-tenant' as never,
    agentId: 'synthetic-agent' as never,
    correlationId: 'synthetic-corr' as never,
    traceId: 'synthetic-trace' as never,
    operationKey: 'synthetic-op',
    sandboxHandle: handle(workspaceRoot)
  }
}

function tool(workspaceRoot: string, id: string, journal?: FsWriteJournal) {
  const found = createFsTools({
    workspaceRoot,
    ...(journal ? { writeJournal: journal, requireWriteJournal: true } : {})
  }).find((candidate) => candidate.id === id)
  if (!found) throw new Error(`missing tool ${id}`)
  return found
}

function workspaceText(root: string): string {
  return readdirSync(root, { recursive: true, encoding: 'utf8' })
    .map((name) => {
      try {
        return readFileSync(join(root, name), 'utf8')
      } catch {
        return ''
      }
    })
    .join('\n')
}

describe('F03b: hard links to outside files (SPEC 0278)', () => {
  it.fails(
    'fs.read refuses a hard link to a file outside the workspace',
    async () => {
      const { root, secret } = layout()
      linkSync(secret, join(root, 'link.txt'))
      const result = await tool(root, 'fs.read').execute(
        { path: 'link.txt' },
        context(root)
      )
      expect(result.status).toBe('REJECTED')
      expect(JSON.stringify(result)).not.toContain('SYNTHETIC-OUTSIDE-SECRET')
    }
  )

  it.fails(
    'fs.edit refuses it and records nothing and leaves no outside content in the workspace',
    async () => {
      const { root, secret } = layout()
      linkSync(secret, join(root, 'link.txt'))
      const journaled: string[] = []
      const journal: FsWriteJournal = {
        record: async (entry) => {
          journaled.push(JSON.stringify(entry))
        }
      }
      const result = await tool(root, 'fs.edit', journal).execute(
        {
          path: 'link.txt',
          find: 'SECRET',
          replace: 'EDITED',
          intent: 'synthetic probe'
        },
        context(root)
      )
      expect(result.status).toBe('REJECTED')
      expect(journaled).toEqual([])
      expect(workspaceText(root)).not.toContain('SYNTHETIC-OUTSIDE-EDITED')
      expect(readFileSync(secret, 'utf8')).toBe('SYNTHETIC-OUTSIDE-SECRET')
    }
  )

  it.fails(
    'fs.read refuses a file with two links even when both are inside (D1, strict)',
    async () => {
      const { root } = layout()
      writeFileSync(join(root, 'a.txt'), 'SYNTHETIC-INSIDE')
      linkSync(join(root, 'a.txt'), join(root, 'b.txt'))
      const result = await tool(root, 'fs.read').execute(
        { path: 'a.txt' },
        context(root)
      )
      expect(result.status).toBe('REJECTED')
    }
  )

  describe('controls (pass before and after the BUILD)', () => {
    it('fs.read of an ordinary file with one link succeeds', async () => {
      const { root } = layout()
      writeFileSync(join(root, 'plain.txt'), 'SYNTHETIC-PLAIN')
      const result = await tool(root, 'fs.read').execute(
        { path: 'plain.txt' },
        context(root)
      )
      expect(result).toMatchObject({
        status: 'SUCCEEDED',
        output: { content: 'SYNTHETIC-PLAIN' }
      })
    })

    it('fs.write over a hard-linked name replaces the entry and never touches the outside file', async () => {
      const { root, secret } = layout()
      linkSync(secret, join(root, 'link.txt'))
      const result = await tool(root, 'fs.write').execute(
        {
          path: 'link.txt',
          content: 'SYNTHETIC-NEW',
          intent: 'synthetic probe'
        },
        context(root)
      )
      expect(result.status).toBe('SUCCEEDED')
      expect(readFileSync(secret, 'utf8')).toBe('SYNTHETIC-OUTSIDE-SECRET')
      expect(readFileSync(join(root, 'link.txt'), 'utf8')).toBe('SYNTHETIC-NEW')
    })

    it('accepted limit: once the outside name is gone the file has one link and reads', async () => {
      const { root, secret } = layout()
      linkSync(secret, join(root, 'link.txt'))
      unlinkSync(secret)
      const result = await tool(root, 'fs.read').execute(
        { path: 'link.txt' },
        context(root)
      )
      expect(result.status).toBe('SUCCEEDED')
    })
  })
})
