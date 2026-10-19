// @vitest-environment node
// SPEC0240 MS01–08: physical premises + observable closure, never target loading.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import * as resolver from '../scripts/boundary-semantic-resolution.mjs'
import {
  fingerprintToolchain,
  pinnedToolchainLocation
} from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const NODE = pinnedToolchainLocation().node
// Fail the whole suite, not one negative for the wrong reason, when the
// located Node/npm is not the pinned toolchain.
beforeAll(() => {
  fingerprintToolchain({ nodePath: NODE })
})
const ENGINE = path.resolve(
  import.meta.dirname,
  '../scripts/boundary-semantic-engine.mjs'
)
const PARENT = ownedRunParent('b6-0240-metadata')
const PROFILE = 'node22-linux-exact-metadata-v1'
const KERNEL = 'semantic-kernel-v4-integral-body'
const roots = [],
  sessions = []
const env = {
  PATH: path.dirname(NODE) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: PARENT
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const copy = (value) => JSON.parse(JSON.stringify(value))
function write(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof value === 'object' ? JSON.stringify(value) : value
  )
  return target
}
function fixture({
  mode = 'import',
  metadata = 'both',
  subpath = '.',
  installed = false
} = {}) {
  const root = fs.mkdtempSync(path.join(PARENT, 'metadata unicode-ç '))
  roots.push(root)
  const ext = mode === 'import' ? 'mjs' : 'cjs'
  const owner = installed ? 'node_modules/demo' : 'packages/demo'
  const specifier = subpath === '.' ? 'demo' : 'demo/' + subpath.slice(2)
  const body =
    mode === 'import' ? 'export const answer=42;' : 'module.exports=42;'
  const manifest = {
    name: 'demo',
    type: mode === 'import' ? 'module' : 'commonjs',
    exports: { [subpath]: { import: './chosen.mjs', require: './chosen.cjs' } },
    ...(metadata === 'imports' || metadata === 'both'
      ? { imports: { '#unused/tools': { arbitrary: [null, 17, false] } } }
      : {})
  }
  if (metadata === 'pattern' || metadata === 'both')
    manifest.exports['./unused/*'] = { unselected: [null, false, 17] }
  write(root, 'package.json', {
    name: 'synthetic-root',
    type: 'module',
    workspaces: ['packages/*', 'products/*']
  })
  const from = 'entry.' + ext
  write(
    root,
    from,
    mode === 'import'
      ? `import {answer} from ${JSON.stringify(specifier)};export const result=answer;`
      : `const p=require(${JSON.stringify(specifier)});module.exports=p;`
  )
  write(root, owner + '/package.json', manifest)
  write(root, owner + '/chosen.' + ext, body)
  write(
    root,
    owner + '/other.' + ext,
    mode === 'import' ? 'export const answer=0;' : 'module.exports=0;'
  )
  if (!installed) {
    fs.mkdirSync(path.join(root, 'node_modules'), { recursive: true })
    fs.symlinkSync('../packages/demo', path.join(root, 'node_modules/demo'))
  }
  return {
    root,
    mode,
    ext,
    from,
    owner,
    specifier,
    subpath,
    manifest,
    input: {
      root,
      starts: [from],
      installed: [],
      origins: [],
      compiled: { status: 'UNAVAILABLE', files: [] }
    }
  }
}
function save(f) {
  write(f.root, f.owner + '/package.json', f.manifest)
}
function session(f, limits) {
  const s = resolver.createResolutionSession({ root: f.root, limits })
  sessions.push(s)
  return s
}
const select = (s, f, specifier = f.specifier) =>
  s.resolve({ from: f.from, specifier, mode: f.mode })
// Constant code; all variable data uses argv/stdin. Engine parses targets only.
const ENGINE_CODE =
  'const fs=require("node:fs");const e=require(process.argv[1]);const p=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(JSON.stringify(e[p.method](...p.args)));'
