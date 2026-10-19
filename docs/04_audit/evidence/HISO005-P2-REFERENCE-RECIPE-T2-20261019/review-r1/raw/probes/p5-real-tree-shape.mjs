// P5: read-only shape of the real tree at the base commit, replaying the paging
// decision of the compiled recipe (format %(objectmode) %(path), 8 MiB buffer)
// to find the largest array spread by `result.push(...listTree(child))`.
import { spawnSync } from 'node:child_process'
const [repo, commit] = process.argv.slice(2)
const env = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' }
const r = spawnSync('/usr/bin/git', ['-C', repo, 'ls-tree', '-r', '--format=%(objectmode) %(path)', commit], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const lines = r.stdout.trim().split('\n')
const CAP = 8 * 1024 * 1024
// subtree stats
const bytes = new Map(), count = new Map()
for (const line of lines) {
  const p = line.slice(line.indexOf(' ') + 1).split('/')
  for (let i = 1; i < p.length; i++) {
    const d = p.slice(0, i).join('/')
    bytes.set(d, (bytes.get(d) ?? 0) + line.length + 1)
    count.set(d, (count.get(d) ?? 0) + 1)
  }
}
const total = r.stdout.length
const paged = [...bytes].filter(([, b]) => b > CAP).map(([d]) => d)
// spread happens for every child tree of a paged node (root included when total > CAP)
const pagedSet = new Set(paged); if (total > CAP) pagedSet.add('')
let maxSpread = { dir: null, lines: 0 }
for (const [d, n] of count) {
  const parent = d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : ''
  if (pagedSet.has(parent) && n > maxSpread.lines) maxSpread = { dir: d, lines: n }
}
const topColon = [...new Set(lines.map((l) => l.slice(l.indexOf(' ') + 1).split('/')[0]))].filter((n) => n.startsWith(':'))
console.log(JSON.stringify({ commit: commit.slice(0, 12), totalLines: lines.length, totalBytes: total, rootPaged: total > CAP, pagedDirs: paged.map((d) => ({ dir: d, bytes: bytes.get(d), lines: count.get(d) })), maxSpread, nodeSpreadLimitObserved: 125315, topLevelNamesStartingWithColon: topColon }, null, 2))
