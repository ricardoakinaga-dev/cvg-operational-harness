// @vitest-environment node
// SPEC0243 E1, native profile: the real installed and compiled reference
// recipes on synthetic Git fixtures. They need the physical git/tar/strace
// pins, so they run with tests/b6-0234-reference-recipe.integration.js and
// tests/b6-0236-compiled-provenance.integration.js (test:boundary:native).
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { buildInstalledReference } from '../scripts/build-installed-reference.mjs'
import * as compiledModule from '../scripts/boundary-semantic-compiled.mjs'
import * as identity from '../scripts/boundary-installed-identity.mjs'
import { referenceEnvironment } from '../scripts/boundary-reference-process.mjs'
import { ownedRunParent } from './support/owned-run-parent.mjs'

const {
  canonicalJson,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  INSTALLED_IDENTITY_LIMITS,
  pinnedToolchainLocation
} = identity
const { buildCompiledReference, loadCompiledBuildReference } = compiledModule
const NODE = pinnedToolchainLocation().node
const BASE = ownedRunParent('b6-0243-native')
const PREFIX = 'docs/04_audit/evidence'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const roots = []
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
const write = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    typeof data === 'string' || Buffer.isBuffer(data)
      ? data
      : JSON.stringify(data)
  )
  return file
}
const git = (root, ...args) =>
  execFileSync(
    '/usr/bin/git',
    [
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Synthetic Fixture',
      '-c',
      'user.email=fixture@invalid.example',
      '-c',
      'commit.gpgsign=false',
      ...args
    ],
    {
      cwd: root,
      env: referenceEnvironment(NODE),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }
  ).trim()
// Every regular file under root, relative and sorted; any other type throws.
function files(root, skip = () => false) {
  const out = []
  const visit = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      const rel = path.relative(root, full).split(path.sep).join('/')
      if (skip(rel)) continue
      if (item.isDirectory()) visit(full)
      else if (item.isFile()) out.push(rel)
      else throw new Error('unexpected entry ' + rel)
    }
  }
  visit(root)
  return out.sort()
}
// Same probe set for both recipes: inside the prefix, and the look-alikes.
const SCOPE_FILES = {
  [PREFIX + '/a.txt']: 'excluded evidence',
  [PREFIX + '/sub/b.json']: '{"excluded":true}',
  'docs/04_audit/evidencex/c.txt': 'sibling stays',
  'docs/04_audit/Evidence/d.txt': 'other case stays',
  ['x/' + PREFIX + '/e.txt']: 'nested look-alike stays'
}
const KEPT = [
  'docs/04_audit/evidencex/c.txt',
  'docs/04_audit/Evidence/d.txt',
  'x/' + PREFIX + '/e.txt'
]
// Names that would pull or drop files if read as pathspec magic or globs.
const LITERAL_FILES = {
  'docs/*': 'literal star, would match the evidence as a glob',
  'lit/q?.txt': 'literal question mark',
  'lit/[br].txt': 'literal bracket',
  ':(exclude)lit/x.txt': 'literal magic prefix',
  [PREFIX + '/secret.txt']: 'evidence behind the look-alikes'
}