function engine(
  f,
  { input = f.input, method = 'runSemanticBoundary', output, flags = [] } = {}
) {
  const r = spawnSync(NODE, [...flags, '-e', ENGINE_CODE, ENGINE], {
    input: JSON.stringify({
      method,
      args: output === undefined ? [input] : [input, output]
    }),
    cwd: f.root,
    env,
    encoding: 'utf8',
    timeout: 150000,
    maxBuffer: 32 * 1024 ** 2
  })
  if (r.error || r.status !== 0) throw Error(r.error?.message || r.stderr)
  return JSON.parse(r.stdout)
}
// The load hook denies every target load even if this oracle accidentally grows
// a load path. Builtins are bound before installing it. No interpolated code.
const ORACLE_CODE = `import {createRequire,registerHooks} from 'node:module';
const req=createRequire(process.argv[2]);
registerHooks({load(url){throw Error('TARGET_LOAD_FORBIDDEN:'+url)}});
try{const value=process.argv[3]==='import'?import.meta.resolve(process.argv[1]):req.resolve(process.argv[1]);process.stdout.write(JSON.stringify({value}));}
catch(e){process.stdout.write(JSON.stringify({error:e.code||e.message}));process.exitCode=2;}`
function oracle(f, specifier = f.specifier) {
  const r = spawnSync(
    NODE,
    [
      '--input-type=module',
      '--eval',
      ORACLE_CODE,
      specifier,
      pathToFileURL(path.join(f.root, f.from)).href,
      f.mode
    ],
    {
      cwd: f.root,
      env,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 ** 2
    }
  )
  if (r.error) throw r.error
  return { code: r.status, ...JSON.parse(r.stdout) }
}
function nativeTarget(f, file = f.owner + '/chosen.' + f.ext) {
  expect(oracle(f)).toEqual({
    code: 0,
    value:
      f.mode === 'import'
        ? pathToFileURL(path.join(f.root, file)).href
        : path.join(f.root, file)
  })
}
function proven(f) {
  const out = engine(f)
  expect(out.status, JSON.stringify(out.unknowns)).toBe('PROVEN')
  expect(out.validation.valid).toBe(true)
  expect(out.proofs.length).toBeGreaterThan(0)
  const entry = out.proofs.find((p) => p.file === f.from && p.rule === 'K5')
  expect(entry).toBeDefined()
  expect(entry.derivation.closure).toContain(f.owner + '/chosen.' + f.ext)
  expect(out.proofs.some((p) => p.file === f.owner + '/other.' + f.ext)).toBe(
    false
  )
  return out
}
function unknown(f, options) {
  const out = engine(f, options)
  expect(out.status, JSON.stringify(out.violations)).toBe('UNKNOWN')
  expect(out.proofs).toEqual([])
  expect(out.unknowns.length).toBeGreaterThan(0)
  expect(out.violations).toEqual([])
  return out
}
function violation(f, input = f.input, expectedProductInputs = []) {
  const out = engine(f, { input })
  expect(out.status, JSON.stringify(out.unknowns)).toBe('VIOLATION')
  expect(out.proofs).toEqual([])
  expect(
    out.violations.some(
      (v) =>
        v.reason === 'PRODUCT_DEPENDENCY' &&
        v.target.startsWith('products/private/')
    )
  ).toBe(true)
  expect(
    out.inputs
      .filter((v) => v.file.startsWith('products/private/'))
      .map((v) => v.file)
  ).toEqual(expectedProductInputs)
  return out
}
afterEach(() => {
  for (const s of sessions.splice(0)) s.close()
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('0240 MS01/MS06 exact metadata positives and native agreement', () => {
  it.each(
    ['import', 'require'].flatMap((mode) =>
      ['imports', 'pattern', 'both'].map((metadata) => [mode, metadata])
    )
  )(
    '%s closed JS with inactive %s derives closure and the native target',
    (mode, metadata) => {
      const f = fixture({ mode, metadata })
      nativeTarget(f)
      proven(f)
      const selected = select(session(f), f)
      expect(selected.file).toBe(f.owner + '/chosen.' + f.ext)
      const m = selected.trace.metadataSelection
      expect(m.imports).toMatchObject({
        present: metadata !== 'pattern',
        eligible: metadata !== 'pattern',
        inactive: metadata !== 'pattern',
        keys: metadata === 'pattern' ? [] : ['#unused/tools']
      })
      expect(m.exports).toEqual({
        requestedSubpath: '.',
        selectedKey: '.',
        unselectedPatternKeys: metadata === 'imports' ? [] : ['./unused/*']
      })
    }
  )
  it.each(['import', 'require'])(
    '%s selects exact nonroot subpath before overlapping pattern',
    (mode) => {
      const f = fixture({ mode, subpath: './nested/tool' })
      f.manifest.exports['./nested/*'] = './other.' + f.ext
      save(f)
      nativeTarget(f)
      proven(f)
      const selected = select(session(f), f)
      expect(selected.trace.branch).toEqual(['./nested/tool', mode])
      expect(selected.trace.metadataSelection.exports).toMatchObject({
        requestedSubpath: './nested/tool',
        selectedKey: './nested/tool',
        unselectedPatternKeys: expect.arrayContaining([
          './nested/*',
          './unused/*'
        ])
      })
    }
  )
  it.each([
    [
      'early default',
      { default: './other.mjs', node: './chosen.mjs' },
      'other.mjs'
    ],
    [
      'late default',
      { node: './chosen.mjs', default: './other.mjs' },
      'chosen.mjs'
    ],
    [
      'nested NOT_MATCHED',
      { node: { browser: './other.mjs' }, default: './chosen.mjs' },
      'chosen.mjs'
    ]
  ])('MS03 preserves ordered selection: %s', (_label, value, target) => {
    const f = fixture()
    f.manifest.exports['.'] = value
    save(f)
    nativeTarget(f, f.owner + '/' + target)
    expect(select(session(f), f).file).toBe(f.owner + '/' + target)
    const out = engine(f)
    expect(out.status, JSON.stringify(out.unknowns)).toBe('PROVEN')
    expect(out.proofs.some((p) => p.file === f.owner + '/' + target)).toBe(true)
  })
  it('MS01 empty imports map and a single embedded-star key remain inactive', () => {
    const f = fixture()
    f.manifest.imports = {}
    f.manifest.exports = { '.': './chosen.mjs', './src/pre*post.js': null }
    save(f)
    nativeTarget(f)
    proven(f)
    expect(select(session(f), f).trace.metadataSelection.imports.keys).toEqual(
      []
    )
  })
})

describe('0240 MS02/MS03 unsupported selected exports never fall back', () => {
  const cases = [
    ['pattern-only exact miss', { './*': './chosen.mjs' }],
    [
      'global mixed keys',
      { '.': './chosen.mjs', node: './chosen.mjs', './*': null }
    ],
    [
      'selected numeric condition',
      { '.': { 0: './other.mjs', default: './chosen.mjs' }, './*': null }
    ],
    [
      'selected mixed condition',
      { '.': { './x': './other.mjs', default: './chosen.mjs' }, './*': null }
    ],
    ['selected array', { '.': ['./chosen.mjs'], './*': './other.mjs' }],
    ['selected null', { '.': null, './*': './chosen.mjs' }],
    [
      'nested BLOCKED',
      { '.': { node: null, default: './chosen.mjs' }, './*': null }
    ],
    ['target escape', { '.': '../demo/chosen.mjs', './*': null }],
    ['target tab', { '.': './cho\tsen.mjs', './*': null }],
    ['target percent', { '.': './%63hosen.mjs', './*': null }],
    ['malformed pattern key', { '.': './chosen.mjs', './bad//*/x': null }],
    ['multiple stars', { '.': './chosen.mjs', './a*b*c': null }],
    ['trailing slash', { '.': './chosen.mjs', './bad/*/': null }],
    ['reserved segment', { '.': './chosen.mjs', './NODE_MODULES/*': null }]
  ]
  it.each(cases)(
    '%s stays UNKNOWN even with a usable main/index',
    (_label, exports) => {
      const f = fixture()
      f.manifest.exports = exports
      f.manifest.main = './chosen.mjs'
      save(f)
      write(f.root, f.owner + '/index.js', 'export const answer=42;')
      write(f.root, f.owner + '/cho\tsen.mjs', 'export const answer=42;')
      unknown(f)
      expect(() => select(session(f), f)).toThrow(/UNKNOWN_/)
    }
  )
  it.each(['import', 'require'])(
    '%s exact null nonroot blocks an otherwise matching native pattern',
    (mode) => {
      const f = fixture({ mode, subpath: './nested/tool' })
      f.manifest.exports = {
        './nested/tool': null,
        './nested/*': './chosen.' + f.ext
      }
      save(f)
      expect(oracle(f)).toMatchObject({
        code: 2,
        error: 'ERR_PACKAGE_PATH_NOT_EXPORTED'
      })
      unknown(f)
      expect(() => select(session(f), f)).toThrow(/UNKNOWN_BLOCKED_EXPORT/)
    }
  )
  it.each(['import', 'require'])(
    '%s pattern could resolve natively but exact miss is not implemented',
    (mode) => {
      const f = fixture({ mode, subpath: './nested/tool' })
      f.manifest.exports = { './nested/*': './chosen.' + f.ext }
      save(f)
      nativeTarget(f)
      unknown(f)
      expect(() => select(session(f), f)).toThrow(/UNKNOWN_UNRESOLVED_EXPORT/)
    }
  )
})

describe('0240 MS02 imports grammar and active edges', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['scalar', false],
    ['bare hash', { '#': null }],
    ['empty segment', { '#a//b': null }],
    ['pattern', { '#a/*': null }],
    ['reserved', { '#a/NoDe_MoDuLeS': null }],
    ['dot', { '#a/..': null }],
    ['percent', { '#a/%62': null }],
    ['unicode', { '#ação': null }],
    ['space', { '#a b': null }],
    ['query', { '#a?b': null }]
  ])(
    'ineligible %s map cannot remove the body/resolution guard',
    (_label, imports) => {
      const f = fixture()
      f.manifest.imports = imports
      save(f)
      unknown(f)
      expect(() => select(session(f), f)).toThrow(/UNKNOWN_/)
      expect(resolver.isInactiveImportsMapEligible(imports)).toBe(false)
    }
  )
  it('pure eligibility accepts all allowed segments without interpreting JSON values', () => {
    const imports = {
      '#A_0/@scope/+.-/tool.js': [null, 17, { arbitrary: false }]
    }
    const before = JSON.stringify(imports)
    expect(resolver.isInactiveImportsMapEligible(imports)).toBe(true)
    expect(resolver.isInactiveImportsMapEligible({})).toBe(true)
    expect(JSON.stringify(imports)).toBe(before)
  })
  it.each(['import', 'require'])(
    '%s actual # edge stays UNKNOWN under an eligible map',
    (mode) => {
      const f = fixture({ mode })
      f.manifest.imports = { '#local': './other.' + f.ext }
      save(f)
      write(
        f.root,
        f.owner + '/chosen.' + f.ext,
        mode === 'import'
          ? 'import {answer} from "#local";export {answer};'
          : 'module.exports=require("#local");'
      )
      nativeTarget(f)
      unknown(f)
    }
  )
})

