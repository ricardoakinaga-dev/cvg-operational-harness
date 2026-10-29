import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import {
  canonicalizeJson,
  fetchWithSsrfGuard,
  resolveAndGuardOutboundUrl,
  type EgressDns,
  type EgressGuardOptions
} from '@cvg/shared'
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult
} from '@cvg/harness-contracts'
import { confinePath } from '@cvg/sandbox'
import {
  CHANNEL_OPERATION_KIND,
  CURRENT_HASH_VERSION,
  type ChannelEffectIdentity,
  type ChannelEffectJournal,
  type ChannelEffectRecord
} from './effect-journal.ts'
import { fetchWithResolvedAddress } from './adapters/ssrf-node.ts'
import { statusEffectOptions } from './adapters/bounded-body.ts'

const MAX_FILE_BYTES = 25 * 1024 * 1024
const TEMP_PREFIX = '.cvg-fs-tmp-'
const INPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['path', 'url', 'intent', 'operationKey'],
  properties: {
    path: { type: 'string', minLength: 1, maxLength: 4096 },
    url: { type: 'string', minLength: 1, maxLength: 2048 },
    intent: { type: 'string', minLength: 1, maxLength: 200 },
    operationKey: { type: 'string', minLength: 1, maxLength: 200 }
  }
} as const

export interface ExamEgressOptions {
  readonly effectJournal: ChannelEffectJournal
  readonly workspaceRoot: string
  readonly urlGuard?: EgressGuardOptions
  readonly dnsLookup?: EgressDns['lookup']
  /** Descriptor approval stays mandatory, even for synthetic direct execution. */
  readonly requireApproval: boolean
  readonly maxFileBytes?: number
  readonly leaseMs?: number
  readonly timeoutMs?: number
  readonly leaseOwner?: string
  /** Trusted composition seam; when absent, sockets are pinned to guarded DNS. */
  readonly fetchImpl?: typeof fetch
}

interface ExamInput {
  readonly path: string
  readonly url: string
  readonly intent: string
  readonly operationKey: string
}

const failed = (error: string): ToolResult => ({ status: 'FAILED', error })
const rejected = (error: string): ToolResult => ({ status: 'REJECTED', error })

function parseInput(input: unknown): ExamInput | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return
  const record = input as Record<string, unknown>
  if (
    Object.keys(record).some(
      (key) => !['path', 'url', 'intent', 'operationKey'].includes(key)
    )
  )
    return
  for (const [key, limit] of [
    ['path', 4096],
    ['url', 2048],
    ['intent', 200],
    ['operationKey', 200]
  ] as const) {
    const value = record[key]
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.length > limit ||
      value.includes('\0')
    )
      return
  }
  return record as unknown as ExamInput
}

