import type { StopReason } from '@cvg/harness-contracts'
import type { TestRunTrace } from './contracts.ts'
import type { PreparedCapabilityCommand } from './plugin-execution-core.ts'
import type {
  ControlledDispatchPermit,
  ControlledApprovalReceipt
} from './controlled-kernel-continuation.ts'

export const CONTROLLED_STOP_PROJECTION: Record<
  StopReason,
  { status: NonNullable<TestRunTrace['status']>; reason: string | null }
> = {
  COMPLETED: { status: 'completed', reason: null },
  NEEDS_USER_INPUT: {
    status: 'blocked',
    reason: 'controlled_runtime_needs_user_input'
  },
  APPROVAL_REQUIRED: {
    status: 'blocked',
    reason: 'controlled_runtime_approval_required'
  },
  HUMAN_TAKEOVER: {
    status: 'blocked',
    reason: 'controlled_runtime_human_takeover'
  },
  POLICY_DENIED: {
    status: 'blocked',
    reason: 'controlled_runtime_policy_denied'
  },
  INSUFFICIENT_EVIDENCE: {
    status: 'failed',
    reason: 'controlled_runtime_evidence_unavailable'
  },
  MAX_STEPS: { status: 'failed', reason: 'controlled_runtime_max_steps' },
  MAX_COST: { status: 'failed', reason: 'controlled_runtime_max_cost' },
  MAX_DURATION: { status: 'failed', reason: 'controlled_runtime_max_duration' },
  MAX_TOKENS: { status: 'failed', reason: 'controlled_runtime_max_tokens' },
  MAX_MODEL_CALLS: {
    status: 'failed',
    reason: 'controlled_runtime_max_model_calls'
  },
  MAX_TOOL_CALLS: {
    status: 'failed',
    reason: 'controlled_runtime_max_tool_calls'
  },
  MAX_REPLANS: { status: 'failed', reason: 'controlled_runtime_max_replans' },
  MAX_KNOWLEDGE_CALLS: {
    status: 'failed',
    reason: 'controlled_runtime_max_knowledge_calls'
  },
  MAX_VERIFICATION_CALLS: {
    status: 'failed',
    reason: 'controlled_runtime_max_verification_calls'
  },
  VERIFICATION_FAILED: {
    status: 'failed',
    reason: 'controlled_runtime_verification_failed'
  },
  LOOP_DETECTED: {
    status: 'failed',
    reason: 'controlled_runtime_loop_detected'
  },
  TOOL_FAILURE: { status: 'failed', reason: 'controlled_runtime_tool_failure' },
  MODEL_FAILURE: {
    status: 'failed',
    reason: 'controlled_runtime_model_failure'
  },
  INTERNAL_FAILURE: {
    status: 'failed',
    reason: 'controlled_runtime_internal_failure'
  },
  STATE_CONFLICT: {
    status: 'failed',
    reason: 'controlled_runtime_state_conflict'
  },
  CANCELLED: { status: 'failed', reason: 'controlled_runtime_cancelled' },
  UNSAFE_REQUEST: {
    status: 'blocked',
    reason: 'controlled_runtime_unsafe_request'
  }
}

export interface ControlledAttempt {
  command: PreparedCapabilityCommand
  phase: 'PENDING' | 'ENTERED' | 'CLOSED_WITHOUT_ENTRY'
  closed: boolean
  cause: StopReason | 'TERMINAL_BEFORE_ENTRY' | null
  operationKey?: string
  policyAllowed: boolean
  approvalRequired: boolean
  approvalConsumed: boolean
  resultAcknowledged: boolean
  logAcknowledged: boolean
  callbackAcknowledged: boolean
  attempted: boolean
  denied: boolean
  permit?: ControlledDispatchPermit
  evidenceRefs?: {
    phaseId: string
    phaseType: string
    sequence: number
    hash: string
  }[]
  approvalReceipt?: ControlledApprovalReceipt
}

/** Whole-turn authorization masks public success without erasing private facts. */
export function projectControlledTools(
  names: readonly string[],
  attempts: readonly ControlledAttempt[],
  stop: StopReason
): TestRunTrace['tools'] {
  return names.map((name) => {
    const a = attempts.find((item) => item.command.execution.toolName === name)
    if (!a || !a.attempted) return { name, status: 'not_run' as const }
    if (stop === 'INSUFFICIENT_EVIDENCE')
      return { name, status: 'failed' as const }
    if (
      stop === 'COMPLETED' &&
      a.resultAcknowledged &&
      a.command.output?.status === 'succeeded'
    )
      return { name, status: 'succeeded' as const }
    if (
      a.cause === 'HUMAN_TAKEOVER' ||
      a.denied ||
      a.command.output?.status === 'blocked'
    )
      return { name, status: 'blocked' as const }
    return { name, status: 'failed' as const }
  })
}
