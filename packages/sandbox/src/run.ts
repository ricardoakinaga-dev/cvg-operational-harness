import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import type { SandboxHandle } from '@cvg/harness-contracts'
import type { ProcessContainmentProfile } from './process-profile.ts'
import { createProcessService } from './process-service/service.ts'
import type {
  ProcessCleanup,
  ProcessCause,
  ProcessService
} from './process-service/types.ts'

export interface ContainedRunRequest {
  /** Pure argv array — never a shell string, never interpolated. */
  readonly argv: readonly string[]
  /** Handle granted by the sandbox gate; must allow subprocesses. */
  readonly handle: SandboxHandle
  readonly cwd?: string
  /** Defaults to `handle.deadlineMs`, then 30s. */
  readonly timeoutMs?: number
  readonly stdin?: string
  /** Pre-abort refuses launch; an abort in flight stops the whole tree (SPEC 0286). */
  readonly signal?: AbortSignal
  /** Explicit reviewed host profile; absence refuses native PROCESS. */
  readonly processProfile?: ProcessContainmentProfile
  /** Trusted override must match the backend captured by the profile. */
  readonly bwrapPath?: string
  /** Per-stream output cap; default 1 MiB. */
  readonly maxOutputBytes?: number
}

export interface ContainedRunResult {
  readonly exitCode: number | 'timeout' | 'spawn_failed' | 'cancelled'
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
  /** What the process service observed when the launch ended; absent for pre-launch refusals. */
  readonly cleanup?: ProcessCleanup
  readonly cause?: ProcessCause
}

const DEFAULT_TIMEOUT_MS = 30_000
const STARTUP_MS = 30_000
const CLEANUP_MS = 5_000
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

  const timeoutMs = request.timeoutMs ?? handle.deadlineMs ?? DEFAULT_TIMEOUT_MS
  const stdin =
    request.stdin === undefined
      ? undefined
      : new TextEncoder().encode(request.stdin)

  return (async (): Promise<ContainedRunResult> => {
    let outcome
    try {
      const launched = await serviceFor(request.bwrapPath).launch({
        consumer: 'shell',
        // An absent or copied profile is refused by the launch preparation, with its own reason.
        profile: request.processProfile as ProcessContainmentProfile,
        handle,
        argv: [program, ...rest],
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        mode: 'oneshot',
        ...(stdin !== undefined ? { stdin } : {}),
        limits: {
          startupMs: STARTUP_MS,
          lifetimeMs: timeoutMs,
          cleanupMs: CLEANUP_MS,
          graceMs: 0,
          maxOutputBytes,
          maxStdinBytes: stdin?.length ?? 0
        },
        // The legacy runner kept a noisy process alive and dropped the excess.
        outputOverflow: 'drop',
        ...(request.signal ? { signal: request.signal } : {})
      })
      outcome = await launched.wait()
    } catch (error) {
      return {
        exitCode: 'spawn_failed',
        stdout: '',
        stderr:
          error instanceof Error
            ? error.message
            : 'process_service_unavailable',
        truncated: false
      }
    }
    const detail = {
      cleanup: outcome.cleanup,
      cause: outcome.cause
    }
    const text = {
      stdout: outcome.stdout ?? '',
      stderr: outcome.stderr ?? '',
      truncated: outcome.truncated
    }
    switch (outcome.cause) {
      case 'exit':
        return {
          exitCode: outcome.exitCode ?? 'spawn_failed',
          ...text,
          ...detail
        }
      case 'timeout':
        return { exitCode: 'timeout', ...text, ...detail }
      case 'cancelled':
      case 'dispose':
        return { exitCode: 'cancelled', ...text, ...detail }
      default:
        // spawn_failed, startup_timeout, signal, output_limit: containment or launcher
        // faults, never a normal exit status. The reason is the launcher's, not the payload's.
        return {
          exitCode: 'spawn_failed',
          ...text,
          stderr: text.stderr || outcome.secondaryErrors.join('; '),
          ...detail
        }
    }
  })()
}

const services = new Map<string, ProcessService>()
function serviceFor(bwrapPath: string | undefined): ProcessService {
  const key = bwrapPath ?? ''
  let service = services.get(key)
  if (!service) {
    service = createProcessService({
      maxConcurrent: 64,
      ...(bwrapPath !== undefined ? { bwrapPath } : {})
    })
    services.set(key, service)
  }
  return service
}
