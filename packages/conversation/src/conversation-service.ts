import {
  ConversationError,
  asExecutionId,
  type AuthenticatedApprovalResume,
  type ConversationExecutionStatus,
  type ConversationProfile,
  type ConversationRequest,
  type ConversationScope,
  type ConversationService,
  type ConversationServiceOptions,
  type ConversationTurnResult,
  type DialoguePlan,
  type DialogueManager,
  type ExecutionClaim,
  type ExecutionClaimInput,
  type ExecutionOutcome,
  type HarnessActionResult,
  type HandoffReceipt,
  type TurnAcceptanceInput,
  type TurnCommitResult,
  type TurnResponse,
  type TurnRecord,
  type WorkingMemory
} from './contracts.ts'
import { DefaultDialogueManager } from './dialogue-manager.ts'
import { DefaultResponseComposer } from './response-composer.ts'
import {
  applyExecution,
  mergeWorkingMemory,
  resumePrimaryGoal,
  recordSystemEntity,
  hasForbiddenMemoryContent,
  hasUntrustedInstructionContent,
  setHandoff,
  withOptions
} from './state.ts'
import { createHandoffPacket } from './handoff.ts'
import { contextSnapshotForMemory } from './context-adapter.ts'

const DEFAULT_BUDGET = {
  maxSteps: 8,
  maxModelCalls: 2,
  maxToolCalls: 2,
  maxDurationMs: 15_000,
  maxCostUsd: 0,
  maxTokens: 8_000,
  maxKnowledgeCalls: 1,
  maxReplans: 2,
  maxVerificationCalls: 2,
  maxDecisionRepairs: 1
} as const

const DEFAULT_IN_FLIGHT_WAIT_MS = 250

/**
 * Coordinates short store critical sections, interpretation, planning,
 * governed execution, grounding and delivery. External waits happen outside
 * store locks and are fenced by an idempotent operation reservation.
 */
export class DefaultConversationService implements ConversationService {
  readonly #options: ConversationServiceOptions
  readonly #manager: DialogueManager
  readonly #composer: import('./contracts.ts').ResponseComposer
  readonly #clock: () => Date

  constructor(options: ConversationServiceOptions) {
    this.#options = options
    this.#manager = options.manager ?? new DefaultDialogueManager()
    this.#composer = resolveComposer(options.composer)
    this.#clock = options.clock ?? (() => new Date())
  }

  async inspect(scope: ConversationScope) {
    return this.#options.store.load(scope)
  }

