// @vitest-environment node
// SPEC0241 IB01–IB09 on private physical fixtures: integral body measurement
// (D1) and installed file identity (D2). Targets are parsed as bytes only: the
// caller refuses any file: load outside the engine directory and the parser.
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
let toolchain
beforeAll(() => {
  toolchain = fingerprintToolchain({ nodePath: NODE })
})
const SCRIPTS = path.resolve(import.meta.dirname, '../scripts')
const ENGINE = path.join(SCRIPTS, 'boundary-semantic-engine.mjs')
const CHECKER = path.join(SCRIPTS, 'check-product-boundary.mjs')
const IDENTITY = path.join(SCRIPTS, 'boundary-installed-identity.mjs')
const PARSER = path.resolve(
  SCRIPTS,
  '../node_modules/typescript/lib/typescript.js'
)
const PARENT = ownedRunParent('b6-0241-body')
const KERNEL = 'semantic-kernel-v4-integral-body'
const PREMISE = 'installed-file-identity-v1'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const env = () => ({
  PATH: path.dirname(NODE) + ':/usr/bin:/bin',
  LANG: 'C',
  LC_ALL: 'C',
  TZ: 'UTC',
  TMPDIR: PARENT
})
const restore = []
afterEach(() => {
  for (const [file, mode] of restore.splice(0)) fs.chmodSync(file, mode)
})

// Constant caller code; every variable datum arrives on stdin. Optional
// OS-fault injection patches fs.openSync in this process only (analysis in
// process); the engine's own workers are never patched.
const RUNNER =
  "import fs from 'node:fs';import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';" +
  'const[engine,parser]=process.argv.slice(1);const dir=pathToFileURL(engine.slice(0,engine.lastIndexOf("/")+1)).href;' +
  'const parserURL=pathToFileURL(parser).href;let blocked=0;' +
  "registerHooks({load(u,c,next){if(u.startsWith('file:')&&!u.startsWith(dir)&&u!==parserURL){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(u,c)}});" +
  "const req=JSON.parse(fs.readFileSync(0,'utf8'));" +
  'if(req.fault){const f=req.fault,open=fs.openSync;let n=0;fs.openSync=function(file,...rest){' +
  "if(String(file).endsWith('/'+f.leaf)&&++n===f.at){if(f.code)throw Object.assign(Error('injected OS fault'),{code:f.code});" +
  "if(f.rewrite){const fd=open(f.rewrite.path,'w');fs.writeSync(fd,f.rewrite.data);fs.closeSync(fd)}}" +
  'return open.call(this,file,...rest)}}' +
  'const e=await import(pathToFileURL(engine).href);' +
  'const results=req.calls.map((c)=>e[c.method](...c.args));' +
  'process.stdout.write(JSON.stringify({results,blocked}))'

function batch(calls, { fault, flags = [] } = {}) {
  const r = spawnSync(
    NODE,
    [...flags, '--input-type=module', '-e', RUNNER, ENGINE, PARSER],
    {
      input: JSON.stringify({ calls, fault }),
      cwd: PARENT,
      env: env(),
      encoding: 'utf8',
      timeout: 600000,
      maxBuffer: 64 * 1024 ** 2
    }
  )
  expect(r.status, r.stderr).toBe(0)
  const out = JSON.parse(r.stdout)
  expect(out.blocked).toBe(0)
  return out.results
}
const run = (input, options) =>
  batch([{ method: 'runSemanticBoundary', args: [input] }], options)[0]
const analyze = (input, options, census = false) =>
  batch(
    [
      {
        method: 'analyzeSemanticBoundary',
        args: census ? [input, { refusalCensus: true }] : [input]
      }
    ],
    options
  )[0]

const ROOTPKG = { name: 'fixture-root', private: true, type: 'module' }
const pkg = (name, extra = {}) => ({
  name,
  version: '1.0.0',
  type: 'module',
  ...extra
})
function write(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    Buffer.isBuffer(value) || typeof value === 'string'
      ? value
      : JSON.stringify(value)
  )
  return target
}
function fixture(name, files, options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(PARENT, name + '-')))
  if (!Object.hasOwn(files, 'package.json'))
    write(root, 'package.json', options.rootPkg || ROOTPKG)
  for (const [file, value] of Object.entries(files)) write(root, file, value)
  for (const [file, target] of Object.entries(options.links || {})) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.symlinkSync(target, path.join(root, file))
  }
  for (const [file, mode] of Object.entries(options.chmod || {})) {
    restore.push([path.join(root, file), 0o600])
    fs.chmodSync(path.join(root, file), mode)
  }
  return {
    root,
    starts: options.starts || ['entry.mjs'],
    origins: [],
    installed: options.installed || [],
    ...(options.compiled ? { compiled: options.compiled } : {}),
    ...(options.limits ? { limits: options.limits } : {}),
    ...(options.resolutionLimits
      ? { resolutionLimits: options.resolutionLimits }
      : {})
  }
}
// 0234 reference inventory of a physical package dir; mutate keeps the digest
// consistent with the delivered inventory (the receipt binding is the
// checker's job, the engine recomputes and compares).
function identity(root, key, { status = 'MATCH', mutate, digest } = {}) {
  const inv = collectPackageInventory(path.join(root, key))
  let body = {
    entries: inv.entries.map((e) => ({ ...e })),
    nestedPackages: [...inv.nestedPackages],
    usage: { ...inv.usage }
  }
  if (mutate) body = mutate(body)
  return {
    key,
    manifest: key + '/package.json',
    identityStatus: status,
    referenceDigest: 'a'.repeat(64),
    inventorySha256: digest || hash(canonicalJson(body)),
    inventory: body
  }
}
const tuples = (out) => out.unknowns.map((u) => [u.file, u.reason, u.detail])
// Order-free comparison: the engine sorts by the canonical JSON of the item.
const asSet = (rows) => rows.map((x) => JSON.stringify(x)).sort()
const has = (out, file, reason, detail) =>
  out.unknowns.some(
    (u) =>
      u.file === file &&
      u.reason === reason &&
      (detail === undefined || u.detail === detail)
  )
const comparable = (out) => {
  const copy = structuredClone(out)
  delete copy.telemetry
  return copy
}
const importEntry = (spec) =>
  `import x from ${JSON.stringify(spec)}\nexport const after = missingGlobal\n`
const requireEntry = (spec) =>
  `const x = require(${JSON.stringify(spec)})\nmodule.exports = missingGlobal\n`
const bodyOnly = (spec) =>
  `const m = { p: ${JSON.stringify(spec)} }\nimport(m.p)\nexport const after = missingGlobal\n`

const SPEC_PER_EDGE = [
  'UNKNOWN_RESOLUTION',
  'UNKNOWN_NATIVE_BUILTIN',
  'UNKNOWN_EXTERNAL_PATH',
  'UNKNOWN_FORMAT',
  'UNKNOWN_MODULE_INTEROP',
  'UNKNOWN_AMBIGUOUS_RESOLUTION',
  'UNKNOWN_UNSUPPORTED_EXPORTS',
  'UNKNOWN_UNRESOLVED_EXPORT',
  'UNKNOWN_BLOCKED_EXPORT',
  'UNKNOWN_EXPORTS_DEPTH',
  'UNKNOWN_EXACT_EXPORTS_TARGET',
  'UNKNOWN_TARGET_URL',
  'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION',
  'UNKNOWN_PACKAGE_SELF_REFERENCE',
  'UNKNOWN_PACKAGE_SCOPE',
  'UNKNOWN_PACKAGE_NAME',
  'UNKNOWN_PACKAGE_ESCAPE',
  'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST',
  'UNKNOWN_CJS_FILE_PACKAGE',
  'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY',
  'UNKNOWN_WORKSPACE_CONFIG',
  'UNKNOWN_WORKSPACE_LINK',
  'UNKNOWN_SYMLINK',
  'UNKNOWN_ANCESTOR_SYMLINK',
  'UNKNOWN_ANCESTOR_FORMAT',
  'UNKNOWN_LINK_FORMAT',
  'UNKNOWN_METADATA_ENCODING',
  'UNKNOWN_INPUT_ENCODING',
  'UNKNOWN_INVALID_MANIFEST',
  'UNKNOWN_PATH',
  'UNKNOWN_PRODUCT_TARGET',
  'UNKNOWN_ACQUISITION_ENOENT',
  'UNKNOWN_ACQUISITION_ENOTDIR',
  'UNKNOWN_ACQUISITION_ELOOP',
  'UNKNOWN_ACQUISITION_EACCES',
  'UNKNOWN_ACQUISITION_EISDIR'
]
const PHASES = ['acquisition', 'body', 'postBody', 'grammar', 'revalidation']

