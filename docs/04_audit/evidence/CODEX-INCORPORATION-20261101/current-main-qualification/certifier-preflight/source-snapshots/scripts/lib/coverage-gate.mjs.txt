import fs from 'node:fs'

export const GLOBAL_COVERAGE_THRESHOLDS = Object.freeze({
  statements: 90,
  lines: 90,
  functions: 90,
  branches: 85
})

export const CRITICAL_BRANCH_THRESHOLD = 95

const COVERAGE_DIMENSIONS = ['statements', 'lines', 'functions', 'branches']

function percentage(dimension) {
  if (!dimension || !Number.isFinite(dimension.total) || dimension.total <= 0) {
    return null
  }
  if (!Number.isFinite(dimension.covered) || dimension.covered < 0) {
    return null
  }
  return (dimension.covered / dimension.total) * 100
}

function rounded(value) {
  return value === null ? null : Number(value.toFixed(2))
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/')
}

function summaryEntryFor(summary, relativePath) {
  const expected = normalizePath(relativePath)
  for (const [filePath, entry] of Object.entries(summary)) {
    if (filePath === 'total') continue
    const normalized = normalizePath(filePath)
    if (normalized === expected || normalized.endsWith(`/${expected}`)) {
      return { path: normalized, entry }
    }
  }
  return null
}

function aggregate(entries) {
  const totals = Object.fromEntries(
    COVERAGE_DIMENSIONS.map((dimension) => [
      dimension,
      { total: 0, covered: 0 }
    ])
  )
  for (const entry of entries) {
    for (const dimension of COVERAGE_DIMENSIONS) {
      const value = entry?.[dimension]
      if (
        !value ||
        !Number.isFinite(value.total) ||
        !Number.isFinite(value.covered) ||
        value.total < 0 ||
        value.covered < 0 ||
        value.covered > value.total
      ) {
        continue
      }
      totals[dimension].total += value.total
      totals[dimension].covered += value.covered
    }
  }
  return Object.fromEntries(
    COVERAGE_DIMENSIONS.map((dimension) => [
      dimension,
      {
        ...totals[dimension],
        pct: rounded(percentage(totals[dimension]))
      }
    ])
  )
}

export function readCoverageSummary(summaryPath) {
  return JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
}

export function evaluateGlobalCoverage(summary) {
  const total = summary?.total
  const metrics = Object.fromEntries(
    COVERAGE_DIMENSIONS.map((dimension) => [
      dimension,
      {
        ...(total?.[dimension] ?? {}),
        pct: rounded(percentage(total?.[dimension]))
      }
    ])
  )
  const failures = []
  for (const [dimension, threshold] of Object.entries(
    GLOBAL_COVERAGE_THRESHOLDS
  )) {
    const value = percentage(total?.[dimension])
    if (value === null) {
      failures.push(`coverage_global_invalid:${dimension}`)
    } else if (value < threshold) {
      failures.push(`coverage_global_below_threshold:${dimension}`)
    }
  }
  return {
    thresholds: GLOBAL_COVERAGE_THRESHOLDS,
    metrics,
    pass: failures.length === 0,
    failures
  }
}

export function evaluateCriticalCoverage(summary, manifest) {
  const threshold = manifest?.branchThreshold ?? CRITICAL_BRANCH_THRESHOLD
  const failures = []
  const groups = []
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    failures.push('critical_threshold_invalid')
  }
  if (!Array.isArray(manifest?.groups) || manifest.groups.length === 0) {
    failures.push('critical_manifest_empty')
  }
  for (const group of manifest?.groups ?? []) {
    const paths = Array.isArray(group.paths) ? group.paths : []
    const matches = paths
      .map((relativePath) => ({
        relativePath,
        match: summaryEntryFor(summary, relativePath)
      }))
      .filter(({ match }) => match !== null)
    const missing = paths.filter(
      (relativePath) =>
        !matches.some((item) => item.relativePath === relativePath)
    )
    const aggregateMetrics = aggregate(matches.map(({ match }) => match.entry))
    const branchPct = aggregateMetrics.branches.pct
    if (missing.length > 0) {
      failures.push(`critical_coverage_missing:${group.id}`)
    }
    if (branchPct === null) {
      failures.push(`critical_coverage_invalid:${group.id}:branches`)
    } else if (branchPct < threshold) {
      failures.push(`critical_coverage_below_threshold:${group.id}`)
    }
    groups.push({
      id: group.id,
      paths,
      missing,
      files: matches.map(({ relativePath, match }) => ({
        path: match.path,
        manifestPath: relativePath,
        metrics: Object.fromEntries(
          COVERAGE_DIMENSIONS.map((dimension) => [
            dimension,
            {
              ...match.entry[dimension],
              pct: rounded(percentage(match.entry[dimension]))
            }
          ])
        )
      })),
      metrics: aggregateMetrics
    })
  }
  return {
    threshold,
    groups,
    pass: failures.length === 0,
    failures
  }
}

export function buildCoverageReport(summary, manifest, metadata = {}) {
  const global = evaluateGlobalCoverage(summary)
  const critical = evaluateCriticalCoverage(summary, manifest)
  const failures = [...global.failures, ...critical.failures]
  return {
    schemaVersion: 1,
    kind: 'aud20-coverage-report',
    ...metadata,
    global,
    critical,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    failures
  }
}
