import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import {
  collectCandidateFiles,
  buildCandidateRecord,
  computeDecision,
  PHASE10_REQUIRED_LOCAL_GATES
} from '../../../../../../scripts/lib/certification-rules.mjs'
const original = process.cwd()
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aaa13-coordinator-'))
const write = (p, data) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true })
  fs.writeFileSync(path.join(root, p), data)
}
for (const p of [
  'scripts/lib/certification-rules.mjs',
  'scripts/phase10-verify.mjs'
])
  write(p, fs.readFileSync(path.join(original, p)))
fs.symlinkSync(
  path.join(original, 'node_modules'),
  path.join(root, 'node_modules'),
  'dir'
)
write('package.json', '{"type":"module"}\n')
write('src/synthetic.js', 'export const synthetic = true\n')
assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0)
fs.mkdirSync(path.join(root, 'certification'), { recursive: true })
const self = spawnSync(
  process.execPath,
  ['scripts/phase10-verify.mjs', '--self-test'],
  { cwd: root, encoding: 'utf8' }
)
const candidate = buildCandidateRecord({
  root,
  files: collectCandidateFiles(root)
})
candidate.git.head = '0000000000000000000000000000000000000000'
const gates = PHASE10_REQUIRED_LOCAL_GATES.map((id) => ({
  id,
  command: 'NOT EXECUTED: synthetic declaration',
  status: 'PASS',
  exitCode: 0,
  durationMs: 0
}))
const findings = { P0: [], P1: [], P2: [] }
const externalGates = {
  modelProvider: 'NOT_VALIDATED',
  channel: 'NOT_VALIDATED',
  externalIdentity: 'NOT_VALIDATED',
  humanSignoff: 'NOT_VALIDATED'
}
const decision = computeDecision({ gates, findings, externalGates })
const result = {
  schemaVersion: 1,
  phase: '10',
  kind: 'phase10-result',
  commit: candidate.git.head,
  candidate,
  timestamp: new Date().toISOString(),
  scores: { synthetic: 99 },
  findings,
  gates,
  externalGates,
  metrics: {
    chaos: { executed: 14, failed: 0 },
    evals: { verdict: 'PASS' },
    load: { loss: 0, duplicates: 0 },
    restore: { integrity: { digestMatches: true } }
  },
  certification: decision.certification,
  decision: decision.decision,
  remainingBlockers: decision.remainingBlockers ?? []
}
write('certification/phase10-result.json', JSON.stringify(result))
write(
  'certification/manifest.json',
  JSON.stringify({
    schemaVersion: 1,
    phase: '10',
    kind: 'phase10-manifest',
    commit: candidate.git.head,
    timestamp: result.timestamp,
    artifacts: [],
    decision: result.decision,
    certification: result.certification,
    candidateId: candidate.candidateId
  })
)
const observed = spawnSync(process.execPath, ['scripts/phase10-verify.mjs'], {
  cwd: root,
  encoding: 'utf8'
})
console.log(
  JSON.stringify(
    {
      selfTestExit: self.status,
      selfTestOutput: self.stderr,
      executedProductGates: 0,
      manifestArtifacts: 0,
      gateLogs: 0,
      publicVerifierExit: observed.status,
      publicVerifierOutput: observed.stderr
    },
    null,
    2
  )
)
assert.equal(
  observed.status,
  0,
  'Counterexample changed; inspect current result'
)
assert.match(observed.stderr, /current candidate qualified/)
fs.rmSync(root, { recursive: true, force: true })
