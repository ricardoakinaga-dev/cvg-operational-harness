import { createHash } from 'node:crypto'
import {
  ConversationError,
  type ActionProposal,
  type ConversationScope,
  type ConversationSnapshot,
  type DialogueEntityInput,
  type DialogueInterpretation,
  type EntityFact,
  type ExecutionClaimInput,
  type ExecutionOutcome,
  type GoalRecord,
  type HandoffPacket,
  type PendingApproval,
  type PendingQuestion,
  type ReferenceCandidate,
  type WorkingMemory,
  type TurnId
} from './contracts.ts'

export const WORKING_MEMORY_LIMITS = {
  maxEntities: 32,
  maxGoals: 8,
  maxGoalDepth: 3,
  maxGoalStack: 3,
  maxOptions: 8,
  maxSourceRefs: 32,
  maxInvalidatedProposals: 16,
  maxStateBytes: 32_000,
  maxCanonicalDepth: 8,
  maxCanonicalNodes: 512
} as const

export function createEmptyWorkingMemory(): WorkingMemory {
  return {
    version: 0,
    entities: [],
    goals: [],
    goalStack: [],
    options: [],
    sourceRefs: [],
    invalidatedProposalIds: []
  }
}

export function createInitialSnapshot(
  scope: ConversationScope,
  now: string
): ConversationSnapshot {
  return {
    scope,
    status: 'ACTIVE',
    stateVersion: 0,
    workingMemory: createEmptyWorkingMemory(),
    createdAt: now,
    updatedAt: now
  }
}

export interface ValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

