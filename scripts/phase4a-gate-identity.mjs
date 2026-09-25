/**
 * Phase 4A gate identity check (AUD19-002).
 *
 * Canonical authority for candidate computation:
 *   scripts/lib/certification-rules.mjs
 * (collectCandidateFiles + computeCandidateId + CANDIDATE_EXCLUDED_*).
 * This script adds no hashing logic of its own.
 *
 * Frozen historical anchor: certification/logs/historical/2026-09-16-phase4a/
 * frozen-anchor.json (run run-6185c586e382-mu44ygfz). The current Phase 10
 * result is intentionally mutable and must not replace this Phase 4 boundary.
 * The Phase 4A gate documents must each contain exactly one authoritative
 * candidate declaration, with the same digest equal to the frozen anchor.
 * Historical errata and unrelated report/fingerprint digests are not candidate
 * declarations. Any cardinality or value divergence fails the gate.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  collectCandidateFiles,
  computeCandidateId
} from './lib/certification-rules.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const HANDOFF = 'docs/phase4a/PHASE_4_HANDOFF.md'
const GATE_VALIDATION = 'docs/phase4a/GATE_VALIDATION.md'
const FROZEN_ANCHOR =
  'certification/logs/historical/2026-09-16-phase4a/frozen-anchor.json'

export function extractCandidateDigests(text) {
  const historicalStart = text.search(/^#{1,6}\s+(?:Errata\b|Historical\b)/im)
  const authoritativeText =
    historicalStart >= 0 ? text.slice(0, historicalStart) : text
  const digests = []
  for (const line of authoritativeText.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:[-*]\s*)?(?:candidate(?:\s+digest)?|candidateId)\s*:\s*`?([0-9a-f]{64})`?/i
    )
    if (match) digests.push(match[1].toLowerCase())
  }
  return [...new Set(digests)]
}

export function checkGateIdentity({ handoff, gateValidation, anchor }) {
  const failures = []
  const handoffDigests = extractCandidateDigests(handoff)
  const gateDigests = extractCandidateDigests(gateValidation)
  if (handoffDigests.length !== 1)
    failures.push(
      `handoff must cite exactly one authoritative candidate digest (found=${handoffDigests.length})`
    )
  if (gateDigests.length !== 1)
    failures.push(
      `gate validation must cite exactly one authoritative candidate digest (found=${gateDigests.length})`
    )
  const shared = handoffDigests.filter((digest) => gateDigests.includes(digest))
  if (shared.length === 0)
    failures.push(
      `handoff and gate validation share no candidate digest (handoff=${handoffDigests.join(',') || 'none'} gate=${gateDigests.join(',') || 'none'})`
    )
  if (shared.length !== 1)
    failures.push(
      `handoff and gate validation must share exactly one candidate digest (shared=${shared.join(',') || 'none'})`
    )
  if (handoffDigests.length === 1 && handoffDigests[0] !== anchor)
    failures.push(
      `handoff candidate digest does not match frozen anchor ${anchor} (handoff=${handoffDigests[0]})`
    )
  if (gateDigests.length === 1 && gateDigests[0] !== anchor)
    failures.push(
      `gate validation candidate digest does not match frozen anchor ${anchor} (gate=${gateDigests[0]})`
    )
  if (shared.length === 1 && !shared.includes(anchor))
    failures.push(
      `shared gate digest does not match frozen anchor ${anchor} (shared=${shared.join(',')})`
    )
  return {
    ok: failures.length === 0,
    failures,
    handoffDigests,
    gateDigests,
    shared,
    anchor
  }
}

function main() {
  const handoff = readFileSync(join(root, HANDOFF), 'utf8')
  const gateValidation = readFileSync(join(root, GATE_VALIDATION), 'utf8')
  const frozen = JSON.parse(readFileSync(join(root, FROZEN_ANCHOR), 'utf8'))
  const anchor = frozen.candidateId
  if (typeof anchor !== 'string' || !/^[0-9a-f]{64}$/.test(anchor)) {
    console.log(
      JSON.stringify({
        event: 'phase4a.gate_identity.failed',
        reason: 'frozen anchor is not a 64-hex digest',
        anchor
      })
    )
    process.exit(1)
  }
  const verdict = checkGateIdentity({ handoff, gateValidation, anchor })
  // Current-tree digest via the single canonical authority (informational:
  // the working tree legitimately differs from the frozen Phase 4 boundary).
  let currentTreeCandidateId = null
  try {
    currentTreeCandidateId = computeCandidateId(collectCandidateFiles(root))
  } catch (error) {
    currentTreeCandidateId = `unavailable:${error?.message ?? error}`
  }
  console.log(
    JSON.stringify({
      event: verdict.ok
        ? 'phase4a.gate_identity.pass'
        : 'phase4a.gate_identity.failed',
      handoff: HANDOFF,
      gateValidation: GATE_VALIDATION,
      frozenAnchor: FROZEN_ANCHOR,
      anchor,
      shared: verdict.shared,
      currentTreeCandidateId,
      failures: verdict.failures
    })
  )
  process.exit(verdict.ok ? 0 : 1)
}

if (process.argv[1]?.endsWith('phase4a-gate-identity.mjs')) {
  main()
}
