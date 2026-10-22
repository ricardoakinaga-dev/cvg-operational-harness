// SPEC0253 (RELEASE-CI-0253-20261021): contract of the harness release image
// that .github/workflows/release-image.yml builds from the root Dockerfile,
// scans with a digest-pinned Trivy container, attests and pushes as
// sha-<commit> to the private GHCR package created once by the user.
// Only node: modules and the local runtime image contract are imported.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME_IMAGE_ENTRYPOINT } from './runtime-image-contract.mjs'

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

const MiB = 1024 * 1024
const VERIFY_WORKFLOW = '.github/workflows/verify.yml'
const SECURITY_WORKFLOW = '.github/workflows/security.yml'

export const RELEASE_IMAGE_CONTRACT = 'spec0253-v4'
export const REGISTRY = 'ghcr.io'
export const RELEASE_IMAGE_NAME = 'cvg-operational-harness'
export const GITHUB_ACTIONS_APP_ID = 15368

// Each required context of the live `main` protection, bound to the workflow
// whose push run must own it. The constant and the protection change together.
export const REQUIRED_CHECKS = deepFreeze([
  {
    context: 'REM21 CI bar (Node 22)',
    appId: 15368,
    workflow: VERIFY_WORKFLOW
  },
  { context: 'codeql', appId: 15368, workflow: SECURITY_WORKFLOW },
  { context: 'secret-scan', appId: 15368, workflow: SECURITY_WORKFLOW },
  { context: 'supply-chain', appId: 15368, workflow: SECURITY_WORKFLOW },
  { context: 'image-scan', appId: 15368, workflow: SECURITY_WORKFLOW }
])
export const OWNER_WORKFLOWS = Object.freeze([
  VERIFY_WORKFLOW,
  SECURITY_WORKFLOW
])

export const SHA_PATTERN = /^[0-9a-f]{40}$/
export const HEX64_PATTERN = /^[0-9a-f]{64}$/
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
export const PINNED_REF_PATTERN = /^\S+@sha256:[0-9a-f]{64}$/
export const TAG_PATTERN = /^sha-[0-9a-f]{40}$/
export const PLACEHOLDER_TAG_PATTERN = /^placeholder-\d{8}$/

export const MANIFEST_MEDIA_TYPES = Object.freeze([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json'
])
export const INDEX_MEDIA_TYPES = Object.freeze([
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json'
])
// The tag probe accepts index types too, so an index under sha-S is seen as
// "present" (and then refused) instead of a 404 that would read as "absent".
export const PROBE_ACCEPT = Object.freeze([
  ...MANIFEST_MEDIA_TYPES,
  ...INDEX_MEDIA_TYPES
])

export const PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'
export const SBOM_PREDICATE = 'https://cyclonedx.org/bom'
export const SIGNER_WORKFLOW = '.github/workflows/release-image.yml'
export const SOURCE_REF = 'refs/heads/main'

export const ALLOWED_BUILD_FLAGS = Object.freeze([
  '--pull',
  '--target',
  '--provenance=false',
  '--sbom=false',
  '--label',
  '--tag'
])
export const ALLOWED_BUILD_LABELS = Object.freeze([
  'org.opencontainers.image.source',
  'org.opencontainers.image.revision'
])

export const TRIVY_VERSION = '0.75.0'
export const TRIVY_IMAGE =
  'ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa'
export const TRIVY_DB_REPOSITORY = 'ghcr.io/aquasecurity/trivy-db:2'

export const TAG_ABSENT_CODES = Object.freeze(['MANIFEST_UNKNOWN'])
export const PACKAGE_MISSING_CODES = deepFreeze({
  authToken: ['DENIED'],
  tagsList: ['NAME_UNKNOWN'],
  tagsListStatus: [401, 403, 404]
})

