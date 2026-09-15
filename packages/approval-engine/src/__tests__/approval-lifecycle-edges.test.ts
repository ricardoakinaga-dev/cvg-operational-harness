import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import type { EffectEvidence } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'

const BINDING = {
  tenantId: TENANT,
  action: 'appointment.cancel',
  resource: { type: 'appointment', id: 'apt_1' },
  payload: { appointmentId: 'apt_1', reason: 'patient request' },
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  policyVersion: 'policy_v1'
}

const noEffect: EffectEvidence = {
  outcome: 'no_effect',
  source: 'journal',
  evidenceRef: 'journal:reserved'
}

function buildEngine(
  options: { clock?: () => Date; events?: ApprovalEvent[] } = {}
) {
  let counter = 0
  return new ApprovalEngine({
    clock: options.clock ?? (() => NOW),
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000,
    ...(options.events !== undefined
      ? { onEvent: (event: ApprovalEvent) => options.events?.push(event) }
      : {})
  })
}

function requestInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: BINDING.agentId,
    agentVersion: BINDING.agentVersion,
    action: BINDING.action,
    resource: BINDING.resource,
    payload: BINDING.payload,
    policyVersion: BINDING.policyVersion,
    correlationId: CORRELATION,
    ...overrides
  }
}

function approvedEngine(options: Parameters<typeof buildEngine>[0] = {}) {
  const engine = buildEngine(options)
  const record = engine.request(requestInput())
  engine.submit(TENANT, record.approvalId, 'op_requester')
  engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
  return { engine, record }
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn()
    throw new Error(`expected ApprovalError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ApprovalError)
    expect((error as ApprovalError).code).toBe(code)
  }
}

describe('AAA-07 lifecycle edges and fail-closed branches', () => {
  it('rejects malformed reservation requests', () => {
    const { engine, record } = approvedEngine()
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          ttlMs: 10
        }),
      'invalid_request'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          unexpected: true
        } as never),
      'invalid_request'
    )
  })

  it('denies reserve in every non-approved state', () => {
    const engine = buildEngine()
    const requested = engine.request(requestInput())
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: requested.approvalId,
          reservationId: 'rsv_1'
        }),
      'invalid_state'
    )
    engine.submit(TENANT, requested.approvalId, 'op_requester')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: requested.approvalId,
          reservationId: 'rsv_1'
        }),
      'invalid_state'
    )
    engine.reject(TENANT, requested.approvalId, { approverId: 'op_approver' })
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: requested.approvalId,
          reservationId: 'rsv_1'
        }),
      'invalid_state'
    )

    const cancelled = engine.request(requestInput())
    engine.cancel(TENANT, cancelled.approvalId, 'op_requester')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: cancelled.approvalId,
          reservationId: 'rsv_1'
        }),
      'invalid_state'
    )
  })

  it('keeps an expired live reservation from being resumed', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'already_reserved'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'reservation_expired'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'reservation_expired'
    )
  })

  it('validates capability divergence and missing binding evidence', () => {
    const engine = buildEngine()
    const record = engine.request(
      requestInput({ capability: 'appointment.cancel' })
    )
    engine.submit(TENANT, record.approvalId, 'op_requester')
    engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          capability: 'appointment.modify',
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'proposal_mismatch'
    )
    expectCode(
      () =>
        engine.reserve({
          tenantId: TENANT,
          approvalId: record.approvalId,
          action: BINDING.action,
          resource: BINDING.resource,
          reservationId: 'rsv_A'
        }),
      'invalid_request'
    )
  })

  it('records the reservation owner when provided', () => {
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ events })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ownerId: 'worker_1'
    })
    const reserved = events.find((event) => event.type === 'approval.reserved')
    expect(reserved?.actorId).toBe('worker_1')
    expect(engine.get(TENANT, record.approvalId).reservationOwner).toBe(
      'worker_1'
    )
  })

  it('rejects invalid execution transitions and proofs', () => {
    const { engine, record } = approvedEngine()
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'invalid_state'
    )
    const invalid: EffectEvidence[] = [
      noEffect,
      { outcome: 'unknown', reason: 'lost' }
    ]
    for (const evidence of invalid) {
      expectCode(
        () =>
          engine.confirm({
            tenantId: TENANT,
            approvalId: record.approvalId,
            reservationId: 'rsv_A',
            evidence
          }),
        'invalid_proof'
      )
    }
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          reason: 'x'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_1',
          evidence: noEffect
        }),
      'invalid_state'
    )
  })

  it('fails closed on invalid proofs inside reserved states', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: { outcome: 'unknown', reason: 'no proof' }
        }),
      'invalid_proof'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: {
            outcome: 'effect_possibly_started',
            evidenceRef: 'journal:started'
          }
        }),
      'invalid_proof'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          reason: '   '
        }),
      'invalid_request'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          reason: 'already confirmed',
          evidence: {
            outcome: 'effect_confirmed',
            executionRef: 'outbox:1',
            evidenceRef: 'adapter:1'
          }
        }),
      'invalid_proof'
    )
  })

  it('validates reconciliation inputs after markUncertain', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.markUncertain({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      reason: 'timeout'
    })
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: '   ',
          evidence: noEffect
        }),
      'invalid_request'
    )
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_1',
          evidence: { outcome: 'unknown', reason: 'still unknown' }
        }),
      'invalid_proof'
    )
  })

  it('sweeps only expired reservations and maps ambiguous evidence to uncertain', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 60_000
    })
    const notExpired = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => noEffect
    })
    expect(notExpired).toEqual({ released: 0, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')

    now = new Date(NOW.getTime() + 61_000)
    const ambiguous = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => ({
        outcome: 'effect_possibly_started',
        evidenceRef: 'journal:started'
      })
    })
    expect(ambiguous).toEqual({ released: 0, uncertain: 1 })
    expect(engine.get(TENANT, record.approvalId).status).toBe('UNCERTAIN')
  })

  it('clones primitive proposal payloads without exposing references', () => {
    const engine = buildEngine()
    const record = engine.request(
      requestInput({ proposalPayload: 'plain-text' })
    )
    const snapshot = engine.get(TENANT, record.approvalId)
    expect(snapshot.proposalPayload).toBe('plain-text')
    ;(snapshot as unknown as { proposalPayload: string }).proposalPayload =
      'mutated'
    expect(engine.get(TENANT, record.approvalId).proposalPayload).toBe(
      'plain-text'
    )
  })
})