export function validateWorkingMemory(memory: WorkingMemory): ValidationResult {
  const errors: string[] = []
  if (!isObjectRecord(memory)) {
    return { valid: false, errors: ['working memory must be an object'] }
  }
  const arrayFields = [
    ['entities', memory.entities],
    ['goals', memory.goals],
    ['goalStack', memory.goalStack],
    ['options', memory.options],
    ['sourceRefs', memory.sourceRefs],
    ['invalidatedProposalIds', memory.invalidatedProposalIds]
  ] as const
  if (arrayFields.some(([, value]) => !Array.isArray(value))) {
    errors.push('working memory collections must be arrays')
    return { valid: false, errors }
  }
  if (!Number.isInteger(memory.version) || memory.version < 0) {
    errors.push('working-memory version must be a non-negative integer')
  }
  if (memory.entities.length > WORKING_MEMORY_LIMITS.maxEntities) {
    errors.push('working-memory entity limit exceeded')
  }
  if (memory.goals.length > WORKING_MEMORY_LIMITS.maxGoals) {
    errors.push('working-memory goal limit exceeded')
  }
  if (memory.goalStack.length > WORKING_MEMORY_LIMITS.maxGoalStack) {
    errors.push('working-memory goal-stack limit exceeded')
  }
  if (memory.options.length > WORKING_MEMORY_LIMITS.maxOptions) {
    errors.push('working-memory option limit exceeded')
  }
  if (memory.sourceRefs.length > WORKING_MEMORY_LIMITS.maxSourceRefs) {
    errors.push('working-memory source limit exceeded')
  }
  if (
    memory.invalidatedProposalIds.length >
    WORKING_MEMORY_LIMITS.maxInvalidatedProposals
  ) {
    errors.push('working-memory invalidation limit exceeded')
  }
  if (memory.handoff) {
    if (!isObjectRecord(memory.handoff)) {
      errors.push('handoff must be an object')
    } else {
      if (
        typeof memory.handoff.handoffId !== 'string' ||
        !memory.handoff.handoffId.trim()
      )
        errors.push('handoff id is required')
      if (
        typeof memory.handoff.idempotencyKey !== 'string' ||
        !memory.handoff.idempotencyKey.trim()
      )
        errors.push('handoff idempotency key is required')
      if (
        typeof memory.handoff.reason !== 'string' ||
        memory.handoff.reason.length > 160
      )
        errors.push('handoff reason exceeds the bound')
      if (!Array.isArray(memory.handoff.confirmedFacts))
        errors.push('handoff facts must be an array')
      else if (
        memory.handoff.confirmedFacts.length > WORKING_MEMORY_LIMITS.maxEntities
      ) {
        errors.push('handoff fact limit exceeded')
      }
      if (!Array.isArray(memory.handoff.executionRefs))
        errors.push('handoff execution references must be an array')
      else if (
        memory.handoff.executionRefs.length >
        WORKING_MEMORY_LIMITS.maxSourceRefs
      ) {
        errors.push('handoff execution reference limit exceeded')
      }
    }
  }
  if (memory.pendingApproval) {
    const proposal = memory.pendingProposal
    if (!proposal || proposal.status !== 'PENDING_APPROVAL') {
      errors.push('pending approval requires a pending proposal')
    } else {
      if (proposal.proposalHash !== memory.pendingApproval.proposalHash)
        errors.push('pending approval proposal hash does not match')
      if (proposal.operationKey !== memory.pendingApproval.operationKey)
        errors.push('pending approval operation key does not match')
    }
  }
  if (
    memory.pendingProposal?.status === 'PENDING_APPROVAL' &&
    !memory.pendingApproval
  ) {
    errors.push('pending proposal requires an approval binding')
  }
  const goalIds = new Set(
    memory.goals.flatMap((goal) =>
      isObjectRecord(goal) && typeof goal.goalId === 'string'
        ? [goal.goalId]
        : []
    )
  )
  if (memory.activeGoalId && !goalIds.has(memory.activeGoalId)) {
    errors.push('active goal does not exist')
  }
  for (const goalId of memory.goalStack) {
    if (typeof goalId !== 'string' || !goalIds.has(goalId))
      errors.push('goal stack contains an unknown goal')
  }
  const entityKeys = new Set<string>()
  for (const entity of memory.entities) {
    if (!isObjectRecord(entity)) {
      errors.push('entity must be an object')
      continue
    }
    if (typeof entity.key !== 'string' || !entity.key.trim()) {
      errors.push('entity key is required')
      continue
    }
    if (entity.status === 'ACTIVE' && entityKeys.has(entity.key)) {
      errors.push(`multiple active entities for ${entity.key}`)
    }
    if (entity.status === 'ACTIVE') entityKeys.add(entity.key)
    if (hasForbiddenMemoryContent(entity.value)) {
      errors.push('working memory contains a reasoning or authority field')
    }
  }
  for (const value of [
    memory.options,
    memory.pendingQuestion,
    memory.pendingProposal,
    memory.pendingApproval,
    memory.handoff
  ]) {
    if (value !== undefined && hasForbiddenMemoryContent(value)) {
      errors.push('working memory contains a reasoning or authority field')
      break
    }
  }
  for (const goal of memory.goals) {
    if (!isObjectRecord(goal)) {
      errors.push('goal must be an object')
      continue
    }
    if (
      typeof goal.depth !== 'number' ||
      goal.depth > WORKING_MEMORY_LIMITS.maxGoalDepth
    ) {
      errors.push('goal depth limit exceeded')
    }
    if (
      !Array.isArray(goal.requiredFields) ||
      goal.requiredFields.some((field) => typeof field !== 'string')
    ) {
      errors.push('goal required fields must be strings')
    } else if (
      new Set(goal.requiredFields).size !== goal.requiredFields.length
    ) {
      errors.push('goal required fields must be unique')
    }
  }
  try {
    const bytes = Buffer.byteLength(canonicalize(memory), 'utf8')
    if (bytes > WORKING_MEMORY_LIMITS.maxStateBytes) {
      errors.push('working-memory byte limit exceeded')
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'invalid memory JSON')
  }
  return { valid: errors.length === 0, errors }
}

export function assertWorkingMemory(memory: WorkingMemory): void {
  const result = validateWorkingMemory(memory)
  if (!result.valid) {
    throw new ConversationError(
      'INVALID_INPUT',
      `Working memory rejected: ${result.errors.join('; ')}`
    )
  }
}

/**
 * Proves that a new execution reservation is still attached to the state
 * from which its proposal was derived. A turn that created the proposal must
 * still observe the same session version. A later confirmation or approval
 * resume must still match the durable pending proposal and approval binding.
 */
