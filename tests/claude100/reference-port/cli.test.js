// @vitest-environment node
import { it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { parseArgs } from '../../../scripts/claude100-reference-port.mjs'

const valid = [
  '--manifest',
  'manifest.json',
  '--evidence-root',
  '/own/private',
  '--out',
  'new-run'
]
it('has exactly the three documented arguments', () => {
  expect(parseArgs(valid)).toEqual({
    manifest: 'manifest.json',
    evidenceRoot: '/own/private',
    out: 'new-run'
  })
})
it.each(
  [
    [],
    ['--help'],
    valid.slice(0, 4),
    [...valid, 'position'],
    [...valid, '--manifest', 'other'],
    [...valid, '--url', 'http://upstream'],
    [...valid, '--image', 'unreviewed'],
    [...valid, '--api-key', 'invented-secret'],
    [...valid, '--command', 'arbitrary'],
    ['--manifest', '--out', 'value'],
    ['--manifest', '', ...valid.slice(2)]
  ].map((args) => [args])
)('rejects incomplete, duplicate or capability-selecting argv: %j', (args) => {
  expect(() => parseArgs(args)).toThrow('USAGE')
})
it('real CLI usage failure returns2 without echoing data or launching a probe', async () => {
  const script = fileURLToPath(
    new URL('../../../scripts/claude100-reference-port.mjs', import.meta.url)
  )
  try {
    await promisify(execFile)(
      process.execPath,
      [script, '--api-key', 'CVG_INVENTED_SECRET_MUST_NOT_ECHO'],
      {
        env: {
          PATH: '/usr/bin:/bin',
          HOME: '/nonexistent-cvg-synthetic-home',
          LANG: 'C.UTF-8'
        },
        timeout: 2000
      }
    )
    throw new Error('Expected usage rejection')
  } catch (error) {
    expect(error.code).toBe(2)
    expect(error.stdout).toBe('')
    expect(error.stderr).toContain('Usage:')
    expect(error.stderr).not.toContain('CVG_INVENTED_SECRET')
  }
})
