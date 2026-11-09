/**
 * Ledger freshness and size gate (backlog item P2 "documentação viva").
 *
 * Deterministic on purpose: no rule depends on today's date, so a long-lived PR
 * cannot fail for age alone. It enforces what made the ledgers unusable:
 *   1. each live ledger stays under a line cap (history goes to the archive);
 *   2. README "Estado atual" and the runtime state carry the same date;
 *   3. every archived ledger (`docs/08_runtime/archive/*_ate_*.md.txt`) that a
 *      live ledger points to still matches the SHA-256 recorded next to the
 *      pointer, so history stays byte-identical;
 *   4. the `main` SHA named by the runtime state exists in a full clone (skipped
 *      on shallow clones, reported as such).
 *
 * Usage: node scripts/check-ledgers.mjs [--root <dir>]
 * Exit 0 when every rule holds.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const rootArg = process.argv.indexOf('--root')
const root = resolve(rootArg > -1 ? process.argv[rootArg + 1] : process.cwd())
const LINE_CAP = Number(process.env.CVG_LEDGER_LINE_CAP ?? 300)
const ledgers = [
  'docs/99_runtime_state.md',
  'docs/20_master_execution_log.md',
  'docs/30_backlog_master.md',
  'docs/08_runtime/agent_coordination.md'
]
const errors = []
const notes = []
let archivesVerified = 0
const read = (rel) => readFileSync(join(root, rel), 'utf8')

for (const rel of ledgers) {
  if (!existsSync(join(root, rel))) {
    errors.push(`${rel}: missing`)
    continue
  }
  const text = read(rel)
  const lines = text.split('\n').length
  if (lines > LINE_CAP) {
    errors.push(
      `${rel}: ${lines} lines exceeds the cap of ${LINE_CAP}; move closed history to docs/08_runtime/archive/ (byte-identical, SHA-256 in the pointer)`
    )
  }
  // Archive pointers: [`name`](path) (SHA-256 `hex`
  for (const match of text.matchAll(
    /\[`([^`]+\.md\.txt)`\]\(([^)]+)\)\s*\(SHA-256 `([0-9a-f]{64})`/g
  )) {
    const target = join(root, 'docs', match[2].replace(/^\.\.\//, ''))
    const direct = join(root, rel, '..', match[2])
    const file = existsSync(direct) ? direct : target
    if (!existsSync(file)) {
      errors.push(`${rel}: archive ${match[2]} is missing`)
      continue
    }
    const actual = createHash('sha256').update(readFileSync(file)).digest('hex')
    archivesVerified += 1
    if (actual !== match[3]) {
      errors.push(
        `${rel}: archive ${match[1]} SHA-256 ${actual} differs from the recorded ${match[3]}`
      )
    }
  }
}

const dateOf = (text, pattern) => pattern.exec(text)?.[1]
if (existsSync(join(root, 'README.md')) && existsSync(join(root, ledgers[0]))) {
  const readmeDate = dateOf(
    read('README.md'),
    /^## Estado atual — (\d{2}\/\d{2}\/\d{4})/m
  )
  const stateDate = dateOf(read(ledgers[0]), /^# [^\n]*?(\d{2}\/\d{2}\/\d{4})/m)
  if (!readmeDate)
    errors.push('README.md: no "## Estado atual — DD/MM/YYYY" heading')
  if (!stateDate) {
    errors.push(`${ledgers[0]}: first heading carries no DD/MM/YYYY date`)
  }
  if (readmeDate && stateDate && readmeDate !== stateDate) {
    errors.push(
      `README.md state date ${readmeDate} differs from ${ledgers[0]} (${stateDate}); update both together`
    )
  }
  const sha = dateOf(read(ledgers[0]), /`main` em `([0-9a-f]{7,40})`/)
  if (sha) {
    try {
      const shallow = execFileSync(
        'git',
        ['rev-parse', '--is-shallow-repository'],
        { cwd: root, encoding: 'utf8' }
      ).trim()
      if (shallow === 'true')
        notes.push(`main SHA ${sha}: not checked (shallow clone)`)
      else
        execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
          cwd: root,
          stdio: 'ignore'
        })
    } catch {
      errors.push(
        `${ledgers[0]}: main SHA ${sha} is not a commit of this repository`
      )
    }
  }
}

console.log(
  JSON.stringify(
    { lineCap: LINE_CAP, archivesVerified, errors, notes },
    null,
    2
  )
)
if (errors.length > 0) {
  console.error(`LEDGER_GATE_FAILED=${errors.length}`)
  process.exit(1)
}
console.error('LEDGER_GATE_OK')
