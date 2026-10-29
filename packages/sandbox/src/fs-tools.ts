import { createHash, randomBytes } from 'node:crypto'
import {
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult
} from '@cvg/harness-contracts'
import { TEMP_PREFIX, confinePath } from './confine.ts'
import {
  atFd,
  closeQuietly,
  directoryDescriptorsAvailable,
  isSymlinkAt,
  openDirectoryChain,
  openFileAt,
  sameDirectory
} from './dir-fd.ts'

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

const SYMLINK_IN_PATH = 'path traverses a symlink'

/** Reads `name` inside the directory behind `dirFd`, never following it. */
function readBodyAt(
  dirFd: number,
  name: string,
  maxBytes: number
):
  | { readonly ok: true; readonly content: string; readonly bytes: number }
  | { readonly ok: false; readonly result: ToolResult } {
  const opened = openFileAt(
    dirFd,
    name,
    constants.O_RDONLY | constants.O_NONBLOCK
  )
  if (!opened.ok) {
    if (opened.reason === 'symlink') {
      return { ok: false, result: rejected(SYMLINK_IN_PATH) }
    }
    return {
      ok: false,
      result: failed(
        opened.reason === 'missing'
          ? 'file does not exist'
          : 'file could not be read'
      )
    }
  }
  try {
    const stats = fstatSync(opened.fd)
    if (!stats.isFile()) {
      return { ok: false, result: failed('path is not a regular file') }
    }
    if (stats.size > maxBytes) {
      return { ok: false, result: failed('file exceeds maxReadBytes') }
    }
    try {
      // Read at most maxBytes + 1 so a file that grows after fstat is still
      // refused instead of being read to EOF.
      const buffer = Buffer.alloc(maxBytes + 1)
      let total = 0
      for (;;) {
        const read = readSync(
          opened.fd,
          buffer,
          total,
          buffer.length - total,
          null
        )
        if (read === 0) break
        total += read
        if (total > maxBytes) {
          return { ok: false, result: failed('file exceeds maxReadBytes') }
        }
      }
      const content = buffer.toString('utf8', 0, total)
      return { ok: true, content, bytes: Buffer.byteLength(content, 'utf8') }
    } catch {
      return { ok: false, result: failed('file could not be read') }
    }
  } finally {
    closeQuietly(opened.fd)
  }
}

/**
 * Atomic write bound to the directory behind `dirFd`: temp file created with
 * O_EXCL|O_NOFOLLOW, fsync, then rename inside that same directory (SPEC 0197
 * §3, SPEC 0270 §3.2). A renamed or swapped path cannot redirect it.
 */
