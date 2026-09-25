import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AUTHORITATIVE_FINDINGS_PATH,
  CLOSURE_ADJUDICATION_PATH,
  CLOSURE_REGISTRY_PATH,
  computeCurrentFindings,
  findingsProjection,
  issueClosureRegistry,
  verifyComputedFindings
} from '../scripts/lib/finding-governance.mjs'
import {
  computeDecision,
  PHASE10_REQUIRED_LOCAL_GATES
} from '../scripts/lib/certification-rules.mjs'

const roots = []
const candidateId = 'a'.repeat(64)
const runId = 'run-rem21-002-fixture'

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rem21-findings-'))
  roots.push(root)
  fs.mkdirSync(path.dirname(path.join(root, AUTHORITATIVE_FINDINGS_PATH)), {
    recursive: true
  })
  const source = fs.readFileSync(
    path.join(process.cwd(), AUTHORITATIVE_FINDINGS_PATH),
    'utf8'
  )
  fs.writeFileSync(path.join(root, AUTHORITATIVE_FINDINGS_PATH), source)
  return root
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function writeClosureRegistry(root, overrides = {}) {
  const proofPath = 'docs/closure-proof.txt'
  const proof = Buffer.from('synthetic REM21-019 closure evidence\n')
  fs.mkdirSync(path.dirname(path.join(root, proofPath)), { recursive: true })
  fs.writeFileSync(path.join(root, proofPath), proof)
  const evidence = {
    path: proofPath,
    sha256: sha256(proof),
    size: proof.byteLength
  }
  const entries = Array.from({ length: 26 }, (_, index) => {
    const id = `A21-F${String(index + 1).padStart(2, '0')}`
    const status = overrides[id] ?? 'CLOSED_LOCAL'
    return {
      id,
      status,
      task: status === 'EXTERNAL_BLOCKED' ? 'G21-5' : 'REM21-019',
      rationale:
        status === 'EXTERNAL_BLOCKED'
          ? 'External qualification remains blocked by the approved boundary.'
          : status === 'OPEN_INTERNAL'
            ? 'Fresh independent review is still required.'
            : 'Local synthetic evidence closes the controlled slice.',
      evidence: status === 'OPEN_INTERNAL' ? [] : [evidence]
    }
  })
  const sourceBytes = fs.readFileSync(
    path.join(root, AUTHORITATIVE_FINDINGS_PATH)
  )
  const registry = {
    schemaVersion: 1,
    kind: 'a21-closure-registry',
    generatedAt: new Date().toISOString(),
    source: {
      path: AUTHORITATIVE_FINDINGS_PATH,
      sha256: sha256(sourceBytes)
    },
    candidateId,
    runId,
    entries
  }
  const registryPath = path.join(root, CLOSURE_REGISTRY_PATH)
  fs.mkdirSync(path.dirname(registryPath), { recursive: true })
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
  return registry
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('REM21-002 computed finding governance', () => {
  it('derives the complete A21 inventory with current provenance', () => {
    const snapshot = computeCurrentFindings({
      root: makeRoot(),
      candidateId,
      runId,
      observedAt: '2026-09-21T12:00:00.000Z'
    })

    expect(snapshot.counts).toEqual({ total: 26, P0: 11, P1: 1, P2: 10, P3: 4 })
    expect(snapshot.findings.P0[0]).toMatchObject({
      id: 'A21-F01',
      priority: 'P0',
      status: 'OPEN',
      provenance: expect.objectContaining({
        candidateId,
        runId,
        freshness: 'CURRENT'
      })
    })
    expect(snapshot.allFindings.at(-1)).toMatchObject({
      id: 'A21-F26',
      priority: 'P3'
    })
  })

  it('fails closed when an ID is duplicated or missing', () => {
    const root = makeRoot()
    const sourcePath = path.join(root, AUTHORITATIVE_FINDINGS_PATH)
    const source = fs.readFileSync(sourcePath, 'utf8')
    fs.writeFileSync(
      sourcePath,
      source.replace('26. **A21-F26', '26. **A21-F25')
    )

    expect(() => computeCurrentFindings({ root, candidateId, runId })).toThrow(
      /findings_source_invalid:(duplicate_id|id_set_mismatch)/
    )
  })

  it('rejects candidate and run divergence', () => {
    const root = makeRoot()
    const snapshot = computeCurrentFindings({ root, candidateId, runId })

    expect(
      verifyComputedFindings({
        root,
        snapshot,
        candidateId: 'b'.repeat(64),
        runId
      })
    ).toContain('findings_candidate_id_mismatch')
    expect(
      verifyComputedFindings({
        root,
        snapshot,
        candidateId,
        runId: 'run-other'
      })
    ).toContain('findings_run_id_mismatch')
  })

  it('rejects a source hash change and stale snapshot', () => {
    const root = makeRoot()
    const snapshot = computeCurrentFindings({
      root,
      candidateId,
      runId,
      observedAt: '2026-09-21T12:00:00.000Z'
    })
    const sourcePath = path.join(root, AUTHORITATIVE_FINDINGS_PATH)
    fs.appendFileSync(sourcePath, '\n<!-- synthetic tamper -->\n')

    const failures = verifyComputedFindings({
      root,
      snapshot,
      candidateId,
      runId,
      now: Date.parse('2026-09-21T13:00:00.000Z')
    })
    expect(failures).toContain('findings_source_hash_mismatch')
    expect(failures).toContain('findings_projection_mismatch')

    const staleRoot = makeRoot()
    const stale = computeCurrentFindings({
      root: staleRoot,
      candidateId,
      runId,
      observedAt: '2020-01-01T00:00:00.000Z'
    })
    expect(
      verifyComputedFindings({
        root: staleRoot,
        snapshot: stale,
        candidateId,
        runId,
        now: Date.parse('2026-09-21T13:00:00.000Z')
      })
    ).toContain('findings_stale')
  })

  it('rejects manual P0/P1 removal and score tampering', () => {
    const root = makeRoot()
    const snapshot = computeCurrentFindings({ root, candidateId, runId })
    const manual = structuredClone(snapshot)
    manual.findings.P0 = []
    expect(
      verifyComputedFindings({ root, snapshot: manual, candidateId, runId })
    ).toContain('findings_projection_mismatch')

    const forgedScore = structuredClone(snapshot)
    forgedScore.scores.p0Closure = 100
    expect(
      verifyComputedFindings({
        root,
        snapshot: forgedScore,
        candidateId,
        runId
      })
    ).toContain('findings_projection_mismatch')
  })

  it('makes the current P0/P1 inventory a hard NO_GO', () => {
    const snapshot = computeCurrentFindings({
      root: makeRoot(),
      candidateId,
      runId
    })
    const gates = PHASE10_REQUIRED_LOCAL_GATES.map((id) => ({
      id,
      status: 'PASS'
    }))
    const decision = computeDecision({
      gates,
      findings: findingsProjection(snapshot),
      externalGates: {
        modelProvider: 'VALIDATED',
        channel: 'VALIDATED',
        externalIdentity: 'VALIDATED',
        humanSignoff: 'VALIDATED'
      }
    })

    expect(snapshot.findings.P0).toHaveLength(11)
    expect(snapshot.findings.P1).toHaveLength(1)
    expect(decision).toMatchObject({
      decision: 'NO_GO',
      certification: 'NO_GO'
    })
  })

  it('projects local closure while preserving external and internal blockers', () => {
    const root = makeRoot()
    writeClosureRegistry(root, {
      'A21-F05': 'EXTERNAL_BLOCKED',
      'A21-F20': 'OPEN_INTERNAL'
    })
    const snapshot = computeCurrentFindings({ root, candidateId, runId })

    expect(snapshot.allFindings).toHaveLength(26)
    expect(
      snapshot.allFindings.find((item) => item.id === 'A21-F01')
    ).toMatchObject({
      status: 'CLOSED',
      scope: 'INTERNAL'
    })
    expect(
      snapshot.allFindings.find((item) => item.id === 'A21-F05')
    ).toMatchObject({
      status: 'EXTERNAL_BLOCKED',
      scope: 'EXTERNAL'
    })
    expect(snapshot.findings.P0.map((item) => item.id)).toEqual(['A21-F05'])
    expect(snapshot.findings.P1).toHaveLength(0)
    expect(snapshot.findings.P2.map((item) => item.id)).toEqual(['A21-F20'])
    expect(snapshot.blockingCounts).toMatchObject({ P0: 0, P1: 0, external: 1 })

    const gates = PHASE10_REQUIRED_LOCAL_GATES.map((id) => ({
      id,
      status: 'PASS'
    }))
    const decision = computeDecision({
      gates,
      findings: findingsProjection(snapshot),
      externalGates: {
        modelProvider: 'NOT_VALIDATED',
        channel: 'NOT_VALIDATED',
        externalIdentity: 'NOT_VALIDATED',
        humanSignoff: 'PENDING'
      }
    })
    expect(decision).toMatchObject({
      decision: 'CONDITIONAL_GO',
      certification: 'AAA_CONTROLLED'
    })
    expect(decision.blockers).toContain(
      'external findings remain constrained: A21-F05'
    )
  })

  it('requires a complete, current, hash-valid closure registry for certification', () => {
    const root = makeRoot()
    writeClosureRegistry(root)
    expect(
      computeCurrentFindings({
        root,
        candidateId,
        runId,
        requireClosureRegistry: true
      }).scores.overallClosure
    ).toBe(100)

    const registryPath = path.join(root, CLOSURE_REGISTRY_PATH)
    const valid = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
    valid.entries.pop()
    fs.writeFileSync(registryPath, JSON.stringify(valid))
    expect(() =>
      computeCurrentFindings({
        root,
        candidateId,
        runId,
        requireClosureRegistry: true
      })
    ).toThrow(/findings_closure_invalid:expected_26_entries_got_25/)

    writeClosureRegistry(root)
    const mismatched = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
    mismatched.source.sha256 = '0'.repeat(64)
    fs.writeFileSync(registryPath, JSON.stringify(mismatched))
    expect(() =>
      computeCurrentFindings({
        root,
        candidateId,
        runId,
        requireClosureRegistry: true
      })
    ).toThrow(/findings_closure_invalid:source_hash_mismatch/)

    writeClosureRegistry(root)
    fs.appendFileSync(path.join(root, 'docs/closure-proof.txt'), 'tamper\n')
    expect(() =>
      computeCurrentFindings({
        root,
        candidateId,
        runId,
        requireClosureRegistry: true
      })
    ).toThrow(/findings_closure_invalid:evidence_size_mismatch/)
  })

  it('rejects certification when the closure registry is absent', () => {
    expect(() =>
      computeCurrentFindings({
        root: makeRoot(),
        candidateId,
        runId,
        requireClosureRegistry: true
      })
    ).toThrow(/findings_closure_invalid:registry_missing/)
  })
})

describe('AUD53 run-bound closure registry issuance', () => {
  function makeIssuanceRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rem21-issue-'))
    roots.push(root)
    const copy = (relativePath) => {
      const target = path.join(root, relativePath)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(process.cwd(), relativePath), target)
    }
    copy(AUTHORITATIVE_FINDINGS_PATH)
    copy(CLOSURE_ADJUDICATION_PATH)
    const adjudication = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), CLOSURE_ADJUDICATION_PATH),
        'utf8'
      )
    )
    for (const entry of adjudication.entries) {
      for (const reference of entry.evidence ?? []) copy(reference.path)
    }
    return root
  }

  it('re-issues the run binding from the immutable adjudication', () => {
    const root = makeIssuanceRoot()
    const issuedCandidateId = 'b'.repeat(64)
    const issuedRunId = 'run-aud53-fixture-0001'

    const issued = issueClosureRegistry({
      root,
      candidateId: issuedCandidateId,
      runId: issuedRunId
    })

    expect(issued.path).toBe(CLOSURE_REGISTRY_PATH)
    expect(issued.candidateId).toBe(issuedCandidateId)
    expect(issued.runId).toBe(issuedRunId)
    expect(issued.entries).toHaveLength(26)

    const written = JSON.parse(
      fs.readFileSync(path.join(root, CLOSURE_REGISTRY_PATH), 'utf8')
    )
    expect(written.adjudication.path).toBe(CLOSURE_ADJUDICATION_PATH)
    expect(written.adjudication.sha256).toBe(
      createHash('sha256')
        .update(fs.readFileSync(path.join(root, CLOSURE_ADJUDICATION_PATH)))
        .digest('hex')
    )

    const findings = computeCurrentFindings({
      root,
      candidateId: issuedCandidateId,
      runId: issuedRunId,
      requireClosureRegistry: true
    })
    expect(findings.closureRegistry.path).toBe(CLOSURE_REGISTRY_PATH)
    expect(findings.closureRegistry.candidateId).toBe(issuedCandidateId)
  })

  it('fails closed when the adjudication is not bound to the authoritative report', () => {
    const root = makeIssuanceRoot()
    const adjudication = JSON.parse(
      fs.readFileSync(path.join(root, CLOSURE_ADJUDICATION_PATH), 'utf8')
    )
    adjudication.source.sha256 = 'c'.repeat(64)
    fs.writeFileSync(
      path.join(root, CLOSURE_ADJUDICATION_PATH),
      JSON.stringify(adjudication)
    )

    expect(() => issueClosureRegistry({ root, candidateId, runId })).toThrow(
      /adjudication_source_hash_mismatch/
    )
    expect(fs.existsSync(path.join(root, CLOSURE_REGISTRY_PATH))).toBe(false)
  })
})
