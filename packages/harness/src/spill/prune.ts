import type { SpillComposition } from './composition.ts'
import { DEFAULT_SPILL_CLASSIFICATION } from './composition.ts'
import { resolveSpillPolicy } from './policy.ts'
import { prepareToolOutput } from './prepare.ts'
import { deterministicBlockMarker, sha256Hex, utf8Bytes } from './render.ts'

export interface PruneScope {
  readonly tenantId: string
  readonly sessionId: string
  readonly executionId: string
  readonly signal?: AbortSignal
}

/**
 * SPEC 0293 §3.4 / I13: a tool message of the prefix a compaction is about to
 * summarise, above the threshold, is replaced by the same preview block a fresh
 * result gets (and stored, when the composition allows it). The text is a pure
 * function of the message and the policy: a deterministic marker, no expiry in
 * the block and an idempotent write, so the same history gives the same text on
 * every pass and the `sourceDigest` the compaction records does not move.
 * Messages of any other role, and tool messages that fit, pass untouched.
 */
export async function pruneToolMessages<
  T extends { readonly role: string; readonly content: string }
>(
  messages: readonly T[],
  scope: PruneScope,
  spill: SpillComposition
): Promise<T[]> {
  const policy = resolveSpillPolicy(spill.policy)
  const markerScope = `${scope.tenantId}\u0000${scope.sessionId}`
  let storedSoFar = 0
  const out: T[] = []
  for (const message of messages) {
    if (
      message.role !== 'tool' ||
      utf8Bytes(message.content) <= policy.thresholdBytes
    ) {
      out.push(message)
      continue
    }
    const prepared = await prepareToolOutput({
      tenantId: scope.tenantId,
      sessionId: scope.sessionId,
      executionId: scope.executionId,
      operationKey: `compaction:${sha256Hex(message.content)}`,
      toolId: 'tool-history',
      classification: (
        spill.classificationOf ?? (() => DEFAULT_SPILL_CLASSIFICATION)
      )('tool-history'),
      output: message.content,
      policy,
      ...(spill.store ? { store: spill.store } : {}),
      ...(spill.allowProcessLocal ? { allowProcessLocal: true } : {}),
      ...(scope.signal ? { signal: scope.signal } : {}),
      storedSoFar,
      marker: (text) => deterministicBlockMarker(text, markerScope),
      hideExpiry: true
    })
    if (prepared.wrote) storedSoFar += 1
    out.push({ ...message, content: prepared.rendering.text })
  }
  return out
}
