#!/usr/bin/env node
/**
 * PROD-01 — recomputes the audit manifest hashes against the current tree to
 * decide which prior evidence still describes the same bytes.
 *
 * Reads:  docs/04_audit/evidence/AUD-20260913-DOCS/manifest.json
 * Writes: <out> JSON with changed/added/missing files, split by area.
 * No product file is modified.
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = '/home/ricardo/cvg-agent-secretary-v2'
const manifestPath = path.join(
  root,
  'docs/04_audit/evidence/AUD-20260913-DOCS/manifest.json'
)
const outPath =
  process.argv[2] ??
  path.join(
    root,
    'docs/04_audit/evidence/PROD-20260913/PROD-01/baseline-drift.json'
  )

function areaOf(filePath) {
  if (filePath.startsWith('docs/')) return 'docs'
  if (
    filePath.startsWith('apps/') ||
    filePath.startsWith('packages/') ||
    filePath.startsWith('tests/') ||
    filePath.startsWith('scripts/') ||
    filePath.startsWith('certification/') ||
    filePath.startsWith('deploy/') ||
    filePath === 'Dockerfile' ||
    filePath === 'package.json' ||
    filePath === 'package-lock.json'
  ) {
    return 'product'
  }
  return 'other'
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const changed = []
  const missing = []
  const unchanged = []
  for (const entry of manifest.files) {
    const absolute = path.join(root, entry.path)
    if (!existsSync(absolute)) {
      missing.push({ path: entry.path, area: areaOf(entry.path) })
      continue
    }
    const bytes = await readFile(absolute)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    if (sha256 === entry.sha256) unchanged.push(entry.path)
    else
      changed.push({ path: entry.path, area: areaOf(entry.path), was: entry.sha256, now: sha256 })
  }
  const productChanged = changed.filter((item) => item.area === 'product')
  const docsChanged = changed.filter((item) => item.area === 'docs')
  const result = {
    task: 'PROD-01',
    observedAt: new Date().toISOString(),
    manifest: 'docs/04_audit/evidence/AUD-20260913-DOCS/manifest.json',
    manifestCommit: manifest.commit,
    totalFiles: manifest.files.length,
    unchanged: unchanged.length,
    changed: changed.length,
    missing: missing.length,
    productChanged: productChanged.map((item) => item.path),
    docsChanged: docsChanged.map((item) => item.path),
    missingFiles: missing.map((item) => item.path),
    detail: changed
  }
  await writeFile(outPath, JSON.stringify(result, null, 2) + '\n')
  console.log(
    JSON.stringify(
      {
        total: result.totalFiles,
        unchanged: result.unchanged,
        changed: result.changed,
        missing: result.missing,
        productChanged: result.productChanged.length,
        docsChanged: result.docsChanged.length,
        sampleProduct: result.productChanged.slice(0, 20),
        sampleDocs: result.docsChanged.slice(0, 10)
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
