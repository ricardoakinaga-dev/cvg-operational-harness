// Review R1 probe: D2 (installed file identity) adversarial cases beyond the
// lead's G1–G5. None may be PROVEN unless every §3.4 premise holds.
//  A1 installed file is a physical symlink (inventory collected from disk)
//  A2 installed dist DIRECTORY is a symlink to build/
//  A3 duplicate records for one key: MISMATCH first, a good MATCH second
//  A4 good MATCH first, MISMATCH duplicate second (engine-API misuse; report)
//  A5 nested package WITH its own good record (positive control)
//  A6 positive control (dist, good inventory) and two-run payload equality
//  A7 file under node_modules/<pkg>/node_modules/<dir-without-manifest>/
//  A8 inventory digest consistent but usage not a record -> INVENTORY_INVALID
import fs from 'node:fs'
import path from 'node:path'
import { collectPackageInventory, canonicalJson } from '/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018/scripts/boundary-installed-identity.mjs'
import * as H from './harness.mjs'

const OUT = path.join(import.meta.dirname, 'probe-d2-adversarial.json')
const G = 'd2adv'
const P = 'export default 1\n'
function identity(root, key, { status = 'MATCH', mutate } = {}) {
  let body
  try {
    const i = collectPackageInventory(path.join(root, key))
    body = { entries: i.entries.map((e) => ({ ...e })), nestedPackages: [...i.nestedPackages], usage: { ...i.usage } }
  } catch (error) {
    return { key, manifest: key + '/package.json', identityStatus: 'UNAVAILABLE', referenceDigest: 'a'.repeat(64), inventorySha256: null, inventory: null, collectError: error.code || error.message }
  }
  if (mutate) body = mutate(body)
  return { key, manifest: key + '/package.json', identityStatus: status, referenceDigest: 'a'.repeat(64), inventorySha256: H.sha(canonicalJson(body)), inventory: body }
}
const entry = "import v from 'pkgd'\nexport default v\n"
const cases = []
{
  const f = H.fixture(G, 'A1-symlink-file', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/real.js': P }, { links: { 'node_modules/pkgd/dist/index.js': 'real.js' } })
  f.installed = [identity(f.root, 'node_modules/pkgd')]
  cases.push(['A1-symlink-file', f])
}
{
  const f = H.fixture(G, 'A2-symlink-dir', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/build/index.js': P }, { links: { 'node_modules/pkgd/dist': 'build' } })
  f.installed = [identity(f.root, 'node_modules/pkgd')]
  cases.push(['A2-symlink-dir', f])
}
{
  const f = H.fixture(G, 'A3-dup-mismatch-first', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P })
  const good = identity(f.root, 'node_modules/pkgd')
  f.installed = [{ ...good, identityStatus: 'MISMATCH' }, good]
  cases.push(['A3-dup-mismatch-first', f])
}
{
  const f = H.fixture(G, 'A4-dup-match-first', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P })
  const good = identity(f.root, 'node_modules/pkgd')
  f.installed = [good, { ...good, identityStatus: 'MISMATCH' }]
  cases.push(['A4-dup-match-first', f])
}
{
  const f = H.fixture(G, 'A5-nested-own-record', {
    'entry.mjs': "import v from 'pa'\nexport default v\n",
    'node_modules/pa/package.json': H.pkg('pa', { exports: './i.js' }),
    'node_modules/pa/i.js': "import w from 'pb'\nexport default w\n",
    'node_modules/pa/node_modules/pb/package.json': H.pkg('pb', { exports: './dist/i.js' }),
    'node_modules/pa/node_modules/pb/dist/i.js': P
  })
  f.installed = [identity(f.root, 'node_modules/pa'), identity(f.root, 'node_modules/pa/node_modules/pb')]
  cases.push(['A5-nested-own-record', f])
}
{
  const f = H.fixture(G, 'A6-positive', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P })
  f.installed = [identity(f.root, 'node_modules/pkgd')]
  cases.push(['A6-positive', f], ['A6-positive-run2', f])
}
{
  const f = H.fixture(G, 'A7-nested-dir-no-manifest', {
    'entry.mjs': "import v from 'pa'\nexport default v\n",
    'node_modules/pa/package.json': H.pkg('pa', { exports: './i.js' }),
    'node_modules/pa/i.js': "import w from './node_modules/helpers/x.js'\nexport default w\n",
    'node_modules/pa/node_modules/helpers/x.js': P
  })
  f.installed = [identity(f.root, 'node_modules/pa')]
  cases.push(['A7-nested-dir-no-manifest', f])
}
{
  const f = H.fixture(G, 'A8-usage-invalid', { 'entry.mjs': entry, 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P })
  f.installed = [identity(f.root, 'node_modules/pkgd', { mutate: (b) => ({ ...b, usage: [1] }) })]
  cases.push(['A8-usage-invalid', f])
}
const outs = H.run(H.V4, cases.map(([, f]) => f))
const rows = cases.map(([id, f], i) => ({
  case: id,
  installed: f.installed.map((r) => ({ key: r.key, identityStatus: r.identityStatus, inventorySha256: r.inventorySha256, entries: r.inventory?.entries?.map((e) => [e.path, e.type]) ?? null, collectError: r.collectError })),
  status: outs[i].status,
  proofs: outs[i].proofs.length,
  unknowns: H.tuples(outs[i]),
  installedOut: outs[i].installed,
  fileIdentity: outs[i].installedFileIdentity,
  validation: outs[i].validation,
  payloadSha256: H.sha(JSON.stringify({ ...outs[i], telemetry: undefined }))
}))
const provenUnexpected = rows.filter((r) => r.status === 'PROVEN' && !/^A5|^A6|^A4/.test(r.case)).map((r) => r.case)
H.saveJson(OUT, { probe: 'probe-d2-adversarial', observedAt: new Date().toISOString(), engineSha256: H.sha(fs.readFileSync(H.V4)), rows, provenUnexpected, positiveRunsEqual: rows[5].payloadSha256 === rows[6].payloadSha256 })
console.log(JSON.stringify(rows.map((r) => [r.case, r.status, r.unknowns.map((u) => u[1] + ':' + u[2])])))
console.log(JSON.stringify({ provenUnexpected }))