export function assertExecutionClaimFresh(input: {
  readonly snapshot: ConversationSnapshot
  readonly proposal: ActionProposal
  readonly turnId: TurnId
  readonly expectedStateVersion: number
  readonly approvalResume?: ExecutionClaimInput['approvalResume']
}): void {
  if (
    !Number.isInteger(input.expectedStateVersion) ||
    input.expectedStateVersion < 0
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Execution claim state version is outside bounds'
    )
  }

  const pendingProposal = input.snapshot.workingMemory.pendingProposal
  const proposalCreatedByTurn = input.proposal.createdTurnId === input.turnId
  if (proposalCreatedByTurn) {
    if (input.snapshot.stateVersion !== input.expectedStateVersion) {
      throw new ConversationError(
        'STATE_CONFLICT',
        'Execution proposal was built from an obsolete conversation state'
      )
    }
  } else if (
    !pendingProposal ||
    pendingProposal.status === 'INVALIDATED' ||
    pendingProposal.status === 'EXECUTED' ||
    pendingProposal.status === 'FAILED' ||
    pendingProposal.status === 'UNCERTAIN' ||
    pendingProposal.proposalId !== input.proposal.proposalId ||
    pendingProposal.proposalHash !== input.proposal.proposalHash ||
    pendingProposal.operationKey !== input.proposal.operationKey
  ) {
    throw new ConversationError(
      'STATE_CONFLICT',
      'Execution proposal is no longer the active conversation proposal'
    )
  }

  if (input.approvalResume) {
    const pendingApproval = input.snapshot.workingMemory.pendingApproval
    if (
      !pendingProposal ||
      pendingProposal.status !== 'PENDING_APPROVAL' ||
      !pendingApproval ||
      pendingApproval.approvalId !== input.approvalResume.approvalId ||
      pendingApproval.proposalHash !== input.approvalResume.proposalHash ||
      pendingApproval.operationKey !== input.approvalResume.operationKey ||
      pendingApproval.executionId !== input.approvalResume.executionId
    ) {
      throw new ConversationError(
        'STATE_CONFLICT',
        'Approval resume no longer matches the active conversation proposal'
      )
    }
  }
}

export function applyInterpretation(
  memory: WorkingMemory,
  interpretation: DialogueInterpretation,
  turnId: TurnId,
  now: string
): WorkingMemory {
  const entities = [...memory.entities]
  const changedKeys = new Set<string>()
  for (const input of interpretation.entities) {
    upsertEntity(entities, input, turnId, now, changedKeys)
  }
  if (interpretation.correction) {
    upsertEntity(entities, interpretation.correction, turnId, now, changedKeys)
  }

  const sourceRefs = appendBounded(
    memory.sourceRefs,
    `user:${turnId}`,
    WORKING_MEMORY_LIMITS.maxSourceRefs
  )
  let next: WorkingMemory = {
    ...memory,
    version: memory.version + 1,
    entities: trimEntities(entities),
    options:
      changedKeys.size > 0
        ? memory.options.map((option) => ({
            ...option,
            status: 'STALE' as const
          }))
        : memory.options,
    sourceRefs,
    pendingQuestion: memory.pendingQuestion,
    pendingProposal: memory.pendingProposal,
    pendingApproval: memory.pendingApproval
  }

  if (
    changedKeys.size > 0 &&
    memory.pendingProposal &&
    (memory.pendingProposal.status === 'DRAFT' ||
      memory.pendingProposal.status === 'PENDING_APPROVAL')
  ) {
    const proposalEntityKeys = Object.keys(
      memory.pendingProposal.entityVersions
    )
    if (proposalEntityKeys.some((key) => changedKeys.has(key))) {
      next = invalidateProposal(next, memory.pendingProposal.proposalId)
    }
  }
  return enforceMemory(next)
}