  async runTurn(input: ConversationRequest): Promise<ConversationTurnResult> {
    const profile = await this.resolveTrustedProfile(input)
    // The transport descriptor is untrusted. Runtime authority comes only
    // from the instance-scoped registry selected at service construction.
    const trustedInput: TurnAcceptanceInput = { ...input, profile }
    const accepted = await this.#options.store.acceptTurn(trustedInput)
    const scope = toScope(trustedInput)
    if (
      accepted.replayed &&
      accepted.turn.response &&
      accepted.turn.status !== 'PROCESSING'
    ) {
      return this.replayTurn(accepted.turn, accepted.snapshot, scope)
    }

    const identity = accepted.turn.identity
    const now = this.#clock().toISOString()
    const interpretation = await this.#options.interpreter.interpret({
      identity,
      text: accepted.turn.text,
      memory: accepted.snapshot.workingMemory,
      profile,
      budget: {
        maxModelCalls: profile.maxGoalDepth > 0 ? 2 : 1,
        maxInputChars: 4_000
      }
    })

    const approvalResume = await this.authenticateApprovalResume(
      scope,
      accepted.snapshot.workingMemory,
      input.approvalResume
    )
    let plan =
      approvalResume === false
        ? {
            kind: 'HANDOFF' as const,
            reason: 'APPROVAL_BINDING_MISMATCH',
            memory: accepted.snapshot.workingMemory
          }
        : this.#manager.plan({
            identity,
            conversationStatus: accepted.snapshot.status,
            memory: accepted.snapshot.workingMemory,
            interpretation,
            profile,
            now,
            ...(approvalResume ? { approvalResume } : {})
          })

    let execution: HarnessActionResult | undefined
    let durableExecutionId: import('./contracts.ts').ExecutionId | undefined
    let durableExecutionStatus: ConversationExecutionStatus | undefined
    let handoffReceipt: HandoffReceipt | undefined
    let commitBaseMemory: WorkingMemory | undefined
    let commitStateVersion: number | undefined
    if (plan.kind === 'HANDOFF') {
      const packet = createHandoffPacket({
        scope,
        turnId: identity.turnId,
        reason: plan.reason,
        memory: plan.memory,
        now
      })
      const memory = setHandoff(plan.memory, packet)
      if (this.#options.handoff) {
        try {
          handoffReceipt = await this.#options.handoff.submit(packet)
        } catch {
          handoffReceipt = {
            status: 'FAILED',
            handoffId: packet.handoffId,
            idempotencyKey: packet.idempotencyKey,
            reason: 'HANDOFF_SINK_FAILURE'
          }
        }
      }
      plan = { ...plan, memory }
    }
    if (plan.kind === 'SEARCH_KNOWLEDGE') {
      const evidence = await this.searchKnowledge(scope, profile, plan.query)
      if (plan.memory.goalStack.length > 0) {
        const resumed = resumePrimaryGoal(plan.memory, now)
        plan = { ...plan, memory: resumed }
      }
      const draft = this.#composer.compose({
        identity,
        profile,
        plan,
        memory: plan.memory,
        knowledge: evidence
      })
      return this.commitAndDeliver({
        input: trustedInput,
        profile,
        scope,
        accepted,
        interpretation,
        plan,
        draft,
        execution,
        handoffReceipt,
        now
      })
    }

    if (plan.kind === 'EXECUTE_ACTION') {
      const actionPlan = plan
      // The transport envelope is untrusted. A normal turn receives a
      // service-owned id; an approval resume reuses the id already bound to
      // the durable pending approval.
      const executionId =
        accepted.snapshot.workingMemory.pendingApproval?.executionId ??
        asExecutionId(`execution_${identity.turnId}`)
      const claimInput: ExecutionClaimInput = {
        scope,
        proposal: actionPlan.proposal,
        turnId: identity.turnId,
        executionId,
        expectedStateVersion: accepted.snapshot.stateVersion,
        ...(actionPlan.approvalResume
          ? { approvalResume: actionPlan.approvalResume }
          : {})
      }
      let settledClaim: ExecutionClaim | undefined
      try {
        const claim = await this.#options.store.claimExecution(claimInput)
        const candidateClaim = await this.waitForInFlightClaim(
          claim,
          claimInput
        )
        if (candidateClaim.kind === 'EXECUTE') {
          // Claim acquisition and effect authorization are separate short
          // critical sections. The second fence linearizes this turn against
          // a correction that may have committed while the Harness was not
          // yet called.
          await this.#options.store.authorizeExecution({
            ...claimInput,
            // Approval resumes claim the original proposal owner’s durable
            // reservation even though the callback has a new turn id.
            turnId: candidateClaim.turnId,
            leaseToken: candidateClaim.leaseToken
          })
        }
        settledClaim = candidateClaim
      } catch (error) {
        if (
          !(error instanceof ConversationError) ||
          error.code !== 'STATE_CONFLICT'
        )
          throw error
        settledClaim = undefined
        const latest = await this.#options.store.load(scope)
        if (!latest) throw error
        // A correction or competing turn won the state race. Keep the latest
        // durable memory as the merge base so the stale plan cannot restore a
        // proposal that the current state invalidated.
        plan = {
          kind: 'ANSWER',
          intent: 'CLARIFY',
          responseIntent: 'STALE_PROPOSAL',
          memory: latest.workingMemory
        }
        commitBaseMemory = latest.workingMemory
        commitStateVersion = latest.stateVersion
      }
      if (settledClaim?.kind === 'EXECUTE') {
        execution = await this.executeGoverned({
          identity,
          context: contextSnapshotForMemory(actionPlan.memory, now),
          proposal: actionPlan.proposal,
          ...(actionPlan.approvalResume
            ? { approvalResume: actionPlan.approvalResume }
            : {}),
          executionId,
          input: trustedInput
        })
        execution = await this.verifyEffectEvidence(
          scope,
          actionPlan.proposal,
          execution
        )
        const outcome = toExecutionOutcome(
          execution,
          now,
          settledClaim.turnId,
          settledClaim.leaseToken
        )
        await this.#options.store.finalizeExecution(scope, outcome)
        plan = {
          ...plan,
          memory: memoryAfterExecution(
            actionPlan.memory,
            actionPlan.proposal,
            outcome,
            now,
            profile
          )
        }
      } else if (settledClaim?.kind === 'REPLAY') {
        execution = outcomeToHarnessResult(settledClaim.outcome)
        plan = {
          ...plan,
          memory: memoryAfterExecution(
            actionPlan.memory,
            actionPlan.proposal,
            settledClaim.outcome,
            now,
            profile
          )
        }
      } else if (settledClaim?.kind === 'STALE') {
        execution = await this.recoverStaleExecution(
          scope,
          actionPlan.proposal,
          settledClaim.outcome
        )
        const outcome = toExecutionOutcome(
          execution,
          now,
          settledClaim.outcome.turnId,
          settledClaim.outcome.leaseToken
        )
        await this.#options.store.finalizeExecution(scope, outcome)
        plan = {
          ...plan,
          memory: memoryAfterExecution(
            actionPlan.memory,
            actionPlan.proposal,
            outcome,
            now,
            profile
          )
        }
      } else if (settledClaim?.kind === 'WAITING_APPROVAL') {
        plan = {
          kind: 'WAIT_APPROVAL',
          proposal: actionPlan.proposal,
          memory: actionPlan.memory
        }
      } else if (settledClaim?.kind === 'IN_FLIGHT') {
        durableExecutionId = settledClaim.outcome.executionId
        durableExecutionStatus = 'RUNNING'
        plan = {
          kind: 'ANSWER',
          intent: 'INFO',
          responseIntent: 'ACTION_IN_FLIGHT',
          // The duplicate is only recording coordination state. Keep its
          // memory candidate equal to the accepted base so the original
          // owner's later effect outcome can win the optimistic merge.
          memory: accepted.snapshot.workingMemory
        }
      } else if (settledClaim) {
        plan = {
          kind: 'ANSWER',
          intent: 'INFO',
          responseIntent: 'ACTION_IN_FLIGHT',
          memory: plan.memory
        }
      }
    }

    if (plan.kind === 'PROPOSE_ACTION' || plan.kind === 'WAIT_APPROVAL') {
      // Proposal state is persisted, while execution remains impossible until
      // a later user confirmation or authenticated approval resume.
    }
    const draft = this.#composer.compose({
      identity,
      profile,
      plan,
      memory: plan.memory,
      ...(execution ? { execution } : {}),
      ...(handoffReceipt ? { handoffReceipt } : {})
    })
    return this.commitAndDeliver({
      input: trustedInput,
      profile,
      scope,
      accepted,
      interpretation,
      plan,
      draft,
      execution,
      ...(durableExecutionId ? { executionId: durableExecutionId } : {}),
      ...(durableExecutionStatus
        ? { executionStatus: durableExecutionStatus }
        : {}),
      ...(durableExecutionStatus === 'RUNNING'
        ? { suppressDelivery: true }
        : {}),
      handoffReceipt,
      ...(commitBaseMemory ? { commitBaseMemory } : {}),
      ...(commitStateVersion !== undefined ? { commitStateVersion } : {}),
      now
    })
  }

  private async resolveTrustedProfile(
    input: ConversationRequest
  ): Promise<ConversationProfile> {
    const profile = await this.#options.profileAuthority.resolve({
      profileId: input.profileId,
      profileVersion: input.profileVersion
    })
    if (
      !profile ||
      profile.id !== input.profileId ||
      profile.version !== input.profileVersion
    ) {
      throw new ConversationError(
        'PROFILE_MISMATCH',
        'Requested profile is not registered by the trusted authority'
      )
    }
    return profile
  }

  private async waitForInFlightClaim(
    claim: ExecutionClaim,
    input: ExecutionClaimInput
  ): Promise<ExecutionClaim> {
    if (claim.kind !== 'IN_FLIGHT') return claim
    const configured =
      this.#options.maxInFlightWaitMs ?? DEFAULT_IN_FLIGHT_WAIT_MS
    const maxWaitMs = Math.min(5_000, Math.max(0, Math.floor(configured)))
    const deadline = Date.now() + maxWaitMs
    let current: ExecutionClaim = claim
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      await new Promise<void>((resolve) =>
        setTimeout(resolve, Math.min(5, remaining))
      )
      current = await this.#options.store.claimExecution(input)
      if (current.kind !== 'IN_FLIGHT') return current
    }
    return current
  }

  private async authenticateApprovalResume(
    scope: ConversationScope,
    memory: WorkingMemory,
    request: ConversationRequest['approvalResume']
  ): Promise<AuthenticatedApprovalResume | false | undefined> {
    if (!request) return undefined
    const pendingApproval = memory.pendingApproval
    const pendingProposal = memory.pendingProposal
    const verifier = this.#options.approval
    if (!pendingApproval || !pendingProposal || !verifier) return false
    try {
      const verified = await verifier.verify({
        scope,
        pendingApproval,
        resume: request
      })
      if (!verified) return false
    } catch {
      return false
    }
    return {
      authenticated: true,
      approvalId: pendingApproval.approvalId,
      proposalHash: pendingApproval.proposalHash,
      operationKey: pendingApproval.operationKey,
      executionId: pendingApproval.executionId
    }
  }

  private async verifyEffectEvidence(
    scope: ConversationScope,
    proposal: Extract<DialoguePlan, { kind: 'EXECUTE_ACTION' }>['proposal'],
    result: HarnessActionResult
  ): Promise<HarnessActionResult> {
    if (!result.effectConfirmed) return result
    const verifier = this.#options.effectEvidence
    if (!verifier) return unverifiedEffect(result)
    try {
      if (
        await verifier.verify({
          scope,
          proposal,
          result
        })
      )
        return result
    } catch {
      /* Treat an unavailable journal as an unknown effect. */
    }
    return unverifiedEffect(result)
  }

  private async recoverStaleExecution(
    scope: ConversationScope,
    proposal: Extract<DialoguePlan, { kind: 'EXECUTE_ACTION' }>['proposal'],
    stale: ExecutionOutcome
  ): Promise<HarnessActionResult> {
    const recover = this.#options.effectEvidence?.recover
    if (recover) {
      try {
        const candidate = await recover({
          scope,
          proposal,
          executionId: stale.executionId
        })
        if (candidate) {
          const normalized = normalizeHarnessResult(candidate, {
            executionId: stale.executionId,
            proposal
          })
          return this.verifyEffectEvidence(scope, proposal, normalized)
        }
      } catch {
        /* Continue to the explicit uncertain terminal result. */
      }
    }
    return {
      status: 'UNCERTAIN',
      executionId: stale.executionId,
      proposalHash: proposal.proposalHash,
      operationKey: proposal.operationKey,
      effectConfirmed: false,
      stopReason: 'STALE_EXECUTION_UNRECOVERED',
      evidenceRefs: [
        `execution:${stale.executionId}:stale`,
        `execution:${stale.executionId}:uncertain`
      ]
    }
  }

  private async executeGoverned(input: {
    readonly identity: TurnRecord['identity']
    readonly context: import('./contracts.ts').ConversationContextSnapshot
    readonly proposal: NonNullable<
      Extract<DialoguePlan, { kind: 'EXECUTE_ACTION' }>['proposal']
    >
    readonly approvalResume?: AuthenticatedApprovalResume
    readonly executionId: import('./contracts.ts').ExecutionId
    readonly input: TurnAcceptanceInput
  }): Promise<HarnessActionResult> {
    if (!this.#options.harness) {
      return {
        status: 'DENIED',
        executionId: input.executionId,
        proposalHash: input.proposal.proposalHash,
        operationKey: input.proposal.operationKey,
        effectConfirmed: false,
        stopReason: 'HARNESS_NOT_CONFIGURED',
        evidenceRefs: [`execution:${input.executionId}:denied`]
      }
    }
    try {
      const result = await this.#options.harness.execute({
        identity: input.identity,
        executionId: input.executionId,
        context: input.context,
        proposal: input.proposal,
        ...(input.approvalResume
          ? { approvalResume: input.approvalResume }
          : {}),
        budget: this.#options.defaultBudget ?? DEFAULT_BUDGET
      })
      return normalizeHarnessResult(result, input)
    } catch {
      return {
        status: 'UNCERTAIN',
        executionId: input.executionId,
        proposalHash: input.proposal.proposalHash,
        operationKey: input.proposal.operationKey,
        effectConfirmed: false,
        stopReason: 'HARNESS_EXCEPTION',
        // Never echo an exception: adapters may include credentials or
        // internal policy details in their error text.
        response: 'governed execution failed',
        evidenceRefs: [`execution:${input.executionId}:uncertain`]
      }
    }
  }

  private async searchKnowledge(
    scope: ConversationScope,
    profile: ConversationProfile,
    query: string
  ) {
    if (!this.#options.knowledge || !profile.knowledge) return []
    try {
      const results = await this.#options.knowledge.search({
        scope,
        query: query.slice(0, 500),
        maxResults: profile.knowledge.maxResults
      })
      const approved = new Set(profile.knowledge.approvedSourceIds)
      if (!Array.isArray(results)) return []
      return results.filter((item) => {
        if (
          !item ||
          typeof item.sourceId !== 'string' ||
          typeof item.version !== 'string' ||
          typeof item.title !== 'string' ||
          typeof item.text !== 'string' ||
          item.approved !== true
        )
          return false
        return (
          approved.has(item.sourceId) &&
          isSafeExternalString(item.sourceId, 200) &&
          isSafeExternalString(item.version, 80) &&
          isSafeExternalString(item.title, 240) &&
          isSafeExternalString(item.text, 4_000) &&
          (item.citation === undefined ||
            isSafeExternalString(item.citation, 240))
        )
      })
    } catch {
      return []
    }
  }

  private async commitAndDeliver(input: {
    readonly input: TurnAcceptanceInput
    readonly profile: ConversationProfile
    readonly scope: ConversationScope
    readonly accepted: Awaited<
      ReturnType<ConversationServiceOptions['store']['acceptTurn']>
    >
    readonly interpretation: import('./contracts.ts').DialogueInterpretation
    readonly plan: DialoguePlan
    readonly draft: import('./contracts.ts').ResponseDraft
    readonly execution: HarnessActionResult | undefined
    readonly executionId?: import('./contracts.ts').ExecutionId | undefined
    readonly executionStatus?: ConversationExecutionStatus | undefined
    readonly suppressDelivery?: boolean | undefined
    readonly handoffReceipt: HandoffReceipt | undefined
    readonly commitBaseMemory?: WorkingMemory | undefined
    readonly commitStateVersion?: number | undefined
    readonly now: string
  }): Promise<ConversationTurnResult> {
    const verification = this.#composer.verify(input.draft, input.profile)
    const draft = verification.accepted
      ? verification.response
      : this.#composer.compose({
          identity: input.accepted.turn.identity,
          profile: input.profile,
          plan: {
            kind: 'ANSWER',
            intent: 'CLARIFY',
            responseIntent: 'GROUNDING_REPAIR',
            memory: input.plan.memory
          },
          memory: input.plan.memory,
          ...(input.handoffReceipt
            ? { handoffReceipt: input.handoffReceipt }
            : {})
        })
    let response: TurnResponse = {
      responseId: draft.responseId,
      deliveryKey: draft.deliveryKey,
      text: draft.text,
      groundingAccepted: verification.accepted,
      deliveryStatus: this.#options.delivery ? 'PENDING' : 'NOT_REQUESTED'
    }
    const conversationStatus = conversationStatusFor(
      input.plan,
      input.execution
    )
    const turnStatus = turnStatusFor(input.plan, input.execution)
    let committed: TurnCommitResult | undefined
    let expectedStateVersion =
      input.commitStateVersion ?? input.accepted.snapshot.stateVersion
    let commitMemory = input.plan.memory
    let baseMemory =
      input.commitBaseMemory ?? input.accepted.snapshot.workingMemory
    const durableExecutionId = input.execution?.executionId ?? input.executionId
    const durableExecutionStatus = input.execution
      ? executionStatusFor(input.execution)
      : input.executionStatus
    for (let attempt = 0; attempt < 64 && !committed; attempt += 1) {
      try {
        committed = await this.#options.store.commitTurn({
          scope: input.scope,
          turnId: input.accepted.turn.identity.turnId,
          idempotencyKey: input.accepted.turn.idempotencyKey,
          expectedStateVersion,
          conversationStatus,
          status: turnStatus,
          ...(durableExecutionStatus
            ? { executionStatus: durableExecutionStatus }
            : {}),
          ...(durableExecutionId ? { executionId: durableExecutionId } : {}),
          memory: commitMemory,
          baseMemory,
          interpretation: input.interpretation,
          planKind: input.plan.kind,
          response,
          now: input.now
        })
      } catch (error) {
        if (
          !(error instanceof ConversationError) ||
          error.code !== 'STATE_CONFLICT'
        )
          throw error
        const latest = await this.#options.store.load(input.scope)
        if (!latest) throw error
        expectedStateVersion = latest.stateVersion
        baseMemory =
          input.commitBaseMemory ?? input.accepted.snapshot.workingMemory
        commitMemory = mergeWorkingMemory(
          latest.workingMemory,
          input.plan.memory,
          baseMemory
        )
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    if (!committed) {
      throw new ConversationError(
        'STATE_CONFLICT',
        'Conversation could not be committed after bounded retries'
      )
    }
    if (input.accepted.replayed) {
      // A duplicate accepted while another worker was processing the same
      // idempotency key must never deliver its local progress draft. If the
      // owner won the race, replay the durable terminal response instead.
      if (committed.turn.response && committed.turn.status !== 'PROCESSING')
        return this.replayTurn(committed.turn, committed.snapshot, input.scope)
      const progressResponse = committed.turn.response ?? response
      return {
        turn: { ...committed.turn, response: progressResponse },
        snapshot: committed.snapshot,
        response: progressResponse,
        replayed: true
      }
    }
    if (input.suppressDelivery) {
      // An in-flight coalesced request may expose progress to its caller, but
      // only the owner (or a later durable replay) may send a response.
      if (committed.turn.response && committed.turn.status !== 'PROCESSING')
        return this.replayTurn(committed.turn, committed.snapshot, input.scope)
      const progressResponse = committed.turn.response ?? response
      return {
        turn: { ...committed.turn, response: progressResponse },
        snapshot: committed.snapshot,
        response: progressResponse,
        replayed: false
      }
    }
    if (this.#options.delivery) {
      try {
        const receipt = await this.#options.delivery.deliver({
          scope: input.scope,
          turnId: committed.turn.identity.turnId,
          responseId: response.responseId,
          deliveryKey: response.deliveryKey,
          text: response.text
        })
        response = { ...response, deliveryStatus: receipt.status }
        const updatedTurn = await this.#options.store.updateDelivery(
          input.scope,
          committed.turn.identity.turnId,
          receipt.status
        )
        committed = { ...committed, turn: updatedTurn }
      } catch {
        response = { ...response, deliveryStatus: 'FAILED' }
        const updatedTurn = await this.#options.store.updateDelivery(
          input.scope,
          committed.turn.identity.turnId,
          'FAILED'
        )
        committed = { ...committed, turn: updatedTurn }
      }
    }
    return {
      turn: { ...committed.turn, response },
      snapshot: committed.snapshot,
      response,
      replayed: false
    }
  }

  private async replayTurn(
    turn: TurnRecord,
    snapshot: import('./contracts.ts').ConversationSnapshot,
    scope: ConversationScope
  ): Promise<ConversationTurnResult> {
    let response = turn.response
    if (!response)
      throw new ConversationError(
        'PERSISTENCE_FAILURE',
        'Replay turn has no response'
      )
    if (this.#options.delivery && response.deliveryStatus !== 'DELIVERED') {
      try {
        const receipt = await this.#options.delivery.deliver({
          scope,
          turnId: turn.identity.turnId,
          responseId: response.responseId,
          deliveryKey: response.deliveryKey,
          text: response.text
        })
        response = { ...response, deliveryStatus: receipt.status }
        turn = await this.#options.store.updateDelivery(
          scope,
          turn.identity.turnId,
          receipt.status
        )
      } catch {
        response = { ...response, deliveryStatus: 'FAILED' }
        turn = await this.#options.store.updateDelivery(
          scope,
          turn.identity.turnId,
          'FAILED'
        )
      }
    }
    return { turn: { ...turn, response }, snapshot, response, replayed: true }
  }
}

