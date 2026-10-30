import type {
  ObservationRendering,
  SpillPolicy,
  SpillStore
} from '@cvg/harness-contracts'
import { SpillCommitUnknown } from './errors.ts'
import {
  newBlockMarker,
  renderPreviewBlock,
  serializeToolOutput,
  sha256Hex,
  utf8Bytes
} from './render.ts'

export interface PrepareToolOutputInput {
  readonly tenantId: string
  readonly sessionId: string
  readonly executionId: string
  readonly operationKey: string
  readonly toolId: string
  readonly classification: string
  readonly output: unknown
  readonly policy: SpillPolicy
  readonly store?: SpillStore
  /** A store that lives in one process is accepted only when the host says it is a test composition (I14). */
  readonly allowProcessLocal?: boolean
  readonly signal?: AbortSignal
  /** Outputs already stored in this turn (I5). */
  readonly storedSoFar: number
  readonly marker?: (content: string) => string
}

export interface PreparedToolOutput {
  readonly rendering: ObservationRendering
  /** A new object was written for this result. */
  readonly wrote: boolean
}

function eligible(input: PrepareToolOutputInput, bytes: number): boolean {
  const { store, policy } = input
  if (!store) return false
  if (store.durability !== 'shared' && input.allowProcessLocal !== true) {
    return false
  }
  if (bytes > policy.maxStoredBytes) return false
  if (input.storedSoFar >= policy.maxLocatorsPerTurn) return false
  return input.signal?.aborted !== true
}

/**
 * SPEC 0293 §3.3-§3.5: a result up to the threshold is shown whole; a larger one
 * is stored (when the composition allows it) and shown as a preview. The form
 * is decided here, once, and never rewritten (I13). One repeat is made only for
 * a retryable error or an unknown commit, which `put` makes safe (I6).
 */
export async function prepareToolOutput(
  input: PrepareToolOutputInput
): Promise<PreparedToolOutput> {
  const serialized = serializeToolOutput(input.output)
  const { text } = serialized
  const bytes = utf8Bytes(text)
  const sha256 = sha256Hex(text)
  if (bytes <= input.policy.thresholdBytes) {
    return {
      rendering: { form: 'inline', text, bytes, sha256, stored: false },
      wrote: false
    }
  }
  let locator: string | undefined
  let uncertain = false
  if (eligible(input, bytes)) {
    for (let attempt = 0; attempt < 2 && locator === undefined; attempt += 1) {
      try {
        const receipt = await (input.store as SpillStore).put({
          tenantId: input.tenantId,
          sessionId: input.sessionId,
          executionId: input.executionId,
          operationKey: input.operationKey,
          sourceId: input.toolId,
          classification: input.classification,
          mediaType: serialized.mediaType,
          content: text,
          ...(input.signal ? { signal: input.signal } : {})
        })
        locator = receipt.locator
        uncertain = false
      } catch (error) {
        uncertain = error instanceof SpillCommitUnknown
        const repeatable =
          uncertain ||
          (error as { retryable?: unknown } | null)?.retryable === true
        if (!repeatable || input.signal?.aborted === true) break
      }
    }
  }
  const marker = (input.marker ?? newBlockMarker)(text)
  const block = renderPreviewBlock({
    toolId: input.toolId,
    text,
    headBytes: input.policy.previewHeadBytes,
    tailBytes: input.policy.previewTailBytes,
    stored: locator === undefined ? null : { locator },
    truncatedAtSource: serialized.truncatedAtSource,
    commitUncertain: locator === undefined && uncertain,
    marker
  })
  return {
    rendering: {
      form: 'preview',
      text: block,
      bytes,
      sha256,
      stored: locator !== undefined,
      ...(locator === undefined ? {} : { locator })
    },
    wrote: locator !== undefined
  }
}
