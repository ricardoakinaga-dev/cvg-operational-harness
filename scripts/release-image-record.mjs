#!/usr/bin/env node
// SPEC0253 §3.3–§3.5 (RELEASE-CI-0253-20261021): records of the release job.
//
//   anchors       the only writer of tarball_sha256/config_digest
//                 ($GITHUB_OUTPUT), read from the saved tarball by `tar -xOf`
//   build         build-record.json from evidence/ (read only through
//                 readEvidenceFile) and the anchored tarball config (O3)
//   trivy-summary fixed HIGH/CRITICAL IDs of trivy-gate.json (O10)
//   manifest      raw registry manifest: SHA-256 = digest, single image
//                 manifest, config.digest = anchor (step 17)
//   publish       copies the attest bundles and writes release-image.json
//   verify        release-verification.json of the release-verify job
//
// build, publish and verify only compare against the anchors received by
// env and never write $GITHUB_OUTPUT. Only node: modules and the local
// release contract are imported.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  DIGEST_PATTERN,
  HEX64_PATTERN,
  PROVENANCE_PREDICATE,
  RELEASE_IMAGE_CONTRACT,
  SBOM_PREDICATE,
  SCAN_EVIDENCE_NAMES,
  SHA_PATTERN,
  TRIVY_IMAGE,
  UPLOAD_EVIDENCE_NAMES,
  VERIFICATIONS,
  VERIFICATION_OUTPUT_MAX,
  anonymousPullState,
  assertEvidenceInventory,
  canonicalJson,
  dockerfileImageRefs,
  evidenceLimit,
  highCriticalVulnerabilities,
  parseJson,
  readEvidenceFile,
  readRegularFile,
  registryManifestFailures,
  releaseImageRef,
  sha256Hex,
  summarizeSbom,
  summarizeVerification,
  validateBuildRecord,
  validateReleaseImageRecord,
  validateReleaseVerification
} from './release-image-contract.mjs'

const MiB = 1024 * 1024
// Room in release-image.json for everything besides the embedded build
// record (gate record, attestations, manifest fields).
const RELEASE_RECORD_MARGIN = 128 * 1024

function hashFile(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile()) throw new Error('release_tarball_not_regular')
  const hash = createHash('sha256')
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW)
  try {
    const buffer = Buffer.alloc(MiB)
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (read === 0) break
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    fs.closeSync(fd)
  }
  return hash.digest('hex')
}

function tarMember(tarball, member, maxBytes) {
  const run = spawnSync('tar', ['-xOf', tarball, '--', member], {
    maxBuffer: maxBytes
  })
  if (run.error || run.status !== 0) {
    throw new Error(`release_tarball_member:${member}`)
  }
  return run.stdout
}

// manifest.json with exactly one entry, Config at blobs/sha256/<hex> and the
// blob hashing to <hex>; independent of the daemon image store.
export function readTarballAnchors(tarball) {
  const tarballSha256 = hashFile(tarball)
  const entries = parseJson(
    tarMember(tarball, 'manifest.json', 4 * MiB),
    'manifest.json'
  )
  if (!Array.isArray(entries) || entries.length !== 1) {
    throw new Error('release_tarball_manifest_entries')
  }
  const match =
    typeof entries[0]?.Config === 'string' &&
    entries[0].Config.match(/^blobs\/sha256\/([0-9a-f]{64})$/)
  if (!match) throw new Error('release_tarball_config_path')
  const configBytes = tarMember(tarball, entries[0].Config, 4 * MiB)
  if (sha256Hex(configBytes) !== match[1]) {
    throw new Error('release_tarball_config_hash')
  }
  return {
    tarballSha256,
    configDigest: `sha256:${match[1]}`,
    config: parseJson(configBytes, 'config')
  }
}

function flag(args, name, fallback) {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`release_record_argument_missing:${name}`)
}

function anchorsFromEnv() {
  const tarballSha256 = process.env.ANCHOR_TARBALL_SHA256
  const configDigest = process.env.ANCHOR_CONFIG_DIGEST
  if (!HEX64_PATTERN.test(tarballSha256 ?? '')) {
    throw new Error('release_anchor_tarball_missing')
  }
  if (!DIGEST_PATTERN.test(configDigest ?? '')) {
    throw new Error('release_anchor_config_missing')
  }
  return { tarballSha256, configDigest }
}

function confirmAnchors(tarball, anchors) {
  const actual = readTarballAnchors(tarball)
  if (actual.tarballSha256 !== anchors.tarballSha256) {
    throw new Error('release_anchor_tarball_mismatch')
  }
  if (actual.configDigest !== anchors.configDigest) {
    throw new Error('release_anchor_config_mismatch')
  }
  return actual
}

function writeNewFile(file, data) {
  fs.writeFileSync(file, data, { flag: 'wx', mode: 0o644 })
}

