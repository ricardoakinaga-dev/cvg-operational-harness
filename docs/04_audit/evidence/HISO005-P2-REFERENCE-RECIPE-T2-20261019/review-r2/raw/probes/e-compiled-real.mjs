// E: the candidate compiled recipe on the REAL tree (228e7918), in-process, with the loader hook
// stopping right before `git archive` (no 4 GB archive, nothing written outside review-r2).
// Usage: node e-compiled-real.mjs <sourceRoot at 228e7918> <commit> <depRoot> <installed-reference.json> <outputRoot>
import { register } from 'node:module'
register(new URL('./hooks.mjs', import.meta.url))
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const { buildCompiledReference } = await import(CAND + '/scripts/boundary-semantic-compiled.mjs')
const [sourceRoot, commit, depRoot, manifestPath, outputRoot] = process.argv.slice(2)
const hash = (b) => createHash('sha256').update(b).digest('hex')
const installedReference = { manifestPath, expectedSha256: hash(fs.readFileSync(manifestPath)) }
globalThis.__cpLog = []; globalThis.__stopBeforeArchive = true
const t0 = Date.now()
const report = { commit: commit.slice(0, 12) }
try { buildCompiledReference({ sourceRoot, commit, outputRoot, dependenciesRoot: depRoot, installedReference }); report.build = 'BUILT?!' }
catch (e) { report.build = { code: e.code ?? null, message: String(e.message).slice(0, 120) } }
report.elapsedMs = Date.now() - t0
const env = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const fullRaw = spawnSync('/usr/bin/git', ['ls-tree', '-r', '--format=%(objectmode) %(path)', commit], { cwd: sourceRoot, env, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }).stdout
const full = fullRaw.trim().split('\n')
const ls = globalThis.__cpLog.filter((r) => r.args.includes('ls-tree'))
report.lsTree = { calls: ls.length, enobufs: ls.filter((r) => r.errorCode === 'ENOBUFS').map((r) => r.args.slice(-1)[0] === commit ? '<root>' : r.args.slice(-1)[0]), literalOnlyWithPathspec: ls.every((r) => r.args.includes('--literal-pathspecs') === r.args.includes('--')), rootArgv: ls[0].args.slice(1).map((a) => (a === commit ? '<commit>' : a)).join(' ') }
let i = 0; const acc = []
const replay = () => {
  const r = ls[i++]; if (!r) throw new Error('underflow')
  if (r.status === 0 && !r.errorCode) { for (const l of r.stdout.trim().split('\n')) acc.push(l); return }
  const ch = ls[i++]; if (!ch || ch.status !== 0) throw new Error('children failed')
  for (const line of ch.stdout.split('\n').filter(Boolean)) { const a = line.indexOf(' '), b = line.indexOf(' ', a + 1); if (line.slice(0, a) === 'tree') replay(); else acc.push(line.slice(a + 1)) }
}
try { replay(); report.replay = { equalsFullListing: acc.length === full.length && acc.every((l, k) => l === full[k]), consumedAll: i === ls.length, lines: acc.length, fullLines: full.length } } catch (e) { report.replay = 'n/a: ' + e.message }
report.stoppedAtArchive = globalThis.__cpLog.some((r) => r.stopped)
const failureFile = outputRoot + '/failure.json'
if (fs.existsSync(failureFile)) {
  const failure = JSON.parse(fs.readFileSync(failureFile, 'utf8'))
  const rows = failure.commands.filter((r) => r.argv.includes('ls-tree'))
  // compacted rows keep digest/size; verify them against the captured stdout
  let verified = 0, mismatched = 0
  rows.forEach((row, k) => { if (row.stdoutSha256) { if (row.stdoutSha256 === hash(ls[k].stdout) && row.stdoutBytes === Buffer.byteLength(ls[k].stdout)) verified++; else mismatched++ } })
  report.failureJson = { code: failure.code, bytes: fs.statSync(failureFile).size, lsTreeRows: rows.length, withStdoutKept: rows.filter((r) => r.stdout).length, withDigest: rows.filter((r) => r.stdoutSha256).length, discarded: rows.filter((r) => 'stdoutDiscardedBytes' in r).length, digestsVerified: verified, digestsMismatched: mismatched }
}
console.log(JSON.stringify(report, null, 2))
