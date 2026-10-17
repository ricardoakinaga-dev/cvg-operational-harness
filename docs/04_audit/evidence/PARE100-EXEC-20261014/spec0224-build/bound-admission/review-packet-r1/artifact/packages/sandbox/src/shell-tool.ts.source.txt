import { existsSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, sep } from 'node:path'
import type {
  SandboxHandle,
  ToolDefinition,
  ToolResult
} from '@cvg/harness-contracts'
import { confinePath } from './confine.ts'
import { runContained, type ContainedRunResult } from './run.ts'

export interface ShellRunRequest {
  /** Pure argv array — never a shell string, never interpolated. */
  readonly argv: readonly string[]
  /** Absolute directory, already confined to the workspace root. */
  readonly cwd: string
  /** Validated grant supplied by the governed execution context. */
  readonly handle: SandboxHandle
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly stdin?: string
}

export interface ShellRunResult {
  readonly exitCode: number | 'timeout' | 'spawn_failed'
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}

export interface ShellLimits {
  readonly maxArgs: number
  readonly maxArgLength: number
  readonly maxTotalArgBytes: number
  readonly maxTimeoutMs: number
  readonly defaultTimeoutMs: number
  readonly maxOutputBytes: number
  readonly maxStdinBytes: number
  readonly maxIntentLength: number
}

export interface ShellToolOptions {
  /** Absolute tenant workspace root; cwd is confined to it by realpath. */
  readonly workspaceRoot: string
  /**
   * Execution backend. Defaults to `runContained` (SPEC 0196 §5) with
   * the granted PROCESS handle; hosts/tests may inject a trusted runner.
   */
  readonly run?: (request: ShellRunRequest) => Promise<ShellRunResult>
  readonly limits?: Partial<ShellLimits>
}

const DEFAULT_LIMITS: ShellLimits = {
  maxArgs: 32,
  maxArgLength: 4096,
  maxTotalArgBytes: 32_768,
  maxTimeoutMs: 120_000,
  defaultTimeoutMs: 30_000,
  maxOutputBytes: 1024 * 1024,
  maxStdinBytes: 1024 * 1024,
  maxIntentLength: 200
}

/** Absolute ceilings regardless of composition overrides (SPEC 0198 §5). */
const OUTPUT_CEILING_BYTES = 8 * 1024 * 1024

const SHELL_BASE = {
  version: 'v1',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  requiresApproval: true
} as const

function clamp(value: number, fallback: number, ceiling: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.floor(value), ceiling)
}

