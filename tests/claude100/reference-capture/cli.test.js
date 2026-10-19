// @vitest-environment node
// CLI entry discipline. Only usage errors execute the real entry; no target runs.
import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { parseArgs } from '../../../scripts/claude100-reference-capture.mjs'

const cliUrl = new URL(
  '../../../scripts/claude100-reference-capture.mjs',
  import.meta.url
)

describe('reference capture CLI', () => {
  it('parses exactly three unique options and nothing else', () => {
    expect(
      parseArgs(['--manifest', 'm.json', '--evidence-root', '/r', '--out', 'o'])
    ).toEqual({ manifest: 'm.json', evidenceRoot: '/r', out: 'o' })
    for (const args of [
      [],
      ['--manifest', 'm'],
      ['--manifest', 'a', '--manifest', 'b', '--out', 'o'],
      ['--manifest', 'm', '--evidence-root', '/r', '--out', 'o', 'extra'],
      ['--manifest', 'm', '--evidence-root', '/r', '--out', '--x'],
      ['--manifest', 'm', '--evidence-root', '/r', '--command', 'x'],
      ['--manifest', '', '--evidence-root', '/r', '--out', 'o']
    ])
      expect(() => parseArgs(args)).toThrow('USAGE')
  })
  it('imports only node:url and the builtin-only bootstrap before one literal transfer', async () => {
    const text = await readFile(cliUrl, 'utf8')
    const imports = [...text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map(
      (m) => m[1]
    )
    expect(imports).toEqual([
      'node:url',
      '../tests/claude100/reference-port/bootstrap.mjs'
    ])
    expect([...text.matchAll(/\bimport\s*\(/g)]).toHaveLength(1)
    expect(text).toContain(
      "graph.root + '/tests/claude100/reference-capture/controller.mjs'"
    )
    expect(text.indexOf('await freezeCaptureGraph')).toBeLessThan(
      text.indexOf('await import(')
    )
    expect(text).toMatch(
      /controller\.runCapture\(\s*options,\s*graph,\s*releaseEntrySignals\s*\)/
    )
    for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM'])
      expect(text).toContain(`'${signal}'`)
    // The only env access refuses inherited Node loader/runtime options.
    expect([...text.matchAll(/process\.env/g)]).toHaveLength(2)
    expect(text).toContain("Object.hasOwn(process.env, 'NODE_OPTIONS')")
    expect(text).toContain("Object.hasOwn(process.env, 'NODE_PATH')")
    expect(text).toContain('process.execArgv.length')
  })
  it.each([
    [{ NODE_OPTIONS: '--no-warnings' }, []],
    [{ NODE_PATH: '/x' }, []],
    [{}, ['--no-warnings']]
  ])(
    'refuses inherited %j / execArgv %j as invalid usage',
    async (extra, execArgv) => {
      const error = await promisify(execFile)(
        process.execPath,
        [
          ...execArgv,
          cliUrl.pathname,
          '--manifest',
          'm',
          '--evidence-root',
          '/r',
          '--out',
          'o'
        ],
        {
          env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', ...extra },
          timeout: 5000
        }
      ).catch((e) => e)
      expect(error.code).toBe(2)
    }
  )
  it('exits 2 with usage text and no evidence for invalid usage', async () => {
    const run = promisify(execFile)
    const error = await run(
      process.execPath,
      [cliUrl.pathname, '--manifest', 'x'],
      { env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, timeout: 5000 }
    ).catch((e) => e)
    expect(error.code).toBe(2)
    expect(error.stderr).toBe(
      'Usage: --manifest FILE --evidence-root PRIVATE_DIR --out NEW_DIR\n'
    )
  })
})
