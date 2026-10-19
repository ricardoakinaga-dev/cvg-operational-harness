// Review R1 probe: v3 oracle (af63ba60 bytes) vs frozen v4 (228e7918) on the
// same private inputs. Census (refusal mode) must be identical; every v3
// tuple must persist outside the three §3.5 exceptions (+envelope); the v3
// violation multiset must be contained in v4. Re-runs the lead's 20 cases on
// the FROZEN engine (the lead's differential ran on pre-freeze f6c799ce) and
// adds critic cases N1–N14.
import fs from 'node:fs'
import path from 'node:path'
import { collectPackageInventory, canonicalJson } from '/mnt/dados/cvg-work/cvg-hiso005-build0241-20261018/scripts/boundary-installed-identity.mjs'
import * as H from './harness.mjs'

const OUT = path.join(import.meta.dirname, 'probe-differential.json')
const G = 'differential'
const P = 'export default 1\n'
const MATCH = { identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
const imp = (s) => `import x from ${JSON.stringify(s)}\nexport const after = missingGlobal\n`
const inv = (root, key, mutate) => {
  const i = collectPackageInventory(path.join(root, key))
  let body = { entries: i.entries.map((e) => ({ ...e })), nestedPackages: [...i.nestedPackages], usage: { ...i.usage } }
  if (mutate) body = mutate(body)
  return { key, manifest: key + '/package.json', ...MATCH, inventorySha256: H.sha(canonicalJson(body)), inventory: body }
}
const cases = [
  ['C1', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': 'export const x = missingGlobal\n' }, { starts: ['a.mjs', 'b.mjs'] }],
  ['C2', { 'entry.mjs': "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n" }],
  ['C3', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P }, { installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }] }],
  ['C3lib', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './lib/index.js' }), 'node_modules/pkgd/lib/index.js': P }, { installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }] }],
  ['C4', { 'entry.mjs': 'async function unused() {}\nfunction b(a = 1) { return a }\nexport default 1\n' }],
  ['C5', { 'entry.mjs': "import v from 'pkgb'\nexport default v\n", 'node_modules/pkgb/package.json': H.pkg('pkgb', { browser: './lib/index.js', exports: { default: './lib/index.js' } }), 'node_modules/pkgb/lib/index.js': P }, { installed: [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }] }],
  ['C6', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n", 'products/x.mjs': P }, { starts: ['a.mjs', 'b.mjs'] }],
  ['X1', { 'b.mjs': "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n", 'c.mjs': "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n", 'products/x.mjs': P, 'products/y.mjs': P, 'products/z.mjs': P }, { starts: ['b.mjs', 'c.mjs'] }],
  ['X2', { 'a.mjs': "const m = { p: './missing.mjs' }\nimport(m.p)\nexport const after = missingGlobal\n" }, { starts: ['a.mjs'] }],
  ['X3', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'node_modules/pkgu/package.json': H.pkg('pkgu', { exports: './lib/index.js' }), 'node_modules/pkgu/lib/index.js': P }, { starts: ['a.mjs'], installed: [{ key: 'node_modules/pkgu', manifest: 'node_modules/pkgu/package.json', ...MATCH }] }],
  ['R-resolution', { 'entry.mjs': imp('missingpkg') }],
  ['R-format', { 'entry.mjs': imp('./data.json'), 'data.json': '{}' }],
  ['R-interop', { 'entry.mjs': imp('./a.cjs'), 'a.cjs': 'module.exports=1\n' }],
  ['R-unresolved', { 'entry.mjs': imp('pr'), 'node_modules/pr/package.json': H.pkg('pr', { exports: { './x': './x.js' } }) }],
  ['R-name', { 'entry.mjs': imp('pm'), 'node_modules/pm/package.json': H.pkg('other', { exports: './i.js' }), 'node_modules/pm/i.js': P }],
  ['R-enoent', { 'entry.mjs': imp('./missing.mjs') }],
  ['R-product', { 'entry.mjs': imp('./products/x.mjs'), 'products/x.mjs': P }],
  ['F-categories', { 'entry.mjs': 'async function* a({ y }, q = 2, ...z) { return z }\nfunction () { return 1 }\nexport default 1\n' }],
  ['Y-cut-states', { 'a.mjs': 'const o = { a: 1 }\nconst b = o.a\nexport const c = b\n' }, { starts: ['a.mjs'], limits: { maxStates: 6 } }],
  ['Y-cut-union', { 'a.mjs': 'const o = { a: 1 }\nexport const c = o.a\n' }, { starts: ['a.mjs'], limits: { maxUnionValues: 0 } }],
  // critic cases
  ['N1-chain', { 'a.mjs': "import y from './b.mjs'\nexport const after = missingA\n", 'b.mjs': "import fs from 'node:fs'\nimport q from './missing.mjs'\nexport const z = missingB\nexport default 1\n" }, { starts: ['a.mjs'] }],
  ['N2-export-from', { 'entry.mjs': "export { x } from 'node:fs'\nexport const after = missingGlobal\n" }],
  ['N3-loader', { 'entry.cjs': "const fs = require('node:fs')\nconst q = require('./missing.cjs')\nmodule.exports = missingGlobal\n" }, { starts: ['entry.cjs'] }],
  ['N4-union-dynamic', { 'entry.mjs': "const c = {}\nconst s = c ? './products/x.mjs' : './missing.mjs'\nimport(s)\nexport const after = missingGlobal\n", 'products/x.mjs': P }],
  ['N5-global-on-body-edge', { 'package.json': { ...H.ROOTPKG, workspaces: ['packages/*'] }, 'packages/ws/package.json': H.pkg('ws', { exports: './i.js' }), 'packages/ws/i.js': P, 'entry.mjs': "const m = { p: 'ws' }\nimport(m.p)\nexport const after = missingGlobal\n" }, { links: { 'node_modules/ws': '../packages/ws' }, resolutionLimits: { maxLinks: 0 } }],
  ['N6-d2-dist-positive', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P }, { inv: [['node_modules/pkgd']] }],
  ['N7-d2-dist-sha', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': 'export default missingInDist\n' }, { inv: [['node_modules/pkgd', (b) => ({ ...b, entries: b.entries.map((e) => (e.path === 'dist/index.js' ? { ...e, sha256: 'c'.repeat(64) } : e)) })]] }],
  ['N8-lib-match-no-inventory', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './lib/index.js' }), 'node_modules/pkgd/lib/index.js': P }, { installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }] }],
  ['N9-categories-expr', { 'entry.mjs': 'export default async function () {}\nconst f = async (a = 1) => a\nconst o = { *g() {} }\nexport const k = 1\n' }],
  ['N12-violation-behind-contained-nested', { 'a.mjs': "import y from './b.mjs'\nexport default 1\n", 'b.mjs': "import fs from 'node:fs'\nconst m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n", 'products/x.mjs': P }, { starts: ['a.mjs'] }],
  ['N13-installed-dist-receipt', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': H.pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P }, { installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }], compiled: { status: 'PROVEN', recipeVersion: 'shared-contracts-fresh-force-v1', files: [{ file: 'node_modules/pkgd/dist/index.js', sha256: H.sha(P) }] } }],
  ['N14-static-missing', { 'entry.mjs': "import q from './missing.mjs'\nexport const after = missingGlobal\n" }]
]
const inputs = cases.map(([id, files, o = {}]) => {
  const f = H.fixture(G, id, files, o)
  if (o.inv) f.installed = o.inv.map(([k, m]) => inv(f.root, k, m))
  return f
})
const c3 = H.census(H.V3, inputs), c4 = H.census(H.V4, inputs)
const n3 = H.run(H.V3, inputs), n4 = H.run(H.V4, inputs)
const rows = cases.map(([id], i) => {
  const classes = H.conservation(n3[i], n4[i])
  return {
    case: id,
    censusEqual: JSON.stringify([c3[i].unknowns, c3[i].violations]) === JSON.stringify([c4[i].unknowns, c4[i].violations]),
    v3: { status: n3[i].status, unknowns: H.tuples(n3[i]), violations: n3[i].violations, proofs: n3[i].proofs.length },
    v4: { status: n4[i].status, unknowns: H.tuples(n4[i]), violations: n4[i].violations, proofs: n4[i].proofs.length, phases: n4[i].phases, bodyCoverage: n4[i].bodyCoverage, validation: n4[i].validation, kernel: n4[i].kernelVersion, fileIdentity: n4[i].installedFileIdentity },
    classes,
    defects: classes.filter(([k]) => k === 'defect').map(([, t]) => t),
    violationsContained: H.violationsContained(n3[i], n4[i])
  }
})
const out = {
  probe: 'probe-differential',
  observedAt: new Date().toISOString(),
  v3: { engine: H.V3, sha256: H.sha(fs.readFileSync(H.V3)) },
  v4: { engine: H.V4, sha256: H.sha(fs.readFileSync(H.V4)) },
  cases: rows.length,
  censusAllEqual: rows.every((r) => r.censusEqual),
  conservationDefects: rows.flatMap((r) => r.defects.map((d) => [r.case, d])),
  violationsAllContained: rows.every((r) => r.violationsContained),
  v4ProvenCases: rows.filter((r) => r.v4.status === 'PROVEN').map((r) => r.case),
  rows
}
H.saveJson(OUT, out)
console.log(JSON.stringify({ census: out.censusAllEqual, defects: out.conservationDefects, viol: out.violationsAllContained, proven: out.v4ProvenCases }))
