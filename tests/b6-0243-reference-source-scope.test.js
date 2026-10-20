// SPEC0243 E1, portable controls: the closed exclusion constant, prefix
// exactness, the static guard and the installed receipt reader. The recipes
// themselves need the physical git/tar/strace pins and run in the native
// profile (tests/b6-0243-reference-source-scope.integration.js).
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import * as identity from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const {
  canonicalJson,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  createInstalledIdentityComparator,
  INSTALLED_IDENTITY_LIMITS
} = identity
const TMP = ownedRunParent('b6-0243-scope')
const PREFIX = 'docs/04_audit/evidence'
const hash = (value) => createHash('sha256').update(value).digest('hex')
const roots = []
let trustedToolchain
beforeAll(() => {
  trustedToolchain = fingerprintToolchain()
})
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
function temp() {
  const root = fs.mkdtempSync(path.join(TMP, 'case-'))
  roots.push(root)
  return root
}
function write(root, file, body) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(
    target,
    typeof body === 'string' ? body : JSON.stringify(body)
  )
  return target
}

describe('SPEC0243 closed exclusion list', () => {
  it('RS02/RS05: one frozen constant, equal to the approved prefix', () => {
    expect(identity.REFERENCE_SOURCE_EXCLUSIONS).toEqual([PREFIX])
    expect(Object.isFrozen(identity.REFERENCE_SOURCE_EXCLUSIONS)).toBe(true)
    expect(() => identity.REFERENCE_SOURCE_EXCLUSIONS.push('x')).toThrow()
  })

  it('RS02: the prefix is exact, case-sensitive and bounded by path components', () => {
    const excluded = identity.referenceSourceExcluded
    for (const name of [PREFIX, PREFIX + '/a.txt', PREFIX + '/sub/b.json'])
      expect(excluded(name)).toBe(true)
    for (const name of [
      'docs/04_audit/evidencex/c.txt',
      'docs/04_audit/Evidence/d.txt',
      'x/docs/04_audit/evidence/e.txt',
      'docs/04_audit/evidence.json',
      'docs/04_audit',
      'docs'
    ])
      expect(excluded(name)).toBe(false)
  })

  it('RS07: no installed identity limit changes', () => {
    expect(INSTALLED_IDENTITY_LIMITS).toEqual({
      maxCompressedBytes: 2 * 1024 ** 3,
      maxTotalBytes: 4 * 1024 ** 3,
      maxPackageBytes: 512 * 1024 ** 2,
      maxEntries: 200_000,
      maxDepth: 64,
      maxProcesses: 8,
      npmTimeoutMs: 180_000,
      comparisonTimeoutMs: 120_000
    })
  })
})

