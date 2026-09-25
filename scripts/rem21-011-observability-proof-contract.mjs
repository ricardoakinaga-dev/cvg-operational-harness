export const REM21_011_CONTRACT = 'rem21-011-v1'

const SHA256 = /^[0-9a-f]{64}$/

function fail(reason) {
  throw new Error(`rem21_011_contract_invalid:${reason}`)
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function requirePass(report, key) {
  if (!isRecord(report[key]) || report[key].status !== 'PASS') {
    fail(`${key}_status`)
  }
}

/**
 * Validates the local observability proof. It deliberately accepts no claim
 * that a process-local collector proves external retention or production SLO.
 */
export function validateRem21011ProofReport(report, expected = {}) {
  if (!isRecord(report)) fail('report')
  if (report.schemaVersion !== 1) fail('schema_version')
  if (report.kind !== 'rem21-011-observability-proof') fail('kind')
  if (report.contract !== REM21_011_CONTRACT) fail('contract')
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
  for (const key of [
    'collector',
    'redaction',
    'cardinality',
    'exporterFault',
    'slos',
    'readinessIsolation'
  ]) {
    requirePass(report, key)
  }
  if (report.exporterFault.noThrow !== true) fail('exporter_failure_propagated')
  if (report.exporterFault.alerted !== true)
    fail('exporter_failure_not_alerted')
  if (report.redaction.leaked !== false) fail('redaction_leak')
  if (report.cardinality.unapprovedLabels !== 0) fail('unapproved_labels')
  if (report.readinessIsolation.changedByExporterFailure !== false) {
    fail('readiness_masked')
  }
  if (report.slos.productionClaim !== false) fail('production_slo_claim')
  return true
}
