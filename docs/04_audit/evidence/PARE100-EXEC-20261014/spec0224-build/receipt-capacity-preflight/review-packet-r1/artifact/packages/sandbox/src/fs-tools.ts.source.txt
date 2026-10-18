import { createHash, randomBytes } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { dirname, isAbsolute, join } from 'node:path'
import type { ToolDefinition, ToolResult } from '@cvg/harness-contracts'
import { TEMP_PREFIX, confinePath } from './confine.ts'

export interface FsWriteJournalEntry {
  readonly tenantId: string
  readonly operationKey: string
  readonly toolId: string
  readonly path: string
  readonly intent: string
  readonly action: 'write' | 'edit'
  readonly bytes: number
  readonly sha256: string
  readonly recordedAt: string
}

/** Dedicated pre-mutation ledger for write intents (SPEC 0197 §4). */
export interface FsWriteJournal {
  record(entry: FsWriteJournalEntry): Promise<void>
}

export interface FsLimits {
  readonly maxPathLength: number
  readonly maxReadBytes: number
  readonly maxWriteBytes: number
  readonly maxListEntries: number
  readonly maxIntentLength: number
}

export interface FsToolsOptions {
  /** Absolute tenant workspace root; every path is confined to it by realpath. */
  readonly workspaceRoot: string
  readonly writeJournal?: FsWriteJournal
  /** Fail closed: writes without a configured journal are REJECTED. */
  readonly requireWriteJournal?: boolean
  readonly limits?: Partial<FsLimits>
}

const DEFAULT_LIMITS: FsLimits = {
  maxPathLength: 4096,
  maxReadBytes: 1024 * 1024,
  maxWriteBytes: 1024 * 1024,
  maxListEntries: 500,
  maxIntentLength: 200
}

/** Absolute ceiling regardless of composition overrides (SPEC 0197 §5). */
const LIMIT_CEILING_BYTES = 8 * 1024 * 1024

const FS_BASE = {
  version: 'v1',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  requiresApproval: false
} as const

function clamp(value: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(Math.floor(value), ceiling)
}

function resolveLimits(over: Partial<FsLimits> = {}): FsLimits {
  return {
    maxPathLength: clamp(
      over.maxPathLength ?? DEFAULT_LIMITS.maxPathLength,
      4096
    ),
    maxReadBytes: clamp(
      over.maxReadBytes ?? DEFAULT_LIMITS.maxReadBytes,
      LIMIT_CEILING_BYTES
    ),
    maxWriteBytes: clamp(
      over.maxWriteBytes ?? DEFAULT_LIMITS.maxWriteBytes,
      LIMIT_CEILING_BYTES
    ),
    maxListEntries: clamp(
      over.maxListEntries ?? DEFAULT_LIMITS.maxListEntries,
      10_000
    ),
    maxIntentLength: clamp(
      over.maxIntentLength ?? DEFAULT_LIMITS.maxIntentLength,
      1000
    )
  }
}

const rejected = (error: string): ToolResult => ({
  status: 'REJECTED',
  error
})

const failed = (error: string): ToolResult => ({
  status: 'FAILED',
  error
})

const succeeded = (output: unknown): ToolResult => ({
  status: 'SUCCEEDED',
  output
})

function readBody(
  path: string,
  maxBytes: number
):
  | { readonly ok: true; readonly content: string; readonly bytes: number }
  | { readonly ok: false; readonly error: string } {
  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(path)
  } catch {
    return { ok: false, error: 'file does not exist' }
  }
  if (!stats.isFile()) {
    return { ok: false, error: 'path is not a regular file' }
  }
  if (stats.size > maxBytes) {
    return { ok: false, error: 'file exceeds maxReadBytes' }
  }
  try {
    const content = readFileSync(path, 'utf8')
    return { ok: true, content, bytes: Buffer.byteLength(content, 'utf8') }
  } catch {
    return { ok: false, error: 'file could not be read' }
  }
}

/** Atomic write: temp file in the same directory, then rename (SPEC 0197 §3). */
function writeAtomic(abs: string, content: string): void {
  const dir = dirname(abs)
  const temp = join(dir, `${TEMP_PREFIX}${randomBytes(8).toString('hex')}`)
  try {
    writeFileSync(temp, content, 'utf8')
    renameSync(temp, abs)
  } catch (error) {
    rmSync(temp, { force: true })
    throw error
  }
}

