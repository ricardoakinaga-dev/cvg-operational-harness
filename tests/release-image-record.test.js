// @vitest-environment node
// SPEC0253 P4 (RELEASE-CI-0253-20261021): release record CLI and contract
// with a synthetic tarball (manifest.json + config blob) built by `tar`,
// synthetic Trivy reports, SBOM and Sigstore bundles in a temporary
// evidence/ directory.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EVIDENCE_FILES,
  PROVENANCE_PREDICATE,
  SBOM_PREDICATE,
  TRIVY_IMAGE,
  UPLOAD_EVIDENCE_NAMES,
  readEvidenceFile,
  validateBuildRecord,
  validateReleaseImageRecord,
  validateReleaseVerification
} from '../scripts/release-image-contract.mjs'
import {
  evaluateReleaseGate,
  gateRecordFrom,
  loadGateInputs
} from '../scripts/release-image-gate.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const recordScript = path.join(root, 'scripts/release-image-record.mjs')
const S = '24cdb463faa1010da5fd78b6d923950ac2741713'
const REPO = 'ricardoakinaga-dev/cvg-operational-harness'
const IMAGE = `ghcr.io/${REPO}`
const FAKE_CREDENTIAL = 'FAKE-REGISTRY-CREDENTIAL-0253'

const temporary = []
afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function tempDir(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporary.push(directory)
  return directory
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (value) => Buffer.from(JSON.stringify(value, null, 2))

function imageConfig(overrides = {}) {
  return {
    architecture: 'amd64',
    os: 'linux',
    config: {
      User: 'cvg',
      Cmd: ['node', 'apps/api/dist/main.js'],
      Labels: {
        'org.opencontainers.image.source': `https://github.com/${REPO}`,
        'org.opencontainers.image.revision': S
      },
      ...overrides
    },
    rootfs: { type: 'layers', diff_ids: [`sha256:${'4'.repeat(64)}`] }
  }
}

function dockerfile({ syntaxPinned = true, basePinned = true } = {}) {
  const pin = (ref) => `${ref}@sha256:${'9'.repeat(64)}`
  return [
    `# syntax=${syntaxPinned ? pin('docker/dockerfile:1.7') : 'docker/dockerfile:1.7'}`,
    `FROM ${basePinned ? pin('node:22.23.2-bookworm-slim') : 'node:22.23.2-bookworm-slim'} AS build`,
    'RUN true',
    `FROM ${pin('node:22.23.2-bookworm-slim')} AS prod-deps`,
    `FROM ${pin('gcr.io/distroless/cc-debian12:nonroot')} AS runtime`,
    'USER cvg',
    `FROM ${pin('nginxinc/nginx-unprivileged:1.27-alpine')} AS web`,
    ''
  ].join('\n')
}

function buildTarball(directory, options = {}) {
  const layout = path.join(directory, 'layout')
  fs.mkdirSync(path.join(layout, 'blobs/sha256'), { recursive: true })
  const configBytes = json(options.config ?? imageConfig())
  const configHex = sha256(configBytes)
  const layer = Buffer.from('synthetic layer')
  const layerHex = sha256(layer)
  fs.writeFileSync(
    path.join(layout, 'blobs/sha256', configHex),
    options.tamperConfig ? Buffer.from('tampered config') : configBytes
  )
  fs.writeFileSync(path.join(layout, 'blobs/sha256', layerHex), layer)
  const entry = {
    Config: options.configPath ?? `blobs/sha256/${configHex}`,
    RepoTags: [`cvg-operational-harness:release-${S}`],
    Layers: [`blobs/sha256/${layerHex}`]
  }
  const entries = options.twoEntries ? [entry, entry] : [entry]
  fs.writeFileSync(path.join(layout, 'manifest.json'), JSON.stringify(entries))
  fs.writeFileSync(
    path.join(layout, 'oci-layout'),
    '{"imageLayoutVersion":"1.0.0"}'
  )
  fs.writeFileSync(
    path.join(layout, 'index.json'),
    '{"schemaVersion":2,"manifests":[]}'
  )
  fs.mkdirSync(path.join(directory, 'in'), { recursive: true })
  const tarball = path.join(directory, 'in/image.tar')
  const tar = spawnSync('tar', [
    '-cf',
    tarball,
    '-C',
    layout,
    'manifest.json',
    'oci-layout',
    'index.json',
    'blobs'
  ])
  if (tar.status !== 0) throw new Error(String(tar.stderr))
  fs.chmodSync(tarball, 0o444)
  return {
    tarball,
    tarballSha256: sha256(fs.readFileSync(tarball)),
    configDigest: `sha256:${configHex}`,
    config: JSON.parse(configBytes.toString())
  }
}

function sbomFor(configDigest, overrides = {}) {
  return {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    metadata: {
      component: {
        type: 'container',
        name: '/in/image.tar',
        properties: [
          { name: 'aquasecurity:trivy:ImageID', value: configDigest },
          { name: 'aquasecurity:trivy:SchemaVersion', value: '2' }
        ]
      }
    },
    components: [
      { type: 'library', name: 'libc6', purl: 'pkg:deb/debian/libc6@2.36' },
      { type: 'library', name: 'fastify', purl: 'pkg:npm/fastify@5.0.0' }
    ],
    ...overrides
  }
}

function trivyReport(configDigest, vulnerabilities = [], user = 'cvg') {
  return {
    SchemaVersion: 2,
    ArtifactName: '/in/image.tar',
    ArtifactType: 'container_image',
    Metadata: {
      ImageID: configDigest,
      ImageConfig: { config: { User: user } }
    },
    Results: [{ Target: 'app', Vulnerabilities: vulnerabilities }]
  }
}

function writeEvidence(evidence, image, overrides = {}) {
  fs.mkdirSync(evidence, { recursive: true, mode: 0o700 })
  const files = {
    'trivy-version.json': {
      Version: '0.75.0',
      VulnerabilityDB: {
        Version: 2,
        NextUpdate: '2026-10-23T00:00:00Z',
        UpdatedAt: '2026-10-22T00:00:00Z',
        DownloadedAt: '2026-10-22T05:00:00Z'
      }
    },
    'trivy-gate.json': trivyReport(image.configDigest),
    'trivy-full.json': trivyReport(image.configDigest, [
      {
        VulnerabilityID: 'CVE-2026-84782',
        PkgName: 'libssl3',
        Severity: 'HIGH',
        InstalledVersion: '3.0.17'
      }
    ]),
    'sbom.cdx.json': sbomFor(image.configDigest),
    ...overrides
  }
  for (const [name, value] of Object.entries(files)) {
    fs.writeFileSync(
      path.join(evidence, name),
      typeof value === 'string' || Buffer.isBuffer(value) ? value : json(value)
    )
  }
}

function runRecord(args, env = {}) {
  return spawnSync(process.execPath, [recordScript, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }
  })
}

