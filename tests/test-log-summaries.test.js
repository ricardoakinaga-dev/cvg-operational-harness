import { describe, expect, it } from 'vitest'
import {
  parsePlaywrightSummary,
  parseVitestSummary
} from '../scripts/lib/test-log-summaries.mjs'

// Summary as Vitest prints it on GitHub Actions (CI set, output piped).
const coloredVitest = [
  '\u001b[2m Test Files \u001b[22m \u001b[1m\u001b[32m358 passed\u001b[39m\u001b[22m\u001b[90m (358)\u001b[39m',
  '\u001b[2m      Tests \u001b[22m \u001b[1m\u001b[32m2940 passed\u001b[39m\u001b[22m\u001b[90m (2940)\u001b[39m',
  '\u001b[2m   Start at \u001b[22m 21:59:39'
].join('\n')

describe('test log summaries', () => {
  it('reads a colored Vitest summary (certify metrics.unit on CI)', () => {
    expect(parseVitestSummary(coloredVitest, 'Test Files')).toEqual({
      passed: 358,
      failed: 0,
      skipped: 0,
      total: 358
    })
    expect(parseVitestSummary(coloredVitest, 'Tests')).toEqual({
      passed: 2940,
      failed: 0,
      skipped: 0,
      total: 2940
    })
  })

  it('reads a plain Vitest summary with failures and skips', () => {
    const plain = '      Tests  3 failed | 10 passed | 2 skipped (15)'
    expect(parseVitestSummary(plain, 'Tests')).toEqual({
      passed: 10,
      failed: 3,
      skipped: 2,
      total: 15
    })
    expect(parseVitestSummary('no summary', 'Tests')).toBeNull()
  })

  it('reads a colored Playwright summary', () => {
    expect(
      parsePlaywrightSummary('\u001b[32m  12 passed\u001b[39m (3.1s)')
    ).toEqual({ passed: 12, failed: 0, skipped: 0, other: 0 })
  })
})
