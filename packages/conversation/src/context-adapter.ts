import type {
  ConversationContextInput,
  ConversationContextSnapshot,
  WorkingMemory
} from './contracts.ts'
import { assertWorkingMemory, getActiveGoal } from './state.ts'

/**
 * Converts the compact conversational checkpoint into the existing neutral
 * ContextSnapshot contract. It does not order, trim or reinterpret context;
 * DefaultContextEngine remains the single authority for those operations.
 */
export function toConversationContextSnapshot(
  input: ConversationContextInput
): ConversationContextSnapshot {
  assertWorkingMemory(input.memory)
  const memory = input.memory
  const activeEntities = memory.entities
    .filter((entity) => entity.status === 'ACTIVE')
    .map((entity) => ({
      key: entity.key,
      value: entity.value,
      source: entity.source,
      version: entity.version
    }))
  const activeGoal = getActiveGoal(memory)
  const values: Record<string, unknown> = {
    workingMemoryVersion: memory.version,
    activeEntities,
    activeGoal: activeGoal
      ? {
          goalId: activeGoal.goalId,
          kind: activeGoal.kind,
          status: activeGoal.status,
          requiredFields: activeGoal.requiredFields,
          collectedFields: activeGoal.collectedFields
        }
      : null,
    goalStack: memory.goalStack,
    pendingQuestion: memory.pendingQuestion
      ? {
          questionId: memory.pendingQuestion.questionId,
          type: memory.pendingQuestion.type,
          missingFields: memory.pendingQuestion.missingFields,
          goalId: memory.pendingQuestion.goalId
        }
      : null,
    options: memory.options.map((option) => ({
      id: option.id,
      label: option.label,
      value: option.value,
      sourceRef: option.sourceRef,
      status: option.status
    })),
    sourceRefs: memory.sourceRefs
  }
  if (memory.handoff) {
    values.handoff = {
      handoffId: memory.handoff.handoffId,
      reason: memory.handoff.reason,
      turnId: memory.handoff.turnId,
      executionRefs: memory.handoff.executionRefs
    }
  }
  return {
    values,
    sourceIds: ['conversation:working-memory', ...memory.sourceRefs],
    capturedAt: input.capturedAt
  }
}

export function contextSnapshotForMemory(
  memory: WorkingMemory,
  capturedAt: string
): ConversationContextSnapshot {
  return toConversationContextSnapshot({ memory, capturedAt })
}
