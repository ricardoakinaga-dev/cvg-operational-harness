export const REM21_010_CONTRACT = 'rem21-010-v1'

const SHA256 = /^[0-9a-f]{64}$/

function fail(reason) {
  throw new Error(`rem21_010_contract_invalid:${reason}`)
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
 * Validates the run-bound local proof artifact. This contract deliberately
 * rejects claims that would turn a disposable PostgreSQL exercise into a
 * production RPO/RTO or release claim.
 */
export function validateRem21010ProofReport(report, expected = {}) {
  if (!isRecord(report)) fail('report')
  if (report.schemaVersion !== 1) fail('schema_version')
  if (report.kind !== 'rem21-010-postgres-proof') fail('kind')
  if (report.contract !== REM21_010_CONTRACT) fail('contract')
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
    'workload',
    'backupRestore',
    'migrationRecovery',
    'integrity'
  ]) {
    requirePass(report, key)
  }
  if (
    !isRecord(report.corruptionGate) ||
    report.corruptionGate.status !== 'PASS' ||
    report.corruptionGate.detected !== true
  ) {
    fail('corruption_gate')
  }
  if (!isRecord(report.rpoRto) || report.rpoRto.measured !== false) {
    fail('rpo_rto_claim')
  }
  if (report.rpoRto.verdict !== 'RPO_RTO_NOT_MEASURED_IN_PRODUCTION') {
    fail('rpo_rto_verdict')
  }
  return true
}