function commonInputs(args) {
  const sha = flag(args, '--sha')
  if (!SHA_PATTERN.test(sha)) throw new Error('release_record_sha_invalid')
  const repository = flag(args, '--repository')
  releaseImageRef(repository)
  return { sha, repository }
}

function readScanEvidence(evidence, dockerfilePath) {
  const sbomBytes = readEvidenceFile(evidence, 'sbom.cdx.json')
  return {
    sbomBytes,
    gateReport: parseJson(
      readEvidenceFile(evidence, 'trivy-gate.json'),
      'trivy-gate.json'
    ),
    fullReport: parseJson(
      readEvidenceFile(evidence, 'trivy-full.json'),
      'trivy-full.json'
    ),
    trivyVersion: parseJson(
      readEvidenceFile(evidence, 'trivy-version.json'),
      'trivy-version.json'
    ),
    dockerfile: readRegularFile(dockerfilePath, MiB, 'Dockerfile').toString(
      'utf8'
    )
  }
}

function makeBuildRecord({ sha, repository, anchors, config, scan }) {
  const imageConfig = config?.config ?? {}
  const labels = imageConfig.Labels ?? {}
  let baseImageRefs = []
  try {
    baseImageRefs = dockerfileImageRefs(scan.dockerfile)
  } catch {
    baseImageRefs = []
  }
  const sbom = parseJson(scan.sbomBytes, 'sbom.cdx.json')
  const { imageId, ...sbomSummary } = summarizeSbom(sbom)
  let fixed = null
  let full = []
  try {
    fixed = highCriticalVulnerabilities(scan.gateReport, { fixedOnly: true })
    full = highCriticalVulnerabilities(scan.fullReport, { fixedOnly: false })
  } catch {
    fixed = null
  }
  const db = scan.trivyVersion?.VulnerabilityDB ?? {}
  return {
    schemaVersion: 1,
    kind: 'cvg-release-build-record',
    contract: RELEASE_IMAGE_CONTRACT,
    commitSha: sha,
    repository,
    localTag: `cvg-operational-harness:release-${sha}`,
    tarballSha256: anchors.tarballSha256,
    configDigest: anchors.configDigest,
    configUser: imageConfig.User ?? '',
    cmd: imageConfig.Cmd ?? [],
    labels: {
      source: labels['org.opencontainers.image.source'] ?? null,
      revision: labels['org.opencontainers.image.revision'] ?? null
    },
    diffIds: config?.rootfs?.diff_ids ?? [],
    baseImageRefs,
    trivyImage: TRIVY_IMAGE,
    trivyVersion: scan.trivyVersion?.Version ?? null,
    trivyDb: {
      Version: db.Version ?? null,
      UpdatedAt: db.UpdatedAt ?? null,
      DownloadedAt: db.DownloadedAt ?? null,
      NextUpdate: db.NextUpdate ?? null
    },
    sbom: {
      file: 'sbom.cdx.json',
      sha256: sha256Hex(scan.sbomBytes),
      imageId,
      ...sbomSummary
    },
    gateReport: {
      file: 'trivy-gate.json',
      fixedHighCritical: fixed === null ? null : fixed.length
    },
    fullReport: {
      file: 'trivy-full.json',
      highCritical: full.length,
      withFix: full.filter((item) => item.fixed).length,
      findings: full
    }
  }
}

function buildExpected({ sha, repository, anchors, config, scan }) {
  return {
    commitSha: sha,
    repository,
    anchors,
    config,
    dockerfile: scan.dockerfile,
    sbomBytes: scan.sbomBytes,
    gateReport: scan.gateReport,
    fullReport: scan.fullReport,
    trivyVersion: scan.trivyVersion
  }
}

function anchorsCommand(args) {
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error('release_anchors_github_output_missing')
  const anchors = readTarballAnchors(flag(args, '--tarball'))
  fs.appendFileSync(
    output,
    `tarball_sha256=${anchors.tarballSha256}\nconfig_digest=${anchors.configDigest}\n`
  )
  process.stdout.write(
    `${JSON.stringify({ tarballSha256: anchors.tarballSha256, configDigest: anchors.configDigest })}\n`
  )
}

function buildCommand(args) {
  const { sha, repository } = commonInputs(args)
  const tarball = flag(args, '--tarball')
  const evidence = flag(args, '--evidence')
  const anchors = anchorsFromEnv()
  const { config } = confirmAnchors(tarball, anchors)
  assertEvidenceInventory(evidence, SCAN_EVIDENCE_NAMES)
  const scan = readScanEvidence(
    evidence,
    flag(args, '--dockerfile', 'Dockerfile')
  )
  const inputs = { sha, repository, anchors, config, scan }
  const record = makeBuildRecord(inputs)
  validateBuildRecord(record, buildExpected(inputs))
  const text = `${JSON.stringify(record, null, 2)}\n`
  // O4: release-image.json embeds this record; refuse here, before any login
  // or push, if it would not fit the release-image.json limit with margin.
  if (
    Buffer.byteLength(text) >
    evidenceLimit('release-image.json') - RELEASE_RECORD_MARGIN
  ) {
    throw new Error('release_build_record_too_large')
  }
  writeNewFile(path.join(evidence, 'build-record.json'), text)
  readEvidenceFile(evidence, 'build-record.json')
  process.stdout.write(
    `${JSON.stringify({ commitSha: sha, configDigest: anchors.configDigest, sbom: record.sbom })}\n`
  )
}