function writeAtomicAt(dirFd: number, name: string, content: string): void {
  const temp = `${TEMP_PREFIX}${randomBytes(8).toString('hex')}`
  const opened = openFileAt(
    dirFd,
    temp,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
    0o666
  )
  if (!opened.ok) throw new Error('temp file could not be created')
  try {
    try {
      writeFileSync(opened.fd, content, 'utf8')
      fsyncSync(opened.fd)
    } finally {
      closeQuietly(opened.fd)
    }
    renameSync(atFd(dirFd, temp), atFd(dirFd, name))
  } catch (error) {
    try {
      unlinkSync(atFd(dirFd, temp))
    } catch {
      // The temp file was never created or is already gone.
    }
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
 * The fs capability family (SPEC 0197, SPEC 0270). Every tool declares
 * `sandbox: 'WORKSPACE'` so the kernel seam of PDSH-010 gates each call; each
 * call must carry the governed handle, the configured root must lie inside its
 * grant, and every path is walked component by component from directory
 * descriptors without following symlinks.
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
  if (!directoryDescriptorsAvailable()) {
    // Directory-bound operations need /proc/self/fd (SPEC 0270 §3.2, D3);
    // without it the factory boot-fails closed instead of using names.
    throw new Error(
      'fs tools require Linux /proc/self/fd for directory-bound operations'
    )
  }
  const limits = resolveLimits(options.limits)
  const journal = options.writeJournal
  if (options.requireWriteJournal && !journal) {
    // Compositions that demand a journal boot-fail closed rather than ship
    // write tools that would later reject every call.
    throw new Error(
      'requireWriteJournal is set but no writeJournal was provided'
    )
  }

  /**
   * The governed handle bounds the root (SPEC 0270 §3.1): it must be a valid
   * WORKSPACE/PROCESS grant and the configured root must lie inside it. The
   * handle only narrows; the effective root stays the configured one.
   */
  const grantError = (
    context: ToolExecutionContext | undefined
  ): string | undefined => {
    const handle = context?.sandboxHandle
    if (
      !handle ||
      (handle.mode !== 'WORKSPACE' && handle.mode !== 'PROCESS') ||
      typeof handle.allowNetwork !== 'boolean' ||
      typeof handle.allowSubprocess !== 'boolean' ||
      typeof handle.workspaceRoot !== 'string' ||
      !isAbsolute(handle.workspaceRoot) ||
      handle.workspaceRoot.includes('\0') ||
      (handle.deadlineMs !== undefined &&
        (!Number.isFinite(handle.deadlineMs) || handle.deadlineMs <= 0))
    ) {
      return 'a valid governed WORKSPACE sandbox handle is required'
    }
    let grantedRoot: string
    try {
      grantedRoot = realpathSync(handle.workspaceRoot)
      if (!statSync(grantedRoot).isDirectory()) {
        return 'sandbox workspaceRoot must be a directory'
      }
    } catch {
      return 'sandbox workspaceRoot cannot be resolved'
    }
    const prefix = grantedRoot.endsWith(sep) ? grantedRoot : grantedRoot + sep
    if (root !== grantedRoot && !root.startsWith(prefix)) {
      return 'configured workspace root is outside the sandbox grant'
    }
    return undefined
  }

  /** Textual confinement plus the nominal components walked by descriptor. */
  const locate = (
    raw: unknown
  ):
    | {
        readonly ok: true
        readonly rel: string
        readonly parts: readonly string[]
      }
    | { readonly ok: false; readonly result: ToolResult } => {
    const confined = confinePath(root, raw)
    if (!confined.ok) return { ok: false, result: rejected(confined.error) }
    const nominal = relative(root, resolve(root, (raw as string).trim()))
    const parts = nominal === '' ? [] : nominal.split(sep)
    if (parts.some((part) => part.startsWith(TEMP_PREFIX))) {
      return {
        ok: false,
        result: rejected('path uses the reserved temp namespace')
      }
    }
    return { ok: true, rel: nominal === '' ? '.' : nominal, parts }
  }

  const prepareWrite = (
    input: unknown,
    context: ToolExecutionContext | undefined
  ):
    | {
        readonly ok: true
        readonly rel: string
        readonly parentParts: readonly string[]
        readonly name: string
        readonly intent: string
      }
    | { readonly ok: false; readonly result: ToolResult } => {
    const denied = grantError(context)
    if (denied !== undefined) return { ok: false, result: rejected(denied) }
    const record = input as Record<string, unknown> | null
    const target = locate(record?.['path'])
    if (!target.ok) return target
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
    const name = target.parts.at(-1)
    if (name === undefined) {
      return { ok: false, result: failed('path is not a regular file') }
    }
    return {
      ok: true,
      rel: target.rel,
      parentParts: target.parts.slice(0, -1),
      name,
      intent: intent.intent
    }
  }

  /**
   * Re-checks the held parent after the journal await, then writes through it.
   * A path changed meanwhile fails closed without writing (SPEC 0270 §3.2).
   */
  const commitWrite = (
    parentFd: number,
    parentParts: readonly string[],
    name: string,
    content: string
  ): ToolResult | undefined => {
    if (!sameDirectory(parentFd, root, parentParts)) {
      return failed('workspace directory changed during the operation')
    }
    try {
      writeAtomicAt(parentFd, name, content)
    } catch {
      return failed('file could not be written')
    }
    return undefined
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
    execute: async (input, context) => {
      const denied = grantError(context)
      if (denied !== undefined) return rejected(denied)
      const target = locate((input as Record<string, unknown> | null)?.['path'])
      if (!target.ok) return target.result
      const name = target.parts.at(-1)
      if (name === undefined) return failed('path is not a regular file')
      const parent = openDirectoryChain(root, target.parts.slice(0, -1))
      if (!parent.ok) {
        return parent.reason === 'symlink'
          ? rejected(SYMLINK_IN_PATH)
          : failed('file does not exist')
      }
      try {
        const body = readBodyAt(parent.fd, name, limits.maxReadBytes)
        if (!body.ok) return body.result
        return succeeded({
          path: target.rel,
          content: body.content,
          bytes: body.bytes
        })
      } finally {
        closeQuietly(parent.fd)
      }
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
    execute: async (input, context) => {
      const denied = grantError(context)
      if (denied !== undefined) return rejected(denied)
      const record = input as Record<string, unknown> | null
      const raw =
        record?.['path'] === undefined || record?.['path'] === ''
          ? '.'
          : record?.['path']
      const target = locate(raw)
      if (!target.ok) return target.result
      const dir = openDirectoryChain(root, target.parts)
      if (!dir.ok) {
        return dir.reason === 'symlink'
          ? rejected(SYMLINK_IN_PATH)
          : failed('directory does not exist or cannot be read')
      }
      try {
        let entries: string[]
        try {
          entries = readdirSync(atFd(dir.fd))
        } catch {
          return failed('directory does not exist or cannot be read')
        }
        if (entries.length > limits.maxListEntries) {
          return failed('directory exceeds maxListEntries')
        }
        const listed = entries.map((name) => {
          try {
            const stats = lstatSync(atFd(dir.fd, name))
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
        return succeeded({ path: target.rel, entries: listed })
      } finally {
        closeQuietly(dir.fd)
      }
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
      const prepared = prepareWrite(input, context)
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
      // Hold the parent before the journal await so a later swap of the path
      // cannot move the write (SPEC 0270 §3.2). A missing parent keeps the
      // SPEC 0197 order: journal first, then the write fails.
      const parent = openDirectoryChain(root, prepared.parentParts)
      if (!parent.ok && parent.reason === 'symlink') {
        return rejected(SYMLINK_IN_PATH)
      }
      // Invariant 4 / D2: a final symlink is refused, not replaced, even when
      // it points inside the workspace.
      if (parent.ok && isSymlinkAt(parent.fd, prepared.name)) {
        closeQuietly(parent.fd)
        return rejected(SYMLINK_IN_PATH)
      }
      try {
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
        if (!parent.ok) return failed('file could not be written')
        const refused = commitWrite(
          parent.fd,
          prepared.parentParts,
          prepared.name,
          content
        )
        if (refused !== undefined) return refused
      } finally {
        if (parent.ok) closeQuietly(parent.fd)
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
      const prepared = prepareWrite(input, context)
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
      const parent = openDirectoryChain(root, prepared.parentParts)
      if (!parent.ok) {
        return parent.reason === 'symlink'
          ? rejected(SYMLINK_IN_PATH)
          : failed('file does not exist')
      }
      try {
        const current = readBodyAt(
          parent.fd,
          prepared.name,
          limits.maxWriteBytes
        )
        if (!current.ok) return current.result
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
        const refused = commitWrite(
          parent.fd,
          prepared.parentParts,
          prepared.name,
          next
        )
        if (refused !== undefined) return refused
        return succeeded({
          path: prepared.rel,
          bytes,
          sha256: createHash('sha256').update(next, 'utf8').digest('hex')
        })
      } finally {
        closeQuietly(parent.fd)
      }
    }
  }

  return [readTool, listTool, writeTool, editTool]
}
