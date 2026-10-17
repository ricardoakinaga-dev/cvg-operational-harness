import {
  type HarnessActionResult,
  type ResponseClaim,
  type ResponseComposeInput,
  type ResponseComposer,
  type ResponseDraft,
  type ResponseSource,
  type ConversationCopy,
  type KnowledgeEvidence,
  type ConversationProfile,
  type TurnIdentity,
  type VerifiedResponse
} from './contracts.ts'
import { describeAction, renderCopy } from './action-language.ts'
import { DEFAULT_CONVERSATION_COPY } from './copy.ts'
import {
  hasForbiddenMemoryContent,
  hasUntrustedInstructionContent
} from './state.ts'

/**
 * Response text is a projection of typed state and evidence. It never treats
 * model prose, a proposal, an approval request or a delivery receipt as an
 * effect confirmation.
 */
export class DefaultResponseComposer implements ResponseComposer {
  compose(input: ResponseComposeInput): ResponseDraft {
    const identity = input.identity
    const copy = input.profile.copy
    const responseId = `response_${identity.turnId}`
    const deliveryKey = `delivery:${String(identity.tenantId)}:${responseId}`
    const sources: ResponseSource[] = [
      { kind: 'SYSTEM_STATE', ref: `state:${identity.turnId}` }
    ]
    let text = ''
    let claims: ResponseClaim[] = []

    switch (input.plan.kind) {
      case 'ANSWER':
        text = answerText(copy, input.plan.responseIntent)
        claims = [systemClaim(text, `state:${identity.turnId}`)]
        break
      case 'ASK_USER':
        text = input.plan.question.prompt
        claims = [systemClaim(text, `state:${identity.turnId}`)]
        break
      case 'SEARCH_KNOWLEDGE': {
        const evidence = (input.knowledge ?? []).filter(
          isRenderableKnowledgeEvidence
        )
        if (evidence.length === 0) {
          text = copy.noApprovedKnowledge
          claims = [systemClaim(text, `state:${identity.turnId}`)]
        } else {
          for (const item of evidence.slice(0, 5)) {
            const ref = `knowledge:${item.sourceId}:${item.version}`
            sources.push({
              kind: 'KNOWLEDGE_EVIDENCE',
              ref,
              approved: true,
              version: item.version
            })
            const citation =
              item.citation ?? `${item.sourceId} v${item.version}`
            text += `${item.text.trim()} [${citation}]\n`
            claims.push({
              text: item.text.trim(),
              sourceRefs: [ref],
              kind: 'FACT'
            })
          }
          text = text.trim()
        }
        break
      }
      case 'PROPOSE_ACTION':
        text = `${renderCopy(copy.proposalIntro, describeAction(input.plan.proposal.action, copy))} ${input.plan.question.prompt}`
        claims = [
          {
            text,
            sourceRefs: [`state:${identity.turnId}`],
            kind: 'PROPOSAL'
          }
        ]
        break
      case 'WAIT_APPROVAL':
        text = copy.waitingApproval
        claims = [systemClaim(text, `state:${identity.turnId}`)]
        break
      case 'EXECUTE_ACTION':
        ;({ text, claims } = executionResponse(input.execution, identity, copy))
        if (input.execution) {
          const status =
            input.execution.status === 'SUCCEEDED' &&
            input.execution.effectConfirmed
              ? 'SUCCEEDED'
              : input.execution.status === 'APPROVAL_REQUIRED'
                ? 'WAITING_APPROVAL'
                : input.execution.status === 'DENIED'
                  ? 'FAILED'
                  : input.execution.status
          const ref = input.execution.effectConfirmed
            ? `effect:${input.execution.executionId}`
            : `execution:${input.execution.executionId}`
          sources.push({ kind: 'TOOL_RESULT', ref, status })
        }
        break
      case 'HANDOFF':
        if (
          input.handoffReceipt?.status === 'ACCEPTED' ||
          input.handoffReceipt?.status === 'REPLAYED'
        ) {
          const ref = `handoff:${input.handoffReceipt.handoffId}`
          sources.push({ kind: 'SYSTEM_STATE', ref, status: 'HANDOFF' })
          text =
            input.handoffReceipt.status === 'REPLAYED'
              ? copy.handoffReplayed
              : copy.handoffAccepted
          claims = [systemClaim(text, ref)]
        } else if (input.handoffReceipt?.status === 'FAILED') {
          text = copy.handoffFailed
          claims = [systemClaim(text, `state:${identity.turnId}`)]
        } else {
          text = copy.handoffRecorded
          claims = [systemClaim(text, `state:${identity.turnId}`)]
        }
        break
      case 'STOP':
        text = copy.stop
        claims = [systemClaim(text, `state:${identity.turnId}`)]
        break
    }

    return {
      responseId,
      deliveryKey,
      text: text.slice(0, 8_000),
      claims,
      sources
    }
  }

