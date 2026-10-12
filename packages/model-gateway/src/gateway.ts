import { z } from 'zod'
import type { DataClassification } from '@cvg/shared'
import {
  ModelGatewayRequestSchema,
  type ModelGatewayEvent,
  type ModelGatewayRequest,
  type ModelProfile,
  type ModelProfileName,
  type ModelProvider,
  type ModelResult,
  type ProviderResult,
  type ProviderUsage,
  type StructuredOutputContract
} from './contracts.ts'
import {
  BudgetGuard,
  type CostBudgetLimits,
  type CostBudgetStore
} from './budget.ts'
import { TokenMeter, isValidProviderUsage } from './token-meter.ts'
import {
  CircuitBreaker,
  type CircuitBreakerOptions
} from './circuit-breaker.ts'
import {
  ModelGatewayError,
  toGatewayError,
  type ModelGatewayErrorCode
} from './errors.ts'
import {
  computeRetryDelayMs,
  DEFAULT_RETRY_POLICY,
  type RetryPolicy
} from './retry.ts'
import {
  PromptRegistry,
  PromptRegistryError,
  type PromptRecord
} from './prompt-registry.ts'
import { ModelRouter, type ModelRoutingOptions } from './router.ts'

export interface ModelGatewayOptions {
  providers: ModelProvider[]
  profiles: Partial<Record<ModelProfileName, ModelProfile>>
  prompts: PromptRegistry
  budget?: {
    store: CostBudgetStore
    limits: CostBudgetLimits
  }
  circuitBreaker?: CircuitBreaker | CircuitBreakerOptions
  routing?: ModelRoutingOptions
  retry?: Partial<RetryPolicy>
  clock?: () => Date
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  onEvent?: (event: ModelGatewayEvent) => void
  defaultTimeoutMs?: number
  maxOutputChars?: number
  /** PDSH-024: per-turn meter fed with each successful call's usage. */
  meter?: TokenMeter
}

export interface GenerateRequest<
  TStructured = unknown
> extends ModelGatewayRequest {
  structuredOutput?: StructuredOutputContract<TStructured>
  signal?: AbortSignal
}

const PROMPT_ERROR_MAP: Record<
  PromptRegistryError['code'],
  ModelGatewayErrorCode
> = {
  prompt_duplicate: 'invalid_request',
  prompt_unknown: 'prompt_unknown',
  prompt_revoked: 'prompt_revoked',
  prompt_not_effective: 'prompt_unknown',
  prompt_expired: 'prompt_unknown',
  prompt_hash_mismatch: 'prompt_hash_mismatch',
  prompt_tenant_mismatch: 'policy_denied'
}

interface Candidate {
  profile: ModelProfile
  fallbackUsed: boolean
}

/**
 * Provider-agnostic model gateway.
 *
 * Model output is untrusted input: the gateway enforces deadline, retries,
 * circuit breaking, cost budgets, prompt integrity, data-placement policy and
 * fail-closed structured output before anything reaches the domain.
 */
export class ModelGateway {
  readonly #providers = new Map<string, ModelProvider>()
  readonly #router: ModelRouter
  readonly #prompts: PromptRegistry
  readonly #budget?: BudgetGuard
  readonly #budgetLimits: CostBudgetLimits
  readonly #circuit: CircuitBreaker
  readonly #retry: RetryPolicy
  readonly #clock: () => Date
  readonly #sleep: (ms: number) => Promise<void>
  readonly #random: () => number
  readonly #onEvent?: (event: ModelGatewayEvent) => void
  readonly #defaultTimeoutMs: number
  readonly #maxOutputChars: number
  readonly #meter?: TokenMeter