function setup(options = {}) {
  const directory = tempDir('cvg-release-record-')
  const image = buildTarball(directory, options.tarball)
  const evidence = path.join(directory, 'evidence')
  writeEvidence(evidence, image, options.evidence)
  const dockerfilePath = path.join(directory, 'Dockerfile')
  fs.writeFileSync(dockerfilePath, dockerfile(options.dockerfile))
  const githubOutput = path.join(directory, 'github-output')
  fs.writeFileSync(githubOutput, 'untouched=1\n')
  const anchors = {
    ANCHOR_TARBALL_SHA256: image.tarballSha256,
    ANCHOR_CONFIG_DIGEST: image.configDigest,
    ...options.anchors
  }
  return { directory, image, evidence, dockerfilePath, githubOutput, anchors }
}

function runBuild(ctx) {
  return runRecord(
    [
      'build',
      '--tarball',
      ctx.image.tarball,
      '--evidence',
      ctx.evidence,
      '--sha',
      S,
      '--repository',
      REPO,
      '--dockerfile',
      ctx.dockerfilePath
    ],
    { ...ctx.anchors, GITHUB_OUTPUT: ctx.githubOutput }
  )
}

function buildExpected(ctx) {
  return {
    commitSha: S,
    repository: REPO,
    anchors: {
      tarballSha256: ctx.image.tarballSha256,
      configDigest: ctx.image.configDigest
    },
    config: ctx.image.config,
    dockerfile: fs.readFileSync(ctx.dockerfilePath, 'utf8'),
    sbomBytes: fs.readFileSync(path.join(ctx.evidence, 'sbom.cdx.json')),
    gateReport: JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'trivy-gate.json'), 'utf8')
    ),
    fullReport: JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'trivy-full.json'), 'utf8')
    ),
    trivyVersion: JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'trivy-version.json'), 'utf8')
    )
  }
}

function manifestFor(configDigest, mediaType) {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 2,
      mediaType: mediaType ?? 'application/vnd.oci.image.manifest.v1+json',
      config: {
        mediaType: 'application/vnd.oci.image.config.v1+json',
        digest: configDigest,
        size: 1000
      },
      layers: [
        {
          mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
          digest: `sha256:${'5'.repeat(64)}`,
          size: 10
        }
      ]
    })
  )
}

