import type { ModelResult } from '@cvg/model-gateway'
import type { ActiveSpan } from '@cvg/observability'
import type { PolicyDecision } from '@cvg/policy-engine'
import type {
  GovernedOutcome,
  GovernedTurnResult,
  LoopLimits
} from './contracts.ts'

export interface FinishExtra {
  modelResult?: ModelResult
  approvalId?: string
  toolResult?: unknown
  outboxEventId?: string
  outboxPending?: boolean
  executionRef?: string
  resultDigest?: string
  replayed?: boolean
  effectConfirmed?: boolean
  costUsd?: number
}

/**
 * Stages that consume the per-turn budget (contract section 9). Controls such
 * as policy evaluation, approval checks and journal transitions are mandatory
 * and never consume `maxSteps`.
 */
export type BudgetedStage = 'model.generate' | 'tool.execute' | 'outbox.enqueue'

export type StageOutcome = { span: ActiveSpan } | { denied: GovernedTurnResult }

export type StopReason = 'turn_cancelled' | 'loop_deadline_exceeded'

export interface ExecutionContext {
  appendAudit: (type: string, payload: Record<string, unknown>) => void
  finish: (
    outcome: GovernedOutcome,
    reason: string,
    decision: PolicyDecision,
    extra?: FinishExtra
  ) => GovernedTurnResult
  beginStage: (
    stage: BudgetedStage,
    decision: PolicyDecision,
    extra?: FinishExtra
  ) => StageOutcome
  assertBudget: (
    stage: BudgetedStage,
    decision: PolicyDecision,
    extra?: FinishExtra
  ) => GovernedTurnResult | undefined
  controlSpan: (name: string) => ActiveSpan
  endSpan: (
    span: ActiveSpan | undefined,
    status: 'ok' | 'error',
    errorCode?: string
  ) => void
  stopReason: () => StopReason | undefined
  stopDenial: (
    decision: PolicyDecision,
    extra?: FinishExtra,
    phase?: string
  ) => GovernedTurnResult | undefined
  pausedStop: (
    decision: PolicyDecision,
    phase: string,
    extra?: FinishExtra
  ) => Promise<GovernedTurnResult | undefined>
  readPause: () => Promise<
    'operator_paused' | 'pause_state_unavailable' | undefined
  >
  finishPaused: (
    code: 'operator_paused' | 'pause_state_unavailable',
    decision: PolicyDecision,
    phase: string,
    extra?: FinishExtra
  ) => GovernedTurnResult
  clock: () => Date
  deadline: number
  traceId: string
  limits: LoopLimits
}

export const DEFAULT_RESERVATION_TTL_MS = 60_000
