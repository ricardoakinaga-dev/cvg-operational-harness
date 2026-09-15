import { TenantIdSchema } from '@cvg/platform'
import {
  InMemoryDatabase,
  OutboxRepository,
  type DurableOutboxAdapter
} from '@cvg/persistence'
import { describe, expect, it, vi } from 'vitest'
import { createControlledWorker } from '../controlled-worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000181'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000181'

function handlers() {
  return {
    inboundProcess: vi.fn(() => ({ runtime: 'controlled', completed: true })),
    messageOutbound: vi.fn(() => ({ runtime: 'controlled', delivered: false }))
  }
}

function enqueueInbound(adapter: OutboxRepository, key: string) {
  return adapter.enqueue({
    tenantId,
    type: 'inbound.process',
    payload: { messageId: 'msg_hardening', body: 'synthetic body' },
    idempotencyKey: key,
    correlationId
  })
}

describe('controlled worker construction and drain bounds', () => {
  it('rejects blank worker ids and missing handlers', () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    expect(() =>
      createControlledWorker({
        tenantId,
        workerId: '   ',
        adapter,
        handlers: handlers()
      })
    ).toThrow(/worker id is required/)

    expect(() =>
      createControlledWorker({
        tenantId,
        workerId: 'worker-hardening-181',
        adapter,
        handlers: {
          inboundProcess: () => ({ completed: true }),
          messageOutbound: 'not-a-function' as never
        }
      })
    ).toThrow(/handlers are required/)
  })

  it('validates the drain limit before claiming any event', async () => {
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter: new OutboxRepository(new InMemoryDatabase()),
      handlers: handlers()
    })

    await expect(worker.drain(0)).rejects.toThrow(/between 1 and 100/)
    await expect(worker.drain(101)).rejects.toThrow(/between 1 and 100/)
    await expect(worker.drain(1.5)).rejects.toThrow(/between 1 and 100/)
  })
})

describe('controlled worker processing paths', () => {
  it('drains a bounded batch and stops when the queue is empty', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    const first = enqueueInbound(adapter, 'controlled-worker-hardening-181a')
    const second = enqueueInbound(adapter, 'controlled-worker-hardening-181b')
    const seen = vi.fn()
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter,
      handlers: {
        inboundProcess: (event) => {
          seen(event.id)
          return { completed: true }
        },
        messageOutbound: () => ({ completed: true })
      }
    })

    const drained = await worker.drain(5)
    expect(drained.processed).toBe(2)
    expect(
      drained.results.map((result) =>
        result && 'id' in result ? result.id : null
      )
    ).toEqual([first.id, second.id])

    const empty = await worker.drain(3)
    expect(empty).toEqual({ processed: 0, results: [] })

    await expect(worker.processNext('outbox_missing_181')).resolves.toBeNull()
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('processes a specific event id with an explicit lease', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    const event = enqueueInbound(adapter, 'controlled-worker-hardening-181c')
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter,
      leaseMs: 5_000,
      handlers: handlers()
    })

    await expect(worker.processNext(event.id)).resolves.toMatchObject({
      id: event.id,
      status: 'processed'
    })
  })

  it('hands off to a human and never runs the handler while takeover is active', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    const event = enqueueInbound(adapter, 'controlled-worker-hardening-181d')
    const inboundProcess = vi.fn(() => ({ completed: true }))
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter,
      takeoverActive: true,
      handlers: {
        inboundProcess,
        messageOutbound: () => ({ completed: true })
      }
    })

    await expect(worker.processNext()).resolves.toMatchObject({
      eventId: event.id,
      status: 'handoff',
      handoff: true
    })
    expect(inboundProcess).not.toHaveBeenCalled()
    expect(adapter.findById(event.id, tenantId)).toMatchObject({
      status: 'dead_letter'
    })
  })

  it('rethrows the acknowledgement failure when the fail path is also unavailable', async () => {
    const base = new OutboxRepository(new InMemoryDatabase())
    const event = enqueueInbound(base, 'controlled-worker-hardening-181e')
    const adapter: DurableOutboxAdapter = {
      enqueue: () => event,
      claimNext: () => ({ ...event, status: 'processing' }),
      ack: async () => {
        throw new Error('ack boundary down')
      },
      fail: async () => {
        throw new Error('fail boundary down')
      },
      requeueDeadLetter: () => event
    }
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter,
      handlers: handlers()
    })

    await expect(worker.processNext()).rejects.toThrow('ack boundary down')
  })

  it('keeps takeover checks function-shaped and queued effects unexecuted', async () => {
    const adapter = new OutboxRepository(new InMemoryDatabase())
    const event = enqueueInbound(adapter, 'controlled-worker-hardening-181f')
    const inboundProcess = vi.fn(() => ({ completed: true }))
    const worker = createControlledWorker({
      tenantId,
      workerId: 'worker-hardening-181',
      adapter,
      takeoverActive: () => false,
      handlers: {
        inboundProcess,
        messageOutbound: () => ({ completed: true })
      }
    })

    const result = await worker.processNext()
    expect(result).toMatchObject({ id: event.id, status: 'processed' })
    expect(inboundProcess).toHaveBeenCalledTimes(1)
  })
})
