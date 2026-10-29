import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import type { ApprovalRecord } from '../contracts.ts'

// AUD0625 F08e / SPEC 0279 (phase 1): the expiry guard must never rewrite a
// decided or in-flight approval. The `it.fails` cases fail today for the
// audited defect (the guard flips the status to EXPIRED before the caller's
// status check); controls pass before and after the BUILD. Synthetic data.

const TENANT = 'tenant_00000000-0000-4000-8000-0000000f08e1'
const CORRELATION = 'corr_00000000-0000-4000-8000-0000000f08e1'
const AGENT = 'agent_00000000-0000-4000-8000-0000000f08e1'
const START = new Date('2026-10-29T12:00:00.000Z')
const AFTER_EXPIRY = new Date(START.getTime() + 16 * 60 * 1000)

const ACTION = 'appointment.cancel'
const RESOURCE = { type: 'appointment', id: 'apt_f08e' }
const PAYLOAD = { appointmentId: 'apt_f08e', reason: 'synthetic' }

function world() {
  let now = START
  let counter = 0
  const events: ApprovalEvent[] = []
  const engine = new ApprovalEngine({
    clock: () => now,
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000,
    onEvent: (event) => events.push(event)
  })
  const request = (extra: Record<string, unknown> = {}): ApprovalRecord =>
    engine.request({
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
  const approved = (extra: Record<string, unknown> = {}): string => {
    const { approvalId } = request(extra)
    engine.submit(TENANT, approvalId, 'op_requester')
    engine.approve(TENANT, approvalId, { approverId: 'op_approver' })
    return approvalId
  }
  const reserve = (approvalId: string) =>
    engine.reserve({
      tenantId: TENANT,
      approvalId,
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD
    }).reservationId
  const consume = (approvalId: string) =>
    engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId,
      action: ACTION,
      resource: RESOURCE,
      payload: PAYLOAD
    })
  return {
    engine,
    events,
    request,
    approved,
    reserve,
    consume,
    expire: () => {
      now = AFTER_EXPIRY
    },
    expiredEvents: () =>
      events.filter((event) => event.type === 'approval.expired').length,
    status: (approvalId: string) => engine.get(TENANT, approvalId).status
  }
}

type World = ReturnType<typeof world>

const STATES: ReadonlyArray<readonly [string, (w: World) => string]> = [
  [
    'REJECTED',
    (w) => {
      const { approvalId } = w.request()
      w.engine.submit(TENANT, approvalId, 'op_requester')
      w.engine.reject(TENANT, approvalId, { approverId: 'op_approver' })
      return approvalId
    }
  ],
  [
    'CANCELLED',
    (w) => {
      const { approvalId } = w.request()
      w.engine.cancel(TENANT, approvalId, 'op_requester')
      return approvalId
    }
  ],
  [
    'RESERVED',
    (w) => {
      const approvalId = w.approved()
      w.reserve(approvalId)
      return approvalId
    }
  ],
  [
    'EXECUTING',
    (w) => {
      const approvalId = w.approved()
      const reservationId = w.reserve(approvalId)
      w.engine.markExecuting({ tenantId: TENANT, approvalId, reservationId })
      return approvalId
    }
  ],
  [
    'FAILED',
    (w) => {
      const approvalId = w.approved()
      const reservationId = w.reserve(approvalId)
      w.engine.fail({
        tenantId: TENANT,
        approvalId,
        reservationId,
        evidence: {
          outcome: 'no_effect',
          source: 'journal',
          evidenceRef: 'journal:f08e-no-effect'
        }
      })
      return approvalId
    }
  ],
  [
    'UNCERTAIN',
    (w) => {
      const approvalId = w.approved()
      const reservationId = w.reserve(approvalId)
      w.engine.markUncertain({
        tenantId: TENANT,
        approvalId,
        reservationId,
        reason: 'synthetic unknown outcome',
        evidence: { outcome: 'unknown', reason: 'synthetic unknown outcome' }
      })
      return approvalId
    }
  ]
]

function expectCode(fn: () => unknown, code: string): void {
  let caught: unknown
  try {
    fn()
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ApprovalError)
  expect((caught as ApprovalError).code).toBe(code)
}

