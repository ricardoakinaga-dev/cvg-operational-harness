import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { prepareProcessLaunch } from '../process-profile.ts'
import {
  checkEnvAllowlist,
  validateProcessEnv,
  type EnvAllowlist
} from './env.ts'
import { ProcessServiceError } from './errors.ts'
import { DEFAULT_LIMIT_CAPS, validateProcessLimits } from './limits.ts'
import {
  DEFAULT_PROC_ROOT,
  directChildren,
  inPidNamespace,
  readStartTime,
  sameProcess,
  scanPidNamespace,
  type PidNamespaceScan
} from './procfs.ts'
import { StatusChannel } from './status.ts'
import {
  PROCESS_CONSUMERS,
  type ProcessCause,
  type ProcessCleanup,
  type ProcessDisposeReport,
  type ProcessHandle,
  type ProcessLaunchRequest,
  type ProcessLimits,
  type ProcessOutcome,
  type ProcessService,
  type ProcessServiceLimitsCaps
} from './types.ts'

const ARGV_MAX_ENTRIES = 256
const ARGV_MAX_BYTES = 128 * 1024
const POLL_MS = 10

export interface ProcessServiceOptions {
  /** Host-owned env names per consumer; absent consumers get none. */
  readonly envAllowlist?: Partial<EnvAllowlist>
  readonly caps?: ProcessServiceLimitsCaps
  /** Concurrent launches (reserved slots); default 8. */
  readonly maxConcurrent?: number
  readonly bwrapPath?: string
  /** Test seams, host composition only: /proc root, the spawn function and the namespace observer. */
  readonly procRoot?: string
  readonly spawn?: typeof nodeSpawn
  readonly observe?: (inode: number, initPid?: number) => PidNamespaceScan
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function checkRequest(
  request: ProcessLaunchRequest,
  caps: ProcessServiceLimitsCaps
): ProcessLimits {
  const bad = (what: string): never => {
    throw new ProcessServiceError('invalid_request', `invalid ${what}`)
  }
  if (request === null || typeof request !== 'object') bad('request')
  if (!PROCESS_CONSUMERS.includes(request.consumer)) bad('consumer')
  if (request.mode !== 'oneshot' && request.mode !== 'persistent') bad('mode')
  if (request.profile === undefined || request.handle === undefined)
    bad('profile or handle')
  const argv = request.argv
  if (
    !Array.isArray(argv) ||
    argv.length === 0 ||
    argv.length > ARGV_MAX_ENTRIES
  )
    bad('argv')
  let bytes = 0
  for (const part of argv) {
    if (typeof part !== 'string' || part.includes('\0')) bad('argv')
    bytes += Buffer.byteLength(part, 'utf8') + 1
  }
  if (bytes > ARGV_MAX_BYTES) bad('argv')
  if (request.cwd !== undefined && typeof request.cwd !== 'string') bad('cwd')
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal))
    bad('signal')
  const limits = validateProcessLimits(request.limits, caps)
  if (request.stdin !== undefined) {
    if (!(request.stdin instanceof Uint8Array)) bad('stdin')
    if (request.stdin.length > limits.maxStdinBytes) bad('stdin size')
  }
  return limits
}

export function createProcessService(
  options: ProcessServiceOptions = {}
): ProcessService {
  const allowlist = checkEnvAllowlist({
    shell: [],
    'mcp-stdio': [],
    lsp: [],
    'document-conversion': [],
    ...options.envAllowlist
  })
  const caps = options.caps ?? DEFAULT_LIMIT_CAPS
  const maxConcurrent = options.maxConcurrent ?? 8
  const procRoot = options.procRoot ?? DEFAULT_PROC_ROOT
  const spawn = options.spawn ?? nodeSpawn
  const observe =
    options.observe ??
    ((inode: number, initPid?: number) =>
      scanPidNamespace(inode, {
        procRoot,
        exclude: [process.pid],
        ...(initPid !== undefined ? { initPid } : {})
      }))
  let reserved = 0
  let sequence = 0

  const launch = async (
    request: ProcessLaunchRequest
  ): Promise<ProcessHandle> => {
    const limits = checkRequest(request, caps)
    const env = validateProcessEnv(request.consumer, request.env, allowlist)
    if (request.mode === 'persistent')
      throw new ProcessServiceError(
        'unavailable',
        'persistent mode is not available yet'
      )
    if (reserved >= maxConcurrent)
      throw new ProcessServiceError('service_busy', 'too many launches')
    const id = `proc-${(sequence += 1)}-${randomBytes(4).toString('hex')}`
    const release = ((): (() => void) => {
      reserved += 1
      let done = false
      return () => {
        if (!done) {
          done = true
          reserved -= 1
        }
      }
    })()

    const nothingLaunched = (
      cause: ProcessCause,
      secondary: readonly string[]
    ): ProcessHandle => {
      release()
      const outcome: ProcessOutcome = {
        cause,
        exitCode: null,
        signal: null,
        stdout: '',
        stderr: '',
        truncated: false,
        cleanup: {
          state: 'clean',
          observed: 'proc-pidns',
          leftover: 0,
          unverified: 0
        },
        profile: 'namespace-observed',
        ownerIndependent: false,
        secondaryErrors: secondary
      }
      return {
        id,
        wait: () => Promise.resolve(outcome),
        stop: () => Promise.resolve(outcome)
      }
    }

    if (request.signal?.aborted) return nothingLaunched('cancelled', [])

    let prepared
    try {
      prepared = prepareProcessLaunch({
        profile: request.profile,
        handle: request.handle,
        argv: request.argv,
        ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
        ...(options.bwrapPath !== undefined
          ? { bwrapPath: options.bwrapPath }
          : {}),
        statusFd: true,
        env
      })
    } catch (error) {
      return nothingLaunched('spawn_failed', [
        error instanceof Error ? error.message : 'process_profile_unavailable'
      ])
    }
    if (request.signal?.aborted) {
      prepared.close()
      return nothingLaunched('cancelled', [])
    }

    let child: ChildProcess
    try {
      child = spawn(prepared.executable, [...prepared.args], {
        stdio: ['pipe', 'pipe', 'pipe', ...prepared.fds, 'pipe'],
        env: prepared.env,
        detached: true
      })
    } catch {
      prepared.close()
      return nothingLaunched('spawn_failed', [
        'contained_process_launch_failed'
      ])
    } finally {
      prepared.close()
    }
    return supervise({
      id,
      child,
      statusIndex: prepared.statusFdIndex!,
      limits,
      request,
      procRoot,
      observe,
      release
    })
  }

  // The disposer lands with slice 4; until then it only reports an empty service.
  const dispose = (): Promise<ProcessDisposeReport> =>
    Promise.resolve({ stopped: 0, clean: 0, cleanupFailed: 0 })

  return { launch, dispose }
}

