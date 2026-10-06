/**
 * Drops trailing `/` from a configured base URL in one linear pass; a regex
 * such as `/\/+$/` backtracks quadratically on long runs of slashes (CodeQL
 * js/polynomial-redos, AUD-0599).
 */
export function withoutTrailingSlashes(value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 0x2f) end -= 1
  return value.slice(0, end)
}
