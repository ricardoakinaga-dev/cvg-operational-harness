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
  ProviderUsage,
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
  DEFAULT_MAX_STREAM_EVENT_BYTES,
  DEFAULT_MAX_STREAM_EVENTS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
  readStreamFrames,
  streamLimit,
  type StreamLimits
} from '../stream-reader.ts'
import type { ProviderStreamEvent } from '../stream.ts'

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
  /** SPEC 0284 §6.3 stream ceilings (internal stream only). */
  maxStreamEvents?: number
  maxStreamEventBytes?: number
  streamIdleTimeoutMs?: number
}

const OpenAIStreamChunkSchema = z.object({
  choices: z
    .array(
      z.object({
        delta: z
          .object({ content: z.string().nullable().optional() })
          .optional(),
        finish_reason: z.string().nullable().optional()
      })
    )
    .optional(),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional()
    })
    .nullable()
    .optional()
})

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
  readonly #streamLimits: StreamLimits
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
    this.#streamLimits = {
      maxBytes: this.#maxResponseBytes,
      maxEvents: streamLimit(
        options.id,
        'maxStreamEvents',
        options.maxStreamEvents,
        DEFAULT_MAX_STREAM_EVENTS
      ),
      maxEventBytes: streamLimit(
        options.id,
        'maxStreamEventBytes',
        options.maxStreamEventBytes,
        DEFAULT_MAX_STREAM_EVENT_BYTES
      ),
      idleTimeoutMs: streamLimit(
        options.id,
        'streamIdleTimeoutMs',
        options.streamIdleTimeoutMs,
        DEFAULT_STREAM_IDLE_TIMEOUT_MS
      )
    }
    this.#allowedHosts = [new URL(baseUrl).hostname.toLowerCase()]
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
      stream
    }
    if (stream) body.stream_options = { include_usage: true }
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
          // The bound transport cuts the body at the ceiling (SPEC 0248).
          maxResponseBytes: this.#maxResponseBytes,
          ...(stream ? { responseMode: 'stream' } : {}),
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
   * SPEC 0284 §6.1: the OpenAI-compatible SSE stream as internal events.
   * Usage and the finish event are emitted once, at the end of the stream, so
   * that nothing follows `finish`.
   */
  async *executeStream(
    request: ProviderRequest
  ): AsyncGenerator<ProviderStreamEvent> {
    const { response, signal } = await this.#post(request, true)
    const contentType = response.headers.get('content-type') ?? ''
    if (!/text\/event-stream/i.test(contentType)) {
      await response.body?.cancel().catch(() => undefined)
      throw new ModelProviderError(
        this.id,
        'malformed_response',
        'Provider did not answer with an event stream'
      )
    }
    let finishReason: string | undefined
    let usage: ProviderUsage | undefined
    let done = false
    for await (const payload of readStreamFrames(
      this.id,
      response,
      'sse',
      this.#streamLimits,
      signal
    )) {
      if (done) {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Provider stream continued after [DONE]'
        )
      }
      if (payload.trim() === '[DONE]') {
        done = true
        continue
      }
      let json: unknown
      try {
        json = JSON.parse(payload)
      } catch {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Provider stream event was not valid JSON'
        )
      }
      const chunk = OpenAIStreamChunkSchema.safeParse(json)
      if (!chunk.success) {
        throw new ModelProviderError(
          this.id,
          'malformed_response',
          'Provider stream event did not match the expected contract'
        )
      }
      const choice = chunk.data.choices?.[0]
      const text = choice?.delta?.content ?? ''
      if (text !== '') {
        if (finishReason !== undefined) {
          throw new ModelProviderError(
            this.id,
            'malformed_response',
            'Provider stream sent text after its finish reason'
          )
        }
        yield { type: 'delta', text }
      }
      if (choice?.finish_reason) {
        if (finishReason !== undefined) {
          throw new ModelProviderError(
            this.id,
            'malformed_response',
            'Provider stream finished twice'
          )
        }
        finishReason = choice.finish_reason
      }
      const reported = chunk.data.usage
      if (
        reported?.prompt_tokens !== undefined &&
        reported.completion_tokens !== undefined
      ) {
        if (usage !== undefined) {
          throw new ModelProviderError(
            this.id,
            'malformed_response',
            'Provider stream reported usage twice'
          )
        }
        usage = {
          inputTokens: reported.prompt_tokens,
          outputTokens: reported.completion_tokens
        }
      }
    }
    if (finishReason === undefined) {
      // A terminal marker without a finish reason is a protocol violation;
      // an ended body without either is a cut connection.
      throw new ModelProviderError(
        this.id,
        done ? 'malformed_response' : 'connection',
        done
          ? 'Provider stream ended without a finish reason'
          : 'Provider stream ended before its finish'
      )
    }
    // SPEC 0267 §3.3: absent counters stay absent (unknown, never zero).
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
      // SPEC 0267 §3.3: absent counters are unknown, never zero.
      ...(parsed.data.usage?.prompt_tokens !== undefined &&
      parsed.data.usage.completion_tokens !== undefined
        ? {
            usage: {
              inputTokens: parsed.data.usage.prompt_tokens,
              outputTokens: parsed.data.usage.completion_tokens
            }
          }
        : {}),
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
