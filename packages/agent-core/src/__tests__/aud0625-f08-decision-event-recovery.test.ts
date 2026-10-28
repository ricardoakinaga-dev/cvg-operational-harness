import { describe, expect, it } from 'vitest'
import {
  reconcileApprovalDecision,
  type ApprovalDecision,
  type ReconciliationApproval
} from '../approval-reconciliation.ts'

// AUD0625 F08 / SPEC 0272. The `it.fails` cases state the target behaviour and
// pass today only because the defect exists: once the recovery is fixed vitest
// reports them and the marker must be removed.

const TENANT = 'tenant_f08_synthetic'
const EXECUTION = 'execution_f08_1'

const decided: ReconciliationApproval = {
  approvalId: 'approval_f08_1',
  status: 'APPROVED',
  approverId: 'operator.human.synthetic',
  decisionActorType: 'Approver',
  decisionReason: 'synthetic reason',
  decisionCorrelationId: 'corr_decision_f08_1',
  decisionCommandKey: 'cmd_decision_f08_1',
  policyVersion: 'policy-f08-v1',
  payloadHash: 'b'.repeat(64),
  operationKey: 'operation.f08.1',
  correlationId: 'corr_request_f08_1'
}

interface AuditEvent {
  payload: Record<string, unknown>
}

/** In-memory store with the same dedupe key as migration 0021. */
function world(initial: ReconciliationApproval) {
  let approval = initial
  const events = new Map<string, AuditEvent>()
  let failNextAppend = false
  let resolves = 0
  const ports = {
    getApproval: () => approval,
    resolveExecution: async () => {
      resolves += 1
      return { id: EXECUTION, state: 'QUEUED' }
    },
    appendAudit: async (event: AuditEvent) => {
      if (failNextAppend) {
        failNextAppend = false
        throw new Error('crash before the audit append')
      }
      const key = `${String(event.payload.approvalId)}:${String(event.payload.decision)}`
      if (!events.has(key)) events.set(key, event)
    }
  }
  return {
    ports,
    events,
    resolves: () => resolves,
    crashNextAppend: () => {
      failNextAppend = true
    },
    advanceTo: (status: string) => {
      approval = { ...approval, status }
    }
  }
}

const run = (
  w: ReturnType<typeof world>,
  decision: ApprovalDecision = 'APPROVED'
) =>
  reconcileApprovalDecision(w.ports, {
    tenantId: TENANT,
    executionId: EXECUTION,
    approvalId: decided.approvalId,
    decision
  })

describe('F08: o evento de decisão é recuperável depois que a execução avança', () => {
  describe.each(['RESERVED', 'EXECUTING', 'EXECUTED'])(
    'aprovação já em %s',
    (status) => {
      it.fails(
        'alvo: crash entre resume e append, execução avança, reconciliação grava o evento uma vez',
        async () => {
          const w = world(decided)
          w.crashNextAppend()
          await expect(run(w)).rejects.toThrow('crash before')
          expect(w.events.size).toBe(0)

          w.advanceTo(status)
          await run(w)
          expect(w.events.size).toBe(1)
          expect([...w.events.values()][0]?.payload).toMatchObject({
            approvalId: decided.approvalId,
            decision: 'approved',
            commandKey: decided.decisionCommandKey
          })
        }
      )

      it('caracterização: hoje a reconciliação rejeita por "decision mismatch" e o evento fica ausente', async () => {
        const w = world({ ...decided, status })
        await expect(run(w)).rejects.toThrow('decision mismatch')
        expect(w.events.size).toBe(0)
      })

      it('controle: o estado posterior nunca autoriza a decisão contrária', async () => {
        const w = world({ ...decided, status })
        await expect(run(w, 'REJECTED')).rejects.toThrow()
        expect(w.events.size).toBe(0)
      })
    }
  )

  it('controle: crash entre resume e append com status APPROVED converge no replay', async () => {
    const w = world(decided)
    w.crashNextAppend()
    await expect(run(w)).rejects.toThrow('crash before')
    await run(w)
    expect(w.events.size).toBe(1)
  })

  it('controle: worker e retry concorrentes deixam exatamente um evento', async () => {
    const w = world(decided)
    await Promise.all([run(w), run(w), run(w)])
    expect(w.events.size).toBe(1)
  })

  it('controle: REJECTED registra o evento rejected uma vez', async () => {
    const w = world({ ...decided, status: 'REJECTED' })
    await run(w, 'REJECTED')
    await run(w, 'REJECTED')
    expect([...w.events.values()].map((e) => e.payload.decision)).toEqual([
      'rejected'
    ])
  })

  it('controle: PENDING e envelope incompleto continuam falhando fechado', async () => {
    await expect(run(world({ ...decided, status: 'PENDING' }))).rejects.toThrow(
      'decided approval'
    )
    const incomplete: Record<string, unknown> = { ...decided }
    delete incomplete.decisionCommandKey
    await expect(
      run(world(incomplete as unknown as ReconciliationApproval))
    ).rejects.toThrow('envelope')
  })
})
