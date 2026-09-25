import fs from 'node:fs'
import path from 'node:path'
import { sha256Bytes } from './certification-rules.mjs'

export const AUTHORITATIVE_FINDINGS_PATH =
  'docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md'
export const CLOSURE_REGISTRY_PATH =
  'docs/04_audit/evidence/AUD-20260921/REM21-019/finding-closure.json'

const EXPECTED_IDS = Array.from(
  { length: 26 },
  (_, index) => `A21-F${String(index + 1).padStart(2, '0')}`
)

const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3'])
const FRESHNESS_MAX_AGE_MS = 24 * 60 * 60 * 1000
const CLOSURE_STATUSES = new Set([
  'CLOSED_LOCAL',
  'EXTERNAL_BLOCKED',
  'OPEN_INTERNAL'
])

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function fail(message) {
  throw new Error(`findings_source_invalid:${message}`)
}

function lineAt(source, offset) {
  return source.slice(0, offset).split(/\r?\n/).length
}

function priorityForSection(section, explicitPriority) {
  if (explicitPriority) {
    const priority = explicitPriority.split(/\s+/u)[0]
    if (!PRIORITIES.has(priority))
      fail(`unsupported_priority:${explicitPriority}`)
    return priority
  }
  if (section === 'Médio impacto') return 'P2'
  if (section === 'Baixo impacto') return 'P3'
  fail(`missing_priority:${section}`)
}

/**
 * Parse the numbered findings from the official A21 report. The parser is
 * intentionally narrow: a malformed or incomplete source cannot silently
 * become a smaller blocker set.
 */
export function parseAuthoritativeFindings(source) {
  const sectionPattern = /^###\s+(.+)\s*$/gmu
  const entryPattern = /^\s*(\d+)\.\s+\*\*(A21-F\d{2})\s+—\s+([\s\S]*?)\*\*/gmu
  const sections = []
  let sectionMatch
  while ((sectionMatch = sectionPattern.exec(source)) !== null) {
    sections.push({
      name: sectionMatch[1].trim(),
      offset: sectionMatch.index
    })
  }

  const entries = []
  let match
  while ((match = entryPattern.exec(source)) !== null) {
    const section = [...sections]
      .reverse()
      .find((candidate) => candidate.offset < match.index)?.name
    if (!section) fail(`entry_without_section:${match[2]}`)

    const ordinal = Number(match[1])
    const id = match[2]
    const payload = match[3].replace(/\s+/gu, ' ').trim()
    const prioritySeparator = payload.match(
      /^((?:P[01])(?:\s+alto)?)\s+—\s+(.+)$/u
    )
    const explicitPriority = prioritySeparator?.[1] ?? ''
    const title = prioritySeparator?.[2] ?? payload
    if (!/^\d+$/.test(match[1]) || !title) fail(`malformed_entry:${id}`)
    if (entries.some((entry) => entry.id === id)) fail(`duplicate_id:${id}`)

    entries.push({
      ordinal,
      id,
      priority: priorityForSection(section, explicitPriority),
      section,
      title,
      sourceLine: lineAt(source, match.index)
    })
  }

  if (entries.length !== EXPECTED_IDS.length) {
    fail(`expected_${EXPECTED_IDS.length}_entries_got_${entries.length}`)
  }
  const ids = entries.map((entry) => entry.id)
  if (stableJson(ids) !== stableJson(EXPECTED_IDS)) {
    const missing = EXPECTED_IDS.filter((id) => !ids.includes(id))
    const unexpected = ids.filter((id) => !EXPECTED_IDS.includes(id))
    fail(
      `id_set_mismatch:missing=${missing.join(',')}:unexpected=${unexpected.join(',')}`
    )
  }
  entries.forEach((entry, index) => {
    if (entry.ordinal !== index + 1) fail(`ordinal_mismatch:${entry.id}`)
  })
  return entries
}

function loadAuthoritativeSource(root) {
  const sourcePath = path.join(root, AUTHORITATIVE_FINDINGS_PATH)
  if (!fs.existsSync(sourcePath))
    fail(`source_missing:${AUTHORITATIVE_FINDINGS_PATH}`)
  const bytes = fs.readFileSync(sourcePath)
  const source = bytes.toString('utf8')
  return {
    sourcePath: AUTHORITATIVE_FINDINGS_PATH,
    sourceSha256: sha256Bytes(bytes),
    sourceBytes: bytes,
    source
  }
}

