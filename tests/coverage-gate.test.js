import { describe, expect, it } from 'vitest'
import {
  CRITICAL_BRANCH_THRESHOLD,
  GLOBAL_COVERAGE_THRESHOLDS,
  buildCoverageReport
} from '../scripts/lib/coverage-gate.mjs'

const summary = {
  '/fixture/packages/critical.ts': {
    statements: { total: 100, covered: 95 },
    lines: { total: 100, covered: 95 },
    functions: { total: 100, covered: 95 },
    branches: { total: 100, covered: 95 }
  },
  total: {
    statements: { total: 100, covered: 90 },
    lines: { total: 100, covered: 90 },
    functions: { total: 100, covered: 90 },
    branches: { total: 100, covered: 85 }
  }
}

const manifest = {
  branchThreshold: CRITICAL_BRANCH_THRESHOLD,
  groups: [{ id: 'critical', paths: ['packages/critical.ts'] }]
}

describe('AUD20-002 coverage contract', () => {
  it('accepts exact global and critical boundaries', () => {
    const report = buildCoverageReport(summary, manifest)
    expect(report.verdict).toBe('PASS')
    expect(report.global.thresholds).toEqual(GLOBAL_COVERAGE_THRESHOLDS)
    expect(report.critical.groups[0].metrics.branches.pct).toBe(95)
  })

  it('rejects a missing critical source instead of shrinking the denominator', () => {
    const report = buildCoverageReport(summary, {
      ...manifest,
      groups: [{ id: 'critical', paths: ['packages/missing.ts'] }]
    })
    expect(report.verdict).toBe('FAIL')
    expect(report.failures).toContain('critical_coverage_missing:critical')
  })

  it('rejects a global metric below its normative floor', () => {
    const report = buildCoverageReport(
      {
        ...summary,
        total: {
          ...summary.total,
          statements: { total: 100, covered: 89 }
        }
      },
      manifest
    )
    expect(report.verdict).toBe('FAIL')
    expect(report.failures).toContain(
      'coverage_global_below_threshold:statements'
    )
  })
})
