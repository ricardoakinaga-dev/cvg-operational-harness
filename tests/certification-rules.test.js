import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseVitestJsonMetrics,
  sha256Bytes,
  verifyGateEvidence,
  VITEST_REPORT_PATHS
} from '../scripts/lib/certification-rules.mjs'

const validReport = {
  numTotalTests: 3,
  numPassedTests: 1,
  numFailedTests: 1,
  numPendingTests: 1,
  numTodoTests: 0,
  testResults: [
    {
      status: 'passed',
      assertionResults: [{ status: 'passed' }, { status: 'pending' }]
    },
    { status: 'failed', assertionResults: [{ status: 'failed' }] }
  ]
}

describe('Vitest JSON certification metrics', () => {
  it('derives file and assertion counts without parsing runner text', () => {
    expect(parseVitestJsonMetrics(validReport)).toEqual({
      filesPassed: 1,
      filesFailed: 1,
      filesSkipped: 0,
      testsPassed: 1,
      testsFailed: 1,
      testsSkipped: 1
    })
  })

  it('rejects missing, empty, inconsistent and unknown statuses', () => {
    expect(parseVitestJsonMetrics(null)).toBeNull()
    expect(
      parseVitestJsonMetrics({ ...validReport, testResults: [] })
    ).toBeNull()
    expect(
      parseVitestJsonMetrics({ ...validReport, numTotalTests: 4 })
    ).toBeNull()
    expect(
      parseVitestJsonMetrics({ ...validReport, numPendingTests: -1 })
    ).toBeNull()
    expect(
      parseVitestJsonMetrics({
        ...validReport,
        testResults: [
          { status: 'passed', assertionResults: [{ status: 'unknown' }] }
        ]
      })
    ).toBeNull()
  })

  it('accepts the tracked raw unit report without relying on stdout format', () => {
    const report = JSON.parse(fs.readFileSync(VITEST_REPORT_PATHS.unit))
    const metrics = parseVitestJsonMetrics(report)
    expect(metrics?.filesPassed).toBeGreaterThan(300)
    expect(metrics?.testsPassed).toBeGreaterThan(2000)
    expect(metrics?.testsFailed).toBe(0)
  })

  it('verifies unit counts when the runner log has no textual summary', () => {
    const runId = 'run-json-proof'
    const candidateId = 'a'.repeat(64)
    const logPath = 'certification/logs/unit.log'
    const reportPath = VITEST_REPORT_PATHS.unit
    const log = Buffer.from(
      `$ npm test\n# runId=${runId} candidateId=${candidateId} gate=unit exitCode=0\nrunner output without a Vitest summary\n`
    )
    const report = Buffer.from(
      JSON.stringify({
        numTotalTests: 1,
        numPassedTests: 1,
        numFailedTests: 0,
        numPendingTests: 0,
        numTodoTests: 0,
        testResults: [
          { status: 'passed', assertionResults: [{ status: 'passed' }] }
        ]
      })
    )
    const artifacts = new Map([
      [logPath, log],
      [reportPath, report]
    ])
    const evidence = [...artifacts].map(([path, content]) => ({
      path,
      sha256: sha256Bytes(content),
      size: content.byteLength,
      kind: path === logPath ? 'log' : 'result',
      runId
    }))
    const result = {
      runId,
      candidate: { candidateId },
      gates: [
        {
          id: 'unit',
          status: 'PASS',
          exitCode: 0,
          metrics: {
            filesPassed: 1,
            filesFailed: 0,
            filesSkipped: 0,
            testsPassed: 1,
            testsFailed: 0,
            testsSkipped: 0
          },
          evidence
        }
      ],
      metrics: { unit: { testsPassed: 1 } }
    }
    const manifest = {
      runId,
      candidateId,
      artifacts: evidence
    }
    const failures = verifyGateEvidence({
      result,
      manifest,
      artifactReader: (path) => artifacts.get(path)
    })
    expect(failures).not.toContain('gate_inventory_unparsable:unit')
    expect(
      failures.some((failure) =>
        failure.startsWith('gate_metrics_mismatch:unit')
      )
    ).toBe(false)

    artifacts.set(reportPath, Buffer.from('{"invalid":true}'))
    const invalidFailures = verifyGateEvidence({
      result,
      manifest,
      artifactReader: (path) => artifacts.get(path)
    })
    expect(invalidFailures).toContain('gate_inventory_unparsable:unit')
  })
})