function assertCandidateId(candidateId) {
  if (!/^[0-9a-f]{64}$/u.test(candidateId ?? '')) {
    fail('candidate_id_invalid')
  }
}

function assertRunId(runId) {
  if (!/^run-[A-Za-z0-9-]+$/u.test(runId ?? '')) fail('run_id_invalid')
}

function closureFail(message) {
  throw new Error(`findings_closure_invalid:${message}`)
}

function readClosureEvidence(root, reference, entryId) {
  if (!reference || typeof reference !== 'object') {
    closureFail(`evidence_invalid:${entryId}`)
  }
  const relativePath = reference.path
  if (
    typeof relativePath !== 'string' ||
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.split('/').includes('..')
  ) {
    closureFail(`evidence_path_invalid:${entryId}`)
  }
  const absolutePath = path.resolve(root, relativePath)
  const relativeToRoot = path.relative(root, absolutePath)
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    closureFail(`evidence_path_outside_root:${entryId}`)
  }
  if (!fs.existsSync(absolutePath)) {
    closureFail(`evidence_missing:${entryId}:${relativePath}`)
  }
  const bytes = fs.readFileSync(absolutePath)
  if (
    !Number.isInteger(reference.size) ||
    reference.size < 0 ||
    reference.size !== bytes.byteLength
  ) {
    closureFail(`evidence_size_mismatch:${entryId}:${relativePath}`)
  }
  if (
    typeof reference.sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(reference.sha256) ||
    reference.sha256 !== sha256Bytes(bytes)
  ) {
    closureFail(`evidence_hash_mismatch:${entryId}:${relativePath}`)
  }
  return {
    path: relativePath,
    sha256: reference.sha256,
    size: reference.size
  }
}

