import { describe, expect, it } from 'vitest'
import {
  ApprovalReconciliationDataError,
  reconcileApprovalDecision,
  type ApprovalDecision,
  type ReconciliationApproval
} from '../approval-reconciliation.ts'

// AUD0625 F08b / SPEC 0274 (phase 1): a decision taken before the approval
// ended in FAILED or EXPIRED must still leave its approval_decision event.
// The four target tests were `it.fails` in phase 1 and are plain tests now; controls pass
// before and after the BUILD. Synthetic data only.

const TENANT = 'tenant_f08b_synthetic'
const EXECUTION = 'execution_f08b_1'

const envelope: ReconciliationApproval = {
  approvalId: 'approval_f08b_1',
  status: 'APPROVED',
  approverId: 'operator.human.synthetic',
  decisionActorType: 'Approver',
  decisionReason: 'synthetic reason',
  decisionCorrelationId: 'corr_decision_f08b_1',
  decisionCommandKey: 'cmd_decision_f08b_1',
  policyVersion: 'policy-f08b-v1',
  payloadHash: 'c'.repeat(64),
  operationKey: 'operation.f08b.1',
  correlationId: 'corr_request_f08b_1'
}

type Approval = ReconciliationApproval & {
  readonly approvedAt?: string
  readonly rejectedAt?: string
}

function world(approval: Approval) {
  const events = new Map<string, Record<string, unknown>>()
  let resolves = 0
  const ports = {
    getApproval: () => approval,
    resolveExecution: async () => {
      resolves += 1
      return { id: EXECUTION, state: 'QUEUED' }
    },
    appendAudit: async (event: { payload: Record<string, unknown> }) => {
      const key = `${String(event.payload.approvalId)}:${String(event.payload.decision)}`
      if (!events.has(key)) events.set(key, event.payload)
    }
  }
  return { ports, events, resolves: () => resolves }
}

const run = (w: ReturnType<typeof world>, decision: ApprovalDecision) =>
  reconcileApprovalDecision(w.ports, {
    tenantId: TENANT,
    executionId: EXECUTION,
    approvalId: envelope.approvalId,
    decision
  })

const APPROVED_AT = '2026-10-28T10:00:00.000Z'
const REJECTED_AT = '2026-10-28T10:00:00.000Z'

