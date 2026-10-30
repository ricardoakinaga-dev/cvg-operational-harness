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
import { LandlockStatusChannel } from './landlock-status.ts'
import { StatusChannel } from './status.ts'
import {
  PROCESS_CONSUMERS,
  type ProcessCause,
  type ProcessChunk,
  type ProcessCleanup,
  type ProcessDisposeReport,
  type ProcessHandle,
  type ProcessInput,
  type ProcessLaunchRequest,
  type ProcessLimits,
  type ProcessOutcome,
  type ProcessService,
  type ProcessServiceLimitsCaps
} from './types.ts'

const ARGV_MAX_ENTRIES = 256
const ARGV_MAX_BYTES = 128 * 1024
const POLL_MS = 10
const NS_WAIT_MS = 250

export interface ProcessServiceOptions {
  /** Host-owned env names per consumer; absent consumers get none. */
  readonly envAllowlist?: Partial<EnvAllowlist>
  readonly caps?: ProcessServiceLimitsCaps
  /** Concurrent launches (reserved slots); default 8. */
  readonly maxConcurrent?: number
  readonly bwrapPath?: string
  /**
   * SPEC 0288: every launch runs under the profile's Landlock helper and must prove the
   * ruleset on its private channel; a profile without the helper launches nothing.
   */
  readonly requireLandlock?: boolean
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
  // The profile itself (absent, copied, stale) is judged by the launch preparation.
  if (request.handle === undefined || request.handle === null) bad('handle')
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
  if (
    request.outputOverflow !== undefined &&
    request.outputOverflow !== 'terminate' &&
    request.outputOverflow !== 'drop'
  )
    bad('outputOverflow')
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal))
    bad('signal')
  const limits = validateProcessLimits(request.limits, caps)
  if (request.mode === 'persistent' && request.stdin !== undefined)
    bad('stdin for a persistent launch')
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
  let state: 'active' | 'closing' = 'active'
  const active = new Set<Supervised>()
  let disposal: Promise<ProcessDisposeReport> | undefined

  const launch = async (
    request: ProcessLaunchRequest
  ): Promise<ProcessHandle> => {
    if (state !== 'active')
      throw new ProcessServiceError('service_closed', 'the service is closed')
    const limits = checkRequest(request, caps)
    const env = validateProcessEnv(request.consumer, request.env, allowlist)
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
        landlock: { applied: false },
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
        env,
        ...(options.requireLandlock === true ? { landlock: true } : {})
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
        stdio: [
          'pipe',
          'pipe',
          'pipe',
          ...prepared.fds,
          'pipe',
          ...(prepared.landlock ? (['pipe', 'pipe'] as const) : [])
        ],
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
    if (prepared.landlock) {
      // The helper reads its ruleset to EOF before anything else, then closes the channel.
      const rules = child.stdio[prepared.landlock.rulesFdIndex] as
        | NodeJS.WritableStream
        | null
        | undefined
      rules?.on('error', () => undefined)
      rules?.end(prepared.landlock.rules)
    }
    const supervised = supervise({
      id,
      child,
      statusIndex: prepared.statusFdIndex!,
      ...(prepared.landlock
        ? { landlockStatusIndex: prepared.landlock.statusFdIndex }
        : {}),
      limits,
      request,
      procRoot,
      observe,
      release
    })
    active.add(supervised)
    void supervised.handle.wait().then(() => active.delete(supervised))
    return supervised.handle
  }

  // Closes admission, stops every live launch through the same single cleanup (I4, I10) and
  // reports what was found. A repeated call returns the same report.
  const dispose = (): Promise<ProcessDisposeReport> =>
    (disposal ??= (async () => {
      state = 'closing'
      const live = [...active]
      const outcomes = await Promise.all(
        live.map((l) => l.terminate('dispose'))
      )
      return {
        stopped: live.length,
        clean: outcomes.filter((o) => o.cleanup.state === 'clean').length,
        cleanupFailed: outcomes.filter((o) => o.cleanup.state !== 'clean')
          .length
      }
    })())

  return { launch, dispose }
}

