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
  ProviderResult,
  ProviderUsage
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
  DEFAULT_MAX_STREAM_EVENT_BYTES,
  DEFAULT_MAX_STREAM_EVENTS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  readStreamFrames,
  streamLimit,
  type StreamLimits
} from '../stream-reader.ts'
import type { ProviderStreamEvent } from '../stream.ts'
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
  /** SPEC 0284 §6.3 stream ceilings (internal stream only). */
  maxStreamEvents?: number
  maxStreamEventBytes?: number
  streamIdleTimeoutMs?: number
}

const OllamaResponseSchema = z.object({
  message: z.object({ content: z.string().optional() }).optional(),
  response: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
  done: z.boolean().optional()
})

const OllamaStreamLineSchema = OllamaResponseSchema.extend({
  done_reason: z.string().optional()
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
  readonly #streamLimits: StreamLimits
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
    const providerId = options.id ?? 'ollama'
    this.#streamLimits = {
      maxBytes: this.#maxResponseBytes,
      maxEvents: streamLimit(
        providerId,
        'maxStreamEvents',
        options.maxStreamEvents,
        DEFAULT_MAX_STREAM_EVENTS
      ),
      maxEventBytes: streamLimit(
        providerId,
        'maxStreamEventBytes',
        options.maxStreamEventBytes,
        DEFAULT_MAX_STREAM_EVENT_BYTES
      ),
      idleTimeoutMs: streamLimit(
        providerId,
        'streamIdleTimeoutMs',
        options.streamIdleTimeoutMs,
        DEFAULT_STREAM_IDLE_TIMEOUT_MS
      )
    }
    this.#allowedHosts = [parsedBaseUrl.hostname.toLowerCase()]
    this.#allowHttp = allowHttp
    this.#allowPrivateNetworks = allowPrivateNetworks
    this.#dnsLookup = options.dnsLookup
    this.#boundFetch = options.fetchImpl ? undefined : fetchWithResolvedAddress
  }

  async #post(
    request: ProviderRequest,
    stream: boolean
  ): Promise<{ response: Response; signal: AbortSignal }> {
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
      stream,
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
          ...(stream ? { responseMode: 'stream' } : {}),
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
    return { response, signal }
  }

  /**
   * SPEC 0284 §6.2: the NDJSON stream as internal events. Usage and the finish
   * event are emitted once, at the end, so that nothing follows `finish`.
   */
  async *executeStream(
    request: ProviderRequest
  ): AsyncGenerator<ProviderStreamEvent> {
    const { response, signal } = await this.#post(request, true)
    let finishReason: string | undefined
    let usage: ProviderUsage | undefined
    for await (const line of readStreamFrames(
      this.id,
      response,
      'ndjson',
      this.#streamLimits,
      signal
    )) {
      if (finishReason !== undefined) {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Ollama stream continued after done'
        )
      }
      let json: unknown
      try {
        json = JSON.parse(line)
      } catch {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Ollama stream line was not valid JSON'
        )
      }
      const parsed = OllamaStreamLineSchema.safeParse(json)
      if (!parsed.success) {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Ollama stream line did not match the expected contract'
        )
      }
      const text = parsed.data.message?.content ?? parsed.data.response ?? ''
      if (text !== '') yield { type: 'delta', text }
      if (parsed.data.done === true) {
        finishReason = parsed.data.done_reason ?? 'stop'
        // SPEC 0267 §3.3: absent counters stay absent (unknown, never zero).
        if (
          parsed.data.prompt_eval_count !== undefined &&
          parsed.data.eval_count !== undefined
        ) {
          usage = {
            inputTokens: parsed.data.prompt_eval_count,
            outputTokens: parsed.data.eval_count
          }
        }
      }
    }
    if (finishReason === undefined) {
      throw new ModelProviderError(
        this.id,
        'connection',
        'Ollama stream ended before done'
      )
    }
    if (usage !== undefined) yield { type: 'usage', usage }
    yield { type: 'finish', reason: finishReason }
  }

  async execute(request: ProviderRequest): Promise<ProviderResult> {
    const { response, signal } = await this.#post(request, false)
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
