#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CASE_IDS,
  loadFixtures,
  safeCaseId
} from '../tests/replay/fixture-schema.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') {
    console.log(
      'Replay: node scripts/snapshot-replay.mjs [--fixtures-dir <dir>]\nRecord candidate: node scripts/snapshot-replay.mjs --record --case <id>\nRecord never replaces frozen expectations. Cases: ' +
        CASE_IDS.join(', ')
    )
    return 0
  }
  let record = false,
    caseId,
    directory = resolve(root, 'snapshots/core')
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--record' && !record) record = true
    else if (args[i] === '--case' && !caseId && args[i + 1])
      caseId = safeCaseId.parse(args[++i])
    else if (args[i] === '--fixtures-dir' && args[i + 1])
      directory = resolve(args[++i])
    else throw new Error(`unsupported replay argument: ${args[i]}`)
  }
  if (record !== Boolean(caseId))
    throw new Error('--record requires --case; --case requires --record')
  if (
    record &&
    realpathSync(directory) !== realpathSync(resolve(root, 'snapshots/core'))
  )
    throw new Error('record mode is limited to snapshots/core')
  loadFixtures(directory, { requireExpected: !record })
  const env = { ...process.env, CVG_REPLAY_FIXTURES_DIR: directory }
  delete env.CVG_REPLAY_RECORD_CASE
  if (record) env.CVG_REPLAY_RECORD_CASE = caseId
  const run = spawnSync(
    process.execPath,
    [
      resolve(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      'vitest.snapshot.config.mts',
      'tests/replay/snapshot-replay.test.ts'
    ],
    { cwd: root, env, stdio: 'inherit' }
  )
  if (run.error) throw run.error
  if (run.signal) throw new Error(`replay terminated by ${run.signal}`)
  return run.status ?? 1
}
try {
  process.exitCode = main()
} catch (error) {
  console.error(
    `snapshot replay rejected: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exitCode = 1
}
