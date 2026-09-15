import {
  approvalMatchesAction,
  type ApprovalAuthority,
  type ApprovalRecord
} from '@cvg/approval-engine'
import type {
  ApprovalDecision,
  ApprovalEngine,
  ApprovalId,
  ApprovalExecutionHandle,
  ApprovalExecutionPort,
  ApprovalExecutionRequest,
  ApprovalRequest
} from '@cvg/harness-contracts'

export interface DurableApprovalAdapterOptions {
  readonly defaultOperatorId?: string
  readonly defaultPolicyVersion?: string
}

/**
 * Bridges the neutral harness approval port to the durable ApprovalAuthority.
 * The authority remains the only state-machine decision maker; this adapter
 * only performs idempotent lookup, canonical binding checks, and translation
 * to the neutral runtime contract.
 */
export class DurableApprovalEngineAdapter implements ApprovalEngine {
  private readonly defaultOperatorId: string
  private readonly defaultPolicyVersion: string
  private readonly requestLocks = new Map<string, Promise<void>>()

  public readonly execution: ApprovalExecutionPort = {
    begin: (request) => this.beginExecution(request),
    complete: (input) => this.completeExecution(input),
    fail: (input) => this.failExecution(input),
    uncertain: (input) => this.markUncertain(input)
  }

  public constructor(
    public readonly authority: ApprovalAuthority,
    options: DurableApprovalAdapterOptions = {}
  ) {
    this.defaultOperatorId = options.defaultOperatorId ?? 'system.execution'
    this.defaultPolicyVersion = options.defaultPolicyVersion ?? 'unknown'
  }

