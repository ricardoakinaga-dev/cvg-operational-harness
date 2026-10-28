/**
 * AUD19-003 — targeted approval-decision reconciliation.
 *
 * A crash between the approval decision, the execution resume and the audit
 * append leaves a partial state. Because every step below is idempotent
 * (identical decision replay, identical resume, deduplicated audit event),
 * re-running the convergence closes the gap without a distributed
 * transaction and without risking a second effect.
 *
 * Periodic sweep wiring belongs to the durable worker (AUD19-008); this
 * module is the pure, testable convergence core.
 */

export type ApprovalDecision = 'APPROVED' | 'REJECTED'

/**
 * A row that cannot be reconciled because of its own data: not decided yet, a
 * decision that disagrees with the record, or an incomplete persisted
 * envelope. Callers may isolate these per row; any other error (connection
 * loss, server shutdown, a failing port) must propagate.
 */
export class ApprovalReconciliationDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApprovalReconciliationDataError'
  }
}

/** Statuses an APPROVED approval moves through while its execution advances. */
export const ADVANCED_APPROVED_STATUSES: ReadonlySet<string> = new Set([
  'RESERVED',
  'EXECUTING',
  'EXECUTED'
])

export interface ReconciliationApproval {
  readonly approvalId: string
  readonly status: string
  readonly approverId?: string
  readonly decisionActorType?: 'Approver' | 'Supervisor'
  readonly decisionReason?: string
  readonly decisionCorrelationId?: string
  readonly decisionCommandKey?: string
  readonly policyVersion: string
  readonly payloadHash: string
  readonly operationKey?: string
  readonly correlationId: string
}

export interface ReconciliationExecution {
  readonly id: string
  readonly state: string
}

export interface ApprovalReconciliationPorts {
  readonly getApproval: (
    tenantId: string,
    approvalId: string
  ) => Promise<ReconciliationApproval> | ReconciliationApproval
  readonly resolveExecution: (input: {
    readonly tenantId: string
    readonly executionId: string
    readonly approvalId: string
    readonly actorId: string
    readonly decision: ApprovalDecision
    readonly reason?: string
  }) => Promise<ReconciliationExecution> | ReconciliationExecution
  readonly appendAudit: (
    event: {
      readonly type: 'approval_decision'
      readonly actorType: 'Approver' | 'Supervisor'
      readonly actorId: string
      readonly correlationId: string
      readonly policyVersion: string
      readonly payload: Record<string, unknown>
    },
    tenantId: string
  ) => Promise<unknown> | unknown
}

export interface ApprovalReconciliationInput {
  readonly tenantId: string
  readonly executionId: string
  readonly approvalId: string
  readonly decision: ApprovalDecision
}

export interface ApprovalReconciliationReport {
  readonly reconciled: boolean
  readonly approvalStatus: string
  readonly executionState: string
  readonly steps: readonly string[]
}

/**
 * Drive one decided approval to its converged end state. Throws when the
 * approval is not decided yet (nothing to converge) or when a step rejects a
 * divergent repeat — both fail closed for the caller to surface.
 */
export async function reconcileApprovalDecision(
  ports: ApprovalReconciliationPorts,
  input: ApprovalReconciliationInput
): Promise<ApprovalReconciliationReport> {
  const approval = await ports.getApproval(input.tenantId, input.approvalId)
  if (approval.status === 'PENDING' || approval.status === 'REQUESTED') {
    throw new ApprovalReconciliationDataError(
      `reconciliation requires a decided approval (status=${approval.status})`
    )
  }
  // SPEC 0272: once the execution advanced, the approval leaves APPROVED
  // (RESERVED/EXECUTING/EXECUTED) but the decision stays `approved`. A later
  // state never authorises the opposite decision.
  const advanced = ADVANCED_APPROVED_STATUSES.has(approval.status)
  if (!advanced && approval.status !== input.decision) {
    throw new ApprovalReconciliationDataError(
      `reconciliation decision mismatch (recorded=${approval.status} requested=${input.decision})`
    )
  }
  if (advanced && input.decision !== 'APPROVED') {
    throw new ApprovalReconciliationDataError(
      `reconciliation decision mismatch (recorded=${approval.status} requested=${input.decision})`
    )
  }
  const actorId = approval.approverId
  const actorType = approval.decisionActorType
  const correlationId = approval.decisionCorrelationId
  const commandKey = approval.decisionCommandKey
  if (!actorId || !actorType || !correlationId || !commandKey) {
    throw new ApprovalReconciliationDataError(
      'reconciliation requires a complete persisted approval decision envelope'
    )
  }
  const steps: string[] = []
  // The resume only applies while the execution still waits for the decision;
  // an advanced execution is never resumed a second time.
  const execution: ReconciliationExecution = advanced
    ? { id: input.executionId, state: 'ADVANCED' }
    : await ports.resolveExecution({
        tenantId: input.tenantId,
        executionId: input.executionId,
        approvalId: input.approvalId,
        actorId,
        decision: input.decision,
        ...(approval.decisionReason !== undefined
          ? { reason: approval.decisionReason }
          : {})
      })
  steps.push(
    advanced ? 'execution:skipped_advanced' : `execution:${execution.state}`
  )
  await ports.appendAudit(
    {
      type: 'approval_decision',
      actorType,
      actorId,
      correlationId,
      policyVersion: approval.policyVersion,
      payload: {
        executionId: input.executionId,
        approvalId: input.approvalId,
        decision: input.decision.toLowerCase(),
        reason: approval.decisionReason ?? null,
        payloadHash: approval.payloadHash,
        commandKey,
        operationKey: approval.operationKey ?? null,
        // SPEC 0272: marks an event written by the recovery path (the API
        // writes previousState/nextState; recovery does not know them).
        recovered: true,
        observedApprovalStatus: approval.status
      }
    },
    input.tenantId
  )
  steps.push('audit:approval_decision')
  return {
    reconciled: true,
    approvalStatus: approval.status,
    executionState: execution.state,
    steps
  }
}