function bundleFor(digest, predicateType, predicate, name = IMAGE) {
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name, digest: { sha256: digest.slice('sha256:'.length) } }],
    predicateType,
    predicate
  }
  return Buffer.from(
    JSON.stringify({
      mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
      verificationMaterial: { certificate: { rawBytes: 'c3ludGhldGlj' } },
      dsseEnvelope: {
        payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
        payloadType: 'application/vnd.in-toto+json',
        signatures: [{ sig: 'c3ludGhldGlj' }]
      }
    })
  )
}

function realGateRecord() {
  return gateRecordFrom(
    evaluateReleaseGate(
      loadGateInputs(
        path.join(root, 'tests/fixtures/release-image/gate-24cdb463')
      )
    )
  )
}

function publishSetup(options = {}) {
  const ctx = setup(options.setup)
  const built = runBuild(ctx)
  if (built.status !== 0) throw new Error(built.stderr)
  const registry = path.join(ctx.directory, 'registry')
  fs.mkdirSync(registry)
  const manifestBytes =
    options.manifestBytes ??
    manifestFor(
      options.manifestConfigDigest ?? ctx.image.configDigest,
      options.mediaType
    )
  const manifestPath = path.join(registry, 'manifest.json')
  fs.writeFileSync(manifestPath, manifestBytes)
  const digest = options.digest ?? `sha256:${sha256(manifestBytes)}`
  const sbom = JSON.parse(
    fs.readFileSync(path.join(ctx.evidence, 'sbom.cdx.json'), 'utf8')
  )
  const bundles = path.join(ctx.directory, 'bundles')
  fs.mkdirSync(bundles)
  const provenanceBundle = path.join(bundles, 'provenance.jsonl')
  const sbomBundle = path.join(bundles, 'sbom.jsonl')
  fs.writeFileSync(
    provenanceBundle,
    bundleFor(digest, options.provenancePredicateType ?? PROVENANCE_PREDICATE, {
      buildDefinition: { buildType: 'synthetic' }
    })
  )
  fs.writeFileSync(
    sbomBundle,
    bundleFor(digest, SBOM_PREDICATE, options.sbomPredicate ?? sbom)
  )
  const gateRecord = options.gateRecord ?? realGateRecord()
  return {
    ...ctx,
    manifestPath,
    manifestBytes,
    digest,
    provenanceBundle,
    sbomBundle,
    gateRecord,
    sbom
  }
}

function runPublish(ctx, env = {}) {
  return runRecord(
    [
      'publish',
      '--tarball',
      ctx.image.tarball,
      '--evidence',
      ctx.evidence,
      '--sha',
      S,
      '--repository',
      REPO,
      '--dockerfile',
      ctx.dockerfilePath,
      '--digest',
      ctx.digest,
      '--manifest',
      ctx.manifestPath,
      '--provenance-bundle',
      ctx.provenanceBundle,
      '--sbom-bundle',
      ctx.sbomBundle
    ],
    {
      ...ctx.anchors,
      GATE_RECORD:
        ctx.gateRecord === null ? undefined : JSON.stringify(ctx.gateRecord),
      GITHUB_OUTPUT: ctx.githubOutput,
      ...env
    }
  )
}

describe('SPEC0253 P4: anchors', () => {
  it('writes exactly tarball_sha256 and config_digest to GITHUB_OUTPUT', () => {
    const ctx = setup()
    const output = path.join(ctx.directory, 'anchors-output')
    fs.writeFileSync(output, '')
    const result = runRecord(['anchors', '--tarball', ctx.image.tarball], {
      GITHUB_OUTPUT: output
    })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(fs.readFileSync(output, 'utf8')).toBe(
      `tarball_sha256=${ctx.image.tarballSha256}\nconfig_digest=${ctx.image.configDigest}\n`
    )
  })

  it.each([
    ['two manifest entries', { twoEntries: true }],
    ['config outside blobs/sha256', { configPath: 'config.json' }],
    ['config blob hash different from its name', { tamperConfig: true }]
  ])('fails on %s', (_label, tarball) => {
    const ctx = setup({ tarball })
    const output = path.join(ctx.directory, 'anchors-output')
    fs.writeFileSync(output, '')
    const result = runRecord(['anchors', '--tarball', ctx.image.tarball], {
      GITHUB_OUTPUT: output
    })
    expect(result.status).not.toBe(0)
    expect(fs.readFileSync(output, 'utf8')).toBe('')
  })
})

