import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  INSTALLED_IDENTITY_LIMITS
} from '../scripts/boundary-installed-identity.mjs'

const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const CHECKER = path.resolve('scripts/check-product-boundary.mjs')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const roots = []
let toolchain
beforeAll(() => {
  toolchain = fingerprintToolchain()
})
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
const write = (root, file, bytes) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  return target
}
function fixture({
  core = 'export const result = 1\n',
  vendor,
  payload,
  prepare = () => {},
  extraInstalledKeys = []
} = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-b6236-host-'))
  roots.push(parent)
  const evaluated = path.join(parent, 'evaluated'),
    reference = path.join(parent, 'synthetic-independent-reference')
  const key = 'node_modules/vendor'
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'synthetic', version: '1.0.0' },
      ...(vendor
        ? {
            [key]: {
              version: '1.0.0',
              resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
              integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
            }
          }
        : {})
    }
  }
  for (const root of [evaluated, reference]) {
    write(
      root,
      'package.json',
      JSON.stringify({
        name: 'synthetic',
        version: '1.0.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*', 'products/*']
      })
    )
    write(root, 'package-lock.json', JSON.stringify(lock))
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowJs: true,
          target: 'ES2022'
        }
      })
    )
    write(
      root,
      'packages/core/package.json',
      JSON.stringify({
        name: '@synthetic/core',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        ...(vendor ? { dependencies: { vendor: '1.0.0' } } : {})
      })
    )
    write(root, 'packages/core/src/index.js', core)
    write(
      root,
      'products/shift/package.json',
      JSON.stringify({
        name: '@private/product',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js'
      })
    )
    write(root, 'products/shift/src/index.js', 'export const productOnly=1\n')
    if (vendor) {
      write(
        root,
        key + '/package.json',
        JSON.stringify({
          name: 'vendor',
          version: '1.0.0',
          type: 'module',
          main: 'index.js'
        })
      )
      write(root, key + '/index.js', vendor)
    }
    if (payload) write(root, key + '/payload.node', payload)
    prepare(root)
  }
  const packages = vendor
    ? [
        {
          key,
          name: 'vendor',
          version: '1.0.0',
          ...collectPackageInventory(path.join(reference, key))
        },
        ...extraInstalledKeys.map((extraKey) => ({
          key: extraKey,
          name: JSON.parse(
            fs.readFileSync(path.join(reference, extraKey, 'package.json'))
          ).name,
          version: '1.0.0',
          ...collectPackageInventory(path.join(reference, extraKey))
        }))
      ].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    : []
  // Private synthetic operator receipt; not an offline recipe/SRI attestation.
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
      completed: true
    },
    selection: {
      platform: process.platform,
      arch: process.arch,
      dev: true,
      optional: true
    },
    limits: { ...INSTALLED_IDENTITY_LIMITS },
    usage: {
      entries: packages.reduce((n, p) => n + p.usage.entries, 0),
      regularBytes: packages.reduce((n, p) => n + p.usage.regularBytes, 0),
      maxDepth: packages.length
        ? Math.max(...packages.map((p) => p.usage.maxDepth))
        : 0
    },
    packages
  }
  const bytes = canonicalJson(receipt),
    manifestPath = write(parent, 'installed-reference.json', bytes),
    expectedSha256 = hash(bytes)
  const flags = [
    `--installed-reference=${manifestPath}`,
    `--installed-reference-sha256=${expectedSha256}`
  ]
  const run = (args = ['--semantic'], env = {}) => {
    const graphFile = path.join(parent, 'graph.json')
    const result = spawnSync(
      NODE,
      [CHECKER, evaluated, `--graph=${graphFile}`, ...flags, ...args],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          PATH: path.dirname(NODE) + ':/usr/bin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
          TZ: 'UTC',
          ...env
        }
      }
    )
    if (result.error) throw result.error
    return {
      code: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
      report: result.stdout ? JSON.parse(result.stdout) : null,
      graph: fs.existsSync(graphFile)
        ? JSON.parse(fs.readFileSync(graphFile))
        : null
    }
  }
  return {
    parent,
    evaluated,
    reference,
    flags,
    run,
    manifestPath,
    expectedSha256
  }
}
function nativeResolution(specifier, importer, mode = 'import') {
  const program =
    mode === 'import'
      ? 'process.stdout.write(import.meta.resolve(process.argv[1]))'
      : 'process.stdout.write(require.resolve(process.argv[1]))'
  return spawnSync(
    NODE,
    [
      ...(mode === 'import' ? ['--input-type=module'] : []),
      '--eval',
      program,
      specifier
    ],
    {
      cwd: path.dirname(importer),
      env: {
        PATH: path.dirname(NODE) + ':/usr/bin:/bin',
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC'
      },
      encoding: 'utf8',
      timeout: 10000
    }
  )
}
function updateJson(root, file, update) {
  const target = path.join(root, file)
  const body = JSON.parse(fs.readFileSync(target))
  update(body)
  fs.writeFileSync(target, JSON.stringify(body))
}
function standaloneKernel(f, key = 'node_modules/vendor') {
  const reference = JSON.parse(fs.readFileSync(f.manifestPath))
  const actual = collectPackageInventory(path.join(f.evaluated, key))
  expect(actual.inventorySha256).toBe(
    reference.packages.find((entry) => entry.key === key).inventorySha256
  )
  const input = {
    root: f.evaluated,
    starts: ['packages/core/src/index.js'],
    origins: [],
    installed: [
      {
        key,
        manifest: key + '/package.json',
        identityStatus: 'MATCH',
        referenceDigest: f.expectedSha256
      }
    ],
    compiled: { status: 'UNAVAILABLE', files: [] }
  }
  const program =
    'import fs from "node:fs";import{runSemanticBoundary}from' +
    JSON.stringify(
      pathToFileURL(path.resolve('scripts/boundary-semantic-engine.mjs')).href
    ) +
    ';process.stdout.write(JSON.stringify(runSemanticBoundary(JSON.parse(fs.readFileSync(0,"utf8")))))'
  const result = spawnSync(NODE, ['--input-type=module', '--eval', program], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 30000,
    env: {
      PATH: path.dirname(NODE) + ':/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
      TZ: 'UTC',
      TMPDIR: process.env.TMPDIR || os.tmpdir()
    }
  })
  expect(result.status, result.stderr).toBe(0)
  return JSON.parse(result.stdout)
}
function hostileBody(root, up = '../../', direct = false) {
  const marker = path.join(path.dirname(root), 'target-was-executed')
  return (
    `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'ran');` +
    (direct
      ? `import '${up}products/shift/src/index.js';`
      : `import('${up}pro'+'ducts/shift/src/index.js');`) +
    'export const value=2\n'
  )
}
function expectNoUnsupportedProof(f, result) {
  expect(result.report, `${result.code}: ${result.stderr}`).not.toBeNull()
  expect(result.report.status, result.stdout).toBe('INCOMPLETE')
  expect(result.report.semanticBoundary.status, result.stdout).toBe('UNKNOWN')
  expect(result.report.semanticBoundary.proofs).toEqual([])
  expect(
    result.graph.installed.every((x) => x.contentIdentity.status === 'MATCH')
  ).toBe(true)
  expect(result.graph.installed.every((x) => !x.verified)).toBe(true)
  expect(fs.existsSync(path.join(f.parent, 'target-was-executed'))).toBe(false)
}
const trustPayload = (value) => {
  const copy = structuredClone(value)
  delete copy.semanticTelemetry
  return copy
}
describe('SPEC0236 real checker/CLI integration', () => {
  it('retains default installed refusal and proves a closed matching JS dependency only on opt-in', () => {
    const f = fixture({
      core: "import { value } from 'vendor'; export const result=value\n",
      vendor: 'export const value=1\n'
    })
    const before = f.run([])
    expect(before.code).toBe(1)
    expect(before.report.status).toBe('INCOMPLETE')
    expect(before.graph.installed[0].verified).toBe(false)
    const after = f.run()
    expect(after.stderr).toBe('')
    expect(after.code, JSON.stringify(after.report)).toBe(0)
    expect(after.report.status).toBe('PASS')
    expect(after.graph.installed).toHaveLength(1)
    expect(after.graph.installed[0]).toMatchObject({
      verified: true,
      source: 'semantic-kernel-v2-resolution',
      contentIdentity: { status: 'MATCH' }
    })
    expect(after.report.resolvedDiagnostics).toHaveLength(1)
    expect(after.report.exceptions).toEqual([])
    expect(after.report.exceptionsApplied).toBe(false)
  })
  it('captures actual distinct origins for identical same-line diagnostics and consumes each separately', () => {
    const f = fixture({
      core: 'const value = {x:1}; const first=Object.getOwnPropertyDescriptor(value,"x"); const second=Object.getOwnPropertyDescriptor(value,"x"); export const result=first.value+second.value;\n'
    })
    const before = f.run([]),
      after = f.run()
    expect(before.report.diagnostics.length).toBeGreaterThan(1)
    expect(after.code, JSON.stringify(after.report)).toBe(0)
    const original = before.report.diagnostics.filter(
      (d) => d.reason === 'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
    )
    expect(original.length).toBeGreaterThan(1)
    const ids = after.report.resolvedDiagnostics.map((x) => x.originId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(before.report.diagnostics.length)
    const groups = new Map()
    for (const d of original) {
      const key = JSON.stringify(d)
      groups.set(key, (groups.get(key) || 0) + 1)
    }
    expect([...groups.values()].some((n) => n > 1)).toBe(true)
    for (const row of after.report.resolvedDiagnostics) {
      const origin = after.report.semanticBoundary.origins.find(
        (x) => x.id === row.originId
      )
      const proof = after.report.semanticBoundary.proofs.find(
        (x) => x.id === row.proofId
      )
      expect(proof).toMatchObject({
        originId: origin.id,
        fileSha256: origin.fileSha256,
        kind: origin.kind,
        start: origin.start,
        end: origin.end,
        ordinal: origin.ordinal
      })
    }
    expect(after.report.semanticBoundary.occurrences).toMatchObject({
      baseline: before.report.diagnostics.length,
      resolved: before.report.diagnostics.length,
      unresolved: 0,
      new: 0
    })
  })
  it('never grants a locally neutral same-line occurrence authority over a shadowed opaque receiver', () => {
    const f = fixture({
      core: 'const value={}; const prototype=Object.getPrototypeOf(value); function unsafe(Object) { const prototype=Object.getPrototypeOf(value); return prototype }; export const result=prototype===null; export { unsafe };\n'
    })
    const before = f.run([]),
      after = f.run()
    expect(after.code).toBe(1)
    expect(after.report.status).toBe('INCOMPLETE')
    expect(after.report.resolvedDiagnostics).toEqual([])
    expect(after.report.semanticBoundary.occurrences).toMatchObject({
      baseline: before.report.diagnostics.length,
      resolved: 0,
      unresolved: before.report.diagnostics.length
    })
    expect(
      after.report.diagnostics.slice(0, before.report.diagnostics.length)
    ).toEqual(before.report.diagnostics)
  })
  it('keeps normal and strict semantic payloads and graphs equal, excluding measured duration', () => {
    const f = fixture({
        core: "import { value } from 'vendor'; export const result=value\n",
        vendor: 'export const value=1\n'
      }),
      normal = f.run(),
      strict = f.run(['--semantic', '--strict'])
    expect(trustPayload(normal.report)).toEqual(trustPayload(strict.report))
    expect(normal.graph).toEqual(strict.graph)
  })
  it('preserves product FAIL for a matching installed package with a concatenated loader target', () => {
    const f = fixture({
        core: "import { value } from 'vendor'; export const result=value\n",
        vendor:
          "const forbidden=import('../../'+'products/'+'shift/src/index.js'); export const value=forbidden\n"
      }),
      a = f.run()
    expect(a.code).toBe(1)
    expect(a.report.status).toBe('FAIL')
    expect(
      a.report.violations.some((v) => v.reason === 'CORE_DEPENDS_ON_PRODUCT')
    ).toBe(true)
    expect(a.graph.installed[0].verified).toBe(false)
  })
  it('retains explicit UNKNOWN for native payloads despite matching identity', () => {
    const f = fixture({
        core: "import { value } from 'vendor'; export const result=value\n",
        vendor:
          "import native from './payload.node'; export const value=native\n",
        payload: 'synthetic non-executable native fixture'
      }),
      a = f.run()
    expect(a.code).toBe(1)
    expect(a.report.status).toBe('INCOMPLETE')
    expect(a.graph.installed[0]).toMatchObject({
      verified: false,
      contentIdentity: { status: 'MATCH' }
    })
    expect(
      a.report.semanticBoundary.unknowns.some(
        (u) =>
          /payload[.]node/.test(u.file + ':' + u.detail) &&
          /FORMAT|NATIVE/.test(u.reason)
      ),
      JSON.stringify(a.report.semanticBoundary.unknowns)
    ).toBe(true)
  })
  it('does not retire installed content drift or its original diagnostic', () => {
    const f = fixture({
      core: "import { value } from 'vendor'; export const result=value\n",
      vendor: 'export const value=1\n'
    })
    write(f.evaluated, 'node_modules/vendor/index.js', 'export const value=2\n')
    const a = f.run()
    expect(a.report.status).toBe('INCOMPLETE')
    expect(a.graph.installed[0]).toMatchObject({
      verified: false,
      contentIdentity: { status: 'MISMATCH' }
    })
    expect(
      a.report.diagnostics.some(
        (d) => d.reason === 'UNVERIFIED_INSTALLED_PACKAGE'
      )
    ).toBe(true)
  })
  it('keeps an ambient callback unknown instead of treating its type/name as provenance', () => {
    const a = fixture({
      core: 'export const load=()=>globalThis.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__()\n'
    }).run()
    expect(a.report.status).toBe('INCOMPLETE')
    expect(a.report.resolvedDiagnostics).toEqual([])
    expect(a.report.semanticBoundary.unknowns.length).toBeGreaterThan(0)
  })
  it('keeps a dynamic code target unknown without executing it', () => {
    const a = fixture({
      core: 'export const load=()=>import(process.env.DYNAMIC_TARGET)\n'
    }).run()
    expect(a.report.status).toBe('INCOMPLETE')
    expect(a.report.diagnostics.length).toBeGreaterThan(0)
    expect(a.report.exceptions).toEqual([])
  })
  it('refuses inherited runtime profile changes while preserving a known product violation', () => {
    const a = fixture({
      core: "import {productOnly} from '../../../products/shift/src/index.js'; export const result=productOnly\n"
    }).run(['--semantic'], { NODE_OPTIONS: '--no-warnings' })
    expect(a.report.status).toBe('FAIL')
    expect(
      a.report.semanticBoundary.unknowns.some(
        (x) => x.reason === 'UNKNOWN_RUNTIME_PROFILE'
      )
    ).toBe(true)
  })
  it('rejects invalid semantic/compiled CLI combinations before analysis', () => {
    const f = fixture()
    const variants = [
      ['--semantic'],
      ['--semantic', '--semantic', ...f.flags],
      [
        '--compiled-build-reference=x',
        '--compiled-build-reference-sha256=' + 'a'.repeat(64)
      ],
      ['--semantic', ...f.flags, '--compiled-build-reference=x'],
      [
        '--semantic',
        ...f.flags,
        '--compiled-build-reference=x',
        '--compiled-build-reference-sha256=BAD'
      ],
      ['--semantic=true', ...f.flags]
    ]
    for (const args of variants) {
      const a = spawnSync(NODE, [CHECKER, f.evaluated, ...args], {
        encoding: 'utf8',
        env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin' }
      })
      expect(a.status, JSON.stringify(args)).toBe(2)
      expect(a.stdout).toBe('')
    }
  })
  it('reports missing programmatic installed identity conservatively even for a neutral module', () => {
    const f = fixture(),
      code = `import {auditProductBoundary} from ${JSON.stringify(pathToFileURL(CHECKER).href)}; console.log(JSON.stringify(auditProductBoundary(${JSON.stringify(f.evaluated)},{semantic:true})))`
    const a = spawnSync(NODE, ['--input-type=module', '--eval', code], {
      encoding: 'utf8',
      timeout: 30000,
      env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin' }
    })
    expect(a.status, a.stderr).toBe(0)
    const report = JSON.parse(a.stdout)
    expect(report.status).toBe('INCOMPLETE')
    expect(report.semanticBoundary.validation.valid).toBe(false)
    expect(
      report.diagnostics.some((d) => d.detail === 'UNKNOWN_INSTALLED_REFERENCE')
    ).toBe(true)
  })
})

describe('R1 regressions at the installed MATCH public boundary', () => {
  it('retains FAIL for a finite product call hidden in a computed binding key', () => {
    const f = fixture({
      core: "import 'vendor'; export const result=1;",
      vendor:
        "const run=(s)=>import(s); const {[run('../../'+'pro'+'ducts/shift/src/index.js')]:value}={value:1}; export const answer=1;"
    })
    const result = f.run()
    expect(result.report.status).toBe('FAIL')
    expect(result.graph.installed[0].verified).toBe(false)
    expect(result.report.resolvedDiagnostics).toEqual([])
    expect(
      result.report.violations.some(
        (v) => v.reason === 'CORE_DEPENDS_ON_PRODUCT'
      )
    ).toBe(true)
  })
  it('does not approve an installed package with an anonymous default external loader', () => {
    const f = fixture({
      core: "import 'vendor'; export const result=1;",
      vendor: 'export default function(specifier){return import(specifier)}'
    })
    const result = f.run()
    expect(result.report.status).toBe('INCOMPLETE')
    expect(result.graph.installed[0]).toMatchObject({
      verified: false,
      contentIdentity: { status: 'MATCH' }
    })
    expect(result.report.resolvedDiagnostics).toEqual([])
  })
  it.each([
    'export default function(){return 1}',
    'export default function named(){return 1}'
  ])('proves a closed actual default runtime export: %s', (vendor) => {
    const f = fixture({
      core: "import f from 'vendor'; export const result=f();",
      vendor
    })
    const result = f.run()
    expect(result.report.status, JSON.stringify(result.report)).toBe('PASS')
    expect(result.graph.installed[0].verified).toBe(true)
  })
  it.each([
    'export const value: number=1;',
    'const value=1; const value=2; export const answer=value;'
  ])(
    'refuses a matching installed JS payload with invalid actual runtime grammar: %s',
    (vendor) => {
      const f = fixture({
        core: "import 'vendor'; export const result=1;",
        vendor
      })
      const result = f.run()
      expect(result.report.status).toBe('INCOMPLETE')
      expect(result.graph.installed[0]).toMatchObject({
        verified: false,
        contentIdentity: { status: 'MATCH' }
      })
      expect(
        result.report.semanticBoundary.unknowns.some(
          (u) => u.reason === 'UNKNOWN_RUNTIME_SYNTAX'
        )
      ).toBe(true)
    }
  )
})

describe('Recovery controls for every new frontier origin', () => {
  it('assigns each new blocking occurrence its own physical nonAST lineage, separate from baseline proofs', () => {
    const f = fixture({
      core: "import 'vendor'; export const result=1;",
      vendor: 'export default function(specifier){return import(specifier)}'
    })
    const a = f.run(),
      b = f.run(['--semantic', '--strict']),
      report = a.report,
      rows = report.diagnostics.filter(
        (x) => x.reason === 'UNVERIFIED_SEMANTIC_FRONTIER'
      )
    expect(report.status).toBe('INCOMPLETE')
    expect(rows.length).toBeGreaterThan(0)
    const ids = rows.map((x) => x.originId),
      baseline = new Set(report.semanticBoundary.origins.map((x) => x.id))
    expect(new Set(ids).size).toBe(rows.length)
    expect(
      ids.every(
        (id) =>
          typeof id === 'string' &&
          /^[a-f0-9]{64}$/.test(id) &&
          !baseline.has(id)
      )
    ).toBe(true)
    expect(report.semanticBoundary.frontierOrigins).toHaveLength(rows.length)
    expect(report.semanticBoundary.occurrences.newOriginIds).toEqual(ids)
    for (const diagnostic of rows) {
      const origin = report.semanticBoundary.frontierOrigins.find(
        (x) => x.id === diagnostic.originId
      )
      expect(origin).toMatchObject({
        kind: 'NonAstDiagnostic',
        start: null,
        end: null,
        context: 'semantic-frontier',
        reason: 'UNVERIFIED_SEMANTIC_FRONTIER'
      })
      if (origin.file)
        expect(origin.fileSha256).toBe(
          hash(fs.readFileSync(path.join(f.evaluated, origin.file)))
        )
      const { id, ...tuple } = origin
      expect(id).toBe(hash(canonicalJson(tuple).replace(/\n$/, '')))
      expect(origin.semanticPointer.reason).toBe(diagnostic.detail)
      expect(origin.semanticPointer.detail).toBe(diagnostic.semanticDetail)
      expect(
        report.semanticBoundary.proofs.some((p) => p.originId === origin.id)
      ).toBe(false)
    }
    expect(report.semanticBoundary.frontierOrigins).toEqual(
      b.report.semanticBoundary.frontierOrigins
    )
    expect(report.semanticBoundary.occurrences.baseline).toBe(
      report.semanticBoundary.occurrences.resolved +
        report.semanticBoundary.occurrences.unresolved
    )
  })
})

describe('Recovery byte provenance for invalid encodings', () => {
  it('preserves the physical full byte hash for a nonAST invalid UTF8 frontier source', () => {
    const vendor = Buffer.concat([
      Buffer.from('export const value=1; //'),
      Buffer.from([255])
    ])
    const f = fixture({
        core: "import 'vendor'; export const result=1;",
        vendor
      }),
      result = f.run()
    expect(result.report.status).toBe('INCOMPLETE')
    const origin = result.report.semanticBoundary.frontierOrigins.find(
      (x) => x.semanticPointer.reason === 'UNKNOWN_ENCODING'
    )
    expect(origin).toMatchObject({
      file: 'node_modules/vendor/index.js',
      fileSha256: hash(vendor),
      start: null,
      end: null,
      kind: 'NonAstDiagnostic'
    })
    expect(result.graph.installed[0]).toMatchObject({
      verified: false,
      contentIdentity: { status: 'MATCH' }
    })
  })
})

describe('Recovery canonical physical origin acquisition', () => {
  it('never acquires the bytes of an installed manifest alias already refused by identity validation', () => {
    const f = fixture({
      core: "import {value} from 'vendor'; export const result=value;",
      vendor: 'export const value=1;'
    })
    const sentinel = JSON.stringify({
      name: 'vendor',
      version: '1.0.0',
      type: 'module',
      main: 'index.js',
      syntheticSentinel: 'outside-evaluated-root-do-not-acquire'
    })
    const outside = write(f.parent, 'synthetic-outside.json', sentinel),
      alias = 'node_modules/vendor/package.json'
    fs.unlinkSync(path.join(f.evaluated, alias))
    fs.symlinkSync(outside, path.join(f.evaluated, alias))
    const result = f.run()
    expect(result.report.status).toBe('INCOMPLETE')
    expect(result.graph.installed.every((x) => !x.verified)).toBe(true)
    const origins = [
      ...result.report.semanticBoundary.origins,
      ...result.report.semanticBoundary.frontierOrigins
    ]
    const matching = origins.filter(
      (x) =>
        x.file === alias ||
        x.requestedFile === alias ||
        x.semanticPointer?.reportedFile === alias
    )
    expect(matching.length).toBeGreaterThan(0)
    expect(
      matching.every((x) => x.file === null && x.fileSha256 === null)
    ).toBe(true)
    expect(origins.some((x) => x.fileSha256 === hash(sentinel))).toBe(false)
  })
})

describe('SPEC0236 runtime resolver conformance', () => {
  it.each(['./sa\tfe.mjs', './sa\nfe.mjs', './sa\rfe.mjs', './sa%66e.mjs'])(
    'refuses a URL-sensitive exports target %j rather than proving a different file',
    (target) => {
      const f = fixture({
        core: "import {value}from'vendor';export const result=value\n",
        vendor: 'export const value=1\n',
        prepare(root) {
          updateJson(root, 'node_modules/vendor/package.json', (x) => {
            x.exports = target
          })
          write(
            root,
            'node_modules/vendor/' + target.slice(2),
            'export const value=1\n'
          )
          write(root, 'node_modules/vendor/safe.mjs', hostileBody(root))
        }
      })
      const oracle = nativeResolution(
        'vendor',
        path.join(f.evaluated, 'packages/core/src/index.js')
      )
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(
        pathToFileURL(path.join(f.evaluated, 'node_modules/vendor/safe.mjs'))
          .href
      )
      expectNoUnsupportedProof(f, f.run())
    }
  )
  it('refuses a URL-sensitive relative ESM edge with an independently selected hostile body', () => {
    const target = './sa\tfe.mjs'
    const f = fixture({
      core: "import {value}from'vendor';export const result=value\n",
      vendor: `export {value}from ${JSON.stringify(target)}\n`,
      prepare(root) {
        write(
          root,
          'node_modules/vendor/' + target.slice(2),
          'export const value=1\n'
        )
        write(root, 'node_modules/vendor/safe.mjs', hostileBody(root))
      }
    })
    const oracle = nativeResolution(
      target,
      path.join(f.evaluated, 'node_modules/vendor/index.js')
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      pathToFileURL(path.join(f.evaluated, 'node_modules/vendor/safe.mjs')).href
    )
    expectNoUnsupportedProof(f, f.run())
  })
  function ownerFixture(missingManifest = false) {
    return fixture({
      core: "import {value}from'vendor';export const result=value\n",
      vendor: "export {value}from'./sub/index.mjs'\n",
      extraInstalledKeys: ['node_modules/other'],
      prepare(root) {
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.dependencies = { other: '1.0.0' }
        })
        write(
          root,
          'node_modules/vendor/sub/index.mjs',
          "export {value}from'other'\n"
        )
        if (missingManifest) {
          write(
            root,
            'node_modules/vendor/sub/node_modules/other/index.js',
            "module.exports=2;import('../../../../../pro'+'ducts/shift/src/index.js')\n"
          )
        } else {
          write(
            root,
            'node_modules/vendor/sub/package.json',
            JSON.stringify({
              name: 'other',
              version: '1.0.0',
              type: 'module',
              exports: './inner.mjs'
            })
          )
          write(
            root,
            'node_modules/vendor/sub/inner.mjs',
            hostileBody(root, '../../../')
          )
        }
        write(
          root,
          'node_modules/other/package.json',
          JSON.stringify({
            name: 'other',
            version: '1.0.0',
            type: 'module',
            main: 'index.js'
          })
        )
        write(root, 'node_modules/other/index.js', 'export const value=1\n')
        updateJson(root, 'package-lock.json', (x) => {
          x.packages['node_modules/vendor'].dependencies = { other: '1.0.0' }
          x.packages['node_modules/other'] = {
            version: '1.0.0',
            resolved: 'https://registry.npmjs.org/other/-/other-1.0.0.tgz',
            integrity: 'sha512-' + Buffer.alloc(64, 2).toString('base64')
          }
        })
      }
    })
  }
  it('refuses an unmodelled nearest self-reference instead of proving the outer package', () => {
    const f = ownerFixture()
    const oracle = nativeResolution(
      'other',
      path.join(f.evaluated, 'node_modules/vendor/sub/index.mjs')
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      pathToFileURL(path.join(f.evaluated, 'node_modules/vendor/sub/inner.mjs'))
        .href
    )
    expectNoUnsupportedProof(f, f.run())
  })
  it('refuses a nearer package directory without manifest instead of skipping to an outer owner', () => {
    const f = ownerFixture(true)
    const oracle = nativeResolution(
      'other',
      path.join(f.evaluated, 'node_modules/vendor/sub/index.mjs')
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      pathToFileURL(
        path.join(
          f.evaluated,
          'node_modules/vendor/sub/node_modules/other/index.js'
        )
      ).href
    )
    expectNoUnsupportedProof(f, f.run())
  })
  function commonJsFixture(exportsTarget) {
    return fixture({
      core: "module.exports=require('vendor')\n",
      vendor: 'module.exports=1\n',
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.type = 'commonjs'
          x.main = 'entry'
          if (exportsTarget !== undefined) x.exports = exportsTarget
        })
        write(root, 'node_modules/vendor/entry.js', 'module.exports=1\n')
      }
    })
  }
  it('keeps exports exact when native CJS refuses a missing extensionless target', () => {
    const f = commonJsFixture('./entry')
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status).toBe(1)
    expect(oracle.stderr).toContain('MODULE_NOT_FOUND')
    expectNoUnsupportedProof(f, f.run())
  })
  it.each([undefined, './entry.js'])(
    'preserves native CJS legacy main or an exact .js exports positive %j',
    (target) => {
      const f = commonJsFixture(target)
      const oracle = nativeResolution(
        'vendor',
        path.join(f.evaluated, 'packages/core/src/index.js'),
        'require'
      )
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(
        path.join(f.evaluated, 'node_modules/vendor/entry.js')
      )
      const result = f.run()
      expect(result.report.status, result.stdout).toBe('PASS')
      expect(result.report.semanticBoundary.status).toBe('PROVEN')
      expect(result.graph.installed[0].verified).toBe(true)
    }
  )
  it('preserves a known product FAIL before URL-profile refusal', () => {
    const target = './sa\tfe.mjs'
    const f = fixture({
      core: "import {value}from'vendor';export const result=value\n",
      vendor: 'export const value=1\n',
      prepare(root) {
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.exports = target
        })
        write(
          root,
          'node_modules/vendor/' + target.slice(2),
          'export const value=1\n'
        )
        write(
          root,
          'node_modules/vendor/safe.mjs',
          hostileBody(root, '../../', true)
        )
      }
    })
    const result = f.run()
    expect(result.report.status).toBe('FAIL')
    expect(
      result.report.diagnostics.some(
        (x) => x.reason === 'INSTALLED_PACKAGE_REFERENCES_PRODUCT'
      )
    ).toBe(true)
    expect(result.report.semanticBoundary.status).toBe('UNKNOWN')
    expect(result.graph.installed[0].verified).toBe(false)
    expect(fs.existsSync(path.join(f.parent, 'target-was-executed'))).toBe(
      false
    )
  })

  it.each(['cjs', 'json'])(
    'refuses an unsupported legacy fallback candidate %s',
    (kind) => {
      const f = fixture({
        core: "module.exports=require('vendor')\n",
        vendor: 'module.exports=1\n',
        prepare(root) {
          updateJson(root, 'packages/core/package.json', (x) => {
            x.type = 'commonjs'
          })
          updateJson(root, 'node_modules/vendor/package.json', (x) => {
            x.type = 'commonjs'
            x.main = 'entry'
          })
          if (kind === 'cjs')
            write(root, 'node_modules/vendor/entry.cjs', 'module.exports=1\n')
          else {
            write(root, 'node_modules/vendor/entry.json', '{"value":2}')
            write(
              root,
              'node_modules/vendor/entry/index.js',
              'module.exports=1\n'
            )
          }
        }
      })
      const oracle = nativeResolution(
        'vendor',
        path.join(f.evaluated, 'packages/core/src/index.js'),
        'require'
      )
      if (kind === 'cjs') {
        expect(oracle.status, oracle.stderr).toBe(0)
        expect(oracle.stdout).toBe(
          path.join(f.evaluated, 'node_modules/vendor/index.js')
        )
      } else {
        expect(oracle.status, oracle.stderr).toBe(0)
        expect(oracle.stdout).toBe(
          path.join(f.evaluated, 'node_modules/vendor/entry.json')
        )
      }
      expectNoUnsupportedProof(f, f.run())
    }
  )
  it('refuses a relative directory package config instead of guessing index.js', () => {
    const f = fixture({
      core: "module.exports=require('vendor')\n",
      vendor: "module.exports=require('./entry')\n",
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.type = 'commonjs'
        })
        write(
          root,
          'node_modules/vendor/entry/package.json',
          JSON.stringify({
            name: 'nested',
            version: '1.0.0',
            type: 'commonjs',
            main: 'inner.js'
          })
        )
        write(root, 'node_modules/vendor/entry/index.js', 'module.exports=1\n')
        write(
          root,
          'node_modules/vendor/entry/inner.js',
          "import('../../../pro'+'ducts/shift/src/index.js');module.exports=2\n"
        )
      }
    })
    const oracle = nativeResolution(
      './entry',
      path.join(f.evaluated, 'node_modules/vendor/index.js'),
      'require'
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      path.join(f.evaluated, 'node_modules/vendor/entry/inner.js')
    )
    expectNoUnsupportedProof(f, f.run())
  })
  it('refuses external NODE_PATH in the closed runtime profile', () => {
    const f = fixture({
      core: "import {value}from'vendor';export const result=value\n",
      vendor: 'export const value=1\n'
    })
    expectNoUnsupportedProof(
      f,
      f.run(['--semantic'], {
        NODE_PATH: path.join(f.parent, 'external-modules')
      })
    )
  })
  it('refuses require into an ESM namespace whose interop shape is not modelled', () => {
    const f = fixture({
      core: "module.exports=require('vendor')\n",
      vendor: 'export const value=1\n',
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
      }
    })
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      path.join(f.evaluated, 'node_modules/vendor/index.js')
    )
    expectNoUnsupportedProof(f, f.run())
  })
  it('refuses an invalid exports dot segment instead of normalizing to another file', () => {
    const f = fixture({
      core: "module.exports=require('vendor')\n",
      vendor: 'module.exports=1\n',
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.type = 'commonjs'
          x.exports = './entry/../safe.js'
        })
        write(root, 'node_modules/vendor/safe.js', 'module.exports=1\n')
      }
    })
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status).toBe(1)
    expect(oracle.stderr).toContain('ERR_INVALID_PACKAGE_TARGET')
    expectNoUnsupportedProof(f, f.run())
  })
  function absoluteMainFixture(withExports = false) {
    return fixture({
      core: "module.exports=require('vendor')\n",
      vendor: 'module.exports=1\n',
      prepare(root) {
        const native = path.join(path.dirname(root), 'native-main.cjs')
        fs.writeFileSync(
          native,
          "import('./evaluated/pro'+'ducts/shift/src/index.js');module.exports=2\n"
        )
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.type = 'commonjs'
          x.main = native
          if (withExports) x.exports = './entry.js'
        })
        write(root, 'node_modules/vendor/' + native, 'module.exports=1\n')
        write(root, 'node_modules/vendor/entry.js', 'module.exports=1\n')
      }
    })
  }
  it('refuses an absolute legacy main before constructing a package-relative substitute', () => {
    const f = absoluteMainFixture()
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(path.join(f.parent, 'native-main.cjs'))
    const kernel = standaloneKernel(f)
    expect(kernel.status, JSON.stringify(kernel)).toBe('UNKNOWN')
    expect(kernel.proofs).toEqual([])
    expectNoUnsupportedProof(f, f.run())
  })
  function siblingFixture(extension = 'js', withExports = false) {
    return fixture({
      core: "module.exports=require('vendor')\n",
      vendor: 'module.exports=1\n',
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (x) => {
          x.type = 'commonjs'
        })
        updateJson(root, 'node_modules/vendor/package.json', (x) => {
          x.type = 'commonjs'
          x.main = 'entry.js'
          if (withExports) x.exports = './entry.js'
        })
        write(root, 'node_modules/vendor/entry.js', 'module.exports=1\n')
        write(
          root,
          'node_modules/vendor.' + extension,
          extension === 'js'
            ? "import('../pro'+'ducts/shift/src/index.js');module.exports=2\n"
            : extension === 'json'
              ? '{"value":2}'
              : 'synthetic-native-marker-never-load'
        )
      }
    })
  }
  it.each(['js', 'json', 'node'])(
    'refuses CJS sibling file precedence before a legacy owner %s',
    (extension) => {
      const f = siblingFixture(extension)
      const oracle = nativeResolution(
        'vendor',
        path.join(f.evaluated, 'packages/core/src/index.js'),
        'require'
      )
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(
        path.join(f.evaluated, 'node_modules/vendor.' + extension)
      )
      const kernel = standaloneKernel(f)
      expect(kernel.status, JSON.stringify(kernel)).toBe('UNKNOWN')
      expect(kernel.proofs).toEqual([])
      expect(
        kernel.installed.every(
          (x) => x.status !== 'PROVEN' && x.proofIds.length === 0
        )
      ).toBe(true)
      const result = f.run()
      // The unchanged P1 reader rejects this unsupported file layout before JSON.
      // Keep that refusal explicit; it must never disguise a kernel false proof.
      expect(result.code).not.toBe(0)
      if (result.report) {
        expect(result.report.status).not.toBe('PASS')
        expect(result.report.semanticBoundary?.status).not.toBe('PROVEN')
      } else expect(result.stderr).toContain('ENOTDIR')
    }
  )
  it('preserves CJS exports first ahead of a sibling file', () => {
    const f = siblingFixture('js', true)
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      path.join(f.evaluated, 'node_modules/vendor/entry.js')
    )
    expect(standaloneKernel(f).status).toBe('PROVEN')
    const result = f.run()
    expect(result.report.status, result.stdout).toBe('PASS')
    expect(result.graph.installed[0].verified).toBe(true)
  })
  it('ignores an unselected absolute main behind exact exports', () => {
    const f = absoluteMainFixture(true)
    const oracle = nativeResolution(
      'vendor',
      path.join(f.evaluated, 'packages/core/src/index.js'),
      'require'
    )
    expect(oracle.status, oracle.stderr).toBe(0)
    expect(oracle.stdout).toBe(
      path.join(f.evaluated, 'node_modules/vendor/entry.js')
    )
    expect(standaloneKernel(f).status).toBe('PROVEN')
    const result = f.run()
    expect(result.report.status, result.stdout).toBe('PASS')
    expect(result.graph.installed[0].verified).toBe(true)
  })
})

