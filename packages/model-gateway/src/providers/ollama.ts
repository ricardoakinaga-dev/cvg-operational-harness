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
import {
  assertResponseSize,
  networkError,
  providerHttpError
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
      throw networkError(this.id, error)
    }

    if (!response.ok) {
      throw providerHttpError(this.id, response.status)
    }

    let rawBody: string
    try {
      rawBody = await response.text()
    } catch (error) {
      throw networkError(this.id, error)
    }
    assertResponseSize(this.id, rawBody, this.#maxResponseBytes)

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
      usage: {
        inputTokens: parsed.data.prompt_eval_count ?? 0,
        outputTokens: parsed.data.eval_count ?? 0
      },
      providerId: this.id,
      model: this.#model,
      externalCall: false
    }
  }
}
