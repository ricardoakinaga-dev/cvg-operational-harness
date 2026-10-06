import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Static import specifiers of one module (`import … from`, `export … from`). */
function staticImports(file) {
  const source = fs.readFileSync(file, 'utf8')
  return [
    ...source.matchAll(
      /^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm
    ),
    ...source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)
  ].map((match) => match[1])
}

/** Every package the module graph needs, following relative imports. */
function packagesReachedFrom(entry) {
  const seen = new Set()
  const packages = new Set()
  const visit = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const specifier of staticImports(file)) {
      if (specifier.startsWith('node:')) continue
      if (specifier.startsWith('.')) {
        visit(path.resolve(path.dirname(file), specifier))
        continue
      }
      packages.add(`${path.relative(root, file)} -> ${specifier}`)
    }
  }
  visit(entry)
  return [...packages]
}

describe('ci-bar bootstrap (AUD-0599)', () => {
  it('loads before the install gate: no installed package in its import graph', () => {
    expect(packagesReachedFrom(path.join(root, 'scripts/ci-bar.mjs'))).toEqual(
      []
    )
  })

  it('the probe sees a package import when one exists', () => {
    expect(
      packagesReachedFrom(
        path.join(root, 'scripts/lib/certification-rules.mjs')
      )
    ).toContain('scripts/lib/certification-rules.mjs -> zod')
  })
})
