// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// PAR-X01 I1 (SPEC 0286, decision X-F): in packages/** and apps/** only the process service may
// create a process. scripts/** (CI, build, smoke) is deliberately outside the rule.
const SPAWN_SITE =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](?:node:)?child_process['"]|\bBun\.spawn(?:Sync)?\b|(?:from\s+|require\s*\(\s*)['"]execa['"]/
const SKIPPED_DIRS = new Set([
  'node_modules',
  'dist',
  '__tests__',
  'coverage',
  '.git'
])
/** The service itself, plus the capability probe, which runs before any reviewed profile exists. */
export const ALLOWED = [
  'packages/sandbox/src/capabilities.ts',
  'packages/sandbox/src/process-service/service.ts'
]

export function findSpawnSites(
  root: string,
  roots = ['packages', 'apps']
): string[] {
  const found: string[] = []
  const walk = (dir: string): void => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(path)
      } else if (
        /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name) &&
        !/\.(?:test|spec)\./.test(entry.name) &&
        SPAWN_SITE.test(readFileSync(path, 'utf8'))
      )
        found.push(relative(root, path))
    }
  }
  for (const top of roots) walk(join(root, top))
  return found.sort()
}

describe('PAR-X01 I1: one path to create a process', () => {
  it('finds spawn sites only in the process service and the capability probe', () => {
    expect(findSpawnSites(process.cwd())).toEqual(ALLOWED)
  })

  describe('the scanner itself', () => {
    const root = mkdtempSync(join(tmpdir(), 'x01-boundary-'))
    const put = (path: string, text: string): void => {
      mkdirSync(join(root, path, '..'), { recursive: true })
      writeFileSync(join(root, path), text)
    }
    it.each([
      ['a static import', "import { spawn } from 'node:child_process'"],
      ['a bare module name', "import { exec } from 'child_process'"],
      ['a require', "const cp = require('node:child_process')"],
      ['a dynamic import', "const cp = await import('node:child_process')"],
      ['Bun.spawn', 'const p = Bun.spawn(["ls"])'],
      ['Bun.spawnSync', 'const p = Bun.spawnSync(["ls"])'],
      ['execa', "import { execa } from 'execa'"]
    ])('detects %s in packages/ and in apps/', (_name, text) => {
      put('packages/x/src/a.ts', text)
      put('apps/y/src/b.mjs', text)
      expect(findSpawnSites(root)).toEqual([
        'apps/y/src/b.mjs',
        'packages/x/src/a.ts'
      ])
      rmSync(join(root, 'packages'), { recursive: true })
      rmSync(join(root, 'apps'), { recursive: true })
    })
    it('ignores scripts/, tests, build output and dependencies (X-F)', () => {
      const text = "import { spawn } from 'node:child_process'"
      put('scripts/ci.mjs', text)
      put('packages/x/src/a.test.ts', text)
      put('packages/x/src/__tests__/b.ts', text)
      put('packages/x/dist/c.js', text)
      put('packages/x/node_modules/d/index.js', text)
      put('packages/x/src/notes.md', text)
      expect(findSpawnSites(root)).toEqual([])
    })
    it('does not flag a mention in a comment-free file that merely names a variable', () => {
      put('packages/x/src/e.ts', 'const child = 1; const processes = [child]')
      expect(findSpawnSites(root)).toEqual([])
      rmSync(root, { recursive: true, force: true })
    })
  })
})