// ---------- installed recipe ----------
function recipeFixture(
  extra = {},
  { lockExtra = {}, manifestExtra = {} } = {}
) {
  const base = fs.mkdtempSync(path.join(BASE, 'recipe-'))
  roots.push(base)
  const sourceRoot = path.join(base, 'source'),
    cacheSource = path.join(base, 'cache-source')
  fs.mkdirSync(sourceRoot)
  fs.mkdirSync(cacheSource)
  const staging = path.join(base, 'staging')
  write(path.join(staging, 'package/package.json'), {
    name: 'fixture-safe',
    version: '1.0.0'
  })
  write(path.join(staging, 'package/index.js'), 'module.exports = 1\n')
  const tgz = path.join(base, 'fixture-safe.tgz')
  execFileSync('/usr/bin/tar', ['-czf', tgz, '-C', staging, 'package'], {
    env: referenceEnvironment(NODE)
  })
  const payload = fs.readFileSync(tgz),
    hex = createHash('sha512').update(payload).digest('hex')
  write(
    path.join(
      cacheSource,
      '_cacache/content-v2/sha512',
      hex.slice(0, 2),
      hex.slice(2, 4),
      hex.slice(4)
    ),
    payload
  )
  const manifest = {
    name: 'scope-fixture',
    version: '1.0.0',
    dependencies: { 'fixture-safe': '1.0.0' },
    ...manifestExtra
  }
  write(path.join(sourceRoot, 'package.json'), manifest)
  write(path.join(sourceRoot, 'package-lock.json'), {
    name: manifest.name,
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: manifest.name,
        version: '1.0.0',
        dependencies: manifest.dependencies
      },
      'node_modules/fixture-safe': {
        version: '1.0.0',
        resolved:
          'https://registry.npmjs.org/fixture-safe/-/fixture-safe-1.0.0.tgz',
        integrity: 'sha512-' + Buffer.from(hex, 'hex').toString('base64')
      },
      ...lockExtra
    }
  })
  for (const [name, body] of Object.entries(extra))
    write(path.join(sourceRoot, name), body)
  git(sourceRoot, 'init', '-q')
  git(sourceRoot, '--literal-pathspecs', 'add', '-f', '--', '.')
  git(sourceRoot, 'commit', '-q', '-m', 'synthetic scope fixture')
  return {
    base,
    sourceRoot,
    cacheSource,
    outputRoot: path.join(base, 'output'),
    commit: git(sourceRoot, 'rev-parse', 'HEAD')
  }
}
const recommit = (f, message = 'synthetic change') => {
  git(f.sourceRoot, '--literal-pathspecs', 'add', '-A', '-f', '--', '.')
  git(f.sourceRoot, 'commit', '-q', '-m', message)
  f.commit = git(f.sourceRoot, 'rev-parse', 'HEAD')
  return f
}
const options = (f, extra = {}) => ({
  sourceRoot: f.sourceRoot,
  cacheSource: f.cacheSource,
  outputRoot: f.outputRoot,
  commit: f.commit,
  ...extra
})
async function refuses(f, extra, code) {
  await expect(
    buildInstalledReference(options(f, extra))
  ).rejects.toMatchObject({ status: 'UNAVAILABLE', code })
  expect(fs.existsSync(path.join(f.outputRoot, 'reference.json'))).toBe(false)
}
const snapshotFiles = (receipt) =>
  files(receipt.root, (rel) => rel === 'node_modules')

