import { describe, expect, it } from 'vitest'
import { InMemoryDatabase } from '../db.ts'
import { DEFAULT_OUTBOX_MAX_ATTEMPTS, OutboxRepository } from '../outbox.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000151' as const
const tenantB = 'tenant_00000000-0000-4000-8000-000000000152' as const
const correlationId = 'corr_00000000-0000-4000-8000-000000000151' as const

function fixture(now: () => Date = () => new Date()) {
  return new OutboxRepository(new InMemoryDatabase(), {
    now,
    leaseMs: 1_000,
    backoffBaseMs: 10,
    backoffMaxMs: 100
  })
}

describe('durable outbox memory adapter', () => {
  it('deduplicates idempotency keys only inside the tenant boundary', () => {
    const repository = fixture()
    const first = repository.enqueue({
      tenantId: tenantA,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-key-151',
      correlationId
    })
    // AUD19-004: identical replay converges...
    const identical = repository.enqueue({
      tenantId: tenantA,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-key-151',
      correlationId
    })
    // ...divergent content on the same key fails closed...
    expect(() =>
      repository.enqueue({
        tenantId: tenantA,
        type: 'synthetic.memory',
        payload: { changed: true },
        idempotencyKey: 'memory-key-151',
        correlationId
      })
    ).toThrowError(expect.objectContaining({ code: 'conflict' }))
    const otherTenant = repository.enqueue({
      tenantId: tenantB,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-key-151',
      correlationId
    })
    expect(identical.id).toBe(first.id)
    expect(otherTenant.id).not.toBe(first.id)
  })

  it('records claims, expires a lease, and permits one takeover', () => {
    let now = new Date('2026-09-05T12:00:00.000Z')
    const repository = fixture(() => now)
    const event = repository.enqueue({
      tenantId: tenantA,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-lease-151',
      correlationId
    })
    const first = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-a'
    })
    expect(first).toMatchObject({
      id: event.id,
      attempts: 1,
      leaseOwner: 'worker-a'
    })
    expect(
      repository.claimNext({ tenantId: tenantA, workerId: 'worker-b' })
    ).toBeNull()
    now = new Date(first!.leaseUntil!.getTime() + 1)
    const takeover = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-b'
    })
    expect(takeover).toMatchObject({
      id: event.id,
      attempts: 2,
      leaseOwner: 'worker-b'
    })
    expect(repository.findById(event.id, tenantB)).toBeNull()
    expect(repository.findById(event.id, tenantA)).toMatchObject({
      status: 'processing'
    })
    expect(
      repository['db'].state.outboxAttempts.map((attempt) => attempt.outcome)
    ).toEqual(['lease_expired', 'claimed'])
  })

  it('journals one effect, retries failures with bounded attempts, and requeues in place', () => {
    let now = new Date('2026-09-05T12:00:00.000Z')
    const repository = fixture(() => now)
    const event = repository.enqueue({
      tenantId: tenantA,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-retry-151',
      correlationId
    })
    let current = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-retry'
    })!
    for (
      let attempt = 1;
      attempt <= DEFAULT_OUTBOX_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const failed = repository.fail({
        tenantId: tenantA,
        eventId: current.id,
        workerId: 'worker-retry',
        error: new Error('synthetic transient failure')
      })
      if (attempt < DEFAULT_OUTBOX_MAX_ATTEMPTS) {
        expect(failed.status).toBe('failed')
        now = new Date(failed.availableAt!.getTime())
        current = repository.claimNext({
          tenantId: tenantA,
          workerId: 'worker-retry'
        })!
      } else {
        expect(failed.status).toBe('dead_letter')
        current = failed
      }
    }
    const requeued = repository.requeueDeadLetter({
      tenantId: tenantA,
      eventId: current.id,
      operatorId: 'op_memory-151',
      correlationId
    })
    expect(requeued).toMatchObject({
      id: event.id,
      status: 'pending',
      attempts: 0
    })
    const reclaimed = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-retry'
    })!
    let effectCalls = 0
    const processed = repository.ack({
      tenantId: tenantA,
      eventId: reclaimed.id,
      workerId: 'worker-retry',
      effect: () => {
        effectCalls += 1
        return { delivered: false }
      }
    })
    expect(processed).toMatchObject({ status: 'processed' })
    expect(effectCalls).toBe(1)
    expect(repository.findById(event.id, tenantA)).toMatchObject({
      status: 'processed'
    })
    expect(repository['db'].state.outboxEffects).toHaveLength(1)
  })

  it('rolls back state when audit persistence fails', () => {
    const repository = new OutboxRepository(new InMemoryDatabase(), {
      auditWriter: () => {
        throw new Error('synthetic audit failure')
      }
    })
    const event = repository.enqueue({
      tenantId: tenantA,
      type: 'synthetic.memory',
      payload: { fixture: true },
      idempotencyKey: 'memory-audit-151',
      correlationId
    })
    const claimed = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-audit'
    })!
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-audit',
        result: { fixture: true }
      })
    ).toThrow('synthetic audit failure')
    expect(repository.findById(event.id, tenantA)).toMatchObject({
      status: 'processing',
      attempts: claimed.attempts,
      processedAt: null
    })
    expect(repository['db'].state.outboxEffects).toHaveLength(0)
  })
})
