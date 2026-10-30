/**
 * SPEC 0262 §4.2/§4.3 — one PostgreSQL unit for the runtime approval decision:
 * case authorization (principal and grant locks), execution row, approval row,
 * engine phase, compare-and-set, execution resolution and the decision audit
 * event commit together or not at all. No provider or worker runs inside it.
 */
import { DomainError } from '@cvg/shared'
import {
  ApprovalError,
  type ApprovalEvent,
  type ApprovalRecord
} from '@cvg/approval-engine'
import type { ExecutionRecord } from '@cvg/harness'
import type { ApiCreationOptions } from './api-creation.ts'
import {
  runTenantMutationTransaction,
  type CreationTransactionHooks
} from './api-creation-postgres.ts'
import { PostgresOperationalExecutionStore } from './operational-execution-postgres.ts'
import { PostgresRuntimeRepository } from './postgres.ts'
import type { PostgresApprovalAuthority } from './runtime-approval-store.ts'
import type { PostgresPoolLike } from './tenant-scoped-postgres.ts'
import type { TenantId } from '@cvg/platform'

export interface RuntimeApprovalDecisionCommand {
  readonly tenantId: TenantId
  readonly executionId: string
  readonly approvalId: string
  readonly verdict: 'APPROVED' | 'REJECTED'
  readonly actorId: string
  readonly decisionActorType: 'Supervisor' | 'Approver'
  readonly correlationId: string
  readonly commandKey: string
  readonly reason?: string
}

export interface RuntimeApprovalDecisionResult {
  readonly approval: ApprovalRecord
  readonly execution: ExecutionRecord
}

export interface PostgresRuntimeApprovalDecisionOptions {
  readonly hooks?: CreationTransactionHooks
  readonly clock?: () => Date
}

export class PostgresRuntimeApprovalDecision {
  readonly #hooks: CreationTransactionHooks
  readonly #clock: () => Date

  constructor(
    private readonly pool: PostgresPoolLike,
    private readonly approvals: PostgresApprovalAuthority,
    private readonly executions: PostgresOperationalExecutionStore,
    options: PostgresRuntimeApprovalDecisionOptions = {}
  ) {
    this.#hooks = options.hooks ?? {}
    this.#clock = options.clock ?? (() => new Date())
  }

  async decide(
    command: RuntimeApprovalDecisionCommand,
    options: ApiCreationOptions = {}
  ): Promise<RuntimeApprovalDecisionResult> {
    const outcome = await runTenantMutationTransaction(
      this.pool,
      command.tenantId,
      async (client) => {
        // Order: execution row, then approval row (SPEC 0262 §4 step 5).
        const execution = await this.executions
          .lockExecutionInTransaction(
            client,
            command.tenantId,
            command.executionId
          )
          .catch((error: unknown) => {
            if (
              error instanceof Error &&
              (error as { code?: unknown }).code === 'not_found'
            ) {
              throw new DomainError('not_found', 'Execution not found')
            }
            throw error
          })
        if (execution.approvalId !== command.approvalId) {
          throw new DomainError('not_found', 'Approval not found')
        }
        const loaded = await this.approvals.lockInTransaction(
          client,
          command.tenantId,
          command.approvalId
        )
        if (loaded === undefined) {
          throw new ApprovalError(
            'not_found',
            'Approval not found for this tenant'
          )
        }
        let approval = loaded.record
        if (
          approval.executionRef !== execution.id ||
          approval.agentId !== execution.request.runtime.agent.id ||
          approval.agentVersion !== execution.request.runtime.agent.version ||
          approval.correlationId !== execution.request.runtime.correlationId
        ) {
          throw new DomainError('not_found', 'Approval not found')
        }
        if (
          execution.state !== 'WAITING_APPROVAL' &&
          (approval.status === 'PENDING' || approval.status === 'REQUESTED')
        ) {
          throw new DomainError(
            'conflict',
            'Execution is no longer waiting for this approval decision'
          )
        }
        if (
          execution.state === 'WAITING_APPROVAL' &&
          ['RESERVED', 'EXECUTING', 'EXECUTED'].includes(approval.status)
        ) {
          throw new DomainError(
            'conflict',
            'Approval has already entered effect execution'
          )
        }
        const decisionInput = {
          approverId: command.actorId,
          decisionActorType: command.decisionActorType,
          decisionCorrelationId: command.correlationId,
          commandKey: command.commandKey,
          ...(command.reason !== undefined ? { reason: command.reason } : {})
        }
        let events: readonly ApprovalEvent[] = []
        if (approval.status === 'REQUESTED' || approval.status === 'PENDING') {
          const phase = await this.approvals.applyDecisionPhaseInTransaction(
            client,
            loaded,
            {
              ...(approval.status === 'REQUESTED'
                ? { submitOperatorId: approval.operatorId }
                : {}),
              verdict: command.verdict,
              input: decisionInput
            }
          )
          if (phase.outcome === 'COMMIT_EXPIRED') {
            // Only the expiry commits; the original error is rethrown after.
            return {
              kind: 'expired' as const,
              error: phase.error,
              events: phase.events
            }
          }
          approval = phase.record
          events = phase.events
        }
        if (command.verdict === 'APPROVED') {
          if (
            !['APPROVED', 'RESERVED', 'EXECUTING', 'EXECUTED'].includes(
              approval.status
            )
          ) {
            throw new DomainError(
              'conflict',
              'Approval is not available for approval'
            )
          }
        } else if (approval.status !== 'REJECTED') {
          throw new DomainError(
            'conflict',
            'Approval is not available for rejection'
          )
        }
        const decisionActorId = approval.approverId
        const persistedActorType = approval.decisionActorType
        const persistedCorrelation = approval.decisionCorrelationId
        const persistedCommandKey = approval.decisionCommandKey
        if (
          !decisionActorId ||
          !persistedActorType ||
          !persistedCorrelation ||
          !persistedCommandKey
        ) {
          throw new DomainError(
            'conflict',
            'Approval decision causality is incomplete'
          )
        }
        const resolved = await this.executions.resolveApprovalInTransaction(
          client,
          {
            tenantId: command.tenantId,
            executionId: execution.id,
            approvalId: approval.approvalId,
            actorId: decisionActorId,
            decision: command.verdict,
            ...(approval.decisionReason !== undefined
              ? { reason: approval.decisionReason }
              : {})
          },
          this.#clock()
        )
        // AUD19-003: deduplicated by (tenant, approvalId, decision), so a
        // retry after a crash between decision and audit converges on one event.
        await new PostgresRuntimeRepository(client, {
          tenantIsolation: true
        }).appendAudit({
          tenantId: command.tenantId,
          type: 'approval_decision',
          actorType: persistedActorType,
          actorId: decisionActorId,
          correlationId: persistedCorrelation,
          policyVersion: approval.policyVersion,
          payload: {
            tenantId: command.tenantId,
            executionId: execution.id,
            approvalId: approval.approvalId,
            decision: command.verdict.toLowerCase(),
            reason: approval.decisionReason ?? null,
            previousState: execution.state,
            nextState: resolved.state,
            payloadHash: approval.payloadHash,
            commandKey: persistedCommandKey,
            operationKey: approval.operationKey ?? null
          }
        })
        return {
          kind: 'decided' as const,
          approval,
          execution: resolved,
          events
        }
      },
      this.#hooks,
      options.authorize
    )
    if (outcome.kind === 'expired') throw outcome.error
    return { approval: outcome.approval, execution: outcome.execution }
  }
}
