import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { auditProductBoundary } from '../scripts/check-product-boundary.mjs'

const proposalPath =
  'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0216/proposed-exceptions.json'
const proposalBytes = fs.readFileSync(proposalPath)
const { groups } = JSON.parse(proposalBytes)
const pins = [...new Set(groups.flatMap((g) => Object.keys(g.pins)))]
const ids = new Set(groups.map((g) => g.id))
const roots = []
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const count = (g) => g.rows.reduce((sum, row) => sum + row.max, 0)
const accepted = (a) => a.exceptions.filter((d) => ids.has(d.exception))
const sourceFile = (d) => d.file.replace(/:\d+$/, '')
const siteFiles = new Set(groups.flatMap((g) => Object.keys(g.sites)))
const rawSites = (a) =>
  a.diagnostics.filter(
    (d) =>
      siteFiles.has(sourceFile(d)) &&
      d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
  )
const appliedCounts = (a) =>
  groups.map((g) => a.exceptions.filter((d) => d.exception === g.id).length)

// Inspect only literal AST data; do not evaluate the checker or any pinned
// platform/sandbox module to compare the approved tables.
function qualificationTable() {
  const source = ts.createSourceFile(
    'checker.mjs',
    fs.readFileSync('scripts/check-product-boundary.mjs', 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  )
  const declaration = source.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => node.name.getText(source) === 'capabilityExceptions')
  expect(declaration).toBeDefined()
  const literal = (node) => {
    if (ts.isStringLiteral(node)) return node.text
    if (ts.isNumericLiteral(node)) return Number(node.text)
    if (ts.isArrayLiteralExpression(node))
      return [...node.elements].map(literal)
    expect(ts.isObjectLiteralExpression(node)).toBe(true)
    return Object.fromEntries(
      node.properties.map((property) => {
        expect(ts.isPropertyAssignment(property)).toBe(true)
        return [property.name.text, literal(property.initializer)]
      })
    )
  }
  return literal(declaration.initializer)
}

function temporary(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

function fixture() {
  const root = temporary('cvg-b216-')
  const write = (file, bytes) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), bytes)
  }
  const aliases = [
    '@cvg/shared',
    '@cvg/harness',
    '@cvg/harness-contracts',
    'zod'
  ]
  write(
    'package.json',
    JSON.stringify({ workspaces: ['packages/*', 'products/*'] })
  )
  write(
    'tsconfig.base.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: Object.fromEntries(
          aliases.map((name) => [name, ['packages/support/src/index.ts']])
        )
      }
    })
  )
  for (const name of ['platform', 'sandbox', 'support'])
    write(
      `packages/${name}/package.json`,
      JSON.stringify({ name: `@fixture/${name}`, main: 'src/index.ts' })
    )
  write('packages/support/src/index.ts', 'export const synthetic = true\n')
  // Only the approved physical pins are copied. Resolve their other imports
  // to inert local stubs so unrelated missing modules cannot hide a failure.
  // The auditor parses these files; none of their module bodies are imported.
  for (const file of pins) write(file, fs.readFileSync(file))
  for (const file of pins) {
    const source = fs.readFileSync(file, 'utf8')
    for (const [, specifier] of source.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) {
      if (!specifier.startsWith('.')) continue
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), specifier)
      )
      if (!fs.existsSync(path.join(root, target))) write(target, 'export {}\n')
    }
  }
  // dist is excluded from discovery: these imports deliberately reach each
  // compiled mirror through the real graph resolver.
  write(
    'packages/support/src/mirrors.ts',
    "import '../../platform/dist/plugin-execution-core.js'\n" +
      "import '../../sandbox/dist/capabilities.js'\n" +
      "import '../../sandbox/dist/run.js'\n"
  )
  write(
    'products/shift/package.json',
    JSON.stringify({ name: '@private/product', main: 'src/index.ts' })
  )
  write('products/shift/src/index.ts', 'export const productOnly = 1\n')
  return {
    root,
    write,
    audit: (options) => auditProductBoundary(root, options)
  }
}

