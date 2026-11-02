#!/usr/bin/env node
/**
 * Generates a CycloneDX 1.5 SBOM from package-lock.json and writes
 * certification/sbom.cyclonedx.json. No network access required.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(
  fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
)
const rootPackage = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
)

const seen = new Set()
const components = []
for (const [packagePath, meta] of Object.entries(lock.packages ?? {})) {
  if (!packagePath.startsWith('node_modules/')) continue
  const name = meta.name ?? packagePath.replace(/^node_modules\//, '')
  const version = meta.version ?? '0.0.0'
  const key = `${name}@${version}`
  if (seen.has(key)) continue
  seen.add(key)
  const purlName = name.startsWith('@') ? `%40${name.slice(1)}` : name
  const hashes = []
  if (
    typeof meta.integrity === 'string' &&
    meta.integrity.startsWith('sha512-')
  ) {
    hashes.push({
      alg: 'SHA-512',
      content: Buffer.from(
        meta.integrity.slice('sha512-'.length),
        'base64'
      ).toString('hex')
    })
  }
  components.push({
    type: 'library',
    name,
    version,
    purl: `pkg:npm/${purlName}@${version}`,
    ...(hashes.length > 0 ? { hashes } : {}),
    ...(meta.license ? { licenses: [{ license: { id: meta.license } }] } : {}),
    properties: [
      { name: 'cvg:dev', value: meta.dev === true ? 'true' : 'false' },
      { name: 'cvg:lockPath', value: packagePath }
    ]
  })
}

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${createStableUuid(rootPackage.name, lock.lockfileVersion)}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: 'application',
      name: rootPackage.name,
      version: rootPackage.version
    },
    tools: [{ vendor: 'cvg', name: 'generate-sbom', version: '1.0.0' }]
  },
  components
}

const outputDir = path.join(root, 'certification')
fs.mkdirSync(outputDir, { recursive: true })
const outputPath = path.join(outputDir, 'sbom.cyclonedx.json')
const serialized = `${JSON.stringify(bom, null, 2)}\n`
fs.writeFileSync(outputPath, serialized)
const sha256 = createHash('sha256').update(serialized).digest('hex')
console.log(
  JSON.stringify({
    event: 'sbom.generated',
    path: path.relative(root, outputPath),
    components: components.length,
    sha256
  })
)

function createStableUuid(name, lockVersion) {
  const digest = createHash('sha256')
    .update(`${name}:${lockVersion}`)
    .digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}
