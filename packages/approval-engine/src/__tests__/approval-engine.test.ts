import { describe, expect, it, vi } from 'vitest'
import { ApprovalError, ApprovalEngine, type ApprovalEvent } from '../engine.ts'
import {
  approvalMatchesAction,
  computeApprovalPayloadHash
} from '../contracts.ts'
import { InMemoryApprovalStore } from '../store.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-11T12:00:00.000Z')

function buildEngine(
  options: {
    clock?: () => Date
    events?: ApprovalEvent[]
  } = {}
) {
  let counter = 0
  const idFactory = () => {
    counter += 1
    return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
  }
  return new ApprovalEngine({
    store: new InMemoryApprovalStore(),
    clock: options.clock ?? (() => NOW),
    idFactory,
    ...(options.events !== undefined
      ? { onEvent: (event: ApprovalEvent) => options.events?.push(event) }
      : {})
  })
}

function requestInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: 'agent_00000000-0000-4000-8000-000000000001',
    agentVersion: 'v1',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1' },
    payload: { appointmentId: 'apt_1', reason: 'patient request' },
    policyVersion: 'policy_v1',
    correlationId: 'corr_00000000-0000-4000-8000-000000000001',
    ...overrides
  }
}

async function approvedEngine(options: Parameters<typeof buildEngine>[0] = {}) {
  const engine = buildEngine(options)
  const record = engine.request(requestInput())
  engine.submit(TENANT, record.approvalId, 'op_requester')
  engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
  return { engine, record }
}