export function ensureGoal(
  memory: WorkingMemory,
  input: {
    readonly kind: DialogueInterpretation['intent']
    readonly label: string
    readonly requiredFields: readonly string[]
    readonly turnId: TurnId
    readonly now: string
    readonly maxDepth: number
  }
): WorkingMemory {
  const active = memory.activeGoalId
    ? memory.goals.find((goal) => goal.goalId === memory.activeGoalId)
    : undefined
  if (active && (active.status === 'ACTIVE' || active.status === 'SUSPENDED')) {
    const collectedFields = input.requiredFields.filter((field) =>
      hasActiveEntity(memory.entities, field)
    )
    return enforceMemory({
      ...memory,
      goals: memory.goals.map((goal) =>
        goal.goalId === active.goalId
          ? {
              ...goal,
              requiredFields: input.requiredFields,
              collectedFields,
              updatedAt: input.now
            }
          : goal
      )
    })
  }
  const depth = active ? active.depth + 1 : 0
  if (depth > Math.min(input.maxDepth, WORKING_MEMORY_LIMITS.maxGoalDepth)) {
    throw new ConversationError('INVALID_INPUT', 'Goal depth limit exceeded')
  }
  const goal: GoalRecord = {
    goalId: `goal_${input.turnId}`,
    kind: input.kind,
    label: input.label.slice(0, 160),
    requiredFields: uniqueStrings(input.requiredFields),
    collectedFields: input.requiredFields.filter((field) =>
      hasActiveEntity(memory.entities, field)
    ),
    status: 'ACTIVE',
    depth,
    createdTurnId: input.turnId,
    updatedAt: input.now
  }
  const goals = [...memory.goals.filter((item) => item.status !== 'COMPLETED')]
  return enforceMemory({
    ...memory,
    goals: [...goals, goal],
    activeGoalId: goal.goalId
  })
}

export function setQuestion(
  memory: WorkingMemory,
  question: PendingQuestion | undefined
): WorkingMemory {
  return enforceMemory(
    question
      ? { ...memory, pendingQuestion: question }
      : without(memory, 'pendingQuestion')
  )
}

export function getActiveEntity(
  memory: WorkingMemory,
  key: string
): EntityFact | undefined {
  for (let index = memory.entities.length - 1; index >= 0; index -= 1) {
    const entity = memory.entities[index]
    if (entity?.key === key && entity.status === 'ACTIVE') return entity
  }
  return undefined
}

export function getActiveGoal(memory: WorkingMemory): GoalRecord | undefined {
  return memory.activeGoalId
    ? memory.goals.find((goal) => goal.goalId === memory.activeGoalId)
    : undefined
}

export function setProposal(
  memory: WorkingMemory,
  proposal: ActionProposal | undefined
): WorkingMemory {
  return enforceMemory(
    proposal
      ? { ...memory, pendingProposal: proposal }
      : without(memory, 'pendingProposal')
  )
}

export function setApproval(
  memory: WorkingMemory,
  approval: PendingApproval | undefined
): WorkingMemory {
  return enforceMemory(
    approval
      ? { ...memory, pendingApproval: approval }
      : without(memory, 'pendingApproval')
  )
}

export function setHandoff(
  memory: WorkingMemory,
  handoff: HandoffPacket | undefined
): WorkingMemory {
  return enforceMemory(
    handoff ? { ...memory, handoff } : without(memory, 'handoff')
  )
}

/** Records a bounded tool-confirmed fact without promoting tool prose. */
export function recordSystemEntity(
  memory: WorkingMemory,
  input: {
    readonly key: string
    readonly value: import('./contracts.ts').ConversationJsonValue
    readonly turnId: TurnId
    readonly now: string
  }
): WorkingMemory {
  if (!input.key.trim() || input.key.length > 80) {
    throw new ConversationError(
      'INVALID_INPUT',
      'System entity key is outside bounds'
    )
  }
  const entities = memory.entities.map((entity) =>
    entity.key === input.key && entity.status === 'ACTIVE'
      ? { ...entity, status: 'CORRECTED' as const, updatedAt: input.now }
      : entity
  )
  const previous = memory.entities.find(
    (entity) => entity.key === input.key && entity.status === 'ACTIVE'
  )
  return enforceMemory({
    ...memory,
    version: memory.version + 1,
    entities: [
      ...entities,
      {
        key: input.key,
        value: input.value,
        source: 'SYSTEM' as const,
        status: 'ACTIVE' as const,
        version: (previous?.version ?? 0) + 1,
        turnId: input.turnId,
        updatedAt: input.now
      }
    ].slice(-WORKING_MEMORY_LIMITS.maxEntities)
  })
}

