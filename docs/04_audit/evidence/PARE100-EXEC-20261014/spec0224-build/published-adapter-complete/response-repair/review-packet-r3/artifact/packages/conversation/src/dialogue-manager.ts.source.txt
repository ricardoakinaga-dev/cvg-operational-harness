import {
  type ActionProposal,
  type ConversationCapability,
  type ConversationProfile,
  type DialogueManager,
  type DialogueManagerInput,
  type DialoguePlan,
  type GoalRecord,
  type PendingQuestion,
  type WorkingMemory
} from './contracts.ts'
import {
  applyInterpretation,
  ensureGoal,
  getActiveEntity,
  getActiveGoal,
  invalidateProposal,
  resumePrimaryGoal,
  setApproval,
  setProposal,
  setQuestion,
  stateDigest,
  suspendPrimaryGoal
} from './state.ts'
import { describeAction, renderCopy } from './action-language.ts'

export interface DefaultDialogueManagerOptions {
  readonly maxQuestionFields?: number
}

/**
 * Plans dialogue only. The manager receives profile metadata, never an
 * executable capability, policy engine, approval engine, journal or database.
 */
export class DefaultDialogueManager implements DialogueManager {
  readonly #maxQuestionFields: number

  constructor(options: DefaultDialogueManagerOptions = {}) {
    this.#maxQuestionFields = options.maxQuestionFields ?? 3
  }

