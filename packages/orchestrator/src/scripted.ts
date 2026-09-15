import type {
  IterativeOrchestrator,
  IterativeOrchestratorTurn,
  LoopDecision,
  ModelGateway,
  ModelRequest,
  ModelResult
} from '@cvg/harness-contracts'
import { EMPTY_MODEL_USAGE } from '@cvg/harness-contracts'

export interface ScriptedOrchestratorOptions {
  readonly script: readonly (LoopDecision | IterativeOrchestratorTurn)[]
  readonly onDecision?: (index: number, decision: LoopDecision) => void
}

/**
 * Deterministic scripted decision source. It makes governed loop tests
 * independent from any real model while still flowing through the same
 * validation, policy and budget boundaries.
 */
export class ScriptedOrchestrator implements IterativeOrchestrator {
  private index = 0

  public constructor(private readonly options: ScriptedOrchestratorOptions) {}

  public get calls(): number {
    return this.index
  }

  public async decide(): Promise<IterativeOrchestratorTurn> {
    const entry = this.options.script[this.index]
    if (!entry) {
      throw new Error('scripted orchestrator script exhausted')
    }
    const turn: IterativeOrchestratorTurn =
      'decision' in entry ? entry : { decision: entry }
    this.options.onDecision?.(this.index, turn.decision)
    this.index += 1
    return turn
  }
}

export interface StaticOrchestratorOptions {
  readonly decision: LoopDecision
  /** Upper bound so a hostile fixture can never loop forever in-process. */
  readonly maxCalls?: number
}

/** Repeats the same decision; used by adversarial and budget proofs. */
export class StaticOrchestrator implements IterativeOrchestrator {
  private calls = 0

  public constructor(private readonly options: StaticOrchestratorOptions) {}

  public async decide(): Promise<IterativeOrchestratorTurn> {
    this.calls += 1
    if (this.calls > (this.options.maxCalls ?? 1_000)) {
      throw new Error('static orchestrator call bound exceeded')
    }
    return { decision: this.options.decision, usage: EMPTY_MODEL_USAGE }
  }
}

export interface ScriptedModelGatewayOptions {
  readonly responses: readonly (
    | string
    | {
        readonly text: string
        readonly inputTokens?: number
        readonly outputTokens?: number
        readonly costUsd?: number
      }
  )[]
  readonly provider?: string
  readonly model?: string
}

/**
 * Deterministic fake model provider. Fundamental correctness never depends on
 * a real API; scripted output drives the orchestrator/response paths.
 */
export class ScriptedModelGateway implements ModelGateway {
  private index = 0

  public constructor(private readonly options: ScriptedModelGatewayOptions) {}

  public get calls(): number {
    return this.index
  }

  public async complete(request: ModelRequest): Promise<ModelResult> {
    void request
    const entry = this.options.responses[this.index]
    if (entry === undefined) {
      throw new Error('scripted model gateway responses exhausted')
    }
    this.index += 1
    const response = typeof entry === 'string' ? { text: entry } : entry
    return {
      text: response.text,
      provider: this.options.provider ?? 'scripted',
      model: this.options.model ?? 'scripted-1',
      inputTokens: response.inputTokens ?? 10,
      outputTokens: response.outputTokens ?? 10,
      costUsd: response.costUsd ?? 0.001
    }
  }
}