function trivySummaryCommand(args) {
  const evidence = flag(args, '--evidence')
  let lines
  try {
    const report = parseJson(
      readEvidenceFile(evidence, 'trivy-gate.json'),
      'trivy-gate.json'
    )
    const fixed = highCriticalVulnerabilities(report, { fixedOnly: true })
    lines = [
      `### Trivy gate: ${fixed.length} HIGH/CRITICAL com correção publicada`,
      '',
      ...fixed.map(
        (item) =>
          `- ${item.severity} ${item.id} em ${item.pkg} ${item.installed ?? ''} (corrigido em ${item.fixed})`
      )
    ]
  } catch (error) {
    lines = [
      '### Trivy gate falhou',
      '',
      `- trivy-gate.json ilegível: ${error instanceof Error ? error.message : String(error)}`
    ]
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

function manifestCommand(args) {
  const bytes = readRegularFile(flag(args, '--manifest'), 4 * MiB, 'manifest')
  const digest = flag(args, '--digest')
  const configDigest = process.env.ANCHOR_CONFIG_DIGEST
  const failures = registryManifestFailures(bytes, digest, configDigest)
  if (failures.length > 0) {
    throw new Error(`release_registry_manifest_invalid:${failures.join(',')}`)
  }
  process.stdout.write(
    `${JSON.stringify({ digest, mediaType: JSON.parse(bytes.toString('utf8')).mediaType, configDigest })}\n`
  )
}

function copyBundle(source, evidence, name) {
  const bytes = readRegularFile(source, evidenceLimit(name), name)
  parseJson(bytes, name)
  writeNewFile(path.join(evidence, name), bytes)
  return readEvidenceFile(evidence, name)
}

function publishCommand(args) {
  const { sha, repository } = commonInputs(args)
  const tarball = flag(args, '--tarball')
  const evidence = flag(args, '--evidence')
  const digest = flag(args, '--digest')
  if (!DIGEST_PATTERN.test(digest)) throw new Error('release_digest_invalid')
  const anchors = anchorsFromEnv()
  const { config } = confirmAnchors(tarball, anchors)
  if (!process.env.GATE_RECORD) throw new Error('release_gate_record_missing')
  const gateRecord = parseJson(process.env.GATE_RECORD, 'GATE_RECORD')
  assertEvidenceInventory(evidence, [
    ...SCAN_EVIDENCE_NAMES,
    'build-record.json'
  ])
  const build = parseJson(
    readEvidenceFile(evidence, 'build-record.json'),
    'build-record.json'
  )
  const scan = readScanEvidence(
    evidence,
    flag(args, '--dockerfile', 'Dockerfile')
  )
  const manifestBytes = readRegularFile(
    flag(args, '--manifest'),
    4 * MiB,
    'manifest'
  )
  const manifest = parseJson(manifestBytes, 'manifest')
  const provenance = copyBundle(
    flag(args, '--provenance-bundle'),
    evidence,
    'provenance.sigstore.json'
  )
  const sbomBundle = copyBundle(
    flag(args, '--sbom-bundle'),
    evidence,
    'sbom.sigstore.json'
  )
  const image = releaseImageRef(repository)
  const record = {
    schemaVersion: 1,
    kind: 'cvg-release-image',
    contract: RELEASE_IMAGE_CONTRACT,
    generatedAt: new Date().toISOString(),
    image,
    tag: `sha-${sha}`,
    digest,
    manifestSha256: sha256Hex(manifestBytes),
    manifestMediaType: manifest?.mediaType ?? null,
    manifestConfigDigest: manifest?.config?.digest ?? null,
    build,
    attestations: {
      provenance: {
        predicateType: PROVENANCE_PREDICATE,
        bundle: 'provenance.sigstore.json',
        bundleSha256: sha256Hex(provenance)
      },
      sbom: {
        predicateType: SBOM_PREDICATE,
        bundle: 'sbom.sigstore.json',
        bundleSha256: sha256Hex(sbomBundle)
      }
    },
    gate: gateRecord,
    deploy: {
      CVG_HARNESS_IMAGE_REPOSITORY: image,
      CVG_HARNESS_IMAGE_DIGEST: digest
    }
  }
  validateReleaseImageRecord(record, {
    ...buildExpected({ sha, repository, anchors, config, scan }),
    digest,
    manifestBytes,
    gateRecord,
    bundles: { provenance, sbom: sbomBundle }
  })
  writeNewFile(
    path.join(evidence, 'release-image.json'),
    `${JSON.stringify(record, null, 2)}\n`
  )
  assertEvidenceInventory(evidence, UPLOAD_EVIDENCE_NAMES)
  for (const name of UPLOAD_EVIDENCE_NAMES) readEvidenceFile(evidence, name)
  process.stdout.write(
    `${JSON.stringify({ image, tag: record.tag, digest })}\n`
  )
}

function readVerification(checks, name) {
  const exitText = readRegularFile(
    path.join(checks, `${name}.exit`),
    64,
    `${name}.exit`
  )
    .toString('utf8')
    .trim()
  let output = null
  const bytes = readRegularFile(
    path.join(checks, `${name}.json`),
    VERIFICATION_OUTPUT_MAX,
    `${name}.json`
  )
  try {
    output = JSON.parse(bytes.toString('utf8'))
  } catch {
    output = null
  }
  return {
    exitCode: /^\d+$/.test(exitText) ? Number(exitText) : undefined,
    output
  }
}

function verifyCommand(args) {
  const { sha, repository } = commonInputs(args)
  const artifact = flag(args, '--artifact')
  const checks = flag(args, '--checks')
  const out = flag(args, '--out')
  const digest = flag(args, '--digest')
  if (!DIGEST_PATTERN.test(digest)) throw new Error('release_digest_invalid')
  assertEvidenceInventory(artifact, UPLOAD_EVIDENCE_NAMES)
  const release = parseJson(
    readEvidenceFile(artifact, 'release-image.json'),
    'release-image.json'
  )
  const sbomBytes = readEvidenceFile(artifact, 'sbom.cdx.json')
  const sbom = parseJson(sbomBytes, 'sbom.cdx.json')
  if (release.digest !== digest) throw new Error('release_verify_digest')
  if (release.tag !== `sha-${sha}`) throw new Error('release_verify_tag')
  if (release.build?.sbom?.sha256 !== sha256Hex(sbomBytes)) {
    throw new Error('release_verify_sbom_sha256')
  }
  const verifications = {}
  const summaries = {}
  for (const verification of VERIFICATIONS) {
    verifications[verification.key] = readVerification(
      checks,
      verification.name
    )
    const summary = summarizeVerification({
      ...verifications[verification.key],
      digest,
      predicateType: verification.predicateType
    })
    summaries[verification.key] = {
      ok: summary.ok,
      reasons: summary.reasons,
      count: summary.count,
      predicateType: verification.predicateType,
      source: verification.name.endsWith('-oci') ? 'oci' : 'api',
      statements: summary.statements
    }
  }
  const anonymous = parseJson(
    readRegularFile(
      path.join(checks, 'anonymous-pull.json'),
      64 * 1024,
      'anonymous-pull.json'
    ),
    'anonymous-pull.json'
  )
  const sbomCanonical = canonicalJson(sbom)
  const sbomMatchesArtifact = ['sbomApi', 'sbomOci'].every(
    (key) =>
      summaries[key].count > 0 &&
      summaries[key].statements.every(
        (statement) => canonicalJson(statement?.predicate) === sbomCanonical
      )
  )
  const record = {
    schemaVersion: 1,
    kind: 'cvg-release-verification',
    contract: RELEASE_IMAGE_CONTRACT,
    generatedAt: new Date().toISOString(),
    commitSha: sha,
    image: releaseImageRef(repository),
    digest,
    verifications: Object.fromEntries(
      Object.entries(summaries).map(([key, { statements, ...rest }]) => [
        key,
        { ...rest, subjects: statements.map((s) => s?.subject ?? null) }
      ])
    ),
    sbomMatchesArtifact,
    anonymousPull: anonymousPullState(anonymous)
  }
  validateReleaseVerification(record, {
    commitSha: sha,
    repository,
    digest,
    sbom,
    verifications,
    anonymousPull: anonymous
  })
  writeNewFile(
    path.join(out, 'release-verification.json'),
    `${JSON.stringify(record, null, 2)}\n`
  )
  process.stdout.write(
    `${JSON.stringify({ digest, anonymousPull: record.anonymousPull })}\n`
  )
}

const COMMANDS = {
  anchors: anchorsCommand,
  build: buildCommand,
  'trivy-summary': trivySummaryCommand,
  manifest: manifestCommand,
  publish: publishCommand,
  verify: verifyCommand
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [command, ...args] = process.argv.slice(2)
    const handler = COMMANDS[command]
    if (!handler) throw new Error(`release_record_unknown_command:${command}`)
    handler(args)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exitCode = 1
  }
}
