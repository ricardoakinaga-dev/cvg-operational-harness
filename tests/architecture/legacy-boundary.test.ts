import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// SPEC-LEGACY-001 (docs/02_spec/0135_legacy_dead_packages_and_boundary.md):
// the legacy Secretary product may depend on the harness, never the reverse.
const repositoryRoot = resolve(process.cwd())

/**
 * Files under apps/ allowed to compose legacy packages. Each entry names the
 * FL task that introduced it; the list shrinks back to empty in PR-L11.
 */
const LEGACY_COMPOSITION_POINTS: readonly string[] = []

const legacyImportPattern =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]*(?:@cvg\/legacy-|\/legacy\/)[^'"]*)['"]/g

const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage'])

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return []
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|mts|mjs)$/.test(entry) && !entry.endsWith('.d.ts')
      ? [path]
      : []
  })
}

function portable(path: string): string {
  return relative(repositoryRoot, path).split(sep).join('/')
}

function findLegacyImports(
  files: readonly { path: string; contents: string }[],
  allowed: readonly string[]
): string[] {
  const violations: string[] = []
  for (const file of files) {
    if (allowed.includes(file.path)) continue
    for (const match of file.contents.matchAll(legacyImportPattern)) {
      violations.push(`${file.path} imports ${match[1]}`)
    }
  }
  return violations
}

function readSources(root: string): { path: string; contents: string }[] {
  return sourceFiles(join(repositoryRoot, root)).map((path) => ({
    path: portable(path),
    contents: readFileSync(path, 'utf8')
  }))
}

describe('legacy boundary (SPEC-LEGACY-001)', () => {
  it('keeps packages/ free of legacy imports', () => {
    expect(findLegacyImports(readSources('packages'), [])).toEqual([])
  })

  it('lets apps/ reach legacy code only through declared composition points', () => {
    expect(
      findLegacyImports(readSources('apps'), LEGACY_COMPOSITION_POINTS)
    ).toEqual([])
  })

  it('detects a forbidden legacy import (negative case)', () => {
    const synthetic = [
      {
        path: 'packages/example/src/index.ts',
        contents: "import { preset } from '@cvg/legacy-secretary-profile'"
      },
      {
        path: 'apps/api/src/example.ts',
        contents: "const m = await import('../../../legacy/packages/x/src')"
      },
      {
        path: 'apps/api/src/allowed.ts',
        contents: "import { plugin } from '@cvg/legacy-secretary-journeys'"
      }
    ]

    expect(findLegacyImports(synthetic, ['apps/api/src/allowed.ts'])).toEqual([
      'packages/example/src/index.ts imports @cvg/legacy-secretary-profile',
      'apps/api/src/example.ts imports ../../../legacy/packages/x/src'
    ])
  })

  it('names every legacy package @cvg/legacy-*', () => {
    const packagesRoot = join(repositoryRoot, 'legacy/packages')
    const manifests = existsSync(packagesRoot)
      ? readdirSync(packagesRoot)
          .map((entry) => join(packagesRoot, entry, 'package.json'))
          .filter((path) => existsSync(path))
      : []

    for (const manifest of manifests) {
      const { name } = JSON.parse(readFileSync(manifest, 'utf8')) as {
        name?: string
      }
      expect(name, portable(manifest)).toMatch(/^@cvg\/legacy-[a-z0-9-]+$/)
    }
  })
})