describe('0240 MS04 selection cannot grant body/format/provenance authority', () => {
  it.each([
    [
      'opaque reflection',
      'chosen.mjs',
      'export const answer=Reflect.get(globalThis,"unknown");'
    ],
    [
      'native builtin',
      'chosen.mjs',
      'import fs from "node:fs";export const answer=fs;'
    ],
    ['native addon', 'chosen.node', 'NEVER LOAD NATIVE'],
    ['declaration', 'chosen.d.ts', 'export declare const answer:number;'],
    ['TSX', 'chosen.tsx', 'export const answer=<div/>;'],
    ['interop', 'chosen.cjs', 'module.exports=42;'],
    ['dist without receipt', 'dist/chosen.mjs', 'export const answer=42;']
  ])('%s remains UNKNOWN with both inactive metadata', (_label, file, body) => {
    const f = fixture()
    f.manifest.exports['.'] = './' + file
    save(f)
    write(f.root, f.owner + '/' + file, body)
    unknown(f)
  })
  it('browser metadata still refuses a closed body', () => {
    const f = fixture()
    f.manifest.browser = {}
    save(f)
    nativeTarget(f)
    unknown(f)
  })
  it.each(['import', 'require'])(
    'MS06 hostile %s target never executes through oracle or analyzer',
    (mode) => {
      const f = fixture({ mode })
      const marker = path.join(f.root, 'HOSTILE_MARKER_MUST_BE_ABSENT')
      write(
        f.root,
        f.owner + '/chosen.' + f.ext,
        mode === 'import'
          ? `import fs from "node:fs";fs.writeFileSync(${JSON.stringify(marker)},"ran");export const answer=42;`
          : `require("node:fs").writeFileSync(${JSON.stringify(marker)},"ran");module.exports=42;`
      )
      nativeTarget(f)
      unknown(f)
      expect(fs.existsSync(marker)).toBe(false)
    }
  )
  it.each(['import', 'require'])(
    'MS06 %s missing target URL is distinct from physical availability',
    (mode) => {
      const f = fixture({ mode })
      fs.unlinkSync(path.join(f.root, f.owner + '/chosen.' + f.ext))
      if (mode === 'import') {
        // Without a physical target Node returns the logical exports URL.
        expect(oracle(f)).toEqual({
          code: 0,
          value: pathToFileURL(
            path.join(f.root, 'node_modules/demo/chosen.mjs')
          ).href
        })
      } else
        expect(oracle(f)).toMatchObject({ code: 2, error: 'MODULE_NOT_FOUND' })
      unknown(f)
    }
  )
})