describe('F08e: expiry never rewrites a decided or in-flight approval (SPEC 0279)', () => {
  for (const [state, build] of STATES) {
    it.fails(
      `verifyAndConsume after expiry keeps ${state} and answers invalid_state`,
      () => {
        const w = world()
        const approvalId = build(w)
        expect(w.status(approvalId)).toBe(state)
        const before = w.expiredEvents()
        w.expire()
        expectCode(() => w.consume(approvalId), 'invalid_state')
        expect(w.status(approvalId)).toBe(state)
        expect(w.expiredEvents()).toBe(before)
      }
    )
  }

  for (const state of ['REJECTED', 'CANCELLED', 'FAILED'] as const) {
    it.fails(
      `submit after expiry keeps ${state} and answers invalid_state`,
      () => {
        const w = world()
        const approvalId = STATES.find(([name]) => name === state)![1](w)
        w.expire()
        expectCode(
          () => w.engine.submit(TENANT, approvalId, 'op_requester'),
          'invalid_state'
        )
        expect(w.status(approvalId)).toBe(state)
        expect(w.expiredEvents()).toBe(0)
      }
    )
  }

  it.fails(
    'an EXECUTING approval keeps confirming after a stray verifyAndConsume past expiry',
    () => {
      const w = world()
      const approvalId = w.approved()
      const reservationId = w.reserve(approvalId)
      w.engine.markExecuting({ tenantId: TENANT, approvalId, reservationId })
      w.expire()
      try {
        w.consume(approvalId)
      } catch {
        // The stray call is refused; the in-flight execution must survive it.
      }
      const confirmed = w.engine.confirm({
        tenantId: TENANT,
        approvalId,
        reservationId,
        evidence: {
          outcome: 'effect_confirmed',
          executionRef: 'exec_f08e',
          evidenceRef: 'adapter:exec_f08e'
        }
      })
      expect(confirmed.status).toBe('EXECUTED')
    }
  )

  describe('controls (pass before and after the BUILD)', () => {
    it('APPROVED past expiry still expires on verifyAndConsume', () => {
      const w = world()
      const approvalId = w.approved()
      w.expire()
      expectCode(() => w.consume(approvalId), 'expired')
      expect(w.status(approvalId)).toBe('EXPIRED')
      expect(w.expiredEvents()).toBe(1)
    })

    it('REQUESTED past expiry still expires on submit', () => {
      const w = world()
      const { approvalId } = w.request()
      w.expire()
      expectCode(
        () => w.engine.submit(TENANT, approvalId, 'op_requester'),
        'expired'
      )
      expect(w.status(approvalId)).toBe('EXPIRED')
    })

    it('PENDING past expiry still refuses approve and expires', () => {
      const w = world()
      const { approvalId } = w.request()
      w.engine.submit(TENANT, approvalId, 'op_requester')
      w.expire()
      expectCode(
        () =>
          w.engine.approve(TENANT, approvalId, { approverId: 'op_approver' }),
        'expired'
      )
      expect(w.status(approvalId)).toBe('EXPIRED')
    })

    it('a reusable EXECUTED approval past expiry is refused and expires, as before', () => {
      const w = world()
      const approvalId = w.approved({ singleUse: false })
      const reservationId = w.reserve(approvalId)
      w.engine.confirm({
        tenantId: TENANT,
        approvalId,
        reservationId,
        evidence: {
          outcome: 'effect_confirmed',
          executionRef: 'exec_f08e_reusable',
          evidenceRef: 'adapter:exec_f08e_reusable'
        }
      })
      expect(w.status(approvalId)).toBe('EXECUTED')
      w.expire()
      expectCode(() => w.consume(approvalId), 'expired')
      expect(w.status(approvalId)).toBe('EXPIRED')
    })

    it('REJECTED before expiry answers invalid_state and stays REJECTED', () => {
      const w = world()
      const approvalId = STATES[0]![1](w)
      expectCode(() => w.consume(approvalId), 'invalid_state')
      expect(w.status(approvalId)).toBe('REJECTED')
    })

    it('expireStale leaves decided and in-flight approvals alone', () => {
      const w = world()
      const ids = STATES.map(([state, build]) => [state, build(w)] as const)
      w.expire()
      w.engine.expireStale()
      for (const [state, approvalId] of ids) {
        expect(w.status(approvalId)).toBe(state)
      }
    })
  })
})
