import { describe, expect, it, vi } from 'vitest'
import {
  createWorkerReadiness,
  type WorkerReadinessTransition
} from '../readiness.ts'

describe('worker readiness lifecycle', () => {
  it('orders readiness, loss of readiness and terminal stop', () => {
    const transitions: WorkerReadinessTransition[] = []
    const readiness = createWorkerReadiness({
      clock: () => new Date('2026-09-21T18:00:00.000Z'),
      onTransition: (transition) => transitions.push(transition)
    })

    expect(readiness.status()).toBe('not_ready')
    expect(readiness.isReady()).toBe(false)
    expect(readiness.markReady('preflight_passed')).toBe(true)
    expect(readiness.isReady()).toBe(true)
    expect(readiness.markNotReady('shutdown')).toBe(true)
    expect(readiness.markStopped('closed')).toBe(true)
    expect(readiness.markReady('late_health_recovery')).toBe(false)

    expect(transitions).toEqual([
      {
        from: 'not_ready',
        to: 'ready',
        reason: 'preflight_passed',
        at: '2026-09-21T18:00:00.000Z'
      },
      {
        from: 'ready',
        to: 'not_ready',
        reason: 'shutdown',
        at: '2026-09-21T18:00:00.000Z'
      },
      {
        from: 'not_ready',
        to: 'stopped',
        reason: 'closed',
        at: '2026-09-21T18:00:00.000Z'
      }
    ])
  })

  it('does not commit ready when the transition sink fails', () => {
    const onTransition = vi.fn(() => {
      throw new Error('synthetic exporter outage')
    })
    const readiness = createWorkerReadiness({ onTransition })

    expect(() => readiness.markReady('preflight_passed')).toThrow(
      'synthetic exporter outage'
    )
    expect(readiness.status()).toBe('not_ready')
    expect(readiness.isReady()).toBe(false)
    expect(onTransition).toHaveBeenCalledTimes(1)
  })

  it('restores readiness after a dependency outage without reopening after stop', () => {
    const transitions: WorkerReadinessTransition[] = []
    const readiness = createWorkerReadiness({
      clock: () => new Date('2026-09-21T18:00:00.000Z'),
      onTransition: (transition) => transitions.push(transition)
    })

    expect(readiness.markReady('startup_preflight_passed')).toBe(true)
    expect(readiness.markNotReady('dependency_health_failed')).toBe(true)
    expect(readiness.markReady('dependencies_recovered')).toBe(true)
    expect(readiness.markNotReady('shutdown_started')).toBe(true)
    expect(readiness.markStopped('shutdown_completed')).toBe(true)
    expect(readiness.markReady('late_health_recovery')).toBe(false)

    expect(
      transitions.map(({ from, to, reason }) => ({ from, to, reason }))
    ).toEqual([
      {
        from: 'not_ready',
        to: 'ready',
        reason: 'startup_preflight_passed'
      },
      {
        from: 'ready',
        to: 'not_ready',
        reason: 'dependency_health_failed'
      },
      {
        from: 'not_ready',
        to: 'ready',
        reason: 'dependencies_recovered'
      },
      {
        from: 'ready',
        to: 'not_ready',
        reason: 'shutdown_started'
      },
      {
        from: 'not_ready',
        to: 'stopped',
        reason: 'shutdown_completed'
      }
    ])
  })
})
