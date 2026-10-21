#!/usr/bin/env node
// Assistente de Plantão — restore proof (SPEC 0179 section 10, PISO-008).
// From the repository root:
//   node --import tsx products/shift-assistant/scripts/restore-proof.mjs restore \
//     --backup <out>/<backupId> --target <new volume> --sandbox <new dir> \
//     --members '<synthetic SHIFT_MEMBERS>' [--at <ISO time>]
//   node --import tsx products/shift-assistant/scripts/restore-proof.mjs make-fixture --out <new dir>
// `restore` checks the receipt, inventory, paths (no absolute, `..` or
// symlink), the exact file set and every SHA-256 before writing; restores
// into a new, empty volume; reopens it read-only (hold) and compares the
// projection with the backed-up one; then a copy runs the real assistant in a
// transport sandbox (in-process stubs, no channel, Whisper or model) to prove
// a command, a confirmation and the next eligible reminders without resending
// accepted or uncertain ones. `make-fixture` writes the synthetic volume of
// the tests (draft, confirmed, corrected, done, snoozed, retry, pause,
// interrupted dispatch, isolated tail, orphan media). Prints a JSON report.
// Exit 0 PASS, 1 FAIL, 2 usage or tool unavailable.

function arg(name) {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}

const command = process.argv[2]
const usage = () => {
  process.stderr.write(
    'usage: restore-proof.mjs restore --backup <dir> --target <dir> --sandbox <dir> --members <spec> [--at <iso>]\n' +
      '       restore-proof.mjs make-fixture --out <dir>\n'
  )
  process.exit(2)
}

async function load(path) {
  try {
    return await import(path)
  } catch {
    process.stderr.write(
      'cannot load the product code: run from the repository root with node --import tsx\n'
    )
    process.exit(2)
  }
}

if (command === 'make-fixture') {
  const out = arg('--out')
  if (!out) usage()
  const { existsSync, readdirSync } = await import('node:fs')
  if (existsSync(out) && readdirSync(out).length > 0) {
    process.stderr.write('--out must be new or empty\n')
    process.exit(2)
  }
  const { buildRestoreFixture } = await load(
    '../src/__tests__/support/restore-fixture.ts'
  )
  const fixture = await buildRestoreFixture(out)
  process.stdout.write(
    `${JSON.stringify(
      {
        kind: 'shift-assistant-restore-fixture',
        dataDir: fixture.dataDir,
        tasks: fixture.tasks,
        orphan: fixture.orphan,
        members: fixture.members
      },
      null,
      2
    )}\n`
  )
  process.exit(0)
}

if (command !== 'restore') usage()
const backupDir = arg('--backup')
const targetDir = arg('--target')
const sandboxDir = arg('--sandbox')
const membersSpec = arg('--members')
if (!backupDir || !targetDir || !sandboxDir || !membersSpec) usage()
const at = arg('--at')
if (at !== undefined && Number.isNaN(Date.parse(at))) usage()

const { restoreBackup } = await load('../src/backup.ts')
const { sandboxCheck } = await load('../src/restore-sandbox.ts')
const { parseMembers } = await load('../src/domain.ts')

const restore = await restoreBackup({ backupDir, targetDir })
const sandbox =
  restore.verdict === 'PASS'
    ? await sandboxCheck({
        restoredDir: targetDir,
        sandboxDir,
        members: parseMembers(membersSpec),
        ...(at ? { at: new Date(at) } : {})
      })
    : undefined
const verdict =
  restore.verdict === 'PASS' && sandbox?.verdict === 'PASS' ? 'PASS' : 'FAIL'
process.stdout.write(
  `${JSON.stringify(
    {
      schemaVersion: 1,
      kind: 'shift-assistant-restore-and-sandbox',
      verdict,
      restore,
      sandbox: sandbox ?? { verdict: 'NOT_RUN', reason: 'restore failed' }
    },
    null,
    2
  )}\n`
)
process.exit(verdict === 'PASS' ? 0 : 1)