describe('SPEC0253 P4: build record', () => {
  it('accepts the valid case and leaves GITHUB_OUTPUT intact', () => {
    const ctx = setup()
    const result = runBuild(ctx)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(fs.readFileSync(ctx.githubOutput, 'utf8')).toBe('untouched=1\n')
    const record = JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'build-record.json'), 'utf8')
    )
    expect(record).toMatchObject({
      commitSha: S,
      tarballSha256: ctx.image.tarballSha256,
      configDigest: ctx.image.configDigest,
      configUser: 'cvg',
      trivyImage: TRIVY_IMAGE,
      trivyVersion: '0.75.0'
    })
    expect(record.baseImageRefs[0]).toMatch(/^docker\/dockerfile:1\.7@sha256:/)
    expect(validateBuildRecord(record, buildExpected(ctx))).toEqual({
      pass: true
    })
  })

  it.each([
    [
      'tarball anchor different from the tarball',
      { anchors: { ANCHOR_TARBALL_SHA256: 'a'.repeat(64) } }
    ],
    [
      'config anchor different from the tarball',
      { anchors: { ANCHOR_CONFIG_DIGEST: `sha256:${'a'.repeat(64)}` } }
    ],
    [
      'SBOM ImageID different from configDigest',
      {
        evidence: {
          'sbom.cdx.json': sbomFor(`sha256:${'b'.repeat(64)}`)
        }
      }
    ],
    [
      'SBOM with vulnerabilities',
      {
        evidence: {
          'sbom.cdx.json': {
            ...sbomFor('PLACEHOLDER'),
            vulnerabilities: [{ id: 'CVE-1' }]
          }
        },
        fixImageId: true
      }
    ],
    [
      'SBOM without pkg:deb',
      {
        evidence: {
          'sbom.cdx.json': {
            ...sbomFor('PLACEHOLDER'),
            components: [{ purl: 'pkg:npm/fastify@5.0.0' }]
          }
        },
        fixImageId: true
      }
    ],
    [
      'SBOM without pkg:npm',
      {
        evidence: {
          'sbom.cdx.json': {
            ...sbomFor('PLACEHOLDER'),
            components: [{ purl: 'pkg:deb/debian/libc6@2.36' }]
          }
        },
        fixImageId: true
      }
    ],
    [
      'config user other than cvg',
      { tarball: { config: imageConfig({ User: 'root' }) } }
    ],
    [
      'cmd other than the runtime entrypoint',
      { tarball: { config: imageConfig({ Cmd: ['node', 'other.js'] }) } }
    ],
    [
      'revision label other than the commit',
      {
        tarball: {
          config: imageConfig({
            Labels: {
              'org.opencontainers.image.source': `https://github.com/${REPO}`,
              'org.opencontainers.image.revision': 'f'.repeat(40)
            }
          })
        }
      }
    ],
    ['base image without digest', { dockerfile: { basePinned: false } }],
    ['syntax frontend without digest', { dockerfile: { syntaxPinned: false } }],
    [
      'Trivy version other than 0.75.0',
      {
        evidence: {
          'trivy-version.json': {
            Version: '0.70.0',
            VulnerabilityDB: {
              UpdatedAt: '2026-10-22T00:00:00Z',
              DownloadedAt: '2026-10-22T05:00:00Z'
            }
          }
        }
      }
    ],
    [
      'Trivy DB without DownloadedAt',
      {
        evidence: {
          'trivy-version.json': {
            Version: '0.75.0',
            VulnerabilityDB: { UpdatedAt: '2026-10-22T00:00:00Z' }
          }
        }
      }
    ],
    [
      'gate report with a fixed HIGH',
      {
        evidence: {
          'trivy-gate.json': trivyReport('PLACEHOLDER', [
            {
              VulnerabilityID: 'CVE-2026-1',
              PkgName: 'x',
              Severity: 'HIGH',
              FixedVersion: '1.2.3'
            }
          ])
        },
        fixImageId: true
      }
    ]
  ])('fails on %s', (_label, options) => {
    const ctx = setup(options)
    if (options.fixImageId) {
      for (const name of ['sbom.cdx.json', 'trivy-gate.json']) {
        const file = path.join(ctx.evidence, name)
        fs.writeFileSync(
          file,
          fs
            .readFileSync(file, 'utf8')
            .replaceAll('PLACEHOLDER', ctx.image.configDigest)
        )
      }
    }
    const result = runBuild(ctx)
    expect(result.status).not.toBe(0)
    expect(fs.existsSync(path.join(ctx.evidence, 'build-record.json'))).toBe(
      false
    )
  })

  it('reads user and CMD from the anchored tarball config, never from Trivy output (O3)', () => {
    const fromTarball = setup({
      tarball: { config: imageConfig({ User: 'root' }) }
    })
    fs.writeFileSync(
      path.join(fromTarball.evidence, 'trivy-gate.json'),
      json(trivyReport(fromTarball.image.configDigest, [], 'cvg'))
    )
    expect(runBuild(fromTarball).status).not.toBe(0)
    const trivySaysRoot = setup()
    fs.writeFileSync(
      path.join(trivySaysRoot.evidence, 'trivy-gate.json'),
      json(trivyReport(trivySaysRoot.image.configDigest, [], 'root'))
    )
    expect(runBuild(trivySaysRoot).status).toBe(0)
  })

  it('rejects trivyImage different from TRIVY_IMAGE', () => {
    const ctx = setup()
    expect(runBuild(ctx).status).toBe(0)
    const record = JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'build-record.json'), 'utf8')
    )
    record.trivyImage = 'docker.io/aquasec/trivy:0.75.0'
    expect(() => validateBuildRecord(record, buildExpected(ctx))).toThrow(
      /trivy_image/
    )
  })
})