  plan(input: DialogueManagerInput): DialoguePlan {
    let memory = applyInterpretation(
      input.memory,
      input.interpretation,
      input.identity.turnId,
      input.now
    )

    if (input.interpretation.intent === 'STOP') {
      memory = setQuestion(memory, undefined)
      memory = setApproval(memory, undefined)
      return {
        kind: 'STOP',
        memory: markActiveGoal(memory, 'CANCELLED', input.now)
      }
    }
    if (input.interpretation.intent === 'HANDOFF') {
      if (
        memory.pendingProposal &&
        memory.pendingProposal.status !== 'EXECUTED'
      ) {
        memory = invalidateProposal(memory, memory.pendingProposal.proposalId)
      }
      memory = setApproval(setQuestion(memory, undefined), undefined)
      return {
        kind: 'HANDOFF',
        reason: 'USER_REQUESTED_HANDOFF',
        memory
      }
    }

    const pendingApproval = memory.pendingApproval
    const pendingProposal = memory.pendingProposal
    if (pendingApproval && pendingProposal) {
      if (input.approvalResume) {
        if (
          input.approvalResume.approvalId !== pendingApproval.approvalId ||
          input.approvalResume.proposalHash !== pendingApproval.proposalHash ||
          input.approvalResume.operationKey !== pendingApproval.operationKey ||
          (input.approvalResume.executionId !== undefined &&
            input.approvalResume.executionId !== pendingApproval.executionId) ||
          input.approvalResume.authenticated !== true
        ) {
          return {
            kind: 'HANDOFF',
            reason: 'APPROVAL_BINDING_MISMATCH',
            memory
          }
        }
        return {
          kind: 'EXECUTE_ACTION',
          proposal: pendingProposal,
          memory: setQuestion(memory, undefined),
          approvalResume: input.approvalResume
        }
      }
      if (input.interpretation.confirmationSignal) {
        // Natural-language assent is deliberately not an approval decision.
        return {
          kind: 'WAIT_APPROVAL',
          proposal: pendingProposal,
          memory
        }
      }
      if (input.interpretation.intent === 'CORRECT') {
        // A correction revokes the approval binding before the next plan is
        // considered. Natural-language confirmation cannot keep a stale
        // proposal executable after its facts change.
        memory = invalidateProposal(memory, pendingProposal.proposalId)
        memory = setApproval(memory, undefined)
      } else {
        return {
          kind: 'WAIT_APPROVAL',
          proposal: pendingProposal,
          memory
        }
      }
    }

    if (
      memory.pendingProposal?.status === 'DRAFT' &&
      memory.pendingQuestion?.type === 'CONFIRMATION' &&
      input.interpretation.confirmationSignal
    ) {
      return {
        kind: 'EXECUTE_ACTION',
        proposal: memory.pendingProposal,
        memory: setQuestion(memory, undefined)
      }
    }

    if (input.interpretation.intent === 'SIDE_QUESTION') {
      const activeGoal = getActiveGoal(memory)
      if (activeGoal && activeGoal.status === 'ACTIVE') {
        const sideGoal = createSideGoal(input)
        memory = suspendPrimaryGoal(memory, sideGoal)
      }
      return knowledgeOrHandoff(input, memory)
    }

    if (input.interpretation.intent === 'KNOWLEDGE') {
      return knowledgeOrHandoff(input, memory)
    }

    if (input.interpretation.intent === 'CORRECT') {
      memory = invalidateIfStillPending(memory)
      memory = setQuestion(memory, undefined)
      const activeGoal = getActiveGoal(memory)
      if (!activeGoal) {
        return {
          kind: 'ANSWER',
          intent: 'CORRECT',
          memory,
          responseIntent: 'CORRECTION_ACCEPTED'
        }
      }
      const capability = input.profile.capabilities.find((item) =>
        actionMatches(item.action, activeGoal.kind)
      )
      if (!capability) {
        return {
          kind: 'ANSWER',
          intent: 'CORRECT',
          memory,
          responseIntent: 'CORRECTION_ACCEPTED'
        }
      }
      const missing = missingFields(capability.requiredFields, memory)
      if (missing.length > 0)
        return askFor(input, memory, missing, activeGoal.goalId)
      if (activeGoal.kind !== 'AVAILABILITY') {
        return {
          kind: 'ANSWER',
          intent: 'CORRECT',
          memory,
          responseIntent: 'CORRECTION_ACCEPTED'
        }
      }
      const proposal = createProposal(input, capability, memory)
      if (capability.sideEffect === 'READ' && !capability.requiresApproval) {
        return {
          kind: 'EXECUTE_ACTION',
          proposal,
          memory: setQuestion(setProposal(memory, proposal), undefined)
        }
      }
      const question = confirmationQuestion(proposal, input)
      return {
        kind: 'PROPOSE_ACTION',
        proposal,
        question,
        memory: setQuestion(setProposal(memory, proposal), question)
      }
    }

    if (input.interpretation.intent === 'INFO') {
      if (memory.goalStack.length > 0 && input.interpretation.query) {
        return knowledgeOrHandoff(input, resumePrimaryGoal(memory, input.now))
      }
      return {
        kind: 'ANSWER',
        intent: 'INFO',
        memory,
        responseIntent: 'INFORMATION_ACKNOWLEDGED'
      }
    }

    const actionIntent = input.interpretation.intent
    if (
      actionIntent === 'AVAILABILITY' ||
      actionIntent === 'CREATE' ||
      actionIntent === 'MODIFY' ||
      actionIntent === 'CANCEL'
    ) {
      const capability = chooseCapability(
        input.profile,
        input.interpretation,
        actionIntent
      )
      if (!capability) {
        return { kind: 'HANDOFF', reason: 'CAPABILITY_UNAVAILABLE', memory }
      }
      memory = ensureGoal(memory, {
        kind: actionIntent,
        label: `${actionIntent.toLocaleLowerCase('en-US')} goal`,
        requiredFields: capability.requiredFields,
        turnId: input.identity.turnId,
        now: input.now,
        maxDepth: input.profile.maxGoalDepth
      })
      const resolved = resolveReferences(
        memory,
        input.interpretation.references
      )
      if (resolved.kind === 'AMBIGUOUS') {
        return askFor(
          input,
          memory,
          ['selectedOption'],
          getActiveGoal(memory)?.goalId ?? `goal_${input.identity.turnId}`,
          resolved.choices
        )
      }
      if (resolved.kind === 'UNSAFE') {
        return { kind: 'HANDOFF', reason: 'REFERENCE_NOT_ELIGIBLE', memory }
      }
      if (resolved.kind === 'RESOLVED') {
        memory = addResolvedOption(
          memory,
          resolved.value,
          input.identity.turnId,
          input.now
        )
      }
      const missing = missingFields(capability.requiredFields, memory)
      if (missing.length > 0) {
        return askFor(
          input,
          memory,
          missing,
          getActiveGoal(memory)?.goalId ?? `goal_${input.identity.turnId}`
        )
      }
      const proposal = createProposal(input, capability, memory)
      const existing = memory.pendingProposal
      if (
        existing &&
        existing.status === 'DRAFT' &&
        existing.proposalHash === proposal.proposalHash &&
        input.interpretation.confirmationSignal
      ) {
        return {
          kind: 'EXECUTE_ACTION',
          proposal,
          memory: setQuestion(setProposal(memory, proposal), undefined)
        }
      }
      if (
        existing &&
        existing.status === 'DRAFT' &&
        existing.proposalHash === proposal.proposalHash
      ) {
        return {
          kind: 'PROPOSE_ACTION',
          proposal: existing,
          question: confirmationQuestion(existing, input),
          memory: setQuestion(
            setProposal(memory, existing),
            confirmationQuestion(existing, input)
          )
        }
      }
      if (capability.sideEffect === 'READ' && !capability.requiresApproval) {
        return {
          kind: 'EXECUTE_ACTION',
          proposal,
          memory: setQuestion(setProposal(memory, proposal), undefined)
        }
      }
      const question = confirmationQuestion(proposal, input)
      return {
        kind: 'PROPOSE_ACTION',
        proposal,
        question,
        memory: setQuestion(setProposal(memory, proposal), question)
      }
    }

    if (input.interpretation.confirmationSignal && memory.pendingQuestion) {
      return {
        kind: 'ANSWER',
        intent: 'CLARIFY',
        memory: setQuestion(memory, undefined),
        responseIntent: 'QUESTION_ACKNOWLEDGED'
      }
    }
    if (
      input.interpretation.intent === 'COLLECT' ||
      input.interpretation.intent === 'CLARIFY'
    ) {
      const activeGoal = getActiveGoal(memory)
      if (activeGoal) {
        const missing = missingFields(activeGoal.requiredFields, memory)
        if (missing.length > 0)
          return askFor(input, memory, missing, activeGoal.goalId)
      }
      return {
        kind: 'ANSWER',
        intent: actionIntent,
        memory,
        responseIntent: 'DETAILS_RECORDED'
      }
    }
    return {
      kind: 'ANSWER',
      intent: actionIntent,
      memory,
      responseIntent: 'REQUEST_UNDERSTOOD'
    }
  }
}

