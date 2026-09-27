import { describe, expect, it } from 'vitest'
import {
  parseE2eEvidenceLog,
  validateE2eReportPair
} from '../scripts/lib/e2e-report-binding.mjs'

const runId = 'run-009'
const candidateId = 'a'.repeat(64)
const executionId = '123e4567-e89b-12d3-a456-426614174000'

function fixture() {
  const cases = [
    { file: 'first.spec.ts', title: 'passes & reports' },
    { file: 'second.spec.ts', title: 'also passes' }
  ]
  const report = {
    config: { metadata: { cvgE2e: { runId, candidateId, executionId } } },
    suites: cases.map(({ file, title }) => ({
      file,
      specs: [
        {
          file,
          title,
          ok: true,
          tests: [
            {
              expectedStatus: 'passed',
              status: 'expected',
              results: [{ status: 'passed', retry: 0, errors: [] }]
            }
          ]
        }
      ]
    })),
    errors: [],
    stats: {
      startTime: '2026-09-27T12:00:00.000Z',
      duration: 100,
      expected: 2,
      skipped: 0,
      unexpected: 0,
      flaky: 0
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites id="${runId}" name="candidateId=${candidateId};executionId=${executionId}" tests="2" failures="0" skipped="0" errors="0">
  <testsuite name="first.spec.ts" tests="1" failures="0" skipped="0" errors="0">
    <testcase classname="first.spec.ts" name="passes &amp; reports"></testcase>
  </testsuite>
  <testsuite name="second.spec.ts" tests="1" failures="0" skipped="0" errors="0">
    <testcase classname="second.spec.ts" name="also passes"/>
  </testsuite>
</testsuites>`
  return { report, xml }
}

function validate(report, xml, options = {}) {
  return validateE2eReportPair({
    jsonContent: JSON.stringify(report),
    xmlContent: xml,
    expectedRunId: runId,
    expectedCandidateId: candidateId,
    expectedTestCount: 2,
    ...options
  })
}

describe('E2E JSON/JUnit report binding', () => {
  it('binds the pair execution ID to exactly one gate log proof', () => {
    const { report, xml } = fixture()
    const logContent = `[e2e-evidence] runId=${runId} candidateId=${candidateId} executionId=${executionId} tests=2 PASS\n`
    const proof = parseE2eEvidenceLog({
      logContent,
      expectedRunId: runId,
      expectedCandidateId: candidateId,
      expectedTestCount: 2
    })
    expect(proof.executionId).toBe(validate(report, xml).executionId)
    const changed = '123e4567-e89b-12d3-a456-426614174001'
    report.config.metadata.cvgE2e.executionId = changed
    const changedXml = xml.replace(executionId, changed)
    expect(validate(report, changedXml).executionId).toBe(changed)
    expect(validate(report, changedXml).executionId).not.toBe(proof.executionId)
    expect(() =>
      parseE2eEvidenceLog({
        logContent: logContent + logContent,
        expectedRunId: runId,
        expectedCandidateId: candidateId
      })
    ).toThrow(/duplicate gate log proof/)
  })
  it('accepts a same-execution pair with an identical case inventory', () => {
    const { report, xml } = fixture()
    expect(validate(report, xml)).toEqual({
      executionId,
      testCount: 2,
      cases: [
        { file: 'first.spec.ts', title: 'passes & reports' },
        { file: 'second.spec.ts', title: 'also passes' }
      ]
    })
  })

  it('accepts Buffer artifacts and nested describe titles from Playwright', () => {
    const { report, xml } = fixture()
    const spec = report.suites[0].specs.pop()
    report.suites[0].suites = [{ title: 'journey', specs: [spec], suites: [] }]
    const nestedXml = xml.replace(
      'name="passes &amp; reports"',
      'name="journey › passes &amp; reports"'
    )
    expect(
      validateE2eReportPair({
        jsonContent: Buffer.from(JSON.stringify(report)),
        xmlContent: Buffer.from(nestedXml),
        expectedRunId: runId,
        expectedCandidateId: candidateId,
        expectedTestCount: 2
      }).testCount
    ).toBe(2)
  })

  it('rejects missing, malformed and tampered JSON identifiers', () => {
    const { report, xml } = fixture()
    delete report.config.metadata.cvgE2e.runId
    expect(() => validate(report, xml)).toThrow(/JSON IDs/)
    report.config.metadata.cvgE2e.runId = runId
    report.config.metadata.cvgE2e.candidateId = 'b'.repeat(64)
    expect(() => validate(report, xml)).toThrow(/JSON IDs/)
    report.config.metadata.cvgE2e.candidateId = candidateId
    report.config.metadata.cvgE2e.executionId = 'not-a-uuid'
    expect(() => validate(report, xml)).toThrow(/JSON IDs/)
  })

  it('rejects missing or tampered JUnit identifiers and stale XML', () => {
    const { report, xml } = fixture()
    expect(() =>
      validate(report, xml.replace(`id="${runId}"`, 'id=""'))
    ).toThrow(/JUnit IDs/)
    expect(() =>
      validate(
        report,
        xml.replace(`candidateId=${candidateId}`, 'candidateId=stale')
      )
    ).toThrow(/JUnit IDs/)
    expect(() =>
      validate(
        report,
        xml.replace(
          `executionId=${executionId}`,
          'executionId=123e4567-e89b-12d3-a456-426614174001'
        )
      )
    ).toThrow(/JUnit IDs/)
  })

  it('rejects empty, malformed and structurally invalid artifacts', () => {
    const { report, xml } = fixture()
    expect(() => validate(report, '')).toThrow(/missing XML report/)
    expect(() =>
      validate(report, xml.replace('</testsuites>', '</wrong>'))
    ).toThrow(/mismatched XML/)
    expect(() => validate(report, xml.replace('&amp;', '&unknown;'))).toThrow(
      /XML entity/
    )
    expect(() => validate(report, '<!DOCTYPE testsuites>' + xml)).toThrow(
      /XML declarations/
    )
    expect(() => validate(report, xml, { jsonContent: '{}' })).toThrow(
      /JSON IDs/
    )
    expect(() => validate(report, xml, { jsonContent: '{' })).toThrow(
      /malformed JSON/
    )
  })

  it('rejects divergent totals and case inventories', () => {
    const { report, xml } = fixture()
    expect(() =>
      validate(report, xml.replace('tests="2"', 'tests="3"'))
    ).toThrow(/root test count/)
    expect(() =>
      validate(report, xml.replace('tests="1"', 'tests="2"'))
    ).toThrow(/suite test count/)
    expect(() =>
      validate(report, xml.replace('name="also passes"', 'name="different"'))
    ).toThrow(/inventory mismatch/)
    expect(() =>
      validate(report, xml.replace('failures="0"', 'failures="1"'))
    ).toThrow(/JUnit root failures/)
    expect(() =>
      validate(
        report,
        xml.replace(
          'name="first.spec.ts" tests="1" failures="0"',
          'name="first.spec.ts" tests="1" failures="1"'
        )
      )
    ).toThrow(/JUnit suite failures/)
    expect(() =>
      validate(report, xml.replace('</testcase>', '<failure/></testcase>'))
    ).toThrow(/JUnit case failed or skipped/)
    expect(() =>
      validate(
        report,
        xml.replace(
          '</testcase>',
          '<system-out><testcase/></system-out></testcase>'
        )
      )
    ).toThrow(/unexpected nested JUnit/)
    expect(() => validate(report, xml, { expectedTestCount: 3 })).toThrow(
      /expected test count/
    )
    report.stats.expected = 3
    expect(() => validate(report, xml)).toThrow(/invalid JSON stats/)
  })

  it('rejects failed, skipped, unexpected and retried JSON tests', () => {
    const { report, xml } = fixture()
    const test = report.suites[0].specs[0].tests[0]
    test.results[0].status = 'failed'
    expect(() => validate(report, xml)).toThrow(/failed, skipped or retried/)
    test.results[0].status = 'passed'
    test.status = 'skipped'
    expect(() => validate(report, xml)).toThrow(/failed, skipped or retried/)
    test.status = 'unexpected'
    expect(() => validate(report, xml)).toThrow(/failed, skipped or retried/)
    test.status = 'expected'
    test.results[0].retry = 1
    expect(() => validate(report, xml)).toThrow(/failed, skipped or retried/)
    test.results[0].retry = 0
    test.results.push({ status: 'passed', retry: 1 })
    expect(() => validate(report, xml)).toThrow(/failed, skipped or retried/)
    test.results.pop()
    report.stats.skipped = 1
    expect(() => validate(report, xml)).toThrow(/invalid JSON stats/)
  })
})