interface Supervision {
  readonly id: string
  readonly child: ChildProcess
  readonly statusIndex: number
  readonly limits: ProcessLimits
  readonly request: ProcessLaunchRequest
  readonly procRoot: string
  readonly observe: (inode: number, initPid?: number) => PidNamespaceScan
  readonly release: () => void
}

/** One launch: first cause wins, one cleanup task, outcome published once (SPEC 0286 I3-I5). */
function supervise(s: Supervision): ProcessHandle {
  const { child, limits, procRoot } = s
  const status = new StatusChannel()
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  const secondary: string[] = []
  let outBytes = 0
  let errBytes = 0
  let truncated = false
  let cause: ProcessCause | undefined
  let cleanupTask: Promise<void> | undefined
  let childStart: string | undefined
  let initPid: number | undefined
  let initStart: string | undefined
  let nsInode: number | undefined
  let closed = false
  let resolveClosed!: () => void
  const closedPromise = new Promise<void>(
    (resolve) => (resolveClosed = resolve)
  )
  let resolveOutcome!: (outcome: ProcessOutcome) => void
  const outcomePromise = new Promise<ProcessOutcome>(
    (resolve) => (resolveOutcome = resolve)
  )

  if (child.pid !== undefined) childStart = readStartTime(child.pid, procRoot)

  const signalIfSame = (
    pid: number | undefined,
    start: string | undefined,
    signal: NodeJS.Signals,
    group: boolean,
    label: string
  ): void => {
    if (pid === undefined || start === undefined) return
    // Never signal a number whose identity is not the one captured at launch (I9).
    if (!sameProcess(pid, start, procRoot)) return
    try {
      process.kill(group ? -pid : pid, signal)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ESRCH') secondary.push(`kill_${label}_${code ?? 'unknown'}`)
    }
  }

  const settle = async (): Promise<void> => {
    if (child.stdin && !child.stdin.destroyed) child.stdin.destroy()
    const deadline = Date.now() + limits.cleanupMs
    const alive = (): boolean =>
      !closed && child.exitCode === null && child.signalCode === null
    if (alive()) {
      // The polite request goes to the payload (the namespace init is only bubblewrap's reaper,
      // which ignores SIGTERM, and a SIGTERM to the launcher would take the payload down with it
      // before it could react).
      if (
        limits.graceMs > 0 &&
        cause !== 'output_limit' &&
        nsInode !== undefined
      ) {
        for (const pid of directChildren(
          s.observe(nsInode, initPid).members,
          initPid!,
          procRoot
        ))
          if (inPidNamespace(pid, nsInode, procRoot, initPid))
            try {
              process.kill(pid, 'SIGTERM')
            } catch {
              /* already gone */
            }
        await Promise.race([closedPromise, delay(limits.graceMs)])
      }
      if (!closed) {
        signalIfSame(child.pid, childStart, 'SIGKILL', true, 'group')
        signalIfSame(initPid, initStart, 'SIGKILL', false, 'init')
      }
    }
    await Promise.race([
      closedPromise,
      delay(Math.max(0, deadline - Date.now()))
    ])
    let scan: PidNamespaceScan = { members: [], unverified: 0 }
    if (nsInode !== undefined) {
      for (;;) {
        scan = s.observe(nsInode, initPid)
        if (scan.members.length === 0 || Date.now() >= deadline) break
        for (const pid of scan.members)
          if (inPidNamespace(pid, nsInode, procRoot, initPid)) {
            try {
              process.kill(pid, 'SIGKILL')
            } catch {
              /* already gone */
            }
          }
        await delay(POLL_MS)
      }
      // A last look after the final signals, so `leftover` reflects the end state.
      if (scan.members.length > 0 && Date.now() >= deadline)
        scan = s.observe(nsInode, initPid)
    }
    const snapshot = status.snapshot()
    let unverified = scan.unverified
    // A namespace we never learned about cannot be proven empty, unless nothing ever started.
    if (
      nsInode === undefined &&
      (snapshot.invalid || cause === 'startup_timeout')
    ) {
      unverified += 1
      secondary.push('namespace_unknown')
    }
    if (!closed) secondary.push('launcher_not_reaped')
    const cleanup: ProcessCleanup = {
      state:
        closed && scan.members.length === 0 && unverified === 0
          ? 'clean'
          : 'cleanup_failed',
      observed: 'proc-pidns',
      leftover: scan.members.length,
      unverified
    }
    if (cleanup.state === 'cleanup_failed' && scan.members.length > 0)
      secondary.push(`cleanup_incomplete:${scan.members.length}`)
    const exitFromStatus = snapshot.exitCode
    const outcome: ProcessOutcome = {
      cause: cause ?? 'exit',
      // Only a voluntary exit carries the payload's code; forced ends never borrow one.
      exitCode: cause === 'exit' ? (exitFromStatus ?? child.exitCode) : null,
      signal: child.signalCode,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
      truncated,
      cleanup,
      profile: 'namespace-observed',
      ownerIndependent: false,
      secondaryErrors: [...secondary]
    }
    cleanupTimersAndListeners()
    s.release()
    resolveOutcome(outcome)
  }

  const trigger = (why: ProcessCause): void => {
    if (cause === undefined) cause = why
    cleanupTask ??= settle()
  }

  const startupTimer = setTimeout(
    () => trigger('startup_timeout'),
    limits.startupMs
  )
  const lifetimeTimer = setTimeout(() => trigger('timeout'), limits.lifetimeMs)
  const onAbort = (): void => trigger('cancelled')
  s.request.signal?.addEventListener('abort', onAbort, { once: true })
  function cleanupTimersAndListeners(): void {
    clearTimeout(startupTimer)
    clearTimeout(lifetimeTimer)
    s.request.signal?.removeEventListener('abort', onAbort)
  }

  const take = (which: 'out' | 'err', chunk: Buffer): void => {
    const sink = which === 'out' ? stdout : stderr
    let bytes = which === 'out' ? outBytes : errBytes
    const room = limits.maxOutputBytes - bytes
    const kept =
      chunk.length > room ? chunk.subarray(0, Math.max(0, room)) : chunk
    if (kept.length > 0) sink.push(kept)
    bytes += kept.length
    if (which === 'out') outBytes = bytes
    else errBytes = bytes
    if (chunk.length > kept.length) {
      truncated = true
      trigger('output_limit')
    }
  }
  child.stdout?.on('data', (chunk: Buffer) => take('out', chunk))
  child.stderr?.on('data', (chunk: Buffer) => take('err', chunk))
  const statusPipe = child.stdio[s.statusIndex]
  statusPipe?.on('data', (chunk: Buffer) => {
    status.feed(chunk)
    const snap = status.snapshot()
    if (initPid === undefined && snap.childPid !== undefined) {
      initPid = snap.childPid
      initStart = readStartTime(initPid, procRoot)
      nsInode = snap.pidNamespace
      clearTimeout(startupTimer)
    }
  })
  child.stdin?.on('error', () => undefined)
  statusPipe?.on('error', () => undefined)
  child.stdout?.on('error', () => undefined)
  child.stderr?.on('error', () => undefined)

  child.once('error', () => {
    secondary.push('spawn_error')
    trigger('spawn_failed')
    // No process exists to be reaped.
    if (child.pid === undefined) {
      closed = true
      resolveClosed()
    }
  })
  child.once('close', () => {
    closed = true
    resolveClosed()
    if (cause === undefined) {
      const snap = status.snapshot()
      if (snap.invalid) {
        secondary.push('status_channel_invalid')
        trigger('spawn_failed')
      } else if (snap.childPid === undefined) {
        secondary.push(
          `launcher_exit_${child.exitCode ?? child.signalCode ?? 'unknown'}`
        )
        trigger('spawn_failed')
      } else if (child.signalCode !== null && snap.exitCode === undefined)
        trigger('signal')
      else trigger('exit')
    } else cleanupTask ??= settle()
  })

  if (s.request.stdin !== undefined && s.request.stdin.length > 0)
    child.stdin?.end(s.request.stdin)
  else child.stdin?.end()

  return {
    id: s.id,
    wait: () => outcomePromise,
    stop: () => {
      trigger('cancelled')
      return outcomePromise
    }
  }
}
