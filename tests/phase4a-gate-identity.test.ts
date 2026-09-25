/**
 * AUD19-002 — gate-identity policy tests.
 *
 * Positive: the live Phase 4A gate documents cite exactly one shared digest
 * equal to the frozen certification anchor. Negative: any divergence or extra
 * candidate declaration fails closed.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  checkGateIdentity,
  extractCandidateDigests
} from '../scripts/phase4a-gate-identity.mjs'

const FROZEN_ANCHOR_PATH =
  'certification/logs/historical/2026-09-16-phase4a/frozen-anchor.json'
const ANCHOR = JSON.parse(readFileSync(FROZEN_ANCHOR_PATH, 'utf8')).candidateId
const DIVERGENT =
  '6185c586e382d9f7f4e4fb4b3f66855b73889f6c89bd7e3553f3696c0c2f5dc8'

describe('phase4a gate identity', () => {
  it('extracts only authoritative candidate declarations', () => {
    expect(
      extractCandidateDigests(
        `Digest: ${DIVERGENT}\nCandidate digest: ${ANCHOR}\nReport SHA-256: ${DIVERGENT}`
      )
    ).toEqual([ANCHOR])
    expect(
      extractCandidateDigests(
        `candidate: ${ANCHOR}\n## Errata\n- candidate: ${DIVERGENT}`
      )
    ).toEqual([ANCHOR])
    expect(extractCandidateDigests('no candidate declaration')).toEqual([])
  })

  it('passes on the live gate documents bound to the frozen anchor', () => {
    const handoff = readFileSync('docs/phase4a/PHASE_4_HANDOFF.md', 'utf8')
    const gateValidation = readFileSync(
      'docs/phase4a/GATE_VALIDATION.md',
      'utf8'
    )
    const frozen = JSON.parse(readFileSync(FROZEN_ANCHOR_PATH, 'utf8'))
    const anchor = frozen.candidateId
    expect(anchor).toBe(ANCHOR)
    const verdict = checkGateIdentity({ handoff, gateValidation, anchor })
    expect(verdict.failures).toEqual([])
    expect(verdict.ok).toBe(true)
    expect(verdict.shared).toContain(ANCHOR)
  })

  it('fails closed when the gate documents diverge', () => {
    const verdict = checkGateIdentity({
      handoff: `candidate: ${ANCHOR}`,
      gateValidation: `candidate: ${DIVERGENT}`,
      anchor: ANCHOR
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.failures.length).toBeGreaterThan(0)
  })

  it('fails closed when the shared digest is not the frozen anchor', () => {
    const verdict = checkGateIdentity({
      handoff: `candidate: ${DIVERGENT}`,
      gateValidation: `candidate: ${DIVERGENT}`,
      anchor: ANCHOR
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.failures.join(' ')).toContain(ANCHOR)
  })

  it('fails closed when a gate document cites no digest', () => {
    const verdict = checkGateIdentity({
      handoff: 'no digest',
      gateValidation: `candidate: ${ANCHOR}`,
      anchor: ANCHOR
    })
    expect(verdict.ok).toBe(false)
  })

  it('fails closed when the anchor has an extra candidate digest', () => {
    const verdict = checkGateIdentity({
      handoff: `candidate: ${ANCHOR}\ncandidate: ${DIVERGENT}`,
      gateValidation: `candidate: ${ANCHOR}`,
      anchor: ANCHOR
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.failures.join(' ')).toContain('exactly one')
  })
})
