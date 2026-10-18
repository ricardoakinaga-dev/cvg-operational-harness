import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { executeFixture } from './execute-fixture.ts'
import { loadFixtures } from './fixture-schema.mjs'

// Deliberately separate failing conformance probes: never freeze a violation
// as an acceptable golden response and never patch production in this lane.
const input = loadFixtures(resolve('snapshots/core')).find(
  (f) => f.input.id === 'authorized-tool'
)!.input
const evidence = resolve(
  'docs/04_audit/evidence/PARE100-EXEC-20261014/builder-d'
)
describe('SPEC 0181 public composition control conformance', () => {
  it('a paused tenant executes no tool through createOperationalHarness', async () => {
    const actual = await executeFixture(input, 'pause')
    writeFileSync(
      resolve(evidence, 'pause-probe-actual.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    expect(actual.toolBodies).toHaveLength(0)
    expect(actual.result.stopReason).toBe('HUMAN_TAKEOVER')
  })
  it('the publicly injected effect ledger receives started and finished', async () => {
    const actual = await executeFixture(input, 'effects')
    writeFileSync(
      resolve(evidence, 'effects-probe-actual.json'),
      JSON.stringify(actual, null, 2) + '\n'
    )
    expect(actual.toolBodies).toHaveLength(1)
    expect(actual.timeline).toContain('probe/effect-ledger-entries:2')
  })
})
