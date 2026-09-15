// P1 review: bind verdicts to artifact hashes + current candidate id (read-only).
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  collectCandidateFiles,
  computeCandidateId
} from '/home/ricardo/cvg-agent-secretary-v2/scripts/lib/certification-rules.mjs'

const ROOT = '/home/ricardo/cvg-agent-secretary-v2'

const judged = [
  'packages/agent-runtime/src/runtime.ts',
  'packages/agent-runtime/src/contracts.ts',
  'packages/agent-runtime/src/proposal.ts',
  'packages/agent-runtime/src/effect-journal.ts',
  'packages/agent-runtime/src/index.ts',
  'packages/approval-engine/src/engine.ts',
  'packages/approval-engine/src/contracts.ts',
  'packages/policy-engine/src/engine.ts',
  'packages/policy-engine/src/capabilities.ts',
  'packages/policy-engine/src/grants.ts',
  'packages/channel-gateway/src/gateway.ts',
  'packages/channel-gateway/src/effect-journal.ts',
  'packages/channel-gateway/src/effect-journal-file.ts',
  'packages/channel-gateway/src/idempotency.ts',
  'packages/channel-gateway/src/contracts.ts',
  'packages/persistence/src/effect-journal-postgres.ts',
  'packages/persistence/src/channel-effect-journal-postgres.ts',
  'packages/persistence/src/postgres.ts',
  'packages/persistence/src/journeys-postgres.ts',
  'packages/persistence/src/journeys.ts',
  'packages/persistence/src/index.ts',
  'packages/persistence/migrations/0012_channel_effect_journal.sql',
  'packages/persistence/migrations/0013_runtime_effect_journal.sql',
  'packages/persistence/migrations/0014_journeys.sql',
  'scripts/phase10-certify.mjs',
  'scripts/phase10-verify.mjs',
  'scripts/lib/certification-rules.mjs',
  'package.json',
  'package-lock.json',
  'Dockerfile',
  'apps/api/src/server.ts'
]

const evidence = [
  'docs/02_spec/aaa_execution_contract.md',
  'docs/02_spec/aaa_data_api_contract.md',
  'docs/02_spec/aaa_quality_contract.md',
  'docs/03_build/tracking/aaa_program_backlog.json',
  'docs/04_audit/evidence/AAA/AAA-07/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-08/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-09/builder/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-10/ports/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-10/wiring/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-11/builder/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-12/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-13/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T023539Z/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T023539Z/gate-matrix.json',
  'docs/04_audit/evidence/AAA/AAA-14/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-15/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-16/manifest.json',
  'docs/04_audit/evidence/AAA/AAA-17/builder/manifest.json',
  'docs/04_audit/evidence/AAA/coordinator-batch-review/review.json'
]

function sha256File(rel: string): { sha256: string; size: number } {
  const content = readFileSync(join(ROOT, rel))
  return {
    sha256: createHash('sha256').update(content).digest('hex'),
    size: content.byteLength
  }
}

const files = collectCandidateFiles(ROOT)
const candidateId = computeCandidateId(files)
const gitStatus = execFileSync('git', ['status', '--porcelain'], {
  cwd: ROOT,
  encoding: 'utf8'
})
const head = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: ROOT,
  encoding: 'utf8'
}).trim()

const output = {
  capturedAt: new Date().toISOString(),
  workspace: ROOT,
  head,
  dirtyEntries: gitStatus.split('\n').filter(Boolean).length,
  candidateId,
  candidateFileCount: files.length,
  judgedProductFiles: Object.fromEntries(
    judged.map((rel) => [rel, sha256File(rel)])
  ),
  evidenceFiles: Object.fromEntries(
    evidence.map((rel) => [rel, sha256File(rel)])
  )
}

writeFileSync(
  '/tmp/opencode/p1-review-1789268901/artifact-hashes.json',
  JSON.stringify(output, null, 2)
)
console.log(JSON.stringify({ candidateId, fileCount: files.length, dirty: output.dirtyEntries, capturedAt: output.capturedAt }))
