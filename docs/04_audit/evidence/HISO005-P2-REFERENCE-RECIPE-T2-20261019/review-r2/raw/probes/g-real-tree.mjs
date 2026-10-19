// G: read-only facts of the real tree (git ls-tree only) and comparison with the installed
// reference receipts built by the lead (read only). Usage: node g-real-tree.mjs <repo> <commit> <receipt...>
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const CAND = '/mnt/dados/cvg-work/cvg-hiso005-recipe-t2-20261019'
const { canonicalJson } = await import(CAND + '/scripts/boundary-installed-identity.mjs')
const [repo, commit, ...receipts] = process.argv.slice(2)
const env = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const git = (args, enc) => { const r = spawnSync('/usr/bin/git', ['-C', repo, ...args], { env, encoding: enc, maxBuffer: 512 * 1024 * 1024 }); if (r.status !== 0) throw new Error(String(r.stderr)); return r.stdout }
const full = git(['ls-tree', '-r', '-l', '-z', commit], 'buffer')
const text = full.toString('utf8')
const utf8RoundTrip = Buffer.from(text, 'utf8').equals(full)
const rows = text.split('\0').filter(Boolean).map((line) => { const m = /^(\d{6}) (\w+) ([a-f0-9]{40})\s+(\S+)\t(.+)$/.exec(line); return { mode: m[1], type: m[2], oid: m[3], size: m[4], name: m[5] } })
const excluded = (name) => name.split('/').some((p) => ['node_modules', 'dist', '.git', '.ssh', '.aws', '.gnupg', '.agent', '.npm', 'coverage', 'test-results'].includes(p) || /^(\.env(?:\..*)?|\.netrc|\.npm-token|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(p))
const files = rows.filter(({ name }) => !excluded(name))
const digest = createHash('sha256').update(canonicalJson(files.map(({ name, oid, mode, size }) => ({ path: name, oid, mode, size: Number(size) })))).digest('hex')
const compiledFmt = git(['ls-tree', '-r', '--format=%(objectmode) %(path)', commit], 'utf8')
const compiledLines = compiledFmt.trim().split('\n')
const trees = git(['ls-tree', '-r', '-t', '--format=%(objecttype) %(objectname) %(path)', commit], 'utf8').trim().split('\n').filter((l) => l.startsWith('tree '))
const EMPTY = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
// paging decisions with the 8 MiB cap (installed: -l -z format; compiled: %(objectmode) %(path))
const CAP = 8 * 1024 * 1024
const subtreeBytes = (lines, nameOf) => { const m = new Map(); for (const l of lines) { const p = nameOf(l).split('/'); for (let i = 1; i < p.length; i++) { const d = p.slice(0, i).join('/'); m.set(d, (m.get(d) ?? 0) + Buffer.byteLength(l) + 1) } } return m }
const instBytes = subtreeBytes(text.split('\0').filter(Boolean), (l) => l.slice(l.indexOf('\t') + 1))
const compBytes = subtreeBytes(compiledLines, (l) => l.slice(l.indexOf(' ') + 1))
const report = {
  commit: commit.slice(0, 12),
  rows: rows.length, bytesInstalledFormat: full.length, bytesCompiledFormat: Buffer.byteLength(compiledFmt),
  modes: [...new Set(rows.map((r) => r.mode))],
  utf8RoundTrip,
  topLevelStartingWithColon: [...new Set(rows.map((r) => r.name.split('/')[0]))].filter((n) => n.startsWith(':')),
  anyComponentStartingWithColon: rows.filter((r) => r.name.split('/').some((p) => p.startsWith(':'))).length,
  compiledQuotedNames: compiledLines.filter((l) => l.slice(l.indexOf(' ') + 1).startsWith('"')).length,
  emptySubtrees: trees.filter((l) => l.split(' ')[1] === EMPTY).length,
  treesTotal: trees.length,
  namesWithGlobChars: rows.filter((r) => /[*?[]/.test(r.name)).map((r) => r.name).slice(0, 5),
  pagedDirsInstalled: [...instBytes].filter(([, b]) => b > CAP).map(([d, b]) => ({ dir: d, bytes: b })),
  pagedDirsCompiled: [...compBytes].filter(([, b]) => b > CAP).map(([d, b]) => ({ dir: d, bytes: b })),
  filesAfterExclusion: files.length,
  fullListingDigest: digest.slice(0, 16)
}
report.receipts = receipts.map((file) => { const r = JSON.parse(fs.readFileSync(file, 'utf8')); return { file: file.replace(/^.*runtime-20261019\//, '<RUNTIME>/'), commit: r.commit.slice(0, 12), sourceSha256: r.recipe.sourceSha256.slice(0, 16), equalsFullListingDigest: r.recipe.sourceSha256 === digest } })
console.log(JSON.stringify(report, null, 2))
