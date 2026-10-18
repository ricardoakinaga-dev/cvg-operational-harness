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
function fixture({ core = 'export const result = 1\n', vendor, payload } = {}) {
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
  }
  const packages = vendor
    ? [
        {
          key,
          name: 'vendor',
          version: '1.0.0',
          ...collectPackageInventory(path.join(reference, key))
        }
      ]
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
      source: 'semantic-kernel-v1',
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
