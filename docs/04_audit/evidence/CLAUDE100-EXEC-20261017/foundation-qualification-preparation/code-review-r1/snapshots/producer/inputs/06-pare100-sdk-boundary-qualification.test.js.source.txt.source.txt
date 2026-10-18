import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { auditProductBoundary } from '../scripts/check-product-boundary.mjs'

const proposal = JSON.parse(
  fs.readFileSync(
    'docs/04_audit/evidence/PARE100-EXEC-20261014/spec0215/revision-r4/proposed-exceptions.json',
    'utf8'
  )
)
const groups = proposal.groups
const ids = new Set(groups.map((g) => g.id))
const pins = [...new Set(groups.flatMap((g) => Object.keys(g.pins)))]
const roots = []
const count = (g) =>
  Object.values(g.sites)
    .flatMap(Object.values)
    .flatMap(Object.values)
    .reduce((a, b) => a + b, 0)
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-b215-'))
  roots.push(root)
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), data)
  }
  write(
    'package.json',
    JSON.stringify({ workspaces: ['packages/*', 'products/*'] })
  )
  write(
    'tsconfig.base.json',
    JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@cvg/sdk': ['packages/sdk/src/index.ts'],
          '@cvg/harness': ['packages/harness/src/index.ts'],
          '@cvg/harness-contracts': ['packages/contracts/src/index.ts']
        }
      }
    })
  )
  for (const [dir, name] of [
    ['sdk', '@cvg/sdk'],
    ['harness', '@cvg/harness'],
    ['contracts', '@cvg/harness-contracts']
  ])
    write(
      `packages/${dir}/package.json`,
      JSON.stringify({ name, main: 'src/index.ts' })
    )
  for (const file of pins) write(file, fs.readFileSync(file))
  write('packages/contracts/src/index.ts', 'export type Synthetic = string\n')
  write(
    'products/shift/package.json',
    JSON.stringify({ name: '@private/product', main: 'src/index.ts' })
  )
  write('products/shift/src/index.ts', 'export const productOnly=1\n')
  write(
    'packages/sdk/src/compiled-mirrors.ts',
    "import '../../contracts/dist/canonical-json.js'\nimport '../../harness/dist/session/events.js'\n"
  )
  return {
    root,
    write,
    audit: (options) => auditProductBoundary(root, options)
  }
}
// Private copied-checker fault injection only: keep byte pins valid while
// varying one independent matcher constraint. Production pins/table never change.
async function copiedAuditor(f, changedFiles = [], wrongReason = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-b215-checker-'))
  roots.push(directory)
  let source = fs.readFileSync('scripts/check-product-boundary.mjs', 'utf8')
  for (const file of changedFiles) {
    const old = groups.find((g) => Object.hasOwn(g.pins, file)).pins[file]
    const fresh = createHash('sha256')
      .update(fs.readFileSync(path.join(f.root, file)))
      .digest('hex')
    expect(source).toContain(old)
    source = source.replaceAll(old, fresh)
  }
  if (wrongReason) {
    const start = source.indexOf("id: 'pare100-sdk-owned-example-child'")
    const at = source.indexOf(
      "reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'",
      start
    )
    expect(start).toBeGreaterThan(0)
    expect(at - start).toBeLessThan(100)
    source =
      source.slice(0, at) +
      source
        .slice(at)
        .replace(
          "reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'",
          "reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE'"
        )
  }
  for (const name of [
    'boundary-manifests.mjs',
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
  return (root) => {
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        'const {auditProductBoundary}=await import(process.argv[1]);process.stdout.write(JSON.stringify(auditProductBoundary(process.argv[2])))',
        pathToFileURL(file).href,
        root
      ],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 }
    )
    expect(run.status, run.stderr).toBe(0)
    return JSON.parse(run.stdout)
  }
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
const accepted = (audit) => audit.exceptions.filter((d) => ids.has(d.exception))

