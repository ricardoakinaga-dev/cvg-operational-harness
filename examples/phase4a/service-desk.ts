import {
  DefaultConversationService,
  InMemoryConversationStore,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asExecutionId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  type ApprovalResumeRequest,
  type ConversationHarness,
  type ConversationJsonValue,
  type HarnessActionRequest,
  type HarnessActionResult,
  type ConversationProfile,
  type ConversationTurnResult,
  type ExecutionId,
  type TurnAcceptanceInput
} from '@cvg/conversation'
import { createSyntheticServiceDeskProfile } from './profiles.ts'

const FIXED_NOW = '2026-09-17T12:00:00.000Z'
const SERVICE_DESK_TENANT = 'tenant.phase4a.synthetic'
const SERVICE_DESK_CONVERSATION = 'conversation.phase4a.service-desk'
const SERVICE_DESK_SESSION = 'session.phase4a.service-desk'

export interface SyntheticHarnessCall {
  readonly executionId: string
  readonly proposalHash: string
  readonly operationKey: string
  readonly approvalResumeAuthenticated: boolean
}

export interface SyntheticEffectRecord {
  readonly kind: 'IN_MEMORY_SYNTHETIC_RESERVATION'
  readonly executionId: string
  readonly reservationId: string
  readonly payload: Readonly<Record<string, ConversationJsonValue>>
}

/**
 * A deterministic ConversationHarness port. It models approval and an
 * effect-backed result entirely in memory; it has no provider, channel, or
 * external I/O implementation behind it.
 */
export class FakeConversationHarness implements ConversationHarness {
  readonly calls: SyntheticHarnessCall[] = []
  readonly effects: SyntheticEffectRecord[] = []
  readonly #approvalIds = new Map<string, string>()

  async execute(input: HarnessActionRequest): Promise<HarnessActionResult> {
    const executionId = input.executionId
    const issuedApprovalId = this.#approvalIds.get(input.proposal.operationKey)
    const approvalId =
      issuedApprovalId ?? `approval_${input.proposal.proposalHash.slice(0, 16)}`
    const approvalResume = input.approvalResume

    this.calls.push({
      executionId: String(executionId),
      proposalHash: input.proposal.proposalHash,
      operationKey: input.proposal.operationKey,
      approvalResumeAuthenticated: approvalResume?.authenticated === true
    })

    if (!approvalResume) {
      this.#approvalIds.set(input.proposal.operationKey, approvalId)
      return {
        status: 'APPROVAL_REQUIRED',
        executionId,
        approvalId,
        proposalHash: input.proposal.proposalHash,
        operationKey: input.proposal.operationKey,
        effectConfirmed: false,
        stopReason: 'APPROVAL_REQUIRED',
        evidenceRefs: [`execution:${executionId}:approval_required`]
      }
    }

    if (
      approvalResume.authenticated !== true ||
      !issuedApprovalId ||
      approvalResume.approvalId !== approvalId ||
      approvalResume.proposalHash !== input.proposal.proposalHash ||
      approvalResume.operationKey !== input.proposal.operationKey
    ) {
      return {
        status: 'DENIED',
        executionId,
        proposalHash: input.proposal.proposalHash,
        operationKey: input.proposal.operationKey,
        effectConfirmed: false,
        stopReason: 'APPROVAL_BINDING_MISMATCH',
        evidenceRefs: [`execution:${executionId}:denied`]
      }
    }

    const payload = input.proposal.payload
    const effect: SyntheticEffectRecord = {
      kind: 'IN_MEMORY_SYNTHETIC_RESERVATION',
      executionId: String(executionId),
      reservationId: 'reservation.phase4a.synthetic.001',
      payload
    }
    this.effects.push(effect)
    return {
      status: 'SUCCEEDED',
      executionId,
      proposalHash: input.proposal.proposalHash,
      operationKey: input.proposal.operationKey,
      effectConfirmed: true,
      output: {
        reservationId: effect.reservationId,
        action: input.proposal.action,
        synthetic: true,
        payload
      },
      stopReason: 'COMPLETED',
      evidenceRefs: [
        `execution:${executionId}:completed`,
        `effect:${executionId}`
      ]
    }
  }
}

export interface ServiceDeskTranscriptEntry {
  readonly step: string
  readonly userText: string
  readonly planKind: string | null
  readonly turnStatus: string
  readonly executionStatus: string | null
  readonly response: string
  readonly groundingAccepted: boolean
  readonly replayed: boolean
}

export interface ServiceDeskDemoResult {
  readonly profile: { readonly id: string; readonly version: string }
  readonly transcript: readonly ServiceDeskTranscriptEntry[]
  readonly proposal: {
    readonly status: string
    readonly action: string
    readonly capabilityId: string
    readonly proposalHash: string
    readonly operationKey: string
  }
  readonly approval: {
    readonly requested: true
    readonly approvalId: string
    readonly naturalLanguageConfirmationDidNotConfirm: true
    readonly effectConfirmedBeforeApproval: false
  }
  readonly completion: {
    readonly status: string
    readonly effectConfirmed: true
    readonly effectReference: string
    readonly reservationId: string
  }
  readonly harness: {
    readonly calls: number
    readonly syntheticEffects: number
    readonly duplicateReplay: boolean
    readonly externalEffects: false
  }
  readonly controlledScope: 'synthetic-local-only'
}

