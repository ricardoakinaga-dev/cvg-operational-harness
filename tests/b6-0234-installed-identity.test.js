import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  canonicalJson,
  sha256File,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  createInstalledIdentityComparator,
  INSTALLED_IDENTITY_LIMITS
} from '../scripts/boundary-installed-identity.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const TMP = ownedRunParent('b6-0234-comparer')
const roots = []
const hash = (value) => createHash('sha256').update(value).digest('hex')
const KEY = 'node_modules/vendor'
let trustedToolchain
beforeAll(() => {
  trustedToolchain = fingerprintToolchain()
})
function temp() {
  const root = fs.mkdtempSync(path.join(TMP, 'case-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
function write(root, file, body) {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, body)
  return target
}
function fixture({ nested = false, links = false } = {}) {
  const parent = temp(),
    evaluated = path.join(parent, 'evaluated'),
    reference = path.join(parent, 'reference')
  const nestedKey = KEY + '/node_modules/@scope/inner'
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'synthetic', version: '1.0.0' },
      [KEY]: {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
        integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
      },
      ...(nested
        ? {
            [nestedKey]: {
              version: '2.0.0',
              resolved:
                'https://registry.npmjs.org/@scope/inner/-/inner-2.0.0.tgz',
              integrity: 'sha512-' + Buffer.alloc(64, 2).toString('base64')
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
        workspaces: ['packages/*']
      })
    )
    write(root, 'packages/core/package.json', '{"name":"core"}')
    write(root, 'package-lock.json', JSON.stringify(lock))
    write(root, KEY + '/package.json', '{"name":"vendor","version":"1.0.0"}')
    write(root, KEY + '/index.js', 'module.exports = 1\n')
    write(root, KEY + '/.hidden.payload', 'opaque\0synthetic bytes')
    write(
      root,
      KEY + '/data/no-known-extension',
      'unrecognized extension included'
    )
    if (nested) {
      write(
        root,
        nestedKey + '/package.json',
        '{"name":"@scope/inner","version":"2.0.0"}'
      )
      write(root, nestedKey + '/entry.js', 'module.exports = 2\n')
    }
    if (links) fs.symlinkSync('index.js', path.join(root, KEY, 'internal'))
  }
  const packages = [KEY, ...(nested ? [nestedKey] : [])].map((key) => ({
    key,
    name: key === KEY ? 'vendor' : '@scope/inner',
    version: key === KEY ? '1.0.0' : '2.0.0',
    ...collectPackageInventory(path.join(reference, key))
  }))
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
      entries: packages.reduce((sum, p) => sum + p.usage.entries, 0),
      regularBytes: packages.reduce((sum, p) => sum + p.usage.regularBytes, 0),
      maxDepth: Math.max(...packages.map((p) => p.usage.maxDepth))
    },
    packages
  }
  const manifestPath = path.join(parent, 'receipt.json')
  const save = (bytes = canonicalJson(receipt)) => {
    fs.writeFileSync(manifestPath, bytes)
    return { manifestPath, expectedSha256: sha256File(manifestPath) }
  }
  let installedReference = save()
  const comparator = () =>
    createInstalledIdentityComparator(evaluated, installedReference)
  return {
    parent,
    evaluated,
    reference,
    receipt,
    nestedKey,
    manifestPath,
    get options() {
      return installedReference
    },
    save(bytes) {
      installedReference = save(bytes)
      return installedReference
    },
    comparator,
    compare(c = comparator(), key = KEY) {
      return { c, result: c.compare(path.join(evaluated, key), key) }
    }
  }
}

