// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runContained } from '../packages/sandbox/src/run.ts'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

interface Observation {
  inside: string
  outsideReadable: boolean
  outside: string | null
  deniedCode: string | null
  syntheticEnv: string | null
}
const environmentKey = 'CVG_AUD0625_OWN_SENTINEL_ENV'
let base: string | undefined
let observed: Observation

describe('AUD0625 F02 — native PROCESS filesystem and environment boundary', () => {
  beforeAll(async () => {
    const root = process.env.CVG_AUD0625_FIXTURE_ROOT ?? process.cwd()
    if (root === '/tmp' || root.startsWith('/tmp/'))
      throw new Error('Use an owned fixture root outside the /tmp mount shadow')
    base = mkdtempSync(join(root, 'process-'))
    const workspace = join(base, 'workspace')
    mkdirSync(workspace)
    const inside = join(workspace, 'inside.txt'),
      outside = join(base, 'outside.txt')
    writeFileSync(inside, 'CVG-OWN-INSIDE')
    writeFileSync(outside, 'CVG-OWN-OUTSIDE')
    const previous = process.env[environmentKey]
    try {
      process.env[environmentKey] = 'CVG-OWN-ENV'
      const result = await runContained({
        processProfile: reviewedNodeProfile(workspace),
        argv: [
          process.execPath,
          '-e',
          `const fs=require('node:fs');const inside=fs.readFileSync(process.argv[1],'utf8');let outside=null,deniedCode=null;try{outside=fs.readFileSync(process.argv[2],'utf8')}catch(e){if(!['ENOENT','EACCES','EPERM'].includes(e.code))throw e;deniedCode=e.code}process.stdout.write(JSON.stringify({inside,outsideReadable:outside!==null,outside,deniedCode,syntheticEnv:process.env.CVG_AUD0625_OWN_SENTINEL_ENV??null}))`,
          inside,
          outside
        ],
        handle: {
          mode: 'PROCESS',
          workspaceRoot: workspace,
          allowNetwork: false,
          allowSubprocess: true
        },
        timeoutMs: 2000
      })
      // Admission is outside it.fails: infra/setup/parse errors must fail the suite.
      expect(result.exitCode, result.stderr).toBe(0)
      expect(result.truncated).toBe(false)
      observed = JSON.parse(result.stdout) as Observation
      expect(observed.inside).toBe('CVG-OWN-INSIDE')
      expect(typeof observed.outsideReadable).toBe('boolean')
      expect(
        observed.outsideReadable ? observed.outside : observed.deniedCode
      ).toBeTruthy()
    } finally {
      if (previous === undefined) delete process.env[environmentKey]
      else process.env[environmentKey] = previous
    }
  }, 30000)
  afterAll(() => {
    if (base) rmSync(base, { recursive: true, force: true })
  })
  it('positive control: real contained Node reads its owned workspace marker', () => {
    expect(observed.inside).toBe('CVG-OWN-INSIDE')
  })
  it('F02 PROCESS cannot read its owned sentinel outside the granted workspace', () => {
    expect({
      readable: observed.outsideReadable,
      content: observed.outside
    }).toEqual({ readable: false, content: null })
  })
  it('F02 PROCESS does not inherit the unapproved synthetic parent variable', () => {
    expect(observed.syntheticEnv).toBeNull()
  })
})
