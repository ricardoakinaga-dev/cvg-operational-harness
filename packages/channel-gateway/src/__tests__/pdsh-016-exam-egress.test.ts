import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import {
  InMemoryChannelEffectJournal,
  createExamDownloadTool,
  createExamUploadTool
} from '../index.ts'

const context: ToolExecutionContext = {
  tenantId: 'tenant-exam' as never,
  agentId: 'agent-exam' as never,
  correlationId: 'corr-exam' as never,
  traceId: 'trace-exam' as never
}

const ALLOWED = ['exams.example.com']

/**
 * The SSRF guard resolves DNS before any egress (fail closed). The example
 * domain is not resolvable in the sandbox, so tests inject a stub resolver
 * that yields a public address. No socket is opened: fetch is always injected.
 * Private/loopback tests
 * intentionally inject a private address or rely on the static loopback check.
 */
const publicDns = async (): Promise<string[]> => ['93.184.216.34']
const privateDns = async (): Promise<string[]> => ['10.0.0.5']
const loopbackDns = async (): Promise<string[]> => ['127.0.0.1']

const tempDirs: string[] = []
function workspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-exam-egress-'))
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  vi.clearAllMocks()
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

function baseOptions(root: string) {
  return {
    effectJournal: new InMemoryChannelEffectJournal(),
    workspaceRoot: root,
    urlGuard: { allowedHosts: ALLOWED },
    requireApproval: true,
    dnsLookup: publicDns
  }
}

/** A fetch that must never be reached; used to assert no egress on reject. */
const noEgress = vi.fn(async (): Promise<Response> => {
  throw new Error('egress must not happen')
})

const identity = (key: string) => ({
  tenantId: context.tenantId,
  channel: 'exam-file',
  operationKind: 'outbound_message' as const,
  idempotencyKey: key
})

const request = (key = 'guard-key') => ({
  path: 'report.pdf',
  url: 'https://exams.example.com/u',
  intent: 'synthetic transfer',
  operationKey: key
})

