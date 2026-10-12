import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SESSION_EVENT_CATALOG_V1 } from '@cvg/harness-contracts'
import {
  canonicalizeJson as neutralCanonical,
  CanonicalJsonError as NeutralCanonicalError
} from '@cvg/harness-contracts'
import {
  canonicalizeJson as sharedCanonical,
  CanonicalJsonError as SharedCanonicalError
} from '@cvg/shared'
import { sessionEventFingerprint } from '@cvg/harness'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function copy() {
  const root = mkdtempSync(join(tmpdir(), 'pdsh021-catalog-'))
  roots.push(root)
  for (const file of [
    'scripts/gen-session-catalog.mjs',
    'packages/contracts/src/canonical-json.ts',
    'packages/contracts/src/session-event-schemas.v1.json',
    'docs/architecture/SESSION_EVENT_CATALOG.md'
  ]) {
    const parts = file.split('/')
    parts.pop()
    mkdirSync(join(root, ...parts), { recursive: true })
    cpSync(file, join(root, file))
  }
  return root
}
describe('PDSH-021 session catalog fingerprints', () => {
  it('keeps shared serialization as the exact neutral implementation and error identity', () => {
    expect(sharedCanonical).toBe(neutralCanonical)
    expect(SharedCanonicalError).toBe(NeutralCanonicalError)
    expect(sharedCanonical({ z: undefined, a: [undefined, -0] })).toBe(
      '{"a":[null,0]}'
    )
  })
  it('uses the same shared canonical fingerprints as runtime and is current', () => {
    const content = readFileSync(
      'docs/architecture/SESSION_EVENT_CATALOG.md',
      'utf8'
    )
    for (const type of Object.keys(SESSION_EVENT_CATALOG_V1.events))
      expect(content).toContain(
        sessionEventFingerprint(
          type as keyof typeof SESSION_EVENT_CATALOG_V1.events
        )
      )
    expect(
      execFileSync(
        process.execPath,
        ['scripts/gen-session-catalog.mjs', '--check'],
        { encoding: 'utf8' }
      )
    ).toContain('up to date')
  })
  it('is deterministic and rejects schema drift in a temporary copy', () => {
    const root = copy()
    const target = join(root, 'docs/architecture/SESSION_EVENT_CATALOG.md')
    const before = readFileSync(target, 'utf8')
    execFileSync(process.execPath, ['scripts/gen-session-catalog.mjs'], {
      cwd: root
    })
    expect(readFileSync(target, 'utf8')).toBe(before)
    const path = join(
      root,
      'packages/contracts/src/session-event-schemas.v1.json'
    )
    const data = JSON.parse(readFileSync(path, 'utf8'))
    data.definitions.text['x-maxUtf8Bytes'] = 123
    writeFileSync(path, JSON.stringify(data))
    expect(() =>
      execFileSync(
        process.execPath,
        ['scripts/gen-session-catalog.mjs', '--check'],
        { cwd: root, stdio: 'pipe' }
      )
    ).toThrow()
  })
})
