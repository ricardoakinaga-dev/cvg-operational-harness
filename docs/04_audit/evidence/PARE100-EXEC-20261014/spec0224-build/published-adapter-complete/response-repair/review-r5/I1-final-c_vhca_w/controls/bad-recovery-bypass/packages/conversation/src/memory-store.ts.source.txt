import { randomUUID } from 'node:crypto'
import {
  ConversationError,
  isTerminalConversationStatus,
  type AcceptedTurn,
  type ConversationScope,
  type ConversationSnapshot,
  type ConversationStore,
  type DeliveryStatus,
  type ExecutionAuthorizationInput,
  type ExecutionClaim,
  type ExecutionClaimInput,
  type ExecutionOutcome,
  type MessageId,
  type TurnAcceptanceInput,
  type TurnCommitInput,
  type TurnCommitResult,
  type TurnId,
  type TurnRecord
} from './contracts.ts'
import {
  assertExecutionClaimFresh,
  createInitialSnapshot,
  assertWorkingMemory,
  mergeWorkingMemory
} from './state.ts'
import { validateText } from './contracts.ts'

interface MemoryConversationEntry {
  snapshot: ConversationSnapshot
  turns: Map<string, TurnRecord>
  executions: Map<string, ExecutionOutcome>
}

export interface InMemoryConversationStoreOptions {
  /** Short lease used by controlled crash/recovery fixtures. */
  readonly executionLeaseMs?: number
}

/**
 * Deterministic store used by unit tests and controlled demos. Its per-scope
 * mutex models the short database critical sections; no model, tool, user or
 * approval wait occurs while a lock is held.
 */
export class InMemoryConversationStore implements ConversationStore {
  readonly #entries = new Map<string, MemoryConversationEntry>()
  readonly #locks = new Map<string, Promise<void>>()
  readonly #executionLeaseMs: number

  constructor(options: InMemoryConversationStoreOptions = {}) {
    this.#executionLeaseMs = Math.max(0, options.executionLeaseMs ?? 30_000)
  }

