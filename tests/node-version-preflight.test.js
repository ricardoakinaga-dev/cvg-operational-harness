import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkNodeVersion } from '../scripts/node-version-preflight.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('node version preflight (PR-002)', () => {
  it('accepts the exact .nvmrc version', () => {
    expect(checkNodeVersion('22.23.2\n', 'v22.23.2')).toEqual({ ok: true })
  })

  it('warns on a different patch of the same major', () => {
    const result = checkNodeVersion('22.23.2', 'v22.11.0')
    expect(result.ok).toBe(true)
    expect(result.warning).toContain('differs from .nvmrc 22.23.2')
  })

  it('rejects another major version', () => {
    const result = checkNodeVersion('22.23.2', 'v24.20.0')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Node 24.20.0 is not supported')
  })

  it('rejects an unreadable .nvmrc', () => {
    expect(checkNodeVersion('lts/*', 'v22.23.2').ok).toBe(false)
  })

  it('runs as a script against the repository .nvmrc', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/node-version-preflight.mjs'],
      { cwd: rootDir, encoding: 'utf8' }
    )
    const expected = fs.readFileSync(path.join(rootDir, '.nvmrc'), 'utf8')
    const sameMajor =
      expected.trim().split('.')[0] === process.versions.node.split('.')[0]
    expect(result.status).toBe(sameMajor ? 0 : 1)
  })

  it('guards verify and certify and declares engines', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')
    )
    const preflight = 'node scripts/node-version-preflight.mjs && '
    expect(packageJson.scripts.verify.startsWith(preflight)).toBe(true)
    expect(packageJson.scripts.certify.startsWith(preflight)).toBe(true)
    expect(packageJson.engines?.node).toBe('>=22 <23')
  })
})
