#!/usr/bin/env node
/**
 * AAA-13 integration rehearsal — snapshot builder.
 *
 * Copies the current candidate (tracked + untracked non-ignored files, exactly
 * the certification candidate scope) into an isolated directory, preserving
 * tracked/untracked status so the copied candidateId matches the origin. The
 * shared working tree is never modified. Drift during capture aborts with a
 * machine-readable report instead of a silent mixed snapshot.
 *
 * Usage:
 *   node create-snapshot.mjs <sharedRoot> <snapRoot> <evidenceDir>
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CANDIDATE_EXCLUDED_FILES,
  CANDIDATE_EXCLUDED_PREFIXES,
  CANDIDATE_SCOPE_NOTE,
  collectCandidateFiles,
  computeCandidateId,
  sha256Bytes
} from '../../../../../../scripts/lib/certification-rules.mjs'

const [sharedRootArg, snapRootArg, evidenceDirArg] = process.argv.slice(2)
const sharedRoot = path.resolve(sharedRootArg ?? process.cwd())
const snapRoot = path.resolve(snapRootArg)
const evidenceDir = path.resolve(evidenceDirArg)
fs.mkdirSync(evidenceDir, { recursive: true })

const runGit = (cwd, args, options = {}) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', ...options })

const writeJson = (name, value) =>
  fs.writeFileSync(
    path.join(evidenceDir, name),
    `${JSON.stringify(value, null, 2)}\n`
  )

const originBefore = collectCandidateFiles(sharedRoot)
const originIdBefore = computeCandidateId(originBefore)
const trackedPaths = runGit(sharedRoot, ['ls-files', '-z'])
  .stdout.split('\0')
  .filter(Boolean)

fs.rmSync(snapRoot, { recursive: true, force: true })
fs.mkdirSync(snapRoot, { recursive: true })
for (const file of originBefore) {
  const target = path.join(snapRoot, file.path)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(path.join(sharedRoot, file.path), target)
}

const originAfter = collectCandidateFiles(sharedRoot)
const originIdAfter = computeCandidateId(originAfter)
const captureDrift = originIdBefore !== originIdAfter
if (captureDrift) {
  const before = new Map(originBefore.map((file) => [file.path, file]))
  const after = new Map(originAfter.map((file) => [file.path, file]))
  const findings = []
  for (const [filePath, file] of before) {
    const now = after.get(filePath)
    if (!now) findings.push({ type: 'missing', path: filePath })
    else if (now.sha256 !== file.sha256) {
      findings.push({
        type: 'changed',
        path: filePath,
        before: file.sha256,
        after: now.sha256
      })
    }
  }
  for (const [filePath] of after) {
    if (!before.has(filePath)) findings.push({ type: 'added', path: filePath })
  }
  writeJson('capture-drift.json', {
    originCandidateIdBefore: originIdBefore,
    originCandidateIdAfter: originIdAfter,
    findings
  })
  process.stderr.write(
    `[snapshot] CAPTURE_DRIFT before=${originIdBefore} after=${originIdAfter}\n`
  )
  process.exit(2)
}

runGit(snapRoot, ['init', '--quiet'])
const copiedPaths = new Set(originBefore.map((file) => file.path))
const trackedToAdd = trackedPaths.filter((relative) =>
  copiedPaths.has(relative)
)
const trackedListPath = path.join(path.dirname(snapRoot), 'tracked-paths.nul')
fs.writeFileSync(trackedListPath, trackedToAdd.join('\0'))
const addResult = runGit(snapRoot, [
  'add',
  '--pathspec-from-file',
  trackedListPath,
  '--pathspec-file-nul'
])
if (addResult.status !== 0) {
  process.stderr.write(`[snapshot] git add failed: ${addResult.stderr}\n`)
  process.exit(4)
}
const commitResult = runGit(snapRoot, [
  '-c',
  'user.email=aaa13-snapshot@local',
  '-c',
  'user.name=aaa13-snapshot',
  'commit',
  '--quiet',
  '-m',
  'aaa13 integration rehearsal snapshot'
])
if (commitResult.status !== 0) {
  process.stderr.write(`[snapshot] git commit failed: ${commitResult.stderr}\n`)
  process.exit(4)
}
const head = runGit(snapRoot, ['rev-parse', 'HEAD']).stdout.trim()

const copyFiles = collectCandidateFiles(snapRoot)
const copyId = computeCandidateId(copyFiles)
const copyByPath = new Map(copyFiles.map((file) => [file.path, file]))
const mismatches = []
for (const file of originAfter) {
  const copy = copyByPath.get(file.path)
  if (!copy) {
    mismatches.push({ type: 'missing-in-copy', path: file.path })
    continue
  }
  if (
    copy.sha256 !== file.sha256 ||
    copy.size !== file.size ||
    copy.tracked !== file.tracked
  ) {
    mismatches.push({
      type: 'record-mismatch',
      path: file.path,
      origin: {
        sha256: file.sha256,
        size: file.size,
        tracked: file.tracked
      },
      copy: { sha256: copy.sha256, size: copy.size, tracked: copy.tracked }
    })
  }
}
for (const file of copyFiles) {
  if (!originAfter.some((origin) => origin.path === file.path)) {
    mismatches.push({ type: 'extra-in-copy', path: file.path })
  }
}

const scripts = {}
for (const relative of [
  'scripts/lib/certification-rules.mjs',
  'scripts/phase10-verify.mjs',
  'scripts/phase10-certify.mjs'
]) {
  scripts[relative] = {
    origin: sha256Bytes(fs.readFileSync(path.join(sharedRoot, relative))),
    copy: sha256Bytes(fs.readFileSync(path.join(snapRoot, relative)))
  }
}

const snapshotManifest = {
  schemaVersion: 1,
  kind: 'aaa13-integration-snapshot',
  createdAt: new Date().toISOString(),
  originRoot: sharedRoot,
  snapRoot,
  scope: {
    note: CANDIDATE_SCOPE_NOTE,
    excludedPrefixes: CANDIDATE_EXCLUDED_PREFIXES,
    excludedFiles: CANDIDATE_EXCLUDED_FILES,
    additionalSnapshotExclusions: [
      '.git (origin history not copied; a local snapshot commit is created)',
      'coverage/test-results/playwright-report (generated; recreated by the run)',
      'docs/04_audit/evidence (already excluded by candidate scope)',
      'certification generated outputs (recreated by the run); input files findings.json/external-gates.json are included'
    ]
  },
  candidateId: {
    originBefore: originIdBefore,
    originAfter: originIdAfter,
    copy: copyId,
    match: originIdBefore === copyId && mismatches.length === 0
  },
  files: {
    count: originAfter.length,
    tracked: originAfter.filter((file) => file.tracked).length,
    untracked: originAfter.filter((file) => !file.tracked).length,
    originTrackedNotCopied: trackedPaths.filter(
      (relative) => !copiedPaths.has(relative)
    )
  },
  git: { snapshotHead: head },
  scripts,
  mismatches
}
writeJson('snapshot-manifest.json', snapshotManifest)
fs.writeFileSync(
  path.join(evidenceDir, 'snapshot-files.sha256'),
  `${originAfter.map((file) => `${file.sha256}  ${file.path}`).join('\n')}\n`
)
process.stdout.write(
  `${JSON.stringify({
    originCandidateId: originIdBefore,
    copyCandidateId: copyId,
    match: snapshotManifest.candidateId.match,
    files: snapshotManifest.files,
    snapshotHead: head,
    mismatches: mismatches.length
  })}\n`
)
process.exit(snapshotManifest.candidateId.match ? 0 : 3)
