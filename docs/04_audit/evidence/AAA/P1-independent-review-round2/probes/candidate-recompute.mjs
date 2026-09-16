// Independent candidate recomputation probe for round 5 (fresh driver, shipped rules module).
import {
  collectCandidateFiles,
  computeCandidateId
} from '/home/ricardo/cvg-agent-secretary-v2/scripts/lib/certification-rules.mjs'

const targets = {
  currentWorkingTree: '/home/ricardo/cvg-agent-secretary-v2',
  frozenSnapshot: '/tmp/opencode/aaa13-rehearsal-20260913T062303Z/repo'
}

const expected =
  '328d6a384658e75dc241db08d59072cbc4c8c4c430bc7d48063653443f092f67'
const results = {}
for (const [name, root] of Object.entries(targets)) {
  const files = collectCandidateFiles(root)
  const id = computeCandidateId(files)
  results[name] = { fileCount: files.length, candidateId: id }
  console.log(name, files.length, id)
}
console.log('expected           ', expected)
console.log(
  'current_match:',
  results.currentWorkingTree.candidateId === expected
)
console.log('snapshot_match:', results.frozenSnapshot.candidateId === expected)
console.log(
  'trees_equal:',
  results.currentWorkingTree.candidateId === results.frozenSnapshot.candidateId
)
