import { spawnSync } from 'node:child_process'
import { constants } from 'node:os'
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAggregateCoverage } from './coverage-thresholds.mjs'

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const positiveInteger = (value) => /^[1-9]\d*$/.test(value)
const valueOptions = {
  testNamePattern: (value) => value.length > 0,
  exclude: (value) => value.length > 0,
  maxWorkers: (value) =>
    positiveInteger(value) || /^(?:[1-9]\d?|100)%$/.test(value),
  pool: (value) => ['forks', 'threads', 'vmForks', 'vmThreads'].includes(value),
  testTimeout: positiveInteger,
  hookTimeout: positiveInteger,
  retry: (value) => /^(?:0|[1-9]\d*)$/.test(value),
  bail: positiveInteger,
  reporter: (value) => ['default', 'dot', 'verbose'].includes(value)
}
const booleanOptions = new Set([
  'fileParallelism',
  'isolate',
  'silent',
  'logHeapUsage',
  'disableConsoleIntercept',
  'color'
])

// Forward normal test filters and execution/display options. Coverage, config,
// root, watch, output paths and error suppression remain owned by this gate.
export function safeVitestArguments(input) {
  const args = input[0] === '--' ? input.slice(1) : [...input]
  const result = []
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (typeof arg !== 'string' || arg.length === 0) {
      throw new Error('empty or non-string Vitest argument')
    }
    if (!arg.startsWith('-')) {
      result.push(arg)
      continue
    }
    const match = /^(--[^=]+|-t)(?:=(.*))?$/.exec(arg)
    if (!match) throw new Error(`unsupported Vitest option: ${arg}`)
    const raw = match[1] === '-t' ? 'testNamePattern' : match[1].slice(2)
    const negated = raw.startsWith('no-')
    const name = (negated ? raw.slice(3) : raw).replace(
      /-([a-z])/g,
      (_, letter) => letter.toUpperCase()
    )
    let value = match[2]
    if (booleanOptions.has(name)) {
      if (value === undefined && ['true', 'false'].includes(args[index + 1])) {
        value = args[++index]
      }
      value ??= negated ? 'false' : 'true'
      if (
        !['true', 'false'].includes(value) ||
        (negated && value !== 'false')
      ) {
        throw new Error(`invalid Vitest option: ${arg}`)
      }
    } else if (!negated && Object.hasOwn(valueOptions, name)) {
      value ??= args[++index]
      if (typeof value !== 'string' || !valueOptions[name](value)) {
        throw new Error(`invalid Vitest option: ${arg}`)
      }
    } else {
      throw new Error(`unsupported Vitest option: ${arg}`)
    }
    // An option value starting with '-' stays a value, never a new CLI option.
    result.push(`--${name}=${value}`)
  }
  return result
}

// projectRoot is injectable for synthetic orchestration tests only. The CLI
// always uses this script's workspace and its installed Vitest/config.
export function runCoreCoverage(
  args = [],
  { projectRoot = workspaceRoot } = {}
) {
  let runDirectory
  let reportPath
  try {
    if (Number(process.versions.node.split('.')[0]) !== 22) {
      throw new Error(`Node 22 required; observed ${process.version}`)
    }
    const forwarded = safeVitestArguments(args)
    const root = resolve(projectRoot)
    const temporaryRoot = join(root, 'coverage')
    mkdirSync(temporaryRoot, { recursive: true })
    runDirectory = mkdtempSync(join(temporaryRoot, 'core-'))
    const reportsDirectory = join(runDirectory, 'reports')
    reportPath = join(reportsDirectory, 'coverage-summary.json')
    console.log(`[core-coverage] current report: ${reportPath}`)
    const startedAt = Date.now()
    const child = spawnSync(
      process.execPath,
      [
        join(root, 'node_modules/vitest/vitest.mjs'),
        'run',
        `--root=${root}`,
        `--config=${join(root, 'vitest.config.mts')}`,
        '--coverage',
        '--coverage.reporter=text',
        '--coverage.reporter=json-summary',
        `--coverage.reportsDirectory=${reportsDirectory}`,
        '--allowOnly=false',
        '--passWithNoTests=false',
        '--dangerouslyIgnoreUnhandledErrors=false',
        '--no-file-parallelism',
        ...(forwarded.some((arg) => arg.startsWith('--maxWorkers='))
          ? []
          : ['--maxWorkers=2']),
        ...forwarded
      ],
      {
        cwd: root,
        env: { ...process.env, CVG_COVERAGE_PER_FILE: '1' },
        stdio: 'inherit',
        shell: false
      }
    )
    // Vitest's test/per-file errors take precedence over every report error.
    if (child.error) throw child.error
    if (child.signal) {
      console.error(`[core-coverage] child terminated by ${child.signal}`)
      return {
        exitCode: 128 + (constants.signals[child.signal] ?? 1),
        signal: child.signal,
        runDirectory,
        reportPath
      }
    }
    if (child.status !== 0) {
      console.error(`[core-coverage] child failed: ${child.status}`)
      return { exitCode: child.status ?? 1, runDirectory, reportPath }
    }
    const completedAt = Date.now()
    // Never fall back to coverage/coverage-summary.json or a historical run.
    // Both directory and file must be regular, inside this new owned run.
    if (
      !lstatSync(reportsDirectory).isDirectory() ||
      realpathSync(reportsDirectory) !== reportsDirectory ||
      !lstatSync(reportPath).isFile() ||
      realpathSync(reportPath) !== reportPath
    ) {
      throw new Error('report is not a regular file in the current run')
    }
    const reportStat = lstatSync(reportPath)
    if (
      Math.floor(reportStat.mtimeMs) < startedAt ||
      Math.floor(reportStat.mtimeMs) > completedAt
    ) {
      throw new Error('stale or future coverage report')
    }
    const validation = validateAggregateCoverage(
      JSON.parse(readFileSync(reportPath, 'utf8'))
    )
    if (!validation.pass) throw new Error(validation.failures.join('\n'))
    console.log(
      `[core-coverage] PASS aggregate ${Object.entries(validation.metrics)
        .map(([key, metric]) => `${key}=${metric.pct}%`)
        .join(' ')}`
    )
    return { exitCode: 0, runDirectory, reportPath, validation }
  } catch (error) {
    console.error(`[core-coverage] FAIL ${error.message}`)
    return { exitCode: 1, runDirectory, reportPath }
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = runCoreCoverage(process.argv.slice(2))
  if (result.signal) process.kill(process.pid, result.signal)
  else process.exitCode = result.exitCode
}