function productAlias(f, kind, registeredProduct = false) {
  // The normal negative checks forbid all consumer acquisition. A separate
  // paired control below covers explicitly registered manifest metadata.
  if (!registeredProduct)
    write(f.root, 'package.json', {
      ...JSON.parse(fs.readFileSync(path.join(f.root, 'package.json'), 'utf8')),
      workspaces: ['packages/*']
    })
  write(f.root, 'products/private/package.json', {
    name: 'synthetic-product',
    type: f.mode === 'import' ? 'module' : 'commonjs'
  })
  const body = 'products/private/body.' + f.ext
  write(f.root, body, 'throw new Error("PRODUCT MUST NEVER LOAD");')
  const selected = path.join(f.root, f.owner, 'chosen.' + f.ext)
  fs.unlinkSync(selected)
  if (kind === 'chain') {
    fs.symlinkSync('hop.' + f.ext, selected)
    fs.symlinkSync('../../' + body, path.join(f.root, f.owner, 'hop.' + f.ext))
  } else fs.symlinkSync('../../' + body, selected)
  return body
}
describe('0240 MS05/MS07 selected product priority and acquisition bounds', () => {
  it.each(['import', 'require'])(
    '%s registered consumer permits census manifest only, never target source or proof',
    (mode) => {
      const f = fixture({ mode })
      nativeTarget(f, productAlias(f, 'leaf', true))
      const out = violation(f, f.input, ['products/private/package.json'])
      expect(
        out.inputs.some((v) => v.file === 'products/private/body.' + f.ext)
      ).toBe(false)
    }
  )
  it.each(
    ['import', 'require'].flatMap((mode) =>
      ['leaf', 'chain'].map((kind) => [mode, kind])
    )
  )(
    '%s selected %s product alias with both inactive metadata survives later caps',
    (mode, kind) => {
      const f = fixture({ mode })
      nativeTarget(f, productAlias(f, kind))
      const original = violation(f)
      for (const caps of [
        { limits: { maxNodes: 0 } },
        { resolutionLimits: { maxWorkspaces: 0 } }
      ]) {
        const reduced = violation(f, { ...f.input, ...caps })
        for (const v of original.violations)
          expect(reduced.violations).toContainEqual(v)
      }
    }
  )
  it('preacquisition FD cap produces UNKNOWN/zero proofs before target knowledge', () => {
    const f = fixture()
    productAlias(f, 'leaf')
    const out = unknown(f, {
      input: { ...f.input, resolutionLimits: { maxOpenDescriptors: 0 } }
    })
    expect(out.inputs.some((v) => v.file.startsWith('products/private/'))).toBe(
      false
    )
    expect(out.unknowns.some((v) => /LIMIT|ACQUISITION/.test(v.reason))).toBe(
      true
    )
  })
  it('oversized inactive JSON cannot bypass manifest acquisition; prior violation survives', () => {
    const f = fixture()
    // One bounded cap witness, not a large repeat corpus: hard limit is 16MiB.
    f.manifest.imports['#unused/tools'] = 'x'.repeat(16 * 1024 ** 2)
    save(f)
    const out = unknown(f)
    expect(out.inputs.some((v) => v.file === f.owner + '/package.json')).toBe(
      false
    )
    write(f.root, 'products/private/body.mjs', 'throw new Error("NEVER LOAD");')
    write(
      f.root,
      'a-known.mjs',
      'import "./products/private/body.mjs";export const answer=1;'
    )
    const prior = { ...f.input, starts: ['a-known.mjs'] }
    const before = violation(f, prior)
    const after = violation(f, { ...prior, starts: ['a-known.mjs', f.from] })
    for (const v of before.violations)
      expect(after.violations).toContainEqual(v)
  })
})