describe('SPEC0253 P4: readEvidenceFile and the evidence inventory', () => {
  it('refuses a symlinked sbom.cdx.json and never copies its target', () => {
    const ctx = setup()
    const outside = path.join(ctx.directory, 'config.json')
    fs.writeFileSync(
      outside,
      JSON.stringify({ auths: { 'ghcr.io': { auth: FAKE_CREDENTIAL } } })
    )
    fs.rmSync(path.join(ctx.evidence, 'sbom.cdx.json'))
    fs.symlinkSync(outside, path.join(ctx.evidence, 'sbom.cdx.json'))
    expect(() => readEvidenceFile(ctx.evidence, 'sbom.cdx.json')).toThrow(
      /not_regular/
    )
    const result = runBuild(ctx)
    expect(result.status).not.toBe(0)
    expect(result.stdout + result.stderr).not.toContain(FAKE_CREDENTIAL)
    expect(fs.existsSync(path.join(ctx.evidence, 'build-record.json'))).toBe(
      false
    )
  })

  it('refuses a FIFO', () => {
    const ctx = setup()
    fs.rmSync(path.join(ctx.evidence, 'trivy-full.json'))
    const fifo = spawnSync('mkfifo', [
      path.join(ctx.evidence, 'trivy-full.json')
    ])
    expect(fifo.status).toBe(0)
    expect(() => readEvidenceFile(ctx.evidence, 'trivy-full.json')).toThrow(
      /not_regular/
    )
    expect(runBuild(ctx).status).not.toBe(0)
  })

  it('refuses a directory', () => {
    const ctx = setup()
    fs.rmSync(path.join(ctx.evidence, 'trivy-full.json'))
    fs.mkdirSync(path.join(ctx.evidence, 'trivy-full.json'))
    expect(() => readEvidenceFile(ctx.evidence, 'trivy-full.json')).toThrow(
      /not_regular/
    )
  })

  it('refuses a hardlink (nlink = 2)', () => {
    const ctx = setup()
    fs.linkSync(
      path.join(ctx.evidence, 'trivy-version.json'),
      path.join(ctx.directory, 'trivy-version-link.json')
    )
    expect(() => readEvidenceFile(ctx.evidence, 'trivy-version.json')).toThrow(
      /nlink/
    )
    expect(runBuild(ctx).status).not.toBe(0)
  })

  it('refuses a name outside EVIDENCE_FILES', () => {
    const ctx = setup()
    fs.writeFileSync(path.join(ctx.directory, 'evidence', 'extra.json'), '{}')
    expect(() => readEvidenceFile(ctx.evidence, 'extra.json')).toThrow(
      /name_not_allowed/
    )
    expect(runBuild(ctx).status).not.toBe(0)
  })

  it('refuses a missing evidence file', () => {
    const ctx = setup()
    fs.rmSync(path.join(ctx.evidence, 'trivy-full.json'))
    expect(runBuild(ctx).status).not.toBe(0)
  })

  it('refuses a file above its size limit', () => {
    const ctx = setup()
    const limit = EVIDENCE_FILES.find(
      (entry) => entry.name === 'trivy-version.json'
    ).maxBytes
    fs.writeFileSync(
      path.join(ctx.evidence, 'trivy-version.json'),
      Buffer.alloc(limit + 1, 0x20)
    )
    expect(() => readEvidenceFile(ctx.evidence, 'trivy-version.json')).toThrow(
      /too_large/
    )
    expect(runBuild(ctx).status).not.toBe(0)
  })
})

