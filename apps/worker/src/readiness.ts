export type WorkerReadinessStatus = 'not_ready' | 'ready' | 'stopped'

export interface WorkerReadinessTransition {
  from: WorkerReadinessStatus
  to: WorkerReadinessStatus
  reason: string
  at: string
}

export interface WorkerReadinessOptions {
  clock?: () => Date
  onTransition?: (transition: WorkerReadinessTransition) => void
}

export interface WorkerReadiness {
  status(): WorkerReadinessStatus
  isReady(): boolean
  markReady(reason: string): boolean
  markNotReady(reason: string): boolean
  markStopped(reason: string): boolean
}

/**
 * Small fail-closed lifecycle boundary for consumers. A transition is
 * published before it is committed so an exporter/sink failure cannot leave
 * the process internally ready while the readiness signal was lost.
 */
export function createWorkerReadiness(
  options: WorkerReadinessOptions = {}
): WorkerReadiness {
  const clock = options.clock ?? (() => new Date())
  let current: WorkerReadinessStatus = 'not_ready'

  const transitionTo = (
    next: WorkerReadinessStatus,
    reason: string
  ): boolean => {
    if (current === 'stopped' || current === next) return false
    const transition: WorkerReadinessTransition = {
      from: current,
      to: next,
      reason,
      at: clock().toISOString()
    }
    options.onTransition?.(transition)
    current = next
    return true
  }

  return {
    status: () => current,
    isReady: () => current === 'ready',
    markReady: (reason) => {
      if (current !== 'not_ready') return false
      return transitionTo('ready', reason)
    },
    markNotReady: (reason) => {
      if (current !== 'ready') return false
      return transitionTo('not_ready', reason)
    },
    markStopped: (reason) => transitionTo('stopped', reason)
  }
}
