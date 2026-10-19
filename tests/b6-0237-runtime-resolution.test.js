import { beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson,
  collectPackageInventory,
  fingerprintResolution,
  fingerprintToolchain,
  INSTALLED_IDENTITY_LIMITS,
  pinnedToolchainLocation
} from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const NODE = pinnedToolchainLocation().node
const ENGINE = path.resolve('scripts/boundary-semantic-engine.mjs')
const CHECKER = path.resolve('scripts/check-product-boundary.mjs')
// Frozen D8 checker (commit d8e3f8f2d346d4f8d3ddd162384ebbb79a322137, formerly
// read from the hiso005-resolver-fix candidate) vendored byte-for-byte with
// the five sibling modules its non-semantic path imports. The comparison is
// refused unless the directory holds exactly these bytes.
const D8_DIR = path.resolve('tests/fixtures/b6-0237-d8-checker')
const D8_SHA256 = {
  'boundary-code-execution.mjs':
    '4c750071ac1347ffa68e6c62e3082e5507cc94571e83089eb7bd21eb7435540a',
  'boundary-installed-identity.mjs':
    '3d282e4f9a54ecd5668fdfb4d9d0e80c9f699b65b4495bfeaf368233b040d5cf',
  'boundary-lexical.mjs':
    '6aed88995d5509aa7b2bd8814f66363f42e287bc5081d75b4c27dbf9ac9e71e9',
  'boundary-manifests.mjs':
    '40cd1375d45e3059e797e0fc41795b71a07dbc529e257ef77572958dc40880e5',
  'check-product-boundary.mjs':
    '4225e532828a59f81c08217193514acc66e938fabd0dad45d32dacc48481b44e',
  'tsconfig-path-grammar.mjs':
    '62f5791962360d1836c281b68758094abdd970412d7a5f2ad49e538352201f8f'
}
const BASELINE = path.join(D8_DIR, 'check-product-boundary.mjs')
const PARENT = ownedRunParent('b6-0237-lead')
const hash = (x) => createHash('sha256').update(x).digest('hex')
const env = {
  PATH: path.dirname(NODE) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: PARENT
}
const write = (root, file, body) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, body)
  return target
}
function fixture(files = {}, start = 'entry.mjs') {
  const root = fs.mkdtempSync(path.join(PARENT, 'physical unicode-ç '))
  for (const [file, body] of Object.entries({
    'package.json': JSON.stringify({
      name: 'synthetic-root',
      type: 'module',
      workspaces: ['apps/*', 'packages/*', 'legacy/packages/*', 'products/*']
    }),
    'entry.mjs': 'export const answer=42;',
    ...files
  }))
    write(root, file, body)
  return {
    root,
    starts: [start],
    installed: [],
    origins: [],
    compiled: { status: 'UNAVAILABLE', files: [] }
  }
}
function call(input, method = 'runSemanticBoundary', extra) {
  const code =
    'const fs=require("node:fs"); const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
  const result = spawnSync(NODE, ['-e', code, ENGINE], {
    input: JSON.stringify({ method, args: extra ? [input, extra] : [input] }),
    env,
    encoding: 'utf8',
    timeout: 150000,
    maxBuffer: 64 * 1024 ** 2
  })
  if (result.error || result.status !== 0)
    throw Error(result.error?.message || result.stderr)
  return JSON.parse(result.stdout)
}
function oracle(input, specifier, mode = 'import') {
  const code =
    mode === 'import'
      ? 'process.stdout.write(import.meta.resolve(process.argv[1]))'
      : 'const {createRequire}=require("node:module");const {pathToFileURL}=require("node:url");const path=require("node:path");process.stdout.write(createRequire(pathToFileURL(path.resolve("operator-oracle.cjs"))).resolve(process.argv[1]))'
  const result = spawnSync(
    NODE,
    [
      ...(mode === 'import' ? ['--input-type=module'] : []),
      '--eval',
      code,
      specifier
    ],
    {
      cwd: path.dirname(path.join(input.root, input.starts[0])),
      env,
      encoding: 'utf8',
      timeout: 10000
    }
  )
  return { code: result.status, value: result.stdout, stderr: result.stderr }
}
function workspace({
  name = 'arbitrary-name',
  mode = 'import',
  exports = { node: './chosen.mjs', default: './other.mjs' },
  absolute = false
} = {}) {
  const ext = mode === 'require' ? 'cjs' : 'mjs'
  const input = fixture(
    {
      [`entry.${ext}`]:
        mode === 'import'
          ? `import {answer} from ${JSON.stringify(name)}; export const result=answer;`
          : `const p=require(${JSON.stringify(name)}); module.exports=p;`,
      'packages/demo/package.json': JSON.stringify({
        name,
        type: mode === 'import' ? 'module' : 'commonjs',
        exports
      }),
      [`packages/demo/chosen.${ext}`]:
        mode === 'import' ? 'export const answer=42;' : 'module.exports=42;',
      [`packages/demo/other.${ext}`]:
        mode === 'import' ? 'export const answer=0;' : 'module.exports=0;'
    },
    `entry.${ext}`
  )
  const link = path.join(input.root, 'node_modules', name)
  fs.mkdirSync(path.dirname(link), { recursive: true })
  fs.symlinkSync(
    absolute
      ? path.join(input.root, 'packages/demo')
      : (name.startsWith('@') ? '../../' : '../') + 'packages/demo',
    link
  )
  return { input, link, name, mode, ext }
}
// SPEC0241 D2 (registered migration): a synthetic MATCH premise also carries
// the 0234 reference inventory of the physical package, read when the input
// is serialized, exactly what the checker supplies for a MATCH package.
function matchRecord(root, key, referenceDigest = 'a'.repeat(64)) {
  const read = () => collectPackageInventory(path.join(root, key))
  return {
    key,
    manifest: key + '/package.json',
    identityStatus: 'MATCH',
    referenceDigest,
    get inventorySha256() {
      return read().inventorySha256
    },
    get inventory() {
      const inventory = read()
      return {
        entries: inventory.entries,
        nestedPackages: inventory.nestedPackages,
        usage: inventory.usage
      }
    }
  }
}
function proven(input) {
  const out = call(input)
  expect(out.status, JSON.stringify(out.unknowns)).toBe('PROVEN')
  expect(out.validation.valid).toBe(true)
  expect(out.proofs.length).toBeGreaterThan(0)
  expect(out.kernelVersion).toBe('semantic-kernel-v4-integral-body')
  return out
}
function refused(input) {
  const out = call(input)
  expect(out.status).toBe('UNKNOWN')
  expect(out.proofs).toEqual([])
  return out
}