  public async request(input: ApprovalRequest): Promise<ApprovalDecision> {
    const lockKey = [
      input.tenantId,
      input.executionRef ?? '',
      input.operationKey
    ].join('\u0000')
    const previous = this.requestLocks.get(lockKey) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
    })
    const chain = previous.then(() => current)
    this.requestLocks.set(lockKey, chain)
    await previous
    try {
      return await this.requestUnserialized(input)
    } finally {
      release()
      if (this.requestLocks.get(lockKey) === chain) {
        this.requestLocks.delete(lockKey)
      }
    }
  }

  private async requestUnserialized(
    input: ApprovalRequest
  ): Promise<ApprovalDecision> {
    if (!input.executionRef) {
      throw new Error(
        'Durable operational approval requires an execution reference.'
      )
    }
    const operatorId = input.operatorId ?? this.defaultOperatorId
    const agentVersion = input.agentVersion ?? 'unknown'
    const action = input.action ?? 'tool.execute'
    const resource = input.resource ?? { type: 'tool', id: input.toolId }
    const payload = input.payload ?? {
      operationKey: input.operationKey,
      toolId: input.toolId,
      summary: input.summary
    }
    const policyVersion = input.policyVersion ?? this.defaultPolicyVersion
    const existing = await this.findBoundApproval({
      input,
      action,
      resource,
      payload,
      agentVersion,
      policyVersion
    })

    if (existing) return this.toDecision(existing)

    try {
      const created = await this.authority.request({
        tenantId: input.tenantId,
        operatorId,
        agentId: input.agentId,
        agentVersion,
        action,
        resource,
        payload,
        policyVersion,
        correlationId: input.correlationId,
        operationKey: input.operationKey,
        ...(input.executionRef !== undefined
          ? { executionRef: input.executionRef }
          : {}),
        singleUse: true,
        reason: input.summary,
        proposalPayload: payload
      })
      const pending =
        created.status === 'REQUESTED'
          ? await this.authority.submit(
              input.tenantId,
              created.approvalId,
              operatorId
            )
          : created
      return this.toDecision(pending)
    } catch (error) {
      if (!isApprovalBindingUniqueViolation(error)) throw error
      const raced = await this.findBoundApproval({
        input,
        action,
        resource,
        payload,
        agentVersion,
        policyVersion
      })
      if (!raced) throw error
      return this.toDecision(raced)
    }
  }

  private async findBoundApproval(input: {
    input: ApprovalRequest
    action: string
    resource: { type: string; id?: string }
    payload: unknown
    agentVersion: string
    policyVersion: string
  }): Promise<ApprovalRecord | undefined> {
    const candidates = await this.authority.list(input.input.tenantId)
    const matching = candidates
      .filter((record) => record.operationKey === input.input.operationKey)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))
    const record = matching[0]
    if (!record) return undefined

    if (
      record.agentId !== input.input.agentId ||
      record.agentVersion !== input.agentVersion ||
      record.policyVersion !== input.policyVersion ||
      (input.input.executionRef !== undefined &&
        record.executionRef !== input.input.executionRef) ||
      !approvalMatchesAction(record, {
        action: input.action,
        resource: input.resource,
        payload: input.payload
      })
    ) {
      return {
        ...record,
        status: 'REJECTED',
        decisionReason:
          'Approval binding no longer matches the immutable execution request.'
      }
    }
    return record
  }

  private async beginExecution(
    request: ApprovalExecutionRequest
  ): Promise<ApprovalExecutionHandle> {
    const record = await this.authority.get(
      request.tenantId,
      request.approvalId
    )
    if (
      record.agentId !== request.agentId ||
      record.agentVersion !== request.agentVersion ||
      record.policyVersion !== request.policyVersion ||
      record.executionRef !== request.executionRef ||
      !approvalMatchesAction(record, {
        action: request.action,
        resource: request.resource,
        payload: request.payload
      })
    ) {
      throw new Error('Approval binding no longer matches the execution.')
    }
    const reservation = await this.authority.reserve({
      tenantId: request.tenantId,
      approvalId: request.approvalId,
      action: request.action,
      resource: request.resource,
      payload: request.payload,
      agentId: request.agentId,
      agentVersion: request.agentVersion,
      policyVersion: request.policyVersion,
      operationKey: request.operationKey,
      ownerId: request.executionRef,
      ttlMs: 60_000
    })
    try {
      await this.authority.markExecuting({
        tenantId: request.tenantId,
        approvalId: request.approvalId,
        reservationId: reservation.reservationId
      })
    } catch (error) {
      await Promise.resolve(
        this.authority.release({
          tenantId: request.tenantId,
          approvalId: request.approvalId,
          reservationId: reservation.reservationId,
          evidence: {
            outcome: 'no_effect',
            source: 'adapter',
            evidenceRef: `${request.executionRef}:approval_begin_failed`
          }
        })
      ).catch(() => undefined)
      throw error
    }
    return {
      approvalId: request.approvalId,
      reservationId: reservation.reservationId
    }
  }

  private async completeExecution(input: {
    request: ApprovalExecutionRequest
    reservationId: string
    evidenceRef: string
  }): Promise<void> {
    await this.authority.confirm({
      tenantId: input.request.tenantId,
      approvalId: input.request.approvalId,
      reservationId: input.reservationId,
      evidence: {
        outcome: 'effect_confirmed',
        executionRef: input.request.executionRef,
        evidenceRef: input.evidenceRef
      }
    })
  }

  private async failExecution(input: {
    request: ApprovalExecutionRequest
    reservationId: string
    evidenceRef: string
  }): Promise<void> {
    await this.authority.fail({
      tenantId: input.request.tenantId,
      approvalId: input.request.approvalId,
      reservationId: input.reservationId,
      evidence: {
        outcome: 'no_effect',
        source: 'adapter',
        evidenceRef: input.evidenceRef
      }
    })
  }

  private async markUncertain(input: {
    request: ApprovalExecutionRequest
    reservationId: string
    reason: string
    evidenceRef: string
  }): Promise<void> {
    await this.authority.markUncertain({
      tenantId: input.request.tenantId,
      approvalId: input.request.approvalId,
      reservationId: input.reservationId,
      reason: input.reason,
      evidence: {
        outcome: 'effect_possibly_started',
        evidenceRef: input.evidenceRef
      }
    })
  }

  private toDecision(record: ApprovalRecord): ApprovalDecision {
    const approvalId = record.approvalId as ApprovalId
    const reason =
      record.decisionReason ??
      `Approval ${record.status.toLowerCase()} for ${record.action}.`
    if (record.status === 'APPROVED') {
      return { status: 'APPROVED', approvalId, reason }
    }
    if (record.status === 'REQUESTED' || record.status === 'PENDING') {
      return { status: 'PENDING', approvalId, reason }
    }
    return { status: 'DENIED', approvalId, reason }
  }
}

function isApprovalBindingUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown }
  return (
    candidate.code === '23505' &&
    candidate.constraint === 'uq_runtime_approvals_execution_binding'
  )
}
