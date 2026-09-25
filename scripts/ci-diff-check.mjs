#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

function run(args) {
  return spawnSync('git', args, { encoding: 'utf8' })
}

const checks = [['git diff --check (working tree)', ['diff', '--check']]]
const base = process.env.GITHUB_BASE_SHA
if (base && run(['cat-file', '-e', `${base}^{commit}`]).status === 0) {
  checks.push([
    `git diff --check ${base}...HEAD`,
    ['diff', '--check', `${base}...HEAD`]
  ])
} else if (run(['rev-parse', '--verify', 'HEAD^']).status === 0) {
  checks.push([
    'git diff --check HEAD^...HEAD',
    ['diff', '--check', 'HEAD^...HEAD']
  ])
}

let failed = false
for (const [label, args] of checks) {
  const result = run(args)
  process.stdout.write(`$ git ${args.join(' ')}\n`)
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.status !== 0) {
    process.stderr.write(`[ci-diff] FAIL ${label}\n`)
    failed = true
  } else {
    process.stdout.write(`[ci-diff] PASS ${label}\n`)
  }
}
process.exitCode = failed ? 1 : 0