  verify(
    draft: ResponseDraft,
    profile?: ConversationProfile
  ): VerifiedResponse {
    const errors: string[] = []
    const copy = profile?.copy ?? DEFAULT_CONVERSATION_COPY
    const sources = new Map(draft.sources.map((source) => [source.ref, source]))
    if (!draft.responseId || !draft.deliveryKey)
      errors.push('response identity is required')
    if (!draft.text.trim()) errors.push('response text is required')
    if (draft.text.length > 8_000)
      errors.push('response text exceeds the bound')

    for (const claim of draft.claims) {
      if (claim.sourceRefs.length === 0) {
        errors.push(`claim lacks source: ${claim.text.slice(0, 80)}`)
        continue
      }
      for (const ref of claim.sourceRefs) {
        const source = sources.get(ref)
        if (!source) {
          errors.push(`claim references unknown source ${ref}`)
          continue
        }
        if (
          source.kind === 'KNOWLEDGE_EVIDENCE' &&
          (source.approved !== true || !source.version)
        ) {
          errors.push(`knowledge source ${ref} is not approved and versioned`)
        }
        if (claim.successClaim === true || looksLikeSuccess(claim.text, copy)) {
          if (
            source.kind !== 'TOOL_RESULT' ||
            source.status !== 'SUCCEEDED' ||
            !ref.startsWith('effect:')
          ) {
            errors.push(
              `success claim is not effect-backed: ${claim.text.slice(0, 80)}`
            )
          }
        }
        if (
          source.kind === 'TOOL_RESULT' &&
          source.status !== 'SUCCEEDED' &&
          (claim.successClaim === true || looksLikeSuccess(claim.text, copy))
        ) {
          errors.push(`non-success execution cannot support success: ${ref}`)
        }
      }
    }
    if (draft.claims.length === 0)
      errors.push('response must contain a typed claim')
    const accepted = errors.length === 0
    return {
      accepted,
      response: accepted ? draft : safeRepair(draft, errors, copy),
      errors
    }
  }
}

function isRenderableKnowledgeEvidence(item: KnowledgeEvidence): boolean {
  return (
    item.approved === true &&
    isSafeExternalText(item.sourceId, 200) &&
    isSafeExternalText(item.version, 80) &&
    isSafeExternalText(item.title, 240) &&
    isSafeExternalText(item.text, 4_000) &&
    (item.citation === undefined || isSafeExternalText(item.citation, 240))
  )
}

function isSafeExternalText(
  value: unknown,
  maxLength: number
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength &&
    !hasForbiddenMemoryContent(value) &&
    !hasUntrustedInstructionContent(value)
  )
}

function answerText(copy: ConversationCopy, intent: string): string {
  return copy.answers[intent] ?? copy.answers.DEFAULT
}

function systemClaim(text: string, ref: string): ResponseClaim {
  return { text, sourceRefs: [ref], kind: 'STATUS' }
}

function executionResponse(
  execution: HarnessActionResult | undefined,
  identity: TurnIdentity,
  copy: ConversationCopy
): { readonly text: string; readonly claims: ResponseClaim[] } {
  if (!execution) {
    const text = copy.processing
    return { text, claims: [systemClaim(text, `state:${identity.turnId}`)] }
  }
  const effectRef = execution.effectConfirmed
    ? `effect:${execution.executionId}`
    : `execution:${execution.executionId}`
  switch (execution.status) {
    case 'SUCCEEDED': {
      if (!execution.effectConfirmed) {
        const text = copy.successWithoutEvidence
        return {
          text,
          claims: [{ text, sourceRefs: [effectRef], kind: 'STATUS' }]
        }
      }
      const text = copy.success
      return {
        text,
        claims: [
          { text, sourceRefs: [effectRef], kind: 'STATUS', successClaim: true }
        ]
      }
    }
    case 'APPROVAL_REQUIRED': {
      const text = copy.waitingApproval
      return {
        text,
        claims: [{ text, sourceRefs: [effectRef], kind: 'STATUS' }]
      }
    }
    case 'DENIED': {
      const text = copy.denied
      return {
        text,
        claims: [{ text, sourceRefs: [effectRef], kind: 'STATUS' }]
      }
    }
    case 'UNCERTAIN': {
      const text = copy.uncertain
      return {
        text,
        claims: [{ text, sourceRefs: [effectRef], kind: 'STATUS' }]
      }
    }
    case 'FAILED': {
      const text = copy.failed
      return {
        text,
        claims: [{ text, sourceRefs: [effectRef], kind: 'STATUS' }]
      }
    }
  }
}

function safeRepair(
  draft: ResponseDraft,
  errors: readonly string[],
  copy: ConversationCopy
): ResponseDraft {
  const responseId = draft.responseId || 'response_rejected'
  const stateRef = `repair:${responseId}`
  void errors
  return {
    responseId,
    deliveryKey: draft.deliveryKey || `delivery:rejected:${responseId}`,
    text: copy.repair,
    claims: [
      {
        text: copy.repair,
        sourceRefs: [stateRef],
        kind: 'STATUS'
      }
    ],
    sources: [{ kind: 'SYSTEM_STATE', ref: stateRef, status: 'REJECTED' }]
  }
}

function looksLikeSuccess(text: string, copy: ConversationCopy): boolean {
  if (
    copy.successNegationPatterns.some((pattern) =>
      matchesPattern(text, pattern)
    )
  )
    return false
  return copy.successPatterns.some((pattern) => matchesPattern(text, pattern))
}

function matchesPattern(text: string, pattern: string): boolean {
  try {
    return new RegExp(pattern, 'iu').test(text)
  } catch {
    return false
  }
}