  async acceptTurn(input: TurnAcceptanceInput): Promise<AcceptedTurn> {
    validateText(input.text)
    validateIdentity(input)
    const key = scopeKey(input)
    return this.withLock(key, async () => {
      let entry = this.#entries.get(key)
      if (!entry) {
        entry = {
          // Persist only the validated scope. The envelope may carry an
          // approval proof and other transport data that must never enter
          // the durable snapshot.
          snapshot: createInitialSnapshot(toScope(input), input.receivedAt),
          turns: new Map(),
          executions: new Map()
        }
        this.#entries.set(key, entry)
      } else {
        assertSameProfile(entry.snapshot.scope, input)
      }

      const existingByMessage = [...entry.turns.values()].find(
        (turn) => turn.identity.messageId === input.messageId
      )
      const existingByIdempotency = [...entry.turns.values()].find(
        (turn) => turn.idempotencyKey === input.idempotencyKey
      )
      const existingByTurn = entry.turns.get(String(input.turnId))
      if (
        existingByTurn &&
        (existingByTurn.identity.messageId !== input.messageId ||
          existingByTurn.idempotencyKey !== input.idempotencyKey ||
          existingByTurn.text !== input.text)
      ) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Turn identity is already bound to another message'
        )
      }
      const identityMatches = [
        existingByMessage,
        existingByIdempotency,
        existingByTurn
      ].filter((turn): turn is TurnRecord => Boolean(turn))
      if (
        new Set(identityMatches.map((turn) => String(turn.identity.turnId)))
          .size > 1
      ) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Message, idempotency and turn identities point to different turns'
        )
      }
      const existing =
        existingByMessage ?? existingByIdempotency ?? existingByTurn
      if (existing) {
        if (
          existing.identity.messageId !== input.messageId ||
          existing.idempotencyKey !== input.idempotencyKey ||
          existing.text !== input.text
        ) {
          throw new ConversationError(
            'STATE_CONFLICT',
            'Message or idempotency identity is already bound to another turn'
          )
        }
        return {
          turn: clone(existing),
          snapshot: clone(entry.snapshot),
          replayed: true
        }
      }
      if (isTerminalConversationStatus(entry.snapshot.status)) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Conversation is terminal and cannot accept a new turn'
        )
      }

      const turn: TurnRecord = {
        identity: stripAcceptanceToIdentity(input),
        idempotencyKey: input.idempotencyKey,
        text: input.text,
        status: 'ACCEPTED',
        createdAt: input.receivedAt,
        updatedAt: input.receivedAt
      }
      entry.turns.set(String(input.turnId), turn)
      return {
        turn: clone(turn),
        snapshot: clone(entry.snapshot),
        replayed: false
      }
    })
  }

  async load(scope: ConversationScope): Promise<ConversationSnapshot | null> {
    validateScope(scope)
    const entry = this.#entries.get(scopeKey(scope))
    if (!entry) return null
    assertSameProfile(entry.snapshot.scope, scope)
    return clone(entry.snapshot)
  }

  async commitTurn(input: TurnCommitInput): Promise<TurnCommitResult> {
    validateScope(input.scope)
    assertWorkingMemory(input.memory)
    const key = scopeKey(input.scope)
    return this.withLock(key, async () => {
      const entry = this.#entries.get(key)
      if (!entry)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Conversation does not exist'
        )
      assertSameProfile(entry.snapshot.scope, input.scope)
      const currentTurn = entry.turns.get(String(input.turnId))
      if (!currentTurn)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Turn does not exist'
        )
      if (
        currentTurn.status !== 'ACCEPTED' &&
        currentTurn.status !== 'PROCESSING'
      ) {
        return { turn: clone(currentTurn), snapshot: clone(entry.snapshot) }
      }
      if (entry.snapshot.stateVersion !== input.expectedStateVersion) {
        throw new ConversationError(
          'STATE_CONFLICT',
          `Conversation state version ${entry.snapshot.stateVersion} differs from expected ${input.expectedStateVersion}`
        )
      }
      const nextMemory = mergeWorkingMemory(
        entry.snapshot.workingMemory,
        input.memory,
        input.baseMemory
      )
      const nextSnapshot: ConversationSnapshot = {
        ...entry.snapshot,
        status: input.conversationStatus,
        stateVersion: entry.snapshot.stateVersion + 1,
        workingMemory: nextMemory,
        updatedAt: input.now
      }
      const nextTurn: TurnRecord = {
        ...currentTurn,
        identity: input.executionId
          ? { ...currentTurn.identity, executionId: input.executionId }
          : currentTurn.identity,
        status: input.status,
        ...(input.executionStatus
          ? { executionStatus: input.executionStatus }
          : {}),
        interpretation: input.interpretation,
        planKind: input.planKind,
        response: input.response,
        updatedAt: input.now
      }
      entry.snapshot = nextSnapshot
      entry.turns.set(String(input.turnId), nextTurn)
      return { turn: clone(nextTurn), snapshot: clone(nextSnapshot) }
    })
  }

  async getTurn(
    scope: ConversationScope,
    turnId: TurnId
  ): Promise<TurnRecord | null> {
    validateScope(scope)
    const entry = this.#entries.get(scopeKey(scope))
    if (entry) assertSameProfile(entry.snapshot.scope, scope)
    const turn = entry?.turns.get(String(turnId))
    return turn ? clone(turn) : null
  }

  async getTurnByMessage(
    scope: ConversationScope,
    messageId: MessageId
  ): Promise<TurnRecord | null> {
    validateScope(scope)
    const entry = this.#entries.get(scopeKey(scope))
    if (entry) assertSameProfile(entry.snapshot.scope, scope)
    const turn = entry
      ? [...entry.turns.values()].find(
          (item) => item.identity.messageId === messageId
        )
      : undefined
    return turn ? clone(turn) : null
  }

  async updateDelivery(
    scope: ConversationScope,
    turnId: TurnId,
    deliveryStatus: DeliveryStatus
  ): Promise<TurnRecord> {
    validateScope(scope)
    return this.withLock(scopeKey(scope), async () => {
      const entry = this.#entries.get(scopeKey(scope))
      if (entry) assertSameProfile(entry.snapshot.scope, scope)
      const turn = entry?.turns.get(String(turnId))
      if (!entry || !turn || !turn.response) {
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Turn response does not exist'
        )
      }
      const updated: TurnRecord = {
        ...turn,
        response: { ...turn.response, deliveryStatus },
        updatedAt: new Date().toISOString()
      }
      entry.turns.set(String(turnId), updated)
      return clone(updated)
    })
  }

  async claimExecution(input: ExecutionClaimInput): Promise<ExecutionClaim> {
    validateScope(input.scope)
    const key = scopeKey(input.scope)
    const operationKey = input.proposal.operationKey
    return this.withLock(key, async () => {
      const entry = this.#entries.get(key)
      if (!entry)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Conversation does not exist'
        )
      assertSameProfile(entry.snapshot.scope, input.scope)
      if (!entry.turns.has(String(input.turnId))) {
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Execution turn does not exist in the conversation'
        )
      }
      const existing = entry.executions.get(operationKey)
      if (!existing) {
        assertExecutionClaimFresh({
          snapshot: entry.snapshot,
          proposal: input.proposal,
          turnId: input.turnId,
          expectedStateVersion: input.expectedStateVersion,
          ...(input.approvalResume
            ? { approvalResume: input.approvalResume }
            : {})
        })
        const lease = leaseFor(this.#executionLeaseMs)
        entry.executions.set(operationKey, {
          status: 'IN_FLIGHT',
          turnId: input.turnId,
          executionId: input.executionId,
          proposalHash: input.proposal.proposalHash,
          operationKey,
          effectConfirmed: false,
          evidenceRefs: [],
          recordedAt: new Date().toISOString(),
          leaseUntil: lease.leaseUntil,
          leaseToken: lease.leaseToken
        })
        return {
          kind: 'EXECUTE',
          leaseToken: lease.leaseToken,
          turnId: input.turnId
        }
      }
      if (existing.proposalHash !== input.proposal.proposalHash) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Operation key is bound to another proposal'
        )
      }
      if (existing.status === 'IN_FLIGHT') {
        if (isLeaseExpired(existing.leaseUntil)) {
          const reclaimed = {
            ...existing,
            recordedAt: new Date().toISOString(),
            ...leaseFor(this.#executionLeaseMs)
          }
          entry.executions.set(operationKey, reclaimed)
          return { kind: 'STALE', outcome: clone(reclaimed) }
        }
        return { kind: 'IN_FLIGHT', outcome: clone(existing) }
      }
      if (existing.status === 'WAITING_APPROVAL') {
        if (input.approvalResume) {
          assertExecutionClaimFresh({
            snapshot: entry.snapshot,
            proposal: input.proposal,
            turnId: input.turnId,
            expectedStateVersion: input.expectedStateVersion,
            approvalResume: input.approvalResume
          })
        }
        const approvalMatches =
          input.approvalResume?.authenticated === true &&
          input.approvalResume.proposalHash === existing.proposalHash &&
          input.approvalResume.operationKey === existing.operationKey &&
          (input.approvalResume.executionId === undefined ||
            input.approvalResume.executionId === existing.executionId) &&
          input.approvalResume.approvalId === existing.approvalId
        if (!approvalMatches)
          return { kind: 'WAITING_APPROVAL', outcome: clone(existing) }
        const resumed: ExecutionOutcome = {
          ...existing,
          status: 'IN_FLIGHT',
          recordedAt: new Date().toISOString(),
          ...leaseFor(this.#executionLeaseMs)
        }
        entry.executions.set(operationKey, resumed)
        return {
          kind: 'EXECUTE',
          leaseToken: resumed.leaseToken!,
          turnId: resumed.turnId
        }
      }
      return { kind: 'REPLAY', outcome: clone(existing) }
    })
  }

  async authorizeExecution(input: ExecutionAuthorizationInput): Promise<void> {
    validateScope(input.scope)
    const key = scopeKey(input.scope)
    return this.withLock(key, async () => {
      const entry = this.#entries.get(key)
      if (!entry)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Conversation does not exist'
        )
      assertSameProfile(entry.snapshot.scope, input.scope)
      if (!entry.turns.has(String(input.turnId))) {
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Execution turn does not exist in the conversation'
        )
      }
      // This is the effect authorization linearization point. A correction
      // committed first changes the state version or active proposal and
      // prevents the external Harness call from being reached.
      assertExecutionClaimFresh({
        snapshot: entry.snapshot,
        proposal: input.proposal,
        turnId: input.turnId,
        expectedStateVersion: input.expectedStateVersion,
        ...(input.approvalResume
          ? { approvalResume: input.approvalResume }
          : {})
      })
      const current = entry.executions.get(input.proposal.operationKey)
      if (
        !current ||
        current.status !== 'IN_FLIGHT' ||
        current.proposalHash !== input.proposal.proposalHash ||
        current.turnId !== input.turnId ||
        current.executionId !== input.executionId ||
        current.leaseToken !== input.leaseToken ||
        isLeaseExpired(current.leaseUntil)
      ) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Execution reservation is no longer authorized for the effect'
        )
      }
    })
  }

  async finalizeExecution(
    scope: ConversationScope,
    outcome: ExecutionOutcome
  ): Promise<void> {
    validateScope(scope)
    return this.withLock(scopeKey(scope), async () => {
      const entry = this.#entries.get(scopeKey(scope))
      if (!entry)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Conversation does not exist'
        )
      assertSameProfile(entry.snapshot.scope, scope)
      const current = entry.executions.get(outcome.operationKey)
      if (!current)
        throw new ConversationError(
          'PERSISTENCE_FAILURE',
          'Execution reservation does not exist'
        )
      if (current.proposalHash !== outcome.proposalHash) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Execution proposal hash changed'
        )
      }
      if (current.turnId !== outcome.turnId) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Execution finalization turn does not own the reservation'
        )
      }
      if (!outcome.leaseToken || outcome.leaseToken !== current.leaseToken) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Execution lease is no longer owned by this attempt'
        )
      }
      if (current.status !== 'IN_FLIGHT') {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Execution reservation is no longer in flight'
        )
      }
      // A finalized outcome releases the worker lease. WAITING_APPROVAL is a
      // durable business state, and the next effect may proceed only through
      // a newly authenticated approval resume that acquires a new lease.
      entry.executions.set(
        outcome.operationKey,
        clone(withoutExecutionLease(outcome))
      )
    })
  }

  /** Test-only snapshot of the number of governed reservations. */
  executionCount(scope: ConversationScope): number {
    return this.#entries.get(scopeKey(scope))?.executions.size ?? 0
  }

  private async withLock<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const previous = this.#locks.get(key) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    this.#locks.set(key, current)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (this.#locks.get(key) === current) this.#locks.delete(key)
    }
  }
}

