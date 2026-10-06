/**
 * Test-log summary parsers. Dependency-free on purpose: the CI bar loads this
 * module before the install gate, when no package is installed yet
 * (AUD-0599, Verify ERR_MODULE_NOT_FOUND zod).
 */

export function parseLogHeader(log) {
  const header = {}
  for (const line of log.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('#')) continue
    for (const match of trimmed.matchAll(
      /(runId|candidateId|gate|exitCode)=([^\s]+)/g
    )) {
      header[match[1]] = match[2]
    }
  }
  return header
}

// Vitest colors its summary when CI is set, even into a pipe (as on GitHub
// Actions); the summary is read without the escape codes.
const ANSI_ESCAPE = /\u001b\[[0-9;]*[A-Za-z]/g

export function parseVitestSummary(log, label) {
  const line = log
    .split('\n')
    .map((entry) => entry.replace(ANSI_ESCAPE, '').trim())
    .find((entry) => entry.startsWith(label))
  if (!line) return null
  const counts = { passed: 0, failed: 0, skipped: 0 }
  for (const match of line.matchAll(/(\d+)\s+(passed|failed|skipped)/g)) {
    counts[match[2]] += Number(match[1])
  }
  const totalMatch = /\((\d+)\)\s*$/.exec(line)
  return {
    ...counts,
    total: totalMatch
      ? Number(totalMatch[1])
      : counts.passed + counts.failed + counts.skipped
  }
}

export function parsePlaywrightSummary(log) {
  const counts = { passed: 0, failed: 0, skipped: 0, other: 0 }
  let found = false
  for (const line of log.split('\n')) {
    const trimmed = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim()
    const match =
      /^(\d+)\s+(passed|failed|skipped|flaky|interrupted|did not run)/.exec(
        trimmed
      )
    if (!match) continue
    found = true
    const value = Number(match[1])
    if (match[2] === 'passed') counts.passed += value
    else if (match[2] === 'failed') counts.failed += value
    else if (match[2] === 'skipped') counts.skipped += value
    else counts.other += value
  }
  return found ? counts : null
}