describe('SPEC0234 installed physical identity', () => {
  it('ID-05 requires canonical recursive lexical JSON and a terminal LF', () => {
    expect(canonicalJson({ z: { b: 2, a: 1 }, a: [2, 1] })).toBe(
      '{"a":[2,1],"z":{"a":1,"b":2}}\n'
    )
    expect(canonicalJson({ 2: 'two', 10: 'ten' })).toBe(
      '{"10":"ten","2":"two"}\n'
    )
    for (const bad of [
      undefined,
      NaN,
      Infinity,
      [undefined],
      { missing: undefined }
    ])
      expect(() => canonicalJson(bad)).toThrow()
  })

  it('ID-01 inventories every physical file and compares bytes without granting approval', () => {
    const f = fixture()
    const { c, result } = f.compare()
    expect(result.status).toBe('MATCH')
    expect(result.verified).not.toBe(true)
    expect(result.inventory.evaluated.entries.map((e) => e.path)).toEqual([
      '.hidden.payload',
      'data',
      'data/no-known-extension',
      'index.js',
      'package.json'
    ])
    expect(result.inventory.evaluated.usage.entries).toBe(5)
    expect(c.finalize().status).toBe('COMPLETE')
    expect(result.status).toBe('MATCH')
    expect(Object.keys(result.inventory.evaluated)).not.toContain('_inodes')
    expect(JSON.stringify(result)).not.toContain('signature')
  })

  it.each([
    [
      'body',
      (root) => write(root, KEY + '/index.js', 'module.exports = 9\n'),
      'index.js'
    ],
    [
      'hidden',
      (root) => write(root, KEY + '/.hidden.payload', 'changed'),
      '.hidden.payload'
    ],
    [
      'unknown extension',
      (root) => write(root, KEY + '/data/no-known-extension', 'changed'),
      'data/no-known-extension'
    ],
    ['extra', (root) => write(root, KEY + '/extra.bin', 'extra'), 'extra.bin'],
    [
      'missing',
      (root) => fs.unlinkSync(path.join(root, KEY, 'index.js')),
      'index.js'
    ],
    [
      'type',
      (root) => {
        fs.unlinkSync(path.join(root, KEY, 'index.js'))
        fs.mkdirSync(path.join(root, KEY, 'index.js'))
      },
      'index.js'
    ],
    [
      'executable',
      (root) => fs.chmodSync(path.join(root, KEY, 'index.js'), 0o755),
      'index.js'
    ],
    [
      'name',
      (root) =>
        write(
          root,
          KEY + '/package.json',
          '{"name":"impostor","version":"1.0.0"}'
        ),
      'package.json'
    ],
    [
      'version',
      (root) =>
        write(
          root,
          KEY + '/package.json',
          '{"name":"vendor","version":"9.0.0"}'
        ),
      'package.json'
    ]
  ])(
    'ID-02/03 exposes %s divergence at the physical boundary',
    (_, mutate, file) => {
      const f = fixture()
      mutate(f.evaluated)
      const { c, result } = f.compare()
      expect(result.status).toBe('MISMATCH')
      expect(result.diffs.some((diff) => diff.path === file)).toBe(true)
      c.finalize()
      expect(result.status).toBe('MISMATCH')
    }
  )

  it('ID-04 refuses the evaluated root and its symlink alias as reference', () => {
    const f = fixture()
    f.receipt.root = f.evaluated
    f.save()
    expect(f.comparator).toThrow('REFERENCE_ROOT_SELF_ALIAS')
    const alias = path.join(f.parent, 'alias')
    fs.symlinkSync(f.evaluated, alias)
    f.receipt.root = alias
    f.save()
    expect(f.comparator).toThrow('DIRECTORY_ALIAS')
  })

  it('ID-04 detects cross-tree hardlinks and invalidates earlier results', () => {
    const f = fixture()
    const c = f.comparator(),
      first = f.compare(c).result
    const file = KEY + '/index.js'
    fs.unlinkSync(path.join(f.reference, file))
    fs.linkSync(path.join(f.evaluated, file), path.join(f.reference, file))
    expect(f.compare(c).result.reasons).toContain(
      'REFERENCE_HARDLINK_SELF_ALIAS'
    )
    expect(first.status).toBe('UNAVAILABLE')
  })

  it.each([
    [
      'schema version',
      (r) => {
        r.schemaVersion = 2
      }
    ],
    [
      'missing root',
      (r) => {
        delete r.root
      }
    ],
    [
      'recipe incomplete',
      (r) => {
        r.recipe.completed = false
      }
    ],
    [
      'npm exit',
      (r) => {
        r.recipe.exitCode = 1
      }
    ],
    [
      'offline omitted',
      (r) => {
        r.recipe.argv = r.recipe.argv.filter((a) => a !== '--offline')
      }
    ],
    [
      'timeout/partial',
      (r) => {
        r.recipe.completed = false
        r.recipe.timeout = true
      }
    ],
    [
      'platform',
      (r) => {
        r.selection.platform = 'other'
      }
    ],
    [
      'toolchain digest',
      (r) => {
        r.toolchainSha256 = '0'.repeat(64)
      }
    ],
    [
      'limit raised',
      (r) => {
        r.limits.maxDepth++
      }
    ],
    [
      'duplicate package',
      (r) => {
        r.packages.push(r.packages[0])
      }
    ],
    [
      'unsafe key',
      (r) => {
        r.packages[0].key = '../escape'
      }
    ],
    [
      'inventory digest',
      (r) => {
        r.packages[0].inventorySha256 = '0'.repeat(64)
      }
    ],
    [
      'untyped entry',
      (r) => {
        delete r.packages[0].entries[0].type
      }
    ]
  ])('ID-05 rejects invalid receipt: %s', (_, mutate) => {
    const f = fixture()
    mutate(f.receipt)
    f.save()
    expect(f.comparator).toThrow()
  })

  it('ID-05 rejects duplicate keys, whitespace, foreign digest and nonregular receipts', () => {
    const f = fixture(),
      good = canonicalJson(f.receipt)
    f.save(
      good.replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1')
    )
    expect(f.comparator).toThrow('REFERENCE_NOT_CANONICAL')
    f.save(good + '\n')
    expect(f.comparator).toThrow('REFERENCE_NOT_CANONICAL')
    f.save(good)
    expect(() =>
      createInstalledIdentityComparator(f.evaluated, {
        ...f.options,
        expectedSha256: '0'.repeat(64)
      })
    ).toThrow('REFERENCE_DIGEST_MISMATCH')
    fs.renameSync(f.manifestPath, f.manifestPath + '.regular')
    fs.symlinkSync(f.manifestPath + '.regular', f.manifestPath)
    expect(f.comparator).toThrow('INSTALLED_REFERENCE_NOT_REGULAR')
    for (const options of [
      {},
      { manifestPath: f.manifestPath },
      { manifestPath: f.manifestPath, expectedSha256: 'A'.repeat(64) }
    ])
      expect(() =>
        createInstalledIdentityComparator(f.evaluated, options)
      ).toThrow('INVALID_INSTALLED_REFERENCE_OPTIONS')
  })

  it.each([
    'package-lock.json',
    'package.json',
    'packages/core/package.json',
    '.npmrc',
    'packages/core/.npmrc'
  ])('ID-05 revalidates resolution input %s', (file) => {
    const f = fixture(),
      { c, result } = f.compare()
    write(
      f.evaluated,
      file,
      file.endsWith('.npmrc') ? 'audit=false\n' : '{"changed":true}'
    )
    expect(c.finalize().status).toBe('UNAVAILABLE')
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.reasons).toContain('RESOLUTION_CHANGED')
  })

  it('ID-05 fingerprints declared workspace expansion, modes, and excludes unrelated runtime content', () => {
    const f = fixture(),
      before = fingerprintResolution(f.reference)
    write(f.reference, KEY + '/new-runtime-file', 'not a resolution input')
    write(f.reference, '.env.synthetic-unread', 'not a resolution input')
    expect(fingerprintResolution(f.reference)).toEqual(before)
    write(f.reference, 'packages/new/package.json', '{"name":"new"}')
    expect(fingerprintResolution(f.reference).configSha256).not.toBe(
      before.configSha256
    )
  })

  it('ID-05 pins actual Node/npm files; unknown executables are never run', () => {
    expect(trustedToolchain.npmTreeSha256).toBe(
      'a931e1d739da4bc407ffd23e6b242f20c3f7475378a0718bac03c83e7ca801ae'
    )
    const root = temp(),
      sentinel = path.join(root, 'executed')
    const fake = write(root, 'node', '#!/bin/sh\ntouch ' + sentinel + '\n')
    fs.chmodSync(fake, 0o755)
    expect(() => fingerprintToolchain({ nodePath: fake })).toThrow(
      'TOOLCHAIN_NODE_PIN_MISMATCH'
    )
    expect(fs.existsSync(sentinel)).toBe(false)
    const npmRoot = path.join(root, 'npm')
    fs.cpSync(trustedToolchain.npmRoot, npmRoot, { recursive: true })
    write(npmRoot, 'bin/npm-cli.js', 'tampered actual CLI bytes')
    expect(() => fingerprintToolchain({ npmRoot })).toThrow(
      'TOOLCHAIN_NPM_PIN_MISMATCH'
    )
    write(npmRoot, 'package.json', '{"name":"npm","version":"other"}')
    expect(() => fingerprintToolchain({ npmRoot })).toThrow(
      'TOOLCHAIN_NPM_VERSION_MISMATCH'
    )
  })

  it('ID-05 rehashes actual pinned toolchain at finalize, without per-package rehash', () => {
    const f = fixture(),
      npmRoot = path.join(f.parent, 'npm')
    fs.cpSync(trustedToolchain.npmRoot, npmRoot, { recursive: true })
    f.receipt.toolchain = fingerprintToolchain({ npmRoot })
    f.receipt.toolchainSha256 = hash(canonicalJson(f.receipt.toolchain))
    f.save()
    const { c, result } = f.compare()
    write(npmRoot, 'bin/npm-cli.js', 'mutated after MATCH')
    expect(c.finalize().status).toBe('UNAVAILABLE')
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.reasons).toContain('TOOLCHAIN_NPM_PIN_MISMATCH')
  })

  it('ID-06 normalizes canonical internal link resolution across independent roots', () => {
    const f = fixture({ links: true }),
      { c, result } = f.compare()
    expect(result.status).toBe('MATCH')
    const entry = result.inventory.reference.entries.find(
      (e) => e.path === 'internal'
    )
    expect(entry).toEqual({
      path: 'internal',
      type: 'link',
      target: 'index.js',
      resolution: path.join(f.reference, KEY, 'index.js')
    })
    c.finalize()
    expect(result.status).toBe('MATCH')
  })

  it.each(['dangling', 'cycle', 'external'])(
    'ID-06 refuses %s symlinks with partial evidence',
    (kind) => {
      const f = fixture(),
        dir = path.join(f.evaluated, KEY)
      const target =
        kind === 'dangling'
          ? 'missing'
          : kind === 'cycle'
            ? 'unsafe'
            : write(f.parent, 'outside', 'outside')
      fs.symlinkSync(target, path.join(dir, 'unsafe'))
      const result = f.compare().result
      expect(result.status).toBe('UNSUPPORTED')
      expect(
        result.inventory.partial.entries.some(
          (e) => e.path === 'unsafe' && e.type === 'link'
        )
      ).toBe(true)
    }
  )

  it('ID-06 records scoped nested successors and compares their content independently', () => {
    const f = fixture({ nested: true }),
      c = f.comparator()
    const parent = f.compare(c).result
    expect(parent.status).toBe('MATCH')
    expect(parent.nestedPackages).toEqual(['node_modules/@scope/inner'])
    expect(
      parent.inventory.evaluated.entries.some((e) =>
        e.path.endsWith('entry.js')
      )
    ).toBe(false)
    write(f.evaluated, f.nestedKey + '/entry.js', 'module.exports = 9\n')
    const inner = f.compare(c, f.nestedKey).result
    expect(inner.status).toBe('MISMATCH')
    c.finalize()
    expect(inner.status).toBe('MISMATCH')
  })

  it('ID-10 preserves inventory when an optional/peer package is absent from reference', () => {
    const f = fixture()
    f.receipt.packages = []
    f.receipt.unavailable = [{ key: KEY, reason: 'optional platform fixture' }]
    f.save()
    const { c, result } = f.compare()
    expect(result.status).toBe('UNAVAILABLE')
    expect(result.reasons).toContain('REFERENCE_PACKAGE_UNAVAILABLE')
    expect(result.inventory.evaluated.entries.length).toBe(5)
    c.finalize()
    expect(result.status).toBe('UNAVAILABLE')
  })

  it.each([
    ['maxPackageBytes', 1, 'LIMIT_REGULAR_BYTES'],
    ['maxTotalBytes', 1, 'LIMIT_REGULAR_BYTES'],
    ['maxEntries', 1, 'LIMIT_ENTRIES'],
    ['maxDepth', 0, 'LIMIT_DEPTH'],
    ['comparisonTimeoutMs', 0, 'COMPARISON_TIMEOUT']
  ])(
    'ID-10 refuses reduced %s limits without truncated success',
    (key, value, code) => {
      const f = fixture()
      expect(() =>
        collectPackageInventory(path.join(f.evaluated, KEY), {
          testOnly: { limits: { [key]: value } }
        })
      ).toThrow(code)
      expect(() =>
        collectPackageInventory(path.join(f.evaluated, KEY), {
          testOnly: { limits: { [key]: INSTALLED_IDENTITY_LIMITS[key] + 1 } }
        })
      ).toThrow('TEST_LIMIT_INVALID')
    }
  )

  it('ID-10 refuses real FIFO entries without blocking on open', () => {
    const f = fixture(),
      fifo = path.join(f.evaluated, KEY, 'fifo')
    const child = spawnSync('/usr/bin/mkfifo', [fifo], { encoding: 'utf8' })
    expect(child.status).toBe(0)
    const result = f.compare().result
    expect(result.status).toBe('UNSUPPORTED')
    expect(result.reasons).toContain('SPECIAL_FILE')
  })

  it('ID-10 refuses a real unreadable file', () => {
    const f = fixture(),
      file = path.join(f.evaluated, KEY, 'index.js')
    fs.chmodSync(file, 0)
    try {
      const result = f.compare().result
      expect(result.status).toBe('UNAVAILABLE')
      expect(result.reasons).toContain('INVENTORY_IO_ERROR')
    } finally {
      fs.chmodSync(file, 0o644)
    }
  })

  it('ID-11 detects real midstream byte mutation with unchanged file length', () => {
    const root = temp(),
      file = write(root, 'large.opaque', Buffer.alloc(256 * 1024, 7))
    let mutated = false
    expect(() =>
      collectPackageInventory(root, {
        testOnly: {
          hooks: {
            afterChunk: () => {
              if (mutated) return
              mutated = true
              const fd = fs.openSync(file, 'r+')
              fs.writeSync(fd, Buffer.from([8]), 0, 1, 128 * 1024)
              fs.closeSync(fd)
            }
          }
        }
      })
    ).toThrow('FILE_CHANGED_DURING_READ')
    expect(mutated).toBe(true)
    expect(fs.readFileSync(file)[128 * 1024]).toBe(8)
  })

  it('ID-11 detects real file-to-link replacement between lstat and read', () => {
    const root = temp(),
      file = write(root, 'victim', 'same')
    write(root, 'target', 'same')
    let replaced = false
    expect(() =>
      collectPackageInventory(root, {
        testOnly: {
          hooks: {
            afterLstat: ({ relative }) => {
              if (relative !== 'victim' || replaced) return
              replaced = true
              fs.unlinkSync(file)
              fs.symlinkSync('target', file)
            }
          }
        }
      })
    ).toThrow()
    expect(replaced).toBe(true)
    expect(fs.lstatSync(file).isSymbolicLink()).toBe(true)
  })

  it('ID-11 detects real link retargeting after collection', () => {
    const root = temp(),
      link = path.join(root, 'link')
    write(root, 'one', 'one')
    write(root, 'two', 'two')
    fs.symlinkSync('one', link)
    expect(() =>
      collectPackageInventory(root, {
        testOnly: {
          hooks: {
            beforeRevalidate: () => {
              fs.unlinkSync(link)
              fs.symlinkSync('two', link)
            }
          }
        }
      })
    ).toThrow('INVENTORY_CHANGED')
    expect(fs.readlinkSync(link)).toBe('two')
  })

  it.each(['evaluated', 'reference'])(
    'ID-11 finalizes actual post-collection %s byte changes',
    (side) => {
      const f = fixture(),
        { c, result } = f.compare()
      const file = path.join(f[side], KEY, 'index.js'),
        before = fs.statSync(file)
      const child = spawnSync(
        process.execPath,
        [
          '-e',
          'const fs=require("node:fs");fs.writeFileSync(process.argv[1],"module.exports = 9\\n")',
          file
        ],
        { encoding: 'utf8' }
      )
      expect(child.status).toBe(0)
      fs.utimesSync(file, before.atime, before.mtime)
      expect(c.finalize().status).toBe('UNAVAILABLE')
      expect(result.status).toBe('UNAVAILABLE')
      expect(result.reasons).toContain('PACKAGE_CHANGED_AFTER_COMPARISON')
    }
  )

  it.each(['type', 'link', 'receipt'])(
    'ID-11 invalidates computed MATCH after actual %s mutation',
    (kind) => {
      const f = fixture({ links: true }),
        { c, result } = f.compare()
      if (kind === 'receipt') fs.appendFileSync(f.manifestPath, '\n')
      else if (kind === 'type') {
        fs.unlinkSync(path.join(f.evaluated, KEY, 'index.js'))
        fs.mkdirSync(path.join(f.evaluated, KEY, 'index.js'))
      } else {
        fs.unlinkSync(path.join(f.evaluated, KEY, 'internal'))
        fs.symlinkSync(
          '.hidden.payload',
          path.join(f.evaluated, KEY, 'internal')
        )
      }
      c.finalize()
      expect(result.status).toBe('UNAVAILABLE')
    }
  )

  it('ID-11 never memoizes verdicts by context and invalidates all earlier objects on final mutation', () => {
    const f = fixture(),
      c = f.comparator(),
      first = f.compare(c).result
    expect(first.status).toBe('MATCH')
    write(f.evaluated, KEY + '/index.js', 'module.exports = 7\n')
    const second = f.compare(c).result
    expect(second.status).toBe('MISMATCH')
    c.finalize()
    expect(first.status).toBe('UNAVAILABLE')
    expect(second.status).toBe('UNAVAILABLE')
    expect(f.compare(c).result.status).toBe('UNAVAILABLE')
  })

  it.each(['missing', 'directory', 'invalid JSON', 'null JSON'])(
    'ID-03 keeps physical differences for an installed manifest that is %s',
    (kind) => {
      const f = fixture(),
        file = path.join(f.evaluated, KEY, 'package.json')
      if (kind === 'missing' || kind === 'directory') {
        fs.unlinkSync(file)
        if (kind === 'directory') fs.mkdirSync(file)
      } else
        fs.writeFileSync(file, kind === 'null JSON' ? 'null' : '{malformed')
      const { c, result } = f.compare()
      expect(result.status).toBe('MISMATCH')
      expect(result.diffs.some((diff) => diff.path === 'package.json')).toBe(
        true
      )
      c.finalize()
      expect(result.status).toBe('MISMATCH')
    }
  )

  it.each([
    '--offline=false',
    '--ignore-scripts=false',
    '--no-offline',
    '--force=false',
    '--omit=dev',
    '--audit=true'
  ])('ID-05 rejects contradictory or unreviewed recipe argument %s', (arg) => {
    const f = fixture()
    f.receipt.recipe.argv.push(arg)
    f.save()
    expect(f.comparator).toThrow('REFERENCE_RECIPE_INVALID')
  })

  it.each(['missing', 'noncanonical'])(
    'ID-04 never matches a lock package with %s SHA512 integrity',
    (kind) => {
      const f = fixture()
      for (const root of [f.evaluated, f.reference]) {
        const lock = JSON.parse(
          fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
        )
        if (kind === 'missing') delete lock.packages[KEY].integrity
        else lock.packages[KEY].integrity = 'sha512-' + 'A'.repeat(85) + 'B=='
        write(root, 'package-lock.json', JSON.stringify(lock))
      }
      Object.assign(f.receipt, fingerprintResolution(f.reference))
      f.save()
      const result = f.compare().result
      expect(result.status).toBe('UNAVAILABLE')
      expect(result.reasons).toContain('LOCK_PACKAGE_UNAVAILABLE')
    }
  )

  it('ID-05 rejects dangling configuration symlinks as unsupported physical inputs', () => {
    const f = fixture()
    fs.symlinkSync('nonexistent', path.join(f.reference, '.npmrc'))
    expect(() => fingerprintResolution(f.reference)).toThrow(
      'CONFIG_NOT_REGULAR'
    )
  })

  it('ID-10 applies the immutable production package cap to sparse files without reading their payload', () => {
    const f = fixture(),
      file = write(f.evaluated, KEY + '/oversized', '')
    fs.truncateSync(file, INSTALLED_IDENTITY_LIMITS.maxPackageBytes + 1)
    const c = createInstalledIdentityComparator(f.evaluated, {
      ...f.options,
      limits: { maxPackageBytes: Infinity }
    })
    const result = f.compare(c).result
    expect(result.status).toBe('UNSUPPORTED')
    expect(result.reasons).toContain('LIMIT_REGULAR_BYTES')
    expect(result.inventory.partial.usage.regularBytes).toBeLessThan(1024)
    expect(Object.isFrozen(INSTALLED_IDENTITY_LIMITS)).toBe(true)
  })

  it('ID-11 repeated finalize revalidates live bytes after an earlier successful finalize', () => {
    const f = fixture(),
      { c, result } = f.compare()
    expect(c.finalize().status).toBe('COMPLETE')
    write(f.reference, KEY + '/new-after-finalize', 'new bytes')
    expect(c.finalize().status).toBe('UNAVAILABLE')
    expect(result.status).toBe('UNAVAILABLE')
  })

  it('ID-06 still discovers nested successors after a lexically earlier unsupported link', () => {
    const f = fixture({ nested: true })
    fs.symlinkSync('absent', path.join(f.evaluated, KEY, '.dangling'))
    const result = f.compare().result
    expect(result.status).toBe('UNSUPPORTED')
    expect(result.nestedPackages).toEqual(['node_modules/@scope/inner'])
    expect(result.inventory.partial.frontierComplete).toBe(true)
  })

  it.each([
    'node_modules/strange.dat',
    'node_modules/.unknown',
    'node_modules/no-package/payload'
  ])(
    'ID-06 compares nonpackage content at %s without a node_modules exclusion',
    (file) => {
      const f = fixture()
      for (const root of [f.evaluated, f.reference])
        write(root, KEY + '/' + file, 'original opaque bytes')
      Object.assign(
        f.receipt.packages[0],
        collectPackageInventory(path.join(f.reference, KEY))
      )
      f.save()
      const c = f.comparator(),
        equal = f.compare(c).result
      expect(equal.status).toBe('MATCH')
      expect(
        equal.inventory.evaluated.entries.some(
          (e) => e.path === file && e.type === 'file'
        )
      ).toBe(true)
      expect(equal.nestedPackages).toEqual([])
      write(f.evaluated, KEY + '/' + file, 'different opaque bytes')
      const changed = f.compare(c).result
      expect(changed.status).toBe('MISMATCH')
      expect(changed.diffs.some((e) => e.path === file)).toBe(true)
      c.finalize()
      expect(equal.status).toBe('UNAVAILABLE')
    }
  )

  it('ID-06 inventories .bin symlinks physically and checks targets without following them', () => {
    const f = fixture()
    for (const root of [f.evaluated, f.reference]) {
      const bin = path.join(root, KEY, 'node_modules/.bin')
      fs.mkdirSync(bin, { recursive: true })
      fs.symlinkSync('../../index.js', path.join(bin, 'tool'))
    }
    Object.assign(
      f.receipt.packages[0],
      collectPackageInventory(path.join(f.reference, KEY))
    )
    f.save()
    const { c, result } = f.compare()
    expect(result.status).toBe('MATCH')
    expect(
      result.inventory.evaluated.entries.find(
        (e) => e.path === 'node_modules/.bin/tool'
      )?.type
    ).toBe('link')
    expect(result.nestedPackages).toEqual([])
    c.finalize()
    expect(result.status).toBe('MATCH')
  })

  it('ID-10 marks an incomplete nested frontier explicitly when the traversal cap prevents discovery', () => {
    const f = fixture({ nested: true })
    let error
    try {
      collectPackageInventory(path.join(f.evaluated, KEY), {
        testOnly: { limits: { maxEntries: 1 } }
      })
    } catch (caught) {
      error = caught
    }
    expect(error?.status).toBe('UNSUPPORTED')
    expect(error?.inventory.partial).toBe(true)
    expect(error?.inventory.frontierComplete).toBe(false)
    expect(error?.inventory.inventorySha256).toBeUndefined()
  })
})