describe('SPEC0243 §3.3 static guard', () => {
  function guard(manifest, lock, names) {
    const root = temp()
    if (manifest !== undefined) write(root, 'package.json', manifest)
    if (lock !== undefined) write(root, 'package-lock.json', lock)
    return identity.referenceSourceExclusionConflict(root, [
      'package.json',
      'package-lock.json',
      ...names
    ])
  }
  const plainLock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'synthetic', version: '1.0.0' },
      'node_modules/safe': { version: '1.0.0' }
    }
  }
  const manifest = (workspaces) => ({
    name: 'synthetic',
    version: '1.0.0',
    workspaces
  })

  it('RS04: a workspace glob reaching a manifest under the prefix is a conflict', () => {
    for (const [pattern, names] of [
      ['docs/04_audit/*/*', [PREFIX + '/w/package.json']],
      ['docs/**', [PREFIX + '/deep/x/package.json']],
      ['*/*/evid?nce/*', [PREFIX + '/w/package.json']]
    ])
      expect(guard(manifest([pattern]), plainLock, names)).toMatch(
        /^workspace:/
      )
    expect(
      guard(manifest({ packages: ['docs/04_audit/*/*'] }), plainLock, [
        PREFIX + '/w/package.json'
      ])
    ).toMatch(/^workspace:/)
  })

  it('RS04: a wildcard glob reaching any directory under the prefix is a conflict, manifest or not', () => {
    for (const [pattern, names] of [
      ['docs/04_audit/*', [PREFIX + '/a.txt']],
      ['docs/**', [PREFIX + '/x/y.txt']],
      ['docs/*/evidence/*', [PREFIX + '/sub/b.json']]
    ])
      expect(guard(manifest([pattern]), plainLock, names)).toMatch(
        /^workspace:/
      )
    expect(
      guard(manifest(['docs/04_audit/*']), plainLock, [
        'docs/04_audit/evidencex/a.txt'
      ])
    ).toBe(null)
  })

  it('RS04: a literal workspace path under the prefix is a conflict even without a manifest', () => {
    expect(guard(manifest([PREFIX + '/tool']), plainLock, [])).toMatch(
      /^workspace:/
    )
  })

  it('RS04: lock keys, link targets and file: dependencies under the prefix are conflicts', () => {
    const lockWith = (entries) => ({
      ...plainLock,
      packages: { ...plainLock.packages, ...entries }
    })
    expect(
      guard(
        manifest([]),
        lockWith({ [PREFIX + '/pkg']: { version: '1.0.0' } }),
        []
      )
    ).toMatch(/^lock:/)
    expect(
      guard(
        manifest([]),
        lockWith({
          'node_modules/linked': { link: true, resolved: PREFIX + '/pkg' }
        }),
        []
      )
    ).toMatch(/^lock-target:/)
    for (const resolved of [
      'file:' + PREFIX + '/pkg.tgz',
      'file:./' + PREFIX + '/pkg'
    ])
      expect(
        guard(
          manifest([]),
          lockWith({ 'node_modules/local': { version: '1.0.0', resolved } }),
          []
        )
      ).toMatch(/^lock-target:/)
  })

  it('RS04: any .npmrc under the prefix is a conflict (strict reading)', () => {
    expect(guard(manifest([]), plainLock, [PREFIX + '/x/.npmrc'])).toMatch(
      /^npmrc:/
    )
  })

  it('RS04: siblings, other cases and nested look-alikes are not conflicts', () => {
    expect(
      guard(manifest(['packages/*', 'docs/04_audit/evidencex/*']), plainLock, [
        'packages/a/package.json',
        'docs/04_audit/evidencex/w/package.json',
        'docs/04_audit/Evidence/w/package.json',
        'x/' + PREFIX + '/w/package.json',
        'x/' + PREFIX + '/.npmrc',
        PREFIX + '/fixture/package.json',
        PREFIX + '/fixture/package-lock.json',
        PREFIX + '/fixture/tsconfig.json',
        PREFIX + '/node_modules/x/package.json'
      ])
    ).toBe(null)
  })

  it('RS04: a tracked manifest or lock above the 16 MiB cap is a conflict', () => {
    const big = ' '.repeat(16 * 1024 * 1024 + 1)
    expect(guard(big, plainLock, [])).toBe('oversized:package.json')
    expect(guard(manifest([]), big, [])).toBe('oversized:package-lock.json')
    expect(guard(manifest([]), ' '.repeat(16 * 1024 * 1024), [])).toBe(null)
  })

  it('RS04: malformed manifests are left to the existing refusals', () => {
    expect(guard('{not json', '{not json', [PREFIX + '/a.txt'])).toBe(null)
    expect(guard(undefined, undefined, [])).toBe(null)
  })
})

describe('SPEC0243 §3.4 installed receipt reader', () => {
  const KEY = 'node_modules/vendor'
  function receiptFixture(recipeExtra) {
    const parent = temp(),
      evaluated = path.join(parent, 'evaluated'),
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
        ...recipeExtra
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
    return () =>
      createInstalledIdentityComparator(evaluated, {
        manifestPath,
        expectedSha256: hash(bytes)
      })
  }

  it('RS05: the receipt carries exactly the closed exclusion list', () => {
    const comparator = receiptFixture({ sourceExclusions: [PREFIX] })()
    expect(comparator.finalize().status).toBe('COMPLETE')
  })

  it.each([
    ['missing', {}],
    ['different', { sourceExclusions: ['docs/04_audit'] }],
    ['extra', { sourceExclusions: [PREFIX, 'docs'] }],
    ['empty', { sourceExclusions: [] }],
    ['not a list', { sourceExclusions: PREFIX }]
  ])('RS05: a %s exclusion list is refused', (_, extra) => {
    expect(receiptFixture(extra)).toThrow('REFERENCE_SOURCE_SCOPE_INVALID')
  })
})