describe('F08b: decisão recuperada em estado terminal (SPEC 0274)', () => {
  it('FAILED depois de APPROVED grava o evento approved sem retomar a execução', async () => {
    const w = world({
      ...envelope,
      status: 'FAILED',
      approvedAt: APPROVED_AT
    })
    await run(w, 'APPROVED')
    expect(w.resolves()).toBe(0)
    expect([...w.events.values()]).toEqual([
      expect.objectContaining({
        decision: 'approved',
        recovered: true,
        observedApprovalStatus: 'FAILED'
      })
    ])
  })

  it('EXPIRED depois de APPROVED grava o evento approved', async () => {
    const w = world({ ...envelope, status: 'EXPIRED', approvedAt: APPROVED_AT })
    await run(w, 'APPROVED')
    expect(w.resolves()).toBe(0)
    expect([...w.events.keys()]).toEqual([`${envelope.approvalId}:approved`])
  })

  it('EXPIRED depois de REJECTED grava o evento rejected', async () => {
    const w = world({ ...envelope, status: 'EXPIRED', rejectedAt: REJECTED_AT })
    await run(w, 'REJECTED')
    expect(w.resolves()).toBe(0)
    expect([...w.events.keys()]).toEqual([`${envelope.approvalId}:rejected`])
  })

  it('repetir a recuperação não duplica o evento', async () => {
    const w = world({ ...envelope, status: 'FAILED', approvedAt: APPROVED_AT })
    await run(w, 'APPROVED')
    await run(w, 'APPROVED')
    expect(w.events.size).toBe(1)
  })

  it('controle: EXPIRED nunca decidido é erro de dado, sem evento', async () => {
    const w = world({ ...envelope, status: 'EXPIRED' })
    await expect(run(w, 'APPROVED')).rejects.toBeInstanceOf(
      ApprovalReconciliationDataError
    )
    expect(w.events.size).toBe(0)
    expect(w.resolves()).toBe(0)
  })

  it('controle: decisão pedida contrária à registrada é erro de dado', async () => {
    const w = world({ ...envelope, status: 'FAILED', approvedAt: APPROVED_AT })
    await expect(run(w, 'REJECTED')).rejects.toBeInstanceOf(
      ApprovalReconciliationDataError
    )
    expect(w.events.size).toBe(0)
  })

  it('controle: EXPIRED com approvedAt e rejectedAt ao mesmo tempo é erro de dado', async () => {
    const w = world({
      ...envelope,
      status: 'EXPIRED',
      approvedAt: APPROVED_AT,
      rejectedAt: REJECTED_AT
    })
    await expect(run(w, 'APPROVED')).rejects.toBeInstanceOf(
      ApprovalReconciliationDataError
    )
    expect(w.events.size).toBe(0)
  })

  describe('BUILD: ator, passos e limites da recuperação terminal', () => {
    it('o passo registra execution:skipped_terminal e o evento usa o envelope persistido', async () => {
      const events: Array<Record<string, unknown>> = []
      const report = await reconcileApprovalDecision(
        {
          getApproval: () => ({
            ...envelope,
            status: 'FAILED',
            approvedAt: APPROVED_AT
          }),
          resolveExecution: () => {
            throw new Error('terminal approval must never resume')
          },
          appendAudit: (event) => {
            events.push(event as unknown as Record<string, unknown>)
          }
        },
        {
          tenantId: TENANT,
          executionId: EXECUTION,
          approvalId: envelope.approvalId,
          decision: 'APPROVED'
        }
      )
      expect(report.steps).toEqual([
        'execution:skipped_terminal',
        'audit:approval_decision'
      ])
      expect(events).toEqual([
        expect.objectContaining({
          actorType: 'Approver',
          actorId: 'operator.human.synthetic',
          correlationId: 'corr_decision_f08b_1',
          policyVersion: 'policy-f08b-v1',
          payload: expect.objectContaining({
            decision: 'approved',
            commandKey: 'cmd_decision_f08b_1',
            recovered: true,
            observedApprovalStatus: 'FAILED'
          })
        })
      ])
    })

    it.each(['FAILED', 'EXPIRED'])(
      '%s com rejectedAt e pedido APPROVED é erro de dado (nunca a decisão contrária)',
      async (status) => {
        const w = world({ ...envelope, status, rejectedAt: REJECTED_AT })
        await expect(run(w, 'APPROVED')).rejects.toBeInstanceOf(
          ApprovalReconciliationDataError
        )
        expect(w.events.size).toBe(0)
        expect(w.resolves()).toBe(0)
      }
    )

    it('FAILED com rejectedAt e pedido REJECTED grava o evento rejected', async () => {
      const w = world({
        ...envelope,
        status: 'FAILED',
        rejectedAt: REJECTED_AT
      })
      await run(w, 'REJECTED')
      expect([...w.events.keys()]).toEqual([`${envelope.approvalId}:rejected`])
      expect(w.resolves()).toBe(0)
    })

    it.each(['FAILED', 'EXPIRED'])(
      '%s sem nenhum timestamp é erro de dado',
      async (status) => {
        const w = world({ ...envelope, status })
        await expect(run(w, 'APPROVED')).rejects.toBeInstanceOf(
          ApprovalReconciliationDataError
        )
        await expect(run(w, 'REJECTED')).rejects.toBeInstanceOf(
          ApprovalReconciliationDataError
        )
        expect(w.events.size).toBe(0)
      }
    )

    it('envelope incompleto continua sendo erro de dado também em estado terminal', async () => {
      const { decisionCommandKey: _omitted, ...incomplete } = envelope
      void _omitted
      const w = world({
        ...incomplete,
        status: 'EXPIRED',
        approvedAt: APPROVED_AT
      })
      await expect(run(w, 'APPROVED')).rejects.toBeInstanceOf(
        ApprovalReconciliationDataError
      )
      expect(w.events.size).toBe(0)
    })

    it('a recuperação terminal não muda os outros estados (APPROVED retoma, REJECTED não)', async () => {
      const approved = world({ ...envelope, status: 'APPROVED' })
      await run(approved, 'APPROVED')
      expect(approved.resolves()).toBe(1)
      const stray = world({
        ...envelope,
        status: 'APPROVED',
        approvedAt: APPROVED_AT,
        rejectedAt: REJECTED_AT
      })
      await run(stray, 'APPROVED')
      expect(stray.resolves()).toBe(1)
    })
  })
})
