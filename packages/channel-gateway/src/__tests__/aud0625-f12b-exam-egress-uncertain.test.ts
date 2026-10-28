import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import {
  CHANNEL_OPERATION_KIND,
  InMemoryChannelEffectJournal,
  createExamDownloadTool,
  createExamUploadTool
} from '../index.ts'

// SPEC 0273 (AUD0625 F12b): exam-egress after the request left. The upload
// 5xx cases were `it.fails` in phase 1 and are plain `it` since the BUILD;
// the rest are controls that hold before and after. Synthetic data, injected
// fetch, zero egress.

const context: ToolExecutionContext = {
  tenantId: 'tenant-f12b' as never,
  agentId: 'agent-f12b' as never,
  correlationId: 'corr-f12b' as never,
  traceId: 'trace-f12b' as never
}

const dirs: string[] = []
afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop() as string, { recursive: true, force: true })
  }
})

function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-f12b-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'report.pdf'), 'synthetic-exam-bytes')
  return dir
}

const KEY = 'op-f12b'
const input = {
  path: 'report.pdf',
  url: 'https://exams.example.com/u',
  intent: 'synthetic transfer',
  operationKey: KEY
}

type Factory = typeof createExamUploadTool

async function runTwice(
  factory: Factory,
  respond: (signal?: AbortSignal | null) => Promise<Response>,
  extra: { timeoutMs?: number } = {}
) {
  const journal = new InMemoryChannelEffectJournal()
  let attempts = 0
  const tool = factory({
    effectJournal: journal,
    workspaceRoot: workspace(),
    urlGuard: { allowedHosts: ['exams.example.com'] },
    requireApproval: true,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl: async (_url, init) => {
      attempts += 1
      return respond(init?.signal)
    },
    ...extra
  })
  const first = await tool.execute(input, context)
  const second = await tool.execute(input, context)
  const record = await journal.find({
    tenantId: context.tenantId,
    channel: 'exam-file',
    operationKind: CHANNEL_OPERATION_KIND,
    idempotencyKey: KEY
  })
  return { first, second, attempts, state: record?.state }
}

describe('F12b exam.upload: a 5xx after the request left', () => {
  for (const status of [500, 502, 503, 504]) {
    it(`HTTP ${status} keeps the upload UNCERTAIN and never resends it`, async () => {
      const result = await runTwice(
        createExamUploadTool,
        async () => new Response('{}', { status })
      )
      expect(result.attempts).toBe(1)
      expect(result.state).toBe('UNCERTAIN')
      expect(result.first).toMatchObject({
        status: 'FAILED',
        error: expect.stringContaining('effect_uncertain')
      })
      expect(result.second.status).toBe('FAILED')
    })
  }

  it('control: the same key is never resent after a 503 (no blind retry)', async () => {
    const result = await runTwice(
      createExamUploadTool,
      async () => new Response('{}', { status: 503 })
    )
    expect(result.attempts).toBe(1)
    expect(result.second.status).toBe('FAILED')
  })
})

describe('F12b exam-egress controls that must survive the fix', () => {
  it('upload 400 is a definitive rejection, recorded FAILED, not resent', async () => {
    const result = await runTwice(
      createExamUploadTool,
      async () => new Response('{}', { status: 400 })
    )
    expect(result).toMatchObject({ attempts: 1, state: 'FAILED' })
  })

  it('upload 429 (refused before processing) is recorded FAILED, not resent', async () => {
    const result = await runTwice(
      createExamUploadTool,
      async () => new Response('{}', { status: 429 })
    )
    expect(result).toMatchObject({ attempts: 1, state: 'FAILED' })
  })

  it('upload with a lost response (fetch throws) stays UNCERTAIN', async () => {
    const result = await runTwice(createExamUploadTool, async () => {
      throw new Error('response lost after request')
    })
    expect(result).toMatchObject({ attempts: 1, state: 'UNCERTAIN' })
  })

  it('upload cut by the deadline after the request left stays UNCERTAIN', async () => {
    const result = await runTwice(
      createExamUploadTool,
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true
          })
        }),
      { timeoutMs: 50 }
    )
    expect(result).toMatchObject({ attempts: 1, state: 'UNCERTAIN' })
  })

  it('upload whose response body passes the transport ceiling stays UNCERTAIN', async () => {
    const result = await runTwice(createExamUploadTool, async () => {
      const error = new Error('Response exceeds maxResponseBytes')
      error.name = 'ResponseTooLargeError'
      throw error
    })
    expect(result).toMatchObject({ attempts: 1, state: 'UNCERTAIN' })
  })

  it('upload 2xx confirms and the replay does not resend', async () => {
    const result = await runTwice(
      createExamUploadTool,
      async () => new Response('{}', { status: 200 })
    )
    expect(result).toMatchObject({ attempts: 1, state: 'CONFIRMED' })
    expect(result.second.status).toBe('SUCCEEDED')
  })

  it('download 503 stays FAILED (a GET has no remote effect to reconcile)', async () => {
    const result = await runTwice(
      createExamDownloadTool,
      async () => new Response('{}', { status: 503 })
    )
    expect(result).toMatchObject({ attempts: 1, state: 'FAILED' })
  })

  it('download whose connection drops after the request left stays UNCERTAIN', async () => {
    const result = await runTwice(createExamDownloadTool, async () => {
      throw new Error('response lost after request')
    })
    expect(result).toMatchObject({ attempts: 1, state: 'UNCERTAIN' })
  })
})
