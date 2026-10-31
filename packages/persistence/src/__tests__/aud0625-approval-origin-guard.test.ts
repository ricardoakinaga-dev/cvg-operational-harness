import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// SPEC 0291, review D9 P3-3: PostgresApprovalAuthority.verifyAndConsume does not check the
// approval origin; the runtime does, before any reservation. The method has no production
// caller today. This guard fails when one appears, so the origin check is added with it.
const root = join(import.meta.dirname, '..', '..', '..', '..')

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist' || name === '__tests__') {
      return []
    }
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|mts)$/.test(name) && !/\.(test|spec)\./.test(name)
      ? [path]
      : []
  })
}

describe('SPEC 0291 P3-3: PostgresApprovalAuthority.verifyAndConsume has no production caller', () => {
  const files = [
    ...sources(join(root, 'apps')),
    ...sources(join(root, 'packages'))
  ].map((path) => ({
    path: relative(root, path).split(sep).join('/'),
    text: readFileSync(path, 'utf8')
  }))

  it('control: the scan sees the authority and its own definition', () => {
    const definition = files.filter((file) =>
      file.text.includes('class PostgresApprovalAuthority')
    )
    expect(definition.map((file) => file.path)).toEqual([
      'packages/persistence/src/runtime-approval-store.ts'
    ])
    expect(files.length).toBeGreaterThan(200)
  })

  it('no production file other than the definition names the authority and calls verifyAndConsume', () => {
    const offenders = files
      .filter(
        (file) =>
          file.path !== 'packages/persistence/src/runtime-approval-store.ts' &&
          file.text.includes('PostgresApprovalAuthority') &&
          /\bverifyAndConsume\s*\(/.test(file.text)
      )
      .map((file) => file.path)
    expect(offenders).toEqual([])
  })
})