describe('SPEC0215 exact capability qualification', () => {
  it('qualifies exactly the four reviewed groups and 46 diagnostic occurrences', () => {
    const f = fixture(),
      a = f.audit()
    expect(groups.map(count)).toEqual([19, 14, 3, 10])
    expect(accepted(a)).toHaveLength(46)
    for (const g of groups)
      expect(a.exceptions.filter((d) => d.exception === g.id)).toHaveLength(
        count(g)
      )
    const files = new Set(groups.flatMap((g) => Object.keys(g.sites)))
    expect(
      a.diagnostics.filter(
        (d) =>
          files.has(d.file.replace(/:\d+$/, '')) &&
          d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
      )
    ).toEqual([])
  })
  it.each(pins)(
    'invalidates every dependent group on byte drift of %s',
    (file) => {
      const f = fixture()
      f.write(
        file,
        fs.readFileSync(file, 'utf8') + '\n// SPEC0215 unreviewed byte\n'
      )
      const a = f.audit()
      for (const g of groups) {
        const applied = a.exceptions.filter((d) => d.exception === g.id)
        expect(applied).toHaveLength(Object.hasOwn(g.pins, file) ? 0 : count(g))
        if (Object.hasOwn(g.pins, file))
          expect(
            a.unusedExceptions.some(
              (d) => d.exception === g.id && d.pinsHold === false
            )
          ).toBe(true)
      }
    }
  )
  it('keeps all 46 raw diagnostics in strict mode', () => {
    const f = fixture(),
      a = f.audit({ exceptions: false })
    expect(a.exceptions).toEqual([])
    const files = new Set(groups.flatMap((g) => Object.keys(g.sites)))
    expect(
      a.diagnostics.filter(
        (d) =>
          files.has(d.file.replace(/:\d+$/, '')) &&
          d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
      )
    ).toHaveLength(46)
  })
  it('rejects a symlinked child pin even with byte-identical contents', () => {
    const f = fixture(),
      file = 'examples/consumers/sdk-stdio/child.mts'
    f.write('owned-child-copy.mts', fs.readFileSync(file))
    fs.unlinkSync(path.join(f.root, file))
    fs.symlinkSync(
      path.join(f.root, 'owned-child-copy.mts'),
      path.join(f.root, file)
    )
    expect(() => f.audit()).toThrow(/physical_file_required|symlink|identity/)
  })
  it.each([
    'examples/another/index.mts',
    'packages/sdk/src/unreviewed.ts',
    'scripts/unreviewed.mjs'
  ])('does not extend a reviewed expression to %s', (file) => {
    const f = fixture()
    f.write(
      file,
      "import {spawn} from 'node:child_process'\nconst child = spawn(process.execPath, ['-e','void 0'])\nchild.on('error', () => {})\n"
    )
    f.write(
      'packages/sdk/src/unreviewed-entry.ts',
      `import ${JSON.stringify(path.posix.relative('packages/sdk/src', file).replace(/^(?!\.)/, './'))}\n`
    )
    const a = f.audit()
    expect(
      a.diagnostics.some(
        (d) =>
          d.file.startsWith(file + ':') &&
          d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
      )
    ).toBe(true)
    expect(a.exceptions.some((d) => d.file.startsWith(file + ':'))).toBe(false)
  })
  it.each([
    ['product', "import '../../../products/shift/src/index.ts'\n"],
    ['shift', 'export const hostile=process.env.SHIFT_SECRET\n'],
    ['unresolved', "import '@unknown/unreviewed-module'\n"]
  ])(
    'still rejects %s while the reviewed pins and 46 exemptions remain valid',
    (kind, source) => {
      const f = fixture()
      f.write('packages/sdk/src/unreviewed-bridge.ts', source)
      const a = f.audit()
      expect(accepted(a)).toHaveLength(46)
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
            JSON.stringify(d).includes('@unknown/unreviewed-module')
          )
        ).toBe(true)
      expect(a.passed).toBe(false)
    }
  )
  it.each([
    [
      'expression tail',
      (source) => source.replace('HOME: home,', "HOME: 'unreviewed',"),
      'expression'
    ],
    [
      'normalized line',
      (source) =>
        source.replace(
          "child.on('error', () => {})",
          "child.on('error', () => {}) // unreviewed"
        ),
      'line'
    ],
    [
      'duplicate occurrence',
      (source) =>
        source.replace(
          "child.on('error', () => {})",
          "child.on('error', () => {})\n    child.on('error', () => {})"
        ),
      'count'
    ]
  ])(
    'independently rejects %s with valid fixture-only pins',
    async (_label, mutate, kind) => {
      const f = fixture(),
        file = 'examples/consumers/sdk-stdio/index.mts'
      const original = fs.readFileSync(file, 'utf8'),
        modified = mutate(original)
      expect(modified).not.toBe(original)
      f.write(file, modified)
      const audit = await copiedAuditor(f, [file])
      const a = audit(f.root)
      const unused = a.unusedExceptions.filter(
        (d) => d.exception === 'pare100-sdk-owned-example-child'
      )
      expect(unused.every((d) => d.pinsHold === true)).toBe(true)
      const residual = a.diagnostics.filter(
        (d) =>
          d.file.startsWith(file + ':') &&
          d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
      )
      expect(residual).toHaveLength(1)
      expect(
        a.exceptions.filter(
          (d) => d.exception === 'pare100-sdk-owned-example-child'
        )
      ).toHaveLength(kind === 'count' ? 14 : 13)
      expect(
        a.exceptions.filter(
          (d) => d.exception === 'pare100-sdk-owned-test-child'
        )
      ).toHaveLength(19)
    }
  )
  it('does not match another reason even when every byte pin holds', async () => {
    const f = fixture(),
      audit = await copiedAuditor(f, [], true),
      a = audit(f.root)
    expect(
      a.exceptions.filter(
        (d) => d.exception === 'pare100-sdk-owned-example-child'
      )
    ).toEqual([])
    expect(
      a.unusedExceptions
        .filter((d) => d.exception === 'pare100-sdk-owned-example-child')
        .every((d) => d.pinsHold)
    ).toBe(true)
    expect(
      a.diagnostics.filter(
        (d) =>
          d.file.startsWith('examples/consumers/sdk-stdio/index.mts:') &&
          d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
      )
    ).toHaveLength(14)
  })
})
