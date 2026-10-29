// @vitest-environment node
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'

// AUD0625 F03c / SPEC 0281 §2 invariants 2 and 3: the refusal is decided by the
// `fstat` of the descriptor that was opened, and before any byte is read. The
// real `node:fs` is wrapped only to count `readSync` calls and to run a hook
// right after `openSync`, so a name swap between open and check is observable.
const hooks = vi.hoisted(() => ({
  reads: 0,
  afterOpen: undefined as undefined | ((path: string) => void)
}))
vi.mock('node:fs', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs')>()
  return {
    ...real,
    readSync: ((...args: Parameters<typeof real.readSync>) => {
      hooks.reads += 1
      return real.readSync(...args)
    }) as typeof real.readSync,
    openSync: ((...args: Parameters<typeof real.openSync>) => {
      const fd = real.openSync(...args)
      hooks.afterOpen?.(String(args[0]))
      return fd
    }) as typeof real.openSync
  }
})

import { InMemoryChannelEffectJournal, createExamUploadTool } from '../index.ts'

const dirs: string[] = []
afterEach(() => {
  hooks.reads = 0
  hooks.afterOpen = undefined
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})
const context: ToolExecutionContext = {
  tenantId: 'tenant-exam' as never,
  agentId: 'agent-exam' as never,
  correlationId: 'corr-exam' as never,
  traceId: 'trace-exam' as never
}
function layout() {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-aud0625-f03c-order-'))
  dirs.push(dir)
  const root = join(dir, 'workspace')
  mkdirSync(root)
  const secret = join(dir, 'secret.txt')
  writeFileSync(secret, 'SYNTHETIC-OUTSIDE-SECRET')
  return { root, secret }
}
function uploader(root: string, sent: string[]) {
  return createExamUploadTool({
    effectJournal: new InMemoryChannelEffectJournal(),
    workspaceRoot: root,
    urlGuard: { allowedHosts: ['exams.example.com'] },
    requireApproval: true,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: (async (_url: unknown, init: { body?: unknown }) => {
      sent.push(Buffer.from(init.body as Uint8Array).toString())
      return new Response('ok', { status: 200 })
    }) as never
  })
}
const request = (key: string) => ({
  path: 'report.pdf',
  url: 'https://exams.example.com/u',
  intent: 'synthetic transfer',
  operationKey: key
})

describe('F03c: order and identity of the refusal (SPEC 0281 §2)', () => {
  it('control: a one-link upload reads its bytes', async () => {
    const { root } = layout()
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    const sent: string[] = []
    const result = await uploader(root, sent).execute(
      request('op-order-1'),
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(hooks.reads).toBeGreaterThan(0)
  })

  it('a multiply-linked file is refused before a single byte is read', async () => {
    const { root, secret } = layout()
    linkSync(secret, join(root, 'report.pdf'))
    const sent: string[] = []
    const result = await uploader(root, sent).execute(
      request('op-order-2'),
      context
    )
    expect(result.status).not.toBe('SUCCEEDED')
    expect(hooks.reads).toBe(0)
    expect(sent).toEqual([])
  })

  it('the refusal follows the opened descriptor, not the name swapped right after open', async () => {
    const { root, secret } = layout()
    const target = join(root, 'report.pdf')
    // Three names for one inode: after the workspace name is replaced the
    // opened inode still has two links, while the new name has only one.
    linkSync(secret, target)
    linkSync(secret, join(root, '..', 'third-name.txt'))
    hooks.afterOpen = (path) => {
      if (path !== target) return
      hooks.afterOpen = undefined
      const fresh = join(root, 'fresh.tmp')
      writeFileSync(fresh, 'FRESH-SINGLE-LINK')
      renameSync(fresh, target)
    }
    const sent: string[] = []
    const result = await uploader(root, sent).execute(
      request('op-order-3'),
      context
    )
    // A check by name would see the fresh single-link file and let the opened
    // descriptor (the outside inode) through.
    expect(result.status).not.toBe('SUCCEEDED')
    expect(sent).toEqual([])
    expect(hooks.reads).toBe(0)
  })
})
