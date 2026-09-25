import { createHash } from 'node:crypto'
import type { LoopDecision } from '@cvg/harness-contracts'

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForSignature(record[key])])
    )
  }
  return value
}

export function decisionSignature(decision: LoopDecision): string {
  const material = {
    decisionType: decision.decisionType,
    capability: decision.toolId ?? decision.selectedCapability ?? null,
    query: decision.query ?? null,
    toolInput: decision.toolInput ?? null,
    knowledgeCategories: decision.knowledgeCategories ?? null,
    verificationTarget: decision.verificationTarget ?? null
  }
  return createHash('sha256')
    .update(JSON.stringify(normalizeForSignature(material)))
    .digest('hex')
}

/**
 * Detects alternating decision cycles (length >= 2). Single-element repeats
 * are handled by the repeat threshold so the two controls compose: the
 * threshold catches identical decisions, this catches A/B alternation.
 */
export function detectDecisionCycle(
  signatures: readonly string[],
  candidate: string,
  maxCycleLength = 3
): boolean {
  const sequence = [...signatures, candidate]
  const immediatelyPrevious = sequence[sequence.length - 2]
  for (let length = 2; length <= maxCycleLength; length += 1) {
    const previousIndex = sequence.length - 1 - length
    if (previousIndex < 0) continue
    // Pure repeats (candidate equals the immediately previous decision) are
    // the repeat threshold's job; this detects A/B(,C) alternation.
    if (immediatelyPrevious === candidate) continue
    if (sequence[previousIndex] === candidate) return true
  }
  return false
}
