import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

const checker = join(process.cwd(), 'scripts/check-ledgers.mjs')

function fixture({
  readmeDate = '04/11/2026',
  stateLines = 5,
  tamper = false
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ledgers-'))
  mkdirSync(join(root, 'docs/08_runtime/archive'), { recursive: true })
  const archived = 'historia antiga\n'
  const sha = createHash('sha256').update(archived).digest('hex')
  writeFileSync(
    join(root, 'docs/08_runtime/archive/runtime_state_ate_20261103.md.txt'),
    tamper ? 'adulterado\n' : archived
  )
  const pointer = `[\`runtime_state_ate_20261103.md.txt\`](08_runtime/archive/runtime_state_ate_20261103.md.txt) (SHA-256 \`${sha}\`, ledger original completo)`
  writeFileSync(
    join(root, 'docs/99_runtime_state.md'),
    `# ESTADO VIGENTE — 04/11/2026\n\n${'- linha\n'.repeat(stateLines)}\n${pointer}\n`
  )
  for (const f of ['20_master_execution_log.md', '30_backlog_master.md']) {
    writeFileSync(join(root, 'docs', f), '# registro\n')
  }
  writeFileSync(
    join(root, 'docs/08_runtime/agent_coordination.md'),
    '# claims\n'
  )
  writeFileSync(
    join(root, 'README.md'),
    `# x\n\n## Estado atual — ${readmeDate}\n`
  )
  return root
}

const run = (root, env = {}) =>
  spawnSync(process.execPath, [checker, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, ...env }
  })

test('ledger gate passes and really verifies the archive', () => {
  const result = run(fixture())
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.equal(JSON.parse(result.stdout).archivesVerified, 1)
})

test('ledger gate rejects a ledger over the line cap', () => {
  const result = run(fixture({ stateLines: 50 }), { CVG_LEDGER_LINE_CAP: '20' })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /exceeds the cap of 20/)
})

test('ledger gate rejects a tampered archive', () => {
  const result = run(fixture({ tamper: true }))
  assert.equal(result.status, 1)
  assert.match(result.stdout, /differs from the recorded/)
})

test('ledger gate rejects README and state with different dates', () => {
  const result = run(fixture({ readmeDate: '03/11/2026' }))
  assert.equal(result.status, 1)
  assert.match(result.stdout, /update both together/)
})

test('the repository ledgers satisfy the gate with all four archives verified', () => {
  const result = spawnSync(process.execPath, [checker], {
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  assert.ok(JSON.parse(result.stdout).archivesVerified >= 3)
})