describe('BUILD0237: physical workspace and finite runtime resolution', () => {
  it.each([
    ['arbitrary-name', false],
    ['arbitrary-name', true],
    ['@arbitrary/name', false],
    ['@arbitrary/name', true]
  ])(
    'workspace positives %s absolute=%s match the pinned oracle',
    (name, absolute) => {
      const { input } = workspace({ name, absolute })
      const expected = path.join(input.root, 'packages/demo/chosen.mjs')
      expect(oracle(input, name)).toMatchObject({
        code: 0,
        value: pathToFileURL(expected).href
      })
      const out = proven(input)
      expect(out.inputs.map((x) => x.file)).toContain(
        'packages/demo/chosen.mjs'
      )
      expect(out.proofs.some((x) => x.file === 'packages/demo/other.mjs')).toBe(
        false
      )
    }
  )
  it.each([
    [{ default: './other.mjs', node: './chosen.mjs' }, 'other.mjs'],
    [{ node: './chosen.mjs', default: './other.mjs' }, 'chosen.mjs'],
    [{ import: './chosen.mjs', require: './other.mjs' }, 'chosen.mjs'],
    [{ 'module-sync': './chosen.mjs', default: './other.mjs' }, 'chosen.mjs'],
    [{ 'node-addons': './chosen.mjs', default: './other.mjs' }, 'chosen.mjs'],
    [
      {
        node: { unsupportedCondition: './other.mjs' },
        default: './chosen.mjs'
      },
      'chosen.mjs'
    ]
  ])('condition order %j binds the oracle target %s', (exports, leaf) => {
    const { input, name } = workspace({ exports })
    expect(oracle(input, name)).toMatchObject({
      code: 0,
      value: pathToFileURL(path.join(input.root, 'packages/demo', leaf)).href
    })
    const out = proven(input)
    expect(out.proofs.some((x) => x.file === 'packages/demo/' + leaf)).toBe(
      true
    )
  })
  it('requires exact CJS conditional targets and preserves mode', () => {
    const { input, name } = workspace({
      mode: 'require',
      exports: { require: './chosen.cjs', default: './other.cjs' }
    })
    expect(oracle(input, name, 'require')).toMatchObject({
      code: 0,
      value: path.join(input.root, 'packages/demo/chosen.cjs')
    })
    proven(input)
  })
  it('a selected CJS body exporting mutable state remains outside K0–K7', () => {
    const { input } = workspace({
      mode: 'require',
      exports: { require: './chosen.cjs' }
    })
    write(input.root, 'packages/demo/chosen.cjs', 'module.exports={answer:42};')
    const out = refused(input)
    expect(
      out.unknowns.some((x) => x.reason === 'UNKNOWN_EXPORTED_MUTABLE_STATE')
    ).toBe(true)
  })
  it('supports exact nested subpaths and gives no authority to branch URL equality', () => {
    const { input, name } = workspace({
      exports: { './feature/nested': { node: './chosen.mjs' } }
    })
    write(
      input.root,
      'entry.mjs',
      `import {answer} from "${name}/feature/nested"; export const result=answer;`
    )
    expect(oracle(input, name + '/feature/nested').code).toBe(0)
    proven(input)
  })
  it.each([
    '../missing/../packages/demo',
    '../plain-file/../packages/demo',
    '../alias/../packages/demo',
    '../packages/../packages/demo',
    '../packages//demo'
  ])('refuses noncanonical raw link text %s before normalization', (target) => {
    const { input, link } = workspace()
    write(input.root, 'plain-file', 'ordinary bytes')
    fs.symlinkSync('packages', path.join(input.root, 'alias'))
    fs.unlinkSync(link)
    fs.symlinkSync(target, link)
    refused(input)
  })
  it.each(
    ['module', 'fs', 'fs/promises', 'node:fs', 'node:test'].flatMap(
      (specifier) => ['import', 'require'].map((mode) => [specifier, mode])
    )
  )(
    'native %s in %s wins over homonymous workspace metadata',
    (specifier, mode) => {
      const start = mode === 'import' ? 'entry.mjs' : 'entry.cjs'
      const input = fixture(
        {
          [start]:
            mode === 'import'
              ? `import value from ${JSON.stringify(specifier)}; export const answer=value;`
              : `const value=require(${JSON.stringify(specifier)}); module.exports={answer:value};`,
          'package.json': JSON.stringify({
            name: specifier,
            type: mode === 'import' ? 'module' : 'commonjs',
            exports: './' + start
          })
        },
        start
      )
      const out = refused(input)
      expect(
        out.unknowns.some((x) => x.reason === 'UNKNOWN_NATIVE_BUILTIN')
      ).toBe(true)
      expect(out.inputs.some((x) => x.file.includes('node_modules'))).toBe(
        false
      )
    }
  )
  it('ordinary test is a paired package positive, never confused with node:test', () => {
    const { input } = workspace({ name: 'test' })
    proven(input)
  })
  it.each(['direct-link', 'intermediate-link', 'conditional-target'])(
    'known product via %s remains FAIL even with reduced new caps',
    (kind) => {
      for (const reduced of [false, true]) {
        const { input, link } = workspace()
        write(
          input.root,
          'products/shift/package.json',
          '{"name":"private-product","type":"module"}'
        )
        write(input.root, 'products/shift/index.mjs', 'export const answer=42;')
        if (kind === 'conditional-target') {
          write(
            input.root,
            'packages/demo/package.json',
            JSON.stringify({
              name: 'arbitrary-name',
              type: 'module',
              exports: { node: '../../products/shift/index.mjs' }
            })
          )
        } else {
          fs.unlinkSync(link)
          if (kind === 'intermediate-link') {
            fs.symlinkSync(
              'products/shift',
              path.join(input.root, 'intermediate')
            )
            fs.symlinkSync('../intermediate', link)
          } else fs.symlinkSync('../products/shift', link)
        }
        if (reduced) input.resolutionLimits = { maxWorkspaces: 0 }
        const out = call(input)
        expect(out.status, JSON.stringify(out.unknowns)).toBe('VIOLATION')
        expect(out.proofs).toEqual([])
        expect(
          out.violations.some((x) => x.reason === 'PRODUCT_DEPENDENCY')
        ).toBe(true)
      }
    }
  )
  it('a regular installed conditional owner still needs MATCH and a closed actual body', () => {
    const input = fixture({
      'entry.mjs':
        'import {answer} from "installed-demo";export const result=answer;',
      'node_modules/installed-demo/package.json':
        '{"name":"installed-demo","type":"module","exports":{"node":"./chosen.mjs","default":"./other.mjs"}}',
      'node_modules/installed-demo/chosen.mjs': 'export const answer=42;',
      'node_modules/installed-demo/other.mjs': 'export const answer=0;'
    })
    input.installed = [matchRecord(input.root, 'node_modules/installed-demo')]
    const out = proven(input)
    expect(out.installed[0].status).toBe('PROVEN')
    input.installed[0].identityStatus = 'MISMATCH'
    refused(input)
    input.installed[0].identityStatus = 'MATCH'
    write(
      input.root,
      'node_modules/installed-demo/chosen.mjs',
      'export const answer=unknownCallback();'
    )
    refused(input)
  })
  it('a nameless or mismatched installed owner remains UNKNOWN with a named paired positive', () => {
    const input = fixture({
      'entry.mjs': 'import {answer} from "closed";export const value=answer;',
      'node_modules/closed/package.json':
        '{"type":"module","exports":"./index.mjs"}',
      'node_modules/closed/index.mjs': 'export const answer=42;'
    })
    input.installed = [matchRecord(input.root, 'node_modules/closed')]
    refused(input)
    write(
      input.root,
      'node_modules/closed/package.json',
      '{"name":"different","type":"module","exports":"./index.mjs"}'
    )
    refused(input)
    write(
      input.root,
      'node_modules/closed/package.json',
      '{"name":"closed","type":"module","exports":"./index.mjs"}'
    )
    proven(input)
  })
  it('refuses nearest self-reference before substituting an outer workspace', () => {
    const { input, name } = workspace()
    write(
      input.root,
      'packages/nested/package.json',
      JSON.stringify({ name, type: 'module', exports: { node: './inner.mjs' } })
    )
    write(input.root, 'packages/nested/inner.mjs', 'export const answer=7;')
    write(
      input.root,
      'packages/nested/entry.mjs',
      `import {answer} from "${name}";export const result=answer;`
    )
    input.starts = ['packages/nested/entry.mjs']
    expect(oracle(input, name).value).toBe(
      pathToFileURL(path.join(input.root, 'packages/nested/inner.mjs')).href
    )
    refused(input)
  })
  it('refuses a nearer manifestless directory instead of selecting an outer workspace', () => {
    const { input, name } = workspace()
    write(
      input.root,
      'packages/consumer/package.json',
      '{"name":"consumer","type":"module"}'
    )
    write(
      input.root,
      'packages/consumer/entry.mjs',
      `import {answer} from "${name}";export const result=answer;`
    )
    fs.mkdirSync(
      path.join(input.root, 'packages/consumer/node_modules', name),
      { recursive: true }
    )
    input.starts = ['packages/consumer/entry.mjs']
    refused(input)
  })
  it.each([
    ['array', ['./chosen.mjs']],
    ['pattern', { './*': './chosen.mjs' }],
    ['mixed', { '.': './chosen.mjs', node: './other.mjs' }],
    ['numeric', { 0: './chosen.mjs', default: './chosen.mjs' }],
    ['blocked', { node: null, default: './chosen.mjs' }],
    ['root-null', null],
    ['unsupported-active', { node: ['./other.mjs'], default: './chosen.mjs' }],
    ['tab', { node: './cho\tsen.mjs' }],
    ['newline', { node: './cho\nsen.mjs' }],
    ['trailing', { node: './chosen.mjs ' }],
    ['percent', { node: './%63hosen.mjs' }],
    ['query', { node: './chosen.mjs?q' }],
    ['fragment', { node: './chosen.mjs#x' }],
    ['unicode', { node: './ç.mjs' }]
  ])('closed exports subset refuses %s without fallback', (_label, exports) => {
    const { input } = workspace({ exports })
    refused(input)
  })
  it('CJS exports never retries extension/index/main for an absent exact target', () => {
    const { input, name } = workspace({
      mode: 'require',
      exports: { require: './absent' }
    })
    write(input.root, 'packages/demo/absent.js', 'module.exports={answer:42};')
    expect(oracle(input, name, 'require').code).not.toBe(0)
    refused(input)
  })
  it('an explicit null root export cannot open a legacy main positive', () => {
    const { input } = workspace({ exports: null })
    write(
      input.root,
      'packages/demo/package.json',
      '{"name":"arbitrary-name","type":"module","exports":null,"main":"./chosen.mjs"}'
    )
    refused(input)
    write(
      input.root,
      'packages/demo/package.json',
      '{"name":"arbitrary-name","type":"module","main":"./chosen.mjs"}'
    )
    proven(input)
  })
  it.each(['[]', '"not-an-object"', 'null'])(
    'a malformed root manifest %s never grants a proof',
    (body) => {
      const input = fixture({ 'package.json': body })
      refused(input)
    }
  )
  it('never executes either an oracle target or a kernel target', () => {
    const { input, name } = workspace()
    const marker = path.join(input.root, 'MUST_NOT_EXIST')
    write(
      input.root,
      'packages/demo/chosen.mjs',
      `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)},"executed");export const answer=42;`
    )
    expect(oracle(input, name).code).toBe(0)
    refused(input)
    expect(fs.existsSync(marker)).toBe(false)
  })
  it('normal payload is deterministic and changed workspace bytes invalidate proof', () => {
    const { input } = workspace()
    const a = proven(input)
    const b = proven(input)
    delete a.telemetry
    delete b.telemetry
    expect(a).toEqual(b)
    write(input.root, 'packages/demo/chosen.mjs', 'export const answer=99;')
    expect(call(input, 'validateSemanticBoundary', a).valid).toBe(false)
  })
  it.each(
    ['import', 'require'].flatMap((mode) =>
      ['leaf', 'directory', 'chain'].flatMap((kind) =>
        ['relative', 'exports'].map((edge) => [mode, kind, edge])
      )
    )
  )(
    'R1-01 known product through %s %s %s alias stays VIOLATION before refusal/cap',
    (mode, kind, edge) => {
      const ext = mode === 'import' ? 'mjs' : 'cjs'
      const input =
        edge === 'exports'
          ? workspace({ mode, exports: { [mode]: './chosen.' + ext } }).input
          : fixture(
              {
                ['entry.' + ext]:
                  mode === 'import'
                    ? 'import {answer} from "./alias.mjs";export const value=answer;'
                    : 'module.exports=require("./alias.cjs");'
              },
              'entry.' + ext
            )
      const body = 'products/private/body.' + ext
      write(
        input.root,
        'products/private/package.json',
        '{"name":"synthetic-product","type":"module"}'
      )
      write(
        input.root,
        body,
        'throw new Error("PRODUCT BODY MUST NEVER EXECUTE");'
      )
      const base = edge === 'exports' ? 'packages/demo/' : ''
      const up = edge === 'exports' ? '../../' : ''
      let target = base + (edge === 'exports' ? 'chosen.' : 'alias.') + ext
      if (kind === 'directory') {
        target = base + 'alias-dir'
        if (edge === 'exports')
          write(
            input.root,
            'packages/demo/package.json',
            JSON.stringify({
              name: 'arbitrary-name',
              type: mode === 'import' ? 'module' : 'commonjs',
              exports: { [mode]: './alias-dir/body.' + ext }
            })
          )
        else
          write(
            input.root,
            'entry.' + ext,
            mode === 'import'
              ? 'import {answer} from "./alias-dir/body.mjs";export const value=answer;'
              : 'module.exports=require("./alias-dir/body.cjs");'
          )
      }
      const absolute = path.join(input.root, target)
      if (fs.existsSync(absolute)) fs.unlinkSync(absolute)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      if (kind === 'chain') {
        fs.symlinkSync('hop.' + ext, absolute)
        fs.symlinkSync(up + body, path.join(input.root, base + 'hop.' + ext))
      } else
        fs.symlinkSync(
          up + (kind === 'directory' ? 'products/private' : body),
          absolute
        )
      const spec =
        edge === 'exports'
          ? 'arbitrary-name'
          : kind === 'directory'
            ? './alias-dir/body.' + ext
            : './alias.' + ext
      expect(oracle(input, spec, mode)).toMatchObject({
        code: 0,
        value:
          mode === 'import'
            ? pathToFileURL(path.join(input.root, body)).href
            : path.join(input.root, body)
      })
      for (const limits of [undefined, { maxLinks: 0 }, { maxWorkspaces: 0 }]) {
        const out = call({
          ...input,
          ...(limits ? { resolutionLimits: limits } : {})
        })
        expect(out.status, JSON.stringify(out.unknowns)).toBe('VIOLATION')
        expect(out.proofs).toEqual([])
        expect(
          out.violations.some(
            (x) =>
              x.reason === 'PRODUCT_DEPENDENCY' &&
              x.target.startsWith('products/private')
          )
        ).toBe(true)
        expect(out.inputs.some((x) => x.file === body)).toBe(false)
      }
    }
  )
  it('R1-01 ordinary aliases remain UNKNOWN without product false classification', () => {
    const input = fixture({
      'entry.mjs':
        'import {answer} from "./alias.mjs";export const value=answer;',
      'products-ordinary/body.mjs': 'export const answer=42;'
    })
    fs.symlinkSync(
      'products-ordinary/body.mjs',
      path.join(input.root, 'alias.mjs')
    )
    const out = refused(input)
    expect(out.violations).toEqual([])
    expect(
      out.inputs.some((x) => x.file === 'products-ordinary/body.mjs')
    ).toBe(false)
  })
})

