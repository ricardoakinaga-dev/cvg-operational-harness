import { describe, expect, it } from 'vitest'
import {
  OIDC_HOSTS_CONTRACT,
  REQUIRED_AXE_STATES,
  REQUIRED_TESTS,
  validateOidcHostsBrowserProofReport
} from '../scripts/oidc-hosts-browser-proof-contract.mjs'

function validReport() {
  return {
    schemaVersion: 1,
    kind: 'oidc-hosts-browser-proof',
    contract: OIDC_HOSTS_CONTRACT,
    runId: 'run-oidc-hosts-test',
    candidateId: 'a'.repeat(64),
    node: 'v22.23.2',
    verdict: 'PASS',
    scope: {
      production: false,
      realData: false,
      externalServices: false,
      identityMode: 'trusted',
      idp: 'synthetic',
      browsers: ['chromium']
    },
    tlsTrust: 'spki-list',
    tests: {
      total: REQUIRED_TESTS.length,
      passed: REQUIRED_TESTS.length,
      failed: 0,
      skipped: 0,
      flaky: 0,
      titles: REQUIRED_TESTS.map((id) => `${id} — synthetic`)
    },
    axe: {
      blockingViolations: 0,
      minorViolations: 0,
      states: [...REQUIRED_AXE_STATES]
    },
    s0: { check6: true, check7: true, check8: true, check9: {} },
    pacer: { paced: 30, maxLatencyMs: 40, violations: 0 },
    playwright: { exitCode: 0, rawReportPresent: true }
  }
}

describe('SPEC0259 three-host browser proof contract (DB7)', () => {
  it('accepts a complete Chromium proof bound to the run and candidate', () => {
    expect(
      validateOidcHostsBrowserProofReport(validReport(), {
        runId: 'run-oidc-hosts-test',
        candidateId: 'a'.repeat(64)
      })
    ).toBe(true)
  })

  it.each([
    ['wrong run', { runId: 'run-other' }, 'run_binding'],
    ['wrong candidate', { candidateId: 'b'.repeat(64) }, 'candidate_binding'],
    ['node 20', { node: 'v20.0.0' }, 'node'],
    ['failed verdict', { verdict: 'FAIL' }, 'verdict'],
    [
      'production scope',
      { scope: { ...validReport().scope, production: true } },
      'production_scope'
    ],
    [
      'real IdP',
      { scope: { ...validReport().scope, idp: 'corporate' } },
      'idp_scope'
    ],
    [
      'other browser',
      { scope: { ...validReport().scope, browsers: ['chromium', 'webkit'] } },
      'browsers'
    ],
    ['TLS without pins', { tlsTrust: 'ignoreHTTPSErrors' }, 'tls_trust'],
    [
      'a skipped test',
      { tests: { ...validReport().tests, skipped: 1 } },
      'tests_skipped'
    ],
    [
      'a flaky test',
      { tests: { ...validReport().tests, flaky: 1 } },
      'tests_flaky'
    ],
    [
      'a failed test',
      { tests: { ...validReport().tests, passed: 14, failed: 1 } },
      'tests_not_all_passed'
    ],
    [
      'a missing item',
      {
        tests: {
          ...validReport().tests,
          titles: validReport().tests.titles.filter(
            (title) => !title.startsWith('Q9i ')
          )
        }
      },
      'test_missing:Q9i'
    ],
    [
      'an axe blocking violation',
      { axe: { ...validReport().axe, blockingViolations: 1 } },
      'axe_blocking'
    ],
    [
      'a missing axe state',
      { axe: { ...validReport().axe, states: ['first-visit'] } },
      'axe_state_missing'
    ],
    [
      'an S0 check that failed',
      { s0: { ...validReport().s0, check8: false } },
      's0_check8'
    ],
    [
      'a pacer violation',
      { pacer: { ...validReport().pacer, violations: 1 } },
      'pacer_violations'
    ],
    [
      'a failed Playwright run',
      { playwright: { exitCode: 1, rawReportPresent: true } },
      'playwright_exit'
    ]
  ])('rejects %s', (_name, patch, reason) => {
    expect(() =>
      validateOidcHostsBrowserProofReport(
        { ...validReport(), ...patch },
        { runId: 'run-oidc-hosts-test', candidateId: 'a'.repeat(64) }
      )
    ).toThrow(reason)
  })
})
