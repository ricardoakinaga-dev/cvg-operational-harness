// Review R1 probe: duplicate installed records for one key (good MATCH first,
// MISMATCH second) on v3 and v4, lib layout (no dist rule). Shows whether the
// "both records PROVEN" output is pre-existing (v3) or new in v4.
import fs from 'node:fs'
import path from 'node:path'
import { collectPackageInventory, canonicalJson } from '/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018/scripts/boundary-installed-identity.mjs'
import * as H from './harness.mjs'

const OUT = path.join(import.meta.dirname, 'probe-dup-v3.json')
const f = H.fixture('dup', 'lib', {
  'entry.mjs': "import v from 'pkgd'\nexport default v\n",
  'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './lib/index.js' }),
  'node_modules/pkgd/lib/index.js': 'export default 1\n'
})
const i = collectPackageInventory(path.join(f.root, 'node_modules/pkgd'))
const body = { entries: i.entries, nestedPackages: i.nestedPackages, usage: i.usage }
const good = { key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64), inventorySha256: H.sha(canonicalJson(body)), inventory: body }
f.installed = [good, { ...good, identityStatus: 'MISMATCH' }]
const [o3] = H.run(H.V3, [f]), [o4] = H.run(H.V4, [f])
const res = { probe: 'probe-dup-v3', observedAt: new Date().toISOString(), v3sha: H.sha(fs.readFileSync(H.V3)), v4sha: H.sha(fs.readFileSync(H.V4)), v3: { status: o3.status, installed: o3.installed }, v4: { status: o4.status, installed: o4.installed } }
H.saveJson(OUT, res)
console.log(JSON.stringify([res.v3.status, res.v3.installed.map((x) => x.status), res.v4.status, res.v4.installed.map((x) => x.status)]))
