import { ApprovalError } from '@cvg/approval-engine'
import type { ModelResult } from '@cvg/model-gateway'
import type { PolicyDecision } from '@cvg/policy-engine'
import type {
  GovernedAgentRuntimeOptions,
  GovernedTurnInput,
  GovernedTurnResult
} from './contracts.ts'
import type { ExecutionContext } from './runtime-execution-context.ts'
import {
  createExecutionProposal,
  ExecutionProposalError,
  type ExecutionProposal
} from './proposal.ts'

/** Mint a frozen proposal and request approval without executing an effect. */
export async function requestApprovalTurn(
  input: GovernedTurnInput,
  decision: PolicyDecision,
  modelResult: ModelResult,
  payloadForEffect: unknown,
  correlationId: string,
  context: Pick<ExecutionContext, 'clock' | 'appendAudit' | 'finish'> &
    Pick<GovernedAgentRuntimeOptions, 'approvals' | 'telemetry'>
): Promise<GovernedTurnResult> {
  const { approvals, telemetry, clock, appendAudit, finish } = context
  let proposal: ExecutionProposal
  try {
    proposal = createExecutionProposal(
      {
        tenantId: input.tenantId,
        operatorId: input.operatorId,
        agentId: input.agentId,
        agentVersion: input.agentVersion,
        agentProfile: input.agentProfile,
        capability: input.capability,
        action: input.action,
        resource: input.resource,
        dataClassification: input.dataClassification,
        policyVersion: decision.policyVersion,
        promptVersion: input.prompt.version,
        payload: payloadForEffect
      },
      { now: clock() }
    )
  } catch (error) {
    const code =
      error instanceof ExecutionProposalError ? error.code : 'proposal_invalid'
    appendAudit('runtime.denied', { code, phase: 'proposal' })
    return finish('denied', code, decision, { modelResult })
  }

  try {
    const approval = await approvals.request({
      tenantId: input.tenantId,
      operatorId: input.operatorId,
      agentId: proposal.agentId,
      agentVersion: proposal.agentVersion,
      action: proposal.action,
      resource: {
        type: proposal.resource.type,
        ...(proposal.resource.id !== undefined
          ? { id: proposal.resource.id }
          : {})
      },
      payload: proposal.payload,
      policyVersion: proposal.policyVersion,
      ...(proposal.promptVersion !== undefined
        ? { promptVersion: proposal.promptVersion }
        : {}),
      correlationId,
      expiresInMs: Math.max(
        1000,
        Date.parse(proposal.expiresAt) - Date.parse(proposal.createdAt)
      ),
      reason: decision.reason,
      proposalId: proposal.proposalId,
      proposalHash: proposal.proposalHash,
      capability: proposal.capability,
      dataClassification: proposal.dataClassification,
      proposalPayload: proposal.payload
    })
    telemetry.recordMetric('approval_required_total', 1, {
      capability: input.capability,
      agentProfile: input.agentProfile
    })
    appendAudit('runtime.approval_requested', {
      approvalId: approval.approvalId,
      capability: input.capability,
      proposalId: proposal.proposalId
    })
    return finish('approval_required', decision.reason, decision, {
      modelResult,
      approvalId: approval.approvalId
    })
  } catch (error) {
    const code =
      error instanceof ApprovalError ? error.code : 'approval_invalid'
    appendAudit('runtime.denied', { code, phase: 'approval' })
    return finish('denied', code, decision, { modelResult })
  }
}