describe('SPEC0253 P4: registry manifest check (step 17)', () => {
  function runManifest(ctx, manifestBytes, digest) {
    const file = path.join(ctx.directory, 'manifest-check.json')
    fs.writeFileSync(file, manifestBytes)
    return runRecord(['manifest', '--manifest', file, '--digest', digest], {
      ...ctx.anchors
    })
  }

  it('accepts a single image manifest with the anchored config', () => {
    const ctx = setup()
    const bytes = manifestFor(ctx.image.configDigest)
    expect(runManifest(ctx, bytes, `sha256:${sha256(bytes)}`).status).toBe(0)
  })

  it.each([
    [
      'an index',
      (ctx) =>
        manifestFor(
          ctx.image.configDigest,
          'application/vnd.oci.image.index.v1+json'
        )
    ],
    [
      'a Docker manifest list',
      (ctx) =>
        manifestFor(
          ctx.image.configDigest,
          'application/vnd.docker.distribution.manifest.list.v2+json'
        )
    ],
    ['a divergent config.digest', () => manifestFor(`sha256:${'6'.repeat(64)}`)]
  ])('refuses %s', (_label, make) => {
    const ctx = setup()
    const bytes = make(ctx)
    expect(runManifest(ctx, bytes, `sha256:${sha256(bytes)}`).status).not.toBe(
      0
    )
  })

  it('refuses bytes whose SHA-256 is not the digest', () => {
    const ctx = setup()
    const bytes = manifestFor(ctx.image.configDigest)
    expect(runManifest(ctx, bytes, `sha256:${'7'.repeat(64)}`).status).not.toBe(
      0
    )
  })
})

describe('SPEC0253 P4: publish record', () => {
  it('writes and validates release-image.json with the gate record from the gate job (O2)', () => {
    const ctx = publishSetup()
    const result = runPublish(ctx)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(fs.readFileSync(ctx.githubOutput, 'utf8')).toBe('untouched=1\n')
    expect(fs.readdirSync(ctx.evidence).sort()).toEqual(
      [...UPLOAD_EVIDENCE_NAMES].sort()
    )
    const record = JSON.parse(
      fs.readFileSync(path.join(ctx.evidence, 'release-image.json'), 'utf8')
    )
    expect(record).toMatchObject({
      image: IMAGE,
      tag: `sha-${S}`,
      digest: ctx.digest
    })
    expect(record.gate).toEqual(ctx.gateRecord)
    const expected = {
      ...buildExpected(ctx),
      digest: ctx.digest,
      manifestBytes: ctx.manifestBytes,
      gateRecord: ctx.gateRecord,
      bundles: {
        provenance: fs.readFileSync(ctx.provenanceBundle),
        sbom: fs.readFileSync(ctx.sbomBundle)
      }
    }
    expect(validateReleaseImageRecord(record, expected)).toEqual({ pass: true })
    for (const [label, mutate, pattern] of [
      ['latest tag', (r) => (r.tag = 'latest'), /tag/],
      ['other sha tag', (r) => (r.tag = `sha-${'1'.repeat(40)}`), /tag/],
      ['image with tag', (r) => (r.image = `${IMAGE}:latest`), /image/],
      [
        'provenance predicate type',
        (r) => (r.attestations.provenance.predicateType = SBOM_PREDICATE),
        /provenance/
      ],
      ['missing SBOM attestation', (r) => delete r.attestations.sbom, /sbom/],
      [
        'gate checks different from REQUIRED_CHECKS',
        (r) => r.gate.checks.main.pop(),
        /gate/
      ],
      [
        'gate protection different from REQUIRED_CHECKS',
        (r) => (r.gate.protection[0].app_id = 1),
        /gate/
      ],
      ['gate decision', (r) => (r.gate.decision = 'wait'), /gate/],
      [
        'well-formed gate block that the gate job did not emit',
        (r) => (r.gate.checks.main[0].checkRunId += 1),
        /gate_not_from_gate_job/
      ]
    ]) {
      const copy = structuredClone(record)
      mutate(copy)
      expect(() => validateReleaseImageRecord(copy, expected), label).toThrow(
        pattern
      )
    }
  })

  it.each([
    [
      'gate record without one required check',
      (ctx) => {
        ctx.gateRecord = structuredClone(ctx.gateRecord)
        ctx.gateRecord.checks.main = ctx.gateRecord.checks.main.slice(1)
      }
    ],
    [
      'gate record with another protection',
      (ctx) => {
        ctx.gateRecord = structuredClone(ctx.gateRecord)
        ctx.gateRecord.protection = ctx.gateRecord.protection.slice(1)
      }
    ],
    [
      'gate record with a failed PR check',
      (ctx) => {
        ctx.gateRecord = structuredClone(ctx.gateRecord)
        ctx.gateRecord.checks.pr[0].conclusion = 'failure'
      }
    ],
    [
      'gate record for another commit',
      (ctx) => {
        ctx.gateRecord = {
          ...structuredClone(ctx.gateRecord),
          sha: 'f'.repeat(40)
        }
      }
    ],
    ['no gate record', (ctx) => (ctx.gateRecord = null)]
  ])(
    'refuses %s (gate.* comes from the gate job, not recomputed)',
    (_label, mutate) => {
      const ctx = publishSetup()
      mutate(ctx)
      expect(runPublish(ctx).status).not.toBe(0)
      expect(fs.existsSync(path.join(ctx.evidence, 'release-image.json'))).toBe(
        false
      )
    }
  )

  it.each([
    [
      'manifest with an index media type',
      { mediaType: 'application/vnd.oci.image.index.v1+json' }
    ],
    [
      'divergent config.digest',
      { manifestConfigDigest: `sha256:${'6'.repeat(64)}` }
    ],
    [
      'digest that is not the manifest SHA-256',
      { digest: `sha256:${'7'.repeat(64)}` }
    ],
    [
      'wrong provenance predicate type',
      { provenancePredicateType: SBOM_PREDICATE }
    ],
    [
      'SBOM attestation predicate edited',
      { sbomPredicate: { bomFormat: 'CycloneDX' } }
    ]
  ])('refuses %s', (_label, options) => {
    const ctx = publishSetup(options)
    expect(runPublish(ctx).status).not.toBe(0)
  })

  it('refuses an anchor that differs from the tarball', () => {
    const ctx = publishSetup()
    const result = runPublish(ctx, { ANCHOR_TARBALL_SHA256: 'a'.repeat(64) })
    expect(result.status).not.toBe(0)
  })

  it('refuses a symlinked attestation bundle', () => {
    const ctx = publishSetup()
    const target = path.join(ctx.directory, 'real-bundle.json')
    fs.renameSync(ctx.sbomBundle, target)
    fs.symlinkSync(target, ctx.sbomBundle)
    expect(runPublish(ctx).status).not.toBe(0)
  })
})

