import { describe, expect, it, vi } from 'vitest'
import { RuntimeEffectRecovery } from '../runtime-effect-recovery.ts'

function recoveryWith(options: Record<string, unknown> = {}) {
  return new RuntimeEffectRecovery({
    effectJournal: undefined,
    approvals: { markUncertain: async () => {} },
    ...options
  } as never)
}

const input = {
  tenantId: 'tenant_pdsh031',
  correlationId: 'corr_pdsh031',
  approvalId: 'approval_pdsh031',
  operatorId: 'operator_pdsh031',
  agentId: 'agent_pdsh031',
  agentVersion: 'v1',
  capability: 'record.cancel',
  action: 'record.cancel',
  resource: { type: 'record' }
} as never

const reservation = { reservationId: 'reservation_pdsh031' } as never
const decision = {
  policyVersion: 'policy-v1',
  reason: 'policy allows'
} as never

describe('PDSH-031 slice 3b — effect recovery boundaries', () => {
  it('wraps a raw tool failure without an Error message', async () => {
    const recovery = recoveryWith()
    const finish = vi.fn(() => 'DENIED_RESULT')
    const result = await recovery.handleToolFailure(
      input,
      decision,
      reservation,
      'raw tool failure',
      { appendAudit: vi.fn(), finish } as never
    )
    expect(result).toBe('DENIED_RESULT')
    expect(finish).toHaveBeenCalledWith('denied', 'effect_uncertain', decision)

    const withoutApproval = await recovery.handleToolFailure(
      { ...(input as Record<string, unknown>), approvalId: undefined } as never,
      decision,
      reservation,
      'raw tool failure',
      { appendAudit: vi.fn(), finish } as never
    )
    expect(withoutApproval).toBe('DENIED_RESULT')
  })

  it('skips replay without a journal or a proposal hash', async () => {
    const withoutJournal = recoveryWith()
    expect(
      await withoutJournal.replayConfirmedEffect(
        input,
        { proposalHash: 'hash_pdsh031' } as never,
        decision,
        {} as never
      )
    ).toBeUndefined()

    const withJournal = recoveryWith({
      effectJournal: { get: async () => undefined }
    })
    expect(
      await withJournal.replayConfirmedEffect(
        input,
        { proposalHash: undefined, operationKey: 'op_legacy' } as never,
        decision,
        {} as never
      )
    ).toBeUndefined()
  })

  it('recomputes the operation key for a keyless replay record', async () => {
    const get = vi.fn(async (tenantId: string, operationKey: string) => {
      expect(tenantId).toBe('tenant_pdsh031')
      expect(operationKey.startsWith('op:')).toBe(true)
      return { state: 'RESERVED', proposalHash: 'hash_pdsh031' }
    })
    const recovery = recoveryWith({ effectJournal: { get } })
    const result = await recovery.replayConfirmedEffect(
      input,
      {
        proposalHash: 'hash_pdsh031',
        operationKey: undefined,
        action: 'record.cancel',
        resource: { type: 'record' }
      } as never,
      decision,
      {} as never
    )
    expect(result).toBeUndefined()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reserves without a journal and denies a hashless record', async () => {
    const withoutJournal = recoveryWith()
    expect(
      await withoutJournal.reserveJournalEffect(
        input,
        { approvalId: 'approval_pdsh031' } as never,
        reservation,
        'op_pdsh031',
        decision,
        {
          appendAudit: vi.fn(),
          finish: vi.fn(),
          clock: () => new Date()
        } as never
      )
    ).toEqual({ kind: 'ok', attemptId: '' })

    const finish = vi.fn(() => 'DENIED_RESULT')
    const appendAudit = vi.fn()
    const withJournal = recoveryWith({
      effectJournal: { get: async () => undefined }
    })
    const outcome = await withJournal.reserveJournalEffect(
      input,
      { approvalId: 'approval_pdsh031' } as never,
      reservation,
      'op_pdsh031',
      decision,
      { appendAudit, finish, clock: () => new Date() } as never
    )
    expect(outcome).toEqual({ kind: 'result', result: 'DENIED_RESULT' })
    expect(finish).toHaveBeenCalledWith('denied', 'proposal_missing', decision)
    expect(appendAudit).toHaveBeenCalledWith('runtime.denied', {
      code: 'proposal_missing'
    })
  })
})
