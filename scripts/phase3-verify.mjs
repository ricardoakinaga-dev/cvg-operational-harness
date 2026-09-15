import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const focusedFiles = [
  'packages/harness/src/__tests__/iterative-runtime.test.ts',
  'packages/harness/src/__tests__/runtime-selection.test.ts',
  'packages/harness/src/__tests__/context-engine.test.ts',
  'packages/harness/src/__tests__/agent-loop-evals.test.ts',
  'packages/orchestrator/src/__tests__/hybrid-orchestrator.test.ts',
  'apps/worker/src/__tests__/operational-harness-iterative.test.ts'
]
const formattedFiles = [
  'packages/contracts/src/execution-v2.ts',
  'packages/contracts/src/contracts.ts',
  'packages/orchestrator/src/hybrid-orchestrator.ts',
  'packages/orchestrator/src/scripted.ts',
  'packages/harness/src/iterative-runtime.ts',
  'packages/harness/src/context-engine.ts',
  'packages/harness/src/completion.ts',
  'packages/harness/src/step-store.ts',
  'packages/harness/src/trajectory.ts',
  'packages/harness/src/createOperationalHarness.ts',
  'packages/persistence/src/operational-step-postgres.ts',
  'packages/persistence/migrations/0019_iterative_execution_steps.sql',
  'apps/worker/src/phase3-synthetic-agent.ts',
  'apps/worker/src/operational-harness-worker.ts',
  'apps/worker/src/__tests__/operational-harness-iterative.test.ts',
  'apps/worker/src/__tests__/operational-harness-iterative-postgres.integration.test.ts',
  'scripts/phase3-demo.ts',
  'scripts/phase3-verify.mjs'
]

function run(label, command, args, env = process.env) {
  console.log(JSON.stringify({ event: 'phase3.verify.start', label }))
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  })
  if (result.error) {
    console.error(
      JSON.stringify({
        event: 'phase3.verify.failed',
        label,
        reason: result.error.message
      })
    )
    return false
  }
  if (result.status !== 0) {
    console.error(
      JSON.stringify({
        event: 'phase3.verify.failed',
        label,
        exitCode: result.status,
        signal: result.signal
      })
    )
    return false
  }
  console.log(JSON.stringify({ event: 'phase3.verify.pass', label }))
  return true
}

const gates = [
  [
    'format:phase3',
    'npx',
    ['prettier', '--check', '--ignore-unknown', ...formattedFiles]
  ],
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
  ['demo:phase3', npm, ['run', 'demo:phase3']]
]

for (const [label, command, args] of gates) {
  if (!run(label, command, args)) process.exit(1)
}

if (!process.env.TEST_DATABASE_URL?.trim()) {
  console.error(
    JSON.stringify({
      event: 'phase3.verify.environment_blocked',
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
    event: 'phase3.verify.completed',
    postgres: 'passed',
    externalEffects: false,
    production: 'NO_GO'
  })
)
