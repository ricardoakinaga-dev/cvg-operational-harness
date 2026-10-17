export const REM21_014_CONTRACT = 'rem21-014-v1'

const SHA256 = /^[0-9a-f]{64}$/
const DECLARED_BROWSERS = ['chromium', 'firefox', 'webkit']

function fail(reason) {
  throw new Error(`rem21_014_contract_invalid:${reason}`)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requireInteger(value, field, { positive = false } = {}) {
  if (!Number.isInteger(value) || (positive && value <= 0)) fail(field)
}

export function validateRem21014BrowserProofReport(report, expected = {}) {
  if (!isRecord(report)) fail('report')
  if (report.schemaVersion !== 1) fail('schema_version')
  if (report.kind !== 'rem21-014-browser-proof') fail('kind')
  if (report.contract !== REM21_014_CONTRACT) fail('contract')
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

  if (!isRecord(report.browsers)) fail('browsers')
  if (
    JSON.stringify(report.browsers.declared) !==
    JSON.stringify(DECLARED_BROWSERS)
  ) {
    fail('declared_browsers')
  }
  if (
    JSON.stringify(report.browsers.executed) !==
    JSON.stringify(DECLARED_BROWSERS)
  ) {
    fail('executed_browsers')
  }
  for (const browser of DECLARED_BROWSERS) {
    if (!isRecord(report.browsers.byProject?.[browser])) {
      fail(`project:${browser}`)
    }
    if (report.browsers.byProject[browser].failed !== 0) {
      fail(`project_failed:${browser}`)
    }
    if (report.browsers.byProject[browser].skipped !== 0) {
      fail(`project_skipped:${browser}`)
    }
    if (report.browsers.byProject[browser].passed <= 0) {
      fail(`project_not_executed:${browser}`)
    }
  }

  if (!isRecord(report.tests)) fail('tests')
  for (const field of ['total', 'passed', 'failed', 'skipped', 'flaky']) {
    requireInteger(report.tests[field], `tests_${field}`)
  }
  if (report.tests.total <= 0) fail('tests_total')
  if (report.tests.passed !== report.tests.total) fail('tests_not_all_passed')
  if (report.tests.failed !== 0) fail('tests_failed')
  if (report.tests.skipped !== 0) fail('tests_skipped')
  if (report.tests.flaky !== 0) fail('tests_flaky')

  if (!isRecord(report.axe)) fail('axe')
  requireInteger(report.axe.blockingViolations, 'axe_blocking')
  requireInteger(report.axe.minorViolations, 'axe_minor')
  if (report.axe.blockingViolations !== 0) fail('axe_blocking')
  if (report.axe.checkedTests <= 0) fail('axe_checked_tests')

  if (!isRecord(report.playwright)) fail('playwright')
  if (report.playwright.exitCode !== 0) fail('playwright_exit')
  if (report.playwright.rawReportPresent !== true) fail('raw_report_missing')
  return true
}

export { DECLARED_BROWSERS }