// Exact upload list of the release job, in upload order, with the maximum
// size of each file. The SBOM limit is the actions/attest limit; the SBOM
// bundle carries the SBOM statement base64-encoded.
export const EVIDENCE_FILES = deepFreeze([
  { name: 'build-record.json', maxBytes: 1 * MiB },
  { name: 'release-image.json', maxBytes: 1 * MiB },
  { name: 'sbom.cdx.json', maxBytes: 16 * MiB },
  { name: 'trivy-gate.json', maxBytes: 16 * MiB },
  { name: 'trivy-full.json', maxBytes: 16 * MiB },
  { name: 'trivy-version.json', maxBytes: 64 * 1024 },
  { name: 'provenance.sigstore.json', maxBytes: 1 * MiB },
  { name: 'sbom.sigstore.json', maxBytes: 24 * MiB }
])
export const UPLOAD_EVIDENCE_NAMES = Object.freeze(
  EVIDENCE_FILES.map((entry) => entry.name)
)
export const SCAN_EVIDENCE_NAMES = Object.freeze([
  'sbom.cdx.json',
  'trivy-gate.json',
  'trivy-full.json',
  'trivy-version.json'
])

// The four `gh attestation verify` runs: default predicate (provenance) and
// CycloneDX, each through the GitHub API and with --bundle-from-oci.
export const VERIFICATIONS = deepFreeze([
  {
    name: 'provenance-api',
    key: 'provenanceApi',
    predicateType: PROVENANCE_PREDICATE
  },
  {
    name: 'provenance-oci',
    key: 'provenanceOci',
    predicateType: PROVENANCE_PREDICATE
  },
  { name: 'sbom-api', key: 'sbomApi', predicateType: SBOM_PREDICATE },
  { name: 'sbom-oci', key: 'sbomOci', predicateType: SBOM_PREDICATE }
])
export const VERIFICATION_OUTPUT_MAX = 64 * MiB

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function equalArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0
}

export function parseJson(bytes, label) {
  try {
    return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : bytes)
  } catch {
    throw new Error(`release_json_invalid:${label}`)
  }
}

export function releaseImageRef(repository) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(repository)
  ) {
    throw new Error('release_repository_invalid')
  }
  const lower = repository.toLowerCase()
  if (lower.split('/')[1] !== RELEASE_IMAGE_NAME) {
    throw new Error('release_repository_name')
  }
  return `${REGISTRY}/${lower}`
}