export const ConversationServiceImpl = DefaultConversationService

function resolveComposer(
  composer: ConversationServiceOptions['composer']
): import('./contracts.ts').ResponseComposer {
  return composer ?? new DefaultResponseComposer()
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

function toExecutionOutcome(
  result: HarnessActionResult,
  now: string,
  turnId: TurnRecord['identity']['turnId'],
  leaseToken?: string
): ExecutionOutcome {
  const status: ExecutionOutcome['status'] =
    result.status === 'APPROVAL_REQUIRED'
      ? 'WAITING_APPROVAL'
      : result.status === 'SUCCEEDED' && result.effectConfirmed
        ? 'SUCCEEDED'
        : result.status === 'UNCERTAIN'
          ? 'UNCERTAIN'
          : 'FAILED'
  return {
    status,
    turnId,
    executionId: result.executionId,
    proposalHash: result.proposalHash,
    operationKey: result.operationKey,
    ...(result.approvalId ? { approvalId: result.approvalId } : {}),
    effectConfirmed: result.effectConfirmed,
    ...(result.output !== undefined ? { output: result.output } : {}),
    ...(result.response ? { response: result.response } : {}),
    ...(result.stopReason ? { stopReason: result.stopReason } : {}),
    evidenceRefs: result.evidenceRefs,
    recordedAt: now,
    ...(leaseToken ? { leaseToken } : {})
  }
}

function outcomeToHarnessResult(
  outcome: ExecutionOutcome
): HarnessActionResult {
  return {
    status:
      outcome.status === 'WAITING_APPROVAL'
        ? 'APPROVAL_REQUIRED'
        : outcome.status === 'SUCCEEDED'
          ? 'SUCCEEDED'
          : outcome.status === 'UNCERTAIN'
            ? 'UNCERTAIN'
            : 'FAILED',
    executionId: outcome.executionId,
    ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
    proposalHash: outcome.proposalHash,
    operationKey: outcome.operationKey,
    effectConfirmed: outcome.effectConfirmed,
    ...(outcome.output !== undefined ? { output: outcome.output } : {}),
    ...(outcome.response ? { response: outcome.response } : {}),
    ...(outcome.stopReason ? { stopReason: outcome.stopReason } : {}),
    evidenceRefs: outcome.evidenceRefs
  }
}

function memoryAfterExecution(
  memory: WorkingMemory,
  proposal: Extract<DialoguePlan, { kind: 'EXECUTE_ACTION' }>['proposal'],
  outcome: ExecutionOutcome,
  now: string,
  profile: ConversationProfile
): WorkingMemory {
  let next = applyExecution(memory, proposal, outcome, now)
  const resultEntityKey = profile.capabilities.find(
    (capability) =>
      capability.id === proposal.capabilityId &&
      capability.version === proposal.capabilityVersion &&
      capability.action === proposal.action
  )?.resultEntityKey
  if (
    outcome.status === 'SUCCEEDED' &&
    outcome.output &&
    !Array.isArray(outcome.output) &&
    resultEntityKey &&
    resultEntityKey.length <= 80
  ) {
    const resultValue = (
      outcome.output as {
        readonly [key: string]: import('./contracts.ts').ConversationJsonValue
      }
    )[resultEntityKey]
    if (resultValue !== undefined && isSafeExternalJson(resultValue)) {
      next = recordSystemEntity(next, {
        key: resultEntityKey,
        value: resultValue,
        turnId: proposal.createdTurnId,
        now
      })
    }
  }
  if (
    proposal.action === 'READ' &&
    outcome.status === 'SUCCEEDED' &&
    outcome.output
  ) {
    const options = parseReferenceOptions(outcome.output)
    if (options.length > 0) next = withOptions(next, options)
  }
  return next
}

function parseReferenceOptions(
  output: import('./contracts.ts').ConversationJsonValue
): import('./contracts.ts').ReferenceCandidate[] {
  if (!Array.isArray(output)) return []
  const result: import('./contracts.ts').ReferenceCandidate[] = []
  for (const item of output.slice(0, 8)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item))
      continue
    const id = item.id
    const label = item.label
    const value = item.value
    const sourceRef = item.sourceRef
    if (
      isSafeExternalString(id, 160) &&
      isSafeExternalString(label, 240) &&
      isSafeExternalString(sourceRef, 240) &&
      value !== undefined &&
      isSafeExternalJson(value)
    ) {
      result.push({ id, label, value, sourceRef, status: 'ELIGIBLE' })
    }
  }
  return result
}