  constructor(options: ModelGatewayOptions) {
    for (const provider of options.providers) {
      this.#providers.set(provider.id, provider)
    }
    this.#router = new ModelRouter(options.profiles, options.routing ?? {})
    this.#prompts = options.prompts
    this.#retry = { ...DEFAULT_RETRY_POLICY, ...(options.retry ?? {}) }
    this.#clock = options.clock ?? (() => new Date())
    this.#sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.#random = options.random ?? (() => Math.random())
    if (options.onEvent) this.#onEvent = options.onEvent
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000
    this.#maxOutputChars = options.maxOutputChars ?? 32_000
    if (options.meter) this.#meter = options.meter
    this.#budgetLimits = options.budget?.limits ?? {}
    if (options.budget) {
      this.#budget = new BudgetGuard({
        store: options.budget.store,
        limits: options.budget.limits,
        clock: this.#clock
      })
    }
    this.#circuit =
      options.circuitBreaker instanceof CircuitBreaker
        ? options.circuitBreaker
        : new CircuitBreaker({
            ...(options.circuitBreaker ?? {}),
            clock: () => this.#clock().getTime(),
            onTransition: (transition) => {
              this.#emit({
                type: 'model.circuit.transition',
                requestId: 'n/a',
                tenantId: 'n/a',
                correlationId: 'n/a',
                circuitState: transition.to,
                detail: `${transition.from}->${transition.to}`
              })
              if (
                options.circuitBreaker &&
                !(options.circuitBreaker instanceof CircuitBreaker) &&
                options.circuitBreaker.onTransition
              ) {
                options.circuitBreaker.onTransition(transition)
              }
            }
          })
  }

  async generate<TStructured = unknown>(
    request: GenerateRequest<TStructured>
  ): Promise<ModelResult<TStructured>> {
    const { structuredOutput, signal, ...wire } = request
    const parsed = ModelGatewayRequestSchema.safeParse(wire)
    if (!parsed.success) {
      throw new ModelGatewayError(
        'invalid_request',
        'Model request failed schema validation'
      )
    }
    const normalized = parsed.data
    const dataClassification =
      normalized.dataClassification as DataClassification
    const startedAt = this.#clock()

    const prompt = this.#resolvePrompt(normalized, dataClassification)
    const route = this.#router.resolve({
      requestedProfile: normalized.modelProfile,
      ...(normalized.task !== undefined ? { task: normalized.task } : {}),
      dataClassification
    })
    if (route.substitutedProfile) {
      this.#emit({
        type: 'model.routing.substituted',
        requestId: normalized.requestId,
        tenantId: normalized.tenantId,
        correlationId: normalized.correlationId,
        profile: route.profile.name,
        detail: `substituted:${route.substitutedProfile}`
      })
    }

    const candidates: Candidate[] = [
      { profile: route.profile, fallbackUsed: false }
    ]
    const fallback = this.#router.fallbackFor(route.profile)
    if (fallback) {
      candidates.push({ profile: fallback, fallbackUsed: true })
    }

    let lastError: ModelGatewayError | undefined
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (!candidate) continue
      try {
        const result = await this.#runCandidate(
          normalized,
          candidate,
          prompt,
          startedAt,
          structuredOutput,
          signal
        )
        return result as ModelResult<TStructured>
      } catch (error) {
        const gatewayError = toGatewayError(error)
        lastError = gatewayError
        const hasNext = index < candidates.length - 1
        if (hasNext && gatewayError.retryable) {
          const nextProfile = candidates[index + 1]?.profile.name
          this.#emit({
            type: 'model.routing.fallback',
            requestId: normalized.requestId,
            tenantId: normalized.tenantId,
            correlationId: normalized.correlationId,
            ...(nextProfile ? { profile: nextProfile } : {}),
            code: gatewayError.code
          })
          continue
        }
        throw gatewayError
      }
    }
    throw (
      lastError ??
      new ModelGatewayError('internal_error', 'No model candidate executed')
    )
  }

  circuitSnapshot(): Record<string, string> {
    return this.#circuit.snapshot()
  }

  async #runCandidate(
    request: z.infer<typeof ModelGatewayRequestSchema>,
    candidate: Candidate,
    prompt: PromptRecord,
    startedAt: Date,
    structuredOutput: StructuredOutputContract | undefined,
    externalSignal: AbortSignal | undefined
  ): Promise<ModelResult<unknown>> {
    const { profile } = candidate
    const provider = this.#providers.get(profile.providerId)
    if (!provider) {
      throw new ModelGatewayError(
        'provider_unknown',
        `Provider ${profile.providerId} is not registered`
      )
    }

    const estimatedCost = request.estimatedCostUsd ?? profile.estimatedCostUsd
    let reservedKeys: string[] = []
    if (this.#budget) {
      const authorization = this.#budget.authorize({
        request,
        estimatedCostUsd: estimatedCost
      })
      if (!authorization.allowed) {
        this.#emit({
          type: 'model.budget.denied',
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          code: authorization.deniedScope ?? 'budget_exceeded'
        })
        throw new ModelGatewayError(
          'budget_exceeded',
          `Model budget exceeded for ${authorization.deniedScope ?? 'scope'}`
        )
      }
      reservedKeys = authorization.reservedKeys
    }

    const circuitKey = `${provider.id}:${profile.model}`
    const timeoutMs =
      request.timeoutMs ?? profile.timeoutMs ?? this.#defaultTimeoutMs
    const maxRetries = profile.maxRetries
    const attemptsAllowed = Math.max(1, maxRetries + 1)
    let attempt = 0
    let lastError: ModelGatewayError | undefined

    while (attempt < attemptsAllowed) {
      attempt += 1
      if (!this.#circuit.canRequest(circuitKey)) {
        throw new ModelGatewayError(
          'circuit_open',
          `Circuit breaker open for ${circuitKey}`
        )
      }
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
      const onExternalAbort = () => controller.abort()
      externalSignal?.addEventListener('abort', onExternalAbort, { once: true })

      this.#emit({
        type: 'model.call.started',
        requestId: request.requestId,
        tenantId: request.tenantId,
        correlationId: request.correlationId,
        providerId: provider.id,
        model: profile.model,
        profile: profile.name,
        attempt
      })

      try {
        const providerResult = await provider.execute({
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          model: profile.model,
          input: request.input,
          temperature: profile.temperature,
          maxTokens: request.maxTokens ?? profile.maxTokens,
          promptSha256: prompt.sha256,
          ...(structuredOutput
            ? { structuredSchemaName: structuredOutput.schemaName }
            : {}),
          signal: controller.signal,
          timeoutMs,
          ...(request.metadata ? { metadata: request.metadata } : {})
        })

        const output = this.#parseOutput(providerResult, structuredOutput)
        const usage = providerResult.usage
        // Fail closed before settle/meter: malformed usage must not become a
        // silent NaN cost (PDSH-024).
        if (!isValidProviderUsage(usage)) {
          throw new ModelGatewayError(
            'provider_malformed_response',
            `Provider ${provider.id} returned invalid token usage`
          )
        }
        const costUsd = this.#computeCost(profile, usage)
        this.#meter?.record(usage)
        this.#circuit.onSuccess(circuitKey)
        if (this.#budget) {
          this.#budget.settle({
            reservedKeys,
            estimatedCostUsd: estimatedCost,
            actualCostUsd: costUsd
          })
        }
        const latencyMs = this.#clock().getTime() - startedAt.getTime()
        this.#emit({
          type: 'model.call.completed',
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          providerId: provider.id,
          model: profile.model,
          profile: profile.name,
          attempt,
          costUsd,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens
        })
        return {
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          providerId: provider.id,
          model: profile.model,
          profile: profile.name,
          output,
          usage,
          costUsd,
          attempts: attempt,
          latencyMs,
          promptSha256: prompt.sha256,
          createdAt: this.#clock().toISOString(),
          fallbackUsed: candidate.fallbackUsed,
          ...(routeSubstitution(profile.name, request.modelProfile)
            ? { substitutedProfile: request.modelProfile }
            : {})
        }
      } catch (error) {
        const gatewayError =
          externalSignal?.aborted === true
            ? new ModelGatewayError('cancelled', 'Model call was cancelled')
            : toGatewayError(error, provider.id)
        lastError = gatewayError
        if (this.#countsAgainstCircuit(gatewayError)) {
          this.#circuit.onFailure(circuitKey)
        }
        const canRetry = gatewayError.retryable && attempt < attemptsAllowed
        if (canRetry) {
          const delayMs = computeRetryDelayMs({
            attempt,
            policy: this.#retry,
            random: this.#random
          })
          this.#emit({
            type: 'model.retry.scheduled',
            requestId: request.requestId,
            tenantId: request.tenantId,
            correlationId: request.correlationId,
            providerId: provider.id,
            model: profile.model,
            profile: profile.name,
            attempt: attempt + 1,
            delayMs,
            code: gatewayError.code
          })
          await this.#sleep(delayMs)
          continue
        }
        this.#emit({
          type: 'model.call.failed',
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          providerId: provider.id,
          model: profile.model,
          profile: profile.name,
          attempt,
          code: gatewayError.code
        })
        throw gatewayError
      } finally {
        clearTimeout(timeoutHandle)
        externalSignal?.removeEventListener('abort', onExternalAbort)
      }
    }

    throw (
      lastError ??
      new ModelGatewayError('internal_error', 'Model call exhausted attempts')
    )
  }

  #parseOutput(
    providerResult: ProviderResult,
    contract: StructuredOutputContract | undefined
  ): { text: string; structured?: unknown } {
    let text = providerResult.text
    if (text.length > this.#maxOutputChars) {
      text = text.slice(0, this.#maxOutputChars)
    }
    if (!contract) {
      return { text }
    }
    let json: unknown
    try {
      json = JSON.parse(providerResult.text)
    } catch {
      throw new ModelGatewayError(
        'schema_invalid',
        `Structured output ${contract.schemaName} was not valid JSON`
      )
    }
    const parsed = contract.schema.safeParse(json)
    if (!parsed.success) {
      throw new ModelGatewayError(
        'schema_invalid',
        `Structured output ${contract.schemaName} failed schema validation`
      )
    }
    return { text, structured: parsed.data }
  }

  #computeCost(profile: ModelProfile, usage: ProviderUsage): number {
    const input = (usage.inputTokens / 1000) * profile.pricing.inputPer1kUsd
    const output = (usage.outputTokens / 1000) * profile.pricing.outputPer1kUsd
    return Math.round((input + output) * 1_000_000) / 1_000_000
  }

  #countsAgainstCircuit(error: ModelGatewayError): boolean {
    return (
      error.code === 'provider_timeout' ||
      error.code === 'provider_unavailable' ||
      error.code === 'provider_rate_limited' ||
      error.code === 'provider_connection_reset' ||
      error.code === 'provider_malformed_response' ||
      error.code === 'internal_error'
    )
  }

  #resolvePrompt(
    request: z.infer<typeof ModelGatewayRequestSchema>,
    dataClassification: DataClassification
  ): PromptRecord {
    try {
      const record = this.#prompts.resolve(
        {
          promptId: request.promptId,
          version: request.promptVersion,
          ...(request.promptSha256 ? { sha256: request.promptSha256 } : {})
        },
        { tenantId: request.tenantId, at: this.#clock() }
      )
      if (record.classification !== dataClassification) {
        // Data class of the request must never be broader than the prompt's own
        // class; mismatches are resolved to the strictest of the two.
        const strictest =
          classificationRank(record.classification) >=
          classificationRank(dataClassification)
            ? record.classification
            : dataClassification
        if (strictest !== record.classification) {
          throw new ModelGatewayError(
            'policy_denied',
            'Request data classification exceeds the approved prompt class'
          )
        }
      }
      return record
    } catch (error) {
      if (error instanceof ModelGatewayError) throw error
      if (error instanceof PromptRegistryError) {
        throw new ModelGatewayError(
          PROMPT_ERROR_MAP[error.code],
          `Prompt reference rejected: ${error.code}`
        )
      }
      throw error
    }
  }

  #emit(event: ModelGatewayEvent): void {
    this.#onEvent?.(event)
  }
}

function classificationRank(classification: DataClassification): number {
  const order: DataClassification[] = [
    'PUBLIC',
    'INTERNAL',
    'CONFIDENTIAL',
    'CLINICAL',
    'FINANCIAL',
    'CREDENTIAL'
  ]
  return order.indexOf(classification)
}

function routeSubstitution(
  profile: ModelProfileName,
  requested: ModelProfileName
): boolean {
  return profile !== requested
}
