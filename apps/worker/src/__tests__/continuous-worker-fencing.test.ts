import { TenantIdSchema } from '@cvg/platform'
import {
  InMemoryDatabase,
  OutboxRepository,
  type DurableOutboxAdapter
} from '@cvg/persistence'
import { describe, expect, it, vi } from 'vitest'
import { createContinuousWorker } from '../continuous-worker.ts'
import type { WorkerTelemetry } from '../worker-observability.ts'

// SPEC0249 §3.2 items 8 and §3.3 items 6–7 (AUD-0621 F06, F20): the worker
// carries the claim token to heartbeat, ack and fail, treats a refused
// renewal as a lost lease, and labels ownership checks as verified, never as
// renewed.
const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000249'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000249'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function recordingTelemetry() {
  const metrics: Array<{
    name: string
    attributes: Record<string, string | number | boolean>
  }> = []
  const telemetry: WorkerTelemetry = {
    log() {},
    metric(name, _value, attributes) {
      metrics.push({ name, attributes: attributes ?? {} })
    }
  }
  return { telemetry, metrics }
}

function repositoryWithClock() {
  let now = new Date('2026-10-20T12:00:00.000Z')
  const db = new InMemoryDatabase()
  const adapter = new OutboxRepository(db, {
    now: () => now,
    leaseMs: 1_000,
    retryBaseMs: 5,
    retryMaxMs: 5
  })
  const event = adapter.enqueue({
    tenantId,
    type: 'inbound.process',
    payload: { synthetic: true },
    idempotencyKey: 'worker-p0249-fence',
    correlationId
  })
  return {
    adapter,
    event,
    advance(ms: number) {
      now = new Date(now.getTime() + ms)
    }
  }
}

describe('SPEC0249 continuous worker claim fencing', () => {
  it('a stale run with the same worker id loses the lease and cannot ack the newer claim', async () => {
    const x = repositoryWithClock()
    const heartbeat = vi.spyOn(x.adapter, 'heartbeatClaim')
    const started = deferred()
    const gate = deferred()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-p0249-same',
      adapter: x.adapter,
      handlers: {
        inboundProcess: async () => {
          started.resolve()
          await gate.promise
          return { by: 'stale' }
        },
        messageOutbound: () => ({ status: 'unused' })
      },
      pollIntervalMs: 5,
      leaseMs: 1_000,
      concurrency: 1,
      heartbeatIntervalMs: 5
    })
    worker.start()
    await started.promise
    const claimed = x.adapter.findById(x.event.id, tenantId)
    expect(claimed?.claimToken).toEqual(expect.any(String))
    await vi.waitFor(() => {
      expect(heartbeat).toHaveBeenCalledWith(
        expect.objectContaining({ claimToken: claimed?.claimToken })
      )
    })

    // The lease expires and the same worker id claims again (a restarted
    // process with a fixed CVG_WORKER_ID).
    x.advance(2_000)
    const newer = x.adapter.claimNext({
      tenantId,
      workerId: 'worker-p0249-same'
    })
    expect(newer?.attempts).toBe(2)
    await vi.waitFor(
      () => {
        expect(worker.metrics().leaseLost).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )

    gate.resolve()
    await vi.waitFor(
      () => {
        expect(worker.metrics().errors).toBeGreaterThanOrEqual(1)
      },
      { timeout: 5_000, interval: 5 }
    )
    await worker.stop({ drainMs: 0 })
    expect(worker.metrics().processed).toBe(0)
    expect(x.adapter.findById(x.event.id, tenantId)).toMatchObject({
      status: 'processing',
      attempts: 2,
      claimToken: newer?.claimToken
    })
  })

  it('labels ownership checks without renewal as verified', async () => {
    const x = repositoryWithClock()
    const { telemetry, metrics } = recordingTelemetry()
    const started = deferred()
    const gate = deferred()
    // An adapter that can only look the event up, not renew it.
    const lookupOnly = {
      enqueue: x.adapter.enqueue.bind(x.adapter),
      claimNext: x.adapter.claimNext.bind(x.adapter),
      ack: x.adapter.ack.bind(x.adapter),
      fail: x.adapter.fail.bind(x.adapter),
      requeueDeadLetter: x.adapter.requeueDeadLetter.bind(x.adapter),
      findById: x.adapter.findById.bind(x.adapter)
    } as DurableOutboxAdapter
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-p0249-lookup',
      adapter: lookupOnly,
      handlers: {
        inboundProcess: async () => {
          started.resolve()
          await gate.promise
          return { status: 'controlled_noop' }
        },
        messageOutbound: () => ({ status: 'unused' })
      },
      pollIntervalMs: 5,
      leaseMs: 1_000,
      concurrency: 1,
      heartbeatIntervalMs: 5,
      telemetry
    })
    worker.start()
    await started.promise
    await vi.waitFor(() => {
      expect(worker.metrics().heartbeats).toBeGreaterThanOrEqual(1)
    })
    gate.resolve()
    await vi.waitFor(() => {
      expect(worker.metrics().processed).toBe(1)
    })
    await worker.stop()
    const outcomes = metrics
      .filter((metric) => metric.name === 'worker_outbox_heartbeats_total')
      .map((metric) => metric.attributes.outcome)
    expect(outcomes.length).toBeGreaterThanOrEqual(1)
    expect(new Set(outcomes)).toEqual(new Set(['verified']))
  })

  it('releases an in-flight claim on shutdown with its claim token', async () => {
    const x = repositoryWithClock()
    const fail = vi.spyOn(x.adapter, 'fail')
    const started = deferred()
    const worker = createContinuousWorker({
      tenantId,
      workerId: 'worker-p0249-release',
      adapter: x.adapter,
      handlers: {
        inboundProcess: async () => {
          started.resolve()
          await new Promise(() => undefined)
          return { status: 'never' }
        },
        messageOutbound: () => ({ status: 'unused' })
      },
      pollIntervalMs: 5,
      leaseMs: 1_000,
      concurrency: 1,
      heartbeatIntervalMs: 50
    })
    worker.start()
    await started.promise
    const claimed = x.adapter.findById(x.event.id, tenantId)
    const stopped = await worker.stop({ drainMs: 0 })
    expect(stopped.released).toBe(1)
    expect(fail).toHaveBeenCalledWith(
      expect.objectContaining({ claimToken: claimed?.claimToken })
    )
  })
})