describe('SPEC0241 A — closed reason list, pure premises and unchanged limits', () => {
  it('A1 the per-edge list equals SPEC0241 §3.1 exactly and global classes stay global', async () => {
    const e = await import(ENGINE)
    expect([...e.CONTAINED_EDGE_REASONS].sort()).toEqual(
      [...SPEC_PER_EDGE].sort()
    )
    expect(Object.isFrozen(e.CONTAINED_EDGE_REASONS)).toBe(true)
    for (const reason of SPEC_PER_EDGE) {
      expect(e.containedEdgeReason(reason)).toBe(reason)
      expect(e.containedEdgeReason(reason + ':some/file.mjs')).toBe(reason)
    }
    for (const message of [
      'UNKNOWN_ANALYSIS_LIMIT:maxStates',
      'UNKNOWN_ANALYSIS_LIMIT:timeoutMs',
      'UNKNOWN_RESOLUTION_LIMIT:maxLinks',
      'UNKNOWN_INPUT_MUTATION:a.mjs',
      'UNKNOWN_RESOLUTION_MUTATION:a.mjs',
      'UNKNOWN_ROOT_MUTATION',
      'UNKNOWN_INVALID_SNAPSHOT',
      'UNKNOWN_ROOT',
      'UNKNOWN_ROOT_ALIAS',
      'UNKNOWN_ROOT_ACQUISITION',
      'UNKNOWN_CLOSED_SESSION',
      'UNKNOWN_ACQUISITION_PLATFORM',
      'UNKNOWN_ACQUISITION_CLOSE',
      'UNKNOWN_RUNTIME_PROFILE',
      'UNKNOWN_INVALID_LIMITS',
      'UNKNOWN_CENSUS_MODE',
      'UNKNOWN_PRODUCT_CALLBACK',
      'UNKNOWN_NEGATIVE_CALLBACK',
      'UNKNOWN_TOOLCHAIN',
      'UNKNOWN_INVALID_INPUT',
      'UNKNOWN_INVALID_PROOF',
      'UNKNOWN_INVALID_WORKER_RESULT',
      'UNKNOWN_WORKER_ARGUMENTS',
      'UNKNOWN_ACQUISITION_EMFILE:a.mjs',
      'UNKNOWN_ACQUISITION_ENFILE',
      'UNKNOWN_ACQUISITION_EIO:a.mjs',
      'UNKNOWN_ACQUISITION_IO',
      'Unexpected token } in JSON at position 3',
      'Maximum call stack size exceeded',
      ''
    ])
      expect(e.containedEdgeReason(message), message).toBe(null)
  })
  it('A2 limits, profiles and the census are unchanged; the kernel is v4', async () => {
    const e = await import(ENGINE)
    const r = await import(
      path.join(SCRIPTS, 'boundary-semantic-resolution.mjs')
    )
    expect(e.SEMANTIC_KERNEL_VERSION).toBe(KERNEL)
    expect({ ...e.SEMANTIC_LIMITS }).toEqual({
      maxFileBytes: 16 * 1024 ** 2,
      maxTotalBytes: 256 * 1024 ** 2,
      maxFiles: 12000,
      maxNodes: 2000000,
      maxUnionValues: 128,
      // SPEC0242 L1/L2 (literal migration of A2).
      maxContexts: 256,
      maxCallDepth: 64,
      maxStates: 250000,
      timeoutMs: 300000
    })
    expect({ ...r.RESOLUTION_LIMITS }).toEqual({
      maxWorkspaces: 512,
      maxLinks: 512,
      maxLinkBytes: 4096,
      maxPathComponents: 64,
      maxOpenDescriptors: 72
    })
    expect(r.RESOLUTION_PROFILE).toBe('node22-linux-exact-metadata-v1')
    expect(r.REFUSAL_CENSUS_PROFILE).toBe('node22-linux-v2-refusal-census-v1')
  })
  it('A3 the installed key has one physical derivation (last node_modules)', async () => {
    const e = await import(ENGINE)
    expect(e.installedPackageKey('node_modules/a/dist/i.js')).toEqual({
      key: 'node_modules/a',
      relative: 'dist/i.js'
    })
    expect(e.installedPackageKey('node_modules/@s/a/lib/i.js')).toEqual({
      key: 'node_modules/@s/a',
      relative: 'lib/i.js'
    })
    expect(
      e.installedPackageKey('node_modules/a/node_modules/b/dist/i.js')
    ).toEqual({ key: 'node_modules/a/node_modules/b', relative: 'dist/i.js' })
    expect(e.installedPackageKey('node_modules/.vite/deps/i.js')).toEqual({
      key: 'node_modules/.vite',
      relative: 'deps/i.js'
    })
    expect(e.installedPackageKey('packages/x/dist/i.js')).toBe(null)
    expect(e.installedPackageKey('node_modules/@s/i.js')).toEqual({
      key: 'node_modules/@s/i.js',
      relative: ''
    })
  })
  it('A4 the pure premise refuses every failed premise, including a divergent owner key', async () => {
    const e = await import(ENGINE)
    const root = fixture('premise', {
      'node_modules/p/package.json': pkg('p'),
      'node_modules/p/dist/i.js': 'export default 1\n'
    }).root
    const rec = identity(root, 'node_modules/p')
    const sha256 = hash(
      fs.readFileSync(path.join(root, 'node_modules/p/dist/i.js'))
    )
    const ok = {
      file: 'node_modules/p/dist/i.js',
      sha256,
      installed: [rec]
    }
    expect(e.installedFilePremise(ok)).toEqual({
      ok: true,
      record: {
        file: 'node_modules/p/dist/i.js',
        key: 'node_modules/p',
        inventorySha256: rec.inventorySha256,
        sha256
      }
    })
    const why = (patch) => e.installedFilePremise({ ...ok, ...patch }).category
    expect(why({ ownerKey: 'node_modules/other' })).toBe('OWNER_KEY')
    expect(why({ ownerKey: 'node_modules/p' })).toBe(undefined)
    expect(why({ installed: [] })).toBe('PACKAGE_IDENTITY')
    for (const identityStatus of ['MISMATCH', 'UNAVAILABLE', 'UNSUPPORTED'])
      expect(why({ installed: [{ ...rec, identityStatus }] })).toBe(
        'PACKAGE_IDENTITY'
      )
    expect(why({ installed: [{ ...rec, referenceDigest: null }] })).toBe(
      'PACKAGE_IDENTITY'
    )
    expect(
      why({ installed: [{ ...rec, manifest: 'node_modules/p/x.json' }] })
    ).toBe('PACKAGE_IDENTITY')
    expect(why({ installed: [{ ...rec, inventory: null }] })).toBe(
      'INVENTORY_UNAVAILABLE'
    )
    expect(why({ installed: [{ ...rec, inventorySha256: null }] })).toBe(
      'INVENTORY_UNAVAILABLE'
    )
    expect(
      why({ installed: [{ ...rec, inventorySha256: 'b'.repeat(64) }] })
    ).toBe('INVENTORY_DIGEST')
    expect(why({ sha256: 'c'.repeat(64) })).toBe('ENTRY_SHA256')
    expect(why({ file: 'node_modules/p/dist/missing.js' })).toBe(
      'ENTRY_MISSING'
    )
    expect(why({ file: 'node_modules/p/dist' })).toBe('ENTRY_TYPE')
    expect(why({ file: 'packages/p/dist/i.js' })).toBe('PACKAGE_KEY')
    const unsorted = structuredClone(rec)
    unsorted.inventory.entries.reverse()
    unsorted.inventorySha256 = hash(canonicalJson(unsorted.inventory))
    expect(why({ installed: [unsorted] })).toBe('INVENTORY_INVALID')
  })
})