function chooseCapability(
  profile: ConversationProfile,
  interpretation: DialogueManagerInput['interpretation'],
  intent: DialogueManagerInput['interpretation']['intent']
): ConversationCapability | undefined {
  if (interpretation.requestedCapability) {
    const requested = profile.capabilities.find(
      (capability) => capability.id === interpretation.requestedCapability
    )
    return requested && actionMatches(requested.action, intent)
      ? requested
      : undefined
  }
  const action = intent === 'AVAILABILITY' ? 'READ' : intent
  return profile.capabilities.find((capability) => capability.action === action)
}

function actionMatches(
  action: ConversationCapability['action'],
  intent: DialogueManagerInput['interpretation']['intent']
): boolean {
  if (intent === 'AVAILABILITY') return action === 'READ'
  return action === intent
}

function knowledgeOrHandoff(
  input: DialogueManagerInput,
  memory: WorkingMemory
): DialoguePlan {
  if (!input.profile.knowledge)
    return {
      kind: 'HANDOFF',
      reason: 'APPROVED_KNOWLEDGE_SOURCE_UNAVAILABLE',
      memory
    }
  return {
    kind: 'SEARCH_KNOWLEDGE',
    query: input.interpretation.query ?? 'user question',
    memory
  }
}

function createSideGoal(input: DialogueManagerInput): GoalRecord {
  return {
    goalId: `goal_side_${input.identity.turnId}`,
    kind: input.interpretation.intent,
    label: 'bounded side question',
    requiredFields: [],
    collectedFields: [],
    status: 'ACTIVE',
    depth: (getActiveGoal(input.memory)?.depth ?? 0) + 1,
    createdTurnId: input.identity.turnId,
    updatedAt: input.now
  }
}