describe('0240 MS07/MS08 full snapshots, metadata trace and profile binding', () => {
  it.each(['imports', 'pattern'])(
    'mutation of inactive %s bytes invalidates old snapshot and proof',
    (field) => {
      const f = fixture()
      const out = proven(f)
      const s = session(f)
      select(s, f)
      const snapshot = s.snapshot()
      expect(
        resolver.revalidateResolutionSnapshot({ root: f.root, snapshot })
      ).toBe(true)
      const premise = snapshot.inputs.find(
        (v) => v.kind === 'file' && v.file === f.owner + '/package.json'
      )
      expect(premise.sha256).toBe(
        hash(fs.readFileSync(path.join(f.root, f.owner, 'package.json')))
      )
      if (field === 'imports')
        f.manifest.imports['#unused/tools'] = { changed: [false, 18] }
      else f.manifest.exports['./unused/*'] = { changed: [false, 18] }
      save(f)
      expect(() => s.revalidate()).toThrow(/UNKNOWN_/)
      expect(() =>
        resolver.revalidateResolutionSnapshot({ root: f.root, snapshot })
      ).toThrow(/UNKNOWN_/)
      expect(
        engine(f, { method: 'validateSemanticBoundary', output: out }).valid
      ).toBe(false)
    }
  )
  it.each([
    'old profile',
    'eligible',
    'inactive',
    'ignored patterns',
    'selected key',
    'valid-looking branch'
  ])(
    'rejects forged %s rather than trusting physically unchanged inputs',
    (kind) => {
      const f = fixture()
      const s = session(f)
      select(s, f)
      const snapshot = s.snapshot()
      expect(
        resolver.revalidateResolutionSnapshot({ root: f.root, snapshot })
      ).toBe(true)
      const bad = copy(snapshot),
        trace = bad.resolutions.find((r) => r.specifier === f.specifier)
      if (kind === 'old profile') bad.profile = 'linux-rootfd-workspace-v1'
      if (kind === 'eligible') trace.metadataSelection.imports.eligible = false
      if (kind === 'inactive') trace.metadataSelection.imports.inactive = false
      if (kind === 'ignored patterns')
        trace.metadataSelection.exports.unselectedPatternKeys = []
      if (kind === 'selected key')
        trace.metadataSelection.exports.selectedKey = './unused/*'
      if (kind === 'valid-looking branch') trace.branch = ['.', 'require']
      expect(() =>
        resolver.revalidateResolutionSnapshot({ root: f.root, snapshot: bad })
      ).toThrow(/UNKNOWN_/)
    }
  )
  it('new profile/kernel binds K5 and parent rejects an old kernel proof', () => {
    const f = fixture()
    const out = proven(f)
    expect(resolver.RESOLUTION_PROFILE).toBe(PROFILE)
    expect(out.runtimeResolution.profile).toBe(PROFILE)
    expect(out.kernelVersion).toBe(KERNEL)
    const entry = out.proofs.find((p) => p.file === f.from)
    expect(entry.derivation.profile.resolutionProfile).toBe(PROFILE)
    const old = copy(out)
    old.kernelVersion = 'semantic-kernel-v2-resolution'
    expect(
      engine(f, { method: 'validateSemanticBoundary', output: old }).valid
    ).toBe(false)
  })
  it('MS02 custom runtime conditions stay UNKNOWN under eligible metadata', () => {
    const f = fixture()
    const out = unknown(f, { flags: ['--conditions=browser'] })
    expect(
      out.unknowns.some((v) => v.reason === 'UNKNOWN_RUNTIME_PROFILE')
    ).toBe(true)
  })
})

