// HISO005-P2-BUILD-0241 — IB01/IB09 differential on private fixtures: the
// frozen v3 engine (af63ba60) and the v4 candidate on identical inputs.
//  - census (analyzeSemanticBoundary refusalCensus): unknowns and violations
//    must be byte-identical (SPEC0241 §3.2/E3);
//  - normal (runSemanticBoundary): every v3 tuple persists in v4 except the
//    three nominal exceptions of §3.5, envelope tuples separated, and the v3
//    violation multiset is contained in v4.
// Usage: <node22.23.2> differential.mjs <v3-engine> <v4-engine> <fixture-root> <out.json>
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const [V3, V4, base, outFile] = process.argv.slice(2)
const NODE = process.execPath
const sha = (b) => createHash('sha256').update(b).digest('hex')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const ROOT = fs.realpathSync(base)
const MATCH = { identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
const pkg = (name, extra = {}) => JSON.stringify({ name, version: '1.0.0', type: 'module', ...extra })
const ROOTPKG = JSON.stringify({ name: 'fixture-root', private: true, type: 'module' })
const P = 'export default 1\n'
const imp = (s) => `import x from ${JSON.stringify(s)}\nexport const after = missingGlobal\n`
const cases = [
  ['C1', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': 'export const x = missingGlobal\n' }, ['a.mjs', 'b.mjs']],
  ['C2', { 'entry.mjs': "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n" }],
  ['C3', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P }, null, [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }]],
  ['C3lib', { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': pkg('pkgd', { exports: './lib/index.js' }), 'node_modules/pkgd/lib/index.js': P }, null, [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }]],
  ['C4', { 'entry.mjs': 'async function unused() {}\nfunction b(a = 1) { return a }\nexport default 1\n' }],
  ['C5', { 'entry.mjs': "import v from 'pkgb'\nexport default v\n", 'node_modules/pkgb/package.json': pkg('pkgb', { browser: './lib/index.js', exports: { default: './lib/index.js' } }), 'node_modules/pkgb/lib/index.js': P }, null, [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }]],
  ['C6', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n", 'products/x.mjs': P }, ['a.mjs', 'b.mjs']],
  ['X1', { 'b.mjs': "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n", 'c.mjs': "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n", 'products/x.mjs': P, 'products/y.mjs': P, 'products/z.mjs': P }, ['b.mjs', 'c.mjs']],
  ['X2', { 'a.mjs': "const m = { p: './missing.mjs' }\nimport(m.p)\nexport const after = missingGlobal\n" }, ['a.mjs']],
  ['X3', { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'node_modules/pkgu/package.json': pkg('pkgu', { exports: './lib/index.js' }), 'node_modules/pkgu/lib/index.js': P }, ['a.mjs'], [{ key: 'node_modules/pkgu', manifest: 'node_modules/pkgu/package.json', ...MATCH }]],
  ['R-resolution', { 'entry.mjs': imp('missingpkg') }],
  ['R-format', { 'entry.mjs': imp('./data.json'), 'data.json': '{}' }],
  ['R-interop', { 'entry.mjs': imp('./a.cjs'), 'a.cjs': 'module.exports=1\n' }],
  ['R-unresolved', { 'entry.mjs': imp('pr'), 'node_modules/pr/package.json': pkg('pr', { exports: { './x': './x.js' } }) }],
  ['R-name', { 'entry.mjs': imp('pm'), 'node_modules/pm/package.json': pkg('other', { exports: './i.js' }), 'node_modules/pm/i.js': P }],
  ['R-enoent', { 'entry.mjs': imp('./missing.mjs') }],
  ['R-product', { 'entry.mjs': imp('./products/x.mjs'), 'products/x.mjs': P }],
  ['F-categories', { 'entry.mjs': 'async function* a({ y }, q = 2, ...z) { return z }\nfunction () { return 1 }\nexport default 1\n' }],
  ['Y-cut-states', { 'a.mjs': 'const o = { a: 1 }\nconst b = o.a\nexport const c = b\n' }, ['a.mjs'], null, { maxStates: 6 }],
  ['Y-cut-union', { 'a.mjs': 'const o = { a: 1 }\nexport const c = o.a\n' }, ['a.mjs'], null, { maxUnionValues: 0 }]
]
const CODE =
  "import fs from 'node:fs';import{pathToFileURL}from'node:url';const[engine]=process.argv.slice(1);" +
  "const req=JSON.parse(fs.readFileSync(0,'utf8'));const e=await import(pathToFileURL(engine).href);" +
  'process.stdout.write(JSON.stringify(req.map((c)=>e[c.method](...c.args))))'
function call(engine, reqs) {
  const p = spawnSync(NODE, ['--input-type=module', '-e', CODE, engine], { input: JSON.stringify(reqs), encoding: 'utf8', cwd: ROOT,
    env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', TMPDIR: ROOT }, timeout: 1800000, maxBuffer: 256 * 1024 ** 2 })
  if (p.status !== 0) throw Error('engine call failed: ' + p.stderr)
  return JSON.parse(p.stdout)
}
const inputs = cases.map(([id, files, starts, installed, limits]) => {
  const dir = path.join(ROOT, id)
  for (const [rel, text] of Object.entries({ 'package.json': ROOTPKG, ...files })) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  return { root: fs.realpathSync(dir), starts: starts || ['entry.mjs'], origins: [], installed: installed || [], ...(limits ? { limits } : {}) }
})
const censusReq = inputs.map((i) => ({ method: 'analyzeSemanticBoundary', args: [i, { refusalCensus: true }] }))
const normalReq = inputs.map((i) => ({ method: 'runSemanticBoundary', args: [i] }))
const c3 = call(V3, censusReq), c4 = call(V4, censusReq), n3 = call(V3, normalReq), n4 = call(V4, normalReq)
const EDGE = new Set(['UNKNOWN_RESOLUTION', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_EXTERNAL_PATH', 'UNKNOWN_FORMAT', 'UNKNOWN_MODULE_INTEROP', 'UNKNOWN_AMBIGUOUS_RESOLUTION', 'UNKNOWN_UNSUPPORTED_EXPORTS', 'UNKNOWN_UNRESOLVED_EXPORT', 'UNKNOWN_BLOCKED_EXPORT', 'UNKNOWN_EXPORTS_DEPTH', 'UNKNOWN_EXACT_EXPORTS_TARGET', 'UNKNOWN_TARGET_URL', 'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION', 'UNKNOWN_PACKAGE_SELF_REFERENCE', 'UNKNOWN_PACKAGE_SCOPE', 'UNKNOWN_PACKAGE_NAME', 'UNKNOWN_PACKAGE_ESCAPE', 'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST', 'UNKNOWN_CJS_FILE_PACKAGE', 'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY', 'UNKNOWN_WORKSPACE_CONFIG', 'UNKNOWN_WORKSPACE_LINK', 'UNKNOWN_SYMLINK', 'UNKNOWN_ANCESTOR_SYMLINK', 'UNKNOWN_ANCESTOR_FORMAT', 'UNKNOWN_LINK_FORMAT', 'UNKNOWN_METADATA_ENCODING', 'UNKNOWN_ENCODING', 'UNKNOWN_INVALID_MANIFEST', 'UNKNOWN_PATH', 'UNKNOWN_PRODUCT_TARGET', 'UNKNOWN_ACQUISITION_ENOENT', 'UNKNOWN_ACQUISITION_ENOTDIR', 'UNKNOWN_ACQUISITION_ELOOP', 'UNKNOWN_ACQUISITION_EACCES', 'UNKNOWN_ACQUISITION_EISDIR'])
const ENVELOPE = new Set(['UNKNOWN_ANALYSIS_LIMIT', 'UNKNOWN_REVALIDATION', 'UNKNOWN_WORKER_ERROR', 'UNKNOWN_INVALID_WORKER_RESULT', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_INSTALLED_REFERENCE'])
const T = (u) => JSON.stringify([u.file, u.reason, u.detail])
const rows = cases.map(([id], i) => {
  const censusEqual = JSON.stringify([c3[i].unknowns, c3[i].violations]) === JSON.stringify([c4[i].unknowns, c4[i].violations])
  const v4 = new Set(n4[i].unknowns.map(T))
  const classified = n3[i].unknowns.map((u) => {
    if (ENVELOPE.has(u.reason)) return ['envelope', u]
    if (v4.has(T(u))) return ['persisted', u]
    if (u.file === '' && EDGE.has(u.reason) && n4[i].unknowns.some((x) => x.file && x.reason === u.reason && x.detail === u.detail)) return ['exception1', u]
    if (u.reason === 'UNKNOWN_COMPILED_PROVENANCE' && u.file.split('/').includes('node_modules')) return ['exception2', u]
    if (u.reason === 'UNKNOWN_FUNCTION' && u.detail === '' && n4[i].unknowns.some((x) => x.file === u.file && x.reason === u.reason && x.detail)) return ['exception3', u]
    return ['defect', u]
  })
  const vc = (o) => o.violations.map((v) => JSON.stringify(v))
  const v3v = vc(n3[i]), v4v = vc(n4[i])
  const violationsContained = v3v.every((v) => v4v.filter((x) => x === v).length >= v3v.filter((x) => x === v).length)
  return { case: id, censusEqual, census: { v3: c3[i].unknowns.map(T), v4: c4[i].unknowns.map(T) },
    normal: { v3Status: n3[i].status, v4Status: n4[i].status, v3Kernel: n3[i].kernelVersion, v4Kernel: n4[i].kernelVersion,
      v3: n3[i].unknowns.map(T), v4: n4[i].unknowns.map(T), classes: classified.map(([k, u]) => [k, T(u)]),
      defects: classified.filter(([k]) => k === 'defect').map(([, u]) => T(u)), v3Violations: v3v, v4Violations: v4v, violationsContained,
      v4Phases: n4[i].phases, v4Proofs: n4[i].proofs.length } }
})
const out = { task: 'HISO005-P2-BUILD-0241', observedAt: new Date().toISOString(), v3: { engine: V3, sha256: sha(fs.readFileSync(V3)) }, v4: { engine: V4, sha256: sha(fs.readFileSync(V4)) },
  fixtureRoot: ROOT, cases: rows.length, censusAllEqual: rows.every((r) => r.censusEqual), conservationDefects: rows.flatMap((r) => r.normal.defects.map((d) => [r.case, d])),
  violationsAllContained: rows.every((r) => r.normal.violationsContained), rows }
out.status = out.censusAllEqual && !out.conservationDefects.length && out.violationsAllContained ? 'PASS' : 'FAIL'
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify({ status: out.status, censusAllEqual: out.censusAllEqual, conservationDefects: out.conservationDefects, violationsAllContained: out.violationsAllContained }))
