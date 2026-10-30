import { createHash } from 'node:crypto'
import type { PromptBinding, ProviderRequest } from './contracts.ts'

/** SPEC 0289 §3.2: canonical form of the request the adapter receives. */
export const FROZEN_REQUEST_VERSION = 'frozen-request-v1' as const

export type FrozenRequestParts = Omit<ProviderRequest, 'signal'>

export interface FrozenRequestIdentity {
  /** The canonical bytes (UTF-8 string); recorded only on request. */
  readonly canonical: string
  readonly sha256: string
  readonly bytes: number
}

function bindingFields(binding: PromptBinding) {
  return {
    promptId: binding.promptId,
    promptVersion: binding.promptVersion,
    registrySha256: binding.registrySha256,
    rendererVersion: binding.rendererVersion,
    instructionSha256: binding.instructionSha256,
    renderedInputSha256: binding.renderedInputSha256
  }
}

/**
 * Canonical JSON with a fixed key order and no whitespace. The request must
 * carry a prompt binding (the gateway always sets it). `signal` is a live host
 * object and is not part of the identity. Built once per candidate: every
 * attempt of a candidate sends identical bytes.
 */
export function canonicalFrozenRequest(parts: FrozenRequestParts): string {
  const binding = parts.promptBinding
  if (!binding) throw new Error('A frozen request needs its prompt binding')
  const input = parts.input
  return JSON.stringify({
    v: FROZEN_REQUEST_VERSION,
    requestId: parts.requestId,
    tenantId: parts.tenantId,
    correlationId: parts.correlationId,
    model: parts.model,
    temperature: parts.temperature,
    maxTokens: parts.maxTokens,
    timeoutMs: parts.timeoutMs,
    promptSha256: parts.promptSha256,
    promptBinding: bindingFields(binding),
    structuredSchemaName: parts.structuredSchemaName ?? null,
    metadata: parts.metadata
      ? Object.entries(parts.metadata).sort(([a], [b]) => (a < b ? -1 : 1))
      : null,
    input: {
      system: input.system,
      messages: input.messages.map((m) => ({
        role: m.role,
        content: m.content
      }))
    }
  })
}

export function frozenRequestIdentity(
  parts: FrozenRequestParts
): FrozenRequestIdentity {
  const canonical = canonicalFrozenRequest(parts)
  return Object.freeze({
    canonical,
    sha256: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    bytes: Buffer.byteLength(canonical, 'utf8')
  })
}

/**
 * Own, frozen copies of the mutable parts (`metadata`, `promptBinding`), made
 * once per candidate. Every level is shallow-frozen once (all values are
 * strings), so the cost is linear in the request and the same frozen parts are
 * safely shared by the attempts of the candidate. `input` arrives frozen from
 * the renderer.
 */
export function freezeRequestParts(
  parts: FrozenRequestParts
): FrozenRequestParts {
  const { promptBinding, metadata, ...rest } = parts
  return Object.freeze({
    ...rest,
    ...(promptBinding
      ? { promptBinding: Object.freeze({ ...promptBinding }) }
      : {}),
    ...(metadata ? { metadata: Object.freeze({ ...metadata }) } : {})
  })
}

/** One frozen request per attempt: the frozen parts plus that attempt's signal. */
export function frozenProviderRequest(
  parts: FrozenRequestParts,
  signal: AbortSignal
): ProviderRequest {
  return Object.freeze({ ...parts, signal })
}