describe('SPEC0236 exact native builtin precedence', () => {
  function builtinFixture(specifier, mode, selfReference = false) {
    const name = specifier.replace(/^node:/, '').split('/')[0]
    const key = 'node_modules/' + name
    const f = fixture({
      core:
        mode === 'require'
          ? `module.exports=require('${specifier}')\n`
          : `import {value}from'${specifier}';export const result=value\n`,
      vendor: 'export const value=1\n',
      extraInstalledKeys: [key],
      prepare(root) {
        updateJson(root, 'packages/core/package.json', (body) => {
          body.type = mode === 'require' ? 'commonjs' : 'module'
          if (selfReference) {
            body.name = name
            body.exports = './src/index.js'
          }
        })
        write(
          root,
          key + '/package.json',
          JSON.stringify({
            name,
            version: '1.0.0',
            type: mode === 'require' ? 'commonjs' : 'module',
            main: './index.js'
          })
        )
        const bytes =
          mode === 'require' ? 'module.exports=1\n' : 'export const value=1\n'
        write(root, key + '/index.js', bytes)
        write(root, key + '/promises.js', bytes)
      }
    })
    return { f, key }
  }
  it.each(
    ['require', 'import'].flatMap((mode) =>
      ['module', 'fs', 'fs/promises', 'node:fs', 'node:test'].map(
        (specifier) => [mode, specifier]
      )
    )
  )(
    'refuses native builtin %s %s before a homonymous package proof',
    (mode, specifier) => {
      const { f, key } = builtinFixture(specifier, mode)
      const oracle = nativeResolution(
        specifier,
        path.join(f.evaluated, 'packages/core/src/index.js'),
        mode
      )
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(
        mode === 'require'
          ? specifier
          : specifier.startsWith('node:')
            ? specifier
            : 'node:' + specifier
      )
      const kernel = standaloneKernel(f, key)
      expect(kernel.status, JSON.stringify(kernel)).toBe('UNKNOWN')
      expect(kernel.proofs).toEqual([])
      expect(
        kernel.unknowns.some((item) => item.reason === 'UNKNOWN_NATIVE_BUILTIN')
      ).toBe(true)
      expect(
        kernel.inputs.some((item) => item.file.startsWith(key + '/'))
      ).toBe(false)
      expect(
        kernel.installed.every(
          (item) => item.status !== 'PROVEN' && !item.proofIds.length
        )
      ).toBe(true)
      const cli = f.run()
      expect(cli.code).not.toBe(0)
      expect(cli.report.status).toBe('INCOMPLETE')
      expect(cli.report.semanticBoundary.proofs).toEqual([])
      expect(cli.graph.installed.every((item) => !item.verified)).toBe(true)
    }
  )
  it.each(['require', 'import'])(
    'dispatches native builtin before same-name self-reference in %s',
    (mode) => {
      const { f, key } = builtinFixture('module', mode, true)
      const oracle = nativeResolution(
        'module',
        path.join(f.evaluated, 'packages/core/src/index.js'),
        mode
      )
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(mode === 'require' ? 'module' : 'node:module')
      const kernel = standaloneKernel(f, key)
      expect(kernel.status).toBe('UNKNOWN')
      expect(kernel.proofs).toEqual([])
      expect(
        kernel.unknowns.some((item) => item.reason === 'UNKNOWN_NATIVE_BUILTIN')
      ).toBe(true)
      expect(
        kernel.inputs.some((item) => item.file.startsWith(key + '/'))
      ).toBe(false)
    }
  )
  it.each(['require', 'import'])(
    'keeps bare test an ordinary package when only node:test is builtin in %s',
    (mode) => {
      const { f, key } = builtinFixture('test', mode)
      const oracle = nativeResolution(
        'test',
        path.join(f.evaluated, 'packages/core/src/index.js'),
        mode
      )
      const selected = path.join(f.evaluated, key, 'index.js')
      expect(oracle.status, oracle.stderr).toBe(0)
      expect(oracle.stdout).toBe(
        mode === 'require' ? selected : pathToFileURL(selected).href
      )
      const kernel = standaloneKernel(f, key)
      expect(kernel.status, JSON.stringify(kernel)).toBe('PROVEN')
      expect(
        kernel.inputs.some((item) => item.file === key + '/index.js')
      ).toBe(true)
      expect(kernel.unknowns).toEqual([])
    }
  )
})
