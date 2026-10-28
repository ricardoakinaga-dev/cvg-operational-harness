import { z } from 'zod'
import {
  evaluateOutboundUrl,
  fetchWithSsrfGuard,
  isLoopbackHostname,
  withoutTrailingSlashes
} from '@cvg/shared'
import type { EgressDns } from '@cvg/shared'
import type {
  ModelProvider,
  ProviderRequest,
  ProviderResult
} from '../contracts.ts'
import { ModelProviderError } from '../errors.ts'
import { verifyPromptBinding } from '../prompt-binding.ts'
import {
  networkError,
  providerHttpError,
  readBoundedText
} from './http-errors.ts'
import { fetchWithResolvedAddress } from './ssrf-node.ts'
import {
  DEFAULT_MAX_RESPONSE_BYTES,
  combineTimeoutSignal,
  type FetchLike
} from './openai-compatible.ts'

export interface OllamaProviderOptions {
  id?: string
  baseUrl?: string
  model: string
  apiKey?: string
  fetchImpl?: FetchLike
  maxResponseBytes?: number
  allowHttp?: boolean
  /**
   * AUD19-007 — explicit opt-in for loopback/private networks (local
   * homologation). Default false: private/reserved addresses are denied.
   */
  allowPrivateNetworks?: boolean
  /** AUD19-007 — injectable DNS for the composed egress guard (tests). */
  dnsLookup?: EgressDns['lookup']
}

const OllamaResponseSchema = z.object({
  message: z.object({ content: z.string().optional() }).optional(),
  response: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
  done: z.boolean().optional()
})

/**
 * Local Ollama provider. Defaults to loopback; remote deployment must provide
 * an explicit base URL and API key. Never exposed publicly by default.
 */
export class OllamaProvider implements ModelProvider {
  readonly id: string
  readonly location = 'local' as const
  readonly models: readonly string[]
  readonly #baseUrl: string
  readonly #model: string
  readonly #apiKey?: string
  readonly #fetch: FetchLike
  readonly #maxResponseBytes: number
  readonly #allowedHosts: string[]
  readonly #allowHttp: boolean
  readonly #allowPrivateNetworks: boolean
  readonly #dnsLookup: EgressDns['lookup'] | undefined
  readonly #boundFetch: typeof fetchWithResolvedAddress | undefined

  constructor(options: OllamaProviderOptions) {
    const baseUrl = withoutTrailingSlashes(
      (options.baseUrl ?? 'http://127.0.0.1:11434').trim()
    )
    const parsedBaseUrl = new URL(baseUrl)
    const allowPrivateNetworks = options.allowPrivateNetworks ?? false
    const allowHttp =
      parsedBaseUrl.protocol === 'http:' &&
      allowPrivateNetworks &&
      isLoopbackHostname(parsedBaseUrl.hostname)
    const guard = evaluateOutboundUrl(baseUrl, {
      allowedHosts: [new URL(baseUrl).hostname.toLowerCase()],
      allowedProtocols: allowHttp ? ['https:', 'http:'] : ['https:'],
      allowPrivateNetworks
    })
    if (!guard.allowed) {
      throw new ModelProviderError(
        options.id ?? 'ollama',
        'invalid_request',
        `Ollama base URL rejected: ${guard.reason}`
      )
    }
    this.id = options.id ?? 'ollama'
    this.models = [options.model]
    this.#baseUrl = baseUrl
    this.#model = options.model
    if (options.apiKey !== undefined) this.#apiKey = options.apiKey
    this.#fetch = options.fetchImpl ?? (globalThis.fetch as FetchLike)
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.#allowedHosts = [parsedBaseUrl.hostname.toLowerCase()]
    this.#allowHttp = allowHttp
    this.#allowPrivateNetworks = allowPrivateNetworks
    this.#dnsLookup = options.dnsLookup
    this.#boundFetch = options.fetchImpl ? undefined : fetchWithResolvedAddress
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const bindingError = verifyPromptBinding(request)
    if (bindingError !== undefined) {
      throw new ModelProviderError(this.id, 'invalid_request', bindingError)
    }
    const endpoint = `${this.#baseUrl}/api/chat`
    const signal = combineTimeoutSignal(request.signal, request.timeoutMs)
    const messages = [
      ...(request.input.system
        ? [{ role: 'system' as const, content: request.input.system }]
        : []),
      ...request.input.messages
    ]
    const body: Record<string, unknown> = {
      model: this.#model,
      messages,
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens
      }
    }
    if (request.structuredSchemaName) {
      body.format = 'json'
    }

    let response: Response
    try {
      const fetchImpl = (url: string, requestInit: Record<string, unknown>) =>
        this.#fetch(url, requestInit as RequestInit)
      const deps = this.#boundFetch
        ? {
            ...(this.#dnsLookup ? { dnsLookup: this.#dnsLookup } : {}),
            boundFetchImpl: this.#boundFetch
          }
        : { ...(this.#dnsLookup ? { dnsLookup: this.#dnsLookup } : {}) }
      response = await fetchWithSsrfGuard(
        fetchImpl,
        endpoint,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(this.#apiKey ? { authorization: `Bearer ${this.#apiKey}` } : {})
          },
          body: JSON.stringify(body),
          signal,
          // The bound transport cuts the body at the ceiling (SPEC 0248).
          maxResponseBytes: this.#maxResponseBytes,
          redirect: 'manual'
        },
        {
          allowedHosts: this.#allowedHosts,
          allowedProtocols: this.#allowHttp ? ['https:', 'http:'] : ['https:'],
          allowPrivateNetworks: this.#allowPrivateNetworks,
          allowLoopbackOnly: this.#allowHttp,
          maxRedirects: 0
        },
        deps
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'UnsafeUrlError') {
        throw new ModelProviderError(
          this.id,
          'invalid_request',
          `Ollama endpoint rejected: ${error.message}`
        )
      }
      throw networkError(this.id, error, this.#maxResponseBytes)
    }

    if (!response.ok) {
      // The known HTTP status wins; the unread body is released (D011).
      await response.body?.cancel().catch(() => undefined)
      throw providerHttpError(this.id, response.status)
    }

    const rawBody = await readBoundedText(
      this.id,
      response,
      this.#maxResponseBytes,
      signal
    )

    let parsedJson: unknown
    try {
      parsedJson = JSON.parse(rawBody)
    } catch {
      throw new ModelProviderError(
        this.id,
        'malformed_response',
        'Ollama returned invalid JSON'
      )
    }
    const parsed = OllamaResponseSchema.safeParse(parsedJson)
    if (!parsed.success) {
      throw new ModelProviderError(
        this.id,
        'malformed_response',
        'Ollama response did not match the expected contract'
      )
    }
    const text = parsed.data.message?.content ?? parsed.data.response ?? ''
    return {
      text,
      // SPEC 0267 §3.3: absent counters are unknown, never zero.
      ...(parsed.data.prompt_eval_count !== undefined &&
      parsed.data.eval_count !== undefined
        ? {
            usage: {
              inputTokens: parsed.data.prompt_eval_count,
              outputTokens: parsed.data.eval_count
            }
          }
        : {}),
      providerId: this.id,
      model: this.#model,
      externalCall: false
    }
  }
}