describe('approval engine', () => {
  it('walks the full state machine and emits lifecycle events', async () => {
    const events: ApprovalEvent[] = []
    const engine = buildEngine({ events })
    const requested = engine.request(requestInput())
    expect(requested.status).toBe('REQUESTED')
    expect(requested.payloadHash).toHaveLength(64)
    expect(
      engine.submit(TENANT, requested.approvalId, 'op_requester').status
    ).toBe('PENDING')
    const approved = engine.approve(TENANT, requested.approvalId, {
      approverId: 'op_approver'
    })
    expect(approved.status).toBe('APPROVED')
    expect(approved.approverId).toBe('op_approver')

    const consumption = engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId: requested.approvalId,
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: { appointmentId: 'apt_1', reason: 'patient request' },
      executionRef: 'outbox:evt_1'
    })
    expect(consumption.payloadHash).toBe(requested.payloadHash)
    expect(engine.get(TENANT, requested.approvalId).status).toBe('EXECUTED')
    expect(events.map((event) => event.type)).toEqual([
      'approval.requested',
      'approval.pending',
      'approval.approved',
      'approval.executed'
    ])
  })

  it('never executes a different action or mutated payload', async () => {
    const { engine, record } = await approvedEngine()

    expect(() =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.modify',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { appointmentId: 'apt_1', reason: 'patient request' }
      })
    ).toThrowError(expect.objectContaining({ code: 'action_mismatch' }))

    expect(() =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { appointmentId: 'apt_1', reason: 'attacker mutation' }
      })
    ).toThrowError(expect.objectContaining({ code: 'payload_mismatch' }))

    expect(() =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_2' },
        payload: { appointmentId: 'apt_1', reason: 'patient request' }
      })
    ).toThrowError(expect.objectContaining({ code: 'action_mismatch' }))

    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it('is single-use: reuse fails after execution', async () => {
    const { engine, record } = await approvedEngine()
    const consume = () =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { appointmentId: 'apt_1', reason: 'patient request' }
      })
    consume()
    expect(consume).toThrowError(
      expect.objectContaining({ code: 'already_executed' })
    )
  })

  it('allows exactly one winner in a concurrent consumption race', async () => {
    const { engine, record } = await approvedEngine()
    const consume = (ref: string) =>
      Promise.resolve().then(() =>
        engine.verifyAndConsume({
          tenantId: TENANT,
          approvalId: record.approvalId,
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' },
          payload: { appointmentId: 'apt_1', reason: 'patient request' },
          executionRef: ref
        })
      )
    const results = await Promise.allSettled([consume('a'), consume('b')])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXECUTED')
  })

  it('expires approvals and fails closed after the deadline', () => {
    let now = NOW
    const engine = buildEngine({ clock: () => now })
    const record = engine.request(requestInput({ expiresInMs: 60_000 }))
    engine.submit(TENANT, record.approvalId, 'op_requester')
    engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })

    now = new Date(NOW.getTime() + 61_000)
    const events: ApprovalEvent[] = []
    void events
    expect(() =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { appointmentId: 'apt_1', reason: 'patient request' }
      })
    ).toThrowError(expect.objectContaining({ code: 'expired' }))
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXPIRED')
  })

  it('sweeps stale approvals idempotently', () => {
    let now = NOW
    const engine = buildEngine({ clock: () => now })
    const first = engine.request(
      requestInput({
        expiresInMs: 1_000,
        correlationId: 'corr_00000000-0000-4000-8000-000000000011'
      })
    )
    const second = engine.request(
      requestInput({
        expiresInMs: 60_000,
        correlationId: 'corr_00000000-0000-4000-8000-000000000012'
      })
    )
    now = new Date(NOW.getTime() + 2_000)
    expect(engine.expireStale()).toBe(1)
    expect(engine.expireStale()).toBe(0)
    expect(engine.get(TENANT, first.approvalId).status).toBe('EXPIRED')
    expect(engine.get(TENANT, second.approvalId).status).toBe('REQUESTED')
  })

  it('denies self approval and enforces tenant isolation', async () => {
    const engine = buildEngine()
    const record = engine.request(requestInput())
    engine.submit(TENANT, record.approvalId, 'op_requester')
    expect(() =>
      engine.approve(TENANT, record.approvalId, { approverId: 'op_requester' })
    ).toThrowError(expect.objectContaining({ code: 'self_approval_denied' }))
    expect(() => engine.get(OTHER_TENANT, record.approvalId)).toThrowError(
      expect.objectContaining({ code: 'not_found' })
    )
  })

  it('supports rejection, cancellation and non-single-use execution', () => {
    const engine = buildEngine()
    const rejected = engine.request(requestInput())
    engine.submit(TENANT, rejected.approvalId, 'op_requester')
    engine.reject(TENANT, rejected.approvalId, {
      approverId: 'op_approver',
      reason: 'not today'
    })
    expect(engine.get(TENANT, rejected.approvalId).status).toBe('REJECTED')

    const cancelled = engine.request(requestInput())
    engine.cancel(TENANT, cancelled.approvalId, 'op_requester')
    expect(engine.get(TENANT, cancelled.approvalId).status).toBe('CANCELLED')

    const reusable = engine.request(requestInput({ singleUse: false }))
    engine.submit(TENANT, reusable.approvalId, 'op_requester')
    engine.approve(TENANT, reusable.approvalId, { approverId: 'op_approver' })
    const consume = () =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: reusable.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: { appointmentId: 'apt_1', reason: 'patient request' }
      })
    consume()
    consume()
    expect(engine.get(TENANT, reusable.approvalId).executionCount).toBe(2)
  })

  it('rejects invalid input and illegal transitions', () => {
    const engine = buildEngine()
    expect(() => engine.request(requestInput({ tenantId: '' }))).toThrowError(
      expect.objectContaining({ code: 'invalid_request' })
    )
    const record = engine.request(requestInput())
    expect(() =>
      engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
    ).toThrowError(expect.objectContaining({ code: 'invalid_state' }))
    expect(() =>
      engine.verifyAndConsume({
        tenantId: TENANT,
        approvalId: record.approvalId,
        action: 'appointment.cancel',
        resource: { type: 'appointment', id: 'apt_1' },
        payload: {}
      })
    ).toThrowError(expect.objectContaining({ code: 'invalid_state' }))
  })

  it('hashes payloads canonically and never exposes payloads in events', () => {
    const sensitive = { appointmentId: 'apt_1', reason: 'patient request' }
    const left = computeApprovalPayloadHash({
      action: 'appointment.cancel',
      resource: { type: 'appointment', id: 'apt_1' },
      payload: sensitive
    })
    const right = computeApprovalPayloadHash({
      action: 'appointment.cancel',
      resource: { id: 'apt_1', type: 'appointment' },
      payload: { reason: 'patient request', appointmentId: 'apt_1' }
    })
    expect(left).toBe(right)
    expect(
      approvalMatchesAction(
        {
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' },
          payloadHash: left
        },
        {
          action: 'appointment.cancel',
          resource: { type: 'appointment', id: 'apt_1' },
          payload: sensitive
        }
      )
    ).toBe(true)

    const events: ApprovalEvent[] = []
    const engine = buildEngine({ events })
    const record = engine.request(requestInput())
    expect(JSON.stringify(events)).not.toContain('patient request')
    expect(record.payloadHash).not.toContain('apt_1')
    void vi
    expect(ApprovalError.prototype).toBeDefined()
  })
})
