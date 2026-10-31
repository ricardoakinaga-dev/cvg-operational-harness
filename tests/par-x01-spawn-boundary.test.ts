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
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// PAR-X01 I1 (SPEC 0286, decision X-F): in packages/** and apps/** only the process service may
// create a process. scripts/** (CI, build, smoke) is deliberately outside the rule.
// Syntactic, not textual (review F1): a comment, a template literal, `process.getBuiltinModule`,
// `createRequire` or `import x = require()` all name the module as a string literal, so any
// such literal is a spawn site wherever it appears; comments never produce a literal. A name
// built at run time ('child_' + 'process') is the one form a static scan cannot see; the
// process service remains the only reviewed path and review keeps watching new native imports.
const FORBIDDEN_MODULES = new Set([
  'child_process',
  'node:child_process',
  'execa'
])
const SCRIPT_KIND: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.js': ts.ScriptKind.JS,
  '.mjs': ts.ScriptKind.JS,
  '.cjs': ts.ScriptKind.JS
}
function createsProcesses(path: string, text: string): boolean {
  const kind =
    SCRIPT_KIND[path.slice(path.lastIndexOf('.'))] ?? ts.ScriptKind.TS
  const file = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    false,
    kind
  )
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      FORBIDDEN_MODULES.has(node.text)
    )
      found = true
    else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Bun' &&
      /^spawn(?:Sync)?$/.test(node.name.text)
    )
      found = true
    else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Bun' &&
      ts.isStringLiteralLike(node.argumentExpression) &&
      /^spawn(?:Sync)?$/.test(node.argumentExpression.text)
    )
      found = true
    if (!found) ts.forEachChild(node, visit)
  }
  visit(file)
  return found
}
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
        createsProcesses(path, readFileSync(path, 'utf8'))
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
      ['Bun["spawn"]', 'const p = Bun["spawn"](["ls"])'],
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
    const cleanup = (): void => {
      rmSync(join(root, 'packages'), { recursive: true, force: true })
      rmSync(join(root, 'apps'), { recursive: true, force: true })
    }
    it.each([
      [
        'process.getBuiltinModule',
        "process.getBuiltinModule('child_process').spawn('/usr/bin/true')"
      ],
      [
        'getBuiltinModule with the node: scheme and a computed name',
        'const cp = process[\'getBuiltinModule\']("node:child_process")'
      ],
      [
        'a comment between from and the module',
        "import { spawn } from /* process API */ 'node:child_process'"
      ],
      [
        'a line comment inside an import',
        "import {\n  spawn // go\n} from\n  'child_process'"
      ],
      [
        'a comment inside a dynamic import',
        "const cp = await import(/* c */ 'node:child_process')"
      ],
      ['import = require', "import cp = require('node:child_process')"],
      [
        'a template literal without substitutions',
        'const cp = require(`child_process`)'
      ],
      [
        'createRequire',
        "const cp = createRequire(import.meta.url)('child_process')"
      ],
      ['an export-from', "export { spawn } from 'node:child_process'"]
    ])('F1: detects %s', (_name, text) => {
      put('packages/x/src/native.ts', text)
      expect(findSpawnSites(root)).toEqual(['packages/x/src/native.ts'])
      cleanup()
    })
    it.each([
      [
        'a comment that only names the module',
        '// uses child_process? no\n/* node:child_process */ const a = 1'
      ],
      [
        'an identifier and a longer string',
        "const child_process = 1; const s = 'child_processing'"
      ],
      [
        'a URL with slashes in a string',
        "const u = 'https://example.org/child'; const v = 2"
      ]
    ])('F1: does not flag %s', (_name, text) => {
      put('packages/x/src/native.ts', text)
      expect(findSpawnSites(root)).toEqual([])
      cleanup()
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
