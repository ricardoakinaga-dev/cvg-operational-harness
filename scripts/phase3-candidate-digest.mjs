import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const repo = process.cwd()

/**
 * Functional candidate scope: implementation, tests, scripts, migrations and
 * root configuration only. Documentation is deliberately excluded: the
 * identity artifact lives under docs/ and a digest that hashes its own
 * directory can never reproduce after publication (the freeze gate requires
 * `node scripts/phase3-candidate-digest.mjs` to produce the declared digest
 * from the frozen worktree).
 */
const FUNCTIONAL_ROOTS = [
  'apps/api/src',
  'apps/worker/src',
  'apps/web/src',
  'packages/contracts',
  'packages/harness',
  'packages/orchestrator',
  'packages/persistence',
  'packages/shared',
  'packages/policy',
  'packages/policy-engine',
  'packages/approval-engine',
  'packages/model-gateway',
  'packages/tools',
  'packages/agent-core',
  'packages/agent-runtime',
  'packages/agent-evals',
  'packages/chaos',
  'packages/memory',
  'packages/observability',
  'packages/platform',
  'packages/rag',
  'packages/workflows',
  'packages/adapters',
  'packages/channel-gateway',
  'scripts',
  'tests'
]

const ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'tsconfig.base.json',
  'tsconfig.typecheck.json',
  'vitest.config.mts',
  'vite.config.mts',
  'eslint.config.js',
  '.prettierrc.json',
  '.prettierignore',
  'playwright.config.ts',
  'Dockerfile'
]

const EXCLUDED_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test-results',
  'playwright-report',
  '.git',
  '.vite',
  '.turbo',
  '.cache'
])

const EXCLUDED_FILE_SUFFIXES = ['.log', '.tsbuildinfo']
const EXCLUDED_FILE_NAMES = new Set(['playwright-results.xml'])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function walk(path, files = []) {
  let entries
  try {
    entries = readdirSync(path, { withFileTypes: true })
  } catch {
    return files
  }
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue
      walk(join(path, entry.name), files)
      continue
    }
    if (!entry.isFile()) continue
    if (EXCLUDED_FILE_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
      continue
    }
    if (EXCLUDED_FILE_NAMES.has(entry.name)) continue
    files.push(join(path, entry.name))
  }
  return files
}

function digestFiles(paths) {
  const records = paths
    .map((path) => ({
      path: relative(repo, path),
      sha256: sha256(readFileSync(path)),
      size: statSync(path).size
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const digest = sha256(records.map((r) => `${r.path}\0${r.sha256}`).join('\n'))
  return { digest, fileCount: records.length, records }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

const functionalRoots = FUNCTIONAL_ROOTS.flatMap((root) => {
  const absolute = join(repo, root)
  try {
    if (statSync(absolute).isDirectory()) return walk(absolute)
    return [absolute]
  } catch {
    return []
  }
})
const rootFiles = ROOT_FILES.map((file) => join(repo, file)).filter((file) => {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
})

const functional = digestFiles([...functionalRoots, ...rootFiles])
const migrations = digestFiles(
  walk(join(repo, 'packages/persistence/migrations'))
)

const result = {
  candidate: 'CVG-OPERATIONAL-HARNESS-PHASE3',
  generatedAt: new Date().toISOString(),
  head: git(['rev-parse', 'HEAD']),
  worktreeDirty: Boolean(git(['status', '--porcelain'])),
  functionalDigest: functional.digest,
  functionalFileCount: functional.fileCount,
  migrationDigest: migrations.digest,
  migrationFileCount: migrations.fileCount,
  scope: {
    roots: FUNCTIONAL_ROOTS,
    rootFiles: ROOT_FILES,
    excludedDirs: [...EXCLUDED_DIRS],
    excludedFiles: [...EXCLUDED_FILE_SUFFIXES, ...EXCLUDED_FILE_NAMES]
  },
  digestAlgorithm:
    'sha256 of sorted "path\\0sha256" records over the declared functional scope; node:crypto'
}

const outputIndex = process.argv.indexOf('--output')
if (outputIndex !== -1 && process.argv[outputIndex + 1]) {
  writeFileSync(
    process.argv[outputIndex + 1],
    `${JSON.stringify(result, null, 2)}\n`
  )
}
console.log(JSON.stringify(result, null, 2))
