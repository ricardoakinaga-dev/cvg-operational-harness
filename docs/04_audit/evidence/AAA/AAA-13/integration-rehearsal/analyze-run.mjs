#!/usr/bin/env node
/**
 * AAA-13 integration rehearsal — producer/verifier artifact correlation.
 *
 * Reads the snapshot certification result/manifest and derives, per gate, the
 * evidence binding (runId/candidateId/gate header, manifest hash, raw parser
 * outcome, skip inventory) using the approved certification rules. Emits
 * gate-matrix.json and gate-matrix.md plus a classification of any failure
 * (product, environment, drift, producer/verifier incompatibility).
 *
 * Usage: node analyze-run.mjs <snapshotRoot> <evidenceDir>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANDIDATE_EXCLUDED_FILES,
  CANDIDATE_EXCLUDED_PREFIXES,
  GATE_ENVIRONMENT_EVIDENCE_MATRIX,
  GATE_EVIDENCE_MATRIX,
  parseLogHeader,
  sha256Bytes,
  verifyGateEvidence
} from '../../../../../../scripts/lib/certification-rules.mjs'

const [snapshotRootArg, evidenceDirArg] = process.argv.slice(2)
const snapshotRoot = path.resolve(snapshotRootArg)
const evidenceDir = path.resolve(evidenceDirArg)

const result = JSON.parse(
  fs.readFileSync(
    path.join(snapshotRoot, 'certification/phase10-result.json'),
    'utf8'
  )
)
const manifest = JSON.parse(
  fs.readFileSync(
    path.join(snapshotRoot, 'certification/manifest.json'),
    'utf8'
  )
)
const reader = (relativePath) => {
  const absolute = path.join(snapshotRoot, relativePath)
  return fs.existsSync(absolute) ? fs.readFileSync(absolute) : undefined
}

const manifestArtifacts = new Map(
  manifest.artifacts.map((artifact) => [artifact.path, artifact])
)

const gateRows = []
for (const gate of result.gates) {
  const entry =
    GATE_EVIDENCE_MATRIX[gate.id] ??
    GATE_ENVIRONMENT_EVIDENCE_MATRIX[gate.id] ??
    null
  const evidence = (gate.evidence ?? []).map((item) => {
    const record = manifestArtifacts.get(item.path)
    const content = reader(item.path)
    const actualSha = content ? sha256Bytes(content) : null
    return {
      path: item.path,
      kind: item.kind,
      sha256: item.sha256,
      size: item.size,
      manifestMatch:
        record !== undefined &&
        record.sha256 === item.sha256 &&
        record.size === item.size,
      manifestGateId: record?.gateId ?? null,
      actualHashMatch: actualSha === item.sha256,
      runId: item.runId ?? null
    }
  })
  const logItem = (gate.evidence ?? []).find((item) => item.kind === 'log')
  const logContent = logItem ? reader(logItem.path) : undefined
  const header = logContent ? parseLogHeader(logContent.toString('utf8')) : null
  const logPath = logItem?.path ?? null
  gateRows.push({
    id: gate.id,
    kind: entry?.kind ?? 'unknown',
    status: gate.status,
    exitCode: gate.exitCode,
    durationMs: gate.durationMs,
    required: entry?.optional !== true,
    log: logPath,
    header: header
      ? {
          runId: header.runId ?? null,
          candidateId: header.candidateId ?? null,
          gate: header.gate ?? null,
          exitCode: header.exitCode ?? null
        }
      : null,
    headerBindings: header
      ? {
          runIdMatches: header.runId === result.runId,
          candidateIdMatches:
            header.candidateId === result.candidate?.candidateId,
          gateMatches: header.gate === gate.id,
          exitCodeMatches: Number(header.exitCode) === gate.exitCode
        }
      : null,
    evidence,
    metrics: gate.metrics ?? null,
    skipJustification: gate.skipJustification ?? null,
    skipped:
      (gate.metrics?.testsSkipped ?? 0) + (gate.metrics?.filesSkipped ?? 0)
  })
}

const verificationFailures = verifyGateEvidence({
  result,
  manifest,
  artifactReader: reader
})
const driftPath = path.join(snapshotRoot, 'certification/candidate-drift.json')
const drift = fs.existsSync(driftPath)
  ? JSON.parse(fs.readFileSync(driftPath, 'utf8'))
  : null

const classifications = []
if (verificationFailures.length === 0 && !drift) {
  classifications.push({
    class: 'clean_integration',
    detail:
      'all gates PASS with bound raw evidence; verifier accepted the same snapshot'
  })
} else {
  for (const failure of verificationFailures) {
    let classification = 'producer_verifier_incompatibility'
    if (
      failure.startsWith('gate_raw_failure') ||
      failure.startsWith('gate_status_mismatch')
    ) {
      classification = 'product_or_test_failure'
    } else if (failure.startsWith('missing_environment_gate')) {
      classification = 'environment_dependency'
    } else if (failure.startsWith('candidate_drift') || drift) {
      classification = 'drift'
    }
    classifications.push({ class: classification, failure })
  }
  if (drift) {
    classifications.push({
      class: 'drift',
      failure: `candidate_drift_findings:${drift.findings?.length ?? 0}`
    })
  }
}

const matrix = {
  schemaVersion: 1,
  kind: 'aaa13-integration-gate-matrix',
  generatedAt: new Date().toISOString(),
  snapshotRoot,
  candidateId: result.candidate?.candidateId,
  runId: result.runId,
  manifestCandidateId: manifest.candidateId,
  manifestRunId: manifest.runId,
  decision: result.decision,
  certification: result.certification,
  gates: gateRows,
  verificationFailures,
  drift,
  classifications,
  scope: {
    excludedPrefixes: CANDIDATE_EXCLUDED_PREFIXES,
    excludedFiles: CANDIDATE_EXCLUDED_FILES
  }
}
fs.writeFileSync(
  path.join(evidenceDir, 'gate-matrix.json'),
  `${JSON.stringify(matrix, null, 2)}\n`
)

const lines = [
  '# AAA-13 integration rehearsal — gate matrix',
  '',
  `- candidateId: \`${result.candidate?.candidateId}\``,
  `- runId: \`${result.runId}\``,
  `- decision: \`${result.decision} / ${result.certification}\``,
  `- verifyGateEvidence failures: ${verificationFailures.length}`,
  `- candidate drift: ${drift ? 'YES' : 'none'}`,
  '',
  '| Gate | Kind | Status | Exit | Required | Log runId | Log candidate | Evidence | Skip |',
  '| ---- | ---- | ------ | ---- | -------- | --------- | ------------- | -------- | ---- |'
]
for (const gate of gateRows) {
  lines.push(
    `| ${gate.id} | ${gate.kind} | ${gate.status} | ${gate.exitCode} | ${gate.required ? 'yes' : 'no'} | ${
      gate.headerBindings?.runIdMatches ? 'ok' : 'n/a'
    } | ${gate.headerBindings?.candidateIdMatches ? 'ok' : 'n/a'} | ${
      gate.evidence.length
    } (manifest ${gate.evidence.filter((item) => item.manifestMatch).length}) | ${gate.skipped} |`
  )
}
lines.push('', '## Classification', '')
for (const item of classifications) {
  lines.push(`- ${item.class}: ${item.failure ?? item.detail}`)
}
fs.writeFileSync(
  path.join(evidenceDir, 'gate-matrix.md'),
  `${lines.join('\n')}\n`
)

process.stdout.write(
  `${JSON.stringify({
    gates: gateRows.length,
    verificationFailures: verificationFailures.length,
    drift: Boolean(drift),
    classifications: classifications.map((item) => item.class),
    skippedPerGate: Object.fromEntries(
      gateRows.map((gate) => [gate.id, gate.skipped])
    )
  })}\n`
)
