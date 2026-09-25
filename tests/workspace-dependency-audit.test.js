import { afterEach, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  classifyManifestDeclaration,
  createCandidateManifest,
  createReport,
  extractModuleReferences,
  main,
  matchSourceRole,
  parseCliArgs,
  stableStringify,
  validateOutputPath,
  validatePolicy
} from '../scripts/workspace-dependency-audit.mjs'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const repositoryPolicy = JSON.parse(
  fs.readFileSync(
    path.join(repoRoot, 'config/workspace-dependency-policy.json'),
    'utf8'
  )
)
const temporaryRoots = new Set()

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm07-workspace-audit-'))
  temporaryRoots.add(root)
  fs.mkdirSync(path.join(root, 'apps/alpha/src'), { recursive: true })
  fs.mkdirSync(path.join(root, 'apps/beta/src'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'synthetic-root',
      private: true,
      workspaces: ['apps/*'],
      scripts: { 'build:synthetic': 'tsc -b apps/beta/tsconfig.json' }
    })
  )
  fs.writeFileSync(
    path.join(root, 'apps/alpha/package.json'),
    JSON.stringify({
      name: '@synthetic/alpha',
      private: true,
      dependencies: { '@synthetic/beta': 'workspace:*' }
    })
  )
  fs.writeFileSync(
    path.join(root, 'apps/beta/package.json'),
    JSON.stringify({
      name: '@synthetic/beta',
      private: true
    })
  )
  fs.writeFileSync(
    path.join(root, 'apps/beta/tsconfig.json'),
    JSON.stringify({})
  )
  fs.writeFileSync(
    path.join(root, 'apps/beta/src/index.ts'),
    'export const value = 1;\n'
  )
  fs.writeFileSync(
    path.join(root, 'apps/alpha/src/index.ts'),
    "import { value } from '@synthetic/beta';\nexport { value };\n"
  )
  return root
}

function syntheticPolicy() {
  return {
    ...structuredClone(repositoryPolicy),
    candidateBinding: {
      ...structuredClone(repositoryPolicy.candidateBinding),
      baselineManifestPath: null,
      baselineManifestSha256: null,
      approvedAdditionalPaths: [],
      npmVersionFilePath: null
    }
  }
}

function sha256File(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
}

function baselineFor(root, relativePaths) {
  return {
    git_head: 'synthetic-head',
    candidate_fingerprint_sha256: 'synthetic-baseline-fingerprint',
    candidate_input_manifest: relativePaths.map((relative) => {
      const absolute = path.join(root, relative)
      const stat = fs.statSync(absolute)
      return {
        path: relative,
        kind:
          relative === 'package.json'
            ? 'root-package-manifest'
            : relative.endsWith('package.json')
              ? 'workspace-manifest+workspace-source-or-config'
              : 'workspace-source-or-config',
        file_type: 'file',
        size_bytes: stat.size,
        sha256: sha256File(absolute)
      }
    })
  }
}

afterEach(() => {
  for (const root of temporaryRoots)
    fs.rmSync(root, { recursive: true, force: true })
  temporaryRoots.clear()
})