function isConversationJsonValue(
  value: unknown,
  depth = 0
): value is import('./contracts.ts').ConversationJsonValue {
  if (depth > 6) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value))
    return (
      value.length <= 32 &&
      value.every((item) => isConversationJsonValue(item, depth + 1))
    )
  if (typeof value === 'object') {
    return (
      Object.entries(value).length <= 32 &&
      Object.entries(value).every(
        ([key, item]) =>
          key.length <= 80 && isConversationJsonValue(item, depth + 1)
      )
    )
  }
  return false
}

function isSafeExternalString(
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

/** Harness and knowledge output are data only; reject instruction-like data recursively. */
function isSafeExternalJson(
  value: unknown,
  depth = 0
): value is import('./contracts.ts').ConversationJsonValue {
  if (!isConversationJsonValue(value, depth)) return false
  if (hasForbiddenMemoryContent(value)) return false
  if (typeof value === 'string')
    return value.length <= 4_000 && !hasUntrustedInstructionContent(value)
  if (Array.isArray(value))
    return value.every((item) => isSafeExternalJson(item, depth + 1))
  if (typeof value === 'object' && value !== null)
    return Object.entries(value).every(
      ([key, item]) =>
        isSafeExternalString(key, 80) && isSafeExternalJson(item, depth + 1)
    )
  return true
}

function normalizeHarnessResult(
  candidate: unknown,
  input: {
    readonly executionId: import('./contracts.ts').ExecutionId
    readonly proposal: NonNullable<
      Extract<DialoguePlan, { kind: 'EXECUTE_ACTION' }>['proposal']
    >
  }
): HarnessActionResult {
  const invalid = (reason: string): HarnessActionResult => ({
    status: 'UNCERTAIN',
    executionId: input.executionId,
    proposalHash: input.proposal.proposalHash,
    operationKey: input.proposal.operationKey,
    effectConfirmed: false,
    stopReason: reason,
    evidenceRefs: [`execution:${input.executionId}:invalid_result`]
  })
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return invalid('INVALID_HARNESS_RESULT')
  }
  const result = candidate as Record<string, unknown>
  const statuses = new Set([
    'SUCCEEDED',
    'APPROVAL_REQUIRED',
    'DENIED',
    'FAILED',
    'UNCERTAIN'
  ])
  if (!statuses.has(result.status as string))
    return invalid('INVALID_HARNESS_STATUS')
  if (String(result.executionId) !== String(input.executionId))
    return invalid('HARNESS_EXECUTION_ID_MISMATCH')
  if (result.proposalHash !== input.proposal.proposalHash)
    return invalid('HARNESS_PROPOSAL_HASH_MISMATCH')
  if (result.operationKey !== input.proposal.operationKey)
    return invalid('HARNESS_OPERATION_KEY_MISMATCH')
  if (typeof result.effectConfirmed !== 'boolean')
    return invalid('HARNESS_EFFECT_FLAG_INVALID')
  const evidenceRefs = result.evidenceRefs
  if (
    !Array.isArray(evidenceRefs) ||
    evidenceRefs.length > 32 ||
    evidenceRefs.some((ref) => !isSafeExternalString(ref, 200))
  ) {
    return invalid('HARNESS_EVIDENCE_INVALID')
  }
  if (
    result.response !== undefined &&
    !isSafeExternalString(result.response, 500)
  ) {
    return invalid('HARNESS_RESPONSE_INVALID')
  }
  if (
    result.approvalId !== undefined &&
    !isSafeExternalString(result.approvalId, 200)
  ) {
    return invalid('HARNESS_APPROVAL_ID_INVALID')
  }
  if (
    result.stopReason !== undefined &&
    !isSafeExternalString(result.stopReason, 120)
  ) {
    return invalid('HARNESS_STOP_REASON_INVALID')
  }
  if (
    result.output !== undefined &&
    (!isSafeExternalJson(result.output) || !isBoundedJson(result.output))
  ) {
    return invalid(
      !isSafeExternalJson(result.output)
        ? 'HARNESS_OUTPUT_UNSAFE_CONTENT'
        : 'HARNESS_OUTPUT_INVALID'
    )
  }
  if (
    result.status === 'APPROVAL_REQUIRED' &&
    (typeof result.approvalId !== 'string' || result.effectConfirmed)
  ) {
    return invalid('HARNESS_APPROVAL_RESULT_INVALID')
  }
  if (
    result.effectConfirmed &&
    (result.status !== 'SUCCEEDED' ||
      !evidenceRefs.some((ref) => ref.startsWith('effect:')))
  ) {
    return invalid('HARNESS_EFFECT_EVIDENCE_INVALID')
  }
  if (result.status === 'SUCCEEDED' && result.effectConfirmed === false) {
    return invalid('HARNESS_SUCCESS_WITHOUT_EFFECT')
  }
  return {
    status: result.status as HarnessActionResult['status'],
    executionId: input.executionId,
    ...(result.approvalId ? { approvalId: result.approvalId } : {}),
    proposalHash: input.proposal.proposalHash,
    operationKey: input.proposal.operationKey,
    effectConfirmed: result.effectConfirmed,
    ...(result.output !== undefined
      ? {
          output:
            result.output as import('./contracts.ts').ConversationJsonValue
        }
      : {}),
    ...(typeof result.response === 'string'
      ? { response: result.response }
      : {}),
    ...(typeof result.stopReason === 'string'
      ? { stopReason: result.stopReason }
      : {}),
    evidenceRefs: evidenceRefs as string[]
  }
}