export function assertRealDirectory(directory) {
  let stat
  try {
    stat = fs.lstatSync(directory)
  } catch {
    throw new Error(`release_directory_missing:${path.basename(directory)}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`release_directory_not_real:${path.basename(directory)}`)
  }
}

// lstat (regular file, nlink 1, size), then open with O_NOFOLLOW and confirm
// by fstat that the descriptor is the same inode; never follows a symlink.
export function readRegularFile(file, maxBytes, label = path.basename(file)) {
  let before
  try {
    before = fs.lstatSync(file)
  } catch {
    throw new Error(`release_file_missing:${label}`)
  }
  if (!before.isFile()) throw new Error(`release_file_not_regular:${label}`)
  if (before.nlink !== 1) throw new Error(`release_file_nlink:${label}`)
  if (before.size > maxBytes) throw new Error(`release_file_too_large:${label}`)
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  )
  try {
    const after = fs.fstatSync(fd)
    if (
      !after.isFile() ||
      after.ino !== before.ino ||
      after.dev !== before.dev
    ) {
      throw new Error(`release_file_replaced:${label}`)
    }
    if (after.nlink !== 1) throw new Error(`release_file_nlink:${label}`)
    const chunks = []
    let total = 0
    const chunk = Buffer.alloc(64 * 1024)
    for (;;) {
      const read = fs.readSync(fd, chunk, 0, chunk.length, null)
      if (read === 0) break
      total += read
      if (total > maxBytes) throw new Error(`release_file_too_large:${label}`)
      chunks.push(Buffer.from(chunk.subarray(0, read)))
    }
    return Buffer.concat(chunks, total)
  } finally {
    fs.closeSync(fd)
  }
}

export function evidenceLimit(name) {
  const entry = EVIDENCE_FILES.find((item) => item.name === name)
  if (!entry) throw new Error(`release_evidence_name_not_allowed:${name}`)
  return entry.maxBytes
}

export function readEvidenceFile(directory, name) {
  const maxBytes = evidenceLimit(name)
  assertRealDirectory(directory)
  return readRegularFile(path.join(directory, name), maxBytes, name)
}

export function assertEvidenceInventory(directory, names) {
  assertRealDirectory(directory)
  const actual = fs.readdirSync(directory).sort()
  const expected = [...names].sort()
  if (!equalArray(actual, expected)) {
    throw new Error(
      `release_evidence_inventory:expected=${expected.join('+')}:actual=${actual.join('+')}`
    )
  }
  for (const name of expected) {
    const stat = fs.lstatSync(path.join(directory, name))
    if (!stat.isFile()) throw new Error(`release_file_not_regular:${name}`)
    if (stat.nlink !== 1) throw new Error(`release_file_nlink:${name}`)
    if (stat.size > evidenceLimit(name)) {
      throw new Error(`release_file_too_large:${name}`)
    }
  }
}

// The `# syntax` frontend (line 1) and every distinct FROM image, in order.
export function dockerfileImageRefs(text) {
  const lines = String(text).split('\n')
  const syntax = lines[0]?.match(/^#\s*syntax=(\S+)\s*$/)
  if (!syntax) throw new Error('release_dockerfile_syntax_missing')
  const refs = [syntax[1]]
  for (const line of lines) {
    const from = line.match(
      /^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+\S+)?\s*$/i
    )
    if (from && !refs.includes(from[1])) refs.push(from[1])
  }
  return refs
}

export function summarizeSbom(sbom) {
  const properties = sbom?.metadata?.component?.properties
  const imageIds = Array.isArray(properties)
    ? properties
        .filter((property) => property?.name === 'aquasecurity:trivy:ImageID')
        .map((property) => property.value)
    : []
  const components = Array.isArray(sbom?.components) ? sbom.components : []
  const purls = components
    .map((component) => component?.purl)
    .filter((purl) => typeof purl === 'string')
  let vulnerabilities = 0
  if (sbom?.vulnerabilities !== undefined) {
    vulnerabilities = Array.isArray(sbom.vulnerabilities)
      ? sbom.vulnerabilities.length
      : -1
  }
  return {
    bomFormat: sbom?.bomFormat ?? null,
    specVersion: sbom?.specVersion ?? null,
    imageId: imageIds.length === 1 ? imageIds[0] : null,
    components: components.length,
    deb: purls.filter((purl) => purl.startsWith('pkg:deb/')).length,
    npm: purls.filter((purl) => purl.startsWith('pkg:npm/')).length,
    nodeBinary: components.some(
      (component) =>
        component?.name === 'node' &&
        !String(component?.purl ?? '').startsWith('pkg:npm/')
    ),
    vulnerabilities
  }
}

export function highCriticalVulnerabilities(report, { fixedOnly }) {
  if (!Array.isArray(report?.Results)) {
    throw new Error('release_trivy_report_invalid')
  }
  const found = []
  for (const result of report.Results) {
    const list = Array.isArray(result?.Vulnerabilities)
      ? result.Vulnerabilities
      : []
    for (const vulnerability of list) {
      if (!['HIGH', 'CRITICAL'].includes(vulnerability?.Severity)) continue
      const fixed = nonEmptyString(vulnerability.FixedVersion)
      if (fixedOnly && !fixed) continue
      found.push({
        id: vulnerability.VulnerabilityID ?? null,
        pkg: vulnerability.PkgName ?? null,
        severity: vulnerability.Severity,
        installed: vulnerability.InstalledVersion ?? null,
        fixed: fixed ? vulnerability.FixedVersion : null
      })
    }
  }
  return found
}

export function decodeBundleStatement(bundle) {
  if (
    !isObject(bundle) ||
    typeof bundle.mediaType !== 'string' ||
    !bundle.mediaType.startsWith('application/vnd.dev.sigstore.bundle')
  ) {
    throw new Error('release_bundle_media_type')
  }
  const envelope = bundle.dsseEnvelope
  if (
    envelope?.payloadType !== 'application/vnd.in-toto+json' ||
    typeof envelope.payload !== 'string' ||
    !Array.isArray(envelope.signatures) ||
    envelope.signatures.length === 0
  ) {
    throw new Error('release_bundle_envelope')
  }
  return parseJson(Buffer.from(envelope.payload, 'base64'), 'bundle_payload')
}

// Anonymous registry token request: DENIED (401/403 without token), TOKEN
// (public package) or ERROR (anything else, including timeouts).
export function anonymousPullState(answer) {
  if (!isObject(answer) || answer.curlExit !== 0) return 'ERROR'
  if (answer.status === 200 && answer.tokenIssued === true) return 'TOKEN'
  if ([401, 403].includes(answer.status) && answer.tokenIssued === false) {
    return 'DENIED'
  }
  return 'ERROR'
}

export function summarizeVerification({
  exitCode,
  output,
  digest,
  predicateType
}) {
  const reasons = []
  if (exitCode !== 0) reasons.push(`exit_${exitCode}`)
  if (!Array.isArray(output) || output.length === 0)
    reasons.push('output_empty')
  const hex = DIGEST_PATTERN.test(digest ?? '') ? digest.slice(7) : null
  if (!hex) reasons.push('digest_invalid')
  const statements = []
  for (const entry of Array.isArray(output) ? output : []) {
    const statement = entry?.verificationResult?.statement
    if (statement?.predicateType !== predicateType) {
      reasons.push('predicate_type')
    }
    const subjects = Array.isArray(statement?.subject) ? statement.subject : []
    if (
      !hex ||
      subjects.length === 0 ||
      !subjects.every((subject) => subject?.digest?.sha256 === hex)
    ) {
      reasons.push('subject_digest')
    }
    statements.push(statement)
  }
  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    count: Array.isArray(output) ? output.length : 0,
    statements
  }
}

export function registryManifestFailures(bytes, digest, configDigest) {
  const failures = []
  if (!DIGEST_PATTERN.test(digest ?? '')) failures.push('digest_invalid')
  if (`sha256:${sha256Hex(bytes)}` !== digest) failures.push('manifest_sha256')
  let manifest
  try {
    manifest = JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch {
    failures.push('manifest_json')
    return failures
  }
  if (!MANIFEST_MEDIA_TYPES.includes(manifest?.mediaType)) {
    failures.push('manifest_media_type')
  }
  if (manifest?.schemaVersion !== 2) failures.push('manifest_schema_version')
  if (manifest?.manifests !== undefined) failures.push('manifest_is_index')
  if (
    !DIGEST_PATTERN.test(configDigest ?? '') ||
    manifest?.config?.digest !== configDigest
  ) {
    failures.push('manifest_config_digest')
  }
  return failures
}

function checkKey(context, appId) {
  return JSON.stringify([context, appId])
}

const REQUIRED_KEYS = REQUIRED_CHECKS.map((check) =>
  checkKey(check.context, check.appId)
).sort()

export function sameRequiredChecks(pairs) {
  return equalArray(
    pairs.map(([context, appId]) => checkKey(context, appId)).sort(),
    REQUIRED_KEYS
  )
}

export function gateRecordFailures(gate, expected) {
  if (!isObject(gate)) return ['gate_not_object']
  const failures = []
  if (gate.decision !== 'publish') failures.push('gate_decision')
  if (!SHA_PATTERN.test(gate.sha ?? '') || gate.sha !== expected.commitSha) {
    failures.push('gate_sha')
  }
  if (
    !Array.isArray(gate.protection) ||
    !sameRequiredChecks(
      gate.protection.map((check) => [check?.context, check?.app_id])
    )
  ) {
    failures.push('gate_protection')
  }
  const pr = gate.pr
  if (
    !Number.isSafeInteger(pr?.number) ||
    pr.number <= 0 ||
    pr.mergeCommitSha !== expected.commitSha ||
    !SHA_PATTERN.test(pr.headSha ?? '')
  ) {
    failures.push('gate_pr')
  }
  for (const scope of ['main', 'pr']) {
    const headSha = scope === 'main' ? expected.commitSha : pr?.headSha
    const event = scope === 'main' ? 'push' : 'pull_request'
    const runs = gate.runs?.[scope]
    for (const workflow of OWNER_WORKFLOWS) {
      const owned = Array.isArray(runs)
        ? runs.filter((run) => run?.workflow === workflow)
        : []
      if (
        owned.length !== 1 ||
        owned[0].conclusion !== 'success' ||
        owned[0].headSha !== headSha ||
        owned[0].event !== event ||
        !Number.isSafeInteger(owned[0].checkSuiteId)
      ) {
        failures.push(`gate_run_${scope}:${workflow}`)
      }
    }
    const checks = gate.checks?.[scope]
    if (
      !Array.isArray(checks) ||
      !sameRequiredChecks(checks.map((check) => [check?.context, check?.appId]))
    ) {
      failures.push(`gate_checks_${scope}`)
      continue
    }
    for (const check of checks) {
      const required = REQUIRED_CHECKS.find((r) => r.context === check.context)
      const run = Array.isArray(runs)
        ? runs.find((item) => item?.workflow === required.workflow)
        : undefined
      if (check.status !== 'completed' || check.conclusion !== 'success') {
        failures.push(`gate_check_not_success_${scope}:${check.context}`)
      }
      if (
        check.workflow !== required.workflow ||
        !Number.isSafeInteger(check.checkRunId) ||
        check.checkSuiteId !== run?.checkSuiteId
      ) {
        failures.push(`gate_check_owner_${scope}:${check.context}`)
      }
    }
  }
  return failures
}

function buildRecordFailures(record, expected) {
  if (!isObject(record)) return ['record_not_object']
  const failures = []
  const anchors = expected.anchors ?? {}
  if (record.schemaVersion !== 1) failures.push('schema_version')
  if (record.kind !== 'cvg-release-build-record') failures.push('kind')
  if (record.contract !== RELEASE_IMAGE_CONTRACT) failures.push('contract')
  if (
    !SHA_PATTERN.test(record.commitSha ?? '') ||
    record.commitSha !== expected.commitSha
  ) {
    failures.push('commit_sha')
  }
  if (record.repository !== expected.repository) failures.push('repository')
  if (
    !HEX64_PATTERN.test(record.tarballSha256 ?? '') ||
    record.tarballSha256 !== anchors.tarballSha256
  ) {
    failures.push('tarball_anchor')
  }
  if (
    !DIGEST_PATTERN.test(record.configDigest ?? '') ||
    record.configDigest !== anchors.configDigest
  ) {
    failures.push('config_anchor')
  }
  // O3: user, CMD and labels come from the anchored tarball config blob.
  const config = isObject(expected.config?.config) ? expected.config.config : {}
  if (record.configUser !== 'cvg' || config.User !== 'cvg') {
    failures.push('config_user')
  }
  if (
    !equalArray(record.cmd, RUNTIME_IMAGE_ENTRYPOINT) ||
    !equalArray(config.Cmd, RUNTIME_IMAGE_ENTRYPOINT)
  ) {
    failures.push('cmd')
  }
  const labels = isObject(config.Labels) ? config.Labels : {}
  if (
    record.labels?.revision !== expected.commitSha ||
    labels['org.opencontainers.image.revision'] !== expected.commitSha
  ) {
    failures.push('label_revision')
  }
  const source = `https://github.com/${expected.repository}`
  if (
    record.labels?.source !== source ||
    labels['org.opencontainers.image.source'] !== source
  ) {
    failures.push('label_source')
  }
  if (
    !Array.isArray(record.diffIds) ||
    record.diffIds.length === 0 ||
    !equalArray(record.diffIds, expected.config?.rootfs?.diff_ids)
  ) {
    failures.push('diff_ids')
  }
  let refs = null
  try {
    refs = dockerfileImageRefs(expected.dockerfile ?? '')
  } catch {
    refs = null
  }
  if (
    !refs ||
    refs.length < 2 ||
    !refs.every((ref) => PINNED_REF_PATTERN.test(ref)) ||
    !equalArray(record.baseImageRefs, refs)
  ) {
    failures.push('base_image_refs')
  }
  if (record.trivyImage !== TRIVY_IMAGE) failures.push('trivy_image')
  if (
    record.trivyVersion !== TRIVY_VERSION ||
    expected.trivyVersion?.Version !== TRIVY_VERSION
  ) {
    failures.push('trivy_version')
  }
  const db = expected.trivyVersion?.VulnerabilityDB
  if (
    !nonEmptyString(db?.UpdatedAt) ||
    !nonEmptyString(db?.DownloadedAt) ||
    record.trivyDb?.UpdatedAt !== db.UpdatedAt ||
    record.trivyDb?.DownloadedAt !== db.DownloadedAt
  ) {
    failures.push('trivy_db')
  }
  const sbomBytes = Buffer.isBuffer(expected.sbomBytes)
    ? expected.sbomBytes
    : Buffer.alloc(0)
  let sbom = null
  try {
    sbom = JSON.parse(sbomBytes.toString('utf8'))
  } catch {
    sbom = null
  }
  const summary = sbom ? summarizeSbom(sbom) : null
  if (!summary || summary.bomFormat !== 'CycloneDX') {
    failures.push('sbom_format')
  } else {
    if (
      summary.imageId !== anchors.configDigest ||
      record.sbom?.imageId !== anchors.configDigest
    ) {
      failures.push('sbom_image_id')
    }
    if (summary.deb < 1) failures.push('sbom_deb')
    if (summary.npm < 1) failures.push('sbom_npm')
    if (summary.vulnerabilities !== 0) failures.push('sbom_vulnerabilities')
  }
  if (record.sbom?.sha256 !== sha256Hex(sbomBytes)) failures.push('sbom_sha256')
  for (const [label, report] of [
    ['gate_report', expected.gateReport],
    ['full_report', expected.fullReport]
  ]) {
    if (report?.Metadata?.ImageID !== anchors.configDigest) {
      failures.push(`${label}_image_id`)
    }
  }
  try {
    const fixed = highCriticalVulnerabilities(expected.gateReport, {
      fixedOnly: true
    })
    if (fixed.length > 0 || record.gateReport?.fixedHighCritical !== 0) {
      failures.push('gate_report_fixed_high_critical')
    }
  } catch {
    failures.push('gate_report_invalid')
  }
  return failures
}

export function validateBuildRecord(record, expected) {
  const failures = buildRecordFailures(record, expected)
  if (failures.length > 0) {
    throw new Error(`release_build_record_invalid:${failures.join(',')}`)
  }
  return { pass: true }
}

function attestationFailures(record, key, predicateType, bundleBytes, ctx) {
  const failures = []
  const attestation = record.attestations?.[key]
  if (!isObject(attestation)) return [`attestation_${key}_missing`]
  if (attestation.predicateType !== predicateType) {
    failures.push(`attestation_${key}_predicate_type`)
  }
  if (attestation.bundle !== `${key}.sigstore.json`) {
    failures.push(`attestation_${key}_bundle_name`)
  }
  if (
    !Buffer.isBuffer(bundleBytes) ||
    attestation.bundleSha256 !== sha256Hex(bundleBytes)
  ) {
    failures.push(`attestation_${key}_bundle_sha256`)
    return failures
  }
  let statement
  try {
    statement = decodeBundleStatement(parseJson(bundleBytes, key))
  } catch {
    failures.push(`attestation_${key}_bundle_invalid`)
    return failures
  }
  if (statement?.predicateType !== predicateType) {
    failures.push(`attestation_${key}_statement_predicate_type`)
  }
  const subjects = Array.isArray(statement?.subject) ? statement.subject : []
  if (
    subjects.length === 0 ||
    !subjects.every(
      (subject) =>
        subject?.name === ctx.image &&
        `sha256:${subject?.digest?.sha256}` === ctx.digest
    )
  ) {
    failures.push(`attestation_${key}_subject`)
  }
  if (
    key === 'sbom' &&
    canonicalJson(statement?.predicate) !== canonicalJson(ctx.sbom)
  ) {
    failures.push('attestation_sbom_predicate_differs')
  }
  return failures
}

export function validateReleaseImageRecord(record, expected) {
  const failures = []
  if (!isObject(record)) {
    throw new Error('release_publish_record_invalid:record_not_object')
  }
  if (record.schemaVersion !== 1) failures.push('schema_version')
  if (record.kind !== 'cvg-release-image') failures.push('kind')
  if (record.contract !== RELEASE_IMAGE_CONTRACT) failures.push('contract')
  failures.push(
    ...buildRecordFailures(record.build, expected).map(
      (item) => `build.${item}`
    )
  )
  let image = null
  try {
    image = releaseImageRef(expected.repository)
  } catch {
    image = null
  }
  if (!image || record.image !== image) failures.push('image_ref')
  if (
    !TAG_PATTERN.test(record.tag ?? '') ||
    record.tag !== `sha-${expected.commitSha}`
  ) {
    failures.push('tag')
  }
  if (
    !DIGEST_PATTERN.test(record.digest ?? '') ||
    record.digest !== expected.digest
  ) {
    failures.push('digest')
  }
  const manifestBytes = Buffer.isBuffer(expected.manifestBytes)
    ? expected.manifestBytes
    : Buffer.alloc(0)
  for (const failure of registryManifestFailures(
    manifestBytes,
    expected.digest,
    expected.anchors?.configDigest
  )) {
    failures.push(failure)
  }
  if (record.manifestSha256 !== sha256Hex(manifestBytes)) {
    failures.push('manifest_sha256_record')
  }
  let manifest = null
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    manifest = null
  }
  if (
    !MANIFEST_MEDIA_TYPES.includes(record.manifestMediaType) ||
    record.manifestMediaType !== manifest?.mediaType
  ) {
    failures.push('manifest_media_type_record')
  }
  if (
    record.manifestConfigDigest !== expected.anchors?.configDigest ||
    manifest?.config?.digest !== record.manifestConfigDigest
  ) {
    failures.push('manifest_config_digest_record')
  }
  let sbom = null
  try {
    sbom = parseJson(expected.sbomBytes, 'sbom')
  } catch {
    sbom = null
  }
  const ctx = { image, digest: expected.digest, sbom }
  failures.push(
    ...attestationFailures(
      record,
      'provenance',
      PROVENANCE_PREDICATE,
      expected.bundles?.provenance,
      ctx
    ),
    ...attestationFailures(
      record,
      'sbom',
      SBOM_PREDICATE,
      expected.bundles?.sbom,
      ctx
    )
  )
  failures.push(
    ...gateRecordFailures(record.gate, { commitSha: expected.commitSha })
  )
  if (canonicalJson(record.gate) !== canonicalJson(expected.gateRecord)) {
    failures.push('gate_not_from_gate_job')
  }
  if (failures.length > 0) {
    throw new Error(`release_publish_record_invalid:${failures.join(',')}`)
  }
  return { pass: true }
}

export function validateReleaseVerification(record, expected) {
  const failures = []
  if (!isObject(record)) {
    throw new Error('release_verification_invalid:record_not_object')
  }
  if (record.schemaVersion !== 1) failures.push('schema_version')
  if (record.kind !== 'cvg-release-verification') failures.push('kind')
  if (record.contract !== RELEASE_IMAGE_CONTRACT) failures.push('contract')
  if (
    !SHA_PATTERN.test(record.commitSha ?? '') ||
    record.commitSha !== expected.commitSha
  ) {
    failures.push('commit_sha')
  }
  if (
    !DIGEST_PATTERN.test(record.digest ?? '') ||
    record.digest !== expected.digest
  ) {
    failures.push('digest')
  }
  let image = null
  try {
    image = releaseImageRef(expected.repository)
  } catch {
    image = null
  }
  if (!image || record.image !== image) failures.push('image_ref')
  const sbomCanonical = canonicalJson(expected.sbom)
  for (const verification of VERIFICATIONS) {
    const summary = summarizeVerification({
      ...expected.verifications?.[verification.key],
      digest: expected.digest,
      predicateType: verification.predicateType
    })
    if (!summary.ok) {
      failures.push(`${verification.key}:${summary.reasons.join('+')}`)
    }
    if (
      record.verifications?.[verification.key]?.ok !== true ||
      record.verifications[verification.key].count !== summary.count
    ) {
      failures.push(`${verification.key}_record`)
    }
    if (
      verification.predicateType === SBOM_PREDICATE &&
      !summary.statements.every(
        (statement) => canonicalJson(statement?.predicate) === sbomCanonical
      )
    ) {
      failures.push(`${verification.key}_sbom_differs`)
    }
  }
  if (record.sbomMatchesArtifact !== true)
    failures.push('sbom_matches_artifact')
  if (
    anonymousPullState(expected.anonymousPull) !== 'DENIED' ||
    record.anonymousPull !== 'DENIED'
  ) {
    failures.push('anonymous_pull')
  }
  if (failures.length > 0) {
    throw new Error(`release_verification_invalid:${failures.join(',')}`)
  }
  return { pass: true }
}
