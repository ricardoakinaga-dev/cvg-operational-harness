import {
  ConversationError,
  type ConversationScope,
  type HandoffPacket,
  type HandoffReceipt,
  type HandoffSink,
  type TurnId,
  type WorkingMemory
} from './contracts.ts'
import { canonicalize, getActiveGoal } from './state.ts'

const SENSITIVE_KEY =
  /chain.?of.?thought|reasoning|credential|password|secret|token|authorization|api.?key|access.?token|auth.?token|private.?key|client.?secret/i
const SENSITIVE_VALUE =
  /(?:bearer\s+|api[_-]?key\s*[:=]|password\s*[:=]|secret\s*[:=]|token\s*[:=]|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i

/**
 * Projects bounded conversation state into a human-handoff checkpoint. It is
 * deliberately a projection: pending approval credentials and raw transcript
 * content never cross this boundary.
 */
export function createHandoffPacket(input: {
  readonly scope: ConversationScope
  readonly turnId: TurnId
  readonly reason: string
  readonly memory: WorkingMemory
  readonly now: string
}): HandoffPacket {
  const activeGoal = getActiveGoal(input.memory)
  const safeActiveGoal =
    activeGoal && !containsSensitiveValue(activeGoal) ? activeGoal : undefined
  const confirmedFacts = input.memory.entities
    .filter(
      (entity) => entity.status === 'ACTIVE' && !SENSITIVE_KEY.test(entity.key)
    )
    .filter((entity) => !containsSensitiveValue(entity.value))
    .slice(-32)
    .map((entity) => ({ ...entity, key: entity.key.slice(0, 80) }))
  const executionRefs = [
    ...input.memory.sourceRefs,
    ...(input.memory.pendingProposal
      ? [
          `proposal:${input.memory.pendingProposal.proposalId}`,
          `proposal-hash:${input.memory.pendingProposal.proposalHash}`,
          `operation:${input.memory.pendingProposal.operationKey}`
        ]
      : [])
  ]
    .filter(
      (ref) =>
        ref.trim().length > 0 &&
        !SENSITIVE_KEY.test(ref) &&
        !SENSITIVE_VALUE.test(ref)
    )
    .slice(-32)
  const pendingQuestion = input.memory.pendingQuestion
    ? containsSensitiveValue(input.memory.pendingQuestion)
      ? undefined
      : input.memory.pendingQuestion
    : undefined
  return {
    handoffId: `handoff_${String(input.turnId)}`,
    idempotencyKey: `handoff:${String(input.scope.tenantId)}:${String(input.scope.conversationId)}:${String(input.turnId)}`,
    scope: input.scope,
    turnId: input.turnId,
    reason: containsSensitiveValue(input.reason)
      ? 'Sensitive handoff details were redacted.'
      : input.reason.slice(0, 160),
    ...(safeActiveGoal ? { activeGoal: safeActiveGoal } : {}),
    confirmedFacts,
    ...(pendingQuestion ? { pendingQuestion } : {}),
    executionRefs,
    createdAt: input.now
  }
}

/** Synthetic local sink used by controlled examples and tests. */
export class InMemoryHandoffSink implements HandoffSink {
  readonly #packets = new Map<string, HandoffPacket>()

  async submit(input: HandoffPacket): Promise<HandoffReceipt> {
    validatePacket(input)
    const key = `${String(input.scope.tenantId)}:${input.handoffId}`
    const existing = this.#packets.get(key)
    if (existing) {
      if (canonicalize(existing) !== canonicalize(input)) {
        throw new ConversationError(
          'STATE_CONFLICT',
          'Handoff identity is bound to another packet'
        )
      }
      return {
        status: 'REPLAYED',
        handoffId: input.handoffId,
        idempotencyKey: input.idempotencyKey
      }
    }
    this.#packets.set(key, input)
    return {
      status: 'ACCEPTED',
      handoffId: input.handoffId,
      idempotencyKey: input.idempotencyKey
    }
  }

  inspect(
    scope: Pick<ConversationScope, 'tenantId'>,
    handoffId: string
  ): HandoffPacket | null {
    return this.#packets.get(`${String(scope.tenantId)}:${handoffId}`) ?? null
  }
}

function validatePacket(packet: HandoffPacket): void {
  if (!packet.handoffId || !packet.idempotencyKey || !packet.turnId) {
    throw new ConversationError('INVALID_INPUT', 'Handoff identity is required')
  }
  if (
    packet.reason.length > 160 ||
    packet.confirmedFacts.length > 32 ||
    packet.executionRefs.length > 32
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Handoff packet exceeds its bound'
    )
  }
  if (packet.confirmedFacts.some((fact) => SENSITIVE_KEY.test(fact.key))) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Sensitive handoff fact rejected'
    )
  }
  if (
    packet.confirmedFacts.some((fact) => containsSensitiveValue(fact.value))
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Sensitive handoff fact value rejected'
    )
  }
  if (
    (packet.activeGoal && containsSensitiveValue(packet.activeGoal)) ||
    (packet.pendingQuestion && containsSensitiveValue(packet.pendingQuestion))
  ) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Sensitive handoff context rejected'
    )
  }
  if (packet.executionRefs.some((ref) => SENSITIVE_KEY.test(ref))) {
    throw new ConversationError(
      'INVALID_INPUT',
      'Sensitive handoff reference rejected'
    )
  }
}

function containsSensitiveValue(value: unknown): boolean {
  if (typeof value === 'string') return SENSITIVE_VALUE.test(value)
  if (Array.isArray(value)) return value.some(containsSensitiveValue)
  if (typeof value !== 'object' || value === null) return false
  return Object.entries(value).some(
    ([key, child]) => SENSITIVE_KEY.test(key) || containsSensitiveValue(child)
  )
}