interface Supervision {
  readonly id: string
  readonly child: ChildProcess
  readonly statusIndex: number
  /** Present only for a Landlock launch: the helper's private status channel. */
  readonly landlockStatusIndex?: number
  readonly limits: ProcessLimits
  readonly request: ProcessLaunchRequest
  readonly procRoot: string
  readonly observe: (inode: number, initPid?: number) => PidNamespaceScan
  readonly release: () => void
}

/** One launch: first cause wins, one cleanup task, outcome published once (SPEC 0286 I3-I5). */
interface Supervised {
  readonly handle: ProcessHandle
  terminate(cause: 'dispose'): Promise<ProcessOutcome>
}

function supervise(s: Supervision): Supervised {
  const { child, limits, procRoot } = s
  const status = new StatusChannel()
  const landlock =
    s.landlockStatusIndex !== undefined
      ? new LandlockStatusChannel()
      : undefined
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
  let resolveNsKnown!: () => void
  const nsKnown = new Promise<void>((resolve) => (resolveNsKnown = resolve))
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
    // A held (back-pressured) stream would never end: tear-down releases it.
    child.stdout?.resume()
    child.stderr?.resume()
    const deadline = Date.now() + limits.cleanupMs
    const alive = (): boolean =>
      !closed && child.exitCode === null && child.signalCode === null
    // Learn the namespace before killing anything: a launch ended this early is otherwise
    // unprovable. Bounded, and inside the cleanup budget.
    if (nsInode === undefined && alive())
      await Promise.race([
        nsKnown,
        closedPromise,
        delay(Math.min(NS_WAIT_MS, limits.cleanupMs))
      ])
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
    // Only a launcher that exited on its own without ever naming a child provably started
    // nothing; every other end without a known namespace cannot be proven empty.
    if (
      nsInode === undefined &&
      (snapshot.invalid || cause !== 'spawn_failed')
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
      ...(persistent
        ? {}
        : {
            stdout: Buffer.concat(stdout).toString('utf8'),
            stderr: Buffer.concat(stderr).toString('utf8')
          }),
      truncated,
      cleanup,
      profile: 'namespace-observed',
      ownerIndependent: false,
      landlock: landlock ? landlock.report() : { applied: false },
      secondaryErrors: [...secondary]
    }
    cleanupTimersAndListeners()
    s.release()
    finished = true
    pump()
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

  const persistent = s.request.mode === 'persistent'
  // Persistent output: bounded queue with backpressure (I8).
  const queue: ProcessChunk[] = []
  const waiters: Array<(r: IteratorResult<ProcessChunk>) => void> = []
  let queuedBytes = 0
  let held = false
  let finished = false
  let consumerGone = false
  const pump = (): void => {
    while (waiters.length > 0 && queue.length > 0) {
      const chunk = queue.shift()!
      queuedBytes -= chunk.bytes.length
      waiters.shift()!({ value: chunk, done: false })
    }
    if (held && queuedBytes < limits.maxOutputBytes / 2) {
      held = false
      child.stdout?.resume()
      child.stderr?.resume()
    }
    if (finished && queue.length === 0)
      while (waiters.length > 0)
        waiters.shift()!({ value: undefined, done: true })
  }
  const enqueue = (which: 'out' | 'err', chunk: Buffer): void => {
    if (consumerGone || cleanupTask !== undefined) return
    queue.push({
      stream: which === 'out' ? 'stdout' : 'stderr',
      bytes: new Uint8Array(chunk)
    })
    queuedBytes += chunk.length
    pump()
    if (queuedBytes >= limits.maxOutputBytes && !held) {
      held = true
      child.stdout?.pause()
      child.stderr?.pause()
    }
  }
  const output: AsyncIterable<ProcessChunk> = {
    [Symbol.asyncIterator]: () => ({
      next: () =>
        new Promise<IteratorResult<ProcessChunk>>((resolve) => {
          waiters.push(resolve)
          pump()
        }),
      return: () => {
        // The consumer left: nothing will read, so nothing is kept.
        consumerGone = true
        queue.length = 0
        queuedBytes = 0
        pump()
        return Promise.resolve({ value: undefined, done: true as const })
      }
    })
  }
  let stdinBytes = 0
  let stdinEnded = false
  const stdinClosed = (): ProcessServiceError =>
    new ProcessServiceError('invalid_request', 'stdin is closed')
  const input: ProcessInput = {
    write: (chunk) => {
      if (stdinEnded || cleanupTask !== undefined || !child.stdin)
        return Promise.reject(stdinClosed())
      if (!(chunk instanceof Uint8Array))
        return Promise.reject(
          new ProcessServiceError('invalid_request', 'invalid stdin chunk')
        )
      if (stdinBytes + chunk.length > limits.maxStdinBytes)
        return Promise.reject(
          new ProcessServiceError('invalid_request', 'stdin limit reached')
        )
      stdinBytes += chunk.length
      return new Promise<void>((resolve, reject) => {
        child.stdin!.write(chunk, (error) =>
          error ? reject(stdinClosed()) : resolve()
        )
      })
    },
    end: () => {
      if (stdinEnded || !child.stdin) return Promise.resolve()
      stdinEnded = true
      return new Promise<void>((resolve) => child.stdin!.end(() => resolve()))
    }
  }

  const take = (which: 'out' | 'err', chunk: Buffer): void => {
    if (persistent) return enqueue(which, chunk)
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
      if (s.request.outputOverflow !== 'drop') trigger('output_limit')
    }
  }
  child.stdout?.on('data', (chunk: Buffer) => take('out', chunk))
  child.stderr?.on('data', (chunk: Buffer) => take('err', chunk))
  // A Landlock launch has started only once the helper's proof is in, so a launch whose
  // proof never comes ends at the startup deadline instead of running unproven.
  let landlockProven = landlock === undefined
  const startedIfProven = (): void => {
    if (initPid !== undefined && landlockProven) clearTimeout(startupTimer)
  }
  // Judged as soon as the one document is complete or the channel ends, not at exit: an
  // unproven launch is torn down before it can run to completion (fail closed).
  const judgeProof = (ended: boolean): void => {
    if (!landlock || landlockProven || cause !== undefined) return
    if (!ended && !landlock.settled()) return
    const report = landlock.report()
    if (report.applied) {
      landlockProven = true
      startedIfProven()
    } else {
      secondary.push(`landlock_${report.error ?? 'unproven'}`)
      trigger('spawn_failed')
    }
  }
  const statusPipe = child.stdio[s.statusIndex]
  statusPipe?.on('data', (chunk: Buffer) => {
    status.feed(chunk)
    const snap = status.snapshot()
    if (initPid === undefined && snap.childPid !== undefined) {
      initPid = snap.childPid
      initStart = readStartTime(initPid, procRoot)
      nsInode = snap.pidNamespace
      startedIfProven()
      resolveNsKnown()
    }
  })
  if (landlock && s.landlockStatusIndex !== undefined) {
    const landlockPipe = child.stdio[s.landlockStatusIndex]
    landlockPipe?.on('data', (chunk: Buffer) => {
      landlock.feed(chunk)
      judgeProof(false)
    })
    landlockPipe?.on('end', () => judgeProof(true))
    landlockPipe?.on('error', () => undefined)
  }
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
      } else if (landlock) {
        const report = landlock.report()
        // The reviewed helper never executes the payload without a proof (XL04); a launch that
        // reached exit unproven is classified as a failed start, never as the payload's exit.
        if (!report.applied) {
          secondary.push(`landlock_${report.error ?? 'unproven'}`)
          trigger('spawn_failed')
        } else if (child.signalCode !== null && snap.exitCode === undefined)
          trigger('signal')
        else trigger('exit')
      } else if (child.signalCode !== null && snap.exitCode === undefined)
        trigger('signal')
      else trigger('exit')
    } else cleanupTask ??= settle()
  })

  if (persistent) {
    // stdin stays open until the consumer ends it or the launch is torn down.
  } else if (s.request.stdin !== undefined && s.request.stdin.length > 0)
    child.stdin?.end(s.request.stdin)
  else child.stdin?.end()

  const handle: ProcessHandle = {
    id: s.id,
    ...(persistent ? { stdin: input, output } : {}),
    wait: () => outcomePromise,
    stop: () => {
      trigger('cancelled')
      return outcomePromise
    }
  }
  return {
    handle,
    terminate: (why) => {
      trigger(why)
      return outcomePromise
    }
  }
}
