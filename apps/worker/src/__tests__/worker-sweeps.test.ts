import {
  InMemoryEffectJournal,
  type EffectJournalPort
} from '@cvg/agent-runtime'
import type { ApprovalEngine } from '@cvg/approval-engine'
import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase, OutboxRepository } from '@cvg/persistence'
import { describe, expect, it, vi } from 'vitest'
import { createPeriodicSweepRunner, runSweepTick } from '../sweeps.ts'
import { createContinuousWorker } from '../continuous-worker.ts'
import type { WorkerTelemetry } from '../worker-observability.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000191'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000191'

function createFakeApprovals(counts = { released: 2, uncertain: 1 }) {
  const releaseExpired = vi.fn(() => counts)
  const list = vi.fn(() => [])
  return {
    engine: { list, releaseExpired } as unknown as ApprovalEngine,
    releaseExpired,
    list
  }
}

function createRecordingTelemetry(): {
  telemetry: WorkerTelemetry
  logs: Array<{ event: string; level: string }>
  metrics: string[]
} {
  const logs: Array<{ event: string; level: string }> = []
  const metrics: string[] = []
  return {
    logs,
    metrics,
    telemetry: {
      log(event, _fields, level = 'info') {
        logs.push({ event, level })
      },
      metric(name) {
        metrics.push(name)
      }
    }
  }
}

describe('AAA-19 periodic sweeps', () => {
  it('runs the journal releaseExpired and the approval sweep in the same tick', async () => {
    const now = new Date('2026-09-13T00:00:00.000Z')
    const journal = new InMemoryEffectJournal({ clock: () => now })
    await journal.reserve({
      tenantId,
      operationKey: 'op-sweep-191',
      proposalHash: 'hash-sweep-191',
      attemptId: 'attempt-sweep-191',
      expiresAt: new Date(now.getTime() - 1_000).toISOString()
    })
    const approvals = createFakeApprovals()

    const result = await runSweepTick({
      approvals: approvals.engine,
      effectJournal: journal,
      tenantId,
      clock: () => now,
      reservationTtlMs: 1_000
    })

    expect(result).toMatchObject({
      journalReleased: 1,
      approvalsReleased: 2,
      approvalsUncertain: 1
    })
    await expect(journal.get(tenantId, 'op-sweep-191')).resolves.toMatchObject({
      state: 'ABANDONED'
    })
    expect(approvals.releaseExpired).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        ttlMs: 1_000,
        now
      })
    )
    expect(approvals.list).toHaveBeenCalledWith(tenantId)
  })

  it('invokes both sweeps on a timer and stops cleanly', async () => {
    const journal = {
      get: vi.fn(),
      releaseExpired: vi.fn(async () => 0)
    } as unknown as EffectJournalPort
    const approvals = createFakeApprovals({ released: 0, uncertain: 0 })
    const recording = createRecordingTelemetry()
    const runner = createPeriodicSweepRunner({
      approvals: approvals.engine,
      effectJournal: journal,
      tenantId,
      intervalMs: 10,
      telemetry: recording.telemetry
    })

    runner.start()
    await vi.waitFor(
      () => {
        expect(
          approvals.releaseExpired.mock.calls.length
        ).toBeGreaterThanOrEqual(2)
      },
      { timeout: 5_000, interval: 5 }
    )
    await runner.stop()
    const callsAfterStop = approvals.releaseExpired.mock.calls.length
    expect(journal.releaseExpired).toHaveBeenCalled()
    expect(runner.isRunning()).toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(approvals.releaseExpired.mock.calls.length).toBe(callsAfterStop)
    expect(recording.logs.map((log) => log.event)).toContain(
      'worker.sweep_tick'
    )
    expect(recording.metrics).toContain('worker_sweep_journal_released_total')
  })

  it('contains sweep failures without stopping the timer', async () => {
    const journal = {
      get: vi.fn(),
      releaseExpired: vi.fn(async () => 0)
    } as unknown as EffectJournalPort
    const approvals = createFakeApprovals()
    approvals.releaseExpired.mockImplementation(() => {
      throw new Error('synthetic sweep failure')
    })
    const recording = createRecordingTelemetry()
    const runner = createPeriodicSweepRunner({
      approvals: approvals.engine,
      effectJournal: journal,
      tenantId,
      intervalMs: 10,
      telemetry: recording.telemetry
    })

    runner.start()
    await vi.waitFor(
      () => {
        expect(recording.logs.map((log) => log.event)).toContain(
          'worker.sweep_failed'
        )
      },
      { timeout: 5_000, interval: 5 }
    )
    expect(runner.isRunning()).toBe(true)
    await runner.stop()

    await expect(
      createPeriodicSweepRunner({
        approvals: approvals.engine,
        effectJournal: journal,
        tenantId
      }).runOnce()
    ).rejects.toThrow('synthetic sweep failure')
  })

  it('never consumes outbox events or executes synthetic handlers', async () => {
    const now = new Date('2026-09-13T00:00:00.000Z')
    const journal = new InMemoryEffectJournal({ clock: () => now })
    await journal.reserve({
      tenantId,
      operationKey: 'op-sweep-effect-191',
      proposalHash: 'hash-sweep-effect-191',
      attemptId: 'attempt-sweep-effect-191',
      expiresAt: new Date(now.getTime() - 1_000).toISOString()
    })
    await journal.markEffectStarted({
      tenantId,
      operationKey: 'op-sweep-effect-191',
      attemptId: 'attempt-sweep-effect-191'
    })
    const db = new InMemoryDatabase()
    const adapter = new OutboxRepository(db)
    adapter.enqueue({
      tenantId,
      type: 'inbound.process',
      payload: { fixture: 'sweep-must-not-consume' },
      idempotencyKey: 'continuous-sweep-no-effect-191',
      correlationId
    })
    const handler = vi.fn()
    const approvals = createFakeApprovals()
    const runner = createPeriodicSweepRunner({
      approvals: approvals.engine,
      effectJournal: journal,
      tenantId,
      clock: () => now,
      reservationTtlMs: 1_000
    })

    const result = await runner.runOnce()

    expect(result.journalReleased).toBe(1)
    await expect(
      journal.get(tenantId, 'op-sweep-effect-191')
    ).resolves.toMatchObject({ state: 'UNCERTAIN' })
    expect(db.state.outbox[0]?.status).toBe('pending')
    expect(handler).not.toHaveBeenCalled()
    expect(db.state.outboxEffects).toHaveLength(0)
  })

  it('runs and stops the injected sweep runner with the continuous worker', async () => {
    const journal = {
      get: vi.fn(),
      releaseExpired: vi.fn(async () => 0)
    } as unknown as EffectJournalPort
    const approvals = createFakeApprovals({ released: 0, uncertain: 0 })
    const sweeps = createPeriodicSweepRunner({
      approvals: approvals.engine,
      effectJournal: journal,
      tenantId,
      intervalMs: 10
    })
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-sweeps-191',
      adapter: new OutboxRepository(new InMemoryDatabase()),
      handlers: {
        inboundProcess: () => ({ status: 'controlled_noop' }),
        messageOutbound: () => ({ status: 'controlled_noop' })
      },
      pollIntervalMs: 5,
      leaseMs: 1_000,
      sweeps
    })

    worker.start()
    expect(sweeps.isRunning()).toBe(true)
    await vi.waitFor(
      () => {
        expect(
          approvals.releaseExpired.mock.calls.length
        ).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop()

    expect(sweeps.isRunning()).toBe(false)
    const callsAfterStop = approvals.releaseExpired.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(approvals.releaseExpired.mock.calls.length).toBe(callsAfterStop)
  })
})
