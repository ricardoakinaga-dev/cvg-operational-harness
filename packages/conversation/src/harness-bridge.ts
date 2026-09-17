import type { RuntimeResult } from '@cvg/harness-contracts'
import {
  type ConversationHarness,
  type EffectEvidenceVerifier,
  type HarnessActionRequest,
  type HarnessActionResult,
  type OperationalHarnessBridgeOptions
} from './contracts.ts'
import { canonicalize } from './state.ts'

export interface EffectJournalReader {
  get(
    tenantId: string,
    operationKey: string
  ): Promise<
    | {
        readonly tenantId: string
        readonly operationKey: string
        readonly proposalHash: string
        readonly state: string
        readonly attemptId: string
      }
    | null
    | undefined
  >
}

/**
 * Read-only adapter for the existing Effect Journal. The conversation layer
 * can verify a success claim without owning reservation or effect transitions.
 */
export function createEffectJournalEvidenceVerifier(
  journal: EffectJournalReader
): EffectEvidenceVerifier {
  return {
    async verify({ scope, proposal, result }) {
      if (!result.effectConfirmed || result.status !== 'SUCCEEDED') return false
      const record = await journal.get(
        String(scope.tenantId),
        proposal.operationKey
      )
      return Boolean(
        record &&
        record.state === 'CONFIRMED' &&
        record.tenantId === String(scope.tenantId) &&
        record.operationKey === proposal.operationKey &&
        journalRecordBindsProposal(record, proposal)
      )
    },
    async recover({ scope, proposal, executionId }) {
      const record = await journal.get(
        String(scope.tenantId),
        proposal.operationKey
      )
      if (
        !record ||
        record.state !== 'CONFIRMED' ||
        record.tenantId !== String(scope.tenantId) ||
        record.operationKey !== proposal.operationKey ||
        !journalRecordBindsProposal(record, proposal)
      )
        return null
      return {
        status: 'SUCCEEDED',
        executionId,
        proposalHash: proposal.proposalHash,
        operationKey: proposal.operationKey,
        effectConfirmed: true,
        stopReason: 'RECOVERED_EFFECT',
        evidenceRefs: [
          `execution:${executionId}:recovered`,
          `effect:${executionId}`
        ]
      }
    }
  }
}

function journalRecordBindsProposal(
  record: {
    readonly proposalHash: string
    readonly operationKey: string
  },
  proposal: { readonly proposalHash: string; readonly operationKey: string }
): boolean {
  // The public conversation proposal hash and the Harness Effect Journal hash
  // intentionally use different schemas. The operation key is the shared
  // immutable binding and contains the conversation hash for manager-created
  // proposals; a custom reader can still expose the exact same hash.
  return (
    record.proposalHash === proposal.proposalHash ||
    proposal.operationKey.endsWith(`:${proposal.proposalHash}`)
  )
}

/**
 * The only executable adapter exposed by this package. It accepts an
 * application-provided RuntimeInput factory and delegates to the existing
 * public Harness composition; it never receives a capability implementation.
 */
export function createOperationalHarnessBridge(
  options: OperationalHarnessBridgeOptions
): ConversationHarness {
  return {
    async execute(input: HarnessActionRequest): Promise<HarnessActionResult> {
      const runtimeInput = options.buildRuntimeInput(input)
      const executionId = input.executionId
      const requestedTool = runtimeInput.requestedTool
      const toolMismatch =
        !requestedTool ||
        requestedTool.toolId !== input.proposal.capabilityId ||
        requestedTool.toolVersion !== input.proposal.capabilityVersion ||
        requestedTool.operationKey !== input.proposal.operationKey ||
        !sameCanonicalValue(requestedTool.input, input.proposal.payload)
      const identityMismatch =
        !runtimeInput.agent ||
        String(runtimeInput.agent.id) !== String(options.trustedAgent.id) ||
        String(runtimeInput.agent.version) !==
          String(options.trustedAgent.version) ||
        String(runtimeInput.tenantId) !== String(input.identity.tenantId) ||
        String(runtimeInput.conversationId) !==
          String(input.identity.conversationId) ||
        String(runtimeInput.sessionId) !== String(input.identity.sessionId) ||
        String(runtimeInput.correlationId) !==
          String(input.identity.correlationId) ||
        runtimeInput.executionId === undefined ||
        String(runtimeInput.executionId) !== String(executionId) ||
        !isContextSnapshot(runtimeInput.context)
      const approvalMismatch = input.approvalResume
        ? runtimeInput.resume?.kind !== 'approval' ||
          runtimeInput.resume.approvalId !== input.approvalResume.approvalId
        : runtimeInput.resume !== undefined
      if (identityMismatch || approvalMismatch || toolMismatch) {
        return {
          status: 'DENIED',
          executionId,
          proposalHash: input.proposal.proposalHash,
          operationKey: input.proposal.operationKey,
          effectConfirmed: false,
          stopReason: 'BRIDGE_IDENTITY_OR_RESUME_MISMATCH',
          evidenceRefs: [`execution:${executionId}:denied`]
        }
      }
      try {
        const result = await options.harness.execute(runtimeInput)
        return mapRuntimeResult(result, input, executionId)
      } catch {
        return {
          status: 'UNCERTAIN',
          executionId,
          proposalHash: input.proposal.proposalHash,
          operationKey: input.proposal.operationKey,
          effectConfirmed: false,
          stopReason: 'BRIDGE_EXCEPTION',
          // The underlying adapter can expose policy, credential or provider
          // details. Keep the boundary outcome generic and auditable.
          response: 'governed bridge execution failed',
          evidenceRefs: [`execution:${executionId}:uncertain`]
        }
      }
    }
  }
}