describe('M07 workspace dependency policy', () => {
  it('keeps the approved candidate set narrow and undecided owners explicit', () => {
    expect(validatePolicy(repositoryPolicy)).toEqual([])
    expect(repositoryPolicy.candidateBinding.approvedAdditionalPaths).toEqual([
      'config/workspace-dependency-policy.json',
      'scripts/workspace-dependency-audit.mjs',
      'tests/workspace-dependency-audit.test.js',
      'packages/conversation/src/__tests__/postgres-store.unit.test.ts'
    ])
    expect(repositoryPolicy.candidateBinding.npmVersionFilePath).toBe(
      'docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/npm-version.txt'
    )
    expect(repositoryPolicy.candidateBinding.baselineManifestPath).toBe(
      'docs/04_audit/evidence/AUD-20260924/M07-S1-C1J/candidate-baseline.json'
    )
    expect(repositoryPolicy.candidateBinding.baselineManifestSha256).toBe(
      'ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d'
    )
    const staleBaseline = structuredClone(repositoryPolicy)
    staleBaseline.candidateBinding.baselineManifestPath =
      'docs/04_audit/evidence/AUD-20260923/M07-SPEC/candidate-baseline.json'
    staleBaseline.candidateBinding.baselineManifestSha256 =
      '40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a'
    expect(validatePolicy(staleBaseline).join(' ')).toContain(
      'C1J reconciled baseline artifact'
    )
    expect(repositoryPolicy.publicCompatibilityCandidates).toEqual({
      '@cvg/harness': {
        ownerPath: 'packages/harness',
        status: 'PUBLIC_CANDIDATE'
      },
      '@cvg/harness-orchestrator': {
        ownerPath: 'packages/orchestrator',
        status: 'PUBLIC_CANDIDATE'
      },
      '@cvg/harness-contracts': {
        ownerPath: 'packages/contracts',
        status: 'PUBLIC_CANDIDATE'
      }
    })
    expect(repositoryPolicy.ownerDefaults).toEqual({
      ownerRole: 'UNKNOWN',
      publicCompatibilityStatus: 'UNKNOWN',
      projectReferenceRequiredness: 'UNDECIDED'
    })
    const widened = structuredClone(repositoryPolicy)
    widened.publicCompatibilityCandidates['@cvg/worker'] = {
      ownerPath: 'apps/worker',
      status: 'PUBLIC_CANDIDATE'
    }
    expect(validatePolicy(widened).join(' ')).toContain(
      'only the three approved Harness packages'
    )
  })

  it('classifies production, test, build-only, and unmatched paths separately', () => {
    expect(matchSourceRole('src/index.ts', repositoryPolicy).role).toBe(
      'PRODUCTION'
    )
    expect(
      matchSourceRole('src/__tests__/index.test.ts', repositoryPolicy).role
    ).toBe('TEST')
    expect(matchSourceRole('scripts/generate.mjs', repositoryPolicy).role).toBe(
      'BUILD_ONLY'
    )
    expect(matchSourceRole('index.ts', repositoryPolicy).role).toBe(
      'UNRESOLVED'
    )
  })

  it('distinguishes type-only, mixed, re-export, dynamic, and unresolved imports', () => {
    const source = [
      "import type { Shape } from '@synthetic/type';",
      "import { value, type Result } from '@synthetic/runtime';",
      "export type { Shape } from '@synthetic/re-export';",
      'const lazy = import(moduleName);',
      "const required = require('./literal');",
      "type Imported = import('@synthetic/types').Value;"
    ].join('\n')
    const parsed = extractModuleReferences(source, 'src/sample.ts')
    expect(parsed.diagnostics).toEqual([])
    expect(
      parsed.references.map((reference) => [
        reference.importKind,
        reference.importUsage,
        reference.specifier
      ])
    ).toEqual([
      ['STATIC_IMPORT', 'TYPE_ONLY', '@synthetic/type'],
      ['STATIC_IMPORT', 'MIXED', '@synthetic/runtime'],
      ['RE_EXPORT', 'TYPE_ONLY', '@synthetic/re-export'],
      ['DYNAMIC_IMPORT', 'RUNTIME', null],
      ['REQUIRE', 'RUNTIME', './literal'],
      ['IMPORT_TYPE', 'TYPE_ONLY', '@synthetic/types']
    ])
    expect(parsed.references[3].unresolvedReason).toBe(
      'NON_LITERAL_MODULE_SPECIFIER'
    )
    expect(
      extractModuleReferences('import { from', 'src/broken.ts').diagnostics
        .length
    ).toBeGreaterThan(0)
  })

  it('reports category mismatches and leaves type-only public declaration risk unresolved', () => {
    expect(
      classifyManifestDeclaration('PRODUCTION', 'RUNTIME', [], repositoryPolicy)
    ).toEqual({
      status: 'VIOLATION',
      reason: 'MISSING_DIRECT_DEPENDENCY'
    })
    expect(
      classifyManifestDeclaration(
        'TEST',
        'RUNTIME',
        ['devDependencies'],
        repositoryPolicy
      ).status
    ).toBe('DECLARED')
    expect(
      classifyManifestDeclaration(
        'PRODUCTION',
        'TYPE_ONLY',
        ['devDependencies'],
        repositoryPolicy
      )
    ).toEqual({
      status: 'UNRESOLVED',
      reason: 'PUBLIC_DECLARATION_ESCAPE_NOT_PROVEN'
    })
    expect(
      classifyManifestDeclaration(
        'PRODUCTION',
        'RUNTIME',
        ['dependencies', 'peerDependencies'],
        repositoryPolicy
      ).reason
    ).toBe('CONFLICTING_MANIFEST_CATEGORIES')
  })

  it('resolves direct package imports and TypeScript path aliases in a synthetic workspace', () => {
    const root = makeRoot()
    fs.writeFileSync(
      path.join(root, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@synthetic-alias/*': ['apps/beta/src/*'] }
        }
      })
    )
    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/index.ts'),
      [
        "import { value } from '@synthetic/beta';",
        "import { value as aliased } from '@synthetic-alias/index';",
        'export { value, aliased };'
      ].join('\n')
    )
    const report = createReport(root, syntheticPolicy(), {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['synthetic']
    })
    expect(report.result.exitCode).toBe(0)
    expect(report.report.edges).toHaveLength(1)
    expect(
      report.report.edges.map((edge) => edge.resolutionMethods).flat()
    ).toContain('TYPESCRIPT_PATH_ALIAS')
    expect(report.report.edges[0].moduleSpecifiers).toHaveLength(2)
    expect(
      report.report.edges.every((edge) => edge.manifest.status === 'DECLARED')
    ).toBe(true)
    expect(report.report.buildScripts).toEqual([
      expect.objectContaining({
        status: 'OBSERVED',
        commandShape: 'DIRECT_TSC_BUILD'
      })
    ])
  })

  it('shares a safe production type-only declaration with a test edge and preserves both roles', () => {
    const root = makeRoot()
    fs.mkdirSync(path.join(root, 'apps/alpha/src/__tests__'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/index.ts'),
      "import type { Shape } from '@synthetic/beta';\nexport type { Shape };\n"
    )
    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/__tests__/beta.test.ts'),
      "import { value } from '@synthetic/beta';\nexpect(value).toBe(1);\n"
    )
    const shared = createReport(root, syntheticPolicy(), {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['synthetic']
    })
    const sharedEdges = shared.report.edges.filter(
      (edge) =>
        edge.owner.name === '@synthetic/alpha' &&
        edge.target?.name === '@synthetic/beta'
    )
    expect(shared.result.exitCode).toBe(0)
    expect(sharedEdges.map((edge) => edge.sourceRole).sort()).toEqual([
      'PRODUCTION',
      'TEST'
    ])
    expect(
      sharedEdges.find((edge) => edge.sourceRole === 'PRODUCTION')
    ).toEqual(
      expect.objectContaining({
        classification: 'PRODUCTION_TYPE_ONLY',
        manifest: expect.objectContaining({ status: 'DECLARED_RUNTIME_SAFE' })
      })
    )
    expect(
      sharedEdges.find((edge) => edge.sourceRole === 'TEST').manifest
    ).toEqual({
      categories: ['dependencies'],
      status: 'DECLARED',
      reason: null,
      declarationBasis: 'SHARED_PRODUCTION_DEPENDENCY'
    })

    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/index.ts'),
      'export const local = true;\n'
    )
    const testOnly = createReport(root, syntheticPolicy(), {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['synthetic']
    })
    expect(testOnly.result.exitCode).toBe(1)
    expect(testOnly.report.findings).toContainEqual(
      expect.objectContaining({
        code: 'DEPENDENCY_CATEGORY_MISMATCH',
        sourceRole: 'TEST',
        owner: expect.objectContaining({ name: '@synthetic/alpha' }),
        target: expect.objectContaining({ name: '@synthetic/beta' })
      })
    )
  })

  it('does not reconcile conflicting dependency categories through a type-only production edge', () => {
    const root = makeRoot()
    fs.mkdirSync(path.join(root, 'apps/alpha/src/__tests__'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/index.ts'),
      "import type { Shape } from '@synthetic/beta';\nexport type { Shape };\n"
    )
    fs.writeFileSync(
      path.join(root, 'apps/alpha/src/__tests__/beta.test.ts'),
      "import { value } from '@synthetic/beta';\nexpect(value).toBe(1);\n"
    )
    fs.writeFileSync(
      path.join(root, 'apps/alpha/package.json'),
      JSON.stringify({
        name: '@synthetic/alpha',
        private: true,
        dependencies: { '@synthetic/beta': 'workspace:*' },
        devDependencies: { '@synthetic/beta': 'workspace:*' }
      })
    )
    const report = createReport(root, syntheticPolicy(), {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['synthetic']
    })
    const testEdge = report.report.edges.find(
      (edge) => edge.sourceRole === 'TEST'
    )
    expect(report.result.exitCode).toBe(1)
    expect(testEdge.manifest).toEqual(
      expect.objectContaining({
        status: 'VIOLATION',
        reason: 'CONFLICTING_MANIFEST_CATEGORIES'
      })
    )
  })

  it('produces a stable normalized digest and proves a missing direct dependency', () => {
    const root = makeRoot()
    const policy = syntheticPolicy()
    const first = createReport(root, policy, {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['same-command']
    })
    const second = createReport(root, policy, {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['same-command']
    })
    expect(first.normalizedReportSha256).toBe(second.normalizedReportSha256)
    expect(first.candidate.fingerprint).toBe(second.candidate.fingerprint)
    fs.writeFileSync(
      path.join(root, 'apps/alpha/package.json'),
      JSON.stringify({ name: '@synthetic/alpha', private: true })
    )
    const violation = createReport(root, policy, {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['same-command']
    })
    expect(violation.result.exitCode).toBe(1)
    expect(
      violation.report.findings.some(
        (finding) => finding.code === 'MISSING_DIRECT_DEPENDENCY'
      )
    ).toBe(true)
  })

  it('marks a changed baseline input stale and changes its candidate fingerprint', () => {
    const root = makeRoot()
    const policy = syntheticPolicy()
    const paths = [
      'package.json',
      'apps/alpha/package.json',
      'apps/alpha/src/index.ts',
      'apps/beta/package.json',
      'apps/beta/tsconfig.json',
      'apps/beta/src/index.ts'
    ]
    const baseline = baselineFor(root, paths)
    const before = createCandidateManifest(root, policy, {
      baselineManifest: baseline,
      useConfiguredBaseline: false
    })
    fs.appendFileSync(
      path.join(root, 'apps/alpha/src/index.ts'),
      '\nexport const changed = true;\n'
    )
    const after = createCandidateManifest(root, policy, {
      baselineManifest: baseline,
      useConfiguredBaseline: false
    })
    expect(before.stale).toBe(false)
    expect(after.stale).toBe(true)
    expect(after.baseline_delta).toContainEqual({
      path: 'apps/alpha/src/index.ts',
      status: 'MODIFIED_BASELINE_INPUT'
    })
    expect(after.candidate_fingerprint_sha256).not.toBe(
      before.candidate_fingerprint_sha256
    )
  })

  it('serializes a replayable fingerprint basis and binds the local npm version file', () => {
    const root = makeRoot()
    const policy = syntheticPolicy()
    const npmVersionPath = path.join(root, 'npm-version.txt')
    fs.writeFileSync(npmVersionPath, '10.8.2\n')
    const first = createCandidateManifest(root, policy, {
      useConfiguredBaseline: false,
      baselineManifest: null,
      npmVersionFilePath: 'npm-version.txt'
    })
    const persisted = JSON.parse(stableStringify(first, 2))
    const replayedFingerprint = crypto
      .createHash('sha256')
      .update(stableStringify(persisted.fingerprint_basis))
      .digest('hex')
    expect(replayedFingerprint).toBe(persisted.candidate_fingerprint_sha256)
    expect(persisted.fingerprint_basis.approved_r1_delta_paths).toEqual([])
    expect(persisted.toolchain.npm).toBe('10.8.2')
    expect(persisted.npm_version_file).toEqual({
      path: 'npm-version.txt',
      version: '10.8.2',
      sha256: sha256File(npmVersionPath)
    })

    const changedBasis = structuredClone(persisted.fingerprint_basis)
    changedBasis.toolchain.npm = '10.8.3'
    expect(
      crypto
        .createHash('sha256')
        .update(stableStringify(changedBasis))
        .digest('hex')
    ).not.toBe(persisted.candidate_fingerprint_sha256)
    fs.writeFileSync(npmVersionPath, '10.8.3\n')
    const changedToolchain = createCandidateManifest(root, policy, {
      useConfiguredBaseline: false,
      baselineManifest: null,
      npmVersionFilePath: 'npm-version.txt'
    })
    expect(changedToolchain.candidate_fingerprint_sha256).not.toBe(
      first.candidate_fingerprint_sha256
    )
    expect(changedToolchain.npm_version_file.sha256).not.toBe(
      first.npm_version_file.sha256
    )
  })

  it('accepts only an M07 evidence output path and rejects traversal or symlink escape', () => {
    const root = makeRoot()
    const evidence = path.join(
      root,
      'docs/04_audit/evidence/AUD-20990101/M07-BUILD-S1'
    )
    fs.mkdirSync(evidence, { recursive: true })
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-BUILD-S1/report.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-BUILD-S1/report.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-R1'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-R1/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-R1-C1E'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1-C1E/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-R1-C1E/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-C1F'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1F/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-C1F/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-C1H'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1H/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-C1H/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-C1I'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1I/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-C1I/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-C1J'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1J/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-C1J/candidate.json')
    fs.mkdirSync(
      path.join(root, 'docs/04_audit/evidence/AUD-20990101/M07-S1-C1L'),
      { recursive: true }
    )
    expect(
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1L/candidate.json'
      ).relative
    ).toBe('docs/04_audit/evidence/AUD-20990101/M07-S1-C1L/candidate.json')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1-C1E-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1F-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1H-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1I-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1J-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-S1-C1L-UNAPPROVED/candidate.json'
      )
    ).toThrow('repository M07 evidence directory')
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/../../outside/M07-BUILD-S1/report.json'
      )
    ).toThrow('may not traverse')
    const outside = path.join(root, 'outside')
    fs.mkdirSync(outside)
    fs.rmSync(path.join(root, 'docs/04_audit/evidence/AUD-20990101'), {
      recursive: true
    })
    fs.symlinkSync(
      outside,
      path.join(root, 'docs/04_audit/evidence/AUD-20990101')
    )
    expect(() =>
      validateOutputPath(
        root,
        'docs/04_audit/evidence/AUD-20990101/M07-BUILD-S1/report.json'
      )
    ).toThrow('symlink')
  })

  it('does not follow a workspace source symlink and reports incomplete coverage', () => {
    const root = makeRoot()
    fs.symlinkSync(
      '../../beta/src/index.ts',
      path.join(root, 'apps/alpha/src/redirect.ts')
    )
    const report = createReport(root, syntheticPolicy(), {
      syntheticFixture: true,
      useConfiguredBaseline: false,
      baselineManifest: null,
      command: ['synthetic']
    })
    expect(report.result.exitCode).toBe(2)
    expect(
      report.report.coverage.gaps.some(
        (gap) => gap.code === 'OWNER_SYMLINK_NOT_FOLLOWED'
      )
    ).toBe(true)
    expect(
      report.report.sourceFiles.some((file) =>
        file.path.endsWith('redirect.ts')
      )
    ).toBe(false)
  })

  it('rejects invalid CLI scope and never runs a later M07 profile from S1', () => {
    expect(parseCliArgs([])).toEqual({
      policy: 'config/workspace-dependency-policy.json',
      profile: 'inventory',
      format: 'json',
      output: null,
      candidateOnly: false,
      verifyCandidate: null,
      npmVersionFile: null
    })
    expect(() => parseCliArgs(['--unknown', 'value'])).toThrow('unknown option')
    expect(() => parseCliArgs(['--profile', 'neutral-target'])).toThrow(
      'not authorized by M07-S1'
    )
    expect(
      parseCliArgs([
        '--candidate-only',
        '--npm-version-file',
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/npm-version.txt',
        '--format',
        'json',
        '--output',
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/candidate.json'
      ])
    ).toEqual(
      expect.objectContaining({
        candidateOnly: true,
        npmVersionFile:
          'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/npm-version.txt'
      })
    )
    expect(
      parseCliArgs([
        '--verify-candidate',
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/candidate.json',
        '--npm-version-file',
        'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/npm-version.txt'
      ])
    ).toEqual(
      expect.objectContaining({
        verifyCandidate:
          'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/candidate.json',
        npmVersionFile:
          'docs/04_audit/evidence/AUD-20990101/M07-S1-R1/npm-version.txt'
      })
    )
    expect(
      parseCliArgs([
        '--candidate-only',
        '--npm-version-file',
        'docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/npm-version.txt',
        '--format',
        'json',
        '--output',
        'docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/execution-candidate-manifest.json'
      ])
    ).toEqual(
      expect.objectContaining({
        candidateOnly: true,
        npmVersionFile:
          'docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/npm-version.txt'
      })
    )
    expect(
      parseCliArgs([
        '--candidate-only',
        '--npm-version-file',
        'docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/npm-version.txt',
        '--format',
        'json',
        '--output',
        'docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/execution-candidate-manifest.json'
      ])
    ).toEqual(
      expect.objectContaining({
        candidateOnly: true,
        npmVersionFile:
          'docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/npm-version.txt'
      })
    )
    expect(() => parseCliArgs(['--candidate-only'])).toThrow(
      'requires --npm-version-file and --output'
    )
    expect(typeof main).toBe('function')
  })
})
