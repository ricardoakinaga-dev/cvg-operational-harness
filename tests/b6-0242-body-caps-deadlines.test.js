// @vitest-environment node
// SPEC0242 L1–L3: the body caps and the semantic deadline (constants only,
// never raised by flag, env or input), the width pattern that cut the real
// tree, and the installed identity comparator clock counted per phase.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import * as identity from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const {
  canonicalJson,
  collectPackageInventory,
  createInstalledIdentityComparator,
  fingerprintResolution,
  fingerprintToolchain,
  INSTALLED_IDENTITY_LIMITS,
  pinnedToolchainLocation
} = identity
const NODE = pinnedToolchainLocation().node
const SCRIPTS = path.resolve(import.meta.dirname, '../scripts')
const ENGINE = path.join(SCRIPTS, 'boundary-semantic-engine.mjs')
const PARSER = path.resolve(
  SCRIPTS,
  '../node_modules/typescript/lib/typescript.js'
)
const PARENT = ownedRunParent('b6-0242-caps')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const roots = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
function write(root, file, value) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof value === 'string' ? value : JSON.stringify(value)
  )
  return target
}

// Constant caller code, as in the SPEC0241 suite: every datum arrives on
// stdin, and any file: load outside the engine directory and the parser is
// refused, so targets are parsed as bytes only.
const RUNNER =
  "import fs from 'node:fs';import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';" +
  'const[engine,parser]=process.argv.slice(1);const dir=pathToFileURL(engine.slice(0,engine.lastIndexOf("/")+1)).href;' +
  'const parserURL=pathToFileURL(parser).href;let blocked=0;' +
  "registerHooks({load(u,c,next){if(u.startsWith('file:')&&!u.startsWith(dir)&&u!==parserURL){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(u,c)}});" +
  "const req=JSON.parse(fs.readFileSync(0,'utf8'));" +
  'const e=await import(pathToFileURL(engine).href);' +
  'const results=req.calls.map((c)=>c.method==="limits"?{...e.SEMANTIC_LIMITS}:e[c.method](...c.args));' +
  'process.stdout.write(JSON.stringify({results,blocked}))'
