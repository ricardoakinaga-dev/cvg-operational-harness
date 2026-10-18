import { RequestHumanApprovalSchema } from '@cvg/shared'
import { ApprovalService } from '@cvg/policy'

export function requestHumanApproval(rawInput: unknown) {
  return new ApprovalService().create(
    RequestHumanApprovalSchema.parse(rawInput)
  )
}