function verifySetup(options = {}) {
  const ctx = publishSetup()
  const published = runPublish(ctx)
  if (published.status !== 0) throw new Error(published.stderr)
  const artifact = path.join(ctx.directory, 'artifact')
  fs.mkdirSync(artifact)
  for (const name of UPLOAD_EVIDENCE_NAMES) {
    fs.copyFileSync(path.join(ctx.evidence, name), path.join(artifact, name))
  }
  const checks = path.join(ctx.directory, 'checks')
  fs.mkdirSync(checks)
  const hex = ctx.digest.slice('sha256:'.length)
  const verification = (predicateType, predicate) => [
    {
      verificationResult: {
        statement: {
          _type: 'https://in-toto.io/Statement/v1',
          subject: [{ name: IMAGE, digest: { sha256: hex } }],
          predicateType,
          predicate
        }
      }
    }
  ]
  const provenance = { buildDefinition: { buildType: 'synthetic' } }
  const sbomPredicate = options.sbomPredicate ?? ctx.sbom
  for (const [name, type, predicate] of [
    ['provenance-api', PROVENANCE_PREDICATE, provenance],
    ['provenance-oci', PROVENANCE_PREDICATE, provenance],
    ['sbom-api', SBOM_PREDICATE, sbomPredicate],
    ['sbom-oci', SBOM_PREDICATE, sbomPredicate]
  ]) {
    const output = verification(type, predicate)
    if (options.subjectHex && name === 'provenance-oci') {
      output[0].verificationResult.statement.subject[0].digest.sha256 =
        options.subjectHex
    }
    fs.writeFileSync(path.join(checks, `${name}.json`), JSON.stringify(output))
    fs.writeFileSync(
      path.join(checks, `${name}.exit`),
      `${options.failing === name ? 1 : 0}\n`
    )
  }
  fs.writeFileSync(
    path.join(checks, 'anonymous-pull.json'),
    JSON.stringify(
      options.anonymous ?? {
        status: 403,
        code: 'DENIED',
        tokenIssued: false,
        curlExit: 0
      }
    )
  )
  const out = path.join(ctx.directory, 'verify-out')
  fs.mkdirSync(out)
  return { ...ctx, artifact, checks, out }
}

function runVerify(ctx) {
  return runRecord(
    [
      'verify',
      '--artifact',
      ctx.artifact,
      '--checks',
      ctx.checks,
      '--sha',
      S,
      '--repository',
      REPO,
      '--digest',
      ctx.digest,
      '--out',
      ctx.out
    ],
    { GITHUB_OUTPUT: ctx.githubOutput }
  )
}

