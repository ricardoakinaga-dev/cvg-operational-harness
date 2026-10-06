import { z } from 'zod'
import {
  evaluateOutboundUrl,
  fetchWithSsrfGuard,
  isLoopbackHostname,
  withoutTrailingSlashes
} from '@cvg/shared'
import type { EgressDns } from '@cvg/shared'
import type {
  ModelLocation,
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

export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface OpenAICompatibleProviderOptions {
  id: string
  baseUrl: string
  model: string
  location: ModelLocation
  apiKey?: string
  requiresApiKey?: boolean
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

const OpenAIResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().nullable().optional()
        }),
        finish_reason: z.string().optional()
      })
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional()
    })
    .optional()
})

/**
 * OpenAI-compatible provider (OpenAI, vLLM, llama.cpp server, ...). The domain
 * never imports provider SDKs: everything flows through this adapter.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly id: string
  readonly location: ModelLocation
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

  constructor(options: OpenAICompatibleProviderOptions) {
    const baseUrl = withoutTrailingSlashes(options.baseUrl.trim())
    const hostname = new URL(baseUrl).hostname.toLowerCase()
    const isLocal = options.location === 'local'
    const allowPrivateNetworks = options.allowPrivateNetworks ?? false
    const allowHttp =
      options.allowHttp === true &&
      isLocal &&
      allowPrivateNetworks &&
      isLoopbackHostname(hostname)
    const guard = evaluateOutboundUrl(baseUrl, {
      allowedProtocols: allowHttp ? ['https:', 'http:'] : ['https:'],
      ...(isLocal ? { allowedHosts: [hostname] } : {}),
      allowPrivateNetworks
    })
    if (!guard.allowed) {
      throw new ModelProviderError(
        options.id,
        'invalid_request',
        `Provider base URL rejected: ${guard.reason}`
      )
    }
    const requiresApiKey =
      options.requiresApiKey ?? options.location === 'external'
    if (requiresApiKey && !options.apiKey) {
      throw new ModelProviderError(
        options.id,
        'auth',
        'External provider requires an API key'
      )
    }
    this.id = options.id
    this.location = options.location
    this.models = [options.model]
    this.#baseUrl = baseUrl
    this.#model = options.model
    if (options.apiKey !== undefined) this.#apiKey = options.apiKey
    this.#fetch = options.fetchImpl ?? (globalThis.fetch as FetchLike)
    this.#maxResponseBytes =
      options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
    this.#allowedHosts = [new URL(baseUrl).hostname.toLowerCase()]
    this.#allowHttp = allowHttp
    this.#allowPrivateNetworks = allowPrivateNetworks
    this.#dnsLookup = options.dnsLookup
    this.#boundFetch = options.fetchImpl ? undefined : fetchWithResolvedAddress
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const endpoint = `${this.#baseUrl}/chat/completions`
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
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: false
    }
    if (request.structuredSchemaName) {
      body.response_format = { type: 'json_object' }
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
          allowLoopbackOnly: this.#allowHttp && this.location === 'local',
          maxRedirects: 0
        },
        deps
      )
    } catch (error) {
      if (error instanceof Error && error.name === 'UnsafeUrlError') {
        throw new ModelProviderError(
          this.id,
          'invalid_request',
          `Provider endpoint rejected: ${error.message}`
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
        'Provider returned invalid JSON'
      )
    }
    const parsed = OpenAIResponseSchema.safeParse(parsedJson)
    if (!parsed.success) {
      throw new ModelProviderError(
        this.id,
        'malformed_response',
        'Provider response did not match the expected contract'
      )
    }
    const choice = parsed.data.choices[0]
    if (!choice) {
      throw new ModelProviderError(
        this.id,
        'malformed_response',
        'Provider returned no choices'
      )
    }
    const text = choice.message.content ?? ''
    return {
      text,
      usage: {
        inputTokens: parsed.data.usage?.prompt_tokens ?? 0,
        outputTokens: parsed.data.usage?.completion_tokens ?? 0
      },
      providerId: this.id,
      model: this.#model,
      externalCall: this.location === 'external',
      ...(choice.finish_reason !== undefined
        ? { finishReason: choice.finish_reason }
        : {})
    }
  }
}

export function combineTimeoutSignal(
  external: AbortSignal,
  timeoutMs: number
): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, timeoutMs))
  return AbortSignal.any([external, timeout])
}
