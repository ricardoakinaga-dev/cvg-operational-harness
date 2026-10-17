// Vitest 4.1.11 uses Istanbul's json-summary reporter. Validate its counts,
// truncated percentages and complete aggregate, rather than trusting pct alone.
export const AGGREGATE_THRESHOLDS = Object.freeze({
  statements: 90,
  branches: 85,
  functions: 90,
  lines: 90
})

const dimensions = Object.keys(AGGREGATE_THRESHOLDS)
const counts = ['total', 'covered', 'skipped']
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function validateMetric(metric, label, failures) {
  if (
    !record(metric) ||
    counts.some(
      (key) => !Number.isSafeInteger(metric[key]) || metric[key] < 0
    ) ||
    metric.covered > metric.total ||
    metric.skipped > metric.total ||
    !Number.isFinite(metric.pct) ||
    metric.pct < 0 ||
    metric.pct > 100
  ) {
    failures.push(`invalid coverage metric: ${label}`)
    return false
  }
  // This is the installed istanbul-lib-coverage/lib/percent.js algorithm,
  // including its zero-denominator convention and truncation (not rounding).
  const expected =
    metric.total === 0
      ? 100
      : Math.floor((100000 * metric.covered) / metric.total / 10) / 100
  if (metric.pct !== expected) {
    failures.push(`inconsistent coverage percentage: ${label}`)
    return false
  }
  return true
}

export function validateAggregateCoverage(summary) {
  const failures = []
  const metrics = {}
  if (!record(summary) || !Object.hasOwn(summary, 'total')) {
    return {
      pass: false,
      thresholds: AGGREGATE_THRESHOLDS,
      metrics,
      failures: ['missing coverage total']
    }
  }

  const entries = Object.entries(summary)
  const files = entries.filter(([key]) => key !== 'total')
  if (files.length === 0) failures.push('coverage report has no files')
  const sums = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      Object.fromEntries(counts.map((key) => [key, 0n]))
    ])
  )
  let validFiles = true
  for (const [path, entry] of entries) {
    for (const dimension of dimensions) {
      const metric = record(entry) ? entry[dimension] : undefined
      const valid = validateMetric(metric, `${path}:${dimension}`, failures)
      if (path === 'total') {
        if (valid) metrics[dimension] = { ...metric }
      } else if (valid) {
        for (const key of counts) sums[dimension][key] += BigInt(metric[key])
      } else {
        validFiles = false
      }
    }
  }

  for (const dimension of dimensions) {
    const metric = metrics[dimension]
    if (!metric) continue
    if (
      validFiles &&
      counts.some((key) => BigInt(metric[key]) !== sums[dimension][key])
    ) {
      failures.push(`inconsistent coverage total: ${dimension}`)
    }
    if (
      BigInt(metric.covered) * 100n <
      BigInt(metric.total) * BigInt(AGGREGATE_THRESHOLDS[dimension])
    ) {
      failures.push(
        `coverage below threshold: ${dimension} ${metric.pct}% < ${AGGREGATE_THRESHOLDS[dimension]}%`
      )
    }
  }
  if (metrics.statements?.total === 0 || metrics.lines?.total === 0) {
    failures.push('coverage report is empty')
  }
  return {
    pass: failures.length === 0,
    thresholds: AGGREGATE_THRESHOLDS,
    metrics,
    failures
  }
}