export const MemoryConversationStore = InMemoryConversationStore

function scopeKey(
  scope: Pick<ConversationScope, 'tenantId' | 'conversationId'>
): string {
  return `${String(scope.tenantId)}:${String(scope.conversationId)}`
}

function validateScope(scope: ConversationScope): void {
  if (
    !scope.tenantId ||
    !scope.conversationId ||
    !scope.sessionId ||
    !scope.profileId ||
    !scope.profileVersion
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Complete tenant, session and profile scope is required'
    )
  }
  for (const [label, value] of Object.entries({
    tenantId: scope.tenantId,
    conversationId: scope.conversationId,
    sessionId: scope.sessionId,
    profileId: scope.profileId,
    profileVersion: scope.profileVersion
  })) {
    if (typeof value !== 'string' || value.length > 200) {
      throw new ConversationError('INVALID_INPUT', `${label} is outside bounds`)
    }
  }
}

function validateIdentity(input: TurnAcceptanceInput): void {
  validateScope(input)
  if (
    !input.turnId ||
    !input.messageId ||
    !input.correlationId ||
    !input.idempotencyKey
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Complete turn identity is required'
    )
  }
  for (const [label, value] of Object.entries({
    turnId: input.turnId,
    messageId: input.messageId,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey
  })) {
    if (typeof value !== 'string' || value.length > 200) {
      throw new ConversationError('INVALID_INPUT', `${label} is outside bounds`)
    }
  }
  if (
    input.profile.id !== input.profileId ||
    input.profile.version !== input.profileVersion
  ) {
    throw new ConversationError(
      'PROFILE_MISMATCH',
      'Profile identity is not pinned to the turn'
    )
  }
}