export function invalidateProposal(
  memory: WorkingMemory,
  proposalId: string
): WorkingMemory {
  const invalidatedProposalIds = appendBounded(
    memory.invalidatedProposalIds,
    proposalId,
    WORKING_MEMORY_LIMITS.maxInvalidatedProposals
  )
  const proposal = memory.pendingProposal
    ? memory.pendingProposal.proposalId === proposalId
      ? { ...memory.pendingProposal, status: 'INVALIDATED' as const }
      : memory.pendingProposal
    : undefined
  return enforceMemory({
    ...memory,
    ...(proposal ? { pendingProposal: proposal } : {}),
    invalidatedProposalIds,
    ...(memory.pendingApproval ? { pendingApproval: undefined } : {})
  })
}

export function withOptions(
  memory: WorkingMemory,
  options: readonly ReferenceCandidate[]
): WorkingMemory {
  return enforceMemory({
    ...memory,
    options: options.slice(-WORKING_MEMORY_LIMITS.maxOptions)
  })
}

export function suspendPrimaryGoal(
  memory: WorkingMemory,
  sideGoal: GoalRecord
): WorkingMemory {
  const active = memory.activeGoalId
  if (!active) return memory
  if (memory.goalStack.includes(active)) return memory
  if (memory.goalStack.length >= WORKING_MEMORY_LIMITS.maxGoalStack) {
    throw new ConversationError('INVALID_INPUT', 'Goal stack limit exceeded')
  }
  return enforceMemory({
    ...memory,
    goalStack: [...memory.goalStack, active],
    activeGoalId: sideGoal.goalId,
    goals: [
      ...memory.goals.map((goal) =>
        goal.goalId === active
          ? { ...goal, status: 'SUSPENDED' as const }
          : goal
      ),
      sideGoal
    ]
  })
}

export function resumePrimaryGoal(
  memory: WorkingMemory,
  now: string
): WorkingMemory {
  const primaryId = memory.goalStack[memory.goalStack.length - 1]
  if (!primaryId) return memory
  const sideId = memory.activeGoalId
  return enforceMemory({
    ...memory,
    goalStack: memory.goalStack.slice(0, -1),
    activeGoalId: primaryId,
    goals: memory.goals.map((goal) => {
      if (goal.goalId === primaryId)
        return { ...goal, status: 'ACTIVE' as const, updatedAt: now }
      if (goal.goalId === sideId)
        return { ...goal, status: 'COMPLETED' as const, updatedAt: now }
      return goal
    })
  })
}

export function applyExecution(
  memory: WorkingMemory,
  proposal: ActionProposal,
  outcome: ExecutionOutcome,
  now: string
): WorkingMemory {
  let next = memory
  if (outcome.status === 'WAITING_APPROVAL') {
    next = {
      ...next,
      pendingProposal: { ...proposal, status: 'PENDING_APPROVAL' },
      pendingApproval: outcome.approvalId
        ? {
            approvalId: outcome.approvalId,
            proposalHash: proposal.proposalHash,
            operationKey: proposal.operationKey,
            executionId: outcome.executionId,
            requestedAt: now
          }
        : undefined
    }
  } else if (outcome.status === 'SUCCEEDED' && outcome.effectConfirmed) {
    const goals = next.goals.map((goal) =>
      goal.goalId === next.activeGoalId
        ? { ...goal, status: 'COMPLETED' as const, updatedAt: now }
        : goal
    )
    next = {
      ...next,
      goals,
      pendingProposal: { ...proposal, status: 'EXECUTED' },
      pendingQuestion: undefined,
      pendingApproval: undefined
    }
  } else if (outcome.status === 'UNCERTAIN') {
    next = {
      ...next,
      pendingProposal: { ...proposal, status: 'UNCERTAIN' },
      pendingApproval: undefined
    }
  } else {
    next = {
      ...next,
      pendingProposal: { ...proposal, status: 'FAILED' },
      pendingApproval: undefined
    }
  }
  return enforceMemory({ ...next, version: next.version + 1 })
}

