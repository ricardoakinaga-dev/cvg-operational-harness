import type {
  CompletionEvaluation,
  CompletionEvaluationInput,
  CompletionEvaluator,
  CompletionStrategy,
  Observation,
  SufficiencyEvaluation
} from '@cvg/harness-contracts'

export interface SemanticCompletionJudge {
  judge(input: CompletionEvaluationInput): Promise<CompletionEvaluation>
}

export interface CompletionEvaluatorOptions {
  readonly strategy?: CompletionStrategy
  /**
   * Optional bounded semantic judge used only by the HYBRID strategy and only
   * after deterministic checks already returned COMPLETE.
   */
  readonly semanticJudge?: SemanticCompletionJudge
}

function lastOfType(
  observations: readonly Observation[],
  type: Observation['type']
): Observation | undefined {
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const observation = observations[index]
    if (observation?.type === type) return observation
  }
  return undefined
}

function lastToolObservation(
  observations: readonly Observation[]
): Observation | undefined {
  return lastOfType(observations, 'TOOL_RESULT')
}

function toolObservationSucceeded(observation: Observation): boolean {
  const payload = observation.payload as { status?: unknown } | null
  if (!payload || typeof payload !== 'object') return false
  return payload.status === 'SUCCEEDED'
}

function toolObservationIsEffect(observation: Observation): boolean {
  const payload = observation.payload as {
    status?: unknown
    sideEffect?: unknown
  } | null
  if (!payload || typeof payload !== 'object') return false
  if (payload.status !== 'SUCCEEDED') return false
  return payload.sideEffect === 'WRITE' || payload.sideEffect === 'EXTERNAL'
}

/**
 * A confirmed action must be grounded in the claimed effect: either the exact
 * tool named by the decision succeeded, or (when no tool is named) at least
 * one side-effecting tool succeeded. A previous successful read never
 * satisfies an action-confirmation claim.
 */
function hasConfirmedEffect(
  decision: { readonly toolId?: string },
  observations: readonly Observation[]
): boolean {
  const successful = observations.filter(
    (observation) =>
      observation.type === 'TOOL_RESULT' &&
      toolObservationSucceeded(observation)
  )
  if (decision.toolId) {
    return successful.some(
      (observation) =>
        observation.provenance.sourceId === decision.toolId &&
        toolObservationIsEffect(observation)
    )
  }
  return successful.some((observation) => toolObservationIsEffect(observation))
}

function toolObservationFailed(observation: Observation): boolean {
  const payload = observation.payload as { status?: unknown } | null
  if (!payload || typeof payload !== 'object') return false
  return payload.status === 'FAILED' || payload.status === 'REJECTED'
}

function sufficiencyFromObservation(
  observation: Observation | undefined
): SufficiencyEvaluation | undefined {
  if (!observation) return undefined
  const payload = observation.payload as SufficiencyEvaluation | null
  if (!payload || typeof payload.level !== 'string') return undefined
  return payload
}

function failed(
  detail: string,
  reasonCode: CompletionEvaluation['reasonCode'] = 'VERIFICATION_FAILED'
): CompletionEvaluation {
  return { outcome: 'FAILED', reasonCode, deterministic: true, detail }
}

/**
 * Deterministic completion. `COMPLETED` never means "the model wanted to
 * stop"; it means the configured completion strategy accepted structured
 * evidence. Model-based judgement is optional and always bounded by the
 * caller's verification budget.
 */
export class DeterministicCompletionEvaluator implements CompletionEvaluator {
  private readonly strategy: CompletionStrategy
  private readonly semanticJudge: SemanticCompletionJudge | undefined

  public constructor(options: CompletionEvaluatorOptions = {}) {
    this.strategy = options.strategy ?? 'DETERMINISTIC'
    this.semanticJudge = options.semanticJudge
  }

  public async evaluate(
    input: CompletionEvaluationInput
  ): Promise<CompletionEvaluation> {
    const deterministic = this.evaluateDeterministic(input)
    if (deterministic.outcome !== 'COMPLETE') {
      return deterministic
    }
    if (this.strategy !== 'HYBRID' || !this.semanticJudge) {
      return deterministic
    }
    try {
      const judged = await this.semanticJudge.judge(input)
      return judged
    } catch {
      return {
        ...deterministic,
        detail:
          `${deterministic.detail ?? ''} semantic_judge_unavailable`.trim(),
        reasonCode: 'EVALUATOR_UNAVAILABLE'
      }
    }
  }

