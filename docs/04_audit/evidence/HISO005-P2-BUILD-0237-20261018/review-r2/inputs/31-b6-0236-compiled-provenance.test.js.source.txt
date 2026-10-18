import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  canonicalJson,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  INSTALLED_IDENTITY_LIMITS
} from '../scripts/boundary-installed-identity.mjs'
import {
  buildCompiledReference,
  loadCompiledBuildReference
} from '../scripts/boundary-semantic-compiled.mjs'

const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
let parent, evaluated, reference, installedReference, built, commit
const write = (root, file, bytes) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  return target
}
function run(argv, cwd) {
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
      JSON.stringify({
        argv,
        exit: result.status,
        error: result.error?.code,
        stderr: result.stderr
      })
    )
  return result.stdout.trim()
}
function load(options = built) {
  return loadCompiledBuildReference(evaluated, options, { installedReference })
}
function mutate(filename, bytes, check) {
  const original = fs.readFileSync(filename)
  try {
    fs.writeFileSync(filename, bytes)
    check()
  } finally {
    fs.writeFileSync(filename, original)
  }
}
beforeAll(() => {
  parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-b6236-compiled-'))
  evaluated = path.join(parent, 'evaluated')
  reference = path.join(parent, 'independent-synthetic-reference')
  const sourceFiles = []
  const put = (name, body) => {
    const bytes = typeof body === 'string' ? body : JSON.stringify(body)
    for (const root of [evaluated, reference]) write(root, name, bytes)
    sourceFiles.push(name)
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
      paths: { '@cvg/harness-contracts': ['packages/contracts/src/index.ts'] },
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
  // A private synthetic operator reference exercises the byte-comparison API.
  // It is NOT represented as a real offline npm recipe or vendor attestation.
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
      entries: packages[0].usage.entries,
      regularBytes: packages[0].usage.regularBytes,
      maxDepth: packages[0].usage.maxDepth
    },
    packages
  }
  const bytes = canonicalJson(receipt),
    manifestPath = write(parent, 'installed-reference.json', bytes)
  installedReference = { manifestPath, expectedSha256: hash(bytes) }
  run(['/usr/bin/git', 'init', '-q'], evaluated)
  run(['/usr/bin/git', 'add', ...sourceFiles], evaluated)
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
      'Synthetic compiler-only provenance fixture'
    ],
    evaluated
  )
  commit = run(['/usr/bin/git', 'rev-parse', 'HEAD'], evaluated)
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
  // Exercise the real operator CLI, including its mandatory sha256 pair.
  built = JSON.parse(
    run(
      [
        NODE,
        path.resolve('scripts/boundary-semantic-compiled.mjs'),
        '--source-root=' + evaluated,
        '--commit=' + commit,
        '--output-root=' + path.join(parent, 'fresh-build'),
        '--installed-reference=' + installedReference.manifestPath,
        '--installed-reference-sha256=' + installedReference.expectedSha256
      ],
      evaluated
    )
  )
  built.receipt = JSON.parse(fs.readFileSync(built.manifestPath, 'utf8'))
}, 180000)
afterAll(() => {
  if (parent) fs.rmSync(parent, { recursive: true, force: true })
})

