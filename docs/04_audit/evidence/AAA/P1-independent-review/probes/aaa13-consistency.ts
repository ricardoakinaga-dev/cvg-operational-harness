// P1 probe AAA-13: independent consistency check of the rehearsal round
// `rehearsal-20260913T023539Z` (candidate 159dd98e…). Read-only.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  collectCandidateFiles,
  computeCandidateId
} from '/home/ricardo/cvg-agent-secretary-v2/scripts/lib/certification-rules.mjs'

const REHEARSAL =
  '/home/ricardo/cvg-agent-secretary-v2/docs/04_audit/evidence/AAA/AAA-13/integration-rehearsal/rehearsal-20260913T023539Z'
const SNAPSHOT = '/tmp/opencode/aaa13-rehearsal-20260913T023539Z/repo'
const EXPECTED_CANDIDATE =
  '159dd98e9fe5acbd4cfa70879b5349c95b2c419f565eb183ffbd0e95c1dc1a34'

async function main(): Promise<void> {
  void readFileSync
  const failures: string[] = []
  const matrix = JSON.parse(
    readFileSync(join(REHEARSAL, 'gate-matrix.json'), 'utf8')
  )
  const manifest = JSON.parse(
    readFileSync(join(REHEARSAL, 'manifest.json'), 'utf8')
  )

  const certifyExit = readFileSync(
    join(REHEARSAL, 'run/certify.exit'),
    'utf8'
  ).trim()
  const verifyExit = readFileSync(
    join(REHEARSAL, 'run/verify.exit'),
    'utf8'
  ).trim()
  if (certifyExit !== '0') failures.push(`certify.exit=${certifyExit}`)
  if (verifyExit !== '0') failures.push(`verify.exit=${verifyExit}`)
  if (matrix.candidateId !== EXPECTED_CANDIDATE)
    failures.push(`matrix candidate=${matrix.candidateId}`)
  if (manifest.snapshot?.candidateId !== EXPECTED_CANDIDATE) {
    failures.push(`manifest candidate=${manifest.snapshot?.candidateId}`)
  }
  if (matrix.gates?.length !== 16)
    failures.push(`gates=${matrix.gates?.length}`)
  const nonPass = (matrix.gates ?? []).filter(
    (g: { status: string }) => g.status !== 'PASS'
  )
  if (nonPass.length > 0)
    failures.push(
      `non-PASS gates=${JSON.stringify(nonPass.map((g: { id: string }) => g.id))}`
    )
  if ((matrix.verificationFailures ?? []).length > 0) {
    failures.push(
      `verificationFailures=${JSON.stringify(matrix.verificationFailures)}`
    )
  }

  // Gate log headers: runId/candidateId/gate/exitCode on every log.
  const logDir = join(REHEARSAL, 'run/logs')
  const logs = readdirSync(logDir)
    .filter((f) => f.endsWith('.log'))
    .sort()
  const headerFailures: string[] = []
  for (const log of logs) {
    const content = readFileSync(join(logDir, log), 'utf8')
    const headerLines = content
      .split('\n')
      .filter((line) => line.startsWith('# '))
    const header = headerLines.join(' ')
    const gate = header.match(/gate=([^\s]+)/)?.[1]
    const candidate = header.match(/candidateId=([^\s]+)/)?.[1]
    const runId = header.match(/runId=([^\s]+)/)?.[1]
    const exitCode = header.match(/exitCode=([^\s]+)/)?.[1]
    if (
      candidate !== EXPECTED_CANDIDATE ||
      runId !== matrix.runId ||
      gate !== log.replace('.log', '') ||
      exitCode !== '0'
    ) {
      headerFailures.push(
        `${log}: gate=${gate} candidate=${candidate} runId=${runId} exit=${exitCode}`
      )
    }
  }
  if (logs.length !== 16) failures.push(`gate logs=${logs.length}`)
  if (headerFailures.length > 0)
    failures.push(`header failures=${headerFailures.join('; ')}`)

  // Recompute the candidate digest from the preserved snapshot (read-only).
  let recomputed: string | undefined
  let fileCount: number | undefined
  try {
    const files = collectCandidateFiles(SNAPSHOT)
    fileCount = files.length
    recomputed = computeCandidateId(files)
  } catch (error) {
    failures.push(`recompute failed: ${String(error)}`)
  }
  if (recomputed !== undefined && recomputed !== EXPECTED_CANDIDATE) {
    failures.push(`recomputed candidate=${recomputed}`)
  }

  // Verify the run artifacts against the recorded SHA256SUMS.
  const sumsPath = join(REHEARSAL, 'SHA256SUMS')
  const sums = readFileSync(sumsPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split(/\s+/)
      return { hash, path: rest.join(' ') }
    })
  let sumsChecked = 0
  for (const entry of sums) {
    try {
      const content = readFileSync(join(REHEARSAL, entry.path))
      const digest = createHash('sha256').update(content).digest('hex')
      if (digest !== entry.hash) failures.push(`sha256 mismatch: ${entry.path}`)
      sumsChecked += 1
    } catch {
      failures.push(`sha256 missing: ${entry.path}`)
    }
  }

  // Coverage context (AAA-04 v2 §9.1 floors are AAA-34/P4, reported for context).
  const coverageLog = readFileSync(
    join(REHEARSAL, 'run/logs/coverage.log'),
    'utf8'
  )

  console.log(
    JSON.stringify(
      {
        probe: 'AAA-13',
        certifyExit,
        verifyExit,
        gateCount: matrix.gates?.length,
        gateStatuses: (matrix.gates ?? [])
          .map((g: { status: string }) => g.status)
          .join(','),
        decision: matrix.decision,
        runId: matrix.runId,
        candidateId: matrix.candidateId,
        gateLogHeadersOk: headerFailures.length === 0,
        snapshotFileCount: fileCount,
        recomputedCandidate: recomputed,
        sha256SumsChecked: sumsChecked,
        coverageTail: coverageLog.trim().split('\n').slice(-4),
        failures,
        falsified: failures.length > 0
      },
      null,
      2
    )
  )
  if (failures.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
