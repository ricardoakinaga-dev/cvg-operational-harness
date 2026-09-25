import { describe, expect, it } from 'vitest'
import {
  REM21_010_CONTRACT,
  validateRem21010ProofReport
} from '../scripts/rem21-010-postgres-proof-contract.mjs'

const validReport = {
  schemaVersion: 1,
  kind: 'rem21-010-postgres-proof',
  contract: REM21_010_CONTRACT,
  runId: 'run-rem21-010-red-fixture',
  candidateId: 'a'.repeat(64),
  node: 'v22.23.2',
  verdict: 'PASS',
  scope: { production: false, realData: false },
  workload: { status: 'PASS' },
  backupRestore: { status: 'PASS' },
  migrationRecovery: { status: 'PASS' },
  integrity: { status: 'PASS' },
  corruptionGate: { status: 'PASS', detected: true },
  rpoRto: { measured: false, verdict: 'RPO_RTO_NOT_MEASURED_IN_PRODUCTION' }
}

describe('REM21-010 PostgreSQL proof contract', () => {
  it('rejects an incomplete baseline report before the runner exists', () => {
    expect(() => validateRem21010ProofReport({})).toThrow(
      'rem21_010_contract_invalid'
    )
  })

  it('will accept the complete report shape after implementation', () => {
    expect(() =>
      validateRem21010ProofReport(validReport, {
        runId: validReport.runId,
        candidateId: validReport.candidateId
      })
    ).not.toThrow()
  })

  it('must reject a candidate binding mismatch', () => {
    expect(() =>
      validateRem21010ProofReport(validReport, {
        runId: validReport.runId,
        candidateId: 'b'.repeat(64)
      })
    ).toThrow('candidate_binding')
  })

  it('must reject a report that claims production RPO/RTO', () => {
    expect(() =>
      validateRem21010ProofReport({
        ...validReport,
        rpoRto: { measured: true, verdict: 'MEASURED' }
      })
    ).toThrow('rpo_rto_claim')
  })
})