export function mergeWorkingMemory(
  current: WorkingMemory,
  candidate: WorkingMemory,
  base: WorkingMemory = current
): WorkingMemory {
  const entities = mergeEntityFacts(
    current.entities,
    candidate.entities,
    base.entities
  ).sort((left, right) => {
    if (left.updatedAt !== right.updatedAt)
      return left.updatedAt.localeCompare(right.updatedAt)
    return left.key.localeCompare(right.key)
  })
  const goals = [...current.goals]
  for (const goal of candidate.goals) {
    const index = goals.findIndex((item) => item.goalId === goal.goalId)
    if (index === -1) goals.push(goal)
    else {
      const currentGoal = goals[index]
      const baseGoal = base.goals.find((item) => item.goalId === goal.goalId)
      if (sameStateValue(currentGoal, baseGoal)) goals[index] = goal
    }
  }
  let merged: WorkingMemory = {
    ...current,
    version: Math.max(current.version, candidate.version),
    entities: trimEntities(entities),
    goals,
    sourceRefs: appendMany(
      current.sourceRefs,
      candidate.sourceRefs,
      WORKING_MEMORY_LIMITS.maxSourceRefs
    ),
    invalidatedProposalIds: appendMany(
      current.invalidatedProposalIds,
      candidate.invalidatedProposalIds,
      WORKING_MEMORY_LIMITS.maxInvalidatedProposals
    )
  }
  for (const key of [
    'activeGoalId',
    'pendingQuestion',
    'pendingProposal',
    'pendingApproval',
    'handoff',
    'goalStack',
    'options'
  ] as const) {
    if (
      !sameStateValue(candidate[key], base[key]) &&
      sameStateValue(current[key], base[key])
    ) {
      merged = { ...merged, [key]: candidate[key] }
    }
  }
  if (
    !sameStateValue(candidate.goals, base.goals) &&
    sameStateValue(current.goals, base.goals)
  ) {
    merged = {
      ...merged,
      goals: goalsFromCandidateAndCurrent(current, candidate, base)
    }
  }
  return enforceMemory(merged)
}

export function stateDigest(memory: WorkingMemory): string {
  return createHash('sha256').update(canonicalize(memory), 'utf8').digest('hex')
}

export function canonicalize(value: unknown): string {
  const seen = new Set<unknown>()
  const visit = (node: unknown, depth: number, path: string): string => {
    if (depth > WORKING_MEMORY_LIMITS.maxCanonicalDepth) {
      throw new ConversationError(
        'INVALID_INPUT',
        `state JSON depth exceeded at ${path}`
      )
    }
    if (node === null) return 'null'
    if (typeof node === 'string') return JSON.stringify(node)
    if (typeof node === 'boolean') return node ? 'true' : 'false'
    if (typeof node === 'number') {
      if (!Number.isFinite(node))
        throw new ConversationError('INVALID_INPUT', 'non-finite state number')
      return Object.is(node, -0) ? '0' : String(node)
    }
    if (Array.isArray(node)) {
      if (seen.has(node))
        throw new ConversationError('INVALID_INPUT', 'cyclic working memory')
      seen.add(node)
      if (countNodes(node) > WORKING_MEMORY_LIMITS.maxCanonicalNodes) {
        throw new ConversationError(
          'INVALID_INPUT',
          'state JSON node limit exceeded'
        )
      }
      const result = `[${node.map((item, index) => visit(item, depth + 1, `${path}[${index}]`)).join(',')}]`
      seen.delete(node)
      return result
    }
    if (typeof node === 'object') {
      if (seen.has(node))
        throw new ConversationError('INVALID_INPUT', 'cyclic working memory')
      seen.add(node)
      const record = node as Record<string, unknown>
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
      const result = `{${keys.map((key) => `${JSON.stringify(key)}:${visit(record[key], depth + 1, `${path}.${key}`)}`).join(',')}}`
      seen.delete(node)
      return result
    }
    throw new ConversationError(
      'INVALID_INPUT',
      `unsupported state value at ${path}`
    )
  }
  return visit(value, 0, '$')
}

