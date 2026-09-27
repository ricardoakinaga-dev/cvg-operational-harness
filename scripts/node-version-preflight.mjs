/**
 * PR-002 — Node toolchain preflight.
 *
 * `.nvmrc` is the single source of the supported Node version. A different
 * major version aborts `verify`/`certify`, because certification evidence
 * produced on another runtime is not comparable (AUD-0577 measured different
 * coverage on Node 24). A different patch of the same major only warns.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function parse(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) return null
  return match.slice(1, 4).map(Number)
}

export function checkNodeVersion(expected, actual) {
  const want = parse(expected)
  const have = parse(actual)
  if (!want) {
    return { ok: false, message: `invalid .nvmrc version: ${expected.trim()}` }
  }
  if (!have) {
    return { ok: false, message: `invalid Node version: ${actual}` }
  }
  if (want[0] !== have[0]) {
    return {
      ok: false,
      message: `Node ${have.join('.')} is not supported; use Node ${want.join('.')} from .nvmrc (nvm use)`
    }
  }
  if (want[1] !== have[1] || want[2] !== have[2]) {
    return {
      ok: true,
      warning: `Node ${have.join('.')} differs from .nvmrc ${want.join('.')}; certification evidence should use the pinned version`
    }
  }
  return { ok: true }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const expected = readFileSync(resolve(process.cwd(), '.nvmrc'), 'utf8')
  const result = checkNodeVersion(expected, process.version)
  if (!result.ok) {
    console.error(`[node-preflight] FAIL ${result.message}`)
    process.exit(1)
  }
  if (result.warning) console.error(`[node-preflight] WARN ${result.warning}`)
}