function positiveLimit(value: number, name: string, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer in 1..${max}`)
  }
  return value
}

function replay(record: ChannelEffectRecord): ToolResult {
  if (record.state !== 'CONFIRMED' || !record.result?.accepted) {
    return failed(
      `effect replay: ${record.state} (${record.errorCode ?? 'invalid result'})`
    )
  }
  return {
    status: 'SUCCEEDED',
    output: {
      replayed: true,
      externalId: record.result.externalId,
      state: record.state
    }
  }
}

/** Cap allocation before reading and refuse special files/final symlinks. */
function readUpload(abs: string, maxBytes: number): Buffer {
  const fd = openSync(
    abs,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
  )
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error('source must be a regular file')
    // SPEC 0281: another name for this inode may live outside the workspace,
    // and there is no way to tell where; refuse before reading any byte.
    if (stat.nlink > 1) throw new Error('source has more than one hard link')
    if (stat.size > maxBytes) throw new Error('source exceeds maxFileBytes')
    const bytes = Buffer.alloc(stat.size + 1)
    let size = 0
    while (size < bytes.length) {
      const read = readSync(fd, bytes, size, bytes.length - size, null)
      if (!read) break
      size += read
    }
    if (size !== stat.size) throw new Error('source changed during read')
    return bytes.subarray(0, size)
  } finally {
    closeSync(fd)
  }
}

async function readDownload(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<Buffer> {
  if (!response.body) throw new Error('download body is absent')
  const length = response.headers.get('content-length')
  if (length !== null && Number(length) > maxBytes) {
    await response.body.cancel()
    throw new Error('payload exceeds maxFileBytes')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const abort = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw new Error('payload exceeds maxFileBytes')
      chunks.push(value)
    }
    return Buffer.concat(chunks, total)
  } finally {
    signal.removeEventListener('abort', abort)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

function writeDownload(root: string, rel: string, bytes: Buffer): void {
  const path = confinePath(root, rel)
  if (!path.ok) throw new Error(path.error)
  mkdirSync(dirname(path.abs), { recursive: true })
  // Recheck after awaits and parent creation, before mutating the destination.
  const current = confinePath(root, rel)
  if (!current.ok || current.abs !== path.abs)
    throw new Error('destination changed')
  const temp = join(dirname(current.abs), `${TEMP_PREFIX}${randomUUID()}`)
  try {
    writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 })
    renameSync(temp, current.abs)
  } finally {
    rmSync(temp, { force: true })
  }
}

function createExecutor(
  options: ExamEgressOptions,
  operation: 'exam.upload' | 'exam.download'
): ToolDefinition['execute'] {
  if (!isAbsolute(options.workspaceRoot))
    throw new Error('workspaceRoot must be absolute')
  const root = realpathSync(options.workspaceRoot)
  if (!statSync(root).isDirectory())
    throw new Error('workspaceRoot must be a directory')
  if (typeof options.requireApproval !== 'boolean')
    throw new Error('requireApproval must be a boolean')
  const hosts = options.urlGuard?.allowedHosts
  if (!hosts?.length || hosts.some((host) => !host.trim()))
    throw new Error('exam egress requires a non-empty host allowlist')
  if (
    options.urlGuard?.allowPrivateNetworks ||
    options.urlGuard?.allowHttp ||
    options.urlGuard?.allowedProtocols?.some((p) => p !== 'https:')
  ) {
    throw new Error('exam egress requires HTTPS and public networks')
  }
  const guard: EgressGuardOptions = {
    ...options.urlGuard,
    allowedHosts: [...hosts],
    allowedProtocols: ['https:'],
    allowPrivateNetworks: false,
    allowHttp: false
  }
  const maxBytes = positiveLimit(
    options.maxFileBytes ?? MAX_FILE_BYTES,
    'maxFileBytes',
    MAX_FILE_BYTES
  )
  const leaseMs = positiveLimit(options.leaseMs ?? 30_000, 'leaseMs', 120_000)
  const timeoutMs = positiveLimit(
    options.timeoutMs ?? Math.min(20_000, leaseMs - 1),
    'timeoutMs',
    leaseMs - 1
  )
  const deps = {
    ...(options.dnsLookup ? { dnsLookup: options.dnsLookup } : {}),
    ...(options.fetchImpl ? {} : { boundFetchImpl: fetchWithResolvedAddress })
  }
  const journal = options.effectJournal
  return async (
    input: unknown,
    context: ToolExecutionContext
  ): Promise<ToolResult> => {
    const parsed = parseInput(input)
    if (!parsed) return rejected('invalid exam egress input')
    const path = confinePath(root, parsed.path)
    if (!path.ok || path.rel === '.')
      return rejected(path.ok ? 'path must name a file' : path.error)
    const signal = context.signal
      ? AbortSignal.any([context.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs)
    let url: string
    try {
      signal.throwIfAborted()
      // SPEC 0263 §2: the preliminary resolution shares the operation signal.
      url = (
        await resolveAndGuardOutboundUrl(parsed.url, guard, { ...deps, signal })
      ).url.toString()
      signal.throwIfAborted()
    } catch {
      return rejected('unsafe URL or cancelled request')
    }
    let upload: Buffer | undefined
    if (operation === 'exam.upload') {
      try {
        upload = readUpload(path.abs, maxBytes)
      } catch {
        return failed('source unreadable, changed or exceeds maxFileBytes')
      }
    }
    const identity: ChannelEffectIdentity = {
      tenantId: context.tenantId,
      channel: 'exam-file',
      operationKind: CHANNEL_OPERATION_KIND,
      idempotencyKey: parsed.operationKey
    }
    const payloadHash = createHash('sha256')
      .update(
        canonicalizeJson({
          operation,
          workspaceRoot: root,
          path: path.rel,
          url,
          intent: parsed.intent,
          ...(upload
            ? { sha256: createHash('sha256').update(upload).digest('hex') }
            : {})
        })
      )
      .digest('hex')
    // A new owner per execution prevents concurrent callers sharing a factory
    // from impersonating one another's lease.
    const leaseOwner = `${options.leaseOwner ?? 'exam-egress'}-${randomUUID()}`
    let claimed = false
    let sent = false
    const uncertain = async (): Promise<void> => {
      // If recording fails, SENDING stays non-retryable after lease expiration.
      await journal
        .markUncertain(identity, leaseOwner, 'effect_uncertain')
        .catch(() => undefined)
    }
    try {
      signal.throwIfAborted()
      const reserve = await journal.reserve({
        identity,
        payloadHash,
        hashVersion: CURRENT_HASH_VERSION,
        leaseOwner,
        leaseMs
      })
      if (reserve.outcome === 'replay') return replay(reserve.record)
      if (reserve.outcome !== 'reserved')
        return failed(`effect not reserved: ${reserve.outcome}`)
      claimed = true
      signal.throwIfAborted()
      await journal.claimSend(identity, leaseOwner)
      signal.throwIfAborted()
      sent = true
      const response = await fetchWithSsrfGuard(
        options.fetchImpl ?? globalThis.fetch,
        url,
        {
          method: operation === 'exam.upload' ? 'POST' : 'GET',
          signal,
          maxResponseBytes: maxBytes,
          ...(upload
            ? {
                body: new Uint8Array(upload),
                headers: { 'content-type': 'application/octet-stream' }
              }
            : {})
        },
        guard,
        deps
      )
      signal.throwIfAborted()
      if (!response.ok) {
        await response.body?.cancel()
        // SPEC 0273 (invariant 1 of SPEC 0268): a 5xx proves the upload reached
        // the destination but not that it had no effect, so it stays UNCERTAIN
        // and needs reconciliation. A download is a GET with nothing to
        // reconcile, and 4xx/429 are definitive refusals: both stay FAILED.
        if (
          operation === 'exam.upload' &&
          statusEffectOptions(response.status).effectUnknown
        ) {
          await uncertain()
          return failed(
            `effect_uncertain: reconcile before retry (HTTP ${response.status})`
          )
        }
        if (
          (await journal.fail(identity, leaseOwner, 'provider_rejected')) !==
          'committed'
        ) {
          await uncertain()
          return failed('effect_uncertain: lease lost')
        }
        return failed(
          `provider rejected ${operation} (HTTP ${response.status})`
        )
      }
      let bytes = upload?.byteLength ?? 0
      if (operation === 'exam.download') {
        let download: Buffer
        try {
          download = await readDownload(response, maxBytes, signal)
        } catch (error) {
          if (signal.aborted) throw error
          await journal.fail(identity, leaseOwner, 'invalid_payload')
          return failed('download body invalid or exceeds maxFileBytes')
        }
        signal.throwIfAborted()
        // Fence local mutation against an expired/stolen lease.
        if (!(await journal.renew(identity, leaseOwner, leaseMs)))
          throw new Error('lease lost')
        signal.throwIfAborted()
        try {
          writeDownload(root, path.rel, download)
        } catch {
          await journal.fail(identity, leaseOwner, 'invalid_payload')
          return failed('destination write failed')
        }
        bytes = download.byteLength
      } else {
        await response.body?.cancel()
      }
      const externalId = randomUUID()
      const transition = await journal.complete(identity, leaseOwner, {
        externalId,
        channel: 'exam-file',
        accepted: true,
        sentAt: new Date().toISOString()
      })
      if (transition !== 'committed') {
        await uncertain()
        return failed('effect_uncertain: confirmation lease lost')
      }
      return {
        status: 'SUCCEEDED',
        output: { externalId, bytes, path: path.rel, url: response.url || url }
      }
    } catch {
      if (claimed && sent) await uncertain()
      else if (claimed)
        await journal
          .release(identity, leaseOwner, 'send_failed')
          .catch(() => undefined)
      return failed(
        sent
          ? 'effect_uncertain: reconcile before retry'
          : 'journal unavailable, lease lost or cancelled before send'
      )
    }
  }
}

export function createExamUploadTool(
  options: ExamEgressOptions
): ToolDefinition {
  const execute = createExecutor(options, 'exam.upload')
  return {
    id: 'exam.upload',
    version: 'v1',
    description:
      'Upload a workspace file to an allow-listed HTTPS endpoint (approval required).',
    inputSchema: INPUT_SCHEMA,
    outputSchema: {},
    risk: 'HIGH',
    sideEffect: 'EXTERNAL',
    idempotent: false,
    requiresApproval: true,
    sandbox: 'WORKSPACE',
    execute
  }
}

export function createExamDownloadTool(
  options: ExamEgressOptions
): ToolDefinition {
  const execute = createExecutor(options, 'exam.download')
  return {
    id: 'exam.download',
    version: 'v1',
    description:
      'Download a file from an allow-listed HTTPS endpoint into the workspace (approval required).',
    inputSchema: INPUT_SCHEMA,
    outputSchema: {},
    risk: 'HIGH',
    sideEffect: 'EXTERNAL',
    idempotent: false,
    requiresApproval: true,
    sandbox: 'WORKSPACE',
    execute
  }
}