function mapRuntimeResult(
  result: RuntimeResult,
  input: HarnessActionRequest,
  executionId: import('./contracts.ts').ExecutionId
): HarnessActionResult {
  if (
    !result ||
    typeof result.response !== 'string' ||
    result.response.length > 500
  ) {
    return invalidResult(input, executionId, 'BRIDGE_RUNTIME_RESULT_INVALID')
  }
  if (typeof result.stopReason !== 'string' || result.stopReason.length > 120) {
    return invalidResult(input, executionId, 'BRIDGE_STOP_REASON_INVALID')
  }
  if (
    result.toolResult &&
    result.toolResult.status !== 'SUCCEEDED' &&
    result.toolResult.status !== 'FAILED' &&
    result.toolResult.status !== 'REJECTED'
  ) {
    return invalidResult(input, executionId, 'BRIDGE_TOOL_RESULT_INVALID')
  }
  if (
    result.toolResult?.output !== undefined &&
    !isBoundedJson(result.toolResult.output)
  ) {
    return invalidResult(input, executionId, 'BRIDGE_TOOL_OUTPUT_INVALID')
  }
  if (
    result.approvalId !== undefined &&
    String(result.approvalId).length > 200
  ) {
    return invalidResult(input, executionId, 'BRIDGE_APPROVAL_ID_INVALID')
  }
  const toolSucceeded = result.toolResult?.status === 'SUCCEEDED'
  const effectConfirmed = result.stopReason === 'COMPLETED' && toolSucceeded
  let status: HarnessActionResult['status']
  if (result.stopReason === 'APPROVAL_REQUIRED' || result.approvalId) {
    status = 'APPROVAL_REQUIRED'
  } else if (
    result.stopReason === 'POLICY_DENIED' ||
    result.stopReason === 'HUMAN_TAKEOVER' ||
    result.stopReason === 'UNSAFE_REQUEST'
  ) {
    status = 'DENIED'
  } else if (result.stopReason === 'COMPLETED') {
    status = 'SUCCEEDED'
  } else if (
    result.stopReason === 'TOOL_FAILURE' ||
    result.stopReason === 'MODEL_FAILURE' ||
    result.stopReason === 'INTERNAL_FAILURE' ||
    result.stopReason === 'STATE_CONFLICT'
  ) {
    status = 'FAILED'
  } else {
    status = 'UNCERTAIN'
  }
  const evidenceRefs = [
    `execution:${executionId}:${result.stopReason.toLocaleLowerCase('en-US')}`
  ]
  if (effectConfirmed) evidenceRefs.push(`effect:${executionId}`)
  return {
    status,
    executionId,
    ...(result.approvalId ? { approvalId: String(result.approvalId) } : {}),
    proposalHash: input.proposal.proposalHash,
    operationKey: input.proposal.operationKey,
    effectConfirmed,
    ...(result.toolResult?.output !== undefined
      ? {
          output: result.toolResult
            .output as import('./contracts.ts').ConversationJsonValue
        }
      : {}),
    response: result.response,
    stopReason: result.stopReason,
    evidenceRefs
  }
}

function invalidResult(
  input: HarnessActionRequest,
  executionId: import('./contracts.ts').ExecutionId,
  reason: string
): HarnessActionResult {
  return {
    status: 'UNCERTAIN',
    executionId,
    proposalHash: input.proposal.proposalHash,
    operationKey: input.proposal.operationKey,
    effectConfirmed: false,
    stopReason: reason,
    evidenceRefs: [`execution:${executionId}:uncertain`]
  }
}

function isContextSnapshot(value: unknown): value is {
  readonly values: Record<string, unknown>
  readonly sourceIds: readonly string[]
  readonly capturedAt: string
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.values !== null &&
    typeof candidate.values === 'object' &&
    !Array.isArray(candidate.values) &&
    Array.isArray(candidate.sourceIds) &&
    candidate.sourceIds.every(
      (item) => typeof item === 'string' && item.length <= 200
    ) &&
    typeof candidate.capturedAt === 'string' &&
    candidate.capturedAt.length <= 80
  )
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left) === canonicalize(right)
  } catch {
    return false
  }
}

function isBoundedJson(value: unknown, depth = 0): boolean {
  if (depth > 6) return false
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'string' || value.length <= 8_000
  }
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value))
    return (
      value.length <= 32 &&
      value.every((item) => isBoundedJson(item, depth + 1))
    )
  if (typeof value === 'object') {
    return (
      Object.entries(value).length <= 32 &&
      Object.entries(value).every(
        ([key, item]) => key.length <= 80 && isBoundedJson(item, depth + 1)
      )
    )
  }
  return false
}
