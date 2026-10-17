export type ShutdownSignal = 'SIGTERM' | 'SIGINT'

export interface SignalSource {
  once(event: string, listener: () => void): unknown
}

export interface ShutdownEvent {
  type:
    | 'shutdown.started'
    | 'shutdown.completed'
    | 'shutdown.failed'
    | 'shutdown.timeout'
    | 'shutdown.ignored'
  signal?: ShutdownSignal
  code?: number
  error?: string
}

export interface ShutdownControllerOptions {
  close: () => Promise<void> | void
  flush?: () => Promise<void> | void
  exit: (code: number) => void
  log?: (event: ShutdownEvent) => void
  timeoutMs?: number
  signals?: ShutdownSignal[]
}

export interface ShutdownController {
  shutdown(signal?: ShutdownSignal, code?: number): Promise<void>
  install(source: SignalSource): void
  isShuttingDown(): boolean
}

/**
 * Graceful shutdown: stop accepting work (caller closes the server/pool),
 * flush telemetry, then exit. Repeated signals are ignored; a hung close is
 * bounded by a timeout that still exits non-zero.
 */
export function createShutdownController(
  options: ShutdownControllerOptions
): ShutdownController {
  const timeoutMs = options.timeoutMs ?? 15_000
  const signals = options.signals ?? ['SIGTERM', 'SIGINT']
  let shuttingDown = false

  const emit = (event: ShutdownEvent): void => {
    options.log?.(event)
  }

  const shutdown = async (
    signal: ShutdownSignal = 'SIGTERM',
    code = 0
  ): Promise<void> => {
    if (shuttingDown) {
      emit({ type: 'shutdown.ignored', signal })
      return
    }
    shuttingDown = true
    emit({ type: 'shutdown.started', signal })
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      emit({ type: 'shutdown.timeout', signal })
      options.exit(1)
    }, timeoutMs)
    timer.unref?.()
    try {
      await options.close()
      await options.flush?.()
      if (settled) return
      settled = true
      clearTimeout(timer)
      emit({ type: 'shutdown.completed', signal, code })
      options.exit(code)
    } catch (error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      emit({
        type: 'shutdown.failed',
        signal,
        error: error instanceof Error ? error.message : 'unknown_error'
      })
      options.exit(1)
    }
  }

  const install = (source: SignalSource): void => {
    for (const signal of signals) {
      source.once(signal, () => {
        void shutdown(signal)
      })
    }
  }

  return {
    shutdown,
    install,
    isShuttingDown: () => shuttingDown
  }
}
