import { DomainError } from '@cvg/shared'

export interface HandoffContext {
  tutor?: string
  pet?: string
  intent?: string
  collectedData?: string[]
  risk?: string
  toolsUsed?: string[]
  pendingItems?: string[]
  recommendedNextStep?: string
}

export function createHandoffSummary(context: HandoffContext): string {
  if (!context.intent || !context.recommendedNextStep) {
    throw new DomainError(
      'insufficient_context',
      'Handoff requires intent and recommended next step'
    )
  }
  return [
    `Tutor: ${context.tutor ?? 'unknown'}`,
    `Pet: ${context.pet ?? 'unknown'}`,
    `Intent: ${context.intent}`,
    `Risk: ${context.risk ?? 'unknown'}`,
    `Collected: ${(context.collectedData ?? []).join(', ') || 'none'}`,
    `Tools: ${(context.toolsUsed ?? []).join(', ') || 'none'}`,
    `Pending: ${(context.pendingItems ?? []).join(', ') || 'none'}`,
    `Next: ${context.recommendedNextStep}`
  ].join('\n')
}