function unverifiedEffect(result: HarnessActionResult): HarnessActionResult {
  return {
    status: 'UNCERTAIN',
    executionId: result.executionId,
    proposalHash: result.proposalHash,
    operationKey: result.operationKey,
    effectConfirmed: false,
    stopReason: 'EFFECT_EVIDENCE_UNVERIFIED',
    evidenceRefs: [
      ...result.evidenceRefs.filter((ref) => !ref.startsWith('effect:')),
      `execution:${result.executionId}:effect_unverified`
    ].slice(0, 32)
  }
}

function isBoundedJson(
  value: import('./contracts.ts').ConversationJsonValue
): boolean {
  try {
    return JSON.stringify(value).length <= 16_000
  } catch {
    return false
  }
}

function executionStatusFor(
  result: HarnessActionResult
): ConversationExecutionStatus {
  if (result.status === 'APPROVAL_REQUIRED') return 'WAITING_APPROVAL'
  if (result.status === 'SUCCEEDED' && result.effectConfirmed)
    return 'SUCCEEDED'
  if (result.status === 'UNCERTAIN') return 'UNCERTAIN'
  return 'FAILED'
}

function conversationStatusFor(
  plan: DialoguePlan,
  execution: HarnessActionResult | undefined
) {
  switch (plan.kind) {
    case 'STOP':
      return 'CANCELLED' as const
    case 'HANDOFF':
      return 'HANDOFF' as const
    case 'ASK_USER':
    case 'PROPOSE_ACTION':
      return 'WAITING_USER' as const
    case 'WAIT_APPROVAL':
      return 'WAITING_APPROVAL' as const
    case 'ANSWER':
      return 'ACTIVE' as const
    case 'EXECUTE_ACTION':
      if (execution?.status === 'APPROVAL_REQUIRED')
        return 'WAITING_APPROVAL' as const
      if (execution?.status === 'SUCCEEDED' && execution.effectConfirmed)
        // A completed goal is part of the conversation memory. The session
        // remains active so a later turn may open a new goal.
        return 'ACTIVE' as const
      return 'ACTIVE' as const
    default:
      return 'ACTIVE' as const
  }
}

function turnStatusFor(
  plan: DialoguePlan,
  execution: HarnessActionResult | undefined
) {
  switch (plan.kind) {
    case 'STOP':
      return 'CANCELLED' as const
    case 'HANDOFF':
      return 'HANDOFF' as const
    case 'ASK_USER':
    case 'PROPOSE_ACTION':
      return 'WAITING_USER' as const
    case 'WAIT_APPROVAL':
      return 'WAITING_APPROVAL' as const
    case 'ANSWER':
      return plan.responseIntent === 'ACTION_IN_FLIGHT'
        ? ('PROCESSING' as const)
        : ('COMPLETED' as const)
    case 'EXECUTE_ACTION':
      if (execution?.status === 'APPROVAL_REQUIRED')
        return 'WAITING_APPROVAL' as const
      if (execution?.status === 'SUCCEEDED' && execution.effectConfirmed)
        return 'COMPLETED' as const
      return 'FAILED' as const
    default:
      return 'COMPLETED' as const
  }
}