function loadClosureRegistry({
  root,
  source,
  candidateId,
  runId,
  required,
  now = Date.now()
}) {
  const absolutePath = path.join(root, CLOSURE_REGISTRY_PATH)
  if (!fs.existsSync(absolutePath)) {
    if (required) closureFail('registry_missing')
    return null
  }

  const bytes = fs.readFileSync(absolutePath)
  let registry
  try {
    registry = JSON.parse(bytes.toString('utf8'))
  } catch (error) {
    closureFail(
      `registry_json_invalid:${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    closureFail('registry_not_object')
  }
  if (registry.schemaVersion !== 1) closureFail('schema_version')
  if (registry.kind !== 'a21-closure-registry') closureFail('kind')
  if (registry.source?.path !== source.sourcePath) {
    closureFail('source_path_mismatch')
  }
  if (registry.source?.sha256 !== source.sourceSha256) {
    closureFail('source_hash_mismatch')
  }
  if (registry.candidateId !== candidateId) {
    closureFail('candidate_id_mismatch')
  }
  if (registry.runId !== runId) closureFail('run_id_mismatch')
  const generatedAt = Date.parse(registry.generatedAt ?? '')
  if (Number.isNaN(generatedAt)) closureFail('generated_at_invalid')
  if (generatedAt > now + 5 * 60 * 1000) closureFail('generated_at_future')
  if (now - generatedAt > FRESHNESS_MAX_AGE_MS) closureFail('registry_stale')

  if (!Array.isArray(registry.entries)) closureFail('entries_missing')
  if (registry.entries.length !== EXPECTED_IDS.length)
    closureFail(
      `expected_${EXPECTED_IDS.length}_entries_got_${registry.entries.length}`
    )

  const entries = []
  const seen = new Set()
  for (const entry of registry.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      closureFail('entry_not_object')
    }
    if (!EXPECTED_IDS.includes(entry.id)) closureFail(`unknown_id:${entry.id}`)
    if (seen.has(entry.id)) closureFail(`duplicate_id:${entry.id}`)
    seen.add(entry.id)
    if (!CLOSURE_STATUSES.has(entry.status))
      closureFail(`unsupported_status:${entry.id}`)
    if (typeof entry.task !== 'string' || entry.task.length < 3)
      closureFail(`task_missing:${entry.id}`)
    if (typeof entry.rationale !== 'string' || entry.rationale.length < 3)
      closureFail(`rationale_missing:${entry.id}`)
    const evidence = Array.isArray(entry.evidence) ? entry.evidence : []
    if (entry.status !== 'OPEN_INTERNAL' && evidence.length === 0) {
      closureFail(`evidence_missing:${entry.id}`)
    }
    entries.push({
      id: entry.id,
      status: entry.status,
      task: entry.task,
      rationale: entry.rationale,
      evidence: evidence.map((reference) =>
        readClosureEvidence(root, reference, entry.id)
      )
    })
  }
  const missing = EXPECTED_IDS.filter((id) => !seen.has(id))
  if (missing.length > 0) closureFail(`missing_id:${missing.join(',')}`)

  return {
    path: CLOSURE_REGISTRY_PATH,
    sha256: sha256Bytes(bytes),
    size: bytes.byteLength,
    generatedAt: registry.generatedAt,
    candidateId,
    runId,
    entries
  }
}

function computedFinding(entry, context, closureEntry) {
  const status = closureEntry?.status ?? 'OPEN_INTERNAL'
  const normalizedStatus =
    status === 'CLOSED_LOCAL'
      ? 'CLOSED'
      : status === 'EXTERNAL_BLOCKED'
        ? 'EXTERNAL_BLOCKED'
        : 'OPEN'
  return {
    id: entry.id,
    title: entry.title,
    owner: 'AUD21 control plane',
    status: normalizedStatus,
    riskAccepted: false,
    mitigation:
      closureEntry?.rationale ??
      'Permanece aberto até evidência de fechamento ligada ao mesmo candidato, run e fonte autoritativa.',
    provenance: {
      sourcePath: context.sourcePath,
      sourceSha256: context.sourceSha256,
      sourceLine: entry.sourceLine,
      candidateId: context.candidateId,
      runId: context.runId,
      observedAt: context.observedAt,
      freshness: 'CURRENT'
    },
    priority: entry.priority,
    section: entry.section,
    scope: status === 'EXTERNAL_BLOCKED' ? 'EXTERNAL' : 'INTERNAL',
    ...(closureEntry
      ? {
          closure: {
            status,
            task: closureEntry.task,
            rationale: closureEntry.rationale,
            evidence: closureEntry.evidence
          }
        }
      : {})
  }
}

function groupFindings(allFindings) {
  return {
    P0: allFindings.filter(
      (finding) => finding.priority === 'P0' && finding.status !== 'CLOSED'
    ),
    P1: allFindings.filter(
      (finding) => finding.priority === 'P1' && finding.status !== 'CLOSED'
    ),
    P2: allFindings.filter(
      (finding) => finding.priority === 'P2' && finding.status !== 'CLOSED'
    )
  }
}

function computeScores(allFindings) {
  const byPriority = (priority) =>
    allFindings.filter((item) => item.priority === priority)
  const closureScore = (priority) => {
    const findings = byPriority(priority)
    if (findings.length === 0) return 100
    const closed = findings.filter(
      (finding) => finding.status === 'CLOSED'
    ).length
    return Math.round((closed / findings.length) * 100)
  }
  return {
    p0Closure: closureScore('P0'),
    p1Closure: closureScore('P1'),
    p2Closure: closureScore('P2'),
    p3Closure: closureScore('P3'),
    overallClosure:
      allFindings.length === 0
        ? 100
        : Math.round(
            (allFindings.filter((finding) => finding.status === 'CLOSED')
              .length /
              allFindings.length) *
              100
          )
  }
}

export function computeCurrentFindings({
  root,
  candidateId,
  runId,
  observedAt,
  requireClosureRegistry = false
}) {
  assertCandidateId(candidateId)
  assertRunId(runId)
  const timestamp = observedAt ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(timestamp))) fail('observed_at_invalid')
  const source = loadAuthoritativeSource(root)
  const entries = parseAuthoritativeFindings(source.source)
  const closureRegistry = loadClosureRegistry({
    root,
    source,
    candidateId,
    runId,
    required: requireClosureRegistry
  })
  const closureById = new Map(
    closureRegistry?.entries.map((entry) => [entry.id, entry]) ?? []
  )
  const context = {
    sourcePath: source.sourcePath,
    sourceSha256: source.sourceSha256,
    candidateId,
    runId,
    observedAt: timestamp
  }
  const allFindings = entries.map((entry) =>
    computedFinding(entry, context, closureById.get(entry.id))
  )
  return {
    schemaVersion: 1,
    kind: 'computed-findings',
    source: {
      path: source.sourcePath,
      sha256: source.sourceSha256,
      lines: entries.length
    },
    candidateId,
    runId,
    observedAt: timestamp,
    freshness: 'CURRENT',
    counts: {
      total: allFindings.length,
      P0: allFindings.filter((finding) => finding.priority === 'P0').length,
      P1: allFindings.filter((finding) => finding.priority === 'P1').length,
      P2: allFindings.filter((finding) => finding.priority === 'P2').length,
      P3: allFindings.filter((finding) => finding.priority === 'P3').length
    },
    blockingCounts: {
      P0: allFindings.filter(
        (finding) =>
          finding.priority === 'P0' &&
          finding.status === 'OPEN' &&
          finding.scope === 'INTERNAL'
      ).length,
      P1: allFindings.filter(
        (finding) =>
          finding.priority === 'P1' &&
          finding.status === 'OPEN' &&
          finding.scope === 'INTERNAL'
      ).length,
      external: allFindings.filter(
        (finding) => finding.status === 'EXTERNAL_BLOCKED'
      ).length
    },
    scores: computeScores(allFindings),
    findings: groupFindings(allFindings),
    allFindings,
    closureRegistry: closureRegistry
      ? {
          path: closureRegistry.path,
          sha256: closureRegistry.sha256,
          size: closureRegistry.size,
          generatedAt: closureRegistry.generatedAt,
          candidateId: closureRegistry.candidateId,
          runId: closureRegistry.runId
        }
      : null
  }
}

function comparableSnapshot(snapshot) {
  return {
    schemaVersion: snapshot.schemaVersion,
    kind: snapshot.kind,
    source: snapshot.source,
    candidateId: snapshot.candidateId,
    runId: snapshot.runId,
    freshness: snapshot.freshness,
    counts: snapshot.counts,
    blockingCounts: snapshot.blockingCounts,
    scores: snapshot.scores,
    findings: snapshot.findings,
    allFindings: snapshot.allFindings,
    closureRegistry: snapshot.closureRegistry
  }
}

export function verifyComputedFindings({
  root,
  snapshot,
  candidateId,
  runId,
  requireClosureRegistry = false,
  now = Date.now()
}) {
  const failures = []
  if (!snapshot || typeof snapshot !== 'object') return ['findings_missing']
  if (snapshot.candidateId !== candidateId)
    failures.push('findings_candidate_id_mismatch')
  if (snapshot.runId !== runId) failures.push('findings_run_id_mismatch')
  if (snapshot.freshness !== 'CURRENT') failures.push('findings_stale')
  const observedTime = Date.parse(snapshot.observedAt ?? '')
  if (Number.isNaN(observedTime) || now - observedTime > FRESHNESS_MAX_AGE_MS) {
    failures.push('findings_stale')
  }
  if (observedTime > now + 5 * 60 * 1000)
    failures.push('findings_observed_at_future')

  let expected
  try {
    expected = computeCurrentFindings({
      root,
      candidateId,
      runId,
      observedAt: snapshot.observedAt,
      requireClosureRegistry
    })
  } catch (error) {
    failures.push(error.message)
    return [...new Set(failures)]
  }
  if (snapshot.source?.sha256 !== expected.source.sha256) {
    failures.push('findings_source_hash_mismatch')
  }
  if (
    stableJson(comparableSnapshot(snapshot)) !==
    stableJson(comparableSnapshot(expected))
  ) {
    failures.push('findings_projection_mismatch')
  }
  return [...new Set(failures)]
}

export function findingsProjection(snapshot) {
  return {
    P0: snapshot.findings.P0,
    P1: snapshot.findings.P1,
    P2: snapshot.findings.P2
  }
}

export function findingsScores(snapshot) {
  return snapshot.scores
}