function assertSameProfile(
  left: ConversationScope,
  right: ConversationScope
): void {
  if (
    left.tenantId !== right.tenantId ||
    left.conversationId !== right.conversationId ||
    left.sessionId !== right.sessionId
  ) {
    throw new ConversationError(
      'TENANT_MISMATCH',
      'Conversation scope does not match'
    )
  }
  if (
    left.profileId !== right.profileId ||
    left.profileVersion !== right.profileVersion
  ) {
    throw new ConversationError(
      'PROFILE_MISMATCH',
      'Conversation profile is pinned to another version'
    )
  }
}

function stripAcceptanceToIdentity(
  input: TurnAcceptanceInput
): TurnRecord['identity'] {
  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    turnId: input.turnId,
    messageId: input.messageId,
    correlationId: input.correlationId
  }
}

function toScope(input: TurnAcceptanceInput): ConversationScope {
  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion
  }
}

function withoutExecutionLease(outcome: ExecutionOutcome): ExecutionOutcome {
  return {
    status: outcome.status,
    turnId: outcome.turnId,
    executionId: outcome.executionId,
    proposalHash: outcome.proposalHash,
    operationKey: outcome.operationKey,
    ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
    effectConfirmed: outcome.effectConfirmed,
    ...(outcome.output !== undefined ? { output: outcome.output } : {}),
    ...(outcome.response ? { response: outcome.response } : {}),
    ...(outcome.stopReason ? { stopReason: outcome.stopReason } : {}),
    evidenceRefs: outcome.evidenceRefs,
    recordedAt: outcome.recordedAt
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function leaseFor(durationMs: number): {
  readonly leaseUntil: string
  readonly leaseToken: string
} {
  return {
    leaseUntil: new Date(Date.now() + durationMs).toISOString(),
    leaseToken: randomUUID()
  }
}

function isLeaseExpired(value: string | undefined): boolean {
  return Boolean(value && new Date(value).getTime() <= Date.now())
}
