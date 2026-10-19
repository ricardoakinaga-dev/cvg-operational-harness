// Approved bytes of the files pinned by the historical SPEC0215/SPEC0216
// proposals. SPEC0228 keeps those tables only as inactive inventory, so the
// boundary qualification tests build their fixtures from this frozen corpus,
// not from the live tree that later approved work changed. Each read is
// checked against the corpus manifest; the tests still compare every fixture
// file with the sealed proposal pins.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const corpusRoot = 'tests/fixtures/pare100-historical-pins'
const manifest = JSON.parse(
  fs.readFileSync(path.join(corpusRoot, 'manifest.json'), 'utf8')
)

export function pinnedBytes(file) {
  const entry = manifest.files[file]
  if (!entry) throw new Error(`not a historical pinned file: ${file}`)
  // Content-addressed blobs keep compiled mirrors out of gitignored dist/.
  const bytes = fs.readFileSync(
    path.join(corpusRoot, `${entry.sha256}.source.txt`)
  )
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== entry.sha256)
    throw new Error(`historical pin corpus drift: ${file}`)
  return bytes
}

export const pinnedText = (file) => pinnedBytes(file).toString('utf8')
