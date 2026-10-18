import type { ChildProcess } from 'node:child_process'

type ProcessExit = { code: number | null; signal: NodeJS.Signals | null }
type ProcessOptions = {
  label?: string
  maxRuntimeMs?: number
  exitTimeoutMs?: number
  termGraceMs?: number
  killGraceMs?: number
}

/** Private native-fixture ownership. Call synchronously immediately after spawn.
 * These deadlines bound test resources only; they never change served leases.
 * `exited` observes process death; `closed` also confirms all stdio has closed.
 * Call finish after RESULT (or an intentional crash), stop in every finally.
 */
export function trackPare217Process(
  child: ChildProcess,
  options: ProcessOptions = {}
): {
  exited: Promise<ProcessExit>
  closed: Promise<ProcessExit>
  finish: () => Promise<ProcessExit>
  stop: () => Promise<ProcessExit>
} {
  let exitObserved = false
  let closeObserved = false
  let processError: Error | undefined
  let runtimeError: Error | undefined
  let rejectExit: (error: Error) => void
  const exited = new Promise<ProcessExit>((resolve, reject) => {
    rejectExit = reject
    child.once('exit', (code, signal) => {
      exitObserved = true
      resolve({ code, signal })
    })
  })
  child.on('error', (error) => {
    processError ??= error
    rejectExit(error)
  })
  const closed = new Promise<ProcessExit>((resolve, reject) => {
    child.once('close', (code, signal) => {
      closeObserved = true
      clearTimeout(watchdog)
      if (processError) reject(processError)
      else resolve({ code, signal })
    })
  })
  // A fixture may fail setup, or its test may time out before awaiting either.
  // Observe rejection now without changing what later callers receive.
  void exited.catch(() => {})
  void closed.catch(() => {})

  const label = options.label ?? 'PARE217 fixture'
  const defaults = {
    maxRuntimeMs: 180_000,
    exitTimeoutMs: 5_000,
    termGraceMs: 1_000,
    killGraceMs: 2_000
  }
  const deadlines = { ...defaults }
  let setupError: Error | undefined
  for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
    const value = options[key] ?? defaults[key]
    if (!Number.isInteger(value) || value <= 0 || value > 2_147_483_647)
      setupError ??= new Error(
        `${label}: invalid ${key}; expected finite positive timer milliseconds`
      )
    else deadlines[key] = value
  }

  const waitForClose = (ms: number): Promise<boolean> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(false), ms)
      void closed.then(
        () => {
          clearTimeout(timer)
          resolve(true)
        },
        (error: unknown) => {
          clearTimeout(timer)
          reject(error)
        }
      )
    })

  let stopPromise: Promise<ProcessExit> | undefined
  const stop = (): Promise<ProcessExit> =>
    (stopPromise ??= (async () => {
      const signalErrors: unknown[] = []
      const signal = (value: NodeJS.Signals) => {
        if (exitObserved || closeObserved) return
        try {
          child.kill(value)
        } catch (error) {
          signalErrors.push(error)
        }
      }
      try {
        if (closeObserved) return await closed
        signal('SIGTERM')
        if (await waitForClose(deadlines.termGraceMs)) return await closed
        signal('SIGKILL')
        if (await waitForClose(deadlines.killGraceMs)) return await closed
        throw new AggregateError(
          signalErrors,
          `${label}: cleanup failed; process exit and stdio close not confirmed after TERM ${deadlines.termGraceMs}ms + KILL ${deadlines.killGraceMs}ms`
        )
      } finally {
        clearTimeout(watchdog)
      }
    })())

  // Referenced and independent of finish/stop and the parent test timeout.
  const watchdog = setTimeout(() => {
    runtimeError = new Error(
      `${label}: maxRuntimeMs ${deadlines.maxRuntimeMs}ms exceeded`
    )
    void stop().catch(() => {})
  }, deadlines.maxRuntimeMs)
  if (setupError)
    queueMicrotask(() => {
      void stop().catch(() => {})
    })

  const failAfterCleanup = async (error: Error): Promise<never> => {
    try {
      await stop()
    } catch (cleanupError) {
      if (cleanupError === error) throw error
      throw new AggregateError(
        [error, cleanupError],
        `${error.message}; cleanup also failed`,
        { cause: error }
      )
    }
    throw error
  }
  let finishPromise: Promise<ProcessExit> | undefined
  const finish = (): Promise<ProcessExit> =>
    (finishPromise ??= (async () => {
      if (setupError) return failAfterCleanup(setupError)
      if (runtimeError) return failAfterCleanup(runtimeError)
      if (!(await waitForClose(deadlines.exitTimeoutMs)))
        return failAfterCleanup(
          runtimeError ??
            new Error(
              `${label}: exitTimeoutMs ${deadlines.exitTimeoutMs}ms exceeded after RESULT; process exit and stdio close required`
            )
        )
      if (runtimeError) return failAfterCleanup(runtimeError)
      return closed
    })())

  return { exited, closed, finish, stop }
}
