import { describe, expect, it } from 'vitest'
import {
  REM21_014_CONTRACT,
  validateRem21014BrowserProofReport
} from '../scripts/rem21-014-browser-proof-contract.mjs'

function validReport() {
  return {
    schemaVersion: 1,
    kind: 'rem21-014-browser-proof',
    contract: REM21_014_CONTRACT,
    runId: 'run-rem21-014-test',
    candidateId: 'a'.repeat(64),
    node: 'v22.23.2',
    verdict: 'PASS',
    scope: {
      production: false,
      realData: false,
      externalServices: false,
      identityMode: 'trusted'
    },
    browsers: {
      declared: ['chromium', 'firefox', 'webkit'],
      executed: ['chromium', 'firefox', 'webkit'],
      byProject: {
        chromium: { passed: 5, failed: 0, skipped: 0 },
        firefox: { passed: 5, failed: 0, skipped: 0 },
        webkit: { passed: 5, failed: 0, skipped: 0 }
      }
    },
    tests: { total: 15, passed: 15, failed: 0, skipped: 0, flaky: 0 },
    axe: { blockingViolations: 0, minorViolations: 0, checkedTests: 6 },
    playwright: { exitCode: 0, rawReportPresent: true }
  }
}

describe('REM21-014 browser proof contract', () => {
  it('accepts a complete trusted three-browser proof', () => {
    expect(
      validateRem21014BrowserProofReport(validReport(), {
        runId: 'run-rem21-014-test',
        candidateId: 'a'.repeat(64)
      })
    ).toBe(true)
  })

  it.each([
    ['wrong run', { runId: 'run-other' }, 'run_binding'],
    ['wrong candidate', { candidateId: 'b'.repeat(64) }, 'candidate_binding'],
    [
      'simulation',
      { scope: { ...validReport().scope, identityMode: 'simulation' } },
      'identity_mode'
    ],
    [
      'missing browser',
      {
        browsers: {
          ...validReport().browsers,
          executed: ['chromium', 'firefox']
        }
      },
      'executed_browsers'
    ],
    [
      'mandatory skip',
      { tests: { ...validReport().tests, skipped: 1, passed: 14 } },
      'tests_not_all_passed'
    ],
    [
      'moderate axe',
      { axe: { ...validReport().axe, blockingViolations: 1 } },
      'axe_blocking'
    ]
  ])('rejects %s', (_label, overrides, reason) => {
    const report = validReport()
    for (const [key, value] of Object.entries(overrides)) {
      report[key] = value
    }
    expect(() =>
      validateRem21014BrowserProofReport(report, {
        runId: 'run-rem21-014-test',
        candidateId: 'a'.repeat(64)
      })
    ).toThrow(`rem21_014_contract_invalid:${reason}`)
  })
})
