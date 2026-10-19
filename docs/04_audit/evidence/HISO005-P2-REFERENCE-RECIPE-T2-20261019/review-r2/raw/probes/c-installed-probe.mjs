// C: physical probes of the installed recipe on synthetic git repos (review-r2 runtime).
// Usage: node c-installed-probe.mjs <case> <workdir>   (env PROBE_SCRIPTS=<dir with scripts/>; default = candidate d6203875)
// The loader hook records every owned process argv (and ls-tree stdout) without touching the candidate.
import { register } from 'node:module'
register(new URL('./hooks.mjs', import.meta.url))
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const SCRIPTS = process.env.PROBE_SCRIPTS ?? CAND
const { buildInstalledReference } = await import(SCRIPTS + '/scripts/build-installed-reference.mjs')
const { canonicalJson, pinnedToolchainLocation } = await import(CAND + '/scripts/boundary-installed-identity.mjs')
const { referenceEnvironment } = await import(CAND + '/scripts/boundary-reference-process.mjs')
const NODE = pinnedToolchainLocation().node
const [which, work] = process.argv.slice(2)
const sha256 = (b) => createHash('sha256').update(b).digest('hex')
const write = (f, d) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, d) }
const json = (f, v) => write(f, JSON.stringify(v))
const G = ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@invalid.example', '-c', 'commit.gpgsign=false']
const git = (root, args, input) => execFileSync('/usr/bin/git', [...G, ...args], { cwd: root, env: referenceEnvironment(NODE), encoding: 'utf8', input, maxBuffer: 256 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const excluded = (name) => name.split('/').some((p) => ['node_modules', 'dist', '.git', '.ssh', '.aws', '.gnupg', '.agent', '.npm', 'coverage', 'test-results'].includes(p) || /^(\.env(?:\..*)?|\.netrc|\.npm-token|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(p))
const LONG = 's'.repeat(200)
function deepFiles(root, top, segments, count) {
  const dir = path.join(root, top, ...Array(segments).fill(LONG))
  fs.mkdirSync(dir, { recursive: true })
  for (let i = 0; i < count; i++) fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(4, '0')), '')
}
const big = (root, top) => { for (let i = 0; i < 26; i++) deepFiles(root, top + '/' + String(i).padStart(2, '0'), 17, 100) }
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
  git(sourceRoot, ['init', '-q'])
  return { sourceRoot, cacheSource, outputRoot: path.join(work, 'output') }
}
const f = fixture()
const S = f.sourceRoot
let extraCommit = null
if (which === 'order') {
  big(S, 'bulk')
  for (const n of ['bulk-a', 'bulk.b', 'bulk0/x', 'bulk/a-b', 'bulk/a/x', 'bulk/a.c', 'bulk/a0', 'bulk/zz-tail', 'aaa', 'zzz/y', 'a*/glob', 'sp ace/x', 'q?/y']) write(path.join(S, n), n + '\n')
} else if (which === 'colon' || which === 'colon-nopage') {
  if (which === 'colon') big(S, ':big'); else write(path.join(S, ':big/small'), 'x')
  fs.symlinkSync('/etc/passwd', path.join(S, ':big/link'))
  write(path.join(S, 'big/regular'), 'regular\n')
} else if (which === 'colon-testshape') {
  // same shape as the final test 'a magic-looking tree name never yields a silent partial receipt' (paged part)
  big(S, ':big'); write(path.join(S, 'big/plain.txt'), 'plain sibling')
} else if (which === 'colon-regular') {
  // paged ':big' with regular files only and a sibling 'big' holding the SAME relative names
  big(S, ':big'); big(S, 'big')
} else if (which === 'nonutf8' || which === 'nonutf8-nopage') {
  if (which === 'nonutf8') big(S, 'tmpbig'); else write(path.join(S, 'tmpbig/small'), 'x')
  write(path.join(S, 'plain/keep'), 'k')
  fs.renameSync(path.join(S, 'tmpbig'), Buffer.concat([Buffer.from(S + '/'), Buffer.from([0xff]), Buffer.from('big')]))
} else if (which === 'nonutf8-deep') {
  // root pages; the non-UTF-8 name sits inside a sub-page that succeeds (not a child listing)
  big(S, 'bulk')
  fs.mkdirSync(path.join(S, 'small'))
  fs.writeFileSync(Buffer.concat([Buffer.from(S + '/small/'), Buffer.from([0xfe]), Buffer.from('.txt')]), 'x')
} else if (which === 'empty-paged' || which === 'empty-nopage') {
  if (which === 'empty-paged') big(S, 'bulk'); else write(path.join(S, 'bulk/x'), 'x')
} else if (which === 'small') {
  for (const n of ['aaa', 'docs/x.md', 'docs/y/z.md']) write(path.join(S, n), n + '\n')
} else throw new Error('case')
git(S, ['--literal-pathspecs', 'add', '-f', '--', '.'])
git(S, ['commit', '-q', '-m', 'probe ' + which])
if (which.startsWith('empty-')) {
  // craft (plumbing only) a commit whose tree carries an EMPTY subtree 'bulk/empty' (git porcelain cannot create it)
  const emptyTree = git(S, ['mktree'], '')
  const rootEntries = git(S, ['ls-tree', 'HEAD']).split('\n')
  const bulkTree = git(S, ['rev-parse', 'HEAD:bulk'])
  const bulkEntries = git(S, ['ls-tree', bulkTree]).split('\n').concat([`040000 tree ${emptyTree}\tempty`])
  const newBulk = git(S, ['mktree'], bulkEntries.join('\n') + '\n')
  const newRoot = git(S, ['mktree'], rootEntries.map((l) => (l.endsWith('\tbulk') ? l.replace(bulkTree, newBulk) : l)).join('\n') + '\n')
  extraCommit = git(S, ['commit-tree', newRoot, '-p', 'HEAD', '-m', 'empty subtree'])
  git(S, ['update-ref', 'HEAD', extraCommit])
}
f.commit = git(S, ['rev-parse', 'HEAD'])
const full = execFileSync('/usr/bin/git', ['ls-tree', '-r', '-l', '-z', f.commit], { cwd: S, env: referenceEnvironment(NODE), maxBuffer: 256 * 1024 * 1024 })
const rows = full.toString('utf8').split('\0').filter(Boolean).map((line) => { const m = /^(\d{6}) (\w+) ([a-f0-9]{40})\s+(\S+)\t(.+)$/.exec(line); return { mode: m[1], type: m[2], oid: m[3], size: m[4], name: m[5] } })
const files = rows.filter(({ name }) => !excluded(name))
const expectedSourceSha256 = sha256(canonicalJson(files.map(({ name, oid, mode, size }) => ({ path: name, oid, mode, size: Number(size) }))))
const report = { case: which, scripts: SCRIPTS === CAND ? 'candidate d6203875' : SCRIPTS, commit: f.commit.slice(0, 12), fullListingBytes: full.length, over8MiB: full.length > 8 * 1024 * 1024, fullRows: rows.length, fullSymlinks: rows.filter((r) => r.mode === '120000').map((r) => r.name), fullHasNonUtf8: !Buffer.from(full.toString('utf8'), 'utf8').equals(full), expectedSourceSha256: expectedSourceSha256.slice(0, 16) }
const started = Date.now()
try {
  const result = await buildInstalledReference({ sourceRoot: f.sourceRoot, cacheSource: f.cacheSource, outputRoot: f.outputRoot, commit: f.commit })
  const snap = []; const walk = (d) => { for (const it of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, it.name); if (it.name === 'node_modules' && d === result.receipt.root) continue; if (it.isDirectory()) walk(p); else snap.push(path.relative(result.receipt.root, p)) } }; walk(result.receipt.root)
  const expectedNames = files.map((x) => x.name)
  Object.assign(report, { status: 'BUILT', receiptSourceSha256: result.receipt.recipe.sourceSha256.slice(0, 16), sourceSha256EqualsFullListing: result.receipt.recipe.sourceSha256 === expectedSourceSha256, snapshotFiles: snap.length, expectedFiles: expectedNames.length, snapshotMissingCount: expectedNames.filter((n) => !snap.includes(n)).length, packages: result.receipt.packages.length })
  report._receiptFile = path.join(f.outputRoot, 'reference.json')
} catch (error) {
  Object.assign(report, { status: 'REFUSED', code: error.code, message: String(error.message).slice(0, 160), failureJsonCode: fs.existsSync(path.join(f.outputRoot, 'failure.json')) ? JSON.parse(fs.readFileSync(path.join(f.outputRoot, 'failure.json'), 'utf8')).code : null })
}
report.elapsedMs = Date.now() - started
const log = globalThis.__ownedLog ?? []
const lsRows = log.filter((r) => r.args.includes('ls-tree'))
report.ownedProcesses = log.length
report.lsTree = lsRows.map((r) => ({ argv: r.args.slice(4).map((a) => (/^[a-f0-9]{40}$/.test(a) ? '<commit>' : a.length > 40 ? a.slice(0, 40) + '...' : a)).join(' '), ok: r.ok, code: r.code ?? null, bytes: r.stdout?.length ?? null }))
report.literalOnlyWithPathspec = lsRows.every((r) => r.args.includes('--literal-pathspecs') === r.args.includes('--'))
const firstFail = log.find((r) => r.ok === false && r.code !== 'PROCESS_OUTPUT_LIMIT')
report.firstNonPagingFailure = firstFail ? { tool: firstFail.tool, argvHead: firstFail.args.slice(4, 9).map((a) => (/^[a-f0-9]{40}$/.test(a) ? '<commit>' : a.length > 40 ? a.slice(0, 40) + '...' : a)), code: firstFail.code } : null
const archives = log.filter((r) => r.args.includes('archive'))
report.archiveRuns = { total: archives.length, ok: archives.filter((r) => r.ok).length }
// Replay of the captured pages (order-preserving) against the full listing
if (lsRows.length && !(SCRIPTS !== CAND)) {
  let i = 0; const out = []; const listingRows = lsRows.slice(0)
  // skip non-listing ls-tree rows: none besides listing in this recipe
  const replay = () => {
    const r = listingRows[i++]
    if (!r) throw new Error('replay underflow')
    if (r.ok) { out.push(r.stdout); return }
    const ch = listingRows[i++]
    if (!ch?.ok) throw new Error('children failed')
    for (const line of ch.stdout.toString('utf8').split('\0').filter(Boolean)) { if (/^\d{6} tree /.test(line)) replay(); else out.push(Buffer.from(line + '\0', 'utf8')) }
  }
  try { replay(); report.replayEqualsFullListing = Buffer.concat(out).equals(full); report.replayConsumedAllListingRows = i === listingRows.length } catch (e) { report.replay = 'n/a: ' + e.message }
}
console.log(JSON.stringify(report, null, 2))
if (process.env.PROBE_DUMP_ARGV) fs.writeFileSync(process.env.PROBE_DUMP_ARGV, JSON.stringify(log.map((r) => ({ tool: r.tool, args: r.args.map((a) => (/^[a-f0-9]{40}$/.test(a) ? '<commit>' : a.split(f.outputRoot).join('<OUT>').split(f.sourceRoot).join('<SRC>'))), ok: r.ok, code: r.code ?? null })), null, 1))