let toolchain
beforeAll(() => {
  toolchain = fingerprintToolchain()
})
function cliFixture() {
  const input = fixture({
    'packages/core/package.json': '{"name":"core","type":"module"}',
    'packages/core/index.mjs':
      'import {answer} from "demo"; export const result=answer;',
    'packages/demo/package.json':
      '{"name":"demo","type":"module","exports":{"node":"./chosen.mjs","default":"./other.mjs"}}',
    'packages/demo/chosen.mjs': 'export const answer=42;',
    'packages/demo/other.mjs': 'export const answer=0;',
    'package-lock.json':
      '{"lockfileVersion":3,"packages":{"":{"name":"synthetic-root","version":"1.0.0"}}}'
  })
  fs.mkdirSync(path.join(input.root, 'node_modules'))
  fs.symlinkSync('../packages/demo', path.join(input.root, 'node_modules/demo'))
  const referenceFiles = {}
  for (const file of [
    'package-lock.json',
    'packages/core/package.json',
    'packages/core/index.mjs',
    'packages/demo/package.json',
    'packages/demo/chosen.mjs',
    'packages/demo/other.mjs'
  ])
    referenceFiles[file] = fs.readFileSync(path.join(input.root, file))
  // Independent synthetic receipt matches resolution metadata physically;
  // it is not an actual offline-install/operational reference attestation.
  const reference = fixture(referenceFiles).root
  const receipt = {
    schemaVersion: 1,
    kind: 'cvg-installed-content-reference',
    commit: 'f'.repeat(40),
    root: reference,
    ...fingerprintResolution(reference),
    toolchain,
    toolchainSha256: hash(canonicalJson(toolchain)),
    recipe: {
      argv: [
        'ci',
        '--offline',
        '--ignore-scripts',
        '--audit=false',
        '--fund=false',
        '--include=dev',
        '--include=optional',
        '--cache',
        path.join(PARENT, 'synthetic-cache')
      ],
      exitCode: 0,
      offline: true,
      ignoreScripts: true,
      completed: true
    },
    selection: {
      platform: process.platform,
      arch: process.arch,
      dev: true,
      optional: true
    },
    limits: { ...INSTALLED_IDENTITY_LIMITS },
    usage: { entries: 0, regularBytes: 0, maxDepth: 0 },
    packages: []
  }
  const bytes = canonicalJson(receipt)
  const referencePath = write(input.root, 'operator-reference.json', bytes)
  const flags = [
    `--installed-reference=${referencePath}`,
    `--installed-reference-sha256=${hash(bytes)}`
  ]
  function run(args, checker = CHECKER) {
    const graph = path.join(
      PARENT,
      'cli-graph-' + hash(input.root + args.join('|') + checker) + '.json'
    )
    const r = spawnSync(
      NODE,
      [checker, input.root, `--graph=${graph}`, ...args],
      { env, encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 ** 2 }
    )
    if (r.error) throw r.error
    if (!r.stdout)
      throw Error(
        'checker produced no JSON: exit=' + r.status + ' stderr=' + r.stderr
      )
    return {
      code: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      body: JSON.parse(r.stdout),
      graph: fs.readFileSync(graph, 'utf8')
    }
  }
  return { input, flags, run }
}
describe('BUILD0237 actual CLI: compatibility, origins and strict determinism', () => {
  it('default and P1 match frozen D8 on the same physical inputs', () => {
    const vendored = {}
    for (const name of fs.readdirSync(D8_DIR).sort())
      vendored[name] = hash(fs.readFileSync(path.join(D8_DIR, name)))
    expect(vendored).toEqual(D8_SHA256)
    const f = cliFixture()
    for (const args of [[], f.flags]) {
      const old = f.run(args, BASELINE)
      const current = f.run(args)
      expect(current.code).toBe(old.code)
      expect(current.stdout).toBe(old.stdout)
      expect(current.graph).toBe(old.graph)
    }
  })
  it('semantic opt-in publishes the new profile and identical normal/strict payloads', () => {
    const f = cliFixture()
    const normal = f.run([...f.flags, '--semantic'])
    const strict = f.run([...f.flags, '--semantic', '--strict'])
    expect(normal.body.semanticBoundary.kernelVersion).toBe(
      'semantic-kernel-v4-integral-body'
    )
    delete normal.body.semanticTelemetry
    delete strict.body.semanticTelemetry
    expect(strict.body).toEqual(normal.body)
    expect(strict.graph).toBe(normal.graph)
    expect(
      normal.body.semanticBoundary.proofs.some(
        (x) => x.file === 'packages/demo/chosen.mjs'
      )
    ).toBe(true)
    expect(normal.body.semanticBoundary.frontierOrigins.length).toBe(
      normal.body.semanticBoundary.unknowns.length
    )
  })
})
