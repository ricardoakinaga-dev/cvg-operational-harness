import type {
  ModelProvider,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'

export interface DeterministicProviderOptions {
  id?: string
  model?: string
  latencyMs?: number
  respond?: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>
}

/**
 * Controlled deterministic provider. Used by tests, evals and dry runs; it
 * never performs network calls and always reports externalCall: false.
 */
export class DeterministicModelProvider implements ModelProvider {
  readonly id: string
  readonly location = 'local' as const
  readonly models: readonly string[]
  readonly #latencyMs: number
  readonly #respond: (
    request: ProviderRequest
  ) => ProviderResult | Promise<ProviderResult>

  constructor(options: DeterministicProviderOptions = {}) {
    this.id = options.id ?? 'deterministic'
    this.models = [options.model ?? 'deterministic-v1']
    this.#latencyMs = Math.max(0, options.latencyMs ?? 0)
    this.#respond =
      options.respond ??
      ((request) => ({
        text: `deterministic:${request.model}`,
        usage: { inputTokens: 0, outputTokens: 0 },
        providerId: this.id,
        model: request.model,
        externalCall: false,
        finishReason: 'stop'
      }))
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    if (this.#latencyMs > 0) {
      await abortableDelay(this.#latencyMs, request.signal)
    }
    if (request.signal.aborted) {
      throw abortError()
    }
    return this.#respond(request)
  }
}

function abortError(): Error {
  const error = new Error('Provider call aborted')
  error.name = 'AbortError'
  return error
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
