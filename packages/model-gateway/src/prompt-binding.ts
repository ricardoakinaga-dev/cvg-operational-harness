import { createHash } from 'node:crypto'
import type { ModelInput, PromptBinding } from './contracts.ts'
import { ModelGatewayError } from './errors.ts'
import { computePromptSha256, type PromptRecord } from './prompt-registry.ts'

export const PROMPT_RENDERER_VERSION = 'literal-v1' as const

function sha256Utf8(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** Canonical material: fixed key order, no extra whitespace (SPEC 0167/013). */
export function canonicalRenderedMaterial(input: ModelInput): string {
  return JSON.stringify({
    rendererVersion: PROMPT_RENDERER_VERSION,
    system: input.system,
    messages: input.messages.map((message) => ({
      role: message.role,
      content: message.content
    }))
  })
}

/**
 * SPEC 0267 §3.1 renderer `literal-v1`: the governed instruction is exactly
 * `PromptRecord.content`. A caller `system` (field or message) is accepted
 * only as a byte-identical duplicate of it; anything else is refused before
 * routing, budget or provider.
 */
export function renderGovernedInput(
  input: ModelInput,
  record: PromptRecord
): { input: ModelInput; binding: PromptBinding } {
  const mismatch = (): never => {
    throw new ModelGatewayError(
      'prompt_content_mismatch',
      'Request instruction differs from the approved prompt content'
    )
  }
  if (input.system !== undefined && input.system !== record.content) {
    mismatch()
  }
  const systemMessages = input.messages.filter((m) => m.role === 'system')
  if (systemMessages.length > 1) mismatch()
  if (systemMessages[0] && systemMessages[0].content !== record.content) {
    mismatch()
  }
  const messages = input.messages
    .filter((m) => m.role !== 'system')
    .map((m) => Object.freeze({ role: m.role, content: m.content }))
  if (messages.length === 0) {
    throw new ModelGatewayError(
      'invalid_request',
      'Model request has no dynamic message after rendering'
    )
  }
  const rendered: ModelInput = Object.freeze({
    system: record.content,
    messages: Object.freeze(messages) as ModelInput['messages']
  })
  const instructionSha256 = computePromptSha256(record.content)
  if (instructionSha256 !== record.sha256) {
    throw new ModelGatewayError(
      'internal_error',
      'Approved prompt content does not match its registry digest'
    )
  }
  return {
    input: rendered,
    binding: {
      promptId: record.promptId,
      promptVersion: record.version,
      registrySha256: record.sha256,
      rendererVersion: PROMPT_RENDERER_VERSION,
      instructionSha256,
      renderedInputSha256: sha256Utf8(canonicalRenderedMaterial(rendered))
    }
  }
}

/**
 * Adapter-side check, run right before the wire: exactly one `system`, the
 * digests recomputed from the material the adapter is about to serialize.
 * Returns an error message, or `undefined` when the binding holds (or none
 * was supplied by a direct, non-gateway caller).
 */
export function verifyPromptBinding(request: {
  input: ModelInput
  promptBinding?: PromptBinding
}): string | undefined {
  const binding = request.promptBinding
  if (!binding) return undefined
  const { input } = request
  if (input.system === undefined) return 'Rendered input has no system'
  if (input.messages.some((m) => m.role === 'system')) {
    return 'Rendered input carries a second system'
  }
  if (sha256Utf8(input.system) !== binding.instructionSha256) {
    return 'Instruction digest does not match the prompt binding'
  }
  if (
    sha256Utf8(canonicalRenderedMaterial(input)) !== binding.renderedInputSha256
  ) {
    return 'Rendered input digest does not match the prompt binding'
  }
  return undefined
}