function batch(calls, extraEnv = {}) {
  const r = spawnSync(
    NODE,
    ['--input-type=module', '-e', RUNNER, ENGINE, PARSER],
    {
      input: JSON.stringify({ calls }),
      cwd: PARENT,
      env: {
        PATH: path.dirname(NODE) + ':/usr/bin:/bin',
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC',
        TMPDIR: PARENT,
        ...extraEnv
      },
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
const tuples = (out) =>
  out.unknowns.map((u) => [u.file, u.reason, u.detail ?? ''])

describe('SPEC0242 L1/L2 values', () => {
  const APPROVED = {
    maxFileBytes: 16 * 1024 ** 2,
    maxTotalBytes: 256 * 1024 ** 2,
    maxFiles: 12000,
    maxNodes: 2000000,
    maxUnionValues: 128,
    maxContexts: 256,
    maxCallDepth: 64,
    maxStates: 250000,
    timeoutMs: 300000
  }

  it('LB01: exact constants; no flag or environment raises them', () => {
    const [plain] = batch([{ method: 'limits' }])
    expect(plain).toEqual(APPROVED)
    const [withEnv] = batch([{ method: 'limits' }], {
      CVG_DIAG_LIMITS: JSON.stringify({ maxContexts: 1e9, timeoutMs: 1e9 }),
      CVG_SEMANTIC_LIMITS: '{"maxStates":1000000000}',
      SEMANTIC_TIMEOUT_MS: '1000000000'
    })
    expect(withEnv).toEqual(APPROVED)
  }, 120000)

  it('LB01: an input can only reduce a limit, never raise it', () => {
    const root = fs.mkdtempSync(path.join(PARENT, 'raise-'))
    roots.push(root)
    write(root, 'package.json', { name: 'r', private: true, type: 'module' })
    write(root, 'entry.mjs', 'export default 1\n')
    const base = { root, starts: ['entry.mjs'], origins: [], installed: [] }
    const outs = batch(
      [{ maxContexts: 257 }, { maxStates: 250001 }, { timeoutMs: 300001 }].map(
        (limits) => ({
          method: 'runSemanticBoundary',
          args: [{ ...base, limits }]
        })
      )
    )
    for (const out of outs)
      expect(tuples(out)).toEqual([['', 'UNKNOWN_INVALID_LIMITS', '']])
  }, 120000)

  it('LB01/LB02: the width pattern of the real cut completes, and a reduced cap still cuts it', () => {
    // A registration helper called at module top level once per name, each
    // call with a distinct literal: one context per call (like __name).
    const calls = Array.from({ length: 80 }, (_, i) => `nm(f, 'n${i}')`)
    const root = fs.mkdtempSync(path.join(PARENT, 'width-'))
    roots.push(root)
    write(root, 'package.json', { name: 'w', private: true, type: 'module' })
    write(
      root,
      'entry.mjs',
      'function nm(fn, value) { return fn }\nfunction f() { return 1 }\n' +
        calls.join('\n') +
        '\nexport default 1\n'
    )
    const base = { root, starts: ['entry.mjs'], origins: [], installed: [] }
    const [free] = batch([{ method: 'runSemanticBoundary', args: [base] }])
    expect(free.phases.body).toBe('COMPLETED')
    expect(free.usage.contexts).toBeGreaterThan(64)
    const used = free.usage.contexts
    const [cut, at] = batch(
      [used - 1, used].map((maxContexts) => ({
        method: 'runSemanticBoundary',
        args: [{ ...base, limits: { maxContexts } }]
      }))
    )
    expect(cut.phases.body).toBe('CUT:maxContexts')
    expect(tuples(cut)).toContainEqual([
      '',
      'UNKNOWN_ANALYSIS_LIMIT',
      'UNKNOWN_ANALYSIS_LIMIT:maxContexts'
    ])
    expect(cut.validation.valid).toBe(true)
    expect(at.phases.body).toBe('COMPLETED')
  }, 300000)
})

describe('SPEC0242 L3 comparator clock per phase', () => {
  const KEY = 'node_modules/vendor'
  let trustedToolchain
  beforeAll(() => {
    trustedToolchain = fingerprintToolchain()
  })
  function comparatorFixture() {
    const parent = fs.mkdtempSync(path.join(PARENT, 'cmp-'))
    roots.push(parent)
    const evaluated = path.join(parent, 'evaluated'),
      reference = path.join(parent, 'reference')
    const lock = {
      lockfileVersion: 3,
      packages: {
        '': { name: 'synthetic', version: '1.0.0' },
        [KEY]: {
          version: '1.0.0',
          resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
          integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
        }
      }
    }
    for (const root of [evaluated, reference]) {
      write(root, 'package.json', { name: 'synthetic', version: '1.0.0' })
      write(root, 'package-lock.json', lock)
      write(root, KEY + '/package.json', '{"name":"vendor","version":"1.0.0"}')
      write(root, KEY + '/index.js', 'module.exports = 1\n')
    }
    const inventory = collectPackageInventory(path.join(reference, KEY))
    const receipt = {
      schemaVersion: 1,
      kind: 'cvg-installed-content-reference',
      commit: 'f'.repeat(40),
      root: reference,
      ...fingerprintResolution(reference),
      toolchain: trustedToolchain,
      toolchainSha256: hash(canonicalJson(trustedToolchain)),
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
        entries: inventory.usage.entries,
        regularBytes: inventory.usage.regularBytes,
        maxDepth: inventory.usage.maxDepth
      },
      packages: [{ key: KEY, name: 'vendor', version: '1.0.0', ...inventory }]
    }
    const bytes = canonicalJson(receipt)
    const manifestPath = write(parent, 'receipt.json', bytes)
    const options = { manifestPath, expectedSha256: hash(bytes) }
    return {
      create: (extra = {}) =>
        createInstalledIdentityComparator(evaluated, { ...options, ...extra }),
      compare: (c) => c.compare(path.join(evaluated, KEY), KEY)
    }
  }
  // A synthetic clock: frozen unless `step` is set, then it advances by
  // `step` milliseconds on every reading.
  function fakeClock() {
    const clock = { now: 1000, step: 0 }
    vi.spyOn(globalThis.performance, 'now').mockImplementation(() => {
      clock.now += clock.step
      return clock.now
    })
    return clock
  }

  it('LB02/LB03: a step between finalizations longer than the budget does not consume it', () => {
    const f = comparatorFixture()
    const clock = fakeClock()
    const c = f.create()
    expect(f.compare(c).status).toBe('MATCH')
    clock.now += 1000
    const first = c.finalize()
    expect(first.status).toBe('COMPLETE')
    // The semantic step of the checker: 200 s outside the verifier. Before
    // L3 this alone made the final revalidation COMPARISON_TIMEOUT.
    clock.now += 200000
    const final = c.finalize()
    expect(final.reasons).toEqual([])
    expect(final.status).toBe('COMPLETE')
    expect(final.usage.packages).toBe(1)
    expect(first.usage.phaseMs).toBe(1000)
    expect(final.usage.phaseMs).toBe(0)
  })

  it('LB03: phase 1 alone over the reduced budget times out', () => {
    const f = comparatorFixture()
    const clock = fakeClock()
    const c = f.create({ testOnly: { comparisonTimeoutMs: 1000 } })
    clock.now += 1500
    expect(f.compare(c).status).not.toBe('MATCH')
    expect(c.finalize()).toMatchObject({
      status: 'UNAVAILABLE',
      reasons: ['COMPARISON_TIMEOUT']
    })
  })

  it('LB03: a later finalization that alone exceeds the reduced budget times out', () => {
    const f = comparatorFixture()
    const clock = fakeClock()
    const c = f.create({ testOnly: { comparisonTimeoutMs: 1000 } })
    expect(f.compare(c).status).toBe('MATCH')
    expect(c.finalize().status).toBe('COMPLETE')
    clock.now += 500000
    clock.step = 400
    expect(c.finalize()).toMatchObject({
      status: 'UNAVAILABLE',
      reasons: ['COMPARISON_TIMEOUT']
    })
  })

  it('LB03: compare after the first finalization invalidates the whole verifier', () => {
    const f = comparatorFixture()
    fakeClock()
    const c = f.create()
    const earlier = f.compare(c)
    expect(earlier.status).toBe('MATCH')
    expect(c.finalize().status).toBe('COMPLETE')
    const late = f.compare(c)
    expect(late.status).toBe('UNAVAILABLE')
    expect(late.reasons).toContain('COMPARISON_AFTER_FINALIZE')
    expect(earlier.status).toBe('UNAVAILABLE')
    expect(c.finalize()).toMatchObject({
      status: 'UNAVAILABLE',
      reasons: ['COMPARISON_AFTER_FINALIZE']
    })
  })

  it.each([120001, -1, 1.5, '1000', null])(
    'LB03: the test budget %s is refused (reduction only)',
    (value) => {
      const f = comparatorFixture()
      expect(() =>
        f.create({ testOnly: { comparisonTimeoutMs: value } })
      ).toThrow('TEST_LIMIT_INVALID')
    }
  )
})
