// SPEC0259 §4.11 (DB7) — contract of the report of the three-host browser
// proof of the OIDC console (Q8, Q9), written by the runner to
// certification/logs/oidc-hosts-browser-proof.json.
export const OIDC_HOSTS_CONTRACT = 'spec0259-b1-v1'

const SHA256 = /^[0-9a-f]{64}$/
export const REQUIRED_TESTS = Object.freeze([
  'Q8',
  'S0',
  'Q9a',
  'Q9b/c/d',
  'Q9e',
  'Q9f',
  'Q9g',
  'Q9h',
  'Q9i',
  'Q9j',
  'Q9k',
  'Q9l',
  'Q9m',
  'Q9n',
  'Q10'
])
export const REQUIRED_AXE_STATES = Object.freeze([
  'first-visit',
  'authenticated',
  'expired',
  'unavailable',
  'no-permission',
  'login-denied',
  'configuration-error'
])

function fail(reason) {
  throw new Error(`oidc_hosts_contract_invalid:${reason}`)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) fail(field)
}

export function validateOidcHostsBrowserProofReport(report, expected = {}) {
  if (!isRecord(report)) fail('report')
  if (report.schemaVersion !== 1) fail('schema_version')
  if (report.kind !== 'oidc-hosts-browser-proof') fail('kind')
  if (report.contract !== OIDC_HOSTS_CONTRACT) fail('contract')
  if (typeof report.runId !== 'string' || report.runId.length === 0) {
    fail('run_id')
  }
  if (
    report.candidateId !== null &&
    (typeof report.candidateId !== 'string' || !SHA256.test(report.candidateId))
  ) {
    fail('candidate_id')
  }
  if (expected.runId !== undefined && report.runId !== expected.runId) {
    fail('run_binding')
  }
  if (
    expected.candidateId !== undefined &&
    report.candidateId !== expected.candidateId
  ) {
    fail('candidate_binding')
  }
  if (typeof report.node !== 'string' || !/^v?22\./.test(report.node)) {
    fail('node')
  }
  if (report.verdict !== 'PASS') fail('verdict')
  if (!isRecord(report.scope)) fail('scope')
  if (report.scope.production !== false) fail('production_scope')
  if (report.scope.realData !== false) fail('real_data_scope')
  if (report.scope.externalServices !== false) fail('external_services_scope')
  if (report.scope.identityMode !== 'trusted') fail('identity_mode')
  if (report.scope.idp !== 'synthetic') fail('idp_scope')
  if (JSON.stringify(report.scope.browsers) !== JSON.stringify(['chromium'])) {
    fail('browsers')
  }
  if (report.tlsTrust !== 'spki-list') fail('tls_trust')

  if (!isRecord(report.tests)) fail('tests')
  for (const field of ['total', 'passed', 'failed', 'skipped', 'flaky']) {
    requireInteger(report.tests[field], `tests_${field}`)
  }
  if (report.tests.total <= 0) fail('tests_total')
  if (report.tests.passed !== report.tests.total) fail('tests_not_all_passed')
  if (report.tests.failed !== 0) fail('tests_failed')
  if (report.tests.skipped !== 0) fail('tests_skipped')
  if (report.tests.flaky !== 0) fail('tests_flaky')
  if (!Array.isArray(report.tests.titles)) fail('tests_titles')
  for (const id of REQUIRED_TESTS) {
    if (!report.tests.titles.some((title) => title.startsWith(`${id} — `))) {
      fail(`test_missing:${id}`)
    }
  }

  if (!isRecord(report.axe)) fail('axe')
  requireInteger(report.axe.blockingViolations, 'axe_blocking')
  requireInteger(report.axe.minorViolations, 'axe_minor')
  if (report.axe.blockingViolations !== 0) fail('axe_blocking')
  if (!Array.isArray(report.axe.states)) fail('axe_states')
  for (const label of REQUIRED_AXE_STATES) {
    if (!report.axe.states.includes(label)) fail(`axe_state_missing:${label}`)
  }

  if (!isRecord(report.s0)) fail('s0')
  for (const check of ['check6', 'check7', 'check8']) {
    if (report.s0[check] !== true) fail(`s0_${check}`)
  }
  if (!isRecord(report.s0.check9)) fail('s0_check9_record')

  if (!isRecord(report.pacer)) fail('pacer')
  requireInteger(report.pacer.paced, 'pacer_paced')
  if (report.pacer.paced <= 0) fail('pacer_paced')
  if (report.pacer.violations !== 0) fail('pacer_violations')

  if (!isRecord(report.playwright)) fail('playwright')
  if (report.playwright.exitCode !== 0) fail('playwright_exit')
  if (report.playwright.rawReportPresent !== true) fail('raw_report_missing')
  return true
}