// R1-REQ-01/02: the exact-metadata refinement must not consume the opportunity
// of the v2 negative census (shared hard budget, later deadline or kill).
describe('0240 MS05/MS07 refinement cannot consume the v2 refusal census', () => {
  const KNOWN = {
    file: 'entry.mjs',
    reason: 'PRODUCT_DEPENDENCY',
    target: 'products/x'
  }
  function heavy({ order, nested = false, files }) {
    const root = fs.mkdtempSync(path.join(PARENT, 'r1 census '))
    roots.push(root)
    write(root, 'package.json', {
      name: 'synthetic-root',
      type: 'module',
      workspaces: ['packages/*', 'products/*']
    })
    write(root, 'entry.mjs', order.map((s) => `import '${s}';\n`).join(''))
    write(root, 'node_modules/pkg/package.json', {
      name: 'pkg',
      type: 'module',
      imports: {},
      exports: { '.': './index.mjs' }
    })
    let index = nested ? "import 'prodalias';\n" : ''
    for (let i = 0; i < files; i++) {
      index += `import './f${i}.mjs';\n`
      write(root, `node_modules/pkg/f${i}.mjs`, '')
    }
    write(root, 'node_modules/pkg/index.mjs', index)
    fs.symlinkSync('../products/x', path.join(root, 'node_modules/prodalias'))
    write(root, 'products/x/package.json', { name: 'x', type: 'module' })
    write(root, 'products/x/index.mjs', 'export const x=1;\n')
    return {
      root,
      input: {
        root,
        starts: ['entry.mjs'],
        installed: [],
        origins: [],
        compiled: { status: 'UNAVAILABLE', files: [] }
      }
    }
  }
  const census = (f, input = f.input) =>
    engine(f, {
      input,
      method: 'analyzeSemanticBoundary',
      output: { refusalCensus: true }
    })
  it('shared maxFiles budget: v2 census violation survives the refinement exhaustion', () => {
    const f = heavy({ order: ['pkg', 'prodalias'], files: 6000 })
    const refinementOnly = engine(f, { method: 'analyzeSemanticBoundary' })
    expect(refinementOnly.violations).toEqual([])
    expect(refinementOnly.unknowns.some((u) => /maxFiles/.test(u.detail))).toBe(
      true
    )
    const v2 = census(f)
    expect(v2.violations).toEqual([KNOWN])
    expect(v2.proofs).toEqual([])
    expect(v2.runtimeResolution.profile).toBe(resolver.REFUSAL_CENSUS_PROFILE)
    const out = engine(f)
    expect(out.status).toBe('VIOLATION')
    expect(out.proofs).toEqual([])
    expect(out.violations).toEqual([KNOWN])
    expect(out.kernelVersion).toBe(KERNEL)
    expect(out.unknowns.some((u) => /maxFiles/.test(u.detail))).toBe(true)
  }, 240000)
  it('known product then a later deadline keeps the violation within one deadline', () => {
    const f = heavy({ order: ['prodalias', 'pkg'], files: 4000 })
    const input = { ...f.input, limits: { timeoutMs: 4000 } }
    expect(census(f, input).violations).toEqual([KNOWN])
    const out = engine(f, { input })
    expect(out.status).toBe('VIOLATION')
    expect(out.proofs).toEqual([])
    expect(out.violations).toEqual([KNOWN])
    expect(
      out.unknowns.some((u) => u.reason === 'UNKNOWN_ANALYSIS_LIMIT')
    ).toBe(true)
    // One shared deadline: the census never doubles limits.timeoutMs.
    expect(out.telemetry.negativeCensusElapsedMs).toBeLessThan(4000)
    expect(out.telemetry.elapsedMs).toBeLessThan(4000 + 2000)
  }, 120000)
  it('a product known only to the refinement survives the kill of its worker', () => {
    const f = heavy({ order: ['pkg'], nested: true, files: 4000 })
    const input = { ...f.input, limits: { timeoutMs: 4000 } }
    // v2 refuses pkg before its body: the census cannot know this product.
    expect(census(f, input).violations).toEqual([])
    const out = engine(f, { input })
    expect(out.status).toBe('VIOLATION')
    expect(out.proofs).toEqual([])
    expect(out.inputs).toEqual([])
    expect(out.violations).toEqual([
      { ...KNOWN, file: 'node_modules/pkg/index.mjs' }
    ])
    expect(
      out.unknowns.some(
        (u) => u.reason === 'UNKNOWN_ANALYSIS_LIMIT' && u.detail === 'timeoutMs'
      )
    ).toBe(true)
  }, 120000)
  it('refusal census applies exactly the v2 refusals and is never proof authority', () => {
    const both = fixture()
    const s = resolver.createResolutionSession({
      root: both.root,
      refusalCensus: true
    })
    sessions.push(s)
    expect(() => select(s, both)).toThrow(/UNKNOWN_AMBIGUOUS_RESOLUTION/)
    const pattern = fixture({ metadata: 'pattern' })
    const p = resolver.createResolutionSession({
      root: pattern.root,
      refusalCensus: true
    })
    sessions.push(p)
    expect(() => select(p, pattern)).toThrow(/UNKNOWN_UNSUPPORTED_EXPORTS/)
    const snapshot = p.snapshot()
    expect(snapshot.profile).toBe(resolver.REFUSAL_CENSUS_PROFILE)
    expect(() =>
      resolver.revalidateResolutionSnapshot({ root: pattern.root, snapshot })
    ).toThrow(/UNKNOWN_INVALID_SNAPSHOT/)
    expect(() =>
      resolver.createResolutionSession({ root: both.root, refusalCensus: 1 })
    ).toThrow(/UNKNOWN_CENSUS_MODE/)
    const closed = fixture({ metadata: 'none' })
    const out = census(closed)
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toEqual([])
    expect(
      out.unknowns.some((u) => u.reason === 'UNKNOWN_NEGATIVE_CENSUS_ONLY')
    ).toBe(true)
    const bad = spawnSync(
      NODE,
      ['--experimental-vm-modules', ENGINE, '--semantic-worker', '--bogus'],
      { input: JSON.stringify(closed.input), env, encoding: 'utf8' }
    )
    expect(bad.status).toBe(2)
    expect(bad.stdout).toBe('')
  })
})
