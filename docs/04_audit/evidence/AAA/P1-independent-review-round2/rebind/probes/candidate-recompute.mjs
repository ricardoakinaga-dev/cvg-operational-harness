// Successor candidateId recomputation (P2-B rebind).
import {
  collectCandidateFiles,
  computeCandidateId
} from '/home/ricardo/cvg-agent-secretary-v2/scripts/lib/certification-rules.mjs'
const files = collectCandidateFiles('/home/ricardo/cvg-agent-secretary-v2')
console.log(
  JSON.stringify({
    probe: 'p2b-candidate-recompute',
    fileCount: files.length,
    candidateId: computeCandidateId(files),
    frozenRound5:
      '328d6a384658e75dc241db08d59072cbc4c8c4c430bc7d48063653443f092f67'
  })
)