  private evaluateDeterministic(
    input: CompletionEvaluationInput
  ): CompletionEvaluation {
    const lastTool = lastToolObservation(input.observations)
    const lastSufficiency = sufficiencyFromObservation(
      lastOfType(input.observations, 'SUFFICIENCY')
    )

    if (input.state.pendingQuestion) {
      return {
        outcome: 'NEEDS_USER',
        reasonCode: 'MISSING_INFORMATION',
        deterministic: true,
        detail: 'A clarification question is still pending.'
      }
    }
    if (input.state.pendingApprovalId) {
      return {
        outcome: 'WAITING_APPROVAL',
        reasonCode: 'POLICY_REQUIRED',
        deterministic: true,
        detail: 'An approval decision is still pending.'
      }
    }

    const decision = input.lastDecision
    if (!decision) {
      return {
        outcome: 'INCOMPLETE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: true,
        detail: 'No orchestrator decision has been made yet.'
      }
    }

    if (
      decision.reasonCode === 'ACTION_CONFIRMED' &&
      !hasConfirmedEffect(decision, input.observations)
    ) {
      return failed(
        'The agent claimed a confirmed action without the claimed effect observation.',
        'ACTION_CONFIRMED'
      )
    }

    if (decision.decisionType === 'REPLAN') {
      return {
        outcome: 'INCOMPLETE',
        reasonCode: 'STRATEGY_CHANGED',
        deterministic: true,
        detail: 'A replan was requested; the loop continues.'
      }
    }

    if (
      decision.decisionType !== 'RESPOND' &&
      decision.decisionType !== 'STOP'
    ) {
      return {
        outcome: 'INCOMPLETE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: true,
        detail: `Decision ${decision.decisionType} requires another loop step.`
      }
    }

    if (decision.decisionType === 'STOP') {
      if (decision.reasonCode === 'USER_REQUESTED_STOP') {
        return {
          outcome: 'COMPLETE',
          reasonCode: 'COMPLETION_CONFIRMED',
          deterministic: true,
          detail: 'The user requested a stop.'
        }
      }
      if (decision.reasonCode === 'HANDOFF_REQUIRED') {
        return {
          outcome: 'FAILED',
          reasonCode: 'HANDOFF_REQUIRED',
          deterministic: true,
          detail: 'The orchestrator requested a human handoff.'
        }
      }
    }

    if (lastTool && toolObservationFailed(lastTool)) {
      return failed(
        'The most recent tool outcome failed and no later success was recorded.',
        'TOOL_REQUIRED'
      )
    }

    if (this.strategy === 'EVIDENCE_BASED') {
      if (!lastSufficiency) {
        return {
          outcome: 'INSUFFICIENT_EVIDENCE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          deterministic: true,
          detail: 'No sufficiency evaluation was recorded for the answer.'
        }
      }
      switch (lastSufficiency.level) {
        case 'SUFFICIENT':
          return {
            outcome: 'COMPLETE',
            reasonCode: 'COMPLETION_CONFIRMED',
            deterministic: true,
            detail: 'Evidence coverage is sufficient.'
          }
        case 'PARTIAL':
          return {
            outcome: 'INCOMPLETE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true,
            detail: 'Evidence coverage is partial; more search is required.'
          }
        case 'INSUFFICIENT':
          return {
            outcome: 'INSUFFICIENT_EVIDENCE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true,
            detail: 'Evidence coverage is insufficient for the answer.'
          }
        case 'CONFLICTING':
          return {
            outcome: 'INSUFFICIENT_EVIDENCE',
            reasonCode: 'EVIDENCE_INCOMPLETE',
            deterministic: true,
            detail: 'Evidence sources conflict; the answer must be qualified.'
          }
      }
    }

    if (
      decision.decisionType === 'RESPOND' &&
      !decision.responseText?.trim() &&
      !decision.responseIntent?.trim()
    ) {
      return {
        outcome: 'INCOMPLETE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: true,
        detail: 'The RESPOND decision carries no response content or intent.'
      }
    }

    return {
      outcome: 'COMPLETE',
      reasonCode: 'COMPLETION_CONFIRMED',
      deterministic: true,
      detail:
        this.strategy === 'DETERMINISTIC'
          ? 'Structured completion accepted by the deterministic strategy.'
          : 'Structured completion accepted.'
    }
  }
}

export function createCompletionEvaluator(
  options: CompletionEvaluatorOptions = {}
): CompletionEvaluator {
  return new DeterministicCompletionEvaluator(options)
}

/**
 * Bounded model-based judge for hybrid profiles. It only ever sees structured
 * state and observation summaries; it never receives hidden reasoning and it
 * cannot execute tools or authorize actions.
 */
export function createModelCompletionJudge(
  judge: (input: {
    readonly goal: string
    readonly stateSummary: string
    readonly observationSummaries: readonly string[]
  }) => Promise<'COMPLETE' | 'INCOMPLETE' | 'INSUFFICIENT_EVIDENCE'>
): SemanticCompletionJudge {
  return {
    judge: async (input) => {
      const verdict = await judge({
        goal: input.goal,
        stateSummary: `step=${input.state.stepNumber} observations=${input.observations.length}`,
        observationSummaries: input.observations.map(
          (observation) => observation.summary
        )
      })
      if (verdict === 'COMPLETE') {
        return {
          outcome: 'COMPLETE',
          reasonCode: 'COMPLETION_CONFIRMED',
          deterministic: false,
          detail: 'Semantic judge accepted the result.'
        }
      }
      if (verdict === 'INSUFFICIENT_EVIDENCE') {
        return {
          outcome: 'INSUFFICIENT_EVIDENCE',
          reasonCode: 'EVIDENCE_INCOMPLETE',
          deterministic: false,
          detail: 'Semantic judge reported insufficient evidence.'
        }
      }
      return {
        outcome: 'INCOMPLETE',
        reasonCode: 'EVIDENCE_INCOMPLETE',
        deterministic: false,
        detail: 'Semantic judge requested another step.'
      }
    }
  }
}