function createProposal(
  input: DialogueManagerInput,
  capability: ConversationCapability,
  memory: WorkingMemory
): ActionProposal {
  const payload: Record<
    string,
    import('./contracts.ts').ConversationJsonValue
  > = {}
  const entityVersions: Record<string, number> = {}
  for (const field of capability.requiredFields) {
    const entity = getActiveEntity(memory, field)
    if (entity) {
      payload[field] = entity.value
      entityVersions[field] = entity.version
      continue
    }
    const selected = getActiveEntity(memory, 'selectedOption')
    if (
      selected &&
      typeof selected.value === 'object' &&
      !Array.isArray(selected.value) &&
      selected.value !== null
    ) {
      const selectedValue = (
        selected.value as {
          readonly [key: string]: import('./contracts.ts').ConversationJsonValue
        }
      )[field]
      if (selectedValue !== undefined) {
        payload[field] = selectedValue
        entityVersions.selectedOption = selected.version
      }
    }
  }
  if (memory.options.length > 0 && getActiveEntity(memory, 'selectedOption')) {
    const selected = getActiveEntity(memory, 'selectedOption')
    if (selected) {
      payload.selectedOption = selected.value
      entityVersions.selectedOption = selected.version
    }
  }
  const descriptor = {
    tenantId: String(input.identity.tenantId),
    conversationId: String(input.identity.conversationId),
    profileId: String(input.identity.profileId),
    profileVersion: input.identity.profileVersion,
    action: capability.action,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    payload
  }
  const proposalHash = stateDigest({
    version: 0,
    entities: [],
    goals: [],
    goalStack: [],
    options: [],
    sourceRefs: [JSON.stringify(descriptor)],
    invalidatedProposalIds: []
  })
  const operationKey = `conversation:${String(input.identity.tenantId)}:${String(input.identity.conversationId)}:${capability.id}:${proposalHash}`
  return {
    proposalId: `proposal_${input.identity.turnId}`,
    action: capability.action,
    capabilityId: capability.id,
    capabilityVersion: capability.version,
    payload,
    proposalHash,
    operationKey,
    requiresApproval: capability.requiresApproval,
    entityVersions,
    createdTurnId: input.identity.turnId,
    status: 'DRAFT',
    createdAt: input.now
  }
}

function confirmationQuestion(
  proposal: ActionProposal,
  input: DialogueManagerInput
): PendingQuestion {
  return {
    questionId: `question_${input.identity.turnId}`,
    type: 'CONFIRMATION',
    prompt: renderCopy(
      input.profile.copy.confirmationPrompt,
      describeAction(proposal.action, input.profile.copy)
    ),
    missingFields: [],
    goalId:
      getActiveGoal(input.memory)?.goalId ?? `goal_${input.identity.turnId}`,
    createdTurnId: input.identity.turnId,
    createdAt: input.now
  }
}

function askFor(
  input: DialogueManagerInput,
  memory: WorkingMemory,
  fields: readonly string[],
  goalId: string,
  choices?: readonly string[]
): DialoguePlan {
  const bounded = fields
    .slice(0, 3)
    .slice(0, input.profile.maxGoalDepth > 0 ? 3 : 1)
  const question: PendingQuestion = {
    questionId: `question_${input.identity.turnId}`,
    type: choices ? 'CHOICE' : 'MISSING_FIELD',
    prompt: choices
      ? renderCopy(input.profile.copy.choicePrompt, {
          choices: choices.slice(0, 8).join(', ')
        })
      : renderCopy(input.profile.copy.missingFieldsPrompt, {
          fields: bounded.join(', ')
        }),
    missingFields: bounded,
    ...(choices ? { choices: choices.slice(0, 8) } : {}),
    goalId,
    createdTurnId: input.identity.turnId,
    createdAt: input.now
  }
  return { kind: 'ASK_USER', question, memory: setQuestion(memory, question) }
}