describe('PDSH-016 exam egress (SPEC 0201)', () => {
  it('refuses to boot with an empty or missing host allowlist (fail closed)', () => {
    const root = workspace()
    expect(() =>
      createExamUploadTool({
        ...baseOptions(root),
        urlGuard: { allowedHosts: [] }
      })
    ).toThrow(/allowlist/)
    expect(() =>
      createExamDownloadTool({ ...baseOptions(root), urlGuard: {} })
    ).toThrow(/allowlist/)
  })

  it('describes both tools as HIGH / EXTERNAL / approval-required / WORKSPACE', () => {
    const root = workspace()
    for (const tool of [
      createExamUploadTool(baseOptions(root)),
      createExamDownloadTool(baseOptions(root))
    ]) {
      expect(tool.id).toMatch(/^exam\.(upload|download)$/)
      expect(tool.risk).toBe('HIGH')
      expect(tool.sideEffect).toBe('EXTERNAL')
      expect(tool.requiresApproval).toBe(true)
      expect(tool.sandbox).toBe('WORKSPACE')
      expect(tool.idempotent).toBe(false)
    }
  })

  it('rejects a non-allow-listed host before any egress or journal entry', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamUploadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: noEgress
    })
    const result = await tool.execute(
      {
        path: 'report.pdf',
        url: 'https://evil.example.org/upload',
        intent: 'send report',
        operationKey: 'op-reject-host'
      },
      context
    )
    expect(result.status).toBe('REJECTED')
    expect(noEgress).not.toHaveBeenCalled()
    // No reservation was recorded: identity never reached the journal.
    const outcome = await journal.reserve({
      identity: {
        tenantId: context.tenantId,
        channel: 'exam-file',
        operationKind: 'outbound_message',
        idempotencyKey: 'op-reject-host'
      },
      payloadHash: 'x',
      hashVersion: 'shared-rfc8785-subset-v1',
      leaseOwner: 'probe',
      leaseMs: 1000
    })
    expect(outcome.outcome).toBe('reserved')
  })

  it('rejects a private / loopback host even when allow-listed', async () => {
    const root = workspace()
    // Literal loopback hosts are denied by the static check before any DNS.
    const literal = createExamDownloadTool({
      ...baseOptions(root),
      urlGuard: { allowedHosts: ['localhost', '127.0.0.1', '[::1]'] },
      dnsLookup: loopbackDns,
      fetchImpl: noEgress
    })
    for (const url of [
      'https://localhost/f',
      'https://127.0.0.1/f',
      'https://[::1]/f'
    ]) {
      const result = await literal.execute(
        { path: 'x.pdf', url, intent: 'probe', operationKey: `op-lit-${url}` },
        context
      )
      expect(result.status).toBe('REJECTED')
    }
    // A non-literal allow-listed host whose DNS resolves to a private address
    // is denied by the address guard (resolution is not trusted on its own).
    const viaDns = createExamDownloadTool({
      ...baseOptions(root),
      urlGuard: { allowedHosts: ['internal.example.com'] },
      dnsLookup: privateDns,
      fetchImpl: noEgress
    })
    const resolved = await viaDns.execute(
      {
        path: 'x.pdf',
        url: 'https://internal.example.com/f',
        intent: 'probe',
        operationKey: 'op-dns-private'
      },
      context
    )
    expect(resolved.status).toBe('REJECTED')
    expect(noEgress).not.toHaveBeenCalled()
  })

  it('rejects an http:// scheme (https only by default)', async () => {
    const root = workspace()
    const tool = createExamUploadTool({
      ...baseOptions(root),
      fetchImpl: noEgress
    })
    const result = await tool.execute(
      {
        path: 'a.pdf',
        url: 'http://exams.example.com/u',
        intent: 'probe',
        operationKey: 'op-http'
      },
      context
    )
    expect(result.status).toBe('REJECTED')
  })

  it('refuses a path that escapes the workspace before any egress', async () => {
    const root = workspace()
    const tool = createExamUploadTool({
      ...baseOptions(root),
      fetchImpl: noEgress
    })
    const result = await tool.execute(
      {
        path: '../escape.pdf',
        url: 'https://exams.example.com/u',
        intent: 'probe',
        operationKey: 'op-escape'
      },
      context
    )
    expect(result.status).toBe('REJECTED')
  })

  it('uploads to an allow-listed host and confirms the journal', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    const journal = new InMemoryChannelEffectJournal()
    const seen: { url: string; method: string }[] = []
    const tool = createExamUploadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: async (url, init) => {
        seen.push({ url: String(url), method: String(init?.method) })
        return new Response('ok', { status: 200 })
      }
    })
    const result = await tool.execute(
      {
        path: 'report.pdf',
        url: 'https://exams.example.com/u',
        intent: 'send report to lab',
        operationKey: 'op-upload-1'
      },
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(seen).toEqual([
      { url: 'https://exams.example.com/u', method: 'POST' }
    ])
    const output = result.output as { externalId: string; bytes: number }
    expect(output.bytes).toBe('exam-bytes'.length)
    expect(output.externalId).toBeTruthy()
    expect((await journal.find(identity('op-upload-1')))?.state).toBe(
      'CONFIRMED'
    )
  })

  // SPEC 0273 §3.4: a 503 is no longer the example of a rejection (it is
  // UNCERTAIN, see aud0625-f12b-exam-egress-uncertain.test.ts); a 4xx is.
  it('marks the journal FAILED when the provider definitively rejects (4xx)', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamUploadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: async () => new Response('nope', { status: 400 })
    })
    const result = await tool.execute(
      {
        path: 'report.pdf',
        url: 'https://exams.example.com/u',
        intent: 'send report',
        operationKey: 'op-upload-400'
      },
      context
    )
    expect(result.status).toBe('FAILED')
    expect((await journal.find(identity('op-upload-400')))?.state).toBe(
      'FAILED'
    )
  })

  it('downloads into the workspace with an atomic write', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: async () =>
        new Response(new Uint8Array([1, 2, 3, 4]), { status: 200 })
    })
    const result = await tool.execute(
      {
        path: 'labs/result.bin',
        url: 'https://exams.example.com/r',
        intent: 'fetch result',
        operationKey: 'op-download-1'
      },
      context
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(readFileSync(join(root, 'labs', 'result.bin'))).toEqual(
      Buffer.from([1, 2, 3, 4])
    )
    expect((await journal.find(identity('op-download-1')))?.state).toBe(
      'CONFIRMED'
    )
    expect(readdirSync(join(root, 'labs'))).toEqual(['result.bin'])
  })

  it('does not write any file when the provider returns non-2xx', async () => {
    const root = workspace()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      fetchImpl: async () => new Response('missing', { status: 404 })
    })
    const result = await tool.execute(
      {
        path: 'labs/missing.bin',
        url: 'https://exams.example.com/r',
        intent: 'fetch missing',
        operationKey: 'op-download-404'
      },
      context
    )
    expect(result.status).toBe('FAILED')
    expect(existsSync(join(root, 'labs', 'missing.bin'))).toBe(false)
  })

  it('refuses a download larger than maxFileBytes without writing', async () => {
    const root = workspace()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      maxFileBytes: 4,
      fetchImpl: async () =>
        new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 })
    })
    const result = await tool.execute(
      {
        path: 'big.bin',
        url: 'https://exams.example.com/big',
        intent: 'fetch big',
        operationKey: 'op-download-big'
      },
      context
    )
    expect(result.status).toBe('FAILED')
    expect(existsSync(join(root, 'big.bin'))).toBe(false)
  })

  it('replays a completed upload without a second egress (idempotency)', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'exam-bytes')
    const journal = new InMemoryChannelEffectJournal()
    let calls = 0
    const tool = createExamUploadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: async () => {
        calls += 1
        return new Response('ok', { status: 200 })
      }
    })
    const input = {
      path: 'report.pdf',
      url: 'https://exams.example.com/u',
      intent: 'send report',
      operationKey: 'op-replay'
    }
    const first = await tool.execute(input, context)
    const second = await tool.execute(input, context)
    expect(first.status).toBe('SUCCEEDED')
    expect(second.status).toBe('SUCCEEDED')
    expect((second.output as { replayed?: boolean }).replayed).toBe(true)
    expect(calls).toBe(1)
  })

  it('requires an operationKey (idempotency) and an intent', async () => {
    const root = workspace()
    const tool = createExamUploadTool({
      ...baseOptions(root),
      fetchImpl: noEgress
    })
    const noKey = await tool.execute(
      {
        path: 'a.pdf',
        url: 'https://exams.example.com/u',
        intent: 'x'
      },
      context
    )
    expect(noKey.status).toBe('REJECTED')
    const noIntent = await tool.execute(
      {
        path: 'a.pdf',
        url: 'https://exams.example.com/u',
        operationKey: 'op-x'
      },
      context
    )
    expect(noIntent.status).toBe('REJECTED')
  })

  it('reserves and claims SENDING before either POST or GET', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'synthetic')
    for (const factory of [createExamUploadTool, createExamDownloadTool]) {
      const journal = new InMemoryChannelEffectJournal()
      const fetchImpl = vi.fn(async () => {
        expect((await journal.find(identity('guard-key')))?.state).toBe(
          'SENDING'
        )
        return new Response('download', { status: 200 })
      })
      const tool = factory({
        ...baseOptions(root),
        effectJournal: journal,
        fetchImpl
      })
      expect((await tool.execute(request(), context)).status).toBe('SUCCEEDED')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('replays downloads without network or rewriting changed local files', async () => {
    const root = workspace()
    const fetchImpl = vi.fn(async () => new Response('original'))
    const tool = createExamDownloadTool({ ...baseOptions(root), fetchImpl })
    expect((await tool.execute(request(), context)).status).toBe('SUCCEEDED')
    writeFileSync(join(root, 'report.pdf'), 'local-change')
    const replay = await tool.execute(request(), context)
    expect(replay.status).toBe('SUCCEEDED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(root, 'report.pdf'), 'utf8')).toBe('local-change')
  })

  it('detects same-size upload content changes with the same key', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'aaaa')
    const fetchImpl = vi.fn(async () => new Response('ok'))
    const tool = createExamUploadTool({ ...baseOptions(root), fetchImpl })
    expect((await tool.execute(request(), context)).status).toBe('SUCCEEDED')
    writeFileSync(join(root, 'report.pdf'), 'bbbb')
    expect(await tool.execute(request(), context)).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('conflict')
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('does not turn FAILED journal replay into success or resend', async () => {
    const root = workspace()
    const fetchImpl = vi.fn(async () => new Response('no', { status: 503 }))
    const tool = createExamDownloadTool({ ...baseOptions(root), fetchImpl })
    expect((await tool.execute(request(), context)).status).toBe('FAILED')
    expect(await tool.execute(request(), context)).toMatchObject({
      status: 'FAILED',
      error: expect.stringContaining('FAILED')
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('records UNCERTAIN on network ambiguity and refuses a retry', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'synthetic')
    for (const factory of [createExamUploadTool, createExamDownloadTool]) {
      const journal = new InMemoryChannelEffectJournal()
      const fetchImpl = vi.fn(async (): Promise<Response> => {
        throw new Error('response lost after request')
      })
      const tool = factory({
        ...baseOptions(root),
        effectJournal: journal,
        fetchImpl
      })
      expect(await tool.execute(request(), context)).toMatchObject({
        status: 'FAILED',
        error: expect.stringContaining('effect_uncertain')
      })
      expect((await journal.find(identity('guard-key')))?.state).toBe(
        'UNCERTAIN'
      )
      expect((await tool.execute(request(), context)).status).toBe('FAILED')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('keeps concurrent identical executions to one egress', async () => {
    const root = workspace()
    let finish!: (response: Response) => void
    let entered!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const fetchImpl = vi.fn(() => {
      entered()
      return new Promise<Response>((resolve) => {
        finish = resolve
      })
    })
    const tool = createExamDownloadTool({ ...baseOptions(root), fetchImpl })
    const first = tool.execute(request(), context)
    await started
    try {
      expect(await tool.execute(request(), context)).toMatchObject({
        status: 'FAILED',
        error: expect.stringContaining('in_flight')
      })
    } finally {
      finish(new Response('synthetic'))
    }
    expect((await first).status).toBe('SUCCEEDED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fails closed when the journal cannot reserve or claim', async () => {
    const root = workspace()
    for (const method of ['reserve', 'claimSend'] as const) {
      const journal = new InMemoryChannelEffectJournal()
      vi.spyOn(journal, method).mockRejectedValue(
        new Error('journal unavailable')
      )
      const tool = createExamDownloadTool({
        ...baseOptions(root),
        effectJournal: journal,
        fetchImpl: noEgress
      })
      expect((await tool.execute(request(), context)).status).toBe('FAILED')
      expect(noEgress).not.toHaveBeenCalled()
    }
  })

  it('never acknowledges success when confirmation throws or loses the lease', async () => {
    const root = workspace()
    for (const mode of ['throw', 'lost'] as const) {
      const journal = new InMemoryChannelEffectJournal()
      const complete = vi.spyOn(journal, 'complete')
      if (mode === 'throw')
        complete.mockRejectedValue(new Error('database lost'))
      else complete.mockResolvedValue('lease_lost')
      const fetchImpl = vi.fn(async () => new Response('synthetic'))
      const tool = createExamDownloadTool({
        ...baseOptions(root),
        effectJournal: journal,
        fetchImpl
      })
      expect(await tool.execute(request(), context)).toMatchObject({
        status: 'FAILED',
        error: expect.stringContaining('effect_uncertain')
      })
      expect((await journal.find(identity('guard-key')))?.state).toBe(
        'UNCERTAIN'
      )
      expect((await tool.execute(request(), context)).status).toBe('FAILED')
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })

  it('cancels on timeout and records the send as UNCERTAIN', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      effectJournal: journal,
      timeoutMs: 20,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal
          if (signal?.aborted) reject(signal.reason)
          else
            signal?.addEventListener('abort', () => reject(signal.reason), {
              once: true
            })
        })
    })
    expect((await tool.execute(request(), context)).status).toBe('FAILED')
    expect((await journal.find(identity('guard-key')))?.state).toBe('UNCERTAIN')
    expect(existsSync(join(root, 'report.pdf'))).toBe(false)
  })

  it('rejects an already aborted context without reserving or fetching', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl: noEgress
    })
    expect(
      (
        await tool.execute(request(), {
          ...context,
          signal: AbortSignal.abort()
        })
      ).status
    ).toBe('REJECTED')
    expect(await journal.find(identity('guard-key'))).toBeUndefined()
    expect(noEgress).not.toHaveBeenCalled()
  })

  it('cancels an oversized stream without changing the destination', async () => {
    const root = workspace()
    writeFileSync(join(root, 'report.pdf'), 'original')
    const cancel = vi.fn()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(3))
        controller.enqueue(new Uint8Array(3))
      },
      cancel
    })
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      maxFileBytes: 4,
      fetchImpl: async () => new Response(stream)
    })
    expect((await tool.execute(request(), context)).status).toBe('FAILED')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(root, 'report.pdf'), 'utf8')).toBe('original')
    expect(readdirSync(root)).toEqual(['report.pdf'])
  })

  it('rejects malformed, metadata and failed-DNS destinations before reserve', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      effectJournal: journal,
      urlGuard: { allowedHosts: [...ALLOWED, '169.254.169.254'] },
      dnsLookup: async () => {
        throw new Error('DNS unavailable')
      },
      fetchImpl: noEgress
    })
    for (const url of [
      'malformed',
      'https://169.254.169.254/latest/meta-data/',
      request().url
    ]) {
      expect((await tool.execute({ ...request(), url }, context)).status).toBe(
        'REJECTED'
      )
    }
    expect(await journal.find(identity('guard-key'))).toBeUndefined()
    expect(noEgress).not.toHaveBeenCalled()
  })

  it('guards redirects without contacting a private redirect destination', async () => {
    const root = workspace()
    const journal = new InMemoryChannelEffectJournal()
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/private' }
        })
    )
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      effectJournal: journal,
      fetchImpl
    })
    expect((await tool.execute(request(), context)).status).toBe('FAILED')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((await journal.find(identity('guard-key')))?.state).toBe('UNCERTAIN')
    expect(existsSync(join(root, 'report.pdf'))).toBe(false)
  })

  it('rejects symlink escapes and rechecks the destination after network awaits', async () => {
    const root = workspace()
    const outside = workspace()
    symlinkSync(outside, join(root, 'escape'))
    const denied = createExamDownloadTool({
      ...baseOptions(root),
      fetchImpl: noEgress
    })
    expect(
      (await denied.execute({ ...request(), path: 'escape/out.pdf' }, context))
        .status
    ).toBe('REJECTED')
    expect(noEgress).not.toHaveBeenCalled()
    mkdirSync(join(root, 'labs'))
    const tool = createExamDownloadTool({
      ...baseOptions(root),
      fetchImpl: async () => {
        rmSync(join(root, 'labs'), { recursive: true })
        symlinkSync(outside, join(root, 'labs'))
        return new Response('synthetic')
      }
    })
    expect(
      (await tool.execute({ ...request(), path: 'labs/out.pdf' }, context))
        .status
    ).toBe('FAILED')
    expect(readdirSync(outside)).toEqual([])
  })

  it('validates byte and lease limits and forbids insecure composition overrides', () => {
    const root = workspace()
    for (const maxFileBytes of [0, -1, NaN, Infinity, 25 * 1024 * 1024 + 1]) {
      expect(() =>
        createExamDownloadTool({ ...baseOptions(root), maxFileBytes })
      ).toThrow(/maxFileBytes/)
    }
    expect(() =>
      createExamDownloadTool({ ...baseOptions(root), timeoutMs: 30_000 })
    ).toThrow(/timeoutMs/)
    expect(() =>
      createExamDownloadTool({
        ...baseOptions(root),
        urlGuard: { allowedHosts: ALLOWED, allowPrivateNetworks: true }
      })
    ).toThrow(/public networks/)
  })
})
