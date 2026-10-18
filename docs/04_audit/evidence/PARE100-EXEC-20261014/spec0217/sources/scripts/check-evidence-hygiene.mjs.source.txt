/**
 * REM21-017 — evidence hygiene checker.
 *
 * Empty historical artifacts are valid only when their status is explicit in
 * the central sidecar catalog. Non-empty JSON artifacts must remain parseable.
 * Unknown historical metadata is represented as null; it is never inferred as
 * a successful command.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const evidenceRoot = resolve(process.argv[2] ?? 'docs/04_audit/evidence')
const manifestPath = join(evidenceRoot, 'empty-artifact-status.json')
const requiredFields = [
  'status',
  'command',
  'exitCode',
  'timestamp',
  'environment',
  'reason'
]
const allowedStatuses = new Set([
  'capture_missing',
  'capture_failed',
  'expected_empty'
])

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function portablePath(file) {
  return relative(evidenceRoot, file).split(sep).join('/')
}

const errors = []
let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  errors.push(`manifest unreadable: ${manifestPath}: ${error.message}`)
}

const files = statSync(evidenceRoot).isDirectory() ? walk(evidenceRoot) : []
const emptyFiles = files
  .filter((file) => statSync(file).size === 0)
  .map(portablePath)
  .sort()
const records = Array.isArray(manifest?.files) ? manifest.files : []
const recordByPath = new Map()

if (manifest && manifest.schemaVersion !== 1) {
  errors.push('manifest schemaVersion must be 1')
}
for (const record of records) {
  if (!record || typeof record.path !== 'string') {
    errors.push('manifest contains a record without a string path')
    continue
  }
  if (recordByPath.has(record.path)) {
    errors.push(`duplicate empty-artifact record: ${record.path}`)
  }
  recordByPath.set(record.path, record)
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      errors.push(`${record.path}: missing ${field}`)
    }
  }
  if (record.bytes !== 0) errors.push(`${record.path}: bytes must be 0`)
  if (!allowedStatuses.has(record.status)) {
    errors.push(`${record.path}: unsupported status ${record.status}`)
  }
  const absolute = join(evidenceRoot, record.path)
  if (!files.includes(absolute)) {
    errors.push(
      `${record.path}: manifest path does not exist under evidence root`
    )
  } else if (statSync(absolute).size !== 0) {
    errors.push(`${record.path}: manifest path is not empty on disk`)
  }
}

for (const file of emptyFiles) {
  if (!recordByPath.has(file)) {
    errors.push(`${file}: empty artifact has no status record`)
  }
}
for (const path of recordByPath.keys()) {
  if (!emptyFiles.includes(path)) {
    errors.push(`${path}: status record is not an empty artifact`)
  }
}

for (const file of files) {
  if (!file.endsWith('.json') || statSync(file).size === 0) continue
  try {
    JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    errors.push(`${portablePath(file)}: invalid JSON: ${error.message}`)
  }
}

const result = {
  evidenceRoot: portablePath(evidenceRoot) || '.',
  emptyArtifacts: emptyFiles.length,
  cataloguedEmptyArtifacts: recordByPath.size,
  parsedJsonArtifacts: files.filter(
    (file) => file.endsWith('.json') && statSync(file).size > 0
  ).length,
  errors
}
console.log(JSON.stringify(result, null, 2))
if (errors.length > 0) {
  console.error(`EVIDENCE_HYGIENE_FAILED=${errors.length}`)
  process.exit(1)
}
console.error('EVIDENCE_HYGIENE_OK')
