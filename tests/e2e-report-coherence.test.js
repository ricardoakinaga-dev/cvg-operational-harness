import { describe, expect, it } from 'vitest'
import { validateE2ERunBinding } from '../scripts/lib/certification-rules.mjs'

const runId = 'run-e2e-coherence'
const report = { config: { metadata: { runId } } }
const xml = `<?xml version="1.0"?><testsuites id="${runId}" tests="12"></testsuites>`

describe('E2E JSON and JUnit run binding', () => {
  it('accepts identical run IDs', () => {
    expect(validateE2ERunBinding(report, xml, runId)).toEqual([])
  })

  it('rejects a missing run ID in either report or certificate', () => {
    expect(validateE2ERunBinding(report, xml, '')).toContain(
      'e2e_run_id_missing'
    )
    expect(validateE2ERunBinding({}, xml, runId)).toContain(
      'e2e_json_run_id_mismatch'
    )
    expect(
      validateE2ERunBinding(report, '<testsuites></testsuites>', runId)
    ).toContain('e2e_junit_run_id_mismatch')
  })

  it('rejects divergent IDs and a missing JUnit root', () => {
    expect(
      validateE2ERunBinding(
        { config: { metadata: { runId: 'run-other' } } },
        xml,
        runId
      )
    ).toContain('e2e_json_run_id_mismatch')
    expect(
      validateE2ERunBinding(
        report,
        '<testsuites id="run-other"></testsuites>',
        runId
      )
    ).toContain('e2e_junit_run_id_mismatch')
    expect(validateE2ERunBinding(report, '<testsuite/>', runId)).toContain(
      'e2e_junit_root_missing'
    )
  })
})
