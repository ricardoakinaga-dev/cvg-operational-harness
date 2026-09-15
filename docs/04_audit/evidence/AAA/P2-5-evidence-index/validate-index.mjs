#!/usr/bin/env node
// P2-5 remediation validator: verifies the four task-root evidence indexes
// (docs/04_audit/evidence/AAA/<task>/manifest.json) against the files they
// reference. Checks structure, existence and sha256, plus cross-task
// references. Prints one line per checked file; exits 0 only when there are
// zero structural errors, zero missing files and zero hash mismatches.
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..'
)
const TASKS = ['AAA-09', 'AAA-10', 'AAA-11', 'AAA-17']
const SHA256_RE = /^[0-9a-f]{64}$/

let failures = 0
let warnings = 0
let checkedFiles = 0
let okHashes = 0
let crossTaskRefs = 0

const fail = (msg) => {
  failures += 1
  console.log(`[FAIL] ${msg}`)
}
const warn = (msg) => {
  warnings += 1
  console.log(`[WARN] ${msg}`)
}
const pass = (msg) => console.log(`[PASS] ${msg}`)

const sha256 = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')

function listFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listFiles(p))
    else if (entry.isFile()) out.push(p)
  }
  return out
}

function checkReference(taskId, relPath, expectedHash, label) {
  checkedFiles += 1
  const abs = path.join(ROOT, relPath)
  if (!existsSync(abs)) {
    fail(`${taskId} ${label} missing file: ${relPath}`)
    return
  }
  const actual = sha256(abs)
  if (actual === expectedHash) {
    okHashes += 1
    pass(`${taskId} ${label} ${relPath} sha256 ${actual}`)
  } else {
    fail(
      `${taskId} ${label} sha256 mismatch: ${relPath} expected ${expectedHash} got ${actual}`
    )
  }
}

console.log('P2-5 evidence index validation')
console.log(`repo root: ${ROOT}`)
console.log(`checked at: ${new Date().toISOString()}`)
console.log('')

for (const taskId of TASKS) {
  const taskDirRel = `docs/04_audit/evidence/AAA/${taskId}`
  const rootManifestRel = `${taskDirRel}/manifest.json`
  const rootManifestAbs = path.join(ROOT, rootManifestRel)

  console.log(`--- ${taskId} ---`)
  if (!existsSync(rootManifestAbs)) {
    fail(`${taskId} root manifest missing: ${rootManifestRel}`)
    continue
  }

  let manifest
  try {
    manifest = JSON.parse(readFileSync(rootManifestAbs, 'utf8'))
  } catch (error) {
    fail(`${taskId} root manifest is not valid JSON: ${error.message}`)
    continue
  }

  if (manifest.schemaVersion !== 1) fail(`${taskId} schemaVersion must be 1`)
  if (manifest.taskId !== taskId)
    fail(`${taskId} taskId field is ${manifest.taskId}`)
  if (
    typeof manifest.generatedAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.generatedAt))
  )
    fail(`${taskId} generatedAt is not an ISO timestamp`)
  if (manifest.indexOnly !== true) fail(`${taskId} indexOnly must be true`)
  if (
    typeof manifest.indexNote !== 'string' ||
    !/index only/i.test(manifest.indexNote)
  )
    fail(`${taskId} indexNote must state that the manifest is an index`)
  if (!Array.isArray(manifest.files)) fail(`${taskId} files must be an array`)
  if (!Array.isArray(manifest.limitations) || manifest.limitations.length === 0)
    fail(`${taskId} limitations must be a non-empty array`)
  if (
    !Array.isArray(manifest.authoritativeManifests) ||
    manifest.authoritativeManifests.length === 0
  )
    fail(`${taskId} authoritativeManifests must be a non-empty array`)

  const files = Array.isArray(manifest.files) ? manifest.files : []
  const listed = new Set(files.map((entry) => entry.path))
  for (const entry of files) {
    if (typeof entry.path !== 'string' || typeof entry.purpose !== 'string')
      fail(
        `${taskId} files[] entry without path/purpose: ${JSON.stringify(entry)}`
      )
    if (entry.path === rootManifestRel)
      fail(`${taskId} root manifest must not index itself`)
    if (!entry.path.startsWith(`${taskDirRel}/`))
      fail(`${taskId} indexed path outside task root: ${entry.path}`)
    if (!SHA256_RE.test(entry.sha256 ?? ''))
      fail(`${taskId} invalid sha256 for ${entry.path}`)
    else checkReference(taskId, entry.path, entry.sha256, 'files')
  }

  for (const authoritative of manifest.authoritativeManifests ?? []) {
    if (!listed.has(authoritative))
      fail(
        `${taskId} authoritative manifest not listed in files[]: ${authoritative}`
      )
    if (!authoritative.endsWith('/manifest.json'))
      fail(
        `${taskId} authoritative manifest is not a manifest.json: ${authoritative}`
      )
  }

  for (const ref of manifest.crossTaskReferences ?? []) {
    crossTaskRefs += 1
    if (!SHA256_RE.test(ref.sha256 ?? '')) {
      fail(`${taskId} invalid cross-task sha256 for ${ref.path}`)
      continue
    }
    checkReference(taskId, ref.path, ref.sha256, 'crossTaskReferences')
  }

  const onDisk = listFiles(path.join(ROOT, taskDirRel))
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join('/'))
    .filter((rel) => rel !== rootManifestRel)
    .sort()
  for (const rel of onDisk) {
    if (!listed.has(rel))
      warn(`${taskId} file on disk not indexed (index stale): ${rel}`)
  }

  if (!failures) {
    pass(
      `${taskId} structure ok (schemaVersion=1, indexOnly, authoritativeManifests=${manifest.authoritativeManifests.length}, limitations=${manifest.limitations.length})`
    )
  }
  console.log('')
}

console.log('summary:')
console.log(
  `  manifests=${TASKS.length} indexed_files=${checkedFiles - crossTaskRefs} cross_task_refs=${crossTaskRefs} sha256_ok=${okHashes} failures=${failures} warnings=${warnings}`
)
console.log(`RESULT: ${failures === 0 ? 'PASS' : 'FAIL'}`)
process.exitCode = failures === 0 ? 0 : 1
