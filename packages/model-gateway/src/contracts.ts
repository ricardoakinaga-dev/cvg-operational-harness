import { z } from 'zod'
import type { ProviderStreamEvent } from './stream.ts'
import { DataClassificationSchema } from '@cvg/shared'

export const ModelProfileNameSchema = z.enum([
  'fast',
  'balanced',
  'reasoning',
  'local',
  'critical-review'
])

export type ModelProfileName = z.infer<typeof ModelProfileNameSchema>

export const ModelLocationSchema = z.enum(['external', 'local'])
export type ModelLocation = z.infer<typeof ModelLocationSchema>

export const ModelMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1).max(32_000)
})

export type ModelMessage = z.infer<typeof ModelMessageSchema>

export const ModelInputSchema = z
  .object({
    system: z.string().max(16_000).optional(),
    messages: z.array(ModelMessageSchema).min(1).max(64)
  })
  .strict()

export type ModelInput = z.infer<typeof ModelInputSchema>

/**
 * Serializable subset of a gateway request. Structured output contracts carry
 * live zod schemas and are validated at runtime, outside this wire schema.
 */
export const ModelGatewayRequestSchema = z
  .object({
    requestId: z.string().min(8).max(120),
    tenantId: z.string().regex(/^tenant_[0-9a-f-]{36}$/),
    agentId: z.string().min(1).max(120).optional(),
    agentVersionId: z.string().min(1).max(120).optional(),
    sessionId: z.string().min(1).max(120).optional(),
    conversationId: z.string().min(1).max(120).optional(),
    correlationId: z.string().min(8).max(120),
    promptId: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(60),
    promptSha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    policyVersion: z.string().min(1).max(120).optional(),
    modelProfile: ModelProfileNameSchema,
    task: z.string().min(1).max(120).optional(),
    dataClassification: DataClassificationSchema.default('INTERNAL'),
    input: ModelInputSchema,
    timeoutMs: z.number().int().min(100).max(120_000).optional(),
    maxTokens: z.number().int().min(1).max(32_000).optional(),
    maxCostUsd: z.number().min(0).max(1000).optional(),
    estimatedCostUsd: z.number().min(0).max(1000).optional(),
    metadata: z
      .record(z.string().min(1).max(64), z.string().max(256))
      .optional()
  })
  .strict()

export type ModelGatewayRequest = z.infer<typeof ModelGatewayRequestSchema>

export interface StructuredOutputContract<T = unknown> {
  schemaName: string
  schema: z.ZodType<T>
  /** Defaults to true: invalid structured output always fails closed. */
  failClosed?: boolean
}

export interface ProviderUsage {
  inputTokens: number
  outputTokens: number
}

/**
 * SPEC 0267 §3.1: digests the gateway computes for the material it hands to
 * the provider. The caller never supplies them.
 */
export interface PromptBinding {
  promptId: string
  promptVersion: string
  /** SHA-256 of the approved `PromptRecord.content` held by the registry. */
  registrySha256: string
  rendererVersion: 'literal-v1'
  /** SHA-256 of the UTF-8 system instruction actually rendered. */
  instructionSha256: string
  /** SHA-256 of the canonical rendered material (system + messages). */
  renderedInputSha256: string
}

export interface ProviderRequest {
  requestId: string
  tenantId: string
  correlationId: string
  model: string
  input: ModelInput
  temperature: number
  maxTokens: number
  promptSha256: string
  /** Set by the gateway; adapters verify it against `input` before the wire. */
  promptBinding?: PromptBinding
  structuredSchemaName?: string
  signal: AbortSignal
  timeoutMs: number
  metadata?: Record<string, string>
}

export interface ProviderResult {
  text: string
  /** Absent when the provider did not report token counters (never zero). */
  usage?: ProviderUsage
  providerId: string
  model: string
  externalCall: boolean
  finishReason?: string
}

export interface ModelProvider {
  readonly id: string
  readonly location: ModelLocation
  readonly models: readonly string[]
  execute(request: ProviderRequest): Promise<ProviderResult>
  /**
   * SPEC 0284: internal stream, used only by a profile with `streaming: true`.
   * The gateway still returns one terminal result per call (D1, D2).
   */
  executeStream?(request: ProviderRequest): AsyncIterable<ProviderStreamEvent>
}

export interface ModelProfile {
  name: ModelProfileName
  providerId: string
  model: string
  location: ModelLocation
  temperature: number
  maxTokens: number
  timeoutMs: number
  maxCostUsd: number
  estimatedCostUsd: number
  maxRetries: number
  pricing: {
    inputPer1kUsd: number
    outputPer1kUsd: number
  }
  fallbackProfile?: ModelProfileName
  /** SPEC 0284: consume the provider as an internal stream. Default false. */
  streaming?: boolean
  /**
   * SPEC 0285 D3: declared context window in tokens. When set, a request whose
   * projected input plus its output limit does not fit is refused before any
   * provider call; absent means measure only.
   */
  contextWindow?: number
}

export type UsageStatus = 'reported' | 'unreported'

export interface ModelResult<TStructured = unknown> {
  requestId: string
  tenantId: string
  correlationId: string
  providerId: string
  model: string
  profile: ModelProfileName
  output: {
    text: string
    structured?: TStructured
  }
  /**
   * Measured counters when `usageStatus` is `reported`; otherwise the
   * conservative upper bound used for accounting, never a measurement.
   */
  usage: ProviderUsage
  usageStatus: UsageStatus
  costUsd: number
  attempts: number
  latencyMs: number
  promptSha256: string
  promptBinding: PromptBinding
  createdAt: string
  fallbackUsed: boolean
  substitutedProfile?: ModelProfileName
}

export type ModelGatewayEventType =
  | 'model.call.started'
  | 'model.call.completed'
  | 'model.call.failed'
  | 'model.retry.scheduled'
  | 'model.budget.denied'
  | 'model.routing.substituted'
  | 'model.routing.fallback'
  | 'model.circuit.transition'

export interface ModelGatewayEvent {
  type: ModelGatewayEventType
  requestId: string
  tenantId: string
  correlationId: string
  providerId?: string
  model?: string
  profile?: ModelProfileName
  code?: string
  attempt?: number
  delayMs?: number
  costUsd?: number
  /** PDSH-024: measured prompt/completion counts on `model.call.completed`. */
  inputTokens?: number
  outputTokens?: number
  /**
   * SPEC 0285 D2: fixed-density estimate of the request size on
   * `model.call.started`, computed before any provider call. An estimate,
   * never a measurement.
   */
  projectedInputTokens?: number
  /**
   * SPEC 0289: SHA-256 (hex) and UTF-8 size of the canonical frozen request
   * (`frozen-request-v1`) the adapter receives, on `model.call.started`. Equal
   * for every attempt of one candidate.
   */
  requestSha256?: string
  requestBytes?: number
  /**
   * SPEC 0289 D1-A: the canonical request bytes themselves. Present only when
   * the gateway runs with `recordFrozenRequests`; it holds the request content,
   * so the event sink must be tenant-protected with a defined retention.
   */
  frozenRequest?: string
  circuitState?: string
  detail?: string
}
