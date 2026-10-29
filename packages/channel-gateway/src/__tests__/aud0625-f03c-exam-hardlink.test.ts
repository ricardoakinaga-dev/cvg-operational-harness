import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import {
  InMemoryChannelEffectJournal,
  createExamDownloadTool,
  createExamUploadTool
} from '../index.ts'

// AUD0625 F03c / SPEC 0281: exam.upload must not send the content of a file
// that has another name (nlink > 1), e.g. a hard link inside the workspace to
// a file outside it. The three target cases were `it.fails` in phase 1 and are
// plain tests after the BUILD; controls pass before and after it. Synthetic
// owned directories only: every outside file is created by the test.

const OUTSIDE_TEXT = 'SYNTHETIC-OUTSIDE-SECRET'
const dirs: string[] = []
afterEach(() => {
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
  const dir = mkdtempSync(join(tmpdir(), 'cvg-aud0625-f03c-'))
  dirs.push(dir)
  const root = join(dir, 'workspace')
  const outside = join(dir, 'outside')
  mkdirSync(root)
  mkdirSync(outside)
  const secret = join(outside, 'secret.txt')
  writeFileSync(secret, OUTSIDE_TEXT)
  return { root, outside, secret }
}

function uploader(root: string, sent: string[]) {
  const journal = new InMemoryChannelEffectJournal()
  const tool = createExamUploadTool({
    effectJournal: journal,
    workspaceRoot: root,
    urlGuard: { allowedHosts: ['exams.example.com'] },
    requireApproval: true,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: (async (_url: unknown, init: { body?: unknown }) => {
      sent.push(Buffer.from(init.body as Uint8Array).toString())
      return new Response('ok', { status: 200 })
    }) as never
  })
  return { tool, journal }
}

const request = (key: string, path = 'report.pdf') => ({
  path,
  url: 'https://exams.example.com/u',
  intent: 'synthetic transfer',
  operationKey: key
})

/** True when the identity can still be reserved (nothing was recorded). */
async function stillReservable(
  journal: InMemoryChannelEffectJournal,
  key: string
) {
  const outcome = await journal.reserve({
    identity: {
      tenantId: context.tenantId,
      channel: 'exam-file',
      operationKind: 'outbound_message',
      idempotencyKey: key
    },
    payloadHash: 'x',
    hashVersion: 'shared-rfc8785-subset-v1',
    leaseOwner: 'probe',
    leaseMs: 1000
  })
  return outcome.outcome === 'reserved'
}

describe('F03c: exam.upload and hard links (SPEC 0281)', () => {
  it('a hard link to a file outside the workspace is not uploaded', async () => {
    const { root, secret } = layout()
    linkSync(secret, join(root, 'report.pdf'))
    const sent: string[] = []
    const { tool } = uploader(root, sent)
    const result = await tool.execute(request('op-f03c-out'), context)
    expect(result.status).not.toBe('SUCCEEDED')
    expect(sent).toEqual([])
    expect(JSON.stringify(result)).not.toContain(OUTSIDE_TEXT)
  })

  it('the refusal leaves the journal untouched', async () => {
    const { root, secret } = layout()
    linkSync(secret, join(root, 'report.pdf'))
    const { tool, journal } = uploader(root, [])
    await tool.execute(request('op-f03c-journal'), context)
    expect(await stillReservable(journal, 'op-f03c-journal')).toBe(true)
  })

  it('a file with two names inside the workspace is not uploaded (D1)', async () => {
    const { root } = layout()
    writeFileSync(join(root, 'a.pdf'), 'two-names-inside')
    linkSync(join(root, 'a.pdf'), join(root, 'report.pdf'))
    const sent: string[] = []
    const { tool } = uploader(root, sent)
    const result = await tool.execute(request('op-f03c-two'), context)
    expect(result.status).not.toBe('SUCCEEDED')
    expect(sent).toEqual([])
  })

  it('control: a file with one link is uploaded once with its own bytes', async () => {
    const { root } = layout()
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    const sent: string[] = []
    const { tool } = uploader(root, sent)
    const result = await tool.execute(request('op-f03c-one'), context)
    expect(result.status).toBe('SUCCEEDED')
    expect(sent).toEqual(['exam-bytes'])
  })

  it('control: once the outside name is gone the file has one link and uploads (accepted limit)', async () => {
    const { root, secret } = layout()
    linkSync(secret, join(root, 'report.pdf'))
    unlinkSync(secret)
    const sent: string[] = []
    const { tool } = uploader(root, sent)
    const result = await tool.execute(request('op-f03c-gone'), context)
    expect(result.status).toBe('SUCCEEDED')
    expect(sent).toEqual([OUTSIDE_TEXT])
  })

  it('control: exam.download over a name that is a hard link replaces the entry and leaves the outside file alone', async () => {
    const { root, secret } = layout()
    linkSync(secret, join(root, 'report.pdf'))
    const tool = createExamDownloadTool({
      effectJournal: new InMemoryChannelEffectJournal(),
      workspaceRoot: root,
      urlGuard: { allowedHosts: ['exams.example.com'] },
      requireApproval: true,
      dnsLookup: async () => ['93.184.216.34'],
      fetchImpl: (async () =>
        new Response('downloaded-bytes', { status: 200 })) as never
    })
    const result = await tool.execute(
      { ...request('op-f03c-download'), url: 'https://exams.example.com/d' },
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(readFileSync(join(root, 'report.pdf'), 'utf8')).toBe(
      'downloaded-bytes'
    )
    expect(readFileSync(secret, 'utf8')).toBe(OUTSIDE_TEXT)
  })

  it('control: a symlink as the final component is still refused', async () => {
    const { root, secret } = layout()
    const { symlinkSync } = await import('node:fs')
    symlinkSync(secret, join(root, 'report.pdf'))
    const sent: string[] = []
    const { tool } = uploader(root, sent)
    const result = await tool.execute(request('op-f03c-sym'), context)
    expect(result.status).not.toBe('SUCCEEDED')
    expect(sent).toEqual([])
  })
})