function upsertEntity(
  entities: EntityFact[],
  input: DialogueEntityInput,
  turnId: TurnId,
  now: string,
  changedKeys: Set<string>
): void {
  const activeIndex = findActiveEntityIndex(entities, input.key)
  const active = activeIndex === -1 ? undefined : entities[activeIndex]
  if (active && !sameValue(active.value, input.value)) {
    entities[activeIndex] = { ...active, status: 'CORRECTED', updatedAt: now }
    changedKeys.add(input.key)
  } else if (active) {
    return
  }
  const version = (active?.version ?? 0) + 1
  entities.push({
    key: input.key,
    value: input.value,
    source: 'USER',
    status: 'ACTIVE',
    version,
    turnId,
    updatedAt: now
  })
  changedKeys.add(input.key)
}

function findActiveEntityIndex(
  entities: readonly EntityFact[],
  key: string
): number {
  for (let index = entities.length - 1; index >= 0; index -= 1) {
    if (entities[index]?.key === key && entities[index]?.status === 'ACTIVE')
      return index
  }
  return -1
}

function hasActiveEntity(
  entities: readonly EntityFact[],
  key: string
): boolean {
  return findActiveEntityIndex(entities, key) !== -1
}

function trimEntities(entities: readonly EntityFact[]): EntityFact[] {
  return entities.slice(-WORKING_MEMORY_LIMITS.maxEntities)
}

function enforceMemory(memory: WorkingMemory): WorkingMemory {
  const result: WorkingMemory = {
    ...memory,
    entities: trimEntities(memory.entities),
    goals: trimGoals(memory.goals, memory.activeGoalId, memory.goalStack),
    goalStack: memory.goalStack.slice(-WORKING_MEMORY_LIMITS.maxGoalStack),
    options: memory.options.slice(-WORKING_MEMORY_LIMITS.maxOptions),
    sourceRefs: memory.sourceRefs.slice(-WORKING_MEMORY_LIMITS.maxSourceRefs),
    invalidatedProposalIds: memory.invalidatedProposalIds.slice(
      -WORKING_MEMORY_LIMITS.maxInvalidatedProposals
    )
  }
  assertBasicMemory(result)
  assertWorkingMemorySize(result)
  return result
}

function assertBasicMemory(memory: WorkingMemory): void {
  if (memory.entities.length > WORKING_MEMORY_LIMITS.maxEntities) {
    throw new ConversationError('INVALID_INPUT', 'entity limit exceeded')
  }
  if (memory.goals.length > WORKING_MEMORY_LIMITS.maxGoals) {
    throw new ConversationError('INVALID_INPUT', 'goal limit exceeded')
  }
}

function trimGoals(
  goals: readonly GoalRecord[],
  activeGoalId: string | undefined,
  goalStack: readonly string[]
): GoalRecord[] {
  const required = new Set(
    [activeGoalId, ...goalStack].filter(
      (goalId): goalId is string => typeof goalId === 'string'
    )
  )
  const retained = goals.slice(-WORKING_MEMORY_LIMITS.maxGoals)
  const byId = new Map(goals.map((goal) => [goal.goalId, goal]))
  for (const goalId of required) {
    if (retained.some((goal) => goal.goalId === goalId)) continue
    const requiredGoal = byId.get(goalId)
    if (!requiredGoal) continue
    const replaceIndex = retained.findIndex(
      (goal) => !required.has(goal.goalId)
    )
    if (replaceIndex >= 0) retained[replaceIndex] = requiredGoal
    else if (retained.length < WORKING_MEMORY_LIMITS.maxGoals)
      retained.push(requiredGoal)
  }
  return retained
}

function assertWorkingMemorySize(memory: WorkingMemory): void {
  const bytes = Buffer.byteLength(canonicalize(memory), 'utf8')
  if (bytes > WORKING_MEMORY_LIMITS.maxStateBytes) {
    throw new ConversationError('INVALID_INPUT', 'working memory size exceeded')
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left) === canonicalize(right)
  } catch {
    return false
  }
}

function sameStateValue(left: unknown, right: unknown): boolean {
  if (left === undefined || right === undefined) return left === right
  try {
    return canonicalize(left) === canonicalize(right)
  } catch {
    return false
  }
}