function intentOf(
  input: unknown,
  maxIntent: number
):
  | { readonly ok: true; readonly intent: string }
  | { readonly ok: false; readonly error: string } {
  const record = input as Record<string, unknown> | null
  const raw = record?.['intent']
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, error: 'intent is required for write operations' }
  }
  const intent = raw.trim()
  if (intent.length > maxIntent) {
    return { ok: false, error: 'intent exceeds maxIntentLength' }
  }
  return { ok: true, intent }
}

/**
 * The fs capability family (SPEC 0197). Every tool declares
 * `sandbox: 'WORKSPACE'` so the kernel seam of PDSH-010 gates each call, and
 * every path is re-confined here as defense in depth.
 */
export function createFsTools(
  options: FsToolsOptions
): readonly ToolDefinition[] {
  const rootRaw = options.workspaceRoot
  if (
    !isAbsolute(rootRaw) ||
    !existsSync(rootRaw) ||
    !statSync(rootRaw).isDirectory()
  ) {
    throw new Error(
      `workspaceRoot must be an existing absolute directory: ${rootRaw}`
    )
  }
  const root = realpathSync(rootRaw)
  const limits = resolveLimits(options.limits)
  const journal = options.writeJournal
  if (options.requireWriteJournal && !journal) {
    // Compositions that demand a journal boot-fail closed rather than ship
    // write tools that would later reject every call.
    throw new Error(
      'requireWriteJournal is set but no writeJournal was provided'
    )
  }

  const prepareWrite = (
    input: unknown
  ):
    | {
        readonly ok: true
        readonly rel: string
        readonly abs: string
        readonly intent: string
      }
    | { readonly ok: false; readonly result: ToolResult } => {
    const record = input as Record<string, unknown> | null
    const confined = confinePath(root, record?.['path'])
    if (!confined.ok) return { ok: false, result: rejected(confined.error) }
    const intent = intentOf(input, limits.maxIntentLength)
    if (!intent.ok) return { ok: false, result: rejected(intent.error) }
    if (!journal) {
      if (options.requireWriteJournal) {
        return {
          ok: false,
          result: rejected('write journal is not configured')
        }
      }
    }
    return {
      ok: true,
      rel: confined.rel,
      abs: confined.abs,
      intent: intent.intent
    }
  }

  const recordWrite = async (
    toolId: string,
    action: 'write' | 'edit',
    input: {
      readonly rel: string
      readonly intent: string
      readonly content: string
    },
    context: { readonly tenantId: string; readonly operationKey: string }
  ): Promise<string | undefined> => {
    if (!journal) return undefined
    try {
      await journal.record({
        tenantId: context.tenantId,
        operationKey: context.operationKey,
        toolId,
        path: input.rel,
        intent: input.intent,
        action,
        bytes: Buffer.byteLength(input.content, 'utf8'),
        sha256: createHash('sha256')
          .update(input.content, 'utf8')
          .digest('hex'),
        recordedAt: new Date().toISOString()
      })
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'journal failed'
    }
  }

  const readTool: ToolDefinition = {
    id: 'fs.read',
    ...FS_BASE,
    description: 'Read a UTF-8 file inside the tenant workspace.',
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    sandbox: 'WORKSPACE',
    execute: async (input) => {
      const confined = confinePath(
        root,
        (input as Record<string, unknown> | null)?.['path']
      )
      if (!confined.ok) return rejected(confined.error)
      const body = readBody(confined.abs, limits.maxReadBytes)
      if (!body.ok) return failed(body.error)
      return succeeded({
        path: confined.rel,
        content: body.content,
        bytes: body.bytes
      })
    }
  }

  const listTool: ToolDefinition = {
    id: 'fs.list',
    ...FS_BASE,
    description: 'List a directory inside the tenant workspace.',
    risk: 'LOW',
    sideEffect: 'READ',
    idempotent: true,
    sandbox: 'WORKSPACE',
    execute: async (input) => {
      const record = input as Record<string, unknown> | null
      const raw =
        record?.['path'] === undefined || record?.['path'] === ''
          ? '.'
          : record?.['path']
      const confined = confinePath(root, raw)
      if (!confined.ok) return rejected(confined.error)
      let entries: string[]
      try {
        entries = readdirSync(confined.abs)
      } catch {
        return failed('directory does not exist or cannot be read')
      }
      if (entries.length > limits.maxListEntries) {
        return failed('directory exceeds maxListEntries')
      }
      const listed = entries.map((name) => {
        try {
          const stats = lstatSync(join(confined.abs, name))
          const kind = stats.isFile()
            ? 'file'
            : stats.isDirectory()
              ? 'directory'
              : 'other'
          return { name, kind }
        } catch {
          return { name, kind: 'other' as const }
        }
      })
      return succeeded({ path: confined.rel, entries: listed })
    }
  }

  const writeTool: ToolDefinition = {
    id: 'fs.write',
    ...FS_BASE,
    description:
      'Create or replace a file in the tenant workspace (intent required).',
    risk: 'MEDIUM',
    sideEffect: 'WRITE',
    idempotent: false,
    sandbox: 'WORKSPACE',
    execute: async (input, context) => {
      const prepared = prepareWrite(input)
      if (!prepared.ok) return prepared.result
      const record = input as Record<string, unknown> | null
      const content = record?.['content']
      if (typeof content !== 'string') {
        return rejected('content must be a string')
      }
      const bytes = Buffer.byteLength(content, 'utf8')
      if (bytes > limits.maxWriteBytes) {
        return rejected('content exceeds maxWriteBytes')
      }
      const journaled = await recordWrite(
        'fs.write',
        'write',
        { rel: prepared.rel, intent: prepared.intent, content },
        {
          tenantId: context.tenantId,
          operationKey: context.operationKey ?? 'fs.write'
        }
      )
      if (journaled !== undefined) {
        // Fail closed: the intent ledger rejected the write, so no mutation.
        return failed(`write journal rejected the mutation: ${journaled}`)
      }
      try {
        writeAtomic(prepared.abs, content)
      } catch {
        return failed('file could not be written')
      }
      return succeeded({
        path: prepared.rel,
        bytes,
        sha256: createHash('sha256').update(content, 'utf8').digest('hex')
      })
    }
  }

  const editTool: ToolDefinition = {
    id: 'fs.edit',
    ...FS_BASE,
    description:
      'Replace the unique occurrence of a string in a workspace file (intent required).',
    risk: 'MEDIUM',
    sideEffect: 'WRITE',
    idempotent: false,
    sandbox: 'WORKSPACE',
    execute: async (input, context) => {
      const prepared = prepareWrite(input)
      if (!prepared.ok) return prepared.result
      const record = input as Record<string, unknown> | null
      const find = record?.['find']
      const replace = record?.['replace']
      if (typeof find !== 'string' || find.length === 0) {
        return rejected('find must be a non-empty string')
      }
      if (typeof replace !== 'string') {
        return rejected('replace must be a string')
      }
      const current = readBody(prepared.abs, limits.maxWriteBytes)
      if (!current.ok) return failed(current.error)
      const occurrences = current.content.split(find).length - 1
      if (occurrences === 0) {
        return failed('find string does not occur in the file')
      }
      if (occurrences > 1) {
        return failed('find string occurs more than once; refine the edit')
      }
      const next = current.content.replace(find, replace)
      const bytes = Buffer.byteLength(next, 'utf8')
      if (bytes > limits.maxWriteBytes) {
        return rejected('resulting content exceeds maxWriteBytes')
      }
      const journaled = await recordWrite(
        'fs.edit',
        'edit',
        { rel: prepared.rel, intent: prepared.intent, content: next },
        {
          tenantId: context.tenantId,
          operationKey: context.operationKey ?? 'fs.edit'
        }
      )
      if (journaled !== undefined) {
        return failed(`write journal rejected the mutation: ${journaled}`)
      }
      try {
        writeAtomic(prepared.abs, next)
      } catch {
        return failed('file could not be written')
      }
      return succeeded({
        path: prepared.rel,
        bytes,
        sha256: createHash('sha256').update(next, 'utf8').digest('hex')
      })
    }
  }

  return [readTool, listTool, writeTool, editTool]
}
