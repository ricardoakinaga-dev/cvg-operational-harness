// P3: physical probes of the candidate installed recipe (a5b8a888) on synthetic
// git repos under the review-r1 runtime. Usage: node p3-installed-probe.mjs <case> <workdir>
//   order  : paged listing (root + nested) vs full `ls-tree -r -l -z` order/identity
//   colon  : top-level tracked tree named ':big' (with a tracked symlink) when the root pages
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const { buildInstalledReference } = await import(CAND + '/scripts/build-installed-reference.mjs')
const { canonicalJson, pinnedToolchainLocation } = await import(CAND + '/scripts/boundary-installed-identity.mjs')
const { referenceEnvironment } = await import(CAND + '/scripts/boundary-reference-process.mjs')
const NODE = pinnedToolchainLocation().node
const [which, work] = process.argv.slice(2)
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d) }
const json = (f, v) => write(f, JSON.stringify(v))
const git = (root, ...args) => execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@invalid.example', ...args], { cwd: root, env: referenceEnvironment(NODE), encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
// copy of excluded() from the candidate recipe (unchanged by the diff)
const excluded = (name) => name.split('/').some((p) => ['node_modules', 'dist', '.git', '.ssh', '.aws', '.gnupg', '.agent', '.npm', 'coverage', 'test-results'].includes(p) || /^(\.env(?:\..*)?|\.netrc|\.npm-token|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(p))
const LONG = 's'.repeat(200)
function deepFiles(root, top, segments, count) {
  const dir = path.join(root, top, ...Array(segments).fill(LONG))
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(4, '0')), '')
}
function fixture() {
  fs.rmSync(work, { recursive: true, force: true }); fs.mkdirSync(work, { recursive: true })
  const sourceRoot = path.join(work, 'source'), cacheSource = path.join(work, 'cache-source')
  fs.mkdirSync(sourceRoot); fs.mkdirSync(cacheSource)
  const staging = path.join(work, 'fixture-safe'), pkg = path.join(staging, 'package')
  fs.mkdirSync(pkg, { recursive: true })
  json(path.join(pkg, 'package.json'), { name: 'fixture-safe', version: '1.0.0' })
  write(path.join(pkg, 'index.js'), 'module.exports = 1\n')
  const tar = path.join(work, 'fixture-safe.tgz')
  execFileSync('/usr/bin/tar', ['-czf', tar, '-C', staging, 'package'], { env: referenceEnvironment(NODE) })
  const payload = fs.readFileSync(tar), hex = createHash('sha512').update(payload).digest('hex')
  const integrity = 'sha512-' + Buffer.from(hex, 'hex').toString('base64')
  write(path.join(cacheSource, '_cacache/content-v2/sha512', hex.slice(0, 2), hex.slice(2, 4), hex.slice(4)), payload)
  const manifest = { name: 'recipe-probe', version: '1.0.0', dependencies: { 'fixture-safe': '1.0.0' } }
  json(path.join(sourceRoot, 'package.json'), manifest)
  json(path.join(sourceRoot, 'package-lock.json'), { name: manifest.name, version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: '1.0.0', dependencies: manifest.dependencies }, 'node_modules/fixture-safe': { version: '1.0.0', resolved: 'https://registry.npmjs.org/fixture-safe/-/fixture-safe-1.0.0.tgz', integrity } } })
  return { sourceRoot, cacheSource, outputRoot: path.join(work, 'output') }
}
function commitAll(f) {
  git(f.sourceRoot, 'init', '-q'); git(f.sourceRoot, 'add', '-f', '--', '.'); git(f.sourceRoot, 'commit', '-q', '-m', 'probe')
  f.commit = git(f.sourceRoot, 'rev-parse', 'HEAD')
  const full = execFileSync('/usr/bin/git', ['ls-tree', '-r', '-l', '-z', f.commit], { cwd: f.sourceRoot, env: referenceEnvironment(NODE), maxBuffer: 256 * 1024 * 1024 })
  return full
}
function expectedFromFull(full) {
  const rows = full.toString('utf8').split('\0').filter(Boolean).map((line) => { const m = /^(\d{6}) (\w+) ([a-f0-9]{40})\s+(\S+)\t(.+)$/.exec(line); return { mode: m[1], type: m[2], oid: m[3], size: m[4], name: m[5] } })
  const files = rows.filter(({ name }) => !excluded(name))
  return { rows, files, sourceSha256: sha256(canonicalJson(files.map(({ name, oid, mode, size }) => ({ path: name, oid, mode, size: Number(size) })))) }
}
function snapshotFiles(root) { const out = []; const walk = (d) => { for (const it of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, it.name); if (it.name === 'node_modules' && d === root) continue; if (it.isDirectory()) walk(p); else out.push(path.relative(root, p) + (it.isSymbolicLink() ? ' (symlink)' : '')) } }; walk(root); return out }
const f = fixture()
if (which === 'order') {
  // root pages (> 8 MiB), 'bulk' pages, siblings stress git tree order ('-' < '.' < '/' < '0')
  for (let i = 0; i < 26; i++) deepFiles(f.sourceRoot, 'bulk/' + String(i).padStart(2, '0'), 17, 100)
  for (const n of ['bulk-a', 'bulk.b', 'bulk0/x', 'bulk/a-b', 'bulk/a/x', 'bulk/a.c', 'bulk/a0', 'bulk/zz-tail', 'aaa', 'zzz/y']) write(path.join(f.sourceRoot, n), n + '\n')
} else if (which === 'colon') {
  for (let i = 0; i < 26; i++) deepFiles(f.sourceRoot, ':big/' + String(i).padStart(2, '0'), 17, 100)
  fs.symlinkSync('/etc/passwd', path.join(f.sourceRoot, ':big/link'))
} else if (which === 'nonutf8' || which === 'nonutf8-nopage') {
  // top-level tracked tree whose name is not valid UTF-8 (byte 0xff + 'big')
  if (which === 'nonutf8') for (let i = 0; i < 26; i++) deepFiles(f.sourceRoot, 'tmpbig/' + String(i).padStart(2, '0'), 17, 100)
  else write(path.join(f.sourceRoot, 'tmpbig/small'), 'x')
  fs.renameSync(path.join(f.sourceRoot, 'tmpbig'), Buffer.concat([Buffer.from(f.sourceRoot + '/'), Buffer.from([0xff]), Buffer.from('big')]))
} else if (which === 'small') {
  for (const n of ['aaa', 'docs/x.md', 'docs/y/z.md']) write(path.join(f.sourceRoot, n), n + '\n')
} else throw new Error('case')
const full = commitAll(f)
const expected = expectedFromFull(full)
const report = { case: which, commit: f.commit.slice(0, 12), fullListingBytes: full.length, over8MiB: full.length > 8 * 1024 * 1024, fullRows: expected.rows.length, fullModes: [...new Set(expected.rows.map((r) => r.mode))], fullSymlinks: expected.rows.filter((r) => r.mode === '120000').map((r) => r.name), expectedSourceSha256: expected.sourceSha256 }
const started = Date.now()
try {
  const result = await buildInstalledReference({ sourceRoot: f.sourceRoot, cacheSource: f.cacheSource, outputRoot: f.outputRoot, commit: f.commit })
  const snap = snapshotFiles(result.receipt.root)
  const expectedNames = expected.files.map((x) => x.name).sort()
  Object.assign(report, { status: 'BUILT', receiptSourceSha256: result.receipt.recipe.sourceSha256, sourceSha256EqualsFullListing: result.receipt.recipe.sourceSha256 === expected.sourceSha256, snapshotFileCount: snap.length, expectedFileCount: expectedNames.length, snapshotMissing: expectedNames.filter((n) => !snap.includes(n)).slice(0, 5), snapshotMissingCount: expectedNames.filter((n) => !snap.includes(n)).length, processLogs: fs.readdirSync(path.join(f.outputRoot, 'logs')).filter((n) => /^\d+\.stderr\.log$/.test(n)).length, packages: result.receipt.packages.length })
} catch (error) {
  Object.assign(report, { status: 'REFUSED', code: error.code, message: String(error.message).slice(0, 200), failure: fs.existsSync(path.join(f.outputRoot, 'failure.json')) ? JSON.parse(fs.readFileSync(path.join(f.outputRoot, 'failure.json'), 'utf8')).code : null })
}
report.elapsedMs = Date.now() - started
if (report.snapshotMissing) report.snapshotMissing = report.snapshotMissing.map((n) => (n.length > 60 ? n.slice(0, 60) + '...' : n))
// Optional: same fixture through the BASE (228e7918) recipe extracted read-only by `git show`.
if (process.env.PROBE_BASE_RECIPE && report.status === 'BUILT') {
  const base = await import(process.env.PROBE_BASE_RECIPE)
  const outB = path.join(work, 'output-base')
  const cand = JSON.parse(fs.readFileSync(path.join(f.outputRoot, 'reference.json'), 'utf8'))
  await base.buildInstalledReference({ sourceRoot: f.sourceRoot, cacheSource: f.cacheSource, outputRoot: outB, commit: f.commit })
  // compare the canonical receipt FILES (same key order on both sides)
  const rb = { receipt: JSON.parse(fs.readFileSync(path.join(outB, 'reference.json'), 'utf8')) }
  const flat = (o, p = '', out = {}) => { if (o && typeof o === 'object') { for (const k of Object.keys(o)) flat(o[k], p + '/' + k, out) } else out[p] = o; return out }
  const fa = flat(cand), fb = flat(rb.receipt)
  report.allDifferingLeaves = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter((k) => String(fa[k]).split(f.outputRoot).join('<OUT>') !== String(fb[k]).split(outB).join('<OUT>'))
  const pick = (r) => ({ sourceSha256: r.recipe.sourceSha256, argv: r.recipe.argv.map((a) => String(a).replace(/\/output(-base)?\//, '/<OUT>/')), cachePayloads: r.recipe.cachePayloads, cacheUnavailable: r.recipe.cacheUnavailable, packages: r.packages, limits: r.limits, entries: r.usage.entries, regularBytes: r.usage.regularBytes, maxDepth: r.usage.maxDepth, unavailable: r.unavailable })
  const logs = (o) => fs.readdirSync(path.join(o, 'logs')).filter((n) => /^\d+\.stderr\.log$/.test(n)).length
  report.baseComparison = { stableFieldsEqual: JSON.stringify(pick(cand)) === JSON.stringify(pick(rb.receipt)), processLogs: { candidate: logs(f.outputRoot), base: logs(outB) } }
}
console.log(JSON.stringify(report, null, 2))