function mergeEntityFacts(
  current: readonly EntityFact[],
  candidate: readonly EntityFact[],
  base: readonly EntityFact[]
): EntityFact[] {
  const keys = new Set([
    ...current.map((entity) => entity.key),
    ...candidate.map((entity) => entity.key),
    ...base.map((entity) => entity.key)
  ])
  const merged: EntityFact[] = []
  for (const key of keys) {
    const currentFacts = current.filter((entity) => entity.key === key)
    const candidateFacts = candidate.filter((entity) => entity.key === key)
    const baseFacts = base.filter((entity) => entity.key === key)
    const currentChanged = !sameStateValue(currentFacts, baseFacts)
    const candidateChanged = !sameStateValue(candidateFacts, baseFacts)
    const selected =
      currentChanged && !candidateChanged
        ? currentFacts
        : !currentChanged && candidateChanged
          ? candidateFacts
          : currentFacts
    merged.push(...selected)
  }
  const byIdentity = new Map<string, EntityFact>()
  for (const entity of merged) {
    const identity = `${entity.key}:${entity.version}:${entity.status}:${canonicalize(entity.value)}`
    if (!byIdentity.has(identity)) byIdentity.set(identity, entity)
  }
  return [...byIdentity.values()]
}

function goalsFromCandidateAndCurrent(
  current: WorkingMemory,
  candidate: WorkingMemory,
  base: WorkingMemory
): GoalRecord[] {
  const goals = [...current.goals]
  for (const goal of candidate.goals) {
    const index = goals.findIndex((item) => item.goalId === goal.goalId)
    if (index === -1) goals.push(goal)
    else {
      const currentGoal = goals[index]
      const baseGoal = base.goals.find((item) => item.goalId === goal.goalId)
      if (sameStateValue(currentGoal, baseGoal)) goals[index] = goal
    }
  }
  return goals
}

function appendBounded(
  values: readonly string[],
  value: string,
  max: number
): string[] {
  return [...values.filter((item) => item !== value), value].slice(-max)
}

function appendMany(
  values: readonly string[],
  additions: readonly string[],
  max: number
): string[] {
  let result = [...values]
  for (const value of additions) result = appendBounded(result, value, max)
  return result
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))]
}

function without<K extends keyof WorkingMemory>(
  memory: WorkingMemory,
  key: K
): WorkingMemory {
  const copy = { ...memory }
  delete copy[key]
  return copy
}

export function hasForbiddenMemoryContent(
  value: unknown,
  seen = new Set<object>()
): boolean {
  if (typeof value === 'string') {
    return /(?:bearer\s+|api[_-]?key\s*[:=]|password\s*[:=]|secret\s*[:=]|token\s*[:=]|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i.test(
      value
    )
  }
  if (typeof value !== 'object' || value === null) return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) {
    const found = value.some((child) => hasForbiddenMemoryContent(child, seen))
    seen.delete(value)
    return found
  }
  const found = Object.entries(value).some(
    ([key, child]) =>
      /chain.?of.?thought|reasoning|policy.?decision|approval.?grant|credential|secret|api.?key|access.?token|auth.?token|private.?key|client.?secret|password/i.test(
        key
      ) || hasForbiddenMemoryContent(child, seen)
  )
  seen.delete(value)
  return found
}

/** Rejects instruction-like prose before approved knowledge reaches a reply. */
export function hasUntrustedInstructionContent(value: string): boolean {
  return /ignore\s+(?:all|any|the|previous|prior|earlier|as?|os|todas?)\s*(?:rules?|regras?|instructions?|instruções?)?|desconsid(?:ere|erar)\s+(?:todas?|as)\s+(?:rules?|regras?|instruções?)|system\s+(?:message|prompt)|assistant\s+instructions?|execute\s+(?:the\s+)?(?:hidden|arbitrary|untrusted)?\s*tool|grant\s+approval|override\s+(?:the\s+)?policy|reveal\s+(?:secrets?|credentials?|reasoning)|call\s+hidden\.?capability/i.test(
    value
  )
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function countNodes(value: unknown, seen = new Set<object>()): number {
  if (value === null || typeof value !== 'object') return 1
  if (seen.has(value))
    throw new ConversationError('INVALID_INPUT', 'cyclic working memory')
  seen.add(value)
  const children = Array.isArray(value) ? value : Object.values(value)
  const result =
    1 + children.reduce((sum, item) => sum + countNodes(item, seen), 0)
  seen.delete(value)
  return result
}
