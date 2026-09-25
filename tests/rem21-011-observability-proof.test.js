import { describe, expect, it } from 'vitest'
import {
  REM21_011_CONTRACT,
  validateRem21011ProofReport
} from '../scripts/rem21-011-observability-proof-contract.mjs'

function report(overrides = {}) {
  return {
    schemaVersion: 1,
    kind: 'rem21-011-observability-proof',
    contract: REM21_011_CONTRACT,
    runId: 'run-rem21-011-fixture',
    candidateId: 'a'.repeat(64),
    node: 'v22.23.2',
    verdict: 'PASS',
    scope: { production: false, realData: false },
    collector: { status: 'PASS' },
    redaction: { status: 'PASS', leaked: false },
    cardinality: { status: 'PASS', unapprovedLabels: 0 },
    exporterFault: { status: 'PASS', noThrow: true, alerted: true },
    slos: { status: 'PASS', productionClaim: false },
    readinessIsolation: { status: 'PASS', changedByExporterFailure: false },
    ...overrides
  }
}

describe('REM21-011 observability proof contract', () => {
  it('accepts a complete local report', () => {
    expect(
      validateRem21011ProofReport(report(), {
        runId: 'run-rem21-011-fixture',
        candidateId: 'a'.repeat(64)
      })
    ).toBe(true)
  })

  it('rejects run/candidate mismatch and production claims', () => {
    expect(() =>
      validateRem21011ProofReport(report(), {
        runId: 'run-other',
        candidateId: 'a'.repeat(64)
      })
    ).toThrow(/run_binding/)
    expect(() =>
      validateRem21011ProofReport(report(), {
        runId: 'run-rem21-011-fixture',
        candidateId: 'b'.repeat(64)
      })
    ).toThrow(/candidate_binding/)
    expect(() =>
      validateRem21011ProofReport(
        report({ scope: { production: true, realData: false } })
      )
    ).toThrow(/production_scope/)
  })

  it('rejects leaks, unapproved labels and readiness masking', () => {
    expect(() =>
      validateRem21011ProofReport(
        report({ redaction: { status: 'PASS', leaked: true } })
      )
    ).toThrow(/redaction_leak/)
    expect(() =>
      validateRem21011ProofReport(
        report({ cardinality: { status: 'PASS', unapprovedLabels: 1 } })
      )
    ).toThrow(/unapproved_labels/)
    expect(() =>
      validateRem21011ProofReport(
        report({
          readinessIsolation: { status: 'PASS', changedByExporterFailure: true }
        })
      )
    ).toThrow(/readiness_masked/)
  })
})
