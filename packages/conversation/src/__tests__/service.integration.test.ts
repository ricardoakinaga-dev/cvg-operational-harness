import { describe, expect, it, vi } from 'vitest'
import { InMemoryEffectJournal } from '@cvg/harness'
import {
  DefaultConversationService,
  DefaultResponseComposer,
  InMemoryConversationStore,
  InMemoryResponseDelivery,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asExecutionId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  createEffectJournalEvidenceVerifier,
  type ConversationHarness,
  type ExecutionAuthorizationInput,
  type ExecutionClaimInput,
  type ExecutionOutcome,
  type HarnessActionRequest,
  type HarnessActionResult,
  type TurnAcceptanceInput
} from '../index.ts'
import { createSyntheticServiceDeskProfile } from '../../../../examples/phase4a/profiles.ts'

const profile = createSyntheticServiceDeskProfile()
const profileAuthority = createStaticConversationProfileAuthority([profile])
const tenantId = asTenantId('tenant_00000000-0000-4000-8000-000000000401')
const conversationId = asConversationId('conversation_401')
const sessionId = asSessionId('session_401')

function input(
  text: string,
  number: number,
  overrides: Partial<TurnAcceptanceInput> = {}
): TurnAcceptanceInput {
  return {
    tenantId,
    conversationId,
    sessionId,
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId(`turn_${number}`),
    messageId: asMessageId(`message_${number}`),
    correlationId: asCorrelationId(`correlation_${number}`),
    text,
    idempotencyKey: `idempotency-${number}`,
    receivedAt: `2026-09-17T00:00:${String(number).padStart(2, '0')}.000Z`,
    profile,
    ...overrides
  }
}

function harnessFor(options: { readonly delayMs?: number } = {}): {
  readonly harness: ConversationHarness
  readonly calls: HarnessActionRequest[]
} {
  const calls: HarnessActionRequest[] = []
  const harness: ConversationHarness = {
    async execute(request) {
      calls.push(request)
      if (options.delayMs)
        await new Promise((resolve) => setTimeout(resolve, options.delayMs))
      const isRead = request.proposal.action === 'READ'
      return {
        status: isRead
          ? 'SUCCEEDED'
          : calls.filter((item) => item.proposal.action !== 'READ').length === 1
            ? 'APPROVAL_REQUIRED'
            : 'SUCCEEDED',
        executionId: request.executionId,
        ...(isRead ||
        calls.filter((item) => item.proposal.action !== 'READ').length === 1
          ? {}
          : {}),
        ...(request.proposal.action !== 'READ' &&
        calls.filter((item) => item.proposal.action !== 'READ').length === 1
          ? { approvalId: 'approval_401' }
          : {}),
        proposalHash: request.proposal.proposalHash,
        operationKey: request.proposal.operationKey,
        effectConfirmed:
          isRead ||
          calls.filter((item) => item.proposal.action !== 'READ').length > 1,
        output: isRead
          ? [
              {
                id: 'slot-1',
                label: 'Room Blue at 09:00',
                value: { date: 'friday', time: '09:00', room: 'Blue' },
                sourceRef: 'synthetic:availability:1'
              },
              {
                id: 'slot-2',
                label: 'Room Green at 10:00',
                value: { date: 'friday', time: '10:00', room: 'Green' },
                sourceRef: 'synthetic:availability:2'
              }
            ]
          : undefined,
        evidenceRefs: [
          `synthetic:${request.proposal.capabilityId}`,
          `effect:${request.executionId}`
        ]
      } as HarnessActionResult
    }
  }
  return { harness, calls }
}

function serviceFor(
  harness: ConversationHarness,
  store = new InMemoryConversationStore(),
  options: {
    readonly maxInFlightWaitMs?: number
    readonly delivery?: InMemoryResponseDelivery
  } = {}
) {
  return new DefaultConversationService({
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
    effectEvidence: { verify: async () => true },
    delivery: options.delivery ?? new InMemoryResponseDelivery(),
    ...options
  })
}

