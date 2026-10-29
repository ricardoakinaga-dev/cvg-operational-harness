import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { SandboxHandle } from '@cvg/harness-contracts'
import {
  prepareProcessLaunch,
  type ProcessContainmentProfile,
  type PreparedProcessLaunch
} from './process-profile.ts'

export interface ContainedRunRequest {
  /** Pure argv array — never a shell string, never interpolated. */
  readonly argv: readonly string[]
  /** Handle granted by the sandbox gate; must allow subprocesses. */
  readonly handle: SandboxHandle
  readonly cwd?: string
  /** Defaults to `handle.deadlineMs`, then 30s. */
  readonly timeoutMs?: number
  readonly stdin?: string
  /** Pre-abort refuses launch; in-flight tree supervision belongs to X01. */
  readonly signal?: AbortSignal
  /** Explicit reviewed host profile; absence refuses native PROCESS. */
  readonly processProfile?: ProcessContainmentProfile
  /** Trusted override must match the backend captured by the profile. */
  readonly bwrapPath?: string
  /** Per-stream output cap; default 1 MiB. */
  readonly maxOutputBytes?: number
}

export interface ContainedRunResult {
  readonly exitCode: number | 'timeout' | 'spawn_failed'
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024

/**
 * Runs argv inside a bubblewrap namespace per the granted handle (SPEC 0196
 * §5): PID/IPC/UTS isolated, network unshared off, empty root with reviewed files, workspace
 * bound read-write. `spawn_failed` (bwrap missing, namespace setup refused)
 * is not an exit code — callers must map it to `unavailable`, never to a
 * normal result.
 */
export function runContained(
  request: ContainedRunRequest
): Promise<ContainedRunResult> {
  const { handle } = request
  const [program, ...rest] = request.argv
  const maxOutputBytes = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES

  const refused = (reason: string): Promise<ContainedRunResult> =>
    Promise.resolve({
      exitCode: 'spawn_failed',
      stdout: '',
      stderr: reason,
      truncated: false
    })

  if (request.signal?.aborted) {
    return refused('command_cancelled_before_launch')
  }
  if (!handle.allowSubprocess) {
    return refused('handle does not allow subprocesses')
  }
  if (program === undefined) {
    return refused('argv vazio')
  }

  const workspace = handle.workspaceRoot
  const cwd = request.cwd !== undefined ? resolve(request.cwd) : workspace
  if (cwd !== undefined) {
    if (workspace !== undefined) {
      const prefix = workspace.endsWith(sep) ? workspace : workspace + sep
      if (cwd !== workspace && !cwd.startsWith(prefix)) {
        return refused(`cwd fora do workspace: ${cwd}`)
      }
    }
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
      return refused(`cwd inexistente: ${cwd}`)
    }
  }

  let launch: PreparedProcessLaunch
  try {
    launch = prepareProcessLaunch({
      ...(request.processProfile ? { profile: request.processProfile } : {}),
      handle,
      argv: [program, ...rest],
      ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
      ...(request.bwrapPath !== undefined
        ? { bwrapPath: request.bwrapPath }
        : {})
    })
  } catch (error) {
    return refused(
      error instanceof Error ? error.message : 'process_profile_unavailable'
    )
  }
  if (request.signal?.aborted) {
    launch.close()
    return refused('command_cancelled_before_launch')
  }

  const timeoutMs = request.timeoutMs ?? handle.deadlineMs ?? DEFAULT_TIMEOUT_MS

  return new Promise<ContainedRunResult>((resolvePromise) => {
    let settled = false
    let timedOut = false
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let truncated = false

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(launch.executable, [...launch.args], {
        stdio: ['pipe', 'pipe', 'pipe', ...launch.fds],
        env: launch.env
      }) as ChildProcessWithoutNullStreams
    } catch {
      resolvePromise({
        exitCode: 'spawn_failed',
        stdout: '',
        stderr: 'contained_process_launch_failed',
        truncated: false
      })
      return
    } finally {
      launch.close()
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    const drain = (stream: 'stdout' | 'stderr', chunk: Buffer): void => {
      let bytes = stream === 'stdout' ? stdoutBytes : stderrBytes
      if (bytes >= maxOutputBytes) {
        truncated = true
        return
      }
      const room = maxOutputBytes - bytes
      const taken = chunk.length > room ? chunk.subarray(0, room) : chunk
      bytes += taken.length
      if (stream === 'stdout') {
        stdoutChunks.push(taken)
        stdoutBytes = bytes
      } else {
        stderrChunks.push(taken)
        stderrBytes = bytes
      }
      if (chunk.length > taken.length) truncated = true
    }

    child.stdout.on('data', (chunk: Buffer) => drain('stdout', chunk))
    child.stderr.on('data', (chunk: Buffer) => drain('stderr', chunk))

    const finish = (exitCode: number | 'timeout' | 'spawn_failed'): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolvePromise({
        exitCode,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        truncated
      })
    }

    child.on('error', () => {
      // ENOENT (bwrap ausente) and any other spawn fault are containment
      // failures, never a child exit status.
      finish('spawn_failed')
    })

    child.on('close', (code: number | null) => {
      if (timedOut) {
        finish('timeout')
        return
      }
      const stderrText = Buffer.concat(stderrChunks).toString('utf8')
      // bwrap reports namespace/setup faults itself before the child runs;
      // that is a containment failure, not the child's exit status.
      if (stderrText.startsWith('bwrap:')) {
        finish('spawn_failed')
        return
      }
      finish(code ?? 'spawn_failed')
    })

    if (request.stdin !== undefined) {
      child.stdin.end(request.stdin)
    } else {
      child.stdin.end()
    }
  })
}