describe('SPEC0243 installed recipe', () => {
  test('RS01: evidence above a reduced byte ceiling no longer blocks the reference', async () => {
    const f = recipeFixture({ [PREFIX + '/big.bin']: 'e'.repeat(64 * 1024) })
    const result = await buildInstalledReference(
      options(f, {
        testOnly: {
          context: 'synthetic-fixture',
          limits: { maxTotalBytes: 48 * 1024 }
        }
      })
    )
    expect(result.receipt.recipe.sourceExclusions).toEqual([PREFIX])
    expect(result.receipt.usage.regularBytes).toBeLessThan(48 * 1024)
    expect(snapshotFiles(result.receipt)).toEqual([
      'package-lock.json',
      'package.json'
    ])
    expect(result.receipt.packages.map((p) => p.key)).toEqual([
      'node_modules/fixture-safe'
    ])
  }, 60000)

  test('RS02: only the exact prefix leaves the snapshot and the source digest', async () => {
    const f = recipeFixture(SCOPE_FILES)
    const result = await buildInstalledReference(options(f))
    expect(snapshotFiles(result.receipt)).toEqual(
      [...KEPT, 'package-lock.json', 'package.json'].sort()
    )
    const listing = git(f.sourceRoot, 'ls-tree', '-r', '-l', '-z', f.commit)
    const entries = listing
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const [, mode, oid, size, name] =
          /^(\d{6}) blob ([a-f0-9]{40})\s+(\d+)\t(.+)$/.exec(line)
        return { path: name, oid, mode, size: Number(size) }
      })
      .filter((e) => !identity.referenceSourceExcluded(e.path))
    expect(result.receipt.recipe.sourceSha256).toBe(
      hash(canonicalJson(entries))
    )
    const plainFile = recipeFixture({ [PREFIX]: 'a file named as the prefix' })
    const second = await buildInstalledReference(options(plainFile))
    expect(snapshotFiles(second.receipt)).toEqual([
      'package-lock.json',
      'package.json'
    ])
  }, 60000)

  test('RS03: a link under the prefix is still refused', async () => {
    const f = recipeFixture({ [PREFIX + '/a.txt']: 'x' })
    fs.symlinkSync('a.txt', path.join(f.sourceRoot, PREFIX, 'link'))
    recommit(f)
    await refuses(f, {}, 'SOURCE_LINK_UNSUPPORTED')
    // Also inside a historically denylisted directory (crítica R1-06).
    const g = recipeFixture({ [PREFIX + '/node_modules/x/a.txt']: 'x' })
    fs.symlinkSync(
      'a.txt',
      path.join(g.sourceRoot, PREFIX, 'node_modules/x/link')
    )
    recommit(g)
    await refuses(g, {}, 'SOURCE_LINK_UNSUPPORTED')
  }, 60000)

  test('RS03: a submodule under the prefix is still refused', async () => {
    const f = recipeFixture({ [PREFIX + '/a.txt']: 'x' })
    git(
      f.sourceRoot,
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,' + f.commit + ',' + PREFIX + '/module'
    )
    git(f.sourceRoot, 'commit', '-q', '-m', 'gitlink under the prefix')
    f.commit = git(f.sourceRoot, 'rev-parse', 'HEAD')
    await refuses(f, {}, 'SOURCE_TYPE_UNSUPPORTED')
  }, 60000)

  test('RS03: unsafe and non-UTF-8 names under the prefix are still refused', async () => {
    const unsafe = recipeFixture({ [PREFIX + '/bad\x01name.txt']: 'x' })
    await refuses(unsafe, {}, 'SOURCE_PATH_INVALID')
    const f = recipeFixture({ [PREFIX + '/a.txt']: 'x' })
    fs.writeFileSync(
      Buffer.concat([
        Buffer.from(path.join(f.sourceRoot, PREFIX) + '/'),
        Buffer.from([0xff, 0xfe, 0x2e, 0x74, 0x78, 0x74])
      ]),
      'not utf-8'
    )
    recommit(f)
    await refuses(f, {}, 'SOURCE_PATH_INVALID')
  }, 60000)

  test.each([
    [
      'workspace manifest reached by a glob',
      { [PREFIX + '/w/package.json']: { name: 'w', version: '1.0.0' } },
      { manifestExtra: { workspaces: ['docs/04_audit/*/*'] } }
    ],
    [
      'wildcard glob reaching a directory without manifest',
      { [PREFIX + '/w/a.txt']: 'x' },
      { manifestExtra: { workspaces: ['docs/04_audit/*'] } }
    ],
    [
      'lock key under the prefix',
      {},
      { lockExtra: { [PREFIX + '/pkg']: { version: '1.0.0' } } }
    ],
    [
      'link target under the prefix',
      {},
      {
        lockExtra: {
          'node_modules/linked': { link: true, resolved: PREFIX + '/pkg' }
        }
      }
    ],
    [
      'file: dependency under the prefix',
      {},
      {
        lockExtra: {
          'node_modules/local': {
            version: '1.0.0',
            resolved: 'file:' + PREFIX + '/local.tgz'
          }
        }
      }
    ],
    [
      '.npmrc under the prefix',
      { [PREFIX + '/x/.npmrc']: 'engine-strict=true\n' },
      {}
    ],
    [
      'conflict before an unknown root config',
      { '.npmrc': 'synthetic-unknown=1\n', [PREFIX + '/x/.npmrc']: '' },
      {}
    ]
  ])(
    'RS04: %s is refused by the static guard',
    async (_, extra, opts) => {
      const f = recipeFixture(extra, opts)
      await refuses(f, {}, 'SOURCE_EXCLUSION_CONFLICT')
    },
    60000
  )

  test('RS05: the exclusion cannot be supplied or overridden by the caller', async () => {
    const f = recipeFixture(SCOPE_FILES)
    await refuses(f, { sourceExclusions: ['docs'] }, 'RUNNER_OPTIONS_INVALID')
    const cli = spawnSync(
      NODE,
      [
        path.resolve('scripts/build-installed-reference.mjs'),
        '--source-root=' + f.sourceRoot,
        '--commit=' + f.commit,
        '--output-root=' + f.outputRoot,
        '--cache-source=' + f.cacheSource,
        '--source-exclusions=docs'
      ],
      {
        encoding: 'utf8',
        env: {
          ...referenceEnvironment(NODE),
          CVG_REFERENCE_SOURCE_EXCLUSIONS: 'docs'
        }
      }
    )
    expect(cli.status).toBe(2)
    expect(JSON.parse(cli.stderr).code).toBe('CLI_OPTIONS_INVALID')
    // The environment alone changes nothing either.
    process.env.CVG_REFERENCE_SOURCE_EXCLUSIONS = 'docs'
    try {
      const result = await buildInstalledReference(options(f))
      expect(result.receipt.recipe.sourceExclusions).toEqual([PREFIX])
      expect(snapshotFiles(result.receipt)).toEqual(
        [...KEPT, 'package-lock.json', 'package.json'].sort()
      )
    } finally {
      delete process.env.CVG_REFERENCE_SOURCE_EXCLUSIONS
    }
  }, 60000)

  test('RS08: look-alike names are archived literally and the snapshot set is exact', async () => {
    const f = recipeFixture(LITERAL_FILES)
    const result = await buildInstalledReference(options(f))
    expect(snapshotFiles(result.receipt)).toEqual(
      [
        'docs/*',
        'lit/q?.txt',
        'lit/[br].txt',
        ':(exclude)lit/x.txt',
        'package-lock.json',
        'package.json'
      ].sort()
    )
  }, 60000)

  test('RS08: a file planted in the snapshot before npm is refused', async () => {
    const f = recipeFixture(SCOPE_FILES)
    await refuses(
      f,
      {
        testOnly: {
          context: 'synthetic-fixture',
          hooks: {
            beforeNpm: ({ snapshot }) =>
              write(path.join(snapshot, PREFIX, 'a.txt'), 'planted')
          }
        }
      },
      'SNAPSHOT_MISMATCH'
    )
  }, 60000)
})