describe('SPEC0241 B — IB02 containment pairs keep measuring the body', () => {
  it('B1 C1/C2/X2: later body entries appear, contained tuple on the importer, zero proofs', () => {
    const c1 = fixture(
      'c1',
      {
        'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
        'b.mjs': 'export const x = missingGlobal\n'
      },
      { starts: ['a.mjs', 'b.mjs'] }
    )
    const c2 = fixture('c2', {
      'entry.mjs':
        "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n"
    })
    const x2 = fixture(
      'x2',
      {
        'a.mjs':
          "const m = { p: './missing.mjs' }\nimport(m.p)\nexport const after = missingGlobal\n"
      },
      { starts: ['a.mjs'] }
    )
    const [o1, o2, o3] = batch(
      [c1, c2, x2].map((input) => ({
        method: 'runSemanticBoundary',
        args: [input]
      }))
    )
    for (const out of [o1, o2, o3]) {
      expect(out.kernelVersion).toBe(KERNEL)
      expect(out.status).toBe('UNKNOWN')
      expect(out.proofs).toEqual([])
      expect(out.validation.valid).toBe(true)
      expect(out.phases.body).toBe('COMPLETED')
      expect(out.phases.postBody).toBe('COMPLETED')
      expect(out.phases.revalidation).toBe('COMPLETED')
      expect(out.bodyCoverage.containedEdges).toBeGreaterThanOrEqual(1)
      expect(out.bodyCoverage.modules.completed).toBe(
        out.bodyCoverage.modules.started
      )
    }
    expect(asSet(tuples(o1))).toEqual(
      asSet([
        ['a.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN'],
        ['b.mjs', 'UNKNOWN_BINDING', 'missingGlobal'],
        ['b.mjs', 'UNKNOWN_EXPORT', '']
      ])
    )
    expect(asSet(tuples(o2))).toEqual(
      asSet([
        ['entry.mjs', 'UNKNOWN_BINDING', 'missingGlobal'],
        ['entry.mjs', 'UNKNOWN_BINDING_VALUE', 'y'],
        ['entry.mjs', 'UNKNOWN_EXPORT', ''],
        ['entry.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
      ])
    )
    // The target-attributed tuple persists unchanged (§3.5 exception 1).
    expect(tuples(o3)).toEqual(
      expect.arrayContaining([
        [
          'missing.mjs',
          'UNKNOWN_ACQUISITION_ENOENT',
          'UNKNOWN_ACQUISITION_ENOENT:missing.mjs'
        ],
        ['a.mjs', 'UNKNOWN_BINDING', 'missingGlobal'],
        ['a.mjs', 'UNKNOWN_DYNAMIC_IMPORT_PROMISE', '']
      ])
    )
    expect(o1.unknowns.some((u) => u.file === '')).toBe(false)
  })
  it('B2 a module closed except for one contained edge is never PROVEN', () => {
    const out = run(
      fixture('closed-but-one', {
        'entry.mjs': "import fs from 'node:fs'\nexport const y = 1\n"
      })
    )
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toEqual([])
    expect(out.installed).toEqual([])
    expect(tuples(out)).toEqual([
      ['entry.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
    ])
  })
  it('B3 X3: after a contained edge the unreached installed record appears and post-body completes', () => {
    const files = {
      'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
      'node_modules/pkgu/package.json': pkg('pkgu', {
        exports: './lib/index.js'
      }),
      'node_modules/pkgu/lib/index.js': 'export default 1\n'
    }
    const f = fixture('x3', files, { starts: ['a.mjs'] })
    f.installed = [identity(f.root, 'node_modules/pkgu')]
    const out = run(f)
    expect(out.phases.postBody).toBe('COMPLETED')
    expect(
      has(
        out,
        'node_modules/pkgu/package.json',
        'UNKNOWN_UNREACHED_INSTALLED_ENTRY'
      )
    ).toBe(true)
    expect(has(out, 'a.mjs', 'UNKNOWN_NATIVE_BUILTIN')).toBe(true)
    expect(out.proofs).toEqual([])
  })
})

// Physical fixtures, one per reason reachable through a body edge of the
// frozen helper; the statement after the edge must still be measured.
const REASONS = [
  ['UNKNOWN_RESOLUTION', 'entry.mjs', { spec: 'missingpkg' }],
  ['UNKNOWN_NATIVE_BUILTIN', 'entry.mjs', { spec: 'node:fs' }],
  ['UNKNOWN_EXTERNAL_PATH', 'entry.mjs', { spec: '../outside.mjs' }],
  [
    'UNKNOWN_FORMAT',
    'data.json',
    { spec: './data.json', files: { 'data.json': '{}' } }
  ],
  [
    'UNKNOWN_MODULE_INTEROP',
    'a.cjs',
    { spec: './a.cjs', files: { 'a.cjs': 'module.exports=1\n' } }
  ],
  [
    'UNKNOWN_AMBIGUOUS_RESOLUTION',
    'entry.mjs',
    {
      spec: 'pb',
      files: {
        'node_modules/pb/package.json': pkg('pb', {
          browser: './i.js',
          exports: './i.js'
        }),
        'node_modules/pb/i.js': 'export default 1\n'
      }
    }
  ],
  [
    'UNKNOWN_UNSUPPORTED_EXPORTS',
    'entry.mjs',
    {
      spec: 'pu',
      files: { 'node_modules/pu/package.json': pkg('pu', { exports: 5 }) }
    }
  ],
  [
    'UNKNOWN_UNRESOLVED_EXPORT',
    'entry.mjs',
    {
      spec: 'pr',
      files: {
        'node_modules/pr/package.json': pkg('pr', {
          exports: { './x': './x.js' }
        })
      }
    }
  ],
  [
    'UNKNOWN_BLOCKED_EXPORT',
    'entry.mjs',
    {
      spec: 'pn',
      files: {
        'node_modules/pn/package.json': pkg('pn', { exports: { '.': null } })
      }
    }
  ],
  [
    'UNKNOWN_EXPORTS_DEPTH',
    'entry.mjs',
    {
      spec: 'pd',
      files: {
        'node_modules/pd/package.json': pkg('pd', {
          exports: Array.from({ length: 66 }).reduce(
            (v) => ({ import: v }),
            './x.mjs'
          )
        })
      }
    }
  ],
  [
    'UNKNOWN_EXACT_EXPORTS_TARGET',
    'entry.cjs',
    {
      spec: 'pe',
      require: true,
      files: {
        'node_modules/pe/package.json': {
          name: 'pe',
          version: '1.0.0',
          exports: { require: './main' }
        },
        'node_modules/pe/main.js': 'module.exports=1\n'
      }
    }
  ],
  [
    'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION',
    'entry.mjs',
    { spec: './a b.mjs', files: { 'a b.mjs': 'export default 1\n' } }
  ],
  [
    'UNKNOWN_PACKAGE_SELF_REFERENCE',
    'entry.mjs',
    { spec: 'fixture-root', rootPkg: { ...ROOTPKG, exports: './entry.mjs' } }
  ],
  [
    'UNKNOWN_PACKAGE_SCOPE',
    'node_modules',
    {
      spec: './node_modules/stray/a.mjs',
      files: { 'node_modules/stray/a.mjs': 'export default 1\n' }
    }
  ],
  [
    'UNKNOWN_PACKAGE_NAME',
    'node_modules/pm',
    {
      spec: 'pm',
      files: {
        'node_modules/pm/package.json': pkg('other', { exports: './i.js' }),
        'node_modules/pm/i.js': 'export default 1\n'
      }
    }
  ],
  [
    'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST',
    'node_modules/pw',
    { spec: 'pw', files: { 'node_modules/pw/i.js': 'export default 1\n' } }
  ],
  [
    'UNKNOWN_CJS_FILE_PACKAGE',
    'entry.cjs',
    {
      spec: 'pc',
      require: true,
      files: {
        'node_modules/pc/package.json': {
          name: 'pc',
          version: '1.0.0',
          main: './i.js'
        },
        'node_modules/pc/i.js': 'module.exports=1\n',
        'node_modules/pc.js': 'module.exports=2\n'
      }
    }
  ],
  [
    'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY',
    'entry.mjs',
    {
      spec: 'pa',
      files: {
        'node_modules/pa/package.json': pkg('pa', {
          exports: 'file:///etc/x.js'
        })
      }
    }
  ],
  [
    'UNKNOWN_WORKSPACE_CONFIG',
    'entry.mjs',
    {
      spec: 'wsx',
      files: {
        'packages/wsx/package.json': pkg('wsx', { exports: './i.js' }),
        'packages/wsx/i.js': 'export default 1\n'
      },
      links: { 'node_modules/wsx': '../packages/wsx' }
    }
  ],
  [
    'UNKNOWN_WORKSPACE_LINK',
    'node_modules/wl',
    {
      spec: 'wl',
      files: {
        'elsewhere/wl/package.json': pkg('wl', { exports: './i.js' }),
        'elsewhere/wl/i.js': 'export default 1\n'
      },
      links: { 'node_modules/wl': '../elsewhere/wl' }
    }
  ],
  [
    'UNKNOWN_SYMLINK',
    'link.mjs',
    {
      spec: './link.mjs',
      files: { 'real.mjs': 'export default 1\n' },
      links: { 'link.mjs': 'real.mjs' }
    }
  ],
  [
    'UNKNOWN_ANCESTOR_SYMLINK',
    'node_modules',
    {
      spec: 'ps',
      files: {
        'nm-real/ps/package.json': pkg('ps', { exports: './i.js' }),
        'nm-real/ps/i.js': 'export default 1\n'
      },
      links: { node_modules: 'nm-real' }
    }
  ],
  [
    'UNKNOWN_ANCESTOR_FORMAT',
    'node_modules',
    { spec: 'pf', files: { node_modules: 'not a directory\n' } }
  ],
  [
    'UNKNOWN_METADATA_ENCODING',
    'node_modules/pme',
    { spec: 'pme', links: { 'node_modules/pme': 'bad\u0001target' } }
  ],
  [
    'UNKNOWN_INPUT_ENCODING',
    'bad.mjs',
    {
      spec: './bad.mjs',
      files: { 'bad.mjs': Buffer.from([0x65, 0x78, 0xc3, 0x28]) },
      reported: 'UNKNOWN_ENCODING'
    }
  ],
  [
    'UNKNOWN_INVALID_MANIFEST',
    'node_modules/pi/package.json',
    { spec: 'pi', files: { 'node_modules/pi/package.json': '{not json' } }
  ],
  [
    'UNKNOWN_PRODUCT_TARGET',
    'products/x.mjs',
    {
      spec: './products/x.mjs',
      files: { 'products/x.mjs': 'export default 1\n' }
    }
  ],
  ['UNKNOWN_ACQUISITION_ENOENT', 'missing.mjs', { spec: './missing.mjs' }],
  [
    'UNKNOWN_ACQUISITION_EACCES',
    'locked.mjs',
    {
      spec: './locked.mjs',
      files: { 'locked.mjs': 'export default 1\n' },
      chmod: { 'locked.mjs': 0 }
    }
  ]
]
// Reachable only from an OS fault on open(); injected on a body-only edge.
const FAULTED = ['ENOTDIR', 'ELOOP', 'EISDIR']
// Unreachable by construction of the frozen helper (asciiPart/URL/link checks
// run first); covered by the closed classifier (A1) and the generic path.
const CLASSIFIER_ONLY = [
  'UNKNOWN_TARGET_URL',
  'UNKNOWN_PACKAGE_ESCAPE',
  'UNKNOWN_LINK_FORMAT',
  'UNKNOWN_PATH'
]

describe('SPEC0241 C — IB03 every listed reason is contained, every global class is not', () => {
  it('C0 the physical, faulted and classifier-only sets partition the SPEC list', () => {
    const covered = [
      ...REASONS.map((x) => x[0]),
      ...FAULTED.map((x) => 'UNKNOWN_ACQUISITION_' + x),
      ...CLASSIFIER_ONLY
    ].sort()
    expect(covered).toEqual([...SPEC_PER_EDGE].sort())
  })
  it('C1 each physically reachable reason is contained on a body edge and the next statement is measured', () => {
    const inputs = REASONS.map(([reason, , c]) =>
      fixture(
        'reason-' + reason.toLowerCase(),
        {
          ...(c.files || {}),
          [c.require ? 'entry.cjs' : 'entry.mjs']: c.require
            ? requireEntry(c.spec)
            : importEntry(c.spec)
        },
        {
          links: c.links,
          chmod: c.chmod,
          rootPkg: c.rootPkg,
          starts: [c.require ? 'entry.cjs' : 'entry.mjs']
        }
      )
    )
    const outs = batch(
      inputs.map((input) => ({ method: 'runSemanticBoundary', args: [input] }))
    )
    REASONS.forEach(([reason, file, c], i) => {
      const out = outs[i],
        importer = c.require ? 'entry.cjs' : 'entry.mjs',
        reported = c.reported || reason
      const label = reason + ' ' + JSON.stringify(tuples(out))
      expect(has(out, file, reported), label).toBe(true)
      expect(
        has(out, importer, 'UNKNOWN_BINDING', 'missingGlobal'),
        label
      ).toBe(true)
      expect(
        out.unknowns.some((u) => u.file === '' && u.reason === reported),
        label
      ).toBe(false)
      expect(out.phases.body, label).toBe('COMPLETED')
      expect(out.bodyCoverage.containedEdges, label).toBeGreaterThanOrEqual(1)
      expect(out.proofs, label).toEqual([])
      expect(out.validation.valid, label).toBe(true)
      expect(out.status, label).toBe(
        reason === 'UNKNOWN_PRODUCT_TARGET' ? 'VIOLATION' : 'UNKNOWN'
      )
    })
  }, 600000)
  it.each(FAULTED)(
    'C2 injected OS %s on a body-only edge is contained',
    (code) => {
      const f = fixture('fault-' + code.toLowerCase(), {
        'entry.mjs': bodyOnly('./victim.mjs'),
        'victim.mjs': 'export default 1\n'
      })
      const out = analyze(f, { fault: { leaf: 'victim.mjs', at: 1, code } })
      expect(
        has(out, 'victim.mjs', 'UNKNOWN_ACQUISITION_' + code),
        JSON.stringify(tuples(out))
      ).toBe(true)
      expect(has(out, 'entry.mjs', 'UNKNOWN_BINDING', 'missingGlobal')).toBe(
        true
      )
      expect(out.phases.body).toBe('COMPLETED')
      expect(out.phases.postBody).toBe('COMPLETED')
    },
    120000
  )
  it.each(['EMFILE', 'EIO'])(
    'C3 injected OS %s outside the list stays global with phases declared',
    (code) => {
      const f = fixture('global-' + code.toLowerCase(), {
        'entry.mjs': bodyOnly('./victim.mjs'),
        'victim.mjs': 'export default 1\n'
      })
      const out = analyze(f, { fault: { leaf: 'victim.mjs', at: 1, code } })
      expect(has(out, 'victim.mjs', 'UNKNOWN_ACQUISITION_' + code)).toBe(true)
      expect(has(out, 'entry.mjs', 'UNKNOWN_BINDING', 'missingGlobal')).toBe(
        false
      )
      expect(out.phases.acquisition).toBe('COMPLETED')
      expect(out.phases.body).toBe('SKIPPED:UNKNOWN_ACQUISITION_' + code)
      expect(out.phases.postBody).toBe('SKIPPED:UNKNOWN_ACQUISITION_' + code)
      expect(out.bodyCoverage.containedEdges).toBe(0)
    },
    120000
  )
  it('C4 mutation during a body edge stays global', () => {
    const f = fixture('global-mutation', {
      'entry.mjs': bodyOnly('./victim.mjs'),
      'victim.mjs': 'export default 1\n'
    })
    const out = analyze(f, {
      fault: {
        leaf: 'victim.mjs',
        at: 1,
        rewrite: {
          path: path.join(f.root, 'victim.mjs'),
          data: 'export default 22\n'
        }
      }
    })
    expect(has(out, 'victim.mjs', 'UNKNOWN_INPUT_MUTATION')).toBe(true)
    expect(out.phases.body).toBe('SKIPPED:UNKNOWN_INPUT_MUTATION')
    expect(has(out, 'entry.mjs', 'UNKNOWN_BINDING', 'missingGlobal')).toBe(
      false
    )
  }, 120000)
  it('C5 resolution limits, analysis limits, root alias and profile errors stay global with phases declared', () => {
    const links = fixture(
      'global-links',
      {
        'package.json': { ...ROOTPKG, workspaces: ['packages/*'] },
        'packages/ws/package.json': pkg('ws', { exports: './i.js' }),
        'packages/ws/i.js': 'export default 1\n',
        'entry.mjs': importEntry('ws')
      },
      {
        links: { 'node_modules/ws': '../packages/ws' },
        resolutionLimits: { maxLinks: 0 }
      }
    )
    const nodes = fixture(
      'global-nodes',
      { 'entry.mjs': 'export default 1\n' },
      { limits: { maxNodes: 1 } }
    )
    const realRoot = fixture('global-root', {
      'entry.mjs': 'export default 1\n'
    })
    const alias = path.join(PARENT, 'alias-' + path.basename(realRoot.root))
    fs.symlinkSync(realRoot.root, alias)
    const [l, n, a] = batch(
      [links, nodes, { ...realRoot, root: alias }].map((input) => ({
        method: 'runSemanticBoundary',
        args: [input]
      }))
    )
    expect(has(l, '', 'UNKNOWN_RESOLUTION_LIMIT')).toBe(true)
    expect(l.phases.body).toBe('SKIPPED:UNKNOWN_RESOLUTION_LIMIT')
    expect(has(l, 'entry.mjs', 'UNKNOWN_BINDING', 'missingGlobal')).toBe(false)
    expect(has(n, '', 'UNKNOWN_ANALYSIS_LIMIT')).toBe(true)
    expect(n.phases.acquisition).toBe('SKIPPED:UNKNOWN_ANALYSIS_LIMIT')
    expect(n.phases.body).toBe('SKIPPED:UNKNOWN_ANALYSIS_LIMIT')
    for (const phase of PHASES)
      expect(a.phases[phase]).toBe('SKIPPED:UNKNOWN_ROOT_ALIAS')
    const invalid = analyze({ ...realRoot, limits: { bogus: 1 } })
    for (const phase of PHASES)
      expect(invalid.phases[phase]).toBe('SKIPPED:UNKNOWN_INVALID_LIMITS')
    expect(invalid.bodyCoverage.containedEdges).toBe(0)
    const profile = analyze(realRoot, { flags: ['--no-warnings'] })
    expect(has(profile, '', 'UNKNOWN_RUNTIME_PROFILE')).toBe(true)
    for (const phase of PHASES)
      expect(profile.phases[phase]).toBe('SKIPPED:UNKNOWN_RUNTIME_PROFILE')
    const timeout = analyze({ ...realRoot, limits: { timeoutMs: 0 } })
    expect(
      has(
        timeout,
        '',
        'UNKNOWN_ANALYSIS_LIMIT',
        'UNKNOWN_ANALYSIS_LIMIT:timeoutMs'
      )
    ).toBe(true)
    expect(timeout.phases.body).toBe('SKIPPED:UNKNOWN_ANALYSIS_LIMIT')
  }, 300000)
})

describe('SPEC0241 D — IB04 body-only product edges are all reported', () => {
  it('D1 X1/C6 and an edge after a throwing edge: every violation, FAIL', () => {
    const x1 = fixture(
      'x1',
      {
        'b.mjs':
          "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n",
        'c.mjs':
          "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n",
        'products/x.mjs': 'export default 1\n',
        'products/y.mjs': 'export default 1\n',
        'products/z.mjs': 'export default 1\n'
      },
      { starts: ['b.mjs', 'c.mjs'] }
    )
    const c6 = fixture(
      'c6',
      {
        'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
        'b.mjs':
          "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n",
        'products/x.mjs': 'export default 1\n'
      },
      { starts: ['a.mjs', 'b.mjs'] }
    )
    const same = fixture('after-throw', {
      'entry.mjs':
        "import fs from 'node:fs'\nconst m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n",
      'products/x.mjs': 'export default 1\n'
    })
    const [a, b, c] = batch(
      [x1, c6, same].map((input) => ({
        method: 'runSemanticBoundary',
        args: [input]
      }))
    )
    expect(a.status).toBe('VIOLATION')
    expect(a.violations).toEqual([
      { file: 'b.mjs', reason: 'PRODUCT_DEPENDENCY', target: 'products/x.mjs' },
      { file: 'b.mjs', reason: 'PRODUCT_DEPENDENCY', target: 'products/y.mjs' },
      { file: 'c.mjs', reason: 'PRODUCT_DEPENDENCY', target: 'products/z.mjs' }
    ])
    expect(b.status).toBe('VIOLATION')
    expect(b.violations).toEqual([
      { file: 'b.mjs', reason: 'PRODUCT_DEPENDENCY', target: 'products/x.mjs' }
    ])
    expect(c.status).toBe('VIOLATION')
    expect(c.violations).toEqual([
      {
        file: 'entry.mjs',
        reason: 'PRODUCT_DEPENDENCY',
        target: 'products/x.mjs'
      }
    ])
    for (const out of [a, b, c]) {
      expect(out.proofs).toEqual([])
      expect(out.phases.body).toBe('COMPLETED')
    }
  }, 300000)
})

describe('SPEC0241 E — IB05 deterministic body cut by each counter', () => {
  const files = {
    'a.mjs':
      "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport const u = missingA\n",
    'b.mjs':
      "function f(x) { return x }\nconst r1 = f(1)\nconst r2 = f(2)\nfunction g(y) { return f(y) }\nconst r3 = g(3)\nconst c = {}\nconst s = c ? 'left' : 'right'\nexport default 1\n",
    'products/x.mjs': 'export default 1\n',
    'node_modules/pkgu/package.json': pkg('pkgu', { exports: './i.js' }),
    'node_modules/pkgu/i.js': 'export default 1\n'
  }
  const caps = ['maxStates', 'maxContexts', 'maxCallDepth', 'maxUnionValues']
  const usageKey = {
    maxStates: 'states',
    maxContexts: 'contexts',
    maxCallDepth: 'callDepth',
    maxUnionValues: 'unionValues'
  }
  it('E1 each cap cuts only the body, keeps prior findings, runs post-body and revalidation; positive at the cap', () => {
    const base = fixture('cut-base', files, { starts: ['a.mjs', 'b.mjs'] })
    base.installed = [identity(base.root, 'node_modules/pkgu')]
    const free = run(base)
    expect(free.phases.body).toBe('COMPLETED')
    const inputs = []
    for (const cap of caps) {
      const used = free.usage[usageKey[cap]]
      expect(used, cap).toBeGreaterThan(0)
      inputs.push({ ...base, limits: { [cap]: used - 1 } })
      inputs.push({ ...base, limits: { [cap]: used } })
    }
    const outs = batch(
      [...inputs, ...inputs.slice(0, 2)].map((input) => ({
        method: 'runSemanticBoundary',
        args: [input]
      }))
    )
    caps.forEach((cap, i) => {
      const cut = outs[2 * i],
        at = outs[2 * i + 1]
      const label = cap + ' ' + JSON.stringify(cut.phases)
      expect(
        has(cut, '', 'UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_ANALYSIS_LIMIT:' + cap),
        label
      ).toBe(true)
      expect(cut.phases.body, label).toBe('CUT:' + cap)
      expect(cut.phases.postBody, label).toBe('COMPLETED')
      expect(cut.phases.revalidation, label).toBe('COMPLETED')
      expect(cut.validation.valid, label).toBe(true)
      expect(
        has(
          cut,
          'node_modules/pkgu/package.json',
          'UNKNOWN_UNREACHED_INSTALLED_ENTRY'
        ),
        label
      ).toBe(true)
      expect(has(cut, 'a.mjs', 'UNKNOWN_BINDING', 'missingA'), label).toBe(true)
      expect(cut.violations, label).toEqual([
        {
          file: 'a.mjs',
          reason: 'PRODUCT_DEPENDENCY',
          target: 'products/x.mjs'
        }
      ])
      expect(cut.status, label).toBe('VIOLATION')
      expect(at.phases.body, cap).toBe('COMPLETED')
      expect(
        at.unknowns.some((u) => u.reason === 'UNKNOWN_ANALYSIS_LIMIT'),
        cap
      ).toBe(false)
    })
    // The worker recomputation reproduces the cut: two runs are identical.
    expect(comparable(outs[8])).toEqual(comparable(outs[0]))
    expect(comparable(outs[9])).toEqual(comparable(outs[1]))
  }, 600000)
  it('E2 timeoutMs stays global: the parent envelope replaces the result and phases are null', () => {
    const f = fixture(
      'cut-timeout',
      { 'entry.mjs': 'export default 1\n' },
      { limits: { timeoutMs: 1 } }
    )
    const out = run(f)
    expect(tuples(out)).toEqual([['', 'UNKNOWN_ANALYSIS_LIMIT', 'timeoutMs']])
    expect(out.phases).toBe(null)
    expect(out.bodyCoverage).toBe(null)
  }, 120000)
})

describe('SPEC0241 F — IB06 UNKNOWN_FUNCTION by closed category', () => {
  it('F1 every category of every function, one entry per file and category', () => {
    const all = fixture('fn-all', {
      'entry.mjs':
        'async function a() {}\nasync function a2() {}\nfunction* b() {}\nfunction c({ x }) { return x }\nfunction d(...r) { return r }\nfunction e(p = 1) { return p }\nasync function* all({ y }, q = 2, ...z) { return z }\nexport default 1\n'
    })
    const noBody = fixture(
      'fn-nobody',
      { 'entry.mts': 'declare function f(): void\nexport default 1\n' },
      { starts: ['entry.mts'] }
    )
    const anonymous = fixture('fn-anon', {
      'entry.mjs': 'function () { return 1 }\nexport default 1\n'
    })
    const plain = fixture('fn-plain', {
      'entry.mjs': 'function unused(a) { return a }\nexport default 1\n'
    })
    const asyncC4 = fixture('fn-c4-async', {
      'entry.mjs': 'async function unused() {}\nexport default 1\n'
    })
    const defaultC4 = fixture('fn-c4-default', {
      'entry.mjs': 'function unused(a = 1) { return a }\nexport default 1\n'
    })
    const [o1, o2, o3, o4, o5, o6] = batch(
      [all, noBody, anonymous, plain, asyncC4, defaultC4].map((input) => ({
        method: 'runSemanticBoundary',
        args: [input]
      }))
    )
    const fn = (out) =>
      out.unknowns
        .filter((u) => u.reason === 'UNKNOWN_FUNCTION')
        .map((u) => [u.file, u.detail])
    expect(fn(o1)).toEqual([
      ['entry.mjs', 'ASYNC'],
      ['entry.mjs', 'GENERATOR'],
      ['entry.mjs', 'PARAMETER_INITIALIZER'],
      ['entry.mjs', 'PARAMETER_PATTERN'],
      ['entry.mjs', 'PARAMETER_REST']
    ])
    expect(fn(o2)).toEqual([['entry.mts', 'NO_BODY']])
    // The pinned TS 6.0.3 parser gives an unnamed declaration an empty
    // identifier, so the v3 anonymous-declaration branch (now detailed as
    // ANONYMOUS_DECLARATION) is not reached; the moment of refusal is not
    // widened (§3.3): the file stays UNKNOWN by UNKNOWN_PARSE, never proved.
    expect(fn(o3)).toEqual([])
    expect(has(o3, 'entry.mjs', 'UNKNOWN_PARSE')).toBe(true)
    expect(o4.status).toBe('PROVEN')
    expect(fn(o5)).toEqual([['entry.mjs', 'ASYNC']])
    expect(fn(o6)).toEqual([['entry.mjs', 'PARAMETER_INITIALIZER']])
    for (const out of [o1, o2, o3, o5, o6]) expect(out.status).toBe('UNKNOWN')
  }, 300000)
})

describe('SPEC0241 G — IB07/IB08 installed file identity (D2)', () => {
  const dist = (sub = 'dist') => ({
    'entry.mjs': "import v from 'pkgd'\nexport default v\n",
    'node_modules/pkgd/package.json': pkg('pkgd', {
      exports: './' + sub + '/index.js'
    }),
    ['node_modules/pkgd/' + sub + '/index.js']: 'export default 1\n'
  })
  it('G1 MATCH + recomputed inventory + equal entry proves installed dist and lib alike, with the premise in the trace', () => {
    const d = fixture('d2-dist', dist('dist'))
    d.installed = [identity(d.root, 'node_modules/pkgd')]
    const l = fixture('d2-lib', dist('lib'))
    l.installed = [identity(l.root, 'node_modules/pkgd')]
    const [od, ol] = batch(
      [d, l].map((input) => ({ method: 'runSemanticBoundary', args: [input] }))
    )
    for (const [out, sub] of [
      [od, 'dist'],
      [ol, 'lib']
    ]) {
      const file = 'node_modules/pkgd/' + sub + '/index.js'
      expect(out.status, JSON.stringify(tuples(out))).toBe('PROVEN')
      expect(out.installed).toEqual([
        expect.objectContaining({ key: 'node_modules/pkgd', status: 'PROVEN' })
      ])
      expect(out.installedFileIdentity.premise).toBe(PREMISE)
      const record = out.installedFileIdentity.files.find(
        (x) => x.file === file
      )
      expect(record).toEqual({
        file,
        key: 'node_modules/pkgd',
        inventorySha256: (sub === 'dist' ? d : l).installed[0].inventorySha256,
        sha256: hash('export default 1\n')
      })
      const proof = out.proofs.find((x) => x.file === file)
      expect(proof.derivation.installedFileIdentity).toEqual(record)
      expect(proof.derivation.profile.kernelVersion).toBe(KERNEL)
      expect(proof.derivation.profile.installedFileIdentityPremise).toBe(
        PREMISE
      )
      expect(proof.derivation.profile.installedIdentitySha256).toBe(
        hash(fs.readFileSync(IDENTITY))
      )
      expect(
        out.proofs.find((x) => x.file === 'entry.mjs').derivation
          .installedFileIdentity
      ).toBe(null)
      expect(out.unknowns).toEqual([])
    }
  }, 300000)
  it('G2 every failed premise stays UNKNOWN_INSTALLED_FILE_IDENTITY, with no receipt authority', () => {
    const file = 'node_modules/pkgd/dist/index.js'
    const cases = []
    const add = (name, build, category, extra = () => {}) => {
      const f = fixture('d2-' + name, dist('dist'))
      build(f)
      cases.push({ name, f, category, extra })
    }
    const drop = (body) => ({
      ...body,
      entries: body.entries.filter((e) => e.path !== 'dist/index.js')
    })
    const retype = (type) => (body) => ({
      ...body,
      entries: body.entries.map((e) =>
        e.path === 'dist/index.js'
          ? type === 'link'
            ? { path: e.path, type, target: 'x', resolution: '/x' }
            : { path: e.path, type }
          : e
      )
    })
    add(
      'absent-entry',
      (f) =>
        (f.installed = [
          identity(f.root, 'node_modules/pkgd', { mutate: drop })
        ]),
      'ENTRY_MISSING'
    )
    add(
      'divergent-sha',
      (f) => {
        f.installed = [identity(f.root, 'node_modules/pkgd')]
        write(f.root, file, 'export default 2\n')
      },
      'ENTRY_SHA256'
    )
    add(
      'link-entry',
      (f) =>
        (f.installed = [
          identity(f.root, 'node_modules/pkgd', { mutate: retype('link') })
        ]),
      'ENTRY_TYPE'
    )
    add(
      'directory-entry',
      (f) =>
        (f.installed = [
          identity(f.root, 'node_modules/pkgd', { mutate: retype('directory') })
        ]),
      'ENTRY_TYPE'
    )
    add(
      'inventory-digest',
      (f) =>
        (f.installed = [
          identity(f.root, 'node_modules/pkgd', { digest: 'b'.repeat(64) })
        ]),
      'INVENTORY_DIGEST'
    )
    for (const status of ['MISMATCH', 'UNAVAILABLE'])
      add(
        'package-' + status.toLowerCase(),
        (f) =>
          (f.installed = [identity(f.root, 'node_modules/pkgd', { status })]),
        'PACKAGE_IDENTITY'
      )
    add('package-absent', () => {}, 'PACKAGE_IDENTITY')
    add(
      'receipt-cites-installed',
      (f) =>
        (f.compiled = {
          status: 'PROVEN',
          recipeVersion: 'shared-contracts-fresh-force-v1',
          files: [{ file, sha256: hash('export default 1\n') }]
        }),
      'PACKAGE_IDENTITY',
      (out) => expect(has(out, file, 'UNKNOWN_COMPILED_PROVENANCE')).toBe(false)
    )
    const outs = batch(
      cases.map((c) => ({ method: 'runSemanticBoundary', args: [c.f] }))
    )
    cases.forEach((c, i) => {
      const out = outs[i],
        label = c.name + ' ' + JSON.stringify(tuples(out))
      expect(
        has(out, file, 'UNKNOWN_INSTALLED_FILE_IDENTITY', c.category),
        label
      ).toBe(true)
      expect(has(out, file, 'UNKNOWN_COMPILED_PROVENANCE'), label).toBe(false)
      expect(out.status, label).toBe('UNKNOWN')
      expect(out.proofs, label).toEqual([])
      // E5: the body of the file is still analysed after the refusal.
      expect(out.bodyCoverage.modules.completed, label).toBe(2)
      expect(out.installedFileIdentity.files, label).toEqual([])
      c.extra(out)
    })
  }, 600000)
  it('G3 nested package, same relative path in another package, dot directories and workspace dist', () => {
    const nested = fixture('d2-nested', {
      'entry.mjs': "import v from 'pa'\nexport default v\n",
      'node_modules/pa/package.json': pkg('pa', { exports: './i.js' }),
      'node_modules/pa/i.js': "import w from 'pb'\nexport default w\n",
      'node_modules/pa/node_modules/pb/package.json': pkg('pb', {
        exports: './dist/i.js'
      }),
      'node_modules/pa/node_modules/pb/dist/i.js': 'export default 1\n'
    })
    nested.installed = [identity(nested.root, 'node_modules/pa')]
    const other = fixture('d2-other-package', {
      'entry.mjs': "import v from 'pb'\nexport default v\n",
      'node_modules/pa/package.json': pkg('pa', { exports: './dist/i.js' }),
      'node_modules/pa/dist/i.js': 'export default 1\n',
      'node_modules/pb/package.json': pkg('pb', { exports: './dist/i.js' })
    })
    // pb's reference inventory predates dist/i.js; pa has the same path/bytes.
    other.installed = [
      identity(other.root, 'node_modules/pa'),
      identity(other.root, 'node_modules/pb')
    ]
    write(other.root, 'node_modules/pb/dist/i.js', 'export default 1\n')
    const dotIn = fixture('d2-dot-inside', {
      'entry.mjs': "import v from 'pdot'\nexport default v\n",
      'node_modules/pdot/package.json': pkg('pdot', {
        exports: './.hidden/i.js'
      }),
      'node_modules/pdot/.hidden/i.js': 'export default 1\n'
    })
    dotIn.installed = [identity(dotIn.root, 'node_modules/pdot')]
    const dotMissing = fixture('d2-dot-missing', {
      'entry.mjs': "import v from 'pdot'\nexport default v\n",
      'node_modules/pdot/package.json': pkg('pdot', {
        exports: './.hidden/i.js'
      }),
      'node_modules/pdot/.hidden/i.js': 'export default 1\n'
    })
    dotMissing.installed = [
      identity(dotMissing.root, 'node_modules/pdot', {
        mutate: (body) => ({
          ...body,
          entries: body.entries.filter((e) => !e.path.startsWith('.hidden'))
        })
      })
    ]
    const dotPackage = fixture('d2-dot-package', {
      'entry.mjs':
        "import v from './node_modules/.vite/deps/i.js'\nexport default v\n",
      'node_modules/.vite/package.json': pkg('vite-deps-cache'),
      'node_modules/.vite/deps/i.js': 'export default 1\n'
    })
    const workspace = fixture(
      'd2-workspace-dist',
      {
        'package.json': { ...ROOTPKG, workspaces: ['packages/*'] },
        'entry.mjs': "import v from '@scope/x'\nexport default v\n",
        'packages/x/package.json': pkg('@scope/x', {
          exports: './dist/i.js'
        }),
        'packages/x/dist/i.js': 'export default 1\n'
      },
      { links: { 'node_modules/@scope/x': '../../packages/x' } }
    )
    const [on, oo, oi, om, op, ow] = batch(
      [nested, other, dotIn, dotMissing, dotPackage, workspace].map(
        (input) => ({ method: 'runSemanticBoundary', args: [input] })
      )
    )
    expect(
      has(
        on,
        'node_modules/pa/node_modules/pb/dist/i.js',
        'UNKNOWN_INSTALLED_FILE_IDENTITY',
        'PACKAGE_IDENTITY'
      ),
      JSON.stringify(tuples(on))
    ).toBe(true)
    expect(
      has(
        oo,
        'node_modules/pb/dist/i.js',
        'UNKNOWN_INSTALLED_FILE_IDENTITY',
        'ENTRY_MISSING'
      ),
      JSON.stringify(tuples(oo))
    ).toBe(true)
    expect(oi.status, JSON.stringify(tuples(oi))).toBe('PROVEN')
    expect(
      has(
        om,
        'node_modules/pdot/.hidden/i.js',
        'UNKNOWN_INSTALLED_FILE_IDENTITY',
        'ENTRY_MISSING'
      )
    ).toBe(true)
    expect(
      has(
        op,
        'node_modules/.vite/deps/i.js',
        'UNKNOWN_INSTALLED_FILE_IDENTITY',
        'PACKAGE_IDENTITY'
      ),
      JSON.stringify(tuples(op))
    ).toBe(true)
    expect(
      has(ow, 'packages/x/dist/i.js', 'UNKNOWN_COMPILED_PROVENANCE'),
      JSON.stringify(tuples(ow))
    ).toBe(true)
    expect(
      ow.unknowns.some((u) => u.reason === 'UNKNOWN_INSTALLED_FILE_IDENTITY')
    ).toBe(false)
    for (const out of [on, oo, om, op, ow]) expect(out.proofs).toEqual([])
  }, 300000)
  it('G4 mutation after the identity check is caught by revalidation and never proves', () => {
    const f = fixture('d2-mutation', {
      ...dist('dist'),
      'entry.mjs':
        "import v from 'pkgd'\nconst m = { p: './after.mjs' }\nimport(m.p)\nexport default v\n",
      'after.mjs': 'export default 0\n'
    })
    f.installed = [identity(f.root, 'node_modules/pkgd')]
    const out = analyze(f, {
      fault: {
        leaf: 'after.mjs',
        at: 1,
        rewrite: {
          path: path.join(f.root, 'node_modules/pkgd/dist/index.js'),
          data: 'export default 2\n'
        }
      }
    })
    expect(
      out.unknowns.some((u) =>
        /^UNKNOWN_(INPUT|RESOLUTION)_MUTATION$/.test(u.reason)
      ),
      JSON.stringify(tuples(out))
    ).toBe(true)
    expect(out.status).toBe('UNKNOWN')
    expect(out.proofs).toEqual([])
  }, 120000)
  it('G5 the parent rejects a forged identity record and a v3 output is never v4', async () => {
    const e = await import(ENGINE)
    const f = fixture('d2-forged', dist('dist'))
    f.installed = [identity(f.root, 'node_modules/pkgd')]
    const out = run(f)
    expect(out.status).toBe('PROVEN')
    expect(e.revalidateInstalledFileIdentity(f, out)).toBe(true)
    const forged = structuredClone(out)
    forged.installedFileIdentity.files[0].sha256 = 'd'.repeat(64)
    expect(e.revalidateInstalledFileIdentity(f, forged)).toBe(false)
    const swapped = structuredClone(f)
    swapped.installed[0].inventorySha256 = 'e'.repeat(64)
    expect(e.revalidateInstalledFileIdentity(swapped, out)).toBe(false)
    const old = structuredClone(out)
    old.kernelVersion = 'semantic-kernel-v3-exact-metadata'
    expect(e.revalidateSemanticInputs(f.root, old)).toBe(false)
    expect(e.revalidateSemanticInputs(f.root, out)).toBe(true)
  }, 120000)
})

// v3 tuples of the frozen engine (recon HISO005-P2-NEXT-RECON-20261018,
// body-controls.json and review-r1-extra-controls.snapshot.json).
const V3 = {
  C1: [
    ['', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN'],
    ['a.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
  ],
  C2: [
    ['', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN'],
    ['entry.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
  ],
  C3: [['node_modules/pkgd/dist/index.js', 'UNKNOWN_COMPILED_PROVENANCE', '']],
  C4: [['entry.mjs', 'UNKNOWN_FUNCTION', '']],
  C5: [
    ['', 'UNKNOWN_AMBIGUOUS_RESOLUTION', 'UNKNOWN_AMBIGUOUS_RESOLUTION'],
    [
      'entry.mjs',
      'UNKNOWN_AMBIGUOUS_RESOLUTION',
      'UNKNOWN_AMBIGUOUS_RESOLUTION'
    ]
  ],
  C6: [
    ['', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN'],
    ['a.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
  ],
  X1: [
    [
      'products/x.mjs',
      'UNKNOWN_PRODUCT_TARGET',
      'UNKNOWN_PRODUCT_TARGET:products/x.mjs'
    ]
  ],
  X2: [
    [
      'missing.mjs',
      'UNKNOWN_ACQUISITION_ENOENT',
      'UNKNOWN_ACQUISITION_ENOENT:missing.mjs'
    ]
  ],
  X3: [
    ['', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN'],
    ['a.mjs', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_NATIVE_BUILTIN']
  ]
}
const EDGE = new Set(SPEC_PER_EDGE)
function conserved(v3, out, importer) {
  const v4 = tuples(out).map((t) => JSON.stringify(t))
  for (const t of v3) {
    const [file, reason, detail] = t
    if (file === '' && EDGE.has(reason))
      expect(v4, JSON.stringify(t)).toContain(
        JSON.stringify([importer, reason, detail])
      )
    else if (
      reason === 'UNKNOWN_COMPILED_PROVENANCE' &&
      file.split('/').includes('node_modules')
    )
      expect(
        out.unknowns.every(
          (u) =>
            u.file !== file ||
            u.reason === 'UNKNOWN_INSTALLED_FILE_IDENTITY' ||
            u.reason !== 'UNKNOWN_COMPILED_PROVENANCE'
        )
      ).toBe(true)
    else if (reason === 'UNKNOWN_FUNCTION' && detail === '')
      expect(
        out.unknowns.some(
          (u) => u.file === file && u.reason === reason && u.detail !== ''
        )
      ).toBe(true)
    else expect(v4, JSON.stringify(t)).toContain(JSON.stringify(t))
  }
}

describe('SPEC0241 H — IB09 conservation of v3 tuples and IB01 census unchanged', () => {
  it('H1 every v3 tuple of C1–C6/X1–X3 persists in v4 outside the three nominal exceptions', () => {
    const inputs = {
      C1: fixture(
        'h-c1',
        {
          'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
          'b.mjs': 'export const x = missingGlobal\n'
        },
        { starts: ['a.mjs', 'b.mjs'] }
      ),
      C2: fixture('h-c2', {
        'entry.mjs':
          "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n"
      }),
      C3: fixture('h-c3', dist3()),
      C4: fixture('h-c4', {
        'entry.mjs': 'async function unused() {}\nexport default 1\n'
      }),
      C5: fixture('h-c5', {
        'entry.mjs': "import v from 'pkgb'\nexport default v\n",
        'node_modules/pkgb/package.json': pkg('pkgb', {
          browser: './lib/index.js',
          exports: { default: './lib/index.js' }
        }),
        'node_modules/pkgb/lib/index.js': 'export default 1\n'
      }),
      C6: fixture(
        'h-c6',
        {
          'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
          'b.mjs':
            "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n",
          'products/x.mjs': 'export default 1\n'
        },
        { starts: ['a.mjs', 'b.mjs'] }
      ),
      X1: fixture(
        'h-x1',
        {
          'b.mjs':
            "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n",
          'c.mjs':
            "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n",
          'products/x.mjs': 'export default 1\n',
          'products/y.mjs': 'export default 1\n',
          'products/z.mjs': 'export default 1\n'
        },
        { starts: ['b.mjs', 'c.mjs'] }
      ),
      X2: fixture(
        'h-x2',
        {
          'a.mjs':
            "const m = { p: './missing.mjs' }\nimport(m.p)\nexport const after = missingGlobal\n"
        },
        { starts: ['a.mjs'] }
      ),
      X3: fixture(
        'h-x3',
        {
          'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
          'node_modules/pkgu/package.json': pkg('pkgu', {
            exports: './lib/index.js'
          }),
          'node_modules/pkgu/lib/index.js': 'export default 1\n'
        },
        { starts: ['a.mjs'] }
      )
    }
    const MATCH = { identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
    inputs.C3.installed = [
      {
        key: 'node_modules/pkgd',
        manifest: 'node_modules/pkgd/package.json',
        ...MATCH
      }
    ]
    inputs.C5.installed = [
      {
        key: 'node_modules/pkgb',
        manifest: 'node_modules/pkgb/package.json',
        ...MATCH
      }
    ]
    inputs.X3.installed = [
      {
        key: 'node_modules/pkgu',
        manifest: 'node_modules/pkgu/package.json',
        ...MATCH
      }
    ]
    const names = Object.keys(inputs)
    const outs = batch(
      names.map((n) => ({ method: 'runSemanticBoundary', args: [inputs[n]] }))
    )
    const importer = {
      C1: 'a.mjs',
      C2: 'entry.mjs',
      C5: 'entry.mjs',
      C6: 'a.mjs',
      X3: 'a.mjs'
    }
    names.forEach((n, i) => conserved(V3[n], outs[i], importer[n]))
    // §3.5: the v3 violation multiset is contained in v4.
    const x1 = outs[names.indexOf('X1')]
    expect(x1.violations).toEqual(
      expect.arrayContaining([
        {
          file: 'b.mjs',
          reason: 'PRODUCT_DEPENDENCY',
          target: 'products/x.mjs'
        }
      ])
    )
  }, 600000)
  it('H2 the refusal census keeps v3 semantics: no containment, no D2, v3 dist rule, no categories', () => {
    const c1 = fixture(
      'census-c1',
      {
        'a.mjs': "import fs from 'node:fs'\nexport default 1\n",
        'b.mjs': 'export const x = missingGlobal\n'
      },
      { starts: ['a.mjs', 'b.mjs'] }
    )
    const c3 = fixture('census-c3', dist3())
    c3.installed = [identity(c3.root, 'node_modules/pkgd')]
    const c4 = fixture('census-c4', {
      'entry.mjs': 'async function unused() {}\nexport default 1\n'
    })
    const x1 = fixture(
      'census-x1',
      {
        'b.mjs':
          "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n",
        'products/x.mjs': 'export default 1\n',
        'products/y.mjs': 'export default 1\n'
      },
      { starts: ['b.mjs'] }
    )
    const census = batch(
      [c1, c3, c4, x1].map((input) => ({
        method: 'analyzeSemanticBoundary',
        args: [input, { refusalCensus: true }]
      }))
    )
    const N = ['', 'UNKNOWN_NEGATIVE_CENSUS_ONLY', '']
    expect(tuples(census[0])).toEqual([...V3.C1, N])
    expect(tuples(census[1])).toEqual([...V3.C3, N])
    expect(tuples(census[2])).toEqual([...V3.C4, N])
    expect(census[3].violations).toEqual([
      { file: 'b.mjs', reason: 'PRODUCT_DEPENDENCY', target: 'products/x.mjs' }
    ])
  }, 300000)
})
function dist3() {
  return {
    'entry.mjs': "import v from 'pkgd'\nexport default v\n",
    'node_modules/pkgd/package.json': pkg('pkgd', {
      exports: './dist/index.js'
    }),
    'node_modules/pkgd/dist/index.js': 'export default 1\n'
  }
}

// Real checker/CLI: the 0234 comparator's reference inventory reaches the
// engine, and an installed dist dependency is no longer impossible.
describe('SPEC0241 I — checker integration of the reference inventory', () => {
  it('I1 a MATCH installed dist dependency is proved and verified only with the per-file identity', () => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(PARENT, 'cli-')))
    const evaluated = path.join(parent, 'evaluated'),
      reference = path.join(parent, 'reference')
    const key = 'node_modules/vendor'
    const lock = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'synthetic', version: '1.0.0' },
        [key]: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
          integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
        }
      }
    }
    for (const root of [evaluated, reference]) {
      write(root, 'package.json', {
        name: 'synthetic',
        version: '1.0.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*', 'products/*']
      })
      write(root, 'package-lock.json', lock)
      write(root, 'tsconfig.base.json', {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowJs: true,
          target: 'ES2022'
        }
      })
      write(root, 'packages/core/package.json', {
        name: '@synthetic/core',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        dependencies: { vendor: '1.0.0' }
      })
      write(
        root,
        'packages/core/src/index.js',
        "import { value } from 'vendor'\nexport const result = value\n"
      )
      write(root, 'products/shift/package.json', {
        name: '@private/product',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js'
      })
      write(root, 'products/shift/src/index.js', 'export const productOnly=1\n')
      write(root, key + '/package.json', {
        name: 'vendor',
        version: '1.0.0',
        type: 'module',
        exports: './dist/index.js'
      })
      write(root, key + '/dist/index.js', 'export const value = 2\n')
    }
    const packages = [
      {
        key,
        name: 'vendor',
        version: '1.0.0',
        ...collectPackageInventory(path.join(reference, key))
      }
    ]
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
          path.join(parent, 'cache')
        ],
        exitCode: 0,
        offline: true,
        ignoreScripts: true,
        completed: true,
        sourceExclusions: ['docs/04_audit/evidence']
      },
      selection: {
        platform: process.platform,
        arch: process.arch,
        dev: true,
        optional: true
      },
      limits: { ...INSTALLED_IDENTITY_LIMITS },
      usage: {
        entries: packages[0].usage.entries,
        regularBytes: packages[0].usage.regularBytes,
        maxDepth: packages[0].usage.maxDepth
      },
      packages
    }
    const bytes = canonicalJson(receipt)
    const manifestPath = write(parent, 'installed-reference.json', bytes)
    const graphFile = path.join(parent, 'graph.json')
    const result = spawnSync(
      NODE,
      [
        CHECKER,
        evaluated,
        `--graph=${graphFile}`,
        `--installed-reference=${manifestPath}`,
        `--installed-reference-sha256=${hash(bytes)}`,
        '--semantic'
      ],
      { encoding: 'utf8', timeout: 120000, env: env() }
    )
    expect(result.status, result.stderr).toBe(0)
    const report = JSON.parse(result.stdout)
    const s = report.semanticBoundary
    expect(s.kernelVersion).toBe(KERNEL)
    expect(s.status, JSON.stringify(s.unknowns)).toBe('PROVEN')
    expect(s.installedFileIdentity.files).toEqual([
      expect.objectContaining({
        file: key + '/dist/index.js',
        key,
        inventorySha256: packages[0].inventorySha256
      })
    ])
    expect(s.phases.body).toBe('COMPLETED')
    const graph = JSON.parse(fs.readFileSync(graphFile))
    expect(graph.installed[0].verified).toBe(true)
  }, 300000)
})
