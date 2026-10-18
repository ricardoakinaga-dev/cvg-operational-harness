import { ResolveApprovalSchema, type Role } from '@cvg/shared'
import { ApprovalService } from '@cvg/policy'
import type { ApprovalRequestRecord } from '@cvg/persistence'

export function resolveApproval(
  request: ApprovalRequestRecord,
  role: Role,
  rawInput: unknown
) {
  const input = ResolveApprovalSchema.parse(rawInput)
  return new ApprovalService().decide({
    request,
    decision: input.decision,
    operatorId: input.operatorId,
    role
  })
}
