import { describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  InMemoryDatabase,
  OutboxRepository,
  type OutboxEffectRecord
} from '../index.ts'

const tenantA = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000401'
)
const tenantB = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000402'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000401'

class FixtureClock {
  private value: Date

  constructor(value = '2026-09-05T12:00:00.000Z') {
    this.value = new Date(value)
  }

  now(): Date {
    return new Date(this.value)
  }

  advance(milliseconds: number): void {
    this.value = new Date(this.value.getTime() + milliseconds)
  }

  set(value: Date): void {
    this.value = new Date(value)
  }
}

function createRepository(clock = new FixtureClock()) {
  const db = new InMemoryDatabase()
  return {
    clock,
    db,
    repository: new OutboxRepository(db, {
      clock,
      leaseMs: 100,
      retryBaseMs: 10,
      retryMaxMs: 40
    })
  }
}

function enqueue(repository: OutboxRepository, key = 'outbox-key-1') {
  return repository.enqueue({
    tenantId: tenantA,
    type: 'message.outbound',
    payload: { fixture: true, body: 'fixture@example.test' },
    idempotencyKey: key,
    correlationId
  })
}

describe('in-memory durable outbox', () => {
  it('sanitizes the legacy overload and durable effect journal before storage', async () => {
    const { repository, db } = createRepository()
    const legacy = repository.enqueue('message.outbound', {
      body: 'Mensagem interna sem PII',
      accessToken: 'secret-fixture-token'
    })
    expect(legacy.payload).toEqual({
      body: '[redacted-outbox-body]',
      accessToken: '[redacted-secret]'
    })

    const event = enqueue(repository, 'outbox-redaction-journal-1')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-redaction' })
    await repository.ack({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-redaction',
      result: {
        body: 'Resultado com pessoa@example.test',
        authorization: 'Bearer secret-fixture-token'
      }
    })
    expect(db.state.outboxEffects[0]?.result).toEqual({
      body: '[redacted-outbox-body]',
      authorization: '[redacted-secret]'
    })
  })

  it('deduplicates by tenant and idempotency key without changing the first envelope', () => {
    const { repository } = createRepository()
    const first = enqueue(repository)
    // AUD19-004: identical replay converges on the first envelope...
    const identical = enqueue(repository)
    // ...divergent content on the same key fails closed.
    expect(() =>
      repository.enqueue({
        tenantId: tenantA,
        type: 'message.outbound',
        payload: { changed: true },
        idempotencyKey: 'outbox-key-1',
        correlationId
      })
    ).toThrowError(expect.objectContaining({ code: 'conflict' }))
    const otherTenant = repository.enqueue({
      tenantId: tenantB,
      type: 'message.outbound',
      payload: { changed: true },
      idempotencyKey: 'outbox-key-1',
      correlationId
    })

    expect(identical.id).toBe(first.id)
    expect(identical.payload).toEqual({
      fixture: true,
      body: '[redacted-outbox-body]'
    })
    expect(otherTenant.id).not.toBe(first.id)
    expect(repository.pending(tenantA)).toHaveLength(1)
    expect(repository.pending(tenantB)).toHaveLength(1)
  })

  it('allows one worker to own a lease, then allows takeover after expiry', () => {
    const { clock, repository, db } = createRepository()
    const event = enqueue(repository)
    const first = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-a'
    })

    expect(first).toMatchObject({
      id: event.id,
      status: 'processing',
      attempts: 1,
      leaseOwner: 'worker-a'
    })
    expect(
      repository.claimNext({ tenantId: tenantA, workerId: 'worker-b' })
    ).toBeNull()
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-b',
        result: { ignored: true }
      })
    ).toThrow(/another worker/i)

    clock.advance(101)
    const takeover = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-b'
    })
    expect(takeover).toMatchObject({
      id: event.id,
      status: 'processing',
      attempts: 2,
      leaseOwner: 'worker-b'
    })
    expect(db.state.outboxAttempts).toEqual([
      expect.objectContaining({
        attempt: 1,
        workerId: 'worker-a',
        outcome: 'lease_expired'
      }),
      expect.objectContaining({
        attempt: 2,
        workerId: 'worker-b',
        outcome: 'claimed'
      })
    ])
  })

  it('writes the effect journal once and acknowledges from the journal after a crash window', async () => {
    const { clock, repository, db } = createRepository()
    const event = enqueue(repository)
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })

    const journal: OutboxEffectRecord = {
      tenantId: tenantA,
      idempotencyKey: event.idempotencyKey ?? 'outbox-key-1',
      eventId: event.id,
      result: { applied: true },
      appliedAt: clock.now()
    }
    db.state.outboxEffects = [journal]
    const effect = vi.fn(() => {
      throw new Error('journal should suppress duplicate effect')
    })

    const processed = await repository.ack({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-a',
      effect
    })
    expect(processed.status).toBe('processed')
    expect(effect).not.toHaveBeenCalled()
    expect(db.state.outboxEffects).toHaveLength(1)
    expect(db.state.auditEvents.at(-1)?.payload).toEqual(
      expect.objectContaining({ status: 'processed' })
    )
  })

  it('uses repository backoff and dead-letters after five failed attempts', () => {
    const { clock, repository, db } = createRepository()
    const event = enqueue(repository)
    let current = event

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimed = repository.claimNext({
        tenantId: tenantA,
        workerId: `worker-${attempt}`
      })
      expect(claimed?.attempts).toBe(attempt)
      current = repository.fail({
        tenantId: tenantA,
        eventId: event.id,
        workerId: `worker-${attempt}`,
        error: new Error(`failure ${attempt} ana@example.test`)
      })
      if (attempt < 5) {
        expect(current.status).toBe('failed')
        expect(current.availableAt).toBeInstanceOf(Date)
        clock.set(current.availableAt as Date)
      }
    }

    expect(current).toMatchObject({
      id: event.id,
      status: 'dead_letter',
      attempts: 5,
      lastError: '[redacted-outbox-error]'
    })
    expect(current.deadLetteredAt).toBeInstanceOf(Date)
    expect(current.availableAt).toBeUndefined()
    expect(
      db.state.outboxAttempts.filter((attempt) => attempt.eventId === event.id)
    ).toHaveLength(5)
    expect(db.state.auditEvents).toHaveLength(5)
  })

  it('requeues dead-letter in place, preserving the idempotency key and attempt history', () => {
    const { clock, repository, db } = createRepository()
    const event = enqueue(repository)
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      repository.claimNext({ tenantId: tenantA, workerId: `worker-${attempt}` })
      const failed = repository.fail({
        tenantId: tenantA,
        eventId: event.id,
        workerId: `worker-${attempt}`,
        error: 'terminal fixture failure',
        ...(attempt === 5 ? { terminal: true } : {})
      })
      if (failed.status === 'failed') clock.set(failed.availableAt as Date)
    }

    const requeued = repository.requeueDeadLetter({
      tenantId: tenantA,
      eventId: event.id,
      operatorId: 'op_fixture',
      correlationId
    })
    expect(requeued).toMatchObject({
      id: event.id,
      status: 'pending',
      attempts: 0,
      idempotencyKey: event.idempotencyKey,
      parentEventId: null
    })
    expect(db.state.outbox).toHaveLength(1)
    expect(db.state.outboxAttempts).toHaveLength(6)
    expect(db.state.outboxAttempts.at(-1)).toMatchObject({
      outcome: 'requeued',
      workerId: 'op_fixture',
      attempt: 5
    })
    expect(db.state.auditEvents.at(-1)?.payload).toEqual(
      expect.objectContaining({ action: 'requeue_dead_letter' })
    )
  })
})