// Fault injection is confined to a disposable copy, as in SPEC0215. No global
// hooks, exported exception API, or change to the production checker/table.
function copiedAuditor(f, { repin = [], changeGroup } = {}) {
  const directory = temporary('cvg-b216-checker-')
  let source = fs.readFileSync('scripts/check-product-boundary.mjs', 'utf8')
  for (const file of repin) {
    const old = groups.find((g) => Object.hasOwn(g.pins, file)).pins[file]
    expect(source).toContain(old)
    source = source.replaceAll(
      old,
      digest(fs.readFileSync(path.join(f.root, file)))
    )
  }
  if (changeGroup) {
    const { group, mutate } = changeGroup
    const start = source.indexOf(`id: '${group.id}'`)
    const end = source.indexOf('\n    id:', start + 1)
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
    const before = source.slice(start, end)
    const after = mutate(before)
    expect(after).not.toBe(before)
    source = source.slice(0, start) + after + source.slice(end)
  }
  for (const name of [
    'boundary-manifests.mjs',
    'boundary-installed-identity.mjs',
    'boundary-code-execution.mjs',
    'boundary-lexical.mjs',
    'tsconfig-path-grammar.mjs'
  ])
    fs.copyFileSync(path.join('scripts', name), path.join(directory, name))
  fs.symlinkSync(
    path.resolve('node_modules'),
    path.join(directory, 'node_modules'),
    'dir'
  )
  const file = path.join(directory, 'check-product-boundary.mjs')
  fs.writeFileSync(file, source)
  return (options = {}) => {
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'const {auditProductBoundary}=await import(process.argv[1]);process.stdout.write(JSON.stringify(auditProductBoundary(process.argv[2], JSON.parse(process.argv[3]))))',
        pathToFileURL(file).href,
        f.root,
        JSON.stringify(options)
      ],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(run.status, run.stderr).toBe(0)
    return JSON.parse(run.stdout)
  }
}

function expectPinsValid(f, repin = []) {
  for (const g of groups)
    for (const [file, expected] of Object.entries(g.pins)) {
      const target = path.join(f.root, file)
      expect(fs.lstatSync(target).isFile()).toBe(true)
      expect(fs.realpathSync(target)).toBe(target)
      if (!repin.includes(file))
        expect(digest(fs.readFileSync(target))).toBe(expected)
    }
}

