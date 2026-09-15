import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const focusedFiles = [
  'apps/worker/src/__tests__/operational-harness-worker.test.ts',
  'apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts',
  'packages/harness/src/__tests__/effect-journal.test.ts',
  'packages/harness/src/__tests__/execution-spine.test.ts',
  'apps/api/src/__tests__/execution-spine.test.ts'
]
const formattedFiles = [
  'apps/worker/src/phase2-synthetic-effect.ts',
  'apps/worker/src/operational-harness-worker.ts',
  'apps/worker/src/__tests__/operational-harness-worker.test.ts',
  'apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts',
  'scripts/phase2-demo.ts',
  'scripts/phase2-verify.mjs',
  'docs/phase2/TASK.md',
  'docs/phase2/PRD.md',
  'docs/phase2/SPEC.md',
  'docs/99_runtime_state.md',
  'docs/20_master_execution_log.md',
  'docs/30_backlog_master.md'
]

function run(label, command, args, env = process.env) {
  console.log(JSON.stringify({ event: 'phase2.verify.start', label }))
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  })
  if (result.error) {
    console.error(
      JSON.stringify({
        event: 'phase2.verify.failed',
        label,
        reason: result.error.message
      })
    )
    return false
  }
  if (result.status !== 0) {
    console.error(
      JSON.stringify({
        event: 'phase2.verify.failed',
        label,
        exitCode: result.status,
        signal: result.signal
      })
    )
    return false
  }
  console.log(JSON.stringify({ event: 'phase2.verify.pass', label }))
  return true
}

const gates = [
  ['format:phase2', 'npx', ['prettier', '--check', ...formattedFiles]],
  ['typecheck', npm, ['run', 'typecheck']],
  ['lint', npm, ['run', 'lint']],
  ['build:harness', npm, ['run', 'build:harness']],
  ['build', npm, ['run', 'build']],
  [
    'focused',
    'npx',
    [
      'vitest',
      'run',
      '--no-file-parallelism',
      '--maxWorkers=2',
      ...focusedFiles
    ]
  ],
  ['demo:phase2', npm, ['run', 'demo:phase2']]
]

for (const [label, command, args] of gates) {
  if (!run(label, command, args)) process.exit(1)
}

if (!process.env.TEST_DATABASE_URL?.trim()) {
  console.error(
    JSON.stringify({
      event: 'phase2.verify.environment_blocked',
      gate: 'test:postgres',
      reason:
        'TEST_DATABASE_URL is required for the PostgreSQL durability catalog',
      exitCode: 2,
      externalEffects: false
    })
  )
  process.exit(2)
}

if (
  !run('test:postgres', npm, ['run', 'test:postgres', '--', '--reporter=dot'])
) {
  process.exit(1)
}

console.log(
  JSON.stringify({
    event: 'phase2.verify.completed',
    postgres: 'passed',
    externalEffects: false,
    production: 'NO_GO'
  })
)
