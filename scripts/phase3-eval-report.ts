import { writeFileSync, mkdirSync } from 'node:fs'
import {
  LOOP_EVAL_DATASET,
  runLoopEvalSuite
} from '../packages/harness/src/evals/loop-evals.ts'

async function main(): Promise<void> {
  const results = await runLoopEvalSuite()
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: 'phase3-agent-loop',
    scenarioCount: LOOP_EVAL_DATASET.length,
    passed: results.filter((result) => result.pass).length,
    failed: results.filter((result) => !result.pass).length,
    externalEffects: false,
    results
  }
  mkdirSync('docs/phase3/evidence', { recursive: true })
  writeFileSync(
    'docs/phase3/evidence/LOOP_EVAL_RESULTS.json',
    `${JSON.stringify(report, null, 2)}\n`
  )
  console.log(JSON.stringify({ event: 'phase3.evals', ...report, results: undefined }))
}
main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
