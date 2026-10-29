/**
 * SPEC 0263 D13: exam-egress shares the operation signal with its preliminary
 * resolution. A cancellation while DNS is pending never acquires the effect
 * and never reaches the transport. DNS and fetch are injected.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import { InMemoryChannelEffectJournal, createExamUploadTool } from '../index.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe('SPEC 0263 D13: exam upload cancelled during the preliminary DNS', () => {
  it('rejects promptly, records no effect and never fetches after release', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cvg-0263-exam-'))
    dirs.push(root)
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    let release!: (addresses: string[]) => void
    const pending = new Promise<string[]>((resolve) => {
      release = resolve
    })
    const journal = new InMemoryChannelEffectJournal()
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }))
    const tool = createExamUploadTool({
      effectJournal: journal,
      workspaceRoot: root,
      urlGuard: { allowedHosts: ['exams.example.com'] },
      requireApproval: true,
      dnsLookup: () => pending,
      fetchImpl
    })
    const controller = new AbortController()
    const context: ToolExecutionContext = {
      tenantId: 'tenant-exam' as never,
      agentId: 'agent-exam' as never,
      correlationId: 'corr-exam' as never,
      traceId: 'trace-exam' as never,
      signal: controller.signal
    }
    const result = tool.execute(
      {
        path: 'report.pdf',
        url: 'https://exams.example.com/u',
        intent: 'send report to lab',
        operationKey: 'op-0263-cancel'
      },
      context
    )
    controller.abort()
    await expect(result).resolves.toMatchObject({ status: 'REJECTED' })
    release(['93.184.216.34'])
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(
      await journal.find({
        tenantId: context.tenantId,
        channel: 'exam-file',
        operationKind: 'outbound_message',
        idempotencyKey: 'op-0263-cancel'
      })
    ).toBeUndefined()
  })
})
