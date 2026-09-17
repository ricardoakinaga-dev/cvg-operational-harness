import { describe, expect, it } from 'vitest'
import {
  DefaultConversationService,
  InMemoryConversationStore,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  type ConversationHarness,
  type HarnessActionRequest,
  type HarnessActionResult,
  type TurnAcceptanceInput
} from '../../packages/conversation/src/index.ts'
import { createSyntheticServiceDeskProfile } from '../../examples/phase4a/profiles.ts'

const profile = createSyntheticServiceDeskProfile()
const profileAuthority = createStaticConversationProfileAuthority([profile])

function turn(
  number: number,
  text: string,
  overrides: Partial<TurnAcceptanceInput> = {}
): TurnAcceptanceInput {
  return {
    tenantId: asTenantId('tenant_00000000-0000-4000-8000-000000000916'),
    conversationId: asConversationId('conversation-journey'),
    sessionId: asSessionId('session-journey'),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn-journey-${number}`),
    messageId: asMessageId(`message-journey-${number}`),
    correlationId: asCorrelationId(`correlation-journey-${number}`),
    idempotencyKey: `idempotency-journey-${number}`,
    receivedAt: `2026-09-17T13:00:${String(number).padStart(2, '0')}.000Z`,
    text,
    profile,
    ...overrides
  }
}

function approvalResume(
  result: Awaited<ReturnType<DefaultConversationService['runTurn']>>
): TurnAcceptanceInput {
  const approval = result.snapshot.workingMemory.pendingApproval
  if (!approval) throw new Error('expected a pending approval')
  return turn(
    100 + Number(result.turn.identity.turnId.split('-').pop()),
    'approval-resume',
    {
      executionId: approval.executionId,
      approvalResume: {
        authenticated: true,
        approvalId: approval.approvalId,
        proposalHash: approval.proposalHash,
        operationKey: approval.operationKey,
        executionId: approval.executionId,
        proof: 'synthetic-authority-proof'
      }
    }
  )
}

describe('AAA-4A Service Desk governed journey', () => {
  it('carries a synthetic reservation into governed modify and cancel operations', async () => {
    const store = new InMemoryConversationStore()
    const approvalIds = new Map<string, string>()
    const effects: string[] = []
    const harness: ConversationHarness = {
      async execute(
        request: HarnessActionRequest
      ): Promise<HarnessActionResult> {
        const approvalId =
          approvalIds.get(request.proposal.operationKey) ??
          `approval-${effects.length + 1}`
        if (!request.approvalResume) {
          approvalIds.set(request.proposal.operationKey, approvalId)
          return {
            status: 'APPROVAL_REQUIRED',
            executionId: request.executionId,
            approvalId,
            proposalHash: request.proposal.proposalHash,
            operationKey: request.proposal.operationKey,
            effectConfirmed: false,
            stopReason: 'APPROVAL_REQUIRED',
            evidenceRefs: [`execution:${request.executionId}:approval_required`]
          }
        }
        effects.push(request.proposal.action)
        return {
          status: 'SUCCEEDED',
          executionId: request.executionId,
          proposalHash: request.proposal.proposalHash,
          operationKey: request.proposal.operationKey,
          effectConfirmed: true,
          output:
            request.proposal.action === 'CREATE'
              ? { reservationId: 'reservation.synthetic.001' }
              : {
                  reservationId:
                    request.proposal.payload.reservationId ??
                    'reservation.synthetic.001'
                },
          stopReason: 'COMPLETED',
          evidenceRefs: [
            `execution:${request.executionId}:completed`,
            `effect:${request.executionId}`
          ]
        }
      }
    }
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter(),
      harness,
      approval: {
        verify: async ({ resume, pendingApproval }) =>
          resume.proof === 'synthetic-authority-proof' &&
          resume.authenticated === true &&
          resume.approvalId === pendingApproval.approvalId &&
          resume.proposalHash === pendingApproval.proposalHash &&
          resume.operationKey === pendingApproval.operationKey
      },
      effectEvidence: { verify: async () => true }
    })

    const proposed = await service.runTurn(
      turn(1, 'Reserve a room on Friday at 10:00, room Atlas.')
    )
    expect(proposed.turn.planKind).toBe('PROPOSE_ACTION')
    const waiting = await service.runTurn(turn(2, 'sim'))
    expect(waiting.turn.executionStatus).toBe('WAITING_APPROVAL')
    const created = await service.runTurn(approvalResume(waiting))
    expect(created.turn.executionStatus).toBe('SUCCEEDED')
    expect(created.snapshot.workingMemory.entities).toContainEqual(
      expect.objectContaining({
        key: 'reservationId',
        value: 'reservation.synthetic.001',
        source: 'SYSTEM',
        status: 'ACTIVE'
      })
    )

    const modifyProposal = await service.runTurn(
      turn(4, 'Change the reservation just made to a later time.')
    )
    expect(modifyProposal.turn.planKind).toBe('PROPOSE_ACTION')
    expect(
      modifyProposal.snapshot.workingMemory.pendingProposal?.payload
    ).toMatchObject({
      reservationId: 'reservation.synthetic.001',
      date: 'friday',
      time: 'later',
      room: 'Atlas'
    })
    const modifyWaiting = await service.runTurn(turn(5, 'yes'))
    const modified = await service.runTurn(approvalResume(modifyWaiting))
    expect(modified.turn.executionStatus).toBe('SUCCEEDED')

    const cancelProposal = await service.runTurn(
      turn(7, 'Cancel reservation reservation.synthetic.001.')
    )
    expect(cancelProposal.turn.planKind).toBe('PROPOSE_ACTION')
    expect(
      cancelProposal.snapshot.workingMemory.pendingProposal?.payload
    ).toMatchObject({
      reservationId: 'reservation.synthetic.001'
    })
    const cancelWaiting = await service.runTurn(turn(8, 'yes'))
    const cancelled = await service.runTurn(approvalResume(cancelWaiting))
    expect(cancelled.turn.executionStatus).toBe('SUCCEEDED')
    expect(effects).toEqual(['CREATE', 'MODIFY', 'CANCEL'])
  })
})