describe('SPEC0236 compiler-only provenance', () => {
  it('executes a fresh force build and validates the actual analyzed mirror', () => {
    const result = load()
    expect(result.status).toBe('PROVEN')
    expect(result.files).toContainEqual({
      file: 'packages/contracts/dist/canonical-json.js',
      sha256: hash(
        fs.readFileSync(
          path.join(evaluated, 'packages/contracts/dist/canonical-json.js')
        )
      )
    })
    expect(built.receipt.before).toEqual({
      outputsAbsent: true,
      incrementalStateAbsent: true
    })
    expect(built.receipt.argv).toEqual([
      NODE,
      'node_modules/typescript/bin/tsc',
      '-b',
      'packages/shared/tsconfig.json',
      '--force'
    ])
    expect(built.receipt.runtimeResolutions.map((x) => x.file)).toEqual([
      'packages/contracts/dist/index.js',
      'packages/shared/dist/index.js'
    ])
  })
  it('refuses a preexisting variant containing stale dist and incremental state', () => {
    const stale = path.join(parent, 'stale-build')
    write(stale, 'snapshot/packages/contracts/dist/canonical-json.js', 'old')
    write(stale, 'snapshot/packages/contracts/tsconfig.tsbuildinfo', 'old')
    expect(() =>
      buildCompiledReference({
        sourceRoot: evaluated,
        commit,
        outputRoot: stale,
        installedReference
      })
    ).toThrow('COMPILED_OUTPUT_NOT_FRESH')
  })
  it('requires the separate expected digest', () => {
    expect(
      load({ manifestPath: built.manifestPath, expectedSha256: '0'.repeat(64) })
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_REFERENCE_DIGEST'
    })
  })
  it('refuses a copied receipt on another evaluated variant even with identical bytes', () => {
    const other = path.join(parent, 'other-variant')
    fs.mkdirSync(other)
    expect(
      loadCompiledBuildReference(other, built, { installedReference })
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_VARIANT_MISMATCH'
    })
  })
  it('refuses source mutation after the build', () => {
    mutate(
      path.join(evaluated, 'packages/contracts/src/canonical-json.ts'),
      'export const canonical=2\n',
      () =>
        expect(load()).toMatchObject({
          status: 'UNAVAILABLE',
          reason: 'COMPILED_SOURCE_MUTATED'
        })
    )
  })
  it('refuses effective compiler configuration drift', () => {
    const file = path.join(evaluated, 'tsconfig.base.json')
    const config = JSON.parse(fs.readFileSync(file))
    config.compilerOptions.target = 'ES2020'
    mutate(file, JSON.stringify(config), () =>
      expect(load().status).toBe('UNAVAILABLE')
    )
  })
  it('refuses a different compiler bundle', () => {
    const file = path.join(
      evaluated,
      'node_modules/typescript/lib/typescript.js'
    )
    mutate(
      file,
      Buffer.concat([
        fs.readFileSync(file),
        Buffer.from('\n// changed compiler\n')
      ]),
      () =>
        expect(load()).toMatchObject({
          status: 'UNAVAILABLE',
          reason: 'COMPILED_COMPILER_UNSUPPORTED'
        })
    )
  })
  it('refuses modification of the freshly emitted reference', () => {
    mutate(
      path.join(
        built.receipt.root,
        'packages/contracts/dist/canonical-json.js'
      ),
      'export const canonical=3\n',
      () =>
        expect(load()).toMatchObject({
          status: 'UNAVAILABLE',
          reason: 'COMPILED_OUTPUT_MUTATED'
        })
    )
  })
  it('refuses a stale physical analyzed output while source still matches', () => {
    mutate(
      path.join(evaluated, 'packages/contracts/dist/canonical-json.js'),
      'export const canonical=0\n',
      () => expect(load()).toMatchObject({ status: 'UNAVAILABLE' })
    )
  })
  it('binds the captured build event as well as the receipt', () => {
    const file = path.join(path.dirname(built.manifestPath), 'commands.json')
    mutate(file, '[]\n', () =>
      expect(load()).toMatchObject({
        status: 'UNAVAILABLE',
        reason: 'COMPILED_BUILD_EVENT_INVALID'
      })
    )
  })
  it('refuses a new unregistered output in the compiled reference', () => {
    const file = write(
      built.receipt.root,
      'packages/contracts/dist/extra.js',
      'export const extra=1\n'
    )
    try {
      expect(load()).toMatchObject({
        status: 'UNAVAILABLE',
        reason: 'COMPILED_OUTPUT_MUTATED'
      })
    } finally {
      fs.unlinkSync(file)
    }
  })
  it('refuses source/output aliases instead of treating equal bytes as provenance', () => {
    const file = path.join(
        evaluated,
        'packages/contracts/dist/canonical-json.js'
      ),
      backup = file + '.own-backup'
    fs.renameSync(file, backup)
    fs.symlinkSync(path.basename(backup), file)
    try {
      expect(load()).toMatchObject({
        status: 'UNAVAILABLE',
        reason: 'COMPILED_PATH_ALIAS'
      })
    } finally {
      fs.unlinkSync(file)
      fs.renameSync(backup, file)
    }
  })
  it('rejects output paths inside the source or dependency tree before writing', () => {
    expect(() =>
      buildCompiledReference({
        sourceRoot: evaluated,
        commit,
        outputRoot: path.join(evaluated, 'new-output'),
        installedReference
      })
    ).toThrow('COMPILED_OUTPUT_NOT_FRESH')
    expect(fs.existsSync(path.join(evaluated, 'new-output'))).toBe(false)
  })
  it('refuses compiler source inputs outside the two attested source roots', () => {
    const alternative = path.join(parent, 'outside-input-source')
    fs.cpSync(evaluated, alternative, {
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
    write(
      alternative,
      'outside.d.ts',
      'declare const unrelatedAmbient: number;\n'
    )
    write(
      alternative,
      'packages/contracts/src/canonical-json.ts',
      '/// <reference path="../../../outside.d.ts" />\nexport const canonical = 1\n'
    )
    run(['/usr/bin/git', 'init', '-q'], alternative)
    const files = [
      'package.json',
      'package-lock.json',
      'tsconfig.base.json',
      'packages/contracts/package.json',
      'packages/contracts/tsconfig.json',
      'packages/contracts/src/canonical-json.ts',
      'packages/contracts/src/index.ts',
      'packages/shared/package.json',
      'packages/shared/tsconfig.json',
      'packages/shared/src/index.ts',
      'outside.d.ts'
    ]
    run(['/usr/bin/git', 'add', ...files], alternative)
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
        'Synthetic outside compiler input'
      ],
      alternative
    )
    const alternativeCommit = run(
      ['/usr/bin/git', 'rev-parse', 'HEAD'],
      alternative
    )
    expect(() =>
      buildCompiledReference({
        sourceRoot: alternative,
        dependenciesRoot: evaluated,
        commit: alternativeCommit,
        outputRoot: path.join(parent, 'outside-input-build'),
        installedReference
      })
    ).toThrow('COMPILED_SOURCE_OUTSIDE_RECIPE')
  })
  it('does not accept a hand-written approval flag as a build event', () => {
    const receipt = {
      ...built.receipt,
      approved: true,
      before: { outputsAbsent: false, incrementalStateAbsent: false }
    }
    const bytes = canonicalJson(receipt),
      file = write(parent, 'hand-written.json', bytes)
    expect(
      load({ manifestPath: file, expectedSha256: hash(bytes) })
    ).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'COMPILED_INITIAL_STATE_INVALID'
    })
  })
})