function resolveReferences(
  memory: WorkingMemory,
  references: DialogueManagerInput['interpretation']['references']
):
  | { readonly kind: 'NONE' }
  | {
      readonly kind: 'RESOLVED'
      readonly value: import('./contracts.ts').ConversationJsonValue
    }
  | { readonly kind: 'AMBIGUOUS'; readonly choices: readonly string[] }
  | { readonly kind: 'UNSAFE' } {
  const ordinal = references.find((reference) => reference.kind === 'ORDINAL')
  if (ordinal?.ordinal) {
    const candidate = memory.options[ordinal.ordinal - 1]
    if (!candidate || candidate.status !== 'ELIGIBLE') return { kind: 'UNSAFE' }
    return { kind: 'RESOLVED', value: candidate.value }
  }
  if (references.some((reference) => reference.kind === 'PRONOUN')) {
    const eligible = memory.options.filter(
      (option) => option.status === 'ELIGIBLE'
    )
    if (eligible.length !== 1)
      return {
        kind: 'AMBIGUOUS',
        choices: eligible.map((option) => option.label)
      }
    return { kind: 'RESOLVED', value: eligible[0]?.value ?? null }
  }
  return { kind: 'NONE' }
}

function addResolvedOption(
  memory: WorkingMemory,
  value: import('./contracts.ts').ConversationJsonValue,
  turnId: import('./contracts.ts').TurnId,
  now: string
): WorkingMemory {
  const previous = getActiveEntity(memory, 'selectedOption')
  return {
    ...memory,
    version: memory.version + 1,
    entities: [
      ...memory.entities.map((entity) =>
        previous &&
        entity.key === 'selectedOption' &&
        entity.status === 'ACTIVE'
          ? { ...entity, status: 'CORRECTED' as const }
          : entity
      ),
      {
        key: 'selectedOption',
        value,
        source: 'USER' as const,
        status: 'ACTIVE' as const,
        version: (getActiveEntity(memory, 'selectedOption')?.version ?? 0) + 1,
        turnId,
        updatedAt: now
      }
    ].slice(-32)
  }
}

function missingFields(
  fields: readonly string[],
  memory: WorkingMemory
): string[] {
  const selected = getActiveEntity(memory, 'selectedOption')
  const selectedValue =
    selected &&
    typeof selected.value === 'object' &&
    !Array.isArray(selected.value) &&
    selected.value !== null
      ? (selected.value as {
          readonly [key: string]: import('./contracts.ts').ConversationJsonValue
        })
      : undefined
  return fields.filter(
    (field) =>
      !getActiveEntity(memory, field) &&
      !(selectedValue && selectedValue[field] !== undefined)
  )
}

function invalidateIfStillPending(memory: WorkingMemory): WorkingMemory {
  return memory.pendingProposal &&
    (memory.pendingProposal.status === 'DRAFT' ||
      memory.pendingProposal.status === 'PENDING_APPROVAL')
    ? invalidateProposal(memory, memory.pendingProposal.proposalId)
    : memory
}

function markActiveGoal(
  memory: WorkingMemory,
  status: 'CANCELLED' | 'COMPLETED',
  now: string
): WorkingMemory {
  return {
    ...memory,
    version: memory.version + 1,
    pendingQuestion: undefined,
    pendingProposal: undefined,
    pendingApproval: undefined,
    goals: memory.goals.map((goal) =>
      goal.goalId === memory.activeGoalId
        ? { ...goal, status, updatedAt: now }
        : goal
    )
  }
}