class ClaimGateStore extends InMemoryConversationStore {
  readonly claimStarted: Promise<void>
  readonly #released: Promise<void>
  #armed = false
  #resolveClaimStarted!: () => void
  #resolveReleased!: () => void

  constructor() {
    super()
    this.claimStarted = new Promise((resolve) => {
      this.#resolveClaimStarted = resolve
    })
    this.#released = new Promise((resolve) => {
      this.#resolveReleased = resolve
    })
  }

  releaseClaim(): void {
    this.#resolveReleased()
  }

  armClaim(): void {
    this.#armed = true
  }

  override async claimExecution(input: ExecutionClaimInput) {
    if (!this.#armed) return super.claimExecution(input)
    this.#armed = false
    this.#resolveClaimStarted()
    await this.#released
    return super.claimExecution(input)
  }
}

class AuthorizationGateStore extends InMemoryConversationStore {
  readonly authorizationStarted: Promise<void>
  readonly #released: Promise<void>
  #armed = false
  #resolveAuthorizationStarted!: () => void
  #resolveReleased!: () => void

  constructor() {
    super()
    this.authorizationStarted = new Promise((resolve) => {
      this.#resolveAuthorizationStarted = resolve
    })
    this.#released = new Promise((resolve) => {
      this.#resolveReleased = resolve
    })
  }

  armAuthorization(): void {
    this.#armed = true
  }

  releaseAuthorization(): void {
    this.#resolveReleased()
  }

  override async authorizeExecution(input: ExecutionAuthorizationInput) {
    if (!this.#armed) return super.authorizeExecution(input)
    this.#armed = false
    this.#resolveAuthorizationStarted()
    await this.#released
    return super.authorizeExecution(input)
  }
}

