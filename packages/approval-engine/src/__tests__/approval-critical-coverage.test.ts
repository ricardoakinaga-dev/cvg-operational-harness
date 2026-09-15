import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import {
  computeApprovalPayloadHash,
  type ApprovalRecord,
  type EffectEvidence
} from '../contracts.ts'
import { InMemoryApprovalStore, type ApprovalStore } from '../store.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const AGENT = 'agent_00000000-0000-4000-8000-000000000001'

const ACTION = 'appointment.cancel'
const RESOURCE = { type: 'appointment', id: 'apt_1' }
const PAYLOAD = { appointmentId: 'apt_1', reason: 'patient request' }

const noEffectEvidence = {
  outcome: 'no_effect' as const,
  source: 'journal' as const,
  evidenceRef: 'journal:no-effect'
}

const unknownEvidence = {
  outcome: 'unknown' as const,
  reason: 'provider outcome unknown'
}

const possiblyStartedEvidence = {
  outcome: 'effect_possibly_started' as const,
  evidenceRef: 'journal:effect-started'
}

function confirmedEvidence(executionRef: string): EffectEvidence {
  return {
    outcome: 'effect_confirmed',
    executionRef,
    evidenceRef: `adapter:${executionRef}`
  }
}

function expectCode(fn: () => unknown, code: string, message?: string): void {
  try {
    fn()
    throw new Error(`expected ApprovalError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ApprovalError)
    expect((error as ApprovalError).code).toBe(code)
    if (message !== undefined) {
      expect((error as Error).message).toBe(message)
    }
  }
}

function makeEngine(
  overrides: {
    store?: ApprovalStore
    clock?: () => Date
    defaults?: boolean
  } = {}
): ApprovalEngine {
  if (overrides.defaults) return new ApprovalEngine()
  let counter = 0
  return new ApprovalEngine({
    clock: overrides.clock ?? (() => NOW),
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000,
    ...(overrides.store !== undefined ? { store: overrides.store } : {})
  })
}

function request(
  engine: ApprovalEngine,
  extra: Partial<Record<string, unknown>> = {}
): ApprovalRecord {
  return engine.request({
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: AGENT,
    agentVersion: 'v1',
    action: ACTION,
    resource: RESOURCE,
    payload: PAYLOAD,
    policyVersion: 'policy_v1',
    correlationId: CORRELATION,
    ...extra
  } as Parameters<ApprovalEngine['request']>[0])
}

function approve(
  engine: ApprovalEngine,
  approvalId: string,
  reason?: string
): ApprovalRecord {
  engine.submit(TENANT, approvalId, 'op_requester')
  return engine.approve(TENANT, approvalId, {
    approverId: 'op_approver',
    ...(reason !== undefined ? { reason } : {})
  })
}

function approvedRecord(
  engine: ApprovalEngine,
  extra: Partial<Record<string, unknown>> = {}
): ApprovalRecord {
  return approve(engine, request(engine, extra).approvalId)
}

function reserve(
  engine: ApprovalEngine,
  approvalId: string,
  extra: Partial<Record<string, unknown>> = {}
) {
  return engine.reserve({
    tenantId: TENANT,
    approvalId,
    action: ACTION,
    resource: RESOURCE,
    payload: PAYLOAD,
    ...extra
  })
}

class FailNextUpdateStore implements ApprovalStore {
  readonly inner = new InMemoryApprovalStore()
  failNext = false

  insert(record: ApprovalRecord): void {
    this.inner.insert(record)
  }

  get(tenantId: string, approvalId: string): ApprovalRecord | undefined {
    return this.inner.get(tenantId, approvalId)
  }

  update(
    tenantId: string,
    approvalId: string,
    expectedStatus: ApprovalRecord['status'],
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined {
    if (this.failNext) {
      this.failNext = false
      return undefined
    }
    return this.inner.update(tenantId, approvalId, expectedStatus, update)
  }

  list(query: Parameters<ApprovalStore['list']>[0]): ApprovalRecord[] {
    return this.inner.list(query)
  }

  listExpiringBefore(
    nowIso: string,
    statuses: readonly ApprovalRecord['status'][]
  ): ApprovalRecord[] {
    return this.inner.listExpiringBefore(nowIso, statuses)
  }
}

class ThrowingUpdateStore extends FailNextUpdateStore {
  throwNext = false

  override update(
    tenantId: string,
    approvalId: string,
    expectedStatus: ApprovalRecord['status'],
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined {
    if (this.throwNext) {
      this.throwNext = false
      throw new Error('store unavailable')
    }
    return super.update(tenantId, approvalId, expectedStatus, update)
  }
}

class TransformUpdateStore extends FailNextUpdateStore {
  constructor(
    private readonly transform: (record: ApprovalRecord) => ApprovalRecord
  ) {
    super()
  }

  override update(
    tenantId: string,
    approvalId: string,
    expectedStatus: ApprovalRecord['status'],
    update: (current: ApprovalRecord) => ApprovalRecord
  ): ApprovalRecord | undefined {
    return this.inner.update(tenantId, approvalId, expectedStatus, (current) =>
      this.transform(update(current))
    )
  }
}

function craftReservedRecord(
  store: InMemoryApprovalStore,
  mutate?: (record: ApprovalRecord) => ApprovalRecord
): ApprovalRecord {
  const base: ApprovalRecord = {
    approvalId: 'appr_crafted_0001',
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: AGENT,
    agentVersion: 'v1',
    action: ACTION,
    resource: { ...RESOURCE },
    payloadHash: computeApprovalPayloadHash({
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD
    }),
    policyVersion: 'policy_v1',
    correlationId: CORRELATION,
    status: 'RESERVED',
    singleUse: true,
    requestedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 900_000).toISOString(),
    executionCount: 0,
    reservationId: 'rsv_crafted_0001',
    reservationOwner: 'worker_1',
    reservedAt: NOW.toISOString(),
    reservationExpiresAt: new Date(NOW.getTime() - 1_000).toISOString(),
    reservationGeneration: 1
  }
  const record = mutate ? mutate(base) : base
  store.insert(record)
  return record
}

function withoutKeys(
  record: ApprovalRecord,
  keys: readonly (keyof ApprovalRecord)[]
): ApprovalRecord {
  const clone: Record<string, unknown> = { ...record }
  for (const key of keys) delete clone[key]
  return clone as unknown as ApprovalRecord
}

describe('AAA-07 critical coverage: request and review branches', () => {
  it('constructs default clock and id factory and records a valid request', () => {
    const engine = makeEngine({ defaults: true })
    const record = request(engine)
    expect(record.approvalId.startsWith('appr_')).toBe(true)
    const requestedAt = Date.parse(record.requestedAt)
    const expiresAt = Date.parse(record.expiresAt)
    expect(Number.isFinite(requestedAt)).toBe(true)
    expect(expiresAt - requestedAt).toBe(15 * 60 * 1000)
    expect(record.singleUse).toBe(true)
  })

  it('persists every optional request field exactly once', () => {
    const engine = makeEngine()
    const record = request(engine, {
      promptVersion: 'prompt_v1',
      reason: 'clinical follow-up',
      proposalId: 'prop_1',
      proposalHash: 'b'.repeat(64),
      capability: 'appointment.cancel',
      dataClassification: 'INTERNAL',
      proposalPayload: { appointmentId: 'apt_1' }
    })
    expect(record.promptVersion).toBe('prompt_v1')
    expect(record.decisionReason).toBe('clinical follow-up')
    expect(record.proposalId).toBe('prop_1')
    expect(record.dataClassification).toBe('INTERNAL')
    expect(record.capability).toBe('appointment.cancel')
    expect(record.proposalPayload).toEqual({ appointmentId: 'apt_1' })
  })

  it('denies submit from an actor other than the requesting operator', () => {
    const events: ApprovalEvent[] = []
    const engine = new ApprovalEngine({
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    const record = request(engine)
    expectCode(
      () => engine.submit(TENANT, record.approvalId, 'op_other'),
      'not_authorized'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('REQUESTED')
    expect(events.map((event) => event.type)).toEqual(['approval.requested'])
  })

  it('records an approval reason and reviews only PENDING records', () => {
    const engine = makeEngine()
    const record = approvedRecord(engine, { reason: undefined })
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')

    expectCode(
      () => engine.reject(TENANT, record.approvalId, { approverId: 'op_b' }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')

    const withReason = approve(
      engine,
      request(engine).approvalId,
      'documented decision'
    )
    expect(withReason.decisionReason).toBe('documented decision')
  })

  it('cancels a PENDING approval with the requester identity and one event', () => {
    const events: ApprovalEvent[] = []
    const engine = new ApprovalEngine({
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    const record = request(engine)
    engine.submit(TENANT, record.approvalId, 'op_requester')
    const cancelled = engine.cancel(TENANT, record.approvalId, 'op_requester')
    expect(cancelled.status).toBe('CANCELLED')
    expect(cancelled.cancelledAt).toBe(NOW.toISOString())
    expect(
      events.filter((event) => event.type === 'approval.cancelled')
    ).toHaveLength(1)
  })

  it('lists a tenant without status filter and keeps the result cloned', () => {
    const engine = makeEngine()
    request(engine)
    const all = engine.list(TENANT)
    expect(all).toHaveLength(1)
    all[0]!.resource.id = 'mutated'
    expect(engine.list(TENANT)[0]!.resource.id).toBe('apt_1')
    expect(engine.list(OTHER_TENANT)).toEqual([])
  })
})

describe('AAA-07 critical coverage: legacy consumption branches', () => {
  it('rejects consumption of an approval already marked EXPIRED', () => {
    let now = NOW
    const engine = makeEngine({ clock: () => now })
    const record = engine.request({
      tenantId: TENANT,
      operatorId: 'op_requester',
      agentId: AGENT,
      agentVersion: 'v1',
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD,
      policyVersion: 'policy_v1',
      correlationId: CORRELATION,
      expiresInMs: 1_000
    })
    now = new Date(NOW.getTime() + 2_000)
    expect(engine.expireStale(now)).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXPIRED')
    expectCode(
      () =>
        engine.verifyAndConsume({
          tenantId: TENANT,
          approvalId: record.approvalId,
          action: ACTION,
          resource: RESOURCE,
          payload: PAYLOAD
        }),
      'expired'
    )
  })

  it('matches a resource without id and consumes non-single-use with executionRef', () => {
    const engine = makeEngine()
    const resourceWithoutId = { type: 'appointment' }
    const record = approve(
      engine,
      request(engine, {
        resource: resourceWithoutId,
        payload: { note: 'no resource id' },
        singleUse: false
      }).approvalId
    )
    const consumption = engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: ACTION,
      resource: resourceWithoutId,
      payload: { note: 'no resource id' },
      executionRef: 'exec_1'
    })
    expect(consumption.executionRef).toBe('exec_1')
    expect(engine.get(TENANT, record.approvalId).executionCount).toBe(1)
    const second = engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: ACTION,
      resource: resourceWithoutId,
      payload: { note: 'no resource id' }
    })
    expect(second.executionRef).toBe('exec_1')
    expect(engine.get(TENANT, record.approvalId).executionCount).toBe(2)
  })

  it('fails closed when the single-use consumption CAS loses', () => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    store.failNext = true
    expectCode(
      () =>
        engine.verifyAndConsume({
          tenantId: TENANT,
          approvalId: record.approvalId,
          action: ACTION,
          resource: RESOURCE,
          payload: PAYLOAD
        }),
      'already_executed'
    )
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('APPROVED')
    expect(current.executionCount).toBe(0)
    expect(current.executedAt).toBeUndefined()
  })

  it('fails closed when the reusable consumption CAS loses', () => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine, { singleUse: false })
    store.failNext = true
    expectCode(
      () =>
        engine.verifyAndConsume({
          tenantId: TENANT,
          approvalId: record.approvalId,
          action: ACTION,
          resource: RESOURCE,
          payload: PAYLOAD
        }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId).executionCount).toBe(0)
  })

  it('derives the consumption timestamp defensively when the store drops it', () => {
    const store = new TransformUpdateStore((record) => {
      const { executedAt: _executedAt, ...rest } = record
      void _executedAt
      return rest
    })
    const engine = makeEngine({ store })
    const record = approvedRecord(engine, { singleUse: false })
    const consumption = engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD
    })
    expect(consumption.executedAt).toBe(NOW.toISOString())
  })
})

describe('AAA-07 critical coverage: reservation binding and CAS', () => {
  it('rejects a reservation whose agent diverges from the approved proposal', () => {
    const events: ApprovalEvent[] = []
    const engine = makeEngine()
    const record = approvedRecord(engine)
    const before = engine.get(TENANT, record.approvalId)
    expectCode(
      () => reserve(engine, record.approvalId, { agentId: 'agent_other' }),
      'proposal_mismatch'
    )
    const after = engine.get(TENANT, record.approvalId)
    expect(after.status).toBe('APPROVED')
    expect(after.reservationId).toBeUndefined()
    expect(after.reservationGeneration).toBeUndefined()
    expect(after.reservedAt).toBeUndefined()
    expect(events).toHaveLength(0)
    expect(before.executionCount).toBe(after.executionCount)
  })

  it('reserves without payload using the matching proposal hash', () => {
    const engine = makeEngine()
    const proposalHash = 'c'.repeat(64)
    const record = approve(
      engine,
      request(engine, { proposalHash, proposalPayload: undefined }).approvalId
    )
    const reservation = engine.reserve({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: ACTION,
      resource: RESOURCE,
      proposalHash
    })
    expect(reservation.generation).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')
  })

  it('supports reservations for resources without id', () => {
    const engine = makeEngine()
    const resourceWithoutId = { type: 'appointment' }
    const record = approve(
      engine,
      request(engine, {
        resource: resourceWithoutId,
        payload: { note: 'no id' }
      }).approvalId
    )
    const reservation = engine.reserve({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: ACTION,
      resource: resourceWithoutId,
      payload: { note: 'no id' }
    })
    expect(reservation.resource.type).toBe('appointment')
  })

  it('fails closed when the reservation CAS loses', () => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    store.failNext = true
    expectCode(() => reserve(engine, record.approvalId), 'already_reserved')
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('APPROVED')
    expect(current.reservationId).toBeUndefined()
    expect(current.reservationGeneration).toBeUndefined()
  })

  it('fails closed when marking EXECUTING loses the CAS', () => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    const reservation = reserve(engine, record.approvalId)
    store.failNext = true
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId
        }),
      'invalid_state'
    )
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('RESERVED')
    expect(current.executingAt).toBeUndefined()
  })

  it('propagates a non-fencing store failure while fencing generation conflicts', () => {
    const store = new ThrowingUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    const reservation = reserve(engine, record.approvalId)
    store.throwNext = true
    expect(() =>
      engine.markExecuting({
        tenantId: TENANT,
        approvalId: record.approvalId,
        reservationId: reservation.reservationId
      })
    ).toThrow('store unavailable')
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')
  })
})

describe('AAA-07 critical coverage: missing proofs and CAS failures', () => {
  it('confirms only reserved or executing approvals', () => {
    const engine = makeEngine()
    const record = approvedRecord(engine)
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_1',
          evidence: confirmedEvidence('exec_1')
        }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it('accepts non-confirmed evidence in markUncertain and rejects confirmed evidence', () => {
    const engine = makeEngine()
    const first = approvedRecord(engine)
    const firstReservation = reserve(engine, first.approvalId)
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: first.approvalId,
          reservationId: firstReservation.reservationId,
          reason: 'must not use confirm',
          evidence: confirmedEvidence('exec_1')
        }),
      'invalid_proof'
    )
    const second = approvedRecord(engine)
    const secondReservation = reserve(engine, second.approvalId)
    const uncertain = engine.markUncertain({
      tenantId: TENANT,
      approvalId: second.approvalId,
      reservationId: secondReservation.reservationId,
      reason: 'provider outcome unknown',
      evidence: possiblyStartedEvidence
    })
    expect(uncertain.status).toBe('UNCERTAIN')
    expect(uncertain.decisionReason).toBe('provider outcome unknown')
  })

  it('rejects malformed reconciliation evidence before touching state', () => {
    const engine = makeEngine()
    const record = approvedRecord(engine)
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_supervisor',
          evidence: { outcome: 'bogus' } as unknown as EffectEvidence
        }),
      'invalid_proof'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it.each([
    ['effect_confirmed' as const, confirmedEvidence('exec_1')],
    ['no_effect' as const, noEffectEvidence]
  ])(
    'fails closed when reconciliation with %s loses the CAS',
    (_label, evidence) => {
      const store = new FailNextUpdateStore()
      const engine = makeEngine({ store })
      const record = approvedRecord(engine)
      const reservation = reserve(engine, record.approvalId)
      engine.markUncertain({
        tenantId: TENANT,
        approvalId: record.approvalId,
        reservationId: reservation.reservationId,
        reason: 'uncertain before reconcile',
        evidence: unknownEvidence
      })
      store.failNext = true
      expectCode(
        () =>
          engine.reconcile({
            tenantId: TENANT,
            approvalId: record.approvalId,
            actorId: 'op_supervisor',
            evidence
          }),
        'invalid_state'
      )
      const current = engine.get(TENANT, record.approvalId)
      expect(current.status).toBe('UNCERTAIN')
      expect(current.executionCount).toBe(0)
    }
  )

  it.each([
    [
      'release',
      (engine: ApprovalEngine, id: string, rsv: string) =>
        engine.release({
          tenantId: TENANT,
          approvalId: id,
          reservationId: rsv,
          evidence: noEffectEvidence
        })
    ],
    [
      'fail',
      (engine: ApprovalEngine, id: string, rsv: string) =>
        engine.fail({
          tenantId: TENANT,
          approvalId: id,
          reservationId: rsv,
          evidence: noEffectEvidence
        })
    ],
    [
      'markUncertain',
      (engine: ApprovalEngine, id: string, rsv: string) =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: id,
          reservationId: rsv,
          reason: 'cas loss',
          evidence: unknownEvidence
        })
    ]
  ])('fails closed when %s loses the CAS', (_label, operation) => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    const reservation = reserve(engine, record.approvalId)
    store.failNext = true
    expectCode(
      () => operation(engine, record.approvalId, reservation.reservationId),
      'invalid_state'
    )
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('RESERVED')
    expect(current.executionCount).toBe(0)
    expect(current.releasedAt).toBeUndefined()
    expect(current.failedAt).toBeUndefined()
    expect(current.uncertainAt).toBeUndefined()
  })

  it('fails closed when confirmation loses the CAS', () => {
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store })
    const record = approvedRecord(engine)
    const reservation = reserve(engine, record.approvalId)
    store.failNext = true
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId,
          evidence: confirmedEvidence('exec_1')
        }),
      'invalid_state'
    )
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('RESERVED')
    expect(current.executionCount).toBe(0)
    expect(current.executionRef).toBeUndefined()
  })
})

describe('AAA-07 critical coverage: sweep and defensive store records', () => {
  it('sweeps expired reservations using the engine clock when now is omitted', () => {
    let now = NOW
    const engine = makeEngine({ clock: () => now })
    const record = approvedRecord(engine)
    reserve(engine, record.approvalId, { ttlMs: 1_000 })
    now = new Date(NOW.getTime() + 2_000)
    const result = engine.releaseExpired({
      tenantId: TENANT,
      evidenceFor: () => noEffectEvidence
    })
    expect(result).toEqual({ released: 1, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it('skips reserved records without a persisted expiry instead of guessing', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(record, ['reservationExpiresAt'])
    )
    const engine = makeEngine({ store })
    const result = engine.releaseExpired({
      tenantId: TENANT,
      evidenceFor: () => noEffectEvidence
    })
    expect(result).toEqual({ released: 0, uncertain: 0 })
    const current = engine.get(TENANT, crafted.approvalId)
    expect(current.status).toBe('RESERVED')
    expect(current.reservationExpiresAt).toBeUndefined()
  })

  it('treats a reservation without expiry as alive for markExecuting', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(record, ['reservationExpiresAt'])
    )
    const engine = makeEngine({ store })
    const updated = engine.markExecuting({
      tenantId: TENANT,
      approvalId: crafted.approvalId,
      reservationId: crafted.reservationId as string
    })
    expect(updated.status).toBe('EXECUTING')
    expect(updated.executingAt).toBe(NOW.toISOString())
  })

  it('rejects reserve resume for a partial reservation missing durable fields', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(
        {
          ...record,
          reservationExpiresAt: new Date(NOW.getTime() + 60_000).toISOString()
        },
        ['reservedAt']
      )
    )
    const engine = makeEngine({ store })
    expectCode(
      () =>
        engine.reserve({
          tenantId: TENANT,
          approvalId: crafted.approvalId,
          action: ACTION,
          resource: RESOURCE,
          payload: PAYLOAD,
          reservationId: crafted.reservationId
        }),
      'invalid_state'
    )
  })

  it('releases a legacy reservation without token and emits the reduced event', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(record, ['reservationId', 'reservationGeneration'])
    )
    const events: ApprovalEvent[] = []
    const engine = new ApprovalEngine({
      store,
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    const result = engine.releaseExpired({
      tenantId: TENANT,
      now: NOW,
      evidenceFor: () => noEffectEvidence
    })
    expect(result).toEqual({ released: 1, uncertain: 0 })
    expect(engine.get(TENANT, crafted.approvalId).status).toBe('APPROVED')
    expect(events.map((event) => event.type)).toEqual(['approval.released'])
    expect(events[0]!.reservationId).toBeUndefined()
  })

  it('marks a legacy reservation UNCERTAIN without token when proof is unknown', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys({ ...record, approvalId: 'appr_crafted_0002' }, [
        'reservationId',
        'reservationGeneration'
      ])
    )
    const events: ApprovalEvent[] = []
    const engine = new ApprovalEngine({
      store,
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    const result = engine.releaseExpired({
      tenantId: TENANT,
      now: NOW,
      evidenceFor: () => unknownEvidence
    })
    expect(result).toEqual({ released: 0, uncertain: 1 })
    expect(engine.get(TENANT, crafted.approvalId).status).toBe('UNCERTAIN')
    expect(events.map((event) => event.type)).toEqual(['approval.uncertain'])
    expect(events[0]!.reservationId).toBeUndefined()
  })

  it('reconciles a legacy UNCERTAIN record without token and emits the reduced event', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(
        {
          ...record,
          approvalId: 'appr_crafted_0003',
          status: 'UNCERTAIN',
          uncertainAt: NOW.toISOString(),
          decisionReason: 'legacy uncertainty'
        },
        ['reservationId', 'reservationGeneration']
      )
    )
    const events: ApprovalEvent[] = []
    const engine = new ApprovalEngine({
      store,
      clock: () => NOW,
      onEvent: (event) => events.push(event)
    })
    const executed = engine.reconcile({
      tenantId: TENANT,
      approvalId: crafted.approvalId,
      actorId: 'op_supervisor',
      evidence: confirmedEvidence('exec_legacy')
    })
    expect(executed.status).toBe('EXECUTED')
    expect(events.map((event) => event.type)).toEqual(['approval.reconciled'])
    expect(events[0]!.reservationId).toBeUndefined()
  })

  it('reconciles a legacy UNCERTAIN record to FAILED with absence proof', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(
        {
          ...record,
          approvalId: 'appr_crafted_0004',
          status: 'UNCERTAIN',
          uncertainAt: NOW.toISOString(),
          decisionReason: 'legacy uncertainty'
        },
        ['reservationId', 'reservationGeneration']
      )
    )
    const engine = makeEngine({ store })
    const failed = engine.reconcile({
      tenantId: TENANT,
      approvalId: crafted.approvalId,
      actorId: 'op_supervisor',
      evidence: noEffectEvidence
    })
    expect(failed.status).toBe('FAILED')
    expect(failed.confirmationEvidenceRef).toBe('journal:no-effect')
  })

  it('resumes a legacy reservation without generation as generation zero', () => {
    const store = new InMemoryApprovalStore()
    const crafted = craftReservedRecord(store, (record) =>
      withoutKeys(
        {
          ...record,
          reservationExpiresAt: new Date(NOW.getTime() + 60_000).toISOString()
        },
        ['reservationGeneration']
      )
    )
    const engine = makeEngine({ store })
    const reservation = engine.reserve({
      tenantId: TENANT,
      approvalId: crafted.approvalId,
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD,
      reservationId: crafted.reservationId
    })
    expect(reservation.generation).toBe(0)
    expect(reservation.reservationId).toBe(crafted.reservationId)
  })

  it('does not expire records when the sweep CAS loses', () => {
    let now = NOW
    const store = new FailNextUpdateStore()
    const engine = makeEngine({ store, clock: () => now })
    const record = engine.request({
      tenantId: TENANT,
      operatorId: 'op_requester',
      agentId: AGENT,
      agentVersion: 'v1',
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD,
      policyVersion: 'policy_v1',
      correlationId: CORRELATION,
      expiresInMs: 1_000
    })
    now = new Date(NOW.getTime() + 2_000)
    store.failNext = true
    expect(engine.expireStale(now)).toBe(0)
    expect(engine.get(TENANT, record.approvalId).status).toBe('REQUESTED')
    expect(engine.expireStale(now)).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXPIRED')
  })
})