// ---------- compiled recipe ----------
let parent, evaluated, reference, installedReference, commit
const run = (argv, cwd) => {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      PATH: path.dirname(NODE) + ':/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1'
    }
  })
  if (result.error || result.status !== 0)
    throw new Error(
      JSON.stringify({ argv, exit: result.status, stderr: result.stderr })
    )
  return result.stdout.trim()
}
const gitc = (...args) =>
  run(
    [
      '/usr/bin/git',
      '-c',
      'user.name=CVG Synthetic',
      '-c',
      'user.email=synthetic@example.invalid',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args
    ],
    evaluated
  )
function commitAll(message) {
  gitc('--literal-pathspecs', 'add', '-A', '--', '.')
  gitc('commit', '-qm', message)
  commit = gitc('rev-parse', 'HEAD')
  return commit
}
let buildCount = 0
const compiledBuild = (extra = {}) =>
  buildCompiledReference({
    sourceRoot: evaluated,
    commit,
    outputRoot: path.join(parent, 'build-' + ++buildCount),
    installedReference,
    ...extra
  })
// Apply a change, commit, run check, then restore the previous tree.
function withChange(apply, check) {
  const restore = []
  apply(restore)
  commitAll('synthetic case')
  try {
    check()
  } finally {
    for (const undo of restore.reverse()) undo()
    commitAll('restore')
  }
}
const ignored = (rel) =>
  rel === '.git' ||
  rel.split('/').some((p) => p === 'node_modules' || p === 'dist') ||
  rel.endsWith('.tsbuildinfo')