function resolveLimits(over: Partial<ShellLimits> = {}): ShellLimits {
  const d = DEFAULT_LIMITS
  return {
    maxArgs: clamp(over.maxArgs ?? d.maxArgs, d.maxArgs, 256),
    maxArgLength: clamp(
      over.maxArgLength ?? d.maxArgLength,
      d.maxArgLength,
      65_536
    ),
    maxTotalArgBytes: clamp(
      over.maxTotalArgBytes ?? d.maxTotalArgBytes,
      d.maxTotalArgBytes,
      262_144
    ),
    maxTimeoutMs: clamp(
      over.maxTimeoutMs ?? d.maxTimeoutMs,
      d.maxTimeoutMs,
      600_000
    ),
    defaultTimeoutMs: clamp(
      over.defaultTimeoutMs ?? d.defaultTimeoutMs,
      d.defaultTimeoutMs,
      600_000
    ),
    maxOutputBytes: clamp(
      over.maxOutputBytes ?? d.maxOutputBytes,
      d.maxOutputBytes,
      OUTPUT_CEILING_BYTES
    ),
    maxStdinBytes: clamp(
      over.maxStdinBytes ?? d.maxStdinBytes,
      d.maxStdinBytes,
      OUTPUT_CEILING_BYTES
    ),
    maxIntentLength: clamp(
      over.maxIntentLength ?? d.maxIntentLength,
      d.maxIntentLength,
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

/**
 * The shell capability (SPEC 0198). Declares `sandbox: 'PROCESS'` so the
 * kernel seam of PDSH-010 gates every call behind bubblewrap, and
 * `requiresApproval: true` so the approval control decides every execution.
 * The body accepts only a pure argv array — there is no string-command path,
 * no interpolation and no login shell by construction.
 */
export function createShellTool(options: ShellToolOptions): ToolDefinition {
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
  const runner =
    options.run ??
    (async (request: ShellRunRequest): Promise<ShellRunResult> => {
      const result: ContainedRunResult = await runContained({
        argv: request.argv,
        cwd: request.cwd,
        timeoutMs: request.timeoutMs,
        maxOutputBytes: request.maxOutputBytes,
        ...(request.stdin !== undefined ? { stdin: request.stdin } : {}),
        handle: request.handle
      })
      return result
    })

  return {
    id: 'shell.run',
    ...SHELL_BASE,
    description:
      'Run one command inside the workspace sandbox (pure argv, no shell).',
    risk: 'HIGH',
    sideEffect: 'WRITE',
    idempotent: false,
    sandbox: 'PROCESS',
    execute: async (input, context) => {
      const handle = context?.sandboxHandle
      if (
        !handle ||
        handle.mode !== 'PROCESS' ||
        handle.allowSubprocess !== true ||
        typeof handle.allowNetwork !== 'boolean' ||
        typeof handle.workspaceRoot !== 'string' ||
        !isAbsolute(handle.workspaceRoot) ||
        handle.workspaceRoot.includes('\0') ||
        (handle.deadlineMs !== undefined &&
          (!Number.isFinite(handle.deadlineMs) || handle.deadlineMs <= 0))
      )
        return rejected('a valid governed PROCESS sandbox handle is required')
      let grantedRoot: string
      try {
        grantedRoot = realpathSync(handle.workspaceRoot)
        if (!statSync(grantedRoot).isDirectory())
          return rejected('sandbox workspaceRoot must be a directory')
      } catch {
        return rejected('sandbox workspaceRoot cannot be resolved')
      }
      const withinGrant = (path: string): boolean =>
        path === grantedRoot ||
        path.startsWith(
          grantedRoot.endsWith(sep) ? grantedRoot : grantedRoot + sep
        )
      if (!withinGrant(root))
        return rejected(
          'configured workspace root is outside the sandbox grant'
        )
      const record = input as Record<string, unknown> | null

      // Any string-command field is refused: interpolation never enters.
      for (const key of ['command', 'cmd', 'shell']) {
        if (record?.[key] !== undefined) {
          return rejected(
            'string commands are not accepted; pass a pure argv array'
          )
        }
      }

      const rawArgv = record?.['argv']
      if (!Array.isArray(rawArgv) || rawArgv.length === 0) {
        return rejected('argv must be a non-empty array of strings')
      }
      if (rawArgv.length > limits.maxArgs) {
        return rejected('argv exceeds maxArgs')
      }
      let totalBytes = 0
      const argv: string[] = []
      for (const element of rawArgv) {
        if (typeof element !== 'string' || element.length === 0) {
          return rejected('argv elements must be non-empty strings')
        }
        if (element.includes('\0')) {
          return rejected('argv elements must be free of NUL')
        }
        if (element.length > limits.maxArgLength) {
          return rejected('argv element exceeds maxArgLength')
        }
        totalBytes += Buffer.byteLength(element, 'utf8')
        argv.push(element)
      }
      if (totalBytes > limits.maxTotalArgBytes) {
        return rejected('argv exceeds maxTotalArgBytes')
      }

      const intentRaw = record?.['intent']
      if (typeof intentRaw !== 'string' || intentRaw.trim().length === 0) {
        return rejected('intent is required for shell commands')
      }
      if (intentRaw.trim().length > limits.maxIntentLength) {
        return rejected('intent exceeds maxIntentLength')
      }

      const rawCwd = record?.['cwd']
      const confined = confinePath(
        root,
        rawCwd === undefined || rawCwd === '' ? '.' : rawCwd
      )
      if (!confined.ok) return rejected(confined.error)
      if (!withinGrant(confined.abs))
        return rejected('cwd is outside the sandbox grant')
      let cwdStats: ReturnType<typeof statSync>
      try {
        cwdStats = statSync(confined.abs)
      } catch {
        return rejected('cwd does not exist')
      }
      if (!cwdStats.isDirectory()) {
        return rejected('cwd is not a directory')
      }

      const stdinRaw = record?.['stdin']
      if (stdinRaw !== undefined) {
        if (typeof stdinRaw !== 'string') {
          return rejected('stdin must be a string')
        }
        if (Buffer.byteLength(stdinRaw, 'utf8') > limits.maxStdinBytes) {
          return rejected('stdin exceeds maxStdinBytes')
        }
      }

      const timeoutMs = Math.min(
        limits.maxTimeoutMs,
        handle.deadlineMs ?? Infinity,
        clamp(
          typeof record?.['timeoutMs'] === 'number'
            ? record['timeoutMs']
            : Number.NaN,
          limits.defaultTimeoutMs,
          limits.maxTimeoutMs
        )
      )

      let result: ShellRunResult
      try {
        result = await runner({
          argv,
          cwd: confined.abs,
          // realpath established the granted directory's identity above.
          // Use that same identity as cwd at the backend boundary, retaining
          // every other grant and leaving the context handle untouched.
          handle: Object.freeze({ ...handle, workspaceRoot: grantedRoot }),
          timeoutMs,
          maxOutputBytes: limits.maxOutputBytes,
          ...(stdinRaw !== undefined ? { stdin: stdinRaw } : {})
        })
      } catch (error) {
        return failed(
          `shell runner failed: ${error instanceof Error ? error.message : 'unknown error'}`
        )
      }

      if (result.exitCode === 'spawn_failed') {
        return failed(
          `containment failed: the command could not be launched inside the sandbox${result.stderr ? `: ${result.stderr}` : ''}`
        )
      }
      if (result.exitCode === 'timeout') {
        return failed(`command timed out after ${timeoutMs}ms`)
      }
      return succeeded({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        truncated: result.truncated
      })
    }
  }
}