function expectInactive(a, status = 'INCOMPLETE') {
  expect(a.exceptionsApplied).toBe(false)
  expect(a.exceptions).toEqual([])
  expect(appliedCounts(a)).toEqual([0, 0, 0])
  expect(a.status).toBe(status)
  expect(a.passed).toBe(false)
}
// Twelve source occurrences were already unknown outside the thirteen proposed
// mirror sites. Keep them too; matching the historical table never removes them.
const additionalRaw = [
  {
    file: 'packages/platform/src/tool-invocation-boundary.ts:201',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: '5b2efa8c4f1c77a4'
  },
  {
    file: 'packages/platform/src/tool-invocation-boundary.ts:202',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'b34563e2ebeb7717'
  },
  {
    file: 'packages/platform/src/tool-invocation-boundary.ts:202',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'b34563e2ebeb7717'
  },
  {
    file: 'packages/sandbox/src/capabilities.ts:51',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: '6ee64919b5e7503c'
  },
  {
    file: 'packages/sandbox/src/run.ts:114',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'fdc5cd232a6b322b'
  },
  {
    file: 'packages/sandbox/src/run.ts:120',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: '5c689333c261579d'
  },
  {
    file: 'packages/sandbox/src/run.ts:142',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'c48d06f5a4f383e0'
  },
  {
    file: 'packages/sandbox/src/run.ts:143',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'a24febbe3ca5b688'
  },
  {
    file: 'packages/sandbox/src/run.ts:157',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: '49c05c6142480228'
  },
  {
    file: 'packages/sandbox/src/run.ts:163',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: '520278083d1a776a'
  },
  {
    file: 'packages/sandbox/src/run.ts:179',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'e1751db744e7920e'
  },
  {
    file: 'packages/sandbox/src/run.ts:181',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    expression: 'dc7602b66365a6bb'
  }
]
function expectRawInventory(a, omitted = []) {
  const identity = ({ file, reason, expression }) =>
    JSON.stringify({ file, reason, expression })
  expect(rawSites(a).map(identity).sort()).toEqual(
    groups
      .flatMap((g) => g.rows)
      .filter((row) => !omitted.includes(sourceFile(row)))
      .map(identity)
      .sort()
  )
  for (const row of additionalRaw.filter(
    (row) => !omitted.includes(sourceFile(row))
  ))
    expect(
      a.diagnostics.filter((d) => identity(d) === identity(row))
    ).toHaveLength(
      additionalRaw.filter((d) => identity(d) === identity(row)).length
    )
}
function expectInvalidation(a, file, root) {
  expectInactive(a)
  for (const g of groups) {
    const dependent = Object.hasOwn(g.pins, file)
    const unused = a.unusedExceptions.filter((d) => d.exception === g.id)
    const presentSites = g.rows.filter((row) =>
      fs.existsSync(path.join(root, sourceFile(row)))
    )
    expect(unused).toHaveLength(presentSites.length)
    expect(unused.every((d) => d.pinsHold === !dependent)).toBe(true)
  }
  const omitted = [...siteFiles, ...additionalRaw.map(sourceFile)].filter(
    (site) =>
      !fs.existsSync(path.join(root, site)) ||
      fs.lstatSync(path.join(root, site)).isSymbolicLink()
  )
  expectRawInventory(a, omitted)
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

// Legacy test names are retained as stable case IDs; the oracle is SPEC0228.
describe('SPEC0216 compiled kernel boundary qualification', () => {
  it('keeps the exact three proposed tables and the previous SPEC0215 46 sites unchanged', () => {
    const actual = qualificationTable()
    const previous = JSON.parse(
      fs.readFileSync(
        'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json',
        'utf8'
      )
    )
    const contract = ({ id, reason, pins, sites }) => ({
      id,
      reason,
      pins,
      sites
    })
    expect(actual.filter((group) => ids.has(group.id))).toEqual(
      groups.map((group) => ({
        ...contract(group),
        justification: group.justification
      }))
    )
    expect(previous.diagnosticCount).toBe(46)
    for (const group of previous.groups) {
      const matches = actual.filter((entry) => entry.id === group.id)
      expect(matches).toHaveLength(1)
      expect(contract(matches[0])).toEqual(contract(group))
    }
  })

  it('binds the approved proposal and exactly 13 occurrences across 12 physical pins', () => {
    expect(digest(proposalBytes)).toBe(
      '2d69ca8b7824a39a35ee43712ca31b4cc699f2781ce6d097cde5205a388385e6'
    )
    expect(groups.map(count)).toEqual([4, 1, 8])
    expect(pins).toHaveLength(12)
    const f = fixture()
    expectPinsValid(f)
    const a = f.audit()
    expectInactive(a)
    expect(accepted(a)).toEqual([])
    expectRawInventory(a)
    expect(rawSites(a)).toHaveLength(13)
    expect(a.diagnostics).toHaveLength(25)
    expect(a.violations).toEqual([])
    expect(a).toEqual(f.audit({ exceptions: false }))
    const requested = f.audit({ exceptions: true })
    expectInactive(requested)
    expect(requested).toEqual({
      ...a,
      diagnostics: [
        { file: 'package.json', reason: 'UNAPPROVED_EXCEPTION_REQUEST' },
        ...a.diagnostics
      ]
    })
    const identity = ({ file, reason, expression }) => ({
      file,
      reason,
      expression
    })
    expect(
      rawSites(a)
        .map(identity)
        .sort((a, b) => a.file.localeCompare(b.file))
    ).toEqual(
      groups
        .flatMap((g) => g.rows)
        .map(identity)
        .sort((a, b) => a.file.localeCompare(b.file))
    )
  })

  it('retains all exact 13 raw diagnostics in strict mode', () => {
    const f = fixture(),
      a = f.audit({ exceptions: false })
    expectInactive(a)
    expectRawInventory(a)
    expect(a).toEqual(f.audit())
    expect(a.exceptionsApplied).toBe(false)
    expect(a.exceptions).toEqual([])
    expect(rawSites(a)).toHaveLength(13)
    expect(a.passed).toBe(false)
  })

  for (const mode of ['byte', 'missing', 'symlink'])
    it.each(pins)(
      `invalidates ${mode} pin %s or explicitly refuses discovery`,
      (file) => {
        const f = fixture(),
          target = path.join(f.root, file)
        if (mode === 'byte')
          f.write(
            file,
            fs.readFileSync(target, 'utf8') + '\n// unreviewed byte\n'
          )
        else {
          const bytes = fs.readFileSync(target)
          fs.unlinkSync(target)
          if (mode === 'symlink') {
            const copy = 'pin-copy.txt'
            f.write(copy, bytes)
            fs.symlinkSync(path.join(f.root, copy), target)
          }
        }
        let a
        try {
          a = f.audit()
        } catch (error) {
          if (mode === 'byte') throw error
          // A refusal has no report/counts. Accept only a named closed refusal,
          // never a generic TypeError, test assertion, or arbitrary exception.
          expect(error).toBeInstanceOf(Error)
          if (mode === 'symlink' && file.includes('/dist/'))
            expect(error.message).toBe(
              `invalid_boundary_manifest:${target}:physical_file_required`
            )
          else {
            expect(mode).toBe('symlink')
            expect(error.message).toBe(`unverified_source_symlink:${target}`)
          }
          return
        }
        expectInvalidation(a, file, f.root)
        expect(a).toEqual(f.audit({ exceptions: false }))
      }
    )

  it('refuses an ancestor source symlink', () => {
    const f = fixture()
    const directory = path.join(f.root, 'packages/platform/src')
    const copy = path.join(f.root, 'platform-source')
    fs.renameSync(directory, copy)
    fs.symlinkSync(copy, directory, 'dir')
    expect(() => f.audit()).toThrow(/^unverified_source_symlink:/)
  })

  for (const constraint of ['reason', 'path', 'line', 'expression'])
    it.each(groups)(
      `matches ${constraint} independently with all pins valid: $id`,
      (group) => {
        const f = fixture(),
          row = group.rows[0]
        expectPinsValid(f)
        if (constraint === 'path')
          f.write(sourceFile(row) + '.unlisted.ts', 'export {}\n')
        const audit = copiedAuditor(f, {
          changeGroup: {
            group,
            mutate: (text) => {
              if (constraint === 'reason')
                return text.replace(
                  group.reason,
                  'UNVERIFIED_MODULE_LOADER_ESCAPE'
                )
              if (constraint === 'path') {
                // sites only: leave the physical pins and their hashes intact.
                const at = text.indexOf('sites:')
                const file = sourceFile(row)
                return (
                  text.slice(0, at) +
                  text.slice(at).replace(file, file + '.unlisted.ts')
                )
              }
              if (constraint === 'line')
                return text.replace(row.line, row.line + ' // unreviewed')
              return text.replace(row.expression, 'aaaaaaaaaaaaaaaa')
            }
          }
        })
        const a = audit()
        const remaining = a.unusedExceptions.filter(
          (d) => d.exception === group.id
        )
        expect(remaining).toHaveLength(group.rows.length)
        expect(remaining.every((d) => d.pinsHold)).toBe(true)
        expectInactive(a)
        expectRawInventory(a)
        expect(a).toEqual(audit({ exceptions: false }))
        expect(a.diagnostics).toEqual(f.audit().diagnostics)
        const rejected = a.diagnostics.filter(
          (d) =>
            d.reason === row.reason &&
            d.file === row.file &&
            d.expression === row.expression
        )
        expect(rejected).toHaveLength(1)
        expect(a.passed).toBe(false)
        for (const other of groups.filter((g) => g.id !== group.id))
          expect(
            a.exceptions.filter((d) => d.exception === other.id)
          ).toHaveLength(0)
      }
    )

  it.each([
    [
      'spawn options tail',
      "stdio: ['pipe', 'pipe', 'pipe']",
      "stdio: ['ignore', 'pipe', 'pipe']",
      'fdc5cd232a6b322b'
    ],
    [
      'error callback tail',
      "finish('spawn_failed');\n        });",
      "finish('timeout');\n        });",
      '89ea22717a6b2867'
    ],
    [
      'close callback tail',
      "finish(code ?? 'spawn_failed');",
      "finish(code ?? 'timeout');",
      'd59b602a312f5180'
    ]
  ])(
    'rejects a changed multiline %s with private fresh pins',
    (_label, before, after, oldExpression) => {
      const f = fixture(),
        file = 'packages/sandbox/dist/run.js'
      const original = fs.readFileSync(file, 'utf8')
      const changed = original.replace(before, after)
      expect(changed).not.toBe(original)
      const row = groups[2].rows.find((r) => r.expression === oldExpression)
      expect(
        changed.split('\n')[Number(row.file.split(':').at(-1)) - 1].trim()
      ).toBe(row.line)
      f.write(file, changed)
      expectPinsValid(f, [file])
      const a = copiedAuditor(f, { repin: [file] })()
      expectInactive(a)
      expect(a).toEqual(
        copiedAuditor(f, { repin: [file] })({ exceptions: false })
      )
      expect(a.diagnostics).toEqual(f.audit().diagnostics)
      const residual = rawSites(a)
      expect(residual).toHaveLength(13)
      const changedSite = residual.filter((d) => d.file === row.file)
      expect(changedSite).toHaveLength(1)
      expect(changedSite[0].expression).not.toBe(oldExpression)
      expect(
        residual
          .filter((d) => d.file !== row.file)
          .map((d) => [d.file, d.reason, d.expression])
          .sort()
      ).toEqual(
        groups
          .flatMap((g) => g.rows)
          .filter((r) => r.file !== row.file)
          .map((r) => [r.file, r.reason, r.expression])
          .sort()
      )
      const unused = a.unusedExceptions.filter((d) => ids.has(d.exception))
      expect(unused).toHaveLength(13)
      expect(unused.every((d) => d.pinsHold)).toBe(true)
      expect(a.passed).toBe(false)
    }
  )

  it('limits duplicate occurrences independently while every private pin holds', () => {
    const f = fixture(),
      file = 'packages/sandbox/dist/run.js'
    const row = groups[2].rows.find((r) => r.line === "child.kill('SIGKILL');")
    f.write(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace(row.line, row.line + '\n            ' + row.line)
    )
    expectPinsValid(f, [file])
    const a = copiedAuditor(f, { repin: [file] })()
    expectInactive(a)
    const residual = rawSites(a)
    expect(residual).toHaveLength(14)
    expect(
      residual.filter((d) => d.expression === row.expression)
    ).toHaveLength(2)
    const identity = (d) => `${sourceFile(d)}:${d.reason}:${d.expression}`
    expect(residual.map(identity).sort()).toEqual(
      [...groups.flatMap((g) => g.rows), row].map(identity).sort()
    )
    expect(a).toEqual(
      copiedAuditor(f, { repin: [file] })({ exceptions: false })
    )
    expect(a.diagnostics).toEqual(f.audit().diagnostics)
    expect(
      accepted(a).filter((d) => d.expression === row.expression)
    ).toHaveLength(0)
    expect(a.passed).toBe(false)
  })

  it('does not qualify an exact reviewed expression at an unlisted file', () => {
    const f = fixture(),
      file = 'packages/sandbox/src/unlisted.ts'
    f.write(file, fs.readFileSync('packages/sandbox/dist/run.js'))
    const a = f.audit()
    expectInactive(a)
    expectRawInventory(a)
    expect(a).toEqual(f.audit({ exceptions: false }))
    expect(a.exceptions.some((d) => sourceFile(d) === file)).toBe(false)
    expect(
      a.diagnostics.filter(
        (d) => sourceFile(d) === file && d.reason === groups[2].reason
      )
    ).toHaveLength(8)
    expect(a.passed).toBe(false)
  })

  it.each([
    [
      'literal product',
      "import '../../../products/shift/src/index.ts'\n",
      'product'
    ],
    [
      'dynamic product',
      "void import('../../../products/shift/src/index.ts')\n",
      'product'
    ],
    [
      'createRequire product',
      "import {createRequire} from 'node:module'; const load=createRequire(import.meta.url); load('../../../products/shift/src/index.ts')\n",
      'product'
    ],
    [
      'SHIFT marker',
      'export const secret = process.env.SHIFT_SECRET\n',
      'shift'
    ],
    ['unresolved import', "import '@unknown/unresolved'\n", 'unresolved'],
    [
      'unknown installed dependency',
      "import 'unreviewed-installed'\n",
      'installed'
    ]
  ])(
    'still blocks %s with all 13 valid qualifications',
    (_label, source, kind) => {
      const f = fixture()
      f.write('packages/support/src/hostile.ts', source)
      if (kind === 'installed') {
        f.write(
          'node_modules/unreviewed-installed/package.json',
          JSON.stringify({
            name: 'unreviewed-installed',
            version: '1.0.0',
            main: 'index.js'
          })
        )
        f.write(
          'node_modules/unreviewed-installed/index.js',
          'export const synthetic = true\n'
        )
      }
      expectPinsValid(f)
      const a = f.audit()
      expectInactive(
        a,
        ['product', 'shift'].includes(kind) ? 'FAIL' : 'INCOMPLETE'
      )
      expectRawInventory(a)
      expect(a).toEqual(f.audit({ exceptions: false }))
      expect(a.passed).toBe(false)
      if (kind === 'product')
        expect(
          a.violations.some((d) => JSON.stringify(d).includes('products/shift'))
        ).toBe(true)
      if (kind === 'shift')
        expect(
          a.diagnostics.some((d) => d.reason === 'CONSUMER_ENV_IN_CORE')
        ).toBe(true)
      if (kind === 'unresolved')
        expect(
          a.diagnostics.some((d) =>
            JSON.stringify(d).includes('@unknown/unresolved')
          )
        ).toBe(true)
      if (kind === 'installed')
        expect(
          a.diagnostics.some(
            (d) =>
              JSON.stringify(d).includes('unreviewed-installed') &&
              JSON.stringify(d).includes('NOT_IN_LOCKFILE')
          )
        ).toBe(true)
    }
  )
})
