// HISO005-P2-BUILD-0241 — recon controls C1–C6, X1–X3 and Y1–Y2 replayed on a
// given engine (v3 base or v4 candidate). Fixtures live in a private absolute
// directory; each case runs runSemanticBoundary in a fresh pinned Node whose
// load hook refuses any file: URL outside the engine directory (targets are
// parsed as bytes only). Synthetic MATCH entries are control premises only.
// Usage: <node22.23.2> controls.mjs <engine.mjs> <private-fixture-root> <out.json>
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const [ENGINE, base, outFile] = process.argv.slice(2)
const NODE = process.execPath
const sha = (b) => createHash('sha256').update(b).digest('hex')
if (!path.isAbsolute(base)) throw Error('private absolute fixture root required')
fs.rmSync(base, { recursive: true, force: true })
fs.mkdirSync(base, { recursive: true })
const fixtureRoot = fs.realpathSync(base)
const MATCH = { identityStatus: 'MATCH', referenceDigest: 'a'.repeat(64) }
const pkg = (name, extra = {}) => JSON.stringify({ name, version: '1.0.0', type: 'module', ...extra })
const ROOTPKG = JSON.stringify({ name: 'fixture-root', private: true, type: 'module' })
const P = 'export default 1\n'
const cases = [
  { id: 'C1-cross-module-abort', files: { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': 'export const x = missingGlobal\n' }, starts: ['a.mjs', 'b.mjs'] },
  { id: 'C1-cross-module-control', files: { 'a.mjs': P, 'b.mjs': 'export const x = missingGlobal\n' }, starts: ['a.mjs', 'b.mjs'] },
  { id: 'C2-intra-module-abort', files: { 'entry.mjs': "import fs from 'node:fs'\nconst y = missingGlobal\nexport default y\n" }, starts: ['entry.mjs'] },
  { id: 'C2-intra-module-control', files: { 'entry.mjs': 'const y = missingGlobal\nexport default y\n' }, starts: ['entry.mjs'] },
  { id: 'C3-installed-dist', files: { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': pkg('pkgd', { exports: './dist/index.js' }), 'node_modules/pkgd/dist/index.js': P }, starts: ['entry.mjs'], installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }] },
  { id: 'C3-installed-lib-control', files: { 'entry.mjs': "import v from 'pkgd'\nexport default v\n", 'node_modules/pkgd/package.json': pkg('pkgd', { exports: './lib/index.js' }), 'node_modules/pkgd/lib/index.js': P }, starts: ['entry.mjs'], installed: [{ key: 'node_modules/pkgd', manifest: 'node_modules/pkgd/package.json', ...MATCH }] },
  { id: 'C4-async-declared-unused', files: { 'entry.mjs': 'async function unused() {}\nexport default 1\n' }, starts: ['entry.mjs'] },
  { id: 'C4-default-param-declared-unused', files: { 'entry.mjs': 'function unused(a = 1) { return a }\nexport default 1\n' }, starts: ['entry.mjs'] },
  { id: 'C4-plain-declared-unused-control', files: { 'entry.mjs': 'function unused(a) { return a }\nexport default 1\n' }, starts: ['entry.mjs'] },
  { id: 'C5-browser-field', files: { 'entry.mjs': "import v from 'pkgb'\nexport default v\n", 'node_modules/pkgb/package.json': pkg('pkgb', { browser: './lib/index.js', exports: { default: './lib/index.js' } }), 'node_modules/pkgb/lib/index.js': P }, starts: ['entry.mjs'], installed: [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }] },
  { id: 'C5-no-browser-control', files: { 'entry.mjs': "import v from 'pkgb'\nexport default v\n", 'node_modules/pkgb/package.json': pkg('pkgb', { exports: { default: './lib/index.js' } }), 'node_modules/pkgb/lib/index.js': P }, starts: ['entry.mjs'], installed: [{ key: 'node_modules/pkgb', manifest: 'node_modules/pkgb/package.json', ...MATCH }] },
  { id: 'C6-body-only-violation-after-abort', files: { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n", 'products/x.mjs': P }, starts: ['a.mjs', 'b.mjs'] },
  { id: 'C6-body-only-violation-control', files: { 'a.mjs': P, 'b.mjs': "const m = { p: './products/x.mjs' }\nimport(m.p)\nexport default 1\n", 'products/x.mjs': P }, starts: ['a.mjs', 'b.mjs'] },
  { id: 'X1-two-body-product-edges', files: { 'b.mjs': "const m = { p: './products/x.mjs', q: './products/y.mjs' }\nimport(m.p)\nimport(m.q)\nexport default 1\n", 'c.mjs': "const n = { r: './products/z.mjs' }\nimport(n.r)\nexport default 1\n", 'products/x.mjs': P, 'products/y.mjs': P, 'products/z.mjs': P }, starts: ['b.mjs', 'c.mjs'] },
  { id: 'X2-body-only-missing-target', files: { 'a.mjs': "const m = { p: './missing.mjs' }\nimport(m.p)\nexport const after = missingGlobal\n" }, starts: ['a.mjs'] },
  { id: 'X3-installed-dist-unreached-check', files: { 'a.mjs': "import fs from 'node:fs'\nexport default 1\n", 'node_modules/pkgu/package.json': pkg('pkgu', { exports: './lib/index.js' }), 'node_modules/pkgu/lib/index.js': P }, starts: ['a.mjs'], installed: [{ key: 'node_modules/pkgu', manifest: 'node_modules/pkgu/package.json', ...MATCH }] },
  { id: 'X3-control-no-abort', files: { 'a.mjs': P, 'node_modules/pkgu/package.json': pkg('pkgu', { exports: './lib/index.js' }), 'node_modules/pkgu/lib/index.js': P }, starts: ['a.mjs'], installed: [{ key: 'node_modules/pkgu', manifest: 'node_modules/pkgu/package.json', ...MATCH }] },
  { id: 'Y1-maxStates-cut', files: { 'a.mjs': "const o = { a: 1 }\nconst b = o.a\nexport const c = b\n" }, starts: ['a.mjs'], limits: { maxStates: 6 }, twice: true },
  { id: 'Y1-control-no-cut', files: { 'a.mjs': "const o = { a: 1 }\nconst b = o.a\nexport const c = b\n" }, starts: ['a.mjs'], twice: true },
  { id: 'Y2-maxUnionValues-cut', files: { 'a.mjs': "const o = { a: 1 }\nexport const c = o.a\n" }, starts: ['a.mjs'], limits: { maxUnionValues: 0 }, twice: true }
]
const CALLER =
  "import{registerHooks}from'node:module';import{pathToFileURL}from'node:url';" +
  'const[engine,input]=process.argv.slice(1);const dir=engine.slice(0,engine.lastIndexOf("/"));let blocked=0;' +
  "registerHooks({load(u,c,next){if(u.startsWith('file:')&&!u.startsWith(pathToFileURL(dir+'/').href)){blocked++;throw Error('TARGET_LOAD_FORBIDDEN')}return next(u,c)}});" +
  'const{runSemanticBoundary}=await import(pathToFileURL(engine));const out=runSemanticBoundary(JSON.parse(input));' +
  'console.log(JSON.stringify({out,blockedCallerTargetLoads:blocked}))'
const results = []
for (const c of cases) {
  const dir = path.join(fixtureRoot, c.id)
  const files = { 'package.json': ROOTPKG, ...c.files }
  for (const [rel, text] of Object.entries(files)) {
    const p = path.join(dir, rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
  }
  const input = { root: fs.realpathSync(dir), starts: c.starts, origins: [], installed: c.installed || [], ...(c.limits ? { limits: c.limits } : {}) }
  const runs = []
  for (let i = 0; i < (c.twice ? 2 : 1); i++) {
    const p = spawnSync(NODE, ['--input-type=module', '-e', CALLER, ENGINE, JSON.stringify(input)], {
      cwd: input.root, encoding: 'utf8', env: { PATH: path.dirname(NODE) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }, timeout: 180000, maxBuffer: 64 * 1024 ** 2 })
    let o = null, blocked = null
    try { const j = JSON.parse(p.stdout); o = j.out; blocked = j.blockedCallerTargetLoads } catch {}
    const body = o ? { ...o } : null
    if (body) delete body.telemetry
    runs.push({ exitCode: p.status, stderr: p.stderr, status: o?.status ?? null, kernelVersion: o?.kernelVersion ?? null, proofs: o?.proofs?.length ?? null,
      unknowns: (o?.unknowns || []).map((u) => [u.file, u.reason, u.detail]), violations: o?.violations ?? null,
      usage: o ? { states: o.usage.states, contexts: o.usage.contexts, callDepth: o.usage.callDepth, unionValues: o.usage.unionValues } : null,
      phases: o?.phases, bodyCoverage: o?.bodyCoverage, validation: o?.validation ?? null, blocked, payloadSha256: body ? sha(JSON.stringify(body)) : null })
  }
  results.push({ case: c.id, input: { starts: c.starts, installed: c.installed || [], limits: c.limits || null }, runs, twoRunsEqual: c.twice ? runs[0].payloadSha256 === runs[1].payloadSha256 : null })
}
const out = { engine: ENGINE, engineSha256: sha(fs.readFileSync(ENGINE)), node: process.version, fixtureRoot, observedAt: new Date().toISOString(),
  synthetic: 'MATCH/referenceDigest são premissas sintéticas do controle, não identidade0234 real.', results }
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n')
console.log(JSON.stringify(results.map((r) => [r.case, r.runs[0].status, r.runs[0].kernelVersion, r.runs[0].unknowns.length, r.runs[0].violations?.length, r.runs[0].blocked, r.twoRunsEqual])))