describe('SPEC0243 compiled recipe', () => {
  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(BASE, 'compiled-'))
    evaluated = path.join(parent, 'evaluated')
    reference = path.join(parent, 'reference')
    const put = (name, body) => {
      for (const root of [evaluated, reference])
        write(path.join(root, name), body)
    }
    put('package.json', {
      name: 'synthetic-compiler-fixture',
      version: '1.0.0',
      private: true,
      type: 'module',
      workspaces: ['packages/*']
    })
    put('package-lock.json', {
      name: 'synthetic-compiler-fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': { name: 'synthetic-compiler-fixture', version: '1.0.0' },
        'node_modules/typescript': {
          version: '6.0.3',
          resolved:
            'https://registry.npmjs.org/typescript/-/typescript-6.0.3.tgz',
          integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
        }
      }
    })
    put('tsconfig.base.json', {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        strict: true,
        composite: true,
        declaration: true,
        sourceMap: true,
        rewriteRelativeImportExtensions: true,
        baseUrl: '.',
        paths: {
          '@cvg/harness-contracts': ['packages/contracts/src/index.ts']
        },
        types: [],
        ignoreDeprecations: '6.0'
      }
    })
    for (const [project, name] of [
      ['contracts', '@cvg/harness-contracts'],
      ['shared', '@cvg/shared']
    ]) {
      put(`packages/${project}/package.json`, {
        name,
        version: '1.0.0',
        type: 'module',
        main: 'dist/index.js',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' }
        }
      })
      put(`packages/${project}/tsconfig.json`, {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
          rewriteRelativeImportExtensions: true
        },
        include: ['src/**/*.ts'],
        ...(project === 'shared'
          ? { references: [{ path: '../contracts' }] }
          : {})
      })
    }
    put(
      'packages/contracts/src/canonical-json.ts',
      'export const canonical = 1\n'
    )
    put(
      'packages/contracts/src/index.ts',
      "export { canonical } from './canonical-json.js'\n"
    )
    put(
      'packages/shared/src/index.ts',
      "export { canonical } from '@cvg/harness-contracts'\n"
    )
    for (const [name, body] of Object.entries({
      ...SCOPE_FILES,
      ...LITERAL_FILES
    }))
      write(path.join(evaluated, name), body)
    for (const root of [evaluated, reference]) {
      fs.cpSync(
        path.resolve('node_modules/typescript'),
        path.join(root, 'node_modules/typescript'),
        { recursive: true }
      )
      fs.mkdirSync(path.join(root, 'node_modules/@cvg'), { recursive: true })
      fs.symlinkSync(
        '../../packages/contracts',
        path.join(root, 'node_modules/@cvg/harness-contracts')
      )
      fs.symlinkSync(
        '../../packages/shared',
        path.join(root, 'node_modules/@cvg/shared')
      )
    }
    const packages = [
      {
        key: 'node_modules/typescript',
        name: 'typescript',
        version: '6.0.3',
        ...collectPackageInventory(
          path.join(reference, 'node_modules/typescript')
        )
      }
    ]
    const toolchain = fingerprintToolchain()
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
        sourceExclusions: [PREFIX]
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
    installedReference = {
      manifestPath: write(path.join(parent, 'installed-reference.json'), bytes),
      expectedSha256: hash(bytes)
    }
    // Installed dependencies and build outputs are never tracked.
    write(
      path.join(evaluated, '.gitignore'),
      'node_modules/\ndist/\n*.tsbuildinfo\n'
    )
    gitc('init', '-q')
    commitAll('synthetic compiled scope fixture')
    run(
      [
        NODE,
        'node_modules/typescript/bin/tsc',
        '-b',
        'packages/shared/tsconfig.json',
        '--force'
      ],
      evaluated
    )
  }, 180000)
  afterAll(() => {
    if (parent) fs.rmSync(parent, { recursive: true, force: true })
  })

  test('RS02/RS05/RS08: v2 receipt, exact scope and literal look-alikes', () => {
    const built = compiledBuild()
    const receipt = JSON.parse(fs.readFileSync(built.manifestPath, 'utf8'))
    expect(receipt.recipeVersion).toBe('shared-contracts-fresh-force-v2')
    expect(receipt.sourceExclusions).toEqual([PREFIX])
    const tracked = gitc('ls-tree', '-r', '--name-only', '-z', commit)
      .split('\0')
      .filter(Boolean)
    const kept = files(receipt.root, ignored)
    expect(kept).toEqual(
      tracked.filter((name) => !identity.referenceSourceExcluded(name)).sort()
    )
    for (const name of KEPT) expect(kept).toContain(name)
    for (const name of [
      'docs/*',
      'lit/q?.txt',
      'lit/[br].txt',
      ':(exclude)lit/x.txt'
    ])
      expect(kept).toContain(name)
    expect(kept.some((name) => identity.referenceSourceExcluded(name))).toBe(
      false
    )
    const commands = JSON.parse(
      fs.readFileSync(
        path.join(path.dirname(built.manifestPath), 'commands.json')
      )
    )
    expect(
      commands.some(
        (row) =>
          row.exitCode === 0 &&
          row.argv.includes('archive') &&
          row.argv.at(-1) === ':(exclude)' + PREFIX
      )
    ).toBe(true)
    expect(
      loadCompiledBuildReference(evaluated, built, { installedReference })
    ).toMatchObject({
      status: 'PROVEN',
      recipeVersion: 'shared-contracts-fresh-force-v2'
    })
  }, 120000)

  test('RS05: the v2 reader refuses v1, a missing or different scope and a missing archive event', () => {
    const built = compiledBuild()
    const original = JSON.parse(fs.readFileSync(built.manifestPath, 'utf8'))
    const commandsFile = path.join(
      path.dirname(built.manifestPath),
      'commands.json'
    )
    const originalCommands = fs.readFileSync(commandsFile)
    const tamper = (change, commandsChange) => {
      const receipt = structuredClone(original)
      change(receipt)
      if (commandsChange) {
        const rows = commandsChange(JSON.parse(originalCommands))
        const bytes = JSON.stringify(rows, null, 2) + '\n'
        fs.writeFileSync(commandsFile, bytes)
        receipt.commandsSha256 = hash(bytes)
      } else fs.writeFileSync(commandsFile, originalCommands)
      const bytes = canonicalJson(receipt)
      fs.writeFileSync(built.manifestPath, bytes)
      return loadCompiledBuildReference(
        evaluated,
        { manifestPath: built.manifestPath, expectedSha256: hash(bytes) },
        { installedReference }
      )
    }
    expect(tamper(() => {})).toMatchObject({ status: 'PROVEN' })
    expect(
      tamper((r) => (r.recipeVersion = 'shared-contracts-fresh-force-v1'))
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_REFERENCE_INVALID'
    })
    expect(tamper((r) => delete r.sourceExclusions)).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_REFERENCE_INVALID'
    })
    expect(tamper((r) => (r.sourceExclusions = ['docs']))).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_REFERENCE_INVALID'
    })
    expect(
      tamper(
        () => {},
        (rows) => rows.filter((row) => !row.argv.includes('archive'))
      )
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_SOURCE_SCOPE_INVALID'
    })
    expect(
      tamper(
        () => {},
        (rows) =>
          rows.map((row) =>
            row.argv.includes('archive')
              ? { ...row, argv: row.argv.slice(0, row.argv.indexOf('--')) }
              : row
          )
      )
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_SOURCE_SCOPE_INVALID'
    })
  }, 120000)

  test('RS03: link, submodule and quoted names under the prefix are still refused', () => {
    withChange(
      (restore) => {
        fs.symlinkSync('a.txt', path.join(evaluated, PREFIX, 'link'))
        restore.push(() => fs.unlinkSync(path.join(evaluated, PREFIX, 'link')))
      },
      () => expect(() => compiledBuild()).toThrow('COMPILED_SOURCE_TYPE')
    )
    gitc(
      'update-index',
      '--add',
      '--cacheinfo',
      '160000,' + commit + ',' + PREFIX + '/module'
    )
    gitc('commit', '-qm', 'gitlink under the prefix')
    commit = gitc('rev-parse', 'HEAD')
    try {
      expect(() => compiledBuild()).toThrow('COMPILED_SOURCE_TYPE')
    } finally {
      gitc('rm', '-q', '--cached', '--', PREFIX + '/module')
      gitc('commit', '-qm', 'remove gitlink')
      commit = gitc('rev-parse', 'HEAD')
    }
    withChange(
      (restore) => {
        const bad = path.join(evaluated, PREFIX, 'bad\x01name.txt')
        write(bad, 'x')
        restore.push(() => fs.unlinkSync(bad))
      },
      () => expect(() => compiledBuild()).toThrow('COMPILED_SOURCE_TYPE')
    )
    // Non-UTF-8 name, even with core.quotePath=false in the local config.
    gitc('config', 'core.quotePath', 'false')
    try {
      withChange(
        (restore) => {
          const bad = Buffer.concat([
            Buffer.from(path.join(evaluated, PREFIX) + '/'),
            Buffer.from([0xff, 0xfe, 0x2e, 0x74, 0x78, 0x74])
          ])
          fs.writeFileSync(bad, 'not utf-8')
          restore.push(() => fs.unlinkSync(bad))
        },
        () => expect(() => compiledBuild()).toThrow('COMPILED_SOURCE_TYPE')
      )
    } finally {
      gitc('config', '--unset', 'core.quotePath')
    }
  }, 120000)

  test('RS04: the static guard runs before sourceInputs, compilerInputs and the archive', () => {
    const manifestFile = path.join(evaluated, 'package.json')
    const manifest = fs.readFileSync(manifestFile)
    withChange(
      (restore) => {
        const m = JSON.parse(manifest)
        m.workspaces = ['packages/*', 'docs/04_audit/*/*']
        fs.writeFileSync(manifestFile, JSON.stringify(m))
        write(path.join(evaluated, PREFIX, 'w/package.json'), { name: 'w' })
        // A config the recipe refuses later must not win over the guard.
        const shared = path.join(evaluated, 'packages/shared/tsconfig.json')
        const original = fs.readFileSync(shared)
        fs.writeFileSync(
          shared,
          JSON.stringify({ extends: './elsewhere.json' })
        )
        restore.push(() => fs.writeFileSync(manifestFile, manifest))
        restore.push(() =>
          fs.rmSync(path.join(evaluated, PREFIX, 'w'), { recursive: true })
        )
        restore.push(() => fs.writeFileSync(shared, original))
      },
      () => {
        const out = path.join(parent, 'guard-build')
        expect(() =>
          buildCompiledReference({
            sourceRoot: evaluated,
            commit,
            outputRoot: out,
            installedReference
          })
        ).toThrow('COMPILED_SOURCE_EXCLUSION_CONFLICT')
        expect(fs.existsSync(path.join(out, 'reference.json'))).toBe(false)
      }
    )
    withChange(
      (restore) => {
        write(path.join(evaluated, PREFIX, 'x/.npmrc'), '')
        restore.push(() =>
          fs.rmSync(path.join(evaluated, PREFIX, 'x'), { recursive: true })
        )
      },
      () =>
        expect(() => compiledBuild()).toThrow(
          'COMPILED_SOURCE_EXCLUSION_CONFLICT'
        )
    )
  }, 120000)

  test('RS04: tsconfig and compiler inputs under the prefix keep their existing refusals', () => {
    const contractsConfig = path.join(
      evaluated,
      'packages/contracts/tsconfig.json'
    )
    const config = fs.readFileSync(contractsConfig)
    withChange(
      (restore) => {
        const c = JSON.parse(config)
        c.extends = '../../' + PREFIX + '/tsconfig.json'
        fs.writeFileSync(contractsConfig, JSON.stringify(c))
        write(path.join(evaluated, PREFIX, 'tsconfig.json'), '{}')
        restore.push(() => fs.writeFileSync(contractsConfig, config))
        restore.push(() =>
          fs.unlinkSync(path.join(evaluated, PREFIX, 'tsconfig.json'))
        )
      },
      () => {
        const out = path.join(parent, 'config-build')
        expect(() =>
          buildCompiledReference({
            sourceRoot: evaluated,
            commit,
            outputRoot: out,
            installedReference
          })
        ).toThrow('COMPILED_CONFIG_UNSUPPORTED')
        expect(fs.existsSync(path.join(out, 'reference.json'))).toBe(false)
      }
    )
    const source = path.join(
      evaluated,
      'packages/contracts/src/canonical-json.ts'
    )
    const original = fs.readFileSync(source)
    withChange(
      (restore) => {
        write(
          path.join(evaluated, PREFIX, 'ambient.d.ts'),
          'declare const evidenceAmbient: number;\n'
        )
        fs.writeFileSync(
          source,
          '/// <reference path="../../../' +
            PREFIX +
            '/ambient.d.ts" />\nexport const canonical = 1\n'
        )
        restore.push(() => fs.writeFileSync(source, original))
        restore.push(() =>
          fs.unlinkSync(path.join(evaluated, PREFIX, 'ambient.d.ts'))
        )
      },
      () => {
        const out = path.join(parent, 'input-build')
        expect(() =>
          buildCompiledReference({
            sourceRoot: evaluated,
            commit,
            outputRoot: out,
            installedReference
          })
        ).toThrow('COMPILED_SOURCE_OUTSIDE_RECIPE')
        expect(fs.existsSync(path.join(out, 'reference.json'))).toBe(false)
      }
    )
  }, 120000)

  test('RS04/RS05: a lock key under the prefix is refused and the scope cannot be supplied', () => {
    const lockFile = path.join(evaluated, 'package-lock.json')
    const lock = fs.readFileSync(lockFile)
    withChange(
      (restore) => {
        const l = JSON.parse(lock)
        l.packages[PREFIX + '/pkg'] = { version: '1.0.0' }
        fs.writeFileSync(lockFile, JSON.stringify(l))
        restore.push(() => fs.writeFileSync(lockFile, lock))
      },
      () =>
        expect(() => compiledBuild()).toThrow(
          'COMPILED_SOURCE_EXCLUSION_CONFLICT'
        )
    )
    const cli = spawnSync(
      NODE,
      [
        path.resolve('scripts/boundary-semantic-compiled.mjs'),
        '--source-root=' + evaluated,
        '--commit=' + commit,
        '--output-root=' + path.join(parent, 'cli-override'),
        '--installed-reference=' + installedReference.manifestPath,
        '--installed-reference-sha256=' + installedReference.expectedSha256,
        '--source-exclusions=docs'
      ],
      { encoding: 'utf8' }
    )
    expect(cli.status).toBe(2)
    expect(JSON.parse(cli.stderr).code).toBe('COMPILED_CLI_OPTIONS_INVALID')
    expect(fs.existsSync(path.join(parent, 'cli-override'))).toBe(false)
  }, 120000)

  test('RS04: with a different dependencies root, the source closure is still decided before any receipt', () => {
    const alternative = (name, withCompiler) => {
      const root = path.join(parent, name)
      fs.cpSync(evaluated, root, {
        recursive: true,
        filter: (file) =>
          !path
            .relative(evaluated, file)
            .split(path.sep)
            .some(
              (part) =>
                ['.git', 'node_modules', 'dist'].includes(part) ||
                part.endsWith('.tsbuildinfo')
            )
      })
      if (withCompiler) {
        fs.cpSync(
          path.join(evaluated, 'node_modules/typescript'),
          path.join(root, 'node_modules/typescript'),
          { recursive: true }
        )
        fs.mkdirSync(path.join(root, 'node_modules/@cvg'))
        fs.symlinkSync(
          '../../packages/contracts',
          path.join(root, 'node_modules/@cvg/harness-contracts')
        )
        fs.symlinkSync(
          '../../packages/shared',
          path.join(root, 'node_modules/@cvg/shared')
        )
      }
      // A declaration under the prefix that the compiler would tolerate
      // missing: included by the tsconfig, never emitted.
      write(
        path.join(root, PREFIX, 'types/evidence.d.ts'),
        'declare const evidenceAmbient: number;\n'
      )
      const config = path.join(root, 'packages/contracts/tsconfig.json')
      const c = JSON.parse(fs.readFileSync(config))
      c.include = ['src/**/*.ts', '../../' + PREFIX + '/types/*.d.ts']
      fs.writeFileSync(config, JSON.stringify(c))
      run(['/usr/bin/git', 'init', '-q'], root)
      run(['/usr/bin/git', '--literal-pathspecs', 'add', '-A', '--', '.'], root)
      run(
        [
          '/usr/bin/git',
          '-c',
          'user.name=CVG Synthetic',
          '-c',
          'user.email=synthetic@example.invalid',
          '-c',
          'commit.gpgsign=false',
          '-c',
          'core.hooksPath=/dev/null',
          'commit',
          '-qm',
          'alternative source'
        ],
        root
      )
      return { root, commit: run(['/usr/bin/git', 'rev-parse', 'HEAD'], root) }
    }
    for (const [name, withCompiler, code] of [
      ['alt-with-compiler', true, 'COMPILED_SOURCE_OUTSIDE_RECIPE'],
      ['alt-without-compiler', false, 'COMPILED_SOURCE_COMPILER_REQUIRED']
    ]) {
      const alt = alternative(name, withCompiler)
      const out = path.join(parent, name + '-build')
      expect(() =>
        buildCompiledReference({
          sourceRoot: alt.root,
          dependenciesRoot: evaluated,
          commit: alt.commit,
          outputRoot: out,
          installedReference
        })
      ).toThrow(code)
      expect(fs.existsSync(path.join(out, 'reference.json'))).toBe(false)
    }
  }, 180000)

  test('RS08: a file planted after extraction is refused before the dependency copy', () => {
    const out = path.join(parent, 'planted-build')
    expect(() =>
      buildCompiledReference({
        sourceRoot: evaluated,
        commit,
        outputRoot: out,
        installedReference,
        testOnly: {
          context: 'synthetic-fixture',
          hooks: {
            afterExtract: ({ snapshot }) =>
              write(path.join(snapshot, PREFIX, 'a.txt'), 'planted')
          }
        }
      })
    ).toThrow('COMPILED_DIRTY_SOURCE')
    expect(fs.existsSync(path.join(out, 'snapshot/node_modules'))).toBe(false)
    expect(() =>
      buildCompiledReference({
        sourceRoot: evaluated,
        commit,
        outputRoot: path.join(parent, 'wrong-context'),
        installedReference,
        testOnly: { context: 'production', hooks: {} }
      })
    ).toThrow('COMPILED_TEST_CONTEXT_REQUIRED')
  }, 120000)
})