describe('Phase 4A conversation service', () => {
  it('resolves the profile from the trusted authority without a transport profile', async () => {
    const fixture = harnessFor()
    const service = serviceFor(fixture.harness)
    const { profile: transportProfile, ...request } = input(
      'show availability for Friday',
      597
    )

    const result = await service.runTurn(request)

    expect(transportProfile).toBe(profile)
    expect(result.response.groundingAccepted).toBe(true)
    expect(result.turn.identity.profileId).toBe(profile.id)
    expect(fixture.calls).toHaveLength(1)
  })

  it('keeps transport approval proof out of the persisted in-memory scope', async () => {
    const store = new InMemoryConversationStore()
    const accepted = await store.acceptTurn(
      input('approval callback', 599, {
        approvalResume: {
          authenticated: true,
          approvalId: 'approval-transport-only',
          proposalHash: 'a'.repeat(64),
          operationKey: 'conversation:transport-only',
          proof: 'opaque-secret-proof'
        }
      })
    )

    expect(accepted.snapshot.scope).toEqual({
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    })
    expect(accepted.snapshot.scope).not.toHaveProperty('approvalResume')
    expect(JSON.stringify(accepted.snapshot)).not.toContain(
      'opaque-secret-proof'
    )
  })

  it('releases an approval lease and rejects late finalization in memory', async () => {
    const store = new InMemoryConversationStore()
    const service = serviceFor(harnessFor().harness, store)
    const proposed = await service.runTurn(
      input('reserve Friday at 10 in room Blue', 598)
    )
    const proposal = proposed.snapshot.workingMemory.pendingProposal
    if (!proposal) throw new Error('expected a proposal')
    const scope = {
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    }
    const executionId = asExecutionId('execution-approval-lease')
    const claim = await store.claimExecution({
      scope,
      proposal,
      turnId: proposed.turn.identity.turnId,
      executionId,
      expectedStateVersion: proposed.snapshot.stateVersion
    })
    expect(claim.kind).toBe('EXECUTE')
    if (claim.kind !== 'EXECUTE') return

    const approvalOutcome: ExecutionOutcome = {
      status: 'WAITING_APPROVAL',
      turnId: proposed.turn.identity.turnId,
      executionId,
      proposalHash: proposal.proposalHash,
      operationKey: proposal.operationKey,
      approvalId: 'approval-lease',
      effectConfirmed: false,
      evidenceRefs: ['execution:approval-required'],
      recordedAt: '2026-09-17T00:00:00.000Z',
      leaseToken: claim.leaseToken
    }
    await store.finalizeExecution(scope, approvalOutcome)

    const waiting = await store.claimExecution({
      scope,
      proposal,
      turnId: proposed.turn.identity.turnId,
      executionId,
      expectedStateVersion: proposed.snapshot.stateVersion
    })
    expect(waiting.kind).toBe('WAITING_APPROVAL')
    if (waiting.kind !== 'WAITING_APPROVAL') return
    expect(waiting.outcome.leaseToken).toBeUndefined()
    expect(waiting.outcome.leaseUntil).toBeUndefined()

    await expect(
      store.finalizeExecution(scope, {
        ...approvalOutcome,
        status: 'UNCERTAIN',
        evidenceRefs: ['execution:late-finalization']
      })
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  })

  it('uses the governed action port and replays a duplicate message without a second effect', async () => {
    const fixture = harnessFor()
    const service = serviceFor(fixture.harness)
    const request = input('show availability for Friday', 1)
    const first = await service.runTurn(request)
    const replay = await service.runTurn(request)

    expect(first.response.groundingAccepted).toBe(true)
    expect(first.response.text).toContain('concluída')
    expect(first.turn.identity.executionId).toBeDefined()
    expect(replay.replayed).toBe(true)
    expect(fixture.calls).toHaveLength(1)
    expect(replay.response.responseId).toBe(first.response.responseId)
  })

  it('shows a proposal, keeps natural-language assent below approval, and accepts only a bound approval resume', async () => {
    const fixture = harnessFor()
    const store = new InMemoryConversationStore()
    const service = serviceFor(fixture.harness, store)
    const proposal = await service.runTurn(
      input('reserve Friday at 10 in room Blue', 2)
    )
    expect(proposal.turn.status).toBe('WAITING_USER')
    expect(proposal.response.text).toContain('criação da reserva')
    expect(proposal.response.text).not.toContain('ação sintética create')
    expect(fixture.calls).toHaveLength(0)

    const approvalRequest = await service.runTurn(input('yes', 3))
    expect(approvalRequest.turn.status).toBe('WAITING_APPROVAL')
    expect(approvalRequest.response.text).toContain('aguarda')
    expect(fixture.calls).toHaveLength(1)

    const naturalAssent = await service.runTurn(input('yes', 4))
    expect(naturalAssent.turn.status).toBe('WAITING_APPROVAL')
    expect(fixture.calls).toHaveLength(1)

    const snapshot = await service.inspect({
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    })
    const pending = snapshot?.workingMemory.pendingApproval
    expect(pending).toBeDefined()
    const resumed = await service.runTurn(
      input('approval callback', 5, {
        approvalResume: {
          authenticated: true,
          approvalId: pending?.approvalId ?? '',
          proposalHash: pending?.proposalHash ?? '',
          operationKey: pending?.operationKey ?? '',
          executionId: pending?.executionId,
          proof: 'synthetic-authority-proof'
        }
      })
    )
    expect(resumed.response.text).toContain('concluída')
    expect(resumed.turn.executionStatus).toBe('SUCCEEDED')
    expect(fixture.calls).toHaveLength(2)
  })

  it('invalidates a proposal when a referenced fact is corrected', async () => {
    const fixture = harnessFor()
    const service = serviceFor(fixture.harness)
    await service.runTurn(input('reserve Monday at 10 in room Blue', 6))
    const corrected = await service.runTurn(input('actually Friday', 7))
    const snapshot = await service.inspect({
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    })

    expect(corrected.response.text).toContain('Atualizei')
    expect(snapshot?.workingMemory.pendingApproval).toBeUndefined()
    expect(
      snapshot?.workingMemory.invalidatedProposalIds.length
    ).toBeGreaterThan(0)
    expect(fixture.calls).toHaveLength(0)
  })

  it('fences a pending approval when correction wins before the resume claim', async () => {
    const fixture = harnessFor()
    const store = new ClaimGateStore()
    const service = serviceFor(fixture.harness, store)
    await service.runTurn(input('reserve Monday at 10 in room Blue', 500))
    const approval = await service.runTurn(input('yes', 501))
    const pending = approval.snapshot.workingMemory.pendingApproval
    if (!pending) throw new Error('expected a pending approval')

    store.armClaim()
    const resume = service.runTurn(
      input('approval callback', 502, {
        approvalResume: {
          authenticated: true,
          approvalId: pending.approvalId,
          proposalHash: pending.proposalHash,
          operationKey: pending.operationKey,
          executionId: pending.executionId,
          proof: 'synthetic-authority-proof'
        }
      })
    )
    await store.claimStarted
    const corrected = await service.runTurn(input('actually Friday', 503))
    store.releaseClaim()
    const staleResume = await resume

    expect(corrected.response.text).toContain('Atualizei')
    expect(staleResume.response.text).toContain('proposta mudou')
    expect(staleResume.turn.executionStatus).toBeUndefined()
    expect(fixture.calls).toHaveLength(1)
    expect(
      (
        await service.inspect({
          tenantId,
          conversationId,
          sessionId,
          profileId: profile.id,
          profileVersion: profile.version
        })
      )?.workingMemory.pendingProposal?.status
    ).toBe('INVALIDATED')
  })

  it('fences an action when correction wins after claim but before effect authorization', async () => {
    const fixture = harnessFor()
    const store = new AuthorizationGateStore()
    const service = serviceFor(fixture.harness, store)
    const scope = {
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    }

    store.armAuthorization()
    const action = service.runTurn(input('show availability for Monday', 504))
    await store.authorizationStarted
    expect(store.executionCount(scope)).toBe(1)

    const corrected = await service.runTurn(input('actually Friday', 505))
    store.releaseAuthorization()
    const stale = await action

    expect(corrected.response.text).toContain('Atualizei')
    expect(stale.response.text).toContain('proposta mudou')
    expect(stale.turn.executionStatus).toBeUndefined()
    expect(fixture.calls).toHaveLength(0)
  })

  it('replans a completed availability goal after a date correction without replaying its old effect', async () => {
    const fixture = harnessFor()
    const service = serviceFor(fixture.harness)
    const first = await service.runTurn(
      input('show availability for Monday', 9)
    )
    const oldProposal = first.snapshot.workingMemory.pendingProposal
    const corrected = await service.runTurn(input('actually Friday', 10))

    expect(first.turn.planKind).toBe('EXECUTE_ACTION')
    expect(corrected.turn.planKind).toBe('EXECUTE_ACTION')
    expect(corrected.response.groundingAccepted).toBe(true)
    expect(corrected.snapshot.workingMemory.pendingProposal?.proposalId).toBe(
      'proposal_turn_10'
    )
    expect(corrected.snapshot.workingMemory.pendingProposal?.status).toBe(
      'EXECUTED'
    )
    expect(
      corrected.snapshot.workingMemory.pendingProposal?.proposalHash
    ).not.toBe(oldProposal?.proposalHash)
    expect(fixture.calls).toHaveLength(2)
  })

  it('fails closed on malformed model output before any Harness call', async () => {
    const fixture = harnessFor()
    const interpreter = new RulesFirstDialogueInterpreter({
      model: {
        interpret: async () => ({ intent: 'CREATE', policyDecision: 'ALLOW' })
      }
    })
    const service = new DefaultConversationService({
      store: new InMemoryConversationStore(),
      profileAuthority,
      interpreter,
      harness: fixture.harness
    })
    const result = await service.runTurn(input('unclassified request', 8))

    expect(result.turn.planKind).toBe('ANSWER')
    expect(fixture.calls).toHaveLength(0)
  })

  it('serializes twenty identical operation claims and permits one governed call', async () => {
    const fixture = harnessFor({ delayMs: 5 })
    const service = serviceFor(fixture.harness)
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        service.runTurn(input('show availability for Friday', 100 + index))
      )
    )

    expect(fixture.calls).toHaveLength(1)
    expect(results.every((result) => result.response.groundingAccepted)).toBe(
      true
    )
    expect(
      new Set(
        results.map((result) => result.snapshot.workingMemory.options.length)
      )
    ).toEqual(new Set([2]))
  })

  it('keeps an in-flight duplicate retryable until the governed outcome is durable', async () => {
    const fixture = harnessFor({ delayMs: 400 })
    const sent: string[] = []
    const service = serviceFor(
      fixture.harness,
      new InMemoryConversationStore(),
      {
        maxInFlightWaitMs: 250,
        delivery: new InMemoryResponseDelivery({
          send: async ({ text }) => {
            sent.push(text)
          }
        })
      }
    )
    const first = service.runTurn(input('show availability for Friday', 600))
    await vi.waitFor(() => expect(fixture.calls).toHaveLength(1))
    const duplicate = service.runTurn(
      input('show availability for Friday', 601)
    )

    const [firstResult, duplicateResult] = await Promise.all([first, duplicate])

    expect(firstResult.turn.status).toBe('COMPLETED')
    expect(duplicateResult.turn.status).toBe('PROCESSING')
    expect(duplicateResult.turn.executionStatus).toBe('RUNNING')
    expect(duplicateResult.response.text).toContain('processamento')
    expect(fixture.calls).toHaveLength(1)
    expect(sent).toEqual([firstResult.response.text])

    const retried = await service.runTurn(
      input('show availability for Friday', 601)
    )

    expect(retried.turn.status).toBe('COMPLETED')
    expect(retried.turn.executionStatus).toBe('SUCCEEDED')
    expect(retried.response.text).toContain('concluída')
    expect(fixture.calls).toHaveLength(1)
  })

  it('rejects a forged success claim at the response boundary', () => {
    const composer = new DefaultResponseComposer()
    const result = composer.verify({
      responseId: 'response_forged',
      deliveryKey: 'delivery:forged',
      text: 'The action completed successfully.',
      claims: [
        {
          text: 'The action completed successfully.',
          sourceRefs: ['state:forged'],
          kind: 'STATUS',
          successClaim: true
        }
      ],
      sources: [{ kind: 'SYSTEM_STATE', ref: 'state:forged' }]
    })
    expect(result.accepted).toBe(false)
  })

  it('recovers a stale claim from the existing effect journal without re-executing', async () => {
    const store = new InMemoryConversationStore({ executionLeaseMs: 0 })
    const journal = new InMemoryEffectJournal()
    const execute = vi.fn()
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter(),
      harness: { execute },
      effectEvidence: createEffectJournalEvidenceVerifier(journal)
    })
    const proposalTurn = await service.runTurn(
      input('reserve Friday at 10 in room Blue', 300)
    )
    const proposal = proposalTurn.snapshot.workingMemory.pendingProposal
    if (!proposal) throw new Error('expected a draft proposal')
    const scope = {
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    }
    const executionId = asExecutionId('execution-recovery')
    await store.claimExecution({
      scope,
      proposal,
      turnId: proposalTurn.turn.identity.turnId,
      executionId,
      expectedStateVersion: proposalTurn.snapshot.stateVersion
    })
    await journal.reserve({
      tenantId: String(tenantId),
      operationKey: proposal.operationKey,
      proposalHash: proposal.proposalHash,
      attemptId: String(executionId)
    })
    await journal.markStarted({
      tenantId: String(tenantId),
      operationKey: proposal.operationKey,
      attemptId: String(executionId)
    })
    await journal.confirm({
      tenantId: String(tenantId),
      operationKey: proposal.operationKey,
      attemptId: String(executionId),
      result: { synthetic: true }
    })

    const recovered = await service.runTurn(input('sim', 301))

    expect(execute).not.toHaveBeenCalled()
    expect(recovered.turn.executionStatus).toBe('SUCCEEDED')
    expect(recovered.response.text).toContain('confirmação do efeito')
  })

  it('terminates an unrecoverable stale claim as uncertain without retrying an unknown effect', async () => {
    const store = new InMemoryConversationStore({ executionLeaseMs: 0 })
    const execute = vi.fn()
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter(),
      harness: { execute }
    })
    const proposalTurn = await service.runTurn(
      input('reserve Monday at 11 in room Green', 302)
    )
    const proposal = proposalTurn.snapshot.workingMemory.pendingProposal
    if (!proposal) throw new Error('expected a draft proposal')
    await store.claimExecution({
      scope: {
        tenantId,
        conversationId,
        sessionId,
        profileId: profile.id,
        profileVersion: profile.version
      },
      proposal,
      turnId: proposalTurn.turn.identity.turnId,
      executionId: asExecutionId('execution-unknown-recovery'),
      expectedStateVersion: proposalTurn.snapshot.stateVersion
    })

    const result = await service.runTurn(input('sim', 303))

    expect(execute).not.toHaveBeenCalled()
    expect(result.turn.executionStatus).toBe('UNCERTAIN')
    expect(result.response.text).toContain('incerto')
  })

  it('fences a late finalization after an expired execution lease is reclaimed', async () => {
    const store = new InMemoryConversationStore({ executionLeaseMs: 0 })
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter()
    })
    const proposalTurn = await service.runTurn(
      input('reserve Friday at 10 in room Blue', 304)
    )
    const proposal = proposalTurn.snapshot.workingMemory.pendingProposal
    if (!proposal) throw new Error('expected a draft proposal')
    const scope = {
      tenantId,
      conversationId,
      sessionId,
      profileId: profile.id,
      profileVersion: profile.version
    }
    const first = await store.claimExecution({
      scope,
      proposal,
      turnId: proposalTurn.turn.identity.turnId,
      executionId: asExecutionId('execution-lease-first'),
      expectedStateVersion: proposalTurn.snapshot.stateVersion
    })
    const reclaimed = await store.claimExecution({
      scope,
      proposal,
      turnId: proposalTurn.turn.identity.turnId,
      executionId: asExecutionId('execution-lease-second'),
      expectedStateVersion: proposalTurn.snapshot.stateVersion
    })
    expect(first.kind).toBe('EXECUTE')
    expect(reclaimed.kind).toBe('STALE')
    if (first.kind !== 'EXECUTE' || reclaimed.kind !== 'STALE') return

    const oldOutcome: ExecutionOutcome = {
      status: 'UNCERTAIN',
      turnId: proposalTurn.turn.identity.turnId,
      executionId: asExecutionId('execution-lease-first'),
      proposalHash: proposal.proposalHash,
      operationKey: proposal.operationKey,
      effectConfirmed: false,
      evidenceRefs: ['execution:late-worker'],
      recordedAt: '2026-09-17T00:00:00.000Z',
      leaseToken: first.leaseToken
    }
    await expect(
      store.finalizeExecution(scope, {
        ...oldOutcome,
        turnId: asTurnId('turn-lease-wrong-owner')
      })
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
    await expect(
      store.finalizeExecution(scope, oldOutcome)
    ).rejects.toMatchObject({
      code: 'STATE_CONFLICT'
    })

    await store.finalizeExecution(scope, {
      ...oldOutcome,
      executionId: reclaimed.outcome.executionId,
      evidenceRefs: ['execution:reclaimed-worker'],
      leaseToken: reclaimed.outcome.leaseToken
    })
  })
})