/** Run the Service Desk proposal, approval, effect, and replay journey. */
export async function runServiceDeskDemo(): Promise<ServiceDeskDemoResult> {
  const profile = createSyntheticServiceDeskProfile()
  const profileAuthority = createStaticConversationProfileAuthority([profile])
  const harness = new FakeConversationHarness()
  const service = new DefaultConversationService({
    store: new InMemoryConversationStore(),
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
    effectEvidence: { verify: async () => true },
    clock: () => new Date(FIXED_NOW)
  })

  const proposed = await service.runTurn(
    makeTurn(profile, 1, 'Reserve a room on Friday at 10:00, room Atlas.')
  )
  const proposal = proposed.snapshot.workingMemory.pendingProposal
  if (!proposal || proposal.status !== 'DRAFT') {
    throw new Error('Service Desk demo did not persist a draft proposal')
  }
  if (harness.calls.length !== 0 || harness.effects.length !== 0) {
    throw new Error('Service Desk proposal unexpectedly invoked an effect')
  }

  const waiting = await service.runTurn(
    makeTurn(profile, 2, 'sim', {
      executionId: asExecutionId('execution.phase4a.service-desk.reserve')
    })
  )
  const pendingApproval = waiting.snapshot.workingMemory.pendingApproval
  if (
    waiting.turn.executionStatus !== 'WAITING_APPROVAL' ||
    !pendingApproval ||
    harness.calls.length !== 1 ||
    harness.effects.length !== 0
  ) {
    throw new Error('Service Desk demo did not stop at authenticated approval')
  }

  const approvalResume: ApprovalResumeRequest = {
    authenticated: true,
    approvalId: pendingApproval.approvalId,
    proposalHash: pendingApproval.proposalHash,
    operationKey: pendingApproval.operationKey,
    executionId: pendingApproval.executionId,
    proof: 'synthetic-authority-proof'
  }
  const approved = await service.runTurn(
    makeTurn(profile, 3, 'approval-resume', {
      approvalResume,
      executionId: pendingApproval.executionId
    })
  )
  const effect = harness.effects[0]
  if (
    approved.turn.executionStatus !== 'SUCCEEDED' ||
    approved.response.groundingAccepted !== true ||
    !approved.response.text.includes('confirmação do efeito') ||
    !effect ||
    harness.effects.length !== 1
  ) {
    throw new Error('Service Desk demo did not produce an effect-backed result')
  }

  const replayed = await service.runTurn(
    makeTurn(profile, 3, 'approval-resume', {
      approvalResume,
      executionId: pendingApproval.executionId
    })
  )
  if (
    replayed.replayed !== true ||
    harness.calls.length !== 2 ||
    harness.effects.length !== 1
  ) {
    throw new Error(
      'Service Desk duplicate replay changed the synthetic effect count'
    )
  }

  return {
    profile: { id: String(profile.id), version: profile.version },
    transcript: [
      transcriptEntry(
        'proposal',
        'Reserve a room on Friday at 10:00, room Atlas.',
        proposed
      ),
      transcriptEntry('approval-request', 'sim', waiting),
      transcriptEntry('approved-effect', 'approval-resume', approved),
      transcriptEntry('duplicate-replay', 'approval-resume', replayed)
    ],
    proposal: {
      status: proposal.status,
      action: proposal.action,
      capabilityId: proposal.capabilityId,
      proposalHash: proposal.proposalHash,
      operationKey: proposal.operationKey
    },
    approval: {
      requested: true,
      approvalId: pendingApproval.approvalId,
      naturalLanguageConfirmationDidNotConfirm: true,
      effectConfirmedBeforeApproval: false
    },
    completion: {
      status: approved.turn.executionStatus ?? 'UNKNOWN',
      effectConfirmed: true,
      effectReference: `effect:${effect.executionId}`,
      reservationId: effect.reservationId
    },
    harness: {
      calls: harness.calls.length,
      syntheticEffects: harness.effects.length,
      duplicateReplay: replayed.replayed,
      externalEffects: false
    },
    controlledScope: 'synthetic-local-only'
  }
}

function makeTurn(
  profile: ConversationProfile,
  sequence: number,
  text: string,
  options: {
    readonly approvalResume?: ApprovalResumeRequest
    readonly executionId?: ExecutionId
  } = {}
): TurnAcceptanceInput {
  const sequenceText = String(sequence).padStart(2, '0')
  return {
    tenantId: asTenantId(SERVICE_DESK_TENANT),
    conversationId: asConversationId(SERVICE_DESK_CONVERSATION),
    sessionId: asSessionId(SERVICE_DESK_SESSION),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn.phase4a.service-desk.${sequenceText}`),
    messageId: asMessageId(`message.phase4a.service-desk.${sequenceText}`),
    correlationId: asCorrelationId(
      `correlation.phase4a.service-desk.${sequenceText}`
    ),
    ...(options.executionId ? { executionId: options.executionId } : {}),
    text,
    idempotencyKey: `idempotency.phase4a.service-desk.${sequenceText}`,
    receivedAt: `2026-09-17T12:00:${sequenceText}.000Z`,
    ...(options.approvalResume
      ? { approvalResume: options.approvalResume }
      : {}),
    profile
  }
}

function transcriptEntry(
  step: string,
  userText: string,
  result: ConversationTurnResult
): ServiceDeskTranscriptEntry {
  return {
    step,
    userText,
    planKind: result.turn.planKind ?? null,
    turnStatus: result.turn.status,
    executionStatus: result.turn.executionStatus ?? null,
    response: result.response.text,
    groundingAccepted: result.response.groundingAccepted,
    replayed: result.replayed
  }
}
