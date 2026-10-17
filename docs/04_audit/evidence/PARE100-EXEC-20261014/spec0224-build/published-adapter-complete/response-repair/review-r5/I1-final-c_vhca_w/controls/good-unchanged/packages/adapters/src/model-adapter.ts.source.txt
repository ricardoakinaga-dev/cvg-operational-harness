import { DomainError, redactSensitiveText } from '@cvg/shared'

export interface ControlledModelRequest {
  prompt: string
  correlationId: string
  maxTokens?: number
  timeoutMs?: number
}

export interface ControlledModelResult {
  status: 'succeeded' | 'failed' | 'blocked'
  text?: string
  error?: 'validation_failed' | 'timeout' | 'provider_error' | 'unsafe_output'
  usage: {
    inputTokens: number
    outputTokens: number
    estimatedCostUnits: number
  }
  provider: 'controlled-fake'
  model: 'deterministic-v1'
  externalCall: false
  correlationId: string
}

export interface ControlledModelAdapterOptions {
  response?: string
  latencyMs?: number
  fail?: boolean
  maxTokens?: number
  costPerToken?: number
}

/** Deterministic model seam for Test Lab; it never calls a provider or grants permission. */
export class ControlledModelAdapter {
  private readonly response: string
  private readonly latencyMs: number
  private readonly fail: boolean
  private readonly maxTokens: number
  private readonly costPerToken: number

  constructor(options: ControlledModelAdapterOptions = {}) {
    this.response = options.response ?? 'Resposta controlada para fixture.'
    this.latencyMs = options.latencyMs ?? 0
    this.fail = options.fail ?? false
    this.maxTokens = options.maxTokens ?? 512
    this.costPerToken = options.costPerToken ?? 1
    if (
      !Number.isSafeInteger(this.latencyMs) ||
      this.latencyMs < 0 ||
      this.latencyMs > 60_000
    ) {
      throw new DomainError('validation_failed', 'Model latency is invalid')
    }
    if (
      !Number.isSafeInteger(this.maxTokens) ||
      this.maxTokens < 1 ||
      this.maxTokens > 4_096
    ) {
      throw new DomainError('validation_failed', 'Model token limit is invalid')
    }
    if (!Number.isFinite(this.costPerToken) || this.costPerToken < 0) {
      throw new DomainError('validation_failed', 'Model cost is invalid')
    }
  }

  async generate(
    input: ControlledModelRequest
  ): Promise<ControlledModelResult> {
    const prompt = boundedPrompt(input.prompt)
    const maxTokens = boundedTokens(
      input.maxTokens ?? this.maxTokens,
      this.maxTokens
    )
    const timeoutMs = boundedTimeout(input.timeoutMs ?? 10_000)
    const correlationId = boundedCorrelation(input.correlationId)
    const inputTokens = estimateTokens(prompt)
    const usage = (outputTokens: number) => ({
      inputTokens,
      outputTokens,
      estimatedCostUnits: (inputTokens + outputTokens) * this.costPerToken
    })
    if (this.latencyMs > timeoutMs) {
      return {
        status: 'failed',
        error: 'timeout',
        usage: usage(0),
        provider: 'controlled-fake',
        model: 'deterministic-v1',
        externalCall: false,
        correlationId
      }
    }
    if (this.fail) {
      return {
        status: 'failed',
        error: 'provider_error',
        usage: usage(0),
        provider: 'controlled-fake',
        model: 'deterministic-v1',
        externalCall: false,
        correlationId
      }
    }
    const rawResponse = this.response.trim()
    const text = redactSensitiveText(rawResponse).trim()
    if (
      !rawResponse ||
      looksUnsafe(rawResponse) ||
      !text ||
      looksUnsafe(text) ||
      looksUnsafe(prompt)
    ) {
      return {
        status: 'blocked',
        error: 'unsafe_output',
        usage: usage(0),
        provider: 'controlled-fake',
        model: 'deterministic-v1',
        externalCall: false,
        correlationId
      }
    }
    const bounded = text.split(/\s+/).slice(0, maxTokens).join(' ')
    return {
      status: 'succeeded',
      text: bounded,
      usage: usage(estimateTokens(bounded)),
      provider: 'controlled-fake',
      model: 'deterministic-v1',
      externalCall: false,
      correlationId
    }
  }
}

function boundedPrompt(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 32_000) {
    throw new DomainError('validation_failed', 'Model prompt is invalid')
  }
  return raw.trim()
}

function boundedCorrelation(raw: unknown): string {
  if (typeof raw !== 'string' || !/^corr_[0-9a-f-]{36}$/.test(raw)) {
    throw new DomainError('validation_failed', 'Model correlation is invalid')
  }
  return raw
}

function boundedTokens(raw: unknown, ceiling: number): number {
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw < 1 ||
    raw > ceiling
  ) {
    throw new DomainError('validation_failed', 'Model token request is invalid')
  }
  return raw
}

function boundedTimeout(raw: unknown): number {
  if (
    typeof raw !== 'number' ||
    !Number.isSafeInteger(raw) ||
    raw < 1 ||
    raw > 60_000
  ) {
    throw new DomainError('validation_failed', 'Model timeout is invalid')
  }
  return raw
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4))
}

function looksUnsafe(value: string): boolean {
  return (
    /(tool_call|function_call|grant\s+(?:admin|permission)|api[_-]?key|access[_-]?token|client[_-]?secret|password\s*[:=]|secret\s*[:=])/i.test(
      value
    ) ||
    /\b(?:sk|pk|rk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9][A-Za-z0-9._-]{7,}\b/i.test(
      value
    )
  )
}
