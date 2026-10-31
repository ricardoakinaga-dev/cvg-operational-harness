/**
 * SPEC 0285 D2 / SPEC 0290 D5: the one fixed-density estimate of a request's
 * input size, shared by the model gateway (window check) and the harness
 * (compaction trigger and fit), so both sides agree on what "fits" means.
 * 4 UTF-8 bytes per token plus 4 tokens of framing per part. An estimate for
 * pressure and the window check, never a measurement.
 */
export const ESTIMATE_BYTES_PER_TOKEN = 4
export const ESTIMATE_FRAMING_TOKENS = 4

const encoder = new TextEncoder()

export function estimateInputTokens(contents: readonly string[]): number {
  let bytes = 0
  for (const content of contents) bytes += encoder.encode(content).length
  return (
    Math.ceil(bytes / ESTIMATE_BYTES_PER_TOKEN) +
    ESTIMATE_FRAMING_TOKENS * contents.length
  )
}
