import { describe, expect, it, vi } from 'vitest'
import { InMemoryDatabase } from '../db.ts'
import {
  OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
  OutboxRepository
} from '../outbox.ts'
import type { OutboxEventRecord } from '../schema.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000901' as const
const tenantB = 'tenant_00000000-0000-4000-8000-000000000902' as const
const correlationId = 'corr_00000000-0000-4000-8000-000000000901'

function fixture(
  options: ConstructorParameters<typeof OutboxRepository>[1] = {}
) {
  const db = new InMemoryDatabase()
  return { db, repository: new OutboxRepository(db, options) }
}

function enqueue(
  repository: OutboxRepository,
  key = 'outbox-edge-key-1',
  overrides: Record<string, unknown> = {}
) {
  return repository.enqueue({
    tenantId: tenantA,
    type: 'synthetic.edge',
    payload: { fixture: true },
    idempotencyKey: key,
    correlationId,
    ...overrides
  })
}

describe('outbox edge paths', () => {
  it('rejects invalid construction options and accepts backoff aliases', () => {
    const db = new InMemoryDatabase()
    expect(
      () => new OutboxRepository(db, { retryBaseMs: 50, retryMaxMs: 10 })
    ).toThrowError(/retryMaxMs/)
    expect(() => new OutboxRepository(db, { maxAttempts: 0 })).toThrowError(
      /maxAttempts/
    )
    expect(() => new OutboxRepository(db, { leaseMs: -5 })).toThrowError(
      /leaseMs/
    )
    expect(() => new OutboxRepository(db, { retryBaseMs: 1.5 })).toThrowError(
      /retryBaseMs/
    )
    expect(
      () => new OutboxRepository(db, { backoffBaseMs: 5, backoffMaxMs: 10 })
    ).not.toThrow()
  })

  it('validates tenant, type, idempotency key, correlation and id', () => {
    const { repository } = fixture()
    expect(() =>
      repository.enqueue({
        tenantId: 'tenant_invalid' as typeof tenantA,
        type: 'synthetic.edge',
        payload: {},
        idempotencyKey: 'outbox-edge-key-2'
      })
    ).toThrowError(/Tenant scope is required/)
    expect(() =>
      repository.enqueue({
        tenantId: tenantA,
        type: 'NOT-VALID',
        payload: {},
        idempotencyKey: 'outbox-edge-key-3'
      })
    ).toThrowError(/event type is invalid/)
    expect(() =>
      repository.enqueue({
        tenantId: tenantA,
        type: 'synthetic.edge',
        payload: {},
        idempotencyKey: 'short'
      })
    ).toThrowError(/idempotency key is invalid/)
    expect(() =>
      repository.enqueue({
        tenantId: tenantA,
        type: 'synthetic.edge',
        payload: {},
        idempotencyKey: 'outbox-edge-key-4',
        correlationId: 'not-a-correlation'
      })
    ).toThrowError(/correlation id is invalid/)
    expect(() =>
      enqueue(repository, 'outbox-edge-key-5', { id: '   ' })
    ).toThrowError(/event id is required/)
  })

  it('validates payload presence, serializability and limits', () => {
    const { repository } = fixture()
    expect(() =>
      enqueue(repository, 'outbox-edge-key-6', { payload: undefined })
    ).toThrowError(/payload is required/)
    expect(() =>
      enqueue(repository, 'outbox-edge-key-7', { payload: 1n })
    ).toThrowError(/not serializable/)
    const small = fixture({ maxPayloadBytes: 10 })
    expect(() =>
      enqueue(small.repository, 'outbox-edge-key-8', {
        payload: { value: 'this is far too large' }
      })
    ).toThrowError(/exceeds its limit/)
    expect(() =>
      enqueue(small.repository, 'outbox-edge-key-9', { payload: { n: 1 } })
    ).toThrowError(/Sanitized outbox payload exceeds its limit/)
  })

  it('falls back to value cloning when structuredClone is unavailable', () => {
    const { repository, db } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-10', {
      payload: { callback: () => undefined }
    })
    expect(event.payload).toEqual({ callback: expect.any(Function) })
    expect(db.state.outbox).toHaveLength(1)
  })

  it('supports eventId aliases and tenant-scoped reads', () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-11', {
      eventId: 'outbox_edge_alias_1'
    })
    expect(event.id).toBe('outbox_edge_alias_1')
    expect(repository.findById(event.id, tenantA)?.id).toBe(event.id)
    expect(repository.findById(event.id, tenantB)).toBeNull()
    expect(repository.pending(tenantB)).toHaveLength(0)
    expect(repository.pending(tenantA)).toHaveLength(1)
    expect(repository.pending()).toHaveLength(1)
    const legacy = repository.enqueue('synthetic.legacy', { fixture: true })
    expect(legacy.status).toBe('pending')
    expect(legacy.tenantId).toBeUndefined()
  })

  it('claims by event id, honors backoff windows and sorts eligible events', () => {
    let now = new Date('2026-09-13T12:00:00.000Z')
    const { repository, db } = fixture({
      clock: () => now,
      leaseMs: 100,
      retryBaseMs: 10,
      retryMaxMs: 40
    })
    const first = enqueue(repository, 'outbox-edge-key-12')
    const second = enqueue(repository, 'outbox-edge-key-13')
    const third = enqueue(repository, 'outbox-edge-key-13b')
    db.state.outbox = db.state.outbox.map((event) =>
      event.id === third.id
        ? { ...event, availableAt: new Date(now.getTime() + 5_000) }
        : event
    )
    expect(
      repository.claimNext({
        tenantId: tenantA,
        workerId: 'worker-edge',
        eventId: second.id
      })?.id
    ).toBe(second.id)
    expect(
      repository.claimNext({
        tenantId: tenantA,
        workerId: 'worker-edge',
        eventId: first.id
      })?.id
    ).toBe(first.id)
    const failed = repository.fail({
      tenantId: tenantA,
      eventId: second.id,
      workerId: 'worker-edge',
      error: 'transient'
    })
    expect(
      repository.claimNext({ tenantId: tenantA, workerId: 'worker-edge' })
    ).toBeNull()
    now = new Date(failed.availableAt!.getTime())
    expect(
      repository.claimNext({
        tenantId: tenantA,
        workerId: 'worker-edge',
        eventId: second.id
      })?.attempts
    ).toBe(2)
  })

  it('breaks eligible-time ties using lease and creation timestamps', () => {
    const now = new Date('2026-09-13T12:00:00.000Z')
    const { repository, db } = fixture({ clock: () => now })
    db.state.outbox.push(
      {
        id: 'outbox_eligible_lease',
        type: 'synthetic.edge',
        payload: {},
        tenantId: tenantA,
        status: 'processing',
        createdAt: new Date(now.getTime() - 9_000),
        leaseUntil: new Date(now.getTime() - 8_000),
        leaseOwner: 'worker-expired',
        attempts: 1
      },
      {
        id: 'outbox_eligible_created',
        type: 'synthetic.edge',
        payload: {},
        tenantId: tenantA,
        status: 'pending',
        createdAt: new Date(now.getTime() - 5_000)
      },
      {
        id: 'outbox_eligible_available',
        type: 'synthetic.edge',
        payload: {},
        tenantId: tenantA,
        status: 'pending',
        createdAt: new Date(now.getTime() - 4_000),
        availableAt: new Date(now.getTime() - 1_000)
      }
    )
    const takeover = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-edge'
    })
    expect(takeover).toMatchObject({
      id: 'outbox_eligible_lease',
      attempts: 2,
      leaseOwner: 'worker-edge'
    })
    const created = repository.claimNext({
      tenantId: tenantA,
      workerId: 'worker-edge-2'
    })
    expect(created).toMatchObject({ id: 'outbox_eligible_created' })
  })

  it('requires an explicit result before ack and replays one effect journal', () => {
    const { repository, db } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-14')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-edge' })
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-edge'
      })
    ).toThrowError(/effect or result is required/)

    const other = enqueue(repository, 'outbox-edge-key-15')
    db.state.outboxEffects.push({
      tenantId: tenantA,
      idempotencyKey: event.idempotencyKey ?? 'outbox-edge-key-14',
      eventId: other.id,
      result: { applied: true },
      appliedAt: new Date()
    })
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-edge',
        result: { applied: true }
      })
    ).toThrowError(/points to another event/)
  })

  it('resolves synchronous, asynchronous and fallback takeover checks', async () => {
    const { repository } = fixture()
    const suppressed = enqueue(repository, 'outbox-edge-key-16')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    const failed = repository.ack({
      tenantId: tenantA,
      eventId: suppressed.id,
      workerId: 'worker-a',
      result: { ignored: true },
      takeoverActive: true
    }) as OutboxEventRecord
    expect(failed.status).toBe('dead_letter')
    expect(failed.lastError).toBe(OUTBOX_TAKEOVER_SUPPRESSED_ERROR)

    const asyncAllowed = enqueue(repository, 'outbox-edge-key-17')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-b' })
    const processed = await repository.ack({
      tenantId: tenantA,
      eventId: asyncAllowed.id,
      workerId: 'worker-b',
      result: { fallback: true },
      takeoverActive: async () => false
    })
    expect(processed.status).toBe('processed')

    const syncAllowed = enqueue(repository, 'outbox-edge-key-18')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-c' })
    const syncProcessed = await repository.ack({
      tenantId: tenantA,
      eventId: syncAllowed.id,
      workerId: 'worker-c',
      result: { fallback: true },
      takeoverActive: () => false
    })
    expect(syncProcessed).toMatchObject({ status: 'processed' })
  })

  it('runs asynchronous effects and prefers their resolved value', async () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-19')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    const processed = await repository.ack({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-a',
      effect: async () => ({ channel: 'web' }),
      result: { channel: 'internal' }
    })
    expect(processed.status).toBe('processed')
    const journal = repository['db'].state.outboxEffects.at(-1)
    expect(journal?.result).toMatchObject({ channel: 'web' })
  })

  it('uses the fallback result when an effect resolves undefined', () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-20')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    repository.ack({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-a',
      effect: () => undefined,
      result: { channel: 'internal' }
    })
    expect(repository['db'].state.outboxEffects.at(-1)?.result).toMatchObject({
      channel: 'internal'
    })
  })

  it('summarizes primitive and structured results in the transition audit', () => {
    const { repository, db } = fixture()
    const numeric = enqueue(repository, 'outbox-edge-key-21')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    repository.ack({
      tenantId: tenantA,
      eventId: numeric.id,
      workerId: 'worker-a',
      result: 7
    })
    expect(db.state.auditEvents.at(-1)?.payload).toMatchObject({
      result: '[redacted-outbox-text]'
    })

    const boolean = enqueue(repository, 'outbox-edge-key-22')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-b' })
    repository.ack({
      tenantId: tenantA,
      eventId: boolean.id,
      workerId: 'worker-b',
      result: false
    })
    expect(db.state.auditEvents.at(-1)?.payload).toMatchObject({
      result: false
    })

    const structured = enqueue(repository, 'outbox-edge-key-23')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-c' })
    repository.ack({
      tenantId: tenantA,
      eventId: structured.id,
      workerId: 'worker-c',
      result: { nested: { ok: true } }
    })
    expect(db.state.auditEvents.at(-1)?.payload).toMatchObject({
      result: { nested: { ok: true } }
    })
  })

  it('marks sessions and conversations during a terminal handoff', () => {
    const { repository, db } = fixture()
    db.state.conversations.push({
      tenantId: tenantA,
      id: 'conv_outbox_edge',
      channel: 'web',
      senderRef: 'fixture',
      senderRefHash: 'fixture-hash',
      status: 'active',
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    db.state.sessions.push({
      id: 'sess_outbox_edge',
      conversationId: 'conv_outbox_edge',
      status: 'open',
      takeoverState: 'BOT_ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    const event = enqueue(repository, 'outbox-edge-key-24', {
      sessionId: 'sess_outbox_edge',
      conversationId: 'conv_outbox_edge'
    })
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-handoff' })
    const failed = repository.fail({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-handoff',
      error: 'takeover',
      handoff: true
    })
    expect(failed.status).toBe('dead_letter')
    expect(db.state.sessions[0]?.takeoverState).toBe('HANDOFF_REQUESTED')
    expect(db.state.conversations[0]?.status).toBe('waiting_human')
    expect(db.state.auditEvents.at(-1)?.type).toBe('handoff')
    expect(db.state.outboxAttempts.at(-1)?.outcome).toBe('handoff')

    const second = enqueue(repository, 'outbox-edge-key-25', {
      sessionId: 'sess_outbox_edge',
      conversationId: 'conv_outbox_edge'
    })
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-handoff-2' })
    repository.fail({
      tenantId: tenantA,
      eventId: second.id,
      workerId: 'worker-handoff-2',
      error: 'takeover again',
      handoff: true
    })
    expect(db.state.sessions[0]?.takeoverState).toBe('HANDOFF_REQUESTED')
  })

  it('ignores a missing handoff session and rejects a foreign conversation', () => {
    const { repository, db } = fixture()
    const missing = enqueue(repository, 'outbox-edge-key-26', {
      sessionId: 'sess_missing'
    })
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    repository.fail({
      tenantId: tenantA,
      eventId: missing.id,
      workerId: 'worker-a',
      error: 'takeover',
      handoff: true
    })
    expect(repository.findById(missing.id, tenantA)?.status).toBe('dead_letter')

    db.state.conversations.push({
      tenantId: tenantB,
      id: 'conv_outbox_foreign',
      channel: 'web',
      senderRef: 'fixture',
      senderRefHash: 'fixture-hash',
      status: 'active',
      correlationId,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    db.state.sessions.push({
      id: 'sess_outbox_foreign',
      conversationId: 'conv_outbox_foreign',
      status: 'open',
      takeoverState: 'BOT_ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    const foreign = enqueue(repository, 'outbox-edge-key-27', {
      sessionId: 'sess_outbox_foreign',
      conversationId: 'conv_outbox_foreign'
    })
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-b' })
    expect(() =>
      repository.fail({
        tenantId: tenantA,
        eventId: foreign.id,
        workerId: 'worker-b',
        error: 'takeover',
        handoff: true
      })
    ).toThrowError(/outside the event tenant scope/)
    expect(repository.findById(foreign.id, tenantA)?.status).toBe('processing')
  })

  it('preserves the takeover suppression error verbatim', () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-28')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    const failed = repository.fail({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-a',
      error: OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
      terminal: true
    })
    expect(failed.lastError).toBe(OUTBOX_TAKEOVER_SUPPRESSED_ERROR)
    expect(failed.availableAt).toBeUndefined()
  })

  it('rolls back a fail that cannot mark the session', () => {
    let failAfterWrite = false
    const { repository, db } = fixture({
      auditWriter: () => {
        if (failAfterWrite) throw new Error('synthetic audit failure')
      }
    })
    const event = enqueue(repository, 'outbox-edge-key-29')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    failAfterWrite = true
    expect(() =>
      repository.fail({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-a',
        error: 'fixture'
      })
    ).toThrowError('synthetic audit failure')
    expect(repository.findById(event.id, tenantA)?.status).toBe('processing')
    expect(db.state.outboxAttempts.at(-1)?.outcome).toBe('claimed')
  })

  it('rejects requeue for missing or live events and rolls back audit failures', () => {
    const { repository } = fixture()
    expect(() =>
      repository.requeueDeadLetter({
        tenantId: tenantA,
        eventId: 'outbox_missing',
        operatorId: 'op_fixture',
        correlationId
      })
    ).toThrowError(/not found/)
    const pending = enqueue(repository, 'outbox-edge-key-30')
    expect(() =>
      repository.requeueDeadLetter({
        tenantId: tenantA,
        eventId: pending.id,
        operatorId: 'op_fixture',
        correlationId
      })
    ).toThrowError(/Only dead-letter events/)
    expect(() =>
      repository.requeueDeadLetter({
        tenantId: tenantA,
        eventId: pending.id,
        operatorId: '   ',
        correlationId
      })
    ).toThrowError(/operatorId is invalid/)

    let auditFails = false
    const failing = new OutboxRepository(new InMemoryDatabase(), {
      auditWriter: () => {
        if (auditFails) throw new Error('synthetic requeue audit failure')
      }
    })
    const dead = enqueue(failing, 'outbox-edge-key-31')
    failing.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    failing.fail({
      tenantId: tenantA,
      eventId: dead.id,
      workerId: 'worker-a',
      error: 'terminal',
      terminal: true
    })
    auditFails = true
    expect(() =>
      failing.requeueDeadLetter({
        tenantId: tenantA,
        eventId: dead.id,
        operatorId: 'op_fixture',
        correlationId
      })
    ).toThrowError('synthetic requeue audit failure')
    expect(failing.findById(dead.id, tenantA)?.status).toBe('dead_letter')
  })

  it('validates ownership on ack and claim worker ids', () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-32')
    expect(() =>
      repository.claimNext({ tenantId: tenantA, workerId: '   ' })
    ).toThrowError(/workerId is invalid/)
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    expect(() =>
      repository.ack({
        tenantId: tenantB,
        eventId: event.id,
        workerId: 'worker-a',
        result: { ok: true }
      })
    ).toThrowError(/outside tenant scope/)
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-b',
        result: { ok: true }
      })
    ).toThrowError(/belongs to another worker/)
  })

  it('rejects expired leases and legacy events on ack', () => {
    let now = new Date('2026-09-13T12:00:00.000Z')
    const { repository, db } = fixture({
      clock: () => now,
      leaseMs: 100
    })
    const event = enqueue(repository, 'outbox-edge-key-33')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    now = new Date(now.getTime() + 101)
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-a',
        result: { ok: true }
      })
    ).toThrowError(/lease has expired/)

    const legacy = repository.enqueue('synthetic.legacy', { fixture: true })
    db.state.outbox = db.state.outbox.map((candidate) =>
      candidate.id === legacy.id
        ? {
            ...candidate,
            status: 'processing',
            tenantId: tenantA,
            leaseOwner: 'worker-legacy',
            leaseUntil: new Date(now.getTime() + 10_000)
          }
        : candidate
    )
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: legacy.id,
        workerId: 'worker-legacy',
        result: { ok: true }
      })
    ).toThrowError(/Legacy outbox events/)
  })

  it('rejects invalid clocks and supports the clock object shape', () => {
    const broken = fixture({ clock: () => new Date('invalid') })
    expect(() => enqueue(broken.repository, 'outbox-edge-key-34')).toThrowError(
      /invalid date/
    )
    const objectClock = fixture({
      clock: { now: () => new Date('2026-09-13T12:00:00.000Z') }
    })
    expect(enqueue(objectClock.repository, 'outbox-edge-key-35')).toMatchObject(
      {
        status: 'pending'
      }
    )
  })

  it('rejects ack without an owned processing event', () => {
    const { repository } = fixture()
    const event = enqueue(repository, 'outbox-edge-key-36')
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: event.id,
        workerId: 'worker-a',
        result: { ok: true }
      })
    ).toThrowError(/ownership is required/)
    expect(() =>
      repository.ack({
        tenantId: tenantA,
        eventId: 'outbox_missing',
        workerId: 'worker-a',
        result: { ok: true }
      })
    ).toThrowError(/outside tenant scope/)
  })

  it('emits usage of the supplied audit hook on claim and fail', () => {
    const hook = vi.fn()
    const { repository } = fixture({ auditWriter: hook })
    const event = enqueue(repository, 'outbox-edge-key-37')
    repository.claimNext({ tenantId: tenantA, workerId: 'worker-a' })
    repository.fail({
      tenantId: tenantA,
      eventId: event.id,
      workerId: 'worker-a',
      error: 'fixture'
    })
    expect(hook).toHaveBeenCalledTimes(1)
  })
})
