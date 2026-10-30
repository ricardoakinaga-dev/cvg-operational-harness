import { z } from 'zod'
import type { DataClassification } from '@cvg/shared'
import {
  ModelGatewayRequestSchema,
  type ModelGatewayEvent,
  type ModelGatewayRequest,
  type ModelProfile,
  type ModelProfileName,
  type ModelProvider,
  type ModelInput,
  type PromptBinding,
  type ModelResult,
  type ProviderRequest,
  type ProviderResult,
  type ProviderUsage,
  type UsageStatus,
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
import { renderGovernedInput } from './prompt-binding.ts'
import {
  frozenProviderRequest,
  frozenRequestIdentity,
  freezeRequestParts
} from './frozen-request.ts'
import { assembleProviderStream, type StreamProgress } from './stream.ts'

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
  /**
   * SPEC 0289 D1-A, off by default: put the canonical request bytes in
   * `model.call.started`. The bytes are request content, so enable it only
   * with an event sink that is protected per tenant and has a retention.
   */
  recordFrozenRequests?: boolean
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
  readonly #recordFrozenRequests: boolean

  constructor(options: ModelGatewayOptions) {
    for (const provider of options.providers) {
      this.#providers.set(provider.id, provider)
    }
    // SPEC 0285 D3: a declared window must be a positive safe integer.
    for (const profile of Object.values(options.profiles)) {
      const window = profile?.contextWindow
      if (
        window !== undefined &&
        !(Number.isSafeInteger(window) && window > 0)
      ) {
        throw new ModelGatewayError(
          'invalid_request',
          `Profile ${profile?.name} has an invalid contextWindow`
        )
      }
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
    this.#recordFrozenRequests = options.recordFrozenRequests === true
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

    const { record: prompt, effectiveClassification } = this.#resolvePrompt(
      normalized,
      dataClassification
    )
    // SPEC 0267 §3.1: only the approved instruction reaches the provider.
    const rendered = renderGovernedInput(normalized.input, prompt)
    // SPEC 0267 §3.2: the strictest class decides the route.
    const route = this.#router.resolve({
      requestedProfile: normalized.modelProfile,
      ...(normalized.task !== undefined ? { task: normalized.task } : {}),
      dataClassification: effectiveClassification
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
          rendered,
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
    rendered: { input: ModelInput; binding: PromptBinding },
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
    // SPEC 0284 T-2: a streaming profile never falls back to `execute`.
    if (profile.streaming === true && provider.executeStream === undefined) {
      throw new ModelGatewayError(
        'invalid_request',
        `Provider ${provider.id} has no stream path for a streaming profile`
      )
    }
    // F13: an aborted caller never reserves budget nor reaches a provider.
    throwIfCancelled(externalSignal)
    // SPEC 0285 D2/D3: the request size is projected once, before any
    // reservation; a declared window that it overflows refuses here, with no
    // provider call, no charge and no fallback (the request is the problem).
    const projectedInputTokens = projectInputTokens(rendered.input)
    if (
      profile.contextWindow !== undefined &&
      projectedInputTokens + (request.maxTokens ?? profile.maxTokens) >
        profile.contextWindow
    ) {
      throw new ModelGatewayError(
        'invalid_request',
        `Request does not fit the context window of profile ${profile.name}`
      )
    }

    const estimatedCost = request.estimatedCostUsd ?? profile.estimatedCostUsd
    // F14: the restrictive combination of the request and profile ceilings
    // is applied to the estimate before any reservation; a non-finite
    // ceiling or estimate (NaN or infinite) fails closed (SPEC 0248 R8).
    const ceiling = Math.min(
      profile.maxCostUsd,
      request.maxCostUsd ?? Number.POSITIVE_INFINITY
    )
    if (
      !(
        Number.isFinite(ceiling) &&
        Number.isFinite(estimatedCost) &&
        estimatedCost <= ceiling
      )
    ) {
      this.#emit({
        type: 'model.budget.denied',
        requestId: request.requestId,
        tenantId: request.tenantId,
        correlationId: request.correlationId,
        profile: profile.name,
        code: 'cost_ceiling'
      })
      throw new ModelGatewayError(
        'budget_exceeded',
        'Model call estimate exceeds the cost ceiling'
      )
    }
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
    // SPEC 0289: the request the adapter receives is built and frozen once per
    // candidate (own copies of `metadata` and `promptBinding`), and its identity
    // is computed from those frozen parts. A write by an adapter cannot reach a
    // retry or the fallback.
    const frozenParts = freezeRequestParts({
      requestId: request.requestId,
      tenantId: request.tenantId,
      correlationId: request.correlationId,
      model: profile.model,
      input: rendered.input,
      temperature: profile.temperature,
      maxTokens: request.maxTokens ?? profile.maxTokens,
      promptSha256: prompt.sha256,
      promptBinding: rendered.binding,
      ...(structuredOutput
        ? { structuredSchemaName: structuredOutput.schemaName }
        : {}),
      timeoutMs,
      ...(request.metadata ? { metadata: request.metadata } : {})
    })
    const frozenIdentity = frozenRequestIdentity(frozenParts)
    const maxRetries = profile.maxRetries
    const attemptsAllowed = Math.max(1, maxRetries + 1)
    let attempt = 0
    let lastError: ModelGatewayError | undefined
    // The reservation covers the first accounted attempt only; every later
    // executed attempt is charged in full (SPEC 0267 §3.3, no refunds).
    let reservationSettled = false
    // SPEC 0285 (review P2): a settlement store that failed stops retries.
    let settlementFailed = false

    while (attempt < attemptsAllowed) {
      attempt += 1
      // SPEC 0167/013: a revoked or changed prompt blocks retry and fallback.
      this.#assertPromptStillApproved(request, rendered.binding)
      if (!this.#circuit.canRequest(circuitKey)) {
        throw new ModelGatewayError(
          'circuit_open',
          `Circuit breaker open for ${circuitKey}`
        )
      }
      const controller = new AbortController()
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
      // The provider signal inherits the caller's state, including an abort
      // that already happened (F13).
      const signal = externalSignal
        ? AbortSignal.any([controller.signal, externalSignal])
        : controller.signal

      let accounted:
        | { usage: ProviderUsage; costUsd: number; status: UsageStatus }
        | undefined
      const progress: StreamProgress = { outputSeen: false }

      this.#emit({
        type: 'model.call.started',
        requestId: request.requestId,
        tenantId: request.tenantId,
        correlationId: request.correlationId,
        providerId: provider.id,
        model: profile.model,
        profile: profile.name,
        attempt,
        projectedInputTokens,
        requestSha256: frozenIdentity.sha256,
        requestBytes: frozenIdentity.bytes,
        ...(this.#recordFrozenRequests
          ? { frozenRequest: frozenIdentity.canonical }
          : {})
      })

      try {
        const providerRequest = frozenProviderRequest(frozenParts, signal)
        const providerResult: ProviderResult = profile.streaming
          ? await this.#runStream(
              provider,
              providerRequest,
              signal,
              externalSignal,
              progress
            )
          : await provider.execute(providerRequest)

        // SPEC 0267 §3.3: usage is validated and accounted before the output
        // is parsed, so a rejected output still costs what it consumed.
        const reportedUsage = providerResult.usage
        // Fail closed: malformed usage must not become a silent NaN cost
        // (PDSH-024).
        if (
          reportedUsage !== undefined &&
          !isValidProviderUsage(reportedUsage)
        ) {
          throw new ModelGatewayError(
            'provider_malformed_response',
            `Provider ${provider.id} returned invalid token usage`
          )
        }
        const usageStatus: UsageStatus =
          reportedUsage === undefined ? 'unreported' : 'reported'
        const usage =
          reportedUsage ??
          conservativeUsage(
            rendered.input,
            request.maxTokens ?? profile.maxTokens
          )
        const costUsd =
          reportedUsage === undefined
            ? Math.max(estimatedCost, this.#computeCost(profile, usage))
            : this.#computeCost(profile, usage)
        if (reportedUsage === undefined) {
          this.#meter?.recordUnreported()
        } else {
          this.#meter?.record(usage)
        }
        // SPEC 0285 (review P2): the attempt is accounted before the fallible
        // settlement port, so a store failure never charges it a second time
        // and the terminal event still carries what was measured.
        accounted = { usage, costUsd, status: usageStatus }
        if (this.#budget) {
          try {
            this.#budget.settle({
              reservedKeys,
              estimatedCostUsd: reservationSettled ? 0 : estimatedCost,
              actualCostUsd: costUsd
            })
          } catch (error) {
            settlementFailed = true
            throw error
          }
        }
        reservationSettled = true

        const output = this.#parseOutput(providerResult, structuredOutput)
        this.#circuit.onSuccess(circuitKey)
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
          outputTokens: usage.outputTokens,
          // The real cost is never hidden; an overrun of the ceiling is
          // reported with the result (SPEC 0248 §3.4).
          ...completionDetail(usageStatus, costUsd > ceiling)
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
          usageStatus,
          costUsd,
          attempts: attempt,
          latencyMs,
          promptSha256: prompt.sha256,
          promptBinding: rendered.binding,
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
        // SPEC 0284 §7.3: a stream that produced output and then failed or
        // was cancelled consumed an unknown amount. It is charged the
        // conservative bound, never zero and never a partial count.
        if (profile.streaming && progress.outputSeen && !accounted) {
          const usage = conservativeUsage(
            rendered.input,
            request.maxTokens ?? profile.maxTokens
          )
          const costUsd = Math.max(
            estimatedCost,
            this.#computeCost(profile, usage)
          )
          this.#meter?.recordUnreported()
          accounted = { usage, costUsd, status: 'unreported' }
          if (this.#budget) {
            try {
              this.#budget.settle({
                reservedKeys,
                estimatedCostUsd: reservationSettled ? 0 : estimatedCost,
                actualCostUsd: costUsd
              })
              reservationSettled = true
            } catch {
              // The attempt is already counted; the terminal event below must
              // still be emitted, and no further attempt may spend unsettled.
              settlementFailed = true
            }
          } else {
            reservationSettled = true
          }
        }
        if (this.#countsAgainstCircuit(gatewayError)) {
          this.#circuit.onFailure(circuitKey)
        }
        // SPEC 0285 D1: every started attempt ends in exactly one terminal
        // event, a retried one included, carrying what it was charged.
        this.#emit({
          type: 'model.call.failed',
          requestId: request.requestId,
          tenantId: request.tenantId,
          correlationId: request.correlationId,
          providerId: provider.id,
          model: profile.model,
          profile: profile.name,
          attempt,
          code: gatewayError.code,
          // An executed call stays accounted even when its output failed.
          ...(accounted
            ? {
                costUsd: accounted.costUsd,
                inputTokens: accounted.usage.inputTokens,
                outputTokens: accounted.usage.outputTokens,
                ...(accounted.status === 'unreported'
                  ? { detail: 'usage_unreported' }
                  : {})
              }
            : {})
        })
        const canRetry =
          !settlementFailed &&
          gatewayError.retryable &&
          attempt < attemptsAllowed
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
          await this.#backoff(delayMs, externalSignal)
          if (externalSignal?.aborted) {
            // SPEC 0285 T-1: the attempt the backoff waited for never
            // started; it is closed as such and carries no usage.
            this.#emit({
              type: 'model.call.failed',
              requestId: request.requestId,
              tenantId: request.tenantId,
              correlationId: request.correlationId,
              providerId: provider.id,
              model: profile.model,
              profile: profile.name,
              attempt: attempt + 1,
              code: 'cancelled',
              detail: 'not_started'
            })
            throw new ModelGatewayError('cancelled', 'Model call was cancelled')
          }
          continue
        }
        // SPEC 0285 (review R2 P2): an attempt whose cost could not be settled
        // stops the whole request, fallback included; its terminal event above
        // already carries the cause and the usage.
        if (settlementFailed) {
          throw new ModelGatewayError(
            'internal_error',
            'Model call stopped: its cost could not be settled',
            { retryable: false }
          )
        }
        throw gatewayError
      } finally {
        clearTimeout(timeoutHandle)
      }
    }

    throw (
      lastError ??
      new ModelGatewayError('internal_error', 'Model call exhausted attempts')
    )
  }

  /** Retry backoff that ends early when the caller aborts (F13). */
  async #backoff(ms: number, signal: AbortSignal | undefined): Promise<void> {
    if (!signal) {
      await this.#sleep(ms)
      return
    }
    let onAbort!: () => void
    const aborted = new Promise<void>((resolve) => {
      onAbort = resolve
      signal.addEventListener('abort', onAbort, { once: true })
    })
    try {
      await Promise.race([this.#sleep(ms), aborted])
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }

  async #runStream(
    provider: ModelProvider,
    providerRequest: ProviderRequest,
    signal: AbortSignal,
    externalSignal: AbortSignal | undefined,
    progress: StreamProgress
  ): Promise<ProviderResult> {
    const outcome = await assembleProviderStream(
      provider.executeStream!(providerRequest),
      { signal, externalSignal, progress }
    )
    return {
      text: outcome.text,
      ...(outcome.usage !== undefined ? { usage: outcome.usage } : {}),
      providerId: provider.id,
      model: providerRequest.model,
      externalCall: provider.location === 'external',
      finishReason: outcome.finishReason
    }
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
  ): { record: PromptRecord; effectiveClassification: DataClassification } {
    try {
      const record = this.#prompts.resolve(
        {
          promptId: request.promptId,
          version: request.promptVersion,
          ...(request.promptSha256 ? { sha256: request.promptSha256 } : {})
        },
        { tenantId: request.tenantId, at: this.#clock() }
      )
      // SPEC 0267 §3.2: the prompt class is both the class of its content and
      // the ceiling of the data it may be combined with. A broader request is
      // refused; otherwise the strictest class (the prompt's) governs routing.
      if (
        classificationRank(dataClassification) >
        classificationRank(record.classification)
      ) {
        throw new ModelGatewayError(
          'policy_denied',
          'Request data classification exceeds the approved prompt class'
        )
      }
      return { record, effectiveClassification: record.classification }
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

  #assertPromptStillApproved(
    request: z.infer<typeof ModelGatewayRequestSchema>,
    binding: PromptBinding
  ): void {
    const { record } = this.#resolvePrompt(
      request,
      request.dataClassification as DataClassification
    )
    if (record.sha256 !== binding.registrySha256) {
      throw new ModelGatewayError(
        'prompt_hash_mismatch',
        'Approved prompt changed after rendering'
      )
    }
  }

  #emit(event: ModelGatewayEvent): void {
    this.#onEvent?.(event)
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new ModelGatewayError('cancelled', 'Model call was cancelled')
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

/**
 * Upper bound used when a provider reports no counters: every UTF-8 byte of
 * the rendered input counts as an input token, and the output reaches the
 * call limit. It is an accounting bound, never a measurement.
 */
function conservativeUsage(
  input: ModelInput,
  maxTokens: number
): ProviderUsage {
  const bytes =
    Buffer.byteLength(input.system ?? '', 'utf8') +
    input.messages.reduce(
      (total, message) => total + Buffer.byteLength(message.content, 'utf8'),
      0
    )
  return { inputTokens: bytes, outputTokens: maxTokens }
}

/**
 * SPEC 0285 D2: fixed-density projection of the request size, 4 UTF-8 bytes
 * per token plus 4 tokens of framing per message (the system prompt counts as
 * one). An estimate for pressure and the window check, never a measurement.
 */
function projectInputTokens(input: ModelInput): number {
  const bytes =
    Buffer.byteLength(input.system ?? '', 'utf8') +
    input.messages.reduce(
      (total, message) => total + Buffer.byteLength(message.content, 'utf8'),
      0
    )
  const framed = input.messages.length + (input.system ? 1 : 0)
  return Math.ceil(bytes / 4) + 4 * framed
}

function completionDetail(
  usageStatus: UsageStatus,
  overCeiling: boolean
): { detail?: string } {
  const details = [
    ...(usageStatus === 'unreported' ? ['usage_unreported'] : []),
    ...(overCeiling ? ['cost_ceiling_exceeded'] : [])
  ]
  return details.length > 0 ? { detail: details.join(',') } : {}
}

function routeSubstitution(
  profile: ModelProfileName,
  requested: ModelProfileName
): boolean {
  return profile !== requested
}