describe('SPEC0253 P4: release verification record', () => {
  it('writes release-verification.json and leaves GITHUB_OUTPUT intact', () => {
    const ctx = verifySetup()
    const result = runVerify(ctx)
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(fs.readFileSync(ctx.githubOutput, 'utf8')).toBe('untouched=1\n')
    const record = JSON.parse(
      fs.readFileSync(path.join(ctx.out, 'release-verification.json'), 'utf8')
    )
    expect(record).toMatchObject({
      digest: ctx.digest,
      commitSha: S,
      anonymousPull: 'DENIED'
    })
    const read = (name) => ({
      exitCode: Number(
        fs.readFileSync(path.join(ctx.checks, `${name}.exit`), 'utf8')
      ),
      output: JSON.parse(
        fs.readFileSync(path.join(ctx.checks, `${name}.json`), 'utf8')
      )
    })
    const expected = {
      commitSha: S,
      repository: REPO,
      digest: ctx.digest,
      sbom: ctx.sbom,
      verifications: {
        provenanceApi: read('provenance-api'),
        provenanceOci: read('provenance-oci'),
        sbomApi: read('sbom-api'),
        sbomOci: read('sbom-oci')
      },
      anonymousPull: JSON.parse(
        fs.readFileSync(path.join(ctx.checks, 'anonymous-pull.json'), 'utf8')
      )
    }
    expect(validateReleaseVerification(record, expected)).toEqual({
      pass: true
    })
    const tokenCase = structuredClone(record)
    tokenCase.anonymousPull = 'TOKEN'
    expect(() => validateReleaseVerification(tokenCase, expected)).toThrow(
      /anonymous/
    )
  })

  it.each([
    [
      'anonymous probe with a token (public package)',
      { anonymous: { status: 200, code: null, tokenIssued: true, curlExit: 0 } }
    ],
    [
      'SBOM predicate different from the artifact',
      { sbomPredicate: { bomFormat: 'CycloneDX' } }
    ],
    ['OCI provenance verification exit 1', { failing: 'provenance-oci' }],
    ['SBOM API verification exit 1', { failing: 'sbom-api' }],
    ['subject different from the digest', { subjectHex: 'e'.repeat(64) }]
  ])('fails on %s', (_label, options) => {
    const ctx = verifySetup(options)
    expect(runVerify(ctx).status).not.toBe(0)
    expect(fs.existsSync(path.join(ctx.out, 'release-verification.json'))).toBe(
      false
    )
  })
})

describe('SPEC0253 O10: Trivy gate diagnostics', () => {
  it('summarizes fixed HIGH/CRITICAL IDs from trivy-gate.json', () => {
    const ctx = setup()
    fs.writeFileSync(
      path.join(ctx.evidence, 'trivy-gate.json'),
      json(
        trivyReport(ctx.image.configDigest, [
          {
            VulnerabilityID: 'CVE-2026-0001',
            PkgName: 'openssl',
            Severity: 'CRITICAL',
            FixedVersion: '3.0.18'
          }
        ])
      )
    )
    const result = runRecord(['trivy-summary', '--evidence', ctx.evidence])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('CVE-2026-0001')
    expect(result.stdout).toContain('openssl')
  })
})

describe('SPEC0253 code review r1: record hardening (O4, O6)', () => {
  it('refuses in build, before any login or push, a record that would not fit release-image.json (O4)', () => {
    const ctx = setup()
    const findings = Array.from({ length: 8000 }, (_, index) => ({
      VulnerabilityID: `CVE-2026-${String(index).padStart(5, '0')}`,
      PkgName: `pkg-${index}`,
      Severity: 'HIGH',
      InstalledVersion: '1.0.0'
    }))
    fs.writeFileSync(
      path.join(ctx.evidence, 'trivy-full.json'),
      json(trivyReport(ctx.image.configDigest, findings))
    )
    const result = runBuild(ctx)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('release_build_record_too_large')
    expect(fs.existsSync(path.join(ctx.evidence, 'build-record.json'))).toBe(
      false
    )
  })

  it('refuses a file whose inode changed between lstat and open (O6)', () => {
    const directory = tempDir('cvg-release-inode-')
    const target = path.join(directory, 'trivy-version.json')
    const other = path.join(directory, 'other.json')
    fs.writeFileSync(target, '{}')
    fs.writeFileSync(other, '{}')
    const original = fs.lstatSync
    const spy = vi
      .spyOn(fs, 'lstatSync')
      .mockImplementation((file, ...rest) =>
        original(file === target ? other : file, ...rest)
      )
    try {
      expect(() => readEvidenceFile(directory, 'trivy-version.json')).toThrow(
        /replaced/
      )
    } finally {
      spy.mockRestore()
    }
    expect(readEvidenceFile(directory, 'trivy-version.json').toString()).toBe(
      '{}'
    )
  })
})
